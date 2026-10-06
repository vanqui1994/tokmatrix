/* Video AI Dola (Seedance): tạo clip từ prompt, theo dõi task, tài khoản/gateway. */
(function () {
  const { api, esc, fmt, toast, card, dataTable, bindActions, modal, confirm, badge, infoBox, tabs } = App;

  async function create(st, reload) {
    const form = App.h(`<form class="vstack gap-3">
      <div><label class="form-label">Prompt</label><textarea class="form-control" name="prompt" rows="5" maxlength="4000" required></textarea>
        <div class="form-check form-switch mt-2"><input class="form-check-input" type="checkbox" name="humanize" id="d-hu"><label class="form-check-label" for="d-hu">Làm gọn prompt (bỏ từ thừa như 8k, masterpiece)</label></div></div>
      <div class="row g-2">
        <div class="col-sm-3"><label class="form-label">Model</label><select class="form-select" name="model">${st.models.map((m) => `<option ${m === st.default_model ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
        <div class="col-sm-3"><label class="form-label">Thời lượng</label><select class="form-select" name="duration">${st.durations.map((d) => `<option value="${d}">${d} giây</option>`).join('')}</select></div>
        <div class="col-sm-3"><label class="form-label">Khung hình</label><select class="form-select" name="ratio">${st.ratios.map((r) => `<option ${r === '9:16' ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
        <div class="col-sm-3"><label class="form-label">Số clip</label><input class="form-control" type="number" name="count" value="1" min="1" max="${st.max_batch}"></div>
      </div>
      <div><label class="form-label">Ảnh tham chiếu (URL công khai, mỗi dòng một ảnh, tối đa ${st.max_reference_images})</label><textarea class="form-control" name="refs" rows="2"></textarea></div>
    </form>`);
    const ok = await modal({ title: 'Tạo video Dola', body: form, size: 'lg', buttons: [
      { label: 'Huỷ', cls: 'btn-outline-secondary', value: false },
      { label: 'Xem prompt đã làm gọn', cls: 'btn-outline-primary', onClick: async () => {
        if (!form.prompt.value.trim()) return false;
        const r = await api.post('/api/dola/humanize-prompt', { prompt: form.prompt.value });
        form.prompt.value = r.humanized; form.humanize.checked = false;
        return false;
      } },
      { label: 'Tạo', cls: 'btn-primary', onClick: async () => {
        if (!form.reportValidity()) return false;
        const r = await api.post('/api/dola/tasks', {
          prompt: form.prompt.value, model: form.model.value, duration: Number(form.duration.value), ratio: form.ratio.value,
          count: Number(form.count.value), humanize: form.humanize.checked,
          reference_images: form.refs.value.split('\n').map((x) => x.trim()).filter(Boolean),
        });
        toast(`Đã tạo ${r.ids.length} task`, 'success');
        return true;
      } }] });
    if (ok) reload();
  }

  async function tasksTab(el, ctx) {
    const st = await api.get('/api/dola/status');
    const c = st.counts || {};
    el.innerHTML = `<div class="row">
      <div class="col-md-3 col-6">${infoBox({ label: 'Gateway', value: st.gateway.online ? 'Online' : 'Offline', icon: 'hdd-network', tone: st.gateway.online ? 'success' : 'danger' })}</div>
      <div class="col-md-3 col-6">${infoBox({ label: 'Đang xử lý', value: fmt.num((c.SUBMITTING || 0) + (c.QUEUED || 0) + (c.PROCESSING || 0) + (c.DOWNLOADING || 0)), icon: 'hourglass-split', tone: 'warning' })}</div>
      <div class="col-md-3 col-6">${infoBox({ label: 'Hoàn thành', value: fmt.num(c.COMPLETED || 0), icon: 'check2-circle', tone: 'success' })}</div>
      <div class="col-md-3 col-6">${infoBox({ label: 'Lượt còn hôm nay', value: fmt.num(st.accounts.reduce((a, x) => a + (x.remaining || 0), 0)), icon: 'speedometer', tone: 'info' })}</div></div>
      ${st.config_error ? `<div class="alert alert-danger">${esc(st.config_error)}</div>` : ''}`;
    const box = card({ title: 'Task video', icon: 'film', tools: `<button class="btn btn-sm btn-primary" data-action="new"><i class="bi bi-plus-lg me-1"></i>Tạo video</button>` });
    el.append(box);
    const t = dataTable(box.querySelector('.card-body'), { pageSize: 25, columns: [
      { key: 'id', label: '#' },
      { key: 'prompt', label: 'Prompt', render: (x) => `<span class="text-truncate-2" style="max-width:420px">${esc(x.prompt)}</span><span class="cell-sub">${esc(x.model)} · ${x.duration}s · ${esc(x.ratio)}${x.account_id ? ' · ' + esc(x.account_id) : ''}</span>` },
      { key: 'status', label: 'Trạng thái', render: (x) => `${badge(x.status)}${x.remote_status ? `<span class="cell-sub">${esc(x.remote_status)}</span>` : ''}${x.error ? `<span class="cell-sub text-danger" title="${esc(x.error)}">${esc(fmt.short(x.error, 80))}</span>` : ''}` },
      { key: 'created_at', label: 'Tạo lúc', render: (x) => fmt.time(x.created_at) },
      { key: 'file_mb', label: '', cls: 'text-end', sort: false, render: (x) => `<div class="btn-group btn-group-sm">
        ${x.file_url ? `<button class="btn btn-outline-primary" data-action="play" data-url="${esc(x.file_url)}"><i class="bi bi-play-fill"></i> ${x.file_mb} MB</button>` : ''}
        ${['TIMEOUT', 'FAILED'].includes(x.status) ? `<button class="btn btn-outline-secondary" data-action="recheck" data-id="${x.id}" title="Kiểm tra lại (không tốn lượt)"><i class="bi bi-search"></i></button>` : ''}
        ${['FAILED', 'TIMEOUT', 'CANCELLED'].includes(x.status) ? `<button class="btn btn-outline-warning" data-action="retry" data-id="${x.id}" title="Tạo lại (tốn lượt)"><i class="bi bi-arrow-clockwise"></i></button>` : ''}
        <button class="btn btn-outline-danger" data-action="del" data-id="${x.id}"><i class="bi bi-trash"></i></button></div>` },
    ] });
    const load = async () => t.setRows((await api.get('/api/dola/tasks', { limit: 300 })).tasks);
    bindActions(el, {
      new: () => create(st, load),
      play: (b) => modal({ title: 'Video', body: `<video src="${esc(b.dataset.url)}" controls autoplay class="w-100 rounded" style="max-height:75vh"></video>` }),
      async recheck(b) { await api.post(`/api/dola/tasks/${b.dataset.id}/recheck`); toast('Đang kiểm tra lại', 'success'); load(); },
      async retry(b) { if (await confirm('Tạo lại sẽ tốn thêm một lượt Dola. Tiếp tục?')) { await api.post(`/api/dola/tasks/${b.dataset.id}/retry`); load(); } },
      async del(b) { if (await confirm('Xoá task này?', { danger: true, ok: 'Xoá' })) { await api.del(`/api/dola/tasks/${b.dataset.id}`); load(); } },
    });
    await load();
    ctx.every(8000, load);
  }

  async function accountsTab(el) {
    const [st, gw] = await Promise.all([api.get('/api/dola/status'), api.get('/api/dola/gateways').catch(() => ({ gateways: [] }))]);
    el.innerHTML = '';
    const box = card({ title: `Tài khoản (đặt lại lúc ${fmt.time(st.next_reset)} · ${esc(st.reset_tz)})`, icon: 'people',
      tools: gw.gateways.map((g) => `<a class="btn btn-sm btn-outline-secondary ms-1" href="${esc(g.url)}" target="_blank" rel="noopener"><i class="bi bi-box-arrow-up-right me-1"></i>Quản trị ${esc(g.id)}</a>`).join('') });
    el.append(box);
    dataTable(box.querySelector('.card-body'), { rows: st.accounts, pageSize: 50, search: false, columns: [
      { key: 'id', label: 'Tài khoản', render: (a) => `<b>${esc(a.id)}</b><span class="cell-sub">${esc(a.base_url)}</span>` },
      { key: 'gateway_online', label: 'Gateway', render: (a) => (a.gateway_online ? badge('ok', 'Online') : badge('error', 'Offline')) },
      { key: 'used_today', label: 'Hôm nay', render: (a) => `${a.used_today}/${a.daily_limit} · còn ${a.remaining}${a.inflight ? ` · ${a.inflight} đang chạy` : ''}` },
      { key: 'is_blocked', label: 'Trạng thái', render: (a) => (!a.enabled ? badge('disabled', 'Tắt') : a.is_blocked ? `${badge('blocked', 'Tạm khoá')}<span class="cell-sub">đến ${fmt.time(a.blocked_until)} · ${esc(a.block_reason)}</span>` : badge('ok', 'Sẵn sàng')) },
      { key: 'last_used_at', label: 'Dùng lần cuối', render: (a) => fmt.ago(a.last_used_at) },
      { key: 'x', label: '', sort: false, cls: 'text-end', render: (a) => (a.is_blocked ? `<button class="btn btn-sm btn-outline-primary" data-action="unblock" data-id="${esc(a.id)}">Mở khoá</button>` : '') },
    ] });
    bindActions(el, { async unblock(b) { await api.post(`/api/dola/accounts/${encodeURIComponent(b.dataset.id)}/unblock`); toast('Đã mở khoá', 'success'); accountsTab(el); } });
  }

  App.page({
    id: 'dola', group: 'production', title: 'Video AI (Dola)', icon: 'camera-video',
    desc: 'Seedance: prompt → clip MP4, xoay vòng tài khoản theo hạn mức ngày',
    render(ctx) {
      return tabs(ctx.el, ctx, [
        { id: 'tasks', label: 'Video', icon: 'film', render: (el) => tasksTab(el, ctx) },
        { id: 'accounts', label: 'Tài khoản & gateway', icon: 'people', render: accountsTab },
      ]);
    },
  });
})();
