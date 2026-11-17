// lib/alias — 병합된 id(merged_into)를 대표 id 로 해석하는 규칙.
// 이 해석이 없으면 중복 행에 남긴 별표·지원 상태가 병합 뒤 화면에서 사라진다.
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildAliasMap, canonicalId, canonicalIds, canonicalMap } from '../src/lib/alias.js'

test('buildAliasMap: 중복 행 → 대표행. 대표행 자신은 지도에 없다', () => {
  const map = buildAliasMap([
    { id: 'ko-0005', duplicates: ['wevity:111628'] },
    { id: 'wevity:111628', merged_into: 'ko-0005' },
    { id: 'wanted:wd390319', duplicates: ['jobkorea:50326430'] },
    { id: 'jobkorea:50326430', merged_into: 'wanted:wd390319' },
  ])
  assert.equal(map.get('wevity:111628'), 'ko-0005')
  assert.equal(map.get('jobkorea:50326430'), 'wanted:wd390319')
  assert.equal(map.has('ko-0005'), false)
  assert.equal(map.size, 2)
})

test('buildAliasMap: 체인(A→B→C)은 끝까지 따라가고, 스스로를 가리키는 표시는 버린다', () => {
  const map = buildAliasMap([
    { id: 'a', merged_into: 'b' },
    { id: 'b', merged_into: 'c' },
    { id: 'c' },
    { id: 'self', merged_into: 'self' },
  ])
  assert.equal(map.get('a'), 'c')
  assert.equal(map.get('b'), 'c')
  assert.equal(map.has('self'), false)
})

test('buildAliasMap: 순환 표시가 있어도 멈춘다(무한 루프 없음)', () => {
  const map = buildAliasMap([
    { id: 'a', merged_into: 'b' },
    { id: 'b', merged_into: 'a' },
  ])
  assert.ok(map.get('a'))
  assert.ok(map.get('b'))
  assert.equal(typeof map.get('a'), 'string')
})

test('canonicalId·canonicalIds: 지도에 없으면 그대로, 중복은 걷고 순서는 처음 나온 순서', () => {
  const map = new Map([['dup', 'rep']])
  assert.equal(canonicalId('dup', map), 'rep')
  assert.equal(canonicalId('other', map), 'other')
  assert.equal(canonicalId('', map), '')
  assert.deepEqual(canonicalIds(['dup', 'x', 'rep', 'dup', '', 3, null], map), ['rep', 'x'])
  assert.deepEqual(canonicalIds(null, map), [])
})

test('canonicalMap: 키를 대표 id 로 옮기고 충돌은 더 나아간 값을 남긴다', () => {
  const map = new Map([['dup', 'rep']])
  const rank = (v) => (v === 'submitted' ? 2 : v === 'in_progress' ? 1 : 0)
  assert.deepEqual(canonicalMap({ dup: 'in_progress' }, map), { rep: 'in_progress' })
  assert.deepEqual(canonicalMap({ dup: 'submitted', rep: 'in_progress' }, map, rank), { rep: 'submitted' })
  assert.deepEqual(canonicalMap({ dup: 'in_progress', rep: 'submitted' }, map, rank), { rep: 'submitted' })
  // 순위 없이 부르면 이미 있던(대표 id 쪽) 값을 남긴다
  assert.deepEqual(canonicalMap({ dup: 'submitted', rep: 'in_progress' }, map), { rep: 'in_progress' })
  assert.deepEqual(canonicalMap(JSON.parse('{"__proto__":"x","ok":"v"}'), map), { ok: 'v' })
})
