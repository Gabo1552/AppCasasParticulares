#!/usr/bin/env node
/**
 * Verificaciones automáticas de los principios del encargo.
 *
 * Los principios innegociables (no guardar claves fiscales, no automatizar ARCA,
 * no usar float para dinero, no custodiar salario, motor puro) no se sostienen
 * con buena voluntad: si no se verifican, alguien los rompe en seis meses sin
 * darse cuenta.
 *
 * Este script los convierte en una propiedad del build. Falla el pipeline.
 * Se documenta en docs/security-model.md §12.
 *
 * Uso: node scripts/guardrails.mjs
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]$/, '');

const IGNORED_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  'dist',
  '.next',
  '.turbo',
  'coverage',
  'migrations',
]);

/**
 * Archivos exentos: son los que *documentan* o *verifican* las reglas.
 *
 * Las pruebas que nombran una clave fiscal la envían a propósito, para comprobar
 * que el esquema estricto la rechaza o que no quedó persistida. Son parte de la
 * defensa, no una violación: por eso se exime `__tests__`.
 *
 * La exención es sólo para esta verificación. Las demás —importes en float,
 * automatización de navegador, custodia de fondos— siguen aplicando a las
 * pruebas, porque ahí sí un uso en una prueba señalaría el mismo problema que en
 * producción.
 */
const EXEMPT_FILES = new Set([
  'scripts/guardrails.mjs',
  'packages/observability/src/redaction.ts',
  'packages/observability/src/__tests__/redaction.test.ts',
  'packages/config/eslint.base.mjs',
  '.env.example',
]);

/** ¿El archivo es una prueba? Se usa para eximir sólo `no-fiscal-credentials`. */
function isTestFile(file) {
  return /(__tests__|\.test\.ts|\.spec\.ts)/.test(file);
}

const failures = [];
const passed = [];

function collectFiles(directory, extensions) {
  const results = [];
  for (const entry of readdirSync(directory)) {
    if (IGNORED_DIRECTORIES.has(entry)) continue;
    const fullPath = join(directory, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      results.push(...collectFiles(fullPath, extensions));
    } else if (extensions.some((ext) => entry.endsWith(ext))) {
      results.push(fullPath);
    }
  }
  return results;
}

function repoPath(fullPath) {
  return relative(ROOT, fullPath).split(sep).join('/');
}

function check(name, description, fn) {
  const problems = fn();
  if (problems.length === 0) {
    passed.push(name);
  } else {
    failures.push({ name, description, problems });
  }
}

const sourceFiles = collectFiles(ROOT, ['.ts', '.tsx', '.mjs', '.js', '.prisma', '.sql']).filter(
  (file) => !EXEMPT_FILES.has(repoPath(file)),
);

// ─── 1. Sin claves fiscales ─────────────────────────────────────────────────

check(
  'no-fiscal-credentials',
  'Ningún identificador del árbol puede recibir o guardar una clave fiscal (SEG-06, principio 5).',
  () => {
    // Busca declaraciones e identificadores, no menciones en prosa: los documentos
    // y comentarios hablan de la clave fiscal para explicar que NO se guarda.
    const pattern =
      /\b(claveFiscal|clave_fiscal|fiscalKey|fiscal_key|CLAVE_FISCAL|FISCAL_KEY|arcaPassword|arca_password|ARCA_PASSWORD)\b/;
    const problems = [];

    for (const file of sourceFiles) {
      if (isTestFile(file)) continue;
      const content = readFileSync(file, 'utf8');
      content.split('\n').forEach((line, index) => {
        // Ignora líneas de comentario: ahí se explica la prohibición.
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('--')) return;
        if (trimmed.startsWith('#')) return;
        if (pattern.test(line)) {
          problems.push(`${repoPath(file)}:${index + 1} → ${trimmed.slice(0, 100)}`);
        }
      });
    }
    return problems;
  },
);

// ─── 2. Sin automatización de navegador en el backend ───────────────────────

check(
  'no-browser-automation',
  'apps/api no puede depender de automatización de navegador (principio 6, sección 3.3).',
  () => {
    const forbidden = ['puppeteer', 'playwright', 'selenium-webdriver', 'cheerio', 'jsdom'];
    const problems = [];
    const apiPackage = JSON.parse(readFileSync(join(ROOT, 'apps/api/package.json'), 'utf8'));

    for (const section of ['dependencies', 'devDependencies']) {
      for (const name of Object.keys(apiPackage[section] ?? {})) {
        if (
          forbidden.some((f) => name === f || name.startsWith(`${f}-`) || name.startsWith(`@${f}/`))
        ) {
          problems.push(`apps/api/package.json → ${section}.${name}`);
        }
      }
    }
    return problems;
  },
);

// ─── 3. El motor de liquidación es puro ─────────────────────────────────────

check(
  'payroll-engine-purity',
  'packages/payroll-engine no puede depender de infraestructura (ADR 0001, decisión D3).',
  () => {
    const problems = [];
    const enginePackage = JSON.parse(
      readFileSync(join(ROOT, 'packages/payroll-engine/package.json'), 'utf8'),
    );

    const allowedDependencies = new Set(['@casas/domain', 'decimal.js']);
    for (const name of Object.keys(enginePackage.dependencies ?? {})) {
      if (!allowedDependencies.has(name)) {
        problems.push(
          `packages/payroll-engine/package.json → dependencies.${name} no está permitido ` +
            'en una librería de dominio puro',
        );
      }
    }

    const forbiddenImports =
      /from\s+['"](@prisma\/|@nestjs\/|next|express|ioredis|bullmq|node:fs|node:http|node:https|node:net|node:child_process|@casas\/database|@casas\/contracts)/;

    for (const file of collectFiles(join(ROOT, 'packages/payroll-engine/src'), ['.ts'])) {
      const content = readFileSync(file, 'utf8');
      content.split('\n').forEach((line, index) => {
        if (forbiddenImports.test(line)) {
          problems.push(`${repoPath(file)}:${index + 1} → ${line.trim()}`);
        }
      });
    }
    return problems;
  },
);

// ─── 4. Dinero sin float ────────────────────────────────────────────────────

check(
  'no-float-money',
  'Los importes no pueden pasar por parseFloat ni por el tipo number (RN-13, principio 11).',
  () => {
    const problems = [];
    const moneyContext = /(amount|importe|remuneration|salary|monto|price|net|gross|total)/i;
    const floatCall = /\b(parseFloat|Number\.parseFloat)\s*\(/;

    const scanDirectories = [
      join(ROOT, 'packages/domain/src'),
      join(ROOT, 'packages/payroll-engine/src'),
      join(ROOT, 'apps/api/src'),
    ];

    for (const directory of scanDirectories) {
      for (const file of collectFiles(directory, ['.ts'])) {
        // Las pruebas comparan importes numéricamente a propósito.
        if (file.includes('__tests__') || file.endsWith('.test.ts')) continue;
        const content = readFileSync(file, 'utf8');
        content.split('\n').forEach((line, index) => {
          const trimmed = line.trim();
          if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;
          if (floatCall.test(line) && moneyContext.test(line)) {
            problems.push(`${repoPath(file)}:${index + 1} → ${trimmed.slice(0, 100)}`);
          }
        });
      }
    }
    return problems;
  },
);

// ─── 5. Dinero en la base es Decimal, nunca Float ───────────────────────────

check(
  'no-float-columns',
  'Ninguna columna monetaria puede declararse como Float en el esquema Prisma (RN-13).',
  () => {
    const problems = [];
    const schema = readFileSync(join(ROOT, 'packages/database/prisma/schema.prisma'), 'utf8');

    schema.split('\n').forEach((line, index) => {
      // Los comentarios del esquema mencionan Float para explicar que no se usa.
      if (line.trim().startsWith('//')) return;
      if (/\bFloat\b/.test(line)) {
        problems.push(`packages/database/prisma/schema.prisma:${index + 1} → ${line.trim()}`);
      }
    });
    return problems;
  },
);

// ─── 6. La plataforma no custodia salario ───────────────────────────────────

check(
  'no-platform-custody',
  'No puede existir un modelo de saldo, billetera o cuenta de plataforma (principios 3 y 4).',
  () => {
    const problems = [];
    const schema = readFileSync(join(ROOT, 'packages/database/prisma/schema.prisma'), 'utf8');
    const forbiddenModels = /^model\s+(Wallet|Balance|LedgerAccount|PlatformAccount|Escrow)\b/m;

    const match = forbiddenModels.exec(schema);
    if (match !== null) {
      problems.push(
        `packages/database/prisma/schema.prisma → el modelo "${match[1]}" implicaría que la ` +
          'plataforma custodia fondos, lo que el encargo prohíbe',
      );
    }
    return problems;
  },
);

// ─── 7. Sin SDK publicitarios ───────────────────────────────────────────────

check(
  'no-ad-sdk',
  'Ningún paquete puede declarar un SDK publicitario o de analítica de terceros (sección 15).',
  () => {
    const forbidden = [
      'react-ga',
      'react-facebook-pixel',
      'analytics-node',
      '@segment/analytics-node',
      'mixpanel',
      'amplitude-js',
      '@amplitude/analytics-browser',
      'firebase-analytics',
      'react-native-fbsdk-next',
      'expo-facebook',
      'react-native-google-mobile-ads',
    ];
    const problems = [];

    for (const packageFile of collectFiles(ROOT, ['package.json'])) {
      const path = repoPath(packageFile);
      if (path.includes('node_modules')) continue;
      const manifest = JSON.parse(readFileSync(packageFile, 'utf8'));
      for (const section of ['dependencies', 'devDependencies']) {
        for (const name of Object.keys(manifest[section] ?? {})) {
          if (forbidden.includes(name)) {
            problems.push(`${path} → ${section}.${name}`);
          }
        }
      }
    }
    return problems;
  },
);

// ─── 8. Los fixtures se declaran como tales ─────────────────────────────────

check(
  'fixtures-declared',
  'Toda versión de parámetros de prueba debe declararse como no oficial (encargo: "No inventes porcentajes").',
  () => {
    const problems = [];
    const fixtures = readFileSync(
      join(ROOT, 'packages/payroll-engine/src/fixtures/parameter-versions.ts'),
      'utf8',
    );

    const versionCount = (fixtures.match(/^export const FIXTURE_PARAMETERS_\w+:/gm) ?? []).length;
    const fixtureFlagCount = (fixtures.match(/isFixture:\s*true/g) ?? []).length;
    const spreadCount = (fixtures.match(/\.\.\.FIXTURE_PARAMETERS_\w+,/g) ?? []).length;

    if (versionCount === 0) {
      problems.push('No se encontró ninguna versión de parámetros de fixture.');
    }
    // Una versión declara `isFixture` directamente o lo hereda por spread.
    if (fixtureFlagCount + spreadCount < versionCount) {
      problems.push(
        `Se declararon ${versionCount} versiones de fixture pero sólo ${fixtureFlagCount} ` +
          `marcan isFixture: true (más ${spreadCount} por herencia).`,
      );
    }
    if (!/NO SON VALORES OFICIALES/.test(fixtures)) {
      problems.push('El archivo de fixtures no lleva la advertencia "NO SON VALORES OFICIALES".');
    }
    if (!fixtures.includes('FIXTURE_SOURCE_PREFIX')) {
      problems.push(
        'Los fixtures no usan FIXTURE_SOURCE_PREFIX en su `source`, que es lo que hace ' +
          'que validateParameterVersion los distinga de una versión oficial.',
      );
    }
    return problems;
  },
);

// ─── 9. La auditoría es append-only en la base ──────────────────────────────

check(
  'audit-append-only',
  'La migración debe revocar UPDATE y DELETE sobre audit_event (ADR 0001, decisión D9).',
  () => {
    const problems = [];
    const migrationPath = join(
      ROOT,
      'packages/database/prisma/migrations/20260806000100_audit_append_only/migration.sql',
    );

    let migration;
    try {
      migration = readFileSync(migrationPath, 'utf8');
    } catch {
      return ['No existe la migración que hace append-only la tabla audit_event.'];
    }

    if (!/REVOKE\s+UPDATE,\s*DELETE/i.test(migration)) {
      problems.push('La migración no revoca UPDATE y DELETE sobre audit_event.');
    }
    if (!/CREATE TRIGGER audit_event_no_update/i.test(migration)) {
      problems.push('Falta el trigger que rechaza UPDATE sobre audit_event.');
    }
    if (!/CREATE TRIGGER audit_event_no_delete/i.test(migration)) {
      problems.push('Falta el trigger que rechaza DELETE sobre audit_event.');
    }
    return problems;
  },
);

// ─── 10. El conector oficial de ARCA está deshabilitado ─────────────────────

check(
  'arca-official-disabled',
  'El conector oficial debe lanzar error controlado en sus cinco operaciones (principio 10).',
  () => {
    const problems = [];
    const connector = readFileSync(
      join(ROOT, 'apps/api/src/adapters/arca/official-arca.connector.ts'),
      'utf8',
    );

    for (const operation of [
      'getRelationshipStatus',
      'getObligations',
      'createReceipt',
      'downloadReceipt',
      'validateReceipt',
    ]) {
      const pattern = new RegExp(`${operation}\\([^)]*\\)[^{]*\\{[^}]*notEnabled`, 's');
      if (!pattern.test(connector)) {
        problems.push(`OfficialARCAConnector.${operation} no lanza el error controlado.`);
      }
    }

    const envExample = readFileSync(join(ROOT, '.env.example'), 'utf8');
    if (!/FEATURE_ARCA_OFFICIAL_CONNECTOR="false"/.test(envExample)) {
      problems.push('.env.example no deja FEATURE_ARCA_OFFICIAL_CONNECTOR en "false".');
    }
    return problems;
  },
);

// ─── 11. Sin borrado en cascada hacia entidades críticas ────────────────────

check(
  'no-cascade-delete-on-critical',
  'No puede haber borrado físico de relaciones, liquidaciones, recibos, pagos ni auditoría (decisión D10).',
  () => {
    const problems = [];
    const schema = readFileSync(join(ROOT, 'packages/database/prisma/schema.prisma'), 'utf8');
    const criticalModels = [
      'EmploymentRelationship',
      'PayrollPeriod',
      'PayrollVersion',
      'PayrollCalculation',
      'ARCADocument',
      'Payment',
      'AuditEvent',
    ];

    for (const line of schema.split('\n')) {
      if (!line.includes('onDelete: Cascade')) continue;
      for (const model of criticalModels) {
        if (new RegExp(`\\b${model}\\b`).test(line)) {
          problems.push(`onDelete: Cascade hacia ${model} → ${line.trim()}`);
        }
      }
    }
    return problems;
  },
);

// ─── Reporte ────────────────────────────────────────────────────────────────

console.log('\nVerificación de principios del encargo\n');

for (const name of passed) {
  console.log(`  ✓ ${name}`);
}

if (failures.length > 0) {
  console.log('');
  for (const failure of failures) {
    console.log(`  ✗ ${failure.name}`);
    console.log(`    ${failure.description}`);
    for (const problem of failure.problems) {
      console.log(`      · ${problem}`);
    }
    console.log('');
  }
  console.log(`${failures.length} verificación(es) fallida(s).\n`);
  process.exit(1);
}

console.log(`\n${passed.length} verificaciones pasaron.\n`);
