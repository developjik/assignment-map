"""쇼츠 파이프라인 신선도 방어 테스트 (표준 unittest 만 사용).

    python3 -m unittest discover -s pipeline/shorts/tests -v

PR #2 리뷰 지적(마감 지난 대본이 '모집중'으로 렌더링됨)에 대한 회귀 방지선이다.
생성기(generator.py)와 렌더러(renderer.py)가 같은 규칙(마감일 기준)으로 판단하는지 본다.
"""
import importlib.util
import json
import sys
import tempfile
import unittest
from datetime import date, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]      # pipeline/shorts
REPO = ROOT.parents[1]                           # 리포 루트


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / filename)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


gen = load("shorts_generator", "generator.py")
ren = load("shorts_renderer", "renderer.py")

TODAY = "2026-11-14"


def posting(**kw):
    base = {
        "id": "test:1", "company": "테스트기업", "title": "AI 활용 개발자",
        "positions": ["frontend"], "ai_policy": "required",
        "assignment_type": "pre_assignment", "process_raw": "서류 -> 사전 과제 -> 면접",
        "evidence": [{"quote": "AI 활용을 전제로 과제를 냅니다. 결과물과 과정을 함께 봅니다.", "field": "assignment"}],
        "deadline": "2026-11-20", "status": "open", "url": "https://example.com/1",
    }
    base.update(kw)
    return base


class TestGeneratorFreshness(unittest.TestCase):
    def test_is_live_rules(self):
        self.assertTrue(gen.is_live(posting(), TODAY))
        self.assertFalse(gen.is_live(posting(deadline="2026-11-13"), TODAY), "어제 마감은 죽은 소재")
        self.assertTrue(gen.is_live(posting(deadline=TODAY), TODAY), "당일 마감은 살아 있다")
        self.assertFalse(gen.is_live(posting(status="closed"), TODAY))
        self.assertTrue(gen.is_live(posting(deadline=None, status="open"), TODAY), "상시 채용")

    def test_score_rejects_expired_and_closed(self):
        self.assertGreater(gen.score_posting(posting(), TODAY), 0)
        self.assertEqual(gen.score_posting(posting(deadline="2026-11-01"), TODAY), 0)
        self.assertEqual(gen.score_posting(posting(status="closed"), TODAY), 0)

    def test_prune_stale_expires_only_past_queued(self):
        manifest = {"stats": {}, "items": [
            {"id": "a", "status": "queued", "deadline": "2026-11-02"},
            {"id": "b", "status": "queued", "deadline": "2026-12-01"},
            {"id": "c", "status": "published", "deadline": "2026-11-02"},
        ]}
        expired = gen.prune_stale(manifest, TODAY)
        self.assertEqual(expired, ["a"])
        self.assertEqual(manifest["items"][0]["status"], "expired")
        self.assertEqual(manifest["items"][1]["status"], "queued")
        self.assertEqual(manifest["items"][2]["status"], "published")

    def test_build_script_refuses_expired_record(self):
        slot = {"name": "점심", "time": "12:30", "tag": "lunch"}
        with self.assertRaises(SystemExit):
            gen.build_script("posting", posting(deadline="2026-11-01"), -13, slot, TODAY, 120)

    def test_build_script_live_record_has_28s_budget(self):
        slot = {"name": "점심", "time": "12:30", "tag": "lunch"}
        data = gen.build_script("posting", posting(), 6, slot, TODAY, 120)
        self.assertEqual(data["template"], "28s-v1")
        self.assertTrue(gen.SCRIPT_MIN - 8 <= data["char_count"] <= gen.SCRIPT_MAX + 8, data["char_count"])
        self.assertGreaterEqual(data["days_left"], 0)


class TestRendererFreshness(unittest.TestCase):
    def script(self, deadline, days_left=3, **kw):
        data = {
            "event_id": "t", "slot_id": "2026-11-14-lunch-t", "event_title": "테스트",
            "host": "테스트", "deadline": deadline, "days_left": days_left,
            "scenes": [{"time": "00~04초", "subtitle": "x", "narration": "가"}],
            "narration_full": "가",
        }
        data.update(kw)
        return data

    def test_status_text_ignores_stale_days_left(self):
        # 대본에 days_left=3 이 박혀 있어도 마감이 지났으면 '모집중'이 아니다
        s = self.script("2026-11-02", days_left=3)
        self.assertEqual(ren.status_text(s, date(2026, 11, 14)), "마감 지남")
        self.assertEqual(ren.dday_text(s, date(2026, 11, 14)), "마감")

    def test_status_text_live(self):
        s = self.script("2026-11-21", days_left=7)
        self.assertEqual(ren.status_text(s, date(2026, 11, 14)), "모집중")
        self.assertEqual(ren.dday_text(s, date(2026, 11, 14)), "D-7")

    def test_script_is_live(self):
        self.assertFalse(ren.script_is_live(self.script("2026-11-13")))
        self.assertTrue(ren.script_is_live(self.script("2026-11-14")))
        self.assertTrue(ren.script_is_live(self.script(None)), "마감 없음(상시)은 살아 있다")

    def test_pick_latest_skips_expired(self):
        with tempfile.TemporaryDirectory() as td:
            out = Path(td)
            (out / "2026-11-02-lunch-old.json").write_text(
                json.dumps(self.script("2026-11-02"), ensure_ascii=False), encoding="utf-8")
            (out / "2026-11-14-lunch-new.json").write_text(
                json.dumps(self.script("2026-11-21"), ensure_ascii=False), encoding="utf-8")
            old_out, old_root = ren.OUTPUT_DIR, ren.ROOT
            ren.OUTPUT_DIR, ren.ROOT = out, out      # manifest 없음
            try:
                picked = ren.pick_latest(today=date(2026, 11, 14))
            finally:
                ren.OUTPUT_DIR, ren.ROOT = old_out, old_root
            self.assertEqual(picked.name, "2026-11-14-lunch-new.json")

    def test_pick_latest_refuses_when_all_expired(self):
        with tempfile.TemporaryDirectory() as td:
            out = Path(td)
            (out / "2026-11-02-lunch-old.json").write_text(
                json.dumps(self.script("2026-11-02"), ensure_ascii=False), encoding="utf-8")
            old_out, old_root = ren.OUTPUT_DIR, ren.ROOT
            ren.OUTPUT_DIR, ren.ROOT = out, out
            try:
                with self.assertRaises(SystemExit):
                    ren.pick_latest(today=date(2026, 11, 14))
            finally:
                ren.OUTPUT_DIR, ren.ROOT = old_out, old_root

    def test_pick_latest_uses_manifest_queue_order_but_respects_deadline(self):
        with tempfile.TemporaryDirectory() as td:
            out = Path(td)
            (out / "2026-11-10-lunch-a.json").write_text(
                json.dumps(self.script("2026-11-12"), ensure_ascii=False), encoding="utf-8")
            (out / "2026-11-13-lunch-b.json").write_text(
                json.dumps(self.script("2026-11-25"), ensure_ascii=False), encoding="utf-8")
            (out / "manifest.json").write_text(json.dumps({"items": [
                {"status": "queued", "slot": "2026-11-13-lunch", "scheduled_at": "2026-11-13T12:30:00+09:00"},
                {"status": "queued", "slot": "2026-11-10-lunch", "scheduled_at": "2026-11-10T12:30:00+09:00"},
            ]}), encoding="utf-8")
            old_out, old_root = ren.OUTPUT_DIR, ren.ROOT
            ren.OUTPUT_DIR, ren.ROOT = out, out
            try:
                picked = ren.pick_latest(today=date(2026, 11, 14))
            finally:
                ren.OUTPUT_DIR, ren.ROOT = old_out, old_root
            self.assertEqual(picked.name, "2026-11-13-lunch-b.json")

    def test_render_refuses_expired_script(self):
        with tempfile.TemporaryDirectory() as td:
            with self.assertRaises(SystemExit):
                ren.render(self.script("2026-11-02"), Path(td) / "x.mp4", silent=True)


if __name__ == "__main__":
    unittest.main()
