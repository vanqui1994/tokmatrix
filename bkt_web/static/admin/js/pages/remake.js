/* Canvas Remake: tải video nguồn lên → pipeline dựng hoạt hình 2D, theo dõi tác vụ, xem/đăng/lồng tiếng dự án. */
(function () {
  const { api, esc, fmt, toast, card, dataTable, bindActions, modal, formModal, confirm, badge, empty, h } = App;
  const KEY = 'tm-remake-tasks';
  const tracked = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (_) { return []; } };
  const track = (ids) => { try { localStorage.setItem(KEY, JSON.stringify(ids.slice(0, 20))); } catch (_) {} };

  App.page({
    id: 'remake', group: 'production', title: 'Canvas Remake', icon: 'brush',
    desc: 'Video nguồn → hoạt hình 2D Canvas với giọng đọc nhiều vai',
    async render(ctx) {
      ctx.el.innerHTML = '<div class="row"><div class="col-lg-5" data-a></div><div class="col-lg-7" data-b></div></div><div data-c></div>';
      const up = card({ title: 'Tạo remake mới', icon: 'cloud-upload', body: `<form class="vstack gap-3">
        <input class="form-control" type="file" name="file" accept="video/*" required>
        <div class="form-text">Tối đa 500 MB. Pipeline tự phân tích, viết lời, dựng nhân vật và render.</div>
        <div class="progress d-none" style="height:6px"><div class="progress-bar"></div></div>
        <button class="btn btn-primary align-self-start" data-action="upload"><i class="bi bi-play-fill me-1"></i>Tải lên và chạy</button></form>
        <hr><a href="/static/remake_vector_library.html" target="_blank" rel="noopener"><i class="bi bi-box-arrow-up-right me-1"></i>Thư viện nhân vật vector</a>` });
      ctx.el.querySelector('[data-a]').append(up);
      const tasksBox = card({ title: 'Tác vụ gần đây', icon: 'hourglass-split', bodyCls: 'p-0' });
      ctx.el.querySelector('[data-b]').append(tasksBox);
      const proj = card({ title: 'Dự án', icon: 'folder2-open' });
      ctx.el.querySelector('[data-c]').append(proj);

      const t = dataTable(proj.querySelector('.card-body'), { pageSize: 20, columns: [
        { key: 'name', label: 'Dự án', render: (p) => `<b>${esc(p.name)}</b><span class="cell-sub">${esc(p.source)} · ${fmt.dur(p.duration)} · ${p.cues_count} câu · ${esc(p.voice || '')}</span>` },
        { key: 'theme_label', label: 'Chủ đề', render: (p) => `${esc(p.theme_label || p.theme || '')}<span class="cell-sub">${esc(p.script_source_label || '')}</span>` },
        { key: 'locales', label: 'Ngôn ngữ', sort: false, render: (p) => (p.locales || []).map((l) => `<span class="badge text-bg-secondary me-1">${esc(l)}</span>`).join('') },
        { key: 'badge', label: 'Trạng thái', render: (p) => `<span class="badge text-bg-warning">${esc(p.badge || p.fidelity || '')}</span>` },
        { key: 'created_at', label: 'Tạo lúc' },
        { key: 'id', label: '', sort: false, cls: 'text-end', render: (p) => `<div class="btn-group btn-group-sm">
          <a class="btn btn-outline-primary" href="${esc(p.demo_url)}" target="_blank" rel="noopener" title="Xem"><i class="bi bi-play-fill"></i></a>
          <button class="btn btn-outline-secondary" data-action="localize" data-id="${esc(p.id)}" title="Lồng tiếng nước khác"><i class="bi bi-translate"></i></button>
          <button class="btn btn-outline-success" data-action="publish" data-id="${esc(p.id)}" title="Đăng"><i class="bi bi-send"></i></button>
          <button class="btn btn-outline-danger" data-action="del" data-id="${esc(p.id)}"><i class="bi bi-trash"></i></button></div>` },
      ] });
      const loadProjects = async () => t.setRows((await api.get('/api/remake/projects')).projects);

      async function loadTasks() {
        const ids = tracked();
        if (!ids.length) { tasksBox.querySelector('.card-body').innerHTML = empty('Chưa có tác vụ nào'); return; }
        const rows = await Promise.all(ids.map((id) => api.get(`/api/remake/status/${id}`).catch(() => null)));
        tasksBox.querySelector('.card-body').innerHTML = `<ul class="list-group list-group-flush">${rows.filter(Boolean).map((x) => `
          <li class="list-group-item"><div class="d-flex justify-content-between gap-2"><span class="text-truncate">${esc(x.project_name || x.video_path || x.id)}</span>${badge(x.status)}</div>
          <div class="progress my-1" style="height:4px"><div class="progress-bar" style="width:${x.progress || 0}%"></div></div>
          <div class="cell-sub">${esc(x.current_step || '')}${x.error ? ` · <span class="text-danger">${esc(fmt.short(x.error, 120))}</span>` : ''}</div>
          ${x.status === 'error' ? `<button class="btn btn-sm btn-outline-warning mt-1" data-action="retry" data-id="${esc(x.id)}">Chạy lại</button>` : ''}</li>`).join('')}</ul>`;
        if (rows.some((x) => x && x.status === 'completed')) loadProjects();
      }

      bindActions(ctx.el, {
        async upload() {
          const f = up.querySelector('form');
          if (!f.reportValidity()) return;
          const fd = new FormData();
          fd.append('file', f.file.files[0]);
          const bar = up.querySelector('.progress');
          bar.classList.remove('d-none');
          const r = await new Promise((resolve, reject) => {
            const x = new XMLHttpRequest();
            x.open('POST', '/api/remake/auto');
            x.upload.onprogress = (e) => { bar.firstElementChild.style.width = `${100 * e.loaded / e.total}%`; };
            x.onload = () => { let d = {}; try { d = JSON.parse(x.responseText); } catch (_) {} x.status < 300 ? resolve(d) : reject(new Error(d.detail || `HTTP ${x.status}`)); };
            x.onerror = () => reject(new Error('Mất kết nối khi tải lên'));
            x.send(fd);
          }).finally(() => bar.classList.add('d-none'));
          toast(r.message || 'Đã bắt đầu', 'success');
          track([r.task_id, ...tracked().filter((i) => i !== r.task_id)]);
          f.reset(); loadTasks();
        },
        async retry(b) { await api.post(`/api/remake/status/${b.dataset.id}/retry`); loadTasks(); },
        async localize(b) {
          const c = await api.get('/api/remake/countries');
          const v = await formModal({ title: 'Lồng tiếng nước khác', fields: [{ name: 'locale', label: 'Ngôn ngữ', type: 'select', options: c.countries.map((x) => [x.code, `${x.country} · ${x.language}`]) }] });
          if (!v) return;
          const r = await api.post(`/api/remake/projects/${encodeURIComponent(b.dataset.id)}/localize`, { locales: [v.locale] });
          track([r.task_id, ...tracked()]); toast('Đang lồng tiếng', 'success'); loadTasks();
        },
        async publish(b) {
          const chs = await api.get('/api/channels');
          const v = await formModal({ title: 'Đăng dự án', fields: [
            { name: 'channel_id', label: 'Kênh', type: 'select', required: true, options: [['', '— chọn kênh —'], ...chs.channels.map((c) => [c.id, `@${c.username || c.id}`])] },
            { name: 'caption', label: 'Caption', type: 'textarea', rows: 3 },
            { name: 'hashtags', label: 'Hashtag', value: '#fyp #viral' }] });
          if (!v) return;
          const r = await api.post(`/api/remake/projects/${encodeURIComponent(b.dataset.id)}/publish`, { ...v, channel_id: Number(v.channel_id) });
          toast(r.message || 'Đã xếp đăng', 'success');
        },
        async del(b) { if (await confirm('Xoá dự án này?', { danger: true, ok: 'Xoá' })) { await api.del(`/api/remake/projects/${encodeURIComponent(b.dataset.id)}`); loadProjects(); } },
      });
      await Promise.all([loadProjects(), loadTasks()]);
      ctx.every(5000, loadTasks);
    },
  });
})();
