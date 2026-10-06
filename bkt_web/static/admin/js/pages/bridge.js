/* Antigravity: thư mục bridge (inbox/outbox/archive/failed) cho ảnh và hàng đợi kịch bản Matrix. */
(function () {
  const { api, esc, fmt, toast, card, dataTable, bindActions, modal, confirm, badge, infoBox, tabs } = App;

  async function imageBridge(el, ctx) {
    async function load() {
      const r = await api.get('/api/ai-images/bridge/status');
      el.innerHTML = `<div class="row">
        <div class="col-md-3 col-6">${infoBox({ label: 'Inbox (chờ agent)', value: r.inbox.count, icon: 'inbox', tone: 'warning' })}</div>
        <div class="col-md-3 col-6">${infoBox({ label: 'Outbox (chờ nhập)', value: r.outbox.count, icon: 'box-arrow-up', tone: 'primary' })}</div>
        <div class="col-md-3 col-6">${infoBox({ label: 'Đã nhập', value: r.archive.count, icon: 'archive', tone: 'success' })}</div>
        <div class="col-md-3 col-6">${infoBox({ label: 'Lỗi', value: r.failed.count, icon: 'x-octagon', tone: 'danger' })}</div></div>
        <div class="d-flex gap-2 mb-3"><button class="btn btn-outline-primary btn-sm" data-action="pull"><i class="bi bi-download me-1"></i>Kéo 1 task vào inbox</button>
        <button class="btn btn-outline-primary btn-sm" data-action="import"><i class="bi bi-box-arrow-in-down me-1"></i>Nhập outbox</button>
        <span class="ms-auto small text-body-secondary mono">${esc(r.bridge_dir)}</span></div>
        <div class="row">${['inbox', 'outbox', 'failed'].map((k) => `<div class="col-lg-4" data-k="${k}"></div>`).join('')}</div>`;
      for (const k of ['inbox', 'outbox', 'failed']) {
        const files = r[k].files || [];
        el.querySelector(`[data-k=${k}]`).append(card({ title: k, icon: 'folder2-open', bodyCls: 'p-0', body: files.length
          ? `<ul class="list-group list-group-flush">${files.slice(0, 30).map((f) => {
            const name = typeof f === 'string' ? f : f.name || f.filename;
            return `<li class="list-group-item small d-flex justify-content-between gap-2"><a href="#" data-action="open" data-folder="${k}" data-name="${esc(name)}" class="text-truncate mono">${esc(name)}</a>
              <span class="text-body-secondary text-nowrap">${esc(f.modified_at || '')}</span></li>`;
          }).join('')}</ul>` : '<div class="p-3 small text-body-secondary">Trống</div>' }));
      }
    }
    bindActions(el, {
      async pull() { const r = await api.post('/api/ai-images/bridge/pull', { limit: 1 }); toast(r.message || `Đã kéo ${(r.pulled || []).length} task`, 'success'); load(); },
      async import() { const r = await api.post('/api/ai-images/bridge/import-outbox'); toast(r.message || 'Đã nhập', 'success'); load(); },
      async open(a) {
        const r = await api.get(`/api/ai-images/bridge/file/${a.dataset.folder}/${encodeURIComponent(a.dataset.name)}`);
        modal({ title: a.dataset.name, size: 'lg', body: `<pre class="log-box">${esc(r.content)}</pre>` });
      },
    });
    await load();
    ctx.every(10000, load);
  }

  async function scripts(el, ctx) {
    const head = document.createElement('div');
    el.append(head);
    const box = card({ title: 'Hàng đợi kịch bản', icon: 'file-earmark-text', tools: `<button class="btn btn-sm btn-outline-secondary" data-action="clear"><i class="bi bi-trash3 me-1"></i>Dọn task xong</button>` });
    el.append(box);
    const t = dataTable(box.querySelector('.card-body'), { rows: [], pageSize: 30, columns: [
      { key: 'id', label: 'Task', render: (x) => `<span class="mono small">${esc(fmt.short(x.id, 14))}</span><span class="cell-sub">${esc(x.video_type)} · ${esc(x.lang)}</span>` },
      { key: 'prompt', label: 'Yêu cầu', render: (x) => `<span class="text-truncate-2" style="max-width:420px">${esc(x.prompt || x.notes || '')}</span>` },
      { key: 'status', label: 'Trạng thái', render: (x) => `${badge(x.status)}${x.worker_id ? `<span class="cell-sub">${esc(x.worker_id)}</span>` : ''}${x.error_message ? `<span class="cell-sub text-danger">${esc(fmt.short(x.error_message, 80))}</span>` : ''}` },
      { key: 'created_at', label: 'Tạo lúc', render: (x) => fmt.time(x.created_at) },
      { key: 'a', label: '', sort: false, cls: 'text-end', render: (x) => `<div class="btn-group btn-group-sm">
        ${x.script_json ? `<button class="btn btn-outline-secondary" data-action="view" data-id="${esc(x.id)}" title="Xem kịch bản"><i class="bi bi-eye"></i></button>` : ''}
        ${x.status === 'failed' ? `<button class="btn btn-outline-warning" data-action="retry" data-id="${esc(x.id)}"><i class="bi bi-arrow-clockwise"></i></button>` : ''}
        <button class="btn btn-outline-danger" data-action="del" data-id="${esc(x.id)}"><i class="bi bi-trash"></i></button></div>` },
    ] });
    const load = async () => {
      const [q, s] = await Promise.all([api.get('/api/scripts/queue', { limit: 300 }), api.get('/api/scripts/queue/stats')]);
      head.innerHTML = `<div class="row">${[['Chờ', s.pending, 'hourglass', 'warning'], ['Đang viết', s.processing, 'pencil', 'primary'], ['Xong', s.completed, 'check2-circle', 'success'], ['Lỗi', s.failed, 'x-octagon', 'danger']]
        .map(([l, v, i, tn]) => `<div class="col-md-3 col-6">${infoBox({ label: l, value: fmt.num(v), icon: i, tone: tn })}</div>`).join('')}</div>`;
      t.setRows(q.queue);
    };
    bindActions(el, {
      view(b) { const x = t.rows.find((r) => r.id === b.dataset.id); modal({ title: 'Kịch bản', size: 'xl', body: `<pre class="log-box" style="max-height:70vh">${esc(JSON.stringify(x.script_json, null, 2))}</pre>` }); },
      async retry(b) { await api.post(`/api/scripts/queue/${b.dataset.id}/retry`); load(); },
      async del(b) { if (await confirm('Xoá task này?', { danger: true, ok: 'Xoá' })) { await api.del(`/api/scripts/queue/${b.dataset.id}`); load(); } },
      async clear() { const r = await api.post('/api/scripts/queue/clear-completed'); toast(r.message, 'success'); load(); },
    });
    await load();
    ctx.every(10000, load);
  }

  App.page({
    id: 'antigravity', group: 'resources', title: 'Antigravity', icon: 'stars',
    desc: 'Cầu nối với agent Antigravity: ảnh và kịch bản',
    render(ctx) {
      return tabs(ctx.el, ctx, [
        { id: 'images', label: 'Bridge ảnh', icon: 'images', render: (el) => imageBridge(el, ctx) },
        { id: 'scripts', label: 'Hàng đợi kịch bản', icon: 'file-earmark-text', render: (el) => scripts(el, ctx) },
      ]);
    },
  });
})();
