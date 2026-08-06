import { Injectable } from '@nestjs/common';
import { redact } from '@casas/observability';
import type { PlatformRole } from '@casas/database';
import type { PrismaTx } from '../prisma/prisma.service';

/**
 * Catálogo de acciones auditadas del recorrido de onboarding.
 *
 * Son constantes y no strings sueltos porque el valor queda persistido: cambiar
 * uno rompería las consultas sobre eventos históricos.
 */
export const AuditAction = {
  ACCESS_CODE_REQUESTED: 'ACCESS_CODE_REQUESTED',
  LOGIN_SUCCEEDED: 'LOGIN_SUCCEEDED',
  LOGIN_FAILED: 'LOGIN_FAILED',
  SESSION_REFRESHED: 'SESSION_REFRESHED',
  SESSION_REVOKED: 'SESSION_REVOKED',
  SESSION_REUSE_DETECTED: 'SESSION_REUSE_DETECTED',

  EMPLOYER_PROFILE_CREATED: 'EMPLOYER_PROFILE_CREATED',
  EMPLOYER_PROFILE_UPDATED: 'EMPLOYER_PROFILE_UPDATED',
  WORKER_PROFILE_CREATED: 'WORKER_PROFILE_CREATED',
  WORKER_PROFILE_UPDATED: 'WORKER_PROFILE_UPDATED',

  HOUSEHOLD_CREATED: 'HOUSEHOLD_CREATED',
  HOUSEHOLD_UPDATED: 'HOUSEHOLD_UPDATED',
  HOUSEHOLD_ARCHIVED: 'HOUSEHOLD_ARCHIVED',

  INVITATION_CREATED: 'INVITATION_CREATED',
  INVITATION_RESENT: 'INVITATION_RESENT',
  INVITATION_REVOKED: 'INVITATION_REVOKED',
  INVITATION_ACCEPTED: 'INVITATION_ACCEPTED',
  INVITATION_REJECTED: 'INVITATION_REJECTED',

  RELATIONSHIP_CREATED: 'RELATIONSHIP_CREATED',
  RELATIONSHIP_CONDITIONS_UPDATED: 'RELATIONSHIP_CONDITIONS_UPDATED',
  RELATIONSHIP_CONDITIONS_SUBMITTED: 'RELATIONSHIP_CONDITIONS_SUBMITTED',
  RELATIONSHIP_CONDITIONS_ACCEPTED: 'RELATIONSHIP_CONDITIONS_ACCEPTED',
  RELATIONSHIP_CONDITIONS_REJECTED: 'RELATIONSHIP_CONDITIONS_REJECTED',
  RELATIONSHIP_ACTIVATED: 'RELATIONSHIP_ACTIVATED',

  WORK_SCHEDULE_CREATED: 'WORK_SCHEDULE_CREATED',
  WORK_SCHEDULE_UPDATED: 'WORK_SCHEDULE_UPDATED',
} as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

export interface AuditActor {
  readonly userId: string | null;
  readonly role: PlatformRole;
  readonly ipAddress?: string | undefined;
  readonly userAgent?: string | undefined;
}

export interface AuditInput {
  readonly action: AuditAction;
  readonly entityType: string;
  readonly entityId: string;
  readonly actor: AuditActor;
  readonly before?: unknown;
  readonly after?: unknown;
  readonly correlationId?: string | undefined;
}

/**
 * Escritura de eventos de auditoría.
 *
 * Recibe siempre un cliente **dentro de una transacción**: el evento y el cambio
 * de negocio se persisten juntos o no se persiste ninguno (ADR 0001, decisión D9).
 * No existe un método que escriba fuera de transacción, para que no haya forma de
 * auditar "después" y perder el evento si algo falla en el medio.
 *
 * `before` y `after` pasan por el redactor de @casas/observability, que borra
 * secretos por nombre de campo y por patrón. Nunca se guardan códigos OTP,
 * tokens de invitación ni refresh tokens (INV-AUD-02).
 */
@Injectable()
export class AuditService {
  async record(tx: PrismaTx, input: AuditInput): Promise<void> {
    await tx.auditEvent.create({
      data: {
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        actorUserId: input.actor.userId,
        actorRole: input.actor.role,
        // Se omiten en lugar de pasarlos como `undefined`: con
        // exactOptionalPropertyTypes, "ausente" y "undefined" no son lo mismo.
        ...(input.before === undefined ? {} : { before: redact(input.before) as object }),
        ...(input.after === undefined ? {} : { after: redact(input.after) as object }),
        correlationId: input.correlationId ?? null,
        ipAddress: input.actor.ipAddress ?? null,
        userAgent: input.actor.userAgent ?? null,
      },
    });
  }
}
