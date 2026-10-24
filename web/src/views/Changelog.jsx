import { runs } from '../lib/data'

const SITELOG = [
  { date: '2026-10-24', text: '카드를 죽이고 표를 주인으로 앉혔다. 이제 모든 컬럼이 정렬을 듣는다. j/k로 행을 걷는 것도 된다 — k9s에서 훔쳤다.' },
  { date: '2026-10-24', text: 'NEW와 채용연계 배지를 amber로 옮겼다. 빨강은 정책 이야기에만 쓴다 — 블룸버그가 그렇게 산 지 40년쯤 됐다.' },
  { date: '2026-10-24', text: '마감이 3일 안으로 굴러들어오면 행이 저절로 붉어진다. 놓치지 말라고.' },
]

export default function Changelog() {
  return (
    <div className="sec">
      <h2>사이트 변경 이력</h2>
      {SITELOG.map((s, i) => (
        <div className="cl-it" key={'site' + i}>
          <span className="d">{s.date}</span>
          <span className="s">{s.text}</span>
        </div>
      ))}
      <h2 style={{ marginTop: 18 }}>수집 변경 로그 (일별 diff)</h2>
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
