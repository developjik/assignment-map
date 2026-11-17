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
// 대표행 — 진행 중(open·upcoming·judging) > 시드/수동 id > 최초 등장.
//          닫힌 원본과 열린 재게시가 같은 그룹이면 열린 행이 대표가 된다(문피아 사례 —
//          화면에 남는 행이 닫힌 본문 뒤에 숨지 않도록).
// 병합 — 대표행에 last_seen·last_checked 최댓값, url·deadline 을 그룹에서 채운다
//          (deadline 은 가장 늦은 값 — 재게시는 마감이 늘어난 본문이다).
//          중복 id 는 merged_into 로 표기되어 데이터에 남는다(감사 가능). 멱등: 다시
//          돌리면 같은 결과가 나온다.

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
  if (!ha || !hb) return true;                                  // 한쪽 host가 비면 제목만으로 판정한다
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

const samePosting = (a, b) => {
  const ck = companyKey(a);
  return !!ck && ck === companyKey(b) && sameTokens(titleTokens(a), titleTokens(b));
};
const sameEvent = (a, b) => {
  const tk = eventTitleKey(a);
  return !!tk && tk === eventTitleKey(b) && hostsCompatible(a.host, b.host);
};

// 유니온-파인드: 같은 그룹 판정은 추이적이다(A~B, B~C → A~C)
const groupAll = (rows, same) => {
  const parent = rows.map((_, i) => i);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  for (let i = 0; i < rows.length; i++)
    for (let j = i + 1; j < rows.length; j++)
      if (find(i) !== find(j) && same(rows[i], rows[j])) parent[find(i)] = find(j);
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
 * @param {{dateFields:string[], mergeFields:string[]}} opts 병합할 필드
 * @returns {{rep:string, dups:string}[]} 병합된 그룹 목록
 */
const dedupeRows = (rows, same, opts) => {
  // 이전 병합 표시를 먼저 기억한다 — 대표행 선택의 동률 판정에 써서, 그룹 상태가
  // 바뀌어도 대표 id 가 뒤집히지 않게 한다(관심·딥링크가 id 를 참조한다)
  const prevReps = new Set(rows.filter((r) => r.duplicates && r.duplicates.length).map((r) => r.id));
  for (const r of rows) { delete r.merged_into; delete r.duplicates; }   // 멱등: 표시를 다시 계산한다
  const groups = [];
  for (const group of groupAll(rows, same)) {
    const rep = pickRep(group, prevReps);
    const dups = group.filter((r) => r !== rep)
      .sort((a, b) => (a.first_seen || '9999').localeCompare(b.first_seen || '9999') || a.id.localeCompare(b.id));
    for (const d of dups) d.merged_into = rep.id;
    // 대표행 병합: 확인·발견 최댓값, 스칼라 필드는 대표값이 비었을 때 채우거나(deadline 제외) 최댓값
    for (const f of opts.dateFields) rep[f] = maxOr([rep[f], ...dups.map((d) => d[f])], rep[f] || null);
    for (const f of opts.mergeFields) {
      if (!rep[f]) { const hit = dups.find((d) => d[f]); if (hit) rep[f] = hit[f]; }
    }
    rep.duplicates = dups.map((d) => d.id);
    groups.push({ rep: rep.id, dups: rep.duplicates });
  }
  return groups;
};

export const dedupePostings = (rows) => dedupeRows(rows, samePosting, { dateFields: ['last_seen', 'last_checked', 'deadline'], mergeFields: ['url'] });
export const dedupeEvents = (rows) => dedupeRows(rows, sameEvent, { dateFields: ['last_checked', 'apply_deadline', 'submit_deadline'], mergeFields: ['url'] });

// meta note 규칙(스펙 1-3): 마지막 런이 시드 날짜와 같으면 '시드뿐', 그 다음부터는
// 루틴 가동 상태로 쓴다. 허위 상태("not started")가 데이터에 박히지 않게 last_run 에서 파생한다.
export const metaNote = (lastRun, seedDate) =>
  !lastRun
    ? 'P1 seed. daily routine not started (P3).'
    : lastRun === seedDate
      ? `P1 seed ${seedDate}. daily routine not started (P3).`
      : `daily routine active (P3) — last run ${lastRun}.`;
