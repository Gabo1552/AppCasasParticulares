import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * Pruebas de integración: requieren PostgreSQL con migraciones aplicadas.
 * Local: `pnpm docker:up && pnpm db:migrate && pnpm db:seed`.
 */
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
    include: ['src/**/*.integration.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Comparten una base: en serie evita interferencias entre archivos.
    fileParallelism: false,
  },
});
