import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/auth/auth.types';
import { NotFoundError } from '../../common/http/app.errors';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface LegalDocumentView {
  kind: string;
  version: string;
  locale: string;
  body: string;
  publishedAt: string;
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
 *
 * Devuelve el mismo registro al que después apunta el consentimiento, así que lo
 * que se leyó y lo que quedó aceptado son la misma fila. Si el texto se
 * reemplazara por otro sin versionar, esa correspondencia se rompería — por eso
 * publicar una versión nueva agrega una fila en lugar de editar la existente.
 */
@ApiTags('legal')
@Controller('legal')
export class LegalController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get(':tipo')
  @ApiOperation({ summary: 'Devuelve la versión vigente de un texto legal' })
  async get(@Param('tipo') tipo: string): Promise<LegalDocumentView> {
    const kind = TIPOS[tipo];
    if (kind === undefined) throw new NotFoundError('No encontramos ese documento.');

    const documento = await this.prisma.consentDocument.findFirst({
      where: { kind },
      orderBy: { publishedAt: 'desc' },
    });
    if (documento === null) throw new NotFoundError('No encontramos ese documento.');

    return {
      kind: documento.kind,
      version: documento.version,
      locale: documento.locale,
      body: documento.body,
      publishedAt: documento.publishedAt.toISOString(),
    };
  }
}
