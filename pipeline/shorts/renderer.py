#!/usr/bin/env python3
"""
renderer.py — assignment-map 쇼츠 자동 영상 렌더러
TTS (edge-tts) + 씬 비주얼 + Noto Sans CJK KR 자막을 결합해 1080x1920 쇼츠 mp4를 생성합니다.
"""

import sys
import os
import re
import json
import subprocess
from PIL import Image

FFMPEG_BIN = os.path.expanduser("/workspace/.local/bin/ffmpeg")
if not os.path.exists(FFMPEG_BIN):
    FFMPEG_BIN = "ffmpeg"

FONT_PATH = "/usr/share/fonts/pickle-hwp/NotoSansCJKkr-Regular.otf"

def resize_and_crop(in_path, out_path, target_w=1080, target_h=1920):
    img = Image.open(in_path).convert('RGB')
    scale = max(target_w / img.width, target_h / img.height)
    new_w = int(img.width * scale)
    new_h = int(img.height * scale)
    img_resized = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
    left = (new_w - target_w) // 2
    top = (new_h - target_h) // 2
    cropped = img_resized.crop((left, top, left + target_w, top + target_h))
    cropped.save(out_path, quality=95)

def vtt_time_to_ass(vtt_t):
    vtt_t = vtt_t.replace(',', '.')
    parts = vtt_t.split(':')
    h = int(parts[0])
    m = int(parts[1])
    s = float(parts[2])
    return f"{h}:{m:02d}:{s:05.2f}"

def vtt_to_ass(vtt_path, ass_path):
    with open(vtt_path, 'r', encoding='utf-8') as f:
        vtt_content = f.read()

    ass_header = """[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Noto Sans CJK KR,64,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,5,2,2,60,60,340,1
Style: Highlight,Noto Sans CJK KR,68,&H0000FFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,5,2,2,60,60,340,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    events = []
    blocks = re.split(r'\n\s*\n', vtt_content.strip())
    for b in blocks:
        lines = [l.strip() for l in b.split('\n') if l.strip()]
        time_line = None
        text_lines = []
        for l in lines:
            if '-->' in l:
                time_line = l
            elif not l.isdigit() and l != 'WEBVTT':
                text_lines.append(l)
        if time_line and text_lines:
            start_vtt, end_vtt = [t.strip() for t in time_line.split('-->')]
            start_ass = vtt_time_to_ass(start_vtt)
            end_ass = vtt_time_to_ass(end_vtt)
            text = " \\N ".join(text_lines)
            style = "Highlight" if any(k in text for k in ["상금", "필수", "과제 지도", "마감", "합격"]) else "Default"
            events.append(f"Dialogue: 0,{start_ass},{end_ass},{style},,0,0,0,,{text}")

    with open(ass_path, 'w', encoding='utf-8') as f:
        f.write(ass_header + "\n".join(events) + "\n")

def render_shorts(script_text, scene_images, out_mp4, voice="ko-KR-InJoonNeural", rate="+10%"):
    os.makedirs("tmp_render", exist_ok=True)
    audio_path = "tmp_render/audio.mp3"
    vtt_path = "tmp_render/subs.vtt"
    ass_path = "tmp_render/subs.ass"
    concat_path = "tmp_render/inputs.txt"

    # 1. TTS
    print(f"[1/4] Generating TTS with {voice} ({rate})...")
    with open("tmp_render/script.txt", "w", encoding="utf-8") as f:
        f.write(script_text)
    subprocess.run([
        sys.executable, "-m", "edge_tts",
        "--voice", voice,
        "--rate", rate,
        "-f", "tmp_render/script.txt",
        "--write-media", audio_path,
        "--write-subtitles", vtt_path
    ], check=True)

    # 2. Subtitles
    print("[2/4] Generating ASS styled subtitles...")
    vtt_to_ass(vtt_path, ass_path)

    # 3. Prepare scenes
    print(f"[3/4] Preparing {len(scene_images)} scenes...")
    cropped_scenes = []
    for idx, img_p in enumerate(scene_images):
        dst = f"tmp_render/scene_{idx}.jpg"
        resize_and_crop(img_p, dst)
        cropped_scenes.append(dst)

    # Measure total audio duration
    probe = subprocess.run([
        FFMPEG_BIN, "-i", audio_path
    ], stderr=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
    dur_match = re.search(r"Duration:\s*(\d+):(\d+):(\d+\.\d+)", probe.stderr)
    total_dur = 45.0
    if dur_match:
        h, m, s = dur_match.groups()
        total_dur = int(h) * 3600 + int(m) * 60 + float(s)

    scene_dur = total_dur / len(cropped_scenes)
    with open(concat_path, "w", encoding="utf-8") as f:
        for idx, s_p in enumerate(cropped_scenes):
            f.write(f"file '{os.path.abspath(s_p)}'\n")
            f.write(f"duration {scene_dur:.3f}\n")
        f.write(f"file '{os.path.abspath(cropped_scenes[-1])}'\n")

    # 4. Render MP4
    print(f"[4/4] Rendering video with FFmpeg -> {out_mp4}...")
    cmd = [
        FFMPEG_BIN, "-f", "concat", "-safe", "0", "-i", concat_path,
        "-i", audio_path,
        "-vf", f"ass={ass_path},format=yuv420p",
        "-c:v", "libx264", "-preset", "veryfast", "-threads", "1", "-crf", "23",
        "-c:a", "aac", "-b:a", "160k",
        "-shortest", "-y", out_mp4
    ]
    subprocess.run(cmd, check=True)
    print(f"✅ Render complete: {out_mp4} ({total_dur:.1f}s)")

if __name__ == "__main__":
    print("Renderer module ready.")
