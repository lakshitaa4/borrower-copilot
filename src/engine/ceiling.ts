/**
 * O4 — the monthly outflow to agree to, and what happens when things go wrong.
 *
 * The stress test is the part that matters. A loan that only works if nothing
 * changes is not affordable, it is a bet. So every recommendation is re-run
 * against an ordinary bad year: a fifth of the income gone, and two points on
 * the rate. Neither is a catastrophe — that is exactly why failing them counts.
 */

import { STRESS_CASE, PRODUCTS } from './rulebook';
import {
  type BorrowerFacts,
  type ProductKind,
  type Num,
  exact,
  hi,
  isKnown,
  lo,
  range,
} from './facts';
import { emi, tenureTable, type Band, type TenureOption } from './emi';
import { safeCapacity, type Assumption } from './affordability';
import { formatINR, formatMonths, formatPct, type TraceStep } from './trace';

export interface StressResult {
  /** Instalment after the rate shock, on the amount being recommended. */
  stressedEmi: number;
  /** What the borrower could still carry after the income shock. */
  stressedCapacity: Band;
  survivesIncomeDrop: boolean;
  survivesRateRise: boolean;
  survivesBoth: boolean;
  /** Shortfall per month in the combined case; zero when it holds. */
  shortfallRupees: number;
  detail: string;
}

export interface CeilingResult {
  /** The monthly figure the borrower should not cross. */
  emiCeiling: Band;
  /** The instalment on what they actually asked for, if they told us. */
  requestedEmi?: number;
  requestedWithinCeiling?: boolean;
  tenureOptions: TenureOption[];
  stress: StressResult;
  steps: TraceStep[];
}

/** Scale an uncertain quantity, preserving its shape. */
function scale(n: Num | undefined, factor: number): Num | undefined {
  if (n === undefined || !isKnown(n)) return n;
  return n.kind === 'exact' ? exact(n.value * factor) : range(n.low * factor, n.high * factor);
}

export function ceiling(
  facts: BorrowerFacts,
  product: ProductKind,
  safeEmi: Band,
  recommendedAmount: number,
  ratePct: number,
  tenureMonths: number,
): CeilingResult {
  const steps: TraceStep[] = [];

  steps.push({
    ruleId: 'safe.utilisation_of_surplus',
    label: 'Your monthly ceiling',
    detail:
      `Do not agree to more than ${formatINR(safeEmi.high)} a month. Above that, ` +
      `the loan is being sized against what a lender will allow rather than what ` +
      `your household can absorb.`,
    value: safeEmi.high,
    unit: 'rupees',
  });

  const requestedAmount = isKnown(facts.amountWanted)
    ? hi(facts.amountWanted, 0)
    : undefined;
  const requestedEmi =
    requestedAmount !== undefined ? emi(requestedAmount, ratePct, tenureMonths) : undefined;

  if (requestedEmi !== undefined) {
    const within = requestedEmi <= safeEmi.high;
    steps.push({
      label: 'What you asked for',
      detail: within
        ? `The ${formatINR(requestedEmi)} instalment on what you asked for fits inside that ceiling.`
        : `What you asked for would cost ${formatINR(requestedEmi)} a month — ` +
          `${formatINR(requestedEmi - safeEmi.high)} above your ceiling.`,
      value: requestedEmi,
      unit: 'rupees',
    });
  }

  // --- the shock ---------------------------------------------------------
  const shockedFacts: BorrowerFacts = {
    ...facts,
    netMonthlyIncome: scale(facts.netMonthlyIncome, 1 - STRESS_CASE.incomeDropPct),
  };
  const shockedAssumptions: Assumption[] = [];
  const shockedCapacity = safeCapacity(shockedFacts, shockedAssumptions).safeEmi;

  const stressedRate = ratePct + STRESS_CASE.rateRisePp;
  const stressedEmi = emi(recommendedAmount, stressedRate, tenureMonths);

  const survivesIncomeDrop = shockedCapacity.high >= (requestedEmi ?? stressedEmi);
  const survivesRateRise = stressedEmi <= safeEmi.high;
  const survivesBoth = stressedEmi <= shockedCapacity.high;
  const shortfall = Math.max(0, stressedEmi - shockedCapacity.high);

  const detail = survivesBoth
    ? `If your income fell ${formatPct(STRESS_CASE.incomeDropPct * 100, 0)} and the rate rose ` +
      `${formatPct(STRESS_CASE.rateRisePp, 0)}, the instalment would be ` +
      `${formatINR(stressedEmi)} and you could still cover it.`
    : `If your income fell ${formatPct(STRESS_CASE.incomeDropPct * 100, 0)} and the rate rose ` +
      `${formatPct(STRESS_CASE.rateRisePp, 0)}, the instalment would be ` +
      `${formatINR(stressedEmi)} against a capacity of ${formatINR(shockedCapacity.high)} — ` +
      `you would be short ${formatINR(shortfall)} every month.`;

  steps.push({
    ruleId: 'verdict.stress_case',
    label: 'If things go wrong',
    detail,
    value: stressedEmi,
    unit: 'rupees',
  });

  const options = tenureTable(recommendedAmount, ratePct, product);
  const config = PRODUCTS[product];
  if (options.length > 1) {
    const shortest = options[0]!;
    const longest = options[options.length - 1]!;
    steps.push({
      ruleId: 'products.catalogue',
      label: 'The tenure trade-off',
      detail:
        `Over ${formatMonths(shortest.months)} the instalment is ${formatINR(shortest.emi)}; ` +
        `over ${formatMonths(longest.months)} it drops to ${formatINR(longest.emi)} but you pay ` +
        `${formatINR(longest.totalInterest - shortest.totalInterest)} more in interest. ` +
        `A lender will lead with the longer one.`,
      value: longest.totalInterest - shortest.totalInterest,
      unit: 'rupees',
    });
  }

  return {
    emiCeiling: safeEmi,
    requestedEmi,
    requestedWithinCeiling:
      requestedEmi !== undefined ? requestedEmi <= safeEmi.high : undefined,
    tenureOptions: options.filter(
      (o) => o.months >= config.minTenureMonths && o.months <= config.maxTenureMonths,
    ),
    stress: {
      stressedEmi,
      stressedCapacity: shockedCapacity,
      survivesIncomeDrop,
      survivesRateRise,
      survivesBoth,
      shortfallRupees: shortfall,
      detail,
    },
    steps,
  };
}

/** Lowest instalment the borrower would face on this amount, for context. */
export function cheapestInstalment(
  amountRupees: number,
  ratePct: number,
  product: ProductKind,
): number {
  return emi(amountRupees, ratePct, PRODUCTS[product].maxTenureMonths);
}

/** How much of income the new EMI would consume, given everything already owed. */
export function postLoanObligationRatio(
  facts: BorrowerFacts,
  newEmi: number,
): number | undefined {
  const income = lo(facts.netMonthlyIncome, 0);
  if (income <= 0) return undefined;
  const existing = lo(facts.existingEmiTotal, 0);
  return (existing + newEmi) / income;
}
