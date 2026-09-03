/**
 * THE RULEBOOK — the single source of truth for every threshold in this app.
 *
 * Each value is declared through `rule()`, which registers it alongside its
 * justification and returns it for the engine to use. RULES.md is generated
 * from that registry (`npm run docs:rules`), so the documentation cannot drift
 * from the behaviour: there is exactly one place a number lives.
 *
 * Sourcing is deliberately blunt. Where a value reflects a published norm it
 * says so. Where it is my own calibration it says "my judgement" — because a
 * borrower-facing tool that dresses up guesses as regulation is worse than one
 * that admits which is which.
 */

import type { ProductKind } from './facts';

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export interface RuleRecord {
  id: string;
  group: string;
  what: string;
  value: unknown;
  why: string;
  source: string;
}

const registry: RuleRecord[] = [];

function rule<T>(
  id: string,
  group: string,
  what: string,
  value: T,
  why: string,
  source: string,
): T {
  registry.push({ id, group, what, value, why, source });
  return value;
}

/** Every rule, in declaration order. Consumed by scripts/genRules.ts. */
export const RULES: readonly RuleRecord[] = registry;

export function findRule(id: string): RuleRecord | undefined {
  return registry.find((r) => r.id === id);
}

const JUDGEMENT = 'my judgement';
const MARKET = 'market observation — indicative Indian retail lending bands, 2026';
const RBI = 'RBI regulatory norm';

// ---------------------------------------------------------------------------
// Risk grades
// ---------------------------------------------------------------------------

export type Grade = 'A+' | 'A' | 'B' | 'C' | 'D';

/** Ordered best-to-worst, so a grade *range* can be expressed as a slice. */
export const GRADE_ORDER: readonly Grade[] = ['A+', 'A', 'B', 'C', 'D'];

export const SCORE_TO_GRADE = rule(
  'grade.score_bands',
  'Risk grade',
  'Credit score to risk grade',
  [
    { min: 780, grade: 'A+' as Grade },
    { min: 750, grade: 'A' as Grade },
    { min: 700, grade: 'B' as Grade },
    { min: 650, grade: 'C' as Grade },
    { min: 0, grade: 'D' as Grade },
  ],
  'Lenders price off score cut-offs clustered around 750 and 700; these are the ' +
    'break points where published retail rate cards visibly step.',
  MARKET,
);

export const THIN_FILE_GRADE_RANGE = rule(
  'grade.thin_file',
  'Risk grade',
  'Grade range when there is no credit score and no formal borrowing history',
  { best: 'A' as Grade, worst: 'C' as Grade },
  'A borrower with no score is not a bad borrower — they are an unmeasured one. ' +
    'Ravi has run a shop for 14 years and never defaulted on anything, because he ' +
    'has never borrowed. Modelling him as a range from A to C says exactly that: ' +
    'he could price well or poorly, and we cannot tell which until he is scored. ' +
    'Collapsing this to a single bad grade would be the "unknown = 300" error.',
  JUDGEMENT,
);

export const IMPAIRED_GRADE_RANGE = rule(
  'grade.impaired',
  'Risk grade',
  'Grade range when there is a recent bounce or active high-cost debt',
  { best: 'C' as Grade, worst: 'D' as Grade },
  'A missed EMI in the last 12 months is the single strongest observable ' +
    'predictor available to us without a bureau pull, and app-loan borrowing at ' +
    '30%+ signals the borrower has already exhausted cheaper options.',
  JUDGEMENT,
);

export const UNKNOWN_SCORE_RATE_PENALTY_PP = rule(
  'grade.unknown_score_penalty_pp',
  'Risk grade',
  'Extra width added to the rate band when the credit score is unknown',
  2.5,
  'Quantifies the cost of the silence so the borrower can decide whether it is ' +
    'worth five minutes on a free bureau site. It widens the band; it never ' +
    'shifts the band upward, because not knowing a score is not evidence of a bad one.',
  JUDGEMENT,
);

// ---------------------------------------------------------------------------
// Lender-side affordability (FOIR)
// ---------------------------------------------------------------------------

export const FOIR_LADDER = rule(
  'foir.ladder',
  'Affordability — lender',
  'Base FOIR ceiling by monthly income slab',
  [
    { minIncome: 100000, foir: 0.55 },
    { minIncome: 50000, foir: 0.5 },
    { minIncome: 25000, foir: 0.45 },
    { minIncome: 0, foir: 0.4 },
  ],
  'FOIR (fixed obligations to income ratio) is how lenders actually size retail ' +
    'loans. The ladder rises with income because absolute residual income matters ' +
    'more than the ratio: 45% of ₹20,000 leaves ₹11,000 to live on, while 55% of ' +
    '₹2,00,000 leaves ₹90,000. Lenders underwrite the residual, not the percentage.',
  MARKET,
);

export const FOIR_ADJUSTMENTS = rule(
  'foir.adjustments',
  'Affordability — lender',
  'FOIR adjustments in percentage points',
  {
    informalIncome: -0.05,
    selfEmployed: -0.03,
    noCreditHistory: -0.05,
    securedProduct: +0.05,
    recentBounce: -0.05,
    highCostDebt: -0.03,
  },
  'These mirror the direction of real credit policy: unverifiable income and ' +
    'absent history tighten the ratio, registered collateral loosens it. Signs ' +
    'matter more than magnitudes here, and the magnitudes are mine.',
  JUDGEMENT,
);

export const FOIR_HARD_CEILING = rule(
  'foir.hard_ceiling',
  'Affordability — lender',
  'Absolute FOIR ceiling no adjustment may exceed',
  0.6,
  'Past roughly 60% of income committed to fixed obligations, a borrower has no ' +
    'capacity to absorb any shock at all. Lenders rarely sanction beyond it and we ' +
    'refuse to imply they will.',
  MARKET,
);

// ---------------------------------------------------------------------------
// How much income a lender will believe
// ---------------------------------------------------------------------------

export const INCOME_RECOGNITION = rule(
  'income.recognition',
  'Affordability — lender',
  'Share of stated income a lender will underwrite, by income type',
  {
    salaried: 1.0,
    selfEmployedDocumented: 1.0,
    selfEmployedBankingUplift: 1.2,
    informal: 0.6,
  },
  'This is the hinge of the whole assessment: a lender lends against *provable* ' +
    'income, not earned income. A salary credit is fully verifiable. A self-employed ' +
    'borrower is underwritten off filed returns, with a modest uplift where bank ' +
    'statements support more (the banking-surrogate programmes). Informal cash ' +
    'income has no trail at all, so most of it simply does not count. Ravi earns ' +
    '₹40,000–80,000 and will be assessed on ₹35,000; that gap is the product.',
  MARKET,
);

export const CO_APPLICANT_INCOME_WEIGHT = rule(
  'income.co_applicant_weight',
  'Affordability — lender',
  'Share of a co-applicant\'s income added to assessed income',
  1.0,
  'A co-applicant is jointly liable, so lenders club income fully. Included only ' +
    'when the borrower confirms the co-applicant will actually sign.',
  MARKET,
);

// ---------------------------------------------------------------------------
// Borrower-side affordability (cashflow surplus)
// ---------------------------------------------------------------------------

export const CO_APPLICANT_IN_HOUSEHOLD = rule(
  'safe.co_applicant_counts_twice',
  'Affordability — borrower',
  'A co-applicant\'s income counts in the household surplus as well as in the lender\'s assessment',
  true,
  'Obvious once stated, and it was missing. A spouse who earns is money the ' +
    'household can actually spend, not only a number a lender clubs in. Leaving ' +
    'them out of the surplus model understated what the household could carry ' +
    'and, worse, hid the one genuine route open to a borrower like Anita: a ' +
    'joint application is the single change that moves her off "do not borrow", ' +
    'and the app could not see it.',
  JUDGEMENT,
);

export const SAVINGS_FLOOR_PCT = rule(
  'safe.savings_floor_pct',
  'Affordability — borrower',
  'Share of net income reserved for saving before any EMI',
  0.1,
  'A loan that consumes the borrower\'s entire surplus leaves them one bad month ' +
    'from borrowing again at a worse rate. Protecting 10% is what stops this tool ' +
    'from simply reproducing the lender\'s answer.',
  JUDGEMENT,
);

export const DEPENDANT_BUFFER_RUPEES = rule(
  'safe.dependant_buffer_rupees',
  'Affordability — borrower',
  'Monthly buffer held back per financial dependant',
  3000,
  'Dependants make expenses less compressible: a household of four cannot cut ' +
    'spending as fast as a single earner when income drops. Anita has two children ' +
    'and an unemployed husband, so ₹9,000 of her income is structurally unavailable.',
  JUDGEMENT,
);

export const SAFE_UTILISATION_OF_SURPLUS = rule(
  'safe.utilisation_of_surplus',
  'Affordability — borrower',
  'Share of remaining surplus that may go to a new EMI',
  0.65,
  'Committing every spare rupee to an EMI is not affordability, it is a coin flip ' +
    'on nothing going wrong. Two thirds keeps a genuine margin, and it is the ' +
    'single value I would expect to be challenged on — it is a risk-appetite ' +
    'choice, not an arithmetic one.',
  JUDGEMENT,
);

export const EMERGENCY_FUND = rule(
  'safe.emergency_fund',
  'Affordability — borrower',
  'Emergency-fund target and the haircut applied when it is short',
  {
    targetMonths: 3,
    haircutBelowTarget: 0.2,
    haircutBelowOneMonth: 0.35,
  },
  'Savings are what convert a shock into an inconvenience instead of a default. ' +
    'A borrower with no buffer needs a smaller EMI than an identical borrower with ' +
    'three months banked, and no FOIR calculation anywhere captures that.',
  JUDGEMENT,
);

export const VARIABLE_INCOME_HAIRCUT = rule(
  'safe.variable_income_haircut',
  'Affordability — borrower',
  'Haircut applied to the variable portion of income',
  0.3,
  'Applied to the variable share only, so a borrower who is 20% commission is ' +
    'discounted a fifth as hard as one who is fully on commission. For safe-carry ' +
    'we additionally take the *low* end of any income range, because the borrower ' +
    'has to survive the bad months, not the average one.',
  JUDGEMENT,
);

export const NO_SURPLUS_NO_CAPACITY = rule(
  'safe.no_surplus_no_capacity',
  'Affordability — borrower',
  'A household with no monthly surplus has zero safe capacity, whatever the loan might earn',
  true,
  'Projected earnings cannot fund an instalment that starts before they do. ' +
    'Without this rule, Anita — who is ₹15,000 to ₹18,000 short every month ' +
    'before borrowing anything — was credited with a small positive EMI ceiling ' +
    'out of what the scooter was expected to earn. The direction is simply wrong: ' +
    'money you are hoping for is not money you can pay with. If there is nothing ' +
    'spare today, the answer is zero, and the productive-loan adjustment applies ' +
    'only to a household that is already in surplus.',
  JUDGEMENT,
);

export const PRODUCTIVE_GAIN_HAIRCUT = rule(
  'safe.productive_gain_haircut',
  'Affordability — borrower',
  'Share of projected income from a productive loan that counts',
  0.5,
  'Anita\'s second scooter and Ravi\'s new stock line genuinely will earn — but ' +
    'projections made while asking for money are optimistic, and the EMI starts ' +
    'before the earnings do. Half, and never enough to exceed the lender ceiling.',
  JUDGEMENT,
);

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export interface ProductConfig {
  label: string;
  secured: boolean;
  minTenureMonths: number;
  maxTenureMonths: number;
  /** Prudent tenure for the borrower-safe number — shorter than the maximum. */
  prudentTenureMonths: number;
  maxLtvPct?: number;
  minAmountRupees: number;
  maxAmountRupees: number;
  processingFeePctBand: [number, number];
}

export const PRODUCTS = rule<Record<ProductKind, ProductConfig>>(
  'products.catalogue',
  'Products',
  'Product catalogue: tenure, LTV, ticket size and fee bands',
  {
    personal: {
      label: 'Personal loan',
      secured: false,
      minTenureMonths: 12,
      maxTenureMonths: 60,
      prudentTenureMonths: 36,
      minAmountRupees: 50000,
      maxAmountRupees: 4000000,
      processingFeePctBand: [1.0, 2.5],
    },
    home: {
      label: 'Home loan',
      secured: true,
      minTenureMonths: 120,
      maxTenureMonths: 360,
      prudentTenureMonths: 240,
      maxLtvPct: 80,
      minAmountRupees: 500000,
      maxAmountRupees: 100000000,
      processingFeePctBand: [0.25, 0.5],
    },
    lap: {
      label: 'Loan against property',
      secured: true,
      minTenureMonths: 60,
      maxTenureMonths: 180,
      prudentTenureMonths: 120,
      maxLtvPct: 60,
      minAmountRupees: 300000,
      maxAmountRupees: 50000000,
      processingFeePctBand: [0.5, 1.5],
    },
    gold: {
      label: 'Gold loan',
      secured: true,
      minTenureMonths: 6,
      maxTenureMonths: 36,
      prudentTenureMonths: 24,
      maxLtvPct: 75,
      minAmountRupees: 25000,
      maxAmountRupees: 2500000,
      processingFeePctBand: [0.25, 1.0],
    },
    two_wheeler: {
      label: 'Two-wheeler / EV loan',
      secured: true,
      minTenureMonths: 12,
      maxTenureMonths: 48,
      prudentTenureMonths: 36,
      maxLtvPct: 85,
      minAmountRupees: 30000,
      maxAmountRupees: 500000,
      processingFeePctBand: [1.0, 2.5],
    },
    business_secured: {
      label: 'Secured business loan',
      secured: true,
      minTenureMonths: 12,
      maxTenureMonths: 120,
      prudentTenureMonths: 84,
      maxLtvPct: 65,
      minAmountRupees: 200000,
      maxAmountRupees: 50000000,
      processingFeePctBand: [1.0, 2.0],
    },
    business_unsecured: {
      label: 'Unsecured business loan',
      secured: false,
      minTenureMonths: 12,
      maxTenureMonths: 48,
      prudentTenureMonths: 36,
      minAmountRupees: 100000,
      maxAmountRupees: 5000000,
      processingFeePctBand: [1.5, 3.0],
    },
  },
  'Tenure and ticket bands follow mainstream retail products. The gold LTV cap of ' +
    '75% is regulatory, not commercial. "Prudent tenure" is my own addition and ' +
    'exists because the longest tenure a lender offers minimises the EMI while ' +
    'maximising total interest — good for the sale, bad for the borrower.',
  `${MARKET}; gold LTV cap: ${RBI}; prudent tenure: ${JUDGEMENT}`,
);

export const GOLD_LTV_CAP_PCT = rule(
  'products.gold_ltv_cap',
  'Products',
  'Maximum loan-to-value on a gold loan',
  75,
  'A hard regulatory ceiling on gold lending, not a lender preference — so it ' +
    'binds regardless of how creditworthy the borrower is.',
  RBI,
);

export const RETIREMENT_AGE = rule(
  'products.retirement_age',
  'Products',
  'Age by which the loan must be fully repaid, by income type',
  { salaried: 60, self_employed: 70, informal: 65 },
  'Tenure is capped so the loan matures while the borrower still has income. This ' +
    'binds hardest on long-tenure secured products for older borrowers.',
  MARKET,
);

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

export type RateBand = readonly [number, number];

export const RATE_BANDS = rule(
  'pricing.rate_bands',
  'Pricing',
  'Nominal annual interest rate band by product and risk grade (%)',
  {
    personal: {
      'A+': [10.5, 12.5],
      A: [11.5, 14.0],
      B: [14.0, 17.0],
      C: [17.0, 21.0],
      D: [21.0, 26.0],
    },
    home: {
      'A+': [8.25, 8.75],
      A: [8.5, 9.25],
      B: [9.0, 10.0],
      C: [10.0, 11.0],
      D: [11.0, 12.5],
    },
    lap: {
      'A+': [9.0, 10.5],
      A: [9.5, 11.0],
      B: [10.5, 12.5],
      C: [12.0, 14.0],
      D: [14.0, 16.5],
    },
    gold: {
      'A+': [9.0, 11.0],
      A: [9.5, 12.0],
      B: [11.0, 14.0],
      C: [13.0, 16.0],
      D: [15.0, 18.0],
    },
    two_wheeler: {
      'A+': [9.5, 11.5],
      A: [10.5, 13.0],
      B: [12.5, 15.5],
      C: [15.0, 18.5],
      D: [18.0, 24.0],
    },
    business_secured: {
      'A+': [11.0, 13.0],
      A: [11.5, 14.0],
      B: [13.0, 16.0],
      C: [15.0, 18.0],
      D: [17.0, 21.0],
    },
    business_unsecured: {
      'A+': [16.0, 18.0],
      A: [17.0, 20.0],
      B: [19.0, 22.0],
      C: [21.0, 25.0],
      D: [24.0, 30.0],
    },
  } satisfies Record<ProductKind, Record<Grade, RateBand>>,
  'Indicative bands, and the most likely thing to be out of date in this file — ' +
    'they move with the policy rate and with competition. The *shape* is the ' +
    'durable part: secured products price 4-8 points below unsecured ones for the ' +
    'same borrower, which is why routing Ravi to a property-backed loan is worth ' +
    'more to him than any negotiation on an unsecured rate.',
  MARKET,
);

export const RATE_FLOOR_IS_BEST_GRADE = rule(
  'pricing.rate_floor',
  'Pricing',
  'A quoted band may never fall below the best grade\'s rate for that product',
  true,
  'Widening a band for low confidence must not invent a rate that no borrower ' +
    'could obtain. Without this floor, an unscored borrower with few answers ' +
    'ended up shown a two-wheeler rate starting below 8% — a number that does ' +
    'not exist in the market and would send them into a branch expecting ' +
    'something unavailable. Uncertainty widens the band upward; the bottom stops ' +
    'at the best real price.',
  JUDGEMENT,
);

export const GRADE_SPREAD_WIDENING_PP = rule(
  'pricing.grade_spread_widening_pp',
  'Pricing',
  'Extra band width per grade of uncertainty about the borrower\'s grade',
  0.5,
  'When we can only place the borrower within a range of grades, the quoted band ' +
    'spans all of them plus a little — uncertainty about the grade is itself a ' +
    'reason to expect a worse negotiation position.',
  JUDGEMENT,
);

export const APR_INCLUDES = rule(
  'pricing.apr_components',
  'Pricing',
  'What the all-in APR must include',
  ['interest', 'processing fee', 'bundled insurance and charges'],
  'The headline rate is not the price. A ₹8,00,000 personal loan at 12% with a 2% ' +
    'fee costs more than the same loan at 12.5% with no fee, and the borrower ' +
    'cannot see that from the two rates. APR is computed as the internal rate of ' +
    'return on the actual cashflows — amount disbursed net of all charges, then the ' +
    'EMIs — which is the only comparison that is honest. Adding the fee percentage ' +
    'to the interest rate, which is the common shortcut, is simply wrong.',
  'RBI Key Fact Statement / all-in APR disclosure requirement',
);

// ---------------------------------------------------------------------------
// Verdict
// ---------------------------------------------------------------------------

export const VERDICT_THRESHOLDS = rule(
  'verdict.thresholds',
  'Verdict',
  'Thresholds that decide borrow / borrow less / do not borrow',
  {
    requestedToSafeEmiDontBorrow: 1.5,
    borrowLessFloorRupees: 25000,
    minEmergencyMonthsForConsumption: 1,
    postLoanFoirHardStop: 0.6,
    highCostDebtRatePct: 24,
  },
  'The "do not borrow" path has to be genuinely reachable or the tool is ' +
    'decoration. It fires when the requested EMI is more than 1.5x what the ' +
    'borrower can carry, when a shock would breach 60% of income, or when someone ' +
    'with no buffer is borrowing for consumption. The floor stops us suggesting a ' +
    '"borrow less" amount too small to be worth arranging.',
  JUDGEMENT,
);

export const STRESS_CASE = rule(
  'verdict.stress_case',
  'Verdict',
  'The shock every recommendation is tested against',
  { incomeDropPct: 0.2, rateRisePp: 2.0 },
  'A 20% income drop is one lost client, one slow season, or a partner out of work ' +
    'for a month. A 200 basis point rate rise is an ordinary policy cycle on a ' +
    'floating loan. Neither is a disaster scenario, which is the point: if the EMI ' +
    'fails under ordinary bad luck, it was never affordable.',
  JUDGEMENT,
);

// ---------------------------------------------------------------------------
// Confidence
// ---------------------------------------------------------------------------

export const CONFIDENCE_WEIGHTS = rule(
  'confidence.fact_weights',
  'Confidence',
  'How much each fact contributes to confidence in the outputs',
  {
    netMonthlyIncome: 3,
    existingEmiTotal: 2,
    householdExpenses: 2,
    creditScore: 2,
    amountWanted: 1,
    incomeType: 1,
    purpose: 1,
    rent: 1,
    age: 1,
    emergencySavingsMonths: 1.5,
    documentedIncomeAnnual: 1.5,
    variableIncomeShare: 1,
    dependants: 1,
    collateralValue: 1,
    bouncesLast12m: 1.5,
    incomeStabilityYears: 1,
  },
  'Weighted by how much each fact actually moves a number, not by how ' +
    'interesting it is. Income is worth three times rent because every output ' +
    'is a function of income.',
  JUDGEMENT,
);

export const BAND_WIDENING_K = rule(
  'confidence.band_widening_k',
  'Confidence',
  'How aggressively output bands widen as confidence falls',
  0.6,
  'Half-width is multiplied by 1 + k(1 - confidence), so a borrower who answered ' +
    'only the must-set sees a band roughly 60% wider than one who answered ' +
    'everything. Silence must never narrow a range, and the app must say which ' +
    'silence widened which number.',
  JUDGEMENT,
);

export const LOW_CONFIDENCE_SAFETY_HAIRCUT = rule(
  'confidence.safety_haircut',
  'Confidence',
  'How much the safe-to-carry figures shrink as confidence falls',
  0.25,
  'Uncertainty is treated asymmetrically, on purpose. A rate band we are unsure ' +
    'about widens in both directions, because not knowing a borrower\'s score is ' +
    'not evidence they will be priced badly. But a figure that says "you can ' +
    'afford this" must never drift upward on the strength of missing ' +
    'information — so the safe-carry numbers are cut instead of widened. Being ' +
    'vague about a price is fair; being vague about affordability is dangerous.',
  JUDGEMENT,
);

export const RANGE_SPREAD_PENALTY = rule(
  'confidence.range_spread_penalty',
  'Confidence',
  'Confidence lost when a fact is given as a wide range rather than a figure',
  0.5,
  'Ravi answering "₹40,000 to ₹80,000" is more informative than silence but much ' +
    'less than "₹52,000". Credit is given in proportion to the tightness of the ' +
    'answer, scaled by that fact\'s weight.',
  JUDGEMENT,
);

// ---------------------------------------------------------------------------
// Question policy
// ---------------------------------------------------------------------------

export const VOI_WEIGHTS = rule(
  'questions.voi_weights',
  'Question design',
  'How the value of asking a question is scored',
  { verdictFlip: 3, amountShare: 1, emiShare: 1, ratePerPoint: 0.2 },
  'A question that could flip the verdict outright is worth more than one that ' +
    'nudges a band, so it is weighted three times as heavily. Amount and EMI ' +
    'movements are scored as a share of the borrower\'s own figures rather than ' +
    'in absolute rupees — ₹5,000 of movement means something very different to ' +
    'Anita than to Priya.',
  JUDGEMENT,
);

export const QUESTION_POLICY = rule(
  'questions.policy',
  'Question design',
  'The bar an additional question must clear to be asked at all',
  {
    minAmountDeltaRupees: 2000,
    minEmiDeltaRupees: 200,
    minRateDeltaPp: 0.25,
    maxAdditionalQuestions: 12,
  },
  'The brief\'s rule is that every additional question must change an output. ' +
    'Rather than honour that by taste, the engine simulates each candidate answer, ' +
    'measures how far the output actually moves, and mechanically drops any ' +
    'question that moves it less than this. The generated proof table in RULES.md ' +
    'is the receipt — and a question that stops earning its place after a rule ' +
    'change disappears on its own.',
  JUDGEMENT,
);
