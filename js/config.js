// Firebase Config — projeto relatorio-matriculas (Firestore)
const firebaseConfig = {
  apiKey: "AIzaSyBZEUG37Btkz_FvDm1CkjLZz1ppktRG7uU",
  authDomain: "relatorio-matriculas.firebaseapp.com",
  projectId: "relatorio-matriculas",
  storageBucket: "relatorio-matriculas.firebasestorage.app",
  messagingSenderId: "982922978961",
  appId: "1:982922978961:web:e78b6585baa9fe8914c130",
  measurementId: "G-S409ZV2795"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Seed default users only if the users collection is empty
const DEFAULT_USERS = [
  { username: 'admin',        name: 'Administrador', role: 'admin',      password: 'danpri2024', active: true, meta: { matriculas: 0,  valor: 0     } },
  { username: 'thais.lopes',  name: 'Thais Lopes',   role: 'consultant', password: '1234',       active: true, meta: { matriculas: 20, valor: 30000 } },
  { username: 'thais.santos', name: 'Thais Santos',  role: 'consultant', password: '1234',       active: true, meta: { matriculas: 20, valor: 30000 } },
  { username: 'jaqueline',    name: 'Jaqueline',     role: 'consultant', password: '1234',       active: true, meta: { matriculas: 20, valor: 30000 } },
  { username: 'alecia',       name: 'Alecia',        role: 'consultant', password: '1234',       active: true, meta: { matriculas: 20, valor: 30000 } },
  { username: 'fernanda',     name: 'Fernanda',      role: 'consultant', password: '1234',       active: true, meta: { matriculas: 20, valor: 30000 } },
];

async function seedDefaultUsers() {
  const snap = await db.collection('users').limit(1).get();
  if (!snap.empty) return;
  const batch = db.batch();
  DEFAULT_USERS.forEach(u => {
    batch.set(db.collection('users').doc(), {
      ...u,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  });
  await batch.commit();
  console.log('[DanPri] Default users seeded.');
}

seedDefaultUsers().catch(console.error);
