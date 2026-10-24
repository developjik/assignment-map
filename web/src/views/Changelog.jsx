import { runs } from '../lib/data'
export default function Changelog() {
  return (
    <div className="sec">
      <h2>변경 로그 (일별 수집 diff)</h2>
      {runs.map((r, i) => (
        <div className="cl-it" key={r.date + i}>
          <span className="d">{r.date}</span>
          <span className="s">{r.summary}</span>
          {r.policy_changed && r.policy_changed.length > 0 && (
            <div className="s" style={{ color: 'var(--yellow)' }}>정책 변경: {r.policy_changed.join(', ')}</div>
          )}
          {r.new_events && r.new_events.length > 0 && (
            <div className="s" style={{ color: 'var(--faint)' }}>신규 이벤트: {r.new_events.join(', ')}</div>
          )}
          {r.notes && <div className="s" style={{ color: 'var(--faint)', marginTop: 2 }}>{r.notes.slice(0, 300)}{r.notes.length > 300 ? '...' : ''}</div>}
        </div>
      ))}
    </div>
  )
}
