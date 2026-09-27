// Suy dữ liệu hiển thị NGẮN từ lời đọc (từ khoá, con số, tiêu đề cảnh) — tất định, không gọi mạng, không bịa:
// chỉ lấy lại chữ đã có trong kịch bản.
const STOP = new Set(`the and that this with from they their there what when where which while have were will would could
should about into over under after before than then them these those because between during through also only just more
most very your you our who why how does did was are has had its it's not but for can all any some one two
der die das und ist war sind ein eine einer eines dem den des mit von für auf aus bei nach über unter nicht auch noch
sich sie ihr wir wie was wer warum wurde wurden wird hat haben dass doch aber oder heute bis nur schon mehr sehr dann`.split(/\s+/u));

export function isCjk(lang) {
  return ["ja", "ko", "zh"].includes(String(lang || "").slice(0, 2));
}

function cleanWords(line) {
  return String(line || "").split(/[\s,.;:!?"“”„«»()[\]—–]+/u).map((w) => w.replace(/^['’-]+|['’-]+$/gu, "")).filter(Boolean);
}

/** Từ khoá của câu: Latin → từ dài nhất không phải stopword; CJK → 2–6 ký tự đầu (bỏ dấu câu). */
export function salient(line, lang) {
  const text = String(line || "").trim();
  if (isCjk(lang)) {
    const chars = [...text.replace(/[\s、。，．！？!?「」『』（）()・…:：;；"'“”]/gu, "")];
    return chars.slice(0, lang === "ko" ? 5 : 6).join("");
  }
  const words = cleanWords(text).filter((w) => w.length >= 3 && !STOP.has(w.toLowerCase()));
  if (!words.length) return cleanWords(text)[0] || "";
  return words.reduce((best, w) => (w.length > best.length ? w : best), words[0]);
}

/** Con số đầu tiên trong câu (giữ nguyên cách viết: "1959", "300", "4,5"), hoặc null. */
export function firstNumber(line) {
  const match = String(line || "").match(/\d[\d.,]*\d|\d/u);
  return match ? match[0] : null;
}

/** Tiêu đề cảnh ngắn: vài từ đầu (Latin) hoặc vài ký tự đầu (CJK). */
export function shortHead(line, lang, { words = 5, chars = 12 } = {}) {
  const text = String(line || "").trim();
  if (isCjk(lang)) {
    const arr = [...text.replace(/[、。，．！？!?]+$/gu, "")];
    return arr.length > chars ? `${arr.slice(0, chars).join("")}…` : arr.join("");
  }
  const list = cleanWords(text);
  return list.length > words ? `${list.slice(0, words).join(" ")}…` : list.join(" ");
}

export function upper(text, lang) {
  return isCjk(lang) ? String(text) : String(text).toLocaleUpperCase(lang || "en");
}

/** Hai chữ cái viết tắt (ô nguyên tố, huy hiệu): chữ cái đầu + chữ kế tiếp; CJK → ký tự đầu. */
export function symbolOf(word, lang) {
  const chars = [...String(word || "?")];
  if (isCjk(lang)) return chars[0] || "?";
  const letters = chars.filter((c) => /\p{L}/u.test(c));
  if (!letters.length) return "?";
  return `${letters[0].toLocaleUpperCase(lang || "en")}${(letters[1] || "").toLocaleLowerCase(lang || "en")}`;
}
