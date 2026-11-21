// sources_family.mjs — source 문자열의 정규 패밀리(소스 ROI 집계·overdue 감사의 기준).
// data/events.json 의 source 값은 발견 경로 조합('official/thinkyou/aichallenge4all')과
// 소스별 변형('devpost-api'·'wevity-fetch'·'gnews-kr-5-meetup')이 뒤섞여 28종으로 분열해
// 있었다(2026-11-21 실측). 패밀리 = 첫 세그먼트 + 변형 맵. 멱등: 이미 정규값이면 그대로.
export const SOURCE_VARIANTS = {
  'devpost-api': 'devpost',
  'wevity-fetch': 'wevity',
  'gnews-kr-5-meetup': 'gnews-kr-5',
  'thinkyou-dev-event': 'thinkyou',
};

export const sourceFamily = (s) => {
  const head = String(s || '').split('/')[0];
  return SOURCE_VARIANTS[head] || head;
};

// 매일 리스트/API 스윕이 관측하는 소스 — 이 패밀리는 '리스트에서 못 본 것'이 곧 종결·이상
// 신호라서 overdue 해도 상세 방문이 아니라 리스트 결과 재확인으로 충분하다.
// 그 밖(wanted·greeting·jumpit·seed·manual)은 상세 fetch/브라우저 재방문이 필요하다.
export const LIST_COVERED = /^(wevity|jobkorea|devpost|daker|gnews|news|official|hn)$/i;

// URL 매처용 정규화 — utm_* 파라미터와 해시만 떼고, http(s) 가 아니면(예: 'seed') null.
export const canonicalUrl = (u) => {
  const raw = String(u || '');
  if (!/^https?:\/\//i.test(raw)) return null;
  try {
    const url = new URL(raw);
    url.hash = '';
    for (const k of [...url.searchParams.keys()]) if (/^utm_/i.test(k)) url.searchParams.delete(k);
    let s = url.toString();
    if (s.endsWith('/')) s = s.slice(0, -1);
    return s;
  } catch {
    return null;
  }
};

// 상세(디테일) URL 판정 — URL 병합 매처의 가드. 경로+쿼리에 4자 이상 숫자 id 가 있거나
// 경로 깊이 2 이상일 때만 개별 항목을 가리킨다고 본다. 2026-11-21 실측: aichallenge4all
// 의 5개 서로 다른 행사가 랜딩 /competitions 를 공유하고, 위비티 3행사가 카테고리
// 리스트 ?c=find&cidx=21 를 공유했다 — 랜딩/리스트 URL 은 병합 근거가 될 수 없다.
// (blog.naver.com/ppas/224439199284 · wevity 상세 ix=111674 · thelec idxno=58211 은 통과)
export const isDetailUrl = (canonical) => {
  if (!canonical) return false;
  try {
    const u = new URL(canonical);
    const depth = u.pathname.split('/').filter(Boolean).length;
    if (depth >= 2) return true;
    return /\d{4,}/.test(u.pathname + u.search);
  } catch {
    return false;
  }
};
