import { useStore, useAssessment, useNextQuestions } from '../state/store';
import { explainAll } from '../engine/explain';
import { formatINR, formatINRCompact, formatMonths, formatPct } from '../engine/trace';
import {
  NumBox,
  RateBox,
  RangeBar,
  GapChart,
  Why,
  ConfidenceMeter,
  Notice,
} from '../components/ui';
import { hi, isKnown } from '../engine/facts';
import { NegotiationCardView, QuoteChecker } from '../components/NegotiationCard';
import { missingMustFacts } from '../engine/assess';

const VERDICT_LABEL: Record<string, string> = {
  BORROW: 'Borrow',
  BORROW_LESS: 'Borrow less',
  DONT_BORROW: "Don't borrow",
};

/**
 * The results.
 *
 * The card comes first, because that is the part the borrower actually uses —
 * they are standing at a desk, not reading a report. The reasoning follows
 * immediately underneath, in the order they would question it: is this right,
 * how much, at what rate, at what instalment.
 *
 * Printing gives just the card; the reasoning is screen-only.
 */
export function Outputs() {
  const facts = useStore((s) => s.facts);
  const goto = useStore((s) => s.goto);
  const a = useAssessment();
  const ex = explainAll(a);
  const more = useNextQuestions(2);
  const missing = missingMustFacts(facts);

  if (missing.length > 0) {
    return (
      <section>
        <h1>Not enough to go on yet.</h1>
        <p>We will not invent numbers for you. Still needed: {missing.join(', ')}.</p>
        <div className="actions">
          <button className="primary" onClick={() => goto('interview')}>
            Answer those
          </button>
        </div>
      </section>
    );
  }

  const askedFor = isKnown(facts.amountWanted) ? hi(facts.amountWanted, 0) : undefined;

  return (
    <section>
      {/* ---------- the card, first ---------- */}
      <NegotiationCardView />

      <div className="actions no-print">
        <button className="primary" onClick={() => window.print()}>
          Print or save the card
        </button>
        <button onClick={() => goto('interview')}>Answer more questions</button>
      </div>

      {/* ---------- everything below is the reasoning ---------- */}
      <div className="reasoning">
        <h2 className="section-head">Why those numbers</h2>

        {/* ---- O1 ---- */}
        <div className="verdict-banner" data-v={a.verdict.verdict}>
          <p className="verdict-label">
            O1 · {VERDICT_LABEL[a.verdict.verdict] ?? a.verdict.verdict}
          </p>
          <p className="answer">{a.verdict.headline}</p>
          <p className="because">{a.verdict.because}</p>
          <div style={{ marginTop: '.6rem' }}>
            <Why steps={ex.O1.steps} label="Show the working" />
          </div>
        </div>

        {/* ---- O2 ---- */}
        <div className="card">
          <span className="output-id">O2 · HOW MUCH</span>
          <h2>The two numbers, and they are not the same</h2>

          <div className="two-numbers">
            <NumBox
              label="A lender will likely sanction"
              band={a.eligibility.lenderMax}
              note="Sized against your income, over their longest tenure."
              use={a.eligibility.binding === 'lender'}
            />
            <NumBox
              label="You can safely carry"
              band={a.eligibility.safeMax}
              note="Sized against what is left after you live."
              use={a.eligibility.binding === 'borrower'}
            />
          </div>

          <GapChart
            lender={a.eligibility.lenderMax}
            safe={a.eligibility.safeMax}
            asked={askedFor}
            format={formatINRCompact}
          />

          <p className="because">{ex.O2.because}</p>
          <Why steps={ex.O2.steps} />
        </div>

        {/* ---- O3 ---- */}
        <div className="card">
          <span className="output-id">O3 · FAIR RATE</span>
          <h2>What you should be paying</h2>

          <div className="two-numbers">
            <RateBox
              label="Interest rate"
              band={a.pricing.rateBand}
              note={`Risk grade ${a.pricing.grades.best}${a.pricing.grades.spanned > 1 ? `–${a.pricing.grades.worst}` : ''}`}
            />
            <RateBox
              label="All-in APR — compare on this"
              band={a.pricing.aprBand}
              note={`Includes a ${formatPct(a.pricing.feePctBand.low)}–${formatPct(a.pricing.feePctBand.high)} fee`}
            />
          </div>

          <RangeBar
            band={a.pricing.rateBand}
            min={Math.max(0, a.pricing.rateBand.low - 4)}
            max={a.pricing.rateBand.high + 4}
            format={(n) => formatPct(n)}
          />

          <p className="because">{ex.O3.because}</p>
          <Why steps={ex.O3.steps} />
        </div>

        {/* ---- O4 ---- */}
        <div className="card">
          <span className="output-id">O4 · MONTHLY CEILING</span>
          <h2>{ex.O4.headline}</h2>
          <p className="because">{ex.O4.because}</p>

          <div className="stress" data-ok={a.ceiling.stress.survivesBoth}>
            <span>{a.ceiling.stress.survivesBoth ? '✓' : '!'}</span>
            <span>{a.ceiling.stress.detail}</span>
          </div>

          {a.ceiling.tenureOptions.length > 1 && (
            <>
              <h3>The trade-off a lender will not show you</h3>
              <div className="tablewrap">
                <table>
                  <thead>
                    <tr>
                      <th>Tenure</th>
                      <th style={{ textAlign: 'right' }}>Monthly</th>
                      <th style={{ textAlign: 'right' }}>Total interest</th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.ceiling.tenureOptions.map((o) => (
                      <tr key={o.months} data-pick={o.months === a.eligibility.safeTenureMonths}>
                        <td>{formatMonths(o.months)}</td>
                        <td className="num">{formatINR(o.emi)}</td>
                        <td className="num">{formatINR(o.totalInterest)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="because">
                A longer tenure always lowers the instalment and always raises what you
                repay. The highlighted row is the one we recommend.
              </p>
            </>
          )}

          <Why steps={ex.O4.steps} />
        </div>

        {/* ---- the quote checker ---- */}
        <QuoteChecker />

        {/* ---- what to do ---- */}
        <div className="card">
          <h2>What to do next</h2>
          <ul className="plain">
            {a.verdict.actions.map((action, i) => (
              <li key={i}>{action}</li>
            ))}
          </ul>
        </div>

        {a.routing.redirected && (
          <Notice>
            You came in asking about a {a.routing.requested?.replace(/_/g, ' ')} loan. Based
            on what you told us, a{' '}
            <strong>{a.routing.options[0]?.label.toLowerCase()}</strong> is the better route
            — see the working under O2.
          </Notice>
        )}

        {/* ---- honesty ---- */}
        <div className="card">
          <h2>How much of this is guesswork</h2>
          <ConfidenceMeter confidence={a.confidence} />

          {a.assumptions.length > 0 && (
            <>
              <h3>Where we are guessing</h3>
              <ul className="plain">
                {a.assumptions.map((x) => (
                  <li key={x.fact}>{x.note}</li>
                ))}
              </ul>
            </>
          )}

          {more.length > 0 && (
            <>
              <h3>What would sharpen this</h3>
              <ul className="plain">
                {more.map((q) => (
                  <li key={q.question.id}>
                    {q.question.text} <span className="impact">— {q.impact}</span>
                  </li>
                ))}
              </ul>
              <div className="actions">
                <button onClick={() => goto('interview')}>Answer those</button>
              </div>
            </>
          )}

          {a.assumptions.length === 0 && more.length === 0 && (
            <p className="because">
              Nothing is being assumed, and no remaining question would move any of these
              numbers.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
