// Relatório WhatsApp — lê e salva na coleção "reports" (sem coleção "leads")
// Campos: franco/morato.{ mat, val, lr, la, bal, ind }
const Relatorio = {
  _docId: null,       // ID do documento carregado (para upsert)
  _docFranco: {},     // dados franco carregados do Firebase
  _docMorato: {},     // dados morato carregados do Firebase

  async init() {
    const sel = document.getElementById('rel-consultora');
    if (Auth.isAdmin()) {
      const snap = await db.collection('users')
        .where('role', '==', 'consultant')
        .where('active', '==', true)
        .get();
      // value = nome completo, igual ao campo "consultant" no Firestore
      sel.innerHTML = '<option value="">Selecione a Consultora</option>' +
        snap.docs.map(d => `<option value="${d.data().name}">${d.data().name}</option>`).join('');
      sel.disabled = false;
    } else {
      // Consultora enxerga só a si mesma; value = Auth.getName() para bater com "consultant"
      sel.innerHTML = `<option value="${Auth.getName()}">${Auth.getName()}</option>`;
      sel.disabled = true;
    }
    document.getElementById('rel-data').value = Utils.todayStr();

    // Eventos (só registra uma vez)
    if (!this._eventsInit) {
      document.getElementById('btn-gerar-relatorio').addEventListener('click',  () => this.gerar());
      document.getElementById('btn-atualizar-rel').addEventListener('click',    () => this.buildText());
      document.getElementById('btn-copiar-rel').addEventListener('click',       () => this.copiar());
      document.getElementById('btn-salvar-leads').addEventListener('click',     () => this.salvar());
      this._eventsInit = true;
    }
  },

  async gerar() {
    // "value" do select agora é o nome completo (ex: "Thais Santos"),
    // igual ao campo "consultant" gravado no Firestore
    const consultantName = document.getElementById('rel-consultora').value;
    const date           = document.getElementById('rel-data').value;
    if (!consultantName || !date) { Utils.toast('Selecione consultora e data.', 'error'); return; }

    console.log(`[Relatorio] Query → consultant="${consultantName}", date="${date}"`);

    const snap = await db.collection('reports')
      .where('consultant', '==', consultantName)
      .where('date',       '==', date)
      .get();

    console.log(`[Relatorio] Documentos encontrados: ${snap.size}`);

    // Agrega se houver múltiplos documentos (ex.: importados em lotes)
    let franco = { mat: 0, val: 0, lr: 0, la: 0, bal: 0, ind: 0 };
    let morato = { mat: 0, val: 0, lr: 0, la: 0, bal: 0, ind: 0 };
    this._docId = null;

    snap.docs.forEach((d, i) => {
      const data = d.data();
      if (i === 0) this._docId = d.id; // upsert no primeiro doc
      const f = data.franco || {};
      const m = data.morato || {};
      franco.mat += f.mat || 0; franco.val += f.val || 0;
      franco.lr  += f.lr  || 0; franco.la  += f.la  || 0;
      franco.bal += f.bal || 0; franco.ind += f.ind || 0;
      morato.mat += m.mat || 0; morato.val += m.val || 0;
      morato.lr  += m.lr  || 0; morato.la  += m.la  || 0;
      morato.bal += m.bal || 0; morato.ind += m.ind || 0;
    });

    this._docFranco = franco;
    this._docMorato = morato;

    // Preenche o formulário com os dados carregados
    this._fillForm('franco', franco);
    this._fillForm('morato', morato);

    // Resumo de vendas por unidade
    document.getElementById('rel-franco-resumo').innerHTML =
      `📊 FR — ${franco.mat} mat. | ${Utils.formatCurrency(franco.val)} | LR:${franco.lr} LA:${franco.la}`;
    document.getElementById('rel-morato-resumo').innerHTML =
      `📊 FM — ${morato.mat} mat. | ${Utils.formatCurrency(morato.val)} | LR:${morato.lr} LA:${morato.la}`;

    document.getElementById('relatorio-content').classList.remove('hidden');
    this.buildText();
  },

  _fillForm(unit, data) {
    document.getElementById(`rel-${unit}-mat`).value = data.mat ?? 0;
    document.getElementById(`rel-${unit}-val`).value = data.val ?? 0;
    document.getElementById(`rel-${unit}-lr`).value  = data.lr  ?? 0;
    document.getElementById(`rel-${unit}-la`).value  = data.la  ?? 0;
    document.getElementById(`rel-${unit}-bal`).value = data.bal ?? 0;
    document.getElementById(`rel-${unit}-ind`).value = data.ind ?? 0;
  },

  _readForm(unit) {
    const n  = id => parseInt(document.getElementById(id).value)   || 0;
    const nf = id => parseFloat(document.getElementById(id).value) || 0;
    return {
      mat: n(`rel-${unit}-mat`), val: nf(`rel-${unit}-val`),
      lr:  n(`rel-${unit}-lr`),  la:  n(`rel-${unit}-la`),
      bal: n(`rel-${unit}-bal`), ind: n(`rel-${unit}-ind`)
    };
  },

  buildText() {
    const selEl   = document.getElementById('rel-consultora');
    const name    = selEl.options[selEl.selectedIndex]?.text || Auth.getName();
    const date    = document.getElementById('rel-data').value;
    const [y, mo, d] = date.split('-');
    const months  = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
    const dateFmt = `${d}/${mo}/${y}`;

    const f = this._readForm('franco');
    const m = this._readForm('morato');

    const text = `📊 *RELATÓRIO DIÁRIO DE VENDAS E LEADS*
Consultora: ${name}
📅 Data: ${dateFmt}

📍 *UNIDADE FRANCO DA ROCHA*
Matrículas Fechadas: ${f.mat}
Valor Vendido: ${Utils.formatCurrency(f.val)}
Leads Recebidos Hoje: ${f.lr}
Leads Antigos Contatados: ${f.la}
Indicações: ${f.ind}
Atendimento Balcão: ${f.bal}

📍 *UNIDADE FRANCISCO MORATO*
Matrículas Fechadas: ${m.mat}
Valor Vendido: ${Utils.formatCurrency(m.val)}
Leads Recebidos Hoje: ${m.lr}
Leads Antigos Contatados: ${m.la}
Indicações: ${m.ind}
Atendimento Balcão: ${m.bal}

🔹 *TOTAL GERAL*
Total Matrículas: ${f.mat + m.mat}
Valor Total Vendido: ${Utils.formatCurrency(f.val + m.val)}
Total Leads Recebidos: ${f.lr + m.lr}
Total Leads Antigos: ${f.la + m.la}
Total Indicações: ${f.ind + m.ind}
Total Balcão: ${f.bal + m.bal}

_Auto Moto Escola DanPri_ 🏍️`;

    document.getElementById('relatorio-text-preview').textContent = text;
  },

  copiar() {
    const text = document.getElementById('relatorio-text-preview').textContent;
    if (!text) { Utils.toast('Gere o relatório primeiro.', 'error'); return; }
    navigator.clipboard.writeText(text)
      .then(() => Utils.toast('Relatório copiado!', 'success'))
      .catch(() => {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        Utils.toast('Relatório copiado!', 'success');
      });
  },

  // Salva/atualiza o documento na coleção "reports" (upsert)
  async salvar() {
    const selEl         = document.getElementById('rel-consultora');
    // value agora é o nome completo, igual ao campo "consultant" no Firestore
    const consultantName = selEl.value || Auth.getName();
    const date           = document.getElementById('rel-data').value;

    if (!consultantName || !date) { Utils.toast('Gere o relatório primeiro.', 'error'); return; }

    const franco  = this._readForm('franco');
    const morato  = this._readForm('morato');
    const summary = {
      mat: franco.mat + morato.mat, val: franco.val + morato.val,
      lr:  franco.lr  + morato.lr,  la:  franco.la  + morato.la,
      bal: franco.bal + morato.bal,  ind: franco.ind + morato.ind
    };

    const payload = {
      consultant: consultantName, consultoraNome: consultantName, date,
      franco, morato, summary,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
      if (this._docId) {
        await db.collection('reports').doc(this._docId).update(payload);
      } else {
        payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        const ref = await db.collection('reports').add(payload);
        this._docId = ref.id;
      }
      Utils.toast('Dados salvos no Firebase!', 'success');
    } catch (e) {
      Utils.toast('Erro ao salvar: ' + e.message, 'error');
    }
  }
};
