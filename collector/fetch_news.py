#!/usr/bin/env python3
"""fetch_news.py — 트렌드 뉴스 수집·정규화 (data/news.json 갱신)

공개 RSS/JSON 피드에서 AI 채용·개발자 이직·해커톤·AI 코딩 도구 관련 기사만 골라
data/news.json 의 스키마(topic/tag/content/date/source/id)에 맞춰 앞쪽에 싣는다.

- 표준 라이브러리만 쓴다 (urllib + xml.etree). 설치할 것이 없다.
- 기존 큐레이션 항목(news-policy-*, news-trend-*)은 지우지 않고 뒤에 그대로 남긴다.
  이 스크립트가 관리하는 항목만 id 접두사 news-feed- 로 다시 만든다.
- data/meta.json counts.news 도 같이 맞춘다.

사용:
    python3 collector/fetch_news.py              # 수집해서 파일에 쓴다
    python3 collector/fetch_news.py --dry-run    # 무엇이 들어갈지 콘솔에만 본다
    python3 collector/fetch_news.py --limit 10   # 새 항목 수 상한 (기본 14)
"""

import argparse
import html
import json
import re
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
NEWS_PATH = REPO / "data" / "news.json"
META_PATH = REPO / "data" / "meta.json"
KST = timezone(timedelta(hours=9))
UA = "assignment-map-news/1.0 (+https://github.com/developjik/assignment-map)"
FRESH_PREFIX = "news-feed-"
MAX_AGE_DAYS = 21
ATOM = "{http://www.w3.org/2005/Atom}"

# 수집 소스 — 전부 인증 없는 공개 피드. query 는 Google 뉴스 RSS 검색어.
SOURCES = [
    {"id": "gnews-kr-hiring", "label": "구글뉴스", "kind": "rss", "localized": True, "quota": 4, "min_score": 4,
     "url": "https://news.google.com/rss/search?q=%22AI%20%EC%B1%84%EC%9A%A9%22%20OR%20%22AI%20%EB%A9%B4%EC%A0%91%22%20OR%20%22AI%20%EA%B3%BC%EC%A0%9C%22&hl=ko&gl=KR&ceid=KR:ko"},
    {"id": "gnews-kr-vibe", "label": "구글뉴스", "kind": "rss", "localized": True, "quota": 4, "min_score": 4,
     "url": "https://news.google.com/rss/search?q=%22%EB%B0%94%EC%9D%B4%EB%B8%8C%EC%BD%94%EB%94%A9%22%20OR%20%22AI%20%EC%BD%94%EB%94%A9%22%20OR%20%22AI%20%EA%B0%9C%EB%B0%9C%EC%9E%90%22&hl=ko&gl=KR&ceid=KR:ko"},
    {"id": "gnews-kr-contest", "label": "구글뉴스", "kind": "rss", "localized": True, "quota": 3, "min_score": 4,
     "url": "https://news.google.com/rss/search?q=%22AI%20%ED%95%B4%EC%BB%A4%ED%86%A4%22%20OR%20%22AI%20%EA%B3%B5%EB%AA%A8%EC%A0%84%22%20OR%20%22AI%20%EA%B2%BD%EC%A7%84%EB%8C%80%ED%9A%8C%22&hl=ko&gl=KR&ceid=KR:ko"},
    {"id": "geeknews", "label": "GeekNews", "kind": "rss", "localized": True, "quota": 3, "min_score": 3,
     "url": "https://news.hada.io/rss"},
    {"id": "hn-ai-hiring", "label": "Hacker News", "kind": "json", "quota": 2, "min_score": 3,
     "url": "https://hn.algolia.com/api/v1/search_by_date?query=AI%20interview%20hiring&tags=story&hitsPerPage=30"},
    {"id": "openai-news", "label": "OpenAI", "kind": "rss", "quota": 2, "min_score": 2,
     "url": "https://openai.com/news/rss.xml"},
    {"id": "google-ai-blog", "label": "Google AI", "kind": "rss", "quota": 2, "min_score": 2,
     "url": "https://blog.google/technology/ai/rss/"},
    {"id": "cio", "label": "CIO", "kind": "rss", "quota": 2, "min_score": 3,
     "url": "https://www.cio.com/feed/"},
]

# 이 사이트 독자(AI 과제를 준비하는 개발자)에게 걸리는 말 — 하나도 없으면 버린다
KEYWORDS = {
    "채용": 4, "면접": 4, "과제": 4, "전형": 3, "이직": 3, "취업": 3, "취준": 1,
    "해커톤": 4, "공모전": 4, "경진대회": 3, "챌린지": 2,
    "바이브코딩": 5, "AI 코딩": 5, "코딩": 3, "개발자": 3, "개발팀": 1,
    "에이전트": 3, "agent": 3, "LLM": 2, "프롬프트": 3,
    "AI": 2, "인공지능": 2, "생성형": 1,
    "클로드": 2, "Claude": 2, "챗GPT": 2, "ChatGPT": 2, "제미나이": 2, "Gemini": 2,
    "코파일럿": 2, "Copilot": 2, "커서": 1, "Cursor": 1,
    "hiring": 4, "interview": 4, "hackathon": 4, "coding": 3, "developer": 2,
}
# 제목에 이 말이 있으면 AI 맥락이 아니어도 버린다 (연예·스포츠·사고·광고 기사)
BLOCK = ("연예", "아이돌", "드라마 시청률", "프로야구", "축구 국가대표", "부고", "인사말",
         "자격증반", "수강생", "학원", "무료 강의", "시상", "수상 소감", "모집 공고문",
         "The latest AI news we announced")

# tag 분류 — 표시 배지와 색이 여기에 걸린다 (News.jsx 는 '국내'만 회색, 정책 단어는 노랑, 나머지 통계색)
POLICY_WORDS = ("정책", "규제", "법", "금지", "허용", "면접", "채용", "전형", "과제", "평가")
STAT_WORDS = ("조사", "통계", "설문", "비율", "%", "집계")


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=25) as resp:
        return resp.read()


def strip_tags(text):
    text = re.sub(r"<[^>]+>", " ", text or "")
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def parse_rss(raw):
    """RSS 2.0 / Atom 둘 다 — title, link, date, summary 만 뽑는다."""
    root = ET.fromstring(raw)
    out = []
    for it in root.iter():
        if it.tag not in ("item", "entry"):
            continue
        title = it.findtext("title") or it.findtext(ATOM + "title") or ""
        link = it.findtext("link") or ""
        if not link:
            for ln in it.findall(ATOM + "link"):
                if ln.get("rel") in (None, "alternate"):
                    link = ln.get("href") or ""
                    break
        date = (it.findtext("pubDate") or it.findtext(ATOM + "updated")
                or it.findtext(ATOM + "published") or it.findtext("{http://purl.org/dc/elements/1.1/}date") or "")
        summary = (it.findtext("description") or it.findtext(ATOM + "summary")
                   or it.findtext(ATOM + "content") or "")
        out.append({"title": strip_tags(title), "link": link.strip(),
                    "date": parse_date(date), "summary": strip_tags(summary)})
    return out


def parse_hn(raw):
    data = json.loads(raw)
    out = []
    for hit in data.get("hits", []):
        title = strip_tags(hit.get("title") or "")
        if not title:
            continue
        link = hit.get("url") or ("https://news.ycombinator.com/item?id=%s" % hit.get("objectID", ""))
        out.append({"title": title, "link": link,
                    "date": parse_date(hit.get("created_at") or ""), "summary": ""})
    return out


def parse_date(text):
    text = (text or "").strip()
    if not text:
        return None
    try:
        return parsedate_to_datetime(text).astimezone(KST)
    except (TypeError, ValueError):
        pass
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).astimezone(KST)
    except ValueError:
        return None


def split_source(title, label):
    """'헤드라인 - 머니투데이' → (헤드라인, 머니투데이). 언론사 꼬리가 없으면 라벨을 쓴다.

    구글 뉴스는 같은 꼬리를 두 번 붙이기도 해서, 붙은 꼬리는 모두 떼어낸다.
    """
    head, publisher = title.strip(), label
    while True:
        m = re.match(r"^(?P<head>.+?)\s+-\s+(?P<src>[^-]{2,24})$", head)
        if not m or len(m.group("head")) < 12:
            break
        head, publisher = m.group("head").strip(), m.group("src").strip()
    return head, publisher


def keyword_score(text):
    low = text.lower()
    score = 0
    for word, weight in KEYWORDS.items():
        if word.lower() in low:
            score += weight
    return score


def topic_of(text):
    """제목에서 기사 성격을 한 마디로 — 회사명이 있으면 회사명을 앞세운다."""
    for brand in ("OpenAI", "앤트로픽", "Anthropic", "구글", "Google", "메타", "Meta",
                  "마이크로소프트", "Microsoft", "엔비디아", "NVIDIA", "네이버", "카카오",
                  "LG유플러스", "삼성", "SK", "토스", "당근", "쿠팡", "배달의민족"):
        if brand.lower() in text.lower():
            return brand
    for theme, label in (("바이브코딩", "바이브코딩"), ("AI 코딩", "AI 코딩 도구"),
                         ("해커톤", "AI 해커톤"), ("공모전", "AI 공모전"),
                         ("경진대회", "AI 경진대회"), ("면접", "AI 면접"),
                         ("채용", "AI 채용"), ("과제", "AI 과제 전형"),
                         ("이직", "개발자 이직"), ("에이전트", "AI 에이전트")):
        if theme.lower() in text.lower():
            return label
    return "AI 업계 동향"


def tag_of(text):
    if any(w in text for w in STAT_WORDS):
        return "통계"
    if any(w in text for w in POLICY_WORDS):
        return "정책"
    return "업계"


def keep(title, summary, localized, min_score):
    if any(bad in title for bad in BLOCK):
        return False
    score = keyword_score(title + " " + summary[:200])
    if score < min_score:
        return False
    if localized:
        return True
    # 해외 기사는 AI 얘기가 제목에 있어야 한다 (개발 일반 기사로 탭을 채우지 않는다)
    return "ai" in title.lower()


STOPWORDS = ("그", "이", "저", "것", "수", "등", "및", "위해", "대한", "하는", "했다", "있다", "없다",
             "AI", "ai", "기자", "오늘", "내년", "관련", "기업", "시장", "국내")


def title_tokens(title):
    """같은 사건을 여러 언론사가 쓴 기사를 묶기 위한 낱말 집합."""
    words = re.findall(r"[0-9A-Za-z가-힣]{2,}", title)
    return {w for w in words if w not in STOPWORDS}


def near_duplicate(tokens, accepted):
    """낱말이 절반 이상 겹치면 같은 사건으로 본다 (예: LG유플러스 AI 코딩 비용 90% 절감)."""
    for other in accepted:
        if not tokens or not other:
            continue
        inter = len(tokens & other)
        if inter / min(len(tokens), len(other)) >= 0.5:
            return True
    return False


def collect(limit, today):
    """소스별 상한(quota) 안에서 점수·최신순으로 고르고, 같은 사건 중복을 걷어낸다."""
    rows = []
    failures = []
    accepted_tokens = []
    used_topic = {}
    for src in SOURCES:
        try:
            raw = fetch(src["url"])
            items = parse_hn(raw) if src["kind"] == "json" else parse_rss(raw)
        except Exception as exc:                      # 소스 하나가 죽어도 나머지로 간다
            failures.append("%s: %s" % (src["id"], str(exc)[:80]))
            continue
        picked = 0
        candidates = []
        for it in items:
            when = it["date"]
            if not when:
                continue
            age = (today - when).days
            if age > MAX_AGE_DAYS or age < 0:
                continue
            head, publisher = split_source(it["title"], src["label"])
            if len(head) < 12:
                continue
            if not keep(head, it["summary"], src.get("localized", False), src.get("min_score", 4)):
                continue
            text = head + " " + it["summary"][:200]
            candidates.append({
                "head": head,
                "body": it["summary"],
                "publisher": publisher,
                "date": when,
                "score": keyword_score(text) + max(0, 7 - age) * 0.6,
                "topic": topic_of(text),
                "tag": tag_of(text),
                "link": it["link"],
                "localized": src.get("localized", False),
                "tokens": title_tokens(head),
            })
        candidates.sort(key=lambda r: r["score"], reverse=True)
        for cand in candidates:
            if picked >= src.get("quota", 3):
                break
            if near_duplicate(cand["tokens"], accepted_tokens):
                continue
            # 같은 회사·주제 기사가 사흘 안에 또 나오면 한 건만 남긴다 (같은 행사를 여러 언론사가 쓴 경우)
            key = cand["topic"]
            if key in used_topic and abs((cand["date"] - used_topic[key]).days) <= 2:
                continue
            used_topic[key] = cand["date"]
            accepted_tokens.append(cand["tokens"])
            rows.append(cand)
            picked += 1
    rows.sort(key=lambda r: (r["date"], r["score"]), reverse=True)
    return rows[:limit], failures


def build(limit, today):
    picked, failures = collect(limit, today)
    existing = json.loads(NEWS_PATH.read_text(encoding="utf-8")) if NEWS_PATH.exists() else []
    curated = [n for n in existing if not str(n.get("id", "")).startswith(FRESH_PREFIX)]
    fresh = []
    for idx, r in enumerate(picked, start=1):
        content = r["head"]
        # 한글 요약이 있을 때만 붙인다 — 영어 피드 본문을 붙이면 제목이 반쯤 영어가 된다
        if r["localized"] and r["body"] and len(r["body"]) > len(content) + 20 and re.search("[가-힣]", r["body"]):
            content = r["head"] + " | " + r["body"][:110]
        fresh.append({
            "id": "%s%02d" % (FRESH_PREFIX, idx),
            "topic": r["topic"],
            "tag": r["tag"],
            "content": content[:180],
            "date": r["date"].strftime("%Y-%m-%d"),
            "source": r["publisher"],
            "url": r["link"],
        })
    return fresh + curated, fresh, failures


def main(argv=None):
    ap = argparse.ArgumentParser(description="트렌드 뉴스 수집 → data/news.json")
    ap.add_argument("--limit", type=int, default=14, help="새로 싣는 기사 수 (기본 14)")
    ap.add_argument("--dry-run", action="store_true", help="파일을 쓰지 않고 결과만 본다")
    args = ap.parse_args(argv)

    today = datetime.now(KST)
    news, fresh, failures = build(args.limit, today)
    for f in failures:
        print("[news] 소스 실패 %s" % f)
    print("[news] 새 항목 %d건 · 큐레이션 유지 %d건 · 합계 %d건"
          % (len(fresh), len(news) - len(fresh), len(news)))
    for n in fresh:
        print("  %s [%s] %s | %s" % (n["date"], n["tag"], n["topic"], n["content"][:70]))

    if args.dry_run:
        return 0
    if not fresh:
        print("[news] 새 항목이 0건이라 파일을 쓰지 않는다 (피드 응답 확인 필요)")
        return 1

    NEWS_PATH.write_text(json.dumps(news, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    meta = json.loads(META_PATH.read_text(encoding="utf-8"))
    meta.setdefault("counts", {})["news"] = len(news)
    META_PATH.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("[news] 저장 완료: data/news.json (%d건) · meta.counts.news=%d" % (len(news), len(news)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
