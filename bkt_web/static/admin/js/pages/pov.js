/* Kênh POV tự động: mỗi tài khoản một nhân vật cố định, mỗi ngày N video 9:16 vào hàng đợi đăng. API /api/pov/* */
(function () {
  const { api, esc, fmt, toast, card, dataTable, bindActions, modal, formModal, confirm, badge, tabs } = App;

  App.page({
    id: 'pov', group: 'production', title: 'Kênh POV', icon: 'person-video3',
    desc: 'Truyện "POV: You…" minh hoạ, nhân vật cố định mỗi tài khoản, tự làm và xếp lịch đăng',
    badge: async () => { const r = await api.get('/api/pov/sources'); return r.status && r.status.busy ? { text: 'chạy', tone: 'primary' } : null; },
    render(ctx) {
      return tabs(ctx.el, ctx, [
        { id: 'videos', label: 'Video', icon: 'collection-play', render: (el) => povVideos(el, ctx) },
        { id: 'sources', label: 'Tài khoản & nhân vật', icon: 'person-badge', render: povSources },
      ]);
    },
  });

  async function povVideos(el, ctx) {
    const t = dataTable(el, { pageSize: 30, columns: [
      { key: 'title', label: 'Video', render: (v) => `<span class="text-truncate-2">${esc(v.title || v.topic || `Video #${v.id}`)}</span><span class="cell-sub">${esc(v.topic || '')} · nguồn #${v.source_id}</span>` },
      { key: 'status', label: 'Trạng thái', render: (v) => `${badge(v.status)}${v.step ? `<span class="cell-sub">${esc(v.step)}</span>` : ''}${v.error ? `<span class="cell-sub text-danger" title="${esc(v.error)}">${esc(fmt.short(v.error, 90))}</span>` : ''}` },
      { key: 'upload_task_id', label: 'Đăng', render: (v) => (v.upload_task_id ? `<a href="#/upload">task #${v.upload_task_id}</a>` : '—') },
      { key: 'updated', label: 'Cập nhật', render: (v) => fmt.ago(v.updated) },
      { key: 'id', label: '', cls: 'text-end', sort: false, render: (v) => `<div class="btn-group btn-group-sm">
        ${v.final_path ? `<button class="btn btn-outline-primary" data-action="play" data-id="${v.id}"><i class="bi bi-play-fill"></i></button>` : ''}
        ${v.status === 'error' ? `<button class="btn btn-outline-warning" data-action="retry" data-id="${v.id}" title="Làm lại"><i class="bi bi-arrow-clockwise"></i></button>` : ''}
        <button class="btn btn-outline-danger" data-action="del" data-id="${v.id}" title="Xoá (cả task đăng chưa đăng)"><i class="bi bi-trash"></i></button></div>` },
    ] });
    const load = async () => t.setRows((await api.get('/api/pov/videos')).videos);
    bindActions(el, {
      play: (b) => modal({ title: 'Video', body: `<video src="/api/pov/videos/${b.dataset.id}/file" controls autoplay class="w-100 rounded" style="max-height:75vh"></video>` }),
      async retry(b) { await api.post(`/api/pov/videos/${b.dataset.id}/retry`); toast('Đã xếp làm lại', 'success'); load(); },
      async del(b) {
        if (!(await confirm('Xoá video này và task đăng của nó (nếu chưa đăng)?', { danger: true, ok: 'Xoá' }))) return;
        const r = await api.del(`/api/pov/videos/${b.dataset.id}`); toast(r.note || 'Đã xoá', 'success'); load();
      },
    });
    await load();
    ctx.every(10000, load);
  }

  async function povSources(el) {
    const r = await api.get('/api/pov/sources');
    const box = card({ title: 'Tài khoản chạy POV', icon: 'person-badge', tools: `<button class="btn btn-sm btn-primary" data-action="add"><i class="bi bi-plus-lg me-1"></i>Thêm tài khoản</button>` });
    el.replaceChildren(box);
    const t = dataTable(box.querySelector('.card-body'), { columns: [
      { key: 'account', label: 'Tài khoản', render: (s) => `${esc(s.account)}<span class="cell-sub">#${s.channel_id} · ${esc(s.language)} · ${esc(s.niche || '—')}</span>` },
      { key: 'character', label: 'Nhân vật cố định', render: (s) => `<span class="small">${esc(s.character)}</span>` },
      { key: 'per_day', label: 'Mỗi ngày' },
      { key: 'counts', label: 'Video', sort: false, render: (s) => Object.entries(s.counts || {}).map(([k, n]) => `${badge(k)} ${n}`).join(' ') || '—' },
      { key: 'enabled', label: 'Bật', render: (s) => `<div class="form-check form-switch"><input class="form-check-input" type="checkbox" data-action="toggle" data-id="${s.id}" ${s.enabled ? 'checked' : ''}></div>` },
    ] });
    t.setRows(r.sources);
    bindActions(box, {
      async add() {
        const v = await formModal({ title: 'Thêm tài khoản POV', submit: 'Tạo nhân vật & thêm', fields: [
          { name: 'channel_id', label: 'ID tài khoản TikTok', type: 'number', required: true },
          { name: 'per_day', label: 'Video mỗi ngày', type: 'number', value: 1, min: 1, max: 5 },
          { name: 'theme', label: 'Chủ đề kênh', value: 'money, work and quietly choosing a calmer life than everyone around you' }] });
        if (!v) return;
        await api.post('/api/pov/sources', { ...v, channel_id: Number(v.channel_id), per_day: Number(v.per_day) });
        toast('Đã thêm, Gemini đã tạo nhân vật', 'success'); povSources(el);
      },
      async toggle(b) { await api.patch(`/api/pov/sources/${b.dataset.id}`, { enabled: b.checked }); toast(b.checked ? 'Đã bật' : 'Đã tắt', 'success'); },
    });
  }
})();
