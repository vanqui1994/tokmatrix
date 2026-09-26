// In JSON {channel_id: engine} với engine render được (hoặc engine dự phòng) cho các kênh truyền vào.
//   node tools/matrix-pick-engine.mjs channel_a channel_b …
import { resolvePilotChannelConfigs } from "../matrix/config/channel-config-resolver.mjs";
import { fallbackEngine, pickEngine } from "../matrix/planner/template-selector.mjs";

const wanted = new Set(process.argv.slice(2));
const result = {};
for (const resolved of resolvePilotChannelConfigs({})) {
  if (wanted.size && !wanted.has(resolved.channel_id)) continue;
  result[resolved.channel_id] = pickEngine(resolved)?.id || fallbackEngine();
}
console.log(JSON.stringify(result));
