/**
 * O3 — what a fair rate looks like for this borrower.
 *
 * Two principles drive everything here:
 *
 *  1. The answer is a band, never a point. A borrower who is told "your rate is
 *     12.4%" has been given false precision they cannot act on. A borrower told
 *     "11.5-13% is fair for you" can walk into a branch and push back.
 *
 *  2. A missing credit score widens the band; it never worsens it. Modelling an
 *     unscored borrower as a bad one is the single most common way these tools
 *     quietly punish people for being new to formal credit.
 */

import {
  RATE_BANDS,
  SCORE_TO_GRADE,
  GRADE_ORDER,
  THIN_FILE_GRADE_RANGE,
  IMPAIRED_GRADE_RANGE,
  UNKNOWN_SCORE_RATE_PENALTY_PP,
  PRODUCTS,
  type Grade,
} from './rulebook';
import {
  type BorrowerFacts,
  type ProductKind,
  hasHighCostDebt,
  hi,
  isKnown,
  lo,
} from './facts';
import {
  allInApr,
  band,
  gradeUncertaintyPad,
  padBand,
  spanBands,
  type Band,
} from './emi';
import { formatINR, formatPct, type TraceStep } from './trace';

export interface GradeRange {
  best: Grade;
  worst: Grade;
  /** How many grades the borrower could plausibly fall across. */
  spanned: number;
}

export interface PricingResult {
  grades: GradeRange;
  /** Nominal annual interest rate the borrower should expect to be offered. */
  rateBand: Band;
  /** The same loan including fees — the number that should be compared. */
  aprBand: Band;
  feePctBand: Band;
  steps: TraceStep[];
}

/**
 * The best rate that exists for this product, at any grade.
 *
 * Band-widening must never dip below it: showing a borrower a rate no lender
 * offers sends them into a branch expecting something that is not there.
 */
export function productRateFloor(product: ProductKind): number {
  return RATE_BANDS[product]['A+'][0];
}

/** Keep a widened band inside the range of rates that actually exist. */
export function clampToRealRates(b: Band, product: ProductKind): Band {
  return band(Math.max(b.low, productRateFloor(product)), Math.max(b.high, b.low));
}

function gradeIndex(g: Grade): number {
  const i = GRADE_ORDER.indexOf(g);
  return i < 0 ? GRADE_ORDER.length - 1 : i;
}

function gradeAt(index: number): Grade {
  const clamped = Math.min(GRADE_ORDER.length - 1, Math.max(0, index));
  return GRADE_ORDER[clamped] ?? 'D';
}

function makeRange(best: Grade, worst: Grade): GradeRange {
  const b = Math.min(gradeIndex(best), gradeIndex(worst));
  const w = Math.max(gradeIndex(best), gradeIndex(worst));
  return { best: gradeAt(b), worst: gradeAt(w), spanned: w - b + 1 };
}

/**
 * Place the borrower on the risk ladder.
 *
 * A known score gives a point estimate, nudged by conduct. No score gives a
 * *range*, which is the honest representation: we know less, so we say less.
 */
export function riskGrade(facts: BorrowerFacts): {
  value: GradeRange;
  steps: TraceStep[];
} {
  const steps: TraceStep[] = [];
  const bounces = lo(facts.bouncesLast12m, 0);
  const highCost = hasHighCostDebt(facts);

  if (isKnown(facts.creditScore)) {
    const scoreLow = lo(facts.creditScore, 0);
    const scoreHigh = hi(facts.creditScore, 0);
    const bestBand = SCORE_TO_GRADE.find((b) => scoreHigh >= b.min);
    const worstBand = SCORE_TO_GRADE.find((b) => scoreLow >= b.min);
    let best = gradeIndex(bestBand?.grade ?? 'D');
    let worst = gradeIndex(worstBand?.grade ?? 'D');

    steps.push({
      ruleId: 'grade.score_bands',
      label: 'Risk grade',
      detail: `A credit score of ${Math.round(scoreLow)} puts you in grade ${gradeAt(worst)}.`,
      value: Math.round(scoreLow),
      unit: 'none',
    });

    // Conduct the score may not yet reflect.
    if (bounces > 0) {
      worst = Math.min(GRADE_ORDER.length - 1, worst + 1);
      steps.push({
        ruleId: 'grade.impaired',
        label: 'Recent bounce',
        detail:
          `A missed EMI in the last year drops you a grade regardless of the score — ` +
          `lenders see it on the report before the score catches up.`,
      });
    }
    if (highCost) {
      worst = Math.min(GRADE_ORDER.length - 1, worst + 1);
      steps.push({
        ruleId: 'grade.impaired',
        label: 'High-cost borrowing',
        detail:
          `Borrowing at 30%+ signals to a lender that cheaper options were already ` +
          `unavailable to you, which costs you a grade.`,
      });
    }
    return { value: makeRange(gradeAt(best), gradeAt(worst)), steps };
  }

  // No score.
  if (bounces > 0 || highCost) {
    steps.push({
      ruleId: 'grade.impaired',
      label: 'Risk grade',
      detail:
        `You have no credit score, and there is a recent missed payment or ` +
        `high-cost loan on record. Expect to be priced in grade ` +
        `${IMPAIRED_GRADE_RANGE.best} to ${IMPAIRED_GRADE_RANGE.worst}.`,
    });
    return {
      value: makeRange(IMPAIRED_GRADE_RANGE.best, IMPAIRED_GRADE_RANGE.worst),
      steps,
    };
  }

  steps.push({
    ruleId: 'grade.thin_file',
    label: 'Risk grade',
    detail:
      `You have no credit score, which is not the same as a bad one — you have ` +
      `simply never borrowed formally. Until a lender scores you, you could be ` +
      `priced anywhere from grade ${THIN_FILE_GRADE_RANGE.best} to ` +
      `${THIN_FILE_GRADE_RANGE.worst}, so the rate below is a wide band.`,
  });
  return {
    value: makeRange(THIN_FILE_GRADE_RANGE.best, THIN_FILE_GRADE_RANGE.worst),
    steps,
  };
}

/** The fair rate band, and the all-in APR band that goes with it. */
export function pricing(
  facts: BorrowerFacts,
  product: ProductKind,
  amountRupees: number,
  tenureMonths: number,
): PricingResult {
  const grade = riskGrade(facts);
  const steps = [...grade.steps];

  const productBands = RATE_BANDS[product];
  const covered: Band[] = [];
  for (let i = gradeIndex(grade.value.best); i <= gradeIndex(grade.value.worst); i++) {
    const g = gradeAt(i);
    const b = productBands[g];
    covered.push(band(b[0], b[1]));
  }

  let rateBand = spanBands(covered);

  // Uncertainty about the grade is itself a cost — it weakens the borrower's
  // negotiating position, so the band widens rather than pretending otherwise.
  const uncertaintyPad = gradeUncertaintyPad(grade.value.spanned);
  if (uncertaintyPad > 0) {
    rateBand = padBand(rateBand, uncertaintyPad / 2);
  }

  if (!isKnown(facts.creditScore)) {
    rateBand = band(rateBand.low, rateBand.high + UNKNOWN_SCORE_RATE_PENALTY_PP);
    steps.push({
      ruleId: 'grade.unknown_score_penalty_pp',
      label: 'Cost of not knowing your score',
      detail:
        `Because your score is unknown we widen the top of this band by ` +
        `${formatPct(UNKNOWN_SCORE_RATE_PENALTY_PP, 1)}. Checking it free online ` +
        `would narrow this before you ever speak to a lender.`,
      value: UNKNOWN_SCORE_RATE_PENALTY_PP,
      unit: 'pp',
    });
  }

  rateBand = band(Math.max(0, rateBand.low), rateBand.high);

  const feeBand = PRODUCTS[product].processingFeePctBand;
  const feePctBand = band(feeBand[0], feeBand[1]);

  steps.push({
    ruleId: 'pricing.rate_bands',
    label: 'Fair rate',
    detail:
      `For ${PRODUCTS[product].label.toLowerCase()} at grade ` +
      `${grade.value.best}${grade.value.spanned > 1 ? `-${grade.value.worst}` : ''}, ` +
      `${formatPct(rateBand.low)} to ${formatPct(rateBand.high)} is the fair range.`,
    value: rateBand.low,
    unit: 'pct',
  });

  // The APR band pairs the best case with the best case and the worst with the
  // worst — a borrower who negotiates the rate usually negotiates the fee too.
  const aprLow = allInApr({
    amountRupees,
    annualRatePct: rateBand.low,
    tenureMonths,
    processingFeePct: feePctBand.low,
  }).aprPct;
  const aprHigh = allInApr({
    amountRupees,
    annualRatePct: rateBand.high,
    tenureMonths,
    processingFeePct: feePctBand.high,
  }).aprPct;
  const aprBand = band(aprLow, aprHigh);

  steps.push({
    ruleId: 'pricing.apr_components',
    label: 'All-in cost',
    detail:
      `With a processing fee of ${formatPct(feePctBand.low)}-${formatPct(feePctBand.high)}, ` +
      `the true cost is ${formatPct(aprBand.low)} to ${formatPct(aprBand.high)} — ` +
      `this is the number to compare between lenders, not the headline rate.`,
    value: aprBand.high,
    unit: 'pct',
  });

  return { grades: grade.value, rateBand, aprBand, feePctBand, steps };
}

// ---------------------------------------------------------------------------
// Comparing an offer the borrower has actually been given
// ---------------------------------------------------------------------------

export type QuoteStance = 'good' | 'fair' | 'above_fair' | 'far_above_fair';

export interface QuoteComparison {
  stance: QuoteStance;
  quotedRatePct: number;
  quotedAprPct: number;
  /** Fair band for *this* loan — the quoted amount and tenure, not ours. */
  fairRateBand: Band;
  fairAprBand: Band;
  /** Points of all-in APR above the top of the fair band; 0 when inside it. */
  excessPp: number;
  /**
   * What being above fair costs over the full tenure, measured as total cost
   * (interest plus every charge) rather than as an EMI difference. That matters:
   * EMI depends only on the rate, while APR depends on the rate *and* the fee,
   * so an EMI-based gap could report a cost on a quote that was fair on APR —
   * a 13%-no-fee offer has a higher instalment than a 12.5%-plus-fee one, yet
   * costs less overall. Total cost moves monotonically with APR, so the stance
   * and this figure can never disagree. Zero when the quote is inside the band.
   */
  costOfExcessRupees: number;
  /**
   * What pushing to the *bottom* of the fair band would save. Available even on
   * a fair quote, because "fair" is a band and the borrower is entitled to
   * argue for its better end. Reported separately so it is never confused with
   * being overcharged.
   */
  upsideToBestRupees: number;
  emi: number;
  /** Instalment at the top of the fair band — the least they should accept. */
  emiAtFairCeiling: number;
  /** Instalment at the bottom of the band — what a good negotiation gets. */
  emiAtBestRate: number;
  /** True when the tenure exceeds what this product normally runs to. */
  tenureBeyondProductMax: boolean;
  steps: TraceStep[];
}

/**
 * Score a lender's actual offer against the fair band.
 *
 * Two things here were wrong in an earlier version and are worth naming, because
 * both produced screens that contradicted themselves:
 *
 *  1. The stance was judged on all-in APR while the saving was computed against
 *     the nominal rate ceiling. A quote could therefore be reported as "inside
 *     the fair band" and as costing the borrower ₹15,000 in the same breath.
 *     Everything is now measured on APR, which is the only honest basis.
 *
 *  2. The fair band was priced on the amount and tenure *we* recommend, then
 *     compared against a quote for a different amount over a different term.
 *     The band is now recomputed for the loan actually being priced, so it is
 *     genuinely like-for-like.
 */
export function compareQuote(
  facts: BorrowerFacts,
  product: ProductKind,
  amountRupees: number,
  offerRatePct: number,
  tenureMonths: number,
  processingFeePct = 0,
  bundledChargesRupees = 0,
): QuoteComparison {
  // Priced on this loan, not on the one we would have recommended.
  const fair = pricing(facts, product, amountRupees, tenureMonths);

  const quoted = allInApr({
    amountRupees,
    annualRatePct: offerRatePct,
    tenureMonths,
    processingFeePct,
    bundledChargesRupees,
  });

  // The two ends of the fair band, as complete offers on this same loan.
  const atCeiling = allInApr({
    amountRupees,
    annualRatePct: fair.rateBand.high,
    tenureMonths,
    processingFeePct: fair.feePctBand.high,
  });
  const atBest = allInApr({
    amountRupees,
    annualRatePct: fair.rateBand.low,
    tenureMonths,
    processingFeePct: fair.feePctBand.low,
  });

  const fairAprBand = band(atBest.aprPct, atCeiling.aprPct);
  const excessPp = quoted.aprPct - fairAprBand.high;

  const stance: QuoteStance =
    quoted.aprPct <= fairAprBand.low
      ? 'good'
      : quoted.aprPct <= fairAprBand.high
        ? 'fair'
        : excessPp <= 2
          ? 'above_fair'
          : 'far_above_fair';

  /*
   * The stance is the authority, and the rupee figures are gated on it.
   *
   * This is not belt-and-braces — it is necessary. APR and total cost genuinely
   * rank offers differently, because APR discounts money for time and total
   * cost does not: two offers at identical APR but different rate/fee splits
   * have different total costs. So neither measure can be derived from the
   * other, and deriving the stance from one while computing the gap from the
   * other is what produced "inside the fair band" alongside "the gap costs you
   * ₹15,115". APR decides whether a quote is above fair, because that is the
   * standardised comparison; total cost then says what the excess is worth in
   * rupees, and is reported only when there is an excess to price.
   */
  const aboveFair = quoted.aprPct > fairAprBand.high;
  const betterThanBest = quoted.aprPct <= fairAprBand.low;

  const costOfExcessRupees = aboveFair
    ? Math.max(0, quoted.totalCostRupees - atCeiling.totalCostRupees)
    : 0;
  const upsideToBestRupees = betterThanBest
    ? 0
    : Math.max(0, quoted.totalCostRupees - atBest.totalCostRupees);

  const steps: TraceStep[] = [
    {
      ruleId: 'pricing.apr_components',
      label: 'What you were quoted',
      detail:
        `${formatPct(offerRatePct)}` +
        (processingFeePct > 0 ? ` with a ${formatPct(processingFeePct)} fee` : '') +
        (bundledChargesRupees > 0 ? ` plus charges` : '') +
        ` is an all-in cost of ${formatPct(quoted.aprPct)}.`,
      value: quoted.aprPct,
      unit: 'pct',
    },
    {
      ruleId: 'pricing.rate_bands',
      label: 'What is fair',
      detail:
        `On this amount over this tenure, your profile supports ` +
        `${formatPct(fair.rateBand.low)}-${formatPct(fair.rateBand.high)} — ` +
        `an all-in ${formatPct(fairAprBand.low)} to ${formatPct(fairAprBand.high)}.`,
      value: fairAprBand.high,
      unit: 'pct',
    },
  ];

  if (costOfExcessRupees > 0) {
    steps.push({
      label: 'What the gap costs you',
      detail:
        `Being ${formatPct(excessPp)} above the fair ceiling costs you ` +
        `${formatINR(costOfExcessRupees)} over ${tenureMonths} months.`,
      value: Math.round(costOfExcessRupees),
      unit: 'rupees',
    });
  } else if (upsideToBestRupees > 0) {
    steps.push({
      label: 'Room left to negotiate',
      detail:
        `This is already inside your fair band. Pushing to the better end of it ` +
        `would still save ${formatINR(upsideToBestRupees)} over ${tenureMonths} months.`,
      value: Math.round(upsideToBestRupees),
      unit: 'rupees',
    });
  }

  const productMax = PRODUCTS[product].maxTenureMonths;
  const tenureBeyondProductMax = tenureMonths > productMax;
  if (tenureBeyondProductMax) {
    steps.push({
      ruleId: 'products.catalogue',
      label: 'Unusual tenure',
      detail:
        `${tenureMonths} months is longer than a ${PRODUCTS[product].label.toLowerCase()} ` +
        `normally runs (${productMax}). A longer term lowers the instalment and raises ` +
        `the total cost — check what they are actually selling you.`,
      value: productMax,
      unit: 'months',
    });
  }

  return {
    stance,
    quotedRatePct: offerRatePct,
    quotedAprPct: quoted.aprPct,
    fairRateBand: fair.rateBand,
    fairAprBand,
    excessPp,
    costOfExcessRupees,
    upsideToBestRupees,
    emi: quoted.emi,
    emiAtFairCeiling: atCeiling.emi,
    emiAtBestRate: atBest.emi,
    tenureBeyondProductMax,
    steps,
  };
}
