// Dashboard — lê coleção "reports" com a estrutura real do Firebase:
// { consultant, consultoraNome, date, createdAt,
//   franco: { mat, val, lr, la, bal, ind },
//   morato: { mat, val, lr, la, bal, ind },
//   summary: { mat, val, lr, la, bal, ind } }

let _dashUnsub = null;
let chartMatriculas = null;
let chartUnidades   = null;

const Dashboard = {

  // Inicia listener em tempo real para o mês selecionado
  listen(month) {
    if (_dashUnsub) { _dashUnsub(); _dashUnsub = null; }

    const { start, end } = Utils.monthDateRange(month);

    // Range na mesma coluna (date) não exige índice composto
    const q = db.collection('reports')
      .where('date', '>=', start)
      .where('date', '<=', end)
      .orderBy('date', 'desc');

    _dashUnsub = q.onSnapshot(
      snap => {
        let records = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        // Consultora enxerga apenas os próprios dados
        // consultant no Firestore = nome completo (ex: "Thais Santos"), não username
        if (!Auth.isAdmin()) {
          const myName = Auth.getName();
          records = records.filter(r => r.consultant === myName || r.consultoraNome === myName);
        }
        this.renderKPIs(records);
        this.renderCharts(records);
        this.renderConsultorCards(records);
        this.renderRanking(records);
      },
      err => {
        console.error('[Dashboard] onSnapshot error:', err);
        Utils.toast('Erro ao carregar dados: ' + err.message, 'error');
      }
    );
  },

  stop() {
    if (_dashUnsub) { _dashUnsub(); _dashUnsub = null; }
  },

  // Soma um campo dentro do sub-objeto de unidade (franco ou morato)
  _sum(records, unit, field) {
    return records.reduce((s, r) => s + (r[unit]?.[field] || 0), 0);
  },

  renderKPIs(records) {
    const s = this._sum.bind(this);

    // Franco da Rocha
    document.getElementById('kpi-franco-matriculas').textContent = s(records, 'franco', 'mat');
    document.getElementById('kpi-franco-valor').textContent      = Utils.formatCurrency(s(records, 'franco', 'val'));
    document.getElementById('kpi-franco-leads').textContent      = s(records, 'franco', 'lr');
    document.getElementById('kpi-franco-leads-ant').textContent  = s(records, 'franco', 'la');

    // Francisco Morato
    document.getElementById('kpi-morato-matriculas').textContent = s(records, 'morato', 'mat');
    document.getElementById('kpi-morato-valor').textContent      = Utils.formatCurrency(s(records, 'morato', 'val'));
    document.getElementById('kpi-morato-leads').textContent      = s(records, 'morato', 'lr');
    document.getElementById('kpi-morato-leads-ant').textContent  = s(records, 'morato', 'la');

    // Total Geral
    const totalMat  = s(records, 'franco', 'mat') + s(records, 'morato', 'mat');
    const totalVal  = s(records, 'franco', 'val') + s(records, 'morato', 'val');
    const totalLr   = s(records, 'franco', 'lr')  + s(records, 'morato', 'lr');
    const totalLa   = s(records, 'franco', 'la')  + s(records, 'morato', 'la');
    const allLeads  = totalLr + totalLa;
    const conv      = allLeads > 0 ? ((totalMat / allLeads) * 100).toFixed(1) : 0;

    document.getElementById('kpi-total-matriculas').textContent = totalMat;
    document.getElementById('kpi-total-valor').textContent      = Utils.formatCurrency(totalVal);
    document.getElementById('kpi-total-leads').textContent      = totalLr;
    document.getElementById('kpi-total-conversao').textContent  = `${conv}%`;
  },

  renderCharts(records) {
    // Agrupa por consultora
    const byC = {};
    records.forEach(r => {
      const name = r.consultoraNome || r.consultant || '—';
      if (!byC[name]) byC[name] = { mat: 0, val: 0 };
      byC[name].mat += (r.franco?.mat || 0) + (r.morato?.mat || 0);
      byC[name].val += (r.franco?.val || 0) + (r.morato?.val || 0);
    });

    const labels = Object.keys(byC);
    const mats   = labels.map(l => byC[l].mat);

    // Gráfico — matrículas por consultora
    const ctx1 = document.getElementById('chart-matriculas').getContext('2d');
    if (chartMatriculas) chartMatriculas.destroy();
    chartMatriculas = new Chart(ctx1, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Matrículas',
          data: mats,
          backgroundColor: 'rgba(212,160,23,0.7)',
          borderColor: '#D4A017',
          borderWidth: 1,
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#888' }, grid: { color: '#222' } },
          y: { ticks: { color: '#888', stepSize: 1 }, grid: { color: '#222' }, beginAtZero: true }
        }
      }
    });

    // Gráfico — valor por unidade (donut)
    const fVal = records.reduce((s, r) => s + (r.franco?.val || 0), 0);
    const mVal = records.reduce((s, r) => s + (r.morato?.val || 0), 0);

    const ctx2 = document.getElementById('chart-unidades').getContext('2d');
    if (chartUnidades) chartUnidades.destroy();
    chartUnidades = new Chart(ctx2, {
      type: 'doughnut',
      data: {
        labels: ['Franco da Rocha', 'Francisco Morato'],
        datasets: [{
          data: [fVal, mVal],
          backgroundColor: ['rgba(30,136,229,0.7)', 'rgba(212,160,23,0.7)'],
          borderColor: ['#1E88E5', '#D4A017'],
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { labels: { color: '#888', font: { size: 12 } } },
          tooltip: { callbacks: { label: ctx => Utils.formatCurrency(ctx.raw) } }
        }
      }
    });
  },

  renderConsultorCards(records) {
    const grid = document.getElementById('consultoras-cards-grid');
    const byC  = {};

    records.forEach(r => {
      const name = r.consultoraNome || r.consultant || '—';
      if (!byC[name]) byC[name] = { franco: { mat: 0, val: 0 }, morato: { mat: 0, val: 0 } };
      byC[name].franco.mat += r.franco?.mat || 0;
      byC[name].franco.val += r.franco?.val || 0;
      byC[name].morato.mat += r.morato?.mat || 0;
      byC[name].morato.val += r.morato?.val || 0;
    });

    if (!Object.keys(byC).length) {
      grid.innerHTML = '<div style="color:var(--text-muted);font-size:13px">Nenhum dado para o período.</div>';
      return;
    }

    grid.innerHTML = Object.entries(byC).map(([name, d]) => {
      const totalMat = d.franco.mat + d.morato.mat;
      const totalVal = d.franco.val + d.morato.val;
      return `
        <div class="consultora-card">
          <div class="consultora-card-name">${name}</div>
          <div class="consultora-card-row">
            <span class="consultora-card-label" style="color:#64b5f6">Franco — Mat.</span>
            <span class="consultora-card-value">${d.franco.mat}</span>
          </div>
          <div class="consultora-card-row">
            <span class="consultora-card-label" style="color:#64b5f6">Franco — Valor</span>
            <span class="consultora-card-value">${Utils.formatCurrency(d.franco.val)}</span>
          </div>
          <div class="consultora-card-row">
            <span class="consultora-card-label" style="color:var(--gold)">Morato — Mat.</span>
            <span class="consultora-card-value">${d.morato.mat}</span>
          </div>
          <div class="consultora-card-row">
            <span class="consultora-card-label" style="color:var(--gold)">Morato — Valor</span>
            <span class="consultora-card-value">${Utils.formatCurrency(d.morato.val)}</span>
          </div>
          <div class="consultora-card-row consultora-card-total">
            <span class="consultora-card-label">Total Matrículas</span>
            <span class="consultora-card-value" style="color:#fff">${totalMat}</span>
          </div>
          <div class="consultora-card-row">
            <span class="consultora-card-label">Total Valor</span>
            <span class="consultora-card-value" style="color:#fff">${Utils.formatCurrency(totalVal)}</span>
          </div>
        </div>`;
    }).join('');
  },

  renderRanking(records) {
    const list = document.getElementById('ranking-list');
    const byC  = {};

    records.forEach(r => {
      const name = r.consultoraNome || r.consultant || '—';
      if (!byC[name]) byC[name] = { mat: 0, val: 0 };
      byC[name].mat += (r.franco?.mat || 0) + (r.morato?.mat || 0);
      byC[name].val += (r.franco?.val || 0) + (r.morato?.val || 0);
    });

    const sorted = Object.entries(byC).sort((a, b) => b[1].mat - a[1].mat || b[1].val - a[1].val);

    if (!sorted.length) {
      list.innerHTML = '<div style="color:var(--text-muted);font-size:13px">Sem dados.</div>';
      return;
    }

    list.innerHTML = sorted.map(([name, d], i) => `
      <div class="ranking-item">
        <div class="rank-num rank-${i + 1}">${i + 1}</div>
        <div class="rank-info">
          <div class="rank-name">${name}</div>
          <div class="rank-stats">${d.mat} matrícula${d.mat !== 1 ? 's' : ''}</div>
        </div>
        <div class="rank-valor">${Utils.formatCurrency(d.val)}</div>
      </div>`
    ).join('');
  }
};
