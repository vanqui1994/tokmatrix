import { useEffect, useRef, useState } from "react";
import {
  Dice5,
  Edit3,
  Loader2,
  Sparkles,
  X,
  Play,
  Pause,
  CheckCircle2,
  Search,
  Camera,
  Layers,
  Volume2,
  Globe,
  Music,
  Flame,
  Activity,
  Skull,
  RefreshCw,
  Scissors,
  Newspaper,
  Zap,
  Trophy,
  PawPrint,
} from "lucide-react";
import {
  getTopics,
  generateTopic,
  generateSurvivalTopic,
  generateScienceTopic,
  generateMysteryTopic,
  suggestMysteryTopics,
  type MysterySuggestedTopic,
  generateVoxTopic,
  suggestVoxTopics,
  type VoxSuggestedTopic,
  type VoxConfig,
  generateNewspaperTopic,
  suggestNewspaperTopics,
  type NewspaperSuggestedTopic,
  type NewspaperConfig,
  generateKineticTopic,
  suggestKineticTopics,
  type KineticSuggestedTopic,
  type KineticConfig,
  generateChalkTopic,
  suggestChalkTopics,
  type ChalkSuggestedTopic,
  type ChalkConfig,
  generateTierListTopic,
  suggestTierListTopics,
  type TierListSuggestedTopic,
  type TierListConfig,
  generateWildlifeTopic,
  suggestWildlifeTopics,
  type WildlifeSuggestedTopic,
  type WildlifeConfig,
  searchImages,
  getVoices,
  type ImageCandidate,
  type TopicCategory,
  type TopicSpec,
  type TopicSummary,
  type CountryOption,
  type SurvivalConfig,
  type ScienceTopic,
  type MysteryConfig,
} from "../api";
import { Badge, Button, Card } from "./ui";
import {
  cn,
  TEMPLATE_CATEGORIES,
  TEMPLATES_LIST,
  type TemplateCategory,
  type TemplateType,
} from "../lib/utils";
import { getSurvivalConfig } from "../lib/survivalConfigs";

const DEFAULT_COUNTRIES: CountryOption[] = [
  {
    code: "vi",
    country: "Việt Nam",
    flag: "🇻🇳",
    langName: "Tiếng Việt",
    defaultVoice: "vi-VN-NamMinhNeural",
    voices: [
      { id: "vi-VN-NamMinhNeural", name: "Nam Minh", gender: "male", desc: "Nam · Chuẩn Hà Nội" },
      { id: "vi-VN-HoaiMyNeural", name: "Hoài My", gender: "female", desc: "Nữ · Nhẹ nhàng" },
    ],
  },
  {
    code: "en",
    country: "Hoa Kỳ / Toàn cầu",
    flag: "🇺🇸",
    langName: "English",
    defaultVoice: "en-US-AndrewNeural",
    voices: [
      { id: "en-US-AndrewNeural", name: "Andrew", gender: "male", desc: "Male · Confident" },
      { id: "en-US-AvaNeural", name: "Ava", gender: "female", desc: "Female · Natural" },
    ],
  },
  {
    code: "de",
    country: "Đức",
    flag: "🇩🇪",
    langName: "Deutsch",
    defaultVoice: "de-DE-ConradNeural",
    voices: [
      { id: "de-DE-ConradNeural", name: "Conrad", gender: "male", desc: "Männlich · Klar" },
      { id: "de-DE-KatjaNeural", name: "Katja", gender: "female", desc: "Weiblich · Freundlich" },
    ],
  },
  {
    code: "fr",
    country: "Pháp",
    flag: "🇫🇷",
    langName: "Français",
    defaultVoice: "fr-FR-HenriNeural",
    voices: [
      { id: "fr-FR-HenriNeural", name: "Henri", gender: "male", desc: "Masculin · Posé" },
      { id: "fr-FR-DeniseNeural", name: "Denise", gender: "female", desc: "Féminin · Naturel" },
    ],
  },
  {
    code: "ja",
    country: "Nhật Bản",
    flag: "🇯🇵",
    langName: "日本語",
    defaultVoice: "ja-JP-KeitaNeural",
    voices: [
      { id: "ja-JP-KeitaNeural", name: "Keita (啓太)", gender: "male", desc: "男性 · 落ち着いた声" },
      { id: "ja-JP-NanamiNeural", name: "Nanami (七海)", gender: "female", desc: "女性 · 明るい声" },
    ],
  },
  {
    code: "ko",
    country: "Hàn Quốc",
    flag: "🇰🇷",
    langName: "한국어",
    defaultVoice: "ko-KR-InJoonNeural",
    voices: [
      { id: "ko-KR-InJoonNeural", name: "InJoon (인준)", gender: "male", desc: "남성 · 신뢰감" },
      { id: "ko-KR-SunHiNeural", name: "SunHi (선희)", gender: "female", desc: "여성 · 발랄함" },
    ],
  },
];

const COUNTRY_MASCOTS: Record<string, { mascotName: string; mascotDesc: string; themeName: string; flag: string }> = {
  de: { mascotName: "Dachshund Otto 🐶", mascotDesc: "Chú chó xúc xích lạp xưởng thông thái đeo kính vàng bia và nơ đỏ", themeName: "Bauhaus Slate & Gold", flag: "🇩🇪" },
  ko: { mascotName: "K-Tiger Horangi 🐯", mascotDesc: "Chú hổ con K-Tiger biểu tượng Hàn Quốc với sọc vằn và má hồng", themeName: "Hanbok Celadon & Navy", flag: "🇰🇷" },
  ja: { mascotName: "Shiba Hachi 🐕", mascotDesc: "Quốc khuyển Shiba Inu đốm mày trắng tròn và khăn quàng đỏ Torii", themeName: "Torii Vermilion & Matcha", flag: "🇯🇵" },
  vi: { mascotName: "Mèo Mun 🐱", mascotDesc: "Giáo sư mèo đen đeo kính xô thơm và ria mép dài kinh điển", themeName: "Retro Warm Amber", flag: "🇻🇳" },
  fr: { mascotName: "Coq Pierre 🐓", mascotDesc: "Chú gà trống Gô-loa mào đỏ Bordeaux và nơ cổ Bistro Pháp", themeName: "Parisian Bistro Navy", flag: "🇫🇷" },
  en: { mascotName: "Owl Barnaby 🦉", mascotDesc: "Cú mèo giáo sư thông thái mắt tròn to tri thức Oxford", themeName: "Oxford Navy & Gold", flag: "🇺🇸" },
};

const BEAT_LABELS_20 = [
  "Hook 1",
  "Hook 2",
  "Nút thắt / Stakes",
  "Câu hỏi cốt lõi",
  "Định nghĩa A",
  "Cơ chế vận hành A",
  "Điểm mạnh A",
  "Điểm yếu A",
  "Bước ngoặt",
  "Định nghĩa B",
  "Giải pháp B",
  "Điểm mạnh B",
  "Đánh đổi B",
  "So găng 1 (Cảm giác)",
  "So găng 2 (Kỹ thuật)",
  "So găng 3 (Thực tế)",
  "Đúc kết đối kháng",
  "Quy tắc vàng 3s",
  "Chốt hạ chân lý",
  "Kêu gọi CTA",
];

const BEAT_TONES_20: ("sage" | "gold" | "neutral" | "terra")[] = [
  "sage", "sage",
  "gold", "gold",
  "terra", "terra", "terra", "terra",
  "gold",
  "sage", "sage", "sage", "sage",
  "neutral", "neutral", "neutral", "gold",
  "gold", "terra", "sage",
];

const BEAT_LABELS_12 = [
  "Hook 1", "Hook 2", "Nút thắt",
  "Giải A (định nghĩa)", "Giải A (đặc điểm)", "Giải A (ví dụ)",
  "Giải B (định nghĩa)", "Giải B (đặc điểm)", "Giải B (ví dụ)",
  "So sánh 1", "So sánh 2", "Chốt hạ",
];

const BEAT_TONES_12: ("sage" | "gold" | "neutral" | "terra")[] = [
  "sage", "sage", "gold",
  "neutral", "neutral", "neutral",
  "neutral", "neutral", "neutral",
  "gold", "gold", "terra",
];

const CATEGORY_ICONS: Record<string, string> = {
  culture_uk: "🇬🇧",
  culture_de: "🇩🇪",
  culture_jp: "🇯🇵",
  culture_kr: "🇰🇷",
  everyday: "🍜",
  nature: "🌿",
  science: "🔬",
};

const BGM_OPTIONS = [
  { id: "volatile-reaction", name: "Volatile Reaction", mood: "⚡ Gây cấn dồn dập", desc: "Kevin MacLeod · Nhịp tim dồn dập, căng thẳng, chuẩn leo thang sinh tồn" },
  { id: "anxiety", name: "Anxiety", mood: "⚠️ Hồi hộp u tối", desc: "Kevin MacLeod · Không gian nghẹt thở, đếm ngược nguy cấp rùng rợn" },
  { id: "heartbreaking", name: "Heartbreaking", mood: "💀 Uncanny Meme Theme", desc: "Kevin MacLeod · Giai điệu kinh điển rợn gáy của Mr. Incredible Uncanny" },
  { id: "monkeys-spinning", name: "Monkeys Spinning", mood: "🎉 Sôi nổi", desc: "Kevin MacLeod · Viral hài hước, thịnh hành TikTok/Shorts" },
  { id: "sneaky-snitch", name: "Sneaky Snitch", mood: "🕵️ Tò mò", desc: "Kevin MacLeod · Bí ẩn dí dỏm, khơi gợi nút thắt câu hỏi" },
  { id: "carefree", name: "Carefree", mood: "☀️ Tươi vui", desc: "Kevin MacLeod · Ukulele nhẹ nhàng, ấm áp thư thái" },
  { id: "none", name: "Tắt nhạc nền", mood: "🔇 Không BGM", desc: "Chỉ giữ giọng đọc thuyết minh và hiệu ứng âm thanh" },
];

const ALL_SFX = [
  { id: "deep_boom", name: "Deep Boom", icon: "💥", tag: "Impact" },
  { id: "sub_drop", name: "808 Drop", icon: "🔊", tag: "Sub-Bass" },
  { id: "camera_shutter", name: "Camera", icon: "📸", tag: "Evidence" },
  { id: "typewriter", name: "Typewriter", icon: "⌨️", tag: "Dossier" },
  { id: "heartbeat", name: "Heartbeat", icon: "💓", tag: "Tension" },
  { id: "alarm", name: "Alarm", icon: "🚨", tag: "Alert" },
  { id: "glitch", name: "Glitch", icon: "⚡", tag: "Cyber" },
  { id: "cash_register", name: "Cash Bell", icon: "💰", tag: "Money" },
  { id: "whoosh", name: "Whoosh", icon: "💨", tag: "Transition" },
  { id: "pop", name: "Pop Bubble", icon: "🫧", tag: "Accent" },
  { id: "ding", name: "Insight Bell", icon: "🔔", tag: "Rule" },
  { id: "click", name: "UI Click", icon: "🖱️", tag: "Click" },
  { id: "chime", name: "Victory Payoff", icon: "✨", tag: "Payoff" },
];

function CinemaSoundboard({
  enableSfx = true,
  setEnableSfx,
  smartAudioDucking,
  setSmartAudioDucking,
  autoSfxEngine,
  setAutoSfxEngine,
  bgmVolume,
  setBgmVolume: _setBgmVolume,
  bgmBoostVolume,
  setBgmBoostVolume: _setBgmBoostVolume,
  playingAudio,
  playPreview,
}: {
  enableSfx?: boolean;
  setEnableSfx?: (v: boolean) => void;
  smartAudioDucking: boolean;
  setSmartAudioDucking: (v: boolean) => void;
  autoSfxEngine: boolean;
  setAutoSfxEngine: (v: boolean) => void;
  bgmVolume: number;
  setBgmVolume: (v: number) => void;
  bgmBoostVolume: number;
  setBgmBoostVolume: (v: number) => void;
  playingAudio: string | null;
  playPreview: (e: React.MouseEvent, url: string) => void;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-sm">🎬</span>
          <span className="text-xs font-bold uppercase tracking-wider text-ink">
            Cinema Soundscape Suite
          </span>
        </div>
        <div className="flex items-center gap-2">
          {setEnableSfx && (
            <label className="flex items-center gap-1.5 text-[11px] font-bold text-ink cursor-pointer bg-surface-2 px-2 py-0.5 rounded border border-line hover:border-terra">
              <span>Bật SFX</span>
              <input
                type="checkbox"
                checked={enableSfx}
                onChange={(e) => setEnableSfx(e.target.checked)}
                className="size-3.5 rounded accent-terra cursor-pointer"
              />
            </label>
          )}
          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 border border-emerald-500/20">
            Smart Ducking + Auto-SFX
          </span>
        </div>
      </div>

      {/* Toggles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
        <label className="flex items-start gap-2 rounded-lg border border-line bg-surface-2 p-2 cursor-pointer hover:border-line-strong transition-colors">
          <input
            type="checkbox"
            checked={smartAudioDucking}
            onChange={(e) => setSmartAudioDucking(e.target.checked)}
            className="size-4 mt-0.5 rounded accent-terra cursor-pointer shrink-0"
          />
          <div>
            <div className="font-bold text-ink flex items-center gap-1">
              <span>Smart BGM Ducking</span>
              <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/15 text-amber-600 font-mono">Ducking</span>
            </div>
            <div className="text-[10px] text-ink-dim mt-0.5 leading-snug">
              Hạ BGM ({Math.round(bgmVolume * 100)}%) khi có giọng đọc, boost to ({Math.round(bgmBoostVolume * 100)}%) khi kịch tính / khoảng lặng.
            </div>
          </div>
        </label>

        <label className="flex items-start gap-2 rounded-lg border border-line bg-surface-2 p-2 cursor-pointer hover:border-line-strong transition-colors">
          <input
            type="checkbox"
            checked={autoSfxEngine}
            onChange={(e) => setAutoSfxEngine(e.target.checked)}
            className="size-4 mt-0.5 rounded accent-terra cursor-pointer shrink-0"
          />
          <div>
            <div className="font-bold text-ink flex items-center gap-1">
              <span>Auto-SFX Keyword Engine</span>
              <span className="text-[9px] px-1 py-0.2 rounded bg-indigo-500/15 text-indigo-600 font-mono">6 Ngôn Ngữ</span>
            </div>
            <div className="text-[10px] text-ink-dim mt-0.5 leading-snug">
              Quét từ khóa cao trào (thảm họa, tiền bạc, hồ sơ, glitch, cảnh báo) gắn SFX chuẩn mili-giây.
            </div>
          </div>
        </label>
      </div>

      {/* 13-Key Interactive Cinema Soundboard */}
      <div className="space-y-1.5 pt-1">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-bold text-ink-dim uppercase tracking-wider flex items-center gap-1">
            <span>🎹 Bàn phím SFX Điện Ảnh (13 hiệu ứng)</span>
            <span className="text-[10px] text-ink-muted">· Bấm nghe thử</span>
          </span>
          {playingAudio && (
            <span className="text-[10px] font-mono text-terra animate-pulse flex items-center gap-1">
              <span>▶ Đang phát:</span>
              <span>{playingAudio.split("/").pop()}</span>
            </span>
          )}
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-1">
          {ALL_SFX.map((sfx) => {
            const sfxUrl = `/api/audio/sfx/${sfx.id}`;
            const isPlaying = playingAudio === sfxUrl;
            return (
              <button
                key={sfx.id}
                type="button"
                onClick={(e) => playPreview(e, sfxUrl)}
                className={cn(
                  "flex items-center gap-1 rounded-md border p-1 text-left text-xs transition-all cursor-pointer select-none",
                  isPlaying
                    ? "border-terra bg-terra text-white shadow-xs scale-95"
                    : "border-line bg-surface-2 text-ink hover:border-terra/60 hover:bg-surface"
                )}
                title={`Nghe thử ${sfx.name} (${sfx.tag})`}
              >
                <span className="text-xs shrink-0">{isPlaying ? "⏹" : sfx.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[10px] font-bold leading-tight">{sfx.name}</div>
                  <div className={cn("text-[8.5px] truncate", isPlaying ? "text-white/80" : "text-ink-dim")}>
                    {sfx.tag}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface NewVideoModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (spec: TopicSpec, opts: { target: number; render: boolean }) => void;
  onBatchGlobal?: (topic: string, opts: { target: number; render: boolean }) => void;
}

export function NewVideoModal({ open, onClose, onCreate, onBatchGlobal }: NewVideoModalProps) {
  const [videoType, setVideoType] = useState<TemplateType>("compare");
  const [activeCategory, setActiveCategory] = useState<TemplateCategory | "all">("all");

  const handleSelectCategory = (cat: TemplateCategory | "all") => {
    setActiveCategory(cat);
    if (cat !== "all") {
      const currentTemplate = TEMPLATES_LIST.find((t) => t.id === videoType);
      if (currentTemplate?.category !== cat) {
        const firstInCat = TEMPLATES_LIST.find((t) => t.category === cat);
        if (firstInCat) {
          setVideoType(firstInCat.id);
          setError(null);
        }
      }
    }
  };

  const handleSelectTemplate = (tId: TemplateType) => {
    setVideoType(tId);
    setError(null);
  };

  const [survivalSlug, setSurvivalSlug] = useState("");
  const [survivalPrompt, setSurvivalPrompt] = useState("");
  const [survivalGenerating, setSurvivalGenerating] = useState(false);
  const [survivalConfig, setSurvivalConfig] = useState<SurvivalConfig | null>(null);
  const [scienceTopic, setScienceTopic] = useState<ScienceTopic | null>(null);
  const [sciencePrompt, setSciencePrompt] = useState("");
  const [scienceGenerating, setScienceGenerating] = useState(false);
  const [scienceSelectedId, setScienceSelectedId] = useState("peanut-stomp");
  const [mysteryConfig, setMysteryConfig] = useState<MysteryConfig | null>(null);
  const [mysteryPrompt, setMysteryPrompt] = useState("");
  const [mysteryGenerating, setMysteryGenerating] = useState(false);
  const [mysterySuggestions, setMysterySuggestions] = useState<MysterySuggestedTopic[]>([]);
  const [mysterySuggesting, setMysterySuggesting] = useState(false);
  const [selectedMysteryTopicId, setSelectedMysteryTopicId] = useState<string | null>(null);

  // Vox Style State
  const [voxConfig, setVoxConfig] = useState<VoxConfig | null>(null);
  const [voxPrompt, setVoxPrompt] = useState("");
  const [voxTheme, setVoxTheme] = useState<string>("american-retro");
  const [voxGenerating, setVoxGenerating] = useState(false);
  const [voxSuggestions, setVoxSuggestions] = useState<VoxSuggestedTopic[]>([]);
  const [voxSuggesting, setVoxSuggesting] = useState(false);
  const [selectedVoxTopicId, setSelectedVoxTopicId] = useState<string | null>(null);

  // Newspaper Style State
  const [newspaperConfig, setNewspaperConfig] = useState<NewspaperConfig | null>(null);
  const [newspaperPrompt, setNewspaperPrompt] = useState("");
  const [newspaperGenerating, setNewspaperGenerating] = useState(false);
  const [newspaperSuggestions, setNewspaperSuggestions] = useState<NewspaperSuggestedTopic[]>([]);
  const [newspaperSuggesting, setNewspaperSuggesting] = useState(false);
  const [selectedNewspaperTopicId, setSelectedNewspaperTopicId] = useState<string | null>(null);

  // Kinetic Style State
  const [kineticConfig, setKineticConfig] = useState<KineticConfig | null>(null);
  const [kineticPrompt, setKineticPrompt] = useState("");
  const [kineticGenerating, setKineticGenerating] = useState(false);
  const [kineticSuggestions, setKineticSuggestions] = useState<KineticSuggestedTopic[]>([]);
  const [kineticSuggesting, setKineticSuggesting] = useState(false);
  const [selectedKineticTopicId, setSelectedKineticTopicId] = useState<string | null>(null);

  // Chalkboard Map Style State
  const [chalkConfig, setChalkConfig] = useState<ChalkConfig | null>(null);
  const [chalkPrompt, setChalkPrompt] = useState("");
  const [chalkGenerating, setChalkGenerating] = useState(false);
  const [chalkSuggestions, setChalkSuggestions] = useState<ChalkSuggestedTopic[]>([]);
  const [chalkSuggesting, setChalkSuggesting] = useState(false);
  const [selectedChalkTopicId, setSelectedChalkTopicId] = useState<string | null>(null);

  // Tier List Ranking Style State
  const [tierListConfig, setTierListConfig] = useState<TierListConfig | null>(null);
  const [tierListPrompt, setTierListPrompt] = useState("");
  const [tierListGenerating, setTierListGenerating] = useState(false);
  const [tierListSuggestions, setTierListSuggestions] = useState<TierListSuggestedTopic[]>([]);
  const [tierListSuggesting, setTierListSuggesting] = useState(false);
  const [selectedTierListTopicId, setSelectedTierListTopicId] = useState<string | null>(null);

  // AI Wildlife Documentary Style State
  const [wildlifeConfig, setWildlifeConfig] = useState<WildlifeConfig | null>(null);
  const [wildlifePrompt, setWildlifePrompt] = useState("");
  const [wildlifeGenerating, setWildlifeGenerating] = useState(false);
  const [wildlifeSuggestions, setWildlifeSuggestions] = useState<WildlifeSuggestedTopic[]>([]);
  const [wildlifeSuggesting, setWildlifeSuggesting] = useState(false);
  const [selectedWildlifeTopicId, setSelectedWildlifeTopicId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"curated" | "ai">("curated");
  const [categories, setCategories] = useState<TopicCategory[]>([]);
  const [curatedTopics, setCuratedTopics] = useState<TopicSummary[]>([]);
  const [selectedCat, setSelectedCat] = useState<string>("");
  const [countries, setCountries] = useState<CountryOption[]>(DEFAULT_COUNTRIES);
  const [selectedCountry, setSelectedCountry] = useState<string>("en");
  const [selectedVoice, setSelectedVoice] = useState<string>("en-US-AndrewNeural");
  const currentCountry = countries.find((c) => c.code === selectedCountry) || countries[0];
  const currentMascot = COUNTRY_MASCOTS[selectedCountry] || COUNTRY_MASCOTS.en;
  const [searchQuery, setSearchQuery] = useState("");

  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [spec, setSpec] = useState<TopicSpec | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [scriptText, setScriptText] = useState("");

  const [targetDuration, setTargetDuration] = useState(65);
  const [alsoRender, setAlsoRender] = useState(true);
  const [isGlobalBatch, setIsGlobalBatch] = useState(false);

  // Audio system & soundboard preview
  const [bgmTrack, setBgmTrack] = useState<string>("monkeys-spinning");
  const [bgmVolume, setBgmVolume] = useState<number>(0.18);
  const [enableSfx, setEnableSfx] = useState<boolean>(true);
  const [smartAudioDucking, setSmartAudioDucking] = useState<boolean>(true);
  const [autoSfxEngine, setAutoSfxEngine] = useState<boolean>(true);
  const [bgmBoostVolume, setBgmBoostVolume] = useState<number>(0.30);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingAudio, setPlayingAudio] = useState<string | null>(null);

  // Auto switch BGM mood between compare (upbeat), survival/kinetic (tense suspense), newspaper (curiosity)
  useEffect(() => {
    if (videoType === "survival" || videoType === "kinetic") {
      if (bgmTrack === "monkeys-spinning" || bgmTrack === "sneaky-snitch" || bgmTrack === "carefree") {
        setBgmTrack("volatile-reaction");
      }
    } else if (videoType === "newspaper") {
      if (bgmTrack === "volatile-reaction" || bgmTrack === "monkeys-spinning") {
        setBgmTrack("sneaky-snitch");
      }
    } else {
      if (bgmTrack === "volatile-reaction" || bgmTrack === "anxiety" || bgmTrack === "heartbreaking") {
        setBgmTrack("monkeys-spinning");
      }
    }
  }, [videoType]);

  useEffect(() => {
    if (videoType === "science") {
      setError(null);
      if (!scienceTopic || scienceTopic.id !== (scienceSelectedId || "peanut-stomp")) {
        setScienceGenerating(true);
        generateScienceTopic({ id: scienceSelectedId || "peanut-stomp", lang: selectedCountry })
          .then((t) => {
            setScienceTopic(t);
            setError(null);
          })
          .catch((err: any) => {
            console.error(err);
            setError(err.message);
          })
          .finally(() => setScienceGenerating(false));
      }
    }
  }, [videoType, selectedCountry]);

  const loadMysterySuggestions = async (force = false, langOverride?: string) => {
    if (mysterySuggesting && !force) return;
    setMysterySuggesting(true);
    const targetLang = langOverride || selectedCountry;
    try {
      const res = await suggestMysteryTopics({ lang: targetLang, count: 10 });
      if (res.topics && res.topics.length > 0) {
        setMysterySuggestions(res.topics);
      }
    } catch (e: any) {
      console.warn("Failed to load mystery suggestions:", e);
    } finally {
      setMysterySuggesting(false);
    }
  };

  const handleSelectMysterySuggestion = async (topic: MysterySuggestedTopic) => {
    setSelectedMysteryTopicId(topic.id);
    const targetPrompt = topic.prompt || topic.title;
    setMysteryPrompt(targetPrompt);
    setMysteryGenerating(true);
    setError(null);
    try {
      const config = await generateMysteryTopic({ prompt: targetPrompt, lang: selectedCountry });
      setMysteryConfig(config);
    } catch (err: any) {
      setError(err.message || "Không thể sinh kịch bản cho chủ đề này");
    } finally {
      setMysteryGenerating(false);
    }
  };

  useEffect(() => {
    if (videoType === "mystery") {
      if (mysterySuggestions.length === 0) {
        loadMysterySuggestions(false);
      }
      if (mysteryConfig && mysteryConfig.lang !== selectedCountry) {
        const promptToUse = mysteryPrompt.trim() || mysteryConfig.topicTitle;
        if (promptToUse) {
          setMysteryGenerating(true);
          generateMysteryTopic({ prompt: promptToUse, lang: selectedCountry })
            .then((t) => setMysteryConfig(t))
            .catch(console.error)
            .finally(() => setMysteryGenerating(false));
        }
      }
    }
  }, [videoType, selectedCountry]);

  // Vox Suggestion & Handlers
  const loadVoxSuggestions = async (force = false, langOverride?: string) => {
    if (voxSuggesting && !force) return;
    setVoxSuggesting(true);
    const targetLang = langOverride || selectedCountry;
    try {
      const res = await suggestVoxTopics({ lang: targetLang, count: 10 });
      if (res.topics && res.topics.length > 0) {
        setVoxSuggestions(res.topics);
      }
    } catch (e: any) {
      console.warn("Failed to load vox suggestions:", e);
    } finally {
      setVoxSuggesting(false);
    }
  };

  const handleSelectVoxSuggestion = async (topic: VoxSuggestedTopic) => {
    setSelectedVoxTopicId(topic.id);
    const targetPrompt = topic.prompt || topic.title;
    setVoxPrompt(targetPrompt);
    setVoxGenerating(true);
    setError(null);
    try {
      const config = await generateVoxTopic({
        prompt: targetPrompt,
        lang: selectedCountry,
        voice: selectedVoice,
        theme: voxTheme,
      });
      setVoxConfig(config);
    } catch (err: any) {
      setError(err.message || "Không thể sinh kịch bản Vox cho chủ đề này");
    } finally {
      setVoxGenerating(false);
    }
  };

  useEffect(() => {
    if (videoType === "vox") {
      if (voxSuggestions.length === 0) {
        loadVoxSuggestions(false);
      }
      if (voxConfig && (voxConfig.lang !== selectedCountry || (voxConfig.theme && voxConfig.theme !== voxTheme))) {
        const p = voxPrompt.trim() || voxConfig.topicTitle;
        if (p) {
          setVoxGenerating(true);
          generateVoxTopic({ prompt: p, lang: selectedCountry, voice: selectedVoice, theme: voxTheme })
            .then(setVoxConfig)
            .catch(console.error)
            .finally(() => setVoxGenerating(false));
        }
      }
    }
  }, [videoType, selectedCountry]);

  // Newspaper Suggestion & Handlers
  const loadNewspaperSuggestions = async (force = false, langOverride?: string) => {
    if (newspaperSuggesting && !force) return;
    setNewspaperSuggesting(true);
    const targetLang = langOverride || selectedCountry;
    try {
      const res = await suggestNewspaperTopics({ lang: targetLang, count: 10 });
      if (res.topics && res.topics.length > 0) {
        setNewspaperSuggestions(res.topics);
      }
    } catch (e: any) {
      console.warn("Failed to load newspaper suggestions:", e);
    } finally {
      setNewspaperSuggesting(false);
    }
  };

  const handleSelectNewspaperSuggestion = async (topic: NewspaperSuggestedTopic) => {
    setSelectedNewspaperTopicId(topic.id);
    const targetPrompt = topic.prompt || topic.title;
    setNewspaperPrompt(targetPrompt);
    setNewspaperGenerating(true);
    setError(null);
    try {
      const config = await generateNewspaperTopic({ prompt: targetPrompt, lang: selectedCountry, voice: selectedVoice });
      setNewspaperConfig(config);
    } catch (err: any) {
      setError(err.message || "Không thể sinh kịch bản Báo Cũ cho chủ đề này");
    } finally {
      setNewspaperGenerating(false);
    }
  };

  useEffect(() => {
    if (videoType === "newspaper") {
      if (newspaperSuggestions.length === 0) {
        loadNewspaperSuggestions(false);
      }
      if (newspaperConfig && newspaperConfig.lang !== selectedCountry) {
        const p = newspaperPrompt.trim() || newspaperConfig.headline;
        if (p) {
          setNewspaperGenerating(true);
          generateNewspaperTopic({ prompt: p, lang: selectedCountry, voice: selectedVoice })
            .then(setNewspaperConfig)
            .catch(console.error)
            .finally(() => setNewspaperGenerating(false));
        }
      }
    }
  }, [videoType, selectedCountry]);

  // Kinetic Suggestion & Handlers
  const loadKineticSuggestions = async (force = false, langOverride?: string) => {
    if (kineticSuggesting && !force) return;
    setKineticSuggesting(true);
    const targetLang = langOverride || selectedCountry;
    try {
      const res = await suggestKineticTopics({ lang: targetLang, count: 10 });
      if (res.topics && res.topics.length > 0) {
        setKineticSuggestions(res.topics);
      }
    } catch (e: any) {
      console.warn("Failed to load kinetic suggestions:", e);
    } finally {
      setKineticSuggesting(false);
    }
  };

  const handleSelectKineticSuggestion = async (topic: KineticSuggestedTopic) => {
    setSelectedKineticTopicId(topic.id);
    const targetPrompt = topic.prompt || topic.title;
    setKineticPrompt(targetPrompt);
    setKineticGenerating(true);
    setError(null);
    try {
      const config = await generateKineticTopic({ prompt: targetPrompt, lang: selectedCountry, voice: selectedVoice });
      setKineticConfig(config);
    } catch (err: any) {
      setError(err.message || "Không thể sinh kịch bản Kinetic cho chủ đề này");
    } finally {
      setKineticGenerating(false);
    }
  };

  useEffect(() => {
    if (videoType === "kinetic") {
      if (kineticSuggestions.length === 0) {
        loadKineticSuggestions(false);
      }
      if (kineticConfig && kineticConfig.lang !== selectedCountry) {
        const p = kineticPrompt.trim() || kineticConfig.headline;
        if (p) {
          setKineticGenerating(true);
          generateKineticTopic({ prompt: p, lang: selectedCountry, voice: selectedVoice })
            .then(setKineticConfig)
            .catch(console.error)
            .finally(() => setKineticGenerating(false));
        }
      }
    }
  }, [videoType, selectedCountry]);

  // Chalk Suggestion & Handlers
  const loadChalkSuggestions = async (force = false, langOverride?: string) => {
    if (chalkSuggesting && !force) return;
    setChalkSuggesting(true);
    const targetLang = langOverride || selectedCountry;
    try {
      const res = await suggestChalkTopics({ lang: targetLang, count: 10 });
      if (res.topics && res.topics.length > 0) {
        setChalkSuggestions(res.topics);
      }
    } catch (e: any) {
      console.warn("Failed to load chalk suggestions:", e);
    } finally {
      setChalkSuggesting(false);
    }
  };

  const handleSelectChalkSuggestion = async (topic: ChalkSuggestedTopic) => {
    setSelectedChalkTopicId(topic.id);
    const targetPrompt = topic.prompt || topic.title;
    setChalkPrompt(targetPrompt);
    setChalkGenerating(true);
    setError(null);
    try {
      const config = await generateChalkTopic({ prompt: targetPrompt, lang: selectedCountry, voice: selectedVoice });
      setChalkConfig(config);
    } catch (err: any) {
      setError(err.message || "Không thể sinh kịch bản Bản Đồ Phấn cho chủ đề này");
    } finally {
      setChalkGenerating(false);
    }
  };

  // Tier List Suggestion & Handlers
  const loadTierListSuggestions = async (force = false, langOverride?: string) => {
    if (tierListSuggesting && !force) return;
    setTierListSuggesting(true);
    const targetLang = langOverride || selectedCountry;
    try {
      const res = await suggestTierListTopics({ lang: targetLang, count: 8 });
      if (res && res.topics) {
        setTierListSuggestions(res.topics);
      }
    } catch (e) {
      console.warn("Failed to load tier list suggestions:", e);
    } finally {
      setTierListSuggesting(false);
    }
  };

  const handleSelectTierListSuggestion = async (topic: TierListSuggestedTopic) => {
    setSelectedTierListTopicId(topic.id);
    const targetPrompt = topic.prompt;
    setTierListPrompt(targetPrompt);
    setTierListGenerating(true);
    try {
      const config = await generateTierListTopic({ prompt: targetPrompt, lang: selectedCountry, voice: selectedVoice });
      setTierListConfig(config);
    } catch (e) {
      console.warn("Failed to generate tier list topic:", e);
    } finally {
      setTierListGenerating(false);
    }
  };

  // Wildlife Suggestion & Handlers
  const loadWildlifeSuggestions = async (force = false, langOverride?: string) => {
    if (wildlifeSuggesting && !force) return;
    setWildlifeSuggesting(true);
    const targetLang = langOverride || selectedCountry;
    try {
      const res = await suggestWildlifeTopics({ lang: targetLang, count: 8 });
      if (res && res.topics) {
        setWildlifeSuggestions(res.topics);
      }
    } catch (e) {
      console.warn("Failed to load wildlife suggestions:", e);
    } finally {
      setWildlifeSuggesting(false);
    }
  };

  const handleSelectWildlifeSuggestion = async (topic: WildlifeSuggestedTopic) => {
    setSelectedWildlifeTopicId(topic.id);
    const targetPrompt = topic.prompt;
    setWildlifePrompt(targetPrompt);
    setWildlifeGenerating(true);
    try {
      const config = await generateWildlifeTopic({ prompt: targetPrompt, lang: selectedCountry, voice: selectedVoice });
      setWildlifeConfig(config);
    } catch (e) {
      console.warn("Failed to generate wildlife topic:", e);
    } finally {
      setWildlifeGenerating(false);
    }
  };

  const handleGenerateWildlifeAi = async () => {
    if (!wildlifePrompt.trim() && !selectedWildlifeTopicId) return;
    setWildlifeGenerating(true);
    try {
      const config = await generateWildlifeTopic({
        prompt: wildlifePrompt.trim() || undefined,
        lang: selectedCountry,
        voice: selectedVoice,
      });
      setWildlifeConfig(config);
    } catch (err: any) {
      setError(err.message || "Không thể sinh kịch bản Động Vật Hoang Dã cho chủ đề này");
    } finally {
      setWildlifeGenerating(false);
    }
  };

  useEffect(() => {
    if (videoType === "chalk") {
      if (chalkSuggestions.length === 0) {
        loadChalkSuggestions(false);
      }
      if (chalkConfig && chalkConfig.lang !== selectedCountry) {
        const p = chalkPrompt.trim() || chalkConfig.headline || chalkConfig.topicTitle;
        if (p) {
          setChalkGenerating(true);
          generateChalkTopic({ prompt: p, lang: selectedCountry, voice: selectedVoice })
            .then(setChalkConfig)
            .catch(console.error)
            .finally(() => setChalkGenerating(false));
        }
      }
    }
    if (videoType === "tierlist") {
      if (tierListSuggestions.length === 0) {
        loadTierListSuggestions(false);
      }
      if (tierListConfig && tierListConfig.lang !== selectedCountry) {
        const p = tierListPrompt.trim() || tierListConfig.headline || tierListConfig.topicTitle;
        if (p) {
          setTierListGenerating(true);
          generateTierListTopic({ prompt: p, lang: selectedCountry, voice: selectedVoice })
            .then(setTierListConfig)
            .catch(console.error)
            .finally(() => setTierListGenerating(false));
        }
      }
    }
    if (videoType === "wildlife") {
      if (wildlifeSuggestions.length === 0) {
        loadWildlifeSuggestions(false);
      }
      if (wildlifeConfig && wildlifeConfig.lang !== selectedCountry) {
        const p = wildlifePrompt.trim() || wildlifeConfig.topicTitle;
        if (p) {
          setWildlifeGenerating(true);
          generateWildlifeTopic({ prompt: p, lang: selectedCountry, voice: selectedVoice })
            .then(setWildlifeConfig)
            .catch(console.error)
            .finally(() => setWildlifeGenerating(false));
        }
      }
    }
  }, [videoType, selectedCountry]);

  const playPreview = (e: React.MouseEvent, url: string) => {
    e.stopPropagation();
    if (playingAudio === url) {
      audioRef.current?.pause();
      setPlayingAudio(null);
      return;
    }
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.onended = () => setPlayingAudio(null);
    }
    audioRef.current.src = url;
    audioRef.current.volume = 0.5;
    audioRef.current.play().catch(() => {});
    setPlayingAudio(url);
  };

  // TTS Voice Preview state & handler
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const voiceAudioRef = useRef<HTMLAudioElement | null>(null);

  const handleToggleVoicePreview = (voiceId: string) => {
    if (playingVoice === voiceId) {
      voiceAudioRef.current?.pause();
      setPlayingVoice(null);
      return;
    }
    if (!voiceAudioRef.current) {
      voiceAudioRef.current = new Audio();
    }
    voiceAudioRef.current.src = `/api/tts/preview?voice=${encodeURIComponent(voiceId)}&lang=${encodeURIComponent(selectedCountry)}`;
    voiceAudioRef.current.onended = () => setPlayingVoice(null);
    voiceAudioRef.current.onerror = () => setPlayingVoice(null);
    voiceAudioRef.current.play().catch(() => setPlayingVoice(null));
    setPlayingVoice(voiceId);
  };

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      voiceAudioRef.current?.pause();
    };
  }, []);

  const [aiPrompt, setAiPrompt] = useState("");
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [isAiTopic, setIsAiTopic] = useState(false);

  // Image search & custom image states
  const [searchingImages, setSearchingImages] = useState(false);
  const [imageDrawerSide, setImageDrawerSide] = useState<"left" | "right" | null>(null);
  const [imageCandidates, setImageCandidates] = useState<ImageCandidate[]>([]);
  const [customImageUrl, setCustomImageUrl] = useState("");
  const [originalSvgLeft, setOriginalSvgLeft] = useState<any>(null);
  const [originalSvgRight, setOriginalSvgRight] = useState<any>(null);

  const applySpec = (s: TopicSpec) => {
    setSpec(s);
    setScriptText(s.captions.join("\n"));
    if (s.lang) {
      setSelectedCountry(s.lang);
    }
    if (s.voice) {
      setSelectedVoice(s.voice);
    } else if (s.lang) {
      const match = countries.find((c) => c.code === s.lang);
      if (match) setSelectedVoice(match.defaultVoice);
    }
    if (s.iconLeft?.type === "svg") setOriginalSvgLeft(s.iconLeft);
    if (s.iconRight?.type === "svg") setOriginalSvgRight(s.iconRight);
    setEditMode(false);
  };

  const handleCountryChange = (nextCountryCode: string) => {
    setSelectedCountry(nextCountryCode);
    const countryObj = countries.find((c) => c.code === nextCountryCode);
    const nextVoice = countryObj ? countryObj.defaultVoice : "";
    setSelectedVoice(nextVoice);
    if (videoType === "compare") {
      getTopics({ lang: nextCountryCode, category: selectedCat || undefined })
        .then((data) => setCuratedTopics(data.topics))
        .catch(() => {});
      if (spec) {
        setLoading(true);
        generateTopic({ slug: spec.slug, lang: nextCountryCode, voice: nextVoice })
          .then((s) => {
            applySpec({ ...s, lang: nextCountryCode, voice: nextVoice });
          })
          .catch((e) => setError(e.message))
          .finally(() => setLoading(false));
      }
    }
  };

  const handleVoiceChange = (nextVoiceId: string) => {
    setSelectedVoice(nextVoiceId);
    if (spec) {
      setSpec({
        ...spec,
        voice: nextVoiceId,
      });
    }
  };

  const handleAutoFindBothImages = async (mode: "real" | "ai" = "real") => {
    if (!spec) return;
    setSearchingImages(true);
    setError(null);
    try {
      const [resL, resR] = await Promise.all([
        searchImages(spec.labelLeft, mode),
        searchImages(spec.labelRight, mode),
      ]);
      const imgL = resL.images[0];
      const imgR = resR.images[0];
      setSpec({
        ...spec,
        iconLeft: imgL ? { type: "image", src: imgL.url, alt: spec.labelLeft } : spec.iconLeft,
        iconRight: imgR ? { type: "image", src: imgR.url, alt: spec.labelRight } : spec.iconRight,
      });
    } catch (e: any) {
      setError(`Lỗi tìm ảnh: ${e.message}`);
    } finally {
      setSearchingImages(false);
    }
  };

  const handleRestoreSvg = () => {
    if (!spec) return;
    setSpec({
      ...spec,
      iconLeft: originalSvgLeft || spec.iconLeft,
      iconRight: originalSvgRight || spec.iconRight,
    });
  };

  const handleOpenImageDrawer = async (side: "left" | "right") => {
    if (!spec) return;
    const label = side === "left" ? spec.labelLeft : spec.labelRight;
    setImageDrawerSide(side);
    setSearchingImages(true);
    setCustomImageUrl("");
    try {
      const res = await searchImages(label, "all");
      setImageCandidates(res.images || []);
    } catch (e: any) {
      setError(`Lỗi tải ảnh: ${e.message}`);
    } finally {
      setSearchingImages(false);
    }
  };

  const handleSelectCandidateImage = (url: string) => {
    if (!spec || !imageDrawerSide) return;
    const label = imageDrawerSide === "left" ? spec.labelLeft : spec.labelRight;
    setSpec({
      ...spec,
      [imageDrawerSide === "left" ? "iconLeft" : "iconRight"]: {
        type: "image",
        src: url,
        alt: label,
      },
    });
    setImageDrawerSide(null);
  };

  const handleAiResearch = async () => {
    setIsAiGenerating(true);
    setLoading(true);
    setError(null);
    try {
      const generated = await generateTopic({
        ai: true,
        category: selectedCat || undefined,
        prompt: aiPrompt.trim() || undefined,
        lang: selectedCountry,
        voice: selectedVoice,
      });
      applySpec(generated);
      setIsAiTopic(true);
    } catch (e: any) {
      setError(e.message || "AI research failed");
    } finally {
      setIsAiGenerating(false);
      setLoading(false);
    }
  };

  // Load categories, voices and topics on open
  useEffect(() => {
    if (!open) return;
    getVoices()
      .then((data) => {
        if (data.countries?.length) setCountries(data.countries);
      })
      .catch(() => {});

    getTopics()
      .then((data) => {
        setCategories(data.categories);
        setCuratedTopics(data.topics);
        // Automatically fetch an initial random topic
        loadRandomTopic(data.categories[0]?.id || "", "", selectedCountry, selectedVoice);
      })
      .catch((e) => setError(e.message));
  }, [open]);

  const loadRandomTopic = async (
    category = selectedCat,
    query = searchQuery,
    targetLang = selectedCountry,
    targetVoice = selectedVoice,
  ) => {
    setLoading(true);
    setError(null);
    try {
      const generated = await generateTopic({
        category: category || undefined,
        query: query || undefined,
        lang: targetLang,
        voice: targetVoice,
      });
      applySpec(generated);
      setIsAiTopic(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPredefined = async (slug: string) => {
    setLoading(true);
    setError(null);
    try {
      const generated = await generateTopic({
        slug,
        lang: selectedCountry,
        voice: selectedVoice,
      });
      applySpec(generated);
      setIsAiTopic(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApplyEditedScript = () => {
    if (!spec) return;
    const lines = scriptText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));
    if (lines.length !== 12) {
      setError(`Kịch bản cần đúng 12 dòng (hiện có ${lines.length} dòng)`);
      return;
    }
    setError(null);
    setSpec({
      ...spec,
      captions: lines,
      script: lines.join("\n"),
    });
    setEditMode(false);
  };

  useEffect(() => {
    if (!survivalConfig || survivalConfig.slug?.startsWith("survival-organs-")) {
      const cfg = getSurvivalConfig(selectedCountry);
      setSurvivalConfig(cfg);
      setSurvivalSlug(`survival-organs-${selectedCountry}`);
    }
  }, [selectedCountry]);

  const handleGenerateSurvival = async (customP?: string) => {
    const p = customP !== undefined ? customP : survivalPrompt;
    setSurvivalGenerating(true);
    setError(null);
    try {
      const res = await generateSurvivalTopic({
        prompt: p.trim() || undefined,
        lang: selectedCountry,
        voice: selectedVoice || currentCountry.defaultVoice,
      });
      setSurvivalConfig(res);
      if (res.slug) setSurvivalSlug(res.slug);
    } catch (e: any) {
      setError(e.message || "Lỗi tạo kịch bản sinh tồn bằng AI");
    } finally {
      setSurvivalGenerating(false);
    }
  };

  const SURVIVAL_SUGGESTIONS = [
    { label: "💧 Mất nước ở người", prompt: "Các cấp độ mất nước ở người" },
    { label: "❄️ Hạ thân nhiệt & Đóng băng", prompt: "Các cấp độ hạ thân nhiệt và đóng băng" },
    { label: "☢️ Bức xạ hạt nhân", prompt: "Các cấp độ nhiễm phóng xạ hạt nhân" },
    { label: "🌊 Áp suất đáy đại dương", prompt: "Độ sâu đại dương và áp suất nghẹt thở" },
    { label: "🧠 Thiếu ngủ 72 giờ", prompt: "Các giai đoạn thiếu ngủ của não bộ" },
    { label: "⛰️ Vùng tử thần thiếu oxy", prompt: "Vùng tử thần và cấp độ thiếu oxy ở độ cao cực hạn" },
    { label: "☠️ Nọc độc chết người", prompt: "Các chất kịch độc và nọc độc nguy hiểm nhất hành tinh" },
    { label: "🔥 Sốc nhiệt & Bầu ướt", prompt: "Các cấp độ sốc nhiệt và giới hạn nhiệt độ bầu ướt" },
  ];

  const SCIENCE_SUGGESTIONS = [
    { id: "peanut-stomp", name: "🥜 Cây Lạc & Giẫm Chân", prompt: "Vì sao phải dẫm ngả cây lạc để tăng gấp đôi sản lượng?" },
    { id: "chili-night-spray", name: "🌶️ Quả Ớt & Diệt Sâu Đêm", prompt: "Vì sao phải phun thuốc trừ sâu hại ớt vào ban đêm?" },
    { id: "banana-curved", name: "🍌 Quả Chuối Cong Vút", prompt: "Vì sao quả chuối lúc nhỏ mọc thẳng mà lớn lên lại cong vút lên trời?" },
    { id: "flytrap-count", name: "🪰 Cây Bắt Ruồi Đếm Đến 2", prompt: "Vì sao cây bắt ruồi phải đợi chạm lần thứ hai mới sập bẫy?" },
  ];

  const handleRandomSurvival = () => {
    const randomItem = SURVIVAL_SUGGESTIONS[Math.floor(Math.random() * SURVIVAL_SUGGESTIONS.length)];
    setSurvivalPrompt(randomItem.prompt);
    handleGenerateSurvival(randomItem.prompt);
  };

  const handleSelectSciencePreset = async (id: string) => {
    setScienceSelectedId(id);
    setScienceGenerating(true);
    setError(null);
    try {
      const t = await generateScienceTopic({ id, lang: selectedCountry });
      setScienceTopic(t);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setScienceGenerating(false);
    }
  };

  const handleGenerateAiScience = async () => {
    if (!sciencePrompt.trim()) return;
    setScienceGenerating(true);
    setError(null);
    try {
      const t = await generateScienceTopic({ prompt: sciencePrompt, lang: selectedCountry });
      setScienceTopic(t);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setScienceGenerating(false);
    }
  };

  const handleCreate = () => {
    if (videoType === "vox") {
      setCreating(true);
      const cfg = voxConfig;
      if (!cfg) return;
      const finalSlug = (cfg.slug || `vox-topic-${selectedCountry}`)
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-");
      const voxSpec: TopicSpec = {
        type: "vox",
        slug: finalSlug,
        lang: selectedCountry,
        voice: selectedVoice || currentCountry.defaultVoice,
        title: cfg.topicTitle,
        labelLeft: "Vox",
        labelRight: "Collage",
        category: "vox",
        message: `${cfg.topicTitle} — ${cfg.eyebrow}`,
        captions: (cfg.beats || []).map((b) => b.line),
        spoken: (cfg.beats || []).map((b) => b.line),
        script: cfg.fullScriptHtml,
        bgmTrack,
        bgmVolume,
        enableSfx,
        voxConfig: { ...cfg, theme: voxTheme },
      };
      onCreate(voxSpec, { target: 65, render: alsoRender });
      onClose();
      return;
    }

    if (videoType === "newspaper") {
      setCreating(true);
      const cfg = newspaperConfig;
      if (!cfg) return;
      const finalSlug = (cfg.slug || `newspaper-topic-${selectedCountry}`)
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-");
      const newsSpec: TopicSpec = {
        type: "newspaper",
        slug: finalSlug,
        lang: selectedCountry,
        voice: selectedVoice || currentCountry.defaultVoice,
        title: cfg.headline,
        labelLeft: cfg.publication || "Chronicle",
        labelRight: "Investigation",
        category: "newspaper",
        message: `${cfg.headline} — ${cfg.subheadline}`,
        captions: (cfg.sections || []).map((s) => s.spoken),
        spoken: (cfg.sections || []).map((s) => s.spoken),
        script: cfg.fullScriptHtml,
        bgmTrack,
        bgmVolume,
        enableSfx,
        newspaperConfig: cfg,
      };
      onCreate(newsSpec, { target: 65, render: alsoRender });
      onClose();
      return;
    }

    if (videoType === "kinetic") {
      setCreating(true);
      const cfg = kineticConfig;
      if (!cfg) return;
      const finalSlug = (cfg.slug || `kinetic-topic-${selectedCountry}`)
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-");
      const kineticSpec: TopicSpec = {
        type: "kinetic",
        slug: finalSlug,
        lang: selectedCountry,
        voice: selectedVoice || currentCountry.defaultVoice,
        title: cfg.headline,
        labelLeft: cfg.series || "Mental Model",
        labelRight: cfg.code || "SYSTEM",
        category: "kinetic",
        message: `${cfg.headline} — ${cfg.punchline}`,
        captions: (cfg.beats || []).map((b) => b.spoken),
        spoken: (cfg.beats || []).map((b) => b.spoken),
        script: cfg.fullScriptHtml,
        bgmTrack,
        bgmVolume,
        enableSfx,
        kineticConfig: cfg,
      };
      onCreate(kineticSpec, { target: 65, render: alsoRender });
      onClose();
      return;
    }

    if (videoType === "chalk") {
      setCreating(true);
      const cfg = chalkConfig;
      if (!cfg) return;
      const finalSlug = (cfg.slug || `chalk-topic-${selectedCountry}`)
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-");
      const chalkSpec: TopicSpec = {
        type: "chalk",
        slug: finalSlug,
        lang: selectedCountry,
        voice: selectedVoice || currentCountry.defaultVoice,
        title: cfg.topicTitle,
        labelLeft: cfg.headline || "Địa Chính Trị",
        labelRight: "Bản Đồ Bảng Phấn",
        category: "chalk",
        message: `${cfg.topicTitle} — ${cfg.headline || ""}`,
        captions: (cfg.scenes || []).map((s) => s.line),
        spoken: (cfg.scenes || []).map((s) => s.line),
        script: (cfg.scenes || []).map((s) => `### ${s.header}\n${s.line}`).join("\n\n"),
        bgmTrack,
        bgmVolume,
        enableSfx,
        chalkConfig: cfg,
      };
      onCreate(chalkSpec, { target: 65, render: alsoRender });
      onClose();
      return;
    }

    if (videoType === "tierlist") {
      setCreating(true);
      const cfg = tierListConfig;
      if (!cfg) return;
      const finalSlug = (cfg.slug || `tierlist-${selectedCountry}`)
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-");
      const tierListSpec: TopicSpec = {
        type: "tierlist",
        slug: finalSlug,
        lang: selectedCountry,
        voice: selectedVoice || currentCountry.defaultVoice,
        title: cfg.topicTitle,
        labelLeft: "TIER LIST",
        labelRight: "SSS TO D",
        category: "tierlist",
        message: `${cfg.topicTitle} — ${cfg.headline || ""}`,
        captions: (cfg.items || []).map((it) => `${it.name}: Bậc ${it.tier}`),
        spoken: (cfg.items || []).map((it) => `${it.hook || ''} ${it.review || ''} ${it.verdict || ''}`),
        script: (cfg.items || []).map((it) => `### ${it.name} (${it.tier})\n${it.review}\n=> ${it.verdict}`).join("\n\n"),
        bgmTrack,
        bgmVolume,
        enableSfx,
        tierListConfig: cfg,
      };
      onCreate(tierListSpec, { target: 65, render: alsoRender });
      onClose();
      return;
    }

    if (videoType === "wildlife") {
      setCreating(true);
      const cfg = wildlifeConfig;
      if (!cfg) return;
      const finalSlug = (cfg.slug || `wildlife-${selectedCountry}`)
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-");
      const wildlifeSpec: TopicSpec = {
        type: "wildlife",
        slug: finalSlug,
        lang: selectedCountry,
        voice: selectedVoice || currentCountry.defaultVoice,
        title: cfg.topicTitle,
        labelLeft: cfg.latinName || "Động Vật Hoang Dã",
        labelRight: "Hồ Sơ Sinh Tồn",
        category: "wildlife",
        message: `${cfg.topicTitle} — ${cfg.latinName || ""}`,
        captions: (cfg.scenes || []).map((s) => s.line),
        spoken: (cfg.scenes || []).map((s) => s.line),
        script: (cfg.scenes || []).map((s) => `### ${s.badge || 'Cảnh'}\n${s.line}`).join("\n\n"),
        bgmTrack,
        bgmVolume,
        enableSfx,
        wildlifeConfig: cfg,
      };
      onCreate(wildlifeSpec, { target: 52, render: alsoRender });
      onClose();
      return;
    }

    if (videoType === "mystery") {
      setCreating(true);
      const cfg = mysteryConfig;
      if (!cfg) return;
      const finalSlug = (cfg.slug || `mystery-topic-${selectedCountry}`)
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-");
      const mysterySpec: TopicSpec = {
        type: "mystery",
        slug: finalSlug,
        lang: selectedCountry,
        voice: selectedVoice || currentCountry.defaultVoice,
        title: cfg.topicTitle,
        labelLeft: "Mystery",
        labelRight: "Archive",
        category: "mystery",
        message: `${cfg.topicTitle} — ${cfg.eyebrow}`,
        captions: (cfg.scenes || []).map((s) => s.line),
        spoken: (cfg.scenes || []).map((s) => s.line),
        script: cfg.fullScriptHtml,
        mysteryConfig: cfg,
      };
      onCreate(mysterySpec, { target: 65, render: alsoRender });
      onClose();
      return;
    }

    if (videoType === "science") {
      setCreating(true);
      const t = scienceTopic;
      if (!t) return;
      const finalSlug = `science-${t.id}-${selectedCountry}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
      const scienceSpec: TopicSpec = {
        type: "science",
        slug: finalSlug,
        lang: selectedCountry,
        title: t.title,
        labelLeft: t.characters.charA?.name || "Char A",
        labelRight: t.characters.charB?.name || "Char B",
        category: t.category || "plants",
        message: `${t.title} — ${t.question}`,
        captions: (t.dialogues || []).map((d) => d.text),
        spoken: (t.dialogues || []).map((d) => d.text),
        script: (t.dialogues || []).map((d) => `[${d.speaker}]: ${d.text}`).join("\n"),
        bgmTrack,
        bgmVolume,
        enableSfx,
        scienceConfig: t,
      };
      onCreate(scienceSpec, { target: 45, render: alsoRender });
      onClose();
      return;
    }

    if (videoType === "survival") {
      setCreating(true);
      const cfg = survivalConfig || getSurvivalConfig(selectedCountry);
      const finalSlug = (survivalSlug.trim() || cfg.slug || `survival-organs-${selectedCountry}`)
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-");
      const survivalSpec: TopicSpec = {
        type: "survival",
        slug: finalSlug,
        lang: selectedCountry,
        voice: selectedVoice || currentCountry.defaultVoice,
        title: cfg.title,
        labelLeft: "Survival",
        labelRight: "Escalation",
        category: "survival",
        message: `${cfg.title} — ${cfg.prologueSpoken}`,
        captions: [
          cfg.prologueSpoken,
          ...cfg.tiers.map((t) => t.caption),
          cfg.ctaSpoken,
        ],
        spoken: [
          cfg.prologueSpoken,
          ...cfg.tiers.map((t) => t.caption),
          cfg.ctaSpoken,
        ],
        script: [
          cfg.prologueSpoken,
          ...cfg.tiers.map((t) => t.caption),
          cfg.ctaSpoken,
        ].join("\n"),
        bgmTrack,
        bgmVolume,
        enableSfx,
        survivalConfig: cfg,
      };
      onCreate(survivalSpec, { target: 65, render: alsoRender });
      onClose();
      return;
    }

    if (!spec) return;
    setCreating(true);
    if (isGlobalBatch && onBatchGlobal) {
      onBatchGlobal(spec.labelLeft + " vs " + spec.labelRight, {
        target: targetDuration,
        render: alsoRender,
      });
      onClose();
      return;
    }
    const finalSpec: TopicSpec = {
      ...spec,
      lang: selectedCountry,
      voice: selectedVoice || spec.voice,
      bgmTrack,
      bgmVolume,
      enableSfx,
    };
    onCreate(finalSpec, { target: targetDuration, render: alsoRender });
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="relative my-6 flex max-h-[92vh] w-full max-w-5xl flex-col rounded-2xl border border-line bg-ground shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-6 py-4 bg-ground/80 backdrop-blur shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-terra text-surface-2 shadow-2xs">
              {videoType === "survival" ? (
                <Skull className="size-5" aria-hidden="true" />
              ) : videoType === "vox" ? (
                <Scissors className="size-5" aria-hidden="true" />
              ) : videoType === "newspaper" ? (
                <Newspaper className="size-5" aria-hidden="true" />
              ) : videoType === "chalk" ? (
                <Globe className="size-5" aria-hidden="true" />
              ) : videoType === "kinetic" ? (
                <Zap className="size-5" aria-hidden="true" />
              ) : videoType === "tierlist" ? (
                <Trophy className="size-5" aria-hidden="true" />
              ) : videoType === "wildlife" ? (
                <PawPrint className="size-5" aria-hidden="true" />
              ) : (
                <Sparkles className="size-5" aria-hidden="true" />
              )}
            </span>
            <div>
              <h2 id="modal-title" className="text-base sm:text-lg font-black tracking-tight text-ink">
                {videoType === "survival"
                  ? "Tạo video mới — Thử thách Sinh tồn (Mr. Incredible Uncanny)"
                  : videoType === "mystery"
                  ? "Tạo video mới — Bí Ẩn & Kỳ Án (True Crime / Mystery Archive)"
                  : videoType === "science"
                  ? "Tạo video mới — Khoa Học Nhân Hoá"
                  : videoType === "vox"
                  ? "Tạo video mới — Vox Motion Collage (Bàn Làm Việc & Giấy Dán)"
                  : videoType === "newspaper"
                  ? "Tạo video mới — Báo Cũ & Hồ Sơ Điều Tra (Retro Newsprint)"
                  : videoType === "chalk"
                  ? "Tạo video mới — Bản Đồ Phấn Địa Chính Trị (>60s Chalkboard Map)"
                  : videoType === "kinetic"
                  ? "Tạo video mới — Dark Cyber Kinetic Typography (Mô Hình Tư Duy)"
                  : videoType === "tierlist"
                  ? "Tạo video mới — Tier List Xếp Hạng Bậc SSS-D (Slam Khay Rung Chấn)"
                  : videoType === "wildlife"
                  ? "Tạo video mới — Thế Giới Động Vật Hoang Dã (AI Wildlife Documentary)"
                  : "Tạo video mới — So sánh kiến thức đa quốc gia"}
              </h2>
              <p className="text-xs text-ink-dim">
                {videoType === "survival"
                  ? "10 Cấp độ tăng tiến từ an toàn đến tuyệt mệnh, đồng bộ biểu cảm kinh dị & cyber radar"
                  : videoType === "mystery"
                  ? "Tái hiện sự kiện kỳ án, thuyết âm mưu & lịch sử đen tối với phong cách hoạt hoạ tài liệu"
                  : videoType === "science"
                  ? "Hoạt hình sinh học vui nhộn, giải thích hiện tượng tự nhiên qua góc nhìn nhân hoá"
                  : videoType === "vox"
                  ? "Đồ họa thủ công Vox/Johnny Harris: Giấy kraft, sticker viền trắng, bút dạ quang & ghim băng dính"
                  : videoType === "newspaper"
                  ? "Báo chí điều tra thập niên cũ: Giấy ố vàng, tiêu đề to bản, con dấu đóng cộp & khoanh bút đỏ"
                  : videoType === "chalk"
                  ? "Bản đồ bảng đen Johnny Harris & RealLifeLore: Bảng phấn mờ, nét vẽ tay SVG, zoom camera & điểm nghẽn toàn cầu"
                  : videoType === "kinetic"
                  ? "Cyberpunk tối giản: Nền đen OLED, chữ động khổng lồ, radar HUD & khối wireframe 3D"
                  : videoType === "tierlist"
                  ? "Xếp hạng 5 item bậc SSS đến D, sân khấu đánh giá, hiệu ứng đập khay chấn động màn hình & âm thanh slam kịch tính"
                  : videoType === "wildlife"
                  ? "Phim tài liệu động vật AI: Khung ngắm Telephoto [400mm F/2.8], tọa độ sinh thái & 4 chỉ số sinh tồn (Tốc độ, Lực cắn, IQ, Tỉ lệ săn)"
                  : "Tự động thiết kế 12 nhịp, chuẩn hóa bản sắc thị trường & linh vật theo quốc gia"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="rounded-lg p-1.5 text-ink-dim hover:bg-surface-2 hover:text-ink cursor-pointer transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4 scroll-thin">
          {error && (
            <div className="rounded-xl border border-terra/50 bg-terra-bright/15 px-4 py-3 text-sm text-terra font-medium">
              {error}
            </div>
          )}

          {/* Categorized Template Gallery: FE Expert Redesign */}
          <div className="space-y-3">
            {/* Category Selector Tabs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 rounded-2xl border border-line bg-surface-2 p-1.5 shadow-xs">
              {/* "Tất cả" tab */}
              <button
                type="button"
                onClick={() => handleSelectCategory("all")}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-xl py-2 px-3 text-xs font-bold transition-all cursor-pointer relative",
                  activeCategory === "all"
                    ? "bg-surface text-ink shadow-sm border border-line-strong ring-1 ring-gold/30"
                    : "text-ink-soft hover:text-ink hover:bg-surface/50",
                )}
              >
                <span className="text-base">🌟</span>
                <div className="text-left leading-tight">
                  <div className="flex items-center gap-1.5">
                    <span className="font-black tracking-tight">Tất cả ({TEMPLATES_LIST.length})</span>
                    <span className="inline-flex items-center rounded-full bg-gold/20 text-gold px-1.5 py-0.2 text-[9px] font-black">
                      3 Mới
                    </span>
                  </div>
                  <div className="text-[10px] font-normal text-ink-dim hidden sm:block">
                    Tất cả 9 thể loại
                  </div>
                </div>
              </button>

              {(Object.keys(TEMPLATE_CATEGORIES) as TemplateCategory[]).map((catKey) => {
                const cat = TEMPLATE_CATEGORIES[catKey];
                const isActiveCat = activeCategory === catKey;
                const catTemplates = TEMPLATES_LIST.filter((t) => t.category === catKey);
                const hasSelectedTemplate = catTemplates.some((t) => t.id === videoType);
                const hasNew = catTemplates.some((t) => t.isNew);

                return (
                  <button
                    key={catKey}
                    type="button"
                    onClick={() => handleSelectCategory(catKey)}
                    className={cn(
                      "flex items-center justify-center gap-2 rounded-xl py-2 px-3 text-xs font-bold transition-all cursor-pointer relative",
                      isActiveCat
                        ? "bg-surface text-ink shadow-sm border border-line-strong"
                        : "text-ink-soft hover:text-ink hover:bg-surface/50",
                    )}
                  >
                    <span className="text-base">{cat.icon}</span>
                    <div className="text-left leading-tight">
                      <div className="flex items-center gap-1.5">
                        <span className="font-black tracking-tight">{cat.label.split(" ")[0]} ({catTemplates.length})</span>
                        {hasNew && (
                          <span className="size-1.5 rounded-full bg-gold animate-pulse"></span>
                        )}
                        {hasSelectedTemplate && (
                          <span className="size-1.5 rounded-full bg-terra"></span>
                        )}
                      </div>
                      <div className="text-[10px] font-normal text-ink-dim hidden sm:block truncate max-w-[120px]">
                        {catTemplates.map((t) => t.shortName).join(" · ")}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Template Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {(activeCategory === "all"
                ? TEMPLATES_LIST
                : TEMPLATES_LIST.filter((t) => t.category === activeCategory)
              ).map((t) => {
                const isSelected = videoType === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => handleSelectTemplate(t.id)}
                    className={cn(
                      "group relative flex flex-col justify-between rounded-2xl border p-3.5 text-left transition-all duration-200 cursor-pointer shadow-2xs hover:shadow-xs",
                      isSelected
                        ? "border-terra bg-surface shadow-[0_0_0_2px_var(--color-terra)] ring-1 ring-terra/30"
                        : t.isNew
                        ? "border-gold/40 bg-gold/5 hover:border-gold hover:bg-surface-2"
                        : "border-line bg-surface hover:border-line-strong hover:bg-surface-2",
                    )}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <span className={cn(
                            "grid size-9 place-items-center rounded-xl text-xl group-hover:scale-105 transition-transform",
                            t.isNew ? "bg-gold/20 text-gold" : "bg-surface-2"
                          )}>
                            {t.icon}
                          </span>
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-black text-sm text-ink leading-tight">
                                {t.name}
                              </span>
                              {t.isNew && (
                                <span className="inline-flex items-center gap-0.5 rounded-full bg-gold/20 text-gold border border-gold/40 px-1.5 py-0.2 text-[9.5px] font-black tracking-tight">
                                  ✨ MỚI
                                </span>
                              )}
                            </div>
                            <span className="inline-block font-mono text-[10.5px] text-ink-dim">
                              ⏱️ {t.duration}
                            </span>
                          </div>
                        </div>

                        {isSelected ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-terra px-2 py-0.5 text-[10px] font-bold text-surface-2 shadow-2xs shrink-0">
                            <CheckCircle2 className="size-3" />
                            Đang chọn
                          </span>
                        ) : (
                          <span className="text-[11px] font-semibold text-ink-dim opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            Chọn →
                          </span>
                        )}
                      </div>

                      <p className="mt-2.5 text-xs text-ink-soft leading-relaxed">
                        {t.desc}
                      </p>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-line/60 flex items-center justify-between text-[11px] font-mono text-ink-dim">
                      <span className="flex items-center gap-1">
                        <span>Định dạng:</span>
                        <strong className="text-ink">{t.shortName}</strong>
                      </span>
                      <span className={cn("font-bold text-[10.5px]", isSelected ? "text-terra" : t.isNew ? "text-gold" : "text-ink-dim")}>
                        {isSelected ? "ACTIVE" : t.isNew ? "✨ MẪU MỚI" : "CLICK ĐỂ CHỌN"}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Selected Format Highlight Banner */}
            {(() => {
              const activeT = TEMPLATES_LIST.find((t) => t.id === videoType) || TEMPLATES_LIST[0];
              return (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-terra/30 bg-terra-bright/10 px-3.5 py-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{activeT.icon}</span>
                    <span className="font-bold text-ink">
                      Format đang áp dụng: <strong className="text-terra">{activeT.name}</strong>
                    </span>
                    <span className="text-line">·</span>
                    <span className="text-ink-soft">{activeT.desc}</span>
                  </div>
                  <span className="font-mono text-[11px] font-bold text-terra">
                    Khung chuẩn: {activeT.duration}
                  </span>
                </div>
              );
            })()}
          </div>

          {videoType === "compare" ? (
            <div className="space-y-4">
              {/* Top Configuration Grid: 3 Clean Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Card 1: Country & Market */}
            <div className="rounded-xl border border-line bg-surface p-3 shadow-2xs">
              <div className="flex items-center gap-1.5 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-dim">
                <Globe className="size-3.5 text-terra" />
                <span>Quốc gia & Thị trường</span>
              </div>
              <select
                id="country-select"
                value={selectedCountry}
                onChange={(e) => handleCountryChange(e.target.value)}
                className="w-full h-9 rounded-lg border border-line-strong bg-surface-2 px-2.5 text-xs font-bold text-ink cursor-pointer focus:outline-none focus:border-terra"
              >
                {countries.map((c) => (
                  <option key={c.code} value={c.code} className="bg-ground text-ink">
                    {c.flag} {c.country} ({c.langName})
                  </option>
                ))}
              </select>
            </div>

            {/* Card 2: Voice Selector */}
            <div className="rounded-xl border border-line bg-surface p-3 shadow-2xs">
              <div className="flex items-center justify-between gap-1.5 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-dim">
                <span className="flex items-center gap-1.5">
                  <Volume2 className="size-3.5 text-sage" />
                  <span>Giọng đọc (CapCut 🎬 / Edge)</span>
                </span>
                <button
                  type="button"
                  onClick={() => handleToggleVoicePreview(selectedVoice)}
                  title="Nghe thử giọng đọc này"
                  className="flex items-center gap-1 rounded bg-surface-2 hover:bg-surface-3 px-1.5 py-0.5 text-[10px] font-semibold text-ink cursor-pointer border border-line transition-colors"
                >
                  {playingVoice === selectedVoice ? (
                    <Pause className="size-3 text-terra animate-pulse" />
                  ) : (
                    <Play className="size-3 text-sage" />
                  )}
                  <span>{playingVoice === selectedVoice ? "Dừng" : "Nghe thử"}</span>
                </button>
              </div>
              <select
                id="voice-select"
                value={selectedVoice}
                onChange={(e) => handleVoiceChange(e.target.value)}
                className="w-full h-9 rounded-lg border border-line-strong bg-surface-2 px-2.5 text-xs font-bold text-ink cursor-pointer focus:outline-none focus:border-terra truncate"
              >
                {currentCountry?.voices.map((v) => (
                  <option key={v.id} value={v.id} className="bg-ground text-ink">
                    {v.provider === "capcut" ? "🎬 " : ""}{v.gender === "male" ? "👨" : "👩"} {v.name} ({v.desc})
                  </option>
                ))}
              </select>
            </div>

            {/* Card 3: Mascot & Visual Theme */}
            <div className="rounded-xl border border-line bg-surface p-3 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-ink-dim">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="size-3.5 text-gold" />
                  <span>Linh vật & Giao diện</span>
                </span>
                <span className="rounded bg-sage/20 px-1.5 py-0.5 text-[9px] font-bold text-sage">
                  WCAG AA ✓
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2.5">
                <span className="text-2xl shrink-0">{currentMascot.flag}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-black text-ink">{currentMascot.mascotName}</div>
                  <div className="truncate text-[10px] text-ink-dim">{currentMascot.themeName}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Topic Selection Hub: 2 Segmented Tabs */}
          <div className="rounded-xl border border-line bg-surface-2 p-4 shadow-2xs space-y-3">
            {/* Segmented Tab Header */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab("curated")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                    activeTab === "curated"
                      ? "bg-terra text-surface-2 shadow-xs"
                      : "text-ink-dim hover:text-ink hover:bg-surface"
                  )}
                >
                  <Dice5 className="size-3.5" />
                  <span>Chủ đề tuyển chọn ({curatedTopics.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("ai")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                    activeTab === "ai"
                      ? "bg-gold text-surface-2 shadow-xs"
                      : "text-ink-dim hover:text-ink hover:bg-surface"
                  )}
                >
                  <Sparkles className="size-3.5" />
                  <span>AI Tự nghiên cứu (Gemini)</span>
                </button>
              </div>

              {activeTab === "curated" && (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={loading}
                  onClick={() => loadRandomTopic()}
                  className="h-8 px-3 text-xs font-bold text-ink hover:border-terra shadow-2xs cursor-pointer"
                >
                  {loading ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Dice5 className="size-3.5 text-terra" />
                  )}
                  <span>Đổi ngẫu nhiên</span>
                </Button>
              )}
            </div>

            {activeTab === "curated" ? (
              <div className="space-y-3">
                {/* Category Pills (horizontal scroll container, no wrapping mess) */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scroll-thin">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCat("");
                      loadRandomTopic("", searchQuery);
                    }}
                    className={cn(
                      "shrink-0 rounded-lg px-3 py-1.5 text-xs transition-all cursor-pointer",
                      selectedCat === ""
                        ? "bg-terra text-surface-2 font-bold shadow-xs"
                        : "bg-surface border border-line text-ink-soft hover:text-ink hover:border-line-strong"
                    )}
                  >
                    🌐 Tất cả
                  </button>
                  {categories.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setSelectedCat(c.id);
                        loadRandomTopic(c.id, searchQuery);
                      }}
                      className={cn(
                        "shrink-0 rounded-lg px-3 py-1.5 text-xs transition-all cursor-pointer",
                        selectedCat === c.id
                          ? "bg-terra text-surface-2 font-bold shadow-xs"
                          : "bg-surface border border-line text-ink-soft hover:text-ink hover:border-line-strong"
                      )}
                    >
                      {CATEGORY_ICONS[c.id] || "📁"} {c.label}
                    </button>
                  ))}
                </div>

                {/* Search Bar */}
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-dim" />
                  <input
                    type="text"
                    placeholder="Lọc chủ đề nhanh (vd: bia, trà, tàu điện, văn hoá...)..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-8 w-full rounded-lg border border-line bg-surface pl-8 pr-3 text-xs text-ink placeholder:text-ink-dim focus:border-terra focus:outline-none"
                  />
                </div>

                {/* Quick Topics Grid */}
                <div className="grid max-h-36 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 overflow-y-auto scroll-thin p-0.5">
                  {curatedTopics
                    .filter(
                      (t) =>
                        (!selectedCat || t.category === selectedCat) &&
                        (!searchQuery ||
                          (t.slug + t.labelLeft + t.labelRight + t.message)
                            .toLowerCase()
                            .includes(searchQuery.toLowerCase()))
                    )
                    .map((t) => (
                      <button
                        key={t.slug}
                        type="button"
                        onClick={() => handleSelectPredefined(t.slug)}
                        className={cn(
                          "flex items-center justify-between rounded-lg border p-2 text-left transition-all cursor-pointer",
                          spec?.slug === t.slug
                            ? "border-terra bg-terra-bright/15 font-bold text-terra shadow-2xs"
                            : "border-line bg-surface text-ink hover:border-line-strong hover:bg-surface-2"
                        )}
                      >
                        <div className="min-w-0 flex-1 pr-1.5">
                          <div className="truncate text-xs font-bold">
                            {t.labelLeft} vs {t.labelRight}
                          </div>
                          <div className="truncate text-[10px] text-ink-dim">{t.message}</div>
                        </div>
                        {spec?.slug === t.slug && (
                          <CheckCircle2 className="size-3.5 text-terra shrink-0" />
                        )}
                      </button>
                    ))}
                </div>
              </div>
            ) : (
              /* AI Tab */
              <div className="space-y-3 rounded-xl border border-gold/40 bg-gold/10 p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="size-4 text-gold" />
                    <span className="text-xs font-bold text-ink">
                      Nghiên cứu kiến thức cho thị trường {currentCountry?.country} {currentCountry?.flag}
                    </span>
                  </div>
                  <span className="text-[10px] text-ink-dim font-medium">
                    Gemini Flash · Tự dịch sang {currentCountry?.langName} · Chuẩn 12 nhịp
                  </span>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    type="text"
                    placeholder={`Nhập định hướng chủ đề cho thị trường ${currentCountry?.country} (hoặc để trống cho AI tự đề xuất)...`}
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !loading) {
                        e.preventDefault();
                        handleAiResearch();
                      }
                    }}
                    disabled={loading}
                    className="h-9 flex-1 rounded-lg border border-line-strong bg-surface px-3 text-xs text-ink placeholder:text-ink-dim focus:border-gold focus:outline-none"
                  />
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={loading}
                    onClick={handleAiResearch}
                    className="shrink-0 bg-gold text-surface-2 hover:bg-gold-bright font-bold cursor-pointer"
                  >
                    {isAiGenerating ? (
                      <>
                        <Loader2 className="size-3.5 animate-spin" />
                        <span>Gemini đang nghiên cứu...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="size-3.5" />
                        <span>✨ AI Nghiên cứu chủ đề</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Spec details card (Zone B Visuals + Script) */}
          {spec && (
            <div className="space-y-4">
              {/* Visual Toolbar & Angle Banner */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 text-xs shadow-2xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-bold text-ink-soft shrink-0">Góc so sánh:</span>
                  <span className="font-medium text-ink italic truncate">"{spec.message}"</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={searchingImages}
                    onClick={() => handleAutoFindBothImages("real")}
                    className="h-7 text-xs font-semibold text-ink hover:text-ink-strong cursor-pointer"
                  >
                    {searchingImages ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Camera className="size-3 text-sage" />
                    )}
                    📸 Tìm ảnh thật
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={searchingImages}
                    onClick={() => handleAutoFindBothImages("ai")}
                    className="h-7 text-xs font-semibold text-ink hover:text-ink-strong cursor-pointer"
                  >
                    <Sparkles className="size-3 text-gold" />
                    🎨 Sinh ảnh AI
                  </Button>
                  {(spec.iconLeft?.type === "image" || spec.iconRight?.type === "image") && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleRestoreSvg}
                      className="h-7 text-xs text-ink-dim hover:text-ink cursor-pointer"
                    >
                      <Layers className="size-3" />
                      SVG gốc
                    </Button>
                  )}
                </div>
              </div>

              {/* Side-by-side cards with center VS badge */}
              <div className="relative grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Left Card: Concept A */}
                <Card className="flex items-center justify-between gap-3 p-3.5 border-line">
                  <div className="flex items-center gap-3 min-w-0">
                    {spec.iconLeft?.type === "image" ? (
                      <img
                        src={spec.iconLeft.src}
                        alt={spec.labelLeft}
                        className="size-14 shrink-0 rounded-lg object-cover border border-line shadow-2xs"
                      />
                    ) : (
                      <div
                        className="size-14 shrink-0 overflow-hidden rounded-lg bg-panel p-1.5"
                        dangerouslySetInnerHTML={{ __html: spec.iconLeft?.svg || "" }}
                      />
                    )}
                    <div className="min-w-0">
                      <span className="font-mono text-[10px] uppercase text-sage font-bold">Khái niệm A</span>
                      <h3 className="truncate text-base font-black text-ink">{spec.labelLeft}</h3>
                      <span className="text-[10px] text-ink-dim">
                        {spec.iconLeft?.type === "image" ? "Ảnh chụp / AI" : "Biểu trưng SVG"}
                      </span>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleOpenImageDrawer("left")}
                    className="h-7 shrink-0 text-xs text-ink-soft hover:text-ink cursor-pointer"
                  >
                    <Camera className="size-3 mr-1" />
                    Đổi ảnh
                  </Button>
                </Card>

                {/* Center VS Badge */}
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 hidden sm:flex size-8 items-center justify-center rounded-full border-2 border-ground bg-terra text-surface-2 font-black text-[11px] shadow-md z-10">
                  VS
                </div>

                {/* Right Card: Concept B */}
                <Card className="flex items-center justify-between gap-3 p-3.5 border-line">
                  <div className="flex items-center gap-3 min-w-0">
                    {spec.iconRight?.type === "image" ? (
                      <img
                        src={spec.iconRight.src}
                        alt={spec.labelRight}
                        className="size-14 shrink-0 rounded-lg object-cover border border-line shadow-2xs"
                      />
                    ) : (
                      <div
                        className="size-14 shrink-0 overflow-hidden rounded-lg bg-panel p-1.5"
                        dangerouslySetInnerHTML={{ __html: spec.iconRight?.svg || "" }}
                      />
                    )}
                    <div className="min-w-0">
                      <span className="font-mono text-[10px] uppercase text-terra font-bold">Khái niệm B</span>
                      <h3 className="truncate text-base font-black text-ink">{spec.labelRight}</h3>
                      <span className="text-[10px] text-ink-dim">
                        {spec.iconRight?.type === "image" ? "Ảnh chụp / AI" : "Biểu trưng SVG"}
                      </span>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleOpenImageDrawer("right")}
                    className="h-7 shrink-0 text-xs text-ink-soft hover:text-ink cursor-pointer"
                  >
                    <Camera className="size-3 mr-1" />
                    Đổi ảnh
                  </Button>
                </Card>
              </div>

              {/* Candidate image drawer if open */}
              {imageDrawerSide && (
                <div className="rounded-xl border border-line bg-surface p-4 text-xs shadow-2xs">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Camera className="size-4 text-terra" />
                      <span className="font-bold text-ink">
                        Chọn ảnh cho {imageDrawerSide === "left" ? spec.labelLeft : spec.labelRight}:
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setImageDrawerSide(null)}
                      className="rounded p-1 text-ink-dim hover:bg-surface-2 hover:text-ink cursor-pointer"
                    >
                      <X className="size-4" />
                    </button>
                  </div>

                  {searchingImages ? (
                    <div className="flex items-center justify-center gap-2 py-6 text-ink-dim">
                      <Loader2 className="size-4 animate-spin" />
                      <span>Đang tìm kiếm ảnh trên Wikipedia & AI...</span>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                      {imageCandidates.map((c, i) => (
                        <div
                          key={i}
                          onClick={() => handleSelectCandidateImage(c.url)}
                          className="group relative cursor-pointer overflow-hidden rounded-lg border border-line bg-surface-2 p-1.5 transition-all hover:border-terra hover:shadow-md"
                        >
                          <img
                            src={c.url}
                            alt={c.title}
                            className="h-28 w-full rounded object-cover"
                          />
                          <div className="mt-1 truncate font-semibold text-ink">{c.title}</div>
                          <div className="truncate text-[10px] text-ink-dim">{c.description}</div>
                          <div className="mt-1 flex items-center justify-between text-[9px] text-ink-dim">
                            <span className="uppercase font-mono">{c.source}</span>
                            <span className="font-bold text-terra group-hover:underline">Chọn ảnh</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Custom URL input */}
                  <div className="mt-3.5 flex items-center gap-2 border-t border-line pt-3">
                    <input
                      type="text"
                      placeholder="Hoặc dán trực tiếp đường dẫn URL ảnh (https://...)..."
                      value={customImageUrl}
                      onChange={(e) => setCustomImageUrl(e.target.value)}
                      className="h-8 flex-1 rounded-md border border-line bg-surface-2 px-2.5 text-xs text-ink placeholder:text-ink-dim focus:border-terra focus:outline-none"
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!customImageUrl.trim()}
                      onClick={() => {
                        if (customImageUrl.trim()) handleSelectCandidateImage(customImageUrl.trim());
                      }}
                      className="cursor-pointer"
                    >
                      Áp dụng URL
                    </Button>
                  </div>
                </div>
              )}

              {/* 12-Line Script Section */}
              <div className="rounded-xl border border-line bg-surface p-4 shadow-2xs">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-ink">Kịch bản 12 dòng nhịp</h4>
                    <span className="text-xs text-ink-dim">({currentCountry?.langName} · 12 nhịp beat)</span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (editMode) handleApplyEditedScript();
                      else setEditMode(true);
                    }}
                    className="cursor-pointer"
                  >
                    {editMode ? (
                      <>
                        <CheckCircle2 className="size-3.5 text-sage" />
                        Lưu kịch bản
                      </>
                    ) : (
                      <>
                        <Edit3 className="size-3.5 text-ink-dim" />
                        Chỉnh sửa
                      </>
                    )}
                  </Button>
                </div>

                {editMode ? (
                  <div className="space-y-2">
                    <textarea
                      value={scriptText}
                      onChange={(e) => setScriptText(e.target.value)}
                      rows={12}
                      className="w-full rounded-lg border border-line-strong bg-surface-2 p-3 font-mono text-xs leading-relaxed text-ink focus:border-terra focus:outline-none"
                    />
                    <p className="text-[11px] text-ink-dim">
                      Mỗi dòng một câu (chuẩn 20 dòng cho 65-70s, hoặc 12 dòng). Dùng <code>[[Tên]]</code> cho khái niệm và <code>*TỪ KHÓA*</code> để tô màu nổi bật.
                    </p>
                  </div>
                ) : (
                  <ol className="divide-y divide-line/60 overflow-hidden rounded-lg border border-line bg-surface-2 max-h-[380px] overflow-y-auto scroll-thin">
                    {spec.captions.map((line, i) => {
                      const is20 = spec.captions.length >= 18;
                      const label = is20 ? (BEAT_LABELS_20[i] || `Nhịp ${i + 1}`) : (BEAT_LABELS_12[i] || `Nhịp ${i + 1}`);
                      const tone = is20 ? (BEAT_TONES_20[i] || "neutral") : (BEAT_TONES_12[i] || "neutral");
                      return (
                        <li key={i} className="flex items-center gap-3 px-3 py-2 text-xs">
                          <span className="w-5 shrink-0 text-right font-mono font-bold text-ink-dim">
                            {i + 1}
                          </span>
                          <Badge tone={tone} className="w-32 shrink-0 justify-center text-[9.5px]">
                            {label}
                          </Badge>
                          <span className="flex-1 font-medium text-ink">{line}</span>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>

              {/* Cinema Soundscape & Audio Controls */}
              <div className="rounded-xl border border-line bg-surface p-4 shadow-2xs space-y-3.5">
                <div className="flex items-center justify-between border-b border-line pb-2.5">
                  <div className="flex items-center gap-2">
                    <Music className="size-4 text-terra" />
                    <h4 className="text-sm font-bold text-ink">Hệ thống Âm thanh Điện Ảnh (Cinema Soundscape Engine)</h4>
                  </div>
                  <span className="rounded bg-terra/10 px-2 py-0.5 text-[10px] font-bold text-terra">
                    Multi-Track HyperFrames
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {/* BGM Track Selector */}
                  <div className="sm:col-span-2 space-y-1.5">
                    <label className="text-xs font-bold text-ink flex items-center gap-1.5">
                      <span>Bài nhạc nền (BGM):</span>
                    </label>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {BGM_OPTIONS.map((bgm) => {
                        const url = `/api/audio/bgm/${bgm.id}`;
                        const isPlaying = playingAudio === url;
                        return (
                          <button
                            key={bgm.id}
                            type="button"
                            onClick={() => setBgmTrack(bgm.id)}
                            className={cn(
                              "flex flex-col items-start rounded-lg border p-2.5 text-left transition-all cursor-pointer relative",
                              bgmTrack === bgm.id
                                ? "border-terra bg-terra/10 text-ink shadow-xs"
                                : "border-line bg-surface-2 text-ink-dim hover:border-line-strong hover:text-ink"
                            )}
                          >
                            <div className="flex items-center justify-between w-full">
                              <span className="text-xs font-bold text-ink">{bgm.name}</span>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-mono">{bgm.mood}</span>
                                {bgm.id !== "none" && (
                                  <span
                                    role="button"
                                    onClick={(e) => playPreview(e, url)}
                                    className="p-1 rounded bg-surface border border-line hover:border-terra text-terra hover:bg-terra/15 transition-colors cursor-pointer"
                                    title={isPlaying ? "Dừng nghe thử" : "Nghe thử nhạc nền"}
                                  >
                                    {isPlaying ? (
                                      <Pause className="size-2.5 fill-current" />
                                    ) : (
                                      <Play className="size-2.5 fill-current" />
                                    )}
                                  </span>
                                )}
                              </div>
                            </div>
                            <span className="text-[10px] text-ink-dim mt-1 line-clamp-1">{bgm.desc}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Volume Slider & Boost */}
                  <div className="space-y-2.5">
                    <div className={cn(
                      "rounded-lg border border-line bg-surface-2 p-2.5 space-y-1.5 transition-opacity",
                      bgmTrack === "none" && "opacity-40 pointer-events-none"
                    )}>
                      <div className="flex items-center justify-between text-xs font-bold text-ink">
                        <span className="flex items-center gap-1">
                          <Volume2 className="size-3.5 text-terra" />
                          <span>BGM Base (Khi đọc)</span>
                        </span>
                        <span className="font-mono text-terra font-bold">{Math.round(bgmVolume * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min="0.05"
                        max="0.30"
                        step="0.01"
                        disabled={bgmTrack === "none"}
                        value={bgmVolume}
                        onChange={(e) => setBgmVolume(parseFloat(e.target.value))}
                        className="w-full accent-terra cursor-pointer h-1.5"
                      />
                      <div className="flex justify-between text-[9px] text-ink-dim font-mono">
                        <span>5% Nhỏ</span>
                        <span className="text-terra font-bold">18% Chuẩn</span>
                        <span>30% Rõ</span>
                      </div>
                    </div>

                    <div className={cn(
                      "rounded-lg border border-line bg-surface-2 p-2.5 space-y-1.5 transition-opacity",
                      bgmTrack === "none" && "opacity-40 pointer-events-none"
                    )}>
                      <div className="flex items-center justify-between text-xs font-bold text-ink">
                        <span className="flex items-center gap-1">
                          <span>🚀 BGM Boost (Khoảng lặng)</span>
                        </span>
                        <span className="font-mono text-amber-500 font-bold">{Math.round(bgmBoostVolume * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min="0.20"
                        max="0.45"
                        step="0.01"
                        disabled={bgmTrack === "none"}
                        value={bgmBoostVolume}
                        onChange={(e) => setBgmBoostVolume(parseFloat(e.target.value))}
                        className="w-full accent-amber-500 cursor-pointer h-1.5"
                      />
                      <div className="flex justify-between text-[9px] text-ink-dim font-mono">
                        <span>20% Êm</span>
                        <span className="text-amber-500 font-bold">30% Kịch tính</span>
                        <span>45% To</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 13-Key Cinema Soundboard Suite */}
                <CinemaSoundboard
                  enableSfx={enableSfx}
                  setEnableSfx={setEnableSfx}
                  smartAudioDucking={smartAudioDucking}
                  setSmartAudioDucking={setSmartAudioDucking}
                  autoSfxEngine={autoSfxEngine}
                  setAutoSfxEngine={setAutoSfxEngine}
                  bgmVolume={bgmVolume}
                  setBgmVolume={setBgmVolume}
                  bgmBoostVolume={bgmBoostVolume}
                  setBgmBoostVolume={setBgmBoostVolume}
                  playingAudio={playingAudio}
                  playPreview={playPreview}
                />
              </div>

              {/* 1-Click Global Multi-Language Banner */}
              <label className="flex cursor-pointer items-center justify-between rounded-xl border-2 border-dashed border-terra/40 bg-terra/5 p-3.5 text-xs font-bold text-ink hover:border-terra transition-colors shadow-2xs">
                <div className="flex items-center gap-2.5">
                  <Globe className="size-5 text-terra shrink-0" />
                  <div>
                    <p className="font-bold text-terra text-[13px]">🌍 Chế độ 1-Click Toàn Cầu (Tạo đồng loạt cả 6 Quốc Gia)</p>
                    <p className="text-[11.5px] font-normal text-ink-soft">
                      Hệ thống tự động biên dịch kịch bản sang tiếng bản địa, gắn đúng linh vật & dựng 6 video hoàn chỉnh (🇻🇳 VN, 🇺🇸 US, 🇩🇪 DE, 🇫🇷 FR, 🇯🇵 JP, 🇰🇷 KR).
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={isGlobalBatch}
                  onChange={(e) => setIsGlobalBatch(e.target.checked)}
                  className="size-5 rounded accent-terra cursor-pointer ml-3 shrink-0"
                />
              </label>

              {/* Build Options */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3 shadow-2xs">
                  <span className="text-xs font-bold text-ink">Thời lượng video:</span>
                  <input
                    type="number"
                    min={30}
                    max={90}
                    value={targetDuration}
                    onChange={(e) => setTargetDuration(Number(e.target.value))}
                    className="h-8 w-20 rounded-lg border border-line-strong bg-surface px-2 font-mono text-xs text-ink font-bold"
                  />
                  <span className="text-xs text-ink-dim">giây (chuẩn 65-70s cho TikTok/Shorts)</span>
                </div>

                <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-line bg-surface-2 px-4 py-3 text-xs font-bold text-ink shadow-2xs hover:border-line-strong">
                  <input
                    type="checkbox"
                    checked={alsoRender}
                    onChange={(e) => setAlsoRender(e.target.checked)}
                    className="size-4 rounded accent-terra cursor-pointer"
                  />
                  <span>Render video MP4 ngay sau khi tạo</span>
                </label>
              </div>
            </div>
          )}
        </div>
      ) : videoType === "survival" ? (
        <div className="space-y-4">
              {/* Top Configuration Grid: 3 Clean Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Card 1: Country & Market */}
                <div className="rounded-xl border border-line bg-surface p-3 shadow-2xs">
                  <div className="flex items-center gap-1.5 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-dim">
                    <Globe className="size-3.5 text-terra" />
                    <span>Quốc gia & Bản sắc</span>
                  </div>
                  <select
                    id="survival-country-select"
                    value={selectedCountry}
                    onChange={(e) => handleCountryChange(e.target.value)}
                    className="w-full h-9 rounded-lg border border-line-strong bg-surface-2 px-2.5 text-xs font-bold text-ink cursor-pointer focus:outline-none focus:border-terra"
                  >
                    {countries.map((c) => (
                      <option key={c.code} value={c.code} className="bg-ground text-ink">
                        {c.flag} {c.country} ({c.langName})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Card 2: Voice Selector */}
                <div className="rounded-xl border border-line bg-surface p-3 shadow-2xs">
                  <div className="flex items-center justify-between gap-1.5 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-dim">
                    <span className="flex items-center gap-1.5">
                      <Volume2 className="size-3.5 text-sage" />
                      <span>Giọng đọc (CapCut 🎬 / Edge)</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleToggleVoicePreview(selectedVoice)}
                      title="Nghe thử giọng đọc này"
                      className="flex items-center gap-1 rounded bg-surface-2 hover:bg-surface-3 px-1.5 py-0.5 text-[10px] font-semibold text-ink cursor-pointer border border-line transition-colors"
                    >
                      {playingVoice === selectedVoice ? (
                        <Pause className="size-3 text-terra animate-pulse" />
                      ) : (
                        <Play className="size-3 text-sage" />
                      )}
                      <span>{playingVoice === selectedVoice ? "Dừng" : "Nghe thử"}</span>
                    </button>
                  </div>
                  <select
                    id="survival-voice-select"
                    value={selectedVoice}
                    onChange={(e) => handleVoiceChange(e.target.value)}
                    className="w-full h-9 rounded-lg border border-line-strong bg-surface-2 px-2.5 text-xs font-bold text-ink cursor-pointer focus:outline-none focus:border-terra truncate"
                  >
                    {currentCountry?.voices.map((v) => (
                      <option key={v.id} value={v.id} className="bg-ground text-ink">
                        {v.provider === "capcut" ? "🎬 " : ""}{v.gender === "male" ? "👨" : "👩"} {v.name} ({v.desc})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Card 3: Format Specs */}
                <div className="rounded-xl border border-line bg-surface p-3 shadow-2xs flex flex-col justify-between">
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-ink-dim">
                    <span className="flex items-center gap-1.5">
                      <Flame className="size-3.5 text-terra" />
                      <span>Format Sinh Tồn</span>
                    </span>
                    <span className="rounded bg-terra/20 px-1.5 py-0.5 text-[9px] font-bold text-terra">
                      10 PHASES
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2.5">
                    <span className="text-2xl shrink-0">💀</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-black text-ink">Mr. Incredible Uncanny</div>
                      <div className="truncate text-[10px] text-ink-dim">Cyber Organ HUD · 65s chuẩn dọc 9:16</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* AI Survival Prompt & Script Generation Card */}
              <div className="rounded-xl border border-terra/40 bg-gradient-to-br from-surface-2 via-surface to-terra/5 p-4 shadow-sm space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-md bg-terra/20 text-terra px-2.5 py-1 text-[11px] font-bold">
                      <Sparkles className="size-3.5" />
                      AI SINH KỊCH BẢN SINH TỒN (GEMINI)
                    </span>
                    <span className="text-xs text-ink-dim font-medium">
                      Nhập bất kỳ ý tưởng hoặc thử thách sinh tồn nào
                    </span>
                  </div>
                  {survivalGenerating && (
                    <div className="flex items-center gap-1.5 text-xs text-terra font-bold animate-pulse">
                      <Loader2 className="size-3.5 animate-spin" />
                      Đang nghiên cứu & viết 10 cấp độ...
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={survivalPrompt}
                      onChange={(e) => setSurvivalPrompt(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !survivalGenerating) {
                          handleGenerateSurvival();
                        }
                      }}
                      placeholder="VD: Các cấp độ mất nước ở người, Nhiệt độ cực lạnh đóng băng, Bức xạ hạt nhân, Độ sâu đại dương..."
                      className="w-full h-10 rounded-lg border border-line-strong bg-surface px-3.5 text-xs text-ink font-medium placeholder:text-ink-dim/50 focus:border-terra focus:outline-none shadow-xs"
                      disabled={survivalGenerating}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleGenerateSurvival()}
                    disabled={survivalGenerating}
                    className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg bg-terra hover:bg-terra-hover text-white font-bold text-xs shadow-xs transition-colors disabled:opacity-50 shrink-0"
                  >
                    {survivalGenerating ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="size-3.5" />
                    )}
                    AI Tạo Kịch Bản
                  </button>
                  <button
                    type="button"
                    onClick={handleRandomSurvival}
                    disabled={survivalGenerating}
                    className="inline-flex items-center gap-1 h-10 px-3 rounded-lg border border-line bg-surface hover:bg-surface-3 text-ink text-xs font-bold transition-colors shrink-0"
                    title="Gợi ý ngẫu nhiên chủ đề sinh tồn lan truyền"
                  >
                    <Dice5 className="size-3.5 text-gold" />
                    Gợi ý
                  </button>
                </div>

                {/* Quick suggestions chips */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[10px] uppercase font-bold text-ink-dim tracking-wider mr-1">
                    Gợi ý nhanh:
                  </span>
                  {SURVIVAL_SUGGESTIONS.map((chip) => (
                    <button
                      key={chip.label}
                      type="button"
                      onClick={() => {
                        setSurvivalPrompt(chip.prompt);
                        handleGenerateSurvival(chip.prompt);
                      }}
                      disabled={survivalGenerating}
                      className="rounded-full border border-line bg-surface-2 hover:bg-terra/15 hover:border-terra/40 px-2.5 py-0.5 text-[10.5px] text-ink-muted hover:text-terra font-medium transition-all"
                    >
                      {chip.label}
                    </button>
                  ))}
                  {survivalConfig && !survivalConfig.slug?.startsWith("survival-organs-") && (
                    <button
                      type="button"
                      onClick={() => {
                        const def = getSurvivalConfig(selectedCountry);
                        setSurvivalConfig(def);
                        setSurvivalSlug(`survival-organs-${selectedCountry}`);
                        setSurvivalPrompt("");
                      }}
                      className="ml-auto text-[10.5px] text-ink-dim hover:text-ink underline"
                    >
                      ↺ Về mặc định (Thiếu nội tạng)
                    </button>
                  )}
                </div>
              </div>

              {/* Topic Info & Slug Card */}
              {(() => {
                const sCfg = survivalConfig || getSurvivalConfig(selectedCountry);
                const defaultSlug = sCfg.slug || `survival-organs-${selectedCountry}`;
                return (
                  <div className="rounded-xl border border-line bg-surface-2 p-4 shadow-2xs space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="rounded-md bg-terra/20 text-terra px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider">
                          {sCfg.eyebrow}
                        </span>
                        <h3 className="text-sm font-black text-ink">{sCfg.title}</h3>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-ink-dim">
                        <span>Định dạng:</span>
                        <span className="font-bold text-terra">10 Cấp độ Tăng tiến (65s)</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-ink-dim mb-1">
                          Tên thư mục dự án (slug)
                        </label>
                        <input
                          type="text"
                          value={survivalSlug}
                          onChange={(e) => setSurvivalSlug(e.target.value)}
                          placeholder={defaultSlug}
                          className="w-full h-9 rounded-lg border border-line-strong bg-surface px-3 font-mono text-xs text-ink font-bold focus:border-terra focus:outline-none"
                        />
                        <p className="mt-1 text-[10px] text-ink-dim">
                          Đường dẫn sẽ lưu tại: <code className="text-ink font-bold">videos/{(survivalSlug.trim() || defaultSlug).toLowerCase().replace(/[^a-z0-9-]/g, "-")}/</code>
                        </p>
                      </div>

                      <div className="rounded-lg border border-line bg-surface p-2.5 space-y-1.5 text-xs">
                        <div className="flex items-center justify-between text-[10px] font-bold text-ink-dim">
                          <span>LỜI MỞ ĐẦU (0 - 4.2s)</span>
                          <span className="text-sage font-mono">Hook</span>
                        </div>
                        <div className="font-medium text-ink text-[11.5px] italic line-clamp-2">
                          "{sCfg.prologueSpoken}"
                        </div>
                        <div className="flex items-center justify-between text-[10px] font-bold text-ink-dim pt-1 border-t border-line/60">
                          <span>KÊU GỌI CTA (59.2 - 65s)</span>
                          <span className="text-gold font-mono">Outro</span>
                        </div>
                        <div className="font-medium text-ink text-[11.5px] italic line-clamp-2">
                          "{sCfg.ctaSpoken}"
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* 10-Tier Escalation Preview */}
              {(() => {
                const sCfg = survivalConfig || getSurvivalConfig(selectedCountry);
                const tierColors = [
                  "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
                  "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
                  "border-teal-500/40 bg-teal-500/10 text-teal-400",
                  "border-amber-500/40 bg-amber-500/10 text-amber-400",
                  "border-amber-500/40 bg-amber-500/10 text-amber-400",
                  "border-orange-500/40 bg-orange-500/10 text-orange-400",
                  "border-red-500/40 bg-red-500/10 text-red-400",
                  "border-red-600/50 bg-red-600/10 text-red-500",
                  "border-rose-600/60 bg-rose-600/15 text-rose-400",
                  "border-purple-600/70 bg-purple-950/40 text-purple-300",
                ];
                return (
                  <div className="rounded-xl border border-line bg-surface-2 p-4 shadow-2xs space-y-3">
                    <div className="flex items-center justify-between border-b border-line pb-2">
                      <div className="flex items-center gap-2">
                        <Activity className="size-4 text-terra" />
                        <span className="text-xs font-black uppercase tracking-wider text-ink">
                          10 Cấp độ Leo Thang (Escalation Pipeline)
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-ink-dim">
                        5.5 giây / cấp độ · 10 biểu cảm Uncanny
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto scroll-thin pr-1">
                      {sCfg.tiers.map((t, idx) => {
                        const colorCls = tierColors[idx] || tierColors[0];
                        return (
                          <div
                            key={t.id}
                            className={cn(
                              "flex items-start gap-2.5 rounded-lg border p-2.5 transition-all",
                              colorCls
                            )}
                          >
                            <div className="flex flex-col items-center justify-center shrink-0 w-8">
                              {t.iconSvg ? (
                                <div
                                  className="size-7 rounded bg-black/40 border border-current/30 p-0.5 flex items-center justify-center text-current"
                                  dangerouslySetInnerHTML={{ __html: t.iconSvg }}
                                />
                              ) : (
                                <span className="text-base">
                                  {idx < 3 ? "🙂" : idx < 5 ? "😐" : idx < 7 ? "😨" : idx < 9 ? "😱" : "💀"}
                                </span>
                              )}
                              <span className="text-[9px] font-mono font-bold mt-0.5">L{t.id}</span>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-1">
                                <span className="text-xs font-black truncate text-ink">{t.title}</span>
                                <span className="text-[9px] font-mono font-black uppercase px-1.5 py-0.5 rounded bg-black/40 border border-current shrink-0">
                                  {t.survival}
                                </span>
                              </div>
                              <div className="text-[10px] opacity-80 truncate">{t.desc}</div>
                              <div className="text-[10px] text-ink-dim italic mt-1 line-clamp-1 border-t border-current/20 pt-0.5">
                                "{t.caption}"
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Audio & Soundscape Controls */}
              <div className="rounded-xl border border-line bg-surface-2 p-4 shadow-2xs space-y-3">
                <div className="flex items-center gap-2 border-b border-line pb-2">
                  <Music className="size-4 text-terra" />
                  <span className="text-xs font-black uppercase tracking-wider text-ink">
                    Âm thanh & Nhạc nền (Soundscape)
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {/* BGM Selector */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-ink-dim">
                      Nhạc nền (BGM)
                    </label>
                    <div className="space-y-1">
                      {BGM_OPTIONS.map((bgm) => {
                        const bgmUrl = bgm.id === "none" ? "" : `/api/audio/bgm/${bgm.id}`;
                        const isPlaying = bgmUrl && playingAudio === bgmUrl;
                        return (
                          <div
                            key={bgm.id}
                            onClick={() => setBgmTrack(bgm.id)}
                            className={cn(
                              "flex items-center justify-between rounded-lg border p-2 text-xs transition-all cursor-pointer",
                              bgmTrack === bgm.id
                                ? "border-terra bg-terra-bright/15 text-ink shadow-xs"
                                : "border-line bg-surface text-ink-dim hover:border-line-strong hover:text-ink"
                            )}
                          >
                            <div className="min-w-0 flex-1 pr-2">
                              <div className="flex items-center gap-1.5 font-bold">
                                <span>{bgm.name}</span>
                                <span className="text-[10px] text-ink-dim">({bgm.mood})</span>
                              </div>
                            </div>
                            {bgm.id !== "none" && (
                              <button
                                type="button"
                                onClick={(e) => playPreview(e, bgmUrl)}
                                className="cursor-pointer rounded-full bg-surface-2 p-1 text-ink-dim hover:bg-terra hover:text-white"
                                title={isPlaying ? "Dừng nghe thử" : "Bấm nghe thử bản nhạc"}
                              >
                                {isPlaying ? <Pause className="size-3.5 fill-current" /> : <Play className="size-3.5 fill-current" />}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* SFX & Cinema Soundscape */}
                  <div className="space-y-3">
                    <CinemaSoundboard
                      enableSfx={enableSfx}
                      setEnableSfx={setEnableSfx}
                      smartAudioDucking={smartAudioDucking}
                      setSmartAudioDucking={setSmartAudioDucking}
                      autoSfxEngine={autoSfxEngine}
                      setAutoSfxEngine={setAutoSfxEngine}
                      bgmVolume={bgmVolume}
                      setBgmVolume={setBgmVolume}
                      bgmBoostVolume={bgmBoostVolume}
                      setBgmBoostVolume={setBgmBoostVolume}
                      playingAudio={playingAudio}
                      playPreview={playPreview}
                    />

                    <div className="rounded-lg border border-line bg-surface p-3 space-y-1.5">
                      <div className="flex items-center justify-between text-xs font-bold text-ink">
                        <span>Thời lượng video</span>
                        <span className="font-mono text-terra font-bold">65 giây</span>
                      </div>
                      <p className="text-[10px] text-ink-dim">
                        Định dạng chuẩn 65s: 4.2s Mở đầu + 10 Tiers x 5.5s + 5.8s Kêu gọi CTA kết thúc.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Render Option */}
              <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-line bg-surface-2 px-4 py-3 text-xs font-bold text-ink shadow-2xs hover:border-line-strong">
                <input
                  type="checkbox"
                  checked={alsoRender}
                  onChange={(e) => setAlsoRender(e.target.checked)}
                  className="size-4 rounded accent-terra cursor-pointer"
                />
                <span>Render video MP4 ngay sau khi tạo</span>
              </label>
            </div>
          ) : videoType === "science" ? (
            <div className="space-y-4">
              {/* Top Configuration Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Card 1: Country & Language */}
                <div className="rounded-xl border border-line bg-surface p-3 shadow-2xs">
                  <div className="flex items-center gap-1.5 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-dim">
                    <Globe className="size-3.5 text-terra" />
                    <span>Quốc gia & Ngôn ngữ</span>
                  </div>
                  <select
                    value={selectedCountry}
                    onChange={(e) => handleCountryChange(e.target.value)}
                    className="w-full h-9 rounded-lg border border-line-strong bg-surface-2 px-2.5 text-xs font-bold text-ink cursor-pointer focus:outline-none focus:border-terra"
                  >
                    {countries.map((c) => (
                      <option key={c.code} value={c.code} className="bg-ground text-ink">
                        {c.flag} {c.country} ({c.langName})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Card 2: Multi-Voice Configuration */}
                <div className="rounded-xl border border-line bg-surface p-3 shadow-2xs">
                  <div className="flex items-center gap-1.5 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-dim">
                    <Volume2 className="size-3.5 text-sage" />
                    <span>Hệ thống Giọng đọc Phân vai</span>
                  </div>
                  <div className="space-y-1 text-[11px] text-ink">
                    <div className="flex justify-between">
                      <span className="text-pink-400 font-bold">Char A:</span>
                      <span className="text-ink-dim truncate">{scienceTopic?.voices?.charA || "Nữ lanh lợi"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-blue-400 font-bold">Char B:</span>
                      <span className="text-ink-dim truncate">{scienceTopic?.voices?.charB || "Nam tếu táo"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-emerald-400 font-bold">Thuyết minh:</span>
                      <span className="text-ink-dim truncate">{scienceTopic?.voices?.narrator || "Bác nông dân"}</span>
                    </div>
                  </div>
                </div>

                {/* Card 3: BGM & Sound Effects */}
                <div className="rounded-xl border border-line bg-surface p-3 shadow-2xs flex flex-col justify-between">
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-ink-dim">
                    <span className="flex items-center gap-1.5">
                      <Music className="size-3.5 text-gold" />
                      <span>Nhạc nền Hoạt hình</span>
                    </span>
                    <span className="rounded bg-sage/20 px-1.5 py-0.5 text-[9px] font-bold text-sage">Comic Sound ✓</span>
                  </div>
                  <select
                    value={bgmTrack}
                    onChange={(e) => setBgmTrack(e.target.value)}
                    className="w-full h-8 mt-1 rounded-lg border border-line-strong bg-surface-2 px-2 text-xs font-bold text-ink cursor-pointer focus:outline-none focus:border-terra"
                  >
                    {BGM_OPTIONS.map((b) => (
                      <option key={b.id} value={b.id} className="bg-ground text-ink">
                        {b.mood} · {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Presets & AI Topic Generator */}
              <div className="rounded-2xl border border-line bg-surface-2 p-4 shadow-sm space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="size-4 text-terra" />
                    <span className="text-xs font-black uppercase tracking-wider text-ink">
                      Chủ đề Khoa Học Nhân Hoá Tuyển Chọn
                    </span>
                  </div>
                  <span className="text-[11px] text-ink-dim">Từ source_videos/* và thế giới vi mô</span>
                </div>

                {/* Preset Pill Buttons */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {SCIENCE_SUGGESTIONS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelectSciencePreset(item.id)}
                      className={cn(
                        "flex flex-col items-start p-2.5 rounded-xl border text-left transition-all cursor-pointer",
                        scienceSelectedId === item.id
                          ? "border-terra bg-terra/10 shadow-xs"
                          : "border-line bg-surface hover:border-line-strong hover:bg-surface-2"
                      )}
                    >
                      <span className="text-xs font-bold text-ink">{item.name}</span>
                      <span className="text-[10px] text-ink-dim mt-0.5 line-clamp-1">{item.prompt}</span>
                    </button>
                  ))}
                </div>

                {/* Custom AI Prompt input */}
                <div className="flex gap-2 pt-1">
                  <input
                    type="text"
                    value={sciencePrompt}
                    onChange={(e) => setSciencePrompt(e.target.value)}
                    placeholder="Nhập ý tưởng mới (ví dụ: Ong mật nhảy múa chỉ đường, Cây chuối uốn cong...)"
                    className="flex-1 h-9 rounded-xl border border-line-strong bg-surface px-3 text-xs text-ink placeholder:text-ink-dim/50 focus:outline-none focus:border-terra font-medium"
                    onKeyDown={(e) => e.key === "Enter" && handleGenerateAiScience()}
                  />
                  <Button
                    variant="secondary"
                    onClick={handleGenerateAiScience}
                    disabled={scienceGenerating || !sciencePrompt.trim()}
                    className="h-9 px-4 text-xs font-bold shrink-0 cursor-pointer"
                  >
                    {scienceGenerating ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5 text-terra" />}
                    <span>AI Tạo Kịch Bản</span>
                  </Button>
                </div>
              </div>

              {/* Topic & Dialogue Script Display */}
              {scienceTopic && (
                <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm space-y-4">
                  {/* Title Header */}
                  <div className="flex items-start justify-between gap-3 border-b border-line pb-3">
                    <div>
                      <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-terra/15 text-terra text-[10px] font-mono font-bold tracking-wider uppercase mb-1">
                        <span>🌱</span> {scienceTopic.eyebrow}
                      </div>
                      <h3 className="text-base font-black text-ink uppercase tracking-tight">{scienceTopic.title}</h3>
                      <p className="text-xs text-ink-dim mt-0.5 font-medium">{scienceTopic.question}</p>
                    </div>
                    <Badge tone="sage" className="font-mono text-[10px] shrink-0">
                      {scienceTopic.dialogues.length} Lời Thoại · Multi-Voice
                    </Badge>
                  </div>

                  {/* Script Dialogues Scroll */}
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1 scroll-thin">
                    {scienceTopic.dialogues.map((d, i) => {
                      const isCharA = d.speaker === "charA";
                      const isCharB = d.speaker === "charB";
                      return (
                        <div
                          key={i}
                          className={cn(
                            "p-2.5 rounded-xl border flex items-start gap-2.5 text-xs",
                            isCharA ? "bg-pink-500/5 border-pink-500/20" : isCharB ? "bg-blue-500/5 border-blue-500/20" : "bg-emerald-500/5 border-emerald-500/20"
                          )}
                        >
                          <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 mt-0.5 text-white bg-slate-800">
                            {scienceTopic.characters[d.speaker]?.name || d.speaker}
                          </span>
                          <span className="flex-1 text-ink font-medium leading-relaxed">{d.text}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Science Fact Reveal Card */}
                  <div className="p-3 rounded-xl border border-gold/30 bg-gold/5 flex items-start gap-2.5">
                    <span className="text-xl shrink-0">🔬</span>
                    <div>
                      <div className="text-[11px] font-mono font-bold text-gold uppercase tracking-wider">
                        Bí Mật Khoa Học Thực Tế
                      </div>
                      <div className="text-xs text-ink/90 font-medium mt-0.5 leading-relaxed">
                        {scienceTopic.scienceFact}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Options */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3 shadow-2xs">
                  <span className="text-xs font-bold text-ink">Định dạng:</span>
                  <span className="text-xs text-ink-dim">9:16 Hoạt hình dọc (30s - 45s tối ưu TikTok/Shorts)</span>
                </div>

                <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-line bg-surface-2 px-4 py-3 text-xs font-bold text-ink shadow-2xs hover:border-line-strong">
                  <input
                    type="checkbox"
                    checked={alsoRender}
                    onChange={(e) => setAlsoRender(e.target.checked)}
                    className="size-4 rounded accent-terra cursor-pointer"
                  />
                  <span>Render video MP4 ngay sau khi tạo</span>
                </label>
              </div>
            </div>
          ) : videoType === "mystery" ? (
            /* =========================================================
               TAB 4: BÍ ẨN & KỲ ÁN CÓ THẬT (MYSTERY / DOCUMENTARY)
               ========================================================= */
            <div className="space-y-4">
              {/* Top Configuration Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Card 1: Country & Market */}
                <div className="rounded-xl border border-line bg-surface p-3 shadow-2xs">
                  <div className="flex items-center gap-1.5 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-dim">
                    <Globe className="size-3.5 text-terra" />
                    <span>Quốc gia & Ngôn ngữ</span>
                  </div>
                  <select
                    value={selectedCountry}
                    onChange={(e) => handleCountryChange(e.target.value)}
                    className="w-full h-9 rounded-lg border border-line-strong bg-surface-2 px-2.5 text-xs font-bold text-ink cursor-pointer focus:outline-none focus:border-terra"
                  >
                    {countries.map((c) => (
                      <option key={c.code} value={c.code} className="bg-ground text-ink">
                        {c.flag} {c.country} ({c.langName})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Card 2: Voiceover */}
                <div className="rounded-xl border border-line bg-surface p-3 shadow-2xs">
                  <div className="flex items-center justify-between gap-1.5 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-dim">
                    <span className="flex items-center gap-1.5">
                      <Volume2 className="size-3.5 text-sage" />
                      <span>Giọng đọc (CapCut 🎬 / Edge)</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleToggleVoicePreview(selectedVoice)}
                      title="Nghe thử giọng đọc này"
                      className="flex items-center gap-1 rounded bg-surface-2 hover:bg-surface-3 px-1.5 py-0.5 text-[10px] font-semibold text-ink cursor-pointer border border-line transition-colors"
                    >
                      {playingVoice === selectedVoice ? (
                        <Pause className="size-3 text-terra animate-pulse" />
                      ) : (
                        <Play className="size-3 text-sage" />
                      )}
                      <span>{playingVoice === selectedVoice ? "Dừng" : "Nghe thử"}</span>
                    </button>
                  </div>
                  <select
                    value={selectedVoice}
                    onChange={(e) => setSelectedVoice(e.target.value)}
                    className="w-full h-9 rounded-lg border border-line-strong bg-surface-2 px-2.5 text-xs font-bold text-ink cursor-pointer focus:outline-none focus:border-sage truncate"
                  >
                    {currentCountry?.voices?.map((v) => (
                      <option key={v.id} value={v.id} className="bg-ground text-ink">
                        {v.provider === "capcut" ? "🎬 " : ""}{v.gender === "male" ? "👨" : "👩"} {v.name} ({v.desc})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Card 3: BGM Soundtrack */}
                <div className="rounded-xl border border-line bg-surface p-3 shadow-2xs">
                  <div className="flex items-center gap-1.5 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-dim">
                    <Music className="size-3.5 text-cyan-400" />
                    <span>Nhạc nền Huyền Bí</span>
                  </div>
                  <div className="text-xs font-bold text-ink truncate">
                    Suspense Synth Dark Thriller Ambient
                  </div>
                  <div className="text-[10px] text-ink-dim mt-1">
                    Âm hưởng rùng rợn, dồn dập kịch tính
                  </div>
                </div>
              </div>

              {/* AI Mystery Prompt Generator */}
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/10 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
                      🕵️‍♂️
                    </span>
                    <div>
                      <h4 className="text-xs font-bold text-ink">Nhập chủ đề kỳ bí hoặc để AI tự đề xuất</h4>
                      <p className="text-[11px] text-ink-dim">Tự động viết kịch bản highlight từ khóa đa màu và tạo 8 phân cảnh tư liệu (60s - 70s)</p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={mysteryGenerating}
                    onClick={() => {
                      const promptToSend = mysteryPrompt.trim();
                      setMysteryGenerating(true);
                      generateMysteryTopic({ prompt: promptToSend, lang: selectedCountry })
                        .then((t) => {
                          setMysteryConfig(t);
                          if (!promptToSend && t.topicTitle) {
                            setMysteryPrompt(t.topicTitle);
                          }
                        })
                        .catch(console.error)
                        .finally(() => setMysteryGenerating(false));
                    }}
                    className="cursor-pointer bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                  >
                    {mysteryGenerating ? (
                      <>
                        <Loader2 className="size-3.5 animate-spin" />
                        <span>Đang phân tích & viết kịch bản...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="size-3.5" />
                        <span>AI Sinh Kịch Bản Bí Ẩn</span>
                      </>
                    )}
                  </Button>
                </div>

                <div className="relative flex items-center">
                  <input
                    type="text"
                    value={mysteryPrompt}
                    onChange={(e) => setMysteryPrompt(e.target.value)}
                    placeholder="Nhập tên bí ẩn lịch sử (ví dụ: Tam giác quỷ Bermuda, Đèo Dyatlov, Tàu ma Mary Celeste...)"
                    className="w-full h-10 rounded-xl border border-line bg-surface px-3 pr-8 text-xs text-ink placeholder:text-ink-dim focus:outline-none focus:border-emerald-500"
                  />
                  {mysteryPrompt && (
                    <button
                      type="button"
                      onClick={() => setMysteryPrompt("")}
                      className="absolute right-2.5 p-1 text-ink-dim hover:text-ink transition-colors cursor-pointer"
                      title="Xóa nội dung"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>

                {/* Quick Topic Chips */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[10px] font-bold text-ink-dim uppercase">Gợi ý viral:</span>
                  {[
                    "Tam giác quỷ Bermuda",
                    "Con tàu ma Mary Celeste",
                    "Sự cố đèo Dyatlov 1959",
                    "Âm thanh lạ The Bloop đáy biển",
                    "Vụ nổ Tunguska bí ẩn"
                  ].map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => {
                        setMysteryPrompt(chip);
                        setMysteryGenerating(true);
                        generateMysteryTopic({ prompt: chip, lang: selectedCountry })
                          .then((t) => setMysteryConfig(t))
                          .catch(console.error)
                          .finally(() => setMysteryGenerating(false));
                      }}
                      className="cursor-pointer rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] text-ink-soft hover:border-emerald-500 hover:text-emerald-400 transition-all"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>

              {/* 10 AI-Suggested Mystery Topics (Selectable Grid) */}
              <div className="rounded-2xl border border-emerald-500/30 bg-surface p-4 space-y-3 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="flex size-6 items-center justify-center rounded-md bg-emerald-500/20 text-emerald-400 text-xs">
                      ✨
                    </span>
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-ink">
                        10 Chủ Đề Kỳ Bí Ăn Khách Nhất (AI Đề Xuất)
                      </h4>
                      <p className="text-[11px] text-ink-dim">
                        Nhấp vào 1 chủ đề bất kỳ để AI tự động dựng kịch bản & phân cảnh
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={mysterySuggesting}
                    onClick={() => loadMysterySuggestions(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-line bg-surface-2 hover:bg-surface-3 text-xs font-bold text-ink cursor-pointer transition-all disabled:opacity-50 shadow-2xs hover:border-emerald-500/50"
                  >
                    {mysterySuggesting ? (
                      <>
                        <Loader2 className="size-3.5 animate-spin text-emerald-400" />
                        <span>AI đang đề xuất 10 chủ đề mới...</span>
                      </>
                    ) : (
                      <>
                        <RefreshCw className="size-3.5 text-emerald-400" />
                        <span>Đổi 10 chủ đề khác (Gemini)</span>
                      </>
                    )}
                  </button>
                </div>

                {mysterySuggesting && mysterySuggestions.length === 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 py-2">
                    {Array.from({ length: 10 }).map((_, idx) => (
                      <div key={idx} className="h-28 rounded-xl bg-surface-2 animate-pulse border border-line p-3 space-y-2">
                        <div className="h-4 bg-surface rounded w-3/4" />
                        <div className="h-3 bg-surface rounded w-full" />
                        <div className="h-3 bg-surface rounded w-5/6" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
                    {mysterySuggestions.map((topic) => {
                      const isSelected = selectedMysteryTopicId === topic.id || mysteryPrompt.includes(topic.title);
                      return (
                        <button
                          key={topic.id}
                          type="button"
                          onClick={() => handleSelectMysterySuggestion(topic)}
                          className={cn(
                            "group relative flex flex-col justify-between p-3 rounded-xl border text-left transition-all cursor-pointer shadow-2xs",
                            isSelected
                              ? "border-emerald-500 bg-emerald-500/10 shadow-sm ring-1 ring-emerald-500"
                              : "border-line bg-surface-2 hover:border-emerald-500/50 hover:bg-surface"
                          )}
                        >
                          <div>
                            <div className="flex items-center justify-between gap-1 mb-1.5">
                              <span className="text-xl">{topic.emoji || "🕵️‍♂️"}</span>
                              <span className="rounded bg-black/40 border border-line px-1.5 py-0.5 font-mono text-[9px] font-bold text-emerald-400 uppercase tracking-wider">
                                {topic.tag}
                              </span>
                            </div>
                            <h5 className="text-xs font-black text-ink line-clamp-1 group-hover:text-emerald-400 transition-colors">
                              {topic.title}
                            </h5>
                            <p className="text-[10.5px] text-ink-dim mt-1 line-clamp-2 leading-relaxed">
                              {topic.hook}
                            </p>
                          </div>
                          <div className="mt-2.5 pt-2 border-t border-line/40 flex items-center justify-between text-[9.5px]">
                            <span className={cn("font-bold", isSelected ? "text-emerald-400" : "text-ink-dim group-hover:text-ink")}>
                              {isSelected ? "✓ Đã chọn" : "Nhấp để chọn"}
                            </span>
                            <span className="text-emerald-400 font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                              ➔
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Loading State when generating */}
              {mysteryGenerating && (
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/10 p-8 text-center space-y-3">
                  <Loader2 className="size-7 animate-spin mx-auto text-emerald-400" />
                  <p className="text-xs font-bold text-ink">AI đang phân tích tư liệu & viết kịch bản 8 phân cảnh (60s - 70s)...</p>
                  <p className="text-[11px] text-ink-dim">Tự động cấu trúc timeline, thông số HUD telemetry và từ khóa highlight đa màu</p>
                </div>
              )}

              {/* Script & Scenes Preview Card */}
              {mysteryConfig && !mysteryGenerating && (
                <div className="rounded-2xl border border-line bg-surface p-4 space-y-4">
                  <div className="flex items-center justify-between border-b border-line pb-2">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                        {mysteryConfig.seriesTitle || "SỰ KIỆN CÓ THẬT MỖI NGÀY"}
                      </span>
                      <h3 className="text-sm font-black text-ink">{mysteryConfig.topicTitle}</h3>
                    </div>
                    <Badge tone="sage">
                      {mysteryConfig.scenes?.length || 8} Phân Cảnh Tư Liệu (60s - 70s)
                    </Badge>
                  </div>

                  {/* Highlighted Script Preview */}
                  <div className="rounded-xl border border-line/50 bg-black/60 p-4">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-ink-dim block mb-1">
                      Kịch bản hiển thị căn giữa màn hình (Highlight đa màu):
                    </span>
                    <div
                      className="text-xs leading-relaxed font-semibold text-white/90"
                      dangerouslySetInnerHTML={{ __html: mysteryConfig.fullScriptHtml }}
                    />
                  </div>

                  {/* Scenes List */}
                  <div className="space-y-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-ink-dim block">
                      Các phân cảnh tư liệu & lời thoại đồng bộ (60s - 70s):
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {mysteryConfig.scenes?.map((sc, i) => (
                        <div key={sc.id || i} className="rounded-lg border border-line bg-surface-2 p-2.5 space-y-1">
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="font-bold text-emerald-400">Cảnh {i + 1}</span>
                            <span className="font-mono text-ink-dim">{sc.telemetry}</span>
                          </div>
                          <p className="text-xs text-ink font-medium leading-snug">"{sc.line}"</p>
                          <p className="text-[10px] text-ink-dim italic truncate" title={sc.imagePrompt}>
                            📷 {sc.imagePrompt}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Render Option */}
              <div className="flex items-center justify-between rounded-xl border border-line bg-surface p-3">
                <div className="text-xs">
                  <span className="font-bold text-ink">Tự động Render MP4:</span>
                  <span className="text-ink-dim ml-2">Xuất video 1080x1920 hoàn chỉnh ngay khi bấm tạo</span>
                </div>
                <input
                  type="checkbox"
                  checked={alsoRender}
                  onChange={(e) => setAlsoRender(e.target.checked)}
                  className="size-4 rounded accent-emerald-500 cursor-pointer"
                />
              </div>
            </div>
          ) : videoType === "vox" ? (
            /* =========================================================
               TAB 5: VOX MOTION COLLAGE (SCRAPBOOK / KRAFT PAPER DESK)
               ========================================================= */
            <div className="space-y-4">
              {/* Top Configuration Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Card 1: Country & Market */}
                <div className="rounded-xl border border-line bg-surface p-3 shadow-2xs">
                  <div className="flex items-center gap-1.5 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-dim">
                    <Globe className="size-3.5 text-terra" />
                    <span>Quốc gia & Ngôn ngữ</span>
                  </div>
                  <select
                    value={selectedCountry}
                    onChange={(e) => handleCountryChange(e.target.value)}
                    className="w-full h-9 rounded-lg border border-line-strong bg-surface-2 px-2.5 text-xs font-bold text-ink cursor-pointer focus:outline-none focus:border-amber-500"
                  >
                    {countries.map((c) => (
                      <option key={c.code} value={c.code} className="bg-ground text-ink">
                        {c.flag} {c.country} ({c.langName})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Card 2: Voiceover */}
                <div className="rounded-xl border border-line bg-surface p-3 shadow-2xs">
                  <div className="flex items-center justify-between gap-1.5 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-dim">
                    <span className="flex items-center gap-1.5">
                      <Volume2 className="size-3.5 text-amber-500" />
                      <span>Giọng đọc (CapCut 🎬 / Edge)</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleToggleVoicePreview(selectedVoice)}
                      title="Nghe thử giọng đọc này"
                      className="flex items-center gap-1 rounded bg-surface-2 hover:bg-surface-3 px-1.5 py-0.5 text-[10px] font-semibold text-ink cursor-pointer border border-line transition-colors"
                    >
                      {playingVoice === selectedVoice ? (
                        <Pause className="size-3 text-terra animate-pulse" />
                      ) : (
                        <Play className="size-3 text-amber-500" />
                      )}
                      <span>{playingVoice === selectedVoice ? "Dừng" : "Nghe thử"}</span>
                    </button>
                  </div>
                  <select
                    value={selectedVoice}
                    onChange={(e) => setSelectedVoice(e.target.value)}
                    className="w-full h-9 rounded-lg border border-line-strong bg-surface-2 px-2.5 text-xs font-bold text-ink cursor-pointer focus:outline-none focus:border-amber-500 truncate"
                  >
                    {currentCountry?.voices?.map((v) => (
                      <option key={v.id} value={v.id} className="bg-ground text-ink">
                        {v.provider === "capcut" ? "🎬 " : ""}{v.gender === "male" ? "👨" : "👩"} {v.name} ({v.desc})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Card 3: Theme Preset Catalog */}
                <div className="rounded-xl border border-line bg-surface p-3 shadow-2xs">
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-ink-dim mb-1.5">
                    <span className="flex items-center gap-1.5">
                      <Scissors className="size-3.5 text-amber-500" />
                      <span>Theme & Phong Cách Zine</span>
                    </span>
                    <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold text-amber-600 dark:text-amber-400">
                      hook_payoff
                    </span>
                  </div>
                  <select
                    value={voxTheme}
                    onChange={(e) => {
                      const t = e.target.value;
                      setVoxTheme(t);
                      const promptToSend = voxPrompt.trim() || voxConfig?.topicTitle;
                      if (promptToSend) {
                        setVoxGenerating(true);
                        generateVoxTopic({ prompt: promptToSend, lang: selectedCountry, voice: selectedVoice, theme: t })
                          .then((cfg) => setVoxConfig(cfg))
                          .catch(console.error)
                          .finally(() => setVoxGenerating(false));
                      }
                    }}
                    className="w-full h-9 rounded-lg border border-line-strong bg-surface-2 px-2.5 text-xs font-bold text-ink cursor-pointer focus:outline-none focus:border-amber-500"
                  >
                    <option value="american-retro" className="bg-ground text-ink">American Retro (1950s/60s Print, Ben-Day Dots)</option>
                    <option value="swiss-modern" className="bg-ground text-ink">Swiss Modern (Clean Helvetica, Pure Red)</option>
                    <option value="punk-zine" className="bg-ground text-ink">Punk Zine (DIY Ransom Note & High Contrast)</option>
                    <option value="editorial-kraft" className="bg-ground text-ink">Editorial Kraft (Scrapbook, Cardboard Fiber)</option>
                  </select>
                </div>
              </div>

              {/* AI Vox Prompt Generator */}
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex size-7 items-center justify-center rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400 font-bold">
                      ✂️
                    </span>
                    <div>
                      <h4 className="text-xs font-bold text-ink">Nhập câu hỏi giải thích hoặc để AI đề xuất</h4>
                      <p className="text-[11px] text-ink-dim">Tự động cấu trúc 6 nhịp kịch bản, headline xé giấy, chấm halftone và camera moves</p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={voxGenerating}
                    onClick={() => {
                      const promptToSend = voxPrompt.trim();
                      setVoxGenerating(true);
                      generateVoxTopic({ prompt: promptToSend, lang: selectedCountry, voice: selectedVoice, theme: voxTheme })
                        .then((t) => {
                          setVoxConfig(t);
                          if (!promptToSend && t.topicTitle) {
                            setVoxPrompt(t.topicTitle);
                          }
                        })
                        .catch(console.error)
                        .finally(() => setVoxGenerating(false));
                    }}
                    className="cursor-pointer bg-amber-600 hover:bg-amber-500 text-white font-bold"
                  >
                    {voxGenerating ? (
                      <>
                        <Loader2 className="size-3.5 animate-spin" />
                        <span>Đang phân tích & viết 6 hồi...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="size-3.5" />
                        <span>AI Sinh Kịch Bản Vox</span>
                      </>
                    )}
                  </Button>
                </div>

                <div className="relative flex items-center">
                  <input
                    type="text"
                    value={voxPrompt}
                    onChange={(e) => setVoxPrompt(e.target.value)}
                    placeholder="Nhập câu hỏi phản trực giác (ví dụ: Vì sao cà phê không tạo ra năng lượng, Lỗ nhỏ cửa sổ máy bay...)"
                    className="w-full h-10 rounded-xl border border-line bg-surface px-3 pr-8 text-xs text-ink placeholder:text-ink-dim focus:outline-none focus:border-amber-500"
                  />
                  {voxPrompt && (
                    <button
                      type="button"
                      onClick={() => setVoxPrompt("")}
                      className="absolute right-2.5 p-1 text-ink-dim hover:text-ink transition-colors cursor-pointer"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>

                {/* Quick Topic Chips */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[10px] font-bold text-ink-dim uppercase">Gợi ý viral:</span>
                  {[
                    "Vì sao cà phê không tạo năng lượng",
                    "Chiếc lỗ nhỏ trên cửa sổ máy bay",
                    "Nút bấm qua đường có tác dụng không",
                    "Bản đồ thế giới Mercator đánh lừa chúng ta",
                    "Bí mật tại sao bỏng ngô nổ tung"
                  ].map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => {
                        setVoxPrompt(chip);
                        setVoxGenerating(true);
                        generateVoxTopic({ prompt: chip, lang: selectedCountry, voice: selectedVoice, theme: voxTheme })
                          .then((t) => setVoxConfig(t))
                          .catch(console.error)
                          .finally(() => setVoxGenerating(false));
                      }}
                      className="cursor-pointer rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] text-ink-soft hover:border-amber-500 hover:text-amber-500 transition-all"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>

              {/* 10 AI-Suggested Vox Topics */}
              <div className="rounded-2xl border border-amber-500/30 bg-surface p-4 space-y-3 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="flex size-6 items-center justify-center rounded-md bg-amber-500/20 text-amber-500 text-xs">
                      ✨
                    </span>
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-ink">
                        10 Chủ Đề Vox Motion Collage Ăn Khách Nhất
                      </h4>
                      <p className="text-[11px] text-ink-dim">
                        Bấm vào một chủ đề để AI tự động nghiên cứu & chia nhịp 6 hồi kèm hiệu ứng thủ công
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={voxSuggesting}
                    onClick={() => loadVoxSuggestions(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-line bg-surface-2 hover:bg-surface-3 text-xs font-bold text-ink cursor-pointer transition-all disabled:opacity-50 shadow-2xs hover:border-amber-500/50"
                  >
                    {voxSuggesting ? (
                      <>
                        <Loader2 className="size-3.5 animate-spin text-amber-500" />
                        <span>AI đang đề xuất 10 chủ đề mới...</span>
                      </>
                    ) : (
                      <>
                        <RefreshCw className="size-3.5 text-amber-500" />
                        <span>Đổi 10 chủ đề khác (Gemini)</span>
                      </>
                    )}
                  </button>
                </div>

                {voxSuggesting && voxSuggestions.length === 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 py-2">
                    {Array.from({ length: 10 }).map((_, idx) => (
                      <div key={idx} className="h-28 rounded-xl bg-surface-2 animate-pulse border border-line p-3 space-y-2">
                        <div className="h-4 bg-surface rounded w-3/4" />
                        <div className="h-3 bg-surface rounded w-full" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
                    {voxSuggestions.map((topic) => {
                      const isSelected = selectedVoxTopicId === topic.id || voxPrompt.includes(topic.title);
                      return (
                        <button
                          key={topic.id}
                          type="button"
                          onClick={() => handleSelectVoxSuggestion(topic)}
                          className={cn(
                            "group relative flex flex-col justify-between p-3 rounded-xl border text-left transition-all cursor-pointer shadow-2xs",
                            isSelected
                              ? "border-amber-500 bg-amber-500/10 shadow-sm ring-1 ring-amber-500"
                              : "border-line bg-surface-2 hover:border-amber-500/50 hover:bg-surface"
                          )}
                        >
                          <div>
                            <div className="flex items-center justify-between gap-1 mb-1.5">
                              <span className="text-xl">{topic.emoji || "✂️"}</span>
                              <span className="rounded bg-black/40 border border-line px-1.5 py-0.5 font-mono text-[9px] font-bold text-amber-500 uppercase tracking-wider">
                                {topic.tag}
                              </span>
                            </div>
                            <h5 className="text-xs font-black text-ink line-clamp-1 group-hover:text-amber-500 transition-colors">
                              {topic.title}
                            </h5>
                            <p className="text-[10.5px] text-ink-dim mt-1 line-clamp-2 leading-relaxed">
                              {topic.hook}
                            </p>
                          </div>
                          <div className="mt-2.5 pt-2 border-t border-line/40 flex items-center justify-between text-[9.5px]">
                            <span className={cn("font-bold", isSelected ? "text-amber-500" : "text-ink-dim group-hover:text-ink")}>
                              {isSelected ? "✓ Đã chọn" : "Nhấp để chọn"}
                            </span>
                            <span className="text-amber-500 font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                              ➔
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Loading State */}
              {voxGenerating && (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-8 text-center space-y-3">
                  <Loader2 className="size-7 animate-spin mx-auto text-amber-500" />
                  <p className="text-xs font-bold text-ink">AI đang phân tích câu hỏi & dựng 6 hồi Vox Motion Collage (65s)...</p>
                  <p className="text-[11px] text-ink-dim">Tự động cấu trúc vị trí dán băng dính, sticker viền trắng và highlighter đa màu</p>
                </div>
              )}

              {/* Script & Beats Preview */}
              {voxConfig && !voxGenerating && (
                <div className="rounded-2xl border border-line bg-surface p-4 space-y-4">
                  <div className="flex items-center justify-between border-b border-line pb-2">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-500">
                        {voxConfig.eyebrow || "VOX EXPLAINER ESSAY"}
                      </span>
                      <h3 className="text-sm font-black text-ink">{voxConfig.topicTitle}</h3>
                    </div>
                    <Badge tone="gold">
                      {voxConfig.beats?.length || 6} Hồi Kịch Bản (65s)
                    </Badge>
                  </div>

                  {/* Highlighter Text Box */}
                  <div className="rounded-xl border border-amber-200/40 bg-[#FAF7EE] p-4 text-[#1C1814] shadow-inner">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#8A7A64] block mb-1">
                      Kịch bản hiển thị trên nền giấy thủ công (Quét bút dạ quang):
                    </span>
                    <div
                      className="text-xs leading-relaxed font-semibold"
                      dangerouslySetInnerHTML={{ __html: voxConfig.fullScriptHtml }}
                    />
                  </div>

                  {/* 6 Beats Grid */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-ink-dim">
                      <span>6 Hồi Cắt Dán • Headline Xé Giấy & Camera Moves:</span>
                      <span className="text-amber-500 font-mono">Anil-Matcha Vox Zine Arc</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                      {voxConfig.beats?.map((b, i) => (
                        <div key={b.id || i} className="rounded-xl border border-line bg-surface-2 p-3 space-y-2 shadow-2xs hover:border-amber-500/40 transition-colors">
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="font-bold text-amber-500 uppercase tracking-wider">Hồi {i + 1}: {b.act}</span>
                            <span className="font-mono text-ink-dim">{b.duration || 10.5}s</span>
                          </div>
                          
                          {/* Torn Paper Headline Banner */}
                          <div className="rounded-md border border-dashed border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-center">
                            <span className="text-[9px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400 block">Torn Headline:</span>
                            <span className="font-black text-xs text-ink uppercase tracking-wider line-clamp-1">
                              "{b.headline || b.stickerLabel || b.name}"
                            </span>
                          </div>

                          <p className="text-xs text-ink font-medium leading-snug line-clamp-2">"{b.line}"</p>
                          
                          {/* Motion & Camera Tags */}
                          <div className="flex flex-wrap items-center gap-1 text-[9px] font-mono">
                            <span className="rounded bg-surface px-1.5 py-0.5 border border-line text-ink font-bold">
                              🎥 {b.cameraMove || "push_in"}
                            </span>
                            <span className="rounded bg-surface px-1.5 py-0.5 border border-line text-ink-dim">
                              📐 {b.shotSize || "WIDE"}
                            </span>
                          </div>

                          <div className="pt-1.5 text-[9.5px] text-ink-dim flex items-center justify-between border-t border-line/40">
                            <span className="truncate max-w-[150px]">🏷️ {b.stickerLabel || "Cutout Sticker"}</span>
                            <span className="font-mono text-amber-600 dark:text-amber-400 font-bold">{b.badgeText || "VOX ARCHIVE"}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Render Option */}
              <div className="flex items-center justify-between rounded-xl border border-line bg-surface p-3">
                <div className="text-xs">
                  <span className="font-bold text-ink">Tự động Render MP4:</span>
                  <span className="text-ink-dim ml-2">Xuất video 1080x1920 hoàn chỉnh ngay khi bấm tạo</span>
                </div>
                <input
                  type="checkbox"
                  checked={alsoRender}
                  onChange={(e) => setAlsoRender(e.target.checked)}
                  className="size-4 rounded accent-amber-500 cursor-pointer"
                />
              </div>
            </div>
          ) : videoType === "newspaper" ? (
            /* =========================================================
               TAB 6: RETRO NEWSPAPER & DOSSIER (BÁO CŨ & HỒ SƠ ĐIỀU TRA)
               ========================================================= */
            <div className="space-y-4">
              {/* Top Configuration Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Card 1: Country & Market */}
                <div className="rounded-xl border border-line bg-surface p-3 shadow-2xs">
                  <div className="flex items-center gap-1.5 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-dim">
                    <Globe className="size-3.5 text-terra" />
                    <span>Quốc gia & Ngôn ngữ</span>
                  </div>
                  <select
                    value={selectedCountry}
                    onChange={(e) => handleCountryChange(e.target.value)}
                    className="w-full h-9 rounded-lg border border-line-strong bg-surface-2 px-2.5 text-xs font-bold text-ink cursor-pointer focus:outline-none focus:border-red-600"
                  >
                    {countries.map((c) => (
                      <option key={c.code} value={c.code} className="bg-ground text-ink">
                        {c.flag} {c.country} ({c.langName})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Card 2: Voiceover */}
                <div className="rounded-xl border border-line bg-surface p-3 shadow-2xs">
                  <div className="flex items-center justify-between gap-1.5 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-dim">
                    <span className="flex items-center gap-1.5">
                      <Volume2 className="size-3.5 text-red-600" />
                      <span>Giọng đọc (CapCut 🎬 / Edge)</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleToggleVoicePreview(selectedVoice)}
                      title="Nghe thử giọng đọc này"
                      className="flex items-center gap-1 rounded bg-surface-2 hover:bg-surface-3 px-1.5 py-0.5 text-[10px] font-semibold text-ink cursor-pointer border border-line transition-colors"
                    >
                      {playingVoice === selectedVoice ? (
                        <Pause className="size-3 text-terra animate-pulse" />
                      ) : (
                        <Play className="size-3 text-red-600" />
                      )}
                      <span>{playingVoice === selectedVoice ? "Dừng" : "Nghe thử"}</span>
                    </button>
                  </div>
                  <select
                    value={selectedVoice}
                    onChange={(e) => setSelectedVoice(e.target.value)}
                    className="w-full h-9 rounded-lg border border-line-strong bg-surface-2 px-2.5 text-xs font-bold text-ink cursor-pointer focus:outline-none focus:border-red-600 truncate"
                  >
                    {currentCountry?.voices?.map((v) => (
                      <option key={v.id} value={v.id} className="bg-ground text-ink">
                        {v.provider === "capcut" ? "🎬 " : ""}{v.gender === "male" ? "👨" : "👩"} {v.name} ({v.desc})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Card 3: Visual Meta */}
                <div className="rounded-xl border border-line bg-surface p-3 shadow-2xs">
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-ink-dim mb-1">
                    <span className="flex items-center gap-1.5">
                      <Newspaper className="size-3.5 text-red-600" />
                      <span>The Daily Chronicle</span>
                    </span>
                    <span className="rounded bg-red-600/20 px-1.5 py-0.5 text-[9px] font-bold text-red-600">
                      Retro Press
                    </span>
                  </div>
                  <div className="text-xs font-bold text-ink truncate">
                    Báo in 1920-1970s, con dấu cộp đỏ & khoanh bút chứng cứ
                  </div>
                  <div className="text-[10px] text-ink-dim mt-0.5">
                    Hồ sơ vụ án kinh tế, bê bối thế kỷ & tài liệu giải mật
                  </div>
                </div>
              </div>

              {/* AI Newspaper Prompt Generator */}
              <div className="rounded-2xl border border-red-600/30 bg-red-600/5 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex size-7 items-center justify-center rounded-lg bg-red-600/20 text-red-600 font-bold">
                      📰
                    </span>
                    <div>
                      <h4 className="text-xs font-bold text-ink">Nhập vụ án, đại án kinh tế hoặc đại sự kiện lịch sử</h4>
                      <p className="text-[11px] text-ink-dim">Tự động xuất bản bài báo khổ lớn, dòng tít giật gân và phân tích chứng cứ</p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={newspaperGenerating}
                    onClick={() => {
                      const promptToSend = newspaperPrompt.trim();
                      setNewspaperGenerating(true);
                      generateNewspaperTopic({ prompt: promptToSend, lang: selectedCountry, voice: selectedVoice })
                        .then((t) => {
                          setNewspaperConfig(t);
                          if (!promptToSend && t.headline) {
                            setNewspaperPrompt(t.headline);
                          }
                        })
                        .catch(console.error)
                        .finally(() => setNewspaperGenerating(false));
                    }}
                    className="cursor-pointer bg-red-700 hover:bg-red-600 text-white font-bold"
                  >
                    {newspaperGenerating ? (
                      <>
                        <Loader2 className="size-3.5 animate-spin" />
                        <span>Đang xuất bản hồ sơ...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="size-3.5" />
                        <span>AI Sinh Hồ Sơ Báo Cũ</span>
                      </>
                    )}
                  </Button>
                </div>

                <div className="relative flex items-center">
                  <input
                    type="text"
                    value={newspaperPrompt}
                    onChange={(e) => setNewspaperPrompt(e.target.value)}
                    placeholder="Nhập đại án hoặc bê bối thế kỷ (ví dụ: Vụ sụp đổ Enron 2001, Cú lừa Theranos, Vụ lừa thế kỷ Madoff...)"
                    className="w-full h-10 rounded-xl border border-line bg-surface px-3 pr-8 text-xs text-ink placeholder:text-ink-dim focus:outline-none focus:border-red-600"
                  />
                  {newspaperPrompt && (
                    <button
                      type="button"
                      onClick={() => setNewspaperPrompt("")}
                      className="absolute right-2.5 p-1 text-ink-dim hover:text-ink transition-colors cursor-pointer"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>

                {/* Quick Topic Chips */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[10px] font-bold text-ink-dim uppercase">Gợi ý viral:</span>
                  {[
                    "Vụ sụp đổ tập đoàn Enron 2001",
                    "Cú lừa giọt máu Theranos Holmes",
                    "Mô hình lừa đảo thế kỷ Bernie Madoff",
                    "Đạo chích bí ẩn DB Cooper biến mất",
                    "Bê bối tài liệu Lầu Năm Góc 1971"
                  ].map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => {
                        setNewspaperPrompt(chip);
                        setNewspaperGenerating(true);
                        generateNewspaperTopic({ prompt: chip, lang: selectedCountry, voice: selectedVoice })
                          .then((t) => setNewspaperConfig(t))
                          .catch(console.error)
                          .finally(() => setNewspaperGenerating(false));
                      }}
                      className="cursor-pointer rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] text-ink-soft hover:border-red-600 hover:text-red-600 transition-all"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>

              {/* 10 AI-Suggested Newspaper Topics */}
              <div className="rounded-2xl border border-red-600/30 bg-surface p-4 space-y-3 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="flex size-6 items-center justify-center rounded-md bg-red-600/20 text-red-600 text-xs">
                      ✨
                    </span>
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-ink">
                        10 Hồ Sơ Báo Cũ & Kỳ Án Điều Tra Hút View Nhất
                      </h4>
                      <p className="text-[11px] text-ink-dim">
                        Bấm vào một hồ sơ để AI tự động dàn trang báo cổ điển kèm con dấu chứng cứ
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={newspaperSuggesting}
                    onClick={() => loadNewspaperSuggestions(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-line bg-surface-2 hover:bg-surface-3 text-xs font-bold text-ink cursor-pointer transition-all disabled:opacity-50 shadow-2xs hover:border-red-600/50"
                  >
                    {newspaperSuggesting ? (
                      <>
                        <Loader2 className="size-3.5 animate-spin text-red-600" />
                        <span>AI đang chuẩn bị 10 hồ sơ...</span>
                      </>
                    ) : (
                      <>
                        <RefreshCw className="size-3.5 text-red-600" />
                        <span>Đổi 10 hồ sơ khác (Gemini)</span>
                      </>
                    )}
                  </button>
                </div>

                {newspaperSuggesting && newspaperSuggestions.length === 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 py-2">
                    {Array.from({ length: 10 }).map((_, idx) => (
                      <div key={idx} className="h-28 rounded-xl bg-surface-2 animate-pulse border border-line p-3 space-y-2">
                        <div className="h-4 bg-surface rounded w-3/4" />
                        <div className="h-3 bg-surface rounded w-full" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
                    {newspaperSuggestions.map((topic) => {
                      const isSelected = selectedNewspaperTopicId === topic.id || newspaperPrompt.includes(topic.title);
                      return (
                        <button
                          key={topic.id}
                          type="button"
                          onClick={() => handleSelectNewspaperSuggestion(topic)}
                          className={cn(
                            "group relative flex flex-col justify-between p-3 rounded-xl border text-left transition-all cursor-pointer shadow-2xs",
                            isSelected
                              ? "border-red-600 bg-red-600/10 shadow-sm ring-1 ring-red-600"
                              : "border-line bg-surface-2 hover:border-red-600/50 hover:bg-surface"
                          )}
                        >
                          <div>
                            <div className="flex items-center justify-between gap-1 mb-1.5">
                              <span className="text-xl">{topic.emoji || "📰"}</span>
                              <span className="rounded bg-black/40 border border-line px-1.5 py-0.5 font-mono text-[9px] font-bold text-red-500 uppercase tracking-wider">
                                {topic.tag}
                              </span>
                            </div>
                            <h5 className="text-xs font-black text-ink line-clamp-1 group-hover:text-red-600 transition-colors">
                              {topic.title}
                            </h5>
                            <p className="text-[10.5px] text-ink-dim mt-1 line-clamp-2 leading-relaxed">
                              {topic.hook}
                            </p>
                          </div>
                          <div className="mt-2.5 pt-2 border-t border-line/40 flex items-center justify-between text-[9.5px]">
                            <span className={cn("font-bold", isSelected ? "text-red-600" : "text-ink-dim group-hover:text-ink")}>
                              {isSelected ? "✓ Đã chọn" : "Nhấp để chọn"}
                            </span>
                            <span className="text-red-600 font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                              ➔
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Loading State */}
              {newspaperGenerating && (
                <div className="rounded-2xl border border-red-600/30 bg-red-600/10 p-8 text-center space-y-3">
                  <Loader2 className="size-7 animate-spin mx-auto text-red-600" />
                  <p className="text-xs font-bold text-ink">AI đang tìm kiếm tư liệu & dàn trang hồ sơ The Daily Chronicle (65s)...</p>
                  <p className="text-[11px] text-ink-dim">Tự động chia cột báo chí, khoanh chứng cứ bút đỏ và đóng dấu kết tội</p>
                </div>
              )}

              {/* Script & Sections Preview */}
              {newspaperConfig && !newspaperGenerating && (
                <div className="rounded-2xl border border-line bg-surface p-4 space-y-4">
                  <div className="flex items-center justify-between border-b border-line pb-2">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-red-600 font-serif">
                        {newspaperConfig.publication || "THE DAILY CHRONICLE"} · {newspaperConfig.dateline}
                      </span>
                      <h3 className="text-sm font-black text-ink font-serif tracking-tight uppercase">{newspaperConfig.headline}</h3>
                    </div>
                    <Badge tone="terra">
                      {newspaperConfig.sections?.length || 5} Mục Báo Chí (65s)
                    </Badge>
                  </div>

                  {/* Newsprint Script Box */}
                  <div className="rounded-xl border border-[#D0C2A5] bg-[#F7F2E4] p-4 text-[#1F1B16] shadow-inner font-serif">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#7A6A52] block mb-1">
                      Kịch bản hiển thị trên trang báo retro:
                    </span>
                    <div
                      className="text-xs leading-relaxed font-medium"
                      dangerouslySetInnerHTML={{ __html: newspaperConfig.fullScriptHtml }}
                    />
                  </div>

                  {/* Sections List */}
                  <div className="space-y-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-ink-dim block">
                      5 Khối bài báo & Con dấu điều tra:
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {newspaperConfig.sections?.map((sec, i) => (
                        <div key={sec.id || i} className="rounded-lg border border-line bg-surface-2 p-2.5 space-y-1">
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="font-bold text-red-600 font-serif">Cột {i + 1}: {sec.headline}</span>
                            {sec.stamp && (
                              <span className="font-mono text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-600/20 text-red-600 border border-red-600/40">
                                {sec.stamp}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-ink font-medium leading-snug">"{sec.spoken}"</p>
                          <div className="pt-1 text-[9.5px] text-ink-dim flex items-center justify-between border-t border-line/40">
                            <span>{sec.hasRedCircle ? "⭕ Khoanh bút đỏ" : "📄 Đoạn tường thuật"}</span>
                            <span className="italic truncate ml-2">"{sec.lead}"</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Render Option */}
              <div className="flex items-center justify-between rounded-xl border border-line bg-surface p-3">
                <div className="text-xs">
                  <span className="font-bold text-ink">Tự động Render MP4:</span>
                  <span className="text-ink-dim ml-2">Xuất video 1080x1920 hoàn chỉnh ngay khi bấm tạo</span>
                </div>
                <input
                  type="checkbox"
                  checked={alsoRender}
                  onChange={(e) => setAlsoRender(e.target.checked)}
                  className="size-4 rounded accent-red-600 cursor-pointer"
                />
              </div>
            </div>
          ) : videoType === "kinetic" ? (
            /* =========================================================
               TAB 7: DARK CYBER KINETIC TYPOGRAPHY (MÔ HÌNH TƯ DUY)
               ========================================================= */
            <div className="space-y-4">
              {/* Top Configuration Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Card 1: Country & Market */}
                <div className="rounded-xl border border-line bg-surface p-3 shadow-2xs">
                  <div className="flex items-center gap-1.5 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-dim">
                    <Globe className="size-3.5 text-terra" />
                    <span>Quốc gia & Ngôn ngữ</span>
                  </div>
                  <select
                    value={selectedCountry}
                    onChange={(e) => handleCountryChange(e.target.value)}
                    className="w-full h-9 rounded-lg border border-line-strong bg-surface-2 px-2.5 text-xs font-bold text-ink cursor-pointer focus:outline-none focus:border-cyan-400"
                  >
                    {countries.map((c) => (
                      <option key={c.code} value={c.code} className="bg-ground text-ink">
                        {c.flag} {c.country} ({c.langName})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Card 2: Voiceover */}
                <div className="rounded-xl border border-line bg-surface p-3 shadow-2xs">
                  <div className="flex items-center justify-between gap-1.5 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-dim">
                    <span className="flex items-center gap-1.5">
                      <Volume2 className="size-3.5 text-cyan-400" />
                      <span>Giọng đọc (CapCut 🎬 / Edge)</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleToggleVoicePreview(selectedVoice)}
                      title="Nghe thử giọng đọc này"
                      className="flex items-center gap-1 rounded bg-surface-2 hover:bg-surface-3 px-1.5 py-0.5 text-[10px] font-semibold text-ink cursor-pointer border border-line transition-colors"
                    >
                      {playingVoice === selectedVoice ? (
                        <Pause className="size-3 text-terra animate-pulse" />
                      ) : (
                        <Play className="size-3 text-cyan-400" />
                      )}
                      <span>{playingVoice === selectedVoice ? "Dừng" : "Nghe thử"}</span>
                    </button>
                  </div>
                  <select
                    value={selectedVoice}
                    onChange={(e) => setSelectedVoice(e.target.value)}
                    className="w-full h-9 rounded-lg border border-line-strong bg-surface-2 px-2.5 text-xs font-bold text-ink cursor-pointer focus:outline-none focus:border-cyan-400 truncate"
                  >
                    {currentCountry?.voices?.map((v) => (
                      <option key={v.id} value={v.id} className="bg-ground text-ink">
                        {v.provider === "capcut" ? "🎬 " : ""}{v.gender === "male" ? "👨" : "👩"} {v.name} ({v.desc})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Card 3: Visual Meta */}
                <div className="rounded-xl border border-line bg-surface p-3 shadow-2xs">
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-ink-dim mb-1">
                    <span className="flex items-center gap-1.5">
                      <Zap className="size-3.5 text-cyan-400" />
                      <span>Cyber Kinetic Engine</span>
                    </span>
                    <span className="rounded bg-cyan-400/20 px-1.5 py-0.5 text-[9px] font-bold text-cyan-400">
                      OLED Black
                    </span>
                  </div>
                  <div className="text-xs font-bold text-ink truncate">
                    HUD Grid, khối wireframe 3D, radar & chữ nảy theo nhịp
                  </div>
                  <div className="text-[10px] text-ink-dim mt-0.5">
                    Mô hình tư duy, tâm lý hành vi & bài học năng suất đỉnh cao
                  </div>
                </div>
              </div>

              {/* AI Kinetic Prompt Generator */}
              <div className="rounded-2xl border border-cyan-400/30 bg-cyan-950/10 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex size-7 items-center justify-center rounded-lg bg-cyan-400/20 text-cyan-400 font-bold">
                      ⚡
                    </span>
                    <div>
                      <h4 className="text-xs font-bold text-ink">Nhập quy luật tâm lý, hiệu ứng hoặc nghịch lý</h4>
                      <p className="text-[11px] text-ink-dim">Tự động chia 5 giai đoạn tâm lý với các từ đấm (punch words) nảy mạnh theo nhịp beat</p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={kineticGenerating}
                    onClick={() => {
                      const promptToSend = kineticPrompt.trim();
                      setKineticGenerating(true);
                      generateKineticTopic({ prompt: promptToSend, lang: selectedCountry, voice: selectedVoice })
                        .then((t) => {
                          setKineticConfig(t);
                          if (!promptToSend && t.headline) {
                            setKineticPrompt(t.headline);
                          }
                        })
                        .catch(console.error)
                        .finally(() => setKineticGenerating(false));
                    }}
                    className="cursor-pointer bg-cyan-600 hover:bg-cyan-500 text-white font-bold"
                  >
                    {kineticGenerating ? (
                      <>
                        <Loader2 className="size-3.5 animate-spin" />
                        <span>Đang mã hóa mô hình tư duy...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="size-3.5" />
                        <span>AI Sinh Cyber Kinetic</span>
                      </>
                    )}
                  </Button>
                </div>

                <div className="relative flex items-center">
                  <input
                    type="text"
                    value={kineticPrompt}
                    onChange={(e) => setKineticPrompt(e.target.value)}
                    placeholder="Nhập quy luật hoặc hiệu ứng tâm lý (ví dụ: Quy tắc Dopamine 4 Giây, Định luật Parkinson, Hiệu ứng Dunning-Kruger...)"
                    className="w-full h-10 rounded-xl border border-line bg-surface px-3 pr-8 text-xs text-ink placeholder:text-ink-dim focus:outline-none focus:border-cyan-400"
                  />
                  {kineticPrompt && (
                    <button
                      type="button"
                      onClick={() => setKineticPrompt("")}
                      className="absolute right-2.5 p-1 text-ink-dim hover:text-ink transition-colors cursor-pointer"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>

                {/* Quick Topic Chips */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[10px] font-bold text-ink-dim uppercase">Gợi ý viral:</span>
                  {[
                    "Quy tắc Dopamine 4 Giây",
                    "Nghịch lý năng suất Parkinson",
                    "Hiệu ứng Dunning-Kruger tự mãn",
                    "Nguyên lý 80/20 Pareto bứt phá",
                    "Quy luật 10,000 giờ thành thạo"
                  ].map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => {
                        setKineticPrompt(chip);
                        setKineticGenerating(true);
                        generateKineticTopic({ prompt: chip, lang: selectedCountry, voice: selectedVoice })
                          .then((t) => setKineticConfig(t))
                          .catch(console.error)
                          .finally(() => setKineticGenerating(false));
                      }}
                      className="cursor-pointer rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] text-ink-soft hover:border-cyan-400 hover:text-cyan-400 transition-all"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>

              {/* 10 AI-Suggested Kinetic Topics */}
              <div className="rounded-2xl border border-cyan-400/30 bg-surface p-4 space-y-3 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="flex size-6 items-center justify-center rounded-md bg-cyan-400/20 text-cyan-400 text-xs">
                      ✨
                    </span>
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-ink">
                        10 Mô Hình Tư Duy & Quy Luật Tâm Lý Ăn Khách Nhất
                      </h4>
                      <p className="text-[11px] text-ink-dim">
                        Bấm vào một mô hình để AI tự động lập trình thông số radar HUD và từ khóa chữ nảy
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={kineticSuggesting}
                    onClick={() => loadKineticSuggestions(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-line bg-surface-2 hover:bg-surface-3 text-xs font-bold text-ink cursor-pointer transition-all disabled:opacity-50 shadow-2xs hover:border-cyan-400/50"
                  >
                    {kineticSuggesting ? (
                      <>
                        <Loader2 className="size-3.5 animate-spin text-cyan-400" />
                        <span>AI đang lập trình 10 mô hình...</span>
                      </>
                    ) : (
                      <>
                        <RefreshCw className="size-3.5 text-cyan-400" />
                        <span>Đổi 10 mô hình khác (Gemini)</span>
                      </>
                    )}
                  </button>
                </div>

                {kineticSuggesting && kineticSuggestions.length === 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 py-2">
                    {Array.from({ length: 10 }).map((_, idx) => (
                      <div key={idx} className="h-28 rounded-xl bg-surface-2 animate-pulse border border-line p-3 space-y-2">
                        <div className="h-4 bg-surface rounded w-3/4" />
                        <div className="h-3 bg-surface rounded w-full" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
                    {kineticSuggestions.map((topic) => {
                      const isSelected = selectedKineticTopicId === topic.id || kineticPrompt.includes(topic.title);
                      return (
                        <button
                          key={topic.id}
                          type="button"
                          onClick={() => handleSelectKineticSuggestion(topic)}
                          className={cn(
                            "group relative flex flex-col justify-between p-3 rounded-xl border text-left transition-all cursor-pointer shadow-2xs",
                            isSelected
                              ? "border-cyan-400 bg-cyan-400/10 shadow-sm ring-1 ring-cyan-400"
                              : "border-line bg-surface-2 hover:border-cyan-400/50 hover:bg-surface"
                          )}
                        >
                          <div>
                            <div className="flex items-center justify-between gap-1 mb-1.5">
                              <span className="text-xl">{topic.emoji || "⚡"}</span>
                              <span className="rounded bg-black/60 border border-line px-1.5 py-0.5 font-mono text-[9px] font-bold text-cyan-400 uppercase tracking-wider">
                                {topic.tag}
                              </span>
                            </div>
                            <h5 className="text-xs font-black text-ink line-clamp-1 group-hover:text-cyan-400 transition-colors">
                              {topic.title}
                            </h5>
                            <p className="text-[10.5px] text-ink-dim mt-1 line-clamp-2 leading-relaxed">
                              {topic.hook}
                            </p>
                          </div>
                          <div className="mt-2.5 pt-2 border-t border-line/40 flex items-center justify-between text-[9.5px]">
                            <span className={cn("font-bold", isSelected ? "text-cyan-400" : "text-ink-dim group-hover:text-ink")}>
                              {isSelected ? "✓ Đã chọn" : "Nhấp để chọn"}
                            </span>
                            <span className="text-cyan-400 font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                              ➔
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Loading State */}
              {kineticGenerating && (
                <div className="rounded-2xl border border-cyan-400/30 bg-cyan-950/20 p-8 text-center space-y-3">
                  <Loader2 className="size-7 animate-spin mx-auto text-cyan-400" />
                  <p className="text-xs font-bold text-ink">AI đang tính toán thông số & lập trình Cyber Kinetic (65s)...</p>
                  <p className="text-[11px] text-ink-dim">Tự động cấu trúc radar telemetry, hiệu ứng chữ phóng đại và khối wireframe 3D</p>
                </div>
              )}

              {/* Script & Beats Preview */}
              {kineticConfig && !kineticGenerating && (
                <div className="rounded-2xl border border-line bg-surface p-4 space-y-4">
                  <div className="flex items-center justify-between border-b border-line pb-2">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 font-mono">
                        {kineticConfig.series || "MENTAL MODEL"} · {kineticConfig.code}
                      </span>
                      <h3 className="text-sm font-black text-ink tracking-tight uppercase">{kineticConfig.headline}</h3>
                    </div>
                    <Badge tone="sage">
                      {kineticConfig.beats?.length || 5} Giai Đoạn Kinetic (65s)
                    </Badge>
                  </div>

                  {/* Terminal Script Box */}
                  <div className="rounded-xl border border-cyan-500/30 bg-[#08090C] p-4 text-cyan-50 shadow-inner font-mono">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 block mb-1">
                      Kịch bản hiển thị Terminal Cyberpunk (Tô sáng từ khóa):
                    </span>
                    <div
                      className="text-xs leading-relaxed font-semibold"
                      dangerouslySetInnerHTML={{ __html: kineticConfig.fullScriptHtml }}
                    />
                  </div>

                  {/* Beats List */}
                  <div className="space-y-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-ink-dim block">
                      5 Giai đoạn & Thông số Telemetry:
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {kineticConfig.beats?.map((b, i) => (
                        <div key={b.id || i} className="rounded-lg border border-line bg-surface-2 p-2.5 space-y-1 font-mono">
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="font-bold text-cyan-400">{b.phase}</span>
                            <span className="text-[9px] px-1 py-0.5 rounded bg-cyan-400/20 text-cyan-300 font-bold">
                              {b.metricBadge}
                            </span>
                          </div>
                          <div className="text-xs text-ink font-bold font-sans">
                            <span className="text-cyan-400 text-sm font-black">{b.bigText}</span> — {b.subText}
                          </div>
                          <p className="text-[11px] text-ink-dim font-sans italic leading-snug">"{b.spoken}"</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Render Option */}
              <div className="flex items-center justify-between rounded-xl border border-line bg-surface p-3">
                <div className="text-xs">
                  <span className="font-bold text-ink">Tự động Render MP4:</span>
                  <span className="text-ink-dim ml-2">Xuất video 1080x1920 hoàn chỉnh ngay khi bấm tạo</span>
                </div>
                <input
                  type="checkbox"
                  checked={alsoRender}
                  onChange={(e) => setAlsoRender(e.target.checked)}
                  className="size-4 rounded accent-cyan-400 cursor-pointer"
                />
              </div>
            </div>
          ) : videoType === "chalk" ? (
            <div className="space-y-4">
              {/* Top Configuration Grid: 3 Clean Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Card 1: Country & Voice */}
                <div className="rounded-xl border border-line bg-surface p-3 shadow-2xs">
                  <div className="flex items-center gap-1.5 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-dim">
                    <Globe className="size-3.5 text-emerald-500" />
                    <span>Quốc gia & Giọng đọc</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{currentCountry?.flag}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-ink truncate">
                        {currentCountry?.langName} ({selectedCountry.toUpperCase()})
                      </div>
                      <div className="text-[10px] text-ink-dim truncate">
                        {selectedVoice || currentCountry?.defaultVoice}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card 2: Audio & Ducking */}
                <div className="rounded-xl border border-line bg-surface p-3 shadow-2xs">
                  <div className="flex items-center gap-1.5 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-dim">
                    <Music className="size-3.5 text-amber-500" />
                    <span>Âm thanh & Ducking</span>
                  </div>
                  <div className="text-xs font-bold text-ink truncate">
                    BGM Geopolitical Drone + SFX
                  </div>
                  <div className="text-[10px] text-ink-dim mt-0.5">
                    Ducking tự động -22dB khi thuyết minh, tiếng phấn vẽ bảng
                  </div>
                </div>

                {/* Card 3: Archetype Format */}
                <div className="rounded-xl border border-line bg-surface p-3 shadow-2xs">
                  <div className="flex items-center gap-1.5 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-dim">
                    <Layers className="size-3.5 text-cyan-500" />
                    <span>Định dạng Chalkboard Map</span>
                  </div>
                  <div className="text-xs font-bold text-ink truncate">
                    Bản đồ bảng phấn Johnny Harris & RealLifeLore
                  </div>
                  <div className="text-[10px] text-ink-dim mt-0.5">
                    Định dạng dọc 9:16 (&gt;60s), nét vẽ tay SVG, zoom camera & mốc chiến lược
                  </div>
                </div>
              </div>

              {/* AI Chalk Prompt Generator */}
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/10 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400 font-bold">
                      🗺️
                    </span>
                    <div>
                      <h4 className="text-xs font-bold text-ink">Nhập chủ đề địa chính trị, biên giới hoặc điểm nóng</h4>
                      <p className="text-[11px] text-ink-dim">Tự động cấu trúc 8 phân cảnh tài liệu (&gt;60s) với bản đồ bảng đen, tọa độ chiến lược & camera zoom</p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={chalkGenerating}
                    onClick={() => {
                      const promptToSend = chalkPrompt.trim();
                      setChalkGenerating(true);
                      generateChalkTopic({ prompt: promptToSend, lang: selectedCountry, voice: selectedVoice })
                        .then((t) => {
                          setChalkConfig(t);
                          if (!promptToSend && (t.headline || t.topicTitle)) {
                            setChalkPrompt(t.headline || t.topicTitle);
                          }
                        })
                        .catch(console.error)
                        .finally(() => setChalkGenerating(false));
                    }}
                    className="cursor-pointer bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                  >
                    {chalkGenerating ? (
                      <>
                        <Loader2 className="size-3.5 animate-spin" />
                        <span>Đang dựng bản đồ địa chính trị...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="size-3.5" />
                        <span>AI Sinh Bản Đồ Phấn (&gt;60s)</span>
                      </>
                    )}
                  </Button>
                </div>

                <div className="relative flex items-center">
                  <input
                    type="text"
                    value={chalkPrompt}
                    onChange={(e) => setChalkPrompt(e.target.value)}
                    placeholder="Nhập điểm nóng địa lý (ví dụ: U.S. vs Iran, Eo biển Hormuz, Point Roberts bán đảo kẹt, Hành lang Suwałki NATO...)"
                    className="w-full h-10 rounded-xl border border-line bg-surface px-3 pr-8 text-xs text-ink placeholder:text-ink-dim focus:outline-none focus:border-emerald-500"
                  />
                  {chalkPrompt && (
                    <button
                      type="button"
                      onClick={() => setChalkPrompt("")}
                      className="absolute right-2.5 p-1 text-ink-dim hover:text-ink transition-colors cursor-pointer"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>

                {/* Quick Topic Chips */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[10px] font-bold text-ink-dim uppercase">Gợi ý điểm nóng:</span>
                  {[
                    "Mỹ vs Iran: Vị thế địa chiến lược",
                    "Điểm nghẽn Eo biển Hormuz",
                    "Point Roberts: Bán đảo kỳ lạ",
                    "Hành lang Suwałki: Tử huyệt NATO",
                    "Eo biển Malacca: Yết hầu năng lượng",
                    "Kaliningrad: Pháo đài giữa NATO",
                    "Eo biển Gibraltar: Cửa ngõ thế giới"
                  ].map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => {
                        setChalkPrompt(chip);
                        setChalkGenerating(true);
                        generateChalkTopic({ prompt: chip, lang: selectedCountry, voice: selectedVoice })
                          .then((t) => setChalkConfig(t))
                          .catch(console.error)
                          .finally(() => setChalkGenerating(false));
                      }}
                      className="cursor-pointer rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] text-ink-soft hover:border-emerald-500 hover:text-emerald-500 transition-all"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>

              {/* 10 AI-Suggested Chalk Topics */}
              <div className="rounded-2xl border border-emerald-500/30 bg-surface p-4 space-y-3 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="flex size-6 items-center justify-center rounded-md bg-emerald-500/20 text-emerald-400 text-xs">
                      🗺️
                    </span>
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-ink">
                        10 Điểm Nóng & Vùng Lãnh Thổ Địa Chính Trị Hấp Dẫn Nhất
                      </h4>
                      <p className="text-[11px] text-ink-dim">
                        Bấm vào một chủ đề để AI tự động vẽ bản đồ bảng phấn, ghim cứ điểm và viết kịch bản phóng sự (&gt;60s)
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={chalkSuggesting}
                    onClick={() => loadChalkSuggestions(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-line bg-surface-2 hover:bg-surface-3 text-xs font-bold text-ink cursor-pointer transition-all disabled:opacity-50 shadow-2xs hover:border-emerald-500/50"
                  >
                    {chalkSuggesting ? (
                      <>
                        <Loader2 className="size-3.5 animate-spin text-emerald-500" />
                        <span>AI đang chọn 10 chủ đề...</span>
                      </>
                    ) : (
                      <>
                        <RefreshCw className="size-3.5 text-emerald-500" />
                        <span>Đổi 10 chủ đề khác</span>
                      </>
                    )}
                  </button>
                </div>

                {chalkSuggesting && chalkSuggestions.length === 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 py-2">
                    {Array.from({ length: 10 }).map((_, idx) => (
                      <div key={idx} className="h-28 rounded-xl bg-surface-2 animate-pulse border border-line p-3 space-y-2">
                        <div className="h-4 bg-surface rounded w-3/4" />
                        <div className="h-3 bg-surface rounded w-full" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
                    {chalkSuggestions.map((topic) => {
                      const isSelected = selectedChalkTopicId === topic.id || chalkPrompt.includes(topic.title);
                      return (
                        <button
                          key={topic.id}
                          type="button"
                          onClick={() => handleSelectChalkSuggestion(topic)}
                          className={cn(
                            "group relative flex flex-col justify-between p-3 rounded-xl border text-left transition-all cursor-pointer shadow-2xs",
                            isSelected
                              ? "border-emerald-500 bg-emerald-500/10 shadow-sm ring-1 ring-emerald-500"
                              : "border-line bg-surface-2 hover:border-emerald-500/50 hover:bg-surface"
                          )}
                        >
                          <div>
                            <div className="flex items-center justify-between gap-1 mb-1.5">
                              <span className="text-xl">{topic.emoji || "🗺️"}</span>
                              <span className="rounded bg-black/60 border border-line px-1.5 py-0.5 font-mono text-[9px] font-bold text-emerald-400 uppercase tracking-wider">
                                {topic.tag}
                              </span>
                            </div>
                            <h5 className="text-xs font-black text-ink line-clamp-1 group-hover:text-emerald-500 transition-colors">
                              {topic.title}
                            </h5>
                            <p className="text-[10.5px] text-ink-dim mt-1 line-clamp-2 leading-relaxed">
                              {topic.hook}
                            </p>
                          </div>
                          <div className="mt-2.5 pt-2 border-t border-line/40 flex items-center justify-between text-[9.5px]">
                            <span className={cn("font-bold", isSelected ? "text-emerald-500" : "text-ink-dim group-hover:text-ink")}>
                              {isSelected ? "✓ Đã chọn" : "Nhấp để chọn"}
                            </span>
                            <span className="text-emerald-500 font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                              ➔
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Loading State */}
              {chalkGenerating && (
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-8 text-center space-y-3">
                  <Loader2 className="size-7 animate-spin mx-auto text-emerald-400" />
                  <p className="text-xs font-bold text-ink">AI đang thiết kế bản đồ bảng phấn & định vị tọa độ chiến lược (&gt;60s)...</p>
                  <p className="text-[11px] text-ink-dim">Tự động cấu trúc 8 phân cảnh tài liệu, nét vẽ phấn tay SVG và chuyển động camera</p>
                </div>
              )}

              {/* Script & Scenes Preview */}
              {chalkConfig && !chalkGenerating && (
                <div className="rounded-2xl border border-line bg-surface p-4 space-y-4">
                  <div className="flex items-center justify-between border-b border-line pb-2">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-500 font-mono">
                        {chalkConfig.headline || "ĐỊA CHÍNH TRỊ"} · BẢN ĐỒ BẢNG PHẤN
                      </span>
                      <h3 className="text-sm font-black text-ink tracking-tight">{chalkConfig.topicTitle}</h3>
                    </div>
                    <Badge tone="sage">
                      {chalkConfig.scenes?.length || 8} Phân Cảnh Bản Đồ (&gt;60s)
                    </Badge>
                  </div>

                  {/* Chalkboard Script Box */}
                  <div className="rounded-xl border border-emerald-600/30 bg-[#162521] p-4 text-emerald-50 shadow-inner">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 block mb-1">
                      Kịch bản tài liệu phóng sự địa lý:
                    </span>
                    <p className="text-xs leading-relaxed font-sans font-medium text-emerald-100">
                      {chalkConfig.headline || chalkConfig.scenes?.[0]?.line}
                    </p>
                  </div>

                  {/* Scenes List */}
                  <div className="space-y-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-ink-dim block">
                      8 Phân cảnh Bản đồ & Di chuyển Camera:
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                      {chalkConfig.scenes?.map((s, i) => (
                        <div key={s.id || i} className="rounded-lg border border-line bg-surface-2 p-2.5 space-y-1">
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="font-bold text-emerald-500 truncate">Cảnh {i + 1}: {s.header}</span>
                            <span className="text-[9px] px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-mono font-bold">
                              ~8s
                            </span>
                          </div>
                          <div className="text-[11px] text-ink-dim italic line-clamp-2">
                            "{s.line}"
                          </div>
                          {s.highlight && (
                            <div className="pt-1 flex flex-wrap gap-1">
                              <span className="text-[9px] px-1 rounded bg-black/40 text-emerald-300 font-mono truncate">
                                📍 {s.highlight.label || s.highlight.id}
                              </span>
                              {s.badge && (
                                <span className="text-[9px] px-1 rounded bg-emerald-500/20 text-emerald-300 font-mono">
                                  {s.badge}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Render Option */}
              <div className="flex items-center justify-between rounded-xl border border-line bg-surface p-3">
                <div className="text-xs">
                  <span className="font-bold text-ink">Tự động Render MP4:</span>
                  <span className="text-ink-dim ml-2">Xuất video 1080x1920 hoàn chỉnh (&gt;60s) ngay khi bấm tạo</span>
                </div>
                <input
                  type="checkbox"
                  checked={alsoRender}
                  onChange={(e) => setAlsoRender(e.target.checked)}
                  className="size-4 rounded accent-emerald-500 cursor-pointer"
                />
              </div>
            </div>
          ) : videoType === "tierlist" ? (
            <div className="space-y-4">
              {/* Top Configuration Grid: 3 Clean Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Card 1: Country & Voice */}
                <div className="rounded-xl border border-line bg-surface p-3 shadow-2xs">
                  <div className="flex items-center gap-1.5 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-dim">
                    <Globe className="size-3.5 text-amber-500" />
                    <span>Quốc gia & Giọng đọc</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{currentCountry?.flag}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-ink truncate">
                        {currentCountry?.langName} ({selectedCountry.toUpperCase()})
                      </div>
                      <div className="text-[10px] text-ink-dim truncate">
                        {selectedVoice || currentCountry?.defaultVoice}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card 2: Audio & SFX */}
                <div className="rounded-xl border border-line bg-surface p-3 shadow-2xs">
                  <div className="flex items-center gap-1.5 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-dim">
                    <Music className="size-3.5 text-rose-500" />
                    <span>Âm thanh & SFX Đập Thẻ</span>
                  </div>
                  <div className="text-xs font-bold text-ink truncate">
                    BGM Gaming Upbeat + Whoosh + Slam
                  </div>
                  <div className="text-[10px] text-ink-dim mt-0.5">
                    Âm thanh chốt bậc uy lực & rung camera vật lý
                  </div>
                </div>

                {/* Card 3: Format */}
                <div className="rounded-xl border border-line bg-surface p-3 shadow-2xs">
                  <div className="flex items-center gap-1.5 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-dim">
                    <Layers className="size-3.5 text-cyan-500" />
                    <span>Định dạng Tier List Ranking</span>
                  </div>
                  <div className="text-xs font-bold text-ink truncate">
                    Bảng 6 Bậc SSS - S - A - B - C - D
                  </div>
                  <div className="text-[10px] text-ink-dim mt-0.5">
                    Chuẩn Telegram Web.mp4 (9:16 Dọc, Review + Physics Slam)
                  </div>
                </div>
              </div>

              {/* AI Tier List Prompt Generator */}
              <div className="rounded-2xl border border-amber-500/30 bg-amber-950/10 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex size-7 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400 font-bold">
                      👑
                    </span>
                    <div>
                      <div className="text-xs font-black uppercase tracking-wider text-amber-400">
                        AI Generator — Xếp Hạng Bậc Tier List
                      </div>
                      <div className="text-[11px] text-ink-dim">
                        Nhập chủ đề xếp hạng (Game, đồ ăn, điện thoại, anime, công nghệ...)
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="relative">
                    <input
                      type="text"
                      value={tierListPrompt}
                      onChange={(e) => setTierListPrompt(e.target.value)}
                      placeholder="Ví dụ: 5 tựa game quản lý siêu thị & nấu ăn idle gây nghiện nhất..."
                      disabled={tierListGenerating}
                      className="w-full rounded-xl border border-line-strong bg-surface-2 px-3.5 py-2.5 text-xs text-ink placeholder:text-ink-dim focus:outline-none focus:border-amber-500 pr-28"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && tierListPrompt.trim() && !tierListGenerating) {
                          setTierListGenerating(true);
                          generateTierListTopic({ prompt: tierListPrompt.trim(), lang: selectedCountry, voice: selectedVoice })
                            .then(setTierListConfig)
                            .catch(console.error)
                            .finally(() => setTierListGenerating(false));
                        }
                      }}
                    />
                    <div className="absolute right-1.5 top-1.5 flex items-center gap-1">
                      <Button
                        size="sm"
                        disabled={!tierListPrompt.trim() || tierListGenerating}
                        onClick={() => {
                          setTierListGenerating(true);
                          generateTierListTopic({ prompt: tierListPrompt.trim(), lang: selectedCountry, voice: selectedVoice })
                            .then(setTierListConfig)
                            .catch(console.error)
                            .finally(() => setTierListGenerating(false));
                        }}
                        className="h-7 bg-amber-500 hover:bg-amber-600 text-black font-bold text-[11px] px-3 cursor-pointer"
                      >
                        {tierListGenerating ? <Loader2 className="size-3 animate-spin" /> : "AI Tạo Kịch Bản"}
                      </Button>
                    </div>
                  </div>

                  {/* Suggestions Chips */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {tierListSuggestions.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => handleSelectTierListSuggestion(t)}
                        disabled={tierListGenerating}
                        className={cn(
                          "flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-all cursor-pointer",
                          selectedTierListTopicId === t.id
                            ? "border-amber-500 bg-amber-500/10 text-amber-300 font-bold"
                            : "border-line bg-surface text-ink-dim hover:bg-surface-2 hover:text-ink"
                        )}
                      >
                        <span>{t.emoji}</span>
                        <span>{t.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Review & Script Card */}
              {tierListConfig && (
                <div className="rounded-2xl border border-line bg-surface p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-line pb-3">
                    <div>
                      <div className="text-sm font-black text-ink uppercase tracking-wide">
                        {tierListConfig.topicTitle}
                      </div>
                      <div className="text-xs font-bold text-cyan-400 mt-0.5">
                        {tierListConfig.headline}
                      </div>
                    </div>
                    <Badge tone="gold">
                      {tierListConfig.items?.length || 5} Ứng viên
                    </Badge>
                  </div>

                  {/* Items List */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {tierListConfig.items?.map((it, idx) => (
                      <div
                        key={it.id || idx}
                        className="flex items-start gap-3 rounded-xl border border-line/60 bg-ground/40 p-2.5"
                      >
                        <div className={cn(
                          "flex size-10 shrink-0 items-center justify-center rounded-lg font-black text-sm shadow-xs",
                          it.tier === "SSS" ? "bg-red-600 text-white" :
                          it.tier === "S" ? "bg-orange-500 text-white" :
                          it.tier === "A" ? "bg-amber-400 text-black" :
                          it.tier === "B" ? "bg-slate-400 text-black" :
                          it.tier === "C" ? "bg-emerald-600 text-white" :
                          "bg-cyan-500 text-black"
                        )}>
                          {it.tier}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-ink truncate">
                            {it.name}
                          </div>
                          <div className="text-[11px] text-ink-dim line-clamp-2 mt-0.5">
                            {it.review}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Render Option */}
              <div className="flex items-center justify-between rounded-xl border border-line bg-surface p-3">
                <div className="text-xs">
                  <span className="font-bold text-ink">Tự động Render MP4:</span>
                  <span className="text-ink-dim ml-2">Xuất video Tier List 1080x1920 hoàn chỉnh ngay khi bấm tạo</span>
                </div>
                <input
                  type="checkbox"
                  checked={alsoRender}
                  onChange={(e) => setAlsoRender(e.target.checked)}
                  className="size-4 rounded accent-amber-500 cursor-pointer"
                />
              </div>
            </div>
          ) : videoType === "wildlife" ? (
            <div className="space-y-4">
              {/* Top Configuration Grid: 3 Clean Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Card 1: Country & Voice */}
                <div className="rounded-xl border border-line bg-surface p-3 shadow-2xs">
                  <div className="flex items-center gap-1.5 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-dim">
                    <Globe className="size-3.5 text-emerald-500" />
                    <span>Quốc gia & Thuyết minh</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{currentCountry?.flag}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-ink truncate">
                        {currentCountry?.langName} ({selectedCountry.toUpperCase()})
                      </div>
                      <div className="text-[10px] text-ink-dim truncate">
                        {selectedVoice || currentCountry?.defaultVoice}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card 2: Audio & SFX */}
                <div className="rounded-xl border border-line bg-surface p-3 shadow-2xs">
                  <div className="flex items-center gap-1.5 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-dim">
                    <Music className="size-3.5 text-cyan-500" />
                    <span>Âm thanh & SFX Tự Nhiên</span>
                  </div>
                  <div className="text-xs font-bold text-ink truncate">
                    BGM Nature Soundscape + Animal Cues
                  </div>
                  <div className="text-[10px] text-ink-dim mt-0.5">
                    Tiếng thở, tiếng quạt sóng, sub-drop cú đớp tử thần
                  </div>
                </div>

                {/* Card 3: Format */}
                <div className="rounded-xl border border-line bg-surface p-3 shadow-2xs">
                  <div className="flex items-center gap-1.5 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-dim">
                    <Layers className="size-3.5 text-amber-500" />
                    <span>Định dạng Wildlife Viewfinder</span>
                  </div>
                  <div className="text-xs font-bold text-ink truncate">
                    Telephoto [400mm F/2.8] + 4 Chỉ Số Sinh Tồn
                  </div>
                  <div className="text-[10px] text-ink-dim mt-0.5">
                    Tốc độ, Lực cắn PSI, IQ săn mồi, Tỉ lệ thành công %
                  </div>
                </div>
              </div>

              {/* AI Wildlife Prompt Generator */}
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/10 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400 font-bold">
                      🐾
                    </span>
                    <div>
                      <div className="text-xs font-black uppercase tracking-wider text-emerald-400">
                        AI Generator — Thế Giới Động Vật Hoang Dã
                      </div>
                      <div className="text-[11px] text-ink-dim">
                        Nhập tên loài động vật hoặc tập tính sinh tồn kỳ vĩ (Orca, Đại bàng Harpy, Báo Cheetah, Lửng mật...)
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="relative">
                    <input
                      type="text"
                      value={wildlifePrompt}
                      onChange={(e) => setWildlifePrompt(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !wildlifeGenerating) {
                          handleGenerateWildlifeAi();
                        }
                      }}
                      placeholder="Ví dụ: Cá Voi Sát Thủ Orca, Đại Bàng Harpy rừng Amazon, Báo săn Cheetah 120km/h..."
                      className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-xs text-ink placeholder:text-ink-dim/50 focus:border-emerald-500 focus:outline-none pr-28"
                    />
                    <button
                      type="button"
                      disabled={wildlifeGenerating || !wildlifePrompt.trim()}
                      onClick={handleGenerateWildlifeAi}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-lg bg-emerald-500 text-white font-bold text-xs hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1.5 transition-colors"
                    >
                      {wildlifeGenerating ? (
                        <>
                          <Loader2 className="size-3.5 animate-spin" />
                          <span>Đang tạo...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="size-3.5" />
                          <span>Sinh kịch bản</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Suggestion Chips */}
                  <div className="space-y-1.5">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-ink-dim flex items-center gap-1">
                      <Flame className="size-3 text-emerald-500" />
                      <span>Chủ đề động vật gợi ý thịnh hành:</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {wildlifeSuggestions.map((sug) => (
                        <button
                          key={sug.id}
                          type="button"
                          onClick={() => handleSelectWildlifeSuggestion(sug)}
                          disabled={wildlifeGenerating}
                          className={cn(
                            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer",
                            selectedWildlifeTopicId === sug.id
                              ? "bg-emerald-500/20 border-emerald-500 text-emerald-400 font-bold shadow-xs"
                              : "bg-surface border-line text-ink-dim hover:border-emerald-500/60 hover:text-ink"
                          )}
                        >
                          <span>{sug.emoji}</span>
                          <span>{sug.title}</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-ground/50 text-emerald-400 font-mono">
                            {sug.tag}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Wildlife Spec Preview Card */}
              {wildlifeConfig && (
                <div className="rounded-2xl border border-line bg-surface p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-line pb-3">
                    <div>
                      <div className="text-sm font-black text-ink uppercase tracking-wide">
                        {wildlifeConfig.topicTitle}
                      </div>
                      <div className="text-xs font-bold text-emerald-400 mt-0.5 italic">
                        {wildlifeConfig.latinName} • {wildlifeConfig.habitat}
                      </div>
                    </div>
                    <Badge tone="gold">
                      {wildlifeConfig.scenes?.length || 6} Cảnh
                    </Badge>
                  </div>

                  {/* Stats Grid */}
                  {wildlifeConfig.stats && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-ground/40 p-3 rounded-xl border border-line/60 text-xs">
                      <div>
                        <div className="text-[10px] font-bold text-ink-dim uppercase">⚡ Tốc độ</div>
                        <div className="text-xs font-bold text-cyan-400 mt-0.5 font-mono">{wildlifeConfig.stats.speed}</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold text-ink-dim uppercase">🦷 Lực cắn</div>
                        <div className="text-xs font-bold text-emerald-400 mt-0.5 font-mono">{wildlifeConfig.stats.biteForce}</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold text-ink-dim uppercase">🧠 Trí tuệ</div>
                        <div className="text-xs font-bold text-amber-400 mt-0.5 font-mono">{wildlifeConfig.stats.tacticalIq}</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold text-ink-dim uppercase">🎯 Tỉ lệ săn</div>
                        <div className="text-xs font-bold text-rose-400 mt-0.5 font-mono">{wildlifeConfig.stats.successRate}</div>
                      </div>
                    </div>
                  )}

                  {/* Scenes List */}
                  <div className="space-y-2">
                    {wildlifeConfig.scenes?.map((sc, idx) => (
                      <div
                        key={sc.id || idx}
                        className="flex items-start gap-3 rounded-xl border border-line/60 bg-ground/40 p-2.5"
                      >
                        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400 font-bold text-xs font-mono">
                          {idx + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="px-1.5 py-0.5 rounded bg-surface border border-line text-[10px] font-bold text-emerald-400 uppercase font-mono">
                              {sc.badge || 'THÔNG SỐ'}
                            </span>
                            <span className="text-[10px] font-mono text-ink-dim">
                              {sc.telemetry}
                            </span>
                          </div>
                          <div className="text-xs text-ink mt-1 font-medium leading-relaxed">
                            {sc.line}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Render Option */}
              <div className="flex items-center justify-between rounded-xl border border-line bg-surface p-3">
                <div className="text-xs">
                  <span className="font-bold text-ink">Tự động Render MP4:</span>
                  <span className="text-ink-dim ml-2">Xuất video tài liệu động vật 1080x1920 hoàn chỉnh ngay khi bấm tạo</span>
                </div>
                <input
                  type="checkbox"
                  checked={alsoRender}
                  onChange={(e) => setAlsoRender(e.target.checked)}
                  className="size-4 rounded accent-emerald-500 cursor-pointer"
                />
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-6 py-4 bg-ground/80 backdrop-blur shrink-0">
          <div className="flex items-center gap-2 text-xs text-ink-dim">
            {videoType === "survival" ? (
              <>
                <span className="font-mono text-[11px] font-bold text-ink">
                  videos/{(survivalSlug.trim() || `survival-organs-${selectedCountry}`).toLowerCase().replace(/[^a-z0-9-]/g, "-")}/
                </span>
                <span>•</span>
                <span>{currentCountry?.flag} {currentCountry?.langName}</span>
                <span>•</span>
                <span className="text-terra font-bold">📈 Survival Tier List (65s)</span>
              </>
            ) : videoType === "science" ? (
              <>
                <span className="font-mono text-[11px] font-bold text-ink">
                  videos/science-{scienceTopic?.id || "nature"}-{selectedCountry}/
                </span>
                <span>•</span>
                <span>{currentCountry?.flag} {currentCountry?.langName}</span>
                <span>•</span>
                <span className="text-emerald-500 font-bold">🌱 Khoa Học Nhân Hoá (30-45s)</span>
              </>
            ) : videoType === "mystery" ? (
              <>
                <span className="font-mono text-[11px] font-bold text-ink">
                  videos/mystery-{mysteryConfig?.slug?.replace(/^mystery-/, '') || "archive"}-{selectedCountry}/
                </span>
                <span>•</span>
                <span>{currentCountry?.flag} {currentCountry?.langName}</span>
                <span>•</span>
                <span className="text-emerald-400 font-bold">🕵️‍♂️ Bí Ẩn Có Thật (60s-70s)</span>
              </>
            ) : videoType === "vox" ? (
              <>
                <span className="font-mono text-[11px] font-bold text-ink">
                  videos/{voxConfig?.slug || `vox-topic-${selectedCountry}`}/
                </span>
                <span>•</span>
                <span>{currentCountry?.flag} {currentCountry?.langName}</span>
                <span>•</span>
                <span className="text-amber-500 font-bold">✂️ Vox Motion Collage (65s)</span>
              </>
            ) : videoType === "newspaper" ? (
              <>
                <span className="font-mono text-[11px] font-bold text-ink">
                  videos/{newspaperConfig?.slug || `newspaper-topic-${selectedCountry}`}/
                </span>
                <span>•</span>
                <span>{currentCountry?.flag} {currentCountry?.langName}</span>
                <span>•</span>
                <span className="text-red-500 font-bold">📰 Báo Cũ Điều Tra (65s)</span>
              </>
            ) : videoType === "kinetic" ? (
              <>
                <span className="font-mono text-[11px] font-bold text-ink">
                  videos/{kineticConfig?.slug || `kinetic-topic-${selectedCountry}`}/
                </span>
                <span>•</span>
                <span>{currentCountry?.flag} {currentCountry?.langName}</span>
                <span>•</span>
                <span className="text-cyan-400 font-bold">⚡ Dark Cyber Kinetic (65s)</span>
              </>
            ) : videoType === "chalk" ? (
              <>
                <span className="font-mono text-[11px] font-bold text-ink">
                  videos/{chalkConfig?.slug || `chalk-topic-${selectedCountry}`}/
                </span>
                <span>•</span>
                <span>{currentCountry?.flag} {currentCountry?.langName}</span>
                <span>•</span>
                <span className="text-emerald-500 font-bold">🗺️ Bản Đồ Bảng Phấn (&gt;60s)</span>
              </>
            ) : videoType === "tierlist" ? (
              <>
                <span className="font-mono text-[11px] font-bold text-ink">
                  videos/{tierListConfig?.slug || `tierlist-topic-${selectedCountry}`}/
                </span>
                <span>•</span>
                <span>{currentCountry?.flag} {currentCountry?.langName}</span>
                <span>•</span>
                <span className="text-amber-500 font-bold">🏆 Tier List Xếp Hạng (60-90s)</span>
              </>
            ) : videoType === "wildlife" ? (
              <>
                <span className="font-mono text-[11px] font-bold text-ink">
                  videos/{wildlifeConfig?.slug || `wildlife-topic-${selectedCountry}`}/
                </span>
                <span>•</span>
                <span>{currentCountry?.flag} {currentCountry?.langName}</span>
                <span>•</span>
                <span className="text-emerald-500 font-bold">🐾 Thế Giới Động Vật (50-60s)</span>
              </>
            ) : spec && (
              <>
                <span className="font-mono text-[11px] font-bold text-ink">videos/{spec.slug}/</span>
                <span>•</span>
                <span>{currentCountry?.flag} {currentCountry?.langName}</span>
                {isAiTopic && (
                  <>
                    <span>•</span>
                    <span className="text-gold font-bold">✨ AI Generated</span>
                  </>
                )}
              </>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <Button variant="ghost" onClick={onClose} disabled={creating} className="cursor-pointer">
              Hủy
            </Button>
            <Button
              variant="primary"
              disabled={
                videoType === "survival"
                  ? creating
                  : videoType === "science"
                  ? !scienceTopic || creating || scienceGenerating
                  : videoType === "mystery"
                  ? !mysteryConfig || creating || mysteryGenerating
                  : videoType === "vox"
                  ? !voxConfig || creating || voxGenerating
                  : videoType === "newspaper"
                  ? !newspaperConfig || creating || newspaperGenerating
                  : videoType === "kinetic"
                  ? !kineticConfig || creating || kineticGenerating
                  : videoType === "chalk"
                  ? !chalkConfig || creating || chalkGenerating
                  : videoType === "tierlist"
                  ? !tierListConfig || creating || tierListGenerating
                  : videoType === "wildlife"
                  ? !wildlifeConfig || creating || wildlifeGenerating
                  : !spec || creating || loading
              }
              onClick={handleCreate}
              className="h-10 px-5 text-sm font-black shadow-md cursor-pointer"
            >
              {creating ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {videoType === "survival"
                    ? "Đang tạo video sinh tồn..."
                    : videoType === "science"
                    ? "Đang tạo video khoa học..."
                    : videoType === "mystery"
                    ? "Đang tạo video bí ẩn..."
                    : videoType === "vox"
                    ? "Đang tạo video Vox Collage..."
                    : videoType === "newspaper"
                    ? "Đang tạo video Báo Cũ Điều Tra..."
                    : videoType === "kinetic"
                    ? "Đang tạo video Cyber Kinetic..."
                    : videoType === "chalk"
                    ? "Đang tạo video Bản Đồ Phấn..."
                    : videoType === "tierlist"
                    ? "Đang tạo video Tier List..."
                    : videoType === "wildlife"
                    ? "Đang tạo video Thế Giới Động Vật..."
                    : isGlobalBatch
                    ? "Đang tạo 6 video toàn cầu..."
                    : "Đang tạo video..."}
                </>
              ) : (
                <>
                  <Play className="size-4 fill-current" />
                  {videoType === "survival"
                    ? "Tạo video Sinh tồn ngay"
                    : videoType === "science"
                    ? "Tạo video Khoa học ngay"
                    : videoType === "mystery"
                    ? "Tạo video Bí ẩn ngay"
                    : videoType === "vox"
                    ? "Tạo video Vox Collage ngay"
                    : videoType === "newspaper"
                    ? "Tạo video Báo Cũ ngay"
                    : videoType === "kinetic"
                    ? "Tạo video Cyber Kinetic ngay"
                    : videoType === "chalk"
                    ? "Tạo video Bản Đồ Phấn ngay"
                    : videoType === "tierlist"
                    ? "Tạo video Tier List ngay"
                    : videoType === "wildlife"
                    ? "Tạo video Thế Giới Động Vật ngay"
                    : isGlobalBatch
                    ? "Tạo 6 Video Toàn Cầu"
                    : "Tạo video ngay"}
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
