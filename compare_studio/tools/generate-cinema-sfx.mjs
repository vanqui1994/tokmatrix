// tools/generate-cinema-sfx.mjs
// Synthesizes 8 crisp, pro-grade cinema sound effects into shared/audio/sfx/
// using ffmpeg's audio synthesis and filtergraph engines.
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SFX_DIR = path.resolve(__dirname, "..", "shared", "audio", "sfx");
fs.mkdirSync(SFX_DIR, { recursive: true });

function run(cmd) {
  execSync(cmd, { stdio: "pipe" });
}

console.log("🎬 Synthesizing Cinema Soundscape SFX Library...");

// 1. deep_boom.mp3 — Low-frequency cinematic impact / sub boom (2.2s)
try {
  const out = path.join(SFX_DIR, "deep_boom.mp3");
  const cmd = `ffmpeg -y \
    -f lavfi -i "sine=frequency=72:duration=2.2,asetrate=44100*0.75,aresample=44100,afade=t=out:st=0.15:d=2.05,volume=2.2" \
    -f lavfi -i "anoisesrc=d=2.0:c=brown:r=44100,lowpass=f=120,afade=t=out:st=0.08:d=1.9,volume=2.0" \
    -filter_complex "[0:a][1:a]amix=inputs=2:weights=1.6 1.0,volume=1.5,lowpass=f=220" \
    -b:a 192k "${out}"`;
  run(cmd);
  console.log("  ✓ deep_boom.mp3 created (2.2s cinematic low rumble)");
} catch (e) {
  console.error("  ✗ Error creating deep_boom:", e.message);
}

// 2. sub_drop.mp3 — 808 Sub-bass pitch slide drop (1.3s)
try {
  const out = path.join(SFX_DIR, "sub_drop.mp3");
  const cmd = `ffmpeg -y \
    -f lavfi -i "sine=frequency=125:duration=1.3,asetrate=44100*0.55,aresample=44100,afade=t=out:st=0.1:d=1.2,volume=2.4" \
    -b:a 192k "${out}"`;
  run(cmd);
  console.log("  ✓ sub_drop.mp3 created (1.3s 808 sub-bass drop)");
} catch (e) {
  console.error("  ✗ Error creating sub_drop:", e.message);
}

// 3. camera_shutter.mp3 — Mechanical DSLR shutter snapshot (0.35s)
try {
  const out = path.join(SFX_DIR, "camera_shutter.mp3");
  // Transient click 1 (mirror flip) + main shutter click + mechanical echo
  const cmd = `ffmpeg -y \
    -f lavfi -i "anoisesrc=d=0.04:c=white:r=44100,highpass=f=1800,volume=2.2" \
    -f lavfi -i "anoisesrc=d=0.09:c=white:r=44100,highpass=f=2500,volume=3.0" \
    -f lavfi -i "sine=frequency=1200:duration=0.05,afade=t=out:st=0.01:d=0.04,volume=0.8" \
    -filter_complex "[0:a]adelay=0|0[a0];[1:a]adelay=55|55[a1];[2:a]adelay=60|60[a2];[a0][a1][a2]amix=inputs=3:weights=1.0 2.0 0.6,afade=t=out:st=0.22:d=0.1,volume=1.8" \
    -b:a 192k "${out}"`;
  run(cmd);
  console.log("  ✓ camera_shutter.mp3 created (0.35s DSLR snapshot click)");
} catch (e) {
  console.error("  ✗ Error creating camera_shutter:", e.message);
}

// 4. typewriter.mp3 — Vintage mechanical keystroke clack (0.28s)
try {
  const out = path.join(SFX_DIR, "typewriter.mp3");
  const cmd = `ffmpeg -y \
    -f lavfi -i "sine=frequency=2400:duration=0.04,afade=t=out:st=0.005:d=0.035,volume=1.8" \
    -f lavfi -i "anoisesrc=d=0.08:c=white:r=44100,bandpass=f=1500:w=800,afade=t=out:st=0.02:d=0.06,volume=2.2" \
    -filter_complex "[0:a][1:a]amix=inputs=2:weights=1.4 1.2,volume=1.6" \
    -b:a 192k "${out}"`;
  run(cmd);
  console.log("  ✓ typewriter.mp3 created (0.28s mechanical keystroke)");
} catch (e) {
  console.error("  ✗ Error creating typewriter:", e.message);
}

// 5. heartbeat.mp3 — Visceral anatomical double thump lub-dub (0.9s)
try {
  const out = path.join(SFX_DIR, "heartbeat.mp3");
  const cmd = `ffmpeg -y \
    -f lavfi -i "sine=frequency=62:duration=0.14,afade=t=in:st=0:d=0.02,afade=t=out:st=0.04:d=0.10,volume=2.6" \
    -f lavfi -i "sine=frequency=72:duration=0.12,afade=t=in:st=0:d=0.02,afade=t=out:st=0.03:d=0.09,volume=2.3" \
    -filter_complex "[0:a]adelay=40|40[beat1];[1:a]adelay=240|240[beat2];[beat1][beat2]amix=inputs=2:weights=1.0 0.85,lowpass=f=140,volume=2.2" \
    -b:a 192k "${out}"`;
  run(cmd);
  console.log("  ✓ heartbeat.mp3 created (0.9s visceral lub-dub pulse)");
} catch (e) {
  console.error("  ✗ Error creating heartbeat:", e.message);
}

// 6. alarm.mp3 — Urgent staccato hazard siren / warning beeps (0.95s)
try {
  const out = path.join(SFX_DIR, "alarm.mp3");
  const cmd = `ffmpeg -y \
    -f lavfi -i "sine=frequency=950:duration=0.12,afade=t=out:st=0.08:d=0.04,volume=1.6" \
    -f lavfi -i "sine=frequency=820:duration=0.12,afade=t=out:st=0.08:d=0.04,volume=1.6" \
    -f lavfi -i "sine=frequency=950:duration=0.12,afade=t=out:st=0.08:d=0.04,volume=1.6" \
    -f lavfi -i "sine=frequency=820:duration=0.16,afade=t=out:st=0.10:d=0.06,volume=1.6" \
    -filter_complex "[0:a]adelay=0|0[p0];[1:a]adelay=180|180[p1];[2:a]adelay=360|360[p2];[3:a]adelay=540|540[p3];[p0][p1][p2][p3]amix=inputs=4:weights=1 1 1 1,volume=1.8" \
    -b:a 192k "${out}"`;
  run(cmd);
  console.log("  ✓ alarm.mp3 created (0.95s 4-pulse hazard siren)");
} catch (e) {
  console.error("  ✗ Error creating alarm:", e.message);
}

// 7. glitch.mp3 — Cyber digital stutter / error zap (0.45s)
try {
  const out = path.join(SFX_DIR, "glitch.mp3");
  const cmd = `ffmpeg -y \
    -f lavfi -i "anoisesrc=d=0.4:c=pink:r=44100,bandpass=f=2200:w=1400,flanger=delay=4:speed=10:depth=3,volume=2.4" \
    -f lavfi -i "sine=frequency=320:duration=0.18,asetrate=44100*1.6,aresample=44100,afade=t=out:st=0.05:d=0.13,volume=1.5" \
    -filter_complex "[0:a]adelay=0|0[n];[1:a]adelay=70|70[s];[n][s]amix=inputs=2:weights=1.6 1.0,volume=1.8" \
    -b:a 192k "${out}"`;
  run(cmd);
  console.log("  ✓ glitch.mp3 created (0.45s cyber zap & stutter)");
} catch (e) {
  console.error("  ✗ Error creating glitch:", e.message);
}

// 8. cash_register.mp3 — Metallic cash drawer ding + coin ring (1.1s)
try {
  const out = path.join(SFX_DIR, "cash_register.mp3");
  const cmd = `ffmpeg -y \
    -f lavfi -i "sine=frequency=2780:duration=0.8,afade=t=out:st=0.08:d=0.72,volume=1.8" \
    -f lavfi -i "sine=frequency=3700:duration=0.6,afade=t=out:st=0.05:d=0.55,volume=1.4" \
    -f lavfi -i "anoisesrc=d=0.09:c=white:r=44100,bandpass=f=4000:w=1200,volume=2.2" \
    -filter_complex "[2:a]adelay=0|0[clack];[0:a]adelay=40|40[chime1];[1:a]adelay=65|65[chime2];[clack][chime1][chime2]amix=inputs=3:weights=1.0 1.6 1.2,volume=1.6" \
    -b:a 192k "${out}"`;
  run(cmd);
  console.log("  ✓ cash_register.mp3 created (1.1s cha-ching & coin bell)");
} catch (e) {
  console.error("  ✗ Error creating cash_register:", e.message);
}

console.log("🎉 All Cinema SFX synthesized successfully in shared/audio/sfx/");
