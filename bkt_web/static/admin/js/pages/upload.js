/* Lịch đăng TikTok: hàng đợi upload_tasks, tạo task từ thư viện video, thử lại / huỷ / xác nhận, nhật ký phiên đăng. */
(function () {
  const { api, esc, fmt, toast, card, dataTable, bindActions, modal, formModal, confirm, badge, infoBox, h } = App;

  const FILTERS = [
    ['', 'Tất cả'], ['QUEUED', 'Chờ đăng'], ['UPLOADING', 'Đang đăng'], ['NEEDS_CHECK', 'Cần kiểm tra'],
    ['WAITING_RENDER', 'Chờ render'], ['ERROR', 'Lỗi'], ['SUCCESS', 'Đã đăng'], ['CANCELLED', 'Đã huỷ'],
  ];

  async function createTask(reload) {
    const [lib, chs] = await Promise.all([api.get('/api/upload/library-videos'), api.get('/api/channels')]);
    if (!lib.videos.length) { toast('Thư viện chưa có video MP4 nào', 'warning'); return; }
    const form = h(`<form class="vstack gap-3">
      <div><label class="form-label">Video</label><select class="form-select" name="video" required>${lib.videos.map((v, i) =>
        `<option value="${i}">${esc(v.title)} · ${esc(v.source)} · ${fmt.date(v.created_at)}</option>`).join('')}</select></div>
      <div><label class="form-label">Kênh đăng (chọn một hoặc nhiều)</label>
        <select class="form-select" name="channels" multiple size="8" required>${chs.channels.map((c) =>
          `<option value="${c.id}">@${esc(c.username || c.id)} · ${esc(c.original_country || c.country)} ${c.note ? '· ' + esc(c.note) : ''}</option>`).join('')}</select>
        <div class="form-text">Giữ Ctrl/Cmd để chọn nhiều kênh. Hệ thống không tự chọn kênh thay bạn.</div></div>
      <div><label class="form-label">Caption</label><textarea class="form-control" name="caption" rows="3" maxlength="2200"></textarea></div>
      <div><label class="form-label">Hashtag</label><input class="form-control" name="hashtags"></div>
      <div class="row g-2">
        <div class="col-sm-6"><label class="form-label">Giờ đăng</label><input class="form-control" type="datetime-local" name="when"></div>
        <div class="col-sm-6"><label class="form-label">Cách nhau giữa các kênh (phút)</label><input class="form-control" type="number" name="stagger" value="20" min="0" max="1440"></div>
      </div>
      <div class="form-check form-switch"><input class="form-check-input" type="checkbox" name="ai" id="up-ai"><label class="form-check-label" for="up-ai">Gắn nhãn "nội dung AI" khi đăng</label></div>
    </form>`);
    const fill = () => {
      const v = lib.videos[Number(form.video.value)];
      form.caption.value = v.title || '';
      form.hashtags.value = v.hashtags || '';
    };
    form.video.addEventListener('change', fill);
    fill();
    const ok = await modal({
      title: 'Tạo task đăng', body: form, size: 'lg',
      buttons: [{ label: 'Huỷ', cls: 'btn-outline-secondary', value: false }, {
        label: 'Xếp lịch', cls: 'btn-primary', onClick: async () => {
          if (!form.reportValidity()) return false;
          const v = lib.videos[Number(form.video.value)];
          const ids = [...form.channels.selectedOptions].map((o) => Number(o.value));
          const ts = form.when.value ? Math.floor(new Date(form.when.value).getTime() / 1000) : 0;
          const r = await api.post('/api/upload/create-task', {
            channel_ids: ids, video_path: v.video_path, caption: form.caption.value, hashtags: form.hashtags.value,
            scheduled_timestamp: ts, stagger_minutes: Number(form.stagger.value) || 0, ai_generated: form.ai.checked,
          });
          toast(r.message || 'Đã xếp lịch', 'success');
          return true;
        },
      }],
    });
    if (ok) reload();
  }

  App.page({
    id: 'upload', group: 'publish', title: 'Lịch đăng', icon: 'calendar2-week',
    desc: 'Hàng đợi đăng video lên TikTok Studio',
    badge: async () => {
      const r = await api.get('/api/upload/tasks');
      const n = r.tasks.filter((t) => ['NEEDS_CHECK', 'ERROR', 'FAILED'].includes(t.status)).length;
      return n ? { text: n, tone: 'danger' } : null;
    },
    async render(ctx) {
      const status = ctx.params.status || '';
      ctx.el.innerHTML = '<div class="row" data-stats></div><div data-live></div><div data-list></div>';
      const list = card({
        title: 'Task đăng', icon: 'list-task',
        tools: `<button class="btn btn-sm btn-primary" data-action="create"><i class="bi bi-plus-lg me-1"></i>Tạo task đăng</button>`,
      });
      ctx.el.querySelector('[data-list]').append(list);
      let table, all = [];

      async function load() {
        all = (await api.get('/api/upload/tasks')).tasks;
        const count = (s) => all.filter((t) => t.status === s).length;
        ctx.el.querySelector('[data-stats]').innerHTML = [
          ['Chờ đăng', count('QUEUED') + count('PENDING'), 'hourglass-split', 'warning'],
          ['Đang đăng', count('UPLOADING'), 'cloud-upload', 'primary'],
          ['Cần kiểm tra / lỗi', count('NEEDS_CHECK') + count('ERROR') + count('FAILED'), 'question-circle', 'danger'],
          ['Đã đăng', count('SUCCESS'), 'check2-circle', 'success'],
        ].map(([l, v, i, t]) => `<div class="col-md-3 col-6">${infoBox({ label: l, value: fmt.num(v), icon: i, tone: t })}</div>`).join('');
        const same = { QUEUED: ['QUEUED', 'PENDING'], ERROR: ['ERROR', 'FAILED'] };
        const rows = status ? all.filter((t) => (same[status] || [status]).includes(t.status)) : all;
        if (!table) {
          table = dataTable(list.querySelector('.card-body'), {
            rows, rowKey: 'id', pageSize: 30,
            toolbar: `<div class="btn-group btn-group-sm flex-wrap">${FILTERS.map(([v, l]) =>
              `<a class="btn btn-outline-secondary ${v === status ? 'active' : ''}" href="#/upload${v ? '?status=' + v : ''}">${l}</a>`).join('')}</div>`,
            columns: [
              { key: 'id', label: '#', render: (t) => `<span class="text-body-secondary">${t.id}</span>` },
              { key: 'username', label: 'Kênh', text: (t) => `${t.username} ${t.niche_name} ${t.country}`, render: (t) =>
                `<span class="fw-semibold">@${esc(t.username)}</span><span class="cell-sub">${esc(t.country)}${t.niche_name ? ' · ' + esc(t.niche_name) : ''}</span>` },
              { key: 'caption', label: 'Nội dung', render: (t) => `<span class="text-truncate-2" style="max-width:360px">${esc(t.caption || '(không caption)')}</span>
                <span class="cell-sub">${esc(t.video_slug || (t.video_path || '').split('/').pop())}</span>` },
              { key: 'schedule_time', label: 'Giờ đăng', render: (t) => `${fmt.time(t.schedule_time)}<span class="cell-sub">${fmt.ago(t.schedule_time)}</span>` },
              { key: 'status', label: 'Trạng thái', render: (t) => `${badge(t.status)}${t.attempt_count ? `<span class="cell-sub">lần ${t.attempt_count}</span>` : ''}
                ${t.error_message ? `<span class="cell-sub text-danger" title="${esc(t.error_message)}">${esc(fmt.short(t.error_message, 70))}</span>` : ''}
                ${t.verify_note ? `<span class="cell-sub">${esc(fmt.short(t.verify_note, 70))}</span>` : ''}` },
              { key: 'result_url', label: 'Kết quả', sort: false, render: (t) => (t.result_url ? `<a href="${esc(t.result_url)}" target="_blank" rel="noopener">Mở video <i class="bi bi-box-arrow-up-right"></i></a>` : '—') },
              { key: 'actions', label: '', cls: 'text-end', sort: false, render: (t) => `<div class="btn-group btn-group-sm">
                <button class="btn btn-outline-secondary" data-action="play" data-id="${t.id}" title="Xem video"><i class="bi bi-play-fill"></i></button>
                ${['ERROR', 'CANCELLED'].includes(t.status) && !t.clicked_post_at ? `<button class="btn btn-outline-primary" data-action="retry" data-id="${t.id}" title="Đăng lại"><i class="bi bi-arrow-clockwise"></i></button>` : ''}
                ${t.clicked_post_at && t.status !== 'SUCCESS' ? `<span class="btn btn-outline-secondary disabled" title="Đã bấm Đăng lúc ${fmt.time(t.clicked_post_at)} — không đăng lại để tránh trùng bài; kiểm tra kênh rồi xác nhận"><i class="bi bi-lock"></i></span>` : ''}
                ${t.status === 'NEEDS_CHECK' ? `<button class="btn btn-outline-success" data-action="confirm" data-id="${t.id}" title="Video đã lên kênh"><i class="bi bi-check2"></i></button>` : ''}
                ${['QUEUED', 'PENDING', 'WAITING_RENDER'].includes(t.status) ? `<button class="btn btn-outline-warning" data-action="cancel" data-id="${t.id}" title="Huỷ"><i class="bi bi-slash-circle"></i></button>` : ''}
                <button class="btn btn-outline-danger" data-action="delete" data-id="${t.id}" title="Xoá"><i class="bi bi-trash"></i></button></div>` },
            ],
          });
        } else table.setRows(rows);
      }

      async function live() {
        const s = await api.get('/api/upload/publish-logs');
        const box = ctx.el.querySelector('[data-live]');
        if (!s.is_running) { box.innerHTML = ''; return; }
        box.innerHTML = '';
        box.append(card({ title: `Đang đăng · kênh #${s.channel_id} · task #${s.task_id ?? '—'}`, icon: 'broadcast', tone: 'primary',
          body: `<pre class="log-box">${esc((s.logs || []).slice(-40).map((l) => `[${l.time}] ${l.message || l.msg || ''}`).join('\n'))}</pre>` }));
      }

      const byId = (el) => all.find((t) => t.id === Number(el.dataset.id));
      bindActions(ctx.el, {
        create: () => createTask(load),
        play(el) {
          const t = byId(el);
          modal({ title: `Video task #${t.id}`, body: `<video src="/api/upload/tasks/${t.id}/video" controls class="w-100 rounded" style="max-height:70vh"></video>` });
        },
        async retry(el) { await api.post(`/api/upload/tasks/${el.dataset.id}/retry`); toast('Đã đưa lại vào hàng đợi', 'success'); load(); },
        async cancel(el) { await api.post(`/api/upload/tasks/${el.dataset.id}/cancel`); toast('Đã huỷ', 'success'); load(); },
        async confirm(el) {
          if (!(await confirm('Bạn đã kiểm tra và video thực sự đã lên kênh?'))) return;
          await api.post(`/api/upload/tasks/${el.dataset.id}/confirm`); toast('Đã đánh dấu đã đăng', 'success'); load();
        },
        async delete(el) {
          if (!(await confirm(`Xoá task #${el.dataset.id}?`, { danger: true, ok: 'Xoá' }))) return;
          await api.del(`/api/upload/tasks/${el.dataset.id}`); toast('Đã xoá', 'success'); load();
        },
      });
      await Promise.all([load(), live()]);
      ctx.every(10000, load);
      ctx.every(3000, live);
    },
  });
})();
