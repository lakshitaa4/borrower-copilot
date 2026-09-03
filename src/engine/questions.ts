/**
 * The question bank.
 *
 * Two tiers. The `core` set is what we always ask — roughly the minimum to
 * produce all four outputs. Everything else is `additional`, and an additional
 * question only gets asked if the value-of-information engine can show it
 * actually moves a number for *this* borrower (see voi.ts).
 *
 * Two things carry the adaptivity:
 *
 *  - `applies` gates a question on the facts so far. A salaried engineer is
 *    never asked about her ITR; a borrower with no existing loans is never asked
 *    to itemise them.
 *  - `probes` supplies the plausible answers the VOI engine replays through the
 *    whole assessment to measure what asking would be worth. This is the part
 *    that makes "every question must change an output" a property of the code
 *    rather than a promise in a README.
 */

import {
  type BorrowerFacts,
  type CollateralType,
  type IncomeType,
  type LoanPurpose,
  exact,
  hi,
  isKnown,
  isProductive,
  lo,
  range,
  UNKNOWN,
} from './facts';

/**
 * `core`        — always asked; the minimum to produce the four outputs.
 * `additional`  — asked only if the VOI engine shows it moves a number.
 * `negotiation` — does not affect the assessment at all; it feeds the card.
 *
 * The third tier exists so the VOI rule stays honest. A lender's quote cannot
 * change what the borrower can afford, so it would always score zero and be
 * dropped — but it is exactly what the Negotiation Card is built from. Rather
 * than fudge its score, it is kept out of the ranking and asked at the card.
 */
export type QuestionTier = 'core' | 'additional' | 'negotiation';

export type AnswerKind = 'number' | 'range' | 'choice' | 'boolean' | 'loans';

export interface QuestionChoice {
  value: string;
  label: string;
}

export interface Question {
  id: string;
  /** The fact this question fills in. */
  factKey: keyof BorrowerFacts;
  tier: QuestionTier;
  /** Default wording. The copilot may rephrase, but never invent a question. */
  text: string;
  /** Why we are asking, shown on request. Borrowers are owed this. */
  why: string;
  kind: AnswerKind;
  unit?: 'rupees' | 'months' | 'years' | 'pct' | 'score' | 'count';
  choices?: QuestionChoice[];
  placeholder?: string;
  /** "I don't know" is a valid answer to most things, and never means zero. */
  allowUnknown: boolean;
  /** Adaptivity: only ask when this borrower's answers make it relevant. */
  applies: (facts: BorrowerFacts) => boolean;
  /** The gate in words, for RULES.md. Omitted means always asked. */
  appliesWhen?: string;
  /** Plausible answers, replayed by the VOI engine to price the question. */
  probes: (facts: BorrowerFacts) => BorrowerFacts[];
}

const always = () => true;

/** Midpoint of stated income, for scaling probe values sensibly. */
function incomeMid(facts: BorrowerFacts): number {
  const low = lo(facts.netMonthlyIncome, 0);
  const high = hi(facts.netMonthlyIncome, 0);
  return high > 0 ? (low + high) / 2 : 30000;
}

function withFact(facts: BorrowerFacts, patch: Partial<BorrowerFacts>): BorrowerFacts {
  return { ...facts, ...patch };
}

export const PURPOSE_CHOICES: QuestionChoice[] = [
  { value: 'business_expansion', label: 'Grow my business' },
  { value: 'vehicle_productive', label: 'A vehicle I earn with' },
  { value: 'home_purchase', label: 'Buy a home' },
  { value: 'education', label: 'Education' },
  { value: 'medical', label: 'Medical' },
  { value: 'wedding', label: 'A wedding' },
  { value: 'debt_consolidation', label: 'Pay off other loans' },
  { value: 'vehicle_personal', label: 'A vehicle for personal use' },
  { value: 'consumption', label: 'Something else I need to buy' },
  { value: 'other', label: 'Other' },
];

export const INCOME_TYPE_CHOICES: QuestionChoice[] = [
  { value: 'salaried', label: 'A salary, paid into my bank' },
  { value: 'self_employed', label: 'My own business or trade' },
  { value: 'informal', label: 'Daily or app-based work, mostly cash' },
];

export const PRODUCT_CHOICES: QuestionChoice[] = [
  { value: 'personal', label: 'A personal loan' },
  { value: 'business_unsecured', label: 'A business loan' },
  { value: 'lap', label: 'A loan against property I own' },
  { value: 'two_wheeler', label: 'A vehicle loan' },
  { value: 'gold', label: 'A gold loan' },
  { value: 'home', label: 'A home loan' },
];

export const COLLATERAL_CHOICES: QuestionChoice[] = [
  { value: 'property', label: 'Property — land, a house or a shop' },
  { value: 'gold', label: 'Gold' },
  { value: 'vehicle', label: 'A vehicle' },
  { value: 'none', label: 'Nothing I could pledge' },
];

// ---------------------------------------------------------------------------
// Core — always asked
// ---------------------------------------------------------------------------

const CORE: Question[] = [
  {
    id: 'purpose',
    factKey: 'purpose',
    tier: 'core',
    text: 'What is the loan for?',
    why: 'A loan that earns money is judged differently from one that does not, and the purpose decides which products you should even be looking at.',
    kind: 'choice',
    choices: PURPOSE_CHOICES,
    allowUnknown: false,
    applies: always,
    probes: (f) =>
      (['business_expansion', 'wedding', 'consumption'] as LoanPurpose[]).map((p) =>
        withFact(f, { purpose: p }),
      ),
  },
  {
    id: 'amountWanted',
    factKey: 'amountWanted',
    tier: 'core',
    text: 'How much are you hoping to borrow?',
    why: 'This is what we test against everything else. If it turns out to be too much, we will tell you what is not.',
    kind: 'number',
    unit: 'rupees',
    placeholder: '8,00,000',
    allowUnknown: false,
    applies: always,
    probes: (f) => {
      const base = hi(f.amountWanted, 200000);
      return [0.5, 1, 2].map((m) => withFact(f, { amountWanted: exact(base * m) }));
    },
  },
  {
    id: 'productWanted',
    factKey: 'productWanted',
    tier: 'core',
    text: 'What kind of loan were you thinking of?',
    why:
      'Only so we can tell you if it is the wrong one. This is the single ' +
      'question here that does not move any of your four numbers — we work out ' +
      'the right product from your situation regardless. But if what you came in ' +
      'asking for costs you several points more than something you already ' +
      'qualify for, you should be told, and we cannot tell you unless we know ' +
      'what you were going to ask for.',
    kind: 'choice',
    choices: PRODUCT_CHOICES,
    allowUnknown: true,
    applies: always,
    // Routing is driven by purpose and assets, so this changes the *advice*,
    // never the arithmetic. Probing it would score zero, and it is core, so it
    // is asked regardless — see RULES.md.
    probes: (f) => [f],
  },
  {
    id: 'incomeType',
    factKey: 'incomeType',
    tier: 'core',
    text: 'How do you earn?',
    why: 'This matters more than the amount. A lender lends against income it can verify, so how you are paid changes what they will count.',
    kind: 'choice',
    choices: INCOME_TYPE_CHOICES,
    allowUnknown: false,
    applies: always,
    probes: (f) =>
      (['salaried', 'self_employed', 'informal'] as IncomeType[]).map((t) =>
        withFact(f, { incomeType: t }),
      ),
  },
  {
    id: 'netMonthlyIncome',
    factKey: 'netMonthlyIncome',
    tier: 'core',
    text: 'What reaches you in a month, after deductions?',
    why: 'Every number in your assessment is built on this. If it varies, give us the range — we will use the low end, because that is the month you still have to pay in.',
    kind: 'range',
    unit: 'rupees',
    placeholder: '40,000 to 80,000',
    allowUnknown: false,
    applies: always,
    probes: (f) => {
      const base = incomeMid(f);
      return [0.6, 1, 1.6].map((m) => withFact(f, { netMonthlyIncome: exact(base * m) }));
    },
  },
  {
    id: 'existingEmiTotal',
    factKey: 'existingEmiTotal',
    tier: 'core',
    text: 'What do you already pay every month on loans or EMIs?',
    why: 'This comes straight off what a lender will allow you, and off what you can actually afford. Include app loans and gold loans.',
    kind: 'number',
    unit: 'rupees',
    placeholder: '14,000',
    allowUnknown: true,
    applies: always,
    probes: (f) => {
      const base = incomeMid(f);
      return [0, base * 0.15, base * 0.35].map((v) =>
        withFact(f, { existingEmiTotal: exact(v) }),
      );
    },
  },
  {
    id: 'householdExpenses',
    factKey: 'householdExpenses',
    tier: 'core',
    text: 'Roughly what does the household spend in a month, apart from rent and EMIs?',
    why: 'Without this we have to assume anywhere between a third and half your income, which is the widest guess in your whole assessment.',
    kind: 'number',
    unit: 'rupees',
    placeholder: '25,000',
    allowUnknown: true,
    applies: always,
    probes: (f) => {
      const base = incomeMid(f);
      return [0.25, 0.45, 0.65].map((m) =>
        withFact(f, { householdExpenses: exact(base * m) }),
      );
    },
  },
  {
    id: 'rent',
    factKey: 'rent',
    tier: 'core',
    text: 'How much rent do you pay?',
    why: 'Rent is a fixed claim on your income that most eligibility calculators quietly ignore.',
    kind: 'number',
    unit: 'rupees',
    placeholder: '28,000',
    allowUnknown: true,
    applies: always,
    probes: (f) => {
      const base = incomeMid(f);
      return [0, base * 0.2, base * 0.35].map((v) => withFact(f, { rent: exact(v) }));
    },
  },
  {
    id: 'age',
    factKey: 'age',
    tier: 'core',
    text: 'How old are you?',
    why: 'The loan has to finish before your income does, so your age caps how long you can spread it.',
    kind: 'number',
    unit: 'count',
    placeholder: '29',
    allowUnknown: true,
    applies: always,
    probes: (f) => [28, 45, 58].map((v) => withFact(f, { age: exact(v) })),
  },
  {
    id: 'creditScore',
    factKey: 'creditScore',
    tier: 'core',
    text: 'Do you know your credit score?',
    why: 'If you do not know it, we will not assume the worst — but we will have to quote you a wider rate band, and we will show you exactly how much that costs.',
    kind: 'number',
    unit: 'score',
    placeholder: '780',
    allowUnknown: true,
    applies: always,
    probes: (f) =>
      [exact(800), exact(740), exact(660), UNKNOWN].map((v) =>
        withFact(f, { creditScore: v }),
      ),
  },
];

// ---------------------------------------------------------------------------
// Additional — asked only when they earn their place
// ---------------------------------------------------------------------------

const ADDITIONAL: Question[] = [
  {
    id: 'documentedIncomeAnnual',
    factKey: 'documentedIncomeAnnual',
    tier: 'additional',
    text: 'What income do your filed returns show for the year?',
    why: 'A lender underwrites what you can prove, not what the business takes. This is usually the single biggest gap for a self-employed borrower.',
    kind: 'number',
    unit: 'rupees',
    placeholder: '4,20,000',
    allowUnknown: true,
    // Only relevant to someone who files returns for their own business.
    applies: (f) => f.incomeType === 'self_employed',
    appliesWhen: 'self-employed income only',
    probes: (f) => {
      const annual = incomeMid(f) * 12;
      return [0.3, 0.6, 1.0].map((m) =>
        withFact(f, { documentedIncomeAnnual: exact(annual * m) }),
      );
    },
  },
  {
    id: 'hasBankStatements',
    factKey: 'hasBankStatements',
    tier: 'additional',
    text: 'Do you have 12 months of bank statements showing money coming in?',
    why: 'Some lenders will lend against banking turnover when returns understate the business. It can lift what they count.',
    kind: 'boolean',
    allowUnknown: true,
    applies: (f) => f.incomeType === 'self_employed' || f.incomeType === 'informal',
    appliesWhen: 'self-employed or informal income',
    probes: (f) =>
      [true, false].map((v) => withFact(f, { hasBankStatements: v })),
  },
  {
    id: 'collateralType',
    factKey: 'collateralType',
    tier: 'additional',
    text: 'Is there anything you could offer as security?',
    why: 'This is usually the most valuable question on the list. Security can move you from an unsecured rate in the twenties to a secured one in the low teens.',
    kind: 'choice',
    choices: COLLATERAL_CHOICES,
    allowUnknown: true,
    applies: always,
    probes: (f) =>
      (['property', 'gold', 'none'] as CollateralType[]).map((t) =>
        withFact(f, {
          collateralType: t,
          collateralValue:
            t === 'property'
              ? exact(Math.max(2500000, hi(f.amountWanted, 0) * 3))
              : t === 'gold'
                ? exact(Math.max(300000, hi(f.amountWanted, 0)))
                : exact(0),
          collateralEncumbered: false,
        }),
      ),
  },
  {
    id: 'collateralValue',
    factKey: 'collateralValue',
    tier: 'additional',
    text: 'Roughly what is it worth?',
    why: 'A secured loan is capped at a share of what the security is worth, so this sets your ceiling.',
    kind: 'number',
    unit: 'rupees',
    placeholder: '45,00,000',
    allowUnknown: true,
    applies: (f) => f.collateralType !== undefined && f.collateralType !== 'none',
    appliesWhen: 'after they say there is something to pledge',
    probes: (f) => {
      const ask = Math.max(100000, hi(f.amountWanted, 500000));
      return [ask, ask * 2, ask * 4].map((v) =>
        withFact(f, { collateralValue: exact(v) }),
      );
    },
  },
  {
    id: 'collateralEncumbered',
    factKey: 'collateralEncumbered',
    tier: 'additional',
    text: 'Is there already a loan against it?',
    why: 'Security that is already pledged cannot be pledged again, so this can remove the secured option entirely.',
    kind: 'boolean',
    allowUnknown: true,
    applies: (f) => isKnown(f.collateralValue) && lo(f.collateralValue, 0) > 0,
    appliesWhen: 'after a value is given for the security',
    probes: (f) => [true, false].map((v) => withFact(f, { collateralEncumbered: v })),
  },
  {
    id: 'coApplicantIncome',
    factKey: 'coApplicantIncome',
    tier: 'additional',
    text: 'Would anyone apply jointly with you, and what do they earn?',
    why: 'A co-applicant is jointly liable, so a lender counts their income alongside yours. It is often the quickest way to raise what you can be offered.',
    kind: 'number',
    unit: 'rupees',
    placeholder: '18,000',
    allowUnknown: true,
    applies: always,
    probes: (f) => {
      const base = incomeMid(f);
      return [0, base * 0.3, base * 0.8].map((v) =>
        withFact(f, { coApplicantIncome: exact(v) }),
      );
    },
  },
  {
    id: 'dependants',
    factKey: 'dependants',
    tier: 'additional',
    text: 'How many people depend on your income?',
    why: 'A household of five cannot cut spending as fast as a single earner when a bad month comes, so we hold more back.',
    kind: 'number',
    unit: 'count',
    placeholder: '2',
    allowUnknown: true,
    applies: always,
    probes: (f) => [0, 2, 4].map((v) => withFact(f, { dependants: exact(v) })),
  },
  {
    id: 'emergencySavingsMonths',
    factKey: 'emergencySavingsMonths',
    tier: 'additional',
    text: 'If your income stopped, how many months could you cover from savings?',
    why: 'Savings are what turn a shock into an inconvenience instead of a missed payment. With no buffer we lower what we think you can safely carry.',
    kind: 'number',
    unit: 'months',
    placeholder: '3',
    allowUnknown: true,
    applies: always,
    probes: (f) => [0, 2, 6].map((v) => withFact(f, { emergencySavingsMonths: exact(v) })),
  },
  {
    id: 'variableIncomeShare',
    factKey: 'variableIncomeShare',
    tier: 'additional',
    text: 'How much of your income changes from month to month?',
    why: 'We discount the part that varies, because you have to make the payment in the slow months too.',
    kind: 'choice',
    choices: [
      { value: '0', label: 'None — it is the same every month' },
      { value: '0.3', label: 'About a third' },
      { value: '0.6', label: 'More than half' },
      { value: '1', label: 'Almost all of it' },
    ],
    allowUnknown: true,
    applies: (f) => f.incomeType !== 'salaried',
    appliesWhen: 'not salaried',
    probes: (f) =>
      [0, 0.3, 0.8].map((v) => withFact(f, { variableIncomeShare: exact(v) })),
  },
  {
    id: 'bouncesLast12m',
    factKey: 'bouncesLast12m',
    tier: 'additional',
    text: 'Have any payments bounced or been missed in the last year?',
    why: 'A recent miss is the most expensive single item a lender can see, and it costs you a grade whatever your score says.',
    kind: 'number',
    unit: 'count',
    placeholder: '0',
    allowUnknown: true,
    applies: always,
    probes: (f) => [0, 1, 3].map((v) => withFact(f, { bouncesLast12m: exact(v) })),
  },
  {
    id: 'existingLoans',
    factKey: 'existingLoans',
    tier: 'additional',
    text: 'Can you list the loans you are paying, with the rate on each?',
    why: 'The rate matters as much as the amount. Debt above 24% should usually be cleared before anything new is taken on.',
    kind: 'loans',
    allowUnknown: true,
    // Pointless unless they actually owe something.
    applies: (f) => lo(f.existingEmiTotal, 0) > 0 || (f.existingLoans?.length ?? 0) > 0,
    appliesWhen: 'only if they already pay EMIs',
    probes: (f) => {
      const emi = lo(f.existingEmiTotal, 0);
      if (emi <= 0) return [f];
      return [
        withFact(f, {
          existingLoans: [{ label: 'Existing', emi, ratePct: exact(12) }],
        }),
        withFact(f, {
          existingLoans: [
            { label: 'Existing', emi, ratePct: exact(32), highCost: true, outstanding: exact(emi * 6) },
          ],
        }),
      ];
    },
  },
  {
    id: 'incomeStabilityYears',
    factKey: 'incomeStabilityYears',
    tier: 'additional',
    text: 'How long have you been earning this way?',
    why: 'Length of track record is what a lender leans on when there is no score to go by.',
    kind: 'number',
    unit: 'years',
    placeholder: '5',
    allowUnknown: true,
    applies: always,
    probes: (f) => [0.5, 3, 12].map((v) => withFact(f, { incomeStabilityYears: exact(v) })),
  },
  {
    id: 'cardUtilisationPct',
    factKey: 'cardUtilisationPct',
    tier: 'additional',
    text: 'How much of your credit card limit are you using?',
    why: 'Running a card near its limit pulls a score down even when every payment is on time.',
    kind: 'number',
    unit: 'pct',
    placeholder: '20',
    allowUnknown: true,
    // Only meaningful for someone who already has a credit file.
    applies: (f) => isKnown(f.creditScore),
    appliesWhen: 'only if a credit file already exists',
    probes: (f) => [10, 50, 95].map((v) => withFact(f, { cardUtilisationPct: exact(v) })),
  },
  {
    id: 'productiveMonthlyGain',
    factKey: 'productiveMonthlyGain',
    tier: 'additional',
    text: 'How much extra do you expect to earn each month because of this?',
    why: 'A loan that earns can carry a little more — but only half of what you project, because the EMI starts before the earnings do.',
    kind: 'number',
    unit: 'rupees',
    placeholder: '12,000',
    allowUnknown: true,
    // Only makes sense when the money is being put to work.
    applies: (f) => isProductive(f.purpose),
    appliesWhen: 'only when the loan is productive',
    probes: (f) => {
      const base = incomeMid(f);
      return [0, base * 0.2, base * 0.6].map((v) =>
        withFact(f, { productiveMonthlyGain: exact(v) }),
      );
    },
  },
  {
    id: 'upcomingExpenseMonthly',
    factKey: 'upcomingExpenseMonthly',
    tier: 'additional',
    text: 'Is there a large expense coming in the next year?',
    why: 'School fees, a wedding or a medical cost landing mid-loan is one of the commonest reasons an affordable EMI stops being affordable.',
    kind: 'number',
    unit: 'rupees',
    placeholder: '0',
    allowUnknown: true,
    applies: always,
    probes: (f) => {
      const base = incomeMid(f);
      return [0, base * 0.1, base * 0.3].map((v) =>
        withFact(f, { upcomingExpenseMonthly: exact(v) }),
      );
    },
  },
  {
    id: 'offer',
    factKey: 'offer',
    tier: 'negotiation',
    text: 'Has a lender already quoted you something?',
    why: 'Give us the rate, the fee and the tenure and we will work out what it actually costs, and what to say if it is above fair.',
    kind: 'number',
    unit: 'pct',
    placeholder: '14',
    allowUnknown: true,
    applies: always,
    // An existing offer never changes the assessment — it is scored against it.
    probes: (f) => [f],
  },
];

export const QUESTIONS: readonly Question[] = [...CORE, ...ADDITIONAL];

export const CORE_QUESTIONS: readonly Question[] = CORE;
export const ADDITIONAL_QUESTIONS: readonly Question[] = ADDITIONAL.filter(
  (q) => q.tier === 'additional',
);
export const NEGOTIATION_QUESTIONS: readonly Question[] = ADDITIONAL.filter(
  (q) => q.tier === 'negotiation',
);

export function questionById(id: string): Question | undefined {
  return QUESTIONS.find((q) => q.id === id);
}

/**
 * Has this question already been answered?
 *
 * Every branch here must return true for whatever `answerFor` and
 * `unknownAnswerFor` produce, or the interview loops forever on that question.
 * An empty loan list is a real answer — "I have nothing to itemise" — and must
 * not be mistaken for silence.
 */
export function isAnswered(facts: BorrowerFacts, q: Question): boolean {
  const value = (facts as Record<string, unknown>)[q.factKey];
  if (q.kind === 'boolean') return typeof value === 'boolean';
  if (q.kind === 'loans') return Array.isArray(value);
  // "Not sure which product" is an answer, recorded on its own flag so it is
  // distinguishable from never having been asked.
  if (q.factKey === 'productWanted') {
    return facts.productWanted !== undefined || facts.productWantedUnsure === true;
  }
  // "I don't know" counts as answered — we asked, they told us, and UNKNOWN
  // carries real meaning downstream. Asking again would be nagging.
  return value !== undefined;
}

/**
 * What to store when the borrower declines to answer.
 *
 * Returns a *patch*, not a single value, and that is load-bearing. Most
 * questions record their own field as UNKNOWN, which the engine handles
 * explicitly. But the typed enum fields have no "unknown" member, so writing
 * one there is a type violation that reaches the engine as a live crash —
 * `PRODUCTS[UNKNOWN].label` threw exactly that way. Some questions therefore
 * record their non-answer on a *different* field, and only a patch can express
 * that.
 *
 * Every question must be skippable, and skipping must never be read as zero.
 */
export function skipPatch(q: Question): Partial<BorrowerFacts> {
  // A question that cannot be skipped has no skip patch. Returning an empty one
  // means an interview that wrongly offered a skip simply re-asks, instead of
  // writing a non-member value into a typed field — which is how UNKNOWN ended
  // up in `purpose` and `productWanted`.
  if (!q.allowUnknown) return {};

  // "No idea which product" is recorded on its own flag, leaving the product
  // itself unset so routing simply picks and we claim no redirect.
  if (q.factKey === 'productWanted') return { productWantedUnsure: true };
  if (q.kind === 'boolean') return { [q.factKey]: false };
  if (q.kind === 'loans') return { existingLoans: [] };
  // A borrower who will not say what they could pledge is treated as having
  // nothing — the conservative reading, and it keeps follow-ups from firing.
  if (q.factKey === 'collateralType') return { collateralType: 'none' satisfies CollateralType };
  return { [q.factKey]: UNKNOWN };
}

/**
 * How far through the core set the borrower is.
 *
 * Lives here rather than in the component so it can be tested: the first
 * version of this was derived from the 3-item "what we will ask next" preview,
 * which made the progress rail start two-thirds full and report 7 of 9 on the
 * opening question.
 */
export function coreProgress(facts: BorrowerFacts): { done: number; total: number } {
  return {
    done: CORE.filter((q) => isAnswered(facts, q)).length,
    total: CORE.length,
  };
}

/** Questions still worth putting to this borrower, before VOI ranking. */
export function unansweredApplicable(
  facts: BorrowerFacts,
  tier?: QuestionTier,
): Question[] {
  return QUESTIONS.filter(
    (q) =>
      (tier === undefined || q.tier === tier) &&
      !isAnswered(facts, q) &&
      q.applies(facts),
  );
}

/** Parse the variable-income choice back into a number. */
export function parseChoiceNumber(value: string): ReturnType<typeof exact> {
  const n = Number(value);
  return exact(Number.isFinite(n) ? n : 0);
}

export { range as answerRange, exact as answerExact, UNKNOWN as answerUnknown };
