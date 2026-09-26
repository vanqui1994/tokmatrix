export type VideoSummary = {
  slug: string;
  title: string;
  lang: string;
  duration: number;
  lines: number;
  message: string;
  hasRender: boolean;
  render: { name: string; size: number; mtime: number } | null;
  hasSnapshot: boolean;
  createdAt: string;
};

export type ScriptLine = {
  n: number;
  spoken: string;
  caption: string;
  start: number | null;
  dur: number | null;
  beat: string;
  image?: string | null;
  side?: "left" | "right" | null;
  tierId?: number | string | null;
  title?: string;
  desc?: string;
  survival?: string;
  imagePrompt?: string;
  sceneId?: number | null;
  telemetry?: string;
  dialogueId?: number | null;
  speaker?: string;
  emotion?: string;
  name?: string;
  tier?: string;
  hook?: string;
  review?: string;
  verdict?: string;
  iconUrl?: string | null;
  mediaUrl?: string | null;
  [key: string]: any;
};

export type VideoDetail = VideoSummary & { script: ScriptLine[]; brief: string; spec?: TopicSpec };

export type Task = "check" | "render" | "vo" | "fit" | "create" | "batch_global";
export type LogLine = { t: number; stream: "out" | "err"; line: string };

export type PublishingTitle = {
  type: "hook" | "question" | "showdown";
  label: string;
  title: string;
};

export type PublishingChapter = {
  time: string;
  label: string;
};

export type PublishingKit = {
  slug: string;
  lang: string;
  labelLeft: string;
  labelRight: string;
  rootDuration: number;
  titles: PublishingTitle[];
  description: string;
  chapters: PublishingChapter[];
  hashtags: string[];
  hashtagString: string;
};

export type TopicCategory = { id: string; label: string; desc: string };
export type TopicSummary = {
  slug: string;
  category: string;
  labelLeft: string;
  labelRight: string;
  message: string;
  hasTranslation?: boolean;
};

export type SurvivalTier = {
  id: number;
  title: string;
  desc: string;
  survival: string;
  caption: string;
  iconSvg?: string;
};

export type SurvivalConfig = {
  lang: string;
  slug?: string;
  voice?: string;
  eyebrow: string;
  title: string;
  survivalLabel: string;
  prologueTag: string;
  prologueText: string;
  prologueSpoken: string;
  levelPrefix: string;
  finalTag: string;
  ctaTitle: string;
  ctaDesc: string;
  ctaValue: string;
  ctaText: string;
  ctaSpoken: string;
  reactionLabel: string;
  tiers: SurvivalTier[];
};

export type ScienceDialogue = {
  speaker: "charA" | "charB" | "narrator";
  text: string;
  emotion?: string;
  dur?: number;
};

export type ScienceTopic = {
  id: string;
  category: string;
  slug: string;
  title: string;
  eyebrow: string;
  question: string;
  scienceFact: string;
  characters: Record<string, { name: string; role: string; color: string }>;
  dialogues: ScienceDialogue[];
  visualElements?: Record<string, any>;
  voices: Record<string, string>;
};

export type MysteryScene = {
  id: string;
  line: string;
  telemetry: string;
  imagePrompt: string;
};

export type MysteryConfig = {
  slug: string;
  seriesTitle: string;
  eyebrow: string;
  topicTitle: string;
  watermark: string;
  fullScriptHtml: string;
  scenes: MysteryScene[];
  lang?: string;
  voice?: string;
};

export type VoxBeat = {
  id: number | string;
  act: string;
  name?: string;
  headline?: string;
  line: string;
  duration?: number;
  shotSize?: string;
  cameraMove?: string;
  bg?: string;
  scene?: string;
  elementMotion?: string;
  keyframePrompt?: string;
  stickerPrompt?: string;
  stickerLabel?: string;
  stickerRotation?: number;
  tapePosition?: string;
  doodleType?: string;
  badgeText?: string;
  note?: string;
  markerHighlight?: string;
};

export type VoxConfig = {
  slug: string;
  lang?: string;
  voice?: string;
  theme?: string;
  arc?: string;
  seriesTitle?: string;
  eyebrow: string;
  topicTitle: string;
  watermark?: string;
  fullScriptHtml: string;
  beats: VoxBeat[];
};

export type NewspaperSection = {
  id: number;
  slug: string;
  colSpan?: number;
  eyebrow?: string;
  headline: string;
  lead: string;
  spoken: string;
  hasRedCircle?: boolean;
  stamp?: string | null;
  photoPrompt?: string;
  photoCaption?: string;
  tapePosition?: string;
};

export type NewspaperConfig = {
  slug: string;
  lang?: string;
  voice?: string;
  publication: string;
  dateline: string;
  issueNumber: string;
  edition: string;
  headline: string;
  subheadline: string;
  fullScriptHtml: string;
  sections: NewspaperSection[];
};

export type KineticBeat = {
  id: number;
  phase: string;
  bigText: string;
  subText: string;
  spoken: string;
  accentWord: string;
  metricBadge: string;
  visualMode: string;
  duration?: number;
};

export type KineticConfig = {
  slug: string;
  lang?: string;
  voice?: string;
  series: string;
  code: string;
  headline: string;
  kicker: string;
  punchline: string;
  fullScriptHtml: string;
  beats: KineticBeat[];
};

export interface ChalkScene {
  id: string;
  line: string;
  header: string;
  camera?: { x?: number; y?: number; scale?: number };
  highlight?: { id?: string; label?: string; color?: string; star?: { x: number; y: number } };
  arrows?: Array<{ from: { x: number; y: number }; to: { x: number; y: number }; curve?: string; label?: string; color?: string }>;
  badge?: string;
  sfx?: string;
}

export interface ChalkConfig {
  id?: string;
  slug?: string;
  lang?: string;
  topicTitle: string;
  headline?: string;
  aspectRatio?: string;
  totalDuration?: number;
  voice?: string;
  scenes: ChalkScene[];
}

export interface TierListItem {
  id: string;
  name: string;
  subtitle?: string;
  tier: "SSS" | "S" | "A" | "B" | "C" | "D";
  hook?: string;
  review?: string;
  verdict?: string;
  iconUrl?: string;
  mediaUrl?: string;
}

export interface TierListConfig {
  id?: string;
  slug?: string;
  lang?: string;
  topicTitle: string;
  headline?: string;
  aspectRatio?: string;
  totalDuration?: number;
  voice?: string;
  items: TierListItem[];
}

export interface TierListSuggestedTopic {
  id: string;
  emoji: string;
  title: string;
  tag: string;
  hook: string;
  prompt: string;
}

export interface WildlifeScene {
  id: string;
  line: string;
  highlightWords?: string[];
  badge?: string;
  cameraAction?: string;
  telemetry?: string;
  visualPrompt?: string;
  start?: number;
  dur?: number;
  duration?: number;
  imgSrc?: string;
  voSrc?: string;
}

export interface WildlifeConfig {
  id?: string;
  slug?: string;
  lang?: string;
  topicTitle: string;
  latinName?: string;
  category?: string;
  iucnStatus?: string;
  habitat?: string;
  stats?: {
    speed?: string;
    biteForce?: string;
    tacticalIq?: string;
    successRate?: string;
  };
  soundscape?: string;
  totalDuration?: number;
  voice?: string;
  scenes: WildlifeScene[];
}

export interface WildlifeSuggestedTopic {
  id: string;
  emoji: string;
  title: string;
  tag: string;
  hook: string;
  prompt: string;
}

export type TopicSpec = {
  type?: "compare" | "survival" | "science" | "mystery" | "vox" | "newspaper" | "kinetic" | "chalk" | "tierlist" | "wildlife";
  slug: string;
  lang: string;
  title: string;
  labelLeft: string;
  labelRight: string;
  category?: string;
  message: string;
  captions: string[];
  spoken: string[];
  iconLeft?: { type: string; svg?: string; src?: string; alt?: string };
  iconRight?: { type: string; svg?: string; src?: string; alt?: string };
  script: string;
  voice?: string;
  bgmTrack?: string;
  bgmVolume?: number;
  enableSfx?: boolean;
  survivalConfig?: SurvivalConfig;
  scienceConfig?: ScienceTopic;
  mysteryConfig?: MysteryConfig;
  voxConfig?: VoxConfig;
  newspaperConfig?: NewspaperConfig;
  kineticConfig?: KineticConfig;
  chalkConfig?: ChalkConfig;
  tierListConfig?: TierListConfig;
  wildlifeConfig?: WildlifeConfig;
};

export type TopicGenerateParams = {
  category?: string;
  query?: string;
  prompt?: string;
  slug?: string;
  labelLeft?: string;
  labelRight?: string;
  message?: string;
  lang?: string;
  voice?: string;
  ai?: boolean;
};

export type VoiceOption = {
  id: string;
  name: string;
  gender: "male" | "female";
  desc: string;
  provider?: "edge" | "capcut";
};

export type CountryOption = {
  code: string;
  country: string;
  flag: string;
  langName: string;
  defaultVoice: string;
  voices: VoiceOption[];
};

export const getVoices = () =>
  fetch("/api/voices").then(json<{ countries: CountryOption[] }>);

const json = async <T>(res: Response): Promise<T> => {
  if (!res.ok) throw new Error(((await res.json().catch(() => null)) as any)?.error ?? `HTTP ${res.status}`);
  return res.json() as Promise<T>;
};

export const listVideos = () => fetch("/api/videos").then(json<VideoSummary[]>);
export const getVideo = (slug: string) => fetch(`/api/videos/${slug}`).then(json<VideoDetail>);

export const getTopics = (params?: { category?: string; query?: string; lang?: string }) => {
  const q = new URLSearchParams();
  if (params?.category) q.set("category", params.category);
  if (params?.query) q.set("query", params.query);
  if (params?.lang) q.set("lang", params.lang);
  const qs = q.toString() ? `?${q}` : "";
  return fetch(`/api/topics${qs}`).then(json<{ categories: TopicCategory[]; topics: TopicSummary[] }>);
};

export const generateTopic = (params: TopicGenerateParams) =>
  fetch("/api/topics/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  }).then(json<TopicSpec>);

export const generateSurvivalTopic = (params: { prompt?: string; query?: string; lang?: string; voice?: string }) =>
  fetch("/api/survival/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  }).then(json<SurvivalConfig>);

export const getScienceTopics = () =>
  fetch("/api/science/topics").then(
    json<{
      categories: { id: string; name: string; icon: string; desc: string }[];
      topics: { id: string; category: string; slug: string; title: string; question: string }[];
    }>
  );

export const generateScienceTopic = (params: { id?: string; prompt?: string; lang?: string }) =>
  fetch("/api/science/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  }).then(json<ScienceTopic>);

export const generateMysteryTopic = (params: { prompt?: string; query?: string; lang?: string; voice?: string }) =>
  fetch("/api/mystery/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  }).then(json<MysteryConfig>);

export interface MysterySuggestedTopic {
  id: string;
  emoji: string;
  title: string;
  tag: string;
  hook: string;
  prompt: string;
}

export const suggestMysteryTopics = (params: { lang?: string; count?: number }) =>
  fetch("/api/mystery/suggest-topics", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  }).then(json<{ topics: MysterySuggestedTopic[] }>);

export interface VoxSuggestedTopic {
  id: string;
  emoji: string;
  title: string;
  tag: string;
  hook: string;
  prompt: string;
}

export const generateVoxTopic = (params: { prompt?: string; lang?: string; voice?: string; theme?: string }) =>
  fetch("/api/vox/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  }).then(json<VoxConfig>);

export const suggestVoxTopics = (params: { lang?: string; count?: number }) =>
  fetch("/api/vox/suggest-topics", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  }).then(json<{ topics: VoxSuggestedTopic[] }>);

export interface NewspaperSuggestedTopic {
  id: string;
  emoji: string;
  title: string;
  tag: string;
  hook: string;
  prompt: string;
}

export const generateNewspaperTopic = (params: { prompt?: string; lang?: string; voice?: string }) =>
  fetch("/api/newspaper/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  }).then(json<NewspaperConfig>);

export const suggestNewspaperTopics = (params: { lang?: string; count?: number }) =>
  fetch("/api/newspaper/suggest-topics", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  }).then(json<{ topics: NewspaperSuggestedTopic[] }>);

export interface KineticSuggestedTopic {
  id: string;
  emoji: string;
  title: string;
  tag: string;
  hook: string;
  prompt: string;
}

export const generateKineticTopic = (params: { prompt?: string; lang?: string; voice?: string }) =>
  fetch("/api/kinetic/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  }).then(json<KineticConfig>);

export const suggestKineticTopics = (params: { lang?: string; count?: number }) =>
  fetch("/api/kinetic/suggest-topics", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  }).then(json<{ topics: KineticSuggestedTopic[] }>);

export interface ChalkSuggestedTopic {
  id: string;
  emoji: string;
  title: string;
  tag: string;
  hook: string;
  prompt: string;
}

export const generateChalkTopic = (params: { prompt?: string; lang?: string; voice?: string; aspectRatio?: string }) =>
  fetch("/api/chalk/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  }).then(json<ChalkConfig>);

export const suggestChalkTopics = (params: { lang?: string; count?: number }) =>
  fetch("/api/chalk/suggest-topics", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  }).then(json<{ topics: ChalkSuggestedTopic[] }>);

export const generateTierListTopic = (params: { prompt?: string; lang?: string; voice?: string }) =>
  fetch("/api/tierlist/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  }).then(json<TierListConfig>);

export const suggestTierListTopics = (params: { lang?: string; count?: number }) =>
  fetch("/api/tierlist/suggest-topics", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  }).then(json<{ topics: TierListSuggestedTopic[] }>);

export const generateWildlifeTopic = (params: { prompt?: string; lang?: string; voice?: string }) =>
  fetch("/api/wildlife/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  }).then(json<WildlifeConfig>);

export const suggestWildlifeTopics = (params: { lang?: string; count?: number }) =>
  fetch("/api/wildlife/suggest-topics", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  }).then(json<{ topics: WildlifeSuggestedTopic[] }>);

export type ImageCandidate = {
  title: string;
  description: string;
  url: string;
  source: "wikipedia" | "commons" | "pollinations";
  width?: number;
  height?: number;
};

export const searchImages = (q: string, mode: "real" | "ai" | "all" = "all") =>
  fetch(`/api/images/search?q=${encodeURIComponent(q)}&mode=${mode}`).then(
    json<{ images: ImageCandidate[] }>,
  );

export const startRun = (
  slug: string,
  task: Task,
  opts?: { target?: number; render?: boolean; spec?: TopicSpec },
) =>
  fetch("/api/runs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ slug, task, ...opts }),
  }).then(json<{ id: string; slug: string; task: Task }>);

export const stopRun = (id: string) => fetch(`/api/runs/${id}/stop`, { method: "POST" });

/** Subscribes to a run's log stream. Returns an unsubscribe function. */
export function streamRun(
  id: string,
  onLine: (l: LogLine) => void,
  onDone: (code: number) => void,
): () => void {
  const es = new EventSource(`/api/runs/${id}/stream`);
  es.onmessage = (e) => onLine(JSON.parse(e.data));
  es.addEventListener("done", (e) => {
    onDone(JSON.parse((e as MessageEvent).data).code);
    es.close();
  });
  es.onerror = () => es.close();
  return () => es.close();
}

export const getPublishingKit = (slug: string) =>
  fetch(`/api/videos/${slug}/publishing-kit`).then(json<PublishingKit>);

export const editScript = (
  slug: string,
  captions: string[],
  tiersData?: Array<{ title?: string; desc?: string; survival?: string }>,
  scenesData?: Array<{ telemetry?: string }>,
  dialoguesData?: Array<{ speaker?: string; emotion?: string }>,
) =>
  fetch(`/api/videos/${slug}/edit-script`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ captions, tiersData, scenesData, dialoguesData }),
  }).then(json<{ ok: boolean; slug: string; root: number }>);

export type ChangeImagePayload = {
  target: string;
  type: "upload" | "url" | "ai";
  data?: string;
  url?: string;
  prompt?: string;
};

export const changeImage = (slug: string, payload: ChangeImagePayload) =>
  fetch(`/api/videos/${slug}/change-image`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  }).then(json<{ ok: boolean; slug: string; target: string; imageUrl: string }>);

export const startBatchGlobal = (
  topic: string,
  opts?: { target?: number; render?: boolean },
) =>
  fetch("/api/runs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ slug: "batch-global", task: "batch_global", topic, ...opts }),
  }).then(json<{ id: string; slug: string; task: Task }>);

// ==========================================
// CINEMA SOUNDSCAPE & AUTO-SFX ENGINE
// ==========================================

export type SfxItem = {
  id: string;
  name: string;
  icon: string;
  category: "impact" | "tension" | "evidence" | "accent" | "payoff" | "transition";
  file: string;
  duration: number;
  defaultVolume: number;
  description: string;
};

export type SoundscapePreset = {
  style: string;
  label: string;
  defaultBgm: string;
  ambientVol: number;
  boostVol: number;
  primarySfx: string[];
  pacingMinGap: number;
};

export type DetectedSfxResult = {
  cues: Array<{
    id: string;
    sfxId: string;
    start: number;
    duration: number;
    volume: number;
    track: number;
    reason: string;
  }>;
  duckingSegments: Array<{
    start: number;
    duration: number;
    mediaStart: number;
    volume: number;
    isBoost: boolean;
  }>;
  totalCues: number;
};

export const getSfxCatalog = () =>
  fetch("/api/audio/sfx").then(json<{ sfx: SfxItem[] }>);

export const getSoundscapePresets = () =>
  fetch("/api/audio/presets").then(json<{ presets: Record<string, SoundscapePreset> }>);

export const detectSfx = (payload: {
  archetype: string;
  items: Array<{ start?: number; dur?: number; text?: string; caption?: string }>;
  totalDuration?: number;
  ambientVol?: number;
  boostVol?: number;
}) =>
  fetch("/api/audio/detect-sfx", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  }).then(json<DetectedSfxResult>);


