/**
 * Equation registry for the calculation view (Phase 8) and the Validation page.
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

/**
 * What a substitution template gets. The caller (the UI) decides how a live input looks, so
 * physics stays free of presentation: `v` renders one of the equation's inputs (coloured by
 * where the number came from), `n` renders a plain number (a profile constant or an
 * intermediate result), and `i` holds the raw input values for intermediates.
 */
export interface Sub<I> {
  v: (k: keyof I & string) => string;
  n: (x: number, digits?: number) => string;
  i: I;
}

export interface Equation<I extends Record<string, number>> {
  id: string;
  title: string;
  subsystem: Subsystem;
  latex: string;
  inputs: { [K in keyof I]: SymbolInfo };
  output: SymbolInfo;
  compute: (inputs: I) => number;
  /**
   * The right-hand side with numbers in place of symbols (LaTeX), for the calculation view. It must
   * evaluate to `compute(inputs)`; the UI appends "= result". Without it the UI lists the inputs.
   */
  substitute?: (s: Sub<I>) => string;
}

/** Type-erased form stored in the registry list. */
export interface RegisteredEquation extends Omit<
  Equation<Record<string, number>>,
  'compute' | 'substitute'
> {
  compute: (inputs: Record<string, number>) => number;
  substitute?: (s: Sub<Record<string, number>>) => string;
}

export function defineEquation<I extends Record<string, number>>(
  eq: Equation<I>,
): RegisteredEquation {
  const sub = eq.substitute;
  return {
    ...eq,
    compute: (inputs) => eq.compute(inputs as I),
    substitute: sub ? (s) => sub(s as unknown as Sub<I>) : undefined,
  } as RegisteredEquation;
}
