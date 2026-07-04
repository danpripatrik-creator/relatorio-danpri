// Main App Controller
const App = {
  currentPage: 'dashboard',
  currentMonth: Utils.currentMonthStr(),
  consultoras: [],

  async init() {
    const loggedIn = await Auth.init();
    if (loggedIn) { this.showApp(); } else { this.showLogin(); }

    document.getElementById('login-form').addEventListener('submit', async e => {
      e.preventDefault();
      const btn = document.getElementById('login-btn');
      btn.textContent = 'Entrando...'; btn.disabled = true;
      const result = await Auth.login(
        document.getElementById('login-username').value,
        document.getElementById('login-password').value
      );
      if (result.ok) {
        this.showApp();
      } else {
        const err = document.getElementById('login-error');
        err.textContent = result.msg;
        err.classList.remove('hidden');
        btn.textContent = 'Entrar'; btn.disabled = false;
      }
    });

    document.getElementById('btn-logout').addEventListener('click', () => {
      this._stopListeners();
      Auth.logout();
      location.reload();
    });

    document.querySelectorAll('.nav-item[data-page]').forEach(el => {
      el.addEventListener('click', e => {
        e.preventDefault();
        this.navigate(el.dataset.page);
        if (window.innerWidth < 900) document.getElementById('sidebar').classList.remove('open');
      });
    });

    document.getElementById('sidebar-toggle').addEventListener('click', () => {
      document.getElementById('sidebar').classList.toggle('open');
    });

    const monthSel = document.getElementById('month-selector');
    Utils.generateMonthOptions(monthSel, this.currentMonth);
    monthSel.addEventListener('change', () => {
      this.currentMonth = monthSel.value;
      this.reloadCurrentPage();
    });

    document.getElementById('btn-nova-venda').addEventListener('click', () => this.openNovaVenda());
    document.getElementById('form-nova-venda').addEventListener('submit', async e => {
      e.preventDefault();
      await this.submitNovaVenda();
    });
    document.getElementById('form-consultora').addEventListener('submit', async e => {
      e.preventDefault();
      await Admin.save();
    });

    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', e => {
        if (e.target === overlay) overlay.classList.add('hidden');
      });
    });
  },

  async showApp() {
    document.getElementById('login-view').classList.add('hidden');
    document.getElementById('app-view').classList.remove('hidden');

    const user = Auth.currentUser;
    document.getElementById('sidebar-username').textContent = user.name || user.username;
    document.getElementById('sidebar-role').textContent     = user.role === 'admin' ? 'Administrador' : 'Consultora';
    document.getElementById('sidebar-avatar').textContent   = (user.name || user.username)[0].toUpperCase();

    if (!Auth.isAdmin()) {
      document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
    }

    await this.loadConsultoras();
    this.populateConsultoraSelects();
    Vendas.initFilters();
    Importar.init();
    await this.navigate('dashboard');
  },

  showLogin() {
    document.getElementById('login-view').classList.remove('hidden');
    document.getElementById('app-view').classList.add('hidden');
  },

  async loadConsultoras() {
    const snap = await db.collection('users')
      .where('role', '==', 'consultant')
      .where('active', '==', true)
      .get();
    this.consultoras = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  populateConsultoraSelects() {
    [
      document.getElementById('venda-consultora'),
      document.getElementById('vnd-filter-consultora'),
      document.getElementById('hist-filter-consultora'),
    ].forEach(sel => {
      if (!sel) return;
      const cur    = sel.value;
      const hasAll = sel.id !== 'venda-consultora';
      // value = nome completo para bater com o campo "consultant" do Firestore
      sel.innerHTML = (hasAll ? '<option value="">Todas as Consultoras</option>' : '<option value="">Selecione...</option>') +
        this.consultoras.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
      if (cur) sel.value = cur;
    });

    if (!Auth.isAdmin()) {
      const selC = document.getElementById('venda-consultora');
      selC.value    = Auth.getName();   // nome completo, igual ao campo consultant do Firestore
      selC.disabled = true;
      document.querySelectorAll('.admin-only-field').forEach(el => el.style.display = 'none');
    }
  },

  _stopListeners() {
    Dashboard.stop();
    Vendas.stop();
  },

  async navigate(page) {
    // Para listeners ativos antes de mudar de página
    this._stopListeners();

    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
    document.querySelectorAll('.nav-item').forEach(el =>
      el.classList.toggle('active', el.dataset.page === page)
    );

    this.currentPage = page;

    const titles = {
      dashboard: 'Dashboard',
      vendas:    'Registro de Vendas',
      historico: 'Histórico Completo',
      importar:  'Importar Planilha',
      relatorio: 'Relatório WhatsApp',
      limpeza:   'Limpeza de Dados',
      admin:     'Gerenciar Consultoras'
    };
    document.getElementById('topbar-title').textContent = titles[page] || page;

    const el = document.getElementById(`page-${page}`);
    if (el) el.classList.remove('hidden');

    document.getElementById('btn-nova-venda').style.display =
      ['dashboard', 'vendas'].includes(page) ? '' : 'none';

    await this.reloadCurrentPage();
  },

  async reloadCurrentPage() {
    try {
      switch (this.currentPage) {
        case 'dashboard':
          Dashboard.listen(this.currentMonth);          // tempo real
          break;
        case 'vendas':
          await Vendas.loadConsultoras();
          Vendas.listen(this.currentMonth);             // tempo real
          break;
        case 'historico':
          Historico.initFilters();
          await Historico.load(document.getElementById('hist-filter-mes').value || this.currentMonth);
          break;
        case 'importar':
          break;
        case 'relatorio':
          await Relatorio.init();
          break;
        case 'limpeza':
          Limpeza.initSelects();
          break;
        case 'admin':
          if (Auth.isAdmin()) await Admin.load();
          break;
      }
    } catch (e) {
      console.error('[App] reloadCurrentPage:', e);
      Utils.toast('Erro ao carregar dados: ' + e.message, 'error');
    }
  },

  openNovaVenda() {
    document.getElementById('modal-venda-title').textContent = 'Novo Lançamento';
    document.getElementById('venda-id').value   = '';
    document.getElementById('venda-data').value = Utils.todayStr();

    // Zera todos os campos numéricos
    ['franco','morato'].forEach(unit => {
      ['mat','val','lr','la','bal','ind'].forEach(f => {
        document.getElementById(`venda-${unit}-${f}`).value = 0;
      });
    });

    if (Auth.isAdmin()) {
      document.getElementById('venda-consultora').value = '';
    } else {
      document.getElementById('venda-consultora').value = Auth.getName(); // nome = valor dos options
    }
    document.getElementById('modal-nova-venda').classList.remove('hidden');
  },

  async submitNovaVenda() {
    const id       = document.getElementById('venda-id').value;
    const date     = document.getElementById('venda-data').value;
    // value do select é o nome completo (igual ao campo "consultant" do Firestore)
    const consultantName = document.getElementById('venda-consultora').value || Auth.getName();

    if (!date || !consultantName) {
      Utils.toast('Data e Consultora são obrigatórios.', 'error'); return;
    }

    const consultoraNome = consultantName;

    await Vendas.save({
      id, date, consultant: consultantName, consultoraNome,
      'franco-mat': document.getElementById('venda-franco-mat').value,
      'franco-val': document.getElementById('venda-franco-val').value,
      'franco-lr':  document.getElementById('venda-franco-lr').value,
      'franco-la':  document.getElementById('venda-franco-la').value,
      'franco-bal': document.getElementById('venda-franco-bal').value,
      'franco-ind': document.getElementById('venda-franco-ind').value,
      'morato-mat': document.getElementById('venda-morato-mat').value,
      'morato-val': document.getElementById('venda-morato-val').value,
      'morato-lr':  document.getElementById('venda-morato-lr').value,
      'morato-la':  document.getElementById('venda-morato-la').value,
      'morato-bal': document.getElementById('venda-morato-bal').value,
      'morato-ind': document.getElementById('venda-morato-ind').value,
    });
  },

  closeModal(id) {
    document.getElementById(id).classList.add('hidden');
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
