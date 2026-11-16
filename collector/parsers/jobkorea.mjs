#!/usr/bin/env node
// jobkorea.mjs — 잡코리아 모바일 검색 파서
//
// 역사적 함정(전부 fixture 테스트로 굳힘):
//  - data-gno는 항목당 2회 등장(컨테이너 div.section-item + 뒤의 빈 <a data-gno> 노이즈).
//    컨테이너만 data-index를 가진다 — 컨테이너 정규식으로만 파싱(11-15/11-16 확정).
//  - 마크업이 아예 바뀌면 count 0 — 조용히 넘기지 말고 canary 경보로 삼는다.
//  - D-day: 잡코리아 D-N = 마감일이 오늘+N (위비티와 1일 차이, 11-03 실증).
//  - GI_Read 상세 본문은 fetch 불가(www 404, m body 0, 11-16) — 전형절차 확인은 브라우저 필수.
//
// 사용:
//   curl -s 'https://m.jobkorea.co.kr/Search/Adv?Keyword=사전과제' | node collector/parsers/jobkorea.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// 정방향: data-gno 뒤에 data-index가 오는 컨테이너
const CONTAINER_FWD = /<div[^>]*data-gno="(\d+)"[^>]*data-index="\d+"[^>]*>/g
// 속성 순서가 뒤집힌 컨테이너(11-09/11-15 붕괴 대비)
const CONTAINER_REV = /<div[^>]*data-index="\d+"[^>]*data-gno="(\d+)"[^>]*>/g

const strip = (s) => String(s || '').replace(/\s+/g, ' ').trim()

/** m검색 결과 HTML → { total, count, pattern, items:[{gno, corp, title, dday, registered, url}] } */
export function parseJobkoreaMobileSearch(html) {
  const totalM = /총[\s\S]{0,80}?([\d,]+)\s*건/.exec(html)
  const total = totalM ? Number(totalM[1].replace(/,/g, '')) : null

  let pattern = 'fwd'
  let matches = [...html.matchAll(CONTAINER_FWD)]
  if (matches.length === 0) {
    matches = [...html.matchAll(CONTAINER_REV)]
    pattern = 'rev'
  }
  const items = []
  for (let i = 0; i < matches.length; i++) {
    const chunk = html.slice(
      matches[i].index,
      i + 1 < matches.length ? matches[i + 1].index : matches[i].index + 6000,
    )
    const corp = /item-corp_name">\s*([\s\S]*?)\s*<\/span>/.exec(chunk)
    const title = /item-title">\s*([\s\S]*?)\s*<\/span>/.exec(chunk)
    const dday = /item-condition_dday">([^<]*)/.exec(chunk)
    const registered = /item-dday">([^<]*)/.exec(chunk)
    items.push({
      gno: Number(matches[i][1]),
      corp: corp ? strip(corp[1].replace(/<[^>]+>/g, '')) : null,
      title: title ? strip(title[1]) : null,
      dday: dday ? strip(dday[1]) : null, // 'D-6' | '마감' | '상시' ...
      registered: registered ? strip(registered[1]) : null, // '11/13(금) 등록'
      url: 'https://www.jobkorea.co.kr/Recruit/GI_Read/' + matches[i][1],
    })
  }
  return {
    total,
    count: items.length,
    pattern,
    items,
    note: items.length === 0 ? '컨테이너 0건 — 마크업 변경. canary 경보 대상' : undefined,
  }
}

// CLI (모듈로 import 되었을 때는 실행하지 않는다)
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(parseJobkoreaMobileSearch(fs.readFileSync(0, 'utf8')), null, 1))
}
