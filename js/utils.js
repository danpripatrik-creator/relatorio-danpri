// Utility functions

const Utils = {
  formatCurrency(val) {
    const n = parseFloat(val) || 0;
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  },

  formatDate(str) {
    if (!str) return '-';
    const [y, m, d] = str.split('-');
    if (!y || !m || !d) return str;
    return `${d}/${m}/${y}`;
  },

  todayStr() {
    return new Date().toISOString().split('T')[0];
  },

  currentMonthStr() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  },

  monthLabel(str) {
    if (!str) return '';
    const [y, m] = str.split('-');
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    return `${months[parseInt(m) - 1]}/${y}`;
  },

  monthLabelFull(str) {
    if (!str) return '';
    const [y, m] = str.split('-');
    const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    return `${months[parseInt(m) - 1]} ${y}`;
  },

  generateMonthOptions(selectEl, selectedVal, fromYear = 2024) {
    const now = new Date();
    const options = [];
    for (let y = now.getFullYear(); y >= fromYear; y--) {
      const maxM = (y === now.getFullYear()) ? now.getMonth() + 1 : 12;
      for (let mo = maxM; mo >= 1; mo--) {
        const val = `${y}-${String(mo).padStart(2, '0')}`;
        options.push(val);
      }
    }
    selectEl.innerHTML = options.map(v =>
      `<option value="${v}" ${v === selectedVal ? 'selected' : ''}>${Utils.monthLabelFull(v)}</option>`
    ).join('');
  },

  dateToMonth(dateStr) {
    if (!dateStr) return '';
    return dateStr.substring(0, 7);
  },

  // Returns { start: "YYYY-MM-01", end: "YYYY-MM-DD" } for a month string "YYYY-MM"
  monthDateRange(monthStr) {
    const [y, m] = monthStr.split('-');
    const lastDay = new Date(parseInt(y), parseInt(m), 0).getDate();
    return {
      start: `${y}-${m}-01`,
      end:   `${y}-${m}-${String(lastDay).padStart(2, '0')}`
    };
  },

  excelDateToString(serial) {
    if (!serial) return '';
    if (typeof serial === 'string') return serial;
    const utc = new Date(Date.UTC(1899, 11, 30));
    utc.setDate(utc.getDate() + serial);
    const y = utc.getUTCFullYear();
    const m = String(utc.getUTCMonth() + 1).padStart(2, '0');
    const d = String(utc.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  },

  parseExcelDate(val) {
    if (!val) return '';
    if (typeof val === 'number') return Utils.excelDateToString(val);
    if (val instanceof Date) {
      const y = val.getFullYear();
      const m = String(val.getMonth() + 1).padStart(2, '0');
      const d = String(val.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    // Try parse "DD/MM/YYYY"
    const str = String(val).trim();
    const m1 = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m1) return `${m1[3]}-${m1[2].padStart(2,'0')}-${m1[1].padStart(2,'0')}`;
    const m2 = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m2) return str;
    return str;
  },

  isMarked(val) {
    if (!val) return false;
    return String(val).toLowerCase().trim() === 'x';
  },

  typesFromRow(row) {
    const types = [];
    if (Utils.isMarked(row[6])) types.push('M');
    if (Utils.isMarked(row[7])) types.push('RC');
    if (Utils.isMarked(row[8])) types.push('RN');
    if (Utils.isMarked(row[9])) types.push('PT');
    if (Utils.isMarked(row[10])) types.push('AP');
    if (Utils.isMarked(row[11])) types.push('AD');
    return types;
  },

  typeBadges(types) {
    if (!types || types.length === 0) return '<span class="tipo-badge" style="background:var(--bg4);color:var(--text-muted)">—</span>';
    return types.map(t => `<span class="tipo-badge tipo-${t}">${t}</span>`).join('');
  },

  unidadeBadge(u) {
    const cls = u === 'Franco da Rocha' ? 'unidade-franco' : 'unidade-morato';
    const short = u === 'Franco da Rocha' ? 'Franco' : 'Morato';
    return `<span class="unidade-badge ${cls}">${short}</span>`;
  },

  // Toasts
  toast(msg, type = 'success', duration = 3500) {
    const container = document.getElementById('toast-container');
    const icons = { success: '✅', error: '❌', info: 'ℹ️' };
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<span>${icons[type] || '🔔'}</span><span>${msg}</span>`;
    container.appendChild(el);
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 350);
    }, duration);
  },

  async confirmAction(title, message, count, onConfirm) {
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = message;
    const countEl = document.getElementById('confirm-count');
    if (count !== null && count !== undefined) {
      countEl.textContent = `${count} registro(s) serão afetados.`;
      countEl.classList.remove('hidden');
    } else {
      countEl.classList.add('hidden');
    }
    document.getElementById('modal-confirm').classList.remove('hidden');
    const btn = document.getElementById('confirm-btn-action');
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.addEventListener('click', () => {
      App.closeModal('modal-confirm');
      onConfirm();
    });
  },

  async doubleConfirm(message, onConfirm) {
    document.getElementById('confirm2-message').textContent = message;
    document.getElementById('confirm2-input').value = '';
    document.getElementById('modal-confirm2').classList.remove('hidden');
    const btn = document.getElementById('confirm2-btn-action');
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.addEventListener('click', () => {
      const val = document.getElementById('confirm2-input').value.trim();
      if (val !== 'CONFIRMAR') {
        Utils.toast('Digite exatamente CONFIRMAR para prosseguir.', 'error');
        return;
      }
      App.closeModal('modal-confirm2');
      onConfirm();
    });
  },

  exportToExcel(data, filename) {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Dados');
    XLSX.writeFile(wb, filename);
  },

  normalizeConsultantName(raw) {
    if (!raw) return raw;
    const s = String(raw).trim().toLowerCase();
    const map = {
      'thais lopes': 'Thais Lopes',
      'thaís lopes': 'Thais Lopes',
      'thais santos': 'Thais Santos',
      'thaís santos': 'Thais Santos',
      'jaqueline': 'Jaqueline',
      'jacqueline': 'Jaqueline',
      'alecia': 'Alecia',
      'alécia': 'Alecia',
      'fernanda': 'Fernanda',
    };
    for (const [k, v] of Object.entries(map)) {
      if (s.includes(k)) return v;
    }
    return raw.trim();
  },

  consultantNameToUsername(name) {
    const map = {
      'Thais Lopes': 'thais.lopes',
      'Thais Santos': 'thais.santos',
      'Jaqueline': 'jaqueline',
      'Alecia': 'alecia',
      'Fernanda': 'fernanda',
    };
    return map[name] || name.toLowerCase().replace(/\s+/g, '.');
  }
};
