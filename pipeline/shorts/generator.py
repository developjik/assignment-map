#!/usr/bin/env python3
"""
generator.py — assignment-map 공고 기반 쇼츠 자동 생성 파이프라인

사용법:
  python3 pipeline/shorts/generator.py [--count 3] [--date 2026-11-02] [--dry-run]
"""

import sys
import os
import json
from datetime import datetime, timezone, timedelta

KST = timezone(timedelta(hours=9))

def parse_args():
    args = sys.argv[1:]
    count = 4
    date_str = "2026-11-02"
    dry_run = False
    prune_only = False
    i = 0
    while i < len(args):
        if args[i] == "--count" and i + 1 < len(args):
            count = int(args[i + 1])
            i += 1
        elif args[i] == "--date" and i + 1 < len(args):
            date_str = args[i + 1]
            i += 1
        elif args[i] == "--dry-run":
            dry_run = True
        elif args[i] == "--prune-only":
            prune_only = True
        i += 1
    return count, date_str, dry_run, prune_only


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
        manifest["stats"]["expired"] = len([i for i in manifest["items"] if i.get("status") == "expired"])
        manifest["stats"]["published"] = len([i for i in manifest["items"] if i.get("status") == "published"])
    return expired

def get_days_remaining(today_str, deadline_str):
    if not deadline_str:
        return 999
    try:
        t = datetime.strptime(today_str, "%Y-%m-%d")
        d = datetime.strptime(deadline_str, "%Y-%m-%d")
        return (d - t).days
    except Exception:
        return 999

def score_event(event, today_str):
    # upcoming(접수 예정)도 곧 후보가 되므로 같은 공식으로 점수화한다.
    if event.get("status") not in ("open", "upcoming"):
        return -999
    deadline = event.get("submit_deadline") or event.get("apply_deadline")
    days = get_days_remaining(today_str, deadline)
    if days < 0:
        return -999 # 이미 마감됨

    score = 0

    # 1. 마감 임박도 (D-3 ~ D-14 최고 가중치)
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

    # 3. AI 정책 (AI 필수 또는 적극 허용 우대)
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

def main():
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
    events_path = os.path.join(repo_root, "data/events.json")
    manifest_path = os.path.join(repo_root, "pipeline/shorts/manifest.json")
    output_dir = os.path.join(repo_root, "pipeline/shorts/output")

    os.makedirs(output_dir, exist_ok=True)

    count, target_date, dry_run, prune_only = parse_args()

    with open(events_path, "r", encoding="utf-8") as f:
        events = json.load(f)

    if os.path.exists(manifest_path):
        with open(manifest_path, "r", encoding="utf-8") as f:
            manifest = json.load(f)
    else:
        manifest = {
            "version": "1.0.0",
            "updated_at": datetime.now(KST).isoformat(),
            "stats": {"total_generated": 0, "published": 0, "queued": 0},
            "items": []
        }

    expired = prune_stale(manifest, target_date)
    if expired:
        print(f"[Shorts Generator] 마감 지난 queued {len(expired)}건을 expired로 정리: {', '.join(expired)}")

    if prune_only:
        if not dry_run:
            manifest["updated_at"] = datetime.now(KST).isoformat()
            with open(manifest_path, "w", encoding="utf-8") as f:
                json.dump(manifest, f, ensure_ascii=False, indent=2)
            print("[Shorts Generator] manifest 저장 완료 (생성 없음)")
        return

    existing_ids = {item["id"] for item in manifest.get("items", [])}

    candidates = []
    for e in events:
        if e.get("id") in existing_ids:
            continue
        sc = score_event(e, target_date)
        if sc > 0:
            deadline = e.get("submit_deadline") or e.get("apply_deadline")
            days = get_days_remaining(target_date, deadline)
            candidates.append({"event": e, "score": sc, "days": days})

    candidates.sort(key=lambda x: x["score"], reverse=True)

    print(f"[Shorts Generator] 전체 후보: {len(candidates)}건, 오늘 생성 목표: {count}편 (기준일: {target_date})")

    selected = candidates[:count]
    slots = [
        {"name": "점심 (휴식)", "time": "12:30", "tag": "lunch"},
        {"name": "오후 (티타임)", "time": "15:30", "tag": "afternoon"},
        {"name": "퇴근 (퇴근길)", "time": "18:30", "tag": "evening"},
        {"name": "야간 (취침 전)", "time": "21:30", "tag": "night"}
    ]

    generated_items = []

    for idx, c in enumerate(selected):
        event = c["event"]
        days = c["days"]
        slot = slots[(idx + 1) % len(slots)]
        deadline_str = event.get("submit_deadline") or event.get("apply_deadline") or "마감 임박"
        prize_str = event.get("prize") or "상금 및 수상 특전 제공"
        host_str = event.get("host") or "공식 주최사"

        # 42초 3단 공식 스토리보드
        script_data = {
            "event_id": event["id"],
            "slot_id": f"{target_date}-{slot['tag']}",
            "scheduled_at": f"{target_date}T{slot['time']}:00+09:00",
            "event_title": event["title"],
            "host": host_str,
            "deadline": deadline_str,
            "days_left": days,
            "prize": prize_str,
            "hiring_link": bool(event.get("hiring_link")),
            "ai_policy": event.get("ai_usage"),
            "url": event.get("url"),
            "title": f"D-{days} {prize_str.split('+')[0].strip()}! {event['title']} 핵심 공략 #shorts #개발자 #공모전",
            "scenes": [
                {
                    "time": "00~06초 (후킹)",
                    "subtitle": f"D-{days} 마감! {prize_str[:22]}",
                    "narration": f"마감까지 딱 {days}일 남았습니다. {prize_str[:30]}이 걸린 {event['title']} 소식입니다.",
                    "visual_prompt": f"9:16 vertical poster, high-tech neon glowing badge with countdown 'D-{days}', cybernetic trophy, dark terminal UI, cyberpunk typography"
                },
                {
                    "time": "06~14초 (개요)",
                    "subtitle": f"{host_str} 주최\n마감일: {deadline_str}",
                    "narration": f"{host_str}에서 주최하며, 접수 마감은 {deadline_str}까지입니다. 지금 바로 준비해야 늦지 않아요.",
                    "visual_prompt": f"9:16 vertical screenshot mockup of official competition landing page, glowing highlight on deadline date {deadline_str}"
                },
                {
                    "time": "14~23초 (반전/핵심)",
                    "subtitle": "AI 활용 필수! 🤖\n생성형 AI로 격차 벌리기" if event.get("ai_usage") == "required" else "채용 연계 & 특전 🚀\n포트폴리오 직결 기회",
                    "narration": "이 공모전의 핵심은 AI 도구 활용이 필수라는 점입니다. 최신 LLM과 에이전트를 적극적으로 붙일수록 가산점을 받습니다." if event.get("ai_usage") == "required" else "단순 상금뿐 아니라 실제 채용 및 포트폴리오로 바로 연결되는 검증된 과제입니다.",
                    "visual_prompt": "9:16 architecture diagram showing AI Agent workflow and code generation blocks, glowing neon connectors"
                },
                {
                    "time": "23~33초 (솔루션)",
                    "subtitle": "심사위원 저격 3대 포인트\n① 실용성 ② 완성도 ③ AI 결합",
                    "narration": "수상 확률을 극대화하려면 1) 실무 문제 해결력, 2) 프로토타입 시각화, 3) 자동화 파이프라인의 완성도에 집중하세요.",
                    "visual_prompt": "9:16 UI split screen showing prototype dashboard, terminal logs running smoothly at 60fps"
                },
                {
                    "time": "33~42초 (CTA)",
                    "subtitle": "자세한 요강 & 과제는?\n고정댓글 [과제 지도] 링크!",
                    "narration": "망설이지 말고 도전해 보세요! 더 많은 AI 허용 공모전과 채용 과제는 고정댓글의 '과제 지도'에서 바로 확인하세요.",
                    "visual_prompt": "9:16 dark mode terminal dashboard of assignment-map.dev, glowing cursor pointing to bookmark button"
                }
            ],
            "metadata": {
                "youtube_title": f"D-{days} 마감! {prize_str.split('(')[0].strip()} {event['title']} #shorts",
                "description": f"{event['title']} 핵심 공략 요약!\n- 주최: {host_str}\n- 마감: {deadline_str} (D-{days})\n- 혜택: {prize_str}\n\n📌 AI 공모전·해커톤·채용 과제 실시간 지도:\n👉 https://developjik.github.io/assignment-map/\n\n#개발자 #공모전 #해커톤 #AI코딩 #취준 #이직",
                "pinned_comment": f"🔥 마감까지 D-{days}일 남았습니다!\n상세 요강과 더 많은 AI 채용 과제는 '과제 지도'에서 확인하세요 👇\nhttps://developjik.github.io/assignment-map/"
            }
        }

        # 마크다운 스토리보드 문서 생성
        scenes_table = "\n".join([
            f"| **{s['time']}** | {s['subtitle'].replace(chr(10), '<br>')} | \"{s['narration']}\" | `{s['visual_prompt']}` |"
            for s in script_data["scenes"]
        ])

        md_content = f"""# 🎬 [쇼츠 자동생성] {script_data['event_title']}

- **슬롯**: {slot['name']} ({script_data['scheduled_at']})
- **마감 D-Day**: D-{days} ({script_data['deadline']})
- **혜택/상금**: {script_data['prize']}
- **원문 공고**: {script_data['url']}

---

## 1. 스토리보드 타임라인 (42초)

| 시간 | 화면 자막 | 내레이션 (TTS 음성) | 비주얼 연출 프롬프트 |
|---|---|---|---|
{scenes_table}

---

## 2. 유튜브 발행 메타데이터

### 제목
{script_data['metadata']['youtube_title']}

### 설명
{script_data['metadata']['description']}

### 고정 댓글
{script_data['metadata']['pinned_comment']}
"""

        md_filename = f"{script_data['slot_id']}-{event['id'].replace(':', '_')}.md"
        json_filename = f"{script_data['slot_id']}-{event['id'].replace(':', '_')}.json"

        if not dry_run:
            with open(os.path.join(output_dir, md_filename), "w", encoding="utf-8") as f:
                f.write(md_content)
            with open(os.path.join(output_dir, json_filename), "w", encoding="utf-8") as f:
                json.dump(script_data, f, ensure_ascii=False, indent=2)

            manifest["items"].append({
                "id": event["id"],
                "slot": script_data["slot_id"],
                "scheduled_at": script_data["scheduled_at"],
                "title": script_data["metadata"]["youtube_title"],
                "event_title": event["title"],
                "host": host_str,
                "deadline": deadline_str,
                "prize": prize_str,
                "status": "queued",
                "script_path": f"pipeline/shorts/output/{md_filename}"
            })

        generated_items.append({
            "id": event["id"],
            "title": event["title"],
            "slot": slot["name"],
            "scheduled_at": script_data["scheduled_at"],
            "file": md_filename
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
        print(f"- [{item['slot']}] {item['title']} -> {item['file']}")

if __name__ == "__main__":
    main()
