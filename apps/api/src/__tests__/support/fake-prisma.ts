import { randomUUID } from 'node:crypto';

/**
 * Doble en memoria del cliente de Prisma, acotado a lo que usan los servicios de
 * identidad e invitaciones.
 *
 * No pretende reimplementar Prisma: soporta el subconjunto exacto de operadores
 * que aparecen en esos servicios (`equals` implícito, `gte`, `gt`, `null`,
 * `increment`). Si un servicio empieza a usar algo más, el motor lanza en lugar
 * de devolver un resultado silenciosamente incorrecto — un doble que miente es
 * peor que no tener prueba.
 *
 * Las reglas que dependen de la base real (unicidad, triggers de auditoría,
 * aislamiento entre usuarios) se verifican en las pruebas de integración contra
 * PostgreSQL, no acá.
 */

type Row = Record<string, unknown>;

interface FindArgs {
  where?: Row;
  orderBy?: Record<string, 'asc' | 'desc'>;
  include?: Record<string, unknown>;
}

class FakeTable {
  readonly rows: Row[] = [];

  constructor(
    private readonly name: string,
    private readonly defaults: () => Row,
    private readonly relations: Record<string, (row: Row) => unknown> = {},
  ) {}

  private hydrate(row: Row | undefined, include?: Record<string, unknown>): Row | null {
    if (row === undefined) return null;
    if (include === undefined) return { ...row };

    const result: Row = { ...row };
    for (const key of Object.keys(include)) {
      const resolver = this.relations[key];
      if (resolver === undefined) {
        throw new Error(`fake-prisma: ${this.name}.include.${key} no está modelado`);
      }
      result[key] = resolver(row);
    }
    return result;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async create(args: { data: Row; include?: Record<string, unknown> }): Promise<Row> {
    const now = new Date();
    const row: Row = {
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      ...this.defaults(),
      ...applyWrites({}, args.data),
    };
    this.rows.push(row);
    return this.hydrate(row, args.include) as Row;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async findUnique(args: FindArgs): Promise<Row | null> {
    return this.hydrate(this.match(args.where).at(0), args.include);
  }

  async findUniqueOrThrow(args: FindArgs): Promise<Row> {
    const row = await this.findUnique(args);
    if (row === null) throw new Error(`fake-prisma: ${this.name} no encontrado`);
    return row;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async findFirst(args: FindArgs): Promise<Row | null> {
    return this.hydrate(this.sorted(this.match(args.where), args.orderBy).at(0), args.include);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async findMany(args: FindArgs = {}): Promise<Row[]> {
    return this.sorted(this.match(args.where), args.orderBy).map(
      (row) => this.hydrate(row, args.include) as Row,
    );
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async count(args: FindArgs = {}): Promise<number> {
    return this.match(args.where).length;
  }

  async update(args: { where: Row; data: Row; include?: Record<string, unknown> }): Promise<Row> {
    const row = this.match(args.where).at(0);
    if (row === undefined) throw new Error(`fake-prisma: ${this.name} no encontrado para update`);
    applyWrites(row, args.data);
    row['updatedAt'] = new Date();
    return this.hydrate(row, args.include) as Row;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async updateMany(args: { where: Row; data: Row }): Promise<{ count: number }> {
    const matched = this.match(args.where);
    for (const row of matched) {
      applyWrites(row, args.data);
      row['updatedAt'] = new Date();
    }
    return { count: matched.length };
  }

  private sorted(rows: Row[], orderBy?: Record<string, 'asc' | 'desc'>): Row[] {
    if (orderBy === undefined) return rows;
    const [field, direction] = Object.entries(orderBy)[0] ?? [];
    if (field === undefined) return rows;
    return [...rows].sort((a, b) => {
      const left = Number(a[field] as never);
      const right = Number(b[field] as never);
      return direction === 'desc' ? right - left : left - right;
    });
  }

  private match(where: Row | undefined): Row[] {
    if (where === undefined) return [...this.rows];
    return this.rows.filter((row) =>
      Object.entries(where).every(([field, condition]) => matches(row[field], condition, field)),
    );
  }
}

function matches(value: unknown, condition: unknown, field: string): boolean {
  if (condition === null) return value === null || value === undefined;
  if (condition instanceof Date) return toTime(value) === condition.getTime();

  if (typeof condition === 'object') {
    const entries = Object.entries(condition as Row);
    return entries.every(([operator, operand]) => {
      switch (operator) {
        case 'equals':
          return matches(value, operand, field);
        case 'gte':
          return toTime(value) >= toTime(operand);
        case 'gt':
          return toTime(value) > toTime(operand);
        case 'lt':
          return toTime(value) < toTime(operand);
        default:
          throw new Error(`fake-prisma: operador "${operator}" no modelado (campo ${field})`);
      }
    });
  }

  return value === condition;
}

function toTime(value: unknown): number {
  return value instanceof Date ? value.getTime() : Number(value);
}

/** Aplica `data`, resolviendo `{ increment: n }` sobre el valor actual. */
function applyWrites(row: Row, data: Row): Row {
  for (const [field, value] of Object.entries(data)) {
    if (value !== null && typeof value === 'object' && 'increment' in value) {
      const increment = (value as { increment: number }).increment;
      row[field] = Number(row[field] ?? 0) + increment;
      continue;
    }
    row[field] = value;
  }
  return row;
}

export class FakePrisma {
  readonly user = new FakeTable(
    'user',
    () => ({
      email: null,
      emailVerifiedAt: null,
      status: 'ACTIVE',
      displayName: '',
      timezone: 'America/Argentina/Buenos_Aires',
      roles: [],
      employerProfile: null,
      workerProfile: null,
    }),
    {
      roles: (row) => row['roles'] ?? [],
      employerProfile: (row) => row['employerProfile'] ?? null,
      workerProfile: (row) => row['workerProfile'] ?? null,
    },
  );

  readonly oneTimeCode = new FakeTable('oneTimeCode', () => ({
    consumedAt: null,
    attempts: 0,
    userId: null,
  }));

  readonly session = new FakeTable('session', () => ({
    revokedAt: null,
    revokedReason: null,
    ipAddress: null,
    userAgent: null,
  }));

  readonly auditEvent = new FakeTable('auditEvent', () => ({}));

  readonly workerInvitation = new FakeTable(
    'workerInvitation',
    () => ({
      status: 'PENDING',
      workerName: null,
      sentAt: new Date(),
      resentCount: 0,
      respondedAt: null,
      respondedByUserId: null,
      revokedAt: null,
      revokedReason: null,
      lastResentAt: null,
      employmentRelationshipId: null,
      version: 1,
    }),
    {
      household: () => ({ id: 'household-1', label: 'Casa de Palermo', city: 'CABA' }),
      employer: () => ({
        id: 'employer-1',
        legalName: 'Ana Gómez',
        user: { email: 'familia@example.test' },
      }),
    },
  );

  readonly employmentRelationship = new FakeTable('employmentRelationship', () => ({
    status: 'DRAFT',
  }));

  /**
   * Ejecuta el callback con el mismo cliente. El doble no simula rollback: las
   * pruebas que dependen de la atomicidad real corren contra PostgreSQL.
   */
  async $transaction<T>(callback: (tx: FakePrisma) => Promise<T>): Promise<T> {
    return callback(this);
  }

  /** Vacía todas las tablas entre pruebas. */
  reset(): void {
    for (const table of [
      this.user,
      this.oneTimeCode,
      this.session,
      this.auditEvent,
      this.workerInvitation,
      this.employmentRelationship,
    ]) {
      table.rows.length = 0;
    }
  }

  auditActions(): string[] {
    return this.auditEvent.rows.map((row) => String(row['action']));
  }
}
