// Cria as contas do portal (P/3 + 7 Cias) e grava o perfil de cada uma.
//
// Uso:
//   npm run usuarios                       cria o que falta e confere os perfis
//   npm run usuarios -- --nova-senha 1cia  gera senha nova para a 1ª Cia (aceita "1cia,ft")
//   npm run usuarios -- --chave caminho.json
//
// Precisa da chave da conta de serviço (Firebase > Configurações > Contas de serviço).
// A chave e o arquivo de senhas NUNCA vão para o GitHub (estão no .gitignore).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { CONTAS } from '../src/domain/contas';
import { garantirContas } from './contas-admin';
import { gerarSenha } from './senha';

const args = process.argv.slice(2);

function valorDe(opcao: string): string | undefined {
  const i = args.indexOf(opcao);
  return i >= 0 ? args[i + 1] : undefined;
}

const caminhoChave = valorDe('--chave') ?? 'chave-servico.json';
const redefinir = new Set((valorDe('--nova-senha') ?? '').split(',').filter(Boolean));

const invalidas = [...redefinir].filter((id) => !CONTAS.some((c) => c.id === id));
if (invalidas.length) {
  console.error(`Conta desconhecida: ${invalidas.join(', ')}. Use: ${CONTAS.map((c) => c.id).join(', ')}`);
  process.exit(1);
}

if (!existsSync(caminhoChave)) {
  console.error(`Chave não encontrada em "${caminhoChave}".`);
  console.error('Baixe em Firebase > Configurações do projeto > Contas de serviço > Gerar nova chave privada,');
  console.error('salve na pasta do projeto com o nome chave-servico.json e rode de novo.');
  process.exit(1);
}

const app = initializeApp({ credential: cert(JSON.parse(readFileSync(caminhoChave, 'utf8'))) });
const resultados = await garantirContas(getAuth(app), CONTAS, () => gerarSenha(), redefinir);

console.table(resultados.map((r) => ({ conta: r.conta.sigla, email: r.conta.email, acao: r.acao })));

const comSenha = resultados.filter((r) => r.senha);
if (comSenha.length) {
  const linhas = comSenha.map((r) => `${r.conta.sigla.padEnd(8)} ${r.senha}`);
  writeFileSync('senhas-iniciais.txt', `Senhas geradas em ${new Date().toLocaleString('pt-BR')}\n\n${linhas.join('\n')}\n`);
  console.log(`\n${comSenha.length} senha(s) salvas em senhas-iniciais.txt.`);
  console.log('Entregue cada senha à sua Cia e APAGUE esse arquivo depois.');
}
