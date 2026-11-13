import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { garantirContas } from '../scripts/contas-admin';
import { CONTAS } from '../src/domain/contas';
import { SENHA_TESTE } from './dados';

// Cria as 8 contas no emulador de login, com o mesmo código do script real.
export default async function globalSetup() {
  if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error('Os testes de tela precisam do emulador: rode "npm run test:e2e".');
  }
  const app = getApps()[0] ?? initializeApp({ projectId: 'demo-portal-p3' });
  await garantirContas(getAuth(app), CONTAS, () => SENHA_TESTE);
}
