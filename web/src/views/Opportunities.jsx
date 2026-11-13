import { useEffect, useMemo, useRef, useState } from 'react'
import { meta, policyChangeByID, stats, sparkPoints } from '../lib/data'
import { POLICY_LABEL, STATUS_LABEL, disp } from '../lib/labels'
import { downloadIcs, downloadStarredIcs } from '../lib/ics'
import { filtersFromHash, readHash, writeHash, filterPatch } from '../lib/hash'
import { useStarred } from '../lib/starred'
import Ticker from '../components/Ticker'
import DeadlineTicker from '../components/DeadlineTicker'
import DetailPane from '../components/DetailPane'
import GuidePane from '../components/GuidePane'
import ShortcutsHelp from '../components/ShortcutsHelp'
const POLICY_FILTERS = [
  { id: 'all', label: '전체 정책' },
  { id: 'required', label: 'AI 필수', cls: 'p-req' },
  { id: 'allowed_graded', label: '허용+채점', cls: 'p-ai' },
  { id: 'allowed', label: 'AI 허용', cls: 'p-ok' },
  { id: 'unspecified', label: '미언급/확인필요', cls: 'p-rev' },
]
const STATUS_FILTERS = [
  { id: 'open', label: '진행중' },
  { id: 'all', label: '전체 상태' },
]
const SORT_MODES = [
  { id: 'dday', label: '마감 임박' },
  { id: 'latest', label: '최신 등록' },
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
// 우측 상세 패널을 붙이는 폭 — 7컬럼 표와 384px 패널이 같이 설 수 있는 최소 데스크톱
const WIDE_QUERY = '(min-width: 1200px)'

const relDays = (dateStr) => {
  if (!dateStr) return null
  const d = Math.round((Date.now() - new Date(dateStr + 'T03:00:00+09:00').getTime()) / 864e5)
  if (d <= 0) return '오늘'; if (d === 1) return '어제'
  return d + '일 전'
}

// 별표 아이콘 — 이모지 문자 대신 인라인 SVG (모노크롬 유지, 폰트 의존 없음)
function StarIcon({ filled }) {
  return (
    <svg className="star-ico" width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M12 2.6l2.95 6.1 6.7.9-4.85 4.7 1.2 6.65L12 17.8l-6 3.15 1.2-6.65L2.35 9.6l6.7-.9z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function Hl({ text, q }) {
  const t = text || ''
  const ql = (q || '').trim().toLowerCase()
  if (!ql || /\s/.test(ql)) return t
  const i = t.toLowerCase().indexOf(ql)
  if (i < 0) return t
  return <>{t.slice(0, i)}<span className="hl">{t.slice(i, i + ql.length)}</span>{t.slice(i + ql.length)}</>
}

// 미디어 쿼리 구독 — 좁은 화면은 아코디언, 넓은 화면은 2-Pane 으로 갈린다
function useWide(query) {
  const [wide, setWide] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia(query)
    const on = () => setWide(mq.matches)
    on()
    if (mq.addEventListener) mq.addEventListener('change', on)
    else if (mq.addListener) mq.addListener(on)
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', on)
      else if (mq.removeListener) mq.removeListener(on)
    }
  }, [query])
  return wide
}

export default function Opportunities({ rows, type, q, setQ, onVisit }) {
  // 첫 진입 필터는 URL 해시에서 (딥링크: #t=postings&policy=required&jobfam=fe)
  const initial = useMemo(() => filtersFromHash(readHash()), [])
  const [policy, setPolicy] = useState(initial.policy)
  const [jobfam, setJobfam] = useState(initial.jobfam)
  const [status, setStatus] = useState(initial.status)
  const [hiringOnly, setHiringOnly] = useState(initial.hiringOnly)
  const [changedOnly, setChangedOnly] = useState(initial.changedOnly)
  const [starredOnly, setStarredOnly] = useState(initial.starredOnly)
  const [starredIds, toggleStar] = useStarred()
  const [sortMode, setSortMode] = useState('dday')
  const [openRow, setOpenRow] = useState(null)
  const [pane, setPane] = useState(false)
  const [sort, setSort] = useState(null)
  const [cur, setCur] = useState(0)
  const [density, setDensity] = useState(() => localStorage.getItem('am-density') || 'standard')
  const [help, setHelp] = useState(false)
  const [notice, setNotice] = useState('')
  const curRef = useRef(null)
  const noticeTimer = useRef(null)
  // Esc 로 패널을 닫은 뒤에는 j/k 만으로 다시 열지 않는다 (Enter·클릭은 다시 연다)
  const paneMuted = useRef(false)
  const wide = useWide(WIDE_QUERY)

  useEffect(() => { document.documentElement.dataset.density = density }, [density])
  useEffect(() => { localStorage.setItem('am-density', density) }, [density])

  // 필터 상태를 URL 해시에 반영 (탭·검색어 키는 App이 쓰므로 건드리지 않는다)
  useEffect(() => {
    writeHash(filterPatch({ policy, jobfam, status, hiringOnly, changedOnly, starredOnly }))
  }, [policy, jobfam, status, hiringOnly, changedOnly, starredOnly])

  // 같은 탭에서 해시만 바뀌면(링크 붙여넣기, 뒤로/앞으로) 상태를 다시 맞춘다
  useEffect(() => {
    const onHash = () => {
      const f = filtersFromHash(readHash())
      setPolicy(f.policy); setJobfam(f.jobfam); setStatus(f.status)
      setHiringOnly(f.hiringOnly); setChangedOnly(f.changedOnly); setStarredOnly(f.starredOnly)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const typeMatch = useMemo(() => {
    if (type === 'all') return () => true
    if (type === 'postings') return (r) => r.kind === 'posting'
    if (type === 'meetup') return (r) => ['밋업', '컨퍼런스', '워크샵'].includes(r.type)
    const label = { hackathon: '해커톤', competition: '대회', contest: '공모전' }[type]
    return (r) => r.type === label
  }, [type])

  const starredSet = useMemo(() => new Set(starredIds), [starredIds])
  const starredRows = useMemo(() => rows.filter((r) => starredSet.has(r.id)), [rows, starredSet])

  const { filtered, totalNoStatus } = useMemo(() => {
    const tokens = (q || '').trim().toLowerCase().split(/\s+/).filter(Boolean)
    const base = (r) => {
      if (!typeMatch(r)) return false
      if (starredOnly && !starredSet.has(r.id)) return false
      if (jobfam === 'fe' && r.kind === 'posting' && !(r.positions || []).includes('frontend')) return false
      if (policy === 'required' && r.policyKey !== 'required') return false
      if (policy === 'allowed_graded' && r.policyKey !== 'allowed_graded') return false
      if (policy === 'allowed' && r.policyKey !== 'allowed') return false
      if (policy === 'unspecified' && !['unspecified', 'unknown'].includes(r.policyKey)) return false
      if (hiringOnly && !r.hiring) return false
      if (changedOnly && !policyChangeByID.has(r.id)) return false
      // 공백으로 나눈 토큰 AND — 제목·기업/주최·상금·기술 스택을 한 인덱스에서 찾는다
      if (tokens.length && !tokens.every((t) => r.hay.includes(t))) return false
      return true
    }
    const noStatus = rows.filter(base)
    const out = noStatus.filter((r) => status === 'all' || r.open)
    const openFirst = (a, b) => (a.open === b.open ? 0 : a.open ? -1 : 1)
    // 마감 임박: 살아있는 마감(0 이상) → 이미 지난 마감 → 상시 순. 진행중 상태로 남은 지난 마감이 맨 위를 차지하지 않게 한다.
    const ddayKey = (r) => (r.dd === null ? 1e9 : r.dd < 0 ? 1e6 - r.dd : r.dd)
    const byDday = (a, b) => ddayKey(a) - ddayKey(b)
    const byLatest = (a, b) => (b.first || '').localeCompare(a.first || '') || (b.checked || '').localeCompare(a.checked || '')
    const cmp = {
      name: (a, b) => a.name.localeCompare(b.name, 'ko'),
      type: (a, b) => a.type.localeCompare(b.type, 'ko'),
      sub: (a, b) => (a.sub || '').localeCompare(b.sub || '', 'ko'),
      policy: (a, b) => (POLICY_RANK[a.policyKey] || 0) - (POLICY_RANK[b.policyKey] || 0),
      deadline: (a, b) => (a.dd === null) - (b.dd === null) || (a.dd ?? 0) - (b.dd ?? 0),
      checked: (a, b) => (a.checked || '').localeCompare(b.checked || ''),
    }
    if (sort && cmp[sort.key]) out.sort((a, b) => cmp[sort.key](a, b) * sort.dir)
    else if (sortMode === 'latest') out.sort((a, b) => openFirst(a, b) || byLatest(a, b) || byDday(a, b))
    else out.sort((a, b) => openFirst(a, b) || byDday(a, b))
    return { filtered: out, totalNoStatus: noStatus.length }
  }, [rows, typeMatch, jobfam, policy, status, hiringOnly, changedOnly, starredOnly, starredSet, q, sort, sortMode])

  const sortMsg = sort
    ? `${COLS.find(c => c.id === sort.key)?.label} ${sort.dir === 1 ? '오름차순' : '내림차순'} 정렬, ${filtered.length}건`
    : `${SORT_MODES.find(s => s.id === sortMode)?.label} 정렬, ${filtered.length}건`

  // 잠깐 뜨는 안내 (원문 링크가 없는 행에서 o 를 눌렀을 때 등) — 스크린리더에도 읽힌다
  const flash = (msg) => {
    setNotice(msg)
    clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => setNotice(''), 2600)
  }

  // 행 선택 — 넓은 화면은 우측 패널, 좁은 화면은 아코디언
  const pickRow = (i, r) => {
    setCur(i)
    onVisit && onVisit(r)
    if (wide) {
      paneMuted.current = false
      setPane((open) => (open && i === cur ? false : true))
    } else {
      setOpenRow((o) => (o === r.id ? null : r.id))
    }
  }

  const pickDeadline = (r) => {
    setQ(r.name)
    setCur(0)
    onVisit && onVisit(r)
    if (wide) { paneMuted.current = false; setPane(true) }
    else setOpenRow(r.id)
  }

  useEffect(() => {
    const onKey = (e) => {
      const el = document.activeElement
      const typing = el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)

      // 도움말이 열려 있으면 닫기 키만 받는다
      if (help) {
        if (e.key === 'Escape' || e.key === '?') { e.preventDefault(); setHelp(false) }
        return
      }
      if (e.key === 'Escape') {
        if (typing) { el.blur(); return }
        if (wide && pane) { setPane(false); paneMuted.current = true; return }
        if (openRow !== null) { setOpenRow(null); return }
        return
      }
      if (typing) return
      if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
        e.preventDefault()
        if (el && el.blur) el.blur()
        setHelp(true)
        return
      }
      if (e.key === 'j' || e.key === 'ArrowDown' || e.key === 'k' || e.key === 'ArrowUp') {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') e.preventDefault()
        const step = e.key === 'j' || e.key === 'ArrowDown' ? 1 : -1
        setCur((c) => Math.max(0, Math.min(c + step, filtered.length - 1)))
        // 넓은 화면: 이동만으로 패널이 따라온다 (Esc 로 닫아 둔 뒤에는 열지 않는다)
        if (wide && !paneMuted.current && filtered.length) setPane(true)
        return
      }
      if (e.key === 'Enter') {
        const r = filtered[cur]
        if (!r) return
        onVisit && onVisit(r)
        if (wide) { paneMuted.current = false; setPane((open) => !open) }
        else setOpenRow((o) => (o === r.id ? null : r.id))
        return
      }
      if (e.key === 's') {
        const r = filtered[cur]
        if (r) toggleStar(r.id)
        return
      }
      if (e.key === 'o') {
        const r = filtered[cur]
        if (!r) return
        if (r.url) window.open(r.url, '_blank', 'noopener')
        else flash('원문 링크가 없는 행이다 | 상세에서 수집 출처를 확인한다')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [filtered, cur, onVisit, toggleStar, help, openRow, wide, pane])

  useEffect(() => () => clearTimeout(noticeTimer.current), [])

  // 커서 추적 — 뷰포트 벗어나면 스크롤 (이슈 #2)
  useEffect(() => { curRef.current?.scrollIntoView({ block: 'nearest' }) }, [cur, filtered])

  useEffect(() => { setCur(0) }, [type, jobfam, policy, status, hiringOnly, changedOnly, starredOnly, q, sortMode])

  const resetFilters = () => {
    setPolicy('all'); setStatus('open'); setSort(null); setSortMode('dday')
    setJobfam('all'); setHiringOnly(false); setChangedOnly(false); setStarredOnly(false); setQ('')
  }
  const clickSort = (key) => {
    if (!sort || sort.key !== key) setSort({ key, dir: 1 })
    else if (sort.dir === 1) setSort({ key, dir: -1 })
    else setSort(null)
  }

  const exportable = filtered.filter((r) => r.deadline)
  const exportAll = () => { if (exportable.length) downloadIcs(exportable) }
  const starredExportable = starredRows.filter((r) => r.deadline)
  const exportStarred = () => { if (starredExportable.length) downloadStarredIcs(starredExportable) }

  const paneOpen = wide && pane && filtered.length > 0
  const activeRow = paneOpen ? filtered[Math.min(cur, filtered.length - 1)] : null

  return (
    <>
      {/* 압축 밴드 — 통계 | 수집 메타 | 마감 티커를 한 줄에 묶는다 (예전 3줄 → 1줄) */}
      <div className="band">
        <Ticker stats={stats} spark={sparkPoints} />
        <span className="band-meta">
          수집 <b>{meta.last_run || '-'}</b> 03:00 | 다음 <b>{meta.last_run ? nextRun(meta.last_run) : '예정'}</b>
        </span>
        <DeadlineTicker rows={rows} onPick={pickDeadline} />
      </div>
      <div className="fr">
        <span className="fl">직군</span>
        <button className={'fopt' + (jobfam === 'all' ? ' on' : '')} aria-pressed={jobfam === 'all'} onClick={() => setJobfam('all')}>전체</button>
        <button className={'fopt' + (jobfam === 'fe' ? ' on' : '')} aria-pressed={jobfam === 'fe'} onClick={() => setJobfam('fe')} title="FE 포지션 공고 + 직군 무관 행사">FE</button>
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
        <span className="fl">조건</span>
        <button className={'fopt tog tog-hire' + (hiringOnly ? ' on' : '')} aria-pressed={hiringOnly}
          onClick={() => setHiringOnly(v => !v)} title="채용 연계 혜택이 있는 이벤트만">채용연계만</button>
        <button className={'fopt tog tog-chg' + (changedOnly ? ' on' : '')} aria-pressed={changedOnly}
          onClick={() => setChangedOnly(v => !v)} title="AI 정책이 도입되거나 바뀐 기록이 있는 건만">정책변경만</button>
        <button className={'fopt star-f' + (starredOnly ? ' on' : '')} aria-pressed={starredOnly}
          onClick={() => setStarredOnly(v => !v)} title="별표한 공고·이벤트만 보기">
          <StarIcon filled={starredOnly} />관심 <b>{starredRows.length}</b>
        </button>
        <span className="fl">정렬</span>
        {SORT_MODES.map((s) => (
          <button key={s.id} className={'fopt' + (sortMode === s.id && !sort ? ' on' : '')}
            aria-pressed={sortMode === s.id && !sort}
            onClick={() => { setSort(null); setSortMode(s.id) }}>{s.label}</button>
        ))}
        <button className="fopt ics" onClick={exportAll} disabled={!exportable.length}
          title="현재 조건에 보이는 건의 마감일을 iCalendar 파일로 내려받는다">.ics {exportable.length > 0 ? exportable.length : ''}</button>
        <button className="fopt ics ics-star" onClick={exportStarred} disabled={!starredExportable.length}
          title="관심 등록한 건의 마감일만 모아 assignment-map-starred.ics 하나로 내려받는다">관심 .ics {starredExportable.length > 0 ? starredExportable.length : ''}</button>
        <span className="dens" role="group" aria-label="행 밀도">
          <button className={density === 'compact' ? 'on' : ''} onClick={() => setDensity('compact')} title="컴팩트">compact</button>
          <button className={density === 'standard' ? 'on' : ''} onClick={() => setDensity('standard')} title="표준">standard</button>
        </span>
        <button className="fopt fopt-reset" onClick={resetFilters}>초기화</button>
        <span className="match-n">{status === 'open'
          ? <>진행중 <b>{filtered.length}</b> / 전체 <b>{totalNoStatus}</b></>
          : <>매칭 <b>{filtered.length}</b>건</>}</span>
        <div className="sr" aria-live="polite">{sortMsg}</div>
      </div>
      <div className={'workspace' + (paneOpen ? ' pane-on' : '')}>
        <div className="twrap tscroll">
          <table>
            <colgroup>
              <col data-col="name" /><col data-col="type" /><col data-col="sub" />
              <col data-col="policy" /><col data-col="evidence" /><col data-col="deadline" /><col data-col="checked" />
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
                  {starredOnly && starredRows.length === 0 ? (
                    <div className="empty-id">
                      <div className="l1"><StarIcon filled={false} /> 관심 등록된 공고가 없습니다</div>
                      <div className="l2">행 왼쪽 별표를 누르면 여기 모인다. 모은 건은 '관심 .ics'로 한 번에 내려받는다.</div>
                    </div>
                  ) : (
                    <div className="empty-id">
                      <div className="l1">지금 이 조건에 걸리는 기회가 없을 뿐이다.</div>
                      <div className="l2">Esc 또는 초기화로 조건을 풀고, 매일 03:00 KST에 다시 수집한다.</div>
                    </div>
                  )}
                </td></tr>
              )}
              {filtered.map((r, i) => (
                <Row key={r.id} r={r} q={q} zebra={i % 2 === 1} idx={i} curIdx={cur} curRef={curRef}
                  expanded={!wide && openRow === r.id} starred={starredSet.has(r.id)} onStar={toggleStar}
                  onPick={() => pickRow(i, r)} />
              ))}
            </tbody>
          </table>
        </div>
        {activeRow && (
          <DetailPane r={activeRow} starred={starredSet.has(activeRow.id)} onStar={toggleStar}
            onClose={() => { setPane(false); paneMuted.current = true }} />
        )}
      </div>
      <div className="keybar">
        <span><span className="kbd">j</span><span className="kbd">k</span>행 이동</span>
        <span><span className="kbd">Enter</span>상세 {wide ? '패널' : '확장'}</span>
        <span><span className="kbd">o</span>원문 열기</span>
        <span><span className="kbd">s</span>관심 등록</span>
        <span><span className="kbd">/</span>검색</span>
        <span><span className="kbd">Esc</span>{wide ? '패널 닫기' : '닫기'}</span>
        <button type="button" className="kb-open" onClick={() => setHelp(true)} aria-label="키보드 단축키 도움말 열기">
          <span className="kbd">?</span>도움말
        </button>
      </div>
      <div className="sr" role="status">{notice}</div>
      {help && <ShortcutsHelp onClose={() => setHelp(false)} />}
    </>
  )
}

function nextRun(last) {
  const d = new Date(last + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

function Row({ r, q, zebra, idx, curIdx, curRef, expanded, starred, onStar, onPick }) {
  const isNew = r.first && r.first >= new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10)
  const hot = r.open && r.dd !== null && r.dd >= 0 && r.dd <= 3
  const ddCls = r.dd === null ? 'dd pass' : r.dd < 0 ? 'dd pass' : r.dd <= 3 ? 'dd hot' : 'dd'
  const ddText = !r.open ? '종결' : r.dd === null ? '상시' : r.dd < 0 ? '마감' : `D-${r.dd} (${(r.deadline || '').slice(5)})`
  const cls = ['row', zebra && !hot ? 'z' : '', hot ? 'hot' : '', idx === curIdx ? 'cur' : ''].filter(Boolean).join(' ')
  const change = policyChangeByID.get(r.id)
  return (
    <>
      <tr className={cls} ref={idx === curIdx ? curRef : undefined} aria-selected={idx === curIdx}
        onClick={onPick}>
        <td className="c-name" data-col="name">
          <button type="button" className={'star' + (starred ? ' on' : '')} aria-pressed={starred}
            aria-label={starred ? `${r.name} 관심 해제` : `${r.name} 관심 등록`}
            title={starred ? '관심 해제' : '관심 등록 - 모아서 .ics로 내려받는다'}
            onClick={(e) => { e.stopPropagation(); onStar(r.id) }}>
            <StarIcon filled={starred} />
          </button>
          <span className="co" title={r.name}><Hl text={r.name} q={q} /></span>
          {r.hiring && <span className="badge">채용연계</span>}
          {isNew && <span className="badge">NEW</span>}
          {change && <span className="badge chg" title={`정책 변경 ${change.date}: ${POLICY_LABEL[change.from] || change.from || '-'} → ${POLICY_LABEL[change.to] || change.to || '-'}`}>정책변경</span>}
        </td>
        <td className="typ" data-col="type"><Hl text={r.type} q={q} /></td>
        <td className="typ c-sub" data-col="sub" title={r.sub}><Hl text={r.sub} q={q} /></td>
        <td data-col="policy"><span className={`pol ${r.policy.cls}`}><i aria-hidden="true"></i>{POLICY_LABEL[r.policyKey] || r.policy.label}</span></td>
        <td className="ev" data-col="evidence" title={r.evidence}>{disp(r.evidence)}</td>
        <td className={ddCls} data-col="deadline">
          <span className="ddt">{ddText}</span>
          {r.deadline && (
            <button className="rowics" title={`${r.deadline} 마감을 캘린더(.ics)로 내려받기`}
              aria-label={`${r.name} 마감일을 캘린더 파일로 내려받기`}
              onClick={(e) => { e.stopPropagation(); downloadIcs([r]) }}>ics</button>
          )}
        </td>
        <td className="chk" data-col="checked">{r.checked ? `${r.checked.slice(5)} (${relDays(r.checked)})` : ''}</td>
      </tr>
      {expanded && (
        <tr className="hx">
          <td colSpan={7}>
            <div className="in">
              <div className="ln"><span className="d">{r.first || ''}</span>발견 | <span className="q">{disp(r.evidence)}</span></div>
              <div className="ln">대상/주최: <span className="q">{r.sub || '-'}</span></div>
              <div className="ln">마감: <span className="q">{r.deadline ? `${r.deadline} (${ddText})` : '상시/미정'}</span> | 유형: <span className="q">{r.type}</span>{r.prize ? <> | 상금: <span className="q">{r.prize}</span></> : null}</div>
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
                <button className={'ics act starbtn' + (starred ? ' on' : '')}
                  title={starred ? '관심 목록에서 뺀다' : '관심 목록에 담는다 (s)'}
                  onClick={(e) => { e.stopPropagation(); onStar(r.id) }}>
                  {starred ? '관심 해제' : '관심 등록'}
                </button>
                {r.deadline && (
                  <button className="ics act" title={`${r.deadline} 종일 일정으로 캘린더에 넣는다`}
                    onClick={(e) => { e.stopPropagation(); downloadIcs([r]) }}>.ics 마감 일정 내려받기</button>
                )}
              </div>
              {/* 좁은 화면에서는 2-Pane 대신 아코디언 맨 아래에 같은 공략 섹션이 붙는다 */}
              <GuidePane r={r} inline />
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
