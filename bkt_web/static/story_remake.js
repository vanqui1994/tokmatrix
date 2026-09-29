// =============================================================================
// TAB: Story Remake — kênh YouTube → vẽ lại phần hình (ảnh phim ImageRouter), giữ audio gốc. API /api/story-remake/*
// =============================================================================
let storyTimer = null;

async function storyJson(url, options) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
  return data;
}

function loadStoryRemakeTab() {
  storyRefresh();
  if (storyTimer) clearInterval(storyTimer);
  storyTimer = setInterval(() => {
    if (document.getElementById('pane-story_remake')?.style.display === 'none') { clearInterval(storyTimer); storyTimer = null; return; }
    storyRefresh();
  }, 5000);
}

const STORY_STATUS = {
  done: ['✅ Xong', 'badge-success'], skipped: ['⏭️ Bỏ qua', 'badge-neutral'],
  error: ['❌ Lỗi', 'badge-danger'], running: ['⏳ Đang làm', 'badge-warning'],
};
const STORY_STEP = { 'vo.mp3': 'chép lời', 'words.json': 'chia cảnh', 'plan.json': 'vẽ ảnh', 'sources.json': 'dựng + render' };

async function storyRefresh() {
  let data;
  try { data = await storyJson('/api/story-remake/status'); } catch (e) { return; }
  const r = data.runner || {};
  const badge = document.getElementById('badge-story-status');
  if (badge) badge.textContent = r.running ? 'chạy' : '--';
  document.getElementById('story-run-btn').disabled = !!r.running;
  document.getElementById('story-stop-btn').style.display = r.running ? '' : 'none';
  document.getElementById('story-runner').textContent = r.running
    ? `Đang chạy: ${r.url} (tối đa ${r.limit} video, ${r.jobs} luồng)`
    : (r.url ? `Lượt gần nhất: ${r.url}` : 'Chưa chạy lượt nào');
  document.getElementById('story-log').textContent = data.log || '';
  const vids = data.videos || [];
  const done = vids.filter((v) => v.status === 'done').length;
  document.getElementById('story-count').textContent = `${done} video xong / ${vids.length}`;
  document.getElementById('story-list').innerHTML = vids.map((v) => {
    const [label, cls] = STORY_STATUS[v.status] || [v.status, 'badge-neutral'];
    const step = v.status === 'running' && v.step ? ` · ${STORY_STEP[v.step] || v.step}` : '';
    const thumb = v.has_thumb ? `<img src="/api/story-remake/thumb/${encodeURIComponent(v.id)}" style="width:72px;height:128px;object-fit:cover;border-radius:6px">` : '<div style="width:72px;height:128px;background:var(--color-line);border-radius:6px"></div>';
    const meta = [v.scenes ? `${v.scenes} cảnh` : '', v.seconds ? `${Math.round(v.seconds / 60)} phút` : ''].filter(Boolean).join(' · ');
    return `<div class="panel-card" style="display:flex;gap:12px;align-items:flex-start;padding:10px;margin-bottom:8px">
      ${thumb}
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;overflow-wrap:anywhere">${escapeHtml(v.title || v.id)}</div>
        <div style="font-size:12px;color:var(--color-ink-dim);margin:4px 0"><span class="tab-badge ${cls}">${label}</span>${escapeHtml(step)} ${escapeHtml(meta)}</div>
        ${v.reason ? `<div style="font-size:12px;color:var(--color-ink-dim)">${escapeHtml(v.reason)}</div>` : ''}
        ${v.error ? `<div style="font-size:12px;color:#c0392b;white-space:pre-wrap;max-height:60px;overflow:auto">${escapeHtml(v.error.slice(0, 400))}</div>` : ''}
        ${v.has_mp4 ? `<div style="margin-top:6px;display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-secondary" onclick="storyPlay('${encodeURIComponent(v.id)}')">▶ Xem</button>
          <a class="btn btn-secondary" href="/api/story-remake/video/${encodeURIComponent(v.id)}" download="${escapeHtml(v.id)}.mp4">⬇ Tải MP4</a></div>` : ''}
      </div></div>`;
  }).join('') || '<div style="color:var(--color-ink-dim)">Chưa có video nào.</div>';
}

async function storyRun() {
  const url = document.getElementById('story-url').value.trim();
  if (!url) { alert('Dán link kênh hoặc video YouTube'); return; }
  const body = {
    url,
    limit: Number(document.getElementById('story-limit').value) || 5,
    jobs: Number(document.getElementById('story-jobs').value) || 1,
    lang: document.getElementById('story-lang').value || 'auto',
    images: document.getElementById('story-images').value || 'muse',
  };
  try {
    await storyJson('/api/story-remake/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch (e) { alert(e.message); }
  storyRefresh();
}

async function storyStop() {
  if (!confirm('Dừng lượt đang chạy? Video đang làm dở sẽ tiếp tục ở lần chạy sau.')) return;
  await storyJson('/api/story-remake/stop', { method: 'POST' }).catch((e) => alert(e.message));
  storyRefresh();
}

function storyPlay(id) {
  const box = document.getElementById('story-player');
  box.innerHTML = `<video src="/api/story-remake/video/${id}" controls autoplay style="width:100%;max-height:70vh;border-radius:8px;background:#000"></video>`;
  box.scrollIntoView({ behavior: 'smooth' });
}
