import { Injectable } from '@nestjs/common';
import { PlatformRole } from '@casas/database';
import type { HouseholdInput, UpdateHouseholdInput } from '@casas/contracts';
import { AuditAction, AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ConflictError, NotFoundError } from '../../common/http/app.errors';
import type { AuthenticatedActor } from '../../common/auth/auth.types';
import { EmployersService } from '../employers/employers.service';

export interface HouseholdView {
  id: string;
  label: string;
  street: string;
  streetNumber: string;
  floor: string | null;
  apartment: string | null;
  city: string;
  province: string;
  postalCode: string;
  country: string;
  timezone: string;
  accessInstructions: string | null;
  isActive: boolean;
  version: number;
}

/**
 * Domicilios laborales de una familia.
 *
 * Toda consulta filtra por `employerId` del actor. No existe un método que
 * reciba sólo el id del domicilio: el propio tipo de las consultas impide que
 * una familia lea el domicilio de otra por descuido (SEG-03).
 */
@Injectable()
export class HouseholdsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly employers: EmployersService,
  ) {}

  async create(actor: AuthenticatedActor, input: HouseholdInput): Promise<HouseholdView> {
    const employerId = await this.employers.requireEmployerId(actor);

    return this.prisma.$transaction(async (tx) => {
      const household = await tx.household.create({
        data: {
          employerId,
          label: input.label,
          street: input.street,
          streetNumber: input.streetNumber,
          floor: input.floor ?? null,
          apartment: input.apartment ?? null,
          city: input.city,
          province: input.province,
          postalCode: input.postalCode,
          country: 'AR',
          timezone: input.timezone,
          accessInstructions: input.accessInstructions ?? null,
          createdByUserId: actor.userId,
        },
      });

      await this.audit.record(tx, {
        action: AuditAction.HOUSEHOLD_CREATED,
        entityType: 'Household',
        entityId: household.id,
        actor: {
          userId: actor.userId,
          role: PlatformRole.FAMILY_EMPLOYER,
          ipAddress: actor.ipAddress,
        },
        after: { label: household.label, city: household.city, province: household.province },
      });

      return toView(household);
    });
  }

  async list(actor: AuthenticatedActor): Promise<HouseholdView[]> {
    const employerId = await this.employers.requireEmployerId(actor);
    const households = await this.prisma.household.findMany({
      where: { employerId, archivedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    return households.map(toView);
  }

  async getOwned(actor: AuthenticatedActor, householdId: string): Promise<HouseholdView> {
    return toView(await this.findOwnedOrFail(actor, householdId));
  }

  async update(
    actor: AuthenticatedActor,
    householdId: string,
    input: UpdateHouseholdInput,
  ): Promise<HouseholdView> {
    const current = await this.findOwnedOrFail(actor, householdId);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.household.update({
        where: { id: current.id },
        data: {
          ...(input.label === undefined ? {} : { label: input.label }),
          ...(input.street === undefined ? {} : { street: input.street }),
          ...(input.streetNumber === undefined ? {} : { streetNumber: input.streetNumber }),
          ...(input.floor === undefined ? {} : { floor: input.floor }),
          ...(input.apartment === undefined ? {} : { apartment: input.apartment }),
          ...(input.city === undefined ? {} : { city: input.city }),
          ...(input.province === undefined ? {} : { province: input.province }),
          ...(input.postalCode === undefined ? {} : { postalCode: input.postalCode }),
          ...(input.timezone === undefined ? {} : { timezone: input.timezone }),
          ...(input.accessInstructions === undefined
            ? {}
            : { accessInstructions: input.accessInstructions }),
          version: { increment: 1 },
        },
      });

      await this.audit.record(tx, {
        action: AuditAction.HOUSEHOLD_UPDATED,
        entityType: 'Household',
        entityId: updated.id,
        actor: {
          userId: actor.userId,
          role: PlatformRole.FAMILY_EMPLOYER,
          ipAddress: actor.ipAddress,
        },
        before: { label: current.label, city: current.city },
        after: { label: updated.label, city: updated.city },
      });

      return toView(updated);
    });
  }

  /**
   * Baja lógica. Nunca borrado físico: el domicilio puede estar referenciado por
   * relaciones laborales e invitaciones históricas (decisión D10).
   */
  async archive(actor: AuthenticatedActor, householdId: string): Promise<void> {
    const household = await this.findOwnedOrFail(actor, householdId);

    const activeRelationships = await this.prisma.employmentRelationship.count({
      where: { householdId: household.id, status: { notIn: ['ARCHIVED', 'TERMINATED'] } },
    });
    if (activeRelationships > 0) {
      throw new ConflictError(
        'HOUSEHOLD_HAS_RELATIONSHIPS',
        'No podés dar de baja un domicilio con relaciones laborales vigentes.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.household.update({
        where: { id: household.id },
        data: { archivedAt: new Date(), isActive: false, version: { increment: 1 } },
      });
      await tx.workerInvitation.updateMany({
        where: { householdId: household.id, status: 'PENDING' },
        data: { status: 'REVOKED', revokedAt: new Date(), revokedReason: 'HOUSEHOLD_ARCHIVED' },
      });
      await this.audit.record(tx, {
        action: AuditAction.HOUSEHOLD_ARCHIVED,
        entityType: 'Household',
        entityId: household.id,
        actor: {
          userId: actor.userId,
          role: PlatformRole.FAMILY_EMPLOYER,
          ipAddress: actor.ipAddress,
        },
        after: { label: household.label },
      });
    });
  }

  /**
   * Busca el domicilio **acotado al empleador del actor**.
   *
   * Si el domicilio existe pero es de otra familia, devuelve el mismo 404 que si
   * no existiera: un 403 confirmaría que el id es real y permitiría sondear qué
   * domicilios existen.
   */
  async findOwnedOrFail(
    actor: AuthenticatedActor,
    householdId: string,
  ): Promise<Awaited<ReturnType<PrismaService['household']['findFirstOrThrow']>>> {
    const employerId = await this.employers.requireEmployerId(actor);
    const household = await this.prisma.household.findFirst({
      where: { id: householdId, employerId, archivedAt: null },
    });
    if (household === null) {
      throw new NotFoundError('No encontramos ese domicilio.');
    }
    return household;
  }
}

function toView(household: {
  id: string;
  label: string;
  street: string;
  streetNumber: string;
  floor: string | null;
  apartment: string | null;
  city: string;
  province: string;
  postalCode: string;
  country: string;
  timezone: string;
  accessInstructions: string | null;
  isActive: boolean;
  version: number;
}): HouseholdView {
  return {
    id: household.id,
    label: household.label,
    street: household.street,
    streetNumber: household.streetNumber,
    floor: household.floor,
    apartment: household.apartment,
    city: household.city,
    province: household.province,
    postalCode: household.postalCode,
    country: household.country,
    timezone: household.timezone,
    accessInstructions: household.accessInstructions,
    isActive: household.isActive,
    version: household.version,
  };
}
