/* TokMatrix Admin — lõi: API client, router theo URL, khung trang, các thành phần giao diện dùng chung.
 *
 * Mỗi trang là một file trong js/pages/ gọi App.page({...}). Router đọc location.hash (#/trang/phần-con?x=1),
 * nên reload hay Back/Forward luôn mở đúng trang. Hẹn giờ/poll tạo qua ctx.every() tự dừng khi rời trang.
 */
(function () {
  'use strict';

  // ------------------------------------------------------------------ tiện ích
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function h(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.childElementCount === 1 ? t.content.firstElementChild : t.content;
  }

  const toDate = (v) => {
    if (v == null || v === '' || v === 0) return null;
    if (typeof v === 'number') return new Date(v < 1e12 ? v * 1000 : v);
    const d = new Date(v);
    return isNaN(d) ? null : d;
  };
  const fmt = {
    num: (n) => (Number(n) || 0).toLocaleString('vi-VN'),
    money: (n, cur = '') => `${(Number(n) || 0).toLocaleString('vi-VN', { maximumFractionDigits: 2 })}${cur ? ' ' + cur : ''}`,
    time(v) {
      const d = toDate(v);
      return d ? d.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '—';
    },
    date(v) { const d = toDate(v); return d ? d.toLocaleDateString('vi-VN') : '—'; },
    ago(v) {
      const d = toDate(v);
      if (!d) return '—';
      const s = Math.round((Date.now() - d.getTime()) / 1000);
      const a = Math.abs(s), sign = s < 0 ? 'nữa' : 'trước';
      if (a < 60) return s < 0 ? 'sắp tới' : 'vừa xong';
      if (a < 3600) return `${Math.round(a / 60)} phút ${sign}`;
      if (a < 86400) return `${Math.round(a / 3600)} giờ ${sign}`;
      return `${Math.round(a / 86400)} ngày ${sign}`;
    },
    dur(sec) {
      sec = Math.round(Number(sec) || 0);
      if (sec < 60) return `${sec}s`;
      if (sec < 3600) return `${Math.floor(sec / 60)}m${String(sec % 60).padStart(2, '0')}s`;
      return `${Math.floor(sec / 3600)}h${String(Math.floor(sec % 3600 / 60)).padStart(2, '0')}m`;
    },
    bytes(n) {
      n = Number(n) || 0;
      const u = ['B', 'KB', 'MB', 'GB', 'TB'];
      let i = 0;
      while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
      return `${n.toFixed(i ? 1 : 0)} ${u[i]}`;
    },
    short: (s, n = 60) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; },
  };

  // ------------------------------------------------------------------ API
  class ApiError extends Error {
    constructor(status, message, data) { super(message); this.status = status; this.data = data; }
  }

  async function request(method, path, body, opts = {}) {
    const init = { method, headers: { Accept: 'application/json' }, credentials: 'same-origin', signal: opts.signal };
    if (body instanceof FormData) init.body = body;
    else if (body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
    let res;
    try { res = await fetch(path, init); }
    catch (e) { if (e.name === 'AbortError') throw e; throw new ApiError(0, 'Không kết nối được máy chủ'); }
    if (res.status === 401) {
      location.href = '/login?next=' + encodeURIComponent(location.pathname + location.hash);
      throw new ApiError(401, 'Phiên đăng nhập đã hết');
    }
    const text = await res.text();
    let data = text;
    try { data = text ? JSON.parse(text) : {}; } catch (_) { /* không phải JSON */ }
    if (!res.ok || (data && data.success === false && opts.strict !== false)) {
      const d = data && typeof data === 'object' ? (data.detail ?? data.message ?? data.error) : text;
      const msg = typeof d === 'string' ? d : Array.isArray(d) ? d.map((x) => x.msg || JSON.stringify(x)).join('; ') : (d && d.message) || `Lỗi HTTP ${res.status}`;
      throw new ApiError(res.status, msg || `Lỗi HTTP ${res.status}`, data);
    }
    return data;
  }
  const qs = (params) => {
    const p = Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== null && v !== '');
    return p.length ? '?' + new URLSearchParams(p).toString() : '';
  };
  const api = {
    get: (p, params, o) => request('GET', p + qs(params), undefined, o),
    post: (p, b, o) => request('POST', p, b === undefined ? {} : b, o),
    put: (p, b, o) => request('PUT', p, b === undefined ? {} : b, o),
    patch: (p, b, o) => request('PATCH', p, b === undefined ? {} : b, o),
    del: (p, b, o) => request('DELETE', p, b, o),
    ApiError,
  };

  // ------------------------------------------------------------------ thông báo, hộp thoại
  function toast(message, type = 'info', ms = 4000) {
    const icon = { success: 'check-circle-fill', danger: 'x-octagon-fill', warning: 'exclamation-triangle-fill', info: 'info-circle-fill' }[type] || 'info-circle-fill';
    const el = h(`<div class="toast align-items-center text-bg-${type === 'info' ? 'primary' : type} border-0" role="status" aria-live="polite">
      <div class="d-flex"><div class="toast-body"><i class="bi bi-${icon} me-2"></i>${esc(message)}</div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Đóng"></button></div></div>`);
    $('#toasts').append(el);
    const t = new bootstrap.Toast(el, { delay: ms });
    el.addEventListener('hidden.bs.toast', () => el.remove());
    t.show();
  }
  const notifyError = (e) => { if (e && e.name !== 'AbortError') toast(e.message || String(e), 'danger', 6000); };

  /** Hộp thoại chung. body: chuỗi HTML hoặc Node. buttons: [{label, cls, value, onClick}] — onClick trả false để giữ mở. */
  function modal({ title, body, size = '', buttons = [{ label: 'Đóng', cls: 'btn-secondary', value: null }], onShow } = {}) {
    return new Promise((resolve) => {
      const el = h(`<div class="modal fade" tabindex="-1"><div class="modal-dialog modal-dialog-scrollable ${size ? 'modal-' + size : ''}">
        <div class="modal-content"><div class="modal-header"><h5 class="modal-title">${esc(title)}</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Đóng"></button></div>
        <div class="modal-body"></div><div class="modal-footer"></div></div></div></div>`);
      const bodyEl = $('.modal-body', el);
      if (body instanceof Node) bodyEl.append(body); else bodyEl.innerHTML = body || '';
      let result = null;
      const m = new bootstrap.Modal(el);
      for (const b of buttons) {
        const btn = h(`<button type="button" class="btn ${b.cls || 'btn-primary'}">${b.label}</button>`);
        btn.addEventListener('click', async () => {
          if (b.onClick) {
            btn.disabled = true;
            try { const r = await b.onClick(bodyEl); if (r === false) return; result = r === undefined ? b.value : r; }
            catch (e) { notifyError(e); return; }
            finally { btn.disabled = false; }
          } else result = b.value;
          m.hide();
        });
        $('.modal-footer', el).append(btn);
      }
      el.addEventListener('hidden.bs.modal', () => { el.remove(); resolve(result); });
      document.body.append(el);
      m.show();
      if (onShow) onShow(bodyEl);
    });
  }
  const confirmBox = (message, { title = 'Xác nhận', ok = 'Đồng ý', danger = false } = {}) => modal({
    title, body: `<p class="mb-0">${esc(message)}</p>`,
    buttons: [{ label: 'Huỷ', cls: 'btn-outline-secondary', value: false }, { label: ok, cls: danger ? 'btn-danger' : 'btn-primary', value: true }],
  }).then(Boolean);

  /** Form trong hộp thoại: fields [{name, label, type, value, options, help, required, rows, placeholder}] → object hoặc null. */
  function formModal({ title, fields, submit = 'Lưu', size = '', onSubmit }) {
    const form = h(`<form class="vstack gap-3"></form>`);
    for (const f of fields) form.append(field(f));
    form.addEventListener('submit', (e) => e.preventDefault());
    return modal({
      title, body: form, size,
      buttons: [{ label: 'Huỷ', cls: 'btn-outline-secondary', value: null }, {
        label: submit, cls: 'btn-primary', onClick: async () => {
          if (!form.reportValidity()) return false;
          const v = readForm(form, fields);
          if (onSubmit) { const r = await onSubmit(v); return r === undefined ? v : r; }
          return v;
        },
      }],
    });
  }

  function field(f) {
    const id = 'f_' + f.name + '_' + Math.random().toString(36).slice(2, 7);
    const req = f.required ? 'required' : '';
    const ph = f.placeholder ? `placeholder="${esc(f.placeholder)}"` : '';
    let input;
    if (f.type === 'select') {
      input = `<select class="form-select" id="${id}" name="${f.name}" ${req}>${(f.options || []).map((o) => {
        const [v, l] = Array.isArray(o) ? o : typeof o === 'object' ? [o.value, o.label] : [o, o];
        return `<option value="${esc(v)}" ${String(v) === String(f.value ?? '') ? 'selected' : ''}>${esc(l)}</option>`;
      }).join('')}</select>`;
    } else if (f.type === 'textarea') {
      input = `<textarea class="form-control" id="${id}" name="${f.name}" rows="${f.rows || 4}" ${req} ${ph}>${esc(f.value ?? '')}</textarea>`;
    } else if (f.type === 'checkbox') {
      return h(`<div class="form-check form-switch"><input class="form-check-input" type="checkbox" id="${id}" name="${f.name}" ${f.value ? 'checked' : ''}>
        <label class="form-check-label" for="${id}">${esc(f.label)}</label>${f.help ? `<div class="form-text">${esc(f.help)}</div>` : ''}</div>`);
    } else {
      input = `<input class="form-control" type="${f.type || 'text'}" id="${id}" name="${f.name}" value="${esc(f.value ?? '')}" ${req} ${ph}
        ${f.min != null ? `min="${f.min}"` : ''} ${f.max != null ? `max="${f.max}"` : ''} ${f.step != null ? `step="${f.step}"` : ''}>`;
    }
    return h(`<div><label class="form-label" for="${id}">${esc(f.label)}</label>${input}${f.help ? `<div class="form-text">${esc(f.help)}</div>` : ''}</div>`);
  }
  function readForm(form, fields) {
    const out = {};
    for (const f of fields) {
      const el = form.elements[f.name];
      if (!el) continue;
      if (f.type === 'checkbox') out[f.name] = el.checked;
      else if (f.type === 'number') out[f.name] = el.value === '' ? null : Number(el.value);
      else out[f.name] = el.value;
    }
    return out;
  }

  // ------------------------------------------------------------------ thành phần hiển thị
  const STATUS = {
    success: ['SUCCESS', 'DONE', 'COMPLETED', 'done', 'completed', 'success', 'ok', 'live', 'LIVE', 'PUBLISHED', 'READY_TO_PUBLISH', 'running', 'active', 'idle'],
    primary: ['UPLOADING', 'PROCESSING', 'processing', 'RUNNING', 'producing', 'shooting', 'rendering', 'DOWNLOADING', 'SUBMITTING', 'SCHEDULED', 'claimed'],
    warning: ['QUEUED', 'PENDING', 'pending', 'queued', 'WAITING_RENDER', 'planned', 'paused', 'NEEDS_CHECK', 'partial', 'TIMEOUT', 'waiting', 'stopping'],
    danger: ['FAILED', 'ERROR', 'error', 'failed', 'DEAD_LETTER', 'dead', 'blocked', 'disabled'],
    secondary: ['CANCELLED', 'cancelled', 'stopped', 'skipped', 'deleted', 'archived'],
  };
  const STATUS_LABEL = {
    SUCCESS: 'Thành công', DONE: 'Xong', COMPLETED: 'Xong', done: 'Xong', completed: 'Xong', QUEUED: 'Chờ', PENDING: 'Chờ', pending: 'Chờ',
    UPLOADING: 'Đang đăng', PROCESSING: 'Đang xử lý', processing: 'Đang xử lý', FAILED: 'Lỗi', ERROR: 'Lỗi', error: 'Lỗi', failed: 'Lỗi',
    WAITING_RENDER: 'Chờ render', NEEDS_CHECK: 'Cần kiểm tra', CANCELLED: 'Đã huỷ', SCHEDULED: 'Đã lên lịch', READY_TO_PUBLISH: 'Sẵn sàng đăng',
    running: 'Đang chạy', idle: 'Rảnh', paused: 'Tạm dừng', stopped: 'Đã dừng', disabled: 'Tắt', stopping: 'Đang dừng', planned: 'Đã lên kế hoạch',
    producing: 'Đang sản xuất', partial: 'Một phần', shooting: 'Đang quay', skipped: 'Bỏ qua', DEAD_LETTER: 'Hỏng hẳn',
  };
  function statusTone(s) {
    for (const [tone, list] of Object.entries(STATUS)) if (list.includes(s)) return tone;
    return 'secondary';
  }
  const badge = (s, label) => `<span class="badge text-bg-${statusTone(s)}">${esc(label ?? STATUS_LABEL[s] ?? s ?? '—')}</span>`;

  /** Ô số liệu kiểu AdminLTE small-box. */
  const statBox = ({ value, label, icon = 'bar-chart', tone = 'primary', href }) => `
    <div class="small-box text-bg-${tone}">
      <div class="inner"><h3>${esc(value)}</h3><p>${esc(label)}</p></div>
      <i class="small-box-icon bi bi-${icon}"></i>
      ${href ? `<a href="${href}" class="small-box-footer link-light link-underline-opacity-0">Xem chi tiết <i class="bi bi-arrow-right-circle"></i></a>` : ''}
    </div>`;

  const infoBox = ({ value, label, icon = 'info', tone = 'primary' }) => `
    <div class="info-box"><span class="info-box-icon text-bg-${tone} shadow-sm"><i class="bi bi-${icon}"></i></span>
    <div class="info-box-content"><span class="info-box-text">${esc(label)}</span><span class="info-box-number">${esc(value)}</span></div></div>`;

  /** Card AdminLTE. tools: HTML các nút ở góc phải. */
  function card({ title, icon, tools = '', body = '', footer = '', tone = '', cls = '', bodyCls = '' }) {
    return h(`<div class="card ${tone ? 'card-outline card-' + tone : ''} ${cls} mb-4">
      ${title ? `<div class="card-header"><h3 class="card-title">${icon ? `<i class="bi bi-${icon} me-2"></i>` : ''}${esc(title)}</h3><div class="card-tools">${tools}</div></div>` : ''}
      <div class="card-body ${bodyCls}">${typeof body === 'string' ? body : ''}</div>
      ${footer ? `<div class="card-footer">${footer}</div>` : ''}</div>`);
  }

  const empty = (text = 'Chưa có dữ liệu', icon = 'inbox') =>
    `<div class="text-center text-body-secondary py-5"><i class="bi bi-${icon} fs-1 d-block mb-2 opacity-50"></i>${esc(text)}</div>`;
  const spinner = (text = 'Đang tải…') =>
    `<div class="text-center text-body-secondary py-5"><div class="spinner-border spinner-border-sm me-2"></div>${esc(text)}</div>`;

  /**
   * Bảng dữ liệu có ô tìm kiếm, sắp xếp, phân trang phía client.
   * columns: [{key, label, render(row) → HTML, sort(row) → giá trị, cls, width}]
   */
  function dataTable(container, { columns, rows = [], pageSize = 25, search = true, empty: emptyText = 'Không có dòng nào', rowKey, toolbar = '', onRender }) {
    const state = { q: '', sortKey: null, dir: 1, page: 0, rows };
    container.innerHTML = `
      <div class="d-flex flex-wrap gap-2 align-items-center mb-2">
        ${search ? `<div class="input-group input-group-sm" style="max-width:280px"><span class="input-group-text"><i class="bi bi-search"></i></span>
          <input type="search" class="form-control" placeholder="Tìm…" data-dt-q></div>` : ''}
        <div class="ms-auto d-flex flex-wrap gap-2 align-items-center" data-dt-toolbar>${toolbar}</div>
      </div>
      <div class="table-responsive"><table class="table table-sm table-hover align-middle mb-0">
        <thead><tr>${columns.map((c) => `<th class="${c.cls || ''} ${c.sort !== false ? 'dt-sortable' : ''}" style="${c.width ? 'width:' + c.width : ''}" data-key="${c.key}">${esc(c.label)}</th>`).join('')}</tr></thead>
        <tbody></tbody></table></div>
      <div class="d-flex justify-content-between align-items-center mt-2 small text-body-secondary" data-dt-foot></div>`;
    const tbody = $('tbody', container), foot = $('[data-dt-foot]', container);
    const val = (c, r) => (c.sort ? c.sort(r) : r[c.key]);
    function view() {
      let list = state.rows;
      if (state.q) {
        const q = state.q.toLowerCase();
        list = list.filter((r) => columns.some((c) => String(c.text ? c.text(r) : val(c, r) ?? '').toLowerCase().includes(q)));
      }
      if (state.sortKey) {
        const c = columns.find((x) => x.key === state.sortKey);
        list = [...list].sort((a, b) => {
          const x = val(c, a), y = val(c, b);
          return (x == null) - (y == null) || (x > y ? 1 : x < y ? -1 : 0) * state.dir;
        });
      }
      return list;
    }
    function render() {
      const list = view();
      const pages = Math.max(1, Math.ceil(list.length / pageSize));
      state.page = Math.min(state.page, pages - 1);
      const slice = list.slice(state.page * pageSize, (state.page + 1) * pageSize);
      tbody.innerHTML = slice.length ? slice.map((r) => `<tr ${rowKey ? `data-key="${esc(r[rowKey])}"` : ''}>${columns.map((c) =>
        `<td class="${c.cls || ''}">${c.render ? c.render(r) : esc(r[c.key] ?? '')}</td>`).join('')}</tr>`).join('')
        : `<tr><td colspan="${columns.length}">${empty(emptyText)}</td></tr>`;
      foot.innerHTML = `<span>${fmt.num(list.length)} dòng${list.length !== state.rows.length ? ` (lọc từ ${fmt.num(state.rows.length)})` : ''}</span>
        ${pages > 1 ? `<div class="btn-group btn-group-sm"><button class="btn btn-outline-secondary" data-p="-1" ${state.page ? '' : 'disabled'}><i class="bi bi-chevron-left"></i></button>
        <span class="btn btn-outline-secondary disabled">${state.page + 1}/${pages}</span>
        <button class="btn btn-outline-secondary" data-p="1" ${state.page < pages - 1 ? '' : 'disabled'}><i class="bi bi-chevron-right"></i></button></div>` : ''}`;
      $$('th[data-key]', container).forEach((th) => {
        th.classList.toggle('dt-asc', th.dataset.key === state.sortKey && state.dir === 1);
        th.classList.toggle('dt-desc', th.dataset.key === state.sortKey && state.dir === -1);
      });
      if (onRender) onRender(tbody);
    }
    const q = $('[data-dt-q]', container);
    if (q) q.addEventListener('input', () => { state.q = q.value.trim(); state.page = 0; render(); });
    $$('th.dt-sortable', container).forEach((th) => th.addEventListener('click', () => {
      state.dir = state.sortKey === th.dataset.key ? -state.dir : 1;
      state.sortKey = th.dataset.key;
      render();
    }));
    foot.addEventListener('click', (e) => { const b = e.target.closest('[data-p]'); if (b) { state.page += Number(b.dataset.p); render(); } });
    render();
    return {
      setRows(r) { state.rows = r || []; render(); },
      get rows() { return state.rows; },
      toolbar: $('[data-dt-toolbar]', container),
      refresh: render,
    };
  }

  /** Gắn xử lý click theo data-action trong một vùng: actions = {ten: async (el, ev) => {}} */
  function bindActions(root, actions) {
    root.addEventListener('click', async (ev) => {
      const el = ev.target.closest('[data-action]');
      if (!el || !root.contains(el)) return;
      const fn = actions[el.dataset.action];
      if (!fn) return;
      ev.preventDefault();
      if (el.disabled) return;
      const busy = el.tagName === 'BUTTON';
      if (busy) el.disabled = true;
      try { await fn(el, ev); } catch (e) { notifyError(e); } finally { if (busy && el.isConnected) el.disabled = false; }
    });
  }

  /** Nhóm tab trong trang; chọn tab ghi vào URL (#/trang/tab) để reload giữ đúng tab. */
  function tabs(container, ctx, items) {
    const current = items.some((i) => i.id === ctx.sub) ? ctx.sub : items[0].id;
    container.innerHTML = `<ul class="nav nav-tabs mb-3">${items.map((i) =>
      `<li class="nav-item"><a class="nav-link ${i.id === current ? 'active' : ''}" href="#/${ctx.id}/${i.id}">${i.icon ? `<i class="bi bi-${i.icon} me-1"></i>` : ''}${esc(i.label)}</a></li>`).join('')}</ul><div data-tab-body></div>`;
    const item = items.find((i) => i.id === current);
    return item.render($('[data-tab-body]', container));
  }

  // ------------------------------------------------------------------ router + trang
  const GROUPS = [];
  const PAGES = new Map();
  let active = null;

  /** Đăng ký nhóm menu theo thứ tự hiển thị. */
  function group(id, label) { GROUPS.push({ id, label }); }

  /** Đăng ký trang: {id, group, title, icon, desc, render(ctx), badge() → Promise<text|null>} */
  function page(def) { PAGES.set(def.id, def); }

  function parseHash() {
    const raw = location.hash.replace(/^#\/?/, '');
    const [path, query = ''] = raw.split('?');
    const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
    return { id: parts[0] || 'dashboard', sub: parts[1] || '', rest: parts.slice(2), params: Object.fromEntries(new URLSearchParams(query)) };
  }

  function buildMenu() {
    const ul = $('#side-menu');
    ul.innerHTML = GROUPS.map((g) => {
      const items = [...PAGES.values()].filter((p) => p.group === g.id && !p.hidden);
      if (!items.length) return '';
      return `<li class="nav-header">${esc(g.label)}</li>` + items.map((p) => `
        <li class="nav-item"><a href="#/${p.id}" class="nav-link" data-page="${p.id}">
          <i class="nav-icon bi bi-${p.icon || 'circle'}"></i><p>${esc(p.title)}<span class="nav-badge badge text-bg-secondary float-end d-none" data-badge="${p.id}"></span></p></a></li>`).join('');
    }).join('');
  }

  async function refreshBadges() {
    for (const p of PAGES.values()) {
      if (!p.badge) continue;
      const el = $(`[data-badge="${p.id}"]`);
      if (!el) continue;
      try {
        const b = await p.badge();
        const v = b && typeof b === 'object' ? b : { text: b };
        el.classList.toggle('d-none', v.text == null || v.text === '' || v.text === 0);
        el.textContent = v.text ?? '';
        el.className = `nav-badge badge float-end text-bg-${v.tone || 'secondary'}` + (v.text == null || v.text === '' || v.text === 0 ? ' d-none' : '');
      } catch (_) { /* huy hiệu không quan trọng */ }
    }
  }

  async function route() {
    const r = parseHash();
    const def = PAGES.get(r.id) || PAGES.get('dashboard');
    if (active) active.leave();
    const timers = [], leaves = [], ctrl = new AbortController();
    let alive = true;
    const ctx = {
      id: def.id, sub: r.sub, rest: r.rest, params: r.params, el: $('#page'), signal: ctrl.signal,
      /** Lặp fn mỗi ms khi tab đang hiển thị; tự dừng khi rời trang. */
      every(ms, fn) {
        const t = setInterval(() => { if (!document.hidden && alive) Promise.resolve(fn()).catch(() => {}); }, ms);
        timers.push(t);
        return t;
      },
      onLeave(fn) { leaves.push(fn); },
      get alive() { return alive; },
      /** Đổi tham số URL mà không render lại trang (giữ bộ lọc khi reload). */
      setParams(p) {
        const next = { ...r.params, ...p };
        Object.keys(next).forEach((k) => (next[k] === '' || next[k] == null) && delete next[k]);
        const q = new URLSearchParams(next).toString();
        history.replaceState(null, '', `#/${def.id}${r.sub ? '/' + r.sub : ''}${q ? '?' + q : ''}`);
        Object.assign(r.params, p);
      },
    };
    active = { ctx, leave() { alive = false; ctrl.abort(); timers.forEach(clearInterval); leaves.forEach((f) => { try { f(); } catch (_) {} }); } };

    const g = GROUPS.find((x) => x.id === def.group);
    $('#page-title').textContent = def.title;
    $('#page-desc').textContent = def.desc || '';
    $('#hdr-title').textContent = def.title;
    document.title = `${def.title} · TokMatrix`;
    $('#page-crumbs').innerHTML = `<li class="breadcrumb-item"><a href="#/dashboard">Trang chủ</a></li>
      ${g ? `<li class="breadcrumb-item">${esc(g.label)}</li>` : ''}<li class="breadcrumb-item active" aria-current="page">${esc(def.title)}</li>`;
    $$('#side-menu .nav-link').forEach((a) => a.classList.toggle('active', a.dataset.page === def.id));
    document.body.classList.remove('sidebar-open');

    ctx.el.innerHTML = spinner();
    try { await def.render(ctx); }
    catch (e) {
      if (e.name === 'AbortError') return;
      ctx.el.innerHTML = `<div class="alert alert-danger"><i class="bi bi-exclamation-octagon me-2"></i>Không tải được trang: ${esc(e.message)}</div>`;
    }
  }

  // ------------------------------------------------------------------ khởi động
  function initTheme() {
    const saved = (() => { try { return localStorage.getItem('tm-theme'); } catch (_) { return null; } })();
    const apply = (t) => {
      document.documentElement.setAttribute('data-bs-theme', t);
      $('#theme-toggle i').className = t === 'dark' ? 'bi bi-sun' : 'bi bi-moon-stars';
    };
    apply(saved || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
    $('#theme-toggle').addEventListener('click', (e) => {
      e.preventDefault();
      const t = document.documentElement.getAttribute('data-bs-theme') === 'dark' ? 'light' : 'dark';
      apply(t);
      try { localStorage.setItem('tm-theme', t); } catch (_) {}
    });
  }

  function start() {
    initTheme();
    buildMenu();
    window.addEventListener('hashchange', route);
    if (!location.hash) history.replaceState(null, '', '#/dashboard');
    route();
    refreshBadges();
    setInterval(() => { if (!document.hidden) refreshBadges(); }, 30000);
    const clock = () => { $('#hdr-clock').textContent = new Date().toLocaleString('vi-VN', { weekday: 'short', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }); };
    clock(); setInterval(clock, 30000);
    api.get('/api/auth/me').then((me) => { if (me && me.username) $('#hdr-user span').textContent = me.username; }).catch(() => {});
    $('#btn-logout').addEventListener('click', async (e) => {
      e.preventDefault();
      try { await api.post('/api/auth/logout'); } catch (_) {}
      location.href = '/login';
    });
  }

  window.App = {
    api, esc, $, $$, h, fmt, toast, notifyError, modal, confirm: confirmBox, formModal, field, readForm,
    badge, statusTone, STATUS_LABEL, statBox, infoBox, card, empty, spinner, dataTable, bindActions, tabs,
    group, page, start, refreshBadges, go: (hash) => { location.hash = hash; },
  };
})();
