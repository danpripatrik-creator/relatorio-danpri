// Histórico Completo — usa date range em vez de campo "month"
const Historico = {
  allRecords: [],

  async load(month) {
    const { start, end } = Utils.monthDateRange(month);
    let q = db.collection('reports')
      .where('date', '>=', start)
      .where('date', '<=', end)
      .orderBy('date', 'desc');

    const snap = await q.get();
    let records = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (!Auth.isAdmin()) {
      const myName = Auth.getName();
      records = records.filter(r => r.consultant === myName || r.consultoraNome === myName);
    }
    this.allRecords = records;
    this.populateConsultoraFilter();
    this.render();
  },

  populateConsultoraFilter() {
    const names = [...new Set(this.allRecords.map(r => r.consultoraNome || r.consultant || '—'))].sort();
    const sel   = document.getElementById('hist-filter-consultora');
    const cur   = sel.value;
    sel.innerHTML = '<option value="">Todas as Consultoras</option>' +
      names.map(n => `<option value="${n}" ${n === cur ? 'selected' : ''}>${n}</option>`).join('');
  },

  render() {
    const tbody   = document.getElementById('historico-tbody');
    const filtC   = document.getElementById('hist-filter-consultora').value;

    let filtered = this.allRecords;
    if (filtC) filtered = filtered.filter(r => (r.consultoraNome || r.consultant) === filtC);

    const totalMat = filtered.reduce((s, r) => s + (r.franco?.mat || 0) + (r.morato?.mat || 0), 0);
    const totalVal = filtered.reduce((s, r) => s + (r.franco?.val || 0) + (r.morato?.val || 0), 0);

    document.getElementById('historico-count').textContent = `${filtered.length} registro(s) — ${totalMat} mat.`;
    document.getElementById('historico-total').textContent = `Total: ${Utils.formatCurrency(totalVal)}`;

    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:24px">Nenhum registro encontrado.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(r => `
      <tr>
        <td>${Utils.formatDate(r.date)}</td>
        <td>${r.consultoraNome || r.consultant || '—'}</td>
        <td style="color:#64b5f6">${r.franco?.mat ?? 0}</td>
        <td style="color:var(--gold)">${Utils.formatCurrency(r.franco?.val ?? 0)}</td>
        <td style="color:var(--gold)">${r.morato?.mat ?? 0}</td>
        <td style="color:var(--gold)">${Utils.formatCurrency(r.morato?.val ?? 0)}</td>
        <td style="font-weight:600">${(r.franco?.mat ?? 0) + (r.morato?.mat ?? 0)}</td>
        <td style="color:var(--gold);font-weight:600">${Utils.formatCurrency((r.franco?.val ?? 0) + (r.morato?.val ?? 0))}</td>
      </tr>`
    ).join('');
  },

  exportExcel() {
    const filtC  = document.getElementById('hist-filter-consultora').value;
    let filtered = this.allRecords;
    if (filtC) filtered = filtered.filter(r => (r.consultoraNome || r.consultant) === filtC);

    const data = filtered.map(r => ({
      Data:         Utils.formatDate(r.date),
      Consultora:   r.consultoraNome || r.consultant || '—',
      'FR Mat':     r.franco?.mat ?? 0,
      'FR Valor':   r.franco?.val ?? 0,
      'FR LR':      r.franco?.lr  ?? 0,
      'FR LA':      r.franco?.la  ?? 0,
      'FM Mat':     r.morato?.mat ?? 0,
      'FM Valor':   r.morato?.val ?? 0,
      'FM LR':      r.morato?.lr  ?? 0,
      'FM LA':      r.morato?.la  ?? 0,
      'Total Mat':  (r.franco?.mat ?? 0) + (r.morato?.mat ?? 0),
      'Total Valor': (r.franco?.val ?? 0) + (r.morato?.val ?? 0)
    }));

    const month = document.getElementById('hist-filter-mes').value;
    Utils.exportToExcel(data, `historico-${month}.xlsx`);
    Utils.toast('Exportação concluída!', 'success');
  },

  initFilters() {
    const sel = document.getElementById('hist-filter-mes');
    Utils.generateMonthOptions(sel, App.currentMonth);
    if (!sel._init) {
      sel.addEventListener('change', () => this.load(sel.value));
      document.getElementById('hist-filter-consultora').addEventListener('change', () => this.render());
      document.getElementById('hist-export-btn').addEventListener('click', () => this.exportExcel());
      sel._init = true;
    }
  }
};
