import { describe, it, expect } from 'vitest';
import { rankQuestions, droppedQuestions, nextQuestions, valueOf } from '../voi';
import { unansweredApplicable, questionById, isAnswered } from '../questions';
import { priya, priyaMust, ravi, raviMust, anita, anitaMust } from '../personas';
import { exact } from '../facts';
import { assess } from '../assess';
import { SAVINGS_FLOOR_PCT, VARIABLE_INCOME_HAIRCUT } from '../rulebook';

describe('every question we ask must move a number', () => {
  const personas = [priyaMust, raviMust, anitaMust];

  it('drops any additional question that changes nothing', () => {
    for (const facts of personas) {
      for (const dropped of droppedQuestions(facts)) {
        expect(dropped.amountDeltaRupees).toBe(0);
        expect(dropped.emiDeltaRupees).toBe(0);
        expect(dropped.rateDeltaPp).toBe(0);
        expect(dropped.flipsVerdict).toBe(false);
      }
    }
  });

  it('never offers a question that does not earn its place', () => {
    for (const facts of personas) {
      for (const q of nextQuestions(facts, 10)) {
        // Core questions are always asked; additional ones must be worth it.
        if (q.question.tier === 'additional') {
          expect(q.earnsItsPlace).toBe(true);
        }
      }
    }
  });

  it('keeps the lender-quote question out of the ranking entirely', () => {
    // It cannot move the assessment by construction — it feeds the card. Rather
    // than let it score zero and be dropped, it lives in its own tier.
    for (const facts of personas) {
      const ranked = rankQuestions(facts, 'additional').map((v) => v.question.id);
      expect(ranked).not.toContain('offer');
    }
    expect(questionById('offer')!.tier).toBe('negotiation');
  });
});

describe('the ranking finds the question that actually matters', () => {
  it('asks Ravi about security first, because it is worth lakhs to him', () => {
    const ranked = rankQuestions(raviMust, 'additional');
    expect(ranked[0]!.question.id).toBe('collateralType');
    // The shop he already owns is the whole answer for him.
    expect(ranked[0]!.amountDeltaRupees).toBeGreaterThan(500000);
    expect(ranked[0]!.rateDeltaPp).toBeGreaterThan(5);
  });

  it('finds the co-applicant route that changes Anita\'s answer', () => {
    const ranked = rankQuestions(anitaMust, 'additional');
    const coApplicant = ranked.find((v) => v.question.id === 'coApplicantIncome')!;
    expect(coApplicant.flipsVerdict).toBe(true);
    expect(coApplicant.verdictsSeen).toContain('DONT_BORROW');
    // There is a version of this where she can borrow — that is worth knowing.
    expect(coApplicant.verdictsSeen).toContain('BORROW');
  });

  it('asks Priya about a co-applicant, once household income is modelled', () => {
    /**
     * This assertion used to be the opposite, and the old version was wrong.
     * A co-applicant's income was only being added to the lender's assessment,
     * so for a borrower already lender-abundant it appeared to move nothing.
     * But a co-applicant is in the same household: their earnings raise the
     * surplus too, which is what actually constrains Priya. Once that was
     * modelled the question started earning its place, correctly.
     */
    const value = valueOf(priyaMust, questionById('coApplicantIncome')!);
    expect(value.earnsItsPlace).toBe(true);
    expect(value.amountDeltaRupees).toBeGreaterThan(0);
  });

  it('counts a co-applicant on both sides of the ledger', () => {
    const alone = assess(priya);
    const joint = assess({ ...priya, coApplicantIncome: exact(40000) });
    // The lender clubs the income...
    expect(joint.affordability.assessedIncome.high).toBeGreaterThan(
      alone.affordability.assessedIncome.high,
    );
    // ...and the household can actually spend it.
    expect(joint.affordability.surplus.high).toBeGreaterThan(
      alone.affordability.surplus.high,
    );
  });

  it('does not discount a co-applicant\'s steady salary as variable', () => {
    // The variability the borrower described is their own. Applying the haircut
    // to the combined figure docked a spouse's fixed salary as if it fluctuated.
    // With variableIncomeShare at 1, that bug cost 30% of the co-applicant's
    // income; the correct answer keeps all of it bar the savings floor, which
    // does legitimately scale with household income.
    const CO = 20000;
    const base = { ...anita, variableIncomeShare: exact(1) };
    const gain =
      assess({ ...base, coApplicantIncome: exact(CO) }).affordability.surplus.high -
      assess(base).affordability.surplus.high;

    expect(gain).toBeCloseTo(CO * (1 - SAVINGS_FLOOR_PCT), 0);
    // Well clear of what the volatility haircut would have left.
    expect(gain).toBeGreaterThan(CO * (1 - VARIABLE_INCOME_HAIRCUT));
  });
});

describe('adaptive paths — a kirana owner and an IT employee see different questions', () => {
  it('never asks a salaried borrower about her filed returns', () => {
    const ids = unansweredApplicable(priyaMust).map((q) => q.id);
    expect(ids).not.toContain('documentedIncomeAnnual');
    expect(ids).not.toContain('variableIncomeShare');
  });

  it('does ask a self-employed borrower about his', () => {
    const ids = unansweredApplicable(raviMust).map((q) => q.id);
    expect(ids).toContain('documentedIncomeAnnual');
    expect(ids).toContain('variableIncomeShare');
  });

  it('does not ask about card utilisation when there is no credit file', () => {
    // Ravi and Anita have no score, so the question is meaningless to them.
    expect(unansweredApplicable(raviMust).map((q) => q.id)).not.toContain(
      'cardUtilisationPct',
    );
    expect(unansweredApplicable(priyaMust).map((q) => q.id)).toContain(
      'cardUtilisationPct',
    );
  });

  it('only asks what the loan will earn when the loan is productive', () => {
    // Anita's scooter earns; Priya's wedding does not.
    expect(unansweredApplicable(anitaMust).map((q) => q.id)).toContain(
      'productiveMonthlyGain',
    );
    expect(unansweredApplicable(priyaMust).map((q) => q.id)).not.toContain(
      'productiveMonthlyGain',
    );
  });

  it('only asks for a loan breakdown when there are loans', () => {
    const noLoans = { ...priyaMust, existingEmiTotal: exact(0) };
    expect(unansweredApplicable(noLoans).map((q) => q.id)).not.toContain('existingLoans');
    expect(unansweredApplicable(anitaMust).map((q) => q.id)).toContain('existingLoans');
  });

  it('unlocks follow-ups as earlier answers arrive', () => {
    // "What is it worth?" is meaningless before we know there is security.
    expect(unansweredApplicable(raviMust).map((q) => q.id)).not.toContain(
      'collateralValue',
    );
    const withCollateral = { ...raviMust, collateralType: 'property' as const };
    expect(unansweredApplicable(withCollateral).map((q) => q.id)).toContain(
      'collateralValue',
    );
  });
});

describe('the interview terminates', () => {
  it('stops asking once a question is answered', () => {
    const q = questionById('dependants')!;
    expect(isAnswered(raviMust, q)).toBe(false);
    expect(isAnswered({ ...raviMust, dependants: exact(2) }, q)).toBe(true);
  });

  it('treats "I do not know" as answered rather than nagging', () => {
    // Ravi told us he has no credit score. Asking again would be rude, and the
    // unknown carries real meaning downstream.
    const q = questionById('creditScore')!;
    expect(isAnswered(raviMust, q)).toBe(true);
    expect(assess(raviMust).pricing.grades.spanned).toBeGreaterThan(1);
  });

  it('runs out of questions once the borrower has answered everything useful', () => {
    for (const facts of [priya, ravi, anita]) {
      const remaining = nextQuestions(facts, 20);
      // Whatever is left must genuinely still be worth asking.
      for (const v of remaining) {
        if (v.question.tier === 'additional') expect(v.earnsItsPlace).toBe(true);
      }
    }
  });
});

describe('performance', () => {
  it('ranks the whole bank fast enough to run on every keystroke', () => {
    const start = performance.now();
    for (let i = 0; i < 20; i++) rankQuestions(raviMust);
    const perRun = (performance.now() - start) / 20;
    expect(perRun).toBeLessThan(50);
  });
});
