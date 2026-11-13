import { defineConfig } from 'vitest/config';

// Testes das regras de segurança: rodam dentro do emulador do Firestore.
export default defineConfig({
  test: {
    include: ['tests/rules/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20_000,
    fileParallelism: false,
  },
});
