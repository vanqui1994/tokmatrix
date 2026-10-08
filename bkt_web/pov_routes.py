"""Kênh POV tự động: /api/pov/* — nguồn theo tài khoản (nhân vật cố định), video, xem, xoá, làm lại."""
from __future__ import annotations

from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

try:
    from bkt_web import pov_channel
except ImportError:
    import pov_channel

router = APIRouter(prefix="/api/pov", tags=["pov"])


class SourceRequest(BaseModel):
    channel_id: int
    per_day: int = Field(1, ge=1, le=5)
    theme: str = Field("money, work and quietly choosing a calmer life than everyone around you", max_length=300)
    character: str = Field("", max_length=600)


class SourceUpdate(BaseModel):
    per_day: Optional[int] = Field(None, ge=1, le=5)
    enabled: Optional[bool] = None


@router.get("/sources")
def list_sources():
    return {"sources": pov_channel.sources(), "status": pov_channel.status()}


@router.post("/sources")
def add_source(req: SourceRequest):
    try:
        return pov_channel.add_source(req.channel_id, req.theme, req.per_day, req.character)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.patch("/sources/{sid}")
def update_source(sid: int, req: SourceUpdate):
    pov_channel.update_source(sid, per_day=req.per_day, enabled=req.enabled)
    return {"ok": True}


@router.get("/videos")
def list_videos():
    return {"videos": [v for v in pov_channel.videos() if v["status"] != "deleted"]}


@router.delete("/videos/{vid}")
def delete_video(vid: int):
    try:
        return pov_channel.delete_video(vid)
    except ValueError as e:
        raise HTTPException(404, str(e))


@router.post("/videos/{vid}/retry")
def retry_video(vid: int):
    pov_channel.retry_video(vid)
    return {"ok": True}


@router.get("/videos/{vid}/file")
def video_file(vid: int):
    v = next((x for x in pov_channel.videos(1000) if x["id"] == vid), None)
    path = Path((v or {}).get("final_path") or "")
    if not path.is_file() or pov_channel.BASE.resolve() not in path.resolve().parents:
        raise HTTPException(404, "Video chưa dựng xong")
    return FileResponse(path, media_type="video/mp4")
