// 상세 패널·아코디언의 '관련 공고' — 지금 보고 있는 행과 이어서 볼 만한 모집 중 항목을 고른다.
//
// 매칭 순서(점수): 같은 회사/주최 > 같은 직무군 > 같은 AI 정책.
// 마감이 지난 항목과 자기 자신은 언제나 뺀다 (관련 공고는 '이어서 지원할 수 있는 것'이어야 한다).

const normName = (s) => (s || '')
  .replace(/\(주\)|㈜|주식회사/g, '')
  .replace(/[^0-9a-z가-힣]/gi, '')
  .toLowerCase()

// 행사는 sub 가 "주최 | 팀구성" 형태라 주최만 떼어 쓴다
const hostOf = (r) => (r.kind === 'event' ? (r.sub || '').split('|')[0] : r.name)

const POLICY_RANK = { required: 3, allowed_graded: 2, allowed: 1 }

const ddayKey = (r) => (r.dd === null ? 1e9 : r.dd < 0 ? 1e6 - r.dd : r.dd)

export function relatedRows(r, rows, limit = 3) {
  if (!r) return []
  const myHost = normName(hostOf(r))
  const myPositions = r.kind === 'posting' ? r.positions || [] : []
  const scored = []
  for (const other of rows) {
    if (other.id === r.id || !other.open) continue
    let score = 0
    const sameHost = myHost && normName(hostOf(other)) === myHost
    if (sameHost) score += 4
    const sharedPositions = myPositions.length && other.kind === 'posting'
      ? myPositions.filter((p) => (other.positions || []).includes(p)).length
      : 0
    if (sharedPositions) score += Math.min(3, sharedPositions + 1)
    if (r.policyKey && other.policyKey === r.policyKey && POLICY_RANK[r.policyKey]) score += 1
    // 같은 종류(채용 과제↔채용 과제, 행사↔행사)를 살짝 앞세운다
    if (other.kind === r.kind) score += 0.5
    if (score > 0) scored.push({ r: other, score })
  }
  scored.sort((a, b) => b.score - a.score || ddayKey(a.r) - ddayKey(b.r) || a.r.name.localeCompare(b.r.name, 'ko'))
  return scored.slice(0, limit).map((s) => s.r)
}
