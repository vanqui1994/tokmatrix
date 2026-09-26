#!/usr/bin/env python3
"""
Cầu nối Hàng Đợi Kịch Bản TokMatrix ↔ tác nhân Antigravity.

Tương tự antigravity_agent.py (lo phần ảnh), file này lo kịch bản video.
Agent trong IDE chỉ cần:

    python3 bkt_web/antigravity_scriptwriter.py setup
    python3 bkt_web/antigravity_scriptwriter.py pull --limit 5
    # Agent đọc inbox/*.md, viết kịch bản, lưu JSON vào outbox/
    python3 bkt_web/antigravity_scriptwriter.py watch

Lệnh ``watch`` chạy nền: cứ thấy file .json trong outbox là tự nhập và đóng task.

Không cần API key — agent Antigravity trong IDE viết kịch bản trực tiếp.
Server TokMatrix phải đang chạy. Mặc định http://127.0.0.1:8080.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import socket
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Dict, List

BASE_DIR = Path(__file__).resolve().parent
DEFAULT_URL = os.environ.get("TOKMATRIX_URL", "http://127.0.0.1:8080")
ENGINE = "antigravity"

BRIDGE_ROOT = Path(
    os.environ.get(
        "TOKMATRIX_SCRIPT_BRIDGE_DIR",
        BASE_DIR / "storage" / "script_bridge",
    )
).expanduser().resolve()

# Prompt template cho từng loại video — agent đọc .md này để biết cần viết gì
VIDEO_TYPE_INSTRUCTIONS = {
    "compare": (
        "Viết kịch bản so sánh A vs B cho video TikTok.\n"
        "Format: 12-20 dòng thoại, mỗi dòng 8-14 từ.\n"
        "Cấu trúc: Hook → Giới thiệu A → Giới thiệu B → So sánh → Kết luận → CTA.\n"
        "Output JSON: {slug, labelLeft, labelRight, message, lines: [20 dòng], "
        "category, svgLeft?, svgRight?}"
    ),
    "folklore": (
        "Viết kịch bản Tâm Linh Dân Gian cho video TikTok.\n"
        "Format: characters (nhân vật), shots (khung hình), scenes (câu thoại).\n"
        "Output JSON: {slug, title, characters: [{id, look}], "
        "shots: [{id, imagePrompt}], scenes: [{line, shot, speaker?}]}"
    ),
    "mystery": (
        "Viết kịch bản Bí Ẩn / Sự Kiện Có Thật cho video TikTok.\n"
        "Format: 8 scene, mỗi scene có line + telemetry + imagePrompt.\n"
        "Output JSON: {slug, seriesTitle, topicTitle, fullScriptHtml, "
        "scenes: [{id, line, telemetry, imagePrompt}]}"
    ),
    "survival": (
        "Viết kịch bản sinh tồn (Survival Challenge) cho video TikTok.\n"
        "Output JSON theo format survival topic."
    ),
    "vox": (
        "Viết kịch bản Vox (chuyên đề giải thích) cho video TikTok.\n"
        "Output JSON theo format vox topic."
    ),
    "newspaper": (
        "Viết kịch bản tin tức Newspaper cho video TikTok.\n"
        "Output JSON theo format newspaper topic."
    ),
    "tierlist": (
        "Viết kịch bản xếp hạng (Tier List) cho video TikTok.\n"
        "Output JSON theo format tierlist topic."
    ),
    "wildlife": (
        "Viết kịch bản động vật hoang dã (Wildlife) cho video TikTok.\n"
        "Output JSON theo format wildlife topic."
    ),
    "kinetic": (
        "Viết kịch bản Kinetic Typography cho video TikTok.\n"
        "Output JSON theo format kinetic topic."
    ),
    "chalk": (
        "Viết kịch bản Chalk / Bảng đen cho video TikTok.\n"
        "Output JSON theo format chalk topic."
    ),
    "science": (
        "Viết kịch bản khoa học (Science) cho video TikTok.\n"
        "Output JSON theo format science topic."
    ),
    "matrix": (
        "Task của AI Matrix. Làm ĐÚNG theo phần Yêu cầu cụ thể bên dưới (tự chứa đủ ngữ cảnh).\n"
        "Output là MỘT object JSON khớp chính xác JSON schema ở cuối yêu cầu: đủ mọi trường required,\n"
        "đúng số phần tử, không thêm chữ, không bọc ```; viết bằng đúng ngôn ngữ yêu cầu."
    ),
}


# --------------------------------------------------------------------- HTTP


def _request(base_url: str, path: str, method: str = "GET", body: Any = None) -> Dict[str, Any]:
    url = base_url.rstrip("/") + path
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json"} if data else {}
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:300]
        raise SystemExit(f"Lỗi {exc.code} khi gọi {path}\n  {detail}")
    except urllib.error.URLError as exc:
        raise SystemExit(
            f"Không kết nối được {base_url} ({exc.reason}).\n"
            f"  Kiểm tra server TokMatrix đã chạy chưa, hoặc đổi --base-url."
        )


def fetch_pending(base_url: str) -> List[Dict[str, Any]]:
    """Lấy đúng phần việc kịch bản Antigravity đang chờ."""
    return _request(base_url, "/api/scripts/queue?status=pending&engine=antigravity").get("queue", [])


def find_task(base_url: str, task_id: str) -> Dict[str, Any] | None:
    result = _request(base_url, f"/api/scripts/queue/{urllib.parse.quote(task_id)}")
    return result.get("task")


def claim_task(base_url: str, task_id: str, worker_id: str) -> Dict[str, Any]:
    return _request(
        base_url, f"/api/scripts/queue/{urllib.parse.quote(task_id)}/claim",
        method="POST", body={"worker_id": worker_id},
    )["task"]


# ----------------------------------------------------------- bridge file I/O


def _bridge_dirs(root: Path) -> Dict[str, Path]:
    dirs = {name: root / name for name in ("inbox", "outbox", "archive", "failed")}
    root.mkdir(parents=True, exist_ok=True)
    for path in dirs.values():
        path.mkdir(parents=True, exist_ok=True)
    return dirs


def _task_stem(task_id: str) -> str:
    clean = "".join(ch for ch in task_id if ch.isalnum() or ch in "_-")
    if not clean or clean != task_id:
        raise ValueError("Task id không an toàn")
    return clean


def write_task_bundle(task: Dict[str, Any], root: Path) -> Dict[str, str]:
    """Ghi JSON + Markdown để agent trong IDE đọc mà không cần biết API."""
    dirs = _bridge_dirs(root)
    task_id = _task_stem(str(task["id"]))
    video_type = task.get("video_type", "compare")
    lang = task.get("lang", "vi")
    prompt = task.get("prompt", "")
    target_duration = task.get("target_duration", 65)
    output_path = dirs["outbox"] / f"{task_id}.json"

    # Parse extra fields
    channel_config = task.get("channel_config", "{}")
    if isinstance(channel_config, str):
        try:
            channel_config = json.loads(channel_config)
        except Exception:
            channel_config = {}
    extra_params = task.get("extra_params", "{}")
    if isinstance(extra_params, str):
        try:
            extra_params = json.loads(extra_params)
        except Exception:
            extra_params = {}

    payload = {
        "schema": "tokmatrix.script-bridge/v1",
        "task_id": task_id,
        "video_type": video_type,
        "lang": lang,
        "prompt": prompt,
        "channel_config": channel_config,
        "target_duration": target_duration,
        "extra_params": extra_params,
        "notes": task.get("notes", ""),
        "output_path": str(output_path),
        "callback": f"/api/scripts/queue/{task_id}/complete",
        "claimed_at": time.strftime("%Y-%m-%d %H:%M:%S"),
    }
    json_path = dirs["inbox"] / f"{task_id}.json"
    md_path = dirs["inbox"] / f"{task_id}.md"

    # Ghi JSON
    tmp_json = json_path.with_suffix(".json.tmp")
    tmp_json.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp_json.replace(json_path)

    # Ghi Markdown cho agent đọc
    type_instructions = VIDEO_TYPE_INSTRUCTIONS.get(video_type, VIDEO_TYPE_INSTRUCTIONS["compare"])
    channel_info = ""
    if channel_config:
        tone = channel_config.get("persona", {}).get("tone", "")
        voice_speed = channel_config.get("audio", {}).get("voice_speed", "")
        if tone or voice_speed:
            channel_info = f"\n## Phong cách kênh\n\n- Giọng: {tone}\n- Tốc độ: {voice_speed}\n"

    md = f"""# Antigravity script task `{task_id}`

Viết đúng **một kịch bản video** theo yêu cầu bên dưới. Đảm bảo output là JSON hợp lệ.

## Thể loại: `{video_type}`

{type_instructions}

## Yêu cầu cụ thể

{prompt if prompt else "(Tự chọn chủ đề phù hợp)"}

## Thông số

- Ngôn ngữ: `{lang}`
- Thời lượng mục tiêu: `{target_duration}` giây
{channel_info}
## Bàn giao bắt buộc

Xuất **JSON hợp lệ** vào đúng đường dẫn:

`{output_path}`

File JSON chứa kịch bản hoàn chỉnh theo format của thể loại `{video_type}`.
Bridge watcher sẽ tự kiểm tra và đóng task.
"""
    tmp_md = md_path.with_suffix(".md.tmp")
    tmp_md.write_text(md, encoding="utf-8")
    tmp_md.replace(md_path)

    return {"json": str(json_path), "markdown": str(md_path), "output": str(output_path)}


# ------------------------------------------------------------------ lệnh list


def cmd_list(args: argparse.Namespace) -> int:
    tasks = fetch_pending(args.base_url)
    if args.limit:
        tasks = tasks[: args.limit]

    if args.json:
        print(json.dumps(tasks, ensure_ascii=False, indent=2))
        return 0

    if not tasks:
        print("Không có task kịch bản Antigravity nào đang chờ.")
        return 0

    print(f"{len(tasks)} task kịch bản đang chờ Antigravity:\n")
    for task in tasks:
        print(f"  {task['id']}")
        print(f"    loại   : {task.get('video_type', 'compare')}")
        print(f"    ngôn ngữ: {task.get('lang', 'vi')}")
        if task.get("prompt"):
            print(f"    chủ đề : {task['prompt'][:80]}")
        if task.get("notes"):
            print(f"    ghi chú: {task['notes']}")
        print(f"    tạo lúc: {task.get('created_at', '')}")
        print()
    return 0


# -------------------------------------------------------------- lệnh complete


def complete_task(
    base_url: str, task_id: str, script_file: str | Path, *, notes: str,
) -> Dict[str, Any]:
    src = Path(script_file).expanduser().resolve()
    if not src.is_file():
        raise SystemExit(f"Không thấy file kịch bản: {src}")
    if src.suffix.lower() != ".json":
        raise SystemExit(f"File kịch bản phải là .json, không phải '{src.suffix}'")

    try:
        script_json = json.loads(src.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise SystemExit(f"File JSON không hợp lệ: {exc}")

    res = _request(
        base_url,
        f"/api/scripts/queue/{urllib.parse.quote(task_id)}/complete",
        method="POST",
        body={"script_json": script_json, "notes": notes},
    )
    return {"response": res, "task_id": task_id, "source": src}


def cmd_complete(args: argparse.Namespace) -> int:
    result = complete_task(
        args.base_url, args.task_id, args.script_file, notes=args.notes,
    )
    res = result["response"]
    print(f"✓ {res.get('message', 'Đã báo hoàn thành')}")
    print(f"  task  : {args.task_id}")
    print(f"  file  : {result['source']}")
    return 0


# ---------------------------------------------------------- bridge IDE files


def _write_bridge_readme(root: Path) -> Path:
    path = root / "README.md"
    path.write_text(
        """# TokMatrix ↔ Antigravity Script Bridge

1. TokMatrix đưa yêu cầu kịch bản vào hàng đợi Antigravity.
2. Chạy `python3 bkt_web/antigravity_scriptwriter.py pull` để claim và tạo file trong `inbox/`.
3. Agent Antigravity đọc file `.md`, viết kịch bản theo yêu cầu.
4. Agent xuất JSON kịch bản vào `outbox/`.
5. Chạy `python3 bkt_web/antigravity_scriptwriter.py watch` để tự nhập và đóng task.

Không cần API key. Agent viết kịch bản trực tiếp.
""",
        encoding="utf-8",
    )
    return path


def cmd_setup(args: argparse.Namespace) -> int:
    dirs = _bridge_dirs(args.bridge_dir)
    readme = _write_bridge_readme(args.bridge_dir)
    print("✓ Đã tạo script bridge cho Antigravity IDE")
    print(f"  hướng dẫn: {readme}")
    for name, path in dirs.items():
        print(f"  {name:7}: {path}")
    return 0


def cmd_pull(args: argparse.Namespace) -> int:
    _bridge_dirs(args.bridge_dir)
    tasks = list(reversed(fetch_pending(args.base_url)))
    if args.limit:
        tasks = tasks[:args.limit]
    if not tasks:
        print("Không có task kịch bản mới để pull.")
        return 0
    worker_id = args.worker_id or f"{socket.gethostname()}-{os.getpid()}"
    pulled = 0
    for task in tasks:
        try:
            claimed = claim_task(args.base_url, task["id"], worker_id)
            files = write_task_bundle(claimed, args.bridge_dir)
            pulled += 1
            print(f"✓ {task['id']} → {files['markdown']}")
            print(f"  output bắt buộc: {files['output']}")
        except (Exception, SystemExit) as exc:
            print(f"· Bỏ qua {task['id']}: {exc}", file=sys.stderr)
    print(f"Đã pull {pulled}/{len(tasks)} task kịch bản cho Antigravity IDE.")
    return 0


def import_outbox_once(args: argparse.Namespace) -> int:
    dirs = _bridge_dirs(args.bridge_dir)
    imported = 0
    files = sorted(
        p for p in dirs["outbox"].iterdir()
        if p.is_file() and p.suffix.lower() == ".json"
    )
    for script_path in files:
        task_id = script_path.stem
        try:
            _task_stem(task_id)
            # Kiểm tra JSON hợp lệ
            script_json = json.loads(script_path.read_text(encoding="utf-8"))
            if not isinstance(script_json, dict):
                raise ValueError("File JSON phải là object, không phải array")

            result = complete_task(
                args.base_url, task_id, script_path,
                notes="Hoàn thành qua Antigravity IDE script bridge",
            )
            # Archive
            archive_path = dirs["archive"] / f"{task_id}.json"
            if archive_path.exists():
                archive_path = dirs["archive"] / f"{task_id}-{int(time.time())}.json"
            shutil.move(str(script_path), archive_path)
            for suffix in (".json", ".md"):
                request_file = dirs["inbox"] / f"{task_id}{suffix}"
                if request_file.exists():
                    shutil.move(str(request_file), dirs["archive"] / request_file.name)
            imported += 1
            print(f"✓ Đã nhập kịch bản {task_id}")
        except (Exception, SystemExit) as exc:
            print(f"✗ Không nhập được {script_path.name}: {exc}", file=sys.stderr)
    return imported


def cmd_watch(args: argparse.Namespace) -> int:
    _write_bridge_readme(args.bridge_dir)
    while True:
        if not args.no_pull:
            pull_args = argparse.Namespace(
                base_url=args.base_url, bridge_dir=args.bridge_dir,
                limit=args.pull_limit, worker_id=args.worker_id,
            )
            cmd_pull(pull_args)
        imported = import_outbox_once(args)
        if args.once:
            print(f"Watch one-shot hoàn tất · nhập {imported} kịch bản.")
            return 0
        time.sleep(max(2, min(args.interval, 60)))


def cmd_doctor(args: argparse.Namespace) -> int:
    dirs = _bridge_dirs(args.bridge_dir)
    server_ok = False
    detail = ""
    try:
        data = _request(args.base_url, "/api/scripts/queue/stats")
        server_ok = bool(data.get("success"))
        pending = data.get("pending", 0)
        completed = data.get("completed", 0)
        detail = f"{pending} pending, {completed} completed"
    except SystemExit as exc:
        detail = str(exc).splitlines()[0]
    print(f"{'✓' if server_ok else '✗'} TokMatrix server: {args.base_url} · {detail}")
    print(f"✓ Script bridge directory: {args.bridge_dir}")
    print(f"  inbox={dirs['inbox']}\n  outbox={dirs['outbox']}")
    inbox_count = len(list(dirs["inbox"].glob("*.md")))
    outbox_count = len(list(dirs["outbox"].glob("*.json")))
    print(f"  inbox: {inbox_count} task · outbox: {outbox_count} kịch bản")
    return 0 if server_ok else 1


# ---------------------------------------------------------------------- main


def main(argv: List[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Cầu nối Hàng Đợi Kịch Bản TokMatrix ↔ tác nhân Antigravity",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--base-url", default=DEFAULT_URL,
        help=f"Địa chỉ server TokMatrix (mặc định {DEFAULT_URL}, hoặc đặt TOKMATRIX_URL)",
    )
    parser.add_argument(
        "--bridge-dir", type=Path, default=BRIDGE_ROOT,
        help=f"Thư mục trao đổi kịch bản với IDE (mặc định {BRIDGE_ROOT})",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p_setup = sub.add_parser("setup", help="Tạo inbox/outbox và hướng dẫn cho IDE agent")
    p_setup.set_defaults(func=cmd_setup)

    p_doctor = sub.add_parser("doctor", help="Kiểm tra server và bridge")
    p_doctor.set_defaults(func=cmd_doctor)

    p_list = sub.add_parser("list", help="Xem các task kịch bản đang chờ")
    p_list.add_argument("--json", action="store_true", help="In JSON cho agent đọc máy")
    p_list.add_argument("--limit", type=int, default=0, help="Chỉ lấy N task đầu")
    p_list.set_defaults(func=cmd_list)

    p_pull = sub.add_parser("pull", help="Claim task và tạo gói công việc cho IDE")
    p_pull.add_argument("--limit", type=int, default=5, help="Số task kéo mỗi lần")
    p_pull.add_argument("--worker-id", default="", help="Tên agent/IDE claim task")
    p_pull.set_defaults(func=cmd_pull)

    p_done = sub.add_parser("complete", help="Nộp kịch bản đã viết và báo hoàn thành")
    p_done.add_argument("task_id", help="Id task, lấy từ lệnh list")
    p_done.add_argument("script_file", help="Đường dẫn file JSON kịch bản")
    p_done.add_argument(
        "--notes", default="Hoàn thành bởi Antigravity",
        help="Ghi chú hiện trong hàng đợi",
    )
    p_done.set_defaults(func=cmd_complete)

    p_watch = sub.add_parser("watch", help="Theo dõi outbox, tự nhập kịch bản và đóng task")
    p_watch.add_argument("--once", action="store_true", help="Quét một lần rồi thoát")
    p_watch.add_argument("--interval", type=int, default=10, help="Số giây giữa hai lần quét")
    p_watch.add_argument("--no-pull", action="store_true", help="Không tự kéo task pending")
    p_watch.add_argument("--pull-limit", type=int, default=5, help="Số task tự pull mỗi vòng")
    p_watch.add_argument("--worker-id", default="", help="Tên agent/IDE claim task")
    p_watch.set_defaults(func=cmd_watch)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
