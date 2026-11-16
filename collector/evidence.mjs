// evidence.mjs — evidence/배열 필드 정규화 규칙을 한 곳에 모은다.
//
// data/*.json 의 evidence 는 "문자열 배열"이 원칙이다.
//   postings: { quote, field? } 객체 배열 — 어떤 필드에서 인용했는지 함께 남긴다.
//   events  : 문자열 배열 — 인용문 한 줄이 곧 근거다.
// 수집기가 문자열 하나를 그대로 넣어도(2026-11-16 잡코리아 5건) data 에는 배열만 남도록
// merge.mjs(저장 전) · normalize.mjs(기존 데이터 정리) · validate.mjs(검증)가 같은 규칙을 쓴다.

/** @returns {boolean} quote 문자열을 가진 근거 객체인지 */
export const isQuoteObject = (value) =>
  !!value && typeof value === 'object' && !Array.isArray(value) && typeof value.quote === 'string';

/**
 * evidence 값을 항상 배열로 만든다.
 * - 문자열/숫자 하나 → 길이 1인 배열 (빈 문자열·공백만 있는 항목은 버린다)
 * - 배열 → trim 한 뒤 빈 항목을 걸러 낸다
 * - postings 처럼 quote 객체를 쓰는 쪽은 quoteObjects: true 로 객체 모양을 유지한다
 * 스칼라 문자열은 quoteObjects 여부에 따라 { quote } 또는 그대로 들어간다.
 *
 * @param {unknown} value
 * @param {{ quoteObjects?: boolean }} [opts]
 * @returns {(string|{quote: string, field?: string})[]}
 */
export function asEvidence(value, { quoteObjects = false } = {}) {
  const list = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
  const out = [];
  for (const item of list) {
    if (typeof item === 'string') {
      const quote = item.trim();
      if (quote) out.push(quoteObjects ? { quote } : quote);
      continue;
    }
    if (!isQuoteObject(item)) continue;              // 숫자·불리언·빈 객체는 근거가 아니다
    const quote = item.quote.trim();
    if (!quote) continue;
    if (!quoteObjects) {
      out.push(quote);                               // events 는 문자열 배열로 평탄화
      continue;
    }
    const entry = { ...item, quote };
    if (typeof entry.field === 'string') {
      const field = entry.field.trim();
      if (field) entry.field = field; else delete entry.field;
    } else {
      delete entry.field;
    }
    out.push(entry);
  }
  return out;
}

/**
 * 문자열 배열 필드(positions, urls_research 등)를 안전하게 배열로 만든다.
 * 문자열 하나가 들어와도 [값] 으로 받아 주고, 객체·숫자는 버린다.
 */
export function asStringArray(value) {
  const list = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
  return list
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * validate.mjs 가 쓰는 판정 — 문제가 없으면 null, 있으면 사람이 읽을 사유.
 * 문자열 evidence 는 배열이 아니므로 여기서 잡힌다(화면이 통째로 죽던 사고의 원인).
 */
export function evidenceProblem(value) {
  if (!Array.isArray(value)) {
    const what = value === undefined ? '없음' : value === null ? 'null' : typeof value;
    return `evidence 가 배열이 아니다 (${what})`;
  }
  for (const [i, item] of value.entries()) {
    if (typeof item === 'string') {
      if (!item.trim()) return `evidence[${i}] 가 빈 문자열`;
      continue;
    }
    if (isQuoteObject(item)) {
      if (!item.quote.trim()) return `evidence[${i}].quote 가 빈 문자열`;
      continue;
    }
    const what = Array.isArray(item) ? 'array' : item === null ? 'null' : typeof item;
    return `evidence[${i}] 가 문자열도 quote 객체도 아니다 (${what})`;
  }
  return null;
}
