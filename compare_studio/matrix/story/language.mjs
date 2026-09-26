// Tên ngôn ngữ đưa vào prompt: chỉ ghi mã "de" thì Gemini hay viết lại bằng
// ngôn ngữ của phần mô tả beat (đa số là tiếng Việt).
const LANGUAGE_NAMES = {
  vi: "Vietnamese",
  en: "English",
  de: "German",
  fr: "French",
  ja: "Japanese",
  ko: "Korean",
};

export function languageName(code) {
  const name = LANGUAGE_NAMES[code];
  if (!name) throw new Error(`unsupported output language: ${code}`);
  return name;
}

export function languageRule(code) {
  const name = languageName(code);
  return `Every title, hook and spoken line MUST be written in ${name} (${code}) only, even when the instructions or beat descriptions are in another language.`;
}
