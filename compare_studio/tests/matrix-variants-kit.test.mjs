// Kit core: stage hooks and frame/header CSS that every engine's variants share.
import assert from "node:assert/strict";
import test from "node:test";
import { getVariant } from "../matrix/render/variants/index.mjs";
import { defaultDna } from "../matrix/render/variants/dna.mjs";
import { resolveCreativeContext } from "../matrix/render/variants/kit/resolve.mjs";
import { buildStage } from "../matrix/render/variants/kit/stage.mjs";
import { frameCss } from "../matrix/render/variants/kit/frames.mjs";
import { FIT_SCRIPT } from "../matrix/render/variants/kit/fit.mjs";
import { lintVariantHtml } from "../matrix/render/variants/kit/lint.mjs";

function stageCtx() {
  const variant = getVariant("mystery/reference-dossier", { allowReference: true });
  const creative = resolveCreativeContext({ variant, dna: defaultDna(variant, "evidence_strip"), lang: "de", channelId: "c1", slug: "kit-test" });
  const scenes = [0, 1].map((index) => ({ index, start: index * 4, duration: 4, line: `Zeile ${index}`, voSrc: `assets/audio/vo-${index}.mp3`, imgSrc: `assets/images/scene-${index}.jpg` }));
  return { slug: "kit-test", title: "Titel", lang: "de", totalDuration: 8, cinemaAudioHtml: "", creative, scenes };
}

const baseDesign = {
  header: { style: "label_title", region: { x: 60, y: 110, w: 960, h: 220 } },
  visual: { frame: "plain", region: { x: 60, y: 400, w: 960, h: 900 } },
  text: { style: "panel", region: { x: 60, y: 1400, w: 960, h: 300 } },
};

test("design.underlay renders inside the background clip, below the scenes, with its css and tweens", () => {
  const underlay = () => ({
    html: '<div id="u-grid" class="u-grid"></div>',
    css: ".u-grid{position:absolute;inset:0}",
    tweens: [{ method: "fromTo", target: "#u-grid", from: { opacity: 0 }, vars: { opacity: 1, duration: 1 }, at: 0 }],
  });
  const { html } = buildStage(stageCtx(), { ...baseDesign, underlay }, { ui: { label: "AKTE" } });
  const bg = html.indexOf('id="v-bg"');
  const grid = html.indexOf('id="u-grid"');
  const firstScene = html.indexOf('id="v-scene-0"');
  assert.ok(bg >= 0 && bg < grid && grid < html.indexOf('id="v-head"') && grid < firstScene, "underlay sits in the v-bg clip");
  assert.match(html, /\.u-grid\{position:absolute;inset:0\}/u);
  assert.match(html, /#u-grid/u);
  assert.deepEqual(lintVariantHtml(html), []);
  const without = buildStage(stageCtx(), baseDesign, { ui: { label: "AKTE" } }).html;
  assert.doesNotMatch(without, /id="v-underlay"/u);
});

test("label_title keeps its label on one line within the header width", () => {
  const { html } = buildStage(stageCtx(), baseDesign, { ui: { label: "STRENG GEHEIME ERMITTLUNGSAKTE" } });
  assert.match(html, /\.h-label\{[^}]*white-space:nowrap/u);
  assert.match(html, /class="h-label" style="left:60px;top:110px;max-width:960px"/u);
});

test("scope isolates its reticle and stamp perforates only the edges", () => {
  const css = frameCss(["scope", "stamp"]);
  assert.match(css, /\.f-scope\{[^}]*isolation:isolate/u, "scene labels over the scope must not sit under the crosshair");
  const stamp = css.match(/\.f-stamp\{[^}]*\}/u)[0];
  assert.match(stamp, /[^-]mask:linear-gradient\(#000,#000\) 13px 13px\/calc\(100% - 26px\) calc\(100% - 26px\) no-repeat,radial-gradient/u);
  assert.match(stamp, /-webkit-mask:linear-gradient\(#000,#000\) 13px 13px/u);
});

test("fit script compresses nowrap text horizontally once data-fit-min is reached", () => {
  assert.match(FIT_SCRIPT, /\(nowrap\|pre\)/u);
  assert.match(FIT_SCRIPT, /el\.style\.scale = \(availW\(\) \/ el\.scrollWidth\)/u);
  assert.match(FIT_SCRIPT, /el\.style\.scale = "";/u, "a refit starts from the unscaled size");
});
