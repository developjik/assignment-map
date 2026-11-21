// revisit.test.mjs — 재방문 관측성 회귀 테스트 (스펙 2026-11-21):
//   1) run.checked 로 리스트 기반 확인이 last_checked 에 기록된다
//   2) overdue.mjs 가 케이던스 초과를 리스트커버/상세필요로 갈라 뽑는다
//   3) 동일 URL 이벤트(조달청 사례)는 제목·host 가 달라도 병합된다
//   4) dedupe_overrides.json 강제 병합은 매일의 재계산에서도 살아남는다(멱등)
//   5) normalize 가 source 를 정규 패밀리로 모은다
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const REPO = path.resolve(import.meta.dirname, '..', '..');

const FIXTURE = {
  'data/postings.json': [
    { id: 'wd:1', company: '원티드기업', positions: ['frontend'], ai_policy: 'unspecified', evidence: [{ quote: '원티드 근거' }], url: 'https://wanted.co.kr/1', deadline: null, status: 'open', source: 'wanted', first_seen: '2026-10-24', last_seen: '2026-11-01', last_checked: '2026-11-01', check_cadence: 'weekly', review: 'auto', history: [] },
    { id: 'jk:1', company: '잡코리아기업', title: 'FE 채용', positions: ['frontend'], ai_policy: 'unspecified', evidence: [{ quote: '잡코리아 근거' }], url: 'https://jobkorea.co.kr/1', deadline: '2026-11-25', status: 'open', source: 'jobkorea', first_seen: '2026-11-05', last_seen: '2026-11-16', last_checked: '2026-11-16', check_cadence: 'daily', review: 'auto', history: [] },
    { id: 'fresh:1', company: '최근확인기업', positions: ['backend'], ai_policy: 'allowed', evidence: [{ quote: '최근 근거' }], url: 'https://example.com/fresh', deadline: '2026-12-20', status: 'open', source: 'greeting-ats', first_seen: '2026-11-15', last_checked: '2026-11-20', check_cadence: 'weekly', review: 'auto', history: [] },
    { id: 'closed:1', company: '닫힌기업', positions: ['frontend'], ai_policy: 'required', evidence: [{ quote: '닫힘 근거' }], url: 'https://example.com/closed', deadline: '2026-11-01', status: 'closed', source: 'jobkorea', first_seen: '2026-10-24', last_checked: '2026-11-01', check_cadence: 'none', review: 'auto', history: [] },
    { id: 'ov:a', company: 'A사', title: 'A 직무', positions: ['frontend'], ai_policy: 'unspecified', evidence: [{ quote: 'A 근거' }], url: 'https://a.example/1', deadline: '2026-12-01', status: 'open', source: 'wanted', first_seen: '2026-11-01', last_checked: '2026-11-01', check_cadence: 'weekly', review: 'auto', history: [] },
    { id: 'ov:b', company: 'B사', title: 'B 직무', positions: ['frontend'], ai_policy: 'required', evidence: [{ quote: 'B 결정적 근거' }], url: 'https://b.example/1', deadline: '2026-12-01', status: 'open', source: 'jumpit', first_seen: '2026-11-02', last_checked: '2026-11-02', check_cadence: 'weekly', review: 'auto', history: [] },
  ],
  'data/events.json': [
    { id: 'wevity:list1', type: 'hackathon', title: '위비티 리스트 해커톤', host: '주최1', ai_usage: 'allowed', status: 'open', apply_deadline: '2026-12-05', submit_deadline: null, evidence: ['근거'], source: 'wevity', url: 'https://wevity.com/1', first_seen: '2026-11-01', last_checked: '2026-11-11', check_cadence: 'weekly', review: 'auto', history: [] },
    { id: 'meetup:detail1', type: 'meetup', title: '밋업 디테일', host: '주최2', ai_usage: 'allowed', status: 'open', apply_deadline: '2026-12-10', submit_deadline: null, evidence: ['근거'], source: 'meetup-com', url: 'https://meetup.com/1', first_seen: '2026-11-01', last_checked: '2026-11-11', check_cadence: 'weekly', review: 'auto', history: [] },
    { id: 'ko:5000', type: 'contest', title: '제1회 조달 데이터 활용 공모전', host: '조달청', ai_usage: 'allowed', status: 'judging', apply_deadline: '2026-11-20', submit_deadline: '2026-11-20', evidence: ['조달청 근거'], source: 'official', url: 'https://blog.naver.com/ppas/2235000', first_seen: '2026-10-24', last_checked: '2026-11-20', check_cadence: 'daily', review: 'auto', history: [] },
    { id: 'wevity:111628-dup', type: 'contest', title: '전혀 다른 제목의 같은 행사', host: '다른표기주최', ai_usage: 'allowed', status: 'open', apply_deadline: '2026-11-20', submit_deadline: '2026-11-20', evidence: ['위비티 근거'], source: 'wevity', url: 'https://blog.naver.com/ppas/2235000', first_seen: '2026-11-05', last_checked: '2026-11-05', check_cadence: 'weekly', review: 'auto', history: [] },
    { id: 'ev:api1', type: 'hackathon', title: 'API 소스 해커톤', host: '주최3', ai_usage: 'required', status: 'open', apply_deadline: '2026-12-15', submit_deadline: null, evidence: ['근거'], source: 'devpost-api', url: 'https://devpost.com/1', first_seen: '2026-11-10', last_checked: '2026-11-20', check_cadence: 'weekly', review: 'auto', history: [] },
    { id: 'ev:gnews1', type: 'conference', title: '뉴스 소스 컨퍼런스', host: '주최4', ai_usage: 'allowed', status: 'open', apply_deadline: '2026-12-18', submit_deadline: null, evidence: ['근거'], source: 'gnews-kr-5-meetup/devtimes', url: 'https://example.com/conf', first_seen: '2026-11-10', last_checked: '2026-11-20', check_cadence: 'weekly', review: 'auto', history: [] },
    // 랜딩/리스트 URL 공유 — 서로 다른 행사다 (aichallenge4all·위비티 cidx 사례, 2026-11-21 과병합 방지)
    { id: 'landing:a1', type: 'contest', title: '랜딩 공유 대회 A', host: '주최5', ai_usage: 'allowed', status: 'open', apply_deadline: '2026-12-20', submit_deadline: null, evidence: ['근거'], source: 'official', url: 'https://aichallenge4all.or.kr/competitions', first_seen: '2026-11-10', last_checked: '2026-11-20', check_cadence: 'weekly', review: 'auto', history: [] },
    { id: 'landing:a2', type: 'contest', title: '랜딩 공유 대회 B', host: '주최6', ai_usage: 'allowed', status: 'open', apply_deadline: '2026-12-22', submit_deadline: null, evidence: ['근거'], source: 'official', url: 'https://aichallenge4all.or.kr/competitions', first_seen: '2026-11-11', last_checked: '2026-11-20', check_cadence: 'weekly', review: 'auto', history: [] },
    { id: 'landing:w1', type: 'contest', title: 'cidx 리스트 공유 대회 C', host: '주최7', ai_usage: 'allowed', status: 'open', apply_deadline: '2026-12-23', submit_deadline: null, evidence: ['근거'], source: 'wevity', url: 'https://www.wevity.com/?c=find&s=1&gub=1&cidx=21', first_seen: '2026-11-12', last_checked: '2026-11-20', check_cadence: 'weekly', review: 'auto', history: [] },
    { id: 'landing:w2', type: 'contest', title: 'cidx 리스트 공유 대회 D', host: '주최8', ai_usage: 'allowed', status: 'open', apply_deadline: '2026-12-24', submit_deadline: null, evidence: ['근거'], source: 'wevity', url: 'https://www.wevity.com/?c=find&s=1&gub=1&cidx=21', first_seen: '2026-11-13', last_checked: '2026-11-20', check_cadence: 'weekly', review: 'auto', history: [] },
  ],
  'data/dedupe_overrides.json': { postings: [{ dup: 'ov:b', rep: 'ov:a' }], events: [] },
  'data/changelog.json': { events: [] },
  'data/meta.json': { last_run: '2026-11-20', counts: { platforms: 1, postings: 6, news: 3, events: 10 } },
  'collector/golden_cases.json': { postings: [], events: [] },
  'runs/run-checked.json': {
    date: '2026-11-21',
    postings: [], events: [],
    checked: [
      { id: 'jk:1', via: 'search-exposure', note: 'm검색 관련도순 1p 노출 — 마감 배지 없음' },
      { id: 'wd:1', via: 'api', note: 'wanted /api/v4 status=active' },
      { id: 'ghost:1', via: 'typo' },
    ],
  },
};

function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'am-revisit-'));
  for (const sub of ['collector', 'data', 'runs']) fs.mkdirSync(path.join(dir, sub), { recursive: true });
  for (const f of ['merge.mjs', 'validate.mjs', 'normalize.mjs', 'evidence.mjs', 'dedupe.mjs', 'overdue.mjs', 'sources_family.mjs'])
    fs.copyFileSync(path.join(REPO, 'collector', f), path.join(dir, 'collector', f));
  for (const [rel, body] of Object.entries(FIXTURE))
    fs.writeFileSync(path.join(dir, rel), JSON.stringify(body, null, 2) + '\n');
  return dir;
}
const readJSON = (dir, rel) => JSON.parse(fs.readFileSync(path.join(dir, rel), 'utf8'));
const node = (dir, script, ...args) => execFileSync(process.execPath, [path.join(dir, 'collector', script), ...args], {
  cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
});

test('overdue: 케이던스 초과를 상세필요/리스트커버로 갈라 뽑는다', () => {
  const dir = sandbox();
  node(dir, 'merge.mjs', 'runs/run-checked.json');   // checked 로 last_checked 갱신된 상태에서 감사
  const out = JSON.parse(node(dir, 'overdue.mjs', '--json'));

  // wd:1(wanted, weekly 20일) — checked 로 오늘 갱신됐으니 목록에서 빠진다
  const postingsIds = out.postings.items.map((p) => p.id);
  assert.ok(!postingsIds.includes('wd:1'), 'checked 는 overdue 해소');
  assert.ok(!postingsIds.includes('jk:1'), 'checked 는 overdue 해소');
  assert.ok(!postingsIds.includes('closed:1'), 'closed 제외');
  // 오버라이드 병합으로 ov:b 는 merged_into — rep(ov:a)만 남는다
  assert.ok(!postingsIds.includes('ov:b'), '병합된 dup 은 감사에서 제외');

  // 검증용 신규 데이터: 새로 overdue 상태를 만든다
  const postings = readJSON(dir, 'data/postings.json');
  postings.find((p) => p.id === 'fresh:1').last_checked = '2026-11-01';
  postings.find((p) => p.id === 'jk:1').last_checked = '2026-11-16';
  fs.writeFileSync(path.join(dir, 'data/postings.json'), JSON.stringify(postings, null, 2) + '\n');
  const out2 = JSON.parse(node(dir, 'overdue.mjs', '--json'));
  const jk = out2.postings.items.find((p) => p.id === 'jk:1');
  assert.equal(jk.detail_needed, false, 'jobkorea 는 리스트커버');
  const fresh = out2.postings.items.find((p) => p.id === 'fresh:1');
  assert.equal(fresh.detail_needed, true, 'greeting-ats 는 상세필요');
  assert.equal(fresh.days_unchecked, 20);
  const evDetail = out2.events.items.find((e) => e.id === 'meetup:detail1');
  assert.ok(evDetail && evDetail.detail_needed, 'meetup-com 상세필요');
  assert.ok(out2.events.items.some((e) => e.id === 'wevity:list1' && !e.detail_needed), 'wevity 리스트커버');
  assert.match(node(dir, 'overdue.mjs'), /OVERDUE 감사/, '사람용 요약 출력');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('merge: run.checked 가 last_checked 를 갱신하고 changelog 에 남는다', () => {
  const dir = sandbox();
  const stdout = node(dir, 'merge.mjs', 'runs/run-checked.json');
  const S = JSON.parse(stdout.slice(stdout.indexOf('{')));
  assert.deepEqual(S.checked.sort(), ['jk:1', 'wd:1']);

  const postings = readJSON(dir, 'data/postings.json');
  assert.equal(postings.find((p) => p.id === 'jk:1').last_checked, '2026-11-21');
  assert.equal(postings.find((p) => p.id === 'wd:1').last_checked, '2026-11-21');
  assert.equal(postings.find((p) => p.id === 'fresh:1').last_checked, '2026-11-20', 'checked 밖은 그대로');

  const log = readJSON(dir, 'data/changelog.json').events.find((c) => c.date === '2026-11-21');
  assert.deepEqual([...log.checked].sort(), ['jk:1', 'wd:1'], 'changelog 감사 기록');
  assert.match(node(dir, 'validate.mjs'), /VALIDATE OK/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('merge: checked 미확인 id 는 경고만 남긴다', () => {
  const dir = sandbox();
  let stderr = '';
  try { node(dir, 'merge.mjs', 'runs/run-checked.json'); } catch (err) { stderr = String(err.stderr || ''); }
  // execFileSync 는 exit 0 이면 stderr 를 err 로 안 던진다 — 미확인 id 경로가 exit 0 인지 확인
  const log = readJSON(dir, 'data/changelog.json').events.find((c) => c.date === '2026-11-21');
  assert.ok(!log.checked.includes('ghost:1'), '미확인 id 는 기록되지 않는다');
  assert.equal(readJSON(dir, 'data/meta.json').counts.postings, 6, '행 수 불변');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('dedupe: 동일 URL 이벤트는 제목·host 가 달라도 병합된다 (조달청 사례)', () => {
  const dir = sandbox();
  const stdout = node(dir, 'merge.mjs', 'runs/run-checked.json');
  const S = JSON.parse(stdout.slice(stdout.indexOf('{')));
  assert.ok(S.merged_events.includes('wevity:111628-dup->ko:5000'), `병합 기록: ${S.merged_events}`);

  const events = readJSON(dir, 'data/events.json');
  const rep = events.find((e) => e.id === 'ko:5000');
  const dup = events.find((e) => e.id === 'wevity:111628-dup');
  assert.equal(dup.merged_into, 'ko:5000');
  assert.deepEqual(rep.duplicates, ['wevity:111628-dup']);
  assert.equal(rep.last_checked, '2026-11-20', 'last_checked maxOr (11-20 vs 11-05)');
  assert.match(node(dir, 'validate.mjs'), /VALIDATE OK/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('dedupe: 랜딩/리스트 URL 공유는 병합하지 않는다 (과병합 방지)', () => {
  const dir = sandbox();
  const stdout = node(dir, 'merge.mjs', 'runs/run-checked.json');
  const S = JSON.parse(stdout.slice(stdout.indexOf('{')));
  for (const m of S.merged_events)
    assert.ok(!m.startsWith('landing:'), `랜딩 URL 공유가 병합됨: ${m}`);
  const events = readJSON(dir, 'data/events.json');
  for (const id of ['landing:a1', 'landing:a2', 'landing:w1', 'landing:w2']) {
    const row = events.find((e) => e.id === id);
    assert.equal(row.merged_into, undefined, `${id} 는 독립 행으로 남는다`);
    assert.equal(row.duplicates, undefined);
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

test('dedupe_overrides: 강제 병합은 재계산에서도 살아남는다 (멱등)', () => {
  const dir = sandbox();
  node(dir, 'merge.mjs', 'runs/run-checked.json');
  let postings = readJSON(dir, 'data/postings.json');
  assert.equal(postings.find((p) => p.id === 'ov:b').merged_into, 'ov:a');
  assert.ok(postings.find((p) => p.id === 'ov:a').duplicates.includes('ov:b'));
  // 매처가 절대 못 잡는 쌍(A사/B사) — normalize 재계산에도 표시가 유지된다
  node(dir, 'normalize.mjs');
  postings = readJSON(dir, 'data/postings.json');
  assert.equal(postings.find((p) => p.id === 'ov:b').merged_into, 'ov:a', 'normalize 재계산 후에도 강제 병합 유지');
  assert.equal(postings.find((p) => p.id === 'ov:a').ai_policy, 'required', 'F2 결정적 정책 승격');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('normalize: source 를 정규 패밀리로 모은다', () => {
  const dir = sandbox();
  node(dir, 'normalize.mjs');
  const events = readJSON(dir, 'data/events.json');
  assert.equal(events.find((e) => e.id === 'ev:api1').source, 'devpost', 'devpost-api → devpost');
  assert.equal(events.find((e) => e.id === 'ev:gnews1').source, 'gnews-kr-5', 'gnews-kr-5-meetup/devtimes → gnews-kr-5');
  assert.equal(events.find((e) => e.id === 'ko:5000').source, 'official', 'official 그대로');
  const out = node(dir, 'normalize.mjs');
  assert.match(out, /바꿀 필드 없음/, '멱등 — 두 번째 실행은 무변화');
  fs.rmSync(dir, { recursive: true, force: true });
});
