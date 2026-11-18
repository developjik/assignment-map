import { test } from 'node:test'
import assert from 'node:assert/strict'
import { HOT_WINDOW, PIPELINE, isHot, pipelineCounts, pipelineSummary } from '../src/lib/pipeline.js'

const row = (id, dd, open = true) => ({ id, dd, open })
const statuses = (map) => (id) => map[id] || ''

test('파이프라인 단계는 앱의 지원 상태 셋과 같다 (관심·과제중·제출완료)', () => {
  assert.deepEqual(PIPELINE.map((s) => s.id), ['interested', 'in_progress', 'submitted'])
  assert.deepEqual(PIPELINE.map((s) => s.label), ['관심', '과제중', '제출완료'])
})

test('단계별 건수와 미설정을 함께 센다', () => {
  const list = [row('a', 10), row('b', 5), row('c', 2), row('d', 1), row('e', null), row('f', 30)]
  const st = statuses({ a: 'interested', b: 'interested', c: 'in_progress', d: 'submitted' })
  const out = pipelineCounts(list, st)
  assert.equal(out.interested, 2)
  assert.equal(out.in_progress, 1)
  assert.equal(out.submitted, 1)
  assert.equal(out.unset, 2)
  assert.equal(out.total, 6)
})

test('임박은 살아있는 마감 D-0~D-3 만 — 지난 마감·상시·종결은 아니다', () => {
  assert.equal(HOT_WINDOW, 3)
  for (const dd of [0, 1, 2, 3]) assert.equal(isHot(row('x', dd)), true, 'D-' + dd)
  for (const dd of [4, 7, -1, null]) assert.equal(isHot(row('x', dd)), false, String(dd))
  assert.equal(isHot(row('x', 1, false)), false, '종결 행은 임박이 아니다')
})

test('임박 합계는 관심·과제중만 센다 (제출완료는 내가 할 일이 없다)', () => {
  const list = [row('a', 2), row('b', 1), row('c', 0), row('d', 9)]
  const st = statuses({ a: 'interested', b: 'in_progress', c: 'submitted', d: 'interested' })
  const out = pipelineCounts(list, st)
  assert.equal(out.hotBy.interested, 1)
  assert.equal(out.hotBy.in_progress, 1)
  assert.equal(out.hotBy.submitted, 1) // 단계별로는 센다
  assert.equal(out.hot, 2) // 합계에서는 빠진다
})

test('상태를 모르는 id·빈 목록·statusOf 없음에도 죽지 않는다', () => {
  const out = pipelineCounts([], statuses({}))
  assert.deepEqual([out.total, out.unset, out.hot], [0, 0, 0])
  assert.deepEqual([out.interested, out.in_progress, out.submitted], [0, 0, 0])
  const noFn = pipelineCounts([row('a', 1)], null)
  assert.equal(noFn.unset, 1)
})

test('임박 창은 인자로 바꿀 수 있다 (테스트·미래 확장)', () => {
  const out = pipelineCounts([row('a', 5), row('b', 6)], statuses({ a: 'interested', b: 'interested' }), 5)
  assert.equal(out.hot, 1)
})

test('요약 문장은 화면과 스크린리더가 같은 말을 쓰게 한다', () => {
  const empty = pipelineCounts([], statuses({}))
  assert.equal(pipelineSummary(empty), '지원 파이프라인이 비어 있다')
  const calm = pipelineCounts([row('a', 20), row('b', null)], statuses({ a: 'interested' }))
  assert.equal(pipelineSummary(calm), '관심 1, 과제중 0, 제출완료 0 | 미설정 1건')
  const hot = pipelineCounts([row('a', 1), row('b', 20)], statuses({ a: 'in_progress', b: 'interested' }))
  assert.equal(pipelineSummary(hot), '관심 1, 과제중 1, 제출완료 0 | 미설정 0건 | D-3 이내 1건')
})
