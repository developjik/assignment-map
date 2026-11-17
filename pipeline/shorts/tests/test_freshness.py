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
        self.assertTrue(gen.SCRIPT_MIN <= data["char_count"] <= gen.SCRIPT_MAX,
                        "%d자 (목표 %d~%d자)" % (data["char_count"], gen.SCRIPT_MIN, gen.SCRIPT_MAX))
        self.assertGreaterEqual(data["days_left"], 0)

    def test_char_budget_matches_measured_tts_rate(self):
        # 131자 대본이 edge-tts 실측 21.5초였다 → 26~28초에는 155~175자가 필요하다
        self.assertGreaterEqual(gen.SCRIPT_MIN, 155)
        self.assertLessEqual(gen.SCRIPT_MAX, 180)
        self.assertTrue(gen.SCRIPT_MIN < gen.SCRIPT_TARGET < gen.SCRIPT_MAX)
        lo = gen.SCRIPT_MIN / gen.CHARS_PER_SEC
        hi = gen.SCRIPT_MAX / gen.CHARS_PER_SEC
        self.assertGreaterEqual(lo, 24.0)
        self.assertLessEqual(hi, 29.0)

    def test_evidence_sentence_skips_collector_noise(self):
        row = posting(evidence=[{
            "quote": "GI_Read_Comt_Ifrm 본문(2026-11-07): '[AI 진단] 서류전형 → 면접, 최종합격 ※ AI 활용 방식 자체를 평가에 반영합니다', "
                     "접수 2026-11-20(D-4)",
            "field": "assignment+ai_policy"}])
        sentence = gen.evidence_sentence(row)
        self.assertIn("AI", sentence)
        for junk in ("GI_Read", "2026-11-20", "최종합격", "서류전형"):
            self.assertNotIn(junk, sentence)


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
        # 기준일을 명시해야 한다 — 실제 오늘 날짜에 기대면 테스트가 시간이 지나며 깨진다
        self.assertFalse(ren.script_is_live(self.script("2026-11-13"), date(2026, 11, 14)))
        self.assertTrue(ren.script_is_live(self.script("2026-11-14"), date(2026, 11, 14)))
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


class TestCountdownRefresh(unittest.TestCase):
    """PR #5 P2 — 생성일 이후에 렌더링해도 배지·자막·나레이션이 같은 D-n 을 말해야 한다."""

    TODAY = date(2026, 11, 16)          # 대본은 D-8(11-14)에 만들어졌고 오늘은 D-6

    def queued_script(self, **kw):
        data = {
            "event_id": "jobkorea:test", "slot_id": "2026-11-14-lunch-test",
            "event_title": "테스트기업 DevOps 채용 과제 전형", "host": "테스트기업",
            "deadline": "2026-11-22", "days_left": 8, "template": "28s-v1",
            "scenes": [
                {"time": "00~04초", "subtitle": "AI 과제 전형\n지금 열려 있습니다",
                 "narration": "AI 써서 과제 내라는 기업이 있습니다. 바로 테스트기업 DevOps 전형입니다."},
                {"time": "04~20초", "subtitle": "전형: 자체 과제\nAI 활용: 필수\nDevOps | 11월 22일, D-8",
                 "narration": "전형은 자체 과제. AI 활용은 필수. DevOps 직무, 11월 22일 마감, D-8."},
                {"time": "20~28초", "subtitle": "프로필 링크\n'과제 지도'",
                 "narration": "더 많은 기업별 AI 과제는 프로필 링크 과제 지도에서 확인하세요."},
            ],
            "narration_full": "AI 써서 과제 내라는 기업이 있습니다. 바로 테스트기업 DevOps 전형입니다. "
                              "전형은 자체 과제. AI 활용은 필수. DevOps 직무, 11월 22일 마감, D-8. "
                              "더 많은 기업별 AI 과제는 프로필 링크 과제 지도에서 확인하세요.",
            "metadata": {"youtube_title": "D-8 테스트기업 DevOps 전형 #shorts",
                         "description": "- 마감: 11월 22일 마감, D-8"},
        }
        data.update(kw)
        return data

    def test_refresh_rewrites_subtitle_narration_and_metadata(self):
        out = ren.refresh_countdowns(self.queued_script(), self.TODAY)
        self.assertEqual(ren.dday_text(out, self.TODAY), "D-6")
        mid = out["scenes"][1]["subtitle"]
        self.assertIn("11월 22일, D-6", mid)
        self.assertNotIn("D-8", mid)
        self.assertIn("11월 22일 마감, D-6", out["scenes"][1]["narration"])
        self.assertNotIn("D-8", out["narration_full"])
        self.assertIn("D-6", out["metadata"]["youtube_title"])
        self.assertIn("D-6", out["metadata"]["description"])
        self.assertEqual(out["days_left"], 6)

    def test_refresh_does_not_mutate_original_script(self):
        original = self.queued_script()
        ren.refresh_countdowns(original, self.TODAY)
        self.assertIn("D-8", original["scenes"][1]["subtitle"], "원본 대본 파일을 건드리지 않는다")

    def test_build_facts_uses_rendered_day_and_keeps_it_in_three_lines(self):
        facts = ren.build_facts(self.queued_script(), self.TODAY)
        self.assertEqual(len(facts), 3)
        self.assertTrue(any("D-6" in f for f in facts), facts)
        self.assertFalse(any("D-8" in f for f in facts), facts)

    def test_build_facts_inserts_fresh_deadline_when_subtitle_has_none(self):
        script = self.queued_script(scenes=[
            {"time": "00~04초", "subtitle": "AI 과제 전형", "narration": "가"},
            {"time": "04~20초", "subtitle": "전형: 사전 과제\nAI 활용: 필수\n직무 무관", "narration": "나"},
            {"time": "20~28초", "subtitle": "프로필 링크", "narration": "다"},
        ])
        facts = ren.build_facts(script, self.TODAY)
        self.assertEqual(len(facts), 3, facts)
        self.assertIn("마감 2026-11-22 (D-6)", facts, facts)

    def test_narration_text_refreshes_saved_countdown(self):
        text = ren.narration_text(self.queued_script(), self.TODAY)
        self.assertIn("11월 22일 마감, D-6", text)
        self.assertNotIn("D-8", text)

    def test_build_model_matches_badge_and_facts(self):
        model = ren.build_model(self.queued_script(), self.TODAY)
        self.assertEqual(model["dday"], "D-6")
        self.assertEqual(model["status"], "모집중")
        self.assertTrue(any("D-6" in f for f in model["facts"]), model["facts"])

    def test_dday_text_today_is_dday(self):
        self.assertEqual(ren.dday_text(self.queued_script(deadline="2026-11-16"), self.TODAY), "D-DAY")
        out = ren.refresh_countdowns(self.queued_script(deadline="2026-11-16"), self.TODAY)
        self.assertIn("D-DAY", out["scenes"][1]["subtitle"])
        self.assertNotIn("D-8", out["narration_full"])

    def test_rolling_record_without_deadline_is_left_alone(self):
        script = self.queued_script(deadline=None, days_left=999,
                                    scenes=[{"time": "00~04초", "subtitle": "상시 모집", "narration": "상시 채용입니다."}])
        out = ren.refresh_countdowns(script, self.TODAY)
        self.assertEqual(out["scenes"][0]["narration"], "상시 채용입니다.")
        self.assertEqual(ren.dday_text(out, self.TODAY), "상시")


if __name__ == "__main__":
    unittest.main()


class TestMergedRowsExcluded(unittest.TestCase):
    """F3: 병합(merged_into)된 행은 쇼츠 소재가 아니다 — 대표행만 후보가 된다."""

    def test_candidates_exclude_merged_rows(self):
        merged_posting = posting(
            id="jobkorea:50326430", merged_into="wanted:wd390319",
            deadline="2026-11-20", status="open", ai_policy="required",
        )
        rep_posting = posting(id="wanted:wd390319", deadline="2026-11-20", status="open")
        merged_event = {
            "id": "wevity:dup", "type": "contest", "title": "병합된 공모전", "host": "호스트",
            "ai_usage": "required", "status": "open", "submit_deadline": "2026-11-20",
            "evidence": ["근거"], "merged_into": "wevity:rep",
        }
        rep_event = dict(merged_event, id="wevity:rep")
        rep_event.pop("merged_into")

        cands = gen.collect_candidates(
            [merged_posting, rep_posting], [merged_event, rep_event], set(), TODAY)
        ids = [c["record"]["id"] for c in cands]

        self.assertNotIn("jobkorea:50326430", ids, "병합된 채용 행은 후보가 아니다")
        self.assertNotIn("wevity:dup", ids, "병합된 이벤트 행은 후보가 아니다")
        self.assertIn("wanted:wd390319", ids, "대표행은 후보가 된다")
        self.assertIn("wevity:rep", ids, "이벤트 대표행은 후보가 된다")

    def test_is_live_rejects_merged_row(self):
        merged = posting(merged_into="wanted:wd390319", deadline="2026-11-20")
        self.assertFalse(gen.is_live(merged, TODAY), "병합된 행은 죽은 소재 취급")
        self.assertTrue(gen.is_live(posting(deadline="2026-11-20"), TODAY), "대표행 규칙은 그대로")
