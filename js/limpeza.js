// Limpeza de Dados — usa date range em vez de campo "month"
const Limpeza = {
  initSelects() {
    ['limp-mes-todo', 'limp-mes-consultora'].forEach(id => {
      Utils.generateMonthOptions(document.getElementById(id), App.currentMonth);
    });
    this.loadConsultoras();
  },

  async loadConsultoras() {
    const snap = await db.collection('users').where('role', '==', 'consultant').get();
    const sel  = document.getElementById('limp-consultora');
    // value = nome completo para bater com o campo "consultant" do Firestore
    sel.innerHTML = '<option value="">Selecione...</option>' +
      snap.docs.map(d => `<option value="${d.data().name}">${d.data().name}</option>`).join('');
  },

  async initClear(type) {
    let query = db.collection('reports');
    let description = '';

    switch (type) {
      case 'mes': {
        const month      = document.getElementById('limp-mes-todo').value;
        const { start, end } = Utils.monthDateRange(month);
        query = query.where('date', '>=', start).where('date', '<=', end);
        description = `Limpar TODOS os dados de ${Utils.monthLabelFull(month)}`;
        break;
      }
      case 'consultora': {
        const month      = document.getElementById('limp-mes-consultora').value;
        const consultant = document.getElementById('limp-consultora').value;
        if (!consultant) { Utils.toast('Selecione uma consultora.', 'error'); return; }
        const { start, end } = Utils.monthDateRange(month);
        // Firestore permite equality + range se o range estiver em "date"
        // Fazemos range no client-side para evitar índice composto
        query = query.where('date', '>=', start).where('date', '<=', end);
        const sel  = document.getElementById('limp-consultora');
        const cName = sel.options[sel.selectedIndex].text;
        description = `Limpar dados de ${cName} em ${Utils.monthLabelFull(month)}`;
        // Filtro adicional por consultant (client-side)
        const snap = await query.orderBy('date').get();
        const docs = snap.docs.filter(d => d.data().consultant === consultant);
        if (!docs.length) { Utils.toast('Nenhum registro encontrado.', 'info'); return; }
        this._confirmAndDelete(description, docs);
        return;
      }
      case 'data': {
        const date = document.getElementById('limp-data').value;
        if (!date) { Utils.toast('Selecione uma data.', 'error'); return; }
        query = query.where('date', '==', date);
        description = `Limpar todos os dados do dia ${Utils.formatDate(date)}`;
        break;
      }
    }

    const snap = await query.orderBy('date').get();
    if (!snap.docs.length) { Utils.toast('Nenhum registro encontrado.', 'info'); return; }
    this._confirmAndDelete(description, snap.docs);
  },

  _confirmAndDelete(description, docs) {
    Utils.confirmAction(
      'Verificar Limpeza',
      description,
      docs.length,
      () => Utils.doubleConfirm(
        `${description}. ${docs.length} documento(s) serão apagados permanentemente.`,
        () => this._execute(docs)
      )
    );
  },

  async _execute(docs) {
    try {
      const CHUNK = 500;
      for (let i = 0; i < docs.length; i += CHUNK) {
        const batch = db.batch();
        docs.slice(i, i + CHUNK).forEach(doc => batch.delete(doc.ref));
        await batch.commit();
      }
      Utils.toast(`✅ ${docs.length} documento(s) removidos.`, 'success');
      if (App.currentPage === 'dashboard') Dashboard.listen(App.currentMonth);
    } catch (e) {
      Utils.toast('Erro ao limpar: ' + e.message, 'error');
    }
  }
};
