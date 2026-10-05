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
const SCENE_STATUS = { pending: '⏳', running: '🎬', done: '✅', error: '❌' };

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
  document.getElementById('film-list').innerHTML = list.map((p) => {
    const [label, cls] = FILM_STATUS[p.status] || [p.status, 'badge-neutral'];
    const done = (p.scenes || []).filter((s) => s.status === 'done').length;
    const total = (p.scenes || []).length || p.n;
    const open = filmOpen === p.id;
    const scenes = open ? (p.scenes || []).map((s) => `
      <div style="display:flex;gap:8px;align-items:flex-start;padding:6px 0;border-top:1px solid var(--color-line)">
        <div style="width:26px;font-weight:700">${s.i + 1}</div>
        <div style="flex:1;min-width:0;font-size:12px">
          <div>${SCENE_STATUS[s.status] || ''} ${escapeHtml(s.text || '')}</div>
          ${s.error ? `<div style="color:#c0392b">${escapeHtml(s.error)}</div>` : ''}
          <div style="margin-top:4px;display:flex;gap:6px;flex-wrap:wrap">
            ${s.status === 'done' ? `<button class="btn btn-secondary btn-xs" onclick="filmPlay('/api/muse-film/projects/${p.id}/clip/${s.i}')">▶ Clip</button>` : ''}
            ${['done', 'error'].includes(s.status) ? `<button class="btn btn-outline btn-xs" onclick="filmRetry('${p.id}', ${s.i})">↻ Tạo lại</button>` : ''}
          </div>
        </div>
      </div>`).join('') : '';
    return `<div class="panel-card" style="padding:10px;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;cursor:pointer" onclick="filmToggle('${p.id}')">
        <div style="min-width:0"><div style="font-weight:700;overflow-wrap:anywhere">${escapeHtml(p.title || p.id)}</div>
          <div style="font-size:12px;color:var(--color-ink-dim)"><span class="tab-badge ${cls}">${label}</span> ${done}/${total} cảnh · ${escapeHtml(p.style)} · ${escapeHtml(p.aspect)}</div>
          ${p.error ? `<div style="font-size:12px;color:#c0392b">${escapeHtml(p.error)}</div>` : ''}</div>
        <span>${open ? '▲' : '▼'}</span>
      </div>
      <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">
        ${['done', 'partial'].includes(p.status) ? `<button class="btn btn-primary btn-xs" onclick="filmPlay('/api/muse-film/projects/${p.id}/film')">▶ Xem phim</button>
          <a class="btn btn-secondary btn-xs" href="/api/muse-film/projects/${p.id}/film" download>⬇ Tải phim</a>` : ''}
        ${['queued', 'planning', 'rendering'].includes(p.status) ? `<button class="btn btn-outline btn-xs" onclick="filmAct('${p.id}','stop')">⏸ Dừng</button>` : ''}
        ${['stopped', 'error', 'partial'].includes(p.status) ? `<button class="btn btn-outline btn-xs" onclick="filmAct('${p.id}','resume')">▶ Chạy tiếp</button>` : ''}
      </div>
      ${scenes}
    </div>`;
  }).join('') || '<div style="color:var(--color-ink-dim)">Chưa có phim nào.</div>';
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
  box.innerHTML = `<video src="${url}" controls autoplay style="width:100%;max-height:72vh;border-radius:8px;background:#000"></video>`;
  box.scrollIntoView({ behavior: 'smooth' });
}
