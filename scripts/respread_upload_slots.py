"""Xếp lại các bài QUEUED đang dồn cùng một giây của cùng một tài khoản, theo khung giờ của bộ xếp lịch Autopilot (scheduler.free_slots).
  PYTHONPATH=. python3 scripts/respread_upload_slots.py             chạy thử (không ghi)
  PYTHONPATH=. python3 scripts/respread_upload_slots.py --apply --backup <dir>
  PYTHONPATH=. python3 scripts/respread_upload_slots.py --rollback <dir>/old_times.json
"""
import collections, datetime, json, os, sys, time
sys.dont_write_bytecode = True
from bkt_web import account_pacing
from bkt_web.autopilot import scheduler, store

APPLY = "--apply" in sys.argv
MAX_ROUNDS = 18  # × 7 ngày

def conn(): return store.channels_db()

if "--rollback" in sys.argv:
    data = json.load(open(sys.argv[sys.argv.index("--rollback") + 1]))
    c = conn(); c.execute("BEGIN IMMEDIATE"); n = 0
    for tid, old, new in data["moves"]:
        n += c.execute("UPDATE upload_tasks SET schedule_time=? WHERE id=? AND status='QUEUED' AND schedule_time=?", (old, tid, new)).rowcount
    c.commit(); print("rollback", n, "/", len(data["moves"])); sys.exit(0)

now = time.time()
c = conn()
rows = c.execute("SELECT id, channel_id, schedule_time, created_at FROM upload_tasks WHERE status='QUEUED' AND schedule_time > ? ORDER BY channel_id, created_at, id", (int(now),)).fetchall()
grp = collections.defaultdict(list)
for tid, ch, st, ca in rows: grp[(ch, st)].append((tid, ca or 0))
stack = collections.defaultdict(list)  # kênh -> [(created_at, id, old_time)]
for (ch, st), lst in grp.items():
    if len(lst) >= 2:
        for tid, ca in lst: stack[ch].append((ca, tid, st))

excluded = {}
placeholders = ",".join("?" for _ in scheduler.SCHEDULE_COUNTED_STATUSES)
def used_times(tiktok_id, now_):  # như scheduler._used_times nhưng bỏ các bài đang được xếp lại
    ex = excluded.get(int(tiktok_id), set())
    cc = conn()
    try:
        rs = cc.execute(f"SELECT id, schedule_time FROM upload_tasks WHERE channel_id=? AND status IN ({placeholders}) AND schedule_time > ?",
                        (tiktok_id, *scheduler.SCHEDULE_COUNTED_STATUSES, int(now_) - 2 * 86400)).fetchall()
    finally:
        cc.close()
    return [int(t) for i, t in rs if t and i not in ex]
scheduler._used_times = used_times

moves, report = [], []
for ch, items in sorted(stack.items()):
    items.sort()
    excluded[ch] = {tid for _, tid, _ in items}
    assigned, cursor = [], now
    for _ in range(MAX_ROUNDS):
        if len(assigned) >= len(items): break
        slots = scheduler.free_slots(ch, cursor, extra_used=assigned)
        slots = [s for s in slots if s not in assigned]
        take = slots[:len(items) - len(assigned)]
        if take: assigned += take; cursor = max(take)
        else: cursor += 7 * 86400
    tz = scheduler.account_timezone(ch)[0]
    fmt = lambda t: datetime.datetime.fromtimestamp(t, tz).strftime("%d/%m %H:%M")
    for (ca, tid, old), new in zip(items, assigned): moves.append((tid, old, int(new)))
    foll = c.execute("SELECT COALESCE(follower_count,0), username FROM channels WHERE id=?", (ch,)).fetchone()
    report.append((ch, foll[1], foll[0], account_pacing.is_warming(ch), len(items), len(assigned), fmt(assigned[0]) if assigned else "-", fmt(assigned[-1]) if assigned else "-",
                   round((max(assigned) - now) / 86400, 1) if assigned else 0))

print(f"{'acc':>4} {'username':18} {'foll':>6} warm {'tasks':>5} {'placed':>6} {'first':>11} {'last':>11} {'days':>5}")
for r in report: print(f"{r[0]:>4} {str(r[1])[:18]:18} {r[2]:>6} {str(r[3]):5} {r[4]:>5} {r[5]:>6} {r[6]:>11} {r[7]:>11} {r[8]:>5}")
unplaced = sum(r[4] - r[5] for r in report)
print("accounts", len(report), "| tasks to move", len(moves), "| unplaced", unplaced)
# phân bố theo ngày (giờ VN) sau khi xếp lại: bài không đụng + bài mới
move_ids = {m[0] for m in moves}
after = collections.Counter()
for tid, ch, st, ca in rows:
    if tid not in move_ids: after[datetime.datetime.fromtimestamp(st, datetime.timezone(datetime.timedelta(hours=7))).date()] += 1
for tid, old, new in moves: after[datetime.datetime.fromtimestamp(new, datetime.timezone(datetime.timedelta(hours=7))).date()] += 1
print("per day after:", " ".join(f"{d.strftime('%d/%m')}:{n}" for d, n in sorted(after.items())[:24]))
if APPLY:
    out = sys.argv[sys.argv.index("--backup") + 1]; os.makedirs(out, exist_ok=True)
    json.dump({"made_at": int(now), "moves": moves}, open(os.path.join(out, "old_times.json"), "w"))
    cc = conn(); cc.execute("BEGIN IMMEDIATE"); done = 0
    for tid, old, new in moves:
        done += cc.execute("UPDATE upload_tasks SET schedule_time=? WHERE id=? AND status='QUEUED' AND schedule_time=?", (new, tid, old)).rowcount
    cc.commit(); print("APPLIED", done, "/", len(moves))
