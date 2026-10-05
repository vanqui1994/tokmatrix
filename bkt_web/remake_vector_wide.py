"""Bản 16:9 (cách A) của video vector: ghép khung, không đổi engine.

Video 9:16 do `remake_composer.compose_animated_video` xuất ra được đặt nét ở giữa khung 1920×1080; nền là
chính video đó phóng phủ kín rồi làm mờ, tối nhẹ; hai bên là lớp chữ trong suốt (tiêu đề bên trái, mẹo/ý chính
bên phải) dựng bằng HTML + Playwright để dùng font hệ thống (chữ de/en/ko/ja). Engine vẫn vẽ 576×1024 nên mọi
story, nhân vật và clip dùng lại nguyên vẹn. Khổ ngang thật (cách B) xem docs/PLAN_vector_widescreen.md.

CLI:
  python3 -m bkt_web.remake_vector_wide --story the_cure --out /tmp/the_cure_16x9.mp4 [--tip "…"]
  python3 -m bkt_web.remake_vector_wide --src video_9x16.mp4 --title "…" --tip "…" --out out.mp4
"""
from __future__ import annotations

import argparse
import html
import shutil
import subprocess
import tempfile
from pathlib import Path

W, H = 1920, 1080
FG_W = 608  # 9:16 cao 1080 → rộng 607,5, làm tròn số chẵn cho libx264
SIDE_W = (W - FG_W) // 2


def _panel_html(title: str, tip: str) -> str:
    esc = lambda s: html.escape(s or "").replace("\n", "<br>")
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>
html,body{{margin:0;width:{W}px;height:{H}px;background:transparent;overflow:hidden}}
body{{font-family:"Noto Sans","Noto Sans CJK JP","Noto Sans CJK KR","Hiragino Sans","Apple SD Gothic Neo","DejaVu Sans",system-ui,sans-serif;color:#fff}}
.side{{position:absolute;top:0;width:{SIDE_W}px;height:{H}px;display:flex;align-items:center;justify-content:center;box-sizing:border-box;padding:0 70px}}
.left{{left:0}} .right{{right:0}}
.card{{background:rgba(10,18,32,.62);border-radius:28px;padding:44px 40px;box-shadow:0 10px 40px rgba(0,0,0,.35)}}
h1{{margin:0;font-size:54px;line-height:1.15;font-weight:800;letter-spacing:.2px}}
.tip{{font-size:38px;line-height:1.35;font-weight:600}}
.tag{{display:inline-block;margin-bottom:18px;padding:6px 16px;border-radius:999px;background:#f59e0b;color:#1f1300;font-size:26px;font-weight:800}}
</style></head><body>
<div class="side left">{f'<div class="card"><h1>{esc(title)}</h1></div>' if title else ''}</div>
<div class="side right">{f'<div class="card"><div class="tag">TIP</div><div class="tip">{esc(tip)}</div></div>' if tip else ''}</div>
</body></html>"""


def render_panel_png(title: str, tip: str, out_png: Path) -> Path:
    """Lớp chữ hai bên (PNG trong suốt 1920×1080); vùng giữa để trống cho video 9:16."""
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": W, "height": H})
        page.set_content(_panel_html(title, tip))
        page.screenshot(path=str(out_png), omit_background=True)
        browser.close()
    return out_png


def widen(src: Path, out: Path, title: str = "", tip: str = "") -> Path:
    """Ghép video 9:16 vào khung 16:9: nền mờ + video nét ở giữa + lớp chữ; giữ nguyên âm thanh."""
    src, out = Path(src), Path(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        panel = render_panel_png(title, tip, Path(tmp) / "panel.png")
        graph = (
            f"[0:v]scale={W}:-2,crop={W}:{H},boxblur=28:4,eq=brightness=-0.12:saturation=0.85[bg];"
            f"[0:v]scale={FG_W}:{H}[fg];"
            "[bg][fg]overlay=(W-w)/2:0[base];"
            "[base][1:v]overlay=0:0,format=yuv420p[v]"
        )
        cmd = ["ffmpeg", "-y", "-v", "error", "-i", str(src), "-loop", "1", "-i", str(panel),
               "-filter_complex", graph, "-map", "[v]", "-map", "0:a?", "-shortest",
               "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-c:a", "copy", "-movflags", "+faststart", str(out)]
        subprocess.run(cmd, check=True)
    return out


def default_tip(story: dict) -> str:
    """Ý chính cho ô bên phải: phần sau dấu ':' của `note` (bỏ nhãn kỹ thuật kiểu "Phase V …:").

    Không dùng câu thoại cuối vì nó trùng phụ đề đang hiện ở giữa khung.
    """
    note = story.get("note", "")
    return note.split(":", 1)[1].strip() if ":" in note else note


def render_story_wide(story_id: str, out: Path, tip: str = "") -> Path:
    """Xuất story mẫu `story_id` ra 9:16 (âm thanh im lặng như showcase) rồi ghép 16:9."""
    from bkt_web.remake_vector import sample_stories, STATIC_DIR  # noqa: F401
    from bkt_web.remake_composer import compose_animated_video

    story = next((s for s in sample_stories() if s["id"] == story_id), None)
    if not story:
        raise ValueError(f"Không có story mẫu: {story_id}")
    with tempfile.TemporaryDirectory() as tmp:
        tmpd = Path(tmp)
        audio = tmpd / "silence.mp3"
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono",
                        "-t", str(story["duration"]), "-q:a", "9", str(audio)], check=True)
        vertical = compose_animated_video(f"wide_{story_id}", story["characters"], story["scenes"], story["cues"],
                                          audio, tmpd / "vertical.mp4", story["duration"],
                                          log=lambda message, percent: print(f"[{percent}%] {message}", flush=True))
        if not vertical:
            raise RuntimeError("Xuất video 9:16 không thành công")
        title = story["name"].split("·", 1)[-1].strip()
        return widen(Path(vertical), out, title=title, tip=tip or default_tip(story))


def main(argv=None):
    ap = argparse.ArgumentParser(description="Ghép video vector 9:16 thành 16:9 (nền mờ + lớp chữ hai bên).")
    ap.add_argument("--story", help="id story mẫu (sample_stories)")
    ap.add_argument("--src", help="MP4 9:16 có sẵn")
    ap.add_argument("--title", default="")
    ap.add_argument("--tip", default="")
    ap.add_argument("--out", required=True)
    a = ap.parse_args(argv)
    if not shutil.which("ffmpeg"):
        raise SystemExit("Cần ffmpeg")
    if a.story:
        path = render_story_wide(a.story, Path(a.out), tip=a.tip)
    elif a.src:
        path = widen(Path(a.src), Path(a.out), title=a.title, tip=a.tip)
    else:
        raise SystemExit("Cần --story hoặc --src")
    print(path)


if __name__ == "__main__":
    main()
