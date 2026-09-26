// Mẫu cấm trong HTML của variant (tất định + chạy offline + luật HyperFrames StaticGuard ≥ 0.8.78).
const FORBIDDEN = [
  [/Math\.random\s*\(/u, "Math.random (dùng kit/rng có seed)"],
  [/Date\.now\s*\(|new Date\s*\(/u, "Date.now/new Date (thời gian thực làm render không tái lập)"],
  [/requestAnimationFrame|setInterval\s*\(|setTimeout\s*\(/u, "vòng animation tự chạy (chỉ dùng timeline GSAP paused)"],
  [/fonts\.googleapis|fonts\.gstatic|cdn\.jsdelivr|unpkg\.com|cdnjs\./u, "tải tài nguyên qua mạng lúc render"],
];
const NETWORK_URL = /(?:src|href)\s*=\s*["']https?:\/\//giu;
const IMPORT_URL = /@import\s+url\(\s*["']?https?:/giu;

function clipIds(html) {
  const ids = new Set();
  for (const tag of html.match(/<[a-z][^>]*>/giu) || []) {
    const cls = tag.match(/\sclass\s*=\s*"([^"]*)"/u);
    const id = tag.match(/\sid\s*=\s*"([^"]+)"/u);
    if (cls && id && cls[1].split(/\s+/u).includes("clip")) ids.add(id[1]);
  }
  return ids;
}

/** Danh sách vi phạm (rỗng = sạch). */
export function lintVariantHtml(html) {
  const problems = [];
  for (const [pattern, message] of FORBIDDEN) if (pattern.test(html)) problems.push(message);
  if (NETWORK_URL.test(html) || IMPORT_URL.test(html)) problems.push("src/href/@import trỏ tới http(s)");
  NETWORK_URL.lastIndex = 0;
  IMPORT_URL.lastIndex = 0;
  const clips = clipIds(html);
  for (const statement of html.match(/\b\w+\.(?:to|from|fromTo|set)\([^;]*\);/gu) || []) {
    const target = statement.match(/\.(?:to|from|fromTo|set)\(\s*["']#([\w-]+)["']/u);
    if (target && clips.has(target[1]) && /\b(?:opacity|autoAlpha)\b/u.test(statement)) {
      problems.push(`animate opacity/autoAlpha trên phần tử .clip #${target[1]} (HyperFrames StaticGuard từ chối)`);
    }
  }
  return problems;
}
