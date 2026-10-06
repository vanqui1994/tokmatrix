/* Tài nguyên AI: hàng đợi & thư viện ảnh, nguồn ảnh (Antigravity, ImageRouter, Cloudflare, Muse), Antigravity bridge, hàng đợi kịch bản. */
(function () {
  const { api, esc, fmt, toast, card, dataTable, bindActions, modal, formModal, confirm, badge, infoBox, empty, tabs } = App;

  /** Bảng khoá–giá trị cho các object trạng thái có cấu trúc không cố định. */
  function kv(obj) {
    if (!obj || typeof obj !== 'object') return `<span class="text-body-secondary">${esc(obj ?? '—')}</span>`;
    return `<dl class="row kv mb-0">${Object.entries(obj).map(([k, v]) => `<dt class="col-sm-5 mono">${esc(k)}</dt><dd class="col-sm-7">${
      v && typeof v === 'object' ? `<span class="mono small">${esc(fmt.short(JSON.stringify(v), 220))}</span>`
        : typeof v === 'boolean' ? (v ? '<i class="bi bi-check-lg text-success"></i>' : '<i class="bi bi-x-lg text-danger"></i>')
        : typeof v === 'number' && v > 1.5e9 && v < 4e9 ? fmt.time(v) : esc(v)}</dd>`).join('')}</dl>`;
  }

  // ------------------------------------------------------------ Ảnh AI
  async function queueTab(el, ctx) {
    const st = ctx.params.status || '';
    const head = document.createElement('div');
    el.append(head);
    const box = card({ title: 'Hàng đợi ảnh', icon: 'list-ol', tools: `<button class="btn btn-sm btn-primary me-1" data-action="new"><i class="bi bi-plus-lg me-1"></i>Yêu cầu ảnh</button>
      <button class="btn btn-sm btn-outline-secondary" data-action="clear"><i class="bi bi-trash3 me-1"></i>Dọn mục xong/lỗi</button>` });
    el.append(box);
    const t = dataTable(box.querySelector('.card-body'), { rows: [], pageSize: 30,
      toolbar: `<div class="btn-group btn-group-sm">${[['', 'Tất cả'], ['pending', 'Chờ'], ['processing', 'Đang vẽ'], ['completed', 'Xong'], ['failed', 'Lỗi']].map(([v, l]) =>
        `<a class="btn btn-outline-secondary ${v === st ? 'active' : ''}" href="#/ai-images/queue${v ? '?status=' + v : ''}">${l}</a>`).join('')}</div>`,
      columns: [
        { key: 'image_url', label: '', sort: false, render: (x) => (x.image_url ? `<img src="${esc(x.image_url)}" width="48" height="48" class="rounded object-fit-cover" loading="lazy" alt="">` : '<i class="bi bi-image text-body-secondary fs-4"></i>') },
        { key: 'prompt', label: 'Prompt', render: (x) => `<span class="text-truncate-2" style="max-width:480px">${esc(x.prompt)}</span><span class="cell-sub">${esc(x.engine)} · ${esc(x.model || '')} · ${esc(x.aspect_ratio)}${x.notes ? ' · ' + esc(fmt.short(x.notes, 40)) : ''}</span>` },
        { key: 'status', label: 'Trạng thái', render: (x) => `${badge(x.status)}${x.attempt_count ? `<span class="cell-sub">lần ${x.attempt_count}</span>` : ''}${x.error_message ? `<span class="cell-sub text-danger" title="${esc(x.error_message)}">${esc(fmt.short(x.error_message, 70))}</span>` : ''}` },
        { key: 'created_at', label: 'Tạo lúc', render: (x) => fmt.time(x.created_at) },
        { key: 'id', label: '', sort: false, cls: 'text-end', render: (x) => `<div class="btn-group btn-group-sm">
          ${['failed', 'completed'].includes(x.status) ? `<button class="btn btn-outline-warning" data-action="retry" data-id="${esc(x.id)}" title="Vẽ lại"><i class="bi bi-arrow-clockwise"></i></button>` : ''}
          <button class="btn btn-outline-danger" data-action="del" data-id="${esc(x.id)}"><i class="bi bi-trash"></i></button></div>` },
      ] });
    const load = async () => {
      const r = await api.get('/api/ai-images/queue', { status: st });
      head.innerHTML = `<div class="row">
        <div class="col-md-3 col-6">${infoBox({ label: 'Đang chờ', value: fmt.num(r.pending_count - r.processing_count), icon: 'hourglass', tone: 'warning' })}</div>
        <div class="col-md-3 col-6">${infoBox({ label: 'Đang vẽ', value: fmt.num(r.processing_count), icon: 'brush', tone: 'primary' })}</div>
        <div class="col-md-3 col-6">${infoBox({ label: 'Xong', value: fmt.num(r.completed_count), icon: 'check2-circle', tone: 'success' })}</div>
        <div class="col-md-3 col-6">${infoBox({ label: 'Lỗi', value: fmt.num(r.failed_count), icon: 'x-octagon', tone: 'danger' })}</div></div>`;
      t.setRows(r.queue);
    };
    bindActions(el, {
      async new() {
        const m = await api.get('/api/ai-images/models');
        const v = await formModal({ title: 'Yêu cầu ảnh', size: 'lg', submit: 'Đưa vào hàng đợi', fields: [
          { name: 'prompt', label: 'Prompt', type: 'textarea', rows: 4, required: true },
          { name: 'negative_prompt', label: 'Không muốn có' },
          { name: 'aspect_ratio', label: 'Khung hình', type: 'select', options: m.ratios, value: '9:16' },
          { name: 'engine', label: 'Nguồn vẽ', type: 'select', value: 'antigravity', options: [['antigravity', 'Antigravity (hàng đợi agent)'], ['muse', 'Muse'], ['pollinations', 'Pollinations (nhanh)']] },
          { name: 'batch_size', label: 'Số ảnh', type: 'number', value: 1, min: 1, max: 8 }] });
        if (!v) return;
        await api.post('/api/ai-images/queue', v); toast('Đã đưa vào hàng đợi', 'success'); load();
      },
      async clear() { const r = await api.post('/api/ai-images/queue/clear-completed'); toast(r.message, 'success'); load(); },
      async retry(b) { await api.post(`/api/ai-images/queue/${b.dataset.id}/retry`); load(); },
      async del(b) { await api.del(`/api/ai-images/queue/${b.dataset.id}`); load(); },
    });
    await load();
    ctx.every(6000, load);
  }

  async function galleryTab(el, ctx) {
    const q = ctx.params.q || '', page = Number(ctx.params.page || 1);
    const r = await api.get('/api/ai-images/gallery', { q, page, page_size: 60 });
    el.innerHTML = `<form class="input-group mb-3" style="max-width:420px"><input class="form-control" name="q" value="${esc(q)}" placeholder="Tìm theo prompt"><button class="btn btn-outline-secondary"><i class="bi bi-search"></i></button></form>
      ${r.images.length ? `<div class="media-grid">${r.images.map((i) => `<div class="card media-card">
        <a href="${esc(i.url)}" target="_blank" rel="noopener"><div class="media-thumb ${i.aspect_ratio === '1:1' ? 'square' : ''}" style="background-image:url('${esc(i.url)}')"></div></a>
        <div class="card-body"><div class="small text-truncate-2" title="${esc(i.prompt)}">${esc(i.prompt || i.filename)}</div>
        <div class="d-flex justify-content-between align-items-center mt-1"><span class="cell-sub">${esc(i.engine || '')} · ${i.width}×${i.height}</span>
        <button class="btn btn-sm btn-link text-danger p-0" data-action="del" data-f="${esc(i.filename)}" title="Xoá"><i class="bi bi-trash"></i></button></div></div></div>`).join('')}</div>` : empty('Không có ảnh')}
      <div class="d-flex justify-content-between mt-3 small"><span>${fmt.num(r.total)} ảnh</span><span>
        ${page > 1 ? `<a class="btn btn-sm btn-outline-secondary" href="#/ai-images/gallery?q=${encodeURIComponent(q)}&page=${page - 1}">Trước</a>` : ''}
        ${r.has_more ? `<a class="btn btn-sm btn-outline-secondary" href="#/ai-images/gallery?q=${encodeURIComponent(q)}&page=${page + 1}">Sau</a>` : ''}</span></div>`;
    el.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      location.hash = `#/ai-images/gallery?q=${encodeURIComponent(e.target.q.value.trim())}`;
    });
    bindActions(el, {
      async del(b) {
        if (!(await confirm('Xoá ảnh này khỏi thư viện?', { danger: true, ok: 'Xoá' }))) return;
        await api.del(`/api/ai-images/gallery/${encodeURIComponent(b.dataset.f)}`);
        b.closest('.media-card').remove();
      },
    });
  }

  async function providersTab(el) {
    const [ag, ir, cf, mu] = await Promise.all([
      api.get('/api/ai-images/antigravity-accounts').catch((e) => ({ error: e.message })),
      api.get('/api/ai-images/imagerouter/status').catch((e) => ({ error: e.message })),
      api.get('/api/ai-images/cf-fallback/status').catch((e) => ({ error: e.message })),
      api.get('/api/ai-images/muse/status').catch((e) => ({ error: e.message })),
    ]);
    const done = ag.completed_24h || {};
    el.innerHTML = `<div class="row">
      <div class="col-md-4">${infoBox({ label: 'Antigravity · 24h', value: fmt.num(done.antigravity), icon: 'stars', tone: 'primary' })}</div>
      <div class="col-md-4">${infoBox({ label: 'ImageRouter · 24h', value: fmt.num(done.imagerouter), icon: 'signpost-split', tone: 'info' })}</div>
      <div class="col-md-4">${infoBox({ label: 'Cloudflare · 24h', value: fmt.num(done.cf_worker), icon: 'cloud', tone: 'warning' })}</div></div>
      <div class="row"><div class="col-lg-6" data-a></div><div class="col-lg-6" data-b></div></div>`;
    el.querySelector('[data-a]').append(card({ title: 'Tài khoản Antigravity', icon: 'person-badge', body: kv(ag.pool || { 'Trạng thái': 'Chưa có dữ liệu quota' }) }));
    el.querySelector('[data-a]').append(card({ title: 'Muse', icon: 'palette', body: kv(mu) }));
    el.querySelector('[data-b]').append(card({ title: 'ImageRouter (trả phí)', icon: 'signpost-split', body: kv(ir) }));
    el.querySelector('[data-b]').append(card({ title: 'Cloudflare Worker (dự phòng)', icon: 'cloud', body: kv(cf) }));
  }

  App.page({
    id: 'ai-images', group: 'resources', title: 'Ảnh AI', icon: 'images',
    desc: 'Hàng đợi vẽ ảnh, thư viện và các nguồn vẽ',
    badge: async () => { const r = await api.get('/api/ai-images/queue', { status: 'failed' }); return r.failed_count ? { text: r.failed_count, tone: 'danger' } : null; },
    render(ctx) {
      return tabs(ctx.el, ctx, [
        { id: 'queue', label: 'Hàng đợi', icon: 'list-ol', render: (el) => queueTab(el, ctx) },
        { id: 'gallery', label: 'Thư viện', icon: 'grid-3x3', render: (el) => galleryTab(el, ctx) },
        { id: 'providers', label: 'Nguồn vẽ', icon: 'diagram-2', render: providersTab },
      ]);
    },
  });
})();
