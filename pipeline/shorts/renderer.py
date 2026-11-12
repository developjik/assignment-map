#!/usr/bin/env python3
"""
renderer.py — assignment-map 쇼츠 28초 대본 → mp4 자동 렌더러 (운영비 ₩0)

대본 JSON 하나를 받아 로컬 오픈소스만으로 세로 쇼츠(1080x1920)를 만든다.
  1) edge-tts  : 한국어 TTS mp3 (기본 ko-KR-InJoonNeural, +10~+15% 속도로 26~28초에 맞춤)
  2) Pillow    : 터미널 프레임 생성 (프롬프트 타이핑, AI 정책 배지, 핵심 팩트 3줄, CTA)
  3) ffmpeg    : raw 프레임 + mp3 → H.264/AAC mp4

외부 유료 API, AI 생성 이미지, 스톡 그래픽을 쓰지 않는다. 화면은 전부 텍스트와 규칙선이다.

사용:
  python pipeline/shorts/renderer.py --test
  python pipeline/shorts/renderer.py --latest
  python pipeline/shorts/renderer.py --script pipeline/shorts/output/2026-11-12-lunch-ko-0002.json
  python pipeline/shorts/renderer.py --script ... --voice ko-KR-SunHiNeural --out renders/a.mp4
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

# --------------------------------------------------------------------------
# 경로·상수
# --------------------------------------------------------------------------

ROOT = Path(__file__).resolve().parent
OUTPUT_DIR = ROOT / "output"
RENDER_DIR = ROOT / "renders"
SITE = "developjik.github.io/assignment-map"
KST = timezone(timedelta(hours=9))

W, H = 1080, 1920
FPS = 30
PAD_TAIL = 0.45          # 마지막 프레임을 조금 더 들고 간다
MARGIN = 72
CONTENT_W = W - 2 * MARGIN

BG = (11, 14, 20)        # #0B0E14
PANEL = (15, 19, 27)
BORDER = (26, 33, 48)    # #1A2130
BORDER2 = (18, 22, 31)
FG = (201, 212, 227)     # #C9D4E3
FG_HI = (232, 238, 246)  # #E8EEF6
MUT = (139, 152, 173)    # #8B98AD
FAINT = (102, 115, 138)  # #66738A
YELLOW = (229, 192, 123)  # #E5C07B
BLUE = (92, 168, 255)    # #5CA8FF
GREEN = (52, 211, 153)   # #34D399
RED = (255, 92, 92)      # #FF5C5C

PROMPT = "$ assignment-map run --shorts"
TYPE_STEP = 0.055        # 글자당 타이핑 간격(초)
TYPE_DUR = TYPE_STEP * len(PROMPT)
REVEAL = (0.10, 0.28, 0.46)   # 팩트 3줄이 찍히는 시점(전체 길이 대비)
RATES = (15, 13, 10, 7, 4, 0)   # edge-tts 속도 후보(%). +15에서 시작해 0까지 내려가며 26~28초를 맞춘다
TARGET_SEC = 27.2
FIT_LO, FIT_HI = 25.5, 28.6

POLICY_LABEL = {
    "required": "필수", "allowed_graded": "허용+채점", "allowed": "허용",
    "banned": "금지", "unspecified": "미언급", "unknown": "확인필요",
}
POLICY_COLOR = {
    "required": RED, "allowed_graded": BLUE, "allowed": GREEN,
    "banned": RED, "unspecified": YELLOW, "unknown": YELLOW,
}

FONT_CANDIDATES = [
    os.environ.get("SHORTS_FONT", ""),
    "/usr/share/fonts/pickle-hwp/NotoSansMonoCJKkr-Regular.otf",
    "/usr/share/fonts/pickle-hwp/NotoSansCJKkr-Regular.otf",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
]

# 한글 본문은 비례 폰트 — 모노 CJK는 한글이 전각으로 벌어져 제목이 헐겁다
K_FONT_CANDIDATES = [
    os.environ.get("SHORTS_KFONT", ""),
    "/usr/share/fonts/pickle-hwp/NotoSansCJKkr-Regular.otf",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
] + FONT_CANDIDATES


def find_ffmpeg():
    for cand in (os.environ.get("SHORTS_FFMPEG", ""), "/workspace/.local/bin/ffmpeg", shutil.which("ffmpeg") or ""):
        if cand and Path(cand).exists():
            return cand
    return "ffmpeg"


FFMPEG = find_ffmpeg()
_FONTS = {}
_KFONTS = {}


def _load(size, candidates, cache):
    if size in cache:
        return cache[size]
    for path in candidates:
        if path and Path(path).exists():
            try:
                cache[size] = ImageFont.truetype(path, size)
                return cache[size]
            except OSError:
                continue
    cache[size] = ImageFont.load_default()
    return cache[size]


def font(size):
    """모노 CJK — 프롬프트·수치·ASCII 코드 라인."""
    return _load(size, FONT_CANDIDATES, _FONTS)


def kfont(size):
    """비례 CJK — 제목·주최·팩트·라벨 같은 한글 문장."""
    return _load(size, K_FONT_CANDIDATES, _KFONTS)


# --------------------------------------------------------------------------
# 대본 → 화면 모델
# --------------------------------------------------------------------------

def strip_glyphs(s):
    """이모지·변형선택자·원문자 마커를 걷어낸다 (터미널 화면은 텍스트만)."""
    if s is None:
        return ""
    out = []
    for ch in str(s):
        o = ord(ch)
        if 0x1F000 <= o <= 0x1FAFF or 0x2600 <= o <= 0x27BF or 0xFE00 <= o <= 0xFE0F:
            continue
        if 0x2460 <= o <= 0x2473:      # ① ~ ⑳
            continue
        if ch in "\u200b\u200c\u200d":
            continue
        out.append(ch)
    return re.sub(r"\s+", " ", "".join(out)).strip(" -·•>")


def shorten(s, n):
    s = strip_glyphs(s)
    return s if len(s) <= n else s[: n - 3].rstrip() + "..."


def infer_policy(script):
    p = script.get("ai_policy") or script.get("policy")
    if p in POLICY_LABEL:
        return p
    text = script.get("narration_full") or " ".join(str(s.get("narration", "")) for s in script.get("scenes") or [])
    if "필수" in text:
        return "required"
    if "채점" in text:
        return "allowed_graded"
    if "허용" in text:
        return "allowed"
    return "unspecified"


def dday_text(script):
    days = script.get("days_left")
    if isinstance(days, int):
        return "D-%d" % days if days >= 0 else "마감"
    deadline = script.get("deadline")
    if deadline:
        try:
            d = datetime.strptime(deadline, "%Y-%m-%d").date()
            left = (d - datetime.now(KST).date()).days
            return "D-%d" % left if left >= 0 else "마감"
        except ValueError:
            return "마감일"
    return "일정"


def status_text(script):
    """D-day와 짝을 이루는 상태 라벨 — 마감이 지난 대본에 '모집중'을 붙이지 않는다."""
    days = script.get("days_left")
    if isinstance(days, int):
        return "모집중" if days >= 0 else "마감 지남"
    deadline = script.get("deadline")
    if deadline:
        try:
            left = (datetime.strptime(deadline, "%Y-%m-%d").date() - datetime.now(KST).date()).days
            return "모집중" if left >= 0 else "마감 지남"
        except ValueError:
            return "일정 확인"
    return "상시"


def build_facts(script):
    """핵심 팩트 3줄 — 대본 중간 장면의 자막에서 뽑고, 부족하면 마감·혜택·정책으로 채운다."""
    scenes = script.get("scenes") or []
    mid = scenes[1:-1] if len(scenes) > 2 else scenes[:1]
    facts = []
    for sc in mid:
        for line in str(sc.get("subtitle") or "").split("\n"):
            t = strip_glyphs(line)
            if t and t not in facts:
                facts.append(t)
    deadline = script.get("deadline")
    if deadline:
        days = script.get("days_left")
        line = "마감 %s" % deadline + (" (D-%d)" % days if isinstance(days, int) and days >= 0 else "")
        if line not in facts:
            facts.append(line)
    prize = script.get("prize")
    if prize:
        line = "혜택 " + strip_glyphs(prize)
        if line not in facts:
            facts.append(line)
    if len(facts) < 3:
        facts.append("AI 정책 " + POLICY_LABEL[infer_policy(script)])
    if len(facts) < 3:
        facts.append("상세 요강은 프로필 링크")
    return [shorten(f, 30) for f in facts[:3]]


def wrap(draw, text, fnt, max_w):
    """한국어 줄바꿈 — 공백 단위로 먼저 끊고, 단어가 폭을 넘을 때만 글자 단위로 쪼갠다."""
    lines, cur = [], ""
    for token in re.split(r"(\s+)", str(text)):
        if not token:
            continue
        if token.isspace():
            if "\n" in token:
                lines.append(cur.rstrip())
                cur = ""
            elif cur:
                cur += " "
            continue
        trial = (cur + token) if cur else token
        if draw.textlength(trial, font=fnt) <= max_w:
            cur = trial
            continue
        if cur.strip():
            lines.append(cur.rstrip())
            cur = ""
        for ch in token:
            if cur and draw.textlength(cur + ch, font=fnt) > max_w:
                lines.append(cur)
                cur = ch
            else:
                cur += ch
    if cur.strip():
        lines.append(cur.rstrip())
    return lines or [""]


def layout_facts(facts):
    """팩트별 (폰트 크기, 줄 목록) — 24~30자 팩트가 1080 폭에서 한 줄에 들어가게 줄인다."""
    probe = ImageDraw.Draw(Image.new("RGB", (8, 8)))
    blocks = []
    for fact in facts:
        size = 46
        lines = wrap(probe, fact, kfont(size), CONTENT_W - 70)
        while len(lines) > 2 and size > 32:
            size -= 2
            lines = wrap(probe, fact, kfont(size), CONTENT_W - 70)
        if len(lines) > 2:
            lines = lines[:2]
            lines[-1] = shorten(lines[-1], max(6, len(lines[-1]) - 2))
        blocks.append((size, lines))
    return blocks


# --------------------------------------------------------------------------
# TTS (edge-tts, 무료)
# --------------------------------------------------------------------------

def probe_duration(path):
    """ffprobe가 없는 환경이 많아 ffmpeg -i stderr에서 길이를 읽는다."""
    p = subprocess.run([FFMPEG, "-i", str(path)], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    m = re.search(r"Duration:\s*(\d+):(\d+):(\d+\.\d+)", p.stderr or "")
    if not m:
        raise RuntimeError("오디오 길이를 읽지 못했습니다: %s" % path)
    h, mi, s = m.groups()
    return int(h) * 3600 + int(mi) * 60 + float(s)


def synth(text, voice, rate_pct, out_path):
    cmd = [
        sys.executable, "-m", "edge_tts",
        "--voice", voice,
        "--rate", "%+d%%" % rate_pct,
        "-t", text,
        "--write-media", str(out_path),
    ]
    p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if p.returncode != 0 or not Path(out_path).exists() or Path(out_path).stat().st_size == 0:
        raise RuntimeError("edge-tts 실패(네트워크·설치 확인): %s" % (p.stderr or "").strip()[-300:])
    return probe_duration(out_path)


def trim_edges(src, dst):
    """edge-tts가 앞뒤에 붙이는 무음(0.6~1.6초)만 잘라낸다 — 문장 사이 쉼은 그대로 둔다."""
    af = (
        "silenceremove=start_periods=1:start_duration=0.05:start_threshold=-45dB,"
        "areverse,"
        "silenceremove=start_periods=1:start_duration=0.05:start_threshold=-45dB,"
        "areverse"
    )
    p = subprocess.run(
        [FFMPEG, "-y", "-i", str(src), "-af", af, "-c:a", "pcm_s16le", str(dst)],
        stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True,
    )
    if p.returncode != 0:
        raise RuntimeError("무음 정리 실패:\n" + (p.stderr or "")[-500:])
    return probe_duration(dst)


def fit_tts(text, voice, work_dir, rates=RATES):
    """26~28초에 가장 가까운 속도를 고른다 — 빠른 쪽(+15%)부터 내려가며 창(window)에 드는 첫 값을 쓴다.

    대본이 짧으면 +10%로도 25초에 못 미치므로 0%까지 늦춰 맞춘다. 그래도 짧으면 그 길이대로
    (억지로 늘리지 않는다). +15%로도 28.6초를 넘으면 대본이 긴 것이라 빠른 쪽을 유지하고 경고한다.
    """
    best = None
    for pct in rates:
        raw = work_dir / ("tts_%d.mp3" % pct)
        wav = work_dir / ("tts_%d.wav" % pct)
        synth(text, voice, pct, raw)
        dur = trim_edges(raw, wav)
        if best is None or abs(dur - TARGET_SEC) < abs(best[1] - TARGET_SEC):
            best = (wav, dur, pct)
        if FIT_LO <= dur <= FIT_HI:
            return best
        if dur > FIT_HI:
            break        # 이미 길다 — 더 느리게 가면 더 길어진다
    return best


def silent_audio(out_path, dur):
    cmd = [
        FFMPEG, "-y", "-f", "lavfi",
        "-i", "anullsrc=channel_layout=mono:sample_rate=48000",
        "-t", "%.3f" % dur, "-c:a", "aac", "-b:a", "96k", str(out_path),
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return probe_duration(out_path)


# --------------------------------------------------------------------------
# 화면
# --------------------------------------------------------------------------

def build_model(script):
    scenes = script.get("scenes") or []
    narration = script.get("narration_full") or " ".join(str(s.get("narration") or "") for s in scenes)
    policy = infer_policy(script)
    return {
        "title": strip_glyphs(script.get("event_title") or script.get("title") or "과제 지도"),
        "host": strip_glyphs(script.get("host") or ""),
        "dday": dday_text(script),
        "status": status_text(script),
        "policy": policy,
        "policy_label": POLICY_LABEL[policy],
        "policy_color": POLICY_COLOR[policy],
        "facts": build_facts(script),
        "narration": narration,
    }


def facts_height(blocks):
    return sum(len(lines) * int(size * 1.22) + 26 for size, lines in blocks)


def draw_static(model, total):
    """매 프레임 공통 레이어: 배경, 규칙선, 제목, 주최, 배지, CTA 박스. 팩트 영역 y를 함께 돌려준다."""
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)

    # 상단 규칙선 + 좌상단 액센트
    d.rectangle([MARGIN, 168, MARGIN + 44, 172], fill=YELLOW)
    d.line([(MARGIN, 168), (W - MARGIN, 168)], fill=BORDER, width=2)
    d.text((W - MARGIN, 92), "9:16 / %.0fs" % total, font=font(26), fill=FAINT, anchor="ra")

    # D-day + 상태
    y = 212
    d.text((MARGIN, y), model["dday"], font=font(46), fill=YELLOW)
    dw = d.textlength(model["dday"], font=font(46))
    d.text((MARGIN + dw + 18, y + 12), model["status"], font=kfont(28), fill=MUT)

    # 제목 — 폭에 맞춰 폰트를 줄이며 최대 4줄
    y += 82
    size, lines = 78, []
    while size > 46:
        f = kfont(size)
        lines = wrap(d, model["title"], f, CONTENT_W)
        if len(lines) <= 4:
            break
        size -= 6
    for line in lines:
        d.text((MARGIN, y), line, font=f, fill=FG_HI)
        y += int(size * 1.28)
    y += 8

    # 주최
    if model["host"]:
        for line in wrap(d, "주최 " + model["host"], kfont(30), CONTENT_W)[:2]:
            d.text((MARGIN, y), line, font=kfont(30), fill=MUT)
            y += 42

    # AI 정책 배지 (테두리 박스, 모노크롬 + 정책색)
    y += 24
    label = "AI 정책 " + model["policy_label"]
    bf = kfont(32)
    bw = d.textlength(label, font=bf)
    d.rectangle([MARGIN, y, MARGIN + bw + 40, y + 58], outline=model["policy_color"], width=2)
    d.text((MARGIN + 20, y + 12), label, font=bf, fill=model["policy_color"])
    y += 58 + 52

    # 팩트 영역 구분선
    d.line([(MARGIN, y), (W - MARGIN, y)], fill=BORDER2, width=1)
    facts_top = y + 34

    # CTA 박스 (하단 고정)
    box_top = 1596
    d.line([(MARGIN, box_top - 30), (W - MARGIN, box_top - 30)], fill=BORDER, width=1)
    d.rectangle([MARGIN, box_top, W - MARGIN, box_top + 168], fill=PANEL, outline=BORDER, width=1)
    cf = font(30)
    cx = MARGIN + 26
    d.text((cx, box_top + 26), "$", font=cf, fill=YELLOW)
    cw = d.textlength("$ ", font=cf)
    d.text((cx + cw, box_top + 26), "open " + SITE, font=cf, fill=FG_HI)
    d.text((cx, box_top + 84), "프로필 링크의 과제 지도에서 원문과 마감 확인", font=kfont(26), fill=MUT)
    d.text((cx, box_top + 124), "매일 03:00 KST 자동 수집", font=kfont(24), fill=FAINT)

    # 하단 규칙선 + 워터마크
    d.line([(MARGIN, H - 108), (W - MARGIN, H - 108)], fill=BORDER2, width=1)
    d.text((W - MARGIN, H - 96), "assignment-map", font=font(24), fill=FAINT, anchor="ra")
    return img, facts_top


def render_frame(static, model, facts_top, t, total, fps):
    img = static.copy()
    d = ImageDraw.Draw(img)

    # 1) 프롬프트 타이핑 + 커서
    pf = font(34)
    n = min(len(PROMPT), int(t / TYPE_STEP) + 1)
    shown = PROMPT[:n]
    py = 96
    d.text((MARGIN, py), shown, font=pf, fill=FG if n < len(PROMPT) else MUT)
    if t < TYPE_DUR + 0.2 or (t % 1.0) < 0.5:
        cw = d.textlength(shown, font=pf)
        d.rectangle([MARGIN + cw + 4, py + 4, MARGIN + cw + 16, py + 32], fill=YELLOW)

    # 2) 핵심 팩트 3줄 — 시점마다 한 줄씩 찍히고 마지막 줄이 밝다
    active = -1
    for i in range(len(model["facts"])):
        if t >= total * REVEAL[min(i, len(REVEAL) - 1)]:
            active = i
    # 비어 보이지 않게 배지와 CTA 사이에 세로로 앉힌다 (최대 300px)
    region_bottom = 1560
    room = region_bottom - facts_top - model["facts_h"]
    y0 = facts_top + max(0, min(300, room // 2))
    # 팩트 블록을 여는 프롬프트 라벨 — 블록이 떠 보이지 않게 왼쪽을 고정한다
    d.text((MARGIN, y0 - 50), "$ facts --top 3", font=font(24), fill=FAINT)
    d.line([(MARGIN, y0 - 16), (W - MARGIN, y0 - 16)], fill=BORDER2, width=1)
    y = y0
    for i, (size, lines) in enumerate(model["fact_blocks"]):
        f = kfont(size)
        line_h = int(size * 1.22)
        if i <= active:
            d.text((MARGIN, y + 4), "%02d" % (i + 1), font=font(26), fill=FAINT)
            for j, line in enumerate(lines):
                d.text((MARGIN + 62, y + j * line_h), line, font=f, fill=FG_HI if i == active else FG)
        elif i == active + 1:
            d.text((MARGIN + 62, y + 2), ">", font=font(32), fill=YELLOW)
        y += len(lines) * line_h + 26

    # 3) 진행 바
    d.line([(MARGIN, H - 70), (W - MARGIN, H - 70)], fill=BORDER2, width=2)
    filled = int(CONTENT_W * max(0.0, min(1.0, t / total)))
    if filled:
        d.rectangle([MARGIN, H - 70, MARGIN + filled, H - 66], fill=YELLOW)
    return img


def encode(frames_iter, audio_path, out_path):
    cmd = [
        FFMPEG, "-y",
        "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", "%dx%d" % (W, H), "-r", str(FPS), "-i", "-",
        "-i", str(audio_path),
        "-af", "apad=pad_dur=%.2f" % PAD_TAIL,
        "-map", "0:v:0", "-map", "1:a:0",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k",
        "-shortest", "-movflags", "+faststart",
        str(out_path),
    ]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    try:
        for frame in frames_iter:
            proc.stdin.write(frame.tobytes())
    except BrokenPipeError:
        pass          # ffmpeg가 먼저 죽었다 — 아래에서 stderr를 읽어 원인을 올린다
    finally:
        try:
            proc.stdin.close()
        except BrokenPipeError:
            pass
    err = proc.stderr.read().decode("utf-8", "replace") if proc.stderr else ""
    if proc.wait() != 0:
        raise RuntimeError("ffmpeg 인코딩 실패:\n" + err[-1200:])


# --------------------------------------------------------------------------
# 실행
# --------------------------------------------------------------------------

def load_script(path):
    path = Path(path)
    if not path.exists():
        raise SystemExit("대본 파일이 없습니다: %s" % path)
    if path.suffix.lower() != ".json":
        raise SystemExit("JSON 대본만 렌더링합니다 (generator.py가 output/에 남기는 *.json): %s" % path)
    data = json.loads(path.read_text(encoding="utf-8"))
    if not (data.get("scenes") or data.get("narration_full")):
        raise SystemExit("대본에 scenes/narration_full이 없습니다: %s" % path)
    data["_source"] = str(path)
    return data


def pick_latest():
    files = sorted(OUTPUT_DIR.glob("*.json"), key=lambda p: (p.stat().st_mtime, p.name), reverse=True)
    if not files:
        raise SystemExit("output/에 대본 JSON이 없습니다. 먼저 generator.py를 실행하세요.")
    manifest = ROOT / "manifest.json"
    if manifest.exists():
        try:
            items = json.loads(manifest.read_text(encoding="utf-8")).get("items", [])
        except (ValueError, OSError):
            items = []
        queued = [i for i in items if i.get("status") == "queued"]
        for item in queued:
            slot = item.get("slot") or ""
            if not slot:
                continue
            for f in files:
                if f.stem.startswith(slot):
                    return f
    return files[0]


def narration_text(script):
    text = script.get("narration_full")
    if not text:
        text = " ".join(str(s.get("narration") or "") for s in script.get("scenes") or [])
    return strip_glyphs(text)


def test_script():
    today = datetime.now(KST).date()
    return {
        "event_id": "renderer-selftest",
        "slot_id": "selftest",
        "event_title": "렌더러 자체 점검",
        "host": "assignment-map",
        "deadline": (today + timedelta(days=3)).isoformat(),
        "days_left": 3,
        "ai_policy": "required",
        "scenes": [
            {"time": "00~02초", "subtitle": "터미널 타이핑 점검", "narration": "점검 시작."},
            {"time": "02~04초", "subtitle": "핵심 팩트 3줄\nAI 정책 배지", "narration": "팩트 확인."},
            {"time": "04~05초", "subtitle": "프로필 링크", "narration": "마무리."},
        ],
        "_source": "selftest",
    }


def render(script, out_path, voice="ko-KR-InJoonNeural", fps=FPS, silent=False, keep_temp=False,
           tts_fallback=False, rates=RATES):
    RENDER_DIR.mkdir(parents=True, exist_ok=True)
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    work = RENDER_DIR / ".work" / out_path.stem
    if work.exists():
        shutil.rmtree(work)
    work.mkdir(parents=True)

    model = build_model(script)
    model["fact_blocks"] = layout_facts(model["facts"])
    model["facts_h"] = facts_height(model["fact_blocks"])
    text = narration_text(script)
    print("[1/4] TTS  %s  (%d자)" % ("무음" if silent else voice, len(text)))
    if silent:
        est = float(script.get("est_seconds") or 5.0)
        audio = work / "audio.m4a"
        dur = silent_audio(audio, max(3.0, min(est, 40.0)))
        rate = 0
    else:
        try:
            audio, dur, rate = fit_tts(text, voice, work, rates)
        except RuntimeError as e:
            if not tts_fallback:
                raise
            print("      경고: TTS 실패 → 무음으로 대체 (%s)" % str(e)[:150])
            audio = work / "audio.m4a"
            dur = silent_audio(audio, 5.0)
            rate = 0
    total = dur + PAD_TAIL
    n_frames = max(1, int(round(total * fps)))
    print("      %.2fs @ %+d%%  → %d 프레임 (%.1fs)" % (dur, rate, n_frames, total))
    if dur > 30.0:
        print("      경고: 대본이 28초 템플릿보다 길다 (%.1fs). 28s-v1 대본(130~145자)이면 26~28초에 맞는다." % dur)

    print("[2/4] 프레임  %s | 팩트 %d줄 | 정책 %s" % (model["title"][:32], len(model["facts"]), model["policy_label"]))
    static, facts_top = draw_static(model, total)

    def frames():
        for i in range(n_frames):
            yield render_frame(static, model, facts_top, i / fps, total, fps)

    print("[3/4] 인코딩  ffmpeg libx264 + aac")
    encode(frames(), audio, out_path)
    if not keep_temp:
        shutil.rmtree(work, ignore_errors=True)

    size_mb = out_path.stat().st_size / (1024 * 1024)
    print("[4/4] 완료  %s  (%.1fs, %.1fMB)" % (out_path, total, size_mb))
    return {"out": str(out_path), "duration": round(total, 2), "frames": n_frames, "rate": rate, "mb": round(size_mb, 2)}


def main(argv=None):
    ap = argparse.ArgumentParser(description="assignment-map 쇼츠 mp4 렌더러 (edge-tts + Pillow + ffmpeg, ₩0)")
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--script", help="대본 JSON 경로 (generator.py가 output/에 남긴 파일)")
    src.add_argument("--latest", action="store_true", help="output/에서 최신(대기 중) 대본을 찾아 렌더링")
    src.add_argument("--test", action="store_true", help="더미 대본으로 3~5초 샘플 mp4를 빠르게 렌더링")
    ap.add_argument("--out", help="출력 mp4 경로 (기본: renders/<대본이름>.mp4)")
    ap.add_argument("--voice", default="ko-KR-InJoonNeural", help="edge-tts 음성 (기본 ko-KR-InJoonNeural)")
    ap.add_argument("--fps", type=int, default=FPS, help="프레임 레이트 (기본 30)")
    ap.add_argument("--silent", action="store_true", help="TTS 없이 무음으로 렌더 (오프라인 점검용)")
    ap.add_argument("--keep-temp", action="store_true", help="작업 폴더(renders/.work)를 남긴다")
    args = ap.parse_args(argv)

    if args.test:
        script, stem = test_script(), "test-" + datetime.now(KST).strftime("%Y%m%d-%H%M%S")
    elif args.latest:
        path = pick_latest()
        script, stem = load_script(path), path.stem
    else:
        path = Path(args.script)
        script, stem = load_script(path), path.stem

    out = Path(args.out) if args.out else RENDER_DIR / (stem + ".mp4")
    info = render(script, out, voice=args.voice, fps=args.fps, silent=args.silent,
                  keep_temp=args.keep_temp, tts_fallback=args.test,
                  rates=(15,) if args.test else RATES)
    print(json.dumps(info, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
