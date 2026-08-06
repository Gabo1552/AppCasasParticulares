'use client';

import type { ReactNode } from 'react';
import { TextoLegal } from '@/components/texto-legal';

export default function Privacidad(): ReactNode {
  return <TextoLegal tipo="privacidad" titulo="Política de privacidad" />;
}
