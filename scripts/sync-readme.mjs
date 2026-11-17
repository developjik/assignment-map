#!/usr/bin/env node
// sync-readme.mjs — README '## 숫자' 섹션을 data/*.json 실측으로 다시 쓴다.
//   로컬: node scripts/sync-readme.mjs  (멱등 — 같은 날 두 번 돌리면 diff 없음)
//   배포: .github/workflows/deploy.yml 의 sync-readme 잡이 매 배포마다 실행하고
//         바뀌면 github-actions[bot] 이 커밋한다. GITHUB_TOKEN 푸시는 deploy 를
//         다시 트리거하지 않으므로 무한루프가 없다.
// 규칙: 이 섹션을 손으로 고치지 않는다. 정의가 바뀌면 이 스크립트를 고친다.
import fs from 'node:fs'
import path from 'node:path'
import { collectFeedItems } from '../web/scripts/generate-feeds.mjs'

const repo = path.resolve(import.meta.dirname, '..')
const read = (f) => JSON.parse(fs.readFileSync(path.join(repo, f), 'utf8'))
const postings = read('data/postings.json')
const events = read('data/events.json')

const OPEN_EVENT = new Set(['open', 'upcoming'])
// '명시' = 정책 문구를 찾은 것 (미언급 unspecified / 확인필요 unknown 제외, 금지 banned 포함)
const STATED_POLICY = new Set(['required', 'allowed_graded', 'allowed', 'banned'])
const STATED_USAGE = new Set(['required', 'allowed_graded', 'allowed', 'banned'])

// 중복 병합 표시(스펙 1-2 merged_into)가 붙은 행은 화면·피드에 남지 않는다 —
// README 숫자도 같은 기준(대표행만)으로 센다.
const live = (r) => !r.merged_into
const openPostings = postings.filter((p) => p.status === 'open' && live(p))
const openEvents = events.filter((e) => OPEN_EVENT.has(e.status) && live(e))
const stated =
  openPostings.filter((p) => STATED_POLICY.has(p.ai_policy)).length +
  openEvents.filter((e) => STATED_USAGE.has(e.ai_usage)).length
const requiredCount =
  openPostings.filter((p) => p.ai_policy === 'required').length +
  openEvents.filter((e) => e.ai_usage === 'required').length

// 피드 항목 수는 진짜 피드 생성 로직(collectFeedItems)과 똑같이 센다.
const feedItems = collectFeedItems(path.join(repo, 'data')).items.length

// 골든케이스는 설정 개수가 아니라 실측 통과 수를 쓴다: validate.mjs 를 직접 돌려
// '골든케이스 X/Y' 출력을 읽는다. validate 실패면 이 스크립트도 실패한다 —
// 깨진 데이터로 README를 갱신하지 않는다(Codex PR 리뷰 반영).
let goldenPass = 0
let goldenTotal = 0
try {
  const out = execFileSync(process.execPath, [path.join(repo, 'collector/validate.mjs')], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const m = out.match(/골든케이스 (\d+)\/(\d+)/)
  if (!m) {
    console.error('sync-readme: validate.mjs 출력에서 골든케이스 X/Y를 못 찾았다 — 메시지 형식이 바뀌면 이 정규식을 고친다')
    process.exit(1)
  }
  goldenPass = Number(m[1])
  goldenTotal = Number(m[2])
} catch (e) {
  console.error('sync-readme: validate.mjs 실패 — README를 갱신하지 않는다')
  console.error(String((e && e.stdout) || e))
  process.exit(1)
}

// 안티-슬롭 체크 수: 린터 자체 출력('N체크')에서 읽는다. 실패 시 표기 유지.
import { execFileSync } from 'node:child_process'
let lintCount = 16
try {
  const lintOut = execFileSync(process.execPath, [path.join(repo, 'web/scripts/slop-lint.mjs')], {
    encoding: 'utf8',
  })
  lintCount = Number((lintOut.match(/(\d+)체크/) || [])[1]) || 16
} catch {
  // 린터 실패는 빌드 잡이 잡는다. 여기선 숫자만 못 얻은 것.
}

const kstToday = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)

const section = `## 숫자 (${kstToday} 기준)

| 항목 | 값 |
|---|---|
| 추적 레코드 | ${postings.filter(live).length + events.filter(live).length}건 (채용 공고 ${postings.filter(live).length} · 이벤트 ${events.filter(live).length}) |
| 지금 열려 있는 기회 | ${openPostings.length + openEvents.length}건 (채용 공고 ${openPostings.length} · 이벤트 ${openEvents.length}) |
| AI 정책을 명시한 진행중 항목 | ${stated}건 (그중 AI 필수 ${requiredCount}건) |
| 피드 발행 항목 | ${feedItems}건 (RSS + JSON Feed 동일 목록) |
| 골든케이스 | ${goldenPass}/${goldenTotal} (정책 판정 회귀 방지) |
| 안티-슬롭 검사 | ${lintCount}체크, 빌드 실패 시 배포 중단 |
| 운영비 | ₩0 (GitHub Actions + Pages 무료 쿼터, 외부 DB·서버 없음) |

범례: 사이트 헤더의 총계는 화면에 남은 진행 중 행 전체(open·예정·심사중, 중복 병합 제외)를 세고, 이 표의 '지금 열려 있는'은 심사중을 뺀 open·예정만, 'AI 정책을 명시한'은 여기서 다시 미언급·확인필요를 뺀 것이다 — 기준이 달라 숫자가 달라도 오류가 아니다.

이 표는 사람이 고치지 않는다. 배포마다 \`scripts/sync-readme.mjs\`가 \`data/*.json\` 실측으로 다시 쓴다.`

const readmePath = path.join(repo, 'README.md')
const lines = fs.readFileSync(readmePath, 'utf8').split('\n')
const start = lines.findIndex((l) => l.startsWith('## 숫자 ('))
const end = lines.findIndex((l) => l.includes('스냅샷이다') || l.includes('다시 쓴다'))
if (start < 0 || end < start) {
  console.error('sync-readme: README 숫자 섹션을 못 찾았다 — 섹션이 옮겨갔으면 스크립트를 고친다')
  process.exit(1)
}
const next = [...lines.slice(0, start), ...section.split('\n'), ...lines.slice(end + 1)]
// 3연속 이상 개행(섹션 교체 잔해)은 빈 줄 1개로 정규화한다.
fs.writeFileSync(readmePath, next.join('\n').replace(/\n{3,}/g, '\n\n'))
console.log(
  `SYNC-README OK — ${kstToday} 기준 · 레코드 ${postings.filter(live).length + events.filter(live).length} (병합 제외) · 열림 ${openPostings.length + openEvents.length} · 명시 ${stated} (필수 ${requiredCount}) · 피드 ${feedItems} · 골든 ${goldenPass}/${goldenTotal} · 슬롭린트 ${lintCount}`,
)
