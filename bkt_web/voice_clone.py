"""Clone giọng cho Voice DNA: đổi âm sắc giọng TTS (CapCut/Edge) sang một giọng mẫu đã đăng ký.

Dùng phần nhẹ nhất của OpenVoice V2 (MIT, github.com/myshell-ai/OpenVoice): chỉ ToneColorConverter (~130 MB,
chạy CPU), KHÔNG cài MeloTTS / whisper / bộ tách câu. CapCut TTS vẫn đọc lời (đúng ngôn ngữ, đúng nhịp), converter chỉ
đổi âm sắc → dùng được cho de/en/ja/ko mà không cần model TTS riêng. Thời lượng câu gần như giữ nguyên, nên cảnh vẫn
theo thời lượng TTS đo được sau bước này.

Luật:
  - Chỉ clone giọng có quyền dùng: `enroll` bắt buộc `--consent owner|licensed` (giọng của chính chủ kênh, hoặc có giấy
    phép bằng văn bản). Không enroll giọng người nổi tiếng/người khác không đồng ý.
  - Tất định: seed torch lấy từ sha256(file nguồn + id giọng) → cùng đầu vào ra cùng file.
  - Mặc định nhúng watermark "AI" của OpenVoice (wavmark); tắt bằng TOKMATRIX_VOICE_CLONE_WATERMARK=0.
  - Lỗi convert là lỗi job — không bao giờ lặng lẽ dùng giọng gốc thay giọng clone.

    python3 -m bkt_web.voice_clone setup                     # sparse clone OpenVoice + tải converter V2
    python3 -m bkt_web.voice_clone enroll --id de_host_01 --ref me1.wav --ref me2.wav --consent owner --lang de --gender male
    python3 -m bkt_web.voice_clone convert --id de_host_01 --src in.mp3 --out out.mp3
    python3 -m bkt_web.voice_clone list
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import types
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional

BASE_DIR = Path(__file__).resolve().parent
CLONE_DIR = Path(os.environ.get("TOKMATRIX_VOICE_CLONE_DIR") or BASE_DIR / "storage" / "voice_clones")
OPENVOICE_DIR = Path(os.environ.get("TOKMATRIX_OPENVOICE_DIR") or Path.home() / ".cache" / "tokmatrix" / "openvoice")
OPENVOICE_REPO = "https://github.com/myshell-ai/OpenVoice"
CONVERTER_FILES = {
    "config.json": "https://huggingface.co/myshell-ai/OpenVoiceV2/resolve/main/converter/config.json",
    "checkpoint.pth": "https://huggingface.co/myshell-ai/OpenVoiceV2/resolve/main/converter/checkpoint.pth",
}
CLONE_VERSION = 1  # đổi cách convert (tau, watermark, định dạng) → tăng số này; khoá cache audio có số này
DEFAULT_TAU = 0.3
CONSENTS = ("owner", "licensed")
ID_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{1,63}$")


def registry_path() -> Path:
    return CLONE_DIR / "registry.json"


def load_registry() -> Dict[str, Any]:
    try:
        return json.loads(registry_path().read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"version": 1, "voices": {}}


def _save_registry(data: Dict[str, Any]) -> None:
    CLONE_DIR.mkdir(parents=True, exist_ok=True)
    tmp = registry_path().with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    os.replace(tmp, registry_path())


def _sha256(path: Path) -> str:
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def watermark_enabled() -> bool:
    return os.environ.get("TOKMATRIX_VOICE_CLONE_WATERMARK", "1").strip().lower() not in ("0", "false", "off", "no")


# --- setup ---------------------------------------------------------------------------------------------------------
def setup(target: Path = OPENVOICE_DIR) -> Path:
    """Sparse clone chỉ thư mục `openvoice/` (không lấy demo/notebook/ảnh) + tải converter V2."""
    target = Path(target)
    if not (target / "openvoice" / "api.py").exists():
        target.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(["git", "clone", "--depth", "1", "--filter=blob:none", "--sparse", OPENVOICE_REPO, str(target)], check=True)
        subprocess.run(["git", "-C", str(target), "sparse-checkout", "set", "openvoice"], check=True)
    ckpt = target / "checkpoints_v2" / "converter"
    ckpt.mkdir(parents=True, exist_ok=True)
    for name, url in CONVERTER_FILES.items():
        dest = ckpt / name
        if dest.exists() and dest.stat().st_size > 0:
            continue
        part = dest.with_suffix(dest.suffix + ".part")
        with urllib.request.urlopen(url, timeout=120) as resp, open(part, "wb") as out:
            while chunk := resp.read(1 << 20):
                out.write(chunk)
        os.replace(part, dest)
    return target


# --- converter -----------------------------------------------------------------------------------------------------
_CONVERTER = None


def _load_converter():
    """ToneColorConverter mà không kéo bộ xử lý chữ của TTS gốc (jieba, pypinyin, eng_to_ipa… — converter không dùng)."""
    global _CONVERTER
    if _CONVERTER is not None:
        return _CONVERTER
    ckpt = OPENVOICE_DIR / "checkpoints_v2" / "converter"
    if not (ckpt / "checkpoint.pth").exists():
        raise RuntimeError(f"OpenVoice converter chưa cài ở {OPENVOICE_DIR} — chạy: python3 -m bkt_web.voice_clone setup")
    sys.path.insert(0, str(OPENVOICE_DIR))
    stub = types.ModuleType("openvoice.text")
    stub.text_to_sequence = lambda *a, **k: []  # chỉ BaseSpeakerTTS dùng
    sys.modules.setdefault("openvoice.text", stub)
    import torch  # noqa: F401  (báo lỗi rõ nếu chưa cài)
    from openvoice.api import ToneColorConverter

    converter = ToneColorConverter(str(ckpt / "config.json"), device="cpu", enable_watermark=watermark_enabled())
    converter.load_ckpt(str(ckpt / "checkpoint.pth"))
    _CONVERTER = converter
    return converter


def _to_wav(src: Path, dest: Path) -> None:
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(src), "-ac", "1", "-ar", "22050", str(dest)], check=True)


def enroll(voice_id: str, refs: List[Path], *, consent: str, lang: str, gender: str = "any", note: str = "",
           converter=None) -> Dict[str, Any]:
    if not ID_RE.match(voice_id or ""):
        raise ValueError("id phải là chữ thường/số/_/-, 2–64 ký tự")
    if consent not in CONSENTS:
        raise ValueError(f"--consent phải là {'|'.join(CONSENTS)} (chỉ clone giọng của chính chủ hoặc có giấy phép)")
    if not refs:
        raise ValueError("cần ít nhất một file giọng mẫu (--ref), tốt nhất 10–60 s, sạch nền")
    import torch

    conv = converter or _load_converter()
    CLONE_DIR.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        wavs = []
        for i, ref in enumerate(refs):
            wav = Path(tmp) / f"ref-{i}.wav"
            _to_wav(Path(ref), wav)
            wavs.append(str(wav))
        se = conv.extract_se(wavs)
    se_path = CLONE_DIR / f"{voice_id}.se.pt"
    torch.save(se.cpu(), se_path)
    entry = {
        "id": voice_id, "lang": lang, "gender": gender, "consent": consent, "note": note,
        "se_sha256": _sha256(se_path), "refs_sha256": [_sha256(Path(r)) for r in refs],
        "clone_version": CLONE_VERSION, "enrolled_at": int(time.time()),
    }
    data = load_registry()
    data.setdefault("voices", {})[voice_id] = entry
    _save_registry(data)
    return entry


def get_voice(voice_id: str) -> Dict[str, Any]:
    entry = load_registry().get("voices", {}).get(voice_id)
    if not entry:
        raise KeyError(f"giọng clone {voice_id} chưa enroll (python3 -m bkt_web.voice_clone list)")
    se_path = CLONE_DIR / f"{voice_id}.se.pt"
    if not se_path.exists() or _sha256(se_path) != entry["se_sha256"]:
        raise RuntimeError(f"embedding của {voice_id} thiếu hoặc bị đổi — enroll lại")
    return entry


def seed_for(src: Path, voice_id: str) -> int:
    digest = hashlib.sha256(Path(src).read_bytes() + b"|" + voice_id.encode()).digest()
    return int.from_bytes(digest[:4], "big")


def convert(voice_id: str, src: Path, out: Path, *, tau: float = DEFAULT_TAU, converter=None) -> Dict[str, Any]:
    import torch

    get_voice(voice_id)
    conv = converter or _load_converter()
    tgt_se = torch.load(CLONE_DIR / f"{voice_id}.se.pt", map_location="cpu")
    with tempfile.TemporaryDirectory() as tmp:
        wav_in = Path(tmp) / "src.wav"
        wav_out = Path(tmp) / "out.wav"
        _to_wav(Path(src), wav_in)
        torch.manual_seed(seed_for(Path(src), voice_id))  # posterior của converter lấy mẫu ngẫu nhiên → cố định seed
        src_se = conv.extract_se([str(wav_in)])
        conv.convert(str(wav_in), src_se, tgt_se, output_path=str(wav_out), tau=tau, message="@MyShell")
        Path(out).parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav_out), "-ar", "44100", "-codec:a", "libmp3lame",
                        "-q:a", "2", "-map_metadata", "-1", str(out)], check=True)
    return {"success": True, "voice": voice_id, "out": str(out), "tau": tau, "watermark": watermark_enabled()}


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Voice clone (OpenVoice V2 tone color converter)")
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("setup")
    e = sub.add_parser("enroll")
    e.add_argument("--id", required=True)
    e.add_argument("--ref", action="append", required=True)
    e.add_argument("--consent", required=True, choices=CONSENTS)
    e.add_argument("--lang", required=True)
    e.add_argument("--gender", default="any", choices=("male", "female", "any"))
    e.add_argument("--note", default="")
    c = sub.add_parser("convert")
    c.add_argument("--id", required=True)
    c.add_argument("--src", required=True)
    c.add_argument("--out", required=True)
    c.add_argument("--tau", type=float, default=DEFAULT_TAU)
    sub.add_parser("list")
    args = parser.parse_args(argv)
    try:
        if args.cmd == "setup":
            result: Any = {"openvoice_dir": str(setup())}
        elif args.cmd == "enroll":
            result = enroll(args.id, [Path(r) for r in args.ref], consent=args.consent, lang=args.lang, gender=args.gender, note=args.note)
        elif args.cmd == "convert":
            result = convert(args.id, Path(args.src), Path(args.out), tau=args.tau)
        else:
            result = load_registry()
    except Exception as exc:  # CLI cho Node: một dòng JSON
        print(json.dumps({"success": False, "error": str(exc)}, ensure_ascii=False))
        return 1
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
