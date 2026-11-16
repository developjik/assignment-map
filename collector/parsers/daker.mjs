#!/usr/bin/env node
// daker.mjs — daker.ai(데이콘 계열 AI 해커톤) public-list 정규화
//
// 판정 규칙(11-15 채택 시 확정):
//  - registrationDeadline 마감 = 참가 불가(종결 1차 근거)
//  - lastStageEndDate = judging 전환 근거
//  - 시각은 UTC ISO("2026-11-20T01:00:00.000Z") → KST 날짜(YYYY-MM-DD)로 변환해 돌려준다.
//  - limit=50 상한(실측 24건), status: published | closed.
//
// 사용:
//   curl -s 'https://daker.ai/api/hackathons/public-list?limit=50' | node collector/parsers/daker.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** UTC ISO → KST 날짜(YYYY-MM-DD). 파싱 실패 시 null. */
export const kstDate = (iso) => {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10)
}

/** public-list JSON(최상위 배열) → { items, count, open } */
export function parseDakerList(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json
  if (!Array.isArray(data)) return { items: [], count: 0, note: '최상위 배열 아님 — 응답 형식 변경. canary 확인' }
  const items = data.map((h) => ({
    id: h.id,
    title: h.title,
    slug: h.slug,
    organizer: h.organizerName ?? null,
    status: h.status ?? null, // published | closed
    type: h.hackathonType ?? null,
    registration_deadline: kstDate(h.registrationDeadline),
    start: kstDate(h.startDate),
    end: kstDate(h.endDate),
    last_stage_end: kstDate(h.lastStageEndDate),
    prize: h.totalPrize ?? null,
    participants: h.participantCount ?? null,
    tagline: h.tagline ?? null,
  }))
  return { items, count: items.length, published: items.filter((i) => i.status === 'published').length }
}

// CLI (모듈로 import 되었을 때는 실행하지 않는다)
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(parseDakerList(fs.readFileSync(0, 'utf8')), null, 1))
}
