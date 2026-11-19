import { defineConfig } from 'vitest/config';

// Testes das regras de segurança: rodam dentro do emulador do Firestore.
export default defineConfig({
  test: {
    include: ['tests/rules/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20_000,
    fileParallelism: false,
    // O emulador às vezes corrompe a conexão de escuta (RESOURCE_EXHAUSTED "message larger than max" /
    // "client is offline") sem relação com as regras: o teste é repetido em vez de derrubar o CI.
    retry: 2,
  },
});
