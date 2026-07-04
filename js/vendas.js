// Registro de Vendas — usa a estrutura real:
// reports.franco = { mat, val, lr, la, bal, ind }
// reports.morato = { mat, val, lr, la, bal, ind }

let _vendasUnsub = null;

const Vendas = {
  allRecords: [],
  consultoras: [],

  listen(month) {
    if (_vendasUnsub) { _vendasUnsub(); _vendasUnsub = null; }

    const { start, end } = Utils.monthDateRange(month);
    const q = db.collection('reports')
      .where('date', '>=', start)
      .where('date', '<=', end)
      .orderBy('date', 'desc');

    _vendasUnsub = q.onSnapshot(
      snap => {
        let records = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (!Auth.isAdmin()) {
          const myName = Auth.getName();
          records = records.filter(r => r.consultant === myName || r.consultoraNome === myName);
        }
        this.allRecords = records;
        this.render();
      },
      err => console.error('[Vendas] onSnapshot:', err)
    );
  },

  stop() {
    if (_vendasUnsub) { _vendasUnsub(); _vendasUnsub = null; }
  },

  async loadConsultoras() {
    const snap = await db.collection('users').where('role', '==', 'consultant').get();
    this.consultoras = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const sel = document.getElementById('vnd-filter-consultora');
    // value = nome completo para bater com o campo "consultant" do Firestore
    sel.innerHTML = '<option value="">Todas as Consultoras</option>' +
      this.consultoras.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
  },

  render() {
    const tbody  = document.getElementById('vendas-tbody');
    const filtC  = document.getElementById('vnd-filter-consultora').value;  // nome completo
    const filtD  = document.getElementById('vnd-filter-data').value;

    let filtered = this.allRecords;
    if (filtC) filtered = filtered.filter(r => r.consultant === filtC || r.consultoraNome === filtC);
    if (filtD) filtered = filtered.filter(r => r.date === filtD);

    const totalMat = filtered.reduce((s, r) => s + (r.franco?.mat || 0) + (r.morato?.mat || 0), 0);
    const totalVal = filtered.reduce((s, r) => s + (r.franco?.val || 0) + (r.morato?.val || 0), 0);

    document.getElementById('vendas-count').textContent = `${filtered.length} registro(s) — ${totalMat} mat.`;
    document.getElementById('vendas-total').textContent = `Total: ${Utils.formatCurrency(totalVal)}`;

    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--text-muted);padding:24px">Nenhum registro encontrado.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(r => `
      <tr>
        <td>${Utils.formatDate(r.date)}</td>
        <td>${r.consultoraNome || r.consultant || '—'}</td>
        <td style="color:#64b5f6;font-weight:600">${r.franco?.mat ?? 0}</td>
        <td style="color:var(--gold)">${Utils.formatCurrency(r.franco?.val ?? 0)}</td>
        <td style="color:#888;font-size:12px">${r.franco?.lr ?? 0}/${r.franco?.la ?? 0}</td>
        <td style="color:var(--gold);font-weight:600">${r.morato?.mat ?? 0}</td>
        <td style="color:var(--gold)">${Utils.formatCurrency(r.morato?.val ?? 0)}</td>
        <td style="color:#888;font-size:12px">${r.morato?.lr ?? 0}/${r.morato?.la ?? 0}</td>
        <td>
          <button class="btn btn-outline btn-sm" onclick="Vendas.openEdit('${r.id}')">✏️</button>
          <button class="btn btn-danger btn-sm"  onclick="Vendas.confirmDelete('${r.id}')">🗑️</button>
        </td>
      </tr>`
    ).join('');
  },

  openEdit(id) {
    const rec = this.allRecords.find(r => r.id === id);
    if (!rec) return;

    document.getElementById('modal-venda-title').textContent = 'Editar Lançamento';
    document.getElementById('venda-id').value   = id;
    document.getElementById('venda-data').value = rec.date || '';
    document.getElementById('venda-consultora').value = rec.consultant || '';

    const f = rec.franco || {};
    document.getElementById('venda-franco-mat').value = f.mat ?? 0;
    document.getElementById('venda-franco-val').value = f.val ?? 0;
    document.getElementById('venda-franco-lr').value  = f.lr  ?? 0;
    document.getElementById('venda-franco-la').value  = f.la  ?? 0;
    document.getElementById('venda-franco-bal').value = f.bal ?? 0;
    document.getElementById('venda-franco-ind').value = f.ind ?? 0;

    const m = rec.morato || {};
    document.getElementById('venda-morato-mat').value = m.mat ?? 0;
    document.getElementById('venda-morato-val').value = m.val ?? 0;
    document.getElementById('venda-morato-lr').value  = m.lr  ?? 0;
    document.getElementById('venda-morato-la').value  = m.la  ?? 0;
    document.getElementById('venda-morato-bal').value = m.bal ?? 0;
    document.getElementById('venda-morato-ind').value = m.ind ?? 0;

    document.getElementById('modal-nova-venda').classList.remove('hidden');
  },

  confirmDelete(id) {
    const rec = this.allRecords.find(r => r.id === id);
    if (!rec) return;
    Utils.confirmAction(
      'Excluir Lançamento',
      `Excluir o lançamento de ${rec.consultoraNome || rec.consultant} em ${Utils.formatDate(rec.date)}?`,
      null,
      () => this.deleteRecord(id)
    );
  },

  async deleteRecord(id) {
    try {
      await db.collection('reports').doc(id).delete();
      Utils.toast('Lançamento excluído.', 'success');
    } catch (e) {
      Utils.toast('Erro ao excluir: ' + e.message, 'error');
    }
  },

  // Salva na estrutura exata do Firebase: franco/morato/summary com mat,val,lr,la,bal,ind
  async save(formData) {
    const n = k => parseInt(formData[k]) || 0;
    const nf = k => parseFloat(formData[k]) || 0;

    const franco = { mat: n('franco-mat'), val: nf('franco-val'), lr: n('franco-lr'), la: n('franco-la'), bal: n('franco-bal'), ind: n('franco-ind') };
    const morato = { mat: n('morato-mat'), val: nf('morato-val'), lr: n('morato-lr'), la: n('morato-la'), bal: n('morato-bal'), ind: n('morato-ind') };
    const summary = {
      mat: franco.mat + morato.mat,
      val: franco.val + morato.val,
      lr:  franco.lr  + morato.lr,
      la:  franco.la  + morato.la,
      bal: franco.bal + morato.bal,
      ind: franco.ind + morato.ind
    };

    const doc = {
      date:          formData.date,
      consultant:    formData.consultant,
      consultoraNome: formData.consultoraNome,
      franco, morato, summary,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
      if (formData.id) {
        await db.collection('reports').doc(formData.id).update(doc);
        Utils.toast('Lançamento atualizado!', 'success');
      } else {
        doc.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        await db.collection('reports').add(doc);
        Utils.toast('Lançamento registrado!', 'success');
      }
      App.closeModal('modal-nova-venda');
    } catch (e) {
      Utils.toast('Erro ao salvar: ' + e.message, 'error');
    }
  },

  initFilters() {
    if (this._filtersInit) return;
    ['vnd-filter-consultora', 'vnd-filter-data'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', () => this.render());
    });
    document.getElementById('vnd-btn-limpar')?.addEventListener('click', () => {
      document.getElementById('vnd-filter-consultora').value = '';
      document.getElementById('vnd-filter-data').value = '';
      this.render();
    });
    this._filtersInit = true;
  }
};
