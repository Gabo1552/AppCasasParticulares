'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, errorMessage } from '@/lib/api';
import { PantallaProtegida } from '@/components/pantalla-protegida';
import {
  FormularioDomicilio,
  aCuerpo,
  datosIniciales,
  type DatosDomicilio,
} from '@/components/formulario-domicilio';
import type { Household } from '@/lib/types';

export default function NuevoDomicilio(): ReactNode {
  return (
    <PantallaProtegida rol="FAMILY_EMPLOYER">
      <Contenido />
    </PantallaProtegida>
  );
}

function Contenido(): ReactNode {
  const router = useRouter();
  const [datos, setDatos] = useState<DatosDomicilio>(datosIniciales());
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function guardar(): Promise<void> {
    setError(null);
    setEnviando(true);
    try {
      await apiFetch<Household>('/households', { method: 'POST', body: aCuerpo(datos) });
      router.push('/familia/invitaciones/nueva');
    } catch (causa) {
      setError(errorMessage(causa));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <FormularioDomicilio
      titulo="¿Dónde se trabaja?"
      paso={{ actual: 2, total: 4 }}
      datos={datos}
      onCambio={setDatos}
      onEnviar={guardar}
      error={error}
      enviando={enviando}
      textoBoton="Guardar domicilio"
    >
      <Link className="boton boton--secundario" href="/familia">
        Cancelar
      </Link>
    </FormularioDomicilio>
  );
}
