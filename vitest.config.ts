import { defineConfig } from 'vitest/config';

// Testes de regra de negócio: rápidos, sem emulador.
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
