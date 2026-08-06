import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * Vitest transpila con esbuild, que **no emite metadata de decoradores**. Sin
 * ella, Nest no puede resolver la inyección por tipo de constructor y todo el
 * contenedor falla en las pruebas aunque funcione en producción.
 *
 * SWC sí la emite, así que se usa para transformar los archivos de la API.
 */
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/__tests__/**/*.test.ts'],
    exclude: ['**/*.integration.test.ts', '**/node_modules/**'],
  },
});
