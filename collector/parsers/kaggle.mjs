#!/usr/bin/env node
// kaggle.mjs — Kaggle competitions/list API(v1) 정규화.
//
// 실측(2026-11-21): GET /api/v1/competitions/list?page=N&sortBy=latestDeadline (Basic auth)
// 20항목/페이지. **필드명이 Nullable 접미사형**(titleNullable·urlNullable·rewardNullable 등) —
// 접미사 없는 title도 있으므로 둘 다 시도. category: Featured|Playground|Getting Started|Community
// — 'Getting Started'는 영구 튜토리얼(titanic 등)이라 채택 제외 대상(판정은 루틴이, 파서는 전수 반환).
// deadline은 UTC ISO → KST 날짜로.
//
// 사용: node collector/kaggle_fetch.mjs   (인증 fetch 래퍼가 이 파서를 호출)
//       cat body.json | node collector/parsers/kaggle.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const kstDate = (iso) => {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(d)
}

/** API JSON(배열) → { items: [{ref,title,url,category,deadline,reward,organization,tags}], count, getting_started } */
export function parseKaggleList(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json
  if (!Array.isArray(data)) return { items: [], count: 0, note: '배열 아님 — 응답 형식 변경. canary 확인' }
  const items = data.map((c) => ({
    ref: c.ref ?? String(c.id ?? ''),
    title: c.titleNullable ?? c.title ?? null,
    url: c.urlNullable ?? c.url ?? null,
    category: c.categoryNullable ?? c.category ?? null,
    deadline: kstDate(c.deadline),
    reward: c.rewardNullable ?? c.reward ?? null,
    organization: c.organizationNameNullable ?? c.organizationName ?? c.hostName ?? null,
    tags: Array.isArray(c.tags) ? c.tags : [],
  }))
  return { items, count: items.length, getting_started: items.filter((i) => i.category === 'Getting Started').length }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const stdin = fs.readFileSync(0, 'utf8')
  console.log(JSON.stringify(parseKaggleList(stdin), null, 1))
}
