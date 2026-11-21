#!/usr/bin/env node
// devto.mjs — DEV Hackathon Camp(https://dev.to/hackathons) 피드 정규화.
//
// 실측(2026-11-21): /hackathons 는 SSR(64KB). 'Hackathon Camp' 아티클 피드로,
// 진행 공식 해커톤 안내·발표 아티클이 /hackathons/{slug} URL로 나온다 — 구조화된
// 대회 목록이 아니라 '발견 신호' 계층(gnews 계열)으로 쓴다. /hackathons/settings 등
// UI 링크는 제외. 보조로 열린 API(/api/articles?tag=hackathon)도 있다.
//
// 사용: curl -s 'https://dev.to/hackathons' | node collector/parsers/devto.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** SSR HTML → { items: [{slug,title,url}], count } */
export function parseDevtoList(html) {
  const body = String(html || '')
  const items = []
  const seen = new Set()
  // 절대/상대 href 모두: <a href="https://dev.to/hackathons/{slug}" ...>제목</a>
  const a = /<a[^>]+href="(?:https:\/\/dev\.to)?\/hackathons\/([a-z0-9-]+)"[^>]*>([^<]{6,140})<\/a>/g
  let m
  while ((m = a.exec(body)) !== null) {
    const slug = m[1]
    if (slug === 'settings' || seen.has(slug)) continue
    seen.add(slug)
    items.push({ slug, title: m[2].replace(/&amp;/g, '&').trim(), url: `https://dev.to/hackathons/${slug}` })
  }
  return { items, count: items.length }
}

/** /api/articles?tag=hackathon JSON → 아티클 요약(신호용) */
export function parseDevtoApi(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json
  if (!Array.isArray(data)) return { items: [], count: 0, note: '배열 아님 — 응답 형식 변경. canary 확인' }
  const items = data.map((a) => ({
    slug: a.slug,
    title: a.title,
    url: a.url,
    published: (a.published_at || '').slice(0, 10),
    tags: a.tag_list || [],
  }))
  return { items, count: items.length }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const stdin = fs.readFileSync(0, 'utf8')
  const mode = process.argv[2] === 'api' ? parseDevtoApi(stdin) : parseDevtoList(stdin)
  console.log(JSON.stringify(mode, null, 1))
}
