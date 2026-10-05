// =============================================================================
// TAB: Video AI (Dola Render Gateway) — /api/dola/*
// Server tạo task, poll và tải MP4 ở luồng nền; tab này chỉ hiển thị và gửi lệnh.
// =============================================================================
let dolaStatus = null;
let dolaTimer = null;
const DOLA_ACTIVE = ['SUBMITTING', 'QUEUED', 'PROCESSING', 'DOWNLOADING'];
const DOLA_LABELS = {
  SUBMITTING: ['Đang gửi', 'badge-neutral'],
  QUEUED: ['Xếp hàng', 'badge-neutral'],
  PROCESSING: ['Đang sinh', 'badge-warning'],
  DOWNLOADING: ['Đang tải về', 'badge-warning'],
  COMPLETED: ['Xong', 'badge-success'],
  FAILED: ['Lỗi', 'badge-danger'],
  TIMEOUT: ['Quá hạn', 'badge-danger'],
};

async function dolaJson(url, options) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = Array.isArray(data.detail) ? data.detail.map(d => d.msg).join('; ') : data.detail;
    throw new Error(detail || `HTTP ${res.status}`);
  }
  return data;
}

function dolaFillSelect(id, values, current, fmt) {
  const el = document.getElementById(id);
  if (!el || el.options.length) return;
  el.innerHTML = values.map(v => `<option value="${escapeHtml(String(v))}" ${String(v) === String(current) ? 'selected' : ''}>${escapeHtml(fmt ? fmt(v) : String(v))}</option>`).join('');
}

async function loadDolaTab() {
  dolaLoadGateways();
  await dolaRefreshStatus();
  await dolaLoadTasks();
}

async function dolaRefreshStatus() {
  const line = document.getElementById('dola-status-line');
  const badge = document.getElementById('badge-dola-status');
  try {
    const s = await dolaJson('/api/dola/status');
    dolaStatus = s;
    dolaFillSelect('dola-model', s.models, s.default_model);
    dolaFillSelect('dola-duration', s.durations, 10, v => `${v} giây`);
    const durEl = document.getElementById('dola-duration');
    const modelEl = document.getElementById('dola-model');
    if (durEl && modelEl && !durEl._hasDurListener) {
      durEl._hasDurListener = true;
      durEl.addEventListener('change', () => {
        const val = parseInt(durEl.value, 10);
        if (val === 30) {
          modelEl.value = 'seedance-2.5';
        } else if (val === 10 || val === 15) {
          modelEl.value = 'seedance-2.0';
        }
      });
      modelEl.addEventListener('change', () => {
        if (modelEl.value === 'seedance-2.5' && durEl.value !== '30') {
          durEl.value = '30';
        } else if (modelEl.value === 'seedance-2.0' && durEl.value === '30') {
          durEl.value = '10';
        }
      });
    }
    dolaFillSelect('dola-ratio', s.ratios, '9:16', v => v === '9:16' ? '9:16 (TikTok)' : v);
    dolaFillSelect('dola-count', Array.from({ length: s.max_batch }, (_, i) => i + 1), 1);
    const g = s.gateway || {};
    const active = DOLA_ACTIVE.reduce((n, k) => n + (s.counts[k] || 0), 0);
    if (badge) badge.textContent = !g.online ? 'OFFLINE' : (active ? `${active} chạy` : 'ONLINE');
    if (line) {
      const gws = Object.entries(s.gateways || {});
      const up = gws.filter(([, v]) => v.online).length;
      if (s.config_error) {
        line.textContent = s.config_error;
      } else if (!up) {
        line.textContent = `Không gateway nào phản hồi (${gws.map(([u]) => u).join(', ')}). Kiểm tra DOLA_GATEWAY_BASE_URL / dola_accounts.json.`;
      } else {
        const pending = gws.reduce((n, [, v]) => n + (v.pending_tasks || 0), 0);
        line.textContent = `${up}/${gws.length} gateway online · ${pending} task chờ ở gateway`
          + (s.worker.running ? '' : ' · ⚠️ luồng nền KHÔNG chạy');
      }
    }
    dolaRenderAccounts(s);
  } catch (err) {
    if (line) line.textContent = 'Lỗi kiểm tra trạng thái: ' + err.message;
  }
}

function dolaRenderAccounts(s) {
  const box = document.getElementById('dola-accounts');
  if (!box) return;
  if (s.config_error) {
    box.innerHTML = `<div class="dola-error">${escapeHtml(s.config_error)}</div>`;
    return;
  }
  const accs = s.accounts || [];
  const left = accs.filter(a => a.available).reduce((n, a) => n + a.remaining, 0);
  const reset = s.next_reset ? new Date(s.next_reset * 1000).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '';
  box.innerHTML = `
    <div class="dola-acc-head">Tài khoản: còn <b>${left}</b> video hôm nay · reset 00:00 ${escapeHtml(s.reset_tz)} (${escapeHtml(reset)} giờ máy)</div>
    ${accs.map(a => {
      const state = !a.enabled ? 'Tắt' : !a.gateway_online ? 'Offline'
        : a.is_blocked ? `Khoá tới ${dolaTime(a.blocked_until)}` : a.remaining ? 'Sẵn sàng' : 'Hết lượt';
      const cls = a.available && a.gateway_online ? 'badge-success' : (a.enabled ? 'badge-danger' : 'badge-neutral');
      return `<div class="dola-acc">
        <span class="tab-badge ${cls}">${escapeHtml(state)}</span>
        <b>${escapeHtml(a.id)}</b>
        <span class="dola-meta">${a.used_today}/${a.daily_limit}${a.inflight ? ` · ${a.inflight} đang chạy` : ''} · ${escapeHtml(a.base_url)}${a.has_key ? '' : ' · không key'}</span>
        ${a.block_reason ? `<span class="dola-meta" title="${escapeHtml(a.block_reason)}">${escapeHtml(a.block_reason.slice(0, 80))}</span>` : ''}
        ${a.is_blocked ? `<button type="button" class="btn btn-secondary btn-sm" onclick="dolaUnblock('${escapeHtml(a.id)}')">Gỡ khoá</button>` : ''}
      </div>`;
    }).join('')}`;
}

async function dolaUnblock(id) {
  if (!confirm(`Gỡ khoá tài khoản ${id}? Chỉ nên làm khi đã nạp thêm credit hoặc lỗi đã được sửa.`)) return;
  try {
    await dolaJson(`/api/dola/accounts/${encodeURIComponent(id)}/unblock`, { method: 'POST' });
    await dolaRefreshStatus();
  } catch (err) {
    showToast(err.message);
  }
}

function dolaTime(sec) {
  return sec ? new Date(sec * 1000).toLocaleString('vi-VN') : '';
}

function dolaCard(t) {
  const waiting = t.status === 'SUBMITTING' && t.next_attempt_at > Date.now() / 1000;
  const [label, cls] = waiting ? [`Chờ tới ${new Date(t.next_attempt_at * 1000).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`, 'badge-warning']
    : (DOLA_LABELS[t.status] || [t.status, 'badge-neutral']);
  const done = ['COMPLETED', 'FAILED', 'TIMEOUT'].includes(t.status);
  const canRecheck = t.status === 'TIMEOUT' || (t.status === 'FAILED' && t.remote_id && t.video_url);
  const meta = [`#${t.id}`, t.account_id, t.model, `${t.duration} s`, t.ratio, t.remote_id, dolaTime(t.created_at)]
    .filter(Boolean).map(escapeHtml).join(' · ');
  const refs = (t.reference_images || []).length ? ` · ${t.reference_images.length} ảnh tham chiếu` : '';
  const video = t.file_url
    ? `<video class="dola-video" src="${escapeHtml(t.file_url)}" controls preload="metadata" playsinline></video>` : '';
  const err = t.error ? `<div class="dola-error">${escapeHtml(t.error)}</div>` : '';
  const btns = [
    t.file_url ? `<button type="button" class="btn btn-primary btn-sm" onclick="dolaPostToTiktok(${t.id})">Đăng TikTok</button>` : '',
    t.file_url ? `<a class="btn btn-secondary btn-sm" href="${escapeHtml(t.file_url)}" download>Tải MP4 (${t.file_mb} MB)</a>` : '',
    canRecheck ? `<button type="button" class="btn btn-secondary btn-sm" onclick="dolaAction(${t.id}, 'recheck')">Kiểm tra lại</button>` : '',
    ['FAILED', 'TIMEOUT'].includes(t.status) ? `<button type="button" class="btn btn-secondary btn-sm" onclick="dolaAction(${t.id}, 'retry')">Tạo lại</button>` : '',
    done ? `<button type="button" class="btn btn-danger-outline btn-sm" onclick="dolaDelete(${t.id})">Xoá</button>` : '',
  ].join('');
  return `
    <div class="dola-task">
      <div class="dola-task-head">
        <span class="tab-badge ${cls}">${label}${t.remote_status && !done ? ' · ' + escapeHtml(t.remote_status) : ''}</span>
        <span class="dola-meta">${meta}${refs}</span>
      </div>
      <div class="dola-prompt">${escapeHtml(t.prompt)}</div>
      ${video}${err}
      ${btns ? `<div class="dola-actions">${btns}</div>` : ''}
    </div>`;
}

async function dolaLoadTasks() {
  const box = document.getElementById('dola-tasks');
  if (!box) return;
  try {
    const data = await dolaJson('/api/dola/tasks?limit=100');
    const tasks = data.tasks || [];
    const counts = document.getElementById('dola-counts');
    if (counts) {
      const by = s => tasks.filter(t => s.includes(t.status)).length;
      counts.textContent = `${by(DOLA_ACTIVE)} đang chạy · ${by(['COMPLETED'])} xong · ${by(['FAILED', 'TIMEOUT'])} lỗi`;
    }
    // Không vẽ lại khi có video đang phát (mất vị trí xem).
    const playing = [...box.querySelectorAll('video')].some(v => !v.paused);
    if (!playing) {
      box.innerHTML = tasks.length ? tasks.map(dolaCard).join('')
        : '<div class="dola-empty">Chưa có video nào. Nhập prompt bên trái để bắt đầu.</div>';
    }
    dolaSchedule(tasks.some(t => DOLA_ACTIVE.includes(t.status)));
  } catch (err) {
    box.innerHTML = `<div class="dola-error">Không tải được danh sách: ${escapeHtml(err.message)}</div>`;
  }
}

function dolaSchedule(active) {
  clearTimeout(dolaTimer);
  dolaTimer = null;
  if (!active) return;
  dolaTimer = setTimeout(() => {
    const pane = document.getElementById('pane-dola');
    if (pane && pane.style.display !== 'none') {
      dolaRefreshStatus();
      dolaLoadTasks();
    } else {
      dolaSchedule(true);
    }
  }, 5000);
}

async function dolaHumanizePrompt() {
  const el = document.getElementById('dola-prompt');
  if (!el || !el.value.trim()) {
    showToast('Vui lòng nhập prompt trước khi tối ưu', 'warning');
    return;
  }
  const btn = document.getElementById('btn-dola-humanize');
  if (btn) btn.disabled = true;
  try {
    const res = await dolaJson('/api/dola/humanize-prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: el.value.trim() }),
    });
    if (res && res.humanized) {
      el.value = res.humanized;
      showToast('Đã dọn prompt: bỏ chữ độn chất lượng & thêm câu dẫn cinematic');
    }
  } catch (err) {
    showToast('Lỗi tối ưu prompt: ' + err.message, 'danger');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function dolaSubmit(event) {
  event.preventDefault();
  const btn = document.getElementById('dola-submit');
  const count = Number(document.getElementById('dola-count').value || 1);
  const body = {
    prompt: document.getElementById('dola-prompt').value.trim(),
    model: document.getElementById('dola-model').value,
    duration: Number(document.getElementById('dola-duration').value),
    ratio: document.getElementById('dola-ratio').value,
    reference_images: document.getElementById('dola-refs').value.split('\n').map(s => s.trim()).filter(Boolean),
    count,
  };
  if (!body.prompt) return;
  if (count > 1 && !confirm(`Sinh ${count} video sẽ tốn ${count} lần credit. Tiếp tục?`)) return;
  btn.disabled = true;
  try {
    const data = await dolaJson('/api/dola/tasks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    showToast(`Đã gửi ${data.ids.length} yêu cầu sinh video`);
    await dolaLoadTasks();
  } catch (err) {
    showToast('Không tạo được: ' + err.message);
  } finally {
    btn.disabled = false;
  }
}

async function dolaAction(id, action) {
  if (action === 'retry' && !confirm('Tạo lại sẽ gửi task MỚI và tốn credit thêm lần nữa. Tiếp tục?')) return;
  try {
    await dolaJson(`/api/dola/tasks/${id}/${action}`, { method: 'POST' });
    await dolaLoadTasks();
  } catch (err) {
    showToast(err.message);
  }
}

async function dolaDelete(id) {
  if (!confirm(`Xoá video #${id} và file MP4 của nó?`)) return;
  try {
    await dolaJson(`/api/dola/tasks/${id}`, { method: 'DELETE' });
    await dolaLoadTasks();
  } catch (err) {
    showToast(err.message);
  }
}

// Mở tab Lịch Đăng TikTok với video này đã chọn; kênh vẫn phải tự chọn.
async function dolaPostToTiktok(id) {
  switchTab('upload');
  if (typeof loadLibraryVideos === 'function') await loadLibraryVideos();
  if (typeof selectLibVideo === 'function') selectLibVideo(`dola:${id}`);
  const card = document.querySelector(`.video-lib-card[data-vid="dola:${id}"]`);
  if (card) card.scrollIntoView({ block: 'center', behavior: 'smooth' });
  showToast('Đã chọn video Dola — chọn kênh rồi lên lịch đăng');
}

// Nút mở trang quản trị của từng gateway (chính dashboard của gateway, qua /api/dola/gw/<id>/).
async function dolaLoadGateways() {
  const box = document.getElementById('dola-gw-links');
  if (!box) return;
  try {
    const data = await dolaJson('/api/dola/gateways');
    const gws = data.gateways || [];
    box.innerHTML = gws.map(g => `<a class="btn btn-secondary btn-sm" href="${escapeHtml(g.url)}" target="_blank" rel="noopener"
      title="${escapeHtml(g.base_url)}${g.has_admin_key ? '' : ' — chưa có khoá admin ở server, trang sẽ hỏi mật khẩu'}">Quản trị gateway${gws.length > 1 ? ' ' + escapeHtml(g.id) : ''} ↗</a>`).join('');
  } catch (err) {
    box.innerHTML = '';
  }
}
