import { describe, expect, it, vi } from 'vitest';
import { ResourceVersionConflictError } from '@casas/domain';
import { canonicalizeJson, RelationshipsService } from '../relationships.service';
import type { PrismaService } from '../../../common/prisma/prisma.service';
import type { AuthenticatedActor } from '../../../common/auth/auth.types';
import type { NotificationsService } from '../../notifications/notifications.service';
import type { AppConfig } from '../../../config/app-config';

describe('Prueba de Concurrencia Real — Modificación y Aceptación Simultáneas', () => {
  it('impide activar una relación modificada si la trabajadora intenta aceptar sobre una versión previa', async () => {
    let currentVersion = 2;

    const mockRelationship = {
      id: 'rel-100',
      version: 2, // Ambas operaciones leen versión 2 inicialmente
      status: 'PENDING_WORKER_ACCEPTANCE',
      workerId: 'worker-1',
      terms: [
        {
          id: 'terms-1',
          version: 1,
          categoryCode: 'TAREAS_GENERALES',
          liveInMode: 'WITH_WITHDRAWAL',
          remunerationScheme: 'MONTHLY',
          agreedRemuneration: '350000.00',
          weeklyHours: 24,
        },
      ],
      schedules: [{ id: 'sched-1', version: 1, status: 'PUBLISHED' }],
      employer: { user: { email: 'familia@example.com' }, legalName: 'Familia Perez' },
      worker: { user: { email: 'trabajadora@example.com' }, legalName: 'Ana Gomez' },
      household: { label: 'Casa Centro' },
    };

    const mockPrisma = {
      employmentRelationship: {
        findFirst: vi
          .fn()
          .mockImplementation(() => Promise.resolve({ ...mockRelationship, version: 2 })),
        updateMany: vi.fn().mockImplementation(({ where }) => {
          // Si donde busca versión no coincide con la versión actual (que cambia cuando una transacción se ejecuta primero),
          // incrementa o rechaza
          if (where.version === currentVersion) {
            currentVersion += 1;
            return Promise.resolve({ count: 1 });
          }
          return Promise.resolve({ count: 0 });
        }),
      },
      relationshipTerms: {
        findFirst: vi.fn().mockResolvedValue(mockRelationship.terms[0]),
        update: vi.fn().mockResolvedValue({}),
      },
      $transaction: vi
        .fn()
        .mockImplementation((cb: (tx: unknown) => Promise<unknown>) => cb(mockPrisma)),
    } as unknown as PrismaService;

    const audit = { record: vi.fn().mockResolvedValue({}) };
    const notifications = { sendConditionsAccepted: vi.fn().mockResolvedValue({}) };
    const config = { WEB_BASE_URL: 'http://localhost:3000' } as AppConfig;

    const service = new RelationshipsService(
      mockPrisma,
      audit as never,
      notifications as unknown as NotificationsService,
      config,
    );
    // Mock private getParticipating to return relationship view
    vi.spyOn(
      service as unknown as { getParticipating: () => Promise<unknown> },
      'getParticipating',
    ).mockResolvedValue({ id: 'rel-100', status: 'ACTIVE' });

    const employerActor = {
      userId: 'user-employer',
      sessionId: 'sess-1',
      roles: ['FAMILY_EMPLOYER'],
      employerId: 'emp-1',
    } as unknown as AuthenticatedActor;
    const workerActor = {
      userId: 'user-worker',
      sessionId: 'sess-2',
      roles: ['WORKER'],
      workerId: 'worker-1',
    } as unknown as AuthenticatedActor;

    // Ejecutar simultáneamente saveConditions y acceptConditions sobre la misma versión 2
    const results = await Promise.allSettled([
      service.saveConditions(employerActor, 'rel-100', {
        plannedStartDate: '2026-09-01',
        categoryCode: 'TAREAS_GENERALES',
        liveInMode: 'WITH_WITHDRAWAL',
        remunerationScheme: 'MONTHLY',
        agreedRemuneration: '400000.00',
        weeklyHours: 24,
        requiresProfessionalReview: false,
      }),
      service.acceptConditions(workerActor, 'rel-100'),
    ]);

    const succeeded = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');

    // Debe haber exactamente un éxito (el primero en llegar) y un rechazo por RESOURCE_VERSION_CONFLICT (el segundo)
    expect(succeeded.length).toBe(1);
    expect(failed.length).toBe(1);
    const rejection = (failed[0] as PromiseRejectedResult).reason;
    expect(rejection).toBeInstanceOf(ResourceVersionConflictError);
  });

  it('verifica que canonicalizeJson ordene determinísticamente las claves independientemente del orden de inserción', () => {
    const objA = { z: 1, a: 2, m: { b: 3, a: 4 } };
    const objB = { a: 2, m: { a: 4, b: 3 }, z: 1 };

    expect(canonicalizeJson(objA)).toBe(canonicalizeJson(objB));
    expect(canonicalizeJson(objA)).toBe('{"a":2,"m":{"a":4,"b":3},"z":1}');
  });
});
