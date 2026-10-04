"""Menu "Story Remake": kênh YouTube → remake phần hình (ảnh phim ImageRouter), giữ audio gốc.

Chạy compare_studio/tools/story_remake.py thành một tiến trình nền (một lượt chạy một lúc), đọc trạng thái từ
compare_studio/.runtime/story-remake/<id>/state.json.
"""
from __future__ import annotations

import json
import os
import signal
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Dict, List

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

router = APIRouter(prefix="/api/story-remake", tags=["story_remake"])


class RunRequest(BaseModel):
    url: str = Field(..., min_length=8, pattern=r"^https?://\S+$")  # không cho "-..." (cờ yt-dlp/argparse) hay đường dẫn file trên server
    limit: int = Field(5, ge=1, le=50)
    jobs: int = Field(1, ge=1, le=3)
    lang: str = "auto"
    images: str = Field("muse", pattern="^(imagerouter|muse)$")


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


def _launch(url: str, limit: int, jobs: int, lang: str, images: str, resumed: bool = False, resumes: int = 0) -> int:
    ROOT.mkdir(parents=True, exist_ok=True)
    mode = "channel" if ("/@" in url or "/channel/" in url or "/c/" in url or "list=" in url) else "video"
    cmd = [sys.executable, str(TOOL), mode, url] + (["--limit", str(limit), "--jobs", str(jobs)] if mode == "channel" else []) + ["--lang", lang]
    log = open(LOG, "a" if resumed else "w")
    if resumed:
        log.write(f"\n[{time.strftime('%H:%M:%S')}] tự chạy tiếp sau khi web app khởi động lại\n"); log.flush()
    env = {**os.environ, "STORY_REMAKE_IMAGES": images}
    proc = subprocess.Popen(cmd, cwd=str(REPO), stdout=log, stderr=subprocess.STDOUT, start_new_session=True, env=env)
    RUNNER.write_text(json.dumps({"pid": proc.pid, "url": url, "limit": limit, "jobs": jobs, "lang": lang, "images": images,
                                  "started": int(time.time()), "active": True, "resumes": resumes}))
    return proc.pid


def resume_interrupted() -> None:
    """Gọi lúc server khởi động: lượt chạy chưa xong (active, tiến trình đã chết theo web app) → chạy lại, tool tự bỏ qua video đã xong."""
    info = _runner()
    if info.get("active") and not info.get("running") and info.get("url"):
        n = int(info.get("resumes", 0)) + 1
        if n > MAX_RESUMES:  # chết liên tục (SIGKILL/OOM) → thôi, không chạy lại mãi mỗi lần web app khởi động
            info.pop("running", None); info["active"] = False
            RUNNER.write_text(json.dumps(info))
            return
        _launch(info["url"], info.get("limit", 5), info.get("jobs", 1), info.get("lang", "auto"), info.get("images", "muse"), resumed=True, resumes=n)


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
    pid = _launch(req.url, req.limit, req.jobs, req.lang, req.images)
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
