# 🎬 Shorts Auto-Generator Pipeline

과제 지도(`assignment-map`)의 `data/events.json`을 분석하여 매일 3~5편의 숏폼(YouTube Shorts / TikTok / Reels) 대본, 연출 프롬프트, 자막 타임라인, 메타데이터를 전자동 생성하는 파이프라인입니다.

## 1. 아키텍처 및 3단 공식

1. **후킹 (00~06초)**: D-Day 마감 카운트다운과 파격적인 상금/채용 혜택 제시
2. **개요 및 반전 (06~23초)**: 주최사, 마감일, AI 필수/허용 정책 등 승부처 분석
3. **공략 및 CTA (23~42초)**: 심사위원 저격 3대 실전 포인트 및 [과제 지도](https://developjik.github.io/assignment-map/) 유입 고정댓글 유도

## 2. 자동 선별 및 스코어링 알고리즘

- **마감 임박도**: D-3 이내(+120점), D-7 이내(+90점), D-14 이내(+60점)
- **채용 연계**: 인턴십/서류 면제/채용 우대 공고(+50점)
- **AI 활용 정책**: AI 필수 공모전(+40점), AI 허용(+20점)
- **상금 규모**: 억대/수천만 원 단위 가중치(+30~50점)

## 3. 실행 방법

```bash
# 기본 3편 자동 생성 (오늘 기준)
python3 pipeline/shorts/generator.py --count 3

# 특정 날짜 기준 5편 생성
python3 pipeline/shorts/generator.py --count 5 --date 2026-11-03

# 생성 결과 시뮬레이션 (파일·manifest 미변경)
python3 pipeline/shorts/generator.py --count 3 --dry-run

# 마감 지난 queued 항목만 expired로 정리 (생성 없음)
python3 pipeline/shorts/generator.py --prune-only --date 2026-11-12
```

## 4. 큐 상태

`manifest.json`의 항목 상태는 세 가지다.

| status | 의미 |
|---|---|
| queued | 대본 준비됨, 발행 대기 |
| published | 발행 완료 (`youtube_url`·`published_at` 기록) |
| expired | 마감이 지나 발행 의미가 없어진 항목 (`expired_at`·`expired_reason`) |

생성기는 실행할 때마다 마감이 지난 queued를 자동으로 `expired`로 내린다. 별도 정리만 하려면 `--prune-only`. 후보 점수는 `open`과 `upcoming`을 모두 받고, 마감일이 지난 항목은 제외한다.

2026-11-12 정리 결과: 11-02~11-05 마감 queued 4건(YouCam·Codex·청도·스페이스 해커톤)을 expired로 내리고, 남은 published 9건만 유지했다. 같은 날 기준 후보 74건(open+upcoming, 마감 미경과).

## 5. 디렉터리 구조

- `generator.py`: 파이프라인 메인 실행 스크립트
- `manifest.json`: 생성 및 예약 발행 상태 추적 레지스트리
- `output/`: 생성된 슬롯별 마크다운 대본(`*.md`) 및 렌더링용 JSON(`*.json`)
