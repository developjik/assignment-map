// watchdog.test.mjs — 수집 지연 자동 진단 판정 회귀 (DEV-115):
//   검증 잠금 > push 이탈 > 소스 차단 > 루틴 미도착 순으로 원인을 고른다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnose, renderMarkdown, isBot } from '../watchdog.mjs';

const base = {
  lastRun: '2026-11-21',
  lastRoutineCommit: { sha: '47343e3aaaa', date: '2026-11-21T03:28:54+09:00', name: '정인권' },
  commitsSince: [
    { sha: '0d9ec16aaaa', name: 'github-actions[bot]', email: '41898282+github-actions[bot]@users.noreply.github.com' },
    { sha: 'e86fec7aaaa', name: 'developjik', email: 'developjik@gmail.com' },
  ],
  strayBranches: [],
  validate: { ok: true },
  queue: [
    { date: '2026-11-21', statuses: { wevity: 'ok 1350 ix / 90p' } },
    { date: '2026-11-22', statuses: { wevity: 'ok 1350 ix / 90p', devpost: 'ok 68 / 8p' } },
    { date: '2026-11-23', statuses: { wevity: 'ok 1350 ix / 90p', devpost: 'fail: HTTP 403' } },
  ],
  coldscanRuns: [{ status: 'completed', conclusion: 'success', createdAt: '2026-11-22T23:47:52Z' }],
};

test('isBot: actions·dependabot 봇만 봇으로 친다', () => {
  assert.ok(isBot('github-actions[bot]', '41898282+github-actions[bot]@users.noreply.github.com'));
  assert.ok(isBot('dependabot[bot]', '49699333+dependabot[bot]@users.noreply.github.com'));
  assert.ok(!isBot('정인권', 'developjik@gmail.com'));
});

test('클라우드 쪽이 정상이면 루틴 미도착 — last_run 이후 큐만 센다', () => {
  const d = diagnose(base);
  assert.equal(d.cause, 'routine-not-run');
  assert.equal(d.queueDays, 2);
  assert.match(d.findings.join('\n'), /2026-11-23 소스별 실패: devpost/);
  const md = renderMarkdown(base.lastRun, d);
  assert.match(md, /로컬 확인/);
  assert.match(md, /사람 1건/);
});

test('validate 실패가 가장 먼저 — 루틴이 push 를 잠근다', () => {
  const d = diagnose({ ...base, validate: { ok: false, tail: 'evidence 문자열' }, strayBranches: [{ name: 'x', date: 'd' }] });
  assert.equal(d.cause, 'validate-lock');
  assert.doesNotMatch(renderMarkdown(base.lastRun, d), /로컬 확인/);
});

test('main 밖 브랜치에 runs/ 산출물이 있으면 push 이탈', () => {
  assert.equal(diagnose({ ...base, strayBranches: [{ name: 'routine-2026-11-22', date: '2026-11-22' }] }).cause, 'stray-push');
});

test('콜드스탠바이 최근 완료 실행이 실패면 소스 차단 — 진행 중 실행은 건너뛴다', () => {
  const coldscanRuns = [
    { status: 'in_progress', conclusion: '', createdAt: '2026-11-23T23:47:00Z' },
    { status: 'completed', conclusion: 'failure', createdAt: '2026-11-22T23:47:52Z' },
  ];
  assert.equal(diagnose({ ...base, coldscanRuns }).cause, 'sources-blocked');
});
