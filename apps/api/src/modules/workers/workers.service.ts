import { Injectable } from '@nestjs/common';
import { PlatformRole } from '@casas/database';
import type { CreateProfileInput, UpdateProfileInput } from '@casas/contracts';
import { AuditAction, AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ConflictError, ProfileRequiredError } from '../../common/http/app.errors';
import type { AuthenticatedActor } from '../../common/auth/auth.types';
import { recordConsents, type ProfileView } from '../employers/employers.service';

/**
 * Perfil de la trabajadora.
 *
 * Simétrico al de la familia: crearlo otorga el rol `WORKER`. No se piden datos
 * bancarios, CUIL ni documentación: nada de eso hace falta para el recorrido, y
 * el principio de minimización dice que lo que no se necesita no se pide.
 */
@Injectable()
export class WorkersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(actor: AuthenticatedActor, input: CreateProfileInput): Promise<ProfileView> {
    const existing = await this.prisma.worker.findUnique({ where: { userId: actor.userId } });
    if (existing !== null) {
      throw new ConflictError('WORKER_PROFILE_EXISTS', 'Ya tenés un perfil de trabajadora.');
    }

    return this.prisma.$transaction(async (tx) => {
      const worker = await tx.worker.create({
        data: {
          userId: actor.userId,
          firstName: input.firstName,
          lastName: input.lastName,
          legalName: `${input.firstName} ${input.lastName}`,
          createdByUserId: actor.userId,
        },
      });

      await tx.user.update({
        where: { id: actor.userId },
        data: {
          displayName: `${input.firstName} ${input.lastName}`,
          phone: input.phone,
          timezone: input.timezone,
        },
      });

      await tx.userRole.upsert({
        where: { userId_role: { userId: actor.userId, role: PlatformRole.WORKER } },
        update: { revokedAt: null },
        create: { userId: actor.userId, role: PlatformRole.WORKER },
      });

      await recordConsents(tx, actor.userId, actor.ipAddress);

      await this.audit.record(tx, {
        action: AuditAction.WORKER_PROFILE_CREATED,
        entityType: 'Worker',
        entityId: worker.id,
        actor: { userId: actor.userId, role: PlatformRole.WORKER, ipAddress: actor.ipAddress },
        after: { firstName: input.firstName, lastName: input.lastName, timezone: input.timezone },
      });

      return {
        id: worker.id,
        firstName: worker.firstName,
        lastName: worker.lastName,
        phone: input.phone,
        timezone: input.timezone,
      };
    });
  }

  async get(actor: AuthenticatedActor): Promise<ProfileView> {
    const worker = await this.prisma.worker.findUnique({
      where: { userId: actor.userId },
      include: { user: true },
    });
    if (worker === null) throw new ProfileRequiredError('WORKER');
    return {
      id: worker.id,
      firstName: worker.firstName,
      lastName: worker.lastName,
      phone: worker.user.phone,
      timezone: worker.user.timezone,
    };
  }

  async update(actor: AuthenticatedActor, input: UpdateProfileInput): Promise<ProfileView> {
    const worker = await this.prisma.worker.findUnique({ where: { userId: actor.userId } });
    if (worker === null) throw new ProfileRequiredError('WORKER');

    const firstName = input.firstName ?? worker.firstName;
    const lastName = input.lastName ?? worker.lastName;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.worker.update({
        where: { id: worker.id },
        data: { firstName, lastName, legalName: `${firstName} ${lastName}` },
      });

      const user = await tx.user.update({
        where: { id: actor.userId },
        data: {
          displayName: `${firstName} ${lastName}`,
          ...(input.phone === undefined ? {} : { phone: input.phone }),
          ...(input.timezone === undefined ? {} : { timezone: input.timezone }),
        },
      });

      await this.audit.record(tx, {
        action: AuditAction.WORKER_PROFILE_UPDATED,
        entityType: 'Worker',
        entityId: worker.id,
        actor: { userId: actor.userId, role: PlatformRole.WORKER, ipAddress: actor.ipAddress },
        before: { firstName: worker.firstName, lastName: worker.lastName },
        after: { firstName, lastName },
      });

      return {
        id: updated.id,
        firstName: updated.firstName,
        lastName: updated.lastName,
        phone: user.phone,
        timezone: user.timezone,
      };
    });
  }

  async requireWorkerId(actor: AuthenticatedActor): Promise<string> {
    if (actor.workerId !== null) return actor.workerId;
    const worker = await this.prisma.worker.findUnique({ where: { userId: actor.userId } });
    if (worker === null) throw new ProfileRequiredError('WORKER');
    return worker.id;
  }
}
