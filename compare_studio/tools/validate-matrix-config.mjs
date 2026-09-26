import { validateConfigs } from "./matrix-config-validator.mjs";

const result = validateConfigs();
if (!result.valid) {
  console.error(`Matrix config validation failed (${result.files} YAML files):`);
  for (const error of result.errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Validated ${result.files} YAML files: 18 niches × 10 engines, 10 pilot channels, schemas and cross-references OK.`);
}
