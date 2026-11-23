#!/usr/bin/env node
// watchdog.mjs — 수집 지연 자동 진단 (DEV-115, 2026-11-23).
// watchdog.yml 이 last_run 지연을 잡으면 이 스크립트가 클라우드에서 확인 가능한 원인을 먼저 가린다:
//   1) 검증 잠금  — main 에서 validate.mjs 가 실패하면 루틴은 push 하지 않는다(ROUTINE_PROMPT §8)
//   2) push 이탈  — 루틴 산출물(runs/·data/)이 main 이 아닌 원격 브랜치에 올라가 있음
//   3) 소스 차단  — 콜드스탠바이(fetch-candidates) 실패 또는 소스별 fail
//   4) 루틴 미도착 — 위가 전부 정상인데 원격에 흔적이 없음 → 맥북 꺼짐·Aside 세션 실패·로컬 push 실패
// 4)는 클라우드에서 더 가를 수 없다 — 로컬 확인 절차를 같이 출력한다.
//
// 사용:
//   node collector/watchdog.mjs                       # 마크다운 진단 (기준 = data/meta.json last_run)
//   node collector/watchdog.mjs --runs runs.json      # gh run list --json conclusion,createdAt,status 결과 포함
//   node collector/watchdog.mjs --json                # 진단 JSON
// exit 0 고정(정보성).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const repo = path.resolve(import.meta.dirname, '..');

export const isBot = (name = '', email = '') =>
  /\[bot\]$/.test(name) || /\[bot\]@|github-actions|dependabot/.test(email);

/** 클라우드에서 모은 사실 → 원인 판정. 순수 함수 — 테스트 대상. */
export function diagnose(f) {
  const findings = [];
  const queueAfter = (f.queue || []).filter((q) => q.date > f.lastRun).sort((a, b) => a.date.localeCompare(b.date));
  const latestQueue = queueAfter.at(-1);
  const failedSources = latestQueue
    ? Object.entries(latestQueue.statuses || {}).filter(([, v]) => String(v).startsWith('fail')).map(([k]) => k)
    : [];
  const coldRuns = (f.coldscanRuns || []).filter((r) => r.status === 'completed');
  const coldFailed = coldRuns.length > 0 && coldRuns[0].conclusion === 'failure';
  const humanCommits = (f.commitsSince || []).filter((c) => !isBot(c.name, c.email));

  if (f.validate && !f.validate.ok) {
    findings.push(`main 에서 validate.mjs 실패 — 루틴은 검증 통과 시에만 push 한다(§8): ${f.validate.tail || ''}`.trim());
  }
  if ((f.strayBranches || []).length) {
    findings.push(`루틴 산출물이 main 밖 브랜치에 있음: ${f.strayBranches.map((b) => `${b.name}(${b.date})`).join(', ')}`);
  }
  if (coldFailed) findings.push(`콜드스탠바이 최근 실행 실패(${coldRuns[0].createdAt}) — 전 소스 fail 시에만 실패한다(전멸 가드)`);
  if (failedSources.length) findings.push(`콜드스탠바이 ${latestQueue.date} 소스별 실패: ${failedSources.join(', ')}`);

  let cause;
  if (f.validate && !f.validate.ok) cause = 'validate-lock';
  else if ((f.strayBranches || []).length) cause = 'stray-push';
  else if (coldFailed) cause = 'sources-blocked';
  else cause = 'routine-not-run';

  const facts = [
    `마지막 루틴 커밋: ${f.lastRoutineCommit ? `${f.lastRoutineCommit.date} ${f.lastRoutineCommit.sha.slice(0, 7)} (${f.lastRoutineCommit.name})` : '없음'}`,
    `그 뒤 main 커밋: 봇 ${(f.commitsSince || []).length - humanCommits.length}건 · 사람 ${humanCommits.length}건${humanCommits.length ? ` (${humanCommits.map((c) => c.sha.slice(0, 7)).join(', ')} — 수집 커밋 아님)` : ''}`,
    `main validate.mjs: ${f.validate ? (f.validate.ok ? '통과' : '실패') : '미실행'}`,
    `미소비 콜드스탠바이 큐: ${queueAfter.length ? queueAfter.map((q) => q.date).join(', ') : '없음'}` +
      (latestQueue ? ` · 최근 상태 ${Object.entries(latestQueue.statuses || {}).map(([k, v]) => `${k}=${String(v).split(' ')[0]}`).join(' ')}` : ''),
    `콜드스탠바이 워크플로: ${coldRuns.length ? coldRuns.map((r) => `${r.createdAt.slice(0, 10)} ${r.conclusion}`).join(' · ') : '기록 없음'}`,
  ];
  return { cause, findings, facts, queueDays: queueAfter.length };
}

export const CAUSE_TEXT = {
  'validate-lock': '검증 잠금 — main 데이터가 validate.mjs 를 통과하지 못해 루틴이 push 를 멈췄을 가능성이 높다. main 을 고치면 다음 런에서 풀린다.',
  'stray-push': 'push 경로 이탈 — 루틴 산출물이 main 이 아닌 브랜치에 올라갔다. 해당 브랜치를 main 에 병합하고 로컬 클론의 upstream 을 확인한다.',
  'sources-blocked': '소스 차단 의심 — 클라우드 콜드스탠바이도 전 소스 실패했다. 네트워크·IP 차단·마크업 동시 변경을 확인한다.',
  'routine-not-run': '루틴 미도착 — 클라우드 쪽(검증·브랜치·소스)은 정상인데 원격에 수집 흔적이 없다. 맥북 꺼짐/잠자기, Aside 예약 세션 미실행·실패, 또는 로컬 커밋 push 실패 중 하나다(로컬에서만 구분 가능).',
};

export const LOCAL_CHECKS = [
  '맥북이 03:00 KST 에 깨어 있었는지 (`pmset -g log | grep -i wake`)',
  'Aside 예약 루틴 세션 기록 — 실행 여부·중단 지점·오류',
  '로컬 클론: `git status` · `git log --oneline origin/main..HEAD` (push 안 된 run 커밋) · `ls runs/` (오늘 파일 생성 여부)',
  '로컬 push 자격 증명: `git push --dry-run origin HEAD:main`',
];

export function renderMarkdown(lastRun, d) {
  return [
    `### 자동 진단 (last_run=${lastRun})`,
    '',
    `**판정**: ${CAUSE_TEXT[d.cause]}`,
    '',
    ...d.facts.map((x) => `- ${x}`),
    ...(d.findings.length ? ['', '**이상 신호**', ...d.findings.map((x) => `- ${x}`)] : []),
    ...(d.cause === 'routine-not-run'
      ? ['', '**로컬 확인 (클라우드에서 볼 수 없음)**', ...LOCAL_CHECKS.map((x) => `- ${x}`),
         '', `- 복구 런: 다음 Aside 루틴이 queue/ 미소비 ${d.queueDays}일치를 먼저 소비하고 lookback 을 넓힌다(ROUTINE_PROMPT §1).`]
      : []),
  ].join('\n');
}

const git = (...a) => execFileSync('git', a, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const parseLog = (out) => out ? out.split('\n').map((l) => { const [sha, date, name, email, subject] = l.split('\x1f'); return { sha, date, name, email, subject }; }) : [];
const FMT = '--format=%H%x1f%aI%x1f%an%x1f%ae%x1f%s';

/** 로컬 체크아웃(fetch-depth 0)에서 사실 수집. */
export function collect({ runsFile } = {}) {
  const lastRun = JSON.parse(fs.readFileSync(path.join(repo, 'data', 'meta.json'), 'utf8')).last_run;
  const base = (() => { try { git('rev-parse', '--verify', 'origin/main'); return 'origin/main'; } catch { return 'HEAD'; } })();
  const lastRoutineCommit = parseLog(git('log', '-1', FMT, base, '--', 'runs/'))[0] || null;
  const commitsSince = lastRoutineCommit ? parseLog(git('log', FMT, `${lastRoutineCommit.sha}..${base}`)) : [];

  const strayBranches = [];
  const refs = git('for-each-ref', 'refs/remotes/origin', '--format=%(refname:short)%1f%(committerdate:iso-strict)');
  for (const line of refs ? refs.split('\n') : []) {
    const [name, date] = line.split('\x1f');
    if (name === 'origin/main' || name === 'origin/HEAD' || name === 'origin') continue;
    let touched = '';
    try { touched = git('diff', '--name-only', `${base}...${name}`, '--', 'runs/', 'data/meta.json'); } catch { continue; }
    if (touched) strayBranches.push({ name: name.replace(/^origin\//, ''), date });
  }

  let validate;
  try {
    execFileSync('node', ['collector/validate.mjs'], { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    validate = { ok: true };
  } catch (e) {
    validate = { ok: false, tail: String(e.stdout || e.stderr || e.message).trim().split('\n').slice(-3).join(' / ') };
  }

  const qdir = path.join(repo, 'queue');
  const queue = fs.existsSync(qdir)
    ? fs.readdirSync(qdir).filter((n) => /^\d{4}-\d{2}-\d{2}\.json$/.test(n)).map((n) => {
        try { const q = JSON.parse(fs.readFileSync(path.join(qdir, n), 'utf8')); return { date: n.slice(0, 10), statuses: q.statuses || {} }; }
        catch { return { date: n.slice(0, 10), statuses: {} }; }
      })
    : [];

  let coldscanRuns = [];
  if (runsFile) { try { coldscanRuns = JSON.parse(fs.readFileSync(runsFile, 'utf8')); } catch { /* 선택 입력 */ } }

  return { lastRun, lastRoutineCommit, commitsSince, strayBranches, validate, queue, coldscanRuns };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const ri = args.indexOf('--runs');
  const facts = collect({ runsFile: ri !== -1 ? args[ri + 1] : undefined });
  const d = diagnose(facts);
  console.log(args.includes('--json') ? JSON.stringify({ ...d, lastRun: facts.lastRun }, null, 2) : renderMarkdown(facts.lastRun, d));
}
