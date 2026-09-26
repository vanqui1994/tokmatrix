#!/usr/bin/env python3
"""
Cầu nối giữa Hàng Đợi Ảnh của TokMatrix và tác nhân Antigravity.

Bối cảnh: task đưa vào hàng đợi với engine 'antigravity' KHÔNG được worker nội bộ
(Pollinations) xử lý — xem EXTERNAL_ENGINES trong image_routes.py. Chúng nằm chờ
một tác nhân ngoài sinh ảnh rồi tự báo về. Script này là phần "báo về" đó, để
agent trong Antigravity IDE chỉ cần chạy hai lệnh thay vì tự gọi HTTP.

    # 1. Khởi tạo bridge và kéo task vào IDE workspace
    python3 antigravity_agent.py setup
    python3 antigravity_agent.py pull --limit 1

    # 2. Agent đọc inbox/*.md, tạo ảnh rồi lưu đúng tên vào outbox/
    # 3. Bridge tự nhập kết quả và đóng task
    python3 antigravity_agent.py watch

Lệnh `complete` làm 3 việc:
  - chép ảnh vào static/generated_images/ với tên chuẩn antigravity_*
  - ghi file .json kèm theo (prompt, tỉ lệ, engine) để Thư Viện hiện đúng thông
    tin và gắn nhãn ✨ Antigravity, thay vì suy prompt từ tên file
  - gọi POST /api/ai-images/queue/{id}/complete để task chuyển sang 'completed'

Server phải đang chạy. Mặc định http://127.0.0.1:8080, đổi bằng --base-url
hoặc biến môi trường TOKMATRIX_URL.
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
GENERATED_DIR = BASE_DIR / "static" / "generated_images"
DEFAULT_URL = os.environ.get("TOKMATRIX_URL", "http://127.0.0.1:8080")

VALID_EXTS = {".jpg", ".jpeg", ".png", ".webp"}
ENGINE = "antigravity"
BRIDGE_ROOT = Path(
    os.environ.get("TOKMATRIX_ANTIGRAVITY_BRIDGE_DIR", BASE_DIR / "storage" / "antigravity_bridge")
).expanduser().resolve()
RATIO_DIMENSIONS = {
    "1:1": (2048, 2048), "9:16": (1440, 2560), "16:9": (2560, 1440),
    "4:3": (2048, 1536), "3:4": (1536, 2048),
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
    """Lấy đúng phần việc của Antigravity, không lẫn task của worker nội bộ."""
    query = urllib.parse.urlencode({"status": "pending", "engine": ENGINE})
    return _request(base_url, f"/api/ai-images/queue?{query}").get("queue", [])


def find_task(base_url: str, task_id: str) -> Dict[str, Any] | None:
    for task in _request(base_url, "/api/ai-images/queue").get("queue", []):
        if task["id"] == task_id:
            return task
    return None


def claim_task(base_url: str, task_id: str, worker_id: str) -> Dict[str, Any]:
    return _request(
        base_url, f"/api/ai-images/queue/{urllib.parse.quote(task_id)}/claim",
        method="POST", body={"worker_id": worker_id},
    )["task"]


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
    ratio = task.get("aspect_ratio") or "1:1"
    width, height = RATIO_DIMENSIONS.get(ratio, RATIO_DIMENSIONS["1:1"])
    output_path = dirs["outbox"] / f"{task_id}.png"
    payload = {
        "schema": "tokmatrix.antigravity-bridge/v1",
        "task_id": task_id,
        "prompt": task.get("prompt", ""),
        "negative_prompt": task.get("negative_prompt", ""),
        "aspect_ratio": ratio,
        "recommended_size": {"width": width, "height": height},
        "seed": task.get("seed"),
        "notes": task.get("notes", ""),
        "output_path": str(output_path),
        "callback": f"/api/ai-images/queue/{task_id}/complete",
        "claimed_at": time.strftime("%Y-%m-%d %H:%M:%S"),
    }
    json_path = dirs["inbox"] / f"{task_id}.json"
    md_path = dirs["inbox"] / f"{task_id}.md"
    tmp_json = json_path.with_suffix(".json.tmp")
    tmp_json.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp_json.replace(json_path)
    negative = payload["negative_prompt"] or "(không có)"
    md = f"""# Antigravity image task `{task_id}`

Tạo đúng **một ảnh** trong Antigravity IDE. Không đổi nội dung, không thêm chữ,
logo hoặc watermark nếu prompt không yêu cầu.

## Prompt

{payload['prompt']}

## Tránh

{negative}

## Thông số

- Tỉ lệ: `{ratio}`
- Kích thước khuyến nghị: `{width} × {height}`
- Seed: `{payload['seed'] if payload['seed'] is not None else 'tự động'}`

## Bàn giao bắt buộc

Xuất PNG/JPG/WebP vào đúng đường dẫn sau (tên gốc phải là task id):

`{output_path}`

Bridge watcher sẽ tự kiểm tra ảnh, chép vào Thư viện TokMatrix và đóng task.
Không tự gọi `agentapi`: đó là language server, không phải API sinh ảnh.
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
        print("Không có task Antigravity nào đang chờ.")
        return 0

    print(f"{len(tasks)} task đang chờ Antigravity:\n")
    for task in tasks:
        print(f"  {task['id']}")
        print(f"    prompt : {task.get('prompt', '')}")
        if task.get("negative_prompt"):
            print(f"    tránh  : {task['negative_prompt']}")
        print(f"    tỉ lệ  : {task.get('aspect_ratio') or '1:1'}")
        if task.get("notes"):
            print(f"    ghi chú: {task['notes']}")
        print(f"    tạo lúc: {task.get('created_at', '')}")
        print()
    print("Sinh ảnh xong thì nộp lại bằng:")
    print(f"  python3 {Path(__file__).name} complete <task_id> <đường/dẫn/ảnh>")
    return 0


# -------------------------------------------------------------- lệnh complete


def complete_task(
    base_url: str, task_id: str, image: str | Path, *, notes: str,
    model: str = "antigravity", tags: str = "", force: bool = False,
) -> Dict[str, Any]:
    src = Path(image).expanduser().resolve()
    if not src.is_file():
        raise SystemExit(f"Không thấy file ảnh: {src}")
    ext = src.suffix.lower()
    if ext not in VALID_EXTS:
        raise SystemExit(
            f"Đuôi file '{ext}' không được Thư Viện đọc. Chấp nhận: {', '.join(sorted(VALID_EXTS))}"
        )

    task = find_task(base_url, task_id)
    if task is None:
        raise SystemExit(
            f"Không thấy task '{task_id}' trong hàng đợi.\n"
            f"  Chạy `{Path(__file__).name} list` để xem id hợp lệ."
        )
    if task.get("status") == "completed" and not force:
        raise SystemExit(
            f"Task này đã 'completed' (file {task.get('image_filename')}).\n"
            f"  Thêm --force nếu muốn ghi đè."
        )

    GENERATED_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"antigravity_{int(time.time())}_{task_id.split('_')[-1]}{ext}"
    dest = GENERATED_DIR / filename
    shutil.copy2(src, dest)

    # Sidecar .json: Thư Viện đọc file này (_sync_assets_from_disk) để hiện đúng
    # prompt và gắn nhãn engine, thay vì suy prompt từ tên file.
    width, height = _image_size(dest)
    sidecar = {
        "filename": filename,
        "url": f"/static/generated_images/{filename}",
        "prompt": task.get("prompt", ""),
        "negative_prompt": task.get("negative_prompt", ""),
        "aspect_ratio": task.get("aspect_ratio") or "1:1",
        "model": model,
        "seed": task.get("seed"),
        "width": width,
        "height": height,
        "engine": ENGINE,
        "tags": tags,
        "created_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "size_bytes": dest.stat().st_size,
    }
    dest.with_suffix(".json").write_text(
        json.dumps(sidecar, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    res = _request(
        base_url,
        f"/api/ai-images/queue/{task_id}/complete",
        method="POST",
        body={"image_filename": filename, "notes": notes},
    )
    return {"response": res, "task": task, "source": src, "destination": dest, "filename": filename, "width": width, "height": height}


def cmd_complete(args: argparse.Namespace) -> int:
    result = complete_task(
        args.base_url, args.task_id, args.image, notes=args.notes,
        model=args.model, tags=args.tags, force=args.force,
    )
    res, dest = result["response"], result["destination"]

    print(f"✓ {res.get('message', 'Đã báo hoàn thành')}")
    print(f"  task  : {args.task_id}")
    print(f"  ảnh   : {dest}")
    print(f"  kích cỡ: {result['width']}x{result['height']}" if result["width"] else "  kích cỡ: (không đọc được)")
    print(f"  URL   : /static/generated_images/{result['filename']}")
    return 0


def _image_size(path: Path) -> tuple:
    """Đọc kích thước ảnh; Pillow là tuỳ chọn, thiếu cũng không sao."""
    try:
        from PIL import Image  # type: ignore

        with Image.open(path) as im:
            return im.size
    except Exception:
        return (0, 0)


# ---------------------------------------------------------- bridge IDE files


def _write_bridge_readme(root: Path) -> Path:
    path = root / "README.md"
    path.write_text(
        """# TokMatrix ↔ Antigravity IDE bridge

1. TokMatrix đưa yêu cầu ảnh vào hàng đợi Antigravity.
2. Chạy `python3 bkt_web/antigravity_agent.py pull` để claim và tạo file trong `inbox/`.
3. Agent Antigravity đọc file `.md`, tạo ảnh bằng công cụ trong IDE.
4. Agent xuất ảnh đúng tên task vào `outbox/`.
5. Chạy `python3 bkt_web/antigravity_agent.py watch` để tự nhập ảnh và đóng task.

`agentapi` không được dùng để sinh ảnh; nó chỉ là language server của IDE.
Không đặt API key vào inbox/outbox.
""",
        encoding="utf-8",
    )
    return path


def cmd_setup(args: argparse.Namespace) -> int:
    dirs = _bridge_dirs(args.bridge_dir)
    readme = _write_bridge_readme(args.bridge_dir)
    print("✓ Đã tạo bridge cho Antigravity IDE")
    print(f"  hướng dẫn: {readme}")
    for name, path in dirs.items():
        print(f"  {name:7}: {path}")
    return 0


def cmd_doctor(args: argparse.Namespace) -> int:
    dirs = _bridge_dirs(args.bridge_dir)
    server_ok = False
    detail = ""
    try:
        data = _request(args.base_url, f"/api/ai-images/queue?engine={ENGINE}")
        server_ok = bool(data.get("success"))
        detail = f"{data.get('total', 0)} task Antigravity"
    except SystemExit as exc:
        detail = str(exc).splitlines()[0]
    app_candidates = [
        # macOS
        Path("/Applications/Antigravity.app"),
        Path.home() / "Applications" / "Antigravity.app",
        # Linux (bản tar.gz giải nén, ví dụ trên VPS)
        Path("/opt/antigravity/antigravity"),
        Path("/usr/local/bin/antigravity"),
        Path.home() / ".local" / "share" / "antigravity" / "antigravity",
    ]
    app_path = next((p for p in app_candidates if p.exists()), None)
    agentapi = Path.home() / ".gemini" / "antigravity-ide" / "bin" / "agentapi"
    print(f"{'✓' if server_ok else '✗'} TokMatrix server: {args.base_url} · {detail}")
    print(f"{'✓' if app_path else '·'} Antigravity app: {app_path or 'không tìm thấy ở thư mục chuẩn'}")
    print(f"{'✓' if agentapi.exists() else '·'} agentapi: {'có (chỉ language server, không gọi sinh ảnh)' if agentapi.exists() else 'không có'}")
    print(f"✓ Bridge directory: {args.bridge_dir}")
    print(f"  inbox={dirs['inbox']}\n  outbox={dirs['outbox']}")
    return 0 if server_ok else 1


def cmd_pull(args: argparse.Namespace) -> int:
    _bridge_dirs(args.bridge_dir)
    tasks = list(reversed(fetch_pending(args.base_url)))
    if args.limit:
        tasks = tasks[:args.limit]
    if not tasks:
        print("Không có task Antigravity mới để pull.")
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
    print(f"Đã pull {pulled}/{len(tasks)} task cho Antigravity IDE.")
    return 0


def import_outbox_once(args: argparse.Namespace) -> int:
    dirs = _bridge_dirs(args.bridge_dir)
    imported = 0
    files = sorted(p for p in dirs["outbox"].iterdir() if p.is_file() and p.suffix.lower() in VALID_EXTS)
    for image_path in files:
        task_id = image_path.stem
        try:
            _task_stem(task_id)
            task = find_task(args.base_url, task_id)
            if not task or task.get("engine") not in ("antigravity", "antigravity_queue"):
                raise ValueError("không khớp task Antigravity")
            result = complete_task(
                args.base_url, task_id, image_path,
                notes="Hoàn thành qua Antigravity IDE bridge",
                model="antigravity-ide", tags="antigravity,ide-bridge",
            )
            archive_path = dirs["archive"] / f"{task_id}{image_path.suffix.lower()}"
            if archive_path.exists():
                archive_path = dirs["archive"] / f"{task_id}-{int(time.time())}{image_path.suffix.lower()}"
            shutil.move(str(image_path), archive_path)
            for suffix in (".json", ".md"):
                request_file = dirs["inbox"] / f"{task_id}{suffix}"
                if request_file.exists():
                    shutil.move(str(request_file), dirs["archive"] / request_file.name)
            imported += 1
            print(f"✓ Đã nhập {task_id}: /static/generated_images/{result['filename']}")
        except (Exception, SystemExit) as exc:
            print(f"✗ Không nhập được {image_path.name}: {exc}", file=sys.stderr)
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
            print(f"Watch one-shot hoàn tất · nhập {imported} ảnh.")
            return 0
        time.sleep(max(2, min(args.interval, 60)))


# ---------------------------------------------------------------------- main


def main(argv: List[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Cầu nối Hàng Đợi Ảnh TokMatrix <-> tác nhân Antigravity",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--base-url", default=DEFAULT_URL,
        help=f"Địa chỉ server TokMatrix (mặc định {DEFAULT_URL}, hoặc đặt TOKMATRIX_URL)",
    )
    parser.add_argument(
        "--bridge-dir", type=Path, default=BRIDGE_ROOT,
        help=f"Thư mục trao đổi với IDE (mặc định {BRIDGE_ROOT})",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p_setup = sub.add_parser("setup", help="Tạo inbox/outbox và hướng dẫn cho IDE agent")
    p_setup.set_defaults(func=cmd_setup)

    p_doctor = sub.add_parser("doctor", help="Kiểm tra server, Antigravity và bridge")
    p_doctor.set_defaults(func=cmd_doctor)

    p_list = sub.add_parser("list", help="Xem các task đang chờ Antigravity")
    p_list.add_argument("--json", action="store_true", help="In JSON cho agent đọc máy")
    p_list.add_argument("--limit", type=int, default=0, help="Chỉ lấy N task đầu")
    p_list.set_defaults(func=cmd_list)

    p_pull = sub.add_parser("pull", help="Claim task và tạo gói công việc cho IDE")
    p_pull.add_argument("--limit", type=int, default=1, help="Số task kéo mỗi lần")
    p_pull.add_argument("--worker-id", default="", help="Tên agent/IDE claim task")
    p_pull.set_defaults(func=cmd_pull)

    p_done = sub.add_parser("complete", help="Nộp ảnh đã sinh và báo task hoàn thành")
    p_done.add_argument("task_id", help="Id task, lấy từ lệnh list")
    p_done.add_argument("image", help="Đường dẫn file ảnh (.jpg/.png/.webp)")
    p_done.add_argument(
        "--notes", default="Hoàn thành bởi Antigravity", help="Ghi chú hiện trong hàng đợi",
    )
    p_done.add_argument("--model", default="antigravity", help="Tên model ghi vào metadata")
    p_done.add_argument("--tags", default="", help="Thẻ phân loại, cách nhau bằng dấu phẩy")
    p_done.add_argument("--force", action="store_true", help="Ghi đè task đã completed")
    p_done.set_defaults(func=cmd_complete)

    p_watch = sub.add_parser("watch", help="Theo dõi outbox, tự nhập ảnh và đóng task")
    p_watch.add_argument("--once", action="store_true", help="Quét một lần rồi thoát")
    p_watch.add_argument("--interval", type=int, default=5, help="Số giây giữa hai lần quét")
    p_watch.add_argument("--no-pull", action="store_true", help="Không tự kéo task pending")
    p_watch.add_argument("--pull-limit", type=int, default=1, help="Số task tự pull mỗi vòng")
    p_watch.add_argument("--worker-id", default="", help="Tên agent/IDE claim task")
    p_watch.set_defaults(func=cmd_watch)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
