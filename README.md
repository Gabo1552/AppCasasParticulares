# Plataforma de casas particulares

Administración de relaciones laborales de personal de casas particulares y niñeras en Argentina:
fichaje, novedades, cierre mensual, preliquidación, revisión profesional, asistencia para operar en
ARCA, importación y conciliación del recibo oficial, pago directo, archivo documental y auditoría.

> **Los parámetros de liquidación cargados en este repositorio son datos de prueba, no valores
> oficiales.** Ningún importe calculado representa una liquidación válida hasta que un contador
> matriculado cargue y publique los parámetros reales por el flujo de doble control. Ver
> [`docs/product-summary.md`](docs/product-summary.md) §10.

---

## Los cinco límites que definen el producto

Estos no son objetivos: son restricciones verificadas en cada build por
[`scripts/guardrails.mjs`](scripts/guardrails.mjs).

1. **La familia es siempre la empleadora.** La plataforma no emplea, no dirige y no sanciona.
2. **La plataforma nunca custodia el sueldo.** La transferencia va directo de la familia a la
   trabajadora. No existe cuenta de plataforma en el modelo de datos.
3. **Nunca se solicita ni se almacena una clave fiscal.** No hay campo, columna, log ni variable
   de entorno que la reciba.
4. **No hay scraping ni automatización de navegador contra ARCA.** El recibo oficial se emite en
   ARCA; la plataforma prepara, guía, importa, valida y concilia.
5. **El dinero se calcula con decimal exacto.** Nunca `float`, ni en el cálculo, ni en la base, ni
   en el JSON.

---

## Puesta en marcha

### Requisitos

| Herramienta | Versión                              |
| ----------- | ------------------------------------ |
| Node.js     | 22 o superior                        |
| pnpm        | 10.33 o superior (`corepack enable`) |
| Docker      | con Docker Compose v2                |

### Pasos

```bash
# 1. Instalar dependencias
pnpm install

# 2. Configurar el entorno
cp .env.example .env
cp .env.example packages/database/.env

# 3. Levantar el stack local (PostgreSQL, Redis, MinIO, Mailpit)
pnpm docker:up

# 4. Aplicar migraciones y cargar datos de demostración
pnpm db:migrate
pnpm db:seed

# 5. Verificar que todo está sano
pnpm lint && pnpm typecheck && pnpm test && pnpm guardrails

# 6. Arrancar en desarrollo
pnpm dev
```

| Servicio           | URL                                                        |
| ------------------ | ---------------------------------------------------------- |
| Web (Next.js)      | http://localhost:3000                                      |
| API (NestJS)       | http://localhost:3001                                      |
| OpenAPI            | http://localhost:3001/docs                                 |
| Health / readiness | http://localhost:3001/health · http://localhost:3001/ready |
| MinIO (consola)    | http://localhost:9001                                      |
| Mailpit            | http://localhost:8025                                      |

### Comandos

```bash
pnpm lint              # ESLint en todo el monorepo
pnpm typecheck         # TypeScript estricto
pnpm test              # Pruebas unitarias
pnpm test:integration  # Pruebas de integración (requieren el stack levantado)
pnpm build             # Build de todos los paquetes y apps
pnpm guardrails        # Verificación de los principios del encargo
pnpm format            # Prettier
pnpm db:migrate        # Migraciones de desarrollo
pnpm db:seed           # Datos de demostración (ficticios)
pnpm docker:up         # Levantar el stack local
pnpm docker:down       # Bajarlo
```

---

## Estructura

```
apps/
  web/                 Next.js — familia, contador y backoffice
  api/                 NestJS — monolito modular con 26 módulos + workers BullMQ
  mobile/              Expo / React Native — estructura mínima

packages/
  domain/              Objetos de valor, máquinas de estado, puertos. Puro.
  payroll-engine/      Motor de liquidación. Puro, determinista, sin IO.
  database/            Esquema Prisma, migraciones, seeds
  contracts/           Esquemas Zod compartidos entre web, móvil y API
  config/              tsconfig, ESLint, Prettier, Vitest base
  observability/       Logger con redacción, correlación, health checks

infrastructure/docker/ Stack de desarrollo local
scripts/               Verificación de principios
docs/                  Análisis, arquitectura, decisiones (ADR)
```

**Regla de dependencias**: `payroll-engine` no puede importar Prisma, NestJS, Next ni módulos de IO.
La resolución estricta de pnpm y ESLint lo impiden; `pnpm guardrails` lo verifica.

---

## Documentación

Empezá por acá. Cada documento responde una pregunta distinta.

| Documento                                                                                  | Responde                                                                   |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| [`docs/product-summary.md`](docs/product-summary.md)                                       | Qué es el producto, quién lo usa y qué principios lo condicionan           |
| [`docs/domain-model.md`](docs/domain-model.md)                                             | Cómo se modela el dominio: agregados, invariantes, máquinas de estado      |
| [`docs/architecture.md`](docs/architecture.md)                                             | Cómo se implementa: monolito modular, dinero, idempotencia, observabilidad |
| [`docs/security-model.md`](docs/security-model.md)                                         | Quién puede qué, qué se cifra, qué se audita, qué se minimiza              |
| [`docs/arca-integration-strategy.md`](docs/arca-integration-strategy.md)                   | Cómo se opera con ARCA sin API, sin scraping y sin claves fiscales         |
| [`docs/implementation-roadmap.md`](docs/implementation-roadmap.md)                         | Qué se construye en qué orden y cuándo está terminado                      |
| [`docs/open-decisions.md`](docs/open-decisions.md)                                         | Qué falta decidir, quién decide, y qué se hizo mientras tanto              |
| [`docs/adr/0001-initial-architecture.md`](docs/adr/0001-initial-architecture.md)           | Por qué se eligió esta arquitectura y qué se descartó                      |
| [`docs/adr/0002-worker-accepts-conditions.md`](docs/adr/0002-worker-accepts-conditions.md) | Por qué la relación se activa sólo con la aceptación de la trabajadora     |
| [`docs/e3-onboarding-manual-test.md`](docs/e3-onboarding-manual-test.md)                   | Cómo recorrer el onboarding a mano y qué mirar en cada paso                |

El documento de requerimientos original está en
[`docs/Requerimientos_Plataforma_Casas_Particulares_Argentina_v1.docx`](docs/), y su extracción
textual completa en [`docs/requirements-extract.md`](docs/requirements-extract.md).

---

## Estado actual

**Etapa 2 (base técnica) completa. Etapa 3, pasos 1 a 6, completos.**

El recorrido de onboarding funciona de punta a punta desde el navegador, contra PostgreSQL real:
una familia se registra, crea su perfil y su domicilio, invita a una trabajadora, ella acepta, la
familia carga las condiciones y el horario semanal, y la relación queda activa **sólo** cuando la
trabajadora acepta esas condiciones.

Los pasos 7 a 16 —fichaje, liquidación, ARCA, pagos y conciliación— siguen pendientes
(ver [`docs/implementation-roadmap.md`](docs/implementation-roadmap.md)). Para recorrerlo a mano,
[`docs/e3-onboarding-manual-test.md`](docs/e3-onboarding-manual-test.md).

### Lo que ya funciona y está probado

**262 pruebas unitarias, 48 de integración contra PostgreSQL real, 4 recorridos E2E en navegador y
11 verificaciones de principios.**

| Pieza                                                                           | Estado            |
| ------------------------------------------------------------------------------- | ----------------- |
| `Money` con decimal exacto, `Minutes`, `DateRange`, `MaskedAccount`             | 65 pruebas        |
| Máquinas de estado de relación, período y fichaje                               | incluidas arriba  |
| Motor de liquidación con los 13 escenarios del encargo                          | 56 pruebas        |
| Redacción de datos sensibles en logs                                            | 11 pruebas        |
| Esquemas Zod compartidos                                                        | 18 pruebas        |
| Conectores ARCA, `ManualTransferProvider`, policies y arranque de la aplicación | 52 pruebas        |
| Identidad: OTP, vencimiento, intentos, rotación de refresh, reutilización       | 16 pruebas        |
| Invitaciones: token, un solo uso, vencimiento, baja, reenvío, correo ajeno      | 15 pruebas        |
| Contratos del onboarding: perfiles, domicilio, condiciones, calendario          | 26 pruebas        |
| Invariantes y recorrido completo contra PostgreSQL real (ver abajo)             | 48 pruebas        |
| Recorrido de la familia y la trabajadora en Chromium                            | 4 pruebas E2E     |
| Verificación de principios del encargo                                          | 11 verificaciones |

Lo verificado **contra una base de datos real** en cada corrida de CI, no sólo afirmado:

- Las migraciones aplican sobre una base limpia y el esquema no tiene deriva respecto de ellas.
- Los seeds de demostración cargan sin errores.
- `audit_event` es realmente append-only: `UPDATE` y `DELETE` se rechazan, tanto vía Prisma como
  por SQL directo, y el evento queda intacto.
- Los importes conservan precisión decimal exacta en el viaje de ida y vuelta a `NUMERIC(18,4)`.
- Un fichaje reenviado con la misma clave de idempotencia no se duplica.
- La API arranca y responde `/health` y `/ready`.
- El recorrido completo de onboarding, sobre la aplicación real levantada con supertest.
- Los ocho casos negativos de autorización del encargo: una familia no ve lo de otra, la trabajadora
  sólo ve lo suyo, no puede tocar las condiciones económicas, la familia no puede aceptar por ella,
  el token de invitación no habilita nada más, y el rol general nunca reemplaza el control de
  propiedad.
- La familia no puede activar la relación por ningún camino, ni por la interfaz ni por la API.

### Lo que no existe todavía, deliberadamente

Marketplace, matching, chat, contratación, pagos reales, API real de ARCA, verificación automática
de identidad, facturación real, geolocalización continua e IA. Ninguno está simulado: cuando una
funcionalidad futura tiene una interfaz, la implementación deshabilitada **falla con un error
explícito** en lugar de devolver datos inventados.

---

## Contribuir

Antes de abrir un PR:

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm guardrails && pnpm build

# Y, con el stack levantado, las pruebas que tocan la base:
pnpm docker:up && pnpm db:migrate && pnpm db:seed && pnpm test:integration
```

Definición de terminado para cada módulo: pruebas unitarias, pruebas de integración donde toca base
de datos, errores manejados explícitamente, permisos verificados, casos de idempotencia y
concurrencia donde apliquen, documentación mínima, migración, seed y ejemplo de uso.

Las decisiones de arquitectura se registran como ADR en [`docs/adr/`](docs/adr/).

---

## Aviso

Este software no reemplaza el asesoramiento de un abogado laboral, un especialista en privacidad ni
un contador matriculado. El documento de requerimientos lo dice en su primera página, y vale
igual para el código.
