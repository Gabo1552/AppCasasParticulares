import { timingSafeEqual } from 'node:crypto';
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  Optional,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { TimeEntryKind, TimeEntryStatus, WorkDayStatus } from '@casas/database';
import { Public } from '../../common/auth/auth.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotFoundError } from '../../common/http/app.errors';
import { TokenService } from '../../common/crypto/token.service';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import { TestNotificationSink } from '../notifications/test-notification-sink';

/**
 * Apoyo para las pruebas automatizadas (exclusivo para NODE_ENV=test).
 *
 * Entrega directamente el código OTP (obtenido en memoria desde TestNotificationSink,
 * sin almacenar en claro en la BD) y el token de invitación.
 */
@ApiExcludeController()
@Controller('test-support')
export class TestSupportController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    @Optional()
    @Inject(TestNotificationSink)
    private readonly testSink: TestNotificationSink | null,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /**
   * Defensa en profundidad.
   *
   * El controlador ya no se registra fuera de `NODE_ENV=test` (ver
   * `OnboardingModule.register`), así que en producción estas rutas no existen.
   * La verificación se conserva igual: si alguien vuelve a registrarlo sin
   * condición, el handler sigue negándose.
   */
  private assertEnabled(secretHeader?: string): void {
    if (this.config.NODE_ENV !== 'test' || !this.config.FEATURE_TEST_SUPPORT_ENDPOINTS) {
      throw new ForbiddenException({
        code: 'TEST_SUPPORT_DISABLED',
        message: 'Endpoints de prueba sólo disponibles en NODE_ENV=test.',
      });
    }

    // Sin valor por defecto: `loadAppConfig` exige el secreto cuando el flag está
    // encendido, así que llegar acá sin él significa que algo se saltó el
    // arranque. Un default incrustado sería un secreto que cualquiera puede leer
    // en el repositorio.
    const expectedSecret = this.config.TEST_SUPPORT_SECRET;
    if (expectedSecret === undefined) {
      throw new ForbiddenException({
        code: 'TEST_SUPPORT_DISABLED',
        message: 'TEST_SUPPORT_SECRET no está configurado.',
      });
    }

    if (!secretHeader || !timingSafeCompare(secretHeader, expectedSecret)) {
      throw new UnauthorizedException({
        code: 'TEST_SUPPORT_UNAUTHORIZED',
        message: 'La cabecera x-test-support-secret es inválida.',
      });
    }
  }

  /** Último código de acceso vigente para un correo (obtenido del sink de notificaciones de prueba). */
  @Public()
  @Get('last-access-code')
  async lastAccessCode(
    @Query('email') email: string,
    @Headers('x-test-support-secret') secretHeader?: string,
  ): Promise<{ code: string }> {
    this.assertEnabled(secretHeader);

    const destination = (email ?? '').toLowerCase();
    const record = await this.prisma.oneTimeCode.findFirst({
      where: { destination, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (record === null) throw new NotFoundError('No hay un código vigente para ese correo.');

    const code = this.testSink?.getLastAccessCode(destination);
    if (!code) {
      throw new NotFoundError('No se pudo recuperar el código desde el sink de prueba.');
    }

    return { code };
  }

  /** Token en claro de una invitación pendiente. */
  @Public()
  @Get('invitation-token')
  async invitationToken(
    @Query('email') email: string,
    @Headers('x-test-support-secret') secretHeader?: string,
  ): Promise<{ token: string }> {
    this.assertEnabled(secretHeader);

    const invitation = await this.prisma.workerInvitation.findFirst({
      where: { workerEmail: (email ?? '').toLowerCase(), status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });
    if (invitation === null) {
      throw new NotFoundError('No hay una invitación pendiente para ese correo.');
    }

    const token = this.tokens.generateOpaqueToken();
    await this.prisma.workerInvitation.update({
      where: { id: invitation.id },
      data: { tokenHash: this.tokens.hashOpaqueToken(token) },
    });

    return { token };
  }

  /** Crear una jornada aprobada para pruebas históricas (solo en entorno de test). */
  @Public()
  @Post('seed-approved-workday')
  async seedApprovedWorkday(
    @Body() body: { relationshipId: string; date: string; minutes?: number },
    @Headers('x-test-support-secret') secretHeader?: string,
  ): Promise<{ workDayId: string }> {
    this.assertEnabled(secretHeader);

    const minutes = body.minutes ?? 480;
    const dateObj = new Date(`${body.date}T00:00:00.000Z`);
    const clockInAt = new Date(`${body.date}T09:00:00.000Z`);
    const clockOutAt = new Date(clockInAt.getTime() + minutes * 60000);

    const relationship = await this.prisma.employmentRelationship.findUnique({
      where: { id: body.relationshipId },
      include: { employer: true, worker: true },
    });
    if (relationship === null) {
      throw new NotFoundError('Relación no encontrada.');
    }

    const workDay = await this.prisma.workDay.upsert({
      where: {
        employmentRelationshipId_date: {
          employmentRelationshipId: body.relationshipId,
          date: dateObj,
        },
      },
      update: {
        status: WorkDayStatus.APPROVED,
        approvedMinutes: minutes,
        realMinutes: minutes,
        computableMinutes: minutes,
        approvedAt: new Date(),
        approvedByUserId: relationship.employer.userId,
      },
      create: {
        employmentRelationshipId: body.relationshipId,
        date: dateObj,
        status: WorkDayStatus.APPROVED,
        approvedMinutes: minutes,
        realMinutes: minutes,
        computableMinutes: minutes,
        approvedAt: new Date(),
        approvedByUserId: relationship.employer.userId,
        createdByUserId: relationship.worker?.userId ?? relationship.employer.userId,
      },
    });

    await this.prisma.timeEntry.createMany({
      data: [
        {
          employmentRelationshipId: body.relationshipId,
          workDayId: workDay.id,
          clientIdempotencyKey: this.tokens.generateOpaqueToken(),
          kind: TimeEntryKind.CLOCK_IN,
          status: TimeEntryStatus.APPROVED,
          declaredAt: clockInAt,
          receivedAt: clockInAt,
          timezone: 'America/Argentina/Buenos_Aires',
          method: 'BUTTON',
          createdByUserId: relationship.worker?.userId ?? relationship.employer.userId,
        },
        {
          employmentRelationshipId: body.relationshipId,
          workDayId: workDay.id,
          clientIdempotencyKey: this.tokens.generateOpaqueToken(),
          kind: TimeEntryKind.CLOCK_OUT,
          status: TimeEntryStatus.APPROVED,
          declaredAt: clockOutAt,
          receivedAt: clockOutAt,
          timezone: 'America/Argentina/Buenos_Aires',
          method: 'BUTTON',
          createdByUserId: relationship.worker?.userId ?? relationship.employer.userId,
        },
      ],
    });

    return { workDayId: workDay.id };
  }
}

function timingSafeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
