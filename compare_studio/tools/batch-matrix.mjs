import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runMatrixBatch } from "../matrix/orchestrator/queue-worker.mjs";

export function parseBatchMatrixArgs(argv = process.argv.slice(2)) {
  const options = { channelCount: 10, workerCount: 2, imageTimeoutMin: 0 };
  const positional = [];
  const valueFlags = new Map([
    ["--topic", "topic"], ["--niche", "nicheId"], ["--channels", "channelCount"],
    ["--batch-id", "batchId"], ["--resume", "resumeBatchId"], ["--workers", "workerCount"],
    ["--image-timeout", "imageTimeoutMin"], ["--channel-ids", "channelIds"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--help" || flag === "-h") {
      options.help = true;
      continue;
    }
    if (["--dry-run", "--render", "--approve-render"].includes(flag)) {
      options[flag.slice(2).replace(/-([a-z])/gu, (_, char) => char.toUpperCase())] = true;
      continue;
    }
    if (flag === "--auto-publish") throw new Error("automatic publishing is not available in Sprint 6; use Sprint 7's explicit publish flow");
    if (valueFlags.has(flag)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
      const key = valueFlags.get(flag);
      options[key] = ["channelCount", "workerCount", "imageTimeoutMin"].includes(key) ? Number(value) : value;
      index += 1;
      continue;
    }
    if (flag.startsWith("-")) throw new Error(`unknown option: ${flag}`);
    positional.push(flag);
  }
  if (!options.topic && positional.length) options.topic = positional.shift();
  if (positional.length) throw new Error(`unexpected positional arguments: ${positional.join(" ")}`);
  if (options.dryRun && options.resumeBatchId) throw new Error("--dry-run cannot be combined with --resume");
  if (options.approveRender && !options.render) throw new Error("--approve-render requires --render");
  if (options.resumeBatchId && (options.topic || options.nicheId || options.batchId)) {
    throw new Error("--resume cannot be combined with --topic, --niche or --batch-id");
  }
  if (!options.resumeBatchId && !options.help && (!options.topic || !options.nicheId)) {
    throw new Error("--topic and --niche are required unless --resume is used");
  }
  if (!Number.isInteger(options.channelCount) || options.channelCount < 1) throw new Error("--channels must be a positive integer");
  if (!Number.isInteger(options.workerCount) || options.workerCount < 1 || options.workerCount > 10) throw new Error("--workers must be between 1 and 10");
  if (!Number.isFinite(options.imageTimeoutMin) || options.imageTimeoutMin < 0) throw new Error("--image-timeout must be zero or greater");
  options.renderRequested = Boolean(options.render);
  options.renderApproved = Boolean(options.render && options.approveRender);
  if (options.channelIds) {
    options.channelIds = options.channelIds.split(",").map((s) => s.trim()).filter(Boolean);
    if (options.channelIds.length < 1 || options.channelIds.length > 50) throw new Error("--channel-ids must contain 1–50 comma-separated channel IDs");
  }
  return options;
}

function usage() {
  return [
    "Usage:",
    "  node tools/batch-matrix.mjs --topic <topic> --niche <niche_id> [--channels 10] [--dry-run] [--render --approve-render]",
    "  node tools/batch-matrix.mjs --resume <batch_id> [--render --approve-render]",
    "",
    "Without --approve-render, --render only prepares the project for preview and stops at READY_TO_RENDER.",
  ].join("\n");
}

function summarize(result, options) {
  const jobs = result.execution?.jobs || result.jobs || [];
  const states = jobs.reduce((counts, job) => ({ ...counts, [job.state]: (counts[job.state] || 0) + 1 }), {});
  return {
    dry_run: Boolean(result.dry_run),
    batch_id: result.batch_id,
    topic_id: result.topic_id,
    plan: result.plan ? {
      requested_channels: result.plan.requested_channels,
      available_channels: result.plan.available_channels,
      channels: result.plan.channels,
    } : undefined,
    jobs: jobs.map(({ job_id, channel_id, engine_type, state, video_slug, current_scene_index, total_scenes, retry_count, error_message }) => ({
      job_id, channel_id, engine_type, state, video_slug, current_scene_index, total_scenes, retry_count, error_message,
    })),
    state_counts: states,
    render_approval_required: Boolean(options.renderRequested && !options.renderApproved),
  };
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseBatchMatrixArgs(argv);
  if (options.help) {
    console.log(usage());
    return { help: true };
  }
  const result = await runMatrixBatch({
    ...options,
    renderRequested: options.renderRequested,
    renderApproved: options.renderApproved,
    log: (line) => console.log(line),
  });
  const summary = summarize(result, options);
  console.log(JSON.stringify(summary, null, 2));
  return summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`[BATCH-MATRIX] ${error.message}`);
    process.exitCode = 1;
  });
}
