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

## Regra do projeto

Nenhuma parte é dada como pronta sem `npm run test:tudo` passando.
