import { useState } from 'react';
import { useStore, useAssessment, useNextQuestions } from '../state/store';
import {
  skipPatch,
  coreProgress,
  CORE_QUESTIONS,
  type Question,
} from '../engine/questions';
import { exact, range, type ExistingLoan } from '../engine/facts';
import { formatINR, formatINRCompact, formatPct } from '../engine/trace';
import { ConfidenceMeter, RangeBar } from '../components/ui';
import { missingMustFacts } from '../engine/assess';
import { PERSONAS } from '../engine/personas';

/**
 * The adaptive interview, and the front door.
 *
 * There is no landing page: the borrower arrives on question one. A hero screen
 * with a "start" button is a click that buys them nothing, so the framing sits
 * above the first question instead of in front of it.
 *
 * Each question is chosen by the value-of-information engine rather than by a
 * fixed script, and carries the reason it was asked — a borrower being
 * interrogated deserves to know what each answer is worth. The bands narrow
 * visibly as answers land, which is the whole argument for answering the next one.
 */
export function Interview() {
  const facts = useStore((s) => s.facts);
  const answer = useStore((s) => s.answer);
  const goto = useStore((s) => s.goto);
  const goBack = useStore((s) => s.goBack);
  const canGoBack = useStore((s) => s.log.some((e) => e.questionId !== undefined));

  const assessment = useAssessment();
  const upcoming = useNextQuestions(3);
  const current = upcoming[0];

  const missing = missingMustFacts(facts);
  const ready = missing.length === 0;
  const answeredCount = useStore((s) => s.askedOrder.length);
  const isStart = answeredCount === 0;

  const { done: coreDone, total: coreTotal } = coreProgress(facts);
  const inCore = current?.question.tier === 'core';

  if (!current) {
    return (
      <section>
        <h1>Nothing left worth asking.</h1>
        <p>
          Every remaining question was tested against your answers and none of them would
          move any of your four numbers, so there is no point putting them to you.
        </p>
        <div className="actions">
          <button className="primary" onClick={() => goto('outputs')}>
            See my answers →
          </button>
          {canGoBack && <button onClick={goBack}>← Change my last answer</button>}
        </div>
      </section>
    );
  }

  return (
    <section>
      {isStart && <Hero />}

      {ready && !isStart && <LivePreview />}

      <div className="qcard card" key={current.question.id}>
        <div className="qhead">
          {inCore ? (
            <>
              <span className="pill" data-tier="core">
                {Math.min(coreDone + 1, coreTotal)}/{coreTotal}
              </span>
              <div
                className="progress"
                role="progressbar"
                aria-valuenow={coreDone}
                aria-valuemax={coreTotal}
                aria-label="Progress through the basics"
              >
                {CORE_QUESTIONS.map((q, i) => (
                  <i key={q.id} data-done={i < coreDone} />
                ))}
              </div>
            </>
          ) : (
            <>
              <span className="pill">sharpening</span>
              <span className="impact">{current.impact}</span>
            </>
          )}
        </div>

        <h2>{current.question.text}</h2>
        <p className="because">{current.question.why}</p>

        <div className="qbody">
          <AnswerInput
            key={current.question.id}
            question={current.question}
            onAnswer={(value) => answer(current.question, value)}
          />
        </div>

        <div className="qfoot">
          {canGoBack ? (
            <button className="ghost" onClick={goBack}>
              ← Back
            </button>
          ) : (
            <span />
          )}
          {ready && (
            <button className="ghost" onClick={() => goto('outputs')}>
              Skip to my answers →
            </button>
          )}
        </div>
      </div>

      {isStart && <Examples />}

      {!isStart && (
        <>
          {upcoming.length > 1 && (
            <details className="card">
              <summary>What the app plans to ask next, and why</summary>
              <ul className="plain">
                {upcoming.slice(1).map((q) => (
                  <li key={q.question.id}>
                    {q.question.text} — <span className="impact">{q.impact}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <ConfidenceMeter confidence={assessment.confidence} />
        </>
      )}
    </section>
  );
}

/** The framing, above the first question rather than in front of it. */
function Hero() {
  return (
    <div className="hero">
      <p className="eyebrow">Before you walk into a lender</p>
      <h1>
        Work out what you can <em>actually</em> borrow.
      </h1>
      <p className="lede">
        Every lender has a model that decides what you get. You have this. Answer a few
        questions and you will know whether to borrow at all, how much is genuinely safe,
        what rate is fair for you, and the monthly figure to refuse to go above.
      </p>
      <p className="hero-note">
        No login, no credit check, nothing stored — it all runs on this device and
        disappears when you close the tab. Skip anything you would rather not answer.
      </p>
    </div>
  );
}

/** The three borrowers from the brief, one tap away. */
function Examples() {
  const loadExample = useStore((s) => s.loadExample);
  return (
    <div className="examples-block">
      <h3>Or see it work on someone else first</h3>
      <p className="because">
        Three real situations. The same four questions, three very different answers.
      </p>
      <div className="examples">
        {PERSONAS.map((p) => (
          <button
            key={p.id}
            className="card example"
            onClick={() => loadExample(p.name, p.full)}
          >
            <strong>{p.name}</strong>
            <span className="where">{p.where}</span>
            <span className="ask">Wants {p.ask}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** The bands, live, so the borrower can watch them narrow as they answer. */
function LivePreview() {
  const a = useAssessment();
  const top = Math.max(a.eligibility.lenderMax.high, a.eligibility.safeMax.high, 1);

  return (
    <div className="preview card">
      <div className="preview-row">
        <span className="preview-label">Amount to work with</span>
        <RangeBar band={a.eligibility.useThis} min={0} max={top} format={formatINRCompact} />
      </div>
      <div className="preview-row">
        <span className="preview-label">Fair rate</span>
        <RangeBar
          band={a.pricing.rateBand}
          min={Math.max(0, a.pricing.rateBand.low - 6)}
          max={a.pricing.rateBand.high + 6}
          format={(n) => formatPct(n)}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Answer widgets
// ---------------------------------------------------------------------------

function AnswerInput({
  question,
  onAnswer,
}: {
  question: Question;
  onAnswer: (value: unknown) => void;
}) {
  switch (question.kind) {
    case 'choice':
      return <ChoiceInput question={question} onAnswer={onAnswer} />;
    case 'boolean':
      return <BooleanInput question={question} onAnswer={onAnswer} />;
    case 'range':
      return <RangeInput question={question} onAnswer={onAnswer} />;
    case 'loans':
      return <LoansInput onAnswer={onAnswer} />;
    default:
      return <NumberInput question={question} onAnswer={onAnswer} />;
  }
}

/**
 * "I don't know" is a first-class answer, never a zero.
 *
 * Skipping widens the band rather than filling in a guess, and the results
 * screen then names which silence widened which number.
 */
function DontKnow({ question }: { question: Question; onAnswer: (v: unknown) => void }) {
  const skip = useStore((s) => s.skip);
  if (!question.allowUnknown) return null;

  return (
    <button className="ghost skip" onClick={() => skip(question, skipPatch(question))}>
      {question.factKey === 'productWanted'
        ? 'Not sure — you tell me'
        : "Skip — I don't know"}
    </button>
  );
}

function ChoiceInput({
  question,
  onAnswer,
}: {
  question: Question;
  onAnswer: (v: unknown) => void;
}) {
  const isNumeric = question.factKey === 'variableIncomeShare';
  return (
    <>
      <div className="choices">
        {(question.choices ?? []).map((c) => (
          <button
            key={c.value}
            onClick={() => onAnswer(isNumeric ? exact(Number(c.value)) : c.value)}
          >
            {c.label}
          </button>
        ))}
      </div>
      <DontKnow question={question} onAnswer={onAnswer} />
    </>
  );
}

function BooleanInput({
  question,
  onAnswer,
}: {
  question: Question;
  onAnswer: (v: unknown) => void;
}) {
  return (
    <>
      <div className="row">
        <button className="primary" onClick={() => onAnswer(true)}>
          Yes
        </button>
        <button onClick={() => onAnswer(false)}>No</button>
      </div>
      <DontKnow question={question} onAnswer={onAnswer} />
    </>
  );
}

function NumberInput({
  question,
  onAnswer,
}: {
  question: Question;
  onAnswer: (v: unknown) => void;
}) {
  const [value, setValue] = useState('');
  const parsed = Number(value.replace(/[,\s₹]/g, ''));
  const valid = value.trim() !== '' && Number.isFinite(parsed);
  const submit = () => valid && onAnswer(exact(parsed));

  return (
    <>
      <div className="row">
        <input
          type="text"
          inputMode="numeric"
          autoFocus
          placeholder={question.placeholder ?? ''}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          aria-label={question.text}
        />
        <button className="primary next" disabled={!valid} onClick={submit}>
          Next
        </button>
      </div>
      {question.unit === 'rupees' && valid && <div className="hint">{formatINR(parsed)}</div>}
      <DontKnow question={question} onAnswer={onAnswer} />
    </>
  );
}

/** For anything that genuinely varies — we take the low end, and say so. */
function RangeInput({
  question,
  onAnswer,
}: {
  question: Question;
  onAnswer: (v: unknown) => void;
}) {
  const [low, setLow] = useState('');
  const [high, setHigh] = useState('');
  const l = Number(low.replace(/[,\s₹]/g, ''));
  const h = Number(high.replace(/[,\s₹]/g, ''));
  const validLow = low.trim() !== '' && Number.isFinite(l);
  const validHigh = high.trim() !== '' && Number.isFinite(h);

  const submit = () => {
    if (!validLow) return;
    onAnswer(validHigh && h !== l ? range(l, h) : exact(l));
  };

  return (
    <>
      <div className="row">
        <input
          type="text"
          inputMode="numeric"
          autoFocus
          placeholder="40,000"
          value={low}
          onChange={(e) => setLow(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          aria-label="Lowest month"
        />
        <span className="joiner">to</span>
        <input
          type="text"
          inputMode="numeric"
          placeholder="80,000 — optional"
          value={high}
          onChange={(e) => setHigh(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          aria-label="Highest month"
        />
        <button className="primary next" disabled={!validLow} onClick={submit}>
          Next
        </button>
      </div>
      <div className="hint">
        If it varies, give both. We size the loan against the <strong>low</strong> month,
        because that is the one you still have to pay in.
      </div>
      <DontKnow question={question} onAnswer={onAnswer} />
    </>
  );
}

/** The rate on existing debt matters as much as the amount. */
function LoansInput({ onAnswer }: { onAnswer: (v: unknown) => void }) {
  const [rows, setRows] = useState<{ label: string; emi: string; rate: string }[]>([
    { label: '', emi: '', rate: '' },
  ]);

  const commit = () => {
    const loans: ExistingLoan[] = rows
      .filter((r) => Number(r.emi) > 0)
      .map((r, i) => {
        const ratePct = Number(r.rate);
        const hasRate = Number.isFinite(ratePct) && ratePct > 0;
        return {
          label: r.label.trim() || `Loan ${i + 1}`,
          emi: Number(r.emi),
          ...(hasRate ? { ratePct: exact(ratePct), highCost: ratePct >= 24 } : {}),
        };
      });
    onAnswer(loans);
  };

  return (
    <>
      {rows.map((r, i) => (
        <div className="row loanrow" key={i}>
          <input
            type="text"
            placeholder="Car loan"
            value={r.label}
            onChange={(e) =>
              setRows(rows.map((x, j) => (i === j ? { ...x, label: e.target.value } : x)))
            }
            aria-label="What kind of loan"
          />
          <input
            type="text"
            inputMode="numeric"
            placeholder="EMI"
            value={r.emi}
            onChange={(e) =>
              setRows(rows.map((x, j) => (i === j ? { ...x, emi: e.target.value } : x)))
            }
            aria-label="Monthly instalment"
          />
          <input
            type="text"
            inputMode="numeric"
            placeholder="rate %"
            value={r.rate}
            onChange={(e) =>
              setRows(rows.map((x, j) => (i === j ? { ...x, rate: e.target.value } : x)))
            }
            aria-label="Interest rate"
          />
        </div>
      ))}
      <div className="row">
        <button onClick={() => setRows([...rows, { label: '', emi: '', rate: '' }])}>
          Add another
        </button>
        <button className="primary" onClick={commit}>
          Next
        </button>
      </div>
      <button className="ghost skip" onClick={() => onAnswer([])}>
        Skip — use the total I already gave
      </button>
    </>
  );
}
