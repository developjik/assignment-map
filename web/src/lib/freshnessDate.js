// 수집 신선도 — 날짜 계산만 모은 순수 모듈. React 를 쓰지 않는다.
// 이 파일은 CI 가 web/node_modules 설치 전에 돌리는 `npm test`(web/tests/*.test.mjs)에서 그대로 import 된다.
// 훅(useStaleness)은 여기가 아니라 freshness.js 에 있다 — 테스트가 'react' 를 찾지 않게 하려는 분리다.

const KST_OFFSET = 9 * 3600e3
const DAY = 864e5

// 오늘(KST) YYYY-MM-DD
export function kstToday(now = Date.now()) {
  return new Date(now + KST_OFFSET).toISOString().slice(0, 10)
}

// dateStr 이후 지난 KST 달력일 수 (미래/이상값이면 null)
export function daysSince(dateStr, now = Date.now()) {
  const s = String(dateStr || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const then = Date.parse(s + 'T00:00:00Z')
  const today = Date.parse(kstToday(now) + 'T00:00:00Z')
  if (Number.isNaN(then)) return null
  return Math.round((today - then) / DAY)
}

// 수집이 이만큼(일) 멈추면 지연으로 본다. 하루 한 번 도는 루틴이라 2일이면 두 번 놓친 것.
export const STALE_AFTER_DAYS = 2

export function staleness(lastRun, now = Date.now()) {
  const days = daysSince(lastRun, now)
  return { days, stale: days !== null && days >= STALE_AFTER_DAYS, today: kstToday(now) }
}

// 다음 수집일 — 루틴은 매일 03:00 KST 한 번. last_run(YYYY-MM-DD)의 다음 날.
// 헤더의 수집 시각 한 곳이 이 값을 title 로만 쓴다 (티커 바에서 옮겨 왔다 — PR C).
export function nextRun(lastRun) {
  const s = String(lastRun || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return ''
  const d = new Date(s + 'T00:00:00Z')
  if (Number.isNaN(d.getTime())) return ''
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}
