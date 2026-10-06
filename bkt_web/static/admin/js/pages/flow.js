/* Sơ đồ luồng live: mỗi bước của Autopilot / Đăng TikTok / Script Queue với số lượng và mục gần nhất. */
(function () {
  const { api, esc, fmt, card, modal, badge, tabs, bindActions } = App;

  const LABELS = {
    trigger: ['Lịch Autopilot', 'alarm'], plan: ['Lập kế hoạch ngày', 'card-checklist'], batch: ['Matrix batch', 'boxes'],
    script: ['Viết kịch bản', 'file-earmark-text'], script_ai: ['Kịch bản AI', 'robot'], registry: ['Chống trùng nội dung', 'fingerprint'],
    assets: ['Ảnh + giọng đọc', 'images'], images: ['Ảnh AI', 'image'], tts: ['Giọng đọc', 'mic'], render: ['Render MP4', 'film'],
    publish_check: ['Đủ điều kiện đăng?', 'signpost-split'], scheduled: ['Lên lịch đăng', 'calendar-check'], upload: ['Hàng chờ đăng', 'cloud-upload'],
    cleanup: ['Dọn dẹp', 'trash3'], blocked: ['Bị giữ lại', 'pause-circle'], failed: ['Lỗi', 'x-octagon'],
    source: ['Nguồn video', 'collection-play'], channel: ['Chọn kênh', 'person-check'], preflight: ['Ảnh + MP4 sẵn sàng?', 'check2-square'],
    wait_render: ['Chờ render / ảnh', 'hourglass-split'], queue: ['Hàng chờ lịch', 'list-ol'], profile: ['Profile Chrome', 'browser-chrome'],
    uploading: ['Đang đăng', 'broadcast'], confirm: ['Thấy xác nhận?', 'question-circle'], success: ['Đã đăng', 'check2-circle'],
    needs_check: ['Cần kiểm tra', 'exclamation-diamond'], verifier: ['Tự xác minh', 'search'], error: ['Lỗi', 'x-octagon'], cancelled: ['Đã huỷ', 'slash-circle'],
    enqueue: ['Tạo yêu cầu', 'plus-circle'], pending: ['Hàng chờ', 'list-ol'], processing: ['Đã nhận', 'gear'], inbox: ['Inbox', 'inbox'],
    agent: ['Antigravity viết', 'stars'], outbox: ['Outbox', 'box-arrow-up'], completed: ['Lưu kịch bản', 'check2-circle'],
  };
  const SINK = new Set(['blocked', 'failed', 'error', 'cancelled', 'needs_check']);

  async function flow(el, ctx, id) {
    const hours = Number(ctx.params.hours || 48);
    async function load() {
      const r = await api.get(`/api/flow/${id}`, { hours });
      const workers = Object.entries(r.workers || {}).map(([k, v]) => `<span class="badge text-bg-${v ? 'success' : 'secondary'} me-1">${esc(k)}: ${v ? 'chạy' : 'dừng'}</span>`).join('');
      el.innerHTML = `<div class="d-flex flex-wrap align-items-center gap-2 mb-3">${workers}
        <span class="ms-auto small text-body-secondary">Cửa sổ ${hours} giờ · cập nhật ${fmt.time(r.generated_at)}</span>
        <div class="btn-group btn-group-sm">${[24, 48, 168].map((h) => `<a class="btn btn-outline-secondary ${h === hours ? 'active' : ''}" href="#/flow/${id}?hours=${h}">${h}h</a>`).join('')}</div></div>
        <div class="row g-3">${Object.entries(r.nodes).map(([nid, n]) => {
          const [label, icon] = LABELS[nid] || [nid, 'circle'];
          const total = Object.values(n.counts).reduce((a, b) => a + b, 0);
          const bad = SINK.has(nid) && total > 0;
          return `<div class="col-xl-3 col-lg-4 col-sm-6"><div class="card h-100 ${bad ? 'card-outline card-danger' : ''}">
            <div class="card-body"><div class="d-flex align-items-center gap-2 mb-2"><i class="bi bi-${icon} fs-5 text-${bad ? 'danger' : 'primary'}"></i><b>${esc(label)}</b>
            ${n.items.length ? `<button class="btn btn-sm btn-link ms-auto p-0" data-action="items" data-id="${nid}">${n.items.length} mục</button>` : ''}</div>
            <div class="d-flex flex-wrap gap-1">${Object.entries(n.counts).map(([k, v]) => `${badge(k, `${App.STATUS_LABEL[k] || k}: ${fmt.num(v)}`)}`).join('') || '<span class="small text-body-secondary">—</span>'}</div>
            ${n.note ? `<div class="small text-body-secondary mt-2">${esc(n.note)}</div>` : ''}</div></div></div>`;
        }).join('')}</div>
        ${r.logs && r.logs.length ? '<div class="mt-4" data-logs></div>' : ''}`;
      if (r.logs && r.logs.length) el.querySelector('[data-logs]').append(card({ title: 'Nhật ký', icon: 'journal-text', body: `<pre class="log-box">${esc(r.logs.map((l) => (typeof l === 'string' ? l : `[${fmt.time(l.ts)}] ${l.message}`)).join('\n'))}</pre>` }));
      el._nodes = r.nodes;
    }
    bindActions(el, {
      items(b) {
        const n = el._nodes[b.dataset.id];
        const cols = [...new Set(n.items.flatMap((x) => Object.keys(x)))].slice(0, 6);
        modal({ title: (LABELS[b.dataset.id] || [b.dataset.id])[0], size: 'xl', body: `<div class="table-responsive"><table class="table table-sm"><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>
          <tbody>${n.items.map((x) => `<tr>${cols.map((c) => `<td class="small">${esc(fmt.short(typeof x[c] === 'object' ? JSON.stringify(x[c]) : x[c], 120))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` });
      },
    });
    await load();
    ctx.every(15000, load);
  }

  App.page({
    id: 'flow', group: 'publish', title: 'Sơ đồ luồng', icon: 'diagram-3',
    desc: 'Theo dõi từng bước của các luồng tự động theo thời gian thực',
    render(ctx) {
      return tabs(ctx.el, ctx, [
        { id: 'autopilot', label: 'Autopilot', icon: 'robot', render: (el) => flow(el, ctx, 'autopilot') },
        { id: 'publish', label: 'Đăng TikTok', icon: 'send', render: (el) => flow(el, ctx, 'publish') },
        { id: 'scripts', label: 'Script Queue', icon: 'file-earmark-text', render: (el) => flow(el, ctx, 'scripts') },
      ]);
    },
  });
})();
