/**
 * The orchestrator: facts in, a complete assessment out.
 *
 * Deliberately a pure function of the facts. No clock, no randomness, no
 * network, no storage — the same answers always produce the same assessment,
 * which is what makes the golden tests meaningful and what lets a rule change be
 * demonstrated as a diff rather than argued about.
 */

import type { BorrowerFacts, ProductKind } from './facts';
import { hi, isKnown } from './facts';
import { PRODUCTS } from './rulebook';
import { band, type Band } from './emi';
import type { TraceStep } from './trace';
import { numbersIn } from './trace';
import { affordability, type AffordabilityResult, type Assumption } from './affordability';
import { clampToRealRates, pricing, riskGrade, type PricingResult } from './pricing';
import { routeProduct, type RoutingResult } from './products';
import { eligibility, lenderTenure, prudentTenure, type EligibilityResult } from './eligibility';
import { ceiling, type CeilingResult } from './ceiling';
import { decideVerdict, type VerdictResult } from './verdict';
import {
  confidence,
  tightenForSafety,
  widenForConfidence,
  type ConfidenceResult,
} from './confidence';

/** Facts without which we decline to produce numbers at all. */
export const MUST_FACTS = [
  'purpose',
  'amountWanted',
  'incomeType',
  'netMonthlyIncome',
] as const;

export type MustFact = (typeof MUST_FACTS)[number];

export interface Assessment {
  /** The answers this assessment was computed from, echoed back so callers can
   *  re-derive things (the value-of-information sweep, for one) without having
   *  to carry the facts alongside the result. */
  facts: BorrowerFacts;
  /** False when the must-set is incomplete — we say so rather than guess. */
  ready: boolean;
  missingMust: MustFact[];

  product: ProductKind;
  routing: RoutingResult;
  confidence: ConfidenceResult;
  affordability: AffordabilityResult;
  pricing: PricingResult;
  eligibility: EligibilityResult;
  ceiling: CeilingResult;
  verdict: VerdictResult;

  /** Values we invented because the borrower did not supply them. */
  assumptions: Assumption[];
  /** Every step behind every number, in order. */
  trace: TraceStep[];
  /**
   * Every figure this assessment is entitled to state. The AI copilot's output
   * is checked against this list — anything else it says is a fabrication.
   */
  allowedNumbers: number[];
}

export function missingMustFacts(facts: BorrowerFacts): MustFact[] {
  const missing: MustFact[] = [];
  if (facts.purpose === undefined) missing.push('purpose');
  if (!isKnown(facts.amountWanted)) missing.push('amountWanted');
  if (facts.incomeType === undefined) missing.push('incomeType');
  if (!isKnown(facts.netMonthlyIncome)) missing.push('netMonthlyIncome');
  return missing;
}

/**
 * Run the full assessment.
 *
 * Two passes over pricing, because the rate depends on the amount and the
 * affordable amount depends on the rate. The first pass prices what the borrower
 * asked for; the second prices what we are actually going to recommend.
 */
export function assess(facts: BorrowerFacts): Assessment {
  const missingMust = missingMustFacts(facts);
  const conf = confidence(facts);

  const requestedAmount = isKnown(facts.amountWanted)
    ? hi(facts.amountWanted, 0)
    : 100000; // nominal, only used to get a product and a first rate

  // 1. Grade is independent of product, so it comes first and drives routing.
  const grade = riskGrade(facts);
  const routing = routeProduct(facts, grade.value, requestedAmount);
  const product: ProductKind = routing.recommended;

  // 2. Affordability — the two capacities.
  const afford = affordability(facts, product);

  // 3. First pass at price, on the amount asked for.
  const firstTenure = lenderTenure(facts, product);
  const firstPass = pricing(facts, product, requestedAmount, firstTenure);

  // 4. What that price makes them eligible for.
  const productCap =
    routing.options.find((o) => o.product === product)?.capacityRupees ??
    PRODUCTS[product].maxAmountRupees;
  const eligRaw = eligibility(facts, product, afford, firstPass, productCap);

  // 5. Second pass at price, on the amount we will actually recommend.
  const recommendAmount = Math.max(
    PRODUCTS[product].minAmountRupees,
    Math.min(requestedAmount, Math.max(0, eligRaw.useThis.high)),
  );
  const safeMonths = prudentTenure(facts, product);
  const price = pricing(facts, product, recommendAmount, safeMonths);

  // 6. Confidence adjustment. Prices widen symmetrically; affordability shrinks.
  //    The widened band is then clamped back to rates that actually exist —
  //    uncertainty may widen the top, but it cannot invent a floor below the
  //    best price any borrower gets for this product.
  const widenedRate = clampToRealRates(widenForConfidence(price.rateBand, conf), product);
  const widenedApr = widenForConfidence(price.aprBand, conf);
  const adjustedPrice: PricingResult = {
    ...price,
    rateBand: widenedRate,
    // An APR can never be below its own nominal rate, so the floor carries over.
    aprBand: band(Math.max(widenedApr.low, widenedRate.low), Math.max(widenedApr.high, widenedRate.high)),
  };

  const affordAdjusted: AffordabilityResult = {
    ...afford,
    safeEmi: tightenForSafety(afford.safeEmi, conf),
  };

  const elig: EligibilityResult = {
    ...eligRaw,
    lenderMax: widenForConfidence(eligRaw.lenderMax, conf),
    safeMax: tightenForSafety(eligRaw.safeMax, conf),
    useThis: tightenForSafety(eligRaw.useThis, conf),
  };

  // 7. Ceiling and stress, on the recommended amount at the top of the band.
  const ceil = ceiling(
    facts,
    product,
    affordAdjusted.safeEmi,
    Math.max(recommendAmount, 1),
    adjustedPrice.rateBand.high,
    safeMonths,
  );

  // 8. Verdict.
  const verdict = decideVerdict(facts, product, affordAdjusted, elig, ceil, routing, adjustedPrice);

  const trace: TraceStep[] = [
    ...routing.steps,
    ...affordAdjusted.lenderTrace,
    ...affordAdjusted.safeTrace,
    ...adjustedPrice.steps,
    ...elig.steps,
    ...ceil.steps,
    ...verdict.steps,
  ];

  return {
    facts,
    ready: missingMust.length === 0,
    missingMust,
    product,
    routing,
    confidence: conf,
    affordability: affordAdjusted,
    pricing: adjustedPrice,
    eligibility: elig,
    ceiling: ceil,
    verdict,
    assumptions: afford.assumptions,
    trace,
    allowedNumbers: collectAllowedNumbers(trace, elig, adjustedPrice, ceil, affordAdjusted),
  };
}


/**
 * Everything the copilot is allowed to say.
 *
 * Includes the trace values plus the headline figures themselves, since those
 * are the numbers a borrower will ask about by name.
 */
function collectAllowedNumbers(
  trace: readonly TraceStep[],
  elig: EligibilityResult,
  price: PricingResult,
  ceil: CeilingResult,
  afford: AffordabilityResult,
): number[] {
  const values = new Set<number>(numbersIn(trace));

  const add = (n: number | undefined) => {
    if (typeof n === 'number' && Number.isFinite(n)) values.add(n);
  };
  const addBand = (b: Band) => {
    add(b.low);
    add(b.high);
  };

  addBand(elig.lenderMax);
  addBand(elig.safeMax);
  addBand(elig.useThis);
  addBand(price.rateBand);
  addBand(price.aprBand);
  addBand(price.feePctBand);
  addBand(ceil.emiCeiling);
  addBand(afford.surplus);
  addBand(afford.assessedIncome);
  addBand(afford.lenderEmi);
  add(elig.lenderTenureMonths);
  add(elig.safeTenureMonths);
  add(ceil.requestedEmi);
  add(ceil.stress.stressedEmi);
  add(ceil.stress.shortfallRupees);
  for (const option of ceil.tenureOptions) {
    add(option.months);
    add(option.emi);
    add(option.totalInterest);
  }

  return [...values];
}
