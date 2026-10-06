/* Video Studio (Compare Studio / Matrix) — bố cục 2 cột như bản cũ.
 * Trái: thư viện (tìm, sắp xếp, lọc thị trường/thể loại/đã render). Phải: chi tiết video với header (thể loại, brief,
 * chỉnh thời lượng, thông số) và 6 tab: Xem trước · Kịch bản · SEO · Đăng TikTok · Snapshot · Log.
 * URL: #/studio/<slug>/<tab>?q=&style=&market=&rendered=&sort= — reload giữ đúng video, tab và bộ lọc. */
(function () {
  const { api, esc, fmt, toast, bindActions, modal, confirm, empty, h } = App;

  const STYLE = {
    compare: ['⚔️', 'So sánh 2 vật', '30–40s'], survival: ['🏕️', 'Thử thách sinh tồn', '65s'], tierlist: ['🏆', 'Tier list xếp hạng', '60–90s'],
    vox: ['📰', 'Vox phóng sự', '50–65s'], newspaper: ['📜', 'Báo cũ điều tra', '65s'], chalk: ['🗺️', 'Bản đồ bảng phấn', '>60s'],
    wildlife: ['🐾', 'Thế giới động vật', '50–60s'], kinetic: ['⚡', 'Kinetic editorial', '65s'], science: ['🪐', 'Khoa học vũ trụ', '65s'],
    mystery: ['🔍', 'Bí ẩn & kỳ án', '65s'], folklore: ['🕯️', 'Tâm linh dân gian', '70s'], matrix: ['🧬', 'AI Matrix', '25–90s'],
  };
  const MARKET = { vi: ['🇻🇳', 'Việt Nam'], de: ['🇩🇪', 'Đức'], en: ['🇺🇸', 'Anh/Mỹ'], ko: ['🇰🇷', 'Hàn'], ja: ['🇯🇵', 'Nhật'], fr: ['🇫🇷', 'Pháp'] };
  const TABS = [['preview', 'play-btn', 'Xem trước'], ['script', 'file-text', 'Kịch bản'], ['seo', 'stars', 'SEO & phát hành'],
    ['upload', 'send', 'Đăng TikTok'], ['snapshot', 'grid-3x3', 'Snapshot'], ['logs', 'terminal', 'Log tác vụ']];
  const AI_IMAGE_STYLES = ['folklore', 'vox', 'newspaper', 'wildlife', 'mystery', 'tierlist', 'matrix'];
  const runLog = { lines: [], es: null, slug: '' }; // log tác vụ đang chạy, giữ qua lần đổi tab
  const cache = { vids: null, at: 0 };               // danh sách video, tránh tải lại mỗi lần chọn video/tab

  const meta = (type) => STYLE[type] || ['🎬', type || 'Video', ''];
  const sceneKey = (s, i) => s.target || s.side || (s.tierId != null ? `tier-${s.tierId}` : s.shot != null ? `scene-${s.shot}` : s.sceneId != null ? `scene-${s.sceneId}` : s.id || `scene-${i + 1}`);
  const sceneImg = (slug, s, i, bust) => (s.image || (s.side ? `/videos/${slug}/assets/icons/${sceneKey(s, i)}.png` : `/videos/${slug}/assets/images/${sceneKey(s, i)}.jpg`)) + `?t=${bust}`;

  function filterList(vids, p) {
    const q = (p.q || '').toLowerCase();
    let list = vids.filter((v) => (!p.style || v.type === p.style) && (!p.market || v.lang === p.market)
      && (!p.rendered || (p.rendered === '1') === v.hasRender) && (!q || `${v.title} ${v.slug}`.toLowerCase().includes(q)));
    const sorts = { new: (a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''), old: (a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''),
      title: (a, b) => a.title.localeCompare(b.title, 'vi'), dur: (a, b) => b.duration - a.duration };
    return list.sort(sorts[p.sort] || sorts.new);
  }

  function sidebar(el, ctx, vids) {
    const p = ctx.params;
    const count = (k, v) => vids.filter((x) => x[k] === v).length;
    const markets = [...new Set(vids.map((v) => v.lang))].filter(Boolean);
    const styles = [...new Set(vids.map((v) => v.type))].filter(Boolean);
    const link = (patch) => { const q = new URLSearchParams({ ...p, ...patch }); [...q.keys()].forEach((k) => !q.get(k) && q.delete(k)); return `#/studio${ctx.sub ? '/' + encodeURIComponent(ctx.sub) + (ctx.rest[0] ? '/' + ctx.rest[0] : '') : ''}${q.toString() ? '?' + q : ''}`; };
    const list = filterList(vids, p);
    el.innerHTML = `<div class="card st-lib mb-0"><div class="card-header"><h3 class="card-title"><i class="bi bi-collection-play me-2"></i>Thư viện</h3>
      <div class="card-tools"><span class="badge text-bg-secondary">${vids.length} video · ${fmt.dur(vids.reduce((a, v) => a + (v.duration || 0), 0))}</span></div></div>
      <div class="card-body p-2 border-bottom vstack gap-2">
        <div class="d-flex flex-wrap gap-2"><button class="btn btn-sm btn-primary flex-grow-1" data-action="new-ai"><i class="bi bi-magic me-1"></i>Tạo video mới AI</button>
          <button class="btn btn-sm btn-outline-secondary" data-action="matrix" title="Tạo một mẻ video theo Channel DNA"><i class="bi bi-diagram-3 me-1"></i>Matrix batch</button></div>
        <a class="st-item st-template ${ctx.sub === '__template' ? 'active' : ''}" href="#/studio/__template"><i class="bi bi-layout-text-window-reverse fs-4 text-primary"></i>
          <span><span class="st-item-title">Bố cục chuẩn & đánh giá mẫu</span><span class="cell-sub">Nhịp thời gian chuẩn của từng thể loại</span></span></a>
        <div class="input-group input-group-sm"><span class="input-group-text"><i class="bi bi-search"></i></span><input type="search" class="form-control" placeholder="Tìm tiêu đề hoặc slug…" value="${esc(p.q || '')}" data-q></div>
        <div class="d-flex gap-2"><select class="form-select form-select-sm" data-sort>${[['new', 'Mới nhất'], ['old', 'Cũ nhất'], ['title', 'Theo tên'], ['dur', 'Dài nhất']].map(([v, l]) => `<option value="${v}" ${v === (p.sort || 'new') ? 'selected' : ''}>${l}</option>`).join('')}</select>
          <select class="form-select form-select-sm" data-rendered><option value="">Mọi trạng thái</option><option value="1" ${p.rendered === '1' ? 'selected' : ''}>Đã render</option><option value="0" ${p.rendered === '0' ? 'selected' : ''}>Chưa render</option></select></div>
        <div class="st-chips"><a class="st-chip ${!p.market ? 'on' : ''}" href="${link({ market: '' })}">Mọi thị trường</a>${markets.map((m) => `<a class="st-chip ${p.market === m ? 'on' : ''}" href="${link({ market: m })}">${(MARKET[m] || ['🌐'])[0]} ${esc((MARKET[m] || [0, m])[1])} <b>${count('lang', m)}</b></a>`).join('')}</div>
        <div class="st-chips"><a class="st-chip ${!p.style ? 'on' : ''}" href="${link({ style: '' })}">Mọi thể loại</a>${styles.map((s) => `<a class="st-chip ${p.style === s ? 'on' : ''}" href="${link({ style: s })}">${meta(s)[0]} ${esc(meta(s)[1])} <b>${count('type', s)}</b></a>`).join('')}</div>
        <div class="d-flex justify-content-between small text-body-secondary"><span>${list.length} video</span><button class="btn btn-sm btn-link p-0" data-action="gen"><i class="bi bi-magic"></i> Tạo video tự động</button></div>
      </div>
      <div class="st-list">${list.map((v) => `<a class="st-item ${v.slug === ctx.sub ? 'active' : ''}" href="#/studio/${encodeURIComponent(v.slug)}/${ctx.rest[0] || 'preview'}${location.hash.includes('?') ? '?' + location.hash.split('?')[1] : ''}">
        <img src="/api/compare-videos/video/${encodeURIComponent(v.slug)}/poster" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
        <span class="flex-grow-1 min-w-0"><span class="st-item-title">${esc(v.title)}</span>
          <span class="cell-sub">${meta(v.type)[0]} ${esc(meta(v.type)[1])} · ${(MARKET[v.lang] || ['🌐'])[0]} · ${fmt.dur(v.duration)}</span>
          <span class="d-flex gap-1 mt-1">${v.hasRender ? '<span class="badge text-bg-success">Đã render</span>' : '<span class="badge text-bg-warning">Chưa render</span>'}${v.imagesPending ? `<span class="badge text-bg-danger">${v.imagesPending} ảnh chờ</span>` : ''}</span></span></a>`).join('') || `<div class="p-3">${empty('Không có video khớp bộ lọc')}</div>`}</div></div>`;
    el.querySelector('[data-q]').addEventListener('input', (e) => { clearTimeout(sidebar.t); sidebar.t = setTimeout(() => { ctx.setParams({ q: e.target.value.trim() }); sidebar(el, ctx, vids); const i = el.querySelector('[data-q]'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250); });
    el.querySelector('[data-sort]').addEventListener('change', (e) => { ctx.setParams({ sort: e.target.value }); sidebar(el, ctx, vids); });
    el.querySelector('[data-rendered]').addEventListener('change', (e) => { ctx.setParams({ rendered: e.target.value }); sidebar(el, ctx, vids); });
    const act = el.querySelector('.st-item.active');
    if (act) act.scrollIntoView({ block: 'nearest' });
  }

  // ------------------------------------------------------------------ tác vụ + log
  function streamRun(runId, task, slug, onDone) {
    if (runLog.es) runLog.es.close();
    runLog.slug = slug;
    runLog.lines = [`[Khởi chạy] ${task} · ${slug} · run ${runId.slice(0, 8)}`];
    const es = new EventSource(`/api/runs/${runId}/stream`);
    runLog.es = es;
    const paint = () => { const box = document.querySelector('[data-runlog]'); if (box) { box.textContent = runLog.lines.join('\n'); box.scrollTop = box.scrollHeight; } };
    es.onmessage = (e) => { const x = JSON.parse(e.data); runLog.lines.push(x.line ?? ''); if (runLog.lines.length > 3000) runLog.lines.shift(); paint(); };
    es.addEventListener('done', (e) => {
      const code = JSON.parse(e.data).code;
      runLog.lines.push(`\n[Hoàn tất] ${task} kết thúc với mã ${code} (${code === 0 ? 'thành công' : 'lỗi'})`);
      paint(); es.close(); runLog.es = null;
      toast(code === 0 ? `${task}: xong` : `${task}: lỗi (mã ${code})`, code === 0 ? 'success' : 'danger');
      if (onDone) onDone(code);
    });
    es.onerror = () => { es.close(); runLog.es = null; };
    paint();
  }

  async function runTask(slug, task, opts, onDone) {
    const r = await api.post('/api/runs', { slug, task, ...opts });
    toast(`Đã bắt đầu: ${task}`, 'success');
    streamRun(r.id, task, slug, onDone);
  }

  // ------------------------------------------------------------------ các tab
  function tabPreview(el, d, slug) {
    const scenes = d._scenes;
    el.innerHTML = `<div class="row g-3"><div class="col-md-6 d-flex flex-column align-items-center">
      <div class="btn-group btn-group-sm mb-2"><button class="btn btn-outline-primary active" data-action="mode" data-m="render">Bản render ${d.hasRender ? '<span class="badge text-bg-success">MP4</span>' : ''}</button>
        <button class="btn btn-outline-primary" data-action="mode" data-m="canvas">Canvas sống</button></div>
      <div class="st-phone" data-stage>${d.hasRender ? `<video src="/api/videos/${encodeURIComponent(slug)}/render" poster="/api/compare-videos/video/${encodeURIComponent(slug)}/poster" preload="metadata" controls playsinline></video>` : `<div class="text-white-50 text-center p-4"><i class="bi bi-film fs-1 d-block"></i>Chưa render — bấm "Render" hoặc xem Canvas sống</div>`}</div>
      <div class="small text-body-secondary mt-2">1080×1920 · ${fmt.dur(d.duration)} · H.264</div></div>
      <div class="col-md-6"><div class="card mb-0"><div class="card-header"><h3 class="card-title"><i class="bi bi-info-circle me-2"></i>Thông số</h3></div><div class="card-body"><dl class="row kv mb-0">
        <dt class="col-5">Thể loại</dt><dd class="col-7">${meta(d.type)[0]} ${esc(meta(d.type)[1])}</dd>
        <dt class="col-5">Thời lượng</dt><dd class="col-7">${fmt.dur(d.duration)} <span class="text-body-secondary">(chuẩn ${esc(meta(d.type)[2])})</span></dd>
        <dt class="col-5">Giọng đọc</dt><dd class="col-7">${esc((d.spec && d.spec.voice) || 'TTS mặc định')}</dd>
        <dt class="col-5">Nhạc nền</dt><dd class="col-7">${esc((d.spec && d.spec.bgm) || '—')}</dd>
        <dt class="col-5">Số cảnh</dt><dd class="col-7">${scenes.length || d.lines}</dd>
        <dt class="col-5">Bản render</dt><dd class="col-7">${d.render ? `${fmt.bytes(d.render.size)} · ${fmt.time(d.render.mtime)}` : '<span class="text-warning">Chưa có</span>'}</dd>
        <dt class="col-5">Ảnh chờ</dt><dd class="col-7">${d.imagesPending ? `<span class="text-danger">${d.imagesPending} ảnh</span>` : 'Đủ ảnh'}</dd></dl>
        <div class="d-flex flex-wrap gap-2 mt-3">${d.hasRender ? `<a class="btn btn-sm btn-outline-secondary" href="/api/videos/${encodeURIComponent(slug)}/download"><i class="bi bi-download me-1"></i>Tải MP4</a>` : ''}
          <a class="btn btn-sm btn-outline-secondary" href="/videos/${encodeURIComponent(slug)}/index.html" target="_blank" rel="noopener"><i class="bi bi-box-arrow-up-right me-1"></i>Mở composition</a></div></div></div></div></div>`;
    bindActions(el, {
      mode(b) {
        el.querySelectorAll('[data-action=mode]').forEach((x) => x.classList.toggle('active', x === b));
        el.querySelector('[data-stage]').innerHTML = b.dataset.m === 'canvas'
          ? `<iframe src="/videos/${encodeURIComponent(slug)}/index.html" title="Canvas" loading="lazy"></iframe>`
          : d.hasRender ? `<video src="/api/videos/${encodeURIComponent(slug)}/render" controls playsinline></video>` : '<div class="text-white-50 p-4">Chưa render</div>';
      },
    });
  }

  function tabScript(el, d, slug, reload) {
    const scenes = d._scenes;
    const orig = scenes.map((s) => s.spoken || s.caption || s.line || s.text || '');
    const edited = orig.slice();
    const bust = Date.now();
    if (!scenes.length) { el.innerHTML = empty('Chưa có phân cảnh nào'); return; }
    el.innerHTML = `<div class="d-flex align-items-center gap-2 mb-3"><span class="small text-body-secondary">${scenes.length} phân cảnh · sửa lời rồi lưu để đọc lại giọng và khớp thời gian</span>
      <button class="btn btn-sm btn-outline-secondary ms-auto d-none" data-action="reset"><i class="bi bi-arrow-counterclockwise me-1"></i>Hoàn tác</button>
      <button class="btn btn-sm btn-primary" data-action="save" disabled><i class="bi bi-save me-1"></i>Lưu kịch bản & retime</button></div>
      <div class="vstack gap-2">${scenes.map((s, i) => {
        const beat = s.beat || s.badge || s.title || `Nhịp ${i + 1}`;
        const start = typeof s.start === 'number' ? s.start : i * 3.6;
        const dur = typeof s.duration === 'number' ? s.duration : typeof s.dur === 'number' ? s.dur : 3.5;
        const tone = /hook|cta/i.test(beat) ? 'success' : /question|compare|summary/i.test(beat) ? 'warning' : /rule|payoff|stakes|cấp/i.test(beat) ? 'danger' : 'secondary';
        return `<div class="card mb-0"><div class="card-body p-2"><div class="d-flex flex-wrap align-items-center gap-2 mb-2">
          <b class="text-body-secondary">#${i + 1}</b><span class="badge text-bg-${tone}">${esc(beat)}</span><span class="small text-body-secondary mono">${start.toFixed(1)}s – ${(start + dur).toFixed(1)}s</span>
          <button class="btn btn-sm btn-outline-secondary ms-auto" data-action="listen" data-i="${i}"><i class="bi bi-volume-up"></i> Nghe</button></div>
          <div class="row g-2"><div class="col"><textarea class="form-control form-control-sm" rows="2" data-i="${i}">${esc(orig[i])}</textarea>
            <div class="cell-sub mt-1">Phụ đề: <span class="text-primary">${esc((s.highlightWords && s.highlightWords.join(' • ')) || s.caption || orig[i])}</span></div></div>
          <div class="col-auto text-center" style="width:130px"><img class="st-beat-img" src="${esc(sceneImg(slug, s, i, bust))}" alt="" onerror="this.style.opacity=.15">
            <button class="btn btn-sm btn-outline-secondary w-100 mt-1" data-action="img" data-i="${i}"><i class="bi bi-image"></i> Đổi ảnh</button></div></div></div></div>`;
      }).join('')}</div>`;
    const dirty = () => {
      const ch = edited.some((t, i) => t !== orig[i]);
      el.querySelector('[data-action=save]').disabled = !ch;
      el.querySelector('[data-action=reset]').classList.toggle('d-none', !ch);
    };
    el.addEventListener('input', (e) => { if (e.target.matches('textarea[data-i]')) { edited[Number(e.target.dataset.i)] = e.target.value; dirty(); } });
    bindActions(el, {
      reset() { tabScript(el, d, slug, reload); },
      async save() { await api.post(`/api/videos/${encodeURIComponent(slug)}/edit-script`, { captions: edited }); toast('Đã lưu kịch bản và đồng bộ thời gian', 'success'); reload(); },
      listen(b) {
        const t = edited[Number(b.dataset.i)];
        const voice = (d.spec && d.spec.voice) || '';
        new Audio(`/api/tts/preview?voice=${encodeURIComponent(voice)}&lang=${encodeURIComponent(d.lang || '')}&text=${encodeURIComponent(t)}`).play().catch(() => toast('Không phát được câu này', 'warning'));
      },
      img(b) { const i = Number(b.dataset.i); changeImage(slug, sceneKey(scenes[i], i), scenes[i].beat || `Cảnh ${i + 1}`, scenes[i].imagePrompt || scenes[i].visualPrompt || edited[i], reload); },
    });
  }

  async function changeImage(slug, target, label, prompt, reload) {
    const body = h(`<div><ul class="nav nav-pills nav-fill mb-3">${[['ai', 'Vẽ bằng AI'], ['gallery', 'Thư viện ảnh'], ['url', 'Link ảnh'], ['upload', 'Tải lên']].map(([k, l], i) => `<li class="nav-item"><a class="nav-link ${i ? '' : 'active'}" href="#" data-t="${k}">${l}</a></li>`).join('')}</ul>
      <div data-p="ai"><label class="form-label">Mô tả ảnh (đưa vào hàng đợi Antigravity)</label><textarea class="form-control" rows="4" name="prompt">${esc(prompt || '')}</textarea></div>
      <div data-p="gallery" class="d-none"><div class="st-gallery">${App.spinner()}</div></div>
      <div data-p="url" class="d-none"><label class="form-label">Link ảnh</label><input class="form-control" name="url" placeholder="https://…"></div>
      <div data-p="upload" class="d-none"><input class="form-control" type="file" name="file" accept="image/*"></div></div>`);
    let tab = 'ai', picked = '';
    body.querySelectorAll('[data-t]').forEach((a) => a.addEventListener('click', async (e) => {
      e.preventDefault(); tab = a.dataset.t;
      body.querySelectorAll('[data-t]').forEach((x) => x.classList.toggle('active', x === a));
      body.querySelectorAll('[data-p]').forEach((x) => x.classList.toggle('d-none', x.dataset.p !== tab));
      if (tab === 'gallery') {
        const g = await api.get('/api/ai-images/gallery', { page_size: 60 });
        const box = body.querySelector('.st-gallery');
        box.innerHTML = g.images.map((i) => `<img src="${esc(i.url)}" data-u="${esc(i.url)}" alt="" loading="lazy" title="${esc(i.prompt || '')}">`).join('') || empty('Thư viện trống');
        box.addEventListener('click', (ev) => { const im = ev.target.closest('img[data-u]'); if (!im) return; picked = new URL(im.dataset.u, location.href).href; box.querySelectorAll('img').forEach((x) => x.classList.toggle('on', x === im)); });
      }
    }));
    await modal({ title: `Đổi ảnh: ${label}`, body, size: 'lg', buttons: [{ label: 'Huỷ', cls: 'btn-outline-secondary', value: null }, { label: 'Áp dụng', cls: 'btn-primary', onClick: async () => {
      let payload;
      if (tab === 'ai') payload = { target, type: 'antigravity', prompt: body.querySelector('[name=prompt]').value.trim() };
      else if (tab === 'gallery') { if (!picked) { toast('Chọn một ảnh', 'warning'); return false; } payload = { target, type: 'url', url: picked }; }
      else if (tab === 'url') payload = { target, type: 'url', url: body.querySelector('[name=url]').value.trim() };
      else {
        const f = body.querySelector('[name=file]').files[0];
        if (!f) { toast('Chọn file ảnh', 'warning'); return false; }
        const data = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f); });
        payload = { target, type: 'upload', data };
      }
      const r = await api.post(`/api/videos/${encodeURIComponent(slug)}/change-image`, payload);
      toast(r.message || (tab === 'ai' ? 'Đã gửi yêu cầu vẽ ảnh' : 'Đã đổi ảnh'), 'success');
      reload();
      return true;
    } }] });
  }

  async function tabSeo(el, slug) {
    const k = await api.get(`/api/videos/${encodeURIComponent(slug)}/publishing-kit`).catch((e) => ({ error: e.message }));
    if (k.error) { el.innerHTML = `<div class="alert alert-warning">${esc(k.error)}</div>`; return; }
    el.innerHTML = `<div class="row g-3"><div class="col-lg-7">
      <div class="card"><div class="card-header"><h3 class="card-title"><i class="bi bi-lightning me-2"></i>Tiêu đề gợi ý</h3></div><ul class="list-group list-group-flush">${(k.titles || []).map((t) =>
        `<li class="list-group-item d-flex gap-2 align-items-center"><span class="flex-grow-1">${esc(t.title)}${t.style ? `<span class="cell-sub">${esc(t.style)}</span>` : ''}</span><button class="btn btn-sm btn-outline-secondary" data-action="copy" data-v="${esc(t.title)}"><i class="bi bi-clipboard"></i></button></li>`).join('')}</ul></div>
      <div class="card"><div class="card-header"><h3 class="card-title">Mô tả</h3><div class="card-tools"><button class="btn btn-tool" data-action="copy" data-v="${esc(k.caption || k.description || '')}"><i class="bi bi-clipboard"></i></button></div></div><div class="card-body" style="white-space:pre-wrap">${esc(k.caption || k.description || '')}</div></div>
      <div class="card mb-0"><div class="card-header"><h3 class="card-title">Hashtag</h3><div class="card-tools"><button class="btn btn-tool" data-action="copy" data-v="${esc(k.hashtagString || '')}"><i class="bi bi-clipboard"></i></button></div></div>
        <div class="card-body d-flex flex-wrap gap-1">${(k.hashtags || []).map((t) => `<span class="badge text-bg-light border">${esc(typeof t === 'string' ? t : t.tag || '')}</span>`).join('')}</div></div></div>
      <div class="col-lg-5"><div class="card mb-0"><div class="card-header"><h3 class="card-title">Ảnh bìa</h3><div class="card-tools"><a class="btn btn-tool" href="/api/videos/${encodeURIComponent(slug)}/thumbnail" download><i class="bi bi-download"></i></a></div></div>
        <div class="card-body text-center"><img src="/api/videos/${encodeURIComponent(slug)}/thumbnail" class="img-fluid rounded" style="max-height:420px" alt="" onerror="this.replaceWith(document.createTextNode('Chưa có ảnh bìa'))"></div></div></div></div>`;
    bindActions(el, { copy(b) { navigator.clipboard.writeText(b.dataset.v).then(() => toast('Đã copy', 'success')); } });
  }

  async function tabUpload(el, ctx, d, slug) {
    const [chs, kit] = await Promise.all([api.get('/api/channels'), api.get(`/api/videos/${encodeURIComponent(slug)}/publishing-kit`).catch(() => null)]);
    const ready = d.hasRender && !d.imagesPending;
    el.innerHTML = `<div class="row g-3"><div class="col-lg-7"><div class="card mb-0"><div class="card-header"><h3 class="card-title"><i class="bi bi-send me-2"></i>Đăng lên TikTok Studio</h3></div><div class="card-body vstack gap-3">
      <div class="alert alert-${ready ? 'success' : 'warning'} py-2 mb-0 small">${ready ? 'Video đã render, đủ ảnh — sẵn sàng đăng.' : d.imagesPending ? `Còn ${d.imagesPending} ảnh chờ Antigravity — chưa đăng được.` : 'Chưa có bản render MP4 — render trước khi đăng.'}</div>
      <div><label class="form-label">Kênh</label><select class="form-select" name="ch"><option value="">— chọn kênh —</option>${chs.channels.map((c) => `<option value="${c.id}">@${esc(c.username || c.id)} · ${esc(c.original_country || c.country)}${c.note ? ' · ' + esc(fmt.short(c.note, 30)) : ''}</option>`).join('')}</select>
        <div class="form-text" data-warn></div></div>
      ${kit && kit.titles && kit.titles.length ? `<div><label class="form-label">Tiêu đề gợi ý</label><select class="form-select" name="preset"><option value="">—</option>${kit.titles.map((t, i) => `<option value="${i}">${esc(t.title)}</option>`).join('')}</select></div>` : ''}
      <div><label class="form-label">Caption</label><textarea class="form-control" rows="4" maxlength="2200" name="caption">${esc(kit ? kit.caption : d.title)}</textarea><div class="form-text text-end" data-cnt></div></div>
      <div><label class="form-label">Hashtag</label><input class="form-control" name="tags" value="${esc(kit ? kit.hashtagString : '')}"></div>
      <div class="row g-2"><div class="col-sm-6"><label class="form-label">Giờ đăng</label><input type="datetime-local" class="form-control" name="when"><div class="form-text">Trống = vào hàng đợi ngay</div></div>
        <div class="col-sm-6 d-flex align-items-end"><div class="form-check form-switch"><input class="form-check-input" type="checkbox" id="st-ai" name="ai"><label class="form-check-label" for="st-ai">Gắn nhãn nội dung AI</label></div></div></div>
      <div class="d-flex flex-wrap gap-2"><button class="btn btn-primary" data-action="queue" ${ready ? '' : 'disabled'}><i class="bi bi-calendar-plus me-1"></i>Xếp lịch đăng</button>
        <button class="btn btn-outline-secondary" data-action="dry" ${ready ? '' : 'disabled'} title="Mở TikTok Studio, điền form nhưng không bấm Đăng"><i class="bi bi-eye me-1"></i>Chạy khô</button></div></div></div></div>
      <div class="col-lg-5"><div class="card"><div class="card-header"><h3 class="card-title">Task đăng của video này</h3></div><div class="card-body p-0" data-tasks>${App.spinner()}</div></div>
        <div class="card mb-0"><div class="card-header"><h3 class="card-title"><i class="bi bi-terminal me-2"></i>Log đăng</h3></div><div class="card-body p-2"><pre class="log-box mb-0" data-plog style="max-height:260px">—</pre></div></div></div></div>`;
    const f = (n) => el.querySelector(`[name=${n}]`);
    const cnt = () => { el.querySelector('[data-cnt]').textContent = `${f('caption').value.length + f('tags').value.length + 1} / 2200`; };
    f('caption').addEventListener('input', cnt); f('tags').addEventListener('input', cnt); cnt();
    if (f('preset')) f('preset').addEventListener('change', (e) => { const t = kit.titles[Number(e.target.value)]; if (t) f('caption').value = t.title + (kit.description ? `\n\n${kit.description}` : ''); cnt(); });
    f('ch').addEventListener('change', () => {
      const c = chs.channels.find((x) => String(x.id) === f('ch').value);
      const lang = { DE: 'de', GB: 'en', US: 'en', KR: 'ko', JP: 'ja', VN: 'vi' }[(c && (c.original_country || c.country) || '').toUpperCase()];
      el.querySelector('[data-warn]').innerHTML = c && lang && d.lang && lang !== d.lang ? `<span class="text-danger"><i class="bi bi-exclamation-triangle"></i> Video tiếng ${esc(d.lang)} nhưng kênh ở nước dùng tiếng ${lang}.</span>` : '';
    });
    async function tasks() {
      const r = await api.get('/api/upload/tasks');
      const mine = r.tasks.filter((t) => t.video_slug === slug || (t.video_path || '').includes(`/videos/${slug}/`));
      el.querySelector('[data-tasks]').innerHTML = mine.length ? `<ul class="list-group list-group-flush">${mine.slice(0, 12).map((t) => `<li class="list-group-item small">
        <div class="d-flex gap-2 align-items-center"><b>@${esc(t.username)}</b><span class="badge text-bg-${App.statusTone(t.status)}">${esc(App.STATUS_LABEL[t.status] || t.status)}</span><span class="ms-auto text-body-secondary">${fmt.time(t.schedule_time)}</span></div>
        ${t.error_message ? `<div class="text-danger">${esc(fmt.short(t.error_message, 120))}</div>` : ''}${t.verify_note ? `<div>${esc(t.verify_note)}</div>` : ''}
        <div class="mt-1 d-flex gap-1">${['QUEUED', 'PENDING', 'WAITING_RENDER'].includes(t.status) ? `<button class="btn btn-sm btn-outline-warning" data-action="tcancel" data-id="${t.id}">Huỷ</button>` : ''}
          ${t.status === 'NEEDS_CHECK' ? `<button class="btn btn-sm btn-outline-success" data-action="tconfirm" data-id="${t.id}">Đã lên kênh</button>` : ''}
          ${['ERROR', 'CANCELLED'].includes(t.status) && !t.clicked_post_at ? `<button class="btn btn-sm btn-outline-primary" data-action="tretry" data-id="${t.id}">Thử lại</button>` : ''}
          ${t.result_url ? `<a class="btn btn-sm btn-link" href="${esc(t.result_url)}" target="_blank" rel="noopener">Mở video</a>` : ''}</div></li>`).join('')}</ul>` : '<div class="p-3 small text-body-secondary">Chưa có task nào.</div>';
    }
    async function plog() {
      const s = await api.get('/api/upload/publish-logs');
      const pre = el.querySelector('[data-plog]');
      if (!pre) return;
      pre.textContent = (s.logs || []).map((l) => `[${l.time}] ${l.msg ?? l.message ?? ''}`).join('\n') || (s.is_running ? 'Đang chạy…' : 'Không có phiên nào đang chạy');
      if (!s.is_running && s.dry_run && s.screenshot) pre.textContent += `\nẢnh chụp chạy khô: ${s.screenshot}`;
      pre.scrollTop = pre.scrollHeight;
    }
    const body = (extra = {}) => {
      if (!f('ch').value) { toast('Chọn kênh đăng', 'warning'); return null; }
      return { slug, channel_id: Number(f('ch').value), caption: f('caption').value, hashtags: f('tags').value, ai_generated: f('ai').checked, ...extra };
    };
    bindActions(el, {
      async queue() {
        const b = body({ schedule_time: f('when').value ? Math.floor(new Date(f('when').value).getTime() / 1000) : null });
        if (!b) return;
        try { toast((await api.post('/api/compare-videos/send-to-upload', b)).message, 'success'); }
        catch (e) {
          if (!(e.data && e.data.needsConfirm && (await confirm(`${e.message}. Vẫn xếp lịch?`)))) throw e;
          toast((await api.post('/api/compare-videos/send-to-upload', { ...b, confirm_nearby: true })).message, 'success');
        }
        tasks();
      },
      async dry() {
        const b = body();
        if (!b) return;
        const r = await api.post('/api/upload/dry-run', { channel_id: b.channel_id, video_slug: slug, caption: b.caption, hashtags: b.hashtags, ai_generated: b.ai_generated }, { strict: false });
        toast(r.message || 'Đã bắt đầu chạy khô', r.success === false ? 'warning' : 'success');
      },
      async tcancel(b) { await api.post(`/api/upload/tasks/${b.dataset.id}/cancel`); tasks(); },
      async tconfirm(b) { if (await confirm('Video thực sự đã lên kênh?')) { await api.post(`/api/upload/tasks/${b.dataset.id}/confirm`); tasks(); } },
      async tretry(b) { if (await confirm('Thử lại sẽ đăng video này lần nữa. Tiếp tục?')) { await api.post(`/api/upload/tasks/${b.dataset.id}/retry`); tasks(); } },
    });
    await Promise.all([tasks(), plog()]);
    ctx.every(3000, plog);
    ctx.every(15000, tasks);
  }

  // ------------------------------------------------------------------ chi tiết
  async function detail(el, ctx, slug) {
    const tab = TABS.some(([t]) => t === ctx.rest[0]) ? ctx.rest[0] : 'preview';
    const d = await api.get(`/api/videos/${encodeURIComponent(slug)}`);
    d._scenes = (d.script && d.script.length) ? d.script : ((d.spec && d.spec.scenes) || []);
    const [icon, name, bench] = meta(d.type);
    const reload = () => { cache.at = 0; if (ctx.alive) detail(el, ctx, slug); };
    el.innerHTML = `<div class="card card-outline card-primary st-head"><div class="card-body">
      <div class="d-flex flex-wrap gap-2 align-items-start"><div class="flex-grow-1 min-w-0">
        <span class="badge text-bg-primary">${icon} ${esc(name)}</span> <span class="small text-body-secondary">Khung chuẩn ${esc(bench)}</span>
        <h4 class="mt-2 mb-1">${esc(d.title || slug)}</h4><div class="small text-body-secondary">${esc(d.message || d.brief || 'Chưa có tóm tắt kịch bản')}</div><div class="cell-sub mono mt-1">${esc(slug)}</div></div>
        <div class="d-flex flex-wrap gap-2"><button class="btn btn-sm btn-outline-primary" data-action="run" data-task="check"><i class="bi bi-clipboard-check me-1"></i>Kiểm tra</button>
          <button class="btn btn-sm btn-primary" data-action="run" data-task="render" ${d.imagesPending ? 'disabled title="Còn ảnh chờ"' : ''}><i class="bi bi-film me-1"></i>Render</button>
          ${AI_IMAGE_STYLES.includes(d.type) || d.imagesPending ? `<button class="btn btn-sm btn-outline-secondary" data-action="run" data-task="images"><i class="bi bi-stars me-1"></i>Ảnh Antigravity${d.imagesPending ? ` (chờ ${d.imagesPending})` : ''}</button>` : ''}
          <button class="btn btn-sm btn-outline-secondary" data-action="run" data-task="vo"><i class="bi bi-mic me-1"></i>Tạo lại giọng</button></div></div>
      <div class="d-flex flex-wrap gap-2 mt-3 align-items-center">
        <span class="st-pill"><i class="bi bi-translate"></i> ${esc((MARKET[d.lang] || [0, d.lang])[1])}</span><span class="st-pill"><i class="bi bi-stopwatch"></i> ${fmt.dur(d.duration)}</span>
        <span class="st-pill"><i class="bi bi-list-ol"></i> ${d._scenes.length || d.lines} câu</span>
        <span class="st-pill ${d.hasRender ? 'ok' : ''}"><i class="bi bi-film"></i> ${d.render ? `${fmt.bytes(d.render.size)} · ${fmt.date(d.render.mtime)}` : 'Chưa xuất bản'}</span>
        <div class="input-group input-group-sm ms-auto" style="width:auto"><span class="input-group-text">Khớp thời lượng</span><input type="number" class="form-control" style="width:80px" min="10" max="180" value="${Math.round(d.duration || 60)}" data-target>
          <span class="input-group-text"><input class="form-check-input mt-0 me-1" type="checkbox" data-also> render</span><button class="btn btn-outline-primary" data-action="fit">Áp dụng</button></div></div></div></div>
      <ul class="nav nav-tabs mb-3">${TABS.map(([t, i, l]) => `<li class="nav-item"><a class="nav-link ${t === tab ? 'active' : ''}" href="#/studio/${encodeURIComponent(slug)}/${t}${location.hash.includes('?') ? '?' + location.hash.split('?')[1] : ''}"><i class="bi bi-${i} me-1"></i>${l}</a></li>`).join('')}</ul>
      <div data-tab></div>`;
    const box = el.querySelector('[data-tab]');
    bindActions(el.querySelector('.st-head'), {
      async run(b) {
        await runTask(slug, b.dataset.task, {}, () => reload());
        if (tab !== 'logs') location.hash = `#/studio/${encodeURIComponent(slug)}/logs`;
      },
      async fit() {
        const target = Number(el.querySelector('[data-target]').value);
        await runTask(slug, 'fit', { target, render: el.querySelector('[data-also]').checked }, () => reload());
        if (tab !== 'logs') location.hash = `#/studio/${encodeURIComponent(slug)}/logs`;
      },
    });
    if (tab === 'preview') tabPreview(box, d, slug);
    else if (tab === 'script') tabScript(box, d, slug, reload);
    else if (tab === 'seo') await tabSeo(box, slug);
    else if (tab === 'upload') await tabUpload(box, ctx, d, slug);
    else if (tab === 'snapshot') box.innerHTML = `<div class="card"><div class="card-body text-center">${d.hasSnapshot ? `<img src="/api/videos/${encodeURIComponent(slug)}/snapshot?t=${Date.now()}" class="img-fluid rounded" alt="Snapshot">` : empty('Chưa có contact sheet — chạy "Kiểm tra" để tạo', 'grid-3x3')}</div></div>`;
    else {
      box.innerHTML = `<div class="card"><div class="card-header"><h3 class="card-title"><i class="bi bi-terminal me-2"></i>Log tác vụ ${runLog.slug ? `<span class="small text-body-secondary">· ${esc(runLog.slug)}</span>` : ''}</h3><div class="card-tools">${runLog.es ? '<span class="badge text-bg-primary"><span class="spinner-border spinner-border-sm"></span> đang chạy</span>' : ''}</div></div>
        <div class="card-body p-2"><pre class="log-box mb-0" style="max-height:60vh" data-runlog>${esc(runLog.lines.join('\n') || 'Chưa chạy tác vụ nào trong phiên này. Dùng các nút Kiểm tra / Render / Khớp thời lượng ở trên.')}</pre></div></div>`;
      const pre = box.querySelector('pre'); pre.scrollTop = pre.scrollHeight;
    }
  }

  /** Cửa sổ Tạo video mới (legacy_studio.js) gọi khi tác vụ create bắt đầu: mở tab Log của video mới. */
  window.StudioRunStream = (runId, task, slug) => {
    cache.at = 0;
    streamRun(runId, task, slug, () => { cache.at = 0; });
    location.hash = `#/studio/${encodeURIComponent(slug)}/logs`;
  };

  App.page({
    id: 'studio', group: 'production', title: 'Video Studio', icon: 'collection-play',
    desc: 'Compare Studio / Matrix: xem trước, sửa kịch bản, đổi ảnh, render, xếp lịch đăng',
    async render(ctx) {
      ctx.el.innerHTML = '<div class="row g-3"><div class="col-xl-4 col-lg-5" data-side></div><div class="col-xl-8 col-lg-7" data-main></div></div>';
      const fresh = cache.at && Date.now() - cache.at < 60000 && !ctx.params.reload;
      const vids = fresh ? cache.vids : (cache.vids = await api.get('/api/videos'), cache.at = Date.now(), cache.vids);
      const side = ctx.el.querySelector('[data-side]'), main = ctx.el.querySelector('[data-main]');
      sidebar(side, ctx, vids);
      bindActions(side, {
        'new-ai': () => window.LegacyStudio.openNew(),
        matrix: () => window.LegacyStudio.openMatrix(),
        async gen() {
          const st = await api.get('/api/compare-videos/status');
          if (st.is_running) { toast('Đang có tiến trình tạo video chạy', 'warning'); return; }
          const v = await App.formModal({ title: 'Tạo video tự động', submit: 'Bắt đầu', fields: [
            { name: 'style', label: 'Thể loại', type: 'select', options: Object.keys(STYLE).filter((k) => k !== 'matrix').map((k) => [k, `${STYLE[k][0]} ${STYLE[k][1]}`]), value: 'compare' },
            { name: 'category', label: 'Chủ đề / danh mục (để trống = tự chọn)' },
            { name: 'render', label: 'Render luôn sau khi tạo', type: 'checkbox', value: true }] });
          if (!v) return;
          const r = await api.post('/api/compare-videos/generate', v);
          toast(r.message, r.status === 'started' ? 'success' : 'warning');
        },
      });
      if (ctx.sub === '__template') {
        main.innerHTML = `<div class="d-flex justify-content-end mb-2"><button class="btn btn-sm btn-outline-primary" data-action="zones"><i class="bi bi-phone me-1"></i>Bố cục 3 vùng (9:16)</button></div><div data-tpl></div>`;
        window.LegacyStudio.renderTemplate(main.querySelector('[data-tpl]'));
        bindActions(main, { zones: () => window.LegacyStudio.openLayout() });
        return;
      }
      const slug = ctx.sub || (filterList(vids, ctx.params)[0] || {}).slug;
      if (!slug) { main.innerHTML = empty('Chưa có video nào'); return; }
      if (!ctx.sub) { history.replaceState(null, '', `#/studio/${encodeURIComponent(slug)}/preview${location.hash.includes('?') ? '?' + location.hash.split('?')[1] : ''}`); ctx.sub = slug; ctx.rest = ['preview']; sidebar(side, ctx, vids); }
      try { await detail(main, ctx, slug); }
      catch (e) { main.innerHTML = `<div class="alert alert-danger">Không tải được video ${esc(slug)}: ${esc(e.message)}</div>`; }
    },
  });
})();
