import { useEffect, useMemo, useRef, useState } from 'react'
import { commit, meta } from '../lib/data'

// 단일 어휘 맵 — 버튼·표시·정렬·방법론이 여기서만 나간다 (이슈 #3)
export const POLICY_LABEL = { required: '필수', allowed_graded: '허용+채점', allowed: '허용', banned: '금지', unspecified: '미언급', unknown: '확인필요' }
export const STATUS_LABEL = { open: '모집중', upcoming: '예정', judging: '심사중', closed: '종결', gone: '소멸', no_hiring: '미실시' }
const POLICY_FILTERS = [
  { id: 'all', label: '전체 정책' },
  { id: 'required', label: POLICY_LABEL.required, cls: 'p-req' },
  { id: 'allowed_graded', label: POLICY_LABEL.allowed_graded, cls: 'p-ai' },
  { id: 'allowed', label: POLICY_LABEL.allowed, cls: 'p-ok' },
  { id: 'unspecified', label: '미언급/확인필요', cls: 'p-rev' },
]
const STATUS_FILTERS = [
  { id: 'open', label: '진행중' },
  { id: 'all', label: '전체 상태' },
]
const POLICY_RANK = { required: 4, allowed_graded: 3, allowed: 2, banned: 1, unspecified: 0, unknown: 0 }
const COLS = [
  { id: 'name', label: '기업 / 이벤트명' },
  { id: 'type', label: '유형' },
  { id: 'sub', label: '대상 / 주최' },
  { id: 'policy', label: 'AI 정책' },
  { id: 'evidence', label: '근거', nosort: true },
  { id: 'deadline', label: '마감 (D-day)' },
  { id: 'checked', label: '확인' },
]
// em dash → 구분자 치환 (AI티 문안 이슈 #15)
const disp = (s) => (s || '').replace(/—/g, '-').replace(/\s+·\s+/g, ' | ')

const relDays = (dateStr) => {
  if (!dateStr) return null
  const d = Math.round((Date.now() - new Date(dateStr + 'T03:00:00+09:00').getTime()) / 864e5)
  if (d <= 0) return '오늘'; if (d === 1) return '어제'
  return d + '일 전'
}

function Hl({ text, q }) {
  const t = text || ''
  const ql = (q || '').trim().toLowerCase()
  if (!ql) return t
  const i = t.toLowerCase().indexOf(ql)
  if (i < 0) return t
  return <>{t.slice(0, i)}<span className="hl">{t.slice(i, i + ql.length)}</span>{t.slice(i + ql.length)}</>
}

export default function Opportunities({ rows, type, q, setQ, onVisit }) {
  const [policy, setPolicy] = useState('all')
  const [status, setStatus] = useState('open')
  const [openRow, setOpenRow] = useState(null)
  const [sort, setSort] = useState(null)
  const [cur, setCur] = useState(0)
  const [density, setDensity] = useState(() => localStorage.getItem('am-density') || 'standard')
  const curRef = useRef(null)

  useEffect(() => { document.documentElement.dataset.density = density }, [density])
  useEffect(() => { localStorage.setItem('am-density', density) }, [density])

  const typeMatch = useMemo(() => {
    if (type === 'all') return () => true
    if (type === 'postings') return (r) => r.kind === 'posting'
    const label = { hackathon: '해커톤', competition: '대회', contest: '공모전' }[type]
    return (r) => r.type === label
  }, [type])

  const { filtered, totalNoStatus } = useMemo(() => {
    const ql = (q || '').trim().toLowerCase()
    const base = (r) => {
      if (!typeMatch(r)) return false
      if (policy === 'required' && r.policyKey !== 'required') return false
      if (policy === 'allowed_graded' && r.policyKey !== 'allowed_graded') return false
      if (policy === 'allowed' && r.policyKey !== 'allowed') return false
      if (policy === 'unspecified' && !['unspecified', 'unknown'].includes(r.policyKey)) return false
      if (ql && !(`${r.name} ${r.sub} ${r.title} ${r.evidence}`.toLowerCase().includes(ql))) return false
      return true
    }
    const noStatus = rows.filter(base)
    const out = noStatus.filter((r) => status === 'all' || r.open)
    const cmp = {
      name: (a, b) => a.name.localeCompare(b.name, 'ko'),
      type: (a, b) => a.type.localeCompare(b.type, 'ko'),
      sub: (a, b) => (a.sub || '').localeCompare(b.sub || '', 'ko'),
      policy: (a, b) => (POLICY_RANK[a.policyKey] || 0) - (POLICY_RANK[b.policyKey] || 0),
      deadline: (a, b) => (a.dd === null) - (b.dd === null) || (a.dd ?? 0) - (b.dd ?? 0),
      checked: (a, b) => (a.checked || '').localeCompare(b.checked || ''),
    }
    if (sort && cmp[sort.key]) out.sort((a, b) => cmp[sort.key](a, b) * sort.dir)
    else out.sort((a, b) => (a.open === b.open ? 0 : a.open ? -1 : 1) || ((a.dd === null) - (b.dd === null)) || ((a.dd ?? 0) - (b.dd ?? 0)))
    return { filtered: out, totalNoStatus: noStatus.length }
  }, [rows, typeMatch, policy, status, q, sort])

  const sortMsg = sort ? `${COLS.find(c => c.id === sort.key)?.label} ${sort.dir === 1 ? '오름차순' : '내림차순'} 정렬, ${filtered.length}건` : ''

  useEffect(() => {
    const onKey = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return
      if (e.key === 'j') setCur(c => Math.min(c + 1, filtered.length - 1))
      else if (e.key === 'k') setCur(c => Math.max(c - 1, 0))
      else if (e.key === 'Enter') {
        const r = filtered[cur]
        if (r) { setOpenRow(o => (o === r.id ? null : r.id)); onVisit && onVisit(r) }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [filtered, cur, onVisit])

  // 커서 추적 — 뷰포트 벗어나면 스크롤 (이슈 #2)
  useEffect(() => { curRef.current?.scrollIntoView({ block: 'nearest' }) }, [cur, filtered])

  useEffect(() => { setCur(0) }, [type, policy, status, q])

  const resetFilters = () => { setPolicy('all'); setStatus('open'); setSort(null); setQ('') }
  const clickSort = (key) => {
    if (!sort || sort.key !== key) setSort({ key, dir: 1 })
    else if (sort.dir === 1) setSort({ key, dir: -1 })
    else setSort(null)
  }

  return (
    <>
      <div className="ctxbar" role="status">
        <span className="ok"><i aria-hidden="true"></i>수집 <b>{meta.last_run || '-'}</b> 03:00 KST</span>
        <span>commit <b>{commit}</b></span>
        <span>골든케이스 <b>6/6</b></span>
        <span>다음 수집 <b>{meta.last_run ? nextRun(meta.last_run) : '예정'}</b></span>
      </div>
      <div className="fr">
        <span className="fl">AI 정책</span>
        {POLICY_FILTERS.map((f) => (
          <button key={f.id} className={`fopt ${f.cls || ''}` + (policy === f.id ? ' on' : '')} aria-pressed={policy === f.id}
            onClick={() => setPolicy(f.id)}>{f.label}</button>
        ))}
        <span className="fl">상태</span>
        {STATUS_FILTERS.map((f) => (
          <button key={f.id} className={'fopt' + (status === f.id ? ' on' : '')} aria-pressed={status === f.id}
            onClick={() => setStatus(f.id)}>{f.label}</button>
        ))}
        <span className="dens" role="group" aria-label="행 밀도">
          <button className={density === 'compact' ? 'on' : ''} onClick={() => setDensity('compact')} title="컴팩트">compact</button>
          <button className={density === 'standard' ? 'on' : ''} onClick={() => setDensity('standard')} title="표준">standard</button>
        </span>
        <button className="fopt" onClick={resetFilters} style={{ marginLeft: 8, textDecoration: 'underline', textUnderlineOffset: 3 }}>초기화</button>
        <span className="match-n">{status === 'open'
          ? <>진행중 <b>{filtered.length}</b> / 전체 <b>{totalNoStatus}</b></>
          : <>매칭 <b>{filtered.length}</b>건</>}</span>
        <div className="sr" aria-live="polite">{sortMsg}</div>
      </div>
      <div className="twrap tscroll">
        <table>
          <colgroup>
            <col style={{ width: '21%' }} /><col style={{ width: '6%' }} /><col style={{ width: '17%' }} />
            <col style={{ width: '11%' }} /><col style={{ width: '26%' }} /><col style={{ width: '10%' }} /><col style={{ width: '9%' }} />
          </colgroup>
          <thead>
            <tr>
              {COLS.map((c) => (
                <th key={c.id} data-col={c.id} className={c.id === 'deadline' || c.id === 'checked' ? 'r' : ''}
                  aria-sort={sort && sort.key === c.id ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
                  {c.nosort ? c.label : (
                    <button className="sort" onClick={() => clickSort(c.id)}>
                      {c.label}
                      {sort && sort.key === c.id && <span className="dir" aria-hidden="true">{sort.dir === 1 ? '▴' : '▾'}</span>}
                    </button>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={7}>
                <div className="empty-id">
                  <div className="l1">지금 이 조건에 걸리는 기회가 없을 뿐이다.</div>
                  <div className="l2">Esc 또는 초기화로 조건을 풀고, 매일 03:00 KST에 다시 수집한다.</div>
                </div>
              </td></tr>
            )}
            {filtered.map((r, i) => (
              <Row key={r.id} r={r} q={q} zebra={i % 2 === 1} idx={i} curIdx={cur} setCur={setCur} curRef={curRef}
                expanded={openRow === r.id}
                onToggle={() => { setOpenRow(openRow === r.id ? null : r.id); onVisit && onVisit(r) }} />
            ))}
          </tbody>
        </table>
      </div>
      <div className="keybar" aria-hidden="true">
        <span><span className="kbd">j</span><span className="kbd">k</span>행 이동</span>
        <span><span className="kbd">Enter</span>상세 확장</span>
        <span><span className="kbd">/</span>검색</span>
        <span><span className="kbd">Esc</span>검색 해제</span>
      </div>
    </>
  )
}

function nextRun(last) {
  const d = new Date(last + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

function Row({ r, q, zebra, idx, curIdx, setCur, curRef, expanded, onToggle }) {
  const isNew = r.first && r.first >= new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10)
  const hot = r.open && r.dd !== null && r.dd >= 0 && r.dd <= 3
  const ddCls = r.dd === null ? 'dd pass' : r.dd < 0 ? 'dd pass' : r.dd <= 3 ? 'dd hot' : 'dd'
  const ddText = !r.open ? '종결' : r.dd === null ? '상시' : r.dd < 0 ? '마감' : `D-${r.dd} (${(r.deadline || '').slice(5)})`
  const cls = ['row', zebra && !hot ? 'z' : '', hot ? 'hot' : '', idx === curIdx ? 'cur' : ''].filter(Boolean).join(' ')
  return (
    <>
      <tr className={cls} ref={idx === curIdx ? curRef : undefined} aria-selected={idx === curIdx}
        onClick={(e) => { setCur(idx); onToggle() }}>
        <td className="c-name" data-col="name">
          <span className="co" title={r.name}><Hl text={r.name} q={q} /></span>
          {r.hiring && <span className="badge">채용연계</span>}
          {isNew && <span className="badge">NEW</span>}
        </td>
        <td className="typ" data-col="type"><Hl text={r.type} q={q} /></td>
        <td className="typ c-sub" data-col="sub" title={r.sub}><Hl text={r.sub} q={q} /></td>
        <td data-col="policy"><span className={`pol ${r.policy.cls}`}><i aria-hidden="true"></i>{POLICY_LABEL[r.policyKey] || r.policy.label}</span></td>
        <td className="typ" data-col="evidence" title={r.evidence} style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {disp(r.evidence)}
        </td>
        <td className={ddCls} data-col="deadline">{ddText}</td>
        <td className="chk" data-col="checked">{r.checked ? `${r.checked.slice(5)} (${relDays(r.checked)})` : ''}</td>
      </tr>
      {expanded && (
        <tr className="hx">
          <td colSpan={7}>
            <div className="in">
              <div className="ln"><span className="d">{r.first || ''}</span>발견 | <span className="q">{disp(r.evidence)}</span></div>
              <div className="ln">대상/주최: <span className="q">{r.sub || '-'}</span></div>
              <div className="ln">마감: <span className="q">{r.deadline ? `${r.deadline} (${ddText})` : '상시/미정'}</span> | 유형: <span className="q">{r.type}</span></div>
              {(r.history || []).filter(h => h.event !== 'created').map((h, i) => (
                <div className="ln" key={i}>
                  <span className="d">{h.date}</span>
                  <span className="ev">{histLabel(h.event)}</span>
                  {h.from && h.to ? ` ${labelOf(h.from)} → ${labelOf(h.to)}` : ''}
                  {h.evidence ? <span className="q"> | "{disp(h.evidence)}"</span> : ''}
                </div>
              ))}
              <div className="ln">
                {r.url
                  ? <a href={r.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>원문 열기</a>
                  : <span className="src">원문 미확보 (수집 {r.first || r.checked || '-'})</span>}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
const labelOf = (v) => POLICY_LABEL[v] || STATUS_LABEL[v] || v
function histLabel(ev) {
  return { created: '발견', policy_changed: '정책 변경', deadline_changed: '마감 변경', deadline_extended: '마감 연장', status_changed: '상태 변경', hiring_link_changed: '채용연계 변경' }[ev] || ev
}
