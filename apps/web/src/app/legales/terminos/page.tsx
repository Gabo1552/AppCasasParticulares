'use client';

import type { ReactNode } from 'react';
import { TextoLegal } from '@/components/texto-legal';

export default function Terminos(): ReactNode {
  return <TextoLegal tipo="terminos" titulo="Términos y condiciones" />;
}
