// parsers 회귀 테스트 — 실소스 fixture(2026-11-16 슬라이스) + 역사적 함정 합성 케이스.
// 사고가 나면: fixture 갱신 → 이 테스트에 케이스 추가 → 파서 수정. (사고를 테스트로)
// 실행: node --test collector/tests/
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import os from 'node:os'

import { parseWevityList, parseWevityDetail } from '../parsers/wevity.mjs'
import { parseJobkoreaMobileSearch } from '../parsers/jobkorea.mjs'
import { parseDevpostOpen } from '../parsers/devpost.mjs'
import { parseDakerList, kstDate } from '../parsers/daker.mjs'
import { parseHnWhoishiring } from '../parsers/hn.mjs'
import { checkCanaries } from '../canary.mjs'

const REPO = path.resolve(import.meta.dirname, '..', '..')
const fx = (name) => fs.readFileSync(path.join(REPO, 'collector', 'tests', 'fixtures', name), 'utf8')

// ─── 위비티 전체리스트 ────────────────────────────────────────────────

test('wevity list: fixture 3아이템 파싱(주석 붙은 <li > 포함)', () => {
  const r = parseWevityList(fx('wevity-list.html'))
  assert.equal(r.count, 3)
  const first = r.items[0]
  assert.equal(first.ix, 112374)
  assert.equal(first.title, '2027 Sunny Scholar 6기 모집 - Deep Dive into Social Problems')
  assert.equal(first.dday, 'D-20')
  assert.equal(first.badge, '접수중')
  assert.equal(first.organ, 'SK행복나눔재단')
  assert.equal(first.is_special, true) // SPECIAL span
  const second = r.items[1]
  assert.equal(second.ix, 112349)
  assert.equal(second.organ, '농민신문') // class='bg' 변형 li도 동일 파싱
})

test('wevity list: SPECIAL 캐러셀 셸(ul.list 없음)은 count 0 + 노트 (11-02 fetch 붕괴 감지)', () => {
  const r = parseWevityList('<html><body><div class="ms-list"><ul class="special"></ul></div></body></html>')
  assert.equal(r.count, 0)
  assert.match(r.note, /ul.list 섹션 없음/)
})

test('wevity list: 헤더 li(class="top")는 아이템으로 안 셈', () => {
  const r = parseWevityList(fx('wevity-list.html'))
  assert.ok(r.items.every((i) => typeof i.ix === 'number' && i.title))
})

// ─── 위비티 상세 ────────────────────────────────────────────────────

test('wevity detail: 접수기간 + cil-dday 추출', () => {
  const r = parseWevityDetail(fx('wevity-detail.html'))
  assert.equal(r.start, '2026-08-01')
  assert.equal(r.end, '2027-01-15')
  assert.equal(r.dday, 'D-60')
})

test('wevity detail: dday-area 없으면 노트(마크업 변경 감지)', () => {
  const r = parseWevityDetail('<html><body>광고 배너</body></html>')
  assert.equal(r.start, null)
  assert.match(r.note ?? '', /dday-area 없음/)
})

// ─── 잡코리아 모바일 검색 ───────────────────────────────────────────

test('jobkorea m: 컨테이너 2개 파싱, 이중 data-gno 노이즈 anchor 제외, 총건수 757', () => {
  const html = fx('jobkorea-search.html')
  const r = parseJobkoreaMobileSearch(html)
  assert.equal(r.total, 757)
  assert.equal(r.count, 2)
  assert.equal(r.pattern, 'fwd')
  assert.ok((html.match(/data-gno="/g) || []).length >= r.count * 2, 'fixture는 노이즈 anchor를 포함해야 함')
  const first = r.items[0]
  assert.equal(first.gno, 50346363)
  assert.equal(first.corp, '로젠')
  assert.equal(first.title, '2026년 로젠㈜ 채용 모집')
  assert.equal(first.dday, 'D-6')
  assert.match(first.registered, /11\/13\(금\) 등록/)
  assert.match(first.url, /GI_Read\/50346363/)
})

test('jobkorea m: 속성 순서 뒤집힘(data-index가 먼저)도 파싱 (11-09/11-15 붕괴 방어)', () => {
  const flipped = `
    <div class="section-item" role="listitem" data-index="0" data-gno="111" data-sccode="1">
      <span class="item-corp_name">A사</span><span class="item-title">A 채용</span>
      <span class="item-condition_dday">D-3</span>
    </div>
    <div class="section-item" role="listitem" data-index="1" data-gno="222">
      <span class="item-corp_name">B사</span><span class="item-title">B 채용</span>
      <span class="item-condition_dday">상시</span>
    </div>`
  const r = parseJobkoreaMobileSearch(flipped)
  assert.equal(r.pattern, 'rev')
  assert.equal(r.count, 2)
  assert.equal(r.items[1].corp, 'B사')
  assert.equal(r.items[1].dday, '상시')
})

test('jobkorea m: 컨테이너 0개면 count 0 + 노트(마크업 4차 변경 경보 대상)', () => {
  const r = parseJobkoreaMobileSearch('<html><div id="새-마크업"></div></html>')
  assert.equal(r.count, 0)
  assert.match(r.note ?? '', /컨테이너 0건/)
})

// ─── Devpost API ───────────────────────────────────────────────────

test('devpost: meta.total_count + 서브도메인 url + themes 배열', () => {
  const r = parseDevpostOpen(JSON.parse(fx('devpost-open.json')))
  assert.equal(r.total, 59)
  assert.equal(r.count, 2)
  assert.match(r.items[0].url, /^https:\/\/.+\.devpost\.com\/$/)
  assert.ok(Array.isArray(r.items[0].themes))
})

test('devpost: submission_period_dates는 문자열이다 (11-06 배열 오탐 회귀 방지)', () => {
  const r = parseDevpostOpen(JSON.parse(fx('devpost-open.json')))
  assert.equal(typeof r.items[0].period, 'string')
  assert.equal(r.items[0].period, 'Oct 30 - Dec 04, 2026')
})

test('devpost: hackathons 키 없는 응답은 노트(형식 변경 감지)', () => {
  const r = parseDevpostOpen({ results: [] })
  assert.equal(r.count, 0)
  assert.match(r.note, /hackathons 키 없음/)
})

// ─── daker API ─────────────────────────────────────────────────────

test('daker: UTC ISO → KST 날짜 변환', () => {
  assert.equal(kstDate('2026-11-20T01:00:00.000Z'), '2026-11-20')
  assert.equal(kstDate('2026-11-20T20:00:00.000Z'), '2026-11-21') // KST 자정 넘김
  assert.equal(kstDate(null), null)
})

test('daker: fixture 파싱(제목·주최·등록마감·마지막단계 마감)', () => {
  const r = parseDakerList(JSON.parse(fx('daker-list.json')))
  assert.equal(r.count, 2)
  const first = r.items[0]
  assert.equal(first.title, '제주 AI·빅데이터 활용 AI Agent 개발 챌린지')
  assert.equal(first.organizer, '제주테크노파크')
  assert.equal(first.registration_deadline, '2026-11-20')
  assert.equal(first.last_stage_end, '2026-12-07')
})

// ─── HN Algolia ────────────────────────────────────────────────────

test('hn: 최신 Who is hiring 스레드 제목/월 파싱', () => {
  const r = parseHnWhoishiring(JSON.parse(fx('hn-thread.json')))
  assert.ok(r.nbHits > 0)
  assert.equal(r.latest.id, '50338728')
  assert.equal(r.latest.month, 'November 2026')
})

// ─── canary ────────────────────────────────────────────────────────

test('canary: 빈 입력은 VIOLATION — 조용한 OK 금지(전멸 수집 감지)', () => {
  const r = checkCanaries({}, {})
  assert.equal(r.violations.length, 1)
  assert.match(r.lines[0], /지표 0건/)
})

test('canary: 밴드 내 지표는 OK, 밖은 VIOLATION, 미정의는 NO-BAND(위반 아님)', () => {
  const bands = {
    'wevity-list-per-page': { min: 10, max: 20 },
    'devpost-open-total': { min: 30, max: 150 },
  }
  const r = checkCanaries(
    { 'wevity-list-per-page': 15, 'devpost-open-total': 5, 'some-new-metric': 3 },
    bands,
  )
  assert.equal(r.violations.length, 1)
  assert.match(r.lines[0], /OK.*wevity-list-per-page = 15/)
  assert.match(r.lines[1], /VIOLATION.*devpost-open-total = 5/)
  assert.match(r.lines[2], /NO-BAND.*some-new-metric/)
})

test('canary CLI: VIOLATION 있으면 exit 1', () => {
  const tmp = path.join(os.tmpdir(), `am-canary-${Date.now()}.json`)
  fs.writeFileSync(tmp, JSON.stringify({ 'wevity-list-per-page': 0 }))
  let status = 0
  try {
    execFileSync(process.execPath, [path.join(REPO, 'collector', 'canary.mjs'), tmp], { stdio: 'pipe' })
  } catch (e) {
    status = e.status
  }
  fs.unlinkSync(tmp)
  assert.equal(status, 1)
})
