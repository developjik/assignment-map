import { test } from 'node:test'
import assert from 'node:assert/strict'
import { HOT_DAYS, NEAR_DAYS, deadlineTitle, deadlineTone, deadlineView, relativeText } from '../src/lib/deadline.js'

const ABS = /\d{4}-\d{2}-\d{2}/

test('상대 낱말은 D-n · D-Day · 상시 · 마감 · 종결 다섯 가지뿐이다', () => {
  assert.equal(relativeText(1), 'D-1')
  assert.equal(relativeText(3), 'D-3')
  assert.equal(relativeText(0), 'D-Day')
  assert.equal(relativeText(30), 'D-30')
  assert.equal(relativeText(null), '상시')
  assert.equal(relativeText(-2), '마감')
  assert.equal(relativeText(5, false), '종결')
})

test('상대 낱말에는 절대 날짜가 섞이지 않는다 (표의 마감 컬럼 규칙)', () => {
  for (const dd of [-3, 0, 1, 3, 7, 30, null]) {
    for (const open of [true, false]) {
      assert.doesNotMatch(relativeText(dd, open), ABS, `${dd}/${open}`)
    }
  }
})

test('색은 D-3 이하만 긴급(hot)이고 나머지는 차분한 톤으로 내려간다', () => {
  assert.equal(HOT_DAYS, 3)
  assert.equal(NEAR_DAYS, 7)
  for (const d of [0, 1, 2, 3]) assert.equal(deadlineTone(d), 'hot', 'D-' + d)
  for (const d of [4, 5, 7]) assert.equal(deadlineTone(d), 'base', 'D-' + d)
  for (const d of [8, 30, 365]) assert.equal(deadlineTone(d), 'calm', 'D-' + d)
  assert.equal(deadlineTone(null), 'calm') // 상시
  assert.equal(deadlineTone(-1), 'over') // 지난 마감 — red 가 아니라 흐림
  assert.equal(deadlineTone(2, false), 'over') // 종결
})

test('접두사 D- 와 숫자를 갈라 준다 — 접두사는 흐리게, 숫자는 굵게', () => {
  const d = deadlineView({ open: true, dd: 1, deadline: '2026-11-18' })
  assert.deepEqual([d.prefix, d.value, d.text], ['D-', '1', 'D-1'])
  const day = deadlineView({ open: true, dd: 0, deadline: '2026-11-17' })
  assert.deepEqual([day.prefix, day.value, day.text], ['D-', 'Day', 'D-Day'])
  const far = deadlineView({ open: true, dd: 30, deadline: '2026-12-17' })
  assert.deepEqual([far.prefix, far.value], ['D-', '30'])
  const always = deadlineView({ open: true, dd: null, deadline: null })
  assert.deepEqual([always.prefix, always.value, always.text], ['', '', '상시'])
})

test('절대 날짜는 툴팁 문장에만 남는다', () => {
  assert.equal(deadlineTitle({ open: true, dd: 1, deadline: '2026-11-18' }), '2026-11-18 마감 | D-1')
  assert.equal(deadlineTitle({ open: true, dd: 0, deadline: '2026-11-17' }), '2026-11-17 마감 | 오늘까지')
  assert.equal(deadlineTitle({ open: true, dd: -2, deadline: '2026-11-15' }), '2026-11-15 마감 | 마감 지남')
  assert.equal(deadlineTitle({ open: true, dd: null, deadline: null }), '마감일 미정 | 상시 모집')
  assert.equal(deadlineTitle({ open: false, dd: -5, deadline: '2026-11-12' }), '2026-11-12 마감 | 모집 종결')
  const v = deadlineView({ open: true, dd: 3, deadline: '2026-11-20' })
  assert.equal(v.title, '2026-11-20 마감 | D-3')
  assert.equal(v.hot, true)
})
