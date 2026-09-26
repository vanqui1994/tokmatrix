// Kinetic Editorial v2. Shared by Studio preview, direct creation and Matrix.
// Entrance vocabulary adapted from HyperFrames caption-kinetic-slam (see template-kinetic).
import fs from 'node:fs';
import { generateCinemaAudioHtml } from './auto-sfx.mjs';

const ASSETS = new URL('./template-kinetic/assets/', import.meta.url);
const FONT_CSS = fs.readFileSync(new URL('fonts.css', ASSETS), 'utf8').replace(/url\(([^)]+)\)/g, (_, file) => `url(data:font/woff2;base64,${fs.readFileSync(new URL(file, ASSETS)).toString('base64')})`);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const json = value => JSON.stringify(value).replace(/</g, '\\u003c');
const LABELS = {
  vi: ['MỞ NÚT', 'GIẢI MÃ', 'ĐỐI MẶT', 'ĐỔI GÓC NHÌN', 'HÀNH ĐỘNG', 'GHI NHỚ'],
  en: ['THE HOOK', 'DECODE', 'THE TENSION', 'THE SHIFT', 'TAKE ACTION', 'REMEMBER'],
  de: ['DER EINSTIEG', 'ENTSCHLÜSSELT', 'DER KONFLIKT', 'DER WENDEPUNKT', 'JETZT HANDELN', 'MERKSATZ'],
  fr: ['LE DÉCLIC', 'DÉCODAGE', 'LA TENSION', 'LE TOURNANT', 'AGIR', 'À RETENIR'],
  ja: ['きっかけ', '仕組み', '対立', '転換', '行動', '覚えておこう'],
  ko: ['시작', '원리', '갈등', '전환', '행동', '기억하세요'],
};
const ROLES = ['hook', 'explain', 'tension', 'shift', 'action', 'resolve'];
export function kineticRole(beat, index, count) {
  if (ROLES.includes(beat.role)) return beat.role;
  if (index === 0) return 'hook';
  if (index === count - 1) return 'resolve';
  if (index === count - 2) return 'action';
  return ROLES[Math.min(3, Math.max(1, Math.round(index * 5 / (count - 1))))];
}

export function generateKineticHtml({ slug, cfg, meta, timedBeats, totalDuration, sfxCues = [], bgmSegments = [] }) {
  if (!Number.isFinite(totalDuration) || totalDuration <= 0 || !timedBeats.length) throw new Error('Kinetic requires beats and a positive duration');
  const labels = LABELS[cfg.lang] || LABELS.en;
  const beats = timedBeats.map((beat, i) => {
    if (!Number.isFinite(beat.start) || !Number.isFinite(beat.duration) || beat.duration <= 0 || beat.start < 0 || beat.start + beat.duration > totalDuration || (i && beat.start <= timedBeats[i - 1].start)) throw new Error('Invalid Kinetic beat timing');
    const role = kineticRole(beat, i, timedBeats.length);
    return { ...beat, role, label: labels[ROLES.indexOf(role)], begin: i ? beat.start : 0, end: timedBeats[i + 1]?.start ?? totalDuration };
  });
  const scenes = beats.map((b, i) => {
    const headline = b.punchline || b.words?.join(' ') || cfg.topicTitle;
    const metric = b.metricValue && b.metricValue !== '—' ? b.metricValue : '';
    return `<section id="beat-${i}" class="scene clip" data-start="${b.begin}" data-duration="${b.end - b.begin}" data-track-index="2">
      <div class="scene-inner ${b.role}" id="scene-${i}">
        <div class="stage">
          <div class="chapter"><span class="chapter-number">${String(i + 1).padStart(2,'0')}</span><span>${escape(b.label)}</span><span class="chapter-rule"></span></div>
          <div class="title-box"><h2 class="hero" id="hero-${i}">${escape(headline)}</h2></div>
          <div class="detail-row">${metric ? `<div class="metric" id="metric-${i}">${escape(metric)}</div><div class="metric-label">${escape(b.metricLabel)}</div>` : `<div class="accent-rule" aria-hidden="true"></div><div class="metric-label">${escape(cfg.eyebrow || meta.eyebrow)}</div>`}</div>
        </div>
        <div class="caption-box"><span class="caption-index">${String(i+1).padStart(2,'0')} / ${String(beats.length).padStart(2,'0')}</span><p class="caption">${escape(b.line || '')}</p></div>
      </div>
    </section>`;
  }).join('\n');
  return `<!DOCTYPE html>
<html lang="${escape(cfg.lang || 'vi')}"><head><meta charset="UTF-8"><meta name="viewport" content="width=1080, height=1920">
<title>${escape(cfg.topicTitle)} — Kinetic Editorial</title>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<style>${FONT_CSS}
*{box-sizing:border-box;margin:0}body{width:1080px;height:1920px;overflow:hidden;background:#111310;color:#f4f0e6;font-family:'Be Vietnam Pro',sans-serif}
#root{position:relative;width:1080px;height:1920px;overflow:hidden} .backdrop{position:absolute;inset:0;background:#111310}
.header{position:absolute;left:120px;top:128px;width:840px;height:220px;display:flex;flex-direction:column;gap:28px}
.brand{display:flex;justify-content:space-between;font:700 22px 'JetBrains Mono',monospace;letter-spacing:3px;color:#d7ef71}.brand span:last-child{color:#c0c3b7;letter-spacing:1px}
.topic{font-size:32px;line-height:1.45;font-weight:900;max-height:140px;overflow-wrap:anywhere}
.scene{position:absolute;inset:0}.scene-inner{position:absolute;inset:0;opacity:0;visibility:hidden}
.stage{position:absolute;left:120px;top:405px;width:840px;height:730px;display:flex;flex-direction:column;border-top:2px solid #626958;padding-top:30px}
.chapter{display:flex;align-items:center;gap:22px;font:700 22px 'JetBrains Mono',monospace;letter-spacing:2px;color:#d7ef71;height:50px}
.chapter-number{background:#d7ef71;color:#111310;padding:10px 13px}.chapter-rule{flex:1;height:1px;background:#626958}
.title-box{height:472px;display:flex;align-items:center;padding:30px 0}.hero{width:100%;font-size:106px;line-height:1.14;letter-spacing:-4px;text-transform:uppercase;overflow-wrap:anywhere;font-weight:900;text-wrap:balance}
.detail-row{display:flex;align-items:center;gap:30px;min-height:120px;border-top:1px solid #626958;padding-top:20px}
.metric{font-size:66px;letter-spacing:-2px;font-weight:900;color:#d7ef71;max-width:460px;overflow-wrap:anywhere}.metric-label{font:700 22px/1.5 'JetBrains Mono',monospace;max-width:360px;color:#c0c3b7;overflow-wrap:anywhere}.accent-rule{width:100px;height:8px;background:#d7ef71}
.caption-box{position:absolute;top:1200px;left:120px;width:840px;height:290px;display:flex;flex-direction:column;gap:20px}
.caption-index{font:700 20px 'JetBrains Mono',monospace;letter-spacing:2px;color:#d7ef71}.caption{font:500 34px/1.5 Arial,sans-serif;overflow-wrap:anywhere;color:#f4f0e6}
.footer{position:absolute;left:120px;top:1530px;width:840px;display:flex;justify-content:space-between;gap:20px;color:#c0c3b7;font:700 18px 'JetBrains Mono',monospace}.watermark{max-width:520px;overflow-wrap:anywhere}
.progress-track{position:absolute;left:120px;top:1590px;width:840px;height:4px;background:#414737}.progress{height:4px;width:840px;background:#d7ef71;transform-origin:left center}
.hook .hero,.action .hero{color:#d7ef71}.tension .hero{color:#ffad90}.tension .chapter{color:#ffad90}.shift .stage,.resolve .stage{background:#d7ef71;color:#111310;padding:30px 36px;border:0}.shift .hero,.resolve .hero{font-size:96px;letter-spacing:-3px}.shift .chapter,.resolve .chapter,.shift .metric,.resolve .metric,.shift .metric-label,.resolve .metric-label{color:#111310}.shift .chapter-number,.resolve .chapter-number{background:#111310;color:#d7ef71}.shift .detail-row,.resolve .detail-row{border-color:#697c29}.shift .chapter-rule,.resolve .chapter-rule,.shift .accent-rule,.resolve .accent-rule{background:#697c29}
</style></head><body>
<div id="root" data-composition-id="${escape(slug)}" data-start="0" data-duration="${totalDuration}" data-width="1080" data-height="1920" data-template="kinetic-editorial-v2">
<div class="backdrop"></div><header class="header"><div class="brand"><span>KINETIC / EDITORIAL</span><span>${escape((cfg.lang || 'vi').toUpperCase())} · ${String(beats.length).padStart(2,'0')}</span></div><h1 class="topic">${escape(cfg.topicTitle)}</h1></header>
${scenes}
<footer class="footer"><span>${escape(meta.takeawayLabel)}</span><span class="watermark">${escape(cfg.watermark || meta.watermark)}</span></footer><div class="progress-track"><div class="progress"></div></div>
${generateCinemaAudioHtml({sfxCues,bgmSegments})}
${beats.filter(b => b.voSrc).map((b,i)=>`<audio id="vo-beat-${i+1}" class="clip" src="${escape(b.voSrc)}" data-start="${b.start}" data-duration="${b.duration}" data-track-index="20"></audio>`).join('\n')}
</div><script>
const BEATS = ${json(beats.map(b=>({begin:b.begin,end:b.end,start:b.start,role:b.role})))};
const tl = gsap.timeline({paused:true});
tl.set('.scene-inner',{autoAlpha:0},0);
BEATS.forEach((b,i)=>{
 const scene='#scene-'+i, hero='#hero-'+i;
 const enter=Math.min(0.48,(b.end-b.begin)*0.18);
 tl.set(scene,{autoAlpha:1},b.begin);
 // One decisive entrance, followed by a readable hold. No accumulated callbacks.
 const from=b.role==='tension'?{x:-56,opacity:0}:b.role==='shift'?{x:56,opacity:0}:b.role==='hook'?{scale:1.12,opacity:0}:{y:44,opacity:0};
 tl.fromTo(hero,from,{x:0,y:0,scale:1,opacity:1,duration:enter,ease:'power3.out',immediateRender:false},b.begin);
 tl.fromTo(scene+' .detail-row',{y:18,opacity:0},{y:0,opacity:1,duration:enter,ease:'power2.out',immediateRender:false},b.begin+enter*0.5);
 if(i<BEATS.length-1)tl.set(scene,{autoAlpha:0},b.end);
});
tl.fromTo('.progress',{scaleX:0},{scaleX:1,duration:${totalDuration},ease:'none'},0);
// Fit once at setup and once after fonts load; never fit while seeking frames.
function fitText(){
 document.querySelectorAll('.hero,.caption,.topic,.metric,.metric-label').forEach(el=>{
  const base=Number(el.dataset.baseSize || parseFloat(getComputedStyle(el).fontSize));el.dataset.baseSize=base;
  let size=base;el.style.fontSize=size+'px';
  const max=el.classList.contains('hero')?400:el.classList.contains('caption')?234:el.classList.contains('topic')?140:110;
  while(size>22&&(el.scrollHeight>max||el.scrollWidth>el.clientWidth+1)){size--;el.style.fontSize=size+'px';}
 });
}
fitText();document.fonts.ready.then(fitText);
window.__timelines=window.__timelines||{};window.__timelines[${json(slug)}]=tl;
tl.seek(0);
</script></body></html>`;
}
