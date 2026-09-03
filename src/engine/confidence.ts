/**
 * Confidence, and what it costs to be silent.
 *
 * The brief's rule is that confidence widens with silence and that a range is
 * never narrowed without a basis. So confidence here is not decoration on the
 * UI — it is a multiplier that physically widens every output band, and the app
 * can name which unanswered question is responsible for which bit of width.
 */

import {
  CONFIDENCE_WEIGHTS,
  BAND_WIDENING_K,
  RANGE_SPREAD_PENALTY,
  LOW_CONFIDENCE_SAFETY_HAIRCUT,
} from './rulebook';
import { type BorrowerFacts, isKnown, spread } from './facts';
import { band, widenBand, type Band } from './emi';

export type FactKey = keyof typeof CONFIDENCE_WEIGHTS;

export interface ConfidenceResult {
  /** 0 to 1. Not a probability — a coverage score over the facts that matter. */
  score: number;
  answered: FactKey[];
  missing: FactKey[];
  /** Facts given as a wide range, which earn only partial credit. */
  vague: FactKey[];
  /** Multiplier applied to the half-width of every output band. */
  wideningFactor: number;
  label: 'low' | 'moderate' | 'good' | 'high';
}

const ALL_KEYS = Object.keys(CONFIDENCE_WEIGHTS) as FactKey[];

/** Whether a fact has been supplied at all, across the several shapes it can take. */
function isAnswered(facts: BorrowerFacts, key: FactKey): boolean {
  switch (key) {
    case 'incomeType':
      return facts.incomeType !== undefined;
    case 'purpose':
      return facts.purpose !== undefined;
    default: {
      const value = (facts as Record<string, unknown>)[key];
      return isKnown(value as never);
    }
  }
}

/** How much credit an answered fact earns — a tight answer earns more than a vague one. */
function creditFor(facts: BorrowerFacts, key: FactKey): number {
  if (key === 'incomeType' || key === 'purpose') return 1;
  const value = (facts as Record<string, unknown>)[key];
  const s = spread(value as never);
  return Math.max(0, 1 - RANGE_SPREAD_PENALTY * s);
}

export function confidence(facts: BorrowerFacts): ConfidenceResult {
  const answered: FactKey[] = [];
  const missing: FactKey[] = [];
  const vague: FactKey[] = [];

  let earned = 0;
  let total = 0;

  for (const key of ALL_KEYS) {
    const weight = CONFIDENCE_WEIGHTS[key];
    total += weight;
    if (isAnswered(facts, key)) {
      const credit = creditFor(facts, key);
      earned += weight * credit;
      answered.push(key);
      if (credit < 0.85) vague.push(key);
    } else {
      missing.push(key);
    }
  }

  const score = total > 0 ? Math.min(1, Math.max(0, earned / total)) : 0;

  return {
    score,
    answered,
    missing,
    vague,
    wideningFactor: 1 + BAND_WIDENING_K * (1 - score),
    label: score >= 0.8 ? 'high' : score >= 0.6 ? 'good' : score >= 0.4 ? 'moderate' : 'low',
  };
}

/**
 * Apply the confidence penalty to a band.
 *
 * Widening is symmetric about the centre, so low confidence makes the answer
 * vaguer without making it pessimistic. Being unmeasured is not the same as
 * being bad, and the arithmetic has to reflect that.
 */
export function widenForConfidence(b: Band, c: ConfidenceResult): Band {
  return widenBand(b, c.wideningFactor);
}

/**
 * Apply the confidence penalty to a figure that asserts affordability.
 *
 * Deliberately *not* symmetric. Widening a rate band when we are unsure is
 * honest; widening an affordability ceiling upward when we are unsure would let
 * missing information make a loan look more affordable, which is exactly
 * backwards. So these numbers shrink instead.
 */
export function tightenForSafety(b: Band, c: ConfidenceResult): Band {
  const factor = 1 - LOW_CONFIDENCE_SAFETY_HAIRCUT * (1 - c.score);
  return band(b.low * factor, b.high * factor);
}

/** Human-readable list of the facts most worth supplying next. */
export function biggestGaps(c: ConfidenceResult, limit = 3): FactKey[] {
  return [...c.missing]
    .sort((a, b) => CONFIDENCE_WEIGHTS[b] - CONFIDENCE_WEIGHTS[a])
    .slice(0, limit);
}
