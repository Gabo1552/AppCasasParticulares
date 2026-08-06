import { defineConfig } from '@playwright/test';
import baseConfig from './playwright.config';

/**
 * Configuración para generar las capturas de pantalla de la documentación.
 *
 * Igual que la principal, pero corriendo únicamente `capturas.spec.ts`, que la
 * configuración principal ignora.
 */
export default defineConfig({
  ...baseConfig,
  testIgnore: [],
  testMatch: '**/capturas.spec.ts',
});
