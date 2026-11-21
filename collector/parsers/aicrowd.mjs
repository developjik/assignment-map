#!/usr/bin/env node
// aicrowd.mjs — AIcrowd 챌린지(ML 대회) 리스트 정규화.
//
// 실측(2026-11-21): /challenges 는 SSR(283KB). 카드 구조 —
//   <a class="card-img-overlay" href="/challenges/{slug}"> … <span class="badge …">Active|Phase n: …</span>
//   … <h5 class="card-title"><a href="/challenges/{slug}">제목</a></h5> … prize-item-cash "$N+ Prize Money"
// 주의: /competitions 경로는 404(구 경로) — /challenges가 정확한 경로.
//
// 사용: curl -s 'https://www.aicrowd.com/challenges' | node collector/parsers/aicrowd.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** SSR HTML → { items: [{slug,title,url,status,prize}], count } */
export function parseAicrowdList(html) {
  const body = String(html || '')
  // 카드 단위로 split — card-challenge 컨테이너 청크에서 슬러그·제목·배지·상금을 뽑는다.
  const chunks = body.split('card card-challenge').slice(1)
  const items = []
  const seen = new Set()
  for (const ch of chunks) {
    const slugM = ch.match(/href="\/challenges\/([a-z0-9-]+)"/)
    if (!slugM) continue
    const slug = slugM[1]
    if (seen.has(slug)) continue
    const titleM = ch.match(/<h5 class="card-title"><a href="\/challenges\/[a-z0-9-]+">([^<]+)<\/a>/)
    const badgeM = ch.match(/<span class="badge[^"]*"[^>]*>\s*(?:<img[^>]*\/?>)?\s*([^<]*?)\s*<\/span>/)
    const prizeM = ch.match(/prize-item-cash">\s*([^<]+?)\s*<\/div>/)
    seen.add(slug)
    items.push({
      slug,
      title: titleM ? titleM[1].trim() : slug,
      url: `https://www.aicrowd.com/challenges/${slug}`,
      status: badgeM ? badgeM[1].trim() : null, // 'Active' | 'Phase 2: Completed' …
      prize: prizeM ? prizeM[1].trim() : null,  // '$150,000+ Prize Money'
    })
  }
  return { items, count: items.length }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const stdin = fs.readFileSync(0, 'utf8')
  console.log(JSON.stringify(parseAicrowdList(stdin), null, 1))
}
