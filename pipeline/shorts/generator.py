#!/usr/bin/env python3
"""
generator.py — assignment-map 공고 기반 쇼츠 자동 생성 파이프라인

소재 트랙은 두 가지다.
  - event   : data/events.json   (해커톤·공모전)
  - posting : data/postings.json (기업 채용 과제 전형)

사용법:
  python3 pipeline/shorts/generator.py [--count 3] [--date 2026-11-12]
                                       [--track mixed|posting|event] [--dry-run]
  python3 pipeline/shorts/generator.py --prune-only
"""

import sys
import os
import re
import json
from datetime import datetime, timezone, timedelta

KST = timezone(timedelta(hours=9))

SITE_URL = "https://developjik.github.io/assignment-map/"

# 28초 압축 템플릿: ko-KR-InJoonNeural rate=+10% 기준 초당 약 5.2자
SCRIPT_MIN = 130
SCRIPT_TARGET = 138
SCRIPT_MAX = 145
CHARS_PER_SEC = 5.2
TEMPLATE_ID = "28s-v1"

POSTING_ALLOWED_STATUS = {"open", "active", "rolling", "hiring"}

POSITION_KO = {
    "frontend": "프론트엔드",
    "fullstack": "풀스택",
    "backend": "백엔드",
    "ai": "AI",
    "data": "데이터",
    "devops": "DevOps",
    "security": "보안",
    "mobile": "모바일",
    "qa": "QA",
    "design": "디자인",
    "pm": "PM",
    "planning": "기획",
    "etc": "개발",
}

ASSIGNMENT_KO = {
    "pre_assignment": "사전 과제",
    "assignment": "과제 전형",
    "coding_test": "코딩테스트",
    "take_home": "과제 전형",
    "live_coding": "라이브 코딩",
    "unknown": "자체 과제",
}

AI_POLICY_KO = {
    "required": "필수",
    "allowed_graded": "허용, 채점에도 반영",
    "allowed": "허용",
    "unspecified": "공고에 명시 없음",
    "restricted": "제한",
}


# --------------------------------------------------------------------------
# 인자 파싱
# --------------------------------------------------------------------------

def parse_args():
    args = sys.argv[1:]
    opts = {
        "count": 4,
        "date": datetime.now(KST).strftime("%Y-%m-%d"),
        "track": "mixed",
        "dry_run": False,
        "prune_only": False,
        "pick": None,
    }
    i = 0
    while i < len(args):
        a = args[i]
        if a == "--count" and i + 1 < len(args):
            opts["count"] = int(args[i + 1])
            i += 1
        elif a == "--date" and i + 1 < len(args):
            opts["date"] = args[i + 1]
            i += 1
        elif a == "--track" and i + 1 < len(args):
            track = args[i + 1].strip().lower()
            if track not in ("mixed", "posting", "event"):
                print(f"[Shorts Generator] 알 수 없는 --track 값: {track} (mixed|posting|event)")
                sys.exit(2)
            opts["track"] = track
            i += 1
        elif a == "--dry-run":
            opts["dry_run"] = True
        elif a == "--prune-only":
            opts["prune_only"] = True
        elif a == "--pick" and i + 1 < len(args):
            opts["pick"] = args[i + 1].strip()
            i += 1
        else:
            print(f"[Shorts Generator] 무시한 인자: {a}")
        i += 1
    return opts


# --------------------------------------------------------------------------
# 날짜 / 점수
# --------------------------------------------------------------------------

def get_days_remaining(today_str, deadline_str):
    if not deadline_str:
        return 999
    try:
        t = datetime.strptime(today_str, "%Y-%m-%d")
        d = datetime.strptime(str(deadline_str), "%Y-%m-%d")
        return (d - t).days
    except Exception:
        return 999


def is_live(record, today_str):
    """지금 렌더링·생성해도 되는 소재인가.

    status 가 closed 이거나 마감일이 지났으면 False. 마감일이 없는 상시 채용은 True.
    대본에 박히는 days_left 는 만든 날의 값이라 며칠 뒤에는 거짓이 된다 — 판단은 마감일로만 한다.
    """
    if record.get("status") == "closed":
        return False
    deadline = record.get("deadline") or record.get("submit_deadline") or record.get("apply_deadline")
    if not deadline:
        return True
    return get_days_remaining(today_str, deadline) >= 0


def record_deadline(record):
    return record.get("deadline") or record.get("submit_deadline") or record.get("apply_deadline")


def score_event(event, today_str):
    # upcoming(접수 예정)도 곧 후보가 되므로 같은 공식으로 점수화한다.
    if event.get("status") not in ("open", "upcoming"):
        return -999
    deadline = event.get("submit_deadline") or event.get("apply_deadline")
    days = get_days_remaining(today_str, deadline)
    if not deadline:
        days = 999
    if days < 0:
        return -999  # 이미 마감됨

    score = 0

    # 1. 마감 임박도
    if days <= 3:
        score += 120
    elif days <= 7:
        score += 90
    elif days <= 14:
        score += 60
    elif days <= 30:
        score += 30

    # 2. 채용 연계 / 혜택
    if event.get("hiring_link"):
        score += 50

    # 3. AI 정책
    ai_policy = event.get("ai_usage")
    if ai_policy == "required":
        score += 40
    elif ai_policy == "allowed":
        score += 20

    # 4. 상금 규모
    prize = event.get("prize") or ""
    if "억" in prize:
        score += 50
    elif any(k in prize for k in ["5천", "3천", "2천"]):
        score += 40
    elif any(k in prize for k in ["천만", "$"]):
        score += 30
    elif "백만" in prize:
        score += 15

    return score


def score_posting(posting, today_str):
    """기업 채용 과제(postings.json) 점수.

    status가 closed/미지원 값이면 0점(후보 제외), 마감이 지난 공고도 0점.
    """
    status = posting.get("status")
    if status == "closed":
        return 0
    if status is not None and status not in POSTING_ALLOWED_STATUS:
        return 0

    days = get_days_remaining(today_str, posting.get("deadline"))
    if posting.get("deadline") and days < 0:
        return 0

    score = 0

    # 1. AI 정책 가중치 (AI를 요구하는 전형일수록 소재 가치가 크다)
    ai_policy = posting.get("ai_policy")
    if ai_policy == "required":
        score += 100
    elif ai_policy == "allowed_graded":
        score += 70
    elif ai_policy == "allowed":
        score += 50
    else:  # unspecified / restricted / None
        score += 10

    # 2. 직무 가중치 (프론트엔드 = 인권 님의 주 포지셔닝)
    positions = posting.get("positions") or []
    if isinstance(positions, str):
        positions = [positions]
    positions = [str(p).lower() for p in positions]
    if "frontend" in positions:
        score += 40
    elif "fullstack" in positions or "ai" in positions:
        score += 30
    else:
        score += 10

    # 3. 마감일 가중치
    if not posting.get("deadline"):
        score += 20  # 상시 채용
    elif days <= 7:
        score += 50
    elif days <= 14:
        score += 30
    elif days <= 30:
        score += 15

    # 4. 증빙/구체적 프로세스
    evidence = posting.get("evidence") or []
    process_raw = (posting.get("process_raw") or "").strip()
    if evidence or len(process_raw) >= 10:
        score += 20

    return score


# --------------------------------------------------------------------------
# 텍스트 유틸
# --------------------------------------------------------------------------

def clean_fragment(text):
    """공고 원문 조각을 TTS로 읽을 수 있는 문장 조각으로 다듬는다."""
    if text is None:
        return ""
    t = str(text)
    t = re.sub(r"GI_Read[_A-Za-z0-9]*", " ", t)
    t = re.sub(r"본문\s*\(\s*\d{4}[-.\s]*\d{1,2}[-.\s]*\d{1,2}\s*\)\s*:?", " ", t)
    t = re.sub(r"\(\s*\d{4}[-.\s]*\d{1,2}[-.\s]*\d{1,2}\s*\)", " ", t)
    for arrow in ("→", "＞", "->", ">", "—", "–"):
        t = t.replace(arrow, ", ")
    t = t.replace("ㆍ", ", ").replace("·", " ").replace("+", " ")
    t = re.sub(r"\[[^\]]{1,16}\]", " ", t)
    t = re.sub(r"['\"“”‘’]", " ", t)
    t = re.sub(r"\s*:\s*", ", ", t)
    # 천단위 쉼표는 보존하고 문장 쉼표만 정리한다
    t = re.sub(r"(?<=\d),(?=\d)", "\x00", t)
    t = re.sub(r"\s*,\s*", ", ", t)
    t = t.replace("\x00", ",")
    t = re.sub(r"\s+", " ", t).strip(" ,.-–—/")
    t = re.sub(r"(입니다|합니다|입니다\.)$", "", t).strip(" ,.-–—/")
    return t


def trim_kr(text, limit):
    """글자 수 제한에 맞춰 자른다. 문장 → 절(쉼표) → 어절 순으로 끊고,
    어절 끝에 남은 조사만 잘려 있으면 그 조사도 덜어낸다."""
    text = (text or "").strip()
    if not text:
        return ""
    if limit is None or len(text) <= limit:
        return text
    if limit <= 0:
        return ""
    cut = text[:limit]
    # 괄호가 열린 채로 잘리면 괄호 앞에서 끊는다
    if cut.count("(") > cut.count(")"):
        cut = cut[: cut.rfind("(")]
    for sep in (", ", " ", ""):
        if not sep:
            break
        if sep in cut:
            head = cut.rsplit(sep, 1)[0]
            if len(head) >= max(6, limit // 2):
                cut = head
                break
    cut = re.sub(r"\s*,\s*$", "", cut.rstrip(" ,.-–—/"))
    # 잘린 어절 끝에 매달린 조사 제거
    dangling = ("가", "이", "은", "는", "을", "를", "의", "에", "로", "와", "과", "도", "만",
                "고", "서", "각", "건", "분")
    for suffix in dangling:
        if cut.endswith(suffix) and len(cut) - len(suffix) >= max(6, limit // 2):
            cut = cut[: -len(suffix)].rstrip(" ,")
            break
    return cut


def fixed_piece(text):
    """자를 수 없는 고정 문장 조각."""
    return {"prefix": "", "source": text or "", "suffix": "",
            "cap": len(text or ""), "min_cap": len(text or ""),
            "optional": False, "rank": 0}


def grow_piece(prefix, source, suffix, min_cap=0, optional=True, rank=5, start_full=False):
    """예산(budget)에 따라 길어지거나 짧아지는 조각.

    start_full이면 원문 전체 길이에서 출발해 줄여 나가고, 아니면 min_cap에서 출발해 늘린다.
    optional이면 cap=0일 때 조각 자체가 사라진다.
    rank가 작을수록 중요하다: 마지막에 깎이고 먼저 채워진다.
    """
    source = clean_fragment(source)
    if not source:
        return None
    cap = len(source) if start_full else min(min_cap, len(source))
    return {"prefix": prefix, "source": source, "suffix": suffix,
            "cap": cap, "min_cap": min(min_cap, len(source)),
            "optional": optional, "rank": rank}


def whole_piece(prefix, source, suffix, optional=False, rank=2):
    """문장 단위로만 들어가거나 빠지는 조각(중간에 잘리지 않는다)."""
    source = clean_fragment(source)
    if not source:
        return None
    cap = len(source)
    return {"prefix": prefix, "source": source, "suffix": suffix,
            "cap": cap, "min_cap": cap, "optional": optional, "rank": rank, "whole": True}


def piece_text(p):
    if p is None:
        return ""
    if p.get("whole") and p["cap"] < len(p["source"]):
        return ""
    if p["optional"] and p["cap"] <= 0:
        return ""
    return p["prefix"] + trim_kr(p["source"], p["cap"]) + p["suffix"]


def scene_text(pieces):
    return " ".join(t for t in (piece_text(p) for p in pieces) if t)


def full_text(scenes):
    return " ".join(t for t in (scene_text(s) for s in scenes) if t)


def fit_scenes(scenes, extras=(), lo=SCRIPT_MIN, hi=SCRIPT_MAX, target=SCRIPT_TARGET):
    """장면별 조각 예산을 조절해 전체 대본을 130~145자(목표 138자)에 맞춘다."""
    flat = [p for s in scenes for p in s if p is not None]
    extras = [e for e in extras if e is not None]

    def total():
        return len(full_text(scenes))

    # 1) 너무 길면 중요도가 낮은 조각부터 줄인다 (whole 조각은 통째로 뺀다)
    guard = 0
    while total() > hi and guard < 4000:
        guard += 1
        reducible = [p for p in flat
                     if (p["optional"] and p.get("whole") and p["cap"] > 0)
                     or (not p.get("whole") and p["cap"] > p["min_cap"])]
        if not reducible:
            break
        biggest = max(reducible, key=lambda p: (p["rank"], p["cap"] - p["min_cap"]))
        if biggest.get("whole"):
            biggest["cap"] = 0
        else:
            biggest["cap"] -= 1

    # 2) 짧으면 중요한 조각부터, 예산 안에 들 때만 채운다
    guard = 0
    while total() < lo and guard < 5000:
        guard += 1
        acted = False
        candidates = sorted([q for q in flat if q["cap"] < len(q["source"]) and not q.get("blocked")],
                            key=lambda q: (q["rank"], q["cap"] > 0, -(len(q["source"]) - q["cap"])))
        for p in candidates:
            old = p["cap"]
            p["cap"] = len(p["source"]) if p.get("whole") else old + 1
            if total() <= hi:
                acted = True
                break
            p["cap"] = old
            p["blocked"] = True
        if acted:
            continue
        if extras:
            placed = False
            while extras:
                extra = extras.pop(0)
                scenes[-1].append(extra)
                flat.append(extra)
                if total() <= hi:
                    placed = True
                    break
                scenes[-1].remove(extra)
                flat.remove(extra)
            if placed:
                continue
        break

    return total()


def position_label(posting):
    positions = posting.get("positions") or []
    if isinstance(positions, str):
        positions = [positions]
    positions = [str(p).lower() for p in positions]
    # 공고에 먼저 적힌 직무를 그대로 부른다
    for p in positions:
        if p in POSITION_KO:
            return POSITION_KO[p]
    for key in ("frontend", "fullstack", "ai", "backend", "security", "devops",
                "data", "mobile", "qa", "design", "pm", "planning", "etc"):
        if key in positions:
            return POSITION_KO.get(key, "개발")
    raw = clean_fragment(posting.get("positions_raw"))
    return trim_kr(raw, 8) if raw else "개발"


def deadline_phrase(deadline, days, with_word=True):
    if not deadline:
        return "상시 채용"
    try:
        d = datetime.strptime(str(deadline), "%Y-%m-%d")
    except Exception:
        return trim_kr(str(deadline), 14)
    day_part = f"{d.month}월 {d.day}일"
    if days in (999, None) or days < 0:
        return f"{day_part} 마감" if with_word else day_part
    if days == 0:
        return f"{day_part} 오늘 마감" if with_word else f"{day_part} 오늘"
    dd = f"D-{days}"
    return f"{day_part} 마감, {dd}" if with_word else f"{day_part}, {dd}"


def prize_phrase(prize, short=False):
    text = clean_fragment(prize)
    if not text:
        return "미공개"
    text = re.sub(r"^총\s*상금\s*", "", text).strip()
    text = re.sub(r"^총\s*", "", text).strip()
    text = re.sub(r"\$(\d[\d,.]*)", r"\1달러", text)
    if short:
        for sep in ("(", "~", "부터"):
            if sep in text:
                head = text.split(sep, 1)[0].strip(" ,")
                if len(head) >= 4:
                    text = head
                    break
        text = trim_kr(text, 14)
    return text


def short_company(name):
    """후킹에서 부르기 좋게 회사명을 짧게. 괄호 안 영문/약칭은 뺀다."""
    text = clean_fragment(name)
    stripped = re.sub(r"\s*\([^)]*\)\s*", "", text).strip()
    if len(stripped) >= 2:
        return stripped
    return text or "한 기업"


def pick_evidence_quote(record, prefer=("ai", "assignment")):
    """근거 인용문 중 AI 정책/전형 설명에 가장 가까운 것을 고른다."""
    evs = record.get("evidence") or []
    quotes = []
    for ev in evs:
        if isinstance(ev, dict):
            q = ev.get("quote")
            field = str(ev.get("field") or "").lower()
        else:
            q, field = ev, ""
        q = clean_fragment(q)
        if len(q) < 10:
            continue
        quotes.append((field, q))
    if not quotes:
        return ""
    for key in prefer:
        for field, q in quotes:
            if key in field:
                return q
    for field, q in quotes:
        if "AI" in q:
            return q
    return quotes[0][1]


def dday_label(days):
    if days in (999, None):
        return "상시 모집"
    if days == 0:
        return "오늘 마감!"
    return f"D-{days}!"


# --------------------------------------------------------------------------
# 28초 3단 템플릿 — 채용 과제(posting)
# --------------------------------------------------------------------------

def posting_scenes(posting, days, today_str):
    company = short_company(posting.get("company")) or "한 기업"
    pos = position_label(posting)
    assignment_label = ASSIGNMENT_KO.get(posting.get("assignment_type") or "unknown", "자체 과제")
    policy_label = AI_POLICY_KO.get(posting.get("ai_policy") or "unspecified", "공고에 명시 없음")
    deadline_txt = deadline_phrase(posting.get("deadline"), days)

    process_detail = clean_fragment(posting.get("process_raw"))
    if len(process_detail) < 8:
        # 원문에 전형 설명이 없으면 과제 유형만 짧게 부른다 (긴 인용문을 잘라 쓰면 문장이 깨진다)
        process_detail = ""
    policy_detail = pick_evidence_quote(posting, prefer=("ai", "assignment+ai"))

    # Scene 1 (00~04초) 후킹
    hook = [
        fixed_piece("AI 써서 과제 내라는 기업이 있습니다. 바로 "),
        grow_piece("", company, "", min_cap=len(company), optional=False),
        grow_piece("", pos, " 전형입니다.", min_cap=len(pos), optional=False),
    ]

    # Scene 2 (04~20초) 핵심 팩트 3줄
    fact_process = grow_piece("전형은 ", process_detail, ".", min_cap=12, rank=3, start_full=True)
    if fact_process is None:
        fact_process = fixed_piece(f"전형은 {assignment_label}.")
    facts = [
        fact_process,
        fixed_piece(f"AI 활용은 {policy_label}."),
        whole_piece("평가 기준은 ", policy_detail, ".", optional=True, rank=4),
        fixed_piece(f"{pos} 직무, {deadline_txt}."),
    ]

    # Scene 3 (20~28초) CTA
    cta = [
        whole_piece("", "더 많은 기업별 AI 과제는", "", optional=True, rank=3),
        fixed_piece("프로필 링크 과제 지도에서 확인하세요."),
        whole_piece("", "회사별 전형과 마감일까지 정리해 뒀습니다", ".", optional=True, rank=5),
    ]

    scenes = [hook, facts, cta]
    extras = [fixed_piece("지원 전에 공고 원문을 꼭 확인하세요."), fixed_piece("원문 확인은 필수입니다.")]
    fit_scenes(scenes, extras)
    return scenes


def posting_visuals(posting):
    company = clean_fragment(posting.get("company")) or "채용 공고"
    return [
        # 안티-슬롭: AI 일러스트 대신 실제 공고 화면과 터미널 UI
        "9:16 screenshot of a real Korean job posting page, the line asking for an assignment "
        "highlighted in a thin accent box, company logo area blurred, no illustration, flat UI, "
        "crisp browser chrome, dark surroundings",
        "9:16 dark IDE terminal split view: left side code diff, right side three flat data cards "
        "labeled 전형, AI 기준, 마감 in Korean, monospace numerals, one accent color, no glow, "
        "no cyberpunk effects, real product UI look",
        f"9:16 dark dashboard of assignment-map.dev filtered to {company}, list rows of AI assignment "
        f"postings with D-day badges, cursor pointing at the profile link, minimal bento layout, "
        f"no neon, no 3D",
    ]


# --------------------------------------------------------------------------
# 28초 3단 템플릿 — 해커톤/공모전(event)
# --------------------------------------------------------------------------

def event_scenes(event, days, today_str):
    title = clean_fragment(event.get("title")) or "공모전"
    host = clean_fragment(event.get("host")) or "주최사"
    deadline = event.get("submit_deadline") or event.get("apply_deadline")
    deadline_txt = deadline_phrase(deadline, days, with_word=False)
    policy_label = AI_POLICY_KO.get(event.get("ai_usage") or "unspecified", "공고에 명시 없음")
    ai_detail = clean_fragment(event.get("evidence"))

    # Scene 1 (00~04초) 후킹
    prize_txt = prize_phrase(event.get("prize"), short=True)
    hook = [
        fixed_piece(dday_label(days)),
        whole_piece("상금 ", prize_txt, ".", optional=True, rank=2) if prize_txt != "미공개" else None,
        grow_piece("", title, ". 아직 안 늦었습니다.", min_cap=14, optional=False, rank=1, start_full=True),
    ]

    # Scene 2 (04~20초) 핵심 팩트 3줄
    facts = [
        fixed_piece(f"주최는 {host}, 마감은 {deadline_txt}."),
        fixed_piece(f"AI 활용은 {policy_label}."),
        whole_piece("공모 주제는 ", ai_detail, ".", optional=True, rank=5),
        whole_piece("", "채용 연계는 인턴십과 서류 우대까지 붙습니다" if event.get("hiring_link")
                   else "채용 연계는 공고상 별도 혜택이 없습니다", ".", optional=True, rank=4),
    ]

    # Scene 3 (20~28초) CTA
    cta = [
        whole_piece("", "더 많은 해커톤과 공모전 공략은", "", optional=True, rank=5),
        fixed_piece("프로필 링크 과제 지도에서 확인하세요."),
        whole_piece("", "마감과 상금, AI 정책까지 한 번에 봅니다", ".", optional=True, rank=6),
    ]

    scenes = [hook, facts, cta]
    extras = [fixed_piece("마감과 상금은 바뀔 수 있으니 원문을 확인하세요."), fixed_piece("원문 확인은 필수입니다.")]
    fit_scenes(scenes, extras)
    return scenes


def event_visuals(event):
    return [
        "9:16 screenshot of the official competition page with the prize and deadline row "
        "highlighted, flat UI, real typography, no illustration, no glow",
        "9:16 dark IDE terminal with a small AI agent workflow diagram drawn in flat lines, "
        "plus one data card listing 주최, 마감, AI 정책, monospace, single accent color",
        "9:16 dark bento dashboard of assignment-map.dev showing hackathon rows sorted by D-day, "
        "cursor on the profile link, minimal, no neon, no 3D",
    ]


# --------------------------------------------------------------------------
# 대본 조립
# --------------------------------------------------------------------------

def build_script(kind, record, days, slot, target_date, score):
    if not is_live(record, target_date):
        raise SystemExit(
            "[Shorts Generator] 마감이 지난 소재라 대본을 만들지 않습니다: %s (%s)"
            % (record.get("id"), record_deadline(record)))
    scenes = posting_scenes(record, days, target_date) if kind == "posting" else event_scenes(record, days, target_date)
    visuals = posting_visuals(record) if kind == "posting" else event_visuals(record)

    times = ["00~04초 (후킹)", "04~20초 (핵심 팩트 3줄)", "20~28초 (CTA)"]
    # 중간 장면 자막은 그 행의 실제 값으로 채운다 — 렌더러가 이 세 줄을 화면 팩트로 뽑는다.
    # 템플릿의 '전형 방식 / AI 평가 기준 / 직무·마감'이라는 빈 라벨을 화면에 띄우지 않는다.
    if kind == "posting":
        mid_sub = "\n".join([
            "전형: " + trim_kr(ASSIGNMENT_KO.get(record.get("assignment_type") or "unknown", "자체 과제"), 12),
            "AI 활용: " + trim_kr(AI_POLICY_KO.get(record.get("ai_policy") or "unspecified", "공고에 명시 없음"), 14),
            trim_kr(f"{position_label(record)} | {deadline_phrase(record.get('deadline'), days, with_word=False)}", 22),
        ])
    else:
        mid_sub = "\n".join([
            "주최: " + trim_kr(clean_fragment(record.get("host")) or "주최사", 18),
            "AI 활용: " + trim_kr(AI_POLICY_KO.get(record.get("ai_usage") or "unspecified", "공고에 명시 없음"), 14),
            trim_kr(deadline_phrase(record.get("submit_deadline") or record.get("apply_deadline"), days, with_word=False), 18),
        ])
    subtitles_posting = [
        "AI 과제 전형\n지금 열려 있습니다",
        mid_sub,
        "프로필 링크\n'과제 지도'",
    ]
    subtitles_event = [
        "마감 임박\n아직 지원 가능",
        mid_sub,
        "프로필 링크\n'과제 지도'",
    ]
    subs = subtitles_posting if kind == "posting" else subtitles_event

    scene_objs = []
    for idx, pieces in enumerate(scenes):
        scene_objs.append({
            "time": times[idx],
            "subtitle": subs[idx],
            "narration": scene_text(pieces),
            "visual_prompt": visuals[idx],
        })

    narration_all = " ".join(s["narration"] for s in scene_objs)
    char_count = len(narration_all)
    est_sec = round(char_count / CHARS_PER_SEC, 1)

    if kind == "posting":
        company = clean_fragment(record.get("company")) or "기업"
        pos = position_label(record)
        deadline_txt = deadline_phrase(record.get("deadline"), days)
        id_key = record.get("id")
        youtube_title = f"AI로 과제 내는 {company} {pos} 전형, 이렇게 뚫습니다 #shorts"
        subject_line = f"{company} {pos} 채용 과제"
        hashtags = "#개발자 #취업 #AI코딩 #채용과제 #이직"
        raw_url = record.get("url")
        extra_desc = f"- AI 활용: {AI_POLICY_KO.get(record.get('ai_policy') or 'unspecified')}\n- 마감: {deadline_txt}"
        event_title = f"{company} {pos} 채용 과제 전형"
    else:
        company = clean_fragment(record.get("host")) or "주최사"
        deadline_txt = deadline_phrase(record.get("submit_deadline") or record.get("apply_deadline"), days)
        id_key = record.get("id")
        title_txt = clean_fragment(record.get("title")) or "공모전"
        youtube_title = f"{dday_label(days)} {title_txt} 핵심 공략 #shorts #개발자 #공모전"
        subject_line = title_txt
        hashtags = "#개발자 #공모전 #해커톤 #AI코딩 #취준"
        raw_url = record.get("url")
        extra_desc = f"- 상금: {prize_phrase(record.get('prize'))}\n- 마감: {deadline_txt}"
        event_title = title_txt

    description = (
        f"{subject_line} 핵심만 28초에 정리했습니다.\n"
        f"{extra_desc}\n"
        f"- 원문: {raw_url or '과제 지도에서 확인'}\n\n"
        f"AI 과제 전형과 AI 공모전을 한눈에 보는 지도:\n{SITE_URL}\n\n{hashtags}"
    )

    return {
        "event_id": id_key,
        "type": kind,
        "track": kind,
        "template": TEMPLATE_ID,
        "duration_target_sec": 28,
        "slot_id": f"{target_date}-{slot['tag']}",
        "scheduled_at": f"{target_date}T{slot['time']}:00+09:00",
        "score": score,
        "char_count": char_count,
        "est_seconds": est_sec,
        "event_title": event_title,
        "host": company,
        "deadline": record.get("deadline") or record.get("submit_deadline") or record.get("apply_deadline"),
        "days_left": days,
        "url": raw_url,
        "narration_full": narration_all,
        "scenes": scene_objs,
        "metadata": {
            "youtube_title": youtube_title,
            "description": description,
            "pinned_comment": (
                f"마감과 AI 정책은 계속 바뀝니다. 최신 목록은 '과제 지도'에서 확인하세요 👇\n{SITE_URL}"
            ),
        },
    }


def script_markdown(kind, record, script_data, slot):
    scenes_table = "\n".join([
        f"| **{s['time']}** | {s['subtitle'].replace(chr(10), '<br>')} | \"{s['narration']}\" | `{s['visual_prompt']}` |"
        for s in script_data["scenes"]
    ])
    label = "기업 채용 과제" if kind == "posting" else "해커톤·공모전"

    if kind == "posting":
        evidence = pick_evidence_quote(record, prefer=("ai", "assignment"))
        origin = [
            f"- **회사/직무**: {clean_fragment(record.get('company'))} / {position_label(record)}",
            f"- **공고명**: {clean_fragment(record.get('title')) or '없음'}",
            f"- **전형 방식**: {clean_fragment(record.get('process_raw')) or ASSIGNMENT_KO.get(record.get('assignment_type') or 'unknown')}",
            f"- **AI 정책**: {record.get('ai_policy')} ({clean_fragment(record.get('policy_raw')) or '공고 원문 참조'})",
            f"- **마감**: {script_data['deadline'] or '상시 채용'}",
            f"- **근거 인용**: {evidence or '없음'}",
        ]
    else:
        origin = [
            f"- **주최**: {clean_fragment(record.get('host'))}",
            f"- **상금/혜택**: {prize_phrase(record.get('prize'))}",
            f"- **AI 정책**: {record.get('ai_usage')}",
            f"- **마감**: {script_data['deadline'] or '미정'}",
            f"- **근거**: {clean_fragment(record.get('evidence')) or '없음'}",
        ]

    return f"""# 🎬 [쇼츠 자동생성] {script_data['event_title']}

- **트랙**: {label} (`{kind}`) · 템플릿 `{TEMPLATE_ID}` (28초)
- **슬롯**: {slot['name']} ({script_data['scheduled_at']})
- **선별 점수**: {script_data['score']}점
- **내레이션 길이**: {script_data['char_count']}자 · 예상 {script_data['est_seconds']}초
- **원문 공고**: {script_data['url'] or '없음'}

---

## 1. 스토리보드 타임라인 (28초)

| 시간 | 화면 자막 | 내레이션 (TTS 음성) | 비주얼 연출 프롬프트 |
|---|---|---|---|
{scenes_table}

**전체 내레이션 ({script_data['char_count']}자)**

> {script_data['narration_full']}

---

## 2. 소재 원문

{chr(10).join(origin)}

---

## 3. 유튜브 발행 메타데이터

### 제목
{script_data['metadata']['youtube_title']}

### 설명
{script_data['metadata']['description']}

### 고정 댓글
{script_data['metadata']['pinned_comment']}
"""


# --------------------------------------------------------------------------
# 큐 정리
# --------------------------------------------------------------------------

def prune_stale(manifest, today_str):
    """마감이 지난 queued 항목을 expired로 내린다 (큐가 죽은 소재로 차지 않게)."""
    expired = []
    for item in manifest.get("items", []):
        if item.get("status") != "queued":
            continue
        days = get_days_remaining(today_str, item.get("deadline"))
        if days < 0:
            item["status"] = "expired"
            item["expired_at"] = today_str
            item["expired_reason"] = "마감 경과 (D%+d)" % days
            expired.append(item.get("id"))
    if expired:
        manifest["stats"]["queued"] = len([i for i in manifest["items"] if i.get("status") == "queued"])
        manifest["stats"]["published"] = len([i for i in manifest["items"] if i.get("status") == "published"])
        manifest["stats"]["expired"] = len([i for i in manifest["items"] if i.get("status") == "expired"])
    return expired


# --------------------------------------------------------------------------
# 후보 선별
# --------------------------------------------------------------------------

def select_candidates(candidates, count, track):
    posting = sorted([c for c in candidates if c["kind"] == "posting"],
                     key=lambda x: x["score"], reverse=True)
    event = sorted([c for c in candidates if c["kind"] == "event"],
                   key=lambda x: x["score"], reverse=True)

    if track == "posting":
        return posting[:count]
    if track == "event":
        return event[:count]

    # mixed: 두 풀에서 반씩, 홀수 몫은 상위 점수가 높은 트랙에 준다
    if not posting:
        return event[:count]
    if not event:
        return posting[:count]

    n_posting = count // 2
    n_event = count - n_posting
    if count % 2 == 1:
        # 홀수 몫은 상위 점수가 더 높은 트랙에 준다
        if event[0]["score"] > posting[0]["score"]:
            n_posting, n_event = count // 2, count - count // 2
        else:
            n_posting, n_event = count - count // 2, count // 2

    picked = posting[:n_posting] + event[:n_event]
    # 한쪽 풀이 모자라면 남은 후보로 채운다
    if len(picked) < count:
        taken = {id(c) for c in picked}
        rest = sorted([c for c in posting + event if id(c) not in taken],
                      key=lambda x: x["score"], reverse=True)
        picked += rest[: count - len(picked)]

    picked.sort(key=lambda x: x["score"], reverse=True)
    return picked


def main():
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
    events_path = os.path.join(repo_root, "data/events.json")
    postings_path = os.path.join(repo_root, "data/postings.json")
    manifest_path = os.path.join(repo_root, "pipeline/shorts/manifest.json")
    output_dir = os.path.join(repo_root, "pipeline/shorts/output")

    os.makedirs(output_dir, exist_ok=True)

    opts = parse_args()
    count = opts["count"]
    target_date = opts["date"]
    track = opts["track"]
    dry_run = opts["dry_run"]

    events = []
    postings = []
    if track in ("event", "mixed"):
        with open(events_path, "r", encoding="utf-8") as f:
            events = json.load(f)
    if track in ("posting", "mixed"):
        if os.path.exists(postings_path):
            with open(postings_path, "r", encoding="utf-8") as f:
                postings = json.load(f)
        else:
            print("[Shorts Generator] data/postings.json 이 없습니다 — event 트랙만 사용합니다.")

    if os.path.exists(manifest_path):
        with open(manifest_path, "r", encoding="utf-8") as f:
            manifest = json.load(f)
    else:
        manifest = {
            "version": "1.0.0",
            "updated_at": datetime.now(KST).isoformat(),
            "stats": {"total_generated": 0, "published": 0, "queued": 0},
            "items": [],
        }

    expired = prune_stale(manifest, target_date)
    if expired:
        print(f"[Shorts Generator] 마감 지난 queued {len(expired)}건을 expired로 정리: {', '.join(expired)}")

    if opts["prune_only"]:
        if not dry_run:
            manifest["updated_at"] = datetime.now(KST).isoformat()
            with open(manifest_path, "w", encoding="utf-8") as f:
                json.dump(manifest, f, ensure_ascii=False, indent=2)
            print("[Shorts Generator] manifest 저장 완료 (생성 없음)")
        return

    existing_ids = {item["id"] for item in manifest.get("items", [])}

    candidates = []
    for p in postings:
        if p.get("id") in existing_ids:
            continue
        sc = score_posting(p, target_date)
        if sc > 0:
            candidates.append({
                "kind": "posting",
                "record": p,
                "score": sc,
                "days": get_days_remaining(target_date, p.get("deadline")) if p.get("deadline") else 999,
            })
    for e in events:
        if e.get("id") in existing_ids:
            continue
        sc = score_event(e, target_date)
        if sc > 0:
            deadline = e.get("submit_deadline") or e.get("apply_deadline")
            candidates.append({
                "kind": "event",
                "record": e,
                "score": sc,
                "days": get_days_remaining(target_date, deadline) if deadline else 999,
            })

    n_posting = len([c for c in candidates if c["kind"] == "posting"])
    n_event = len([c for c in candidates if c["kind"] == "event"])
    print(f"[Shorts Generator] 트랙={track} · 후보 posting {n_posting}건 / event {n_event}건 "
          f"· 오늘 생성 목표: {count}편 (기준일: {target_date})")

    # --pick ID: 점수 최상위 대신 지정한 소재 하나만 만든다 (마감·상태 검증은 그대로)
    if opts.get("pick"):
        wanted = opts["pick"]
        picked = [c for c in candidates if c["record"].get("id") == wanted]
        if not picked:
            raise SystemExit(
                "[Shorts Generator] --pick %s 는 지금 만들 수 없는 소재입니다 "
                "(이미 생성됐거나, 마감이 지났거나, status 가 closed). 데이터에서 id 와 마감일을 확인하세요." % wanted)
        candidates = picked
        count = 1
        print(f"[Shorts Generator] --pick 으로 1건만 생성: {wanted}")

    selected = select_candidates(candidates, count, track)

    slots = [
        {"name": "점심 (휴식)", "time": "12:30", "tag": "lunch"},
        {"name": "오후 (티타임)", "time": "15:30", "tag": "afternoon"},
        {"name": "퇴근 (퇴근길)", "time": "18:30", "tag": "evening"},
        {"name": "야간 (취침 전)", "time": "21:30", "tag": "night"},
    ]

    generated_items = []
    slot_use = {}

    for idx, c in enumerate(selected):
        kind = c["kind"]
        record = c["record"]
        days = c["days"]
        base_slot = slots[idx % len(slots)]
        slot_use[base_slot["tag"]] = slot_use.get(base_slot["tag"], 0) + 1
        tag = base_slot["tag"] if slot_use[base_slot["tag"]] == 1 else f"{base_slot['tag']}{slot_use[base_slot['tag']]}"
        slot = {"name": base_slot["name"], "time": base_slot["time"], "tag": tag}

        script_data = build_script(kind, record, days, slot, target_date, c["score"])
        md_content = script_markdown(kind, record, script_data, slot)

        safe_id = str(record["id"]).replace(":", "_").replace("/", "_")
        md_filename = f"{script_data['slot_id']}-{safe_id}.md"
        json_filename = f"{script_data['slot_id']}-{safe_id}.json"

        if not dry_run:
            with open(os.path.join(output_dir, md_filename), "w", encoding="utf-8") as f:
                f.write(md_content)
            with open(os.path.join(output_dir, json_filename), "w", encoding="utf-8") as f:
                json.dump(script_data, f, ensure_ascii=False, indent=2)

            manifest["items"].append({
                "id": record["id"],
                "type": kind,
                "track": kind,
                "template": TEMPLATE_ID,
                "slot": script_data["slot_id"],
                "scheduled_at": script_data["scheduled_at"],
                "title": script_data["metadata"]["youtube_title"],
                "event_title": script_data["event_title"],
                "host": script_data["host"],
                "company": clean_fragment(record.get("company")) if kind == "posting" else None,
                "deadline": script_data["deadline"],
                "prize": prize_phrase(record.get("prize")) if kind == "event" else None,
                "char_count": script_data["char_count"],
                "score": c["score"],
                "status": "queued",
                "script_path": f"pipeline/shorts/output/{md_filename}",
            })

        generated_items.append({
            "id": record["id"],
            "kind": kind,
            "title": script_data["metadata"]["youtube_title"],
            "slot": slot["name"],
            "scheduled_at": script_data["scheduled_at"],
            "chars": script_data["char_count"],
            "est_sec": script_data["est_seconds"],
            "score": c["score"],
            "file": md_filename,
        })

    if not dry_run:
        manifest["updated_at"] = datetime.now(KST).isoformat()
        manifest["stats"]["total_generated"] = len(manifest["items"])
        manifest["stats"]["queued"] = len([i for i in manifest["items"] if i.get("status") == "queued"])
        manifest["stats"]["published"] = len([i for i in manifest["items"] if i.get("status") == "published"])
        manifest["stats"]["expired"] = len([i for i in manifest["items"] if i.get("status") == "expired"])
        with open(manifest_path, "w", encoding="utf-8") as f:
            json.dump(manifest, f, ensure_ascii=False, indent=2)

    if dry_run:
        print(f"\n[드라이런] {len(generated_items)}편이 생성 대상입니다 (파일·manifest 변경 없음)")
    else:
        print(f"\n✅ 성공적으로 {len(generated_items)}편의 쇼츠 스크립트가 생성 및 큐에 등록되었습니다!")
    for item in generated_items:
        print(f"- [{item['kind']}/{item['slot']}] {item['title']} "
              f"({item['chars']}자·약 {item['est_sec']}초, {item['score']}점) -> {item['file']}")


if __name__ == "__main__":
    main()
