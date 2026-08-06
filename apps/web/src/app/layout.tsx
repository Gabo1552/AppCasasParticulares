import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Plataforma de casas particulares',
  description:
    'Administración de relaciones laborales de personal de casas particulares y niñeras.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  // es-AR: el idioma no es un detalle, define formato de fecha y número (NFR-08).
  return (
    <html lang="es-AR">
      <body>{children}</body>
    </html>
  );
}
