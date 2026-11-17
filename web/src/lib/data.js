import postingsRaw from '../../../data/postings.json'
import eventsRaw from '../../../data/events.json'
import platformsRaw from '../../../data/platforms.json'
import newsRaw from '../../../data/news.json'
import changelogRaw from '../../../data/changelog.json'
import metaRaw from '../../../data/meta.json'
import { clipEvidence, evidenceParts } from './evidence'
import { relativeText } from './deadline'
import { buildAliasMap, canonicalId } from './alias'

const KST_OFFSET = 9 * 3600e3
function dayStartKST(dateStr) {
  if (!dateStr) return null
  return new Date(dateStr + 'T00:00:00+09:00').getTime()
}
export function dday(dateStr) {
  const t = dayStartKST(dateStr)
  if (!t) return null
  const now = new Date()
  const nowKst = new Date(now.getTime() + (KST_OFFSET) + now.getTimezoneOffset() * 60000)
  return Math.round((t - nowKst.setHours(0, 0, 0, 0)) / 864e5)
}
// 예전 이름 하나만 남겨 둔다 — 낱말은 lib/deadline 이 정한다 (PR E)
export const ddayText = (d) => relativeText(d, true)

export const POLICY = {
  required: { cls: 'p-req', label: '필수' },
  allowed_graded: { cls: 'p-ai', label: '허용+과정채점' },
  allowed: { cls: 'p-ok', label: '허용' },
  banned: { cls: 'p-non', label: '금지' },
  unspecified: { cls: 'p-non', label: '미언급' },
}
export const EV_POLICY = {
  required: { cls: 'p-req', label: '주제=AI' },
  allowed: { cls: 'p-ok', label: 'AI 허용' },
  banned: { cls: 'p-non', label: '금지' },
  unknown: { cls: 'p-rev', label: '확인필요' },
}

const EVENT_TYPE = { hackathon: '해커톤', competition: '대회', contest: '공모전', meetup: '밋업', conference: '컨퍼런스', workshop: '워크샵' }
const isOpen = (s) => ['open', 'upcoming', 'judging'].includes(s)

// 검색 인덱스: 제목·기업/주최·키워드·기술 스택을 한 문자열로 (소문자)
const hay = (...parts) =>
  parts
    .flat(2)
    .filter((p) => p !== null && p !== undefined && p !== '')
    .map((p) => (Array.isArray(p) ? p.join(' ') : String(p)))
    .join(' ')
    .toLowerCase()

// evidence 배열의 항목은 문자열(이벤트)이거나 { quote, field }(채용 공고)다 — 둘 다 받는다.
const quoteOf = (e) => (typeof e === 'string' ? e.trim() : e && typeof e.quote === 'string' ? e.quote : '')
const evidenceText = (evidence) => (Array.isArray(evidence) ? evidence.map(quoteOf).filter(Boolean).join(' ') : evidence || '')

// 표에는 원문 인용만, 수집기 운영 메모는 detailMemo 로 따로 넘긴다 (PR B)
const evOf = (evidence) => evidenceParts(asEvidence(evidence).map(quoteOf))

// 수집기가 evidence 를 문자열로 남긴 행이 있다(2026-11-16 잡코리아 5건). 배열로 맞춰 준다 —
// 문자열에 .map 을 부를면 목록 전체가 죽는다(흰 화면).
const asEvidence = (ev) => (Array.isArray(ev) ? ev : ev ? [{ quote: String(ev) }] : [])

// ==== 중복 병합(collector/dedupe.mjs) 다루기 ====
// 대표행은 `duplicates: [중복 id…]`, 중복 행은 `merged_into: 대표 id` 를 갖는다. 행은 지우지 않는다.
// 화면에는 대표행만 서고, 중복 행이 가진 원문 링크는 상세 패널의 "같은 기회 다른 출처" 목록에 남긴다.
const rawById = new Map([...postingsRaw, ...eventsRaw].map((r) => [r.id, r]))
// 병합된 id → 대표 id. 사용자의 별표·지원 상태가 감춰진 id 를 가리킬 때 대표행으로 옮겨 읽는다.
export const aliasMap = buildAliasMap([...postingsRaw, ...eventsRaw])
export const toCanonicalId = (id) => canonicalId(id, aliasMap)

const sourceLabel = (s) => (s || '').replace('manual-research', '리서치')
const dupesOf = (row) => (row.duplicates || [])
  .map((id) => {
    const d = rawById.get(id)
    if (!d) return null
    return {
      id,
      name: d.company || d.title || id,
      title: d.title && d.title !== d.company ? d.title : '',
      source: sourceLabel(d.source),
      url: !d.url || d.url === 'seed' ? null : d.url,
      deadline: d.deadline || d.apply_deadline || d.submit_deadline || null,
      status: d.status || '',
    }
  })
  .filter(Boolean)


export const rows = [
  ...postingsRaw.map((p) => ({
    kind: 'posting', id: p.id, name: p.company, title: p.title || '',
    sub: p.positions_raw || (p.positions || []).join('/'),
    type: '채용', positions: p.positions || [], policy: POLICY[p.ai_policy] || POLICY.unspecified,
    policyKey: p.ai_policy,
    evidence: clipEvidence(evOf(p.evidence).best),
    evidenceFull: evOf(p.evidence).best,
    evidenceMemo: evOf(p.evidence).memos,
    source: (p.source || '').replace('manual-research', '리서치'),
    deadline: p.deadline, status: p.status, open: isOpen(p.status),
    checked: p.last_checked, history: p.history || [], review: p.review || '',
    url: p.url === 'seed' ? null : p.url, hiring: false,   // 'seed' = 원문 없는 시드 조사 기록(스펙 1-3) — 링크 아님
    mergedInto: p.merged_into || null,   // 중복 병합 표시(스펙 1-2) — 아래 필터에서 제외된다
    alsoSeen: dupesOf(p),                // 같은 기회를 수집한 다른 출처·다른 회차
    first: p.first_seen,
    // 상세 패널용 원문 필드 — 표에는 싣지 않고 우측 패널에서만 보여준다
    process: p.process_raw || '',
    policyRaw: p.policy_raw || '',
    assignment: p.assignment_type && p.assignment_type !== 'unknown' ? p.assignment_type : '',
    note: p.note || '',
    stateRaw: p.state_raw || '',
    evidenceAll: evOf(p.evidence).quotes,
    stack: p.positions_raw || (p.positions || []).join(' '),
    hay: hay(
      p.company, p.title, p.positions_raw, p.positions, p.assignment_type, p.process_raw,
      p.policy_raw, p.note, evidenceText(p.evidence), p.source,
    ),
  })),
  ...eventsRaw.map((e) => ({
    kind: 'event', id: e.id, name: e.title, title: e.title,
    sub: [e.host, e.team && e.team !== 'unknown' ? e.team : ''].filter(Boolean).join(' | '),
    type: EVENT_TYPE[e.type] || e.type, positions: [],
    policy: EV_POLICY[e.ai_usage] || EV_POLICY.unknown,
    policyKey: e.ai_usage === 'required' ? 'required' : e.ai_usage === 'allowed' ? 'allowed' : e.ai_usage,
    evidence: clipEvidence(evOf(e.evidence).best),
    evidenceFull: evOf(e.evidence).best,
    evidenceMemo: evOf(e.evidence).memos,
    source: e.source,
    deadline: e.apply_deadline || e.submit_deadline, status: e.status, open: isOpen(e.status),
    checked: e.last_checked, history: e.history || [], review: e.review || '',
    url: e.url === 'seed' ? null : e.url, hiring: !!e.hiring_link, first: e.first_seen,
    mergedInto: e.merged_into || null,
    alsoSeen: dupesOf(e),
    stack: [EVENT_TYPE[e.type] || e.type, e.format].filter(Boolean).join(' '),
    prize: e.prize || '',
    process: '',
    policyRaw: '',
    assignment: '',
    note: e.note || '',
    stateRaw: '',
    format: e.format && e.format !== 'unknown' ? e.format : '',
    team: e.team && e.team !== 'unknown' ? e.team : '',
    resultDate: e.result_date || '',
    evidenceAll: evOf(e.evidence).quotes,
    hay: hay(e.title, e.host, e.prize, evidenceText(asEvidence(e.evidence)), e.note, e.source, EVENT_TYPE[e.type] || e.type, e.format),
  })),
]
  .filter((r) => !r.mergedInto && (r.kind === 'posting' || r.policyKey !== 'banned')) // 중복 병합 행·banned 이벤트 노출 제외
  .map((r) => ({ ...r, dd: dday(r.deadline) }))
  .sort((a, b) => {
    if (a.open !== b.open) return a.open ? -1 : 1
    const ad = a.dd, bd = b.dd
    if (ad === null && bd === null) return 0
    if (ad === null) return 1
    if (bd === null) return -1
    return ad - bd
  })

export const platforms = platformsRaw
export const news = newsRaw

export const runs = [...changelogRaw.events].sort((a, b) => (a.date < b.date ? 1 : -1))

const last7 = runs.slice(0, 7).reverse()
export const sparkPoints = last7.map((r) =>
  ((r.new_postings || []).length + (r.new_events || []).length))

export const meta = metaRaw
import commitHash from './commit.js'
export const commit = commitHash

// ==== AI 정책 변경 추적 ====
// 두 출처를 합친다: (1) changelog.json 일별 런의 policy_changed id 목록,
// (2) 각 레코드 history의 policy_changed 이벤트(from → to + evidence).
// changelog만으로는 id만 남아 기업명·변경 방향을 알 수 없어 (2)로 보강한다.
export const policyChanges = (() => {
  const byId = new Map(rows.map((r) => [r.id, r]))
  const labelDate = (r, date) => (r?.history || []).find((h) => h.event === 'policy_changed' && h.date === date)
  const out = []
  const seen = new Set()
  const push = (c) => {
    const key = c.id + '@' + c.date
    if (seen.has(key)) return
    seen.add(key)
    out.push(c)
  }
  for (const run of changelogRaw.events || []) {
    for (const id of run.policy_changed || []) {
      const r = byId.get(id)
      const h = labelDate(r, run.date)
      push({
        id, date: run.date, name: r?.name || id, title: r?.title || '',
        kind: r?.kind || 'posting', url: r?.url || '',
        from: h?.from ?? null, to: h?.to ?? r?.policyKey ?? null,
        evidence: h?.evidence || r?.evidence || '',
      })
    }
  }
  for (const r of rows) {
    for (const h of r.history || []) {
      if (h.event !== 'policy_changed') continue
      push({
        id: r.id, date: h.date, name: r.name, title: r.title,
        kind: r.kind, url: r.url,
        from: h.from ?? null, to: h.to ?? r.policyKey,
        evidence: h.evidence || r.evidence || '',
      })
    }
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : -1))
})()

export const policyChangedIds = new Set(policyChanges.map((c) => c.id))
export const policyChangeByID = new Map(policyChanges.map((c) => [c.id, c]))

export const stats = {
  tracked: rows.filter((r) => r.open).length,
  aiExplicit: rows.filter((r) => r.open && !['unspecified', 'unknown', 'banned'].includes(r.policyKey)).length,
  policyChanged7d: runs.slice(0, 7).reduce((s, r) => s + (r.policy_changed || []).length, 0),
  policyChangedTracked: rows.filter((r) => r.open && policyChangedIds.has(r.id)).length,
  d7: rows.filter((r) => r.open && r.dd !== null && r.dd >= 0 && r.dd <= 7).length,
  hiring: rows.filter((r) => r.open && r.hiring).length,
  review: rows.filter((r) => r.review === 'needs_review').length,
  lastRun: metaRaw.last_run,
}
