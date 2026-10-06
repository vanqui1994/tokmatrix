/* Mạng & VPN: kho config WireGuard theo nước, tunnel đang mở, server chết. TikTok API (Chocode): trạng thái, gọi thử, đồng bộ hồ sơ. */
(function () {
  const { api, esc, fmt, toast, card, dataTable, bindActions, modal, confirm, infoBox, badge, tabs } = App;

  // ------------------------------------------------------------ Mạng & VPN (bố cục như bản cũ: NordVPN API)
  const FEATURED = ['US', 'GB', 'CA', 'FR', 'DE', 'AU', 'JP', 'NL', 'SE', 'KR', 'SG', 'VN'];
  const loadPill = (v) => {
    v = Number(v) || 0;
    const [tone, label] = v < 15 ? ['success', 'Siêu mượt'] : v <= 40 ? ['info', 'Tốt'] : ['warning', 'Trung bình'];
    return `<span class="vpn-load text-bg-${tone}"><b>${v}%</b> ${label}</span>`;
  };

  function diagResult(data) {
    const a = data.api || {}, t = data.tiktok || {}, m = data.match || {};
    const tone = !a.success ? 'danger' : m.is_match ? 'success' : 'warning';
    const ip = a.ip || data.ip || 'N/A';
    const row = (l, v) => `<div class="d-flex justify-content-between border-bottom py-1 gap-2"><span class="text-body-secondary">${l}</span><b class="text-end">${v}</b></div>`;
    return `<div class="alert alert-${tone} d-flex align-items-center gap-3"><i class="bi bi-${tone === 'success' ? 'check-circle-fill' : tone === 'warning' ? 'exclamation-triangle-fill' : 'x-octagon-fill'} fs-4"></i>
      <div class="flex-grow-1"><b>${esc(m.message || 'Kết quả kiểm định WireGuard')}</b><div class="small">Máy chủ <span class="mono">${esc(data.hostname || '')}</span> · SOCKS5 <b>:${esc(data.socks5_port || '—')}</b> · ${esc(data.city || a.city || '')}</div></div>
      <button class="btn btn-sm btn-outline-dark" data-action="copy" data-v="${esc(ip)}"><i class="bi bi-clipboard"></i> Copy IP</button></div>
      <div class="row g-3"><div class="col-md-6"><div class="card h-100"><div class="card-header"><h3 class="card-title"><i class="bi bi-globe2 me-2"></i>Exit IP thực tế</h3><div class="card-tools">${a.success ? '<span class="badge text-bg-success">Online</span>' : '<span class="badge text-bg-danger">Lỗi</span>'}</div></div><div class="card-body">
        ${row('Địa chỉ IP', `<span class="mono text-primary">${esc(ip)}</span>`)}${row('Quốc gia', `${esc(a.country || 'N/A')} (${esc(a.country_code || '—')})`)}${row('Thành phố', esc(a.city || 'N/A'))}${row('Nhà mạng', esc(a.isp || a.org || '—'))}${row('Độ trễ', `${a.latency_ms || data.time_ms || 0} ms`)}
        ${a.error ? `<div class="small text-danger mt-2">${esc(a.error)}</div>` : ''}</div></div></div>
      <div class="col-md-6"><div class="card h-100"><div class="card-header"><h3 class="card-title"><i class="bi bi-tiktok me-2"></i>TikTok nhận diện</h3><div class="card-tools">${t.success ? '<span class="badge text-bg-success">Đã xác thực</span>' : '<span class="badge text-bg-warning">Chưa kết nối</span>'}</div></div><div class="card-body">
        ${row('Vùng TikTok', `<span class="text-primary">${esc(t.region || 'N/A')}</span>`)}${row('Cụm CDN', esc(t.cluster || '—'))}${row('Qua chống bot', t.waf_passed ? '<span class="text-success">Có</span>' : '<span class="text-danger">Không</span>')}${row('HTTP', esc(t.status_code || '—'))}${row('Độ trễ', `${t.latency_ms || 0} ms`)}
        ${t.error ? `<div class="small text-danger mt-2">${esc(t.error)}</div>` : ''}</div></div></div></div>`;
  }

  App.page({
    id: 'vpn', group: 'accounts', title: 'Mạng & VPN', icon: 'shield-lock',
    desc: 'NordVPN REST API, WireGuard và kiểm định Exit IP — mỗi tài khoản một IP',
    badge: async () => { const r = await api.get('/api/vpn/active-tunnels'); return r.count ? { text: r.count, tone: 'info' } : null; },
    async render(ctx) {
      const st = { code: (ctx.params.country || 'DE').toUpperCase(), q: '', sq: '', countries: [], servers: [] };
      ctx.el.innerHTML = `
        <div class="vpn-hero mb-3"><div><span class="badge text-bg-success mb-2"><span class="spinner-grow spinner-grow-sm me-1"></span>NORDVPN OFFICIAL REST API</span>
          <h4 class="mb-1">Quản lý mạng & WireGuard VPN</h4><div class="small opacity-75">Hơn 8.000 máy chủ ở hơn 150 quốc gia · tự bốc server tải thấp · kiểm định Exit IP và vùng TikTok</div></div>
          <div class="d-flex flex-wrap gap-2"><button class="btn btn-light" data-action="assign"><i class="bi bi-lightning-charge me-1"></i>Gán VPN toàn bộ kênh</button>
            <button class="btn btn-danger" data-action="stop-all"><i class="bi bi-x-octagon me-1"></i>Ngắt toàn bộ tunnel</button>
            <button class="btn btn-outline-light" data-action="rescan"><i class="bi bi-arrow-repeat me-1"></i>Quét lại Nord API</button></div></div>
        <div class="row" data-stats></div><div data-dead></div>
        <div class="card mb-4"><div class="card-header"><h3 class="card-title"><i class="bi bi-globe-americas me-2"></i>Danh mục quốc gia (NordVPN)</h3>
          <div class="card-tools"><input type="search" class="form-control form-control-sm" style="width:260px" placeholder="Tìm quốc gia (VN, US, Đức, Japan…)" data-cq></div></div>
          <div class="card-body"><div class="d-flex flex-wrap gap-2 mb-3 align-items-center"><span class="small text-body-secondary me-1">Tiêu biểu:</span><span class="d-flex flex-wrap gap-2" data-featured></span></div>
          <div class="vpn-country-grid" data-countries>${App.spinner('Đang tải danh sách quốc gia…')}</div></div></div>
        <div class="card mb-4"><div class="card-header"><h3 class="card-title"><i class="bi bi-search me-2"></i>Phòng kiểm định mạng & Exit IP</h3><div class="card-tools"><span class="badge text-bg-info">WireGuard SOCKS5</span></div></div>
          <div class="card-body"><div class="row g-2 align-items-end"><div class="col-md-4"><label class="form-label">Quốc gia</label><select class="form-select" data-diag-country></select></div>
            <div class="col-md-5"><label class="form-label">Máy chủ</label><select class="form-select" data-diag-server><option value="OPTIMAL">Tự chọn máy chủ tải thấp nhất</option></select></div>
            <div class="col-md-3"><button class="btn btn-primary w-100" data-action="diag"><i class="bi bi-rocket-takeoff me-1"></i>Kiểm tra kết nối & Exit IP</button></div></div>
            <div class="mt-3" data-diag-result></div></div></div>
        <div class="card mb-4"><div class="card-header"><h3 class="card-title" data-srv-title>Máy chủ trực tiếp</h3><div class="card-tools d-flex gap-2 align-items-center"><span class="badge text-bg-secondary" data-srv-count>0 server</span>
          <input type="search" class="form-control form-control-sm" style="width:240px" placeholder="Tìm server (de1560, Berlin…)" data-sq></div></div>
          <div class="card-body p-0"><div class="px-3 py-2 small"><span class="badge text-bg-success">Tải &lt; 15%: siêu mượt</span> <span class="badge text-bg-info">15–40%: ổn định</span></div>
          <div class="table-responsive"><table class="table table-sm table-hover align-middle mb-0"><thead><tr><th>Nước</th><th>Máy chủ</th><th>Tải</th><th>Thành phố</th><th>Trạm (IP)</th><th class="text-end"></th></tr></thead><tbody data-servers></tbody></table></div></div></div>
        <div data-tunnels></div>`;
      const $ = (s) => ctx.el.querySelector(s);

      async function stats() {
        const [n, t, d] = await Promise.all([api.get('/api/vpn/nord/countries').catch(() => ({})), api.get('/api/vpn/active-tunnels'), api.get('/api/vpn/dead-servers').catch(() => ({ count: 0, channels: [] }))]);
        $('[data-stats]').innerHTML = [['Tổng server toàn cầu', fmt.num(n.total_servers || 0), 'hdd-network', 'info'], ['Quốc gia sẵn có', fmt.num(n.total_countries || 0), 'map', 'success'],
          ['Tunnel đang hoạt động', fmt.num(t.count), 'lightning-charge', 'primary'], ['Kênh dùng server chết', fmt.num(d.count), 'heartbreak', d.count ? 'danger' : 'secondary']]
          .map(([l, v, i, tn]) => `<div class="col-md-3 col-6">${infoBox({ label: l, value: v, icon: i, tone: tn })}</div>`).join('');
        $('[data-dead]').innerHTML = d.count ? `<div class="alert alert-danger d-flex align-items-center gap-2"><i class="bi bi-heartbreak"></i><span class="flex-grow-1">${d.count} kênh đang dùng config VPN không còn hoạt động: ${d.channels.slice(0, 6).map((c) => '@' + esc(c.username)).join(', ')}${d.count > 6 ? '…' : ''}</span>
          <button class="btn btn-sm btn-danger" data-action="fix-dead">Đổi server</button></div>` : '';
        const box = $('[data-tunnels]');
        box.innerHTML = '';
        const c = card({ title: `Tunnel WireGuard đang mở (${t.count})`, icon: 'diagram-3', bodyCls: 'p-0', body: t.tunnels.length ? `<table class="table table-sm mb-0"><thead><tr><th>Kênh / mục đích</th><th>Vị trí</th><th>SOCKS</th><th>PID</th></tr></thead><tbody>${t.tunnels.map((x) =>
          `<tr><td class="mono">${esc(x.channel_id)}</td><td>${esc(x.location || '')}<span class="cell-sub mono">${esc(x.conf_rel_path || '')}</span></td><td class="mono">${x.socks_port}</td><td class="mono">${x.pid}</td></tr>`).join('')}</tbody></table>` : App.empty('Không có tunnel nào đang mở') });
        box.append(c);
      }
      function renderCountries() {
        const q = st.q.toLowerCase();
        const list = q ? st.countries.filter((c) => `${c.name} ${c.code}`.toLowerCase().includes(q)) : st.countries;
        $('[data-countries]').innerHTML = list.map((c) => `<div class="vpn-country ${c.code === st.code ? 'active' : ''}" data-action="country" data-c="${c.code}" role="button">
          <div class="d-flex justify-content-between align-items-start"><span class="fs-3">${c.flag}</span><span class="badge text-bg-secondary">${fmt.num(c.server_count)}</span></div>
          <div class="fw-semibold mt-1">${esc(c.name)} <span class="text-body-secondary">(${c.code})</span></div>
          <div class="small text-body-secondary">${c.cities.length ? `${c.cities.length} thành phố` : 'Toàn quốc'} · WireGuard</div></div>`).join('') || App.empty('Không tìm thấy quốc gia');
        $('[data-featured]').innerHTML = FEATURED.map((code) => st.countries.find((c) => c.code === code)).filter(Boolean).map((c) =>
          `<button class="btn btn-sm ${c.code === st.code ? 'btn-primary' : 'btn-outline-secondary'}" data-action="country" data-c="${c.code}">${c.flag} ${esc(c.name)} <span class="badge text-bg-light">${fmt.num(c.server_count)}</span></button>`).join('');
        $('[data-diag-country]').innerHTML = st.countries.map((c) => `<option value="${c.code}" ${c.code === st.code ? 'selected' : ''}>${c.flag} ${esc(c.name)} (${c.code})</option>`).join('');
      }
      function renderServers() {
        const q = st.sq.toLowerCase();
        const list = q ? st.servers.filter((s) => `${s.name} ${s.hostname} ${s.city}`.toLowerCase().includes(q)) : st.servers;
        const c = st.countries.find((x) => x.code === st.code) || { flag: '', name: st.code };
        $('[data-srv-title]').innerHTML = `${c.flag} Máy chủ trực tiếp: ${esc(c.name)} (${st.code})`;
        $('[data-srv-count]').textContent = `${list.length} server`;
        $('[data-servers]').innerHTML = list.slice(0, 200).map((s) => `<tr><td>${s.flag} <small class="text-body-secondary">${s.country_code}</small></td>
          <td><b>${esc(s.name)}</b><span class="cell-sub mono">${esc(s.hostname)}</span></td><td>${loadPill(s.load)}</td><td>${esc(s.city || '—')}</td><td class="mono small">${esc(s.station || 'Auto')}</td>
          <td class="text-end"><button class="btn btn-sm btn-outline-primary" data-action="test" data-h="${esc(s.hostname)}"><i class="bi bi-rocket-takeoff"></i> Test live</button></td></tr>`).join('')
          || `<tr><td colspan="6">${App.empty('Không có máy chủ nào khớp')}</td></tr>`;
        $('[data-diag-server]').innerHTML = '<option value="OPTIMAL">Tự chọn máy chủ tải thấp nhất</option>' + st.servers.slice(0, 100).map((s) => `<option value="${esc(s.hostname)}">${esc(s.name)} · ${esc(s.city)} · tải ${s.load}%</option>`).join('');
      }
      async function loadCountries(force) {
        const r = await api.get('/api/vpn/nord/countries', { refresh: force ? 'true' : '' });
        st.countries = (r.countries || []).sort((a, b) => b.server_count - a.server_count);
        renderCountries();
      }
      async function loadServers(force) {
        $('[data-servers]').innerHTML = `<tr><td colspan="6">${App.spinner('Đang tải máy chủ từ NordVPN…')}</td></tr>`;
        const r = await api.get(`/api/vpn/nord/servers/${st.code}`, { limit: 300, refresh: force ? 'true' : '' });
        st.servers = (r.servers || []).sort((a, b) => (a.load || 0) - (b.load || 0));
        renderServers();
      }
      async function test(hostname) {
        const s = st.servers.find((x) => x.hostname === hostname);
        if (!s) { toast('Chưa có danh sách máy chủ', 'warning'); return; }
        const box = $('[data-diag-result]');
        box.innerHTML = App.spinner(`Đang mở tunnel WireGuard tới ${hostname} và kiểm tra Exit IP, vùng TikTok…`);
        box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        try {
          const r = await api.post('/api/vpn/nord/test', { hostname: s.hostname, public_key: s.public_key, country_code: s.country_code, city: s.city || '' });
          box.innerHTML = diagResult(r);
          stats();
        } catch (e) { box.innerHTML = `<div class="alert alert-danger"><b>Kiểm tra thất bại.</b> ${esc(e.message)}</div>`; }
      }
      $('[data-cq]').addEventListener('input', (e) => { st.q = e.target.value.trim(); renderCountries(); });
      $('[data-sq]').addEventListener('input', (e) => { st.sq = e.target.value.trim(); renderServers(); });
      $('[data-diag-country]').addEventListener('change', (e) => { st.code = e.target.value; ctx.setParams({ country: st.code }); renderCountries(); loadServers(); });
      bindActions(ctx.el, {
        async country(b) { st.code = b.dataset.c; ctx.setParams({ country: st.code }); renderCountries(); await loadServers(); $('[data-srv-title]').scrollIntoView({ behavior: 'smooth', block: 'center' }); },
        test: (b) => test(b.dataset.h),
        async diag() { const v = $('[data-diag-server]').value; await test(v === 'OPTIMAL' ? (st.servers[0] || {}).hostname : v); },
        copy(b) { navigator.clipboard.writeText(b.dataset.v).then(() => toast(`Đã copy ${b.dataset.v}`, 'success')); },
        async assign() { if (await confirm('Tự chọn server WireGuard cho mọi kênh chưa có VPN?')) { const r = await api.post('/api/channels/vpn/auto-assign-all'); toast(r.message, 'success'); stats(); } },
        async 'stop-all'() { if (await confirm('Ngắt toàn bộ tunnel? Phiên đăng bài đang chạy sẽ mất mạng.', { danger: true, ok: 'Ngắt' })) { const r = await api.post('/api/vpn/stop-all'); toast(r.message, 'success'); stats(); } },
        async rescan() { await Promise.all([loadCountries(true), loadServers(true)]); toast('Đã quét lại Nord API', 'success'); },
        async 'fix-dead'() {
          const r = await api.post('/api/vpn/reassign-dead?apply=true');
          toast(`Đã đổi ${r.moved} kênh${r.failed ? `, ${r.failed} kênh không tìm được server` : ''}`, r.failed ? 'warning' : 'success'); stats();
        },
      });
      await Promise.all([stats(), loadCountries(), loadServers()]);
      ctx.every(15000, stats);
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
