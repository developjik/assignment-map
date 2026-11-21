#!/usr/bin/env node
// greeting.mjs — 그리팅 ATS(*.career.greetinghr.com) 공고 목록 정규화.
//
// 실측(2026-11-21): 회사별 노출이 갈린다 —
//   무신사: SSR에 /ko/o/{id} 링크 110개 + openings JSON(openingId/title/dueDate/deadlineDDay)
//   컬리:   링크는 없지만 openings JSON에 전 공고 내장(주니어 뷰티 MD 등) — 상세 URL은 /ko/o/{openingId}
//   올리브영: taxonomy만 나옴(기존 실측) — fetch 불가, 브라우저 감시
//   야놀자·SSG: 랜딩은 SSR이나 공고 목록은 클라이언트 렌더 — 브라우저 감시
// 파서는 JSON 패스(openingId/title/openDate/dueDate/deadlineDDay)를 우선하고,
// 링크 패스(/ko/o/\d+)를 보조로 합친다. deadlineDDay는 마감 D-day(null=상시).
// 제목에 이스케이프된 따옴표가 있으면 JSON 정규식이 끊길 수 있다 — 그런 공고는
// 링크 패스로 보완된다(무신사) 또는 다음 스냅에서 잡힌다.
//
// 사용: curl -s 'https://musinsa.career.greetinghr.com/' | node collector/parsers/greeting.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const decode = (s) => String(s || '').replace(/\\u002F/gi, '/').replace(/\\"/g, '"').trim()

/** 그리팅 SSR HTML → { items: [{openingId,title,url,openDate,dueDate,dday}], count } */
export function parseGreetingList(html) {
  const body = String(html || '')
  const items = []
  const seen = new Set()
  // openings JSON: "openingId":245220,"title":"[AI Agent 전형] …","workspaceDivision":…,"openDate":"…","dueDate":null,"deadlineDDay":null
  const jRe = /"openingId":(\d+),"title":"([^"]{4,120})"[\s\S]{0,600}?"openDate":"([^"]*)","dueDate":(null|"[^"]*"),"deadlineDDay":(null|-?\d+)/g
  let m
  while ((m = jRe.exec(body)) !== null) {
    const id = Number(m[1])
    if (seen.has(id)) continue
    seen.add(id)
    items.push({
      openingId: id,
      title: decode(m[2]),
      url: `/ko/o/${id}`,
      openDate: (m[3] || '').slice(0, 10) || null,
      dueDate: m[4] === 'null' ? null : String(m[4]).slice(1, 11),
      dday: m[5] === 'null' ? null : Number(m[5]),
    })
  }
  // 링크 보조 패스 — JSON에 없고 링크만 남은 공고(제목 없이 id만)
  for (const lm of body.matchAll(/href="(\/ko\/o\/(\d+))"/g)) {
    const id = Number(lm[2])
    if (seen.has(id)) continue
    seen.add(id)
    items.push({ openingId: id, title: null, url: lm[1], openDate: null, dueDate: null, dday: null })
  }
  return { items, count: items.length }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const stdin = fs.readFileSync(0, 'utf8')
  console.log(JSON.stringify(parseGreetingList(stdin), null, 1))
}
