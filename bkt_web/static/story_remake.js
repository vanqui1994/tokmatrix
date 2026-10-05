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
  try {
    data = await storyJson('/api/story-remake/status');
  } catch (e) {
    const list = document.getElementById('story-list');
    const count = document.getElementById('story-count');
    if (count) count.textContent = 'Chưa kết nối';
    if (list) list.innerHTML = `<div class="story-empty-state is-error"><span class="story-empty-icon" aria-hidden="true">!</span><strong>Không tải được thư viện</strong><p>${escapeHtml(e.message || 'Hãy tải lại trang để thử lại.')}</p></div>`;
    return;
  }
  const r = data.runner || {};
  const badge = document.getElementById('badge-story-status');
  if (badge) badge.textContent = r.running ? 'chạy' : '--';
  const runButton = document.getElementById('story-run-btn');
  const stopButton = document.getElementById('story-stop-btn');
  const runnerStatus = document.getElementById('story-runner');
  if (runButton) runButton.disabled = !!r.running;
  if (stopButton) stopButton.style.display = r.running ? '' : 'none';
  if (runnerStatus) runnerStatus.textContent = r.running
    ? `Đang chạy: ${r.url} (tối đa ${r.limit} video, ${r.jobs} luồng)`
    : (r.url ? `Lượt gần nhất: ${r.url}` : 'Chưa chạy lượt nào');
  const log = document.getElementById('story-log');
  if (log) log.textContent = data.log || 'Chưa có nhật ký.';
  const vids = data.videos || [];
  const done = vids.filter((v) => v.status === 'done').length;
  const count = document.getElementById('story-count');
  if (count) count.textContent = `${done} / ${vids.length} xong`;
  document.getElementById('story-list').innerHTML = vids.map((v) => {
    const [label, cls] = STORY_STATUS[v.status] || [v.status, 'badge-neutral'];
    const step = v.status === 'running' && v.step ? ` · ${STORY_STEP[v.step] || v.step}` : '';
    const thumb = v.has_thumb ? `<img src="/api/story-remake/thumb/${encodeURIComponent(v.id)}" alt="Khung hình xem trước của ${escapeHtml(v.title || v.id)}">` : '<div class="story-video-placeholder" aria-hidden="true">▶</div>';
    const meta = [v.scenes ? `${v.scenes} cảnh` : '', v.seconds ? `${Math.round(v.seconds / 60)} phút` : ''].filter(Boolean).join(' · ');
    return `<article class="story-video-card">
      <div class="story-video-thumb">${thumb}<span class="story-status-pill ${cls}">${label}</span></div>
      <div class="story-video-content">
        <div class="story-video-title">${escapeHtml(v.title || v.id)}</div>
        <div class="story-video-meta">${escapeHtml(meta || 'YouTube story')}${escapeHtml(step)}</div>
        ${v.reason ? `<div class="story-video-note">${escapeHtml(v.reason)}</div>` : ''}
        ${v.error ? `<div class="story-video-error">${escapeHtml(v.error.slice(0, 400))}</div>` : ''}
        ${v.has_mp4 ? `<div class="story-video-actions">
          <button class="story-video-action is-primary" type="button" onclick="storyPlay('${encodeURIComponent(v.id)}')">Xem video</button>
          <a class="story-video-action" href="/api/story-remake/video/${encodeURIComponent(v.id)}" download="${escapeHtml(v.id)}.mp4">Tải MP4</a></div>` : ''}
      </div></article>`;
  }).join('') || `<div class="story-empty-state"><span class="story-empty-icon" aria-hidden="true">▶</span><strong>Chưa có video remake</strong><p>Dán link kênh hoặc video YouTube ở khung bên trái, rồi bắt đầu lượt chạy đầu tiên.</p><button type="button" onclick="document.getElementById('story-url').focus()">Nhập link YouTube</button></div>`;
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
  if (!box) return;
  box.hidden = false;
  box.innerHTML = `<video src="/api/story-remake/video/${id}" controls autoplay playsinline aria-label="Video Story Remake" ></video>`;
  box.scrollIntoView({ behavior: 'smooth' });
}
