/* Profile trình duyệt antidetect (BaoSam engine) và kho proxy. */
(function () {
  const { api, esc, fmt, toast, card, dataTable, bindActions, formModal, confirm, badge, tabs } = App;

  async function profiles(el, ctx) {
    const g = await api.get('/api/nn/groups');
    const box = card({ title: 'Profile', icon: 'browser-chrome', tools: `<button class="btn btn-sm btn-primary" data-action="new"><i class="bi bi-plus-lg me-1"></i>Profile mới</button>` });
    el.append(box);
    const group = ctx.params.group || '';
    const t = dataTable(box.querySelector('.card-body'), { rows: [], pageSize: 30,
      toolbar: `<select class="form-select form-select-sm" data-g style="width:auto"><option value="">Mọi nhóm</option>${g.groups.map((x) => `<option value="${esc(x.Id)}" ${x.Id === group ? 'selected' : ''}>${esc(x.Name)}</option>`).join('')}</select>`,
      columns: [
        { key: 'Name', label: 'Profile', text: (p) => `${p.Name} ${p.Note} ${p.Tags} ${p.Id}`, render: (p) => `<b>${esc(p.Name)}</b><span class="cell-sub mono">${esc(p.Id)}</span>${p.Note ? `<span class="cell-sub">${esc(p.Note)}</span>` : ''}` },
        { key: 'GroupId', label: 'Nhóm' },
        { key: 'BrowserName', label: 'Trình duyệt', render: (p) => `${esc(p.BrowserName)} ${esc(p.BrowserVersion)}` },
        { key: 'RawProxy', label: 'Proxy', render: (p) => (p.RawProxy ? `<span class="mono small">${esc(fmt.short(p.RawProxy, 40))}</span>` : '<span class="text-body-secondary">—</span>') },
        { key: 'is_running', label: 'Trạng thái', sort: (p) => (p.is_running ? 1 : 0), render: (p) => (p.is_running ? badge('running', 'Đang mở') : badge('stopped', 'Đóng')) + `<span class="cell-sub">${p.LastOpenedAt ? 'mở ' + esc(p.LastOpenedAt) : ''}</span>` },
        { key: 'Id', label: '', sort: false, cls: 'text-end', render: (p) => `<div class="btn-group btn-group-sm">
          ${p.is_running ? `<button class="btn btn-outline-warning" data-action="stop" data-id="${esc(p.Id)}"><i class="bi bi-stop-fill"></i> Đóng</button>`
            : `<button class="btn btn-outline-primary" data-action="start" data-id="${esc(p.Id)}"><i class="bi bi-play-fill"></i> Mở</button>`}
          <button class="btn btn-outline-secondary" data-action="edit" data-id="${esc(p.Id)}"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-outline-danger" data-action="del" data-id="${esc(p.Id)}"><i class="bi bi-trash"></i></button></div>` },
      ] });
    t.toolbar.querySelector('[data-g]').addEventListener('change', (e) => { location.hash = `#/profiles/list${e.target.value ? '?group=' + encodeURIComponent(e.target.value) : ''}`; });
    const load = async () => t.setRows((await api.get('/api/nn/profiles', { group_id: group })).profiles);
    const edit = async (p = {}) => {
      const v = await formModal({ title: p.Id ? `Sửa ${p.Name}` : 'Profile mới', fields: [
        { name: 'Name', label: 'Tên', value: p.Name || '', required: true },
        { name: 'GroupId', label: 'Nhóm', type: 'select', value: p.GroupId || 'Default', options: [['Default', 'Default'], ...g.groups.map((x) => [x.Id, x.Name])] },
        { name: 'RawProxy', label: 'Proxy', value: p.RawProxy || '', placeholder: 'socks5://user:pass@host:port' },
        { name: 'BrowserVersion', label: 'Phiên bản Chrome', value: p.BrowserVersion || '128' },
        { name: 'Note', label: 'Ghi chú', value: p.Note || '' }] });
      if (!v) return;
      await api.post('/api/nn/profiles', { ...p, ...v, Id: p.Id || null });
      toast('Đã lưu profile', 'success'); load();
    };
    const find = (b) => t.rows.find((p) => p.Id === b.dataset.id);
    bindActions(el, {
      new: () => edit(),
      edit: (b) => edit(find(b)),
      async start(b) { await api.post(`/api/nn/profiles/${encodeURIComponent(b.dataset.id)}/start`); toast('Đã mở profile', 'success'); load(); },
      async stop(b) { await api.post(`/api/nn/profiles/${encodeURIComponent(b.dataset.id)}/stop`); load(); },
      async del(b) { if (await confirm('Đưa profile vào thùng rác?', { danger: true, ok: 'Xoá' })) { await api.del(`/api/nn/profiles/${encodeURIComponent(b.dataset.id)}`); load(); } },
    });
    await load();
    ctx.every(8000, load);
  }

  async function proxies(el) {
    const box = card({ title: 'Kho proxy', icon: 'hdd-network', tools: `<button class="btn btn-sm btn-primary me-1" data-action="import"><i class="bi bi-upload me-1"></i>Nhập</button>
      <button class="btn btn-sm btn-outline-primary" data-action="check"><i class="bi bi-activity me-1"></i>Kiểm tra tất cả</button>` });
    el.append(box);
    const t = dataTable(box.querySelector('.card-body'), { rows: [], pageSize: 50, columns: [
      { key: 'RawProxy', label: 'Proxy', render: (x) => `<span class="mono small">${esc(x.RawProxy)}</span><span class="cell-sub">${esc(x.Folder)} · ${esc(x.Protocol || '')}</span>` },
      { key: 'Status', label: 'Trạng thái', render: (x) => `${badge(x.Status === 'live' ? 'ok' : x.Status === 'dead' ? 'error' : 'pending', x.Status || 'chưa kiểm tra')}${x.LastError ? `<span class="cell-sub text-danger">${esc(fmt.short(x.LastError, 60))}</span>` : ''}` },
      { key: 'RealIp', label: 'IP thật', render: (x) => `${esc(x.RealIp || '—')}<span class="cell-sub">${esc(x.Country || '')}${x.PingMs ? ` · ${x.PingMs} ms` : ''}</span>` },
      { key: 'Id', label: '', sort: false, cls: 'text-end', render: (x) => `<button class="btn btn-sm btn-outline-danger" data-action="del" data-id="${esc(x.Id)}"><i class="bi bi-trash"></i></button>` },
    ] });
    const load = async () => t.setRows((await api.get('/api/nn/proxies')).proxies);
    bindActions(el, {
      async import() {
        const v = await formModal({ title: 'Nhập proxy', size: 'lg', fields: [
          { name: 'raw_data', label: 'Mỗi dòng một proxy', type: 'textarea', rows: 10, required: true },
          { name: 'folder', label: 'Thư mục', value: 'Default' }] });
        if (!v) return;
        const r = await api.post('/api/nn/proxies/import', v); toast(r.message || `Đã nhập ${r.imported ?? ''} proxy`, 'success'); load();
      },
      async check() { toast('Đang kiểm tra proxy…'); await api.post('/api/nn/proxies/check-live', { proxy_ids: t.rows.map((x) => x.Id) }); load(); },
      async del(b) { await api.del('/api/nn/proxies', [b.dataset.id]); load(); },
    });
    await load();
  }

  App.page({
    id: 'profiles', group: 'accounts', title: 'Profile trình duyệt', icon: 'window-stack',
    desc: 'Profile antidetect và proxy dùng cho các trình duyệt',
    render(ctx) {
      return tabs(ctx.el, ctx, [
        { id: 'list', label: 'Profile', icon: 'browser-chrome', render: (el) => profiles(el, ctx) },
        { id: 'proxies', label: 'Proxy', icon: 'hdd-network', render: proxies },
      ]);
    },
  });
})();
