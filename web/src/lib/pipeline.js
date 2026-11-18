// 지원 파이프라인 — 내 기록(관심·과제중·제출완료)이 지금 몇 건씩 어디에 서 있는지 센다.
//
// 상태의 정본은 lib/statuses.js 하나다(관심 = 별표와 같은 사실, am-starred/am-status).
// 이 파일은 그 상태를 **세기만** 하는 순수 함수라 react·localStorage 를 모른다 — 테스트가
// node 만으로 돌고, 화면(Opportunities)이 조건으로 좁힌 행 목록을 그대로 넘긴다.
//
// HOT_WINDOW 는 lib/deadline.js 의 HOT_DAYS 와 같은 값이어야 한다(빨강의 뜻: D-3 이내).
// 파일을 나눠 두어 lib/deadline.js 를 react 없이도 그대로 쓸 수 있게 했다.

export const HOT_WINDOW = 3

// 파이프라인 단계 — lib/statuses.js 의 WORKFLOW 와 같은 순서·같은 id 를 쓴다.
export const PIPELINE = [
  { id: 'interested', label: '관심', cls: 'w-int' },
  { id: 'in_progress', label: '과제중', cls: 'w-prog' },
  { id: 'submitted', label: '제출완료', cls: 'w-done' },
]

const STAGE_IDS = PIPELINE.map((s) => s.id)
// 아직 손대지 않은 행은 파이프라인 밖이다. 급한 손이 필요한 단계는 관심·과제중 둘뿐 —
// 제출완료는 내가 할 일이 남아 있지 않으므로 임박으로 세지 않는다.
const ACTIONABLE = ['interested', 'in_progress']

// 마감 임박 — 살아있는 마감(0 이상)만. 지난 마감(D<0)·상시(null)는 임박이 아니다.
export function isHot(row, hotDays = HOT_WINDOW) {
  if (!row || !row.open) return false
  const dd = row.dd
  return typeof dd === 'number' && dd >= 0 && dd <= hotDays
}

// list: 이미 조건으로 좁힌 행들, statusOf(id): '' | 'interested' | 'in_progress' | 'submitted'
// 반환: 단계별 건수 + 미설정 + 임박(관심·과제중) 합계와 단계별 임박 건수
export function pipelineCounts(list, statusOf, hotDays = HOT_WINDOW) {
  const out = { total: 0, unset: 0, hot: 0, hotBy: {} }
  for (const id of STAGE_IDS) { out[id] = 0; out.hotBy[id] = 0 }
  for (const r of list || []) {
    const st = (statusOf && statusOf(r.id)) || ''
    out.total += 1
    if (!STAGE_IDS.includes(st)) { out.unset += 1; continue }
    out[st] += 1
    if (!isHot(r, hotDays)) continue
    out.hotBy[st] += 1
    if (ACTIONABLE.includes(st)) out.hot += 1
  }
  return out
}

// 한 줄 요약 — 스크린리더 안내와 버튼 title 이 같은 문장을 쓴다.
export function pipelineSummary(counts, hotDays = HOT_WINDOW) {
  const head = PIPELINE.map((s) => `${s.label} ${counts[s.id] || 0}`).join(', ')
  if (!counts.total) return '지원 파이프라인이 비어 있다'
  if (!counts.hot) return `${head} | 미설정 ${counts.unset}건`
  return `${head} | 미설정 ${counts.unset}건 | D-${hotDays} 이내 ${counts.hot}건`
}
