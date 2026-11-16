#!/usr/bin/env node
// wevity.mjs — 위비티 파서 (전체리스트 + 상세)
//
// 역사적 함정(전부 fixture 테스트로 굳힘):
//  - `<li ><!--class="bg" -->`: li에 속성/주석이 붙으므로 `/<li[^>]*>([\s\S]*?)<\/li>/g` 필수.
//    `<li>` 리터럴 매칭은 빈 결과를 조용히 낸다(11-05 사고).
//  - 전수는 `?c=find&s=1&gp=N`의 `<ul class="list">` 섹션. 상단 SPECIAL 캐러셀의
//    hide-dday/hide-tit 정규식은 요청마다 재구성된 무작위 13건만 준다(11-12 함정).
//  - 페이지네이션은 `gp`. `pg`를 쓰면 SPECIAL 캐러셀만 반복 반환된다(11-06 사고).
//  - D-day: 위비티 D-N = 마감일이 오늘+(N-1) (D-1 = 마감 당일, 11-08 확정).
//  - 상세/검색 fetch가 배너 셸을 반환하는 붕괴가 진행형이었다(11-02~03) —
//    ul.list가 없으면 count:0 을 돌려주므로 canary가 잡는다.
//
// 사용: 파서는 fetch하지 않는다. 루틴/스크립트가 fetch한 본문을 stdin으로 흘려 보낸다.
//   curl -s 'https://www.wevity.com/?c=find&s=1&gp=1' | node collector/parsers/wevity.mjs list
//   node collector/parsers/wevity.mjs detail < detail.html
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const LIST_SECTION = /<ul class="list">([\s\S]*?)<\/ul>/
const LI = /<li[^>]*>([\s\S]*?)<\/li>/g

const strip = (s) =>
  String(s || '')
    .replace(/<span class='stat new'>[^<]*<\/span>/g, '')
    .replace(/<span class='stat spec'>[^<]*<\/span>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** 전체리스트(gp 페이지) HTML → 아이템 배열. ul.list 없으면 count:0(캐러셀 셸 = 붕괴 신호). */
export function parseWevityList(html) {
  const section = LIST_SECTION.exec(html)
  if (!section)
    return { items: [], count: 0, note: 'ul.list 섹션 없음 — SPECIAL 캐러셀 셸이거나 마크업 변경. canary 확인' }
  const items = []
  let m
  LI.lastIndex = 0
  while ((m = LI.exec(section[1])) !== null) {
    const li = m[1]
    const ix = /ix=(\d+)/.exec(li)
    const a = /<a href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/.exec(li)
    if (!ix || !a) continue // 헤더 li(class="top")와 링크 없는 li 건너뜀
    const day = /<div class="day">\s*([^<]*)/.exec(li)
    const badge = /<span class="dday\s+([^"']*)"[^>]*>([^<]*)<\/span>/.exec(li)
    const organ = /<div class="organ">([^<]*)/.exec(li)
    items.push({
      ix: Number(ix[1]),
      title: strip(a[2]),
      href: a[1].trim(),
      dday: (day ? day[1].trim() : '') || null, // 'D-20' | 'DAY' | 'D+5' ...
      badge: badge ? badge[2].trim() : null, // 접수중 | 마감 | ...
      organ: organ ? organ[1].trim() : null,
      is_new: /class='stat new'/.test(li),
      is_special: /class='stat spec'/.test(li),
    })
  }
  return { items, count: items.length }
}

/** 상세(gbn=view) HTML → 접수기간·D-day. */
export function parseWevityDetail(html) {
  const block = /<li class="dday-area">([\s\S]*?)<\/li>/.exec(html)
  const title = /<title>([^<]*)<\/title>/.exec(html)
  const out = { title: title ? title[1].trim() : null, period_raw: null, start: null, end: null, dday: null }
  if (!block) return { ...out, note: 'dday-area 없음 — 상세 마크업 변경' }
  out.period_raw = strip(block[1]).replace(/^접수기간\s*/, '')
  const dates = /(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})/.exec(block[1])
  if (dates) {
    out.start = dates[1]
    out.end = dates[2]
  }
  const dday = /class="cil-dday">([^<]+)/.exec(html)
  out.dday = dday ? dday[1].trim() : null
  return out
}

// CLI (모듈로 import 되었을 때는 실행하지 않는다)
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const stdin = fs.readFileSync(0, 'utf8')
  const fn = process.argv[2] === 'detail' ? parseWevityDetail : parseWevityList
  console.log(JSON.stringify(fn(stdin), null, 1))
}
