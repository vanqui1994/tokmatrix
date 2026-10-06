/* Video Studio (Compare Studio / Matrix): thư viện video, chi tiết, kiểm tra/render với log trực tiếp, ảnh cảnh, xếp lịch đăng. */
(function () {
  const { api, esc, fmt, toast, card, dataTable, bindActions, modal, formModal, badge, empty, infoBox } = App;

  const STYLES = ['compare', 'mystery', 'vox', 'newspaper', 'kinetic', 'science', 'folklore', 'tierlist', 'survival', 'chalk', 'wildlife'];

  /** Chạy một tác vụ (check/render/vo/fit) và đổ log trực tiếp vào hộp `box`. Trả Promise kết thúc với mã thoát. */
  async function runTask(slug, task, box, extra = {}) {
    const r = await api.post('/api/compare-videos/run-task', { slug, task, ...extra });
    box.classList.remove('d-none');
    box.textContent = `$ ${task} ${slug}\n`;
    return new Promise((resolve) => {
      const es = new EventSource(r.stream_url);
      es.onmessage = (e) => {
        const x = JSON.parse(e.data);
        box.textContent += (x.line ?? '') + '\n';
        box.scrollTop = box.scrollHeight;
      };
      es.addEventListener('done', (e) => {
        const code = JSON.parse(e.data).code;
        box.textContent += `\n[kết thúc, mã ${code}]`;
        es.close();
        toast(code === 0 ? `${task}: xong` : `${task}: lỗi (mã ${code})`, code === 0 ? 'success' : 'danger');
        resolve(code);
      });
      es.onerror = () => { es.close(); resolve(null); };
    });
  }

  async function list(ctx) {
    const style = ctx.params.style || '', rendered = ctx.params.rendered || '';
    const vids = await api.get('/api/videos');
    const types = [...new Set(vids.map((v) => v.type))].sort();
    let rows = vids;
    if (style) rows = rows.filter((v) => v.type === style);
    if (rendered) rows = rows.filter((v) => (rendered === '1') === v.hasRender);
    ctx.el.innerHTML = `<div class="row">
      <div class="col-md-3 col-6">${infoBox({ label: 'Video', value: fmt.num(vids.length), icon: 'collection-play', tone: 'primary' })}</div>
      <div class="col-md-3 col-6">${infoBox({ label: 'Đã render', value: fmt.num(vids.filter((v) => v.hasRender).length), icon: 'film', tone: 'success' })}</div>
      <div class="col-md-3 col-6">${infoBox({ label: 'Còn chờ ảnh', value: fmt.num(vids.filter((v) => v.imagesPending).length), icon: 'hourglass-split', tone: 'warning' })}</div>
      <div class="col-md-3 col-6">${infoBox({ label: 'Thể loại', value: types.length, icon: 'grid', tone: 'info' })}</div></div>`;
    const box = card({ title: 'Thư viện video', icon: 'collection-play', tools: `<button class="btn btn-sm btn-primary" data-action="gen"><i class="bi bi-magic me-1"></i>Tạo video tự động</button>` });
    ctx.el.append(box);
    dataTable(box.querySelector('.card-body'), { rows, pageSize: 30,
      toolbar: `<select class="form-select form-select-sm" data-f="style" style="width:auto"><option value="">Mọi thể loại</option>${types.map((t) => `<option ${t === style ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
        <select class="form-select form-select-sm" data-f="rendered" style="width:auto"><option value="">Mọi trạng thái</option><option value="1" ${rendered === '1' ? 'selected' : ''}>Đã render</option><option value="0" ${rendered === '0' ? 'selected' : ''}>Chưa render</option></select>`,
      columns: [
        { key: 'title', label: 'Video', text: (v) => `${v.title} ${v.slug}`, render: (v) => `<div class="d-flex gap-2 align-items-center">
          <img src="/api/compare-videos/video/${encodeURIComponent(v.slug)}/poster" width="36" height="64" class="rounded object-fit-cover bg-body-secondary" loading="lazy" alt="" onerror="this.style.visibility='hidden'">
          <span><a href="#/studio/${encodeURIComponent(v.slug)}" class="fw-semibold">${esc(v.title)}</a><span class="cell-sub mono">${esc(v.slug)}</span></span></div>` },
        { key: 'type', label: 'Thể loại', render: (v) => `<span class="badge text-bg-secondary">${esc(v.type)}</span> <span class="small">${esc(v.lang)}</span>` },
        { key: 'duration', label: 'Thời lượng', render: (v) => `${fmt.dur(v.duration)}<span class="cell-sub">${v.lines} câu</span>` },
        { key: 'hasRender', label: 'Trạng thái', sort: (v) => (v.hasRender ? 1 : 0), render: (v) => (v.hasRender ? badge('done', 'Đã render') : badge('pending', 'Chưa render')) + (v.imagesPending ? `<span class="cell-sub text-warning">${v.imagesPending} ảnh chờ</span>` : '') },
        { key: 'createdAt', label: 'Tạo lúc', render: (v) => fmt.time(v.createdAt) },
      ] });
    box.querySelectorAll('[data-f]').forEach((s) => s.addEventListener('change', () => {
      const p = new URLSearchParams();
      box.querySelectorAll('[data-f]').forEach((x) => x.value && p.set(x.dataset.f, x.value));
      location.hash = `#/studio${p.toString() ? '?' + p : ''}`;
    }));
    bindActions(ctx.el, {
      async gen() {
        const st = await api.get('/api/compare-videos/status');
        if (st.running || st.is_running) { toast('Đang có tiến trình tạo video chạy', 'warning'); return; }
        const v = await formModal({ title: 'Tạo video tự động', submit: 'Bắt đầu', fields: [
          { name: 'style', label: 'Thể loại', type: 'select', options: STYLES, value: 'compare' },
          { name: 'category', label: 'Chủ đề / danh mục (để trống = tự chọn)' },
          { name: 'render', label: 'Render luôn sau khi tạo', type: 'checkbox', value: true }] });
        if (!v) return;
        const r = await api.post('/api/compare-videos/generate', v);
        toast(r.message, r.status === 'started' ? 'success' : 'warning');
      },
    });
  }

  async function detail(ctx, slug) {
    const [d, kit, imgs] = await Promise.all([
      api.get(`/api/videos/${encodeURIComponent(slug)}`),
      api.get(`/api/videos/${encodeURIComponent(slug)}/publishing-kit`).catch(() => null),
      api.get(`/api/videos/${encodeURIComponent(slug)}/images`).catch(() => null),
    ]);
    App.$('#page-title').textContent = d.title;
    ctx.el.innerHTML = `<p><a href="#/studio"><i class="bi bi-arrow-left"></i> Thư viện</a></p>
      <div class="row"><div class="col-lg-4" data-a></div><div class="col-lg-8" data-b></div></div>`;
    const A = ctx.el.querySelector('[data-a]'), B = ctx.el.querySelector('[data-b]');
    A.append(card({ title: 'Bản render', icon: 'film', body: d.hasRender
      ? `<video src="/api/videos/${encodeURIComponent(slug)}/render" controls class="w-100 rounded mb-2" style="max-height:60vh"></video>
         <a class="btn btn-sm btn-outline-secondary w-100" href="/api/videos/${encodeURIComponent(slug)}/download"><i class="bi bi-download me-1"></i>Tải MP4</a>`
      : empty('Chưa render', 'film') }));
    A.append(card({ title: 'Thông tin', icon: 'info-circle', body: `<dl class="row kv mb-0">
      <dt class="col-5">Thể loại</dt><dd class="col-7">${esc(d.type)}</dd><dt class="col-5">Ngôn ngữ</dt><dd class="col-7">${esc(d.lang)}</dd>
      <dt class="col-5">Thời lượng</dt><dd class="col-7">${fmt.dur(d.duration)} · ${d.lines} câu</dd><dt class="col-5">Ảnh chờ</dt><dd class="col-7">${d.imagesPending}</dd>
      <dt class="col-5">Tạo lúc</dt><dd class="col-7">${fmt.time(d.createdAt)}</dd></dl>` }));

    const ops = card({ title: 'Thao tác', icon: 'tools', body: `<div class="d-flex flex-wrap gap-2 mb-2">
      <button class="btn btn-outline-primary" data-action="task" data-task="check"><i class="bi bi-clipboard-check me-1"></i>Kiểm tra</button>
      <button class="btn btn-primary" data-action="task" data-task="render" ${d.imagesPending ? 'disabled title="Còn ảnh đang chờ"' : ''}><i class="bi bi-film me-1"></i>Render</button>
      <button class="btn btn-outline-secondary" data-action="task" data-task="vo"><i class="bi bi-mic me-1"></i>Tạo lại giọng đọc</button>
      <button class="btn btn-outline-secondary" data-action="task" data-task="fit"><i class="bi bi-arrows-collapse me-1"></i>Khớp thời lượng</button>
      <button class="btn btn-success ms-auto" data-action="publish" ${d.hasRender && !d.imagesPending ? '' : 'disabled'}><i class="bi bi-send me-1"></i>Xếp lịch đăng</button></div>
      <pre class="log-box d-none" data-log></pre>` });
    B.append(ops);

    if (imgs && imgs.items && Object.keys(imgs.items).length) {
      const items = Object.entries(imgs.items);
      B.append(card({ title: `Ảnh cảnh (${items.length})`, icon: 'images', body: `<div class="media-grid">${items.map(([k, it]) => {
        const ok = it.dest && ['antigravity', 'cf_worker', 'imagerouter', 'muse'].includes(it.source);
        return `<div class="card media-card"><div class="media-thumb" style="${it.dest ? `background-image:url('/videos/${encodeURIComponent(slug)}/${esc(it.dest)}')` : ''}"></div>
          <div class="card-body"><div class="d-flex justify-content-between"><b class="small">${esc(k)}</b>${ok ? badge('done', it.source) : badge('pending', it.source || 'chờ')}</div>
          ${it.prompt ? `<div class="cell-sub text-truncate-2" title="${esc(it.prompt)}">${esc(it.prompt)}</div>` : ''}</div></div>`;
      }).join('')}</div>` }));
    }
    if (Array.isArray(d.script) && d.script.length) {
      B.append(card({ title: 'Kịch bản', icon: 'file-earmark-text', bodyCls: 'p-0', body: `<table class="table table-sm mb-0"><tbody>${d.script.map((l, i) =>
        `<tr><td class="text-body-secondary" style="width:3rem">${l.n ?? i + 1}</td><td>${esc(l.spoken || l.text || l.caption || (typeof l === 'string' ? l : JSON.stringify(l)))}</td>
        <td class="text-nowrap small text-body-secondary">${l.start != null ? fmt.dur(l.start) : ''}</td></tr>`).join('')}</tbody></table>` }));
    }

    bindActions(ctx.el, {
      async task(b) {
        ctx.el.querySelectorAll('[data-action=task]').forEach((x) => (x.disabled = true));
        try { await runTask(slug, b.dataset.task, ops.querySelector('[data-log]'), b.dataset.task === 'fit' ? { target: 60 } : {}); }
        finally { if (ctx.alive) detail(ctx, slug); }
      },
      async publish() {
        const chs = await api.get('/api/channels');
        const v = await formModal({ title: 'Xếp lịch đăng', size: 'lg', submit: 'Xếp lịch', fields: [
          { name: 'channel_id', label: 'Kênh', type: 'select', required: true, options: [['', '— chọn kênh —'], ...chs.channels.map((c) => [c.id, `@${c.username || c.id} · ${c.original_country || c.country}`])] },
          { name: 'caption', label: 'Caption', type: 'textarea', rows: 4, value: kit ? kit.caption : d.title },
          { name: 'hashtags', label: 'Hashtag', value: kit ? kit.hashtagString : '' },
          { name: 'when', label: 'Giờ đăng (để trống = ngay)', type: 'datetime-local' },
          { name: 'ai_generated', label: 'Gắn nhãn nội dung AI', type: 'checkbox', value: false }] });
        if (!v) return;
        const body = { slug, channel_id: Number(v.channel_id), caption: v.caption, hashtags: v.hashtags, ai_generated: v.ai_generated,
          schedule_time: v.when ? Math.floor(new Date(v.when).getTime() / 1000) : null };
        try {
          const r = await api.post('/api/compare-videos/send-to-upload', body);
          toast(r.message, 'success');
        } catch (e) {
          if (e.data && e.data.needsConfirm && (await App.confirm(`${e.message}. Vẫn xếp lịch?`))) {
            const r = await api.post('/api/compare-videos/send-to-upload', { ...body, confirm_nearby: true });
            toast(r.message, 'success');
          } else throw e;
        }
      },
    });
  }

  App.page({
    id: 'studio', group: 'production', title: 'Video Studio', icon: 'collection-play',
    desc: 'Video Compare Studio / Matrix: kiểm tra, render, xếp lịch đăng',
    render(ctx) { return ctx.sub ? detail(ctx, ctx.sub) : list(ctx); },
  });
})();
