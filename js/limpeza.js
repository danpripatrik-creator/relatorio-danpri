// Limpeza de Dados — usa date range em vez de campo "month"
const Limpeza = {
  initSelects() {
    ['limp-mes-todo', 'limp-mes-consultora', 'limp-mes-dup'].forEach(id => {
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
  },

  _slugFor(name) {
    return String(name || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  },

  // Botão único e simples: procura duplicados em TODOS os meses (não só um) e já mescla,
  // sem precisar escolher mês nem conferir lista antes — só uma confirmação rápida.
  // Agrupa por nome "dobrado" (sem acento/caixa) pra "ALESSANDRA" e "Alessandra" contarem
  // como a mesma pessoa — nomes com capitalização diferente não devem virar duplicidade escondida.
  async autoFixAllDuplicates() {
    Utils.toast('Procurando duplicados em todos os meses...', 'info');
    const snap = await db.collection('reports').get();

    // Carrega o cadastro real de consultoras pra usar o nome certo (capitalização correta) ao mesclar
    let canonicalByFold = new Map();
    try {
      if (window.Importar && typeof Importar.loadConsultants === 'function') {
        await Importar.loadConsultants();
        canonicalByFold = Importar.consultantsByFold || new Map();
      }
    } catch (e) { /* segue sem canonical, usa o nome que aparecer primeiro */ }

    const groups = new Map();
    snap.docs.forEach(d => {
      const data = d.data();
      if (!data.date) return;
      const nomeRaw = data.consultoraNome || data.consultant || '—';
      const fold = Utils.foldName(nomeRaw);
      const key = `${data.date}__${fold}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ id: d.id, ref: d.ref, data, nomeRaw, fold });
    });

    const dup = [...groups.entries()].filter(([, docs]) => docs.length > 1);

    if (!dup.length) {
      Utils.toast('Nenhum duplicado encontrado. Está tudo certo! 🎉', 'success');
      return;
    }

    this._canonicalByFold = canonicalByFold;

    Utils.confirmAction(
      'Corrigir Duplicados Automaticamente',
      `Encontrei ${dup.length} dia(s)-consultora com mais de um registro. Vou mesclar cada grupo mantendo o MAIOR valor de cada campo (nunca soma) e apagar os documentos extras. Isso é irreversível.`,
      dup.length,
      () => this._executeAutoMerge(dup)
    );
  },

  async _executeAutoMerge(dup) {
    const fields = ['mat', 'val', 'lr', 'la', 'bal', 'ind'];
    let merged = 0, deleted = 0;

    try {
      for (const [key, docs] of dup) {
        const fold = key.split('__')[1];
        const date = docs[0].data.date;
        // Nome canônico: prioriza o cadastro real; senão, usa o primeiro nome já bem capitalizado do grupo
        const nome = (this._canonicalByFold && this._canonicalByFold.get(fold))
          || docs.map(d => d.nomeRaw).find(n => n && n[0] === n[0].toUpperCase() && n.slice(1) === n.slice(1).toLowerCase())
          || docs[0].nomeRaw;

        const mergedFranco = {}; const mergedMorato = {};
        fields.forEach(f => {
          mergedFranco[f] = Math.max(...docs.map(d => (d.data.franco || {})[f] || 0));
          mergedMorato[f] = Math.max(...docs.map(d => (d.data.morato || {})[f] || 0));
        });
        const summary = {
          mat: mergedFranco.mat + mergedMorato.mat, val: mergedFranco.val + mergedMorato.val,
          lr:  mergedFranco.lr  + mergedMorato.lr,  la:  mergedFranco.la  + mergedMorato.la,
          bal: mergedFranco.bal + mergedMorato.bal, ind: mergedFranco.ind + mergedMorato.ind
        };

        const detId = `${date}_${this._slugFor(nome)}`;
        const keepRef = db.collection('reports').doc(detId);
        const batch = db.batch();
        batch.set(keepRef, {
          date, consultant: nome, consultoraNome: nome,
          franco: mergedFranco, morato: mergedMorato, summary,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        docs.forEach(d => { if (d.id !== detId) { batch.delete(d.ref); deleted++; } });
        await batch.commit();
        merged++;
      }
      Utils.toast(`✅ Corrigido! ${merged} grupo(s) mesclados, ${deleted} registro(s) duplicados removidos.`, 'success');
      if (App.currentPage === 'dashboard') Dashboard.listen(App.currentMonth);
    } catch (e) {
      Utils.toast('Erro ao corrigir: ' + e.message, 'error');
    }
  },

  async initFindDuplicates() {
    const month = document.getElementById('limp-mes-dup').value;
    const { start, end } = Utils.monthDateRange(month);
    const snap = await db.collection('reports')
      .where('date', '>=', start).where('date', '<=', end).orderBy('date').get();

    const groups = new Map(); // chave: date__consultora -> [docs]
    snap.docs.forEach(d => {
      const data = d.data();
      const nome = data.consultoraNome || data.consultant || '—';
      const key = `${data.date}__${nome}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ id: d.id, ref: d.ref, data });
    });

    const dup = [...groups.entries()].filter(([, docs]) => docs.length > 1);

    const listEl = document.getElementById('limp-dup-list');
    if (!dup.length) {
      listEl.innerHTML = '<p style="color:var(--text-muted)">Nenhum duplicado encontrado nesse mês. 🎉</p>';
      document.getElementById('limp-dup-actions').classList.add('hidden');
      return;
    }

    this._dupGroups = dup;

    listEl.innerHTML = dup.map(([key, docs]) => {
      const [date, nome] = key.split('__');
      const rows = docs.map(d => {
        const f = d.data.franco || {}; const m = d.data.morato || {};
        return `<div style="font-size:12px;color:var(--text-muted);padding:4px 0">
          ID: ${d.id} — Franco: ${f.mat ?? 0} mat/${Utils.formatCurrency(f.val ?? 0)} —
          Morato: ${m.mat ?? 0} mat/${Utils.formatCurrency(m.val ?? 0)}</div>`;
      }).join('');
      return `<div style="border:1px solid var(--bg4);border-radius:8px;padding:10px;margin-bottom:8px">
        <strong>${Utils.formatDate(date)} — ${nome}</strong> (${docs.length} registros)
        ${rows}
      </div>`;
    }).join('');

    document.getElementById('limp-dup-actions').classList.remove('hidden');
    document.getElementById('limp-dup-count').textContent =
      `${dup.length} dia(s)-consultora com duplicidade encontrados.`;
  },

  // Mescla cada grupo de duplicados: para cada campo (mat, val, lr, la, bal, ind em franco e morato),
  // mantém o MAIOR valor entre os documentos duplicados (nunca soma — evita contar o mesmo dinheiro duas vezes).
  // Grava o resultado no ID determinístico (data+consultora) e apaga os demais documentos do grupo.
  confirmMergeDuplicates() {
    if (!this._dupGroups || !this._dupGroups.length) return;
    Utils.doubleConfirm(
      `Mesclar ${this._dupGroups.length} grupo(s) de duplicados? Vou manter o maior valor de cada campo e apagar os documentos extras. Isso é irreversível.`,
      () => this._executeMergeDuplicates()
    );
  },

  async _executeMergeDuplicates() {
    const fields = ['mat', 'val', 'lr', 'la', 'bal', 'ind'];
    let merged = 0, deleted = 0;

    try {
      for (const [key, docs] of this._dupGroups) {
        const [date, nome] = key.split('__');
        const mergedFranco = {}; const mergedMorato = {};
        fields.forEach(f => {
          mergedFranco[f] = Math.max(...docs.map(d => (d.data.franco || {})[f] || 0));
          mergedMorato[f] = Math.max(...docs.map(d => (d.data.morato || {})[f] || 0));
        });
        const summary = {
          mat: mergedFranco.mat + mergedMorato.mat, val: mergedFranco.val + mergedMorato.val,
          lr:  mergedFranco.lr  + mergedMorato.lr,  la:  mergedFranco.la  + mergedMorato.la,
          bal: mergedFranco.bal + mergedMorato.bal, ind: mergedFranco.ind + mergedMorato.ind
        };

        const detId = `${date}_${this._slugFor(nome)}`;
        const keepRef = db.collection('reports').doc(detId);
        const batch = db.batch();
        batch.set(keepRef, {
          date, consultant: nome, consultoraNome: nome,
          franco: mergedFranco, morato: mergedMorato, summary,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        docs.forEach(d => { if (d.id !== detId) { batch.delete(d.ref); deleted++; } });
        await batch.commit();
        merged++;
      }
      Utils.toast(`✅ ${merged} grupo(s) mesclados, ${deleted} documento(s) duplicados removidos.`, 'success');
      document.getElementById('limp-dup-list').innerHTML = '';
      document.getElementById('limp-dup-actions').classList.add('hidden');
      this._dupGroups = null;
      if (App.currentPage === 'dashboard') Dashboard.listen(App.currentMonth);
    } catch (e) {
      Utils.toast('Erro ao mesclar: ' + e.message, 'error');
    }
  }
};
