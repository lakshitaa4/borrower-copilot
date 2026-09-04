import { useState } from 'react';
import { useStore, useAssessment } from '../state/store';
import {
  negotiationCard,
  comparisonAmount,
  type NegotiationCard,
} from '../engine/explain';
import { compareQuote, type QuoteComparison } from '../engine/pricing';
import { principalFromEmi } from '../engine/emi';
import { formatINR, formatPct } from '../engine/trace';

/**
 * The Negotiation Card.
 *
 * The first thing the borrower sees on the results screen, because it is the
 * only part they need at the desk. Everything on it is a figure they can defend
 * if the person opposite pushes back — which is why the reasoning sits directly
 * underneath rather than somewhere else in the app.
 */
export function NegotiationCardView() {
  const a = useAssessment();
  const card = negotiationCard(a);

  // Two kinds, and the component must branch or it renders empty rows. The
  // engine stopped returning an amount, a rate and a walk-away point for a
  // borrower who should not borrow; rendering the negotiate layout regardless
  // produced a card with blank values and a stray "/mo".
  if (card.kind === 'act_first') return <ActFirstCard card={card} />;

  return (
    <div className="negcard">
      <div className="negcard-head">
        <span className="output-id">TAKE THIS IN WITH YOU</span>
        <p className="answer">{card.verdict}</p>
      </div>

      <div className="kv">
        <span className="k">Ask for</span>
        <span className="v">{card.askFor}</span>
      </div>
      <div className="kv">
        <span className="k">Rate to accept</span>
        <span className="v">{card.rateToAccept}</span>
      </div>
      <div className="kv">
        <span className="k">All-in APR</span>
        <span className="v">{card.aprToCompare}</span>
      </div>
      <div className="kv">
        <span className="k">EMI ceiling</span>
        <span className="v">{card.emiCeiling}/mo</span>
      </div>
      <div className="kv">
        <span className="k">Over</span>
        <span className="v">{card.tenure}</span>
      </div>
      <div className="kv">
        <span className="k">Walk away above</span>
        <span className="v">{card.walkAwayAbove} all-in</span>
      </div>

      <div className="say">
        <h3>Say this</h3>
        <ul className="plain">
          {card.lines.map((l, i) => (
            <li key={i}>“{l}”</li>
          ))}
        </ul>
      </div>

      <p className="negcard-foot">
        Confidence in these numbers: {card.confidence}. Based only on what you told us — no
        credit report was pulled.
      </p>
    </div>
  );
}

/**
 * The card for a borrower who should not borrow.
 *
 * No amount, no rate, no walk-away point — there is nothing to negotiate. What
 * they take away instead is why, what to do first in the order that saves the
 * most, and the one change that would flip the answer.
 */
function ActFirstCard({ card }: { card: NegotiationCard }) {
  return (
    <div className="negcard" data-kind="act_first">
      <div className="negcard-head">
        <span className="output-id">BEFORE YOU BORROW ANYTHING</span>
        <p className="answer">{card.verdict}</p>
        <p className="because">{card.because}</p>
      </div>

      {card.blockers && card.blockers.length > 0 && (
        <div className="blockers">
          <h3>What is in the way</h3>
          <ul className="plain">
            {card.blockers.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </div>
      )}

      {card.firstSteps && card.firstSteps.length > 0 && (
        <div className="say">
          <h3>Do this first</h3>
          <ol className="steps">
            {card.firstSteps.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ol>
        </div>
      )}

      {card.whatWouldChangeIt && (
        <div className="unlock">
          <h3>What would change this answer</h3>
          <p>{card.whatWouldChangeIt}</p>
        </div>
      )}

      <div className="say">
        <h3>If someone pushes a loan at you</h3>
        <ul className="plain">
          {card.lines.map((l, i) => (
            <li key={i}>“{l}”</li>
          ))}
        </ul>
      </div>

      <p className="negcard-foot">
        Confidence in these numbers: {card.confidence}. Based only on what you told us — no
        credit report was pulled.
      </p>
    </div>
  );
}

/**
 * Score a real offer.
 *
 * The lender quotes 14% and a fee, and the borrower has no way to know what
 * that actually costs. This turns it into one comparable number and one
 * sentence of leverage.
 */
export function QuoteChecker() {
  const a = useAssessment();
  const facts = useStore((s) => s.facts);
  const setFact = useStore((s) => s.setFact);

  // Defaults to the amount we recommend, but it is the lender's figure that
  // matters — a quote of "8 lakh at 14%" priced against our ₹4.34 lakh
  // recommendation is not the offer anyone is actually being made.
  const { amount: defaultAmount, basis } = comparisonAmount(a, facts);

  const [loanAmount, setLoanAmount] = useState(
    defaultAmount >= 1000 ? String(Math.round(defaultAmount)) : '',
  );
  const [rate, setRate] = useState('');
  const [fee, setFee] = useState('');
  const [charges, setCharges] = useState('');
  const [tenure, setTenure] = useState(String(a.eligibility.safeTenureMonths));
  const [result, setResult] = useState<QuoteComparison | null>(null);
  const [comparedOn, setComparedOn] = useState<{ amount: number; months: number } | null>(null);

  const parsedAmount = Number(loanAmount.replace(/[,\s₹]/g, ''));
  const amountValid = Number.isFinite(parsedAmount) && parsedAmount >= 1000;
  const rateValid = Number.isFinite(Number(rate)) && Number(rate) > 0;
  const tenureValid = Number.isFinite(Number(tenure)) && Number(tenure) > 0;
  const canCompare = amountValid && rateValid && tenureValid;

  const check = () => {
    if (!canCompare) return;
    const r = Number(rate);
    const months = Number(tenure);
    const feePct = Number(fee) || 0;
    const bundled = Number(charges) || 0;

    setResult(compareQuote(facts, a.product, parsedAmount, r, months, feePct, bundled));
    setComparedOn({ amount: parsedAmount, months });
    setFact(
      'offer',
      {
        ratePct: r,
        processingFeePct: feePct,
        bundledChargesRupees: bundled,
        tenureMonths: months,
        amountRupees: parsedAmount,
      },
      'you',
      'entered a lender quote',
    );
  };

  /*
   * The headline has to answer both questions, and affordability outranks price.
   *
   * The stance alone judges only whether the *rate* is fair. Shown on its own it
   * put a green "Inside the fair band" at the top of a ₹7,00,000 offer whose
   * instalment was ₹8,741 a month beyond what the borrower could carry — a
   * glance said "good deal" about a loan that would break them. A fair price on
   * too large a loan is still the wrong loan, so when the instalment breaches
   * the ceiling the banner says so and stops being green.
   */
  const priceOk = result !== null && (result.stance === 'good' || result.stance === 'fair');
  const affordable = result !== null && result.emi <= a.ceiling.emiCeiling.high;

  const PRICE_LABEL: Record<string, string> = {
    good: 'Better than fair',
    fair: 'Inside the fair band',
    above_fair: 'Above fair — push back',
    far_above_fair: 'Well above fair — push hard, or walk',
  };

  const headline =
    result === null
      ? { label: '', detail: '', ok: true }
      : affordable
        ? {
            label: PRICE_LABEL[result.stance] ?? '',
            detail: priceOk
              ? 'And the instalment fits inside your monthly ceiling.'
              : 'The instalment fits your budget, but you are paying over the odds for it.',
            ok: priceOk,
          }
        : {
            label: priceOk
              ? 'Fairly priced — but bigger than you can carry'
              : 'Above fair, and bigger than you can carry',
            detail: `The rate is ${priceOk ? 'not the problem' : 'part of the problem'}; the size is. This instalment is ${formatINR(result.emi - a.ceiling.emiCeiling.high)} a month beyond your ceiling.`,
            ok: false,
          };

  return (
    <div className="card">
      <h2>Already been quoted something?</h2>
      <p className="because">
        The headline rate is not the price. Copy the four numbers off the sanction letter or
        the sales pitch and we will work out what it actually costs — then what to say about it.
      </p>

      <div className="quote-grid">
        <div className="field span-2">
          <label htmlFor="q-amount">Loan amount they are offering</label>
          <input
            id="q-amount"
            type="text"
            inputMode="numeric"
            placeholder="8,00,000"
            value={loanAmount}
            onChange={(e) => setLoanAmount(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && check()}
          />
          <div className="hint">
            {amountValid ? (
              <>
                <strong>{formatINR(parsedAmount)}</strong>.{' '}
                {defaultAmount >= 1000 && Math.abs(parsedAmount - defaultAmount) > 1
                  ? `We recommend ${formatINR(defaultAmount)} — but price whatever they actually offered.`
                  : basis === 'recommended'
                    ? 'Pre-filled with the amount we recommend. Change it to whatever they quoted.'
                    : 'Pre-filled with the amount you asked for.'}
              </>
            ) : (
              'The sanctioned amount on their offer, in rupees.'
            )}
          </div>
        </div>
        <div className="field">
          <label htmlFor="q-rate">Interest rate they quoted</label>
          <input
            id="q-rate"
            type="text"
            inputMode="decimal"
            placeholder="14"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && check()}
          />
          <div className="hint">Per year, as a percentage. The big number they lead with.</div>
        </div>
        <div className="field">
          <label htmlFor="q-fee">Processing fee</label>
          <input
            id="q-fee"
            type="text"
            inputMode="decimal"
            placeholder="2"
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && check()}
          />
          <div className="hint">
            As a percentage of the loan. Usually 1–3%, taken off before the money reaches you.
            Leave blank if there is none.
          </div>
        </div>
        <div className="field">
          <label htmlFor="q-charges">Insurance or other charges</label>
          <input
            id="q-charges"
            type="text"
            inputMode="numeric"
            placeholder="0"
            value={charges}
            onChange={(e) => setCharges(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && check()}
          />
          <div className="hint">
            In rupees. Bundled life cover, documentation or stamping charges — anything
            deducted from the disbursal.
          </div>
        </div>
        <div className="field">
          <label htmlFor="q-tenure">Tenure they offered</label>
          <input
            id="q-tenure"
            type="text"
            inputMode="numeric"
            value={tenure}
            onChange={(e) => setTenure(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && check()}
          />
          <div className="hint">
            In months. 60 means five years. Pre-filled with the tenure we recommend.
          </div>
        </div>
      </div>

      {basis === 'requested' && (
        <p className="hint">
          Our advice is still not to take this loan. This only shows what the offer would
          really cost you.
        </p>
      )}

      <div className="actions">
        <button className="primary" onClick={check} disabled={!canCompare}>
          What does that actually cost?
        </button>
      </div>

      {result && (
        <>
          <div className="stress" data-ok={headline.ok}>
            <span>{headline.ok ? '✓' : '!'}</span>
            <span>
              <strong>{headline.label}</strong>
              {headline.detail && <span className="stress-detail">{headline.detail}</span>}
            </span>
          </div>

          {comparedOn && (
            <p className="hint">
              On <strong>{formatINR(comparedOn.amount)}</strong> over{' '}
              <strong>{comparedOn.months} months</strong>:
            </p>
          )}

          <div className="tablewrap">
            <table>
              <tbody>
                <tr>
                  <td>They quoted</td>
                  <td className="num">{formatPct(result.quotedRatePct)}</td>
                </tr>
                <tr>
                  <td>
                    <strong>True all-in cost</strong>
                  </td>
                  <td className="num">
                    <strong>{formatPct(result.quotedAprPct)}</strong>
                  </td>
                </tr>
                <tr>
                  <td>Fair for your profile</td>
                  <td className="num">
                    {formatPct(result.fairAprBand.low)} – {formatPct(result.fairAprBand.high)}
                  </td>
                </tr>
                <tr>
                  <td>Monthly instalment</td>
                  <td className="num">{formatINR(result.emi)}</td>
                </tr>
                <tr>
                  <td>Your ceiling</td>
                  <td className="num">{formatINR(a.ceiling.emiCeiling.high)}</td>
                </tr>
                {result.costOfExcessRupees > 0 ? (
                  <tr>
                    <td>
                      <strong>What the gap costs you</strong>
                    </td>
                    <td className="num">
                      <strong>{formatINR(result.costOfExcessRupees)}</strong>
                    </td>
                  </tr>
                ) : (
                  result.upsideToBestRupees > 0 && (
                    <tr>
                      <td>Still on the table if you push</td>
                      <td className="num">{formatINR(result.upsideToBestRupees)}</td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>

          {!affordable && (
            <div className="notice">
              <strong>Ask for a smaller loan, not just a better rate.</strong> At your
              ceiling of {formatINR(a.ceiling.emiCeiling.high)} a month, the most this
              tenure supports is around{' '}
              {formatINR(
                principalFromEmi(
                  a.ceiling.emiCeiling.high,
                  result.quotedRatePct,
                  comparedOn?.months ?? a.eligibility.safeTenureMonths,
                ),
              )}{' '}
              at the rate they quoted.
            </div>
          )}

          {result.tenureBeyondProductMax && (
            <div className="notice">
              {comparedOn?.months} months is longer than a{' '}
              {a.routing.options[0]?.label.toLowerCase() ?? 'loan of this kind'} normally runs.
              A longer term lowers the instalment and raises the total cost — check what they
              are actually selling you.
            </div>
          )}

          {result.costOfExcessRupees > 0 ? (
            <div className="notice">
              <strong>Say this:</strong> “Your all-in cost is{' '}
              {formatPct(result.quotedAprPct)}. My profile supports{' '}
              {formatPct(result.fairRateBand.low)}–{formatPct(result.fairRateBand.high)} — an
              all-in {formatPct(result.fairAprBand.high)} at worst. Bring the rate to{' '}
              {formatPct(result.fairRateBand.high)} or waive the processing fee — otherwise I
              will take this to another lender.” Over the full tenure that difference is{' '}
              {formatINR(result.costOfExcessRupees)}.
            </div>
          ) : (
            result.upsideToBestRupees > 0 && (
              <div className="notice plain">
                This offer is inside your fair band, so there is nothing wrong with it. But
                fair is a <em>range</em>, and you are entitled to argue for the better end:
                at {formatPct(result.fairRateBand.low)} the instalment would be{' '}
                {formatINR(result.emiAtBestRate)} instead of {formatINR(result.emi)} —{' '}
                {formatINR(result.upsideToBestRupees)} over the full tenure.
              </div>
            )
          )}
        </>
      )}
    </div>
  );
}
