"""Generate character contact sheets and visual review images."""

import json
from pathlib import Path
from typing import Dict, Any, List, Optional
from playwright.sync_api import sync_playwright

from bkt_web.remake_vector import STATIC_DIR
from tests.test_remake_vector_regression import load_engine_code


def generate_character_sheet(
    page,
    char_id: str,
    char_meta: Dict[str, Any],
    clips: List[Dict[str, Any]],
    out_file: Path,
) -> None:
    """Render a comprehensive contact sheet for a character."""
    rig = char_meta.get("rig", "chibi_boy")
    outfit = char_meta.get("outfit")
    style = char_meta.get("style", {})
    label = char_meta.get("label", {}).get("en", char_id)
    markets = ", ".join(char_meta.get("markets", []))
    role = char_meta.get("role", "hero")
    props = char_meta.get("props", [])

    page.evaluate("""([char_id, label, rig, outfit, style, markets, role, props, clips]) => {
        const canvas = document.getElementById('sheet-canvas');
        canvas.width = 1280;
        canvas.height = 960;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, 1280, 960);

        // Header
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 26px sans-serif';
        ctx.fillText(label + ' (' + char_id + ')', 40, 50);
        ctx.font = '15px sans-serif';
        ctx.fillStyle = '#475569';
        ctx.fillText('Rig: ' + rig + ' | Outfit: ' + (outfit || 'none') + ' | Role: ' + role + ' | Markets: ' + (markets || 'archived') + ' | Props: ' + (props.join(', ') || 'none'), 40, 80);

        // Grid dividers
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1;
        ctx.strokeRect(40, 100, 1200, 240); // Sizes & expressions
        ctx.strokeRect(40, 360, 1200, 560); // Clips

        // Section 1: Standing sizes (small, medium, large)
        ctx.fillStyle = '#334155';
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText('Standing Poses (120px, 200px, 280px)', 50, 128);

        const sizes = [110, 160, 220];
        const sizeX = [120, 260, 440];
        sizes.forEach((h, i) => {
            const story = {
                id: 'sheet-size-' + i, renderer: 'native-vector-v1', duration: 1,
                characters: [{ id: 'hero', asset: rig, outfit: outfit, style: style }],
                scenes: [{
                    renderer: 'native-vector-v1', start_time: 0, end_time: 1,
                    characters_present: ['hero'],
                    background: { preset: 'garden' },
                    poses: { hero: [{ time: 0, x: 288, y: 810, height: h, expression: 'happy' }] },
                    actions: []
                }]
            };
            const c = document.createElement('canvas'); c.width = 576; c.height = 1024;
            new RemakeVector.Renderer(c, window.cat, story).render(0);
            ctx.drawImage(c, 288 - h * 0.7, 810 - h * 1.08, h * 1.4, h * 1.25, sizeX[i] - h * 0.4, 340 - h, h * 0.8, h);
            ctx.fillStyle = '#64748b';
            ctx.font = '12px sans-serif';
            ctx.fillText(h + 'px', sizeX[i] - 14, 355);
        });

        // Section 2: 4 Expressions
        ctx.fillStyle = '#334155';
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText('Expressions (neutral, happy, surprised, worried)', 640, 128);
        const exps = ['neutral', 'happy', 'surprised', 'worried'];
        const expX = [680, 800, 920, 1040];
        exps.forEach((exp, i) => {
            const h = 180;
            const story = {
                id: 'sheet-exp-' + i, renderer: 'native-vector-v1', duration: 1,
                characters: [{ id: 'hero', asset: rig, outfit: outfit, style: style }],
                scenes: [{
                    renderer: 'native-vector-v1', start_time: 0, end_time: 1,
                    characters_present: ['hero'],
                    background: { preset: 'garden' },
                    poses: { hero: [{ time: 0, x: 288, y: 810, height: h, expression: exp }] },
                    actions: []
                }]
            };
            const c = document.createElement('canvas'); c.width = 576; c.height = 1024;
            new RemakeVector.Renderer(c, window.cat, story).render(0);
            ctx.drawImage(c, 288 - 70, 810 - h * 1.05, 140, 140, expX[i] - 50, 160, 100, 100);
            ctx.fillStyle = '#64748b';
            ctx.font = '12px sans-serif';
            ctx.fillText(exp, expX[i] - 20, 280);
        });

        // Section 3: Clips (up to 3 clips, 4 frames each: 0%, 33%, 66%, 100%)
        ctx.fillStyle = '#334155';
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText('Clips Preview (0%, 33%, 66%, 100%)', 50, 390);

        const sampleClips = clips.slice(0, 3);
        sampleClips.forEach((clip, cIdx) => {
            const yRow = 420 + cIdx * 165;
            ctx.fillStyle = '#1e293b';
            ctx.font = 'bold 13px monospace';
            ctx.fillText('Clip ' + (cIdx + 1) + ': ' + clip.kind + ' (' + clip.duration + 's)', 60, yRow + 20);

            const heroId = 'hero';
            const safeActions = (clip.actions || [])
                .filter(a => !a.target || a.target === heroId || a.target === char_id)
                .map(a => ({ ...a, actor: heroId, target: a.target ? heroId : undefined }));
            const story = {
                id: 'sheet-clip-' + cIdx, renderer: 'native-vector-v1', duration: Math.max(0.1, clip.duration),
                characters: [{ id: heroId, asset: rig, outfit: outfit, style: style }],
                scenes: [{
                    renderer: 'native-vector-v1', start_time: 0, end_time: Math.max(0.1, clip.duration),
                    characters_present: [heroId],
                    background: { preset: 'garden' },
                    poses: {
                        [heroId]: clip.keyframes.map(k => ({
                            time: k.t,
                            x: 288 + (k.dx || 0),
                            y: 810 + (k.dy || 0),
                            height: k.height || 220,
                            flip: k.flip || false,
                            expression: k.expression || 'happy',
                            walk: k.walk || 0,
                            stride: k.stride || 0,
                        }))
                    },
                    actions: safeActions
                }]
            };

            const c = document.createElement('canvas'); c.width = 576; c.height = 1024;
            const r = new RemakeVector.Renderer(c, window.cat, story);
            const fractions = [0.0, 0.33, 0.66, 1.0];
            fractions.forEach((frac, fIdx) => {
                const t = clip.duration * frac;
                r.render(t);
                const destX = 360 + fIdx * 200;
                ctx.strokeStyle = '#cbd5e1';
                ctx.strokeRect(destX - 2, yRow - 2, 164, 144);
                ctx.drawImage(c, 288 - 140, 810 - 320, 280, 340, destX, yRow, 160, 140);
                ctx.fillStyle = '#64748b';
                ctx.font = '11px sans-serif';
                ctx.fillText((frac * 100).toFixed(0) + '% (' + t.toFixed(2) + 's)', destX + 45, yRow + 155);
            });
        });
    }""", [char_id, label, rig, outfit, style, markets, role, list(props), clips])

    out_file.parent.mkdir(parents=True, exist_ok=True)
    canvas = page.locator("#sheet-canvas")
    canvas.screenshot(path=str(out_file))


def render_all_sheets(
    characters_db: Dict[str, Any],
    clips_db: Dict[str, Any],
    out_dir: Path,
    limit: Optional[int] = None,
) -> List[Path]:
    """Generate contact sheets for characters."""
    cat = json.loads((STATIC_DIR / "remake_vector_catalog.json").read_text(encoding="utf-8"))
    engine_js = load_engine_code()

    rendered = []
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--disable-gpu", "--disable-gpu-rasterization", "--force-color-profile=srgb"])
        page = browser.new_page()
        page.set_content(f"""
        <html><body>
        <canvas id="sheet-canvas" width="1280" height="960"></canvas>
        <script>{engine_js}</script>
        <script>window.cat = {json.dumps(cat)};</script>
        </body></html>
        """)

        chars = list(characters_db.items())
        if limit:
            chars = chars[:limit]

        for char_id, char_meta in chars:
            char_clips = [clips_db[cid] for cid in char_meta.get("clips", []) if cid in clips_db]
            out_file = out_dir / f"{char_id}.png"
            generate_character_sheet(page, char_id, char_meta, char_clips, out_file)
            rendered.append(out_file)

        browser.close()

    return rendered


def render_hat_comparison(out_file: Path) -> Path:
    """Render side-by-side comparison of farmer_woman and fisherman with conical, straw, cap, none."""
    cat = json.loads((STATIC_DIR / "remake_vector_catalog.json").read_text(encoding="utf-8"))
    engine_js = load_engine_code()

    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--disable-gpu", "--disable-gpu-rasterization", "--force-color-profile=srgb"])
        page = browser.new_page()
        page.set_content(f"""
        <html><body>
        <canvas id="hat-canvas" width="1280" height="720"></canvas>
        <script>{engine_js}</script>
        <script>
        window.cat = {json.dumps(cat)};
        window.drawHatComparison = function() {{
            const canvas = document.getElementById('hat-canvas');
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#f8fafc';
            ctx.fillRect(0, 0, 1280, 720);

            ctx.fillStyle = '#0f172a';
            ctx.font = 'bold 24px sans-serif';
            ctx.fillText('So sánh trường Style "hat": conical | straw | cap | none', 40, 50);
            ctx.font = '15px sans-serif';
            ctx.fillStyle = '#64748b';
            ctx.fillText('Hàng 1: farmer_woman | Hàng 2: fisherman', 40, 80);

            const hats = ['conical', 'straw', 'cap', 'none'];
            const labels = ['conical (mặc định cũ)', 'straw (mũ rơm vành tròn)', 'cap (mũ lưỡi trai)', 'none (tóc trần)'];
            const rigs = ['farmer_woman', 'fisherman'];

            rigs.forEach((rig, rIdx) => {{
                const yBase = 120 + rIdx * 280;
                ctx.fillStyle = '#1e293b';
                ctx.font = 'bold 18px sans-serif';
                ctx.fillText(rig, 40, yBase + 140);

                hats.forEach((hat, hIdx) => {{
                    const xBase = 220 + hIdx * 250;
                    const story = {{
                        id: 'hat-test-' + rig + '-' + hat, renderer: 'native-vector-v1', duration: 1,
                        characters: [{{ id: 'hero', asset: rig, style: {{ hat: hat }} }}],
                        scenes: [{{
                            renderer: 'native-vector-v1', start_time: 0, end_time: 1,
                            characters_present: ['hero'],
                            background: {{ preset: 'garden' }},
                            poses: {{ hero: [{{ time: 0, x: 288, y: 810, height: 340, expression: 'happy' }}] }},
                            actions: []
                        }}]
                    }};
                    const c = document.createElement('canvas'); c.width = 576; c.height = 1024;
                    new RemakeVector.Renderer(c, window.cat, story).render(0);
                    ctx.drawImage(c, 288 - 110, 810 - 365, 220, 380, xBase, yBase, 180, 240);
                    ctx.strokeStyle = '#cbd5e1';
                    ctx.strokeRect(xBase, yBase, 180, 240);
                    if (rIdx === 0) {{
                        ctx.fillStyle = '#334155';
                        ctx.font = 'bold 12px sans-serif';
                        ctx.fillText(labels[hIdx], xBase + 5, yBase - 10);
                    }}
                }});
            }});
        }};
        </script>
        </body></html>
        """)

        page.evaluate("window.drawHatComparison()")
        out_file.parent.mkdir(parents=True, exist_ok=True)
        page.locator("#hat-canvas").screenshot(path=str(out_file))
        browser.close()

    return out_file


def render_neutral_stories_review(out_dir: Path) -> List[Path]:
    """Render 3 keyframes each of farm-life__neutral and giant_radish__neutral."""
    from bkt_web.vector_characters.extract import build_neutral_stories
    neutrals = build_neutral_stories()
    cat = json.loads((STATIC_DIR / "remake_vector_catalog.json").read_text(encoding="utf-8"))
    engine_js = load_engine_code()

    rendered = []
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--disable-gpu", "--disable-gpu-rasterization", "--force-color-profile=srgb"])
        page = browser.new_page()
        page.set_content(f"""
        <html><body>
        <canvas id="story-canvas" width="576" height="1024"></canvas>
        <script>{engine_js}</script>
        <script>window.cat = {json.dumps(cat)};</script>
        </body></html>
        """)

        for story in neutrals:
            sid = story["id"]
            d = story["duration"]
            times = [d * 0.2, d * 0.5, d * 0.85]
            for idx, t in enumerate(times):
                page.evaluate("""([story, t]) => {
                    const canvas = document.getElementById('story-canvas');
                    new RemakeVector.Renderer(canvas, window.cat, story).render(t);
                }""", [story, t])
                out_path = out_dir / f"{sid}_t{idx}_{t:.1f}s.png"
                out_path.parent.mkdir(parents=True, exist_ok=True)
                page.locator("#story-canvas").screenshot(path=str(out_path))
                rendered.append(out_path)

        browser.close()

    return rendered
