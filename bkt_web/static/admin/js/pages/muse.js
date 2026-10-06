/* Muse: Kuaishou → Muse (làm lại video theo nguồn Kuaishou) và Phim AI (ý tưởng → nhiều cảnh → phim). */
(function () {
  const { api, esc, fmt, toast, card, dataTable, bindActions, modal, formModal, confirm, badge, empty, tabs, infoBox } = App;

  // ------------------------------------------------------------ Kuaishou → Muse
  App.page({
    id: 'kuaishou', group: 'production', title: 'Kuaishou → Muse', icon: 'arrow-repeat',
    desc: 'Lấy video mới từ profile Kuaishou, quay lại bằng Muse, lời theo ngôn ngữ tài khoản',
    badge: async () => { const r = await api.get('/api/muse-remake/sources'); return r.status && r.status.busy ? { text: 'chạy', tone: 'primary' } : null; },
    render(ctx) {
      return tabs(ctx.el, ctx, [
        { id: 'videos', label: 'Video', icon: 'collection-play', render: (el) => ksVideos(el, ctx) },
        { id: 'sources', label: 'Nguồn Kuaishou', icon: 'diagram-3', render: ksSources },
      ]);
    },
  });

  async function ksVideos(el, ctx) {
    const src = ctx.params.source || '';
    const t = dataTable(el, { rows: [], pageSize: 30, columns: [
      { key: 'title', label: 'Video', render: (v) => `<div class="d-flex gap-2 align-items-center">${v.cover ? `<img src="${esc(v.cover)}" alt="" width="40" height="70" class="rounded object-fit-cover" loading="lazy" referrerpolicy="no-referrer">` : ''}
        <span><span class="text-truncate-2">${esc(v.new_title || v.title || v.ks_id)}</span><span class="cell-sub">${esc(v.language)} · ${fmt.dur(v.duration)} · nguồn #${v.source_id}</span></span></div>` },
      { key: 'status', label: 'Trạng thái', render: (v) => `${badge(v.status)}${v.step ? `<span class="cell-sub">${esc(v.step)}</span>` : ''}${v.error ? `<span class="cell-sub text-danger" title="${esc(v.error)}">${esc(fmt.short(v.error, 80))}</span>` : ''}` },
      { key: 'upload_task_id', label: 'Đăng', render: (v) => (v.posted ? '<span class="badge text-bg-success">Đã đăng</span>' : v.upload_task_id ? `<a href="#/upload">task #${v.upload_task_id}</a>` : '—') },
      { key: 'updated', label: 'Cập nhật', render: (v) => fmt.ago(v.updated) },
      { key: 'id', label: '', cls: 'text-end', sort: false, render: (v) => `<div class="btn-group btn-group-sm">
        ${v.final_path ? `<button class="btn btn-outline-primary" data-action="play" data-id="${v.id}"><i class="bi bi-play-fill"></i></button>` : ''}
        <a class="btn btn-outline-secondary" href="${esc(v.url)}" target="_blank" rel="noopener" title="Video gốc"><i class="bi bi-box-arrow-up-right"></i></a>
        ${['error', 'failed', 'done', 'stopped'].includes(v.status) ? `<button class="btn btn-outline-warning" data-action="retry" data-id="${v.id}" title="Làm lại"><i class="bi bi-arrow-clockwise"></i></button>` : ''}
        <button class="btn btn-outline-danger" data-action="del" data-id="${v.id}" title="Xoá"><i class="bi bi-trash"></i></button></div>` },
    ] });
    const load = async () => t.setRows((await api.get('/api/muse-remake/videos', { source_id: src })).videos);
    bindActions(el, {
      play: (b) => modal({ title: 'Video', body: `<video src="/api/muse-remake/videos/${b.dataset.id}/file" controls autoplay class="w-100 rounded" style="max-height:75vh"></video>` }),
      async retry(b) { await api.post(`/api/muse-remake/videos/${b.dataset.id}/retry`); toast('Đã xếp làm lại', 'success'); load(); },
      async del(b) { if (await confirm('Xoá video này?', { danger: true, ok: 'Xoá' })) { await api.del(`/api/muse-remake/videos/${b.dataset.id}`); load(); } },
    });
    await load();
    ctx.every(10000, load);
  }

  async function ksSources(el) {
    const [r, acc] = await Promise.all([api.get('/api/muse-remake/sources'), api.get('/api/muse-remake/accounts')]);
    const st = r.status || {};
    el.innerHTML = `<div class="row"><div class="col-md-4">${infoBox({ label: 'Worker', value: st.running ? 'Đang chạy' : 'Dừng', icon: 'cpu', tone: st.running ? 'success' : 'secondary' })}</div>
      <div class="col-md-8">${infoBox({ label: 'Đang làm', value: st.busy ? `Video #${st.busy}` : fmt.short(st.last || '—', 70), icon: 'hourglass-split', tone: 'info' })}</div></div>`;
    const box = card({ title: 'Nguồn Kuaishou', icon: 'diagram-3', tools: `<button class="btn btn-sm btn-primary" data-action="add"><i class="bi bi-plus-lg me-1"></i>Thêm nguồn</button>` });
    el.append(box);
    dataTable(box.querySelector('.card-body'), { rows: r.sources, pageSize: 50, columns: [
      { key: 'profile_url', label: 'Profile', render: (s) => `<a href="${esc(s.profile_url)}" target="_blank" rel="noopener">${esc(s.author || s.profile_url)}</a>${s.scan_error ? `<span class="cell-sub text-danger">${esc(fmt.short(s.scan_error, 80))}</span>` : ''}` },
      { key: 'account', label: 'Tài khoản', render: (s) => `${esc(s.account)}<span class="cell-sub">${esc(s.language)}</span>` },
      { key: 'per_day', label: 'Video/ngày' },
      { key: 'counts', label: 'Video', sort: false, render: (s) => Object.entries(s.counts || {}).map(([k, n]) => `${badge(k)} ${n}`).join(' ') || '—' },
      { key: 'last_scan', label: 'Quét lần cuối', render: (s) => fmt.ago(s.last_scan) },
      { key: 'enabled', label: 'Bật', render: (s) => `<div class="form-check form-switch"><input class="form-check-input" type="checkbox" data-action="toggle" data-id="${s.id}" ${s.enabled ? 'checked' : ''}></div>` },
      { key: 'id', label: '', cls: 'text-end', sort: false, render: (s) => `<div class="btn-group btn-group-sm">
        <a class="btn btn-outline-secondary" href="#/kuaishou/videos?source=${s.id}" title="Video"><i class="bi bi-collection-play"></i></a>
        <button class="btn btn-outline-primary" data-action="scan" data-id="${s.id}" title="Quét ngay"><i class="bi bi-arrow-repeat"></i></button>
        <button class="btn btn-outline-secondary" data-action="edit" data-id="${s.id}" title="Sửa"><i class="bi bi-pencil"></i></button>
        <button class="btn btn-outline-danger" data-action="del" data-id="${s.id}" title="Xoá"><i class="bi bi-trash"></i></button></div>` },
    ] });
    const reload = () => ksSources(el);
    const find = (b) => r.sources.find((s) => s.id === Number(b.dataset.id));
    bindActions(el, {
      async add() {
        const free = acc.accounts.filter((a) => !a.used);
        const v = await formModal({ title: 'Thêm nguồn Kuaishou', fields: [
          { name: 'profile_url', label: 'Link profile Kuaishou', required: true, placeholder: 'https://www.kuaishou.com/profile/…' },
          { name: 'channel_id', label: 'Tài khoản TikTok', type: 'select', required: true, options: free.map((a) => [a.id, `${a.name} (${a.language})`]) },
          { name: 'per_day', label: 'Video mỗi ngày', type: 'number', value: 2, min: 1, max: 10 }] });
        if (!v) return;
        await api.post('/api/muse-remake/sources', { ...v, channel_id: Number(v.channel_id) });
        toast('Đã thêm nguồn', 'success'); reload();
      },
      async edit(b) {
        const s = find(b);
        const v = await formModal({ title: 'Sửa nguồn', fields: [{ name: 'per_day', label: 'Video mỗi ngày', type: 'number', value: s.per_day, min: 1, max: 10 }] });
        if (v) { await api.patch(`/api/muse-remake/sources/${s.id}`, v); reload(); }
      },
      async toggle(b) { await api.patch(`/api/muse-remake/sources/${b.dataset.id}`, { enabled: b.checked }); toast(b.checked ? 'Đã bật' : 'Đã tắt', 'success'); },
      async scan(b) { const x = await api.post(`/api/muse-remake/sources/${b.dataset.id}/scan`); toast(`Thêm ${x.added} video mới`, 'success'); reload(); },
      async del(b) { if (await confirm('Xoá nguồn này?', { danger: true, ok: 'Xoá' })) { await api.del(`/api/muse-remake/sources/${b.dataset.id}`); reload(); } },
    });
  }

  // ------------------------------------------------------------ Phim AI
  App.page({
    id: 'muse-film', group: 'production', title: 'Phim AI (Muse)', icon: 'camera-reels',
    desc: 'Ý tưởng → nhiều cảnh quay bằng Muse → ghép thành phim',
    async render(ctx) {
      const pid = ctx.sub;
      if (pid) return filmDetail(ctx, pid);
      const r = await api.get('/api/muse-film/projects');
      ctx.el.innerHTML = '';
      const box = card({ title: 'Dự án phim', icon: 'camera-reels', tools: `<button class="btn btn-sm btn-primary" data-action="new"><i class="bi bi-plus-lg me-1"></i>Phim mới</button>` });
      ctx.el.append(box);
      const t = dataTable(box.querySelector('.card-body'), { rows: r.projects, pageSize: 25, columns: [
        { key: 'title', label: 'Phim', render: (p) => `<a href="#/muse-film/${p.id}" class="fw-semibold">${esc(p.title)}</a><span class="cell-sub">${esc(p.style)} · ${esc(p.aspect)} · ${p.n} cảnh</span>` },
        { key: 'status', label: 'Trạng thái', render: (p) => `${badge(p.status)} <span class="small">${(p.scenes || []).filter((s) => s.status === 'done').length}/${(p.scenes || []).length || p.n}</span>${p.error ? `<span class="cell-sub text-danger">${esc(fmt.short(p.error, 80))}</span>` : ''}` },
        { key: 'created', label: 'Tạo lúc', render: (p) => fmt.time(p.created) },
      ] });
      bindActions(box, {
        async new() {
          const v = await formModal({ title: 'Phim mới', size: 'lg', submit: 'Tạo', fields: [
            { name: 'title', label: 'Tên phim' },
            { name: 'idea', label: 'Ý tưởng (hoặc mỗi dòng một cảnh)', type: 'textarea', rows: 8, required: true },
            { name: 'scenes', label: 'Số cảnh', type: 'number', value: 6, min: 2, max: 30 },
            { name: 'style', label: 'Phong cách', type: 'select', options: r.styles, value: 'cinematic' },
            { name: 'aspect', label: 'Khung hình', type: 'select', options: r.aspects, value: '9:16' },
            { name: 'keep_audio', label: 'Giữ âm thanh của clip', type: 'checkbox', value: true }] });
          if (!v) return;
          const p = await api.post('/api/muse-film/projects', v);
          location.hash = `#/muse-film/${p.id}`;
        },
      });
      ctx.every(10000, async () => t.setRows((await api.get('/api/muse-film/projects')).projects));
    },
  });

  async function filmDetail(ctx, pid) {
    const load = async () => {
      const p = await api.get(`/api/muse-film/projects/${pid}`);
      const done = p.scenes.filter((s) => s.status === 'done').length;
      ctx.el.innerHTML = `<p><a href="#/muse-film"><i class="bi bi-arrow-left"></i> Danh sách phim</a></p>
        <div class="row"><div class="col-lg-4"></div><div class="col-lg-8"></div></div>`;
      const left = ctx.el.querySelector('.col-lg-4'), right = ctx.el.querySelector('.col-lg-8');
      left.append(card({ title: p.title, icon: 'camera-reels', body: `
        <div class="mb-2">${badge(p.status)} <span class="small">${done}/${p.scenes.length} cảnh xong</span></div>
        <div class="progress mb-3" style="height:6px"><div class="progress-bar" style="width:${p.scenes.length ? 100 * done / p.scenes.length : 0}%"></div></div>
        ${p.status === 'done' || p.status === 'partial' ? `<video src="/api/muse-film/projects/${pid}/film" controls class="w-100 rounded mb-2"></video>
          <a class="btn btn-sm btn-outline-primary w-100 mb-2" href="/api/muse-film/projects/${pid}/film" download><i class="bi bi-download me-1"></i>Tải phim</a>` : ''}
        <div class="d-flex gap-2">${['stopped', 'error', 'partial'].includes(p.status) ? `<button class="btn btn-sm btn-primary" data-action="resume">Tiếp tục</button>` : ''}
          ${['queued', 'rendering', 'running', 'planning', 'assembling'].includes(p.status) ? `<button class="btn btn-sm btn-outline-danger" data-action="stop">Dừng</button>` : ''}</div>
        ${p.error ? `<div class="alert alert-danger small mt-2 mb-0">${esc(p.error)}</div>` : ''}
        <hr><div class="small text-body-secondary" style="white-space:pre-wrap">${esc(p.idea)}</div>` }));
      const sc = card({ title: 'Cảnh quay', icon: 'grid-3x3-gap', body: p.scenes.length ? `<div class="media-grid">${p.scenes.map((s) => `
        <div class="card media-card">${s.status === 'done' ? `<video src="/api/muse-film/projects/${pid}/clip/${s.i}" class="w-100" controls preload="none"></video>` : `<div class="media-thumb"><i class="bi bi-camera-video fs-2"></i></div>`}
        <div class="card-body"><div class="d-flex justify-content-between mb-1"><b>Cảnh ${s.i + 1}</b>${badge(s.status)}</div>
        <div class="small text-truncate-2" title="${esc(s.prompt || s.text)}">${esc(s.text || s.prompt)}</div>
        ${s.error ? `<div class="cell-sub text-danger">${esc(fmt.short(s.error, 70))}</div>` : ''}
        ${['error', 'failed', 'done'].includes(s.status) ? `<button class="btn btn-sm btn-outline-warning mt-2" data-action="retry" data-i="${s.i}">Quay lại</button>` : ''}</div></div>`).join('')}</div>` : empty('Đang viết kịch bản cảnh…') });
      right.append(sc);
      return p;
    };
    bindActions(ctx.el, {
      async resume() { await api.post(`/api/muse-film/projects/${pid}/resume`); load(); },
      async stop() { await api.post(`/api/muse-film/projects/${pid}/stop`); load(); },
      async retry(b) { await api.post(`/api/muse-film/projects/${pid}/scenes/${b.dataset.i}/retry`); toast('Đã xếp quay lại', 'success'); load(); },
    });
    await load();
    ctx.every(10000, () => { if (![...ctx.el.querySelectorAll('video')].some((v) => !v.paused)) return load(); });
  }
})();
