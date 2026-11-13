#!/usr/bin/env node
// build-guides — data/guides/*.md 를 파싱해 정적 JSON으로 컴파일한다.
// 사람은 마크다운만 고친다. 사이트는 빌드 산출물(src/data/guides.generated.json)만 읽으므로
// 런타임에 마크다운 파서가 필요 없고, 가이드 문구가 바뀌면 빌드 타임에 실패로 드러난다.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HEAD = {
  '본질': 'essence',
  'AI 워크플로': 'steps',
  '실전 프롬프트': 'prompts',
  '탈락 방지': 'checklist',
}

const REQUIRED_KEYS = ['id', 'label', 'badge', 'summary']
const STEPS_MIN = 3
const PROMPTS_MIN = 1
const CHECKLIST_MIN = 4

// front matter 는 YAML 부분집합만 지원한다: key: value, key: [a, b], 중첩 블록(match:)
function parseFront(lines, file) {
  const out = {}
  let block = null
  for (const raw of lines) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue
    const top = raw.match(/^([A-Za-z_][\w-]*):\s*(.*)$/)
    if (top) {
      const [, k, v] = top
      if (v === '') { block = {}; out[k] = block; continue }
      block = null
      out[k] = v === 'true' ? true : v === 'false' ? false : /^-?\d+$/.test(v) ? Number(v) : v
      continue
    }
    const sub = raw.match(/^\s+([A-Za-z_][\w-]*):\s*(.*)$/)
    if (sub && block) {
      const [, k, v] = sub
      block[k] = v.startsWith('[')
        ? v.replace(/^\[|\]$/g, '').split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
        : v
      continue
    }
    throw new Error(`${file}: front matter 해석 불가 -> ${JSON.stringify(raw)}`)
  }
  for (const k of REQUIRED_KEYS) if (!out[k]) throw new Error(`${file}: front matter 에 ${k} 없음`)
  if (!out.match || typeof out.match !== 'object') throw new Error(`${file}: match 블록 없음`)
  out.match.positions = out.match.positions || []
  out.match.keywords = out.match.keywords || []
  out.match.types = out.match.types || []
  out.priority = Number(out.priority || 0)
  out.fallback = out.fallback === true
  return out
}

function parseBody(lines, file) {
  const out = { essence: [], steps: [], prompts: [], checklist: [] }
  let section = null
  let step = null
  let prompt = null
  let fence = false
  let buf = []

  const stopFence = () => {
    const text = buf.join('\n').trim()
    if (section === 'prompts' && prompt) prompt.text = text
    else if (section === 'steps' && step) step.code = text
    buf = []
    fence = false
  }

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '')
    if (/^```/.test(line)) { if (fence) stopFence(); else { fence = true; buf = [] } continue }
    if (fence) { buf.push(line); continue }

    const h2 = line.match(/^##\s+(.+?)\s*$/)
    if (h2) {
      const name = h2[1]
      if (!HEAD[name]) throw new Error(`${file}: 알 수 없는 섹션 "${name}" (허용: ${Object.keys(HEAD).join(', ')})`)
      section = HEAD[name]
      step = null
      prompt = null
      continue
    }
    const h3 = line.match(/^###\s+(.+?)\s*$/)
    if (h3) {
      if (section === 'steps') { step = { title: h3[1], body: [] }; out.steps.push(step) }
      else if (section === 'prompts') { prompt = { title: h3[1], text: '' }; out.prompts.push(prompt) }
      else throw new Error(`${file}: "${h3[1]}" 소제목은 ${section} 섹션에서 쓸 수 없다`)
      continue
    }

    const t = line.trim()
    if (!t) continue
    if (section === 'essence') out.essence.push(t)
    else if (section === 'steps' && step) step.body.push(t)
    else if (section === 'checklist') {
      const m = t.match(/^-\s+\[[ xX]\]\s+(.+)$/)
      if (!m) throw new Error(`${file}: 체크리스트는 "- [ ] 문장" 형식만 쓴다 -> ${JSON.stringify(t)}`)
      out.checklist.push(m[1].trim())
    } else throw new Error(`${file}: 내용이 섹션 밖에 있다 -> ${JSON.stringify(t)}`)
  }
  if (fence) throw new Error(`${file}: 코드 블록이 닫히지 않았다`)
  return out
}

export function parseGuide(text, file = 'guide.md') {
  const lines = text.split('\n')
  if (lines[0].trim() !== '---') throw new Error(`${file}: front matter 는 첫 줄 --- 로 시작해야 한다`)
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---')
  if (end < 0) throw new Error(`${file}: front matter 종료 --- 없음`)
  const head = parseFront(lines.slice(1, end), file)
  const body = parseBody(lines.slice(end + 1), file)

  const guide = {
    id: head.id, label: head.label, badge: head.badge, summary: head.summary,
    priority: head.priority, fallback: head.fallback,
    match: head.match,
    essence: body.essence,
    // 제목의 "1단계." 접두는 렌더가 번호를 따로 그리므로 떼어 낸다
    steps: body.steps.map((s, i) => ({
      n: i + 1, title: s.title.replace(/^\d+\s*단계\s*[.:]?\s*/, ''), body: s.body,
      ...(s.code ? { code: s.code } : {}),
    })),
    prompts: body.prompts.filter((p) => p.text),
    checklist: body.checklist,
  }

  if (!guide.essence.length) throw new Error(`${file}: 본질 섹션이 비었다`)
  if (guide.steps.length < STEPS_MIN) throw new Error(`${file}: 워크플로 단계가 ${STEPS_MIN}개 미만 (${guide.steps.length})`)
  if (guide.prompts.length < PROMPTS_MIN) throw new Error(`${file}: 실전 프롬프트가 없다`)
  if (guide.checklist.length < CHECKLIST_MIN) throw new Error(`${file}: 체크리스트가 ${CHECKLIST_MIN}개 미만 (${guide.checklist.length})`)
  for (const s of guide.steps) if (!s.body.length) throw new Error(`${file}: "${s.title}" 단계 본문이 비었다`)
  return guide
}

export function buildGuides({ repoRoot, outFile }) {
  const dir = path.join(repoRoot, 'data', 'guides')
  if (!fs.existsSync(dir)) throw new Error(`가이드 디렉터리 없음: ${dir}`)
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort()
  if (!files.length) throw new Error('가이드 마크다운이 하나도 없다')

  const guides = files.map((f) => parseGuide(fs.readFileSync(path.join(dir, f), 'utf8'), f))

  const ids = new Set()
  for (const g of guides) {
    if (ids.has(g.id)) throw new Error(`가이드 id 중복: ${g.id}`)
    ids.add(g.id)
  }
  // 매핑 키워드는 소문자로만 비교한다 (data.js 의 hay 가 소문자 인덱스)
  for (const g of guides) g.match.keywords = g.match.keywords.map((k) => k.toLowerCase())

  const payload = { version: 1, source: 'data/guides', count: guides.length, generatedBy: 'web/scripts/build-guides.mjs', guides }
  fs.mkdirSync(path.dirname(outFile), { recursive: true })
  fs.writeFileSync(outFile, JSON.stringify(payload, null, 2) + '\n')

  const steps = guides.reduce((s, g) => s + g.steps.length, 0)
  const prompts = guides.reduce((s, g) => s + g.prompts.length, 0)
  const checks = guides.reduce((s, g) => s + g.checklist.length, 0)
  return { count: guides.length, steps, prompts, checks, ids: [...ids], outFile }
}

// 직접 실행: node scripts/build-guides.mjs
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const res = buildGuides({ repoRoot: path.resolve(root, '..'), outFile: path.join(root, 'src', 'data', 'guides.generated.json') })
  console.log(`GUIDES OK — ${res.count}개 아키타입 | 단계 ${res.steps} | 프롬프트 ${res.prompts} | 체크 ${res.checks} | ${path.relative(root, res.outFile)}`)
}
