"""Stock video (PLAN_VARIANT_V2_COMPLETION WS-E): clip của acc A không bao giờ sang acc B, kể cả qua provider khác."""
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from bkt_web import stock_video


def make_clip(path: Path, source: str, size: str = "360x640", crf: int = 23, seconds: int = 6) -> Path:
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", f"{source}=size={size}:rate=25", "-t", str(seconds),
                    "-pix_fmt", "yuv420p", "-c:v", "libx264", "-crf", str(crf), str(path)], check=True)
    return path


@unittest.skipUnless(shutil.which("ffmpeg"), "needs ffmpeg")
class StockVideoTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="stock-test-"))
        self.conn = stock_video.connect(self.tmp / "ledger.db")
        self.clip_a = make_clip(self.tmp / "a.mp4", "testsrc2")
        # Cùng footage, provider khác: đổi cỡ và nén lại → khác byte, cùng hình.
        self.clip_a2 = self.tmp / "a2.mp4"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(self.clip_a), "-vf", "scale=540:960", "-c:v", "libx264", "-crf", "32",
                        str(self.clip_a2)], check=True)
        self.clip_b = make_clip(self.tmp / "b.mp4", "mandelbrot")

    def tearDown(self):
        self.conn.close()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def cand(self, provider, clip_id):
        return {"provider": provider, "provider_clip_id": clip_id, "canonical_url": f"https://{provider}.test/{clip_id}",
                "license": stock_video.LICENSES[provider], "author": "someone", "duration": 6.0}

    def test_clip_of_one_account_is_refused_for_another_even_across_providers(self):
        fp_a = stock_video.fingerprint(self.clip_a)
        self.assertEqual(len(fp_a["frames"]), stock_video.FRAME_COUNT)
        stock_video.assign(self.conn, self.cand("pexels", "1"), fp_a, account=1, segment=[0, 5])
        # Cùng acc: dùng lại được, chỉ thêm đoạn.
        self.assertEqual(stock_video.conflicts(self.conn, self.cand("pexels", "1"), fp_a, account=1), [])
        stock_video.assign(self.conn, self.cand("pexels", "1"), fp_a, account=1, segment=[5, 6])
        # Acc khác: cùng id, cùng byte, hay cùng footage từ Pixabay đều bị chặn.
        self.assertEqual([c["reason"] for c in stock_video.conflicts(self.conn, self.cand("pexels", "1"), fp_a, account=2)], ["same_clip"])
        self.assertEqual([c["reason"] for c in stock_video.conflicts(self.conn, self.cand("pixabay", "9"), fp_a, account=2)], ["same_bytes"])
        fp_a2 = stock_video.fingerprint(self.clip_a2)
        self.assertNotEqual(fp_a2["sha256"], fp_a["sha256"])
        self.assertEqual([c["reason"] for c in stock_video.conflicts(self.conn, self.cand("pixabay", "77"), fp_a2, account=2)], ["same_footage"])
        # Footage khác thì được.
        fp_b = stock_video.fingerprint(self.clip_b)
        self.assertEqual(stock_video.conflicts(self.conn, self.cand("pixabay", "78"), fp_b, account=2), [])
        with self.assertRaises(ValueError):
            stock_video.assign(self.conn, self.cand("pexels", "1"), fp_a, account=2)

    def test_fetch_is_off_by_default_and_skips_taken_or_short_clips(self):
        with mock.patch.dict(os.environ, {"TOKMATRIX_STOCK_VIDEO": "0"}):
            self.assertIsNone(stock_video.fetch_for_scene("x", 1, self.tmp / "out.mp4", conn=self.conn))
        stock_video.assign(self.conn, self.cand("pexels", "1"), stock_video.fingerprint(self.clip_a), account=1)
        candidates = [
            {**self.cand("pexels", "2"), "duration": 2.0, "download_url": "short"},
            {**self.cand("pixabay", "3"), "download_url": "same-footage"},
            {**self.cand("pixabay", "4"), "download_url": "fresh"},
        ]
        files = {"short": self.clip_b, "same-footage": self.clip_a2, "fresh": self.clip_b}
        downloads = []

        def fake_download(url, dest, timeout=120):
            downloads.append(url)
            shutil.copy(files[url], dest)

        with mock.patch.dict(os.environ, {"TOKMATRIX_STOCK_VIDEO": "1"}), \
                mock.patch.object(stock_video, "search", return_value=candidates), \
                mock.patch.object(stock_video, "_download", side_effect=fake_download):
            out = stock_video.fetch_for_scene("snow leopard", 2, self.tmp / "scene-1.mp4", conn=self.conn)
        self.assertEqual(downloads, ["same-footage", "fresh"], "short clip is never downloaded")
        self.assertEqual((out["provider"], out["provider_clip_id"]), ("pixabay", "4"))
        self.assertTrue((self.tmp / "scene-1.mp4").is_file())
        self.assertNotIn("download_url", out)
        row = self.conn.execute("SELECT owner_account, license FROM clips WHERE provider_clip_id='4'").fetchone()
        self.assertEqual((row["owner_account"], row["license"]), (2, "Pixabay Content License"))


class ProviderParsingTest(unittest.TestCase):
    def test_pexels_and_pixabay_results_are_normalised_and_prefer_portrait_hd(self):
        pexels = {"videos": [{"id": 11, "url": "https://www.pexels.com/video/11/", "duration": 12, "user": {"name": "Ann"},
                              "video_files": [
                                  {"file_type": "video/mp4", "link": "https://p/4k", "width": 2160, "height": 3840},
                                  {"file_type": "video/mp4", "link": "https://p/hd", "width": 1080, "height": 1920},
                                  {"file_type": "video/mp4", "link": "https://p/land", "width": 1920, "height": 1080}]}]}
        pixabay = {"hits": [{"id": 22, "pageURL": "https://pixabay.com/videos/id-22/", "duration": 9, "user": "Bo",
                             "videos": {"large": {"url": "https://x/large", "width": 1920, "height": 1080},
                                        "small": {"url": "https://x/small", "width": 640, "height": 360}}}]}
        with mock.patch.object(stock_video, "_get_json", side_effect=[pexels, pixabay]) as get, \
                mock.patch.object(stock_video, "api_key", return_value="k"):
            found = stock_video.search("orca", per_page=5)
        self.assertEqual([(c["provider"], c["download_url"]) for c in found], [("pexels", "https://p/hd"), ("pixabay", "https://x/large")])
        self.assertEqual(found[0]["license"], "Pexels License")
        self.assertIn("orientation=portrait", get.call_args_list[0].args[0])
        self.assertEqual(get.call_args_list[0].args[1], {"Authorization": "k"})

    def test_provider_without_key_is_skipped(self):
        with mock.patch.object(stock_video, "api_key", return_value=""), mock.patch.object(stock_video, "_get_json") as get:
            self.assertEqual(stock_video.search("orca"), [])
        get.assert_not_called()


if __name__ == "__main__":
    unittest.main()
