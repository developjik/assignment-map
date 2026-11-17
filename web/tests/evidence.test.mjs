import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clipEvidence, evidenceParts, splitEvidence } from '../src/lib/evidence.js'

// 실제 data/*.json 에서 그대로 가져온 문자열 — 수집기 표기 변화가 헬퍼를 깨면 여기서 먼저 잡힌다.
const GI_READ = "GI_Read_Comt_Ifrm 본문(2026-11-07): '오픈서베이 합류 과정은 다음과 같습니다 지원 > 서류 심사 > 사전과제 > 1차 인터뷰 > 2차 인터뷰 > 최종 합격' — 사전과제 전형 명시. AI 정책 언급 없음"

test('출처 라벨과 수집가의 판단은 인용에서 빠지고 메모로 간다', () => {
  const { quotes, memo } = splitEvidence(GI_READ)
  assert.deepEqual(quotes, ['오픈서베이 합류 과정은 다음과 같습니다 지원 > 서류 심사 > 사전과제 > 1차 인터뷰 > 2차 인터뷰 > 최종 합격'])
  assert.match(memo, /^GI_Read_Comt_Ifrm 본문\(2026-11-07\):/)
  assert.match(memo, /사전과제 전형 명시/)
  for (const q of quotes) {
    assert.doesNotMatch(q, /GI_Read/)
    assert.doesNotMatch(q, /언급 없음/)
  }
})

test('인용부호가 여러 개면 전부 인용으로 남는다', () => {
  const raw = "원티드 상세(2026-11-09): 마감일 '상시채용' 표시로 전환 + '본 포지션은 직무 역량확인을 위한 사전과제 제출이 필수입니다'(사전과제 상세 유지) — 마감 연장, 종결 아님"
  const { quotes, memo } = splitEvidence(raw)
  assert.deepEqual(quotes, ['상시채용', '본 포지션은 직무 역량확인을 위한 사전과제 제출이 필수입니다'])
  assert.match(memo, /원티드 상세/)
  assert.match(memo, /종결 아님/)
})

test('운영 문구만 남은 문자열은 인용이 아니라 메모다', () => {
  for (const raw of [
    'Devpost 오픈 목록 이탈 + 제출마감 2026-10-27 경과 이중 확인',
    "위비티 본리스트 D+0 배지(2026-11-16 실측) — 현대자동차그룹 차량용 앱 개발 공모전, 접수마감 11-15 경과",
    '접수 마감 2026-11-08 경과(2026-11-09 기준 D+1) — 결과발표 2026-11-21 예정, 심사 단계 전환',
    '접수 마감 2026-10-25 경과 — 위비티 전체리스트 스윕에서 여전히 노출되나 지원 기간 종료',
  ]) {
    const { quotes, memo } = splitEvidence(raw)
    assert.deepEqual(quotes, [], raw)
    assert.ok(memo.length > 0, raw)
  }
})

test('"없음"·"—" 같은 자리표시자는 빈 근거다', () => {
  for (const raw of ['—', '없음', '미확인', ' - ']) {
    assert.deepEqual(splitEvidence(raw), { quotes: [], memo: '' })
  }
})

test('인용부호 없는 원문 문장은 그대로 근거로 쓴다', () => {
  const raw = '본 포지션은 원티드 이력서와 사전 문제 제출을 모두 확인한 뒤 서류 전형을 진행합니다.'
  assert.deepEqual(splitEvidence(raw), { quotes: [raw], memo: '' })
})

test('기간·날짜만 적힌 조각은 표 대표 문장이 되지 않는다', () => {
  const { quotes } = splitEvidence("Devpost open 리스트(2026-11-12): submission_period_dates 'Nov 10 - Dec 07, 2026' — 제출 접수 진행중")
  assert.deepEqual(quotes, [])
})

test('표 한 줄은 48자까지만 — 자르면 …', () => {
  const long = '가'.repeat(80)
  const clipped = clipEvidence(long, 48)
  assert.equal(clipped.length, 48)
  assert.ok(clipped.endsWith('…'))
  assert.equal(clipEvidence('짧은 문장'), '짧은 문장')
})

test('evidenceParts 는 인용·메모를 중복 없이 모으고 대표 인용을 고른다', () => {
  const parts = evidenceParts([GI_READ, GI_READ, '없음'])
  assert.equal(parts.quotes.length, 1)
  assert.equal(parts.memos.length, 1)
  assert.match(parts.best, /오픈서베이 합류 과정/)
})

test('대표 인용은 기간 문구보다 내용이 있는 문장을 고른다', () => {
  const parts = evidenceParts(["위비티 112294 상세: '접수기간 2026-11-10 ~ 2026-11-29 D-15' + '2026 서울관광 프롬프톤 참가자 모집'"])
  assert.equal(parts.best, '2026 서울관광 프롬프톤 참가자 모집')
})
