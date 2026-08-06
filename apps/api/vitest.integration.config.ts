import { defineConfig } from 'vitest/config';

/**
 * Pruebas de integración: requieren PostgreSQL y Redis reales.
 * Levantar el stack con `pnpm docker:up` antes de ejecutarlas.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.integration.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
