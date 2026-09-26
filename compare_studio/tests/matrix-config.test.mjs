import assert from "node:assert/strict";
import test from "node:test";
import { validateConfigObject, validateConfigs } from "../tools/matrix-config-validator.mjs";
import { resolvePilotChannelConfigs } from "../matrix/config/channel-config-resolver.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const configDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../config");

function yamlCount(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).reduce((total, entry) => total
    + (entry.isDirectory() ? yamlCount(path.join(dir, entry.name)) : /\.ya?ml$/.test(entry.name) ? 1 : 0), 0);
}

function loadSchemas() {
  const schemaDir = path.join(configDir, "schemas");
  return Object.fromEntries(fs.readdirSync(schemaDir).map((name) => [
    name,
    JSON.parse(fs.readFileSync(path.join(schemaDir, name), "utf8")),
  ]));
}

test("all matrix YAML files validate against schemas and cross-references", () => {
  const result = validateConfigs({ configDir });
  assert.deepEqual(result.errors, []);
  // Catalog kênh được mở rộng dần (180 → 237…): đếm theo thư mục cấu hình thay vì ghi cứng.
  const channelFiles = fs.readdirSync(path.join(configDir, "channels")).filter((name) => /\.ya?ml$/.test(name));
  assert.ok(channelFiles.length >= 180);
  assert.equal(result.documents.channels.length, channelFiles.length);
  assert.equal(result.files, yamlCount(configDir));
  assert.equal(result.documents.compatibility_matrix[0].data.niches.length, 18);
  assert.equal(result.documents.compatibility_matrix[0].data.engines.length, 11);
});

test("Channel DNA schema rejects invalid persona ranges and missing required fields", () => {
  const schemas = loadSchemas();
  const errors = validateConfigObject("channels", { channel_id: "bad_id", config_version: 0, persona: { energy_level: 2 } }, schemas);
  assert.ok(errors.length > 0);
});

test("resolver returns stable, versioned snapshots for the whole channel catalog", () => {
  const first = resolvePilotChannelConfigs({ configDir });
  const second = resolvePilotChannelConfigs({ configDir });
  const declared = new Map(validateConfigs({ configDir }).documents.channels.map((doc) => [doc.data.channel_id, doc.data.config_version]));
  assert.equal(first.length, declared.size);
  assert.ok(first.length >= 180);
  assert.deepEqual(first, second);
  // Mỗi snapshot mang đúng config_version khai báo trong YAML của kênh (kênh sửa sau sẽ lên 3, 4…).
  assert.ok(first.every((item) => item.config_version === declared.get(item.channel_id) && item.config_version >= 2 && /^[a-f0-9]{64}$/.test(item.config_hash)));
  assert.ok(first.every((item) => item.resolved_config.soundscape.defaultBgm));
  assert.ok(first.every((item) => item.resolved_config.config_hash === item.config_hash));
});
