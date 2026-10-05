"""Menu "Story Remake": kênh YouTube → remake phần hình (ảnh phim ImageRouter), giữ audio gốc.

Chạy compare_studio/tools/story_remake.py thành một tiến trình nền (một lượt chạy một lúc), đọc trạng thái từ
compare_studio/.runtime/story-remake/<id>/state.json.
"""
from __future__ import annotations

import json
import os
import signal
import re
import shutil
import sqlite3
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

REPO = Path(__file__).resolve().parent.parent
TOOL = REPO / "compare_studio" / "tools" / "story_remake.py"
ROOT = REPO / "compare_studio" / ".runtime" / "story-remake"
RUNNER = ROOT / "runner.json"
LOG = ROOT / "runner.log"
EXIT = ROOT / "runner_exit.json"  # tool ghi khi thoát: {"pid", "code", "signal"}
MAX_RESUMES = 3
# Kênh Shorts theo dõi: luồng nền chạy lần lượt từng kênh khi không có lượt nào đang chạy (tool tự bỏ qua video đã xong,
# nên mỗi lần chỉ làm Shorts mới). Tắt bằng TOKMATRIX_STORY_WATCH=0.
WATCH = ROOT / "watch.json"
WATCH_TICK = 60
WATCH_LOCK = threading.Lock()
# Remake xong → hàng đợi đăng của tài khoản đã chọn (kênh theo dõi hoặc lượt chạy tay). Trình đăng chỉ nhận MP4 trong
# bkt_web/storage, nên bản đăng là bản chép ở storage/story_remake/<id>.mp4.
CHANNELS_DB = REPO / "bkt_web" / "bkt_channels.db"
UPLOAD_DIR = REPO / "bkt_web" / "storage" / "story_remake"
CHANNEL_RE = re.compile(r"^https?://(www\.|m\.)?youtube\.com/(@[\w.\-]+|channel/[\w\-]+|c/[\w.\-]+)(/shorts)?/?$")

router = APIRouter(prefix="/api/story-remake", tags=["story_remake"])


class RunRequest(BaseModel):
    url: str = Field(..., min_length=8, pattern=r"^https?://\S+$")  # không cho "-..." (cờ yt-dlp/argparse) hay đường dẫn file trên server
    limit: int = Field(5, ge=1, le=50)
    jobs: int = Field(1, ge=1, le=3)
    lang: str = "auto"
    images: str = Field("imagerouter", pattern="^(imagerouter|muse)$")
    account_id: Optional[int] = None  # tài khoản TikTok đăng video làm xong (không chọn = không đăng)


class WatchChannel(BaseModel):
    url: str = Field(..., min_length=8, max_length=300)
    limit: int = Field(3, ge=1, le=20)
    lang: str = Field("auto", pattern=r"^[a-z]{2}$|^auto$")
    images: str = Field("imagerouter", pattern="^(imagerouter|muse)$")
    account_id: Optional[int] = None


class WatchConfig(BaseModel):
    interval_min: int = Field(60, ge=15, le=1440)
    enabled: bool = True


def shorts_url(url: str) -> str:
    """Link kênh YouTube → tab Shorts của kênh (chỉ nhận link kênh, không nhận video lẻ)."""
    from urllib.parse import unquote
    m = CHANNEL_RE.match(unquote(url.strip()))  # link copy từ trình duyệt mã hoá chữ có dấu (@ArniK%C3%B6nigin)
    if not m:
        raise ValueError("Cần link kênh YouTube dạng https://www.youtube.com/@tenkenh")
    return f"https://www.youtube.com/{m.group(2)}/shorts"


def _watch_load() -> Dict[str, Any]:
    try:
        data = json.loads(WATCH.read_text())
    except Exception:
        data = {}
    data.setdefault("interval_min", 60); data.setdefault("enabled", True); data.setdefault("channels", [])
    return data


def _watch_save(data: Dict[str, Any]) -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    tmp = WATCH.with_suffix(".tmp"); tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1)); tmp.replace(WATCH)


def watch_tick(now: float | None = None) -> str | None:
    """Một nhịp: nếu rảnh, chạy kênh theo dõi đến hạn lâu nhất chưa chạy. Trả url đã chạy (hoặc None)."""
    now = now or time.time()
    with WATCH_LOCK:
        data = _watch_load()
        if not data["enabled"] or _runner().get("running"):
            return None
        due = [c for c in data["channels"] if c.get("enabled", True) and now - c.get("last_run", 0) >= data["interval_min"] * 60]
        if not due:
            return None
        ch = min(due, key=lambda c: c.get("last_run", 0))
        _launch(ch["url"], ch.get("limit", 3), 1, ch.get("lang", "auto"), ch.get("images", "imagerouter"), account_id=ch.get("account_id"))
        ch["last_run"] = int(now)
        _watch_save(data)
        return ch["url"]


def _account_language(account_id: int) -> Dict[str, str]:
    from bkt_web import muse_remake
    v = muse_remake.account_voice(account_id)
    return {"language": v["language"], "niche": v.get("niche") or ""}


def _video_lang(work: Path) -> str:
    try:
        return str(json.loads((work / "words.json").read_text()).get("lang") or "")
    except Exception:
        return ""


def _caption(state: Dict[str, Any], work: Path) -> str:
    title = (state.get("title") or "").strip()
    if title:
        return title[:150]
    try:
        words = json.loads((work / "words.json").read_text())["words"]
        return " ".join(w[2] for w in words)[:150].rsplit(" ", 1)[0] + "…"
    except Exception:
        return ""


def enqueue_done() -> int:
    """Video `done` có `account_id`, chưa có task đăng → chép MP4 vào storage và tạo upload_tasks QUEUED ở khung giờ
    kế tiếp của tài khoản. Lời kể khác ngôn ngữ tài khoản (mỗi tài khoản một nước) → không đăng, ghi `upload_error`."""
    from bkt_web.autopilot import captions, scheduler
    n = 0
    for sf in ROOT.glob("*/state.json") if ROOT.exists() else []:
        try:
            st = json.loads(sf.read_text())
        except Exception:
            continue
        acc = st.get("account_id")
        if st.get("status") != "done" or not acc or st.get("upload_task_id") or st.get("upload_error"):
            continue
        vid, work = st["id"], sf.parent
        src = ROOT / "out" / f"{vid}.mp4"
        if not src.exists():
            continue
        info, lang = _account_language(int(acc)), _video_lang(work)
        if lang != info["language"]:
            st["upload_error"] = f"Lời kể tiếng {lang or '?'}, tài khoản đăng tiếng {info['language']} — không đăng"
            sf.write_text(json.dumps(st, ensure_ascii=False, indent=1))
            continue
        run_id = f"story_remake:{vid}"
        with sqlite3.connect(str(CHANNELS_DB), timeout=30) as c:
            row = c.execute("SELECT id FROM upload_tasks WHERE run_id=? AND channel_id=?", (run_id, int(acc))).fetchone()
            if row:
                task_id = int(row[0])
            else:
                UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
                dest = UPLOAD_DIR / f"{vid}.mp4"
                shutil.copy2(src, dest)
                slot = scheduler.next_slot(int(acc)) or int(time.time()) + 3600
                cur = c.execute("INSERT INTO upload_tasks(channel_id, video_path, caption, hashtags, schedule_time, status, created_at, "
                                "ai_generated, run_id) VALUES (?,?,?,?,?,'QUEUED',?,0,?)",
                                (int(acc), str(dest), _caption(st, work), captions.hashtags_for(info["niche"], lang), int(slot), int(time.time()), run_id))
                task_id = int(cur.lastrowid)
                n += 1
        st["upload_task_id"] = task_id
        sf.write_text(json.dumps(st, ensure_ascii=False, indent=1))
    return n


def _watch_loop() -> None:
    while True:
        try:
            enqueue_done()
        except Exception as exc:  # noqa: BLE001
            print(f"[story-remake] enqueue: {exc}")
        try:
            watch_tick()
        except Exception as exc:  # noqa: BLE001 — luồng nền không được chết
            print(f"[story-remake] watch: {exc}")
        time.sleep(WATCH_TICK)


_watch_started = False


def start_watch() -> None:
    global _watch_started
    if _watch_started or os.environ.get("TOKMATRIX_STORY_WATCH", "1") == "0":
        return
    _watch_started = True
    threading.Thread(target=_watch_loop, name="story-remake-watch", daemon=True).start()


def _runner() -> Dict[str, Any]:
    try:
        info = json.loads(RUNNER.read_text())
    except Exception:
        return {"running": False}
    pid = info.get("pid")
    alive = False
    if pid:
        try:
            os.kill(pid, 0)
            alive = True
        except OSError:
            alive = False
    info["running"] = alive
    if info.get("active") and not alive:
        ex = _exit_info()
        if ex.get("pid") == pid and not ex.get("signal"):
            info["active"] = False  # tool đã tự kết thúc (xong hoặc lỗi) — không phải bị ngắt
    return info


def _exit_info() -> Dict[str, Any]:
    try:
        return json.loads(EXIT.read_text())
    except Exception:
        return {}


def _videos(running: bool = True) -> List[Dict[str, Any]]:
    out = []
    if not ROOT.exists():
        return out
    for state in ROOT.glob("*/state.json"):
        try:
            s = json.loads(state.read_text())
        except Exception:
            continue
        work = state.parent
        s["updated"] = int(state.stat().st_mtime)
        s["has_mp4"] = (ROOT / "out" / f"{s.get('id')}.mp4").exists()
        s["has_thumb"] = (work / "img" / "sc00.png").exists()
        s.setdefault("status", "running" if running else "stopped")
        out.append(s)
    # video đang chạy (chưa có state.json)
    for work in ROOT.iterdir():
        if work.is_dir() and work.name not in ("out",) and not (work / "state.json").exists() and (work / "vo.mp3").exists():
            steps = [n for n in ("words.json", "plan.json", "sources.json") if (work / n).exists()]
            out.append({"id": work.name, "status": "running" if running else "stopped", "step": steps[-1] if steps else "vo.mp3", "updated": int(work.stat().st_mtime),
                        "has_mp4": False, "has_thumb": (work / "img" / "sc00.png").exists()})
    return sorted(out, key=lambda s: -s["updated"])


def _launch(url: str, limit: int, jobs: int, lang: str, images: str, resumed: bool = False, resumes: int = 0,
            account_id: Optional[int] = None) -> int:
    ROOT.mkdir(parents=True, exist_ok=True)
    mode = "channel" if ("/@" in url or "/channel/" in url or "/c/" in url or "list=" in url) else "video"
    cmd = [sys.executable, str(TOOL), mode, url] + (["--limit", str(limit), "--jobs", str(jobs)] if mode == "channel" else []) + ["--lang", lang]
    log = open(LOG, "a" if resumed else "w")
    if resumed:
        log.write(f"\n[{time.strftime('%H:%M:%S')}] tự chạy tiếp sau khi web app khởi động lại\n"); log.flush()
    # Chủ kênh 06/10: Muse chỉ dùng cho Kuaishou remake (muse_remake), Antigravity cho Matrix → Story Remake luôn vẽ bằng
    # ImageRouter (Cloudflare dự phòng); giá trị `muse` cũ (runner.json/watch.json/client cũ) cũng chạy ImageRouter.
    images = "imagerouter"
    env = {**os.environ, "STORY_REMAKE_IMAGES": images, "STORY_REMAKE_ACCOUNT": str(account_id or "")}
    proc = subprocess.Popen(cmd, cwd=str(REPO), stdout=log, stderr=subprocess.STDOUT, start_new_session=True, env=env)
    RUNNER.write_text(json.dumps({"pid": proc.pid, "url": url, "limit": limit, "jobs": jobs, "lang": lang, "images": images,
                                  "started": int(time.time()), "active": True, "resumes": resumes, "account_id": account_id}))
    return proc.pid


def resume_interrupted() -> None:
    """Gọi lúc server khởi động: lượt chạy chưa xong (active, tiến trình đã chết theo web app) → chạy lại, tool tự bỏ qua video đã xong.
    Cũng bật luồng theo dõi kênh Shorts."""
    start_watch()
    info = _runner()
    if info.get("active") and not info.get("running") and info.get("url"):
        n = int(info.get("resumes", 0)) + 1
        if n > MAX_RESUMES:  # chết liên tục (SIGKILL/OOM) → thôi, không chạy lại mãi mỗi lần web app khởi động
            info.pop("running", None); info["active"] = False
            RUNNER.write_text(json.dumps(info))
            return
        _launch(info["url"], info.get("limit", 5), info.get("jobs", 1), info.get("lang", "auto"), info.get("images", "imagerouter"), resumed=True, resumes=n,
                account_id=info.get("account_id"))


@router.get("/status")
def status():
    log = ""
    if LOG.exists():
        log = "\n".join(LOG.read_text(errors="ignore").splitlines()[-40:])
    runner = _runner()
    if runner.get("active") is False and not runner.get("running") and json.loads(RUNNER.read_text() if RUNNER.exists() else "{}").get("active"):
        persisted = dict(runner); persisted.pop("running", None)
        RUNNER.write_text(json.dumps(persisted))
    if runner.get("active") and not runner.get("running") and "tự chạy tiếp" not in log[-300:] and log.rstrip().endswith("}"):
        runner.pop("running", None); runner["active"] = False  # lượt chạy kết thúc bình thường (in JSON tổng kết)
        RUNNER.write_text(json.dumps(runner)); runner["running"] = False
    return {"runner": runner, "videos": _videos(bool(runner.get("running"))), "log": log}


@router.post("/run")
def run(req: RunRequest):
    if _runner().get("running"):
        raise HTTPException(409, "Đang có một lượt chạy — dừng lượt đó trước")
    _check_account(req.account_id)
    pid = _launch(req.url, req.limit, req.jobs, req.lang, req.images, account_id=req.account_id)
    return {"started": True, "pid": pid}


@router.post("/stop")
def stop():
    info = _runner()
    if not info.get("running"):
        return {"stopped": False}
    try:
        os.killpg(info["pid"], signal.SIGTERM)
    except OSError:
        pass
    info.pop("running", None); info["active"] = False
    RUNNER.write_text(json.dumps(info))
    return {"stopped": True}


def _file(path: Path, media: str):
    if not path.exists():
        raise HTTPException(404, "Không có file")
    return FileResponse(str(path), media_type=media)


@router.get("/video/{vid}")
def video(vid: str):
    if not vid.replace("-", "").replace("_", "").isalnum():
        raise HTTPException(400, "id không hợp lệ")
    return _file(ROOT / "out" / f"{vid}.mp4", "video/mp4")


@router.get("/thumb/{vid}")
def thumb(vid: str):
    if not vid.replace("-", "").replace("_", "").isalnum():
        raise HTTPException(400, "id không hợp lệ")
    return _file(ROOT / vid / "img" / "sc00.png", "image/png")


def _check_account(account_id: Optional[int]) -> None:
    if account_id is None:
        return
    with sqlite3.connect(str(CHANNELS_DB), timeout=30) as c:
        if not c.execute("SELECT 1 FROM channels WHERE id=?", (account_id,)).fetchone():
            raise HTTPException(400, "Không có tài khoản TikTok này")


@router.get("/accounts")
def accounts():
    with sqlite3.connect(str(CHANNELS_DB), timeout=30) as c:
        rows = c.execute("SELECT id, username FROM channels ORDER BY username").fetchall()
    return {"accounts": [{"id": cid, "name": name or f"#{cid}", "language": _account_language(cid)["language"]} for cid, name in rows]}


@router.get("/watch")
def watch_list():
    data = _watch_load()
    data["running_url"] = _runner().get("url") if _runner().get("running") else None
    return data


@router.post("/watch")
def watch_add(ch: WatchChannel):
    try:
        url = shorts_url(ch.url)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    with WATCH_LOCK:
        data = _watch_load()
        if any(c["url"] == url for c in data["channels"]):
            raise HTTPException(409, "Kênh này đã có trong danh sách theo dõi")
        _check_account(ch.account_id)
        data["channels"].append({"url": url, "limit": ch.limit, "lang": ch.lang, "images": ch.images, "enabled": True, "account_id": ch.account_id,
                                 "added": int(time.time()), "last_run": 0})
        _watch_save(data)
    start_watch()
    return {"added": url, "started": watch_tick()}  # rảnh thì chạy ngay kênh vừa thêm


@router.post("/watch/remove")
def watch_remove(ch: WatchChannel):
    with WATCH_LOCK:
        data = _watch_load()
        n = len(data["channels"])
        data["channels"] = [c for c in data["channels"] if c["url"] != ch.url]
        _watch_save(data)
    return {"removed": n != len(data["channels"])}


@router.post("/watch/toggle")
def watch_toggle(ch: WatchChannel):
    with WATCH_LOCK:
        data = _watch_load()
        for c in data["channels"]:
            if c["url"] == ch.url:
                c["enabled"] = not c.get("enabled", True)
                _watch_save(data)
                return {"enabled": c["enabled"]}
    raise HTTPException(404, "Không có kênh này")


@router.put("/watch/config")
def watch_config(cfg: WatchConfig):
    with WATCH_LOCK:
        data = _watch_load(); data.update(interval_min=cfg.interval_min, enabled=cfg.enabled); _watch_save(data)
    return data


# ---- Nguồn theo tài khoản: một bảng gán link YouTube (Story Remake, kênh Shorts theo dõi) hoặc profile Kuaishou
# (muse_remake) cho từng tài khoản TikTok. Mỗi tài khoản một nguồn; link tự nhận loại.
class SourceRow(BaseModel):
    account_id: int
    url: str = Field("", max_length=300)
    per_day: int = Field(3, ge=1, le=20)


class SourceRows(BaseModel):
    items: List[SourceRow] = Field(..., max_length=300)


def source_kind(url: str) -> str:
    u = url.strip().lower()
    if not u:
        return ""
    if "youtube.com/" in u or "youtu.be/" in u:
        return "youtube"
    if "kuaishou.com/" in u:
        return "kuaishou"
    raise ValueError("Link phải là kênh YouTube hoặc profile Kuaishou")


def _autopilot_niches() -> Dict[int, str]:
    try:
        with sqlite3.connect(str(REPO / "bkt_web" / "storage" / "autopilot.db"), timeout=30) as c:
            return {r[0]: r[1] for r in c.execute("SELECT tiktok_channel_id, niche_id FROM autopilot_channel_map")}
    except sqlite3.Error:
        return {}


@router.get("/sources")
def sources_by_account():
    from bkt_web import muse_remake
    watch = {c["account_id"]: c for c in _watch_load()["channels"] if c.get("account_id")}
    ks = {s["channel_id"]: s for s in muse_remake.sources()}
    niches = _autopilot_niches()
    with sqlite3.connect(str(CHANNELS_DB), timeout=30) as c:
        rows = c.execute("SELECT id, username, country, status FROM channels ORDER BY username").fetchall()
    out = []
    for cid, name, country, status in rows:
        y, k = watch.get(cid), ks.get(cid)
        out.append({"id": cid, "name": name or f"#{cid}", "country": country or "", "status": status or "",
                    "language": _account_language(cid)["language"], "autopilot_niche": niches.get(cid, ""),
                    "kind": "youtube" if y else ("kuaishou" if k else ""),
                    "url": (y or {}).get("url") or (k or {}).get("profile_url") or "",
                    "per_day": (y or {}).get("limit") or (k or {}).get("per_day") or 3,
                    "enabled": bool((y or {}).get("enabled", True) if y else (k or {}).get("enabled", 1)),
                    "last_run": (y or {}).get("last_run") or 0, "counts": (k or {}).get("counts") or {}})
    return {"accounts": out}


def _set_source(row: SourceRow, data: Dict[str, Any]) -> str:
    """Gán nguồn cho một tài khoản (data = watch.json đang khoá). Trả loại nguồn sau khi lưu."""
    from bkt_web import muse_remake
    kind = source_kind(row.url)
    url = shorts_url(row.url) if kind == "youtube" else row.url.strip()
    acc = row.account_id
    old_y = next((c for c in data["channels"] if c.get("account_id") == acc), None)
    old_k = next((s for s in muse_remake.sources() if s["channel_id"] == acc), None)
    if kind == "youtube":
        other = next((c for c in data["channels"] if c["url"] == url and c.get("account_id") != acc), None)
        if other:
            raise ValueError("Kênh YouTube này đã gán cho tài khoản khác (một kênh ↔ một tài khoản)")
    if old_k and not (kind == "kuaishou" and old_k["profile_url"] == muse_remake.multi_downloader.kuaishou_profile_url(url)):
        muse_remake.delete_source(old_k["id"])
        old_k = None
    if old_y and not (kind == "youtube" and old_y["url"] == url):
        data["channels"].remove(old_y)
        old_y = None
    if kind == "youtube":
        if old_y:
            old_y["limit"] = row.per_day
        else:
            data["channels"].append({"url": url, "limit": row.per_day, "lang": "auto", "images": "imagerouter", "enabled": True,
                                     "account_id": acc, "added": int(time.time()), "last_run": 0})
    elif kind == "kuaishou":
        if old_k:
            muse_remake.update_source(old_k["id"], per_day=min(row.per_day, 10))
        else:
            muse_remake.add_source(url, acc, min(row.per_day, 10))
    return kind


@router.put("/sources")
def save_sources(req: SourceRows):
    results = []
    with WATCH_LOCK:
        data = _watch_load()
        for row in req.items:
            try:
                _check_account(row.account_id)
                results.append({"account_id": row.account_id, "ok": True, "kind": _set_source(row, data)})
            except (ValueError, HTTPException) as exc:
                results.append({"account_id": row.account_id, "ok": False, "error": getattr(exc, "detail", None) or str(exc)})
        _watch_save(data)
    start_watch()
    return {"results": results}
