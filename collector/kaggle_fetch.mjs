#!/usr/bin/env node
// kaggle_fetch.mjs — 인증 fetch 래퍼. 키가 에이전트 컨텍스트를 통과하지 않게
// 스크립트 안에서 자격 증명을 읽고 파서로 흘린다(R1 아키텍처 확장).
// 자격 증명 우선순위: env KAGGLE_USERNAME/KAGGLE_KEY(GitHub Actions) > ~/.kaggle/kaggle.json(로컬).
// 사용: node collector/kaggle_fetch.mjs [페이지수=2]
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseKaggleList } from './parsers/kaggle.mjs'

const pages = Number(process.argv[2] || 2)
let username = process.env.KAGGLE_USERNAME, key = process.env.KAGGLE_KEY
if (!username || !key) {
  const file = path.join(os.homedir(), '.kaggle', 'kaggle.json')
  try {
    const creds = JSON.parse(fs.readFileSync(file, 'utf8'))
    username = creds.username; key = creds.key
  } catch {
    console.error('kaggle_fetch: 자격 증명 없음 — KAGGLE_USERNAME/KAGGLE_KEY 또는 ~/.kaggle/kaggle.json 필요')
    process.exit(2)
  }
}
const auth = Buffer.from(`${username}:${key}`).toString('base64')
const all = []
for (let page = 1; page <= pages; page++) {
  const res = await fetch(`https://www.kaggle.com/api/v1/competitions/list?page=${page}&sortBy=latestDeadline`, {
    headers: { authorization: `Basic ${auth}`, 'user-agent': 'assignment-map/1.0' },
  })
  if (!res.ok) { console.error(`kaggle_fetch: HTTP ${res.status} (page ${page})`); process.exit(1) }
  const rows = await res.json()
  if (!Array.isArray(rows) || !rows.length) break
  all.push(...rows)
}
const parsed = parseKaggleList(all)
console.log(JSON.stringify(parsed, null, 1))
