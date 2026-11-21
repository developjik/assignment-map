#!/usr/bin/env node
// onoffmix.mjs — 온오프믹스(국내 세미나·컨퍼런스·밋업) 이벤트 리스트 정규화.
//
// 실측(2026-11-21): 메인은 셸이지만 카테고리 페이지 /event/main/?interest={코드} 는
// SSR(174KB, 이벤트 19개/카테고리). 아티클(article.event_area) 내부에
//   <a href="/event/{id}"> + <h5 class="title" title="제목"> + <img alt="제목">
//   종료 이벤트는 end_layer('종료된 이벤트입니다')로 표시.
// 관심 카테고리 코드는 첫 실측에서 확정(A0101 비즈니스/스타트업, A0110 게임·IT교육 인근
// — 부트캠프 광고 다수, 프리스크린 블랙리스트가 잡는다).
//
// 사용: curl -s 'https://onoffmix.com/event/main/?interest=A0110' | node collector/parsers/onoffmix.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const decode = (s) => String(s || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim()

/** 카테고리 SSR HTML → { items: [{id,title,url,ended}], count }
 *  아티클 경계(</article>)에 의존하지 않는다 — 슬라이스·압축으로 닫는 태그를 잃을 수
 *  있다(2026-11-21 fixture 실측). /event/{id} 링크 기준 앞뒤 창에서 제목·종료 표시를 찾는다. */
export function parseOnoffmixList(html) {
  const body = String(html || '')
  const items = []
  const seen = new Set()
  const link = /href="\/event\/(\d+)"/g
  let m
  while ((m = link.exec(body)) !== null) {
    const id = Number(m[1])
    if (seen.has(id)) continue
    seen.add(id)
    const win = body.slice(m.index, m.index + 1600)
    const titleM = win.match(/<h5 class="title[^"]*"[^>]*title="([^"]+)"/) || win.match(/<img alt="([^"]{6,})"/)
    items.push({
      id,
      title: titleM ? decode(titleM[1]) : `onoffmix:${id}`,
      url: `https://onoffmix.com/event/${id}`,
      ended: /end_layer|종료된 이벤트/.test(win),
    })
  }
  return { items, count: items.length }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const stdin = fs.readFileSync(0, 'utf8')
  console.log(JSON.stringify(parseOnoffmixList(stdin), null, 1))
}
