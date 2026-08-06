'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { apiFetch, errorMessage } from '@/lib/api';
import { Cargando, Error } from '@/components/ui';
import { formatearFecha } from '@/lib/format';

interface DocumentoLegal {
  kind: string;
  version: string;
  locale: string;
  body: string;
  publishedAt: string;
}

/**
 * Texto legal publicado.
 *
 * Se pide a la API en lugar de escribirlo en la página: el consentimiento que se
 * guarda apunta a esa misma fila, así que lo que la persona lee y lo que queda
 * registrado como aceptado son literalmente el mismo texto. Copiarlo acá haría
 * que las dos versiones se separaran en la primera corrección.
 */
export function TextoLegal({ tipo, titulo }: { tipo: string; titulo: string }): ReactNode {
  const [documento, setDocumento] = useState<DocumentoLegal | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function cargar(): Promise<void> {
      try {
        setDocumento(await apiFetch<DocumentoLegal>(`/legal/${tipo}`));
      } catch (causa) {
        setError(errorMessage(causa));
      }
    }
    void cargar();
  }, [tipo]);

  if (error !== null) {
    return (
      <div className="tarjeta">
        <h1>{titulo}</h1>
        <Error mensaje={error} />
        <Link className="boton boton--secundario" href="/">
          Ir al inicio
        </Link>
      </div>
    );
  }

  if (documento === null) return <Cargando que="el texto" />;

  return (
    <article className="tarjeta">
      <h1>{titulo}</h1>
      <p className="suave">
        Versión {documento.version} · Publicada el {formatearFecha(documento.publishedAt)}
      </p>
      {/* Texto plano con saltos de línea: se respeta el formato tal como se guardó. */}
      <div style={{ whiteSpace: 'pre-wrap' }}>{documento.body}</div>
    </article>
  );
}
