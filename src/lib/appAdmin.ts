import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth,
  inMemoryPersistence,
  initializeAuth,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { connectFirestoreEmulator, initializeFirestore, memoryLocalCache, type Firestore } from 'firebase/firestore';
import { CONTA_ADMIN } from '../domain/contas';
import { firebaseConfig, usarEmulador } from './firebase';

// Login do Administrador numa "segunda conexão" com o Firebase, separada da sessão da P/3:
// a P/3 continua logada e o Administrador só existe enquanto a aba estiver aberta (nada fica salvo no aparelho).

let app: FirebaseApp | null = null;

/** Entra com a senha do Administrador e devolve o banco já com essa permissão. */
export async function entrarAdmin(senha: string): Promise<Firestore> {
  await sairAdmin();
  const novo = initializeApp(usarEmulador ? { ...firebaseConfig, projectId: 'demo-portal-p3' } : firebaseConfig, 'admin');
  const auth = initializeAuth(novo, { persistence: inMemoryPersistence });
  const db = initializeFirestore(novo, { localCache: memoryLocalCache() });
  if (usarEmulador) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }
  app = novo;
  try {
    const cred = await signInWithEmailAndPassword(auth, CONTA_ADMIN.email, senha);
    const token = await cred.user.getIdTokenResult();
    if (token.claims.perfil !== 'admin') throw new Error('sem-perfil-admin');
    return db;
  } catch (erro) {
    await sairAdmin();
    throw erro;
  }
}

export async function sairAdmin(): Promise<void> {
  if (!app) return;
  const velho = app;
  app = null;
  try {
    await signOut(getAuth(velho));
  } catch {
    /* já saiu */
  }
  await deleteApp(velho);
}
