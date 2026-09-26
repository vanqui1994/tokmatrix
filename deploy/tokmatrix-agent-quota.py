#!/usr/bin/env python3
"""Tìm lỗi QUOTA_EXHAUSTED trong các conversation Antigravity mà bridge đã mở.

Cài vào /usr/local/bin/tokmatrix-agent-quota. Hai lệnh:

  tokmatrix-agent-quota record <bridge> <conversation_id> [account]
      Ghi lại conversation vừa giao (sau khi agentapi trả conversationId), kèm tài
      khoản Google đang active (tokmatrix-rotator active) nếu có.

  tokmatrix-agent-quota check <bridge> [--account <email>]
      Nếu model agent cần còn đang bị chặn quota: in "<epoch_reset> <model>", exit 0.
      Không bị chặn: không in gì, exit 1. Có --account thì chỉ tính conversation của
      đúng tài khoản đó: lỗi 429 của tài khoản cũ không làm khoá tài khoản vừa chuyển sang.

Mỗi bridge (image, script) chặn theo lỗi trong conversation của chính nó với mọi
model. Conversation của bridge khác chỉ tính các model không phải "-image": model
chữ (flash) dùng chung, còn hết quota model ảnh không chặn bridge kịch bản.

Thời điểm reset lấy từ quotaResetTimeStamp trong body 429 của Google.

Tài khoản bị Google đòi xác minh (403, ErrorInfo reason VALIDATION_REQUIRED, "Verify your account
to continue") hỏng cả chữ lẫn ảnh: check trả model "VALIDATION_REQUIRED" cho MỌI bridge, chặn
VALIDATION_HOLD giây; rotator nhận model này thì disable tài khoản thay vì chờ reset quota.
"""
import re
import sys
import time
from datetime import datetime
from pathlib import Path

STATE_DIR = Path("/var/lib/tokmatrix-bridge")
CONV_DIR = Path("/opt/tokmatrix/.gemini/antigravity/conversations")
BRIDGES = ("image", "script")
KEEP = 20                     # số conversation gần nhất mỗi bridge được nhớ
LOOKBACK = 12 * 3600          # conversation cũ hơn thì bỏ qua
MAX_COOLDOWN = 24 * 3600      # chặn tối đa 24 giờ, phòng timestamp lạ
MARGIN = 60                   # chờ thêm 1 phút sau giờ reset
VALIDATION_MODEL = "VALIDATION_REQUIRED"
VALIDATION_HOLD = 7 * 24 * 3600  # tài khoản cần người xác minh tay: chặn dài, rotator sẽ disable

CID_RE = re.compile(r"^[0-9a-f-]{36}$")
ACCOUNT_RE = re.compile(r"^[^\s@]+@[^\s@]+$")
TS_RE = re.compile(r'quotaResetTimeStamp\\*"\s*:\s*\\*"(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ)')
MODEL_RE = re.compile(r'"model\\*"\s*:\s*\\*"([A-Za-z0-9._-]+)')
# Chỉ khớp trường JSON của ErrorInfo trong phản hồi lỗi thật (có thể bị escape), không khớp chữ trong câu trả lời.
VALIDATION_RE = re.compile(r'"reason\\*"\s*:\s*\\*"VALIDATION_REQUIRED\\*"')
SHARED_MODEL_RE = re.compile(r"^gemini-[0-9.]+-(flash|pro)(-lite)?(-preview)?(-\d{2}-\d{2})?$")


def _cids_file(bridge: str) -> Path:
    return STATE_DIR / f"{bridge}.cids"


def record(bridge: str, cid: str, account: str = "") -> None:
    if not CID_RE.match(cid):
        raise SystemExit(f"conversation id không hợp lệ: {cid}")
    if account and not ACCOUNT_RE.match(account):
        raise SystemExit(f"tài khoản không hợp lệ: {account}")
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    path = _cids_file(bridge)
    lines = path.read_text().splitlines() if path.exists() else []
    lines.append(f"{int(time.time())} {cid} {account}".rstrip())
    path.write_text("\n".join(lines[-KEEP:]) + "\n")


def _recent_cids(bridge: str, account: str = ""):
    """Conversation gần đây của bridge; có account thì chỉ lấy dòng ghi đúng tài khoản đó."""
    path = _cids_file(bridge)
    if not path.exists():
        return []
    cutoff = time.time() - LOOKBACK
    out = []
    for line in path.read_text().splitlines():
        parts = line.split()
        if len(parts) not in (2, 3) or not parts[0].isdigit() or int(parts[0]) < cutoff or not CID_RE.match(parts[1]):
            continue
        if account and (len(parts) < 3 or parts[2].lower() != account.lower()):
            continue
        out.append(parts[1])
    return out


def _blocks(db: Path):
    """(epoch_reset, model) cho từng quotaResetTimeStamp trong file conversation.

    Chỉ tin mốc tuyệt đối quotaResetTimeStamp trong body 429: agent hay chép lại
    lỗi cũ ("reset after 3h17m") vào câu trả lời, cộng khoảng đó vào mtime sẽ sai.
    Không có mốc thì KHÔNG chặn: mọi conversation đều chứa AGENTS.md, nên chữ
    "QUOTA_EXHAUSTED" đứng một mình không chứng minh tài khoản hết quota.
    """
    try:
        data = db.read_bytes().decode("utf-8", "ignore")
        mtime = db.stat().st_mtime
    except OSError:
        return
    for m in TS_RE.finditer(data):
        window = data[max(0, m.start() - 600): m.end() + 600]
        model = (MODEL_RE.search(window) or [None, "unknown"])[1]
        reset = datetime.fromisoformat(m.group(1).replace("Z", "+00:00")).timestamp()
        yield min(reset, mtime + MAX_COOLDOWN), model


def _validation_required(db: Path) -> bool:
    try:
        return bool(VALIDATION_RE.search(db.read_bytes().decode("utf-8", "ignore")))
    except OSError:
        return False


def _shared_model(model: str) -> bool:
    """Model chữ dùng chung giữa các bridge. Tên phải đầy đủ: file .db bị cắt ở ranh
    giới trang SQLite có thể cho ra "gemini-3.1-fP2", không được chặn nhầm bridge kia."""
    return "image" not in model and bool(SHARED_MODEL_RE.match(model))


def check(bridge: str, account: str = "") -> int:
    now = time.time()
    best = None
    for owner in BRIDGES:
        for cid in _recent_cids(owner, account):
            db = CONV_DIR / f"{cid}.db"
            if _validation_required(db):  # lỗi cấp tài khoản: chặn mọi bridge
                try:
                    until = db.stat().st_mtime + VALIDATION_HOLD
                except OSError:
                    until = now + VALIDATION_HOLD
                if until > now and (best is None or until > best[0]):
                    best = (until, VALIDATION_MODEL)
                continue
            for reset, model in _blocks(db):
                if owner != bridge and not _shared_model(model):
                    continue
                until = reset + MARGIN
                if until > now and (best is None or until > best[0]):
                    best = (until, model)
    if best:
        print(int(best[0]), best[1])
        return 0
    return 1


def main(argv) -> int:
    if len(argv) >= 3 and argv[1] in ("record", "check") and argv[2] in BRIDGES:
        if argv[1] == "record" and len(argv) in (4, 5):
            record(argv[2], argv[3], argv[4] if len(argv) == 5 else "")
            return 0
        if argv[1] == "check" and len(argv) == 3:
            return check(argv[2])
        if argv[1] == "check" and len(argv) == 5 and argv[3] == "--account":
            return check(argv[2], argv[4])
    print(__doc__, file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
