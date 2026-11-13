// 가이드 매핑 — 빌드 타임에 컴파일된 data/guides/*.md 산출물을 공고/이벤트 행에 붙인다.
// 매핑 규칙은 가이드 front matter(match.positions / match.keywords / match.types)에만 있고,
// 여기서는 점수 계산과 이유 문장만 만든다. 규칙을 바꾸려면 마크다운을 고친다.
import compiled from '../data/guides.generated.json'

export const guides = compiled.guides
const byId = new Map(guides.map((g) => [g.id, g]))

export function guideById(id) {
  return byId.get(id) || null
}

// 포지션 코드는 data.js 의 값(frontend, backend, ai ...)을 그대로 쓴다
const POS_LABEL = {
  frontend: 'FE', backend: 'BE', fullstack: '풀스택', ai: 'AI', data: '데이터',
  mobile: '모바일', devops: '인프라', security: '보안', qa: 'QA', design: '디자인',
  planning: '기획', pm: 'PM', etc: '기타',
}

// 직군도 유형도 걸리지 않을 때의 기본값 — 공고는 API/DB/배포 기본기, 행사는 AI 활용 제작이 기본이다
const FALLBACK = { posting: 'fullstack-api', event: 'ai-agent' }

const SCORE_POS = 50
const SCORE_TYPE = 15
const SCORE_KW = 8
const KW_CAP = 3

// 한글 키워드는 부분 일치, 영문 키워드는 단어 경계로 본다
// ('api' 가 "Acute Patient" 같은 문장 중간에 걸리는 오탐을 막는다)
function hit(hay, kw) {
  if (/^[a-z0-9.+#-]+$/.test(kw)) {
    const esc = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`).test(hay)
  }
  return hay.includes(kw)
}

function hayOf(r) {
  // 표 검색 인덱스(r.hay)에는 출처명이 섞여 있어 'devpost-api' 같은 문자열이 'api'로 오탐된다.
  // 가이드 매핑은 공고 내용만 본다.
  return [
    r.name, r.title, r.sub, r.type, r.assignment, r.format, r.note, r.evidence,
    (r.positions || []).join(' '),
  ].filter(Boolean).join(' ').toLowerCase()
}

// 행 하나에 가장 맞는 가이드를 고른다. 반환: { guide, reason, score }
export function matchGuide(r) {
  const hay = hayOf(r)
  const positions = r.positions || []
  let best = null

  for (const g of guides) {
    let score = 0
    const why = []

    const pos = positions.find((p) => (g.match.positions || []).includes(p))
    if (pos) { score += SCORE_POS; why.push(`${POS_LABEL[pos] || pos} 포지션`) }

    if ((g.match.types || []).includes(r.type)) { score += SCORE_TYPE; why.push(`${r.type} 유형`) }

    const hits = (g.match.keywords || []).filter((k) => hit(hay, k))
    if (hits.length) {
      score += Math.min(hits.length, KW_CAP) * SCORE_KW
      why.push(`키워드 ${hits.slice(0, KW_CAP).join(', ')}`)
    }

    if (score > 0 && (!best || score > best.score || (score === best.score && g.priority > best.guide.priority))) {
      best = { guide: g, score, why }
    }
  }

  if (best) return { guide: best.guide, reason: best.why.join(' + '), score: best.score }

  const fallback = guideById(FALLBACK[r.kind] || guides[0].id) || guides[0]
  const why = r.kind === 'posting' ? '직군 신호 없음 기본값' : '유형 신호 없음 기본값'
  return { guide: fallback, reason: why, score: 0 }
}

export function guideCoverage(rows) {
  const used = new Map()
  for (const r of rows) {
    const id = matchGuide(r).guide.id
    used.set(id, (used.get(id) || 0) + 1)
  }
  return guides.map((g) => ({ id: g.id, label: g.label, count: used.get(g.id) || 0 }))
}
