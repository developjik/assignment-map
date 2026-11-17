// merge.mjs · validate.mjs 회귀 테스트 — evidence 가 문자열로 들어와도 data 는 배열로 저장되고,
// 문자열 evidence 는 validate 가 즉시 실패시키는지 임시 리포를 만들어 확인한다.
// 실행: node --test collector/tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { dedupePostings } from '../dedupe.mjs';

const REPO = path.resolve(import.meta.dirname, '..', '..');

const FIXTURE = {
  'data/postings.json': [{
    id: 'legacy:p1', company: '레거시기업', positions: ['frontend'], positions_raw: 'FE',
    ai_policy: 'required', evidence: '레거시 문자열 근거', url: 'https://example.com/legacy',
    deadline: '2026-11-30', status: 'open', first_seen: '2026-11-01', last_checked: '2026-11-01',
    check_cadence: 'weekly', review: 'confirmed', history: [],
  }, {
    // 스펙 1-2 중복 제거 픽스처: 숲(SOOP) 원본(닫힘) — 재게시가 run 으로 들어온다
    id: 'soop:orig', company: '숲(SOOP)', title: '[SOOP] LIVE 방송 서버 개발',
    positions: ['backend'], ai_policy: 'allowed', evidence: [{ quote: 'SOOP 과제 전형 근거' }],
    url: 'https://example.com/soop', deadline: '2026-11-01', status: 'closed',
    first_seen: '2026-10-24', last_seen: '2026-11-02', last_checked: '2026-11-02',
    check_cadence: 'none', review: 'auto', history: [],
  }, {
    // 같은 회사의 다른 직무 — 절대 병합되면 안 된다(넷마블 보안직군 사례)
    id: 'netmarble:sec1', company: '넷마블', title: '보안정책 담당자', positions: ['security'],
    ai_policy: 'unspecified', evidence: [{ quote: '보안정책 공고 근거' }], url: 'https://example.com/nm1',
    deadline: '2026-12-01', status: 'open', first_seen: '2026-11-10', last_seen: '2026-11-10',
    last_checked: '2026-11-10', check_cadence: 'weekly', review: 'auto', history: [],
  }, {
    // 스펙 1-3: 원문 url 이 없는 시드 조사 기록 — normalize 가 'seed' 표기로 바꾼다
    id: 'seed-kr-99', company: '시드기업', positions: ['frontend'], ai_policy: 'allowed',
    evidence: [{ quote: '시드 조사 근거' }], url: null, deadline: null, status: 'open',
    first_seen: '2026-08', last_checked: '2026-10-11', check_cadence: 'weekly',
    review: 'confirmed', history: [],
  }],
  'data/events.json': [{
    id: 'ev:legacy', type: 'contest', title: '레거시 공모전', host: '호스트',
    ai_usage: 'required', status: 'open', apply_deadline: '2026-12-02', submit_deadline: null,
    evidence: '레거시 이벤트 근거', url: 'https://example.com/ev', first_seen: '2026-11-01',
    last_checked: '2026-11-01', check_cadence: 'weekly', review: 'confirmed', history: [],
  }, {
    // 매경 재게시 그룹의 먼저 들어온 쪽 (host 표기가 다른 동일 행사)
    id: 'wevity:m1', type: 'contest', title: '[제3회] 매경 AI 광고 공모전 대한민국 AI 광고대상',
    host: '매경미디어', ai_usage: 'allowed', status: 'open', apply_deadline: '2026-11-30',
    submit_deadline: '2026-11-30', evidence: ['매경 공모전 근거'], url: 'https://aimk.example',
    first_seen: '2026-11-01', last_checked: '2026-11-09', check_cadence: 'weekly', review: 'auto', history: [],
  }, {
    // 제목이 같아도 host 가 양립하지 않으면 다른 행사다 (연례 시리즈 오병합 방지)
    id: 'wevity:h1', type: 'contest', title: '동일 제목 공모전 2026', host: 'A재단',
    ai_usage: 'allowed', status: 'open', apply_deadline: '2026-12-01', submit_deadline: null,
    evidence: ['A재단 근거'], url: 'https://example.com/h1', first_seen: '2026-11-01',
    last_checked: '2026-11-01', check_cadence: 'weekly', review: 'auto', history: [],
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
      {
        // 매경 재게시: 제목 동일(년도·회차 보존), host 표기만 다르다
        id: 'wevity:m2', type: 'contest', title: '[제3회] 매경 AI 광고 공모전 대한민국 AI 광고대상',
        host: '매경미디어(매일경제)', ai_usage: 'allowed', status: 'open',
        apply_deadline: '2026-11-30', submit_deadline: '2026-11-30', evidence: '매경 재게시 근거',
      },
      {
        // 같은 제목, 다른 host — 병합되면 안 된다
        id: 'lablab:h2', type: 'contest', title: '동일 제목 공모전 2026', host: 'B아카데미',
        ai_usage: 'allowed', status: 'open', apply_deadline: '2026-12-01', evidence: 'B아카데미 근거',
      },
    ],
  },
  'runs/2026-11-18.json': {
    date: '2026-11-18',
    postings: [
      {
        // SOOP 재게시: 마감이 늘어난 열린 본문 — 대표행이 되어야 한다
        id: 'soop:repost', company: '숲(SOOP)', title: 'LIVE 방송 서버 개발 (재공고)',
        positions: 'backend', ai_policy: 'allowed', status: 'open', deadline: '2026-11-15',
        url: 'https://example.com/soop2', evidence: '재게시 본문 근거',
      },
      {
        // 같은 회사 다른 직무 — 병합 금지 그룹의 대조군
        id: 'netmarble:sec2', company: '넷마블', title: '기술 보안 담당자', ai_policy: 'unspecified',
        status: 'open', deadline: '2026-12-01', url: 'https://example.com/nm2', evidence: '기술보안 공고 근거',
      },
    ],
    events: [],
  },
  'runs/2026-11-19.json': {
    date: '2026-11-19',
    postings: [
      {
        // 병합 표시가 이미 붙은 원본 id 로 들어온 갱신은 대표행(soop:repost)으로 흘러야 한다
        id: 'soop:orig', company: '숲(SOOP)', title: '[SOOP] LIVE 방송 서버 개발',
        ai_policy: 'allowed', status: 'gone', evidence: '원본 공고 내려감',
      },
    ],
    events: [],
  },
};

function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'am-collector-'));
  for (const sub of ['collector', 'data', 'runs']) fs.mkdirSync(path.join(dir, sub), { recursive: true });
  for (const f of ['merge.mjs', 'validate.mjs', 'normalize.mjs', 'evidence.mjs', 'dedupe.mjs']) {
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

test('merge: 교차 소스·재게시 중복은 대표행 1개로 수렴한다 (스펙 1-2)', () => {
  const dir = sandbox();
  node(dir, 'merge.mjs', 'runs/2026-11-16.json');   // 사전 상태(병합 전) 만들기
  node(dir, 'merge.mjs', 'runs/2026-11-18.json');   // 재게시·대조군 투입

  const postings = readJSON(dir, 'data/postings.json');
  const byId = new Map(postings.map((p) => [p.id, p]));
  // 숲(SOOP): 열린 재게시가 대표, 닫힌 원본은 merged_into — 마감은 가장 늦은 값
  const repost = byId.get('soop:repost'), orig = byId.get('soop:orig');
  assert.equal(orig.merged_into, 'soop:repost', '닫힌 원본이 재게시 뒤로 병합된다');
  assert.ok(!repost.merged_into, '대표행에는 표시가 없다');
  assert.deepEqual(repost.duplicates, ['soop:orig'], '대표행에 중복 id 감사 목록');
  assert.equal(repost.deadline, '2026-11-15', '마감은 그룹에서 가장 늦은 값(재게시 연장)');
  assert.equal(repost.last_seen, '2026-11-18', 'last_seen 은 그룹 최댓값');
  // 같은 회사의 다른 직무는 절대 병합되지 않는다
  for (const id of ['netmarble:sec1', 'netmarble:sec2']) {
    assert.ok(!byId.get(id).merged_into, `${id} 는 다른 직무라 병합 금지`);
    assert.ok(!byId.get(id).duplicates, `${id} 는 그룹 대표가 아니다`);
  }

  const events = readJSON(dir, 'data/events.json');
  const evById = new Map(events.map((e) => [e.id, e]));
  // 매경: host 표기가 달라도(매경미디어 vs 매경미디어(매일경제)) 같은 행사로 병합
  const m1 = evById.get('wevity:m1'), m2 = evById.get('wevity:m2');
  assert.equal(m2.merged_into, 'wevity:m1', '먼저 들어온 쪽이 대표');
  assert.deepEqual(m1.duplicates, ['wevity:m2']);
  assert.equal(m1.last_checked, '2026-11-16', 'last_checked 는 그룹 최댓값');
  // 같은 제목, 다른 host → 서로 다른 행사로 남는다
  assert.ok(!evById.get('wevity:h1').merged_into && !evById.get('lablab:h2').merged_into,
    'host 가 양립하지 않으면 같은 제목도 병합하지 않는다');

  // 대표행 데이터로 validate 통과 — 병합 표시는 스키마 무결성을 깨지 않는다
  assert.match(node(dir, 'validate.mjs'), /VALIDATE OK/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('merge: 중복 병합은 멱등이다 — 같은 런을 두 번 돌려도 데이터가 같다', () => {
  const dir = sandbox();
  node(dir, 'merge.mjs', 'runs/2026-11-16.json');
  node(dir, 'merge.mjs', 'runs/2026-11-18.json');
  const snap = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
  const before = ['data/postings.json', 'data/events.json', 'data/changelog.json'].map(snap);
  node(dir, 'merge.mjs', 'runs/2026-11-18.json');   // 재실행 — 멱등 확인
  const after = ['data/postings.json', 'data/events.json', 'data/changelog.json'].map(snap);
  assert.deepEqual(after, before, '같은 날짜 재병합은 데이터를 바꾸지 않는다');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('validate: 공개 레코드의 빈 근거 경고가 동작한다 (스펙 1-3)', () => {
  const dir = sandbox();
  node(dir, 'merge.mjs', 'runs/2026-11-16.json');
  assert.doesNotMatch(node(dir, 'validate.mjs'), /빈 근거/, '정상 데이터에는 경고 없음');

  const postings = readJSON(dir, 'data/postings.json');
  const open = postings.find((p) => p.status === 'open');
  open.evidence = [];
  fs.writeFileSync(path.join(dir, 'data/postings.json'), JSON.stringify(postings, null, 2) + '\n');
  const out = node(dir, 'validate.mjs');
  assert.match(out, /VALIDATE OK/, '경고는 커밋 잠금이 아니다');
  assert.match(out, /빈 근거/);
  assert.match(out, new RegExp(open.id));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('normalize: 원문 없는 시드 url 을 명시적 seed 표기로 바꾼다 (스펙 1-3)', () => {
  const dir = sandbox();
  node(dir, 'merge.mjs', 'runs/2026-11-16.json');
  assert.equal(readJSON(dir, 'data/postings.json').find((p) => p.id === 'seed-kr-99').url, null,
    '병합만 돌리면 아직 null');

  assert.match(node(dir, 'normalize.mjs'), /seed-kr-99 url/);
  assert.equal(readJSON(dir, 'data/postings.json').find((p) => p.id === 'seed-kr-99').url, 'seed',
    'null → 명시적 seed 표기');
  assert.doesNotMatch(node(dir, 'normalize.mjs'), /seed-kr-99/, '두 번째는 조용히 지나간다(멱등)');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('merge: 병합된 id 로 들어온 갱신은 대표행으로 흐른다', () => {
  const dir = sandbox();
  node(dir, 'merge.mjs', 'runs/2026-11-16.json');
  node(dir, 'merge.mjs', 'runs/2026-11-18.json');   // soop:orig → soop:repost 병합 표시
  node(dir, 'merge.mjs', 'runs/2026-11-19.json');   // 원본 id 갱신(gone) 도착

  const postings = readJSON(dir, 'data/postings.json');
  const byId = new Map(postings.map((p) => [p.id, p]));
  const repost = byId.get('soop:repost'), orig = byId.get('soop:orig');
  assert.equal(repost.status, 'gone', '원본 id 갱신이 대표행 상태를 바꾼다');
  assert.ok(repost.history.some((h) => h.event === 'status_changed' && h.to === 'gone'),
    '대표행 history 에 기록된다');
  assert.equal(orig.status, 'closed', '숨겨진 중복 행은 건드리지 않는다');
  assert.equal(orig.merged_into, 'soop:repost');
  assert.match(node(dir, 'validate.mjs'), /VALIDATE OK/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('F1: dup 의 deadline 은 rep 의 deadline 을 절대 덮지 않는다 (한프카 수동 검증 보호)', () => {
  const row = (over) => ({
    company: '한국프리미엄카드마케팅', ai_policy: 'unspecified',
    evidence: [{ quote: '공고 본문 실측 근거' }], status: 'open',
    first_seen: '2026-11-01', last_seen: '2026-11-01', last_checked: '2026-11-01',
    ...over,
  });
  // (a) rep deadline null + dup 날짜 → null 유지 (구 maxOr 은 2026-11-22 로 되살렸다)
  const a = [
    row({ id: 'wanted:rep', title: '플랫폼 개발자', deadline: null }),
    row({ id: 'jobkorea:dup', title: '플랫폼 개발자 경력 채용', deadline: '2026-11-22', first_seen: '2026-11-02' }),
  ];
  dedupePostings(a);
  const aRep = a.find((p) => p.id === 'wanted:rep');
  assert.ok(!aRep.merged_into, '대표행은 wanted:rep');
  assert.equal(aRep.deadline, null, 'rep 의 null(상시채용) 이 dup 날짜로 덮이지 않는다');

  // (b) 수동 정정 이력(deadline_changed → null) + dup 날짜 → null 유지 (반려 사유 재현)
  const b = [
    row({
      id: 'wanted:rep', title: '플랫폼 개발자', deadline: null,
      history: [{ date: '2026-11-09', event: 'deadline_changed', from: '2026-11-08', to: null }],
    }),
    row({ id: 'jobkorea:dup', title: '플랫폼 개발자 경력 채용', deadline: '2026-11-22', first_seen: '2026-11-02' }),
  ];
  dedupePostings(b);
  assert.equal(b.find((p) => p.id === 'wanted:rep').deadline, null, '수동 검증 정정이 dup 의 옛 마감에 밀리지 않는다');

  // (c) rep 날짜 + dup 이후 날짜 → rep 값 그대로 (구 maxOr 은 더 늦은 dup 값으로 바꿨다)
  const c = [
    row({ id: 'wanted:rep', title: '플랫폼 개발자', deadline: '2026-11-15' }),
    row({ id: 'jobkorea:dup', title: '플랫폼 개발자 경력 채용', deadline: '2026-12-31', first_seen: '2026-11-02' }),
  ];
  dedupePostings(c);
  assert.equal(c.find((p) => p.id === 'wanted:rep').deadline, '2026-11-15', 'rep 자신의 마감이 그대로 유지된다');
});
