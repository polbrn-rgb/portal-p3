import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { garantirContas } from '../scripts/contas-admin';
import { TODAS_CONTAS } from '../src/domain/contas';
import { SENHA_TESTE } from './dados';

// Cria as contas no emulador de login, com o mesmo código do script real, e um policial no banco de efetivo.
export default async function globalSetup() {
  if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error('Os testes de tela precisam do emulador: rode "npm run test:e2e".');
  }
  const app = getApps()[0] ?? initializeApp({ projectId: 'demo-portal-p3' });
  await garantirContas(getAuth(app), TODAS_CONTAS, () => SENHA_TESTE);
  await getFirestore(app)
    .doc('efetivo/123456')
    .set({ re: '123456-7', posto: 'Cb PM', nomeGuerra: 'SILVA', telefone: '(11) 90000-0000' });
}
