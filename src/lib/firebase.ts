import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';

// Estes dados identificam o projeto e não são secretos.
// Quem protege os dados são as regras do Firestore (firestore.rules).
const firebaseConfig = {
  apiKey: 'AIzaSyAwEs2x5y2G7VKvzTWPj0sekb_V9YtjjSg',
  authDomain: 'portal-p3.firebaseapp.com',
  projectId: 'portal-p3',
  storageBucket: 'portal-p3.firebasestorage.app',
  messagingSenderId: '131519876159',
  appId: '1:131519876159:web:f9edb11c2fbed29b8bbc8a',
};

const usarEmulador = import.meta.env.VITE_USE_EMULATORS === 'true';

// Com o emulador, usa um projeto "demo-": nada sai do computador.
export const app = initializeApp(
  usarEmulador ? { ...firebaseConfig, projectId: 'demo-portal-p3' } : firebaseConfig,
);

// Cache local: abrir a mesma lista de novo não gasta leitura da cota.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

export const auth = getAuth(app);

if (usarEmulador) {
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
}
