#!/usr/bin/env node
// Deterministically materialize the 180 Channel DNA YAML catalog from the
// compatibility matrix. Existing hand-authored pilot files are never changed.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG = path.join(ROOT, "config");
const CHANNELS = path.join(CONFIG, "channels");
const matrix = YAML.parse(fs.readFileSync(path.join(CONFIG, "compatibility_matrix.yaml"), "utf8"));
const soundscapeFor = (engine) => ({ mystery: "mystery", newspaper: "newspaper", vox: "vox", kinetic: "kinetic", survival: "survival", science: "science" }[engine] || "science");
const styleFor = (niche) => niche === "deep_space" ? "cosmic_space_v1" : "dark_mystery_v1";
const prefixFor = (niche) => ({ unsolved_mysteries: "mystery", deep_space: "space" }[niche] || niche);

fs.mkdirSync(CHANNELS, { recursive: true });
for (const niche of matrix.niches) {
  const compatible = matrix.engines.filter((engine) => niche.scores[engine.id] >= matrix.minimum_score)
    .sort((a, b) => niche.scores[b.id] - niche.scores[a.id] || a.id.localeCompare(b.id));
  for (let index = 1; index <= 10; index += 1) {
    const channelId = `${prefixFor(niche.id)}_${String(index).padStart(2, "0")}`;
    const output = path.join(CHANNELS, `${channelId}.yaml`);
    if (fs.existsSync(output)) continue;
    const first = compatible[(index - 1) % compatible.length].id;
    const selected = [first, compatible[index % compatible.length].id, compatible[(index + 1) % compatible.length].id]
      .filter((id, position, all) => all.indexOf(id) === position);
    const data = {
      channel_id: channelId, config_version: 2, niche_id: niche.id,
      name: `${niche.name} ${String(index).padStart(2, "0")}`,
      tiktok_account_ref: null,
      persona: { tone: "evidence_first_editorial", energy_level: 0.65 + ((index % 3) * 0.05), target_demographic: "Vietnamese viewers aged 18-34", catchphrase_prefix: "Điều đáng chú ý trong câu chuyện này là:" },
      story: { preferred_blueprints: [niche.id === "deep_space" ? "science_explainer" : "mystery_reveal"], preferred_hook_types: ["evidence_hook", "paradox_question"], target_duration_seconds: 48 + (index % 4) * 2, pacing_beats: 12 },
      creative: { preferred_engines: selected, visual_style_id: styleFor(niche.id), cut_cadence_seconds: 2.4 + (index % 3) * 0.2, palette: niche.id === "deep_space" ? { primary: "#0B0C10", accent: "#66FCF1", text: "#C5C6C7" } : { primary: "#111318", accent: "#D6A84F", text: "#F2EEE6" } },
      audio: { voice_id: "vi-VN-NamMinhNeural", voice_speed: 1.02, voice_pitch: -1, music_family: `${niche.id}_editorial`, soundscape_id: soundscapeFor(first), sfx_density: "medium" },
      publishing: { language: "vi", default_schedule_window: "19:30-20:30", hashtags: [niche.id.replaceAll("_", ""), "khampha", "facts"] },
    };
    fs.writeFileSync(output, YAML.stringify(data), "utf8");
  }
}
