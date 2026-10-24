# 매일 수집 루틴 프롬프트 (v1.2 — fetch-우선 아키텍처, 2026-10-25 소스 확장)

> 이 문서 하나로 매일의 수집 세션이 self-contained로 동작해야 한다.
> 소스 레지스트리: `collector/sources.json` — URL·비용·상태의 단일 공급원.

## 0. 아키텍처 원칙 (v1.2 신설)

**발견(후보 생성)은 fetch()로 = 브라우저 페이지 상한 미소모.**
브라우저 80페이지는 상세 본문 추출(JS 렌더 필요)과 재방문 케이던스 전용.

```
[T0 fetch 스윕] → 후보 풀 400-500건/일 (0페이지, 2-3분)
       ↓ 프리스크린 (규칙 기반 1차 → LLM 회색대역만)
[T1 브라우저] → 상세 추출 + 재방문 (~40페이지)
```

## 1. 갭 체크 (첫 동작)

1. `data/meta.json`의 `last_run` 확인.
2. 오늘과 1일 차이 → 정상. 2일 이상 → lookback 확장 안내를 노티에 포함.
3. `runs/`에 오늘 날짜 파일이 있으면 이미 실행: 한 줄 보고 후 종료.
4. 직전 `runs/*.json` notes의 "다음 우선순위 후보"가 있으면 이번 런에서 먼저 처리.

## 2. T0: fetch 스윕 (0페이지, 매일)

`collector/sources.json`의 `T0_fetch_daily`를 순서대로:

| 소스 | 방법 | 주의 |
|---|---|---|
| Devpost API | `fetch('devpost.com/api/hackathons?status=open&page=N')` → JSON. ETag 있으면 `If-None-Match` 헤더로 304 체크 | 8페이지 = 진행 중 67건 전수 |
| HN Algolia | `fetch('hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&hitsPerPage=1')` → 신규 스레드 확인. 월 1일이면 스레드 전체 파싱 | 월간 스페셜 처리 |
| GitHub Search | `fetch('api.github.com/search/repositories?q=topic:hackathon+created:>{7일전}&per_page=30')` | 개최사 필터: README에 rules/register/prize 포함 |
| 구글뉴스 RSS ×4 | `fetch(url)` → XML에서 `<title>`·`<link>` 추출 | 제목 정규화 중복제거 필수 |
| 위비티 SSR fetch | `fetch('wevity.com/?c=find&s=1&sp=contents&sw=AI')` → HTML에서 `ix=` 링크 집합 추출 | 직전 스냅샷과 diff → 신규 ix만 |
| HackHQ | `fetch(raw.githubusercontent.com/...hackhq/main/README.md)` → 마크다운 테이블 파싱 | 활동 중(전일 push 확인) |

**규칙**: fetch 결과를 통째로 컨텍스트에 넣지 말고 **코드로 파싱해서 후보 목록만** 추출 (JSON.parse/정규식).

## 3. 프리스크린 (규칙 기반 1차)

후보 제목+발행처+날짜로:
- **화이트리스트**: 해커톤/공모전/대외활동/사전과제/경진대회/챌린지/hackathon/contest/challenge/prize/bounty
- **블랙리스트**: 부트캠프 광고/코드잉/코드잇/국비지원 (씽유·올콘 광고 다수)
- 통과 → 상세 추출 대기 (T1)
- 회색대역(키워드 불일치·외국어·노이즈 의심) → 일일 예산 잔여 시 재검토, 아니면 skip
- **컷은 '제외'가 아닌 '우선순위 하향'** — false negative 방지

## 4. T1: 브라우저 수집 (40페이지 목표)

### 채용 (매일)
| 소스 | 키워드 | 방법 |
|---|---|---|
| 원티드 | 사전과제, AI 과제 | 검색 → 상세에서 전형절차·AI 문구 |
| 점핏 | 사전과제 | OR 매칭 — 상세 확인 후에만 |
| **잡코리아 모바일** (v1.2 신설) | 사전과제, 바이브코딩 | `m.jobkorea.co.kr/Search/Adv?Keyword=` → GI_Read/{id} → **"전체보기" 클릭 → iframe innerText**로 상세요강 전문 |

### 이벤트 상세 (T0에서 발견한 신규만)
- 위비티: T0 ix-diff로 신규만 상세 방문
- Devpost/GitHub: T0 JSON에서 흥미로운 것만 규칙 페이지 확인

### 재방문 큐
- cadence: `daily`(D-7) / `every3d` / `weekly`(id 해시 % 7 == 오늘 요일)
- **fetch로 변경 감지 먼저** (ETag/텍스트 해시) → 변경 감지 시만 브라우저 방문
- 3회 연속 fetch 실패 → status: gone

### 매너
- 로그인 강제 skip. robots 존중. 소스당 연속 요청 휴식.
- 차단(캡차/403) → 소스 즉시 중단, 노티 기록.

## 5. T2: 주간 로테이션 (토요일만)

씽유(SSR fetch), 링커리어, DoraHacks, Encode Club, MLH, KISTI AIDA, 그리팅 ATS 감시(무신사·올리브영·두들린 + 확대)

## 6. T3: 월간 (매월 1일)

- HN Who's Hiring 스레드 전체 파싱 (Algolia API)
- 소스 성과 리포: 후보수·채택률 → 하위 소스 퇴출 (Reddit .json 403·contestkorea 접속불가는 이미 퇴출)
- **새 소스 탐사**: robots.txt/sitemap/feed 자동 탐지 → `sources_candidates.json` → 오너 승인 후 편입

## 7. 분류 (맥락 판정, 규칙)

포함 조건: **전형 절차에 과제/사전과제가 존재**하는 것만.

| ai_policy | 판정 |
|---|---|
| required | AI 활용/과제/바이브 코딩/AI agent 제작이 전형의 일부 |
| allowed_graded | AI 사용 허용 + 프롬프트·과정 제출/평가 |
| allowed | AI 사용 가능 언급 |
| banned | AI 사용 금지/적발 시 탈락 |
| unspecified | 과제는 있으나 AI 언급 없음 |

이벤트: ai_usage required(AI 주제)/allowed/banned/unknown. banned는 기록만.

근거 문장 1개 evidence.quote로 필수. 애매하면 needs_review.

## 8. 산출물 + 검증 + 커밋

`runs/YYYY-MM-DD.json` → `node collector/merge.mjs` → `node collector/validate.mjs` → exit 0 시만 git push.

## 9. 하지 않는 것

- platforms.json / news.json 수정 금지 (사람 큐레이션)
- history 편집/삭제 금지 (append만)
- golden_cases.json 임의 수정 금지
- 원문 전문 저장 금지
- fetch 결과 통째 로그 금지 (파싱 후 요약만)
