import { Clapperboard, RefreshCw, Sparkles, Video } from "lucide-react";
import { Badge, Button } from "../ui";

interface StudioHeaderProps {
  videoCount: number;
  totalDuration: number;
  onOpenNewModal: () => void;
  onRefresh: () => void;
  refreshing?: boolean;
}

export function StudioHeader({
  videoCount,
  totalDuration,
  onOpenNewModal,
  onRefresh,
  refreshing = false,
}: StudioHeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-line/80 glass-surface-2 shadow-xs">
      <div className="mx-auto flex max-w-[1720px] flex-wrap items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
        {/* Brand & Identity */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <span className="grid size-10 place-items-center rounded-xl bg-terra text-surface-2 shadow-xs transition-transform hover:scale-105">
              <Clapperboard className="size-5.5" aria-hidden="true" />
            </span>
            <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-emerald-500 ring-2 ring-surface" title="Studio Engine Online" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg leading-none font-black tracking-tight text-ink">
                Compare Studio
              </h1>
              <span className="rounded-full bg-terra/10 px-2 py-0.5 font-mono text-[10px] font-extrabold text-terra">
                v2.0
              </span>
            </div>
            <p className="mt-1 font-mono text-[11px] text-ink-dim">
              auto-compare-video · Automated Short-Form Workstation
            </p>
          </div>
        </div>

        {/* Global Statistics & Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="hidden md:flex items-center gap-2 border-r border-line/60 pr-3 mr-1">
            <Badge tone="neutral">
              <Video className="size-3 text-ink-dim" />
              <span>{videoCount} video</span>
            </Badge>
            {totalDuration > 0 && (
              <Badge tone="gold">
                <span>⏱️ {totalDuration.toFixed(0)}s tổng lượng</span>
              </Badge>
            )}
            <Badge tone="sage" dot>
              <span>Ready</span>
            </Badge>
          </div>

          <Button
            size="sm"
            variant="ghost"
            onClick={onRefresh}
            disabled={refreshing}
            aria-label="Tải lại danh sách video"
            className="text-ink-soft hover:text-ink"
            title="Làm mới danh sách video từ ổ cứng"
          >
            <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin text-terra" : ""}`} aria-hidden="true" />
            <span className="hidden sm:inline">Tải lại</span>
          </Button>

          <Button
            size="sm"
            variant="primary"
            onClick={onOpenNewModal}
            className="shadow-xs hover:shadow-sm"
          >
            <Sparkles className="size-4 text-gold" aria-hidden="true" />
            <span className="font-black tracking-tight">Tạo video mới</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
