import subprocess
import tempfile
import unittest
from pathlib import Path

from bkt_web.remake_vector_wide import FG_W, H, W, _panel_html, default_tip, widen


class WideTest(unittest.TestCase):
    def test_panel_html_escapes_text(self):
        html = _panel_html("<b>Title</b>", "a & b")
        self.assertIn("&lt;b&gt;Title&lt;/b&gt;", html)
        self.assertIn("a &amp; b", html)

    def test_default_tip_drops_technical_prefix(self):
        self.assertEqual(default_tip({"note": "Phase V survival story (zombies are fiction): Boil water first."}), "Boil water first.")
        self.assertEqual(default_tip({"note": "Plain note"}), "Plain note")

    def test_widen_outputs_1920x1080_with_audio(self):
        with tempfile.TemporaryDirectory() as tmp:
            src, out = Path(tmp) / "v.mp4", Path(tmp) / "w.mp4"
            subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", "color=c=red:s=576x1024:d=1",
                            "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono", "-t", "1", "-shortest",
                            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", str(src)], check=True)
            widen(src, out, title="Title", tip="Tip")
            probe = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,width,height",
                                    "-of", "csv=p=0", str(out)], capture_output=True, text=True, check=True).stdout
            self.assertIn(f"video,{W},{H}", probe)
            self.assertIn("audio", probe)
            # Cột giữa (video gốc màu đỏ) phải còn nguyên ở giữa khung, rộng FG_W.
            frame = Path(tmp) / "f.png"
            subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(out), "-frames:v", "1", str(frame)], check=True)
            from PIL import Image
            img = Image.open(frame).convert("RGB")
            r, g, b = img.getpixel((W // 2, H // 2))
            self.assertGreater(r, 200)
            self.assertLess(g, 60)
            self.assertEqual(FG_W % 2, 0)


if __name__ == "__main__":
    unittest.main()
