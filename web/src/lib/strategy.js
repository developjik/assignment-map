// 공고별 AI 제출 전략 프롬프트 — 상세 패널의 한 버튼이 클립보드로 넘기는 글.
//
// 왜 앱 안에서 만드나: 이 앱의 목적은 "AI로 만들어 제출하는 기회"를 모으는 것까지다.
// 제출 직전에 사람이 매번 하는 일(공고를 다시 읽고, 과제를 쪼개고, 무엇을 앞세울지 정하는 것)을
// 한 번의 복사로 LLM 에 넘기려는 것이고, 그래서 프롬프트에는 **이 공고의 사실**
// (회사·포지션·마감·AI 정책·전형·원문 근거)과 **내 포지셔닝**이 함께 들어간다.
//
// 여기는 순수 함수만 둔다 — react 도 localStorage 도 모른다(테스트가 node 로 돈다).

// node 의 ESM 은 확장자를 요구한다 — web/tests 가 이 파일을 직접 import 해 돌기 때문에
// (lib-purity 가드가 node_modules 없이 테스트를 돌린다) 여기만 .js 를 붙인다.
import { relativeText } from './deadline.js'

// 지원자 포지셔닝 — 이 사람이 어떤 개발자인지 (README·DESIGN 의 "빌더" 정의와 같은 말)
export const DEFAULT_ROLE = 'Frontend Developer × AI Agent Builder'

// 값을 한 줄로 붙인다. 비었으면 그 줄 자체를 뺀다(빈 라벨이 프롬프트에 남지 않게).
function line(label, value) {
  const v = value == null ? '' : String(value).trim()
  return v ? `- ${label}: ${v}\n` : ''
}

function quotesOf(r) {
  const all = (r.evidenceAll && r.evidenceAll.length ? r.evidenceAll : [r.evidenceFull || r.evidence])
    .map((q) => String(q == null ? '' : q).trim())
    .filter(Boolean)
  // 같은 문장이 두 번 들어가지 않게 하고, 프롬프트가 길어지지 않게 셋까지만 쓴다
  return [...new Set(all)].slice(0, 3)
}

// 마감 — 표와 같은 낱말(D-3 | D-Day | 상시 | 종결)에 절대 날짜를 붙인다.
// 프롬프트는 화면이 아니라서 상대값만으로는 쓸 수 없다.
// 마감일이 없을 때 '종결'을 '상시 또는 미확인'으로 뭉개면 닫힌 공고가 진행중으로 읽힌다 —
// 그래서 open 부터 본다 (PR #19 Codex P2).
export function deadlineLine(r) {
  const rel = relativeText(r.dd, r.open)
  if (!r.deadline) {
    return r.open === false
      ? '마감일 미기록 | 모집 종결'
      : '마감일 미정 | 상시 또는 미확인 원문에서 확인'
  }
  return `${r.deadline} (${rel})`
}

// 정책 — 화면의 낱말(필수/허용+채점/...)과 원문 문구를 같이 넘긴다
export function policyLine(r) {
  const label = (r.policy && r.policy.label) || r.policyKey || '미언급'
  const raw = (r.policyRaw || '').trim()
  return raw ? `${label} | 원문: "${raw}"` : label
}

export function buildStrategyPrompt(r, opts = {}) {
  if (!r) return ''
  const role = (opts.role || DEFAULT_ROLE).trim()
  const name = String(r.name || '이름 미상').trim()
  const title = r.kind === 'posting' && r.title && r.title !== r.name ? String(r.title).trim() : ''
  const work = r.kind === 'posting'
    ? (r.stack || (r.positions || []).join(', '))
    : [r.type, r.format].filter(Boolean).join(' | ')
  const quotes = quotesOf(r)

  let head = `[지원 전략 요청] ${name}${title ? ' | ' + title : ''}\n\n`
  head += '너는 내 지원을 돕는 시니어 개발자다. 아래 공고 하나로 과제 전형을 준비한다.\n'
  head += `내 포지셔닝: ${role}\n`
  head += '규칙: 공고에 적힌 사실만 근거로 쓴다. 공고에 없는 내용에는 문장 끝에 (추정) 을 붙인다.\n'

  let post = '\n## 공고\n'
  post += line(r.kind === 'posting' ? '회사' : '주최', name)
  if (r.kind === 'posting') {
    post += line('포지션', (r.positions || []).map((p) => String(p)).join(', ') || r.sub)
    post += line('직무 기술(원문)', r.sub)
  } else {
    post += line('유형', [r.type, r.format].filter(Boolean).join(' | '))
    post += line('상금', r.prize)
    post += line('팀', r.team === 'solo' ? '개인 참가' : r.team)
  }
  post += line('마감', deadlineLine(r))
  post += line('AI 정책', policyLine(r))
  if (r.kind === 'posting') {
    post += line('과제 유형', r.assignment)
    post += line('전형 절차', r.process)
  } else {
    post += line('결과 발표', r.resultDate)
  }
  post += line('요구 스택/과제 내용', work)
  if (quotes.length) {
    post += '- 원문 근거:\n'
    for (const q of quotes) post += `  > "${q}"\n`
  }
  post += line('원문', r.url || '원문 링크 없음')

  const req = [
    '',
    '## 요청',
    '1. 과제 설계: 이 공고가 물어볼 과제를 1개 고르고(과제가 이미 정해져 있으면 그것), 핵심 기능 / AI 기능 / 제출물 3단계로 쪼개라. 단계마다 완료 조건과 예상 소요(시간)를 붙여라.',
    '2. 어필 포인트 3개: 내 포지셔닝으로 먼저 보여야 할 것. 각 항목에 "왜 이 공고에서 통하는가"를 원문 근거와 함께 한 줄로 붙여라.',
    `3. AI 활용 서사: 과제에서 AI를 어디에 썼고 어디에 쓰지 않았는지, 프롬프트와 검증 과정을 어떻게 남길지 3줄로 정리하라. (이 공고의 AI 정책: ${(r.policy && r.policy.label) || r.policyKey || '미언급'})`,
    '4. 제출 전 체크리스트: 10개 이내. 공고 요구사항과 마감에서 나온 것만. 항목마다 원문 어디를 확인하면 되는지 붙여라.',
    '5. 30초 소개: 면접이나 발표에서 쓸 내 프로젝트 소개 3문장.',
    '6. 적합성: 이 공고의 요구 직군과 내 포지셔닝이 얼마나 맞는지 한 줄, 맞지 않으면 어떤 경험을 앞세울지 한 줄.',
    '',
    '## 형식',
    '- 한국어. 표보다 목록.',
    '- 각 항목은 결론을 먼저, 근거를 그다음에.',
    '- 마지막에 "이 공고 담당자에게 물어볼 질문 3개" 를 붙인다.',
    '',
  ].join('\n')

  return head + post + req
}

// 버튼·복사 피드백이 같은 이름을 부른다
export const strategyButtonLabel = 'AI 전략 프롬프트 복사'
