import { describe, it, expect } from 'vitest';
import {
  QUESTIONS,
  CORE_QUESTIONS,
  coreProgress,
  isAnswered,
  skipPatch,
  questionById,
  type Question,
} from '../questions';
import { nextQuestion } from '../voi';
import { assess } from '../assess';
import { exact, type BorrowerFacts } from '../facts';
import { raviMust, anitaMust, priyaMust } from '../personas';

/**
 * Regression tests for the interview loop getting stuck.
 *
 * The original bug: `isAnswered` required a non-empty array for the "list your
 * loans" question, but both "Next" with nothing filled in and "Skip this"
 * submit an empty array — so the question was never marked answered and the app
 * re-asked it forever, with no way past it.
 *
 * The invariant that prevents the whole class of bug: whatever an answer widget
 * can produce, `isAnswered` must accept.
 */

/** A sensible real answer for each question kind, as the UI would produce. */
function realAnswerFor(q: Question): unknown {
  switch (q.kind) {
    case 'boolean':
      return true;
    case 'loans':
      return [{ label: 'Test loan', emi: 2000 }];
    case 'choice':
      if (q.factKey === 'variableIncomeShare') return exact(0.3);
      return q.choices?.[0]?.value;
    default:
      return exact(1000);
  }
}

describe('every answer a widget can produce must count as answered', () => {
  it('accepts a real answer for every question', () => {
    for (const q of QUESTIONS) {
      const facts = { ...raviMust, [q.factKey]: realAnswerFor(q) } as BorrowerFacts;
      expect(isAnswered(facts, q), `real answer to "${q.id}"`).toBe(true);
    }
  });

  it('accepts the skip value for every skippable question', () => {
    for (const q of QUESTIONS) {
      if (!q.allowUnknown) continue;
      const facts = { ...raviMust, ...skipPatch(q) } as BorrowerFacts;
      expect(isAnswered(facts, q), `skipping "${q.id}"`).toBe(true);
    }
  });

  it('never writes a non-member value into a typed enum field', () => {
    // Writing UNKNOWN into productWanted crashed routing on PRODUCTS[value];
    // purpose and incomeType had the same latent hazard.
    const enumFields = ['productWanted', 'collateralType', 'purpose', 'incomeType'];
    for (const q of QUESTIONS) {
      const patch = skipPatch(q) as Record<string, unknown>;
      for (const key of enumFields) {
        if (key in patch) {
          expect(typeof patch[key], `${q.id} -> ${key}`).toBe('string');
        }
      }
    }
  });

  it('offers no skip patch for a question that cannot be skipped', () => {
    for (const q of QUESTIONS) {
      if (q.allowUnknown) continue;
      expect(Object.keys(skipPatch(q)), `${q.id} is required`).toHaveLength(0);
    }
  });

  it('survives a skipped product question without crashing routing', () => {
    const q = questionById('productWanted')!;
    const facts = { ...raviMust, productWanted: undefined, ...skipPatch(q) } as BorrowerFacts;
    expect(() => assess(facts)).not.toThrow();
    // Nothing was asked for, so nothing can have been redirected.
    expect(assess(facts).routing.redirected).toBe(false);
  });

  it('treats an empty loan list as an answer, not as silence', () => {
    // This is the exact bug: "I have nothing to itemise" is information.
    const q = questionById('existingLoans')!;
    expect(isAnswered({ ...anitaMust, existingLoans: [] }, q)).toBe(true);
  });

  it('does not read an empty loan list as having no obligations', () => {
    // Skipping the breakdown must fall back to the total they already gave us,
    // not silently zero out their existing EMIs.
    const skipped = assess({ ...anitaMust, existingLoans: [] });
    const never = assess(anitaMust);
    expect(skipped.affordability.lenderEmi.high).toBeCloseTo(
      never.affordability.lenderEmi.high,
      6,
    );
  });
});

describe('skipping a question never reads as zero', () => {
  it('keeps an unanswered credit score as unknown, not as a bad score', () => {
    const q = questionById('creditScore')!;
    const facts = { ...priyaMust, ...skipPatch(q) } as BorrowerFacts;
    const a = assess(facts);
    // Priya without a score should not collapse to the worst grade.
    expect(a.pricing.grades.best).not.toBe('D');
    expect(a.pricing.grades.spanned).toBeGreaterThan(1);
  });

  it('stores a neutral value when declining to name collateral', () => {
    // UNKNOWN is not a member of CollateralType, and writing one there used to
    // make the "what is it worth?" follow-up fire on a non-answer.
    const q = questionById('collateralType')!;
    expect(skipPatch(q).collateralType).toBe('none');
    const facts = { ...raviMust, collateralType: 'none' } as BorrowerFacts;
    expect(questionById('collateralValue')!.applies(facts)).toBe(false);
  });
});

describe('the interview terminates', () => {
  const drive = (
    target: BorrowerFacts,
    strategy: 'answer' | 'skip',
  ): { facts: BorrowerFacts; asked: string[] } => {
    let facts: BorrowerFacts = {};
    const asked: string[] = [];

    for (let i = 0; i < 100; i++) {
      const next = nextQuestion(facts);
      if (!next) break;
      const q = next.question;

      // The same question twice means we are stuck.
      expect(asked, `asked "${q.id}" twice`).not.toContain(q.id);
      asked.push(q.id);

      const fromTarget = (target as Record<string, unknown>)[q.factKey];
      if (strategy === 'answer' && fromTarget !== undefined) {
        facts = { ...facts, [q.factKey]: fromTarget };
      } else if (q.allowUnknown) {
        facts = { ...facts, ...skipPatch(q) };
      } else {
        facts = { ...facts, [q.factKey]: fromTarget ?? realAnswerFor(q) };
      }
    }

    return { facts, asked };
  };

  for (const [name, persona] of [
    ['Priya', priyaMust],
    ['Ravi', raviMust],
    ['Anita', anitaMust],
  ] as const) {
    it(`${name}: finishes when every question is answered`, () => {
      const { facts, asked } = drive(persona, 'answer');
      expect(asked.length).toBeGreaterThan(5);
      expect(nextQuestion(facts)).toBeUndefined();
    });

    it(`${name}: finishes even when everything skippable is skipped`, () => {
      const { facts, asked } = drive(persona, 'skip');
      expect(asked.length).toBeGreaterThan(5);
      expect(nextQuestion(facts)).toBeUndefined();
      // And still produces all four outputs, just with less confidence.
      const a = assess(facts);
      expect(a.ready).toBe(true);
      expect(a.confidence.score).toBeLessThan(assess(persona).confidence.score + 0.5);
    });
  }
});

describe('core progress', () => {
  it('starts at zero, not part-way through', () => {
    // The rail was derived from the 3-item preview list, so it opened at 6 of 9.
    expect(coreProgress({}).done).toBe(0);
    expect(coreProgress({}).total).toBe(CORE_QUESTIONS.length);
  });

  it('advances by one per core question answered', () => {
    let facts: BorrowerFacts = {};
    let last = 0;
    for (const q of CORE_QUESTIONS) {
      facts = { ...facts, [q.factKey]: realAnswerFor(q) };
      const { done } = coreProgress(facts);
      expect(done).toBe(last + 1);
      last = done;
    }
    expect(coreProgress(facts).done).toBe(CORE_QUESTIONS.length);
  });

  it('counts a skipped question as progress', () => {
    const q = CORE_QUESTIONS.find((x) => x.allowUnknown)!;
    expect(coreProgress({ ...skipPatch(q) }).done).toBe(1);
  });

  it('never reports more done than there are questions', () => {
    for (const persona of [priyaMust, raviMust, anitaMust]) {
      const { done, total } = coreProgress(persona);
      expect(done).toBeLessThanOrEqual(total);
      expect(done).toBeGreaterThanOrEqual(0);
    }
  });
});
