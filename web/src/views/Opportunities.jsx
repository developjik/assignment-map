import { useEffect, useMemo, useRef, useState } from 'react'
import { meta, policyChangeByID, stats, sparkPoints } from '../lib/data'
import { POLICY_LABEL, STATUS_LABEL, disp } from '../lib/labels'
import { downloadIcs, downloadStarredIcs } from '../lib/ics'
import { filtersFromHash, readHash, writeHash, filterPatch } from '../lib/hash'
import { loadPresets, matchPreset } from '../lib/presets'
import { useStarred } from '../lib/starred'
import { WORKFLOW, WORKFLOW_CLS, WORKFLOW_LABEL, nextStatus, useStatuses } from '../lib/statuses'
import { reportIssueUrl } from '../lib/report'
import Ticker from '../components/Ticker'
import DeadlineTicker from '../components/DeadlineTicker'
import DetailPane from '../components/DetailPane'
import GuidePane from '../components/GuidePane'
import GuideProgressBadge from '../components/GuideProgressBadge'
import RelatedList from '../components/RelatedList'
import StatusPicker from '../components/StatusPicker'
import ShortcutsHelp from '../components/ShortcutsHelp'
import FilterPopover from '../components/FilterPopover'
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
// 내 진행 상황(트래커) 필터 — 기본은 전체, 나머지는 상태 하나씩
const PROG_FILTERS = [
  { id: '', label: '전체' },
  ...WORKFLOW.map((w) => ({ id: w.id, label: w.label, cls: w.cls })),
]
const SORT_MODES = [
  { id: 'dday', label: '마감 임박' },
  { id: 'latest', label: '최신 등록' },
]
// 마감 범위 — 프리셋 'D-3 임박'과 같은 축을 팝오버에서도 직접 고를 수 있게
const DD_FILTERS = [
  { id: '', label: '전체 마감' },
  { id: '3', label: 'D-3 이내' },
  { id: '7', label: 'D-7 이내' },
]
// 필터의 기본값 — 프리셋 적용이 빠진 키를 기본값으로 메운다
const DEFAULT_FILTERS = {
  policy: 'all', jobfam: 'all', status: 'open', prog: '', dd: '',
  hiringOnly: false, changedOnly: false, starredOnly: false,
}
const POLICY_RANK = { required: 4, allowed_graded: 3, allowed: 2, banned: 1, unspecified: 0, unknown: 0 }
// 정책 필터 판정 — 기본 필터와 티커 필터 완화가 같은 규칙을 써야 한다
const policyMatch = (p, r) => p === 'all' ? true
  : p === 'unspecified' ? ['unspecified', 'unknown'].includes(r.policyKey)
  : r.policyKey === p
// 마감 범위 판정 — 살아있는 마감(0 이상)만 센다. 지난 마감·상시는 D-3 이내가 아니다.
const ddMatch = (within, r) => !within ? true : r.dd !== null && r.dd >= 0 && r.dd <= Number(within)

// Enter 단축키를 양보해야 하는 포소스인가 — 버튼·링크·탭·폼 요소와 상세 영역 안쪽
const INTERACTIVE = 'button, a[href], input, select, textarea, summary, [role="button"], [role="tab"], [role="link"], [role="switch"], [role="checkbox"], [contenteditable="true"]'
const takesEnter = (el) => !!el && typeof el.closest === 'function' && !!el.closest(INTERACTIVE)
const inPane = (el) => !!el && typeof el.closest === 'function' && !!el.closest('.dpane, .hx, .cal-side')
// 행은 식별·비교만 맡긴다 (PR B) — 유형은 패널 kicker, 확인일은 패널 추적·아코디언이 보여준다.
const COLS = [
  { id: 'name', label: '기업 / 이벤트명' },
  { id: 'sub', label: '대상 / 주최' },
  { id: 'policy', label: 'AI 정책' },
  { id: 'evidence', label: '근거', nosort: true },
  { id: 'deadline', label: '마감 (D-day)' },
]
// 우측 상세 패널을 붙이는 폭 — 5컬럼 표와 400px 패널이 같이 설 수 있는 최소 데스크톱
const WIDE_QUERY = '(min-width: 1200px)'

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

export default function Opportunities({ rows, type, q, setQ, setTab, onVisit }) {
  // 첫 진입 필터는 URL 해시에서 (딥링크: #t=postings&policy=required&jobfam=fe)
  const initial = useMemo(() => filtersFromHash(readHash()), [])
  const [policy, setPolicy] = useState(initial.policy)
  const [jobfam, setJobfam] = useState(initial.jobfam)
  const [status, setStatus] = useState(initial.status)
  const [prog, setProg] = useState(initial.prog)
  const [ddw, setDdw] = useState(initial.dd)
  const [hiringOnly, setHiringOnly] = useState(initial.hiringOnly)
  const [changedOnly, setChangedOnly] = useState(initial.changedOnly)
  const [starredOnly, setStarredOnly] = useState(initial.starredOnly)
  const [starredIds, toggleStar] = useStarred()
  const { statuses, statusOf, setStatus: setWorkflow } = useStatuses()
  const [sortMode, setSortMode] = useState('dday')
  const [openRow, setOpenRow] = useState(null)
  const [pane, setPane] = useState(false)
  const [sort, setSort] = useState(null)
  const [cur, setCur] = useState(0)
  const [density, setDensity] = useState(() => localStorage.getItem('am-density') || 'standard')
  const [help, setHelp] = useState(false)
  const [notice, setNotice] = useState('')
  // 티커에서 고른 행 — 필터가 끝난 뒤 그 행을 찾아 열기 위한 대기표
  const [pendingPick, setPendingPick] = useState(null)
  // 필터 팝오버 열림 여부 + 이름 붙은 프리셋 정의(localStorage)
  const [fpop, setFpop] = useState(false)
  const [presets] = useState(loadPresets)
  const curRef = useRef(null)
  const noticeTimer = useRef(null)
  // Esc 로 패널을 닫은 뒤에는 j/k 만으로 다시 열지 않는다 (Enter·클릭은 다시 연다)
  const paneMuted = useRef(false)
  const wide = useWide(WIDE_QUERY)

  useEffect(() => { document.documentElement.dataset.density = density }, [density])
  useEffect(() => { localStorage.setItem('am-density', density) }, [density])

  // 필터 상태를 URL 해시에 반영 (탭·검색어 키는 App이 쓰므로 건드리지 않는다)
  useEffect(() => {
    writeHash(filterPatch({ policy, jobfam, status, prog, dd: ddw, hiringOnly, changedOnly, starredOnly }))
  }, [policy, jobfam, status, prog, ddw, hiringOnly, changedOnly, starredOnly])

  // 같은 탭에서 해시만 바뀌면(링크 붙여넣기, 뒤로/앞으로) 상태를 다시 맞춘다
  useEffect(() => {
    const onHash = () => {
      const f = filtersFromHash(readHash())
      setPolicy(f.policy); setJobfam(f.jobfam); setStatus(f.status); setProg(f.prog); setDdw(f.dd)
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

  const { filtered, totalNoStatus, facets } = useMemo(() => {
    const tokens = (q || '').trim().toLowerCase().split(/\s+/).filter(Boolean)
    // skip: 이 축의 조건은 빼고 본다 — 값별 건수가 "이 값을 골랐을 때 남는 수"가 되도록 (Datadog facet)
    const base = (r, skip) => {
      if (!typeMatch(r)) return false
      if (skip !== 'status' && status !== 'all' && !r.open) return false
      if (skip !== 'starred' && starredOnly && !starredSet.has(r.id)) return false
      if (skip !== 'prog' && prog && statuses[r.id] !== prog) return false
      if (skip !== 'jobfam' && jobfam === 'fe' && r.kind === 'posting' && !(r.positions || []).includes('frontend')) return false
      if (skip !== 'policy' && !policyMatch(policy, r)) return false
      if (skip !== 'hiring' && hiringOnly && !r.hiring) return false
      if (skip !== 'changed' && changedOnly && !policyChangeByID.has(r.id)) return false
      if (skip !== 'dd' && !ddMatch(ddw, r)) return false
      // 공백으로 나눈 토큰 AND — 제목·기업/주최·상금·기술 스택을 한 인덱스에서 찾는다
      if (tokens.length && !tokens.every((t) => r.hay.includes(t))) return false
      return true
    }
    const noStatus = rows.filter((r) => base(r, 'status'))
    const out = noStatus.filter((r) => status === 'all' || r.open)
    const openFirst = (a, b) => (a.open === b.open ? 0 : a.open ? -1 : 1)
    // 마감 임박: 살아있는 마감(0 이상) → 이미 지난 마감 → 상시 순. 진행중 상태로 남은 지난 마감이 맨 위를 차지하지 않게 한다.
    const ddayKey = (r) => (r.dd === null ? 1e9 : r.dd < 0 ? 1e6 - r.dd : r.dd)
    const byDday = (a, b) => ddayKey(a) - ddayKey(b)
    const byLatest = (a, b) => (b.first || '').localeCompare(a.first || '') || (b.checked || '').localeCompare(a.checked || '')
    const cmp = {
      name: (a, b) => a.name.localeCompare(b.name, 'ko'),
      sub: (a, b) => (a.sub || '').localeCompare(b.sub || '', 'ko'),
      policy: (a, b) => (POLICY_RANK[a.policyKey] || 0) - (POLICY_RANK[b.policyKey] || 0),
      deadline: (a, b) => (a.dd === null) - (b.dd === null) || (a.dd ?? 0) - (b.dd ?? 0),
    }
    if (sort && cmp[sort.key]) out.sort((a, b) => cmp[sort.key](a, b) * sort.dir)
    else if (sortMode === 'latest') out.sort((a, b) => openFirst(a, b) || byLatest(a, b) || byDday(a, b))
    else out.sort((a, b) => openFirst(a, b) || byDday(a, b))
    // 값별 건수 — 각 축은 자기 조건을 뺀 나머지 조건에서 센다
    const count = (skip, ok) => {
      let n = 0
      for (const r of rows) if (base(r, skip) && (!ok || ok(r))) n++
      return n
    }
    const facets = {
      policy: Object.fromEntries(POLICY_FILTERS.map((f) => [f.id, count('policy', (r) => policyMatch(f.id, r))])),
      status: { open: count('status', (r) => r.open), all: count('status') },
      jobfam: {
        all: count('jobfam'),
        fe: count('jobfam', (r) => r.kind !== 'posting' || (r.positions || []).includes('frontend')),
      },
      prog: Object.fromEntries(PROG_FILTERS.map((f) => [f.id, f.id ? count('prog', (r) => statuses[r.id] === f.id) : count('prog')])),
      dd: Object.fromEntries(DD_FILTERS.map((f) => [f.id, count('dd', (r) => ddMatch(f.id, r))])),
      hiring: count('hiring', (r) => r.hiring),
      changed: count('changed', (r) => policyChangeByID.has(r.id)),
      starred: count('starred', (r) => starredSet.has(r.id)),
    }
    return { filtered: out, totalNoStatus: noStatus.length, facets }
  }, [rows, typeMatch, jobfam, policy, status, prog, ddw, hiringOnly, changedOnly, starredOnly, starredSet, statuses, q, sort, sortMode])

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

  // 상단 마감 티커에서 항목을 고르면 지금 걸린 필터를 먼저 풀어 그 행이 실제로 보이게 한다.
  // (PR #3 리뷰: 탭·정책·검색이 살아 있으면 표가 비고 상세도 열리지 않았다)
  // 열기는 폴더가 끝난 뒤 pendingPick 으로 한다 — 인덱스는 그때의 filtered 에서 찾는다.
  // 관련 공고 클릭도 같은 길로 들어온다(지금 걸린 조건 밖의 행일 수 있으니 조건을 먼저 푼다).
  const pickDeadline = (r) => {
    const relaxed = []
    if (!typeMatch(r)) { setTab && setTab('all'); relaxed.push('탭') }
    if (starredOnly && !starredSet.has(r.id)) { setStarredOnly(false); relaxed.push('관심') }
    if (jobfam === 'fe' && r.kind === 'posting' && !(r.positions || []).includes('frontend')) {
      setJobfam('all'); relaxed.push('FE')
    }
    if (!policyMatch(policy, r)) { setPolicy('all'); relaxed.push('정책') }
    if (prog && statusOf(r.id) !== prog) { setProg(''); relaxed.push('진행 상태') }
    if (hiringOnly && !r.hiring) { setHiringOnly(false); relaxed.push('채용연계') }
    if (changedOnly && !policyChangeByID.has(r.id)) { setChangedOnly(false); relaxed.push('정책변경') }
    if (!ddMatch(ddw, r)) { setDdw(''); relaxed.push('마감 범위') }
    if (status === 'open' && !r.open) { setStatus('all'); relaxed.push('진행중') }
    const tokens = (q || '').trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (tokens.length && !tokens.every((t) => r.hay.includes(t))) { setQ(''); relaxed.push('검색어') }

    onVisit && onVisit(r)
    setPendingPick({ id: r.id, name: r.name, relaxed })
  }

  // 필터가 자리잡은 다음에 호출된다 — 그때 목록에서 행을 찾아 선택·상세를 연다
  useEffect(() => {
    if (!pendingPick) return
    const idx = filtered.findIndex((r) => r.id === pendingPick.id)
    if (idx < 0) return
    setCur(idx)
    if (wide) { paneMuted.current = false; setPane(true) }
    else setOpenRow(pendingPick.id)
    if (pendingPick.relaxed.length) {
      flash(`${pendingPick.name} | ${pendingPick.relaxed.join(', ')} 조건을 풀고 이 행을 열었다`)
    }
    setPendingPick(null)
  }, [pendingPick, filtered, wide])

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
        if (fpop) { setFpop(false); return }
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
        // 포소스가 상세 안 버튼·링크·탭 위에 있으면 그 요소의 Enter 를 살린다 (PR #4 P2)
        const focus = document.activeElement
        if (takesEnter(e.target) || takesEnter(focus) || inPane(focus) || inPane(e.target)) return
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
      // 필터 팝오버 — 목록을 좁히는 나머지 조건이 한 자리에 모여 있다
      if (e.key === 'f') {
        setFpop((v) => !v)
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
  }, [filtered, cur, onVisit, toggleStar, help, openRow, wide, pane, fpop])

  useEffect(() => () => clearTimeout(noticeTimer.current), [])

  // 커서 추적 — 뷰포트 벗어나면 스크롤 (이슈 #2)
  useEffect(() => { curRef.current?.scrollIntoView({ block: 'nearest' }) }, [cur, filtered])

  useEffect(() => { setCur(0) }, [type, jobfam, policy, status, prog, ddw, hiringOnly, changedOnly, starredOnly, q, sortMode])

  // 조건만 푼다 (검색어·정렬은 그대로) — 칩 줄의 '전체 해제'와 팝오버가 같은 곳을 본다
  const clearFilters = () => {
    setPolicy('all'); setStatus('open'); setProg(''); setJobfam('all'); setDdw('')
    setHiringOnly(false); setChangedOnly(false); setStarredOnly(false)
  }
  const resetFilters = () => {
    clearFilters()
    setSort(null); setSortMode('dday'); setQ('')
  }
  const applyPreset = (p) => {
    const f = { ...DEFAULT_FILTERS, ...p.filters }
    setPolicy(f.policy); setStatus(f.status); setProg(f.prog); setJobfam(f.jobfam); setDdw(f.dd)
    setHiringOnly(!!f.hiringOnly); setChangedOnly(!!f.changedOnly); setStarredOnly(!!f.starredOnly)
    setFpop(false)
  }
  const filterState = { policy, jobfam, status, prog, dd: ddw, hiringOnly, changedOnly, starredOnly }
  const activePreset = matchPreset(presets, filterState)

  // 걸린 조건 한 줄 — 칩 하나가 곧 제거 버튼이다
  const chips = []
  if (policy !== 'all') chips.push({ id: 'policy', k: 'AI 정책', v: (POLICY_FILTERS.find((f) => f.id === policy) || {}).label, off: () => setPolicy('all') })
  if (status !== 'open') chips.push({ id: 'status', k: '상태', v: '전체 상태', off: () => setStatus('open') })
  if (jobfam === 'fe') chips.push({ id: 'jobfam', k: '직군', v: 'FE', off: () => setJobfam('all') })
  if (prog) chips.push({ id: 'prog', k: '내 진행', v: WORKFLOW_LABEL[prog] || prog, off: () => setProg('') })
  if (ddw) chips.push({ id: 'dd', k: '마감', v: (DD_FILTERS.find((f) => f.id === ddw) || {}).label, off: () => setDdw('') })
  if (hiringOnly) chips.push({ id: 'hiring', k: '조건', v: '채용연계만', off: () => setHiringOnly(false) })
  if (changedOnly) chips.push({ id: 'changed', k: '조건', v: '정책변경만', off: () => setChangedOnly(false) })
  if (starredOnly) chips.push({ id: 'starred', k: '조건', v: '관심만', off: () => setStarredOnly(false) })

  // 팝오버 안의 축들 — 값 한 줄이 토글 한 줄이고, 오른쪽 숫자가 지금 남는 건수다
  const groups = [
    {
      id: 'jobfam', label: '직군', rows: [
        { id: 'all', label: '전체', count: facets.jobfam.all, on: jobfam === 'all', pick: () => setJobfam('all') },
        { id: 'fe', label: 'FE (프론트엔드 포지션)', count: facets.jobfam.fe, on: jobfam === 'fe', pick: () => setJobfam('fe') },
      ],
    },
    {
      id: 'prog', label: '내 진행', rows: PROG_FILTERS.map((f) => ({
        id: f.id || 'none', label: f.label, count: facets.prog[f.id], on: prog === f.id, pick: () => setProg(f.id),
      })),
    },
    {
      id: 'dd', label: '마감', rows: DD_FILTERS.map((f) => ({
        id: f.id || 'any', label: f.label, count: facets.dd[f.id], on: ddw === f.id, pick: () => setDdw(f.id),
      })),
    },
    {
      id: 'flags', label: '조건', rows: [
        { id: 'hiring', label: '채용연계만', count: facets.hiring, on: hiringOnly, pick: () => setHiringOnly((v) => !v) },
        { id: 'changed', label: '정책변경만', count: facets.changed, on: changedOnly, pick: () => setChangedOnly((v) => !v) },
        { id: 'starred', label: '관심만', count: facets.starred, on: starredOnly, pick: () => setStarredOnly((v) => !v) },
      ],
    },
  ]
  const clickSort = (key) => {
    if (!sort || sort.key !== key) setSort({ key, dir: 1 })
    else if (sort.dir === 1) setSort({ key, dir: -1 })
    else setSort(null)
  }

  const exportable = filtered.filter((r) => r.deadline)
  // 초기화는 검색어·정렬처럼 칩으로 보이지 않는 상태까지 바꾸므로 그때만 보인다
  // (조건만 걸렸을 때는 칩 줄의 '전체 해제'가 그 일을 한다)
  const dirtyTools = !!(q || '').trim() || !!sort || sortMode !== 'dday'
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
        {/* 상시 노출 5묶음 — AI 정책 5 + 상태 2 + 필터 팝오버. 직군·내 진행·마감 범위·조건은 팝오버 안으로. */}
        <div className="fr-q">
          <span className="fl">AI 정책</span>
          {POLICY_FILTERS.map((f) => (
            <button key={f.id} className={`fopt ${f.cls || ''}` + (policy === f.id ? ' on' : '')} aria-pressed={policy === f.id}
              onClick={() => setPolicy(f.id)} title={`${f.label} | 지금 조건에서 ${facets.policy[f.id]}건`}>
              {f.label}<span className="fct">{facets.policy[f.id]}</span>
            </button>
          ))}
          <span className="fl">상태</span>
          {STATUS_FILTERS.map((f) => (
            <button key={f.id} className={'fopt' + (status === f.id ? ' on' : '')} aria-pressed={status === f.id}
              onClick={() => setStatus(f.id)}>{f.label}</button>
          ))}
          <FilterPopover
            open={fpop} onToggle={() => setFpop((v) => !v)} onClose={() => setFpop(false)}
            groups={groups} presets={presets} activePreset={activePreset} onApplyPreset={applyPreset}
            appliedCount={chips.length} onClear={clearFilters}
          />
        </div>
        {/* 도구 — 목록을 줄이지 않는 표시·내보내기 조작. 조건과 분리해 옅게, 오른쪽 정렬 */}
        <div className="fr-t">
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
          {dirtyTools && <button className="fopt fopt-reset" onClick={resetFilters} title="검색어·정렬까지 기본값으로 되돌린다">초기화</button>}
          <span className="match-n">{status === 'open'
            ? <>진행중 <b>{filtered.length}</b> / 전체 <b>{totalNoStatus}</b></>
            : <>매칭 <b>{filtered.length}</b>건</>}</span>
        </div>
        <div className="sr" aria-live="polite">{sortMsg}</div>
      </div>
      {/* 걸린 조건 한 줄 — 칩 하나가 곧 제거 버튼이다 */}
      {chips.length > 0 && (
        <div className="fr-chips" role="group" aria-label="적용된 필터">
          {chips.map((c) => (
            <button key={c.id} type="button" className="fchip" onClick={c.off}
              title={`${c.k} ${c.v} 조건을 푼다`} aria-label={`${c.k} ${c.v} 조건 해제`}>
              <span className="k">{c.k}</span>{c.v}<span className="x" aria-hidden="true">×</span>
            </button>
          ))}
          <button type="button" className="fchip-clear" onClick={clearFilters}
            title="걸린 조건을 모두 푼다 (검색어·정렬은 그대로)">전체 해제</button>
        </div>
      )}
      <div className={'workspace' + (paneOpen ? ' pane-on' : '')}>
        <div className="twrap tscroll">
          <table>
            <colgroup>
              <col data-col="name" /><col data-col="sub" />
              <col data-col="policy" /><col data-col="evidence" /><col data-col="deadline" />
            </colgroup>
            <thead>
              <tr>
                {COLS.map((c) => (
                  <th key={c.id} data-col={c.id} className={c.id === 'deadline' ? 'r' : ''}
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
                <tr><td colSpan={5}>
                  {starredOnly && starredRows.length === 0 ? (
                    <div className="empty-id">
                      <div className="l1"><StarIcon filled={false} /> 관심 등록된 공고가 없습니다</div>
                      <div className="l2">행 왼쪽 별표를 누르면 여기 모인다. 모은 건은 '관심 .ics'로 한 번에 내려받는다.</div>
                    </div>
                  ) : (
                    <div className="empty-id">
                      <div className="l1">지금 이 조건에 걸리는 기회가 없을 뿐이다.</div>
                      <div className="l2">필터의 전체 해제 또는 초기화로 조건을 풀고, 매일 03:00 KST에 다시 수집한다.</div>
                    </div>
                  )}
                </td></tr>
              )}
              {filtered.map((r, i) => (
                <Row key={r.id} r={r} q={q} zebra={i % 2 === 1} idx={i} curIdx={cur} curRef={curRef}
                  expanded={!wide && openRow === r.id} starred={starredSet.has(r.id)} onStar={toggleStar}
                  st={statuses[r.id] || ''} onCycle={() => setWorkflow(r.id, nextStatus(statuses[r.id] || ''))}
                  onPick={() => pickRow(i, r)} rows={rows} onPickRelated={pickDeadline} />
              ))}
            </tbody>
          </table>
        </div>
        {activeRow && (
          <DetailPane r={activeRow} rows={rows} starred={starredSet.has(activeRow.id)} onStar={toggleStar}
            onClose={() => { setPane(false); paneMuted.current = true }} onPickRelated={pickDeadline} />
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

function Row({ r, q, zebra, idx, curIdx, curRef, expanded, starred, onStar, st, onCycle, onPick, rows, onPickRelated }) {
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
          {st && (
            <button type="button" className={'stg ' + WORKFLOW_CLS[st]} title={`${WORKFLOW_LABEL[st]} | 누를 때마다 다음 단계 (관심 → 과제중 → 제출완료 → 해제)`}
              onClick={(e) => { e.stopPropagation(); onCycle && onCycle() }}>{WORKFLOW_LABEL[st]}</button>
          )}
        </td>
        <td className="typ c-sub" data-col="sub" title={r.sub}><Hl text={r.sub} q={q} /></td>
        <td data-col="policy"><span className={`pol ${r.policy.cls}`}><i aria-hidden="true"></i>{POLICY_LABEL[r.policyKey] || r.policy.label}</span></td>
        {/* 근거는 원문 인용 하나를 48자로 자른다 — 수집기 운영 메모는 패널 '수집 메모'로 (PR B) */}
        <td className="ev" data-col="evidence" title={r.evidenceFull || ''}>{disp(r.evidence)}</td>
        <td className={ddCls} data-col="deadline">
          <span className="ddt">{ddText}</span>
        </td>
      </tr>
      {expanded && (
        <tr className="hx">
          <td colSpan={5}>
            <div className="in">
              <div className="ln"><span className="d">{r.first || ''}</span>발견 | <span className="q">{disp(r.evidenceFull || r.evidence || '원문 인용 없음')}</span></div>
              <div className="ln">대상/주최: <span className="q">{r.sub || '-'}</span></div>
              <div className="ln">마감: <span className="q">{r.deadline ? `${r.deadline} (${ddText})` : '상시/미정'}</span> | 유형: <span className="q">{r.type}</span>{r.prize ? <> | 상금: <span className="q">{r.prize}</span></> : null}</div>
              {/* 표에서 뺀 확인일·출처는 아코디언이 받는다 (좁은 화면에서는 이 줄이 유일한 자리) */}
              <div className="ln">확인: <span className="q">{r.checked || '-'}</span> | 출처: <span className="q">{disp(r.source) || '-'}</span></div>
              {/* 핵심 동작은 제목·마감 바로 아래 — 공략·이력 끝까지 스크롤하지 않아도 된다 */}
              <div className="ln hx-acts">
                {r.url
                  ? <a className="hx-a primary" href={r.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>원문 열기</a>
                  : <span className="src">원문 미확보 (수집 {r.first || r.checked || '-'})</span>}
                <button className={'hx-a starbtn' + (starred ? ' on' : '')}
                  title={starred ? '관심 목록에서 뺀다' : '관심 목록에 담는다 (s)'}
                  onClick={(e) => { e.stopPropagation(); onStar(r.id) }}>
                  {starred ? '관심 해제' : '관심 등록'}
                </button>
                {r.deadline && (
                  <button className="hx-a" title={`${r.deadline} 종일 일정으로 캘린더에 넣는다`}
                    onClick={(e) => { e.stopPropagation(); downloadIcs([r]) }}>.ics 마감 일정</button>
                )}
                <a className="rep" href={reportIssueUrl(r)} target="_blank" rel="noreferrer"
                  title="정보가 틀렸거나 AI 정책이 바뀌었을 때 GitHub 이슈로 보낸다"
                  onClick={(e) => e.stopPropagation()}>정보 수정·AI 정책 제보</a>
              </div>
              <div className="ln sp-ln">지원 상태: <StatusPicker id={r.id} /><GuideProgressBadge r={r} full /></div>
              {(r.history || []).filter(h => h.event !== 'created').map((h, i) => (
                <div className="ln" key={i}>
                  <span className="d">{h.date}</span>
                  <span className="ev">{histLabel(h.event)}</span>
                  {h.from && h.to ? ` ${labelOf(h.from)} → ${labelOf(h.to)}` : ''}
                  {h.evidence ? <span className="q"> | "{disp(h.evidence)}"</span> : ''}
                </div>
              ))}
              {/* 좁은 화면에서는 2-Pane 대신 아코디언 맨 아래에 같은 공략 섹션과 관련 공고가 붙는다 */}
              <GuidePane r={r} inline />
              <RelatedList r={r} rows={rows} onPick={onPickRelated} inline />
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
