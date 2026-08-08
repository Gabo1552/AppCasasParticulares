import { Injectable } from '@nestjs/common';

export interface EmittedNotification {
  to: string;
  type: 'ACCESS_CODE' | 'INVITATION' | 'OTHER';
  code?: string;
  token?: string;
  subject?: string;
  emittedAt: Date;
}

/**
 * Fregadero de notificaciones para entornos de prueba.
 *
 * Permite a las pruebas E2E e integración obtener el código OTP o token emitido
 * sin realizar fuerza bruta sobre la base de datos ni consultar un buzón real.
 *
 * Exclusivo para ejecuciones en NODE_ENV=test.
 */
@Injectable()
export class TestNotificationSink {
  private static readonly notifications: EmittedNotification[] = [];

  recordAccessCode(to: string, code: string): void {
    TestNotificationSink.notifications.push({
      to: to.toLowerCase(),
      type: 'ACCESS_CODE',
      code,
      emittedAt: new Date(),
    });
  }

  recordInvitation(to: string, token: string): void {
    TestNotificationSink.notifications.push({
      to: to.toLowerCase(),
      type: 'INVITATION',
      token,
      emittedAt: new Date(),
    });
  }

  getLastAccessCode(to: string): string | null {
    const dest = to.toLowerCase();
    const matches = TestNotificationSink.notifications.filter(
      (n) => n.to === dest && n.type === 'ACCESS_CODE',
    );
    const last = matches[matches.length - 1];
    return last?.code ?? null;
  }

  clear(): void {
    TestNotificationSink.notifications.length = 0;
  }
}
