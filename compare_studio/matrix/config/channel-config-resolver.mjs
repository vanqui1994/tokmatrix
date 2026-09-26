import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateConfigs } from "../../tools/matrix-config-validator.mjs";
import { SOUNDSCAPE_PRESETS } from "../../tools/soundscapes.mjs";

const CONFIG_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../config");

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

export function resolvePilotChannelConfigs({ configDir = CONFIG_DIR, nicheId } = {}) {
  const validation = validateConfigs({ configDir });
  if (!validation.valid) throw new Error(`Invalid Matrix config:\n${validation.errors.join("\n")}`);

  const documents = validation.documents;
  const matrix = documents.compatibility_matrix[0].data;
  const niches = new Map(documents.niches.map(({ data }) => [data.niche_id, data]));
  const blueprints = new Map(documents.blueprints.map(({ data }) => [data.blueprint_id, data]));
  const styles = new Map(documents.styles.map(({ data }) => [data.style_id, data]));
  const matrixNiches = new Map(matrix.niches.map((niche) => [niche.id, niche]));

  return documents.channels.filter(({ data: channel }) => !nicheId || channel.niche_id === nicheId).map(({ data: channel }) => {
    const niche = niches.get(channel.niche_id);
    const matrixNiche = matrixNiches.get(channel.niche_id);
    const soundscape = SOUNDSCAPE_PRESETS[channel.audio.soundscape_id];
    if (!soundscape) throw new Error(`Unknown soundscape_id ${channel.audio.soundscape_id} for ${channel.channel_id}`);
    const compatibility = {
      minimum_score: matrix.minimum_score,
      engines: channel.creative.preferred_engines.map((id) => ({ id, score: matrixNiche.scores[id] })),
    };
    const snapshot = {
      channel: Object.fromEntries(Object.entries(channel).filter(([key]) => key !== "config_version")),
      niche,
      style: styles.get(channel.creative.visual_style_id),
      blueprints: channel.story.preferred_blueprints.map((id) => blueprints.get(id)),
      soundscape: { id: channel.audio.soundscape_id, ...soundscape },
      compatibility,
    };
    const canonical = JSON.stringify(stable(snapshot));
    const configHash = crypto.createHash("sha256").update(canonical).digest("hex");
    return {
      channel_id: channel.channel_id,
      niche_id: channel.niche_id,
      channel_name: channel.name,
      tiktok_account_ref: channel.tiktok_account_ref,
      persona_tone: channel.persona.tone,
      preferred_voice_id: channel.audio.voice_id,
      visual_style_id: channel.creative.visual_style_id,
      cut_rate_seconds: channel.creative.cut_cadence_seconds,
      config_version: channel.config_version,
      config_hash: configHash,
      resolved_config: { ...snapshot, config_version: channel.config_version, config_hash: configHash },
    };
  }).sort((a, b) => a.channel_id.localeCompare(b.channel_id));
}
