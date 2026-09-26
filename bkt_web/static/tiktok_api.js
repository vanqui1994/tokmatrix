// =============================================================================
// TAB: TikTok REST API (chocode) — /api/tiktok-api/*
// =============================================================================
let tkapiEndpoints = [];
let tkapiLoaded = false;

async function tkapiJson(url, options) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
  return data;
}

async function loadTiktokApiTab() {
  tkapiRefreshStatus();
  if (tkapiLoaded) return;
  try {
    const data = await tkapiJson('/api/tiktok-api/endpoints');
    tkapiEndpoints = data.endpoints || [];
    const select = document.getElementById('tkapi-endpoint');
    const groups = {};
    tkapiEndpoints.forEach((ep, idx) => {
      (groups[ep.group] = groups[ep.group] || []).push({ ep, idx });
    });
    select.innerHTML = Object.entries(groups).map(([group, items]) => `
      <optgroup label="${escapeHtml(group)}">
        ${items.map(({ ep, idx }) => `<option value="${idx}">${ep.write ? '⚠️ ' : ''}${escapeHtml(ep.label)} — ${ep.method} ${escapeHtml(ep.path)}</option>`).join('')}
      </optgroup>`).join('');
    tkapiLoaded = true;
    tkapiRenderParams();
  } catch (err) {
    showToast('Không tải được danh mục TikTok API: ' + err.message);
  }
}

async function tkapiRefreshStatus() {
  const line = document.getElementById('tkapi-status-line');
  const badge = document.getElementById('badge-tkapi-status');
  try {
    const s = await tkapiJson('/api/tiktok-api/status');
    const online = s.gateway && s.gateway.online;
    const blockBox = document.getElementById('tkapi-block-mock');
    if (blockBox) blockBox.checked = !!s.block_mock;
    if (badge) badge.textContent = !s.configured ? 'CHƯA KEY' : (online ? 'ONLINE' : 'OFFLINE');
    if (line) {
      line.textContent = !s.configured
        ? 'Chưa có khoá — nhập “TikTok API (chocode)” ở Cài Đặt Hệ Thống → Kho Khoá API.'
        : `${s.endpoint_count} endpoint · Gateway ${online ? 'online v' + (s.gateway.version || '?') : 'không phản hồi'}`;
    }
  } catch (err) {
    if (line) line.textContent = 'Lỗi kiểm tra trạng thái: ' + err.message;
  }
}

function tkapiCurrent() {
  const select = document.getElementById('tkapi-endpoint');
  return tkapiEndpoints[Number(select && select.value)];
}

function tkapiRenderParams() {
  const ep = tkapiCurrent();
  const box = document.getElementById('tkapi-params');
  const bodyGroup = document.getElementById('tkapi-body-group');
  if (!ep || !box) return;
  box.innerHTML = ep.params.length
    ? ep.params.map(name => `
      <div class="form-group">
        <label for="tkapi-p-${escapeHtml(name)}">${escapeHtml(name)}:</label>
        <input id="tkapi-p-${escapeHtml(name)}" data-param="${escapeHtml(name)}" class="form-control mono" onkeydown="if(event.key==='Enter')tkapiRun()">
      </div>`).join('')
    : '<p style="font-size: 12px; color: var(--text-dim);">Endpoint này không có tham số query.</p>';
  if (bodyGroup) bodyGroup.style.display = ep.method === 'POST' && (ep.write || !ep.params.length) ? 'block' : 'none';
}

async function tkapiRun() {
  const ep = tkapiCurrent();
  if (!ep) return;
  const params = {};
  document.querySelectorAll('#tkapi-params [data-param]').forEach(input => {
    if (input.value.trim()) params[input.dataset.param] = input.value.trim();
  });
  let body = null;
  const bodyText = (document.getElementById('tkapi-body').value || '').trim();
  if (ep.method === 'POST' && bodyText) {
    try { body = JSON.parse(bodyText); } catch (e) { showToast('Body JSON không hợp lệ: ' + e.message); return; }
  }
  if (ep.write && !confirm(`“${ep.label}” sẽ tác động lên tài khoản TikTok thật. Tiếp tục?`)) return;

  const btn = document.getElementById('tkapi-run');
  const meta = document.getElementById('tkapi-result-meta');
  const out = document.getElementById('tkapi-result');
  const warn = document.getElementById('tkapi-mock-warning');
  btn.disabled = true;
  btn.textContent = 'Đang gọi...';
  const started = performance.now();
  try {
    const data = await tkapiJson('/api/tiktok-api/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: ep.path, params, body, confirm_write: !!ep.write }),
    });
    meta.textContent = `${ep.method} ${ep.path} · ${data.message || data.status} · ${Math.round(performance.now() - started)} ms`;
    const markers = data.mock_markers || [];
    warn.style.display = markers.length ? 'block' : 'none';
    warn.textContent = markers.length ? '⚠️ Có dấu hiệu dữ liệu mẫu (không phải dữ liệu thật): ' + markers.join('; ') : '';
    out.textContent = JSON.stringify(data.data, null, 2);
  } catch (err) {
    meta.textContent = `${ep.method} ${ep.path} · lỗi`;
    warn.style.display = 'none';
    out.textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Gọi API';
  }
}

async function tkapiLookupProfile() {
  const username = (document.getElementById('tkapi-username').value || '').trim().replace(/^@/, '');
  const box = document.getElementById('tkapi-profile');
  if (!username) { showToast('Nhập username cần tra'); return; }
  box.innerHTML = '<div class="spinner"></div>';
  try {
    const p = await tkapiJson('/api/tiktok-api/profile?username=' + encodeURIComponent(username));
    const fmt = n => Number(n || 0).toLocaleString('vi-VN');
    box.innerHTML = `
      <div style="display: flex; gap: 12px; align-items: center;">
        <img src="${safeExternalUrl(p.avatar)}" alt="" style="width: 56px; height: 56px; border-radius: 50%; object-fit: cover;" onerror="this.style.display='none'">
        <div>
          <strong>${escapeHtml(p.nickname)}</strong> ${p.verified ? '✔️' : ''} ${p.private ? '🔒' : ''}
          <div class="mono" style="font-size: 12px; color: var(--text-dim);">@${escapeHtml(p.username)} · uid ${escapeHtml(p.uid)}</div>
        </div>
      </div>
      <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; margin-top: 10px; font-size: 13px;">
        <div>👥 Follower: <strong>${fmt(p.follower_count)}</strong></div>
        <div>➡️ Following: <strong>${fmt(p.following_count)}</strong></div>
        <div>❤️ Tim: <strong>${fmt(p.like_count)}</strong></div>
        <div>🎬 Video: <strong>${fmt(p.video_count)}</strong></div>
      </div>
      ${p.signature ? `<p style="font-size: 12px; margin-top: 8px; color: var(--text-dim);">${escapeHtml(p.signature)}</p>` : ''}`;
  } catch (err) {
    box.innerHTML = `<p style="color: #dc2626; font-size: 13px;">${escapeHtml(err.message)}</p>`;
  }
}

async function tkapiSyncAllProfiles(button) {
  if (!confirm('Cập nhật follower / tim / số video của mọi kênh có username từ TikTok API?')) return;
  const label = button.innerHTML;
  button.disabled = true;
  try {
    const start = await tkapiJson('/api/tiktok-api/channels/sync-all', { method: 'POST' });
    showToast(start.message);
    while (true) {
      await new Promise(resolve => setTimeout(resolve, 1500));
      const s = await tkapiJson('/api/tiktok-api/channels/sync-status');
      button.textContent = `Đồng bộ ${s.done}/${s.total}...`;
      if (!s.running) {
        showToast(`Đồng bộ xong: ${s.updated} cập nhật, ${s.failed} bỏ qua` + (s.errors.length ? ` (vd. ${s.errors[0]})` : ''), 6000);
        break;
      }
    }
    if (typeof loadChannels === 'function') loadChannels();
  } catch (err) {
    showToast('Lỗi đồng bộ hồ sơ: ' + err.message);
  } finally {
    button.disabled = false;
    button.innerHTML = label;
  }
}

async function tkapiToggleBlockMock(box) {
  const want = box.checked;
  if (!want && !confirm('Tắt chặn: dữ liệu mẫu của API (video/số liệu không có thật) sẽ được ghi vào danh sách kênh và thống kê. Tiếp tục?')) {
    box.checked = true;
    return;
  }
  try {
    const r = await tkapiJson('/api/tiktok-api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ block_mock: want }),
    });
    box.checked = r.block_mock;
    showToast(r.block_mock ? 'Đã bật chặn dữ liệu mẫu' : 'Đã tắt chặn — dữ liệu API được ghi thẳng vào app');
  } catch (err) {
    box.checked = !want;
    showToast('Lỗi lưu cài đặt: ' + err.message);
  }
}

async function tkapiScanAllVideos(button) {
  if (!confirm('Quét video của mọi kênh có username qua TikTok API?\nMỗi kênh: username → sec_uid → danh sách video → chi tiết 30 video mới nhất.')) return;
  const label = button.innerHTML;
  button.disabled = true;
  try {
    const start = await tkapiJson('/api/channels/scan-videos-api', { method: 'POST' });
    showToast(start.message);
    while (true) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      const s = await tkapiJson('/api/channels/scan-videos-api/status');
      button.textContent = `Quét video ${s.done}/${s.total}...`;
      if (!s.running) {
        showToast(`Quét video xong: ${s.updated} kênh cập nhật (${s.videos} video, chi tiết ${s.details_ok} ok / ${s.details_failed} lỗi), ${s.failed} kênh bỏ qua`
          + (s.errors.length ? `. Vd: ${s.errors[0]}` : ''), 8000);
        break;
      }
    }
    if (typeof loadChannels === 'function') loadChannels();
  } catch (err) {
    showToast('Lỗi quét video qua API: ' + err.message);
  } finally {
    button.disabled = false;
    button.innerHTML = label;
  }
}
