#!/usr/bin/env node
// hn.mjs — HN Algolia Who's Hiring 스레드 탐지
//
// 규칙:
//  - 월간 스레드는 지연 게시될 수 있다 — 개시 확인 후 파싱하는 유연 운영(11-05).
//  - hitsPerPage=1 신규 체크로 최신 스레드 존재만 확인; 전체 파싱은 월 1일(T3).
//  - 타이틀 형식: "Ask HN: Who is hiring? (November 2026)".
//
// 사용:
//   curl -s 'https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&hitsPerPage=1' \
//     | node collector/parsers/hn.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Algolia 응답 → { nbHits, latest: {id, title, month, createdAt} | null } */
export function parseHnWhoishiring(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json
  const hit = Array.isArray(data.hits) ? data.hits[0] : null
  if (!hit) return { nbHits: data.nbHits ?? null, latest: null, note: 'hits 없음' }
  const monthM = /Who is hiring\?\s*\((.+?)\)/.exec(hit.title || '')
  return {
    nbHits: data.nbHits ?? null,
    latest: {
      id: hit.objectID,
      title: hit.title ?? null,
      month: monthM ? monthM[1].trim() : null,
      createdAt: hit.created_at ?? null,
    },
  }
}

// CLI (모듈로 import 되었을 때는 실행하지 않는다)
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(parseHnWhoishiring(fs.readFileSync(0, 'utf8')), null, 1))
}
