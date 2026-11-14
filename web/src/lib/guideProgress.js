// 공략 체크리스트 진행률 — GuidePane 이 localStorage 에 남기는 체크를 배지가 같은 규칙으로 읽는다.
// 키는 '<가이드 id>:<체크 인덱스>' 이고, 행에 붙는 배지는 그 행에 자동 매핑된 가이드의 몫만 센다.
import { useEffect, useState } from 'react'
import { matchGuide } from './guides'

export const CHECKS_KEY = 'am-guide-checks'
const EVENT = 'am-guide-check-changed'

export function readChecks() {
  try {
    const v = JSON.parse(localStorage.getItem(CHECKS_KEY) || '{}')
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {}
  } catch { return {} }
}

export function writeChecks(next) {
  try { localStorage.setItem(CHECKS_KEY, JSON.stringify(next)) } catch { /* 사생활 모드 */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT))
}

// 행 하나의 진행률: { done, total, guide }
export function progressFor(r, checks = readChecks()) {
  let guide = null
  try { guide = matchGuide(r).guide } catch { guide = null }
  if (!guide) return { done: 0, total: 0, guide: null }
  const total = guide.checklist.length
  const done = guide.checklist.filter((_, i) => checks[guide.id + ':' + i]).length
  return { done, total, guide }
}

// 완료율(%) — 0~100, 체크리스트가 없으면 0
export function progressPct({ done, total }) {
  return total > 0 ? Math.round((done / total) * 100) : 0
}

// 두 키(같은 guide:index) 집합 비교 없이, 훅은 변경 신호만 구독한다
export function useChecks() {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const sync = () => setTick((t) => t + 1)
    window.addEventListener(EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])
  void tick
  return readChecks()
}
