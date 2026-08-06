'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch, errorMessage } from '@/lib/api';
import { PantallaProtegida } from '@/components/pantalla-protegida';
import { Cargando, Error } from '@/components/ui';
import {
  FormularioDomicilio,
  aCuerpo,
  datosIniciales,
  type DatosDomicilio,
} from '@/components/formulario-domicilio';
import type { Household } from '@/lib/types';

export default function EditarDomicilio(): ReactNode {
  return (
    <PantallaProtegida rol="FAMILY_EMPLOYER">
      <Contenido />
    </PantallaProtegida>
  );
}

function Contenido(): ReactNode {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [datos, setDatos] = useState<DatosDomicilio | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    async function cargar(): Promise<void> {
      try {
        setDatos(datosIniciales(await apiFetch<Household>(`/households/${id}`)));
      } catch (causa) {
        setError(errorMessage(causa));
      }
    }
    void cargar();
  }, [id]);

  async function guardar(): Promise<void> {
    if (datos === null) return;
    setError(null);
    setEnviando(true);
    try {
      await apiFetch(`/households/${id}`, { method: 'PATCH', body: aCuerpo(datos) });
      router.push('/familia/domicilios');
    } catch (causa) {
      setError(errorMessage(causa));
    } finally {
      setEnviando(false);
    }
  }

  if (error !== null && datos === null) {
    return (
      <div className="tarjeta">
        <Error mensaje={error} />
        <Link className="boton boton--secundario" href="/familia/domicilios">
          Volver a mis domicilios
        </Link>
      </div>
    );
  }

  if (datos === null) return <Cargando que="el domicilio" />;

  return (
    <FormularioDomicilio
      titulo="Editar domicilio"
      datos={datos}
      onCambio={setDatos}
      onEnviar={guardar}
      error={error}
      enviando={enviando}
      textoBoton="Guardar cambios"
    >
      <Link className="boton boton--secundario" href="/familia/domicilios">
        Cancelar
      </Link>
    </FormularioDomicilio>
  );
}
