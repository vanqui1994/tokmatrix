/* Lịch đăng TikTok (bố cục như bản cũ): số liệu, soạn bài 4 bước + xem trước điện thoại, hàng đợi gom theo tài khoản,
 * lịch tháng, danh sách theo ngày, ngăn kéo log đăng trực tiếp. Chế độ xem nằm trên URL: #/upload/queue|calendar|agenda. */
(function () {
  const { api, esc, fmt, toast, bindActions, modal, confirm, h } = App;

  const FLAGS = { DE: '🇩🇪', GB: '🇬🇧', US: '🇺🇸', JP: '🇯🇵', KR: '🇰🇷', VN: '🇻🇳', FR: '🇫🇷', ES: '🇪🇸', IT: '🇮🇹', BR: '🇧🇷' };
  const WAITING = ['QUEUED', 'PENDING', 'WAITING_RENDER'];
  const FAILED = ['ERROR', 'FAILED', 'NEEDS_CHECK'];
  const STATUS_TONE = { QUEUED: 'warning', PENDING: 'warning', WAITING_RENDER: 'secondary', UPLOADING: 'primary', SUCCESS: 'success', ERROR: 'danger', FAILED: 'danger', NEEDS_CHECK: 'danger', CANCELLED: 'secondary' };
  const GOLDEN = [['07:30', 'Sáng sớm', 'sunrise'], ['11:45', 'Trưa', 'sun'], ['18:30', 'Chiều tối', 'sunset'], ['21:15', 'Đêm', 'moon-stars']];
  const TAGS = ['#fyp', '#viral', '#foryou', '#trending', '#learnontiktok', '#tiktokcreator'];
  const OPEN_KEY = 'tm-upload-open';
  const store = {
    get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (_) { return d; } },
    set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} },
  };
  const pad = (n) => String(n).padStart(2, '0');
  const when = (ts) => { if (!ts) return 'Đăng ngay'; const d = new Date(ts * 1000); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const hhmm = (ts) => { const d = new Date(ts * 1000); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const stBadge = (s) => `<span class="badge text-bg-${STATUS_TONE[s] || 'secondary'}">${esc(App.STATUS_LABEL[s] || s)}</span>`;

  function countdown(ts) {
    if (!ts) return '<span class="badge text-bg-info">Ngay</span>';
    const diff = ts - Math.floor(Date.now() / 1000);
    if (diff <= 0) return '<span class="badge text-bg-danger">Quá hạn</span>';
    if (diff < 60) return '<span class="badge text-bg-info">Sắp đăng</span>';
    if (diff < 3600) return `<span class="badge text-bg-light border">${Math.ceil(diff / 60)}m</span>`;
    if (diff < 86400) return `<span class="badge text-bg-light border">${Math.floor(diff / 3600)}h ${Math.ceil((diff % 3600) / 60)}m</span>`;
    return `<span class="badge text-bg-light border">${Math.floor(diff / 86400)}d</span>`;
  }

  function groupByAccount(tasks) {
    const groups = new Map();
    for (const t of tasks) {
      const key = String(t.channel_id);
      if (!groups.has(key)) {
        const handle = String(t.username || '').trim().replace(/^@/, '');
        groups.set(key, { key, username: t.username || `Kênh #${t.channel_id}`, handle: /^[A-Za-z0-9._]{2,24}$/.test(handle) ? handle : '',
          country: t.country, nicheId: t.niche_id || '', nicheName: t.niche_name || '', matrixName: t.matrix_channel_name || '', tasks: [] });
      }
      groups.get(key).tasks.push(t);
    }
    const now = Math.floor(Date.now() / 1000);
    return [...groups.values()].map((g) => {
      g.tasks.sort((a, b) => (a.schedule_time || 0) - (b.schedule_time || 0) || a.id - b.id);
      const n = (list) => g.tasks.filter((t) => list.includes(t.status)).length;
      g.waiting = n(WAITING); g.uploading = n(['UPLOADING']); g.success = n(['SUCCESS']); g.failed = n(FAILED);
      const next = g.tasks.find((t) => WAITING.includes(t.status));
      g.next = next ? next.schedule_time || now : null;
      g.oldest = g.tasks[0].schedule_time || 0;
      return g;
    }).sort((a, b) => (a.next ?? Infinity) - (b.next ?? Infinity) || a.oldest - b.oldest || a.username.localeCompare(b.username));
  }

  function taskCard(t) {
    const name = (t.video_path || '').split('/').pop() || 'Video';
    const slug = t.video_slug || '';
    const canPublish = ['QUEUED', 'PENDING'].includes(t.status);
    const canRetry = ['ERROR', 'CANCELLED'].includes(t.status) && !t.clicked_post_at;
    return `<div class="col"><div class="card h-100 up-card">
      <div class="up-media" data-action="play" data-id="${t.id}" title="Xem video sẽ đăng" role="button">
        ${slug ? `<img src="/api/videos/${encodeURIComponent(slug)}/thumbnail" alt="" loading="lazy" onerror="this.remove()">` : ''}
        <i class="bi bi-play-circle-fill up-play"></i>
        <div class="up-media-top">${countdown(t.schedule_time)}${stBadge(t.status)}</div>
      </div>
      <div class="card-body p-2">
        <div class="small fw-semibold text-truncate" title="${esc(name)}">${esc(name)}</div>
        <div class="cell-sub"><i class="bi bi-clock"></i> ${esc(when(t.schedule_time))}${t.attempt_count ? ` · lần ${t.attempt_count}` : ''}</div>
        <div class="small text-truncate-2 mt-1 text-body-secondary" title="${esc(t.caption)}">${esc(t.caption) || '<em>Chưa có caption</em>'}</div>
        ${t.error_message && t.status !== 'SUCCESS' ? `<div class="cell-sub text-danger text-truncate-2" title="${esc(t.error_message)}">${esc(t.error_message)}</div>` : ''}
        ${t.verify_note ? `<div class="cell-sub text-truncate-2">${esc(t.verify_note)}</div>` : ''}
        ${t.result_url ? `<a class="small" href="${esc(t.result_url)}" target="_blank" rel="noopener">Xem trên TikTok <i class="bi bi-box-arrow-up-right"></i></a>` : ''}
      </div>
      <div class="card-footer p-2 d-flex gap-1 flex-wrap">
        ${canPublish ? `<button class="btn btn-sm btn-primary" data-action="publish" data-id="${t.id}"><i class="bi bi-rocket-takeoff"></i> Đăng ngay</button>` : ''}
        ${canRetry ? `<button class="btn btn-sm btn-outline-primary" data-action="retry" data-id="${t.id}"><i class="bi bi-arrow-clockwise"></i> Thử lại</button>` : ''}
        ${t.status === 'NEEDS_CHECK' ? `<button class="btn btn-sm btn-outline-success" data-action="confirm" data-id="${t.id}" title="Video đã lên kênh"><i class="bi bi-check2"></i> Đã lên</button>` : ''}
        ${t.clicked_post_at && t.status !== 'SUCCESS' ? `<span class="btn btn-sm btn-outline-secondary disabled" title="Đã bấm Đăng lúc ${fmt.time(t.clicked_post_at)} — không đăng lại để tránh trùng bài"><i class="bi bi-lock"></i></span>` : ''}
        ${WAITING.includes(t.status) ? `<button class="btn btn-sm btn-outline-warning" data-action="cancel" data-id="${t.id}" title="Huỷ"><i class="bi bi-slash-circle"></i></button>` : ''}
        <button class="btn btn-sm btn-outline-danger ms-auto" data-action="delete" data-id="${t.id}" title="Xoá"><i class="bi bi-trash"></i></button>
      </div></div></div>`;
  }

  function groupHtml(g, open) {
    const chip = (n, tone, label) => (n ? `<span class="badge text-bg-${tone}">${n} ${label}</span>` : '');
    return `<div class="card mb-2">
      <div class="card-header d-flex flex-wrap align-items-center gap-2 up-group-head" data-action="toggle" data-key="${esc(g.key)}" role="button" aria-expanded="${open}">
        <i class="bi bi-chevron-${open ? 'down' : 'right'}"></i><span class="fs-5">${FLAGS[g.country] || '🌐'}</span>
        <span class="me-2">${g.handle ? `<a class="fw-semibold" href="https://www.tiktok.com/@${encodeURIComponent(g.handle)}" target="_blank" rel="noopener" data-stop>@${esc(g.handle)} <i class="bi bi-box-arrow-up-right small"></i></a>` : `<b>${esc(g.username)}</b>`}
          <span class="cell-sub">${g.matrixName ? esc(g.matrixName) + ' · ' : ''}${g.tasks.length} video</span></span>
        ${g.nicheName ? `<span class="badge text-bg-light border">${esc(g.nicheName)}</span>` : '<span class="badge text-bg-light border text-body-secondary">Chưa gán chủ đề</span>'}
        <span class="d-flex gap-1">${chip(g.uploading, 'primary', 'đang đăng')}${chip(g.failed, 'danger', 'lỗi')}${chip(g.waiting, 'warning', 'chờ đăng')}${chip(g.success, 'success', 'đã đăng')}</span>
        <span class="ms-auto small">${g.next ? `Tiếp theo <b>${esc(when(g.next))}</b> ${countdown(g.next)}` : '<span class="text-body-secondary">Không còn video chờ</span>'}</span>
      </div>
      ${open ? `<div class="card-body"><div class="row row-cols-2 row-cols-md-3 row-cols-xl-5 g-2">${g.tasks.map(taskCard).join('')}</div></div>` : ''}</div>`;
  }

  // ------------------------------------------------------------------ soạn bài
  async function composer(box, onDone) {
    const [lib, chs] = await Promise.all([api.get('/api/upload/library-videos'), api.get('/api/channels')]);
    const state = { video: null, channels: new Set(), country: '', q: '' };
    const ctry = (c) => (c.original_country || c.country || '').toUpperCase();
    box.innerHTML = `<div class="row g-3">
      <div class="col-xl-8"><div class="card card-outline card-primary mb-0">
        <div class="card-header"><h3 class="card-title"><i class="bi bi-pencil-square me-2"></i>Soạn & lên lịch đăng video</h3>
          <div class="card-tools"><button class="btn btn-tool" data-action="compose-close" title="Đóng"><i class="bi bi-x-lg"></i></button></div></div>
        <div class="card-body vstack gap-4">
          <section><h6 class="up-step"><span>1</span>Chọn video nguồn <small class="text-body-secondary fw-normal ms-2">${lib.videos.length} video trong thư viện</small></h6>
            <div class="up-lib">${lib.videos.map((v, i) => `<button type="button" class="up-lib-item" data-action="pick-video" data-i="${i}" title="${esc(v.title)}">
              <span class="up-lib-thumb" style="${v.thumbnail_url ? `background-image:url('${esc(v.thumbnail_url)}')` : ''}">${v.thumbnail_url ? '' : '<i class="bi bi-film"></i>'}</span>
              <span class="up-lib-title">${esc(fmt.short(v.title, 46))}</span><span class="cell-sub">${esc(v.source)} · ${fmt.date(v.created_at)}</span></button>`).join('') || '<div class="text-body-secondary">Thư viện chưa có MP4 nào</div>'}</div></section>
          <section><h6 class="up-step"><span>2</span>Chọn kênh đăng <small class="ms-2 fw-normal" data-ch-count></small></h6>
            <div class="d-flex flex-wrap gap-2 mb-2" data-countries></div>
            <div class="d-flex flex-wrap gap-2 mb-2"><input type="search" class="form-control form-control-sm" placeholder="Tìm theo username hoặc ghi chú…" data-ch-q style="max-width:320px">
              <button type="button" class="btn btn-sm btn-outline-secondary" data-action="ch-all">Chọn hết</button><button type="button" class="btn btn-sm btn-outline-secondary" data-action="ch-none">Bỏ chọn</button></div>
            <div class="up-chips" data-chips></div>
            <div class="form-text mt-2"><i class="bi bi-hourglass-split"></i> Giãn cách <input type="number" min="0" max="1440" value="20" class="form-control form-control-sm d-inline-block mx-1" style="width:70px" data-stagger> phút giữa các kênh. Hệ thống không tự chọn kênh thay bạn.</div></section>
          <section><h6 class="up-step"><span>3</span>Khung giờ đăng</h6>
            <div class="row g-2 mb-2">${GOLDEN.map(([t, l, i]) => `<div class="col-6 col-md-3"><button type="button" class="btn btn-outline-secondary w-100 up-golden" data-action="golden" data-t="${t}"><i class="bi bi-${i} d-block fs-4"></i><b>${t}</b><span class="d-block small">${l}</span></button></div>`).join('')}</div>
            <div class="input-group" style="max-width:340px"><span class="input-group-text"><i class="bi bi-calendar-event"></i></span><input type="datetime-local" class="form-control" data-when></div>
            <div class="form-text">Để trống = đăng ngay khi tới lượt.</div></section>
          <section><h6 class="up-step"><span>4</span>Caption & hashtag</h6>
            <textarea class="form-control" rows="4" maxlength="2200" data-caption placeholder="Nội dung caption…"></textarea>
            <div class="d-flex flex-wrap justify-content-between gap-2 mt-1"><div class="d-flex flex-wrap gap-1">${TAGS.map((t) => `<button type="button" class="btn btn-sm btn-light border" data-action="tag" data-t="${t}">${t}</button>`).join('')}</div><small class="text-body-secondary" data-cap-count>0 / 2200</small></div>
            <input class="form-control mt-2" data-hashtags placeholder="Hashtag">
            <div class="form-check form-switch mt-2"><input class="form-check-input" type="checkbox" id="up-ai" data-ai><label class="form-check-label" for="up-ai">Gắn nhãn "nội dung AI"</label></div></section>
        </div>
        <div class="card-footer d-flex gap-2"><button class="btn btn-primary" data-action="submit"><i class="bi bi-send me-1"></i>Xác nhận & thêm vào lịch đăng</button><button class="btn btn-outline-secondary" data-action="compose-close">Đóng</button></div>
      </div></div>
      <div class="col-xl-4 d-none d-xl-block"><div class="up-phone"><div class="up-phone-screen" data-phone-video><div class="text-center text-white-50"><i class="bi bi-phone fs-1 d-block"></i>Chọn video để xem trước</div></div>
        <div class="up-phone-overlay"><div class="fw-semibold" data-phone-user>@username</div><div class="small text-truncate-2" data-phone-cap>Caption sẽ hiển thị ở đây…</div><div class="small opacity-75"><i class="bi bi-music-note-beamed"></i> Original sound</div></div>
        <div class="up-phone-actions"><i class="bi bi-heart-fill"></i><i class="bi bi-chat-dots-fill"></i><i class="bi bi-bookmark-fill"></i><i class="bi bi-share-fill"></i></div></div></div></div>`;
    const $ = (s) => box.querySelector(s);
    const countries = [...new Set(chs.channels.map(ctry).filter(Boolean))].sort();
    const visible = () => chs.channels.filter((c) => (!state.country || ctry(c) === state.country)
      && (!state.q || `${c.username} ${c.note} ${c.publisher}`.toLowerCase().includes(state.q)));
    function phone() {
      const v = state.video;
      const first = chs.channels.find((c) => state.channels.has(c.id));
      $('[data-phone-user]').textContent = first ? `@${first.username}` : '@username';
      $('[data-phone-cap]').textContent = $('[data-caption]').value || 'Caption sẽ hiển thị ở đây…';
      $('[data-cap-count]').textContent = `${$('[data-caption]').value.length} / 2200`;
      const screen = $('[data-phone-video]');
      if (v && screen.dataset.src !== v.video_path) {
        screen.dataset.src = v.video_path;
        screen.innerHTML = v.stream_url ? `<video src="${esc(v.stream_url)}" muted autoplay loop playsinline></video>` : v.thumbnail_url ? `<img src="${esc(v.thumbnail_url)}" alt="">` : '<i class="bi bi-film fs-1 text-white-50"></i>';
      }
    }
    function renderChips() {
      $('[data-countries]').innerHTML = [['', `Tất cả (${chs.channels.length})`], ...countries.map((c) => [c, `${FLAGS[c] || ''} ${c} (${chs.channels.filter((x) => ctry(x) === c).length})`])]
        .map(([v, l]) => `<button type="button" class="btn btn-sm ${state.country === v ? 'btn-primary' : 'btn-outline-secondary'}" data-action="country" data-c="${v}">${esc(l)}</button>`).join('');
      $('[data-chips]').innerHTML = visible().map((c) => `<button type="button" class="up-chip ${state.channels.has(c.id) ? 'on' : ''}" data-action="chip" data-id="${c.id}">
        ${FLAGS[ctry(c)] || '🌐'} @${esc(c.username || c.id)}${c.note ? `<small>${esc(fmt.short(c.note, 24))}</small>` : ''}</button>`).join('') || '<span class="text-body-secondary small">Không có kênh khớp</span>';
      $('[data-ch-count]').innerHTML = state.channels.size ? `<span class="badge text-bg-primary">${state.channels.size} kênh đã chọn</span>` : '<span class="text-body-secondary">chưa chọn kênh</span>';
      phone();
    }
    $('[data-ch-q]').addEventListener('input', (e) => { state.q = e.target.value.trim().toLowerCase(); renderChips(); });
    $('[data-caption]').addEventListener('input', phone);
    bindActions(box, {
      'compose-close': () => onDone(false),
      'pick-video'(b) {
        state.video = lib.videos[Number(b.dataset.i)];
        box.querySelectorAll('.up-lib-item').forEach((x) => x.classList.toggle('on', x === b));
        if (!$('[data-caption]').value) $('[data-caption]').value = state.video.title || '';
        if (!$('[data-hashtags]').value) $('[data-hashtags]').value = state.video.hashtags || '';
        phone();
      },
      country(b) { state.country = b.dataset.c; renderChips(); },
      chip(b) { const id = Number(b.dataset.id); if (state.channels.has(id)) state.channels.delete(id); else state.channels.add(id); renderChips(); },
      'ch-all'() { visible().forEach((c) => state.channels.add(c.id)); renderChips(); },
      'ch-none'() { visible().forEach((c) => state.channels.delete(c.id)); renderChips(); },
      golden(b) {
        const [H, M] = b.dataset.t.split(':').map(Number);
        const d = new Date(); d.setHours(H, M, 0, 0);
        if (d < new Date()) d.setDate(d.getDate() + 1);
        $('[data-when]').value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(H)}:${pad(M)}`;
        box.querySelectorAll('.up-golden').forEach((x) => x.classList.toggle('active', x === b));
      },
      tag(b) { const el = $('[data-hashtags]'); if (!el.value.split(/\s+/).includes(b.dataset.t)) el.value = `${el.value} ${b.dataset.t}`.trim(); },
      async submit() {
        if (!state.video) { toast('Chọn video nguồn (bước 1)', 'warning'); return; }
        if (!state.channels.size) { toast('Chọn ít nhất một kênh (bước 2)', 'warning'); return; }
        const w = $('[data-when]').value;
        const r = await api.post('/api/upload/create-task', {
          channel_ids: [...state.channels], video_path: state.video.video_path, caption: $('[data-caption]').value, hashtags: $('[data-hashtags]').value,
          scheduled_timestamp: w ? Math.floor(new Date(w).getTime() / 1000) : 0, stagger_minutes: Number($('[data-stagger]').value) || 0, ai_generated: $('[data-ai]').checked,
        });
        toast(r.message || 'Đã xếp lịch', 'success');
        onDone(true);
      },
    });
    renderChips();
  }

  // ------------------------------------------------------------------ lịch tháng + danh sách theo ngày
  function calendar(el, tasks, ym) {
    const [y, m] = ym;
    const days = new Date(y, m + 1, 0).getDate(), lead = (new Date(y, m, 1).getDay() + 6) % 7; // tuần bắt đầu Thứ 2
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let html = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((d) => `<div class="up-cal-head">${d}</div>`).join('');
    for (let i = 0; i < lead; i++) html += '<div class="up-cal-cell other"></div>';
    for (let d = 1; d <= days; d++) {
      const start = new Date(y, m, d).getTime() / 1000, end = start + 86400;
      const ev = tasks.filter((t) => t.schedule_time >= start && t.schedule_time < end).sort((a, b) => a.schedule_time - b.schedule_time);
      html += `<div class="up-cal-cell ${start * 1000 === today.getTime() ? 'today' : ''} ${ev.length ? 'has' : ''}" ${ev.length ? `data-action="day" data-day="${start}" role="button"` : ''}>
        <div class="d-flex justify-content-between"><span class="up-cal-date">${d}</span>${ev.length ? `<span class="badge rounded-pill text-bg-secondary">${ev.length}</span>` : ''}</div>
        ${ev.slice(0, 4).map((t) => `<div class="up-ev text-bg-${STATUS_TONE[t.status] || 'secondary'}" title="${esc(`${hhmm(t.schedule_time)} @${t.username} · ${t.caption || ''}`)}">${hhmm(t.schedule_time)} ${esc(fmt.short(t.username, 12))}</div>`).join('')}
        ${ev.length > 4 ? `<div class="small text-body-secondary">+${ev.length - 4} bài</div>` : ''}</div>`;
    }
    for (let i = 0; i < (7 - ((lead + days) % 7)) % 7; i++) html += '<div class="up-cal-cell other"></div>';
    el.innerHTML = `<div class="card"><div class="card-header d-flex align-items-center gap-2">
      <div class="btn-group btn-group-sm"><button class="btn btn-outline-secondary" data-action="cal" data-d="-1" aria-label="Tháng trước"><i class="bi bi-chevron-left"></i></button><button class="btn btn-outline-secondary" data-action="cal" data-d="1" aria-label="Tháng sau"><i class="bi bi-chevron-right"></i></button></div>
      <h3 class="card-title mb-0">Tháng ${m + 1}, ${y}</h3><button class="btn btn-sm btn-outline-secondary ms-auto" data-action="cal" data-d="0">Hôm nay</button></div>
      <div class="card-body p-2"><div class="up-cal">${html}</div></div></div>`;
  }

  function agenda(el, tasks, days) {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const from = start.getTime() / 1000 - 86400, to = from + (days + 1) * 86400;
    const byDay = new Map();
    tasks.filter((t) => t.schedule_time >= from && t.schedule_time < to).sort((a, b) => a.schedule_time - b.schedule_time).forEach((t) => {
      const d = new Date(t.schedule_time * 1000); d.setHours(0, 0, 0, 0);
      if (!byDay.has(d.getTime())) byDay.set(d.getTime(), []);
      byDay.get(d.getTime()).push(t);
    });
    const label = (k) => {
      const d = new Date(k), diff = Math.round((k - start.getTime()) / 86400000);
      return `${['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'][d.getDay()]}, ${pad(d.getDate())}/${pad(d.getMonth() + 1)}${diff === 0 ? ' · Hôm nay' : diff === 1 ? ' · Ngày mai' : diff === -1 ? ' · Hôm qua' : ''}`;
    };
    el.innerHTML = `<div class="d-flex justify-content-end mb-2"><div class="btn-group btn-group-sm">${[3, 7, 14, 30].map((n) => `<a class="btn btn-outline-secondary ${n === days ? 'active' : ''}" href="#/upload/agenda?days=${n}">${n} ngày</a>`).join('')}</div></div>`
      + (byDay.size ? [...byDay.entries()].map(([k, ts]) => `<div class="card mb-3"><div class="card-header d-flex"><h3 class="card-title">${label(k)}</h3><span class="ms-auto small text-body-secondary">${ts.length} bài · ${ts.filter((t) => t.status === 'SUCCESS').length} đã đăng</span></div>
        <ul class="list-group list-group-flush">${ts.map((t) => `<li class="list-group-item d-flex align-items-center gap-3">
          <span class="mono fw-semibold" style="width:3.2rem">${hhmm(t.schedule_time)}</span><span class="fs-5">${FLAGS[t.country] || '🌐'}</span>
          <span class="flex-grow-1 text-truncate"><b>@${esc(t.username)}</b>${t.niche_name ? ` <span class="badge text-bg-light border">${esc(t.niche_name)}</span>` : ''}<span class="cell-sub text-truncate">${esc(t.caption || (t.video_path || '').split('/').pop())}</span></span>
          ${stBadge(t.status)}<button class="btn btn-sm btn-outline-secondary" data-action="play" data-id="${t.id}" title="Xem video"><i class="bi bi-play-fill"></i></button></li>`).join('')}</ul></div>`).join('')
        : App.empty('Không có bài nào trong khoảng này', 'calendar-x'));
  }

  // ------------------------------------------------------------------ trang
  App.page({
    id: 'upload', group: 'publish', title: 'Lịch đăng', icon: 'calendar2-week',
    desc: 'Lên lịch, theo dõi và xử lý các bài đăng TikTok',
    badge: async () => { const r = await api.get('/api/upload/tasks'); const n = r.tasks.filter((t) => FAILED.includes(t.status)).length; return n ? { text: n, tone: 'danger' } : null; },
    async render(ctx) {
      const view = ['queue', 'calendar', 'agenda'].includes(ctx.sub) ? ctx.sub : 'queue';
      const open = new Set(store.get(OPEN_KEY, []));
      const now = new Date();
      const st = { q: ctx.params.q || '', niche: ctx.params.niche || '', status: ctx.params.status || '',
        ym: ctx.params.month ? (([y, m]) => [Number(y), Number(m) - 1])(ctx.params.month.split('-')) : [now.getFullYear(), now.getMonth()] };
      let tasks = [];
      ctx.el.innerHTML = `<div class="row g-3 mb-1" data-stats></div>
        <div class="d-flex flex-wrap gap-2 align-items-center mb-3">
          <div class="btn-group">${[['queue', 'list-ul', 'Hàng đợi'], ['calendar', 'calendar3', 'Lịch tháng'], ['agenda', 'list-check', 'Danh sách theo ngày']]
            .map(([v, i, l]) => `<a class="btn btn-outline-primary ${v === view ? 'active' : ''}" href="#/upload/${v}"><i class="bi bi-${i} me-1"></i>${l}</a>`).join('')}</div>
          <div class="ms-auto d-flex flex-wrap gap-2"><button class="btn btn-outline-secondary" data-action="live"><i class="bi bi-terminal me-1"></i>Log đăng <span class="badge text-bg-primary d-none" data-live-dot>đang chạy</span></button>
            <button class="btn btn-primary" data-action="compose"><i class="bi bi-plus-lg me-1"></i>Lên lịch video mới</button>
            <button class="btn btn-outline-secondary" data-action="reload" title="Làm mới" aria-label="Làm mới"><i class="bi bi-arrow-clockwise"></i></button></div></div>
        <div data-compose class="mb-3"></div><div data-view></div>`;
      const $ = (s) => ctx.el.querySelector(s);

      function stats() {
        const n = (list) => tasks.filter((t) => list.includes(t.status)).length;
        $('[data-stats]').innerHTML = [['Tổng lịch', tasks.length, 'calendar3', 'primary', ''], ['Chờ đăng', n(WAITING), 'hourglass-split', 'warning', 'QUEUED'],
          ['Đang xuất bản', n(['UPLOADING']), 'rocket-takeoff', 'info', 'UPLOADING'], ['Đã đăng', n(['SUCCESS']), 'check2-circle', 'success', 'SUCCESS'], ['Lỗi / cần kiểm tra', n(FAILED), 'x-octagon', 'danger', 'ERROR']]
          .map(([l, v, i, tone, s]) => `<div class="col-6 col-md"><a class="text-decoration-none text-reset" href="#/upload/queue${s ? '?status=' + s : ''}">${App.infoBox({ label: l, value: fmt.num(v), icon: i, tone })}</a></div>`).join('');
      }
      const filtered = () => {
        const q = st.q.toLowerCase();
        const same = { QUEUED: WAITING, ERROR: FAILED };
        return tasks.filter((t) => (!st.status || (same[st.status] || [st.status]).includes(t.status))
          && (!st.niche || (st.niche === '__none__' ? !t.niche_id : t.niche_id === st.niche))
          && (!q || `${t.username} ${t.channel_id} ${t.niche_name} ${t.matrix_channel_name} ${t.caption}`.toLowerCase().includes(q)));
      };
      function render() {
        stats();
        const box = $('[data-view]');
        if (view === 'calendar') { calendar(box, filtered(), st.ym); return; }
        if (view === 'agenda') { agenda(box, filtered(), Number(ctx.params.days || 7)); return; }
        const all = groupByAccount(tasks), groups = groupByAccount(filtered());
        const niches = new Map(); let none = 0;
        all.forEach((g) => (g.nicheId ? niches.set(g.nicheId, g.nicheName || g.nicheId) : none++));
        box.innerHTML = `<div class="d-flex flex-wrap gap-2 align-items-center mb-2">
          <input type="search" class="form-control form-control-sm" style="max-width:260px" placeholder="Tìm acc, chủ đề, kênh, caption…" value="${esc(st.q)}" data-q>
          <select class="form-select form-select-sm" style="width:auto" data-niche><option value="">Tất cả chủ đề (${all.length} acc)</option>
            ${[...niches.entries()].sort((a, b) => a[1].localeCompare(b[1], 'vi')).map(([id, n]) => `<option value="${esc(id)}" ${id === st.niche ? 'selected' : ''}>${esc(n)}</option>`).join('')}
            ${none ? `<option value="__none__" ${st.niche === '__none__' ? 'selected' : ''}>Chưa gán chủ đề (${none})</option>` : ''}</select>
          ${st.status ? `<a class="btn btn-sm btn-outline-secondary" href="#/upload/queue">${esc(App.STATUS_LABEL[st.status] || st.status)} <i class="bi bi-x"></i></a>` : ''}
          <span class="small text-body-secondary">${groups.length === all.length ? `${all.length} acc` : `${groups.length}/${all.length} acc`}</span>
          <span class="ms-auto"></span><button class="btn btn-sm btn-outline-secondary" data-action="open-all">Mở tất cả</button><button class="btn btn-sm btn-outline-secondary" data-action="close-all">Thu gọn</button></div>
          ${groups.length ? groups.map((g) => groupHtml(g, open.has(g.key))).join('') : App.empty(tasks.length ? 'Không có acc nào khớp bộ lọc' : 'Hàng đợi trống — bấm "Lên lịch video mới"')}`;
        box.querySelector('[data-q]').addEventListener('input', (e) => {
          st.q = e.target.value; ctx.setParams({ q: st.q });
          clearTimeout(render.t);
          render.t = setTimeout(() => { render(); const i = box.querySelector('[data-q]'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250);
        });
        box.querySelector('[data-niche]').addEventListener('change', (e) => { st.niche = e.target.value; ctx.setParams({ niche: st.niche }); render(); });
      }
      async function load() { tasks = (await api.get('/api/upload/tasks')).tasks; render(); }

      // Ngăn kéo log đăng trực tiếp (offcanvas)
      const drawer = h(`<div class="offcanvas offcanvas-end" tabindex="-1" style="width:min(560px,100%)"><div class="offcanvas-header"><h5 class="offcanvas-title"><i class="bi bi-terminal me-2"></i>Log đăng trực tiếp</h5>
        <button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="Đóng"></button></div><div class="offcanvas-body d-flex flex-column"><pre class="log-box flex-grow-1 mb-2" style="max-height:none">Chưa có phiên đăng nào.</pre><div class="small" data-live-state></div></div></div>`);
      document.body.append(drawer);
      const oc = new bootstrap.Offcanvas(drawer);
      ctx.onLeave(() => { oc.hide(); drawer.remove(); document.querySelectorAll('.offcanvas-backdrop').forEach((x) => x.remove()); });
      let wasRunning = false;
      async function live() {
        const s = await api.get('/api/upload/publish-logs');
        $('[data-live-dot]').classList.toggle('d-none', !s.is_running);
        const pre = drawer.querySelector('pre');
        if ((s.logs || []).length) { pre.textContent = s.logs.map((l) => `[${l.time}] ${l.msg ?? l.message ?? ''}`).join('\n'); pre.scrollTop = pre.scrollHeight; }
        drawer.querySelector('[data-live-state]').innerHTML = s.is_running ? `<span class="spinner-border spinner-border-sm me-1"></span>Đang đăng · kênh #${s.channel_id} · task #${s.task_id ?? '—'}` : 'Không có phiên nào đang chạy';
        if (wasRunning && !s.is_running) load();
        wasRunning = s.is_running;
      }

      const find = (b) => tasks.find((t) => t.id === Number(b.dataset.id));
      bindActions(ctx.el, {
        async compose() {
          const box = $('[data-compose]');
          if (box.childElementCount) { box.innerHTML = ''; return; }
          await composer(box, (done) => { box.innerHTML = ''; if (done) load(); });
          box.scrollIntoView({ behavior: 'smooth', block: 'start' });
        },
        reload: () => load(),
        live() { oc.show(); live(); },
        toggle(el, ev) {
          if (ev.target.closest('[data-stop]')) return;
          const k = el.dataset.key;
          if (open.has(k)) open.delete(k); else open.add(k);
          store.set(OPEN_KEY, [...open]); render();
        },
        'open-all'() { groupByAccount(filtered()).forEach((g) => open.add(g.key)); store.set(OPEN_KEY, [...open]); render(); },
        'close-all'() { open.clear(); store.set(OPEN_KEY, []); render(); },
        cal(b) {
          const d = Number(b.dataset.d);
          const n = d ? new Date(st.ym[0], st.ym[1] + d, 1) : new Date();
          st.ym = [n.getFullYear(), n.getMonth()];
          ctx.setParams({ month: `${st.ym[0]}-${st.ym[1] + 1}` }); render();
        },
        day(b) {
          const s = Number(b.dataset.day);
          const ev = filtered().filter((t) => t.schedule_time >= s && t.schedule_time < s + 86400).sort((a, c) => a.schedule_time - c.schedule_time);
          const d = new Date(s * 1000);
          modal({ title: `Bài đăng ngày ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} (${ev.length})`, size: 'lg', body: `<ul class="list-group">${ev.map((t) => `<li class="list-group-item d-flex gap-2 align-items-center">
            <span class="mono fw-semibold">${hhmm(t.schedule_time)}</span><span>${FLAGS[t.country] || '🌐'}</span><span class="flex-grow-1 text-truncate"><b>@${esc(t.username)}</b><span class="cell-sub text-truncate">${esc(t.caption || '')}</span></span>${stBadge(t.status)}</li>`).join('')}</ul>` });
        },
        play(b) {
          const t = find(b);
          modal({ title: (t.video_path || '').split('/').pop() || `Task #${t.id}`, body: `<video src="/api/upload/tasks/${t.id}/video" controls autoplay playsinline class="w-100 rounded bg-black" style="max-height:70vh"></video>
            <div class="small mt-2">${FLAGS[t.country] || '🌐'} @${esc(t.username)} · <i class="bi bi-clock"></i> ${esc(when(t.schedule_time))}${t.niche_name ? ' · ' + esc(t.niche_name) : ''}</div>
            <div class="small text-body-secondary mt-1" style="white-space:pre-wrap">${esc(t.caption || '')}</div>` });
        },
        async publish(b) {
          const t = find(b);
          if (!(await confirm(`Đăng ngay video này lên @${t.username}?`))) return;
          const r = await api.post('/api/upload/publish-now', { task_id: t.id, channel_id: t.channel_id, video_path: t.video_path, caption: t.caption || '',
            hashtags: t.hashtags || '', ai_generated: !!t.ai_generated, video_slug: t.video_slug || null }, { strict: false });
          if (r.success === false) { toast(r.message || 'Không đăng được', 'warning'); return; }
          toast(r.message || 'Đang đăng…', 'success'); oc.show(); live();
        },
        async retry(b) { await api.post(`/api/upload/tasks/${b.dataset.id}/retry`); toast('Đã đưa lại vào hàng đợi', 'success'); load(); },
        async cancel(b) { await api.post(`/api/upload/tasks/${b.dataset.id}/cancel`); toast('Đã huỷ', 'success'); load(); },
        async confirm(b) { if (await confirm('Bạn đã kiểm tra và video thực sự đã lên kênh?')) { await api.post(`/api/upload/tasks/${b.dataset.id}/confirm`); toast('Đã đánh dấu đã đăng', 'success'); load(); } },
        async delete(b) { if (await confirm(`Xoá task #${b.dataset.id}?`, { danger: true, ok: 'Xoá' })) { await api.del(`/api/upload/tasks/${b.dataset.id}`); toast('Đã xoá', 'success'); load(); } },
      });
      await Promise.all([load(), live()]);
      ctx.every(15000, () => { if (!$('[data-compose]').childElementCount) return load(); });
      ctx.every(3000, live);
    },
  });
})();
