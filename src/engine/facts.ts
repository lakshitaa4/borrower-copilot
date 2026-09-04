/**
 * Facts the borrower gives us, and the value types they are expressed in.
 *
 * The central idea: a fact is *never* just a number. It is either known exactly,
 * known only as a range, or genuinely unknown — and "unknown" is a first-class
 * state, not a zero and not a silent default. Every downstream calculation
 * carries that uncertainty forward instead of collapsing it.
 *
 * Pure data + pure helpers. No I/O, no framework, no AI.
 */

// ---------------------------------------------------------------------------
// Uncertain numbers
// ---------------------------------------------------------------------------

export type Exact = { kind: 'exact'; value: number };
export type Range = { kind: 'range'; low: number; high: number };
export type Unknown = { kind: 'unknown' };

/** A quantity the borrower told us: exactly, as a range, or not at all. */
export type Num = Exact | Range | Unknown;

export const UNKNOWN: Unknown = { kind: 'unknown' };

export function exact(value: number): Exact {
  return { kind: 'exact', value };
}

export function range(low: number, high: number): Num {
  if (!Number.isFinite(low) || !Number.isFinite(high)) return UNKNOWN;
  if (low === high) return exact(low);
  return low <= high
    ? { kind: 'range', low, high }
    : { kind: 'range', low: high, high: low };
}

/** Build a Num from something that may be undefined/null — the intake boundary. */
export function num(value: number | null | undefined): Num {
  return value === null || value === undefined || !Number.isFinite(value)
    ? UNKNOWN
    : exact(value);
}

export function isKnown(n: Num | undefined): n is Exact | Range {
  return n !== undefined && n.kind !== 'unknown';
}

export function isUnknown(n: Num | undefined): boolean {
  return !isKnown(n);
}

/**
 * Lower bound. `fallback` is used only when the value is unknown, and callers
 * must pass one deliberately — there is no implicit zero.
 */
export function lo(n: Num | undefined, fallback: number): number {
  if (!isKnown(n)) return fallback;
  return n.kind === 'exact' ? n.value : n.low;
}

/** Upper bound, with an explicit fallback for the unknown case. */
export function hi(n: Num | undefined, fallback: number): number {
  if (!isKnown(n)) return fallback;
  return n.kind === 'exact' ? n.value : n.high;
}

/** Midpoint. Use only where a point estimate is genuinely appropriate. */
export function mid(n: Num | undefined, fallback: number): number {
  if (!isKnown(n)) return fallback;
  return n.kind === 'exact' ? n.value : (n.low + n.high) / 2;
}

/**
 * How wide a range is relative to its midpoint: 0 for an exact value, 1 for
 * "the high is triple the low". Feeds the confidence model.
 */
export function spread(n: Num | undefined): number {
  if (!isKnown(n)) return 1;
  if (n.kind === 'exact') return 0;
  const m = (n.low + n.high) / 2;
  if (m === 0) return 0;
  return Math.min(1, (n.high - n.low) / Math.abs(m));
}

/** Clamp a Num into [min, max], preserving its kind. */
export function clampNum(n: Num, min: number, max: number): Num {
  if (n.kind === 'unknown') return n;
  if (n.kind === 'exact') return exact(Math.min(max, Math.max(min, n.value)));
  return range(
    Math.min(max, Math.max(min, n.low)),
    Math.min(max, Math.max(min, n.high)),
  );
}

/** Sum of Nums. Unknown terms contribute their `fallback` at both bounds. */
export function sumLo(items: Array<Num | undefined>, fallback: number): number {
  return items.reduce((acc, n) => acc + lo(n, fallback), 0);
}

export function sumHi(items: Array<Num | undefined>, fallback: number): number {
  return items.reduce((acc, n) => acc + hi(n, fallback), 0);
}

// ---------------------------------------------------------------------------
// Domain enums
// ---------------------------------------------------------------------------

/**
 * How the income is earned — which drives how much of it a lender will *believe*.
 * This distinction, not the amount, is what separates Priya from Ravi from Anita.
 */
export type IncomeType = 'salaried' | 'self_employed' | 'informal';

export type ProductKind =
  | 'personal'
  | 'home'
  | 'lap' // loan against property
  | 'gold'
  | 'two_wheeler'
  | 'business_secured'
  | 'business_unsecured';

/**
 * What the money is for. Productive purposes generate income to service the
 * loan; consumption purposes do not, and we hold them to a stricter bar.
 */
export type LoanPurpose =
  | 'wedding'
  | 'medical'
  | 'education'
  | 'home_purchase'
  | 'business_expansion'
  | 'vehicle_productive'
  | 'vehicle_personal'
  | 'debt_consolidation'
  | 'consumption'
  | 'other';

export const PRODUCTIVE_PURPOSES: readonly LoanPurpose[] = [
  'business_expansion',
  'vehicle_productive',
  'education',
];

export function isProductive(purpose: LoanPurpose | undefined): boolean {
  return purpose !== undefined && PRODUCTIVE_PURPOSES.includes(purpose);
}

/**
 * What the borrower could pledge. This single fact can move someone from a 22%
 * unsecured quote to an 11% secured one, which is why it is asked of everyone
 * who is short of what they want.
 */
export type CollateralType = 'property' | 'gold' | 'vehicle' | 'none';

/** An obligation the borrower already carries. */
export interface ExistingLoan {
  label: string;
  emi: number;
  ratePct?: Num;
  monthsLeft?: Num;
  outstanding?: Num;
  /** App/payday style lending — treated as distress debt, not ordinary credit. */
  highCost?: boolean;
}

/** A quote a lender has already put in front of the borrower. */
export interface LenderOffer {
  ratePct: number;
  processingFeePct?: number;
  /** Insurance or other charges bundled into the disbursal, in rupees. */
  bundledChargesRupees?: number;
  tenureMonths: number;
  amountRupees?: number;
}

// ---------------------------------------------------------------------------
// The fact sheet
// ---------------------------------------------------------------------------

/**
 * Everything the app might learn about a borrower. All fields optional by
 * design: the assessment must produce all four outputs from the must-set alone,
 * just with wider bands and lower confidence.
 */
export interface BorrowerFacts {
  // --- must-set: the minimum to produce O1-O4 -----------------------------
  purpose?: LoanPurpose;
  amountWanted?: Num;
  /** What the borrower thinks they want; the engine may route them elsewhere. */
  productWanted?: ProductKind;
  /**
   * Set when the borrower said they did not know which product to ask for.
   * Distinct from `productWanted` being unset, which means we never asked —
   * without the distinction the interview cannot tell "answered: no idea" from
   * silence, and re-asks forever.
   */
  productWantedUnsure?: boolean;
  incomeType?: IncomeType;
  /** Take-home per month, after tax and deductions. */
  netMonthlyIncome?: Num;
  existingEmiTotal?: Num;
  /** Household running cost per month, excluding rent and EMIs. */
  householdExpenses?: Num;
  rent?: Num;
  age?: Num;
  /** UNKNOWN is a meaningful, common answer here. Never read as 300. */
  creditScore?: Num;

  // --- additional: each must move a number to earn its place --------------
  /** Years in the current job or running the current business. */
  incomeStabilityYears?: Num;
  /** Share of income that is variable/commission/seasonal, 0..1. */
  variableIncomeShare?: Num;
  /** Income the borrower can *document* (ITR), annual. Drives lender belief. */
  documentedIncomeAnnual?: Num;
  hasBankStatements?: boolean;
  coApplicantIncome?: Num;
  /** People financially dependent on this income, excluding the borrower. */
  dependants?: Num;
  /** Liquid savings expressed in months of household expenses. */
  emergencySavingsMonths?: Num;
  collateralValue?: Num;
  collateralType?: CollateralType;
  collateralEncumbered?: boolean;
  cardUtilisationPct?: Num;
  bouncesLast12m?: Num;
  existingLoans?: ExistingLoan[];
  /** Extra net monthly income the loan itself is expected to generate. */
  productiveMonthlyGain?: Num;
  /** A large known expense coming up, per month equivalent. */
  upcomingExpenseMonthly?: Num;
  /** What a lender has already offered, so we can price it honestly. */
  offer?: LenderOffer;
}

export const EMPTY_FACTS: BorrowerFacts = {};

/** Total of the itemised loans, when the borrower listed them individually. */
export function existingEmiFromLoans(facts: BorrowerFacts): number | undefined {
  const loans = facts.existingLoans;
  if (!loans || loans.length === 0) return undefined;
  return loans.reduce((acc, l) => acc + l.emi, 0);
}

/**
 * The obligation figure to use. Prefer the itemised list when we have it — it
 * is more reliable than a remembered total, and it tells us about loan *quality*
 * as well as quantity.
 */
export function totalExistingEmi(facts: BorrowerFacts): Num {
  const itemised = existingEmiFromLoans(facts);
  if (itemised !== undefined) return exact(itemised);
  return facts.existingEmiTotal ?? UNKNOWN;
}

/**
 * The EMIs that will still be running *after* this loan is taken.
 *
 * A consolidation loan repays what it replaces, so counting both the old
 * instalments and the new one double-charges the borrower and makes the very
 * thing that would help them look unaffordable. Anything asking "what else will
 * they owe?" uses this rather than the raw total.
 */
export function continuingEmi(facts: BorrowerFacts): Num {
  if (facts.purpose === 'debt_consolidation') return exact(0);
  return totalExistingEmi(facts);
}

/** Does the borrower carry app/payday-style debt? Anita does; it changes the verdict. */
export function hasHighCostDebt(facts: BorrowerFacts): boolean {
  return (facts.existingLoans ?? []).some(
    (l) => l.highCost === true || hi(l.ratePct, 0) >= 24,
  );
}

/**
 * Income the household actually has to pay from, in a bad month and a good one.
 *
 * Defined once, here, because it drifted three times: the surplus model counted
 * a co-applicant, the lender's assessment counted them, and the obligation-ratio
 * check did not — so Ravi was told he could carry ₹41,112 a month and then
 * capped because his instalment was 66% of an income figure that excluded his
 * wife's ₹18,000. Anything asking "what can this household pay?" uses this.
 */
export function householdIncome(facts: BorrowerFacts): { low: number; high: number } {
  const co = lo(facts.coApplicantIncome, 0);
  return {
    low: lo(facts.netMonthlyIncome, 0) + co,
    high: hi(facts.netMonthlyIncome, 0) + co,
  };
}

/** Unencumbered collateral we could route a secured product against. */
export function usableCollateral(facts: BorrowerFacts): Num {
  if (facts.collateralEncumbered === true) return exact(0);
  return facts.collateralValue ?? UNKNOWN;
}
