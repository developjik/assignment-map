import { useEffect, useMemo, useRef, useState } from 'react'
import { POLICY_LABEL } from '../lib/labels'

// 상단 마감 임박 롤링 티커 — 진행중이면서 마감일이 살아 있는 행만 모은다.
const HOT_DAYS = 3 // 1차 창: D-3 이내
const NEAR_DAYS = 7 // 건수가 적을 때 보충하는 창
const MIN_ITEMS = 5
const MAX_ITEMS = 7
const ROTATE_MS = 3800

const byDday = (a, b) => a.dd - b.dd || a.name.localeCompare(b.name, 'ko')

function Arrow({ dir }) {
  // 이모지 대신 인라인 SVG — 폰트 의존 없이 모노크롬 유지
  return (
    <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true" focusable="false">
      <path d={dir === 'prev' ? 'M6.6 1.4L3 5l3.6 3.6' : 'M3.4 1.4L7 5 3.4 8.6'}
        fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  )
}

export default function DeadlineTicker({ rows, onPick }) {
  const { items, hotCount, openCount } = useMemo(() => {
    const live = rows.filter((r) => r.open && r.dd !== null && r.dd >= 0)
    const hot = live.filter((r) => r.dd <= HOT_DAYS).sort(byDday)
    const near = live.filter((r) => r.dd > HOT_DAYS && r.dd <= NEAR_DAYS).sort(byDday)
    const list = hot.slice(0, MAX_ITEMS)
    if (list.length < MIN_ITEMS) list.push(...near.slice(0, MAX_ITEMS - list.length))
    return { items: list, hotCount: hot.length, openCount: rows.filter((r) => r.open).length }
  }, [rows])

  const [idx, setIdx] = useState(0)
  const [paused, setPaused] = useState(false)
  const boxRef = useRef(null)

  // 목록이 바뀌면(필터·수집) 첫 항목으로
  useEffect(() => { setIdx(0) }, [items])

  // 자동 회전 — 모션 감소 설정이면 돌리지 않는다 (수동 prev/next는 그대로)
  useEffect(() => {
    if (items.length < 2 || paused) return
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const t = setInterval(() => setIdx((v) => (v + 1) % items.length), ROTATE_MS)
    return () => clearInterval(t)
  }, [items.length, paused])

  const step = (d) => setIdx((v) => (v + d + items.length) % items.length)

  if (!items.length) {
    return (
      <div className="dl" role="status">
        <span className="dl-badge quiet">[마감 임박]</span>
        <span className="dl-empty">D-7 이내 마감 없음 | 진행중 {openCount}건</span>
      </div>
    )
  }

  const r = items[idx]
  const ddText = r.dd === 0 ? 'D-0 오늘' : `D-${r.dd}`

  return (
    <div
      className="dl"
      aria-label={`마감 임박 티커, D-3 이내 ${hotCount}건 중 ${idx + 1}건째`}
      ref={boxRef}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setPaused(false) }}
    >
      <span className="dl-badge">[마감 임박]</span>
      <span className="dl-cnt">D-{HOT_DAYS} <b>{hotCount}</b>건</span>
      <button
        type="button"
        className="dl-it"
        key={r.id}
        onClick={() => onPick && onPick(r)}
        title={r.url ? `${r.name} | 원문 링크로 이동` : `${r.name} | 검색으로 좁혀 보기`}
      >
        <span className="dl-nm">{r.name}</span>
        <span className="dl-typ">{r.kind === 'posting' ? '채용' : r.type}</span>
        <span className={'pol ' + r.policy.cls}><i aria-hidden="true"></i>{POLICY_LABEL[r.policyKey] || r.policy.label}</span>
        <span className="dl-dd">{ddText}</span>
      </button>
      <span className="dl-pos">{idx + 1}/{items.length}</span>
      <span className="dl-nav">
        <button type="button" className="dl-btn" onClick={() => step(-1)} aria-label="이전 마감 항목">
          <Arrow dir="prev" />
        </button>
        <button type="button" className="dl-btn" onClick={() => step(1)} aria-label="다음 마감 항목">
          <Arrow dir="next" />
        </button>
      </span>
    </div>
  )
}
