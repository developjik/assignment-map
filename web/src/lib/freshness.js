// 수집 신선도 — meta.last_run 이 며칠 지났는지 브라우저 시간으로 센다.
// 빌드 시점에 굳히지 않으므로 수집이 재개되면 배지가 스스로 사라진다.
import { useEffect, useState } from 'react'

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

// 자정을 넘겨도 배지가 맞게 바뀌도록 30분마다 다시 센다 (탭이 다시 보일 때도)
export function useStaleness(lastRun, refreshMs = 1800e3) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const t = setInterval(tick, refreshMs)
    document.addEventListener('visibilitychange', tick)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', tick) }
  }, [refreshMs])
  return staleness(lastRun, now)
}
