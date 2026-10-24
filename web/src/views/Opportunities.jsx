import { useMemo, useState } from 'react'

const POLICY_FILTERS = [
  { id: 'all', label: '전체 정책' },
  { id: 'required', label: '필수', cls: 'p-req' },
  { id: 'allowed_graded', label: '허용+채점', cls: 'p-ai' },
  { id: 'allowed', label: '허용', cls: 'p-ok' },
  { id: 'unspecified', label: '미언급/확인필요', cls: 'p-rev' },
]
const STATUS_FILTERS = [
  { id: 'open', label: '진행중' },
  { id: 'all', label: '전체 상태' },
]

export default function Opportunities({ rows, type, q }) {
  const [policy, setPolicy] = useState('all')
  const [status, setStatus] = useState('open')
  const [openRow, setOpenRow] = useState(null)

  const typeMatch = useMemo(() => {
    if (type === 'all') return () => true
    if (type === 'postings') return (r) => r.kind === 'posting'
    const label = { hackathon: '해커톤', competition: '대회', contest: '공모전' }[type]
    return (r) => r.type === label
  }, [type])

  const filtered = useMemo(() => {
    const ql = (q || '').trim().toLowerCase()
    return rows.filter((r) => {
      if (!typeMatch(r)) return false
      if (status === 'open' && !r.open) return false
      if (policy === 'required' && r.policyKey !== 'required') return false
      if (policy === 'allowed_graded' && r.policyKey !== 'allowed_graded') return false
      if (policy === 'allowed' && r.policyKey !== 'allowed') return false
      if (policy === 'unspecified' && !['unspecified', 'unknown'].includes(r.policyKey)) return false
      if (ql && !(`${r.name} ${r.sub} ${r.title} ${r.evidence}`.toLowerCase().includes(ql))) return false
      return true
    })
  }, [rows, typeMatch, policy, status, q])

  return (
    <>
      <div className="fr">
        <span className="fl">AI 정책</span>
        {POLICY_FILTERS.map((f) => (
          <button key={f.id} className={`fopt ${f.cls || ''}` + (policy === f.id ? ' on' : '')}
            onClick={() => setPolicy(f.id)}>{f.label}</button>
        ))}
        <span className="fl">상태</span>
        {STATUS_FILTERS.map((f) => (
          <button key={f.id} className="fopt" onClick={() => setStatus(f.id)}
            style={status === f.id ? { color: 'var(--fg-hi)', background: '#11151C' } : undefined}>{f.label}</button>
        ))}
      </div>
      <div className="twrap">
        <table>
          <thead>
            <tr>
              <th>기업 / 이벤트명</th><th>유형</th><th>대상 / 주최</th>
              <th>AI 정책</th><th>근거</th><th className="r">마감</th><th className="r">확인</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="empty">조건에 맞는 항목이 없습니다</td></tr>
            )}
            {filtered.map((r, i) => (
              <Row key={r.id} r={r} zebra={i % 2 === 1}
                expanded={openRow === r.id}
                onToggle={() => setOpenRow(openRow === r.id ? null : r.id)} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function Row({ r, zebra, expanded, onToggle }) {
  const isNew = r.first && r.first >= new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10)
  const ddCls = r.dd === null ? 'dd pass' : r.dd < 0 ? 'dd pass' : r.dd <= 3 ? 'dd hot' : 'dd'
  return (
    <>
      <tr className={`row${zebra ? ' z' : ''}`} onClick={onToggle}>
        <td>
          <span className="co">{r.kind === 'posting' ? r.name : r.name}</span>
          {r.hiring && <span className="new">채용연계</span>}
          {isNew && <span className="new">NEW</span>}
        </td>
        <td className="typ">{r.type}</td>
        <td className="typ">{r.sub}</td>
        <td><span className={`pol ${r.policy.cls}`}><i aria-hidden="true"></i>{r.policy.label}</span></td>
        <td className="typ" style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {r.evidence}
        </td>
        <td className={ddCls}>{r.open ? r.ddText || ddTextOf(r) : '종결'}</td>
        <td className="chk">{r.checked || r.first || ''}</td>
      </tr>
      {expanded && (
        <tr className="hx">
          <td colSpan={7}>
            <div className="in">
              {(r.history || []).length === 0 && <div className="ln">이력 없음</div>}
              {(r.history || []).map((h, i) => (
                <div className="ln" key={i}>
                  <span className="d">{(h.date || '').slice(5)}</span>
                  <span className="ev">{histLabel(h.event)}</span>
                  {h.from && h.to ? ` ${h.from} → ${h.to}` : ''}
                  {h.ai_policy && !h.from ? ` (${h.ai_policy})` : ''}
                  {h.status && h.event === 'created' ? ` (${h.status})` : ''}
                  {h.evidence ? <span className="q"> | "${h.evidence}"</span> : ''}
                </div>
              ))}
              {r.url && <div className="ln"><a href={r.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>원문 열기</a></div>}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
function ddTextOf(r) {
  if (r.dd === null) return '상시'
  if (r.dd < 0) return '마감'
  return 'D-' + r.dd
}
function histLabel(ev) {
  return {
    created: '발견', policy_changed: '정책 변경', deadline_changed: '마감 변경',
    deadline_extended: '마감 연장', status_changed: '상태 변경', hiring_link_changed: '채용연계 변경',
  }[ev] || ev
}
