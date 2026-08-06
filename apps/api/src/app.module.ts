import { Module, type Provider } from '@nestjs/common';
import { ARCA_CONNECTOR, PAYMENT_PROVIDER } from '@casas/domain';
import { OfficialARCAConnector } from './adapters/arca/official-arca.connector';
import { APP_CONFIG, loadAppConfig, type AppConfig } from './config/app-config';
import { HealthController } from './health/health.controller';

// Contexto: identidad y acceso
import { IdentityModule } from './modules/identity/identity.module';
import { UsersModule } from './modules/users/users.module';
import { AuditModule } from './modules/audit/audit.module';

// Contexto: partes
import { EmployersModule } from './modules/employers/employers.module';
import { WorkersModule } from './modules/workers/workers.module';
import { AccountantsModule } from './modules/accountants/accountants.module';
import { ProfessionalAssignmentsModule } from './modules/professional-assignments/professional-assignments.module';

// Contexto: relación laboral
import { HouseholdsModule } from './modules/households/households.module';
import { EmploymentRelationshipsModule } from './modules/employment-relationships/employment-relationships.module';
import { WorkSchedulesModule } from './modules/work-schedules/work-schedules.module';

// Contexto: tiempo y novedades
import { TimeTrackingModule } from './modules/time-tracking/time-tracking.module';
import { AttendanceCorrectionsModule } from './modules/attendance-corrections/attendance-corrections.module';
import { EmploymentEventsModule } from './modules/employment-events/employment-events.module';

// Contexto: liquidación
import { PayrollParametersModule } from './modules/payroll-parameters/payroll-parameters.module';
import { PayrollPeriodsModule } from './modules/payroll-periods/payroll-periods.module';
import { PayrollCalculationsModule } from './modules/payroll-calculations/payroll-calculations.module';
import { PayrollVersionsModule } from './modules/payroll-versions/payroll-versions.module';

// Contexto: cumplimiento
import { ArcaTasksModule } from './modules/arca-tasks/arca-tasks.module';
import { ArcaDocumentsModule } from './modules/arca-documents/arca-documents.module';

// Contexto: liquidación financiera
import { PaymentsModule } from './modules/payments/payments.module';
import { ReconciliationModule } from './modules/reconciliation/reconciliation.module';

// Contexto: soporte
import { DocumentsModule } from './modules/documents/documents.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { AdministrationModule } from './modules/administration/administration.module';
import { SupportModule } from './modules/support/support.module';

/**
 * Monolito modular.
 *
 * 26 módulos con límites claros, un despliegue y una base de datos
 * (ADR 0001, decisión D1; sección 14 del documento de requerimientos).
 *
 * Marketplace, matching, chat y contratación **no tienen módulo**: quedan detrás
 * del flag `FEATURE_MARKETPLACE`, sin código simulado (decisión D14).
 */

const configProvider: Provider = {
  provide: APP_CONFIG,
  useFactory: (): AppConfig => loadAppConfig(),
};

/**
 * Resolución del conector de ARCA por feature flag.
 *
 * Con el flag apagado (el valor por defecto en todos los entornos, incluido
 * producción) se resuelve el conector asistido. Con el flag encendido se resuelve
 * el oficial, que hoy lanza `ARCAIntegrationNotEnabledError` en sus cinco
 * operaciones: nunca devuelve datos simulados.
 *
 * El conector asistido necesita repositorios que se implementan en la Etapa 3; por
 * eso, hasta entonces, el proveedor deja explícito qué falta en lugar de fingir que
 * funciona (docs/arca-integration-strategy.md §5).
 */
const arcaConnectorProvider: Provider = {
  provide: ARCA_CONNECTOR,
  inject: [APP_CONFIG],
  useFactory: (config: AppConfig) => {
    if (config.FEATURE_ARCA_OFFICIAL_CONNECTOR) {
      return new OfficialARCAConnector();
    }
    throw new Error(
      'ManualAssistedARCAConnector requiere los repositorios de arca-tasks y documents, ' +
        'que se implementan en la Etapa 3 (docs/implementation-roadmap.md §4). ' +
        'El adaptador y sus pruebas ya existen en src/adapters/arca/.',
    );
  },
};

const paymentProviderProvider: Provider = {
  provide: PAYMENT_PROVIDER,
  inject: [APP_CONFIG],
  useFactory: (config: AppConfig) => {
    if (config.FEATURE_REAL_PAYMENTS) {
      throw new Error(
        'No hay proveedor de pagos real configurado. La selección de banco o PSP ' +
          'habilitado por el BCRA es la decisión abierta OD-05.',
      );
    }
    throw new Error(
      'ManualTransferProvider requiere el repositorio de payments, que se implementa ' +
        'en la Etapa 3. El adaptador y sus pruebas ya existen en src/adapters/payments/.',
    );
  },
};

@Module({
  imports: [
    IdentityModule,
    UsersModule,
    AuditModule,

    EmployersModule,
    WorkersModule,
    AccountantsModule,
    ProfessionalAssignmentsModule,

    HouseholdsModule,
    EmploymentRelationshipsModule,
    WorkSchedulesModule,

    TimeTrackingModule,
    AttendanceCorrectionsModule,
    EmploymentEventsModule,

    PayrollParametersModule,
    PayrollPeriodsModule,
    PayrollCalculationsModule,
    PayrollVersionsModule,

    ArcaTasksModule,
    ArcaDocumentsModule,

    PaymentsModule,
    ReconciliationModule,

    DocumentsModule,
    NotificationsModule,
    SubscriptionsModule,
    AdministrationModule,
    SupportModule,
  ],
  controllers: [HealthController],
  providers: [configProvider, arcaConnectorProvider, paymentProviderProvider],
})
export class AppModule {}
