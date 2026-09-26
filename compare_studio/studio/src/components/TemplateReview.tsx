import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, Pause, Play, RotateCcw } from "lucide-react";
import { Badge, Button, Card } from "./ui";
import { cn } from "../lib/utils";

type Beat = { n: number; start: number; dur: number; beat: string; caption: string };
type TemplateType = "compare" | "survival" | "mystery" | "science" | "vox" | "newspaper" | "kinetic" | "chalk" | "tierlist";

const COUNTRIES = [
  { code: "en", label: "US / Global", flag: "🇺🇸" },
  { code: "vi", label: "Việt Nam", flag: "🇻🇳" },
  { code: "de", label: "Đức", flag: "🇩🇪" },
  { code: "fr", label: "Pháp", flag: "🇫🇷" },
  { code: "ja", label: "Nhật Bản", flag: "🇯🇵" },
  { code: "ko", label: "Hàn Quốc", flag: "🇰🇷" },
];

const BEAT_TONE: Record<string, "neutral" | "sage" | "gold" | "terra"> = {
  hook: "sage",
  question: "gold",
  "side A": "neutral",
  "side B": "neutral",
  compare: "gold",
  "case study": "gold",
  analogy: "sage",
  summary: "sage",
  rule: "terra",
  payoff: "terra",
  cta: "sage",
};

/** GSAP timeline the composition registers on its own window. */
type Timeline = {
  pause: () => void;
  play: () => void;
  seek: (t: number) => void;
  time: () => number;
  duration: () => number;
  paused: () => boolean;
};

/** Bỏ [[..]] và *..* để danh sách nhịp đọc như chữ trên màn hình. */
const plain = (s: string) => s.replace(/\[\[(.+?)\]\]/g, "$1").replace(/\*(.+?)\*/g, "$1");

const FRAME_W = 1080;
const FRAME_H = 1920;

export function TemplateReview() {
  const frame = useRef<HTMLIFrameElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [templateType, setTemplateType] = useState<TemplateType>("compare");
  const [lang, setLang] = useState("en");
  const [scale, setScale] = useState(0.28);
  const [tl, setTl] = useState<Timeline | null>(null);
  const [beats, setBeats] = useState<Beat[]>([]);
  const [root, setRoot] = useState(0);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [err, setErr] = useState<string>();
  const primed = useRef(false);

  // Composition có kích thước cứng 1080x1920; thu nhỏ bằng transform theo bề
  // rộng thật của cột, để bên trong iframe không phải biết gì về studio.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / FRAME_W));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    fetch(`/api/template/timing?type=${templateType}&lang=${lang}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (Array.isArray(d?.timing)) {
          setBeats(d.timing);
          setRoot(d.root || 0);
          setErr(undefined);
        } else {
          setErr(d?.error || "Không đọc được timing của template");
        }
      })
      .catch((e) => setErr(String(e)));
  }, [templateType, lang]);

  // The preview is same-origin, so the parent can drive the paused timeline
  // directly instead of injecting playback code into the template output.
  const onLoad = useCallback(() => {
    const w = frame.current?.contentWindow as (Window & { __timelines?: Record<string, Timeline> }) | null;
    const t0 = w?.__timelines?.["main"] || (w?.__timelines ? Object.values(w.__timelines)[0] : null);
    if (!t0) {
      setErr('template không đăng ký window.__timelines["main"]');
      return;
    }
    t0.pause();
    setTl(t0);
    setPlaying(false);
    setErr(undefined);
    primed.current = false;
  }, []);

  // Đặt sẵn khung hình hiển thị đẹp khi vừa mở:
  // - Compare: nhảy tới nhịp 4 (có cả 2 thẻ + nhân vật)
  // - Survival: nhảy tới nhịp 2 (cấp 1 Appendix + Mr Incredible)
  // - Science: nhảy tới nhịp 2 (đối thoại nhân vật A & B)
  // - Mystery: nhảy tới nhịp 1 (đầu phim có HUD)
  useEffect(() => {
    if (!tl || primed.current || !beats || beats.length < 2) return;
    primed.current = true;
    const at =
      templateType === "survival"
        ? (beats[1]?.start ?? 4.2)
        : templateType === "mystery"
        ? (beats[0]?.start ?? 0.5)
        : templateType === "science"
        ? (beats[1]?.start ?? 2.44)
        : (beats[3]?.start ?? 5.5);
    tl.seek(at);
    setT(at);
  }, [tl, beats, templateType]);

  // Keep the scrubber in step while the timeline runs on its own.
  useEffect(() => {
    if (!tl || !playing) return;
    let raf = 0;
    const tick = () => {
      setT(tl.time());
      if (tl.paused()) setPlaying(false);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [tl, playing]);

  const seek = (v: number) => {
    setT(v);
    tl?.seek(v);
  };

  const dur = tl?.duration() || root;
  const active = beats?.find((b) => t >= b.start && t < b.start + b.dur);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] items-start">
      {/* Cột trái: khung preview dọc 9:16 */}
      <Card className="p-3">
        <div
          ref={box}
          className="relative overflow-hidden rounded-xl border border-line bg-surface-2"
          style={{ aspectRatio: `${FRAME_W} / ${FRAME_H}` }}
        >
          <iframe
            key={`${templateType}-${lang}`}
            ref={frame}
            src={`/api/template/preview?type=${templateType}&lang=${lang}`}
            title="Xem thử template"
            onLoad={onLoad}
            scrolling="no"
            className="absolute top-0 left-0 origin-top-left border-0"
            style={{
              width: FRAME_W,
              height: FRAME_H,
              transform: `scale(${scale})`,
            }}
          />
        </div>

        <div className="mt-3 flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={!tl}
            onClick={() => {
              if (!tl) return;
              if (playing) {
                tl.pause();
                setPlaying(false);
              } else {
                if (tl.time() >= tl.duration() - 0.05) tl.seek(0);
                tl.play();
                setPlaying(true);
              }
            }}
          >
            {playing ? <Pause className="size-3.5" aria-hidden="true" /> : <Play className="size-3.5" aria-hidden="true" />}
            {playing ? "Dừng" : "Chạy"}
          </Button>
          <Button size="sm" variant="ghost" disabled={!tl} onClick={() => { tl?.pause(); setPlaying(false); seek(0); }}>
            <RotateCcw className="size-3.5" aria-hidden="true" />
            Về đầu
          </Button>
          <span className="ml-auto font-mono text-[12px] tabular-nums text-ink-dim">
            {t.toFixed(2)}s / {dur.toFixed(2)}s
          </span>
        </div>

        <label htmlFor="tpl-scrub" className="sr-only">
          Tua template
        </label>
        <input
          id="tpl-scrub"
          type="range"
          min={0}
          max={dur || 1}
          step={0.05}
          value={t}
          disabled={!tl}
          onChange={(e) => {
            if (playing) {
              tl?.pause();
              setPlaying(false);
            }
            seek(Number(e.target.value));
          }}
          className="mt-2 w-full accent-[var(--color-terra)]"
        />
        {err && <p className="mt-2 text-[12px] text-terra">{err}</p>}
      </Card>

      <div className="flex min-w-0 flex-col gap-4">
        {/* Bộ chuyển đổi chọn dạng Template */}
        <Card className="p-3">
          <div className="flex flex-col gap-2">
            <span className="text-[12px] font-bold text-ink-dim uppercase tracking-wider">
              Chọn định dạng Template:
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-1.5 rounded-xl border border-line/70 bg-surface-2 p-1">
              <button
                type="button"
                onClick={() => {
                  if (templateType === "compare") return;
                  setTemplateType("compare");
                  setTl(null);
                  primed.current = false;
                }}
                className={cn(
                  "flex cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-bold transition-all text-center",
                  templateType === "compare"
                    ? "border border-line bg-surface text-ink shadow-xs"
                    : "text-ink-soft hover:text-ink"
                )}
              >
                <span>⚖️</span>
                <span className="truncate">So sánh</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (templateType === "survival") return;
                  setTemplateType("survival");
                  setTl(null);
                  primed.current = false;
                }}
                className={cn(
                  "flex cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-bold transition-all text-center",
                  templateType === "survival"
                    ? "border border-line bg-surface text-ink shadow-xs"
                    : "text-ink-soft hover:text-ink"
                )}
              >
                <span>📈</span>
                <span className="truncate">Sinh tồn</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (templateType === "science") return;
                  setTemplateType("science");
                  setTl(null);
                  primed.current = false;
                }}
                className={cn(
                  "flex cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-bold transition-all text-center",
                  templateType === "science"
                    ? "border border-line bg-surface text-ink shadow-xs"
                    : "text-ink-soft hover:text-ink"
                )}
              >
                <span>🌱</span>
                <span className="truncate">Khoa học</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (templateType === "mystery") return;
                  setTemplateType("mystery");
                  setTl(null);
                  primed.current = false;
                }}
                className={cn(
                  "flex cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-bold transition-all text-center",
                  templateType === "mystery"
                    ? "border border-line bg-surface text-ink shadow-xs"
                    : "text-ink-soft hover:text-ink"
                )}
              >
                <span>🕵️‍♂️</span>
                <span className="truncate">Bí ẩn</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (templateType === "vox") return;
                  setTemplateType("vox");
                  setTl(null);
                  primed.current = false;
                }}
                className={cn(
                  "flex cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-bold transition-all text-center",
                  templateType === "vox"
                    ? "border border-line bg-surface text-ink shadow-xs"
                    : "text-ink-soft hover:text-ink"
                )}
              >
                <span>✂️</span>
                <span className="truncate">Cắt dán (Vox)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (templateType === "newspaper") return;
                  setTemplateType("newspaper");
                  setTl(null);
                  primed.current = false;
                }}
                className={cn(
                  "flex cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-bold transition-all text-center",
                  templateType === "newspaper"
                    ? "border border-line bg-surface text-ink shadow-xs"
                    : "text-ink-soft hover:text-ink"
                )}
              >
                <span>📰</span>
                <span className="truncate">Báo cũ</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (templateType === "kinetic") return;
                  setTemplateType("kinetic");
                  setTl(null);
                  primed.current = false;
                }}
                className={cn(
                  "flex cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-bold transition-all text-center",
                  templateType === "kinetic"
                    ? "border border-line bg-surface text-ink shadow-xs"
                    : "text-ink-soft hover:text-ink"
                )}
              >
                <span>⚡</span>
                <span className="truncate">Cyber Chữ</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (templateType === "chalk") return;
                  setTemplateType("chalk");
                  setTl(null);
                  primed.current = false;
                }}
                className={cn(
                  "flex cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-bold transition-all text-center",
                  templateType === "chalk"
                    ? "border border-line bg-surface text-ink shadow-xs"
                    : "text-ink-soft hover:text-ink"
                )}
              >
                <span>🗺️</span>
                <span className="truncate">Bản đồ phấn</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (templateType === "tierlist") return;
                  setTemplateType("tierlist");
                  setTl(null);
                  primed.current = false;
                }}
                className={cn(
                  "flex cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-bold transition-all text-center",
                  templateType === "tierlist"
                    ? "border border-line bg-surface text-ink shadow-xs"
                    : "text-ink-soft hover:text-ink"
                )}
              >
                <span>👑</span>
                <span className="truncate">Tier List</span>
              </button>
            </div>
          </div>
        </Card>

        {/* Thông tin chi tiết của template đang chọn */}
        <Card className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-black tracking-tight">
                {templateType === "compare"
                  ? "Template So Sánh 2 Bên (7 Hồi Kịch Bản)"
                  : templateType === "survival"
                  ? "Template Sinh Tồn / Leo Thang (10 Cấp Độ Meme)"
                  : templateType === "science"
                  ? "Template Khoa Học Nhân Hoá (Cartoon Multi-Role 30-45s)"
                  : templateType === "mystery"
                  ? "Template Bí Ẩn / Sự Kiện Có Thật (Documentary 3-Zone)"
                  : templateType === "vox"
                  ? "Template Vox Motion Collage (Bóc Tách & Bút Dạ Quang Động)"
                  : templateType === "newspaper"
                  ? "Template Báo Cũ Điều Tra & Hồ Sơ Mật (True Crime / Scandal)"
                  : templateType === "kinetic"
                  ? "Template Cyber Tối Giản & Kinetic Typography (Kurzgesagt Dark)"
                  : templateType === "chalk"
                  ? "Template Bản Đồ Phấn Bảng Địa Chính Trị (>60s Chalkboard Map)"
                  : "Template Tier List Ranking (Bảng Xếp Hạng Bậc SSS - S - A - B - C - D)"}
              </h2>
              <p className="mt-0.5 max-w-xl text-[13px] text-ink-soft">
                {templateType === "compare"
                  ? "Bố cục 3 vùng đối đầu 2 thực thể, bảng màu, hoạt hình GSAP và linh vật mèo 6 quốc gia dùng chung cho mọi video so sánh kiến thức."
                  : templateType === "survival"
                  ? "Bố cục đo lường tiến trình cấp độ kịch tính kết hợp đồ họa HUD scanner công nghệ cao và 10 sắc thái meme Mr. Incredible Becoming Uncanny."
                  : templateType === "science"
                  ? "Bố cục hoạt hình nhân hoá vui nhộn, đối thoại đa nhân vật (Char A, Char B, Narrator) giải thích các hiện tượng sinh thái và nông nghiệp vi mô thú vị."
                  : templateType === "mystery"
                  ? "Bố cục tài liệu bí ẩn hồi hộp với huy hiệu All-Seeing Eye, highlight kịch bản đa màu, HUD camera telemetry nhảy giây và khung bằng chứng tư liệu điện ảnh."
                  : templateType === "vox"
                  ? "Bố cục cắt dán giấy kraft thủ công phong cách Vox / Johnny Harris, sticker ảnh viền trắng nổi khối, băng dính washi tape, bút dạ quang quẹt sáng từ khóa động."
                  : templateType === "newspaper"
                  ? "Bố cục báo cũ sepia đen trắng giật tít, con dấu cao su đập mạnh xuống, bút đỏ khoanh vùng bằng chứng và hạt phim nhựa cổ điển."
                  : templateType === "kinetic"
                  ? "Bố cục tối giản siêu thực nền đen OLED #08090C, lưới HUD Cyber Grid, typography khổng lồ giật nhịp nảy chữ và khối hình học 3D phát sáng neon."
                  : templateType === "chalk"
                  ? "Bố cục bản đồ bảng phấn phong cách Johnny Harris & RealLifeLore: kết cấu bảng xanh mờ, nét vẽ phấn tay SVG sống động, camera zoom-pan điện ảnh và các điểm mốc địa chính trị độc đáo (>60s)."
                  : "Bố cục bảng xếp hạng bậc SSS đến D trên nền lưới kỹ thuật Blueprint, khu vực review/gameplay sống động và hiệu ứng chốt bậc bay thẻ vào khay (Physics Slam Placement) chuẩn Telegram Web.mp4."}
              </p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => window.open(`/api/template/preview?type=${templateType}&lang=${lang}`, "_blank")}
            >
              <ExternalLink className="size-3.5" aria-hidden="true" />
              Mở riêng
            </Button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line/60 pt-3">
            <span className="mr-1 text-[12px] font-semibold text-ink-dim">
              {templateType === "compare" ? "Quốc gia & Bảng màu:" : "Ngôn ngữ & Giọng đọc:"}
            </span>
            {COUNTRIES.map((c) => (
              <button
                key={c.code}
                type="button"
                onClick={() => setLang(c.code)}
                className={cn(
                  "flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[12px] font-medium transition-all",
                  lang === c.code
                    ? "border-terra bg-surface-2 font-bold text-ink shadow-xs"
                    : "border-line bg-surface text-ink-dim hover:bg-surface-2"
                )}
              >
                <span>{c.flag}</span>
                <span>{c.label}</span>
              </button>
            ))}
          </div>

          <dl className="mt-3 grid gap-x-6 gap-y-1 border-t border-line/60 pt-3 text-[13px] sm:grid-cols-2">
            {(
              templateType === "compare"
                ? ([
                    ["File nguồn", "tools/template/index.html"],
                    ["Hợp đồng bố cục", "DESIGN.md (7 Acts / 65s-70s)"],
                    ["Khung hình", "1080 × 1920 (9:16 Dọc)"],
                    ["Số dòng", "20 nhịp (Hook, Deep-dive, Clash, Case study, Mnemonic, Payoff, CTA)"],
                  ] as const)
                : templateType === "survival"
                ? ([
                    ["File nguồn", "videos/survival-without-organs/index.html"],
                    ["Hợp đồng bố cục", "Progressive Escalation / 10 Tiers (6 Quốc gia)"],
                    ["Khung hình", "1080 × 1920 (9:16 Dọc)"],
                    ["Số dòng", "12 nhịp (10 Tiers cơ quan nội tạng + Mở đầu + CTA)"],
                  ] as const)
                : templateType === "science"
                ? ([
                    ["File nguồn", "videos/science-peanut-vi/index.html"],
                    ["Hợp đồng bố cục", "Anthropomorphic Science / Multi-Role Comic (30s - 45s)"],
                    ["Khung hình", "1080 × 1920 (9:16 Dọc)"],
                    ["Số dòng", "12 nhịp thoại phân vai (Char A, Char B, Narrator)"],
                  ] as const)
                : templateType === "mystery"
                ? ([
                    ["File nguồn", "tools/template-mystery/index.html"],
                    ["Hợp đồng bố cục", "Documentary Mystery / 8 Phân Cảnh Tư Liệu (60s - 70s)"],
                    ["Khung hình", "1080 × 1920 (9:16 Dọc)"],
                    ["Số dòng", "8 phân cảnh tư liệu + Telemetry HUD + Highlight từ khóa đa màu"],
                  ] as const)
                : templateType === "vox"
                ? ([
                    ["File nguồn", "videos/vox-vietnam-flag-vi/index.html"],
                    ["Hợp đồng bố cục", "Vox Motion Collage / Paper & Highlighter (60s - 75s)"],
                    ["Khung hình", "1080 × 1920 (9:16 Dọc)"],
                    ["Số dòng", "8 phân cảnh cắt dán + Bút highlight vàng động + Sticker viền trắng"],
                  ] as const)
                : templateType === "newspaper"
                ? ([
                    ["File nguồn", "videos/newspaper-watergate-vi/index.html"],
                    ["Hợp đồng bố cục", "Vintage Newspaper Dossier / True Crime (60s - 75s)"],
                    ["Khung hình", "1080 × 1920 (9:16 Dọc)"],
                    ["Số dòng", "8 tiêu đề báo giật tít + Dấu mộc TOP SECRET đỏ + Thước phim nhựa"],
                  ] as const)
                : templateType === "kinetic"
                ? ([
                    ["File nguồn", "videos/kinetic-deepseek-vi/index.html"],
                    ["Hợp đồng bố cục", "Cyber OLED Kinetic Typography (45s - 60s)"],
                    ["Khung hình", "1080 × 1920 (9:16 Dọc)"],
                    ["Số dòng", "8 nhịp chữ khổng lồ + Neon Cyber Accent + Khối hình học 3D"],
                  ] as const)
                : templateType === "chalk"
                ? ([
                    ["File nguồn", "videos/chalk-us-iran-vi/index.html"],
                    ["Hợp đồng bố cục", "Chalkboard Geopolitical Documentary Map (>60s)"],
                    ["Khung hình", "1080 × 1920 (9:16 Dọc)"],
                    ["Số dòng", "8 phân cảnh bản đồ nét vẽ phấn bảng đen + Điểm mốc & Mũi tên quân sự"],
                  ] as const)
                : ([
                    ["File nguồn", "videos/tierlist-idle-games-vi/index.html"],
                    ["Hợp đồng bố cục", "Tier List Ranking SSS to D / Physics Slam (60s - 85s)"],
                    ["Khung hình", "1080 × 1920 (9:16 Dọc)"],
                    ["Số dòng", "5-6 Ứng viên (Review + Phân bậc + Bay thẻ vào khay tier + Outro)"],
                  ] as const)
            ).map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <dt className="shrink-0 text-ink-dim">{k}</dt>
                <dd className="font-mono text-[12px] break-all">{v}</dd>
              </div>
            ))}
          </dl>

          <p className="mt-3 text-[12.5px] text-ink-dim">
            {templateType === "compare"
              ? "Sửa template chỉ đổi các video tạo sau đó. Các video đã có giữ bản sao index.html riêng."
              : templateType === "survival"
              ? "Dạng video sinh tồn / leo thang cấp độ kịch tính hỗ trợ 6 ngôn ngữ chuẩn hóa (vi, en, de, fr, ja, ko) cho các nền tảng Shorts / Reels toàn cầu."
              : templateType === "science"
              ? "Dạng video hoạt hình khoa học nhân hoá đa vai (cây cối, côn trùng, sinh học) sinh động, giải thích hiện tượng tự nhiên qua góc nhìn hài hước."
              : templateType === "mystery"
              ? "Dạng video phóng sự tư liệu trinh thám / kỳ án hồi hộp với phong cách tài liệu CCTV và đồng hồ timecode đếm giây."
              : templateType === "vox"
              ? "Dạng video phóng sự phân tích cắt dán thủ công, bút nhớ dòng highlight rực rỡ và ảnh polaroid dán băng dính."
              : templateType === "newspaper"
              ? "Dạng video báo cũ tài liệu trinh thám với con dấu bảo mật, tiêu đề trang nhất và hiệu ứng phim tư liệu cổ điển."
              : templateType === "kinetic"
              ? "Dạng video chữ động kinetic OLED cực nhanh, ngắn gọn, cuốn hút với typography mạnh mẽ và tông màu neon tương phản cao."
              : templateType === "chalk"
              ? "Dạng video bản đồ địa chính trị bảng phấn phong cách Johnny Harris / RealLifeLore (>60s), phân tích các điểm nóng chiến lược, vùng biên giới và điểm nghẽn toàn cầu."
              : "Dạng video xếp hạng Tier List đẳng cấp SSS đến D, hiệu ứng bay thẻ đập khay sống động, giữ chân người xem cực cao chuẩn Telegram Web.mp4."}
          </p>
        </Card>

        {/* Danh sách nhịp tua kịch bản */}
        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[13px] font-bold">Nhảy tới từng nhịp kịch bản ({beats?.length || 0} nhịp)</h3>
            <span className="font-mono text-[11px] text-ink-dim">Click nhịp để tua ngay</span>
          </div>
          <ul className="flex max-h-[480px] list-none flex-col gap-1 overflow-y-auto p-0 pr-1">
            {(beats || []).map((b) => (
              <li key={b.n}>
                <button
                  type="button"
                  onClick={() => {
                    tl?.pause();
                    setPlaying(false);
                    seek(b.start);
                  }}
                  disabled={!tl}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-left text-[12.5px] transition-colors duration-150",
                    active?.n === b.n ? "border-terra bg-surface-2 shadow-2xs" : "border-transparent hover:bg-surface-2"
                  )}
                >
                  <span className="w-6 shrink-0 font-mono text-[11px] tabular-nums text-ink-dim">{b.n}</span>
                  <Badge tone={BEAT_TONE[b.beat] ?? "neutral"}>{b.beat}</Badge>
                  <span className="min-w-0 flex-1 truncate font-medium">{plain(b.caption)}</span>
                  <span className="shrink-0 font-mono text-[11px] tabular-nums text-ink-dim">
                    {b.start.toFixed(2)}s
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
