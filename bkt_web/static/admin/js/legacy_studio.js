/* Cửa sổ Tạo video mới AI, Matrix batch và Bố cục chuẩn (Template Review) — giữ nguyên code của giao diện cũ.
 * Lớp tương thích bên dưới thay các hàm dùng chung của app.js cũ; markup cũ nhúng trong LEGACY_MODALS / LEGACY_TEMPLATE,
 * style trong css/legacy.css (giới hạn trong .legacy-ui). Trang #/studio gọi window.LegacyStudio.* — đừng sửa phần code cũ. */
(function () {
'use strict';
// ---------------------------------------------------------------- lớp tương thích với app.js cũ
const escapeHtml = (v) => App.esc(v);
const showToast = (msg, typeOrMs) => App.toast(String(msg).replace(/^[✓✗❌⚠️✅]\s*/u, ''), typeof typeOrMs === 'string' ? typeOrMs.replace('error', 'danger') : /lỗi|error|không/i.test(msg) ? 'warning' : 'info');
function closeModal(id) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }
let allChannels = [];
async function ensureChannelsLoaded() {
  if (allChannels.length) return allChannels;
  try { allChannels = (await App.api.get('/api/channels')).channels || []; } catch (e) { console.warn(e); }
  return allChannels;
}
function startWsRunStreaming(runId, task, slug) {
  closeNewVideoModal();
  if (window.StudioRunStream) window.StudioRunStream(runId, task, slug);
}
const UI_ICON_PATHS = {
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  cookie: '<circle cx="12" cy="12" r="9"/><circle cx="9" cy="10" r="1"/><circle cx="14.5" cy="14" r="1"/><circle cx="15" cy="8" r="1"/><path d="M18.5 5.5a3 3 0 0 0 0 4 3 3 0 0 0 3 1"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/>',
  external: '<path d="M14 3h7v7"/><path d="m21 3-9 9"/><path d="M18 13v7H4V6h7"/>',
  save: '<path d="M5 3h12l3 3v15H4V3Z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/>',
  stop: '<rect x="5" y="5" width="14" height="14" rx="2"/>',
  play: '<path d="m8 5 11 7-11 7Z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  copy: '<rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
  upload: '<path d="M12 21V9"/><path d="m7 14 5-5 5 5"/><path d="M5 3h14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/>',
  action: '<circle cx="12" cy="12" r="9"/><path d="m10 8 4 4-4 4"/>'
};

function uiIconMarkup(name, className = 'ui-control-icon') {
  return `<span class="${className}" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${UI_ICON_PATHS[name] || UI_ICON_PATHS.action || ''}</svg></span>`;
}
let wsTplCurrentType = 'compare';
let wsTplCurrentLang = 'vi';

// ---------------------------------------------------------------- code cũ (app.js 4936–6395)
// MODAL: TẠO VIDEO MỚI (1:1 AUTHENTIC REPLICA OF COMPARE STUDIO NewVideoModal)
// ============================================================================

const NEWVID_TEMPLATES = [
  {
    id: "compare",
    category: "arena",
    name: "So Sánh 2 Vật",
    shortName: "So Sánh",
    icon: "⚔️",
    badgeTone: "terra",
    accentColor: "#b4502f",
    duration: "30-40s",
    desc: "Đối đầu 2 vật thể/khái niệm, nhịp fast-cut 2s, 3 zone",
  },
  {
    id: "survival",
    category: "arena",
    name: "Thử Thách Sinh Tồn",
    shortName: "Sinh Tồn",
    icon: "💀",
    badgeTone: "terra",
    accentColor: "#e65100",
    duration: "65s",
    desc: "10 cấp độ tăng dần, thanh trạng thái sinh học, Mr. Incredible",
  },
  {
    id: "tierlist",
    category: "arena",
    name: "Tier List Xếp Hạng",
    shortName: "Tier List",
    icon: "🏆",
    badgeTone: "gold",
    accentColor: "#f59e0b",
    duration: "60-90s",
    desc: "Xếp hạng bậc SSS đến D, sân khấu đánh giá & slam khay rung chấn",
    isNew: true,
  },
  {
    id: "vox",
    category: "journal",
    name: "Vox Collage Xé Giấy",
    shortName: "Vox Collage",
    icon: "✂️",
    badgeTone: "sage",
    accentColor: "#3e8c77",
    duration: "50-65s",
    desc: "Cắt dán thủ công, xé giấy ngẫu nhiên răng cưa, dán băng keo",
    isNew: true,
  },
  {
    id: "newspaper",
    category: "journal",
    name: "Báo Cũ Điều Tra",
    shortName: "Báo Cũ",
    icon: "📜",
    badgeTone: "gold",
    accentColor: "#c2410c",
    duration: "65s",
    desc: "Báo cổ điển thế kỷ 20, ảnh polaroid, ghim đỏ & tem niêm phong",
  },
  {
    id: "chalk",
    category: "journal",
    name: "Bản Đồ Bảng Phấn",
    shortName: "Bảng Phấn",
    icon: "🗺️",
    badgeTone: "sage",
    accentColor: "#059669",
    duration: ">60s",
    desc: "Bản đồ địa chính trị vẽ phấn, mũi tên di chuyển quân sự",
    isNew: true,
  },
  {
    id: "wildlife",
    category: "journal",
    name: "Thế Giới Động Vật",
    shortName: "Động Vật AI",
    icon: "🐾",
    badgeTone: "gold",
    accentColor: "#10b981",
    duration: "50-60s",
    desc: "Phim tài liệu động vật AI, HUD chỉ số sinh tồn & radar săn mồi",
    isNew: true,
  },
  {
    id: "kinetic",
    category: "tech",
    name: "Kinetic Editorial",
    shortName: "Kinetic",
    icon: "⚡",
    badgeTone: "sage",
    accentColor: "#06b6d4",
    duration: "65s",
    desc: "Chữ lớn dẫn chuyện, nhịp dựng theo ý nghĩa, tương phản đen – vàng chanh",
  },
  {
    id: "science",
    category: "tech",
    name: "Khoa Học Vũ Trụ",
    shortName: "Khoa Học",
    icon: "🪐",
    badgeTone: "neutral",
    accentColor: "#8b5cf6",
    duration: "65s",
    desc: "Thiên văn học, vũ trụ bao la, biểu đồ vi mô & vĩ mô",
  },
  {
    id: "mystery",
    category: "tech",
    name: "Bí Ẩn & Kỳ Án",
    shortName: "Kỳ Án",
    icon: "🔍",
    badgeTone: "neutral",
    accentColor: "#6366f1",
    duration: "65s",
    desc: "Hồ sơ mật chưa có lời giải, giải mã các giả thuyết ly kỳ",
  },
  {
    id: "folklore",
    category: "journal",
    name: "Tâm Linh Dân Gian",
    shortName: "Tâm Linh",
    icon: "🕯️",
    badgeTone: "neutral",
    accentColor: "#a16207",
    duration: "70s–2,5p",
    desc: "Hoạt hình 2D tối giản kể tục lệ, tín ngưỡng dân gian — ảnh Antigravity, 6 ngôn ngữ",
    isNew: true,
  },
];

const NEWVID_COUNTRIES = [
  {
    code: 'vi',
    country: 'Việt Nam',
    flag: '🇻🇳',
    langName: 'Tiếng Việt',
    defaultVoice: 'vi-VN-NamMinhNeural',
    voices: [
      { id: 'vi-VN-NamMinhNeural', name: 'Nam Minh (Chuẩn Hà Nội)', gender: 'male' },
      { id: 'vi-VN-HoaiMyNeural', name: 'Hoài My (Nữ nhẹ nhàng)', gender: 'female' },
    ],
  },
  {
    code: 'en',
    country: 'Hoa Kỳ / Toàn cầu',
    flag: '🇺🇸',
    langName: 'English',
    defaultVoice: 'en-US-AndrewNeural',
    voices: [
      { id: 'en-US-AndrewNeural', name: 'Andrew (Male · Confident)', gender: 'male' },
      { id: 'en-US-AvaNeural', name: 'Ava (Female · Natural)', gender: 'female' },
    ],
  },
  {
    code: 'de',
    country: 'Đức',
    flag: '🇩🇪',
    langName: 'Deutsch',
    defaultVoice: 'de-DE-ConradNeural',
    voices: [
      { id: 'de-DE-ConradNeural', name: 'Conrad (Männlich · Klar)', gender: 'male' },
      { id: 'de-DE-KatjaNeural', name: 'Katja (Weiblich · Freundlich)', gender: 'female' },
    ],
  },
  {
    code: 'fr',
    country: 'Pháp',
    flag: '🇫🇷',
    langName: 'Français',
    defaultVoice: 'fr-FR-HenriNeural',
    voices: [
      { id: 'fr-FR-HenriNeural', name: 'Henri (Masculin · Posé)', gender: 'male' },
      { id: 'fr-FR-DeniseNeural', name: 'Denise (Féminin · Naturel)', gender: 'female' },
    ],
  },
  {
    code: 'ja',
    country: 'Nhật Bản',
    flag: '🇯🇵',
    langName: '日本語',
    defaultVoice: 'ja-JP-KeitaNeural',
    voices: [
      { id: 'ja-JP-KeitaNeural', name: 'Keita (啓太 · 男性)', gender: 'male' },
      { id: 'ja-JP-NanamiNeural', name: 'Nanami (七海 · 女性)', gender: 'female' },
    ],
  },
  {
    code: 'ko',
    country: 'Hàn Quốc',
    flag: '🇰🇷',
    langName: '한국어',
    defaultVoice: 'ko-KR-InJoonNeural',
    voices: [
      { id: 'ko-KR-InJoonNeural', name: 'InJoon (인준 · 남성)', gender: 'male' },
      { id: 'ko-KR-SunHiNeural', name: 'SunHi (선희 · 여성)', gender: 'female' },
    ],
  },
];

const NEWVID_COUNTRY_MASCOTS = {
  vi: { mascotName: 'Mèo Mun 🐱', mascotDesc: 'Giáo sư mèo đen đeo kính xô thơm và ria mép dài kinh điển', themeName: 'Retro Warm Amber', flag: '🇻🇳' },
  en: { mascotName: 'Owl Barnaby 🦉', mascotDesc: 'Cú mèo giáo sư thông thái mắt tròn to tri thức Oxford', themeName: 'Oxford Navy & Gold', flag: '🇺🇸' },
  de: { mascotName: 'Dachshund Otto 🐶', mascotDesc: 'Chú chó xúc xích lạp xưởng thông thái đeo kính vàng bia và nơ đỏ', themeName: 'Bauhaus Slate & Gold', flag: '🇩🇪' },
  fr: { mascotName: 'Coq Pierre 🐓', mascotDesc: 'Chú gà trống Gô-loa mào đỏ Bordeaux và nơ cổ Bistro Pháp', themeName: 'Parisian Bistro Navy', flag: '🇫🇷' },
  ja: { mascotName: 'Shiba Hachi 🐕', mascotDesc: 'Quốc khuyển Shiba Inu đốm mày trắng tròn và khăn quàng đỏ Torii', themeName: 'Torii Vermilion & Matcha', flag: '🇯🇵' },
  ko: { mascotName: 'K-Tiger Horangi 🐯', mascotDesc: 'Chú hổ con K-Tiger biểu tượng Hàn Quốc với sọc vằn và má hồng', themeName: 'Hanbok Celadon & Navy', flag: '🇰🇷' },
};

const NEWVID_SFX_LIST = [
  { id: 'deep_boom', name: 'Deep Boom', icon: '💥', tag: 'Impact' },
  { id: 'sub_drop', name: '808 Drop', icon: '🔊', tag: 'Sub-Bass' },
  { id: 'camera_shutter', name: 'Camera', icon: '📸', tag: 'Evidence' },
  { id: 'typewriter', name: 'Typewriter', icon: '⌨️', tag: 'Dossier' },
  { id: 'heartbeat', name: 'Heartbeat', icon: '💓', tag: 'Tension' },
  { id: 'alarm', name: 'Alarm', icon: '🚨', tag: 'Alert' },
  { id: 'glitch', name: 'Glitch', icon: '⚡', tag: 'Cyber' },
  { id: 'cash_register', name: 'Cash Bell', icon: '💰', tag: 'Money' },
  { id: 'whoosh', name: 'Whoosh', icon: '💨', tag: 'Transition' },
  { id: 'pop', name: 'Pop Bubble', icon: '🫧', tag: 'Accent' },
  { id: 'ding', name: 'Insight Bell', icon: '🔔', tag: 'Rule' },
  { id: 'click', name: 'UI Click', icon: '🖱️', tag: 'Click' },
  { id: 'chime', name: 'Victory Payoff', icon: '✨', tag: 'Payoff' },
];

const NEWVID_ARCHETYPE_SUGGESTIONS = {
  survival: [
    { title: "Mất Điện Toàn Cầu 100 Ngày", desc: "10 giai đoạn từ hoảng loạn, cạn kiệt lương thực đến tái lập xã hội" },
    { title: "Lạc Vào Rừng Amazon 30 Ngày", desc: "Thử thách độc xà, thiếu nước ngọt và ký sinh trùng nhiệt đới" },
    { title: "Rơi Xuống Vực Mariana Sâu 11.000m", desc: "Áp suất nghiền nát kim loại, bóng tối vĩnh cửu và quái vật đáy biển" },
  ],
  tierlist: [
    { title: "Xếp Hạng 10 Món Ăn Đường Phố Đỉnh Nhất Châu Á", desc: "Từ Phở Việt, Ramen Nhật, Tom Yum Thái đến Dimsum Hong Kong" },
    { title: "Xếp Hạng Vũ Khí Lạnh Uy Lực Nhất Lịch Sử", desc: "Katana, Đại Đao, Giáo Spartan, Kiếm Hiệp Sĩ Châu Âu" },
    { title: "Xếp Hạng Các Thành Phố Đáng Sống Nhất Thế Giới 2026", desc: "Tiêu chí an sinh, hạ tầng, văn hóa và môi trường" },
  ],
  vox: [
    { title: "Tại Sao Vỏ Hộp Pizza Lại Hình Vuông Mà Bánh Lại Hình Tròn?", desc: "Giải mã bài toán logistics và chi phí đóng gói công nghiệp" },
    { title: "Bí Mật Đằng Sau Tiếng Click Chuột Máy Tính", desc: "Thiết kế phản hồi xúc giác thay đổi ngành công nghệ" },
    { title: "Ai Là Người Thực Sự Phát Minh Ra Internet?", desc: "Hồ sơ lưu trữ ARPANET và cuộc cách mạng thông tin" },
  ],
  newspaper: [
    { title: "Vụ Trộm Thế Kỷ Tại Ngân Hàng Trung Ương 1976", desc: "Hồ sơ giải mật cảnh sát, vết đào hầm ngầm 80 mét" },
    { title: "Bí Ẩn Tàu Mary Celeste Biến Mất Không Dấu Vết", desc: "Bản tin hàng hải ngày 5 tháng 12 năm 1872" },
    { title: "Hồ Sơ Mật Về Trận Bão Mặt Trời Carrington 1859", desc: "Điện tín tự bốc cháy, cực quang sáng rực bầu trời đêm" },
  ],
  chalk: [
    { title: "Chiến Lược Địa Chính Trị Eo Biển Malacca", desc: "Tuyến hàng hải huyết mạch trung chuyển 60% năng lượng thế giới" },
    { title: "Kênh Đào Suez: Điểm Nghẽn Thương Mại Toàn Cầu", desc: "Phân tích luồng tàu bè và hậu quả nếu tắc nghẽn 1 tuần" },
    { title: "Đế Chế La Mã Đã Mở Rộng Lãnh Thổ Như Thế Nào?", desc: "Bản đồ chiến dịch hành quân và mạng lưới đường đá cổ" },
  ],
  wildlife: [
    { title: "Cá Voi Sát Thủ (Orca): Kẻ Săn Mồi Thông Minh Nhất Đại Dương", desc: "Chiến thuật săn mồi theo đàn, chỉ số radar và radar sóng âm" },
    { title: "Đại Bàng Vàng vs Sói Xám Bắc Cực", desc: "Cuộc đối đầu sinh tử trên đỉnh núi băng giá" },
    { title: "Báo Săn Gepard: Cỗ Máy Tốc Độ Hoàn Hảo Của Đồng Cỏ", desc: "Gia tốc 0-100km/h trong 3 giây và giới hạn tim mạch" },
  ],
  kinetic: [
    { title: "Hiệu Ứng Cánh Bướm: Một Quyết Định Nhỏ Thay Đổi Thế Giới", desc: "Typography tương phản neon, đồ thị phi tuyến tính" },
    { title: "Định Luật Moore Có Thực Sự Đã Chết?", desc: "Chạy đua tiến trình nano bán dẫn 2nm và chip lượng tử" },
    { title: "Nghịch Lý Thời Gian Của Thuyết Tương Đối Hẹp", desc: "Tốc độ ánh sáng và thời gian giãn nở" },
  ],
  science: [
    { title: "Nếu Mặt Trời Biến Mất Ngay Bây Giờ, Điều Gì Sẽ Xảy Ra?", desc: "8 phút 20 giây ánh sáng cuối cùng và quỹ đạo các hành tinh" },
    { title: "Hố Đen Vũ Trụ: Chuyện Gì Xảy Ra Bên Trong Chân Trời Sự Kiện?", desc: "Hiệu ứng kéo dài mì spaghetti và thời gian dừng lại" },
    { title: "Nguồn Gốc Của Vàng Trong Vũ Trụ: Vụ Nổ Sao Neutron", desc: "Phản ứng tổng hợp hạt nhân tạo nên kim loại quý" },
  ],
  mystery: [
    { title: "Bí Ẩn Tam Giác Quỷ Bermuda: Sự Thật Đằng Sau Huyền Thoại", desc: "Từ trường dị thường, bọt khí methane hay lỗi con người?" },
    { title: "Bản Thảo Voynich: Cuốn Sách Bí Ẩn Nhất Lịch Sử Nhân Loại", desc: "Mật mã 600 năm chưa ai giải mã được văn tự và hình vẽ" },
    { title: "Chuyến Bay MH370: 12 Năm Những Giả Thuyết Chưa Có Lời Đáp", desc: "Dữ liệu radar quân sự, vệ tinh Inmarsat và mảnh vỡ trôi dạt" },
  ],
};

let newVidSelectedTemplate = 'compare';
let newVidActiveCat = 'all';
let newVidSelectedCountry = 'vi';
let newVidSelectedVoice = 'vi-VN-NamMinhNeural';
let newVidCompareTab = 'curated';
let newVidCuratedTopics = [];
let newVidActiveFilterCat = '';
let newVidSearchQuery = '';
let newVidSelectedCuratedSlug = null;
let newVidPlayingSfx = null;
let newVidPlayingVoice = null;
let newVidAudioPlayer = null;
let newVidVoiceAudioPlayer = null;

// Sprint 7 Matrix workstation. Publish account selection lives in the monitor,
// never in Channel DNA or in the batch creator.
let matrixMonitorTimer = null;
let matrixBatchId = null;
let matrixPublishChannels = [];
let matrixNiches = [];
let matrixNicheChannels = [];  // detailed channels for currently selected niche

function openMatrixModal() {
  const modal = document.getElementById('modal-matrix-create');
  if (!modal) return;
  modal.style.display = 'flex';
  document.getElementById('matrix-monitor').style.display = 'none';
  // Reset channel grid so stale state is never shown
  const grid = document.getElementById('matrix-channel-grid');
  if (grid) grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--text-muted);padding:24px;font-size:13px">Đang tải…</div>';
  const counter = document.getElementById('matrix-channel-counter');
  if (counter) counter.textContent = '(0/0)';
  loadMatrixNiches();
}
async function syncMatrixChannelCount() {
  const select = document.getElementById('matrix-niche');
  const count = document.getElementById('matrix-count');
  const niche = matrixNiches.find(item => item.id === select?.value);
  if (!count || !niche) { console.warn('[Matrix] syncMatrixChannelCount: niche not found for', select?.value); return; }
  const available = Math.max(1, Number(niche.channel_count || 1));
  count.max = String(Math.min(10, available));
  count.value = String(Math.min(10, available));
  // Load detailed channels for the selected niche
  await loadMatrixNicheChannels(select.value);
}
async function loadMatrixNiches() {
  const select = document.getElementById('matrix-niche');
  if (!select) return;
  try {
    const response = await fetch('/api/matrix/niches');
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.detail || 'Không tải được niche catalog');
    matrixNiches = payload.niches || [];
    select.innerHTML = matrixNiches.map(niche => `<option value="${matrixEscape(niche.id)}" ${niche.channel_count ? '' : 'disabled'}>${matrixEscape(niche.name)}${niche.channel_count ? ` · ${niche.channel_count} kênh` : ' · đang chuẩn bị kênh'}</option>`).join('');
    const pilot = matrixNiches.find(niche => niche.id === 'deep_space' && niche.channel_count);
    if (pilot) select.value = pilot.id;
    select.onchange = () => syncMatrixChannelCount();
    await syncMatrixChannelCount();
  } catch (error) { select.innerHTML = '<option value="">Không tải được niche catalog</option>'; console.warn(error); }
}
function matrixEscape(value) { return escapeHtml(String(value || '')); }

async function loadMatrixNicheChannels(nicheId) {
  const grid = document.getElementById('matrix-channel-grid');
  const rulesContent = document.getElementById('matrix-rules-content');
  if (!grid) return;
  grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--text-muted);padding:24px;font-size:13px">Đang tải kênh…</div>';
  try {
    const res = await fetch(`/api/matrix/niches/${encodeURIComponent(nicheId)}/channels`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Lỗi tải channels');
    matrixNicheChannels = data.channels || [];
    const rules = data.selection_rules || [];
    const allScores = data.all_scores || {};
    // Render rules
    if (rulesContent) {
      const engineScoreHtml = Object.entries(allScores)
        .sort((a, b) => b[1] - a[1])
        .map(([eng, score]) => `<span style="display:inline-flex;align-items:center;gap:3px;background:${score >= 0.8 ? 'rgba(16,185,129,.12)' : score >= 0.55 ? 'rgba(245,158,11,.12)' : 'rgba(239,68,68,.08)'};color:${score >= 0.8 ? '#059669' : score >= 0.55 ? '#d97706' : '#dc2626'};border-radius:6px;padding:2px 8px;font-size:11.5px;font-weight:600">${matrixEscape(eng)} ${(score * 100).toFixed(0)}%</span>`)
        .join(' ');
      rulesContent.innerHTML = `
        <div style="margin-bottom:6px"><strong>Niche:</strong> ${matrixEscape(data.niche_name)} · Min score: ${(data.minimum_score * 100).toFixed(0)}%</div>
        <div style="margin-bottom:8px;display:flex;flex-wrap:wrap;gap:4px">${engineScoreHtml}</div>
        <ul style="margin:0;padding-left:18px">${rules.map(r => `<li>${matrixEscape(r)}</li>`).join('')}</ul>`;
    }
    // Render channel cards
    const limit = Math.min(10, matrixNicheChannels.length);
    document.getElementById('matrix-count').value = String(limit);
    document.getElementById('matrix-count').max = String(matrixNicheChannels.length);
    grid.innerHTML = matrixNicheChannels.map((ch, idx) => {
      const best = ch.best_engine;
      const scorePercent = best ? (best.score * 100).toFixed(0) : '?';
      const scoreColor = best && best.score >= 0.8 ? '#059669' : best && best.score >= 0.55 ? '#d97706' : '#dc2626';
      const engineBadges = (ch.engine_scores || [])
        .sort((a, b) => a.preferred_rank - b.preferred_rank)
        .slice(0, 3)
        .map(e => `<span style="font-size:10px;padding:1px 5px;border-radius:4px;background:${e.id === (best?.id) ? 'rgba(59,130,246,.15)' : 'rgba(148,163,184,.1)'};color:${e.id === (best?.id) ? '#2563eb' : '#94a3b8'};font-weight:${e.id === (best?.id) ? '700' : '400'}">${matrixEscape(e.id)} ${(e.score * 100).toFixed(0)}%</span>`)
        .join(' ');
      return `<label class="matrix-ch-card" style="display:flex;gap:8px;align-items:flex-start;padding:10px 12px;border:1.5px solid var(--border-color,#e2e8f0);border-radius:10px;cursor:pointer;transition:border-color .15s,background .15s;background:var(--bg-card,#fff)" onmouseenter="this.style.borderColor='#3b82f6'" onmouseleave="this.style.borderColor=this.querySelector('input')?.checked?'#3b82f6':'var(--border-color,#e2e8f0)'">
        <input type="checkbox" class="matrix-ch-cb" value="${matrixEscape(ch.channel_id)}" ${idx < limit ? 'checked' : ''} onchange="matrixUpdateCounter()" style="margin-top:3px;accent-color:#3b82f6;flex-shrink:0">
        <div style="min-width:0;flex:1">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <strong style="font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:160px" title="${matrixEscape(ch.channel_id)}">${matrixEscape(ch.name)}</strong>
            <span style="font-size:10.5px;color:${scoreColor};font-weight:700;background:${scoreColor}18;padding:1px 6px;border-radius:4px">${best ? matrixEscape(best.id) : '—'} ${scorePercent}%</span>
          </div>
          <div style="font-size:11px;color:var(--text-muted,#94a3b8);margin-top:2px">${matrixEscape(ch.persona_tone || '')} · v${ch.config_version || '?'}</div>
          <div style="display:flex;gap:3px;flex-wrap:wrap;margin-top:4px">${engineBadges}</div>
        </div>
      </label>`;
    }).join('');
    matrixUpdateCounter();
  } catch (err) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;color:#dc2626;padding:24px;font-size:13px">${matrixEscape(err.message)}</div>`;
    matrixNicheChannels = [];
    console.warn(err);
  }
}

function matrixGetCheckboxes() {
  return Array.from(document.querySelectorAll('#matrix-channel-grid .matrix-ch-cb'));
}
function matrixUpdateCounter() {
  const boxes = matrixGetCheckboxes();
  const checked = boxes.filter(cb => cb.checked).length;
  const counter = document.getElementById('matrix-channel-counter');
  if (counter) counter.textContent = `(${checked}/${boxes.length})`;
  // Highlight selected cards
  boxes.forEach(cb => {
    const card = cb.closest('.matrix-ch-card');
    if (card) {
      card.style.borderColor = cb.checked ? '#3b82f6' : 'var(--border-color,#e2e8f0)';
      card.style.background = cb.checked ? 'rgba(59,130,246,.04)' : 'var(--bg-card,#fff)';
    }
  });
}
function matrixSelectAll() {
  const limit = Number(document.getElementById('matrix-count')?.value || 10);
  matrixGetCheckboxes().forEach((cb, i) => { cb.checked = i < limit; });
  matrixUpdateCounter();
}
function matrixSelectNone() {
  matrixGetCheckboxes().forEach(cb => { cb.checked = false; });
  matrixUpdateCounter();
}
function matrixApplyCountLimit() {
  const limit = Math.min(10, Math.max(1, Number(document.getElementById('matrix-count')?.value || 10)));
  document.getElementById('matrix-count').value = String(limit);
  const boxes = matrixGetCheckboxes();
  let checked = 0;
  boxes.forEach(cb => {
    if (cb.checked) checked++;
    if (checked > limit) { cb.checked = false; }
  });
  // If fewer than limit are checked, enable more from top
  const current = boxes.filter(cb => cb.checked).length;
  if (current < limit) {
    for (const cb of boxes) {
      if (!cb.checked && boxes.filter(c => c.checked).length < limit) cb.checked = true;
    }
  }
  matrixUpdateCounter();
}

async function createMatrixBatchFromUi() {
  const topic = document.getElementById('matrix-topic')?.value.trim();
  const niche_id = document.getElementById('matrix-niche')?.value;
  const selectedBoxes = matrixGetCheckboxes().filter(cb => cb.checked);
  const channel_ids = selectedBoxes.map(cb => cb.value);
  const channel_count = channel_ids.length || Number(document.getElementById('matrix-count')?.value || 5);
  if (channel_count < 1) return alert('Chọn ít nhất 1 kênh.');
  if (channel_count > 10) return alert('Tối đa 10 kênh/mẻ.');
  if (!topic || topic.length < 3) return alert('Nhập đề tài ít nhất 3 ký tự.');
  const button = document.getElementById('matrix-create-btn'); button.disabled = true;
  try {
    const body = { topic, niche_id, channel_count, auto_render: !!document.getElementById('matrix-render')?.checked };
    if (channel_ids.length) body.channel_ids = channel_ids;
    const res = await fetch('/api/matrix/batch/create', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
    const data = await res.json(); if (!res.ok) throw new Error(data.detail || 'Không thể tạo mẻ');
    matrixBatchId = data.batch_id;
    await loadMatrixPublishChannels(); await refreshMatrixMonitor();
    clearInterval(matrixMonitorTimer); matrixMonitorTimer = setInterval(refreshMatrixMonitor, 3000);
  } catch (error) { alert(error.message); } finally { button.disabled = false; }
}

async function loadMatrixPublishChannels() {
  if (matrixPublishChannels.length) return;
  const res = await fetch('/api/channels'); if (!res.ok) return;
  const body = await res.json(); matrixPublishChannels = body.channels || body || [];
}
function matrixChannelOptions() { return '<option value="">Chọn kênh TikTok…</option>' + matrixPublishChannels.map(c => `<option value="${Number(c.id)}">${matrixEscape(c.username || c.note || `Kênh #${c.id}`)}</option>`).join(''); }
async function refreshMatrixMonitor() {
  if (!matrixBatchId) return;
  const res = await fetch(`/api/matrix/batch/${encodeURIComponent(matrixBatchId)}`); if (!res.ok) return;
  const data = await res.json(); const target = document.getElementById('matrix-monitor'); if (!target) return;
  const worker = data.worker || {}; const jobs = data.jobs || [];
  target.style.display = 'block';
  target.innerHTML = `<div style="display:flex;justify-content:space-between"><strong>Matrix monitor · ${matrixEscape(matrixBatchId)}</strong><span>${matrixEscape(worker.state || 'IDLE')}</span></div>${worker.error ? `<p style="color:#b91c1c">${matrixEscape(worker.error)}</p>` : ''}<div style="display:grid;gap:8px;margin-top:10px">${jobs.map(job => `<div style="border:1px solid var(--border-color);border-radius:8px;padding:9px"><div><strong>${matrixEscape(job.channel_id)}</strong> · ${matrixEscape(job.engine_type)} <span style="float:right">${matrixEscape(job.state)}</span></div><div style="font-size:12px;color:var(--text-muted);margin-top:3px">${matrixEscape(job.video_slug)} · cảnh ${job.current_scene_index}/${job.total_scenes}</div>${job.error_message ? `<div style="color:#b91c1c;font-size:12px">${matrixEscape(job.error_message)}</div>` : ''}${job.state === 'READY_TO_PUBLISH' ? `<div style="display:flex;gap:6px;margin-top:7px"><select id="matrix-account-${matrixEscape(job.job_id)}" style="flex:1">${matrixChannelOptions()}</select><button class="btn btn-primary btn-sm" onclick="scheduleMatrixJob('${matrixEscape(job.job_id)}')">Xếp lịch</button></div>` : ''}</div>`).join('')}</div>`;
  if (worker.state === 'DONE' || worker.state === 'ERROR') clearInterval(matrixMonitorTimer);
}
async function scheduleMatrixJob(jobId) {
  const selected = document.getElementById(`matrix-account-${jobId}`)?.value;
  if (!selected) return alert('Chọn kênh TikTok rõ ràng trước khi xếp lịch.');
  const res = await fetch(`/api/matrix/batch/${encodeURIComponent(matrixBatchId)}/schedule`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({assignments:[{job_id:jobId,channel_id:Number(selected)}]})});
  const body = await res.json(); if (!res.ok) return alert(body.detail?.message || body.detail || 'Không thể xếp lịch');
  await refreshMatrixMonitor();
}

async function openNewVideoModal() {
  const modal = document.getElementById('modal-new-video');
  if (!modal) return;

  newVidSelectedTemplate = 'compare';
  newVidActiveCat = 'all';
  newVidSelectedCountry = 'vi';
  newVidCompareTab = 'curated';
  newVidActiveFilterCat = '';
  newVidSearchQuery = '';

  const countrySel = document.getElementById('newvid-country-select');
  if (countrySel) countrySel.value = 'vi';
  const archCountrySel = document.getElementById('newvid-archetype-country-select');
  if (archCountrySel) archCountrySel.value = 'vi';
  onNewVidCountryChange('vi');

  selectNewVidCategory('all');
  selectNewVidTemplate('compare');
  setNewVidCompareTab('curated');

  renderNewVidSoundboard();

  // Load curated topics from /api/topics
  try {
    const res = await fetch('/api/topics');
    if (res.ok) {
      const data = await res.json();
      newVidCuratedTopics = data.topics || [];
      const countEl = document.getElementById('val-newvid-curated-count');
      if (countEl) countEl.textContent = newVidCuratedTopics.length || '28';
    }
  } catch (err) {
    console.warn('Lỗi load topics:', err);
  }

  // Fallback curated topics if empty
  if (!newVidCuratedTopics || newVidCuratedTopics.length === 0) {
    newVidCuratedTopics = [
      { slug: 'tokyo-vs-london', category: 'culture_uk', labelLeft: 'Tàu điện ngầm Tokyo', labelRight: 'Tàu điện ngầm London', message: 'Hạ tầng giao thông đối chiếu 2 thủ đô' },
      { slug: 'vietnam-coffee-vs-italy-espresso', category: 'everyday', labelLeft: 'Cà phê phin Việt', labelRight: 'Espresso Ý', message: 'Văn hóa thưởng thức và độ đậm caffein' },
      { slug: 'samsung-vs-apple', category: 'science', labelLeft: 'Hệ sinh thái Apple', labelRight: 'Hệ sinh thái Samsung', message: 'Triết lý đóng mở và trải nghiệm số' },
      { slug: 'germany-autobahn-vs-usa-interstate', category: 'culture_de', labelLeft: 'Autobahn Đức', labelRight: 'Interstate Mỹ', message: 'Tốc độ vô hạn vs Mạng lưới cao tốc' },
      { slug: 'korea-bbq-vs-japan-yakiniku', category: 'culture_kr', labelLeft: 'Thịt nướng Hàn Quốc', labelRight: 'Yakiniku Nhật Bản', message: 'Nước sốt ướp vs Hương vị nguyên bản' },
      { slug: 'amazon-rainforest-vs-taiga-forest', category: 'nature', labelLeft: 'Rừng nhiệt đới Amazon', labelRight: 'Rừng Taiga Siberia', message: 'Lá phổi xanh và lá chắn carbon địa cầu' },
    ];
  }

  if (newVidCuratedTopics.length > 0 && !newVidSelectedCuratedSlug) {
    newVidSelectedCuratedSlug = newVidCuratedTopics[0].slug;
  }
  renderCuratedCompareCards();
  updateNewVidFooterMeta();

  modal.style.display = 'flex';
}

async function onNewVidAutoPublishToggle() {
  const on = document.getElementById('newvid-autopublish-on')?.checked;
  const ch = document.getElementById('newvid-autopublish-channel');
  const when = document.getElementById('newvid-autopublish-when');
  const dt = document.getElementById('newvid-autopublish-datetime');
  if (ch) ch.disabled = !on;
  if (when) when.disabled = !on;
  if (on && ch && ch.options.length <= 1) {
    const channels = await ensureChannelsLoaded();
    ch.innerHTML = '<option value="">-- Chọn kênh TikTok --</option>' + channels.map(c =>
      `<option value="${c.id}">${escapeHtml(c.username || c.note || `Kênh #${c.id}`)} (${escapeHtml(c.country || '?')})</option>`).join('');
  }
  if (dt) {
    const show = on && when?.value === 'schedule';
    dt.style.display = show ? '' : 'none';
    dt.disabled = !show;
    if (show && !dt.value) {
      const d = new Date(Date.now() + 2 * 3600 * 1000);
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      dt.value = d.toISOString().slice(0, 16);
    }
  }
}

/** Khối publish cho /api/runs, hoặc null. Ném lỗi nếu đã bật mà chưa đủ thông tin. */
function buildNewVidPublishBlock(alsoRender) {
  if (!document.getElementById('newvid-autopublish-on')?.checked) return null;
  if (!alsoRender) throw new Error('Tự đăng cần tích "render MP4 sau khi tạo"');
  const channelId = document.getElementById('newvid-autopublish-channel')?.value;
  if (!channelId) throw new Error('Chọn kênh TikTok để tự đăng — hệ thống không tự chọn kênh');
  const block = { channel_id: parseInt(channelId, 10), ai_generated: true };
  if (document.getElementById('newvid-autopublish-when')?.value === 'schedule') {
    const v = document.getElementById('newvid-autopublish-datetime')?.value;
    const ts = v ? Math.floor(new Date(v).getTime() / 1000) : 0;
    if (!ts || ts < Date.now() / 1000) throw new Error('Chọn giờ hẹn đăng trong tương lai');
    block.schedule_ts = ts;
  }
  return block;
}

function closeNewVideoModal() {
  const modal = document.getElementById('modal-new-video');
  if (modal) modal.style.display = 'none';
  if (newVidAudioPlayer) {
    newVidAudioPlayer.pause();
    newVidAudioPlayer = null;
  }
  if (newVidVoiceAudioPlayer) {
    newVidVoiceAudioPlayer.pause();
    newVidVoiceAudioPlayer = null;
  }
  newVidPlayingSfx = null;
  newVidPlayingVoice = null;
}

function selectNewVidCategory(cat) {
  newVidActiveCat = cat;
  document.querySelectorAll('.newvid-cat-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.cat === cat);
  });
  if (cat !== 'all') {
    const curr = NEWVID_TEMPLATES.find(t => t.id === newVidSelectedTemplate);
    if (!curr || curr.category !== cat) {
      const firstInCat = NEWVID_TEMPLATES.find(t => t.category === cat);
      if (firstInCat) selectNewVidTemplate(firstInCat.id);
    }
  }
  renderNewVidTemplates();
}

function selectNewVidTemplate(tplId) {
  newVidSelectedTemplate = tplId;
  const tpl = NEWVID_TEMPLATES.find(t => t.id === tplId) || NEWVID_TEMPLATES[0];

  const iconEl = document.getElementById('newvid-header-icon');
  const titleEl = document.getElementById('newvid-header-title');
  const subEl = document.getElementById('newvid-header-sub');

  if (iconEl) iconEl.innerHTML = uiIconMarkup(tpl.id, 'newvid-format-icon');
  if (titleEl) {
    titleEl.textContent = `Tạo video mới — ${tpl.name}`;
  }
  if (subEl) {
    const SUB_MAP = {
      compare: 'Tự động thiết kế 12 nhịp, chuẩn hóa bản sắc thị trường & linh vật theo quốc gia',
      survival: 'Mr. Incredible, thanh trạng thái sinh học, âm thanh tim đập & báo động khẩn cấp',
      tierlist: 'Đánh giá bậc SSS đến D, sân khấu bục vinh quang & slam khay rung chấn',
      vox: 'Cắt dán collage báo chí, giấy nhăn, băng dính thủ công & nhịp kể chuyện lôi cuốn',
      newspaper: 'Phong cách phóng sự cổ điển thế kỷ 20, polaroid ghim đỏ, tem niêm phong',
      chalk: 'Phác thảo chiến lược bảng phấn xanh, mũi tên quân sự & vùng ảnh hưởng',
      wildlife: 'Tài liệu sinh tồn thiên nhiên, HUD radar săn mồi & chỉ số sinh tồn',
      kinetic: 'Chữ lớn dẫn chuyện · 6 nhịp kịch tính · lời thoại theo từng cảnh',
      science: 'Hình ảnh thiên văn học, đồ họa vi mô, giải thích hiện tượng bí ẩn vũ trụ',
      mystery: 'Giải mã những hiện tượng siêu nhiên, tài liệu tuyệt mật & dòng sự kiện',
      folklore: 'Giọng kể trầm, phụ đề một dòng, cảnh vẽ tay 2D do Antigravity sinh — chủ đề dân gian theo từng quốc gia',
    };
    subEl.textContent = SUB_MAP[tplId] || tpl.desc;
  }

  const bIcon = document.getElementById('newvid-banner-icon');
  const bName = document.getElementById('newvid-banner-name');
  const bDesc = document.getElementById('newvid-banner-desc');
  const bDur = document.getElementById('newvid-banner-dur');
  if (bIcon) bIcon.innerHTML = uiIconMarkup(tpl.id, 'newvid-format-icon');
  if (bName) bName.textContent = tpl.name;
  if (bDesc) bDesc.textContent = tpl.desc;
  if (bDur) bDur.textContent = `Khung chuẩn: ${tpl.duration}`;

  const panelCompare = document.getElementById('newvid-panel-compare');
  const panelArchetype = document.getElementById('newvid-panel-archetype');

  if (tplId === 'compare') {
    if (panelCompare) panelCompare.style.display = 'flex';
    if (panelArchetype) panelArchetype.style.display = 'none';
  } else {
    if (panelCompare) panelCompare.style.display = 'none';
    if (panelArchetype) panelArchetype.style.display = 'flex';

    const labelEl = document.getElementById('newvid-archetype-label');
    const promptInput = document.getElementById('newvid-custom-prompt');
    const suggContainer = document.getElementById('newvid-archetype-suggestions');

    if (labelEl) labelEl.textContent = `CHỦ ĐỀ ${tpl.name.toUpperCase()}:`;
    if (promptInput) {
      promptInput.placeholder = `Nhập chủ đề ${tpl.shortName} hoặc chọn từ gợi ý bên dưới...`;
    }

    const suggestions = NEWVID_ARCHETYPE_SUGGESTIONS[tplId] || [];
    if (suggContainer) {
      suggContainer.innerHTML = suggestions.map(s => `
        <div onclick="selectArchetypeSuggestion('${escapeHtml(s.title)}')" style="display: flex; align-items: center; justify-content: space-between; padding: 7px 12px; background: var(--color-surface); border: 1px solid var(--color-line); border-radius: 8px; cursor: pointer; transition: all 0.15s;" onmouseover="this.style.borderColor='var(--color-terra)'" onmouseout="this.style.borderColor='var(--color-line)'">
          <div style="font-size: 11.5px; font-weight: 800; color: var(--color-ink);">${escapeHtml(s.title)}</div>
          <div style="font-size: 10px; color: var(--color-ink-dim);">${escapeHtml(s.desc)}</div>
        </div>
      `).join('');
    }

    if (promptInput && (!promptInput.value || promptInput.value === '')) {
      if (suggestions.length > 0) promptInput.value = suggestions[0].title;
    }
    if (tplId === 'folklore') {
      if (promptInput) promptInput.value = '';
      loadFolkloreSuggestions(newVidSelectedCountry);
    }
  }
  const folkOpts = document.getElementById('newvid-folklore-options');
  if (folkOpts) folkOpts.style.display = tplId === 'folklore' ? 'flex' : 'none';

  renderNewVidTemplates();
  updateNewVidFooterMeta();
}

function renderNewVidTemplates() {
  const grid = document.getElementById('newvid-templates-grid');
  if (!grid) return;
  const filtered = newVidActiveCat === 'all' 
    ? NEWVID_TEMPLATES 
    : NEWVID_TEMPLATES.filter(t => t.category === newVidActiveCat);

  grid.innerHTML = filtered.map(t => {
    const isSelected = t.id === newVidSelectedTemplate;
    return `
      <div class="newvid-tpl-card ${isSelected ? 'active' : ''}" onclick="selectNewVidTemplate('${t.id}')">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            ${uiIconMarkup(t.id, 'newvid-format-icon')}
            <span style="font-size: 13px; font-weight: 900; color: var(--color-ink);">${escapeHtml(t.shortName)}</span>
          </div>
          ${t.isNew ? '<span class="new-badge">MỚI</span>' : ''}
        </div>
        <div style="font-size: 11px; color: var(--color-ink-soft); line-height: 1.35; margin-bottom: 8px; min-height: 28px;">
          ${escapeHtml(t.desc)}
        </div>
        <div style="display: flex; align-items: center; justify-content: space-between; font-size: 10px; border-top: 1px solid rgba(213, 203, 160, 0.4); padding-top: 6px;">
          <span style="color: var(--color-ink-dim); font-weight: 700;">Thời lượng:</span>
          <span style="font-variant-numeric: tabular-nums; font-weight: 800; color: ${t.accentColor};">${t.duration}</span>
        </div>
      </div>
    `;
  }).join('');
}

function onNewVidCountryChange(code) {
  newVidSelectedCountry = code || 'vi';
  const c = NEWVID_COUNTRIES.find(item => item.code === newVidSelectedCountry) || NEWVID_COUNTRIES[0];

  ['newvid-voice-select', 'newvid-archetype-voice-select'].forEach(id => {
    const voiceSelect = document.getElementById(id);
    if (voiceSelect) {
      voiceSelect.innerHTML = c.voices.map(v => `
        <option value="${v.id}">${escapeHtml(v.name)}</option>
      `).join('');
      voiceSelect.value = c.defaultVoice;
    }
  });
  newVidSelectedVoice = c.defaultVoice;

  ['newvid-country-select', 'newvid-archetype-country-select'].forEach(id => {
    const countrySelect = document.getElementById(id);
    if (countrySelect && countrySelect.value !== newVidSelectedCountry) {
      countrySelect.value = newVidSelectedCountry;
    }
  });

  const mascot = NEWVID_COUNTRY_MASCOTS[newVidSelectedCountry] || NEWVID_COUNTRY_MASCOTS.vi;
  const flagEl = document.getElementById('newvid-mascot-flag');
  const nameEl = document.getElementById('newvid-mascot-name');
  const themeEl = document.getElementById('newvid-mascot-theme');
  if (flagEl) flagEl.textContent = mascot.flag;
  if (nameEl) nameEl.textContent = mascot.mascotName;
  if (themeEl) themeEl.textContent = mascot.themeName;

  if (newVidSelectedTemplate === 'folklore') loadFolkloreSuggestions(newVidSelectedCountry);
  updateNewVidFooterMeta();
}

// Gợi ý chủ đề Tâm Linh Dân Gian do AI đề xuất theo văn hoá của ngôn ngữ đang chọn.
const newVidFolkloreSuggestionCache = {};
let newVidFolkloreSuggestLang = null;
async function loadFolkloreSuggestions(lang) {
  const box = document.getElementById('newvid-archetype-suggestions');
  const input = document.getElementById('newvid-custom-prompt');
  newVidFolkloreSuggestLang = lang;
  const render = (topics) => {
    if (newVidSelectedTemplate !== 'folklore' || newVidFolkloreSuggestLang !== lang || !box) return;
    NEWVID_ARCHETYPE_SUGGESTIONS.folklore = topics.map(t => ({ title: t.prompt || t.title, desc: t.hook || '' }));
    box.innerHTML = topics.map(t => `
      <div data-topic="${escapeHtml(t.prompt || t.title)}" onclick="selectArchetypeSuggestion(this.dataset.topic)" style="display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 7px 12px; background: var(--color-surface); border: 1px solid var(--color-line); border-radius: 8px; cursor: pointer;" onmouseover="this.style.borderColor='var(--color-terra)'" onmouseout="this.style.borderColor='var(--color-line)'">
        <div style="font-size: 11.5px; font-weight: 800; color: var(--color-ink); white-space: nowrap;">${escapeHtml(t.emoji || '🕯️')} ${escapeHtml(t.title)}</div>
        <div style="font-size: 10px; color: var(--color-ink-dim); text-align: right;">${escapeHtml(t.hook || '')}</div>
      </div>`).join('');
    if (input && !input.value && topics[0]) input.value = topics[0].prompt || topics[0].title;
    updateNewVidFooterMeta();
  };
  if (newVidFolkloreSuggestionCache[lang]) return render(newVidFolkloreSuggestionCache[lang]);
  if (box) box.innerHTML = '<div style="font-size: 11px; color: var(--color-ink-dim); padding: 6px 2px;">⏳ AI đang gợi ý chủ đề dân gian theo ngôn ngữ đã chọn...</div>';
  try {
    const res = await fetch('/api/folklore/suggest-topics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lang, count: 8 }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    newVidFolkloreSuggestionCache[lang] = data.topics || [];
    render(newVidFolkloreSuggestionCache[lang]);
  } catch (err) {
    if (box && newVidFolkloreSuggestLang === lang) box.innerHTML = `<div style="font-size: 11px; color: var(--color-terra); padding: 6px 2px;">Không lấy được gợi ý (${escapeHtml(err.message)}) — tự nhập chủ đề ở ô trên.</div>`;
  }
}

function onNewVidVoiceChange(voiceId) {
  newVidSelectedVoice = voiceId;
  ['newvid-voice-select', 'newvid-archetype-voice-select'].forEach(id => {
    const el = document.getElementById(id);
    if (el && el.value !== voiceId) el.value = voiceId;
  });
}

function toggleVoicePreview() {
  const updateBtns = (text) => {
    document.querySelectorAll('.newvid-btn-voice-preview, #newvid-btn-voice-preview, #newvid-btn-archetype-voice-preview').forEach(b => {
      b.textContent = text;
    });
  };

  if (newVidPlayingVoice) {
    if (newVidVoiceAudioPlayer) {
      newVidVoiceAudioPlayer.pause();
      newVidVoiceAudioPlayer = null;
    }
    newVidPlayingVoice = null;
    updateBtns('🔊 Nghe thử');
    return;
  }

  const voiceId = newVidSelectedVoice || 'vi-VN-NamMinhNeural';
  const url = `/api/tts/preview?voice=${encodeURIComponent(voiceId)}&lang=${encodeURIComponent(newVidSelectedCountry)}`;

  if (newVidVoiceAudioPlayer) {
    newVidVoiceAudioPlayer.pause();
  }
  newVidVoiceAudioPlayer = new Audio(url);
  newVidPlayingVoice = voiceId;
  updateBtns('⏹ Dừng');

  newVidVoiceAudioPlayer.onended = () => {
    newVidPlayingVoice = null;
    updateBtns('🔊 Nghe thử');
  };
  newVidVoiceAudioPlayer.onerror = () => {
    newVidPlayingVoice = null;
    updateBtns('🔊 Nghe thử');
    showToast('⚠️ Không thể phát bản xem trước giọng đọc');
  };
  newVidVoiceAudioPlayer.play().catch(() => {
    newVidPlayingVoice = null;
    updateBtns('🔊 Nghe thử');
  });
}

function setNewVidCompareTab(tab) {
  newVidCompareTab = tab;
  const btnCurated = document.getElementById('btn-newvid-tab-curated');
  const btnAi = document.getElementById('btn-newvid-tab-ai');
  const viewCurated = document.getElementById('newvid-view-curated');
  const viewAi = document.getElementById('newvid-view-ai');

  if (tab === 'curated') {
    if (btnCurated) {
      btnCurated.style.background = 'var(--color-terra)';
      btnCurated.style.color = '#ffffff';
      btnCurated.style.borderColor = 'transparent';
    }
    if (btnAi) {
      btnAi.style.background = 'transparent';
      btnAi.style.color = 'var(--color-ink-soft)';
      btnAi.style.borderColor = 'var(--color-line)';
    }
    if (viewCurated) viewCurated.style.display = 'flex';
    if (viewAi) viewAi.style.display = 'none';
  } else {
    if (btnCurated) {
      btnCurated.style.background = 'transparent';
      btnCurated.style.color = 'var(--color-ink-soft)';
      btnCurated.style.borderColor = 'var(--color-line)';
    }
    if (btnAi) {
      btnAi.style.background = 'var(--color-gold)';
      btnAi.style.color = '#ffffff';
      btnAi.style.borderColor = 'transparent';
    }
    if (viewCurated) viewCurated.style.display = 'none';
    if (viewAi) viewAi.style.display = 'flex';
  }
  updateNewVidFooterMeta();
}

function filterCompareCat(cat) {
  newVidActiveFilterCat = cat;
  document.querySelectorAll('#newvid-view-curated .filter-chip').forEach(c => {
    c.classList.toggle('active', (c.dataset.cat || '') === cat);
  });
  renderCuratedCompareCards();
}

function onNewVidCompareSearch(val) {
  newVidSearchQuery = (val || '').trim().toLowerCase();
  renderCuratedCompareCards();
}

function renderCuratedCompareCards() {
  const container = document.getElementById('newvid-curated-grid');
  if (!container) return;

  let items = newVidCuratedTopics || [];
  if (newVidActiveFilterCat) {
    items = items.filter(t => (t.category || '').toLowerCase() === newVidActiveFilterCat.toLowerCase());
  }
  if (newVidSearchQuery) {
    items = items.filter(t => 
      (t.labelLeft || '').toLowerCase().includes(newVidSearchQuery) ||
      (t.labelRight || '').toLowerCase().includes(newVidSearchQuery) ||
      (t.message || '').toLowerCase().includes(newVidSearchQuery) ||
      (t.slug || '').toLowerCase().includes(newVidSearchQuery)
    );
  }

  if (items.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 16px; font-size: 11px; color: var(--color-ink-dim);">
        Không tìm thấy chủ đề phù hợp với từ khóa "${escapeHtml(newVidSearchQuery)}"
      </div>
    `;
    return;
  }

  container.innerHTML = items.map(t => {
    const isSelected = t.slug === newVidSelectedCuratedSlug;
    return `
      <div class="curated-topic-card ${isSelected ? 'active' : ''}" onclick="selectCuratedCompareTopic('${escapeHtml(t.slug)}')">
        <div style="font-size: 11px; font-weight: 800; color: var(--color-ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
          ${escapeHtml(t.labelLeft)} vs ${escapeHtml(t.labelRight)}
        </div>
        <div style="font-size: 9.5px; color: var(--color-ink-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px;">
          ${escapeHtml(t.message || t.category || '')}
        </div>
      </div>
    `;
  }).join('');
}

function selectCuratedCompareTopic(slug) {
  newVidSelectedCuratedSlug = slug;
  renderCuratedCompareCards();
  updateNewVidFooterMeta();
}

function randomizeCompareTopic() {
  if (!newVidCuratedTopics || newVidCuratedTopics.length === 0) return;
  const rand = newVidCuratedTopics[Math.floor(Math.random() * newVidCuratedTopics.length)];
  selectCuratedCompareTopic(rand.slug);
}

function triggerGeminiResearch() {
  const promptInput = document.getElementById('newvid-ai-prompt');
  const val = promptInput ? promptInput.value.trim() : '';
  if (!val) {
    showToast('⚠️ Vui lòng nhập đề tài để Gemini nghiên cứu');
    if (promptInput) promptInput.focus();
    return;
  }
  showToast(`✨ Gemini đang phân tích và chuẩn bị tư liệu cho: "${val}"...`);
  updateNewVidFooterMeta();
}

function renderNewVidSoundboard() {
  const grid = document.getElementById('newvid-soundboard-grid');
  if (!grid) return;
  grid.innerHTML = NEWVID_SFX_LIST.map(sfx => {
    const isPlaying = newVidPlayingSfx === sfx.id;
    return `
      <button type="button" class="newvid-sfx-btn ${isPlaying ? 'playing' : ''}" onclick="playNewVidSfx('${sfx.id}')" title="Nghe thử ${sfx.name} (${sfx.tag})">
        <span>${isPlaying ? '⏹' : sfx.icon}</span>
        <span>${escapeHtml(sfx.name)}</span>
      </button>
    `;
  }).join('');
}

function playNewVidSfx(sfxId) {
  if (newVidPlayingSfx === sfxId) {
    if (newVidAudioPlayer) {
      newVidAudioPlayer.pause();
      newVidAudioPlayer = null;
    }
    newVidPlayingSfx = null;
    renderNewVidSoundboard();
    return;
  }

  if (newVidAudioPlayer) {
    newVidAudioPlayer.pause();
  }
  const url = `/api/audio/sfx/${sfxId}`;
  newVidAudioPlayer = new Audio(url);
  newVidAudioPlayer.volume = 0.5;
  newVidPlayingSfx = sfxId;
  renderNewVidSoundboard();

  newVidAudioPlayer.onended = () => {
    newVidPlayingSfx = null;
    renderNewVidSoundboard();
  };
  newVidAudioPlayer.onerror = () => {
    newVidPlayingSfx = null;
    renderNewVidSoundboard();
  };
  newVidAudioPlayer.play().catch(() => {
    newVidPlayingSfx = null;
    renderNewVidSoundboard();
  });
}

// Nghe thử SFX từ thẻ beat trong Studio Video (dùng chung kho /api/audio/sfx).
let wsSfxPreviewPlayer = null;
let wsSfxPreviewId = null;

function playSfxPreview(sfxId) {
  if (!sfxId) return;

  if (wsSfxPreviewPlayer) {
    wsSfxPreviewPlayer.pause();
    wsSfxPreviewPlayer = null;
  }

  // Bấm lại đúng hiệu ứng đang phát = dừng.
  if (wsSfxPreviewId === sfxId) {
    wsSfxPreviewId = null;
    return;
  }

  wsSfxPreviewId = sfxId;
  wsSfxPreviewPlayer = new Audio(`/api/audio/sfx/${encodeURIComponent(sfxId)}`);
  wsSfxPreviewPlayer.volume = 0.5;
  wsSfxPreviewPlayer.onended = () => { wsSfxPreviewId = null; wsSfxPreviewPlayer = null; };
  wsSfxPreviewPlayer.onerror = () => {
    wsSfxPreviewId = null;
    wsSfxPreviewPlayer = null;
    showToast(`Không tải được hiệu ứng âm thanh "${sfxId}"`, 3500);
  };
  wsSfxPreviewPlayer.play().catch(() => {
    wsSfxPreviewId = null;
    wsSfxPreviewPlayer = null;
  });
}

function randomizeCustomPrompt() {
  const suggestions = NEWVID_ARCHETYPE_SUGGESTIONS[newVidSelectedTemplate] || [];
  if (suggestions.length === 0) return;
  const rand = suggestions[Math.floor(Math.random() * suggestions.length)];
  selectArchetypeSuggestion(rand.title);
}

function selectArchetypeSuggestion(title) {
  const input = document.getElementById('newvid-custom-prompt');
  if (input) {
    input.value = title;
  }
  updateNewVidFooterMeta();
}

function updateNewVidFooterMeta() {
  const footerEl = document.getElementById('newvid-footer-meta');
  if (!footerEl) return;

  const tpl = NEWVID_TEMPLATES.find(t => t.id === newVidSelectedTemplate) || NEWVID_TEMPLATES[0];
  const country = NEWVID_COUNTRIES.find(c => c.code === newVidSelectedCountry) || NEWVID_COUNTRIES[0];

  let topicSlug = 'video-project';
  if (newVidSelectedTemplate === 'compare') {
    if (newVidCompareTab === 'ai') {
      const aiVal = document.getElementById('newvid-ai-prompt')?.value.trim();
      topicSlug = aiVal ? aiVal.toLowerCase().replace(/[^a-z0-9]+/g, '-') : 'ai-custom-topic';
    } else {
      topicSlug = newVidSelectedCuratedSlug || 'tokyo-vs-london';
    }
  } else {
    const promptVal = document.getElementById('newvid-custom-prompt')?.value.trim();
    topicSlug = promptVal ? promptVal.toLowerCase().replace(/[^a-z0-9]+/g, '-') : `${newVidSelectedTemplate}-project`;
  }

  footerEl.innerHTML = `
    <span style="font-weight: 800; color: var(--color-ink);">videos/${escapeHtml(topicSlug)}-${escapeHtml(country.code)}/</span>
    <span>•</span>
    <span>${country.flag} ${escapeHtml(country.langName)}</span>
    <span>•</span>
    <span style="color: ${tpl.accentColor}; font-weight: 800;">${tpl.icon} ${escapeHtml(tpl.name)} (${tpl.duration})</span>
  `;
}

async function submitNewVideoModal() {
  const btn = document.getElementById('btn-newvid-create');
  const alsoRender = document.getElementById('newvid-also-render')?.checked !== false;
  const template = newVidSelectedTemplate;
  const lang = newVidSelectedCountry || 'vi';
  const voice = newVidSelectedVoice || 'vi-VN-NamMinhNeural';

  let topicTitle = '';
  let topicSlug = '';

  if (template === 'compare') {
    if (newVidCompareTab === 'ai') {
      const aiPrompt = document.getElementById('newvid-ai-prompt')?.value.trim();
      if (!aiPrompt) {
        showToast('⚠️ Vui lòng nhập đề tài để AI nghiên cứu!');
        document.getElementById('newvid-ai-prompt')?.focus();
        return;
      }
      topicTitle = aiPrompt;
      topicSlug = aiPrompt.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    } else {
      const found = (newVidCuratedTopics || []).find(t => t.slug === newVidSelectedCuratedSlug);
      if (found) {
        topicTitle = `${found.labelLeft} vs ${found.labelRight}`;
        topicSlug = found.slug;
      } else {
        topicTitle = 'Tàu điện ngầm Tokyo vs Tàu điện ngầm London';
        topicSlug = 'tokyo-vs-london';
      }
    }
  } else {
    const customPrompt = document.getElementById('newvid-custom-prompt')?.value.trim();
    if (!customPrompt) {
      showToast('⚠️ Vui lòng nhập chủ đề video!');
      document.getElementById('newvid-custom-prompt')?.focus();
      return;
    }
    topicTitle = customPrompt;
    topicSlug = `${template}-${Date.now().toString(36)}-${lang}`;
  }

  let publishBlock = null;
  try {
    publishBlock = buildNewVidPublishBlock(alsoRender);
  } catch (err) {
    showToast('⚠️ ' + err.message, 5000);
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>⏳ Đang sinh kịch bản AI...</span>';
  }

  try {
    let spec = null;
    let targetDur = 36;

    if (template === 'compare') {
      targetDur = 36;
      const genRes = await fetch('/api/topics/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: topicTitle,
          slug: topicSlug,
          lang: lang,
          voice: voice,
          ai: (newVidCompareTab === 'ai')
        })
      });
      if (!genRes.ok) {
        const err = await genRes.json().catch(() => ({}));
        throw new Error(err.error || `Lỗi sinh so sánh: HTTP ${genRes.status}`);
      }
      spec = await genRes.json();
    } else if (template === 'survival') {
      targetDur = 65;
      const genRes = await fetch('/api/survival/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: topicTitle, lang: lang, voice: voice })
      });
      if (!genRes.ok) throw new Error(`Lỗi sinh Sinh Tồn: HTTP ${genRes.status}`);
      const cfg = await genRes.json();
      const finalSlug = (cfg.slug || `survival-${Date.now()}-${lang}`).toLowerCase().replace(/[^a-z0-9-]/g, '-');
      spec = {
        type: 'survival',
        slug: finalSlug,
        lang: lang,
        voice: cfg.voice || voice,
        title: cfg.title,
        labelLeft: 'Mr Incredible',
        labelRight: 'Survival',
        category: 'survival',
        message: `${cfg.title} — ${cfg.eyebrow || ''}`,
        captions: [cfg.prologueSpoken, ...(cfg.tiers || []).map(t => t.caption), cfg.ctaSpoken].filter(Boolean),
        spoken: [cfg.prologueSpoken, ...(cfg.tiers || []).map(t => t.caption), cfg.ctaSpoken].filter(Boolean),
        script: cfg.prologueText || cfg.title,
        survivalConfig: cfg
      };
    } else if (template === 'tierlist') {
      targetDur = 65;
      const genRes = await fetch('/api/tierlist/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: topicTitle, lang: lang, voice: voice })
      });
      if (!genRes.ok) throw new Error(`Lỗi sinh Tier List: HTTP ${genRes.status}`);
      const cfg = await genRes.json();
      const finalSlug = (cfg.slug || `tierlist-${Date.now()}-${lang}`).toLowerCase().replace(/[^a-z0-9-]/g, '-');
      spec = {
        type: 'tierlist',
        slug: finalSlug,
        lang: lang,
        voice: cfg.voice || voice,
        title: cfg.topicTitle || topicTitle,
        labelLeft: 'Tier List',
        labelRight: 'Ranking',
        category: 'tierlist',
        message: `${cfg.headline || cfg.topicTitle}`,
        captions: (cfg.items || []).map(i => `${i.name}: ${i.hook || i.review || ''}`),
        spoken: (cfg.items || []).map(i => `${i.name}: ${i.hook || i.review || ''}`),
        script: cfg.topicTitle,
        tierListConfig: cfg
      };
    } else if (template === 'vox') {
      targetDur = 60;
      const genRes = await fetch('/api/vox/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: topicTitle, lang: lang, voice: voice })
      });
      if (!genRes.ok) throw new Error(`Lỗi sinh Vox: HTTP ${genRes.status}`);
      const cfg = await genRes.json();
      const finalSlug = (cfg.slug || `vox-${Date.now()}-${lang}`).toLowerCase().replace(/[^a-z0-9-]/g, '-');
      spec = {
        type: 'vox',
        slug: finalSlug,
        lang: lang,
        voice: cfg.voice || voice,
        title: cfg.topicTitle,
        labelLeft: 'Vox',
        labelRight: 'Collage',
        category: 'vox',
        message: `${cfg.topicTitle} — ${cfg.eyebrow || ''}`,
        captions: (cfg.beats || []).map(b => b.line),
        spoken: (cfg.beats || []).map(b => b.line),
        script: cfg.fullScriptHtml || cfg.topicTitle,
        voxConfig: cfg
      };
    } else if (template === 'newspaper') {
      targetDur = 65;
      const genRes = await fetch('/api/newspaper/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: topicTitle, lang: lang, voice: voice })
      });
      if (!genRes.ok) throw new Error(`Lỗi sinh Báo cũ: HTTP ${genRes.status}`);
      const cfg = await genRes.json();
      const finalSlug = (cfg.slug || `newspaper-${Date.now()}-${lang}`).toLowerCase().replace(/[^a-z0-9-]/g, '-');
      spec = {
        type: 'newspaper',
        slug: finalSlug,
        lang: lang,
        voice: cfg.voice || voice,
        title: cfg.headline,
        labelLeft: cfg.publication || 'Chronicle',
        labelRight: 'Investigation',
        category: 'newspaper',
        message: `${cfg.headline} — ${cfg.subheadline || ''}`,
        captions: (cfg.sections || []).map(s => s.spoken),
        spoken: (cfg.sections || []).map(s => s.spoken),
        script: cfg.fullScriptHtml || cfg.headline,
        newspaperConfig: cfg
      };
    } else if (template === 'chalk') {
      targetDur = 65;
      const genRes = await fetch('/api/chalk/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: topicTitle, lang: lang, voice: voice })
      });
      if (!genRes.ok) throw new Error(`Lỗi sinh Bảng Phấn: HTTP ${genRes.status}`);
      const cfg = await genRes.json();
      const finalSlug = (cfg.slug || `chalk-${Date.now()}-${lang}`).toLowerCase().replace(/[^a-z0-9-]/g, '-');
      spec = {
        type: 'chalk',
        slug: finalSlug,
        lang: lang,
        voice: cfg.voice || voice,
        title: cfg.topicTitle || topicTitle,
        labelLeft: 'Chalkboard',
        labelRight: 'Geopolitics',
        category: 'chalk',
        message: `${cfg.headline || cfg.topicTitle}`,
        captions: (cfg.scenes || []).map(s => s.line),
        spoken: (cfg.scenes || []).map(s => s.line),
        script: cfg.topicTitle,
        chalkConfig: cfg
      };
    } else if (template === 'wildlife') {
      targetDur = 55;
      const genRes = await fetch('/api/wildlife/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: topicTitle, lang: lang, voice: voice })
      });
      if (!genRes.ok) throw new Error(`Lỗi sinh Động Vật: HTTP ${genRes.status}`);
      const cfg = await genRes.json();
      const finalSlug = (cfg.slug || `wildlife-${Date.now()}-${lang}`).toLowerCase().replace(/[^a-z0-9-]/g, '-');
      spec = {
        type: 'wildlife',
        slug: finalSlug,
        lang: lang,
        voice: cfg.voice || voice,
        title: cfg.topicTitle || topicTitle,
        labelLeft: 'Wildlife',
        labelRight: 'Documentary',
        category: 'wildlife',
        message: `${cfg.headline || cfg.topicTitle}`,
        captions: (cfg.scenes || []).map(s => s.line),
        spoken: (cfg.scenes || []).map(s => s.line),
        script: cfg.topicTitle,
        wildlifeConfig: cfg
      };
    } else if (template === 'kinetic') {
      targetDur = 65;
      const genRes = await fetch('/api/kinetic/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: topicTitle, lang: lang, voice: voice })
      });
      if (!genRes.ok) throw new Error(`Lỗi sinh Kinetic: HTTP ${genRes.status}`);
      const cfg = await genRes.json();
      const finalSlug = (cfg.slug || `kinetic-${Date.now()}-${lang}`).toLowerCase().replace(/[^a-z0-9-]/g, '-');
      spec = {
        type: 'kinetic',
        slug: finalSlug,
        lang: lang,
        voice: cfg.voice || voice,
        title: cfg.headline,
        labelLeft: cfg.series || 'Mental Model',
        labelRight: cfg.code || 'SYSTEM',
        category: 'kinetic',
        message: `${cfg.headline} — ${cfg.punchline || ''}`,
        captions: (cfg.beats || []).map(b => b.spoken),
        spoken: (cfg.beats || []).map(b => b.spoken),
        script: cfg.fullScriptHtml || cfg.headline,
        kineticConfig: cfg
      };
    } else if (template === 'science') {
      targetDur = 65;
      const genRes = await fetch('/api/science/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: topicTitle, lang: lang, voice: voice })
      });
      if (!genRes.ok) throw new Error(`Lỗi sinh Khoa học: HTTP ${genRes.status}`);
      const cfg = await genRes.json();
      const finalSlug = (cfg.slug || `science-${Date.now()}-${lang}`).toLowerCase().replace(/[^a-z0-9-]/g, '-');
      spec = {
        type: 'science',
        slug: finalSlug,
        lang: lang,
        voice: (cfg.voices && cfg.voices.narrator) || voice,
        title: cfg.title,
        labelLeft: 'Science',
        labelRight: 'Explained',
        category: 'science',
        message: `${cfg.title} — ${cfg.question || ''}`,
        captions: (cfg.dialogues || []).map(d => d.text),
        spoken: (cfg.dialogues || []).map(d => d.text),
        script: cfg.scienceFact || cfg.title,
        scienceConfig: cfg
      };
    } else if (template === 'mystery') {
      targetDur = 65;
      const genRes = await fetch('/api/mystery/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: topicTitle, lang: lang, voice: voice })
      });
      if (!genRes.ok) throw new Error(`Lỗi sinh Kỳ án: HTTP ${genRes.status}`);
      const cfg = await genRes.json();
      const finalSlug = (cfg.slug || `mystery-${Date.now()}-${lang}`).toLowerCase().replace(/[^a-z0-9-]/g, '-');
      spec = {
        type: 'mystery',
        slug: finalSlug,
        lang: lang,
        voice: cfg.voice || voice,
        title: cfg.topicTitle,
        labelLeft: 'Mystery',
        labelRight: 'Archive',
        category: 'mystery',
        message: `${cfg.topicTitle} — ${cfg.eyebrow || ''}`,
        captions: (cfg.scenes || []).map(s => s.line),
        spoken: (cfg.scenes || []).map(s => s.line),
        script: cfg.fullScriptHtml || cfg.topicTitle,
        mysteryConfig: cfg
      };
    } else if (template === 'folklore') {
      targetDur = Number(document.getElementById('newvid-folklore-duration')?.value || 70);
      if (btn) btn.innerHTML = '<span>⏳ AI đang viết kịch bản dân gian...</span>';
      const genRes = await fetch('/api/folklore/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: topicTitle, lang: lang, voice: voice, targetDuration: targetDur,
          voiceStyle: document.getElementById('newvid-folklore-voice-style')?.value || 'eerie',
          vfx: document.getElementById('newvid-folklore-vfx')?.value || 'horror',
        })
      });
      const cfg = await genRes.json().catch(() => ({}));
      if (!genRes.ok) throw new Error(cfg.error || `Lỗi sinh kịch bản Tâm Linh: HTTP ${genRes.status}`);
      spec = {
        ...cfg,
        type: 'folklore',
        slug: (cfg.slug || `folklore-${Date.now().toString(36)}-${lang}`).toLowerCase().replace(/[^a-z0-9-]/g, '-'),
        lang: lang,
        voice: cfg.voice || voice,
        title: cfg.topicTitle,
        category: 'folklore',
        message: `${cfg.topicTitle} — ${cfg.hook || ''}`,
        captions: (cfg.scenes || []).map(s => s.line),
        spoken: (cfg.scenes || []).map(s => s.line),
        imageTimeoutMin: 45,
        folkloreConfig: cfg,
      };
    }

    if (!spec || !spec.slug) {
      throw new Error('Không thể tạo cấu hình kịch bản!');
    }

    showToast(`🚀 Đang khởi động pipeline render video: ${spec.slug}...`);

    const postRun = (publish) => fetch('/api/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: spec.slug,
        task: 'create',
        target: targetDur,
        render: alsoRender,
        spec: spec,
        ...(publish ? { publish } : {})
      })
    });
    let runRes = await postRun(publishBlock);
    if (runRes.status === 409 && publishBlock) {
      const warn = await runRes.clone().json().catch(() => ({}));
      if (warn.needsConfirm) {
        if (!confirm(`${warn.error}.\nVẫn hẹn tự đăng video này?`)) throw new Error('Đã huỷ tự đăng');
        runRes = await postRun({ ...publishBlock, confirm_nearby: true });
      }
    }

    if (!runRes.ok) {
      const err = await runRes.json().catch(() => ({}));
      throw new Error(err.error || `Lỗi chạy pipeline: HTTP ${runRes.status}`);
    }

    const runData = await runRes.json();
    closeNewVideoModal();
    showToast(`🎉 Video đang tạo: ${spec.title || spec.slug}`);
    startWsRunStreaming(runData.id, 'create', spec.slug);

  } catch (err) {
    console.error('Lỗi tạo video:', err);
    showToast('❌ Lỗi: ' + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span>Tạo video ngay</span>';
    }
  }
}


function openTemplateReviewModal() {
  const modal = document.getElementById('modal-template-review');
  if (modal) modal.style.display = 'flex';
}

function closeTemplateReviewModal() {
  const modal = document.getElementById('modal-template-review');
  if (modal) modal.style.display = 'none';
}

// --- WireGuard VPN & Browser Profile Handlers ---


// ---------------------------------------------------------------- Template Review (app.js cũ)
function setWsTemplateReviewType(tpl) {
  wsTplCurrentType = tpl;
  document.querySelectorAll('#ws-template-review-container .filter-chip').forEach(c => {
    c.classList.toggle('active', c.dataset.tpl === tpl);
  });
  loadWsTemplateTiming(tpl, wsTplCurrentLang);
}

function setWsTemplateReviewLang(lang) {
  wsTplCurrentLang = lang;
  loadWsTemplateTiming(wsTplCurrentType, lang);
}

async function loadWsTemplateTiming(type, lang) {
  const tbody = document.getElementById('ws-tpl-timing-tbody');
  const durBadge = document.getElementById('ws-tpl-total-dur-badge');
  if (tbody) tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px; color: var(--color-ink-dim);">Đang tải thông số nhịp template...</td></tr>';

  try {
    const res = await fetch(`/api/template/timing?type=${encodeURIComponent(type)}&lang=${encodeURIComponent(lang)}`);
    const data = await res.json();
    const timing = data.timing || [];
    const totalSecs = data.root || (timing.length > 0 ? (timing[timing.length - 1].start + timing[timing.length - 1].dur) : 40);

    if (durBadge) durBadge.textContent = `Tổng: ${totalSecs.toFixed(0)}s`;

    if (tbody) {
      if (timing.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px; color: var(--color-ink-dim);">Không có nhịp timing nào.</td></tr>';
      } else {
        tbody.innerHTML = timing.map(b => {
          const startTime = typeof b.start === 'number' ? b.start.toFixed(1) : '0.0';
          const durTime = typeof b.dur === 'number' ? b.dur.toFixed(1) : '3.0';
          const endTime = (parseFloat(startTime) + parseFloat(durTime)).toFixed(1);
          
          let toneBadge = '<span class="badge-tag" style="background: rgba(100, 116, 139, 0.15); color: #64748b;">NEUTRAL</span>';
          const bLower = (b.beat || '').toLowerCase();
          if (bLower.includes('hook') || bLower.includes('cta')) {
            toneBadge = '<span class="badge-tag" style="background: rgba(16, 185, 129, 0.15); color: #10b981;">HOOK / CTA</span>';
          } else if (bLower.includes('compare') || bLower.includes('question') || bLower.includes('summary')) {
            toneBadge = '<span class="badge-tag" style="background: rgba(245, 158, 11, 0.15); color: #f59e0b;">COMPARE</span>';
          } else if (bLower.includes('rule') || bLower.includes('payoff') || bLower.includes('stakes')) {
            toneBadge = '<span class="badge-tag" style="background: rgba(234, 88, 12, 0.15); color: #ea580c;">RULE</span>';
          }

          return `
            <tr>
              <td style="font-variant-numeric: tabular-nums; font-weight: 800; color: var(--color-ink-dim);">#${b.n}</td>
              <td style="font-variant-numeric: tabular-nums; font-size: 11px; color: var(--color-terra);">${startTime}s - ${endTime}s</td>
              <td>${toneBadge}</td>
              <td style="font-size: 12px; line-height: 1.4;">${escapeHtml(b.caption || b.beat)}</td>
            </tr>
          `;
        }).join('');
      }
    }
  } catch (err) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 20px; color: #ef4444;">Lỗi tải timing: ${escapeHtml(err.message)}</td></tr>`;
  }
}



// ---------------------------------------------------------------- markup cũ + API cho trang mới
const LEGACY_MODALS = "    <div class=\"lg-backdrop\" id=\"modal-matrix-create\" style=\"display:none;align-items:center;justify-content:center;z-index:10001;position:fixed;inset:0;background:rgba(0,0,0,.65);backdrop-filter:blur(4px)\">\n      <div class=\"modal-card\" style=\"width:min(860px,94vw);max-height:90vh;overflow:auto;padding:22px;background:var(--bg-card,#fff);border-radius:16px\">\n        <div style=\"display:flex;justify-content:space-between;align-items:center;gap:12px\"><div><h2 style=\"margin:0\">◈ Tạo Ma Trận Video</h2><p style=\"margin:5px 0;color:var(--text-muted);font-size:13px\">Một chủ đề, nhiều góc nhìn và Channel DNA. Kênh TikTok chỉ được chọn ở bước xếp lịch.</p></div><button class=\"modal-close\" onclick=\"closeModal('modal-matrix-create')\">&times;</button></div>\n        <label style=\"display:block;margin-top:16px;font-weight:700\">Đề tài gốc<input id=\"matrix-topic\" maxlength=\"500\" placeholder=\"Ví dụ: Hố sâu rãnh Mariana\" style=\"width:100%;margin-top:6px;padding:10px;border:1px solid var(--border-color,#cbd5e1);border-radius:14px;box-sizing:border-box\"></label>\n\n        <!-- Niche selector (full width now) -->\n        <label style=\"display:block;margin-top:12px;font-weight:700\">Niche<select id=\"matrix-niche\" style=\"width:100%;margin-top:6px;padding:10px\"><option>Đang tải catalog…</option></select></label>\n\n        <!-- Selection Rules Panel -->\n        <details id=\"matrix-rules-panel\" style=\"margin-top:12px;border:1px solid var(--border-color,#e2e8f0);border-radius:12px;padding:0;background:var(--bg-secondary,#f8fafc)\">\n          <summary style=\"cursor:pointer;padding:10px 14px;font-weight:700;font-size:13px;color:var(--text-muted,#64748b);user-select:none\">📋 Quy tắc chọn kênh</summary>\n          <div id=\"matrix-rules-content\" style=\"padding:0 14px 12px;font-size:12.5px;line-height:1.7;color:var(--text-muted,#475569)\">\n            <em>Chọn niche để xem quy tắc…</em>\n          </div>\n        </details>\n\n        <!-- Channel Picker -->\n        <div style=\"display:flex;align-items:center;justify-content:space-between;margin-top:14px;gap:8px;flex-wrap:wrap\">\n          <div style=\"font-weight:700;font-size:14px\">Chọn kênh <span id=\"matrix-channel-counter\" style=\"font-weight:400;color:var(--text-muted);font-size:12.5px\">(0/0)</span></div>\n          <div style=\"display:flex;gap:6px;align-items:center\">\n            <button class=\"btn btn-secondary\" style=\"padding:4px 10px;font-size:12px\" onclick=\"matrixSelectAll()\">Chọn tất cả</button>\n            <button class=\"btn btn-secondary\" style=\"padding:4px 10px;font-size:12px\" onclick=\"matrixSelectNone()\">Bỏ chọn</button>\n            <input id=\"matrix-count\" type=\"number\" min=\"1\" max=\"10\" value=\"10\" style=\"width:60px;padding:6px 8px;text-align:center;border:1px solid var(--border-color,#cbd5e1);border-radius:8px;font-size:13px\" title=\"Số kênh tối đa (1-10)\" onchange=\"matrixApplyCountLimit()\">\n          </div>\n        </div>\n        <div id=\"matrix-channel-grid\" style=\"display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:8px;margin-top:8px;max-height:340px;overflow-y:auto;padding:4px 2px\">\n          <div style=\"grid-column:1/-1;text-align:center;color:var(--text-muted);padding:24px;font-size:13px\">Chọn niche để xem danh sách kênh</div>\n        </div>\n\n        <label style=\"display:block;margin:14px 0\"><input id=\"matrix-render\" type=\"checkbox\"> Render MP4 ngay (phê duyệt render rõ ràng)</label>\n        <div style=\"display:flex;justify-content:flex-end;gap:8px\"><button class=\"btn btn-secondary\" onclick=\"closeModal('modal-matrix-create')\">Huỷ</button><button id=\"matrix-create-btn\" class=\"btn btn-primary\" onclick=\"createMatrixBatchFromUi()\">Tạo mẻ</button></div>\n        <div id=\"matrix-monitor\" style=\"display:none;margin-top:18px;border-top:1px solid var(--border-color);padding-top:14px\"></div>\n      </div>\n    </div>\n\n\n    <div class=\"lg-backdrop\" id=\"modal-new-video\" style=\"display: none; align-items: center; justify-content: center; z-index: 10000; position: fixed; inset: 0; background: rgba(0, 0, 0, 0.65); backdrop-filter: blur(4px);\">\n      <div class=\"modal-card\" style=\"max-width: 980px; width: 95%; max-height: 92vh; display: flex; flex-direction: column; overflow: hidden; border-radius: 18px; box-shadow: 0 25px 50px -12px rgba(64, 50, 38, 0.4); background: var(--color-ground, #e7e0bc); border: 1px solid var(--color-line, #d5cba0);\">\n        <!-- Header -->\n        <div class=\"modal-header\" style=\"padding: 14px 22px; border-bottom: 1px solid var(--color-line, #d5cba0); display: flex; align-items: center; justify-content: space-between; background: rgba(231, 224, 188, 0.9);\">\n          <div style=\"display: flex; align-items: center; gap: 10px;\">\n            <span id=\"newvid-header-icon\" style=\"display: grid; width: 36px; height: 36px; place-items: center; border-radius: 10px; background: var(--color-terra, #b4502f); color: var(--color-surface-2, #faf6e6); font-size: 18px;\">\n              ⚔️\n            </span>\n            <div>\n              <h2 id=\"newvid-header-title\" style=\"font-size: 16px; font-weight: 900; color: var(--color-ink, #403226); margin: 0; letter-spacing: -0.2px;\">\n                Tạo video mới — So sánh kiến thức đa quốc gia\n              </h2>\n              <p id=\"newvid-header-sub\" style=\"font-size: 11.5px; color: var(--color-ink-dim, #7a6049); margin: 2px 0 0 0;\">\n                Tự động thiết kế 12 nhịp, chuẩn hóa bản sắc thị trường &amp; linh vật theo quốc gia\n              </p>\n            </div>\n          </div>\n          <button type=\"button\" onclick=\"closeNewVideoModal()\" style=\"background: none; border: none; font-size: 20px; color: var(--color-ink-dim, #7a6049); cursor: pointer; padding: 4px 8px; border-radius: 6px;\" title=\"Đóng\">&times;</button>\n        </div>\n\n        <!-- Body -->\n        <div class=\"modal-body scroll-thin\" style=\"padding: 16px 22px; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; background: var(--color-ground, #e7e0bc);\">\n          \n          <!-- Category Selector Tabs -->\n          <div style=\"display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; background: var(--color-surface-2, #faf6e6); border: 1px solid var(--color-line, #d5cba0); border-radius: 14px; padding: 5px;\">\n            <button type=\"button\" class=\"newvid-cat-btn active\" data-cat=\"all\" onclick=\"selectNewVidCategory('all')\">\n              <span style=\"font-size: 14px;\">🌟</span>\n              <div style=\"text-align: left; line-height: 1.15;\">\n                <div style=\"display: flex; align-items: center; gap: 4px;\">\n                  <span>Tất cả (10)</span>\n                  <span style=\"background: rgba(210,162,76,0.2); color: #b48328; font-size: 9px; padding: 1px 4px; border-radius: 4px; font-weight: 900;\">3 MỚI</span>\n                </div>\n                <div style=\"font-size: 9.5px; color: var(--color-ink-dim); font-weight: normal;\">Tất cả thể loại</div>\n              </div>\n            </button>\n            <button type=\"button\" class=\"newvid-cat-btn\" data-cat=\"arena\" onclick=\"selectNewVidCategory('arena')\">\n              <span style=\"font-size: 14px;\">⚔️</span>\n              <div style=\"text-align: left; line-height: 1.15;\">\n                <div>Đấu Trường (3)</div>\n                <div style=\"font-size: 9.5px; color: var(--color-ink-dim); font-weight: normal;\">So sánh · Sinh tồn · Tier</div>\n              </div>\n            </button>\n            <button type=\"button\" class=\"newvid-cat-btn\" data-cat=\"journal\" onclick=\"selectNewVidCategory('journal')\">\n              <span style=\"font-size: 14px;\">📰</span>\n              <div style=\"text-align: left; line-height: 1.15;\">\n                <div>Phóng Sự (4)</div>\n                <div style=\"font-size: 9.5px; color: var(--color-ink-dim); font-weight: normal;\">Vox · Báo cũ · Phấn · Pet</div>\n              </div>\n            </button>\n            <button type=\"button\" class=\"newvid-cat-btn\" data-cat=\"tech\" onclick=\"selectNewVidCategory('tech')\">\n              <span style=\"font-size: 14px;\">⚡</span>\n              <div style=\"text-align: left; line-height: 1.15;\">\n                <div>Đồ Họa (3)</div>\n                <div style=\"font-size: 9.5px; color: var(--color-ink-dim); font-weight: normal;\">Kinetic · Vũ trụ · Kỳ án</div>\n              </div>\n            </button>\n          </div>\n\n          <!-- Template Cards Grid (3 columns) -->\n          <div id=\"newvid-templates-grid\" style=\"display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;\">\n            <!-- Rendered dynamically by renderNewVidTemplates() -->\n          </div>\n\n          <!-- Selected Format Highlight Banner -->\n          <div id=\"newvid-format-banner\" style=\"display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; background: rgba(180, 80, 47, 0.08); border: 1px solid rgba(180, 80, 47, 0.25); border-radius: 10px; padding: 8px 14px; font-size: 12px;\">\n            <div style=\"display: flex; align-items: center; gap: 8px;\">\n              <span id=\"newvid-banner-icon\" style=\"font-size: 15px;\">⚔️</span>\n              <span style=\"color: var(--color-ink);\">Format đang áp dụng: <strong id=\"newvid-banner-name\" style=\"color: var(--color-terra);\">So Sánh 2 Vật</strong></span>\n              <span style=\"color: var(--color-line-strong);\">·</span>\n              <span id=\"newvid-banner-desc\" style=\"color: var(--color-ink-soft);\">Đối đầu 2 vật thể/khái niệm, nhịp fast-cut 2s, 3 zone</span>\n            </div>\n            <span id=\"newvid-banner-dur\" style=\"font-variant-numeric: tabular-nums; font-size: 11px; font-weight: 800; color: var(--color-terra);\">Khung chuẩn: 30-40s</span>\n          </div>\n\n          <!-- Dynamic Studio Panel (Compare Studio Hub or Archetype Studio) -->\n          <div id=\"newvid-format-studio-panel\">\n            <!-- Compare Hub View -->\n            <div id=\"newvid-panel-compare\" style=\"display: flex; flex-direction: column; gap: 12px;\">\n              <!-- 3 Configuration Cards -->\n              <div style=\"display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;\">\n                <!-- Card 1: Country -->\n                <div style=\"background: var(--color-surface); border: 1px solid var(--color-line); border-radius: 12px; padding: 10px 12px; display: flex; flex-direction: column; gap: 6px;\">\n                  <div style=\"font-size: 10px; font-weight: 800; text-transform: uppercase; color: var(--color-ink-dim); letter-spacing: 0.5px; display: flex; align-items: center; gap: 6px;\">\n                    <span style=\"color: var(--color-terra);\">🌐</span> <span>Quốc gia &amp; Thị trường</span>\n                  </div>\n                  <select id=\"newvid-country-select\" onchange=\"onNewVidCountryChange(this.value)\" style=\"width: 100%; height: 36px; border-radius: 8px; border: 1px solid var(--color-line-strong); background: var(--color-surface-2); font-size: 12px; font-weight: 700; color: var(--color-ink); padding: 0 8px; outline: none; cursor: pointer;\">\n                    <option value=\"vi\">🇻🇳 Việt Nam (Tiếng Việt)</option>\n                    <option value=\"en\">🇺🇸 Hoa Kỳ / Toàn cầu (English)</option>\n                    <option value=\"de\">🇩🇪 Đức (Deutsch)</option>\n                    <option value=\"fr\">🇫🇷 Pháp (Français)</option>\n                    <option value=\"ja\">🇯🇵 Nhật Bản (日本語)</option>\n                    <option value=\"ko\">🇰🇷 Hàn Quốc (한국어)</option>\n                  </select>\n                </div>\n\n                <!-- Card 2: Voice -->\n                <div style=\"background: var(--color-surface); border: 1px solid var(--color-line); border-radius: 12px; padding: 10px 12px; display: flex; flex-direction: column; gap: 6px;\">\n                  <div style=\"display: flex; align-items: center; justify-content: space-between; font-size: 10px; font-weight: 800; text-transform: uppercase; color: var(--color-ink-dim); letter-spacing: 0.5px;\">\n                    <span style=\"display: flex; align-items: center; gap: 6px;\">\n                      <span style=\"color: var(--color-sage);\">🔊</span> <span>Giọng đọc AI (Edge / CapCut)</span>\n                    </span>\n                    <button type=\"button\" id=\"newvid-btn-voice-preview\" onclick=\"toggleVoicePreview()\" style=\"font-size: 10px; font-weight: 700; background: var(--color-surface-2); border: 1px solid var(--color-line); border-radius: 4px; padding: 2px 6px; color: var(--color-ink); cursor: pointer;\">\n                      🔊 Nghe thử\n                    </button>\n                  </div>\n                  <select id=\"newvid-voice-select\" onchange=\"onNewVidVoiceChange(this.value)\" style=\"width: 100%; height: 36px; border-radius: 8px; border: 1px solid var(--color-line-strong); background: var(--color-surface-2); font-size: 12px; font-weight: 700; color: var(--color-ink); padding: 0 8px; outline: none; cursor: pointer;\">\n                    <!-- Populated by JS -->\n                  </select>\n                </div>\n\n                <!-- Card 3: Mascot -->\n                <div style=\"background: var(--color-surface); border: 1px solid var(--color-line); border-radius: 12px; padding: 10px 12px; display: flex; flex-direction: column; justify-content: space-between;\">\n                  <div style=\"display: flex; align-items: center; justify-content: space-between; font-size: 10px; font-weight: 800; text-transform: uppercase; color: var(--color-ink-dim); letter-spacing: 0.5px;\">\n                    <span style=\"display: flex; align-items: center; gap: 6px;\">\n                      <span style=\"color: var(--color-gold);\">✨</span> <span>Linh vật &amp; Giao diện</span>\n                    </span>\n                    <span style=\"background: rgba(62, 140, 119, 0.2); color: var(--color-sage); font-size: 9px; padding: 1px 5px; border-radius: 4px; font-weight: 800;\">WCAG AA ✓</span>\n                  </div>\n                  <div style=\"display: flex; align-items: center; gap: 8px; margin-top: 4px;\">\n                    <span id=\"newvid-mascot-flag\" style=\"font-size: 24px;\">🇻🇳</span>\n                    <div style=\"min-width: 0;\">\n                      <div id=\"newvid-mascot-name\" style=\"font-size: 12px; font-weight: 900; color: var(--color-ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;\">Trâu Vàng Bến Tre 🐃</div>\n                      <div id=\"newvid-mascot-theme\" style=\"font-size: 10px; color: var(--color-ink-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;\">Red &amp; Terra Heritage</div>\n                    </div>\n                  </div>\n                </div>\n              </div>\n\n              <!-- Topic Selection Hub -->\n              <div style=\"background: var(--color-surface-2); border: 1px solid var(--color-line); border-radius: 12px; padding: 12px; display: flex; flex-direction: column; gap: 10px;\">\n                <div style=\"display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--color-line); padding-bottom: 8px;\">\n                  <div style=\"display: flex; gap: 6px;\">\n                    <button type=\"button\" id=\"btn-newvid-tab-curated\" onclick=\"setNewVidCompareTab('curated')\" style=\"padding: 5px 12px; font-size: 11.5px; font-weight: 800; border-radius: 6px; background: var(--color-terra); color: #ffffff; border: none; cursor: pointer;\">\n                      🎲 Chủ đề tuyển chọn (<span id=\"val-newvid-curated-count\">28</span>)\n                    </button>\n                    <button type=\"button\" id=\"btn-newvid-tab-ai\" onclick=\"setNewVidCompareTab('ai')\" style=\"padding: 5px 12px; font-size: 11.5px; font-weight: 800; border-radius: 6px; background: transparent; color: var(--color-ink-soft); border: 1px solid var(--color-line); cursor: pointer;\">\n                      ✨ AI Tự nghiên cứu (Gemini)\n                    </button>\n                  </div>\n                  <button type=\"button\" onclick=\"randomizeCompareTopic()\" style=\"padding: 4px 10px; font-size: 11px; font-weight: 700; background: var(--color-surface); border: 1px solid var(--color-line); border-radius: 6px; color: var(--color-ink); cursor: pointer;\">\n                    🎲 Đổi ngẫu nhiên\n                  </button>\n                </div>\n\n                <!-- Curated View -->\n                <div id=\"newvid-view-curated\" style=\"display: flex; flex-direction: column; gap: 8px;\">\n                  <!-- Category filter chips -->\n                  <div style=\"display: flex; gap: 5px; overflow-x: auto; padding-bottom: 2px;\" class=\"scroll-thin\">\n                    <button type=\"button\" class=\"filter-chip active\" data-cat=\"\" onclick=\"filterCompareCat('')\">🌐 Tất cả</button>\n                    <button type=\"button\" class=\"filter-chip\" data-cat=\"culture_uk\" onclick=\"filterCompareCat('culture_uk')\">🇬🇧 UK</button>\n                    <button type=\"button\" class=\"filter-chip\" data-cat=\"culture_de\" onclick=\"filterCompareCat('culture_de')\">🇩🇪 Đức</button>\n                    <button type=\"button\" class=\"filter-chip\" data-cat=\"culture_jp\" onclick=\"filterCompareCat('culture_jp')\">🇯🇵 Nhật</button>\n                    <button type=\"button\" class=\"filter-chip\" data-cat=\"culture_kr\" onclick=\"filterCompareCat('culture_kr')\">🇰🇷 Hàn</button>\n                    <button type=\"button\" class=\"filter-chip\" data-cat=\"everyday\" onclick=\"filterCompareCat('everyday')\">🍜 Đời sống</button>\n                    <button type=\"button\" class=\"filter-chip\" data-cat=\"nature\" onclick=\"filterCompareCat('nature')\">🌿 Tự nhiên</button>\n                    <button type=\"button\" class=\"filter-chip\" data-cat=\"science\" onclick=\"filterCompareCat('science')\">🔬 Khoa học</button>\n                  </div>\n\n                  <!-- Search bar -->\n                  <div style=\"position: relative;\">\n                    <input type=\"text\" id=\"newvid-compare-search\" placeholder=\"Lọc chủ đề nhanh (vd: bia, trà, tàu điện, văn hoá...)...\" oninput=\"onNewVidCompareSearch(this.value)\" style=\"width: 100%; height: 32px; border-radius: 6px; border: 1px solid var(--color-line); background: var(--color-surface); padding: 0 10px 0 28px; font-size: 11.5px; color: var(--color-ink); outline: none;\">\n                    <span style=\"position: absolute; left: 9px; top: 7px; font-size: 11px; opacity: 0.5;\">🔍</span>\n                  </div>\n\n                  <!-- Curated Topics Cards Grid -->\n                  <div id=\"newvid-curated-grid\" style=\"display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; max-height: 150px; overflow-y: auto; padding: 2px;\" class=\"scroll-thin\">\n                    <!-- Populated by renderCuratedCompareCards() -->\n                  </div>\n                </div>\n\n                <!-- AI View -->\n                <div id=\"newvid-view-ai\" style=\"display: none; flex-direction: column; gap: 8px; background: rgba(210,162,76,0.08); border: 1px solid rgba(210,162,76,0.25); border-radius: 10px; padding: 10px;\">\n                  <div style=\"font-size: 11.5px; font-weight: 800; color: var(--color-gold);\">\n                    ✨ Nhập Đề Tài So Sánh Để Gemini Tự Động Thu Thập Tư Liệu\n                  </div>\n                  <div style=\"display: flex; gap: 8px;\">\n                    <input type=\"text\" id=\"newvid-ai-prompt\" placeholder=\"Ví dụ: Giá cả sinh hoạt Tokyo vs Seoul, hoặc Bữa sáng Việt Nam vs Bữa sáng Pháp...\" style=\"flex: 1; height: 34px; border-radius: 6px; border: 1px solid var(--color-line-strong); background: var(--color-surface); padding: 0 10px; font-size: 11.5px; color: var(--color-ink); outline: none;\">\n                    <button type=\"button\" onclick=\"triggerGeminiResearch()\" style=\"padding: 0 12px; height: 34px; background: var(--color-gold); color: #ffffff; border: none; border-radius: 6px; font-size: 11.5px; font-weight: 800; cursor: pointer; white-space: nowrap;\">\n                      ✨ AI Nghiên cứu\n                    </button>\n                  </div>\n                </div>\n              </div>\n\n              <!-- Soundboard preview chips -->\n              <div style=\"background: var(--color-surface); border: 1px solid var(--color-line); border-radius: 10px; padding: 8px 12px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;\">\n                <div style=\"font-size: 10px; font-weight: 800; text-transform: uppercase; color: var(--color-ink-dim);\">\n                  🔊 Thử nghiệm âm thanh (Soundscape):\n                </div>\n                <div id=\"newvid-soundboard-grid\" style=\"display: flex; gap: 6px; flex-wrap: wrap;\">\n                  <!-- Populated by renderNewVidSoundboard() -->\n                </div>\n              </div>\n            </div>\n\n            <!-- Other Archetype Panel View (for survival, tierlist, vox, newspaper, etc.) -->\n            <div id=\"newvid-panel-archetype\" style=\"display: none; flex-direction: column; gap: 10px; background: var(--color-surface-2); border: 1px solid var(--color-line); border-radius: 12px; padding: 14px;\">\n              <!-- 2 Configuration Cards: Country & Voice (tham chiếu style So Sánh) -->\n              <div id=\"newvid-archetype-meta-cards\" style=\"display: grid; grid-template-columns: 1fr 1fr; gap: 10px;\">\n                <!-- Card 1: Country -->\n                <div style=\"background: var(--color-surface); border: 1px solid var(--color-line); border-radius: 12px; padding: 10px 12px; display: flex; flex-direction: column; gap: 6px;\">\n                  <div style=\"font-size: 10px; font-weight: 800; text-transform: uppercase; color: var(--color-ink-dim); letter-spacing: 0.5px; display: flex; align-items: center; gap: 6px;\">\n                    <span style=\"color: var(--color-terra);\">🌐</span> <span>Quốc gia &amp; Thị trường</span>\n                  </div>\n                  <select id=\"newvid-archetype-country-select\" onchange=\"onNewVidCountryChange(this.value)\" style=\"width: 100%; height: 36px; border-radius: 8px; border: 1px solid var(--color-line-strong); background: var(--color-surface-2); font-size: 12px; font-weight: 700; color: var(--color-ink); padding: 0 8px; outline: none; cursor: pointer;\">\n                    <option value=\"vi\">🇻🇳 Việt Nam (Tiếng Việt)</option>\n                    <option value=\"en\">🇺🇸 Hoa Kỳ / Toàn cầu (English)</option>\n                    <option value=\"de\">🇩🇪 Đức (Deutsch)</option>\n                    <option value=\"fr\">🇫🇷 Pháp (Français)</option>\n                    <option value=\"ja\">🇯🇵 Nhật Bản (日本語)</option>\n                    <option value=\"ko\">🇰🇷 Hàn Quốc (한국어)</option>\n                  </select>\n                </div>\n\n                <!-- Card 2: Voice -->\n                <div style=\"background: var(--color-surface); border: 1px solid var(--color-line); border-radius: 12px; padding: 10px 12px; display: flex; flex-direction: column; gap: 6px;\">\n                  <div style=\"display: flex; align-items: center; justify-content: space-between; font-size: 10px; font-weight: 800; text-transform: uppercase; color: var(--color-ink-dim); letter-spacing: 0.5px;\">\n                    <span style=\"display: flex; align-items: center; gap: 6px;\">\n                      <span style=\"color: var(--color-sage);\">🔊</span> <span>Giọng đọc AI (Edge / CapCut)</span>\n                    </span>\n                    <button type=\"button\" id=\"newvid-btn-archetype-voice-preview\" class=\"newvid-btn-voice-preview\" onclick=\"toggleVoicePreview()\" style=\"font-size: 10px; font-weight: 700; background: var(--color-surface-2); border: 1px solid var(--color-line); border-radius: 4px; padding: 2px 6px; color: var(--color-ink); cursor: pointer;\">\n                      🔊 Nghe thử\n                    </button>\n                  </div>\n                  <select id=\"newvid-archetype-voice-select\" onchange=\"onNewVidVoiceChange(this.value)\" style=\"width: 100%; height: 36px; border-radius: 8px; border: 1px solid var(--color-line-strong); background: var(--color-surface-2); font-size: 12px; font-weight: 700; color: var(--color-ink); padding: 0 8px; outline: none; cursor: pointer;\">\n                    <!-- Populated by JS -->\n                  </select>\n                </div>\n              </div>\n\n              <div style=\"display: flex; align-items: center; justify-content: space-between;\">\n                <label id=\"newvid-archetype-label\" style=\"font-size: 11.5px; font-weight: 800; text-transform: uppercase; color: var(--color-ink-dim);\">\n                  CHỦ ĐỀ KỊCH BẢN:\n                </label>\n                <button type=\"button\" onclick=\"randomizeCustomPrompt()\" style=\"font-size: 11px; font-weight: 700; background: var(--color-surface); border: 1px solid var(--color-line); border-radius: 6px; padding: 3px 8px; color: var(--color-ink); cursor: pointer;\">\n                  🎲 Đổi gợi ý\n                </button>\n              </div>\n              <div style=\"display: flex; gap: 8px;\">\n                <input type=\"text\" id=\"newvid-custom-prompt\" placeholder=\"Nhập chủ đề hoặc bấm chọn một trong các gợi ý bên dưới...\" oninput=\"updateNewVidFooterMeta()\" style=\"flex: 1; height: 38px; border-radius: 8px; border: 1px solid var(--color-line-strong); background: var(--color-surface); padding: 0 12px; font-size: 12.5px; font-weight: 700; color: var(--color-ink); outline: none;\">\n              </div>\n              <div>\n                <div style=\"font-size: 10px; font-weight: 800; text-transform: uppercase; color: var(--color-ink-dim); margin-bottom: 6px;\">\n                  GỢI Ý THỊNH HÀNH ĐƯỢC TỐI ƯU TƯƠNG TÁC:\n                </div>\n                <div id=\"newvid-archetype-suggestions\" style=\"display: flex; flex-direction: column; gap: 6px;\">\n                  <!-- Populated dynamically -->\n                </div>\n              </div>\n              <!-- Tuỳ chọn riêng cho Tâm Linh Dân Gian -->\n              <div id=\"newvid-folklore-options\" style=\"display: none; gap: 10px; flex-wrap: wrap;\">\n                <label style=\"display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 160px; font-size: 10px; font-weight: 800; text-transform: uppercase; color: var(--color-ink-dim);\">\n                  Thời lượng\n                  <select id=\"newvid-folklore-duration\" style=\"height: 34px; border-radius: 8px; border: 1px solid var(--color-line); background: var(--color-surface); font-size: 12px; font-weight: 700; text-transform: none; color: var(--color-ink);\">\n                    <option value=\"70\">~70 giây (chuẩn kiếm tiền, ~16 câu)</option>\n                    <option value=\"150\">~2,5 phút (như video mẫu, ~36 câu)</option>\n                  </select>\n                </label>\n                <div style=\"flex: 1; min-width: 160px; font-size: 11px; color: var(--color-ink-dim); line-height: 1.4; align-self: center;\">\n                  🎨 Ảnh: <b>Antigravity</b> (chờ vài phút mỗi ảnh)\n                </div>\n                <label style=\"display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 160px; font-size: 10px; font-weight: 800; text-transform: uppercase; color: var(--color-ink-dim);\">\n                  Phong cách giọng\n                  <select id=\"newvid-folklore-voice-style\" style=\"height: 34px; border-radius: 8px; border: 1px solid var(--color-line); background: var(--color-surface); font-size: 12px; font-weight: 700; text-transform: none; color: var(--color-ink);\">\n                    <option value=\"eerie\">Ma mị (trầm, vang, thì thầm)</option>\n                    <option value=\"normal\">Kể thường (như mẫu)</option>\n                  </select>\n                </label>\n                <label style=\"display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 160px; font-size: 10px; font-weight: 800; text-transform: uppercase; color: var(--color-ink-dim);\">\n                  Hiệu ứng\n                  <select id=\"newvid-folklore-vfx\" style=\"height: 34px; border-radius: 8px; border: 1px solid var(--color-line); background: var(--color-surface); font-size: 12px; font-weight: 700; text-transform: none; color: var(--color-ink);\">\n                    <option value=\"horror\">Kinh dị (sương mù, chớp tắt, glitch, tim đập)</option>\n                    <option value=\"calm\">Nhẹ nhàng (như mẫu)</option>\n                  </select>\n                </label>\n                <div style=\"flex-basis: 100%; font-size: 10.5px; color: var(--color-ink-dim); line-height: 1.4;\">\n                  Kịch bản do AI viết theo văn hoá của ngôn ngữ đã chọn. Ảnh Antigravity chưa về kịp (quá 45 phút) thì video chờ, <b>chưa render và chưa đăng</b>; bấm <b>🎨 Ảnh Antigravity</b> trong Studio để lấy tiếp.\n                </div>\n              </div>\n            </div>\n          </div>\n\n        </div>\n\n        <!-- Tự đăng sau render (mọi thể loại). Chỉ tạo task đăng khi đã chọn kênh. -->\n        <div id=\"newvid-autopublish\" style=\"padding: 10px 22px; border-top: 1px solid var(--color-line, #d5cba0); display: flex; flex-wrap: wrap; align-items: center; gap: 10px; font-size: 12px;\">\n          <label style=\"display: flex; align-items: center; gap: 6px; font-weight: 800; cursor: pointer;\">\n            <input type=\"checkbox\" id=\"newvid-autopublish-on\" onchange=\"onNewVidAutoPublishToggle()\" style=\"accent-color: var(--color-terra); width: 15px; height: 15px;\">\n            📤 Tự đăng sau khi render xong\n          </label>\n          <select id=\"newvid-autopublish-channel\" disabled style=\"height: 32px; border-radius: 8px; border: 1px solid var(--color-line); min-width: 220px; font-size: 12px;\">\n            <option value=\"\">-- Chọn kênh TikTok --</option>\n          </select>\n          <select id=\"newvid-autopublish-when\" disabled onchange=\"onNewVidAutoPublishToggle()\" style=\"height: 32px; border-radius: 8px; border: 1px solid var(--color-line); font-size: 12px;\">\n            <option value=\"now\">Đăng ngay khi xong</option>\n            <option value=\"schedule\">Hẹn giờ</option>\n          </select>\n          <input type=\"datetime-local\" id=\"newvid-autopublish-datetime\" disabled style=\"display: none; height: 32px; border-radius: 8px; border: 1px solid var(--color-line); font-size: 12px;\">\n          <span style=\"font-size: 11px; color: var(--color-ink-dim);\">Cần tích \"render MP4\". Caption tự tạo theo thể loại; có khai báo nội dung AI.</span>\n        </div>\n\n        <!-- Footer -->\n        <div class=\"modal-footer\" style=\"padding: 12px 22px; border-top: 1px solid var(--color-line, #d5cba0); display: flex; align-items: center; justify-content: space-between; background: rgba(231, 224, 188, 0.95); flex-wrap: wrap; gap: 10px;\">\n          <!-- Left meta preview -->\n          <div id=\"newvid-footer-meta\" style=\"font-variant-numeric: tabular-nums; font-size: 11px; color: var(--color-ink-soft); display: flex; align-items: center; gap: 8px;\">\n            <span style=\"font-weight: 800; color: var(--color-ink);\">videos/tokyo-vs-london-vi/</span>\n            <span>•</span>\n            <span>🇻🇳 Tiếng Việt</span>\n            <span>•</span>\n            <span style=\"color: var(--color-terra); font-weight: 800;\">⚔️ So Sánh 2 Vật (36s)</span>\n          </div>\n\n          <!-- Right controls -->\n          <div style=\"display: flex; align-items: center; gap: 12px;\">\n            <div style=\"display: flex; align-items: center; gap: 6px; user-select: none;\">\n              <input type=\"checkbox\" id=\"newvid-also-render\" checked style=\"accent-color: var(--color-terra); width: 16px; height: 16px; cursor: pointer;\">\n              <label for=\"newvid-also-render\" style=\"font-size: 11.5px; font-weight: 700; color: var(--color-ink); cursor: pointer; margin: 0;\">\n                Tự động render video MP4 sau khi tạo kịch bản\n              </label>\n            </div>\n            <button type=\"button\" onclick=\"closeNewVideoModal()\" style=\"padding: 8px 18px; font-size: 12.5px; font-weight: 700; border-radius: 8px; background: transparent; border: 1px solid var(--color-line); color: var(--color-ink-soft); cursor: pointer; transition: all 0.15s;\">\n              Hủy\n            </button>\n            <button type=\"button\" id=\"btn-newvid-create\" onclick=\"submitNewVideoModal()\" style=\"padding: 8px 22px; font-size: 12.5px; font-weight: 900; border-radius: 8px; background: var(--color-terra, #b4502f); color: #ffffff; border: none; cursor: pointer; box-shadow: 0 4px 12px rgba(180, 80, 47, 0.3); display: flex; align-items: center; gap: 6px; transition: all 0.15s;\">\n              <span>Tạo video ngay</span>\n            </button>\n          </div>\n        </div>\n      </div>\n    </div>\n\n    <!-- ========================================================================= -->\n    <!-- COMPARE STUDIO MODAL 2: BỐ CỤC CHUẨN (TEMPLATE REVIEW) -->\n    <!-- ========================================================================= -->\n    <div class=\"lg-backdrop\" id=\"modal-template-review\" style=\"display: none; align-items: center; justify-content: center;\">\n      <div class=\"modal-card\" style=\"max-width: 900px; width: 92%; max-height: 90vh; display: flex; flex-direction: column;\">\n        <div class=\"modal-header\">\n          <div class=\"modal-title-group\">\n            <h3 style=\"display: flex; align-items: center; gap: 8px; font-size: 16px;\">\n              <span>📐</span> Bố Cục Chuẩn 3-Zone (Template Layout Review)\n            </h3>\n            <p style=\"font-size: 12px; color: var(--text-muted); margin: 2px 0 0 0;\">Tiêu chuẩn thiết kế video dọc 9:16 tối ưu thời gian giữ chân người xem (Retention > 75%)</p>\n          </div>\n          <button class=\"modal-close\" onclick=\"closeTemplateReviewModal()\">&times;</button>\n        </div>\n        <div class=\"modal-body\" style=\"padding: 20px 24px; overflow-y: auto;\">\n          <div style=\"display: grid; grid-template-columns: 280px 1fr; gap: 24px; align-items: start;\">\n            <!-- Phone 3-Zone Mockup -->\n            <div style=\"aspect-ratio: 9/16; background: #0b0f19; border-radius: 24px; border: 4px solid #1e293b; padding: 14px; display: flex; flex-direction: column; box-shadow: 0 16px 40px rgba(0,0,0,0.4); justify-content: space-between;\">\n              <!-- Zone 1 -->\n              <div style=\"background: rgba(234, 88, 12, 0.18); border: 2px dashed #ea580c; border-radius: 12px; padding: 12px 8px; text-align: center; height: 22%; display: flex; flex-direction: column; justify-content: center;\">\n                <span style=\"font-size: 11px; font-weight: 800; color: #f97316;\">ZONE 1: HOOK &amp; TITLE (20%)</span>\n                <small style=\"font-size: 10px; color: #fed7aa; margin-top: 2px;\">Tiêu đề giật gân, câu hỏi so sánh, radar điểm số</small>\n              </div>\n              <!-- Zone 2 -->\n              <div style=\"background: rgba(56, 189, 248, 0.15); border: 2px dashed #38bdf8; border-radius: 12px; padding: 12px 8px; text-align: center; height: 48%; margin: 8px 0; display: flex; flex-direction: column; justify-content: center;\">\n                <span style=\"font-size: 12px; font-weight: 800; color: #38bdf8;\">ZONE 2: DUAL MEDIA SPLIT (50%)</span>\n                <small style=\"font-size: 10px; color: #bae6fd; margin-top: 4px;\">2 luồng video chuyển động song song hoặc so sánh trực diện (Fast-cut 1.2-2.5s)</small>\n              </div>\n              <!-- Zone 3 -->\n              <div style=\"background: rgba(168, 85, 247, 0.18); border: 2px dashed #a855f7; border-radius: 12px; padding: 12px 8px; text-align: center; height: 24%; display: flex; flex-direction: column; justify-content: center;\">\n                <span style=\"font-size: 11px; font-weight: 800; color: #c084fc;\">ZONE 3: SUBTITLE &amp; HUD (30%)</span>\n                <small style=\"font-size: 10px; color: #e9d5ff; margin-top: 2px;\">Phụ đề động nổi từng từ theo giọng AI, CTA kênh</small>\n              </div>\n            </div>\n\n            <!-- Explanations -->\n            <div style=\"display: flex; flex-direction: column; gap: 14px;\">\n              <div style=\"background: rgba(234, 88, 12, 0.05); border: 1px solid rgba(234, 88, 12, 0.2); border-radius: 10px; padding: 14px;\">\n                <div style=\"display: flex; align-items: center; gap: 6px; margin-bottom: 4px;\">\n                  <span style=\"font-size: 15px;\">🎯</span>\n                  <strong style=\"font-size: 13.5px; color: #ea580c;\">Zone 1 (Header 20%): Hook Giữ Chân 3 Giây Đầu</strong>\n                </div>\n                <p style=\"font-size: 12px; color: var(--text-muted); line-height: 1.45; margin: 0;\">\n                  Hiển thị câu hỏi khơi gợi tò mò hoặc tranh luận trong 3 giây đầu tiên. Kèm badge quốc gia và nhãn phân hạng để người xem lập tức hiểu bối cảnh mà không cần lướt qua.\n                </p>\n              </div>\n\n              <div style=\"background: rgba(56, 189, 248, 0.05); border: 1px solid rgba(56, 189, 248, 0.2); border-radius: 10px; padding: 14px;\">\n                <div style=\"display: flex; align-items: center; gap: 6px; margin-bottom: 4px;\">\n                  <span style=\"font-size: 15px;\">⚡</span>\n                  <strong style=\"font-size: 13.5px; color: #0284c7;\">Zone 2 (Middle 50%): Visual Fast-Cut Dual Video</strong>\n                </div>\n                <p style=\"font-size: 12px; color: var(--text-muted); line-height: 1.45; margin: 0;\">\n                  Chia đôi màn hình hoặc luân phiên chuyển cảnh nhịp độ cao (1.2s - 2.8s) khớp chuẩn từng beat nhạc nền sinh động và hiệu ứng âm thanh whoosh/impact kích thích thị giác.\n                </p>\n              </div>\n\n              <div style=\"background: rgba(168, 85, 247, 0.05); border: 1px solid rgba(168, 85, 247, 0.2); border-radius: 10px; padding: 14px;\">\n                <div style=\"display: flex; align-items: center; gap: 6px; margin-bottom: 4px;\">\n                  <span style=\"font-size: 15px;\">🎙️</span>\n                  <strong style=\"font-size: 13.5px; color: #9333ea;\">Zone 3 (Bottom 30%): Subtitle Động &amp; HUD Điểm Số</strong>\n                </div>\n                <p style=\"font-size: 12px; color: var(--text-muted); line-height: 1.45; margin: 0;\">\n                  Font chữ đậm viền đen bóng đổ rõ nét, chữ đổi màu vàng sáng theo từng âm tiết phát ra từ giọng đọc AI (Edge Neural TTS hoặc Vbee) giúp người xem không cần bật loa vẫn theo dõi được.\n                </p>\n              </div>\n            </div>\n          </div>\n        </div>\n        <div class=\"modal-footer\" style=\"padding: 12px 24px;\">\n          <button type=\"button\" class=\"btn btn-secondary\" onclick=\"closeTemplateReviewModal()\">Đã Hiểu</button>\n        </div>\n      </div>\n    </div>\n";
const LEGACY_TEMPLATE = "          <div id=\"ws-template-review-container\" style=\"display: flex; flex-direction: column; gap: 16px;\">\n            <!-- Template Review Header -->\n            <div class=\"ws-header-card\">\n              <div style=\"display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;\">\n                <div style=\"display: flex; align-items: center; gap: 10px;\">\n                  <span class=\"template-review-header-icon\" aria-hidden=\"true\">\n                    <svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n                      <path d=\"M4 20 20 4M7 17l-2-2M11 13l-2-2M15 9l-2-2\"/>\n                      <path d=\"M14 4h6v6M4 14v6h6\"/>\n                    </svg>\n                  </span>\n                  <div>\n                    <h2 style=\"font-size: 17px; font-weight: 900; color: var(--text-color); margin: 0;\">Bố Cục Chuẩn &amp; Đánh Giá Mẫu (Template Review)</h2>\n                    <p style=\"font-size: 11.5px; color: var(--text-muted); margin: 2px 0 0 0;\">Khung giải phẫu 12 nhịp, 3 phân vùng chuẩn 9:16 và tiêu chuẩn WCAG AA đa thị trường</p>\n                  </div>\n                </div>\n                <div style=\"display: flex; align-items: center; gap: 8px;\">\n                  <span style=\"font-size: 11px; font-weight: 700; color: var(--text-dim); text-transform: uppercase;\">Thị Trường:</span>\n                  <select id=\"ws-tpl-country-select\" class=\"form-control\" style=\"font-size: 12px; height: 32px; width: auto;\" onchange=\"setWsTemplateReviewLang(this.value)\">\n                    <option value=\"vi\">🇻🇳 Việt Nam (Tiếng Việt)</option>\n                    <option value=\"en\">🇺🇸 Hoa Kỳ / Toàn cầu (English)</option>\n                    <option value=\"de\">🇩🇪 Đức (Deutsch)</option>\n                    <option value=\"fr\">🇫🇷 Pháp (Français)</option>\n                    <option value=\"ja\">🇯🇵 Nhật Bản (日本語)</option>\n                    <option value=\"ko\">🇰🇷 Hàn Quốc (한국어)</option>\n                  </select>\n                </div>\n              </div>\n\n              <!-- 10 Template Selector Tabs -->\n              <div style=\"display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; border-top: 1px solid var(--border-color); padding-top: 12px;\">\n                <button type=\"button\" class=\"filter-chip active\" data-tpl=\"compare\" onclick=\"setWsTemplateReviewType('compare')\">⚔️ So Sánh 2 Vật</button>\n                <button type=\"button\" class=\"filter-chip\" data-tpl=\"survival\" onclick=\"setWsTemplateReviewType('survival')\">💀 Sinh Tồn</button>\n                <button type=\"button\" class=\"filter-chip\" data-tpl=\"tierlist\" onclick=\"setWsTemplateReviewType('tierlist')\">🏆 Tier List</button>\n                <button type=\"button\" class=\"filter-chip\" data-tpl=\"vox\" onclick=\"setWsTemplateReviewType('vox')\">✂️ Vox Collage</button>\n                <button type=\"button\" class=\"filter-chip\" data-tpl=\"newspaper\" onclick=\"setWsTemplateReviewType('newspaper')\">📜 Báo Cũ</button>\n                <button type=\"button\" class=\"filter-chip\" data-tpl=\"chalk\" onclick=\"setWsTemplateReviewType('chalk')\">🗺️ Bảng Phấn</button>\n                <button type=\"button\" class=\"filter-chip\" data-tpl=\"wildlife\" onclick=\"setWsTemplateReviewType('wildlife')\">🐾 Động Vật AI</button>\n                <button type=\"button\" class=\"filter-chip\" data-tpl=\"folklore\" onclick=\"setWsTemplateReviewType('folklore')\">🕯️ Tâm Linh Dân Gian</button>\n                <button type=\"button\" class=\"filter-chip\" data-tpl=\"kinetic\" onclick=\"setWsTemplateReviewType('kinetic')\">⚡ Kinetic</button>\n                <button type=\"button\" class=\"filter-chip\" data-tpl=\"science\" onclick=\"setWsTemplateReviewType('science')\">🪐 Khoa Học</button>\n                <button type=\"button\" class=\"filter-chip\" data-tpl=\"mystery\" onclick=\"setWsTemplateReviewType('mystery')\">🔍 Kỳ Án</button>\n              </div>\n            </div>\n\n            <!-- Dual-Column Stage for Template Review -->\n            <div style=\"display: grid; grid-template-columns: 320px 1fr; gap: 20px; align-items: start;\">\n              <!-- Left Column: 3-Zone Architecture Phone Mockup -->\n              <div class=\"card\" style=\"padding: 16px; display: flex; flex-direction: column; align-items: center; gap: 12px;\">\n                <div style=\"display: flex; align-items: center; justify-content: space-between; width: 100%;\">\n                  <span style=\"font-size: 12px; font-weight: 800; color: var(--text-color);\">Kiến Trúc 3-Zone 9:16</span>\n                  <span id=\"ws-tpl-ratio-tag\" class=\"badge-tag\" style=\"font-size: 10px;\">1080x1920</span>\n                </div>\n\n                <div class=\"phone-frame\" style=\"width: 250px; aspect-ratio: 9/16; position: relative; background: #0b0f19; border: 6px solid #1e293b; border-radius: 28px; padding: 12px 10px; display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 16px 36px rgba(0,0,0,0.35);\">\n                  <div class=\"phone-island\"></div>\n                  <!-- Zone 1 -->\n                  <div style=\"background: rgba(234, 88, 12, 0.18); border: 1.5px dashed #ea580c; border-radius: 10px; padding: 10px 6px; text-align: center; height: 22%; display: flex; flex-direction: column; justify-content: center;\">\n                    <span style=\"font-size: 10px; font-weight: 900; color: #f97316;\">ZONE 1: HEADER &amp; MASCOT (20%)</span>\n                    <small style=\"font-size: 8.5px; color: #fed7aa; margin-top: 2px;\">Tiêu đề, cờ quốc gia, linh vật</small>\n                  </div>\n                  <!-- Zone 2 -->\n                  <div style=\"background: rgba(56, 189, 248, 0.15); border: 1.5px dashed #38bdf8; border-radius: 10px; padding: 10px 6px; text-align: center; height: 48%; margin: 6px 0; display: flex; flex-direction: column; justify-content: center;\">\n                    <span style=\"font-size: 11px; font-weight: 900; color: #38bdf8;\">ZONE 2: CORE STAGE (50%)</span>\n                    <small style=\"font-size: 8.5px; color: #bae6fd; margin-top: 2px;\">Visual Fast-cut 1.5-2.5s</small>\n                  </div>\n                  <!-- Zone 3 -->\n                  <div style=\"background: rgba(168, 85, 247, 0.18); border: 1.5px dashed #a855f7; border-radius: 10px; padding: 10px 6px; text-align: center; height: 24%; display: flex; flex-direction: column; justify-content: center;\">\n                    <span style=\"font-size: 10px; font-weight: 900; color: #c084fc;\">ZONE 3: SUBTITLE &amp; HUD (30%)</span>\n                    <small style=\"font-size: 8.5px; color: #e9d5ff; margin-top: 2px;\">Phụ đề động karaoke, CTA</small>\n                  </div>\n                </div>\n\n                <div style=\"width: 100%; display: flex; align-items: center; justify-content: space-between; font-size: 11px; font-variant-numeric: tabular-nums; color: var(--text-dim);\">\n                  <span>Tiêu chuẩn: WCAG AA</span>\n                  <span>Nhịp: 2.0s</span>\n                </div>\n              </div>\n\n              <!-- Right Column: 12-Beat Timing Table & Rules -->\n              <div style=\"display: flex; flex-direction: column; gap: 16px;\">\n                <!-- Timing Table Card -->\n                <div class=\"card\" style=\"padding: 16px 20px;\">\n                  <div style=\"display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;\">\n                    <strong style=\"font-size: 13.5px; color: var(--text-color);\">Phân Rã 12 Nhịp Chuẩn (Timing Breakdown)</strong>\n                    <span id=\"ws-tpl-total-dur-badge\" class=\"badge-tag\" style=\"color: #ea580c; font-weight: 800;\">Tổng: 40s</span>\n                  </div>\n                  <div class=\"table-responsive\" style=\"max-height: 280px; overflow-y: auto;\">\n                    <table class=\"data-table\" style=\"font-size: 12px;\">\n                      <thead>\n                        <tr>\n                          <th style=\"width: 38px;\">#</th>\n                          <th style=\"width: 100px;\">Thời Gian</th>\n                          <th style=\"width: 120px;\">Vai Trò Nhịp</th>\n                          <th>Nội Dung Minh Họa</th>\n                        </tr>\n                      </thead>\n                      <tbody id=\"ws-tpl-timing-tbody\">\n                        <!-- Populated by renderWsTemplateTiming() -->\n                      </tbody>\n                    </table>\n                  </div>\n                </div>\n\n                <!-- Template Anatomy Guidelines -->\n                <div class=\"card\" style=\"padding: 16px 20px;\">\n                  <strong style=\"font-size: 13px; color: var(--text-color); margin-bottom: 8px; display: block;\">Quy Tắc Biên Dịch &amp; Thiết Kế Video Chuẩn:</strong>\n                  <div style=\"display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; font-size: 11.5px;\">\n                    <div style=\"background: var(--bg-input); padding: 8px 10px; border-radius: 6px; border: 1px solid var(--border-color);\">\n                      <div style=\"font-weight: 700; color: #10b981;\">✓ Độ Tương Phản WCAG AA</div>\n                      <div style=\"color: var(--text-muted); margin-top: 2px;\">Tỉ lệ tương phản chữ/nền luôn &gt;= 4.5:1, đảm bảo rõ ràng trên mọi màn hình điện thoại.</div>\n                    </div>\n                    <div style=\"background: var(--bg-input); padding: 8px 10px; border-radius: 6px; border: 1px solid var(--border-color);\">\n                      <div style=\"font-weight: 700; color: #f59e0b;\">✓ Vùng An Toàn TikTok Safe Zone</div>\n                      <div style=\"color: var(--text-muted); margin-top: 2px;\">Chừa lề trên 120px (tránh thanh tìm kiếm) và lề dưới 160px (tránh tên kênh, âm thanh).</div>\n                    </div>\n                    <div style=\"background: var(--bg-input); padding: 8px 10px; border-radius: 6px; border: 1px solid var(--border-color);\">\n                      <div style=\"font-weight: 700; color: #ea580c;\">✓ Nhịp Độ Fast-Cut Giữ Chân</div>\n                      <div style=\"color: var(--text-muted); margin-top: 2px;\">Mỗi phân cảnh không quá 3.5s, kết hợp âm thanh SFX tạo xung động giữ chân người xem.</div>\n                    </div>\n                  </div>\n                </div>\n              </div>\n            </div>\n          </div>\n\n          <!-- =================================================================== -->\n          <!-- B. VIDEO DETAIL VIEW (ACTIVATED WHEN A REAL VIDEO SLUG IS SELECTED) -->\n          <!-- =================================================================== -->\n";
function mount() {
  if (document.getElementById('legacy-studio-root')) return;
  const root = document.createElement('div');
  root.id = 'legacy-studio-root';
  root.className = 'legacy-ui';
  root.innerHTML = LEGACY_MODALS;
  document.body.append(root);
}
// onclick="…" trong markup cũ gọi hàm toàn cục
Object.assign(window, {
  closeModal, openNewVideoModal, closeNewVideoModal, openMatrixModal, openTemplateReviewModal, closeTemplateReviewModal,
  setWsTemplateReviewType, setWsTemplateReviewLang, playSfxPreview,
});
for (const name of ["closeModal", "closeNewVideoModal", "closeTemplateReviewModal", "createMatrixBatchFromUi", "filterCompareCat", "matrixApplyCountLimit", "matrixSelectAll", "matrixSelectNone", "matrixUpdateCounter", "onNewVidAutoPublishToggle", "onNewVidCompareSearch", "onNewVidCountryChange", "onNewVidVoiceChange", "playNewVidSfx", "randomizeCompareTopic", "randomizeCustomPrompt", "scheduleMatrixJob", "selectArchetypeSuggestion", "selectCuratedCompareTopic", "selectNewVidCategory", "selectNewVidTemplate", "setNewVidCompareTab", "setWsTemplateReviewLang", "setWsTemplateReviewType", "submitNewVideoModal", "toggleVoicePreview", "triggerGeminiResearch", "updateNewVidFooterMeta"]) {
  try { const fn = eval(name); if (typeof fn === 'function') window[name] = fn; } catch (_) { /* hàm không có trong phần đã chép */ }
}
window.LegacyStudio = {
  mount,
  openNew() { mount(); return openNewVideoModal(); },
  openMatrix() { mount(); return openMatrixModal(); },
  openLayout() { mount(); openTemplateReviewModal(); },
  renderTemplate(el) { mount(); el.innerHTML = `<div class="legacy-ui">${LEGACY_TEMPLATE}</div>`; loadWsTemplateTiming(wsTplCurrentType, wsTplCurrentLang);
    el.querySelectorAll('.filter-chip').forEach((c) => c.classList.toggle('active', c.dataset.tpl === wsTplCurrentType));
    const sel = el.querySelector('#ws-tpl-country-select'); if (sel) sel.value = wsTplCurrentLang; },
};
})();
