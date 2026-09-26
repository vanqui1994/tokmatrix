import { useMemo, useState } from "react";
import {
  ArrowUpDown,
  Calendar,
  CircleCheck,
  Filter,
  Layers,
  LayoutTemplate,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import type { VideoSummary } from "../../api";
import { Badge, Skeleton } from "../ui";
import {
  cn,
  fmtDur,
  fmtWhen,
  getVideoTemplateInfo,
  LANGS,
  TEMPLATES_LIST,
  type TemplateType,
} from "../../lib/utils";

interface StudioSidebarProps {
  videos: VideoSummary[] | null;
  activeSlug: string | null;
  onSelectSlug: (slug: string) => void;
  onOpenNewModal: () => void;
  templateSlug: string;
}

export function StudioSidebar({
  videos,
  activeSlug,
  onSelectSlug,
  onOpenNewModal,
  templateSlug,
}: StudioSidebarProps) {
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<"newest" | "oldest" | "title" | "duration">("newest");
  const [filterLang, setFilterLang] = useState<string>("all");
  const [filterTemplate, setFilterTemplate] = useState<"all" | TemplateType>("all");
  const [onlyRendered, setOnlyRendered] = useState(false);

  const langCounts = useMemo(() => {
    const counts: Record<string, number> = { all: videos?.length ?? 0 };
    if (videos) {
      for (const v of videos) {
        counts[v.lang] = (counts[v.lang] || 0) + 1;
      }
    }
    return counts;
  }, [videos]);

  const templateCounts = useMemo(() => {
    const counts: Record<string, number> = { all: videos?.length ?? 0 };
    if (videos) {
      for (const v of videos) {
        const info = getVideoTemplateInfo(v.slug);
        counts[info.id] = (counts[info.id] || 0) + 1;
      }
    }
    return counts;
  }, [videos]);

  const filteredAndSorted = useMemo(() => {
    if (!videos) return null;
    let res = [...videos];

    const q = query.trim().toLowerCase();
    if (q) {
      res = res.filter((v) => (v.slug + v.title + v.message).toLowerCase().includes(q));
    }

    if (filterLang !== "all") {
      res = res.filter((v) => v.lang === filterLang);
    }

    if (filterTemplate !== "all") {
      res = res.filter((v) => getVideoTemplateInfo(v.slug).id === filterTemplate);
    }

    if (onlyRendered) {
      res = res.filter((v) => v.hasRender);
    }

    res.sort((a, b) => {
      if (sortMode === "newest") {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      if (sortMode === "oldest") {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      if (sortMode === "title") {
        return a.title.localeCompare(b.title);
      }
      if (sortMode === "duration") {
        return b.duration - a.duration;
      }
      return 0;
    });

    return res;
  }, [videos, query, filterLang, filterTemplate, onlyRendered, sortMode]);

  const groupedVideos = useMemo(() => {
    if (!filteredAndSorted) return null;
    if (sortMode !== "newest" && sortMode !== "oldest") {
      return [{ group: null, items: filteredAndSorted }];
    }

    const groups: { group: string; items: VideoSummary[] }[] = [];
    const map = new Map<string, VideoSummary[]>();

    for (const v of filteredAndSorted) {
      const d = new Date(v.createdAt);
      let label = "Khác";
      if (!isNaN(d.getTime())) {
        const now = new Date();
        if (d.toDateString() === now.toDateString()) {
          label = `Hôm nay (${d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })})`;
        } else {
          const yesterday = new Date(now);
          yesterday.setDate(now.getDate() - 1);
          if (d.toDateString() === yesterday.toDateString()) {
            label = `Hôm qua (${d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })})`;
          } else {
            label = d.toLocaleDateString("vi-VN", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
            });
          }
        }
      }

      if (!map.has(label)) {
        map.set(label, []);
        groups.push({ group: label, items: map.get(label)! });
      }
      map.get(label)!.push(v);
    }

    return groups;
  }, [filteredAndSorted, sortMode]);

  const hasActiveFilters = filterLang !== "all" || filterTemplate !== "all" || onlyRendered || query.trim() !== "";

  const resetFilters = () => {
    setQuery("");
    setFilterLang("all");
    setFilterTemplate("all");
    setOnlyRendered(false);
  };

  return (
    <aside className="flex flex-col gap-2.5 lg:sticky lg:top-[69px] lg:h-[calc(100vh-84px)] min-w-0">
      {/* Pinned Top Navigation Cards */}
      <div className="flex flex-col gap-2 shrink-0">
        <button
          type="button"
          onClick={onOpenNewModal}
          className="flex cursor-pointer items-center gap-3 rounded-2xl border border-terra/40 bg-terra-bright/10 p-3 text-left transition-all duration-150 hover:bg-terra-bright/20 hover:border-terra shadow-2xs group"
        >
          <span className="grid size-9 place-items-center rounded-xl bg-terra text-surface-2 shadow-2xs group-hover:scale-105 transition-transform">
            <Sparkles className="size-4.5 text-gold" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block font-black text-xs text-terra uppercase tracking-wide">
              Tạo video mới
            </span>
            <span className="block text-[11.5px] text-ink-soft truncate">
              Tự động sinh chủ đề & kịch bản AI
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => onSelectSlug(templateSlug)}
          aria-current={activeSlug === templateSlug ? "true" : undefined}
          className={cn(
            "flex cursor-pointer items-center gap-2.5 rounded-xl border p-2.5 text-left transition-all duration-150",
            activeSlug === templateSlug
              ? "border-terra bg-surface-2 shadow-[inset_3px_0_0_0_var(--color-terra)] font-bold"
              : "border-line bg-surface hover:border-line-strong hover:bg-surface-2",
          )}
        >
          <LayoutTemplate className="size-4 shrink-0 text-ink-dim" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <span className="block text-xs font-bold text-ink">Bố Cục Chuẩn (Template Review)</span>
            <span className="block text-[11px] text-ink-soft truncate">Xem trước 3-zone layout mẫu</span>
          </div>
        </button>

        {/* Search Bar */}
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-ink-dim"
            aria-hidden="true"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm theo tên, kịch bản, slug…"
            aria-label="Tìm video"
            className="h-9 w-full rounded-xl border border-line bg-surface-2 pr-8 pl-8 text-xs text-ink placeholder:text-ink-dim focus-visible:border-terra focus:outline-none transition-colors"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute top-1/2 right-2.5 -translate-y-1/2 text-ink-dim hover:text-ink cursor-pointer p-0.5"
              aria-label="Xóa tìm kiếm"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        {/* Filter & Sort Controls Deck */}
        <div className="flex flex-col gap-2 rounded-2xl border border-line/90 bg-surface-2/80 p-2.5 text-xs shadow-xs backdrop-blur-sm">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="sort-select" className="flex items-center gap-1 font-bold text-[11px] text-ink-soft">
              <ArrowUpDown className="size-3 text-terra" aria-hidden="true" />
              Sắp xếp:
            </label>
            <select
              id="sort-select"
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as any)}
              className="cursor-pointer rounded-lg border border-line bg-surface px-2 py-1 text-[11px] font-semibold text-ink focus-visible:border-terra"
            >
              <option value="newest">🕒 Mới nhất</option>
              <option value="oldest">⏳ Cũ nhất</option>
              <option value="title">🔤 Tên A → Z</option>
              <option value="duration">⏱️ Thời lượng</option>
            </select>
          </div>

          <div className="flex items-center justify-between border-t border-line/60 pt-1.5">
            <span className="text-[11px] text-ink-soft flex items-center gap-1">
              <Filter className="size-3 text-ink-dim" />
              Chỉ video đã render
            </span>
            <button
              type="button"
              onClick={() => setOnlyRendered((v) => !v)}
              className={cn(
                "cursor-pointer rounded-full px-2 py-0.5 text-[10px] font-bold transition-all",
                onlyRendered
                  ? "bg-sage text-surface-2 shadow-2xs"
                  : "border border-line bg-surface text-ink-dim hover:text-ink",
              )}
            >
              {onlyRendered ? "✓ Đang lọc" : "Tất cả"}
            </button>
          </div>

          {/* Country / Lang filter chips */}
          <div className="flex items-center gap-1 overflow-x-auto pt-1 scroll-thin pb-0.5">
            <button
              type="button"
              onClick={() => setFilterLang("all")}
              className={cn(
                "cursor-pointer shrink-0 rounded-lg px-2 py-0.5 text-[10.5px] font-semibold transition-all",
                filterLang === "all"
                  ? "bg-terra text-surface-2 font-bold shadow-2xs"
                  : "bg-surface border border-line text-ink-soft hover:text-ink",
              )}
            >
              Tất cả ({langCounts.all})
            </button>
            {Object.entries(LANGS).map(([code, info]) => {
              const count = langCounts[code] || 0;
              if (count === 0 && filterLang !== code) return null;
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => setFilterLang(filterLang === code ? "all" : code)}
                  className={cn(
                    "cursor-pointer shrink-0 rounded-lg px-2 py-0.5 text-[10.5px] font-semibold transition-all flex items-center gap-1",
                    filterLang === code
                      ? "bg-terra text-surface-2 font-bold shadow-2xs"
                      : "bg-surface border border-line text-ink-soft hover:text-ink",
                  )}
                >
                  <span>{info.emoji}</span>
                  <span>{info.flag}</span>
                  <span className="opacity-75 font-mono text-[9.5px]">({count})</span>
                </button>
              );
            })}
          </div>

          {/* Template format filter chips */}
          <div className="flex flex-col gap-1 border-t border-line/60 pt-1.5">
            <div className="flex items-center justify-between text-[10.5px] text-ink-soft">
              <span className="flex items-center gap-1 font-bold text-ink">
                <Layers className="size-3 text-terra" aria-hidden="true" />
                Định dạng:
              </span>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="text-[10px] text-terra font-semibold hover:underline cursor-pointer"
                >
                  Đặt lại bộ lọc
                </button>
              )}
            </div>
            <div className="flex items-center gap-1 overflow-x-auto pt-0.5 scroll-thin pb-0.5">
              <button
                type="button"
                onClick={() => setFilterTemplate("all")}
                className={cn(
                  "cursor-pointer shrink-0 rounded-lg px-2 py-0.5 text-[10.5px] font-semibold transition-all",
                  filterTemplate === "all"
                    ? "bg-terra text-surface-2 font-bold shadow-2xs"
                    : "bg-surface border border-line text-ink-soft hover:text-ink",
                )}
              >
                Tất cả ({templateCounts.all})
              </button>
              {TEMPLATES_LIST.map((t) => {
                const count = templateCounts[t.id] || 0;
                if (count === 0 && filterTemplate !== t.id) return null;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setFilterTemplate(filterTemplate === t.id ? "all" : t.id)}
                    className={cn(
                      "cursor-pointer shrink-0 rounded-lg px-2 py-0.5 text-[10.5px] font-semibold transition-all flex items-center gap-1",
                      filterTemplate === t.id
                        ? "bg-terra text-surface-2 font-bold shadow-2xs"
                        : "bg-surface border border-line text-ink-soft hover:text-ink",
                    )}
                    title={t.desc}
                  >
                    <span>{t.icon}</span>
                    <span>{t.shortName}</span>
                    <span className="opacity-75 font-mono text-[9.5px]">({count})</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Smooth-scrolling Video List */}
      <div className="flex-1 min-h-0 overflow-y-auto pr-1 flex flex-col gap-3 scroll-thin">
        {!groupedVideos ? (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)
        ) : filteredAndSorted?.length === 0 ? (
          <div className="rounded-2xl border border-line bg-surface p-6 text-center text-xs text-ink-soft shadow-2xs">
            <p className="font-bold text-ink">Không tìm thấy video phù hợp</p>
            <p className="mt-1 text-[11px] text-ink-dim">Thử đổi từ khóa hoặc xóa bớt tiêu chí lọc</p>
            <button
              type="button"
              onClick={resetFilters}
              className="mt-3 cursor-pointer rounded-xl bg-surface-2 px-3.5 py-1.5 text-xs font-bold text-terra hover:bg-terra-bright/20 border border-terra/30 transition-colors"
            >
              Khôi phục bộ lọc
            </button>
          </div>
        ) : (
          groupedVideos.map(({ group, items }) => (
            <div key={group ?? "all"} className="flex flex-col gap-2">
              {group && (
                <div className="sticky top-0 z-[5] flex items-center justify-between border-b border-line bg-ground/95 py-1 px-1.5 backdrop-blur text-[11px] font-black text-ink-dim uppercase tracking-wider">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="size-3 text-terra" aria-hidden="true" />
                    <span>{group}</span>
                  </span>
                  <span className="rounded-full bg-surface-2 px-2 py-0.2 font-mono text-[10px]">
                    {items.length}
                  </span>
                </div>
              )}
              <ul className="flex list-none flex-col gap-2 p-0 m-0">
                {items.map((v) => {
                  const active = v.slug === activeSlug;
                  const tInfo = getVideoTemplateInfo(v.slug);
                  return (
                    <li key={v.slug}>
                      <button
                        type="button"
                        onClick={() => onSelectSlug(v.slug)}
                        aria-current={active ? "true" : undefined}
                        className={cn(
                          "w-full cursor-pointer rounded-2xl border p-3 text-left transition-all duration-150 group shadow-2xs hover:shadow-xs",
                          active
                            ? "border-terra bg-surface-2 shadow-[inset_3px_0_0_0_var(--color-terra)]"
                            : "border-line bg-surface hover:border-line-strong hover:bg-surface-2",
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-extrabold text-[13px] leading-snug text-ink line-clamp-2">
                            {v.title}
                          </span>
                          <Badge
                            tone={
                              v.lang === "vi"
                                ? "neutral"
                                : v.lang === "de"
                                ? "gold"
                                : v.lang === "ko"
                                ? "terra"
                                : "sage"
                            }
                            className="shrink-0"
                          >
                            {LANGS[v.lang]?.emoji ? `${LANGS[v.lang].emoji} ` : ""}
                            {LANGS[v.lang]?.flag ?? v.lang}
                          </Badge>
                        </div>

                        {/* Template Format Badge */}
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold tracking-tight",
                              tInfo.id === "tierlist"
                                ? "bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30"
                                : tInfo.id === "vox"
                                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30"
                                : tInfo.id === "newspaper"
                                ? "bg-orange-500/15 text-orange-700 dark:text-orange-400 border border-orange-500/30"
                                : tInfo.id === "kinetic"
                                ? "bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 border border-cyan-500/30"
                                : tInfo.id === "chalk"
                                ? "bg-teal-500/15 text-teal-700 dark:text-teal-400 border border-teal-500/30"
                                : tInfo.id === "survival"
                                ? "bg-red-500/15 text-red-700 dark:text-red-400 border border-red-500/30"
                                : tInfo.id === "science"
                                ? "bg-purple-500/15 text-purple-700 dark:text-purple-400 border border-purple-500/30"
                                : tInfo.id === "mystery"
                                ? "bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border border-indigo-500/30"
                                : "bg-terra/15 text-terra border border-terra/30",
                            )}
                          >
                            <span>{tInfo.icon}</span>
                            <span>{tInfo.shortName}</span>
                          </span>
                          <span className="text-[10.5px] text-ink-dim font-mono">{tInfo.duration}</span>
                        </div>

                        <p className="mt-1 line-clamp-2 text-[11.5px] leading-relaxed text-ink-soft">
                          {v.message || v.slug}
                        </p>

                        <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10.5px] text-ink-dim border-t border-line/50 pt-2">
                          <span className="inline-flex items-center gap-1 font-semibold text-ink-soft">
                            <Calendar className="size-3 text-terra shrink-0" aria-hidden="true" />
                            {fmtWhen(v.createdAt)}
                          </span>
                          <span aria-hidden="true" className="text-line">·</span>
                          <span>{fmtDur(v.duration)}</span>
                          <span aria-hidden="true" className="text-line">·</span>
                          <span>{v.lines} dòng</span>
                          {v.hasRender && (
                            <>
                              <span aria-hidden="true" className="text-line">·</span>
                              <span className="inline-flex items-center gap-1 text-sage font-bold">
                                <CircleCheck className="size-3.5 shrink-0" aria-hidden="true" />
                                Đã render
                              </span>
                            </>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
