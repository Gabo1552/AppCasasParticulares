import { Inject, Injectable, Optional } from '@nestjs/common';
import { type PrismaTx } from '../../common/prisma/prisma.service';
import { OutboxNotificationService } from './outbox-notification.service';
import { TestNotificationSink } from './test-notification-sink';

/**
 * Correo saliente.
 *
 * **Nada de esto envía un correo.** Cada método encola un mensaje en el outbox
 * dentro de la transacción que recibe, y el `OutboxProcessorWorker` lo entrega
 * después. Por eso `tx` es obligatorio y no tiene alternativa: si el encolado
 * pudiera ocurrir fuera de la transacción del cambio de negocio, un corte entre
 * el commit y el encolado haría desaparecer la notificación sin dejar rastro, que
 * es exactamente lo que el patrón outbox existe para impedir
 * (docs/adr/0003-otp-outbox-security.md).
 *
 * Las plantillas son texto plano en español. No hay HTML todavía: el recorrido
 * necesita que el mensaje llegue y se entienda, no que sea bonito.
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly outbox: OutboxNotificationService,
    @Optional()
    @Inject(TestNotificationSink)
    private readonly testSink: TestNotificationSink | null,
  ) {}

  async sendAccessCode(tx: PrismaTx, to: string, code: string, ttlMinutes: number): Promise<void> {
    if (this.testSink) {
      this.testSink.recordAccessCode(to, code);
    }

    await this.outbox.enqueueEmail(tx, {
      to,
      subject: 'Tu código de ingreso',
      text: '',
      isOtp: true,
      rawOtp: code,
      ttlMinutes,
    });
  }

  async sendWorkerInvitation(
    tx: PrismaTx,
    input: {
      to: string;
      employerName: string;
      householdLabel: string;
      acceptUrl: string;
      expiresAt: Date;
    },
  ): Promise<void> {
    await this.send(tx, {
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

  async sendInvitationRevoked(
    tx: PrismaTx,
    input: {
      to: string;
      employerName: string;
      householdLabel: string;
    },
  ): Promise<void> {
    await this.send(tx, {
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

  async sendInvitationAccepted(
    tx: PrismaTx,
    input: {
      to: string;
      workerName: string;
      householdLabel: string;
      dashboardUrl: string;
    },
  ): Promise<void> {
    await this.send(tx, {
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

  async sendConditionsReadyForReview(
    tx: PrismaTx,
    input: {
      to: string;
      employerName: string;
      householdLabel: string;
      reviewUrl: string;
    },
  ): Promise<void> {
    await this.send(tx, {
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

  async sendConditionsAccepted(
    tx: PrismaTx,
    input: {
      to: string;
      workerName: string;
      householdLabel: string;
    },
  ): Promise<void> {
    await this.send(tx, {
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

  private async send(
    tx: PrismaTx,
    message: { to: string; subject: string; text: string },
  ): Promise<void> {
    await this.outbox.enqueueEmail(tx, message);
  }
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'long',
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(date);
}
