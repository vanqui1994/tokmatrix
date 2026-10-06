/* Tổng quan: số liệu kênh, đăng bài, ảnh AI, Autopilot + biểu đồ doanh thu/follower. */
(function () {
  const { api, esc, fmt, statBox, card, badge, empty, h } = App;

  App.page({
    id: 'dashboard', group: 'overview', title: 'Bảng điều khiển', icon: 'speedometer2',
    desc: 'Tình hình toàn hệ thống trong một màn hình',
    async render(ctx) {
      const days = Number(ctx.params.days || 30);
      const [sum, hist, ap] = await Promise.all([
        api.get('/api/dashboard/summary'),
        api.get('/api/channels/history-summary', { days }).catch(() => ({ days: [] })),
        api.get('/api/autopilot/status').catch(() => null),
      ]);
      const d = sum.data;
      ctx.el.innerHTML = `
        <div class="row">
          <div class="col-lg-3 col-6">${statBox({ value: fmt.num(d.channels.total), label: `Kênh TikTok · ${fmt.num(d.channels.monetized)} đã bật kiếm tiền`, icon: 'people', tone: 'primary', href: '#/channels' })}</div>
          <div class="col-lg-3 col-6">${statBox({ value: fmt.num(d.upload.queued), label: `Bài chờ đăng · ${fmt.num(d.upload.uploading)} đang đăng`, icon: 'calendar2-week', tone: 'warning', href: '#/upload' })}</div>
          <div class="col-lg-3 col-6">${statBox({ value: fmt.num(d.upload.success), label: `Đã đăng · ${fmt.num(d.upload.failed)} lỗi · ${fmt.num(d.upload.needs_check || 0)} cần kiểm tra`, icon: 'check2-circle', tone: 'success', href: '#/upload?status=SUCCESS' })}</div>
          <div class="col-lg-3 col-6">${statBox({ value: fmt.num(d.images.pending + d.images.processing), label: `Ảnh AI đang chờ · ${fmt.num(d.images.failed)} lỗi`, icon: 'images', tone: 'info', href: '#/ai-images' })}</div>
        </div>
        <div class="row">
          <div class="col-lg-8" data-slot="chart"></div>
          <div class="col-lg-4" data-slot="autopilot"></div>
        </div>
        <div class="row">
          <div class="col-lg-6" data-slot="next"></div>
          <div class="col-lg-6" data-slot="errors"></div>
        </div>`;

      // Biểu đồ
      const chartCard = card({
        title: 'Doanh thu & follower', icon: 'graph-up',
        tools: `<select class="form-select form-select-sm" data-days style="width:auto">${[7, 30, 90].map((n) => `<option value="${n}" ${n === days ? 'selected' : ''}>${n} ngày</option>`).join('')}</select>`,
        body: hist.days && hist.days.length ? '<div style="height:280px"><canvas></canvas></div>' : empty('Chưa có lịch sử quét kênh'),
      });
      ctx.el.querySelector('[data-slot=chart]').append(chartCard);
      chartCard.querySelector('[data-days]').addEventListener('change', (e) => { location.hash = `#/dashboard?days=${e.target.value}`; });
      const canvas = chartCard.querySelector('canvas');
      if (canvas && window.Chart) {
        const style = getComputedStyle(document.body);
        const chart = new Chart(canvas, {
          type: 'line',
          data: {
            labels: hist.days.map((x) => x.day.slice(5)),
            datasets: [
              { label: 'Doanh thu', data: hist.days.map((x) => x.earned), borderColor: style.getPropertyValue('--bs-success'), tension: .3, yAxisID: 'y' },
              { label: 'Follower', data: hist.days.map((x) => x.followers), borderColor: style.getPropertyValue('--bs-primary'), tension: .3, yAxisID: 'y1' },
            ],
          },
          options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, scales: { y1: { position: 'right', grid: { drawOnChartArea: false } } } },
        });
        ctx.onLeave(() => chart.destroy());
      }

      // Autopilot
      const apBody = ap ? `
        <div class="d-flex align-items-center mb-3 gap-2"><span class="fs-5">${badge(ap.state)}</span>
          <span class="text-body-secondary small">${ap.current_step ? 'Đang: ' + esc(ap.current_step) : ap.next_run_at ? 'Chạy tiếp ' + fmt.ago(ap.next_run_at) : ''}</span></div>
        <dl class="row kv mb-0">
          <dt class="col-6">Kế hoạch hôm nay</dt><dd class="col-6">${fmt.num(ap.plans.length)}</dd>
          <dt class="col-6">Batch đang chạy</dt><dd class="col-6">${fmt.num(ap.batches_running.length)}</dd>
          <dt class="col-6">Kênh đã gán</dt><dd class="col-6">${fmt.num(ap.channel_map_count)}</dd>
          <dt class="col-6">Ổ đĩa trống</dt><dd class="col-6">${ap.disk ? `${ap.disk.free_gb} GB ${ap.disk.low ? '<span class="badge text-bg-danger">thấp</span>' : ''}` : '—'}</dd>
        </dl>
        ${ap.last_error ? `<div class="alert alert-danger small mt-3 mb-0">${esc(fmt.short(ap.last_error, 200))}</div>` : ''}`
        : empty('Không đọc được trạng thái Autopilot');
      ctx.el.querySelector('[data-slot=autopilot]').append(card({ title: 'Autopilot', icon: 'robot', tools: '<a class="btn btn-tool" href="#/autopilot"><i class="bi bi-box-arrow-up-right"></i></a>', body: apBody }));

      ctx.el.querySelector('[data-slot=next]').append(card({
        title: 'Bài sắp đăng', icon: 'clock-history', bodyCls: 'p-0',
        body: d.upload.next.length ? `<ul class="list-group list-group-flush">${d.upload.next.map((t) => `
          <li class="list-group-item d-flex justify-content-between gap-2"><span class="text-truncate">${esc(t.caption || '(không caption)')}<span class="cell-sub">Kênh #${t.channel_id}</span></span>
          <span class="text-nowrap small">${fmt.time(t.schedule_time)}</span></li>`).join('')}</ul>` : empty('Không có bài nào đang chờ'),
      }));
      ctx.el.querySelector('[data-slot=errors]').append(card({
        title: 'Lỗi gần đây', icon: 'exclamation-triangle', tone: d.recent_errors.length ? 'danger' : '', bodyCls: 'p-0',
        body: d.recent_errors.length ? `<ul class="list-group list-group-flush">${d.recent_errors.map((e) => `
          <li class="list-group-item"><span class="badge text-bg-secondary me-2">${esc(e.kind)} #${e.id}</span>${esc(e.message)}<span class="cell-sub">${fmt.ago(e.at)}</span></li>`).join('')}</ul>` : empty('Không có lỗi', 'emoji-smile'),
      }));
      ctx.every(60000, () => App.refreshBadges());
    },
  });
})();
