import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DENSITIES, DENSITY_KEY, normalizeDensity, readDensity, writeDensity } from '../src/lib/density.js'

const fakeStore = (init) => {
  const map = new Map(init ? [[DENSITY_KEY, init]] : [])
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    dump: () => Object.fromEntries(map),
  }
}

test('세 단의 행 높이는 24 / 28 / 40 이고 id 가 곧 CSS 데이터 속성이다', () => {
  assert.deepEqual(DENSITIES.map((d) => d.id), ['compact', 'default', 'comfortable'])
  assert.deepEqual(DENSITIES.map((d) => d.px), [24, 28, 40])
})

test('예전 값 standard 는 default 로, wide 는 comfortable 로 옮긴다', () => {
  assert.equal(normalizeDensity('standard'), 'default')
  assert.equal(normalizeDensity('wide'), 'comfortable')
  assert.equal(normalizeDensity('compact'), 'compact')
  assert.equal(normalizeDensity(' Comfortable '), 'comfortable')
})

test('모르는 값·빈 값·문자가 아닌 값은 default 로 떨어진다', () => {
  for (const v of ['', 'cozy', 'STANDARD2', null, undefined, 3, {}]) {
    assert.equal(normalizeDensity(v), 'default', String(v))
  }
})

test('저장된 standard 를 읽으면 default 이고, 저장 값은 정규화된 이름으로 덮인다', () => {
  const store = fakeStore('standard')
  assert.equal(readDensity(store), 'default')
  assert.equal(writeDensity('wide', store), 'comfortable')
  assert.deepEqual(store.dump(), { [DENSITY_KEY]: 'comfortable' })
})

test('저장소가 없거나 던져도 기본값으로 동작한다', () => {
  const throwing = { getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') } }
  assert.equal(readDensity(throwing), 'default')
  assert.equal(writeDensity('compact', throwing), 'compact')
  assert.equal(readDensity(null), 'default')
})
