// 수집 신선도 — 배지가 쓰는 React 훅. 날짜 계산은 freshnessDate.js 에 있고 여기서는 쓰기만 한다.
// 이 파일은 'react' 를 import 하므로 web/tests/*.test.mjs 가 절대 import 하면 안 된다
// (deploy 워크플로는 npm ci 전에 루트에서 npm test 를 돌린다 — react 가 아직 없다).
import { useEffect, useState } from 'react'
import { staleness } from './freshnessDate.js'

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
