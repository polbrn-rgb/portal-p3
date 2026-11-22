import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { garantirContas } from '../scripts/contas-admin';
import { emailDeLogin } from '../src/domain/acessos';
import { TODAS_CONTAS } from '../src/domain/contas';
import { mesReferencia } from '../src/domain/documentosMensais';
import { emailSalaCia } from '../src/domain/salaCia';
import { diasDoMes, idProducao, itensZerados } from '../src/domain/producao';
import { SENHA_TESTE } from './dados';

// Cria as contas no emulador de login, com o mesmo código do script real, e um policial no banco de efetivo.
export default async function globalSetup() {
  if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error('Os testes de tela precisam do emulador: rode "npm run test:e2e".');
  }
  const app = getApps()[0] ?? initializeApp({ projectId: 'demo-portal-p3' });
  await garantirContas(getAuth(app), TODAS_CONTAS, () => SENHA_TESTE);
  // Logins individuais (por RE), como o motor cria: chefe da P/3 (admin), operador da P/3 e um CFP.
  const auth = getAuth(app);
  for (const [re, claims] of [
    ['130155-1', { perfil: 'p3', re: '130155', admin: true }],
    ['111111-1', { perfil: 'p3', re: '111111' }],
    ['222222-2', { perfil: 'cfp', re: '222222' }],
    ['333333-3', { perfil: 'unidade', unidade: '3cia', re: '333333' }],
    ['444444-4', { perfil: 'cgp', unidade: '4cia', re: '444444' }],
  ] as const) {
    const email = emailDeLogin(re);
    const displayName = re === '333333-3' ? 'Sd PM TESTE' : undefined;
    const uid = await auth
      .getUserByEmail(email)
      .then((u) => u.uid)
      .catch(async () => (await auth.createUser({ email, password: SENHA_TESTE })).uid);
    if (displayName) await auth.updateUser(uid, { displayName });
    await auth.setCustomUserClaims(uid, claims);
  }
  // Sala de Operações da FT (conta que o motor cria quando a P/3 gera a senha).
  {
    const email = emailSalaCia('ft');
    const uid = await auth
      .getUserByEmail(email)
      .then((u) => u.uid)
      .catch(async () => (await auth.createUser({ email, password: SENHA_TESTE })).uid);
    await auth.setCustomUserClaims(uid, { perfil: 'salaCia', unidade: 'ft' });
  }
  await getFirestore(app)
    .doc('efetivo/123456')
    .set({ re: '123456-7', posto: 'Cb PM', nomeGuerra: 'SILVA', telefone: '(11) 90000-0000' });
  // Produção completa do mês de referência (todos os dias, dia e noite) da 2ª e da 5ª Cia: os Documentos Mensais
  // delas vêm pré-preenchidos. As outras Cias ficam sem produção (documento travado e alerta para a P/3).
  const db = getFirestore(app);
  const mes = mesReferencia();
  const lote = db.batch();
  for (const unidade of ['2cia', '5cia'] as const)
    for (const data of diasDoMes(mes))
      for (const pelotao of ['pelA', 'pelB'] as const)
        lote.set(db.doc(`producao/${idProducao(unidade, data, pelotao)}`), {
          unidadeId: unidade,
          data,
          mes,
          pelotao,
          itens: { ...itensZerados(), carrosRemovidos: 1, motosApreendidas: 1 },
          taloes: [],
          lancadoPor: 'teste',
          lancadoEm: new Date(),
          atualizadoPor: 'teste',
          atualizadoEm: new Date(),
        });
  await lote.commit();
}
