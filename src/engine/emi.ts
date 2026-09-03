/**
 * Loan arithmetic: EMI, present value, and the all-in APR.
 *
 * The one thing here that is not textbook is `allInApr`. The common shortcut —
 * adding the processing fee percentage to the interest rate — is wrong, and
 * wrong in the lender's favour. A fee is paid once, up front, out of the amount
 * disbursed; interest accrues on a reducing balance over years. The only honest
 * comparison is the internal rate of return on the actual cashflows, which is
 * what the Key Fact Statement means by APR.
 */

import { PRODUCTS, GRADE_SPREAD_WIDENING_PP } from './rulebook';
import type { ProductKind } from './facts';

/** Monthly rate from an annual percentage. 12% p.a. -> 0.01. */
export function monthlyRate(annualRatePct: number): number {
  return annualRatePct / 1200;
}

/** Equated monthly instalment for a reducing-balance loan. */
export function emi(principal: number, annualRatePct: number, months: number): number {
  if (months <= 0) return 0;
  const r = monthlyRate(annualRatePct);
  if (r === 0) return principal / months;
  const growth = Math.pow(1 + r, months);
  return (principal * r * growth) / (growth - 1);
}

/**
 * The loan a given EMI can support — the inverse of `emi`, and the function
 * that turns an affordability ceiling into a rupee amount.
 */
export function principalFromEmi(
  emiAmount: number,
  annualRatePct: number,
  months: number,
): number {
  if (months <= 0 || emiAmount <= 0) return 0;
  const r = monthlyRate(annualRatePct);
  if (r === 0) return emiAmount * months;
  return (emiAmount * (1 - Math.pow(1 + r, -months))) / r;
}

export function totalRepaid(emiAmount: number, months: number): number {
  return emiAmount * months;
}

export function totalInterest(
  principal: number,
  annualRatePct: number,
  months: number,
): number {
  return totalRepaid(emi(principal, annualRatePct, months), months) - principal;
}

// ---------------------------------------------------------------------------
// All-in APR
// ---------------------------------------------------------------------------

export interface AprInput {
  amountRupees: number;
  annualRatePct: number;
  tenureMonths: number;
  /** Processing fee as a percentage of the sanctioned amount. */
  processingFeePct?: number;
  /** Insurance or other charges deducted from the disbursal, in rupees. */
  bundledChargesRupees?: number;
}

export interface AprResult {
  /** The instalment, which the fee does not change. */
  emi: number;
  /** What actually reaches the borrower's account. */
  netDisbursed: number;
  feesRupees: number;
  /** All-in APR, annualised the same way a quoted rate is (monthly x 12). */
  aprPct: number;
  /** The same cost compounded — always a little higher than the APR. */
  effectiveAnnualPct: number;
  /** How much dearer the loan is than its headline rate, in points. */
  aprOverHeadlinePp: number;
  totalCostRupees: number;
}

/**
 * All-in APR, solved as the IRR of the borrower's actual cashflows: they receive
 * the amount net of every charge, then pay the EMI computed on the gross amount.
 *
 * Annualised nominally (monthly rate x 12) so it is directly comparable with the
 * quoted rate, which is expressed the same way. The compounded figure is
 * returned separately rather than substituted, because quietly switching
 * conventions would overstate the gap.
 */
export function allInApr(input: AprInput): AprResult {
  const {
    amountRupees,
    annualRatePct,
    tenureMonths,
    processingFeePct = 0,
    bundledChargesRupees = 0,
  } = input;

  const instalment = emi(amountRupees, annualRatePct, tenureMonths);
  const fees = (amountRupees * processingFeePct) / 100 + bundledChargesRupees;
  const netDisbursed = amountRupees - fees;

  const monthly = solveIrr(netDisbursed, instalment, tenureMonths);
  const aprPct = monthly * 1200;

  return {
    emi: instalment,
    netDisbursed,
    feesRupees: fees,
    aprPct,
    effectiveAnnualPct: (Math.pow(1 + monthly, 12) - 1) * 100,
    aprOverHeadlinePp: aprPct - annualRatePct,
    totalCostRupees: totalRepaid(instalment, tenureMonths) - netDisbursed,
  };
}

/**
 * Monthly IRR by bisection: find r where the present value of the instalments
 * equals what the borrower actually received.
 *
 * Present value falls monotonically as r rises, so bisection is guaranteed to
 * converge — no derivative, no divergence, no starting-guess sensitivity.
 */
function solveIrr(netDisbursed: number, instalment: number, months: number): number {
  if (netDisbursed <= 0 || instalment <= 0 || months <= 0) return 0;

  // No solution above this: even at r=0 the borrower repays instalment*months,
  // so if that is already below what they received the inputs are incoherent.
  if (instalment * months <= netDisbursed) return 0;

  let low = 0;
  let high = 1; // 100% per month, far beyond any real loan
  for (let i = 0; i < 200; i++) {
    const mid = (low + high) / 2;
    const pv = pvOfAnnuity(instalment, mid, months);
    if (pv > netDisbursed) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

function pvOfAnnuity(instalment: number, monthly: number, months: number): number {
  if (monthly === 0) return instalment * months;
  return (instalment * (1 - Math.pow(1 + monthly, -months))) / monthly;
}

// ---------------------------------------------------------------------------
// Tenure trade-off
// ---------------------------------------------------------------------------

export interface TenureOption {
  months: number;
  emi: number;
  totalInterest: number;
  /** True when this tenure is within the product's allowed range. */
  available: boolean;
}

/**
 * The trade-off the lender has no incentive to show: a longer tenure always
 * lowers the instalment and always raises the total cost.
 */
export function tenureTable(
  principal: number,
  annualRatePct: number,
  product: ProductKind,
  candidateMonths?: readonly number[],
): TenureOption[] {
  const config = PRODUCTS[product];
  const candidates =
    candidateMonths ??
    [12, 24, 36, 48, 60, 84, 120, 180, 240, 360].filter(
      (m) => m >= config.minTenureMonths && m <= config.maxTenureMonths,
    );

  return candidates.map((months) => ({
    months,
    emi: emi(principal, annualRatePct, months),
    totalInterest: totalInterest(principal, annualRatePct, months),
    available: months >= config.minTenureMonths && months <= config.maxTenureMonths,
  }));
}

// ---------------------------------------------------------------------------
// Bands
// ---------------------------------------------------------------------------

/** A low-high pair carried through the engine wherever certainty is absent. */
export interface Band {
  low: number;
  high: number;
}

export function band(low: number, high: number): Band {
  return low <= high ? { low, high } : { low: high, high: low };
}

export function widenBand(b: Band, factor: number): Band {
  const centre = (b.low + b.high) / 2;
  const half = ((b.high - b.low) / 2) * factor;
  return band(centre - half, centre + half);
}

/** Widen by an absolute amount on each side — used for the unknown-score penalty. */
export function padBand(b: Band, pad: number): Band {
  return band(b.low - pad, b.high + pad);
}

export function clampBand(b: Band, min: number, max: number): Band {
  return band(Math.min(Math.max(b.low, min), max), Math.min(Math.max(b.high, min), max));
}

export function bandWidth(b: Band): number {
  return b.high - b.low;
}

/** Smallest band containing all of the inputs. */
export function spanBands(bands: readonly Band[]): Band {
  if (bands.length === 0) return band(0, 0);
  let low = Infinity;
  let high = -Infinity;
  for (const b of bands) {
    low = Math.min(low, b.low);
    high = Math.max(high, b.high);
  }
  return band(low, high);
}

/** Extra points of width per grade of uncertainty about the borrower's grade. */
export function gradeUncertaintyPad(gradesSpanned: number): number {
  return Math.max(0, gradesSpanned - 1) * GRADE_SPREAD_WIDENING_PP;
}
