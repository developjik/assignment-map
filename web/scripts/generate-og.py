#!/usr/bin/env python3
"""링크드인/SNS 공유용 다크 터미널 OG 이미지(1200x630)를 만든다.

data/postings.json, data/events.json, data/meta.json을 읽어 실제 지표를 그린다.
빌드(build.mjs)에서 피드·사이트맵 뒤에 실행되어 dist/og-image.png를 갱신한다.
폰트나 Pillow가 없는 환경(예: 폰트를 설치하지 않은 CI)에서는 조용히 건너뛴다.
"""
from __future__ import annotations

import json
import os
import sys
from datetime import date, datetime, timedelta, timezone

try:
    from PIL import Image, ImageDraw, ImageFont
except Exception:  # Pillow 없음 → 빌드는 계속
    print("OG SKIP — Pillow 없음 (pip install pillow)", file=sys.stderr)
    sys.exit(0)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # web/
OUT = os.path.join(ROOT, "dist", "og-image.png")
DATA = os.path.join(os.path.dirname(ROOT), "data")

SANS_CANDIDATES = [
    "/usr/share/fonts/pickle-hwp/NotoSansCJKkr-Regular.otf",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc",
    "/System/Library/Fonts/AppleSDGothicNeo.ttc",
]
MONO_CANDIDATES = [
    "/usr/share/fonts/pickle-hwp/NotoSansMonoCJKkr-Regular.otf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
]

BG = "#0B0E14"
FRAME = "#1E232F"
RULE = "#171D28"
FG = "#E8EEF6"
FG2 = "#C9D4E3"
MUT = "#8B98AD"
DIM = "#6E7B90"
FAINT = "#4B5566"
BLUE = "#5CA8FF"
GREEN = "#34D399"
RED = "#FF5C5C"
YELLOW = "#E5C07B"
DOT_R, DOT_Y, DOT_G = "#FF5F56", "#FFBD2E", "#27C93F"

KST = timezone(timedelta(hours=9))
OPEN = {"open", "upcoming", "judging"}
SITE = "https://developjik.github.io/assignment-map/"


def load(name, default):
    try:
        with open(os.path.join(DATA, name), encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def pick(cands):
    for p in cands:
        if os.path.exists(p):
            return p
    return None


def dday(date_str, today):
    if not date_str or len(date_str) < 10:
        return None
    try:
        y, m, d = (int(x) for x in date_str[:10].split("-"))
        return (date(y, m, d) - today).days
    except Exception:
        return None


def collect(today):
    """웹(lib/data.js)과 같은 규칙으로 행을 세운다."""
    postings = load("postings.json", [])
    events = load("events.json", [])
    meta = load("meta.json", {})
    rows = []
    for p in postings:
        rows.append({
            "kind": "posting",
            "policy": p.get("ai_policy"),
            "open": p.get("status") in OPEN,
            "dd": dday(p.get("deadline"), today),
        })
    for e in events:
        raw = e.get("ai_usage")
        policy = "required" if raw == "required" else "allowed" if raw == "allowed" else raw
        if policy == "banned":  # 웹과 같이 금지 이벤트는 노출하지 않는다
            continue
        rows.append({
            "kind": "event",
            "policy": policy,
            "open": e.get("status") in OPEN,
            "dd": dday(e.get("apply_deadline") or e.get("submit_deadline"), today),
        })
    live = [r for r in rows if r["open"]]
    return {
        "total": len(rows),
        "open": len(live),
        "ai": sum(1 for r in live if r["policy"] in ("required", "allowed_graded", "allowed")),
        "d7": sum(1 for r in live if r["dd"] is not None and 0 <= r["dd"] <= 7),
        "lastRun": meta.get("last_run") or "",
    }


def build():
    today = datetime.now(KST).date()
    st = collect(today)
    sans_path, mono_path = pick(SANS_CANDIDATES), pick(MONO_CANDIDATES)
    if not sans_path:
        print("OG SKIP — 한글 폰트 없음", file=sys.stderr)
        sys.exit(0)
    mono_path = mono_path or sans_path

    def sans(size):
        return ImageFont.truetype(sans_path, size)

    def mono(size):
        return ImageFont.truetype(mono_path, size)

    W, H = 1200, 630
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)

    def text(xy, s, f, fill):
        d.text(xy, s, font=f, fill=fill)

    # ---- 창 프레임 ----
    d.rectangle((28, 28, W - 28, H - 28), outline=FRAME, width=1)
    d.rectangle((29, 29, W - 29, 92), fill="#0E121A")
    d.line((28, 92, W - 28, 92), fill=FRAME, width=1)
    for i, c in enumerate((DOT_R, DOT_Y, DOT_G)):
        cx = 58 + i * 22
        d.ellipse((cx - 6, 55, cx + 6, 67), fill=c)
    text((132, 63), "과제지도 (assignment-map) - terminal", mono(16), DIM)

    right = f"수집 {st['lastRun'] or '-'} 03:00 KST"
    fw = d.textlength(right, font=mono(15))
    text((W - 60 - fw, 63), right, mono(15), FAINT)
    d.ellipse((W - 60 - fw - 22, 58, W - 60 - fw - 12, 68), fill=GREEN)

    # ---- 헤드라인 ----
    x = 60
    f_head = sans(60)
    text((x, 124), "과제지도", f_head, FG)
    x += d.textlength("과제지도", font=f_head) + 14
    f_sub = sans(28)
    text((x, 158), "(assignment-map)", f_sub, BLUE)

    text((60, 218), "AI로 만들어 제출하는 모든 기회 | 채용 과제 | 해커톤 | 공모전", sans(23), MUT)

    # ---- 통계 박스 ----
    box_top, box_bot = 282, 424
    d.rectangle((60, box_top, W - 60, box_bot), outline=FRAME, width=1)
    cells = [
        ("추적", f"{st['total']}건", FG2, "전체 수집 기록"),
        ("진행중", f"{st['open']}건", GREEN, "지원 가능"),
        ("AI 필수/허용", f"{st['ai']}건", BLUE, "정책 확인됨"),
        ("마감 임박", f"D-7 {st['d7']}건", RED, "일주일 이내"),
    ]
    step = (W - 120) // 4
    for i, (label, value, color, note) in enumerate(cells):
        cx = 60 + i * step
        if i:
            d.line((cx, box_top, cx, box_bot), fill=RULE, width=1)
        text((cx + 22, box_top + 22), label, mono(16), DIM)
        text((cx + 22, box_top + 52), value, mono(38), color)
        text((cx + 22, box_top + 104), note, sans(14), FAINT)

    # ---- CLI 프롬프트 ----
    cy = 462
    text((60, cy), "$", mono(23), FAINT)
    cmd = "assignment-map --filter=ai-allowed --dday=asc"
    text((84, cy), cmd, mono(23), GREEN)
    cur_x = 84 + d.textlength(cmd, font=mono(23)) + 8
    d.rectangle((cur_x, cy + 2, cur_x + 11, cy + 26), fill=GREEN)

    # ---- 하단 ----
    d.line((60, 520, W - 60, 520), fill=RULE, width=1)
    text((60, 542), SITE, mono(19), BLUE)
    xw = 60 + d.textlength(SITE, font=mono(19)) + 10
    text((xw, 542), "|", mono(19), FAINT)
    text((xw + 16, 542), "운영비 ₩0 자율 에이전트 자동 수집", sans(19), DIM)
    tail = "매일 03:00 KST"
    tw = d.textlength(tail, font=mono(15))
    text((W - 60 - tw, 546), tail, mono(15), FAINT)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    img.save(OUT, "PNG", optimize=True)
    print(f"OG OK — {os.path.relpath(OUT, ROOT)} | 추적 {st['total']} 진행중 {st['open']} AI {st['ai']} D-7 {st['d7']}")


if __name__ == "__main__":
    build()
