import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Configuración ESLint base del monorepo.
 *
 * Además de las reglas habituales, aquí viven las que hacen cumplir principios del
 * encargo (docs/security-model.md §12): dinero sin float, sin automatización de
 * navegador en el backend, sin `any` silencioso.
 */
export const base = tseslint.config(
  {
    ignores: ['dist/**', '.next/**', '.turbo/**', 'coverage/**', 'node_modules/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'prefer-const': 'error',
      'no-restricted-globals': [
        'error',
        {
          name: 'parseFloat',
          message:
            'Prohibido para dinero. Usá Money/Decimal (docs/architecture.md §7, RN-13). ' +
            'Si el valor no es monetario, usá Number.parseFloat con un comentario que lo justifique.',
        },
      ],
    },
  },
);

/**
 * Reglas extra para paquetes de dominio puro: sin IO, sin framework.
 * Hace cumplir la decisión D3 de la ADR 0001.
 */
export const pureDomain = tseslint.config({
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: [
              '@prisma/*',
              '@nestjs/*',
              'next',
              'next/*',
              'express',
              'ioredis',
              'bullmq',
              '@casas/database',
              '@casas/contracts',
            ],
            message:
              'Un paquete de dominio puro no puede depender de infraestructura ' +
              '(ADR 0001, decisión D3). Recibí los datos como argumento.',
          },
          {
            group: ['node:fs', 'node:fs/*', 'node:http', 'node:https', 'node:net', 'node:child_process'],
            message: 'Un paquete de dominio puro no hace IO (ADR 0001, decisión D3).',
          },
        ],
      },
    ],
  },
});

export default base;
