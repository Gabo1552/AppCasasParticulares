import { Injectable } from '@nestjs/common';
import { PlatformRole } from '@casas/database';
import type { CreateProfileInput, UpdateProfileInput } from '@casas/contracts';
import { AuditAction, AuditService } from '../../common/audit/audit.service';
import { PrismaService, type PrismaTx } from '../../common/prisma/prisma.service';
import { ConflictError, NotFoundError, ProfileRequiredError } from '../../common/http/app.errors';
import type { AuthenticatedActor } from '../../common/auth/auth.types';

export interface ProfileView {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  timezone: string;
}

/**
 * Perfil de la familia empleadora.
 *
 * Crear el perfil es lo que otorga el rol `FAMILY_EMPLOYER`: un usuario
 * autenticado sin perfil no puede operar como familia. Eso hace que el rol no
 * pueda existir sin la entidad que lo respalda.
 */
@Injectable()
export class EmployersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(actor: AuthenticatedActor, input: CreateProfileInput): Promise<ProfileView> {
    const existing = await this.prisma.employer.findUnique({ where: { userId: actor.userId } });
    if (existing !== null) {
      throw new ConflictError('EMPLOYER_PROFILE_EXISTS', 'Ya tenés un perfil de familia.');
    }

    return this.prisma.$transaction(async (tx) => {
      const employer = await tx.employer.create({
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
        where: { userId_role: { userId: actor.userId, role: PlatformRole.FAMILY_EMPLOYER } },
        update: { revokedAt: null },
        create: { userId: actor.userId, role: PlatformRole.FAMILY_EMPLOYER },
      });

      await recordConsents(tx, actor.userId, actor.ipAddress);

      await this.audit.record(tx, {
        action: AuditAction.EMPLOYER_PROFILE_CREATED,
        entityType: 'Employer',
        entityId: employer.id,
        actor: {
          userId: actor.userId,
          role: PlatformRole.FAMILY_EMPLOYER,
          ipAddress: actor.ipAddress,
        },
        after: { firstName: input.firstName, lastName: input.lastName, timezone: input.timezone },
      });

      return toView(employer, input.phone, input.timezone);
    });
  }

  async get(actor: AuthenticatedActor): Promise<ProfileView> {
    const employer = await this.prisma.employer.findUnique({
      where: { userId: actor.userId },
      include: { user: true },
    });
    if (employer === null) throw new ProfileRequiredError('EMPLOYER');
    return toView(employer, employer.user.phone, employer.user.timezone);
  }

  async update(actor: AuthenticatedActor, input: UpdateProfileInput): Promise<ProfileView> {
    const employer = await this.prisma.employer.findUnique({
      where: { userId: actor.userId },
      include: { user: true },
    });
    if (employer === null) throw new ProfileRequiredError('EMPLOYER');

    const firstName = input.firstName ?? employer.firstName;
    const lastName = input.lastName ?? employer.lastName;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.employer.update({
        where: { id: employer.id },
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
        action: AuditAction.EMPLOYER_PROFILE_UPDATED,
        entityType: 'Employer',
        entityId: employer.id,
        actor: {
          userId: actor.userId,
          role: PlatformRole.FAMILY_EMPLOYER,
          ipAddress: actor.ipAddress,
        },
        before: { firstName: employer.firstName, lastName: employer.lastName },
        after: { firstName, lastName },
      });

      return toView(updated, user.phone, user.timezone);
    });
  }

  /** Resuelve el empleador del actor o falla con un error accionable. */
  async requireEmployerId(actor: AuthenticatedActor): Promise<string> {
    if (actor.employerId !== null) return actor.employerId;
    const employer = await this.prisma.employer.findUnique({ where: { userId: actor.userId } });
    if (employer === null) throw new ProfileRequiredError('EMPLOYER');
    return employer.id;
  }
}

function toView(
  employer: { id: string; firstName: string; lastName: string },
  phone: string | null,
  timezone: string,
): ProfileView {
  return {
    id: employer.id,
    firstName: employer.firstName,
    lastName: employer.lastName,
    phone,
    timezone,
  };
}

/**
 * Registra la aceptación de términos y privacidad con la versión exacta del texto
 * que la persona vio (SEG-04).
 */
export async function recordConsents(
  tx: PrismaTx,
  userId: string,
  ipAddress?: string,
): Promise<void> {
  const documents = await tx.consentDocument.findMany({
    where: { kind: { in: ['TERMS_OF_SERVICE', 'PRIVACY_POLICY'] } },
    orderBy: { publishedAt: 'desc' },
  });

  const latestByKind = new Map<string, (typeof documents)[number]>();
  for (const doc of documents) {
    if (!latestByKind.has(doc.kind)) latestByKind.set(doc.kind, doc);
  }

  if (latestByKind.size < 2) {
    throw new NotFoundError(
      'No hay textos de términos y privacidad publicados. Ejecutá los seeds.',
    );
  }

  for (const doc of latestByKind.values()) {
    await tx.consent.create({
      data: {
        userId,
        consentDocumentId: doc.id,
        purpose: doc.kind,
        ipAddress: ipAddress ?? null,
      },
    });
  }
}
