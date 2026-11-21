// dedupe.mjs — 교차 소스·재게시 중복 제거 규칙 (스펙 1-2) + meta note 규칙 (스펙 1-3).
// 순수 함수다: 배열을 받아 제자리에서 병합 표시를 하고 그룹 목록을 반환한다.
// merge.mjs(매일 루틴)과 normalize.mjs(기존 데이터 멱등 정리)가 같은 규칙을 쓴다.
//
// 매처(2026-11-17 데이터 실측 기준 — 세부 근거는 PR 본문):
//   채용 — 정규화 회사명이 같고(괄호·대괄호 절편 제거: '문피아(MUNPIA)' == '문피아'),
//          제목 토큰이 같거나 한쪽이 다른 쪽의 부분집합('재공고' 토큰 제거 후)이면 한 그룹.
//          둘 다 제목이 없는 시드·수동 조사 기록도 같은 그룹으로 본다(CJ올리브네트웍스).
//          한쪽만 제목이 없으면 병합하지 않는다(정보가 부족하다).
//   이벤트 — 정규화 제목(년도·회차 보존)이 같고 host 가 양립 가능하면 한 그룹.
//          host 양립 = 같음 · 포함('매경미디어' ⊂ '매경미디어(매일경제)') · 공유 토큰
//          ('VIVID'·'엔터테인먼트 플랫폼'). 제목만 같고 host 가 다르면 다른 행사로 둔다.
//          host 를 아는 행과 모르는(빈) 행은 양립을 증명 못 하므로 병합하지 않고,
//          연도·회차 없는 반복 행사는 마감 간격(270일)으로 회차를 가른다(F4).
// 대표행 — 진행 중(open·upcoming·judging) > 시드/수동 id > 최초 등장.
//          닫힌 원본과 열린 재게시가 같은 그룹이면 열린 행이 대표가 된다(문피아 사례 —
//          화면에 남는 행이 닫힌 본문 뒤에 숨지 않도록).
// 병합 — 대표행에 last_seen·last_checked 최댓값, url 은 그룹에서 채운다.
//          deadline 은 maxOr 대상이 아니다(F1, 2026-11-17 반려 정정): rep 자신의 원천·
//          수동 검증만 따르고 dup 의 마감은 절대 이식하지 않는다 — 한프카(wanted:wd390319)의
//          수동 검증된 '상시채용(마감 없음)' 정정이 재게시 dup 의 옛 마감으로 되살아난 사례
//          방지. dup 의 마감 정보가 필요하면 resolveTarget 로 흘러드는 런 갱신(감사 기록
//          남음)을 통해서만 반영된다. AI 정책은 결정적 등급+근거를 동반한 dup 만 승격(F2).
//          중복 id 는 merged_into 로 표기되어 데이터에 남는다(감사 가능). 멱등: 다시
//          돌리면 같은 결과가 나온다.

import { canonicalUrl, isDetailUrl } from './sources_family.mjs';

const PLATFORM_ID = /^(wevity|jobkorea|jumpit|wanted|saramin|devpost|lablab|festa|onoffmix|eventbrite):/i;
const OPENISH = new Set(['open', 'upcoming', 'judging']);
const REPOST_MARK = '재공고';

const stripSegments = (s) => String(s || '').replace(/\[[^\]]*\]/g, ' ').replace(/\([^)]*\)/g, ' ');
const squash = (s) => stripSegments(s).toLowerCase().replace(/[^a-z0-9가-힣]/g, '');
const tokens = (s) => String(s || '').toLowerCase().split(/[^a-z0-9가-힣]+/).filter((t) => t && t !== REPOST_MARK);

export const companyKey = (p) => squash(p.company);
export const titleTokens = (p) => tokens(p.title);
export const eventTitleKey = (e) => String(e.title || '').toLowerCase().replace(/[^a-z0-9가-힣]/g, '');

const hostsCompatible = (a, b) => {
  const ha = squash(a), hb = squash(b);
  // 한쪽 host 를 알면 양립을 증명할 수 없다(F4): 빈 host 는 빈 host 와만 제목으로 판정한다.
  // (동명 이벤트에 host 없는 행이 들어오면 모든 host 와 붙던 과병합을 끊는다)
  if (!ha || !hb) return !ha && !hb;
  if (ha === hb || ha.includes(hb) || hb.includes(ha)) return true;
  const tb = new Set(tokens(b));
  for (const t of tokens(a)) if (tb.has(t) && t.length >= 2) return true;
  return false;
};

const sameTokens = (a, b) => {
  if (!a.length && !b.length) return true;                      // 둘 다 제목 없음 → 같은 공고로 본다
  if (!a.length || !b.length) return false;                     // 한쪽만 없음 → 병합 금지
  const sb = new Set(b);
  if (a.every((t) => sb.has(t))) return true;                   // 같음 또는 a ⊂ b
  const sa = new Set(a);
  return b.every((t) => sa.has(t));                             // b ⊂ a
};

// 반복 행사 회차 판정(F4): 제목에 연도·회차가 없는 행사는 마감 간격으로 구분한다.
// 같은 회차의 마감 연장은 며칠·몇 주 차이지만 해를 달리한 다음 회차는 270일 넘게 벌어진다.
const DAY_MS = 864e5;
const editionGapOK = (a, b) => {
  const da = a.submit_deadline || a.apply_deadline, db = b.submit_deadline || b.apply_deadline;
  if (!da || !db) return true;
  return Math.abs(new Date(da) - new Date(db)) <= 270 * DAY_MS;
};
// 동일 URL 판정(2026-11-21 조달청 사례): 제목·host 표기가 달라도 원문 URL 이 같으면
// 같은 기회다 — 단 상세 페이지만 근거로 한다(isDetailUrl). 랜딩/리스트 URL 을 여러 행사가
// 공유하는 경우(aichallenge4all /competitions, 위비티 cidx 리스트)는 병합하지 않는다.
// 'seed' 등 비-http 값은 매칭하지 않는다(시드 전체가 한 그룹으로 엉키는 사고 방지).
const sameUrl = (a, b) => {
  const ca = canonicalUrl(a.url), cb = canonicalUrl(b.url);
  return !!ca && ca === cb && isDetailUrl(ca);
};

const samePosting = (a, b) => {
  if (sameUrl(a, b)) return true;
  const ck = companyKey(a);
  return !!ck && ck === companyKey(b) && sameTokens(titleTokens(a), titleTokens(b));
};
const sameEvent = (a, b) => {
  if (sameUrl(a, b)) return true;
  const tk = eventTitleKey(a);
  return !!tk && tk === eventTitleKey(b) && hostsCompatible(a.host, b.host) && editionGapOK(a, b);
};

// 유니온-파인드: 같은 그룹 판정은 추이적이다(A~B, B~C → A~C). 단 그룹을 합칠 때는
// 양쪽 그룹의 모든 쌍이 직접 양립해야 한다(F4) — 흔한 제목('개발자')이 다리가 되어
// 서로 양립하지 않는 직무·행사를 한 그룹으로 끌어들이는 과병합을 끊는다. 재게시
// 그룹(원본·재게시가 서로 양립)은 그대로 합쳐진다.
// forced (사람 강제 병합, data/dedupe_overrides.json)는 호환 게이트를 건너뛴다 —
// 매처가 못 잡는 중복을 오너 판단으로 합친 결정이므로 재검증하지 않는다.
const groupAll = (rows, same, forced = []) => {
  const parent = rows.map((_, i) => i);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const groupsCompatible = (ra, rb) => {
    const ga = [], gb = [];
    rows.forEach((_, i) => { const r = find(i); if (r === ra) ga.push(i); else if (r === rb) gb.push(i); });
    return ga.every((a) => gb.every((b) => same(rows[a], rows[b])));
  };
  for (let i = 0; i < rows.length; i++)
    for (let j = i + 1; j < rows.length; j++)
      if (find(i) !== find(j) && same(rows[i], rows[j]) && groupsCompatible(find(i), find(j)))
        parent[find(i)] = find(j);
  for (const f of forced) {
    const a = rows.findIndex((r) => r.id === f.dup), b = rows.findIndex((r) => r.id === f.rep);
    if (a === -1 || b === -1 || a === b) continue;
    if (find(a) !== find(b)) parent[find(a)] = find(b);
  }
  const groups = new Map();
  rows.forEach((r, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(r);
  });
  return [...groups.values()].filter((g) => g.length > 1);
};

const maxOr = (values, fallback) => {
  const vs = values.filter(Boolean).sort();
  return vs.length ? vs[vs.length - 1] : fallback;
};

// AI 정책 등급(F2): 결정적일수록 높다. banned·restricted 등 POLICY_RANK 밖 등급은
// 데이터드리븐 정책이라 병합 승격의 rep·dup 어느 방향에도 대상이 되지 않는다(R2 가드) —
// 일상 루틴의 policy_changed 감사 경로가 따로 관리한다.
const POLICY_RANK = { allowed: 1, allowed_graded: 2, required: 3 };

// rep 측 가드(R2): 병합 승격은 rep 이 공란/unspecified 이거나 랭크 등급(allowed 등)일 때만
// 허용한다. 밖 등급(banned·restricted)은 POLICY_RANK 대입이 undefined → rank 0 이 되어
// 종래 `rank(dup) > rank(rep)` 조건에서 근거 있는 required dup 이 rep 금지 배지를 덮었다
// (점핏 55361658 재게시 시도 시 AI 금지 배지 뒤집힘). 가드로 이 경로를 원천 차단한다.
const promotableRep = (value) => !value || value === 'unspecified' || Object.hasOwn(POLICY_RANK, value);

// dup 의 결정적 AI 정책을 rep 에 승격한다(F2) — 오로라월드 사례: rep 미언급인데 숨은
// 재공고 dup 가 '사전 과제(바이브 코딩)+Claude code' 근거와 함께 required 판정을 갖고 있었다.
// 근거를 동반한 상위 등급만 승격하고, 같은 등급·근거 없는 dup·강등 방향은 승격하지 않는다.
const promotePolicy = (rep, dups, field) => {
  const rank = (r) => POLICY_RANK[r[field]] || 0;
  // R2: rep 밖 등급(banned·restricted 등)은 근거 동반 상위 등급 dup 으로도 덮지 않는다.
  if (!promotableRep(rep[field])) return;
  const best = dups
    .filter((d) => rank(d) > rank(rep) && (d.evidence || []).length)
    .sort((a, b) => rank(b) - rank(a) || String(b.last_checked || '').localeCompare(String(a.last_checked || '')))[0];
  if (!best) return;
  rep.history = [...(rep.history || []), {
    date: best.last_checked || rep.last_checked || '',
    event: 'policy_promoted', from: rep[field], to: best[field], via: best.id,
    evidence: best.evidence[0]?.quote ?? String(best.evidence[0] ?? ''),
  }];
  // dup 의 근거를 rep evidence 에도 반영한다 — 정책 배지와 근거 인용이 어긋나지 않게.
  for (const e of best.evidence)
    if (!(rep.evidence || []).some((x) => JSON.stringify(x) === JSON.stringify(e))) rep.evidence = [...(rep.evidence || []), e];
  rep[field] = best[field];
};

const pickRep = (group, prevReps) =>
  group
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      const key = (x) => [OPENISH.has(x.r.status) ? 0 : 1, prevReps.has(x.r.id) ? 0 : 1, PLATFORM_ID.test(x.r.id) ? 1 : 0, x.r.first_seen || '9999', x.i];
      const ka = key(a), kb = key(b);
      for (let k = 0; k < ka.length; k++) if (ka[k] !== kb[k]) return ka[k] < kb[k] ? -1 : 1;
      return 0;
    })[0].r;

/**
 * @template {{id:string}} T
 * @param {T[]} rows data/postings.json 또는 events.json 배열 (제자리에서 병합 표시)
 * @param {(a:T,b:T)=>boolean} same 같은 기회 판정
 * @param {{dateFields:string[], mergeFields:string[], policyField?:string}} opts 병합할 필드(policyField: 결정적 등급 dup 의 정책 승격 대상)
 * @returns {{rep:string, dups:string}[]} 병합된 그룹 목록
 */
const dedupeRows = (rows, same, opts, forced = []) => {
  // 이전 병합 표시를 먼저 기억한다 — 대표행 선택의 동률 판정에 써서, 그룹 상태가
  // 바뀌어도 대표 id 가 뒤집히지 않게 한다(관심·딥링크가 id 를 참조한다)
  const prevReps = new Set(rows.filter((r) => r.duplicates && r.duplicates.length).map((r) => r.id));
  for (const r of rows) { delete r.merged_into; delete r.duplicates; }   // 멱등: 표시를 다시 계산한다
  const groups = [];
  for (const group of groupAll(rows, same, forced)) {
    const rep = pickRep(group, prevReps);
    const dups = group.filter((r) => r !== rep)
      .sort((a, b) => (a.first_seen || '9999').localeCompare(b.first_seen || '9999') || a.id.localeCompare(b.id));
    for (const d of dups) d.merged_into = rep.id;
    // 대표행 병합: 확인·발견 최댓값(dateFields), 스칼라는 대표값이 비었을 때만 채운다(mergeFields).
    // deadline·마감(apply/submit_deadline)은 어느 쪽에도 없다(F1·R3) — dup 의 마감이 rep 의 값(null 포함)을 건드리지 않는다.
    for (const f of opts.dateFields) rep[f] = maxOr([rep[f], ...dups.map((d) => d[f])], rep[f] || null);
    for (const f of opts.mergeFields) {
      if (!rep[f]) { const hit = dups.find((d) => d[f]); if (hit) rep[f] = hit[f]; }
    }
    if (opts.policyField) promotePolicy(rep, dups, opts.policyField);
    rep.duplicates = dups.map((d) => d.id);
    groups.push({ rep: rep.id, dups: rep.duplicates });
  }
  return groups;
};

export const dedupePostings = (rows, forced = []) => dedupeRows(rows, samePosting, { dateFields: ['last_seen', 'last_checked'], mergeFields: ['url'], policyField: 'ai_policy' }, forced);
// 이벤트 마감(apply/submit)도 채용 deadline 과 같은 규칙(R3, F1 의 이벤트 확장): dup 의
// 마감이 rep 의 값(null·수동 정정 포함)을 건드리지 않는다 — ko-0003 등 수동 정정 이력
// 보유 이벤트 5건이 재게시 dup 의 옛 마감으로 되살아나는 결함 차단. 합법적 마감 연장은
// collector 재확인 경로가 event_deadline_changed 감사와 함께 반영한다. last_checked 만 maxOr.
export const dedupeEvents = (rows, forced = []) => dedupeRows(rows, sameEvent, { dateFields: ['last_checked'], mergeFields: ['url'] }, forced);

// meta note 규칙(스펙 1-3): 마지막 런이 시드 날짜와 같으면 '시드뿐', 그 다음부터는
// 루틴 가동 상태로 쓴다. 허위 상태("not started")가 데이터에 박히지 않게 last_run 에서 파생한다.
export const metaNote = (lastRun, seedDate) =>
  !lastRun
    ? 'P1 seed. daily routine not started (P3).'
    : lastRun === seedDate
      ? `P1 seed ${seedDate}. daily routine not started (P3).`
      : `daily routine active (P3) — last run ${lastRun}.`;
