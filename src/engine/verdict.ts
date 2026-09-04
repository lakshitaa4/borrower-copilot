/**
 * O1 — borrow, borrow less, or don't.
 *
 * The structure matters more than the thresholds. There are two different kinds
 * of "no":
 *
 *   A. Borrowing at all is wrong right now. No amount fixes it.
 *   B. This *amount* is wrong. A smaller one is fine.
 *
 * Collapsing B into "don't borrow" would be a serious error — telling Priya not
 * to borrow when she can comfortably carry ₹4,00,000 is as unhelpful as telling
 * Anita she can have ₹1,50,000. So the absolute blocks are checked first, and
 * everything after them resolves to a smaller amount that we actually stand
 * behind, computed from whichever constraint binds rather than asserted.
 *
 * A refusal is not the end of the conversation either. Anita gets told no *and*
 * gets a sequence she can start tomorrow, because the underlying need — a second
 * scooter that doubles her delivery runs — is real even when a ₹1,50,000
 * unsecured loan on top of 32% app debt is not.
 */

import { VERDICT_THRESHOLDS, PRODUCTS } from './rulebook';
import {
  type BorrowerFacts,
  type ProductKind,
  continuingEmi,
  hasHighCostDebt,
  hi,
  householdIncome,
  isKnown,
  isProductive,
  lo,
} from './facts';
import { band, principalFromEmi, type Band } from './emi';
import { formatINR, formatINRCompact, formatPct, type TraceStep } from './trace';
import type { EligibilityResult } from './eligibility';
import type { CeilingResult } from './ceiling';
import type { RoutingResult } from './products';
import type { AffordabilityResult } from './affordability';
import type { PricingResult } from './pricing';

export type Verdict = 'BORROW' | 'BORROW_LESS' | 'DONT_BORROW';

export interface VerdictResult {
  verdict: Verdict;
  /** The sentence the borrower reads first. */
  headline: string;
  /** The one-sentence why, traceable to their own answers. */
  because: string;
  ruleId: string;
  /** For BORROW_LESS, the amount we would actually stand behind. */
  suggestedAmount?: Band;
  /** Things to do tomorrow — populated even when the answer is no. */
  actions: string[];
  steps: TraceStep[];
}

export function decideVerdict(
  facts: BorrowerFacts,
  product: ProductKind,
  afford: AffordabilityResult,
  elig: EligibilityResult,
  ceil: CeilingResult,
  routing: RoutingResult,
  price: PricingResult,
): VerdictResult {
  const steps: TraceStep[] = [];
  const requested = isKnown(facts.amountWanted) ? hi(facts.amountWanted, 0) : undefined;
  const requestedEmi = ceil.requestedEmi;
  const safeEmiHigh = afford.safeEmi.high;
  const actions = buildActions(facts, product, routing, elig);
  const floor = VERDICT_THRESHOLDS.borrowLessFloorRupees;

  const fire = (
    verdict: Verdict,
    ruleId: string,
    headline: string,
    because: string,
    suggestedAmount?: Band,
  ): VerdictResult => {
    steps.push({ ruleId, label: 'Verdict', detail: because });
    return { verdict, headline, because, ruleId, suggestedAmount, actions, steps };
  };

  // -----------------------------------------------------------------------
  // The largest amount we would stand behind, from whichever limit binds.
  // -----------------------------------------------------------------------
  const rate = price.rateBand.high;
  const tenure = elig.safeTenureMonths;
  // Household income: the co-applicant is jointly liable and shares the costs,
  // so they belong in the obligation ratio exactly as they belong in the surplus.
  const incomeLow = householdIncome(facts).low;
  // What will still be owed after this loan — zero when consolidating, since
  // the new loan repays what it replaces.
  const existingEmi = hi(continuingEmi(facts), 0);

  // The hard obligation ceiling is measured against a *bad* month, not an
  // average one — a borrower with variable income has to make the payment then.
  const foirHeadroomEmi = VERDICT_THRESHOLDS.postLoanFoirHardStop * incomeLow - existingEmi;
  const foirCapAmount =
    foirHeadroomEmi > 0 ? principalFromEmi(foirHeadroomEmi, rate, tenure) : 0;

  const supportable = Math.max(0, Math.min(elig.useThis.high, foirCapAmount));
  const foirBinds = foirCapAmount < elig.useThis.high;

  // =======================================================================
  // A. Absolute blocks — no amount of this loan is a good idea today.
  // =======================================================================

  if (safeEmiHigh <= 0) {
    return fire(
      'DONT_BORROW',
      'safe.utilisation_of_surplus',
      'Do not take this loan.',
      `After your household costs and the EMIs you already pay, there is nothing ` +
        `left over each month. A new instalment would have to come out of money ` +
        `that is already spent, which is how a loan becomes a missed payment.`,
    );
  }

  const bounced = lo(facts.bouncesLast12m, 0) > 0;
  if (bounced && hasHighCostDebt(facts) && afford.surplus.low <= 0) {
    return fire(
      'DONT_BORROW',
      'verdict.thresholds',
      'Do not borrow more yet — clear what you are already carrying first.',
      `You missed an instalment in the last year, you are paying above ` +
        `${formatPct(VERDICT_THRESHOLDS.highCostDebtRatePct, 0)} on existing loans, and in a ` +
        `bad month there is nothing spare. Borrowing again now makes the next missed ` +
        `payment more likely, not less.`,
    );
  }

  if (supportable < floor) {
    // Nothing worth arranging. Say which side the wall is on — it changes what
    // the borrower should do about it.
    const lenderSideBlock = elig.lenderMax.high < floor;
    return fire(
      'DONT_BORROW',
      lenderSideBlock ? 'foir.ladder' : 'verdict.thresholds',
      'Do not take this loan.',
      lenderSideBlock
        ? `The EMIs you already pay use up everything a lender would allow against ` +
          `your countable income of ${formatINR(afford.assessedIncome.low)} a month, so ` +
          `there is nothing left to lend against. This is not about wanting it enough; ` +
          `the arithmetic closes before the application starts.`
        : `The most you could safely carry works out under ${formatINR(floor)} — too ` +
          `little to be worth arranging, and far below the ` +
          `${requested !== undefined ? formatINRCompact(requested) : 'amount'} you asked for.`,
    );
  }

  // =======================================================================
  // B. Amount rules — borrowing is fine, this size is not.
  // =======================================================================

  const suggested = band(Math.min(elig.useThis.low, supportable), supportable);

  if (requestedEmi !== undefined && requested !== undefined) {
    // B1 — the instalment is far beyond what the budget carries.
    if (requestedEmi > safeEmiHigh * VERDICT_THRESHOLDS.requestedToSafeEmiDontBorrow) {
      return fire(
        'BORROW_LESS',
        'verdict.thresholds',
        `Borrow less — around ${formatINRCompact(supportable)}, not ${formatINRCompact(requested)}.`,
        `${formatINRCompact(requested)} means ${formatINR(requestedEmi)} a month against a ` +
          `safe ceiling of ${formatINR(safeEmiHigh)} — half again more than your budget ` +
          `carries. At ${formatINRCompact(supportable)} the instalment fits.`,
        suggested,
      );
    }

    // B2 — total obligations would breach the hard ceiling in a bad month.
    const postLoanRatio = incomeLow > 0 ? (existingEmi + requestedEmi) / incomeLow : 0;
    if (postLoanRatio > VERDICT_THRESHOLDS.postLoanFoirHardStop) {
      return fire(
        'BORROW_LESS',
        'foir.hard_ceiling',
        `Borrow less — around ${formatINRCompact(supportable)}.`,
        `At ${formatINRCompact(requested)}, ${formatPct(postLoanRatio * 100, 0)} of your income ` +
          `in a slow month would go to fixed repayments. Past ` +
          `${formatPct(VERDICT_THRESHOLDS.postLoanFoirHardStop * 100, 0)} there is no room ` +
          `to absorb anything unexpected, and ${formatINRCompact(supportable)} keeps you under it.`,
        suggested,
      );
    }

    // B3 — borrowing to consume, with no cushion behind it.
    const savingsKnown = isKnown(facts.emergencySavingsMonths);
    if (
      !isProductive(facts.purpose) &&
      savingsKnown &&
      lo(facts.emergencySavingsMonths, 0) < VERDICT_THRESHOLDS.minEmergencyMonthsForConsumption &&
      requestedEmi > safeEmiHigh
    ) {
      return fire(
        'BORROW_LESS',
        'verdict.thresholds',
        `Borrow less, and build a buffer first.`,
        `You have under a month of expenses saved and this loan does not earn anything ` +
          `back. ${formatINRCompact(supportable)} is what your budget carries today; one ` +
          `month of cushion costs you far less than a missed EMI would.`,
        suggested,
      );
    }
  }

  // B4 — simply more than the capacity supports.
  if (requested !== undefined && supportable < requested * 0.9) {
    const reason = foirBinds
      ? `In a slow month, ${formatINRCompact(requested)} would push your fixed repayments past ` +
        `${formatPct(VERDICT_THRESHOLDS.postLoanFoirHardStop * 100, 0)} of income. ` +
        `${formatINRCompact(supportable)} stays inside it.`
      : elig.binding === 'borrower'
        ? `Your budget supports about ${formatINRCompact(supportable)} rather than the ` +
          `${formatINRCompact(requested)} you asked for. A lender may well offer you the full ` +
          `amount — that is them sizing the loan against your income, not against your life.`
        : `On this product a lender will advance about ${formatINRCompact(supportable)}, not ` +
          `the ${formatINRCompact(requested)} you asked for.`;

    return fire(
      'BORROW_LESS',
      'verdict.thresholds',
      `Borrow less — around ${formatINRCompact(supportable)}.`,
      reason,
      suggested,
    );
  }

  // =======================================================================
  // C. Yes.
  // =======================================================================

  const headline =
    requested !== undefined
      ? `You can borrow the ${formatINRCompact(requested)} you asked for.`
      : `You can borrow up to about ${formatINRCompact(supportable)}.`;

  /*
   * Never upsell.
   *
   * `supportable` is a ceiling, not a target. Ravi asked for ₹15 lakh and his
   * household supports close to ₹20 lakh, and an earlier version put the larger
   * figure on his card — a borrower-side tool telling someone to ask for more
   * than they came for has inverted its own purpose. When the answer is yes, the
   * recommendation is what they asked for; the headroom above it is theirs to
   * know about, not something we push them toward.
   */
  const recommend = requested !== undefined ? Math.min(requested, supportable) : supportable;

  return fire(
    'BORROW',
    'safe.utilisation_of_surplus',
    headline,
    `The instalment sits inside the ${formatINR(safeEmiHigh)} a month your budget supports` +
      `${ceil.stress.survivesBoth ? ', and it still holds if your income drops a fifth or the rate rises two points' : ''}. ` +
      `Take it on the terms on this card, not the first ones offered.`,
    band(Math.min(elig.useThis.low, recommend), recommend),
  );
}

/**
 * What to actually do next.
 *
 * Ordered by how much money each step is worth, which is usually the reverse of
 * how urgent it feels.
 */
function buildActions(
  facts: BorrowerFacts,
  product: ProductKind,
  routing: RoutingResult,
  elig: EligibilityResult,
): string[] {
  const actions: string[] = [];

  if (hasHighCostDebt(facts)) {
    const highCost = (facts.existingLoans ?? []).filter(
      (l) => l.highCost === true || hi(l.ratePct, 0) >= VERDICT_THRESHOLDS.highCostDebtRatePct,
    );
    const total = highCost.reduce((acc, l) => acc + lo(l.outstanding, 0), 0);
    // Quote the rate they are actually paying, not our threshold for caring.
    const worstRate = highCost.reduce((acc, l) => Math.max(acc, lo(l.ratePct, 0)), 0);
    actions.push(
      total > 0
        ? `Deal with the ${formatINR(total)} of app loans first — you are paying ` +
          `${worstRate > 0 ? `up to ${formatPct(worstRate, 0)}` : `over ${formatPct(VERDICT_THRESHOLDS.highCostDebtRatePct, 0)}`} ` +
          `on them. Refinancing that debt saves you more every month than this new loan could earn you.`
        : `Clear or consolidate the app loans first — they cost more than anything you are ` +
          `about to be offered.`,
    );
  }

  if (routing.redirected) {
    const config = PRODUCTS[product];
    actions.push(
      `Ask for a ${config.label.toLowerCase()}, not the product you were quoted.` +
        (config.secured
          ? ` Backing the loan with security you already own is worth more than any ` +
            `negotiation on an unsecured rate.`
          : ''),
    );
  }

  if (!isKnown(facts.creditScore)) {
    actions.push(
      `Check your credit score before you apply — it is free, it takes five minutes, and it ` +
        `is the cheapest way to narrow the rate you will be offered.`,
    );
  }

  if (lo(facts.bouncesLast12m, 0) > 0) {
    actions.push(
      `Put three to six clean months of payments on your record before applying. A recent ` +
        `missed EMI is the most expensive single item on your file right now.`,
    );
  }

  if (!isKnown(facts.emergencySavingsMonths) || lo(facts.emergencySavingsMonths, 0) < 1) {
    actions.push(
      `Build one month of expenses as a buffer. It is what turns a bad month into an ` +
        `inconvenience instead of a default.`,
    );
  }

  if (elig.binding === 'lender' && !isKnown(facts.coApplicantIncome)) {
    actions.push(
      `Adding a co-applicant would raise what a lender will advance, because their income ` +
        `is counted alongside yours.`,
    );
  }

  actions.push(
    `Ask every lender for the all-in APR in writing, not the interest rate. The fee is ` +
      `where the difference hides.`,
  );

  return actions;
}
