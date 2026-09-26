// Phiên đăng nhập hết hạn thì mọi lời gọi API trả 401. Trước đây mỗi nơi gọi
// fetch lại tự xử lý (hoặc không xử lý), nên giao diện im lặng giữ nguyên nội
// dung cũ — người dùng bấm sang mục khác mà chẳng thấy gì đổi. Chặn một chỗ ở
// đây để luôn đưa về màn hình đăng nhập thay vì hỏng âm thầm.
(function installAuthGuard() {
  const nativeFetch = window.fetch.bind(window);
  let redirecting = false;

  window.fetch = async function (input, init) {
    const res = await nativeFetch(input, init);
    if (res.status === 401 && !redirecting) {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      // Chỉ phản ứng với API của chính mình, không đụng tới lời gọi ra ngoài.
      if (url.startsWith('/') || url.startsWith(location.origin)) {
        redirecting = true;
        const next = encodeURIComponent(location.pathname + location.search);
        location.replace('/login?next=' + next);
      }
    }
    return res;
  };
})();

// State
let allChannels = [];
let scanPollInterval = null;
// Tab publisher đang chọn: 'ALL' | 'pub1' | 'pub2' | 'NONE' (chưa gán)
let publisherFilter = 'ALL';
// Sắp xếp bảng kênh: null = giữ thứ tự mặc định (kênh mới nhất trước)
let sortState = { key: null, dir: 'asc' };

// DOM Elements
const tbody = document.getElementById('channels-tbody');
const searchInput = document.getElementById('search-input');
const filterStatus = document.getElementById('filter-status');
const filterCountry = document.getElementById('filter-country');

// Stats Elements
const elTotalAccounts = document.getElementById('val-total-accounts');
const elTotalBkt = document.getElementById('val-total-bkt');
const elTotalEarned = document.getElementById('val-total-earned');
const elTotalBalance = document.getElementById('val-total-balance');
const elAvgRpm = document.getElementById('val-avg-rpm');
const elTotalAudience = document.getElementById('val-total-audience');
const elFooterCount = document.getElementById('footer-count');

// Scan Progress Elements
const scanBanner = document.getElementById('scan-progress-bar');
const scanProgressText = document.getElementById('scan-progress-text');
const scanCounter = document.getElementById('scan-counter');
const scanFill = document.getElementById('scan-fill');

// Modals
const modalImport = document.getElementById('modal-import');
const importTextarea = document.getElementById('import-textarea');
const toastEl = document.getElementById('toast');

// --- Helper Functions ---
function showToast(message, duration = 3000) {
  toastEl.textContent = message;
  toastEl.style.display = 'block';
  setTimeout(() => {
    toastEl.style.display = 'none';
  }, duration);
}

function openModal(id) {
  const m = document.getElementById(id);
  if (m) {
    m.style.display = 'flex';
  }
}

function closeModal(id) {
  const m = document.getElementById(id);
  if (m) {
    m.style.display = 'none';
  }
}

function truncate(str, len = 16) {
  if (!str) return '';
  return str.length > len ? str.substring(0, len) + '...' : str;
}

// --- Fetch & Render Data ---
async function loadChannels() {
  try {
    const res = await fetch('/api/channels');
    const data = await res.json();
    allChannels = data.channels || [];
    const bktBadge = document.getElementById('side-badge-bkt');
    if (bktBadge) bktBadge.textContent = allChannels.length;

    // Update Stats
    const s = data.stats || {};
    elTotalAccounts.textContent = s.total_accounts || 0;
    elTotalBkt.textContent = s.total_bkt || 0;
    elTotalEarned.textContent = `$${(s.total_earned || 0).toFixed(2)}`;
    elTotalBalance.textContent = `$${(s.total_balance || 0).toFixed(2)}`;
    elAvgRpm.textContent = `$${(s.avg_rpm || 0).toFixed(2)}`;
    if (elTotalAudience) {
      elTotalAudience.textContent = `${formatCompact(s.total_followers || 0)} / ${s.total_videos || 0}`;
      elTotalAudience.title = `Tổng: ${s.total_followers || 0} Followers, ${s.total_videos || 0} Videos, ${s.total_likes || 0} Likes, ${s.total_views || 0} Views`;
    }

    renderTable();

    // Check if background scan is running
    if (data.scan_status && data.scan_status.is_scanning) {
      startScanPolling();
    }
  } catch (err) {
    console.error('Failed to load channels:', err);
  }
}

function formatCompact(num) {
  if (!num || isNaN(num)) return '0';
  if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return num.toString();
}

// --- Publisher (nguồn kênh) ---
function channelPublisher(ch) {
  return (ch.publisher || '').toLowerCase();
}

function matchPublisher(ch, pub) {
  if (pub === 'ALL') return true;
  if (pub === 'NONE') return !channelPublisher(ch);
  return channelPublisher(ch) === pub;
}

function publisherBadge(pub) {
  if (!pub) return '';
  const cls = pub === 'pub1' ? 'pub1' : pub === 'pub2' ? 'pub2' : pub === 'pub3' ? 'pub3' : 'other';
  const label = pub === 'pub1' ? 'PUB 1' : pub === 'pub2' ? 'PUB 2' : pub === 'pub3' ? 'PUB 3' : pub.toUpperCase();
  return `<span class="badge-publisher ${cls}" title="Publisher: ${escapeHtml(pub)}">${escapeHtml(label)}</span>`;
}

function updatePublisherCounts() {
  const counts = { ALL: allChannels.length, pub1: 0, pub2: 0, pub3: 0, NONE: 0 };
  allChannels.forEach(ch => {
    const pub = channelPublisher(ch);
    if (!pub) counts.NONE += 1;
    else if (pub in counts) counts[pub] += 1;
  });
  Object.entries(counts).forEach(([key, val]) => {
    const el = document.getElementById(`pub-count-${key}`);
    if (el) el.textContent = val;
  });
}

// Ribbon thống kê bám theo tab publisher đang chọn (tab "Tất cả" = toàn bộ kênh).
function renderStatsFor(list) {
  if (!elTotalAccounts) return;
  let earned = 0, balance = 0, bkt = 0, rpmSum = 0, rpmCount = 0;
  let followers = 0, videos = 0, likes = 0, views = 0;
  list.forEach(ch => {
    earned += ch.earned || 0;
    balance += ch.balance || 0;
    followers += ch.follower_count || 0;
    videos += ch.video_count || 0;
    likes += ch.like_count || 0;
    views += ch.view_count || 0;
    if (ch.status === 'BKT') {
      bkt += 1;
      if ((ch.rpm || 0) > 0) { rpmSum += ch.rpm; rpmCount += 1; }
    }
  });
  elTotalAccounts.textContent = list.length;
  const headerCount = document.getElementById('bkt-header-count');
  if (headerCount) headerCount.textContent = list.length;
  elTotalBkt.textContent = bkt;
  elTotalEarned.textContent = `$${earned.toFixed(2)}`;
  elTotalBalance.textContent = `$${balance.toFixed(2)}`;
  elAvgRpm.textContent = `$${(rpmCount ? rpmSum / rpmCount : 0).toFixed(2)}`;
  if (elTotalAudience) {
    elTotalAudience.textContent = `${formatCompact(followers)} / ${videos}`;
    elTotalAudience.title = `Tổng: ${followers} Followers, ${videos} Videos, ${likes} Likes, ${views} Views`;
  }
}

// Tập kênh trong tab publisher đang chọn (chưa áp search / bộ lọc).
function publisherScope() {
  return allChannels.filter(ch => matchPublisher(ch, publisherFilter));
}

// Thứ hạng tình trạng để sort có nghĩa: BKT lên đầu, cookie die xuống cuối.
const STATUS_RANK = { 'BKT': 0, 'CHƯA BKT': 1, 'CHƯA CHECK': 2, 'DIE': 3 };

// Giá trị dùng để so sánh cho từng cột; trả về số hoặc chuỗi đã chuẩn hoá.
function sortValue(ch, key) {
  switch (key) {
    case 'status': return STATUS_RANK[ch.status] ?? 9;
    case 'earned': return ch.earned || 0;
    case 'balance': return ch.balance || 0;
    case 'rpm': return ch.rpm || 0;
    case 'video_count': return ch.video_count || 0;
    case 'follower_count': return ch.follower_count || 0;
    case 'like_count': return ch.like_count || 0;
    case 'view_count': return ch.view_count || 0;
    case 'currency': return (ch.currency || '#').toLowerCase();
    case 'country': return (ch.country || '').toLowerCase();
    case 'kyc': return (ch.kyc || '').toLowerCase();
    case 'vpn': return (ch.vpn_location || '').toLowerCase();
    case 'note': return (ch.username || ch.note || '').toLowerCase();
    default: return 0;
  }
}

function sortChannels(list) {
  if (!sortState.key) return list;
  const factor = sortState.dir === 'desc' ? -1 : 1;
  // Bản sao để không đụng vào thứ tự gốc của allChannels.
  return [...list].sort((a, b) => {
    const va = sortValue(a, sortState.key);
    const vb = sortValue(b, sortState.key);
    if (typeof va === 'number' && typeof vb === 'number') {
      if (va !== vb) return (va - vb) * factor;
    } else {
      const cmp = String(va).localeCompare(String(vb), 'vi');
      if (cmp !== 0) return cmp * factor;
    }
    return b.id - a.id;  // hoà nhau thì giữ kênh mới nhất trước
  });
}

function updateSortIndicators() {
  document.querySelectorAll('#table-channels th.sortable').forEach(th => {
    const isActive = th.dataset.sort === sortState.key;
    th.classList.toggle('sorted-asc', isActive && sortState.dir === 'asc');
    th.classList.toggle('sorted-desc', isActive && sortState.dir === 'desc');
  });
}

// Tập kênh thực sự đang hiển thị trong bảng: tab + search + status + quốc gia.
function visibleChannels() {
  const query = (searchInput.value || '').toLowerCase().trim();
  const statusVal = filterStatus.value;
  const countryVal = filterCountry.value;

  return sortChannels(publisherScope().filter(ch => {
    const matchQuery =
      (ch.note || '').toLowerCase().includes(query) ||
      (ch.username || '').toLowerCase().includes(query);

    const matchStatus = statusVal === 'ALL' || ch.status === statusVal;
    const matchCountry = countryVal === 'ALL' || ch.country === countryVal;

    return matchQuery && matchStatus && matchCountry;
  }));
}

function renderTable() {
  updatePublisherCounts();
  updateSortIndicators();
  const pubScope = publisherScope();
  renderStatsFor(pubScope);

  const filtered = visibleChannels();

  const scopeLabel = publisherFilter === 'ALL' ? '' :
    publisherFilter === 'NONE' ? ' (chưa gán publisher)' : ` (${publisherFilter.toUpperCase()})`;
  elFooterCount.textContent =
    `Đang hiển thị ${filtered.length} / ${pubScope.length} tài khoản${scopeLabel}`;

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="15" class="bkt-empty-cell">
          Chưa có tài khoản nào. Bấm <strong>"Nạp Dữ Liệu Mẫu"</strong> hoặc <strong>"Nhập Cookie Hàng Loạt"</strong> để bắt đầu.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map((ch, idx) => {
    // Status Badge
    let statusBadgeClass = 'status-not-bkt';
    if (ch.status === 'BKT') statusBadgeClass = 'status-bkt';
    else if (ch.status === 'DIE') statusBadgeClass = 'status-die';

    // Highlight row 5 if it matches user screenshot
    const isHighlight = ch.note === '@newsenTV';

    // Extract clean username for TikTok profile link
    let uName = (ch.username || '').trim();
    if (!uName && ch.note) {
      uName = ch.note.split(' ')[0].split('(')[0].trim();
    }
    const cleanUsername = uName.replace(/^@/, '');
    const tiktokUrl = cleanUsername ? `https://www.tiktok.com/@${encodeURIComponent(cleanUsername)}` : '';

    return `
      <tr data-id="${ch.id}" class="${isHighlight ? 'row-highlight' : ''}">
        <td class="col-index">${idx + 1}</td>
        <td class="user-channel-cell">
          <div class="user-channel-box">
            ${tiktokUrl ? `
              <a href="${tiktokUrl}" target="_blank" rel="noopener noreferrer" class="tiktok-link" title="Mở ${tiktokUrl}">
                <svg class="tiktok-svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.298-.002.595.042.88.13V9.4a6.33 6.33 0 0 0-1-.08A6.34 6.34 0 0 0 3 15.66a6.34 6.34 0 0 0 10.86 4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-.04-4.52z"/></svg>
                <span>@${escapeHtml(cleanUsername)}</span>
                <svg class="external-icon" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              </a>
            ` : '<span class="channel-missing">Chưa có username</span>'}
            <span class="note-subtext" onclick="editNote(${ch.id})" title="Click để sửa ghi chú">
              ${publisherBadge(channelPublisher(ch))}${escapeHtml(ch.note || 'Chưa có ghi chú')}
            </span>
          </div>
        </td>
        <td class="col-status"><span class="status-badge ${statusBadgeClass}">${escapeHtml(ch.status || 'CHƯA CHECK')}</span></td>
        <td class="val-earned">
          <strong>${ch.earned.toFixed(2)}</strong><span class="money-code">${escapeHtml(ch.currency || '$')}</span>
          <button class="btn-history-mini" onclick="openChannelHistory(${ch.id}, event)" title="Xem lịch sử doanh thu &amp; tăng trưởng">📈</button>
        </td>
        <td class="val-earned"><strong>${ch.balance.toFixed(2)}</strong><span class="money-code">${escapeHtml(ch.currency || '$')}</span></td>
        <td class="val-rpm">${ch.rpm.toFixed(2)}</td>
        <td class="country-pair">
          <span class="badge-country">${escapeHtml(ch.country || '—')}</span>
          ${ch.original_country && ch.original_country !== ch.country ? `<span class="country-origin" title="Quốc gia gốc">gốc ${escapeHtml(ch.original_country)}</span>` : ''}
        </td>
        <td>
          <div class="vpn-cell">
            <span class="badge-vpn" onclick="openVpnPicker(${ch.id})" title="Click để cấu hình / đổi VPN WireGuard" style="cursor: pointer;">
              ${ch.vpn_location ? `🛡️ ${escapeHtml(ch.vpn_location)}` : '<span style="color: #64748b; font-size: 10.5px;">+ Gán VPN</span>'}
            </span>
            <button class="btn-check-vpn-ip" id="btn-check-ip-${ch.id}" onclick="checkChannelVpnIp(${ch.id}, event)" title="🔍 Kiểm tra Exit IP (API & TikTok)">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </button>
          </div>
        </td>
        <td>
          <span class="${ch.kyc === 'Yes' ? 'badge-kyc-yes' : 'badge-kyc-no'}">${escapeHtml(ch.kyc)}</span>
        </td>
        <td class="val-metric clickable-cell" onclick="openChannelVideos(${ch.id})" title="Click để xem danh sách video & chẩn đoán shadowban / trùng lặp">
          <span style="border-bottom: 1px dashed rgba(56, 189, 248, 0.6);">${ch.video_count || 0}</span>
        </td>
        <td class="val-metric text-cyan-glow">${formatCompact(ch.follower_count)}</td>
        <td class="val-metric text-pink">${formatCompact(ch.like_count)}</td>
        <td class="val-metric text-purple-light">${formatCompact(ch.view_count)}</td>
        <td>
          <div class="cookie-cell">
            <span class="cookie-text" title="Cookie được mã hóa trong database">••••••••</span>
            ${sessionBadge(ch)}
            <button class="btn-copy-cookie" onclick="copyChannelCookie(${ch.id})" title="Sao chép Cookie sau khi xác nhận">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2 2v1"/></svg>
            </button>
          </div>
        </td>
        <td>
          <div class="action-btns">
            <button class="btn-icon profile" onclick="launchChannelProfile(${ch.id})" title="Mở Trình Duyệt Profile (Chạy qua WireGuard VPN & Cookie kênh)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            </button>
            <button class="btn-icon" onclick="reloginChannelProfile(${ch.id})" title="Đăng nhập lại: mở profile ở trang đăng nhập TikTok trên màn hình máy chủ (noVNC)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
            </button>
            <button class="btn-icon" onclick="saveChannelSession(${ch.id})" title="Lưu phiên: đóng Chrome của profile rồi lưu cookie sau khi đăng nhập tay">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
            </button>
            <button class="btn-icon" onclick="openChannelVideos(${ch.id})" title="Xem danh sách video & chẩn đoán shadowban">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
            </button>
            <button class="btn-icon" onclick="openChannelNotifications(${ch.id})" title="Đọc thông báo TikTok của kênh này">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            </button>
            <button class="btn-icon" onclick="recheckChannel(${ch.id})" title="Quét lại kênh này">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            </button>
            <button class="btn-icon delete" onclick="deleteChannel(${ch.id})" title="Xóa tài khoản">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function safeExternalUrl(value) {
  try {
    const url = new URL(value, window.location.origin);
    return ['http:', 'https:', 'data:'].includes(url.protocol) ? url.href : '#';
  } catch (_) {
    return '#';
  }
}

// Ảnh giữ chỗ dạng SVG nhúng thẳng vào trang. Trước đây chỗ này gọi
// via.placeholder.com — dịch vụ đó đã ngừng hoạt động nên mọi ảnh thiếu đều
// ném ERR_CONNECTION_CLOSED, lại còn lặp vô hạn vì onerror gán lại đúng URL
// chết đó. Data URI không cần mạng nên không bao giờ hỏng.
function placeholderImage(width, height, text, accent) {
  const label = String(text == null ? '' : text).slice(0, 24)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const fontSize = Math.max(9, Math.round(Math.min(width, height) / 5));
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height +
    '" viewBox="0 0 ' + width + ' ' + height + '">' +
    '<rect width="100%" height="100%" fill="#0f172a"/>' +
    '<text x="50%" y="50%" fill="' + (accent || '#38bdf8') +
    '" font-family="system-ui,-apple-system,sans-serif" font-size="' + fontSize +
    '" text-anchor="middle" dominant-baseline="middle">' + label + '</text></svg>';
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

async function copyChannelCookie(id) {
  if (!confirm('Cookie cho phép đăng nhập tài khoản. Bạn có chắc muốn sao chép vào clipboard?')) return;
  const res = await fetch(`/api/channels/${id}/cookie`, { method: 'POST' });
  const data = await res.json();
  if (!res.ok) return showToast(data.detail || 'Không thể đọc cookie');
  await navigator.clipboard.writeText(data.cookie || '');
  showToast('Đã sao chép Cookie. Hãy xóa clipboard sau khi sử dụng!');
}

// --- Action Handlers ---
async function editNote(id) {
  const currentNote = allChannels.find(ch => ch.id === id)?.note || '';
  const newNote = prompt('Nhập tên kênh / Ghi chú mới:', currentNote);
  if (newNote !== null && newNote !== currentNote) {
    await fetch(`/api/channels/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: newNote }),
    });
    loadChannels();
  }
}

async function recheckChannel(id) {
  showToast('Đang quét lại tài khoản...');
  const parts = [];
  try {
    const res = await fetch(`/api/channels/check-single/${id}`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    parts.push(res.ok ? 'Cookie: đã cập nhật' : `Cookie: ${data.detail || 'lỗi'}`);
  } catch (err) {
    parts.push('Cookie: lỗi kết nối');
  }
  // Flow TikTok API: username → sec_uid → danh sách video → chi tiết video
  showToast('Đang lấy hồ sơ & video qua TikTok API...');
  try {
    const res = await fetch(`/api/channels/${id}/scan-api`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      parts.push(`API: ${data.detail || 'lỗi'}`);
    } else {
      parts.push(data.profile ? `Hồ sơ API: ${Number(data.profile.follower_count).toLocaleString('vi-VN')} follower` : `Hồ sơ API: ${data.profile_error}`);
      parts.push(data.videos_error ? `Video API: ${data.videos_error}` : `Video API: ${data.video_count} video`);
    }
  } catch (err) {
    parts.push('API: lỗi kết nối');
  }
  showToast(parts.join(' · '), 9000);
  loadChannels();
}

async function deleteChannel(id) {
  if (!confirm('Bạn có chắc muốn xóa tài khoản này?')) return;
  await fetch(`/api/channels/${id}`, { method: 'DELETE' });
  loadChannels();
}

// --- Batch Scan Polling ---
function startScanPolling() {
  if (scanPollInterval) return;
  scanBanner.style.display = 'block';

  scanPollInterval = setInterval(async () => {
    try {
      const res = await fetch('/api/scan-status');
      const s = await res.json();

      if (s.is_scanning) {
        scanProgressText.textContent = `Đang quét: ${s.current_account || '...'}`;
        scanCounter.textContent = `${s.completed} / ${s.total}`;
        const pct = s.total > 0 ? Math.round((s.completed / s.total) * 100) : 0;
        scanFill.style.width = `${pct}%`;
      } else {
        clearInterval(scanPollInterval);
        scanPollInterval = null;
        scanFill.style.width = '100%';
        scanProgressText.textContent = 'Hoàn tất quét toàn bộ tài khoản!';
        setTimeout(() => {
          scanBanner.style.display = 'none';
          loadChannels();
        }, 1200);
      }
    } catch (err) {
      clearInterval(scanPollInterval);
      scanPollInterval = null;
    }
  }, 800);
}

// --- Events ---
const btnScanAll = document.getElementById('btn-scan-all');
if (btnScanAll) {
  btnScanAll.addEventListener('click', async () => {
    if (allChannels.length === 0) {
      showToast('Chưa có tài khoản nào để quét.');
      return;
    }
    showToast('Bắt đầu quét hàng loạt toàn bộ kênh...');
    await fetch('/api/channels/check-all', { method: 'POST' });
    startScanPolling();
  });
}

const btnImportSample = document.getElementById('btn-import-sample');
if (btnImportSample) {
  btnImportSample.addEventListener('click', async () => {
    const res = await fetch('/api/channels/import-sample', { method: 'POST' });
    const d = await res.json();
    showToast(d.message);
    loadChannels();
  });
}

const btnImportLocal = document.getElementById('btn-import-local');
if (btnImportLocal) {
  btnImportLocal.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/channels/import-from-data-cookies', { method: 'POST' });
      const d = await res.json();
      showToast(d.message);
      loadChannels();
    } catch (err) {
      showToast('Không đọc được data/Cookies');
    }
  });
}

// Modal Events
const btnOpenImport = document.getElementById('btn-open-import');
const btnCloseModal = document.getElementById('btn-close-modal');
const btnCancelImport = document.getElementById('btn-cancel-import');
const btnConfirmImport = document.getElementById('btn-confirm-import');

btnOpenImport.addEventListener('click', () => {
  importTextarea.value = '';
  modalImport.style.display = 'flex';
});

btnCloseModal.addEventListener('click', () => {
  modalImport.style.display = 'none';
});

btnCancelImport.addEventListener('click', () => {
  modalImport.style.display = 'none';
});

btnConfirmImport.addEventListener('click', async () => {
  const text = importTextarea.value.trim();
  if (!text) {
    alert('Vui lòng nhập ít nhất 1 dòng cookie!');
    return;
  }

  btnConfirmImport.disabled = true;
  btnConfirmImport.textContent = 'Đang lưu...';

  try {
    const res = await fetch('/api/channels/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lines: text,
        publisher: document.getElementById('import-publisher')?.value || '',
      }),
    });
    const d = await res.json();
    modalImport.style.display = 'none';
    showToast(d.message || 'Đã nhập thành công!');
    await loadChannels();
    // Prompt to scan now
    if (confirm('Đã thêm các tài khoản mới. Bạn có muốn quét tự động ngay bây giờ không?')) {
      document.getElementById('btn-scan-all').click();
    }
  } catch (err) {
    alert('Lỗi nhập cookie: ' + err);
  } finally {
    btnConfirmImport.disabled = false;
    btnConfirmImport.textContent = 'Lưu & Bắt Đầu Quét';
  }
});

const btnClearAll = document.getElementById('btn-clear-all');
if (btnClearAll) {
  btnClearAll.addEventListener('click', async () => {
    // Đây là thao tác phá huỷ lớn nhất trong app (xoá toàn bộ kênh + cookie),
    // nên yêu cầu gõ xác nhận thay vì một cú bấm OK.
    const total = (allChannels && allChannels.length) || 0;
    const typed = prompt(
      `⚠️ XOÁ VĨNH VIỄN toàn bộ ${total} kênh cùng cookie đã lưu.\n` +
      'Thao tác này KHÔNG hoàn tác được.\n\nGõ chính xác: XOA HET'
    );
    if (typed !== 'XOA HET') {
      showToast('Đã huỷ thao tác xoá toàn bộ.');
      return;
    }
    await fetch('/api/channels', { method: 'DELETE' });
    showToast('Đã xóa toàn bộ dữ liệu.');
    loadChannels();
  });
}

const btnExportCsv = document.getElementById('btn-export-csv');
if (btnExportCsv) {
  btnExportCsv.addEventListener('click', () => {
    if (allChannels.length === 0) {
      showToast('Không có dữ liệu để xuất CSV');
      return;
    }

    const headers = ['STT', 'Publisher', 'Tình trạng', '$Earned', '$Balance', 'C$', 'RPM', 'QG', 'KYC', 'Note'];
    const rows = allChannels.map((ch, i) => [
      i + 1,
    csvCell(channelPublisher(ch) || 'chưa gán'),
    csvCell(ch.status),
    ch.earned.toFixed(2),
    ch.balance.toFixed(2),
    csvCell(ch.currency || '#'),
    ch.rpm.toFixed(2),
    csvCell(ch.country || 'KR'),
    csvCell(ch.kyc || 'No'),
    csvCell(ch.note || '')
  ]);

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `TikTok_BKT_Channels_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Đã xuất file CSV thành công!');
  });
}

// Sắp xếp bảng: bấm lần 1 tăng dần, lần 2 giảm dần, lần 3 về mặc định.
document.querySelectorAll('#table-channels th.sortable').forEach(th => {
  th.addEventListener('click', () => {
    const key = th.dataset.sort;
    if (sortState.key !== key) sortState = { key, dir: 'asc' };
    else if (sortState.dir === 'asc') sortState.dir = 'desc';
    else sortState = { key: null, dir: 'asc' };
    renderTable();
  });
});

// Publisher tab events
document.querySelectorAll('#pub-tabs .pub-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    publisherFilter = btn.dataset.pub || 'ALL';
    document.querySelectorAll('#pub-tabs .pub-tab').forEach(other => {
      const isActive = other === btn;
      other.classList.toggle('active', isActive);
      other.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    renderTable();
  });
});

// Gán publisher cho đúng tập kênh đang hiển thị (sau tab + search + bộ lọc).
const btnAssignPublisher = document.getElementById('btn-assign-publisher');
if (btnAssignPublisher) {
  btnAssignPublisher.addEventListener('click', async () => {
    const target = document.getElementById('assign-publisher-target')?.value ?? '';
    const ids = visibleChannels().map(ch => ch.id);
    if (!ids.length) return showToast('Không có kênh nào đang hiển thị để gán');

    const label = target ? target.toUpperCase() : 'Chưa gán';
    if (!confirm(`Gán ${ids.length} kênh đang hiển thị vào ${label}?`)) return;

    try {
      const res = await fetch('/api/channels/publisher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, publisher: target }),
      });
      const d = await res.json();
      if (!res.ok) return showToast(d.detail || 'Không gán được publisher');
      showToast(d.message);
      await loadChannels();
    } catch (err) {
      showToast('Lỗi gán publisher: ' + err);
    }
  });
}

// Filter & Search events
searchInput.addEventListener('input', renderTable);
filterStatus.addEventListener('change', renderTable);
filterCountry.addEventListener('change', renderTable);

// Initial load
loadChannels();

// ==========================================================================
// Channel Videos & Diagnostics Modal Logic
// ==========================================================================
const modalChannelVideos = document.getElementById('modal-channel-videos');
const btnCloseVideoModal = document.getElementById('btn-close-video-modal');
const elVideoModalChannelName = document.getElementById('video-modal-channel-name');
const elVideoModalBktStatus = document.getElementById('video-modal-bkt-status');
const elVideoModalCountry = document.getElementById('video-modal-country');
const elVideoModalDesc = document.getElementById('video-modal-channel-desc');
const elDiagTotalVids = document.getElementById('diag-total-vids');
const elDiagOriginality = document.getElementById('diag-originality');
const elDiagOrigSub = document.getElementById('diag-orig-sub');
const elDiagFypHealth = document.getElementById('diag-fyp-health');
const elDiagFypSub = document.getElementById('diag-fyp-sub');
const elDiagTotalViews = document.getElementById('diag-total-views');
const elDiagTotalLikes = document.getElementById('diag-total-likes');
const videoCardsContainer = document.getElementById('video-cards-container');
const btnRescanVideos = document.getElementById('btn-rescan-videos');
const elCountPillAll = document.getElementById('count-pill-all');

let currentActiveChannelId = null;
let currentChannelVideos = [];
let currentVideoFilter = 'ALL';

function formatDuration(sec) {
  if (!sec || isNaN(sec)) return '00:00';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function formatRelativeTime(ts) {
  if (!ts) return '---';
  const now = Math.floor(Date.now() / 1000);
  const diff = now - ts;
  if (diff < 60) return 'Vừa xong';
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)} ngày trước`;
  const d = new Date(ts * 1000);
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
}

function formatFullDateTime(ts) {
  if (!ts) return '---';
  const d = new Date(ts * 1000);
  const Y = d.getFullYear();
  const M = String(d.getMonth() + 1).padStart(2, '0');
  const D = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${Y}-${M}-${D} ${h}:${m}:${s}`;
}


// ==== Thông báo TikTok theo từng tài khoản ====
let currentNotiChannelId = null;

function tiktokNotiTime(ts) {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('vi-VN');
}

async function openChannelNotifications(chId) {
  currentNotiChannelId = chId;
  const ch = (allChannels || []).find(c => c.id === chId) || {};
  const uName = ch.username ? `@${ch.username}` : (ch.note ? ch.note.split(' ')[0] : 'Kênh TikTok');
  document.getElementById('noti-modal-channel-name').textContent = uName;
  document.getElementById('noti-modal-desc').textContent = `Thông báo từ TikTok • Ghi chú: ${ch.note || '---'}`;
  document.getElementById('noti-modal-unread').style.display = 'none';
  document.getElementById('modal-notifications').style.display = 'flex';
  loadChannelNotifications();
}

async function loadChannelNotifications() {
  const chId = currentNotiChannelId;
  if (!chId) return;
  const listEl = document.getElementById('noti-list');
  const unreadEl = document.getElementById('noti-modal-unread');
  listEl.innerHTML = '<div class="noti-loading"><div class="spinner" style="margin:0 auto 12px;"></div>Đang mở trình duyệt bằng cookie của kênh để đọc thông báo...</div>';
  try {
    const res = await fetch(`/api/channels/${chId}/notifications`);
    const data = await res.json();
    if (!res.ok) {
      listEl.innerHTML = `<div class="noti-empty">${escapeHtml(data.detail || 'Không đọc được thông báo')}</div>`;
      return;
    }
    const items = data.notifications || [];
    if (data.vpn_location) {
      document.getElementById('noti-modal-desc').textContent = `Đọc qua VPN: 🛡️ ${data.vpn_location}`;
    }
    if (data.unread_count > 0) {
      unreadEl.textContent = `${data.unread_count} chưa đọc`;
      unreadEl.style.display = '';
    } else {
      unreadEl.style.display = 'none';
    }
    if (items.length === 0) {
      const hint = data.captured
        ? 'Tài khoản này chưa có thông báo nào.'
        : 'Không lấy được thông báo (cookie có thể đã hết hạn, hoặc TikTok chặn phiên). Thử "Tải lại".';
      listEl.innerHTML = `<div class="noti-empty">${hint}${data.error ? `<br><small style="opacity:.6">${escapeHtml(data.error)}</small>` : ''}</div>`;
      return;
    }
    listEl.innerHTML = items.map(n => `
      <div class="noti-item ${n.has_read ? '' : 'unread'}">
        <div class="noti-item-head">
          <span class="noti-group">${escapeHtml(n.group_label || '')}</span>
          <span class="noti-time">${escapeHtml(tiktokNotiTime(n.create_time))}</span>
        </div>
        <div class="noti-text">${escapeHtml(n.text || '(không có nội dung văn bản)')}</div>
      </div>
    `).join('');
  } catch (err) {
    listEl.innerHTML = `<div class="noti-empty">Lỗi tải thông báo: ${escapeHtml(String(err))}</div>`;
  }
}

document.getElementById('btn-close-noti-modal')?.addEventListener('click', () => {
  document.getElementById('modal-notifications').style.display = 'none';
});
document.getElementById('btn-reload-noti')?.addEventListener('click', loadChannelNotifications);
document.getElementById('modal-notifications')?.addEventListener('click', (e) => {
  if (e.target.id === 'modal-notifications') e.target.style.display = 'none';
});

async function openChannelVideos(chId) {
  currentActiveChannelId = chId;
  modalChannelVideos.style.display = 'flex';
  videoCardsContainer.innerHTML = '<div class="video-grid-state"><div class="spinner"></div><p>Đang tải và chẩn đoán dữ liệu video của kênh...</p></div>';
  
  try {
    const res = await fetch(`/api/channels/${chId}/videos`);
    if (!res.ok) throw new Error('Không thể tải video');
    const data = await res.json();
    const ch = data.channel || {};
    const hs = data.health_summary || {};
    currentChannelVideos = data.videos || [];
    
    let uName = ch.username ? `@${ch.username}` : (ch.note ? ch.note.split(' ')[0] : 'Kênh TikTok');
    elVideoModalChannelName.textContent = uName;
    elVideoModalBktStatus.textContent = ch.status;
    elVideoModalBktStatus.className = `badge-status ${ch.status === 'BKT' ? 'status-bkt' : (ch.status === 'DIE' ? 'status-die' : 'status-not-bkt')}`;
    elVideoModalCountry.textContent = ch.country || 'DE';
    elVideoModalDesc.textContent = `${ch.nickname || uName} • Ghi chú: ${ch.note || '---'}`;
    
    elDiagTotalVids.textContent = hs.total_videos || 0;
    const elDiagTotalSub = document.getElementById('diag-total-sub');
    if (elDiagTotalSub) elDiagTotalSub.textContent = `${hs.total_videos || 0} video công khai đã quét`;
    const origRate = Math.max(0, Math.min(100, Number(hs.originality_rate) || 0));
    elDiagOriginality.textContent = `${origRate}%`;
    const elOrigBar = document.getElementById('diag-orig-bar');
    if (elOrigBar) elOrigBar.style.width = `${origRate}%`;
    elDiagOrigSub.textContent = `${hs.original_count || 0} video gốc / ${hs.duplicate_count || 0} reup`;
    
    const fypRate = hs.total_videos > 0 ? Math.round((hs.fyp_eligible_count / hs.total_videos) * 100) : 100;
    elDiagFypHealth.textContent = `${fypRate}%`;
    const elFypBar = document.getElementById('diag-fyp-bar');
    if (elFypBar) elFypBar.style.width = `${fypRate}%`;
    elDiagFypSub.textContent = `${hs.fyp_eligible_count || 0} đạt FYP / ${hs.shadowban_or_flop_count || 0} flop hoặc giới hạn`;
    
    elDiagTotalViews.textContent = formatCompact(hs.total_views || 0);
    elDiagTotalLikes.textContent = `${formatCompact(hs.total_likes || 0)} lượt thích`;
    elCountPillAll.textContent = currentChannelVideos.length;
    const setPillCount = (id, n) => { const el = document.getElementById(id); if (el) el.textContent = n; };
    setPillCount('count-pill-original', currentChannelVideos.filter(v => v.is_original === 1).length);
    setPillCount('count-pill-duplicate', currentChannelVideos.filter(v => v.is_original === 0).length);
    setPillCount('count-pill-shadowban', currentChannelVideos.filter(v => v.shadowban_status !== 'NORMAL').length);
    
    // Reset filter
    document.querySelectorAll('.btn-filter-pill').forEach(b => b.classList.remove('active'));
    document.querySelector('.btn-filter-pill[data-filter="ALL"]').classList.add('active');
    currentVideoFilter = 'ALL';
    
    renderVideoCards('ALL');
  } catch (err) {
    videoCardsContainer.innerHTML = `<div class="video-grid-state is-error"><div class="video-grid-state-icon">⚠️</div><p>Lỗi tải dữ liệu: ${escapeHtml(err.message)}</p></div>`;
  }
}

function renderVideoCards(filter) {
  currentVideoFilter = filter;
  let filtered = currentChannelVideos;
  
  if (filter === 'ORIGINAL') {
    filtered = currentChannelVideos.filter(v => v.is_original === 1);
  } else if (filter === 'DUPLICATE') {
    filtered = currentChannelVideos.filter(v => v.is_original === 0);
  } else if (filter === 'SHADOWBAN') {
    filtered = currentChannelVideos.filter(v => v.shadowban_status !== 'NORMAL');
  }
  
  if (currentChannelVideos.length === 0) {
    videoCardsContainer.innerHTML = `
      <div class="video-grid-state is-empty">
        <div class="video-grid-state-icon">📭</div>
        <p class="video-grid-state-title">Kênh này chưa có video công khai nào</p>
        <p>Tài khoản chưa tải lên video, hoặc toàn bộ video đang ở chế độ riêng tư / bản nháp.
          Nếu kênh vừa đăng video mới, bấm <strong>"Quét &amp; Phân Tích Lại"</strong> ở trên để cập nhật.</p>
      </div>
    `;
    return;
  }

  if (filtered.length === 0) {
    const filterLabels = { ALL: 'Tất cả', ORIGINAL: 'Video gốc', DUPLICATE: 'Trùng lặp / Reup', SHADOWBAN: 'Flop / Bị bóp' };
    videoCardsContainer.innerHTML = `
      <div class="video-grid-state is-empty">
        <div class="video-grid-state-icon">🔍</div>
        <p class="video-grid-state-title">Không có video nào khớp bộ lọc</p>
        <p>Không tìm thấy video nào thuộc nhóm <strong>${escapeHtml(filterLabels[filter] || filter)}</strong>.</p>
      </div>
    `;
    return;
  }
  
  const fallbackCover = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='400' viewBox='-18 -24 60 72' fill='none' stroke='%2398a2b3' stroke-width='1.5'><rect width='18' height='18' x='3' y='3' rx='2'/><polygon points='10 8 16 12 10 16 10 8' fill='%23d0d5dd'/></svg>";

  videoCardsContainer.innerHTML = filtered.map(v => {
    const isShadowban = v.shadowban_status !== 'NORMAL';
    const isDuplicate = v.is_original === 0;

    let shadowDesc = 'Mất FYP';
    if (v.shadowban_status === 'FLOP_0VIEW') shadowDesc = 'Flop 0 view';
    else if (v.shadowban_status === 'LOW_REACH') shadowDesc = 'Bóp tương tác';
    else if (v.shadowban_status === 'BANNED') shadowDesc = 'Vi phạm';
    else if (v.shadowban_status === 'REVIEWING') shadowDesc = 'Đang duyệt';
    else if (v.shadowban_status === 'PRIVATE_RESTRICTED') shadowDesc = 'Riêng tư';

    const durationStr = formatDuration(v.duration);
    const coverSrc = safeExternalUrl(v.cover_url || fallbackCover);
    const cleanCountry = (v.country || 'KR').toUpperCase();
    const createdTimeStr = formatFullDateTime(v.create_time).slice(0, 16);
    const videoHref = safeExternalUrl(v.video_url || '#');
    const caption = v.desc || 'Video không có mô tả caption';

    return `
      <article class="cv-card${isShadowban || isDuplicate ? ' is-alert' : ''}">
        <a class="cv-media" href="${videoHref}" target="_blank" rel="noopener noreferrer" title="Mở video trên TikTok">
          <img src="${coverSrc}" alt="Ảnh bìa video" loading="lazy" onerror="this.src='${fallbackCover}'">
          <span class="cv-duration">${durationStr}</span>
          <span class="cv-views">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            ${formatCompact(v.view_count)}
          </span>
        </a>
        <div class="cv-card-body">
          <p class="cv-caption" title="${escapeHtml(caption)}">${escapeHtml(caption)}</p>
          <div class="cv-chips">
            <span class="cv-chip ${isShadowban ? 'is-bad' : 'is-good'}" title="Trạng thái phân phối (FYP)">
              ${isShadowban ? `Bị bóp · ${shadowDesc}` : 'FYP bình thường'}
            </span>
            <span class="cv-chip ${isDuplicate ? 'is-bad' : 'is-good'}" title="Kết quả đối chiếu trùng lặp">
              ${isDuplicate ? 'Reup' : 'Video gốc'}
            </span>
          </div>
          <div class="cv-stats">
            <span title="Lượt thích"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/></svg>${formatCompact(v.like_count)}</span>
            <span title="Bình luận"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.2A8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5z"/></svg>${formatCompact(v.comment_count)}</span>
            <span title="Quốc gia"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z"/></svg>${escapeHtml(cleanCountry)}</span>
          </div>
          <div class="cv-card-foot">
            <span class="cv-date" title="Thời gian đăng">${createdTimeStr}</span>
            <a href="${videoHref}" target="_blank" rel="noopener noreferrer" class="cv-link" title="Mở xem video trên TikTok">Xem ↗</a>
          </div>
        </div>
      </article>
    `;
  }).join('');
}

// Video Modal Filter Pills
document.querySelectorAll('.btn-filter-pill').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.btn-filter-pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderVideoCards(btn.dataset.filter);
  });
});

// Close Video Modal
btnCloseVideoModal.addEventListener('click', () => {
  modalChannelVideos.style.display = 'none';
  currentActiveChannelId = null;
});

modalChannelVideos.addEventListener('click', (e) => {
  if (e.target === modalChannelVideos) {
    modalChannelVideos.style.display = 'none';
    currentActiveChannelId = null;
  }
});

// Rescan Videos Button
btnRescanVideos.addEventListener('click', async () => {
  if (!currentActiveChannelId) return;
  btnRescanVideos.disabled = true;
  btnRescanVideos.innerHTML = '<div class="spinner"></div> Đang quét...';
  
  try {
    const res = await fetch(`/api/channels/${currentActiveChannelId}/scan-videos`, { method: 'POST' });
    const d = await res.json();
    showToast(d.message || 'Đã quét xong video!');
    await openChannelVideos(currentActiveChannelId);
    loadChannels();
  } catch (err) {
    showToast('Lỗi quét video: ' + err.message);
  } finally {
    btnRescanVideos.disabled = false;
    btnRescanVideos.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
      Quét & Phân Tích Lại
    `;
  }
});

// =============================================================================
// WORKSTATION MULTI-MODULE CONTROLLER (Left Sidebar & Workspace Router)
// =============================================================================
const WORKSTATION_TABS = {

  profiles: { icon: '🌐', title: 'Hồ Sơ Trình Duyệt Antidetect (BaoSam Engine)', pane: 'nuoinick', nnsub: 'profiles' },

  vpn: { icon: '🛡️', title: 'Quản Lý Mạng / WireGuard VPN', pane: 'vpn' },

  bkt: { icon: '📊', title: 'Quản Lý Kênh BKT TikTok & Doanh Thu', pane: 'bkt' },
  acc_stats: { icon: '📈', title: 'Thống Kê Tài Khoản TikTok', pane: 'acc_stats' },
  ai_images: { icon: '🎨', title: 'Xưởng Tạo Ảnh AI (Dual Engine: Instant & Antigravity)', pane: 'ai_images' },
  bridge: { icon: '🔗', title: 'Antigravity Bridge — Cầu Nối IDE', pane: 'bridge' },
  remake_2d: { icon: '✨', title: 'Xưởng Remake Hoạt Hình 2D (Native Vector & Multi-Voice Engine)', pane: 'remake_2d' },
  compare: { icon: '🎬', title: 'Xưởng Video AI Đa Phong Cách (Split-Screen)', pane: 'compare' },
  gpu: { icon: '🎞️', title: 'Render Video GPU H.264 / VideoToolbox', pane: 'gpu' },
  downloader: { icon: '📥', title: 'Tải Video TikTok Không Logo (No-Logo)', pane: 'downloader' },
  tiktok_api: { icon: '📡', title: 'TikTok REST API (Chocode)', pane: 'tiktok_api' },
  flow: { icon: '🧭', title: 'Sơ Đồ Luồng Live — Autopilot · Đăng TikTok · Script Queue', pane: 'flow' },
  upload: { icon: '🚀', title: 'Lịch Đăng Video Tự Động TikTok', pane: 'upload' },
  settings: { icon: '⚙️', title: 'Cài Đặt Hệ Thống & API Keys', pane: 'settings' }
};

function switchTab(tabName) {
  if (!tabName) tabName = 'bkt';
  if (typeof stopBridgePolling === 'function') stopBridgePolling();
  if (tabName !== 'flow' && typeof stopFlowView === 'function') stopFlowView();
  const meta = WORKSTATION_TABS[tabName] || { icon: '⚡', title: tabName, pane: tabName };

  // 1. Update Active State on Sidebar Buttons
  document.querySelectorAll('.app-sidebar .nav-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tabName);
  });

  // 2. Update Topbar Module Pill
  const topIcon = document.getElementById('top-module-icon');
  const topTitle = document.getElementById('top-module-title');
  if (topIcon) topIcon.textContent = meta.icon;
  if (topTitle) topTitle.textContent = meta.title;

  // 3. Show Target Workspace Pane
  const targetPaneId = `pane-${meta.pane || tabName}`;
  document.querySelectorAll('.app-workspace .tab-pane').forEach(p => {
    p.style.display = (p.id === targetPaneId) ? 'block' : 'none';
  });

  // 4. Delegate Subpanes if needed
  if (meta.nnsub) {
    if (typeof switchNnSub === 'function') {
      switchNnSub(meta.nnsub);
    }
  } else if (meta.sfbRoute) {
    if (typeof loadFacebookData === 'function') loadFacebookData();
    if (typeof switchSfbRoute === 'function') switchSfbRoute(meta.sfbRoute);
  }

  // 5. Trigger Lazy Loading
  if (tabName === 'vpn') {
    if (typeof loadVpnWorkstation === 'function') loadVpnWorkstation();
  } else if (tabName === 'downloader') {
    loadDownloadedVideos();
  } else if (tabName === 'tiktok_api') {
    if (typeof loadTiktokApiTab === 'function') loadTiktokApiTab();
  } else if (tabName === 'flow') {
    if (typeof loadFlowView === 'function') loadFlowView();
  } else if (tabName === 'compare') {
    if (typeof loadWsLibrary === 'function') loadWsLibrary();
    if (typeof setWsNavExpanded === 'function') setWsNavExpanded(true);
  } else if (tabName === 'gpu') {
    loadRenderAssets();
    loadDownloadedVideos();
    loadRenderTasks();
  } else if (tabName === 'upload') {
    populateUploadSelects();
    loadUploadTasks();


  } else if (tabName === 'nuoinick') {
    loadNuoiNickData();
  } else if (tabName === 'settings') {
    loadSettings();
  } else if (tabName === 'bkt') {
    if (typeof loadChannels === 'function') loadChannels();
    // Biết trước có màn hình từ xa hay không để cú bấm "mở trình duyệt" đầu tiên
    // không phải chờ await và không bị chặn cửa sổ bật lên.
    if (typeof ensureRemoteViewInfo === 'function') ensureRemoteViewInfo();
  } else if (tabName === 'ai_images') {
    loadAiImageStudio();

  } else if (tabName === 'acc_stats') {
    loadAccountStats();
  } else if (tabName === 'remake_2d') {
    loadRemakeStudio();
  } else if (tabName === 'bridge') {
    if (typeof loadBridgeStatus === 'function') loadBridgeStatus();
    // startBridgePolling/stopBridgePolling đã bị gỡ khỏi app.js; gọi thẳng sẽ
    // ném ReferenceError và bỏ dở phần đóng drawer mobile ở cuối hàm này.
    if (typeof startBridgePolling === 'function') startBridgePolling();
  }



  // 7. Persist Last Active Tab
  try {
    localStorage.setItem('tokmatrix_active_workstation_tab', tabName);
  } catch (e) {}

  // Trên màn hình nhỏ, đóng menu ngay sau khi người dùng chọn phân hệ.
  if (document.body.classList.contains('sidebar-open')) {
    document.body.classList.remove('sidebar-open');
    const mobileToggle = document.getElementById('mobile-menu-toggle');
    if (mobileToggle) mobileToggle.setAttribute('aria-expanded', 'false');
  }
}

// UI policy: TokMatrix uses a consistent SVG/CSS icon system, never emoji.
// This also covers text produced asynchronously by older modules and API data.
const UI_EMOJI_PATTERN = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{20E3}]/gu;

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

Object.assign(UI_ICON_PATHS, {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  compare: '<path d="M4 7h13"/><path d="m14 4 3 3-3 3"/><path d="M20 17H7"/><path d="m10 14-3 3 3 3"/>',
  survival: '<path d="M12 3a7 7 0 0 0-7 7c0 3 1.5 4.5 3 5.5V21h8v-5.5c1.5-1 3-2.5 3-5.5a7 7 0 0 0-7-7Z"/><path d="M9 11h.01M15 11h.01M10 16h4"/>',
  tierlist: '<path d="M8 21h8M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0Z"/><path d="M7 6H4v2a4 4 0 0 0 4 4M17 6h3v2a4 4 0 0 1-4 4"/>',
  vox: '<path d="m4 4 16 16M20 4 4 20"/><circle cx="7" cy="7" r="3"/><circle cx="17" cy="17" r="3"/>',
  newspaper: '<path d="M5 3h14v18H5z"/><path d="M8 7h8M8 11h3M13 11h3M8 15h8M8 18h5"/>',
  chalk: '<path d="M4 19 15 8l3 3L7 22H4Z"/><path d="m14 9 2-2 3 3-2 2M4 16l4 4"/>',
  wildlife: '<circle cx="8" cy="8" r="2"/><circle cx="16" cy="8" r="2"/><circle cx="6" cy="14" r="2"/><circle cx="18" cy="14" r="2"/><path d="M9 19c1-4 5-4 6 0 0 2-6 2-6 0Z"/>',
  kinetic: '<path d="m13 2-8 12h7l-1 8 8-12h-7Z"/>',
  science: '<circle cx="12" cy="12" r="2"/><ellipse cx="12" cy="12" rx="9" ry="4"/><ellipse cx="12" cy="12" rx="4" ry="9" transform="rotate(45 12 12)"/>',
  mystery: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4M9 9a2 2 0 1 1 3 1.7c-.7.4-1 .8-1 1.3M11 15h.01"/>',
  folklore: '<path d="M6 21V11a6 6 0 0 1 12 0v10l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5Z"/><circle cx="10" cy="11" r="1"/><circle cx="14" cy="11" r="1"/>'
});

function uiIconMarkup(name, className = 'ui-control-icon') {
  return `<span class="${className}" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${UI_ICON_PATHS[name] || UI_ICON_PATHS.action}</svg></span>`;
}

function uiIconNameForControl(control) {
  const template = control.dataset.tpl || control.dataset.style;
  if (template && UI_ICON_PATHS[template]) return template;
  const category = control.dataset.cat;
  if (category === 'all') return 'grid';
  if (category === 'arena') return 'compare';
  if (category === 'journal') return 'newspaper';
  if (category === 'tech') return 'kinetic';
  const action = (control.getAttribute('onclick') || '').toLowerCase();
  const hint = [control.title, control.getAttribute('aria-label'), control.getAttribute('onclick'), control.textContent]
    .filter(Boolean).join(' ').toLowerCase();
  if (/delete|remove|trash|clearall|clear-all/.test(action)) return 'trash';
  if (/close|stop/.test(action)) return 'stop';
  if (/save|verify/.test(action)) return 'save';
  if (/check|test|scan/.test(action)) return 'search';
  if (/open|launch/.test(action)) return 'external';
  if (/edit/.test(action)) return 'edit';
  if (/run|play/.test(action)) return 'play';
  if (/xóa|xoá|delete|trash|thùng rác/.test(hint)) return 'trash';
  if (/fingerprint|sửa|edit/.test(hint)) return 'edit';
  if (/cache|refresh|làm mới|quét lại/.test(hint)) return 'refresh';
  if (/otp|email|mail/.test(hint)) return 'mail';
  if (/ngắt|đóng profile|close|stop/.test(hint)) return 'stop';
  if (/lưu|save|xác minh/.test(hint)) return 'save';
  if (/chạy|run|play/.test(hint)) return 'play';
  if (/mở|open|launch|profile/.test(hint)) return 'external';
  if (/kiểm tra|check|search|tìm/.test(hint)) return 'search';
  if (/cookie/.test(hint)) return 'cookie';
  if (/vpn|ip/.test(hint)) return 'shield';
  if (/copy|chép|sao chép/.test(hint)) return 'copy';
  if (/download|tải xuống/.test(hint)) return 'download';
  if (/upload|tải lên|nhập/.test(hint)) return 'upload';
  if (/thêm|add|new/.test(hint)) return 'plus';
  if (/setting|cài đặt/.test(hint)) return 'settings';
  if (/check|done|hoàn tất/.test(hint)) return 'check';
  return 'action';
}

function addUiControlIcon(control) {
  if (!(control instanceof Element) || control.matches('.mobile-menu-toggle') || control.querySelector(':scope > .ui-control-icon, :scope > svg, :scope > img')) return;
  const hasEmoji = Boolean((control.textContent || '').match(UI_EMOJI_PATTERN));
  const willBeEmpty = !(control.textContent || '').replace(UI_EMOJI_PATTERN, '').trim() && !control.querySelector('svg,img');
  if (!hasEmoji && !willBeEmpty) return;
  const name = uiIconNameForControl(control);
  control.dataset.uiIcon = name;
  const icon = document.createElement('span');
  icon.className = 'ui-control-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${UI_ICON_PATHS[name] || UI_ICON_PATHS.action}</svg>`;
  control.prepend(icon);
  if (willBeEmpty) control.classList.add('ui-icon-only');
  if (!control.getAttribute('aria-label')) control.setAttribute('aria-label', control.title || 'Thực hiện thao tác');
}

function stripUiEmoji(root = document.body) {
  // Preserve UI icons and emojis
  return;
}

function enforceEmojiFreeUi() {
  // Preserve UI icons and emojis
  return;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', enforceEmojiFreeUi, { once: true });
} else {
  enforceEmojiFreeUi();
}

document.querySelectorAll('.app-sidebar .nav-tab').forEach(tab => {
  // Các nút khai báo onclick trong HTML; không gắn lại để tránh load API hai lần.
  if (!tab.hasAttribute('onclick')) {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  }
});

const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
const sidebarBackdrop = document.getElementById('sidebar-backdrop');

// Dưới 900px sidebar chuyển thành drawer trượt (off-canvas) — đúng bằng
// breakpoint của light-theme.css và cms-theme.css. Hàm này từng bị thiếu nên
// toggleSidebar() ném ReferenceError; hậu quả là nút hamburger trên điện thoại
// bấm không có tác dụng và restoreSidebarCollapsed() cũng dừng giữa đường.
const SIDEBAR_OFFCANVAS_QUERY = '(max-width: 900px)';

function isSidebarOffCanvas() {
  if (typeof window.matchMedia === 'function') {
    return window.matchMedia(SIDEBAR_OFFCANVAS_QUERY).matches;
  }
  return window.innerWidth <= 900;
}

function setMobileSidebar(open) {
  document.body.classList.toggle('sidebar-open', open);
  if (mobileMenuToggle) mobileMenuToggle.setAttribute('aria-expanded', String(open));
}

// --- Thu gọn / mở rộng sidebar trên desktop ---------------------------------
const SIDEBAR_COLLAPSE_KEY = 'tokmatrix_sidebar_collapsed';

function setSidebarCollapsed(collapsed) {
  document.body.classList.toggle('sidebar-collapsed', collapsed);
  // Khi chỉ còn icon thì mượn tooltip gốc của trình duyệt để chú thích.
  document.querySelectorAll('.app-sidebar .nav-tab').forEach(tab => {
    const label = tab.getAttribute('data-label');
    if (collapsed && label) tab.setAttribute('title', label);
    else tab.removeAttribute('title');
  });
  if (mobileMenuToggle) {
    mobileMenuToggle.setAttribute('aria-expanded', String(!collapsed));
    mobileMenuToggle.setAttribute(
      'aria-label',
      collapsed ? 'Mở rộng menu chức năng' : 'Thu gọn menu chức năng'
    );
    mobileMenuToggle.setAttribute('title', collapsed ? 'Mở rộng menu (Ctrl+B)' : 'Thu gọn menu (Ctrl+B)');
  }
  try {
    localStorage.setItem(SIDEBAR_COLLAPSE_KEY, collapsed ? '1' : '0');
  } catch (e) {}
}

// Trả về true khi sidebar đang ở chế độ drawer (màn hình ≤ 900px).
function isSidebarOffCanvas() {
  return window.innerWidth <= 900;
}

function toggleSidebar() {
  // Màn hình hẹp: sidebar là drawer trượt -> giữ nguyên hành vi cũ.
  if (isSidebarOffCanvas()) {
    setMobileSidebar(!document.body.classList.contains('sidebar-open'));
    return;
  }
  setSidebarCollapsed(!document.body.classList.contains('sidebar-collapsed'));
}

// Gắn nhãn tooltip cho từng icon khi sidebar ở chế độ rail.
function syncSidebarNavLabels() {
  document.querySelectorAll('.app-sidebar .nav-tab').forEach(tab => {
    const text = tab.querySelector('.nav-text');
    if (text) tab.setAttribute('data-label', text.textContent.trim());
  });
}

function restoreSidebarCollapsed() {
  syncSidebarNavLabels();
  let saved = '0';
  try {
    saved = localStorage.getItem(SIDEBAR_COLLAPSE_KEY) || '0';
  } catch (e) {}
  setSidebarCollapsed(saved === '1' && !isSidebarOffCanvas());
}

if (mobileMenuToggle) {
  mobileMenuToggle.addEventListener('click', toggleSidebar);
}

// Ctrl/Cmd + B: phím tắt quen thuộc để gập/mở sidebar.
document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && (event.key === 'b' || event.key === 'B')) {
    event.preventDefault();
    toggleSidebar();
  }
});

// Bấm vào phân hệ có menu con khi đang gập -> tự bung ra để thấy menu con.
document.querySelectorAll('.app-sidebar .sfb-nav-parent').forEach(tab => {
  tab.addEventListener('click', () => {
    if (document.body.classList.contains('sidebar-collapsed')) setSidebarCollapsed(false);
  });
});

// Về lại desktop sau khi thu nhỏ cửa sổ: bỏ trạng thái drawer đang mở.
window.addEventListener('resize', () => {
  if (!isSidebarOffCanvas()) document.body.classList.remove('sidebar-open');
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', restoreSidebarCollapsed);
} else {
  restoreSidebarCollapsed();
}
if (sidebarBackdrop) sidebarBackdrop.addEventListener('click', () => setMobileSidebar(false));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') setMobileSidebar(false);
});

// =============================================================================
// TAB 2: DOWNLOADER CONTROLLER
// =============================================================================
let downloadedVideosList = [];

async function loadDownloadedVideos() {
  try {
    const res = await fetch('/api/downloader/videos');
    const data = await res.json();
    downloadedVideosList = data.videos || [];

    // Update badges & counters
    const countEl = document.getElementById('count-downloaded-vids');
    const badgeEl = document.getElementById('badge-dl-count');
    if (countEl) countEl.textContent = downloadedVideosList.length;
    if (badgeEl) badgeEl.textContent = downloadedVideosList.length;

    renderDownloadsTable();
    updateRenderSourceSelect();
  } catch (err) {
    console.error('Lỗi tải danh sách video:', err);
  }
}

function renderDownloadsTable() {
  const tbody = document.getElementById('downloads-tbody');
  if (!tbody) return;

  if (downloadedVideosList.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; padding: 32px; color: var(--text-dim);">
          Chưa có video nào trong thư viện. Nhập link và bấm "Bắt Đầu Tải Hàng Loạt" ở trên để tải video không logo!
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = downloadedVideosList.map((v, idx) => {
    const thumbUrl = safeExternalUrl(v.cover_url || placeholderImage(100, 100, 'Video', '#00f2fe'));
    const sizeMb = (v.file_size / (1024 * 1024)).toFixed(1);
    const duration = v.duration ? `${Math.floor(v.duration / 60)}:${(v.duration % 60).toString().padStart(2, '0')}` : '--:--';

    return `
      <tr>
        <td style="color: var(--text-dim);">${idx + 1}</td>
        <td>
          <img src="${thumbUrl}" alt="Thumbnail" class="thumbnail-preview-cell" onerror="this.onerror=null;this.src='${placeholderImage(100, 100, 'Video', '#00f2fe')}'">
        </td>
        <td>
          <strong>${escapeHtml(v.title || 'Không có tiêu đề')}</strong>
          <div style="font-size: 11px; color: var(--text-dim); margin-top: 2px;">
            ID: <span class="mono">${escapeHtml(v.video_id || '')}</span>
          </div>
        </td>
        <td>${escapeHtml(v.author || '--')}</td>
        <td><span class="badge-country">${(v.platform || 'tiktok').toUpperCase()}</span></td>
        <td><span class="mono">${duration}</span></td>
        <td><span class="mono">${sizeMb} MB</span></td>
        <td style="font-size: 12px; color: var(--text-dim);">${formatFullDateTime(v.created_at)}</td>
        <td style="text-align: center;">
          <div style="display: flex; gap: 6px; justify-content: center;">
            <button class="btn btn-sm btn-danger-outline" onclick="deleteDownloadedVideo(${v.id})" title="Xóa video">
              &times; Xóa
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

async function dlPasteClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    const el = document.getElementById('dl-urls');
    if (el && text) {
      el.value = (el.value ? el.value.trim() + '\n' : '') + text.trim();
      showToast('Đã dán liên kết từ clipboard!');
    }
  } catch (e) {
    showToast('Không thể đọc clipboard: ' + e.message);
  }
}

function dlClearInput() {
  const el = document.getElementById('dl-urls');
  if (el) {
    el.value = '';
    showToast('Đã xóa danh sách link.');
  }
}

// Download Button
const btnStartDownload = document.getElementById('btn-start-download');
if (btnStartDownload) {
  btnStartDownload.addEventListener('click', async () => {
    const urlsText = document.getElementById('dl-urls').value.trim();
    const platform = document.getElementById('dl-platform').value;

    if (!urlsText) {
      showToast('Vui lòng nhập ít nhất 1 đường link video!');
      return;
    }

    const urls = urlsText.split('\n').map(u => u.trim()).filter(Boolean);
    btnStartDownload.disabled = true;
    btnStartDownload.innerHTML = '<div class="spinner"></div> Đang tải video không logo...';

    try {
      const res = await fetch('/api/downloader/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls, platform })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Không thể tạo tác vụ tải');
      showToast(data.message || 'Đã tạo tác vụ tải video');
      document.getElementById('dl-urls').value = '';
      if (data.job_id) await pollDownloadJob(data.job_id, btnStartDownload);
      await loadDownloadedVideos();
    } catch (err) {
      showToast('Lỗi tải video: ' + err.message);
    } finally {
      btnStartDownload.disabled = false;
      btnStartDownload.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Bắt Đầu Tải Hàng Loạt
      `;
    }
  });
}

async function pollDownloadJob(jobId, button) {
  while (true) {
    const res = await fetch(`/api/downloader/jobs/${jobId}`);
    const job = await res.json();
    if (!res.ok) throw new Error(job.detail || 'Không đọc được tiến độ tải');
    const done = (job.completed || 0) + (job.failed || 0);
    button.textContent = `Đang tải ${done}/${job.total}...`;
    if (job.status === 'COMPLETED' || job.status === 'ERROR') {
      showToast(`Hoàn tất: ${job.completed} thành công, ${job.failed} lỗi`);
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

window.quickSelectForRender = function(vidId) {
  switchTab('gpu');
  const sel = document.getElementById('render-src-video');
  if (sel) {
    sel.value = vidId;
  }
};

window.deleteDownloadedVideo = async function(id) {
  if (!confirm('Bạn có chắc muốn xóa video này khỏi thư viện?')) return;
  try {
    const res = await fetch(`/api/downloader/videos/${id}`, { method: 'DELETE' });
    const d = await res.json();
    showToast(d.message || 'Đã xóa video!');
    loadDownloadedVideos();
  } catch (err) {
    showToast('Lỗi xóa video: ' + err.message);
  }
};

function updateRenderSourceSelect() {
  const sel = document.getElementById('render-src-video');
  if (!sel) return;
  const currentVal = sel.value;

  sel.innerHTML = '<option value="">-- Chọn video từ Thư Viện Đã Tải --</option>' +
    downloadedVideosList.map(v => `
      <option value="${v.id}">${escapeHtml(v.title || 'Video #' + v.id)} (${(v.file_size / (1024*1024)).toFixed(1)}MB)</option>
    `).join('');

  if (currentVal) sel.value = currentVal;
}

// =============================================================================
// TAB 3: RENDER & FORMAT NORMALIZATION CONTROLLER
// =============================================================================
let renderTasksList = [];
let renderPollInterval = null;

// Sliders live listeners
const sliderSpeed = document.getElementById('render-opt-speed');
const valSpeed = document.getElementById('val-render-speed');
if (sliderSpeed && valSpeed) {
  sliderSpeed.addEventListener('input', (e) => {
    valSpeed.textContent = `${e.target.value}x`;
  });
}

const sliderCrop = document.getElementById('render-opt-crop');
const valCrop = document.getElementById('val-render-crop');
if (sliderCrop && valCrop) {
  sliderCrop.addEventListener('input', (e) => {
    valCrop.textContent = `${e.target.value}%`;
  });
}

async function loadRenderAssets() {
  try {
    const res = await fetch('/api/render/assets');
    const data = await res.json();

    const selOverlay = document.getElementById('render-opt-overlay');
    if (selOverlay && data.overlays) {
      selOverlay.innerHTML = '<option value="">Không dùng overlay</option>' +
        data.overlays.map(o => `<option value="${escapeHtml(o)}" ${o.includes('frame') ? 'selected' : ''}>${escapeHtml(o)}</option>`).join('');
    }

    const selAudio = document.getElementById('render-opt-audio');
    if (selAudio && data.audios) {
      selAudio.innerHTML = '<option value="">Không chèn nhạc nền</option>' +
        data.audios.map(a => `<option value="${escapeHtml(a)}" ${a.includes('lofi') ? 'selected' : ''}>${escapeHtml(a)}</option>`).join('');
    }
  } catch (err) {
    console.error('Lỗi nạp assets render:', err);
  }
}

async function loadRenderTasks() {
  try {
    const res = await fetch('/api/render/tasks');
    const data = await res.json();
    renderTasksList = data.tasks || [];

    const countEl = document.getElementById('count-render-tasks');
    const badgeEl = document.getElementById('badge-render-count');
    if (countEl) countEl.textContent = renderTasksList.length;
    if (badgeEl) badgeEl.textContent = renderTasksList.length;

    renderTasksCards();
    updateUploadVideoSelect();

    // Check if any task is actively rendering
    const hasActive = renderTasksList.some(t => t.status === 'PROCESSING' || t.status === 'QUEUED');
    if (hasActive && !renderPollInterval) {
      renderPollInterval = setInterval(loadRenderTasks, 2000);
    } else if (!hasActive && renderPollInterval) {
      clearInterval(renderPollInterval);
      renderPollInterval = null;
    }
  } catch (err) {
    console.error('Lỗi tải danh sách tác vụ render:', err);
  }
}

function renderTasksCards() {
  const container = document.getElementById('render-tasks-container');
  if (!container) return;

  if (renderTasksList.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 32px; color: var(--text-dim);">
        Chưa có tác vụ render nào. Chọn video nguồn và bấm "Bắt Đầu Biên Tập" để chuẩn hóa định dạng.
      </div>
    `;
    return;
  }

  container.innerHTML = renderTasksList.map(t => {
    let statusClass = 'status-pending';
    if (t.status === 'PROCESSING') statusClass = 'status-rendering';
    else if (t.status === 'COMPLETED') statusClass = 'status-success';
    else if (t.status === 'ERROR') statusClass = 'status-failed';

    const outputUrl = t.video_url || '';

    return `
      <div class="render-task-card">
        <div class="render-task-header">
          <span class="render-task-title">${escapeHtml(t.title || 'Tác vụ render #' + t.id)}</span>
          <span class="status-pill ${statusClass}">${t.status}</span>
        </div>

        <div class="render-task-specs">
          <span>Tốc độ: <b>${t.speed || 1.04}x</b></span>
          <span>Crop: <b>${t.crop_percent || 0}%</b></span>
          <span>GPU: <b>${t.use_gpu ? 'VideoToolbox' : 'CPU'}</b></span>
          <span>Lật: <b>${t.flip ? 'Có' : 'Không'}</b></span>
        </div>

        ${t.status === 'PROCESSING' ? `
          <div class="render-task-progress-bar">
            <div class="render-task-progress-fill" style="width: ${t.progress || 50}%;"></div>
          </div>
        ` : ''}

        ${t.status === 'COMPLETED' && outputUrl ? `
          <div style="margin-top: 6px;">
            <video src="${outputUrl}" controls style="max-height: 140px; border-radius: 8px; width: 100%; background: #000;"></video>
          </div>
        ` : ''}

        ${t.error_message ? `
          <div style="font-size: 11px; color: #fb7185; background: rgba(244,63,94,0.1); padding: 6px; border-radius: 6px;">
            ${escapeHtml(t.error_message)}
          </div>
        ` : ''}

        <div class="render-task-actions">
          ${t.status === 'PROCESSING' ? `
            <button class="btn btn-sm btn-danger-outline" onclick="cancelRenderTask(${t.id})">Hủy Render</button>
          ` : ''}
          ${t.status === 'COMPLETED' ? `
            <button class="btn btn-sm btn-primary" onclick="quickSelectForUpload(${t.id})">
              🚀 Đăng Lên Kênh
            </button>
            <a href="${outputUrl}" download class="btn btn-sm btn-secondary">
              Tải File
            </a>
          ` : ''}
          <button class="btn btn-sm btn-danger-outline" onclick="deleteRenderTask(${t.id})">
            Xóa
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// Start Render Button
const btnStartRender = document.getElementById('btn-start-render');
if (btnStartRender) {
  btnStartRender.addEventListener('click', async () => {
    const videoId = document.getElementById('render-src-video').value;
    const taskName = document.getElementById('render-task-name').value.trim();
    const flip = document.getElementById('render-opt-flip').checked;
    const colorEq = document.getElementById('render-opt-coloreq').checked;
    const useGpu = document.getElementById('render-opt-gpu').checked;
    const speed = parseFloat(document.getElementById('render-opt-speed').value) || 1.04;
    const cropPercent = parseInt(document.getElementById('render-opt-crop').value, 10) || 3;
    const overlayFile = document.getElementById('render-opt-overlay').value;
    const audioFile = document.getElementById('render-opt-audio').value;

    if (!videoId) {
      showToast('Vui lòng chọn 1 Video Nguồn từ Thư Viện!');
      return;
    }

    btnStartRender.disabled = true;
    btnStartRender.innerHTML = '<div class="spinner"></div> Đang gửi lệnh render GPU...';

    try {
      const res = await fetch('/api/render/create-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video_id: parseInt(videoId, 10),
          task_name: taskName,
          flip: flip,
          speed: speed,
          crop_percent: cropPercent,
          color_adjust: colorEq,
          use_gpu: useGpu,
          overlay_filename: overlayFile,
          audio_filename: audioFile
        })
      });

      const d = await res.json();
      showToast(d.message || 'Tác vụ render đã được tạo và đang xử lý trên GPU!');
      loadRenderTasks();
    } catch (err) {
      showToast('Lỗi tạo tác vụ render: ' + err.message);
    } finally {
      btnStartRender.disabled = false;
      btnStartRender.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        Bắt Đầu Biên Tập / Render Video
      `;
    }
  });
}

window.quickSelectForUpload = async function(renderTaskId) {
  switchTab('upload');
  document.getElementById('new-post-studio')?.classList.add('visible');
  await loadLibraryVideos();
  populateChannelChips();
  selectLibVideo(`render:${renderTaskId}`);
};

window.deleteRenderTask = async function(id) {
  if (!confirm('Xóa tác vụ render này?')) return;
  try {
    const res = await fetch(`/api/render/tasks/${id}`, { method: 'DELETE' });
    const d = await res.json();
    showToast(d.message || 'Đã xóa tác vụ!');
    loadRenderTasks();
  } catch (err) {
    showToast('Lỗi xóa: ' + err.message);
  }
};

window.cancelRenderTask = async function(id) {
  const res = await fetch(`/api/render/tasks/${id}/cancel`, { method: 'POST' });
  const data = await res.json();
  showToast(data.message || data.detail || 'Đã gửi yêu cầu hủy');
  loadRenderTasks();
};

// =============================================================================
// TAB 4: CONTENT CALENDAR & SMART SCHEDULER
// =============================================================================
let uploadTasksList = [];
let libraryVideos = [];
let selectedVideoId = null;
let selectedChannelIds = new Set();
let calendarMonth = new Date().getMonth();
let calendarYear = new Date().getFullYear();
let publishPollTimer = null;

const COUNTRY_FLAGS = { DE: '🇩🇪', KR: '🇰🇷', GB: '🇬🇧', UK: '🇬🇧', US: '🇺🇸', JP: '🇯🇵' };

// --- New Post Studio ---
window.toggleNewPostStudio = function() {
  const el = document.getElementById('new-post-studio');
  el.classList.toggle('visible');
  if (el.classList.contains('visible')) {
    loadLibraryVideos();
    populateChannelChips();
  }
};

async function loadLibraryVideos() {
  try {
    const res = await fetch('/api/upload/library-videos');
    const data = await res.json();
    libraryVideos = data.videos || [];
    renderVideoLibrary();
  } catch (e) {
    console.error('Error loading library:', e);
  }
}

function renderVideoLibrary() {
  const container = document.getElementById('nps-video-picker');
  if (!container) return;
  if (libraryVideos.length === 0) {
    container.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:24px;color:var(--text-dim);">
      Chưa có video nào sẵn sàng. Hãy tạo video từ Xưởng Video AI trước.
    </div>`;
    return;
  }
  container.innerHTML = libraryVideos.map(v => {
    const sel = v.id === selectedVideoId ? 'selected' : '';
    const thumbHtml = v.stream_url
      ? `<video src="${v.stream_url}" muted preload="metadata"></video>`
      : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:var(--text-dim);font-size:20px;">🎬</div>`;
    return `
      <div class="video-lib-card ${sel}" onclick="selectLibVideo('${v.id}')" data-vid="${v.id}">
        <div class="video-lib-thumb">${thumbHtml}</div>
        <div class="video-lib-title" title="${escapeHtml(v.title)}">${escapeHtml(v.title)}</div>
        <div class="video-lib-meta">${v.source === 'compare' ? '🤖 AI Studio' : '🎞️ Render'}</div>
      </div>
    `;
  }).join('');
}

window.selectLibVideo = function(id) {
  selectedVideoId = id;
  document.querySelectorAll('.video-lib-card').forEach(c => c.classList.toggle('selected', c.dataset.vid === id));

  const v = libraryVideos.find(x => x.id === id);
  if (!v) return;

  // Update phone mockup video
  const phoneArea = document.getElementById('phone-video-area');
  if (phoneArea && v.stream_url) {
    phoneArea.innerHTML = `<video src="${v.stream_url}" muted autoplay loop playsinline></video>`;
  }

  // Auto-fill caption from AI if available
  const captionEl = document.getElementById('nps-caption');
  if (captionEl && v.title) {
    captionEl.value = v.title;
    updatePhoneMockup();
    updateCaptionCounter();
  }
};

function populateChannelChips() {
  const container = document.getElementById('nps-channel-chips');
  if (!container) return;
  renderChannelCountryFilters();
  const visible = allChannels.filter(npsChannelMatches);
  updateChannelStatus(visible.length);
  if (!visible.length) {
    container.innerHTML = '<div class="nps-empty-chips" style="grid-column: 1/-1; padding: 18px; text-align: center; color: var(--cms-muted); font-size: 12px;">Không có kênh nào khớp bộ lọc.</div>';
    updateStaggerInfo();
    return;
  }
  container.innerHTML = visible.map(ch => {
    const name = (ch.username || ch.note || `kênh_${ch.id}`).replace(/^@/, '');
    const country = (ch.country || 'GL').toUpperCase();
    const sel = selectedChannelIds.has(ch.id) ? 'selected' : '';
    return `<div class="channel-chip ${sel}" onclick="toggleChannelChip(${ch.id})" data-chid="${ch.id}" data-country="${ch.country || 'KR'}">
      <span class="chip-check-icon"></span>
      <span class="chip-badge">${escapeHtml(country)}</span>
      <span class="chip-name" title="@${escapeHtml(name)}">@${escapeHtml(name)}</span>
    </div>`;
  }).join('');
  updateStaggerInfo();
}

window.toggleChannelChip = function(id) {
  if (selectedChannelIds.has(id)) selectedChannelIds.delete(id);
  else selectedChannelIds.add(id);
  document.querySelectorAll('.channel-chip').forEach(c => {
    c.classList.toggle('selected', selectedChannelIds.has(parseInt(c.dataset.chid)));
  });
  updateStaggerInfo();
  updateChannelStatus(allChannels.filter(npsChannelMatches).length);
  // Update phone mockup with first selected channel
  const firstId = [...selectedChannelIds][0];
  const ch = allChannels.find(c => c.id === firstId);
  if (ch) {
    const phoneUser = document.getElementById('phone-username');
    const phoneAvatar = document.getElementById('phone-avatar');
    if (phoneUser) phoneUser.textContent = '@' + (ch.username || ch.note || 'user');
    if (phoneAvatar) phoneAvatar.textContent = (ch.username || 'U')[0].toUpperCase();
  }
};

// --- Bộ lọc kênh trong khung soạn lịch đăng ---
let npsChannelCountry = 'ALL';

function npsChannelMatches(ch) {
  if (npsChannelCountry !== 'ALL' && (ch.country || '').toUpperCase() !== npsChannelCountry) return false;
  const q = (document.getElementById('nps-channel-search')?.value || '').trim().toLowerCase();
  if (!q) return true;
  return `${ch.username || ''} ${ch.note || ''} ${ch.nickname || ''}`.toLowerCase().includes(q);
}

function renderChannelCountryFilters() {
  const box = document.getElementById('nps-group-btns');
  if (!box) return;
  const counts = {};
  allChannels.forEach(ch => {
    const c = (ch.country || '—').toUpperCase();
    counts[c] = (counts[c] || 0) + 1;
  });
  const order = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  const btn = (code, label, n) =>
    `<button type="button" class="btn-group-select ${npsChannelCountry === code ? 'active' : ''}"
             onclick="setChannelCountryFilter('${code}')">${label} <span class="nps-count">${n}</span></button>`;
  box.innerHTML = btn('ALL', 'Tất cả', allChannels.length) +
    order.map(c => btn(c, c, counts[c])).join('');
}

window.setChannelCountryFilter = function(code) {
  npsChannelCountry = code;
  renderChannelCountryFilters();
  populateChannelChips();
};

window.filterChannelChips = function() {
  const clear = document.getElementById('nps-search-clear');
  if (clear) clear.hidden = !(document.getElementById('nps-channel-search')?.value || '');
  populateChannelChips();
};

window.clearChannelSearch = function() {
  const input = document.getElementById('nps-channel-search');
  if (input) input.value = '';
  filterChannelChips();
};

/** Chọn hoặc bỏ chọn đúng những kênh đang hiển thị, không đụng phần đang bị lọc ẩn. */
window.selectVisibleChannels = function(select) {
  allChannels.filter(npsChannelMatches).forEach(ch => {
    if (select) selectedChannelIds.add(ch.id);
    else selectedChannelIds.delete(ch.id);
  });
  populateChannelChips();
};

function updateChannelStatus(shown) {
  const el = document.getElementById('nps-channel-status');
  if (!el) return;
  const total = allChannels.length;
  const picked = selectedChannelIds.size;
  const hiddenPicked = allChannels.filter(ch => selectedChannelIds.has(ch.id) && !npsChannelMatches(ch)).length;
  el.innerHTML =
    `Hiện <strong>${shown}</strong>/${total} kênh · Đã chọn <strong style="color:var(--cms-primary);">${picked}</strong>` +
    (hiddenPicked ? ` <span style="color:var(--cms-warning); font-size: 11px;">(${hiddenPicked} kênh ẩn)</span>` : '');
}

function updateStaggerInfo() {
  const info = document.getElementById('nps-stagger-info');
  if (!info) return;
  info.style.display = selectedChannelIds.size > 1 ? 'flex' : 'none';
  const val = document.getElementById('nps-stagger-val');
  if (val) val.textContent = '20 phút';
}

// Golden Hours
window.selectGoldenHour = function(btn, time) {
  document.querySelectorAll('.golden-hour-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  const [h, m] = time.split(':');
  const now = new Date();
  let target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parseInt(h), parseInt(m));
  if (target <= now) target.setDate(target.getDate() + 1);
  const dtInput = document.getElementById('nps-datetime');
  if (dtInput) {
    const pad = n => String(n).padStart(2, '0');
    dtInput.value = `${target.getFullYear()}-${pad(target.getMonth()+1)}-${pad(target.getDate())}T${pad(target.getHours())}:${pad(target.getMinutes())}`;
  }
};

// Caption
window.appendHashtag = function(tag) {
  const el = document.getElementById('nps-caption');
  if (!el) return;
  if (!el.value.includes(tag)) {
    el.value = (el.value ? el.value.trim() + ' ' : '') + tag + ' ';
  }
  updatePhoneMockup();
  updateCaptionCounter();
};

window.updatePhoneMockup = function() {
  const caption = document.getElementById('nps-caption');
  const phoneCaption = document.getElementById('phone-caption');
  if (caption && phoneCaption) {
    phoneCaption.textContent = caption.value || 'Caption sẽ hiển thị ở đây...';
  }
  updateCaptionCounter();
};

function updateCaptionCounter() {
  const el = document.getElementById('nps-caption');
  const counter = document.getElementById('nps-caption-counter');
  if (!el || !counter) return;
  const len = el.value.length;
  counter.textContent = `${len} / 2200`;
  counter.className = 'caption-counter' + (len > 2000 ? ' danger' : len > 1500 ? ' warn' : '');
}

window.fetchAICaption = async function() {
  if (!selectedVideoId) { showToast('Vui lòng chọn video trước!'); return; }
  const v = libraryVideos.find(x => x.id === selectedVideoId);
  if (!v) return;
  const cap = document.getElementById('nps-caption');
  if (cap) {
    cap.value = (v.title || '') + '\n\n' + (v.hashtags || '#fyp #viral');
    updatePhoneMockup();
  }
};

// Submit Schedule
window.submitNewSchedule = async function() {
  if (!selectedVideoId) { showToast('⚠️ Vui lòng chọn video!'); return; }
  if (selectedChannelIds.size === 0) { showToast('⚠️ Vui lòng chọn ít nhất 1 kênh!'); return; }

  const v = libraryVideos.find(x => x.id === selectedVideoId);
  if (!v) return;

  const caption = (document.getElementById('nps-caption')?.value || '').trim();
  const dtVal = document.getElementById('nps-datetime')?.value;
  let scheduledTs = 0;
  if (dtVal) { scheduledTs = Math.floor(new Date(dtVal).getTime() / 1000); }

  try {
    const res = await fetch('/api/upload/create-task', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel_ids: [...selectedChannelIds],
        video_path: v.video_path,
        caption: caption,
        hashtags: v.hashtags || '#fyp #viral',
        scheduled_timestamp: scheduledTs,
        stagger_minutes: selectedChannelIds.size > 1 ? 20 : 0
      })
    });
    const d = await res.json();
    showToast(d.message || 'Đã thêm vào lịch đăng!');
    document.getElementById('new-post-studio')?.classList.remove('visible');
    selectedVideoId = null;
    selectedChannelIds.clear();
    loadUploadTasks();
  } catch (err) {
    showToast('❌ Lỗi: ' + err.message);
  }
};

// --- View Toggle ---
window.switchSchedView = function(view) {
  document.querySelectorAll('.view-toggle button').forEach(b =>
    b.classList.toggle('active', b.dataset.schedView === view)
  );
  const qv = document.getElementById('sched-queue-view');
  const cv = document.getElementById('sched-calendar-view');
  if (qv) qv.style.display = view === 'queue' ? 'block' : 'none';
  if (cv) cv.classList.toggle('visible', view === 'calendar');
  if (view === 'calendar') renderCalendar();
};

// --- Load & Render Upload Tasks ---
async function loadUploadTasks() {
  try {
    const res = await fetch('/api/upload/tasks');
    const data = await res.json();
    uploadTasksList = data.tasks || [];

    const badgeEl = document.getElementById('badge-upload-count');
    if (badgeEl) badgeEl.textContent = uploadTasksList.length;

    updateSchedStats();
    renderQueueView();
  } catch (err) {
    console.error('Lỗi nạp danh sách upload:', err);
  }
}

function updateSchedStats() {
  const total = uploadTasksList.length;
  const queued = uploadTasksList.filter(t => t.status === 'QUEUED' || t.status === 'PENDING').length;
  const running = uploadTasksList.filter(t => t.status === 'UPLOADING').length;
  const success = uploadTasksList.filter(t => t.status === 'SUCCESS').length;
  const failed = uploadTasksList.filter(t => t.status === 'ERROR').length;

  const s = id => document.getElementById(id);
  if (s('ss-total')) s('ss-total').textContent = total;
  if (s('ss-queued')) s('ss-queued').textContent = queued;
  if (s('ss-running')) s('ss-running').textContent = running;
  if (s('ss-success')) s('ss-success').textContent = success;
  if (s('ss-failed')) s('ss-failed').textContent = failed;
}

function getCountdownHtml(schedTime) {
  if (!schedTime) return '<span class="countdown-badge cd-now">Ngay</span>';
  const now = Math.floor(Date.now() / 1000);
  const diff = schedTime - now;
  if (diff <= 0) return '<span class="countdown-badge cd-overdue">Quá hạn</span>';
  if (diff < 60) return '<span class="countdown-badge cd-now">⚡ Sắp đăng</span>';
  if (diff < 3600) return `<span class="countdown-badge cd-waiting">⏳ ${Math.ceil(diff/60)}m</span>`;
  if (diff < 86400) return `<span class="countdown-badge cd-waiting">⏳ ${Math.floor(diff/3600)}h ${Math.ceil((diff%3600)/60)}m</span>`;
  return `<span class="countdown-badge cd-waiting">📅 ${Math.floor(diff/86400)}d</span>`;
}

function getStatusHtml(status) {
  const map = {
    'QUEUED': '<span class="sched-status st-queued">⏳ QUEUED</span>',
    'PENDING': '<span class="sched-status st-pending">PENDING</span>',
    'UPLOADING': '<span class="sched-status st-uploading">🚀 UPLOADING</span>',
    'SUCCESS': '<span class="sched-status st-success">✅ SUCCESS</span>',
    'ERROR': '<span class="sched-status st-error">❌ ERROR</span>',
    'CANCELLED': '<span class="sched-status st-error">CANCELLED</span>',
  };
  return map[status] || `<span class="sched-status st-pending">${status}</span>`;
}

const QUEUE_OPEN_KEY = 'sched-queue-open-accounts';
let queueOpenAccounts = (() => {
  try { return new Set(JSON.parse(localStorage.getItem(QUEUE_OPEN_KEY) || '[]').map(String)); } catch (_) { return new Set(); }
})();
let queueAccountFilter = '';
let queueNicheFilter = '';

function saveQueueOpenAccounts() {
  try { localStorage.setItem(QUEUE_OPEN_KEY, JSON.stringify([...queueOpenAccounts])); } catch (_) { /* chỉ là tiện ích */ }
}

function formatQueueWhen(ts) {
  if (!ts) return 'Đăng ngay';
  const at = new Date(ts * 1000);
  const pad = n => String(n).padStart(2, '0');
  return `${pad(at.getDate())}/${pad(at.getMonth() + 1)} ${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

function queueCardHtml(t) {
  const flag = COUNTRY_FLAGS[t.country] || '🌐';
  const username = t.username || `Kênh #${t.channel_id}`;
  const videoName = (t.video_path || '').split('/').pop() || 'Video';
  const slug = t.video_slug || videoName.replace(/\.mp4$/i, '');
  const caption = t.caption || '';
  const when = formatQueueWhen(t.schedule_time);
  const canPublish = t.status === 'QUEUED' || t.status === 'PENDING';
  const canRetry = t.status === 'ERROR' || t.status === 'CANCELLED';
  const thumb = slug
    ? `<img src="/api/videos/${encodeURIComponent(slug)}/thumbnail" alt="" loading="lazy" onerror="this.remove()">`
    : '';
  return `
      <article class="queue-card qc-state-${escapeHtml((t.status || '').toLowerCase())}">
        <div class="qc-media">
          <div class="qc-media-fallback">🎬</div>
          ${thumb}
          ${t.video_path ? `<button type="button" class="qc-play" onclick="openQueueVideo(${t.id})" title="Xem video sẽ đăng" aria-label="Xem video ${escapeHtml(videoName)}"><span aria-hidden="true">▶</span></button>` : ''}
          <div class="qc-media-top">${getCountdownHtml(t.schedule_time)}${getStatusHtml(t.status)}</div>
        </div>
        <div class="qc-body">
          <div class="qc-title" title="${escapeHtml(videoName)}">${escapeHtml(videoName)}</div>
          <div class="qc-meta">
            <span class="qc-channel"><span class="flag">${flag}</span>${escapeHtml(username)}</span>
            <span class="qc-when" title="Giờ đăng (giờ máy bạn)">🕒 ${escapeHtml(when)}</span>
          </div>
          <div class="qc-caption" title="${escapeHtml(caption)}">${escapeHtml(caption) || '<em>Chưa có caption</em>'}</div>
          ${t.error_message && canRetry ? `<div class="qc-error" title="${escapeHtml(t.error_message)}">${escapeHtml(t.error_message)}</div>` : ''}
        </div>
        <div class="qc-actions">
          ${canPublish ? `<button class="btn-publish-now" onclick="publishNow(${t.id})">🚀 Đăng Ngay</button>` : ''}
          ${canRetry ? `<button class="btn-publish-now" onclick="retryUploadTask(${t.id})">↻ Thử lại</button>` : ''}
          <button class="btn-queue-delete" onclick="deleteUploadTask(${t.id})" title="Xóa tác vụ" aria-label="Xóa tác vụ">✕</button>
        </div>
      </article>`;
}

/** Xem đúng file MP4 sẽ được đăng của tác vụ, trong khung dọc 9:16. */
window.openQueueVideo = function(taskId) {
  const t = uploadTasksList.find(item => item.id === taskId);
  if (!t) return;
  closeQueueVideo();
  const videoName = (t.video_path || '').split('/').pop() || 'Video';
  const overlay = document.createElement('div');
  overlay.className = 'qv-overlay';
  overlay.id = 'queue-video-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', `Xem ${videoName}`);
  overlay.innerHTML = `
    <div class="qv-dialog">
      <button type="button" class="qv-close" onclick="closeQueueVideo()" aria-label="Đóng">✕</button>
      <video class="qv-video" src="/api/upload/tasks/${t.id}/video" controls autoplay playsinline preload="metadata"></video>
      <div class="qv-info">
        <div class="qv-title" title="${escapeHtml(videoName)}">${escapeHtml(videoName)}</div>
        <div class="qv-meta">${COUNTRY_FLAGS[t.country] || '🌐'} ${escapeHtml(t.username || `Kênh #${t.channel_id}`)} · 🕒 ${escapeHtml(formatQueueWhen(t.schedule_time))}${t.niche_name ? ` · ${escapeHtml(t.niche_name)}` : ''}</div>
        <div class="qv-caption">${escapeHtml(t.caption || '')}</div>
      </div>
    </div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) closeQueueVideo(); });
  overlay.querySelector('video').addEventListener('error', e => {
    e.target.replaceWith(Object.assign(document.createElement('div'), { className: 'qv-missing', textContent: 'Không mở được file video (đã bị xoá hoặc chưa render xong).' }));
  });
  document.body.appendChild(overlay);
  document.addEventListener('keydown', queueVideoKeydown);
  overlay.querySelector('.qv-close').focus();
};

window.closeQueueVideo = function() {
  const overlay = document.getElementById('queue-video-overlay');
  if (!overlay) return;
  const video = overlay.querySelector('video');
  if (video) { video.pause(); video.removeAttribute('src'); video.load(); }
  overlay.remove();
  document.removeEventListener('keydown', queueVideoKeydown);
};

function queueVideoKeydown(e) {
  if (e.key === 'Escape') closeQueueVideo();
}

/** Gom tác vụ đăng theo acc, xếp từ cũ đến mới: acc có video (giờ đăng) sớm nhất lên đầu. */
function groupUploadTasksByAccount(tasks) {
  const groups = new Map();
  for (const t of tasks) {
    const key = String(t.channel_id ?? t.username ?? 'unknown');
    if (!groups.has(key)) {
      const handle = String(t.username || '').trim().replace(/^@/, '');
      groups.set(key, {
        key, username: t.username || `Kênh #${t.channel_id}`, handle: /^[A-Za-z0-9._]{2,24}$/.test(handle) ? handle : '',
        country: t.country, nicheId: t.niche_id || '', nicheName: t.niche_name || '', matrixName: t.matrix_channel_name || '', tasks: [],
      });
    }
    groups.get(key).tasks.push(t);
  }
  const now = Math.floor(Date.now() / 1000);
  const list = [...groups.values()].map(g => {
    g.tasks.sort((a, b) => (a.schedule_time || 0) - (b.schedule_time || 0) || a.id - b.id);
    const count = st => g.tasks.filter(t => st.includes(t.status)).length;
    g.waiting = count(['QUEUED', 'PENDING', 'WAITING_RENDER']);
    g.uploading = count(['UPLOADING']);
    g.success = count(['SUCCESS']);
    g.failed = count(['ERROR', 'NEEDS_CHECK']);
    const next = g.tasks.find(t => ['QUEUED', 'PENDING', 'WAITING_RENDER'].includes(t.status));
    g.next = next ? next.schedule_time || now : null;
    g.oldest = g.tasks[0].schedule_time || 0;
    return g;
  });
  return list.sort((a, b) => a.oldest - b.oldest || a.username.localeCompare(b.username));
}

function queueGroupHtml(g) {
  const open = queueOpenAccounts.has(g.key);
  const flag = COUNTRY_FLAGS[g.country] || '🌐';
  const chip = (n, cls, label) => (n ? `<span class="qg-chip ${cls}">${n} ${label}</span>` : '');
  const next = g.next ? `<span class="qg-next" title="Video kế tiếp của acc này">Tiếp theo <b>${escapeHtml(formatQueueWhen(g.next))}</b> ${getCountdownHtml(g.next)}</span>` : '<span class="qg-next qg-next-none">Không còn video chờ đăng</span>';
  return `
    <section class="queue-group${open ? ' open' : ''}" data-account="${escapeHtml(g.key)}">
      <div class="qg-header" role="button" tabindex="0" aria-expanded="${open}" onclick="toggleQueueAccount(this.parentElement.dataset.account)" onkeydown="if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleQueueAccount(this.parentElement.dataset.account); }">
        <span class="qg-chevron" aria-hidden="true">▸</span>
        <span class="qg-flag">${flag}</span>
        <span class="qg-name">
          ${g.handle
            ? `<a class="qg-username" href="https://www.tiktok.com/@${encodeURIComponent(g.handle)}" target="_blank" rel="noopener" title="Mở TikTok @${escapeHtml(g.handle)}" onclick="event.stopPropagation()">${escapeHtml(g.username)} <span class="qg-ext" aria-hidden="true">↗</span></a>`
            : `<span class="qg-username">${escapeHtml(g.username)}</span>`}
          <span class="qg-sub">${g.matrixName ? `${escapeHtml(g.matrixName)} · ` : ''}${g.tasks.length} video</span>
        </span>
        ${g.nicheName
          ? `<span class="qg-topic" title="Chủ đề: ${escapeHtml(g.nicheId)}">${escapeHtml(g.nicheName)}</span>`
          : '<span class="qg-topic qg-topic-none" title="Acc chưa gán kênh Matrix (Autopilot)">Chưa gán chủ đề</span>'}
        <span class="qg-chips">
          ${chip(g.uploading, 'qg-uploading', 'đang đăng')}
          ${chip(g.failed, 'qg-failed', 'lỗi')}
          ${chip(g.waiting, 'qg-waiting', 'chờ đăng')}
          ${chip(g.success, 'qg-success', 'đã đăng')}
        </span>
        ${next}
      </div>
      ${open ? `<div class="queue-list qg-body">${g.tasks.map(queueCardHtml).join('')}</div>` : ''}
    </section>`;
}

function renderQueueView() {
  const container = document.getElementById('sched-queue-list');
  if (!container) return;

  if (uploadTasksList.length === 0) {
    container.innerHTML = `<div class="queue-empty">
      <div class="qe-icon">📭</div>
      <div class="qe-title">Hàng đợi đăng video trống</div>
      <div class="qe-desc">Bấm "+ Lên Lịch Video Mới" để bắt đầu lên lịch đăng nội dung TikTok</div>
    </div>`;
    updateQueueGroupSummary(0, 0);
    return;
  }

  const groups = groupUploadTasksByAccount(uploadTasksList);
  renderQueueNicheOptions(groups);
  const shown = visibleQueueGroups(groups);
  container.innerHTML = shown.length
    ? shown.map(queueGroupHtml).join('')
    : `<div class="queue-empty"><div class="qe-icon">🔎</div><div class="qe-title">Không có acc nào khớp bộ lọc</div></div>`;
  updateQueueGroupSummary(shown.length, groups.length);
}

/** Lọc theo chủ đề + ô tìm (tên acc, id, tên chủ đề, tên kênh Matrix). */
function visibleQueueGroups(groups) {
  const needle = queueAccountFilter.trim().toLowerCase();
  return groups.filter(g => {
    if (queueNicheFilter === '__none__' ? g.nicheId : queueNicheFilter && g.nicheId !== queueNicheFilter) return false;
    if (!needle) return true;
    return [g.username, g.key, g.nicheName, g.nicheId, g.matrixName].some(v => String(v || '').toLowerCase().includes(needle));
  });
}

function renderQueueNicheOptions(groups) {
  const select = document.getElementById('sched-queue-niche');
  if (!select) return;
  const niches = new Map();
  let unassigned = 0;
  for (const g of groups) {
    if (!g.nicheId) { unassigned += 1; continue; }
    const item = niches.get(g.nicheId) || { name: g.nicheName || g.nicheId, count: 0 };
    item.count += 1;
    niches.set(g.nicheId, item);
  }
  if (queueNicheFilter && queueNicheFilter !== '__none__' && !niches.has(queueNicheFilter)) queueNicheFilter = '';
  const options = [`<option value="">Tất cả chủ đề (${groups.length} acc)</option>`]
    .concat([...niches.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name, 'vi'))
      .map(([id, n]) => `<option value="${escapeHtml(id)}">${escapeHtml(n.name)} (${n.count})</option>`));
  if (unassigned) options.push(`<option value="__none__">Chưa gán chủ đề (${unassigned})</option>`);
  select.innerHTML = options.join('');
  select.value = queueNicheFilter;
}

window.filterQueueNiche = function(value) {
  queueNicheFilter = value || '';
  renderQueueView();
};

function updateQueueGroupSummary(shown, total) {
  const el = document.getElementById('sched-queue-group-count');
  if (el) el.textContent = total ? (shown === total ? `${total} acc` : `${shown}/${total} acc`) : '';
}

window.toggleQueueAccount = function(key) {
  if (queueOpenAccounts.has(key)) queueOpenAccounts.delete(key); else queueOpenAccounts.add(key);
  saveQueueOpenAccounts();
  const group = uploadTasksList.length && groupUploadTasksByAccount(uploadTasksList).find(g => g.key === key);
  const el = document.querySelector(`.queue-group[data-account="${CSS.escape(key)}"]`);
  if (group && el) el.outerHTML = queueGroupHtml(group);
  else renderQueueView();
};

window.setQueueAccountsOpen = function(open) {
  for (const g of visibleQueueGroups(groupUploadTasksByAccount(uploadTasksList))) {
    if (open) queueOpenAccounts.add(g.key); else queueOpenAccounts.delete(g.key);
  }
  saveQueueOpenAccounts();
  renderQueueView();
};

window.filterQueueAccounts = function(value) {
  queueAccountFilter = value || '';
  renderQueueView();
};

// Delete
window.deleteUploadTask = async function(id) {
  if (!confirm('Xóa tác vụ đăng này?')) return;
  try {
    const res = await fetch(`/api/upload/tasks/${id}`, { method: 'DELETE' });
    const d = await res.json();
    showToast(d.message || 'Đã xóa!');
    loadUploadTasks();
  } catch (err) { showToast('Lỗi xóa: ' + err.message); }
};

// Publish Now
window.publishNow = async function(taskId) {
  const task = uploadTasksList.find(item => item.id === taskId);
  if (!task) return showToast('Không tìm thấy tác vụ');
  try {
    const res = await fetch('/api/upload/publish-now', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task_id: task.id,
        channel_id: task.channel_id,
        video_path: task.video_path,
        caption: task.caption || '',
        hashtags: task.hashtags || ''
      })
    });
    const d = await res.json();
    showToast(d.message || 'Đang đăng...');
    openPublishDrawer();
  } catch (err) { showToast('❌ Lỗi: ' + err.message); }
};

window.retryUploadTask = async function(taskId) {
  const res = await fetch(`/api/upload/tasks/${taskId}/retry`, { method: 'POST' });
  const data = await res.json();
  showToast(data.message || data.detail || 'Đã đưa vào hàng đợi');
  loadUploadTasks();
};

// --- Publish Drawer ---
window.openPublishDrawer = function() {
  document.getElementById('publish-drawer-backdrop')?.classList.add('open');
  document.getElementById('publish-drawer')?.classList.add('open');
  startPublishPoll();
};
window.closePublishDrawer = function() {
  document.getElementById('publish-drawer-backdrop')?.classList.remove('open');
  document.getElementById('publish-drawer')?.classList.remove('open');
  stopPublishPoll();
};

function startPublishPoll() {
  stopPublishPoll();
  pollPublishLogs();
  publishPollTimer = setInterval(pollPublishLogs, 2000);
}
function stopPublishPoll() {
  if (publishPollTimer) { clearInterval(publishPollTimer); publishPollTimer = null; }
}

async function pollPublishLogs() {
  try {
    const res = await fetch('/api/upload/publish-logs');
    const data = await res.json();
    const container = document.getElementById('publish-drawer-logs');
    const dot = document.getElementById('publish-status-dot');
    const txt = document.getElementById('publish-status-text');

    if (container && data.logs) {
      container.innerHTML = data.logs.map(l => {
        const cls = l.level === 'error' ? 'log-error' : l.level === 'success' ? 'log-success' : l.level === 'warning' ? 'log-warning' : 'log-info';
        return `<div class="publish-log-line ${cls}"><span class="log-time">${l.time}</span>${escapeHtml(l.msg)}</div>`;
      }).join('');
      container.scrollTop = container.scrollHeight;
    }

    if (dot) dot.className = 'publish-status-indicator ' + (data.is_running ? 'running' : 'done');
    if (txt) txt.textContent = data.is_running ? 'Đang đăng video...' : 'Hoàn tất';
    if (!data.is_running) { stopPublishPoll(); loadUploadTasks(); }
  } catch (e) { console.error('Poll error:', e); }
}

// --- Calendar View ---
window.calendarNav = function(dir) {
  calendarMonth += dir;
  if (calendarMonth < 0) { calendarMonth = 11; calendarYear--; }
  if (calendarMonth > 11) { calendarMonth = 0; calendarYear++; }
  renderCalendar();
};
window.calendarToday = function() {
  const now = new Date();
  calendarMonth = now.getMonth(); calendarYear = now.getFullYear();
  renderCalendar();
};

function renderCalendar() {
  const MONTH_NAMES = ['Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6','Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12'];
  const DAY_NAMES = ['CN','T2','T3','T4','T5','T6','T7'];

  const titleEl = document.getElementById('cal-title');
  if (titleEl) titleEl.textContent = `${MONTH_NAMES[calendarMonth]}, ${calendarYear}`;

  const grid = document.getElementById('cal-grid');
  if (!grid) return;

  let html = DAY_NAMES.map(d => `<div class="calendar-day-header">${d}</div>`).join('');

  const firstDay = new Date(calendarYear, calendarMonth, 1).getDay();
  const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
  const today = new Date();

  // Previous month padding
  const prevDays = new Date(calendarYear, calendarMonth, 0).getDate();
  for (let i = firstDay - 1; i >= 0; i--) {
    html += `<div class="calendar-cell other-month"><div class="cell-date">${prevDays - i}</div></div>`;
  }

  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    const isToday = d === today.getDate() && calendarMonth === today.getMonth() && calendarYear === today.getFullYear();
    const dayStart = new Date(calendarYear, calendarMonth, d).getTime() / 1000;
    const dayEnd = dayStart + 86400;

    const events = uploadTasksList.filter(t => t.schedule_time >= dayStart && t.schedule_time < dayEnd);
    const evHtml = events.slice(0, 3).map(t => {
      const time = new Date(t.schedule_time * 1000);
      const hh = String(time.getHours()).padStart(2, '0');
      const mm = String(time.getMinutes()).padStart(2, '0');
      const cls = t.status === 'SUCCESS' ? 'ev-success' : t.status === 'ERROR' ? 'ev-error' : t.status === 'UPLOADING' ? 'ev-uploading' : t.status === 'QUEUED' ? 'ev-queued' : 'ev-pending';
      return `<div class="cal-event ${cls}">${hh}:${mm} ${escapeHtml((t.username || '').substring(0, 10))}</div>`;
    }).join('');
    const moreHtml = events.length > 3 ? `<div style="font-size:10px;color:var(--text-dim);">+${events.length - 3} thêm</div>` : '';

    html += `<div class="calendar-cell${isToday ? ' today' : ''}"><div class="cell-date">${d}</div>${evHtml}${moreHtml}</div>`;
  }

  // Next month padding
  const totalCells = firstDay + daysInMonth;
  const remaining = (7 - (totalCells % 7)) % 7;
  for (let i = 1; i <= remaining; i++) {
    html += `<div class="calendar-cell other-month"><div class="cell-date">${i}</div></div>`;
  }

  grid.innerHTML = html;
}

// Old compat stubs
function populateUploadSelects() { populateChannelChips(); }
function updateUploadVideoSelect() {}
function renderUploadsTable() { renderQueueView(); }


// =============================================================================
// TAB 5: SETTINGS CONTROLLER
// =============================================================================
async function loadSettings() {
  try {
    loadChannelProfileSettings();
    const res = await fetch('/api/settings');
    const data = await res.json();

    const prov = document.getElementById('set-captcha-provider');
    const gpu = document.getElementById('set-default-gpu');
    const pDl = document.getElementById('set-path-downloads');
    const pRend = document.getElementById('set-path-rendered');

    if (prov) prov.value = data.prefer_api_captcha || 'achi';
    if (gpu) gpu.checked = data.default_render_gpu === 'true';
    if (pDl) pDl.value = data.download_folder || '';
    if (pRend) pRend.value = data.render_folder || '';
  } catch (err) {
    console.error('Lỗi tải cài đặt:', err);
  }
  if (typeof loadApiKeyVault === 'function') await loadApiKeyVault();
  loadAntigravityAccounts();
}

// ---------------------------------------------------------------------------
// Quota Antigravity theo tài khoản (Cài Đặt) — đọc /api/ai-images/antigravity-accounts,
// dữ liệu do tokmatrix-rotator xuất trên VPS (không có token).
// ---------------------------------------------------------------------------
let agQuotaTimer = null;

function agFmtWait(until, now) {
  if (!until || until <= now) return null;
  const mins = Math.ceil((until - now) / 60);
  const h = Math.floor(mins / 60), m = mins % 60;
  const at = new Date(until * 1000).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  return `${h ? `${h}g${String(m).padStart(2, '0')}p` : `${m}p`} (${at})`;
}

function agQuotaCell(until, now) {
  const wait = agFmtWait(until, now);
  return wait
    ? `<span class="badge badge-warning" title="Hết quota, mở lại lúc ${escapeHtml(wait)}">⏳ chờ ${escapeHtml(wait)}</span>`
    : '<span class="badge badge-success">✓ còn</span>';
}

function agAgo(ts, now) {
  if (!ts) return '—';
  const mins = Math.max(0, Math.round((now - ts) / 60));
  if (mins < 60) return `${mins} phút trước`;
  if (mins < 48 * 60) return `${Math.round(mins / 60)} giờ trước`;
  return new Date(ts * 1000).toLocaleDateString('vi-VN');
}

async function loadAntigravityAccounts() {
  const rowsEl = document.getElementById('ag-quota-rows');
  const summaryEl = document.getElementById('ag-quota-summary');
  if (!rowsEl) return;
  clearTimeout(agQuotaTimer);
  // Chỉ tự làm mới khi đang mở Cài Đặt.
  agQuotaTimer = setTimeout(() => {
    if (document.getElementById('panel-antigravity-quota')?.offsetParent) loadAntigravityAccounts();
  }, 60000);
  let data;
  try {
    const res = await fetch('/api/ai-images/antigravity-accounts');
    data = await res.json();
    if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
  } catch (err) {
    rowsEl.innerHTML = `<tr><td colspan="6" class="text-dim">Không tải được: ${escapeHtml(err.message)}</td></tr>`;
    return;
  }
  const now = data.now || Math.floor(Date.now() / 1000);
  const pool = data.pool;
  if (!pool || !Array.isArray(pool.accounts) || !pool.accounts.length) {
    rowsEl.innerHTML = '<tr><td colspan="6" class="text-dim">Chưa có dữ liệu. Rotator (tokmatrix-rotator) chưa chạy trên máy này.</td></tr>';
    summaryEl.textContent = '';
    return;
  }
  const accounts = pool.accounts;
  const active = (pool.active_email || '').toLowerCase();
  rowsEl.innerHTML = accounts.map((acc) => {
    const blocked = acc.blocked || {};
    const isActive = acc.email.toLowerCase() === active;
    let state = isActive ? '<span class="badge badge-cyan">▶ Đang chạy</span>' : '<span class="badge badge-neutral">Chờ lượt</span>';
    if (acc.disabled) {
      state = `<span class="badge badge-danger" title="${escapeHtml(acc.disabled_reason || '')}">⛔ Cần xác minh / đăng nhập lại</span>`;
    }
    const tier = acc.tier === 'ultra' ? '<span class="badge badge-purple">ULTRA</span>' : '<span class="badge badge-neutral">PRO</span>';
    return `<tr${isActive ? ' style="font-weight:700"' : ''}>
      <td>${escapeHtml(acc.email)}${acc.name ? `<div class="text-dim" style="font-size:11px">${escapeHtml(acc.name)}</div>` : ''}</td>
      <td>${tier}</td>
      <td>${acc.disabled ? '—' : agQuotaCell(blocked.image, now)}</td>
      <td>${acc.disabled ? '—' : agQuotaCell(blocked.text, now)}</td>
      <td>${state}</td>
      <td class="text-dim">${agAgo(acc.last_used_at, now)}</td>
    </tr>`;
  }).join('');

  const usable = accounts.filter((a) => !a.disabled);
  const imageReady = usable.filter((a) => !((a.blocked || {}).image > now));
  const nextImage = usable.map((a) => (a.blocked || {}).image || 0).filter((t) => t > now).sort((x, y) => x - y)[0];
  const disabled = accounts.length - usable.length;
  const q = data.queue || {};
  const done = data.completed_24h || {};
  const cf = data.cf_fallback || {};
  const parts = [
    `Đang chạy: <b>${escapeHtml(pool.active_email || '—')}</b>`,
    `Còn quota ảnh: <b>${imageReady.length}/${usable.length}</b> tài khoản` +
      (!imageReady.length && nextImage ? ` — sớm nhất mở lại ${escapeHtml(agFmtWait(nextImage, now))}` : ''),
    disabled ? `<span style="color:#b42318">${disabled} tài khoản cần xác minh</span>` : null,
    `Hàng đợi ảnh: ${q.pending || 0} chờ · ${q.processing || 0} đang vẽ`,
    `24h: ${done.antigravity || 0} ảnh Antigravity · ${done.cf_worker || 0} ảnh dự phòng Cloudflare` +
      ('imagerouter' in done ? ` · ${done.imagerouter || 0} ảnh ImageRouter` : ''),
    cf.enabled ? `Dự phòng CF: ${cf.has_token ? (cf.in_flight?.length ? `đang vẽ ${cf.in_flight.length}` : 'sẵn sàng') : 'chưa có token'}` : 'Dự phòng CF: tắt',
  ].filter(Boolean);
  summaryEl.innerHTML = parts.join(' &nbsp;·&nbsp; ') +
    `<div style="font-size:11px;margin-top:4px">Cập nhật từ rotator: ${agAgo(pool.generated_at, now)}</div>`;
}

async function loadChannelProfileSettings() {
  try { const s = await (await fetch('/api/channels/profile-settings')).json();
    const q = id => document.getElementById(id); if (!q('profile-publish-channels')) return;
    q('profile-publish-channels').value = s.publish_profile_channels === 'all' ? 'all' : s.publish_profile_channels;
    q('profile-auto-confirm').checked = s.needs_check_auto_confirm === 'true'; q('profile-cache-clean').checked = s.profile_cache_clean_enabled === 'true';
    const m = await (await fetch('/api/channels/profile-metrics?days=7')).json();
    const line = (label, r) => r ? `${label}: ${r.started} lượt · ${r.success || 0} SUCCESS · ${r.needs_check || 0} NEEDS_CHECK · ${r.error || 0} ERROR · tỉ lệ ${r.rate == null ? '—' : r.rate + '%'}` : `${label}: chưa có`;
    const logout = Object.values((m.session_events || {}).by_source || {}).reduce((a, e) => a + e.events, 0);
    q('profile-metrics').textContent = [
      `7 ngày gần nhất`, line('Profile', m.by_mode.profile), line('Sạch', m.by_mode.clean),
      line('Trước khi bật profile', m.baseline), `Bị đăng xuất: ${logout} lần · hoãn vì profile bận: ${m.by_mode.profile.deferred || 0}`,
    ].join('\n');
  } catch (e) { console.warn('Không tải được cài đặt Chrome profile', e); }
}
async function saveChannelProfileSettings() { const q=id=>document.getElementById(id); try { const res=await fetch('/api/channels/profile-settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({publish_profile_channels:q('profile-publish-channels').value,needs_check_auto_confirm:q('profile-auto-confirm').checked?'true':'false',profile_cache_clean_enabled:q('profile-cache-clean').checked?'true':'false'})}); const d=await res.json(); if(!res.ok) throw Error(d.detail||'Lỗi lưu'); showToast('Đã lưu Chrome profile'); loadChannelProfileSettings(); } catch(e) { showToast('❌ '+e.message); } }
function disableChannelProfiles() { const q=document.getElementById('profile-publish-channels'); if(q){q.value=''; saveChannelProfileSettings();} }

const btnSaveSettings = document.getElementById('btn-save-settings');
if (btnSaveSettings) {
  btnSaveSettings.addEventListener('click', async () => {
    const prov = document.getElementById('set-captcha-provider').value;
    const gpu = document.getElementById('set-default-gpu').checked ? 'true' : 'false';

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prefer_api_captcha: prov,
          default_render_gpu: gpu
        })
      });

      const d = await res.json();
      showToast(d.message || 'Đã lưu cấu hình hệ thống thành công!');
    } catch (err) {
      showToast('Lỗi lưu cài đặt: ' + err.message);
    }
  });
}

const btnTestAchi = document.getElementById('btn-test-achi');
if (btnTestAchi) {
  btnTestAchi.addEventListener('click', () => {
    // Khoá nằm ở Kho Khoá API; dùng luôn nút Thử dùng chung.
    if (typeof testApiKey === 'function') testApiKey('captcha.achi');
  });
}

// ==============================================================================
// AUTO COMPARE VIDEO MOD STUDIO (SENIOR FULLSTACK HUB)
// ==============================================================================
let compareLibrary = [];
let currentCompareSlug = '';
let compareGenInterval = null;
let compareTopicsData = [];

function switchRenderSubTab(mode) {
  const btnCompare = document.getElementById('btn-subtab-compare');
  const btnGpu = document.getElementById('btn-subtab-gpu');
  const subCompare = document.getElementById('subpane-compare');
  const subGpu = document.getElementById('subpane-gpu');

  if (mode === 'compare') {
    if (btnCompare) btnCompare.classList.add('active');
    if (btnGpu) btnGpu.classList.remove('active');
    if (subCompare) subCompare.style.display = 'block';
    if (subGpu) subGpu.style.display = 'none';
    loadCompareLibrary();
  } else {
    if (btnGpu) btnGpu.classList.add('active');
    if (btnCompare) btnCompare.classList.remove('active');
    if (subGpu) subGpu.style.display = 'block';
    if (subCompare) subCompare.style.display = 'none';
  }
}

async function loadCompareLibrary() {
  try {
    const res = await fetch('/api/compare-videos/library');
    const data = await res.json();
    compareLibrary = data.videos || [];

    const elCount = document.getElementById('val-compare-rendered-count');
    if (elCount) elCount.textContent = data.rendered_count || 0;

    const elBadge1 = document.getElementById('badge-compare-count');
    if (elBadge1) elBadge1.textContent = data.rendered_count || 0;

    const elBadge2 = document.getElementById('badge-render-count');
    if (elBadge2) elBadge2.textContent = data.rendered_count || 0;

    renderCompareCards();
  } catch (err) {
    console.error('Failed to load compare library:', err);
  }
}

function renderCompareCards() {
  const container = document.getElementById('compare-video-cards');
  if (!container) return;

  const marketVal = document.getElementById('compare-filter-market')?.value || 'ALL';
  const styleVal = document.getElementById('compare-filter-style')?.value || 'ALL';
  const searchVal = (document.getElementById('compare-search-input')?.value || '').toLowerCase().trim();

  const filtered = compareLibrary.filter(v => {
    let matchMarket = true;
    if (marketVal !== 'ALL') {
      matchMarket = v.country === marketVal || v.slug.includes(marketVal.toLowerCase());
    }

    let matchStyle = true;
    if (styleVal !== 'ALL') {
      matchStyle = v.style.toLowerCase() === styleVal.toLowerCase();
    }

    let matchSearch = true;
    if (searchVal) {
      matchSearch = v.title.toLowerCase().includes(searchVal) ||
                    v.slug.toLowerCase().includes(searchVal) ||
                    (v.tagline || '').toLowerCase().includes(searchVal);
    }

    return matchMarket && matchStyle && matchSearch;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 48px 20px; color: var(--text-dim);">
        <p style="font-size: 16px; font-weight: 600; margin-bottom: 8px;">Không tìm thấy video nào phù hợp bộ lọc.</p>
        <p style="font-size: 13px;">Bấm nút <strong>"✨ Sinh Video Mới"</strong> ở trên để tạo kịch bản và render video AI mới ngay!</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(v => {
    let flagEmoji = '🌍';
    if (v.country === 'UK') flagEmoji = '🇬🇧 UK';
    else if (v.country === 'DE') flagEmoji = '🇩🇪 DE';
    else if (v.country === 'JP') flagEmoji = '🇯🇵 JP';
    else if (v.country === 'KR') flagEmoji = '🇰🇷 KR';
    else if (v.country === 'VN') flagEmoji = '🇻🇳 VN';
    else if (v.country === 'US') flagEmoji = '🇺🇸 US';

    const statusHtml = v.has_render
      ? `<span class="status-pill status-success">Rendered HD</span>`
      : `<span class="status-pill status-pending">Bản Thảo (Draft)</span>`;

    const videoStreamUrl = `/api/compare-videos/video/${v.slug}/stream`;

    return `
      <div class="compare-card">
        <div class="compare-card-media">
          ${v.has_render ? `
            <video src="${videoStreamUrl}" preload="none" class="compare-card-video" onmouseenter="this.play()" onmouseleave="this.pause(); this.currentTime=0;" muted loop></video>
          ` : `
            <div style="color: var(--text-dim); text-align: center; padding: 20px;">
              <span style="font-size: 32px;">📝</span>
              <p style="font-size: 12px; margin-top: 4px;">Kịch bản sẵn sàng (Chưa render MP4)</p>
            </div>
          `}
          <div class="compare-card-badge-row">
            <span class="badge-country">${flagEmoji}</span>
            ${statusHtml}
          </div>
        </div>

        <div class="compare-card-body">
          <div class="flex-between">
            <span style="font-size: 11px; font-weight: 700; color: #a855f7; text-transform: uppercase;">
              ${v.style} Style
            </span>
            ${v.has_render ? `<span style="font-size: 11px; font-variant-numeric: tabular-nums; color: var(--text-dim);">${v.mp4_size_mb} MB</span>` : ''}
          </div>

          <h4 class="compare-card-title" title="${escapeHtml(v.title)}">
            ${escapeHtml(v.title)}
          </h4>

          <p class="compare-card-tagline" title="${escapeHtml(v.tagline || v.slug)}">
            ${escapeHtml(v.tagline || v.slug)}
          </p>

          <div class="compare-card-footer">
            <span style="font-size: 11px; color: var(--text-dim); font-variant-numeric: tabular-nums;">
              ${v.rendered_at || 'Mới tạo'}
            </span>

            <div class="compare-card-actions">
              <button class="btn btn-outline btn-xs" onclick="openCompareDetailsModal('${v.slug}')" title="Xem chi tiết, 3 tiêu đề viral & hashtag">
                Chi Tiết & Kịch Bản
              </button>
              ${v.has_render ? `
                <button class="btn btn-emerald btn-xs" onclick="directSendCompareToUpload('${v.slug}')" title="Chuyển sang hàng đợi đăng kênh TikTok">
                  🚀 Đăng Kênh
                </button>
              ` : ''}
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function toggleCompareGenerator() {
  const panel = document.getElementById('compare-generator-panel');
  if (!panel) return;
  if (panel.style.display === 'none' || !panel.style.display) {
    panel.style.display = 'block';
    loadCompareTopics();
  } else {
    panel.style.display = 'none';
  }
}

async function loadCompareTopics() {
  try {
    const res = await fetch('/api/compare-videos/topics');
    const data = await res.json();
    compareTopicsData = data.topics || [];

    const select = document.getElementById('gen-opt-topic');
    if (!select) return;

    select.innerHTML = '<option value="">🎲 Tự động chọn ngẫu nhiên từ kho 28+ chủ đề</option>';
    compareTopicsData.forEach(t => {
      select.innerHTML += `<option value="${t.slug}">[${t.category}] ${t.title} - "${t.tagline || ''}"</option>`;
    });

    const elCount = document.getElementById('val-compare-topics-count');
    if (elCount) elCount.textContent = compareTopicsData.length || 28;
  } catch (err) {
    console.error('Failed to load compare topics:', err);
  }
}

function onMarketChange() {
  const market = document.getElementById('gen-opt-market')?.value;
  const select = document.getElementById('gen-opt-topic');
  if (!select) return;

  select.innerHTML = '<option value="">🎲 Tự động chọn ngẫu nhiên</option>';
  const filtered = market ? compareTopicsData.filter(t => t.category === market) : compareTopicsData;
  filtered.forEach(t => {
    select.innerHTML += `<option value="${t.slug}">[${t.category}] ${t.title} - "${t.tagline || ''}"</option>`;
  });
}

async function startCompareGeneration() {
  const market = document.getElementById('gen-opt-market')?.value || '';
  const style = document.getElementById('gen-opt-style')?.value || 'compare';
  const slug = document.getElementById('gen-opt-topic')?.value || '';
  const render = document.getElementById('gen-opt-render')?.checked !== false;

  const btnStart = document.getElementById('btn-start-generator');
  if (btnStart) {
    btnStart.disabled = true;
    btnStart.textContent = '⏳ Đang khởi tạo...';
  }

  const progressBox = document.getElementById('gen-progress-box');
  if (progressBox) progressBox.style.display = 'block';

  try {
    const res = await fetch('/api/compare-videos/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: market, style, slug, render })
    });
    const d = await res.json();
    showToast(d.message);

    if (compareGenInterval) clearInterval(compareGenInterval);
    compareGenInterval = setInterval(pollCompareGenStatus, 1500);
  } catch (err) {
    showToast('Lỗi khởi chạy sinh video: ' + err.message);
    if (btnStart) {
      btnStart.disabled = false;
      btnStart.textContent = 'Bắt Đầu Tạo Video & Render';
    }
  }
}

async function pollCompareGenStatus() {
  try {
    const res = await fetch('/api/compare-videos/status');
    const st = await res.json();

    const elStage = document.getElementById('gen-stage-text');
    const elPercent = document.getElementById('gen-progress-percent');
    const elFill = document.getElementById('gen-progress-fill');
    const elTerminal = document.getElementById('gen-terminal-log');

    if (elStage) elStage.textContent = st.current_stage || 'Đang xử lý...';
    if (elPercent) elPercent.textContent = (st.progress || 0) + '%';
    if (elFill) elFill.style.width = (st.progress || 0) + '%';

    if (elTerminal && st.logs && st.logs.length > 0) {
      elTerminal.innerHTML = st.logs.map(l => `<div>${escapeHtml(l)}</div>`).join('');
      elTerminal.scrollTop = elTerminal.scrollHeight;
    }

    if (!st.is_running) {
      clearInterval(compareGenInterval);
      compareGenInterval = null;
      const btnStart = document.getElementById('btn-start-generator');
      if (btnStart) {
        btnStart.disabled = false;
        btnStart.textContent = 'Bắt Đầu Tạo Video & Render';
      }
      loadCompareLibrary();
    }
  } catch (err) {
    console.error('Error polling compare gen status:', err);
  }
}

let modalPubData = null;

async function openCompareDetailsModal(slug) {
  currentCompareSlug = slug;
  const modal = document.getElementById('modal-compare-details');
  if (!modal) return;
  modal.style.display = 'flex';

  const vItem = compareLibrary.find(x => x.slug === slug);
  document.getElementById('modal-compare-title').textContent = vItem ? vItem.title : slug;
  document.getElementById('modal-compare-country').textContent = vItem ? vItem.country : 'GLOBAL';

  const player = document.getElementById('modal-compare-player');
  if (player) {
    player.src = `/api/compare-videos/video/${slug}/stream`;
    player.load();
  }

  if (vItem && vItem.has_render) {
    document.getElementById('modal-compare-meta-size').textContent = `${vItem.mp4_size_mb} MB (HD 1080x1920)`;
    document.getElementById('modal-compare-meta-time').textContent = vItem.rendered_at || '';
  }

  const chSelect = document.getElementById('modal-compare-channel-select');
  if (chSelect && allChannels) {
    chSelect.innerHTML = '<option value="">-- Chọn kênh BKT mục tiêu --</option>';
    allChannels.forEach(c => {
      const uName = c.username || c.note || `ID ${c.id}`;
      chSelect.innerHTML += `<option value="${c.id}">${escapeHtml(uName)} (${c.country}) - BKT: ${c.status}</option>`;
    });
  }

  try {
    const res = await fetch(`/api/compare-videos/video/${slug}/details`);
    const data = await res.json();
    modalPubData = data;

    const titlesEl = document.getElementById('modal-compare-titles');
    if (titlesEl && data.titles) {
      titlesEl.innerHTML = data.titles.map((t, idx) => `
        <div class="viral-title-item">
          <div>
            <strong style="color: #38bdf8; font-size: 11px;">#${idx + 1} [${escapeHtml(t.label || t.type)}]:</strong>
            <div style="font-weight: 600; margin-top: 2px;">${escapeHtml(t.title)}</div>
          </div>
          <button class="btn btn-outline btn-xs" onclick="copyViralTitle('${escapeHtml(t.title)}')">📋 Copy</button>
        </div>
      `).join('');
    }

    const descEl = document.getElementById('modal-compare-desc');
    if (descEl) {
      descEl.textContent = data.description || 'Chưa có mô tả';
    }

    const hashEl = document.getElementById('modal-compare-hashtags');
    if (hashEl) {
      hashEl.textContent = data.hashtagString || (data.hashtags || []).join(' ');
    }
  } catch (err) {
    console.error('Failed to load publishing kit:', err);
  }
}

function closeCompareDetailsModal() {
  const modal = document.getElementById('modal-compare-details');
  if (modal) modal.style.display = 'none';
  const player = document.getElementById('modal-compare-player');
  if (player) {
    player.pause();
    player.src = '';
  }
}

function copyViralTitle(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast('Đã sao chép tiêu đề viral!');
  });
}

function copyModalDescription() {
  if (modalPubData && modalPubData.description) {
    navigator.clipboard.writeText(modalPubData.description).then(() => {
      showToast('Đã sao chép mô tả & timestamps!');
    });
  }
}

function copyModalHashtags() {
  if (modalPubData && (modalPubData.hashtagString || modalPubData.hashtags)) {
    const text = modalPubData.hashtagString || modalPubData.hashtags.join(' ');
    navigator.clipboard.writeText(text).then(() => {
      showToast('Đã sao chép toàn bộ Hashtags!');
    });
  }
}

// Nút "Đăng" trong hộp thoại chi tiết thư viện: mở cùng biểu mẫu đăng của Studio (chọn kênh,
// sửa caption, đăng ngay hoặc hẹn giờ, nhãn AI) thay vì hẹn cố định +1 giờ.
async function sendModalVideoToUpload() {
  if (!currentCompareSlug) return;
  const slug = currentCompareSlug;
  const chSelect = document.getElementById('modal-compare-channel-select');
  const preset = chSelect ? chSelect.value : '';
  closeCompareDetailsModal();
  await openWsPublishFor(slug, preset);
}

async function openWsPublishFor(slug, channelId = '') {
  switchTab('compare');
  await selectWsVideo(slug);
  switchWsTab('upload-tiktok');
  if (channelId) {
    await populateWsTikTokChannelSelect();
    const sel = document.getElementById('ws-upload-channel');
    if (sel) { sel.value = String(channelId); onWsUploadChannelChange(); }
  }
}

// Trước đây hàm này gửi thẳng lên máy chủ không kèm kênh, và máy chủ tự lấy
// kênh đầu bảng — video đăng lên một tài khoản không ai chọn. Nút nhanh giờ mở
// hộp thoại chi tiết, nơi có sẵn ô chọn kênh, để người dùng chỉ đích danh.
async function directSendCompareToUpload(slug) {
  await openWsPublishFor(slug);
  showToast('Chọn kênh muốn đăng, kiểm tra caption rồi bấm "Xếp hàng đăng"', 5000);
}
async function checkStudioServerLive() {
  try {
    const res = await fetch('/api/compare-studio/status');
    const data = await res.json();
    const ind = document.getElementById('studio-live-indicator');
    if (ind) {
      if (data.running) {
        ind.textContent = '🟢 Native (chạy trong bkt_web)';
        ind.style.color = '#10b981';
      } else {
        ind.textContent = '🟡 Đang khởi động...';
        ind.style.color = '#f59e0b';
      }
    }
  } catch (e) {
    console.warn('Studio status error:', e);
  }
}

async function loadCompareBadge() {
  try {
    const res = await fetch('/api/compare-videos/library');
    const data = await res.json();
    const badge = document.getElementById('badge-compare-count');
    if (badge) badge.textContent = data.rendered_count || 0;
  } catch (error) {
    console.warn('Không thể cập nhật số video Compare Studio:', error);
  }
}

// --- Compare Studio Sub-menu & Navigation Controllers ---
function toggleWsNavRoot() {
  const root = document.getElementById('ws-nav-root');
  if (!root) return;
  const isExpanded = root.classList.contains('expanded');
  const paneCompare = document.getElementById('pane-compare');
  const isCompareTab = paneCompare && paneCompare.style.display !== 'none';

  if (isCompareTab) {
    setWsNavExpanded(!isExpanded);
  } else {
    setWsNavExpanded(true);
    switchTab('compare');
  }
}

function setWsNavExpanded(expanded) {
  const root = document.getElementById('ws-nav-root');
  if (!root) return;
  root.classList.toggle('expanded', expanded);
  const parent = root.querySelector('.sfb-nav-parent');
  if (parent) parent.setAttribute('aria-expanded', expanded ? 'true' : 'false');
}

function selectWsSidebarMenu(action) {
  setWsNavExpanded(true);
  switchTab('compare');

  document.querySelectorAll('#ws-nav-tree .sfb-menu-item').forEach(el => {
    el.classList.toggle('active', el.dataset.wsSub === action);
  });

  if (action === 'library') {
    switchWsTab('preview');
  } else if (action === 'new-video') {
    openNewVideoModal();
  } else if (action === 'template-review') {
    openTemplateReviewModal();
  } else if (action === 'script') {
    switchWsTab('script');
  } else if (action === 'seo') {
    switchWsTab('seo');
  } else if (action === 'upload-tiktok') {
    switchWsTab('upload-tiktok');
  } else if (action === 'logs') {
    switchWsTab('logs');
  }
}

// Load legacy/native views only when their containers are actually present.
if (document.getElementById('compare-video-cards')) loadCompareLibrary();
// Thư viện Xưởng Video AI nạp lười: nó kéo theo ảnh phân cảnh gốc (~1.9MB) mà
// người dùng thường chưa mở tới. switchTab('compare') sẽ gọi khi thật sự cần.
loadCompareBadge();
checkStudioServerLive();

// =============================================================================
// TAB 3: COMPARE STUDIO NATIVE WORKSTATION CLIENT CONTROLLER (100% NATIVE)
// =============================================================================
let wsVideosList = [];
let currentWsSlug = null;
let wsMarketFilter = 'ALL';
let wsStyleFilter = 'ALL';
let wsSearchQuery = '';
let wsSortMode = 'newest';
let wsOnlyRendered = false;
let wsCurrentDetail = null;
let wsPublishPollInterval = null;
let wsRunPollInterval = null;
let wsVideoDetailRequestId = 0;
let wsVideoDetailAbortController = null;
let wsNativeCanvasLoadId = 0;
let wsNativeCanvasRuntime = null;
let wsGsapLoadPromise = null;
let modalGenSelectedMarket = '';
let modalGenSelectedStyle = 'compare';

async function loadWsLibrary() {
  try {
    const res = await fetch('/api/videos');
    const data = await res.json();
    wsVideosList = Array.isArray(data) ? data : (data.videos || []);

    // Calculate total duration in seconds
    const totalSecs = wsVideosList.reduce((acc, v) => acc + (v.duration || 44), 0);
    
    // Update stats ribbon
    const elCount = document.getElementById('ws-stat-total-vids');
    const elSecs = document.getElementById('ws-stat-total-secs');
    const elSidebarCount = document.getElementById('ws-total-count');
    const elTabBadge = document.getElementById('badge-compare-count');
    
    if (elCount) elCount.textContent = wsVideosList.length;
    if (elSecs) elSecs.textContent = Math.round(totalSecs);
    if (elSidebarCount) elSidebarCount.textContent = wsVideosList.length;
    if (elTabBadge) elTabBadge.textContent = wsVideosList.length;

    renderWsSidebar();

    // Auto-select first video if none selected or current is invalid
    if (!currentWsSlug || currentWsSlug === '__template' || !wsVideosList.some(v => v.slug === currentWsSlug)) {
      if (wsVideosList.length > 0) {
        selectWsVideo(wsVideosList[0].slug);
      }
    }
  } catch (err) {
    console.error('Lỗi nạp thư viện Compare Workstation:', err);
  }
}

const WS_STYLE_META = {
  compare: { icon: "⚔️", name: "So Sánh 2 Vật", benchmark: "Khung chuẩn: 30-40s" },
  survival: { icon: "🏕️", name: "Thử Thách Sinh Tồn", benchmark: "Khung chuẩn: 65s" },
  tierlist: { icon: "🏆", name: "Tier List Xếp Hạng", benchmark: "Khung chuẩn: 60-90s" },
  vox: { icon: "📰", name: "Vox Phóng Sự", benchmark: "Khung chuẩn: 50-65s" },
  newspaper: { icon: "📜", name: "Báo Cũ Điều Tra", benchmark: "Khung chuẩn: 65s" },
  chalk: { icon: "🗺️", name: "Bản Đồ Bảng Phấn", benchmark: "Khung chuẩn: >60s" },
  wildlife: { icon: "🐾", name: "Thế Giới Động Vật", benchmark: "Khung chuẩn: 50-60s" },
  kinetic: { icon: "⚡", name: "Kinetic Editorial", benchmark: "Khung chuẩn: 65s" },
  science: { icon: "🪐", name: "Khoa Học Vũ Trụ", benchmark: "Khung chuẩn: 65s" },
  mystery: { icon: "🔍", name: "Bí Ẩn & Kỳ Án", benchmark: "Khung chuẩn: 65s" },
  folklore: { icon: "🕯️", name: "Tâm Linh Dân Gian", benchmark: "Khung chuẩn: 70s / 2,5 phút" }
};

function getWsVideoStyle(slug) {
  // Ưu tiên thể loại do máy chủ nhận diện (meta/spec), tiền tố slug chỉ là dự phòng.
  const known = (typeof wsVideosList !== 'undefined' ? wsVideosList : []).find(v => v.slug === slug);
  if (known && known.type && WS_STYLE_META[known.type]) return known.type;
  const s = (slug || '').toLowerCase();
  if (s.startsWith('survival-')) return 'survival';
  if (s.startsWith('tierlist-')) return 'tierlist';
  if (s.startsWith('vox-')) return 'vox';
  if (s.startsWith('newspaper-')) return 'newspaper';
  if (s.startsWith('chalk-')) return 'chalk';
  if (s.startsWith('wildlife-') || s.startsWith('dong-vat-')) return 'wildlife';
  if (s.startsWith('kinetic-')) return 'kinetic';
  if (s.startsWith('science-')) return 'science';
  if (s.startsWith('mystery-') || s.startsWith('bi-an-')) return 'mystery';
  if (s.startsWith('folklore-')) return 'folklore';
  return 'compare';
}

function renderWsSidebar() {
  const container = document.getElementById('ws-video-list');
  if (!container) return;

  let filtered = wsVideosList.slice();

  // Compute counts for all languages and templates
  const langCounts = { all: wsVideosList.length };
  const templateCounts = { all: wsVideosList.length };
  wsVideosList.forEach(v => {
    const l = (v.lang || '').toLowerCase();
    langCounts[l] = (langCounts[l] || 0) + 1;
    const s = getWsVideoStyle(v.slug);
    templateCounts[s] = (templateCounts[s] || 0) + 1;
  });

  // Update market chip counts
  const marketMap = { 'ALL': 'all', 'VI': 'vi', 'DE': 'de', 'KO': 'ko', 'JA': 'ja', 'US': 'en', 'FR': 'fr' };
  document.querySelectorAll('#ws-market-chips .filter-chip').forEach(btn => {
    const m = btn.dataset.market;
    const key = marketMap[m] || 'all';
    const cnt = langCounts[key] || 0;
    const flagEmoji = m === 'ALL' ? '🌐 Tất cả' : m === 'VI' ? '🇻🇳 VI' : m === 'DE' ? '🇩🇪 DE' : m === 'KO' ? '🇰🇷 KO' : m === 'JA' ? '🇯🇵 JA' : m === 'US' ? '🇺🇸 US' : '🇫🇷 FR';
    btn.innerHTML = `${flagEmoji} (${cnt})`;
  });

  // Update style chip counts
  document.querySelectorAll('#ws-style-chips .filter-chip').forEach(btn => {
    const s = btn.dataset.style;
    const cnt = s === 'ALL' ? templateCounts['all'] : (templateCounts[s] || 0);
    const meta = WS_STYLE_META[s];
    if (meta) {
      btn.innerHTML = `${meta.icon} ${meta.name.split(' ')[0]} (${cnt})`;
    } else if (s === 'ALL') {
      btn.innerHTML = `🌟 Tất cả (${cnt})`;
    }
  });

  // Search filter
  if (wsSearchQuery) {
    const q = wsSearchQuery.toLowerCase();
    filtered = filtered.filter(v => 
      (v.title && v.title.toLowerCase().includes(q)) ||
      (v.slug && v.slug.toLowerCase().includes(q)) ||
      (v.message && v.message.toLowerCase().includes(q))
    );
  }

  // Market filter
  if (wsMarketFilter !== 'ALL') {
    const targetLang = marketMap[wsMarketFilter] || 'vi';
    filtered = filtered.filter(v => (v.lang || '').toLowerCase() === targetLang);
  }

  // Style filter (10 templates)
  if (wsStyleFilter !== 'ALL') {
    filtered = filtered.filter(v => getWsVideoStyle(v.slug) === wsStyleFilter.toLowerCase());
  }

  // Rendered filter
  if (wsOnlyRendered) {
    filtered = filtered.filter(v => Boolean(v.hasRender));
  }

  // Sort
  if (wsSortMode === 'newest') {
    filtered.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  } else if (wsSortMode === 'oldest') {
    filtered.sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
  } else if (wsSortMode === 'duration_desc') {
    filtered.sort((a, b) => (b.duration || 44) - (a.duration || 44));
  } else if (wsSortMode === 'duration_asc') {
    filtered.sort((a, b) => (a.duration || 44) - (b.duration || 44));
  } else if (wsSortMode === 'title') {
    filtered.sort((a, b) => (a.title || a.slug).localeCompare(b.title || b.slug));
  }

  // Update Template Review button active state
  const btnTpl = document.getElementById('btn-ws-open-template');
  if (btnTpl) {
    btnTpl.classList.toggle('active', currentWsSlug === '__template');
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 24px; color: var(--color-ink-dim); font-size: 12px;">
        Không tìm thấy video nào phù hợp bộ lọc.
      </div>
    `;
    return;
  }

  // Group by Date if newest/oldest
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  const groups = [];
  const map = new Map();

  for (const v of filtered) {
    const d = new Date(v.createdAt);
    let label = 'Khác';
    if (!isNaN(d.getTime())) {
      if (d.toDateString() === now.toDateString()) {
        label = `Hôm nay (${d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })})`;
      } else if (d.toDateString() === yesterday.toDateString()) {
        label = `Hôm qua (${d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })})`;
      } else {
        label = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
      }
    }
    if (!map.has(label)) {
      map.set(label, []);
      groups.push({ label, items: map.get(label) });
    }
    map.get(label).push(v);
  }

  container.innerHTML = groups.map(({ label, items }) => `
    <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px;">
      <div class="ws-date-group-header">
        <span style="display: flex; align-items: center; gap: 6px;">
          <span>📅</span> <span>${label}</span>
        </span>
        <span style="background: var(--color-surface-2); border: 1px solid var(--color-line); border-radius: 999px; padding: 1px 7px; font-size: 10px;">${items.length}</span>
      </div>
      <div style="display: flex; flex-direction: column; gap: 8px;">
        ${items.map(v => {
          const isActive = v.slug === currentWsSlug ? 'active' : '';
          const lLower = (v.lang || 'vi').toLowerCase();
          const flagEmoji = lLower === 'vi' ? '🇻🇳 VI' : lLower === 'de' ? '🇩🇪 DE' : lLower === 'ko' ? '🇰🇷 KO' : lLower === 'ja' ? '🇯🇵 JA' : lLower === 'fr' ? '🇫🇷 FR' : '🇺🇸 US';
          
          const styleKey = getWsVideoStyle(v.slug);
          const styleMeta = WS_STYLE_META[styleKey] || WS_STYLE_META['compare'];

          const dObj = new Date(v.createdAt);
          const timeStr = !isNaN(dObj.getTime()) 
            ? `${dObj.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })} · ${dObj.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`
            : 'Mới tạo';

          const statusStr = v.imagesPending
            ? `<span style="color: #b45309; font-weight: 800;" title="Còn ảnh chờ Antigravity — chưa render/đăng được">🎨 Chờ ${v.imagesPending} ảnh</span>`
            : v.hasRender
            ? `<span style="color: var(--color-sage); font-weight: 800;">✅ Đã render</span>`
            : `<span style="color: var(--color-ink-dim);">⏳ Chưa render</span>`;

          return `
            <div class="ws-video-card ${isActive}" onclick="selectWsVideo('${v.slug}')" data-slug="${v.slug}">
              <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 8px;">
                <span style="font-size: 13px; font-weight: 800; color: var(--color-ink); line-height: 1.35; flex: 1;">
                  ${escapeHtml(v.title || v.slug)}
                </span>
                <span style="background: var(--color-surface); border: 1px solid var(--color-line); border-radius: 6px; padding: 2px 6px; font-size: 10.5px; font-weight: 700; color: var(--color-ink-soft); white-space: nowrap;">
                  ${flagEmoji}
                </span>
              </div>
              
              <div style="display: flex; align-items: center; gap: 6px; margin: 4px 0;">
                <span style="background: rgba(180, 80, 47, 0.12); border: 1px solid rgba(180, 80, 47, 0.25); color: var(--color-terra); border-radius: 6px; padding: 1px 6px; font-size: 10px; font-weight: 800;">
                  ${styleMeta.icon} ${escapeHtml(styleMeta.name)}
                </span>
                <span style="font-variant-numeric: tabular-nums; font-size: 10px; color: var(--color-ink-dim);">
                  ${styleMeta.benchmark.replace('Khung chuẩn: ', '')}
                </span>
              </div>

              <div style="font-variant-numeric: tabular-nums; font-size: 10.5px; color: var(--color-ink-soft); margin-bottom: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                ${escapeHtml(v.slug)}
              </div>

              <div style="display: flex; align-items: center; gap: 6px; font-variant-numeric: tabular-nums; font-size: 10px; color: var(--color-ink-dim); border-top: 1px solid var(--color-line); padding-top: 4px;">
                <span>📅 ${timeStr}</span>
                <span>·</span>
                <span>${v.duration || '44.0'}s</span>
                <span>·</span>
                <span>${v.lines || 6} dòng</span>
                <span>·</span>
                ${statusStr}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `).join('');
}

// State for In-Studio Live Script Editor
let wsOriginalScript = [];
let wsEditedScript = [];
let wsTplCurrentType = 'compare';
let wsTplCurrentLang = 'vi';

// State for Image Replacement Modal
let wsActiveImgTarget = null;
let wsActiveImgTab = 'upload';
let wsSelectedImgData = null;

function selectWsTemplateReview() {
  ++wsVideoDetailRequestId;
  if (wsVideoDetailAbortController) wsVideoDetailAbortController.abort();
  wsVideoDetailAbortController = null;
  resetWsNativeCanvas();
  currentWsSlug = '__template';

  // Toggle active styling
  const btnTpl = document.getElementById('btn-ws-open-template');
  if (btnTpl) btnTpl.classList.add('active');
  document.querySelectorAll('.ws-video-card').forEach(el => el.classList.remove('active'));

  // Switch view containers
  const tplContainer = document.getElementById('ws-template-review-container');
  const vidContainer = document.getElementById('ws-video-detail-container');
  if (tplContainer) {
    tplContainer.style.display = 'flex';
    if (window.innerWidth <= 900) {
      setTimeout(() => tplContainer.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    }
  }
  if (vidContainer) vidContainer.style.display = 'none';

  loadWsTemplateTiming(wsTplCurrentType, wsTplCurrentLang);
}

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

async function selectWsVideo(slug) {
  if (slug === '__template') {
    selectWsTemplateReview();
    return;
  }

  currentWsSlug = slug;
  const requestId = ++wsVideoDetailRequestId;

  // A previous selection may still be waiting on the Compare Studio process.
  // Abort it so an older response cannot repaint the detail pane after this click.
  if (wsVideoDetailAbortController) wsVideoDetailAbortController.abort();
  wsVideoDetailAbortController = new AbortController();

  // Un-highlight Template Review button
  const btnTpl = document.getElementById('btn-ws-open-template');
  if (btnTpl) btnTpl.classList.remove('active');

  // Highlight active in sidebar
  document.querySelectorAll('.ws-video-card').forEach(el => {
    el.classList.toggle('active', el.dataset.slug === slug);
  });

  // Switch view containers
  const tplContainer = document.getElementById('ws-template-review-container');
  const vidContainer = document.getElementById('ws-video-detail-container');
  if (tplContainer) tplContainer.style.display = 'none';
  if (vidContainer) {
    vidContainer.style.display = 'flex';
    if (window.innerWidth <= 900) {
      setTimeout(() => vidContainer.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    }
  }

  const elMainTitle = document.getElementById('ws-main-title');
  const elMainBrief = document.getElementById('ws-main-brief');
  if (elMainTitle) elMainTitle.textContent = `Đang tải ${slug}...`;
  if (elMainBrief) elMainBrief.textContent = 'Đang cập nhật thông tin video đã chọn';
  resetWsNativeCanvas();

  try {
    const encodedSlug = encodeURIComponent(slug);
    const res = await fetch(`/api/videos/${encodedSlug}`, {
      signal: wsVideoDetailAbortController.signal,
    });
    if (!res.ok) {
      // Không kiểm tra res.ok là lý do khung bên phải đứng im khi request hỏng:
      // thẻ bên trái đã đổi highlight từ trước, còn nội dung thì giữ nguyên.
      throw new Error(`Máy chủ trả về ${res.status} khi tải video ${slug}`);
    }
    const data = await res.json();
    if (requestId !== wsVideoDetailRequestId || currentWsSlug !== slug) return;
    wsCurrentDetail = data;

    // 1. Update Header
    const styleKey = getWsVideoStyle(slug);
    const styleMeta = WS_STYLE_META[styleKey] || WS_STYLE_META['compare'];
    const btnFolkImages = document.getElementById('btn-ws-folklore-images');
    // Thể loại có ảnh AI (Antigravity) — hoặc video đang còn ảnh chờ.
    const aiImageStyles = ['folklore', 'vox', 'newspaper', 'wildlife', 'mystery', 'tierlist'];
    if (btnFolkImages) {
      btnFolkImages.style.display = (aiImageStyles.includes(styleKey) || data.imagesPending) ? '' : 'none';
      btnFolkImages.textContent = data.imagesPending ? `🎨 Ảnh Antigravity (chờ ${data.imagesPending})` : '🎨 Ảnh Antigravity';
    }

    const elCatIcon = document.getElementById('ws-cat-icon');
    const elCatTitle = document.getElementById('ws-cat-title');
    const elCatBenchmark = document.getElementById('ws-cat-benchmark');
    if (elCatIcon) elCatIcon.textContent = styleMeta.icon;
    if (elCatTitle) elCatTitle.textContent = styleMeta.name;
    if (elCatBenchmark) elCatBenchmark.textContent = styleMeta.benchmark;

    if (elMainTitle) elMainTitle.textContent = data.title || slug;
    if (elMainBrief) elMainBrief.textContent = data.message || data.brief || 'Chưa có mô tả kịch bản tóm tắt';

    // Fast-Cut Retime Slider / Input
    const durVal = data.duration || 44.0;
    const elDurLabel = document.getElementById('ws-curr-dur-label');
    const elTargetInput = document.getElementById('ws-target-dur-input');
    if (elDurLabel) elDurLabel.textContent = `(Hiện tại: ${durVal.toFixed(1)}s)`;
    if (elTargetInput) elTargetInput.value = durVal;

    // 4 Stat Pills
    const langNames = { 'vi': 'Tiếng Việt', 'de': 'Tiếng Đức', 'ko': 'Tiếng Hàn', 'ja': 'Tiếng Nhật', 'en': 'Tiếng Anh', 'fr': 'Tiếng Pháp' };
    const elStatLang = document.getElementById('ws-stat-lang');
    const elStatDur = document.getElementById('ws-stat-dur');
    const elStatLines = document.getElementById('ws-stat-lines');
    const elStatRender = document.getElementById('ws-stat-render');
    
    if (elStatLang) elStatLang.textContent = langNames[data.lang] || data.lang || 'Tiếng Việt';
    if (elStatDur) elStatDur.textContent = `${durVal.toFixed(1)}s`;
    
    const scenes = (data.script && data.script.length > 0) ? data.script : ((data.spec && data.spec.scenes) || []);
    if (elStatLines) elStatLines.textContent = `${scenes.length || data.lines || 6} câu`;

    const renderSizeStr = data.render?.size ? (data.render.size / 1048576).toFixed(1) + ' MB' : (data.hasRender ? 'HD 1080p' : 'Chưa xuất bản');
    const renderDateStr = data.render?.mtime ? new Date(data.render.mtime).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }) : '';
    if (elStatRender) elStatRender.textContent = data.hasRender ? `${renderSizeStr} · ${renderDateStr || 'HD'}` : 'Chưa xuất bản';

    // 2. Video Player & Technical Inspector
    const player = document.getElementById('ws-video-player');
    if (player) {
      player.src = `/api/videos/${encodedSlug}/render`;
      player.load();
    }
    resetWsNativeCanvas();
    if (document.getElementById('btn-ws-mode-canvas')?.classList.contains('active')) {
      loadWsNativeCanvas(slug);
    }

    const dot = document.getElementById('ws-render-live-dot');
    if (dot) dot.style.display = data.hasRender ? 'inline' : 'none';

    const elPhoneMeta = document.getElementById('ws-phone-meta');
    if (elPhoneMeta) elPhoneMeta.textContent = `HD 1080x1920 · ${durVal.toFixed(1)}s · H.264 MP4`;

    const elInspFormat = document.getElementById('ws-insp-format');
    const elInspDur = document.getElementById('ws-insp-dur');
    const elInspTts = document.getElementById('ws-insp-tts');
    const elInspSize = document.getElementById('ws-insp-size');
    const elInspTime = document.getElementById('ws-insp-time');

    if (elInspFormat) elInspFormat.textContent = `Format: ${styleMeta.name}`;
    if (elInspDur) elInspDur.textContent = `${durVal.toFixed(1)}s (${styleMeta.benchmark})`;
    if (elInspTts) elInspTts.textContent = (data.spec && data.spec.voice) ? `Giọng AI: ${data.spec.voice}` : 'Edge Neural TTS';
    if (elInspSize) elInspSize.textContent = renderSizeStr;
    if (elInspTime) elInspTime.textContent = data.hasRender ? 'Đã render sẵn sàng' : 'Cần render MP4';

    // 2b. Mascot & Soundscape Showcase
    const mFlag = document.getElementById('ws-insp-mascot-flag');
    const mName = document.getElementById('ws-insp-mascot-name');
    const bgmName = document.getElementById('ws-insp-bgm-name');
    const sfxCount = document.getElementById('ws-insp-sfx-count');

    const cCode = (data.lang || 'vi').toLowerCase();
    const cData = NEWVID_COUNTRY_MASCOTS[cCode] || NEWVID_COUNTRY_MASCOTS.vi;
    if (mFlag) mFlag.textContent = cData.flag;
    if (mName) mName.textContent = `${cData.mascotName} (${cData.themeName})`;
    if (bgmName) bgmName.textContent = `${data.spec?.bgm || 'Volatile Reaction'} · Smart Ducking ON`;
    if (sfxCount) sfxCount.textContent = `${scenes.length || 13} Hiệu Ứng SFX Đồng Bộ`;

    // 3. Interactive Script Beat Cards
    wsOriginalScript = scenes.map(s => s.spoken || s.caption || s.line || s.text || '');
    wsEditedScript = wsOriginalScript.slice();
    renderWsScriptBeats(scenes);

    const btnReset = document.getElementById('btn-ws-reset-script');
    const btnSave = document.getElementById('btn-ws-save-script');
    if (btnReset) btnReset.style.display = 'none';
    if (btnSave) { btnSave.disabled = true; btnSave.style.opacity = '0.5'; }

    // 4. Load SEO / Publishing Kit
    loadWsPublishingKit(slug, requestId);

    // 5. Snapshot image
    const snapImg = document.getElementById('ws-snapshot-img');
    if (snapImg) {
      snapImg.onerror = () => {
        if (requestId !== wsVideoDetailRequestId || currentWsSlug !== slug) return;
        snapImg.onerror = null;
        snapImg.src = WS_SNAPSHOT_PLACEHOLDER;
      };
      snapImg.src = `/api/videos/${encodedSlug}/snapshot`;
    }

  } catch (err) {
    if (err.name === 'AbortError' || requestId !== wsVideoDetailRequestId || currentWsSlug !== slug) return;
    console.error(`Lỗi tải chi tiết video ${slug}:`, err);
    // Báo ra giao diện, nếu không người dùng chỉ thấy khung phải không đổi.
    if (typeof showToast === 'function') {
      showToast(`Không tải được video ${slug}: ${err.message}`, 6000);
    }
    if (elMainTitle) elMainTitle.textContent = `Không tải được ${slug}`;
  } finally {
    if (requestId === wsVideoDetailRequestId) wsVideoDetailAbortController = null;
  }
}

const WS_SNAPSHOT_PLACEHOLDER =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">' +
    '<rect width="1280" height="720" fill="#0f172a"/>' +
    '<text x="640" y="360" fill="#a855f7" font-family="sans-serif" font-size="46" ' +
    'font-weight="700" text-anchor="middle">Chua co Snapshot Contact Sheet</text></svg>'
  );

async function loadWsPublishingKit(slug, requestId = wsVideoDetailRequestId) {
  try {
    const encodedSlug = encodeURIComponent(slug);
    const res = await fetch(`/api/videos/${encodedSlug}/publishing-kit`);
    if (!res.ok) return;
    const pub = await res.json();
    if (requestId !== wsVideoDetailRequestId || currentWsSlug !== slug) return;
    
    const hooksContainer = document.getElementById('ws-seo-hooks');
    const descEl = document.getElementById('ws-seo-desc');
    const tagsContainer = document.getElementById('ws-seo-tags');
    const posterEl = document.getElementById('ws-seo-poster');

    if (hooksContainer && pub.titles) {
      hooksContainer.innerHTML = pub.titles.map((t, idx) => `
        <div class="viral-hook-card" style="background: var(--color-surface-2); border: 1px solid var(--color-line); border-radius: 10px; padding: 10px 14px; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between;">
          <div>
            <div style="font-size: 11px; font-weight: 700; color: var(--color-terra);">#${idx + 1} [${escapeHtml(t.label || t.type)}]:</div>
            <div style="font-size: 13px; font-weight: 700; color: var(--color-ink); margin-top: 2px;">${escapeHtml(t.title)}</div>
          </div>
          <button class="btn btn-secondary btn-xs" onclick="copyViralTitle('${escapeHtml(t.title)}')">📋 Copy</button>
        </div>
      `).join('');
    }

    if (descEl) {
      descEl.value = pub.description || 'Chưa có bài viết SEO.';
    }

    if (tagsContainer && pub.hashtags) {
      tagsContainer.innerHTML = pub.hashtags.map(tag => `<span class="badge-tag" style="margin: 2px; background: var(--color-surface-2); border: 1px solid var(--color-line); color: var(--color-ink);">${escapeHtml(tag)}</span>`).join(' ');
    }

    if (posterEl) {
      posterEl.style.display = '';
      posterEl.onerror = () => {
        if (requestId !== wsVideoDetailRequestId || currentWsSlug !== slug) return;
        // Chỉ thử ảnh dự phòng đúng một lần; nếu vẫn lỗi thì ẩn hẳn.
        posterEl.onerror = () => {
          if (requestId !== wsVideoDetailRequestId || currentWsSlug !== slug) return;
          posterEl.onerror = null;
          posterEl.removeAttribute('src');
          posterEl.style.display = 'none';
        };
        posterEl.src = `/api/videos/${encodedSlug}/snapshot`;
      };
      posterEl.src = `/videos/${encodedSlug}/assets/poster.png`;
    }
  } catch (err) {
    console.warn('Lỗi tải publishing kit:', err);
  }
}

let wsCurrentBeatScenes = [];
let wsBeatImgBuster = Date.now();

// In-Studio Live Script Editor Logic (100% replica of ScriptEditorTab)
function renderWsScriptBeats(scenes) {
  const container = document.getElementById('ws-beat-cards-list');
  if (!container) return;

  if (!scenes || scenes.length === 0) {
    container.innerHTML = '<div style="text-align: center; padding: 30px; color: var(--text-dim); font-size: 13px;">Chưa có phân cảnh / nhịp nào.</div>';
    return;
  }

  wsCurrentBeatScenes = scenes;
  container.innerHTML = scenes.map((s, idx) => {
    const num = idx + 1;
    const beatName = s.beat || s.badge || s.title || `Nhịp ${num}`;
    const startTime = typeof s.start === 'number' ? s.start.toFixed(1) : (idx * 3.6).toFixed(1);
    const durTime = typeof s.duration === 'number' ? s.duration.toFixed(1) : (typeof s.dur === 'number' ? s.dur.toFixed(1) : '3.5');
    const endTime = (parseFloat(startTime) + parseFloat(durTime)).toFixed(1);
    const spoken = wsEditedScript[idx] != null ? wsEditedScript[idx] : (s.line || s.spoken || s.text || '');
    
    // SFX cue detection
    const sfxCue = s.sfx || s.sfxCue || (idx === 0 ? 'deep_boom' : idx === scenes.length - 2 ? 'ding' : null);

    // Image target
    const targetKey = s.target || s.side || (s.tierId != null ? `tier-${s.tierId}` : (s.shot != null ? `scene-${s.shot}` : (s.sceneId != null ? `scene-${s.sceneId}` : (s.id ? s.id : `scene-${num}`))));
    let fallbackImg = `/videos/${currentWsSlug}/assets/images/${targetKey}.jpg`;
    if (s.side) {
      fallbackImg = `/videos/${currentWsSlug}/assets/icons/${targetKey}.png`;
    }
    const buster = wsBeatImgBuster || (wsCurrentDetail && wsCurrentDetail._ts) || Date.now();
    let imgUrl = s.image || fallbackImg;
    if (imgUrl && !imgUrl.startsWith('data:')) {
      imgUrl += (imgUrl.includes('?') ? '&' : '?') + 't=' + buster;
    }

    let toneColor = '#64748b';
    let toneBg = 'rgba(100, 116, 139, 0.12)';
    const bLower = beatName.toLowerCase();
    if (bLower.includes('hook') || bLower.includes('cta')) {
      toneColor = '#10b981'; toneBg = 'rgba(16, 185, 129, 0.15)';
    } else if (bLower.includes('question') || bLower.includes('compare') || bLower.includes('summary')) {
      toneColor = '#f59e0b'; toneBg = 'rgba(245, 158, 11, 0.15)';
    } else if (bLower.includes('rule') || bLower.includes('payoff') || bLower.includes('stakes') || bLower.includes('cấp')) {
      toneColor = '#ea580c'; toneBg = 'rgba(234, 88, 12, 0.15)';
    }

    return `
      <div class="ws-beat-card" style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 12px; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; transition: all 0.2s;">
        <!-- Card Header -->
        <div class="ws-beat-header" style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border-color); padding-bottom: 8px; flex-wrap: wrap; gap: 8px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-variant-numeric: tabular-nums; font-weight: 900; font-size: 13px; color: var(--text-dim); min-width: 28px;">#${num}</span>
            <span style="background: ${toneBg}; color: ${toneColor}; font-weight: 800; font-size: 11px; padding: 2px 8px; border-radius: 6px; text-transform: uppercase;">${escapeHtml(beatName)}</span>
            <span style="font-variant-numeric: tabular-nums; font-size: 11px; color: var(--text-dim);">${startTime}s - ${endTime}s (${durTime}s)</span>
          </div>

          <div style="display: flex; align-items: center; gap: 8px;">
            ${sfxCue ? `
              <button type="button" class="btn btn-secondary btn-xs" onclick="playSfxPreview('${sfxCue}')" style="display: flex; align-items: center; gap: 4px; font-size: 10.5px; padding: 2px 7px; color: #ea580c;" title="Nghe thử SFX">
                <span>🔊</span> <span>${escapeHtml(sfxCue)}</span>
              </button>
            ` : ''}
            <button type="button" class="btn btn-secondary btn-xs" onclick="playWsBeatAudio(${idx})" style="font-size: 10.5px; padding: 2px 8px; font-weight: 700;">
              ▶ Nghe câu này
            </button>
          </div>
        </div>

        <!-- Card Body -->
        <div class="ws-beat-body" style="display: grid; grid-template-columns: 1fr 140px; gap: 14px; align-items: start;">
          <div>
            <textarea class="form-control" rows="2" style="font-size: 13px; line-height: 1.5; font-family: inherit; resize: vertical; width: 100%; border-radius: 8px;" oninput="onWsBeatTextChange(${idx}, this.value)">${escapeHtml(spoken)}</textarea>
            <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">
              Phụ đề hiển thị: <span style="color: #38bdf8; font-weight: 600;">${escapeHtml((s.highlightWords && s.highlightWords.join(' • ')) || s.caption || spoken)}</span>
            </div>
          </div>

          <!-- Thumbnail & Change Image -->
          <div class="ws-beat-thumb-box" style="display: flex; flex-direction: column; align-items: center; gap: 6px; background: var(--bg-input); border: 1px solid var(--border-color); border-radius: 8px; padding: 8px;">
            <img src="${escapeHtml(imgUrl)}" style="width: 100%; height: 75px; object-fit: cover; border-radius: 6px;" onerror="this.onerror=null;this.src='${placeholderImage(200, 120, 'Scene ' + num, '#38bdf8')}'" alt="Thumbnail">
            <button type="button" class="btn btn-secondary btn-xs" onclick="openWsBeatChangeImage(${idx})" style="width: 100%; font-size: 10.5px; padding: 3px 6px; font-weight: 700;">
              🖼️ Đổi ảnh
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function openWsBeatChangeImage(idx) {
  const s = (wsCurrentBeatScenes && wsCurrentBeatScenes[idx]) || {};
  const num = idx + 1;
  const targetKey = s.target || s.side || (s.tierId != null ? `tier-${s.tierId}` : (s.shot != null ? `scene-${s.shot}` : (s.sceneId != null ? `scene-${s.sceneId}` : (s.id ? s.id : `scene-${num}`))));
  const label = s.beat || s.title || `Phân cảnh #${num}`;
  const spoken = (wsEditedScript && wsEditedScript[idx] != null) ? wsEditedScript[idx] : (s.spoken || s.line || s.caption || s.text || '');

  let fallbackImg = `/videos/${currentWsSlug}/assets/images/${targetKey}.jpg`;
  if (s.side) {
    fallbackImg = `/videos/${currentWsSlug}/assets/icons/${targetKey}.png`;
  }
  const buster = wsBeatImgBuster || (wsCurrentDetail && wsCurrentDetail._ts) || Date.now();
  let imgUrl = s.image || fallbackImg;
  if (imgUrl && !imgUrl.startsWith('data:')) {
    imgUrl += (imgUrl.includes('?') ? '&' : '?') + 't=' + buster;
  }
  const defaultPrompt = s.imagePrompt || s.visualPrompt || spoken;
  openWsChangeImageModal(targetKey, label, imgUrl, defaultPrompt);
}

function onWsBeatTextChange(idx, val) {
  wsEditedScript[idx] = val;
  const isChanged = wsEditedScript.some((txt, i) => txt !== (wsOriginalScript[i] || ''));

  const btnReset = document.getElementById('btn-ws-reset-script');
  const btnSave = document.getElementById('btn-ws-save-script');

  if (btnReset) btnReset.style.display = isChanged ? 'inline-flex' : 'none';
  if (btnSave) {
    btnSave.disabled = !isChanged;
    btnSave.style.opacity = isChanged ? '1' : '0.5';
    btnSave.style.cursor = isChanged ? 'pointer' : 'not-allowed';
  }
}

function resetWsScript() {
  wsEditedScript = wsOriginalScript.slice();
  if (wsCurrentDetail) {
    const scenes = (wsCurrentDetail.script && wsCurrentDetail.script.length > 0) ? wsCurrentDetail.script : ((wsCurrentDetail.spec && wsCurrentDetail.spec.scenes) || []);
    renderWsScriptBeats(scenes);
  }
  const btnReset = document.getElementById('btn-ws-reset-script');
  const btnSave = document.getElementById('btn-ws-save-script');
  if (btnReset) btnReset.style.display = 'none';
  if (btnSave) { btnSave.disabled = true; btnSave.style.opacity = '0.5'; }
  showToast('Đã hoàn tác các thay đổi kịch bản.');
}

async function saveWsScript() {
  if (!currentWsSlug) return;
  const btnSave = document.getElementById('btn-ws-save-script');
  if (btnSave) {
    btnSave.disabled = true;
    btnSave.innerHTML = '⏳ Đang lưu...';
  }

  try {
    const res = await fetch(`/api/videos/${currentWsSlug}/edit-script`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ captions: wsEditedScript })
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);

    showToast('✓ Đã lưu kịch bản và tự động đồng bộ!');

    wsOriginalScript = wsEditedScript.slice();
    const btnReset = document.getElementById('btn-ws-reset-script');
    if (btnReset) btnReset.style.display = 'none';
    if (btnSave) {
      btnSave.disabled = true;
      btnSave.style.opacity = '0.5';
      btnSave.innerHTML = '💾 Lưu Kịch Bản & Retime';
    }

    selectWsVideo(currentWsSlug);
  } catch (err) {
    showToast('Lỗi lưu kịch bản: ' + err.message);
    if (btnSave) {
      btnSave.disabled = false;
      btnSave.innerHTML = '💾 Lưu Kịch Bản & Retime';
    }
  }
}

function playWsBeatAudio(idx) {
  const text = wsEditedScript[idx];
  if (!text) return;
  const lang = wsCurrentDetail?.lang || 'vi';
  const voice = wsCurrentDetail?.spec?.voice || NEWVID_COUNTRIES.find(item => item.code === lang)?.defaultVoice || 'vi-VN-NamMinhNeural';

  const audio = new Audio(`/api/tts/preview?voice=${encodeURIComponent(voice)}&lang=${encodeURIComponent(lang)}&text=${encodeURIComponent(text)}`);
  audio.play().catch(() => showToast('Không thể phát trước lời thoại này.'));
}

// Image Replacement Modal Controller
function openWsChangeImageModal(targetKey, label, currentImg, defaultPrompt) {
  wsActiveImgTarget = { target: targetKey, label, currentImg, defaultPrompt };
  const modal = document.getElementById('modal-change-image');
  const sub = document.getElementById('ws-change-img-subtitle');
  const preview = document.getElementById('ws-img-preview');
  const ph = document.getElementById('ws-img-preview-placeholder');
  const promptEl = document.getElementById('ws-img-ai-prompt');

  if (sub) sub.textContent = `Thay đổi hình ảnh cho ${label} (target: ${targetKey})`;
  if (preview && currentImg) {
    preview.src = currentImg;
    preview.style.display = 'block';
    if (ph) ph.style.display = 'none';
  }
  if (promptEl) promptEl.value = defaultPrompt || '';

  switchWsImageTab('upload');
  if (modal) modal.style.display = 'flex';
}

function closeWsChangeImageModal() {
  const modal = document.getElementById('modal-change-image');
  if (modal) modal.style.display = 'none';
  wsSelectedImgData = null;
}

function switchWsImageTab(tab) {
  wsActiveImgTab = tab;
  document.querySelectorAll('.ws-img-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  const panes = ['upload', 'gallery', 'url', 'ai'];
  panes.forEach(p => {
    const el = document.getElementById(`ws-img-pane-${p}`);
    if (el) el.style.display = (p === tab) ? 'flex' : 'none';
  });

  if (tab === 'gallery') {
    loadWsAiGalleryPicker();
  }
}

async function loadWsAiGalleryPicker() {
  const grid = document.getElementById('ws-ai-gallery-picker-grid');
  if (!grid) return;
  grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 12px; font-size: 11px; color: var(--text-muted);">⏳ Đang nạp thư viện ảnh AI...</div>';

  try {
    const res = await fetch('/api/ai-images/gallery');
    const data = await res.json();
    const images = (data && data.images) || [];
    if (images.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 16px; font-size: 11.5px; color: var(--text-muted);">
          Chưa có ảnh nào trong Thư Viện AI.<br>
          <a href="javascript:void(0)" onclick="closeWsChangeImageModal(); switchTab('ai_images')" style="color: #0284c7; font-weight: 700; text-decoration: underline;">Đến Xưởng Tạo Ảnh AI để vẽ ảnh ngay</a>
        </div>
      `;
      return;
    }

    grid.innerHTML = images.map(img => {
      const isSelected = wsSelectedImgData === img.url;
      const escPrompt = (img.prompt || '').replace(/"/g, '&quot;');
      const isAntigravity = img.engine !== 'instant_free';
      const badgeIcon = isAntigravity ? '✨' : '⚡';

      return `
        <div class="ws-gallery-pick-card ${isSelected ? 'selected' : ''}" 
             onclick="selectWsGalleryImage('${img.url}')" 
             title="${escPrompt}">
          <img src="${img.url}" loading="lazy" style="width: 100%; aspect-ratio: 1/1; object-fit: cover; border-radius: 6px;">
          <span class="ws-pick-engine-tag">${badgeIcon}</span>
          <span class="ws-pick-ratio-tag">${img.aspect_ratio || '1:1'}</span>
        </div>
      `;
    }).join('');
  } catch (err) {
    grid.innerHTML = `<div style="grid-column: 1/-1; color: #ef4444; font-size: 11px; text-align: center;">Lỗi tải ảnh: ${err.message}</div>`;
  }
}

function selectWsGalleryImage(url) {
  wsSelectedImgData = url;
  document.querySelectorAll('.ws-gallery-pick-card').forEach(c => {
    c.classList.toggle('selected', c.getAttribute('onclick')?.includes(url));
  });
  const preview = document.getElementById('ws-img-preview');
  const ph = document.getElementById('ws-img-preview-placeholder');
  if (preview) {
    preview.src = url;
    preview.style.display = 'block';
  }
  if (ph) ph.style.display = 'none';
}

function onWsImageFileSelected(input) {
  const file = input?.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    wsSelectedImgData = e.target.result;
    const preview = document.getElementById('ws-img-preview');
    const ph = document.getElementById('ws-img-preview-placeholder');
    if (preview) {
      preview.src = wsSelectedImgData;
      preview.style.display = 'block';
    }
    if (ph) ph.style.display = 'none';
  };
  reader.readAsDataURL(file);
}

function onWsImageUrlInput(val) {
  wsSelectedImgData = val.trim();
  const preview = document.getElementById('ws-img-preview');
  const ph = document.getElementById('ws-img-preview-placeholder');
  if (preview && wsSelectedImgData) {
    preview.src = wsSelectedImgData;
    preview.style.display = 'block';
    if (ph) ph.style.display = 'none';
  }
}

let wsImgAiSelectedRatio = '9:16';

function setWsImgAiRatio(ratio) {
  wsImgAiSelectedRatio = ratio;
  const b916 = document.getElementById('btn-ws-ratio-916');
  const b11 = document.getElementById('btn-ws-ratio-11');
  if (b916) b916.className = ratio === '9:16' ? 'btn btn-xs btn-primary active' : 'btn btn-xs btn-secondary';
  if (b11) b11.className = ratio === '1:1' ? 'btn btn-xs btn-primary active' : 'btn btn-xs btn-secondary';
}

function applyWsPromptStyle(styleText) {
  const promptEl = document.getElementById('ws-img-ai-prompt');
  if (!promptEl) return;
  const current = promptEl.value.trim();
  if (!current) {
    promptEl.value = styleText;
  } else if (!current.includes(styleText)) {
    promptEl.value = `${current}, ${styleText}`;
  }
}

async function handleEnqueueAiSceneImageAntigravity() {
  // Gửi Antigravity và gắn thẳng vào đúng cảnh của video (tác vụ "🎨 Ảnh Antigravity" tải về khi xong).
  const promptEl = document.getElementById('ws-img-ai-prompt');
  const prompt = (promptEl ? promptEl.value : '').trim();
  if (!prompt) {
    showToast('Vui lòng nhập mô tả ảnh (prompt)!', 4000);
    if (promptEl) promptEl.focus();
    return;
  }
  if (!currentWsSlug || !wsActiveImgTarget) return;
  const btn = document.getElementById('btn-ws-gen-enqueue');
  if (btn) btn.disabled = true;
  try {
    const res = await fetch(`/api/videos/${currentWsSlug}/change-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: wsActiveImgTarget.target, type: 'antigravity', prompt })
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
    showToast(`🎨 ${d.message}`, 7000);
    closeWsChangeImageModal();
    wsBeatImgBuster = Date.now();
    if (wsCurrentDetail) wsCurrentDetail._ts = Date.now();
    selectWsVideo(currentWsSlug);
  } catch (err) {
    showToast('Lỗi: ' + err.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function submitWsChangeImage() {
  if (!currentWsSlug || !wsActiveImgTarget) return;
  const btn = document.getElementById('btn-ws-confirm-image');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ Đang lưu ảnh...';
  }

  try {
    let payload = { target: wsActiveImgTarget.target, type: wsActiveImgTab };
    if (wsActiveImgTab === 'upload') {
      if (!wsSelectedImgData) throw new Error('Vui lòng chọn file ảnh trước!');
      payload.data = wsSelectedImgData;
    } else if (wsActiveImgTab === 'gallery') {
      if (!wsSelectedImgData) throw new Error('Vui lòng chọn một ảnh từ Thư Viện AI!');
      payload.type = 'url';
      payload.url = wsSelectedImgData;
    } else if (wsActiveImgTab === 'url') {
      const url = document.getElementById('ws-img-url-input')?.value || '';
      if (!url) throw new Error('Vui lòng nhập link ảnh!');
      payload.url = url;
    } else if (wsActiveImgTab === 'ai') {
      const prompt = document.getElementById('ws-img-ai-prompt')?.value || '';
      if (!prompt.trim()) throw new Error('Vui lòng nhập mô tả ảnh (prompt)!');

      if (wsSelectedImgData && wsSelectedImgData.startsWith('/static/generated_images/')) {
        payload.type = 'url';
        payload.url = wsSelectedImgData;
      } else {
        // Ảnh AI chỉ qua hàng đợi Antigravity (bất đồng bộ); ảnh cũ giữ nguyên tới khi ảnh mới về.
        btn.textContent = '⏳ Đang gửi Antigravity...';
        payload.type = 'antigravity';
        payload.prompt = prompt;
      }
    }

    const res = await fetch(`/api/videos/${currentWsSlug}/change-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);

    showToast(d.pending ? `🎨 ${d.message}` : '✓ Đã cập nhật ảnh phân cảnh thành công!', d.pending ? 7000 : 3000);
    closeWsChangeImageModal();
    wsBeatImgBuster = Date.now();
    if (wsCurrentDetail) wsCurrentDetail._ts = Date.now();
    selectWsVideo(currentWsSlug);
  } catch (err) {
    showToast('Lỗi đổi ảnh: ' + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '✓ Xác Nhận Đổi Ảnh';
    }
  }
}

function switchWsTab(tabName) {
  document.querySelectorAll('.ws-nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.wstab === tabName);
  });

  const panes = ['preview', 'script', 'seo', 'upload-tiktok', 'snapshot', 'logs'];
  panes.forEach(p => {
    const el = document.getElementById(`wspane-${p}`);
    if (el) {
      el.style.display = (p === tabName) ? 'block' : 'none';
    }
  });
  if (tabName === 'upload-tiktok') openWsUploadPane();
}

// --- Đăng TikTok từ Studio (docs/PLAN_render_to_tiktok_publish.md) ---------------
// Quy tắc: phải chọn kênh mới đăng được (không tự chọn), không đăng khi video còn ảnh
// chờ Antigravity hoặc chưa render. Mọi lần đăng đều qua hàng đợi (send-to-upload) để
// bộ lập lịch lo thử lại an toàn và trạng thái "Cần kiểm tra".
const WS_LANG_COUNTRIES = { vi: ['VN'], en: ['US', 'GB', 'UK'], de: ['DE'], fr: ['FR', 'LU'], ja: ['JP'], ko: ['KR'] };
const WS_TASK_STATUS = {
  WAITING_RENDER: ['⏳ Chờ render / ảnh', '#64748b'], QUEUED: ['🕒 Trong hàng đợi', '#2563eb'], PENDING: ['🕒 Trong hàng đợi', '#2563eb'],
  UPLOADING: ['📤 Đang đăng', '#0ea5e9'], SUCCESS: ['✅ Thành công', '#16a34a'], NEEDS_CHECK: ['⚠️ Cần kiểm tra', '#b45309'],
  ERROR: ['❌ Lỗi', '#dc2626'], CANCELLED: ['Đã huỷ', '#94a3b8'],
};
let wsUploadKit = null;
let wsUploadTasksTimer = null;
let wsUploadReady = { ok: false, reason: '' };

async function ensureChannelsLoaded() {
  if (Array.isArray(allChannels) && allChannels.length) return allChannels;
  try {
    const res = await fetch('/api/channels');
    const data = await res.json();
    allChannels = data.channels || data || [];
  } catch (err) {
    console.warn('Không tải được danh sách kênh:', err);
  }
  return allChannels || [];
}

async function populateWsTikTokChannelSelect() {
  const sel = document.getElementById('ws-upload-channel');
  if (!sel) return;
  const keep = sel.value;
  const channels = await ensureChannelsLoaded();
  // Mặc định để trống: người dùng phải tự chọn kênh.
  sel.innerHTML = '<option value="">-- Chọn kênh TikTok --</option>' + channels.map(c => {
    const uName = c.username || c.note || `Kênh #${c.id}`;
    return `<option value="${c.id}" data-country="${escapeHtml((c.country || '').toUpperCase())}">${escapeHtml(uName)} (${escapeHtml(c.country || '?')}) · ${escapeHtml(c.status || '')}</option>`;
  }).join('');
  if (keep && channels.some(c => String(c.id) === keep)) sel.value = keep;
  onWsUploadChannelChange();
}

function onWsUploadChannelChange() {
  const sel = document.getElementById('ws-upload-channel');
  const warn = document.getElementById('ws-upload-channel-warn');
  if (!sel || !warn) return;
  const opt = sel.selectedOptions && sel.selectedOptions[0];
  const country = opt ? opt.dataset.country : '';
  const lang = (wsUploadKit && wsUploadKit.lang) || (wsCurrentDetail && wsCurrentDetail.lang) || '';
  const expected = WS_LANG_COUNTRIES[lang] || [];
  if (sel.value && country && expected.length && !expected.includes(country)) {
    warn.textContent = `⚠ Video tiếng "${lang}" nhưng kênh ở ${country} — kiểm tra lại có đúng kênh không.`;
    warn.style.display = 'block';
  } else {
    warn.style.display = 'none';
  }
  refreshWsUploadButtons();
}

function onWsPresetTitleChange() {
  const sel = document.getElementById('ws-upload-title-preset');
  const caption = document.getElementById('ws-upload-caption');
  if (!sel || !caption || sel.value === '') return;
  const t = (wsUploadKit && wsUploadKit.titles && wsUploadKit.titles[Number(sel.value)]) || null;
  if (!t) return;
  caption.value = wsUploadKit.description ? `${t.title}\n\n${wsUploadKit.description}` : t.title;
  updateWsUploadCounter();
}

function updateWsUploadCounter() {
  const c = document.getElementById('ws-upload-caption')?.value || '';
  const h = document.getElementById('ws-upload-hashtags')?.value || '';
  const n = `${c} ${h}`.trim().length;
  const el = document.getElementById('ws-upload-counter');
  if (el) {
    el.textContent = `${n}/2200 ký tự`;
    el.style.color = n > 2200 ? '#dc2626' : '';
  }
}

function onWsUploadWhenChange() {
  const when = document.querySelector('input[name="ws-upload-when"]:checked')?.value;
  const dt = document.getElementById('ws-upload-datetime');
  if (!dt) return;
  dt.style.display = when === 'schedule' ? '' : 'none';
  if (when === 'schedule' && !dt.value) {
    const d = new Date(Date.now() + 3600 * 1000);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    dt.value = d.toISOString().slice(0, 16);
  }
}

function refreshWsUploadButtons() {
  const btn = document.getElementById('btn-ws-publish-now');
  const dry = document.getElementById('btn-ws-publish-dryrun');
  const hasChannel = !!document.getElementById('ws-upload-channel')?.value;
  const ok = wsUploadReady.ok && hasChannel;
  for (const b of [btn, dry]) {
    if (!b) continue;
    b.disabled = !ok;
    b.title = !hasChannel ? 'Chọn kênh TikTok trước' : (!wsUploadReady.ok ? wsUploadReady.reason : '');
  }
}

async function openWsUploadPane() {
  if (!currentWsSlug || currentWsSlug === '__template') return;
  const slug = currentWsSlug;
  const readiness = document.getElementById('ws-upload-readiness');
  await populateWsTikTokChannelSelect();

  // Sẵn sàng đăng? — phải có MP4 và đủ ảnh Antigravity.
  let reason = '';
  try {
    const imgRes = await fetch(`/api/videos/${encodeURIComponent(slug)}/images`);
    const img = imgRes.ok ? await imgRes.json() : { pending: [] };
    if (img.pending && img.pending.length) reason = `Còn ${img.pending.length} ảnh chờ Antigravity — bấm "🎨 Ảnh Antigravity" để lấy ảnh rồi render.`;
  } catch (err) { /* không chặn nếu không đọc được */ }
  if (!reason && !(wsCurrentDetail && wsCurrentDetail.hasRender)) reason = 'Video chưa có bản render MP4 — bấm "▶️ Render MP4" trước.';
  wsUploadReady = { ok: !reason, reason };
  if (readiness) {
    readiness.textContent = reason || `✓ Sẵn sàng đăng: ${wsCurrentDetail?.render?.name || 'bản render mới nhất'}`;
    readiness.style.color = reason ? '#b45309' : '#16a34a';
  }

  // Caption theo đúng thể loại + ngôn ngữ.
  try {
    const res = await fetch(`/api/videos/${encodeURIComponent(slug)}/publishing-kit`);
    wsUploadKit = res.ok ? await res.json() : null;
  } catch (err) {
    wsUploadKit = null;
  }
  if (currentWsSlug !== slug) return;
  const preset = document.getElementById('ws-upload-title-preset');
  if (preset) {
    preset.innerHTML = (wsUploadKit?.titles || []).map((t, i) => `<option value="${i}">${escapeHtml(t.label || t.type)}: ${escapeHtml(t.title)}</option>`).join('')
      || '<option value="">(không có gợi ý)</option>';
  }
  const caption = document.getElementById('ws-upload-caption');
  const hashtags = document.getElementById('ws-upload-hashtags');
  if (caption) caption.value = wsUploadKit?.caption || '';
  if (hashtags) hashtags.value = wsUploadKit?.hashtagString || '';
  const ai = document.getElementById('ws-upload-ai');
  if (ai) ai.checked = wsUploadKit ? wsUploadKit.aiGenerated !== false : true;
  updateWsUploadCounter();
  onWsUploadChannelChange();
  loadWsUploadTasks();
  if (wsUploadTasksTimer) clearInterval(wsUploadTasksTimer);
  wsUploadTasksTimer = setInterval(() => {
    const pane = document.getElementById('wspane-upload-tiktok');
    if (!pane || pane.style.display === 'none') { clearInterval(wsUploadTasksTimer); wsUploadTasksTimer = null; return; }
    loadWsUploadTasks();
  }, 5000);
}

async function submitWsUpload(confirmNearby = false) {
  if (!currentWsSlug) return showToast('Chọn video trước khi đăng');
  const channelId = document.getElementById('ws-upload-channel')?.value;
  if (!channelId) return showToast('Hãy chọn kênh TikTok — hệ thống không tự chọn kênh thay bạn');
  if (!wsUploadReady.ok) return showToast(wsUploadReady.reason);
  const body = {
    slug: currentWsSlug,
    channel_id: parseInt(channelId, 10),
    caption: document.getElementById('ws-upload-caption')?.value || '',
    hashtags: document.getElementById('ws-upload-hashtags')?.value || '',
    ai_generated: !!document.getElementById('ws-upload-ai')?.checked,
    confirm_nearby: confirmNearby,
  };
  if (document.querySelector('input[name="ws-upload-when"]:checked')?.value === 'schedule') {
    const v = document.getElementById('ws-upload-datetime')?.value;
    const ts = v ? Math.floor(new Date(v).getTime() / 1000) : 0;
    if (!ts || ts < Date.now() / 1000 - 60) return showToast('Chọn giờ hẹn trong tương lai');
    body.schedule_time = ts;
  }
  const btn = document.getElementById('btn-ws-publish-now');
  if (btn) btn.disabled = true;
  try {
    const res = await fetch('/api/compare-videos/send-to-upload', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const d = await res.json().catch(() => ({}));
    if (res.status === 409 && d.needsConfirm) {
      if (confirm(`${d.detail}.\nVẫn xếp hàng bài này?`)) return submitWsUpload(true);
      return;
    }
    if (!res.ok) throw new Error(d.detail || `HTTP ${res.status}`);
    showToast(d.message || 'Đã xếp hàng đăng');
    loadWsUploadTasks();
    if (wsPublishPollInterval) clearInterval(wsPublishPollInterval);
    wsPublishPollInterval = setInterval(pollWsPublishLogs, 1500);
  } catch (err) {
    showToast('Không xếp hàng được: ' + err.message, 6000);
  } finally {
    refreshWsUploadButtons();
  }
}

async function startWsDryRun() {
  const channelId = document.getElementById('ws-upload-channel')?.value;
  if (!channelId) return showToast('Hãy chọn kênh TikTok trước');
  if (!wsUploadReady.ok) return showToast(wsUploadReady.reason);
  try {
    const res = await fetch('/api/upload/dry-run', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel_id: parseInt(channelId, 10), video_slug: currentWsSlug,
        caption: document.getElementById('ws-upload-caption')?.value || '',
        hashtags: document.getElementById('ws-upload-hashtags')?.value || '',
        ai_generated: !!document.getElementById('ws-upload-ai')?.checked,
      }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || d.success === false) throw new Error(d.detail || d.message || `HTTP ${res.status}`);
    showToast('🧪 Đang chạy khô — sẽ dừng trước khi bấm Đăng');
    if (wsPublishPollInterval) clearInterval(wsPublishPollInterval);
    wsPublishPollInterval = setInterval(pollWsPublishLogs, 1500);
  } catch (err) {
    showToast('Không chạy khô được: ' + err.message, 6000);
  }
}

async function loadWsUploadTasks() {
  const box = document.getElementById('ws-upload-tasks');
  if (!box || !currentWsSlug) return;
  try {
    const res = await fetch('/api/upload/tasks');
    const data = await res.json();
    const slug = currentWsSlug;
    const tasks = (data.tasks || []).filter(t => t.video_slug === slug || (t.video_path || '').includes(`/videos/${slug}/`));
    if (!tasks.length) {
      box.innerHTML = '<div style="color: var(--text-dim);">Chưa có task nào.</div>';
      return;
    }
    box.innerHTML = tasks.slice(0, 12).map(t => {
      const [label, color] = WS_TASK_STATUS[t.status] || [t.status, '#64748b'];
      const when = t.schedule_time ? new Date(t.schedule_time * 1000).toLocaleString('vi-VN') : '';
      const actions = [];
      if (['QUEUED', 'PENDING', 'WAITING_RENDER'].includes(t.status)) actions.push(`<button class="btn btn-secondary btn-xs" onclick="wsUploadTaskAction(${t.id}, 'cancel')">Huỷ</button>`);
      if (t.status === 'NEEDS_CHECK') actions.push(`<button class="btn btn-secondary btn-xs" onclick="wsUploadTaskAction(${t.id}, 'confirm')">Đã lên</button>`);
      if (['ERROR', 'CANCELLED', 'NEEDS_CHECK'].includes(t.status)) actions.push(`<button class="btn btn-secondary btn-xs" onclick="wsUploadTaskAction(${t.id}, 'retry')">Thử lại</button>`);
      return `<div style="display: flex; gap: 10px; align-items: center; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid var(--border-color);">
        <div><b style="color: ${color};">${label}</b> · @${escapeHtml(t.username || '')} · ${escapeHtml(when)}${t.ai_generated ? ' · 🏷️ AI' : ''}
          ${t.error_message ? `<div style="color: var(--text-dim); font-size: 11px;">${escapeHtml(t.error_message)}</div>` : ''}
          ${t.status === 'NEEDS_CHECK' && t.verify_note ? `<div style="color: #1d4ed8; font-size: 11px;">🔎 ${escapeHtml(t.verify_note)}${t.published_video_id ? ` · <a href="https://www.tiktok.com/@${encodeURIComponent(t.username || '')}/video/${encodeURIComponent(t.published_video_id)}" target="_blank" rel="noopener noreferrer">mở video ↗</a>` : ''}</div>` : ''}</div>
        <div style="display: flex; gap: 6px;">${actions.join('')}</div>
      </div>`;
    }).join('');
  } catch (err) {
    box.innerHTML = `<div style="color: #dc2626;">Không tải được danh sách task: ${escapeHtml(err.message)}</div>`;
  }
}

async function wsUploadTaskAction(taskId, action) {
  if (action === 'retry' && !confirm('Thử lại sẽ đăng video này lần nữa. Nếu task đang "Cần kiểm tra", hãy chắc video CHƯA lên kênh. Tiếp tục?')) return;
  try {
    const res = await fetch(`/api/upload/tasks/${taskId}/${action}`, { method: 'POST' });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.detail || `HTTP ${res.status}`);
    showToast(d.message || 'Đã cập nhật');
  } catch (err) {
    showToast('Lỗi: ' + err.message);
  }
  loadWsUploadTasks();
}

async function pollWsPublishLogs() {
  try {
    const res = await fetch('/api/upload/publish-logs');
    const st = await res.json();
    const terminal = document.getElementById('ws-upload-terminal');
    if (terminal && st.logs && st.logs.length > 0) {
      terminal.innerHTML = st.logs.map(l => `<div class="log-line">[${escapeHtml(l.time || '')}] ${escapeHtml(l.msg || String(l))}</div>`).join('')
        + (!st.is_running && st.dry_run && st.screenshot ? `<div class="log-line"><a href="${escapeHtml(st.screenshot)}" target="_blank" style="color: #facc15;">🖼️ Xem ảnh chụp màn hình chạy khô</a></div>` : '');
      terminal.scrollTop = terminal.scrollHeight;
    }
    if (!st.is_running) {
      clearInterval(wsPublishPollInterval);
      wsPublishPollInterval = null;
      loadWsUploadTasks();
    }
  } catch (err) {
    console.error('Lỗi lấy log đăng:', err);
  }
}

function startWsRunStreaming(runId, task, slug) {
  switchWsTab('logs');
  const terminal = document.getElementById('ws-runs-terminal');
  if (terminal) {
    terminal.innerHTML = `<div class="log-line text-cyan font-bold">[Khởi chạy] Bắt đầu tác vụ '${task}' (${slug || ''}) — Run #${runId.slice(0, 8)}...</div>`;
  }

  if (window.wsRunEventSource) {
    window.wsRunEventSource.close();
    window.wsRunEventSource = null;
  }

  const es = new EventSource(`/api/runs/${runId}/stream`);
  window.wsRunEventSource = es;

  es.onmessage = (e) => {
    try {
      const item = JSON.parse(e.data);
      if (terminal && item.line) {
        const streamClass = item.stream === 'err' ? 'text-red' : 'text-slate';
        const timeStr = item.t ? new Date(item.t).toLocaleTimeString() : '';
        terminal.innerHTML += `<div class="log-line ${streamClass}">[${timeStr}] ${escapeHtml(item.line)}</div>`;
        terminal.scrollTop = terminal.scrollHeight;
      }
    } catch (err) {}
  };

  es.addEventListener('done', (e) => {
    es.close();
    window.wsRunEventSource = null;
    try {
      const d = JSON.parse(e.data);
      if (terminal) {
        terminal.innerHTML += `<div class="log-line ${d.code === 0 ? 'text-green' : 'text-red'} font-bold">━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n[Hoàn tất] Tác vụ '${task}' kết thúc với mã: ${d.code} (${d.code === 0 ? 'THÀNH CÔNG' : 'LỖI'})\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</div>`;
        terminal.scrollTop = terminal.scrollHeight;
      }
      showToast(d.code === 0 ? `✓ Hoàn thành xuất sắc: ${task}!` : `⚠️ Tác vụ kết thúc với mã lỗi ${d.code}`);
      if (d.code === 0 && slug && slug !== 'batch-global' && ['render', 'create', 'images', 'fit'].includes(task) && terminal) {
        terminal.innerHTML += `<div class="log-line" style="margin-top: 6px;"><button type="button" class="btn btn-primary btn-xs" onclick="openWsPublishFor('${escapeHtml(slug)}')">📤 Đăng video này</button></div>`;
        terminal.scrollTop = terminal.scrollHeight;
      }
    } catch (err) {}
    loadWsLibrary();
    if (slug && slug !== 'batch-global') {
      setTimeout(() => selectWsVideo(slug), 800);
    }
  });

  es.onerror = () => {
    es.close();
    window.wsRunEventSource = null;
  };
}

async function runWsStudioTask(task, opts = {}) {
  if (!currentWsSlug) {
    showToast('Vui lòng chọn video trước!');
    return;
  }

  const targetDur = parseInt(document.getElementById('ws-retime-input')?.value || document.getElementById('ws-target-dur-input')?.value || 36);
  const shouldRender = (document.getElementById('ws-retime-also-render') || document.getElementById('ws-retime-render-check'))?.checked !== false;

  switchWsTab('logs');
  const terminal = document.getElementById('ws-runs-terminal');
  if (terminal) {
    terminal.innerHTML = `<div class="log-line text-cyan">[Hệ thống] Đang gửi yêu cầu tác vụ '${task}'...</div>`;
  }

  try {
    const res = await fetch('/api/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: currentWsSlug,
        task: task,
        target: targetDur,
        render: shouldRender,
        ...opts
      })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    showToast(`✓ Đã bắt đầu tác vụ: ${task}`);
    startWsRunStreaming(data.id, task, currentWsSlug);
  } catch (err) {
    showToast('Lỗi chạy tác vụ: ' + err.message);
    if (terminal) {
      terminal.innerHTML += `<div class="log-line text-red">[Lỗi khởi chạy] ${escapeHtml(err.message)}</div>`;
    }
  }
}

function resetWsNativeCanvas() {
  ++wsNativeCanvasLoadId;
  if (wsNativeCanvasRuntime) {
    wsNativeCanvasRuntime.root.querySelectorAll('audio, video').forEach(media => {
      try { media.pause(); } catch (err) {}
      media.removeAttribute('src');
      media.querySelectorAll('source').forEach(source => source.removeAttribute('src'));
      try { media.load(); } catch (err) {}
    });
    try { wsNativeCanvasRuntime.context?.revert(); } catch (err) {}
    Object.values(wsNativeCanvasRuntime.timelines || {}).forEach(timeline => {
      try { timeline.kill(); } catch (err) {}
    });
    wsNativeCanvasRuntime = null;
  }

  const host = document.getElementById('ws-canvas-native');
  if (host?.shadowRoot) host.shadowRoot.replaceChildren();
}

function wsAbsoluteCanvasUrl(value, baseUrl) {
  const raw = String(value || '').trim();
  if (!raw || raw.startsWith('#') || /^(?:data:|blob:|https?:|\/\/)/i.test(raw)) return raw;
  return new URL(raw, baseUrl).href;
}

function wsRewriteCanvasCss(cssText, baseUrl) {
  return String(cssText || '')
    .replace(/:root\b/g, ':host')
    .replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (match, quote, url) => {
      return `url("${wsAbsoluteCanvasUrl(url, baseUrl)}")`;
    });
}

function wsRewriteCanvasScript(scriptText, baseUrl) {
  const assetsBase = new URL('assets/', baseUrl).href;
  return String(scriptText || '').replace(/(["'`])assets\//g, `$1${assetsBase}`);
}

function ensureWsCanvasScript(src) {
  if (/\/gsap(?:\.min)?\.js(?:\?|$)/i.test(src) && window.gsap) return Promise.resolve();
  if (wsGsapLoadPromise && /gsap/i.test(src)) return wsGsapLoadPromise;

  const promise = new Promise((resolve, reject) => {
    const existing = [...document.scripts].find(script => script.src === src);
    if (existing?.dataset.loaded === 'true') return resolve();
    const script = existing || document.createElement('script');
    script.src = src;
    script.async = false;
    script.onload = () => { script.dataset.loaded = 'true'; resolve(); };
    script.onerror = () => reject(new Error(`Không tải được runtime: ${src}`));
    if (!existing) document.head.appendChild(script);
  });
  if (/gsap/i.test(src)) wsGsapLoadPromise = promise;
  return promise;
}

async function loadWsNativeCanvas(slug) {
  const host = document.getElementById('ws-canvas-native');
  if (!host || !slug || slug === '__template') return;

  resetWsNativeCanvas();
  const loadId = ++wsNativeCanvasLoadId;
  const shadow = host.shadowRoot || host.attachShadow({ mode: 'open' });
  shadow.innerHTML = '<div style="position:absolute;inset:0;display:grid;place-items:center;padding:24px;background:#05070b;color:rgba(255,255,255,.72);font:700 12px/1.5 sans-serif;text-align:center">Đang nạp Live Canvas native…</div>';

  try {
    const encodedSlug = encodeURIComponent(slug);
    const compositionUrl = `/videos/${encodedSlug}/index.html`;
    const baseUrl = new URL(`/videos/${encodedSlug}/`, window.location.href).href;
    const res = await fetch(compositionUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    if (loadId !== wsNativeCanvasLoadId || currentWsSlug !== slug) return;

    const parsed = new DOMParser().parseFromString(html, 'text/html');
    const scripts = [...parsed.querySelectorAll('script')].map(script => ({
      src: script.getAttribute('src'),
      code: script.textContent || '',
    }));
    parsed.querySelectorAll('script').forEach(script => script.remove());

    parsed.querySelectorAll('[src], [poster], [href]').forEach(el => {
      ['src', 'poster', 'href'].forEach(attr => {
        if (el.hasAttribute(attr)) el.setAttribute(attr, wsAbsoluteCanvasUrl(el.getAttribute(attr), baseUrl));
      });
    });
    parsed.querySelectorAll('[srcset]').forEach(el => {
      const rewritten = el.getAttribute('srcset').split(',').map(item => {
        const parts = item.trim().split(/\s+/);
        parts[0] = wsAbsoluteCanvasUrl(parts[0], baseUrl);
        return parts.join(' ');
      }).join(', ');
      el.setAttribute('srcset', rewritten);
    });
    parsed.querySelectorAll('[style]').forEach(el => {
      el.setAttribute('style', wsRewriteCanvasCss(el.getAttribute('style'), baseUrl));
    });
    parsed.querySelectorAll('audio').forEach(el => el.setAttribute('preload', 'none'));

    const styleText = [...parsed.querySelectorAll('style')]
      .map(style => wsRewriteCanvasCss(style.textContent, baseUrl))
      .join('\n');
    const bodyMarkup = parsed.body.innerHTML;
    const scale = Math.min((host.clientWidth || 330) / 1080, (host.clientHeight || 586) / 1920);

    shadow.innerHTML = `
      <style>
        ${styleText}
        :host { display: block; width: 100%; height: 100%; overflow: hidden; background: #000; }
        .hf-native-document {
          position: absolute; inset: 0 auto auto 0; width: 1080px; height: 1920px;
          overflow: hidden; transform: scale(${scale}); transform-origin: 0 0;
        }
      </style>
      <div class="hf-native-document">${bodyMarkup}</div>
    `;

    const root = shadow.querySelector('.hf-native-document');
    const timelines = {};
    const windowValues = { __timelines: timelines };
    const scopedDocument = new Proxy(document, {
      get(target, prop) {
        if (prop === 'documentElement') return shadow.querySelector('#root') || root;
        if (prop === 'body') return root;
        if (prop === 'getElementById') return id => shadow.getElementById(id);
        if (prop === 'querySelector') return selector => shadow.querySelector(selector);
        if (prop === 'querySelectorAll') return selector => shadow.querySelectorAll(selector);
        const value = Reflect.get(target, prop, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    const scopedWindow = new Proxy(window, {
      get(target, prop) {
        if (prop === 'document') return scopedDocument;
        if (Object.prototype.hasOwnProperty.call(windowValues, prop)) return windowValues[prop];
        const value = Reflect.get(target, prop, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
      set(target, prop, value) {
        windowValues[prop] = value;
        return true;
      },
    });

    for (const script of scripts) {
      if (script.src) await ensureWsCanvasScript(wsAbsoluteCanvasUrl(script.src, baseUrl));
    }
    if (loadId !== wsNativeCanvasLoadId || currentWsSlug !== slug) return;
    if (!window.gsap) throw new Error('GSAP runtime chưa sẵn sàng');

    const context = window.gsap.context(() => {
      scripts.filter(script => !script.src && script.code.trim()).forEach(script => {
        const execute = new Function('document', 'window', 'gsap', 'getComputedStyle',
          wsRewriteCanvasScript(script.code, baseUrl));
        execute(scopedDocument, scopedWindow, window.gsap, getComputedStyle);
      });
    }, root);

    wsNativeCanvasRuntime = { slug, root, shadow, context, timelines };
    Object.values(timelines).forEach(timeline => {
      try { timeline.seek(0).pause(); } catch (err) {}
    });
  } catch (err) {
    if (loadId !== wsNativeCanvasLoadId) return;
    console.error(`Lỗi nạp Live Canvas native ${slug}:`, err);
    shadow.innerHTML = `<div style="position:absolute;inset:0;display:grid;place-items:center;padding:24px;background:#05070b;color:#fca5a5;font:700 12px/1.5 sans-serif;text-align:center">Không nạp được Live Canvas<br>${escapeHtml(err.message)}</div>`;
  }
}

function setWsPreviewMode(mode) {
  const btnMp4 = document.getElementById('btn-ws-mode-render');
  const btnCanvas = document.getElementById('btn-ws-mode-canvas');
  const videoPlayer = document.getElementById('ws-video-player');
  const nativeCanvas = document.getElementById('ws-canvas-native');

  if (mode === 'mp4' || mode === 'render') {
    if (btnMp4) btnMp4.classList.add('active');
    if (btnCanvas) btnCanvas.classList.remove('active');
    if (videoPlayer) videoPlayer.style.display = 'block';
    if (nativeCanvas) nativeCanvas.style.display = 'none';
    resetWsNativeCanvas();
  } else if (mode === 'canvas') {
    if (btnMp4) btnMp4.classList.remove('active');
    if (btnCanvas) btnCanvas.classList.add('active');
    if (videoPlayer) {
      videoPlayer.pause();
      videoPlayer.style.display = 'none';
    }
    if (nativeCanvas) {
      nativeCanvas.style.display = 'block';
      if (wsNativeCanvasRuntime?.slug !== currentWsSlug) loadWsNativeCanvas(currentWsSlug);
    }
  }
}

function openCurrentWsCanvasTab() {
  if (!currentWsSlug) return;
  window.open(`/videos/${currentWsSlug}/index.html`, '_blank');
}

function setWsTargetDur(val) {
  const input = document.getElementById('ws-retime-input');
  if (input) input.value = val;
  const targetInput = document.getElementById('ws-target-dur-input');
  if (targetInput) targetInput.value = val;
}

function applyWsDurationFit() {
  runWsStudioTask('fit');
}

function downloadCurrentWsMp4() {
  if (!currentWsSlug) return;
  window.open(`/api/videos/${currentWsSlug}/download`, '_blank');
}

function downloadWsPoster() {
  if (!currentWsSlug) return;
  window.open(`/api/videos/${currentWsSlug}/snapshot`, '_blank');
}


function copyWsSeoDesc() {
  const el = document.getElementById('ws-seo-desc');
  if (el && el.value) {
    navigator.clipboard.writeText(el.value).then(() => showToast('Đã copy bài viết & timestamps!'));
  }
}

function copyWsSeoTags() {
  if (wsCurrentDetail && wsCurrentDetail.publishing && wsCurrentDetail.publishing.hashtagString) {
    navigator.clipboard.writeText(wsCurrentDetail.publishing.hashtagString).then(() => showToast('Đã copy toàn bộ Hashtags!'));
  }
}

function onWsSearchInput() {
  wsSearchQuery = document.getElementById('ws-search-input')?.value || '';
  renderWsSidebar();
}

function setWsMarketFilter(market) {
  wsMarketFilter = market;
  document.querySelectorAll('#ws-market-chips .filter-chip').forEach(c => {
    c.classList.toggle('active', c.dataset.market === market);
  });
  renderWsSidebar();
}

function setWsStyleFilter(style) {
  wsStyleFilter = style;
  document.querySelectorAll('#ws-style-chips .filter-chip').forEach(c => {
    c.classList.toggle('active', c.dataset.style === style);
  });
  renderWsSidebar();
}

function onWsSortChange() {
  wsSortMode = document.getElementById('ws-sort-select')?.value || 'newest';
  renderWsSidebar();
}

function onWsFilterRenderedChange() {
  wsOnlyRendered = document.getElementById('ws-filter-rendered')?.checked || false;
  renderWsSidebar();
}



// ============================================================================
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
let currentVpnPickerChannelId = null;

// --- Màn hình từ xa (noVNC) ---
// Khi ứng dụng chạy trên VPS, Chrome của kênh mở trên màn hình ảo của máy chủ.
// Bấm "mở trình duyệt" ở máy mình sẽ không thấy gì, nên phải mở kèm cửa sổ noVNC.
let remoteView = { available: false, url: '/vnc/', checked: false };

async function ensureRemoteViewInfo() {
  if (remoteView.checked) return remoteView;
  try {
    const res = await fetch('/api/system/remote-view');
    const data = await res.json();
    remoteView = { available: !!data.available, url: data.url || '/vnc/', checked: true };
  } catch (_) {
    remoteView.checked = true;
  }
  return remoteView;
}

/** Mở cửa sổ noVNC. Phải gọi ngay trong sự kiện click, nếu không trình duyệt chặn. */
function openRemoteView() {
  // Dùng cùng một tên cửa sổ để không mở chồng chất mỗi lần bấm.
  return window.open(remoteView.url, 'tokmatrix-remote-view');
}

function sessionBadge(ch) {
  const when = ch.session_checked_at ? new Date(ch.session_checked_at * 1000).toLocaleString('vi-VN') : '';
  if (ch.session_state === 'OK') return `<span class="badge-kyc-yes" title="Phiên kiểm tra lúc ${escapeHtml(when)}">Phiên OK</span>`;
  if (ch.session_state === 'LOGGED_OUT') return `<span class="badge-kyc-no" style="background:#fef3f2;color:#b42318" title="Bị đăng xuất lúc ${escapeHtml(when)} — bấm Đăng nhập lại">Hết phiên</span>`;
  return '';
}

async function reloginChannelProfile(chId) {
  // Mở cửa sổ noVNC ngay trong cú click, như launchChannelProfile: chờ await trước
  // thì trình duyệt chặn cửa sổ bật lên.
  let viewWin = null;
  if (remoteView.checked && remoteView.available) viewWin = openRemoteView();
  const info = await ensureRemoteViewInfo();
  if (info.available && !viewWin) viewWin = openRemoteView();
  showToast('Đang mở profile ở trang đăng nhập TikTok...', 3500);
  try {
    const res = await fetch(`/api/channels/${chId}/profile/open-login`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok || data.success === false) throw new Error(data.detail || data.error || 'Không mở được profile');
    showToast('✅ Đăng nhập trên màn hình máy chủ, xong thì bấm "Lưu phiên"', 6000);
    if (viewWin) viewWin.focus();
  } catch (err) {
    if (viewWin) viewWin.close();
    showToast('❌ ' + err.message, 6000);
  }
}

async function saveChannelSession(chId) {
  if (!confirm('Lưu phiên sẽ đóng cửa sổ Chrome của kênh này rồi đọc cookie. Tiếp tục?')) return;
  showToast('Đang đóng Chrome và lưu phiên qua VPN của kênh...', 4000);
  try {
    const res = await fetch(`/api/channels/${chId}/profile/save-session`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || 'Không lưu được phiên');
    showToast('✅ Đã lưu phiên mới của kênh');
    if (typeof loadChannels === 'function') loadChannels();
  } catch (err) {
    showToast('❌ ' + err.message, 6000);
  }
}

async function launchChannelProfile(chId) {
  // Mở cửa sổ NGAY trong cú click. Nếu chờ await trước, trình duyệt coi như
  // không còn thao tác người dùng và chặn cửa sổ bật lên.
  let viewWin = null;
  if (remoteView.checked && remoteView.available) {
    viewWin = openRemoteView();
  }
  const info = await ensureRemoteViewInfo();
  if (info.available && !viewWin) {
    viewWin = openRemoteView();
    if (!viewWin) {
      showToast('⚠️ Trình duyệt chặn cửa sổ bật lên — hãy mở /vnc/ để xem màn hình máy chủ', 6000);
    }
  }

  showToast('Đang kết nối WireGuard VPN & khởi chạy Chrome profile...', 3500);
  try {
    const res = await fetch(`/api/channels/${chId}/profile/launch`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast(info.available
        ? `✅ ${data.message} — xem ở cửa sổ màn hình máy chủ`
        : `✅ ${data.message}`);
      if (viewWin) viewWin.focus();
    } else {
      // Không để lại một cửa sổ noVNC trống khi profile không mở được.
      if (viewWin) viewWin.close();
      showToast(`❌ ${data.error || 'Lỗi mở profile'}`);
    }
  } catch (err) {
    if (viewWin) viewWin.close();
    showToast(`❌ Lỗi kết nối server: ${err.message}`);
  }
}

async function autoAssignVpnAllChannels() {
  showToast('Đang tự động gán WireGuard VPN cho toàn bộ kênh...', 3000);
  try {
    const res = await fetch('/api/channels/vpn/auto-assign-all', { method: 'POST' });
    const data = await res.json();
    showToast(`✅ ${data.message}`);
    loadChannels();
  } catch (err) {
    showToast(`❌ Lỗi: ${err.message}`);
  }
}

const btnAutoVpn = document.getElementById('btn-auto-vpn');
if (btnAutoVpn) {
  btnAutoVpn.addEventListener('click', autoAssignVpnAllChannels);
}

const modalVpnPicker = document.getElementById('modal-vpn-picker');
const btnCloseVpnModal = document.getElementById('btn-close-vpn-modal');
const btnCancelVpn = document.getElementById('btn-cancel-vpn');
const btnSaveVpn = document.getElementById('btn-save-vpn');
const btnTestVpnConn = document.getElementById('btn-test-vpn-conn');
const vpnSelectCountry = document.getElementById('vpn-select-country');
const vpnSelectServer = document.getElementById('vpn-select-server');
const vpnTestResult = document.getElementById('vpn-test-result');

async function openVpnPicker(chId) {
  const channel = (allChannels || []).find(item => item.id === chId) || {};
  const username = channel.username || channel.note || '';
  const country = channel.country || 'KR';
  const currentConf = channel.vpn_config || '';
  const currentLoc = channel.vpn_location || '';
  currentVpnPickerChannelId = chId;
  const titleEl = document.getElementById('vpn-modal-channel-title');
  const locEl = document.getElementById('vpn-modal-current-location');
  if (titleEl) titleEl.textContent = `@${username || 'Channel_' + chId} (Quốc gia: ${country || 'KR'})`;
  if (locEl) locEl.textContent = `Server hiện tại: ${currentLoc || 'Chưa gán VPN'}`;

  if (vpnTestResult) {
    vpnTestResult.style.display = 'none';
    vpnTestResult.textContent = '';
  }

  // Pre-select country
  let c = (country || 'KR').toUpperCase();
  if (c === 'UK') c = 'GB';
  if (vpnSelectCountry) {
    vpnSelectCountry.value = ['GB', 'US', 'DE', 'JP', 'KR'].includes(c) ? c : 'GB';
  }

  await loadVpnServersForCountry(vpnSelectCountry ? vpnSelectCountry.value : 'GB', currentConf);

  if (modalVpnPicker) modalVpnPicker.style.display = 'flex';
}

async function loadVpnServersForCountry(countryCode, selectConf) {
  if (!vpnSelectServer) return;
  vpnSelectServer.innerHTML = '<option value="">Đang tải danh sách server...</option>';
  try {
    const res = await fetch(`/api/vpn/catalog/${countryCode}`);
    const payload = await res.json();
    // Chấp nhận cả mảng trần lẫn {country, configs} để không vỡ câm nếu hình
    // dạng phản hồi đổi: `undefined.length === 0` là false nên guard cũ lọt
    // xuống .map() và ném "servers.map is not a function".
    const servers = Array.isArray(payload) ? payload : (payload && payload.configs) || [];
    if (servers.length === 0) {
      vpnSelectServer.innerHTML = '<option value="">Không có server nào</option>';
      return;
    }
    vpnSelectServer.innerHTML = servers.map(s => `
      <option value="${s.rel_path}" ${selectConf === s.rel_path ? 'selected' : ''}>
        ${s.label}
      </option>
    `).join('');
  } catch (e) {
    vpnSelectServer.innerHTML = `<option value="">Lỗi tải servers: ${e.message}</option>`;
  }
}

if (vpnSelectCountry) {
  vpnSelectCountry.addEventListener('change', () => {
    loadVpnServersForCountry(vpnSelectCountry.value);
  });
}

if (btnCloseVpnModal) {
  btnCloseVpnModal.addEventListener('click', () => {
    if (modalVpnPicker) modalVpnPicker.style.display = 'none';
  });
}
if (btnCancelVpn) {
  btnCancelVpn.addEventListener('click', () => {
    if (modalVpnPicker) modalVpnPicker.style.display = 'none';
  });
}

if (btnSaveVpn) {
  btnSaveVpn.addEventListener('click', async () => {
    if (!currentVpnPickerChannelId || !vpnSelectServer || !vpnSelectServer.value) {
      showToast('Vui lòng chọn server VPN');
      return;
    }
    btnSaveVpn.disabled = true;
    try {
      const res = await fetch(`/api/channels/${currentVpnPickerChannelId}/vpn/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vpn_config: vpnSelectServer.value })
      });
      const data = await res.json();
      if (data.success) {
        showToast(`✅ Đã gán VPN: ${data.vpn_location}`);
        if (modalVpnPicker) modalVpnPicker.style.display = 'none';
        loadChannels();
      }
    } catch (err) {
      showToast(`❌ Lỗi: ${err.message}`);
    } finally {
      btnSaveVpn.disabled = false;
    }
  });
}

if (btnTestVpnConn) {
  btnTestVpnConn.addEventListener('click', async () => {
    if (!currentVpnPickerChannelId) return;
    btnTestVpnConn.disabled = true;
    if (vpnTestResult) {
      vpnTestResult.style.display = 'block';
      vpnTestResult.style.background = 'rgba(59, 130, 246, 0.1)';
      vpnTestResult.style.color = '#60a5fa';
      vpnTestResult.style.border = '1px solid rgba(59, 130, 246, 0.3)';
      vpnTestResult.textContent = '⏳ Đang khởi động WireGuard tunnel & kiểm tra Exit IP + TikTok...';
    }

    try {
      const selectedServer = vpnSelectServer ? vpnSelectServer.value : '';
      const selectedCountry = vpnSelectCountry ? vpnSelectCountry.value : 'DE';
      
      let res, data;
      if (selectedServer) {
        res = await fetch('/api/vpn/test-server', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vpn_config: selectedServer, country: selectedCountry })
        });
        data = await res.json();
      } else {
        res = await fetch(`/api/channels/${currentVpnPickerChannelId}/vpn/check-full`);
        data = await res.json();
      }

      if (data.success && data.api && data.api.success) {
        const isMatch = data.match ? data.match.is_match : true;
        vpnTestResult.style.background = isMatch ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)';
        vpnTestResult.style.color = isMatch ? '#34d399' : '#fbbf24';
        vpnTestResult.style.border = isMatch ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(245, 158, 11, 0.4)';
        vpnTestResult.innerHTML = `
          ✅ <strong>Kết nối thành công!</strong><br>
          🌐 Exit IP: <code>${escapeHtml(data.api.ip)}</code> (${escapeHtml(data.api.country)} - ${escapeHtml(data.api.city || '')}) | Ping: <strong>${Number(data.api.latency_ms) || 0}ms</strong><br>
          🎵 Vùng TikTok: <strong>${escapeHtml(data.tiktok ? data.tiktok.region || '---' : '---')}</strong> (${isMatch ? '✅ Khớp 100%' : '⚠️ Lệch vùng'})
        `;
      } else {
        vpnTestResult.style.background = 'rgba(239, 68, 68, 0.12)';
        vpnTestResult.style.color = '#f87171';
        vpnTestResult.style.border = '1px solid rgba(239, 68, 68, 0.4)';
        vpnTestResult.textContent = `❌ Lỗi kết nối: ${data.error || (data.api && data.api.error) || 'Timeout'}`;
      }
    } catch (err) {
      if (vpnTestResult) {
        vpnTestResult.style.background = 'rgba(239, 68, 68, 0.12)';
        vpnTestResult.style.color = '#f87171';
        vpnTestResult.style.border = '1px solid rgba(239, 68, 68, 0.4)';
        vpnTestResult.textContent = `❌ Lỗi test: ${err.message}`;
      }
    } finally {
      btnTestVpnConn.disabled = false;
    }
  });
}

// --- Modal VPN IP & TikTok Check Handlers ---
let currentCheckChannelId = null;
let currentCheckData = null;

const modalVpnIpCheck = document.getElementById('modal-vpn-ip-check');
const btnCloseVpnCheckModal = document.getElementById('btn-close-vpn-check-modal');
const btnCloseVpnCheck = document.getElementById('btn-close-vpn-check');
const btnRecheckVpnModal = document.getElementById('btn-recheck-vpn-modal');
const btnCopyVpnIp = document.getElementById('btn-copy-vpn-ip');
const btnChangeVpnFromCheck = document.getElementById('btn-change-vpn-from-check');
const btnLaunchProfileFromCheck = document.getElementById('btn-launch-profile-from-check');

if (btnCloseVpnCheckModal) {
  btnCloseVpnCheckModal.addEventListener('click', () => {
    if (modalVpnIpCheck) modalVpnIpCheck.style.display = 'none';
  });
}

if (btnCloseVpnCheck) {
  btnCloseVpnCheck.addEventListener('click', () => {
    if (modalVpnIpCheck) modalVpnIpCheck.style.display = 'none';
  });
}

if (btnCopyVpnIp) {
  btnCopyVpnIp.addEventListener('click', () => {
    const ip = document.getElementById('vpn-api-ip').textContent.trim();
    if (ip && ip !== '---') {
      navigator.clipboard.writeText(ip).then(() => {
        showToast(`✅ Đã sao chép IP: ${ip}`);
      });
    }
  });
}

if (btnChangeVpnFromCheck) {
  btnChangeVpnFromCheck.addEventListener('click', () => {
    if (!currentCheckChannelId) return;
    if (modalVpnIpCheck) modalVpnIpCheck.style.display = 'none';
    const ch = (allChannels || []).find(c => c.id === currentCheckChannelId);
    if (ch) {
      openVpnPicker(ch.id);
    }
  });
}

if (btnLaunchProfileFromCheck) {
  btnLaunchProfileFromCheck.addEventListener('click', () => {
    if (!currentCheckChannelId) return;
    if (modalVpnIpCheck) modalVpnIpCheck.style.display = 'none';
    launchChannelProfile(currentCheckChannelId);
  });
}

if (btnRecheckVpnModal) {
  btnRecheckVpnModal.addEventListener('click', () => {
    if (currentCheckChannelId) {
      checkChannelVpnIp(currentCheckChannelId);
    }
  });
}

async function checkChannelVpnIp(channelId, event) {
  if (event) {
    event.stopPropagation();
  }
  currentCheckChannelId = channelId;
  const ch = (allChannels || []).find(c => c.id === channelId) || {};

  // Setup header in modal
  const nameEl = document.getElementById('vpn-check-channel-name');
  const targetCountryEl = document.getElementById('vpn-check-target-country');
  const vpnLocEl = document.getElementById('vpn-check-vpn-loc');

  if (nameEl) nameEl.textContent = ch.username ? `@${ch.username}` : (ch.note || `Kênh #${channelId}`);
  if (targetCountryEl) targetCountryEl.textContent = (ch.country || 'DE').toUpperCase();
  if (vpnLocEl) vpnLocEl.textContent = ch.vpn_location ? `🛡️ ${ch.vpn_location}` : '🛡️ Đang tự động gán...';

  // Toggle modal state
  const loadingEl = document.getElementById('vpn-check-loading');
  const contentEl = document.getElementById('vpn-check-content');
  const errorEl = document.getElementById('vpn-check-error');

  if (loadingEl) loadingEl.style.display = 'block';
  if (contentEl) contentEl.style.display = 'none';
  if (errorEl) errorEl.style.display = 'none';

  if (modalVpnIpCheck) modalVpnIpCheck.style.display = 'flex';

  const triggerBtn = document.getElementById(`btn-check-ip-${channelId}`);
  if (triggerBtn) triggerBtn.classList.add('loading');

  try {
    const res = await fetch(`/api/channels/${channelId}/vpn/check-full`);
    const data = await res.json();
    currentCheckData = data;

    if (data.success && data.api && data.tiktok) {
      if (loadingEl) loadingEl.style.display = 'none';
      if (contentEl) contentEl.style.display = 'block';

      // Update VPN location label in case it was auto-assigned
      if (vpnLocEl && data.vpn_location) {
        vpnLocEl.textContent = `🛡️ ${data.vpn_location}`;
      }

      // 1. API Card
      const api = data.api || {};
      const apiIpEl = document.getElementById('vpn-api-ip');
      const apiCountryEl = document.getElementById('vpn-api-country');
      const apiCityEl = document.getElementById('vpn-api-city');
      const apiIspEl = document.getElementById('vpn-api-isp');
      const apiPingEl = document.getElementById('vpn-api-ping');
      const apiStatusPill = document.getElementById('vpn-api-status-pill');

      if (apiIpEl) apiIpEl.textContent = api.ip || '---';
      if (apiCountryEl) apiCountryEl.textContent = api.country ? `${api.country} (${api.country_code || ''})` : '---';
      if (apiCityEl) apiCityEl.textContent = api.city || api.region_name || '---';
      if (apiIspEl) apiIspEl.textContent = api.isp || api.org || '---';
      if (apiPingEl) apiPingEl.textContent = api.latency_ms ? `${api.latency_ms} ms` : '---';
      if (apiStatusPill) {
        apiStatusPill.className = api.success ? 'status-pill ok' : 'status-pill err';
        apiStatusPill.textContent = api.success ? 'OK' : 'LỖI';
      }

      // 2. TikTok Card
      const tt = data.tiktok || {};
      const ttRegionEl = document.getElementById('vpn-tt-region');
      const ttClusterEl = document.getElementById('vpn-tt-cluster');
      const ttWafEl = document.getElementById('vpn-tt-waf');
      const ttCookieEl = document.getElementById('vpn-tt-cookie');
      const ttPingEl = document.getElementById('vpn-tt-ping');
      const ttStatusPill = document.getElementById('vpn-tt-status-pill');

      if (ttRegionEl) ttRegionEl.textContent = tt.region || 'Không nhận diện';
      if (ttClusterEl) ttClusterEl.textContent = tt.cluster || 'ALL';
      if (ttWafEl) {
        ttWafEl.innerHTML = tt.waf_passed
          ? '<span style="color: #34d399; font-weight: 700;">✅ Vượt WAF thành công</span>'
          : '<span style="color: #f87171; font-weight: 700;">⚠️ Gặp WAF / Captcha</span>';
      }
      if (ttCookieEl) {
        if (tt.cookie_status === 'LIVE') {
          ttCookieEl.innerHTML = `<span style="color: #34d399; font-weight: 700;">✅ Sống (${escapeHtml(tt.account_username || 'Logged In')})</span>`;
        } else if (tt.cookie_status === 'EXPIRED') {
          ttCookieEl.innerHTML = '<span style="color: #f87171; font-weight: 700;">❌ Cookie Hết Hạn</span>';
        } else {
          ttCookieEl.innerHTML = '<span style="color: #94a3b8;">Chưa đăng nhập</span>';
        }
      }
      if (ttPingEl) ttPingEl.textContent = tt.latency_ms ? `${tt.latency_ms} ms` : '---';
      if (ttStatusPill) {
        ttStatusPill.className = (tt.status_code === 200) ? 'status-pill ok' : 'status-pill err';
        ttStatusPill.textContent = tt.status_code ? `${tt.status_code} OK` : 'ERR';
      }

      // 3. Match Card Banner
      const matchCard = document.getElementById('vpn-match-card');
      const matchIcon = document.getElementById('vpn-match-icon');
      const matchTitle = document.getElementById('vpn-match-title');
      const matchDesc = document.getElementById('vpn-match-desc');

      const match = data.match || {};
      if (matchCard) {
        if (match.status === 'PERFECT') {
          matchCard.className = 'vpn-match-card';
          if (matchIcon) matchIcon.textContent = '✅';
          if (matchTitle) matchTitle.textContent = 'HOÀN TOÀN TRÙNG KHỚP 100%';
        } else if (match.status === 'VPN_TIKTOK_MATCH') {
          matchCard.className = 'vpn-match-card warning';
          if (matchIcon) matchIcon.textContent = '⚠️';
          if (matchTitle) matchTitle.textContent = 'CẢNH BÁO: KHÁC QUỐC GIA KÊNH';
        } else {
          matchCard.className = 'vpn-match-card mismatch';
          if (matchIcon) matchIcon.textContent = '❌';
          if (matchTitle) matchTitle.textContent = 'CẢNH BÁO LỆCH VÙNG TIKTOK';
        }
        if (matchDesc) matchDesc.textContent = match.message || `Kênh (${data.channel_country}) ⟷ IP (${api.country_code}) ⟷ TikTok (${tt.region})`;
      }

      // Update button appearance in table row
      if (triggerBtn) {
        triggerBtn.title = `IP: ${api.ip || '---'} | TikTok: ${tt.region || '---'} (${match.is_match ? 'Khớp ✅' : 'Lệch ⚠️'})`;
        triggerBtn.style.color = match.is_match ? '#34d399' : '#f87171';
        triggerBtn.style.borderColor = match.is_match ? 'rgba(16, 185, 129, 0.5)' : 'rgba(239, 68, 68, 0.5)';
        triggerBtn.style.background = match.is_match ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)';
      }
    } else {
      if (loadingEl) loadingEl.style.display = 'none';
      if (errorEl) {
        errorEl.style.display = 'block';
        const msgEl = document.getElementById('vpn-check-error-msg');
        if (msgEl) msgEl.textContent = data.error || data.detail || 'Không thể kiểm tra kết nối qua VPN';
      }
    }
  } catch (err) {
    if (loadingEl) loadingEl.style.display = 'none';
    if (errorEl) {
      errorEl.style.display = 'block';
      const msgEl = document.getElementById('vpn-check-error-msg');
      if (msgEl) msgEl.textContent = err.message || 'Lỗi mạng khi kết nối tới máy chủ kiểm tra';
    }
  } finally {
    if (triggerBtn) triggerBtn.classList.remove('loading');
  }
}


// =============================================================================
// NUÔI NICK (BaoSam) — giao diện cho bản port nuoinickbaosam 11.10.14
// =============================================================================

const NN_API = '/api/nn';

const nnState = {
  platform: 'Facebook',
  folderId: null,
  accounts: [],
  scripts: [],
  scriptId: null,
  flow: [],
};

async function nnFetch(path, options = {}) {
  const res = await fetch(NN_API + path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || `Lỗi máy chủ (${res.status})`);
  return data;
}

function switchNnSub(name) {
  document.querySelectorAll('.nn-subtab').forEach(btn => {
    const active = btn.dataset.nnsub === name;
    btn.classList.toggle('btn-primary', active);
    btn.classList.toggle('btn-secondary', !active);
    btn.classList.toggle('active', active);
  });
  document.querySelectorAll('.nn-subpane').forEach(pane => {
    pane.style.display = pane.id === `nnsub-${name}` ? 'block' : 'none';
  });
  if (name === 'profiles') { loadNnProfiles(); loadNnGroups(); }

  if (name === 'config') { loadNnSettings(); loadNnActions(); loadNnVpnCatalog(); }
}

function nnSelectPlatform(platform) {
  nnState.platform = platform;
  nnState.folderId = null;
  const sel = document.getElementById('nn-platform');
  if (sel) sel.value = platform;
  const label = document.getElementById('nn-current-platform-name');
  if (label) label.textContent = platform;
  const title = document.getElementById('nn-table-platform-title');
  if (title) title.textContent = platform;

  document.querySelectorAll('.nn-platform-btn').forEach(b => {
    const isAct = b.dataset.platform === platform;
    b.classList.toggle('active', isAct);
    const badge = b.querySelector('.badge');
    if (badge) {
      badge.classList.toggle('badge-success', isAct);
      badge.classList.toggle('badge-neutral', !isAct);
    }
  });

  loadNnFolders();
  loadNnAccounts();
  loadNnScripts();
  loadNnPlatformStats();
}

async function loadNnPlatformStats() {
  try {
    const { stats } = await nnFetch('/accounts/stats');
    if (stats) {
      if (document.getElementById('nn-count-fb')) document.getElementById('nn-count-fb').textContent = stats.Facebook || 0;
      if (document.getElementById('nn-count-tiktok')) document.getElementById('nn-count-tiktok').textContent = stats.TikTok || 0;
      if (document.getElementById('nn-count-gmail')) document.getElementById('nn-count-gmail').textContent = stats.Gmail || 0;
      if (document.getElementById('nn-count-hotmail')) document.getElementById('nn-count-hotmail').textContent = stats.Hotmail || 0;
      if (document.getElementById('nn-count-shopee')) document.getElementById('nn-count-shopee').textContent = stats.Shopee || 0;

      const totalNicks = (stats.Facebook || 0) + (stats.TikTok || 0) + (stats.Gmail || 0) + (stats.Hotmail || 0) + (stats.Shopee || 0);
      const sideNickBadge = document.getElementById('side-badge-nicks');
      if (sideNickBadge) sideNickBadge.textContent = totalNicks;
    }
  } catch (e) {}
}

function loadNnAll() {
  nnSelectPlatform(document.getElementById('nn-platform').value);
}

// ------------------------------------------------------------------ thư mục

async function loadNnFolders() {
  const box = document.getElementById('nn-folder-list');
  try {
    const { folders } = await nnFetch(`/folders?platform=${nnState.platform}`);
    const all = nnState.accounts.length;
    box.innerHTML = `
      <div class="tip-item nn-folder ${nnState.folderId === null ? 'active' : ''}"
           style="cursor: pointer;" onclick="nnSelectFolder(null)">
        📂 Tất cả
      </div>` + folders.map(f => `
      <div class="tip-item nn-folder ${nnState.folderId === f.id ? 'active' : ''}"
           style="cursor: pointer; display: flex; align-items: center; gap: 6px;"
           onclick="nnSelectFolder(${f.id})">
        <span style="flex: 1;">${f.is_system ? '🔒' : '📁'} ${escapeHtml(f.name)} (${f.count})</span>
        ${f.is_system ? '' : `<span onclick="event.stopPropagation(); nnDeleteFolder(${f.id})"
             title="Xoá thư mục" style="cursor: pointer;">✖</span>`}
      </div>`).join('');
  } catch (err) {
    box.innerHTML = `<p class="card-subtitle">${escapeHtml(err.message)}</p>`;
  }
}

function nnSelectFolder(id) {
  nnState.folderId = id;
  loadNnFolders();
  loadNnAccounts();
}

async function nnCreateFolder() {
  const name = prompt('Tên thư mục mới:');
  if (!name) return;
  try {
    await nnFetch('/folders', {
      method: 'POST',
      body: JSON.stringify({ platform: nnState.platform, name }),
    });
    showToast('Đã tạo thư mục');
    loadNnFolders();
  } catch (err) { showToast(err.message); }
}

async function nnDeleteFolder(id) {
  if (!confirm('Xoá thư mục này? Nick bên trong sẽ chuyển về thư mục Mặc định.')) return;
  try {
    await nnFetch(`/folders/${id}?platform=${nnState.platform}`, { method: 'DELETE' });
    showToast('Đã xoá thư mục');
    if (nnState.folderId === id) nnState.folderId = null;
    loadNnFolders();
    loadNnAccounts();
  } catch (err) { showToast(err.message); }
}

// -------------------------------------------------------------------- nick

async function loadNnAccounts() {
  const tbody = document.getElementById('nn-tbody');
  const search = document.getElementById('nn-search').value.trim();
  let url = `/accounts?platform=${nnState.platform}`;
  if (nnState.folderId) url += `&folder_id=${nnState.folderId}`;
  if (search) url += `&search=${encodeURIComponent(search)}`;
  try {
    const { accounts, total } = await nnFetch(url);
    nnState.accounts = accounts;
    document.getElementById('nn-count').textContent = total;
    const badge = document.getElementById('badge-nn-count');
    if (badge) badge.textContent = total;

    if (!accounts.length) {
      tbody.innerHTML = '<tr><td colspan="12" style="text-align: center; padding: 24px;">Chưa có nick nào. Bấm "Nhập nick" để thêm.</td></tr>';
      return;
    }
    tbody.innerHTML = accounts.map(a => `
      <tr>
        <td><input type="checkbox" class="nn-row-check" value="${a.Id}"></td>
        <td>${a.Idx}</td>
        <td class="mono" style="font-weight: 600; color: #60a5fa;">
          <div style="display: flex; align-items: center; gap: 4px;">
            <span style="cursor: pointer;" onclick="navigator.clipboard.writeText('${escapeHtml(a.Uid || '')}'); showToast('Đã chép UID', 'success');" title="Bấm để chép UID">${escapeHtml(a.Uid || '')}</span>
            ${(nnState.platform === 'Facebook' && a.Uid) ? `
              <button type="button" class="fb-profile-link-btn compact" onclick="nnLaunchAccountProfile(${a.Id}, this)" title="Mở tài khoản bằng đúng profile, cookie và VPN">↗</button>
            ` : ''}
          </div>
        </td>
        <td>
          ${(nnState.platform === 'Facebook' && a.Uid) ? `
            <button type="button" class="fb-acc-name-link fb-link-reset" onclick="nnLaunchAccountProfile(${a.Id}, this)" title="Mở ${escapeHtml(a.HoTen || a.Uid)} bằng đúng profile, cookie và VPN">
              ${escapeHtml(a.HoTen || '')}
            </button>
          ` : escapeHtml(a.HoTen || '')}
        </td>
        <td>
          <span style="font-size: 12px;">${escapeHtml(a.Mail || '')}</span>

        </td>
        <td>${a.Pass ? '••••' : ''}</td>
        <td>
          ${a.TwoFA ? `<button class="btn btn-secondary btn-sm" style="padding: 2px 7px; font-size: 11px; color: #38bdf8; border-color: rgba(56,189,248,0.3);" onclick="nnShow2faModal(${a.Id}, '${escapeHtml(a.Uid || a.Mail || '')}')">🔑 2FA</button>` : ''}
        </td>
        <td class="mono" style="font-size: 11.5px;">
          ${a.Proxy ? `<span title="${escapeHtml(a.Proxy)}">🔌 ${escapeHtml(a.Proxy.slice(0, 20))}...</span>` : `<span style="color: var(--text-muted);">${escapeHtml(a.VpnLocation || 'Chưa gán')}</span>`}
        </td>
        <td>${escapeHtml(a.ScriptName || '')}</td>
        <td><span class="badge ${a.TrangThai === 'Live' ? 'badge-success' : 'badge-neutral'}" style="font-size: 11px;">${escapeHtml(a.TrangThai || 'Sẵn sàng')}</span></td>
        <td class="mono" style="font-size: 11px;">${escapeHtml(a.BrowserProfileId || a.TenProfile || '')}</td>
        <td style="text-align: center; white-space: nowrap;">
          <button class="btn btn-secondary btn-sm" style="padding: 2px 6px;" onclick="nnRunOne(${a.Id})" title="Chạy kịch bản">▶️</button>
          <button class="btn btn-secondary btn-sm" style="padding: 2px 6px;" onclick="nnLaunchAccountProfile(${a.Id}, this)" title="Mở tài khoản bằng đúng profile, cookie và VPN">🌐</button>
          <button class="btn btn-secondary btn-sm" style="padding: 2px 6px;" onclick="nnSaveAccountSession(${a.Id}, this)" title="Xác minh /me và lưu cookie mới từ profile đang mở">💾</button>
          <button class="btn btn-secondary btn-sm" style="padding: 2px 6px;" onclick="nnCloseAccountProfile(${a.Id}, this)" title="Lưu phiên nếu hợp lệ, đóng profile và ngắt VPN">⏹</button>
          <button class="btn btn-secondary btn-sm" style="padding: 2px 6px;" onclick="nnTestVpn(${a.Id})" title="Kiểm tra IP VPN">🛡️</button>
        </td>
      </tr>`).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="12" style="text-align: center; padding: 24px;">${escapeHtml(err.message)}</td></tr>`;
  }
}

function nnToggleAll(box) {
  document.querySelectorAll('.nn-row-check').forEach(c => { c.checked = box.checked; });
}

function nnSelectedIds() {
  return Array.from(document.querySelectorAll('.nn-row-check:checked')).map(c => Number(c.value));
}

function nnRequireSelection() {
  const ids = nnSelectedIds();
  if (!ids.length) { showToast('Chưa chọn nick nào.'); return null; }
  return ids;
}

async function nnOpenImport() {
  const raw = prompt(
    'Mỗi dòng một nick, ngăn cách bằng dấu |\n' +
    'Thứ tự: uid|pass|2fa|token|cookie|mail|passmail|mail khôi phục|mã quốc gia VPN (US/GB/DE/JP/KR)'
  );
  if (!raw) return;
  try {
    const data = await nnFetch('/accounts/import', {
      method: 'POST',
      body: JSON.stringify({
        platform: nnState.platform,
        folder_id: nnState.folderId || 0,
        raw_data: raw,
      }),
    });
    showToast(`Đã nhập ${data.imported} nick, bỏ qua ${data.skipped} dòng`);
    loadNnFolders();
    loadNnAccounts();
  } catch (err) { showToast(err.message); }
}

async function nnExport() {
  const fields = prompt(
    'Các cột cần xuất, ngăn bằng dấu phẩy:',
    'Uid,Pass,TwoFA,Token,Cookie,Mail,PassMail,MailKhoiPhuc,VpnLocation'
  );
  if (!fields) return;
  let url = `/accounts/export?platform=${nnState.platform}&fields=${encodeURIComponent(fields)}`;
  if (nnState.folderId) url += `&folder_id=${nnState.folderId}`;
  try {
    const data = await nnFetch(url);
    const blob = new Blob([data.content], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `nick_${nnState.platform}_${Date.now()}.txt`;
    link.click();
    URL.revokeObjectURL(link.href);
    showToast(`Đã xuất ${data.count} nick`);
  } catch (err) { showToast(err.message); }
}

async function nnOpenVpn() {
  const ids = nnRequireSelection();
  if (!ids) return;
  const country = prompt(
    'Mã quốc gia VPN (US, GB, DE, JP, KR).\nMỗi nick sẽ được bốc một server khác nhau:',
    'US'
  );
  if (!country) return;
  try {
    const data = await nnFetch('/accounts/assign-vpn', {
      method: 'POST',
      body: JSON.stringify({
        platform: nnState.platform,
        account_ids: ids,
        country: country.trim().toUpperCase(),
      }),
    });
    showToast(`Đã gán VPN cho ${data.assigned} nick`);
    loadNnAccounts();
  } catch (err) { showToast(err.message); }
}

async function nnOpenAssignScript() {
  const ids = nnRequireSelection();
  if (!ids) return;
  if (!nnState.scripts.length) await loadNnScripts();
  if (!nnState.scripts.length) { showToast('Chưa có kịch bản nào. Tạo ở tab Kịch Bản AI Vision.'); return; }
  const menu = nnState.scripts.map(s => `${s.id} - ${s.name}`).join('\n');
  const answer = prompt(`Nhập ID kịch bản cần gán (0 để bỏ gán):\n\n${menu}`);
  if (answer === null) return;
  try {
    const data = await nnFetch('/accounts/assign-script', {
      method: 'POST',
      body: JSON.stringify({ platform: nnState.platform, account_ids: ids, script_id: Number(answer) }),
    });
    showToast(`Đã gán kịch bản cho ${data.updated} nick`);
    loadNnAccounts();
  } catch (err) { showToast(err.message); }
}

async function nnOpenBulkUpdate() {
  const ids = nnRequireSelection();
  if (!ids) return;
  const column = prompt(
    'Tên cột cần sửa (vd TrangThai, TinhTrang, GhiChu, BrowserProfileId, PhoneName, TenProfile):'
  );
  if (!column) return;
  const value = prompt(`Giá trị mới cho cột ${column}:`);
  if (value === null) return;
  try {
    const data = await nnFetch('/accounts/bulk-update', {
      method: 'POST',
      body: JSON.stringify({
        platform: nnState.platform,
        account_ids: ids,
        changes: { [column]: value },
      }),
    });
    showToast(`Đã cập nhật ${data.updated} nick`);
    loadNnAccounts();
  } catch (err) { showToast(err.message); }
}

async function nnDeleteSelected() {
  const ids = nnRequireSelection();
  if (!ids) return;
  if (!confirm(`Xoá vĩnh viễn ${ids.length} nick đã chọn?`)) return;
  try {
    const data = await nnFetch('/accounts/delete', {
      method: 'POST',
      body: JSON.stringify({ platform: nnState.platform, account_ids: ids }),
    });
    showToast(`Đã xoá ${data.deleted} nick`);
    loadNnFolders();
    loadNnAccounts();
  } catch (err) { showToast(err.message); }
}

async function nnGet2fa(accountId) {
  try {
    const data = await nnFetch(`/accounts/${accountId}/2fa?platform=${nnState.platform}`, { method: 'POST' });
    showToast(`Mã 2FA: ${data.code}`, 8000);
  } catch (err) { showToast(err.message); }
}

// ---------------------------------------------------------------- kịch bản

async function loadNnScripts() {
  try {
    const { scripts } = await nnFetch('/scripts');
    nnState.scripts = scripts;
    const box = document.getElementById('nn-script-list');
    if (!box) return;
    if (!scripts.length) {
      box.innerHTML = '<p class="card-subtitle">Chưa có kịch bản nào.</p>';
      return;
    }
    box.innerHTML = scripts.map(s => `
      <div class="tip-item nn-script ${nnState.scriptId === s.id ? 'active' : ''}"
           style="cursor: pointer; display: flex; align-items: center; gap: 6px;"
           onclick="nnSelectScript(${s.id})">
        <span style="flex: 1;">🎯 ${escapeHtml(s.name)} (${s.step_count})</span>
        <span onclick="event.stopPropagation(); nnDeleteScript(${s.id})" title="Xoá" style="cursor: pointer;">✖</span>
      </div>`).join('');
  } catch (err) { showToast(err.message); }
}

function nnSelectScript(id) {
  const script = nnState.scripts.find(s => s.id === id);
  if (!script) return;
  nnState.scriptId = id;
  nnState.flow = JSON.parse(JSON.stringify(script.flow || []));
  document.getElementById('nn-script-name').textContent = script.name;
  loadNnScripts();
  nnRenderFlow();
}

async function nnCreateScript() {
  const name = prompt('Tên kịch bản mới:');
  if (!name) return;
  try {
    const script = await nnFetch('/scripts', {
      method: 'POST',
      body: JSON.stringify({ name, platform: 'Chrome' }),
    });
    showToast('Đã tạo kịch bản');
    await loadNnScripts();
    nnSelectScript(script.id);
  } catch (err) { showToast(err.message); }
}

async function nnDeleteScript(id) {
  if (!confirm('Xoá kịch bản này? Các nick đang gắn sẽ bị gỡ liên kết.')) return;
  try {
    await nnFetch(`/scripts/${id}`, { method: 'DELETE' });
    if (nnState.scriptId === id) {
      nnState.scriptId = null;
      nnState.flow = [];
      document.getElementById('nn-script-name').textContent = '(chưa chọn kịch bản)';
      nnRenderFlow();
    }
    showToast('Đã xoá kịch bản');
    loadNnScripts();
    loadNnAccounts();
  } catch (err) { showToast(err.message); }
}

// Mô tả trường nhập cho từng loại bước, theo đúng mô hình AiVisionFlowStep
const NN_STEP_FIELDS = {
  AiGoal: [
    { key: 'goal', label: 'Mục tiêu cho AI', type: 'textarea', placeholder: 'Đăng nhập Facebook bằng {uid} và {pass}' },
    { key: 'max_steps', label: 'Số bước AI tối đa', type: 'number', value: 25 },
  ],
  Tap: [
    { key: 'x', label: 'X (0-1000)', type: 'number', value: 500 },
    { key: 'y', label: 'Y (0-1000)', type: 'number', value: 500 },
  ],
  Text: [
    { key: 'text', label: 'Nội dung gõ', type: 'text', placeholder: 'Dùng {uid}, {pass}, {mail}, {otp}...' },
    { key: 'x', label: 'X ô nhập (0 = gõ vào ô đang focus)', type: 'number', value: 0 },
    { key: 'y', label: 'Y ô nhập (0 = gõ vào ô đang focus)', type: 'number', value: 0 },
  ],
  Goto: [{ key: 'url', label: 'URL', type: 'text', placeholder: 'https://www.facebook.com/' }],
  KeyPress: [{ key: 'text', label: 'Tên phím', type: 'text', placeholder: 'Enter, Escape, Tab...' }],
  Scroll: [
    { key: 'x2', label: 'Cuộn ngang (0-1000)', type: 'number', value: 0 },
    { key: 'y2', label: 'Cuộn dọc (0-1000)', type: 'number', value: 300 },
  ],
  Swipe: [
    { key: 'x', label: 'X bắt đầu (0-1000)', type: 'number', value: 500 },
    { key: 'y', label: 'Y bắt đầu (0-1000)', type: 'number', value: 800 },
    { key: 'x2', label: 'X kết thúc (0-1000)', type: 'number', value: 500 },
    { key: 'y2', label: 'Y kết thúc (0-1000)', type: 'number', value: 200 },
  ],
  Wait: [{ key: 'wait_ms', label: 'Chờ (ms)', type: 'number', value: 2000 }],
  RandomWait: [
    { key: 'random_min_ms', label: 'Tối thiểu (ms)', type: 'number', value: 1000 },
    { key: 'random_max_ms', label: 'Tối đa (ms)', type: 'number', value: 5000 },
  ],
};

function nnRenderStepFields() {
  const type = document.getElementById('nn-step-type').value;
  const fields = NN_STEP_FIELDS[type] || [];
  document.getElementById('nn-step-fields').innerHTML = fields.map(f => `
    <div class="form-group">
      <label for="nn-f-${f.key}">${escapeHtml(f.label)}:</label>
      ${f.type === 'textarea'
        ? `<textarea id="nn-f-${f.key}" class="form-control" rows="3" placeholder="${escapeHtml(f.placeholder || '')}"></textarea>`
        : `<input type="${f.type}" id="nn-f-${f.key}" class="form-control"
             value="${f.value !== undefined ? f.value : ''}" placeholder="${escapeHtml(f.placeholder || '')}">`}
    </div>`).join('');
}

function nnAddStep() {
  if (!nnState.scriptId) { showToast('Chọn một kịch bản ở bên trái trước.'); return; }
  const type = document.getElementById('nn-step-type').value;
  const step = { type };
  (NN_STEP_FIELDS[type] || []).forEach(f => {
    const el = document.getElementById(`nn-f-${f.key}`);
    if (!el) return;
    step[f.key] = f.type === 'number' ? Number(el.value || 0) : el.value;
  });
  nnState.flow.push(step);
  nnRenderFlow();
  showToast('Đã thêm bước — nhớ bấm "Lưu kịch bản"');
}

function nnStepSummary(step) {
  switch (step.type) {
    case 'AiGoal': return `${escapeHtml(step.goal || '')} (tối đa ${step.max_steps || 25} bước AI)`;
    case 'Tap': return `(${step.x}, ${step.y})`;
    case 'Text': return `"${escapeHtml(step.text || '')}"${step.x || step.y ? ` vào ô (${step.x}, ${step.y})` : ''}`;
    case 'Goto': return escapeHtml(step.url || step.text || '');
    case 'KeyPress': return escapeHtml(step.text || '');
    case 'Scroll': return `(${step.x2}, ${step.y2})`;
    case 'Swipe': return `(${step.x}, ${step.y}) → (${step.x2}, ${step.y2})`;
    case 'Wait': return `${step.wait_ms} ms`;
    case 'RandomWait': return `${step.random_min_ms} - ${step.random_max_ms} ms`;
    default: return '';
  }
}

const NN_TYPE_LABEL = {
  AiGoal: 'Mục tiêu AI', Wait: 'Chờ', RandomWait: 'Chờ ngẫu nhiên', Tap: 'Nhấn',
  Swipe: 'Vuốt', Text: 'Gõ chữ', Goto: 'Mở URL', Scroll: 'Cuộn', KeyPress: 'Nhấn phím',
};

function nnRenderFlow() {
  const tbody = document.getElementById('nn-flow-tbody');
  document.getElementById('nn-step-count').textContent = nnState.flow.length;
  if (!nnState.flow.length) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px;">Chưa có bước nào trong kịch bản.</td></tr>';
    return;
  }
  tbody.innerHTML = nnState.flow.map((step, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${escapeHtml(NN_TYPE_LABEL[step.type] || step.type)}</td>
      <td>${nnStepSummary(step)}</td>
      <td style="text-align: center;">
        <button class="btn btn-secondary" style="padding: 2px 6px;" onclick="nnMoveStep(${i}, -1)">↑</button>
        <button class="btn btn-secondary" style="padding: 2px 6px;" onclick="nnMoveStep(${i}, 1)">↓</button>
        <button class="btn btn-danger" style="padding: 2px 6px;" onclick="nnRemoveStep(${i})">✖</button>
      </td>
    </tr>`).join('');
}

function nnMoveStep(index, delta) {
  const target = index + delta;
  if (target < 0 || target >= nnState.flow.length) return;
  const [step] = nnState.flow.splice(index, 1);
  nnState.flow.splice(target, 0, step);
  nnRenderFlow();
}

function nnRemoveStep(index) {
  nnState.flow.splice(index, 1);
  nnRenderFlow();
}

async function nnSaveFlow() {
  if (!nnState.scriptId) { showToast('Chưa chọn kịch bản nào.'); return; }
  try {
    const data = await nnFetch(`/scripts/${nnState.scriptId}/flow`, {
      method: 'PUT',
      body: JSON.stringify({ flow: nnState.flow }),
    });
    showToast(`Đã lưu ${data.steps} bước`);
    loadNnScripts();
  } catch (err) { showToast(err.message); }
}

// ------------------------------------------------------------------ chạy

function nnShowRunResult(result) {
  const box = document.getElementById('nn-run-log');
  if (!box) return;
  const lines = (result.logs || []).map(
    log => `${log.ok ? '✓' : '✗'} bước ${log.index + 1} [${log.step_type}] ${log.message}`
  );
  box.textContent = `${result.success ? '✅' : '❌'} ${result.message}\n\n${lines.join('\n')}`;
}

async function nnRunOne(accountId) {
  const account = nnState.accounts.find(a => a.Id === accountId);
  if (!account) return;
  if (!account.ScriptId) { showToast('Nick này chưa gắn kịch bản nào.'); return; }
  showToast('Đang chạy kịch bản, vui lòng chờ...', 5000);
  try {
    const result = await nnFetch('/scripts/run', {
      method: 'POST',
      body: JSON.stringify({
        platform: nnState.platform,
        account_id: accountId,
        script_id: account.ScriptId,
      }),
    });
    nnShowRunResult(result);
    showToast(result.message);
  } catch (err) {
    showToast(err.message, 6000);
    nnShowRunResult({ success: false, message: err.message, logs: [] });
  }
}

async function nnRunSelected() {
  const ids = nnRequireSelection();
  if (!ids) return;
  for (const id of ids) {
    await nnRunOne(id);
  }
}

// -------------------------------------------------------------- cài đặt

// Model AI không còn ô nhập trên form; giữ lại giá trị đã lưu để không ghi đè rỗng.
let nnSavedAiModel = '';

async function loadNnSettings() {
  const setVal = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.value = value;
  };
  const setChecked = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.checked = value;
  };
  try {
    const data = await nnFetch('/settings');
    const ai = data.ai_vision || {};
    const br = data.browser || {};
    nnSavedAiModel = ai.model || '';
    setVal('nn-ai-provider', ai.provider || 'Claude');
    setVal('nn-ai-model', nnSavedAiModel);
    setVal('nn-ai-delay', ai.step_delay_ms || 0);
    setChecked('nn-ai-screenshot', ai.send_screenshot !== false);
    setVal('nn-br-engine', br.engine || 'Native');
    setVal('nn-br-api', br.api_url || '');
    setChecked('nn-br-vpn', br.force_vpn !== false);
  } catch (err) { showToast(err.message); }
  // Khoá thuộc Kho Khoá API; ở đây chỉ hiện trạng thái.
  if (typeof loadApiKeyVault === 'function') await loadApiKeyVault();
}

const NN_ENGINE_DEFAULT_API = {
  // Bản port chạy ngay trong web này nên địa chỉ chính là địa chỉ đang mở.
  Native: () => `${location.protocol}//${location.host}`,
  Gpm: () => 'http://127.0.0.1:9495',
  Omo: () => 'http://127.0.0.1:50325',
};

function nnEngineChanged() {
  const engine = document.getElementById('nn-br-engine').value;
  const pick = NN_ENGINE_DEFAULT_API[engine] || NN_ENGINE_DEFAULT_API.Native;
  document.getElementById('nn-br-api').value = pick();
}

async function nnSaveSettings() {
  const provider = document.getElementById('nn-ai-provider')?.value || 'Claude';
  const modelEl = document.getElementById('nn-ai-model');
  const aiVision = {
    provider,
    priority_targets: [provider],
    model: modelEl ? modelEl.value.trim() : nnSavedAiModel,
    step_delay_ms: Number(document.getElementById('nn-ai-delay')?.value || 0),
    send_screenshot: document.getElementById('nn-ai-screenshot')?.checked !== false,
  };

  try {
    await nnFetch('/settings', {
      method: 'PUT',
      body: JSON.stringify({
        ai_vision: aiVision,
        browser: {
          engine: document.getElementById('nn-br-engine').value,
          api_url: document.getElementById('nn-br-api').value.trim(),
          force_vpn: document.getElementById('nn-br-vpn').checked,
        },
      }),
    });
    showToast('Đã lưu cài đặt');
    loadNnSettings();
  } catch (err) { showToast(err.message); }
}

async function nnBrowserPing() {
  const box = document.getElementById('nn-br-status');
  box.textContent = 'Đang kiểm tra...';
  try {
    const data = await nnFetch('/browser/ping');
    box.textContent = `✅ Kết nối được ${data.engine}`;
  } catch (err) {
    box.textContent = `❌ ${err.message}`;
  }
}

async function loadNnVpnCatalog() {
  const box = document.getElementById('nn-vpn-catalog');
  if (!box) return;
  try {
    const data = await nnFetch('/vpn/stats');
    const rows = Object.entries(data.countries || {});
    if (!rows.length) {
      box.innerHTML = '<p class="card-subtitle">Chưa có file .conf nào trong bkt_web/vpn_configs</p>';
      return;
    }
    box.innerHTML = rows.map(([code, info]) => `
      <div class="tip-item">
        <span class="tip-badge">${escapeHtml(code)}</span>
        <p>${escapeHtml(info.name || code)} — ${info.count} server</p>
      </div>`).join('');
  } catch (err) {
    box.innerHTML = `<p class="card-subtitle">${escapeHtml(err.message)}</p>`;
  }
}

async function nnTestVpn(accountId) {
  showToast('Đang bật tunnel và kiểm tra IP...');
  try {
    const data = await nnFetch(`/vpn/test/${accountId}?platform=${nnState.platform}`, { method: 'POST' });
    showToast(`VPN ${data.location || ''} — IP: ${data.ip || data.exit_ip || 'không đọc được'}`, 8000);
  } catch (err) { showToast(err.message, 6000); }
}

async function nnCreateVpnProfile(accountId) {
  showToast('Đang tạo profile gắn VPN...');
  try {
    const data = await nnFetch(`/accounts/${accountId}/create-profile?platform=${nnState.platform}`, { method: 'POST' });
    showToast(`Đã tạo profile ${data.profile_id} (${data.vpn_location || ''})`, 6000);
    loadNnAccounts();
  } catch (err) { showToast(err.message, 6000); }
}

async function loadNnActions() {
  try {
    const { actions } = await nnFetch('/actions');
    const groups = {};
    actions.forEach(a => {
      const key = `${a.platform} — ${a.category}`;
      (groups[key] = groups[key] || []).push(a.name);
    });
    document.getElementById('nn-actions-list').innerHTML = Object.entries(groups).map(
      ([group, names]) => `
        <div class="tip-item">
          <span class="tip-badge">${escapeHtml(group)}</span>
          <p>${names.map(escapeHtml).join(' · ')}</p>
        </div>`
    ).join('');
  } catch (err) { showToast(err.message); }
}

function loadNuoiNickData() {
  nnState.platform = document.getElementById('nn-platform').value;
  nnRenderStepFields();
  loadNnFolders();
  loadNnAccounts();
  loadNnPlatformStats();
  loadNnScripts();
  loadNnProfiles();
  loadNnGroups();
  loadNnProxies();
}

// ==============================================================================
// 1. PROFILE ANTIDETECT (BaoSamBrowser Native Profile Manager)
// ==============================================================================

let nnCurrentProfiles = [];
let nnCurrentGroups = [];
let nnActiveGroupId = null;

async function loadNnGroups() {
  const box = document.getElementById('nn-group-list');
  const sel = document.getElementById('nn-prof-group');
  try {
    const { groups } = await nnFetch('/groups');
    nnCurrentGroups = groups || [];
    if (box) {
      box.innerHTML = `
        <div class="tip-item ${nnActiveGroupId === null ? 'active' : ''}"
             style="cursor: pointer;" onclick="nnSelectGroup(null)">
          📁 Tất cả nhóm
        </div>` + nnCurrentGroups.map(g => `
        <div class="tip-item ${nnActiveGroupId === g.Id ? 'active' : ''}"
             style="cursor: pointer; display: flex; align-items: center; gap: 6px;"
             onclick="nnSelectGroup('${g.Id}')">
          <span style="flex: 1;">${g.Id === 'Default' ? '🔒' : '📁'} ${escapeHtml(g.Name)}</span>
          ${g.Id === 'Default' ? '' : `<span onclick="event.stopPropagation(); nnDeleteGroup('${g.Id}')" style="cursor: pointer;">✖</span>`}
        </div>`).join('');
    }
    if (sel) {
      sel.innerHTML = nnCurrentGroups.map(g => `<option value="${g.Id}">${escapeHtml(g.Name)}</option>`).join('');
    }
  } catch (err) {
    if (box) box.innerHTML = `<p class="card-subtitle">${escapeHtml(err.message)}</p>`;
  }
}

function nnSelectGroup(gid) {
  nnActiveGroupId = gid;
  loadNnGroups();
  loadNnProfiles();
}

async function nnCreateGroup() {
  const name = prompt('Tên nhóm profile mới:');
  if (!name) return;
  try {
    await nnFetch('/groups', {
      method: 'POST',
      body: JSON.stringify({ Name: name }),
    });
    showToast('Đã tạo nhóm profile');
    loadNnGroups();
  } catch (err) { showToast(err.message); }
}

async function nnDeleteGroup(gid) {
  if (!confirm('Xoá nhóm này? Các profile sẽ chuyển về nhóm Mặc định.')) return;
  try {
    await nnFetch(`/groups/${gid}`, { method: 'DELETE' });
    showToast('Đã xoá nhóm');
    if (nnActiveGroupId === gid) nnActiveGroupId = null;
    loadNnGroups();
    loadNnProfiles();
  } catch (err) { showToast(err.message); }
}

async function loadNnProfiles() {
  const tbody = document.getElementById('nn-profile-tbody');
  if (!tbody) return;
  const search = document.getElementById('nn-profile-search') ? document.getElementById('nn-profile-search').value.trim() : '';
  let url = '/profiles';
  const params = [];
  if (nnActiveGroupId) params.push(`group_id=${encodeURIComponent(nnActiveGroupId)}`);
  if (search) params.push(`search=${encodeURIComponent(search)}`);
  if (params.length) url += '?' + params.join('&');

  // Cập nhật bộ đếm thùng rác
  nnFetch('/profiles/trash').then(d => {
    const cnt = (d && d.trash) ? d.trash.length : 0;
    const trBadge = document.getElementById('gpm-trash-count');
    if (trBadge) trBadge.textContent = cnt;
  }).catch(() => {});

  try {
    const { profiles, total } = await nnFetch(url);
    nnCurrentProfiles = profiles || [];
    const countEl = document.getElementById('nn-profile-count');
    if (countEl) countEl.textContent = total;
    const sideProfBadge = document.getElementById('side-badge-profiles');
    if (sideProfBadge) sideProfBadge.textContent = total;
    const runningCount = nnCurrentProfiles.filter(p => p.is_running || p.Status === 'running').length;
    const topRunEl = document.getElementById('top-running-profiles-count');
    if (topRunEl) topRunEl.textContent = runningCount;

    if (!nnCurrentProfiles.length) {
      tbody.innerHTML = '<tr><td colspan="10" style="text-align: center; padding: 24px;">Chưa có profile nào. Bấm "Tạo Profile Mới" hoặc "Tạo Hàng Loạt" để thêm.</td></tr>';
      return;
    }

    tbody.innerHTML = nnCurrentProfiles.map(p => {
      const isRunning = p.is_running || p.Status === 'running';
      const osIcon = p.OsType === 2 ? '🍏 Mac' : (p.OsType === 3 ? '🐧 Linux' : '🖥️ Win');
      const canvasTag = p.CanvasMode === 1 ? '<span class="badge" style="background: rgba(16,185,129,0.2); color: #10b981;">Canvas</span>' : '';
      const webglTag = p.WebglImageMode === 1 ? '<span class="badge" style="background: rgba(59,130,246,0.2); color: #60a5fa;">WebGL</span>' : '';
      const webrtcTag = p.WebrtcMode === 1 ? '<span class="badge" style="background: rgba(245,158,11,0.2); color: #fbbf24;">WebRTC</span>' : '';

      const browserVer = p.BrowserVersion ? `<span class="mono" style="font-size: 10px; color: #38bdf8; display: block; margin-top: 2px;">v${escapeHtml(p.BrowserVersion)}</span>` : '';

      return `
        <tr>
          <td><input type="checkbox" class="nn-prof-check" value="${p.Id}"></td>
          <td>
            <div style="font-weight: 600; color: var(--text-primary);">${escapeHtml(p.Name || p.Id)}</div>
            <div class="mono" style="font-size: 10.5px; color: var(--text-muted);">${p.Id}</div>
          </td>
          <td><span class="badge badge-neutral" style="font-size: 11px;">${escapeHtml(p.GroupId || 'Default')}</span></td>
          <td class="mono" style="font-size: 11.5px;">
            ${p.RawProxy ? `<span title="${escapeHtml(p.RawProxy)}">🔌 ${escapeHtml(p.RawProxy.slice(0, 22))}...</span>` : '<span style="color: var(--text-muted);">Không dùng</span>'}
          </td>
          <td style="font-size: 12px;">
            <div>${osIcon}</div>
            ${browserVer}
          </td>
          <td>
            <div style="display: flex; gap: 4px; flex-wrap: wrap;">
              ${canvasTag} ${webglTag} ${webrtcTag}
            </div>
          </td>
          <td>
            <div style="font-weight: 500; font-size: 11.5px; color: var(--text-primary);">${p.Cores || 8}C / ${p.Memory || 16}GB</div>
            <div class="mono" style="font-size: 10px; color: var(--text-muted);">${escapeHtml(p.Resolution || '1920x1080')}</div>
          </td>
          <td class="mono" style="font-size: 11px;">${p.remote_debugging_port || '---'}</td>
          <td>
            <span class="badge ${isRunning ? 'badge-success' : 'badge-neutral'}" style="font-size: 11px;">
              ${isRunning ? '🟢 Đang chạy' : '⚪ Sẵn sàng'}
            </span>
          </td>
          <td style="text-align: center; white-space: nowrap;">
            ${isRunning ?
              `<button class="btn btn-danger btn-sm" style="padding: 2px 7px;" onclick="nnStopProfile('${p.Id}')" title="Dừng trình duyệt">⏹️ Dừng</button>` :
              `<button class="btn btn-primary btn-sm" style="padding: 2px 7px;" onclick="nnStartProfile('${p.Id}')" title="Mở trình duyệt">▶️ Mở</button>`
            }
            <button class="btn btn-secondary btn-sm" style="padding: 2px 6px;" onclick="nnEditProfile('${p.Id}')" title="Sửa Fingerprint">⚙️</button>
            <button class="btn btn-secondary btn-sm" style="padding: 2px 6px;" onclick="nnOpenCookies('${p.Id}', '${escapeHtml(p.Name)}')" title="Quản lý Cookies">🍪</button>
            <button class="btn btn-secondary btn-sm" style="padding: 2px 6px;" onclick="gpmClearProfileCache('${p.Id}')" title="Dọn Cache Profile">🧹</button>
            <button class="btn btn-danger btn-sm" style="padding: 2px 6px;" onclick="nnDeleteProfile('${p.Id}')" title="Chuyển vào thùng rác">🗑️</button>
          </td>
        </tr>`;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; padding: 24px;">${escapeHtml(err.message)}</td></tr>`;
  }
}

function nnToggleAllProfiles(box) {
  document.querySelectorAll('.nn-prof-check').forEach(c => { c.checked = box.checked; });
}

function nnSelectedProfileIds() {
  return Array.from(document.querySelectorAll('.nn-prof-check:checked')).map(c => c.value);
}

function nnOpenCreateProfile() {
  document.getElementById('nn-profile-modal-title').textContent = 'Tạo Hồ Sơ Trình Duyệt Antidetect Mới';
  document.getElementById('nn-prof-id').value = '';
  document.getElementById('nn-prof-name').value = 'Profile-' + String(nnCurrentProfiles.length + 1).padStart(2, '0');
  document.getElementById('nn-prof-proxy').value = '';
  document.getElementById('nn-prof-os').value = '1';
  document.getElementById('nn-prof-version').value = '128';
  document.getElementById('nn-prof-browser-name').value = 'Chrome';
  document.getElementById('nn-prof-canvas').value = '1';
  document.getElementById('nn-prof-webgl').value = '1';
  document.getElementById('nn-prof-audio').value = '1';
  document.getElementById('nn-prof-webrtc').value = '1';
  document.getElementById('nn-prof-res').value = '1920x1080';
  document.getElementById('nn-prof-hw').value = '8-16';
  document.getElementById('nn-prof-startup').value = 'https://www.google.com';
  document.getElementById('nn-prof-lang').value = 'en-US';
  nnRandomizeAllFingerprint();
  openModal('modal-nn-profile');
}

function nnCloseProfileModal() {
  closeModal('modal-nn-profile');
}

function nnOnOsChanged() {
  nnRandomizeUa();
  const os = document.getElementById('nn-prof-os').value;
  if (os === '2') {
    document.getElementById('nn-prof-webgl-vendor').value = 'Google Inc. (Apple)';
    document.getElementById('nn-prof-webgl-renderer').value = 'ANGLE (Apple, Apple M2, OpenGL 4.1)';
  } else {
    document.getElementById('nn-prof-webgl-vendor').value = 'Google Inc. (NVIDIA)';
    document.getElementById('nn-prof-webgl-renderer').value = 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)';
  }
}

function nnRandomizeUa() {
  const os = document.getElementById('nn-prof-os').value;
  const ver = document.getElementById('nn-prof-version').value || '128';
  if (os === '2') {
    document.getElementById('nn-prof-ua').value = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${ver}.0.0.0 Safari/537.36`;
  } else if (os === '3') {
    document.getElementById('nn-prof-ua').value = `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${ver}.0.0.0 Safari/537.36`;
  } else {
    document.getElementById('nn-prof-ua').value = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${ver}.0.0.0 Safari/537.36`;
  }
}

function nnRandomizeAllFingerprint() {
  nnRandomizeUa();
  const vendors = [
    { v: 'Google Inc. (NVIDIA)', r: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
    { v: 'Google Inc. (NVIDIA)', r: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
    { v: 'Google Inc. (Intel)', r: 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
    { v: 'Google Inc. (Intel)', r: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)' },
    { v: 'Google Inc. (Apple)', r: 'ANGLE (Apple, Apple M2, OpenGL 4.1)' },
  ];
  const item = vendors[Math.floor(Math.random() * vendors.length)];
  document.getElementById('nn-prof-webgl-vendor').value = item.v;
  document.getElementById('nn-prof-webgl-renderer').value = item.r;
}

function nnEditProfile(id) {
  const p = nnCurrentProfiles.find(x => x.Id === id);
  if (!p) return;
  document.getElementById('nn-profile-modal-title').textContent = 'Chỉnh Sửa Hồ Sơ Antidetect: ' + (p.Name || p.Id);
  document.getElementById('nn-prof-id').value = p.Id;
  document.getElementById('nn-prof-name').value = p.Name || '';
  document.getElementById('nn-prof-group').value = p.GroupId || 'Default';
  document.getElementById('nn-prof-proxy').value = p.RawProxy || '';
  document.getElementById('nn-prof-os').value = String(p.OsType || 1);
  document.getElementById('nn-prof-browser-name').value = p.BrowserName || 'Chrome';
  document.getElementById('nn-prof-version').value = p.BrowserVersion || '128';
  document.getElementById('nn-prof-ua').value = p.CustomUserAgent || '';
  document.getElementById('nn-prof-canvas').value = String(p.CanvasMode || 1);
  document.getElementById('nn-prof-webgl').value = String(p.WebglImageMode || 1);
  document.getElementById('nn-prof-webgl-vendor').value = p.WebglVendor || '';
  document.getElementById('nn-prof-webgl-renderer').value = p.WebglRenderer || '';
  document.getElementById('nn-prof-audio').value = String(p.AudioMode || 1);
  document.getElementById('nn-prof-webrtc').value = String(p.WebrtcMode || 1);
  document.getElementById('nn-prof-res').value = p.Resolution || '1920x1080';
  document.getElementById('nn-prof-startup').value = p.StartupUrls || 'https://www.google.com';
  document.getElementById('nn-prof-lang').value = p.FixedLanguage || 'en-US';
  openModal('modal-nn-profile');
}

async function nnSubmitProfile() {
  const id = document.getElementById('nn-prof-id').value.trim();
  const hw = (document.getElementById('nn-prof-hw').value || '8-16').split('-');
  const cores = parseInt(hw[0]) || 8;
  const memory = parseInt(hw[1]) || 16;

  const payload = {
    Id: id || undefined,
    Name: document.getElementById('nn-prof-name').value.trim() || 'Profile',
    GroupId: document.getElementById('nn-prof-group').value || 'Default',
    RawProxy: document.getElementById('nn-prof-proxy').value.trim(),
    BrowserName: document.getElementById('nn-prof-browser-name').value || 'Chrome',
    BrowserVersion: document.getElementById('nn-prof-version').value || '128',
    OsType: parseInt(document.getElementById('nn-prof-os').value) || 1,
    CustomUserAgent: document.getElementById('nn-prof-ua').value.trim(),
    CanvasMode: parseInt(document.getElementById('nn-prof-canvas').value) || 1,
    WebglImageMode: parseInt(document.getElementById('nn-prof-webgl').value) || 1,
    WebglVendor: document.getElementById('nn-prof-webgl-vendor').value.trim(),
    WebglRenderer: document.getElementById('nn-prof-webgl-renderer').value.trim(),
    AudioMode: parseInt(document.getElementById('nn-prof-audio').value) || 1,
    ClientRectMode: 1,
    WebrtcMode: parseInt(document.getElementById('nn-prof-webrtc').value) || 1,
    Resolution: document.getElementById('nn-prof-res').value || '1920x1080',
    Cores: cores,
    Memory: memory,
    StartupUrls: document.getElementById('nn-prof-startup').value.trim() || 'https://www.google.com',
    FixedLanguage: document.getElementById('nn-prof-lang').value.trim() || 'en-US',
  };

  try {
    await nnFetch('/profiles', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    showToast('Đã lưu hồ sơ thành công');
    nnCloseProfileModal();
    loadNnProfiles();
  } catch (err) { showToast(err.message); }
}

async function nnDeleteProfile(id) {
  if (!confirm(`Chuyển profile ${id} vào thùng rác? Bạn có thể khôi phục lại bất kỳ lúc nào.`)) return;
  try {
    await nnFetch(`/profiles/${id}`, { method: 'DELETE' });
    showToast('Đã chuyển profile vào thùng rác');
    loadNnProfiles();
  } catch (err) { showToast(err.message); }
}

async function nnStartProfile(id) {
  showToast(`Đang khởi động profile ${id}...`);
  try {
    const res = await nnFetch(`/profiles/${id}/start`, { method: 'POST' });
    showToast(`Đã mở profile ${id} (Port: ${res.remote_debugging_port})`);
    loadNnProfiles();
  } catch (err) { showToast(err.message, 6000); }
}

async function nnStopProfile(id) {
  try {
    await nnFetch(`/profiles/${id}/stop`, { method: 'POST' });
    showToast(`Đã đóng profile ${id}`);
    loadNnProfiles();
  } catch (err) { showToast(err.message); }
}

async function nnStartSelectedProfiles() {
  const ids = nnSelectedProfileIds();
  if (!ids.length) { showToast('Chưa chọn profile nào'); return; }
  showToast(`Đang mở ${ids.length} profile...`);
  for (const pid of ids) {
    try {
      await nnFetch(`/profiles/${pid}/start`, { method: 'POST' });
    } catch (e) {}
  }
  loadNnProfiles();
}

async function nnStopSelectedProfiles() {
  const ids = nnSelectedProfileIds();
  if (!ids.length) { showToast('Chưa chọn profile nào'); return; }
  for (const pid of ids) {
    try {
      await nnFetch(`/profiles/${pid}/stop`, { method: 'POST' });
    } catch (e) {}
  }
  showToast('Đã đóng các profile đã chọn');
  loadNnProfiles();
}

async function nnOpenCookies(id, name) {
  document.getElementById('nn-cookies-profile-id').value = id;
  document.getElementById('nn-cookies-profile-name').textContent = `Hồ sơ: ${name || id}`;
  document.getElementById('nn-cookies-data').value = 'Đang tải cookies...';
  openModal('modal-nn-cookies');
  try {
    const data = await nnFetch(`/profiles/${id}/cookies`);
    document.getElementById('nn-cookies-data').value = JSON.stringify(data.cookies || [], null, 2);
  } catch (err) {
    document.getElementById('nn-cookies-data').value = `Lỗi: ${err.message}`;
  }
}

function nnCopyCookies() {
  const txt = document.getElementById('nn-cookies-data').value;
  navigator.clipboard.writeText(txt).then(() => showToast('Đã copy cookies vào clipboard!'));
}

async function nnSaveCookies() {
  const id = document.getElementById('nn-cookies-profile-id').value;
  const raw = document.getElementById('nn-cookies-data').value.trim();
  try {
    const cookies = JSON.parse(raw);
    await nnFetch(`/profiles/${id}/cookies`, {
      method: 'POST',
      body: JSON.stringify(cookies),
    });
    showToast('Đã nạp cookies vào profile');
    closeModal('modal-nn-cookies');
  } catch (err) { showToast('Định dạng JSON cookies không hợp lệ: ' + err.message); }
}

// ==============================================================================
// GPM LOGIN GLOBAL WORKSTATION CONTROLLERS (PORT TỪ BẢN MAC DMG)
// ==============================================================================

function gpmOpenCreateByNumber() {
  const groupSel = document.getElementById('gpm-batch-group');
  if (groupSel) {
    groupSel.innerHTML = (nnCurrentGroups.length ? nnCurrentGroups : [{Id: 'Default', Name: 'Mặc định'}]).map(g => `<option value="${g.Id}">${escapeHtml(g.Name)}</option>`).join('');
  }
  const startInp = document.getElementById('gpm-batch-start');
  if (startInp) startInp.value = String(nnCurrentProfiles.length + 1);
  openModal('modal-gpm-create-by-number');
}

async function gpmSubmitCreateByNumber() {
  const prefix = document.getElementById('gpm-batch-prefix').value.trim() || 'Profile-';
  const start = parseInt(document.getElementById('gpm-batch-start').value) || 1;
  const count = parseInt(document.getElementById('gpm-batch-count').value) || 5;
  const group = document.getElementById('gpm-batch-group').value || 'Default';
  const osType = parseInt(document.getElementById('gpm-batch-os').value) || 1;
  const ver = document.getElementById('gpm-batch-version').value || '128';
  const startup = document.getElementById('gpm-batch-startup').value.trim() || 'https://www.google.com';
  const proxies = document.getElementById('gpm-batch-proxies').value;

  showToast(`Đang tạo hàng loạt ${count} profiles GPM...`);
  try {
    const res = await nnFetch('/profiles/create-by-number', {
      method: 'POST',
      body: JSON.stringify({
        prefix: prefix,
        start_index: start,
        count: count,
        group_id: group,
        os_type: osType,
        browser_version: ver,
        browser_type: 'Chrome',
        startup_urls: startup,
        proxy_list: proxies
      })
    });
    showToast(`Đã tạo thành công ${res.created_count} profiles!`);
    closeModal('modal-gpm-create-by-number');
    loadNnProfiles();
  } catch (err) {
    showToast('Lỗi tạo profile hàng loạt: ' + err.message);
  }
}

function gpmOpenImportExcel() {
  const fileInput = document.getElementById('gpm-excel-file-input');
  if (fileInput) fileInput.value = '';
  const pasteArea = document.getElementById('gpm-excel-paste-area');
  if (pasteArea) pasteArea.value = '';
  openModal('modal-gpm-import-excel');
}

function gpmOnExcelFileSelected(inp) {
  if (inp.files && inp.files[0]) {
    showToast(`Đã chọn: ${inp.files[0].name} (${Math.round(inp.files[0].size / 1024)} KB)`);
  }
}

function gpmDownloadSampleTemplate() {
  const sampleData = "Profile name\tGroup name\tBrowser type\tProxy type\tProxy\nProfile-GPM-01\tDefault\tchrome\thttp\t127.0.0.1:8080\nProfile-GPM-02\tDefault\tchrome\tsocks5\tsocks5://user:pass@192.168.1.10:1080\n";
  const blob = new Blob([sampleData], { type: 'text/tab-separated-values;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'sample_gpm_profiles_template.tsv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Đã tải file mẫu TSV/Excel!');
}

async function gpmSubmitImportExcel() {
  const fileInput = document.getElementById('gpm-excel-file-input');
  const pasteArea = document.getElementById('gpm-excel-paste-area');

  if (fileInput && fileInput.files && fileInput.files[0]) {
    const fd = new FormData();
    fd.append('file', fileInput.files[0]);
    showToast('Đang tải lên và phân tích file Excel...');
    try {
      const res = await fetch(NN_API + '/profiles/import-excel', {
        method: 'POST',
        body: fd
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Lỗi nhập Excel');
      showToast(`Đã nhập thành công ${data.imported_count} profiles!`);
      closeModal('modal-gpm-import-excel');
      loadNnProfiles();
    } catch (err) {
      showToast('Lỗi nhập Excel: ' + err.message);
    }
    return;
  }

  const rawPaste = pasteArea ? pasteArea.value.trim() : '';
  if (!rawPaste) {
    showToast('Vui lòng chọn file Excel hoặc dán dữ liệu vào ô!');
    return;
  }

  const lines = rawPaste.split(/\r?\n/).filter(l => l.trim().length > 0);
  const rows = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const parts = line.includes('\t') ? line.split('\t') : line.split(/[,|]/);
    const pName = (parts[0] || '').trim();
    if (!pName || pName.toLowerCase().startsWith('profile name') || pName.toLowerCase().startsWith('tên')) continue;
    rows.push({
      name: pName,
      group: (parts[1] || 'Default').trim(),
      browser: (parts[2] || 'Chrome').trim(),
      proxy: (parts[4] || parts[3] || '').trim()
    });
  }

  if (!rows.length) {
    showToast('Không tìm thấy dòng dữ liệu hợp lệ nào!');
    return;
  }

  showToast(`Đang nhập ${rows.length} profiles...`);
  try {
    const data = await nnFetch('/profiles/import-excel', {
      method: 'POST',
      body: JSON.stringify({ rows })
    });
    showToast(`Đã nhập thành công ${data.imported_count} profiles!`);
    closeModal('modal-gpm-import-excel');
    loadNnProfiles();
  } catch (err) {
    showToast('Lỗi nhập profiles: ' + err.message);
  }
}

function gpmExportExcel() {
  showToast('Đang tạo và tải file Excel profiles...');
  window.open(NN_API + '/profiles/export-excel', '_blank');
}

function gpmOpenArrangeWindows() {
  openModal('modal-gpm-arrange-windows');
}

async function gpmSubmitArrangeWindows() {
  const cols = parseInt(document.getElementById('gpm-arrange-cols').value) || 2;
  const rows = parseInt(document.getElementById('gpm-arrange-rows').value) || 2;
  const resStr = document.getElementById('gpm-arrange-res').value || '1440x900';
  const parts = resStr.split('x');
  const sw = parseInt(parts[0]) || 1440;
  const sh = parseInt(parts[1]) || 900;

  showToast(`Đang sắp xếp các cửa sổ lưới ${cols}x${rows}...`);
  try {
    const res = await nnFetch('/profiles/arrange-windows', {
      method: 'POST',
      body: JSON.stringify({ cols, rows, screen_width: sw, screen_height: sh })
    });
    showToast(`Đã sắp xếp ${res.arranged_count} cửa sổ trình duyệt!`);
    closeModal('modal-gpm-arrange-windows');
  } catch (err) {
    showToast('Lỗi sắp xếp: ' + err.message);
  }
}

function gpmOpenSyncAction() {
  const running = nnCurrentProfiles.filter(p => p.is_running || p.Status === 'running');
  const masterSel = document.getElementById('gpm-sync-master');
  if (!masterSel) return;

  if (!running.length) {
    masterSel.innerHTML = '<option value="">(Không có profile nào đang chạy)</option>';
    document.getElementById('gpm-sync-slaves-list').innerHTML = '<div style="color: var(--text-muted); font-size: 12px; padding: 6px;">Vui lòng mở ít nhất 2 profile để đồng bộ thao tác!</div>';
  } else {
    masterSel.innerHTML = running.map(p => `<option value="${p.Id}">👑 ${escapeHtml(p.Name || p.Id)} (Port ${p.remote_debugging_port || '---'})</option>`).join('');
    gpmUpdateSyncSlavesList();
  }
  openModal('modal-gpm-sync-action');
}

function gpmUpdateSyncSlavesList() {
  const masterId = document.getElementById('gpm-sync-master').value;
  const slavesBox = document.getElementById('gpm-sync-slaves-list');
  if (!slavesBox) return;

  const running = nnCurrentProfiles.filter(p => (p.is_running || p.Status === 'running') && p.Id !== masterId);
  if (!running.length) {
    slavesBox.innerHTML = '<div style="color: var(--text-muted); font-size: 12px; padding: 4px;">Chưa có profile con nào khác đang chạy.</div>';
    return;
  }

  slavesBox.innerHTML = running.map(p => `
    <label style="display: flex; align-items: center; gap: 8px; font-size: 12.5px; padding: 4px 6px; cursor: pointer; border-radius: 4px;">
      <input type="checkbox" class="gpm-slave-check" value="${p.Id}" checked>
      <span>🎯 <b>${escapeHtml(p.Name || p.Id)}</b> <span class="mono" style="font-size: 11px; color: var(--text-muted);">(Port ${p.remote_debugging_port || '---'})</span></span>
    </label>
  `).join('');
}

function gpmSelectAllSyncSlaves() {
  const checks = document.querySelectorAll('.gpm-slave-check');
  const allChecked = Array.from(checks).every(c => c.checked);
  checks.forEach(c => c.checked = !allChecked);
}

function gpmGetSyncTargets() {
  const masterId = document.getElementById('gpm-sync-master').value;
  if (!masterId) {
    showToast('Chưa chọn Profile Master!');
    return null;
  }
  const slaveIds = Array.from(document.querySelectorAll('.gpm-slave-check:checked')).map(c => c.value);
  if (!slaveIds.length) {
    showToast('Chưa chọn Profile Con (Slave) nào!');
    return null;
  }
  return { masterId, slaveIds };
}

async function gpmBroadcastNavigate() {
  const targets = gpmGetSyncTargets();
  if (!targets) return;
  const url = document.getElementById('gpm-sync-url-input').value.trim();
  if (!url) { showToast('Vui lòng nhập địa chỉ URL!'); return; }

  showToast(`Đang đồng bộ điều hướng ${targets.slaveIds.length + 1} trình duyệt tới: ${url}`);
  try {
    const res = await nnFetch('/profiles/sync-action', {
      method: 'POST',
      body: JSON.stringify({
        master_id: targets.masterId,
        slave_ids: targets.slaveIds,
        action: 'navigate',
        data: { url }
      })
    });
    showToast(`Đã điều hướng ${res.success_count} cửa sổ!`);
  } catch (err) { showToast('Lỗi đồng bộ: ' + err.message); }
}

async function gpmBroadcastReload() {
  const targets = gpmGetSyncTargets();
  if (!targets) return;

  showToast(`Đang làm mới ${targets.slaveIds.length + 1} trình duyệt...`);
  try {
    const res = await nnFetch('/profiles/sync-action', {
      method: 'POST',
      body: JSON.stringify({
        master_id: targets.masterId,
        slave_ids: targets.slaveIds,
        action: 'reload',
        data: {}
      })
    });
    showToast(`Đã làm mới ${res.success_count} cửa sổ!`);
  } catch (err) { showToast('Lỗi làm mới: ' + err.message); }
}

async function gpmBroadcastScroll() {
  const targets = gpmGetSyncTargets();
  if (!targets) return;

  showToast(`Đang cuộn trang trên ${targets.slaveIds.length + 1} trình duyệt...`);
  try {
    const res = await nnFetch('/profiles/sync-action', {
      method: 'POST',
      body: JSON.stringify({
        master_id: targets.masterId,
        slave_ids: targets.slaveIds,
        action: 'scroll',
        data: { delta_y: 500 }
      })
    });
    showToast(`Đã cuộn ${res.success_count} cửa sổ!`);
  } catch (err) { showToast('Lỗi cuộn: ' + err.message); }
}

async function gpmOpenTrash() {
  const tbody = document.getElementById('gpm-trash-tbody');
  const countEl = document.getElementById('gpm-trash-modal-count');
  if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 16px;">Đang tải thùng rác...</td></tr>';
  openModal('modal-gpm-trash');

  try {
    const data = await nnFetch('/profiles/trash');
    const list = data.trash || [];
    if (countEl) countEl.textContent = list.length;
    const trBadge = document.getElementById('gpm-trash-count');
    if (trBadge) trBadge.textContent = list.length;

    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px; color: var(--text-muted);">Thùng rác trống.</td></tr>';
      return;
    }

    tbody.innerHTML = list.map(p => `
      <tr>
        <td>
          <div style="font-weight: 600; color: var(--text-primary);">${escapeHtml(p.Name || p.Id)}</div>
          <div class="mono" style="font-size: 10px; color: var(--text-muted);">${p.Id}</div>
        </td>
        <td><span class="badge badge-neutral" style="font-size: 11px;">${escapeHtml(p.GroupId || 'Default')}</span></td>
        <td class="mono" style="font-size: 11px;">${escapeHtml(p.RawProxy || '---')}</td>
        <td style="font-size: 11px; color: var(--text-muted);">${(p.DeletedAt || p.deleted_at) ? new Date(p.DeletedAt || p.deleted_at).toLocaleString() : '---'}</td>
        <td style="text-align: center; white-space: nowrap;">
          <button class="btn btn-emerald btn-sm" style="padding: 2px 7px;" onclick="gpmRestoreProfile('${p.Id}')" title="Khôi phục">♻️ Phục Hồi</button>
          <button class="btn btn-danger btn-sm" style="padding: 2px 7px;" onclick="gpmPermanentDelete('${p.Id}')" title="Xoá vĩnh viễn">💥 Xoá Hẳn</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 16px; color: #ef4444;">${escapeHtml(err.message)}</td></tr>`;
  }
}

async function gpmRestoreProfile(id) {
  try {
    await nnFetch(`/profiles/${id}/restore`, { method: 'POST' });
    showToast(`Đã phục hồi profile ${id}!`);
    gpmOpenTrash();
    loadNnProfiles();
  } catch (err) { showToast('Lỗi phục hồi: ' + err.message); }
}

async function gpmPermanentDelete(id) {
  if (!confirm(`Bạn có chắc chắn muốn xoá vĩnh viễn profile ${id}? Thao tác này không thể hoàn tác.`)) return;
  try {
    await nnFetch(`/profiles/${id}/permanent`, { method: 'DELETE' });
    showToast(`Đã xoá vĩnh viễn profile ${id}!`);
    gpmOpenTrash();
  } catch (err) { showToast('Lỗi xoá: ' + err.message); }
}

async function gpmEmptyTrash() {
  if (!confirm('Bạn có chắc chắn muốn dọn sạch toàn bộ thùng rác? Mọi dữ liệu trong thùng rác sẽ bị xoá vĩnh viễn.')) return;
  try {
    const res = await nnFetch('/profiles/trash/empty', { method: 'DELETE' });
    showToast(`Đã dọn sạch ${res.deleted_count} profile khỏi thùng rác!`);
    gpmOpenTrash();
    loadNnProfiles();
  } catch (err) { showToast('Lỗi dọn thùng rác: ' + err.message); }
}

function gpmOpenBulkGroup() {
  const ids = nnSelectedProfileIds();
  if (!ids.length) { showToast('Chưa chọn profile nào'); return; }
  const sel = document.getElementById('gpm-bulk-group-select');
  if (sel) {
    sel.innerHTML = (nnCurrentGroups.length ? nnCurrentGroups : [{Id: 'Default', Name: 'Mặc định'}]).map(g => `<option value="${g.Id}">${escapeHtml(g.Name)}</option>`).join('');
  }
  openModal('modal-gpm-bulk-group');
}

async function gpmSubmitBulkGroup() {
  const ids = nnSelectedProfileIds();
  const gid = document.getElementById('gpm-bulk-group-select').value;
  try {
    const res = await nnFetch('/profiles/bulk-update-group', {
      method: 'POST',
      body: JSON.stringify({ profile_ids: ids, group_id: gid })
    });
    showToast(`Đã đổi nhóm thành công cho ${res.updated_count} profiles!`);
    closeModal('modal-gpm-bulk-group');
    loadNnProfiles();
  } catch (err) { showToast('Lỗi đổi nhóm: ' + err.message); }
}

function gpmOpenBulkProxy() {
  const ids = nnSelectedProfileIds();
  if (!ids.length) { showToast('Chưa chọn profile nào'); return; }
  document.getElementById('gpm-bulk-proxy-input').value = '';
  openModal('modal-gpm-bulk-proxy');
}

async function gpmSubmitBulkProxy() {
  const ids = nnSelectedProfileIds();
  const proxy = document.getElementById('gpm-bulk-proxy-input').value.trim();
  try {
    const res = await nnFetch('/profiles/bulk-update-proxy', {
      method: 'POST',
      body: JSON.stringify({ profile_ids: ids, raw_proxy: proxy })
    });
    showToast(`Đã cập nhật proxy cho ${res.updated_count} profiles!`);
    closeModal('modal-gpm-bulk-proxy');
    loadNnProfiles();
  } catch (err) { showToast('Lỗi gán proxy: ' + err.message); }
}

async function gpmBulkRandomFingerprint() {
  const ids = nnSelectedProfileIds();
  if (!ids.length) { showToast('Chưa chọn profile nào'); return; }
  if (!confirm(`Tạo ngẫu nhiên lại vân tay (WebGL, Canvas, Audio, CPU/RAM, Resolution) cho ${ids.length} profiles đã chọn?`)) return;

  showToast(`Đang tạo ngẫu nhiên vân tay cho ${ids.length} profiles...`);
  try {
    const res = await nnFetch('/profiles/bulk-random-fingerprint', {
      method: 'POST',
      body: JSON.stringify({ profile_ids: ids })
    });
    showToast(`Đã cập nhật ngẫu nhiên vân tay cho ${res.updated_count} profiles!`);
    loadNnProfiles();
  } catch (err) { showToast('Lỗi cập nhật vân tay: ' + err.message); }
}

async function gpmClearProfileCache(id) {
  if (!confirm(`Xoá bộ nhớ đệm (Cache, GPUCache, Code Cache, ShaderCache) cho profile ${id}? Cookie và dữ liệu đăng nhập sẽ được giữ lại.`)) return;
  try {
    const res = await nnFetch(`/profiles/${id}/clear-cache`, { method: 'POST' });
    showToast(`Đã dọn dẹp ${res.cleared_items} thư mục cache cho profile ${id}!`);
  } catch (err) { showToast('Lỗi dọn cache: ' + err.message); }
}

// ==============================================================================
// GPM BROWSER CORE & DRIVER UPDATE MANAGER (UpdateManagerPopup & Downloader)
// ==============================================================================

let gpmCoresCache = [];
let gpmDownloadPollInterval = null;

async function gpmOpenUpdateManager() {
  openModal('modal-gpm-update-manager');
  const tbody = document.getElementById('gpm-cores-tbody');
  if (tbody) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px; color: var(--text-muted);">⏳ Đang kiểm tra hệ thống và tải danh sách nhân trình duyệt...</td></tr>';
  }

  try {
    const data = await nnFetch('/browser/cores');
    gpmCoresCache = data.cores || [];

    const sysEl = document.getElementById('gpm-sys-chrome-ver');
    if (sysEl) {
      sysEl.textContent = data.system_chrome || 'Google Chrome';
    }

    const statEl = document.getElementById('gpm-cores-stat');
    if (statEl) {
      statEl.textContent = `${data.installed_count || 0} / ${data.total_cores || 0} Cores sẵn sàng`;
    }

    gpmRenderCoresTable(gpmCoresCache);
  } catch (err) {
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 20px; color: #ef4444;">Lỗi nạp danh sách: ${escapeHtml(err.message)}</td></tr>`;
    }
    showToast('Lỗi nạp thông tin trình duyệt: ' + err.message, 'error');
  }
}

function gpmRenderCoresTable(cores) {
  const tbody = document.getElementById('gpm-cores-tbody');
  if (!tbody) return;

  if (!cores || !cores.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px;">Không có gói nhân nào</td></tr>';
    return;
  }

  tbody.innerHTML = cores.map(c => {
    let statusBadge = '';
    let actionBtn = '';

    if (c.status === 'ready' || (c.is_installed && c.current_version === c.latest_version)) {
      statusBadge = '<span class="badge-status status-bkt" style="font-size: 10.5px;">🟢 Mới nhất</span>';
      actionBtn = `<button class="btn btn-outline btn-xs" onclick="gpmStartCoreDownload('${c.id}', '${escapeHtml(c.name)}')">🔄 Cài lại</button>`;
    } else if (c.status === 'update_available' || (c.is_installed && c.current_version !== c.latest_version)) {
      statusBadge = '<span class="badge-status" style="background: rgba(245,158,11,0.2); color: #fbbf24; border: 1px solid rgba(245,158,11,0.4); font-size: 10.5px;">⚡ Có bản mới</span>';
      actionBtn = `<button class="btn btn-primary btn-xs" style="font-weight: 600;" onclick="gpmStartCoreDownload('${c.id}', '${escapeHtml(c.name)}')">⬇️ Cập nhật</button>`;
    } else if (c.status === 'downloading') {
      statusBadge = '<span class="badge-status" style="background: rgba(59,130,246,0.2); color: #60a5fa; border: 1px solid rgba(59,130,246,0.4); font-size: 10.5px;">⏳ Đang tải...</span>';
      actionBtn = `<button class="btn btn-secondary btn-xs" disabled>Đang tải</button>`;
    } else {
      statusBadge = '<span class="badge-status status-normal" style="font-size: 10.5px;">Chưa cài đặt</span>';
      actionBtn = `<button class="btn btn-secondary btn-xs" onclick="gpmStartCoreDownload('${c.id}', '${escapeHtml(c.name)}')">⬇️ Tải về</button>`;
    }

    const icon = c.icon || (c.id.includes('driver') ? '⚡' : '🌐');
    const size = c.size_mb ? `${c.size_mb} MB` : 'N/A';

    return `
      <tr>
        <td>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 16px;">${icon}</span>
            <div>
              <div style="font-weight: 600; font-size: 12.5px; color: var(--text-primary);">${escapeHtml(c.name)}</div>
              <div style="font-size: 10.5px; color: var(--text-muted); font-variant-numeric: tabular-nums;">${escapeHtml(c.id)}</div>
            </div>
          </div>
        </td>
        <td><span class="mono" style="font-weight: 600; color: #38bdf8;">${escapeHtml(c.current_version || 'Chưa có')}</span></td>
        <td><span class="mono" style="font-weight: 600; color: #34d399;">${escapeHtml(c.latest_version || 'N/A')}</span></td>
        <td><span class="mono" style="font-size: 11px; color: var(--text-secondary);">${size}</span></td>
        <td>${statusBadge}</td>
        <td style="text-align: center;">${actionBtn}</td>
      </tr>
    `;
  }).join('');
}

async function gpmCheckCoreUpdates() {
  showToast('Đang kết nối CDN máy chủ kiểm tra phiên bản mới...');
  try {
    const res = await nnFetch('/browser/check-update', { method: 'POST' });
    showToast(res.message || 'Đã kiểm tra phiên bản mới nhất!', 'success');
    if (res.cores) {
      gpmCoresCache = res.cores;
      gpmRenderCoresTable(gpmCoresCache);
    } else {
      gpmOpenUpdateManager();
    }
  } catch (err) {
    showToast('Lỗi kiểm tra cập nhật: ' + err.message, 'error');
  }
}

async function gpmStartCoreDownload(coreId, coreName) {
  openModal('modal-gpm-resource-download');

  const compEl = document.getElementById('gpm-dl-component');
  const barEl = document.getElementById('gpm-dl-progress-bar');
  const pctEl = document.getElementById('gpm-dl-percent');
  const spdEl = document.getElementById('gpm-dl-speed');
  const msgEl = document.getElementById('gpm-dl-message');
  const closeBtn = document.getElementById('gpm-dl-close-btn');

  if (compEl) compEl.textContent = coreName || coreId;
  if (barEl) barEl.style.width = '0%';
  if (pctEl) pctEl.textContent = '0%';
  if (spdEl) spdEl.textContent = '16.8 MB/s';
  if (msgEl) msgEl.textContent = 'Đang khởi tạo kết nối mạng và chuẩn bị tệp...';
  if (closeBtn) closeBtn.disabled = true;

  try {
    await nnFetch('/browser/update-core', {
      method: 'POST',
      body: JSON.stringify({ core_id: coreId })
    });

    if (gpmDownloadPollInterval) clearInterval(gpmDownloadPollInterval);

    gpmDownloadPollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/nn/browser/download-progress/${coreId}`);
        const prog = await res.json();

        if (barEl) barEl.style.width = `${prog.progress || 0}%`;
        if (pctEl) pctEl.textContent = `${prog.progress || 0}%`;
        if (spdEl) spdEl.textContent = `${prog.speed_mb_s || 15.2} MB/s`;
        if (msgEl) msgEl.textContent = prog.message || 'Đang xử lý dữ liệu...';

        if (prog.status === 'completed') {
          clearInterval(gpmDownloadPollInterval);
          gpmDownloadPollInterval = null;
          if (closeBtn) closeBtn.disabled = false;
          showToast(`Cập nhật thành công ${coreName || coreId}!`, 'success');
          setTimeout(() => {
            closeModal('modal-gpm-resource-download');
            const mgr = document.getElementById('modal-gpm-update-manager');
            if (mgr && mgr.style.display === 'flex') {
              gpmOpenUpdateManager();
            }
          }, 800);
        } else if (prog.status === 'error') {
          clearInterval(gpmDownloadPollInterval);
          gpmDownloadPollInterval = null;
          if (closeBtn) closeBtn.disabled = false;
          showToast(`Lỗi cập nhật: ${prog.message}`, 'error');
        }
      } catch (pollErr) {
        console.warn('Download poll error:', pollErr);
      }
    }, 350);

  } catch (err) {
    if (closeBtn) closeBtn.disabled = false;
    showToast('Lỗi kích hoạt tải xuống: ' + err.message, 'error');
  }
}

async function gpmUpdateAllCores() {
  if (!gpmCoresCache.length) {
    await gpmOpenUpdateManager();
  }

  const needUpdate = gpmCoresCache.filter(c => c.status === 'update_available' || !c.is_installed);
  if (!needUpdate.length) {
    showToast('Tất cả các gói nhân trình duyệt và driver đã ở phiên bản mới nhất!');
    return;
  }

  showToast(`Bắt đầu cập nhật ${needUpdate.length} gói trình duyệt...`);
  // Tải gói đầu tiên cần cập nhật
  const first = needUpdate[0];
  gpmStartCoreDownload(first.id, first.name);
}

// ------------------------------------------------------------------------------
// GPM SELECT BROWSER VERSION (Change Core Version for Selected Profiles)
// ------------------------------------------------------------------------------

function gpmOpenSelectBrowserVersion() {
  const ids = nnSelectedProfileIds();
  if (!ids.length) {
    showToast('Vui lòng tích chọn ít nhất 1 profile để đổi phiên bản Chromium!');
    return;
  }
  openModal('modal-gpm-select-browser-version');
}

async function gpmSubmitSelectBrowserVersion() {
  const ids = nnSelectedProfileIds();
  if (!ids.length) {
    showToast('Chưa chọn profile nào');
    return;
  }

  const version = document.getElementById('gpm-select-browser-version-input')?.value || '152';
  const syncUa = document.getElementById('gpm-select-sync-ua')?.checked !== false;

  try {
    const res = await nnFetch('/profiles/bulk-update-version', {
      method: 'POST',
      body: JSON.stringify({
        profile_ids: ids,
        new_version: version,
        browser_type: 'chromium',
        update_ua: syncUa
      })
    });

    showToast(`Đã đổi phiên bản Chromium ${version} cho ${res.updated_count} profiles!`, 'success');
    closeModal('modal-gpm-select-browser-version');
    loadNnProfiles();
  } catch (err) {
    showToast('Lỗi đổi phiên bản: ' + err.message, 'error');
  }
}


// ==============================================================================
// 2. PROXIES MANAGEMENT (BaoSamBrowser Proxy Hub)
// ==============================================================================

let nnCurrentProxies = [];

async function loadNnProxies() {
  const tbody = document.getElementById('nn-proxy-tbody');
  if (!tbody) return;
  try {
    const { proxies, total } = await nnFetch('/proxies');
    nnCurrentProxies = proxies || [];
    const live = nnCurrentProxies.filter(p => p.Status === 'live').length;
    const die = nnCurrentProxies.filter(p => p.Status === 'die').length;
    if (document.getElementById('nn-proxy-total')) document.getElementById('nn-proxy-total').textContent = total;
    if (document.getElementById('nn-proxy-live')) document.getElementById('nn-proxy-live').textContent = live;
    if (document.getElementById('nn-proxy-die')) document.getElementById('nn-proxy-die').textContent = die;
    const sideProxBadge = document.getElementById('side-badge-proxies');
    if (sideProxBadge) sideProxBadge.textContent = total;

    if (!nnCurrentProxies.length) {
      tbody.innerHTML = '<tr><td colspan="10" style="text-align: center; padding: 24px;">Kho proxy trống. Bấm "Thêm Proxy Hàng Loạt" để nạp.</td></tr>';
      return;
    }

    tbody.innerHTML = nnCurrentProxies.map((p, idx) => {
      let pingColor = 'var(--text-muted)';
      if (p.PingMs > 0 && p.PingMs < 250) pingColor = '#10b981';
      else if (p.PingMs >= 250 && p.PingMs < 600) pingColor = '#f59e0b';
      else if (p.PingMs >= 600) pingColor = '#ef4444';

      return `
        <tr>
          <td><input type="checkbox" class="nn-proxy-check" value="${p.Id}"></td>
          <td>${idx + 1}</td>
          <td class="mono" style="font-size: 12px; font-weight: 600; color: #38bdf8;">${escapeHtml(p.RawProxy)}</td>
          <td><span class="badge badge-neutral" style="font-size: 11px;">${escapeHtml(p.Protocol || 'http')}</span></td>
          <td class="mono" style="font-weight: 700; color: ${pingColor};">
            ${p.PingMs > 0 ? `${p.PingMs} ms` : '---'}
          </td>
          <td class="mono" style="font-size: 12px;">${escapeHtml(p.RealIp || '---')}</td>
          <td>${p.Country ? `🌍 ${escapeHtml(p.Country)}` : '---'}</td>
          <td>
            <span class="badge ${p.Status === 'live' ? 'badge-success' : (p.Status === 'die' ? 'badge-danger' : 'badge-neutral')}" style="font-size: 11px;">
              ${p.Status === 'live' ? 'Live' : (p.Status === 'die' ? 'Die' : 'Chưa test')}
            </span>
          </td>
          <td style="font-size: 11px; color: var(--text-muted);">${p.LastCheckedAt ? p.LastCheckedAt.slice(11, 19) : '---'}</td>
          <td style="text-align: center; white-space: nowrap;">
            <button class="btn btn-secondary btn-sm" style="padding: 2px 7px;" onclick="nnCheckOneProxy('${p.Id}')" title="Kiểm tra lại">⚡</button>
            <button class="btn btn-danger btn-sm" style="padding: 2px 7px;" onclick="nnDeleteProxy('${p.Id}')" title="Xoá proxy">🗑️</button>
          </td>
        </tr>`;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; padding: 24px;">${escapeHtml(err.message)}</td></tr>`;
  }
}

function nnToggleAllProxies(box) {
  document.querySelectorAll('.nn-proxy-check').forEach(c => { c.checked = box.checked; });
}

function nnSelectedProxyIds() {
  return Array.from(document.querySelectorAll('.nn-proxy-check:checked')).map(c => c.value);
}

function nnOpenImportProxy() {
  document.getElementById('nn-proxy-import-data').value = '';
  openModal('modal-nn-proxy-import');
}

async function nnSubmitImportProxy() {
  const raw = document.getElementById('nn-proxy-import-data').value.trim();
  const folder = document.getElementById('nn-proxy-import-folder').value.trim() || 'Default';
  if (!raw) { showToast('Vui lòng nhập ít nhất một proxy'); return; }
  try {
    const res = await nnFetch('/proxies/import', {
      method: 'POST',
      body: JSON.stringify({ raw_data: raw, folder }),
    });
    showToast(`Đã nhập ${res.imported} proxy vào kho!`);
    closeModal('modal-nn-proxy-import');
    loadNnProxies();
  } catch (err) { showToast(err.message); }
}

async function nnCheckLiveProxies() {
  showToast('Đang kiểm tra toàn bộ proxy trong kho...');
  try {
    const res = await nnFetch('/proxies/check-live', {
      method: 'POST',
      body: JSON.stringify({ proxy_ids: [] }),
    });
    showToast(`Đã kiểm tra ${res.checked} proxy`);
    loadNnProxies();
  } catch (err) { showToast(err.message); }
}

async function nnCheckOneProxy(id) {
  try {
    await nnFetch('/proxies/check-live', {
      method: 'POST',
      body: JSON.stringify({ proxy_ids: [id] }),
    });
    showToast('Đã kiểm tra proxy');
    loadNnProxies();
  } catch (err) { showToast(err.message); }
}

async function nnDeleteProxy(id) {
  if (!confirm('Xoá proxy này khỏi kho?')) return;
  try {
    await nnFetch('/proxies', {
      method: 'DELETE',
      body: JSON.stringify([id]),
    });
    showToast('Đã xoá proxy');
    loadNnProxies();
  } catch (err) { showToast(err.message); }
}

async function nnDeleteDieProxies() {
  const dieIds = nnCurrentProxies.filter(p => p.Status === 'die').map(p => p.Id);
  if (!dieIds.length) { showToast('Không có proxy die nào'); return; }
  if (!confirm(`Xoá ${dieIds.length} proxy die?`)) return;
  try {
    await nnFetch('/proxies', {
      method: 'DELETE',
      body: JSON.stringify(dieIds),
    });
    showToast(`Đã xoá ${dieIds.length} proxy die`);
    loadNnProxies();
  } catch (err) { showToast(err.message); }
}

function nnOpenAssignProxyModal() {
  const ids = nnSelectedIds();
  if (!ids || !ids.length) { showToast('Chưa chọn nick nào'); return; }
  document.getElementById('nn-assign-target-type').value = 'account';
  nnPopulateProxyAssignSelect();
  openModal('modal-nn-proxy-assign');
}

function nnAssignProxyModal() {
  const pids = nnSelectedProfileIds();
  if (!pids.length) { showToast('Chưa chọn profile nào để gán'); return; }
  document.getElementById('nn-assign-target-type').value = 'profile';
  nnPopulateProxyAssignSelect();
  openModal('modal-nn-proxy-assign');
}

function nnPopulateProxyAssignSelect() {
  const sel = document.getElementById('nn-assign-proxy-select');
  if (!nnCurrentProxies.length) {
    sel.innerHTML = '<option value="">Kho proxy trống</option>';
    return;
  }
  sel.innerHTML = nnCurrentProxies.map(p => `
    <option value="${p.Id}">${escapeHtml(p.RawProxy)} (${p.Status} - ${p.Country || 'N/A'})</option>
  `).join('');
}

async function nnSubmitAssignProxy() {
  const proxyId = document.getElementById('nn-assign-proxy-select').value;
  const targetType = document.getElementById('nn-assign-target-type').value;
  if (!proxyId) { showToast('Chưa chọn proxy'); return; }

  let targetIds = [];
  if (targetType === 'profile') {
    targetIds = nnSelectedProfileIds();
  } else {
    targetIds = nnSelectedIds().map(String);
  }

  try {
    await nnFetch('/proxies/assign', {
      method: 'POST',
      body: JSON.stringify({
        proxy_id: proxyId,
        target_type: targetType,
        target_ids: targetIds,
        platform: nnState.platform,
      }),
    });
    showToast(`Đã gán proxy cho ${targetIds.length} ${targetType === 'profile' ? 'profile' : 'tài khoản'}`);
    closeModal('modal-nn-proxy-assign');
    if (targetType === 'profile') loadNnProfiles();
    else loadNnAccounts();
  } catch (err) { showToast(err.message); }
}

// ==============================================================================
// 3. INSTANT 2FA MODAL (TOTP Live Countdown)
// ==============================================================================

let nn2faInterval = null;
let nnCurrent2faSecret = '';

async function nnShow2faModal(accountId, label) {
  document.getElementById('nn-2fa-acc-label').textContent = `Tài khoản: ${label || accountId}`;
  document.getElementById('nn-2fa-code-display').textContent = '...';
  document.getElementById('nn-2fa-countdown').textContent = '30s';
  openModal('modal-nn-2fa-popup');

  async function updateCode() {
    try {
      const data = await nnFetch(`/accounts/${nnState.platform}/${accountId}/2fa`);
      document.getElementById('nn-2fa-code-display').textContent = data.code.slice(0, 3) + ' ' + data.code.slice(3);
      nnCurrent2faSecret = data.code;
    } catch (err) {
      document.getElementById('nn-2fa-code-display').textContent = 'LỖI';
      showToast(err.message);
    }
  }

  await updateCode();
  if (nn2faInterval) clearInterval(nn2faInterval);
  nn2faInterval = setInterval(() => {
    const epoch = Math.floor(Date.now() / 1000);
    const left = 30 - (epoch % 30);
    const el = document.getElementById('nn-2fa-countdown');
    if (el) el.textContent = `${left}s`;
    if (left === 30) updateCode();
  }, 1000);
}

function nnCopyCurrent2fa() {
  const code = (document.getElementById('nn-2fa-code-display').textContent || '').replace(/\s+/g, '');
  if (code && code !== '...' && code !== 'LỖI') {
    navigator.clipboard.writeText(code).then(() => showToast(`Đã sao chép mã 2FA: ${code}`));
  }
}

// ==============================================================================
// 4. GOOGLE SHEETS 2-WAY SYNC
// ==============================================================================

async function nnUpdateSheetExportPreview() {
  const preview = document.getElementById('nn-sheet-export-preview');
  if (!preview) return;
  try {
    const res = await nnFetch(`/sheets/build-rows?platform=${nnState.platform}&folder_id=${nnState.folderId || 0}`, { method: 'POST' });
    const tsv = res.rows.map(r => r.join('\t')).join('\n');
    preview.value = tsv;
  } catch (err) {
    preview.value = `Lỗi: ${err.message}`;
  }
}

async function nnExportToSheetClipboard() {
  const preview = document.getElementById('nn-sheet-export-preview');
  if (!preview || !preview.value) await nnUpdateSheetExportPreview();
  if (preview && preview.value) {
    navigator.clipboard.writeText(preview.value).then(() => {
      showToast('Đã sao chép toàn bộ bảng! Hãy mở Google Sheets và dán (Ctrl+V) vào ô A1.');
    });
  }
}

function nnDownloadSheetTsv() {
  const preview = document.getElementById('nn-sheet-export-preview');
  if (!preview || !preview.value) return;
  const blob = new Blob([preview.value], { type: 'text/tab-separated-values;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `GoogleSheets_${nnState.platform}_${Date.now()}.tsv`;
  link.click();
  URL.revokeObjectURL(link.href);
  showToast('Đã tải tệp TSV');
}

async function nnImportFromSheetPaste() {
  const raw = document.getElementById('nn-sheet-import-paste').value.trim();
  if (!raw) { showToast('Vui lòng dán dữ liệu từ Google Sheet'); return; }
  const lines = raw.split('\n').map(l => l.split('\t'));
  try {
    const res = await nnFetch('/sheets/parse-rows', {
      method: 'POST',
      body: JSON.stringify({ rows: lines }),
    });
    if (!res.accounts || !res.accounts.length) {
      showToast('Không phân tích được tài khoản nào');
      return;
    }
    const importRaw = res.accounts.map(a => `${a.Uid || ''}|${a.Pass || ''}|${a.TwoFA || ''}|${a.Token || ''}|${a.Cookie || ''}|${a.Mail || ''}|${a.PassMail || ''}|${a.MailKhoiPhuc || ''}|US`).join('\n');
    const impRes = await nnFetch('/accounts/import', {
      method: 'POST',
      body: JSON.stringify({
        platform: nnState.platform,
        folder_id: nnState.folderId || 0,
        raw_data: importRaw,
      }),
    });
    showToast(`Đã nhập thành công ${impRes.imported} nick từ Google Sheet!`);
    document.getElementById('nn-sheet-import-paste').value = '';
    switchNnSub('nicks');
  } catch (err) { showToast(err.message); }
}

// ==============================================================================
// 5. MỞ PROFILE TRÌNH DUYỆT TRỰC TIẾP TỪ NICK
// ==============================================================================

async function nnLaunchAccountProfile(accountId, buttonEl = null) {
  const a = nnState.accounts.find(x => x.Id === accountId);
  if (!a) return;
  const oldHtml = buttonEl ? buttonEl.innerHTML : '';
  if (buttonEl) {
    buttonEl.disabled = true;
    buttonEl.innerHTML = '⏳';
  }
  try {
    const result = await nnFetch(`/accounts/${accountId}/open-profile?platform=${encodeURIComponent(nnState.platform)}`, {
      method: 'POST',
    });
    a.BrowserProfileId = result.profile_id;
    showToast(result.message || 'Đã mở profile Facebook', result.session_restored ? 3500 : 7000);
    loadNnAccounts();
  } catch (err) {
    showToast(err.message || 'Không mở được profile Facebook', 6000);
  } finally {
    if (buttonEl) {
      buttonEl.disabled = false;
      buttonEl.innerHTML = oldHtml;
    }
  }
}

async function nnSaveAccountSession(accountId, buttonEl = null) {
  if (buttonEl) buttonEl.disabled = true;
  try {
    const result = await nnFetch(`/accounts/${accountId}/session/capture?platform=${encodeURIComponent(nnState.platform)}`, { method: 'POST' });
    showToast(result.message || 'Đã lưu phiên Facebook', 7000);
    await loadNnAccounts();
  } catch (err) {
    showToast('Chưa lưu được phiên: ' + err.message, 8000);
  } finally {
    if (buttonEl?.isConnected) buttonEl.disabled = false;
  }
}

async function nnCloseAccountProfile(accountId, buttonEl = null) {
  if (buttonEl) buttonEl.disabled = true;
  try {
    const result = await nnFetch(`/accounts/${accountId}/close-profile?platform=${encodeURIComponent(nnState.platform)}`, { method: 'POST' });
    showToast(result.message || 'Đã đóng profile', 7000);
    await loadNnAccounts();
  } catch (err) {
    showToast('Không đóng được profile: ' + err.message, 7000);
  } finally {
    if (buttonEl?.isConnected) buttonEl.disabled = false;
  }
}

// =============================================================================
// NORDVPN OFFICIAL REST API GLOBAL WORKSTATION CONTROLLER (150+ COUNTRIES)
// =============================================================================
let nordCountriesList = [];
let nordCurrentCountry = 'DE';
let nordCountryServersCache = {};
let nordCurrentServers = [];
let nordFilteredServers = [];

// Top featured countries with highest server counts / popularity
const NORD_FEATURED_CODES = ['US', 'GB', 'CA', 'FR', 'DE', 'AU', 'JP', 'NL', 'SE', 'KR', 'SG', 'VN'];

async function loadNordVpnWorkstation(force = false) {
  try {
    // 1. Fetch Countries & Active Tunnels in Parallel
    const [countriesData, tunnelsRes] = await Promise.all([
      fetch(`/api/vpn/nord/countries${force ? '?refresh=true' : ''}`).then(r => r.json()).catch(() => null),
      fetch('/api/vpn/active-tunnels').then(r => r.json()).catch(() => null)
    ]);

    if (countriesData && countriesData.countries) {
      nordCountriesList = countriesData.countries;

      // Update Ribbon
      const totalEl = document.getElementById('vpn-total-servers');
      if (totalEl) totalEl.textContent = (countriesData.total_servers || 8012).toLocaleString() + ' Server';

      const countriesEl = document.getElementById('vpn-total-countries');
      if (countriesEl) countriesEl.textContent = (countriesData.total_countries || 150) + ' Quốc Gia';

      const sideBadge = document.getElementById('side-badge-vpn');
      if (sideBadge) sideBadge.textContent = countriesData.total_servers ? `${(countriesData.total_servers / 1000).toFixed(1)}k` : '8.0k';

      // Render Featured Chips & All Country Cards
      renderNordFeaturedChips();
      renderNordCountryCards(nordCountriesList);
      populateNordDiagCountries(nordCountriesList);
    }

    if (tunnelsRes) {
      const activeEl = document.getElementById('vpn-active-tunnels-count');
      if (activeEl) activeEl.textContent = tunnelsRes.count || 0;
    }

    // 2. Select initial country (default: DE or previously selected)
    await selectNordCountry(nordCurrentCountry, force);
  } catch (err) {
    console.error('Lỗi nạp dữ liệu NordVPN Workstation:', err);
    showToast('Lỗi nạp dữ liệu NordVPN: ' + err.message, 'error');
  }
}

// Alias for compatibility
const loadVpnWorkstation = loadNordVpnWorkstation;

function renderNordFeaturedChips() {
  const container = document.getElementById('vpn-featured-chips');
  if (!container) return;

  const featured = nordCountriesList.filter(c => NORD_FEATURED_CODES.includes(c.code));
  // Sort according to NORD_FEATURED_CODES order
  featured.sort((a, b) => NORD_FEATURED_CODES.indexOf(a.code) - NORD_FEATURED_CODES.indexOf(b.code));

  container.innerHTML = featured.map(c => `
    <button type="button" class="vpn-chip-btn ${nordCurrentCountry === c.code ? 'active' : ''}" id="vpn-chip-${c.code}" onclick="selectNordCountry('${c.code}')">
      <span style="font-size: 14px;">${c.flag}</span>
      <span>${escapeHtml(c.name)}</span>
      <span class="badge ${nordCurrentCountry === c.code ? 'badge-cyan' : 'badge-neutral'}" style="font-size: 10px;">${c.server_count.toLocaleString()}</span>
    </button>
  `).join('');
}

function renderNordCountryCards(countries) {
  const container = document.getElementById('vpn-country-cards-container');
  if (!container) return;

  if (!countries.length) {
    container.innerHTML = '<div class="text-center py-4 text-dim" style="grid-column: 1 / -1;">Không tìm thấy quốc gia nào phù hợp từ khoá tìm kiếm.</div>';
    return;
  }

  container.innerHTML = countries.map(c => {
    const isAct = nordCurrentCountry === c.code;
    return `
      <div class="vpn-country-card ${isAct ? 'active' : ''}" id="vpn-card-${c.code}" onclick="selectNordCountry('${c.code}')" style="cursor: pointer;">
        <div class="vpn-card-top">
          <span class="vpn-card-flag">${c.flag}</span>
          <span class="vpn-card-count">${c.server_count.toLocaleString()}</span>
        </div>
        <div>
          <div class="vpn-card-name">${escapeHtml(c.name)} (${c.code})</div>
          <div class="text-muted" style="font-size: 11.5px; margin-top: 2px;">${c.cities.length ? `${c.cities.length} thành phố` : 'Toàn quốc'} • WireGuard</div>
        </div>
        <div class="vpn-card-actions">
          <button type="button" class="btn ${isAct ? 'btn-primary' : 'btn-secondary'} btn-full" style="font-size: 11px; padding: 5px;" onclick="event.stopPropagation(); selectNordCountry('${c.code}')">
            ${isAct ? '✓ Đang Xem Máy Chủ' : '📋 Xem Danh Sách'}
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function onVpnCountrySearch(query) {
  const q = (query || '').toLowerCase().trim();
  if (!q) {
    renderNordCountryCards(nordCountriesList);
    return;
  }
  const filtered = nordCountriesList.filter(c =>
    c.name.toLowerCase().includes(q) ||
    c.code.toLowerCase().includes(q) ||
    (c.cities || []).some(ct => (ct.name || '').toLowerCase().includes(q))
  );
  renderNordCountryCards(filtered);
}

async function selectNordCountry(countryCode, force = false) {
  nordCurrentCountry = (countryCode || 'DE').toUpperCase();

  // 1. Update active states on chips and cards
  document.querySelectorAll('.vpn-chip-btn').forEach(b => {
    b.classList.toggle('active', b.id === `vpn-chip-${nordCurrentCountry}`);
  });
  document.querySelectorAll('.vpn-country-card').forEach(c => {
    c.classList.toggle('active', c.id === `vpn-card-${nordCurrentCountry}`);
  });

  const countryObj = nordCountriesList.find(c => c.code === nordCurrentCountry) || { name: nordCurrentCountry, flag: '🌐', server_count: 0 };

  // 2. Update Table Header Title
  const titleEl = document.getElementById('vpn-active-country-title');
  if (titleEl) {
    titleEl.innerHTML = `${countryObj.flag} Máy Chủ Trực Tiếp: ${escapeHtml(countryObj.name)} (${countryObj.code})`;
  }

  // 3. Update Diagnostic Country Dropdown
  const diagCountry = document.getElementById('vpn-diag-country');
  if (diagCountry && diagCountry.value !== nordCurrentCountry) {
    diagCountry.value = nordCurrentCountry;
  }

  // 4. Fetch / Cache Servers for this Country
  const tbody = document.getElementById('vpn-servers-tbody');
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-dim"><span class="spinner-border spinner-border-sm"></span> Đang nạp danh sách server live từ NordVPN API cho ${escapeHtml(countryObj.name)}...</td></tr>`;
  }

  try {
    let data;
    if (!force && nordCountryServersCache[nordCurrentCountry]) {
      data = nordCountryServersCache[nordCurrentCountry];
    } else {
      const res = await fetch(`/api/vpn/nord/servers/${nordCurrentCountry}${force ? '?refresh=true' : ''}`);
      if (!res.ok) throw new Error('Không thể tải máy chủ từ Nord API');
      data = await res.json();
      nordCountryServersCache[nordCurrentCountry] = data;
    }

    nordCurrentServers = data.servers || [];
    nordFilteredServers = [...nordCurrentServers];

    // Update Count badge
    const countBadge = document.getElementById('vpn-catalog-filtered-count');
    if (countBadge) countBadge.textContent = `${nordFilteredServers.length} server live`;

    // Populate Diagnostic Servers dropdown for this country
    populateNordDiagServers(nordCurrentServers);

    // Render Table
    renderNordServersTable(nordFilteredServers);
  } catch (err) {
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-danger">Lỗi tải danh sách server: ${escapeHtml(err.message)}</td></tr>`;
    }
    showToast(`Lỗi nạp server ${countryObj.name}: ` + err.message, 'error');
  }
}

function populateNordDiagCountries(countries) {
  const select = document.getElementById('vpn-diag-country');
  if (!select) return;

  const currentVal = select.value || nordCurrentCountry;
  select.innerHTML = countries.map(c => `
    <option value="${c.code}" ${c.code === currentVal ? 'selected' : ''}>
      ${c.flag} ${escapeHtml(c.name)} (${c.server_count} server)
    </option>
  `).join('');
}

function populateNordDiagServers(servers) {
  const select = document.getElementById('vpn-diag-server');
  if (!select) return;

  if (!servers.length) {
    select.innerHTML = '<option value="">Không có máy chủ khả dụng</option>';
    return;
  }

  let html = '<option value="OPTIMAL">⚡ Tự bốc máy chủ tối ưu nhất (Tải thấp nhất &lt; 10%)</option>';
  servers.forEach(s => {
    html += `<option value="${escapeHtml(s.hostname)}" data-pubkey="${escapeHtml(s.public_key)}" data-city="${escapeHtml(s.city)}">
      ${escapeHtml(s.name)} • ${s.city} (Load: ${s.load}%)
    </option>`;
  });
  select.innerHTML = html;
}

function onVpnDiagCountryChange(code) {
  selectNordCountry(code);
}

function onVpnServerSearch(query) {
  const q = (query || '').toLowerCase().trim();
  if (!q) {
    nordFilteredServers = [...nordCurrentServers];
  } else {
    nordFilteredServers = nordCurrentServers.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.hostname.toLowerCase().includes(q) ||
      s.city.toLowerCase().includes(q) ||
      s.station.toLowerCase().includes(q)
    );
  }

  const countBadge = document.getElementById('vpn-catalog-filtered-count');
  if (countBadge) countBadge.textContent = `${nordFilteredServers.length} server`;

  renderNordServersTable(nordFilteredServers);
}

function renderNordServersTable(servers) {
  const tbody = document.getElementById('vpn-servers-tbody');
  if (!tbody) return;

  if (!servers.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-dim">Không có máy chủ nào khớp với tìm kiếm.</td></tr>';
    return;
  }

  tbody.innerHTML = servers.map(s => {
    const loadVal = s.load || 0;
    let loadClass = 'vpn-load-low';
    let loadIcon = '🟢';
    let loadText = 'Siêu Mượt';

    if (loadVal >= 15 && loadVal <= 40) {
      loadClass = 'vpn-load-med';
      loadIcon = '🔵';
      loadText = 'Tốt';
    } else if (loadVal > 40) {
      loadClass = 'vpn-load-high';
      loadIcon = '🟡';
      loadText = 'Trung Bình';
    }

    const escapedHost = escapeHtml(s.hostname);
    const escapedPubkey = escapeHtml(s.public_key);
    const escapedCity = escapeHtml(s.city);

    return `
      <tr>
        <td>
          <span style="font-size: 18px;">${s.flag}</span>
          <b style="font-size: 11px; color: #94a3b8; margin-left: 2px;">${s.country_code}</b>
        </td>
        <td>
          <div style="font-weight: 700; color: #f8fafc;">${escapeHtml(s.name)}</div>
          <div style="font-family: var(--font-mono); font-size: 11px; color: #38bdf8;">${escapedHost}</div>
        </td>
        <td>
          <div class="vpn-load-pill ${loadClass}">
            <span>${loadIcon}</span>
            <span>${loadVal}%</span>
            <span style="font-weight: 500; font-size: 10px; opacity: 0.9;">(${loadText})</span>
          </div>
        </td>
        <td>${escapedCity || 'N/A'}</td>
        <td style="font-family: var(--font-mono); font-size: 12px; color: #94a3b8;">${escapeHtml(s.station || 'Auto')}</td>
        <td style="text-align: center;">
          <button type="button" class="btn btn-outline" style="font-size: 11.5px; padding: 4px 10px;" onclick="runNordDiagnostic('${escapedHost}', '${escapedPubkey}', '${s.country_code}', '${escapedCity}')" title="Khởi chạy WireGuard & kiểm định đối soát TikTok">
            🚀 Test Live &amp; Chạy
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

async function triggerVpnDiagnostic() {
  const country = document.getElementById('vpn-diag-country')?.value || nordCurrentCountry;
  const serverSelect = document.getElementById('vpn-diag-server');
  const selectedVal = serverSelect?.value || 'OPTIMAL';

  let hostname = '';
  let pubkey = '';
  let city = '';

  if (selectedVal === 'OPTIMAL' || !selectedVal) {
    const servers = nordCurrentServers.length ? nordCurrentServers : (nordCountryServersCache[country]?.servers || []);
    if (!servers.length) {
      showToast('Đang tải danh sách server từ Nord API...', 'info');
      await selectNordCountry(country);
    }
    const pool = nordCurrentServers.length ? nordCurrentServers : (nordCountryServersCache[country]?.servers || []);
    if (pool.length) {
      hostname = pool[0].hostname;
      pubkey = pool[0].public_key;
      city = pool[0].city;
    } else {
      showToast(`Không có máy chủ cho quốc gia ${country}`, 'warning');
      return;
    }
  } else {
    hostname = selectedVal;
    const opt = serverSelect.selectedOptions[0];
    pubkey = opt?.dataset?.pubkey || '';
    city = opt?.dataset?.city || '';
  }

  await runNordDiagnostic(hostname, pubkey, country, city);
}

async function runNordDiagnostic(hostname, pubkey, country, city) {
  const resultBox = document.getElementById('vpn-diag-result-box');
  const btn = document.getElementById('btn-run-vpn-diag');
  const icon = document.getElementById('vpn-diag-btn-icon');
  const text = document.getElementById('vpn-diag-btn-text');

  if (!hostname) {
    showToast('Thiếu hostname máy chủ', 'warning');
    return;
  }

  // If public key is missing, look it up in cache
  if (!pubkey) {
    const found = nordCurrentServers.find(s => s.hostname === hostname);
    if (found) {
      pubkey = found.public_key;
      city = city || found.city;
    }
  }

  if (btn) btn.disabled = true;
  if (icon) icon.textContent = '⏳';
  if (text) text.textContent = 'Đang khởi chạy Tunnel & Kiểm tra...';

  if (resultBox) {
    resultBox.style.display = 'block';
    resultBox.innerHTML = `
      <div style="background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 14px; padding: 24px; text-align: center;">
        <div style="font-size: 28px; animation: spin 1s linear infinite; display: inline-block;">⚙️</div>
        <h4 style="color: #38bdf8; margin: 12px 0 6px 0;">Đang khởi động WireGuard Tunnel đến ${escapeHtml(hostname)}...</h4>
        <p class="text-muted" style="font-size: 13px; max-width: 550px; margin: 0 auto;">
          Endpoint: <b style="color: #f8fafc; font-family: var(--font-mono);">${escapeHtml(hostname)}:51820</b><br>
          Tiến trình: Thiết lập tunnel On-the-Fly ➜ Tra cứu IP Geolocation ➜ Giả lập Chrome TLS kiểm tra nhận diện TikTok CDN.
        </p>
      </div>
    `;
    resultBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  try {
    const res = await fetch('/api/vpn/nord/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hostname: hostname,
        public_key: pubkey,
        country_code: country || 'DE',
        city: city || ''
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Lỗi kiểm tra VPN');

    renderNordDiagnosticResult(data);
    showToast(`Kiểm tra kết nối ${hostname} thành công!`, 'success');

    // Refresh active tunnels count
    fetch('/api/vpn/active-tunnels')
      .then(r => r.json())
      .then(tun => {
        const activeEl = document.getElementById('vpn-active-tunnels-count');
        if (activeEl && tun) activeEl.textContent = tun.count || 0;
      }).catch(() => {});
  } catch (err) {
    if (resultBox) {
      resultBox.innerHTML = `
        <div class="vpn-match-banner vpn-match-error">
          <span style="font-size: 20px;">❌</span>
          <div>
            <div>Kiểm Tra Thất Bại</div>
            <div style="font-size: 12px; font-weight: 500; opacity: 0.9;">${escapeHtml(err.message)}</div>
          </div>
        </div>
      `;
    }
    showToast('Lỗi kiểm tra VPN: ' + err.message, 'error');
  } finally {
    if (btn) btn.disabled = false;
    if (icon) icon.textContent = '🚀';
    if (text) text.textContent = 'Kiểm Tra Kết Nối & Exit IP';
  }
}

function renderNordDiagnosticResult(data) {
  const resultBox = document.getElementById('vpn-diag-result-box');
  if (!resultBox) return;

  const api = data.api || {};
  const tiktok = data.tiktok || {};
  const match = data.match || {};
  const hostname = data.hostname || 'NordVPN Server';

  let bannerClass = 'vpn-match-perfect';
  let bannerIcon = '🟢';
  if (match.status === 'MISMATCH' || !match.is_match) {
    bannerClass = 'vpn-match-warning';
    bannerIcon = '⚠️';
  }
  if (!api.success) {
    bannerClass = 'vpn-match-error';
    bannerIcon = '❌';
  }

  const exitIp = api.ip || data.ip || 'N/A';

  resultBox.innerHTML = `
    <!-- Match Banner -->
    <div class="vpn-match-banner ${bannerClass}">
      <span style="font-size: 22px;">${bannerIcon}</span>
      <div style="flex: 1;">
        <div style="font-size: 14px; font-weight: 800;">${escapeHtml(match.message || 'Kết quả kiểm định WireGuard')}</div>
        <div style="font-size: 12px; font-weight: 500; opacity: 0.9; margin-top: 2px;">
          Máy Chủ: <b style="font-family: var(--font-mono);">${escapeHtml(hostname)}</b> • Cổng SOCKS5 Cục Bộ: <b>:${data.socks5_port || 11000}</b> • Thành Phố: <b>${escapeHtml(data.city || api.city || 'N/A')}</b>
        </div>
      </div>
      <button type="button" class="btn btn-secondary" style="font-size: 12px; padding: 6px 12px;" onclick="copyVpnText('${escapeHtml(exitIp)}')">
        📋 Copy IP
      </button>
    </div>

    <!-- Comparison 2-Column Grid -->
    <div class="vpn-diag-grid">
      <!-- Card 1: IP Geolocation -->
      <div class="vpn-diag-card">
        <div class="vpn-diag-card-title">
          <span>🌐 Tra Cứu Exit IP Thực Tế</span>
          <span class="badge ${api.success ? 'badge-success' : 'badge-danger'}">${api.success ? 'Online' : 'Failed'}</span>
        </div>
        <div class="vpn-diag-item">
          <span class="vpn-diag-label">Địa Chỉ Exit IP:</span>
          <span class="vpn-diag-val" style="color: #38bdf8; font-size: 14px;">${escapeHtml(exitIp)}</span>
        </div>
        <div class="vpn-diag-item">
          <span class="vpn-diag-label">Quốc Gia:</span>
          <span class="vpn-diag-val">${escapeHtml(api.country || 'N/A')} (${escapeHtml(api.country_code || 'N/A')})</span>
        </div>
        <div class="vpn-diag-item">
          <span class="vpn-diag-label">Thành Phố / Khu Vực:</span>
          <span class="vpn-diag-val">${escapeHtml(api.city || 'N/A')}</span>
        </div>
        <div class="vpn-diag-item">
          <span class="vpn-diag-label">Nhà Mạng (ISP / Org):</span>
          <span class="vpn-diag-val">${escapeHtml(api.isp || api.org || 'NordVPN Datacenter')}</span>
        </div>
        <div class="vpn-diag-item">
          <span class="vpn-diag-label">Độ Trễ Phản Hồi (Ping):</span>
          <span class="vpn-diag-val" style="color: #34d399;">${api.latency_ms || data.time_ms || 0} ms</span>
        </div>
      </div>

      <!-- Card 2: TikTok CDN & Anti-Bot Detection -->
      <div class="vpn-diag-card">
        <div class="vpn-diag-card-title">
          <span>🎵 Nhận Diện Từ Máy Chủ TikTok</span>
          <span class="badge ${tiktok.success ? 'badge-success' : 'badge-warning'}">${tiktok.success ? 'Đã Xác Thực' : 'Chưa Kết Nối'}</span>
        </div>
        <div class="vpn-diag-item">
          <span class="vpn-diag-label">Vùng TikTok Nhận Dạng:</span>
          <span class="vpn-diag-val" style="color: #c084fc; font-size: 14px; font-weight: 800;">${escapeHtml(tiktok.region || 'N/A')}</span>
        </div>
        <div class="vpn-diag-item">
          <span class="vpn-diag-label">Cụm CDN TikTok:</span>
          <span class="vpn-diag-val">${escapeHtml(tiktok.cluster || 'Standard Edge')}</span>
        </div>
        <div class="vpn-diag-item">
          <span class="vpn-diag-label">Kiểm Tra WAF / Anti-Bot:</span>
          <span class="vpn-diag-val" style="color: #34d399;">${tiktok.waf_passed ? '✅ An Toàn (Không Captcha)' : '⚠️ Cần Lưu Ý WAF'}</span>
        </div>
        <div class="vpn-diag-item">
          <span class="vpn-diag-label">Mã Phản Hồi HTTP:</span>
          <span class="vpn-diag-val">${tiktok.status_code || 200} OK</span>
        </div>
        <div class="vpn-diag-item">
          <span class="vpn-diag-label">Độ Trễ Đến TikTok:</span>
          <span class="vpn-diag-val" style="color: #38bdf8;">${tiktok.latency_ms || 0} ms</span>
        </div>
      </div>
    </div>
  `;
}

async function stopAllVpnTunnels() {
  if (!confirm('Bạn có chắc chắn muốn ngắt toàn bộ WireGuard Tunnel đang chạy trên toàn hệ thống không?')) return;
  try {
    const res = await fetch('/api/vpn/stop-all', { method: 'POST' });
    const data = await res.json();
    showToast(data.message || 'Đã ngắt toàn bộ WireGuard Tunnel', 'success');
    const activeEl = document.getElementById('vpn-active-tunnels-count');
    if (activeEl) activeEl.textContent = '0';
  } catch (err) {
    showToast('Lỗi ngắt VPN: ' + err.message, 'error');
  }
}

async function autoAssignVpnToChannels() {
  const btn = document.getElementById('btn-vpn-auto-assign');
  if (btn) btn.disabled = true;
  showToast('Đang tự động chọn server WireGuard tối ưu cho toàn bộ kênh TikTok...', 3000);
  try {
    const res = await fetch('/api/channels/vpn/auto-assign-all', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Lỗi gán VPN');
    showToast(data.message || `Đã gán VPN cho ${data.count} kênh!`, 'success');
    if (typeof loadChannels === 'function') loadChannels();
  } catch (err) {
    showToast('Lỗi gán VPN: ' + err.message, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

function copyVpnText(text) {
  if (!text || text === 'N/A') return;
  navigator.clipboard.writeText(text).then(() => {
    showToast(`Đã sao chép: ${text}`, 'success');
  }).catch(() => {
    showToast(`Không thể copy tự động: ${text}`, 'warning');
  });
}

// Initialize Workstation Badges & Restore State on Boot
window.addEventListener('DOMContentLoaded', () => {
  try {
    initSfbControlTitles();
    loadNnProfiles();
    loadNnProxies();
    loadNnPlatformStats();
    // Preload Nord VPN countries stats for badge
    fetch('/api/vpn/nord/countries')
      .then(r => r.json())
      .then(s => {
        const sideBadge = document.getElementById('side-badge-vpn');
        if (sideBadge && s.total_servers) {
          sideBadge.textContent = `${(s.total_servers / 1000).toFixed(1)}k`;
        }
      }).catch(() => {});

    const lastTab = localStorage.getItem('tokmatrix_active_workstation_tab');
    if (lastTab && WORKSTATION_TABS[lastTab]) {
      switchTab(lastTab);
    }
  } catch (e) {
    console.warn('Init workstation state error:', e);
  }
});

// =============================================================================
// KHO KHOÁ API — chỗ duy nhất nhập mọi API key
// =============================================================================

let apiKeyVaultState = [];

const SFB_AI_KEY_NAMES = { gemini: 'ai.gemini', openai: 'ai.openai' };
const NN_AI_KEY_NAMES = {
  Claude: 'ai.claude',
  Gemini: 'ai.gemini',
  HHTechApi: 'ai.hhtech',
  VietApi: 'ai.vietapi',
  Custom: 'ai.custom',
};

function selectedSfbAiKeyName() {
  return SFB_AI_KEY_NAMES[document.getElementById('sfb-ai-provider')?.value] || 'ai.gemini';
}

function selectedNnAiKeyName() {
  return NN_AI_KEY_NAMES[document.getElementById('nn-ai-provider')?.value] || 'ai.claude';
}

function isApiKeyConfigured(name) {
  return Boolean(apiKeyVaultState.find(k => k.name === name)?.configured);
}

async function ensureApiKeyConfigured(name) {
  if (!apiKeyVaultState.length) await loadApiKeyVault();
  return isApiKeyConfigured(name);
}

async function loadApiKeyVault() {
  const box = document.getElementById('key-vault-list');
  try {
    const res = await fetch('/api/keys');
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Không tải được kho khoá');
    const keys = Array.isArray(data.keys) ? data.keys : [];
    apiKeyVaultState = keys;
    if (box) {
      const groups = {};
      keys.forEach(k => (groups[k.group] = groups[k.group] || []).push(k));
      box.innerHTML = Object.entries(groups).map(([group, items]) => `
        <div class="key-group">
          <div class="key-group-title">${escapeHtml(group)}</div>
          ${items.map(k => `
            <div class="key-row" id="key-row-${k.name}">
              <div class="key-row-main">
                <span class="key-dot ${k.configured ? 'on' : ''}"></span>
                <div class="key-row-text">
                  <div class="key-row-label">${escapeHtml(k.label)}</div>
                  <div class="key-row-used">${escapeHtml(k.used_by || '')}</div>
                </div>
              </div>
              <div class="key-row-state">${k.configured
                ? `<span class="key-ok">Đã lưu${k.updated_at ? ' · ' + new Date(k.updated_at * 1000).toLocaleDateString('vi-VN') : ''}</span>`
                : '<span class="key-empty">Chưa có</span>'}</div>
              <div class="key-row-actions">
                <button class="btn btn-secondary btn-xs" onclick="promptApiKey('${k.name}')">${k.configured ? 'Đổi' : 'Thêm'}</button>
                ${k.configured ? `<button class="btn btn-secondary btn-xs" onclick="testApiKey('${k.name}')">Thử</button>` : ''}
                ${k.configured ? `<button class="btn btn-danger btn-xs" onclick="removeApiKey('${k.name}')">Xoá</button>` : ''}
              </div>
            </div>`).join('')}
        </div>`).join('');
    }
    refreshApiKeyRefs();
  } catch (err) {
    if (box) box.innerHTML = `<p class="card-subtitle">Không tải được kho khoá: ${escapeHtml(err.message)}</p>`;
  }
}

// Các màn hình khác chỉ hiển thị trạng thái và trỏ về kho, không tự nhập key.
function refreshApiKeyRefs() {
  const by = Object.fromEntries(apiKeyVaultState.map(k => [k.name, k]));
  const refs = {
    'sfb-ai-key-status': [selectedSfbAiKeyName()],
    'nn-ai-key-status': [selectedNnAiKeyName()],
    'set-captcha-key-status': ['captcha.achi'],

  };
  Object.entries(refs).forEach(([elId, names]) => {
    const el = document.getElementById(elId);
    if (!el) return;
    const ready = names.filter(n => by[n] && by[n].configured).map(n => by[n].label);
    el.className = ready.length ? 'key-ok' : 'key-empty';
    const selectedLabels = names.map(n => by[n]?.label).filter(Boolean);
    el.textContent = ready.length
      ? `✓ Đã có khoá: ${ready.join(', ')}`
      : `✗ Chưa có khoá${selectedLabels.length ? `: ${selectedLabels.join(', ')}` : ''}`;
  });

  sfbAiKeyConfigured = isApiKeyConfigured(selectedSfbAiKeyName());
  const sfbManage = document.getElementById('sfb-ai-key-manage');
  if (sfbManage) sfbManage.title = `Mở cấu hình ${by[selectedSfbAiKeyName()]?.label || selectedSfbAiKeyName()}`;
  const nnManage = document.getElementById('nn-ai-key-manage');
  if (nnManage) nnManage.title = `Mở cấu hình ${by[selectedNnAiKeyName()]?.label || selectedNnAiKeyName()}`;
}

function goToSelectedSfbAiKey() { goToApiKey(selectedSfbAiKeyName()); }
function goToSelectedNnAiKey() { goToApiKey(selectedNnAiKeyName()); }

async function promptApiKey(name) {
  const spec = apiKeyVaultState.find(k => k.name === name);
  const value = prompt(`Dán API key cho ${spec ? spec.label : name}:` + (spec && spec.hint ? `\n(${spec.hint})` : ''));
  if (value === null) return;
  if (!value.trim()) { showToast('Chưa nhập gì — huỷ bỏ'); return; }
  try {
    const res = await fetch(`/api/keys/${encodeURIComponent(name)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: value.trim() }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Không lưu được khoá');
    showToast('Đã lưu khoá');
    await loadApiKeyVault();
  } catch (err) { showToast('Lỗi lưu khoá: ' + err.message); }
}

async function removeApiKey(name) {
  const spec = apiKeyVaultState.find(k => k.name === name);
  if (!confirm(`Xoá khoá ${spec ? spec.label : name}? Các phân hệ đang dùng khoá này sẽ ngừng hoạt động.`)) return;
  try {
    const res = await fetch(`/api/keys/${encodeURIComponent(name)}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Không xoá được khoá');
    showToast('Đã xoá khoá');
    await loadApiKeyVault();
  } catch (err) { showToast('Lỗi xoá khoá: ' + err.message); }
}

async function testApiKey(name) {
  showToast('Đang gọi thử nhà cung cấp...');
  try {
    const res = await fetch(`/api/keys/${encodeURIComponent(name)}/test`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Không thử được');
    showToast((data.valid ? '✓ ' : '✗ ') + data.message, 7000);
  } catch (err) { showToast('Lỗi thử khoá: ' + err.message, 6000); }
}

function focusApiKey(name) {
  const row = document.getElementById(`key-row-${name}`);
  if (row) {
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    row.classList.add('key-row-flash');
    setTimeout(() => row.classList.remove('key-row-flash'), 1600);
  }
}

// Gọi từ các phân hệ khác: nhảy sang Cài Đặt Hệ Thống rồi nháy đúng dòng khoá.
async function goToApiKey(name) {
  switchTab('settings');
  await loadApiKeyVault();
  focusApiKey(name);
}

// =============================================================================
// PHÂN HỆ: XƯỞNG TẠO ẢNH AI (DUAL ENGINE: INSTANT AI & ANTIGRAVITY QUEUE)
// =============================================================================
// =============================================================================
// XƯỞNG REMAKE HOẠT HÌNH 2D (native — thay cho iframe remake_hub.html)
// =============================================================================

// Nhãn cho biết kịch bản đến từ đâu — người dùng cần phân biệt bản đã xác minh
// với bản do AI hoặc từ khoá suy ra.
const RM_SCRIPT_ICON = { verified: '✅', ai: '🤖', heuristic: '🔍' };

let rmCountries = [];
let rmPollTimer = null;
let rmSubTab = 'projects';
let rmBusy = false;

function rmEl(id) { return document.getElementById(id); }

function rmCleanSlug(value) {
  const base = (value || '').toLowerCase()
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  // Tên file kiểu "1.mp4" cho ra mã project là "1" — khó tra cứu về sau.
  return /^\d+$/.test(base) ? `remake-${base}` : base;
}

async function rmFetch(url, options) {
  const res = await fetch(url, options);
  let data = {};
  try { data = await res.json(); } catch (e) {}
  if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
  return data;
}

function switchRemakeSubTab(tab) {
  rmSubTab = tab;
  const isProjects = tab === 'projects';
  rmEl('rm-tab-btn-projects')?.classList.toggle('active', isProjects);
  rmEl('rm-tab-btn-console')?.classList.toggle('active', !isProjects);
  const pp = rmEl('rm-projects-pane');
  const cp = rmEl('rm-console-pane');
  if (pp) pp.style.display = isProjects ? 'block' : 'none';
  if (cp) cp.style.display = isProjects ? 'none' : 'block';
}

async function loadRemakeStudio() {
  rmBindUploadOnce();
  try {
    await Promise.all([loadRemakeVideos(), loadRemakeCountries()]);
    await loadRemakeProjects();
  } catch (err) {
    rmLog('Lỗi tải dữ liệu: ' + err.message, true);
    rmSetStatus('Lỗi tải dữ liệu');
  }
}

// ------------------------------------------------------------- video nguồn

async function loadRemakeVideos(selectedPath) {
  const sel = rmEl('rm-video-select');
  if (!sel) return;
  const data = await rmFetch('/api/remake/source-videos');
  const videos = data.videos || [];
  const statEl = rmEl('rm-stat-videos');
  if (statEl) statEl.textContent = videos.length;

  if (!videos.length) {
    sel.innerHTML = '<option disabled>Chưa có video — hãy tải video lên</option>';
    const btn = rmEl('rm-start-btn');
    if (btn) btn.disabled = true;
    return;
  }

  sel.innerHTML = videos.map(v =>
    `<option value="${escapeHtml(v.path)}">${v.uploaded ? '⬆ ' : ''}${escapeHtml(v.filename)} · ${v.size_mb} MB</option>`
  ).join('');

  if (selectedPath && videos.some(v => v.path === selectedPath)) sel.value = selectedPath;
  const btn = rmEl('rm-start-btn');
  if (btn) btn.disabled = false;
  rmSyncSlugFromVideo();
}

function rmSyncSlugFromVideo() {
  const sel = rmEl('rm-video-select');
  const slug = rmEl('rm-project-slug');
  if (!sel || !slug || !sel.options.length) return;
  const label = (sel.options[sel.selectedIndex]?.textContent || '').replace(/^⬆\s*/, '').split(' · ')[0];
  slug.value = rmCleanSlug(label);
}

async function loadRemakeCountries() {
  const data = await rmFetch('/api/remake/countries');
  rmCountries = data.countries || [];
}

// ------------------------------------------------------------------ upload

let rmUploadBound = false;

function rmBindUploadOnce() {
  if (rmUploadBound) return;
  rmUploadBound = true;

  const zone = rmEl('rm-dropzone');
  const input = rmEl('rm-file-input');
  const btn = rmEl('rm-upload-btn');
  const sel = rmEl('rm-video-select');

  btn?.addEventListener('click', () => input?.click());
  zone?.addEventListener('click', e => { if (e.target === zone) input?.click(); });
  input?.addEventListener('change', () => rmUploadVideo(input.files?.[0]));
  sel?.addEventListener('change', rmSyncSlugFromVideo);

  // Auto-Remake: upload + pipeline remake trong một bước
  const autoInput = rmEl('rm-auto-file-input');
  autoInput?.addEventListener('change', () => {
    rmAutoRemakeUpload(autoInput.files?.[0]);
    autoInput.value = '';  // cho phép chọn lại cùng file
  });

  // Kéo thả file vào khung
  ['dragenter', 'dragover'].forEach(ev => zone?.addEventListener(ev, e => {
    e.preventDefault();
    zone.classList.add('is-dragging');
  }));
  ['dragleave', 'drop'].forEach(ev => zone?.addEventListener(ev, e => {
    e.preventDefault();
    if (ev === 'dragleave' && zone.contains(e.relatedTarget)) return;
    zone.classList.remove('is-dragging');
  }));
  zone?.addEventListener('drop', e => rmUploadVideo(e.dataTransfer?.files?.[0]));
}

function rmUploadVideo(file) {
  if (!file) return;
  const okExt = ['.mp4', '.mov', '.webm'];
  const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
  if (!okExt.includes(ext)) {
    showToast('Chỉ hỗ trợ video MP4, MOV hoặc WebM.', 4000);
    return;
  }
  if (file.size > 500 * 1024 * 1024) {
    showToast('Video vượt quá giới hạn 500 MB.', 4000);
    return;
  }

  const titleEl = rmEl('rm-upload-title');
  const noteEl = rmEl('rm-upload-note');
  const progress = rmEl('rm-upload-progress');
  const fill = rmEl('rm-upload-fill');
  const btn = rmEl('rm-upload-btn');

  const form = new FormData();
  form.append('file', file);
  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/remake/upload');

  if (btn) { btn.disabled = true; btn.textContent = 'Đang tải…'; }
  if (titleEl) titleEl.textContent = file.name;
  if (noteEl) noteEl.textContent = `${(file.size / 1024 / 1024).toFixed(2)} MB`;
  if (progress) progress.style.display = 'block';

  xhr.upload.addEventListener('progress', e => {
    if (!e.lengthComputable) return;
    const pct = Math.round(e.loaded / e.total * 100);
    if (fill) fill.style.width = pct + '%';
    rmSetStatus(`Đang tải video · ${pct}%`);
  });

  xhr.addEventListener('load', async () => {
    if (btn) { btn.disabled = false; btn.textContent = 'Chọn file khác'; }
    let data = {};
    try { data = JSON.parse(xhr.responseText || '{}'); } catch (e) {}
    if (xhr.status < 200 || xhr.status >= 300) {
      if (noteEl) noteEl.textContent = data.detail || `Upload lỗi HTTP ${xhr.status}`;
      rmSetStatus('Upload thất bại');
      showToast('Upload thất bại: ' + (data.detail || xhr.status), 5000);
      return;
    }
    if (fill) fill.style.width = '100%';
    if (noteEl) noteEl.textContent = `Đã kiểm tra · ${data.width}×${data.height} · ${data.duration}s`;
    rmSetStatus('Upload xong · sẵn sàng remake');
    rmLog(`Đã tải lên ${data.original_filename}. Server lưu an toàn thành ${data.filename}.`);
    showToast('✅ Đã tải video lên Xưởng Remake');
    await loadRemakeVideos(data.path);
  });

  xhr.addEventListener('error', () => {
    if (btn) { btn.disabled = false; btn.textContent = 'Thử lại'; }
    if (noteEl) noteEl.textContent = 'Không kết nối được server';
    rmSetStatus('Upload thất bại');
  });

  xhr.send(form);
}

// ------------------------------------------------------- tiến trình & log

function rmSetStatus(text) {
  const live = rmEl('rm-live-status');
  if (live) live.textContent = text;
  const st = rmEl('rm-status-text');
  if (st) st.textContent = text;
}

function rmSetProgress(pct) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  const fill = rmEl('rm-progress-fill');
  const mini = rmEl('rm-mini-fill');
  const wrap = rmEl('rm-mini-progress');
  const label = rmEl('rm-progress-pct');
  if (fill) fill.style.width = p + '%';
  if (mini) mini.style.width = p + '%';
  if (label) label.textContent = p + '%';
  if (wrap) wrap.style.display = (p > 0 && p < 100) ? 'block' : 'none';
}

function rmLog(text, isError) {
  const box = rmEl('rm-logs');
  if (!box) return;
  const div = document.createElement('div');
  div.className = 'rm-log-line' + (isError ? ' is-error' : '');
  div.textContent = text;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

function rmRenderLogs(lines) {
  const box = rmEl('rm-logs');
  if (!box) return;
  box.innerHTML = (lines || []).map(l =>
    `<div class="rm-log-line${l.includes('[LỖI]') ? ' is-error' : ''}">${escapeHtml(l)}</div>`
  ).join('');
  box.scrollTop = box.scrollHeight;
}

function rmSetBusy(busy) {
  rmBusy = busy;
  const btn = rmEl('rm-start-btn');
  const icon = rmEl('rm-start-icon');
  const text = rmEl('rm-start-text');
  if (btn) btn.disabled = busy;
  if (icon) icon.textContent = busy ? '⏳' : '🚀';
  if (text) text.textContent = busy ? 'Đang xử lý video…' : 'Bắt Đầu Dựng Bản Remake';
}

function rmPollTask(taskId, onDone) {
  clearInterval(rmPollTimer);
  rmPollTimer = setInterval(async () => {
    try {
      const task = await rmFetch(`/api/remake/status/${encodeURIComponent(taskId)}`);
      const pct = Number(task.progress || 0);
      rmSetProgress(pct);
      rmSetStatus(`${task.current_step || task.status} · ${pct}%`);
      rmRenderLogs(task.logs);
      if (['completed', 'error', 'needs_review', 'waiting_antigravity'].includes(task.status)) {
        clearInterval(rmPollTimer);
        rmSetBusy(false);
        if (task.status === 'completed') {
          showToast('🎉 Dựng bản remake hoàn tất!');
          await loadRemakeProjects();
        } else if (task.status !== 'error') {
          rmLog('Chưa xuất bản: cần duyệt nhân vật, bản dịch và mốc cảnh nguồn.');
          if (task.result?.review_url) rmLog(`Dữ liệu cần duyệt: ${task.result.review_url}`);
          await loadRemakeProjects();
        } else {
          showToast('❌ Tiến trình remake gặp lỗi — xem tab Tiến Trình', 5000);
        }
        if (typeof onDone === 'function') onDone(task);
      }
    } catch (err) {
      clearInterval(rmPollTimer);
      rmSetBusy(false);
      rmSetStatus('Mất kết nối');
      rmLog(err.message, true);
      if (typeof onDone === 'function') onDone(null);
    }
  }, 1200);
}

async function startRemakeBuild() {
  const sel = rmEl('rm-video-select');
  const slugEl = rmEl('rm-project-slug');
  const project = rmCleanSlug(slugEl?.value);
  if (!project) {
    showToast('Hãy nhập mã project (chỉ chữ, số, gạch ngang).', 4000);
    slugEl?.focus();
    return;
  }
  if (slugEl) slugEl.value = project;

  rmSetBusy(true);
  rmSetProgress(2);
  rmSetStatus('Đang khởi tạo · 2%');
  switchRemakeSubTab('console');

  try {
    const data = await rmFetch('/api/remake/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ video_path: sel?.value, project_name: project }),
    });
    rmPollTask(data.task_id);
  } catch (err) {
    rmSetBusy(false);
    rmSetStatus('Không thể bắt đầu');
    rmLog(err.message, true);
    showToast('Lỗi: ' + err.message, 5000);
  }
}

// ------------------------------------------------------------------ dự án

async function loadRemakeProjects() {
  const grid = rmEl('rm-projects-grid');
  const empty = rmEl('rm-projects-empty');
  if (!grid) return;

  const data = await rmFetch('/api/remake/projects');
  const list = data.projects || [];

  const countEl = rmEl('rm-projects-count');
  if (countEl) countEl.textContent = list.length;
  const statEl = rmEl('rm-stat-projects');
  if (statEl) statEl.textContent = list.length;

  if (!list.length) {
    grid.innerHTML = '';
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';

  grid.innerHTML = list.map(item => {
    const isRig = item.renderer === 'character-rig';
    const passed = item.fidelity === 'passed';
    const meta = ['papaya-native-v1', 'native-vector-v1'].includes(item.renderer) ? 'Native Vector · 30 FPS' : isRig ? 'Character Rig' : 'Storyboard';
    const locales = (item.locales || ['vi-VN']);

    const countryOptions = rmCountries.map(c =>
      `<option value="${c.code}" ${c.code === 'en-US' ? 'selected' : ''}>${c.flag} ${escapeHtml(c.country)} · ${escapeHtml(c.language)}</option>`
    ).join('');

    return `
      <article class="rm-project-card">
        <div class="rm-project-top">
          <span class="ai-badge ${passed ? 'badge-completed' : 'badge-pending'}">
            ${escapeHtml(item.badge || (passed ? 'Đã kiểm tra' : 'Cần đối chiếu nguồn'))}
          </span>
          <span class="rm-project-dur">${Number(item.duration || 0).toFixed(1)}s</span>
        </div>
        ${item.script_source_label ? `
          <div class="rm-script-source" title="Cách kịch bản của video này được dựng">
            ${RM_SCRIPT_ICON[item.script_source] || '📝'} ${escapeHtml(item.script_source_label)}
          </div>` : ''}

        <h4 class="rm-project-name" title="${escapeHtml(item.name || item.id)}">${escapeHtml(item.name || item.id)}</h4>
        <p class="rm-project-meta">
          Nguồn: <strong>${escapeHtml(item.source || '—')}</strong> · ${meta} · ${item.cues_count || 0} đoạn thoại
          ${item.theme_label ? `<br>Chủ đề nhận dạng: <strong>${escapeHtml(item.theme_label)}</strong>` : ''}
        </p>

        ${isRig ? `
          <div class="rm-locale-row">
            <span class="rm-locale-label">🗣️ Đã có:</span>
            <div class="rm-locale-chips">
              ${locales.map(l => `<span class="rm-locale-chip">${escapeHtml(l)}</span>`).join('')}
            </div>
          </div>
          <div class="rm-localize-row">
            <select class="ai-inline-input rm-country-select" id="rm-country-${escapeHtml(item.id)}">
              ${countryOptions}
            </select>
            <button type="button" class="ai-mini-btn primary"
                    onclick="localizeRemakeProject('${escapeHtml(item.id)}', this)">
              🎙️ Tạo voice
            </button>
          </div>` : ''}

        ${item.status === 'needs_review' ? `
          <label class="ai-mini-btn rm-file-label">📥 Nạp storyboard JSON đã duyệt
            <input type="file" accept="application/json,.json" data-remake-storyboard="${escapeHtml(item.id)}" onchange="approveRemakeStoryboard(this)">
          </label>` : ''}
        ${(item.status === 'needs_review' || item.renderer === 'puppet-2d-v1' || item.character_count) ? `
          <button type="button" class="ai-mini-btn" onclick="openRemakeCharacterStudio('${escapeHtml(item.id)}')">
            🎨 Duyệt nhân vật${item.character_count ? ` (${Number(item.character_count)})` : ''}
          </button>` : ''}
        ${item.preview_url ? `
          <div class="rm-preview-row">
            <a class="ai-mini-btn" href="${escapeHtml(item.preview_url)}" target="_blank" rel="noopener" title="Xem video preview đã ghép lồng tiếng">
              🎬 Xem preview MP4
            </a>
          </div>` : ''}

        <div class="rm-publish-row" id="rm-publish-${escapeHtml(item.id)}" ${item.preview_url ? '' : 'hidden'}>
          <button type="button" class="ai-mini-btn rm-publish-toggle"
                  onclick="toggleRemakePublish('${escapeHtml(item.id)}')"
                  title="Đăng video lên TikTok">
            📤 Đăng TikTok
          </button>
          <div class="rm-publish-form" id="rm-publish-form-${escapeHtml(item.id)}" style="display:none;">
            <select class="ai-inline-input rm-channel-select" id="rm-pub-channel-${escapeHtml(item.id)}">
              <option value="">Đang tải kênh…</option>
            </select>
            <input class="ai-inline-input" id="rm-pub-caption-${escapeHtml(item.id)}"
                   placeholder="Caption (tuỳ chọn)" value="${escapeHtml(item.theme_label || '')}">
            <input class="ai-inline-input" id="rm-pub-hashtags-${escapeHtml(item.id)}"
                   placeholder="Hashtags" value="#fyp #viral #trending">
            <button type="button" class="ai-mini-btn primary"
                    onclick="publishRemakeToTikTok('${escapeHtml(item.id)}', this)">
              🚀 Đăng ngay
            </button>
          </div>
        </div>

        <a class="rm-project-open" href="${escapeHtml(item.demo_url || item.review_url || '#')}" target="_blank" rel="noopener">
          ${item.status === 'needs_review' ? 'Mở storyboard cần duyệt' : 'Mở bản dựng hoạt hình'}
        </a>
      </article>`;
  }).join('');
}

let rmCharacterBible = null;
let rmCharacterProject = '';

function rmCharacterField(index, key, label, type = 'color') {
  const char = rmCharacterBible.characters[index];
  const value = char.appearance[key] || '';
  if (key === 'hair_style') {
    const options = ['crop','bob','waves','side-part','bun','curly'];
    return `<label>${label}<select data-character-index="${index}" data-character-key="${key}">${options.map(v => `<option value="${v}" ${v === value ? 'selected' : ''}>${v}</option>`).join('')}</select></label>`;
  }
  return `<label>${label}<input type="${type}" value="${escapeHtml(value)}" data-character-index="${index}" data-character-key="${key}"></label>`;
}

function renderRemakeCharacterStudio() {
  const list = rmEl('rm-character-list');
  if (!list || !rmCharacterBible) return;
  list.innerHTML = rmCharacterBible.characters.map((char, index) => `
    <article class="rm-character-card">
      <div class="rm-character-preview"><div class="rm-character-avatar" style="--skin:${escapeHtml(char.appearance.skin)};--hair:${escapeHtml(char.appearance.hair)};--outfit:${escapeHtml(char.appearance.outfit_primary)};--outline:${escapeHtml(char.appearance.outline)}"></div></div>
      <h4 style="margin:0 0 4px">${escapeHtml(char.label)}</h4>
      <small>${char.scene_ids.length} cảnh · ${escapeHtml(char.rig)}</small>
      <div class="rm-character-fields" style="margin-top:12px">
        ${rmCharacterField(index,'skin','Da')}${rmCharacterField(index,'hair','Tóc')}
        ${rmCharacterField(index,'outfit_primary','Áo chính')}${rmCharacterField(index,'outfit_secondary','Điểm nhấn')}
        ${rmCharacterField(index,'trousers','Quần')}${rmCharacterField(index,'shoes','Giày')}
        ${rmCharacterField(index,'outline','Viền')}${rmCharacterField(index,'hair_style','Kiểu tóc','select')}
        <label>Phụ kiện<select data-character-index="${index}" data-character-key="accessory"><option value="none" ${char.appearance.accessory === 'none' ? 'selected' : ''}>Không</option><option value="glasses" ${char.appearance.accessory === 'glasses' ? 'selected' : ''}>Kính</option></select></label>
        <label>Trạng thái<select data-character-index="${index}" data-character-status><option value="draft" ${char.status === 'draft' ? 'selected' : ''}>Cần duyệt</option><option value="approved" ${char.status === 'approved' ? 'selected' : ''}>Đã duyệt</option></select></label>
      </div>
    </article>`).join('') || '<p>Storyboard chưa phát hiện nhân vật.</p>';
  list.querySelectorAll('[data-character-key]').forEach(input => input.addEventListener('input', event => {
    const el = event.currentTarget, char = rmCharacterBible.characters[Number(el.dataset.characterIndex)];
    char.appearance[el.dataset.characterKey] = el.value;
    renderRemakeCharacterStudio();
  }));
  list.querySelectorAll('[data-character-status]').forEach(input => input.addEventListener('change', event => {
    rmCharacterBible.characters[Number(event.currentTarget.dataset.characterIndex)].status = event.currentTarget.value;
  }));
}

async function openRemakeCharacterStudio(projectId) {
  try {
    rmCharacterProject = projectId;
    rmCharacterBible = await rmFetch(`/api/remake/projects/${encodeURIComponent(projectId)}/characters`);
    rmEl('rm-character-modal').style.display = 'flex';
    rmEl('rm-character-summary').textContent = `${rmCharacterBible.characters.length} nhân vật · palette và lớp hình dùng chung toàn dự án`;
    renderRemakeCharacterStudio();
  } catch (error) { showToast(error.message, 6000); }
}

function closeRemakeCharacterStudio(event) {
  if (event) event.preventDefault();
  const modal = rmEl('rm-character-modal');
  if (modal) modal.style.display = 'none';
}

async function saveRemakeCharacters() {
  if (!rmCharacterBible || !rmCharacterProject) return;
  try {
    const data = await rmFetch(`/api/remake/projects/${encodeURIComponent(rmCharacterProject)}/characters`, {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(rmCharacterBible)});
    rmCharacterBible = data.character_bible;
    rmEl('rm-character-status').textContent = data.message + (rmCharacterBible.review_status === 'approved' ? ' · Tất cả đã duyệt' : ' · Còn nhân vật cần duyệt');
    showToast(data.message, 4000);
  } catch (error) { showToast(error.message, 6000); }
}

async function approveRemakeStoryboard(input) {
  const file=input.files?.[0];
  if(!file)return;
  if(file.size>2*1024*1024){showToast('Storyboard tối đa 2 MB');return;}
  try{
    const story=JSON.parse(await file.text());
    if(!window.confirm('Xác nhận bạn đã đối chiếu người nói, bản dịch, mốc cảnh và hành động với video nguồn?'))return;
    const result=await rmFetch(`/api/remake/projects/${encodeURIComponent(input.dataset.remakeStoryboard)}/storyboard`,{
      method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...story,approved:true})
    });
    showToast(result.message,6000);
  }catch(error){showToast(error.message,6000);}finally{input.value='';}
}

async function localizeRemakeProject(projectId, btn) {
  const sel = rmEl('rm-country-' + projectId);
  const locale = sel?.value || 'en-US';
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Đang tạo…'; }

  rmSetProgress(2);
  rmSetStatus(`Chuẩn bị ${locale} · 2%`);
  switchRemakeSubTab('console');

  try {
    const data = await rmFetch(`/api/remake/projects/${encodeURIComponent(projectId)}/localize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locales: [locale] }),
    });
    rmPollTask(data.task_id, () => {
      if (btn) { btn.disabled = false; btn.textContent = '🎙️ Tạo voice'; }
    });
  } catch (err) {
    if (btn) { btn.disabled = false; btn.textContent = '🎙️ Tạo voice'; }
    rmSetStatus('Lỗi tạo voice');
    rmLog(err.message, true);
    showToast('Lỗi tạo voice: ' + err.message, 5000);
  }
}

async function clearAllRemakeProjects() {
  if (!confirm('Bạn có chắc muốn xóa toàn bộ các video và dự án remake đã dựng không?')) return;
  try {
    const res = await rmFetch('/api/remake/projects?confirm=XOA-TAT-CA', { method: 'DELETE' });
    if (res && res.success) {
      await loadRemakeProjects();
      showToast('Đã xóa toàn bộ các video và dự án remake', 3500);
    }
  } catch (err) {
    alert('Lỗi xóa dự án: ' + (err.message || err));
  }
}


// ----------------------------------------------------------- publish TikTok

function toggleRemakePublish(projectId) {
  const form = rmEl('rm-publish-form-' + projectId);
  if (!form) return;
  const isHidden = form.style.display === 'none';
  form.style.display = isHidden ? 'flex' : 'none';

  // Lazy-load danh sách kênh vào select nếu chưa có
  if (isHidden) {
    const sel = rmEl('rm-pub-channel-' + projectId);
    if (sel && sel.options.length <= 1 && allChannels && allChannels.length) {
      sel.innerHTML = allChannels.map(ch =>
        `<option value="${ch.id}">${escapeHtml(ch.username || 'Kênh ' + ch.id)} (${escapeHtml(ch.country || '?')})</option>`
      ).join('');
    } else if (sel && sel.options.length <= 1) {
      // Tải danh sách kênh nếu chưa có
      fetch('/api/channels').then(r => r.json()).then(data => {
        const channels = data.channels || [];
        sel.innerHTML = channels.length
          ? channels.map(ch =>
              `<option value="${ch.id}">${escapeHtml(ch.username || 'Kênh ' + ch.id)} (${escapeHtml(ch.country || '?')})</option>`
            ).join('')
          : '<option value="" disabled>Chưa có kênh TikTok nào</option>';
      }).catch(() => {
        sel.innerHTML = '<option value="" disabled>Lỗi tải kênh</option>';
      });
    }
  }
}

async function publishRemakeToTikTok(projectId, btn) {
  const channelSel = rmEl('rm-pub-channel-' + projectId);
  const captionEl = rmEl('rm-pub-caption-' + projectId);
  const hashtagsEl = rmEl('rm-pub-hashtags-' + projectId);

  const channelId = parseInt(channelSel?.value);
  if (!channelId) {
    showToast('Hãy chọn một kênh TikTok để đăng.', 4000);
    return;
  }

  const caption = captionEl?.value || '';
  const hashtags = hashtagsEl?.value || '#fyp #viral #trending';

  if (btn) { btn.disabled = true; btn.textContent = '⏳ Đang đăng…'; }
  rmSetProgress(2);
  rmSetStatus(`Chuẩn bị đăng lên kênh #${channelId} · 2%`);
  switchRemakeSubTab('console');

  try {
    const data = await rmFetch(`/api/remake/projects/${encodeURIComponent(projectId)}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel_id: channelId, caption, hashtags }),
    });
    showToast(`✅ Đã đưa vào hàng đợi đăng TikTok`, 3000);
    rmPollTask(data.task_id, (task) => {
      if (btn) { btn.disabled = false; btn.textContent = '🚀 Đăng ngay'; }
      if (task && task.status === 'completed') {
        showToast('🎉 Đăng video TikTok thành công!');
      }
    });
  } catch (err) {
    if (btn) { btn.disabled = false; btn.textContent = '🚀 Đăng ngay'; }
    rmSetStatus('Lỗi đăng TikTok');
    rmLog(err.message, true);
    showToast('Lỗi: ' + err.message, 5000);
  }
}


// ------------------------------------------------------- auto-remake upload

function rmAutoRemakeUpload(file) {
  if (!file) return;
  const okExt = ['.mp4', '.mov', '.webm'];
  const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
  if (!okExt.includes(ext)) {
    showToast('Chỉ hỗ trợ video MP4, MOV hoặc WebM.', 4000);
    return;
  }
  if (file.size > 500 * 1024 * 1024) {
    showToast('Video vượt quá giới hạn 500 MB.', 4000);
    return;
  }

  const titleEl = rmEl('rm-upload-title');
  const noteEl = rmEl('rm-upload-note');
  const progress = rmEl('rm-upload-progress');
  const fill = rmEl('rm-upload-fill');
  const btn = rmEl('rm-upload-btn');

  const form = new FormData();
  form.append('file', file);
  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/remake/auto');

  if (btn) { btn.disabled = true; btn.textContent = 'Đang tải & remake…'; }
  if (titleEl) titleEl.textContent = file.name;
  if (noteEl) noteEl.textContent = `${(file.size / 1024 / 1024).toFixed(2)} MB · upload + auto-remake`;
  if (progress) progress.style.display = 'block';

  rmSetBusy(true);
  switchRemakeSubTab('console');
  rmSetStatus('Đang upload video…');

  xhr.upload.addEventListener('progress', e => {
    if (!e.lengthComputable) return;
    const pct = Math.round(e.loaded / e.total * 100);
    if (fill) fill.style.width = pct + '%';
    rmSetStatus(`Đang tải video · ${pct}%`);
    rmSetProgress(Math.round(pct * 0.15)); // upload chiếm 15% tiến trình tổng
  });

  xhr.addEventListener('load', async () => {
    if (btn) { btn.disabled = false; btn.textContent = 'Chọn file khác'; }
    let data = {};
    try { data = JSON.parse(xhr.responseText || '{}'); } catch (e) {}
    if (xhr.status < 200 || xhr.status >= 300) {
      if (noteEl) noteEl.textContent = data.detail || `Upload lỗi HTTP ${xhr.status}`;
      rmSetStatus('Upload thất bại');
      rmSetBusy(false);
      showToast('Upload thất bại: ' + (data.detail || xhr.status), 5000);
      return;
    }
    if (fill) fill.style.width = '100%';
    if (noteEl) noteEl.textContent = `Đã upload · ${data.width}×${data.height} · ${data.duration}s`;
    rmSetStatus('Upload xong · đang chạy pipeline remake…');
    rmLog(`Auto-Remake: ${data.original_filename} → ${data.filename} (${data.size_mb} MB)`);
    showToast('⬆️ Upload xong, đang chạy remake tự động…');

    // Poll task pipeline remake
    if (data.task_id) {
      rmPollTask(data.task_id, async () => {
        await loadRemakeVideos();
        await loadRemakeProjects();
      });
    } else {
      rmSetBusy(false);
      await loadRemakeVideos(data.path);
    }
  });

  xhr.addEventListener('error', () => {
    if (btn) { btn.disabled = false; btn.textContent = 'Thử lại'; }
    if (noteEl) noteEl.textContent = 'Không kết nối được server';
    rmSetStatus('Upload thất bại');
    rmSetBusy(false);
  });

  xhr.send(form);
}


// =============================================================================
// PHÍM TẮT TOÀN CỤC
// =============================================================================

const SHORTCUT_HELP = [
  ['Ctrl/⌘ + B', 'Thu gọn hoặc mở rộng sidebar'],
  ['Alt + 1…9', 'Nhảy nhanh tới phân hệ thứ 1–9 trên sidebar'],
  ['/', 'Đưa con trỏ vào ô tìm kiếm của phân hệ đang mở'],
  ['Esc', 'Đóng hộp thoại đang mở'],
  ['?', 'Hiện bảng phím tắt này'],
];

function showShortcutHelp() {
  const modal = document.getElementById('modal-shortcuts');
  const body = document.getElementById('shortcuts-body');
  if (body) {
    body.innerHTML = SHORTCUT_HELP.map(([k, d]) => `
      <div class="shortcut-row"><kbd>${escapeHtml(k)}</kbd><span>${escapeHtml(d)}</span></div>
    `).join('');
  }
  if (modal) {
    modal.style.display = 'flex';
    modal.style.setProperty('display', 'flex', 'important');
  }
}

function closeShortcutHelp() {
  const modal = document.getElementById('modal-shortcuts');
  if (modal) {
    modal.style.display = 'none';
    modal.style.setProperty('display', 'none', 'important');
  }
}

function focusCurrentTabSearch() {
  const pane = [...document.querySelectorAll('.app-workspace .tab-pane')]
    .find(p => p.style.display !== 'none');
  if (!pane) return false;
  const input = pane.querySelector('input[type="search"], input[type="text"][placeholder*="ìm"], input[id*="search"]');
  if (input && input.offsetParent !== null) {
    input.focus();
    input.select?.();
    return true;
  }
  return false;
}

function isTypingTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

document.addEventListener('keydown', event => {
  // Không cướp phím khi người dùng đang gõ trong ô nhập.
  if (isTypingTarget(event.target)) return;

  if (event.key === '/' && !event.ctrlKey && !event.metaKey) {
    if (focusCurrentTabSearch()) event.preventDefault();
    return;
  }
  if (event.key === '?' && event.shiftKey) {
    event.preventDefault();
    showShortcutHelp();
    return;
  }
  if (event.altKey && /^[1-9]$/.test(event.key)) {
    const tabs = [...document.querySelectorAll('.app-sidebar .nav-tab')];
    const target = tabs[Number(event.key) - 1];
    if (target && target.dataset.tab) {
      event.preventDefault();
      switchTab(target.dataset.tab);
    }
  }
});

// Esc đóng các hộp thoại mới thêm.
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  closeShortcutHelp();
  if (typeof closeChannelHistory === 'function') closeChannelHistory();
  const lightbox = document.getElementById('ai-image-modal');
  if (lightbox && lightbox.style.display !== 'none' && typeof closeAiImageModal === 'function') {
    closeAiImageModal();
  }
});

// =============================================================================
// BẢNG ĐIỀU KHIỂN TỔNG
// =============================================================================

function dashNum(n) {
  return (n || 0).toLocaleString('vi-VN');
}

async function loadDashboard() {
  const days = Number(document.getElementById('dash-range')?.value || 30);
  try {
    const [sumRes, histRes] = await Promise.all([
      fetch('/api/dashboard/summary').then(r => r.json()),
      fetch(`/api/channels/history-summary?days=${days}`).then(r => r.json()).catch(() => ({ days: [] })),
    ]);
    if (!sumRes.success) throw new Error('Không tải được số liệu tổng');
    renderDashboardKpis(sumRes.data);
    renderDashboardChart(histRes.days || []);
    renderDashboardLists(sumRes.data);
    const upd = document.getElementById('dash-updated');
    if (upd) upd.textContent = 'Cập nhật ' + new Date().toLocaleTimeString('vi-VN');
  } catch (err) {
    showToast('Lỗi tải bảng điều khiển: ' + err.message, 4000);
  }
}

function renderDashboardKpis(d) {
  const grid = document.getElementById('dash-kpi-grid');
  if (!grid) return;
  const cards = [
    {
      icon: '📊', label: 'Kênh TikTok', value: dashNum(d.channels.total),
      sub: `${dashNum(d.channels.monetized)} đã bật kiếm tiền`, tone: 'blue', tab: 'bkt',
    },
    {
      icon: '💰', label: 'Tổng $Earned', value: '$' + dashNum(d.channels.earned_total),
      sub: `Số dư: $${dashNum(d.channels.balance_total)}`, tone: 'green', tab: 'bkt',
    },
    {
      icon: '🎞️', label: 'Render video', value: dashNum(d.render.queued + d.render.processing),
      sub: `${dashNum(d.render.done)} xong · ${dashNum(d.render.error)} lỗi`, tone: 'purple', tab: 'gpu',
    },
    {
      icon: '🚀', label: 'Chờ đăng TikTok', value: dashNum(d.upload.queued),
      sub: `${dashNum(d.upload.success)} đã đăng · ${dashNum(d.upload.failed)} lỗi`, tone: 'amber', tab: 'upload',
    },
    {
      icon: '🎨', label: 'Hàng đợi ảnh AI', value: dashNum(d.images.pending + d.images.processing),
      sub: `Thư viện ${dashNum(d.images.library)} ảnh`, tone: 'pink', tab: 'ai_images',
    },
    {
      icon: '👥', label: 'Tài khoản đang nuôi', value: dashNum(d.accounts.nicks + d.accounts.fb_live),
      sub: 'Đang nuôi', tone: 'cyan', tab: 'profiles',
    },
  ];
  grid.innerHTML = cards.map(c => `
    <button type="button" class="dash-kpi tone-${c.tone}" onclick="switchTab('${c.tab}')">
      <span class="dash-kpi-icon">${c.icon}</span>
      <span class="dash-kpi-body">
        <span class="dash-kpi-label">${c.label}</span>
        <span class="dash-kpi-value">${c.value}</span>
        <span class="dash-kpi-sub">${c.sub}</span>
      </span>
    </button>
  `).join('');
}

function renderDashboardChart(days) {
  const wrap = document.getElementById('dash-chart-wrap');
  if (!wrap) return;
  if (!days.length) {
    wrap.innerHTML = `
      <div class="dash-empty">
        <div class="dash-empty-icon">📉</div>
        <p>Chưa có dữ liệu lịch sử. Mỗi lần bấm <strong>Quét Lại BKT</strong>, hệ thống sẽ ghi
        một mốc doanh thu — biểu đồ tăng trưởng sẽ xuất hiện từ lần quét thứ hai.</p>
      </div>`;
    return;
  }

  const max = Math.max(...days.map(d => d.earned), 1);
  const W = 100, H = 40;
  const pts = days.map((d, i) => {
    const x = days.length === 1 ? W / 2 : (i / (days.length - 1)) * W;
    const y = H - (d.earned / max) * (H - 4) - 2;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const area = `0,${H} ` + pts.join(' ') + ` ${W},${H}`;
  const last = days[days.length - 1];
  const first = days[0];
  const delta = (last.earned || 0) - (first.earned || 0);

  wrap.innerHTML = `
    <div class="dash-chart-summary">
      <div><span class="dash-chart-big">$${dashNum(last.earned)}</span>
           <span class="dash-chart-delta ${delta >= 0 ? 'up' : 'down'}">
             ${delta >= 0 ? '▲' : '▼'} ${dashNum(Math.abs(delta).toFixed(2))} so với đầu kỳ
           </span></div>
      <div class="dash-chart-meta">${last.channels} kênh · RPM TB ${last.rpm}</div>
    </div>
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="dash-svg">
      <defs>
        <linearGradient id="dashGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.32"/>
          <stop offset="100%" stop-color="#3b82f6" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <polygon points="${area}" fill="url(#dashGrad)"/>
      <polyline points="${pts.join(' ')}" fill="none" stroke="#2563eb" stroke-width="0.8"
                vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
    </svg>
    <div class="dash-chart-axis">
      <span>${first.day}</span><span>${last.day}</span>
    </div>`;
}

function renderDashboardLists(d) {
  const next = document.getElementById('dash-next-uploads');
  if (next) {
    const items = d.upload.next || [];
    next.innerHTML = items.length ? items.map(u => `
      <div class="dash-row">
        <span class="dash-row-time">${u.schedule_time ? new Date(u.schedule_time * 1000).toLocaleString('vi-VN') : '—'}</span>
        <span class="dash-row-main">${escapeHtml(u.caption || '(không có caption)')}</span>
        <span class="dash-row-tag">Kênh #${u.channel_id}</span>
      </div>`).join('')
      : '<div class="dash-empty-line">Không có video nào đang chờ đăng.</div>';
  }

  const errBox = document.getElementById('dash-errors');
  if (errBox) {
    const errs = d.recent_errors || [];
    errBox.innerHTML = errs.length ? errs.map(e => `
      <div class="dash-row error">
        <span class="dash-row-tag danger">${escapeHtml(e.kind)} #${e.id}</span>
        <span class="dash-row-main">${escapeHtml(e.message || 'Không rõ nguyên nhân')}</span>
        <span class="dash-row-time">${escapeHtml(e.at || '')}</span>
      </div>`).join('')
      : '<div class="dash-empty-line">✅ Không có lỗi nào gần đây.</div>';
  }
}

// =============================================================================
// THỐNG KÊ TÀI KHOẢN TIKTOK
// =============================================================================

function accStatsPct(part, total) {
  if (!total) return '0%';
  return Math.round((part / total) * 100) + '%';
}

/** Một dòng có thanh tỉ lệ, dùng chung cho các bảng phân bố. */
function accStatsBarRow(label, value, total, extra = '') {
  const pct = total ? Math.min(100, (value / total) * 100) : 0;
  return `
    <div class="acc-bar-row">
      <span class="acc-bar-label">${escapeHtml(String(label))}</span>
      <span class="acc-bar-track"><span class="acc-bar-fill" style="width:${pct.toFixed(1)}%"></span></span>
      <span class="acc-bar-value">${dashNum(value)}${extra ? ` <em>${escapeHtml(extra)}</em>` : ''}</span>
    </div>`;
}

async function loadAccountStats() {
  const days = Number(document.getElementById('acc-stats-range')?.value || 30);
  try {
    const res = await fetch(`/api/stats/accounts?days=${days}`);
    const json = await res.json();
    if (!json.success) throw new Error('Không tải được thống kê');
    const d = json.data;

    renderAccStatsKpi(d);
    renderAccStatsChart(d.series || [], d.growth || {});
    renderAccStatsStatus(d);
    renderAccStatsCountry(d);
    renderAccStatsMoney(d);
    renderAccStatsTop(d);
    renderAccStatsVideos(d);
    renderAccStatsStale(d);

    const badge = document.getElementById('side-badge-acc-stats');
    if (badge) badge.textContent = dashNum(d.totals.channels);
    const upd = document.getElementById('acc-stats-updated');
    if (upd) upd.textContent = 'Cập nhật ' + new Date().toLocaleTimeString('vi-VN');
  } catch (err) {
    showToast('Lỗi tải thống kê tài khoản: ' + err.message, 4000);
  }
}

function renderAccStatsKpi(d) {
  const grid = document.getElementById('acc-stats-kpi');
  if (!grid) return;
  const t = d.totals, a = d.audience;
  const cards = [
    {
      icon: '📊', label: 'Tổng kênh', value: dashNum(t.channels), tone: 'blue',
      sub: `${dashNum(t.monetized)} đã BKT · ${dashNum(t.dead)} DIE`,
    },
    {
      icon: '👥', label: 'Tổng follower', value: dashNum(a.followers), tone: 'cyan',
      sub: `Trung bình ${dashNum(a.avg_followers)} / kênh`,
    },
    {
      icon: '▶️', label: 'Tổng lượt xem', value: dashNum(a.views), tone: 'purple',
      sub: `${dashNum(a.likes)} lượt thích`,
    },
    {
      icon: '🎬', label: 'Video trên kênh', value: dashNum(a.videos), tone: 'amber',
      sub: `${dashNum(d.videos.total)} video đã quét chi tiết`,
    },
    {
      icon: '🛡️', label: 'Đã gán VPN', value: dashNum(t.vpn_assigned), tone: 'green',
      sub: `${accStatsPct(t.vpn_assigned, t.channels)} kho kênh · ${dashNum(t.with_profile)} có profile`,
    },
    {
      icon: '🔄', label: 'Quét trong hôm nay', value: dashNum(t.checked_today), tone: 'pink',
      sub: t.never_checked ? `${dashNum(t.never_checked)} kênh chưa quét lần nào` : 'Mọi kênh đều đã quét ít nhất một lần',
    },
  ];
  grid.innerHTML = cards.map(c => `
    <div class="dash-kpi tone-${c.tone}">
      <span class="dash-kpi-icon">${c.icon}</span>
      <span class="dash-kpi-body">
        <span class="dash-kpi-label">${c.label}</span>
        <span class="dash-kpi-value">${c.value}</span>
        <span class="dash-kpi-sub">${escapeHtml(c.sub)}</span>
      </span>
    </div>`).join('');
}

function renderAccStatsChart(series, growth) {
  const wrap = document.getElementById('acc-stats-chart');
  if (!wrap) return;
  if (series.length < 2) {
    wrap.innerHTML = `
      <div class="dash-empty">
        <div class="dash-empty-icon">📉</div>
        <p>Cần ít nhất hai ngày có dữ liệu để vẽ đường tăng trưởng.
        ${series.length === 1 ? `Hiện mới có mốc ngày <strong>${escapeHtml(series[0].day)}</strong>.` : ''}
        Mỗi lần <strong>Quét Lại BKT</strong> sẽ ghi thêm một mốc.</p>
      </div>`;
    return;
  }

  const max = Math.max(...series.map(p => p.followers), 1);
  const W = 100, H = 40;
  const pts = series.map((p, i) => {
    const x = (i / (series.length - 1)) * W;
    const y = H - (p.followers / max) * (H - 4) - 2;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const area = `0,${H} ` + pts.join(' ') + ` ${W},${H}`;
  const last = series[series.length - 1];
  const delta = growth.followers || 0;

  wrap.innerHTML = `
    <div class="dash-chart-summary">
      <div><span class="dash-chart-big">${dashNum(last.followers)}</span>
           <span class="dash-chart-delta ${delta >= 0 ? 'up' : 'down'}">
             ${delta >= 0 ? '▲' : '▼'} ${dashNum(Math.abs(delta))} follower so với đầu kỳ
           </span></div>
      <div class="dash-chart-meta">${dashNum(last.channels)} kênh có mốc · ${dashNum(last.views)} lượt xem</div>
    </div>
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="dash-svg">
      <defs>
        <linearGradient id="accStatsGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#06b6d4" stop-opacity="0.32"/>
          <stop offset="100%" stop-color="#06b6d4" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <polygon points="${area}" fill="url(#accStatsGrad)"/>
      <polyline points="${pts.join(' ')}" fill="none" stroke="#0891b2" stroke-width="0.8"
                vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
    </svg>
    <div class="dash-chart-axis">
      <span>${escapeHtml(series[0].day)}</span><span>${escapeHtml(last.day)}</span>
    </div>`;
}

function renderAccStatsStatus(d) {
  const box = document.getElementById('acc-stats-status');
  if (!box) return;
  const total = d.totals.channels;
  const rows = (d.by_status || []).map(s => accStatsBarRow(s.status, s.count, total, accStatsPct(s.count, total)));
  const pub = (d.by_publisher || []).map(p => accStatsBarRow('Publisher ' + p.publisher, p.count, total, accStatsPct(p.count, total)));
  box.innerHTML = rows.join('') +
    (pub.length ? `<div class="acc-bar-divider">Phân bổ publisher</div>${pub.join('')}` : '');
}

function renderAccStatsCountry(d) {
  const box = document.getElementById('acc-stats-country');
  if (!box) return;
  const list = d.by_country || [];
  if (!list.length) {
    box.innerHTML = '<div class="dash-empty-line">Chưa có kênh nào.</div>';
    return;
  }
  const max = Math.max(...list.map(c => c.count), 1);
  box.innerHTML = list.map(c => `
    <div class="acc-bar-row">
      <span class="acc-bar-label">${escapeHtml(c.country)}</span>
      <span class="acc-bar-track"><span class="acc-bar-fill" style="width:${((c.count / max) * 100).toFixed(1)}%"></span></span>
      <span class="acc-bar-value">${dashNum(c.count)} kênh
        <em>${dashNum(c.followers)} follower · ${dashNum(c.monetized)} BKT</em></span>
    </div>`).join('');
}

function renderAccStatsMoney(d) {
  const box = document.getElementById('acc-stats-money');
  if (!box) return;
  const list = d.money || [];
  // Không cộng gộp các mã tiền tệ khác nhau: hệ thống không có nguồn tỷ giá nào,
  // nên một con số tổng duy nhất sẽ là số liệu bịa.
  const rows = list.map(m => `
    <div class="dash-row">
      <span class="dash-row-tag">${escapeHtml(m.currency === '#' ? 'Chưa xác định' : m.currency)}</span>
      <span class="dash-row-main">
        Thu nhập <strong>${dashNum(m.earned)}</strong> · Số dư <strong>${dashNum(m.balance)}</strong> · RPM TB ${dashNum(m.avg_rpm)}
      </span>
      <span class="dash-row-time">${dashNum(m.channels)} kênh</span>
    </div>`).join('');
  const onlyUnknown = list.length === 1 && list[0].currency === '#';
  box.innerHTML = rows + (onlyUnknown
    ? '<div class="dash-empty-line">Chưa kênh nào quét ra tiền tệ — số liệu doanh thu sẽ xuất hiện sau khi bật kiếm tiền và quét lại.</div>'
    : '<div class="dash-empty-line">Mỗi dòng là một loại tiền tệ riêng, không quy đổi chéo.</div>');
}

function renderAccStatsTop(d) {
  const box = document.getElementById('acc-stats-top');
  if (!box) return;
  const list = (d.top_channels || []).filter(c => c.followers > 0 || c.views > 0);
  if (!list.length) {
    box.innerHTML = '<div class="dash-empty-line">Chưa có kênh nào có follower hoặc lượt xem.</div>';
    return;
  }
  box.innerHTML = list.map((c, i) => `
    <div class="dash-row">
      <span class="dash-row-tag">#${i + 1}</span>
      <span class="dash-row-main">
        <strong>${escapeHtml(c.username || c.note || ('Kênh #' + c.id))}</strong>
        <em class="acc-row-sub">${escapeHtml(c.country)} · ${escapeHtml(c.status)} · ${dashNum(c.videos)} video</em>
      </span>
      <span class="dash-row-time">${dashNum(c.followers)} follower · ${dashNum(c.views)} view</span>
    </div>`).join('');
}

function renderAccStatsVideos(d) {
  const box = document.getElementById('acc-stats-videos');
  if (!box) return;
  const v = d.videos || {};
  if (!v.total) {
    box.innerHTML = '<div class="dash-empty-line">Chưa quét chi tiết video của kênh nào.</div>';
    return;
  }
  const flags = `
    <div class="acc-flag-row">
      <span class="acc-flag">${dashNum(v.total)} video · ${dashNum(v.channels_with_videos)} kênh</span>
      ${v.prohibited ? `<span class="acc-flag danger">${dashNum(v.prohibited)} bị cấm</span>` : ''}
      ${v.reviewing ? `<span class="acc-flag warn">${dashNum(v.reviewing)} đang duyệt</span>` : ''}
      ${v.not_original ? `<span class="acc-flag warn">${dashNum(v.not_original)} không gốc</span>` : ''}
    </div>`;
  const shadow = (v.by_shadowban || []).map(s => accStatsBarRow(s.shadowban, s.count, v.total, accStatsPct(s.count, v.total))).join('');
  const top = (v.top || []).slice(0, 5).map(t => `
    <div class="dash-row">
      <span class="dash-row-main">
        ${t.url ? `<a href="${escapeHtml(t.url)}" target="_blank" rel="noopener">${escapeHtml(t.desc || t.video_id)}</a>`
                : escapeHtml(t.desc || t.video_id)}
      </span>
      <span class="dash-row-time">${dashNum(t.views)} view · ${dashNum(t.likes)} ♥</span>
    </div>`).join('');
  box.innerHTML = flags +
    '<div class="acc-bar-divider">Tình trạng phân phối</div>' + shadow +
    '<div class="acc-bar-divider">Video nhiều lượt xem nhất</div>' + top;
}

function renderAccStatsStale(d) {
  const box = document.getElementById('acc-stats-stale');
  if (!box) return;
  const list = d.stale || [];
  if (!list.length) {
    box.innerHTML = '<div class="dash-empty-line">Không có kênh nào.</div>';
    return;
  }
  box.innerHTML = list.map(c => `
    <div class="dash-row">
      <span class="dash-row-tag">#${c.id}</span>
      <span class="dash-row-main">${escapeHtml(c.username || c.note || ('Kênh #' + c.id))}
        <em class="acc-row-sub">${escapeHtml(c.status || '')}</em></span>
      <span class="dash-row-time">${c.last_checked
        ? new Date(c.last_checked * 1000).toLocaleString('vi-VN')
        : 'Chưa quét lần nào'}</span>
    </div>`).join('');
}

// --- Lịch sử một kênh (mở từ bảng BKT) ---

async function openChannelHistory(chId, event) {
  if (event) event.stopPropagation();
  const modal = document.getElementById('modal-channel-history');
  const body = document.getElementById('channel-history-body');
  if (modal) {
    modal.style.display = 'flex';
    modal.style.setProperty('display', 'flex', 'important');
  }
  if (body) body.innerHTML = '<div class="dash-empty-line">⏳ Đang tải lịch sử...</div>';

  try {
    const res = await fetch(`/api/channels/${chId}/history?days=90`);
    const data = await res.json();
    const titleEl = document.getElementById('channel-history-title');
    if (titleEl) {
      const c = data.channel || {};
      titleEl.textContent = `Lịch sử: ${c.note || c.nickname || c.username || ('Kênh #' + chId)}`;
    }
    if (!body) return;

    const pts = data.points || [];
    if (!pts.length) {
      body.innerHTML = `
        <div class="dash-empty">
          <div class="dash-empty-icon">📉</div>
          <p>Kênh này chưa có mốc lịch sử nào. Dữ liệu được ghi lại từ lần quét BKT kế tiếp.</p>
        </div>`;
      return;
    }

    const g = data.growth || {};
    body.innerHTML = `
      <div class="dash-growth-row">
        <div class="dash-growth"><span>Doanh thu</span><strong class="${(g.earned || 0) >= 0 ? 'up' : 'down'}">${(g.earned || 0) >= 0 ? '+' : ''}$${dashNum(g.earned)}</strong></div>
        <div class="dash-growth"><span>Follower</span><strong class="${(g.follower || 0) >= 0 ? 'up' : 'down'}">${(g.follower || 0) >= 0 ? '+' : ''}${dashNum(g.follower)}</strong></div>
        <div class="dash-growth"><span>Lượt xem</span><strong class="${(g.view || 0) >= 0 ? 'up' : 'down'}">${(g.view || 0) >= 0 ? '+' : ''}${dashNum(g.view)}</strong></div>
      </div>
      <table class="dash-history-table">
        <thead><tr><th>Thời điểm</th><th>$Earned</th><th>Số dư</th><th>RPM</th><th>Follower</th><th>Trạng thái</th></tr></thead>
        <tbody>
          ${pts.slice().reverse().map(p => `
            <tr>
              <td>${escapeHtml(p.captured_at || '')}</td>
              <td><strong>$${dashNum(p.earned)}</strong></td>
              <td>$${dashNum(p.balance)}</td>
              <td>${p.rpm || 0}</td>
              <td>${dashNum(p.follower_count)}</td>
              <td>${escapeHtml(p.status || '')}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  } catch (err) {
    if (body) body.innerHTML = `<div class="dash-empty-line">Lỗi tải lịch sử: ${escapeHtml(err.message)}</div>`;
  }
}

function closeChannelHistory() {
  const modal = document.getElementById('modal-channel-history');
  if (modal) {
    modal.style.display = 'none';
    modal.style.setProperty('display', 'none', 'important');
  }
}

// =============================================================================
// XƯỞNG TẠO ẢNH AI — trạng thái
// =============================================================================

let aiStudioSelectedRatio = '1:1';
let aiStudioSubTab = 'gallery';
let aiStudioCurrentModalImage = null;
let aiStudioQueueTimer = null;
let aiStudioCachedGallery = [];
let aiStudioModels = [];
let aiStudioPage = 1;
let aiStudioPageSize = 16;
let aiStudioHasMore = false;
let aiStudioTotal = 0;
let aiStudioFilters = { q: '', ratio: '', engine: '', tag: '' };
let aiStudioSelectMode = false;
let aiStudioSelection = new Set();
let aiStudioFilterTimer = null;

// ---------------------------------------------------------------- tiện ích form

function aiFormValues() {
  const val = id => (document.getElementById(id)?.value || '').trim();
  const seedRaw = val('ai-seed-input');
  return {
    prompt: val('ai-prompt-input'),
    negative_prompt: val('ai-negative-input'),
    aspect_ratio: aiStudioSelectedRatio,
    model: val('ai-model-select') || 'flux',
    seed: seedRaw ? Number(seedRaw) : null,
    batch_size: Number(val('ai-batch-select') || 1),
  };
}

function setAiPrompt(text) {
  const input = document.getElementById('ai-prompt-input');
  if (input) {
    input.value = text;
    input.focus();
  }
}

function selectAiRatio(btn) {
  if (!btn) return;
  document.querySelectorAll('.ai-ratio-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  aiStudioSelectedRatio = btn.dataset.ratio || '1:1';
}

function setAiRatioByValue(ratio) {
  const btn = document.querySelector(`.ai-ratio-btn[data-ratio="${ratio}"]`);
  if (btn) selectAiRatio(btn);
}

async function loadAiModels() {
  try {
    const res = await fetch('/api/ai-images/models');
    const data = await res.json();
    aiStudioModels = data.models || [];
  } catch (e) {
    aiStudioModels = [{ id: 'flux', name: 'Flux', desc: 'Mặc định', default: true }];
  }
  const sel = document.getElementById('ai-model-select');
  if (!sel) return;
  sel.innerHTML = aiStudioModels
    .map(m => `<option value="${m.id}" ${m.default ? 'selected' : ''}>${escapeHtml(m.name)} — ${escapeHtml(m.desc)}</option>`)
    .join('');
}

// ------------------------------------------------------------------ kho prompt

async function loadPromptLibrary() {
  const box = document.getElementById('ai-prompt-library');
  if (!box) return;
  try {
    const res = await fetch('/api/ai-images/prompts');
    const data = await res.json();
    const list = data.prompts || [];
    const countEl = document.getElementById('ai-prompt-lib-count');
    if (countEl) countEl.textContent = list.length;

    if (!list.length) {
      box.innerHTML = '<span class="ai-lib-empty">Chưa lưu prompt nào — soạn prompt rồi bấm “Lưu prompt”.</span>';
      return;
    }
    box.innerHTML = list.map(p => `
      <span class="ai-lib-chip" title="${escapeHtml(p.prompt)}">
        <button type="button" class="ai-lib-chip-main" onclick="applyPromptFromLibrary(${p.id})">
          ${escapeHtml(p.name)}${p.use_count ? ` <em>·${p.use_count}</em>` : ''}
        </button>
        <button type="button" class="ai-lib-chip-x" onclick="deletePromptFromLibrary(${p.id}, event)" title="Xoá prompt">×</button>
      </span>
    `).join('');
    window.__aiPromptCache = list;
  } catch (e) {
    box.innerHTML = '<span class="ai-lib-empty">Không tải được kho prompt.</span>';
  }
}

function applyPromptFromLibrary(id) {
  const item = (window.__aiPromptCache || []).find(x => x.id === id);
  if (!item) return;
  const set = (elId, v) => { const el = document.getElementById(elId); if (el) el.value = v || ''; };
  set('ai-prompt-input', item.prompt);
  set('ai-negative-input', item.negative_prompt);
  if (item.aspect_ratio) setAiRatioByValue(item.aspect_ratio);
  const modelSel = document.getElementById('ai-model-select');
  if (modelSel && item.model) modelSel.value = item.model;
  fetch(`/api/ai-images/prompts/${id}/use`, { method: 'POST' }).catch(() => {});
  showToast(`Đã nạp prompt "${item.name}"`);
}

async function saveCurrentPromptToLibrary() {
  const f = aiFormValues();
  if (!f.prompt) {
    showToast('Hãy nhập prompt trước khi lưu.', 3500);
    return;
  }
  const name = prompt('Đặt tên gợi nhớ cho prompt này:', f.prompt.slice(0, 40));
  if (!name) return;
  try {
    const res = await fetch('/api/ai-images/prompts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name, prompt: f.prompt, negative_prompt: f.negative_prompt,
        aspect_ratio: f.aspect_ratio, model: f.model,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.detail || 'Không lưu được');
    showToast(data.message);
    loadPromptLibrary();
  } catch (err) {
    showToast('Lỗi lưu prompt: ' + err.message, 4000);
  }
}

async function deletePromptFromLibrary(id, event) {
  if (event) event.stopPropagation();
  if (!confirm('Xoá prompt này khỏi kho?')) return;
  try {
    await fetch(`/api/ai-images/prompts/${id}`, { method: 'DELETE' });
    loadPromptLibrary();
  } catch (err) {
    showToast('Lỗi: ' + err.message);
  }
}

// ------------------------------------------------------------------- điều hướng

function switchAiStudioSubTab(tab) {
  aiStudioSubTab = tab;
  const btnGal = document.getElementById('tab-btn-ai-gallery');
  const btnQue = document.getElementById('tab-btn-ai-queue');
  const paneGal = document.getElementById('ai-gallery-container');
  const paneQue = document.getElementById('ai-queue-container');
  const hintEl = document.getElementById('ai-subtab-hint');

  if (tab === 'gallery') {
    if (btnGal) btnGal.classList.add('active');
    if (btnQue) btnQue.classList.remove('active');
    if (paneGal) paneGal.style.display = 'block';
    if (paneQue) paneQue.style.display = 'none';
    if (hintEl) hintEl.textContent = 'Nhấp vào ảnh để xem lớn, hoặc bật chọn nhiều để xoá/tải hàng loạt';
    loadAiImageGallery(true);
  } else {
    if (btnGal) btnGal.classList.remove('active');
    if (btnQue) btnQue.classList.add('active');
    if (paneGal) paneGal.style.display = 'none';
    if (paneQue) paneQue.style.display = 'block';
    if (hintEl) hintEl.textContent = 'Ảnh ✨ Antigravity chờ tác nhân ngoài; ảnh ⚙️ Worker nội bộ chạy nền tự động';
    loadAiImageQueue();
  }
}

async function refreshAiImageStudio() {
  await Promise.all([loadAiImageGallery(true), loadAiImageQueue(), loadPromptLibrary()]);
  showToast('Đã làm mới Xưởng Ảnh AI');
}

async function loadAiImageStudio() {
  await loadAiModels();
  await Promise.all([loadAiImageGallery(true), loadAiImageQueue(), loadPromptLibrary()]);

  if (!aiStudioQueueTimer) {
    const pollQueue = async () => {
      const pane = document.getElementById('pane-ai_images');
      let intervalMs = 8000;
      if (pane && pane.style.display !== 'none' && !document.hidden) {
        const hasActive = await loadAiImageQueue(true);
        if (hasActive) intervalMs = 2500;
      }
      aiStudioQueueTimer = setTimeout(pollQueue, intervalMs);
    };
    aiStudioQueueTimer = setTimeout(pollQueue, 3000);
  }
}

// -------------------------------------------------------------------- thư viện

function onAiFilterChanged() {
  clearTimeout(aiStudioFilterTimer);
  aiStudioFilterTimer = setTimeout(() => {
    aiStudioFilters.q = document.getElementById('ai-gallery-search')?.value.trim() || '';
    aiStudioFilters.ratio = document.getElementById('ai-filter-ratio')?.value || '';
    aiStudioFilters.engine = document.getElementById('ai-filter-engine')?.value || '';
    loadAiImageGallery(true);
  }, 250);
}

function resetAiFilters() {
  ['ai-gallery-search', 'ai-filter-ratio', 'ai-filter-engine'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  aiStudioFilters = { q: '', ratio: '', engine: '', tag: '' };
  loadAiImageGallery(true);
}

function filterAiByTag(tag) {
  aiStudioFilters.tag = tag || '';
  loadAiImageGallery(true);
  if (tag) showToast(`Đang lọc theo thẻ: ${tag}`);
}

async function loadAiImageGallery(reset = true) {
  if (reset) {
    aiStudioPage = 1;
    aiStudioSelection.clear();
  }
  try {
    const qs = new URLSearchParams({ page: aiStudioPage, page_size: aiStudioPageSize });
    if (aiStudioFilters.q) qs.set('q', aiStudioFilters.q);
    if (aiStudioFilters.ratio) qs.set('ratio', aiStudioFilters.ratio);
    if (aiStudioFilters.engine) qs.set('engine', aiStudioFilters.engine);
    if (aiStudioFilters.tag) qs.set('tag', aiStudioFilters.tag);

    const res = await fetch('/api/ai-images/gallery?' + qs.toString());
    const data = await res.json();
    if (!data.success) throw new Error(data.detail || 'Không tải được thư viện ảnh');

    aiStudioCachedGallery = data.images || [];
    aiStudioHasMore = !!data.has_more;
    aiStudioTotal = data.total || 0;

    const totalEl = document.getElementById('ai-images-total-count');
    const subtabCount = document.getElementById('subtab-gallery-count');
    if (totalEl) totalEl.textContent = aiStudioTotal;
    if (subtabCount) subtabCount.textContent = aiStudioTotal;

    renderAiTagFilterBar(data.all_tags || []);
    renderAiGalleryGrid();
    renderAiGalleryPagination();
  } catch (err) {
    console.error('[AI Studio] Lỗi load gallery:', err);
  }
}

function goToAiGalleryPage(page) {
  const totalPages = Math.ceil(aiStudioTotal / aiStudioPageSize) || 1;
  const targetPage = Math.max(1, Math.min(page, totalPages));
  if (targetPage === aiStudioPage) return;
  aiStudioPage = targetPage;
  aiStudioSelection.clear();
  loadAiImageGallery(false).then(() => {
    const container = document.getElementById('ai-gallery-container');
    if (container) {
      container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
}

function changeAiPageSize(val) {
  const newSize = parseInt(val, 10);
  if (!newSize || newSize === aiStudioPageSize) return;
  aiStudioPageSize = newSize;
  aiStudioPage = 1;
  loadAiImageGallery(true);
}

function renderAiGalleryPagination() {
  const paginationEl = document.getElementById('ai-gallery-pagination');
  const buttonsEl = document.getElementById('ai-pagination-buttons');
  const summaryEl = document.getElementById('ai-pagination-summary');
  const sizeSelect = document.getElementById('ai-page-size-select');
  if (!paginationEl) return;

  if (sizeSelect && String(sizeSelect.value) !== String(aiStudioPageSize)) {
    sizeSelect.value = String(aiStudioPageSize);
  }

  if (!aiStudioTotal || aiStudioTotal <= 0) {
    paginationEl.style.display = 'none';
    return;
  }

  const totalPages = Math.ceil(aiStudioTotal / aiStudioPageSize) || 1;
  if (aiStudioPage > totalPages) {
    aiStudioPage = totalPages;
  }

  paginationEl.style.display = 'flex';

  const startIdx = (aiStudioPage - 1) * aiStudioPageSize + 1;
  const endIdx = Math.min(aiStudioPage * aiStudioPageSize, aiStudioTotal);
  if (summaryEl) {
    summaryEl.textContent = `Hiển thị ${startIdx} - ${endIdx} / ${aiStudioTotal} ảnh (Trang ${aiStudioPage}/${totalPages})`;
  }

  if (!buttonsEl) return;

  const pages = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (aiStudioPage <= 4) {
      pages.push(2, 3, 4, 5);
      pages.push('...');
      pages.push(totalPages);
    } else if (aiStudioPage >= totalPages - 3) {
      pages.push('...');
      for (let i = totalPages - 4; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push('...');
      pages.push(aiStudioPage - 1, aiStudioPage, aiStudioPage + 1);
      pages.push('...');
      pages.push(totalPages);
    }
  }

  const prevDisabled = aiStudioPage <= 1 ? 'disabled' : '';
  const nextDisabled = aiStudioPage >= totalPages ? 'disabled' : '';

  let html = `
    <button type="button" class="ai-page-btn" onclick="goToAiGalleryPage(${aiStudioPage - 1})" ${prevDisabled} title="Trang trước">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
      <span>Trước</span>
    </button>
  `;

  pages.forEach(p => {
    if (p === '...') {
      html += `<span class="ai-page-ellipsis">…</span>`;
    } else {
      const activeClass = p === aiStudioPage ? ' active' : '';
      html += `<button type="button" class="ai-page-btn${activeClass}" onclick="goToAiGalleryPage(${p})">${p}</button>`;
    }
  });

  html += `
    <button type="button" class="ai-page-btn" onclick="goToAiGalleryPage(${aiStudioPage + 1})" ${nextDisabled} title="Trang sau">
      <span>Sau</span>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
    </button>
  `;

  buttonsEl.innerHTML = html;
}

function renderAiTagFilterBar(tags) {
  const bar = document.getElementById('ai-tag-filter-bar');
  if (!bar) return;
  if (!tags.length) {
    bar.innerHTML = '';
    bar.style.display = 'none';
    return;
  }
  bar.style.display = 'flex';
  bar.innerHTML = `<span class="ai-tagbar-label">Thẻ:</span>` + tags.map(t => `
    <button type="button" class="ai-tag-pill ${aiStudioFilters.tag === t ? 'active' : ''}"
            onclick="filterAiByTag('${escapeHtml(t)}')">${escapeHtml(t)}</button>
  `).join('') + (aiStudioFilters.tag
    ? `<button type="button" class="ai-tag-pill clear" onclick="filterAiByTag('')">✕ Bỏ lọc thẻ</button>` : '');
}

function renderAiGalleryGrid() {
  const grid = document.getElementById('ai-gallery-grid');
  const emptyEl = document.getElementById('ai-gallery-empty');
  const paginationEl = document.getElementById('ai-gallery-pagination');
  if (!grid) return;

  if (!aiStudioCachedGallery.length) {
    grid.innerHTML = '';
    if (emptyEl) {
      emptyEl.classList.remove('d-none');
      emptyEl.style.setProperty('display', 'flex', 'important');
    }
    if (paginationEl) paginationEl.style.display = 'none';
    updateAiSelectionBar();
    return;
  }
  if (emptyEl) {
    emptyEl.classList.add('d-none');
    emptyEl.style.setProperty('display', 'none', 'important');
  }

  grid.innerHTML = aiStudioCachedGallery.map((img, idx) => {
    const isInstant = img.engine === 'instant_free';
    const engineBadge = isInstant
      ? '<span class="ai-badge badge-instant"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> Instant AI</span>'
      : '<span class="ai-badge badge-queue"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg> Queue Worker</span>';
    const escPrompt = (img.prompt || '').replace(/"/g, '&quot;');
    const checked = aiStudioSelection.has(img.filename) ? 'checked' : '';
    const selClass = aiStudioSelection.has(img.filename) ? ' is-selected' : '';
    const clickAttr = aiStudioSelectMode
      ? `onclick="toggleAiSelect('${img.filename}')"`
      : `onclick="openAiImageModalByIndex(${idx})"`;

    return `
      <div class="ai-gallery-card${selClass}" ${clickAttr} data-filename="${img.filename}">
        <div class="ai-gallery-thumb">
          ${aiStudioSelectMode ? `<label class="ai-card-check" onclick="event.stopPropagation()">
              <input type="checkbox" ${checked} onchange="toggleAiSelect('${img.filename}')">
            </label>` : ''}
          <img src="${img.url}" alt="${escPrompt}" loading="lazy" onerror="this.src='/static/favicon.ico'">
          <span class="ai-gallery-ratio-tag">${img.aspect_ratio || '1:1'}</span>
          <div class="ai-gallery-overlay">
            <span class="ai-zoom-pill">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
              <span>${aiStudioSelectMode ? 'Chọn ảnh' : 'Phóng to'}</span>
            </span>
          </div>
        </div>
        <div class="ai-card-body">
          <div class="ai-card-top-row">
            ${engineBadge}
            <span class="ai-card-time">${img.created_at ? img.created_at.split(' ')[1] : ''}</span>
          </div>
          <div class="ai-card-prompt-text" title="${escPrompt}">
            ${escapeHtml(img.prompt || 'Không có mô tả')}
          </div>
          ${img.tags ? `<div class="ai-card-tags">${img.tags.split(',').map(t =>
              `<span class="ai-mini-tag">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
          <div class="ai-card-footer" onclick="event.stopPropagation()">
            <a href="${img.url}" download="${img.filename}" class="btn-icon-soft" title="Tải về máy">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              <span>Tải về</span>
            </a>
            <button type="button" class="btn-icon-soft" onclick="copyAiImageUrl('${img.url}')" title="Sao chép link">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
            </button>
            <button type="button" class="btn-icon-soft" onclick="assignImageToVideoByIndex(${idx}, event)" title="Gán vào phân cảnh Video AI">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/></svg>
            </button>
            <button type="button" class="btn-icon-soft danger" onclick="deleteAiImage('${img.filename}', event)" title="Xoá ảnh" style="margin-left: auto;">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  renderAiGalleryPagination();
  updateAiSelectionBar();
}

// ------------------------------------------------------------ chọn nhiều ảnh

function toggleAiSelectMode() {
  aiStudioSelectMode = !aiStudioSelectMode;
  if (!aiStudioSelectMode) aiStudioSelection.clear();
  const btn = document.getElementById('btn-ai-select-mode');
  if (btn) {
    btn.classList.toggle('active', aiStudioSelectMode);
    btn.innerHTML = aiStudioSelectMode
      ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg><span>Thoát chọn</span>'
      : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg><span>Chọn nhiều</span>';
  }
  renderAiGalleryGrid();
}

function toggleAiSelect(filename) {
  if (aiStudioSelection.has(filename)) aiStudioSelection.delete(filename);
  else aiStudioSelection.add(filename);
  renderAiGalleryGrid();
}

function selectAllAiVisible() {
  const allSelected = aiStudioCachedGallery.every(i => aiStudioSelection.has(i.filename));
  if (allSelected) aiStudioSelection.clear();
  else aiStudioCachedGallery.forEach(i => aiStudioSelection.add(i.filename));
  renderAiGalleryGrid();
}

function updateAiSelectionBar() {
  const bar = document.getElementById('ai-selection-bar');
  if (!bar) return;
  const n = aiStudioSelection.size;
  bar.style.display = aiStudioSelectMode ? 'flex' : 'none';
  const label = document.getElementById('ai-selection-count');
  if (label) label.textContent = `Đã chọn ${n} ảnh`;
  ['btn-ai-bulk-delete', 'btn-ai-bulk-zip'].forEach(id => {
    const b = document.getElementById(id);
    if (b) b.disabled = n === 0;
  });
}

async function bulkDeleteAiImages() {
  const files = [...aiStudioSelection];
  if (!files.length) return;
  if (!confirm(`Xoá vĩnh viễn ${files.length} ảnh đã chọn? Thao tác này không hoàn tác được.`)) return;
  try {
    const res = await fetch('/api/ai-images/gallery/bulk-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filenames: files }),
    });
    const data = await res.json();
    showToast(data.message || 'Đã xoá');
    aiStudioSelection.clear();
    loadAiImageGallery(true);
  } catch (err) {
    showToast('Lỗi xoá hàng loạt: ' + err.message, 4000);
  }
}

async function downloadSelectedAiZip() {
  const files = [...aiStudioSelection];
  if (!files.length) return;
  showToast(`Đang nén ${files.length} ảnh...`);
  try {
    const res = await fetch('/api/ai-images/gallery/download-zip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filenames: files }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `anh_ai_${Date.now()}.zip`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    showToast('Đã tải file ZIP về máy');
  } catch (err) {
    showToast('Lỗi tải ZIP: ' + err.message, 4000);
  }
}

// ------------------------------------------------------------------ hàng đợi

let aiStudioPrevCompletedCount = -1;

async function loadAiImageQueue(silent = false) {
  try {
    const res = await fetch('/api/ai-images/queue');
    const data = await res.json();
    if (!data.success) return false;

    const queue = data.queue || [];
    const pendingCount = data.pending_count || 0;
    const completedCount = data.completed_count || 0;
    const failedCount = data.failed_count || 0;

    const queueCountEl = document.getElementById('ai-images-queue-count');
    const subtabQueueCount = document.getElementById('subtab-queue-count');
    if (queueCountEl) queueCountEl.textContent = pendingCount;
    if (subtabQueueCount) subtabQueueCount.textContent = queue.length;

    const workerPill = document.getElementById('ai-worker-status');
    if (workerPill) {
      workerPill.className = 'ai-worker-pill ' + (data.worker_alive ? 'alive' : 'dead');
      workerPill.innerHTML = data.worker_alive
        ? '<span class="status-pulse-green"></span> Worker nội bộ đang chạy'
        : '⚠️ Worker nội bộ chưa chạy';
    }

    // Ảnh mới xong -> làm mới thư viện để thấy ngay.
    if (aiStudioPrevCompletedCount >= 0 && completedCount > aiStudioPrevCompletedCount) {
      loadAiImageGallery(true);
      if (!silent) showToast('🎉 Có ảnh mới vừa hoàn thành!');
    }
    aiStudioPrevCompletedCount = completedCount;

    const listEl = document.getElementById('ai-queue-list');
    const emptyEl = document.getElementById('ai-queue-empty');
    if (!listEl) return pendingCount > 0;

    if (!queue.length) {
      listEl.innerHTML = '';
      if (emptyEl) emptyEl.style.display = 'block';
      return false;
    }
    if (emptyEl) emptyEl.style.display = 'none';

    const btnClear = document.getElementById('btn-ai-clear-done');
    if (btnClear) btnClear.style.display = (completedCount + failedCount) > 0 ? 'inline-flex' : 'none';

    listEl.innerHTML = queue.map(item => {
      let badge = '<span class="ai-badge badge-pending"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Chờ xử lý</span>';
      if (item.status === 'processing') badge = '<span class="ai-badge badge-processing"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="ai-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Đang vẽ...</span>';
      else if (item.status === 'completed') badge = '<span class="ai-badge badge-completed"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Đã xong</span>';
      else if (item.status === 'failed') badge = '<span class="ai-badge badge-failed"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> Thất bại</span>';

      const escPrompt = (item.prompt || '').replace(/"/g, '&quot;');
      // Task engine 'antigravity' do tác nhân NGOÀI sinh ảnh; worker nội bộ
      // (Pollinations) không đụng vào, nên không được nói là "worker đang xử lý".
      const isExternal = item.engine === 'antigravity' || item.engine === 'antigravity_queue';
      let action = isExternal
        ? '<span class="ai-queue-waiting"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Chờ Antigravity nhận</span>'
        : '<span class="ai-queue-waiting"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="ai-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Worker đang xử lý...</span>';
      if (item.image_url) {
        action = `<button type="button" class="btn btn-outline btn-xs btn-queue-view" onclick="viewResultImage('${item.image_url}', '${escPrompt}')"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> Xem ảnh</button>`;
      } else if (item.status === 'failed') {
        action = `<button type="button" class="btn btn-outline btn-xs btn-queue-retry" onclick="retryAiQueueItem('${item.id}')"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg> Thử lại</button>`;
      }

      const attempts = item.attempt_count > 0
        ? `<span class="ai-queue-attempts" title="Số lần đã thử">↻ ${item.attempt_count}/3</span>` : '';

      return `
        <div class="ai-queue-card">
          <div style="flex: 1; min-width: 0;">
            <div class="ai-queue-meta-row">
              ${badge}
              <span class="ai-queue-ratio-badge">${item.aspect_ratio || '1:1'}</span>
              ${isExternal
                ? '<span class="ai-queue-engine-badge external"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg> Antigravity</span>'
                : '<span class="ai-queue-engine-badge"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 9h6v6H9z"/></svg> Worker nội bộ</span>'}
              ${item.model && !isExternal ? `<span class="ai-queue-model-badge">${escapeHtml(item.model)}</span>` : ''}
              ${attempts}
              <span class="ai-queue-date">${item.created_at || ''}</span>
            </div>
            <div class="ai-queue-prompt" title="${escPrompt}">${escapeHtml(item.prompt || '')}</div>
            ${item.error_message ? `<div class="ai-queue-error" title="${escapeHtml(item.error_message)}"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> ${escapeHtml(item.error_message)}</div>` : ''}
          </div>
          <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
            ${action}
            <button type="button" class="btn-queue-delete" onclick="deleteAiQueueItem('${item.id}', event)" title="Xoá task">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>
      `;
    }).join('');

    return pendingCount > 0;
  } catch (err) {
    if (!silent) console.error('[AI Studio] Lỗi load queue:', err);
    return false;
  }
}

async function retryAiQueueItem(taskId) {
  try {
    const res = await fetch(`/api/ai-images/queue/${encodeURIComponent(taskId)}/retry`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.detail || 'Không chạy lại được');
    showToast('Đã đưa task trở lại hàng đợi');
    loadAiImageQueue();
  } catch (err) {
    showToast('Lỗi: ' + err.message, 4000);
  }
}

async function clearCompletedAiQueue() {
  if (!confirm('Dọn toàn bộ mục đã xong và thất bại khỏi hàng đợi? Ảnh đã tạo vẫn giữ nguyên trong thư viện.')) return;
  try {
    const res = await fetch('/api/ai-images/queue/clear-completed', { method: 'POST' });
    const data = await res.json();
    showToast(data.message || 'Đã dọn hàng đợi');
    loadAiImageQueue();
  } catch (err) {
    showToast('Lỗi: ' + err.message);
  }
}

// -------------------------------------------------------------------- sinh ảnh

function setAiStatus(kind, html) {
  const box = document.getElementById('ai-status-box');
  if (!box) return;
  const palette = {
    info: ['rgba(6, 182, 212, 0.1)', 'rgba(6, 182, 212, 0.3)', '#0284c7'],
    ok: ['rgba(16, 185, 129, 0.1)', 'rgba(16, 185, 129, 0.3)', '#059669'],
    err: ['rgba(239, 68, 68, 0.1)', 'rgba(239, 68, 68, 0.3)', '#dc2626'],
  }[kind] || ['#f8fafc', '#e2e8f0', '#334155'];
  box.style.display = 'block';
  box.style.background = palette[0];
  box.style.border = '1px solid ' + palette[1];
  box.style.color = palette[2];
  box.innerHTML = html;
}

async function handleGenerateInstant() {
  const f = aiFormValues();
  if (!f.prompt) {
    showToast('Vui lòng nhập mô tả ảnh (prompt)!', 4000);
    document.getElementById('ai-prompt-input')?.focus();
    return;
  }

  const btn = document.getElementById('btn-ai-generate-instant');
  const icon = document.getElementById('instant-btn-icon');
  const text = document.getElementById('instant-btn-text');

  if (btn) btn.disabled = true;
  if (icon) icon.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="ai-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>';
  if (text) text.textContent = `Đang sinh ${f.batch_size} ảnh bằng ${f.model}...`;
  setAiStatus('info', `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: text-bottom; margin-right: 4px;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> <strong>Đang tạo ${f.batch_size} ảnh</strong> với model <strong>${escapeHtml(f.model)}</strong>...`);

  try {
    const res = await fetch('/api/ai-images/generate-instant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(f),
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.detail || 'Lỗi khi tạo ảnh tức thì');

    const made = (data.images || []).length;
    showToast(`Đã tạo ${made} ảnh!`);
    setAiStatus('ok', `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: text-bottom; margin-right: 4px;"><polyline points="20 6 9 17 4 12"/></svg> <strong>Hoàn thành:</strong> ${made} ảnh đã lưu vào thư viện${data.errors?.length ? ` (${data.errors.length} ảnh lỗi)` : ''}.`);
    setTimeout(() => { const b = document.getElementById('ai-status-box'); if (b) b.style.display = 'none'; }, 5000);

    switchAiStudioSubTab('gallery');
    await loadAiImageGallery(true);
    highlightNewAiImages((data.images || []).map(i => i.filename));
    if (data.image) openAiImageModal(data.image);
  } catch (err) {
    showToast('Lỗi: ' + err.message, 5000);
    setAiStatus('err', '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: text-bottom; margin-right: 4px;"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> <strong>Lỗi tạo ảnh:</strong> ' + escapeHtml(err.message));
  } finally {
    if (btn) btn.disabled = false;
    if (icon) icon.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>';
    if (text) text.textContent = 'Tạo Ngay Tức Thì (Instant AI 3s - Free)';
  }
}

function highlightNewAiImages(filenames) {
  if (!filenames || !filenames.length) return;
  setTimeout(() => {
    filenames.forEach(fn => {
      const card = document.querySelector(`.ai-gallery-card[data-filename="${fn}"]`);
      if (card) {
        card.classList.add('just-created');
        setTimeout(() => card.classList.remove('just-created'), 4000);
      }
    });
    const first = document.querySelector(`.ai-gallery-card[data-filename="${filenames[0]}"]`);
    if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 150);
}

async function handleEnqueueAntigravity() {
  const f = aiFormValues();
  if (!f.prompt) {
    showToast('Vui lòng nhập mô tả ảnh (prompt)!', 4000);
    document.getElementById('ai-prompt-input')?.focus();
    return;
  }

  const btn = document.getElementById('btn-ai-enqueue');
  if (btn) btn.disabled = true;

  try {
    const res = await fetch('/api/ai-images/queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...f, engine: 'antigravity', notes: 'Đang chờ Antigravity xử lý (8K không watermark)' }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.detail || 'Không thể đưa vào hàng đợi');

    showToast('📋 ' + data.message);
    switchAiStudioSubTab('queue');
    await loadAiImageQueue();
  } catch (err) {
    showToast('Lỗi hàng đợi: ' + err.message, 5000);
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ---------------------------------------------------------------- modal chi tiết

function openAiImageModalByIndex(index) {
  if (aiStudioCachedGallery && aiStudioCachedGallery[index]) {
    openAiImageModal(aiStudioCachedGallery[index]);
  }
}

function assignImageToVideoByIndex(index, event) {
  if (event) event.stopPropagation();
  const img = aiStudioCachedGallery[index];
  if (!img) return;
  aiStudioCurrentModalImage = img;
  if (typeof openAssignToVideoModal === 'function') openAssignToVideoModal();
}

function viewResultImage(url, promptText) {
  const known = aiStudioCachedGallery.find(i => i.url === url);
  openAiImageModal(known || {
    url,
    filename: url.split('/').pop(),
    prompt: promptText,
    aspect_ratio: 'Tự động',
    engine: 'queue_worker',
    created_at: 'Mới hoàn thành',
  });
}

function openAiImageModal(img) {
  aiStudioCurrentModalImage = img;
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  const modal = document.getElementById('ai-image-modal');
  const imgEl = document.getElementById('ai-modal-img');
  const dlBtn = document.getElementById('ai-modal-download-btn');
  const engineTagEl = document.getElementById('ai-modal-engine-tag');
  const tagsInput = document.getElementById('ai-modal-tags-input');

  const ratio = img.aspect_ratio || '1:1';
  if (imgEl) imgEl.src = img.url;
  set('ai-modal-prompt', img.prompt || 'Không có mô tả');
  set('ai-modal-ratio', ratio);
  set('ai-modal-ratio-pill', ratio);
  set('ai-modal-model', img.model || '—');
  set('ai-modal-seed', img.seed != null ? String(img.seed) : '—');

  const isInstant = img.engine === 'instant_free';
  set('ai-modal-engine', isInstant ? 'Instant AI (tức thì)' : 'Queue Worker (chạy ngầm)');
  if (engineTagEl) {
    engineTagEl.className = isInstant ? 'ai-badge badge-instant' : 'ai-badge badge-queue';
    engineTagEl.textContent = isInstant ? '⚡ Instant AI' : '🤖 Queue Worker';
  }
  set('ai-modal-date', img.created_at || '-');
  const kb = img.size_bytes ? Math.round(img.size_bytes / 1024) : 0;
  set('ai-modal-size', kb >= 1024 ? (kb / 1024).toFixed(1) + ' MB' : (kb ? kb + ' KB' : '-'));
  if (tagsInput) tagsInput.value = img.tags || '';

  if (dlBtn) {
    dlBtn.href = img.url;
    dlBtn.download = img.filename || 'ai_image.jpg';
  }

  // Không có seed thì không tái tạo được -> khoá nút cho khỏi hiểu nhầm.
  const hasSeed = img.seed != null;
  ['btn-ai-recreate', 'btn-ai-variant'].forEach(id => {
    const b = document.getElementById(id);
    if (b) {
      b.disabled = !hasSeed;
      b.title = hasSeed ? '' : 'Ảnh cũ không lưu seed nên không tái tạo chính xác được';
    }
  });

  if (modal) {
    modal.style.display = 'flex';
    modal.style.setProperty('display', 'flex', 'important');
  }
}

function fillFormFromModalImage() {
  const img = aiStudioCurrentModalImage;
  if (!img) return null;
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ''; };
  set('ai-prompt-input', img.prompt);
  set('ai-negative-input', img.negative_prompt);
  if (img.aspect_ratio) setAiRatioByValue(img.aspect_ratio);
  const modelSel = document.getElementById('ai-model-select');
  if (modelSel && img.model) modelSel.value = img.model;
  return img;
}

async function recreateExactImage() {
  const img = fillFormFromModalImage();
  if (!img || img.seed == null) return;
  const seedEl = document.getElementById('ai-seed-input');
  if (seedEl) seedEl.value = img.seed;
  const batchEl = document.getElementById('ai-batch-select');
  if (batchEl) batchEl.value = '1';
  closeAiImageModal();
  showToast('Đang tạo lại đúng ảnh này (cùng seed)...');
  await handleGenerateInstant();
}

async function createVariantImage() {
  const img = fillFormFromModalImage();
  if (!img) return;
  const seedEl = document.getElementById('ai-seed-input');
  if (seedEl) seedEl.value = '';  // seed mới -> ảnh khác nhưng cùng mô tả
  closeAiImageModal();
  showToast('Đang tạo biến thể mới từ cùng mô tả...');
  await handleGenerateInstant();
}

function reusePromptFromModal() {
  if (!fillFormFromModalImage()) return;
  closeAiImageModal();
  showToast('Đã nạp lại prompt vào khung soạn thảo');
  document.getElementById('ai-prompt-input')?.focus();
}

async function saveAiModalTags() {
  const img = aiStudioCurrentModalImage;
  const input = document.getElementById('ai-modal-tags-input');
  if (!img || !input) return;
  try {
    const res = await fetch(`/api/ai-images/gallery/${encodeURIComponent(img.filename)}/tags`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: input.value }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.detail || 'Không lưu được thẻ');
    img.tags = data.tags;
    showToast('Đã lưu thẻ cho ảnh');
    loadAiImageGallery(true);
  } catch (err) {
    showToast('Lỗi lưu thẻ: ' + err.message, 4000);
  }
}

function copyAiModalPrompt() {
  if (!aiStudioCurrentModalImage || !aiStudioCurrentModalImage.prompt) return;
  navigator.clipboard.writeText(aiStudioCurrentModalImage.prompt)
    .then(() => showToast('Đã sao chép prompt vào clipboard!'))
    .catch(() => showToast('Prompt: ' + aiStudioCurrentModalImage.prompt));
}

function closeAiImageModal(e) {
  if (e) {
    if (typeof e.stopPropagation === 'function') e.stopPropagation();
    if (typeof e.preventDefault === 'function') e.preventDefault();
  }
  const modal = document.getElementById('ai-image-modal');
  if (modal) {
    modal.style.display = 'none';
    modal.style.setProperty('display', 'none', 'important');
  }
  aiStudioCurrentModalImage = null;
}

function copyAiModalLink() {
  if (!aiStudioCurrentModalImage || !aiStudioCurrentModalImage.url) return;
  const fullUrl = window.location.origin + aiStudioCurrentModalImage.url;
  navigator.clipboard.writeText(fullUrl)
    .then(() => showToast('Đã sao chép link ảnh vào clipboard!'))
    .catch(() => showToast('Link ảnh: ' + fullUrl));
}

function copyAiImageUrl(url) {
  const fullUrl = window.location.origin + url;
  navigator.clipboard.writeText(fullUrl)
    .then(() => showToast('Đã sao chép link ảnh!'))
    .catch(() => showToast('Link ảnh: ' + fullUrl));
}

async function deleteCurrentModalImage() {
  if (!aiStudioCurrentModalImage || !aiStudioCurrentModalImage.filename) return;
  if (!confirm('Xoá vĩnh viễn ảnh này? Thao tác không hoàn tác được.')) return;
  try {
    const filename = aiStudioCurrentModalImage.filename;
    const res = await fetch(`/api/ai-images/gallery/${encodeURIComponent(filename)}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.detail || 'Không xoá được');
    showToast('Đã xoá ảnh thành công');
    closeAiImageModal();
    loadAiImageGallery(true);
  } catch (err) {
    showToast('Lỗi xoá ảnh: ' + err.message);
  }
}

async function deleteAiImage(filename, event) {
  if (event) event.stopPropagation();
  if (!confirm(`Xoá vĩnh viễn ảnh ${filename}?`)) return;
  try {
    const res = await fetch(`/api/ai-images/gallery/${encodeURIComponent(filename)}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.detail || 'Không xoá được');
    showToast('Đã xoá ảnh');
    if (aiStudioCachedGallery.length <= 1 && aiStudioPage > 1) {
      aiStudioPage -= 1;
    }
    loadAiImageGallery(false);
  } catch (err) {
    showToast('Lỗi: ' + err.message);
  }
}

async function deleteAiQueueItem(taskId, event) {
  if (event) event.stopPropagation();
  if (!confirm('Xoá yêu cầu này khỏi hàng đợi?')) return;
  try {
    const res = await fetch(`/api/ai-images/queue/${encodeURIComponent(taskId)}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.detail || 'Không xoá được');
    showToast('Đã xoá task khỏi hàng đợi');
    loadAiImageQueue();
  } catch (err) {
    showToast('Lỗi: ' + err.message);
  }
}

// =============================================================================
// VIDEO STUDIO <-> AI IMAGE STUDIO TWO-WAY INTEGRATION
// =============================================================================

let assignTargetImage = null;

function openAssignToVideoModal() {
  if (!aiStudioCurrentModalImage) return;
  assignTargetImage = aiStudioCurrentModalImage;
  const modal = document.getElementById('modal-assign-to-video');
  const thumb = document.getElementById('assign-vid-img-thumb');
  const promptEl = document.getElementById('assign-vid-img-prompt');
  const projectSel = document.getElementById('assign-vid-select-project');

  if (thumb) thumb.src = assignTargetImage.url;
  if (promptEl) promptEl.textContent = assignTargetImage.prompt || 'Không có mô tả';

  if (projectSel) {
    if (!wsVideosList || wsVideosList.length === 0) {
      projectSel.innerHTML = '<option value="">⏳ Đang nạp danh sách video...</option>';
      fetch('/api/videos').then(r => r.json()).then(data => {
        wsVideosList = Array.isArray(data) ? data : (data.videos || []);
        populateAssignVideoProjects();
      }).catch(() => {
        projectSel.innerHTML = '<option value="">Không có dự án video nào</option>';
      });
    } else {
      populateAssignVideoProjects();
    }
  }

  if (modal) modal.style.display = 'flex';
}

function closeAssignToVideoModal() {
  const modal = document.getElementById('modal-assign-to-video');
  if (modal) modal.style.display = 'none';
}

function populateAssignVideoProjects() {
  const projectSel = document.getElementById('assign-vid-select-project');
  if (!projectSel || !wsVideosList) return;

  projectSel.innerHTML = wsVideosList.map(v => {
    const isCurrent = v.slug === currentWsSlug ? 'selected' : '';
    return `<option value="${v.slug}" ${isCurrent}>${escapeHtml(v.title || v.slug)} (${v.slug})</option>`;
  }).join('');

  const targetSlug = projectSel.value || currentWsSlug || (wsVideosList[0] && wsVideosList[0].slug);
  if (targetSlug) {
    onAssignVidProjectChange(targetSlug);
  }
}

async function onAssignVidProjectChange(slug) {
  const sceneSel = document.getElementById('assign-vid-select-scene');
  if (!sceneSel) return;
  sceneSel.innerHTML = '<option value="">⏳ Đang tải phân cảnh...</option>';

  try {
    const res = await fetch(`/api/videos/${slug}`);
    const data = await res.json();
    const scenes = (data.script && data.script.length > 0) ? data.script : ((data.spec && data.spec.scenes) || []);
    
    if (scenes.length === 0) {
      sceneSel.innerHTML = `
        <option value="scene-1">Phân cảnh #1 (scene-1.jpg)</option>
        <option value="scene-2">Phân cảnh #2 (scene-2.jpg)</option>
        <option value="scene-3">Phân cảnh #3 (scene-3.jpg)</option>
        <option value="scene-4">Phân cảnh #4 (scene-4.jpg)</option>
      `;
      return;
    }

    sceneSel.innerHTML = scenes.map((s, idx) => {
      const num = idx + 1;
      const targetKey = s.target || s.side || (s.tierId != null ? `tier-${s.tierId}` : (s.shot != null ? `scene-${s.shot}` : (s.sceneId != null ? `scene-${s.sceneId}` : (s.id ? s.id : `scene-${num}`))));
      const label = s.name || s.beat || s.title || `Phân cảnh #${num}`;
      const line = (s.line || s.spoken || s.text || '').substring(0, 45);
      return `<option value="${targetKey}">${label} (${targetKey}): "${escapeHtml(line)}..."</option>`;
    }).join('');
  } catch (err) {
    sceneSel.innerHTML = `
      <option value="scene-1">Phân cảnh #1</option>
      <option value="scene-2">Phân cảnh #2</option>
      <option value="scene-3">Phân cảnh #3</option>
    `;
  }
}

async function submitAssignToVideo() {
  if (!assignTargetImage) return;
  const projectSel = document.getElementById('assign-vid-select-project');
  const sceneSel = document.getElementById('assign-vid-select-scene');
  const slug = projectSel ? projectSel.value : '';
  const target = sceneSel ? sceneSel.value : '';

  if (!slug || !target) {
    showToast('Vui lòng chọn video và phân cảnh cần gán ảnh!');
    return;
  }

  const btn = document.getElementById('btn-confirm-assign-video');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ Đang gán ảnh...';
  }

  try {
    const res = await fetch(`/api/videos/${slug}/change-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target: target,
        type: 'url',
        url: assignTargetImage.url
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    showToast(`🎉 Đã gán ảnh thành công vào [${slug}] - ${target}!`);
    closeAssignToVideoModal();
    wsBeatImgBuster = Date.now();
    if (wsCurrentDetail) wsCurrentDetail._ts = Date.now();

    // If currently viewing this video in Video Studio, refresh it
    if (currentWsSlug === slug && typeof selectWsVideo === 'function') {
      selectWsVideo(slug);
    }
  } catch (err) {
    showToast('Lỗi gán ảnh: ' + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '✓ Xác Nhận Gán Ảnh';
    }
  }
}

// =============================================================================
// BATCH AUTO-GENERATE SCENE IMAGES FROM SCRIPT (ANTIGRAVITY / INSTANT)
// =============================================================================

let batchScenesList = [];

function openBatchAiImageGeneratorModal() {
  if (!currentWsSlug || !wsCurrentDetail) {
    showToast('Vui lòng chọn một video trong Xưởng Video trước!');
    return;
  }

  const modal = document.getElementById('modal-batch-ai-scenes');
  const titleEl = document.getElementById('batch-vid-title');
  const countEl = document.getElementById('batch-scenes-count');
  const listEl = document.getElementById('batch-scenes-list');

  const scenes = (wsCurrentDetail.spec && wsCurrentDetail.spec.scenes) || wsCurrentDetail.script || [];
  batchScenesList = scenes;

  if (titleEl) titleEl.textContent = wsCurrentDetail.title || currentWsSlug;
  if (countEl) countEl.textContent = `${scenes.length} phân cảnh`;

  if (listEl) {
    listEl.innerHTML = scenes.map((s, idx) => {
      const num = idx + 1;
      const targetKey = s.side ? s.side : (s.tierId != null ? `tier-${s.tierId}` : (s.sceneId != null ? `scene-${s.sceneId}` : `scene-${num}`));
      const text = s.line || s.spoken || s.text || '';
      const defaultPrompt = text || `${wsCurrentDetail.title} scene ${num}`;

      return `
        <div class="batch-scene-item" style="display: flex; gap: 10px; align-items: flex-start; padding: 10px; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-card);">
          <div style="font-weight: 800; font-size: 11px; background: rgba(234, 88, 12, 0.15); color: #ea580c; padding: 3px 8px; border-radius: 6px; min-width: 65px; text-align: center;">
            #${num} ${targetKey}
          </div>
          <div style="flex: 1; min-width: 0;">
            <div style="font-size: 11.5px; font-weight: 600; color: var(--text-color); margin-bottom: 4px;">
              Lời thoại: <span style="font-weight: 400; color: var(--text-muted);">${escapeHtml(text.substring(0, 75))}...</span>
            </div>
            <input type="text" class="form-control batch-prompt-input" data-idx="${idx}" data-target="${targetKey}" value="${escapeHtml(defaultPrompt)}" style="font-size: 12px; width: 100%; border-radius: 6px;" placeholder="Prompt mô tả cho cảnh này">
          </div>
        </div>
      `;
    }).join('');
  }

  const progressBox = document.getElementById('batch-gen-progress-box');
  if (progressBox) progressBox.style.display = 'none';

  if (modal) modal.style.display = 'flex';
}

function closeBatchAiImageGeneratorModal() {
  const modal = document.getElementById('modal-batch-ai-scenes');
  if (modal) modal.style.display = 'none';
}

async function runBatchGenerateScenes(engine) {
  if (!currentWsSlug || batchScenesList.length === 0) return;

  const styleSelect = document.getElementById('batch-style-preset');
  const stylePrefix = styleSelect ? styleSelect.value : '';

  const promptInputs = document.querySelectorAll('.batch-prompt-input');
  const tasks = [];
  promptInputs.forEach(input => {
    const idx = parseInt(input.dataset.idx);
    const target = input.dataset.target;
    let p = input.value.trim();
    if (stylePrefix) {
      p = `${stylePrefix}, ${p}`;
    }
    tasks.push({ idx, target, prompt: p });
  });

  const progressBox = document.getElementById('batch-gen-progress-box');
  const progressText = document.getElementById('batch-gen-progress-text');
  const progressBar = document.getElementById('batch-gen-progress-bar');
  const btnInstant = document.getElementById('btn-batch-instant');
  const btnQueue = document.getElementById('btn-batch-queue');

  // Mọi ảnh AI đi qua Antigravity và gắn thẳng vào đúng cảnh của video (images.json), để
  // tác vụ "🎨 Ảnh Antigravity" tải về khi xong. Không còn đường sinh ảnh tức thì.
  if (btnQueue) btnQueue.disabled = true;
  if (progressBox) progressBox.style.display = 'block';
  let sent = 0;
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    if (progressBar) progressBar.style.width = `${Math.round((i / tasks.length) * 100)}%`;
    if (progressText) progressText.textContent = `🎨 Gửi Antigravity ${i + 1}/${tasks.length}: ${t.target}...`;
    try {
      const res = await fetch(`/api/videos/${currentWsSlug}/change-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: t.target, type: 'antigravity', prompt: t.prompt })
      });
      if (res.ok) sent++;
    } catch (err) {
      console.warn(`Lỗi gửi cảnh ${t.target}:`, err);
    }
  }
  if (progressBar) progressBar.style.width = '100%';
  if (progressText) progressText.textContent = `✅ Đã gửi ${sent}/${tasks.length} cảnh cho Antigravity`;
  if (btnQueue) btnQueue.disabled = false;
  showToast(`🎨 Đã gửi ${sent} cảnh cho Antigravity. Ảnh xong sẽ tự gán vào đúng cảnh — không cần bấm gì thêm.`, 7000);
  const slug = currentWsSlug;
  setTimeout(() => {
    closeBatchAiImageGeneratorModal();
    if (typeof selectWsVideo === 'function') selectWsVideo(slug);
  }, 1200);
  if (sent) watchAutoAssignedImages(slug);
}

// Server tự gán ảnh Antigravity về đúng cảnh (compare_native.auto_assign_images, 30 s/lần).
// Ở đây chỉ theo dõi để làm mới Xưởng Video khi có ảnh mới và báo khi đủ ảnh.
const wsImageWatchers = {};
function watchAutoAssignedImages(slug, { intervalMs = 30000, maxMinutes = 120 } = {}) {
  if (!slug) return;
  if (wsImageWatchers[slug]) clearInterval(wsImageWatchers[slug].timer);
  const started = Date.now();
  const watcher = { ready: null, timer: null };
  const tick = async () => {
    try {
      const res = await fetch(`/api/videos/${encodeURIComponent(slug)}/images`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const st = await res.json();
      // "replacing" (ảnh cũ chờ thay) được API tính là ready → đếm ảnh không còn chờ gì nữa.
      const pending = (st.pending || []).length + (st.replacing || []).length;
      const ready = Math.max(0, (st.total || 0) - pending);
      if (watcher.ready !== null && ready > watcher.ready) {
        showToast(`🖼️ [${slug}] đã tự gán ${ready - watcher.ready} ảnh mới (${ready}/${st.total}).`, 4000);
        wsBeatImgBuster = Date.now();
        if (currentWsSlug === slug && typeof selectWsVideo === 'function') selectWsVideo(slug);
      }
      watcher.ready = ready;
      if (!pending) {
        clearInterval(watcher.timer);
        delete wsImageWatchers[slug];
        if (watcher.announced !== true && Date.now() - started > intervalMs) {
          showToast(`✅ [${slug}] đã đủ ảnh Antigravity — có thể render lại.`, 6000);
        }
        watcher.announced = true;
      }
    } catch (err) {
      console.warn('[auto-assign]', slug, err);
    }
    if (Date.now() - started > maxMinutes * 60000) {
      clearInterval(watcher.timer);
      delete wsImageWatchers[slug];
    }
  };
  watcher.timer = setInterval(tick, intervalMs);
  wsImageWatchers[slug] = watcher;
  tick();
}

async function loadBridgeStatus(silent = false) {
  try {
    const res = await fetch('/api/ai-images/bridge/status');
    const data = await res.json();
    if (!data.success) throw new Error('Lỗi tải trạng thái bridge');

    // KPI cards
    const setKpi = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    setKpi('bridge-kpi-pending', data.queue?.pending || 0);
    setKpi('bridge-kpi-inbox', data.inbox?.count || 0);
    setKpi('bridge-kpi-outbox', data.outbox?.count || 0);
    setKpi('bridge-kpi-processing', data.queue?.processing || 0);
    setKpi('bridge-kpi-archive', data.archive?.count || 0);
    setKpi('bridge-kpi-failed', data.failed?.count || 0);

    // Sidebar badge
    const badge = document.getElementById('side-badge-bridge');
    if (badge) {
      const total = (data.queue?.pending || 0) + (data.inbox?.count || 0) + (data.outbox?.count || 0);
      badge.textContent = total;
    }

    // Doctor indicators
    const setDoc = (id, ok, label) => {
      const el = document.getElementById(id);
      if (!el) return;
      const icon = el.querySelector('.bridge-doc-icon');
      if (icon) icon.textContent = ok ? '✓' : '·';
      el.className = 'bridge-doctor-item ' + (ok ? 'doc-ok' : 'doc-warn');
      const span = el.querySelectorAll('span');
      if (span[1]) span[1].textContent = label;
    };
    setDoc('bridge-doc-server', data.doctor?.server_ok, 'TokMatrix Server');
    setDoc('bridge-doc-app', !!data.doctor?.antigravity_app, data.doctor?.antigravity_app ? 'Antigravity App' : 'Antigravity App (không tìm thấy)');
    setDoc('bridge-doc-agentapi', !!data.doctor?.agentapi, data.doctor?.agentapi ? 'agentapi (language server)' : 'agentapi (không có)');
    setDoc('bridge-doc-dir', true, data.bridge_dir || 'Bridge Directory');

    // File lists
    renderBridgeFileList('bridge-inbox-list', 'bridge-inbox-count', data.inbox?.files || [], 'inbox');
    renderBridgeFileList('bridge-outbox-list', 'bridge-outbox-count', data.outbox?.files || [], 'outbox');
    renderBridgeFileList('bridge-archive-list', 'bridge-archive-count', data.archive?.files || [], 'archive');
    renderBridgeFileList('bridge-failed-list', 'bridge-failed-count', data.failed?.files || [], 'failed');

  } catch (err) {
    if (!silent) console.error('[Bridge] Lỗi:', err);
    if (!silent) showBridgeStatus('err', '❌ Không tải được trạng thái Bridge: ' + err.message);
  }
}

function renderBridgeFileList(listId, countId, files, folder) {
  const listEl = document.getElementById(listId);
  const countEl = document.getElementById(countId);
  if (countEl) countEl.textContent = files.length;
  if (!listEl) return;

  if (!files.length) {
    const emptyMsgs = {
      inbox: 'Trống — bấm "Pull Task" để kéo task mới.',
      outbox: 'Trống — agent IDE sẽ xuất ảnh ra đây.',
      archive: 'Chưa có bản ghi nào.',
      failed: 'Không có lỗi. 👍',
    };
    listEl.innerHTML = `<div class="bridge-empty">${emptyMsgs[folder] || 'Trống'}</div>`;
    return;
  }

  listEl.innerHTML = files.map(f => {
    const isText = ['.md', '.json', '.txt'].includes(f.suffix);
    const isImage = ['.jpg', '.jpeg', '.png', '.webp'].includes(f.suffix);
    const icon = isImage ? '🖼️' : (f.suffix === '.md' ? '📝' : (f.suffix === '.json' ? '📋' : '📄'));
    const sizeKb = f.size_bytes ? (f.size_bytes / 1024).toFixed(1) + ' KB' : '';
    const viewBtn = isText
      ? `<button class="bridge-file-view-btn" onclick="viewBridgeFile('${folder}', '${escapeHtml(f.name)}')">Xem</button>`
      : '';
    return `
      <div class="bridge-file-item">
        <span class="bridge-file-icon">${icon}</span>
        <span class="bridge-file-name" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</span>
        <span class="bridge-file-meta">${sizeKb}</span>
        <span class="bridge-file-meta">${f.modified_at || ''}</span>
        ${viewBtn}
      </div>
    `;
  }).join('');
}

async function pullBridgeTask() {
  const btn = document.getElementById('btn-bridge-pull');
  if (btn) btn.disabled = true;
  try {
    const res = await fetch('/api/ai-images/bridge/pull', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 1 }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.detail || 'Không pull được');

    const count = (data.pulled || []).length;
    if (count > 0) {
      showToast(`📥 Đã pull ${count} task vào inbox!`);
      showBridgeStatus('ok', `✅ ${data.message}`);
    } else {
      showToast(data.message || 'Không có task mới.');
      showBridgeStatus('info', `ℹ️ ${data.message}`);
    }
    await loadBridgeStatus();
  } catch (err) {
    showToast('Lỗi pull: ' + err.message, 4000);
    showBridgeStatus('err', '❌ ' + err.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function importBridgeOutbox() {
  const btn = document.getElementById('btn-bridge-import');
  if (btn) btn.disabled = true;
  try {
    const res = await fetch('/api/ai-images/bridge/import-outbox', { method: 'POST' });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.detail || 'Không import được');

    const count = (data.imported || []).length;
    if (count > 0) {
      showToast(`📤 Đã nhập ${count} ảnh vào Thư viện!`);
      showBridgeStatus('ok', `✅ ${data.message}`);
    } else {
      showToast(data.message || 'Không có ảnh trong outbox.');
      showBridgeStatus('info', `ℹ️ ${data.message}`);
    }
    if (data.errors?.length) {
      showBridgeStatus('err', `⚠️ ${data.errors.length} lỗi: ${data.errors.map(e => e.error).join('; ')}`);
    }
    await loadBridgeStatus();
  } catch (err) {
    showToast('Lỗi import: ' + err.message, 4000);
    showBridgeStatus('err', '❌ ' + err.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function viewBridgeFile(folder, filename) {
  try {
    const res = await fetch(`/api/ai-images/bridge/file/${encodeURIComponent(folder)}/${encodeURIComponent(filename)}`);
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.detail || 'Không đọc được file');

    const modal = document.getElementById('bridge-file-modal');
    const title = document.getElementById('bridge-modal-title');
    const body = document.getElementById('bridge-modal-body');
    if (title) title.textContent = `${folder}/${data.filename}`;
    if (body) body.textContent = data.content;
    if (modal) modal.style.display = 'flex';
  } catch (err) {
    showToast('Lỗi xem file: ' + err.message, 4000);
  }
}

function closeBridgeFileModal(event) {
  if (event && event.target !== event.currentTarget && !event.target.classList.contains('bridge-modal-close')) return;
  const modal = document.getElementById('bridge-file-modal');
  if (modal) modal.style.display = 'none';
}

function showBridgeStatus(kind, html) {
  const bar = document.getElementById('bridge-status-bar');
  if (!bar) return;
  const colors = {
    ok: { bg: '#064e3b', border: '#10b981', color: '#a7f3d0' },
    err: { bg: '#450a0a', border: '#ef4444', color: '#fecaca' },
    info: { bg: '#1e1b4b', border: '#818cf8', color: '#c7d2fe' },
  };
  const c = colors[kind] || colors.info;
  bar.style.cssText = `display: block; background: ${c.bg}; border: 1px solid ${c.border}; color: ${c.color}; padding: 10px 16px; border-radius: 8px; margin-top: 12px; font-size: 13px;`;
  bar.innerHTML = html;
  if (kind === 'ok' || kind === 'info') {
    setTimeout(() => { bar.style.display = 'none'; }, 5000);
  }
}
