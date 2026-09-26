"""CLI một dòng JSON cho Node (AI Matrix) gọi Hàng Đợi Kịch Bản mà không qua HTTP.

    echo '{"op":"enqueue","prompt":"...","lang":"en","extra_params":{...}}' | python -m bkt_web.script_queue_cli
    echo '{"op":"get","task_id":"script_..."}' | python -m bkt_web.script_queue_cli
    echo '{"op":"fail","task_id":"script_...","error":"..."}' | python -m bkt_web.script_queue_cli

In ra đúng một dòng {"ok": true, "result": ...} hoặc {"ok": false, "error": "..."}.
"""
from __future__ import annotations

import json
import sys

try:
    from bkt_web import script_routes as routes
except ImportError:
    import script_routes as routes


def _dispatch(payload: dict):
    if payload.get("db_path"):  # test dùng DB tạm
        from pathlib import Path
        routes.DB_PATH = Path(payload["db_path"])
        conn = routes._db()
        try:
            has_table = conn.execute("SELECT 1 FROM sqlite_master WHERE name='script_queue'").fetchone()
        finally:
            conn.close()
        if not has_table:  # init_script_tables còn trả task 'processing' về 'pending' — chỉ gọi khi DB trống
            routes.init_script_tables()
    op = payload.get("op")
    if op == "enqueue":
        result = routes.enqueue_script(routes.EnqueueScriptRequest(
            video_type=payload.get("video_type", "matrix"),
            lang=payload.get("lang", "vi"),
            prompt=payload.get("prompt", ""),
            target_duration=int(payload.get("target_duration", 60)),
            extra_params=payload.get("extra_params") or {},
            notes=payload.get("notes", "AI Matrix đang chờ Antigravity"),
        ))
        return {"task_id": result["task_ids"][0]}
    if op == "get":
        task = routes.get_script_task(payload["task_id"])["task"]
        return {"status": task["status"], "script_json": task["script_json"], "error_message": task["error_message"]}
    if op == "fail":
        routes.fail_script_task(payload["task_id"], payload.get("error", ""))
        return {"failed": True}
    raise ValueError(f"op không hợp lệ: {op}")


def main() -> int:
    try:
        routes.init_script_tables  # noqa: B018 — bảo đảm import được
        result = _dispatch(json.loads(sys.stdin.read() or "{}"))
        print(json.dumps({"ok": True, "result": result}, ensure_ascii=False))
        return 0
    except Exception as exc:  # báo lỗi cho Node thay vì traceback
        detail = getattr(exc, "detail", None) or str(exc)
        print(json.dumps({"ok": False, "error": f"{type(exc).__name__}: {detail}"}, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
