"""Menu "Phim AI (Muse)": /api/muse-film/* — tạo dự án phim nhiều cảnh, theo dõi, xem clip/phim, tạo lại cảnh lỗi."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

try:
    from bkt_web import muse_film
except ImportError:
    import muse_film

router = APIRouter(prefix="/api/muse-film", tags=["muse_film"])


class CreateRequest(BaseModel):
    idea: str = Field(..., min_length=5, max_length=8000)
    scenes: int = Field(6, ge=2, le=30)
    style: str = "cinematic"
    aspect: str = "9:16"
    keep_audio: bool = True
    title: str = ""


def _get(pid: str):
    try:
        return muse_film.load(pid)
    except (ValueError, FileNotFoundError):
        raise HTTPException(404, "Không có dự án này")


@router.get("/projects")
def projects():
    return {"projects": muse_film.list_projects(), "styles": list(muse_film.STYLES), "aspects": list(muse_film.ASPECTS),
            "accounts": muse_film.muse_image.accounts_status()}


@router.post("/projects")
def create(req: CreateRequest):
    return muse_film.create(req.idea, req.scenes, req.style, req.aspect, req.keep_audio, req.title)


@router.get("/projects/{pid}")
def project(pid: str):
    return _get(pid)


@router.post("/projects/{pid}/scenes/{i}/retry")
def retry(pid: str, i: int):
    _get(pid)
    return muse_film.retry_scene(pid, i)


@router.post("/projects/{pid}/stop")
def stop(pid: str):
    _get(pid)
    return muse_film.stop(pid)


@router.post("/projects/{pid}/resume")
def resume(pid: str):
    _get(pid)
    return muse_film.resume(pid)


@router.get("/projects/{pid}/clip/{i}")
def clip(pid: str, i: int):
    _get(pid)
    f = muse_film._dir(pid) / "clips" / f"scene{i:02d}.mp4"
    if not f.exists():
        raise HTTPException(404, "Clip chưa có")
    return FileResponse(str(f), media_type="video/mp4")


@router.get("/projects/{pid}/film")
def film(pid: str):
    _get(pid)
    f = muse_film._dir(pid) / "film.mp4"
    if not f.exists():
        raise HTTPException(404, "Phim chưa ghép xong")
    return FileResponse(str(f), media_type="video/mp4", filename=f"phim-{pid}.mp4")
