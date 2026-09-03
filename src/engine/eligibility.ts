/**
 * O2 — the two maximum amounts.
 *
 * `lenderMax` is what a lender will probably put in a sanction letter.
 * `safeMax` is what the borrower can carry without living on the edge.
 *
 * They are computed from different capacities, at different rates, over
 * different tenures — the lender at their longest tenure and best rate because
 * that maximises the number they can advertise, the borrower at a prudent tenure
 * and the *top* of the rate band because that is what they may actually be
 * charged. Showing only the first number is how a borrower ends up stretched.
 */

import { PRODUCTS, RETIREMENT_AGE } from './rulebook';
import type { BorrowerFacts, ProductKind } from './facts';
import { band, principalFromEmi, type Band } from './emi';
import { formatINR, formatINRCompact, formatMonths, type TraceStep } from './trace';
import { tenureCapByAge } from './products';
import type { AffordabilityResult } from './affordability';
import type { PricingResult } from './pricing';

export interface EligibilityResult {
  lenderMax: Band;
  safeMax: Band;
  /** Which of the two is the real limit — almost always the one to use. */
  binding: 'lender' | 'borrower';
  /** The smaller of the two: what the borrower should actually work with. */
  useThis: Band;
  lenderTenureMonths: number;
  safeTenureMonths: number;
  /** Ceiling imposed by collateral or the product's own ticket limit. */
  productCapRupees: number;
  steps: TraceStep[];
}

/** Longest tenure a lender would write, after the age cap. */
export function lenderTenure(facts: BorrowerFacts, product: ProductKind): number {
  const config = PRODUCTS[product];
  const retirement = RETIREMENT_AGE[facts.incomeType ?? 'salaried'];
  const ageCap = tenureCapByAge(facts, retirement);
  return Math.max(
    config.minTenureMonths,
    Math.min(config.maxTenureMonths, ageCap ?? config.maxTenureMonths),
  );
}

/** Tenure we are willing to recommend — shorter, because interest compounds. */
export function prudentTenure(facts: BorrowerFacts, product: ProductKind): number {
  const config = PRODUCTS[product];
  const retirement = RETIREMENT_AGE[facts.incomeType ?? 'salaried'];
  const ageCap = tenureCapByAge(facts, retirement);
  return Math.max(
    config.minTenureMonths,
    Math.min(config.prudentTenureMonths, ageCap ?? config.prudentTenureMonths),
  );
}

export function eligibility(
  facts: BorrowerFacts,
  product: ProductKind,
  afford: AffordabilityResult,
  price: PricingResult,
  productCapRupees: number,
): EligibilityResult {
  const steps: TraceStep[] = [];
  const config = PRODUCTS[product];

  const lenderMonths = lenderTenure(facts, product);
  const safeMonths = prudentTenure(facts, product);

  // Lender: longest tenure, and the rate they would lead with.
  const lenderRaw = band(
    principalFromEmi(afford.lenderEmi.low, price.rateBand.high, lenderMonths),
    principalFromEmi(afford.lenderEmi.high, price.rateBand.low, lenderMonths),
  );

  const cap = Math.min(productCapRupees, config.maxAmountRupees);
  const lenderMax = band(Math.min(lenderRaw.low, cap), Math.min(lenderRaw.high, cap));

  steps.push({
    ruleId: 'foir.ladder',
    label: 'What a lender will sanction',
    detail:
      `${formatINR(afford.lenderEmi.high)} a month over ${formatMonths(lenderMonths)} ` +
      `supports about ${formatINRCompact(lenderMax.high)}.`,
    value: lenderMax.high,
    unit: 'rupees',
  });

  if (lenderRaw.high > cap) {
    steps.push({
      ruleId: 'products.catalogue',
      label: 'Capped by security',
      detail:
        `Your income supports more, but this product will not lend beyond ` +
        `${formatINRCompact(cap)} against what you can pledge.`,
      value: cap,
      unit: 'rupees',
    });
  }

  // Borrower: prudent tenure, and the top of the rate band. If they end up at
  // the good end of the band, they get a pleasant surprise rather than a shock.
  const safeMax = band(
    Math.min(principalFromEmi(afford.safeEmi.low, price.rateBand.high, safeMonths), cap),
    Math.min(principalFromEmi(afford.safeEmi.high, price.rateBand.high, safeMonths), cap),
  );

  steps.push({
    ruleId: 'safe.utilisation_of_surplus',
    label: 'What you can safely carry',
    detail:
      `${formatINR(afford.safeEmi.high)} a month over ${formatMonths(safeMonths)} ` +
      `at the top of your rate band comes to about ${formatINRCompact(safeMax.high)}.`,
    value: safeMax.high,
    unit: 'rupees',
  });

  const binding: 'lender' | 'borrower' = safeMax.high <= lenderMax.high ? 'borrower' : 'lender';
  const useThis = band(
    Math.min(lenderMax.low, safeMax.low),
    Math.min(lenderMax.high, safeMax.high),
  );

  steps.push({
    label: 'Which number to use',
    detail:
      binding === 'borrower'
        ? `A lender may well offer you ${formatINRCompact(lenderMax.high)}. Your own budget ` +
          `supports ${formatINRCompact(safeMax.high)}. Use the smaller number — the lender is ` +
          `sizing the loan against your income, not against your life.`
        : `Your budget could carry ${formatINRCompact(safeMax.high)}, but a lender will only ` +
          `advance about ${formatINRCompact(lenderMax.high)} on this product. That ceiling is ` +
          `the binding one.`,
    value: useThis.high,
    unit: 'rupees',
  });

  return {
    lenderMax,
    safeMax,
    binding,
    useThis,
    lenderTenureMonths: lenderMonths,
    safeTenureMonths: safeMonths,
    productCapRupees: cap,
    steps,
  };
}
