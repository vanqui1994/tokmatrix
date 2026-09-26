// Schema cho structured output của Gemini (tập con OpenAPI, kiểu viết HOA) + bước hỏi lại theo lỗi.

const text = { type: "STRING" };
const textList = { type: "ARRAY", items: text };

export function anglesSchema(count) {
  return {
    type: "OBJECT",
    properties: {
      angles: {
        type: "ARRAY",
        minItems: 1,
        maxItems: count,
        items: {
          type: "OBJECT",
          properties: { title: text, angle: text, hook: text, evidence_set: textList, narrative_structure: textList, hook_type: text },
          required: ["title", "angle", "hook", "evidence_set", "narrative_structure", "hook_type"],
        },
      },
    },
    required: ["angles"],
  };
}

export function scriptSchema(sceneCount) {
  return {
    type: "OBJECT",
    properties: {
      title: text,
      scenes: {
        type: "ARRAY",
        minItems: sceneCount,
        maxItems: sceneCount,
        items: {
          type: "OBJECT",
          properties: { beat_id: text, line: text, visual_intent: text },
          required: ["beat_id", "line", "visual_intent"],
        },
      },
    },
    required: ["title", "scenes"],
  };
}

/**
 * Gọi provider, kiểm tra bằng `validate(response) → string[]` (rỗng = hợp lệ). Sai thì hỏi lại
 * model đúng một lần với JSON cũ + danh sách lỗi (temperature 0). Không tự bịa phần còn thiếu.
 */
export async function generateValidated({ provider, systemPrompt, userPrompt, temperature, responseSchema, validate, maxRepairs = 1, label = "response" }) {
  let response = await provider({ systemPrompt, userPrompt, temperature, responseSchema });
  let errors = validate(response);
  for (let attempt = 0; errors.length && attempt < maxRepairs; attempt += 1) {
    const repairPrompt = `${userPrompt}\n\nYour previous JSON answer was invalid:\n${JSON.stringify(response).slice(0, 12000)}\n\nFix exactly these problems and return the complete corrected JSON only, keeping every valid part unchanged:\n${errors.map((error) => `- ${error}`).join("\n")}`;
    response = await provider({ systemPrompt, userPrompt: repairPrompt, temperature: 0, responseSchema });
    errors = validate(response);
  }
  if (errors.length) throw new Error(`${label} is invalid after repair: ${errors.join("; ")}`);
  return response;
}
