// 관심(북마크) — 서버 없이 localStorage 'am-starred'에 공고/이벤트 ID 배열을 둔다.
// 같은 탭의 여러 컴포넌트는 커스텀 이벤트로, 다른 탭은 storage 이벤트로 동기화한다.

import { useEffect, useState } from 'react'

export const STARRED_KEY = 'am-starred'
const EVENT = 'am-star-changed'

export function getStarred() {
  try {
    const v = JSON.parse(localStorage.getItem(STARRED_KEY) || '[]')
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x) : []
  } catch {
    return []
  }
}

export function setStarred(ids) {
  const next = [...new Set((ids || []).filter((x) => typeof x === 'string' && x))]
  try { localStorage.setItem(STARRED_KEY, JSON.stringify(next)) } catch { /* 저장 불가(사생활 모드) */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT))
  return next
}

export function isStarred(id) {
  return getStarred().includes(id)
}

export function toggleStarred(id) {
  const cur = getStarred()
  const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
  setStarred(next)
  return next.includes(id)
}

// 컴포넌트에서 쓰는 훅: [별표된 ID 배열, 토글 함수]
export function useStarred() {
  const [ids, setIds] = useState(getStarred)
  useEffect(() => {
    const sync = () => setIds(getStarred())
    window.addEventListener(EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])
  return [ids, toggleStarred]
}
