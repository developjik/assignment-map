#!/usr/bin/env node
// generate-feeds.mjs — data/*.json에서 유효한 기회만 모아 정적 피드를 만든다.
//   dist/feed.xml   RSS 2.0
//   dist/feed.json  JSON Feed 1.1 (jsonfeed.org)
// build.mjs가 빌드 단계에서 호출하고, 단독 실행도 된다: node scripts/generate-feeds.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const SITE = 'https://developjik.github.io/assignment-map'
export const FEED_TITLE = '과제지도 — AI로 만들어 제출하는 모든 기회'
export const FEED_DESC = '채용 과제·해커톤·대회·공모전·밋업의 AI 정책을 매일 03:00 KST에 추적한다. 마감일과 원문 링크 포함.'

const EVENT_TYPE = { hackathon: '해커톤', competition: '대회', contest: '공모전', meetup: '밋업', conference: '컨퍼런스', workshop: '워크샵' }
const POLICY_LABEL = { required: 'AI 필수', allowed_graded: 'AI 허용+과정채점', allowed: 'AI 허용', banned: 'AI 금지', unspecified: 'AI 미언급', unknown: 'AI 확인필요' }
const OPEN_EVENT = new Set(['open', 'upcoming'])

// '2026-11', '2026' 같은 부분 날짜를 YYYY-MM-DD로 보정 (피드 날짜 형식 오류 방지)
export function normalizeDate(value, fallback) {
  const s = String(value || '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  if (/^\d{4}-\d{2}$/.test(s)) return s + '-01'
  if (/^\d{4}$/.test(s)) return s + '-01-01'
  return fallback
}

const firstQuote = (evidence) => {
  if (Array.isArray(evidence)) return evidence[0]?.quote || ''
  return evidence || ''
}

export function collectFeedItems(dataDir) {
  const read = (f) => JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8'))
  const postings = read('postings.json')
  const events = read('events.json')
  const meta = read('meta.json')
  const fallback = normalizeDate(meta.last_run, new Date().toISOString().slice(0, 10))

  const items = []
  for (const p of postings) {
    if (p.status !== 'open') continue
    const date = normalizeDate(p.last_seen || p.first_seen, fallback)
    items.push({
      id: `posting:${p.id}`,
      url: p.url || SITE,
      title: `[채용] ${p.company}${POLICY_LABEL[p.ai_policy] ? ' — ' + POLICY_LABEL[p.ai_policy] : ''}`,
      date,
      summary: [p.title, p.positions_raw, p.deadline ? `마감 ${p.deadline}` : '마감 미정', firstQuote(p.evidence)].filter(Boolean).join(' | '),
      tags: ['채용', p.ai_policy || 'unspecified', ...(p.positions || [])].filter(Boolean),
    })
  }
  for (const e of events) {
    if (!OPEN_EVENT.has(e.status)) continue
    if (e.ai_usage === 'banned') continue
    const date = normalizeDate(e.last_checked || e.first_seen, fallback)
    items.push({
      id: `event:${e.id}`,
      url: e.url || SITE,
      title: `[${EVENT_TYPE[e.type] || e.type || '이벤트'}] ${e.title}`,
      date,
      summary: [e.host, e.prize, e.apply_deadline || e.submit_deadline ? `마감 ${e.apply_deadline || e.submit_deadline}` : '마감 미정', e.hiring_link ? '채용연계' : '', e.evidence].filter(Boolean).join(' | '),
      tags: [EVENT_TYPE[e.type] || e.type || '이벤트', e.ai_usage || 'unknown', e.hiring_link ? '채용연계' : ''].filter(Boolean),
    })
  }
  items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.id.localeCompare(b.id)))
  return { items, counts: { postings: postings.length, events: events.length } }
}

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;')

const kstStamp = (date) => `${date}T03:00:00+09:00`
const rfc822 = (date) => new Date(kstStamp(date)).toUTCString()

export function renderRss(items, { now = new Date() } = {}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel>
<title>${esc(FEED_TITLE)}</title>
<link>${SITE}</link>
<description>${esc(FEED_DESC)}</description>
<language>ko</language>
<lastBuildDate>${now.toUTCString()}</lastBuildDate>
<generator>assignment-map web/scripts/generate-feeds.mjs</generator>
<atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml"/>
<atom:link href="${SITE}/feed.json" rel="alternate" type="application/feed+json"/>
${items.map((i) => `  <item>
    <title>${esc(i.title)}</title>
    <link>${esc(i.url)}</link>
    <description>${esc(i.summary)}</description>
    <category>${esc(i.tags[0] || '')}</category>
    <pubDate>${rfc822(i.date)}</pubDate>
    <guid isPermaLink="false">${esc(i.id)}</guid>
  </item>`).join('\n')}
</channel>
</rss>
`
}

export function renderJsonFeed(items, { now = new Date() } = {}) {
  const feed = {
    version: 'https://jsonfeed.org/version/1',
    title: FEED_TITLE,
    home_page_url: SITE + '/',
    feed_url: SITE + '/feed.json',
    description: FEED_DESC,
    language: 'ko',
    authors: [{ name: 'assignment-map', url: 'https://github.com/developjik/assignment-map' }],
    _generated: now.toISOString(),
    items: items.map((i) => ({
      id: i.id,
      url: i.url,
      title: i.title,
      content_text: i.summary,
      date_published: kstStamp(i.date),
      tags: i.tags,
    })),
  }
  return JSON.stringify(feed, null, 2) + '\n'
}

export function generateFeeds({ dataDir, distDir, now = new Date() } = {}) {
  const { items } = collectFeedItems(dataDir)
  fs.mkdirSync(distDir, { recursive: true })
  const xmlPath = path.join(distDir, 'feed.xml')
  const jsonPath = path.join(distDir, 'feed.json')
  fs.writeFileSync(xmlPath, renderRss(items, { now }))
  fs.writeFileSync(jsonPath, renderJsonFeed(items, { now }))
  return { count: items.length, paths: [xmlPath, jsonPath], items }
}

// 단독 실행: node scripts/generate-feeds.mjs
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const out = generateFeeds({ dataDir: path.join(web, '..', 'data'), distDir: path.join(web, 'dist') })
  console.log(`FEEDS OK — feed.xml + feed.json ${out.count} items`)
}
