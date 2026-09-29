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

router = APIRouter(prefix="/api/story-remake", tags=["story_remake"])


class RunRequest(BaseModel):
    url: str = Field(..., min_length=8)
    limit: int = Field(5, ge=1, le=50)
    jobs: int = Field(1, ge=1, le=3)
    lang: str = "auto"
    images: str = Field("imagerouter", pattern="^(imagerouter|muse)$")


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
    return info


def _videos() -> List[Dict[str, Any]]:
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
        s.setdefault("status", "running")
        out.append(s)
    # video đang chạy (chưa có state.json)
    for work in ROOT.iterdir():
        if work.is_dir() and work.name not in ("out",) and not (work / "state.json").exists() and (work / "vo.mp3").exists():
            steps = [n for n in ("words.json", "plan.json", "sources.json") if (work / n).exists()]
            out.append({"id": work.name, "status": "running", "step": steps[-1] if steps else "vo.mp3", "updated": int(work.stat().st_mtime),
                        "has_mp4": False, "has_thumb": (work / "img" / "sc00.png").exists()})
    return sorted(out, key=lambda s: -s["updated"])


@router.get("/status")
def status():
    log = ""
    if LOG.exists():
        log = "\n".join(LOG.read_text(errors="ignore").splitlines()[-40:])
    return {"runner": _runner(), "videos": _videos(), "log": log}


@router.post("/run")
def run(req: RunRequest):
    if _runner().get("running"):
        raise HTTPException(409, "Đang có một lượt chạy — dừng lượt đó trước")
    ROOT.mkdir(parents=True, exist_ok=True)
    cmd = [sys.executable, str(TOOL), "channel" if ("/@" in req.url or "/channel/" in req.url or "/c/" in req.url or "list=" in req.url) else "video", req.url]
    if cmd[2] == "channel":
        cmd += ["--limit", str(req.limit), "--jobs", str(req.jobs)]
    cmd += ["--lang", req.lang]
    log = open(LOG, "w")
    env = {**os.environ, "STORY_REMAKE_IMAGES": req.images}
    proc = subprocess.Popen(cmd, cwd=str(REPO), stdout=log, stderr=subprocess.STDOUT, start_new_session=True, env=env)
    RUNNER.write_text(json.dumps({"pid": proc.pid, "url": req.url, "limit": req.limit, "jobs": req.jobs, "images": req.images, "started": int(time.time())}))
    return {"started": True, "pid": proc.pid}


@router.post("/stop")
def stop():
    info = _runner()
    if not info.get("running"):
        return {"stopped": False}
    try:
        os.killpg(info["pid"], signal.SIGTERM)
    except OSError:
        pass
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
