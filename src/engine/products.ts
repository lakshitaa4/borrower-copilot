/**
 * Product routing.
 *
 * The borrower arrives asking for a product they have heard of. Often that is
 * the wrong one, and the difference is not marginal: Ravi asking for ₹15,00,000
 * as an unsecured business loan is looking at 19-25%, while the same ₹15,00,000
 * against the shop he already owns outright is 10-14%. No amount of negotiating
 * on the unsecured rate gets him to the secured one.
 *
 * So the engine takes the *purpose* and the assets, and picks the cheapest
 * product that can actually deliver the money — then says why it moved them.
 */

import { PRODUCTS, RATE_BANDS, type Grade } from './rulebook';
import {
  type BorrowerFacts,
  type LoanPurpose,
  type ProductKind,
  hi,
  isKnown,
  lo,
  usableCollateral,
} from './facts';
import { formatINRCompact, formatPct, type TraceStep } from './trace';
import type { GradeRange } from './pricing';

export interface ProductOption {
  product: ProductKind;
  label: string;
  secured: boolean;
  /** Most this product could lend, given collateral and product ceilings. */
  capacityRupees: number;
  /** Can it deliver the amount the borrower actually asked for? */
  coversRequest: boolean;
  /** Indicative mid-rate for this borrower, used only for ranking. */
  indicativeRatePct: number;
  reason: string;
}

export interface RoutingResult {
  recommended: ProductKind;
  /** True when we moved the borrower off what they asked for. */
  redirected: boolean;
  requested?: ProductKind;
  options: ProductOption[];
  steps: TraceStep[];
}

/** Which products are even worth considering for this purpose. */
function candidatesFor(
  purpose: LoanPurpose | undefined,
  facts: BorrowerFacts,
  amountRupees: number,
): ProductKind[] {
  const collateral = usableCollateral(facts);
  const hasProperty =
    facts.collateralType === 'property' && lo(collateral, 0) > 0;
  const hasGold = facts.collateralType === 'gold' && lo(collateral, 0) > 0;

  const list: ProductKind[] = [];

  switch (purpose) {
    case 'home_purchase':
      list.push('home');
      break;

    case 'business_expansion':
      if (hasProperty) list.push('lap', 'business_secured');
      if (hasGold) list.push('gold');
      list.push('business_unsecured');
      break;

    case 'vehicle_productive':
    case 'vehicle_personal':
      if (amountRupees <= PRODUCTS.two_wheeler.maxAmountRupees) list.push('two_wheeler');
      if (hasGold) list.push('gold');
      list.push('personal');
      break;

    default:
      if (hasGold) list.push('gold');
      if (hasProperty && amountRupees >= PRODUCTS.lap.minAmountRupees) list.push('lap');
      list.push('personal');
      break;
  }

  return [...new Set(list)];
}

/** "a" or "an", so generated sentences do not read as machine output. */
function article(word: string): string {
  return /^[aeiou]/i.test(word.trim()) ? 'an' : 'a';
}

function midRateFor(product: ProductKind, grades: GradeRange): number {
  const bands = RATE_BANDS[product];
  const best = bands[grades.best as Grade];
  const worst = bands[grades.worst as Grade];
  return (best[0] + worst[1]) / 2;
}

/** How much this product could actually advance, given security and ceilings. */
function capacityFor(product: ProductKind, facts: BorrowerFacts): number {
  const config = PRODUCTS[product];
  let cap = config.maxAmountRupees;

  // An LTV cap only bites against collateral the borrower already owns. For a
  // home or a vehicle the asset being financed is itself the security, so the
  // cap constrains the loan-to-price ratio at purchase, not their net worth.
  if (config.maxLtvPct !== undefined && config.securedByPurchase !== true) {
    const collateral = usableCollateral(facts);
    // Secured lending needs security. No collateral, no capacity.
    const value = isKnown(collateral) ? lo(collateral, 0) : 0;
    cap = Math.min(cap, (value * config.maxLtvPct) / 100);
  }

  return Math.max(0, cap);
}

export function routeProduct(
  facts: BorrowerFacts,
  grades: GradeRange,
  amountRupees: number,
): RoutingResult {
  const steps: TraceStep[] = [];
  const requested = facts.productWanted;
  const candidates = candidatesFor(facts.purpose, facts, amountRupees);

  const options: ProductOption[] = candidates.map((product) => {
    const config = PRODUCTS[product];
    const capacity = capacityFor(product, facts);
    const coversRequest = capacity >= amountRupees && amountRupees >= config.minAmountRupees;
    const rate = midRateFor(product, grades);

    let reason: string;
    if (product === 'two_wheeler') {
      reason = 'The vehicle itself is the security, which is why it prices below a personal loan.';
    } else if (config.secured && config.maxLtvPct !== undefined) {
      const collateralValue = lo(usableCollateral(facts), 0);
      reason = collateralValue > 0
        ? `Backed by security worth ${formatINRCompact(collateralValue)}, lending up to ${config.maxLtvPct}% of it.`
        : 'Needs security you have not told us about.';
    } else {
      reason = 'No security needed, which is why it is the most expensive way to borrow.';
    }

    return {
      product,
      label: config.label,
      secured: config.secured,
      capacityRupees: capacity,
      coversRequest,
      indicativeRatePct: rate,
      reason,
    };
  });

  // Cheapest product that can actually deliver the money wins. If nothing can
  // cover the request, fall back to whichever advances the most.
  const viable = options.filter((o) => o.coversRequest);
  const ranked = [...(viable.length > 0 ? viable : options)].sort((a, b) => {
    if (viable.length === 0 && b.capacityRupees !== a.capacityRupees) {
      return b.capacityRupees - a.capacityRupees;
    }
    return a.indicativeRatePct - b.indicativeRatePct;
  });

  const recommended = ranked[0]?.product ?? 'personal';
  const redirected = requested !== undefined && requested !== recommended;

  const best = ranked[0];
  if (best) {
    steps.push({
      ruleId: 'products.catalogue',
      label: 'Product',
      detail: `${best.label}: ${best.reason}`,
      value: best.indicativeRatePct,
      unit: 'pct',
    });
  }

  // Guarded: a product value we do not recognise must not crash the engine.
  if (redirected && requested && PRODUCTS[requested] !== undefined) {
    const previous = options.find((o) => o.product === requested);
    const saving = previous ? previous.indicativeRatePct - (best?.indicativeRatePct ?? 0) : 0;
    steps.push({
      ruleId: 'products.catalogue',
      label: 'Why not what you asked for',
      detail:
        `You asked about ${article(PRODUCTS[requested].label)} ` +
        `${PRODUCTS[requested].label.toLowerCase()}. ` +
        (saving > 0.5
          ? `A ${best?.label.toLowerCase()} should cost you about ${formatPct(saving)} less a year on the same amount.`
          : `A ${best?.label.toLowerCase()} fits your situation better.`),
      value: saving > 0 ? saving : undefined,
      unit: 'pp',
    });
  }

  return { recommended, redirected, requested, options: ranked, steps };
}

/** Tenure cap imposed by the borrower's age, per the retirement rule. */
export function tenureCapByAge(facts: BorrowerFacts, retirementAge: number): number | undefined {
  if (!isKnown(facts.age)) return undefined;
  const age = hi(facts.age, 0);
  const years = Math.max(0, retirementAge - age);
  return Math.round(years * 12);
}
