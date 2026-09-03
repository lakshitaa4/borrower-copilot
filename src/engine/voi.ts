/**
 * Value of information — how the app decides what to ask next.
 *
 * The brief's rule is that every additional question must change an output, and
 * that a question which never moves a number should be cut. Most tools honour
 * that by taste. This one measures it.
 *
 * For each candidate question we replay a handful of plausible answers through
 * the *entire* assessment and look at how far the outputs travel. A question
 * whose answers all land on the same numbers is worthless to this borrower and
 * is dropped — not deprioritised, dropped. The consequence is that the question
 * set adapts on its own: change a threshold in the rulebook and questions that
 * stop mattering disappear without anyone editing a list.
 *
 * It also means the ordering is defensible. We can say, of any question, exactly
 * how many rupees of uncertainty answering it would remove.
 */

import { QUESTION_POLICY, VOI_WEIGHTS } from './rulebook';
import type { BorrowerFacts } from './facts';
import { assess, type Assessment } from './assess';
import {
  unansweredApplicable,
  type Question,
  type QuestionTier,
} from './questions';
import { formatINR, formatPct } from './trace';
import type { Verdict } from './verdict';

export interface QuestionValue {
  question: Question;
  /** How far the recommended amount could move, in rupees. */
  amountDeltaRupees: number;
  /** How far the monthly ceiling could move, in rupees. */
  emiDeltaRupees: number;
  /** How far the rate band's midpoint could move, in points. */
  rateDeltaPp: number;
  /** Could the answer change borrow / borrow less / don't borrow outright? */
  flipsVerdict: boolean;
  verdictsSeen: Verdict[];
  score: number;
  /** False means this question cannot move anything for this borrower. */
  earnsItsPlace: boolean;
  /** One line the borrower can read: what answering this is worth. */
  impact: string;
}

function spreadOf(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.max(...values) - Math.min(...values);
}

/**
 * Price a single question by replaying its plausible answers.
 *
 * Note this measures the *spread of outcomes*, not the distance from the current
 * answer. That is the right quantity: it is how much of the uncertainty in the
 * output this one question is responsible for.
 */
export function valueOf(facts: BorrowerFacts, question: Question): QuestionValue {
  const base = assess(facts);
  const probes = question.probes(facts);

  const amounts: number[] = [];
  const emis: number[] = [];
  const rates: number[] = [];
  const verdicts = new Set<Verdict>();

  for (const probe of probes) {
    const a = assess(probe);
    amounts.push(a.eligibility.useThis.high);
    emis.push(a.ceiling.emiCeiling.high);
    rates.push((a.pricing.rateBand.low + a.pricing.rateBand.high) / 2);
    verdicts.add(a.verdict.verdict);
  }

  const amountDelta = spreadOf(amounts);
  const emiDelta = spreadOf(emis);
  const rateDelta = spreadOf(rates);
  const flips = verdicts.size > 1;

  // Movement is scored relative to this borrower's own numbers: ₹5,000 means
  // something very different to Anita than it does to Priya.
  const amountRef = Math.max(base.eligibility.useThis.high, 50000);
  const emiRef = Math.max(base.ceiling.emiCeiling.high, 2000);

  const score =
    (flips ? VOI_WEIGHTS.verdictFlip : 0) +
    VOI_WEIGHTS.amountShare * (amountDelta / amountRef) +
    VOI_WEIGHTS.emiShare * (emiDelta / emiRef) +
    VOI_WEIGHTS.ratePerPoint * rateDelta;

  const earnsItsPlace =
    flips ||
    amountDelta >= QUESTION_POLICY.minAmountDeltaRupees ||
    emiDelta >= QUESTION_POLICY.minEmiDeltaRupees ||
    rateDelta >= QUESTION_POLICY.minRateDeltaPp;

  return {
    question,
    amountDeltaRupees: amountDelta,
    emiDeltaRupees: emiDelta,
    rateDeltaPp: rateDelta,
    flipsVerdict: flips,
    verdictsSeen: [...verdicts],
    score,
    earnsItsPlace,
    impact: describeImpact(flips, amountDelta, emiDelta, rateDelta),
  };
}

function describeImpact(
  flips: boolean,
  amountDelta: number,
  emiDelta: number,
  rateDelta: number,
): string {
  if (flips) return 'Could change the answer itself, not just the numbers.';
  if (amountDelta >= QUESTION_POLICY.minAmountDeltaRupees) {
    return `Worth up to ${formatINR(amountDelta)} on what you can borrow.`;
  }
  if (rateDelta >= QUESTION_POLICY.minRateDeltaPp) {
    return `Could narrow your rate by ${formatPct(rateDelta)}.`;
  }
  if (emiDelta >= QUESTION_POLICY.minEmiDeltaRupees) {
    return `Worth up to ${formatINR(emiDelta)} on your monthly ceiling.`;
  }
  return 'Would not change any of your numbers.';
}

/**
 * Every applicable unanswered question, priced and ranked.
 *
 * Core questions are always included — they are the minimum needed to produce
 * the outputs at all, so they are asked whether or not the simulation says they
 * move something. Additional questions have to earn it.
 */
export function rankQuestions(
  facts: BorrowerFacts,
  tier?: QuestionTier,
): QuestionValue[] {
  return unansweredApplicable(facts, tier)
    .map((q) => valueOf(facts, q))
    .sort((a, b) => b.score - a.score);
}

/**
 * What to ask next.
 *
 * Core first, in a sensible order, because we cannot compute anything without
 * them. Then whichever additional question removes the most uncertainty — and
 * nothing that removes none.
 */
export function nextQuestions(facts: BorrowerFacts, limit = 3): QuestionValue[] {
  const core = unansweredApplicable(facts, 'core');
  if (core.length > 0) {
    // Priced too, so the UI can still show what each one is worth.
    return core.slice(0, limit).map((q) => valueOf(facts, q));
  }

  return rankQuestions(facts, 'additional')
    .filter((v) => v.earnsItsPlace)
    .slice(0, limit);
}

/** The single best next question, or undefined when nothing is left worth asking. */
export function nextQuestion(facts: BorrowerFacts): QuestionValue | undefined {
  return nextQuestions(facts, 1)[0];
}

/** How many more questions we are willing to put to this borrower. */
export function remainingBudget(answeredAdditional: number): number {
  return Math.max(0, QUESTION_POLICY.maxAdditionalQuestions - answeredAdditional);
}

/**
 * The questions we dropped, and why — the receipt for the brief's rule.
 * Generated into RULES.md so the claim can be checked rather than believed.
 */
export function droppedQuestions(facts: BorrowerFacts): QuestionValue[] {
  return rankQuestions(facts, 'additional').filter((v) => !v.earnsItsPlace);
}

/** Convenience for callers that want the assessment and the next step together. */
export function assessAndAsk(
  facts: BorrowerFacts,
  limit = 3,
): { assessment: Assessment; next: QuestionValue[] } {
  return { assessment: assess(facts), next: nextQuestions(facts, limit) };
}
