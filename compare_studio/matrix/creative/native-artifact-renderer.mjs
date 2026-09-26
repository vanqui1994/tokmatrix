import fs from "node:fs/promises";
import path from "node:path";

function escapeXml(value) {
  return String(value || "").replace(/[&<>"']/gu, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]);
}

function wrapText(value, width = 30) {
  const words = String(value || "").trim().split(/\s+/u).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    if (line && `${line} ${word}`.length > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 6);
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(temporary, filePath);
}

export async function renderNativeArtifact({ scene, assetType, projectDir } = {}) {
  if (!scene || !projectDir) throw new Error("scene and projectDir are required for a native scene artifact");
  const style = scene.style || {};
  const palette = style.palette || {};
  const prefix = path.join(projectDir, "scenes", `scene_${String(scene.scene_index).padStart(2, "0")}`);
  const descriptor = {
    version: 1,
    scene_index: scene.scene_index,
    engine_type: scene.engine_type,
    asset_type: assetType,
    visual_intent: scene.visual_intent,
    line: scene.line || "",
    camera_angle: scene.camera_angle,
    style_id: style.style_id,
    palette,
  };

  if (assetType === "CANVAS") {
    const filePath = path.join(prefix, "canvas-scene.json");
    await writeJson(filePath, { ...descriptor, renderer_contract: "native-canvas-scene/v1", dimensions: { width: 1080, height: 1920 } });
    return { artifact_type: "canvas", file_path: filePath };
  }
  if (assetType === "TEXT") {
    const filePath = path.join(prefix, "text-scene.txt");
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${scene.line || scene.title || scene.visual_intent}\n`, "utf8");
    return { artifact_type: "text", file_path: filePath };
  }
  if (assetType === "SVG") {
    const filePath = path.join(prefix, "vector-scene.svg");
    const headline = wrapText(scene.line || scene.title || scene.visual_intent);
    const intent = wrapText(scene.visual_intent, 42);
    const text = (items, x, y, size, fill) => items.map((item, index) =>
      `<text x="${x}" y="${y + index * (size + 12)}" fill="${fill}" font-size="${size}" font-weight="700">${escapeXml(item)}</text>`,
    ).join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920"><rect width="1080" height="1920" fill="${escapeXml(palette.primary || "#101318")}"/><circle cx="860" cy="280" r="210" fill="${escapeXml(palette.accent || "#66FCF1")}" opacity="0.2"/><rect x="70" y="110" width="940" height="1700" rx="28" fill="none" stroke="${escapeXml(palette.accent || "#66FCF1")}" stroke-width="4"/><g font-family="sans-serif">${text(headline, 110, 400, 58, palette.text || "#FFFFFF")}${text(intent, 110, 900, 34, palette.accent || "#66FCF1")}</g></svg>`;
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, svg, "utf8");
    return { artifact_type: "svg", file_path: filePath };
  }
  if (assetType === "MAP") {
    if (!scene.map_spec || typeof scene.map_spec !== "object") throw new Error(`MAP scene ${scene.scene_index} requires map_spec data`);
    const filePath = path.join(prefix, "map-scene.json");
    await writeJson(filePath, { ...descriptor, renderer_contract: "native-map-scene/v1", map_spec: scene.map_spec });
    return { artifact_type: "map", file_path: filePath };
  }
  if (assetType === "CHART") {
    if (!scene.chart_spec || typeof scene.chart_spec !== "object") throw new Error(`CHART scene ${scene.scene_index} requires chart_spec data`);
    const filePath = path.join(prefix, "chart-scene.json");
    await writeJson(filePath, { ...descriptor, renderer_contract: "native-chart-scene/v1", chart_spec: scene.chart_spec });
    return { artifact_type: "chart", file_path: filePath };
  }
  throw new Error(`native artifact renderer does not handle ${assetType}`);
}
