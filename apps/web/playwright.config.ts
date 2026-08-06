import { defineConfig, devices } from '@playwright/test';

/**
 * Pruebas de extremo a extremo.
 *
 * Corren contra la aplicación real: Next servido en producción, la API de NestJS
 * y PostgreSQL con las migraciones aplicadas. No hay mocks de red — si el
 * recorrido pasa acá, pasa en un navegador de verdad.
 *
 * Los servidores se levantan aparte (`pnpm dev` o el script de CI) porque
 * arrancar la API desde Playwright ocultaría los errores de arranque detrás de un
 * timeout genérico.
 */
export default defineConfig({
  testDir: './e2e',
  /**
   * Las capturas se generan a pedido, no en cada corrida.
   *
   *   pnpm exec playwright test --config playwright.capturas.config.ts
   *
   * Sumarlas a CI agregaría un minuto y quince imágenes por ejecución sin
   * verificar nada que las otras pruebas no verifiquen ya.
   */
  testIgnore: '**/capturas.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: process.env['CI'] === 'true' ? 1 : 0,
  reporter: process.env['CI'] === 'true' ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env['E2E_WEB_URL'] ?? 'http://localhost:3000',
    locale: 'es-AR',
    timezoneId: 'America/Argentina/Buenos_Aires',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        /**
         * `E2E_CHROMIUM_PATH` permite usar un Chromium ya instalado en la máquina.
         *
         * Sirve en entornos donde el navegador viene provisto y su número de build
         * no coincide con el que espera esta versión de Playwright. Sin la
         * variable —el caso de CI— se usa el navegador que Playwright administra.
         */
        ...(process.env['E2E_CHROMIUM_PATH'] === undefined
          ? {}
          : { launchOptions: { executablePath: process.env['E2E_CHROMIUM_PATH'] } }),
      },
    },
  ],
});
