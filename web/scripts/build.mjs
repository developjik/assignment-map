#!/usr/bin/env node
// build — commit hash 주입 → rollup(terser) → 정적 자산 복사 → 피드/사이트맵 생성. 순수 JS.
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { rollup } from 'rollup'
import { createRequire } from 'node:module'
import { generateFeeds, SITE } from './generate-feeds.mjs'

const require = createRequire(import.meta.url)
const cwd = process.cwd()

let commit = 'dev'
try { commit = execSync('git rev-parse --short HEAD', { cwd: cwd + '/..' }).toString().trim() } catch {}

fs.writeFileSync(cwd + '/src/lib/commit.js', `// build.mjs가 생성\nexport default '${commit}'\n`)

const plugins = [
  require('@rollup/plugin-node-resolve').default({ extensions: ['.js', '.jsx'] }),
  require('@rollup/plugin-commonjs')(),
  require('@rollup/plugin-json')(),
  require('@rollup/plugin-babel').default({
    presets: [[require.resolve('@babel/preset-react'), { runtime: 'automatic' }]],
    extensions: ['.js', '.jsx'], babelHelpers: 'bundled', exclude: 'node_modules/**',
  }),
  require('@rollup/plugin-terser').default({
    compress: { drop_console: true, drop_debugger: true },
    mangle: { toplevel: true },
    format: { comments: false },
  }),
]

const bundle = await rollup({ input: cwd + '/src/main.jsx', plugins, external: [] })
const ver = `${commit}-${Date.now().toString(36)}`
await bundle.write({
  file: cwd + '/dist/assets/app.js', format: 'iife', name: 'AssignmentMap',
  intro: "const process={env:{NODE_ENV:'production'}};",
})
await bundle.close()

// ==== 정적 자산 ====
const html = fs.readFileSync(cwd + '/index.html', 'utf8')
  .replace('./assets/app.js', `./assets/app.js?v=${ver}`)
  .replace('./styles.css', `./styles.css?v=${ver}`)
fs.writeFileSync(cwd + '/dist/index.html', html)
fs.copyFileSync(cwd + '/src/styles.css', cwd + '/dist/styles.css')

// ==== D. 공개 JSON API ====
const dataDir = cwd + '/../data'
const distData = cwd + '/dist/data'
fs.mkdirSync(distData, { recursive: true })
for (const f of ['postings.json', 'events.json', 'platforms.json', 'news.json', 'changelog.json', 'meta.json']) {
  try { fs.copyFileSync(path.join(dataDir, f), path.join(distData, f)) } catch {}
}

// ==== A. 피드 (RSS 2.0 + JSON Feed 1.1) ====
const feeds = generateFeeds({ dataDir, distDir: cwd + '/dist' })

// ==== B. sitemap.xml ====
const now = new Date()
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE}/</loc><lastmod>${now.toISOString().slice(0,10)}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>
  <url><loc>${SITE}/data/postings.json</loc><lastmod>${now.toISOString().slice(0,10)}</lastmod></url>
  <url><loc>${SITE}/data/events.json</loc><lastmod>${now.toISOString().slice(0,10)}</lastmod></url>
  <url><loc>${SITE}/feed.xml</loc><lastmod>${now.toISOString().slice(0,10)}</lastmod></url>
  <url><loc>${SITE}/feed.json</loc><lastmod>${now.toISOString().slice(0,10)}</lastmod></url>
</urlset>`
fs.writeFileSync(cwd + '/dist/sitemap.xml', sitemap)

// ==== B. robots.txt ====
fs.writeFileSync(cwd + '/dist/robots.txt', `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`)

// ==== C. OG 메타 이미지 (1200x630) — 수집 지표를 그대로 그린다 ====
try {
  const og = execSync('python3 scripts/generate-og.py 2>&1', { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim()
  if (og) console.log(og)
} catch (e) {
  const why = (e.stderr || e.stdout || '').toString().trim().split('\n').pop()
  console.warn(`OG SKIP — python3/generate-og.py 실행 실패${why ? ` (${why})` : ''}`)
}
// 생성이 건너뛰어진 환경(폰트·Pillow 없음)에서는 저장된 스냅샷으로 채운다 — 미리보기 404를 막는다
const distOg = cwd + '/dist/og-image.png'
if (!fs.existsSync(distOg) && fs.existsSync(cwd + '/og-image.png')) {
  fs.copyFileSync(cwd + '/og-image.png', distOg)
  console.log('OG FALLBACK — 저장된 og-image.png 스냅샷 사용(수치가 마지막 커밋 시점)')
}

const kb = (fs.statSync(cwd + '/dist/assets/app.js').size / 1024).toFixed(1)
const ogKb = fs.existsSync(cwd + '/dist/og-image.png') ? (fs.statSync(cwd + '/dist/og-image.png').size / 1024).toFixed(0) + 'KB' : 'none'
console.log(`BUILD OK — app.js ${kb}KB (terser) | feed.xml + feed.json ${feeds.count} items | sitemap+robots+data/*.json OK | og-image.png ${ogKb} | commit ${commit}`)
