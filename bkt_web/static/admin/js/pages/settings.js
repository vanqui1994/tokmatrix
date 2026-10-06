/* Hệ thống: kho khoá API, cài đặt chung, cài đặt profile/đăng bài, nhật ký truy cập. */
(function () {
  const { api, esc, fmt, toast, card, dataTable, bindActions, formModal, confirm, badge, tabs } = App;

  async function keys(el) {
    const r = await api.get('/api/keys');
    const groups = [...new Set(r.keys.map((k) => k.group))];
    el.innerHTML = '';
    for (const g of groups) {
      const box = card({ title: g, icon: 'key', bodyCls: 'p-0', body: `<table class="table table-sm align-middle mb-0"><tbody>${r.keys.filter((k) => k.group === g).map((k) => `
        <tr><td style="width:40%"><b>${esc(k.label)}</b><span class="cell-sub mono">${esc(k.name)}</span></td>
        <td class="small text-body-secondary">${esc(k.used_by)}</td>
        <td>${k.configured ? `${badge('ok', 'Đã có')}<span class="cell-sub">${fmt.ago(k.updated_at)}</span>` : badge('pending', 'Chưa có')}</td>
        <td class="text-end text-nowrap"><div class="btn-group btn-group-sm">
          <button class="btn btn-outline-primary" data-action="set" data-name="${esc(k.name)}" data-label="${esc(k.label)}" data-hint="${esc(k.hint)}">${k.configured ? 'Thay' : 'Nhập'}</button>
          ${k.configured ? `<button class="btn btn-outline-secondary" data-action="test" data-name="${esc(k.name)}">Kiểm tra</button>
          <button class="btn btn-outline-danger" data-action="del" data-name="${esc(k.name)}"><i class="bi bi-trash"></i></button>` : ''}</div></td></tr>`).join('')}</tbody></table>` });
      el.append(box);
    }
    bindActions(el, {
      async set(b) {
        const v = await formModal({ title: `Khoá ${b.dataset.label}`, fields: [{ name: 'value', label: 'Giá trị (không hiển thị lại sau khi lưu)', type: 'password', required: true, placeholder: b.dataset.hint }] });
        if (!v) return;
        await api.put(`/api/keys/${encodeURIComponent(b.dataset.name)}`, v); toast('Đã lưu khoá', 'success'); keys(el);
      },
      async test(b) { const r = await api.post(`/api/keys/${encodeURIComponent(b.dataset.name)}/test`, undefined, { strict: false }); toast(r.message, r.valid ? 'success' : 'danger', 6000); },
      async del(b) { if (await confirm(`Xoá khoá ${b.dataset.name}?`, { danger: true, ok: 'Xoá' })) { await api.del(`/api/keys/${encodeURIComponent(b.dataset.name)}`); keys(el); } },
    });
  }

  async function general(el) {
    const [s, p] = await Promise.all([api.get('/api/settings'), api.get('/api/channels/profile-settings')]);
    el.innerHTML = '<div class="row"><div class="col-lg-6" data-a></div><div class="col-lg-6" data-b></div></div>';
    const a = card({ title: 'Chung', icon: 'gear', body: `<form class="vstack gap-3">
      <div><label class="form-label">Dịch vụ giải captcha</label><select class="form-select" name="prefer_api_captcha">${['achi'].map((x) => `<option ${x === s.prefer_api_captcha ? 'selected' : ''}>${x}</option>`).join('')}</select>
        <div class="form-text">Khoá captcha: ${s.api_captcha_configured ? 'đã có' : 'chưa có'} (nhập ở tab Kho khoá API).</div></div>
      <div class="form-check form-switch"><input class="form-check-input" type="checkbox" id="gpu" name="default_render_gpu" ${s.default_render_gpu === 'true' ? 'checked' : ''}><label class="form-check-label" for="gpu">Render bằng GPU khi có</label></div>
      <div><label class="form-label">Danh sách proxy</label><textarea class="form-control mono" name="proxy_list" rows="4">${esc(s.proxy_list)}</textarea></div>
      <dl class="row kv small mb-0"><dt class="col-4">Thư mục tải</dt><dd class="col-8 mono">${esc(s.download_folder)}</dd><dt class="col-4">Thư mục render</dt><dd class="col-8 mono">${esc(s.render_folder)}</dd></dl>
      </form>`, footer: '<button class="btn btn-primary" data-action="save-general"><i class="bi bi-save me-1"></i>Lưu</button>' });
    el.querySelector('[data-a]').append(a);
    const sw = (k, label, help) => `<div class="form-check form-switch"><input class="form-check-input" type="checkbox" id="${k}" name="${k}" ${p[k] === 'true' ? 'checked' : ''}><label class="form-check-label" for="${k}">${label}</label>${help ? `<div class="form-text">${help}</div>` : ''}</div>`;
    const b = card({ title: 'Đăng bài & profile Chrome', icon: 'browser-chrome', body: `<form class="vstack gap-3">
      ${sw('needs_check_verifier_enabled', 'Tự kiểm tra task "Cần kiểm tra"', 'Xem video đã thật sự lên kênh chưa sau khi bấm Đăng.')}
      ${sw('needs_check_auto_confirm', 'Tự xác nhận khi thấy video trên kênh', 'Tắt = chỉ ghi chú, bạn tự xác nhận.')}
      ${sw('profile_cache_clean_enabled', 'Tự dọn cache profile Chrome')}
      <div><label class="form-label">Kênh đăng bằng profile cố định</label><input class="form-control" name="publish_profile_channels" value="${esc(p.publish_profile_channels)}" placeholder="id kênh, cách nhau dấu phẩy"></div>
      </form>`, footer: '<button class="btn btn-primary" data-action="save-profile"><i class="bi bi-save me-1"></i>Lưu</button>' });
    el.querySelector('[data-b]').append(b);
    bindActions(el, {
      async 'save-general'() {
        const f = a.querySelector('form');
        await api.post('/api/settings', { prefer_api_captcha: f.prefer_api_captcha.value, default_render_gpu: String(f.default_render_gpu.checked), proxy_list: f.proxy_list.value });
        toast('Đã lưu', 'success');
      },
      async 'save-profile'() {
        const f = b.querySelector('form');
        const body = Object.fromEntries(Object.keys(p).map((k) => [k, f[k].type === 'checkbox' ? String(f[k].checked) : f[k].value]));
        await api.put('/api/channels/profile-settings', body); toast('Đã lưu', 'success');
      },
    });
  }

  async function audit(el) {
    const r = await api.get('/api/audit-events', { limit: 500 });
    dataTable(el, { rows: r.events, pageSize: 50, columns: [
      { key: 'created_at', label: 'Thời điểm', render: (x) => fmt.time(x.created_at) },
      { key: 'method', label: 'Lệnh', render: (x) => `<span class="badge text-bg-secondary">${esc(x.method)}</span>` },
      { key: 'path', label: 'Đường dẫn', render: (x) => `<span class="mono small">${esc(x.path)}</span>` },
      { key: 'status_code', label: 'Kết quả', render: (x) => `<span class="badge text-bg-${x.status_code < 300 ? 'success' : x.status_code < 500 ? 'warning' : 'danger'}">${x.status_code}</span>` },
    ] });
  }

  App.page({
    id: 'settings', group: 'system', title: 'Cài đặt', icon: 'gear',
    desc: 'Khoá API, cài đặt chung và nhật ký truy cập',
    render(ctx) {
      return tabs(ctx.el, ctx, [
        { id: 'keys', label: 'Kho khoá API', icon: 'key', render: keys },
        { id: 'general', label: 'Cài đặt', icon: 'sliders', render: general },
        { id: 'audit', label: 'Nhật ký truy cập', icon: 'shield-check', render: audit },
      ]);
    },
  });
})();
