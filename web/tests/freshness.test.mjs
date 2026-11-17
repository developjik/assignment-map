// 수집 시각 — 헤더 한 곳이 쓰는 다음 수집일 계산 (PR C)
import test from 'node:test'
import assert from 'node:assert/strict'
import { nextRun } from '../src/lib/freshness.js'

test('nextRun: 다음 날짜', () => {
  assert.equal(nextRun('2026-11-17'), '2026-11-18')
  assert.equal(nextRun('2026-11-30'), '2026-12-01')
  assert.equal(nextRun('2026-12-31'), '2027-01-01')
  // 윤년 2월
  assert.equal(nextRun('2028-02-28'), '2028-02-29')
  assert.equal(nextRun('2027-02-28'), '2027-03-01')
})

test('nextRun: 값이 없거나 형식이 틀리면 빈 문자열', () => {
  assert.equal(nextRun(''), '')
  assert.equal(nextRun(null), '')
  assert.equal(nextRun(undefined), '')
  assert.equal(nextRun('2026-11-17T03:00'), '')
  assert.equal(nextRun('어제'), '')
})
