import { base } from '@casas/config/eslint.base.mjs';

export default [
  ...base,
  {
    rules: {
      // El backend no puede depender de automatización de navegador: es la
      // verificación en código del principio 6 del encargo.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'puppeteer',
                'puppeteer-*',
                'playwright',
                'playwright-*',
                'selenium-webdriver',
              ],
              message:
                'Prohibido el scraping y la automatización de navegador (principio 6 del encargo, ' +
                'sección 3.3 del documento). Playwright sólo se usa para E2E de nuestra propia web.',
            },
          ],
        },
      ],

      // Desactivada a propósito en la API. Con `emitDecoratorMetadata`, NestJS
      // resuelve la inyección leyendo el tipo del parámetro del constructor en
      // tiempo de ejecución. Convertir esos imports a `import type` los borra del
      // JavaScript emitido y el contenedor deja de poder resolver la dependencia
      // —sin error de compilación, sólo un fallo al arrancar—. La regla sigue
      // activa en los paquetes que no usan decoradores.
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
];
