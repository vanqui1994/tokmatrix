import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";
import YAML from "yaml";
import { getVoice } from "./voices.mjs";
import { getVariant } from "../matrix/render/variants/index.mjs";
import { validateDna } from "../matrix/render/variants/dna.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../config");
const CATEGORY_SCHEMAS = {
  channels: "channel-dna.schema.json",
  niches: "niche.schema.json",
  blueprints: "blueprint.schema.json",
  styles: "style.schema.json",
  qa_thresholds: "qa-thresholds.schema.json",
};

function readSchemas(configDir) {
  const schemaDir = path.join(configDir, "schemas");
  const schemas = Object.fromEntries(
    Object.values(CATEGORY_SCHEMAS).concat("compatibility-matrix.schema.json").map((name) => [
      name,
      JSON.parse(fs.readFileSync(path.join(schemaDir, name), "utf8")),
    ]),
  );
  return schemas;
}

function listYamlFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "schemas" ? [] : listYamlFiles(fullPath);
    return /\.ya?ml$/i.test(entry.name) ? [fullPath] : [];
  });
}

function getCategory(relativePath) {
  const parts = relativePath.split(path.sep);
  if (parts.length === 1 && parts[0] === "compatibility_matrix.yaml") return "compatibility_matrix";
  if (parts.length === 1 && parts[0] === "qa_thresholds.yaml") return "qa_thresholds";
  return parts[0];
}

function validateRelations(documents, errors) {
  const matrix = documents.compatibility_matrix?.[0]?.data;
  if (!matrix) return;

  const engineIds = matrix.engines.map(({ id }) => id);
  const nicheIds = matrix.niches.map(({ id }) => id);
  if (new Set(engineIds).size !== engineIds.length) errors.push("compatibility_matrix.yaml: engine IDs must be unique");
  if (new Set(nicheIds).size !== nicheIds.length) errors.push("compatibility_matrix.yaml: niche IDs must be unique");

  for (const niche of matrix.niches) {
    const scoreIds = Object.keys(niche.scores).sort();
    if (JSON.stringify(scoreIds) !== JSON.stringify([...engineIds].sort())) {
      errors.push(`compatibility_matrix.yaml: ${niche.id} must define exactly one score for every engine`);
    }
  }
  const qaPolicy = documents.qa_thresholds?.[0]?.data;
  if (qaPolicy && JSON.stringify(Object.keys(qaPolicy.niches).sort()) !== JSON.stringify([...nicheIds].sort())) {
    errors.push("qa_thresholds.yaml: niche thresholds must cover exactly the compatibility matrix niches");
  }

  const nicheConfigs = new Map((documents.niches || []).map(({ data }) => [data.niche_id, data]));
  const blueprintIds = new Set((documents.blueprints || []).map(({ data }) => data.blueprint_id));
  const styleIds = new Set((documents.styles || []).map(({ data }) => data.style_id));
  const matrixNiches = new Map(matrix.niches.map((niche) => [niche.id, niche]));
  const channels = documents.channels || [];
  const channelIds = new Set();
  const channelCounts = new Map(matrix.niches.map(({ id }) => [id, 0]));

  for (const { data, relativePath } of channels) {
    if (channelIds.has(data.channel_id)) errors.push(`${relativePath}: duplicate channel_id ${data.channel_id}`);
    channelIds.add(data.channel_id);
    if (path.basename(relativePath, path.extname(relativePath)) !== data.channel_id) {
      errors.push(`${relativePath}: filename must match channel_id ${data.channel_id}`);
    }
    const matrixNiche = matrixNiches.get(data.niche_id);
    const nicheConfig = nicheConfigs.get(data.niche_id);
    if (!matrixNiche || !nicheConfig) {
      errors.push(`${relativePath}: niche_id ${data.niche_id} has no matrix and niche configuration`);
      continue;
    }
    if (channelCounts.has(data.niche_id)) channelCounts.set(data.niche_id, channelCounts.get(data.niche_id) + 1);
    if (!styleIds.has(data.creative.visual_style_id)) {
      errors.push(`${relativePath}: unknown visual_style_id ${data.creative.visual_style_id}`);
    }
    for (const blueprintId of data.story.preferred_blueprints) {
      if (!blueprintIds.has(blueprintId)) errors.push(`${relativePath}: unknown blueprint ${blueprintId}`);
    }
    const voice = getVoice(data.audio?.voice_id);
    if (!voice) {
      errors.push(`${relativePath}: unknown voice_id ${data.audio?.voice_id}`);
    } else if (data.publishing?.language && voice.lang !== data.publishing.language) {
      errors.push(`${relativePath}: voice_id ${voice.id} speaks ${voice.lang} but publishing.language is ${data.publishing.language}`);
    }
    const compatible = new Set(engineIds.filter((id) => matrixNiche.scores[id] >= matrix.minimum_score));
    for (const engineId of data.creative.preferred_engines) {
      if (!compatible.has(engineId) || !nicheConfig.allowed_engines.includes(engineId)) {
        errors.push(`${relativePath}: engine ${engineId} is not allowed for ${data.niche_id}`);
      }
    }
  }

  for (const { data, relativePath } of channels) errors.push(...validateChannelCreative(data).map((error) => `${relativePath}: ${error}`));

  for (const [nicheId, count] of channelCounts) {
    if (count < 10) errors.push(`${nicheId}: expected at least 10 channel configs, found ${count}`);
  }

  for (const { data, relativePath } of documents.niches || []) {
    const fileId = path.basename(relativePath, path.extname(relativePath));
    if (fileId !== data.niche_id && !new RegExp(`^\\d{2}_${data.niche_id}$`).test(fileId)) {
      errors.push(`${relativePath}: filename must match niche_id ${data.niche_id} (optionally prefixed with its two-digit catalog number)`);
    }
    const matrixNiche = matrixNiches.get(data.niche_id);
    if (!matrixNiche) {
      errors.push(`${relativePath}: niche_id ${data.niche_id} is missing from compatibility matrix`);
      continue;
    }
    const expected = engineIds.filter((id) => matrixNiche.scores[id] >= matrix.minimum_score);
    if (JSON.stringify(data.allowed_engines) !== JSON.stringify(expected)) {
      errors.push(`${relativePath}: allowed_engines must match the compatibility threshold and engine order`);
    }
  }

  for (const category of ["blueprints", "styles"]) {
    const idField = category === "blueprints" ? "blueprint_id" : "style_id";
    const seen = new Set();
    for (const { data, relativePath } of documents[category] || []) {
      if (seen.has(data[idField])) errors.push(`${relativePath}: duplicate ${idField} ${data[idField]}`);
      seen.add(data[idField]);
      if (path.basename(relativePath, path.extname(relativePath)) !== data[idField]) {
        errors.push(`${relativePath}: filename must match ${idField} ${data[idField]}`);
      }
    }
  }
}

/**
 * Luật Creative DNA của một kênh (docs/MATRIX_VARIANT_SYSTEM_V2.md mục 12). Kênh không có creative.variant_id
 * không bị kiểm gì thêm (đường legacy). Variant "reference" chỉ hợp lệ khi MATRIX_ALLOW_REFERENCE_VARIANTS=1.
 */
export function validateChannelCreative(data) {
  const errors = [];
  const fx = data.audio?.voice_fx;
  // FX giọng chưa có trong audio-orchestrator (Phase 1): chấp nhận giá trị khác "none" sẽ ghi sai meta.creative.
  if (fx && fx !== "none") errors.push(`audio.voice_fx "${fx}" is not implemented yet (only "none")`);
  const variantId = data.creative?.variant_id;
  if (!variantId) return errors;
  const variant = getVariant(variantId);
  if (!variant) return [...errors, `creative.variant_id ${variantId} is unknown or not active`];
  const engines = data.creative.preferred_engines || [];
  if (engines.length !== 1 || engines[0] !== variant.engine) {
    errors.push(`creative.preferred_engines must be exactly [${variant.engine}] for variant ${variantId}`);
  }
  const niches = variant.compatibility.niches;
  if (Array.isArray(niches) && !niches.includes(data.niche_id)) errors.push(`variant ${variantId} does not allow niche ${data.niche_id}`);
  errors.push(...validateDna(data.creative.dna, variant, data.publishing?.language).map((error) => `creative.${error}`));
  return errors;
}

export function validateConfigObject(category, data, schemas) {
  const schemaName = category === "compatibility_matrix"
    ? "compatibility-matrix.schema.json"
    : CATEGORY_SCHEMAS[category];
  if (!schemaName) return [`unknown YAML config category: ${category}`];
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(schemas[schemaName]);
  if (validate(data)) return [];
  return validate.errors.map((error) => `${error.instancePath || "/"} ${error.message}`);
}

export function validateConfigs({ configDir = ROOT } = {}) {
  const schemas = readSchemas(configDir);
  const documents = {};
  const errors = [];
  const yamlFiles = listYamlFiles(configDir);

  for (const fullPath of yamlFiles) {
    const relativePath = path.relative(configDir, fullPath);
    const category = getCategory(relativePath);
    const schemaName = category === "compatibility_matrix"
      ? "compatibility-matrix.schema.json"
      : CATEGORY_SCHEMAS[category];
    if (!schemaName) {
      errors.push(`${relativePath}: no schema registered for YAML category ${category}`);
      continue;
    }

    let data;
    try {
      data = YAML.parse(fs.readFileSync(fullPath, "utf8"), { uniqueKeys: true });
    } catch (error) {
      errors.push(`${relativePath}: invalid YAML: ${error.message}`);
      continue;
    }

    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(schemas[schemaName]);
    if (!validate(data)) {
      for (const error of validate.errors) {
        errors.push(`${relativePath}: ${error.instancePath || "/"} ${error.message}`);
      }
      continue;
    }
    (documents[category] ||= []).push({ data, relativePath });
  }

  if (yamlFiles.length === 0) errors.push("config: no YAML files found");
  validateRelations(documents, errors);
  return { valid: errors.length === 0, files: yamlFiles.length, documents, errors };
}
