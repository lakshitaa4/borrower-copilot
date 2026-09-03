/**
 * The two affordability models.
 *
 * These are deliberately *different calculations*, not one number and a haircut.
 * That is the whole point of the product:
 *
 *   - The lender asks "what ratio of provable income can I commit?" — FOIR.
 *   - The borrower should ask "what is actually left after I live?" — surplus.
 *
 * They disagree because they are measuring different things. For Priya the
 * lender's answer is far higher than her own. For Anita the lender's answer is
 * small and hers is negative. Reporting only one of them is how borrowers end up
 * at 65% of income.
 */

import {
  NO_SURPLUS_NO_CAPACITY,
  FOIR_LADDER,
  FOIR_ADJUSTMENTS,
  FOIR_HARD_CEILING,
  INCOME_RECOGNITION,
  CO_APPLICANT_INCOME_WEIGHT,
  SAVINGS_FLOOR_PCT,
  DEPENDANT_BUFFER_RUPEES,
  SAFE_UTILISATION_OF_SURPLUS,
  EMERGENCY_FUND,
  VARIABLE_INCOME_HAIRCUT,
  PRODUCTIVE_GAIN_HAIRCUT,
  PRODUCTS,
} from './rulebook';
import {
  type BorrowerFacts,
  type ProductKind,
  hasHighCostDebt,
  hi,
  householdIncome,
  isKnown,
  isProductive,
  lo,
  totalExistingEmi,
} from './facts';
import { band, type Band } from './emi';
import { formatINR, formatPct, type TraceStep } from './trace';

/**
 * A value we had to invent because the borrower did not supply it. Surfaced in
 * the UI so the app says where it is guessing, and ranked highly by the
 * value-of-information engine so we stop having to guess.
 */
export interface Assumption {
  fact: string;
  assumed: Band;
  note: string;
}

export interface AffordabilityResult {
  /** Income the lender will actually underwrite — often far below what is earned. */
  assessedIncome: Band;
  foirCeiling: Band;
  /** Instalment a lender would be willing to sanction against. */
  lenderEmi: Band;
  /** What is genuinely left over each month after living costs. */
  surplus: Band;
  /** Instalment the borrower can carry without living on the edge. */
  safeEmi: Band;
  assumptions: Assumption[];
  lenderTrace: TraceStep[];
  safeTrace: TraceStep[];
}

// ---------------------------------------------------------------------------
// Lender side
// ---------------------------------------------------------------------------

/** The FOIR rung this income sits on. */
export function foirForIncome(monthlyIncome: number): number {
  const rung = FOIR_LADDER.find((r) => monthlyIncome >= r.minIncome);
  return rung?.foir ?? 0.4;
}

/**
 * How much of the stated income a lender will underwrite.
 *
 * This is where Ravi's assessment is decided: he earns ₹40,000-80,000 in cash
 * and files ₹4,20,000 a year, so a lender works with ₹35,000 a month. Nothing
 * about him is dishonest; the income simply has no trail.
 */
export function assessedIncome(facts: BorrowerFacts): {
  value: Band;
  steps: TraceStep[];
} {
  const steps: TraceStep[] = [];
  const type = facts.incomeType ?? 'salaried';
  const statedLow = lo(facts.netMonthlyIncome, 0);
  const statedHigh = hi(facts.netMonthlyIncome, 0);

  let low = 0;
  let high = 0;

  if (type === 'salaried') {
    low = statedLow * INCOME_RECOGNITION.salaried;
    high = statedHigh * INCOME_RECOGNITION.salaried;
    steps.push({
      ruleId: 'income.recognition',
      label: 'Income a lender will count',
      detail: `Your salary is credited to a bank account every month, so all of it counts.`,
      value: high,
      unit: 'rupees',
    });
  } else if (type === 'self_employed') {
    const documentedMonthly = isKnown(facts.documentedIncomeAnnual)
      ? lo(facts.documentedIncomeAnnual, 0) / 12
      : undefined;

    if (documentedMonthly !== undefined) {
      const uplift = facts.hasBankStatements
        ? INCOME_RECOGNITION.selfEmployedBankingUplift
        : INCOME_RECOGNITION.selfEmployedDocumented;
      low = documentedMonthly * INCOME_RECOGNITION.selfEmployedDocumented;
      high = documentedMonthly * uplift;
      steps.push({
        ruleId: 'income.recognition',
        label: 'Income a lender will count',
        detail:
          `A lender underwrites what you can prove. Your filed return shows ` +
          `${formatINR(documentedMonthly)} a month` +
          (facts.hasBankStatements
            ? `, and bank statements support up to ${formatINR(high)}.`
            : `, so that is the figure they will work with — not what the shop actually takes.`),
        value: documentedMonthly,
        unit: 'rupees',
      });
    } else {
      low = statedLow * INCOME_RECOGNITION.informal;
      high = statedHigh * INCOME_RECOGNITION.informal;
      steps.push({
        ruleId: 'income.recognition',
        label: 'Income a lender will count',
        detail:
          `Without a filed return we have assumed a lender counts about ` +
          `${formatPct(INCOME_RECOGNITION.informal * 100, 0)} of what you told us.`,
        value: high,
        unit: 'rupees',
      });
    }
  } else {
    low = statedLow * INCOME_RECOGNITION.informal;
    high = statedHigh * INCOME_RECOGNITION.informal;
    steps.push({
      ruleId: 'income.recognition',
      label: 'Income a lender will count',
      detail:
        `Platform and cash earnings have no payslip behind them, so a lender ` +
        `counts roughly ${formatPct(INCOME_RECOGNITION.informal * 100, 0)} of them.`,
      value: high,
      unit: 'rupees',
    });
  }

  if (isKnown(facts.coApplicantIncome)) {
    const coLow = lo(facts.coApplicantIncome, 0) * CO_APPLICANT_INCOME_WEIGHT;
    const coHigh = hi(facts.coApplicantIncome, 0) * CO_APPLICANT_INCOME_WEIGHT;
    low += coLow;
    high += coHigh;
    steps.push({
      ruleId: 'income.co_applicant_weight',
      label: 'Co-applicant income',
      detail: `A co-applicant is jointly liable, so their ${formatINR(coHigh)} is added in full.`,
      value: coHigh,
      unit: 'rupees',
    });
  }

  return { value: band(low, high), steps };
}

/** The FOIR ceiling this borrower faces, after policy adjustments. */
export function foirCeiling(
  facts: BorrowerFacts,
  income: Band,
  product: ProductKind,
): { value: Band; steps: TraceStep[] } {
  const steps: TraceStep[] = [];
  const secured = PRODUCTS[product].secured;

  const apply = (baseIncome: number): number => {
    let foir = foirForIncome(baseIncome);
    if (facts.incomeType === 'informal') foir += FOIR_ADJUSTMENTS.informalIncome;
    if (facts.incomeType === 'self_employed') foir += FOIR_ADJUSTMENTS.selfEmployed;
    if (!isKnown(facts.creditScore)) foir += FOIR_ADJUSTMENTS.noCreditHistory;
    if (secured) foir += FOIR_ADJUSTMENTS.securedProduct;
    if (lo(facts.bouncesLast12m, 0) > 0) foir += FOIR_ADJUSTMENTS.recentBounce;
    if (hasHighCostDebt(facts)) foir += FOIR_ADJUSTMENTS.highCostDebt;
    return Math.max(0.15, Math.min(FOIR_HARD_CEILING, foir));
  };

  const low = apply(income.low);
  const high = apply(income.high);

  const reasons: string[] = [];
  if (facts.incomeType === 'informal') reasons.push('income has no formal proof');
  if (facts.incomeType === 'self_employed') reasons.push('income is self-employed');
  if (!isKnown(facts.creditScore)) reasons.push('there is no credit score on file');
  if (secured) reasons.push('the loan is backed by security');
  if (lo(facts.bouncesLast12m, 0) > 0) reasons.push('an EMI bounced in the last year');
  if (hasHighCostDebt(facts)) reasons.push('there is high-cost debt outstanding');

  steps.push({
    ruleId: 'foir.ladder',
    label: 'FOIR ceiling',
    detail:
      `Lenders cap total EMIs at ${formatPct(high * 100, 0)} of countable income` +
      (reasons.length > 0 ? `, adjusted because ${reasons.join(', ')}.` : '.'),
    value: high * 100,
    unit: 'pct',
  });

  return { value: band(low, high), steps };
}

// ---------------------------------------------------------------------------
// Borrower side
// ---------------------------------------------------------------------------

/**
 * Household expenses, assumed if not given.
 *
 * The assumed band is wide on purpose: guessing narrowly would be pretending to
 * know. The value-of-information engine will push this question to the top
 * precisely because the band is so wide.
 */
function householdExpenses(
  facts: BorrowerFacts,
  income: Band,
  assumptions: Assumption[],
): Band {
  if (isKnown(facts.householdExpenses)) {
    return band(lo(facts.householdExpenses, 0), hi(facts.householdExpenses, 0));
  }
  const assumed = band(income.low * 0.35, income.high * 0.55);
  assumptions.push({
    fact: 'householdExpenses',
    assumed,
    note:
      'You have not told us what the household spends each month, so we have ' +
      'assumed 35-55% of income. This is the widest guess in your assessment.',
  });
  return assumed;
}

function rent(facts: BorrowerFacts, income: Band, assumptions: Assumption[]): Band {
  if (isKnown(facts.rent)) return band(lo(facts.rent, 0), hi(facts.rent, 0));
  const assumed = band(0, income.high * 0.25);
  assumptions.push({
    fact: 'rent',
    assumed,
    note: 'We do not know if you pay rent, so we have allowed for anything up to 25% of income.',
  });
  return assumed;
}

/**
 * What is genuinely spare each month.
 *
 * Uses the *low* end of a variable income throughout: a borrower has to make the
 * payment in a bad month, not an average one.
 */
export function safeCapacity(
  facts: BorrowerFacts,
  assumptions: Assumption[],
): { surplus: Band; safeEmi: Band; steps: TraceStep[] } {
  const steps: TraceStep[] = [];

  // A co-applicant is in the same household, so their earnings are spendable
  // here as well as countable by the lender. Leaving them out of the surplus
  // model made a co-applicant look like it helped only the lender's arithmetic,
  // which is wrong twice over: it understates what the household can carry, and
  // it hid the fact that a joint application is Anita's one genuine route.
  const ownLow = lo(facts.netMonthlyIncome, 0);
  const household = householdIncome(facts);
  const incomeLow = household.low;
  const incomeHigh = household.high;
  const income = band(incomeLow, incomeHigh);

  // Variable income is discounted, in proportion to how much of it varies —
  // and only the borrower's own income, since the variability they described is
  // theirs. Applying it to the combined figure discounted a co-applicant's
  // steady salary as if it fluctuated too.
  const variableShare = Math.min(1, Math.max(0, lo(facts.variableIncomeShare, 0)));
  const volatilityCut = ownLow * variableShare * VARIABLE_INCOME_HAIRCUT;
  if (volatilityCut > 0) {
    steps.push({
      ruleId: 'safe.variable_income_haircut',
      label: 'Variable income discount',
      detail:
        `${formatPct(variableShare * 100, 0)} of your income varies month to month, ` +
        `so we set aside ${formatINR(volatilityCut)} of it.`,
      value: volatilityCut,
      unit: 'rupees',
    });
  }

  const expenses = householdExpenses(facts, income, assumptions);
  const rentBand = rent(facts, income, assumptions);
  const existingEmi = totalExistingEmi(facts);
  const emiLow = lo(existingEmi, 0);
  const emiHigh = hi(existingEmi, 0);

  const savingsFloorLow = incomeLow * SAVINGS_FLOOR_PCT;
  const savingsFloorHigh = incomeHigh * SAVINGS_FLOOR_PCT;

  const dependants = Math.max(0, lo(facts.dependants, 0));
  const dependantBuffer = dependants * DEPENDANT_BUFFER_RUPEES;

  const upcoming = lo(facts.upcomingExpenseMonthly, 0);

  // Low bound of surplus pairs the worst income with the worst costs.
  const surplusLow =
    incomeLow -
    volatilityCut -
    expenses.high -
    rentBand.high -
    emiHigh -
    savingsFloorLow -
    dependantBuffer -
    upcoming;
  const surplusHigh =
    incomeHigh -
    volatilityCut -
    expenses.low -
    rentBand.low -
    emiLow -
    savingsFloorHigh -
    dependantBuffer -
    upcoming;

  const surplus = band(surplusLow, surplusHigh);

  steps.push({
    ruleId: 'safe.savings_floor_pct',
    label: 'What is actually left',
    detail:
      `From ${formatINR(incomeLow)} you subtract ${formatINR(expenses.high)} of living costs, ` +
      (rentBand.high > 0 ? `${formatINR(rentBand.high)} rent, ` : '') +
      (emiHigh > 0 ? `${formatINR(emiHigh)} of EMIs you already pay, ` : '') +
      `and ${formatINR(savingsFloorLow)} kept back for saving` +
      (dependantBuffer > 0
        ? `, plus ${formatINR(dependantBuffer)} for ${dependants} dependant${dependants === 1 ? '' : 's'}`
        : '') +
      `. That leaves ${formatINR(Math.max(0, surplusLow))}.`,
    value: surplusLow,
    unit: 'rupees',
  });

  // Only part of the surplus may go to an EMI — the rest is the margin.
  let safeLow = surplus.low * SAFE_UTILISATION_OF_SURPLUS;
  let safeHigh = surplus.high * SAFE_UTILISATION_OF_SURPLUS;

  steps.push({
    ruleId: 'safe.utilisation_of_surplus',
    label: 'Safe share of the surplus',
    detail:
      `We commit only ${formatPct(SAFE_UTILISATION_OF_SURPLUS * 100, 0)} of what is left, ` +
      `so an unexpected month does not become a missed payment.`,
    value: SAFE_UTILISATION_OF_SURPLUS * 100,
    unit: 'pct',
  });

  // No savings buffer means less room to absorb a shock.
  const savingsMonths = facts.emergencySavingsMonths;
  if (isKnown(savingsMonths)) {
    const months = lo(savingsMonths, 0);
    let haircut = 0;
    if (months < 1) haircut = EMERGENCY_FUND.haircutBelowOneMonth;
    else if (months < EMERGENCY_FUND.targetMonths) haircut = EMERGENCY_FUND.haircutBelowTarget;
    if (haircut > 0) {
      safeLow *= 1 - haircut;
      safeHigh *= 1 - haircut;
      steps.push({
        ruleId: 'safe.emergency_fund',
        label: 'Emergency savings',
        detail:
          `You have under ${months < 1 ? 'a month' : `${EMERGENCY_FUND.targetMonths} months`} ` +
          `of expenses saved, so we cut the safe instalment by ` +
          `${formatPct(haircut * 100, 0)} — there is no cushion behind it.`,
        value: haircut * 100,
        unit: 'pct',
      });
    }
  }

  // A loan that earns money may carry a little more, heavily discounted.
  if (isProductive(facts.purpose) && isKnown(facts.productiveMonthlyGain)) {
    const gain = lo(facts.productiveMonthlyGain, 0) * PRODUCTIVE_GAIN_HAIRCUT;
    if (gain > 0) {
      safeLow += gain;
      safeHigh += gain;
      steps.push({
        ruleId: 'safe.productive_gain_haircut',
        label: 'What the loan earns',
        detail:
          `This loan should earn money, so we add ` +
          `${formatPct(PRODUCTIVE_GAIN_HAIRCUT * 100, 0)} of the ` +
          `${formatINR(lo(facts.productiveMonthlyGain, 0))} you expect — ` +
          `half, because the EMI starts before the earnings do.`,
        value: gain,
        unit: 'rupees',
      });
    }
  }

  // No surplus, no capacity — and this overrides the productive-loan credit
  // above, because earnings from a loan not yet taken cannot service an
  // instalment that starts immediately. Without it, a household spending more
  // than it earns was credited with a positive ceiling out of a projection.
  if (NO_SURPLUS_NO_CAPACITY && surplus.high <= 0) {
    safeLow = 0;
    safeHigh = 0;
    steps.push({
      ruleId: 'safe.no_surplus_no_capacity',
      label: 'Nothing spare to pay from',
      detail:
        `Even in a good month the household spends more than it earns, so there ` +
        `is no room for an instalment at all — whatever this loan might go on to ` +
        `earn, the payments start before the earnings do.`,
      value: 0,
      unit: 'rupees',
    });
  }

  return {
    surplus,
    safeEmi: band(Math.max(0, safeLow), Math.max(0, safeHigh)),
    steps,
  };
}

// ---------------------------------------------------------------------------
// Both together
// ---------------------------------------------------------------------------

export function affordability(
  facts: BorrowerFacts,
  product: ProductKind,
): AffordabilityResult {
  const assumptions: Assumption[] = [];

  const income = assessedIncome(facts);
  const foir = foirCeiling(facts, income.value, product);

  const existingEmi = totalExistingEmi(facts);
  const emiLow = lo(existingEmi, 0);
  const emiHigh = hi(existingEmi, 0);

  const lenderEmi = band(
    Math.max(0, foir.value.low * income.value.low - emiHigh),
    Math.max(0, foir.value.high * income.value.high - emiLow),
  );

  const lenderTrace: TraceStep[] = [...income.steps, ...foir.steps];
  lenderTrace.push({
    ruleId: 'foir.ladder',
    label: 'Instalment a lender would allow',
    detail:
      `${formatPct(foir.value.high * 100, 0)} of ${formatINR(income.value.high)} ` +
      (emiHigh > 0
        ? `less the ${formatINR(emiHigh)} you already pay `
        : '') +
      `leaves ${formatINR(lenderEmi.high)} a month for a new loan.`,
    value: lenderEmi.high,
    unit: 'rupees',
  });

  const safe = safeCapacity(facts, assumptions);

  return {
    assessedIncome: income.value,
    foirCeiling: foir.value,
    lenderEmi,
    surplus: safe.surplus,
    safeEmi: safe.safeEmi,
    assumptions,
    lenderTrace,
    safeTrace: safe.steps,
  };
}
