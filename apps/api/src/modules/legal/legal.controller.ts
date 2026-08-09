import { Controller, Get, Inject, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/auth/auth.types';
import { AppError, NotFoundError } from '../../common/http/app.errors';
import { PrismaService } from '../../common/prisma/prisma.service';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import { effectiveDocumentWhere } from './effective-document';

export interface LegalDocumentView {
  kind: string;
  version: string;
  locale: string;
  body: string;
  publishedAt: string;
  status: 'DRAFT' | 'UNDER_REVIEW' | 'APPROVED' | 'RETIRED';
  warningBanner?: string | null;
}

const TIPOS: Record<string, 'TERMS_OF_SERVICE' | 'PRIVACY_POLICY'> = {
  terminos: 'TERMS_OF_SERVICE',
  privacidad: 'PRIVACY_POLICY',
};

/**
 * Textos legales publicados.
 *
 * Es público a propósito: la persona tiene que poder leer lo que va a aceptar
 * *antes* de tener una cuenta.
 */
@ApiTags('legal')
@Controller('legal')
export class LegalController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @Get(':tipo')
  @ApiOperation({ summary: 'Devuelve la versión vigente de un texto legal' })
  async get(@Param('tipo') tipo: string): Promise<LegalDocumentView> {
    const kind = TIPOS[tipo];
    if (kind === undefined) throw new NotFoundError('No encontramos ese documento.');

    // Vigente = APPROVED con effectiveFrom ya cumplido. Un aprobado con vigencia
    // futura y un RETIRED no califican, aunque sean los más recientes.
    const vigente = await this.prisma.consentDocument.findFirst({
      where: effectiveDocumentWhere(kind),
      orderBy: [{ effectiveFrom: 'desc' }, { publishedAt: 'desc' }],
    });

    if (vigente !== null) {
      return {
        kind: vigente.kind,
        version: vigente.version,
        locale: vigente.locale,
        body: vigente.body,
        publishedAt: vigente.publishedAt.toISOString(),
        status: vigente.status,
        warningBanner: null,
      };
    }

    // Sin versión vigente, producción no sirve un borrador: preferimos 412 antes
    // que dejar a alguien aceptando un texto no vinculante.
    if (this.config.NODE_ENV === 'production') {
      throw new AppError(
        'LEGAL_DOCUMENT_NOT_APPROVED',
        'No hay una versión aprobada y vigente del documento legal.',
        412,
      );
    }

    const borrador = await this.prisma.consentDocument.findFirst({
      where: { kind, status: { not: 'RETIRED' } },
      orderBy: { publishedAt: 'desc' },
    });

    if (borrador === null) throw new NotFoundError('No encontramos ese documento.');

    const warningBanner =
      'AVISO DE DESARROLLO: Este texto es un borrador no vinculante para pruebas y desarrollo.';

    return {
      kind: borrador.kind,
      version: borrador.version,
      locale: borrador.locale,
      body: `[${warningBanner}]\n\n${borrador.body}`,
      publishedAt: borrador.publishedAt.toISOString(),
      status: borrador.status,
      warningBanner,
    };
  }
}
