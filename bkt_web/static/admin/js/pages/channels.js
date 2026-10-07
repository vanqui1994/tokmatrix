/* Kênh TikTok: danh sách, quét BKT/doanh thu, cookie, VPN, profile Chrome, video, lịch sử. */
(function () {
  const { api, esc, fmt, toast, card, dataTable, bindActions, modal, formModal, confirm, infoBox, empty, spinner, h } = App;

  const SHADOW = { NORMAL: ['success', 'Bình thường'], FLOP_0VIEW: ['warning', '0 view'], LOW_REACH: ['warning', 'Ít tiếp cận'], UNORIGINAL_RESTRICTED: ['danger', 'Không nguyên bản'], BANNED: ['danger', 'Bị cấm'] };

  function statusBadge(s) {
    const tone = s === 'BKT' || /Đã bật/i.test(s) ? 'success' : /DIE|LỖI|ERROR|Cookie/i.test(s) ? 'danger' : s === 'CHƯA CHECK' ? 'secondary' : 'warning';
    return `<span class="badge text-bg-${tone}">${esc(s)}</span>`;
  }

  // Thể loại / việc của acc: engine Matrix (+ skin) hoặc dòng remake; mỗi engine một màu cố định.
  const ENGINE_COLORS = { mystery: '#6f42c1', newspaper: '#795548', vox: '#d63384', folklore: '#8d6e63', kinetic: '#fd7e14', science: '#0d6efd',
    tierlist: '#e0a800', survival: '#dc3545', chalk: '#20806a', wildlife: '#198754', compare: '#0dcaf0', vector: '#6610f2' };
  const REMAKE = { youtube: ['Remake YouTube', '#c4302b', 'youtube'], kuaishou_muse: ['Kuaishou → Muse', '#ff5000', 'film'], kuaishou_vector: ['Kuaishou → vector', '#ff8a00', 'vector-pen'] };
  const roleKey = (r) => (r.kind === 'matrix' ? r.engine || 'matrix' : r.kind);
  function roleBadges(list) {
    if (!list || !list.length) return '<span class="badge text-bg-light border text-secondary">Chưa giao việc</span>';
    return list.map((r) => {
      if (r.kind === 'matrix') {
        const skin = r.variant ? `${r.variant.split('/')[1]} · ${r.layout}` : 'không skin';
        return `<span class="badge" style="background:${ENGINE_COLORS[r.engine] || '#6c757d'}" title="Matrix ${esc(r.matrix_channel)} · ${esc(r.niche)} · ${esc(skin)}">${esc(r.engine || 'matrix')}</span>`
          + `<span class="cell-sub">${esc(skin)}</span>`;
      }
      const [label, color, icon] = REMAKE[r.kind] || [r.kind, '#6c757d', 'tag'];
      return `<span class="badge${r.enabled === false ? ' opacity-50' : ''}" style="background:${color}" title="${esc(r.source || '')}"><i class="bi bi-${icon} me-1"></i>${esc(label)}${r.translate ? ' · dịch ' + esc(r.translate) : ''}</span>`;
    }).join(' ');
  }

  async function showVideos(ch) {
    const body = h(`<div>${spinner('Đang lấy video của kênh…')}</div>`);
    modal({ title: `Video của @${ch.username || ch.id}`, body, size: 'xl' });
    try {
      const r = await api.get(`/api/channels/${ch.id}/videos`);
      const s = r.health_summary || r.stats || {};
      body.innerHTML = `<div class="row g-2 mb-3">${[
        ['Video', s.total_videos, 'film'], ['Tổng view', s.total_views, 'eye'], ['Tổng like', s.total_likes, 'heart'],
      ].map(([l, v, i]) => `<div class="col-md-4">${infoBox({ label: l, value: fmt.num(v), icon: i })}</div>`).join('')}</div>
        <div class="d-flex flex-wrap gap-2 mb-3"><button type="button" class="btn btn-outline-primary btn-sm" data-duplicates>So trùng cover (tối đa 60)</button>
        <span class="small text-body-secondary">Phân phối hiện tại là ước tính; kiểm tra từng video để xem indexEnabled và NFF thật.</span></div><div data-t></div>`;
      const videoTable = dataTable(body.querySelector('[data-t]'), {
        rows: r.videos || [], pageSize: 15,
        columns: [
          { key: 'desc', label: 'Video', render: (v) => `<div class="d-flex gap-2 align-items-center">${v.cover_url ? `<img src="${esc(v.cover_url)}" alt="" width="36" height="64" class="rounded object-fit-cover" loading="lazy" referrerpolicy="no-referrer">` : ''}
            <span class="text-truncate-2">${esc(v.desc || v.video_id)}<span class="cell-sub">${fmt.date(v.create_time)} · ${fmt.dur(v.duration)}</span></span></div>` },
          { key: 'view_count', label: 'View', cls: 'text-end', render: (v) => fmt.num(v.view_count) },
          { key: 'like_count', label: 'Like', cls: 'text-end', render: (v) => fmt.num(v.like_count) },
          { key: 'shadowban_status', label: 'Phân phối (ước tính)', render: (v) => { const [t, l] = SHADOW[v.shadowban_status] || ['secondary', v.shadowban_status || '—']; return `<span class="badge text-bg-${t}">${esc(l)}</span>`; } },
          { key: 'is_original', label: 'Phạt reup', render: (v) => (v.is_original ? 'Chưa có cờ' : 'Có cờ') },
          { key: 'video_id', label: 'Kiểm tra', sort: false, render: (v) => `<div class="d-flex flex-wrap gap-1">
            <button type="button" class="btn btn-outline-primary btn-sm" data-video-action="verify" data-video-id="${esc(v.video_id)}">NFF / index</button>
            <button type="button" class="btn btn-outline-secondary btn-sm" data-video-action="insight" data-video-id="${esc(v.video_id)}">Insight</button>
            <button type="button" class="btn btn-outline-danger btn-sm" data-video-action="delete" data-video-id="${esc(v.video_id)}">Xóa</button></div>` },
        ],
      });
      const detail = document.createElement('div');
      detail.className = 'mt-3';
      detail.setAttribute('aria-live', 'polite');
      body.append(detail);
      body.addEventListener('click', async (event) => {
        const button = event.target.closest('[data-duplicates], [data-video-action]');
        if (!button || !body.contains(button)) return;
        button.disabled = true;
        detail.innerHTML = spinner('Đang kiểm tra qua VPN của kênh…');
        try {
          if (button.hasAttribute('data-duplicates')) {
            const result = await api.post(`/api/channels/${ch.id}/videos/duplicates`);
            detail.innerHTML = `<div class="alert alert-info">Đã so ${result.checked} cover, bỏ qua ${result.skipped}. dHash chỉ so ảnh cover, không phải phán quyết trùng của TikTok.</div>
              ${result.pairs.length ? `<ul class="list-group">${result.pairs.map((p) => `<li class="list-group-item">${esc(p.duplicate_video_id)} giống ${esc(p.original_video_id)} (lệch ${p.distance}/64)</li>`).join('')}</ul>` : `<p class="small">${result.checked ? 'Không phát hiện cover giống nhau trong mẫu đã tải.' : 'Chưa tải được cover nào; không thể kết luận trùng lặp.'}</p>`}`;
            return;
          }
          const id = button.dataset.videoId;
          const action = button.dataset.videoAction;
          if (action === 'delete') {
            detail.innerHTML = `<div class="alert alert-danger">Xóa video ${esc(id)} khỏi TikTok? Không thể hoàn tác. <button type="button" class="btn btn-danger btn-sm ms-2" data-confirm-delete="${esc(id)}">Xác nhận xóa</button></div>`;
            return;
          }
          const response = action === 'verify'
            ? await api.get(`/api/channels/${ch.id}/videos/${id}/verify`)
            : await api.get(`/api/channels/${ch.id}/tiktok-data`, { section: 'video', video_id: id });
          if (action === 'verify') {
            const p = response.public || {}; const o = response.official || {};
            detail.innerHTML = `<div class="alert ${['deindexed', 'restricted', 'removed'].includes(p.verdict) || o.status === 'ineligible' ? 'alert-warning' : 'alert-info'}">
              Video ${esc(id)} · indexEnabled: ${p.index_enabled == null ? 'chưa rõ' : esc(String(p.index_enabled))}
              (${esc(p.reason || 'Không đọc được trang công khai')}) · NFF Studio: ${esc(o.status || 'unknown')}
              ${o.reason ? `· ${esc(o.reason)}` : ''}${o.reason_codes?.length ? ` · Mã lý do: ${esc(o.reason_codes.join(', '))}` : ''}</div>`;
          } else detail.innerHTML = `<h6>Insight video ${esc(id)}</h6><pre class="log-box">${esc(JSON.stringify(response.data, null, 2))}</pre>`;
        } catch (e) { detail.innerHTML = `<div class="alert alert-danger">${esc(e.message)}</div>`; }
        finally { button.disabled = false; }
      });
      body.addEventListener('click', async (event) => {
        const button = event.target.closest('[data-confirm-delete]');
        if (!button || !body.contains(button)) return;
        const id = button.dataset.confirmDelete;
        button.disabled = true;
        detail.innerHTML = spinner('Đang chờ TikTok xác nhận xóa…');
        try {
          const response = await api.post(`/api/channels/${ch.id}/videos/${id}/delete`, { confirm: true });
          if (response.cached_row_removed) videoTable.setRows((videoTable.rows || []).filter((v) => v.video_id !== id));
          detail.innerHTML = `<div class="alert ${response.cached_row_removed ? 'alert-success' : 'alert-warning'}">TikTok đã xác nhận xóa video ${esc(id)}.${response.cached_row_removed ? ' Mở lại danh sách để cập nhật tổng chỉ số.' : ' Không cập nhật được bản ghi local; hãy quét lại kênh.'}</div>`;
        } catch (e) { detail.innerHTML = `<div class="alert alert-danger">${esc(e.message)}. Video chưa bị xóa khỏi dữ liệu local.</div>`; }
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
      options: { maintainAspectRatio: false, scales: { y: { beginAtZero: true }, y1: { position: 'right', beginAtZero: true, grid: { drawOnChartArea: false } } } } });
    } catch (e) { body.innerHTML = `<div class="alert alert-danger">${esc(e.message)}</div>`; }
  }

  function showStudio(ch) {
    const body = h(`<div><div class="d-flex flex-wrap gap-2 mb-3" role="group" aria-label="Nguồn dữ liệu TikTok">
      ${[['wallet', 'Ví'], ['rewards', 'Creator Rewards'], ['analytics', 'Analytics 7 ngày'], ['programs', 'Chương trình']]
        .map(([key, label]) => `<button type="button" class="btn btn-outline-primary btn-sm" data-section="${key}">${label}</button>`).join('')}</div>
      <div data-result aria-live="polite" class="small text-body-secondary">Chọn mục để đọc dữ liệu trực tiếp qua VPN của kênh. Không thay số liệu cũ khi thất bại.</div></div>`);
    modal({ title: `TikTok Studio @${ch.username || ch.id}`, body, size: 'lg' });
    body.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-section]');
      if (!button || !body.contains(button)) return;
      const result = body.querySelector('[data-result]');
      button.disabled = true;
      result.innerHTML = spinner('Đang đọc TikTok Studio…');
      try {
        const section = button.dataset.section;
        const response = await api.get(`/api/channels/${ch.id}/tiktok-data`, { section });
        const data = response.data || {};
        const money = data.balance || {};
        result.innerHTML = section === 'wallet'
          ? `<div class="row g-2 mb-3"><div class="col-sm-6">${infoBox({ label: 'Số dư ví', value: money.amount == null ? '—' : `${money.amount} ${money.code || ''}`, icon: 'wallet2' })}</div>
            <div class="col-sm-6">${infoBox({ label: 'Diamond', value: data.diamond == null ? '—' : fmt.num(data.diamond), icon: 'gem' })}</div></div>
            <div class="small">KYC: ${esc(data.kyc_status ?? 'chưa rõ')} · Phương thức rút: ${esc(data.pi_bind_status ?? 'chưa rõ')}. Chưa hỗ trợ lịch sử giao dịch.</div>`
          : `<h6>${esc(button.textContent)}</h6><pre class="log-box">${esc(JSON.stringify(data, null, 2))}</pre>`;
      } catch (e) { result.innerHTML = `<div class="alert alert-danger">${esc(e.message)}</div>`; }
      finally { button.disabled = false; }
    });
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
      const kind = ctx.params.kind || '';
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
        const [r, rr] = await Promise.all([api.get('/api/channels'), api.get('/api/channels/roles').catch(() => ({ roles: {} }))]);
        for (const c of r.channels) c.roles = rr.roles[String(c.id)] || [];
        const s = r.stats || {};
        ctx.el.querySelector('[data-stats]').innerHTML = [
          ['Tài khoản', fmt.num(s.total_accounts), 'people', 'primary'],
          ['Đã bật BKT', fmt.num(s.total_bkt), 'patch-check', 'success'],
          ['Follower', fmt.num(s.total_followers), 'person-heart', 'info'],
          ['Tổng view', fmt.num(s.total_views), 'eye', 'warning'],
        ].map(([l, v, i, t]) => `<div class="col-md-3 col-6">${infoBox({ label: l, value: v, icon: i, tone: t })}</div>`).join('');
        const pubs = [...new Set(r.channels.map((c) => c.publisher).filter(Boolean))].sort();
        const kinds = [...new Set(r.channels.flatMap((c) => (c.roles.length ? c.roles.map(roleKey) : ['none'])))].sort();
        const rows = r.channels.filter((c) => (!pub || c.publisher === pub)
          && (!kind || (kind === 'none' ? !c.roles.length : c.roles.some((x) => roleKey(x) === kind))));
        if (!table) {
          table = dataTable(list.querySelector('.card-body'), {
            rows, rowKey: 'id', pageSize: 30,
            toolbar: `<div class="d-flex gap-2"><select class="form-select form-select-sm" data-pub style="width:auto"><option value="">Mọi nguồn</option>${pubs.map((p) => `<option ${p === pub ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select>`
              + `<select class="form-select form-select-sm" data-kind style="width:auto"><option value="">Mọi thể loại</option>${kinds.map((k) => `<option value="${esc(k)}" ${k === kind ? 'selected' : ''}>${esc(k === 'none' ? 'Chưa giao việc' : (REMAKE[k] || [k])[0])}</option>`).join('')}</select></div>`,
            columns: [
              { key: 'username', label: 'Kênh', text: (c) => `${c.username} ${c.nickname} ${c.note} ${c.country} ${c.publisher}`, render: (c) =>
                `<a href="https://www.tiktok.com/@${esc(c.username)}" target="_blank" rel="noopener" class="fw-semibold">@${esc(c.username || '—')}</a>
                <span class="cell-sub">#${c.id} · ${esc(c.nickname)} ${c.note ? '· ' + esc(c.note) : ''}</span>` },
              { key: 'roles', label: 'Thể loại', sort: false, text: (c) => c.roles.map((x) => `${roleKey(x)} ${x.variant || ''} ${x.matrix_channel || ''}`).join(' ') || 'chưa giao việc',
                render: (c) => roleBadges(c.roles) },
              { key: 'country', label: 'Nước', render: (c) => `${esc(c.original_country || c.country)}${c.publisher ? `<span class="cell-sub">${esc(c.publisher)}</span>` : ''}` },
              { key: 'status', label: 'BKT', render: (c) => statusBadge(c.status) + (c.kyc && c.kyc !== 'No' ? '<span class="cell-sub">KYC</span>' : '') },
              { key: 'earned', label: 'Doanh thu', cls: 'text-end', render: (c) => { const cur = c.currency && c.currency !== '#' ? c.currency : ''; return `${fmt.money(c.earned, cur)}<span class="cell-sub">số dư ${fmt.money(c.balance, cur)}</span>`; } },
              { key: 'follower_count', label: 'Follower', cls: 'text-end', render: (c) => `${fmt.num(c.follower_count)}<span class="cell-sub">${fmt.num(c.video_count)} video</span>` },
              { key: 'vpn_location', label: 'VPN', render: (c) => (c.vpn_config ? `<span class="small">${esc(c.vpn_location || c.vpn_config.split('/').pop())}</span>` : '<span class="text-danger small">chưa gán</span>') },
              { key: 'session_state', label: 'Phiên', render: (c) => (c.session_state ? `<span class="badge text-bg-${c.session_state === 'OK' ? 'success' : 'warning'}">${esc(c.session_state)}</span>` : '—') + `<span class="cell-sub">${fmt.ago(c.last_checked)}</span>` },
              { key: 'id', label: '', cls: 'text-end', sort: false, render: (c) => `
                <div class="btn-group btn-group-sm">
                  <button class="btn btn-outline-primary" data-action="check" data-id="${c.id}" title="Quét lại kênh"><i class="bi bi-arrow-repeat"></i></button>
                  <button class="btn btn-outline-secondary" data-action="videos" data-id="${c.id}" title="Video"><i class="bi bi-collection-play"></i></button>
                  <button class="btn btn-outline-secondary dropdown-toggle" data-bs-toggle="dropdown" aria-label="Thao tác khác"></button>
                  <ul class="dropdown-menu dropdown-menu-end">
                    <li><a class="dropdown-item" href="#" data-action="studio" data-id="${c.id}"><i class="bi bi-bar-chart-line me-2"></i>Studio / Ví thật</a></li>
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
          const go = () => {
            const q = new URLSearchParams();
            const p = table.toolbar.querySelector('[data-pub]').value; const k = table.toolbar.querySelector('[data-kind]').value;
            if (p) q.set('pub', p); if (k) q.set('kind', k);
            location.hash = `#/channels${q.toString() ? '?' + q : ''}`;
          };
          table.toolbar.querySelector('[data-pub]').addEventListener('change', go);
          table.toolbar.querySelector('[data-kind]').addEventListener('change', go);
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
        studio: (el) => showStudio(byId(el)),
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
