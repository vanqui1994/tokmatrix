#!/usr/bin/env python3
"""
CLI cầu nối Remake Video ↔ Antigravity IDE.

Song song với `antigravity_agent.py` (lo phần ảnh đơn lẻ), file này lo nguyên gói
dựng nhân vật của một video remake. Agent trong IDE chỉ cần ba lệnh:

    python3 bkt_web/antigravity_remake.py list            # xem việc đang chờ
    python3 bkt_web/antigravity_remake.py show <task_id>  # đọc yêu cầu chi tiết
    # ... vẽ sprite + đo rig, lưu vào outbox theo hướng dẫn ...
    python3 bkt_web/antigravity_remake.py complete <task_id>

`complete` sẽ dựng animation 60fps (nhép môi bám cue, chớp mắt theo rig), lồng
tiếng Việt server đã sinh sẵn, rồi cập nhật registry để web thấy video mới.

Lệnh `watch` chạy nền: cứ thấy đủ sprite + rig trong outbox là tự dựng.

Không cần server đang chạy — CLI thao tác thẳng trên file và registry.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Any, Dict, List

try:
    from bkt_web import remake_bridge as bridge
except ImportError:  # Cho phép chạy trực tiếp: python3 bkt_web/antigravity_remake.py
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import remake_bridge as bridge  # type: ignore[no-redef]  # noqa: E402


def _fmt_status(status: str) -> str:
    return {
        bridge.STATUS_WAITING: "⏳ chờ Antigravity",
        bridge.STATUS_COMPLETED: "✅ xong",
        bridge.STATUS_FAILED: "❌ lỗi",
    }.get(status, status)


# ---------------------------------------------------------------- lệnh list


def cmd_list(args: argparse.Namespace) -> int:
    tasks = bridge.list_tasks(args.status)
    if args.json:
        print(json.dumps(tasks, ensure_ascii=False, indent=2))
        return 0
    if not tasks:
        print("Không có task remake nào.")
        return 0

    print(f"{len(tasks)} task remake:\n")
    for t in tasks:
        print(f"  {t['task_id']}  {_fmt_status(t.get('status', '?'))}")
        print(f"    dự án   : {t.get('project_name') or t.get('project_slug')}")
        print(f"    nhân vật: {len(t.get('characters') or [])} · "
              f"cue: {len(t.get('cues') or [])} · {t.get('duration')}s")
        if t.get("status") == bridge.STATUS_WAITING:
            print(f"    hướng dẫn: {t.get('inbox_md')}")
            print(f"    nộp vào  : {t.get('output_dir')}")
        if t.get("preview_url"):
            print(f"    video   : {t['preview_url']}")
        if t.get("error"):
            print(f"    lỗi     : {t['error']}")
        print()
    return 0


# ---------------------------------------------------------------- lệnh show


def cmd_show(args: argparse.Namespace) -> int:
    task = bridge.get_task(args.task_id)
    if task is None:
        raise SystemExit(f"Không có task '{args.task_id}'. Chạy `list` để xem id hợp lệ.")
    md = Path(task.get("inbox_md", ""))
    if md.is_file():
        print(md.read_text(encoding="utf-8"))
        return 0
    # Task đã archive thì bản .md nằm ở archive
    archived = bridge.BRIDGE_ROOT / "archive" / f"{task['task_id']}.md"
    if archived.is_file():
        print(archived.read_text(encoding="utf-8"))
        return 0
    print(json.dumps(task, ensure_ascii=False, indent=2))
    return 0


# ------------------------------------------------------------- lệnh status


def cmd_status(args: argparse.Namespace) -> int:
    """Xem đã nộp đủ chưa mà chưa cần dựng video."""
    try:
        sub = bridge.collect_submission(args.task_id)
    except ValueError as exc:
        print(f"Chưa dựng được: {exc}")
        return 1

    task = sub["task"]
    chars = task.get("characters") or []
    print(f"Task {task['task_id']} · {task.get('project_name')}")
    print(f"  sprite đã nộp: {len(sub['sprites'])} → {sub['sprites_dir']}")
    for name in sorted(sub["sprites"]):
        print(f"     • {name}")
    print(f"  rig đã nộp   : {len(sub['rigs'])}")
    if sub["missing_sprite"]:
        print(f"  ⚠ thiếu sprite: {', '.join(sub['missing_sprite'])}")
    if sub["missing_rig"]:
        print(f"  ⚠ thiếu rig   : {', '.join(sub['missing_rig'])} (mặt sẽ dùng rig mặc định)")
    print(f"\n  Dựng được ngay. Chạy: {Path(__file__).name} complete {task['task_id']}")
    return 0


# ----------------------------------------------------------- lệnh complete


def cmd_complete(args: argparse.Namespace) -> int:
    def log(msg: str, pct: int) -> None:
        print(f"  [{pct:3d}%] {msg}")

    print(f"Dựng video remake cho task {args.task_id}...")
    try:
        entry = bridge.finalize_task(args.task_id, log=log, strict=args.strict)
    except ValueError as exc:
        bridge.fail_task(args.task_id, str(exc))
        raise SystemExit(f"\n✗ {exc}")

    print("\n✓ Xong")
    print(f"  sprite dùng: {entry.get('sprite_count')} · rig: {entry.get('rig_count')}")
    if entry.get("preview_url"):
        print(f"  video      : {entry['preview_url']}")
    print(f"  HTML       : {entry.get('animated_html')}")
    return 0


# -------------------------------------------------------------- lệnh watch


def cmd_watch(args: argparse.Namespace) -> int:
    print(f"Theo dõi outbox mỗi {args.interval}s (Ctrl+C để dừng)...")
    seen_error: Dict[str, str] = {}
    try:
        while True:
            for task in bridge.list_tasks(bridge.STATUS_WAITING):
                tid = task["task_id"]
                try:
                    sub = bridge.collect_submission(tid)
                except ValueError as exc:
                    if seen_error.get(tid) != str(exc):
                        seen_error[tid] = str(exc)
                    continue
                print(f"\n[{time.strftime('%H:%M:%S')}] {tid} có bài nộp — bắt đầu dựng")
                try:
                    bridge.finalize_task(tid, log=lambda m, p: print(f"  [{p:3d}%] {m}"))
                    print(f"[{time.strftime('%H:%M:%S')}] {tid} xong")
                except ValueError as exc:
                    bridge.fail_task(tid, str(exc))
                    print(f"[{time.strftime('%H:%M:%S')}] {tid} lỗi: {exc}")
            time.sleep(args.interval)
    except KeyboardInterrupt:
        print("\nĐã dừng.")
    return 0


# ------------------------------------------------------------- lệnh doctor


def cmd_doctor(args: argparse.Namespace) -> int:
    ok = True
    print("Kiểm tra bridge remake:\n")

    print(f"  thư mục bridge : {bridge.BRIDGE_ROOT}")
    print(f"     tồn tại     : {'có' if bridge.BRIDGE_ROOT.is_dir() else 'CHƯA'}")

    template = Path(__file__).resolve().parent / "remake_templates" / "antigravity_template.html"
    print(f"  renderer       : {'có' if template.is_file() else 'THIẾU'} ({template.name})")
    ok &= template.is_file()

    try:
        from remake_composer import compose_animated_video  # noqa: F401
        import inspect
        has_rig = "face_rigs" in inspect.signature(compose_animated_video).parameters
        print(f"  composer       : {'nhận face_rigs' if has_rig else 'CHƯA nhận face_rigs'}")
        ok &= has_rig
    except ImportError as exc:
        print(f"  composer       : lỗi import ({exc})")
        ok = False

    try:
        import playwright  # noqa: F401
        print("  playwright     : có (ghi được MP4)")
    except ImportError:
        print("  playwright     : THIẾU — chỉ xuất được HTML, không ra MP4")

    import shutil as _sh
    print(f"  ffmpeg         : {'có' if _sh.which('ffmpeg') else 'THIẾU (không mux được tiếng)'}")

    waiting = bridge.list_tasks(bridge.STATUS_WAITING)
    print(f"\n  task đang chờ  : {len(waiting)}")
    for t in waiting:
        print(f"     • {t['task_id']} → {t['output_dir']}")

    print("\n" + ("Sẵn sàng." if ok else "Còn thiếu thành phần ở trên."))
    return 0 if ok else 1


# ---------------------------------------------------------------------- main


def main(argv: List[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Cầu nối Remake Video TokMatrix <-> Antigravity IDE",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p_list = sub.add_parser("list", help="Xem các task remake")
    p_list.add_argument("--status", help="Lọc: waiting_antigravity / completed / failed")
    p_list.add_argument("--json", action="store_true", help="In JSON cho agent đọc máy")
    p_list.set_defaults(func=cmd_list)

    p_show = sub.add_parser("show", help="In hướng dẫn chi tiết của một task")
    p_show.add_argument("task_id")
    p_show.set_defaults(func=cmd_show)

    p_st = sub.add_parser("status", help="Kiểm tra bài nộp đã đủ chưa")
    p_st.add_argument("task_id")
    p_st.set_defaults(func=cmd_status)

    p_done = sub.add_parser("complete", help="Dựng video từ bài nộp và trả về web")
    p_done.add_argument("task_id")
    p_done.add_argument("--strict", action="store_true",
                        help="Bắt buộc đủ sprite và rig cho mọi nhân vật mới cho dựng")
    p_done.set_defaults(func=cmd_complete)

    p_watch = sub.add_parser("watch", help="Tự dựng khi outbox đủ bài")
    p_watch.add_argument("--interval", type=int, default=20, help="Giây giữa hai lần quét")
    p_watch.set_defaults(func=cmd_watch)

    p_doc = sub.add_parser("doctor", help="Kiểm tra phụ thuộc và task đang chờ")
    p_doc.set_defaults(func=cmd_doctor)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
