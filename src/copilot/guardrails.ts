/**
 * The rule that keeps an AI copilot honest: it may explain the numbers, it may
 * never invent one.
 *
 * Every figure the engine produces is recorded in the assessment's trace. This
 * checks generated prose against that list and rejects anything containing a
 * number the engine did not produce. A model that hallucinates "you could get
 * 9.2%" when the band starts at 10.5% is not a cosmetic problem in a lending
 * tool — it sends someone into a branch to ask for something that does not
 * exist, and it is exactly the failure mode that makes people distrust these
 * products.
 *
 * On a violation the caller retries once with a stricter instruction, and then
 * falls back to the deterministic sentence from explain.ts. The app never shows
 * an unverified number, and it says when it had to fall back.
 */

/** Numbers that carry no claim about the borrower's situation. */
const HARMLESS = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 100]);

/** Tolerance for rounding — "₹14,509" may legitimately be said as "₹14,500". */
const RELATIVE_TOLERANCE = 0.02;
const ABSOLUTE_TOLERANCE = 1;

export interface GuardrailResult {
  ok: boolean;
  /** Numbers in the text with no basis in the assessment. */
  violations: number[];
  /** Every number found, for logging. */
  found: number[];
}

/**
 * Pull the numbers out of generated prose.
 *
 * Handles Indian digit grouping (1,10,000), decimals, and the lakh/crore words,
 * since the model will use all three.
 */
export function extractNumbers(text: string): number[] {
  const out: number[] = [];

  // "8 lakh", "1.2 crore" — expand to their real magnitude.
  const scaled = /(\d+(?:[.,]\d+)?)\s*(lakh|lakhs|crore|crores)/gi;
  let m: RegExpExecArray | null;
  const consumed: [number, number][] = [];
  while ((m = scaled.exec(text)) !== null) {
    const value = Number(m[1]!.replace(/,/g, ''));
    if (Number.isFinite(value)) {
      const unit = m[2]!.toLowerCase();
      out.push(value * (unit.startsWith('crore') ? 10000000 : 100000));
    }
    consumed.push([m.index, m.index + m[0].length]);
  }

  // Plain numbers, skipping any span already consumed above.
  const plain = /\d[\d,]*(?:\.\d+)?/g;
  while ((m = plain.exec(text)) !== null) {
    const start = m.index;
    if (consumed.some(([a, b]) => start >= a && start < b)) continue;
    const value = Number(m[0].replace(/,/g, ''));
    if (Number.isFinite(value)) out.push(value);
  }

  return out;
}

function isAllowed(value: number, allowed: readonly number[]): boolean {
  if (HARMLESS.has(value)) return true;

  for (const a of allowed) {
    const tolerance = Math.max(ABSOLUTE_TOLERANCE, Math.abs(a) * RELATIVE_TOLERANCE);
    if (Math.abs(value - a) <= tolerance) return true;

    // The model rounds for readability: ₹14,509 said as ₹14,500 or ₹15,000.
    for (const unit of [10, 100, 1000, 10000]) {
      if (Math.abs(value - Math.round(a / unit) * unit) <= tolerance) return true;
    }
  }
  return false;
}

/**
 * Check generated text against the numbers the engine actually produced.
 */
export function checkNumbers(text: string, allowed: readonly number[]): GuardrailResult {
  const found = extractNumbers(text);
  const violations = found.filter((n) => !isAllowed(n, allowed));
  return { ok: violations.length === 0, violations, found };
}

/** The instruction added on a retry, naming what went wrong. */
export function retryInstruction(violations: readonly number[]): string {
  return (
    `Your previous answer used ${violations.map((v) => String(v)).join(', ')}, which ` +
    `did not come from the assessment. Every figure you state must be one the tools ` +
    `returned. Rewrite it using only those figures, or describe the situation without ` +
    `numbers at all.`
  );
}
