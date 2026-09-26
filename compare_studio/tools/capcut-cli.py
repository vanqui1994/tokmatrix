#!/usr/bin/env python3
"""
CLI bridge for CapCut Text-to-Speech (TTS) and Speech-to-Text (STT).
Can be called from Node.js or terminal.
"""

import argparse
import json
import os
import sys
from pathlib import Path

# Add tools directory to sys.path so capcut_tts_api is importable
tools_dir = Path(__file__).parent.resolve()
if str(tools_dir) not in sys.path:
    sys.path.insert(0, str(tools_dir))

from capcut_tts_api import CapCutClient, CapCutError, CapCutTaskError


def cmd_tts(args):
    client = CapCutClient()
    text = args.text
    voice = args.voice or "BV421_vivn_streaming"
    rate = str(args.rate or "1.0")
    out_path = Path(args.out).resolve() if args.out else None

    # Resolve voice
    resolved_voice, res_id = client.resolve_voice(voice)

    # Submit task and wait for completion
    res = client.generate_speech(
        texts=text,
        voice=resolved_voice,
        resource_id=res_id,
        rate=rate,
        wait=True,
        timeout=args.timeout,
    )

    # Extract info from payload
    tasks = (res.get("data") or {}).get("tasks") or []
    if not tasks:
        raise CapCutTaskError(f"No task in response: {res}")

    task = tasks[0]
    raw_payload = task.get("payload_parsed") or task.get("payload", "")
    if isinstance(raw_payload, str):
        try:
            payload = json.loads(raw_payload)
        except Exception:
            payload = {}
    else:
        payload = raw_payload or {}

    subtitles = payload.get("audio_subtitles") or []
    speech_url = subtitles[0].get("speech_url") if subtitles else None
    duration_ms = subtitles[0].get("duration") if subtitles else 0
    duration_sec = float(duration_ms) / 1000.0 if duration_ms else 0.0

    bytes_written = 0
    if out_path:
        audio_bytes = client.download_speech_audio(res, out_path=out_path)
        bytes_written = len(audio_bytes)

    result = {
        "success": True,
        "voice": resolved_voice,
        "resource_id": res_id,
        "duration": duration_sec,
        "duration_ms": duration_ms,
        "bytes": bytes_written,
        "out": str(out_path) if out_path else None,
        "speech_url": speech_url,
    }

    print(json.dumps(result, ensure_ascii=False))


def cmd_stt(args):
    client = CapCutClient()
    file_path = Path(args.file).resolve()
    if not file_path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")

    lang = args.lang or "vi-VN"
    res = client.transcribe_file(
        file_path=str(file_path),
        language=lang,
        wait=True,
        timeout=args.timeout,
    )

    subtitles = client.extract_subtitles(res)
    utterances = [
        {
            "start": u.start_time / 1000.0,
            "end": u.end_time / 1000.0,
            "text": u.text,
        }
        for u in subtitles.utterances
    ]

    result = {
        "success": True,
        "full_text": subtitles.full_text,
        "utterances": utterances,
    }

    if args.out:
        out_path = Path(args.out).resolve()
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")

    print(json.dumps(result, ensure_ascii=False))


def cmd_voices(args):
    client = CapCutClient()
    voices = client.list_voices(lang=args.lang)
    result = [
        {
            "voice_type": v.voice_type,
            "display_name": v.display_name,
            "resource_id": v.resource_id,
            "lang": v.lang,
        }
        for v in voices
    ]
    print(json.dumps(result, indent=2, ensure_ascii=False))


def main():
    parser = argparse.ArgumentParser(description="CapCut TTS and STT CLI bridge")
    subparsers = parser.add_subparsers(dest="command", required=True)

    # TTS command
    tts_parser = subparsers.add_parser("tts", help="Generate Text-to-Speech")
    tts_parser.add_argument("--text", required=True, help="Text to synthesize")
    tts_parser.add_argument("--voice", default="BV421_vivn_streaming", help="CapCut voice name or type")
    tts_parser.add_argument("--rate", default="1.0", help="Speech rate (0.5 to 2.0)")
    tts_parser.add_argument("--out", help="Output MP3 file path")
    tts_parser.add_argument("--timeout", type=float, default=30.0, help="Timeout in seconds")
    tts_parser.set_defaults(func=cmd_tts)

    # STT command
    stt_parser = subparsers.add_parser("stt", help="Transcribe audio/video to subtitles")
    stt_parser.add_argument("--file", required=True, help="Path to audio or video file")
    stt_parser.add_argument("--lang", default="vi-VN", help="Audio language")
    stt_parser.add_argument("--out", help="Output JSON file path")
    stt_parser.add_argument("--timeout", type=float, default=120.0, help="Timeout in seconds")
    stt_parser.set_defaults(func=cmd_stt)

    # Voices command
    voices_parser = subparsers.add_parser("voices", help="List available voices")
    voices_parser.add_argument("--lang", help="Filter by language code (e.g. vi-VN, en-US)")
    voices_parser.set_defaults(func=cmd_voices)

    args = parser.parse_args()
    try:
        args.func(args)
    except Exception as exc:
        err = {"success": False, "error": str(exc)}
        print(json.dumps(err, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
