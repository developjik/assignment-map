# collector/

Aside 루틴 프롬프트와 검증 도구가 여기 들어갑니다.

- ROUTINE_PROMPT.md: 매일 실행 프롬프트 (갭 체크, 스캔, 재방문, 분류, 머지, 골든케이스, push)
- golden_cases.json: 확정 사례 회귀용 (올리브영, 더게임AI, 무신사 등)
- evidence.mjs: evidence·배열 필드 정규화 규칙 (`asEvidence`, `asStringArray`, `evidenceProblem`)
- merge.mjs: postings/events 병합·dedup·changelog 생성 (루틴 내 실행)
- normalize.mjs: 기존 `data/*.json`의 문자열 evidence를 배열로 되돌리는 복구 도구 (멱등)
- validate.mjs: 골든케이스 + 스키마 무결성 검증
- watchdog.mjs: 수집 지연 자동 진단(검증 잠금·push 이탈·소스 차단·루틴 미도착) — watchdog.yml이 이슈에 붙인다
- parsers/: 소스별 영구 파서(위비티·잡코리아m·Devpost·daker·HN) — 아래 '파서·카나리' 참고
- canaries.json / canary.mjs: 수집 지표 밴드 검증(조용한 파서 실패를 경보로)
- fetch_news.py: 트렌드 뉴스 수집 → `data/news.json` (아래 참고)
- tests/: `node --test collector/tests/*.test.mjs`(머지·검증·정규화·파서 fixture 회귀), `python3 -m unittest discover -s collector/tests`(뉴스 수집)

## evidence 규칙

`data/*.json`의 `evidence`는 **언제나 배열**입니다. 문자열 하나가 들어오면 목록 렌더링이 통째로
죽습니다(2026-11-16 잡코리아 5건 사고 — 웹은 그때 임시 방어를 넣었고, 이제 수집 단계에서 막습니다).

| 파일 | 모양 | 예 |
|---|---|---|
| postings.json | `{ quote, field? }` 객체 배열 | `[{"quote": "AI 활용 필수", "field": "policy"}]` |
| events.json | 문자열 배열 | `["접수 마감 11-15 경과"]` |

- `merge.mjs`는 새/갱신 레코드의 `evidence`(그리고 `positions`, `urls_research`, `tags`)를 저장 전에
  정규화합니다. 문자열·단일 값·빈 항목도 배열이 됩니다.
- `validate.mjs`는 `postings`·`events`의 모든 `evidence`가 배열이고 원소가 비어 있지 않은 문자열(또는
  `quote` 문자열을 가진 객체)인지 확인합니다. 어긋나면 exit 1로 커밋을 잠급니다.
- 이미 커밋된 데이터에 문자열이 남아 있으면 `node collector/normalize.mjs`로 정리합니다
  (`--check`는 고칠 게 남아 있을 때만 exit 1).

```bash
node collector/normalize.mjs          # 정리 (멱등)
node collector/normalize.mjs --check  # CI 게이트
node collector/validate.mjs           # 스키마 + 골든케이스
```

## 파서·카나리 (parsers/, canary.mjs)

소스별 파싱은 즉석 정규식 대신 `collector/parsers/*.mjs`에 맡깁니다. 파서는 fetch하지 않고
stdin으로 본문을 받아 JSON을 stdout에 내는 순수 함수입니다(브라우저 컨텍스트가 필요한 fetch는
루틴이 담당). 역사적 함정 회피 규칙이 코드와 fixture 테스트로 굳어 있습니다:

- wevity.mjs: 주석 붙은 `<li >` 처리, SPECIAL 셸(ul.list 없음) 감지, dday-area 상세 파싱
- jobkorea.mjs: 이중 data-gno 노이즈 제외(컨테이너=data-index 보유), 속성 순서 뒤집힘 대비 2패턴
- devpost.mjs: `hackathons` 키, 서브도메인 url, `submission_period_dates` 문자열(인덱싱 금지)
- daker.mjs: UTC ISO → KST 날짜 변환, registrationDeadline/lastStageEndDate 규칙
- hn.mjs: 월간 Who's hiring 스레드 탐지

```bash
node collector/parsers/wevity.mjs list  < collector/tests/fixtures/wevity-list.html   # 사용 예
node collector/canary.mjs '{"wevity-list-per-page":15,"devpost-open-total":59}'       # 밴드 검증
```

카나리는 수집 지표의 정상 밴드(canaries.json)를 검증합니다. VIOLATION이면 exit 1 —
루틴은 run notes에 CANARY 줄을 남기고 해당 소스를 watch 강등 후보로 기록합니다.
소스 마크업이 바뀌면: fixture 갱신 → 테스트 케이스 추가 → 통과 → 커밋(사고를 테스트로).

## 트렌드 뉴스 (fetch_news.py)

`data/news.json` 은 일일 수집 루틴이 아니라 이 스크립트가 관리합니다. 표준 라이브러리만 씁니다.

```bash
python3 collector/fetch_news.py --dry-run    # 무엇이 들어갈지 콘솔에서 확인 (파일 안 씀)
python3 collector/fetch_news.py              # data/news.json + meta.counts.news 갱신
python3 collector/fetch_news.py --check      # 파일과 달라질 게 있으면 exit 1 (쓰지 않음)
python3 collector/fetch_news.py --limit 10   # 새 항목 수 상한 (기본 14)
```

- 소스: Google 뉴스 RSS 3종(AI 채용·면접·과제 / 바이브코딩·AI 코딩 / AI 해커톤·공모전), GeekNews, Hacker News Algolia, OpenAI 뉴스, Google AI 블로그, CIO.
- 거르기: AI 채용·이직·해커톤·AI 코딩 도구 낱말 점수, 최근 21일, 같은 사건 중복(제목 낱말 50% 이상 겹침, 같은 링크), 같은 주제 3일 내 1건, 광고·시상식·자격증반 차단.
- 남기는 것: 이 스크립트가 만든 `news-feed-*` 항목만 새로 쓰고, 손으로 정리한 `news-policy-*` / `news-trend-*` 항목은 뒤에 그대로 둡니다.
- **id는 기사 URL 해시**(`news-feed-` + 10자). 회차마다 `01, 02…`로 밀리지 않아 같은 기사는 같은 id로 남고, 하루치 갱신이 파일 전체 diff가 되지 않습니다.
- **멱등**: 만들어진 JSON이 지금 파일과 같으면 쓰지 않고 `변경 없음`으로 끝납니다(같은 날 두 번 돌려도 diff 0).
- 종료 코드: 새 항목 0건이면 기존 파일을 덮어쓰지 않고 exit 0(일부 소스 실패 포함) — 피드가 전부 죽었을 때만 exit 1.

## 뉴스 자동 갱신 (GitHub Actions)

`.github/workflows/news-refresh.yml` 이 매일 **03:30 KST**(`30 18 * * *` UTC, Aside 03:00 수집 직후)와
수동 실행(`workflow_dispatch`)으로 `python3 collector/fetch_news.py` → `node collector/validate.mjs` 를 돌리고,
`data/news.json`·`data/meta.json` 이 바뀌었을 때만 `chore(news): daily news refresh` 로 커밋·푸시합니다.

- GITHUB_TOKEN 푸시는 다른 워크플로를 깨우지 않으므로, 푸시 뒤 `deploy.yml` 을 `workflow_dispatch`로 직접 호출해 배포합니다(`actions: write` 필요).
- 뉴스 수집이 전 소스 실패로 끝나면 워크플로가 실패하고 아무것도 커밋하지 않습니다.

수동으로 같은 일을 할 때:

```bash
python3 collector/fetch_news.py && node collector/validate.mjs
git add data/news.json data/meta.json && git commit -m "chore(news): daily news refresh" && git push
```

## 테스트

```bash
node --test collector/tests/*.test.mjs                          # 머지 정규화 · 검증 · 파서 fixture 회귀
python3 -m unittest discover -s collector/tests -v               # 뉴스 수집 멱등성
python3 -m unittest discover -s pipeline/shorts/tests -v         # 쇼츠 신선도
```

리포 루트에서 `npm test` 는 위 세 개를 한 번에 돌립니다(루트 `package.json`).
