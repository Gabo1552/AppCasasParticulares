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
    },
  },
];
