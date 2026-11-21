#!/usr/bin/env node
// drivendata.mjs — DrivenData 공개 대회(AI 사회공헌) 리스트 정규화.
//
// 실측(2026-11-21): /competitions/ 는 SSR(300KB). 카드는 h3.panel-competition-title >
// a[href] (제목=앵커 텍스트). 섹션 헤더(Prize competitions / Benchmarks / Practice /
// Completed competitions)가 상태를 말한다 — 링크에서 가장 가까운 '이전' 헤더로 귀속.
// 화이트라벨 플랫폼 링크(platform.k12-ai-infrastructure.org/...)도 같은 카드 구조로 섞여
// 나온다 — href를 절대 URL 그대로 보존한다.
//
// 사용: curl -s 'https://www.drivendata.org/competitions/' | node collector/parsers/drivendata.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SECTION_STATUS = {
  'prize competitions': 'active',
  benchmarks: 'benchmark',
  'practice competitions': 'practice',
  'completed competitions': 'completed',
}

/** SSR HTML → { items: [{slug,title,url,status}], count } */
export function parseDrivendataList(html) {
  const body = String(html || '')
  // 섹션 헤더 위치 수집
  const headers = []
  const hRe = /<h[23][^>]*>\s*(Prize competitions|Benchmarks|Practice competitions|Completed competitions)\s*<\/h[23]>/gi
  let m
  while ((m = hRe.exec(body)) !== null)
    headers.push({ at: m.index, status: SECTION_STATUS[m[1].toLowerCase()] || m[1].toLowerCase() })
  const statusAt = (pos) => {
    let st = null
    for (const h of headers) { if (h.at < pos) st = h.status; else break }
    return st
  }
  const items = []
  const seen = new Set()
  const card = /<h3[^>]*panel-competition-title[^>]*>\s*<a href="([^"]+)"[^>]*>\s*([\s\S]*?)\s*<\/a>/g
  while ((m = card.exec(body)) !== null) {
    let href = m[1]
    if (href.startsWith('/')) href = 'https://www.drivendata.org' + href
    const slug = (href.match(/competitions\/(?:\d+\/)?([a-z0-9-]+)/i) || [])[1] || href
    if (seen.has(slug)) continue
    seen.add(slug)
    items.push({ slug, title: m[2].replace(/&amp;/g, '&').trim(), url: href, status: statusAt(m.index) })
  }
  return { items, count: items.length }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const stdin = fs.readFileSync(0, 'utf8')
  console.log(JSON.stringify(parseDrivendataList(stdin), null, 1))
}
