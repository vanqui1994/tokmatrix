# Perceptual frame and audio comparison (UV-602)

Module: `bkt_web/fidelity_visual.py` · Tests: `tests/test_fidelity_visual.py`

Looks at what actually came out — rendered frames and rendered audio — and compares it to a reference, **per scene** and **per profile**.

```python
reference = [SceneMedia.build("scene.one", frames=[...], audio=wav_path)]
candidate = [SceneMedia.build("scene.one", frames=[...], audio=other_path)]
report = compare_render(reference, candidate, "source-faithful")
report.passed, report.codes(), report.for_scene("scene.one"), report.as_dict()
```

## No single threshold for every genre

A comparison always runs under a named profile; there is no global default to fall into, and an unknown name is an error rather than a silent fallback.

| Profile | mean SSIM | max RMSE | per-frame SSIM | audio duration | loudness | silence |
|---|---|---|---|---|---|---|
| `source-faithful` | 0.96 | 0.06 | 0.90 | 0.04 s | 1.0 dB | 0.05 |
| `news` | 0.95 | 0.07 | 0.88 | 0.05 s | 1.0 dB | 0.05 |
| `product` | 0.94 | 0.08 | 0.86 | 0.08 s | 1.5 dB | 0.08 |
| `educational` | 0.92 | 0.10 | 0.82 | 0.10 s | 2.0 dB | 0.10 |
| `tiktok-fast` | 0.80 | 0.20 | 0.65 | 0.20 s | 3.0 dB | 0.20 |
| `meme` | 0.60 | 0.35 | 0.40 | 0.30 s | 4.0 dB | 0.30 |

The names match the Auto Director's profiles, so one decision carries through from direction to verdict. A custom `ComparisonProfile` is validated the same way, including the rule that a per-frame threshold may not be stricter than the scene average.

## How frames are compared

Every frame is reduced to a 64×64 grayscale grid and scored with **mean SSIM over 8×8 tiles** plus normalised **RMSE**. Inputs may be a PNG path, a PIL image, or a plain 2D grid of 0–255 values; different source sizes are compared on the shared grid and reported as `FRAME_SIZE_MISMATCH` (warn). Pure Python over small buffers: deterministic, no network, no GPU.

Codes: `SCENE_NOT_RENDERED`, `NO_REFERENCE_FRAMES`, `NO_CANDIDATE_FRAMES`, `FRAME_COUNT_MISMATCH`, `FRAME_SIZE_MISMATCH`, `FRAME_PERCEPTUAL_DRIFT`, `FRAME_RMSE_HIGH`, `SCENE_PERCEPTUAL_DRIFT`, `SCENE_NOT_IN_REFERENCE`.

## How audio is compared

Duration, RMS loudness in dBFS and silence ratio, from a 16-bit PCM WAV path or a sequence of −1..1 samples. Digital silence reports a −120 dB floor rather than `-inf`.

Codes: `AUDIO_MISSING`, `AUDIO_DURATION_DRIFT`, `AUDIO_LOUDNESS_DRIFT`, `AUDIO_SILENCE_DRIFT`, and `AUDIO_SILENT_OUTPUT` — a scene that speaks in the reference and is silent in the candidate fails outright, because a failed voice must never pass as a finished scene.

## Nothing missing counts as a pass

Zero frames is a failure, not a perfect score. A scene the candidate did not render fails. A scene the candidate added that the reference does not have is a warning.

## Limits

- Grayscale only: a colour-only regression will not be caught.
- SSIM on a 64×64 grid is a coarse perceptual proxy, good for drift and gross breakage, not for fine typography.
- Loudness is plain RMS, not LUFS with K-weighting.
- Frames must be supplied by the caller; this module does not rasterise anything.
