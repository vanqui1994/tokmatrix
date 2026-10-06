/* Tải video từ nền tảng khác và biên tập/render lại (lật, tốc độ, cắt viền, chỉnh màu). */
(function () {
  const { api, esc, fmt, toast, card, dataTable, bindActions, modal, formModal, confirm, badge } = App;

  App.page({
    id: 'downloader', group: 'resources', title: 'Tải video', icon: 'download',
    desc: 'Tải video từ TikTok, Kuaishou và các nền tảng khác',
    async render(ctx) {
      const pf = await api.get('/api/downloader/platforms');
      ctx.el.innerHTML = '';
      const form = card({ title: 'Tải mới', icon: 'link-45deg', body: `<form class="row g-2 align-items-end">
        <div class="col-lg-7"><label class="form-label">Link (mỗi dòng một link)</label><textarea class="form-control" name="urls" rows="3" required></textarea></div>
        <div class="col-lg-2"><label class="form-label">Nền tảng</label><select class="form-select" name="platform">${pf.platforms.map((p) =>
          `<option value="${esc(p.id)}" ${p.ready === false ? 'disabled' : ''}>${esc(p.label)}${p.ready === false ? ' (chưa sẵn sàng)' : ''}</option>`).join('')}</select></div>
        <div class="col-lg-1"><label class="form-label">Tối đa</label><input class="form-control" type="number" name="limit" value="20" min="1" max="200" title="Với link profile: số video mới nhất"></div>
        <div class="col-lg-2"><button class="btn btn-primary w-100" data-action="go"><i class="bi bi-download me-1"></i>Tải</button></div></form>
        <div data-job class="mt-2"></div>` });
      ctx.el.append(form);
      const box = card({ title: 'Video đã tải', icon: 'collection-play' });
      ctx.el.append(box);
      const t = dataTable(box.querySelector('.card-body'), { rows: [], pageSize: 30, columns: [
        { key: 'title', label: 'Video', render: (v) => `<div class="d-flex gap-2 align-items-center">${v.cover_url ? `<img src="${esc(v.cover_url)}" width="40" height="70" class="rounded object-fit-cover" loading="lazy" alt="" referrerpolicy="no-referrer">` : ''}
          <span><span class="text-truncate-2">${esc(v.title || v.original_url)}</span><span class="cell-sub">${esc(v.platform)} · ${esc(v.author || '')} · ${fmt.dur(v.duration)} · ${fmt.bytes(v.file_size)}</span></span></div>` },
        { key: 'status', label: 'Trạng thái', render: (v) => badge(v.status) },
        { key: 'created_at', label: 'Tải lúc', render: (v) => fmt.time(v.created_at) },
        { key: 'id', label: '', sort: false, cls: 'text-end', render: (v) => `<div class="btn-group btn-group-sm">
          ${v.video_url ? `<button class="btn btn-outline-primary" data-action="play" data-url="${esc(v.video_url)}"><i class="bi bi-play-fill"></i></button>
          <a class="btn btn-outline-secondary" href="#/render?video=${v.id}" title="Biên tập"><i class="bi bi-magic"></i></a>` : ''}
          <a class="btn btn-outline-secondary" href="${esc(v.original_url)}" target="_blank" rel="noopener"><i class="bi bi-box-arrow-up-right"></i></a>
          <button class="btn btn-outline-danger" data-action="del" data-id="${v.id}"><i class="bi bi-trash"></i></button></div>` },
      ] });
      const load = async () => t.setRows((await api.get('/api/downloader/videos')).videos);
      let jobId = null;
      const job = async () => {
        if (!jobId) return;
        const j = await api.get(`/api/downloader/jobs/${jobId}`);
        form.querySelector('[data-job]').innerHTML = `<div class="small">Lượt tải #${j.id}: ${j.completed}/${j.total} xong${j.failed ? `, <span class="text-danger">${j.failed} lỗi</span>` : ''} ${badge(j.status)}${j.error_message ? ` <span class="text-danger">${esc(j.error_message)}</span>` : ''}</div>`;
        if (j.finished_at) { jobId = null; load(); }
      };
      bindActions(ctx.el, {
        async go() {
          const f = form.querySelector('form');
          if (!f.reportValidity()) return;
          const urls = f.urls.value.split('\n').map((x) => x.trim()).filter(Boolean);
          const r = await api.post('/api/downloader/download', { urls, platform: f.platform.value, profile_limit: Number(f.limit.value) });
          toast(r.message, 'success'); jobId = r.job_id; f.urls.value = ''; job();
        },
        play: (b) => modal({ title: 'Video', body: `<video src="${esc(b.dataset.url)}" controls autoplay class="w-100 rounded" style="max-height:75vh"></video>` }),
        async del(b) { if (await confirm('Xoá video này?', { danger: true, ok: 'Xoá' })) { await api.del(`/api/downloader/videos/${b.dataset.id}`); load(); } },
      });
      await load();
      ctx.every(3000, job);
    },
  });

  App.page({
    id: 'render', group: 'resources', title: 'Biên tập video', icon: 'magic',
    desc: 'Lật hình, đổi tốc độ, cắt viền, chỉnh màu, chèn lớp phủ',
    async render(ctx) {
      ctx.el.innerHTML = '';
      const box = card({ title: 'Tác vụ biên tập', icon: 'magic', tools: `<button class="btn btn-sm btn-primary" data-action="new"><i class="bi bi-plus-lg me-1"></i>Biên tập video</button>` });
      ctx.el.append(box);
      const t = dataTable(box.querySelector('.card-body'), { rows: [], pageSize: 30, columns: [
        { key: 'title', label: 'Tác vụ', render: (x) => `${esc(x.title)}<span class="cell-sub">${x.flip ? 'lật · ' : ''}x${x.speed} · cắt ${x.crop_percent}%${x.color_adjust ? ' · màu' : ''}</span>` },
        { key: 'status', label: 'Trạng thái', render: (x) => `${badge(x.status)}${x.status === 'PROCESSING' ? `<div class="progress mt-1" style="height:4px"><div class="progress-bar" style="width:${x.progress || 0}%"></div></div>` : ''}${x.error_message ? `<span class="cell-sub text-danger">${esc(fmt.short(x.error_message, 80))}</span>` : ''}` },
        { key: 'created_at', label: 'Tạo lúc', render: (x) => fmt.time(x.created_at) },
        { key: 'id', label: '', sort: false, cls: 'text-end', render: (x) => `<div class="btn-group btn-group-sm">
          ${x.status === 'DONE' ? `<a class="btn btn-outline-primary" href="#/upload" title="Đăng"><i class="bi bi-send"></i></a>` : ''}
          ${['QUEUED', 'PROCESSING'].includes(x.status) ? `<button class="btn btn-outline-warning" data-action="cancel" data-id="${x.id}"><i class="bi bi-stop-fill"></i></button>` : ''}
          <button class="btn btn-outline-danger" data-action="del" data-id="${x.id}"><i class="bi bi-trash"></i></button></div>` },
      ] });
      const load = async () => t.setRows((await api.get('/api/render/tasks')).tasks);
      async function create(videoId) {
        const [vids, assets] = await Promise.all([api.get('/api/downloader/videos'), api.get('/api/render/assets')]);
        const ready = vids.videos.filter((v) => v.video_url);
        if (!ready.length) { toast('Chưa có video đã tải', 'warning'); return; }
        const v = await formModal({ title: 'Biên tập video', size: 'lg', submit: 'Bắt đầu', fields: [
          { name: 'video_id', label: 'Video nguồn', type: 'select', value: videoId, options: ready.map((x) => [x.id, fmt.short(x.title || x.original_url, 80)]) },
          { name: 'task_name', label: 'Tên tác vụ', value: 'Render Video' },
          { name: 'flip', label: 'Lật ngang', type: 'checkbox', value: true },
          { name: 'speed', label: 'Tốc độ', type: 'number', value: 1.04, min: 0.5, max: 2, step: 0.01 },
          { name: 'crop_percent', label: 'Cắt viền (%)', type: 'number', value: 3, min: 0, max: 20, step: 0.5 },
          { name: 'color_adjust', label: 'Chỉnh màu nhẹ', type: 'checkbox', value: true },
          { name: 'overlay_filename', label: 'Lớp phủ', type: 'select', options: [['', 'Không'], ...(assets.overlays || []).map((o) => [o.filename || o, o.filename || o])] }] });
        if (!v) return;
        const body = { ...v, video_id: Number(v.video_id), overlay_filename: v.overlay_filename || null };
        await api.post('/api/render/create-task', body); toast('Đã tạo tác vụ', 'success'); load();
      }
      bindActions(ctx.el, {
        new: () => create(),
        async cancel(b) { await api.post(`/api/render/tasks/${b.dataset.id}/cancel`); load(); },
        async del(b) { if (await confirm('Xoá tác vụ?', { danger: true, ok: 'Xoá' })) { await api.del(`/api/render/tasks/${b.dataset.id}`); load(); } },
      });
      await load();
      if (ctx.params.video) create(ctx.params.video);
      ctx.every(4000, load);
    },
  });
})();
