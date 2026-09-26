import { useEffect, useState } from "react";
import { Check, Copy, Download, Film, Hash, Image, Sparkles, Video } from "lucide-react";
import { getPublishingKit, type PublishingKit, type VideoDetail } from "../api";
import { Badge, Button, Card, Skeleton } from "./ui";
import { cn } from "../lib/utils";

interface PublishingKitTabProps {
  detail: VideoDetail;
  onRefresh?: () => void;
}

export function PublishingKitTab({ detail }: PublishingKitTabProps) {
  const [kit, setKit] = useState<PublishingKit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    getPublishingKit(detail.slug)
      .then((data) => {
        if (active) setKit(data);
      })
      .catch((err) => {
        if (active) setError(String(err.message || err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [detail.slug]);

  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 2000);
    } catch {
      // Fallback
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-44 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (error || !kit) {
    return (
      <Card className="p-6 text-center text-ink-soft">
        <p className="font-semibold text-terra">Không thể tải Publishing Kit</p>
        <p className="mt-1 text-xs">{error || "Chưa có thông tin phát hành."}</p>
      </Card>
    );
  }

  const thumbnailUrl = `/api/videos/${detail.slug}/thumbnail`;
  const downloadMp4Url = `/api/videos/${detail.slug}/download`;

  return (
    <div className="flex flex-col gap-6">
      {/* Top Banner: Quick Actions */}
      <Card className="p-4 bg-gradient-to-r from-surface to-surface-2 border-line">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-terra">
              <Sparkles className="size-4" />
              Social Media Publishing Kit
            </span>
            <h3 className="mt-1 text-lg font-black text-ink">
              Bộ bài đăng TikTok / YouTube Shorts / Reels
            </h3>
            <p className="text-xs text-ink-soft">
              Đã tối ưu thuật toán hiển thị, CTR và SEO cho video {detail.title} ({detail.lang.toUpperCase()})
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {detail.hasRender && (
              <>
                <a
                  href={downloadMp4Url}
                  download={`${detail.slug}.mp4`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-terra px-3 py-2 text-xs font-bold text-surface-2 transition-opacity hover:opacity-90"
                >
                  <Download className="size-4" />
                  Tải Video MP4
                </a>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const res = await fetch("/api/compare-videos/send-to-upload", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ slug: detail.slug })
                      });
                      const d = await res.json();
                      if (d.success) {
                        alert("🚀 Đã chuyển video sang hàng đợi Đăng TikTok thành công!");
                        if (window.parent && window.parent !== window) {
                          window.parent.postMessage({ type: "SWITCH_TAB", tab: "upload" }, "*");
                        }
                      } else {
                        alert("Lỗi: " + (d.message || d.detail));
                      }
                    } catch (err: unknown) {
                      const msg = err instanceof Error ? err.message : String(err);
                      alert("Lỗi kết nối TokMatrix: " + msg);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition-opacity hover:opacity-90 cursor-pointer shadow-sm"
                  title="Gửi video này sang hệ thống tự động đăng kênh TikTok TokMatrix"
                >
                  🚀 Đăng Kênh TikTok (TokMatrix)
                </button>
              </>
            )}
            <a
              href={thumbnailUrl}
              download={`${detail.slug}-cover.svg`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs font-bold text-ink hover:border-terra"
            >
              <Image className="size-4 text-terra" />
              Tải Ảnh Bìa (SVG)
            </a>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Viral Titles, Description & Hashtags */}
        <div className="lg:col-span-8 flex flex-col gap-5">
          {/* 3 Viral Titles */}
          <Card className="p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-ink flex items-center gap-2">
                <Sparkles className="size-4 text-gold" />
                3 Gợi Ý Tiêu Đề Viral (Tối ưu CTR & Giữ chân)
              </h4>
              <span className="text-[11px] text-ink-dim">Bấm nút để copy</span>
            </div>

            <div className="flex flex-col gap-2.5">
              {kit.titles.map((t, idx) => {
                const key = `title-${idx}`;
                const isCopied = copiedKey === key;
                return (
                  <div
                    key={idx}
                    className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2/60 p-3 hover:border-line-strong transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge tone={t.type === "hook" ? "terra" : t.type === "question" ? "gold" : "sage"}>
                          {t.label}
                        </Badge>
                      </div>
                      <p className="text-[13.5px] font-bold text-ink leading-snug">
                        {t.title}
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => copyToClipboard(t.title, key)}
                      className="shrink-0 cursor-pointer"
                    >
                      {isCopied ? (
                        <>
                          <Check className="size-3.5 text-sage" />
                          Đã chép
                        </>
                      ) : (
                        <>
                          <Copy className="size-3.5" />
                          Copy
                        </>
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Video Description (SEO Optimized) */}
          <Card className="p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-ink flex items-center gap-2">
                <Video className="size-4 text-terra" />
                Bài Viết Mô Tả Video (SEO & Timestamps)
              </h4>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => copyToClipboard(kit.description, "desc")}
                className="cursor-pointer"
              >
                {copiedKey === "desc" ? (
                  <>
                    <Check className="size-3.5 text-sage" />
                    Đã chép mô tả
                  </>
                ) : (
                  <>
                    <Copy className="size-3.5" />
                    Chép toàn bộ mô tả
                  </>
                )}
              </Button>
            </div>

            <textarea
              readOnly
              rows={9}
              value={kit.description}
              className="w-full rounded-lg border border-line bg-surface-2 p-3 font-mono text-[12.5px] leading-relaxed text-ink-dim select-all focus:outline-none"
            />
          </Card>

          {/* Hashtags */}
          <Card className="p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-ink flex items-center gap-2">
                <Hash className="size-4 text-sage" />
                Bộ Thẻ Hashtags ({kit.hashtags.length} thẻ hot trend)
              </h4>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => copyToClipboard(kit.hashtagString, "tags")}
                className="cursor-pointer"
              >
                {copiedKey === "tags" ? (
                  <>
                    <Check className="size-3.5 text-sage" />
                    Đã chép thẻ
                  </>
                ) : (
                  <>
                    <Copy className="size-3.5" />
                    Chép tất cả thẻ
                  </>
                )}
              </Button>
            </div>

            <div className="flex flex-wrap gap-1.5 pt-1">
              {kit.hashtags.map((tag, i) => {
                const isCopied = copiedKey === `tag-${i}`;
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => copyToClipboard(tag, `tag-${i}`)}
                    className="cursor-pointer rounded-md border border-line bg-surface-2 px-2.5 py-1 text-xs font-mono text-ink-dim hover:border-terra hover:text-terra transition-colors"
                    title="Click để chép hashtag này"
                  >
                    {isCopied ? "✓ " : ""}
                    {tag}
                  </button>
                );
              })}
            </div>
          </Card>
        </div>

        {/* Right Column: 9:16 Thumbnail / Cover Poster Preview */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          <Card className="p-4 flex flex-col items-center">
            <div className="w-full flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-ink-soft flex items-center gap-1.5">
                <Image className="size-4 text-terra" />
                Ảnh Bìa Video (9:16)
              </span>
              <Badge tone="gold">1080×1920</Badge>
            </div>

            <div className="relative aspect-[9/16] w-full max-w-[280px] rounded-xl overflow-hidden border-2 border-line bg-ink shadow-lg flex items-center justify-center">
              {!detail.hasRender ? (
                <div className="p-4 text-center flex flex-col items-center justify-center">
                  <Film className="size-8 text-ink-dim mb-2" />
                  <p className="text-xs font-bold text-ink">Chưa render video</p>
                  <p className="mt-1 text-[11px] text-ink-soft leading-relaxed">
                    Hãy render video trước ở tab Trình Dựng để trích xuất ảnh bìa chất lượng cao 1080×1920.
                  </p>
                </div>
              ) : (
                <img
                  src={`/api/videos/${detail.slug}/thumbnail?type=frame&t=${detail.render?.mtime || Date.now()}`}
                  alt={`Ảnh bìa ${detail.title}`}
                  className="w-full h-full object-contain"
                  loading="lazy"
                />
              )}
            </div>

            <div className="mt-4 w-full flex flex-col gap-2">
              <a
                href={`/api/videos/${detail.slug}/thumbnail?type=frame`}
                download={`${detail.slug}-cover-frame.jpg`}
                className={cn(
                  "w-full inline-flex justify-center items-center gap-2 rounded-lg bg-surface-2 border border-line py-2.5 text-xs font-bold text-ink hover:border-terra hover:text-terra transition-colors",
                  !detail.hasRender && "opacity-50 pointer-events-none"
                )}
              >
                <Download className="size-4" />
                Tải ảnh bìa video (.jpg)
              </a>
              <p className="text-[11px] text-ink-dim text-center">
                Khung hình 1080×1920 trích xuất trực tiếp từ video MP4 thực tế
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
