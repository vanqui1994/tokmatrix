#!/usr/bin/env python3
"""Story remake: kênh YouTube → video kể chuyện (giọng kể + phụ đề) làm lại phần HÌNH, GIỮ NGUYÊN audio gốc.

  python3 compare_studio/tools/story_remake.py channel <url> [--limit 10] [--jobs 2] [--lang auto]
  python3 compare_studio/tools/story_remake.py video <url-or-file> [--lang de]

Mỗi video (thư mục compare_studio/.runtime/story-remake/<id>/, state.json để chạy lại tiếp):
  1. tải (yt-dlp) → vo.mp3 + source.mp4 nhỏ; 2. whisper mốc từng từ; nhận dạng "story" (giọng kể liên tục);
  3. đạo diễn AI (Gemini, dự phòng hàng đợi kịch bản Antigravity): hồ sơ nhân vật + 18–28 cảnh theo câu;
  4. ảnh: ImageRouter (FLUX, prompt đầy đủ) trên VPS, Cloudflare Worker dự phòng — owner 29/09;
  5. dựng HyperFrames (camera, chỉnh màu, letterbox, hạt phim tĩnh, phụ đề phim, audio gốc) → check → render CRF 20.
"""
import argparse, base64, json, os, re, shutil, subprocess, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
ROOT = REPO / "compare_studio" / ".runtime" / "story-remake"
GSAP = REPO / "compare_studio" / "tools" / "template-kinetic" / "assets" / "gsap.min.js"
ON_VPS = str(REPO) == "/opt/tokmatrix"
HF = os.environ.get("HYPERFRAMES_BIN") or str((Path("/opt/tokmatrix") if ON_VPS else Path.home()) / ".npm/_npx/7b0dd3f84959b546/node_modules/.bin/hyperframes")
VPS = os.environ.get("STORY_REMAKE_VPS", "tokmatrix")
YTDLP = str(REPO / "venv" / "bin" / "yt-dlp") if ON_VPS else "yt-dlp"
PROXY = {"url": None}  # socks5 của tunnel NordVPN riêng (VPS: YouTube chặn IP datacenter)


def open_tunnel(country="Germany"):
    """Tunnel NordVPN riêng cho yt-dlp, config chưa gán cho acc nào (một IP một acc); None khi không ở VPS."""
    if not ON_VPS or os.environ.get("STORY_REMAKE_PROXY") == "0":
        return None
    sys.path.insert(0, str(REPO / "bkt_web"))
    os.environ.setdefault("TOKMATRIX_WIREPROXY_PATH", "/usr/local/bin/wireproxy")
    import sqlite3, vpn_manager
    used = {r[0] for r in sqlite3.connect(str(REPO / "bkt_web" / "bkt_channels.db")).execute("select vpn_config from channels where vpn_config!=''")}
    base = REPO / "bkt_web" / "vpn_configs"
    for conf in sorted(base.glob(f"NordVPN_{country}/**/*.conf"), reverse=True):
        rel = str(conf.relative_to(base))
        if rel in used:
            continue
        try:
            r = vpn_manager.start_verified_wireguard_proxy("story_remake", rel)
            PROXY["url"] = r["socks5_url"]
            return vpn_manager
        except Exception as e:
            print(f"tunnel {rel}: {e}", flush=True)
    raise RuntimeError("không mở được tunnel NordVPN cho yt-dlp")


def ytdlp(*args):
    extra = ["--js-runtimes", "node"] + (["--proxy", PROXY["url"]] if PROXY["url"] else [])
    return sh([YTDLP, *extra, *args])
sys.path.insert(0, str(REPO))

STYLE = ("Cinematic film still, photorealistic, 35mm anamorphic lens, shallow depth of field, moody dramatic lighting, "
         "rich colour grade, vertical 9:16 composition, no text, no letters, no watermark, no subtitles.")


def log(vid, msg):
    print(f"[{time.strftime('%H:%M:%S')}] {vid}: {msg}", flush=True)


def sh(cmd, **kw):
    return subprocess.run(cmd, check=True, capture_output=True, text=True, **kw).stdout


# ---------------------------------------------------------------- 1. kênh / tải
def list_channel(url, limit):
    """Danh sách video của kênh (Shorts + video thường), mới nhất trước."""
    urls = [url.rstrip("/") + s for s in ("/shorts", "/videos")] if re.search(r"youtube\.com/(@|channel/|c/)", url) and not re.search(r"/(shorts|videos)$", url) else [url]
    out = []
    for u in urls:
        try:
            data = json.loads(ytdlp("--flat-playlist", "-J", "--playlist-end", str(limit * 3), u))
        except subprocess.CalledProcessError:
            continue
        for e in data.get("entries") or []:
            if e.get("id") and (e.get("duration") or 60) <= 600:
                out.append({"id": e["id"], "url": e.get("url") or f"https://www.youtube.com/watch?v={e['id']}", "title": e.get("title", ""), "duration": e.get("duration")})
    seen, uniq = set(), []
    for e in out:
        if e["id"] not in seen:
            seen.add(e["id"]); uniq.append(e)
    return uniq


def fetch(item, work):
    vo = work / "vo.mp3"
    if vo.exists():
        return
    src = item["url"]
    if os.path.exists(src):
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", src, "-vn", "-c:a", "libmp3lame", "-q:a", "2", str(vo)], check=True)
        shutil.copy(src, work / "source.mp4")
        return
    ytdlp("-q", "-f", "bestaudio", "-x", "--audio-format", "mp3", "--audio-quality", "2", "-o", str(work / "vo.%(ext)s"), src)
    try:
        ytdlp("-q", "-f", "worst[ext=mp4]/worst", "-o", str(work / "source.%(ext)s"), src)
    except subprocess.CalledProcessError:
        pass


# ---------------------------------------------------------------- 2. lời
def transcribe(work, lang):
    f = work / "words.json"
    if f.exists():
        return json.loads(f.read_text())
    from faster_whisper import WhisperModel
    m = WhisperModel("small", compute_type="int8")
    segs, info = m.transcribe(str(work / "vo.mp3"), language=None if lang == "auto" else lang, word_timestamps=True)
    words = [[round(float(w.start), 2), round(float(w.end), 2), w.word.strip()] for s in segs for w in s.words]
    f.write_text(json.dumps({"lang": info.language, "words": words}, ensure_ascii=False))
    return json.loads(f.read_text())


def is_story(words, duration):
    """Giọng kể liên tục: ≥ 1,6 từ/giây trên ≥ 70% thời lượng, dài 30 s–10 phút."""
    if not words or duration < 30 or duration > 600:
        return False
    return len(words) / duration >= 1.6 and (words[-1][1] - words[0][0]) / duration >= 0.7


def sentences(words):
    out, cur = [], []
    for w in words:
        cur.append(w)
        if re.search(r"[.!?…。！？]$", w[2]) or len(cur) >= 28:
            out.append({"start": cur[0][0], "text": " ".join(x[2] for x in cur)}); cur = []
    if cur:
        out.append({"start": cur[0][0], "text": " ".join(x[2] for x in cur)})
    return out


# ---------------------------------------------------------------- 3. đạo diễn
DIRECTOR = """You are the director of a cinematic, photorealistic re-illustration of a narrated story (the original narration is kept as is).
1) Define the recurring cast (max 6) with a precise, fixed look so an image model draws them identically every time:
   id, name/role, age, ethnicity, hair (colour + style), face details, outfit (colour + type).
2) Split the story into {n_min}-{n_max} scenes in order. Each scene starts at a sentence index (strictly increasing, first = 0),
   and has: setting, a vivid visual description of the beat (camera framing, action, key objects; NO text, signs or documents with
   readable writing), the cast ids present with their emotion, and "tense": true for shock/sad/angry beats.
Return JSON {{"cast":[{{"id","look"}}],"scenes":[{{"start","setting","visual","cast":[{{"id","emotion"}}],"tense"}}]}}.
Story language: {lang}. Sentences:
{sents}"""


def ask_gemini(prompt):
    from bkt_web.key_vault import get_key
    key = get_key("ai.gemini")
    body = json.dumps({"contents": [{"parts": [{"text": prompt}]}], "generationConfig": {"responseMimeType": "application/json", "temperature": 0.6}}).encode()
    last = None
    for model in ("gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite"):
        for _ in range(2):
            try:
                req = urllib.request.Request(f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}", body, {"Content-Type": "application/json"})
                r = json.load(urllib.request.urlopen(req, timeout=240))
                return r["candidates"][0]["content"]["parts"][0]["text"]
            except Exception as e:
                last = e; time.sleep(3)
    raise RuntimeError(f"gemini: {last}")


def _vps_queue(payload):
    if ON_VPS:
        out = subprocess.run([str(REPO / "venv" / "bin" / "python"), "-m", "bkt_web.script_queue_cli"], input=json.dumps(payload).encode(), capture_output=True, cwd=str(REPO), timeout=120).stdout.decode().strip()
        res = json.loads(out.splitlines()[-1])
        if not res.get("ok"):
            raise RuntimeError(res.get("error"))
        return res["result"]
    cmd = "cd /opt/tokmatrix && runuser -u tokmatrix -- venv/bin/python -m bkt_web.script_queue_cli"
    for attempt in range(4):
        out = subprocess.run(["/usr/bin/ssh", VPS, cmd], input=json.dumps(payload).encode(), capture_output=True, timeout=120).stdout.decode().strip()
        if out:
            res = json.loads(out.splitlines()[-1])
            if not res.get("ok"):
                raise RuntimeError(res.get("error"))
            return res["result"]
        time.sleep(3 + attempt * 3)
    raise RuntimeError("script queue: empty reply")


def ask_antigravity(prompt, timeout_min=40):
    tid = _vps_queue({"op": "enqueue", "video_type": "matrix", "lang": "en", "prompt": prompt + "\n\nReply with ONE valid JSON object only.", "notes": "story-remake director"})["task_id"]
    for _ in range(timeout_min * 4):
        time.sleep(15)
        st = _vps_queue({"op": "get", "task_id": tid})
        if st["status"] == "completed":
            sj = st["script_json"]
            return sj if isinstance(sj, str) else json.dumps(sj)
        if st["status"] == "failed":
            raise RuntimeError(f"antigravity {tid} failed")
    raise RuntimeError(f"antigravity {tid} timeout")


def direct(vid, work, words, lang):
    f = work / "plan.json"
    if f.exists():
        return json.loads(f.read_text())
    sents = sentences(words)
    dur = words[-1][1]
    n_min, n_max = max(8, int(dur / 9)), max(12, int(dur / 6))
    prompt = DIRECTOR.format(n_min=n_min, n_max=n_max, lang=lang, sents="\n".join(f"{i}: {s['text']}" for i, s in enumerate(sents)))
    try:
        raw = ask_gemini(prompt); src = "gemini"
    except Exception as e:
        log(vid, f"{e} → Antigravity"); raw = ask_antigravity(prompt); src = "antigravity"
    plan = json.loads(raw)
    scenes, last = [], -1
    for s in plan.get("scenes", []):
        k = int(s.get("start", 0))
        if k > last and k < len(sents):
            s["t"] = 0.0 if not scenes else sents[k]["start"]; scenes.append(s); last = k
    plan["scenes"], plan["director"] = scenes, src
    f.write_text(json.dumps(plan, ensure_ascii=False, indent=1))
    return plan


def image_prompts(plan):
    looks = {c["id"]: c.get("look", "") for c in plan.get("cast", [])}
    out = []
    for i, s in enumerate(plan["scenes"]):
        who = [f"{c.get('id')} ({looks.get(c.get('id'), '')}) looking {c.get('emotion', 'neutral')}" for c in s.get("cast", [])]
        out.append({"key": f"sc{i:02d}", "prompt": f"{STYLE} Scene: {s.get('setting', '')}. {s.get('visual', '')} "
                    f"Characters present: {'; '.join(who) or 'no people'}. Keep every character identical to this description."})
    return out


# ---------------------------------------------------------------- 4. ảnh (VPS)
VPS_IMAGES = r'''
import json,sys,os,base64
sys.path.insert(0,"/opt/tokmatrix")
from bkt_web import imagerouter_image as ir, cf_image_fallback as cf
from concurrent.futures import ThreadPoolExecutor
items=json.loads(sys.stdin.read()); tok=cf._token()
NEG="cartoon, illustration, text, letters, watermark, deformed face, extra fingers"
def one(it):
    for attempt in range(2):
        try:
            g=ir.generate(it["prompt"],"9:16"); return it["key"],"imagerouter",cf.fit_to_ratio(g["raw"],"9:16")
        except Exception as e: err=str(e)
    try:
        r=cf.generate(it["prompt"],NEG,"9:16",tok); return it["key"],"cf_worker",r["png"]
    except Exception as e: return it["key"],"failed:"+err[:80]+" | "+str(e)[:80],b""
with ThreadPoolExecutor(8) as ex:
    for k,src,png in ex.map(one,items):
        print(json.dumps({"key":k,"source":src,"png":base64.b64encode(png).decode()}),flush=True)
'''


def draw(vid, work, items):
    d = work / "img"; d.mkdir(exist_ok=True)
    todo = [it for it in items if not (d / f"{it['key']}.png").exists()]
    if not todo:
        return
    if ON_VPS:
        p = subprocess.run([str(REPO / "venv" / "bin" / "python"), "-c", VPS_IMAGES], input=json.dumps(todo), capture_output=True, text=True, timeout=1800, cwd=str(REPO))
    else:
      subprocess.run(["/usr/bin/ssh", VPS, "cat > /tmp/story_remake_images.py && chmod 644 /tmp/story_remake_images.py"], input=VPS_IMAGES, text=True, check=True, timeout=60)
      cmd = "cd /opt/tokmatrix && runuser -u tokmatrix -- env $(systemctl show tokmatrix-web -p Environment --value) venv/bin/python /tmp/story_remake_images.py"
      p = subprocess.run(["/usr/bin/ssh", VPS, cmd], input=json.dumps(todo), capture_output=True, text=True, timeout=1800)
    src = json.loads((work / "sources.json").read_text()) if (work / "sources.json").exists() else {}
    for line in p.stdout.splitlines():
        r = json.loads(line)
        if r["png"]:
            (d / f"{r['key']}.png").write_bytes(base64.b64decode(r["png"]))
        src[r["key"]] = r["source"]
    (work / "sources.json").write_text(json.dumps(src, indent=1))
    missing = [it["key"] for it in items if not (d / f"{it['key']}.png").exists()]
    if missing:
        raise RuntimeError(f"images missing: {missing} {p.stderr[-300:]}")


# ---------------------------------------------------------------- 5. dựng
def build(work, words, plan):
    out = work / "video"; (out / "assets" / "img").mkdir(parents=True, exist_ok=True)
    shutil.copy(work / "vo.mp3", out / "assets" / "vo.mp3"); shutil.copy(GSAP, out / "assets" / "gsap.min.js")
    total = round(words[-1][1] + 0.4, 2)
    sc = plan["scenes"]; parts, tl = [], []
    for i, s in enumerate(sc):
        a = round(s["t"], 2); e = round(sc[i + 1]["t"], 2) if i + 1 < len(sc) else total; d = round(e - a, 2)
        img = f"assets/img/sc{i:02d}.png"; shutil.copy(work / "img" / f"sc{i:02d}.png", out / img)
        tense = bool(s.get("tense"))
        grade = "saturate(.8) brightness(.8) contrast(1.08) hue-rotate(-6deg)" if tense else "saturate(1.02) brightness(.95) contrast(1.05) sepia(.08)"
        parts.append(f'<div id="sc{i}" class="clip scene" data-start="{a}" data-duration="{d}" data-track-index="1"><img id="im{i}" src="{img}" style="filter:{grade}"><div class="shade{" t" if tense else ""}"></div><div class="dip" id="dip{i}"></div></div>')
        cam = ["push", "pan_r", "pull", "pan_l"][i % 4]
        if tense:
            tl.append(f'tl.fromTo("#im{i}",{{scale:1.04}},{{scale:1.26,y:-50,duration:{d},ease:"power1.inOut"}},{a});')
        elif cam == "push":
            tl.append(f'tl.fromTo("#im{i}",{{scale:1.02}},{{scale:1.15,duration:{d},ease:"sine.inOut"}},{a});')
        elif cam == "pull":
            tl.append(f'tl.fromTo("#im{i}",{{scale:1.17}},{{scale:1.03,duration:{d},ease:"sine.inOut"}},{a});')
        else:
            sx = 45 if cam == "pan_r" else -45
            tl.append(f'tl.fromTo("#im{i}",{{scale:1.13,x:{sx}}},{{scale:1.13,x:{-sx},duration:{d},ease:"sine.inOut"}},{a});')
        tl.append(f'tl.fromTo("#dip{i}",{{opacity:1}},{{opacity:0,duration:0.4,ease:"power2.out"}},{a});tl.set("#dip{i}",{{opacity:0}},{round(a + 0.4, 2)});')
        if i + 1 < len(sc):
            tl.append(f'tl.to("#dip{i}",{{opacity:1,duration:0.26,ease:"power2.in"}},{round(e - 0.42, 2)});tl.set("#dip{i}",{{opacity:1}},{round(e - 0.12, 2)});')
    G = []
    for a_, e_, w in words:
        if G and a_ - G[-1][0] < 0.28 and len(G[-1][2]) < 18:
            G[-1][2] += " " + w
        else:
            G.append([a_, e_, w])
    caps = "".join(f'<div class="clip cap" data-start="{a_}" data-duration="{round((G[k + 1][0] if k + 1 < len(G) else total) - a_, 2)}" data-track-index="3"><span>{w.replace("<", "")}</span></div>' for k, (a_, e_, w) in enumerate(G))
    grain = "".join(f'<i style="left:{(k * 397) % 1080}px;top:{(k * 733) % 1920}px"></i>' for k in range(140))
    html = f'''<!doctype html><html><head><meta charset="utf-8"><style>
html,body{{margin:0;background:#000}}#root{{position:relative;width:1080px;height:1920px;overflow:hidden;font-family:Georgia,"Times New Roman",serif;background:#000}}
.scene{{position:absolute;inset:0;overflow:hidden;background:#000}}.scene img{{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transform-origin:50% 42%}}
.shade{{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 50%,transparent 42%,rgba(10,5,0,.6) 100%)}}.shade.t{{background:radial-gradient(ellipse at 50% 45%,transparent 30%,rgba(0,0,12,.76) 100%)}}
.dip{{position:absolute;inset:0;background:#000;opacity:0}}
#bars:before,#bars:after{{content:"";position:absolute;left:0;right:0;height:190px;background:#000;z-index:8}}#bars:before{{top:0}}#bars:after{{bottom:0}}
#grain{{position:absolute;inset:0;z-index:7;opacity:.1}}#grain i{{position:absolute;width:3px;height:3px;background:#fff;border-radius:50%}}
.cap{{position:absolute;left:80px;right:80px;top:1480px;text-align:center;z-index:9}}.cap span{{font-size:66px;font-style:italic;color:#f7f1e3;text-shadow:0 3px 14px rgba(0,0,0,.95),0 0 5px #000,0 0 2px #000;letter-spacing:1px}}
</style></head><body><div id="root" data-composition-id="story" data-width="1080" data-height="1920" data-start="0" data-duration="{total}">
{"".join(parts)}
<div id="fx" class="clip" data-start="0" data-duration="{total}" data-track-index="5"><div id="grain">{grain}</div><div id="bars"></div></div>
{caps}
<audio id="vo" class="clip" src="assets/vo.mp3" data-start="0" data-duration="{total}" data-track-index="9"></audio>
</div><script src="assets/gsap.min.js"></script><script>window.__timelines=window.__timelines||{{}};const tl=gsap.timeline({{paused:true}});{"".join(tl)}window.__timelines["story"]=tl;</script></body></html>'''
    (out / "index.html").write_text(html)
    (out / "meta.json").write_text(json.dumps({"id": "story", "name": work.name}))
    (out / "hyperframes.json").write_text(json.dumps({"paths": {"assets": "assets"}}))
    return out


def check_and_render(vid, out):
    chk = subprocess.run([HF, "check"], cwd=out, capture_output=True, text=True)
    if "Check passed" not in chk.stdout:
        raise RuntimeError("hyperframes check failed:\n" + "\n".join(l for l in chk.stdout.splitlines() if "✗" in l)[:1500])
    mp4 = out / "story.mp4"
    subprocess.run([HF, "render", "--output", str(mp4), "--fps", "24", "--quality", "standard", "--crf", "20"], cwd=out, check=True, capture_output=True)
    return mp4


# ---------------------------------------------------------------- pipeline
def remake(item, lang="auto"):
    vid = item["id"]; work = ROOT / vid; work.mkdir(parents=True, exist_ok=True)
    state_f = work / "state.json"
    state = json.loads(state_f.read_text()) if state_f.exists() else {"id": vid, "url": item["url"], "title": item.get("title", "")}
    if state.get("status") in ("done", "skipped"):
        return state
    t0 = time.time()
    try:
        fetch(item, work); log(vid, "tải xong")
        dur = float(sh(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(work / "vo.mp3")]).strip())
        tr = transcribe(work, lang); words = tr["words"]
        if not is_story(words, dur):
            state.update(status="skipped", reason=f"không phải story ({len(words)} từ / {dur:.0f}s)"); state_f.write_text(json.dumps(state, ensure_ascii=False, indent=1)); log(vid, state["reason"]); return state
        log(vid, f"{len(words)} từ, ngôn ngữ {tr['lang']}")
        plan = direct(vid, work, words, tr["lang"]); log(vid, f"{len(plan['scenes'])} cảnh ({plan['director']})")
        draw(vid, work, image_prompts(plan)); log(vid, "ảnh xong")
        out = build(work, words, plan)
        mp4 = check_and_render(vid, out)
        final = ROOT / "out" / f"{vid}.mp4"; final.parent.mkdir(exist_ok=True); shutil.copy(mp4, final)
        state.pop("error", None); state.update(status="done", mp4=str(final), seconds=round(time.time() - t0), scenes=len(plan["scenes"]))
        log(vid, f"xong {final} ({state['seconds']}s)")
    except Exception as e:
        state.update(status="error", error=str(e)[:2000]); log(vid, f"LỖI {e}")
    state_f.write_text(json.dumps(state, ensure_ascii=False, indent=1))
    return state


def main():
    vpn = None
    try:
        vpn = open_tunnel(os.environ.get("STORY_REMAKE_COUNTRY", "Germany")) if any(a.startswith("http") for a in sys.argv[2:]) else None
        _main()
    finally:
        if vpn:
            vpn.stop_wireguard_proxy("story_remake")


def _main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("channel"); c.add_argument("url"); c.add_argument("--limit", type=int, default=10); c.add_argument("--jobs", type=int, default=2); c.add_argument("--lang", default="auto")
    v = sub.add_parser("video"); v.add_argument("src"); v.add_argument("--lang", default="auto"); v.add_argument("--id")
    a = ap.parse_args()
    if a.cmd == "video":
        vid = a.id or (Path(a.src).stem if os.path.exists(a.src) else re.sub(r"\W+", "", a.src.split("v=")[-1].split("/")[-1])[:20])
        print(json.dumps(remake({"id": vid, "url": a.src}, a.lang), ensure_ascii=False, indent=1))
        return
    items = list_channel(a.url, a.limit)
    print(f"{len(items)} video trong kênh", flush=True)
    results, done = [], 0
    with ThreadPoolExecutor(a.jobs) as ex:
        for r in ex.map(lambda it: remake(it, a.lang), items):
            results.append(r); done += r.get("status") == "done"
            if done >= a.limit:
                break
    (ROOT / "last_run.json").write_text(json.dumps(results, ensure_ascii=False, indent=1))
    print(json.dumps({"done": sum(r.get("status") == "done" for r in results), "skipped": sum(r.get("status") == "skipped" for r in results), "error": sum(r.get("status") == "error" for r in results)}))


if __name__ == "__main__":
    main()
