/**
 * Traceability.
 *
 * The brief's rule is that a borrower must be able to read, in one sentence, why
 * the ceiling is ₹22,000 and not ₹30,000. So no number is allowed to exist in
 * this app without the steps that produced it travelling alongside it.
 *
 * A trace is also what makes the AI copilot safe: it is the allowlist of figures
 * the model is permitted to say out loud. Anything else it emits is a fabrication
 * and gets rejected.
 */

export type Unit = 'rupees' | 'pct' | 'pp' | 'months' | 'years' | 'ratio' | 'none';

export interface TraceStep {
  /** Rule this step applied, if any — links the number back to RULES.md. */
  ruleId?: string;
  /** Short label, e.g. "FOIR ceiling". */
  label: string;
  /** One clause explaining this step in the borrower's terms. */
  detail: string;
  value?: number;
  unit?: Unit;
}

export interface Traced<T> {
  value: T;
  trace: TraceStep[];
}

export class TraceBuilder {
  private readonly steps: TraceStep[] = [];

  add(step: TraceStep): this {
    this.steps.push(step);
    return this;
  }

  /** Fold another calculation's trace into this one. */
  merge(steps: readonly TraceStep[]): this {
    this.steps.push(...steps);
    return this;
  }

  done<T>(value: T): Traced<T> {
    return { value, trace: [...this.steps] };
  }

  get all(): readonly TraceStep[] {
    return this.steps;
  }
}

export function trace(): TraceBuilder {
  return new TraceBuilder();
}

/**
 * Every numeric value appearing anywhere in a trace. This is the allowlist the
 * copilot's guardrail checks generated prose against.
 */
export function numbersIn(steps: readonly TraceStep[]): number[] {
  return steps
    .map((s) => s.value)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
}

// ---------------------------------------------------------------------------
// Formatting — Indian conventions, because the borrower reads these
// ---------------------------------------------------------------------------

const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

/** ₹1,10,000 — Indian digit grouping, not 110,000. */
export function formatINR(value: number): string {
  return `₹${inr.format(Math.round(value))}`;
}

/** ₹8 lakh / ₹45 lakh / ₹1.2 crore — how the amount would actually be said. */
export function formatINRCompact(value: number): string {
  const v = Math.round(value);
  if (Math.abs(v) >= 10000000) {
    const cr = v / 10000000;
    return `₹${trimZeros(cr.toFixed(2))} crore`;
  }
  if (Math.abs(v) >= 100000) {
    const lakh = v / 100000;
    return `₹${trimZeros(lakh.toFixed(2))} lakh`;
  }
  return formatINR(v);
}

export function formatPct(value: number, dp = 1): string {
  return `${trimZeros(value.toFixed(dp))}%`;
}

export function formatBand(low: number, high: number, fmt: (n: number) => string): string {
  if (Math.abs(high - low) < 0.005) return fmt(low);
  return `${fmt(low)} – ${fmt(high)}`;
}

export function formatMonths(months: number): string {
  const m = Math.round(months);
  if (m % 12 === 0) {
    const y = m / 12;
    return `${y} year${y === 1 ? '' : 's'}`;
  }
  return `${m} months`;
}

function trimZeros(s: string): string {
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}
