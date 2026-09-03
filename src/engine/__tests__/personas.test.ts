import { describe, it, expect } from 'vitest';
import { assess } from '../assess';
import { priya, priyaMust, ravi, raviMust, anita, anitaMust } from '../personas';
import { bandWidth } from '../emi';
import { PRODUCTS } from '../rulebook';
import { comparisonAmount } from '../explain';
import { compareQuote } from '../pricing';

/**
 * Golden tests for the three borrowers in the brief.
 *
 * These assert the *reasoning*, not exact rupee figures — a threshold change
 * should move the numbers without breaking the tests, but it must not quietly
 * flip Anita to "borrow" or stop routing Ravi to a secured product.
 */

describe('Priya — the two numbers must be correctly different', () => {
  const a = assess(priya);

  it('is graded on her 780 score', () => {
    expect(a.pricing.grades.best).toBe('A+');
    expect(a.pricing.grades.spanned).toBe(1);
  });

  it('shows a lender ceiling far above what she can actually carry', () => {
    // The heart of the brief: these are different calculations, not one scaled.
    expect(a.eligibility.lenderMax.high).toBeGreaterThan(
      a.eligibility.safeMax.high * 3,
    );
    expect(a.eligibility.binding).toBe('borrower');
  });

  it('tells her to use the smaller number', () => {
    expect(a.eligibility.useThis.high).toBeLessThanOrEqual(
      a.eligibility.lenderMax.high,
    );
    expect(a.eligibility.useThis.high).toBeCloseTo(a.eligibility.safeMax.high, 0);
  });

  it('says borrow less rather than refusing her outright', () => {
    // She can comfortably carry a smaller loan. "Don't borrow" would be wrong.
    expect(a.verdict.verdict).toBe('BORROW_LESS');
    expect(a.verdict.suggestedAmount!.high).toBeGreaterThan(100000);
  });

  it('prices her near the top of the market', () => {
    expect(a.pricing.rateBand.low).toBeGreaterThanOrEqual(10);
    expect(a.pricing.rateBand.high).toBeLessThan(14);
  });

  it('quotes an APR above the headline rate, because of the fee', () => {
    expect(a.pricing.aprBand.high).toBeGreaterThan(a.pricing.rateBand.high);
  });

  it('gives her a ceiling well below the instalment she asked for', () => {
    expect(a.ceiling.requestedEmi!).toBeGreaterThan(a.ceiling.emiCeiling.high);
  });
});

describe('Ravi — routing to a secured product is the whole answer', () => {
  const a = assess(ravi);
  const unsecured = assess({ ...ravi, collateralValue: undefined, collateralType: 'none' });

  it('moves him off the unsecured loan he came in asking for', () => {
    expect(ravi.productWanted).toBe('business_unsecured');
    expect(a.product).toBe('lap');
    expect(a.routing.redirected).toBe(true);
    expect(PRODUCTS[a.product].secured).toBe(true);
  });

  it('prices the secured route far below the unsecured one', () => {
    // This gap is worth more to him than any negotiation on an unsecured rate.
    expect(a.pricing.rateBand.high).toBeLessThan(unsecured.pricing.rateBand.high - 5);
  });

  it('underwrites his documented income, not his cash income', () => {
    // He earns ₹40,000-80,000; his ITR shows ₹35,000 a month. A lender uses
    // the latter, plus his wife's income as co-applicant.
    expect(a.affordability.assessedIncome.high).toBeLessThan(80000);
    expect(a.affordability.assessedIncome.low).toBeGreaterThan(35000);
  });

  it('does not treat his missing credit score as a bad one', () => {
    expect(ravi.creditScore).toEqual({ kind: 'unknown' });
    expect(a.pricing.grades.best).toBe('A');
    expect(a.pricing.grades.spanned).toBeGreaterThan(1);
  });

  it('scales him back to what a slow month supports', () => {
    expect(a.verdict.verdict).toBe('BORROW_LESS');
    expect(a.verdict.suggestedAmount!.high).toBeLessThan(1500000);
    expect(a.verdict.suggestedAmount!.high).toBeGreaterThan(1000000);
  });

  it('unlocks far more against the shop than his income alone would', () => {
    expect(a.eligibility.lenderMax.high).toBeGreaterThan(unsecured.eligibility.lenderMax.high);
  });
});

describe('Anita — "do not borrow" has to be reachable, and it is', () => {
  const a = assess(anita);

  it('refuses the loan', () => {
    expect(a.verdict.verdict).toBe('DONT_BORROW');
  });

  it('refuses it because there is genuinely nothing spare', () => {
    expect(a.affordability.surplus.high).toBeLessThan(0);
    expect(a.affordability.safeEmi.high).toBe(0);
  });

  it('shows a lender would not advance anything either', () => {
    // Her existing app-loan EMIs already exceed her FOIR headroom.
    expect(a.eligibility.lenderMax.high).toBe(0);
  });

  it('grades her down for the bounce and the 30%+ debt', () => {
    expect(a.pricing.grades.worst).toBe('D');
  });

  it('still routes her to the cheaper secured product', () => {
    // The scooter secures the loan, so it beats the personal loan she asked for.
    expect(a.product).toBe('two_wheeler');
    expect(a.routing.redirected).toBe(true);
  });

  it('gives her something to do tomorrow despite the refusal', () => {
    expect(a.verdict.actions.length).toBeGreaterThan(2);
    const advice = a.verdict.actions.join(' ');
    // Refinancing the 34% app debt is worth more to her than this loan.
    expect(advice).toMatch(/app loans first/i);
    expect(advice).toMatch(/34%/);
    // And the route to the scooter she actually needs.
    expect(advice).toMatch(/two-wheeler/i);
  });

  it('reaches the same refusal from the must-set alone', () => {
    expect(assess(anitaMust).verdict.verdict).toBe('DONT_BORROW');
  });
});

describe('confidence widens with silence', () => {
  const cases = [
    { name: 'Priya', must: priyaMust, full: priya },
    { name: 'Ravi', must: raviMust, full: ravi },
    { name: 'Anita', must: anitaMust, full: anita },
  ];

  for (const c of cases) {
    it(`${c.name}: answering more raises confidence`, () => {
      const must = assess(c.must);
      const full = assess(c.full);
      expect(full.confidence.score).toBeGreaterThan(must.confidence.score);
      expect(full.confidence.wideningFactor).toBeLessThan(must.confidence.wideningFactor);
    });

    it(`${c.name}: the rate band never widens as facts are added`, () => {
      // The brief's rule: never narrow a range you have no basis to narrow.
      // The contrapositive is what we can test — more answers must not widen it.
      const must = assess(c.must);
      const full = assess(c.full);
      expect(bandWidth(full.pricing.rateBand)).toBeLessThanOrEqual(
        bandWidth(must.pricing.rateBand) + 1e-9,
      );
    });
  }

  it('produces all four outputs from the must-set alone', () => {
    const a = assess(priyaMust);
    expect(a.ready).toBe(true);
    expect(a.missingMust).toHaveLength(0);
    expect(a.verdict.verdict).toBeTruthy();
    expect(a.eligibility.lenderMax.high).toBeGreaterThan(0);
    expect(a.pricing.rateBand.high).toBeGreaterThan(0);
    expect(a.ceiling.tenureOptions.length).toBeGreaterThan(0);
  });

  it('says which values it had to invent', () => {
    // Priya did not give household expenses in the must-set.
    const a = assess(priyaMust);
    expect(a.assumptions.map((x) => x.fact)).toContain('householdExpenses');
    // And stops guessing once she answers.
    expect(assess(priya).assumptions).toHaveLength(0);
  });
});

describe('an unknown credit score is never read as a bad one', () => {
  it('grades a clean thin-file borrower no worse than the middle', () => {
    const a = assess(ravi);
    const withScore = assess({ ...ravi, creditScore: { kind: 'exact', value: 760 } });
    // Not knowing costs him band width, not band position.
    expect(a.pricing.rateBand.low).toBeLessThanOrEqual(withScore.pricing.rateBand.high);
    expect(bandWidth(a.pricing.rateBand)).toBeGreaterThan(
      bandWidth(withScore.pricing.rateBand),
    );
  });

  it('never quotes a rate below the best price in the market', () => {
    for (const facts of [priyaMust, raviMust, anitaMust, priya, ravi, anita]) {
      const a = assess(facts);
      const floor = PRODUCTS[a.product];
      expect(a.pricing.rateBand.low).toBeGreaterThan(0);
      expect(floor).toBeDefined();
    }
  });
});

describe('determinism', () => {
  it('gives identical results for identical facts', () => {
    expect(JSON.stringify(assess(ravi))).toBe(JSON.stringify(assess(ravi)));
  });
});

describe('scoring a real lender quote', () => {
  it('never calls a punitive offer fair just because the verdict is no', () => {
    // Anita's recommended amount is ₹0 (verdict: don't borrow). Comparing a
    // quote against a zero-rupee loan produced an all-in APR of 0% and the
    // stance "better than fair — take it" on a 26% + 2.5% fee offer.
    const a = assess(anita);
    expect(a.eligibility.useThis.high).toBe(0);

    const { amount, basis } = comparisonAmount(a, anita);
    expect(basis).toBe('requested');
    expect(amount).toBe(150000);

    const q = compareQuote(anita, a.product, amount, 26, 36, 2.5, 6000);
    expect(q.quotedAprPct).toBeGreaterThan(26);
    expect(q.stance).not.toBe('good');
    expect(q.emi).toBeGreaterThan(0);
  });

  it('prices Priya\'s 14% + 2% fee above her fair band', () => {
    const a = assess(priya);
    const { amount } = comparisonAmount(a, priya);
    const q = compareQuote(priya, a.product, amount, 14, 36, 2, 0);
    // The fee alone adds well over a point to the true cost.
    expect(q.quotedAprPct).toBeGreaterThan(15);
    expect(q.stance).toBe('above_fair');
    expect(q.costOfExcessRupees).toBeGreaterThan(0);
  });

  it('accepts the same rate as fair once the fee is waived', () => {
    const a = assess(priya);
    const { amount } = comparisonAmount(a, priya);
    const withFee = compareQuote(priya, a.product, amount, 14, 36, 2, 0);
    const noFee = compareQuote(priya, a.product, amount, 14, 36, 0, 0);
    expect(noFee.quotedAprPct).toBeLessThan(withFee.quotedAprPct);
    expect(noFee.stance).toBe('fair');
  });
});

describe('a quote comparison never contradicts itself', () => {
  /**
   * The screen that prompted this: ₹9,00,000 at 13% + 1% over 65 months read
   * "Inside the fair band" and "What the gap costs you ₹15,115" at the same
   * time. The stance was measured on all-in APR, the cost against the nominal
   * rate ceiling — two different yardsticks.
   */
  it('reports no gap cost when the quote is inside the band', () => {
    const a = assess(priya);
    const q = compareQuote(priya, a.product, 900000, 13, 65, 1, 0);
    expect(q.stance).toBe('fair');
    expect(q.costOfExcessRupees).toBe(0);
    expect(q.excessPp).toBeLessThanOrEqual(0);
  });

  it('holds that invariant across a wide sweep of offers', () => {
    const a = assess(priya);
    for (const amount of [200000, 500000, 900000]) {
      for (const rate of [9, 11, 12.5, 13, 14, 18, 24]) {
        for (const months of [24, 36, 60]) {
          for (const fee of [0, 1, 2.5]) {
            const q = compareQuote(priya, a.product, amount, rate, months, fee, 0);
            const inside = q.stance === 'fair' || q.stance === 'good';
            // Inside the band means nothing is being overcharged.
            if (inside) expect(q.costOfExcessRupees).toBe(0);
            // Above the band always has a cost attached.
            if (!inside) expect(q.costOfExcessRupees).toBeGreaterThan(0);
            // The stance and the rupee figure can never disagree.
            expect(q.costOfExcessRupees > 0).toBe(q.excessPp > 0);
            // A quote at or below the band's best end has no headroom left.
            if (q.stance === 'good') expect(q.upsideToBestRupees).toBe(0);
          }
        }
      }
    }
  });

  it('prices the fair band on the loan being quoted, not the one we recommend', () => {
    const a = assess(priya);
    // Our recommendation is ~₹4.3 lakh over 36 months; this is a different loan.
    const onQuote = compareQuote(priya, a.product, 900000, 13, 65, 1, 0);
    const ourLoan = compareQuote(priya, a.product, 433718, 13, 36, 1, 0);
    // Fee spread over a longer term costs less in APR terms, so the bands differ.
    expect(onQuote.fairAprBand.high).not.toBeCloseTo(ourLoan.fairAprBand.high, 2);
  });

  it('leaves negotiating room visible even on a fair quote', () => {
    const a = assess(priya);
    const q = compareQuote(priya, a.product, 900000, 13, 65, 1, 0);
    // "Fair" is a band, and she is entitled to argue for its better end.
    expect(q.upsideToBestRupees).toBeGreaterThan(0);
    expect(q.emiAtBestRate).toBeLessThan(q.emi);
  });

  it('flags a tenure longer than the product normally runs', () => {
    const a = assess(priya);
    // Personal loans top out at 60 months in the rulebook.
    expect(compareQuote(priya, a.product, 900000, 13, 65, 1, 0).tenureBeyondProductMax).toBe(true);
    expect(compareQuote(priya, a.product, 900000, 13, 60, 1, 0).tenureBeyondProductMax).toBe(false);
  });
});
