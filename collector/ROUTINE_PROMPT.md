# 매일 수집 루틴 프롬프트 (v1.4 — sources.json 단일 공급원·재방문 관측성. v1.3 파서·카나리 계층, v1.2 fetch-우선 아키텍처)

> 이 문서 하나로 매일의 수집 세션이 self-contained로 동작해야 한다.
> **소스의 URL·키워드·비용·상태·주의사항은 `collector/sources.json`이 단일 공급원이다.**
> v1.3까지 이 문서에 있던 소스 표는 폐기했다 — 퇴출 소스(github-hackathon·hackhq) 잔류와
> 실측 경로 드리프트(위비티 sw=AI→gp 스윕, 잡코리아 m→www GI_Read)로 sources.json과 어긋났다(2026-11-21).
> 소스를 추가·퇴출·변경할 때는 sources.json만 고친다. 이 문서는 순서·예산·판정·금지만 담는다.

## 0. 아키텍처 원칙 (v1.2)

**발견(후보 생성)은 fetch()로 = 브라우저 페이지 상한 미소모.**
브라우저 예산(상한 80페이지, 목표 ~40)은 상세 본문 추출(JS 렌더 필요)과 재방문 전용.

```
[T0 fetch 스윕] → 후보 풀 (0페이지, 2-3분)
       ↓ 프리스크린 (규칙 기반 1차 → LLM 회색대역만)
[T1 브라우저] → 상세 추출 + 재방문 (overdue 감사 기반)
```

## 0.5. 파서·카나리 사용 (v1.3)

소스별 파싱은 즉석 정규식 대신 `collector/parsers/*.mjs`에 맡긴다 — 역사적 함정 회피 규칙이
코드와 fixture 테스트로 굳어 있다. fetch는 여전히 루틴이 하고, 본문을 stdin으로 흘려 보낸다:

```
fetch 본문 | node collector/parsers/wevity.mjs list      # 전체리스트 gp 페이지
fetch 본문 | node collector/parsers/wevity.mjs detail    # 상세 gbn=view
fetch 본문 | node collector/parsers/jobkorea.mjs         # m검색 결과
fetch 본문 | node collector/parsers/devpost.mjs          # API JSON
fetch 본문 | node collector/parsers/daker.mjs            # API JSON
fetch 본문 | node collector/parsers/hn.mjs               # Who's hiring 스레드 확인
```

- 파서가 `count 0` + note를 내면 조용히 넘기지 않는다 — 마크업 변경이나 fetch 붕괴일 수 있다.
- 수집 지표를 모아 밴드 검증: `node collector/canary.mjs '{"wevity-list-per-page":15,...}'`
  VIOLATION이면 run notes에 CANARY 줄 + sources.json watch 강등 후보 기록.
- 파서를 고칠 땐: fixture 갱신 → 테스트 케이스 추가 → `node --test collector/tests/*.test.mjs` 통과 → 커밋. (사고를 테스트로)

## 1. 갭 체크 (첫 동작)

1. `data/meta.json`의 `last_run` 확인. 오늘과 1일 차이 → 정상. 2일 이상 → lookback 확대 안내 노티.
2. `runs/`에 오늘 날짜 파일이 있으면 이미 실행: 한 줄 보고 후 종료.
3. `queue/`에 미소비 콜드스탠바이 파일(있으면)부터 처리한다 — Actions fetch-candidates가
   노트북 공백 동안 모아둔 후보다. 후보는 이번 런의 T0 결과와 같은 방식(채택/미채택 판정)으로
   소비하고, 소비한 날짜 파일만 지운다(`_ledger.json`은 관측 원장이니 절대 지우지 않는다).
4. 직전 `runs/*.json` notes의 "다음 우선순위 후보"가 있으면 이번 런에서 먼저 처리.

## 2. T0: fetch 스윕 (0페이지, 매일)

`collector/sources.json`의 `T0_fetch_daily`를 위에서부터 순서대로. **status가 `retired`인 소스는 건너뛴다**
(표에 남아 있어도). 소스별 URL·파라미터·주의는 sources.json 각 항목의 note가 정확하다.

**규칙**: fetch 결과를 통째로 컨텍스트에 넣지 말고 **코드로 파싱해서 후보 목록만** 추출 (JSON.parse/정규식).
구글뉴스류는 제목 정규화 중복제거 필수.

## 3. 프리스크린 (규칙 기반 1차)

후보 제목+발행처+날짜로:
- **화이트리스트**: 해커톤/공모전/대외활동/사전과제/경진대회/챌린지/hackathon/contest/challenge/prize/bounty
- **블랙리스트**: 부트캠프 광고/코드잉/코드잇/국비지원 (씽유·올콘 광고 다수)
- 통과 → 상세 추출 대기 (T1) · 회색대역 → 예산 잔여 시 재검토, 아니면 skip
- **컷은 '제외'가 아닌 '우선순위 하향'** — false negative 방지

## 4. T1: 브라우저 수집 (목표 ~40페이지, 상한 80)

`sources.json`의 `T1_browser_daily` 순서대로. 채용 3소스(원티드·점핏·잡코리아)는 매일,
이벤트 상세는 T0에서 발견한 신규만 방문한다. 잡코리아 상세 경로(2026-11-17 확정):
`www.jobkorea.co.kr/Recruit/GI_Read/{gno}` 렌더 후 JD 전문은 '상세 모집 요약' iframe 내부 —
`page.frames()` 순회로 읽는다(메인 innerText만 읽으면 전부 누락). fetch 경로는
`GI_Read_Comt_Ifrm?Gno={id}`에 user-agent(Chrome)+referer 헤더. 종결 실측은 m GI_Read 상단
'마감' 표시 또는 지원정보 '마감되었습니다'.

### 재방문 큐 (v1.4 개정 — 관측성 기반)

1. 런 시작 시 `node collector/overdue.mjs`를 돌린다 — 케이던스 초과 항목이
   **detail_needed**(wanted·greeting·jumpit·seed·manual 등 리스트 커버 밖)와
   **list_covered**(wevity·jobkorea·devpost·daker — 매일 리스트/API 스윕이 관측)로 갈려 나온다.
2. **detail_needed 초과부터 우선 처리** (fetch 가능 경로 우선: 원티드 `/api/v4/jobs/{id}`,
   그리팅 ATS SSR diff). 상태·마감·정책 문구 변화만 본다.
3. **news.json 단서 연동**: `data/news.json`(읽기 전용) 최근 3일 항목에서 추적 중 기업·공고명과
   교차하는 정책 뉴스가 있으면 해당 공고를 이번 런 재방문 최상단으로 승격 — cadence 대기 없이
   당일 재방문한다 (올리브영 '코테 대신 AI 과제' 보도 파도를 구조화한 절차, 2026-11-21 신설).
   뉴스 제목만으로 채택·변경 판정 금지 — 원문(공고·보도) 확인 후 evidence로.
4. **list_covered 항목은 리스트 스윕으로 확인한 것으로 친다**: 위비티 배지 스냅·잡코리아 검색
   노출·Devpost open 리스트·daker 상태에서 관측된 id는 이번 run 파일의 `checked` 배열에 기록한다:
   `"checked": [{"id": "wevity:111204-...", "via": "list-sweep", "note": "D-1 배지 생존"}]`
   → merge.mjs가 `last_checked`를 갱신하고 changelog에 감사를 남긴다. via는
   `list-sweep | search-exposure | api | detail` 중 하나.
5. 강제 병합이 필요하면(매처가 못 잡는 중복) `data/dedupe_overrides.json`에
   `{"postings": [{"dup": "...", "rep": "..."}]}` 형태로 추가 — 매일의 dedupe 재계산에도 살아남는다.
6. cadence: `daily`(D-7) / `every3d` / `weekly` — merge가 마감일에서 재계산한다. 3회 연속 fetch 실패 → status: gone.

### 매너

- 로그인 강제 skip. robots 존중. 소스당 연속 요청 휴식. 차단(캡차/403) → 소스 즉시 중단, 노티 기록.

## 5. T2: 주간 로테이션

`sources.json`의 `T2_weekly`(status: active만). **토요일에 실행한다. 단 직전 7일간 T2 실행이
없었다면(미실행 토요일 만회) 요일 무관 다음 런에서 실행** — 2026-11-14 토요일 공백으로
T2 소스가 2주 무관측된 사례 방지.

## 6. T3: 월간 (매월 1일)

- HN Who's Hiring 스레드 전체 파싱 (Algolia API) — 개시 지연 시 다음 런으로.
- **소스 성과 리포**: 채택 실적은 `source_family` 기준으로 집계한다(collector/sources_family.mjs —
  events의 source 분열값은 normalize가 정규 패밀리로 모은다). 하위 소스 퇴출(retired)·watch.
- **새 소스 탐사**: robots.txt/sitemap/feed 자동 탐지 → 오너 승인 후 sources.json 편입.

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
행사 유형: hackathon / competition / contest / meetup / conference / workshop.
행사는 '참여 기회'로 수집 — 무료 공개 행사 우선, 유료도 가격과 함께 기록.

근거 문장 1개 evidence.quote로 필수. evidence는 **배열**: postings는
`[{ "quote": "…", "field": "policy|assignment|research" }]`, events는 `["…"]`.
애매하면 needs_review. validate가 문자열 evidence를 잡아 커밋을 잠근다.

## 8. 산출물 + 검증 + 커밋

`runs/YYYY-MM-DD.json`(postings·events·checked·sources·notes) → `node collector/merge.mjs runs/…` →
`node collector/validate.mjs` → exit 0 시만 git push. merge가 evidence·positions 배열을 정규화한다.
기존 데이터 정리가 필요하면 `node collector/normalize.mjs`(멱등).

## 9. 하지 않는 것

- platforms.json 수정 금지 (사람 큐레이션)
- news.json 수정 금지 (news는 `collector/fetch_news.py` 담당)
- history 편집/삭제 금지 (append만)
- golden_cases.json 임의 수정 금지
- 원문 전문 저장 금지 · fetch 결과 통째 로그 금지 (파싱 후 요약만)
