"""Tín hiệu similarity mới: text (hộp chữ đo bằng Chromium) và audio (video thật). PLAN_VARIANT_V2_COMPLETION WS-A2/A3."""
import tempfile
import unittest
from pathlib import Path

import numpy as np

from bkt_web import creative_similarity as cs
from bkt_web.creative_similarity import signals

PAGE = """<!DOCTYPE html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:1080px;height:1920px}#root{position:relative;width:1080px;height:1920px}
.clip{position:absolute;inset:0}p{position:absolute;margin:0;font:60px sans-serif}</style></head><body>
<div id="root"><div class="clip" data-start="0" data-duration="5"><p style="left:%dpx;top:%dpx">%s</p></div>
<div class="clip" data-start="5" data-duration="5"><p style="left:%dpx;top:%dpx">%s</p></div></div></body></html>"""


def page(tmp: Path, name: str, top_first: int, top_second: int) -> str:
    path = tmp / f"{name}.html"
    path.write_text(PAGE % (60, top_first, "Headline text here", 60, top_second, "Second scene words"), encoding="utf-8")
    return str(path)


class TextSignalTest(unittest.TestCase):
    def test_text_boxes_follow_the_clip_that_is_on_screen(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            top = signals.text_extract({"html_path": page(tmp, "top", 100, 100), "duration": 10})
            same = signals.text_extract({"html_path": page(tmp, "same", 100, 100), "duration": 10})
            bottom = signals.text_extract({"html_path": page(tmp, "bottom", 1700, 1700), "duration": 10})
            self.assertGreater(top["coverage"], 0)
            self.assertEqual(top["grid"], same["grid"], "deterministic")
            self.assertAlmostEqual(signals.text_compare(top, same), 1.0, places=6)
            self.assertLess(signals.text_compare(top, bottom), 0.2)
            # Only the clip on screen counts: text of the hidden clip never enters the grid at t < 5 s.
            mixed = signals.text_extract({"html_path": page(tmp, "mixed", 100, 1700), "duration": 10})
            apart = signals.text_compare(top, bottom)
            self.assertGreater(signals.text_compare(mixed, top), apart)
            self.assertGreater(signals.text_compare(mixed, bottom), apart)

    def test_missing_html_means_the_signal_is_absent(self):
        self.assertIsNone(signals.text_extract({"duration": 10}))
        features = cs.extract_all({"slug": "x", "frames": [], "meta": {}})
        self.assertNotIn("text", features)
        self.assertNotIn("audio", features)


class AudioSignalTest(unittest.TestCase):
    def test_audio_compares_fingerprint_voice_and_bgm(self):
        fp = np.arange(200, dtype=np.uint32).tolist()
        a = signals.audio_extract({"audio": {"fingerprint": fp, "voice": "de-DE-KatjaNeural", "bgm_md5": "b1"}})
        b = signals.audio_extract({"audio": {"fingerprint": fp, "voice": "de-DE-KatjaNeural", "bgm_md5": "b1"}})
        c = signals.audio_extract({"audio": {"fingerprint": [], "voice": "de-DE-ConradNeural", "bgm_md5": "b2"}})
        self.assertAlmostEqual(signals.audio_compare(a, b), 1.0, places=3)
        self.assertEqual(signals.audio_compare(a, c), 0.0)
        self.assertIsNone(signals.audio_extract({"audio": {}}))

    def test_composite_only_weighs_signals_both_sides_have(self):
        with_audio = {"timing": {"ratios": [0.3, 0.7]}, "audio": {"fingerprint": [], "voice": "v", "bgm_md5": ""}}
        without = {"timing": {"ratios": [0.3, 0.7]}}
        scores = cs.compare(with_audio, without)
        self.assertNotIn("audio", scores)
        self.assertAlmostEqual(sum(s.weight for s in signals.SIGNALS.values()), 1.0, places=6)


def tearDownModule():
    # textgeom giữ một trình duyệt Playwright (sync) suốt tiến trình để CLI chạy nhanh; trong bộ test phải đóng lại,
    # nếu không event loop của nó làm asyncio.run() của test chạy sau (vd test_publisher_modals) hỏng.
    from bkt_web.creative_similarity import textgeom
    textgeom.close()


if __name__ == "__main__":
    unittest.main()
