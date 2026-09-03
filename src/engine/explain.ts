/**
 * The one-sentence "why" behind each output.
 *
 * The brief's test is that a borrower can read, in one sentence, why the ceiling
 * is ₹22,000 and not ₹30,000. These sentences are assembled from the trace, so
 * they move automatically when a rule changes — and they are what the AI copilot
 * falls back to whenever its own wording fails the numeric guardrail.
 */

import type { Assessment } from './assess';
import { rankQuestions } from './voi';
import type { TraceStep } from './trace';
import { formatBand, formatINR, formatINRCompact, formatPct, formatMonths } from './trace';

export type OutputId = 'O1' | 'O2' | 'O3' | 'O4';

export interface Explanation {
  id: OutputId;
  title: string;
  /** The answer itself, as the borrower should read it. */
  headline: string;
  /** Why that number and not a different one. One sentence. */
  because: string;
  /** The full working, for anyone who wants to check it. */
  steps: TraceStep[];
}

function pick(trace: readonly TraceStep[], ...labels: string[]): TraceStep[] {
  return trace.filter((s) => labels.includes(s.label));
}

export function explainVerdict(a: Assessment): Explanation {
  return {
    id: 'O1',
    title: 'Should you borrow?',
    headline: a.verdict.headline,
    because: a.verdict.because,
    steps: pick(a.trace, 'Verdict', 'What is actually left', 'Product'),
  };
}

export function explainAmount(a: Assessment): Explanation {
  const { lenderMax, safeMax, useThis, binding } = a.eligibility;

  const because =
    binding === 'borrower'
      ? `A lender sizes the loan against your income and would go to about ` +
        `${formatINRCompact(lenderMax.high)}; your own budget, after everything you ` +
        `actually spend, supports ${formatINRCompact(safeMax.high)}. The smaller number ` +
        `is the real one.`
      : `Your budget could carry ${formatINRCompact(safeMax.high)}, but this product will ` +
        `only advance about ${formatINRCompact(lenderMax.high)} against what you can show ` +
        `or pledge, so that ceiling binds first.`;

  return {
    id: 'O2',
    title: 'How much can you borrow?',
    headline:
      `A lender will likely sanction ${formatBand(lenderMax.low, lenderMax.high, formatINRCompact)}. ` +
      `You can safely carry ${formatBand(safeMax.low, safeMax.high, formatINRCompact)}. ` +
      `Work with ${formatINRCompact(useThis.high)}.`,
    because,
    steps: pick(
      a.trace,
      'Income a lender will count',
      'FOIR ceiling',
      'Instalment a lender would allow',
      'What is actually left',
      'Safe share of the surplus',
      'What a lender will sanction',
      'What you can safely carry',
      'Which number to use',
      'Capped by security',
    ),
  };
}

export function explainRate(a: Assessment): Explanation {
  const { rateBand, aprBand, feePctBand, grades } = a.pricing;
  const gradeText =
    grades.spanned > 1 ? `${grades.best} to ${grades.worst}` : grades.best;

  return {
    id: 'O3',
    title: 'What is a fair rate?',
    headline:
      `${formatBand(rateBand.low, rateBand.high, (n) => formatPct(n))} interest — ` +
      `an all-in ${formatBand(aprBand.low, aprBand.high, (n) => formatPct(n))} once the ` +
      `${formatBand(feePctBand.low, feePctBand.high, (n) => formatPct(n))} fee is counted.`,
    because:
      `Your profile places you in risk grade ${gradeText}, and that is what this ` +
      `product costs at that grade. Compare lenders on the all-in figure, not the ` +
      `headline rate — the fee is where the difference hides.`,
    steps: pick(a.trace, 'Risk grade', 'Fair rate', 'All-in cost', 'Cost of not knowing your score', 'Recent bounce', 'High-cost borrowing'),
  };
}

export function explainCeiling(a: Assessment): Explanation {
  const { emiCeiling, stress } = a.ceiling;

  return {
    id: 'O4',
    title: 'What EMI should you agree to?',
    headline: `Do not go above ${formatINR(emiCeiling.high)} a month.`,
    because:
      `That is what is left after your household costs, rent, the EMIs you already ` +
      `pay and money kept back for saving — and only part of it, so a bad month ` +
      `does not become a missed payment. ` +
      (stress.survivesBoth
        ? `It still holds if your income drops a fifth and the rate rises two points.`
        : `It does not survive an income drop of a fifth plus a two-point rate rise, ` +
          `which is why the amount is capped where it is.`),
    steps: pick(
      a.trace,
      'Your monthly ceiling',
      'What you asked for',
      'If things go wrong',
      'The tenure trade-off',
      'Emergency savings',
      'Variable income discount',
      'What the loan earns',
    ),
  };
}

export function explainAll(a: Assessment): Record<OutputId, Explanation> {
  return {
    O1: explainVerdict(a),
    O2: explainAmount(a),
    O3: explainRate(a),
    O4: explainCeiling(a),
  };
}

/**
 * Which amount to score a lender's quote against.
 *
 * Normally the amount we recommend. But when the verdict is "don't borrow" that
 * figure is zero, and comparing a quote against a zero-rupee loan produced an
 * all-in APR of 0% and the verdict "better than fair — take it" on a 26% offer
 * to the most vulnerable borrower in the set. So we fall back to what they
 * actually asked for: the honest reading is "here is what that offer really
 * costs", alongside our unchanged advice not to take it.
 */
export function comparisonAmount(
  a: Assessment,
  facts: { amountWanted?: import('./facts').Num },
): { amount: number; basis: 'recommended' | 'requested' } {
  const suggested = a.verdict.suggestedAmount?.high ?? 0;
  if (suggested >= 1000) return { amount: suggested, basis: 'recommended' };

  const useThis = a.eligibility.useThis.high;
  if (useThis >= 1000) return { amount: useThis, basis: 'recommended' };

  const asked = a.ceiling.requestedEmi !== undefined ? requestedAmountOf(facts) : 0;
  return { amount: asked, basis: 'requested' };
}

function requestedAmountOf(facts: { amountWanted?: import('./facts').Num }): number {
  const n = facts.amountWanted;
  if (!n || n.kind === 'unknown') return 0;
  return n.kind === 'exact' ? n.value : n.high;
}

/**
 * The card the borrower takes with them.
 *
 * It comes in two kinds, and that distinction matters more than anything else
 * about it. For a borrower who should borrow, it is a negotiation card: what to
 * ask for, the rate to accept, the walk-away point, the lines to say.
 *
 * For a borrower who should *not* borrow, a negotiation card is worse than
 * useless. Anita's read "Ask for ₹0", "I will not go above ₹0 a month", and then
 * handed her a rate band to go argue about on a loan she had just been told to
 * refuse. There is nothing to negotiate, so the card becomes a plan instead: why
 * not, what to do first, and what would actually change the answer. The brief
 * asks that every borrower leave with something they can act on tomorrow, and
 * for the borrower most at risk that cannot be a price list.
 */
export type CardKind = 'negotiate' | 'act_first';

export interface NegotiationCard {
  kind: CardKind;
  verdict: string;
  /** Why the answer is what it is, in one sentence. */
  because: string;
  confidence: string;

  // --- kind === 'negotiate' ---
  askFor?: string;
  rateToAccept?: string;
  aprToCompare?: string;
  emiCeiling?: string;
  tenure?: string;
  walkAwayAbove?: string;
  /** Lines the borrower can read out at the desk. */
  lines: string[];

  // --- kind === 'act_first' ---
  /** The things standing in the way, most binding first. */
  blockers?: string[];
  /** Ordered steps, worth the most money first. */
  firstSteps?: string[];
  /** One thing that would genuinely change the verdict, if there is one. */
  whatWouldChangeIt?: string;
}

export function negotiationCard(a: Assessment): NegotiationCard {
  const confidence = `${Math.round(a.confidence.score * 100)}% — ${a.confidence.label}`;

  if (a.verdict.verdict === 'DONT_BORROW') return actFirstCard(a, confidence);

  const { rateBand, aprBand } = a.pricing;
  const amount = a.verdict.suggestedAmount?.high ?? a.eligibility.useThis.high;

  const lines: string[] = [
    `My profile is risk grade ${a.pricing.grades.best}${a.pricing.grades.spanned > 1 ? `–${a.pricing.grades.worst}` : ''}. ` +
      `Fair for that is ${formatPct(rateBand.low)}–${formatPct(rateBand.high)}, not more.`,
    `Quote me the all-in APR including the processing fee, in writing.`,
    `I will not go above ${formatINR(a.ceiling.emiCeiling.high)} a month.`,
  ];

  if (a.routing.redirected) {
    lines.push(
      `I want a ${a.routing.options[0]?.label.toLowerCase() ?? 'secured loan'}, not an unsecured one.`,
    );
  }

  // A wide band is honest but a weak anchor. Say what would tighten it.
  if (rateBand.high - rateBand.low > 4) {
    lines.push(
      `My score is not on file yet. Once it is, this band narrows — price me on the score, not on the doubt.`,
    );
  }

  if (aprBand.high > rateBand.high) {
    lines.push(
      `If the fee pushes the all-in cost past ${formatPct(aprBand.high)}, waive the fee or cut the rate.`,
    );
  }

  return {
    kind: 'negotiate',
    verdict: a.verdict.headline,
    because: a.verdict.because,
    confidence,
    askFor: formatINRCompact(amount),
    rateToAccept: formatBand(rateBand.low, rateBand.high, (n) => formatPct(n)),
    aprToCompare: formatBand(aprBand.low, aprBand.high, (n) => formatPct(n)),
    emiCeiling: formatINR(a.ceiling.emiCeiling.high),
    tenure: formatMonths(a.eligibility.safeTenureMonths),
    walkAwayAbove: formatPct(aprBand.high),
    lines,
  };
}

/**
 * The card for a borrower who should not borrow.
 *
 * No amount, no rate, no walk-away point — there is nothing to negotiate. What
 * they get instead is the reason, the blockers in order of how much they cost,
 * the steps to take, and the one change that would flip the answer.
 */
function actFirstCard(a: Assessment, confidence: string): NegotiationCard {
  const blockers: string[] = [];

  if (a.affordability.surplus.high <= 0) {
    blockers.push(
      `Your household spends more than it earns — ${formatINR(Math.abs(a.affordability.surplus.high))} short in a good month, ` +
        `before any new instalment.`,
    );
  }
  if (a.eligibility.lenderMax.high <= 0) {
    blockers.push(
      `The EMIs you already pay use up everything a lender would allow against ` +
        `${formatINR(a.affordability.assessedIncome.low)} of countable income, so there is nothing left to lend against.`,
    );
  }
  if (hasHighCostDebt(a)) {
    blockers.push(
      `You are already paying more than most lenders would ever charge you, on the loans you have.`,
    );
  }

  return {
    kind: 'act_first',
    verdict: a.verdict.headline,
    because: a.verdict.because,
    confidence,
    blockers,
    firstSteps: a.verdict.actions,
    whatWouldChangeIt: findTheUnlock(a),
    lines: [
      `I am not signing anything today.`,
      `Before I borrow I need to deal with what I already owe.`,
    ],
  };
}

function hasHighCostDebt(a: Assessment): boolean {
  return a.verdict.actions.some((x) => /app loans first/i.test(x));
}

/**
 * The single change that would flip the verdict.
 *
 * Asks the value-of-information engine which unanswered question could move the
 * borrower off "don't borrow", and phrases it as a route rather than as a
 * question. For Anita this surfaces the co-applicant, which is genuinely the
 * one thing that changes her answer — and she would have no way of knowing that
 * from a refusal alone.
 */
function findTheUnlock(a: Assessment): string | undefined {
  const flip = rankQuestions(a.facts, 'additional').find(
    (v) => v.flipsVerdict && v.verdictsSeen.some((x) => x !== 'DONT_BORROW'),
  );
  if (!flip) return undefined;

  const UNLOCKS: Record<string, string> = {
    coApplicantIncome:
      'Applying jointly with someone who earns changes this answer — their income is ' +
      'counted alongside yours, and a lender treats you both as liable.',
    collateralType:
      'Pledging something you already own changes this answer, and would cut the rate too.',
    collateralValue: 'The value of what you can pledge changes this answer.',
    emergencySavingsMonths: 'Building even one month of savings changes this answer.',
    existingLoans: 'Clearing or refinancing what you already owe changes this answer.',
    productiveMonthlyGain: 'What this loan would actually earn you changes this answer.',
  };

  return (
    UNLOCKS[flip.question.id] ??
    `Answering "${flip.question.text.toLowerCase()}" could change this answer.`
  );
}

