/* Sơ đồ luồng live kiểu n8n (như bản cũ): khung #pane-flow + renderer js/flow_canvas.js.
 * URL: #/flow/<autopilot|publish|scripts>?hours=N — reload giữ đúng luồng và khung giờ. */
(function () {
  const SHELL = `<div class="fv-shell">
        <div class="fv-toolbar">
          <div class="fv-toolbar-left">
            <div class="fv-tabs" role="tablist" aria-label="Chọn luồng">
              <button type="button" class="fv-tab" data-flow="autopilot">Autopilot</button>
              <button type="button" class="fv-tab active" data-flow="publish">Đăng TikTok</button>
              <button type="button" class="fv-tab" data-flow="scripts">Script Queue</button>
            </div>
            <div class="fv-workers" id="fv-workers"></div>
          </div>
          <div class="fv-toolbar-right">
            <span class="fv-meta" id="fv-updated">Chưa tải</span>
            <select class="fv-select" id="fv-hours" aria-label="Khung thời gian">
              <option value="6">6 giờ qua</option>
              <option value="24">24 giờ qua</option>
              <option value="48" selected>48 giờ qua</option>
              <option value="168">7 ngày qua</option>
            </select>
            <label class="fv-toggle"><input type="checkbox" id="fv-auto" checked> Tự làm mới 5s</label>
            <label class="fv-toggle" title="Cho chấm sáng chạy trên mọi cạnh để xem hiệu ứng — không phải số liệu thật"><input type="checkbox" id="fv-demo"> Mô phỏng</label>
            <button type="button" class="fv-icon-btn" id="fv-refresh" title="Làm mới" aria-label="Làm mới">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            </button>
          </div>
        </div>
        <div class="fv-error" id="fv-error" hidden></div>
        <div class="fv-canvas" id="fv-canvas">
          <div class="fv-world" id="fv-world"></div>
          <div class="fv-controls">
            <button type="button" id="fv-fit" title="Vừa khung" aria-label="Vừa khung"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/></svg></button>
            <button type="button" id="fv-zoom-in" title="Phóng to" aria-label="Phóng to"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3M11 8v6M8 11h6"/></svg></button>
            <button type="button" id="fv-zoom-out" title="Thu nhỏ" aria-label="Thu nhỏ"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3M8 11h6"/></svg></button>
            <span id="fv-zoom-val">100%</span>
          </div>
          <div class="fv-legend" aria-hidden="true">
            <span><i style="border-color:#ff9b3d"></i>Đang chạy</span>
            <span><i style="border-color:#4b5bd6;background:#4b5bd6"></i>Đang chờ</span>
            <span><i style="border-color:#ff5a5f"></i>Lỗi / cần xử lý</span>
            <span><i style="border-color:#2f7a5a"></i>Xong</span>
          </div>
          <aside class="fv-drawer" id="fv-drawer" aria-live="polite"></aside>
        </div>
      </div>
    </div>`;
  const FLOWS = ['autopilot', 'publish', 'scripts'];

  App.page({
    id: 'flow', group: 'publish', title: 'Sơ đồ luồng', icon: 'diagram-3',
    desc: 'Từng bước của Autopilot, Đăng TikTok và Script Queue theo thời gian thực',
    render(ctx) {
      ctx.el.innerHTML = `<div id="pane-flow">${SHELL}</div>`;
      window.onFlowViewChange = (flow, hours) => {
        const h = hours || ctx.params.hours;
        history.replaceState(null, '', `#/flow/${flow}${h ? '?hours=' + h : ''}`);
      };
      ctx.onLeave(() => { window.stopFlowView(); window.onFlowViewChange = null; });
      window.loadFlowView(FLOWS.includes(ctx.sub) ? ctx.sub : null, ctx.params.hours);
    },
  });
})();
