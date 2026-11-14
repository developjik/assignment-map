// AI 정책·정보 제보 링크 — GitHub 새 이슈 화면에 제목·본문을 미리 채워 연다.
// 저장소가 공개라 이슈 본문에 개인 정보가 들어가지 않도록, 공고에서 읽은 값만 넣는다.
import { POLICY_LABEL, STATUS_LABEL } from './labels'

const NEW_ISSUE = 'https://github.com/developjik/assignment-map/issues/new'

export function reportIssueUrl(r, base = NEW_ISSUE) {
  const policy = POLICY_LABEL[r.policyKey] || r.policy?.label || '미확인'
  const title = `[제보] ${r.name} 정보/AI 정책 수정 요청`
  const body = [
    '### 무엇이 틀렸나',
    '',
    '<!-- 틀린 값과 맞는 값을 한 줄로 적어 주세요. 예: AI 정책 필수 → 허용 -->',
    '',
    '### 지금 수집된 값',
    '',
    `- 공고 ID: ${r.id}`,
    `- 이름: ${r.name}`,
    `- 유형: ${r.type}`,
    `- AI 정책: ${policy}`,
    `- 상태: ${STATUS_LABEL[r.status] || r.status || '-'}`,
    `- 마감: ${r.deadline || '미정'}`,
    `- 수집일: ${r.checked || r.first || '-'}`,
    `- 원문 URL: ${r.url || '없음'}`,
    '',
    '### 원문 근거',
    '',
    '<!-- 공고 원문에서 해당 문장을 그대로 붙여 주세요 -->',
    r.evidence ? `> ${r.evidence}` : '> ',
    '',
    '### 출처',
    '',
    '과제지도 웹에서 제보 버튼으로 작성',
  ].join('\n')
  return `${base}?${new URLSearchParams({ title, body }).toString()}`
}
