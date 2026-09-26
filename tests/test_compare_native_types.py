"""Nhận diện thể loại video Compare Studio và bước render sau khi tạo.

Hai lỗi đã sửa:
- wildlife/mystery (HTML có `const SCENES =`) bị nhận là chalk, kinetic (`const BEATS =`)
  bị nhận là vox; sửa kịch bản của survival rơi xuống nhánh "so sánh" và dựng đè template.
- vox, newspaper, kinetic, wildlife, mystery bỏ qua cờ render khi tạo video.

Mọi test chạy trong thư mục tạm; không đụng compare_studio/videos thật.
"""
import asyncio
import json
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

from fastapi import FastAPI
from fastapi.testclient import TestClient

from bkt_web import compare_native as cn


class DetectVideoTypeTests(unittest.TestCase):
    def test_explicit_type_beats_html_markers(self):
        cases = [
            # (slug, meta, spec, html, expected) — các ca từng bị nhận nhầm
            ("wildlife-orca-vi", {"type": "wildlife"}, None, "const SCENES = [];", "wildlife"),
            ("bi-an-chuyen-bay-mh370", {"type": "mystery"}, None, "const SCENES = [];", "mystery"),
            ("kinetic-sample", {"template": "kinetic"}, None, "const BEATS = [];", "kinetic"),
            ("newspaper-sample", {"template": "newspaper"}, None, "const ACTS = [];", "newspaper"),
        ]
        for slug, meta, spec, html, expected in cases:
            with self.subTest(slug=slug):
                self.assertEqual(cn.detect_video_type(slug, meta, spec, html), expected)

    def test_all_eleven_types_by_declaration(self):
        for kind in cn.VIDEO_TYPES:
            with self.subTest(kind=kind):
                self.assertEqual(cn.detect_video_type("x", {"type": kind}, None, "const SCENES = [];"), kind)

    def test_category_config_and_prefix_fallbacks(self):
        self.assertEqual(cn.detect_video_type("a", {"category": "dark-cyber-kinetic"}), "kinetic")
        self.assertEqual(cn.detect_video_type("a", {"category": "vox-collage"}), "vox")
        self.assertEqual(cn.detect_video_type("a", {"category": "retro-newspaper"}), "newspaper")
        self.assertEqual(cn.detect_video_type("a", None, {"survivalConfig": {"tiers": []}}), "survival")
        self.assertEqual(cn.detect_video_type("a", {"folkloreConfig": {}}), "folklore")
        self.assertEqual(cn.detect_video_type("dong-vat-ho", None, None, "const SCENES = [];"), "wildlife")
        self.assertEqual(cn.detect_video_type("survival-organs-vi", None, None, "<div></div>"), "survival")

    def test_html_markers_only_as_last_resort(self):
        self.assertEqual(cn.detect_video_type("x", html="<div class='viewfinder-grid'></div> const SCENES = [];"), "wildlife")
        self.assertEqual(cn.detect_video_type("x", html="<div class='cyber-ambient-bg'></div> const BEATS = [];"), "kinetic")
        self.assertEqual(cn.detect_video_type("x", html="const SCENES = [];"), "chalk")
        self.assertEqual(cn.detect_video_type("x", html="const BEATS = [];"), "vox")
        self.assertEqual(cn.detect_video_type("tcp-vs-udp", html="<div id='line-1'></div>"), "compare")


class TempVideosMixin:
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        root = Path(self._tmp.name)
        self.videos = root / "videos"
        self.videos.mkdir()
        (root / "tools").mkdir()
        self._patches = [
            mock.patch.object(cn, "VIDEOS_DIR", self.videos),
            mock.patch.object(cn, "COMPARE_DIR", root),
            mock.patch.object(cn, "TOOLS_DIR", root / "tools"),
        ]
        for p in self._patches:
            p.start()
        app = FastAPI()
        app.include_router(cn.compare_native_router)
        self.client = TestClient(app)

    def tearDown(self):
        for p in self._patches:
            p.stop()
        self._tmp.cleanup()

    def make_video(self, slug, files):
        d = self.videos / slug
        for rel, content in files.items():
            path = d / rel
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content if isinstance(content, str) else json.dumps(content), encoding="utf-8")
        return d


class EditScriptTypeTests(TempVideosMixin, unittest.TestCase):
    def test_survival_without_declared_type_is_not_rebuilt_as_compare(self):
        html = '<div class="scanner-card"></div><div id="caption-text" class="caption-text">old</div>'
        d = self.make_video("survival-demo-vi", {
            "index.html": html,
            "spec.json": {"survivalConfig": {"tiers": [{"id": 1, "caption": "a"}]}},
        })
        with mock.patch.object(cn, "bridge") as bridge:
            res = self.client.post("/api/videos/survival-demo-vi/edit-script", json={"captions": ["mở", "tầng 1"]})
        self.assertEqual(res.status_code, 200, res.text)
        bridge.assert_not_called()  # không gọi compare.rebuild
        self.assertIn("scanner-card", (d / "index.html").read_text(encoding="utf-8"))
        spec = json.loads((d / "spec.json").read_text(encoding="utf-8"))
        self.assertEqual(spec["survivalConfig"]["tiers"][0]["caption"], "tầng 1")

    def test_vox_newspaper_kinetic_edit_is_refused_not_overwritten(self):
        for slug, meta in (("vox-a", {"template": "vox"}), ("newspaper-a", {"template": "newspaper"}),
                           ("kinetic-a", {"template": "kinetic"})):
            with self.subTest(slug=slug):
                d = self.make_video(slug, {"meta.json": meta, "index.html": "<p>original</p>"})
                with mock.patch.object(cn, "bridge") as bridge:
                    res = self.client.post(f"/api/videos/{slug}/edit-script", json={"captions": ["x"] * 10})
                self.assertEqual(res.status_code, 400)
                bridge.assert_not_called()
                self.assertEqual((d / "index.html").read_text(encoding="utf-8"), "<p>original</p>")
                self.assertFalse((d / "spec.json").exists())

    def test_detail_uses_declared_type(self):
        self.make_video("wildlife-x-vi", {
            "meta.json": {"type": "wildlife", "wildlifeConfig": {"scenes": [{"line": "Một", "badge": "BÁ CHỦ"}]}},
            "index.html": "const SCENES = [];",
        })
        detail = self.client.get("/api/videos/wildlife-x-vi").json()
        self.assertEqual(detail["type"], "wildlife")
        self.assertEqual(detail["spec"]["type"], "wildlife")
        self.assertEqual(detail["script"][0]["beat"], "BÁ CHỦ")


class RenderAfterCreateTests(TempVideosMixin, unittest.TestCase):
    """Bước RENDER_IF_MISSING sau task create khi người dùng tích Render."""

    def run_create(self, slug, create_script, render_script):
        # Script "tạo" giả: dựng thư mục video + package.json có lệnh render giả.
        pkg = {"name": slug, "scripts": {"render": render_script}}
        create = (
            f"mkdir -p videos/{slug}/renders && "
            f"printf '%s' '{json.dumps(pkg)}' > videos/{slug}/package.json && {create_script}"
        )
        with mock.patch.object(cn, "_create_command", return_value=["sh", "-c", create]):
            run = cn.start_run(slug, "create", {"render": True, "spec": {"type": "vox"}})
        deadline = time.time() + 30
        while not run["done"] and time.time() < deadline:
            time.sleep(0.05)
        self.assertTrue(run["done"], "tác vụ không kết thúc")
        return run, [e["line"] for e in run["lines"]]

    def test_renders_when_create_script_skipped_it(self):
        run, lines = self.run_create(
            "vox-demo-vi", "true", "mkdir -p renders && echo rendered > renders/out.mp4 && echo RENDER-RAN",
        )
        self.assertEqual(run["code"], 0, lines)
        self.assertTrue(any("tự chạy npm run render" in l for l in lines), lines)
        self.assertTrue(any("RENDER-RAN" in l for l in lines), lines)
        self.assertTrue((self.videos / "vox-demo-vi" / "renders" / "out.mp4").exists())

    def test_skips_when_create_script_already_rendered(self):
        run, lines = self.run_create(
            "chalk-demo-vi", "echo x > videos/chalk-demo-vi/renders/own.mp4", "echo RENDER-RAN",
        )
        self.assertEqual(run["code"], 0, lines)
        self.assertTrue(any("không render lại" in l for l in lines), lines)
        self.assertFalse(any("RENDER-RAN" in l for l in lines), lines)

    def test_old_render_does_not_count(self):
        d = self.make_video("mystery-demo-vi", {"renders/old.mp4": "old"})
        old = d / "renders" / "old.mp4"
        past = time.time() - 3600
        import os
        os.utime(old, (past, past))
        run, lines = self.run_create(
            "mystery-demo-vi", "true", "echo new > renders/new.mp4 && echo RENDER-RAN",
        )
        self.assertEqual(run["code"], 0, lines)
        self.assertTrue(any("RENDER-RAN" in l for l in lines), lines)

    def test_no_render_step_without_render_flag(self):
        slug = "kinetic-demo-vi"
        with mock.patch.object(cn, "_create_command", return_value=["sh", "-c", f"mkdir -p videos/{slug}"]):
            run = cn.start_run(slug, "create", {"render": False, "spec": {"type": "kinetic"}})
        deadline = time.time() + 30
        while not run["done"] and time.time() < deadline:
            time.sleep(0.05)
        self.assertEqual(run["code"], 0)
        self.assertFalse(any("render" in e["line"] for e in run["lines"]))

    def test_failed_create_does_not_render(self):
        slug = "wildlife-demo-vi"
        with mock.patch.object(cn, "_create_command", return_value=["sh", "-c", "echo boom >&2; exit 3"]):
            run = cn.start_run(slug, "create", {"render": True, "spec": {"type": "wildlife"}})
        deadline = time.time() + 30
        while not run["done"] and time.time() < deadline:
            time.sleep(0.05)
        self.assertEqual(run["code"], 3)
        self.assertFalse(any("npm run render" in e["line"] for e in run["lines"]))


class ChangeImageTests(TempVideosMixin, unittest.TestCase):
    def test_change_image_upload_base64_and_chalk_detail(self):
        # 1x1 transparent PNG in base64
        tiny_png_b64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        slug = "chalk-test-vi"
        self.make_video(slug, {
            "meta.json": {"type": "chalk"},
            "spec.json": {
                "scenes": [
                    {"id": "scene-1", "line": "Line 1"},
                    {"id": "scene-2", "line": "Line 2"},
                ]
            }
        })

        # Call change-image with upload
        res = self.client.post(f"/api/videos/{slug}/change-image", json={
            "target": "scene-2",
            "type": "upload",
            "data": tiny_png_b64
        })
        self.assertEqual(res.status_code, 200, res.text)
        data = res.json()
        self.assertTrue(data.get("ok"))
        self.assertIn("scene-2.jpg?t=", data.get("imageUrl", ""))

        target_file = self.videos / slug / "assets" / "images" / "scene-2.jpg"
        self.assertTrue(target_file.is_file())

        # Verify video_detail now finds scene-2.jpg for scene 2
        detail_res = self.client.get(f"/api/videos/{slug}")
        self.assertEqual(detail_res.status_code, 200)
        detail_data = detail_res.json()
        script = detail_data.get("script") or []
        self.assertEqual(len(script), 2)
        self.assertIn("scene-2.jpg", script[1].get("image") or "")

    def test_change_image_local_generated_gallery(self):
        slug = "folklore-test-vi"
        self.make_video(slug, {
            "meta.json": {"type": "folklore"},
            "spec.json": {
                "folkloreConfig": {
                    "scenes": [{"line": "A", "shot": 1}],
                    "shots": [{"id": 1}]
                }
            }
        })

        # Mock a file in GENERATED_IMAGES_DIR
        gen_dir = Path(self._tmp.name) / "static" / "generated_images"
        gen_dir.mkdir(parents=True, exist_ok=True)
        test_img = gen_dir / "ai_sample.jpg"
        test_img.write_bytes(b"\xff\xd8\xff\xe0" + b"\x00" * 20)

        with mock.patch.object(cn, "GENERATED_IMAGES_DIR", gen_dir):
            res = self.client.post(f"/api/videos/{slug}/change-image", json={
                "target": "scene-1",
                "type": "url",
                "url": "/static/generated_images/ai_sample.jpg"
            })
            self.assertEqual(res.status_code, 200, res.text)
            self.assertTrue(res.json().get("ok"))
            self.assertTrue((self.videos / slug / "assets" / "images" / "scene-1.jpg").is_file())


class VideoSummaryLangTest(TempVideosMixin, unittest.TestCase):
    def test_declared_lang_beats_hardcoded_html_lang(self):
        # Template science ghi cứng <html lang="vi">; video Matrix tiếng Đức khai báo lang=de.
        d = self.videos / "science-space-01-e6a5b0cc"
        d.mkdir()
        config = {"lang": "de", "dialogues": [{"text": "Hallo"}, {"text": "Welt"}]}
        (d / "meta.json").write_text(json.dumps({"lang": "de", "scienceConfig": config}))
        (d / "spec.json").write_text(json.dumps({"lang": "de", "scienceConfig": config}))
        (d / "index.html").write_text('<html lang="vi"><body></body></html>')
        summary = asyncio.run(cn.video_summary("science-space-01-e6a5b0cc"))
        self.assertEqual(summary["lang"], "de")


if __name__ == "__main__":
    unittest.main()
