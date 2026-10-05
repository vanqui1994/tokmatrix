// =============================================================================
// TAB: Phim AI (Muse) — ý tưởng → nhiều cảnh → clip video Muse → ghép phim. API /api/muse-film/*
// =============================================================================
let filmTimer = null;
let filmOpen = null;

async function filmJson(url, options) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
  return data;
}

const FILM_STATUS = {
  queued: ['⏳ Chờ', 'badge-neutral'], planning: ['✍️ Viết kịch bản', 'badge-warning'], rendering: ['🎬 Đang quay', 'badge-warning'],
  assembling: ['🧩 Đang ghép', 'badge-warning'], done: ['✅ Xong', 'badge-success'], partial: ['⚠️ Thiếu cảnh', 'badge-warning'],
  error: ['❌ Lỗi', 'badge-danger'], stopped: ['⏸ Đã dừng', 'badge-neutral'],
};
const SCENE_STATUS = { pending: '⏳', running: '🎬', done: '✅', error: '❌', skipped: '⤼' };

function loadMuseFilmTab() {
  filmRefresh();
  if (filmTimer) clearInterval(filmTimer);
  filmTimer = setInterval(() => {
    if (document.getElementById('pane-muse_film')?.style.display === 'none') { clearInterval(filmTimer); filmTimer = null; return; }
    filmRefresh();
  }, 6000);
}

async function filmRefresh() {
  let data;
  try { data = await filmJson('/api/muse-film/projects'); } catch (e) { return; }
  const list = data.projects || [];
  const running = list.filter((p) => ['queued', 'planning', 'rendering', 'assembling'].includes(p.status)).length;
  const badge = document.getElementById('badge-film-status');
  if (badge) badge.textContent = running ? `${running} chạy` : '--';
  const count = document.getElementById('film-count');
  if (count) count.textContent = `${list.length} phim`;
  document.getElementById('film-list').innerHTML = list.map(filmCard).join('') || `
    <div class="story-empty-state">
      <span class="story-empty-icon">🎬</span>
      <strong>Chưa có phim nào</strong>
      <p>Nhập ý tưởng ở khung bên trái rồi bấm "Tạo phim". Phim mới sẽ hiện ở đây cùng tiến độ từng cảnh.</p>
    </div>`;
}

function filmCard(p) {
  const [label, cls] = FILM_STATUS[p.status] || [p.status, 'badge-neutral'];
  const scenes = p.scenes || [];
  const shots = scenes.filter((s) => s.status !== 'skipped');
  const done = scenes.filter((s) => s.status === 'done').length;
  const total = shots.length || p.n;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const open = filmOpen === p.id;
  const btn = (cls2, onclick, text) => `<button type="button" class="story-video-action${cls2}" onclick="${onclick}">${text}</button>`;
  const actions = [
    ['done', 'partial'].includes(p.status) ? btn(' is-primary', `filmPlay('/api/muse-film/projects/${p.id}/film')`, '▶ Xem phim')
      + `<a class="story-video-action" href="/api/muse-film/projects/${p.id}/film" download>⬇ Tải phim</a>` : '',
    ['queued', 'planning', 'rendering'].includes(p.status) ? btn('', `filmAct('${p.id}','stop')`, '⏸ Dừng') : '',
    ['stopped', 'error', 'partial'].includes(p.status) ? btn('', `filmAct('${p.id}','resume')`, '▶ Chạy tiếp') : '',
  ].join('');
  const sceneRows = open ? `<div class="film-scenes">${scenes.map((s) => {
    const text = (s.text || '').trim();
    return `<div class="film-scene is-${escapeHtml(s.status || 'pending')}">
      <span class="film-scene-no" title="${escapeHtml(s.status || '')}">${s.i + 1}</span>
      <div>
        <div class="film-scene-text${text.replace(/[>\s*]/g, '') ? '' : ' is-empty'}" title="${escapeHtml(text)}">${SCENE_STATUS[s.status] || ''} ${escapeHtml(text) || '(trống)'}</div>
        ${s.error ? `<div class="film-error">${escapeHtml(s.error)}</div>` : ''}
      </div>
      <div class="film-scene-actions">
        ${s.status === 'done' ? btn('', `filmPlay('/api/muse-film/projects/${p.id}/clip/${s.i}')`, '▶ Clip') : ''}
        ${['done', 'error'].includes(s.status) ? btn('', `filmRetry('${p.id}', ${s.i})`, '↻') : ''}
      </div>
    </div>`;
  }).join('')}</div>` : '';
  return `<article class="film-card${open ? ' is-open' : ''}${p.status === 'done' ? ' is-done' : ''}">
    <button type="button" class="film-card-head" onclick="filmToggle('${p.id}')" aria-expanded="${open}">
      <div style="min-width:0">
        <div class="film-card-title">${escapeHtml(p.title || p.id)}</div>
        <div class="film-card-meta"><span class="tab-badge ${cls}">${label}</span><span>${done}/${total} cảnh</span><span>·</span><span>${escapeHtml(p.style)}</span><span>·</span><span>${escapeHtml(p.aspect)}</span></div>
      </div>
      <span class="film-chevron" aria-hidden="true">▼</span>
    </button>
    <div class="film-progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>
    ${p.error ? `<div class="film-error">${escapeHtml(p.error)}</div>` : ''}
    ${actions ? `<div class="story-video-actions">${actions}</div>` : ''}
    ${sceneRows}
  </article>`;
}

function filmToggle(id) { filmOpen = filmOpen === id ? null : id; filmRefresh(); }

async function filmCreate() {
  const idea = document.getElementById('film-idea').value.trim();
  if (idea.length < 5) { alert('Nhập ý tưởng / câu chuyện, hoặc mỗi dòng một cảnh'); return; }
  const body = {
    idea,
    title: document.getElementById('film-title').value.trim(),
    scenes: Number(document.getElementById('film-scenes').value) || 6,
    style: document.getElementById('film-style').value,
    aspect: document.getElementById('film-aspect').value,
    keep_audio: document.getElementById('film-audio').checked,
  };
  try {
    const p = await filmJson('/api/muse-film/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    filmOpen = p.id;
    showToast('🎬 Đã tạo dự án phim — Muse bắt đầu quay từng cảnh');
  } catch (e) { alert(e.message); }
  filmRefresh();
}

async function filmRetry(id, i) {
  await filmJson(`/api/muse-film/projects/${id}/scenes/${i}/retry`, { method: 'POST' }).catch((e) => alert(e.message));
  filmRefresh();
}

async function filmAct(id, act) {
  await filmJson(`/api/muse-film/projects/${id}/${act}`, { method: 'POST' }).catch((e) => alert(e.message));
  filmRefresh();
}

function filmPlay(url) {
  const box = document.getElementById('film-player');
  box.hidden = false;
  box.innerHTML = `<video src="${url}" controls autoplay playsinline></video>`;
  box.scrollIntoView({ behavior: 'smooth' });
}
