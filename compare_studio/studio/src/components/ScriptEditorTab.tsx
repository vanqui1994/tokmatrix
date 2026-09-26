import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  Edit3,
  HelpCircle,
  Image as ImageIcon,
  Link as LinkIcon,
  ListMusic,
  Play,
  RefreshCw,
  Save,
  Sparkles,
  Undo,
  Upload,
  Volume2,
  X,
} from "lucide-react";
import { changeImage, editScript, detectSfx, type VideoDetail, type DetectedSfxResult } from "../api";
import { Badge, Button, Card } from "./ui";
import { cn } from "../lib/utils";

interface ScriptEditorTabProps {
  detail: VideoDetail;
  onRefresh: () => void;
  onRerunVo: () => void;
  onRender: () => void;
  running?: boolean;
}

interface ActiveImageModal {
  target: string;
  label: string;
  currentImage: string | null;
  defaultPrompt: string;
}

export function ScriptEditorTab({
  detail,
  onRefresh,
  onRerunVo,
  onRender,
  running = false,
}: ScriptEditorTabProps) {
  const [lines, setLines] = useState<string[]>([]);
  const [tiersMeta, setTiersMeta] = useState<
    Record<number, { title: string; desc: string; survival: string }>
  >({});
  const [scenesMeta, setScenesMeta] = useState<Record<number, { telemetry: string }>>({});
  const [dialoguesMeta, setDialoguesMeta] = useState<
    Record<number, { speaker: string; emotion: string }>
  >({});
  const [isModified, setIsModified] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Image Modal State
  const [activeModal, setActiveModal] = useState<ActiveImageModal | null>(null);
  const [imageTab, setImageTab] = useState<"upload" | "url" | "ai">("upload");
  const [urlInput, setUrlInput] = useState("");
  const [aiPromptInput, setAiPromptInput] = useState("");
  const [imageLoading, setImageLoading] = useState(false);
  const [imageSuccess, setImageSuccess] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);

  // Local image cache buster so updated images immediately show up
  const [imageCacheBuster, setImageCacheBuster] = useState<Record<string, number>>({});

  // Cinema Soundscape: Auto-detected SFX cues state
  const [detectedCues, setDetectedCues] = useState<DetectedSfxResult["cues"]>([]);
  const sfxAudioRef = useRef<HTMLAudioElement | null>(null);

  const playSfx = (sfxId: string) => {
    try {
      if (sfxAudioRef.current) {
        sfxAudioRef.current.pause();
      }
      sfxAudioRef.current = new Audio(`/api/audio/sfx/${sfxId}`);
      sfxAudioRef.current.play().catch(() => {});
    } catch {}
  };

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isSurvival =
    detail.spec?.type === "survival" ||
    Boolean(detail.spec?.survivalConfig) ||
    detail.slug.startsWith("survival-") ||
    detail.script.some((s) => s.tierId != null && typeof s.tierId === "number");

  const isTierList =
    detail.spec?.type === "tierlist" ||
    (detail.spec as any)?.template === "tierlist" ||
    Boolean((detail.spec as any)?.tierListConfig) ||
    detail.slug.startsWith("tierlist-") ||
    detail.script.some((s) => (s as any).tier != null);

  const isChalk =
    detail.spec?.type === "chalk" ||
    (detail.spec as any)?.template === "chalk" ||
    Boolean((detail.spec as any)?.chalkConfig) ||
    detail.slug.startsWith("chalk-");

  const isWildlife =
    detail.spec?.type === "wildlife" ||
    (detail.spec as any)?.template === "wildlife" ||
    Boolean((detail.spec as any)?.wildlifeConfig) ||
    detail.slug.startsWith("wildlife-");

  const isMystery =
    detail.spec?.type === "mystery" ||
    Boolean(detail.spec?.mysteryConfig) ||
    detail.slug.startsWith("mystery-") ||
    detail.slug.startsWith("bi-an-") ||
    detail.script.some((s) => s.sceneId != null || Boolean(s.telemetry));

  const isScience =
    detail.spec?.type === "science" ||
    Boolean(detail.spec?.scienceConfig) ||
    detail.slug.startsWith("science-") ||
    detail.script.some((s) => s.dialogueId != null || Boolean(s.speaker));

  useEffect(() => {
    if (detail.spec?.captions && detail.spec.captions.length > 0 && !isSurvival && !isMystery && !isScience && !isTierList && !isChalk && !isWildlife) {
      setLines(detail.spec.captions);
    } else {
      setLines(detail.script.map((s) => s.caption || s.spoken));
    }

    const initialTiersMeta: Record<number, { title: string; desc: string; survival: string }> = {};
    const initialScenesMeta: Record<number, { telemetry: string }> = {};
    const initialDialoguesMeta: Record<number, { speaker: string; emotion: string }> = {};

    detail.script.forEach((s, idx) => {
      const num = idx + 1;
      if (isSurvival && s.tierId != null && typeof s.tierId === "number") {
        initialTiersMeta[s.tierId] = {
          title: s.title || "",
          desc: s.desc || "",
          survival: s.survival || "",
        };
      }
      if (isMystery || s.sceneId != null || s.telemetry != null) {
        initialScenesMeta[num] = {
          telemetry: s.telemetry || s.desc || "",
        };
      }
      if (isScience || s.dialogueId != null || s.speaker != null) {
        initialDialoguesMeta[num] = {
          speaker: s.speaker || "narrator",
          emotion: s.emotion || "",
        };
      }
    });
    setTiersMeta(initialTiersMeta);
    setScenesMeta(initialScenesMeta);
    setDialoguesMeta(initialDialoguesMeta);

    setIsModified(false);
    setStatusMessage(null);
    setErrorMessage(null);
  }, [detail, isSurvival, isMystery, isScience, isTierList, isChalk, isWildlife]);

  // Cinema Soundscape: Automatically detect SFX cues whenever lines or style change
  useEffect(() => {
    if (lines.length === 0) return;
    const style =
      (detail.spec as any)?.template ||
      (detail.spec as any)?.category ||
      (detail.spec as any)?.type ||
      (isSurvival ? "survival" : isTierList ? "tierlist" : isChalk ? "chalk" : isWildlife ? "wildlife" : isMystery ? "mystery" : isScience ? "science" : "compare");

    detectSfx({
      archetype: style,
      items: lines.map((l, idx) => ({
        text: l,
        start: detail.script[idx]?.start ?? idx * 4,
        dur: detail.script[idx]?.dur ?? 3.5,
      })),
      totalDuration: detail.duration || 60,
    })
      .then((res) => {
        if (res?.cues) setDetectedCues(res.cues);
      })
      .catch(() => {});
  }, [lines, detail.lang, detail.spec, detail.script, isSurvival, isMystery, isScience, isTierList, isChalk, isWildlife]);

  const handleLineChange = (index: number, val: string) => {
    setLines((prev) => {
      const next = [...prev];
      next[index] = val;
      return next;
    });
    setIsModified(true);
  };

  const handleTierMetaChange = (
    tierId: number,
    field: "title" | "desc" | "survival",
    val: string
  ) => {
    setTiersMeta((prev) => ({
      ...prev,
      [tierId]: {
        ...(prev[tierId] || { title: "", desc: "", survival: "" }),
        [field]: val,
      },
    }));
    setIsModified(true);
  };

  const handleSceneMetaChange = (num: number, val: string) => {
    setScenesMeta((prev) => ({
      ...prev,
      [num]: {
        ...(prev[num] || { telemetry: "" }),
        telemetry: val,
      },
    }));
    setIsModified(true);
  };

  const handleDialogueMetaChange = (
    num: number,
    field: "speaker" | "emotion",
    val: string
  ) => {
    setDialoguesMeta((prev) => ({
      ...prev,
      [num]: {
        ...(prev[num] || { speaker: "narrator", emotion: "" }),
        [field]: val,
      },
    }));
    setIsModified(true);
  };

  const handleReset = () => {
    if (detail.spec?.captions && detail.spec.captions.length > 0 && !isSurvival && !isMystery && !isScience && !isTierList && !isChalk && !isWildlife) {
      setLines(detail.spec.captions);
    } else {
      setLines(detail.script.map((s) => s.caption || s.spoken));
    }
    const initialTiersMeta: Record<number, { title: string; desc: string; survival: string }> = {};
    const initialScenesMeta: Record<number, { telemetry: string }> = {};
    const initialDialoguesMeta: Record<number, { speaker: string; emotion: string }> = {};

    detail.script.forEach((s, idx) => {
      const num = idx + 1;
      if (isSurvival && s.tierId != null && typeof s.tierId === "number") {
        initialTiersMeta[s.tierId] = {
          title: s.title || "",
          desc: s.desc || "",
          survival: s.survival || "",
        };
      }
      if (isMystery || s.sceneId != null || s.telemetry != null) {
        initialScenesMeta[num] = {
          telemetry: s.telemetry || s.desc || "",
        };
      }
      if (isScience || s.dialogueId != null || s.speaker != null) {
        initialDialoguesMeta[num] = {
          speaker: s.speaker || "narrator",
          emotion: s.emotion || "",
        };
      }
    });
    setTiersMeta(initialTiersMeta);
    setScenesMeta(initialScenesMeta);
    setDialoguesMeta(initialDialoguesMeta);
    setIsModified(false);
    setStatusMessage(null);
    setErrorMessage(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      const tiersDataArray = Object.keys(tiersMeta)
        .sort((a, b) => Number(a) - Number(b))
        .map((k) => tiersMeta[Number(k)]);

      const scenesDataArray = lines.map((_, idx) => scenesMeta[idx + 1] || { telemetry: "" });
      const dialoguesDataArray = lines.map(
        (_, idx) => dialoguesMeta[idx + 1] || { speaker: "narrator", emotion: "" }
      );

      const res = await editScript(
        detail.slug,
        lines,
        isSurvival ? tiersDataArray : undefined,
        isMystery ? scenesDataArray : undefined,
        isScience ? dialoguesDataArray : undefined
      );
      setIsModified(false);
      setStatusMessage(`✓ Đã lưu kịch bản thành công! Thời lượng root cập nhật: ${res.root}s.`);
      onRefresh();
    } catch (err: any) {
      setErrorMessage(`Lỗi lưu kịch bản: ${err.message || err}`);
    } finally {
      setSaving(false);
    }
  };

  const openImageModal = (target: string, label: string, currentImage: string | null, defaultPrompt: string) => {
    setActiveModal({ target, label, currentImage, defaultPrompt });
    setAiPromptInput(defaultPrompt);
    setUrlInput("");
    setImageSuccess(null);
    setImageError(null);
    setImageTab("upload");
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeModal) return;

    setImageLoading(true);
    setImageError(null);
    setImageSuccess(null);

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = reader.result as string;
        await changeImage(detail.slug, {
          target: activeModal.target,
          type: "upload",
          data: base64,
        });
        setImageCacheBuster((prev) => ({ ...prev, [activeModal.target]: Date.now() }));
        setImageSuccess("✓ Tải ảnh thành công!");
        onRefresh();
      } catch (err: any) {
        setImageError(`Lỗi tải ảnh: ${err.message || err}`);
      } finally {
        setImageLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    reader.onerror = () => {
      setImageError("Không thể đọc tệp ảnh");
      setImageLoading(false);
    };
    reader.readAsDataURL(file);
  };

  const handleUrlSubmit = async () => {
    if (!urlInput.trim() || !activeModal) return;
    setImageLoading(true);
    setImageError(null);
    setImageSuccess(null);
    try {
      await changeImage(detail.slug, {
        target: activeModal.target,
        type: "url",
        url: urlInput.trim(),
      });
      setImageCacheBuster((prev) => ({ ...prev, [activeModal.target]: Date.now() }));
      setImageSuccess("✓ Đã tải ảnh từ liên kết thành công!");
      onRefresh();
    } catch (err: any) {
      setImageError(`Lỗi tải URL: ${err.message || err}`);
    } finally {
      setImageLoading(false);
    }
  };

  const handleAiGenerate = async () => {
    if (!activeModal) return;
    setImageLoading(true);
    setImageError(null);
    setImageSuccess(null);
    try {
      await changeImage(detail.slug, {
        target: activeModal.target,
        type: "ai",
        prompt: aiPromptInput.trim() || activeModal.defaultPrompt,
      });
      setImageCacheBuster((prev) => ({ ...prev, [activeModal.target]: Date.now() }));
      setImageSuccess("✓ Đã sinh ảnh AI (Flux) thành công!");
      onRefresh();
    } catch (err: any) {
      setImageError(`Lỗi sinh ảnh AI: ${err.message || err}`);
    } finally {
      setImageLoading(false);
    }
  };

  const BEAT_TONES: Record<string, "neutral" | "sage" | "gold" | "terra"> = {
    hook: "sage",
    "mở đầu": "sage",
    stakes: "terra",
    question: "gold",
    "cấp 1": "sage",
    "cấp 2": "sage",
    "cấp 3": "gold",
    "cấp 4": "gold",
    "cấp 5": "terra",
    "cấp 6": "terra",
    "cấp 7": "terra",
    "cấp 8": "terra",
    "cấp 9": "terra",
    "cấp 10": "terra",
    "side a": "neutral",
    bridge: "gold",
    "side b": "neutral",
    round: "terra",
    summary: "gold",
    "golden rule": "gold",
    payoff: "terra",
    cta: "sage",
    "kết": "sage",
  };

  const getTone = (beat: string) => {
    for (const [k, tone] of Object.entries(BEAT_TONES)) {
      if (beat.toLowerCase().includes(k)) return tone;
    }
    return "neutral";
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Action Header Card */}
      <Card className="p-4 bg-gradient-to-r from-surface to-surface-2 border-line">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-terra">
              <Edit3 className="size-4" />
              In-Studio Live Script & Visual Editor
            </span>
            <h3 className="mt-0.5 text-lg font-black text-ink">
              {isSurvival
                ? "Biên tập 10 Cấp Độ Sinh Tồn & Quản lý Hình Ảnh"
                : isTierList
                ? "Biên tập Ứng Viên Bảng Xếp Hạng Tier List (SSS -> D)"
                : isChalk
                ? "Biên tập Phân Cảnh Bản Đồ Phấn Trắng Địa Chính Trị"
                : isWildlife
                ? "Biên tập Phân Cảnh & Thông Số Sinh Tồn Động Vật Hoang Dã"
                : isMystery
                ? "Biên tập Phân Cảnh & Hồ Sơ Bí Ẩn"
                : isScience
                ? "Biên tập Lời Thoại Hoạt Hình Khoa Học"
                : "Biên tập & Chỉnh sửa trực tiếp 20 nhịp kịch bản"}
            </h3>
            <p className="text-xs text-ink-soft">
              {isSurvival
                ? "Chỉnh sửa câu thoại, tiêu đề y khoa, thời gian sinh tồn và tùy chọn đổi ảnh minh họa 3D cho từng cấp độ."
                : isTierList
                ? "Chỉnh sửa câu thoại đánh giá, nhận xét, chốt bậc và đổi hình ảnh icon/showcase của từng ứng viên bảng xếp hạng."
                : isChalk
                ? "Chỉnh sửa thuyết minh, tiêu đề chiến lược và bản đồ phân cảnh."
                : isWildlife
                ? "Chỉnh sửa câu thoại thuyết minh, thông số radar HUD và huy hiệu phân cảnh động vật."
                : "Chỉnh sửa nội dung câu thoại, nhấn mạnh từ khóa bằng [[Side]] và *TỪ KHÓA*."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isModified && (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleReset}
                disabled={saving || running}
                className="cursor-pointer"
              >
                <Undo className="size-3.5" />
                Khôi phục
              </Button>
            )}
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              disabled={saving || running || !isModified}
              className="cursor-pointer"
            >
              {saving ? (
                <>
                  <RefreshCw className="size-3.5 animate-spin" />
                  Đang lưu...
                </>
              ) : (
                <>
                  <Save className="size-3.5" />
                  Lưu kịch bản & Retime
                </>
              )}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={onRerunVo}
              disabled={saving || running}
              className="cursor-pointer"
            >
              <ListMusic className="size-3.5" />
              Sinh lại giọng đọc (VO)
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={onRender}
              disabled={saving || running}
              className="cursor-pointer"
            >
              <Play className="size-3.5" />
              Render Video
            </Button>
          </div>
        </div>

        {statusMessage && (
          <div className="mt-3 rounded-lg border border-sage/40 bg-sage-bright/15 p-2.5 text-xs font-semibold text-sage">
            {statusMessage}
          </div>
        )}
        {errorMessage && (
          <div className="mt-3 rounded-lg border border-terra/40 bg-terra-bright/15 p-2.5 text-xs font-semibold text-terra">
            {errorMessage}
          </div>
        )}
      </Card>

      {/* Helper notice */}
      <div className="rounded-xl border border-line bg-surface-2/40 px-4 py-3 text-xs text-ink-soft flex items-start gap-2.5">
        <HelpCircle className="size-4 text-gold shrink-0 mt-0.5" />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span>
            <strong>Mẹo hữu ích:</strong>
          </span>
          {isSurvival ? (
            <span>
              Nhấp vào ô hình ảnh ở mỗi cấp độ để <strong>tải ảnh từ máy</strong>, <strong>dán link ảnh web</strong> hoặc dùng <strong>AI Gen ảnh 3D tự động</strong>.
            </span>
          ) : isTierList ? (
            <span>
              Chỉnh sửa kịch bản <strong>Bảng Xếp Hạng Tier List</strong>. Nhấp vào ô ảnh đại diện của từng ứng viên để đổi icon/ảnh minh họa game hoặc tải ảnh mới.
            </span>
          ) : isMystery ? (
            <span>
              Chỉnh sửa kịch bản <strong>Bí ẩn & Sự kiện có thật</strong>. Bấm <strong>"Đổi hình ảnh"</strong> ở từng phân cảnh để tải ảnh lên hoặc dùng AI Flux sinh tư liệu 8K.
            </span>
          ) : isScience ? (
            <span>
              Chỉnh sửa kịch bản <strong>Khoa học nhân hoá</strong>. Hỗ trợ đối thoại hoạt hình chibi đa nhân vật, tự động gán biểu cảm và giọng đọc nhân vật.
            </span>
          ) : (
            <>
              <span>
                Dùng <code className="bg-surface px-1.5 py-0.5 rounded border border-line font-mono text-terra font-bold">[[Từ khóa]]</code> để tô màu Side A/B.
              </span>
              <span>
                Dùng <code className="bg-surface px-1.5 py-0.5 rounded border border-line font-mono text-gold font-bold">*VIẾT HOA*</code> để in đậm vàng nổi bật.
              </span>
            </>
          )}
          {detectedCues.length > 0 && (
            <div className="mt-2 pt-2 border-t border-line/50 flex items-center gap-2 text-xs text-amber-500 font-medium">
              <Volume2 className="w-3.5 h-3.5 shrink-0" />
              <span>
                <strong>Cinema Soundscape:</strong> Tự động phát hiện <strong>{detectedCues.length}</strong> hiệu ứng SFX điện ảnh theo nhịp thoại. Bấm nút cam cạnh mỗi câu để nghe thử.
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Script Lines List */}
      <div className="flex flex-col gap-3">
        {lines.map((text, idx) => {
          const num = idx + 1;
          const lineMeta = detail.script[idx] || ({} as any);
          const beat =
            lineMeta.beat ||
            (isSurvival
              ? num === 1
                ? "Hook"
                : num === 12
                ? "Final CTA"
                : `Cấp ${num - 1}`
              : isTierList
              ? `Mục ${num}: ${lineMeta.name || `Ứng viên ${num}`}`
              : isMystery
              ? `Cảnh ${num}`
              : isScience
              ? `Thoại ${num}`
              : `Nhịp ${num}`);
          const tone = getTone(beat);
          const tierId = isSurvival && num >= 2 && num <= 11 ? num - 1 : null;
          const sceneId = lineMeta.sceneId ?? (isMystery ? num : null);
          const targetKey =
            isTierList
              ? `item-${num}-icon`
              : tierId != null
              ? `tier-${tierId}`
              : sceneId != null
              ? `scene-${sceneId}`
              : lineMeta.side === "left"
              ? "left"
              : lineMeta.side === "right"
              ? "right"
              : null;

          const currentImgUrl = targetKey
            ? `${lineMeta.image || `/videos/${detail.slug}/assets/images/${targetKey}.jpg`}${
                imageCacheBuster[targetKey] ? `?v=${imageCacheBuster[targetKey]}` : ""
              }`
            : lineMeta.image;

          const tierMeta = tierId != null ? tiersMeta[tierId] : null;

          return (
            <Card
              key={idx}
              className="p-4 hover:border-line-strong transition-colors flex flex-col gap-3 bg-surface"
            >
              {/* Header row */}
              <div className="flex items-center justify-between gap-2 border-b border-line/60 pb-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs font-black text-ink-dim w-7 text-center">
                    #{num}
                  </span>
                  <Badge tone={tone}>{beat}</Badge>
                  {isTierList && lineMeta.tier && (
                    <Badge
                      tone={
                        lineMeta.tier === "SSS" || lineMeta.tier === "S"
                          ? "terra"
                          : lineMeta.tier === "A"
                          ? "gold"
                          : lineMeta.tier === "B"
                          ? "sage"
                          : "neutral"
                      }
                      className="font-black tracking-wider"
                    >
                      BẬC {lineMeta.tier}
                    </Badge>
                  )}
                  {tierMeta && (
                    <span className="text-xs font-bold text-ink truncate max-w-[280px]">
                      {tierMeta.title}
                    </span>
                  )}
                  {isTierList && lineMeta.title && (
                    <span className="text-xs font-bold text-ink truncate max-w-[280px]">
                      {lineMeta.title}
                    </span>
                  )}
                  {isMystery && scenesMeta[num]?.telemetry && (
                    <span className="text-xs font-mono font-semibold text-terra truncate max-w-[320px]">
                      {scenesMeta[num].telemetry}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 font-mono text-[11px] text-ink-dim">
                  {/* Cinema Soundscape SFX Cues */}
                  {(() => {
                    const matchedCues = detectedCues.filter(
                      (c) =>
                        c.reason?.includes(`beat #${num}`) ||
                        (lineMeta.start != null &&
                          lineMeta.dur != null &&
                          c.start >= lineMeta.start - 0.2 &&
                          c.start < lineMeta.start + lineMeta.dur)
                    );
                    if (matchedCues.length === 0) return null;
                    return (
                      <div className="flex items-center gap-1">
                        {matchedCues.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              playSfx(c.sfxId);
                            }}
                            title={`SFX: ${c.sfxId} (${c.reason || "Auto-detected"}). Nhấp để nghe thử.`}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/25 hover:bg-amber-500/20 active:scale-95 transition-all cursor-pointer"
                          >
                            <Volume2 className="w-2.5 h-2.5" />
                            <span>{c.sfxId}</span>
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                  {lineMeta.start != null && <span>t = {lineMeta.start.toFixed(2)}s</span>}
                  {lineMeta.dur != null && <span>({lineMeta.dur.toFixed(2)}s)</span>}
                </div>
              </div>

              {/* Main content grid: Image Column + Text Column */}
              <div className="flex flex-col md:flex-row gap-4 items-start">
                {/* Image Box if applicable */}
                {targetKey ? (
                  <div className="shrink-0 flex flex-col items-center gap-2">
                    <div
                      onClick={() =>
                        openImageModal(
                          targetKey,
                          beat,
                          currentImgUrl || null,
                          lineMeta.imagePrompt ||
                            (isTierList
                              ? `App icon and gaming artwork of ${lineMeta.title || beat}, clean colorful 3D render`
                              : isMystery
                              ? `Cinematic documentary shot of ${text.slice(0, 80)}, 8k photorealistic, moody atmospheric lighting`
                              : `A detailed 3D cinematic rendering of ${tierMeta?.title || beat}`)
                        )
                      }
                      className="group relative w-24 h-24 rounded-xl border-2 border-line hover:border-terra bg-surface-2 overflow-hidden cursor-pointer flex items-center justify-center transition-all shadow-sm"
                      title="Nhấp để đổi hoặc xem ảnh này"
                    >
                      <img
                        src={currentImgUrl || undefined}
                        alt={beat}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = "none";
                          const fb = (e.target as HTMLElement).nextElementSibling as HTMLElement;
                          if (fb) fb.style.display = "flex";
                        }}
                      />
                      <div className="fallback-icon absolute inset-0 hidden flex-col items-center justify-center text-ink-dim p-1 text-center text-[10px]">
                        <ImageIcon className="size-6 mb-1 text-ink-dim" />
                        <span>Chưa có ảnh</span>
                      </div>
                      <div className="absolute inset-0 bg-ink/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-surface-2 transition-opacity font-bold text-[11px]">
                        <Edit3 className="size-4 mb-0.5" />
                        <span>Đổi ảnh</span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-[11px] h-7 px-2 text-ink-soft hover:text-terra"
                      onClick={() =>
                        openImageModal(
                          targetKey,
                          beat,
                          currentImgUrl || null,
                          lineMeta.imagePrompt ||
                            (isTierList
                              ? `App icon and gaming artwork of ${lineMeta.title || beat}, clean colorful 3D render`
                              : isMystery
                              ? `Cinematic documentary shot of ${text.slice(0, 80)}, 8k photorealistic, moody atmospheric lighting`
                              : `A detailed 3D cinematic rendering of ${tierMeta?.title || beat}`)
                        )
                      }
                    >
                      <ImageIcon className="size-3" />
                      Đổi hình ảnh
                    </Button>
                  </div>
                ) : isScience && lineMeta.image ? (
                  <div className="shrink-0 flex flex-col items-center gap-1.5 w-20">
                    <div className="w-16 h-16 rounded-2xl border-2 border-line bg-surface-2 overflow-hidden flex items-center justify-center p-1 shadow-sm">
                      <img
                        src={lineMeta.image}
                        alt={dialoguesMeta[num]?.speaker || lineMeta.speaker || beat}
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <span className="text-[10px] font-bold text-ink-dim font-mono text-center truncate max-w-full">
                      {dialoguesMeta[num]?.speaker || lineMeta.speaker || "narrator"}
                    </span>
                  </div>
                ) : null}

                {/* Text fields column */}
                <div className="flex-1 w-full flex flex-col gap-2.5">
                  {/* Additional fields for Survival Tier */}
                  {tierMeta && tierId != null && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-surface-2/40 p-2.5 rounded-lg border border-line/60">
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-ink-dim mb-1">
                          Tiêu đề cấp độ
                        </label>
                        <input
                          type="text"
                          value={tierMeta.title}
                          onChange={(e) => handleTierMetaChange(tierId, "title", e.target.value)}
                          className="w-full rounded border border-line bg-surface px-2 py-1 text-xs font-semibold text-ink focus:border-terra focus:outline-none"
                          placeholder="Tên cấp..."
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-ink-dim mb-1">
                          Cơ chế y khoa / khoa học
                        </label>
                        <input
                          type="text"
                          value={tierMeta.desc}
                          onChange={(e) => handleTierMetaChange(tierId, "desc", e.target.value)}
                          className="w-full rounded border border-line bg-surface px-2 py-1 text-xs font-semibold text-ink focus:border-terra focus:outline-none"
                          placeholder="Mô tả cơ chế..."
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-ink-dim mb-1">
                          Giới hạn sinh tồn
                        </label>
                        <input
                          type="text"
                          value={tierMeta.survival}
                          onChange={(e) => handleTierMetaChange(tierId, "survival", e.target.value)}
                          className="w-full rounded border border-line bg-surface px-2 py-1 text-xs font-bold text-sage focus:border-terra focus:outline-none"
                          placeholder="Giới hạn..."
                        />
                      </div>
                    </div>
                  )}

                  {/* Additional fields for Tier List item */}
                  {isTierList && (lineMeta.desc || lineMeta.verdict || lineMeta.hook) && (
                    <div className="flex flex-wrap items-center justify-between gap-2 bg-surface-2/40 px-3 py-2 rounded-lg border border-line/60 text-xs">
                      {lineMeta.desc && (
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-ink-dim uppercase text-[10px] tracking-wider">Tiêu chí:</span>
                          <span className="font-semibold text-ink">{lineMeta.desc}</span>
                        </div>
                      )}
                      {lineMeta.verdict && (
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-terra uppercase text-[10px] tracking-wider">Chốt bậc:</span>
                          <span className="font-bold text-ink">{lineMeta.verdict}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Additional fields for Chalkboard Map Scene */}
                  {isChalk && (lineMeta.header || (lineMeta as any).badge || lineMeta.title) && (
                    <div className="flex flex-wrap items-center justify-between gap-2 bg-surface-2/40 px-3 py-2 rounded-lg border border-line/60 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-ink-dim uppercase text-[10px] tracking-wider">Tiêu đề chiến lược:</span>
                        <span className="font-bold text-amber-400">{lineMeta.header || lineMeta.title}</span>
                      </div>
                      {(lineMeta as any).badge && (
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-ink-dim uppercase text-[10px] tracking-wider">Huy hiệu:</span>
                          <span className="px-2 py-0.5 rounded bg-surface border border-line text-[11px] font-mono font-bold text-terra">
                            {(lineMeta as any).badge}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Additional fields for Wildlife Scene */}
                  {isWildlife && (
                    <div className="space-y-2 bg-surface-2/40 p-2.5 rounded-lg border border-line/60 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-ink-dim uppercase text-[10px] tracking-wider">Huy hiệu phân cảnh:</span>
                          <span className="px-2 py-0.5 rounded bg-surface border border-line text-[11px] font-mono font-bold text-emerald-400">
                            {(lineMeta as any).badge || lineMeta.title || "THÔNG SỐ CHIẾN THUẬT"}
                          </span>
                        </div>
                        {(detail.spec as any)?.latinName && (
                          <span className="text-[11px] italic font-serif text-amber-400">
                            {(detail.spec as any).latinName}
                          </span>
                        )}
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-ink-dim mb-1">
                          Thông số Telemetry HUD [400mm Viewfinder]
                        </label>
                        <input
                          type="text"
                          value={scenesMeta[num]?.telemetry ?? lineMeta.telemetry ?? ""}
                          onChange={(e) => handleSceneMetaChange(num, e.target.value)}
                          className="w-full rounded border border-line bg-surface px-2 py-1 text-xs font-mono font-semibold text-cyan-400 focus:border-emerald-500 focus:outline-none"
                          placeholder="DEPTH: -45M | POD: 7 UNITS | TARGET: UNKNOWN..."
                        />
                      </div>
                    </div>
                  )}

                  {/* Additional fields for Mystery Scene */}
                  {isMystery && (
                    <div className="bg-surface-2/40 p-2.5 rounded-lg border border-line/60">
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-ink-dim mb-1">
                        Thông số Radar / Telemetry HUD
                      </label>
                      <input
                        type="text"
                        value={scenesMeta[num]?.telemetry ?? lineMeta.telemetry ?? ""}
                        onChange={(e) => handleSceneMetaChange(num, e.target.value)}
                        className="w-full rounded border border-line bg-surface px-2 py-1 text-xs font-mono font-semibold text-terra focus:border-terra focus:outline-none"
                        placeholder="08/03/2014 | 00:41 UTC | KLIA TERMINAL 1..."
                      />
                    </div>
                  )}

                  {/* Additional fields for Science Dialogue */}
                  {isScience && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-surface-2/40 p-2.5 rounded-lg border border-line/60">
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-ink-dim mb-1">
                          Nhân vật thoại (Speaker)
                        </label>
                        <input
                          type="text"
                          value={dialoguesMeta[num]?.speaker ?? lineMeta.speaker ?? ""}
                          onChange={(e) => handleDialogueMetaChange(num, "speaker", e.target.value)}
                          className="w-full rounded border border-line bg-surface px-2 py-1 text-xs font-semibold text-ink focus:border-terra focus:outline-none"
                          placeholder="charA, charB, narrator..."
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-ink-dim mb-1">
                          Cảm xúc / Biểu cảm (Emotion)
                        </label>
                        <input
                          type="text"
                          value={dialoguesMeta[num]?.emotion ?? lineMeta.emotion ?? ""}
                          onChange={(e) => handleDialogueMetaChange(num, "emotion", e.target.value)}
                          className="w-full rounded border border-line bg-surface px-2 py-1 text-xs font-semibold text-ink focus:border-terra focus:outline-none"
                          placeholder="curious, sassy, angry_stomp..."
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-ink-dim mb-1">
                      Nội dung câu thoại (Voiceover & Phụ đề)
                    </label>
                    <textarea
                      rows={2}
                      value={text}
                      onChange={(e) => handleLineChange(idx, e.target.value)}
                      className={cn(
                        "w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm leading-relaxed text-ink transition-colors focus:border-terra focus:outline-none",
                        isModified && "border-gold/50"
                      )}
                      placeholder={`Nhập câu thoại số ${num}...`}
                    />
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* CHANGE IMAGE MODAL */}
      {activeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="relative w-full max-w-lg rounded-2xl border border-line bg-surface shadow-2xl p-6 flex flex-col gap-4">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div className="flex items-center gap-2">
                <ImageIcon className="size-5 text-terra" />
                <h4 className="text-base font-bold text-ink">
                  Đổi hình ảnh cho: <span className="text-terra">{activeModal.label}</span>
                </h4>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="text-ink-dim hover:text-ink p-1 rounded-lg hover:bg-surface-2 cursor-pointer transition-colors"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Current image preview */}
            <div className="flex items-center gap-4 bg-surface-2/60 p-3 rounded-xl border border-line">
              <div className="w-16 h-16 rounded-lg overflow-hidden border border-line bg-surface shrink-0">
                <img
                  src={activeModal.currentImage || ""}
                  alt="Current preview"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = "none";
                  }}
                />
              </div>
              <div className="text-xs text-ink-soft">
                <p className="font-bold text-ink mb-0.5">Tệp hiện tại: {activeModal.target}.jpg</p>
                <p>Ảnh vuông tỷ lệ 1:1, hiển thị chính giữa thẻ HUD của cấp độ này.</p>
              </div>
            </div>

            {/* Modal Tabs: Upload, URL, AI */}
            <div className="flex rounded-lg border border-line bg-surface-2 p-1 gap-1">
              <button
                type="button"
                onClick={() => {
                  setImageTab("upload");
                  setImageError(null);
                  setImageSuccess(null);
                }}
                className={cn(
                  "flex-1 py-1.5 text-xs font-bold rounded-md transition-colors flex items-center justify-center gap-1.5 cursor-pointer",
                  imageTab === "upload"
                    ? "bg-terra text-surface-2 shadow-sm"
                    : "text-ink-dim hover:text-ink"
                )}
              >
                <Upload className="size-3.5" />
                Tải từ máy tính
              </button>
              <button
                type="button"
                onClick={() => {
                  setImageTab("url");
                  setImageError(null);
                  setImageSuccess(null);
                }}
                className={cn(
                  "flex-1 py-1.5 text-xs font-bold rounded-md transition-colors flex items-center justify-center gap-1.5 cursor-pointer",
                  imageTab === "url"
                    ? "bg-terra text-surface-2 shadow-sm"
                    : "text-ink-dim hover:text-ink"
                )}
              >
                <LinkIcon className="size-3.5" />
                Dán link URL
              </button>
              <button
                type="button"
                onClick={() => {
                  setImageTab("ai");
                  setImageError(null);
                  setImageSuccess(null);
                }}
                className={cn(
                  "flex-1 py-1.5 text-xs font-bold rounded-md transition-colors flex items-center justify-center gap-1.5 cursor-pointer",
                  imageTab === "ai"
                    ? "bg-terra text-surface-2 shadow-sm"
                    : "text-ink-dim hover:text-ink"
                )}
              >
                <Sparkles className="size-3.5" />
                AI Tạo ảnh 3D
              </button>
            </div>

            {/* Tab content 1: Upload */}
            {imageTab === "upload" && (
              <div className="flex flex-col gap-3 py-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-line hover:border-terra hover:bg-surface-2/40 rounded-xl p-6 text-center cursor-pointer transition-colors flex flex-col items-center justify-center gap-2"
                >
                  <Upload className="size-8 text-terra" />
                  <span className="text-xs font-bold text-ink">
                    Nhấp vào đây để chọn ảnh từ thiết bị
                  </span>
                  <span className="text-[11px] text-ink-dim">
                    Hỗ trợ tệp PNG, JPG, WEBP chất lượng cao
                  </span>
                </div>
              </div>
            )}

            {/* Tab content 2: URL */}
            {imageTab === "url" && (
              <div className="flex flex-col gap-3 py-2">
                <label className="text-xs font-bold text-ink">Địa chỉ liên kết ảnh (Direct Image URL)</label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://example.com/image.jpg"
                    className="flex-1 rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs text-ink focus:border-terra focus:outline-none"
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleUrlSubmit}
                    disabled={imageLoading || !urlInput.trim()}
                  >
                    {imageLoading ? <RefreshCw className="size-3.5 animate-spin" /> : "Tải về"}
                  </Button>
                </div>
                <span className="text-[11px] text-ink-dim">
                  Hệ thống sẽ tự động tải file ảnh về và lưu vào thư mục dự án của video.
                </span>
              </div>
            )}

            {/* Tab content 3: AI Generation */}
            {imageTab === "ai" && (
              <div className="flex flex-col gap-3 py-2">
                <label className="text-xs font-bold text-ink flex items-center justify-between">
                  <span>Mô tả ảnh chi tiết (Prompt)</span>
                  <span className="text-[11px] text-gold font-normal">Dual AI Engine · Chuẩn TikTok 9:16</span>
                </label>
                <div className="flex flex-wrap gap-1.5 my-1">
                  {[
                    { label: "🎬 Điện ảnh 8K", text: "cinematic 8k, dramatic lighting, photorealistic, masterpiece" },
                    { label: "⚡ Cyberpunk", text: "cyberpunk neon, glowing reflections, futuristic night" },
                    { label: "🌸 Anime Ghibli", text: "studio ghibli anime style, dreamy vibrant colorful scenery" },
                    { label: "🧸 3D Pixar", text: "cute 3d character, pixar style animation, vibrant lighting" },
                    { label: "🇻🇳 Việt Nam", text: "vietnamese traditional aesthetic, cultural heritage, authentic atmosphere" },
                  ].map((s) => (
                    <button
                      key={s.label}
                      type="button"
                      onClick={() => {
                        setAiPromptInput((prev) => (prev ? `${prev}, ${s.text}` : s.text));
                      }}
                      className="rounded-md border border-line bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-ink-dim hover:text-ink hover:border-terra transition-colors cursor-pointer"
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                <textarea
                  rows={3}
                  value={aiPromptInput}
                  onChange={(e) => setAiPromptInput(e.target.value)}
                  placeholder="Nhập mô tả hình ảnh bằng tiếng Anh để đạt chất lượng tốt nhất..."
                  className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs text-ink leading-relaxed focus:border-terra focus:outline-none"
                />
                <Button
                  variant="primary"
                  size="md"
                  onClick={handleAiGenerate}
                  disabled={imageLoading}
                  className="w-full"
                >
                  {imageLoading ? (
                    <>
                      <RefreshCw className="size-4 animate-spin" />
                      Đang sinh ảnh AI... (khoảng 3-6 giây)
                    </>
                  ) : (
                    <>
                      <Sparkles className="size-4" />
                      ✨ Sinh ảnh 3D bằng AI ngay
                    </>
                  )}
                </Button>
              </div>
            )}

            {/* Status alerts */}
            {imageSuccess && (
              <div className="rounded-lg border border-sage/40 bg-sage-bright/15 p-2.5 text-xs font-semibold text-sage flex items-center gap-2">
                <Check className="size-4 shrink-0" />
                <span>{imageSuccess}</span>
              </div>
            )}
            {imageError && (
              <div className="rounded-lg border border-terra/40 bg-terra-bright/15 p-2.5 text-xs font-semibold text-terra flex items-center gap-2">
                <AlertCircle className="size-4 shrink-0" />
                <span>{imageError}</span>
              </div>
            )}

            {/* Modal Footer */}
            <div className="flex justify-end pt-2 border-t border-line">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setActiveModal(null)}
                disabled={imageLoading}
              >
                Đóng
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
