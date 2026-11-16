"""fetch_news.py 회귀 테스트 — 네트워크 없이 수집 결과를 흉내 내 멱등성과 종료 코드를 본다.

    python3 -m unittest discover -s collector/tests -v      (또는 리포 루트에서 python3 -m unittest)
"""
import importlib.util
import json
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]        # collector/
spec = importlib.util.spec_from_file_location("fetch_news", ROOT / "fetch_news.py")
news = importlib.util.module_from_spec(spec)
spec.loader.exec_module(news)

KST = timezone(timedelta(hours=9))


def row(head, link, when="2026-11-16"):
    return {
        "head": head, "body": "", "publisher": "테스트일보",
        "date": datetime.fromisoformat(when + "T09:00:00+09:00"),
        "score": 10.0, "topic": "AI 채용", "tag": "정책", "link": link,
        "localized": True, "tokens": {head},
    }


class FetchNewsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        base = Path(self.tmp.name)
        self.news_path = base / "news.json"
        self.meta_path = base / "meta.json"
        self.news_path.write_text(json.dumps([
            {"id": "news-policy-01", "topic": "구글", "tag": "허용", "content": "손으로 정리한 항목",
             "date": "2026-05", "source": "리서치"},
        ], ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        self.meta_path.write_text(json.dumps({"counts": {"news": 1}}, ensure_ascii=False), encoding="utf-8")
        self.patches = [
            mock.patch.object(news, "NEWS_PATH", self.news_path),
            mock.patch.object(news, "META_PATH", self.meta_path),
        ]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()
        self.tmp.cleanup()

    def run_with(self, rows, failures=(), argv=()):
        with mock.patch.object(news, "collect", return_value=(list(rows), list(failures))):
            return news.main(list(argv))

    def test_stable_id_follows_link(self):
        a = news.stable_id("https://example.com/1", "제목")
        b = news.stable_id("https://example.com/1", "제목이 바뀌어도")
        c = news.stable_id("https://example.com/2", "제목")
        self.assertTrue(a.startswith("news-feed-"))
        self.assertEqual(a, b, "같은 기사는 회차가 달라도 같은 id")
        self.assertNotEqual(a, c)

    def test_write_then_idempotent(self):
        rows = [row("AI 채용 과제 도입", "https://example.com/a"), row("AI 해커톤 개최", "https://example.com/b")]
        self.assertEqual(self.run_with(rows), 0)
        first = self.news_path.read_bytes()
        saved = json.loads(first)
        self.assertEqual(len(saved), 3, "수집 항목 2 + 큐레이션 1")
        self.assertEqual(saved[-1]["id"], "news-policy-01", "큐레이션 항목은 뒤에 그대로")
        self.assertEqual(json.loads(self.meta_path.read_text())["counts"]["news"], 3)

        self.assertEqual(self.run_with(rows), 0, "같은 결과를 다시 받아도 성공")
        self.assertEqual(self.news_path.read_bytes(), first, "변경 없으면 파일을 다시 쓰지 않는다(멱등)")
        self.assertEqual(self.run_with(rows, argv=["--check"]), 0, "--check: 최신이면 exit 0")

    def test_changed_rows_are_written_and_check_flags_them(self):
        self.assertEqual(self.run_with([row("AI 채용 과제 도입", "https://example.com/a")]), 0)
        self.assertEqual(self.run_with([row("AI 면접 확산", "https://example.com/c")], argv=["--check"]), 1,
                         "--check: 달라지면 exit 1")
        self.assertEqual(self.run_with([row("AI 면접 확산", "https://example.com/c")]), 0)
        saved = json.loads(self.news_path.read_text())
        self.assertEqual(saved[0]["content"], "AI 면접 확산")

    def test_empty_feed_keeps_old_file_unless_every_source_fails(self):
        self.assertEqual(self.run_with([row("AI 채용 과제 도입", "https://example.com/a")]), 0)
        before = self.news_path.read_bytes()
        self.assertEqual(self.run_with([], failures=["gnews-kr-hiring: timeout"]), 0, "일부 소스만 실패하면 성공")
        self.assertEqual(self.news_path.read_bytes(), before, "0건이면 기존 파일을 덮어쓰지 않는다")
        self.assertEqual(self.run_with([], failures=["%s: down" % s["id"] for s in news.SOURCES]), 1,
                         "전 소스 실패는 오류로 알린다")

    def test_dry_run_never_writes(self):
        before = self.news_path.read_bytes()
        self.assertEqual(self.run_with([row("AI 채용 과제 도입", "https://example.com/a")], argv=["--dry-run"]), 0)
        self.assertEqual(self.news_path.read_bytes(), before)


if __name__ == "__main__":
    unittest.main()
