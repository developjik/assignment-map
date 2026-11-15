# collector/ (P2 예정)

Aside 루틴 프롬프트와 검증 도구가 여기 들어갑니다.

- ROUTINE_PROMPT.md: 매일 실행 프롬프트 (갭 체크, 스캔, 재방문, 분류, 머지, 골든케이스, push)
- golden_cases.json: 확정 사례 회귀용 (올리브영, 더게임AI, 무신사 등)
- merge.mjs: postings/events 병합·dedup·changelog 생성 (루틴 내 실행)
- validate.mjs: 골든케이스 + 스키마 무결성 검증
- fetch_news.py: 트렌드 뉴스 수집 → `data/news.json` (아래 참고)

## 트렌드 뉴스 (fetch_news.py)

`data/news.json` 은 일일 수집 루틴이 아니라 이 스크립트가 관리합니다. 표준 라이브러리만 씁니다.

```bash
python3 collector/fetch_news.py --dry-run    # 무엇이 들어갈지 콘솔에서 확인
python3 collector/fetch_news.py              # data/news.json + meta.counts.news 갱신
python3 collector/fetch_news.py --limit 10   # 새 항목 수 상한 (기본 14)
```

- 소스: Google 뉴스 RSS 3종(AI 채용·면접·과제 / 바이브코딩·AI 코딩 / AI 해커톤·공모전), GeekNews, Hacker News Algolia, OpenAI 뉴스, Google AI 블로그, CIO.
- 거르기: AI 채용·이직·해커톤·AI 코딩 도구 낱말 점수, 최근 21일, 같은 사건 중복(제목 낱말 50% 이상 겹침), 같은 주제 3일 내 1건, 광고·시상식·자격증반 차단.
- 남기는 것: 이 스크립트가 만든 `news-feed-*` 항목만 새로 쓰고, 손으로 정리한 `news-policy-*` / `news-trend-*` 항목은 뒤에 그대로 둡니다.
