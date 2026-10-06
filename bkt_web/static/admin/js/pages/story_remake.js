/* Story Remake: kênh YouTube → video ảnh phim giữ lời kể gốc (hoặc dịch). Nguồn theo tài khoản, chạy tay, video, nhật ký. */
(function () {
  const { api, esc, fmt, toast, card, dataTable, bindActions, modal, formModal, confirm, badge, empty, tabs, h } = App;

  const STATUS = { done: 'success', error: 'danger', running: 'primary', skipped: 'secondary', stopped: 'secondary' };

  function runnerBanner(st) {
    const r = st.runner || {};
    if (r.running) return `<div class="alert alert-primary d-flex align-items-center gap-2"><span class="spinner-border spinner-border-sm"></span>
      <span class="flex-grow-1">Đang chạy: ${esc(r.url || r.source || '')}</span><button class="btn btn-sm btn-outline-danger" data-action="stop"><i class="bi bi-stop-fill me-1"></i>Dừng</button></div>`;
    return '';
  }

  async function videos(el, ctx) {
    async function load() {
      const st = await api.get('/api/story-remake/status');
      const filter = ctx.params.status || '';
      const list = filter ? st.videos.filter((v) => v.status === filter) : st.videos;
      const counts = st.videos.reduce((a, v) => ((a[v.status] = (a[v.status] || 0) + 1), a), {});
      el.innerHTML = runnerBanner(st) + `<div class="d-flex flex-wrap gap-2 mb-3">
        <a class="btn btn-sm btn-outline-secondary ${filter ? '' : 'active'}" href="#/story-remake/videos">Tất cả <span class="badge text-bg-secondary">${st.videos.length}</span></a>
        ${Object.entries(counts).map(([s, n]) => `<a class="btn btn-sm btn-outline-secondary ${s === filter ? 'active' : ''}" href="#/story-remake/videos?status=${s}">${App.STATUS_LABEL[s] || s} <span class="badge text-bg-${STATUS[s] || 'secondary'}">${n}</span></a>`).join('')}
        </div>` + (list.length ? `<div class="media-grid">${list.map((v) => `
        <div class="card media-card">
          <div class="media-thumb" style="${v.has_thumb ? `background-image:url('/api/story-remake/thumb/${encodeURIComponent(v.id)}')` : ''}">${v.has_thumb ? '' : '<i class="bi bi-film fs-1"></i>'}</div>
          <div class="card-body">
            <div class="d-flex justify-content-between gap-1 mb-1"><span class="badge text-bg-${STATUS[v.status] || 'warning'}">${esc(App.STATUS_LABEL[v.status] || v.status)}</span><small class="text-body-secondary">${fmt.ago(v.updated)}</small></div>
            <div class="small fw-semibold text-truncate-2" title="${esc(v.title || v.id)}">${esc(v.title || v.id)}</div>
            ${v.step && v.status !== 'done' ? `<div class="cell-sub">${esc(v.step)}</div>` : ''}
            ${v.error ? `<div class="cell-sub text-danger" title="${esc(v.error)}">${esc(fmt.short(v.error, 90))}</div>` : ''}
            ${v.upload_error ? `<div class="cell-sub text-warning">${esc(v.upload_error)}</div>` : ''}
            ${v.upload_task_id ? `<div class="cell-sub"><i class="bi bi-calendar-check"></i> task đăng #${v.upload_task_id}</div>` : ''}
            <div class="d-flex gap-1 mt-2">
              ${v.has_mp4 ? `<button class="btn btn-sm btn-primary" data-action="play" data-id="${esc(v.id)}"><i class="bi bi-play-fill"></i> Xem</button>` : ''}
              ${v.url ? `<a class="btn btn-sm btn-outline-secondary" href="${esc(v.url)}" target="_blank" rel="noopener" title="Video gốc"><i class="bi bi-youtube"></i></a>` : ''}
            </div>
          </div></div>`).join('')}</div>` : empty('Chưa có video nào'));
    }
    bindActions(el, {
      play: (b) => modal({ title: 'Video remake', body: `<video src="/api/story-remake/video/${encodeURIComponent(b.dataset.id)}" controls autoplay class="w-100 rounded" style="max-height:75vh"></video>` }),
      async stop() { if (await confirm('Dừng lượt chạy hiện tại?')) { await api.post('/api/story-remake/stop'); toast('Đã dừng', 'success'); load(); } },
    });
    await load();
    ctx.every(8000, load);
  }

  async function sources(el) {
    const r = await api.get('/api/story-remake/sources');
    el.innerHTML = '';
    const box = card({ title: 'Mỗi tài khoản một nguồn', icon: 'diagram-3',
      tools: `<button class="btn btn-sm btn-outline-secondary me-1" data-action="bulk"><i class="bi bi-clipboard-plus me-1"></i>Dán hàng loạt</button>
              <button class="btn btn-sm btn-primary" data-action="save"><i class="bi bi-save me-1"></i>Lưu thay đổi</button>`,
      footer: '<span class="small text-body-secondary">Link YouTube (kênh) hoặc profile Kuaishou; để trống = gỡ nguồn. "Dịch" (YouTube) = dịch lời kể sang ngôn ngữ tài khoản. "Vector" (Kuaishou) = làm lại bằng hoạt hình vector thay vì Muse.</span>' });
    el.append(box);
    const t = dataTable(box.querySelector('.card-body'), { rows: r.accounts, rowKey: 'id', pageSize: 50, columns: [
      { key: 'name', label: 'Tài khoản', text: (a) => `${a.name} ${a.country} ${a.language} ${a.autopilot_niche}`, render: (a) => `<span class="fw-semibold">${esc(a.name)}</span><span class="cell-sub">${esc(a.country)} · ${esc(a.language)}${a.autopilot_niche ? ' · ' + esc(a.autopilot_niche) : ''}</span>` },
      { key: 'url', label: 'Nguồn', render: (a) => `<input class="form-control form-control-sm" data-f="url" data-id="${a.id}" value="${esc(a.url)}" placeholder="https://www.youtube.com/@kenh">
        ${a.kind ? `<span class="cell-sub">${a.kind === 'youtube' ? '<i class="bi bi-youtube"></i> YouTube' : a.vector ? 'Kuaishou → vector' : 'Kuaishou → Muse'}${a.last_run ? ' · chạy ' + fmt.ago(a.last_run) : ''}</span>` : ''}` },
      { key: 'per_day', label: 'Video/lượt', render: (a) => `<input type="number" min="1" max="20" class="form-control form-control-sm" style="width:80px" data-f="per_day" data-id="${a.id}" value="${a.per_day}">` },
      { key: 'translate', label: 'Dịch', render: (a) => `<input type="checkbox" class="form-check-input" data-f="translate" data-id="${a.id}" ${a.translate ? 'checked' : ''} title="YouTube: dịch lời kể sang ${esc(a.language)}">` },
      { key: 'vector', label: 'Vector', render: (a) => `<input type="checkbox" class="form-check-input" data-f="vector" data-id="${a.id}" ${a.vector ? 'checked' : ''} title="Kuaishou: remake bằng hoạt hình vector thay vì Muse">` },
    ] });
    const dirty = new Set();
    box.addEventListener('input', (e) => { if (e.target.dataset.id) dirty.add(Number(e.target.dataset.id)); });
    const row = (id) => {
      const g = (f) => box.querySelector(`[data-f="${f}"][data-id="${id}"]`);
      const a = r.accounts.find((x) => x.id === id);
      return { account_id: id, url: g('url') ? g('url').value.trim() : a.url, per_day: Number(g('per_day') ? g('per_day').value : a.per_day) || 3, translate: g('translate') ? g('translate').checked : a.translate, vector: g('vector') ? g('vector').checked : !!a.vector };
    };
    bindActions(box, {
      async save() {
        if (!dirty.size) { toast('Không có gì thay đổi'); return; }
        const res = await api.put('/api/story-remake/sources', { items: [...dirty].map(row) });
        const bad = (res.results || []).filter((x) => !x.ok);
        toast(bad.length ? `Đã lưu, ${bad.length} dòng lỗi: ${bad[0].error}` : 'Đã lưu nguồn', bad.length ? 'warning' : 'success');
        sources(el);
      },
      async bulk() {
        const v = await formModal({ title: 'Dán hàng loạt', size: 'lg', submit: 'Áp dụng', fields: [{ name: 'text', type: 'textarea', rows: 10,
          label: 'Mỗi dòng: tài khoản | link | số video | dịch/vector (tuỳ chọn)', placeholder: 'kenh_de_01 | https://www.youtube.com/@abc | 3 | dịch' }] });
        if (!v) return;
        const items = [];
        for (const line of v.text.split('\n').map((l) => l.trim()).filter(Boolean)) {
          const [name, url = '', n, opt = '', opt2 = ''] = line.split('|').map((x) => x.trim());
          const a = r.accounts.find((x) => x.name.replace(/^@/, '') === name.replace(/^@/, '') || String(x.id) === name);
          if (!a) { toast(`Không thấy tài khoản "${name}"`, 'warning'); continue; }
          items.push({ account_id: a.id, url, per_day: Number(n) || a.per_day || 3,
            translate: /^(dịch|dich|translate|1|y|yes)$/i.test(opt), vector: /vector/i.test(`${opt} ${opt2}`) });
        }
        if (!items.length) return;
        const res = await api.put('/api/story-remake/sources', { items });
        const bad = res.results.filter((x) => !x.ok);
        toast(`Đã cập nhật ${items.length - bad.length}/${items.length} tài khoản${bad.length ? ': ' + bad[0].error : ''}`, bad.length ? 'warning' : 'success');
        sources(el);
      },
    });
    return t;
  }

  async function run(el, ctx) {
    const [acc, watch] = await Promise.all([api.get('/api/story-remake/accounts'), api.get('/api/story-remake/watch')]);
    el.innerHTML = '<div class="row"><div class="col-lg-6" data-a></div><div class="col-lg-6" data-b></div></div>';
    const form = card({ title: 'Chạy tay một kênh / video', icon: 'play-circle', body: `<form class="vstack gap-3">
      <div><label class="form-label">Link YouTube (kênh hoặc video)</label><input class="form-control" name="url" required pattern="https?://\\S+" placeholder="https://www.youtube.com/@kenh"></div>
      <div class="row g-2"><div class="col-6"><label class="form-label">Số video</label><input class="form-control" type="number" name="limit" value="3" min="1" max="50"></div>
        <div class="col-6"><label class="form-label">Chạy song song</label><input class="form-control" type="number" name="jobs" value="1" min="1" max="3"></div></div>
      <div><label class="form-label">Tự đăng lên tài khoản</label><select class="form-select" name="account_id"><option value="">Không đăng</option>
        ${acc.accounts.map((a) => `<option value="${a.id}">${esc(a.name)} (${esc(a.language)})</option>`).join('')}</select></div>
      <button class="btn btn-primary" data-action="run"><i class="bi bi-play-fill me-1"></i>Bắt đầu</button></form>` });
    el.querySelector('[data-a]').append(form);
    const cfg = card({ title: 'Theo dõi tự động', icon: 'alarm', body: `<form class="vstack gap-3">
      <div class="form-check form-switch"><input class="form-check-input" type="checkbox" id="w-en" name="enabled" ${watch.enabled ? 'checked' : ''}><label class="form-check-label" for="w-en">Tự chạy các nguồn theo chu kỳ</label></div>
      <div><label class="form-label">Chu kỳ (phút)</label><input class="form-control" type="number" name="interval_min" min="15" max="1440" value="${watch.interval_min}"></div>
      <button class="btn btn-outline-primary" data-action="save-watch"><i class="bi bi-save me-1"></i>Lưu</button>
      <div class="small text-body-secondary">${watch.channels.length} kênh đang theo dõi, ${watch.channels.filter((c) => c.enabled !== false).length} đang bật.</div></form>` });
    el.querySelector('[data-b]').append(cfg);
    bindActions(el, {
      async run() {
        const f = form.querySelector('form');
        if (!f.reportValidity()) return;
        const body = { url: f.url.value.trim(), limit: Number(f.limit.value), jobs: Number(f.jobs.value), account_id: f.account_id.value ? Number(f.account_id.value) : null };
        await api.post('/api/story-remake/run', body);
        toast('Đã bắt đầu', 'success');
        location.hash = '#/story-remake/videos';
      },
      async 'save-watch'() {
        const f = cfg.querySelector('form');
        await api.put('/api/story-remake/watch/config', { enabled: f.enabled.checked, interval_min: Number(f.interval_min.value) });
        toast('Đã lưu', 'success');
      },
    });
  }

  async function log(el, ctx) {
    el.innerHTML = '<pre class="log-box" style="max-height:70vh"></pre>';
    const box = el.querySelector('pre');
    const load = async () => { const s = await api.get('/api/story-remake/status'); box.textContent = s.log || 'Chưa có nhật ký'; box.scrollTop = box.scrollHeight; };
    await load();
    ctx.every(4000, load);
  }

  App.page({
    id: 'story-remake', group: 'production', title: 'Story Remake', icon: 'film',
    desc: 'Kênh YouTube → video ảnh phim, giữ lời kể gốc hoặc dịch theo tài khoản',
    badge: async () => { const s = await api.get('/api/story-remake/status'); return s.runner && s.runner.running ? { text: 'chạy', tone: 'primary' } : null; },
    render(ctx) {
      return tabs(ctx.el, ctx, [
        { id: 'videos', label: 'Video', icon: 'collection-play', render: (el) => videos(el, ctx) },
        { id: 'sources', label: 'Nguồn theo tài khoản', icon: 'diagram-3', render: sources },
        { id: 'run', label: 'Chạy & theo dõi', icon: 'play-circle', render: (el) => run(el, ctx) },
        { id: 'log', label: 'Nhật ký', icon: 'journal-text', render: (el) => log(el, ctx) },
      ]);
    },
  });
})();
