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
  // Muse dành cho Kuaishou remake: bỏ lựa chọn Muse, Story Remake chỉ vẽ bằng ImageRouter (Cloudflare dự phòng)
  const imgSel = document.getElementById('story-images');
  if (imgSel) {
    imgSel.querySelector('option[value="muse"]')?.remove();
    imgSel.value = 'imagerouter';
    const opt = imgSel.querySelector('option[value="imagerouter"]');
    if (opt) opt.textContent = 'ImageRouter, dự phòng Cloudflare';
  }
  storyRefresh();
  storyWatchRefresh();
  if (storyTimer) clearInterval(storyTimer);
  storyTimer = setInterval(() => {
    if (document.getElementById('pane-story_remake')?.style.display === 'none') { clearInterval(storyTimer); storyTimer = null; return; }
    storyRefresh();
    storyWatchRefresh();
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
    images: document.getElementById('story-images').value || 'imagerouter',
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

// ---- Theo dõi kênh Shorts: thêm kênh → server tự chạy kênh đó ngay khi rảnh, rồi định kỳ làm Shorts mới (/api/story-remake/watch)
function storyWatchMount() {
  if (document.getElementById('story-watch')) return;
  const anchor = document.querySelector('#pane-story_remake .story-log-details');
  if (!anchor) return;
  if (!document.getElementById('story-watch-css')) {
    const css = document.createElement('style');
    css.id = 'story-watch-css';
    css.textContent = `.story-watch{margin:14px 0 0;padding-top:4px;border-top:1px solid #eaecf0}
.story-watch-switch{display:flex;align-items:center;gap:6px;font-size:12px;color:#344054}
.story-watch-list{display:flex;flex-direction:column;gap:6px;margin:10px 20px 4px}
.story-watch-item{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 10px;border:1px solid #eaecf0;border-radius:10px;font-size:12px}
.story-watch-item.is-off{opacity:.55}
.story-watch-item span{display:block;color:#667085;font-size:11px;margin-top:2px}
.story-watch-item button{font-size:11px;padding:4px 8px;border:1px solid #d0d5dd;border-radius:8px;background:#fff;cursor:pointer;margin-left:4px}`;
    document.head.appendChild(css);
  }
  const box = document.createElement('div');
  box.id = 'story-watch';
  box.className = 'story-watch';
  box.innerHTML = `
    <div class="story-card-heading"><div><span class="story-card-kicker">TỰ ĐỘNG</span><h3>Theo dõi kênh Shorts</h3></div></div>
    <div class="story-field">
      <label for="story-watch-url">Link kênh YouTube</label>
      <input id="story-watch-url" class="form-control" type="url" placeholder="https://www.youtube.com/@tenkenh" autocomplete="url">
      <span class="story-field-help">Thêm kênh rồi hệ thống tự remake các Shorts mới nhất (theo cấu hình nguồn hình / ngôn ngữ ở trên), kiểm tra lại định kỳ.</span>
    </div>
    <div class="story-options-grid">
      <div class="story-field"><label for="story-watch-limit">Shorts mỗi lượt</label><input id="story-watch-limit" type="number" min="1" max="20" value="3" class="form-control"></div>
      <div class="story-field"><label for="story-watch-interval">Kiểm tra mỗi (phút)</label><input id="story-watch-interval" type="number" min="15" max="1440" value="60" class="form-control" onchange="storyWatchConfig()"></div>
    </div>
    <div class="story-actions">
      <button class="story-start-button" type="button" onclick="storyWatchAdd()">＋ Thêm kênh & tự chạy</button>
      <label class="story-watch-switch"><input id="story-watch-enabled" type="checkbox" checked onchange="storyWatchConfig()"> Bật tự chạy</label>
    </div>
    <div id="story-watch-list" class="story-watch-list"></div>`;
  anchor.parentNode.insertBefore(box, anchor);
}

async function storyWatchRefresh() {
  storyWatchMount();
  const list = document.getElementById('story-watch-list');
  if (!list) return;
  let data;
  try { data = await storyJson('/api/story-remake/watch'); } catch (e) { list.textContent = e.message; return; }
  const iv = document.getElementById('story-watch-interval');
  if (iv && document.activeElement !== iv) iv.value = data.interval_min;
  const en = document.getElementById('story-watch-enabled');
  if (en) en.checked = !!data.enabled;
  const when = (t) => (t ? new Date(t * 1000).toLocaleString('vi-VN') : 'chưa chạy');
  list.innerHTML = (data.channels || []).map((c) => {
    const name = c.url.replace(/^https:\/\/www\.youtube\.com\//, '').replace(/\/shorts$/, '');
    const live = data.running_url === c.url ? ' · ⏳ đang chạy' : '';
    const u = escapeHtml(JSON.stringify(c.url));
    return `<div class="story-watch-item${c.enabled ? '' : ' is-off'}">
      <div><strong>${escapeHtml(name)}</strong><span>${c.limit} Shorts/lượt · lần cuối: ${escapeHtml(when(c.last_run))}${live}</span></div>
      <div><button type="button" onclick='storyWatchAct("toggle", ${u})'>${c.enabled ? 'Tạm dừng' : 'Bật lại'}</button>
      <button type="button" onclick='storyWatchAct("remove", ${u})'>Xoá</button></div></div>`;
  }).join('') || '<div class="story-field-help">Chưa theo dõi kênh nào.</div>';
}

async function storyWatchAdd() {
  const url = document.getElementById('story-watch-url').value.trim();
  if (!url) { alert('Dán link kênh YouTube'); return; }
  const body = {
    url,
    limit: Number(document.getElementById('story-watch-limit').value) || 3,
    lang: document.getElementById('story-lang').value || 'auto',
    images: document.getElementById('story-images').value || 'imagerouter',
  };
  try {
    const r = await storyJson('/api/story-remake/watch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    document.getElementById('story-watch-url').value = '';
    if (!r.started) alert('Đã thêm kênh. Đang có lượt khác chạy — kênh sẽ tự chạy khi lượt đó xong.');
  } catch (e) { alert(e.message); }
  storyWatchRefresh(); storyRefresh();
}

async function storyWatchAct(action, url) {
  if (action === 'remove' && !confirm('Bỏ theo dõi kênh này? Video đã remake vẫn giữ.')) return;
  await storyJson(`/api/story-remake/watch/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) }).catch((e) => alert(e.message));
  storyWatchRefresh();
}

async function storyWatchConfig() {
  const body = { interval_min: Number(document.getElementById('story-watch-interval').value) || 60, enabled: document.getElementById('story-watch-enabled').checked };
  await storyJson('/api/story-remake/watch/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch((e) => alert(e.message));
  storyWatchRefresh();
}
