// Nơi DUY NHẤT trộn các tầng: engine → variant → composition → country theme → account DNA → video.
// Mỗi tầng chỉ đặt khoá nó sở hữu (bảng ở docs/MATRIX_VARIANT_SYSTEM_V2.md mục 4.3). Renderer chỉ đọc ctx.creative.
import { KIT_VERSION } from "./VERSION.mjs";
import { PROFILE_VERSIONS, fontStack, treatmentCss } from "./profiles.mjs";
import { countryTheme } from "./theme.mjs";
import { stackFamily } from "./fonts.mjs";
import { createRng } from "./rng.mjs";
import { accountSeed, dnaSignature, normalizeDna, structuralKey, validateDna, videoSeed } from "../dna.mjs";
import { effectiveAxes } from "../schema.mjs";

export function rendererVersion(variant) {
  return `variant:${variant.id}@${variant.version}+kit@${KIT_VERSION}`;
}

/**
 * @param {object} p
 * @param {object} p.variant  base variant (tầng 2)
 * @param {object} p.dna      account DNA (tầng 5) — đã validate
 * @param {string} p.lang     ngôn ngữ/nước (tầng 4)
 * @param {string} p.channelId  kênh (seed account)
 * @param {string} p.slug     video (seed video, tầng 6)
 */
export function resolveCreativeContext({ variant, dna, lang, channelId, slug }) {
  const problems = validateDna(dna, variant, lang);
  if (problems.length) throw new Error(`invalid creative DNA for ${channelId}: ${problems.join("; ")}`);
  const normalized = normalizeDna(dna);
  const theme = countryTheme(lang, normalized.tone);
  const seed = accountSeed(channelId, variant.id, normalized.dna_version);
  const perVideo = videoSeed(seed, slug);
  const composition = variant.visualProfile.compositions[normalized.composition];
  const bodyStack = fontStack(normalized.typography, theme.script);
  return {
    variant,
    composition: { id: normalized.composition, ...composition },
    theme,
    dna: normalized,
    axes: effectiveAxes(variant, normalized.composition, normalized),
    fonts: { body: bodyStack, families: [stackFamily(bodyStack)] },
    treatmentCss: treatmentCss(normalized.treatment, perVideo),
    seeds: { account: seed, video: perVideo },
    rng: createRng(perVideo),
    observability: {
      engine: variant.engine,
      variant_id: variant.id,
      variant_version: variant.version,
      kit_version: KIT_VERSION,
      profile_versions: PROFILE_VERSIONS,
      creative_dna: normalized,
      creative_signature: dnaSignature(normalized, { variantId: variant.id, country: lang }),
      structural_key: structuralKey(variant.id, normalized.composition),
      country: theme.lang,
      font_families: [stackFamily(bodyStack)],
      renderer_version: rendererVersion(variant),
    },
  };
}
