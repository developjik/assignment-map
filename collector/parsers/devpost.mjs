#!/usr/bin/env node
// devpost.mjs — Devpost 오픈 해커톤 API 정규화
//
// 역사적 함정(전부 fixture 테스트로 굳힘):
//  - 응답 키는 `hackathons`(results 아님). 총 수는 meta.total_count.
//  - `submission_period_dates`는 배열이 아니라 문자열("Oct 30 - Dec 04, 2026") —
//    인덱싱하면 오탐(11-06 사고).
//  - `url`은 서브도메인형("https://kiroween.devpost.com/")이며 slug 필드는 없다.
//    기추적 대조는 events.json의 url과 직접 비교(11-08 확정).
//  - 제목이 개최 중 바뀔 수 있다 — 기추적 매칭은 id나 짧은 고유 토큰으로(11-15).
//  - '?status=open'은 '제출 오픈' 기준이라 upcoming의 리스트 이탈은 종결이 아님(11-05).
//
// 사용:
//   curl -s 'https://devpost.com/api/hackathons?status=open&page=1' | node collector/parsers/devpost.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** API JSON → { total, perPage, items:[{id,title,url,period,timeLeft,themes,prize,registrations,org,inviteOnly}] } */
export function parseDevpostOpen(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json
  const list = data.hackathons
  if (!Array.isArray(list)) return { total: null, perPage: null, items: [], count: 0, note: 'hackathons 키 없음 — 응답 형식 변경. canary 확인' }
  const items = list.map((h) => ({
    id: h.id,
    title: h.title,
    url: h.url, // 서브도메인형 — events.json url과 직접 비교
    period: h.submission_period_dates, // 문자열 그대로(인덱싱 금지)
    timeLeft: h.time_left_to_submission ?? null,
    themes: Array.isArray(h.themes) ? h.themes : [],
    prize: h.prize_amount ?? null,
    registrations: h.registrations_count ?? null,
    org: h.organization_name ?? null,
    invite_only: !!h.invite_only,
    winners_announced: !!h.winners_announced,
  }))
  return { total: data.meta?.total_count ?? null, perPage: data.meta?.per_page ?? null, items, count: items.length }
}

// CLI (모듈로 import 되었을 때는 실행하지 않는다)
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(parseDevpostOpen(fs.readFileSync(0, 'utf8')), null, 1))
}
