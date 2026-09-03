/**
 * The three borrowers from the brief.
 *
 * Each appears twice: `*Must` holds only the answers to the must-set, and the
 * full version adds what an adaptive interview would have drawn out. Running
 * both is how we demonstrate the rule that confidence widens with silence — the
 * must-only assessments should reach the same verdicts through visibly wider
 * bands.
 *
 * Facts stated in the brief are marked. Everything else is a plausible interview
 * answer, invented here so the run-throughs are reproducible.
 */

import { exact, range, UNKNOWN, type BorrowerFacts } from './facts';

// ---------------------------------------------------------------------------
// Priya, 29 — Bengaluru, salaried
// ---------------------------------------------------------------------------

/**
 * Software engineer, large MNC, 5 years. Net ₹1,10,000. Car loan EMI ₹14,000
 * with 2 years left. Score 780. Rent ₹28,000. Wants ₹8,00,000 for a wedding.
 *
 * The interesting case: a lender will happily offer her more than she asked for,
 * so eligibility is not her constraint at all. Her real exposure is tenure and
 * an unproductive purpose — and the four points she will overpay if she signs
 * the first offer.
 */
export const priyaMust: BorrowerFacts = {
  purpose: 'wedding', // brief
  amountWanted: exact(800000), // brief
  productWanted: 'personal', // brief
  incomeType: 'salaried', // brief
  netMonthlyIncome: exact(110000), // brief
  rent: exact(28000), // brief
  age: exact(29), // brief
  creditScore: exact(780), // brief
  existingEmiTotal: exact(14000), // brief
};

export const priya: BorrowerFacts = {
  ...priyaMust,
  existingLoans: [
    { label: 'Car loan', emi: 14000, monthsLeft: exact(24) }, // brief
  ],
  incomeStabilityYears: exact(5), // brief
  householdExpenses: exact(25000),
  emergencySavingsMonths: exact(2),
  dependants: exact(0),
  variableIncomeShare: exact(0.1),
  cardUtilisationPct: exact(20),
  bouncesLast12m: exact(0),
  collateralType: 'none',
};

// ---------------------------------------------------------------------------
// Ravi, 42 — Mysuru, self-employed
// ---------------------------------------------------------------------------

/**
 * Kirana store, 14 years. Cash ₹40,000-80,000 a month; ITR shows ₹4,20,000 a
 * year. Owns the shop premises, ~₹45,00,000, unencumbered. Never taken a formal
 * loan, so no score. Wife earns ₹18,000 teaching. Wants ₹15,00,000.
 *
 * The whole answer is the product. Unsecured, his documented ₹35,000 a month
 * supports a fraction of what he asked for at 19-25%. Against the shop he
 * already owns outright, the same money is available in the low teens.
 */
export const raviMust: BorrowerFacts = {
  purpose: 'business_expansion', // brief
  amountWanted: exact(1500000), // brief
  productWanted: 'business_unsecured', // what he would walk in and ask for
  incomeType: 'self_employed', // brief
  netMonthlyIncome: range(40000, 80000), // brief
  age: exact(42), // brief
  creditScore: UNKNOWN, // brief — never borrowed formally
  existingEmiTotal: exact(0), // brief
};

export const ravi: BorrowerFacts = {
  ...raviMust,
  documentedIncomeAnnual: exact(420000), // brief
  collateralValue: exact(4500000), // brief
  collateralType: 'property', // brief
  collateralEncumbered: false, // brief
  coApplicantIncome: exact(18000), // brief — wife, teaching
  incomeStabilityYears: exact(14), // brief
  hasBankStatements: true,
  householdExpenses: exact(30000),
  rent: exact(0), // owns the premises
  emergencySavingsMonths: exact(4),
  dependants: exact(2),
  variableIncomeShare: exact(0.5),
  bouncesLast12m: exact(0),
  productiveMonthlyGain: exact(25000),
};

// ---------------------------------------------------------------------------
// Anita, 35 — Hubballi, informal
// ---------------------------------------------------------------------------

/**
 * Delivery-platform rider plus home tailoring, ₹26,000-30,000 a month. Two
 * children, husband unemployed 8 months. Three app loans, ₹35,000 outstanding
 * above 30%, one EMI bounced last month. Wants ₹1,50,000 for an electric scooter
 * to double her delivery runs.
 *
 * The answer has to be no — and it has to still be useful. The scooter really
 * would earn; a ₹1,50,000 unsecured loan on top of 32% app debt and a bounce is
 * simply not the way to get it.
 */
export const anitaMust: BorrowerFacts = {
  purpose: 'vehicle_productive', // brief — to double delivery runs
  amountWanted: exact(150000), // brief
  productWanted: 'personal', // brief
  incomeType: 'informal', // brief
  netMonthlyIncome: range(26000, 30000), // brief
  age: exact(35), // brief
  creditScore: UNKNOWN, // brief
  existingEmiTotal: exact(6500),
};

export const anita: BorrowerFacts = {
  ...anitaMust,
  existingLoans: [
    // brief: three app loans, ₹35,000 outstanding, 30%+
    { label: 'App loan 1', emi: 2500, ratePct: exact(32), outstanding: exact(14000), highCost: true },
    { label: 'App loan 2', emi: 2200, ratePct: exact(34), outstanding: exact(12000), highCost: true },
    { label: 'App loan 3', emi: 1800, ratePct: exact(30), outstanding: exact(9000), highCost: true },
  ],
  bouncesLast12m: exact(1), // brief — one EMI bounced last month
  dependants: exact(3), // brief — two children, husband unemployed
  householdExpenses: exact(16000),
  rent: exact(6000),
  emergencySavingsMonths: exact(0),
  variableIncomeShare: exact(0.6),
  incomeStabilityYears: exact(3),
  collateralType: 'none',
  productiveMonthlyGain: exact(12000),
};

export const PERSONAS = [
  {
    id: 'priya',
    name: 'Priya, 29',
    where: 'Bengaluru · salaried',
    ask: '₹8,00,000 personal loan for a wedding',
    must: priyaMust,
    full: priya,
  },
  {
    id: 'ravi',
    name: 'Ravi, 42',
    where: 'Mysuru · self-employed',
    ask: '₹15,00,000 for a second stock line and a delivery vehicle',
    must: raviMust,
    full: ravi,
  },
  {
    id: 'anita',
    name: 'Anita, 35',
    where: 'Hubballi · informal',
    ask: '₹1,50,000 for an electric scooter to double delivery runs',
    must: anitaMust,
    full: anita,
  },
] as const;
