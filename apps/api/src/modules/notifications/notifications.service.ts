import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import { PrismaService, type PrismaTx } from '../../common/prisma/prisma.service';
import { OutboxNotificationService } from './outbox-notification.service';
import { TestNotificationSink } from './test-notification-sink';

/**
 * Correo saliente.
 *
 * En desarrollo apunta a Mailpit, que captura todo y no deja salir nada a
 * Internet. En producción se configura un SMTP real por variables de entorno.
 *
 * Las plantillas son texto plano en español. No hay HTML todavía: el recorrido
 * necesita que el mensaje llegue y se entienda, no que sea bonito.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly transporter: Transporter;

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxNotificationService,
    @Optional()
    @Inject(TestNotificationSink)
    private readonly testSink: TestNotificationSink | null,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {
    this.transporter = createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_SECURE,
      ...(config.SMTP_USER === undefined
        ? {}
        : { auth: { user: config.SMTP_USER, pass: config.SMTP_PASSWORD } }),
    });
  }

  async sendAccessCode(to: string, code: string, ttlMinutes: number, tx?: PrismaTx): Promise<void> {
    if (this.testSink) {
      this.testSink.recordAccessCode(to, code);
    }

    await this.outbox.enqueueEmail(tx ?? this.prisma, {
      to,
      subject: 'Tu código de ingreso',
      text: '',
      isOtp: true,
      rawOtp: code,
      ttlMinutes,
    });
  }

  async sendWorkerInvitation(input: {
    to: string;
    employerName: string;
    householdLabel: string;
    acceptUrl: string;
    expiresAt: Date;
  }): Promise<void> {
    await this.send({
      to: input.to,
      subject: `${input.employerName} te invitó a registrar tu trabajo`,
      text: [
        'Hola,',
        '',
        `${input.employerName} te invitó a registrar la relación laboral en ${input.householdLabel}.`,
        '',
        'Para ver la invitación, entrá acá:',
        input.acceptUrl,
        '',
        `El enlace vence el ${formatDate(input.expiresAt)} y se puede usar una sola vez.`,
        '',
        'Aceptar la invitación no te compromete a nada todavía: después vas a poder',
        'revisar las condiciones de trabajo antes de aceptarlas.',
      ].join('\n'),
    });
  }

  async sendInvitationRevoked(input: {
    to: string;
    employerName: string;
    householdLabel: string;
  }): Promise<void> {
    await this.send({
      to: input.to,
      subject: 'La invitación fue dada de baja',
      text: [
        'Hola,',
        '',
        `${input.employerName} dio de baja la invitación para ${input.householdLabel}.`,
        'El enlace que recibiste ya no funciona.',
      ].join('\n'),
    });
  }

  async sendInvitationAccepted(input: {
    to: string;
    workerName: string;
    householdLabel: string;
    dashboardUrl: string;
  }): Promise<void> {
    await this.send({
      to: input.to,
      subject: `${input.workerName} aceptó la invitación`,
      text: [
        'Hola,',
        '',
        `${input.workerName} aceptó la invitación para ${input.householdLabel}.`,
        '',
        'El siguiente paso es cargar las condiciones de trabajo y el horario semanal:',
        input.dashboardUrl,
      ].join('\n'),
    });
  }

  async sendConditionsReadyForReview(input: {
    to: string;
    employerName: string;
    householdLabel: string;
    reviewUrl: string;
  }): Promise<void> {
    await this.send({
      to: input.to,
      subject: 'Tenés condiciones de trabajo para revisar',
      text: [
        'Hola,',
        '',
        `${input.employerName} cargó las condiciones de trabajo para ${input.householdLabel}.`,
        '',
        'Revisalas y, si estás de acuerdo, aceptalas acá:',
        input.reviewUrl,
        '',
        'La relación laboral queda activa recién cuando vos las aceptás.',
      ].join('\n'),
    });
  }

  async sendConditionsAccepted(input: {
    to: string;
    workerName: string;
    householdLabel: string;
  }): Promise<void> {
    await this.send({
      to: input.to,
      subject: `${input.workerName} aceptó las condiciones`,
      text: [
        'Hola,',
        '',
        `${input.workerName} aceptó las condiciones de trabajo para ${input.householdLabel}.`,
        'La relación laboral quedó activa.',
      ].join('\n'),
    });
  }

  private async send(message: { to: string; subject: string; text: string }): Promise<void> {
    await this.outbox.enqueueEmail(this.prisma, message);
  }
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'long',
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(date);
}
