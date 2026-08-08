import { Controller, Get, Inject, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/auth/auth.types';
import { AppError, NotFoundError } from '../../common/http/app.errors';
import { PrismaService } from '../../common/prisma/prisma.service';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';

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

    // Buscar si existe un documento explícitamente APROBADO
    const documentoAprobado = await this.prisma.consentDocument.findFirst({
      where: { kind, version: { contains: 'approved' } },
      orderBy: { publishedAt: 'desc' },
    });

    const documento =
      documentoAprobado ??
      (await this.prisma.consentDocument.findFirst({
        where: { kind },
        orderBy: { publishedAt: 'desc' },
      }));

    if (documento === null) throw new NotFoundError('No encontramos ese documento.');

    const isApproved = documentoAprobado !== null;
    const isProduction = this.config.NODE_ENV === 'production';

    if (!isApproved && isProduction) {
      throw new AppError(
        'LEGAL_DOCUMENT_NOT_APPROVED',
        'No hay una versión aprobada del documento legal para producción.',
        412,
      );
    }

    const warningBanner = !isApproved
      ? 'AVISO DE DESARROLLO: Este texto es un borrador no vinculante para pruebas y desarrollo.'
      : null;

    const body = warningBanner ? `[${warningBanner}]\n\n${documento.body}` : documento.body;

    return {
      kind: documento.kind,
      version: documento.version,
      locale: documento.locale,
      body,
      publishedAt: documento.publishedAt.toISOString(),
      status: isApproved ? 'APPROVED' : 'DRAFT',
      warningBanner,
    };
  }
}
