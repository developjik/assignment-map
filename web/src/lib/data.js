import postingsRaw from '../../../data/postings.json'
import eventsRaw from '../../../data/events.json'
import platformsRaw from '../../../data/platforms.json'
import newsRaw from '../../../data/news.json'
import changelogRaw from '../../../data/changelog.json'
import metaRaw from '../../../data/meta.json'

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
export const ddayText = (d) => d === null ? '상시' : d < 0 ? '마감' : d === 0 ? 'D-0' : 'D-' + d

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

const isOpen = (s) => ['open', 'upcoming', 'judging'].includes(s)

export const rows = [
  ...postingsRaw.map((p) => ({
    kind: 'posting', id: p.id, name: p.company, title: p.title || '',
    sub: p.positions_raw || (p.positions || []).join('/'),
    type: '채용', policy: POLICY[p.ai_policy] || POLICY.unspecified,
    policyKey: p.ai_policy, evidence: (p.evidence || [])[0]?.quote || p.note || '',
    source: (p.source || '').replace('manual-research', '리서치'),
    deadline: p.deadline, status: p.status, open: isOpen(p.status),
    checked: p.last_checked, history: p.history || [], review: p.review || '',
    url: p.url, hiring: false,
    first: p.first_seen,
  })),
  ...eventsRaw.map((e) => ({
    kind: 'event', id: e.id, name: e.title, title: e.title,
    sub: [e.host, e.team && e.team !== 'unknown' ? e.team : ''].filter(Boolean).join(' | '),
    type: { hackathon: '해커톤', competition: '대회', contest: '공모전' }[e.type] || e.type,
    policy: EV_POLICY[e.ai_usage] || EV_POLICY.unknown,
    policyKey: e.ai_usage === 'required' ? 'required' : e.ai_usage === 'allowed' ? 'allowed' : e.ai_usage,
    evidence: e.evidence || '', source: e.source,
    deadline: e.apply_deadline || e.submit_deadline, status: e.status, open: isOpen(e.status),
    checked: e.last_checked, history: e.history || [], review: e.review || '',
    url: e.url, hiring: !!e.hiring_link, first: e.first_seen,
  })),
]
  .filter((r) => r.kind === 'posting' || r.policyKey !== 'banned') // banned 이벤트 노출 제외
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

export const stats = {
  tracked: rows.filter((r) => r.open).length,
  aiExplicit: rows.filter((r) => r.open && !['unspecified', 'unknown', 'banned'].includes(r.policyKey)).length,
  policyChanged7d: runs.slice(0, 7).reduce((s, r) => s + (r.policy_changed || []).length, 0),
  d7: rows.filter((r) => r.open && r.dd !== null && r.dd >= 0 && r.dd <= 7).length,
  hiring: rows.filter((r) => r.open && r.hiring).length,
  review: rows.filter((r) => r.review === 'needs_review').length,
  lastRun: metaRaw.last_run,
}
