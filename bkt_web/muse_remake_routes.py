"""Menu "Kuaishou → Muse": /api/muse-remake/* — gán profile Kuaishou cho tài khoản TikTok, theo dõi video remake, xoá."""
from __future__ import annotations

from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

try:
    from bkt_web import muse_remake
except ImportError:
    import muse_remake

router = APIRouter(prefix="/api/muse-remake", tags=["muse_remake"])


class SourceRequest(BaseModel):
    profile_url: str = Field(..., min_length=20, max_length=300)
    channel_id: int
    per_day: int = Field(2, ge=1, le=10)


class SourceUpdate(BaseModel):
    per_day: Optional[int] = Field(None, ge=1, le=10)
    enabled: Optional[bool] = None


@router.get("/sources")
def list_sources():
    return {"sources": muse_remake.sources(), "status": muse_remake.status()}


@router.post("/sources")
def add_source(req: SourceRequest):
    try:
        return muse_remake.add_source(req.profile_url, req.channel_id, req.per_day)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.patch("/sources/{sid}")
def update_source(sid: int, req: SourceUpdate):
    muse_remake.update_source(sid, per_day=req.per_day, enabled=req.enabled)
    return {"ok": True}


@router.delete("/sources/{sid}")
def delete_source(sid: int):
    muse_remake.delete_source(sid)
    return {"ok": True}


@router.post("/sources/{sid}/scan")
def scan_now(sid: int, deep: bool = False):
    """deep=1: quét video cũ (tới muse_remake.DEEP_SCAN) ở nền, trả trạng thái; video đã remake không bị làm lại."""
    src = next((s for s in muse_remake.sources() if s["id"] == sid), None)
    if not src:
        raise HTTPException(404, "Không có nguồn này")
    if deep:
        return muse_remake.deep_scan_async(src)
    try:
        added = muse_remake.scan(src)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"Quét profile lỗi: {e}")
    muse_remake.wake()
    return {"added": added}


@router.get("/sources/{sid}/scan")
def scan_status(sid: int):
    return muse_remake.deep_scan_status(sid)


@router.get("/accounts")
def accounts():
    used = {s["channel_id"] for s in muse_remake.sources()}
    names = muse_remake._account_names()
    return {"accounts": [{"id": cid, "name": name, "language": muse_remake.account_voice(cid)["language"], "used": cid in used}
                         for cid, name in sorted(names.items())]}


@router.get("/videos")
def list_videos(source_id: Optional[int] = None):
    return {"videos": muse_remake.videos(source_id)}


@router.delete("/videos/{vid}")
def delete_video(vid: int):
    try:
        return muse_remake.delete_video(vid)
    except ValueError as e:
        raise HTTPException(404, str(e))


@router.post("/videos/{vid}/retry")
def retry_video(vid: int):
    muse_remake.retry_video(vid)
    return {"ok": True}


@router.get("/videos/{vid}/file")
def video_file(vid: int):
    try:
        path = Path(muse_remake._video(vid)["final_path"] or "")
    except ValueError:
        raise HTTPException(404, "Không có video này")
    if not path.is_file() or muse_remake.BASE.resolve() not in path.resolve().parents:
        raise HTTPException(404, "Video chưa dựng xong")
    return FileResponse(path, media_type="video/mp4")
