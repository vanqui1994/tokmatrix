"""Video kiến thức hai linh vật Heo (hỏi) + Rồng (giải thích), tranh comic — bản thử nghiệm.

Gemini viết hội thoại + mô tả cảnh cho từng câu → TTS mỗi câu bằng giọng của nhân vật → ảnh comic (ImageRouter trên VPS,
cast cố định) → dựng bằng render_ffmpeg của Story Remake (camera, phụ đề). Phụ đề theo thời lượng đo được của từng câu.

  python3 compare_studio/tools/mascot_explainer.py --topic "Why bubble tea took over Asia" --lang en [--id slug]
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
import story_remake as sr  # noqa: E402

ROOT = sr.REPO / "compare_studio" / ".runtime" / "mascot-explainer"
GAP = 0.25

STYLE = ("Bold hand-drawn comic illustration, thick black ink outlines, flat warm colours with halftone shading, exaggerated "
         "cartoon expressions, dynamic composition, vertical 9:16 poster, clean background shapes, no text, no letters, no logos.")
CAST = {
    "pig": "PIG: a chubby pink cartoon pig mascot, big round head, small ears, huge white eyes with tiny pupils, snout with two "
           "nostrils, wears a short blue denim overall with one strap, curious and clumsy",
    "dragon": "DRAGON: a small round green cartoon dragon mascot, cream belly with stripes, two short orange horns, tiny bat wings, "
              "big confident eyes, wears small round glasses, smart and a bit smug",
}
VOICES = {"en": {"pig": ("en-US-AnaNeural", 1.0), "dragon": ("en-US-GuyNeural", 1.0)},
          "de": {"pig": ("de-DE-GiselaNeural", 1.0), "dragon": ("de-DE-KillianNeural", 1.0)}}
NICHE = "mascot_explainer"

WRITER = """Write a {lang_name} TikTok explainer dialogue (55-70 seconds spoken, about 150 words in total) on: "{topic}".
Two mascots: PIG asks naive, funny questions and reacts; DRAGON explains with surprising concrete facts. Hook in the first line,
a clear arc (origin -> turning point -> why it spread -> twist), end with a punchy line. 11-13 lines, each under 16 words.
No real people's names, no brand names, no logos. Facts must be true and general.
For every line give a scene for a comic illustration: setting, what the mascots do (both or one), key objects (generic, no text).
Also give a short punchy title (max 5 words).
Return JSON {{"title": str, "lines": [{{"who": "pig"|"dragon", "text": str, "setting": str, "visual": str, "mood": "fun"|"tense"|"wow"}}]}}"""


def write_script(work, topic, lang):
    f = work / "script.json"
    if f.exists():
        return json.loads(f.read_text())
    raw = sr.ask_gemini(WRITER.format(topic=topic, lang_name=sr.LANG_NAME[lang]))
    data = json.loads(raw)
    data["lines"] = [l for l in data.get("lines", []) if l.get("who") in CAST and l.get("text", "").strip()]
    if len(data["lines"]) < 8:
        raise RuntimeError(f"kịch bản quá ngắn: {len(data['lines'])} câu")
    f.write_text(json.dumps(data, ensure_ascii=False, indent=1))
    return data


def _dur(p):
    return float(sr.sh(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)]).strip())


def voice(work, script, lang):
    """TTS từng câu, ghép có khoảng nghỉ GAP → vo.mp3; trả lại (start, end) mỗi câu."""
    d = work / "tts"; d.mkdir(exist_ok=True)
    times, parts, t = [], [], 0.0
    silence = d / "gap.mp3"
    if not silence.exists():
        sr.sh(["ffmpeg", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-t", str(GAP), str(silence)])
    for i, line in enumerate(script["lines"]):
        out = d / f"l{i:02d}.mp3"
        if not out.exists():
            v, speed = VOICES[lang][line["who"]]
            sr._tts_line(line["text"], v, speed, out, lang)
        dur = _dur(out)
        times.append((round(t, 3), round(t + dur, 3)))
        parts += [out, silence]
        t += dur + GAP
    (d / "list.txt").write_text("".join(f"file '{p.name}'\n" for p in parts))
    sr.sh(["ffmpeg", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(d / "list.txt"), "-ar", "44100",
           "-ac", "2", "-c:a", "libmp3lame", "-b:a", "192k", str(work / "vo.mp3")])
    return times


def words_from_lines(script, times):
    """Phụ đề: chia mỗi câu thành cụm ~3 từ, thời gian theo số ký tự trong câu (đúng đầu/cuối câu đã đo)."""
    words = []
    for line, (a, e) in zip(script["lines"], times):
        toks = line["text"].split()
        chunks = [" ".join(toks[k:k + 3]) for k in range(0, len(toks), 3)]
        total = sum(len(c) for c in chunks) or 1
        t = a
        for c in chunks:
            d = (e - a) * len(c) / total
            words.append([round(t, 3), round(t + d, 3), c])
            t += d
    return words


def plan_from(script, times):
    scenes = []
    for i, (line, (a, _)) in enumerate(zip(script["lines"], times)):
        who = ["pig", "dragon"]  # cả hai linh vật trong mọi cảnh (bản thử: Rồng thiếu ở cảnh Heo nói)
        scenes.append({"t": 0.0 if i == 0 else a, "setting": line.get("setting", ""), "visual": line.get("visual", ""),
                       "cast": who, "tense": line.get("mood") == "tense"})
    return {"scenes": scenes}


def prompts(plan):
    out = []
    for i, s in enumerate(plan["scenes"]):
        cast = " ".join(CAST[c] for c in s["cast"])
        out.append({"key": f"sc{i:02d}", "scene": f"{s['setting']}. {s['visual']} Both mascots in the scene.", "prompt": f"{STYLE} Scene: {s['setting']}. {s['visual']} Characters: {cast}. "
                    "Keep both mascots exactly as described, same colours and outfits in every image."})
    return out


def render(work, words, plan):
    """Camera/màu từng cảnh như Story Remake, không phụ đề, không dải đen (tranh comic phủ cả khung)."""
    out = work / "ffm"; out.mkdir(exist_ok=True)
    total = round(words[-1][1] + 0.4, 2)
    sc = plan["scenes"]
    bounds = [round(s["t"] * sr.FPS) for s in sc] + [round(total * sr.FPS)]
    bounds[0] = 0
    clips = []
    for i, s in enumerate(sc):
        n = max(1, bounds[i + 1] - bounds[i])
        vf, n = sr._scene_filter(i, s, n / sr.FPS, i + 1 == len(sc), n)
        clip = out / f"sc{i:02d}.mp4"
        sr.sh(["ffmpeg", "-loglevel", "error", "-y", "-i", str(work / "img" / f"sc{i:02d}.png"), "-vf", vf, "-frames:v", str(n),
               "-r", str(sr.FPS), "-c:v", "libx264", "-preset", "veryfast", "-crf", "16", "-pix_fmt", "yuv420p", str(clip)])
        clips.append(clip)
    (out / "list.txt").write_text("".join(f"file '{c.name}'\n" for c in clips))
    mp4 = out / "video.mp4"
    sr.sh(["ffmpeg", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(out / "list.txt"), "-i", str(work / "vo.mp3"),
           "-map", "0:v", "-map", "1:a", "-t", f"{total:.2f}", "-c:v", "libx264", "-preset", "fast", "-crf", "20",
           "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(mp4)])
    return mp4


AG_API = "http://127.0.0.1:8080/api/ai-images"
AG_NEG = "photo, photorealistic, 3d render, text, letters, words, logo, watermark, extra limbs, deformed"


def _vps_curl(args, data=None):
    cmd = "curl -s -m 60 " + " ".join(args)
    r = subprocess.run(["/usr/bin/ssh", sr.VPS, cmd], input=data, capture_output=True, text=True, timeout=120)
    return json.loads(r.stdout or "{}")


def draw_antigravity(vid, work, items, timeout_min=240):
    """Ảnh qua hàng đợi Antigravity trên VPS (engine=antigravity); nhận ảnh nào do Cloudflare/ImageRouter vẽ thì bỏ, xếp lại."""
    d = work / "img"; d.mkdir(exist_ok=True)
    state_f = work / "ag_tasks.json"
    tasks = json.loads(state_f.read_text()) if state_f.exists() else {}
    deadline = time.time() + timeout_min * 60
    while True:
        todo = [it for it in items if not (d / f"{it['key']}.png").exists()]
        if not todo:
            return
        for it in todo:
            if it["key"] not in tasks:
                body = json.dumps({"prompt": it["prompt"], "negative_prompt": AG_NEG, "aspect_ratio": "9:16",
                                   "engine": "antigravity", "notes": f"mascot-explainer · {vid} · {it['key']}"})
                res = _vps_curl(["-X POST", "-H 'Content-Type: application/json'", "--data-binary @-", f"{AG_API}/queue"], body)
                tasks[it["key"]] = res["task_ids"][0]
                state_f.write_text(json.dumps(tasks, indent=1))
        q = {t["id"]: t for t in _vps_curl([f"'{AG_API}/queue?engine=antigravity&limit=500'"]).get("queue", [])}
        for it in todo:
            t = q.get(tasks[it["key"]])
            if not t:
                continue
            if t["status"] == "completed" and t.get("image_url"):
                if str(t.get("model") or "").startswith(("cf-worker", "imagerouter")):
                    sr.log(vid, f"{it['key']}: bỏ ảnh {t['model']}, xếp lại"); tasks.pop(it["key"]); continue
                url = t["image_url"] if t["image_url"].startswith("http") else "http://127.0.0.1:8080" + t["image_url"]
                png = subprocess.run(["/usr/bin/ssh", sr.VPS, f"curl -s -m 120 '{url}'"], capture_output=True, timeout=180).stdout
                if len(png) > 2000:
                    (d / f"{it['key']}.png").write_bytes(png); sr.log(vid, f"{it['key']} xong")
            elif t["status"] == "failed":
                tasks.pop(it["key"])
        state_f.write_text(json.dumps(tasks, indent=1))
        if time.time() > deadline:
            raise RuntimeError(f"Antigravity chưa vẽ xong: {[it['key'] for it in todo]}")
        time.sleep(30)


def draw_gemini_web(vid, work, items):
    """Gemini web (Chrome CDP trên VPS, bkt_web.chatgpt_web images): mọi cảnh trong một chat để giữ đúng hai nhân vật."""
    import base64
    d = work / "img"; d.mkdir(exist_ok=True)
    todo = [it for it in items if not (d / f"{it['key']}.png").exists()]
    if not todo:
        return
    intro = (f"I am making a comic-style explainer. Art style for EVERY image: {STYLE} The two recurring mascots, drawn exactly "
             f"the same in every image: {CAST['pig']}. {CAST['dragon']}. For each of my messages, generate exactly ONE vertical "
             "9:16 image and no text reply.")
    prompts = [f"Draw image {k + 1} (vertical 9:16, comic style, both mascots): {it['scene']}" for k, it in enumerate(todo)]
    cmd = ("cd /opt/tokmatrix && runuser -u tokmatrix -- env $(systemctl show tokmatrix-web -p Environment --value) "
           "venv/bin/python -m bkt_web.chatgpt_web images")
    proc = subprocess.Popen(["/usr/bin/ssh", sr.VPS, cmd], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
    proc.stdin.write(json.dumps({"intro": intro, "prompts": prompts})); proc.stdin.close()
    for line in proc.stdout:
        r = json.loads(line)
        it = todo[r["i"]]
        if r["png"]:
            (d / f"{it['key']}.png").write_bytes(base64.b64decode(r["png"])); sr.log(vid, f"{it['key']} xong")
        else:
            sr.log(vid, f"{it['key']} lỗi: {r['error']}")
    proc.wait()
    missing = [it["key"] for it in items if not (d / f"{it['key']}.png").exists()]
    if missing:
        raise RuntimeError(f"Gemini web thiếu ảnh {missing} (chạy lại để vẽ tiếp)")


def enqueue(vid, mp4, script, account, lang):
    """Chép MP4 vào storage trên VPS (uploader chỉ nhận file trong storage) và tạo 1 task đăng ở khung giờ kế tiếp của acc."""
    dest = f"/opt/tokmatrix/bkt_web/storage/mascot_explainer/{vid}.mp4"
    subprocess.run(["/usr/bin/ssh", sr.VPS, f"install -d -o tokmatrix -g tokmatrix {Path(dest).parent} && cat > {dest} && chown tokmatrix:tokmatrix {dest}"],
                   stdin=open(mp4, "rb"), check=True, timeout=600)
    caption = f"{script.get('title', '')} — {script['lines'][0]['text']}"[:150]
    code = (f"import json,sqlite3;from bkt_web import upload_tasks,paths\n"
            f"c=sqlite3.connect(str(paths.DB_PATH),timeout=30)\n"
            f"i=upload_tasks.enqueue_auto(c,{int(account)},{dest!r},{caption!r},niche={NICHE!r},language={lang!r},run_id={('mascot_explainer:' + vid)!r})\n"
            f"c.commit();print(json.dumps({{'task':i,'slot':c.execute('select schedule_time from upload_tasks where id=?',(i,)).fetchone()[0]}}))")
    cmd = "cd /opt/tokmatrix && runuser -u tokmatrix -- venv/bin/python -"
    r = subprocess.run(["/usr/bin/ssh", sr.VPS, cmd], input=code, capture_output=True, text=True, timeout=120)
    if r.returncode:
        raise RuntimeError(f"không tạo được task đăng: {r.stderr[-400:]}")
    return json.loads(r.stdout.strip().splitlines()[-1])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--topic", required=True)
    ap.add_argument("--lang", default="en", choices=sorted(VOICES))
    ap.add_argument("--id")
    ap.add_argument("--account", type=int, help="TikTok channel id: đưa video xong vào hàng đợi đăng của acc này")
    ap.add_argument("--images", default="gemini_web", choices=["gemini_web", "antigravity", "imagerouter"])
    a = ap.parse_args()
    vid = a.id or re.sub(r"[^a-z0-9]+", "-", a.topic.lower()).strip("-")[:48]
    work = ROOT / vid; work.mkdir(parents=True, exist_ok=True)
    # Ảnh comic: bỏ "cartoon, illustration" khỏi negative của Cloudflare (bản Story Remake là ảnh thật).
    sr.VPS_IMAGES = sr.VPS_IMAGES.replace('NEG="cartoon, illustration, text,', 'NEG="photo, photorealistic, text,')
    script = write_script(work, a.topic, a.lang); sr.log(vid, f"kịch bản {len(script['lines'])} câu: {script.get('title')}")
    times = voice(work, script, a.lang); sr.log(vid, f"giọng {times[-1][1]:.1f}s")
    words = words_from_lines(script, times)
    (work / "words.json").write_text(json.dumps({"lang": a.lang, "words": words}, ensure_ascii=False))
    plan = plan_from(script, times)
    if a.images == "gemini_web":
        draw_gemini_web(vid, work, prompts(plan))
    elif a.images == "antigravity":
        draw_antigravity(vid, work, prompts(plan))
    else:
        sr.draw(vid, work, prompts(plan))
    sr.log(vid, "ảnh xong")
    mp4 = render(work, words, plan)
    final = ROOT / "out" / f"{vid}.mp4"; final.parent.mkdir(exist_ok=True); shutil.copy(mp4, final)
    print(final)
    if a.account:
        print(enqueue(vid, final, script, a.account, a.lang))


if __name__ == "__main__":
    main()
