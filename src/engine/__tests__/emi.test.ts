import { describe, it, expect } from 'vitest';
import {
  emi,
  principalFromEmi,
  allInApr,
  totalInterest,
  tenureTable,
  band,
  widenBand,
  padBand,
} from '../emi';

describe('EMI', () => {
  it('matches the standard reducing-balance figure', () => {
    // ₹8,00,000 at 12% over 5 years is ~₹17,796 in any published EMI table.
    expect(emi(800000, 12, 60)).toBeCloseTo(17795.6, 0);
  });

  it('handles a zero rate as simple division', () => {
    expect(emi(120000, 0, 12)).toBeCloseTo(10000, 6);
  });

  it('falls as tenure lengthens, while total interest rises', () => {
    const short = emi(500000, 14, 24);
    const long = emi(500000, 14, 60);
    expect(long).toBeLessThan(short);
    expect(totalInterest(500000, 14, 60)).toBeGreaterThan(
      totalInterest(500000, 14, 24),
    );
  });
});

describe('principalFromEmi', () => {
  it('inverts emi() exactly', () => {
    const principal = 1500000;
    const instalment = emi(principal, 10.5, 120);
    expect(principalFromEmi(instalment, 10.5, 120)).toBeCloseTo(principal, 4);
  });

  it('is zero for a non-positive instalment', () => {
    expect(principalFromEmi(0, 12, 60)).toBe(0);
    expect(principalFromEmi(-100, 12, 60)).toBe(0);
  });
});

describe('all-in APR', () => {
  it('equals the headline rate when there are no fees', () => {
    const r = allInApr({ amountRupees: 800000, annualRatePct: 12, tenureMonths: 60 });
    expect(r.aprPct).toBeCloseTo(12, 3);
    expect(r.aprOverHeadlinePp).toBeCloseTo(0, 3);
  });

  it('exceeds the headline rate once a processing fee is charged', () => {
    const r = allInApr({
      amountRupees: 800000,
      annualRatePct: 12,
      tenureMonths: 60,
      processingFeePct: 2,
    });
    expect(r.feesRupees).toBeCloseTo(16000, 6);
    expect(r.netDisbursed).toBeCloseTo(784000, 6);
    expect(r.aprPct).toBeGreaterThan(12);
    // The instalment is unchanged by the fee — only the amount received falls.
    expect(r.emi).toBeCloseTo(emi(800000, 12, 60), 6);
  });

  it('is NOT the naive rate + fee percentage', () => {
    // The shortcut would say 14%. The truth is well under that, because the fee
    // is paid once while interest runs for five years. Overstating it would be
    // as dishonest as understating it.
    const r = allInApr({
      amountRupees: 800000,
      annualRatePct: 12,
      tenureMonths: 60,
      processingFeePct: 2,
    });
    expect(r.aprPct).toBeLessThan(13.5);
    expect(r.aprPct).toBeGreaterThan(12.5);
  });

  it('penalises the same fee much harder on a short tenure', () => {
    const short = allInApr({
      amountRupees: 200000,
      annualRatePct: 14,
      tenureMonths: 12,
      processingFeePct: 2,
    });
    const long = allInApr({
      amountRupees: 200000,
      annualRatePct: 14,
      tenureMonths: 48,
      processingFeePct: 2,
    });
    expect(short.aprOverHeadlinePp).toBeGreaterThan(long.aprOverHeadlinePp);
  });

  it('counts bundled insurance as part of the cost', () => {
    const withInsurance = allInApr({
      amountRupees: 150000,
      annualRatePct: 22,
      tenureMonths: 24,
      bundledChargesRupees: 9000,
    });
    expect(withInsurance.aprPct).toBeGreaterThan(22);
    expect(withInsurance.netDisbursed).toBeCloseTo(141000, 6);
  });

  it('reports an effective annual rate above the nominal APR', () => {
    const r = allInApr({
      amountRupees: 500000,
      annualRatePct: 15,
      tenureMonths: 36,
      processingFeePct: 1.5,
    });
    expect(r.effectiveAnnualPct).toBeGreaterThan(r.aprPct);
  });
});

describe('tenure table', () => {
  it('only offers tenures the product actually allows', () => {
    const rows = tenureTable(800000, 12, 'personal');
    expect(rows.every((r) => r.available)).toBe(true);
    expect(rows.every((r) => r.months <= 60)).toBe(true);
    expect(rows.length).toBeGreaterThan(2);
  });

  it('shows the cost of every extra year', () => {
    const rows = tenureTable(800000, 12, 'personal');
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i]!.emi).toBeLessThan(rows[i - 1]!.emi);
      expect(rows[i]!.totalInterest).toBeGreaterThan(rows[i - 1]!.totalInterest);
    }
  });
});

describe('bands', () => {
  it('normalises inverted input', () => {
    expect(band(15, 10)).toEqual({ low: 10, high: 15 });
  });

  it('widens around the centre without moving it', () => {
    const w = widenBand(band(10, 14), 1.5);
    expect((w.low + w.high) / 2).toBeCloseTo(12, 6);
    expect(w.high - w.low).toBeCloseTo(6, 6);
  });

  it('pads both sides equally', () => {
    expect(padBand(band(10, 14), 2)).toEqual({ low: 8, high: 16 });
  });
});
