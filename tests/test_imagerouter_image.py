"""Dự phòng ImageRouter (bkt_web/imagerouter_image.py) trong luồng cf_image_fallback.

Không gọi API thật: httpx.MockTransport đóng vai ImageRouter và Cloudflare Worker.
Kiểm tra: ImageRouter vẽ trước và ghi đúng nguồn, model sau khi model đầu lỗi, trần chi
phí ngày, lỗi khoá/credit nghỉ cả tài khoản rồi rơi xuống Cloudflare.
"""
import base64
import io
import json
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

import httpx
from PIL import Image

from bkt_web import cf_image_fallback as cf
from bkt_web import image_routes
from bkt_web import imagerouter_image as ir

PROMPT = "Documentary photo, 1970s scientists around a glowing drilling machine in Siberia at night"


def _png(w=1088, h=1920) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (w, h), (40, 60, 80)).save(buf, format="PNG")
    return buf.getvalue()


class PromptTest(unittest.TestCase):
    def test_negative_text_becomes_prompt_sentence(self):
        out = ir.with_negative(PROMPT, "text, letters, watermark")
        self.assertTrue(out.startswith(PROMPT))
        self.assertIn("no text", out)
        self.assertEqual(ir.with_negative(PROMPT, "blurry"), PROMPT)

    def test_clean_prompt_drops_what_flux_draws_as_fake_text(self):
        matrix = ("Subtle transition from a silhouette to the misty dark outside, Documentary evidence board, "
                  "archival paper, restrained noir lighting, sensational., cinematic documentary still, "
                  "camera: editorial medium shot, palette: primary #111318, text #F2EEE6, vertical 9:16 composition, "
                  "documentary visual, no embedded captions")
        out = ir.clean_prompt(matrix)
        self.assertTrue(out.startswith("Subtle transition from a silhouette to the misty dark outside, restrained noir"))
        for gone in ("evidence", "archival", "#111318", "palette", "9:16", "camera:", "captions", ".,"):
            self.assertNotIn(gone, out)
        for kept in ("cinematic documentary still", "editorial medium shot", "documentary visual"):
            self.assertIn(kept, out)
        # Chủ thể (cụm đầu) luôn giữ, kể cả khi nó là vật mang chữ.
        self.assertTrue(ir.clean_prompt("An old newspaper on a desk, text #fff").startswith("An old newspaper on a desk"))

    def test_text_subjects_are_detected_from_the_subject_phrase(self):
        self.assertTrue(ir.subject_needs_text("Archival geological map overlaid with parish death ledger entries, noir"))
        self.assertTrue(ir.subject_needs_text("Fehlermeldungen auf einem Laborcomputer, während eine Zentrifuge"))
        self.assertTrue(ir.subject_needs_text("Investment dashboard with bar charts, dark"))
        # Chỉ xét cụm chủ thể: phong cách "archival paper" phía sau không tính.
        self.assertFalse(ir.subject_needs_text("Solitary hawthorn tree against a stormy sky, archival paper, map style"))
        self.assertFalse(ir.subject_needs_text("Dramatische Nahaufnahme der rotierenden Venus"))

    def test_long_prompt_keeps_no_text_suffix(self):
        out = ir.with_negative("word " * 1000, "text")
        self.assertLessEqual(len(out), ir.MAX_PROMPT_CHARS)
        self.assertTrue(out.endswith("watermark or logo."))


GERMAN = "Dichte Atmosphärenschichten der Venus wälzen sich gegen die Drehrichtung, deep blacks"
ENGLISH = "Dense atmospheric layers of Venus churn against the direction of rotation, deep blacks"


def _gemini_reply(text, status=200):
    if status != 200:
        return httpx.Response(status, json={"error": {"message": "quota"}})
    return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": text}]}}]})


class TranslateTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.patches = [
            patch.object(ir, "TRANSLATE_CACHE_FILE", Path(self.tmp.name) / "tr.json"),
            patch.object(ir, "_translate_cache", None),
            patch.object(ir, "_translate_cooldown", 0.0),
            patch.object(ir, "TRANSLATE_ENABLED", True),
            patch.object(ir, "_gemini_key", lambda: "g-key"),
        ]
        for p in self.patches:
            p.start()
        self.requests = []

    def tearDown(self):
        for p in reversed(self.patches):
            p.stop()
        self.tmp.cleanup()

    def _client(self, reply):
        def handler(request):
            self.requests.append(request)
            assert "generativelanguage" in str(request.url) and request.headers["x-goog-api-key"] == "g-key"
            return reply()
        return httpx.Client(transport=httpx.MockTransport(handler))

    def test_detects_foreign_prompts_only(self):
        self.assertTrue(ir.needs_translation(GERMAN))
        self.assertTrue(ir.needs_translation("Simulation magnetischer Feldlinien, die wie Bremsseile am Planeten"))
        self.assertTrue(ir.needs_translation("서울의 밤거리, neon"))
        self.assertFalse(ir.needs_translation("A lighthouse in a storm, café lights"))
        self.assertFalse(ir.needs_translation("Soldiers who die in the war, dramatic"))

    def test_translates_once_then_uses_cache(self):
        client = self._client(lambda: _gemini_reply(ENGLISH))
        self.assertEqual(ir.to_english(GERMAN, client), ENGLISH)
        self.assertEqual(ir.to_english(GERMAN, client), ENGLISH)
        self.assertEqual(len(self.requests), 1)
        self.assertEqual(ir.to_english("Documentary photo, cinematic", client), "Documentary photo, cinematic")
        self.assertEqual(len(self.requests), 1)   # tiếng Anh thì không gọi Gemini
        self.assertIn(ENGLISH, (Path(self.tmp.name) / "tr.json").read_text(encoding="utf-8"))

    def test_gemini_error_sends_original_and_rests(self):
        client = self._client(lambda: _gemini_reply("", status=429))
        self.assertEqual(ir.to_english(GERMAN, client), GERMAN)
        self.assertGreater(ir._translate_cooldown, time.time() + 60)
        self.assertEqual(ir.to_english(GERMAN, client), GERMAN)
        self.assertEqual(len(self.requests), 1)   # đang nghỉ thì không gọi lại


class ImageRouterFallbackTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.patches = [
            patch("bkt_web.image_routes.DB_PATH", root / "queue.db"),
            patch("bkt_web.image_routes.GENERATED_DIR", root / "generated"),
            patch("bkt_web.image_routes.LEGACY_QUEUE_FILE", root / "missing.json"),
            patch("bkt_web.image_routes._BRIDGE_ROOT", root / "bridge"),
            patch.object(cf, "_token", lambda: "cf-token"),
            patch.object(cf, "_cooldown_until", 0.0),
            patch.object(cf, "antigravity_blocked_until", lambda now=None: time.time() + 1800),
            patch.object(ir, "_token", lambda: "ir-token"),
            patch.object(ir, "ENABLED", True),
            patch.object(ir, "MODELS", ["m/first", "m/second"]),
            patch.object(ir, "DAILY_USD", 3.0),
            patch.object(ir, "SPEND_FILE", root / "spend.json"),
            patch.object(ir, "_account_cooldown", 0.0),
            patch.dict(ir._model_cooldown, clear=True),
            patch.object(ir, "TRANSLATE_CACHE_FILE", root / "tr.json"),
            patch.object(ir, "_translate_cache", None),
            patch.object(ir, "_translate_cooldown", 0.0),
            patch.object(ir, "_gemini_key", lambda: "g-key"),
        ]
        for p in self.patches:
            p.start()
        image_routes.GENERATED_DIR.mkdir()
        image_routes.init_image_tables()
        cf._in_flight.clear()
        self.calls = []

    def tearDown(self):
        for p in reversed(self.patches):
            p.stop()
        cf._in_flight.clear()
        self.tmp.cleanup()

    def _insert(self, task_id, prompt=PROMPT, age_minutes=0):
        conn = image_routes._db()
        conn.execute(
            """INSERT INTO image_queue (id, prompt, negative_prompt, aspect_ratio, status, engine,
                                        created_at, created_ts, updated_at)
               VALUES (?, ?, 'text, watermark', '9:16', 'pending', 'antigravity', 'now', ?, 'now')""",
            (task_id, prompt, int(time.time() - age_minutes * 60)),
        )
        conn.commit()
        conn.close()

    def _task(self, task_id):
        conn = image_routes._db()
        try:
            row = conn.execute(f"SELECT {image_routes.QUEUE_COLUMNS} FROM image_queue WHERE id=?", (task_id,)).fetchone()
        finally:
            conn.close()
        return image_routes._queue_row_to_dict(row)

    def _client(self, router):
        """router(model) -> (status, json body) cho ImageRouter; Cloudflare luôn trả ảnh vuông."""
        def handler(request):
            if "generativelanguage" in str(request.url):
                self.calls.append(("gemini", None))
                return _gemini_reply(ENGLISH)
            if "imagerouter" in str(request.url):
                body = json.loads(request.content)
                self.calls.append(("ir", body))
                assert request.headers["Authorization"] == "Bearer ir-token"
                status, payload = router(body["model"])
                return httpx.Response(status, json=payload)
            self.calls.append(("cf", json.loads(request.content)))
            return httpx.Response(200, content=_png(1024, 1024), headers={"content-type": "image/png"})
        return httpx.Client(transport=httpx.MockTransport(handler))

    @staticmethod
    def _ok(cost=0.0006):
        return 200, {"data": [{"b64_json": base64.b64encode(_png()).decode()}], "cost": cost}

    def test_imagerouter_draws_first_and_importer_records_source(self):
        self._insert("task_1_ir")
        self.assertEqual(cf.run_once(client=self._client(lambda m: self._ok())), 1)
        self.assertEqual([c[0] for c in self.calls], ["ir"])
        body = self.calls[0][1]
        self.assertEqual((body["model"], body["size"]), ("m/first", "1088x1920"))
        self.assertIn("no text", body["prompt"])
        self.assertTrue(body["prompt"].startswith(PROMPT))   # prompt đầy đủ, không rút gọn kiểu SDXL

        image_routes._bridge_auto_import()
        task = self._task("task_1_ir")
        self.assertEqual(task["status"], "completed")
        self.assertEqual(task["model"], "imagerouter:m/first")
        self.assertTrue(task["image_filename"].startswith("imagerouter_"))
        sidecar = json.loads((image_routes.GENERATED_DIR / task["image_filename"]).with_suffix(".json").read_text())
        self.assertEqual(sidecar["engine"], "imagerouter")
        self.assertEqual(sidecar["tags"], "imagerouter,fallback")
        with Image.open(image_routes.GENERATED_DIR / task["image_filename"]) as im:
            self.assertEqual(im.size, (1080, 1920))
        self.assertAlmostEqual(ir.spent_today(), 0.0006)

    def test_foreign_prompt_is_translated_before_drawing(self):
        self._insert("task_1_de", prompt=GERMAN)
        cf.run_once(client=self._client(lambda m: self._ok()))
        self.assertEqual([c[0] for c in self.calls], ["gemini", "ir"])
        self.assertTrue(self.calls[1][1]["prompt"].startswith("Dense atmospheric layers of Venus"))
        image_routes._bridge_auto_import()
        sidecar = json.loads((image_routes.GENERATED_DIR / self._task("task_1_de")["image_filename"])
                             .with_suffix(".json").read_text())
        self.assertTrue(sidecar["prompt_sent"].startswith("Dense atmospheric"))
        self.assertTrue(sidecar["prompt"].startswith("Dichte"))   # prompt gốc của task giữ nguyên

    def test_text_subject_waits_for_antigravity_until_text_deadline(self):
        self._insert("task_1_map", prompt="Old parish map with ledger entries, noir lighting", age_minutes=200)
        self._insert("task_2_tree", age_minutes=5)
        self._insert("task_3_old_map", prompt="Old parish map with ledger entries, noir lighting",
                     age_minutes=cf.TEXT_MAX_WAIT_MINUTES + 5)
        self.assertEqual([t["id"] for t in cf.eligible_tasks(5)], ["task_3_old_map", "task_2_tree"])

    def test_model_error_tries_next_model(self):
        self._insert("task_1_next")
        router = lambda m: (400, {"error": {"message": "invalidWidth"}}) if m == "m/first" else self._ok(0.0019)
        cf.run_once(client=self._client(router))
        self.assertEqual([c[1]["model"] for c in self.calls], ["m/first", "m/second"])
        image_routes._bridge_auto_import()
        self.assertEqual(self._task("task_1_next")["model"], "imagerouter:m/second")
        self.assertIn("m/first", ir.status()["model_cooldown_until"])

    def test_no_credit_falls_back_to_cloudflare_and_rests_account(self):
        self._insert("task_1_credit")
        cf.run_once(client=self._client(lambda m: (402, {"error": {"message": "Insufficient credits"}})))
        self.assertEqual([c[0] for c in self.calls], ["ir", "cf"])   # không thử model thứ hai
        self.assertGreater(ir._account_cooldown, time.time() + 50 * 60)
        self.assertFalse(ir.available())
        image_routes._bridge_auto_import()
        self.assertEqual(self._task("task_1_credit")["model"], "cf-worker")

    def test_daily_cap_skips_imagerouter(self):
        self._insert("task_1_cap")
        ir._add_spend(3.0, "m/first")
        cf.run_once(client=self._client(lambda m: self._ok()))
        self.assertEqual([c[0] for c in self.calls], ["cf"])

    def test_both_failing_returns_task_to_antigravity(self):
        self._insert("task_1_both")
        with patch.object(cf, "_token", lambda: ""):
            cf.run_once(client=self._client(lambda m: (500, {"error": {"message": "provider down"}})))
        task = self._task("task_1_both")
        self.assertEqual(task["status"], "pending")
        self.assertIn("ImageRouter", task["error_message"])
        self.assertEqual(list(image_routes._bridge_dirs()["outbox"].iterdir()), [])

    def test_no_provider_ready_does_nothing(self):
        self._insert("task_1_idle")
        with patch.object(cf, "_token", lambda: ""), patch.object(ir, "_token", lambda: ""):
            self.assertEqual(cf.run_once(client=self._client(lambda m: self._ok())), 0)
        self.assertEqual(self.calls, [])


if __name__ == "__main__":
    unittest.main()
