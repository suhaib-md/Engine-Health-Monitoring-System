/**
 * Equation registry for "Show the math" (Phase 8) and the Validation page.
 * Every physics function the app displays is registered with its LaTeX, named inputs
 * (symbol + unit) and a compute function, so the UI can substitute live numbers.
 */

export interface SymbolInfo {
  /** LaTeX symbol, e.g. "T_o" */
  symbol: string;
  unit: string;
  label: string;
}

export type Subsystem =
  | 'engine'
  | 'friction'
  | 'energy'
  | 'cooling'
  | 'lubrication'
  | 'electrical'
  | 'vibration'
  | 'combustion';

export interface Equation<I extends Record<string, number>> {
  id: string;
  title: string;
  subsystem: Subsystem;
  latex: string;
  inputs: { [K in keyof I]: SymbolInfo };
  output: SymbolInfo;
  compute: (inputs: I) => number;
}

/** Type-erased form stored in the registry list. */
export interface RegisteredEquation extends Omit<Equation<Record<string, number>>, 'compute'> {
  compute: (inputs: Record<string, number>) => number;
}

export function defineEquation<I extends Record<string, number>>(
  eq: Equation<I>,
): RegisteredEquation {
  return { ...eq, compute: (inputs) => eq.compute(inputs as I) } as RegisteredEquation;
}
