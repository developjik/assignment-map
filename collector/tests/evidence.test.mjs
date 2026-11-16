// collector/evidence.mjs 단위 테스트 — node --test collector/tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { asEvidence, asStringArray, evidenceProblem } from '../evidence.mjs';

test('asEvidence: 문자열 하나는 길이 1 배열이 된다 (postings 는 quote 객체)', () => {
  assert.deepEqual(asEvidence('  본문에 AI 활용 필수  '), ['본문에 AI 활용 필수']);
  assert.deepEqual(asEvidence('본문에 AI 활용 필수', { quoteObjects: true }), [{ quote: '본문에 AI 활용 필수' }]);
});

test('asEvidence: 단일 객체·빈 값도 배열로 맞춘다', () => {
  assert.deepEqual(asEvidence({ quote: 'AI 활용 가능', field: 'policy' }, { quoteObjects: true }),
    [{ quote: 'AI 활용 가능', field: 'policy' }]);
  assert.deepEqual(asEvidence({ quote: 'AI 활용 가능' }), ['AI 활용 가능']);
  assert.deepEqual(asEvidence(undefined), []);
  assert.deepEqual(asEvidence(null), []);
  assert.deepEqual(asEvidence('   '), []);
});

test('asEvidence: 배열은 trim 하고 빈 항목·스칼라를 버린다', () => {
  assert.deepEqual(asEvidence(['  a  ', '', '   ', 'b']), ['a', 'b']);
  assert.deepEqual(asEvidence(['a', 3, null, true, { quote: '  c  ', field: ' policy ' }]),
    ['a', 'c']);
  assert.deepEqual(asEvidence([{ quote: 'c', field: ' policy ' }], { quoteObjects: true }),
    [{ quote: 'c', field: 'policy' }]);
  assert.deepEqual(asEvidence([{ quote: '   ' }], { quoteObjects: true }), []);
});

test('asEvidence 는 멱등이다 — 이미 정규화된 값을 다시 넣어도 같다', () => {
  const once = asEvidence(['x', { quote: 'y', field: 'policy' }], { quoteObjects: true });
  assert.deepEqual(asEvidence(once, { quoteObjects: true }), once);
});

test('asStringArray: positions 같은 배열 필드에 문자열 하나가 와도 살린다', () => {
  assert.deepEqual(asStringArray('frontend'), ['frontend']);
  assert.deepEqual(asStringArray([' frontend ', '', 1, null, 'ai']), ['frontend', 'ai']);
  assert.deepEqual(asStringArray(undefined), []);
});

test('evidenceProblem: 문자열 evidence 는 배열이 아니라 실패한다', () => {
  assert.match(evidenceProblem('AI 활용 필수'), /배열이 아니다/);
  assert.match(evidenceProblem(undefined), /배열이 아니다/);
  assert.match(evidenceProblem(['ok', 3]), /문자열도 quote 객체도 아니다/);
  assert.match(evidenceProblem(['']), /빈 문자열/);
  assert.match(evidenceProblem([{ quote: '  ' }]), /빈 문자열/);
  assert.equal(evidenceProblem(['문자열 근거', { quote: '객체 근거' }]), null);
  assert.equal(evidenceProblem([]), null);
});
