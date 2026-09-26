import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export const fmtDur = (s: number | null | undefined) =>
  s == null ? "—" : `${s.toFixed(s < 10 ? 2 : 1)}s`;

export const fmtSize = (b?: number) => (b == null ? "—" : `${(b / 1024 / 1024).toFixed(1)} MB`);

export const fmtWhen = (input?: number | string | Date) => {
  if (!input) return "—";
  const d = new Date(input);
  if (isNaN(d.getTime())) return "—";

  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();

  const timeStr = d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });

  if (isToday) return `Hôm nay, ${timeStr}`;
  if (isYesterday) return `Hôm qua, ${timeStr}`;

  const sameYear = d.getFullYear() === now.getFullYear();
  const dateStr = d.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    ...(sameYear ? {} : { year: "numeric" }),
  });
  return `${dateStr} · ${timeStr}`;
};

export const fmtDateBadge = (input?: number | string | Date) => {
  if (!input) return "—";
  const d = new Date(input);
  if (isNaN(d.getTime())) return "—";
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Hôm nay";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Hôm qua";
  return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
};

export const LANGS: Record<string, { label: string; flag: string; country: string; emoji: string }> = {
  vi: { label: "Tiếng Việt", flag: "VI", country: "Việt Nam", emoji: "🇻🇳" },
  de: { label: "Deutsch", flag: "DE", country: "Đức", emoji: "🇩🇪" },
  ko: { label: "한국어", flag: "KO", country: "Hàn Quốc", emoji: "🇰🇷" },
  ja: { label: "日本語", flag: "JA", country: "Nhật Bản", emoji: "🇯🇵" },
  en: { label: "English", flag: "EN", country: "Mỹ / Global", emoji: "🇺🇸" },
  fr: { label: "Français", flag: "FR", country: "Pháp", emoji: "🇫🇷" },
};

export type TemplateType =
  | "compare"
  | "survival"
  | "tierlist"
  | "vox"
  | "newspaper"
  | "kinetic"
  | "chalk"
  | "science"
  | "mystery"
  | "wildlife";

export type TemplateCategory = "arena" | "journal" | "tech";

export interface TemplateInfo {
  id: TemplateType;
  category: TemplateCategory;
  name: string;
  shortName: string;
  icon: string;
  badgeTone: "neutral" | "sage" | "gold" | "terra";
  accentColor: string;
  duration: string;
  desc: string;
  isNew?: boolean;
}

export const TEMPLATE_CATEGORIES: Record<TemplateCategory, { label: string; icon: string; desc: string }> = {
  arena: { label: "Đấu Trường & Xếp Hạng", icon: "⚔️", desc: "So sánh 2 vật, sinh tồn cấp độ & xếp hạng bậc SSS-D" },
  journal: { label: "Phóng Sự & Báo Chí", icon: "📰", desc: "Collage xé giấy, báo cũ điều tra & bản đồ phấn bảng" },
  tech: { label: "Đồ Họa & Khoa Học", icon: "⚡", desc: "Cyber kinetic neon, khoa học vũ trụ & kỳ án giải mã" },
};

export const TEMPLATES_LIST: TemplateInfo[] = [
  // Arena
  {
    id: "compare",
    category: "arena",
    name: "So Sánh 2 Vật",
    shortName: "So Sánh",
    icon: "⚔️",
    badgeTone: "terra",
    accentColor: "#b4502f",
    duration: "30-40s",
    desc: "Đối đầu 2 vật thể/khái niệm, nhịp fast-cut 2s, 3 zone",
  },
  {
    id: "survival",
    category: "arena",
    name: "Thử Thách Sinh Tồn",
    shortName: "Sinh Tồn",
    icon: "💀",
    badgeTone: "terra",
    accentColor: "#e65100",
    duration: "65s",
    desc: "10 cấp độ tăng dần, thanh trạng thái sinh học, Mr. Incredible",
  },
  {
    id: "tierlist",
    category: "arena",
    name: "Tier List Xếp Hạng",
    shortName: "Tier List",
    icon: "🏆",
    badgeTone: "gold",
    accentColor: "#f59e0b",
    duration: "60-90s",
    desc: "Xếp hạng bậc SSS đến D, sân khấu đánh giá & slam khay rung chấn",
    isNew: true,
  },
  // Journal
  {
    id: "vox",
    category: "journal",
    name: "Vox Collage Xé Giấy",
    shortName: "Vox Collage",
    icon: "✂️",
    badgeTone: "sage",
    accentColor: "#3e8c77",
    duration: "50-65s",
    desc: "Cắt dán thủ công, xé giấy ngẫu nhiên răng cưa, dán băng keo",
    isNew: true,
  },
  {
    id: "newspaper",
    category: "journal",
    name: "Báo Cũ Điều Tra",
    shortName: "Báo Cũ",
    icon: "📜",
    badgeTone: "gold",
    accentColor: "#c2410c",
    duration: "65s",
    desc: "Báo cổ điển thế kỷ 20, ảnh polaroid, ghim đỏ & tem niêm phong",
  },
  {
    id: "chalk",
    category: "journal",
    name: "Bản Đồ Bảng Phấn",
    shortName: "Bảng Phấn",
    icon: "🗺️",
    badgeTone: "sage",
    accentColor: "#059669",
    duration: ">60s",
    desc: "Bản đồ địa chính trị vẽ phấn, mũi tên di chuyển quân sự",
    isNew: true,
  },
  {
    id: "wildlife",
    category: "journal",
    name: "Thế Giới Động Vật",
    shortName: "Động Vật AI",
    icon: "🐾",
    badgeTone: "gold",
    accentColor: "#10b981",
    duration: "50-60s",
    desc: "Phim tài liệu động vật AI, HUD chỉ số sinh tồn & radar săn mồi",
    isNew: true,
  },
  // Tech
  {
    id: "kinetic",
    category: "tech",
    name: "Kinetic Editorial",
    shortName: "Kinetic",
    icon: "⚡",
    badgeTone: "sage",
    accentColor: "#06b6d4",
    duration: "65s",
    desc: "Chữ lớn dẫn chuyện, nhịp dựng theo ý nghĩa, tương phản đen – vàng chanh",
  },
  {
    id: "science",
    category: "tech",
    name: "Khoa Học Vũ Trụ",
    shortName: "Khoa Học",
    icon: "🪐",
    badgeTone: "neutral",
    accentColor: "#8b5cf6",
    duration: "65s",
    desc: "Thiên văn học, vũ trụ bao la, biểu đồ vi mô & vĩ mô",
  },
  {
    id: "mystery",
    category: "tech",
    name: "Bí Ẩn & Kỳ Án",
    shortName: "Kỳ Án",
    icon: "🔍",
    badgeTone: "neutral",
    accentColor: "#6366f1",
    duration: "65s",
    desc: "Hồ sơ mật chưa có lời giải, giải mã các giả thuyết ly kỳ",
  },
];

export function getVideoTemplateInfo(slug: string, spec?: any): TemplateInfo {
  const s = (slug || "").toLowerCase();
  const specType = spec?.type?.toLowerCase();

  if (specType === "wildlife" || s.startsWith("wildlife-") || s.startsWith("dong-vat-") || spec?.wildlifeConfig) {
    return TEMPLATES_LIST.find((t) => t.id === "wildlife")!;
  }
  if (specType === "tierlist" || s.startsWith("tierlist-") || spec?.tierListConfig) {
    return TEMPLATES_LIST.find((t) => t.id === "tierlist")!;
  }
  if (specType === "vox" || s.startsWith("vox-") || spec?.voxConfig) {
    return TEMPLATES_LIST.find((t) => t.id === "vox")!;
  }
  if (specType === "newspaper" || s.startsWith("newspaper-") || spec?.newspaperConfig) {
    return TEMPLATES_LIST.find((t) => t.id === "newspaper")!;
  }
  if (specType === "kinetic" || s.startsWith("kinetic-") || spec?.kineticConfig) {
    return TEMPLATES_LIST.find((t) => t.id === "kinetic")!;
  }
  if (specType === "chalk" || s.startsWith("chalk-") || spec?.chalkConfig) {
    return TEMPLATES_LIST.find((t) => t.id === "chalk")!;
  }
  if (specType === "survival" || s.startsWith("survival-") || spec?.survivalConfig) {
    return TEMPLATES_LIST.find((t) => t.id === "survival")!;
  }
  if (specType === "science" || s.startsWith("science-")) {
    return TEMPLATES_LIST.find((t) => t.id === "science")!;
  }
  if (specType === "mystery" || s.startsWith("mystery-") || spec?.mysteryConfig) {
    return TEMPLATES_LIST.find((t) => t.id === "mystery")!;
  }

  return TEMPLATES_LIST.find((t) => t.id === "compare")!;
}
