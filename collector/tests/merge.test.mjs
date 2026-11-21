// merge.mjs · validate.mjs 회귀 테스트 — evidence 가 문자열로 들어와도 data 는 배열로 저장되고,
// 문자열 evidence 는 validate 가 즉시 실패시키는지 임시 리포를 만들어 확인한다.
// 실행: node --test collector/tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { dedupePostings, dedupeEvents } from '../dedupe.mjs';

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
  for (const f of ['merge.mjs', 'validate.mjs', 'normalize.mjs', 'evidence.mjs', 'dedupe.mjs', 'overdue.mjs', 'sources_family.mjs']) {
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

test('R3: dup 의 apply/submit 마감은 rep 이벤트의 값을 절대 덮지 않는다 (F1 의 이벤트 확장)', () => {
  const ev = (over) => ({
    id: 'wevity:rep', type: 'contest', title: 'AI 공모전', host: 'A재단', ai_usage: 'allowed',
    status: 'open', evidence: ['공모전 근거'], first_seen: '2026-11-01', last_checked: '2026-11-01', ...over,
  });
  const dup = (over) => ev({ id: 'wevity:dup', first_seen: '2026-11-02', last_checked: '2026-11-02', ...over });

  // (a) rep null + dup 날짜 → null 유지
  const a = [ev({ apply_deadline: null, submit_deadline: null }), dup({ apply_deadline: '2026-12-31', submit_deadline: '2026-12-31' })];
  dedupeEvents(a);
  const aRep = a.find((e) => e.id === 'wevity:rep');
  assert.ok(!aRep.merged_into, '대표행은 wevity:rep');
  assert.equal(aRep.apply_deadline, null, 'rep 의 null 이 dup 날짜로 덮이지 않는다');
  assert.equal(aRep.submit_deadline, null, 'submit_deadline 도 null 유지');

  // (b) rep 수동 정정 이력(deadline_changed → 11-25) + dup 옛 날짜 → 수동 정정값 유지 (ko-0003 동형)
  const b = [
    ev({
      apply_deadline: '2026-11-25', submit_deadline: '2026-11-25',
      history: [{ date: '2026-11-07', event: 'deadline_changed', field: 'submit_deadline', from: '2026-11-10', to: '2026-11-25' }],
    }),
    dup({ apply_deadline: '2026-11-10', submit_deadline: '2026-11-10' }),
  ];
  dedupeEvents(b);
  const bRep = b.find((e) => e.id === 'wevity:rep');
  assert.equal(bRep.apply_deadline, '2026-11-25', '수동 정정 마감이 dup 의 옛 값으로 되살아나지 않는다');
  assert.equal(bRep.submit_deadline, '2026-11-25', 'submit_deadline 도 수동 정정값 유지');

  // (c) rep 날짜 + dup 이후 날짜 → rep 값 그대로, last_checked maxOr 는 유지
  const c = [
    ev({ apply_deadline: '2026-11-30', submit_deadline: '2026-11-30' }),
    dup({ apply_deadline: '2026-12-31', submit_deadline: '2026-12-31', last_checked: '2026-11-09' }),
  ];
  dedupeEvents(c);
  const cRep = c.find((e) => e.id === 'wevity:rep');
  assert.equal(cRep.apply_deadline, '2026-11-30', 'rep 자신의 마감이 그대로 유지된다');
  assert.equal(cRep.submit_deadline, '2026-11-30', 'submit_deadline 도 rep 값 그대로');
  assert.equal(cRep.last_checked, '2026-11-09', 'last_checked maxOr 는 계속 작동한다');
});

test('F2: 결정적 ai_policy 를 근거와 함께 승격한다 (오로라월드 사례)', () => {
  const row = (over) => ({
    company: '오로라월드', title: 'PI오퍼레이션 컨설턴트', status: 'open',
    first_seen: '2026-11-07', last_seen: '2026-11-07', last_checked: '2026-11-07',
    ...over,
  });
  const dupEvidence = [{ quote: "GI_Read_Comt_Ifrm(2026-11-15): '서류 합격하신 분에 한해 사전 과제(바이브 코딩)' + 기술스택 'Claude code' 명시", field: 'assignment' }];

  // (a) rep unspecified + dup required(근거 有) → 승격 + history·근거 반영
  const a = [
    row({ id: 'jobkorea:rep', ai_policy: 'unspecified', deadline: '2026-12-13', evidence: [{ quote: 'rep 자체 조사 근거', field: 'assignment' }] }),
    row({ id: 'jobkorea:dup', ai_policy: 'required', deadline: '2026-12-13', evidence: dupEvidence, title: 'PI오퍼레이션 컨설턴트 (재공고)', first_seen: '2026-11-15', last_checked: '2026-11-15' }),
  ];
  dedupePostings(a);
  const aRep = a.find((p) => p.id === 'jobkorea:rep');
  assert.equal(aRep.ai_policy, 'required', '숨은 dup 의 필수 정책이 rep 배지로 승격');
  const promo = aRep.history.find((h) => h.event === 'policy_promoted');
  assert.ok(promo, '승격이 history 에 감사 기록된다');
  assert.equal(promo.from, 'unspecified'); assert.equal(promo.to, 'required'); assert.equal(promo.via, 'jobkorea:dup');
  assert.ok(aRep.evidence.some((e) => e.quote.includes('바이브 코딩')), 'dup 의 근거 인용이 rep evidence 에 반영');

  // (b) rep required + dup unspecified → 불변
  const b = [
    row({ id: 'jobkorea:rep', ai_policy: 'required', evidence: [{ quote: 'rep 근거', field: 'assignment' }] }),
    row({ id: 'jobkorea:dup', ai_policy: 'unspecified', evidence: [{ quote: 'dup 근거', field: 'assignment' }], first_seen: '2026-11-15', last_checked: '2026-11-15' }),
  ];
  dedupePostings(b);
  assert.equal(b.find((p) => p.id === 'jobkorea:rep').ai_policy, 'required', '하위 등급 dup 로 강등되지 않는다');

  // (c) 동일 등급 + dup last_checked 구 → 불변
  const c = [
    row({ id: 'jobkorea:rep', ai_policy: 'allowed', evidence: [{ quote: 'rep 근거', field: 'assignment' }] }),
    row({ id: 'jobkorea:dup', ai_policy: 'allowed', evidence: [{ quote: 'dup 근거', field: 'assignment' }], first_seen: '2026-11-08', last_checked: '2026-11-08' }),
  ];
  dedupePostings(c);
  const cRep = c.find((p) => p.id === 'jobkorea:rep');
  assert.equal(cRep.ai_policy, 'allowed', '같은 등급이면 승격하지 않는다');
  assert.ok(!cRep.history?.some((h) => h.event === 'policy_promoted'), '같은 등급엔 감사 기록도 남지 않는다');

  // (d) 근거 없는 dup required → 승격 금지 (근거 없는 승격 금지)
  const d = [
    row({ id: 'jobkorea:rep', ai_policy: 'unspecified', evidence: [{ quote: 'rep 근거', field: 'assignment' }] }),
    row({ id: 'jobkorea:dup', ai_policy: 'required', evidence: [], first_seen: '2026-11-15', last_checked: '2026-11-15' }),
  ];
  dedupePostings(d);
  assert.equal(d.find((p) => p.id === 'jobkorea:rep').ai_policy, 'unspecified', '근거 없는 dup 은 승격하지 않는다');
});

test('R2: rep banned·restricted 는 근거 있는 상위 dup 으로도 덮이지 않는다 (promotePolicy 가드)', () => {
  const row = (over) => ({
    company: '데이터드리븐', title: '실시간 개발 과제', status: 'open',
    first_seen: '2026-11-01', last_seen: '2026-11-01', last_checked: '2026-11-01',
    ...over,
  });
  const requiredDup = (id) => row({
    id, ai_policy: 'required', title: '실시간 개발 과제 (재공고)',
    evidence: [{ quote: "'사전 과제(바이브 코딩)' + 기술스택 'Claude code' 명시", field: 'assignment' }],
    first_seen: '2026-11-15', last_checked: '2026-11-15',
  });

  // (a) rep banned + dup required(근거 有) → banned 불변·승격 이력 0건 (점핏 재게시 방어)
  const a = [
    row({ id: 'jumpit:rep', ai_policy: 'banned', evidence: [{ quote: '실시간 개발 과제 AI 도구 사용 금지 명시', field: 'policy' }] }),
    requiredDup('jobkorea:dup'),
  ];
  dedupePostings(a);
  const aRep = a.find((p) => p.id === 'jumpit:rep');
  assert.equal(aRep.ai_policy, 'banned', '금지 배지가 required dup 으로 뒤집히지 않는다');
  assert.ok(!aRep.history?.some((h) => h.event === 'policy_promoted'), 'policy_promoted 이력이 0건');

  // (b) rep restricted + dup required(근거 有) → restricted 불변
  const b = [
    row({ id: 'jumpit:rep', ai_policy: 'restricted', evidence: [{ quote: '부분 허용·조건 명시', field: 'policy' }] }),
    requiredDup('jobkorea:dup'),
  ];
  dedupePostings(b);
  assert.equal(b.find((p) => p.id === 'jumpit:rep').ai_policy, 'restricted', 'restricted 도 마찬가지로 불변');

  // (c) rep unspecified + dup required(근거 有) → 승격 (F2 성과 회귀 방어 — 가드가 정상 승격을 막으면 안 된다)
  const c = [
    row({ id: 'jobkorea:rep', ai_policy: 'unspecified', evidence: [{ quote: 'rep 자체 조사 근거', field: 'assignment' }] }),
    requiredDup('jobkorea:dup'),
  ];
  dedupePostings(c);
  const cRep = c.find((p) => p.id === 'jobkorea:rep');
  assert.equal(cRep.ai_policy, 'required', 'unspecified rep 은 여전히 승격된다');
  assert.ok(cRep.history.some((h) => h.event === 'policy_promoted'), '승격 감사도 그대로 남는다');

  // (d) 랭크 내 강등 방향 불변(현행 유지) — rep required + dup allowed(근거 有)
  const d = [
    row({ id: 'jobkorea:rep', ai_policy: 'required', evidence: [{ quote: 'rep 필수 근거', field: 'assignment' }] }),
    row({
      id: 'jobkorea:dup', ai_policy: 'allowed', title: '실시간 개발 과제 (재공고)',
      evidence: [{ quote: '허용 근거', field: 'assignment' }], first_seen: '2026-11-15', last_checked: '2026-11-15',
    }),
  ];
  dedupePostings(d);
  assert.equal(d.find((p) => p.id === 'jobkorea:rep').ai_policy, 'required', '하위 등급 dup 으로 강등되지 않는다');

  // 밖 등급 dup 승격 방향도 차단(현행 rank 0 구조 차단을 테스트로 못박는다) — rep unspecified + dup banned
  const e = [
    row({ id: 'wanted:rep', ai_policy: 'unspecified', evidence: [{ quote: 'rep 근거', field: 'assignment' }] }),
    row({
      id: 'jumpit:dup', ai_policy: 'banned', title: '실시간 개발 과제 (재공고)',
      evidence: [{ quote: '금지 근거', field: 'policy' }], first_seen: '2026-11-15', last_checked: '2026-11-15',
    }),
  ];
  dedupePostings(e);
  assert.equal(e.find((p) => p.id === 'wanted:rep').ai_policy, 'unspecified', 'banned dup 이 rep 로 승격되지 않는다');
});

test('F4: 매처 경계 — 추이성 다리로 서로 다른 직무가 한 그룹이 되지 않는다', () => {
  const row = (title, id) => ({
    id, company: '다리컴퍼니', title, ai_policy: 'unspecified', status: 'open',
    evidence: [{ quote: '근거' }], first_seen: '2026-11-01', last_seen: '2026-11-01', last_checked: '2026-11-01',
  });
  const rows = [row('개발자', 'p:dev'), row('프론트엔드 개발자', 'p:fe'), row('백엔드 개발자', 'p:be')];
  const groups = dedupePostings(rows);
  const inSameGroup = (a, b) => groups.some((g) =>
    [g.rep, ...g.dups].includes(a) && [g.rep, ...g.dups].includes(b));
  assert.ok(!inSameGroup('p:fe', 'p:be'), '프론트엔드와 백엔드는 절대 같은 그룹이 아니다');
  assert.ok(!groups.some((g) => g.dups.length === 2), '3행이 한 그룹으로 추이 병합되지 않는다');
});

test('F4: 매처 경계 — 부분집합 오탐(경력 vs 신입)이 같은 그룹이 되지 않는다', () => {
  const row = (title, id) => ({
    id, company: '가린다', title, ai_policy: 'unspecified', status: 'open',
    evidence: [{ quote: '근거' }], first_seen: '2026-11-01', last_seen: '2026-11-01', last_checked: '2026-11-01',
  });
  const rows = [row('백엔드 개발자(경력)', 'p:senior'), row('백엔드 개발자 신입', 'p:junior'), row('백엔드 개발자', 'p:bare')];
  const groups = dedupePostings(rows);
  const inSameGroup = (a, b) => groups.some((g) =>
    [g.rep, ...g.dups].includes(a) && [g.rep, ...g.dups].includes(b));
  assert.ok(!inSameGroup('p:senior', 'p:junior'), '경력과 신입은 같은 공고가 아니다');
});

test('F4: 매처 경계 — host 빈값 동명 이벤트는 host 를 아는 행과 병합되지 않는다', () => {
  const ev = (id, host, over) => ({
    id, type: 'contest', title: '동명 AI 컨퍼런스', host, ai_usage: 'allowed', status: 'open',
    apply_deadline: '2026-11-30', submit_deadline: '2026-11-30', evidence: ['근거'],
    first_seen: '2026-11-01', last_checked: '2026-11-01', ...over,
  });
  // host 있음 vs 빈값 → 병합 금지
  const rows = [ev('wevity:known', 'A재단'), ev('seed:unknown', '')];
  assert.equal(dedupeEvents(rows).length, 0, 'host 를 아는 쪽과 모르는 쪽은 양립 미증명');
  // 빈값끼리는 기존 설계대로 제목으로 판정한다(시드 보호)
  const both = [ev('seed:a', ''), ev('seed:b', '')];
  assert.equal(dedupeEvents(both).length, 1, '빈 host 끼리는 같은 제목이면 한 그룹');
});

test('F4: 매처 경계 — 연도 없는 반복 행사 회차(마감 270일+)는 병합되지 않는다', () => {
  const ev = (id, apply, over) => ({
    id, type: 'contest', title: '반복 해커톤', host: 'X주최', ai_usage: 'allowed', status: 'open',
    apply_deadline: apply, submit_deadline: apply, evidence: ['근거'],
    first_seen: '2026-11-01', last_checked: '2026-11-01', ...over,
  });
  // 내년 회차 → 병합 금지
  const rows = [ev('wevity:this-year', '2026-11-30'), ev('wevity:next-year', '2027-11-30')];
  assert.equal(dedupeEvents(rows).length, 0, '마감이 270일 넘게 차면 다른 회차다');
  // 같은 회차의 마감 연장(재게시) → 병합 유지
  const close = [ev('wevity:a', '2026-11-30'), ev('wevity:b', '2026-12-13', { host: 'X주최(서울)' })];
  assert.equal(dedupeEvents(close).length, 1, '마감 연장 재게시는 같은 회차로 병합');
});

test('F5: 이미 병합된 그룹은 다음 날 changelog 에 재기록되지 않는다', () => {
  const dir = sandbox();
  node(dir, 'merge.mjs', 'runs/2026-11-16.json');
  node(dir, 'merge.mjs', 'runs/2026-11-18.json');   // soop 그룹 형성 — 첫 기록
  node(dir, 'merge.mjs', 'runs/2026-11-19.json');   // 다음 날 루틴 — 그룹은 그대로
  const log = readJSON(dir, 'data/changelog.json').events;
  const d18 = log.find((c) => c.date === '2026-11-18');
  const d19 = log.find((c) => c.date === '2026-11-19');
  assert.deepEqual(d18.merged_postings, ['soop:orig->soop:repost'], '첫 병합은 기록된다');
  assert.deepEqual(d19.merged_postings, [], '이미 병합된 그룹은 재기록되지 않는다');
  assert.match(d19.summary, /중복병합 0/, '요약 카운트도 0');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('F5: normalize 이 새 병합을 적용하면 changelog merged_* 에 감사 기록된다', () => {
  const dir = sandbox();
  node(dir, 'merge.mjs', 'runs/2026-11-16.json');
  // 병합 표시 없이 재게시 행이 데이터에 들어온 상황(다른 경로 유입)을 만든다
  const postings = readJSON(dir, 'data/postings.json');
  postings.push({
    id: 'soop:repost', company: '숲(SOOP)', title: 'LIVE 방송 서버 개발 (재공고)',
    positions: ['backend'], ai_policy: 'allowed', evidence: [{ quote: '재게시 본문 근거' }],
    url: 'https://example.com/soop2', deadline: '2026-11-15', status: 'open',
    first_seen: '2026-11-18', last_seen: '2026-11-18', last_checked: '2026-11-18',
    check_cadence: 'weekly', review: 'auto', history: [],
  });
  fs.writeFileSync(path.join(dir, 'data/postings.json'), JSON.stringify(postings, null, 2) + '\n');
  assert.match(node(dir, 'normalize.mjs'), /soop:repost duplicates/);
  const entry = readJSON(dir, 'data/changelog.json').events.find((c) => c.date === '2026-11-16');
  assert.ok(entry, 'meta.last_run(2026-11-16) 날짜 엔트리에 기록');
  assert.deepEqual(entry.merged_postings, ['soop:orig->soop:repost'], 'normalize 경유 병합의 merged_* 감사 기록');
  assert.deepEqual(entry.merged_events, ['wevity:m2->wevity:m1'], 'merge 경유 병합 기록은 그대로 공존');
  assert.match(entry.summary, /중복병합 2/, '요약 카운트에 두 경로가 모두 반영');
  assert.match(node(dir, 'normalize.mjs'), /바꿀 필드 없음/, '두 번째는 멱등 — 감사 기록도 중복되지 않는다');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('F5: 같은 날 재병합이 첫 런의 sources·notes 를 지우지 않는다', () => {
  const dir = sandbox();
  fs.writeFileSync(path.join(dir, 'runs/2026-11-17.json'), JSON.stringify({
    date: '2026-11-17',
    sources: [{ id: 'wevity-fetch', method: 'fetch', pages: 1, result: '첫 런 조사 기록' }],
    notes: '첫 런 메모', postings: [], events: [],
  }, null, 2) + '\n');
  node(dir, 'merge.mjs', 'runs/2026-11-17.json');
  fs.writeFileSync(path.join(dir, 'runs/2026-11-17b.json'), JSON.stringify({
    date: '2026-11-17', postings: [], events: [],
  }, null, 2) + '\n');
  node(dir, 'merge.mjs', 'runs/2026-11-17b.json');   // sources·notes 없는 같은 날 재실행
  const entry = readJSON(dir, 'data/changelog.json').events.find((c) => c.date === '2026-11-17');
  assert.equal(entry.notes, '첫 런 메모', 'notes 유실 없음');
  assert.deepEqual(entry.sources.map((x) => x.id), ['wevity-fetch'], 'sources 유실 없음');
  fs.rmSync(dir, { recursive: true, force: true });
});
