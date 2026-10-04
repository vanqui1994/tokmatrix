"""CLI interface for vector character library management.

Usage:
    python3 -m bkt_web.vector_characters extract
    python3 -m bkt_web.vector_characters dedupe
    python3 -m bkt_web.vector_characters compose [--story STORY_ID]
    python3 -m bkt_web.vector_characters sheet [--out DIR]
    python3 -m bkt_web.vector_characters report
"""

import argparse
import json
import sys
from pathlib import Path
from collections import Counter

from bkt_web.remake_vector import STATIC_DIR
from bkt_web.vector_characters.extract import extract_library, round_float
from bkt_web.vector_characters.dedupe import dedupe_clips
from bkt_web.vector_characters.compose import compose_story


CHARACTERS_FILE = STATIC_DIR / "remake_vector_characters.json"
CLIPS_FILE = STATIC_DIR / "remake_vector_clips.json"
STORY_REFS_FILE = STATIC_DIR / "remake_vector_story_refs.json"


def cmd_extract(args):
    """Extract characters, clips, and story refs, write deterministic JSONs."""
    print("Extracting library from 79 sample stories + neutral variants...")
    chars, raw_clips, story_refs = extract_library(include_neutrals=True)

    print(f"Extracted {len(chars)} characters, {len(raw_clips)} raw clips, {len(story_refs)} story references.")
    print("Deduplicating identical clip tracks...")
    clips, story_refs, dedupe_report = dedupe_clips(raw_clips, story_refs)
    print(f"Deduplicated {dedupe_report['merged_count']} clips -> {len(clips)} canonical clips remain.")

    # Update character clip references
    for char_id, char_meta in chars.items():
        canonical_clips = []
        for c in char_meta.get("clips", []):
            mapped = dedupe_report["merge_groups"].get(c, c)
            # Find which canonical clip contains this clip
            for can_id, group in dedupe_report["merge_groups"].items():
                if c in group or c == can_id:
                    if can_id not in canonical_clips and can_id in clips:
                        canonical_clips.append(can_id)
                    break
            else:
                if c in clips and c not in canonical_clips:
                    canonical_clips.append(c)
        char_meta["clips"] = sorted(canonical_clips)

    # Incorporate recurring cast clips (Plan §4.3)
    try:
        from bkt_web.vector_characters.cast import get_all_cast_clips
        cast_clips = get_all_cast_clips()
        for cid, c_clips in cast_clips.items():
            c_keys = []
            for cname, cdata in c_clips.items():
                ckey = f"{cid}/{cname}"
                clips[ckey] = cdata
                c_keys.append(ckey)
            if cid in chars:
                chars[cid]["clips"] = sorted(set(chars[cid].get("clips", []) + c_keys))
    except Exception as e:
        print(f"Warning: could not load recurring cast clips: {e}")

    # Deterministic float rounding & sorting
    chars_clean = round_float(chars, 3)
    clips_clean = round_float(clips, 3)
    refs_clean = round_float(story_refs, 3)

    # Write files with sorted keys
    CHARACTERS_FILE.write_text(
        json.dumps(chars_clean, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    CLIPS_FILE.write_text(
        json.dumps(clips_clean, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    STORY_REFS_FILE.write_text(
        json.dumps(refs_clean, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    print(f"Wrote {CHARACTERS_FILE} ({len(chars_clean)} characters)")
    print(f"Wrote {CLIPS_FILE} ({len(clips_clean)} clips)")
    print(f"Wrote {STORY_REFS_FILE} ({len(refs_clean)} story references)")
    print("Extraction completed successfully.")


def cmd_dedupe(args):
    """Run clip deduplication analysis."""
    if not CLIPS_FILE.exists() or not STORY_REFS_FILE.exists():
        print("Run extract first.")
        return
    clips = json.loads(CLIPS_FILE.read_text(encoding="utf-8"))
    refs = json.loads(STORY_REFS_FILE.read_text(encoding="utf-8"))
    deduped, _, report = dedupe_clips(clips, refs)
    print(f"Original clips: {report['original_clips']}")
    print(f"Canonical clips: {report['deduped_clips']}")
    print(f"Merged clips: {report['merged_count']}")


def cmd_compose(args):
    """Test composition of stories from story references."""
    if not CHARACTERS_FILE.exists() or not CLIPS_FILE.exists() or not STORY_REFS_FILE.exists():
        print("Run extract first.")
        return
    chars = json.loads(CHARACTERS_FILE.read_text(encoding="utf-8"))
    clips = json.loads(CLIPS_FILE.read_text(encoding="utf-8"))
    refs = json.loads(STORY_REFS_FILE.read_text(encoding="utf-8"))

    target_stories = [args.story] if args.story else list(refs.keys())
    success = 0
    for sid in target_stories:
        if sid not in refs:
            print(f"Story {sid} not found in references.")
            continue
        try:
            story = compose_story(refs[sid], chars, clips)
            success += 1
        except Exception as e:
            print(f"Failed composing {sid}: {e}")

    print(f"Successfully composed and validated {success}/{len(target_stories)} stories.")


def cmd_sheet(args):
    """Render character sheets and review images."""
    from bkt_web.vector_characters.sheet import (
        render_all_sheets,
        render_hat_comparison,
        render_neutral_stories_review,
    )
    out_dir = Path(args.out) if args.out else Path("/tmp/char_sheets")
    out_dir.mkdir(parents=True, exist_ok=True)

    if not CHARACTERS_FILE.exists() or not CLIPS_FILE.exists():
        print("Run extract first.")
        return
    chars = json.loads(CHARACTERS_FILE.read_text(encoding="utf-8"))
    clips = json.loads(CLIPS_FILE.read_text(encoding="utf-8"))

    print(f"Rendering character sheets to {out_dir}...")
    rendered = render_all_sheets(chars, clips, out_dir, limit=args.limit)
    print(f"Rendered {len(rendered)} character sheets.")

    hat_file = out_dir / "hat_comparison.png"
    print(f"Rendering hat style comparison to {hat_file}...")
    render_hat_comparison(hat_file)

    print(f"Rendering neutral story review frames to {out_dir}...")
    n_frames = render_neutral_stories_review(out_dir)
    print(f"Rendered {len(n_frames)} neutral story review frames.")


def cmd_report(args):
    """Print detailed summary report of library state."""
    if not CHARACTERS_FILE.exists() or not CLIPS_FILE.exists() or not STORY_REFS_FILE.exists():
        chars, clips, refs = extract_library(include_neutrals=True)
        clips, refs, dedupe_report = dedupe_clips(clips, refs)
    else:
        chars = json.loads(CHARACTERS_FILE.read_text(encoding="utf-8"))
        clips = json.loads(CLIPS_FILE.read_text(encoding="utf-8"))
        refs = json.loads(STORY_REFS_FILE.read_text(encoding="utf-8"))
        dedupe_report = {"merged_count": 0}

    engine_chars = {k: v for k, v in chars.items() if not v.get("archived", False)}
    archived_chars = {k: v for k, v in chars.items() if v.get("archived", False)}

    kinds = Counter(c.get("kind", "unknown") for c in clips.values())
    roles = Counter(c.get("role", "unknown") for c in chars.values())
    locales = Counter(c.get("locale", "unknown") for c in chars.values())

    print("\n========================================================")
    print("   THƯ VIỆN NHÂN VẬT VECTOR · BÁO CÁO TỔNG HỢP")
    print("========================================================")
    print(f"Tổng số nhân vật: {len(chars)}")
    print(f"  - Cấp cho Engine: {len(engine_chars)}")
    print(f"  - Lưu trữ (archived / vi): {len(archived_chars)}")
    print(f"\nPhân bố nhân vật theo vai (role):")
    for r, count in roles.most_common():
        print(f"  - {r:12}: {count}")

    print(f"\nPhân bố nhân vật theo thị trường / locale:")
    for loc, count in locales.most_common():
        print(f"  - {loc:12}: {count}")

    print(f"\nTổng số clip: {len(clips)}")
    print("Phân bố clip theo loại (kind):")
    for k, count in kinds.most_common():
        print(f"  - {k:12}: {count}")

    print("\n--------------------------------------------------------")
    print("BẢNG TÊN NHÂN VẬT ĐỀ XUẤT (ID + LABEL 4 THỨ TIẾNG + VAI + MARKETS):")
    print("--------------------------------------------------------")
    print(f"{'ID':24} | {'EN':22} | {'DE':22} | {'KO':18} | {'JA':18} | {'ROLE':10} | {'MARKETS'}")
    print("-" * 130)
    for cid, c in sorted(engine_chars.items()):
        lbl = c.get("label", {})
        mkts = ",".join(c.get("markets", []))
        print(f"{cid:24} | {lbl.get('en', ''):22} | {lbl.get('de', ''):22} | {lbl.get('ko', ''):18} | {lbl.get('ja', ''):18} | {c.get('role', ''):10} | {mkts}")

    print("\n--------------------------------------------------------")
    print("NHÂN VẬT VĂN HOÁ & ĐỀ XUẤT DÙNG CHÉO NƯỚC:")
    print("--------------------------------------------------------")
    cultural = [c for c in engine_chars.values() if c.get("locale") in ("de", "us", "kr", "jp")]
    for c in cultural:
        cid = c.get("id") or [k for k, v in chars.items() if v == c][0]
        lbl = c.get("label", {}).get("en", cid)
        loc = c.get("locale")
        mkts = c.get("markets", [])
        print(f"- {cid} ({lbl}) [{loc}]: Hiện cấp: {mkts}. Đề xuất: dùng chéo de/us/kr/jp nếu chủ repo duyệt.")


def main():
    parser = argparse.ArgumentParser(description="Vector Character Library CLI")
    subparsers = parser.add_subparsers(dest="command")

    sub_ext = subparsers.add_parser("extract", help="Extract characters, clips, story refs")
    sub_ded = subparsers.add_parser("dedupe", help="Analyze and dedupe clips")

    sub_comp = subparsers.add_parser("compose", help="Compose and validate stories")
    sub_comp.add_argument("--story", help="Story ID to compose (default all)")

    sub_sheet = subparsers.add_parser("sheet", help="Render contact sheets")
    sub_sheet.add_argument("--out", default="/tmp/char_sheets", help="Output directory")
    sub_sheet.add_argument("--limit", type=int, default=None, help="Limit number of character sheets")

    sub_rep = subparsers.add_parser("report", help="Print summary report")

    args = parser.parse_args()
    if args.command == "extract":
        cmd_extract(args)
    elif args.command == "dedupe":
        cmd_dedupe(args)
    elif args.command == "compose":
        cmd_compose(args)
    elif args.command == "sheet":
        cmd_sheet(args)
    elif args.command == "report":
        cmd_report(args)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
