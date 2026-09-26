import { useCallback, useEffect, useRef, useState } from "react";
import { Edit3, Grid2x2, Play, Sparkles, Terminal } from "lucide-react";
import {
  getVideo,
  listVideos,
  startBatchGlobal,
  startRun,
  stopRun,
  streamRun,
  type LogLine,
  type Task,
  type TopicSpec,
  type VideoDetail,
  type VideoSummary,
} from "./api";
import { Card, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui";
import { RunConsole } from "./components/RunConsole";
import { TemplateReview } from "./components/TemplateReview";
import { NewVideoModal } from "./components/NewVideoModal";
import { PublishingKitTab } from "./components/PublishingKitTab";
import { ScriptEditorTab } from "./components/ScriptEditorTab";

import { StudioHeader } from "./components/layout/StudioHeader";
import { StudioSidebar } from "./components/layout/StudioSidebar";
import { VideoDetailHeader } from "./components/layout/VideoDetailHeader";
import { PreviewStageTab } from "./components/layout/PreviewStageTab";

const TEMPLATE_SLUG = "__template";

const readUrl = () => {
  const p = new URLSearchParams(location.search);
  return { v: p.get("v"), tab: p.get("tab") ?? "preview" };
};

const writeUrl = (v: string | null, tab: string) => {
  const p = new URLSearchParams();
  if (v) p.set("v", v);
  if (tab !== "preview") p.set("tab", tab);
  const next = p.toString() ? `?${p}` : location.pathname;
  if (next !== location.search) history.replaceState(null, "", next);
};

export default function App() {
  const [videos, setVideos] = useState<VideoSummary[] | null>(null);
  const [slug, setSlug] = useState<string | null>(readUrl().v);
  const [tab, setTab] = useState(readUrl().tab);
  const [detail, setDetail] = useState<VideoDetail | null>(null);

  // Fast-cut target duration tool state
  const [target, setTarget] = useState("");
  const [alsoRender, setAlsoRender] = useState(true);
  const [showFitTool, setShowFitTool] = useState(false);

  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Task runner state
  const [runId, setRunId] = useState<string | null>(null);
  const [task, setTask] = useState<Task | null>(null);
  const [log, setLog] = useState<LogLine[]>([]);
  const [running, setRunning] = useState(false);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const unsub = useRef<(() => void) | null>(null);

  // Modal state
  const [newModalOpen, setNewModalOpen] = useState(false);

  const refreshList = useCallback(() => {
    setRefreshing(true);
    return listVideos()
      .then((v) => {
        setVideos(v);
        setSlug((s) => s ?? v[0]?.slug ?? null);
      })
      .catch((e) => setError(String(e.message)))
      .finally(() => setRefreshing(false));
  }, []);

  useEffect(() => {
    refreshList();
  }, [refreshList]);

  useEffect(() => {
    if (!slug || slug === TEMPLATE_SLUG) return;
    setDetail(null);
    setTarget("");
    setError(null);
    getVideo(slug)
      .then(setDetail)
      .catch((e) => setError(String(e.message)));
  }, [slug]);

  useEffect(() => () => unsub.current?.(), []);

  useEffect(() => writeUrl(slug, tab), [slug, tab]);

  // Restore pane on browser back/forward navigation
  useEffect(() => {
    const onPop = () => {
      const u = readUrl();
      setSlug(u.v);
      setTab(u.tab);
    };
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);

  const handleCreateVideo = async (
    newSpec: TopicSpec,
    opts: { target: number; render: boolean },
  ) => {
    setSlug(newSpec.slug);
    setError(null);
    setLog([]);
    setExitCode(null);
    setTask("create");
    setTab("log");
    try {
      const { id } = await startRun(newSpec.slug, "create", {
        target: opts.target,
        render: opts.render,
        spec: newSpec,
      });
      setRunId(id);
      setRunning(true);
      unsub.current?.();
      unsub.current = streamRun(
        id,
        (l) => setLog((prev) => [...prev, l]),
        (code) => {
          setRunning(false);
          setExitCode(code);
          refreshList();
          getVideo(newSpec.slug)
            .then(setDetail)
            .catch(() => {});
        },
      );
    } catch (e: any) {
      setError(String(e.message));
      setTask(null);
    }
  };

  const handleBatchGlobal = async (
    topic: string,
    opts: { target: number; render: boolean },
  ) => {
    setError(null);
    setLog([]);
    setExitCode(null);
    setTask("batch_global");
    setTab("log");
    try {
      const { id } = await startBatchGlobal(topic, opts);
      setRunId(id);
      setRunning(true);
      unsub.current?.();
      unsub.current = streamRun(
        id,
        (l) => setLog((prev) => [...prev, l]),
        (code) => {
          setRunning(false);
          setExitCode(code);
          refreshList();
        },
      );
    } catch (e: any) {
      setError(String(e.message));
      setTask(null);
    }
  };

  const run = async (t: Task, opts?: { target?: number; render?: boolean }) => {
    if (!slug || slug === TEMPLATE_SLUG || running) return;
    setError(null);
    setLog([]);
    setExitCode(null);
    setTask(t);
    setTab("log");
    try {
      const { id } = await startRun(slug, t, opts);
      setRunId(id);
      setRunning(true);
      unsub.current?.();
      unsub.current = streamRun(
        id,
        (l) => setLog((prev) => [...prev, l]),
        (code) => {
          setRunning(false);
          setExitCode(code);
          refreshList();
          getVideo(slug)
            .then(setDetail)
            .catch(() => {});
        },
      );
    } catch (e) {
      setError(String((e as Error).message));
      setTask(null);
    }
  };

  const totalDur = videos?.reduce((a, v) => a + v.duration, 0) ?? 0;

  return (
    <div className="min-h-screen bg-ground flex flex-col selection:bg-gold selection:text-ink">
      {/* 1. Global Navigation Bar */}
      <StudioHeader
        videoCount={videos?.length ?? 0}
        totalDuration={totalDur}
        onOpenNewModal={() => setNewModalOpen(true)}
        onRefresh={refreshList}
        refreshing={refreshing}
      />

      {/* 2. Responsive Master-Detail Grid */}
      <div className="mx-auto w-full max-w-[1720px] flex-1 px-4 py-4 sm:px-6 grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)] items-start">
        {/* Left Sidebar: Master Video List, Filter, Search */}
        <StudioSidebar
          videos={videos}
          activeSlug={slug}
          onSelectSlug={(newSlug) => setSlug(newSlug)}
          onOpenNewModal={() => setNewModalOpen(true)}
          templateSlug={TEMPLATE_SLUG}
        />

        {/* Right Main Stage: Detail Header, Tabs, Workspace */}
        <main className="flex min-w-0 flex-col gap-4">
          {error && (
            <div
              role="alert"
              className="rounded-2xl border border-terra/50 bg-terra-bright/15 p-4 text-xs font-bold text-terra shadow-2xs animate-in fade-in"
            >
              {error}
            </div>
          )}

          {slug === TEMPLATE_SLUG ? (
            <TemplateReview />
          ) : !detail ? (
            <div className="flex flex-col gap-4">
              <Skeleton className="h-32 w-full rounded-2xl" />
              <Skeleton className="h-[520px] w-full rounded-2xl" />
            </div>
          ) : (
            <>
              {/* Video Detail Header with Format Banner & Action Toolbar */}
              <VideoDetailHeader
                detail={detail}
                running={running}
                target={target}
                setTarget={setTarget}
                alsoRender={alsoRender}
                setAlsoRender={setAlsoRender}
                showFitTool={showFitTool}
                setShowFitTool={setShowFitTool}
                onRun={run}
              />

              {/* Workspace Navigation Tabs */}
              <Tabs value={tab} onValueChange={setTab} className="w-full">
                <TabsList className="w-full sm:w-auto flex flex-wrap gap-1 p-1 rounded-2xl">
                  <TabsTrigger value="preview" className="rounded-xl flex-1 sm:flex-initial">
                    <span className="inline-flex items-center gap-1.5 font-bold">
                      <Play className="size-4" aria-hidden="true" />
                      <span>Xem Video</span>
                    </span>
                  </TabsTrigger>

                  <TabsTrigger value="script" className="rounded-xl flex-1 sm:flex-initial">
                    <span className="inline-flex items-center gap-1.5 font-bold">
                      <Edit3 className="size-4" aria-hidden="true" />
                      <span>Biên Tập Kịch Bản</span>
                    </span>
                  </TabsTrigger>

                  <TabsTrigger value="publishing" className="rounded-xl flex-1 sm:flex-initial">
                    <span className="inline-flex items-center gap-1.5 font-bold">
                      <Sparkles className="size-4 text-gold" aria-hidden="true" />
                      <span>Phát Hành & SEO</span>
                    </span>
                  </TabsTrigger>

                  <TabsTrigger value="frames" className="rounded-xl flex-1 sm:flex-initial">
                    <span className="inline-flex items-center gap-1.5 font-bold">
                      <Grid2x2 className="size-4" aria-hidden="true" />
                      <span>Snapshot</span>
                    </span>
                  </TabsTrigger>

                  <TabsTrigger value="log" className="rounded-xl flex-1 sm:flex-initial">
                    <span className="inline-flex items-center gap-1.5 font-bold">
                      <Terminal className="size-4" aria-hidden="true" />
                      <span>Nhật Ký (Log)</span>
                    </span>
                  </TabsTrigger>
                </TabsList>

                {/* Tab 1: Preview Stage (Dual Preview MP4 vs Live Canvas) */}
                <TabsContent value="preview">
                  <PreviewStageTab
                    detail={detail}
                    running={running}
                    onRender={() => run("render")}
                  />
                </TabsContent>

                {/* Tab 2: Script Editor */}
                <TabsContent value="script">
                  <ScriptEditorTab
                    detail={detail}
                    onRefresh={() =>
                      getVideo(detail.slug)
                        .then(setDetail)
                        .catch(() => {})
                    }
                    onRerunVo={() => run("vo")}
                    onRender={() => run("render")}
                    running={running}
                  />
                </TabsContent>

                {/* Tab 3: Publishing & SEO */}
                <TabsContent value="publishing">
                  <PublishingKitTab
                    detail={detail}
                    onRefresh={() =>
                      getVideo(detail.slug)
                        .then(setDetail)
                        .catch(() => {})
                    }
                  />
                </TabsContent>

                {/* Tab 4: Snapshots Contact Sheet */}
                <TabsContent value="frames">
                  {detail.hasSnapshot ? (
                    <Card className="overflow-hidden p-4 shadow-xs">
                      <div className="mb-3 flex items-center justify-between text-xs font-bold text-ink">
                        <span>Contact Sheet (Khung hình storyboard trích xuất từ composition)</span>
                        <a
                          href={`/api/videos/${detail.slug}/snapshot`}
                          target="_blank"
                          rel="noreferrer"
                          download={`${detail.slug}-snapshot.png`}
                          className="rounded-lg bg-surface-2 px-3 py-1 font-bold text-terra hover:underline border border-line"
                        >
                          Tải ảnh gốc
                        </a>
                      </div>
                      <img
                        src={`/api/videos/${detail.slug}/snapshot`}
                        alt={`Contact sheet các khung hình của video ${detail.title}`}
                        className="w-full rounded-xl border border-line/60 bg-black/5"
                      />
                    </Card>
                  ) : (
                    <Card className="p-8 text-center text-ink-soft">
                      <p className="font-bold text-ink">Chưa có snapshot cho video này</p>
                      <p className="mt-1 text-xs text-ink-dim">
                        Chạy lệnh <code className="font-mono bg-surface-2 px-2 py-0.5 rounded border border-line">npx hyperframes snapshot .</code> trong thư mục video để sinh contact sheet.
                      </p>
                    </Card>
                  )}
                </TabsContent>

                {/* Tab 5: Terminal Run Console */}
                <TabsContent value="log">
                  <RunConsole
                    task={task}
                    lines={log}
                    running={running}
                    exitCode={exitCode}
                    onStop={() => runId && stopRun(runId)}
                  />
                </TabsContent>
              </Tabs>
            </>
          )}
        </main>
      </div>

      {/* Categorized Template Video Creation Modal */}
      <NewVideoModal
        open={newModalOpen}
        onClose={() => setNewModalOpen(false)}
        onCreate={handleCreateVideo}
        onBatchGlobal={handleBatchGlobal}
      />
    </div>
  );
}
