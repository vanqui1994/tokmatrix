/* Autopilot: bật/tắt/tạm dừng, chạy ngay, kế hoạch hôm nay, lịch sử chạy, nhật ký, gán kênh Matrix ↔ TikTok, cấu hình. */
(function () {
  const { api, esc, fmt, toast, card, dataTable, bindActions, formModal, confirm, badge, infoBox, empty, tabs } = App;

  const CONFIG_HELP = {
    enabled: 'Bật Autopilot', paused: 'Tạm dừng (giữ qua restart)', check_interval_seconds: 'Chu kỳ chạy (giây)',
    posting_hours: 'Các giờ đăng trong ngày (JSON)', slot_jitter_minutes: 'Lệch phút riêng mỗi tài khoản',
    gap_between_posts_minutes: 'Khoảng cách tối thiểu giữa 2 bài của một kênh (phút)', min_lead_hours: 'Video phải sẵn sàng trước giờ đăng bao lâu (giờ)',
    publish_hold_until: 'Giữ không đăng đến thời điểm (epoch, 0 = không giữ)', max_concurrent_batches: 'Số batch chạy song song',
    matrix_workers: 'Worker mỗi batch', batch_timeout_minutes: 'Batch quá giờ (phút)', max_revives: 'Số lần hồi sinh job lỗi',
    priority_engines: 'Engine ưu tiên (phân cách dấu phẩy)', topic_per_channel: 'Mỗi tài khoản một chủ đề riêng',
    topic_subject_gap_days: 'Không lặp chủ đề giữa các tài khoản trong N ngày', min_free_disk_gb: 'Dung lượng trống tối thiểu (GB)',
    cleanup_enabled: 'Dọn video đã đăng', archive_rclone_remote: 'Nơi sao lưu (rclone remote)', archive_vps_host: 'Nơi sao lưu (rsync host)',
    purge_posted_after_days: 'Xoá media video đã đăng sau N ngày',
  };

  function overview(el, ctx) {
    async function load() {
      const s = await api.get('/api/autopilot/status');
      const hold = Number(s.config.publish_hold_until || 0);
      el.innerHTML = `
        <div class="row">
          <div class="col-md-3 col-6">${infoBox({ label: 'Trạng thái', value: App.STATUS_LABEL[s.state] || s.state, icon: 'robot', tone: App.statusTone(s.state) })}</div>
          <div class="col-md-3 col-6">${infoBox({ label: 'Kế hoạch hôm nay', value: fmt.num(s.plans.length), icon: 'card-checklist', tone: 'info' })}</div>
          <div class="col-md-3 col-6">${infoBox({ label: 'Batch đang chạy', value: fmt.num(s.batches_running.length), icon: 'cpu', tone: 'primary' })}</div>
          <div class="col-md-3 col-6">${infoBox({ label: 'Ổ đĩa trống', value: s.disk ? `${s.disk.free_gb} GB` : '—', icon: 'device-hdd', tone: s.disk && s.disk.low ? 'danger' : 'success' })}</div>
        </div>
        ${s.disk && s.disk.low ? `<div class="alert alert-warning"><i class="bi bi-exclamation-triangle me-2"></i>Ổ đĩa dưới ${s.disk.min_free_gb} GB — Autopilot sẽ không tạo batch mới.</div>` : ''}
        ${hold > Date.now() / 1000 ? `<div class="alert alert-info"><i class="bi bi-pause-circle me-2"></i>Đang giữ không đăng đến ${fmt.time(hold)}.</div>` : ''}
        ${s.last_error ? `<div class="alert alert-danger"><b>Lỗi gần nhất</b> (${fmt.ago(s.last_error_at)}): ${esc(s.last_error)}</div>` : ''}`;
      const ctl = card({
        title: 'Điều khiển', icon: 'toggles',
        body: `<div class="d-flex flex-wrap gap-2 align-items-center">
          ${s.enabled ? `<button class="btn btn-danger" data-action="stop"><i class="bi bi-stop-fill me-1"></i>Tắt</button>` : `<button class="btn btn-success" data-action="start"><i class="bi bi-play-fill me-1"></i>Bật</button>`}
          ${s.paused ? `<button class="btn btn-outline-success" data-action="resume"><i class="bi bi-play me-1"></i>Tiếp tục</button>` : `<button class="btn btn-outline-warning" data-action="pause" ${s.enabled ? '' : 'disabled'}><i class="bi bi-pause me-1"></i>Tạm dừng</button>`}
          <button class="btn btn-outline-primary" data-action="run-now" ${s.running ? 'disabled' : ''}><i class="bi bi-lightning me-1"></i>Chạy 1 chu kỳ ngay</button>
          <button class="btn btn-outline-secondary" data-action="plan-now"><i class="bi bi-calendar-plus me-1"></i>Lập kế hoạch hôm nay</button>
          <button class="btn btn-outline-secondary" data-action="publish-ready"><i class="bi bi-send me-1"></i>Xếp lịch video sẵn sàng</button>
          <button class="btn btn-outline-secondary" data-action="cleanup"><i class="bi bi-trash3 me-1"></i>Dọn dẹp</button>
          <span class="ms-auto small text-body-secondary">${s.current_step ? `<span class="spinner-border spinner-border-sm me-1"></span>${esc(s.current_step)} (${esc(s.current_trigger || '')})`
            : s.next_run_at ? 'Chu kỳ tiếp theo ' + fmt.ago(s.next_run_at) : ''} · đã chạy ${fmt.num(s.cycles_total)} chu kỳ</span>
        </div>`,
      });
      el.append(ctl);
      const plans = card({ title: `Kế hoạch ${s.today}`, icon: 'card-checklist', bodyCls: 'p-0',
        tools: `<button class="btn btn-sm btn-outline-primary" data-action="add-plan"><i class="bi bi-plus-lg me-1"></i>Thêm kế hoạch</button>` });
      el.append(plans);
      const body = plans.querySelector('.card-body');
      if (!s.plans.length) body.innerHTML = empty('Chưa có kế hoạch nào hôm nay');
      else dataTable(body, { rows: s.plans, pageSize: 50, search: s.plans.length > 10, columns: [
        { key: 'niche_id', label: 'Niche / kênh', render: (p) => `${esc(p.niche_id)}<span class="cell-sub">${esc(p.matrix_channel_id || 'cả niche')}</span>` },
        { key: 'topic', label: 'Chủ đề', render: (p) => `<span class="text-truncate-2">${esc(p.topic)}</span>` },
        { key: 'status', label: 'Trạng thái', render: (p) => badge(p.status) + (s.batches_running.includes(p.id) ? ' <span class="spinner-border spinner-border-sm"></span>' : '') },
        { key: 'jobs_completed', label: 'Job', render: (p) => `${p.jobs_completed}/${p.channel_count} xong${p.jobs_failed ? ` · <span class="text-danger">${p.jobs_failed} lỗi</span>` : ''}${p.jobs_published ? ` · ${p.jobs_published} đã đăng` : ''}` },
        { key: 'error_message', label: '', sort: false, render: (p) => (p.status === 'failed' ? `<button class="btn btn-sm btn-outline-primary" data-action="retry-plan" data-id="${p.id}">Chạy lại</button>` : '')
          + (p.error_message ? `<span class="cell-sub text-danger">${esc(fmt.short(p.error_message, 90))}</span>` : '') },
      ] });
      return s;
    }
    const run = async (url, msg, method = 'post') => { const r = await api[method](url); toast(r.message || msg, 'success'); refresh(); };
    const refresh = async () => { el.innerHTML = ''; await load(); App.refreshBadges(); };
    bindActions(el, {
      start: () => run('/api/autopilot/start', 'Đã bật'),
      async stop() { if (await confirm('Tắt Autopilot? Bước đang chạy sẽ dừng ở điểm an toàn.')) await run('/api/autopilot/stop', 'Đã tắt'); },
      pause: () => run('/api/autopilot/pause', 'Đã tạm dừng'),
      resume: () => run('/api/autopilot/resume', 'Đã tiếp tục'),
      'run-now': () => run('/api/autopilot/run-now', 'Đã bắt đầu chu kỳ'),
      async 'plan-now'() { const r = await api.post('/api/autopilot/plan-now'); toast(r.waiting_until_hour != null ? `Chưa tới giờ lập kế hoạch (${r.waiting_until_hour}h)` : `Đã lập ${r.created.length} kế hoạch${r.no_topic && r.no_topic.length ? `, ${r.no_topic.length} niche hết chủ đề` : ''}`, 'success'); refresh(); },
      async 'publish-ready'() {
        const dry = await api.post('/api/autopilot/publish-ready?dry_run=true');
        if (!dry.published) { toast(`Không có video nào xếp lịch được (${dry.blocked} bị chặn, ${dry.deferred} để sau)`, 'warning'); return; }
        if (!(await confirm(`${dry.published} video sẵn sàng đăng (${dry.blocked} bị chặn, ${dry.deferred} để sau). Tạo task đăng theo lịch từng tài khoản?`))) return;
        const r = await api.post('/api/autopilot/publish-ready');
        toast(`Đã xếp lịch ${r.published} video${r.errors ? `, ${r.errors} lỗi` : ''}`, r.errors ? 'warning' : 'success'); refresh();
      },
      async cleanup() { if (await confirm('Dọn video đã đăng và file tạm ngay bây giờ?')) await run('/api/autopilot/cleanup', 'Đã dọn'); },
      async 'retry-plan'(b) { await api.post(`/api/autopilot/plans/${b.dataset.id}/retry`); toast('Kế hoạch sẽ chạy lại ở chu kỳ sau', 'success'); refresh(); },
      async 'add-plan'() {
        const niches = await api.get('/api/matrix/niches').catch(() => ({ niches: [] }));
        const list = niches.niches || niches || [];
        const v = await formModal({ title: 'Thêm kế hoạch thủ công', fields: [
          { name: 'niche_id', label: 'Niche', type: 'select', required: true, options: list.map((n) => [n.niche_id || n.id, n.name || n.niche_id || n.id]) },
          { name: 'topic', label: 'Chủ đề', required: true }] });
        if (!v) return;
        await api.post('/api/autopilot/plans', v); toast('Đã thêm kế hoạch', 'success'); refresh();
      },
    });
    ctx.every(10000, refresh);
    return load();
  }

  async function runs(el) {
    const r = await api.get('/api/autopilot/runs', { limit: 100 });
    dataTable(el, { rows: r.runs, pageSize: 25, columns: [
      { key: 'id', label: '#' },
      { key: 'trigger', label: 'Kích hoạt' },
      { key: 'started_at', label: 'Bắt đầu', render: (x) => fmt.time(x.started_at) },
      { key: 'finished_at', label: 'Thời lượng', render: (x) => (x.finished_at ? fmt.dur(x.finished_at - x.started_at) : '<span class="spinner-border spinner-border-sm"></span>') },
      { key: 'status', label: 'Kết quả', render: (x) => badge(x.status) },
      { key: 'summary', label: 'Tóm tắt', sort: false, text: (x) => JSON.stringify(x.summary || {}) + (x.error || ''), render: (x) =>
        `<span class="small mono">${esc(fmt.short(Object.entries(x.summary || {}).map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' '), 160))}</span>`
        + (x.error ? `<span class="cell-sub text-danger">${esc(fmt.short(x.error, 160))}</span>` : '') },
    ] });
  }

  async function logs(el, ctx) {
    el.innerHTML = '<pre class="log-box" style="max-height:70vh"></pre>';
    const box = el.querySelector('pre');
    const load = async () => {
      const r = await api.get('/api/autopilot/logs', { limit: 500 });
      const atBottom = box.scrollTop + box.clientHeight >= box.scrollHeight - 20;
      box.textContent = [...r.logs].reverse().join('\n') || 'Chưa có nhật ký';
      if (atBottom) box.scrollTop = box.scrollHeight;
    };
    await load();
    box.scrollTop = box.scrollHeight;
    ctx.every(5000, load);
  }

  async function mapping(el) {
    const [m, chs] = await Promise.all([api.get('/api/autopilot/map'), api.get('/api/channels')]);
    const byId = Object.fromEntries(chs.channels.map((c) => [c.id, c]));
    el.innerHTML = '';
    const box = card({ title: `${m.map.length} kênh Matrix đã gán tài khoản TikTok`, icon: 'link-45deg',
      tools: `<button class="btn btn-sm btn-outline-primary" data-action="auto-link"><i class="bi bi-magic me-1"></i>Tự gán</button>` });
    el.append(box);
    dataTable(box.querySelector('.card-body'), { rows: m.map, pageSize: 50, columns: [
      { key: 'matrix_channel_id', label: 'Kênh Matrix', render: (x) => `<span class="mono">${esc(x.matrix_channel_id)}</span>` },
      { key: 'niche_id', label: 'Niche' },
      { key: 'tiktok_channel_id', label: 'Tài khoản TikTok', text: (x) => (byId[x.tiktok_channel_id] || {}).username, render: (x) => {
        const c = byId[x.tiktok_channel_id];
        return c ? `@${esc(c.username)}<span class="cell-sub">#${c.id}</span>` : `<span class="text-danger">#${x.tiktok_channel_id} (không còn)</span>`;
      } },
      { key: 'country', label: 'Nước / ngôn ngữ', render: (x) => `${esc(x.country)} · ${esc(x.language)}` },
      { key: 'assigned_at', label: 'Gán lúc', render: (x) => fmt.date(x.assigned_at) },
    ] });
    bindActions(el, {
      async 'auto-link'() {
        if (!(await confirm('Tự gán các kênh Matrix chưa có tài khoản TikTok theo nước/ngôn ngữ?'))) return;
        const r = await api.post('/api/autopilot/map/auto-link');
        toast(r.message, 'success');
        mapping(el);
      },
    });
  }

  async function config(el) {
    const r = await api.get('/api/autopilot/config');
    const keys = Object.keys({ ...r.defaults, ...r.config }).sort((a, b) => (CONFIG_HELP[b] ? 1 : 0) - (CONFIG_HELP[a] ? 1 : 0) || a.localeCompare(b));
    el.innerHTML = '';
    const box = card({ title: 'Cấu hình', icon: 'sliders', body: `<form class="row g-3">${keys.map((k) => `
      <div class="col-md-6 col-xl-4"><label class="form-label small mb-1 mono">${esc(k)}</label>
      <input class="form-control form-control-sm" name="${esc(k)}" value="${esc(r.config[k] ?? '')}" placeholder="${esc(r.defaults[k] ?? '')}">
      ${CONFIG_HELP[k] ? `<div class="form-text">${esc(CONFIG_HELP[k])}</div>` : ''}</div>`).join('')}</form>`,
      footer: `<button class="btn btn-primary" data-action="save"><i class="bi bi-save me-1"></i>Lưu thay đổi</button>` });
    el.append(box);
    const form = box.querySelector('form');
    bindActions(box, {
      async save() {
        const changed = {};
        for (const k of keys) { const v = form.elements[k].value; if (v !== String(r.config[k] ?? '')) changed[k] = v; }
        if (!Object.keys(changed).length) { toast('Không có gì thay đổi'); return; }
        await api.post('/api/autopilot/config', { config: changed });
        toast(`Đã lưu ${Object.keys(changed).length} mục`, 'success');
        config(el);
      },
    });
  }

  App.page({
    id: 'autopilot', group: 'publish', title: 'Autopilot', icon: 'robot',
    desc: 'Tự lập kế hoạch, sản xuất video Matrix và xếp lịch đăng',
    badge: async () => { const s = await api.get('/api/autopilot/status'); return { text: App.STATUS_LABEL[s.state] || s.state, tone: App.statusTone(s.state) }; },
    render(ctx) {
      return tabs(ctx.el, ctx, [
        { id: 'overview', label: 'Tổng quan', icon: 'speedometer', render: (el) => overview(el, ctx) },
        { id: 'runs', label: 'Lịch sử chạy', icon: 'clock-history', render: runs },
        { id: 'logs', label: 'Nhật ký', icon: 'journal-text', render: (el) => logs(el, ctx) },
        { id: 'map', label: 'Gán kênh', icon: 'link-45deg', render: mapping },
        { id: 'config', label: 'Cấu hình', icon: 'sliders', render: config },
      ]);
    },
  });
})();
