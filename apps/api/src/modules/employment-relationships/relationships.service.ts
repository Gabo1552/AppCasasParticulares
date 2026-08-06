import { Injectable } from '@nestjs/common';
import {
  EmploymentRelationshipStatus,
  PlatformRole,
  Prisma,
  type WorkScheduleStatus,
} from '@casas/database';
import { employmentRelationshipStateMachine } from '@casas/domain';
import { toTimeOfDay, type RelationshipConditionsInput } from '@casas/contracts';
import { AuditAction, AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ForbiddenError, NotFoundError, UnprocessableError } from '../../common/http/app.errors';
import type { AuthenticatedActor } from '../../common/auth/auth.types';
import { NotificationsService } from '../notifications/notifications.service';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import { Inject } from '@nestjs/common';

export interface RelationshipView {
  id: string;
  status: EmploymentRelationshipStatus;
  household: { id: string; label: string; city: string; timezone: string };
  employer: { id: string; name: string };
  worker: { id: string; name: string } | null;
  conditions: ConditionsView | null;
  schedule: ScheduleView | null;
  /** Qué tiene que pasar ahora, y quién lo tiene que hacer. */
  nextAction: { actor: 'FAMILY_EMPLOYER' | 'WORKER' | 'NONE'; description: string };
  version: number;
}

export interface ConditionsView {
  plannedStartDate: string;
  categoryCode: string;
  liveInMode: string;
  remunerationScheme: string;
  /** String decimal exacto, nunca number (RN-13). */
  agreedRemuneration: string;
  currency: string;
  weeklyHours: number | null;
  paymentDayOfMonth: number | null;
  requiresProfessionalReview: boolean;
  adminNotes: string | null;
  acceptedByWorkerAt: string | null;
}

export interface ScheduleView {
  status: WorkScheduleStatus;
  effectiveFrom: string;
  timezone: string;
  days: { dayOfWeek: number; startTime: string; endTime: string; breakMinutes: number }[];
  weeklyMinutes: number;
}

@Injectable()
export class RelationshipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Lista las relaciones donde el actor participa, como familia o trabajadora. */
  async list(actor: AuthenticatedActor): Promise<RelationshipView[]> {
    const where = this.visibilityFilter(actor);
    const relationships = await this.prisma.employmentRelationship.findMany({
      where,
      include: FULL_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return relationships.map(toView);
  }

  async getParticipating(actor: AuthenticatedActor, id: string): Promise<RelationshipView> {
    return toView(await this.findParticipatingOrFail(actor, id));
  }

  /** Carga o reemplaza las condiciones. Sólo la familia. */
  async saveConditions(
    actor: AuthenticatedActor,
    id: string,
    input: RelationshipConditionsInput,
  ): Promise<RelationshipView> {
    const relationship = await this.findAsEmployerOrFail(actor, id);

    if (
      relationship.status !== EmploymentRelationshipStatus.PENDING_CONFIGURATION &&
      relationship.status !== EmploymentRelationshipStatus.PENDING_WORKER_ACCEPTANCE
    ) {
      throw new UnprocessableError(
        'RELATIONSHIP_NOT_EDITABLE',
        'Las condiciones sólo se pueden editar antes de que la relación quede activa.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const current = await tx.relationshipTerms.findFirst({
        where: { employmentRelationshipId: id, effectiveTo: null },
        orderBy: { effectiveFrom: 'desc' },
      });

      // REL-05: no se sobrescribe una vigencia; se cierra y se abre otra.
      if (current !== null) {
        await tx.relationshipTerms.update({
          where: { id: current.id },
          data: { effectiveTo: new Date(input.plannedStartDate) },
        });
      }

      await tx.relationshipTerms.create({
        data: {
          employmentRelationshipId: id,
          effectiveFrom: new Date(input.plannedStartDate),
          categoryCode: input.categoryCode,
          liveInMode: input.liveInMode,
          remunerationScheme: input.remunerationScheme,
          agreedRemuneration: new Prisma.Decimal(input.agreedRemuneration),
          currency: 'ARS',
          weeklyHours: input.weeklyHours,
          paymentDayOfMonth: input.paymentDayOfMonth ?? null,
          requiresProfessionalReview: input.requiresProfessionalReview,
          adminNotes: input.adminNotes ?? null,
          changeReason: input.changeReason ?? null,
          createdByUserId: actor.userId,
        },
      });

      await tx.employmentRelationship.update({
        where: { id },
        data: { startDate: new Date(input.plannedStartDate), version: { increment: 1 } },
      });

      // Editar condiciones ya enviadas las devuelve a configuración: la
      // trabajadora tiene que volver a verlas antes de aceptar.
      if (relationship.status === EmploymentRelationshipStatus.PENDING_WORKER_ACCEPTANCE) {
        const back = employmentRelationshipStateMachine.transition(
          relationship.status,
          EmploymentRelationshipStatus.PENDING_CONFIGURATION,
          {
            actorRole: PlatformRole.FAMILY_EMPLOYER,
            payload: { reason: 'La familia modificó las condiciones enviadas' },
          },
        );
        await tx.employmentRelationship.update({ where: { id }, data: { status: back } });
      }

      await this.audit.record(tx, {
        action: AuditAction.RELATIONSHIP_CONDITIONS_UPDATED,
        entityType: 'EmploymentRelationship',
        entityId: id,
        actor: {
          userId: actor.userId,
          role: PlatformRole.FAMILY_EMPLOYER,
          ipAddress: actor.ipAddress,
        },
        after: {
          categoryCode: input.categoryCode,
          remunerationScheme: input.remunerationScheme,
          agreedRemuneration: input.agreedRemuneration,
          weeklyHours: input.weeklyHours,
        },
      });
    });

    return this.getParticipating(actor, id);
  }

  /** La familia envía las condiciones. Exige condiciones y calendario. */
  async submitConditions(actor: AuthenticatedActor, id: string): Promise<RelationshipView> {
    const relationship = await this.findAsEmployerOrFail(actor, id);

    const hasEffectiveTerms = relationship.terms.length > 0;
    const hasPublishedSchedule = relationship.schedules.some(
      (s) => s.status === 'PUBLISHED' && s.rules.length > 0,
    );

    const nextStatus = employmentRelationshipStateMachine.transition(
      relationship.status,
      EmploymentRelationshipStatus.PENDING_WORKER_ACCEPTANCE,
      {
        actorRole: PlatformRole.FAMILY_EMPLOYER,
        payload: { hasEffectiveTerms, hasPublishedSchedule },
      },
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.employmentRelationship.update({
        where: { id },
        data: { status: nextStatus, version: { increment: 1 } },
      });
      await this.audit.record(tx, {
        action: AuditAction.RELATIONSHIP_CONDITIONS_SUBMITTED,
        entityType: 'EmploymentRelationship',
        entityId: id,
        actor: {
          userId: actor.userId,
          role: PlatformRole.FAMILY_EMPLOYER,
          ipAddress: actor.ipAddress,
        },
        after: { status: nextStatus },
      });
    });

    const workerEmail = relationship.worker?.user.email;
    if (workerEmail != null) {
      await this.notifications.sendConditionsReadyForReview({
        to: workerEmail,
        employerName: relationship.employer.legalName,
        householdLabel: relationship.household.label,
        reviewUrl: `${this.config.WEB_BASE_URL}/trabajadora/relaciones/${id}`,
      });
    }

    return this.getParticipating(actor, id);
  }

  /**
   * La trabajadora acepta las condiciones y la relación queda activa.
   *
   * Es el único camino a ACTIVE (ADR 0002). La guarda de la máquina exige que la
   * aceptación esté registrada, así que se persiste la evidencia en la misma
   * transacción que el cambio de estado.
   */
  async acceptConditions(actor: AuthenticatedActor, id: string): Promise<RelationshipView> {
    const relationship = await this.findAsWorkerOrFail(actor, id);

    const nextStatus = employmentRelationshipStateMachine.transition(
      relationship.status,
      EmploymentRelationshipStatus.ACTIVE,
      { actorRole: PlatformRole.WORKER, payload: { hasWorkerAcceptance: true } },
    );

    const currentTerms = relationship.terms[0];
    if (currentTerms === undefined) {
      throw new UnprocessableError(
        'RELATIONSHIP_WITHOUT_TERMS',
        'Todavía no hay condiciones cargadas para aceptar.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const acceptedAt = new Date();

      await tx.relationshipTerms.update({
        where: { id: currentTerms.id },
        data: { acceptedByWorkerAt: acceptedAt },
      });

      await tx.employmentRelationship.update({
        where: { id },
        data: {
          status: nextStatus,
          workerAcceptedAt: acceptedAt,
          workerAcceptanceEvidence: {
            termsId: currentTerms.id,
            acceptedAt: acceptedAt.toISOString(),
            ipAddress: actor.ipAddress ?? null,
            userAgent: actor.userAgent ?? null,
          },
          version: { increment: 1 },
        },
      });

      await this.audit.record(tx, {
        action: AuditAction.RELATIONSHIP_CONDITIONS_ACCEPTED,
        entityType: 'EmploymentRelationship',
        entityId: id,
        actor: { userId: actor.userId, role: PlatformRole.WORKER, ipAddress: actor.ipAddress },
        after: { termsId: currentTerms.id },
      });
      await this.audit.record(tx, {
        action: AuditAction.RELATIONSHIP_ACTIVATED,
        entityType: 'EmploymentRelationship',
        entityId: id,
        actor: { userId: actor.userId, role: PlatformRole.WORKER, ipAddress: actor.ipAddress },
        after: { status: nextStatus },
      });
    });

    const employerEmail = relationship.employer.user.email;
    if (employerEmail != null && relationship.worker !== null) {
      await this.notifications.sendConditionsAccepted({
        to: employerEmail,
        workerName: relationship.worker.legalName,
        householdLabel: relationship.household.label,
      });
    }

    return this.getParticipating(actor, id);
  }

  /** La trabajadora rechaza: vuelve a configuración con el motivo registrado. */
  async rejectConditions(
    actor: AuthenticatedActor,
    id: string,
    reason: string,
  ): Promise<RelationshipView> {
    const relationship = await this.findAsWorkerOrFail(actor, id);

    const nextStatus = employmentRelationshipStateMachine.transition(
      relationship.status,
      EmploymentRelationshipStatus.PENDING_CONFIGURATION,
      { actorRole: PlatformRole.WORKER, payload: { reason } },
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.employmentRelationship.update({
        where: { id },
        data: { status: nextStatus, version: { increment: 1 } },
      });
      await this.audit.record(tx, {
        action: AuditAction.RELATIONSHIP_CONDITIONS_REJECTED,
        entityType: 'EmploymentRelationship',
        entityId: id,
        actor: { userId: actor.userId, role: PlatformRole.WORKER, ipAddress: actor.ipAddress },
        after: { reason },
      });
    });

    return this.getParticipating(actor, id);
  }

  // ─── Resolución con permiso por objeto ─────────────────────────────────────

  private visibilityFilter(actor: AuthenticatedActor): Prisma.EmploymentRelationshipWhereInput {
    // Un actor sólo ve relaciones donde participa. Sin perfil, no ve ninguna.
    if (actor.employerId !== null && actor.workerId !== null) {
      return { OR: [{ employerId: actor.employerId }, { workerId: actor.workerId }] };
    }
    if (actor.employerId !== null) return { employerId: actor.employerId };
    if (actor.workerId !== null) return { workerId: actor.workerId };
    return { id: '00000000-0000-0000-0000-000000000000' };
  }

  async findParticipatingOrFail(actor: AuthenticatedActor, id: string) {
    const relationship = await this.prisma.employmentRelationship.findFirst({
      where: { AND: [{ id }, this.visibilityFilter(actor)] },
      include: FULL_INCLUDE,
    });
    if (relationship === null) throw new NotFoundError('No encontramos esa relación laboral.');
    return relationship;
  }

  private async findAsEmployerOrFail(actor: AuthenticatedActor, id: string) {
    const relationship = await this.findParticipatingOrFail(actor, id);
    if (actor.employerId === null || relationship.employerId !== actor.employerId) {
      throw new ForbiddenError('Sólo la familia empleadora puede modificar las condiciones.');
    }
    return relationship;
  }

  private async findAsWorkerOrFail(actor: AuthenticatedActor, id: string) {
    const relationship = await this.findParticipatingOrFail(actor, id);
    if (actor.workerId === null || relationship.workerId !== actor.workerId) {
      throw new ForbiddenError('Sólo la trabajadora puede aceptar o rechazar las condiciones.');
    }
    return relationship;
  }
}

const FULL_INCLUDE = {
  household: true,
  employer: { include: { user: true } },
  worker: { include: { user: true } },
  terms: { where: { effectiveTo: null }, orderBy: { effectiveFrom: 'desc' } },
  schedules: {
    where: { status: 'PUBLISHED' },
    include: { rules: { orderBy: { dayOfWeek: 'asc' } } },
  },
} as const;

type RelationshipWithRelations = Prisma.EmploymentRelationshipGetPayload<{
  include: typeof FULL_INCLUDE;
}>;

export function toView(relationship: RelationshipWithRelations): RelationshipView {
  const terms = relationship.terms[0] ?? null;
  const schedule = relationship.schedules[0] ?? null;

  return {
    id: relationship.id,
    status: relationship.status,
    household: {
      id: relationship.household.id,
      label: relationship.household.label,
      city: relationship.household.city,
      timezone: relationship.household.timezone,
    },
    employer: { id: relationship.employer.id, name: relationship.employer.legalName },
    worker:
      relationship.worker === null
        ? null
        : { id: relationship.worker.id, name: relationship.worker.legalName },
    conditions:
      terms === null
        ? null
        : {
            plannedStartDate: terms.effectiveFrom.toISOString().slice(0, 10),
            categoryCode: terms.categoryCode,
            liveInMode: terms.liveInMode,
            remunerationScheme: terms.remunerationScheme,
            // Decimal → string exacto. Nunca `Number()` (RN-13).
            agreedRemuneration: terms.agreedRemuneration.toFixed(2),
            currency: terms.currency,
            weeklyHours: terms.weeklyHours,
            paymentDayOfMonth: terms.paymentDayOfMonth,
            requiresProfessionalReview: terms.requiresProfessionalReview,
            adminNotes: terms.adminNotes,
            acceptedByWorkerAt: terms.acceptedByWorkerAt?.toISOString() ?? null,
          },
    schedule:
      schedule === null
        ? null
        : {
            status: schedule.status,
            effectiveFrom: schedule.effectiveFrom.toISOString().slice(0, 10),
            timezone: relationship.household.timezone,
            days: schedule.rules.map((rule) => ({
              dayOfWeek: rule.dayOfWeek,
              startTime: toTimeOfDay(rule.startMinute),
              endTime: toTimeOfDay(rule.endMinute),
              breakMinutes: rule.breakMinutes,
            })),
            weeklyMinutes: schedule.rules.reduce(
              (total, rule) => total + (rule.endMinute - rule.startMinute - rule.breakMinutes),
              0,
            ),
          },
    nextAction: nextActionFor(relationship.status, terms !== null, schedule !== null),
    version: relationship.version,
  };
}

function nextActionFor(
  status: EmploymentRelationshipStatus,
  hasTerms: boolean,
  hasSchedule: boolean,
): RelationshipView['nextAction'] {
  switch (status) {
    case EmploymentRelationshipStatus.PENDING_CONFIGURATION:
      if (!hasTerms) {
        return { actor: 'FAMILY_EMPLOYER', description: 'Cargá las condiciones de trabajo.' };
      }
      if (!hasSchedule) {
        return { actor: 'FAMILY_EMPLOYER', description: 'Configurá el horario semanal.' };
      }
      return { actor: 'FAMILY_EMPLOYER', description: 'Enviá las condiciones a la trabajadora.' };
    case EmploymentRelationshipStatus.PENDING_WORKER_ACCEPTANCE:
      return { actor: 'WORKER', description: 'La trabajadora tiene que aceptar las condiciones.' };
    case EmploymentRelationshipStatus.ACTIVE:
      return { actor: 'NONE', description: 'La relación laboral está activa.' };
    default:
      return { actor: 'NONE', description: 'Sin acciones pendientes.' };
  }
}
