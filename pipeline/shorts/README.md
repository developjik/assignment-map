# 🎬 Shorts Auto-Generator Pipeline

과제 지도(`assignment-map`)의 공고 데이터를 분석해 매일 3~5편의 숏폼(YouTube Shorts / TikTok / Reels) 대본, 연출 프롬프트, 자막 타임라인, 메타데이터를 전자동 생성하는 파이프라인입니다.

## 1. 소재 트랙

| 트랙 | 데이터 | 소재 |
|---|---|---|
| `posting` | `data/postings.json` | 기업 실전 채용 과제(사전 과제·AI 과제 전형) |
| `event` | `data/events.json` | 해커톤·공모전 |
| `mixed` (기본값) | 둘 다 | 두 풀에서 점수 순으로 절반씩 (홀수 몫은 상위 점수가 높은 트랙) |

`--track`으로 고르고, 두 풀 중 한쪽이 비면 남은 쪽으로 채웁니다.

## 2. 28초 고밀도 3단 공식 (`28s-v1`)

42초 장문은 완청률이 떨어져 **28초(130~145자)** 로 압축했습니다. `ko-KR-InJoonNeural`(rate=+10%) 기준 초당 약 5.2자로 계산합니다.

| 구간 | 채용 과제(`posting`) | 해커톤·공모전(`event`) |
|---|---|---|
| 00~04초 후킹 | "AI 써서 과제 내라는 기업이 있습니다. 바로 {회사} {직무} 전형입니다." | "D-{n}! 상금 {상금}. {공모전명}. 아직 안 늦었습니다." |
| 04~20초 핵심 팩트 3줄 | ① 전형 방식(`process_raw`/`assignment_type`) ② AI 평가 기준(`policy_raw`/근거 인용) ③ 직무·마감 | ① 주최·마감 ② AI 활용 승부처 ③ 채용 연계 혜택 |
| 20~28초 CTA | "…프로필 링크 과제 지도에서 확인하세요." | "…프로필 링크 과제 지도에서 확인하세요." |

**길이 맞춤**: 대본은 문장 조각(piece) 단위로 조립하고, 생성기가 전체 글자 수를 130~145자(목표 138자)에 맞춰 조각의 길이를 늘리거나 줄입니다.

- 중요도(rank)가 낮은 조각부터 빠집니다: 뒤 문장(CTA 보조) → 근거 인용 → 상세 전형 → 후킹·CTA 본문 순으로 양보합니다.
- 문장 단위 조각은 중간에 잘리지 않고 통째로 빠지며, 잘라야 할 때는 쉼표·어절 경계에서 끊고 조사만 남는 꼬리를 정리합니다.
- 미달이면 근거 인용·부가 문장으로 채우고, 그래도 부족하면 짧은 안내 문장을 덧붙입니다.
- JSON에 `char_count`, `est_seconds`(글자 수 ÷ 5.2)를 기록합니다.

**비주얼 프롬프트**는 안티-슬롭 원칙을 따릅니다: AI 일러스트 대신 실제 공고 화면 하이라이트, 다크 IDE/터미널 코드 뷰, 벤토 데이터 카드. 네온·3D·글로우 금지 문구를 프롬프트에 고정합니다.

## 3. 자동 선별 및 스코어링

### 해커톤·공모전 (`score_event`)
- **마감 임박도**: D-3 이내(+120), D-7(+90), D-14(+60), D-30(+30)
- **채용 연계**: 인턴십·서류 면제·채용 우대(+50)
- **AI 활용 정책**: AI 필수(+40), AI 허용(+20)
- **상금 규모**: 억대/수천만 원 단위(+30~50)

`open`·`upcoming`만 후보, 마감이 지난 항목은 제외.

### 기업 채용 과제 (`score_posting`)

| 항목 | 점수 |
|---|---|
| 상태 | `closed`·미지원 상태는 **제외**. `open`·`active`·`rolling`·`hiring`·`None` 허용 |
| AI 정책 | `required` +100 · `allowed_graded` +70 · `allowed` +50 · `unspecified`/`restricted` +10 |
| 직무 | `frontend` +40 · `fullstack`/`ai` +30 · 그 외 +10 |
| 마감 | D-7 이내 +50 · D-14 +30 · D-30 +15 · 상시(마감 없음) +20 · 지난 마감은 제외 |
| 증빙 | `evidence` 또는 구체적 `process_raw`가 있으면 +20 |

## 4. 실행 방법

```bash
# 기본 (mixed, 4편, 오늘 기준)
python3 pipeline/shorts/generator.py

# 트랙별 생성
python3 pipeline/shorts/generator.py --track posting --count 2
python3 pipeline/shorts/generator.py --track event   --count 2
python3 pipeline/shorts/generator.py --track mixed   --count 2 --date 2026-11-12

# 생성 결과 시뮬레이션 (파일·manifest 미변경)
python3 pipeline/shorts/generator.py --track mixed --count 2 --date 2026-11-12 --dry-run

# 마감 지난 queued 항목만 expired로 정리 (생성 없음)
python3 pipeline/shorts/generator.py --prune-only --date 2026-11-12
```

| 인자 | 의미 |
|---|---|
| `--count N` | 생성 편수 (기본 4) |
| `--date YYYY-MM-DD` | 기준일 (기본: 오늘, KST) |
| `--track mixed\|posting\|event` | 소재 트랙 (기본 mixed) |
| `--dry-run` | 후보와 글자 수만 확인 |
| `--prune-only` | 마감 지난 queued 정리만 |

슬롯은 점심 12:30 → 오후 15:30 → 퇴근 18:30 → 야간 21:30 순으로 배정하고, 4편을 넘기면 슬롯 태그에 `2`를 붙여 파일명 충돌을 막습니다.

## 5. 큐 상태

`manifest.json`의 항목 상태는 세 가지다.

| status | 의미 |
|---|---|
| queued | 대본 준비됨, 발행 대기 |
| published | 발행 완료 (`youtube_url`·`published_at` 기록) |
| expired | 마감이 지나 발행 의미가 없어진 항목 (`expired_at`·`expired_reason`) |

생성기는 실행할 때마다 마감이 지난 queued를 자동으로 `expired`로 내린다. 별도 정리만 하려면 `--prune-only`.

manifest 항목에는 `type`(`posting`/`event`), `track`, `template`(`28s-v1`), `char_count`, `score`가 함께 기록된다.

## 6. 디렉터리 구조

- `generator.py`: 파이프라인 메인 실행 스크립트
- `renderer.py`: TTS(edge-tts) + 씬 이미지 + 자막 → 1080x1920 mp4 렌더러
- `manifest.json`: 생성 및 예약 발행 상태 추적 레지스트리
- `output/`: 생성된 슬롯별 마크다운 대본(`*.md`) 및 렌더링용 JSON(`*.json`)
