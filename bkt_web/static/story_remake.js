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
  storyView.vids = data.videos || [];
  storyRenderList();
}

// ---- Thư viện: lưới thẻ 9:16 + tìm / lọc trạng thái / sắp xếp / phân trang, xem video trong cửa sổ nổi.
const STORY_PAGE = 24;
const storyView = { vids: [], filter: 'all', q: '', sort: 'new', shown: STORY_PAGE, sig: '' };

function storyLibraryMount() {
  if (document.getElementById('story-toolbar')) return;
  if (!document.getElementById('story-lib-css')) {
    const css = document.createElement('style');
    css.id = 'story-lib-css';
    css.textContent = `#pane-story_remake .story-toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:12px 16px;border-bottom:1px solid #eaecf0;background:#fff}
#pane-story_remake .story-toolbar input{flex:1 1 180px;min-width:140px;height:34px;padding:0 10px;border:1px solid #d0d5dd;border-radius:8px;font-size:13px}
#pane-story_remake .story-toolbar select{height:34px;border:1px solid #d0d5dd;border-radius:8px;font-size:12px;padding:0 6px;background:#fff}
#pane-story_remake .story-chips{display:flex;flex-wrap:wrap;gap:6px;width:100%}
#pane-story_remake .story-chip{border:1px solid #d0d5dd;background:#fff;border-radius:999px;padding:4px 10px;font-size:12px;color:#344054;cursor:pointer}
#pane-story_remake .story-chip b{font-weight:600;color:#667085;margin-left:3px}
#pane-story_remake .story-chip.is-on{background:#1d4ed8;border-color:#1d4ed8;color:#fff}
#pane-story_remake .story-chip.is-on b{color:#dbeafe}
#pane-story_remake #story-list.sr-grid{grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;min-height:0}
#pane-story_remake .sr-card{display:flex;flex-direction:column;min-width:0;border:1px solid #eaecf0;border-radius:11px;background:#fff;overflow:hidden}
#pane-story_remake .sr-thumb{position:relative;aspect-ratio:9/16;background:#101828;cursor:default}
#pane-story_remake .sr-thumb.can-play{cursor:pointer}
#pane-story_remake .sr-thumb img{width:100%;height:100%;object-fit:cover;display:block}
#pane-story_remake .sr-thumb .story-status-pill{position:absolute;left:6px;top:6px;right:auto;bottom:auto;width:auto;height:auto;padding:2px 7px;border-radius:999px;font-size:10px;line-height:1.5;white-space:nowrap}
#pane-story_remake .sr-noimg{display:flex;align-items:center;justify-content:center;height:100%;color:#98a2b3;font-size:26px}
#pane-story_remake .sr-play{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;opacity:0;background:rgba(16,24,40,.35);color:#fff;font-size:34px;transition:opacity .15s}
#pane-story_remake .sr-thumb.can-play:hover .sr-play{opacity:1}
#pane-story_remake .sr-body{padding:8px 9px 9px;display:flex;flex-direction:column;gap:3px;min-width:0;flex:1}
#pane-story_remake .sr-title{font-size:12px;font-weight:600;color:#101828;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word}
#pane-story_remake .sr-meta{font-size:11px;color:#667085}
#pane-story_remake .sr-err{font-size:11px;color:#b42318;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
#pane-story_remake .sr-actions{display:flex;gap:6px;margin-top:auto;padding-top:5px}
#pane-story_remake .sr-actions a,#pane-story_remake .sr-actions button{flex:1;text-align:center;font-size:11px;padding:5px 0;border:1px solid #d0d5dd;border-radius:7px;background:#fff;color:#344054;text-decoration:none;cursor:pointer}
#pane-story_remake .sr-actions .is-primary{background:#1d4ed8;border-color:#1d4ed8;color:#fff}
#pane-story_remake .sr-more{grid-column:1/-1;justify-self:center;margin:4px 0 2px;padding:8px 18px;border:1px solid #d0d5dd;border-radius:9px;background:#fff;font-size:12px;cursor:pointer}
#pane-story_remake .sr-none{grid-column:1/-1;text-align:center;color:#667085;font-size:13px;padding:30px 0}
.sr-modal{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(16,24,40,.72);padding:16px}
.sr-modal video{max-height:88vh;max-width:min(100%,520px);border-radius:12px;background:#000}
.sr-modal button{position:absolute;top:14px;right:18px;font-size:26px;color:#fff;background:none;border:0;cursor:pointer}
@media (max-width:560px){#pane-story_remake #story-list.sr-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}}`;
    document.head.appendChild(css);
  }
  const list = document.getElementById('story-list');
  if (!list) return;
  list.classList.add('sr-grid');
  const bar = document.createElement('div');
  bar.id = 'story-toolbar';
  bar.className = 'story-toolbar';
  bar.innerHTML = `<input id="story-q" type="search" placeholder="Tìm theo tiêu đề hoặc id…" aria-label="Tìm video">
    <select id="story-sort" aria-label="Sắp xếp"><option value="new">Mới cập nhật</option><option value="old">Cũ nhất</option><option value="title">Tên A–Z</option><option value="long">Dài nhất</option></select>
    <div id="story-chips" class="story-chips" role="group" aria-label="Lọc trạng thái"></div>`;
  list.parentNode.insertBefore(bar, list);
  document.getElementById('story-q').addEventListener('input', (e) => { storyView.q = e.target.value.trim().toLowerCase(); storyView.shown = STORY_PAGE; storyRenderList(true); });
  document.getElementById('story-sort').addEventListener('change', (e) => { storyView.sort = e.target.value; storyRenderList(true); });
}

function storySetFilter(f) { storyView.filter = f; storyView.shown = STORY_PAGE; storyRenderList(true); }
function storyMore() { storyView.shown += STORY_PAGE; storyRenderList(true); }

function storyRenderList(force) {
  storyLibraryMount();
  const all = storyView.vids;
  const sig = JSON.stringify(all.map((v) => [v.id, v.status, v.step, v.has_mp4, v.has_thumb, v.updated, v.upload_task_id, v.upload_error]));
  if (!force && sig === storyView.sig) return;  // không vẽ lại mỗi 5 s khi không đổi (giữ vị trí cuộn / hover)
  storyView.sig = sig;
  const counts = { all: all.length };
  all.forEach((v) => { counts[v.status] = (counts[v.status] || 0) + 1; });
  const count = document.getElementById('story-count');
  if (count) count.textContent = `${counts.done || 0} / ${all.length} xong`;
  const chips = [['all', 'Tất cả'], ['done', 'Xong'], ['running', 'Đang làm'], ['error', 'Lỗi'], ['skipped', 'Bỏ qua']];
  document.getElementById('story-chips').innerHTML = chips.filter(([k]) => k === 'all' || counts[k])
    .map(([k, label]) => `<button type="button" class="story-chip${storyView.filter === k ? ' is-on' : ''}" onclick="storySetFilter('${k}')">${label}<b>${counts[k] || 0}</b></button>`).join('');
  const list = document.getElementById('story-list');
  if (!all.length) {
    list.innerHTML = `<div class="story-empty-state" style="grid-column:1/-1"><span class="story-empty-icon" aria-hidden="true">▶</span><strong>Chưa có video remake</strong><p>Dán link kênh hoặc video YouTube ở khung bên trái, rồi bắt đầu lượt chạy đầu tiên.</p><button type="button" onclick="document.getElementById('story-url').focus()">Nhập link YouTube</button></div>`;
    return;
  }
  const q = storyView.q;
  let vids = all.filter((v) => (storyView.filter === 'all' || v.status === storyView.filter)
    && (!q || `${v.title || ''} ${v.id}`.toLowerCase().includes(q)));
  const cmp = { new: (a, b) => b.updated - a.updated, old: (a, b) => a.updated - b.updated,
    title: (a, b) => String(a.title || a.id).localeCompare(String(b.title || b.id)), long: (a, b) => (b.seconds || 0) - (a.seconds || 0) }[storyView.sort];
  vids = vids.sort(cmp);
  const page = vids.slice(0, storyView.shown);
  list.innerHTML = page.map((v) => {
    const [label, cls] = STORY_STATUS[v.status] || [v.status, 'badge-neutral'];
    const step = v.status === 'running' && v.step ? `${STORY_STEP[v.step] || v.step}` : '';
    const id = encodeURIComponent(v.id);
    const thumb = v.has_thumb ? `<img loading="lazy" src="/api/story-remake/thumb/${id}" alt="">` : '<div class="sr-noimg" aria-hidden="true">▶</div>';
    const meta = [v.scenes ? `${v.scenes} cảnh` : '', v.seconds ? `${Math.max(1, Math.round(v.seconds / 60))} phút làm` : '', step].filter(Boolean).join(' · ');
    const play = v.has_mp4 ? ` can-play" onclick="storyPlay('${id}')" title="Xem video` : '';
    return `<article class="sr-card">
      <div class="sr-thumb${play}">${thumb}<span class="story-status-pill ${cls}">${label}</span>${v.has_mp4 ? '<span class="sr-play" aria-hidden="true">▶</span>' : ''}</div>
      <div class="sr-body">
        <div class="sr-title" title="${escapeHtml(v.title || v.id)}">${escapeHtml(v.title || v.id)}</div>
        ${meta ? `<div class="sr-meta">${escapeHtml(meta)}</div>` : ''}
        ${v.reason ? `<div class="sr-meta" title="${escapeHtml(v.reason)}">${escapeHtml(v.reason)}</div>` : ''}
        ${v.upload_task_id ? `<div class="sr-meta">📤 Đã vào hàng đợi đăng${v.account_id ? ` · ${escapeHtml(storyAccountName(v.account_id))}` : ''}</div>` : (v.account_id && v.status === 'done' && !v.upload_error ? '<div class="sr-meta">📤 Chờ xếp lịch đăng…</div>' : '')}
        ${v.upload_error ? `<div class="sr-err" title="${escapeHtml(v.upload_error)}">${escapeHtml(v.upload_error)}</div>` : ''}
        ${v.error ? `<div class="sr-err" title="${escapeHtml(v.error.slice(0, 600))}">${escapeHtml(v.error.slice(0, 200))}</div>` : ''}
        ${v.has_mp4 ? `<div class="sr-actions"><button type="button" class="is-primary" onclick="storyPlay('${id}')">Xem</button><a href="/api/story-remake/video/${id}" download="${escapeHtml(v.id)}.mp4">Tải</a></div>` : ''}
      </div></article>`;
  }).join('') || '<div class="sr-none">Không có video khớp bộ lọc.</div>';
  if (vids.length > page.length) list.insertAdjacentHTML('beforeend', `<button type="button" class="sr-more" onclick="storyMore()">Xem thêm (${vids.length - page.length} video)</button>`);
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
    account_id: Number(document.getElementById('story-account')?.value) || null,
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
  storyClosePlayer();
  const m = document.createElement('div');
  m.id = 'story-modal';
  m.className = 'sr-modal';
  m.setAttribute('role', 'dialog');
  m.setAttribute('aria-label', 'Xem video Story Remake');
  m.innerHTML = `<button type="button" aria-label="Đóng" onclick="storyClosePlayer()">✕</button><video src="/api/story-remake/video/${id}" controls autoplay playsinline></video>`;
  m.addEventListener('click', (e) => { if (e.target === m) storyClosePlayer(); });
  document.body.appendChild(m);
}

function storyClosePlayer() { document.getElementById('story-modal')?.remove(); }
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') storyClosePlayer(); });

// ---- Tài khoản đăng: video remake xong vào hàng đợi đăng của tài khoản này (bỏ trống = không đăng).
let storyAccounts = null;
async function storyLoadAccounts() {
  if (storyAccounts) return storyAccounts;
  try { storyAccounts = (await storyJson('/api/story-remake/accounts')).accounts || []; } catch (e) { storyAccounts = []; }
  return storyAccounts;
}
function storyAccountOptions() {
  return '<option value="">Không đăng</option>' + (storyAccounts || []).map((a) => `<option value="${a.id}">${escapeHtml(a.name)} (${escapeHtml(a.language)})</option>`).join('');
}
function storyAccountName(id) {
  const a = (storyAccounts || []).find((x) => x.id === id);
  return a ? `${a.name} (${a.language})` : `#${id}`;
}
async function storyAccountMount() {
  await storyLoadAccounts();
  const grid = document.querySelector('#pane-story_remake .story-setup-card > .story-options-grid');
  if (grid && !document.getElementById('story-account')) {
    grid.insertAdjacentHTML('beforeend', `<div class="story-field" style="grid-column:1/-1"><label for="story-account">Đăng lên tài khoản</label>
      <select id="story-account" class="form-control">${storyAccountOptions()}</select>
      <span class="story-field-help">Video xong tự vào hàng đợi đăng của tài khoản (khung giờ kế tiếp). Lời kể phải cùng ngôn ngữ với tài khoản.</span></div>`);
  }
  const w = document.getElementById('story-watch-account');
  if (w && !w.options.length) w.innerHTML = storyAccountOptions();
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
.story-watch > .story-card-heading{margin-bottom:16px}
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
    <div class="story-field story-url-field">
      <label for="story-watch-url">Link kênh YouTube</label>
      <input id="story-watch-url" class="form-control" type="url" placeholder="https://www.youtube.com/@tenkenh" autocomplete="url">
      <span class="story-field-help">Thêm kênh rồi hệ thống tự remake các Shorts mới nhất (theo cấu hình nguồn hình / ngôn ngữ ở trên), kiểm tra lại định kỳ.</span>
    </div>
    <div class="story-options-grid">
      <div class="story-field"><label for="story-watch-limit">Shorts mỗi lượt</label><input id="story-watch-limit" type="number" min="1" max="20" value="3" class="form-control"></div>
      <div class="story-field"><label for="story-watch-interval">Kiểm tra mỗi (phút)</label><input id="story-watch-interval" type="number" min="15" max="1440" value="60" class="form-control" onchange="storyWatchConfig()"></div>
      <div class="story-field" style="grid-column:1/-1"><label for="story-watch-account">Đăng lên tài khoản</label><select id="story-watch-account" class="form-control"></select></div>
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
  await storyAccountMount();
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
      <div><strong>${escapeHtml(name)}</strong><span>${c.account_id ? `→ ${escapeHtml(storyAccountName(c.account_id))} · ` : 'không đăng · '}${c.limit} Shorts/lượt · lần cuối: ${escapeHtml(when(c.last_run))}${live}</span></div>
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
    account_id: Number(document.getElementById('story-watch-account').value) || null,
  };
  if (!body.account_id && !confirm('Chưa chọn tài khoản đăng — video remake xong sẽ không tự đăng. Vẫn thêm kênh?')) return;
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
