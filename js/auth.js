// Authentication
const Auth = {
  currentUser: null,

  async init() {
    const saved = localStorage.getItem('danpri_user');
    if (saved) {
      try {
        this.currentUser = JSON.parse(saved);
        return true;
      } catch (e) {
        localStorage.removeItem('danpri_user');
      }
    }
    return false;
  },

  async login(username, password) {
    const snap = await db.collection('users')
      .where('username', '==', username.trim())
      .where('active', '==', true)
      .get();

    if (snap.empty) return { ok: false, msg: 'Usuário não encontrado ou desativado.' };

    const doc = snap.docs[0];
    const user = { id: doc.id, ...doc.data() };

    if (user.password !== password) return { ok: false, msg: 'Senha incorreta.' };

    this.currentUser = user;
    localStorage.setItem('danpri_user', JSON.stringify(user));
    return { ok: true, user };
  },

  logout() {
    this.currentUser = null;
    localStorage.removeItem('danpri_user');
  },

  isAdmin() {
    return this.currentUser && this.currentUser.role === 'admin';
  },

  getUsername() {
    return this.currentUser ? this.currentUser.username : null;
  },

  getName() {
    return this.currentUser ? this.currentUser.name : null;
  },

  // Refresh user data from Firestore
  async refresh() {
    if (!this.currentUser) return;
    try {
      const doc = await db.collection('users').doc(this.currentUser.id).get();
      if (doc.exists) {
        this.currentUser = { id: doc.id, ...doc.data() };
        localStorage.setItem('danpri_user', JSON.stringify(this.currentUser));
      }
    } catch (e) { /* ignore */ }
  }
};
