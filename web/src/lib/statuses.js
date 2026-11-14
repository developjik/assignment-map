// 지원 상태 트래커 — 공고/이벤트별 진행 상태를 localStorage 에 둔다 (서버 없음).
//
//   interested  관심      ← 기존 별표(am-starred)와 같은 사실이라 별표에 그대로 맡긴다
//   in_progress 과제중
//   submitted   제출완료
//
// 별표는 "모아 둔 목록"이고 상태는 "지금 어디까지 갔나"라서 저장소를 하나로 합치지 않는다.
// 다만 관심은 별표와 같은 뜻이므로 am-status 에는 interested 를 저장하지 않고,
// 상태를 interested 로 올릴 때 별표를 켜고 내릴 때 별표를 끈다 (같은 사실을 두 곳에 두지 않는다).
import { useEffect, useState } from 'react'
import { getStarred, setStarred } from './starred'

export const STATUS_KEY = 'am-status'
const EVENT = 'am-status-changed'
const STAR_EVENT = 'am-star-changed'

export const WORKFLOW = [
  { id: 'interested', label: '관심', cls: 'w-int' },
  { id: 'in_progress', label: '과제중', cls: 'w-prog' },
  { id: 'submitted', label: '제출완료', cls: 'w-done' },
]

export const WORKFLOW_LABEL = Object.fromEntries(WORKFLOW.map((s) => [s.id, s.label]))
export const WORKFLOW_CLS = Object.fromEntries(WORKFLOW.map((s) => [s.id, s.cls]))

function readMap() {
  try {
    const v = JSON.parse(localStorage.getItem(STATUS_KEY) || '{}')
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
    const out = {}
    for (const [k, val] of Object.entries(v)) {
      if (typeof k === 'string' && (val === 'in_progress' || val === 'submitted')) out[k] = val
    }
    return out
  } catch { return {} }
}

function writeMap(map) {
  try { localStorage.setItem(STATUS_KEY, JSON.stringify(map)) } catch { /* 사생활 모드 */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT))
}

// 상태 지도 — 별표를 interested 로 합쳐서 읽는다 (이 파일 밖은 이 모양만 본다)
export function getStatuses() {
  const map = readMap()
  const out = { ...map }
  for (const id of getStarred()) if (!out[id]) out[id] = 'interested'
  return out
}

export function statusOf(id) {
  const map = readMap()
  if (map[id]) return map[id]
  return getStarred().includes(id) ? 'interested' : ''
}

// 상태 전환. '' 이면 해제. 관심은 별표로 대신 표현한다.
export function setStatus(id, next) {
  if (!id) return ''
  const map = readMap()
  const starred = getStarred()

  if (next === 'interested') {
    delete map[id]
    writeMap(map)
    if (!starred.includes(id)) setStarred([...starred, id])
    return 'interested'
  }

  if (next === '') {
    delete map[id]
    writeMap(map)
    if (starred.includes(id)) setStarred(starred.filter((x) => x !== id))
    return ''
  }

  if (next !== 'in_progress' && next !== 'submitted') return statusOf(id)
  map[id] = next
  writeMap(map)
  return next
}

// 표 행의 배지 클릭용 — 관심 → 과제중 → 제출완료 → 해제 순환
export function nextStatus(cur) {
  const i = WORKFLOW.findIndex((s) => s.id === cur)
  return i < 0 ? 'interested' : i === WORKFLOW.length - 1 ? '' : WORKFLOW[i + 1].id
}

// 컴포넌트 훅: 다른 탭·다른 컴포넌트의 변경까지 같은 화면에서 다시 그린다
export function useStatuses() {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const sync = () => setTick((t) => t + 1)
    window.addEventListener(EVENT, sync)
    window.addEventListener(STAR_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(EVENT, sync)
      window.removeEventListener(STAR_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])
  void tick // 저장소를 읽는 신호일 뿐 값 자체는 쓰지 않는다
  const statuses = getStatuses()
  return {
    statuses,
    statusOf: (id) => statuses[id] || '',
    setStatus,
  }
}
