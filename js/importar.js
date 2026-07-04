// Importar Planilha module
const Importar = {
  francoWorkbook: null,
  moratoWorkbook: null,
  francoFileName: '',
  moratoFileName: '',

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

  rowToRecord(row, unidade) {
    const dateStr = Utils.parseExcelDate(row[0]);
    if (!dateStr) return null;

    const consultoraNome = Utils.normalizeConsultantName(row[4]);
    const consultant = Utils.consultantNameToUsername(consultoraNome);
    const valor = parseFloat(String(row[5]).replace(',', '.').replace(/[^\d.]/g, '')) || 0;
    const tipos = Utils.typesFromRow(row);

    return {
      date: dateStr,
      month: Utils.dateToMonth(dateStr),
      consultant,
      consultoraNome,
      unidade,
      origem: String(row[1] || '').trim(),
      plano: String(row[2] || '').trim(),
      formaPagamento: String(row[3] || '').trim(),
      valor,
      tipos,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
  },

  async importUnit(unit) {
    const wb = unit === 'franco' ? this.francoWorkbook : this.moratoWorkbook;
    if (!wb) { Utils.toast('Selecione um arquivo primeiro.', 'error'); return; }

    if (!Auth.isAdmin() && unit === 'morato') {
      // Non-admins can only import their own data
    }

    const modo = document.getElementById('import-modo').value;
    const targetDate = document.getElementById('import-data').value;
    const targetSheetName = document.getElementById('import-mes-nome').value;
    const unidade = unit === 'franco' ? 'Franco da Rocha' : 'Francisco Morato';

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

    const records = toImport.map(r => this.rowToRecord(r, unidade)).filter(Boolean);

    Utils.confirmAction(
      'Confirmar Importação',
      `Importar ${records.length} registro(s) de "${sheetName}" para ${unidade}?`,
      records.length,
      () => this.doImport(records, unit)
    );
  },

  async doImport(records, unit) {
    const progressEl = document.getElementById(`${unit}-progress`);
    const fillEl = document.getElementById(`${unit}-progress-fill`);
    const textEl = document.getElementById(`${unit}-progress-text`);

    progressEl.classList.remove('hidden');
    document.getElementById(`btn-import-${unit}`).disabled = true;

    let done = 0;
    const batchSize = 500;

    for (let i = 0; i < records.length; i += batchSize) {
      const chunk = records.slice(i, i + batchSize);
      const batch = db.batch();
      chunk.forEach(r => {
        const ref = db.collection('reports').doc();
        batch.set(ref, r);
      });
      await batch.commit();
      done += chunk.length;
      const pct = Math.round((done / records.length) * 100);
      fillEl.style.width = pct + '%';
      textEl.textContent = `${pct}% — ${done}/${records.length}`;
    }

    Utils.toast(`✅ ${records.length} registro(s) importados com sucesso!`, 'success');
    document.getElementById(`btn-import-${unit}`).disabled = false;

    // Reload current page if it's vendas or dashboard
    if (App.currentPage === 'vendas') await Vendas.load(App.currentMonth);
    if (App.currentPage === 'dashboard') await Dashboard.load(App.currentMonth);
  }
};
