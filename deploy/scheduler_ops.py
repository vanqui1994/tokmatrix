#!/usr/bin/env python3
"""Vận hành lịch đăng của Autopilot trên VPS — an toàn, chạy lại bao nhiêu lần cũng được.

  python3 deploy/scheduler_ops.py check                     # chỉ đọc: service, DB, hàng đợi, múi giờ, log
  python3 deploy/scheduler_ops.py set-config \\
      --posting-hours 8,10,12,14,17,19 --gap 120 --per-day 6   # in thay đổi dự kiến
  python3 deploy/scheduler_ops.py set-config ... --yes        # backup autopilot.db rồi mới ghi
  python3 deploy/scheduler_ops.py allocate                    # chạy thử: giờ đăng dự kiến, không ghi
  python3 deploy/scheduler_ops.py allocate --apply            # xếp lịch thật qua API (giữ cycle lock)
  python3 deploy/scheduler_ops.py summary                     # bảng lịch đã xếp + slot trống 7 ngày
  python3 deploy/scheduler_ops.py hold --hours 24             # tạm giữ đăng (vẫn sản xuất video)
  python3 deploy/scheduler_ops.py release                     # bỏ giữ đăng

Chạy từ /opt/tokmatrix. Chạy bằng root thì script đọc journal trước rồi tự hạ quyền xuống user
`tokmatrix` trước khi mở SQLite (file WAL do root tạo sẽ làm server báo "readonly database").
`allocate --apply` đi qua HTTP API của server đang chạy nên không bao giờ chạy song song
với cycle của daemon; config ghi thẳng vào DB và server đọc lại ở lượt kế tiếp, không cần restart.
"""
from __future__ import annotations

import argparse
import collections
import os
import pwd
import datetime
import json
import sqlite3
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from bkt_web.autopilot import channels, publisher, scheduler, store  # noqa: E402

API = "http://127.0.0.1:8080"
SERVICE = "tokmatrix-web"
BACKUP_DIR = ROOT / "bkt_web" / "storage" / "backups"  # user tokmatrix ghi được (script đã hạ quyền)
ACTIVE = scheduler.SCHEDULE_COUNTED_STATUSES
APP_USER = "tokmatrix"
LOG_PATTERNS = ("database is locked", "readonly database", "rate limiter lock timeout", "ZoneInfoNotFound")
JOURNAL = {"text": None, "error": None}


def read_journal() -> None:
    """Đọc journal 24h (cần root hoặc nhóm systemd-journal); gọi TRƯỚC khi hạ quyền."""
    try:
        out = subprocess.run(["journalctl", "-u", SERVICE, "--since", "-24h", "--no-pager", "-o", "short-iso"],
                             capture_output=True, text=True, timeout=60)
    except (OSError, subprocess.TimeoutExpired) as exc:
        JOURNAL["error"] = str(exc)
        return
    if "not seeing messages from other users" in (out.stdout + out.stderr):
        JOURNAL["error"] = f"user {pwd.getpwuid(os.geteuid()).pw_name} không đọc được journal của {SERVICE} — chạy bằng root"
    else:
        JOURNAL["text"] = out.stdout


def drop_privileges() -> None:
    if os.geteuid() != 0:
        return
    user = pwd.getpwnam(APP_USER)
    os.setgroups([])
    os.setgid(user.pw_gid)
    os.setuid(user.pw_uid)


def section(title: str) -> None:
    print(f"\n=== {title} ===")


def table(rows, headers) -> None:
    rows = [[str(c) for c in r] for r in rows]
    widths = [max(len(h), *(len(r[i]) for r in rows)) if rows else len(h) for i, h in enumerate(headers)]
    print("  ".join(h.ljust(w) for h, w in zip(headers, widths)))
    for r in rows:
        print("  ".join(c.ljust(w) for c, w in zip(r, widths)))
    if not rows:
        print("(trống)")


def ro(path: Path) -> sqlite3.Connection:
    return sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=10)


def run(cmd) -> str:
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=30).stdout.strip()
    except (OSError, subprocess.TimeoutExpired) as exc:
        return f"(không chạy được: {exc})"


def api(method: str, path: str, body=None):
    """Gọi API cục bộ bằng cookie đăng nhập tự ký (không cần mật khẩu)."""
    from bkt_web import webauth

    token = (ROOT / "bkt_web" / ".session_token").read_text(encoding="utf-8").strip()
    cookie = f"{webauth.COOKIE_NAME}={webauth.issue_session(webauth.get_username(), token)}"
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(f"{API}{path}", data=data, method=method, headers={
        "Cookie": cookie, "Origin": API, "Content-Type": "application/json",
    })
    try:
        with urllib.request.urlopen(request, timeout=600) as response:
            return response.status, json.loads(response.read() or b"{}")
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read() or b"{}")


# ---------------------------------------------------------------------------
# check
# ---------------------------------------------------------------------------

def cmd_check(_args) -> int:
    problems = []
    section("Service")
    active = run(["systemctl", "is-active", SERVICE])
    print(f"{SERVICE}: {active}  ({run(['systemctl', 'show', SERVICE, '-p', 'MainPID', '-p', 'ActiveEnterTimestamp', '--value']).replace(chr(10), ', ')})")
    print(f"Múi giờ VPS: {run(['timedatectl', 'show', '-p', 'Timezone', '--value'])} — lịch đăng tính theo múi giờ của từng acc, không theo giờ VPS")
    if active != "active":
        problems.append(f"{SERVICE} không active")

    section("Database")
    for path in (store.AUTOPILOT_DB, store.DB_PATH, ROOT / "bkt_web" / "storage" / "matrix_factory.db"):
        try:
            with ro(path) as conn:
                result = conn.execute("PRAGMA quick_check").fetchone()[0]
        except sqlite3.Error as exc:
            result = f"LỖI: {exc}"
        print(f"{path.name}: {result}")
        if result != "ok":
            problems.append(f"{path.name}: {result}")

    with ro(store.DB_PATH) as conn:
        section("Kênh TikTok theo trạng thái")
        table(conn.execute("SELECT status, COUNT(*) FROM channels GROUP BY 1 ORDER BY 2 DESC").fetchall(), ["status", "số kênh"])
        section("upload_tasks")
        table(conn.execute(
            "SELECT status, COUNT(*), SUM(run_id LIKE 'autopilot-%' OR run_id LIKE 'batch-%') FROM upload_tasks GROUP BY 1"
        ).fetchall(), ["status", "tổng", "từ Matrix"])
    with ro(ROOT / "bkt_web" / "storage" / "matrix_factory.db") as conn:
        section("Matrix jobs")
        table(conn.execute("SELECT state, COUNT(*) FROM content_jobs GROUP BY 1 ORDER BY 1").fetchall(), ["state", "số job"])

    section("Config lịch đăng")
    config = store.get_all_config()
    for key in ("enabled", "paused", "posting_hours", "gap_between_posts_minutes", "videos_per_day_per_channel", "timezone"):
        print(f"{key} = {config.get(key)}")

    section("Giữ đăng / ngâm acc")
    hold = int(config.get("publish_hold_until") or 0)
    print(f"publish_hold_until = {datetime.datetime.fromtimestamp(hold):%d/%m %H:%M} (còn {max(0, hold - time.time()) / 3600:.1f} giờ)"
          if hold > time.time() else "publish_hold_until = không giữ")
    warmup_hours = int(config.get("warmup_hours") or 0)
    warming = []
    for row in channels.get_channel_map():
        injected = channels.cookie_injected_at(row["tiktok_channel_id"])
        if warmup_hours and injected and time.time() < injected + warmup_hours * 3600:
            warming.append((row["tiktok_channel_id"], datetime.datetime.fromtimestamp(injected + warmup_hours * 3600)))
    print(f"min_lead_hours = {config.get('min_lead_hours', '0')} (video phải làm xong trước khung đăng ít nhất ngần này giờ)")
    print(f"warmup_hours = {warmup_hours}; acc đang ngâm: {len(warming)}"
          + (" — " + ", ".join(f"#{t}→{d:%d/%m %H:%M}" for t, d in sorted(warming, key=lambda x: x[1])[:15]) if warming else ""))

    section("Múi giờ theo acc đã gán")
    mapping = channels.get_channel_map()
    zones = collections.Counter()
    fallback = []
    for row in mapping:
        tz, country, used_fallback = scheduler.account_timezone(row["tiktok_channel_id"])
        zones[str(tz)] += 1
        if used_fallback:
            fallback.append(f"#{row['tiktok_channel_id']}({country or '?'})")
    print(f"{len(mapping)} acc đã gán — " + ", ".join(f"{z}: {n}" for z, n in zones.most_common()))
    if fallback:
        problems.append(f"{len(fallback)} acc không có múi giờ theo quốc gia, đang dùng fallback: {' '.join(fallback[:20])}")

    section("Engine")
    try:
        status, body = api("GET", "/api/autopilot/status")
        print(f"HTTP {status}: state={body.get('state')} step={body.get('current_step')} "
              f"last_cycle={body.get('last_cycle')} last_error={body.get('last_error')} disk={body.get('disk')}")
        if body.get("last_error"):
            problems.append(f"engine last_error: {body['last_error']}")
    except Exception as exc:  # noqa: BLE001 — chỉ báo cáo
        print(f"không gọi được API: {exc}")
        problems.append("API autopilot không phản hồi")
    with ro(store.AUTOPILOT_DB) as conn:
        for run_id, trigger, started, status_, error in conn.execute(
            "SELECT id, trigger, started_at, status, error FROM autopilot_runs ORDER BY id DESC LIMIT 5"
        ):
            print(f"  run #{run_id} {trigger:9} {status_:11} {datetime.datetime.fromtimestamp(started):%d/%m %H:%M} {(error or '')[:80]}")

    section("Log 24 giờ: lock / readonly / timezone")
    if JOURNAL["error"]:
        print(f"⚠️  {JOURNAL['error']}")
        problems.append("không kiểm tra được log")
    else:
        started = run(["systemctl", "show", SERVICE, "-p", "ActiveEnterTimestamp", "--value"])
        try:
            since = datetime.datetime.strptime(" ".join(started.split()[1:3]), "%Y-%m-%d %H:%M:%S").astimezone()
        except ValueError:
            since = None
        for needle in LOG_PATTERNS:
            hits = [line for line in JOURNAL["text"].splitlines() if needle.lower() in line.lower()]
            times = [datetime.datetime.fromisoformat(line.split()[0]) for line in hits if line[:4].isdigit()]
            recent = [t for t in times if since and t >= since]
            last = f", gần nhất {max(times):%d/%m %H:%M}" if times else ""
            print(f"{needle}: {len(hits)}{last}; từ lần khởi động hiện tại: {len(recent)}")
            if recent:
                problems.append(f"log có {len(recent)} lần '{needle}' từ lần khởi động hiện tại")

    section("Kết luận")
    print("\n".join(f"⚠️  {p}" for p in problems) or "✅ Không thấy vấn đề")
    return 1 if problems else 0


# ---------------------------------------------------------------------------
# set-config
# ---------------------------------------------------------------------------

def backup_db(path: Path) -> Path:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    target = BACKUP_DIR / f"{path.stem}-{time.strftime('%Y%m%d-%H%M%S')}.db"
    with sqlite3.connect(path) as source, sqlite3.connect(target) as dest:
        source.backup(dest)  # an toàn khi server đang ghi (WAL)
    with sqlite3.connect(target) as conn:
        if conn.execute("PRAGMA quick_check").fetchone()[0] != "ok" or target.stat().st_size == 0:
            raise SystemExit(f"backup hỏng: {target}")
    return target


def cmd_set_config(args) -> int:
    wanted = {}
    if args.posting_hours:
        wanted["posting_hours"] = json.dumps([int(h) for h in args.posting_hours.split(",")])
    if args.gap is not None:
        wanted["gap_between_posts_minutes"] = str(args.gap)
    if args.per_day is not None:
        wanted["videos_per_day_per_channel"] = str(args.per_day)
    if not wanted:
        raise SystemExit("không có gì để đổi (dùng --posting-hours / --gap / --per-day)")
    current = store.get_all_config()
    changes = {}
    for key, value in wanted.items():
        normalized = store.validate_config(key, value)  # ValueError → dừng trước khi ghi gì
        if current.get(key) != normalized:
            changes[key] = (current.get(key), normalized)
    section("Thay đổi config")
    if not changes:
        print("Đã đúng giá trị yêu cầu — không ghi gì.")
        return 0
    table([(k, old, new) for k, (old, new) in changes.items()], ["key", "hiện tại", "mới"])
    if not args.yes:
        print("\nChưa ghi. Thêm --yes để backup autopilot.db rồi ghi.")
        return 0
    print(f"Backup: {backup_db(store.AUTOPILOT_DB)}")
    for key, (_old, new) in changes.items():
        store.set_config(key, new)
    store.log_event("⚙️ scheduler_ops đổi config: " + ", ".join(f"{k}={v[1]}" for k, v in changes.items()))
    print("Đã ghi. Server đọc lại ở lượt tính giờ kế tiếp, không cần restart.")
    return 0


# ---------------------------------------------------------------------------
# allocate
# ---------------------------------------------------------------------------

def fmt_local(ts: int, tiktok_id: int) -> str:
    tz = scheduler.account_timezone(tiktok_id)[0]
    return f"{datetime.datetime.fromtimestamp(ts, tz):%d/%m %H:%M} {tz}"


def cmd_allocate(args) -> int:
    if not args.apply:
        result = publisher.publish_ready_jobs(dry_run=True)
        section("Chạy thử — không ghi gì")
        table([(d["job_id"][-28:], d.get("tiktok_id", "-"), d["outcome"],
                fmt_local(d["schedule_ts"], d["tiktok_id"]) if d.get("schedule_ts") else d.get("reason", ""))
               for d in result["details"]], ["job", "acc", "kết quả", "giờ địa phương / lý do"])
        print(f"\nSẽ xếp lịch {result['published']} · chờ {result['deferred']} · chặn {result['blocked']}")
        print("Chạy lại với --apply để xếp lịch thật.")
        return 0
    status, body = api("POST", "/api/autopilot/publish-ready")
    section(f"Xếp lịch thật — HTTP {status}")
    print(json.dumps(body, ensure_ascii=False, indent=2))
    return 0 if status == 200 and body.get("status") == "ok" else 1


# ---------------------------------------------------------------------------
# summary
# ---------------------------------------------------------------------------

def cmd_summary(_args) -> int:
    now = int(time.time())
    marks = ",".join("?" for _ in ACTIVE)
    with ro(store.DB_PATH) as conn:
        rows = conn.execute(
            f"SELECT channel_id, schedule_time, status FROM upload_tasks WHERE status IN ({marks}) AND schedule_time >= ?",
            (*ACTIVE, now - 3600),
        ).fetchall()
    by_slot = collections.Counter()
    by_day = collections.Counter()
    for channel_id, ts, status in rows:
        tz = scheduler.account_timezone(channel_id)[0]
        local = datetime.datetime.fromtimestamp(ts, tz)
        by_slot[(local.strftime("%H:00"), str(tz))] += 1
        by_day[local.strftime("%Y-%m-%d")] += 1
    section(f"Bài đã xếp lịch từ giờ trở đi: {len(rows)}")
    table(sorted((slot, tz, n) for (slot, tz), n in by_slot.items()), ["giờ địa phương", "múi giờ", "số bài"])
    print()
    table(sorted(by_day.items()), ["ngày (giờ acc)", "số bài"])

    mapping = channels.get_channel_map()
    free = [len(scheduler.free_slots(row["tiktok_channel_id"], now)) for row in mapping]
    section(f"Slot trống {scheduler.LOOKAHEAD_DAYS} ngày tới ({len(mapping)} acc đã gán)")
    if free:
        print(f"tổng {sum(free)} · trung bình {sum(free) / len(free):.1f}/acc · acc kín lịch: {sum(1 for f in free if not f)}")
    return 0


def cmd_hold(args) -> int:
    if args.until:
        until = int(datetime.datetime.strptime(args.until, "%Y-%m-%d %H:%M").timestamp())  # giờ máy chủ
    elif args.hours:
        until = int(time.time() + args.hours * 3600)
    else:
        raise SystemExit("cần --hours hoặc --until \"YYYY-MM-DD HH:MM\"")
    current = store.get_int("publish_hold_until")
    if current >= until:
        print(f"Đã giữ tới {datetime.datetime.fromtimestamp(current):%d/%m %H:%M} (muộn hơn) — không đổi.")
        return 0
    store.set_config("publish_hold_until", str(until))
    store.log_event(f"🧊 scheduler_ops giữ đăng tới {datetime.datetime.fromtimestamp(until):%d/%m %H:%M}")
    print(f"Giữ đăng tới {datetime.datetime.fromtimestamp(until):%d/%m %H:%M}. Video vẫn được tạo và chờ ở READY_TO_PUBLISH.")
    return 0


def cmd_release(_args) -> int:
    store.set_config("publish_hold_until", "0")
    store.log_event("▶️ scheduler_ops bỏ giữ đăng")
    print("Đã bỏ giữ đăng. Acc vừa tiêm cookie vẫn phải ngâm đủ warmup_hours.")
    return 0


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("check").set_defaults(fn=cmd_check)
    cfg = sub.add_parser("set-config")
    cfg.add_argument("--posting-hours", help="vd 8,10,12,14,17,19 (giờ địa phương của acc)")
    cfg.add_argument("--gap", type=int, help="phút tối thiểu giữa 2 bài của một acc")
    cfg.add_argument("--per-day", type=int, help="số bài tối đa/ngày/acc")
    cfg.add_argument("--yes", action="store_true", help="thực sự ghi (mặc định chỉ in thay đổi)")
    cfg.set_defaults(fn=cmd_set_config)
    alloc = sub.add_parser("allocate")
    alloc.add_argument("--apply", action="store_true", help="xếp lịch thật (mặc định chạy thử)")
    alloc.set_defaults(fn=cmd_allocate)
    sub.add_parser("summary").set_defaults(fn=cmd_summary)
    hold = sub.add_parser("hold")
    hold.add_argument("--hours", type=float)
    hold.add_argument("--until", help='giờ máy chủ, vd "2026-09-26 00:00"')
    hold.set_defaults(fn=cmd_hold)
    sub.add_parser("release").set_defaults(fn=cmd_release)
    args = parser.parse_args(argv)
    if args.command == "check":
        read_journal()
    drop_privileges()
    return args.fn(args)


if __name__ == "__main__":
    raise SystemExit(main())
