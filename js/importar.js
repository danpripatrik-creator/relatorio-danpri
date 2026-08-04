// Importar Planilha module
const Importar = {
  francoWorkbook: null,
  moratoWorkbook: null,
  francoFileName: '',
  moratoFileName: '',
  consultantsByFold: null, // cache: nome "dobrado" (sem acento/caixa) -> nome real cadastrado
  unmatchedNames: [],      // nomes da planilha que não bateram com nenhuma consultora cadastrada

  // Busca as consultoras cadastradas no banco (não uma lista fixa) — assim, qualquer
  // consultora nova adicionada em "Gerenciar Consultoras" já funciona aqui automaticamente.
  async loadConsultants() {
    const snap = await db.collection('users').get();
    const map = new Map();
    snap.docs.forEach(d => {
      const u = d.data();
      if (u.name) map.set(Utils.foldName(u.name), u.name);
    });
    this.consultantsByFold = map;
    return map;
  },

  // Resolve o nome cru da planilha pro nome exato cadastrado no banco.
  // Se não achar, mantém o nome da planilha (capitalizado) e registra como "não encontrado" pra avisar o usuário.
  resolveConsultantName(rawName) {
    const folded = Utils.foldName(rawName);
    const known = this.consultantsByFold?.get(folded);
    if (known) return known;

    const fallback = String(rawName).trim().toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase());
    if (!this.unmatchedNames.includes(fallback)) this.unmatchedNames.push(fallback);
    return fallback;
  },

  init() {
    // Drop zone clicks
    document.getElementById('drop-franco').addEventListener('click', () => {
      document.getElementById('file-franco').click();
    });
    document.getElementById('drop-morato').addEventListener('click', () => {
      document.getElementById('file-morato').click();
    });

    document.getElementById('btn-import-franco').addEventListener('click', () => this.importUnit('franco'));
    document.getElementById('btn-import-morato').addEventListener('click', () => this.importUnit('morato'));

    document.getElementById('import-modo').addEventListener('change', (e) => {
      const modo = e.target.value;
      document.getElementById('import-data-group').style.display = modo === 'dia' ? '' : 'none';
      document.getElementById('import-mes-group').style.display = modo === 'mes' ? '' : 'none';
    });
  },

  handleFileSelect(event, unit) {
    const file = event.target.files[0];
    if (file) this.loadFile(file, unit);
  },

  handleDrop(event, unit) {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) this.loadFile(file, unit);
    document.getElementById(`drop-${unit}`).classList.remove('drag-over');
  },

  loadFile(file, unit) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'binary', cellDates: true });
        if (unit === 'franco') {
          this.francoWorkbook = wb;
          this.francoFileName = file.name;
        } else {
          this.moratoWorkbook = wb;
          this.moratoFileName = file.name;
        }
        this.showFileInfo(unit, file.name, wb);
        document.getElementById(`btn-import-${unit}`).disabled = false;
      } catch (err) {
        Utils.toast('Erro ao ler arquivo: ' + err.message, 'error');
      }
    };
    reader.readAsBinaryString(file);
  },

  showFileInfo(unit, filename, wb) {
    const infoEl = document.getElementById(`${unit}-file-info`);
    infoEl.textContent = `📄 ${filename} — Abas: ${wb.SheetNames.join(', ')}`;
    infoEl.classList.remove('hidden');

    const previewEl = document.getElementById(`${unit}-preview`);
    previewEl.innerHTML = `<strong>Abas encontradas:</strong><br>` +
      wb.SheetNames.map(s => `<span style="color:var(--gold)">• ${s}</span>`).join('<br>');
    previewEl.classList.remove('hidden');
  },

  getSheetForMode(wb, mode, targetDate, targetSheetName) {
    if (mode === 'mes') {
      // Find sheet by name (case insensitive)
      const sheetName = wb.SheetNames.find(s =>
        s.toLowerCase().includes(targetSheetName.toLowerCase())
      ) || wb.SheetNames[0];
      return { sheet: wb.Sheets[sheetName], sheetName };
    }

    // For "dia" mode - try to find sheet by date's month/year
    const [y, m] = targetDate.split('-');
    const months = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO',
      'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
    const monthName = months[parseInt(m) - 1];
    const sheetName = wb.SheetNames.find(s =>
      s.toUpperCase().includes(monthName) && s.includes(y)
    ) || wb.SheetNames.find(s => s.toUpperCase().includes(monthName)) || wb.SheetNames[0];

    return { sheet: wb.Sheets[sheetName], sheetName };
  },

  parseSheet(sheet) {
    const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    // Skip first 3 rows (header), row 4 = column titles (index 3), data from row 5 (index 4)
    const dataRows = raw.slice(4).filter(row => {
      const dateVal = row[0];
      return dateVal !== null && dateVal !== undefined && dateVal !== '';
    });
    return dataRows;
  },

  // Um registro "cru" por linha da planilha (uma venda individual)
  rowToRaw(row) {
    // Algumas planilhas repetem a linha de cabeçalho (Data/ORIGEM/.../VENDEDORA) no início
    // do bloco de cada consultora — isso não é uma venda, precisa ser ignorado.
    if (String(row[0]).trim().toLowerCase() === 'data') return null;

    const dateStr = Utils.parseExcelDate(row[0]);
    if (!dateStr) return null;

    const rawName = row[4];
    if (!rawName || !String(rawName).trim()) return null;
    const consultoraNome = this.resolveConsultantName(rawName);
    const valor = parseFloat(String(row[5]).replace(',', '.').replace(/[^\d.]/g, '')) || 0;
    const tipos = Utils.typesFromRow(row);
    // Matrícula = M (matrícula nova) + AD (adição de categoria) somados juntos, por decisão do Patrik
    const isMatricula = tipos.includes('M') || tipos.includes('AD');

    return { date: dateStr, consultoraNome, valor, isMatricula };
  },

  // Agrupa as vendas por dia + consultora — é essa combinação que vira UM documento
  // no Firestore (mesma estrutura usada pelo Registro de Vendas manual: reports.franco / reports.morato = { mat, val }).
  // "mat" = quantidade de linhas marcadas como "M" (matrícula); "val" = soma de TODAS as vendas do dia (todos os tipos), igual ao "Total DE $" da planilha.
  aggregateByDayConsultant(rawRows) {
    const map = new Map();
    rawRows.forEach(r => {
      const key = `${r.date}__${r.consultoraNome}`;
      if (!map.has(key)) {
        map.set(key, { date: r.date, consultoraNome: r.consultoraNome, mat: 0, val: 0 });
      }
      const entry = map.get(key);
      entry.val += r.valor;
      if (r.isMatricula) entry.mat += 1;
    });
    return [...map.values()];
  },

  // Gera um ID de documento determinístico (data + consultora), sem acentos/espaços,
  // pra reimportar o mesmo dia sempre atualizar o mesmo doc em vez de criar outro.
  docIdFor(date, consultoraNome) {
    const slug = consultoraNome
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    return `${date}_${slug}`;
  },

  async importUnit(unit) {
    const wb = unit === 'franco' ? this.francoWorkbook : this.moratoWorkbook;
    if (!wb) { Utils.toast('Selecione um arquivo primeiro.', 'error'); return; }

    const modo = document.getElementById('import-modo').value;
    const targetDate = document.getElementById('import-data').value;
    const targetSheetName = document.getElementById('import-mes-nome').value;

    if (modo === 'dia' && !targetDate) {
      Utils.toast('Selecione uma data para importar.', 'error'); return;
    }
    if (modo === 'mes' && !targetSheetName) {
      Utils.toast('Informe o nome da aba (ex: JANEIRO 2026).', 'error'); return;
    }
    if (modo === 'mes' && !Auth.isAdmin()) {
      Utils.toast('Importação de mês todo disponível apenas para Admin.', 'error'); return;
    }

    const { sheet, sheetName } = this.getSheetForMode(wb, modo, targetDate, targetSheetName);
    if (!sheet) { Utils.toast('Aba não encontrada na planilha.', 'error'); return; }

    const rows = this.parseSheet(sheet);
    let toImport = rows;

    if (modo === 'dia') {
      toImport = rows.filter(row => {
        const d = Utils.parseExcelDate(row[0]);
        return d === targetDate;
      });
    }

    if (toImport.length === 0) {
      Utils.toast('Nenhum registro encontrado para o critério selecionado.', 'info');
      return;
    }

    // Carrega a lista real de consultoras cadastradas antes de resolver os nomes da planilha
    this.unmatchedNames = [];
    await this.loadConsultants();

    const rawRows = toImport.map(r => this.rowToRaw(r)).filter(Boolean);
    const aggregated = this.aggregateByDayConsultant(rawRows);

    const totalMat = aggregated.reduce((s, a) => s + a.mat, 0);
    const totalVal = aggregated.reduce((s, a) => s + a.val, 0);
    const unidadeLabel = unit === 'franco' ? 'Franco da Rocha' : 'Francisco Morato';

    let msg = `Importar/atualizar ${aggregated.length} dia(s)-consultora de "${sheetName}" para ${unidadeLabel}? ` +
      `Total: ${totalMat} matrícula(s) — ${Utils.formatCurrency(totalVal)}. ` +
      `Isso substitui os valores de ${unit === 'franco' ? 'Franco' : 'Morato'} já gravados nesses dias (não duplica).`;

    if (this.unmatchedNames.length) {
      msg += ` ⚠️ Nome(s) na planilha sem cadastro em "Gerenciar Consultoras": ${this.unmatchedNames.join(', ')}. Serão importados assim mesmo, mas cadastre essas consultoras pra elas aparecerem certinho nos filtros.`;
    }

    Utils.confirmAction(
      'Confirmar Importação',
      msg,
      aggregated.length,
      () => this.doImport(aggregated, unit)
    );
  },

  async doImport(aggregated, unit) {
    const progressEl = document.getElementById(`${unit}-progress`);
    const fillEl = document.getElementById(`${unit}-progress-fill`);
    const textEl = document.getElementById(`${unit}-progress-text`);

    progressEl.classList.remove('hidden');
    document.getElementById(`btn-import-${unit}`).disabled = true;

    let done = 0;
    const batchSize = 400; // cada item grava 3 campos + merge; margem de segurança sob o limite de 500 do Firestore

    for (let i = 0; i < aggregated.length; i += batchSize) {
      const chunk = aggregated.slice(i, i + batchSize);
      const batch = db.batch();
      chunk.forEach(a => {
        const id = this.docIdFor(a.date, a.consultoraNome);
        const ref = db.collection('reports').doc(id);
        // merge:true + chaves com ponto = atualiza SÓ mat/val da unidade importada,
        // sem apagar lr/la/bal/ind nem os dados da outra unidade já gravados nesse dia/consultora.
        batch.set(ref, {
          date: a.date,
          consultant: a.consultoraNome,
          consultoraNome: a.consultoraNome,
          [`${unit}.mat`]: a.mat,
          [`${unit}.val`]: a.val,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      });
      await batch.commit();
      done += chunk.length;
      const pct = Math.round((done / aggregated.length) * 100);
      fillEl.style.width = pct + '%';
      textEl.textContent = `${pct}% — ${done}/${aggregated.length}`;
    }

    Utils.toast(`✅ ${aggregated.length} dia(s)-consultora sincronizados com sucesso!`, 'success');
    document.getElementById(`btn-import-${unit}`).disabled = false;

    // Reload current page if it's vendas or dashboard
    if (App.currentPage === 'vendas') await Vendas.load(App.currentMonth);
    if (App.currentPage === 'dashboard') await Dashboard.load(App.currentMonth);
  }
};
