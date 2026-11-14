import { progressFor, progressPct, useChecks } from '../lib/guideProgress'

// 공략 체크리스트 완료율 — 행·아코디언·상세 패널이 같은 숫자를 본다.
// hideEmpty면 아직 아무것도 체크하지 않은 행에서 자리를 차지하지 않는다.
export default function GuideProgressBadge({ r, hideEmpty = false, full = false, className = '' }) {
  const checks = useChecks()
  const p = progressFor(r, checks)
  if (!p.total) return null
  if (hideEmpty && p.done === 0 && !full) return null
  const pct = progressPct(p)
  const text = `체크 ${p.done}/${p.total}`
  return (
    <span className={'gp-prog ' + className} title={`${p.guide.label} 체크리스트 ${p.done}/${p.total} 완료 (${pct}%)`}>
      {text}
      {full && (
        <span className="gp-prog-bar" aria-hidden="true">
          <i style={{ width: `${pct}%` }} />
        </span>
      )}
    </span>
  )
}
