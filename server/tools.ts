/**
 * The kernel, exposed to Gemini as a toolset.
 *
 * This is the arrangement that makes the copilot both useful and defensible: the
 * model drives the conversation and decides which tool to reach for, but every
 * number it can see comes from the same pure functions the UI renders. It
 * orchestrates; it never calculates.
 *
 * One tool deserves special note. `get_next_questions` returns the
 * value-of-information ranking, *including what each question is worth*. The
 * model picks and words a question from that list — it cannot invent one. So the
 * brief's rule that every additional question must move a number survives
 * intact even though the conversation feels open-ended.
 */

import type { BorrowerFacts, Num } from '../src/engine/facts';
import { exact, range, UNKNOWN } from '../src/engine/facts';
import { assess } from '../src/engine/assess';
import { nextQuestions, rankQuestions } from '../src/engine/voi';
import { compareQuote } from '../src/engine/pricing';
import { explainAll, negotiationCard, comparisonAmount } from '../src/engine/explain';
import { questionById } from '../src/engine/questions';
import { formatINR, formatINRCompact, formatPct } from '../src/engine/trace';

/** Gemini function declarations. Kept small — a big toolset invites confusion. */
export const TOOL_DECLARATIONS = [
  {
    type: 'function',
    name: 'get_assessment',
    description:
      'The borrower\'s current full assessment: the verdict, both maximum amounts, ' +
      'the fair rate band, the all-in APR, the monthly ceiling, the stress test, and ' +
      'the confidence level. Call this before answering any question about their ' +
      'numbers. Every figure you state must come from here or from another tool.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    type: 'function',
    name: 'set_facts',
    description:
      'Record what the borrower has told you. Use this whenever they mention income, ' +
      'expenses, rent, existing EMIs, age, credit score, dependants, savings, ' +
      'collateral or the amount they want. Ranges are supported and preferred over ' +
      'guessing a single figure. Never invent a value they did not give you; omit it ' +
      'instead. Recording a fact updates the app on their screen.',
    parameters: {
      type: 'object',
      properties: {
        purpose: {
          type: 'string',
          enum: [
            'wedding', 'medical', 'education', 'home_purchase', 'business_expansion',
            'vehicle_productive', 'vehicle_personal', 'debt_consolidation', 'consumption', 'other',
          ],
        },
        incomeType: { type: 'string', enum: ['salaried', 'self_employed', 'informal'] },
        collateralType: { type: 'string', enum: ['property', 'gold', 'vehicle', 'none'] },
        amountWanted: { type: 'number' },
        netMonthlyIncomeLow: { type: 'number', description: 'Low end if income varies, else the figure' },
        netMonthlyIncomeHigh: { type: 'number', description: 'High end if income varies' },
        existingEmiTotal: { type: 'number' },
        householdExpenses: { type: 'number' },
        rent: { type: 'number' },
        age: { type: 'number' },
        creditScore: { type: 'number', description: 'Omit entirely if they do not know it' },
        creditScoreUnknown: { type: 'boolean', description: 'True if they said they do not know their score' },
        dependants: { type: 'number' },
        emergencySavingsMonths: { type: 'number' },
        documentedIncomeAnnual: { type: 'number', description: 'Income shown on filed returns (ITR)' },
        collateralValue: { type: 'number' },
        coApplicantIncome: { type: 'number' },
        variableIncomeShare: { type: 'number', description: '0 to 1' },
        bouncesLast12m: { type: 'number' },
        productiveMonthlyGain: { type: 'number', description: 'Extra monthly income the loan will generate' },
        incomeStabilityYears: { type: 'number' },
      },
      required: [],
    },
  },
  {
    type: 'function',
    name: 'get_next_questions',
    description:
      'The questions worth asking next, ranked by how much they would actually move ' +
      'the borrower\'s numbers, with the rupee or percentage value of each. You must ' +
      'choose from this list — do not invent questions of your own. You may reword the ' +
      'one you pick to suit how this borrower talks.',
    parameters: {
      type: 'object',
      properties: { limit: { type: 'number', description: 'How many to return, default 3' } },
      required: [],
    },
  },
  {
    type: 'function',
    name: 'compare_quote',
    description:
      'Score a rate a lender has actually offered against what is fair for this ' +
      'borrower, including the true APR once fees are counted, and what the gap costs ' +
      'over the full tenure.',
    parameters: {
      type: 'object',
      properties: {
        ratePct: { type: 'number' },
        processingFeePct: { type: 'number' },
        bundledChargesRupees: { type: 'number' },
        tenureMonths: { type: 'number' },
        amountRupees: { type: 'number' },
      },
      required: ['ratePct'],
    },
  },
  {
    type: 'function',
    name: 'get_negotiation_card',
    description:
      'The one-page card the borrower takes into the branch: what to ask for, the rate ' +
      'to accept, the EMI ceiling, and the lines to say.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    type: 'function',
    name: 'explain_output',
    description:
      'The full working behind one of the four outputs, step by step, for a borrower ' +
      'who asks why a number is what it is.',
    parameters: {
      type: 'object',
      properties: {
        output: {
          type: 'string',
          enum: ['O1', 'O2', 'O3', 'O4'],
          description: 'O1 verdict, O2 amount, O3 rate, O4 EMI ceiling',
        },
      },
      required: ['output'],
    },
  },
] as const;

export interface ToolContext {
  facts: BorrowerFacts;
}

export interface ToolOutcome {
  result: unknown;
  /** Set when the tool changed the borrower's facts, so the UI can follow. */
  factsPatch?: Partial<BorrowerFacts>;
}

type Args = Record<string, unknown>;

function numArg(args: Args, key: string): number | undefined {
  const v = args[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/** Build the facts patch from whatever the model recorded. */
function buildPatch(args: Args): Partial<BorrowerFacts> {
  const patch: Partial<BorrowerFacts> = {};

  const simpleNums: [string, keyof BorrowerFacts][] = [
    ['amountWanted', 'amountWanted'],
    ['existingEmiTotal', 'existingEmiTotal'],
    ['householdExpenses', 'householdExpenses'],
    ['rent', 'rent'],
    ['age', 'age'],
    ['dependants', 'dependants'],
    ['emergencySavingsMonths', 'emergencySavingsMonths'],
    ['documentedIncomeAnnual', 'documentedIncomeAnnual'],
    ['collateralValue', 'collateralValue'],
    ['coApplicantIncome', 'coApplicantIncome'],
    ['variableIncomeShare', 'variableIncomeShare'],
    ['bouncesLast12m', 'bouncesLast12m'],
    ['productiveMonthlyGain', 'productiveMonthlyGain'],
    ['incomeStabilityYears', 'incomeStabilityYears'],
  ];

  for (const [argKey, factKey] of simpleNums) {
    const v = numArg(args, argKey);
    if (v !== undefined) (patch as Record<string, Num>)[factKey] = exact(v);
  }

  const low = numArg(args, 'netMonthlyIncomeLow');
  const high = numArg(args, 'netMonthlyIncomeHigh');
  if (low !== undefined && high !== undefined && high !== low) {
    patch.netMonthlyIncome = range(low, high);
  } else if (low !== undefined) {
    patch.netMonthlyIncome = exact(low);
  }

  // An unknown score is a real answer, and must never become a zero.
  if (args.creditScoreUnknown === true) {
    patch.creditScore = UNKNOWN;
  } else {
    const score = numArg(args, 'creditScore');
    if (score !== undefined) patch.creditScore = exact(score);
  }

  for (const key of ['purpose', 'incomeType', 'collateralType'] as const) {
    const v = args[key];
    if (typeof v === 'string') (patch as Record<string, string>)[key] = v;
  }

  return patch;
}

/**
 * Run one tool call against the kernel.
 *
 * Returns compact, already-formatted values. The model reasons better about
 * "₹14,509 a month" than about 14509.3128, and formatting here means the strings
 * the borrower eventually sees match the strings the UI shows.
 */
export function runTool(name: string, args: Args, ctx: ToolContext): ToolOutcome {
  switch (name) {
    case 'get_assessment': {
      const a = assess(ctx.facts);
      return {
        result: {
          ready: a.ready,
          missing: a.missingMust,
          verdict: a.verdict.verdict,
          headline: a.verdict.headline,
          because: a.verdict.because,
          product: a.product,
          productLabel: a.routing.options[0]?.label,
          redirectedFrom: a.routing.redirected ? a.routing.requested : null,
          lenderWillSanction: `${formatINRCompact(a.eligibility.lenderMax.low)} to ${formatINRCompact(a.eligibility.lenderMax.high)}`,
          youCanSafelyCarry: `${formatINRCompact(a.eligibility.safeMax.low)} to ${formatINRCompact(a.eligibility.safeMax.high)}`,
          useThisAmount: formatINRCompact(a.eligibility.useThis.high),
          bindingConstraint: a.eligibility.binding,
          fairRate: `${formatPct(a.pricing.rateBand.low)} to ${formatPct(a.pricing.rateBand.high)}`,
          allInApr: `${formatPct(a.pricing.aprBand.low)} to ${formatPct(a.pricing.aprBand.high)}`,
          riskGrade: a.pricing.grades.spanned > 1
            ? `${a.pricing.grades.best} to ${a.pricing.grades.worst}`
            : a.pricing.grades.best,
          emiCeiling: formatINR(a.ceiling.emiCeiling.high),
          tenureMonths: a.eligibility.safeTenureMonths,
          stressTest: a.ceiling.stress.survivesBoth ? 'holds' : 'fails',
          stressDetail: a.ceiling.stress.detail,
          confidencePct: Math.round(a.confidence.score * 100),
          assumptions: a.assumptions.map((x) => x.note),
          actions: a.verdict.actions,
        },
      };
    }

    case 'set_facts': {
      const patch = buildPatch(args);
      if (Object.keys(patch).length === 0) {
        return { result: { recorded: false, note: 'Nothing recognisable to record.' } };
      }
      const merged = { ...ctx.facts, ...patch };
      ctx.facts = merged;
      const a = assess(merged);
      return {
        factsPatch: patch,
        result: {
          recorded: Object.keys(patch),
          verdictNow: a.verdict.verdict,
          useThisAmount: formatINRCompact(a.eligibility.useThis.high),
          emiCeiling: formatINR(a.ceiling.emiCeiling.high),
          confidencePct: Math.round(a.confidence.score * 100),
          stillMissing: a.missingMust,
        },
      };
    }

    case 'get_next_questions': {
      const limit = numArg(args, 'limit') ?? 3;
      const ranked = nextQuestions(ctx.facts, Math.min(6, Math.max(1, limit)));
      return {
        result: {
          questions: ranked.map((v) => ({
            id: v.question.id,
            tier: v.question.tier,
            suggestedWording: v.question.text,
            whyWeAsk: v.question.why,
            worthAsking: v.impact,
            couldMoveAmountBy: formatINR(v.amountDeltaRupees),
            couldMoveRateBy: formatPct(v.rateDeltaPp),
            couldChangeVerdict: v.flipsVerdict,
          })),
          note:
            'Pick one of these and ask it in your own words. Do not ask anything that ' +
            'is not on this list.',
        },
      };
    }

    case 'compare_quote': {
      const rate = numArg(args, 'ratePct');
      if (rate === undefined) return { result: { error: 'ratePct is required' } };
      const a = assess(ctx.facts);
      // Falls back to the requested amount when the verdict is "don't borrow",
      // since a comparison against a zero-rupee loan scores every offer as good.
      const amount = numArg(args, 'amountRupees') ?? comparisonAmount(a, ctx.facts).amount;
      if (amount < 1000) {
        return {
          result: {
            error:
              'No amount to compare against. Ask the borrower how much they want before pricing an offer.',
          },
        };
      }
      const tenure = numArg(args, 'tenureMonths') ?? a.eligibility.safeTenureMonths;

      const c = compareQuote(
        ctx.facts,
        a.product,
        Math.max(1, amount),
        rate,
        tenure,
        numArg(args, 'processingFeePct') ?? 0,
        numArg(args, 'bundledChargesRupees') ?? 0,
      );

      return {
        result: {
          stance: c.stance,
          quotedRate: formatPct(c.quotedRatePct),
          trueAllInApr: formatPct(c.quotedAprPct),
          fairRate: `${formatPct(c.fairRateBand.low)} to ${formatPct(c.fairRateBand.high)}`,
          fairApr: `${formatPct(c.fairAprBand.low)} to ${formatPct(c.fairAprBand.high)}`,
          pointsAboveFair: c.excessPp > 0 ? formatPct(c.excessPp) : 'within the fair band',
          monthlyInstalment: formatINR(c.emi),
          instalmentAtFairCeiling: formatINR(c.emiAtFairCeiling),
          instalmentAtBestFairRate: formatINR(c.emiAtBestRate),
          costOfBeingAboveFair: c.costOfExcessRupees > 0 ? formatINR(c.costOfExcessRupees) : 'nothing — the quote is inside the fair band',
          stillNegotiableOverTenure: formatINR(c.upsideToBestRupees),
          tenureLongerThanProductNormallyRuns: c.tenureBeyondProductMax,
        },
      };
    }

    case 'get_negotiation_card': {
      return { result: negotiationCard(assess(ctx.facts)) };
    }

    case 'explain_output': {
      const which = String(args.output ?? 'O1') as 'O1' | 'O2' | 'O3' | 'O4';
      const ex = explainAll(assess(ctx.facts));
      const chosen = ex[which] ?? ex.O1;
      return {
        result: {
          title: chosen.title,
          answer: chosen.headline,
          why: chosen.because,
          workingSteps: chosen.steps.map((s) => `${s.label}: ${s.detail}`),
        },
      };
    }

    default:
      return { result: { error: `Unknown tool: ${name}` } };
  }
}

/** Everything the copilot may legitimately say, for the numeric guardrail. */
export function allowedNumbersFor(facts: BorrowerFacts): number[] {
  const a = assess(facts);
  const extra: number[] = [];

  // The VOI figures are quotable too — the copilot uses them to justify asking.
  for (const v of rankQuestions(facts)) {
    extra.push(v.amountDeltaRupees, v.emiDeltaRupees, v.rateDeltaPp);
  }

  // As are the values on the card and any answer the borrower gave.
  for (const q of ['amountWanted', 'netMonthlyIncome'] as const) {
    const value = facts[q];
    if (value && typeof value === 'object' && 'kind' in value) {
      if (value.kind === 'exact') extra.push(value.value);
      if (value.kind === 'range') extra.push(value.low, value.high);
    }
  }

  if (facts.offer) {
    extra.push(
      facts.offer.ratePct,
      facts.offer.tenureMonths,
      facts.offer.processingFeePct ?? 0,
    );
  }

  return [...a.allowedNumbers, ...extra];
}

/** Description of the tool surface, for the run-through docs. */
export const TOOL_NAMES = TOOL_DECLARATIONS.map((t) => t.name);

export { questionById };
