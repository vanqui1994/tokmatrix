// =============================================================================
// TAB: Kuaishou → Muse — profile Kuaishou ↔ tài khoản TikTok, Muse làm lại cùng phong cách, lời theo ngôn ngữ acc.
// API /api/muse-remake/*
// =============================================================================
let mrTimer = null;
const MR_STATUS = {
  new: ['⏳ Chờ', 'badge-neutral'], downloading: ['⬇ Tải', 'badge-warning'], analyzing: ['✍️ Phân tích', 'badge-warning'],
  shooting: ['🎬 Muse quay', 'badge-warning'], voicing: ['🎙 Lồng tiếng', 'badge-warning'], queued: ['📤 Trong hàng đợi đăng', 'badge-success'],
  error: ['❌ Lỗi', 'badge-danger'], deleted: ['🗑 Đã xoá', 'badge-neutral'],
};
const MR_LANG = { de: 'Deutsch', en: 'English', ko: '한국어', ja: '日本語' };

async function mrJson(url, options) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
  return data;
}

function loadMuseRemakeTab() {
  mrLoadAccounts();
  mrRefresh();
  if (mrTimer) clearInterval(mrTimer);
  mrTimer = setInterval(() => {
    if (document.getElementById('pane-muse_remake')?.style.display === 'none') { clearInterval(mrTimer); mrTimer = null; return; }
    mrRefresh();
  }, 8000);
}

async function mrLoadAccounts() {
  const sel = document.getElementById('mr-account');
  if (!sel) return;
  try {
    const { accounts } = await mrJson('/api/muse-remake/accounts');
    sel.innerHTML = '<option value="">— Chọn tài khoản TikTok —</option>' + accounts.map((a) =>
      `<option value="${a.id}" ${a.used ? 'disabled' : ''}>${escapeHtml(a.name)} · ${MR_LANG[a.language] || a.language}${a.used ? ' (đã gán)' : ''}</option>`).join('');
  } catch (e) { sel.innerHTML = `<option value="">Lỗi: ${escapeHtml(e.message)}</option>`; }
}

async function mrAddSource() {
  const body = {
    profile_url: document.getElementById('mr-profile').value.trim(),
    channel_id: Number(document.getElementById('mr-account').value),
    per_day: Number(document.getElementById('mr-per-day').value) || 2,
  };
  if (!body.profile_url || !body.channel_id) { showToast('Nhập link profile Kuaishou và chọn tài khoản'); return; }
  try {
    await mrJson('/api/muse-remake/sources', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    document.getElementById('mr-profile').value = '';
    showToast('Đã gán profile — đang quét video');
    mrLoadAccounts();
    mrRefresh();
  } catch (e) { showToast('Lỗi: ' + e.message); }
}

async function mrSourceAct(id, act, extra) {
  try {
    if (act === 'delete') {
      if (!confirm('Bỏ gán profile này? Video đã làm vẫn giữ trong hàng đợi.')) return;
      await mrJson(`/api/muse-remake/sources/${id}`, { method: 'DELETE' });
      mrLoadAccounts();
    } else if (act === 'scan') {
      const d = await mrJson(`/api/muse-remake/sources/${id}/scan`, { method: 'POST' });
      showToast(`Quét xong: ${d.added} video mới`);
    } else {
      await mrJson(`/api/muse-remake/sources/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(extra) });
    }
  } catch (e) { showToast('Lỗi: ' + e.message); }
  mrRefresh();
}

async function mrVideoAct(id, act) {
  try {
    if (act === 'delete') {
      if (!confirm('Xoá video này và task đăng của nó (nếu chưa đăng)?')) return;
      const d = await mrJson(`/api/muse-remake/videos/${id}`, { method: 'DELETE' });
      showToast(d.note || 'Đã xoá video và task đăng');
    } else if (act === 'retry') {
      await mrJson(`/api/muse-remake/videos/${id}/retry`, { method: 'POST' });
    } else if (act === 'play') {
      const box = document.getElementById('mr-player');
      box.hidden = false;
      box.innerHTML = `<video src="/api/muse-remake/videos/${id}/file" controls autoplay playsinline></video>`;
      box.scrollIntoView({ behavior: 'smooth' });
      return;
    }
  } catch (e) { showToast('Lỗi: ' + e.message); }
  mrRefresh();
}

async function mrRefresh() {
  let src, vids;
  try {
    [src, vids] = await Promise.all([mrJson('/api/muse-remake/sources'), mrJson('/api/muse-remake/videos')]);
  } catch (e) { return; }
  const running = (vids.videos || []).filter((v) => ['new', 'downloading', 'analyzing', 'shooting', 'voicing'].includes(v.status)).length;
  const badge = document.getElementById('badge-mr-status');
  if (badge) badge.textContent = running ? `${running} chạy` : (src.sources.length ? `${src.sources.length} nguồn` : '--');
  document.getElementById('mr-sources').innerHTML = src.sources.map((s) => `
    <article class="film-card">
      <div class="film-card-head" style="cursor:default">
        <div style="min-width:0">
          <div class="film-card-title">${escapeHtml(s.author || s.profile_url.split('/').pop())} → ${escapeHtml(s.account)}</div>
          <div class="film-card-meta"><span>${MR_LANG[s.language] || s.language}</span><span>·</span><span>${s.per_day} video/ngày</span>
            <span>·</span><span>${Object.entries(s.counts || {}).filter(([k]) => k !== 'available').map(([k, n]) => `${(MR_STATUS[k] || [k])[0]} ${n}`).join(' · ') || 'chưa có video'}</span>
            ${s.enabled ? '' : '<span class="tab-badge badge-neutral">tạm dừng</span>'}</div>
          ${s.scan_error ? `<div class="film-error">${escapeHtml(s.scan_error)}</div>` : ''}
        </div>
      </div>
      <div class="story-video-actions">
        <a class="story-video-action" href="${escapeHtml(s.profile_url)}" target="_blank" rel="noopener">Profile ↗</a>
        <button type="button" class="story-video-action" onclick="mrSourceAct(${s.id}, 'scan')">↻ Quét ngay</button>
        <button type="button" class="story-video-action" onclick="mrSourceAct(${s.id}, 'patch', {enabled: ${!s.enabled}})">${s.enabled ? '⏸ Tạm dừng' : '▶ Chạy'}</button>
        <button type="button" class="story-video-action" onclick="mrSourceAct(${s.id}, 'delete')">✕ Bỏ gán</button>
      </div>
    </article>`).join('') || '<div class="story-empty-state"><span class="story-empty-icon">🔗</span><strong>Chưa gán profile nào</strong><p>Dán link profile Kuaishou và chọn tài khoản TikTok ở khung bên trái.</p></div>';
  document.getElementById('mr-count').textContent = `${(vids.videos || []).filter((v) => v.status !== 'deleted').length} video`;
  document.getElementById('mr-videos').innerHTML = (vids.videos || []).filter((v) => v.status !== 'deleted').map((v) => {
    const [label, cls] = MR_STATUS[v.status] || [v.status, 'badge-neutral'];
    return `<article class="film-card${v.status === 'queued' ? ' is-done' : ''}">
      <div class="film-card-head" style="cursor:default">
        <div style="min-width:0">
          <div class="film-card-title">${escapeHtml(v.new_title || v.title || v.ks_id)}</div>
          <div class="film-card-meta"><span class="tab-badge ${cls}">${label}</span>${v.language ? `<span>${MR_LANG[v.language] || v.language}</span>` : ''}
            ${v.step ? `<span>· ${escapeHtml(v.step)}</span>` : ''}${v.upload_task_id ? `<span>· task đăng #${v.upload_task_id}</span>` : ''}</div>
          ${v.new_title && v.title ? `<div class="film-card-meta">Gốc: ${escapeHtml(v.title.slice(0, 80))}</div>` : ''}
          ${v.error ? `<div class="film-error">${escapeHtml(v.error)}</div>` : ''}
        </div>
      </div>
      <div class="story-video-actions">
        ${v.final_path ? `<button type="button" class="story-video-action is-primary" onclick="mrVideoAct(${v.id}, 'play')">▶ Xem</button>` : ''}
        <a class="story-video-action" href="${escapeHtml(v.url)}" target="_blank" rel="noopener">Gốc ↗</a>
        ${v.status === 'error' ? `<button type="button" class="story-video-action" onclick="mrVideoAct(${v.id}, 'retry')">↻ Làm lại</button>` : ''}
        <button type="button" class="story-video-action" onclick="mrVideoAct(${v.id}, 'delete')">🗑 Xoá</button>
      </div>
    </article>`;
  }).join('') || '<div class="story-empty-state"><span class="story-empty-icon">🎬</span><strong>Chưa có video</strong><p>Sau khi gán profile, video mới sẽ được Muse làm lại và hiện ở đây.</p></div>';
}
