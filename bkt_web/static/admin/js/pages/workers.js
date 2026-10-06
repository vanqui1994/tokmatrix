/* Worker nền: luồng nào đang chạy, ai khởi động, tắt bằng biến môi trường nào. */
(function () {
  const { api, esc, card, badge, empty } = App;

  App.page({
    id: 'workers', group: 'system', title: 'Worker nền', icon: 'cpu',
    desc: 'Các luồng chạy nền của máy chủ và trạng thái của chúng',
    badge: async () => {
      const r = await api.get('/api/system/workers');
      const down = r.workers.filter((w) => w.enabled && !w.running && !w.note).length;
      return down ? { text: down, tone: 'warning' } : null;
    },
    async render(ctx) {
      const load = async () => {
        const r = await api.get('/api/system/workers');
        const groups = [...new Set(r.workers.map((w) => w.group))];
        ctx.el.innerHTML = `<p class="text-body-secondary small">${r.thread_count} thread đang sống. Worker có ghi chú chỉ xuất hiện khi có việc.</p>`;
        for (const g of groups) {
          ctx.el.append(card({ title: g, icon: 'diagram-2', bodyCls: 'p-0', body: `<table class="table table-sm align-middle mb-0 wk-table"><colgroup><col style="width:30%"><col style="width:16%"><col style="width:24%"><col></colgroup><tbody>${r.workers.filter((w) => w.group === g).map((w) => `
            <tr><td><b>${esc(w.label)}</b><span class="cell-sub mono">${esc(w.name)}</span></td>
            <td>${!w.enabled ? badge('disabled', `Tắt (${w.env}=0)`) : w.running ? badge('running', w.running > 1 ? `Đang chạy ×${w.running}` : 'Đang chạy') : badge(w.note ? 'idle' : 'stopped', w.note ? 'Rảnh' : 'Không chạy')}</td>
            <td class="small text-body-secondary">${esc(w.note)}</td>
            <td class="small mono text-body-secondary">${esc(w.owner)}</td></tr>`).join('')}</tbody></table>` }));
        }
        if (r.other_threads.length) ctx.el.append(card({ title: 'Thread khác', icon: 'list', body: `<div class="mono small">${r.other_threads.map(esc).join('<br>')}</div>` }));
      };
      await load();
      ctx.every(10000, load);
    },
  });
})();
