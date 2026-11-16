// merge.mjs · validate.mjs 회귀 테스트 — evidence 가 문자열로 들어와도 data 는 배열로 저장되고,
// 문자열 evidence 는 validate 가 즉시 실패시키는지 임시 리포를 만들어 확인한다.
// 실행: node --test collector/tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const REPO = path.resolve(import.meta.dirname, '..', '..');

const FIXTURE = {
  'data/postings.json': [{
    id: 'legacy:p1', company: '레거시기업', positions: ['frontend'], positions_raw: 'FE',
    ai_policy: 'required', evidence: '레거시 문자열 근거', url: 'https://example.com/legacy',
    deadline: '2026-11-30', status: 'open', first_seen: '2026-11-01', last_checked: '2026-11-01',
    check_cadence: 'weekly', review: 'confirmed', history: [],
  }],
  'data/events.json': [{
    id: 'ev:legacy', type: 'contest', title: '레거시 공모전', host: '호스트',
    ai_usage: 'required', status: 'open', apply_deadline: '2026-12-02', submit_deadline: null,
    evidence: '레거시 이벤트 근거', url: 'https://example.com/ev', first_seen: '2026-11-01',
    last_checked: '2026-11-01', check_cadence: 'weekly', review: 'confirmed', history: [],
  }],
  'data/changelog.json': { events: [] },
  'data/meta.json': { last_run: '2026-11-15', counts: { platforms: 1, postings: 1, news: 3, events: 1 } },
  'collector/golden_cases.json': { postings: [], events: [] },
  'runs/2026-11-16.json': {
    date: '2026-11-16',
    postings: [
      {
        id: 'jobkorea:50283588', company: 'SOOP', positions: 'frontend', ai_policy: 'required',
        evidence: '잡코리아 실측(2026-11-16): 마감되었습니다 표시 — 마감일 11-15 경과',
        status: 'closed', deadline: '2026-11-15', url: 'https://example.com/1',
      },
      {
        id: 'legacy:p1', company: '레거시기업', ai_policy: 'allowed', status: 'open',
        deadline: '2026-12-05', evidence: ['  정책 변경 근거  ', '   '],
      },
    ],
    events: [
      {
        id: 'ev:1', type: 'hackathon', title: '테스트 해커톤', host: '호스트', ai_usage: 'allowed',
        status: 'open', apply_deadline: '2026-12-01', evidence: '접수 ~12-01 까지',
      },
      {
        id: 'ev:legacy', type: 'contest', title: '레거시 공모전', host: '호스트', ai_usage: 'required',
        status: 'open', apply_deadline: '2026-12-02', evidence: '레거시 이벤트 근거 갱신',
      },
    ],
  },
};

function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'am-collector-'));
  for (const sub of ['collector', 'data', 'runs']) fs.mkdirSync(path.join(dir, sub), { recursive: true });
  for (const f of ['merge.mjs', 'validate.mjs', 'normalize.mjs', 'evidence.mjs']) {
    fs.copyFileSync(path.join(REPO, 'collector', f), path.join(dir, 'collector', f));
  }
  for (const [rel, body] of Object.entries(FIXTURE)) {
    fs.writeFileSync(path.join(dir, rel), JSON.stringify(body, null, 2) + '\n');
  }
  return dir;
}

const readJSON = (dir, rel) => JSON.parse(fs.readFileSync(path.join(dir, rel), 'utf8'));
const node = (dir, script, ...args) => execFileSync(process.execPath, [path.join(dir, 'collector', script), ...args], {
  cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
});

test('merge: 문자열 evidence → postings 는 quote 객체 배열, events 는 문자열 배열', () => {
  const dir = sandbox();
  node(dir, 'merge.mjs', 'runs/2026-11-16.json');

  const postings = readJSON(dir, 'data/postings.json');
  const created = postings.find((p) => p.id === 'jobkorea:50283588');
  assert.deepEqual(created.evidence, [{ quote: '잡코리아 실측(2026-11-16): 마감되었습니다 표시 — 마감일 11-15 경과' }]);
  assert.deepEqual(created.positions, ['frontend'], '문자열 positions 는 배열로 저장');
  assert.equal(created.first_seen, '2026-11-16');

  const updated = postings.find((p) => p.id === 'legacy:p1');
  assert.deepEqual(updated.evidence, [{ quote: '정책 변경 근거' }], '배열 입력도 trim·빈 항목 제거');
  assert.deepEqual(updated.positions, ['frontend'], '건드리지 않은 레거시 배열도 정규화 유지');
  assert.equal(updated.ai_policy, 'allowed');
  const policyChange = updated.history.find((h) => h.event === 'policy_changed');
  assert.equal(policyChange.evidence, '정책 변경 근거', 'history 인용은 문자열 하나');

  const events = readJSON(dir, 'data/events.json');
  assert.deepEqual(events.find((e) => e.id === 'ev:1').evidence, ['접수 ~12-01 까지']);
  assert.deepEqual(events.find((e) => e.id === 'ev:legacy').evidence, ['레거시 이벤트 근거 갱신']);
  for (const p of postings) assert.ok(Array.isArray(p.evidence), `${p.id} evidence 배열`);
  for (const e of events) assert.ok(Array.isArray(e.evidence), `${e.id} evidence 배열`);
  for (const e of events) assert.ok(e.evidence.every((x) => typeof x === 'string'), `${e.id} evidence 문자열 원소`);

  assert.equal(readJSON(dir, 'data/meta.json').counts.events, events.length);
  const log = readJSON(dir, 'data/changelog.json').events;
  assert.equal(log.length, 1, '같은 날짜 병합은 changelog 한 줄');
  assert.deepEqual(log[0].new_postings, ['jobkorea:50283588']);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('validate: merge 결과는 통과하고, 문자열 evidence 는 events·postings 모두 잡아낸다', () => {
  const dir = sandbox();
  node(dir, 'merge.mjs', 'runs/2026-11-16.json');
  assert.match(node(dir, 'validate.mjs'), /VALIDATE OK/);

  const events = readJSON(dir, 'data/events.json');
  events[0].evidence = '문자열로 되돌린 근거';
  fs.writeFileSync(path.join(dir, 'data/events.json'), JSON.stringify(events, null, 2) + '\n');
  let message = '';
  try {
    node(dir, 'validate.mjs');
  } catch (err) {
    message = String(err.stderr || err.message);
  }
  assert.match(message, /VALIDATE FAIL/, 'events 문자열 evidence 는 커밋 잠금');
  assert.match(message, /evidence 가 배열이 아니다 \(string\)/);

  const postings = readJSON(dir, 'data/postings.json');
  postings[0].evidence = '문자열로 되돌린 근거';
  fs.writeFileSync(path.join(dir, 'data/postings.json'), JSON.stringify(postings, null, 2) + '\n');
  assert.match(node(dir, 'normalize.mjs'), /NORMALIZE OK/, 'normalize 로 다시 배열로 되돌린다');
  assert.match(node(dir, 'validate.mjs'), /VALIDATE OK/);
  fs.rmSync(dir, { recursive: true, force: true });
});
