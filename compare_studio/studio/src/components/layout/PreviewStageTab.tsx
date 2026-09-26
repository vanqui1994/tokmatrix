import { useEffect, useRef, useState } from "react";
import {
  Clock,
  Download,
  ExternalLink,
  Film,
  HardDrive,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Volume2,
} from "lucide-react";
import type { VideoDetail } from "../../api";
import { Button, Card } from "../ui";
import { cn, fmtDur, fmtSize, fmtWhen, getVideoTemplateInfo } from "../../lib/utils";

interface PreviewStageTabProps {
  detail: VideoDetail;
  running: boolean;
  onRender: () => void;
}

export function PreviewStageTab({
  detail,
  running,
  onRender,
}: PreviewStageTabProps) {
  const [previewMode, setPreviewMode] = useState<"render" | "dev">(
    detail.hasRender ? "render" : "dev",
  );
  const [canvasKey, setCanvasKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [canvasTl, setCanvasTl] = useState<any>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [canvasDuration, setCanvasDuration] = useState(detail.duration || 60);

  const tInfo = getVideoTemplateInfo(detail.slug, detail.spec);
  const devUrl =
    typeof window !== "undefined" && window.location.port === "5173"
      ? `http://localhost:4321/videos/${detail.slug}/index.html`
      : `/videos/${detail.slug}/index.html`;

  const handleIframeLoad = () => {
    try {
      const w = iframeRef.current?.contentWindow as any;
      const timelines = w?.__timelines;
      const t0 =
        timelines?.["main"] ||
        timelines?.[detail.slug] ||
        (timelines ? Object.values(timelines)[0] : null);

      if (t0) {
        setCanvasTl(t0);
        const d = t0.duration() || detail.duration || 60;
        setCanvasDuration(d);
        t0.play();
        setPlaying(true);
      }
    } catch (e: any) {
      console.warn("Iframe canvas timeline hook error:", e);
    }
  };

  useEffect(() => {
    if (!canvasTl || !playing) return;
    let raf = 0;
    const tick = () => {
      setCurrentTime(canvasTl.time());
      if (canvasTl.paused()) setPlaying(false);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [canvasTl, playing]);

  const handleTogglePlay = () => {
    if (!canvasTl) return;
    if (playing) {
      canvasTl.pause();
      setPlaying(false);
    } else {
      if (canvasTl.time() >= canvasTl.duration() - 0.1) {
        canvasTl.seek(0);
      }
      canvasTl.play();
      setPlaying(true);
    }
  };

  const handleSeek = (time: number) => {
    if (!canvasTl) return;
    canvasTl.seek(time);
    setCurrentTime(time);
  };

  const handleRewind = () => {
    if (!canvasTl) return;
    canvasTl.seek(0);
    setCurrentTime(0);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Dual Mode Switcher Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface-2/90 p-2 shadow-xs backdrop-blur-sm">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setPreviewMode("render")}
            className={cn(
              "cursor-pointer rounded-xl px-3.5 py-2 text-xs font-bold transition-all flex items-center gap-2",
              previewMode === "render"
                ? "bg-terra text-surface-2 shadow-xs"
                : "text-ink-soft hover:text-ink hover:bg-surface",
            )}
          >
            <Play className="size-3.5" />
            <span>Bản Render MP4</span>
            {detail.hasRender && (
              <span className="size-2 rounded-full bg-emerald-400 ring-2 ring-terra/50" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setPreviewMode("dev")}
            className={cn(
              "cursor-pointer rounded-xl px-3.5 py-2 text-xs font-bold transition-all flex items-center gap-2",
              previewMode === "dev"
                ? "bg-terra text-surface-2 shadow-xs"
                : "text-ink-soft hover:text-ink hover:bg-surface",
            )}
          >
            <Sparkles className="size-3.5 text-gold" />
            <span>Live Canvas (HyperFrames 60fps)</span>
            <span className="rounded-md bg-emerald-500/20 px-1.5 py-0.5 text-[9.5px] font-extrabold text-emerald-700 dark:text-emerald-300">
              Live
            </span>
          </button>
        </div>

        <div className="flex items-center gap-2 pr-1">
          {previewMode === "dev" && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setCanvasKey((k) => k + 1);
                setCurrentTime(0);
                setPlaying(false);
              }}
              className="h-8 text-xs px-2.5"
              title="Tải lại iframe canvas preview"
            >
              <RefreshCw className="size-3 text-terra" />
              <span>Làm mới Canvas</span>
            </Button>
          )}

          <a
            href={devUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-1.5 text-xs font-bold text-ink hover:text-terra hover:border-terra transition-colors shadow-2xs"
            title="Mở video HTML toàn màn hình trong tab trình duyệt mới"
          >
            <ExternalLink className="size-3.5" />
            <span>Mở Tab Riêng</span>
          </a>
        </div>
      </div>

      {/* Main Production Workstation Layout: 2 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-[380px_minmax(0,1fr)] gap-5 items-start">
        {/* Left Column: Phone Frame Preview Stage */}
        <div className="flex flex-col items-center justify-center p-3 rounded-3xl border border-line/80 bg-surface-2/40 shadow-xs">
          <div className="phone-frame w-[330px] h-[588px] relative flex items-center justify-center bg-black">
            {/* Phone Island Notch */}
            <div className="phone-island" />

            {previewMode === "render" ? (
              detail.hasRender ? (
                <video
                  key={detail.render?.mtime}
                  controls
                  playsInline
                  preload="metadata"
                  className="w-full h-full object-cover bg-black"
                  src={`/api/videos/${detail.slug}/render`}
                />
              ) : (
                <div className="flex flex-col items-center justify-center p-6 text-center text-white/80 h-full w-full bg-black/95">
                  <div className="grid size-14 place-items-center rounded-2xl bg-white/10 text-white/60 mb-4">
                    <Play className="size-7" />
                  </div>
                  <h4 className="font-black text-sm text-white">Chưa Có Bản Render MP4</h4>
                  <p className="mt-1.5 text-xs text-white/60 max-w-[220px] leading-relaxed">
                    Bạn có thể bấm xuất MP4 ngay, hoặc chuyển sang Live Canvas để xem trước hoạt ảnh 60fps!
                  </p>
                  <div className="mt-5 flex flex-col gap-2 w-full max-w-[200px]">
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={onRender}
                      disabled={running}
                      className="w-full"
                    >
                      <Play className="size-3.5" />
                      Render MP4 Ngay
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setPreviewMode("dev")}
                      className="w-full text-white border-white/20 bg-white/10 hover:bg-white/20"
                    >
                      <Sparkles className="size-3.5 text-gold" />
                      Xem Live Canvas
                    </Button>
                  </div>
                </div>
              )
            ) : (
              /* Live Canvas Dev Mode — Scaled 1080x1920 Stage */
              <div
                className="relative overflow-hidden w-[314px] h-[558px] bg-black flex items-center justify-center"
                style={{ width: 314, height: 558 }}
              >
                <iframe
                  key={`${detail.slug}-${canvasKey}`}
                  ref={iframeRef}
                  src={devUrl}
                  onLoad={handleIframeLoad}
                  scrolling="no"
                  className="absolute top-0 left-0 border-0 bg-black origin-top-left"
                  style={{
                    width: 1080,
                    height: 1920,
                    transform: `scale(${314 / 1080})`,
                  }}
                  title={`Live Canvas: ${detail.title}`}
                />
              </div>
            )}
          </div>

          {/* Player controls underneath phone frame */}
          {previewMode === "dev" ? (
            <div className="mt-3 flex flex-col gap-2 w-full max-w-[330px] rounded-2xl border border-line bg-surface p-2.5 shadow-2xs">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={handleTogglePlay}
                    className="h-7 px-2.5 text-xs font-bold"
                    title={playing ? "Tạm dừng" : "Phát timeline"}
                  >
                    {playing ? <Pause className="size-3" /> : <Play className="size-3" />}
                    <span>{playing ? "Dừng" : "Phát"}</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleRewind}
                    className="h-7 px-2 text-xs"
                    title="Quay về frame 0s"
                  >
                    <RotateCcw className="size-3" />
                  </Button>
                </div>

                <div className="font-mono text-[11px] font-bold text-ink-dim tabular-nums">
                  <span className="text-terra">{currentTime.toFixed(1)}s</span>
                  <span className="text-line mx-1">/</span>
                  <span>{canvasDuration.toFixed(1)}s</span>
                </div>
              </div>

              {/* Scrubber slider */}
              <input
                type="range"
                min={0}
                max={canvasDuration || 60}
                step={0.1}
                value={currentTime}
                onChange={(e) => handleSeek(Number(e.target.value))}
                className="w-full accent-terra h-1.5 cursor-pointer bg-surface-2 rounded-lg"
              />
            </div>
          ) : (
            <div className="mt-3 flex items-center justify-between w-full max-w-[330px] px-1 text-[11px] font-mono text-ink-dim">
              <span className="flex items-center gap-1">
                <Film className="size-3 text-terra" />
                <span>Khung dọc 9:16 (1080x1920)</span>
              </span>
              <span className="font-bold text-ink">Bản Xuất MP4</span>
            </div>
          )}
        </div>

        {/* Right Column: Production Inspector Deck */}
        <div className="flex flex-col gap-4">
          {/* Deck 1: Inspector & Status */}
          <Card className="p-5">
            <div className="flex items-center justify-between border-b border-line/70 pb-3">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "size-2.5 rounded-full",
                    detail.hasRender ? "bg-emerald-500 pulse-emerald" : "bg-amber-500",
                  )}
                />
                <h3 className="font-black text-sm text-ink uppercase tracking-wide">
                  Thông Số Kỹ Thuật Video (Inspector)
                </h3>
              </div>
              <span className="font-mono text-xs font-bold text-terra">
                Format: {tInfo.name}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl border border-line/50 bg-surface-2/60 p-3">
                <span className="text-[10.5px] font-mono font-bold text-ink-dim uppercase flex items-center gap-1.5">
                  <Film className="size-3.5 text-terra" />
                  Độ Phân Giải & Tỉ Lệ
                </span>
                <p className="mt-1 text-sm font-black text-ink">1080 × 1920 (9:16 Vertical)</p>
                <p className="text-[11px] text-ink-soft">Tối ưu TikTok, YouTube Shorts, Reels</p>
              </div>

              <div className="rounded-xl border border-line/50 bg-surface-2/60 p-3">
                <span className="text-[10.5px] font-mono font-bold text-ink-dim uppercase flex items-center gap-1.5">
                  <Clock className="size-3.5 text-terra" />
                  Thời Lượng Thực Tế
                </span>
                <p className="mt-1 text-sm font-black text-ink">{fmtDur(detail.duration)}</p>
                <p className="text-[11px] text-ink-soft">
                  Chuẩn format: <strong>{tInfo.duration}</strong>
                </p>
              </div>

              <div className="rounded-xl border border-line/50 bg-surface-2/60 p-3">
                <span className="text-[10.5px] font-mono font-bold text-ink-dim uppercase flex items-center gap-1.5">
                  <Volume2 className="size-3.5 text-terra" />
                  Âm Thanh Đa Tầng
                </span>
                <p className="mt-1 text-sm font-black text-ink">Edge Neural TTS + BGM + SFX</p>
                <p className="text-[11px] text-ink-soft">{detail.script.length} câu phụ đề kinetic</p>
              </div>

              <div className="rounded-xl border border-line/50 bg-surface-2/60 p-3">
                <span className="text-[10.5px] font-mono font-bold text-ink-dim uppercase flex items-center gap-1.5">
                  <HardDrive className="size-3.5 text-terra" />
                  Dung Lượng Bản Render
                </span>
                <p className="mt-1 text-sm font-black text-ink">
                  {detail.render ? fmtSize(detail.render.size) : "Chưa có file"}
                </p>
                <p className="text-[11px] text-ink-soft">
                  {detail.render ? fmtWhen(detail.render.mtime) : "Bấm Render MP4 để xuất"}
                </p>
              </div>
            </div>

            {/* Quick Actions Bar inside Inspector */}
            <div className="mt-5 flex flex-wrap items-center gap-2.5 border-t border-line/70 pt-4">
              <Button
                variant="primary"
                onClick={onRender}
                disabled={running}
                className="shadow-xs"
              >
                <Play className="size-4" />
                <span>Xuất Bản MP4 Mới</span>
              </Button>

              {detail.hasRender && (
                <a
                  href={`/api/videos/${detail.slug}/download`}
                  download={`${detail.slug}.mp4`}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface-2 px-3.5 py-2 text-xs font-bold text-ink hover:text-terra transition-colors shadow-2xs"
                >
                  <Download className="size-4" />
                  <span>Tải File MP4 Về Máy</span>
                </a>
              )}

              <Button
                variant="secondary"
                onClick={() => setCanvasKey((k) => k + 1)}
                title="Làm mới lại toàn bộ frame hoạt hoạ"
              >
                <RefreshCw className="size-3.5" />
                <span>Reload GSAP Canvas</span>
              </Button>
            </div>
          </Card>

          {/* Deck 2: FE Production Workflow Guide */}
          <Card className="p-4 bg-surface-2/60 border-dashed">
            <h4 className="text-xs font-black text-ink uppercase tracking-wide flex items-center gap-1.5">
              <Sparkles className="size-3.5 text-gold" />
              Mẹo Tối Ưu Năng Suất Cho Chuyên Gia FE:
            </h4>
            <ul className="mt-2 space-y-1.5 text-xs text-ink-soft list-disc list-inside leading-relaxed">
              <li>
                <strong>Kiểm tra nhịp cắt tức thì:</strong> Sử dụng tab <strong>Live Canvas</strong> để kiểm tra nhịp fast-cut 2 giây, chuyển cảnh xé giấy và âm thanh lồng tiếng mà không mất thời gian render MP4.
              </li>
              <li>
                <strong>Tự động Hot-Reload:</strong> Mọi tinh chỉnh trong kịch bản (tab Biên tập kịch bản) hoặc tài sản hình ảnh sẽ tự động phản hồi trên Live Canvas ngay khi làm mới.
              </li>
              <li>
                <strong>Khớp thời lượng chính xác:</strong> Dùng công cụ <strong>Target Duration</strong> ở trên để ép clip đúng khung 36s (Shorts) hoặc 79s (Tier List) trước khi xuất file MP4 chính thức.
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
