import json
from pathlib import Path

def generate_html(title, desc_html, meta, src, skin_color, robe_color, pants_color, actions_config, pose_code, output_path, default_scale=1.4, default_root_y=360, shadow_y=624):
    meta_json = json.dumps(meta, ensure_ascii=False)
    src_json = json.dumps(src, ensure_ascii=False)
    stem = Path(output_path).stem
    
    html = f"""<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>{title}</title>
<style>
:root{{
  --bg:#0b1020;--panel:#121a2a;--panel2:#182337;--line:rgba(255,255,255,.08);
  --text:#f4f7ff;--muted:#aab7d0;--accent:#7557f6;--orange:#e98b24;--green:#2e8555;
}}
*{{box-sizing:border-box}}
html,body{{margin:0;min-height:100%;background:radial-gradient(circle at 30% 0,#223454 0,#111a2d 38%,#090f1c 100%);color:var(--text);font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif}}
.page{{max-width:1320px;margin:auto;padding:18px}}
.header h1{{font-size:26px;margin:0 0 7px;letter-spacing:-0.4px}}
.header p{{margin:0;color:var(--muted);line-height:1.5;max-width:920px}}
.layout{{display:grid;grid-template-columns:minmax(0,1fr) 350px;gap:16px;margin-top:16px;align-items:start}}
.card{{background:rgba(14,21,35,.9);border:1px solid var(--line);border-radius:20px;box-shadow:0 18px 55px rgba(0,0,0,.28);overflow:hidden}}
.stageCard{{padding:12px}}
.stage{{width:100%;max-width:none;margin:auto;border-radius:16px;overflow:hidden;background:#cbdcf2}}
canvas{{display:block;width:100%;height:auto;aspect-ratio:16/9;background:#cbdcf2;touch-action:none}}
.status{{display:flex;gap:8px;flex-wrap:wrap;padding:10px 2px 0}}
.pill{{font-size:12px;color:#dbe6ff;background:rgba(255,255,255,.06);border:1px solid var(--line);border-radius:999px;padding:6px 10px}}
.controls{{padding:14px;display:flex;flex-direction:column;gap:12px}}
.section{{background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.06);border-radius:15px;padding:12px}}
.section h2{{font-size:16px;margin:0 0 10px}}
.row{{display:flex;gap:7px;flex-wrap:wrap}}
button{{border:0;border-radius:11px;padding:9px 12px;background:#28354d;color:#fff;font-weight:700;cursor:pointer;font-size:13px;transition:all 0.15s ease}}
button:hover{{background:#334463}}
button.active{{outline:2px solid #fff;box-shadow:0 0 0 4px rgba(255,255,255,.08);background:#3c5075}}
button.primary{{background:linear-gradient(135deg,#7557f6,#5144d8)}}
button.orange{{background:linear-gradient(135deg,#f59e0b,#dc5b2c)}}
button.green{{background:linear-gradient(135deg,#10b981,#059669)}}
label{{display:flex;justify-content:space-between;color:#dce7ff;font-size:13px;margin:9px 0 5px}}
label span{{color:var(--muted);font-size:12px}}
input[type=range]{{width:100%;accent-color:var(--accent)}}
.two{{display:grid;grid-template-columns:1fr 1fr;gap:7px}}
.note{{font-size:12px;line-height:1.45;color:var(--muted);margin-top:8px}}
details{{border-top:1px solid rgba(255,255,255,.06);padding-top:10px}}
summary{{cursor:pointer;color:#dfe7fb;font-weight:700;font-size:13px;user-select:none}}
@media(max-width:980px){{
  .page{{padding:10px}}
  .layout{{grid-template-columns:1fr;gap:12px;margin-top:12px}}
  .header h1{{font-size:21px}}
  .header p{{font-size:13px}}
  .stageCard{{padding:8px}}
  .controls{{padding:10px}}
  .stage{{max-width:620px}}
}}
@media(max-width:520px){{
  .page{{padding:6px}}
  .card{{border-radius:15px}}
  .stage{{border-radius:12px}}
  .header{{padding:4px 4px 0}}
  .header h1{{font-size:18px}}
  .header p{{font-size:12px}}
  .pill{{font-size:11px}}
  button{{padding:8px 9px;font-size:12px}}
  .section{{padding:10px}}
}}
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <h1>{title}</h1>
    <p>{desc_html}</p>
  </div>

  <div class="layout">
    <div class="card stageCard">
      <div class="stage"><canvas id="c" width="1280" height="720"></canvas></div>
      <div class="status">
        <span class="pill" id="modePill">Idle</span>
        <span class="pill">15 sprites</span>
        <span class="pill">1280×720</span>
        <span class="pill">16:9 mobile-safe canvas</span>
        <span class="pill" style="color:#7ee787;">Articulated Rig 2.5D</span>
      </div>
    </div>

    <div class="card controls">
      <div class="section">
        <h2>Animation</h2>
        <div class="row" id="modes">
          <button class="primary active" data-mode="idle">Idle</button>
          <button data-mode="walk">Walk</button>
          <button data-mode="run">Run</button>
          <button class="green" data-mode="point">Point</button>
          <button class="orange" data-mode="kneel">Kneel</button>
          <button data-mode="wave">Wave</button>
          <button data-mode="work">Work</button>
          <button data-mode="manual">Manual</button>
        </div>
        <div class="note" id="actionInfo">Idle — chuyển động thở nhẹ, giữ nhân vật sống động tự nhiên.</div>
        <label>Progress <span id="progressText">0%</span></label>
        <input id="progress" type="range" min="0" max="1000" step="1" value="0">
        <div class="two">
          <button id="playPause">Pause</button>
          <button id="loopBtn">Loop: On</button>
          <button id="restartBtn">Restart</button>
          <button id="stepBack">◀ Frame</button>
          <button id="stepForward">Frame ▶</button>
          <button id="toStart">Go to start</button>
        </div>
        <div class="note"><span id="phaseText">Phase: breathing</span> · <span id="timeText">0.00s / 1.80s</span></div>
      </div>
      <div class="section">
        <h2>Camera & tools</h2>
        <div class="two">
          <button id="bones">Bones: Off</button>
          <button id="mirror">Facing: Right</button>
          <button id="reset">Reset</button>
          <button id="png">Export PNG</button>
        </div>
        <label>Scale <span id="scaleText">{default_scale:.2f}×</span></label>
        <input id="scale" type="range" min="1.0" max="2.4" step=".05" value="{default_scale}">
        <label>Speed <span id="speedText">1.00×</span></label>
        <input id="speed" type="range" min=".1" max="2.5" step=".05" value="1">
      </div>
      <details class="section">
        <summary>Manual bone controls</summary>
        <div id="manualControls"></div>
        <div class="note">Kéo bất kỳ slider nào sẽ chuyển sang Manual và tạm dừng playback để bạn chỉnh pose chính xác.</div>
      </details>
    </div>
  </div>
</div>

<script>
const META = {meta_json};
const SRC = {src_json};

const canvas=document.getElementById('c');
const ctx=canvas.getContext('2d');
const IMGS={{}};
const ACTIONS = {actions_config};

let ready=false, mode='idle', showBones=false, facing=1, scale={default_scale}, speed=1;
let playing=true, loop=ACTIONS.idle.loop, actionTime=0, last=0, currentPhase=0;
const manualKeys=['head','torso','uArmL','fArmL','handL','uArmR','fArmR','handR','thighL','shinL','footL','thighR','shinR','footR'];
const manual=Object.fromEntries(manualKeys.map(k=>[k,0]));
const ranges={{
 head:[-40,40],torso:[-25,25],uArmL:[-120,120],fArmL:[-120,120],handL:[-45,45],
 uArmR:[-120,120],fArmR:[-120,120],handR:[-45,45],thighL:[-65,65],shinL:[-70,70],
 footL:[-30,30],thighR:[-65,65],shinR:[-70,70],footR:[-30,30]
}};
const names={{head:'Head',torso:'Torso',uArmL:'Upper arm L',fArmL:'Forearm L',handL:'Hand L',uArmR:'Upper arm R',fArmR:'Forearm R',handR:'Hand R',thighL:'Thigh L',shinL:'Shin L',footL:'Foot L',thighR:'Thigh R',shinR:'Shin R',footR:'Foot R'}};
const els={{
  modePill:document.getElementById('modePill'), actionInfo:document.getElementById('actionInfo'), progress:document.getElementById('progress'),
  progressText:document.getElementById('progressText'), phaseText:document.getElementById('phaseText'), timeText:document.getElementById('timeText'),
  playPause:document.getElementById('playPause'), loopBtn:document.getElementById('loopBtn'), restartBtn:document.getElementById('restartBtn'),
  stepBack:document.getElementById('stepBack'), stepForward:document.getElementById('stepForward'), toStart:document.getElementById('toStart'),
  bones:document.getElementById('bones'), mirror:document.getElementById('mirror'), reset:document.getElementById('reset'), png:document.getElementById('png'),
  scale:document.getElementById('scale'), scaleText:document.getElementById('scaleText'), speed:document.getElementById('speed'), speedText:document.getElementById('speedText')
}};

function loadAll(){{
  return Promise.all(Object.keys(SRC).map(name=>new Promise((resolve,reject)=>{{
    const im=new Image(); im.onload=()=>{{IMGS[name]=im;resolve()}}; im.onerror=reject; im.src=SRC[name];
  }}))).then(()=>{{ready=true}});
}}
function d(a){{return a*Math.PI/180}}
function clamp(v,a,b){{return Math.max(a,Math.min(b,v))}}
function ease(x){{return .5-.5*Math.cos(Math.PI*x)}}
function smoothstep(a,b,x){{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t)}}
function actionCfg(){{return ACTIONS[mode]||ACTIONS.idle}}
function duration(){{return actionCfg().duration||1}}
function setMode(m){{
  mode=m;
  if(m==='manual'){{
    playing=false; loop=false;
  }}else{{
    playing=true; loop=actionCfg().loop;
  }}
  actionTime=0; currentPhase=0; last=0;
  updateButtons(); updateInfo(); syncProgress();
}}
function updateButtons(){{
  els.modePill.textContent=(actionCfg().label||mode);
  document.querySelectorAll('#modes button').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));
  els.playPause.textContent=playing?'Pause':'Play';
  els.loopBtn.textContent='Loop: '+(loop?'On':'Off');
}}
function updateInfo(){{
  const cfg=actionCfg();
  els.actionInfo.textContent=cfg.info;
  els.phaseText.textContent='Phase: '+cfg.phase(currentPhase);
  els.timeText.textContent=actionTime.toFixed(2)+'s / '+duration().toFixed(2)+'s';
}}
function syncProgress(){{
  els.progress.value=Math.round(currentPhase*1000);
  els.progressText.textContent=Math.round(currentPhase*100)+'%';
}}
function seekPhase(phase){{
  currentPhase=clamp(phase,0,1);
  actionTime=currentPhase*duration();
  updateInfo(); syncProgress();
}}
function stepFrame(dir){{
  playing=false;
  const step=1/24;
  const dur=duration();
  let nt=actionTime + dir*step;
  if(loop) nt=((nt%dur)+dur)%dur; else nt=clamp(nt,0,dur);
  actionTime=nt;
  currentPhase = loop ? (((actionTime%dur)+dur)%dur)/dur : clamp(actionTime/dur,0,1);
  updateButtons(); updateInfo(); syncProgress();
}}

document.querySelectorAll('#modes button').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
els.bones.onclick=()=>{{showBones=!showBones;els.bones.textContent='Bones: '+(showBones?'On':'Off')}};
els.mirror.onclick=()=>{{facing*=-1;els.mirror.textContent='Facing: '+(facing===1?'Right':'Left')}};
els.reset.onclick=()=>{{for(const k of manualKeys)manual[k]=0;document.querySelectorAll('[data-bone]').forEach(x=>{{x.value=0;x.previousElementSibling.querySelector('span').textContent='0°'}});setMode('idle')}};
els.png.onclick=()=>{{const a=document.createElement('a');a.href=canvas.toDataURL('image/png');a.download='{stem}.png';a.click()}};
els.scale.oninput=e=>{{scale=+e.target.value;els.scaleText.textContent=scale.toFixed(2)+'×'}};
els.speed.oninput=e=>{{speed=+e.target.value;els.speedText.textContent=speed.toFixed(2)+'×'}};
els.playPause.onclick=()=>{{if(mode==='manual') return; playing=!playing; last=0; updateButtons();}};
els.loopBtn.onclick=()=>{{if(mode==='manual') return; loop=!loop; updateButtons();}};
els.restartBtn.onclick=()=>{{actionTime=0; currentPhase=0; last=0; if(mode!=='manual') playing=true; updateButtons(); updateInfo(); syncProgress();}};
els.toStart.onclick=()=>{{playing=false; actionTime=0; currentPhase=0; updateButtons(); updateInfo(); syncProgress();}};
els.stepBack.onclick=()=>stepFrame(-1);
els.stepForward.onclick=()=>stepFrame(1);
els.progress.oninput=e=>{{playing=false; const phase=(+e.target.value)/1000; seekPhase(phase); updateButtons();}};

const mc=document.getElementById('manualControls');
for(const k of manualKeys){{
  const [mn,mx]=ranges[k];
  const lab=document.createElement('label'); lab.innerHTML=`${{names[k]}} <span>0°</span>`;
  const inp=document.createElement('input'); inp.type='range'; inp.min=mn; inp.max=mx; inp.value=0; inp.dataset.bone=k;
  inp.oninput=()=>{{manual[k]=+inp.value;lab.querySelector('span').textContent=inp.value+'°';setMode('manual')}};
  mc.appendChild(lab); mc.appendChild(inp);
}}

function drawSprite(name){{ const m=META[name], im=IMGS[name]; if(im) ctx.drawImage(im,m.offset[0],m.offset[1]); }}
function jointDot(){{ if(!showBones)return; ctx.fillStyle='#ff3d61';ctx.beginPath();ctx.arc(0,0,3,0,Math.PI*2);ctx.fill(); }}
function boneLine(x,y){{ if(!showBones)return; ctx.strokeStyle='rgba(15,23,42,.75)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(x,y);ctx.stroke(); }}
function cover(color,r){{ ctx.fillStyle=color;ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fill(); }}

{pose_code}

function background(time){{
  const g=ctx.createLinearGradient(0,0,0,720);
  g.addColorStop(0,'#e4effb');g.addColorStop(.65,'#cbdbe8');g.addColorStop(1,'#b5cadf');
  ctx.fillStyle=g;ctx.fillRect(0,0,1280,720);
  
  // Distant mist hills
  ctx.fillStyle='rgba(130,160,190,.22)';ctx.beginPath();ctx.moveTo(0,470);
  ctx.bezierCurveTo(220,410,380,480,560,430);ctx.bezierCurveTo(740,380,950,470,1280,380);ctx.lineTo(1280,720);ctx.lineTo(0,720);ctx.fill();
  
  // Closer rolling countryside ground
  ctx.fillStyle='rgba(105,135,165,.18)';ctx.beginPath();ctx.moveTo(0,530);
  ctx.bezierCurveTo(280,490,520,540,780,495);ctx.bezierCurveTo(1020,460,1180,510,1280,485);ctx.lineTo(1280,720);ctx.lineTo(0,720);ctx.fill();
  
  // Sunlight glow
  const glow=ctx.createRadialGradient(640,280,20,640,280,380);
  glow.addColorStop(0,'rgba(255,255,255,.35)');glow.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=glow;ctx.fillRect(200,0,880,650);
  
  // Ground base
  ctx.fillStyle='rgba(65,85,110,.14)';ctx.fillRect(0,620,1280,100);
  ctx.strokeStyle='rgba(65,85,110,.25)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,620);ctx.lineTo(1280,620);ctx.stroke();
}}

function render(ms){{
  if(!ready){{requestAnimationFrame(render);return}}
  if(!last) last=ms;
  const dt=(ms-last)/1000; last=ms;
  if(playing && mode!=='manual') actionTime += dt*speed;
  const dur=duration();
  if(mode==='manual') currentPhase=0;
  else if(loop) currentPhase=((actionTime%dur)+dur)%dur/dur;
  else {{ currentPhase=clamp(actionTime/dur,0,1); if(actionTime>=dur) playing=false; }}
  updateButtons(); updateInfo(); syncProgress();

  background(actionTime);
  const p=pose(currentPhase);
  const rootX=640+p.rootX, rootY={default_root_y}+p.rootY;
  
  // Contact shadow
  ctx.save();ctx.translate(rootX,{shadow_y});ctx.scale(scale,scale*.28);
  const rg=ctx.createRadialGradient(0,0,2,0,0,42);
  rg.addColorStop(0,'rgba(0,0,0,.24)');rg.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=rg;ctx.beginPath();ctx.ellipse(0,0,48,16,0,0,Math.PI*2);ctx.fill();ctx.restore();

  ctx.save();ctx.translate(rootX,rootY);ctx.scale(scale*facing,scale);ctx.rotate(d(p.rootTilt));
  const pos=(a,b)=>[META[a].anchor[0]-META[b].anchor[0],META[a].anchor[1]-META[b].anchor[1]];
  const torsoPos=pos('torso','pelvis'), headPos=pos('head','torso');
  const uL=pos('upperArmL','torso'), fL=pos('foreArmL','upperArmL'), hL=pos('handL','foreArmL');
  const uR=pos('upperArmR','torso'), fR=pos('foreArmR','upperArmR'), hR=pos('handR','foreArmR');
  const thL=pos('thighL','pelvis'), shL=pos('shinL','thighL'), ftL=pos('footL','shinL');
  const thR=pos('thighR','pelvis'), shR=pos('shinR','thighR'), ftR=pos('footR','shinR');

  // Left Arm (behind body)
  ctx.save();ctx.translate(...torsoPos);ctx.rotate(d(p.torso));ctx.translate(...uL);ctx.rotate(d(p.uArmL));
  cover('{skin_color}',7);drawSprite('upperArmL');boneLine(...fL);
  ctx.translate(...fL);ctx.rotate(d(p.fArmL));cover('{skin_color}',6);drawSprite('foreArmL');boneLine(...hL);
  ctx.translate(...hL);ctx.rotate(d(p.handL));cover('{skin_color}',5);drawSprite('handL');jointDot();ctx.restore();

  // Left Leg (far)
  ctx.save();ctx.translate(...thL);ctx.rotate(d(p.thighL));cover('{pants_color}',7);drawSprite('thighL');boneLine(...shL);
  ctx.translate(...shL);ctx.rotate(d(p.shinL));cover('{pants_color}',6);drawSprite('shinL');boneLine(...ftL);
  ctx.translate(...ftL);ctx.rotate(d(p.footL));drawSprite('footL');jointDot();ctx.restore();

  // Right Leg (near)
  ctx.save();ctx.translate(...thR);ctx.rotate(d(p.thighR));cover('{pants_color}',7);drawSprite('thighR');boneLine(...shR);
  ctx.translate(...shR);ctx.rotate(d(p.shinR));cover('{pants_color}',6);drawSprite('shinR');boneLine(...ftR);
  ctx.translate(...ftR);ctx.rotate(d(p.footR));drawSprite('footR');jointDot();ctx.restore();

  // Pelvis
  drawSprite('pelvis');jointDot();

  // Torso & Head
  ctx.save();ctx.translate(...torsoPos);ctx.rotate(d(p.torso));drawSprite('torso');boneLine(...headPos);
  ctx.save();ctx.translate(...headPos);ctx.rotate(d(p.head));drawSprite('head');jointDot();ctx.restore();

  // Right Arm (front)
  boneLine(...uR);ctx.save();ctx.translate(...uR);ctx.rotate(d(p.uArmR));cover('{skin_color}',7);drawSprite('upperArmR');boneLine(...fR);
  ctx.translate(...fR);ctx.rotate(d(p.fArmR));cover('{skin_color}',6);drawSprite('foreArmR');boneLine(...hR);
  ctx.translate(...hR);ctx.rotate(d(p.handR));cover('{skin_color}',5);drawSprite('handR');jointDot();ctx.restore();
  ctx.restore();
  ctx.restore();

  if(!new URLSearchParams(location.search).has('snapshot')) requestAnimationFrame(render);
}}

updateButtons(); updateInfo(); syncProgress();
loadAll().then(()=>requestAnimationFrame(render));
</script>
</body>
</html>
"""
    Path(output_path).write_text(html, encoding="utf-8")
    print(f"Generated: {output_path} ({len(html)} bytes)")
