import { WORKFLOW, useStatuses } from '../lib/statuses'

// 지원 상태 전환 — 상세 패널(데스크톱)과 아코디언(모바일)이 같은 버튼 묶음을 쓴다.
// 한 번 더 누르면 해제라서 되돌리기 버튼을 따로 두지 않는다.
export default function StatusPicker({ id, label = '지원 상태' }) {
  const { statusOf, setStatus } = useStatuses()
  const cur = statusOf(id)
  return (
    <span className="sp" role="group" aria-label={label}>
      {WORKFLOW.map((s) => (
        <button key={s.id} type="button" className={`sp-b ${s.cls}` + (cur === s.id ? ' on' : '')}
          aria-pressed={cur === s.id}
          title={cur === s.id ? `${s.label} 해제` : `${s.label}로 표시`}
          onClick={() => setStatus(id, cur === s.id ? '' : s.id)}>{s.label}</button>
      ))}
      <span className="sp-cur" aria-live="polite">{cur ? '' : '미설정'}</span>
    </span>
  )
}
