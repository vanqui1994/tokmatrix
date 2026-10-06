/* Thống kê tài khoản: cơ cấu, khán giả, tiền theo tiền tệ, tăng trưởng, kênh và video nổi bật. */
(function () {
  const { api, esc, fmt, card, infoBox, empty } = App;

  const bars = (list, labelKey = 'label') => {
    const max = Math.max(1, ...list.map((x) => x.count));
    return list.length ? list.map((x) => `<div class="mb-2"><div class="d-flex justify-content-between small"><span>${esc(x[labelKey])}</span><b>${fmt.num(x.count)}</b></div>
      <div class="progress" style="height:6px"><div class="progress-bar" style="width:${100 * x.count / max}%"></div></div></div>`).join('') : empty();
  };

  App.page({
    id: 'stats', group: 'accounts', title: 'Thống kê tài khoản', icon: 'bar-chart-line',
    desc: 'Cơ cấu, khán giả, doanh thu và tăng trưởng của toàn bộ tài khoản',
    async render(ctx) {
      const days = Number(ctx.params.days || 30);
      const d = (await api.get('/api/stats/accounts', { days })).data;
      const t = d.totals, a = d.audience, g = d.growth || {};
      ctx.el.innerHTML = `
        <div class="d-flex justify-content-end mb-3"><div class="btn-group btn-group-sm">${[7, 30, 90].map((n) => `<a class="btn btn-outline-secondary ${n === days ? 'active' : ''}" href="#/stats?days=${n}">${n} ngày</a>`).join('')}</div></div>
        <div class="row">
          <div class="col-lg-3 col-6">${infoBox({ label: 'Tài khoản', value: fmt.num(t.channels), icon: 'people', tone: 'primary' })}</div>
          <div class="col-lg-3 col-6">${infoBox({ label: 'Đã bật kiếm tiền', value: fmt.num(t.monetized), icon: 'patch-check', tone: 'success' })}</div>
          <div class="col-lg-3 col-6">${infoBox({ label: 'Tài khoản chết', value: fmt.num(t.dead), icon: 'heartbreak', tone: 'danger' })}</div>
          <div class="col-lg-3 col-6">${infoBox({ label: 'Chưa quét lần nào', value: fmt.num(t.never_checked), icon: 'question-circle', tone: 'warning' })}</div>
          <div class="col-lg-3 col-6">${infoBox({ label: 'Follower', value: fmt.num(a.followers), icon: 'person-heart', tone: 'info' })}</div>
          <div class="col-lg-3 col-6">${infoBox({ label: `Follower tăng (${days} ngày)`, value: fmt.num(g.followers), icon: 'graph-up-arrow', tone: 'success' })}</div>
          <div class="col-lg-3 col-6">${infoBox({ label: 'Tổng view', value: fmt.num(a.views), icon: 'eye', tone: 'secondary' })}</div>
          <div class="col-lg-3 col-6">${infoBox({ label: `View tăng (${days} ngày)`, value: fmt.num(g.views), icon: 'graph-up', tone: 'success' })}</div>
        </div>
        <div class="row"><div class="col-lg-8" data-a></div><div class="col-lg-4" data-b></div></div>
        <div class="row"><div class="col-lg-4" data-c></div><div class="col-lg-4" data-d></div><div class="col-lg-4" data-e></div></div>
        <div class="row"><div class="col-lg-6" data-f></div><div class="col-lg-6" data-g></div></div>`;
      const q = (s) => ctx.el.querySelector(s);

      const chart = card({ title: 'Tăng trưởng khán giả', icon: 'graph-up', body: d.series.length ? '<div style="height:280px"><canvas></canvas></div>' : empty('Chưa có lịch sử') });
      q('[data-a]').append(chart);
      const cv = chart.querySelector('canvas');
      if (cv) {
        const c = new Chart(cv, { type: 'line', data: { labels: d.series.map((x) => x.day.slice(5)), datasets: [
          { label: 'Follower', data: d.series.map((x) => x.followers), tension: .3 },
          { label: 'View', data: d.series.map((x) => x.views), tension: .3, yAxisID: 'y1' }] },
        options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, y1: { position: 'right', beginAtZero: true, ticks: { precision: 0 }, grid: { drawOnChartArea: false } } } } });
        ctx.onLeave(() => c.destroy());
      }
      q('[data-b]').append(card({ title: 'Doanh thu theo tiền tệ', icon: 'cash-coin', bodyCls: 'p-0', body: d.money.length ? `<table class="table table-sm mb-0"><thead><tr><th>Tiền tệ</th><th class="text-end">Kiếm được</th><th class="text-end">Số dư</th><th class="text-end">RPM</th></tr></thead>
        <tbody>${d.money.map((m) => `<tr><td>${esc(m.currency)} <span class="cell-sub">${m.channels} kênh</span></td><td class="text-end">${fmt.money(m.earned)}</td><td class="text-end">${fmt.money(m.balance)}</td><td class="text-end">${m.avg_rpm}</td></tr>`).join('')}</tbody></table>` : empty() }));
      q('[data-c]').append(card({ title: 'Theo trạng thái', icon: 'pie-chart', body: bars(d.by_status) }));
      q('[data-d]').append(card({ title: 'Theo nước', icon: 'globe2', body: bars(d.by_country.map((x) => ({ label: `${x.country} · ${x.monetized} BKT`, count: x.count }))) }));
      q('[data-e]').append(card({ title: 'Theo nguồn', icon: 'tags', body: bars(d.by_publisher) }));
      q('[data-f]').append(card({ title: 'Kênh nhiều follower nhất', icon: 'trophy', bodyCls: 'p-0', body: `<table class="table table-sm table-hover mb-0"><tbody>${d.top_channels.map((c) =>
        `<tr><td>@${esc(c.username)}<span class="cell-sub">${esc(c.country)} · ${esc(c.status)}</span></td><td class="text-end">${fmt.num(c.followers)}<span class="cell-sub">${fmt.num(c.views)} view</span></td></tr>`).join('')}</tbody></table>` }));
      const v = d.videos || {};
      q('[data-g]').append(card({ title: 'Video', icon: 'collection-play', body: `<div class="row g-2 mb-2 small">
        <div class="col-6">Tổng: <b>${fmt.num(v.total)}</b></div><div class="col-6">Đang duyệt: <b>${fmt.num(v.reviewing)}</b></div>
        <div class="col-6">Bị cấm: <b class="text-danger">${fmt.num(v.prohibited)}</b></div><div class="col-6">Không nguyên bản: <b class="text-warning">${fmt.num(v.not_original)}</b></div></div>
        ${bars(v.by_shadowban || [])}` }));
    },
  });
})();
