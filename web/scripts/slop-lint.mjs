#!/usr/bin/env node
// slop-lint — AI 티 패턴 16체크. exit 1이면 빌드 중단 (build 스크립트에 내장).
// 기준: docs/design/anti-slop.md (Anthropic frontend-design / Slop Patterns / slop-lint 교집합)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const files = []
const walk = (d) => {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f)
    if (fs.statSync(p).isDirectory()) { if (!['node_modules', 'dist'].includes(f)) walk(p) }
    else if (/\.(jsx?|css|html)$/.test(f)) files.push(p)
  }
}
walk(path.join(root, 'src'))
files.push(path.join(root, '..', 'index.html'))
if (fs.existsSync(path.join(root, 'index.html'))) files.push(path.join(root, 'index.html'))

const src = files.filter(f => fs.existsSync(f)).map(f => ({ f: path.relative(root, f), s: fs.readFileSync(f, 'utf8') }))
const all = src.map(x => x.s).join('\n')
let fails = []
const flag = (name, msg) => fails.push(`[${name}] ${msg}`)

// 1. 그라디언트 전면 금지 (진짜 단말 톤)
if (/gradient\(/i.test(all)) src.forEach(({ f, s }) => { if (/gradient\(/i.test(s)) flag('gradient', `${f}`) })
// 2. gradient-clipped 텍스트
if (/background-clip:\s*text|-webkit-background-clip:\s*text/i.test(all)) flag('gradient-text', 'background-clip: text 발견')
// 3. 남용 폰트 리드
if (/(font-family|--mono)[^;\n]*(Inter|Roboto|Geist|system-ui)[,)]/i.test(all)) flag('overused-font', 'Inter/Roboto/Geist/system-ui 선행 폰트')
// 4. 글래스/글로우
if (/backdrop-filter|text-shadow|filter:\s*drop-shadow/i.test(all)) flag('glass-glow', 'glassmorphism/glow 효과')
if (/box-shadow:[^;]*(\d+px\s+){2,}\d+px\s+(rgba|#)/i.test(all) && !/inset/.test(all)) flag('drop-shadow', '외부 box-shadow')
// 5. 이모지
if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u.test(all)) flag('emoji', '이모지 문자 발견')
// 6. eyebrow (넓은 자간 대문자 라벨)
if (/letter-spacing:\s*0\.[1-9]\d*em/i.test(all)) flag('eyebrow', 'letter-spacing >= 0.1em')
// 7. 스톡 카피
const stock = ['seamless', 'supercharge', 'unlock your', 'empower', 'revolutioniz', 'redefin']
for (const w of stock) if (new RegExp(w, 'i').test(all)) flag('stock-copy', `"${w}"`)
// 8. fade-up 스크롤 리빌
if (/fade-?up|data-aos|scroll-reveal|animate-on-scroll/i.test(all)) flag('fade-up', '스크롤 리빌 애니메이션')
// 9. 중앙 정렬 히어로
if (/text-align:\s*center/i.test(all)) flag('centered', 'text-align: center 사용')
// 10. 둥근 radius 남발 (>4px)
for (const m of all.matchAll(/border-radius:\s*(\d+(?:\.\d+)?)px/g))
  if (parseFloat(m[1]) > 4) { flag('radius', `border-radius ${m[1]}px (>4)`); break }
// 11. middle-dot 메타
if (/\s·\s/.test(all)) flag('middle-dot', '" · " 구분자 발견 (각진 구분자 사용)')
// 12. 카드/히어로 클래스명
if (/(class|className)[='"{][^'"}]*\b(card|hero|glass|glow)\b/i.test(all)) flag('card-class', 'card/hero/glass 클래스명')
// 13-16. 크래프트 플로어 (양성 체크)
if (!/:focus-visible/.test(all)) flag('no-focus', ':focus-visible 스타일 없음')
if (!/prefers-reduced-motion/.test(all)) flag('no-reduced-motion', 'prefers-reduced-motion 대응 없음')
const html = src.find(x => x.f.endsWith('index.html'))?.s || ''
if (!/name="viewport"/.test(html)) flag('no-viewport', 'viewport 메타 없음')
for (const { f, s } of src) {
  if (!f.endsWith('.jsx') && !f.endsWith('.js')) continue
  for (const m of s.matchAll(/<img(?![^>]*\balt=)[^>]*>/g)) flag('img-no-alt', `${f}: <img> alt 없음`)
}

if (fails.length) {
  console.error(`SLOP-LINT FAIL (${fails.length}) — 빌드 중단`)
  fails.forEach(f => console.error(' -', f))
  process.exit(1)
}
console.log(`SLOP-LINT OK — 16체크 통과 (${files.length}개 파일)`)
