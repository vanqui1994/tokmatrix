import {
  ChevronDown,
  ChevronUp,
  CircleCheck,
  Download,
  ExternalLink,
  ListMusic,
  Play,
  SlidersHorizontal,
  Timer,
} from "lucide-react";
import type { Task, VideoDetail } from "../../api";
import { Button, Card } from "../ui";
import {
  fmtDur,
  fmtSize,
  fmtWhen,
  getVideoTemplateInfo,
  LANGS,
} from "../../lib/utils";

interface VideoDetailHeaderProps {
  detail: VideoDetail;
  running: boolean;
  target: string;
  setTarget: (val: string) => void;
  alsoRender: boolean;
  setAlsoRender: (val: boolean) => void;
  showFitTool: boolean;
  setShowFitTool: React.Dispatch<React.SetStateAction<boolean>>;
  onRun: (task: Task, opts?: { target?: number; render?: boolean }) => void;
}

export function VideoDetailHeader({
  detail,
  running,
  target,
  setTarget,
  alsoRender,
  setAlsoRender,
  showFitTool,
  setShowFitTool,
  onRun,
}: VideoDetailHeaderProps) {
  const tInfo = getVideoTemplateInfo(detail.slug, detail.spec);
  const devUrl =
    typeof window !== "undefined" && window.location.port === "5173"
      ? `http://localhost:4321/videos/${detail.slug}/index.html`
      : `/videos/${detail.slug}/index.html`;

  const PRESET_DURATIONS = [30, 36, 40, 65, 79];

  return (
    <Card className="p-4 sm:p-5 shadow-xs">
      {/* Format Specification Banner */}
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2 border-b border-line/70 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-bold border border-line text-ink">
            <span className="text-sm">{tInfo.icon}</span>
            <span>{tInfo.name}</span>
          </span>
          <span className="font-mono text-xs text-ink-dim">
            Khung chuẩn: <strong className="text-ink">{tInfo.duration}</strong>
          </span>
          <span className="text-line hidden sm:inline">·</span>
          <span className="text-xs text-ink-soft hidden md:inline">{tInfo.desc}</span>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <a
            href={devUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-ink-dim hover:text-terra font-bold transition-colors"
            title="Mở live canvas composition trong tab mới"
          >
            <ExternalLink className="size-3.5" />
            <span>Canvas Tab Riêng</span>
          </a>
        </div>
      </div>

      {/* Main Video Title & Action Toolbar */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl">
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-ink leading-tight">
            {detail.title}
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-ink-soft leading-relaxed">
            {detail.message || "Chưa có mô tả kịch bản tóm tắt"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => onRun("check")}
            disabled={running}
            title="Kiểm tra tiêu chuẩn độ tương phản WCAG AA & quy tắc linter"
          >
            <CircleCheck className="size-4 text-sage" aria-hidden="true" />
            <span>Check WCAG</span>
          </Button>

          <Button
            variant="secondary"
            onClick={() => onRun("vo")}
            disabled={running}
            title="Tạo lại giọng đọc TTS Edge Voice"
          >
            <ListMusic className="size-4" aria-hidden="true" />
            <span>Sinh lại VO</span>
          </Button>

          <Button
            variant="primary"
            onClick={() => onRun("render")}
            disabled={running}
            title="Xuất video MP4 1080x1920 chất lượng cao"
          >
            <Play className="size-4" aria-hidden="true" />
            <span className="font-black">Render MP4</span>
          </Button>

          {detail.hasRender && (
            <a
              href={`/api/videos/${detail.slug}/download`}
              download={`${detail.slug}.mp4`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-terra/50 bg-terra-bright/10 px-3.5 py-2 text-xs font-bold text-terra hover:bg-terra hover:text-surface-2 transition-all cursor-pointer shadow-2xs hover:shadow-xs active:scale-95"
              title="Tải video MP4 hoàn chỉnh về máy tính"
            >
              <Download className="size-4" />
              <span>Tải MP4</span>
            </a>
          )}
        </div>
      </div>

      {/* Collapsible Fast-Cut Duration Tuner (Accordion) */}
      <div className="mt-4 border-t border-line/70 pt-3">
        <button
          type="button"
          onClick={() => setShowFitTool((v) => !v)}
          className="flex items-center justify-between w-full text-left py-1 font-bold text-xs text-ink-soft hover:text-ink cursor-pointer group"
        >
          <span className="flex items-center gap-2">
            <SlidersHorizontal className="size-3.5 text-terra" />
            <span>Công cụ khớp thời lượng & nhịp độ fast-cut (Target Duration)</span>
            {detail.duration ? (
              <span className="font-mono text-[11px] text-ink-dim font-normal">
                (Hiện tại: {fmtDur(detail.duration)})
              </span>
            ) : null}
          </span>
          <span className="flex items-center gap-1 text-[11px] text-ink-dim group-hover:text-terra font-semibold">
            {showFitTool ? "Thu gọn" : "Mở công cụ"}
            {showFitTool ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          </span>
        </button>

        {showFitTool && (
          <div className="mt-3 rounded-2xl border border-line bg-surface-2/70 p-3.5 text-xs animate-in fade-in duration-150">
            <div className="flex flex-wrap items-end gap-3.5">
              <div>
                <label htmlFor="target-dur" className="font-mono text-[10px] tracking-wide text-ink-dim uppercase font-bold">
                  Thời lượng mục tiêu (giây)
                </label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    id="target-dur"
                    type="number"
                    min={8}
                    max={180}
                    step={0.5}
                    inputMode="decimal"
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    placeholder={detail.duration ? String(detail.duration) : "36"}
                    className="h-9 w-28 rounded-xl border border-line bg-surface px-3 text-xs tabular-nums font-black text-ink focus-visible:border-terra focus:outline-none"
                  />
                  <span className="text-xs font-semibold text-ink-dim">giây</span>
                </div>
              </div>

              {/* Quick Presets */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-mono text-ink-dim font-bold uppercase">Preset gợi ý:</span>
                <div className="flex items-center gap-1">
                  {PRESET_DURATIONS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setTarget(String(preset))}
                      className="cursor-pointer rounded-lg border border-line bg-surface px-2 py-1 text-[10.5px] font-mono font-bold text-ink-soft hover:border-terra hover:text-terra transition-colors"
                    >
                      {preset}s
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-soft self-end mb-1">
                <input
                  type="checkbox"
                  checked={alsoRender}
                  onChange={(e) => setAlsoRender(e.target.checked)}
                  className="size-4 accent-[var(--color-terra)] cursor-pointer"
                />
                <span className="font-medium">Render MP4 luôn sau khi khớp</span>
              </label>

              <div className="self-end mb-0.5">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={running || !target || Number(target) < 8 || Number(target) > 180}
                  onClick={() => onRun("fit", { target: Number(target), render: alsoRender })}
                >
                  <Timer className="size-3.5" aria-hidden="true" />
                  <span>Khớp thời lượng</span>
                </Button>
              </div>
            </div>

            <p id="target-help" className="mt-2.5 max-w-xl text-[11px] text-ink-dim leading-relaxed">
              Hệ thống sẽ điều chỉnh tốc độ đọc TTS Edge Voice và tính toán lại timing từng frame để video đạt chính xác thời lượng bạn yêu cầu mà không phá vỡ nhịp fast-cut của DESIGN.md.
              {target && (Number(target) < 30 || Number(target) > 40) ? (
                <strong className="text-terra"> Lưu ý: Con số này nằm ngoài khung 30-40s chuẩn của series so sánh.</strong>
              ) : null}
            </p>
          </div>
        )}
      </div>

      {/* Metadata Overview Grid */}
      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line/70 pt-3 sm:grid-cols-4">
        {[
          ["Ngôn ngữ", LANGS[detail.lang]?.label ?? detail.lang],
          ["Thời lượng", fmtDur(detail.duration)],
          ["Số dòng kịch bản", `${detail.script.length} câu`],
          [
            "Bản render MP4",
            detail.render ? `${fmtSize(detail.render.size)} · ${fmtWhen(detail.render.mtime)}` : "Chưa xuất bản",
          ],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl bg-surface-2/50 p-2 border border-line/40">
            <dt className="font-mono text-[10.5px] tracking-wide text-ink-dim uppercase font-bold">{k}</dt>
            <dd className="mt-0.5 text-xs sm:text-sm font-extrabold text-ink">{v}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
