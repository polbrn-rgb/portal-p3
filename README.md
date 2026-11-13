# Portal P3

Portal de demandas da P/3 (8º BPM/M): React + Vite + TypeScript, Firebase (Auth + Firestore) e Vercel.

## Pré-requisitos (uma vez só)

- Node.js 22 ou mais novo
- Java 21 (JDK), para os emuladores do Firebase. No Windows: `winget install EclipseAdoptium.Temurin.21.JDK`

## Primeira vez

```bash
npm install
npx playwright install chromium
```

O `npm install` cria o `package-lock.json`. Ele deve ir para o GitHub junto com o resto, porque o CI usa ele.

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Abre o portal em http://localhost:5173 ligado ao Firebase real |
| `npm run emuladores` + `npm run dev:emulador` | Portal ligado aos emuladores (dados de teste, nada vai para o banco real) |
| `npm test` | Testes de regra de negócio |
| `npm run test:regras` | Testes das regras de segurança, no emulador |
| `npm run test:e2e` | Testes de ponta a ponta em tela de celular e de computador |
| `npm run test:tudo` | Tudo acima, em sequência |

## Contas e perfis (Fase 1)

São 8 contas: P/3 (`8bpmmp3@gmail.com`) e uma por Cia (`8bpmmp3+1cia@gmail.com` … `8bpmmp3+ft@gmail.com`).
Na tela de login a pessoa só escolhe a unidade e digita a senha. O link de "Esqueci a senha" sempre chega na caixa da P/3.

1. Firebase → Configurações do projeto → **Contas de serviço** → **Gerar nova chave privada**.
2. Salve o arquivo baixado na pasta do projeto com o nome `chave-servico.json` (ele não vai para o GitHub).
3. `npm run usuarios`: cria as contas que faltam, grava o perfil de cada uma e salva as senhas novas em `senhas-iniciais.txt`.
4. Entregue as senhas e **apague** o `senhas-iniciais.txt`.

Trocar a senha de uma Cia: `npm run usuarios -- --nova-senha 1cia`. A Cia é desconectada dos aparelhos.

Publicar as regras de segurança no banco real (depois de `npx firebase login` com a conta 8bpmmp3@gmail.com):
`npm run deploy:regras`.

## Dia de entrar no ar: numeração

Informe o último número usado no numerador (a próxima demanda continua dele):
`npm run contador -- 2150` → a próxima será a 2151. Sem número, `npm run contador` só mostra onde está.

## Agenda e pasta CFP (Apps Script)

Os eventos de Prazo CPA/Cia e a pasta + agenda do CFP + aba Operações são criados por um Apps Script
na conta da P/3, a cada 5 minutos. Instalação em `apps-script/LEIAME.md`.

## Backup

Na lista de demandas, **Baixar planilha** gera um `.csv` com todas as demandas (colunas do numerador
+ respostas das Cias). Abre no Excel e no Google Planilhas.

## Regra do projeto

Nenhuma parte é dada como pronta sem `npm run test:tudo` passando.
