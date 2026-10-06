/* Mạng & VPN: kho config WireGuard theo nước, tunnel đang mở, server chết. TikTok API (Chocode): trạng thái, gọi thử, đồng bộ hồ sơ. */
(function () {
  const { api, esc, fmt, toast, card, dataTable, bindActions, modal, confirm, infoBox, badge, tabs } = App;

  App.page({
    id: 'vpn', group: 'accounts', title: 'Mạng & VPN', icon: 'shield-lock',
    desc: 'Mỗi tài khoản một IP: config WireGuard, tunnel đang mở, server chết',
    badge: async () => { const r = await api.get('/api/vpn/active-tunnels'); return r.count ? { text: r.count, tone: 'info' } : null; },
    async render(ctx) {
      const [stats, dead] = await Promise.all([api.get('/api/vpn/stats'), api.get('/api/vpn/dead-servers').catch(() => ({ count: 0, channels: [] }))]);
      ctx.el.innerHTML = `<div class="row">${Object.entries(stats.countries || {}).map(([code, c]) =>
        `<div class="col-lg-2 col-md-4 col-6">${infoBox({ label: c.name, value: fmt.num(c.count), icon: 'globe2', tone: 'primary' })}</div>`).join('')}</div>
        ${dead.count ? `<div class="alert alert-danger d-flex align-items-center gap-2"><i class="bi bi-heartbreak"></i><span class="flex-grow-1">${dead.count} kênh đang dùng server VPN không còn hoạt động.</span>
          <button class="btn btn-sm btn-danger" data-action="fix-dead">Đổi server</button></div>` : ''}`;
      const tun = card({ title: 'Tunnel đang mở', icon: 'diagram-3', tools: `<button class="btn btn-sm btn-outline-danger" data-action="stop-all"><i class="bi bi-x-octagon me-1"></i>Ngắt tất cả</button>` });
      ctx.el.append(tun);
      const t = dataTable(tun.querySelector('.card-body'), { rows: [], search: false, pageSize: 50, empty: 'Không có tunnel nào đang mở', columns: [
        { key: 'channel_id', label: 'Kênh / mục đích', render: (x) => `<span class="mono">${esc(x.channel_id)}</span>` },
        { key: 'location', label: 'Vị trí', render: (x) => `${esc(x.location || '')}<span class="cell-sub mono">${esc(x.conf_rel_path || '')}</span>` },
        { key: 'socks_port', label: 'Cổng SOCKS', render: (x) => `<span class="mono">${x.socks_port}</span>` },
        { key: 'pid', label: 'PID', render: (x) => `<span class="mono">${x.pid}</span>` },
      ] });
      if (dead.count) {
        const d = card({ title: 'Kênh dùng server chết', icon: 'heartbreak', tone: 'danger' });
        ctx.el.append(d);
        dataTable(d.querySelector('.card-body'), { rows: dead.channels, pageSize: 20, columns: [
          { key: 'username', label: 'Kênh', render: (x) => `@${esc(x.username)}<span class="cell-sub">#${x.channel_id} · ${esc(x.publisher)}</span>` },
          { key: 'country', label: 'Nước' },
          { key: 'vpn_config', label: 'Config', render: (x) => `<span class="mono small">${esc(x.vpn_config)}</span>` },
        ] });
      }
      const load = async () => t.setRows((await api.get('/api/vpn/active-tunnels')).tunnels);
      bindActions(ctx.el, {
        async 'stop-all'() { if (await confirm('Ngắt toàn bộ tunnel? Phiên đăng bài đang chạy sẽ mất mạng.', { danger: true, ok: 'Ngắt' })) { const r = await api.post('/api/vpn/stop-all'); toast(r.message, 'success'); load(); } },
        async 'fix-dead'() {
          if (!(await confirm(`Đổi ${dead.count} kênh sang server khác cùng nước?`))) return;
          const r = await api.post('/api/vpn/reassign-dead?apply=true');
          toast(`Đã đổi ${r.moved} kênh${r.failed ? `, ${r.failed} kênh không tìm được server` : ''}`, r.failed ? 'warning' : 'success');
          App.go('#/vpn?t=' + Date.now());
        },
      });
      await load();
      ctx.every(10000, load);
    },
  });

  // ------------------------------------------------------------ TikTok API (Chocode)
  async function apiStatus(el, ctx) {
    const s = await api.get('/api/tiktok-api/status');
    el.innerHTML = `<div class="row">
      <div class="col-md-4">${infoBox({ label: 'Khoá API', value: s.configured ? 'Đã cấu hình' : 'Chưa có', icon: 'key', tone: s.configured ? 'success' : 'danger' })}</div>
      <div class="col-md-8">${infoBox({ label: 'Gateway', value: s.base_url, icon: 'hdd-network', tone: 'info' })}</div></div>`;
    el.append(card({ title: 'Bảo vệ dữ liệu', icon: 'shield-check', body: `
      <div class="form-check form-switch"><input class="form-check-input" type="checkbox" id="blk" data-action="mock" ${s.block_mock ? 'checked' : ''}>
      <label class="form-check-label" for="blk">Chặn dữ liệu mẫu (gateway trả dữ liệu giả khi không lấy được thật)</label></div>
      <div class="form-text">Khi bật, mọi thao tác ghi vào DB hoặc tải file đều từ chối dữ liệu giả.</div>` }));
    el.append(card({ title: 'Đồng bộ hồ sơ kênh', icon: 'arrow-repeat', body: `<p class="small text-body-secondary">Cập nhật follower/like/video của mọi kênh qua API (không đụng doanh thu/BKT).</p>
      <button class="btn btn-outline-primary" data-action="sync"><i class="bi bi-arrow-repeat me-1"></i>Đồng bộ tất cả</button> <span data-sync class="small ms-2"></span>` }));
    const poll = async () => {
      const r = await api.get('/api/tiktok-api/channels/sync-status');
      const box = el.querySelector('[data-sync]');
      if (box) box.innerHTML = r.running ? `<span class="spinner-border spinner-border-sm"></span> ${r.done || 0}/${r.total || 0}` : r.finished_at ? `Xong ${fmt.ago(r.finished_at)}` : '';
    };
    bindActions(el, {
      async mock(b) { await api.put('/api/tiktok-api/config', { block_mock: b.checked }); toast('Đã lưu', 'success'); },
      async sync() { const r = await api.post('/api/tiktok-api/channels/sync-all'); toast(r.message); poll(); },
    });
    await poll();
    ctx.every(4000, poll);
  }

  async function apiConsole(el) {
    const eps = (await api.get('/api/tiktok-api/endpoints')).endpoints || [];
    el.innerHTML = '';
    const c = card({ title: 'Gọi thử endpoint', icon: 'terminal', body: `<form class="vstack gap-3">
      <div><label class="form-label">Endpoint</label><select class="form-select" name="path">${eps.map((e) => {
        const p = typeof e === 'string' ? e : e.path;
        return `<option value="${esc(p)}" data-params="${esc((e.params || []).join(','))}">[${esc(e.group || '')}] ${esc(e.label || p)} · ${esc(e.method || '')} ${esc(p)}${e.write ? ' (ghi)' : ''}</option>`;
      }).join('')}</select></div>
      <div><label class="form-label">Tham số (JSON)</label><textarea class="form-control mono" name="params" rows="3">{}</textarea></div>
      <div class="form-check"><input class="form-check-input" type="checkbox" name="confirm" id="cw"><label class="form-check-label" for="cw">Cho phép endpoint ghi (like/follow/comment…)</label></div>
      <button class="btn btn-primary align-self-start" data-action="call">Gọi</button>
      <pre class="log-box d-none" data-out></pre></form>` });
    el.append(c);
    const f0 = c.querySelector('form');
    const hint = () => { const o = f0.path.selectedOptions[0]; const ps = (o && o.dataset.params) ? o.dataset.params.split(',') : []; f0.params.value = JSON.stringify(Object.fromEntries(ps.map((k) => [k, ''])), null, 1); };
    f0.path.addEventListener('change', hint); hint();
    bindActions(c, {
      async call() {
        const f = c.querySelector('form');
        let params;
        try { params = JSON.parse(f.params.value || '{}'); } catch (_) { toast('Tham số không phải JSON hợp lệ', 'warning'); return; }
        const r = await api.post('/api/tiktok-api/call', { path: f.path.value, params, confirm_write: f.confirm.checked }, { strict: false });
        const out = c.querySelector('[data-out]');
        out.classList.remove('d-none');
        out.textContent = JSON.stringify(r, null, 2);
      },
    });
  }

  App.page({
    id: 'tiktok-api', group: 'accounts', title: 'TikTok API', icon: 'broadcast-pin',
    desc: 'Chocode REST API: hồ sơ, video, đồng bộ kênh',
    render(ctx) {
      return tabs(ctx.el, ctx, [
        { id: 'status', label: 'Trạng thái', icon: 'activity', render: (el) => apiStatus(el, ctx) },
        { id: 'console', label: 'Gọi thử', icon: 'terminal', render: apiConsole },
      ]);
    },
  });
})();
