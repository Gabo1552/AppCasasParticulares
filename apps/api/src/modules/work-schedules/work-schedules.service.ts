import { Injectable } from '@nestjs/common';
import { EmploymentRelationshipStatus, PlatformRole } from '@casas/database';
import { toMinutes, type PutWorkScheduleInput } from '@casas/contracts';
import { AuditAction, AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ForbiddenError, UnprocessableError } from '../../common/http/app.errors';
import type { AuthenticatedActor } from '../../common/auth/auth.types';
import {
  RelationshipsService,
  type ScheduleView,
} from '../employment-relationships/relationships.service';

/**
 * Horario semanal previsto de una relación laboral (REL-04).
 *
 * El `PUT` reemplaza el calendario completo: es más simple de razonar que un
 * parche por día y evita estados intermedios donde el total semanal no cierra.
 * La versión anterior se marca `SUPERSEDED` en lugar de borrarse.
 */
@Injectable()
export class WorkSchedulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly relationships: RelationshipsService,
  ) {}

  async get(actor: AuthenticatedActor, relationshipId: string): Promise<ScheduleView | null> {
    // Familia y trabajadora pueden consultarlo; el filtro de participación lo
    // resuelve el servicio de relaciones.
    const relationship = await this.relationships.getParticipating(actor, relationshipId);
    return relationship.schedule;
  }

  async put(
    actor: AuthenticatedActor,
    relationshipId: string,
    input: PutWorkScheduleInput,
  ): Promise<ScheduleView> {
    const relationship = await this.relationships.findParticipatingOrFail(actor, relationshipId);

    if (actor.employerId === null || relationship.employerId !== actor.employerId) {
      throw new ForbiddenError('Sólo la familia empleadora puede configurar el horario.');
    }

    if (
      relationship.status !== EmploymentRelationshipStatus.PENDING_CONFIGURATION &&
      relationship.status !== EmploymentRelationshipStatus.PENDING_WORKER_ACCEPTANCE
    ) {
      throw new UnprocessableError(
        'SCHEDULE_NOT_EDITABLE',
        'El horario sólo se puede editar antes de que la relación quede activa.',
      );
    }

    // Los solapamientos dentro de un día los cubre el esquema Zod (un bloque por
    // día). Acá se verifica lo que el esquema no puede: que el total semanal sea
    // coherente con lo que se está guardando.
    const weeklyMinutes = input.days.reduce(
      (total, day) =>
        total + (toMinutes(day.endTime) - toMinutes(day.startTime) - day.breakMinutes),
      0,
    );
    if (weeklyMinutes <= 0) {
      throw new UnprocessableError(
        'SCHEDULE_EMPTY',
        'El horario no suma tiempo de trabajo. Revisá las horas y las pausas.',
      );
    }

    const isUpdate = relationship.schedules.some((s) => s.status === 'PUBLISHED');

    await this.prisma.$transaction(async (tx) => {
      await tx.workSchedule.updateMany({
        where: { employmentRelationshipId: relationshipId, status: 'PUBLISHED' },
        data: { status: 'SUPERSEDED', effectiveTo: new Date(input.effectiveFrom) },
      });

      await tx.workSchedule.create({
        data: {
          employmentRelationshipId: relationshipId,
          status: 'PUBLISHED',
          effectiveFrom: new Date(input.effectiveFrom),
          // El fichaje llega en la Etapa 6: estos campos quedan en su valor por
          // defecto y no se exponen todavía en la interfaz.
          allowedMethods: ['BUTTON'],
          defaultMethod: 'BUTTON',
          createdByUserId: actor.userId,
          rules: {
            create: input.days.map((day) => ({
              dayOfWeek: day.dayOfWeek,
              startMinute: toMinutes(day.startTime),
              endMinute: toMinutes(day.endTime),
              breakMinutes: day.breakMinutes,
            })),
          },
        },
      });

      // Cambiar el horario ya enviado lo devuelve a configuración, igual que
      // cambiar las condiciones: la trabajadora acepta lo que efectivamente ve.
      if (relationship.status === EmploymentRelationshipStatus.PENDING_WORKER_ACCEPTANCE) {
        await tx.employmentRelationship.update({
          where: { id: relationshipId },
          data: { status: EmploymentRelationshipStatus.PENDING_CONFIGURATION },
        });
      }

      await this.audit.record(tx, {
        action: isUpdate ? AuditAction.WORK_SCHEDULE_UPDATED : AuditAction.WORK_SCHEDULE_CREATED,
        entityType: 'WorkSchedule',
        entityId: relationshipId,
        actor: {
          userId: actor.userId,
          role: PlatformRole.FAMILY_EMPLOYER,
          ipAddress: actor.ipAddress,
        },
        after: {
          days: input.days.map((d) => ({
            dayOfWeek: d.dayOfWeek,
            start: d.startTime,
            end: d.endTime,
          })),
          weeklyMinutes,
        },
      });
    });

    const refreshed = await this.relationships.getParticipating(actor, relationshipId);
    if (refreshed.schedule === null) {
      throw new UnprocessableError('SCHEDULE_NOT_SAVED', 'No se pudo guardar el horario.');
    }
    return refreshed.schedule;
  }
}
