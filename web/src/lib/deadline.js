// 마감 표기 단일 규칙 (PR E) — 화면 어디서든 같은 낱말과 같은 색을 쓰게 한 파일에 모은다.
//
//   행(표)       상대값만: D-1 | D-Day | 상시 | 마감 | 종결
//   절대 날짜     셀 title 툴팁 | 상세 패널 | 좁은 화면 아코디언에만
//   색            D-3 이하(hot)만 red, D-4~D-7 은 본문색, D-8 이상·상시는 --mut,
//                 지난 마감·종결은 --faint (red 는 긴급에만 쓴다)
//
// 근거: Devpost 는 리스트에 "18 days left" 만 두고 절대 기간은 메타 레일에 둔다.
// Levels.fyi 는 같은 폭에서 단위를 흐리게, 수치를 굵게 쓴다. Raycast 는 상대 날짜를 자동 포맷한다.

export const HOT_DAYS = 3 // 긴급 창 — 이 안쪽만 red
export const NEAR_DAYS = 7 // 기본 톤 창 — 여기까지가 본문색, 그 밖은 차분하게

// 상태 낱말 — 표·티커·패널·관련 공고가 모두 이 함수를 거친다
export function relativeText(dd, open = true) {
  if (!open) return '종결'
  if (dd === null || dd === undefined) return '상시'
  if (dd < 0) return '마감'
  return dd === 0 ? 'D-Day' : 'D-' + dd
}

// 톤 — CSS 클래스 접미사가 된다 (.dd-hot / .dd-base / .dd-calm / .dd-over)
export function deadlineTone(dd, open = true) {
  if (!open) return 'over'
  if (dd === null || dd === undefined) return 'calm'
  if (dd < 0) return 'over'
  if (dd <= HOT_DAYS) return 'hot'
  if (dd <= NEAR_DAYS) return 'base'
  return 'calm'
}

// 절대 날짜는 여기서만 문장이 된다 (툴팁·패널용)
export function deadlineTitle(r) {
  const { deadline, dd } = r
  if (!r.open) return deadline ? `${deadline} 마감 | 모집 종결` : '모집 종결'
  if (dd === null || dd === undefined) return '마감일 미정 | 상시 모집'
  if (dd < 0) return `${deadline} 마감 | 마감 지남`
  if (dd === 0) return `${deadline} 마감 | 오늘까지`
  return `${deadline} 마감 | D-${dd}`
}

// 화면이 쓰는 한 덩어리 — prefix(흐린 `D-`)와 value(강조할 숫자/`Day`)를 갈라 준다.
// `D-` 접두사만 흐리게 두면 같은 폭에서 우선순위가 숫자로 옮겨 간다 (Levels.fyi 단위 약화).
export function deadlineView(r) {
  const text = relativeText(r.dd, r.open)
  const tone = deadlineTone(r.dd, r.open)
  const m = /^D-(Day|\d+)$/.exec(text)
  return {
    text,
    tone,
    prefix: m ? 'D-' : '',
    value: m ? m[1] : '',
    title: deadlineTitle(r),
    hot: tone === 'hot',
  }
}
