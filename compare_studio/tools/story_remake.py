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
    # Owner 30/09: Muse là nguồn ưu tiên; cảnh Muse lỗi/đứng yên → ImageRouter (Cloudflare dự phòng) vẽ bù.
    if os.environ.get("STORY_REMAKE_IMAGES", "muse") == "muse" and ON_VPS and muse_ready():
        todo = draw_muse(vid, work, todo)
        if not todo:
            return
        log(vid, f"Muse bỏ {len(todo)} cảnh → ImageRouter")
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


MUSE_STALL = int(os.environ.get("STORY_REMAKE_MUSE_STALL", "240"))


def muse_ready():
    """Chrome Muse (CDP 127.0.0.1:9333) đang chạy — không thì vẽ thẳng bằng ImageRouter."""
    try:
        urllib.request.urlopen("http://127.0.0.1:9333/json/version", timeout=3).read()
        return True
    except Exception:
        return False


def draw_muse(vid, work, todo):
    """Vẽ qua Muse (engine `muse` của hàng đợi, worker trong server, tuần tự ~30 s/ảnh). Trả các cảnh Muse không vẽ được
    (lỗi, hoặc không có ảnh mới trong MUSE_STALL giây) để draw() vẽ bù bằng ImageRouter; task Muse còn treo bị huỷ."""
    sys.path.insert(0, str(REPO / "bkt_web"))
    import image_routes
    ids = {}
    for it in todo:
        r = image_routes.enqueue_image(image_routes.EnqueueRequest(prompt=it["prompt"], negative_prompt="cartoon, illustration, text, letters, watermark",
                                                                   aspect_ratio="9:16", engine="muse", notes=f"story-remake {vid} {it['key']}"))
        ids[it["key"]] = r["task_ids"][0]
    src = json.loads((work / "sources.json").read_text()) if (work / "sources.json").exists() else {}
    left = []
    last_progress = time.time()
    while ids and time.time() - last_progress < MUSE_STALL:
        time.sleep(10)
        conn = image_routes._db()
        try:
            rows = {r[0]: r for r in conn.execute(f"select id,status,image_filename from image_queue where id in ({','.join('?' * len(ids))})", list(ids.values()))}
        finally:
            conn.close()
        for key, tid in list(ids.items()):
            r = rows.get(tid)
            if r and r[1] == "completed":
                from PIL import Image
                Image.open(image_routes.GENERATED_DIR / r[2]).convert("RGB").save(work / "img" / f"{key}.png"); src[key] = "muse"; ids.pop(key)
                last_progress = time.time()
            elif r and r[1] == "failed":
                left.append(key); ids.pop(key)
    if ids:  # Muse đứng yên: huỷ task còn chờ để worker không vẽ thừa
        conn = image_routes._db()
        try:
            conn.execute(f"update image_queue set status='failed', error_message='story-remake: chuyển ImageRouter' where status='pending' and id in ({','.join('?' * len(ids))})", list(ids.values()))
            conn.commit()
        finally:
            conn.close()
        left += list(ids)
    (work / "sources.json").write_text(json.dumps(src, indent=1))
    return [it for it in todo if it["key"] in left]


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


# ---------------------------------------------------------------- 5b. dựng bằng ffmpeg (mặc định)
# HyperFrames chụp từng khung bằng Chrome: ~1 s/khung 1080×1920 trên VPS 4 lõi (29/09: 3 phút giọng → 39 phút render).
# Video này chỉ là ảnh tĩnh + zoom/pan + dip đen + phụ đề + grain + 2 dải đen, nên ffmpeg dựng thẳng cùng hiệu ứng
# (zoompan trên ảnh phóng 2× cho mượt, eq/hue/colorchannelmixer = filter CSS cũ, vignette = shade, fade = dip,
# drawbox = bars, ASS = phụ đề; grain 140 chấm mờ 10% của bản cũ bị bỏ — noise mỗi khung làm file ~450 MB và ghép chậm gấp nhiều lần). STORY_REMAKE_RENDERER=hyperframes giữ đường cũ.
FPS = 24


def _ass_time(t):
    t = max(0.0, t)
    return f"{int(t // 3600)}:{int(t % 3600 // 60):02d}:{t % 60:05.2f}"


def _captions_ass(words, total, path):
    G = []
    for a_, e_, w in words:
        if G and a_ - G[-1][0] < 0.28 and len(G[-1][2]) < 18:
            G[-1][2] += " " + w
        else:
            G.append([a_, e_, w])
    head = ("[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nWrapStyle: 0\n\n[V4+ Styles]\n"
            "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, "
            "StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n"
            # #f7f1e3 → &H00E3F1F7; viền + bóng đen như text-shadow cũ; căn giữa, đáy khối chữ ở y≈1560 (top cũ 1480)
            "Style: Cap,DejaVu Serif,66,&H00E3F1F7,&H00E3F1F7,&H00000000,&H96000000,0,1,0,0,100,100,1,0,1,3,4,2,80,80,360,1\n\n"
            "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n")
    lines = []
    for k, (a_, e_, w) in enumerate(G):
        end = G[k + 1][0] if k + 1 < len(G) else total
        text = w.replace("\\", "").replace("{", "(").replace("}", ")").replace("\n", " ")
        lines.append(f"Dialogue: 0,{_ass_time(a_)},{_ass_time(end)},Cap,,0,0,0,,{text}")
    Path(path).write_text(head + "\n".join(lines) + "\n", encoding="utf-8")


def _scene_filter(i, s, d, last):
    """zoompan + màu + vignette + dip cho cảnh i (d giây), toạ độ ảnh vào đã phóng 2× (2160×3840)."""
    n = max(1, round(d * FPS))
    p = f"(on/{max(1, n - 1)})"
    ease = f"((1-cos(PI*{p}))/2)"
    tense = bool(s.get("tense"))
    cam = ["push", "pan_r", "pull", "pan_l"][i % 4]
    # tâm phóng 50% / 42% như transform-origin cũ
    cx, cy = "(iw/2-iw/zoom/2)", "(ih*0.42-ih*0.42/zoom)"
    if tense:
        z, x, y = f"1.04+0.22*{ease}", cx, f"{cy}+100*{ease}/zoom"
    elif cam == "push":
        z, x, y = f"1.02+0.13*{ease}", cx, cy
    elif cam == "pull":
        z, x, y = f"1.17-0.14*{ease}", cx, cy
    else:
        sx = 90 if cam == "pan_r" else -90  # ±45 px ở khung ra = ±90 ở ảnh 2×
        z, x, y = "1.13", f"{cx}-({sx}-2*{sx}*{ease})/zoom", cy
    grade = ("eq=saturation=0.8:brightness=-0.08:contrast=1.08,hue=h=-6" if tense
             else "eq=saturation=1.02:brightness=-0.03:contrast=1.05,colorchannelmixer=.95:.04:.01:0:.03:.95:.02:0:.02:.04:.94")
    vig = "vignette=angle=PI/3.2" if tense else "vignette=angle=PI/4.2"
    fades = "fade=t=in:st=0:d=0.4"
    if not last:
        fades += f",fade=t=out:st={max(0.0, d - 0.42):.2f}:d=0.3"
    return (f"scale=2160:3840:flags=lanczos,zoompan=z='{z}':x='{x}':y='{y}':d={n}:s=1080x1920:fps={FPS},"
            f"{grade},{vig},{fades},format=yuv420p"), n


def render_ffmpeg(vid, work, words, plan, jobs=None):
    out = work / "ffm"; out.mkdir(exist_ok=True)
    total = round(words[-1][1] + 0.4, 2)
    sc = plan["scenes"]
    starts = [round(s["t"], 2) for s in sc]
    starts[0] = 0.0  # cảnh đầu phủ từ 0 như bản HyperFrames (không có khoảng đen trước lời đầu)
    tasks = []
    for i, s in enumerate(sc):
        e = starts[i + 1] if i + 1 < len(sc) else total
        vf, n = _scene_filter(i, s, e - starts[i], i + 1 == len(sc))
        tasks.append((i, vf, n))

    def one_scene(t):
        i, vf, n = t
        clip = out / f"sc{i:02d}.mp4"
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(work / "img" / f"sc{i:02d}.png"), "-vf", vf,
                        "-frames:v", str(n), "-r", str(FPS), "-c:v", "libx264", "-preset", "veryfast", "-crf", "14", "-pix_fmt", "yuv420p", str(clip)],
                       check=True, capture_output=True, text=True)
        return clip

    workers = jobs or max(1, min(3, (os.cpu_count() or 2) - 1))
    with ThreadPoolExecutor(workers) as ex:
        clips = list(ex.map(one_scene, tasks))
    (out / "list.txt").write_text("".join(f"file '{c.name}'\n" for c in clips))
    _captions_ass(words, total, out / "caps.ass")
    mp4 = out / "story.mp4"
    # 2 dải đen 190 px + phụ đề ASS, giọng gốc; cắt đúng tổng thời lượng
    vf = ("drawbox=x=0:y=0:w=iw:h=190:color=black:t=fill,drawbox=x=0:y=ih-190:w=iw:h=190:color=black:t=fill,"
          "ass=caps.ass,format=yuv420p")
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", "list.txt", "-i", str(work / "vo.mp3"),
                    "-vf", vf, "-map", "0:v", "-map", "1:a", "-t", f"{total:.2f}", "-c:v", "libx264", "-preset", "fast", "-crf", "20",
                    "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "story.mp4"],
                   check=True, capture_output=True, text=True, cwd=str(out))
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
        if os.environ.get("STORY_REMAKE_RENDERER", "ffmpeg") == "hyperframes":
            mp4 = check_and_render(vid, build(work, words, plan))
        else:
            t1 = time.time(); mp4 = render_ffmpeg(vid, work, words, plan); log(vid, f"render ffmpeg {time.time() - t1:.0f}s")
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
