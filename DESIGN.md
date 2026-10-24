# 과제 지도 — 설계 문서

버전 0.1 · 2026-10-24 · 오너: developjik

## 0. 미션

"AI로 만들어 제출하는 모든 기회"를 매일 자동 수집·분류·추적해서,
FE 개발자(오너)가 이직·포트폴리오에 바로 쓸 수 있는 지도로 만든다.

운영비 ₩0: GitHub Actions + Pages 무료 쿼터, Aside 루틴. 고래 지도 / 쉼표와 동일 모델.

## 1. 범위

| 유형 | 판별 기준 | 추적 종점 |
|---|---|---|
| 채용 과제 | 과제 전형에 AI 허용·요구 | 마감 / 채용 완료 |
| 해커톤 | AI 사용 허용 또는 AI 주제 | 결과 발표 |
| 대회·챌린지 | AI 활용 build & submit | 결과 발표 |
| 공모전 | AI 제작물 제출 부문 | 수상 발표 |

경계선: `ai_usage: banned`(AI 금지, 예: 전통 알고리즘 대회)는 기록만 하고 노출에서 제외.
목적이 "AI 활용 능력 → 포트폴리오·채용 연결"이므로 금지 대회는 노이즈.

킬러 필드: `hiring_link` — 수상 시 서류 통과 등 채용 연계 이벤트(코파톤 계열)는 1급 노출.

## 2. 아키텍처 (역할 분담)

**Aside가 데이터를 넣고, GitHub가 사이트를 뽑는다.**

| 주체 | 역할 |
|---|---|
| Aside 루틴 (주) | 매일 03:00 KST. 브라우저 수집 → 맥락 분류 → JSON 머지 → 골든케이스 검증 → git commit+push |
| GitHub Actions (보조) | push 트리거 Pages 빌드·배포 / 매일 last_run 감시(26h+ 무갱신 알림) / 최후 백업 스크래퍼(원티드 API·뉴스 RSS만, HTML 파싱 없음) |

Aside를 주 수집기로 선택한 이유: ① 채용공고·대회는 지속성 데이터라 하루 놓쳐도 복구 가능(맥북 꺼짐 약점 무해) ② 실제 Chrome이라 봇 차단·JS 렌더 우회 ③ 정규식이 아닌 맥락 판독으로 정책 분류 품질 확보 ④ 레이아웃 변화에 적응.

## 3. 하루 사이클

```
03:00 루틴 깨어남, meta.json last_run 갭 체크 (갭 있으면 lookback 확대)
~03:05 수집: 신규 스캔(검색) + 이벤트 스캔 + active 재방문 큐
~03:07 분류·diff → postings/events 병합(dedup) → changelog 생성
~03:08 골든케이스 통과 시에만 git push (커밋 잠금)
~03:10 완료 노티(신규 n/정책변경 n/D-3 n) · 04:30 Actions 감시(watchdog)
```

방문 상한: 하루 40~80건. cadence 3단계로 유지.
- 채용: 신규·D-7 이내 매일 / 일반 2~3일 로테 / 상시 주 1회
- 이벤트: 주 1회 → D-14부터 매일

## 4. 데이터 모델

### postings.json (채용)
```jsonc
{
  "id": "wanted:wd359551",          // {source}:{external_id} — dedup 키
  "source": "wanted|jobkorea|jumpit|saramin|news|manual-research",
  "company": "더게임AI",
  "positions": ["frontend","backend"],
  "positions_raw": "원문 직무 기술",
  "assignment_type": "pre_assignment|coding_test|challenge|interview_only|unknown",
  "ai_policy": "required|allowed_graded|allowed|banned|unspecified",
  "evidence": [{ "quote": "근거 문장 1개", "field": "본문 어디서" }],
  "url": "...", "deadline": "YYYY-MM-DD|null",
  "status": "open|closed|gone|no_hiring",
  "first_seen": "...", "last_checked": "...", "check_cadence": "daily|every3d|weekly",
  "review": "auto|confirmed|needs_review",
  "history": [{ "date":"MM-DD", "event":"created|policy_changed|deadline_extended|closed",
                "from":"...", "to":"...", "evidence":"..." }]
}
```

### events.json (해커톤·대회·공모전)
```jsonc
{
  "id": "ko-0001|global-0001",
  "type": "hackathon|competition|contest",
  "title": "", "host": "",
  "ai_usage": "required|allowed|banned|unknown",   // banned → 노출 제외
  "format": "online|offline|hybrid|unknown",
  "team": "", "prize": "",
  "hiring_link": false,                             // 수상→채용 연계 여부(킬러 필드)
  "apply_deadline": null, "submit_deadline": null, "result_date": null,
  "url": "", "status": "upcoming|open|judging|closed",
  "evidence": "", "source": "",
  "check_cadence": "weekly",                        // D-14부터 daily
  "history": []
}
```

### platforms.json / news.json
플랫폼(구직 채널)은 완만히 변화 → 수집이 아닌 큐레이션. 뉴스·통계는 트렌드 탭 재료.

### 공통 규칙
- `history[]`에 이벤트가 누적. 공고 1건 = 상태가 아니라 이야기.
- 원문 미보관. 헤드라인·URL·근거 문장만. `runs/{date}.json`에 당일 원본 스냅샷 3개월 보관(오탐 추적).
- changelog.json: 일별 diff(신규/정책 변경/마감/종결).

## 5. 수집 소스와 키워드

채용: 점핏·원티드·잡코리아(검색 HTML/API), 구글뉴스 RSS, 기업 채용페이지.
이벤트: 위비티(wevity), Devpost, lablab.ai, 프로그래머스 대회, MLH·AIcrowd(후순위 주 1회).

검색 키워드 8종(채용): 과제 전형 / 사전과제 / AI 과제 / 바이브 코딩 / AI 코딩 / 프롬프트 / 과제 제출 / AI 사용.
이벤트: 해커톤 / AI 해커톤 / 공모전 AI / AI 에이전트 챌린지 / LLM 챌린지 / 경진대회 AI.

## 6. 분류 규칙 (맥락 기반, 5분류)

- required: "AI 활용/AI 과제/바이브 코딩 테스트/AI agent 제작"
- allowed_graded: "AI 사용 허용" + "프롬프트·과정 제출/평가"
- allowed: "AI 사용 가능" 언급만
- banned: "AI 사용 금지/적발 시 탈락"
- unspecified: 과제 전형은 있으나 AI 언급 없음 (미언급으로 명시 기록)

업무 설명("AI 서비스 개발")과 정책("과제에 AI 허용")을 문맥으로 구분.
모호하면 `needs_review` 큐. 확신 있는 데이터만 커밋.

## 7. 품질 게이트

1. 골든케이스 회귀: 확정 사례(올리브영 뉴스, 더게임AI 원티드, 무신사 The Machine 등)가
   분류·머지 결과에 그대로 존재하는지 매 실행 검증. 실패 시 커밋 잠금.
2. Actions 감시: last_run 26h+ 무갱신 → 알림. 3일 연속 소스 실패 → 해당 소스 자동 비활성.
3. 오탐 관리: 사이트 "오탐 신고" → GitHub 이슈. needs_review는 주간 정리.
4. 웹 slop-lint: 16체크(그라디언트/카드그리드/이모지아이콘/eyebrow/스톡카피/fade-up 등)가
   빌드 게이트. 실패 시 배포 불가.

## 8. 사이트 디자인 (방향: dark-terminal 단일 커밋)

원칙: 다른 스타일과 평균 내지 않는다. 표와 텍스트가 주인.

토큰 (`:root` 경유만):
- 폰트: JetBrains Mono 단일. Inter/Roboto/Geist 금지.
- 배경 #0B0E14 / 패널 #0F131B / 보더 #1A2130 / 본문 #C9D4E3 / 뮤트 #66738A
- 정책색: red #FF5C5C(필수) / blue #5CA8FF(허용·채점) / green #34D399(허용) / yellow #E5C07B(검토) — 한국 시장 관례
- radius 0~2px. 그림자 없음. 행 높이 24~26px.

금지(anti-slop 상세는 docs/design/anti-slop.md):
KPI 카드 그리드(→ 한 줄 티커), pill 칩(→ 7px 색 점+텍스트), 둥근 카드 나열,
middle-dot 메타(→ 각진 구분자 |), 이모지·그라디언트·glow, 섹션별 fade-up, eyebrow 라벨, 스톡 카피.

필수(크래프트 플로어): focus-visible, prefers-reduced-motion, 반응형(min-width 표+내부 스크롤), alt.

스택: Rollup 3 + React 18 (순수 JS — esbuild 네이티브 바이너리가 샌드박스에서 차단되어 Vite 대체, 2026-10-24).
구조: 좌측 레일(유형+카운트) + 상태 티커 스트립 + 필터 행 + dense 표 + 확장 행(history 타임라인) + 푸터(출처/갱신시각/commit hash).
탭: 전체 기회 / 채용 과제 / 해커톤 / 대회·챌린지 / 공모전 / 플랫폼 / 트렌드·뉴스 / 변경로그 / 방법론.

## 9. 예외 처리

- 맥북 꺼짐: 다음 실행이 meta.json 갭 감지 → lookback 확대 → 완전 복구(공고·대회는 며칠씩 지속).
- Aside 장애: Actions 감시 알림 → 백업 스크래퍼(원티드 API·RSS만)가 Aside 복구 전 데이터 유지.
- 소스 차단: 저속 운영(소스당 1일 몇 회) 원칙, 3일 연속 실패 시 비활성·알림.
- 저작권/ToS: 공개 페이지만, 원문 미보관, robots 존중.

## 10. 로드맵

| Phase | 내용 | 게이트 산출물 | 상태 |
|---|---|---|---|
| P1 | 리포·스키마·시드(플랫폼/채용/뉴스/이벤트)·DESIGN.md·push 경로 | 첫 커밋 079fff1 + push 성공 | 완료 2026-10-24 |
| P2 | 수집·추적 로직(스캔+재방문+이벤트), 분류·diff, 골든케이스 | 4소스 실증 + 골든 6/6 (b77d88b) | 완료 2026-10-24 |
| P3 | Aside 루틴 + Actions 감시/백업 자동화 | 3일 연속 무인 자동 수집 | 등록 완료, 관찰중 (첫 실행 10-25 03:00) |
| P4 | 웹 9탭 React+Rollup(순수JS), slop-lint 게이트 | 로컬 렌더 46행 + 인터랙션 통과 (f5be1ca) | 완료 2026-10-24 |
| P5 | Pages 배포 + 검증 | 라이브 렌더 + FCP/CLS/반응형 수치 (c6b64a9) | 완료 2026-10-24 |
| P6 | 운영 안정화 | 오탐 큐 정리·주간 다이제스트·2주 운영 데이터 | |

## 11. 루틴 설정 (P3 상세)

- 매일 03:00 KST 1회, 루틴 1개만(갭 복구는 프롬프트 내장). 2026-10-25 첫 실행.
- 권한: full-access로 시작. 사유: 새벽 무인 실행이라 guard 승인 대기가 목적(무인 수집)과 충돌. 데이터 무결성은 validate 커밋 잠금 + git 이력(되돌림 가능)으로 보장. 2주 관찰 후 필요 시 강등.
- 완료 노티: 신규 n · 정책 변경 n(회사명) · D-3 임박 n · 종결 n · 런타임.

## 부록: 시드 데이터 출처

2026-10-11 수행된 수동 리서치(웹 검색 3트랙 병렬) 결과 63행을 변환해 시드로 사용.
원본 산출물: Aside 세션 아티팩트 FE_AI과제_채용조사_2026-10.xlsx.
이벤트 시드: 2026-10-24 국내·해외 병렬 조사(서브에이전트).
