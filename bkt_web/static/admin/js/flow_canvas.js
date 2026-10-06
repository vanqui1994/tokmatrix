// Sơ đồ luồng live (kiểu n8n): Autopilot, Đăng TikTok, Script Queue.
// Bố cục node cố định ở đây; số liệu lấy từ GET /api/flow/{flow}. Chỉ đọc.
// Trang #/flow (admin/js/pages/flow.js) dựng khung #pane-flow rồi gọi loadFlowView(flow); rời trang gọi stopFlowView().
(function () {
  'use strict';

  const ICONS = {
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    calendar: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    layers: '<path d="m12 2 10 5-10 5L2 7l10-5z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>',
    pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
    film: '<rect x="2" y="3" width="20" height="18" rx="2"/><path d="M7 3v18M17 3v18M2 8h5M2 16h5M17 8h5M17 16h5"/>',
    branch: '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="8" r="2.5"/><path d="M6 8.5v7M18 10.5c0 4-6 3-10.5 6"/>',
    send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
    alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    pause: '<circle cx="12" cy="12" r="9"/><path d="M10 9v6M14 9v6"/>',
    sparkles: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 17l.8 2.2L22 20l-2.2.8L19 23l-.8-2.2L16 20l2.2-.8z"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5"/>',
    db: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z"/>',
    key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.3-9.3M16 7l3 3M19 4l2 2"/>',
    browser: '<rect x="2" y="3" width="20" height="18" rx="2"/><path d="M2 8h20M6 5.5h.01M9 5.5h.01"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    help: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>',
    x: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z"/>',
    bot: '<rect x="3" y="8" width="18" height="12" rx="3"/><path d="M12 8V4M8 14h.01M16 14h.01M9 18h6"/><circle cx="12" cy="3" r="1"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 15l2 2 4-4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
  };

  // kind: trigger | action | if | sub | sink ; tone: màu nền icon
  const FLOWS = {
    autopilot: {
      label: 'Autopilot',
      nodes: [
        { id: 'trigger', kind: 'trigger', x: 80, y: 220, icon: 'clock', tone: 'orange', label: 'Lịch Autopilot', sub: 'daemon · theo chu kỳ',
          desc: 'Daemon autopilot-daemon chạy một cycle mỗi check_interval_seconds khi enabled=true và không tạm dừng (paused). Mỗi lượt ghi vào autopilot_runs.' },
        { id: 'plan', kind: 'action', x: 270, y: 220, icon: 'calendar', tone: 'blue', label: 'Lập kế hoạch ngày', sub: 'niche → topic',
          desc: 'Từ plan_hour, mỗi niche có kênh nhận một topic chưa dùng (file topics/<niche>.txt, rồi bảng topics READY của Matrix). Ghi autopilot_plans.' },
        { id: 'batch', kind: 'action', x: 460, y: 220, icon: 'layers', tone: 'purple', label: 'Matrix batch', sub: 'batch-matrix.mjs',
          desc: 'Chạy node tools/batch-matrix.mjs cho mọi kênh của niche; mỗi kênh là một content_job.' },
        { id: 'script', kind: 'action', x: 650, y: 220, icon: 'pen', tone: 'teal', label: 'Viết kịch bản', sub: 'PLANNING → SCRIPT_QA',
          desc: 'Lập kế hoạch, viết kịch bản theo ngôn ngữ kênh, rồi QA + đối chiếu trùng lặp.' },
        { id: 'assets', kind: 'action', x: 840, y: 220, icon: 'image', tone: 'pink', label: 'Ảnh + giọng đọc', sub: 'ASSET_GENERATING → QA',
          desc: 'Ảnh Antigravity cho từng cảnh + TTS, rồi kiểm tra tài nguyên và dựng project.' },
        { id: 'render', kind: 'action', x: 1030, y: 220, icon: 'film', tone: 'indigo', label: 'Render MP4', sub: 'RENDERING → VIDEO_QA',
          desc: 'Chờ duyệt render (--approve-render), render MP4, QA video (lỗi → render lại).' },
        { id: 'publish_check', kind: 'if', x: 1220, y: 220, icon: 'branch', tone: 'green', label: 'Đủ điều kiện đăng?', sub: 'READY_TO_PUBLISH',
          desc: 'Kênh đã map 1:1 · niche của plan, acc, channel và topic trùng nhau · có video_slug · đúng ngôn ngữ/giọng · còn slot đăng.' },
        { id: 'scheduled', kind: 'action', x: 1430, y: 130, icon: 'send', tone: 'green', label: 'Lên lịch đăng', sub: 'SCHEDULED',
          desc: 'Job chuyển READY_TO_PUBLISH → SCHEDULED, tạo upload_task QUEUED cho đúng tài khoản.' },
        { id: 'upload', kind: 'action', x: 1620, y: 130, icon: 'upload', tone: 'red', label: 'Hàng chờ đăng', sub: 'upload_tasks', link: 'publish',
          desc: 'Các upload_task do Autopilot sinh ra. Bấm "Mở luồng Đăng TikTok" để xem chi tiết.' },
        { id: 'cleanup', kind: 'action', x: 1810, y: 130, icon: 'trash', tone: 'gray', label: 'Dọn dẹp', sub: 'backup VPS · xoá local',
          desc: 'Sau cleanup_after_days ngày: rsync MP4 lên VPS, đối chiếu kích thước, rồi mới xoá MP4 + projects/<job_id>, giữ metadata.' },
        { id: 'blocked', kind: 'sink', x: 1430, y: 330, icon: 'pause', tone: 'amber', label: 'Bị giữ lại', sub: 'chưa lên lịch',
          desc: 'Job ở READY_TO_PUBLISH quá một chu kỳ.' },
        { id: 'failed', kind: 'sink', x: 840, y: 60, icon: 'alert', tone: 'red', label: 'Job lỗi', sub: 'FAILED · DEAD_LETTER',
          desc: 'Job hết lượt thử lại hoặc bị bỏ.' },
        { id: 'script_ai', kind: 'sub', x: 600, y: 390, icon: 'sparkles', tone: 'teal', label: 'AI viết kịch bản', port: 'Model', parent: 'script' },
        { id: 'registry', kind: 'sub', x: 700, y: 390, icon: 'db', tone: 'teal', label: 'Chống trùng lặp', port: 'Registry', parent: 'script' },
        { id: 'images', kind: 'sub', x: 790, y: 390, icon: 'image', tone: 'pink', label: 'Antigravity', port: 'Ảnh', parent: 'assets',
          desc: 'Hàng chờ image_queue engine antigravity + thư mục bridge.' },
        { id: 'tts', kind: 'sub', x: 890, y: 390, icon: 'mic', tone: 'pink', label: 'TTS', port: 'Giọng', parent: 'assets' },
      ],
      edges: [
        ['trigger', 'plan'], ['plan', 'batch'], ['batch', 'script'], ['script', 'assets'], ['assets', 'render'],
        ['render', 'publish_check'], ['publish_check', 'scheduled', 'true'], ['publish_check', 'blocked', 'false'],
        ['scheduled', 'upload'], ['upload', 'cleanup'],
        ['script', 'failed', 'error'], ['assets', 'failed', 'error'], ['render', 'failed', 'error'],
      ],
    },
    publish: {
      label: 'Đăng TikTok',
      nodes: [
        { id: 'source', kind: 'trigger', x: 80, y: 220, icon: 'plus', tone: 'orange', label: 'Nguồn video', sub: 'Autopilot · Xưởng · tay',
          desc: 'Task được tạo từ Autopilot, Matrix/Xưởng video hoặc tạo tay. Số đếm = task tạo trong khung thời gian.' },
        { id: 'channel', kind: 'action', x: 270, y: 220, icon: 'user', tone: 'blue', label: 'Chọn kênh', sub: 'tường minh' },
        { id: 'preflight', kind: 'if', x: 460, y: 220, icon: 'branch', tone: 'green', label: 'Ảnh + MP4 sẵn sàng?', sub: 'kiểm tra trước khi xếp' },
        { id: 'wait_render', kind: 'action', x: 660, y: 370, icon: 'film', tone: 'indigo', label: 'Chờ render / ảnh', sub: 'WAITING_RENDER → QUEUED',
          desc: 'Chờ ảnh Antigravity và MP4 mới. Có MP4 mới → QUEUED; MP4 cũ → ERROR.' },
        { id: 'queue', kind: 'action', x: 660, y: 220, icon: 'list', tone: 'purple', label: 'Hàng chờ lịch', sub: 'QUEUED' },
        { id: 'uploading', kind: 'action', x: 870, y: 220, icon: 'browser', tone: 'red', label: 'Đang đăng', sub: 'UPLOADING', live: true,
          desc: 'Mở TikTok Studio bằng cookie + VPN của kênh, tải MP4, điền caption, bấm Đăng.' },
        { id: 'profile', kind: 'sub', x: 780, y: 390, icon: 'browser', tone: 'red', label: 'Chrome profile', port: 'Profile', parent: 'uploading' },
        { id: 'confirm', kind: 'if', x: 1070, y: 220, icon: 'branch', tone: 'green', label: 'Thấy xác nhận?', sub: 'sau khi bấm Đăng' },
        { id: 'success', kind: 'sink', x: 1270, y: 130, icon: 'check', tone: 'green', label: 'Đã đăng', sub: 'SUCCESS' },
        { id: 'needs_check', kind: 'sink', x: 1270, y: 320, icon: 'help', tone: 'amber', label: 'Cần kiểm tra', sub: 'NEEDS_CHECK',
          desc: 'Đã bấm Đăng nhưng không thấy xác nhận. Không bao giờ tự thử lại — kiểm tra trên TikTok rồi xác nhận tay.' },
        { id: 'verifier', kind: 'if', x: 1460, y: 320, icon: 'branch', tone: 'blue', label: 'Tự xác minh', sub: 'chỉ đọc chocode',
          desc: 'true → Đã đăng; false → tiếp tục NEEDS_CHECK, không bấm Đăng lại.' },
        { id: 'error', kind: 'sink', x: 870, y: 60, icon: 'alert', tone: 'red', label: 'Lỗi', sub: 'ERROR', desc: 'Hết 3 lần thử hoặc lỗi không thử lại được.' },
        { id: 'cancelled', kind: 'sink', x: 660, y: 60, icon: 'x', tone: 'gray', label: 'Đã huỷ', sub: 'CANCELLED' },
        { id: 'vpn', kind: 'sub', x: 860, y: 390, icon: 'globe', tone: 'red', label: 'WireGuard VPN', port: 'Mạng', parent: 'uploading' },
        { id: 'cookie', kind: 'sub', x: 940, y: 390, icon: 'key', tone: 'red', label: 'Cookie kênh', port: 'Phiên', parent: 'uploading' },
        { id: 'browser', kind: 'sub', x: 1020, y: 390, icon: 'browser', tone: 'red', label: 'Playwright', port: 'Trình duyệt', parent: 'uploading' },
      ],
      edges: [
        ['source', 'channel'], ['channel', 'preflight'], ['preflight', 'queue', 'true'], ['preflight', 'wait_render', 'false'], ['queue', 'uploading'], ['uploading', 'confirm'],
        ['confirm', 'success', 'true'], ['confirm', 'needs_check', 'false'], ['needs_check', 'verifier'], ['verifier', 'success', 'up'],
        ['uploading', 'error', 'error'], ['queue', 'cancelled', 'error'],
      ],
    },
    scripts: {
      label: 'Script Queue',
      nodes: [
        { id: 'enqueue', kind: 'trigger', x: 80, y: 220, icon: 'plus', tone: 'orange', label: 'Tạo yêu cầu', sub: 'POST /queue',
          desc: 'Yêu cầu kịch bản mới theo loại video. Số đếm = yêu cầu tạo trong khung thời gian, theo loại.' },
        { id: 'pending', kind: 'action', x: 270, y: 220, icon: 'list', tone: 'blue', label: 'Hàng chờ', sub: 'pending' },
        { id: 'processing', kind: 'action', x: 460, y: 220, icon: 'user', tone: 'purple', label: 'Đã nhận (claim)', sub: 'processing' },
        { id: 'inbox', kind: 'action', x: 650, y: 220, icon: 'inbox', tone: 'indigo', label: 'Inbox bundle', sub: '.json + .md' },
        { id: 'agent', kind: 'action', x: 840, y: 220, icon: 'bot', tone: 'teal', label: 'Antigravity viết', sub: 'agent IDE' },
        { id: 'outbox', kind: 'action', x: 1030, y: 220, icon: 'upload', tone: 'pink', label: 'Outbox JSON', sub: 'chờ nhập' },
        { id: 'completed', kind: 'sink', x: 1220, y: 220, icon: 'file', tone: 'green', label: 'Lưu kịch bản', sub: 'completed' },
        { id: 'failed', kind: 'sink', x: 460, y: 60, icon: 'alert', tone: 'red', label: 'Lỗi', sub: 'failed', desc: 'Bấm Retry để đưa lại về pending.' },
      ],
      edges: [
        ['enqueue', 'pending'], ['pending', 'processing'], ['processing', 'inbox'], ['inbox', 'agent'],
        ['agent', 'outbox'], ['outbox', 'completed'], ['processing', 'failed', 'error'], ['failed', 'pending', 'retry'],
      ],
    },
  };

  const KEY_LABEL = {
    running: 'đang chạy', waiting: 'đang chờ', failed: 'lỗi', done: 'xong', retry: 'chờ thử lại', blocked: 'bị giữ', held: 'chờ lịch đăng',
    due: 'đến giờ', scheduled: 'hẹn giờ', starting: 'đang khởi động',
    planned: 'đã lập', producing: 'đang sản xuất', completed: 'hoàn tất', partial: 'một phần',
    RUNNING: 'đang chạy', COMPLETED: 'hoàn tất', PARTIAL_FAILED: 'lỗi một phần',
    SUCCESS: 'đã đăng', ERROR: 'lỗi', FAILED: 'lỗi', NEEDS_CHECK: 'cần kiểm tra', CANCELLED: 'đã huỷ',
    QUEUED: 'hàng chờ', PENDING: 'hàng chờ', UPLOADING: 'đang đăng', WAITING_RENDER: 'chờ render', deferred: 'hoãn (profile bận)', found: 'tìm thấy video', manual: 'cần kiểm tra tay', profile: 'đường profile', clean: 'đường sạch',
  };
  const DONE_KEYS = new Set(['done', 'completed', 'COMPLETED', 'SUCCESS', 'CANCELLED']);
  const BAD_KEYS = new Set(['failed', 'FAILED', 'ERROR', 'NEEDS_CHECK', 'partial', 'PARTIAL_FAILED', 'blocked']);
  const RUN_KEYS = new Set(['running', 'producing', 'RUNNING', 'starting', 'UPLOADING']);
  const SINK_TOTAL = new Set(['failed', 'error', 'needs_check', 'success', 'completed', 'cancelled', 'blocked']);

  const W = { action: 92, trigger: 92, if: 92, sink: 80, sub: 60 };
  const state = {
    flow: 'publish', data: null, view: { x: 0, y: 0, k: 1 }, selected: null,
    timer: null, hours: 48, auto: true, loading: false, fittedFor: null, liveLog: null, demo: false, lastSvg: null, lastLayer: null,
  };

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (name, size = 22) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ICONS.layers}</svg>`;
  const $ = (id) => document.getElementById(id);

  function relTime(ts) {
    if (!ts) return '';
    const n = typeof ts === 'number' ? ts : Date.parse(ts) / 1000;
    if (!n || isNaN(n)) return '';
    const diff = Math.floor(Date.now() / 1000 - n);
    const abs = Math.abs(diff);
    const fmt = abs < 60 ? `${abs}s` : abs < 3600 ? `${Math.floor(abs / 60)} phút` : abs < 86400 ? `${Math.floor(abs / 3600)} giờ` : `${Math.floor(abs / 86400)} ngày`;
    return diff >= 0 ? `${fmt} trước` : `sau ${fmt}`;
  }

  function nodeData(id) {
    return (state.data && state.data.nodes && state.data.nodes[id]) || { counts: {}, items: [] };
  }

  function summarize(def, nd) {
    const counts = nd.counts || {};
    let active = 0, bad = 0, run = 0, done = 0, total = 0;
    for (const [k, v] of Object.entries(counts)) {
      total += v;
      if (DONE_KEYS.has(k)) done += v;
      else active += v;
      if (BAD_KEYS.has(k)) bad += v;
      if (RUN_KEYS.has(k)) run += v;
    }
    let status = 'idle';
    if (nd.state === 'running' || run > 0) status = 'running';
    else if (bad > 0 || nd.error) status = 'error';
    else if (nd.warning) status = 'warn';
    else if (nd.state === 'off') status = 'off';
    else if (active > 0) status = 'waiting';
    else if (done > 0) status = 'done';
    if (def.kind === 'sink' && total > 0 && !['success', 'completed'].includes(def.id)) status = 'error';
    if (['success', 'completed'].includes(def.id) && total > 0) status = 'done';
    const badge = SINK_TOTAL.has(def.id) ? total : active;
    return { status, badge, total, counts };
  }

  function countLine(counts) {
    const parts = Object.entries(counts).filter(([, v]) => v > 0)
      .sort((a, b) => (RUN_KEYS.has(b[0]) - RUN_KEYS.has(a[0])) || (b[1] - a[1]))
      .slice(0, 2).map(([k, v]) => `${v} ${KEY_LABEL[k] || k}`);
    return parts.join(' · ');
  }

  // ---------- geometry ----------
  function port(def, which) {
    const w = W[def.kind];
    if (def.kind === 'sub') return { x: def.x, y: def.y - w / 2 };
    if (which === 'in') return { x: def.x - w / 2, y: def.y };
    if (which === 'true') return { x: def.x + w / 2, y: def.y - 20 };
    if (which === 'false') return { x: def.x + w / 2, y: def.y + 20 };
    if (which === 'top') return { x: def.x, y: def.y - w / 2 };
    if (which === 'bottom') return { x: def.x, y: def.y + w / 2 };
    return { x: def.x + w / 2, y: def.y };
  }

  function edgePath(a, b, type) {
    if (type === 'loop') return `M${a.x} ${a.y} L${b.x} ${b.y}`;
    if (type === 'retry') return `M${a.x} ${a.y} C${a.x - 70} ${a.y}, ${b.x} ${b.y - 70}, ${b.x} ${b.y}`;
    if (type === 'error' || type === 'up') return `M${a.x} ${a.y} C${a.x} ${a.y - 50}, ${b.x} ${b.y + 60}, ${b.x} ${b.y}`;
    const dx = Math.max(50, Math.abs(b.x - a.x) / 2);
    return `M${a.x} ${a.y} C${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
  }

  const DOT_COLOR = { main: '#8b9bff', true: '#37c28a', false: '#f5b93e', error: '#ff5a5f', retry: '#b9a6ff', sub: '#c084fc' };

  // Chấm sáng chạy dọc cạnh (SMIL animateMotion). bounce: đi rồi quay về — dùng cho sub-node
  // (node cha gọi dịch vụ con rồi nhận kết quả về).
  function travelDots(d, color, n, dur, bounce) {
    let out = '';
    for (let i = 0; i < n; i++) {
      const begin = -((dur / n) * i).toFixed(2);
      const motion = bounce
        ? `<animateMotion dur="${dur}s" begin="${begin}s" repeatCount="indefinite" path="${d}" keyPoints="1;0;1" keyTimes="0;0.5;1" calcMode="linear"/>`
        : `<animateMotion dur="${dur}s" begin="${begin}s" repeatCount="indefinite" path="${d}" calcMode="spline" keyPoints="0;1" keyTimes="0;1" keySplines="0.45 0 0.55 1"/>`;
      out += `<g class="fv-dot">${motion}<circle r="8" fill="${color}" opacity=".18"/><circle r="4" fill="${color}"/><circle r="1.6" fill="#fff" opacity=".85"/></g>`;
    }
    return out;
  }

  function dotCount(badge) { return badge >= 30 ? 3 : badge >= 5 ? 2 : 1; }

  // ---------- render ----------
  function renderCanvas() {
    const flow = FLOWS[state.flow];
    const byId = Object.fromEntries(flow.nodes.map(n => [n.id, n]));
    const sums = Object.fromEntries(flow.nodes.map(n => [n.id, summarize(n, nodeData(n.id))]));
    const paths = [];
    const labels = [];
    const dots = [];

    for (const [from, to, type] of flow.edges) {
      const a = byId[from], b = byId[to];
      let p1, p2;
      if (type === 'error' || type === 'up') { p1 = port(a, 'top'); p2 = port(b, 'bottom'); }
      else if (type === 'retry') { p1 = port(a, 'in'); p2 = port(b, 'top'); }
      else if (type === 'loop') { p1 = port(a, 'top'); p2 = port(b, 'bottom'); }
      else { p1 = port(a, type === 'true' || type === 'false' ? type : 'out'); p2 = port(b, 'in'); }
      const tSum = sums[to];
      const active = tSum.status === 'running' || (tSum.badge > 0 && !['error'].includes(type));
      const cls = ['fv-edge', `is-${type === 'up' ? 'true' : (type || 'main')}`, active ? 'is-active' : '', type === 'error' && tSum.total > 0 ? 'is-hot' : ''].join(' ');
      const d = edgePath(p1, p2, type);
      paths.push(`<path class="${cls}" d="${d}"/>`);
      const hot = (type === 'error' || type === 'retry') && tSum.total > 0;
      const moving = hot || (active && type !== 'error' && type !== 'retry')
        || (state.demo && type !== 'error' && type !== 'retry');
      if (moving) {
        const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        dots.push(travelDots(d, DOT_COLOR[type === 'up' ? 'true' : (type || 'main')], state.demo && !active ? 2 : dotCount(tSum.badge),
          Math.max(1.4, Math.min(3.2, len / 110)), false));
      }
      if (type === 'loop' || type === 'up') {
        paths.push(`<path class="fv-edge-arrow" d="M${p2.x - 5} ${p2.y + 9} L${p2.x} ${p2.y + 2} L${p2.x + 5} ${p2.y + 9}"/>`);
      } else if (type === 'retry') {
        paths.push(`<path class="fv-edge-arrow" d="M${p2.x - 5} ${p2.y - 9} L${p2.x} ${p2.y - 2} L${p2.x + 5} ${p2.y - 9}"/>`);
      } else if (type !== 'error') {
        paths.push(`<path class="fv-edge-arrow" d="M${p2.x - 8} ${p2.y - 5} L${p2.x - 1} ${p2.y} L${p2.x - 8} ${p2.y + 5}"/>`);
      }
      if (type === 'true' || type === 'false') {
        labels.push(`<span class="fv-port-label is-${type}" style="left:${p1.x + 8}px;top:${p1.y - 16}px">${type}</span>`);
      } else if (type === 'up') {
        labels.push(`<span class="fv-port-label is-true" style="left:${p1.x + 8}px;top:${p1.y - 18}px">true</span>`);
      } else if (type === 'retry') {
        labels.push(`<span class="fv-edge-label" style="left:${(p1.x + p2.x) / 2 - 20}px;top:${(p1.y + p2.y) / 2 - 30}px">thử lại</span>`);
      } else if (type === 'loop') {
        labels.push(`<span class="fv-edge-label" style="left:${p1.x + 34}px;top:${(p1.y + p2.y) / 2}px">MP4 mới</span>`);
      }
    }

    // sub-node connectors (dashed) + port labels under parent
    const subPorts = {};
    for (const n of flow.nodes.filter(n => n.kind === 'sub')) {
      const parent = byId[n.parent];
      subPorts[n.parent] = subPorts[n.parent] || flow.nodes.filter(s => s.parent === n.parent);
      const siblings = subPorts[n.parent];
      const idx = siblings.indexOf(n);
      const span = W[parent.kind] - 24;
      const px = parent.x - span / 2 + (siblings.length === 1 ? span / 2 : (span * idx) / (siblings.length - 1));
      const py = parent.y + W[parent.kind] / 2;
      const top = port(n, 'in');
      const on = sums[n.id].status === 'running' || sums[n.parent].status === 'running';
      const subD = `M${top.x} ${top.y} C${top.x} ${top.y - 60}, ${px} ${py + 60}, ${px} ${py}`;
      paths.push(`<path class="fv-edge is-sub${on ? ' is-active' : ''}" d="${subD}"/>`);
      if (on || state.demo) dots.push(travelDots(subD, DOT_COLOR.sub, 1, 2.6, true));
      paths.push(`<circle class="fv-sub-dot" cx="${px}" cy="${py}" r="4"/>`);
      paths.push(`<rect class="fv-sub-diamond" x="${top.x - 5}" y="${top.y - 5}" width="10" height="10" transform="rotate(45 ${top.x} ${top.y})"/>`);
      labels.push(`<span class="fv-sub-port" style="left:${top.x}px;top:${top.y - 22}px">${esc(n.port || '')}</span>`);
    }

    const nodesHtml = flow.nodes.map(n => {
      const s = sums[n.id];
      const nd = nodeData(n.id);
      const w = W[n.kind];
      const line = countLine(s.counts) || (n.kind === 'sub' ? '' : '—');
      const ports = n.kind === 'sub' ? '' :
        (n.kind !== 'trigger' ? '<span class="fv-port is-in"></span>' : '') +
        (n.kind === 'if' ? '<span class="fv-port is-true"></span><span class="fv-port is-false"></span>'
          : (n.kind !== 'sink' ? '<span class="fv-port is-out"></span>' : ''));
      return `
        <button type="button" class="fv-node kind-${n.kind} fvs-${s.status}${state.selected === n.id ? ' is-selected' : ''}"
          data-node="${n.id}" style="left:${n.x - w / 2}px;top:${n.y - w / 2}px;width:${w}px;height:${w}px"
          aria-label="${esc(n.label)}: ${esc(line)}">
          <span class="fv-node-icon tone-${n.tone}">${icon(n.icon, n.kind === 'sub' ? 20 : 26)}</span>
          ${s.badge > 0 ? `<span class="fv-badge">${s.badge > 999 ? '999+' : s.badge}</span>` : ''}
          ${s.status === 'done' && s.badge === 0 ? `<span class="fv-badge is-ok">${icon('check', 11)}</span>` : ''}
          ${nd.warning ? `<span class="fv-badge is-warn">!</span>` : ''}
          ${ports}
          <span class="fv-node-label">
            <strong>${esc(n.label)}</strong>
            <small>${esc(n.kind === 'sub' ? (nd.meta && nd.meta.inbox != null ? `inbox ${nd.meta.inbox}` : '') : line)}</small>
          </span>
        </button>`;
    }).join('');

    const maxX = Math.max(...flow.nodes.map(n => n.x)) + 200;
    const maxY = Math.max(...flow.nodes.map(n => n.y)) + 260;
    const world = $('fv-world');
    if (world.dataset.flow !== state.flow || !$('fv-svg')) {
      world.innerHTML = '<svg class="fv-edges" id="fv-svg"></svg><div id="fv-layer"></div>';
      world.dataset.flow = state.flow;
      state.lastSvg = state.lastLayer = null;
    }
    const svgHtml = paths.join('') + `<g class="fv-dots">${dots.join('')}</g>`;
    if (svgHtml !== state.lastSvg) {
      const svg = $('fv-svg');
      svg.setAttribute('width', maxX);
      svg.setAttribute('height', maxY);
      svg.setAttribute('viewBox', `0 0 ${maxX} ${maxY}`);
      svg.innerHTML = svgHtml;
      state.lastSvg = svgHtml;
    }
    const layerHtml = labels.join('') + nodesHtml;
    if (layerHtml !== state.lastLayer) {
      $('fv-layer').innerHTML = layerHtml;
      state.lastLayer = layerHtml;
    }
    applyView();
  }

  function applyView() {
    const v = state.view;
    $('fv-world').style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.k})`;
    const cv = $('fv-canvas');
    cv.style.backgroundSize = `${20 * v.k}px ${20 * v.k}px`;
    cv.style.backgroundPosition = `${v.x}px ${v.y}px`;
    const z = $('fv-zoom-val');
    if (z) z.textContent = `${Math.round(v.k * 100)}%`;
  }

  function fitView() {
    const flow = FLOWS[state.flow];
    const cv = $('fv-canvas');
    const minX = Math.min(...flow.nodes.map(n => n.x)) - 90;
    const maxX = Math.max(...flow.nodes.map(n => n.x)) + 90;
    const minY = Math.min(...flow.nodes.map(n => n.y)) - 80;
    const maxY = Math.max(...flow.nodes.map(n => n.y)) + 110;
    const drawer = $('fv-drawer');
    const drawerW = drawer && drawer.classList.contains('is-open') && cv.clientWidth > 900 ? drawer.offsetWidth : 0;
    const availW = cv.clientWidth - drawerW - 40;
    const k = Math.max(0.2, Math.min(1.15, availW / (maxX - minX), (cv.clientHeight - 40) / (maxY - minY)));
    state.view = { k, x: (availW - (maxX - minX) * k) / 2 + 20 - minX * k, y: (cv.clientHeight - (maxY - minY) * k) / 2 - minY * k };
    applyView();
  }

  function zoomAt(factor, cx, cy) {
    const v = state.view;
    const k = Math.max(0.2, Math.min(2.2, v.k * factor));
    state.view = { k, x: cx - (cx - v.x) * (k / v.k), y: cy - (cy - v.y) * (k / v.k) };
    applyView();
  }

  // ---------- drawer ----------
  function renderDrawer() {
    const drawer = $('fv-drawer');
    const def = state.selected && FLOWS[state.flow].nodes.find(n => n.id === state.selected);
    if (!def) { drawer.classList.remove('is-open'); drawer.innerHTML = ''; return; }
    const nd = nodeData(def.id);
    const s = summarize(def, nd);
    const chips = Object.entries(s.counts).filter(([, v]) => v > 0).map(([k, v]) => {
      const tone = RUN_KEYS.has(k) ? 'run' : BAD_KEYS.has(k) ? 'bad' : DONE_KEYS.has(k) ? 'ok' : 'wait';
      return `<span class="fv-chip is-${tone}"><b>${v}</b> ${esc(KEY_LABEL[k] || k)}</span>`;
    }).join('');
    const byState = nd.by_state ? Object.entries(nd.by_state).map(([k, v]) => `<span class="fv-chip is-wait"><b>${v}</b> ${esc(k)}</span>`).join('') : '';
    const items = (nd.items || []).map(it => `
      <li class="fv-item fvs-${esc(it.status)}">
        <div class="fv-item-top">
          <span class="fv-item-title" title="${esc(it.title)}">${esc(it.title)}</span>
          <span class="fv-item-status">${esc(KEY_LABEL[it.status] || it.status || '')}</span>
        </div>
        ${it.sub ? `<div class="fv-item-sub">${esc(it.sub)}${it.ts ? ` · ${esc(relTime(it.ts))}` : ''}</div>` : ''}
        ${it.error ? `<div class="fv-item-err">${esc(it.error)}</div>` : ''}
        ${it.url ? `<a class="fv-item-link" href="${esc(it.url)}" target="_blank" rel="noopener noreferrer">Mở trên TikTok ↗</a>` : ''}
      </li>`).join('');
    const logs = def.id === 'trigger' && state.data && state.data.logs && state.data.logs.length
      ? `<h4>Log Autopilot</h4><pre class="fv-log">${esc(state.data.logs.slice(-40).join('\n'))}</pre>` : '';
    const live = def.live ? `<h4>Log đăng trực tiếp</h4><pre class="fv-log" id="fv-live-log">${esc(state.liveLog || 'Đang tải…')}</pre>` : '';
    drawer.innerHTML = `
      <div class="fv-drawer-head">
        <span class="fv-node-icon tone-${def.tone}">${icon(def.icon, 20)}</span>
        <div><strong>${esc(def.label)}</strong><small>${esc(def.sub || def.port || '')}</small></div>
        <button type="button" class="fv-drawer-close" data-fv-close aria-label="Đóng">&times;</button>
      </div>
      <div class="fv-drawer-body">
        ${def.desc ? `<p class="fv-desc">${esc(def.desc)}</p>` : ''}
        ${nd.note ? `<p class="fv-note">${esc(nd.note)}</p>` : ''}
        ${nd.warning ? `<p class="fv-warn">⚠️ ${esc(nd.warning)}</p>` : ''}
        ${nd.error ? `<p class="fv-err">${esc(nd.error)}</p>` : ''}
        ${chips ? `<div class="fv-chips">${chips}</div>` : '<p class="fv-empty">Không có mục nào ở bước này.</p>'}
        ${byState ? `<h4>Theo trạng thái job</h4><div class="fv-chips">${byState}</div>` : ''}
        ${def.link ? `<button type="button" class="fv-link-btn" data-fv-flow="${def.link}">Mở luồng ${esc(FLOWS[def.link].label)} →</button>` : ''}
        ${live}
        ${items ? `<h4>Mục gần nhất (${(nd.items || []).length})</h4><ul class="fv-items">${items}</ul>` : ''}
        ${logs}
      </div>`;
    drawer.classList.add('is-open');
    if (def.live) loadLiveLog();
  }

  async function loadLiveLog() {
    try {
      const r = await fetch('/api/upload/publish-logs');
      if (!r.ok) return;
      const d = await r.json();
      const lines = (d.logs || []).slice(-30).map(l => `[${l.time || ''}] ${l.msg || ''}`);
      state.liveLog = (d.is_running ? `▶ Đang đăng task #${d.task_id} (kênh ${d.channel_id})\n` : 'Không có phiên đăng nào đang chạy.\n') + lines.join('\n');
      const el = $('fv-live-log');
      if (el) { el.textContent = state.liveLog; el.scrollTop = el.scrollHeight; }
    } catch (_) { /* giữ log cũ */ }
  }

  // ---------- data ----------
  async function load() {
    if (state.loading) return;
    state.loading = true;
    const flowAtStart = state.flow;
    $('fv-refresh').classList.add('is-spinning');
    try {
      const r = await fetch(`/api/flow/${flowAtStart}?hours=${state.hours}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || `HTTP ${r.status}`);
      if (flowAtStart !== state.flow) return;
      state.data = d;
      $('fv-error').hidden = true;
      renderWorkers();
      renderCanvas();
      if (state.fittedFor !== state.flow) { fitView(); state.fittedFor = state.flow; }
      if (state.selected) renderDrawer();
      $('fv-updated').textContent = `Cập nhật ${new Date().toLocaleTimeString('vi-VN')}`;
    } catch (err) {
      $('fv-error').hidden = false;
      $('fv-error').textContent = `Không tải được số liệu: ${err.message}`;
    } finally {
      state.loading = false;
      $('fv-refresh').classList.remove('is-spinning');
    }
  }

  function renderWorkers() {
    const w = (state.data && state.data.workers) || {};
    const pills = [];
    if ('autopilot-daemon' in w) {
      pills.push(pill(w.enabled && w['autopilot-daemon'] ? 'on' : (w['autopilot-daemon'] ? 'idle' : 'off'),
        `Autopilot ${w.enabled ? 'đang bật' : 'đang tắt'}`));
    }
    if ('upload-scheduler' in w) pills.push(pill(w['upload-scheduler'] ? 'on' : 'off', `Scheduler ${w['upload-scheduler'] ? 'đang chạy' : 'dừng'}`));
    $('fv-workers').innerHTML = pills.join('');
  }
  const pill = (st, text) => `<span class="fv-worker is-${st}"><i></i>${esc(text)}</span>`;

  function setFlow(flow) {
    if (!FLOWS[flow]) return;
    state.flow = flow;
    state.selected = null;
    state.data = null;
    renderDrawer();
    document.querySelectorAll('#pane-flow .fv-tab').forEach(b => b.classList.toggle('active', b.dataset.flow === flow));
    try { localStorage.setItem('fv-flow', flow); } catch (_) { /* không có storage */ }
    if (typeof window.onFlowViewChange === 'function') window.onFlowViewChange(flow);
    renderCanvas();
    fitView();
    state.fittedFor = flow;
    load();
  }

  function startTimer() {
    stopTimer();
    if (!state.auto) return;
    state.timer = setInterval(() => {
      if (document.hidden || !paneVisible()) return;
      load();
      if (state.selected && FLOWS[state.flow].nodes.find(n => n.id === state.selected && n.live)) loadLiveLog();
    }, 5000);
  }
  function stopTimer() { if (state.timer) { clearInterval(state.timer); state.timer = null; } }

  // ---------- wiring ----------
  let wired = null;          // #fv-canvas đã gắn sự kiện (trang dựng lại khung mỗi lần vào)
  let globalWired = false;   // listener trên document/window chỉ gắn một lần
  const paneVisible = () => !!$('pane-flow') && $('pane-flow').isConnected;
  function wire() {
    const cv = $('fv-canvas');
    if (!cv || wired === cv) return;
    wired = cv;
    state.data = null;
    state.fittedFor = null;
    let drag = null;
    cv.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.fv-node, .fv-controls, .fv-drawer')) return;
      drag = { x: e.clientX, y: e.clientY, vx: state.view.x, vy: state.view.y };
      cv.setPointerCapture(e.pointerId);
      cv.classList.add('is-panning');
    });
    cv.addEventListener('pointermove', (e) => {
      if (!drag) return;
      state.view.x = drag.vx + (e.clientX - drag.x);
      state.view.y = drag.vy + (e.clientY - drag.y);
      applyView();
    });
    const end = () => { drag = null; cv.classList.remove('is-panning'); };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    cv.addEventListener('wheel', (e) => {
      if (e.target.closest('.fv-drawer')) return;
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      zoomAt(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });

    $('fv-world').addEventListener('click', (e) => {
      const b = e.target.closest('.fv-node');
      if (!b) return;
      state.selected = state.selected === b.dataset.node ? null : b.dataset.node;
      renderCanvas();
      renderDrawer();
    });
    $('fv-drawer').addEventListener('click', (e) => {
      if (e.target.closest('[data-fv-close]')) { state.selected = null; renderCanvas(); renderDrawer(); }
      const link = e.target.closest('[data-fv-flow]');
      if (link) setFlow(link.dataset.fvFlow);
    });
    document.querySelectorAll('#pane-flow .fv-tab').forEach(b => b.addEventListener('click', () => setFlow(b.dataset.flow)));
    $('fv-refresh').addEventListener('click', load);
    $('fv-fit').addEventListener('click', fitView);
    $('fv-zoom-in').addEventListener('click', () => zoomAt(1.2, cv.clientWidth / 2, cv.clientHeight / 2));
    $('fv-zoom-out').addEventListener('click', () => zoomAt(1 / 1.2, cv.clientWidth / 2, cv.clientHeight / 2));
    $('fv-hours').addEventListener('change', (e) => {
      state.hours = Number(e.target.value) || 48;
      if (typeof window.onFlowViewChange === 'function') window.onFlowViewChange(state.flow, state.hours);
      load();
    });
    $('fv-auto').addEventListener('change', (e) => { state.auto = e.target.checked; startTimer(); });
    const demo = $('fv-demo');
    try { state.demo = localStorage.getItem('fv-demo') === '1'; } catch (_) { /* không có storage */ }
    demo.checked = state.demo;
    demo.addEventListener('change', (e) => {
      state.demo = e.target.checked;
      try { localStorage.setItem('fv-demo', state.demo ? '1' : '0'); } catch (_) { /* không có storage */ }
      renderCanvas();
    });
    if (globalWired) return;
    globalWired = true;
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && state.selected && paneVisible()) {
        state.selected = null; renderCanvas(); renderDrawer();
      }
    });
    window.addEventListener('resize', () => { if (paneVisible()) fitView(); });
  }

  window.loadFlowView = function (flow, hours) {
    wire();
    if (hours) { state.hours = Number(hours) || 48; const sel = $('fv-hours'); if (sel) sel.value = String(state.hours); }
    let saved = flow || null;
    if (!saved) { try { saved = localStorage.getItem('fv-flow'); } catch (_) { /* không có storage */ } }
    if (!state.data || (flow && flow !== state.flow)) setFlow(FLOWS[saved] ? saved : state.flow);
    else { load(); requestAnimationFrame(fitView); }
    startTimer();
  };
  window.stopFlowView = stopTimer;
})();
