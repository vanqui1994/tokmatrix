"""CLI của engine vector.

  build        stdin JSON {slug, lang, niche, channel_id, title, total, scenes, storyboard?} → stdout JSON
               {story, qa, storyboard_source}; storyboard LLM trượt QA thì dựng lại bằng storyboard dự phòng.
  bundle       --out <dir>: chép engine (lõi + mọi pack, đúng thứ tự engine_sources) và catalog cho HTML offline.
  extents      đo lại kích thước thật của mọi rig (cần Playwright).
  assign-dna   gán Vector DNA cho các kênh có `vector` trong preferred_engines (--apply để ghi).
  preview      --niche --lang --channel --out sheet.jpg [--lines a|b|c]: dựng storyboard dự phòng và vẽ bảng hình.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from bkt_web.vector_video import builder, qa
from bkt_web.vector_video.niches import allowed

ROOT = Path(__file__).resolve().parents[2]


def build(payload: dict) -> dict:
    common = dict(slug=payload["slug"], lang=payload["lang"], niche_id=payload["niche"], channel_id=payload["channel_id"],
                  scenes=payload["scenes"], total=payload["total"], title=payload.get("title", ""))
    board = payload.get("storyboard")
    story = builder.build_story(storyboard=board, **common)
    problems = qa.check(story)
    if problems and story["vector_meta"]["storyboard_source"] == "llm":
        retry = builder.build_story(storyboard=None, **common)
        retry_problems = qa.check(retry)
        if len(retry_problems) < len(problems):
            story, problems = retry, retry_problems
    return {"story": story, "qa": problems, "storyboard_source": story["vector_meta"]["storyboard_source"]}


def bundle(out: Path) -> list[str]:
    from bkt_web.remake_vector import catalog, engine_sources

    out.mkdir(parents=True, exist_ok=True)
    engine = out / "engine.js"
    engine.write_text("\n;\n".join(src.read_text(encoding="utf-8") for src in engine_sources()), encoding="utf-8")
    cat = out / "catalog.js"
    cat.write_text("window.VECTOR_CATALOG=" + json.dumps(catalog(), ensure_ascii=False, separators=(",", ":")) + ";", encoding="utf-8")
    return [str(engine), str(cat)]


def vector_channels() -> list[dict]:
    import yaml

    out = []
    for path in sorted((ROOT / "compare_studio" / "config" / "channels").glob("*.yaml")):
        data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        engines = (data.get("creative") or {}).get("preferred_engines") or []
        lang = (data.get("publishing") or {}).get("language")
        if "vector" in engines and lang:
            allow = allowed(data["niche_id"], lang)
            out.append({"channel_id": data["channel_id"], "language": lang, "niche": data["niche_id"],
                        "hosts": len(allow["hosts"]), "buddies": len(allow["buddies"])})
    return out


def assign_dna(apply: bool) -> dict:
    from bkt_web.vector_video import dna

    channels = vector_channels()
    result = dna.assign(channels, dna.load_assignments())
    bad = dna.violations(result, {c["channel_id"]: c["language"] for c in channels})
    if bad:
        raise SystemExit(f"DNA vi phạm: {bad}")
    if apply:
        dna.DNA_PATH.write_text(json.dumps({"schema_version": 1, "channels": result}, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return result


def preview(niche: str, lang: str, channel: str, out: Path, lines: list[str]) -> list[str]:
    import base64
    import io

    from PIL import Image
    from playwright.sync_api import sync_playwright
    from bkt_web.remake_vector import catalog, engine_sources

    scenes, t = [], 0.0
    for i, line in enumerate(lines):
        dur = 3.2 + 0.06 * len(line)
        scenes.append({"start": round(t, 2), "duration": round(dur, 2), "line": line, "visual_intent": line})
        t += dur + 0.2
    result = build({"slug": f"preview-{channel}", "lang": lang, "niche": niche, "channel_id": channel, "title": lines[0],
                    "total": round(t + 1.0, 2), "scenes": scenes})
    story = result["story"]
    js = "\n;\n".join(src.read_text(encoding="utf-8") for src in engine_sources())
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--disable-gpu"])
        page = browser.new_page()
        page.set_content(f"<canvas id=s></canvas><script>{js}</script><script>window.cat={json.dumps(catalog())};"
                         "window.f=(st,t)=>{const c=document.getElementById('s');new RemakeVector.Renderer(c,window.cat,st).render(t);return c.toDataURL('image/jpeg',.8)}</script>")
        frames = []
        for sc in story["scenes"]:
            for u in (0.25, 0.8):
                at = sc["start_time"] + (sc["end_time"] - sc["start_time"]) * u
                frames.append(Image.open(io.BytesIO(base64.b64decode(page.evaluate("a=>window.f(a[0],a[1])", [story, at]).split(",")[1]))))
        browser.close()
    w, h = frames[0].size
    sw, sh = w // 2, h // 2
    cols = min(6, len(frames))
    sheet = Image.new("RGB", (sw * cols, sh * ((len(frames) + cols - 1) // cols)), "white")
    for i, im in enumerate(frames):
        sheet.paste(im.resize((sw, sh)), ((i % cols) * sw, (i // cols) * sh))
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out)
    (out.with_suffix(".json")).write_text(json.dumps(story, ensure_ascii=False, indent=1), encoding="utf-8")
    return result["qa"]


def main(argv=None):
    ap = argparse.ArgumentParser(prog="python3 -m bkt_web.vector_video")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("build")
    b = sub.add_parser("bundle")
    b.add_argument("--out", required=True)
    sub.add_parser("extents")
    a = sub.add_parser("assign-dna")
    a.add_argument("--apply", action="store_true")
    p = sub.add_parser("preview")
    p.add_argument("--niche", required=True)
    p.add_argument("--lang", default="en")
    p.add_argument("--channel", default="preview_channel")
    p.add_argument("--out", required=True)
    p.add_argument("--lines", default="")
    args = ap.parse_args(argv)
    if args.cmd == "build":
        payload = json.loads(sys.stdin.read())
        try:
            result = build(payload)
        except Exception as exc:  # noqa: BLE001 — báo lỗi có cấu trúc cho Node
            print(json.dumps({"error": f"{type(exc).__name__}: {exc}"}))
            raise SystemExit(2)
        print(json.dumps(result, ensure_ascii=False))
        raise SystemExit(1 if result["qa"] else 0)
    if args.cmd == "bundle":
        print(json.dumps(bundle(Path(args.out))))
    elif args.cmd == "extents":
        from bkt_web.vector_video.extents import write_extents
        print(write_extents({"planet": ["mercury", "venus", "earth", "mars", "jupiter", "saturn", "uranus", "neptune"]}))
    elif args.cmd == "assign-dna":
        print(json.dumps(assign_dna(args.apply), indent=1))
    elif args.cmd == "preview":
        lines = [s for s in args.lines.split("|") if s.strip()] or [
            "Imagine a place nobody has ever explained.", "Scientists noticed something strange there.",
            "The first clue was hidden in plain sight.", "Then the numbers stopped making sense.",
            "A second theory appeared, even stranger.", "Today we finally know part of the answer.",
            "And the rest is still a mystery."]
        problems = preview(args.niche, args.lang, args.channel, Path(args.out), lines)
        print(json.dumps({"qa": problems}, ensure_ascii=False, indent=1))
