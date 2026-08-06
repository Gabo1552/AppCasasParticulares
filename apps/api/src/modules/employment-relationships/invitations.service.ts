import { Inject, Injectable } from '@nestjs/common';
import {
  EmploymentRelationshipStatus,
  PlatformRole,
  type WorkerInvitationStatus,
} from '@casas/database';
import { employmentRelationshipStateMachine } from '@casas/domain';
import type { CreateInvitationInput } from '@casas/contracts';
import { AuditAction, AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TokenService } from '../../common/crypto/token.service';
import { ConflictError, ForbiddenError, NotFoundError } from '../../common/http/app.errors';
import type { AuthenticatedActor } from '../../common/auth/auth.types';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import { EmployersService } from '../employers/employers.service';
import { HouseholdsService } from '../households/households.service';
import { NotificationsService } from '../notifications/notifications.service';
import { WorkersService } from '../workers/workers.service';

export interface InvitationView {
  id: string;
  workerEmail: string;
  workerName: string | null;
  status: WorkerInvitationStatus;
  householdId: string;
  householdLabel: string;
  expiresAt: string;
  sentAt: string;
  resentCount: number;
  employmentRelationshipId: string | null;
}

/** Lo que ve quien abre el enlace, antes de decidir. Sin datos de más. */
export interface ResolvedInvitation {
  id: string;
  employerName: string;
  householdLabel: string;
  householdCity: string;
  workerEmail: string;
  expiresAt: string;
  status: WorkerInvitationStatus;
}

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
    private readonly employers: EmployersService,
    private readonly households: HouseholdsService,
    private readonly workers: WorkersService,
    private readonly notifications: NotificationsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async create(actor: AuthenticatedActor, input: CreateInvitationInput): Promise<InvitationView> {
    const employerId = await this.employers.requireEmployerId(actor);
    const household = await this.households.findOwnedOrFail(actor, input.householdId);

    const duplicate = await this.prisma.workerInvitation.findFirst({
      where: {
        employerId,
        householdId: household.id,
        workerEmail: input.workerEmail,
        status: 'PENDING',
      },
    });
    if (duplicate !== null) {
      throw new ConflictError(
        'INVITATION_ALREADY_PENDING',
        'Ya hay una invitación pendiente para ese correo en este domicilio.',
      );
    }

    const token = this.tokens.generateOpaqueToken();
    const expiresAt = new Date(Date.now() + input.expiresInDays * 24 * 60 * 60_000);

    const invitation = await this.prisma.$transaction(async (tx) => {
      const created = await tx.workerInvitation.create({
        data: {
          employerId,
          householdId: household.id,
          workerEmail: input.workerEmail,
          workerName: input.workerName ?? null,
          // Sólo el hash. El valor en claro viaja una vez, en el correo.
          tokenHash: this.tokens.hashOpaqueToken(token),
          expiresAt,
          createdByUserId: actor.userId,
        },
        include: { household: true },
      });

      await this.audit.record(tx, {
        action: AuditAction.INVITATION_CREATED,
        entityType: 'WorkerInvitation',
        entityId: created.id,
        actor: {
          userId: actor.userId,
          role: PlatformRole.FAMILY_EMPLOYER,
          ipAddress: actor.ipAddress,
        },
        // Se audita a quién y para qué domicilio, nunca el token (INV-AUD-02).
        after: { workerEmail: created.workerEmail, householdId: created.householdId },
      });

      return created;
    });

    const employer = await this.employers.get(actor);
    await this.notifications.sendWorkerInvitation({
      to: invitation.workerEmail,
      employerName: `${employer.firstName} ${employer.lastName}`,
      householdLabel: household.label,
      acceptUrl: `${this.config.WEB_BASE_URL}/invitacion/${token}`,
      expiresAt,
    });

    return toView(invitation, household.label);
  }

  async listForEmployer(actor: AuthenticatedActor): Promise<InvitationView[]> {
    const employerId = await this.employers.requireEmployerId(actor);
    const invitations = await this.prisma.workerInvitation.findMany({
      where: { employerId },
      include: { household: true },
      orderBy: { createdAt: 'desc' },
    });
    return invitations.map((i) => toView(i, i.household.label));
  }

  async countPendingFor(email: string): Promise<number> {
    if (email.length === 0) return 0;
    return this.prisma.workerInvitation.count({
      where: { workerEmail: email.toLowerCase(), status: 'PENDING', expiresAt: { gt: new Date() } },
    });
  }

  /**
   * Resuelve un token para mostrar la invitación.
   *
   * Es público: quien abre el enlace todavía puede no tener sesión. Por eso
   * devuelve sólo lo necesario para decidir —quién invita y a qué domicilio— y
   * nunca el id del empleador ni la dirección exacta.
   */
  async resolveByToken(token: string): Promise<ResolvedInvitation> {
    const invitation = await this.findByTokenOrFail(token);
    const expired = await this.expireIfNeeded(invitation);

    return {
      id: invitation.id,
      employerName: invitation.employer.legalName,
      householdLabel: invitation.household.label,
      householdCity: invitation.household.city,
      workerEmail: invitation.workerEmail,
      expiresAt: invitation.expiresAt.toISOString(),
      status: expired ? 'EXPIRED' : invitation.status,
    };
  }

  /**
   * La trabajadora acepta: nace la relación laboral en `PENDING_CONFIGURATION`.
   *
   * Aceptar **no** activa nada. La relación queda esperando que la familia cargue
   * las condiciones, que después la trabajadora aceptará por separado (ADR 0002).
   */
  async accept(actor: AuthenticatedActor, token: string): Promise<{ relationshipId: string }> {
    const invitation = await this.findByTokenOrFail(token);
    await this.assertUsable(invitation, actor);

    const workerId = await this.workers.requireWorkerId(actor);

    const relationshipId = await this.prisma.$transaction(async (tx) => {
      // La transición valida la guarda del dominio antes de escribir.
      const nextStatus = employmentRelationshipStateMachine.transition(
        EmploymentRelationshipStatus.DRAFT,
        EmploymentRelationshipStatus.PENDING_CONFIGURATION,
        { actorRole: PlatformRole.SYSTEM, payload: { hasHousehold: true } },
      );

      const relationship = await tx.employmentRelationship.create({
        data: {
          employerId: invitation.employerId,
          workerId,
          householdId: invitation.householdId,
          status: nextStatus,
          // Fecha provisoria: la familia la fija al cargar las condiciones.
          startDate: new Date(),
          createdByUserId: actor.userId,
        },
      });

      // El `updateMany` con `status: PENDING` es lo que hace la aceptación
      // idempotente: un segundo intento no encuentra filas y falla.
      const consumed = await tx.workerInvitation.updateMany({
        where: { id: invitation.id, status: 'PENDING' },
        data: {
          status: 'ACCEPTED',
          respondedAt: new Date(),
          respondedByUserId: actor.userId,
          employmentRelationshipId: relationship.id,
          version: { increment: 1 },
        },
      });
      if (consumed.count === 0) {
        throw new ConflictError('INVITATION_ALREADY_USED', 'Esta invitación ya fue utilizada.');
      }

      await this.audit.record(tx, {
        action: AuditAction.INVITATION_ACCEPTED,
        entityType: 'WorkerInvitation',
        entityId: invitation.id,
        actor: { userId: actor.userId, role: PlatformRole.WORKER, ipAddress: actor.ipAddress },
        after: { employmentRelationshipId: relationship.id },
      });
      await this.audit.record(tx, {
        action: AuditAction.RELATIONSHIP_CREATED,
        entityType: 'EmploymentRelationship',
        entityId: relationship.id,
        actor: { userId: actor.userId, role: PlatformRole.WORKER, ipAddress: actor.ipAddress },
        after: { status: nextStatus, householdId: invitation.householdId },
      });

      return relationship.id;
    });

    const worker = await this.workers.get(actor);
    if (invitation.employer.user.email !== null) {
      await this.notifications.sendInvitationAccepted({
        to: invitation.employer.user.email,
        workerName: `${worker.firstName} ${worker.lastName}`,
        householdLabel: invitation.household.label,
        dashboardUrl: `${this.config.WEB_BASE_URL}/familia/relaciones/${relationshipId}`,
      });
    }

    return { relationshipId };
  }

  async reject(actor: AuthenticatedActor, token: string, reason?: string): Promise<void> {
    const invitation = await this.findByTokenOrFail(token);
    await this.assertUsable(invitation, actor);

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.workerInvitation.updateMany({
        where: { id: invitation.id, status: 'PENDING' },
        data: {
          status: 'REJECTED',
          respondedAt: new Date(),
          respondedByUserId: actor.userId,
          revokedReason: reason ?? null,
          version: { increment: 1 },
        },
      });
      if (updated.count === 0) {
        throw new ConflictError('INVITATION_ALREADY_USED', 'Esta invitación ya fue utilizada.');
      }

      await this.audit.record(tx, {
        action: AuditAction.INVITATION_REJECTED,
        entityType: 'WorkerInvitation',
        entityId: invitation.id,
        actor: { userId: actor.userId, role: PlatformRole.WORKER, ipAddress: actor.ipAddress },
        after: { reason: reason ?? null },
      });
    });
  }

  async revoke(actor: AuthenticatedActor, invitationId: string, reason?: string): Promise<void> {
    const invitation = await this.findOwnedOrFail(actor, invitationId);
    if (invitation.status !== 'PENDING') {
      throw new ConflictError(
        'INVITATION_NOT_PENDING',
        'Sólo se puede dar de baja una invitación pendiente.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.workerInvitation.update({
        where: { id: invitation.id },
        data: {
          status: 'REVOKED',
          revokedAt: new Date(),
          revokedReason: reason ?? null,
          version: { increment: 1 },
        },
      });
      await this.audit.record(tx, {
        action: AuditAction.INVITATION_REVOKED,
        entityType: 'WorkerInvitation',
        entityId: invitation.id,
        actor: {
          userId: actor.userId,
          role: PlatformRole.FAMILY_EMPLOYER,
          ipAddress: actor.ipAddress,
        },
        after: { reason: reason ?? null },
      });
    });

    await this.notifications.sendInvitationRevoked({
      to: invitation.workerEmail,
      employerName: invitation.employer.legalName,
      householdLabel: invitation.household.label,
    });
  }

  /**
   * Reenvía la invitación con un token **nuevo**.
   *
   * El anterior deja de servir: si el correo original quedó en un buzón ajeno,
   * reenviar lo invalida en lugar de sumar un segundo enlace válido.
   */
  async resend(actor: AuthenticatedActor, invitationId: string): Promise<InvitationView> {
    const invitation = await this.findOwnedOrFail(actor, invitationId);
    if (invitation.status !== 'PENDING') {
      throw new ConflictError(
        'INVITATION_NOT_PENDING',
        'Sólo se puede reenviar una invitación pendiente.',
      );
    }

    const token = this.tokens.generateOpaqueToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60_000);

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.workerInvitation.update({
        where: { id: invitation.id },
        data: {
          tokenHash: this.tokens.hashOpaqueToken(token),
          expiresAt,
          lastResentAt: new Date(),
          resentCount: { increment: 1 },
          version: { increment: 1 },
        },
        include: { household: true },
      });
      await this.audit.record(tx, {
        action: AuditAction.INVITATION_RESENT,
        entityType: 'WorkerInvitation',
        entityId: invitation.id,
        actor: {
          userId: actor.userId,
          role: PlatformRole.FAMILY_EMPLOYER,
          ipAddress: actor.ipAddress,
        },
        after: { resentCount: result.resentCount, expiresAt: expiresAt.toISOString() },
      });
      return result;
    });

    await this.notifications.sendWorkerInvitation({
      to: invitation.workerEmail,
      employerName: invitation.employer.legalName,
      householdLabel: invitation.household.label,
      acceptUrl: `${this.config.WEB_BASE_URL}/invitacion/${token}`,
      expiresAt,
    });

    return toView(updated, updated.household.label);
  }

  // ─── Auxiliares ────────────────────────────────────────────────────────────

  private async findByTokenOrFail(token: string) {
    const invitation = await this.prisma.workerInvitation.findUnique({
      where: { tokenHash: this.tokens.hashOpaqueToken(token) },
      include: { household: true, employer: { include: { user: true } } },
    });
    if (invitation === null) {
      throw new NotFoundError('Este enlace de invitación no es válido.');
    }
    return invitation;
  }

  private async findOwnedOrFail(actor: AuthenticatedActor, invitationId: string) {
    const employerId = await this.employers.requireEmployerId(actor);
    const invitation = await this.prisma.workerInvitation.findFirst({
      where: { id: invitationId, employerId },
      include: { household: true, employer: { include: { user: true } } },
    });
    if (invitation === null) {
      throw new NotFoundError('No encontramos esa invitación.');
    }
    return invitation;
  }

  private async expireIfNeeded(invitation: {
    id: string;
    status: WorkerInvitationStatus;
    expiresAt: Date;
  }): Promise<boolean> {
    if (invitation.status !== 'PENDING' || invitation.expiresAt >= new Date()) return false;
    await this.prisma.workerInvitation.updateMany({
      where: { id: invitation.id, status: 'PENDING' },
      data: { status: 'EXPIRED' },
    });
    return true;
  }

  /**
   * Verifica que la invitación se pueda usar y que la use quien corresponde.
   *
   * El token identifica la invitación, no autoriza a la persona: se exige además
   * que el correo de la sesión coincida con el correo invitado. Sin eso, quien
   * consiguiera un enlace ajeno podría vincularse a un domicilio que no le fue
   * ofrecido.
   */
  private async assertUsable(
    invitation: {
      id: string;
      status: WorkerInvitationStatus;
      expiresAt: Date;
      workerEmail: string;
    },
    actor: AuthenticatedActor,
  ): Promise<void> {
    if (await this.expireIfNeeded(invitation)) {
      throw new ConflictError('INVITATION_EXPIRED', 'Esta invitación venció.');
    }
    if (invitation.status === 'REVOKED') {
      throw new ConflictError('INVITATION_REVOKED', 'Esta invitación fue dada de baja.');
    }
    if (invitation.status !== 'PENDING') {
      throw new ConflictError('INVITATION_ALREADY_USED', 'Esta invitación ya fue utilizada.');
    }

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: actor.userId } });
    if (user.email?.toLowerCase() !== invitation.workerEmail.toLowerCase()) {
      throw new ForbiddenError('Esta invitación fue enviada a otra dirección de correo.');
    }
  }
}

function toView(
  invitation: {
    id: string;
    workerEmail: string;
    workerName: string | null;
    status: WorkerInvitationStatus;
    householdId: string;
    expiresAt: Date;
    sentAt: Date;
    resentCount: number;
    employmentRelationshipId: string | null;
  },
  householdLabel: string,
): InvitationView {
  return {
    id: invitation.id,
    workerEmail: invitation.workerEmail,
    workerName: invitation.workerName,
    status: invitation.status,
    householdId: invitation.householdId,
    householdLabel,
    expiresAt: invitation.expiresAt.toISOString(),
    sentAt: invitation.sentAt.toISOString(),
    resentCount: invitation.resentCount,
    employmentRelationshipId: invitation.employmentRelationshipId,
  };
}
