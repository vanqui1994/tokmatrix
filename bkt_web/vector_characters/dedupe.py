"""Deduplicate clips with identical or near-identical keyframes and motions."""

import copy
import math
from collections import defaultdict
from typing import Dict, Any, Tuple, List


def keyframe_fingerprint(kf: Dict[str, Any]) -> Tuple:
    items = []
    for k, v in sorted(kf.items()):
        if isinstance(v, float):
            items.append((k, round(v, 3)))
        elif isinstance(v, dict):
            items.append((k, tuple(sorted(v.items()))))
        elif isinstance(v, list):
            items.append((k, tuple(v)))
        else:
            items.append((k, v))
    return tuple(items)


def action_fingerprint(a: Dict[str, Any]) -> Tuple:
    items = []
    for k, v in sorted(a.items()):
        if isinstance(v, float):
            items.append((k, round(v, 3)))
        elif isinstance(v, list):
            items.append((k, tuple(v)))
        elif isinstance(v, dict):
            items.append((k, tuple(sorted(v.items()))))
        else:
            items.append((k, v))
    return tuple(items)


def trajectory_fingerprint(clip: Dict[str, Any]) -> Tuple:
    """Compute trajectory fingerprint for exact matching."""
    kfs = tuple(keyframe_fingerprint(k) for k in clip.get("keyframes", []))
    acts = tuple(action_fingerprint(a) for a in clip.get("actions", []))
    needs = clip.get("needs", {})
    needs_fp = (
        tuple(sorted(needs.get("partners", []))),
        tuple(sorted(needs.get("props", []))),
    )
    return (
        clip.get("character"),
        clip.get("kind"),
        round(clip.get("duration", 0), 3),
        clip.get("space"),
        kfs,
        acts,
        needs_fp,
    )


def dedupe_clips(
    clips_db: Dict[str, Any],
    story_refs_db: Dict[str, Any],
    tolerance_px: float = 0.0,
) -> Tuple[Dict[str, Any], Dict[str, Any], Dict[str, Any]]:
    """Deduplicate clips, merging identical trajectories and consolidating sources.
    
    Returns (deduped_clips, updated_story_refs, report).
    """
    deduped_clips: Dict[str, Any] = {}
    clip_remap: Dict[str, str] = {}
    fingerprint_map: Dict[Tuple, str] = {}

    merged_count = 0
    merge_groups = defaultdict(list)

    # Process all clips deterministically sorted by key
    for clip_id, clip in sorted(clips_db.items()):
        fp = trajectory_fingerprint(clip)
        if fp in fingerprint_map:
            canonical_id = fingerprint_map[fp]
            clip_remap[clip_id] = canonical_id
            merged_count += 1
            merge_groups[canonical_id].append(clip_id)

            # Consolidate sources into canonical clip
            canonical_clip = deduped_clips[canonical_id]
            existing_sources = canonical_clip.setdefault("sources", [])
            for src in clip.get("sources", []):
                if src not in existing_sources:
                    existing_sources.append(src)
            if "source" in clip and clip["source"] not in existing_sources:
                existing_sources.append(clip["source"])
        else:
            canonical_id = clip_id
            fingerprint_map[fp] = canonical_id
            c_copy = copy.deepcopy(clip)
            if "sources" not in c_copy:
                c_copy["sources"] = [c_copy["source"]] if "source" in c_copy else []
            deduped_clips[canonical_id] = c_copy

    # Update story references to use canonical clip IDs
    updated_story_refs = copy.deepcopy(story_refs_db)
    for sid, sref in updated_story_refs.items():
        for sc in sref.get("scenes", []):
            for aref in sc.get("actors", []):
                old_clip = aref.get("clip")
                if old_clip in clip_remap:
                    aref["clip"] = clip_remap[old_clip]

    report = {
        "original_clips": len(clips_db),
        "deduped_clips": len(deduped_clips),
        "merged_count": merged_count,
        "merge_groups": dict(merge_groups),
    }

    return deduped_clips, updated_story_refs, report
