// Dữ liệu riêng của engine mở rộng (bậc tier, chỉ số, bản đồ…), sinh ngay sau kịch bản.
// Kịch bản giữ nguyên; lỗi LLM thì dùng extras.fallback của engine (xác định) để job không chết.
import { extendedEngine } from "../render/engines/index.mjs";
import { defaultLlmProvider } from "./llm-provider.mjs";
import { languageName } from "./language.mjs";
import { generateValidated } from "./structured-output.mjs";

export function engineNeedsExtras(engineType) {
  const engine = extendedEngine(engineType);
  return Boolean(engine?.extras && !engine.pending);
}

/** Trả script kèm `engine_extras` (không đổi script nếu engine không cần hoặc đã có). */
export async function attachEngineExtras({ engineType, script, topic, channel, provider = defaultLlmProvider, language, log = console.warn } = {}) {
  if (!engineNeedsExtras(engineType) || !script?.scenes?.length) return script;
  if (script.engine_extras?.engine === engineType && script.engine_extras.data) return script;
  const engine = extendedEngine(engineType);
  const scenes = script.scenes;
  const outputLanguage = language || channel?.publishing?.language || "vi";
  const context = { script, topic: typeof topic === "string" ? topic : topic?.title || script.topic, language: outputLanguage, channel };
  let data;
  let source = "llm";
  try {
    data = await generateValidated({
      provider,
      systemPrompt: `You add structured on-screen data for a ${engineType} short video template. Never rewrite the narration. Any on-screen text must be in ${languageName(outputLanguage)}. Return JSON only.`,
      userPrompt: engine.extras.prompt(context),
      temperature: 0.4,
      responseSchema: engine.extras.schema(scenes.length),
      validate: (candidate) => engine.extras.validate(candidate, scenes),
      label: `${engineType} extras`,
    });
  } catch (error) {
    log(`[MATRIX] ${engineType} extras lỗi (${error.message}) → dùng dữ liệu suy ra từ kịch bản`);
    data = engine.extras.fallback(scenes, { title: script.title, language: outputLanguage });
    source = "fallback";
    const problems = engine.extras.validate(data, scenes);
    if (problems.length) throw new Error(`${engineType} fallback extras invalid: ${problems.join("; ")}`);
  }
  return { ...script, engine_extras: { engine: engineType, source, data } };
}
