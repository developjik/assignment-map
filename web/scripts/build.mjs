#!/usr/bin/env node
// build — commit hash 주입 → rollup(terser) → 정적 자산 복사. 순수 JS.
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { rollup } from 'rollup'
import { createRequire } from 'node:module'

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

// ==== A. RSS/Atom 피드 ====
const meta = JSON.parse(fs.readFileSync(path.join(dataDir, 'meta.json'), 'utf8'))
const postings = JSON.parse(fs.readFileSync(path.join(dataDir, 'postings.json'), 'utf8'))
const events = JSON.parse(fs.readFileSync(path.join(dataDir, 'events.json'), 'utf8'))
const SITE = 'https://developjik.github.io/assignment-map'
const now = new Date().toISOString()

const items = [
  ...postings.filter(p => p.status === 'open').map(p => ({
    title: `[채용] ${p.company} — ${p.ai_policy === 'required' ? 'AI 필수' : p.ai_policy === 'allowed_graded' ? 'AI 허용+채점' : p.ai_policy === 'allowed' ? 'AI 허용' : 'AI 미언급'}`,
    url: p.url || SITE, date: p.last_seen || p.first_seen || now,
    desc: `${p.positions_raw || ''} | 과제 전형${p.deadline ? ` | 마감 ${p.deadline}` : ''}`,
  })),
  ...events.filter(e => ['open','upcoming'].includes(e.status)).map(e => ({
    title: `[${({hackathon:'해커톤',competition:'대회',contest:'공모전',meetup:'밋업',conference:'컨퍼런스',workshop:'워크샵'})[e.type] || e.type}] ${e.title}`,
    url: e.url || SITE, date: e.apply_deadline || e.submit_deadline || now,
    desc: `${e.host || ''}${e.prize ? ` | ${e.prize}` : ''}${e.hiring_link ? ' | 채용연계' : ''}`,
  })),
].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 50)

const esc = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>과제지도 — AI로 만들어 제출하는 모든 기회</title>
<link>${SITE}</link>
<description>채용 과제·해커톤·대회·공모전·밋업의 AI 정책을 매일 추적</description>
<language>ko</language>
<lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
<atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml"/>
${items.map(i => `  <item>
    <title>${esc(i.title)}</title>
    <link>${esc(i.url)}</link>
    <description>${esc(i.desc)}</description>
    <pubDate>${new Date(i.date + 'T03:00:00+09:00').toUTCString()}</pubDate>
    <guid>${esc(i.url)}#${esc(i.date)}</guid>
  </item>`).join('\n')}
</channel>
</rss>`
fs.writeFileSync(cwd + '/dist/feed.xml', rss)

// ==== B. sitemap.xml ====
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE}/</loc><lastmod>${now.slice(0,10)}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>
  <url><loc>${SITE}/data/postings.json</loc><lastmod>${now.slice(0,10)}</lastmod></url>
  <url><loc>${SITE}/data/events.json</loc><lastmod>${now.slice(0,10)}</lastmod></url>
  <url><loc>${SITE}/feed.xml</loc><lastmod>${now.slice(0,10)}</lastmod></url>
</urlset>`
fs.writeFileSync(cwd + '/dist/sitemap.xml', sitemap)

// ==== B. robots.txt ====
fs.writeFileSync(cwd + '/dist/robots.txt', `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`)

const kb = (fs.statSync(cwd + '/dist/assets/app.js').size / 1024).toFixed(1)
const rssCount = items.length
console.log(`BUILD OK — app.js ${kb}KB (terser) | feed.xml ${rssCount} items | sitemap+robots+data/*.json OK | commit ${commit}`)
