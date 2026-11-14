# 과제 지도 (assignment-map)

채용 과제·해커톤·대회·공모전·밋업을 매일 03:00 KST에 수집해, **AI로 만들어 제출할 수 있는 기회**만 남겨 공개하는 데이터 리포 + 정적 사이트.

- 사이트: https://developjik.github.io/assignment-map/
- 피드: [RSS](https://developjik.github.io/assignment-map/feed.xml) · [JSON Feed](https://developjik.github.io/assignment-map/feed.json)
- 데이터 API: `data/*.json` (JSON만, 원문 미보관. 헤드라인과 근거 1문장만)

기획·설계 배경은 [DESIGN.md](DESIGN.md), 디자인 금지 목록은 [docs/design/anti-slop.md](docs/design/anti-slop.md).

## 무엇을 추적하나

| 유형 | 예 | 판별 기준 |
|---|---|---|
| 채용 과제 | 사전 과제·과제 전형이 있는 공고 | 상세 본문의 전형 절차와 AI 정책 문구 |
| 해커톤 | 국내외 AI 해커톤 | 주제·상금·채용 연계 |
| 대회 | 경진대회·챌린지 | AI 활용 정책 |
| 공모전 | AI 영상·광고·아이디어 공모 | 제출물에 AI 사용 가능 여부 |
| 밋업 | 세미나·컨퍼런스·워크샵 | 개발자 대상 여부 |

AI 사용을 금지하는 기회는 기록만 하고 화면에서 뺀다. 각 레코드는 **정책 근거 문장(evidence)** 과 **확인일(last_checked)** 을 함께 갖는다 — 정책은 광고 문구가 아니라 원문에서만 판정한다.

## 아키텍처: 사람이 손대지 않는 데이터 흐름

```
        ┌──────────────────────── 매일 03:00 KST ────────────────────────┐
        │                                                                │
  Aside 루틴 (에이전트 세션)                              Browser AI Agent
  · T0 fetch 스윕 (JSON·RSS·SSR, 0페이지)                 · T1 상세 판독 (JS 렌더)
  · 후보 프리스크린 → 회색대역만 LLM 판정                  · T2 주간 소스 로테이션
        │                                                                │
        └───────────────┬────────────────────────────────────────────────┘
                        ▼
             JSON Merge & Golden Cases
             · merge.mjs  : 신규/변경/종결 diff, history 기록
             · validate.mjs: 스키마 무결성 + 골든케이스 6/6 (실패 시 커밋 잠금)
                        │
                        ▼
         GitHub Actions (push → build → Pages)
         · slop-lint 16체크 → rollup + terser → feed.xml / feed.json / sitemap
                        │
                        ▼
        Anti-Slop Terminal Web (React 18, 정적)
        · 키보드 우선 표, 정책 배지, 마감 D-day, .ics 내보내기
        · watchdog 워크플로가 26시간 무갱신 시 이슈로 경보
```

수집은 **fetch 우선**이다. 발견은 fetch로 하고(브라우저 페이지 상한을 쓰지 않는다), 브라우저는 JS 렌더가 필요한 상세와 재방문에만 쓴다. 소스의 URL·비용·상태는 `collector/sources.json` 한 곳에 모으고, 성과 없는 소스는 T3 월간 리포트에서 `retired`로 내린다.

## 숫자 (2026-11-12 기준)

| 항목 | 값 |
|---|---|
| 추적 레코드 | 192건 (채용 공고 52 · 이벤트 140) |
| 지금 열려 있는 기회 | 123건 |
| AI 정책을 명시한 진행중 항목 | 92건 (그중 AI 필수 77건) |
| 피드 발행 항목 | 114건 (RSS + JSON Feed 동일 목록) |
| 골든케이스 | 6/6 (정책 판정 회귀 방지) |
| 안티-슬롭 검사 | 16체크, 빌드 실패 시 배포 중단 |
| 운영비 | ₩0 (GitHub Actions + Pages 무료 쿼터, 외부 DB·서버 없음) |

숫자는 데이터가 아니라 `data/meta.json`과 빌드가 계산한다. 이 표는 마지막 갱신 시점의 스냅샷이다.

## 웹 (web/)

React 18 + Rollup 3, 순수 JS 툴체인(네이티브 바이너리 없음). 빌드 타임에 `data/*.json`을 번들하므로 런타임 API 호출이 없다.

- **표가 주인공**: j/k 또는 ↑/↓ 행 이동, Enter 상세, `o` 원문 새 탭, `s` 관심, `/` 검색, Esc 닫기, `?` 단축키 도움말. 모든 컬럼 정렬 가능.
- **데스크톱 2-Pane(1200px 이상)**: 행을 클릭하거나 Enter를 누르면 표 아래로 아코디언이 펼쳐지는 대신 **우측 고정 상세 패널**이 붙는다. 패널에는 AI 정책 원문·근거 문장, 사전과제 전형 절차, 마감 D-day와 남은 시간 카운트다운, `.ics` 등록, 원문 열기, 닫기 버튼이 있다. `j`/`k`로 행을 옮기면 패널 내용이 실시간으로 따라오고, `Esc`로 닫는다(닫은 뒤에는 Enter·클릭으로 다시 연다). 1024~1359px에서는 패널과 표가 같이 설 수 있게 유형·확인·대상/주최 컬럼을 패널에 맡기고 이름·근거에 폭을 넘긴다. 1200px 미만은 기존 아코디언 그대로다.
- **상단 압축 밴드**: 헤더·요약 통계·수집 메타·마감 티커·검색·필터·단축키 힌트가 7줄로 쌓여 있던 것을 **헤더 1줄 + 통계/메타/티커 1줄 + 필터 1줄**로 묶었다. 검색은 헤더 한 곳으로 합쳤고(표 위 중복 검색줄 제거), 단축키 안내는 하단 키바 한 곳으로 모았다. 1920×1080에서 표 본문이 y=248 → y=110으로 올라와 첫 화면에 보이는 행이 31 → 36건이 됐다(1440×900은 276 → 134, 23 → 28건).
- **마감 티커**: 표 위 한 줄이 D-3 안으로 들어온 건(부족하면 D-7까지)을 3.8초마다 넘긴다. 이름·D-day·AI 정책을 같이 보여주고, 누르면 그 행을 연다. 이때 지금 켜 둔 탭·정책·직군·진행 상태·검색이 그 행을 가리고 있으면 필요한 조건만 풀고(탭이면 전체 기회로), 짧은 안내로 무엇을 풀었는지 알려준다. 마우스를 올리거나 포커스가 가면 멈추고, `prefers-reduced-motion`이면 자동으로 돌지 않는다(이전/다음 버튼은 그대로).
- **검색**: 제목·기업/주최·상금·직군/기술 키워드를 한 인덱스에서 찾고, 공백으로 여러 단어를 넣으면 AND로 좁힌다.
- **조건**: AI 정책(필수/허용+채점/허용/미언급), 상태, 내 진행(관심/과제중/제출완료), 직군(FE), 채용연계만, 정책변경만, 관심(별표)만.
- **관심(별표)**: 행 이름 앞 별표 또는 `s` 키로 담고 뺀다. `localStorage['am-starred']`에 ID 배열로 남아 새로고침·재방문에도 유지되고, `관심 (N)` 필터로 별표한 것만 볼 수 있다. `관심 .ics`는 별표한 건의 마감만 모아 `assignment-map-starred.ics` 하나로 내려받는다.
- **딥링크**: 탭·검색어와 모든 필터 상태가 URL 해시에 남는다. `#t=postings&policy=required&jobfam=fe`로 들어가면 '채용 과제 + AI 필수 + FE'가 켜진 화면이 바로 뜨고, `#t=meetup`·`#t=calendar`도 그대로 열린다. 조건을 바꿀 때마다 `history.replaceState`로 조용히 갱신된다(뒤로가기 기록을 더럽히지 않는다).
- **정렬**: 마감 임박(지난 마감과 상시는 뒤로) / 최신 등록, 또는 컬럼 헤더 클릭.
- **지원 현황 트래커**: 공고마다 `관심 / 과제중 / 제출완료`를 붙인다. 상세 패널(모바일 아코디언)의 상태 버튼으로 한 번에 바꾸고, 표 행의 상태 배지는 누를 때마다 다음 단계로 넘어간다(마지막에서 한 번 더 누르면 해제). 관심은 기존 별표(`localStorage['am-starred']`)와 같은 사실이라 별표로 저장되고, 과제중·제출완료만 `localStorage['am-status']`에 남는다 — 같은 사실을 두 곳에 두지 않는다. `내 진행` 필터로 상태별로 좁혀 볼 수 있다.
- **공략 진행률**: 상세 패널 머리에 공략 체크리스트 완료율(`체크 3/11`)을 막대로 보여준다. `lib/guideProgress.js`를 거쳐 저장하므로 체크할 때마다 숫자가 바로 따라온다.
- **마감 캘린더 탭**: 모집 중인 채용 과제·해커톤·대회·공모전의 마감일을 월간/주간 격자로 본다(밋업·설명회는 뺀다). 날짜를 누르면 그날 마감 목록이, 항목을 누르면 우측 상세 패널이 열리고, 보이는 범위나 그날 목록을 `.ics`로 바로 내려받는다. 390px에서는 격자를 날짜와 점으로 줄이고 선택한 날짜의 목록을 아래 카드로 보여준다.
- **정보 수정·AI 정책 제보**: 상세 패널과 모바일 아코디언에 제보 링크가 있다. 누르면 GitHub 새 이슈 화면이 열리면서 제목(`[제보] {이름} 정보/AI 정책 수정 요청`)과 본문(공고 ID·현재 정책·마감·원문 URL·근거 인용 템플릿)이 미리 채워진다.
- **수집 지연 배지**: 헤더가 `data/meta.json`의 `last_run`을 **브라우저 날짜**로 다시 세어, 2일 이상 밀리면 `수집 지연 (마지막: 2026-11-12 | 2일 전)`을 띄운다. 빌드 시점에 굳히지 않으므로 수집이 재개되면 저절로 사라진다.
- **.ics 내보내기**: 행 상세의 `.ics` 버튼은 그 공고의 마감일을 종일 일정으로, 상단 `.ics 내보내기`는 지금 보이는 목록 전체를 VCALENDAR로 내려받는다(마감 3일 전 알람 포함).
- **피드**: `feed.xml`(RSS 2.0)과 `feed.json`(JSON Feed)을 빌드마다 생성한다.
- **모바일(760px 이하)**: 레일은 가로 스크롤 칩 바(높이 46px)로 눕고, 통계·필터 줄도 한 줄 스크롤이 된다. 표는 행 높이 46px에 이름 두 줄까지 보이고, 상세 안 '원문 열기'와 `.ics` 버튼은 38px 터치 영역을 갖는다. 물리 키보드가 없는 화면이라 하단 키 안내는 감춘다.
- **공유 카드**: `python3 scripts/generate-og.py`가 `data/*.json`의 실제 지표를 읽어 1200x630 다크 터미널 `og-image.png`를 그린다. `npm run build`가 피드·사이트맵 뒤에 자동 실행하므로 링크드인·X 미리보기가 수집 결과를 따라간다(Pillow나 한글 폰트가 없는 환경에서는 건너뛴다).
- **AI 실전 과제 공략**: 상세 패널(모바일 아코디언) 안에 공고별 공략 섹션이 붙는다. `data/guides/*.md` 4종(React SPA, AI 에이전트, 풀스택 API, 데이터 시각화)이 각각 과제 본질 3문단, 4단계 AI 워크플로, 실전 프롬프트 4개(복사 버튼), 탈락 방지 체크리스트 10~11개를 담고 있고, 공고의 직군(position)·유형(type)·키워드로 가장 맞는 아키타입이 기본 노출된다(매핑 근거를 `매핑: FE 포지션 + 키워드 react`처럼 같이 보여준다). 상단 칩으로 다른 아키타입을 직접 골라 볼 수 있고, 체크 상태는 `localStorage['am-guide-checks']`에 남는다. 가이드는 빌드 타임에 `web/scripts/build-guides.mjs`가 파싱해 `src/data/guides.generated.json`으로 컴파일하고 `dist/data/guides.json`으로도 내보낸다(런타임 마크다운 파서 없음).

```bash
cd web
npm ci
npm run build      # slop-lint 16체크 → 가이드 컴파일 → rollup + terser → dist/
npm run lint:slop  # 디자인 규칙만 검사
npm run guides     # data/guides/*.md → src/data/guides.generated.json 만 다시 생성
npm run feeds      # 현재 데이터로 피드만 다시 생성
npm run preview    # dist/ 정적 서버 (127.0.0.1:4173)
```

### 안티-슬롭 게이트

`web/scripts/slop-lint.mjs`가 그라디언트, 그라디언트 텍스트, Inter/Roboto/Geist, glass·glow, 외부 drop-shadow, 이모지, 자간 0.1em 이상 라벨, 스톡 카피, fade-up, 중앙 정렬, 4px 초과 라운드, ` · ` 구분자, card/hero 클래스명을 막고, `:focus-visible`·`prefers-reduced-motion`·viewport·`img alt`를 요구한다. 검사는 `src/`와 `index.html`을 대상으로 하고, 하나라도 걸리면 `npm run build`가 멈춘다.

## 데이터 파이프라인

```
data/       postings.json · events.json · platforms.json · news.json · changelog.json · meta.json
            guides/ (AI 실전 과제 공략 마크다운 4종 — 빌드 타임에 JSON으로 컴파일)
runs/       런별 실행 기록 (소스별 방문 수·실패·판단)
collector/  sources.json(소스 레지스트리) · merge.mjs · validate.mjs · golden_cases.json · ROUTINE_PROMPT.md
pipeline/   shorts/ (이벤트 → 쇼츠 대본 파이프라인)
```

- `node collector/validate.mjs` — 스키마 무결성, 중복 id, meta 카운트 일치, 골든케이스 6/6. 실패하면 커밋하지 않는다.
- `data/changelog.json` — 날마다 신규·정책 변경·마감 변경·상태 변경을 남긴다. 웹의 "AI 정책 변경 기업" 뷰가 이 기록과 각 레코드 history를 함께 읽는다.
- `runs/*.json` — 그날 무엇을 몇 페이지로 확인했고 무엇을 못 했는지. 다음 런의 우선순위가 여기서 이어진다.

## 쇼츠 파이프라인 (pipeline/shorts/)

`data/events.json`(해커톤·공모전)과 `data/postings.json`(기업 채용 과제)에서 마감·채용연계·AI 정책·상금/직무로 점수를 매겨 28초 대본을 만든다. `--track posting|event|mixed`로 소재 트랙을 고르고(기본 mixed), 큐는 `manifest.json`이 관리하며 마감이 지난 queued 항목은 `--prune-only`로 정리한다.

```bash
python3 pipeline/shorts/generator.py --track mixed --count 4 --date 2026-11-12 --dry-run   # 후보만 확인
python3 pipeline/shorts/generator.py --track posting --count 1                              # 기업 채용 과제 1편
python3 pipeline/shorts/generator.py --prune-only                                           # 지난 큐 정리
python3 pipeline/shorts/renderer.py --test                                                  # 3~5초 샘플 mp4 (파이프라인 점검)
python3 pipeline/shorts/renderer.py --latest --out pipeline/shorts/renders/today.mp4        # 최신 대본 → mp4
```

`renderer.py`는 대본을 TTS(edge-tts)와 터미널 프레임(Pillow), ffmpeg만으로 1080x1920 mp4로 끝낸다 — 외주 편집도, 유료 영상 API도, AI 생성 이미지도 쓰지 않는다(운영비 ₩0). 세부 옵션은 [pipeline/shorts/README.md](pipeline/shorts/README.md) 참고.

## 기술 스택

React 18 · Rollup 3 · Babel · Terser · Node.js 20 (ESM) · Python 3 (쇼츠 파이프라인) · GitHub Actions + Pages · 자체 안티-슬롭 린터(slop-lint 16체크) · 자체 데이터 검증기(validate + golden cases)

## 문서

- [DESIGN.md](DESIGN.md) — 제품 설계, 정책 판정 규칙, 소스 철학
- [docs/design/anti-slop.md](docs/design/anti-slop.md) — AI 티 나는 UI 패턴 조사와 금지 목록
- [collector/ROUTINE_PROMPT.md](collector/ROUTINE_PROMPT.md) — 매일 수집 세션 프롬프트
- [web/README.md](web/README.md) — 웹 빌드 세부
