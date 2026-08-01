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
    const thead   = document.querySelector('#historico-table thead tr');
    const filtC   = document.getElementById('hist-filter-consultora').value;
    const filtU   = document.getElementById('hist-filter-unidade').value; // '', 'Franco da Rocha', 'Francisco Morato'

    // Todas as consultoras continuam aparecendo sempre — o filtro de unidade só decide quais valores exibir
    let filtered = this.allRecords;
    if (filtC) filtered = filtered.filter(r => (r.consultoraNome || r.consultant) === filtC);

    if (filtU === 'Franco da Rocha') {
      thead.innerHTML = `
        <th>Data</th><th>Consultora</th>
        <th style="color:#64b5f6">Mat</th>
        <th style="color:#64b5f6">Valor</th>`;
      const totalMat = filtered.reduce((s, r) => s + (r.franco?.mat || 0), 0);
      const totalVal = filtered.reduce((s, r) => s + (r.franco?.val || 0), 0);
      document.getElementById('historico-count').textContent = `${filtered.length} registro(s) — ${totalMat} mat.`;
      document.getElementById('historico-total').textContent = `Total: ${Utils.formatCurrency(totalVal)}`;
      if (!filtered.length) { tbody.innerHTML = this._emptyRow(4); return; }
      tbody.innerHTML = filtered.map(r => `
        <tr>
          <td>${Utils.formatDate(r.date)}</td>
          <td>${r.consultoraNome || r.consultant || '—'}</td>
          <td style="color:#64b5f6">${r.franco?.mat ?? 0}</td>
          <td style="color:#64b5f6">${Utils.formatCurrency(r.franco?.val ?? 0)}</td>
        </tr>`).join('');
      return;
    }

    if (filtU === 'Francisco Morato') {
      thead.innerHTML = `
        <th>Data</th><th>Consultora</th>
        <th style="color:var(--gold)">Mat</th>
        <th style="color:var(--gold)">Valor</th>`;
      const totalMat = filtered.reduce((s, r) => s + (r.morato?.mat || 0), 0);
      const totalVal = filtered.reduce((s, r) => s + (r.morato?.val || 0), 0);
      document.getElementById('historico-count').textContent = `${filtered.length} registro(s) — ${totalMat} mat.`;
      document.getElementById('historico-total').textContent = `Total: ${Utils.formatCurrency(totalVal)}`;
      if (!filtered.length) { tbody.innerHTML = this._emptyRow(4); return; }
      tbody.innerHTML = filtered.map(r => `
        <tr>
          <td>${Utils.formatDate(r.date)}</td>
          <td>${r.consultoraNome || r.consultant || '—'}</td>
          <td style="color:var(--gold)">${r.morato?.mat ?? 0}</td>
          <td style="color:var(--gold)">${Utils.formatCurrency(r.morato?.val ?? 0)}</td>
        </tr>`).join('');
      return;
    }

    // "Todas as Unidades" — comportamento original, com as duas unidades lado a lado
    thead.innerHTML = `
      <th>Data</th><th>Consultora</th>
      <th style="color:#64b5f6">FR Mat</th>
      <th style="color:#64b5f6">FR Valor</th>
      <th style="color:var(--gold)">FM Mat</th>
      <th style="color:var(--gold)">FM Valor</th>
      <th>Total Mat</th>
      <th>Total Valor</th>`;

    const totalMat = filtered.reduce((s, r) => s + (r.franco?.mat || 0) + (r.morato?.mat || 0), 0);
    const totalVal = filtered.reduce((s, r) => s + (r.franco?.val || 0) + (r.morato?.val || 0), 0);

    document.getElementById('historico-count').textContent = `${filtered.length} registro(s) — ${totalMat} mat.`;
    document.getElementById('historico-total').textContent = `Total: ${Utils.formatCurrency(totalVal)}`;

    if (!filtered.length) { tbody.innerHTML = this._emptyRow(8); return; }

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

  _emptyRow(colspan) {
    return `<tr><td colspan="${colspan}" style="text-align:center;color:var(--text-muted);padding:24px">Nenhum registro encontrado.</td></tr>`;
  },

  exportExcel() {
    const filtC  = document.getElementById('hist-filter-consultora').value;
    const filtU  = document.getElementById('hist-filter-unidade').value;
    let filtered = this.allRecords;
    if (filtC) filtered = filtered.filter(r => (r.consultoraNome || r.consultant) === filtC);

    let data;
    if (filtU === 'Franco da Rocha') {
      data = filtered.map(r => ({
        Data: Utils.formatDate(r.date),
        Consultora: r.consultoraNome || r.consultant || '—',
        Mat: r.franco?.mat ?? 0,
        Valor: r.franco?.val ?? 0,
        LR: r.franco?.lr ?? 0,
        LA: r.franco?.la ?? 0
      }));
    } else if (filtU === 'Francisco Morato') {
      data = filtered.map(r => ({
        Data: Utils.formatDate(r.date),
        Consultora: r.consultoraNome || r.consultant || '—',
        Mat: r.morato?.mat ?? 0,
        Valor: r.morato?.val ?? 0,
        LR: r.morato?.lr ?? 0,
        LA: r.morato?.la ?? 0
      }));
    } else {
      data = filtered.map(r => ({
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
    }

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
      document.getElementById('hist-filter-unidade').addEventListener('change', () => this.render());
      document.getElementById('hist-export-btn').addEventListener('click', () => this.exportExcel());
      sel._init = true;
    }
  }
};
