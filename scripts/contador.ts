// Define de qual número a numeração das demandas continua (usar no dia em que o portal entrar no ar).
//
// Uso:
//   npm run contador                 mostra o último número usado
//   npm run contador -- 2150         a próxima demanda será a 2151
//   npm run contador -- 2150 --forcar  permite voltar para um número menor (cuidado: pode repetir número)
//
// Precisa da chave da conta de serviço (chave-servico.json), a mesma do "npm run usuarios".
import { existsSync, readFileSync } from 'node:fs';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const args = process.argv.slice(2);
const caminhoChave = 'chave-servico.json';
if (!existsSync(caminhoChave)) {
  console.error('Chave não encontrada: salve chave-servico.json na pasta do projeto (veja o README).');
  process.exit(1);
}

const db = getFirestore(initializeApp({ credential: cert(JSON.parse(readFileSync(caminhoChave, 'utf8'))) }));
const ref = db.doc('contadores/demandas');
const atual = Number((await ref.get()).data()?.ultimo ?? 0);
const pedido = args.find((a) => /^\d+$/.test(a));

if (!pedido) {
  console.log(`Último número usado: ${atual}. A próxima demanda será a ${atual + 1}.`);
  process.exit(0);
}

const novo = Number(pedido);
if (novo < atual && !args.includes('--forcar')) {
  console.error(`O contador já está em ${atual}. Voltar para ${novo} pode repetir números; use --forcar se tiver certeza.`);
  process.exit(1);
}

await db.runTransaction(async (tx) => {
  tx.set(ref, { ultimo: novo });
});
console.log(`Pronto: a próxima demanda será a ${novo + 1}.`);
