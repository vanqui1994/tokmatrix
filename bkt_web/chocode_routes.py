"""Endpoint /api/tiktok-api/* — bọc TikTok REST API Gateway của chocode.

Mọi lời gọi đi qua danh mục trong ``chocode_tiktok.ENDPOINTS``; lệnh ghi (tim,
follow, bình luận, DM, showcase) phải gửi kèm ``confirm_write=true``. Đồng bộ
hồ sơ kênh từ chối kết quả có dấu hiệu dữ liệu mẫu, không ghi đè số liệu thật.
"""

import threading
import time
from typing import Any, Dict, Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel, ConfigDict, Field

try:
    from bkt_web import chocode_tiktok as api
    from bkt_web.db_utils import connect_db
except ImportError:
    import chocode_tiktok as api
    from db_utils import connect_db

router = APIRouter(prefix="/api/tiktok-api", tags=["tiktok_api"])
DB_PATH = api.key_vault.DB_PATH

# server.py gắn hàm ghi mốc lịch sử (channel_metrics_history) vào đây; module
# này không import server để tránh vòng import.
after_channel_update = None

SYNC_LOCK = threading.Lock()
sync_status: Dict[str, Any] = {"running": False, "total": 0, "done": 0, "updated": 0, "failed": 0,
                               "errors": [], "started_at": 0, "finished_at": 0}


def _raise(exc: api.ChocodeError):
    raise HTTPException(status_code=exc.status_code, detail=str(exc))


class CallItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    path: str = Field(max_length=200)
    params: Dict[str, Any] = Field(default_factory=dict)
    body: Optional[Dict[str, Any]] = None
    confirm_write: bool = False


class ConfigItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    block_mock: bool


@router.get("/status")
def status():
    return {"configured": api.is_configured(), "base_url": api.BASE_URL,
            "endpoint_count": len(api.ENDPOINTS), "block_mock": api.block_mock(), "gateway": api.health()}


@router.put("/config")
def update_config(item: ConfigItem):
    api.set_block_mock(item.block_mock)
    return {"block_mock": api.block_mock()}


@router.get("/endpoints")
def endpoints():
    return {"endpoints": api.catalog()}


@router.post("/call")
def call_endpoint(item: CallItem):
    endpoint = api.ENDPOINT_BY_PATH.get(item.path)
    if not endpoint:
        raise HTTPException(status_code=404, detail=f"Endpoint không có trong danh mục: {item.path}")
    if endpoint.write and not item.confirm_write:
        raise HTTPException(status_code=400, detail="Lệnh này tác động lên tài khoản TikTok — cần xác nhận (confirm_write)")
    if item.body is not None and endpoint.method == "GET":
        raise HTTPException(status_code=400, detail="Endpoint GET không nhận body")
    try:
        return api.call(item.path, item.params, item.body)
    except api.ChocodeError as exc:
        _raise(exc)


@router.get("/profile")
def profile(username: str):
    try:
        return api.fetch_profile(username)
    except api.ChocodeError as exc:
        _raise(exc)


@router.get("/video")
def video(url: str):
    try:
        return api.resolve_video_download(url)
    except api.ChocodeError as exc:
        _raise(exc)


def _apply_profile(conn, ch_id: int, prof: Dict[str, Any]) -> None:
    conn.execute(
        "UPDATE channels SET nickname=?, follower_count=?, like_count=?, video_count=? WHERE id=?",
        (prof["nickname"], prof["follower_count"], prof["like_count"], prof["video_count"], ch_id),
    )


def sync_channel(ch_id: int) -> Dict[str, Any]:
    conn = connect_db(DB_PATH)
    try:
        row = conn.execute("SELECT username FROM channels WHERE id=?", (ch_id,)).fetchone()
        if not row:
            raise api.ChocodeError("Kênh không tồn tại", 404)
        username = (row[0] or "").strip()
        if not username:
            raise api.ChocodeError("Kênh chưa có username — hãy check cookie trước", 400)
        prof = api.fetch_profile(username)
        if prof["username"].lower() != username.lstrip("@").lower():
            raise api.ChocodeError(f"API trả hồ sơ @{prof['username']} khác @{username}")
        _apply_profile(conn, ch_id, prof)
        if after_channel_update:
            after_channel_update(conn, ch_id)
        conn.commit()
        return prof
    finally:
        conn.close()


@router.post("/channels/{ch_id}/sync-profile")
def sync_channel_profile(ch_id: int):
    try:
        return {"message": "Đã cập nhật hồ sơ kênh từ TikTok API", "profile": sync_channel(ch_id)}
    except api.ChocodeError as exc:
        _raise(exc)


def _sync_all_worker(ids):
    for ch_id in ids:
        try:
            sync_channel(ch_id)
            ok = True
        except api.ChocodeError as exc:
            ok = False
            err = f"#{ch_id}: {exc}"
        with SYNC_LOCK:
            sync_status["done"] += 1
            if ok:
                sync_status["updated"] += 1
            else:
                sync_status["failed"] += 1
                sync_status["errors"] = (sync_status["errors"] + [err])[-50:]
    with SYNC_LOCK:
        sync_status["running"] = False
        sync_status["finished_at"] = int(time.time())


@router.post("/channels/sync-all")
def sync_all_profiles(background_tasks: BackgroundTasks):
    if not api.is_configured():
        raise HTTPException(status_code=400, detail="Chưa cấu hình khoá TikTok API (chocode)")
    conn = connect_db(DB_PATH)
    try:
        ids = [r[0] for r in conn.execute("SELECT id FROM channels WHERE COALESCE(username,'')<>'' ORDER BY id")]
    finally:
        conn.close()
    with SYNC_LOCK:
        if sync_status["running"]:
            return {"message": "Đang đồng bộ, vui lòng chờ...", **sync_status}
        sync_status.update(running=True, total=len(ids), done=0, updated=0, failed=0, errors=[],
                           started_at=int(time.time()), finished_at=0)
    background_tasks.add_task(_sync_all_worker, ids)
    return {"message": f"Bắt đầu đồng bộ hồ sơ {len(ids)} kênh qua TikTok API", "total": len(ids)}


@router.get("/channels/sync-status")
def sync_all_status():
    with SYNC_LOCK:
        return dict(sync_status)
