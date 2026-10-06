/* Kênh TikTok: danh sách, quét BKT/doanh thu, cookie, VPN, profile Chrome, video, lịch sử. */
(function () {
  const { api, esc, fmt, toast, card, dataTable, bindActions, modal, formModal, confirm, infoBox, empty, spinner, h } = App;

  const SHADOW = { NORMAL: ['success', 'Bình thường'], FLOP_0VIEW: ['warning', '0 view'], LOW_REACH: ['warning', 'Ít tiếp cận'], UNORIGINAL_RESTRICTED: ['danger', 'Không nguyên bản'], BANNED: ['danger', 'Bị cấm'] };

  function statusBadge(s) {
    const tone = s === 'BKT' || /Đã bật/i.test(s) ? 'success' : /DIE|LỖI|ERROR|Cookie/i.test(s) ? 'danger' : s === 'CHƯA CHECK' ? 'secondary' : 'warning';
    return `<span class="badge text-bg-${tone}">${esc(s)}</span>`;
  }

  async function showVideos(ch) {
    const body = h(`<div>${spinner('Đang lấy video của kênh…')}</div>`);
    modal({ title: `Video của @${ch.username || ch.id}`, body, size: 'xl' });
    try {
      const r = await api.get(`/api/channels/${ch.id}/videos`);
      const s = r.stats || {};
      body.innerHTML = `<div class="row g-2 mb-3">${[
        ['Video', s.total_videos, 'film'], ['Tổng view', s.total_views, 'eye'], ['Tổng like', s.total_likes, 'heart'],
      ].map(([l, v, i]) => `<div class="col-md-4">${infoBox({ label: l, value: fmt.num(v), icon: i })}</div>`).join('')}</div><div data-t></div>`;
      dataTable(body.querySelector('[data-t]'), {
        rows: r.videos || [], pageSize: 15,
        columns: [
          { key: 'desc', label: 'Video', render: (v) => `<div class="d-flex gap-2 align-items-center">${v.cover_url ? `<img src="${esc(v.cover_url)}" alt="" width="36" height="64" class="rounded object-fit-cover" loading="lazy" referrerpolicy="no-referrer">` : ''}
            <span class="text-truncate-2">${esc(v.desc || v.video_id)}<span class="cell-sub">${fmt.date(v.create_time)} · ${fmt.dur(v.duration)}</span></span></div>` },
          { key: 'view_count', label: 'View', cls: 'text-end', render: (v) => fmt.num(v.view_count) },
          { key: 'like_count', label: 'Like', cls: 'text-end', render: (v) => fmt.num(v.like_count) },
          { key: 'shadowban_status', label: 'Phân phối', render: (v) => { const [t, l] = SHADOW[v.shadowban_status] || ['secondary', v.shadowban_status || '—']; return `<span class="badge text-bg-${t}">${esc(l)}</span>`; } },
          { key: 'is_original', label: 'Nguyên bản', render: (v) => (v.is_original ? '<i class="bi bi-check-lg text-success"></i>' : '<i class="bi bi-x-lg text-danger"></i>') },
        ],
      });
    } catch (e) { body.innerHTML = `<div class="alert alert-danger">${esc(e.message)}</div>`; }
  }

  async function showHistory(ch) {
    const body = h(`<div>${spinner()}</div>`);
    modal({ title: `Lịch sử @${ch.username || ch.id}`, body, size: 'lg' });
    try {
      const r = await api.get(`/api/channels/${ch.id}/history`, { days: 30 });
      const pts = r.points || [];
      const d = r.growth || {};
      body.innerHTML = `<div class="row g-2 mb-3">
          <div class="col-4">${infoBox({ label: 'Doanh thu 30 ngày', value: fmt.money(d.earned, ch.currency), icon: 'cash-coin', tone: 'success' })}</div>
          <div class="col-4">${infoBox({ label: 'Follower tăng', value: fmt.num(d.follower), icon: 'person-plus' })}</div>
          <div class="col-4">${infoBox({ label: 'View tăng', value: fmt.num(d.view), icon: 'eye', tone: 'info' })}</div></div>
        ${pts.length ? '<div style="height:260px"><canvas></canvas></div>' : empty('Chưa có lần quét nào')}`;
      const c = body.querySelector('canvas');
      if (c) new Chart(c, { type: 'line', data: { labels: pts.map((p) => p.captured_at), datasets: [
        { label: 'Doanh thu', data: pts.map((p) => p.earned), tension: .3 },
        { label: 'Follower', data: pts.map((p) => p.follower_count), tension: .3, yAxisID: 'y1' }] },
      options: { maintainAspectRatio: false, scales: { y1: { position: 'right', grid: { drawOnChartArea: false } } } } });
    } catch (e) { body.innerHTML = `<div class="alert alert-danger">${esc(e.message)}</div>`; }
  }

  async function assignVpn(ch, reload) {
    const country = (ch.original_country || ch.country || 'DE').toUpperCase();
    const list = await api.get(`/api/vpn/catalog/${country}`);
    if (!list.length) { toast(`Không có config VPN nào cho ${country}`, 'warning'); return; }
    const v = await formModal({
      title: `Gán VPN cho @${ch.username || ch.id}`, submit: 'Gán',
      fields: [{ name: 'vpn_config', label: `Server ${country} (${list.length})`, type: 'select', value: ch.vpn_config,
        options: list.map((x) => [x.rel_path, `${x.label} (${x.server})`]) }],
    });
    if (!v) return;
    const r = await api.post(`/api/channels/${ch.id}/vpn/assign`, v);
    toast(`Đã gán ${r.vpn_location || v.vpn_config}`, 'success');
    reload();
  }

  App.page({
    id: 'channels', group: 'accounts', title: 'Kênh TikTok', icon: 'person-video3',
    desc: 'Tài khoản, doanh thu, cookie, VPN và profile trình duyệt',
    badge: async () => { const r = await api.get('/api/scan-status'); return r.is_scanning ? { text: `${r.completed}/${r.total}`, tone: 'primary' } : null; },
    async render(ctx) {
      const pub = ctx.params.pub || '';
      ctx.el.innerHTML = `<div class="row" data-stats></div><div data-scan></div><div data-list></div>`;
      const list = card({
        title: 'Danh sách kênh', icon: 'list-ul',
        tools: `<div class="btn-group btn-group-sm">
          <button class="btn btn-primary" data-action="import"><i class="bi bi-upload me-1"></i>Nhập cookie</button>
          <button class="btn btn-outline-primary" data-action="check-all"><i class="bi bi-arrow-repeat me-1"></i>Quét tất cả</button>
          <button class="btn btn-outline-primary" data-action="scan-videos"><i class="bi bi-camera-video me-1"></i>Quét video (API)</button>
          <button class="btn btn-outline-secondary dropdown-toggle" data-bs-toggle="dropdown">Khác</button>
          <ul class="dropdown-menu dropdown-menu-end">
            <li><a class="dropdown-item" href="#" data-action="vpn-auto"><i class="bi bi-shield-lock me-2"></i>Tự gán VPN cho mọi kênh</a></li>
            <li><a class="dropdown-item" href="#" data-action="vpn-dead"><i class="bi bi-heartbreak me-2"></i>Đổi VPN chết</a></li>
            <li><a class="dropdown-item" href="#" data-action="build-profiles"><i class="bi bi-browser-chrome me-2"></i>Dựng profile còn thiếu</a></li>
          </ul></div>`,
      });
      ctx.el.querySelector('[data-list]').append(list);

      let table;
      async function load() {
        const r = await api.get('/api/channels');
        const s = r.stats || {};
        ctx.el.querySelector('[data-stats]').innerHTML = [
          ['Tài khoản', fmt.num(s.total_accounts), 'people', 'primary'],
          ['Đã bật BKT', fmt.num(s.total_bkt), 'patch-check', 'success'],
          ['Follower', fmt.num(s.total_followers), 'person-heart', 'info'],
          ['Tổng view', fmt.num(s.total_views), 'eye', 'warning'],
        ].map(([l, v, i, t]) => `<div class="col-md-3 col-6">${infoBox({ label: l, value: v, icon: i, tone: t })}</div>`).join('');
        const pubs = [...new Set(r.channels.map((c) => c.publisher).filter(Boolean))].sort();
        const rows = pub ? r.channels.filter((c) => c.publisher === pub) : r.channels;
        if (!table) {
          table = dataTable(list.querySelector('.card-body'), {
            rows, rowKey: 'id', pageSize: 30,
            toolbar: `<select class="form-select form-select-sm" data-pub style="width:auto"><option value="">Mọi nguồn</option>${pubs.map((p) => `<option ${p === pub ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select>`,
            columns: [
              { key: 'username', label: 'Kênh', text: (c) => `${c.username} ${c.nickname} ${c.note} ${c.country} ${c.publisher}`, render: (c) =>
                `<a href="https://www.tiktok.com/@${esc(c.username)}" target="_blank" rel="noopener" class="fw-semibold">@${esc(c.username || '—')}</a>
                <span class="cell-sub">#${c.id} · ${esc(c.nickname)} ${c.note ? '· ' + esc(c.note) : ''}</span>` },
              { key: 'country', label: 'Nước', render: (c) => `${esc(c.original_country || c.country)}${c.publisher ? `<span class="cell-sub">${esc(c.publisher)}</span>` : ''}` },
              { key: 'status', label: 'BKT', render: (c) => statusBadge(c.status) + (c.kyc && c.kyc !== 'No' ? '<span class="cell-sub">KYC</span>' : '') },
              { key: 'earned', label: 'Doanh thu', cls: 'text-end', render: (c) => `${fmt.money(c.earned)} <span class="cell-sub">số dư ${fmt.money(c.balance)} ${esc(c.currency)}</span>` },
              { key: 'follower_count', label: 'Follower', cls: 'text-end', render: (c) => `${fmt.num(c.follower_count)}<span class="cell-sub">${fmt.num(c.video_count)} video</span>` },
              { key: 'vpn_location', label: 'VPN', render: (c) => (c.vpn_config ? `<span class="small">${esc(c.vpn_location || c.vpn_config.split('/').pop())}</span>` : '<span class="text-danger small">chưa gán</span>') },
              { key: 'session_state', label: 'Phiên', render: (c) => (c.session_state ? `<span class="badge text-bg-${c.session_state === 'OK' ? 'success' : 'warning'}">${esc(c.session_state)}</span>` : '—') + `<span class="cell-sub">${fmt.ago(c.last_checked)}</span>` },
              { key: 'id', label: '', cls: 'text-end', sort: false, render: (c) => `
                <div class="btn-group btn-group-sm">
                  <button class="btn btn-outline-primary" data-action="check" data-id="${c.id}" title="Quét lại kênh"><i class="bi bi-arrow-repeat"></i></button>
                  <button class="btn btn-outline-secondary" data-action="videos" data-id="${c.id}" title="Video"><i class="bi bi-collection-play"></i></button>
                  <button class="btn btn-outline-secondary dropdown-toggle" data-bs-toggle="dropdown" aria-label="Thao tác khác"></button>
                  <ul class="dropdown-menu dropdown-menu-end">
                    <li><a class="dropdown-item" href="#" data-action="history" data-id="${c.id}"><i class="bi bi-graph-up me-2"></i>Lịch sử</a></li>
                    <li><a class="dropdown-item" href="#" data-action="note" data-id="${c.id}"><i class="bi bi-pencil me-2"></i>Ghi chú</a></li>
                    <li><a class="dropdown-item" href="#" data-action="vpn" data-id="${c.id}"><i class="bi bi-shield-lock me-2"></i>Gán VPN</a></li>
                    <li><a class="dropdown-item" href="#" data-action="vpn-test" data-id="${c.id}"><i class="bi bi-wifi me-2"></i>Kiểm tra VPN</a></li>
                    <li><hr class="dropdown-divider"></li>
                    <li><a class="dropdown-item" href="#" data-action="launch" data-id="${c.id}"><i class="bi bi-browser-chrome me-2"></i>Mở profile</a></li>
                    <li><a class="dropdown-item" href="#" data-action="login" data-id="${c.id}"><i class="bi bi-box-arrow-in-right me-2"></i>Mở trang đăng nhập</a></li>
                    <li><a class="dropdown-item" href="#" data-action="save-session" data-id="${c.id}"><i class="bi bi-save me-2"></i>Lưu phiên đăng nhập</a></li>
                    <li><a class="dropdown-item" href="#" data-action="cookie" data-id="${c.id}"><i class="bi bi-key me-2"></i>Xem cookie</a></li>
                    <li><hr class="dropdown-divider"></li>
                    <li><a class="dropdown-item text-danger" href="#" data-action="delete" data-id="${c.id}"><i class="bi bi-trash me-2"></i>Xoá kênh</a></li>
                  </ul></div>` },
            ],
          });
          table.toolbar.querySelector('[data-pub]').addEventListener('change', (e) => { location.hash = `#/channels${e.target.value ? '?pub=' + encodeURIComponent(e.target.value) : ''}`; });
        } else table.setRows(rows);
      }
      const byId = (el) => table.rows.find((c) => c.id === Number(el.dataset.id));

      async function pollScan() {
        const s = await api.get('/api/scan-status');
        const box = ctx.el.querySelector('[data-scan]');
        box.innerHTML = s.is_scanning ? `<div class="alert alert-info d-flex align-items-center gap-3">
          <div class="spinner-border spinner-border-sm"></div><div class="flex-grow-1">Đang quét ${fmt.num(s.completed)}/${fmt.num(s.total)} — ${esc(s.current_account || '')}
          <div class="progress mt-1" style="height:4px"><div class="progress-bar" style="width:${s.total ? (100 * s.completed / s.total) : 0}%"></div></div></div>
          ${s.errors ? `<span class="badge text-bg-danger">${s.errors} lỗi</span>` : ''}</div>` : '';
        return s.is_scanning;
      }

      bindActions(ctx.el, {
        async import() {
          const v = await formModal({ title: 'Nhập kênh từ cookie', submit: 'Nhập', size: 'lg', fields: [
            { name: 'lines', label: 'Mỗi dòng một kênh: cookie hoặc cookie | ghi chú', type: 'textarea', rows: 10, required: true },
            { name: 'publisher', label: 'Nguồn (publisher)', placeholder: 'pub1' }] });
          if (!v) return;
          const r = await api.post('/api/channels/import', v);
          toast(r.message, 'success'); load();
        },
        async 'check-all'() { const r = await api.post('/api/channels/check-all'); toast(r.message); pollScan(); },
        async 'scan-videos'() { const r = await api.post('/api/channels/scan-videos-api'); toast(r.message); },
        async 'vpn-auto'() { if (!(await confirm('Tự chọn server WireGuard cho mọi kênh chưa có VPN?'))) return; const r = await api.post('/api/channels/vpn/auto-assign-all'); toast(r.message, 'success'); load(); },
        async 'vpn-dead'() {
          const preview = await api.post('/api/vpn/reassign-dead?apply=false');
          const n = preview.dead_found || 0;
          if (!n) { toast('Không có kênh nào đang dùng server chết', 'success'); return; }
          if (!(await confirm(`${n} kênh đang dùng server VPN chết. Đổi sang server khác cùng nước?`))) return;
          const r = await api.post('/api/vpn/reassign-dead?apply=true');
          toast(`Đã đổi ${r.moved} kênh${r.failed ? `, ${r.failed} kênh không tìm được server` : ''}`, r.failed ? 'warning' : 'success'); load();
        },
        async 'build-profiles'() { const r = await api.post('/api/channels/profiles/build', { only_missing: true, inject_cookie: true }); toast(r.message); },
        async check(el) {
          const c = byId(el);
          toast(`Đang quét @${c.username}…`);
          await api.post(`/api/channels/check-single/${c.id}`);
          await api.post(`/api/channels/${c.id}/scan-api`).catch(() => {});
          toast(`Đã quét xong @${c.username}`, 'success'); load();
        },
        videos: (el) => showVideos(byId(el)),
        history: (el) => showHistory(byId(el)),
        async note(el) {
          const c = byId(el);
          const v = await formModal({ title: 'Ghi chú kênh', fields: [{ name: 'note', label: 'Ghi chú', value: c.note }] });
          if (!v) return;
          await api.put(`/api/channels/${c.id}`, v); toast('Đã lưu', 'success'); load();
        },
        vpn: (el) => assignVpn(byId(el), load),
        async 'vpn-test'(el) {
          const r = await api.get(`/api/channels/${byId(el).id}/vpn/check-full`);
          modal({ title: 'Kết quả kiểm tra VPN', body: `<pre class="log-box">${esc(JSON.stringify(r, null, 2))}</pre>`, size: 'lg' });
        },
        async launch(el) {
          const r = await api.post(`/api/channels/${byId(el).id}/profile/launch`);
          toast(r.message || 'Đã mở profile', 'success');
          if (r.remote_view_url) window.open(r.remote_view_url, '_blank', 'noopener');
        },
        async login(el) {
          const r = await api.post(`/api/channels/${byId(el).id}/profile/open-login`);
          toast(r.message || 'Đã mở trang đăng nhập', 'success');
          if (r.remote_view_url) window.open(r.remote_view_url, '_blank', 'noopener');
        },
        async 'save-session'(el) { await api.post(`/api/channels/${byId(el).id}/profile/save-session`); toast('Đã lưu phiên', 'success'); load(); },
        async cookie(el) {
          const r = await api.post(`/api/channels/${byId(el).id}/cookie`);
          modal({ title: 'Cookie', body: `<textarea class="form-control mono" rows="8" readonly>${esc(r.cookie)}</textarea>` });
        },
        async delete(el) {
          const c = byId(el);
          if (!(await confirm(`Xoá kênh @${c.username}? Task đăng của kênh này sẽ không chạy được.`, { danger: true, ok: 'Xoá' }))) return;
          await api.del(`/api/channels/${c.id}`); toast('Đã xoá', 'success'); load();
        },
      });

      await load();
      if (await pollScan()) ctx.every(3000, async () => { if (!(await pollScan())) load(); });
      else ctx.every(5000, pollScan);
    },
  });
})();
