# 매일 수집 루틴 프롬프트 (v1.1 — 2026-10-24 첫 실증 런 교훈 반영)

> 이 문서 하나로 매일의 수집 세션이 self-contained로 동작해야 한다.
> 새 세션은 이 프롬프트를 그대로 실행한다. DESIGN.md와 충돌하면 이 파일이 우선(운영 세부).

## 0. 컨텍스트

- 리포: `~/workspace/assignment-map` (GitHub: developjik/assignment-map, main)
- 프로젝트: "AI로 만들어 제출하는 모든 기회"를 매일 추적. 채용 과제 / 해커톤 / 대회 / 공모전.
- 먼저 `DESIGN.md`의 4(데이터모델)·5(소스·키워드)·6(분류규칙) 절을 읽는다.

## 1. 갭 체크 (첫 동작)

1. `data/meta.json`의 `last_run` 확인.
2. 오늘과 1일 차이 → 정상 진행. 2일 이상 차이 → 그 차이만큼 "늦게 발견" 허용 안내를 노티에 포함하고,
   이벤트는 D-14 창 밖 마감분도 회수한다(공고·대회는 지속성 데이터라 복구 가능).
3. `runs/` 디렉터리에 오늘 날짜 파일이 있으면 이미 실행한 것: 종료하고 보고만.
4. 직전 `runs/*.json`의 notes에 "다음 우선순위 후보"가 있으면 이번 런에서 먼저 처리한다.

## 2. 수집 (방문 상한 80페이지)

### 채용 (매일)
| 소스 | 방법 | 키워드 |
|---|---|---|
| 원티드 | 검색 페이지/JSON | 사전과제, AI 과제 ('과제 전형'은 노이즈 다수 — 상세 확인 후에만 기록) |
| 점핏 | 검색 HTML | 사전과제 (OR 매칭 노이즈 — 상세 확인 필수) |
| 잡코리아 | 검색 HTML | 사전과제, 바이브코딩 ('과제 전형' 3,946건은 국책/연구과제 오탐 — 폐기) |
| 구글뉴스 RSS | news.google.com/rss/search | "AI 과제 전형", "코딩테스트 AI 허용", "AI 해커톤" |

### 이벤트
| 소스 | 주기 |
|---|---|
| 위비티 | 매일 — 검색 파라미터는 `?c=find&s=1&sp=contents&sw=AI` (kwd 아님), 상세는 `gbn=view&ix={번호}` |
| Devpost · lablab.ai | 격일 |
| MLH · 프로그래머스 대회 · KISTI AIDA | 목요일만 |

### 재방문 큐 (active 추적)
- `data/postings.json`·`data/events.json`에서 `status`가 open/upcoming/judging 인 것.
- cadence 규칙: `daily`는 오늘 방문, `weekly`는 요일 해시(id 해시 % 7 == 오늘 요일)일 때만.
- 게시물 상세 재방문 → policy/deadline/status diff. 3회 연속 실패(404 등) → status: gone.

### 매너
- 로그인 강제 페이지는 건너뛴다. robots 무시 금지. 소스당 연속 요청 사이 휴식.
- 차단 징후(캡차/403)면 해당 소스 즉시 중단, 노티에 기록.

### 알려진 소스 제약 (2026-10-24 실증)
- **잡코리아 상세 본문 미렌더링**: 신규 GI_Read UI에서 상세요강(전형절차·AI 문구)이 렌더링 안 됨. 제목에 사전과제 직접 명시된 것만 확정(auto), full-text 검색 히트만으로는 needs_review 로 기록.
- **교차포스팅**: 동일 공고가 여러 보드에 올라옴(예: 원티드+잡코리아). 한 소스에만 레코드를 두고 다른 소스에서 얻은 정보(마감일 등)는 그 레코드에 반영. 소스별 id 이중 기록 금지.

## 3. 분류 (맥락 판정, 규칙)

포함 조건: **전형 절차에 과제/사전과제가 존재** 하는 것만. AI 스킬만 요구하고 과제 전형이 없으면 제외.

| ai_policy | 판정 |
|---|---|
| required | "AI 활용/AI 과제/바이브 코딩 테스트/AI agent 제작" 등 AI 사용·제작이 전형의 일부 |
| allowed_graded | "AI 사용 허용" + 프롬프트·과정 제출/평가 언급 |
| allowed | "AI 사용 가능" 언급 |
| banned | "AI 사용 금지/적발 시 탈락" |
| unspecified | 과제는 있으나 AI 언급 없음 |

- 업무 설명("AI 서비스 개발") ≠ 정책. 문맥으로 구분.
- 근거 문장 1개를 evidence.quote로 반드시 남긴다(원문 미보관 원칙).
- 판정이 애매하면 review: "needs_review" 로 커밋하고 노티에 이름 올린다.
- 이벤트: ai_usage required(AI 주제)/allowed/banned/unknown. banned는 기록만(노출 제외).

## 4. 산출물 작성

`runs/YYYY-MM-DD.json`:

```json
{
  "date": "YYYY-MM-DD",
  "postings": [ { "id": "wanted:wd123456", "source": "wanted", "company": "",
    "title": "", "positions": ["frontend"], "positions_raw": "",
    "assignment_type": "pre_assignment", "ai_policy": "required",
    "evidence": [{ "quote": "", "field": "전형절차" }],
    "url": "", "deadline": null, "status": "open", "review": "auto" } ],
  "events": [ { "id": "ko-0100", "type": "hackathon", "title": "", "host": "",
    "ai_usage": "required", "format": "online", "team": "", "prize": "",
    "hiring_link": false, "apply_deadline": null, "submit_deadline": null,
    "result_date": null, "status": "open", "url": "", "evidence": "", "source": "wevity" } ],
  "sources": [ { "name": "wanted", "ok": true, "visited": 12 } ],
  "notes": ""
}
```

- id 규칙: 채용 `{source}:{외부id}`. 이벤트는 기존 파일의 최대 일련번호 다음 (`ko-0101` 방식).
- 같은 공고가 이미 data에 있어도 재방문 결과(변경)를 같은 id로 넣는다.

## 5. 머지 + 검증 (커밋 잠금)

```bash
cd ~/workspace/assignment-map
node collector/merge.mjs runs/YYYY-MM-DD.json
node collector/validate.mjs
```

- validate exit 0 → 6단계 진행. exit 1 → **커밋 금지**. 원인 파악해서 노티. 데이터 조작으로 통과시키려 하지 말 것.

## 6. 커밋 + push + 노티

```bash
git add -A
git commit -m "collect YYYY-MM-DD: +N postings, +M events, policy:N"
git push origin main
```

- push 실패 시 1회 재시도 후 보고.
- 노티(필수 숫자): 신규 공고 n · 신규 이벤트 n · **정책 변경 n(회사명)** · 마감 임박(D-3) n · 종결 n · needs_review n · 런타임 · 방문 n/80 · 실패 소스.

## 7. 하지 않는 것

- platforms.json / news.json 수정 없음(사람 큐레이션).
- history 항목 삭제/수정 없음(append만).
- golden_cases.json 임의 수정 없음(수정은 별도 커밋+사유).
- 원문 전문 저장 금지(헤드라인·근거 문장만).
