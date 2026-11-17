// 행 밀도 3단 — Carbon 의 행 높이 단(xs 24 / sm 32 / md 40)에서 우리 표에 맞는 세 단을 고른다.
//   compact      24px  1줄, 근거 컬럼은 숨긴다 (훑기)
//   default      28px  1줄 + 근거 48자 (지금까지의 기본)
//   comfortable  40px  2줄: 제목 + 주최·유형·확인 (검토)
//
// 저장 키는 am-density 하나로 유지한다. 예전 두 단 시절의 값(standard)과 다른 도구에서 부르던
// 이름(wide)이 브라우저에 남아 있어도 사용자가 고른 뜻을 잃지 않게 default/comfortable 로 옮긴다.
export const DENSITY_KEY = 'am-density'

export const DENSITIES = [
  { id: 'compact', label: 'compact', px: 24, hint: '1줄 | 근거 숨김' },
  { id: 'default', label: 'default', px: 28, hint: '1줄 | 근거 48자' },
  { id: 'comfortable', label: 'comfortable', px: 40, hint: '2줄 | 제목 + 주최·유형·확인' },
]

export const DENSITY_IDS = DENSITIES.map((d) => d.id)

// 값 이름이 바뀐 것만 옮긴다. 모르는 값은 기본값으로 (깨진 저장값이 표를 이상하게 만들지 않게)
const LEGACY = { standard: 'default', wide: 'comfortable' }

export function normalizeDensity(value) {
  if (typeof value !== 'string') return 'default'
  const key = value.trim().toLowerCase()
  if (DENSITY_IDS.includes(key)) return key
  return LEGACY[key] || 'default'
}

// 저장소를 인자로 받는다 — 테스트에서 localStorage 없이 같은 규칙을 검사한다
export function readDensity(storage) {
  try {
    const store = storage === undefined && typeof localStorage !== 'undefined' ? localStorage : storage
    return normalizeDensity(store ? store.getItem(DENSITY_KEY) : '')
  } catch {
    return 'default'
  }
}

export function writeDensity(value, storage) {
  const id = normalizeDensity(value)
  try {
    const store = storage === undefined && typeof localStorage !== 'undefined' ? localStorage : storage
    if (store) store.setItem(DENSITY_KEY, id)
  } catch {
    /* 사생활 모드 — 저장만 건너뛴다 */
  }
  return id
}
