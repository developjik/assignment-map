import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_ROLE, buildStrategyPrompt, deadlineLine, policyLine, strategyButtonLabel } from '../src/lib/strategy.js'

const posting = {
  kind: 'posting', id: 'wanted:wd1', name: '더게임AI', title: 'AI 서비스 프론트엔드 개발자',
  sub: 'React·TypeScript 3년 이상, LLM 에이전트 경험 우대', positions: ['frontend'],
  policy: { cls: 'p-req', label: '필수' }, policyKey: 'required', policyRaw: 'AI 활용 요구',
  deadline: '2026-11-30', dd: 12, open: true, url: 'https://example.com/job/1',
  assignment: 'pre_assignment', process: '서류 → AI 과제 → 1차 면접',
  evidenceFull: '결과물과 프롬프트 작성 과정을 함께 평가한다',
  evidenceAll: ['결과물과 프롬프트 작성 과정을 함께 평가한다', 'AI 사용 금지 아님'],
  stack: 'React·TypeScript 3년 이상, LLM 에이전트 경험 우대',
  first: '2026-11-17', source: 'wanted',
}

const event = {
  kind: 'event', id: 'ko-0001', name: 'AI 에이전트 해커톤', title: 'AI 에이전트 해커톤',
  type: '해커톤', format: 'online', positions: [], prize: '총 1,000만원', team: '2~4인',
  policy: { cls: 'p-ok', label: 'AI 허용' }, policyKey: 'allowed',
  deadline: null, dd: null, open: true, url: null,
  evidenceAll: ['AI 활용 가능'], resultDate: '2026-12-20', sub: '주최사 | 2~4인',
}

test('프롬프트에는 이 공고의 사실이 들어간다 (회사·포지션·마감·정책·근거·원문)', () => {
  const p = buildStrategyPrompt(posting)
  assert.match(p, /더게임AI/)
  assert.match(p, /AI 서비스 프론트엔드 개발자/)
  assert.match(p, /- 포지션: frontend/)
  assert.match(p, /- 마감: 2026-11-30 \(D-12\)/)
  assert.match(p, /- AI 정책: 필수 \| 원문: "AI 활용 요구"/)
  assert.match(p, /- 전형 절차: 서류 → AI 과제 → 1차 면접/)
  assert.match(p, /결과물과 프롬프트 작성 과정을 함께 평가한다/)
  assert.match(p, /- 원문: https:\/\/example\.com\/job\/1/)
})

test('내 포지셔닝과 요청 6가지가 함께 넘어간다', () => {
  const p = buildStrategyPrompt(posting)
  assert.equal(DEFAULT_ROLE, 'Frontend Developer × AI Agent Builder')
  assert.match(p, /내 포지셔닝: Frontend Developer × AI Agent Builder/)
  for (const n of ['1. 과제 설계', '2. 어필 포인트 3개', '3. AI 활용 서사', '4. 제출 전 체크리스트', '5. 30초 소개', '6. 적합성']) {
    assert.ok(p.includes(n), n)
  }
  assert.match(p, /물어볼 질문 3개/)
  assert.match(p, /\(추정\)/)
})

test('포지셔닝은 바꿔 넣을 수 있다', () => {
  const p = buildStrategyPrompt(posting, { role: 'Backend Developer' })
  assert.match(p, /내 포지셔닝: Backend Developer/)
  assert.doesNotMatch(p, /Frontend Developer × AI Agent Builder/)
})

test('이벤트는 회사 대신 주최·유형·상금·팀을 싣고 전형/과제 유형 줄은 뺀다', () => {
  const p = buildStrategyPrompt(event)
  assert.match(p, /- 주최: AI 에이전트 해커톤/)
  assert.match(p, /- 유형: 해커톤 \| online/)
  assert.match(p, /- 상금: 총 1,000만원/)
  assert.match(p, /- 팀: 2~4인/)
  assert.match(p, /- 결과 발표: 2026-12-20/)
  assert.doesNotMatch(p, /- 전형 절차:/)
  assert.doesNotMatch(p, /- 직무 기술\(원문\):/)
})

test('마감·정책 문장 — 없는 값은 지어내지 않는다', () => {
  assert.equal(deadlineLine(posting), '2026-11-30 (D-12)')
  assert.equal(deadlineLine({ ...posting, deadline: null, dd: null }), '마감일 미정 | 상시 또는 미확인 원문에서 확인')
  assert.equal(deadlineLine({ ...posting, open: false, dd: -3 }), '2026-11-30 (종결)')
  // 닫혔는데 마감일도 없는 경우 — '상시'로 뭉개면 닫힌 공고가 진행중으로 읽힌다 (PR #19 Codex P2)
  assert.equal(deadlineLine({ ...posting, deadline: null, dd: null, open: false }), '마감일 미기록 | 모집 종결')
  assert.equal(policyLine(posting), '필수 | 원문: "AI 활용 요구"')
  assert.equal(policyLine({ policyKey: 'unspecified', policy: { label: '미언급' } }), '미언급')
})

test('근거 인용은 중복을 지우고 셋까지만 쓴다', () => {
  const many = { ...posting, evidenceAll: ['하나', '하나', '둘', '셋', '넷'] }
  const p = buildStrategyPrompt(many)
  assert.equal((p.match(/> "하나"/g) || []).length, 1)
  assert.ok(p.includes('> "셋"'))
  assert.ok(!p.includes('> "넷"'))
})

test('빈 행에도 빈 라벨이 남지 않는다', () => {
  const p = buildStrategyPrompt({ kind: 'posting', id: 'x', name: '회사', positions: [], open: true })
  assert.doesNotMatch(p, /: *\n/, '빈 값으로 끝나는 줄이 있다')
  assert.match(p, /- 회사: 회사/)
  assert.match(p, /- 마감: 마감일 미정/)
  assert.equal(buildStrategyPrompt(null), '')
})

test('복사 버튼 이름은 한 곳에서 나온다', () => {
  assert.equal(strategyButtonLabel, 'AI 전략 프롬프트 복사')
})

test('프롬프트는 슬롭 검사(이모지·가운데점)를 건드리지 않는다', () => {
  for (const p of [buildStrategyPrompt(posting), buildStrategyPrompt(event)]) {
    assert.doesNotMatch(p, /\s·\s/u)
    assert.doesNotMatch(p, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u)
  }
})
