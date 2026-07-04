// Admin — Gerenciar Consultoras
const Admin = {
  consultoras: [],

  async load() {
    const snap = await db.collection('users').orderBy('name').get();
    this.consultoras = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    this.render();
  },

  render() {
    const list = document.getElementById('admin-consultoras-list');
    if (this.consultoras.length === 0) {
      list.innerHTML = '<p style="color:var(--text-muted)">Nenhuma consultora cadastrada.</p>';
      return;
    }

    list.innerHTML = this.consultoras.map(c => {
      const isAdmin = c.role === 'admin';
      const inactive = !c.active;
      return `
        <div class="admin-card ${inactive ? 'inactive' : ''}">
          <div class="admin-avatar ${inactive ? 'inactive-avatar' : ''}">${(c.name || '?')[0].toUpperCase()}</div>
          <div class="admin-info">
            <div class="admin-name">${c.name || '-'} ${isAdmin ? '<span style="color:var(--gold);font-size:11px">[Admin]</span>' : ''}</div>
            <div class="admin-username">@${c.username}</div>
            <div class="admin-meta">
              ${!isAdmin && c.meta ? `Meta: ${c.meta.matriculas || 0} mat. | ${Utils.formatCurrency(c.meta.valor || 0)}` : ''}
              ${inactive ? ' <span style="color:var(--danger)">— Desativada</span>' : ''}
            </div>
          </div>
          <div class="admin-actions">
            <button class="btn btn-outline btn-sm" onclick="Admin.openEdit('${c.id}')">✏️ Editar</button>
            ${!isAdmin ? `
              ${c.active
                ? `<button class="btn btn-outline btn-sm" style="color:#ff9800;border-color:#ff9800" onclick="Admin.toggleActive('${c.id}', false)">🔒 Desativar</button>`
                : `<button class="btn btn-outline btn-sm" style="color:var(--success);border-color:var(--success)" onclick="Admin.toggleActive('${c.id}', true)">🔓 Reativar</button>`
              }
              <button class="btn btn-danger btn-sm" onclick="Admin.confirmDelete('${c.id}')">🗑️ Excluir</button>
            ` : ''}
          </div>
        </div>`;
    }).join('');
  },

  openAddModal() {
    document.getElementById('modal-consultora-title').textContent = 'Nova Consultora';
    document.getElementById('consultora-id').value = '';
    document.getElementById('consultora-nome').value = '';
    document.getElementById('consultora-username').value = '';
    document.getElementById('consultora-senha').value = '';
    document.getElementById('consultora-senha').placeholder = 'Senha obrigatória';
    document.getElementById('consultora-meta-mat').value = '0';
    document.getElementById('consultora-meta-val').value = '0';
    document.getElementById('modal-consultora').classList.remove('hidden');
  },

  openEdit(id) {
    const c = this.consultoras.find(x => x.id === id);
    if (!c) return;
    document.getElementById('modal-consultora-title').textContent = 'Editar Consultora';
    document.getElementById('consultora-id').value = id;
    document.getElementById('consultora-nome').value = c.name || '';
    document.getElementById('consultora-username').value = c.username || '';
    document.getElementById('consultora-senha').value = '';
    document.getElementById('consultora-senha').placeholder = 'Deixe em branco para manter';
    document.getElementById('consultora-meta-mat').value = (c.meta && c.meta.matriculas) || 0;
    document.getElementById('consultora-meta-val').value = (c.meta && c.meta.valor) || 0;
    document.getElementById('modal-consultora').classList.remove('hidden');
  },

  async save() {
    const id = document.getElementById('consultora-id').value;
    const name = document.getElementById('consultora-nome').value.trim();
    const username = document.getElementById('consultora-username').value.trim();
    const senha = document.getElementById('consultora-senha').value;
    const metaMat = parseInt(document.getElementById('consultora-meta-mat').value) || 0;
    const metaVal = parseFloat(document.getElementById('consultora-meta-val').value) || 0;

    if (!name || !username) { Utils.toast('Nome e usuário são obrigatórios.', 'error'); return; }

    // Check duplicate username
    if (!id || this.consultoras.find(c => c.username === username && c.id !== id)) {
      const existing = await db.collection('users').where('username', '==', username).get();
      if (!existing.empty && existing.docs[0].id !== id) {
        Utils.toast('Usuário já existe.', 'error'); return;
      }
    }

    const data = {
      name,
      username,
      meta: { matriculas: metaMat, valor: metaVal },
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (senha) data.password = senha;

    try {
      if (id) {
        await db.collection('users').doc(id).update(data);
        Utils.toast('Consultora atualizada!', 'success');
      } else {
        if (!senha) { Utils.toast('Senha é obrigatória para nova consultora.', 'error'); return; }
        await db.collection('users').add({
          ...data,
          password: senha,
          role: 'consultant',
          active: true,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        Utils.toast('Consultora cadastrada!', 'success');
      }
      App.closeModal('modal-consultora');
      await this.load();
    } catch (e) {
      Utils.toast('Erro: ' + e.message, 'error');
    }
  },

  async toggleActive(id, active) {
    const c = this.consultoras.find(x => x.id === id);
    const action = active ? 'reativar' : 'desativar';
    Utils.confirmAction(
      `${active ? 'Reativar' : 'Desativar'} Consultora`,
      `Deseja ${action} "${c ? c.name : ''}"?`,
      null,
      async () => {
        await db.collection('users').doc(id).update({ active });
        Utils.toast(`Consultora ${active ? 'reativada' : 'desativada'}!`, 'success');
        await this.load();
      }
    );
  },

  confirmDelete(id) {
    const c = this.consultoras.find(x => x.id === id);
    Utils.confirmAction(
      'Excluir Consultora',
      `Excluir "${c ? c.name : ''}" permanentemente? O histórico de vendas será mantido.`,
      null,
      () => Utils.doubleConfirm(
        `Excluir permanentemente "${c ? c.name : ''}"?`,
        () => this.deleteConsultora(id)
      )
    );
  },

  async deleteConsultora(id) {
    try {
      await db.collection('users').doc(id).delete();
      Utils.toast('Consultora excluída.', 'success');
      await this.load();
    } catch (e) {
      Utils.toast('Erro: ' + e.message, 'error');
    }
  }
};
