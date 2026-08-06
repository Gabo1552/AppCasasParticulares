import type { PayrollTraceStep } from './types';

/**
 * Acumulador de la traza del cálculo.
 *
 * LIQ-14 y el encargo piden "trazabilidad completa": para cada concepto, qué entró,
 * qué regla se aplicó y qué salió. Sin esto, la familia aprueba un número que no
 * entiende y el contador revisa una caja negra.
 */
export class TraceBuilder {
  private readonly steps: PayrollTraceStep[] = [];

  add(stage: string, description: string, inputs: Record<string, string>, output: string): void {
    this.steps.push({
      step: this.steps.length + 1,
      stage,
      description,
      inputs: { ...inputs },
      output,
    });
  }

  build(): readonly PayrollTraceStep[] {
    return this.steps;
  }
}
