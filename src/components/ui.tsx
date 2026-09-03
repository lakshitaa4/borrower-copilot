import { useState, type ReactNode } from 'react';
import type { Band } from '../engine/emi';
import type { TraceStep } from '../engine/trace';
import { formatBand, formatINR, formatINRCompact, formatPct } from '../engine/trace';
import type { ConfidenceResult } from '../engine/confidence';

/**
 * A range, drawn as a range.
 *
 * The brief asks for ranges shown as ranges, and this is the reason why: a
 * borrower who sees a bar that visibly narrows as they answer understands the
 * value of answering in a way no percentage label communicates.
 */
export function RangeBar({
  band,
  min,
  max,
  format,
  marker,
  markerLabel,
}: {
  band: Band;
  min: number;
  max: number;
  format: (n: number) => string;
  marker?: number;
  markerLabel?: string;
}) {
  const span = Math.max(1e-9, max - min);
  const pct = (v: number) => Math.min(100, Math.max(0, ((v - min) / span) * 100));
  const left = pct(band.low);
  const width = Math.max(1.5, pct(band.high) - left);

  return (
    <div className="rangebar">
      <div className="track">
        <div className="fill" style={{ left: `${left}%`, width: `${width}%` }} />
        {marker !== undefined && marker >= min && marker <= max && (
          <div
            className="marker"
            style={{ left: `${pct(marker)}%` }}
            title={markerLabel}
          />
        )}
      </div>
      <div className="ends">
        <span>{format(band.low)}</span>
        <span>{format(band.high)}</span>
      </div>
    </div>
  );
}

/**
 * The gap chart — the most important picture in the app.
 *
 * Both maximums on one axis, with what the borrower asked for outlined on top.
 * The distance between the lender's number and the borrower's is the entire
 * reason this product exists, and two figures in separate boxes simply do not
 * convey it: Priya seeing a hatched bar stretching five times further than her
 * solid one understands immediately that the sanction letter is not a measure
 * of what she can afford.
 */
export function GapChart({
  lender,
  safe,
  asked,
  format,
}: {
  lender: Band;
  safe: Band;
  asked?: number;
  format: (n: number) => string;
}) {
  const max = Math.max(lender.high, safe.high, asked ?? 0) * 1.04 || 1;
  const pct = (v: number) => Math.min(100, Math.max(0, (v / max) * 100));

  // A bar narrower than this cannot hold its own label legibly.
  const LABEL_MIN = 22;

  const rows: { kind: string; label: string; band: Band; value: number }[] = [
    { kind: 'lender', label: 'A lender will offer', band: lender, value: lender.high },
    { kind: 'safe', label: 'You can carry', band: safe, value: safe.high },
  ];
  if (asked !== undefined && asked > 0) {
    rows.push({
      kind: 'asked',
      label: 'You asked for',
      band: { low: 0, high: asked },
      value: asked,
    });
  }

  return (
    <div className="gapchart">
      {rows.map((r) => {
        const width = Math.max(2, pct(r.value));
        const inside = width >= LABEL_MIN;
        return (
          <div className="gaprow" key={r.kind}>
            <span className="glabel">{r.label}</span>
            <div className="gaptrack">
              <div
                className="gapfill"
                data-kind={r.kind}
                style={{ width: `${width}%` }}
                title={`${r.label}: ${format(r.value)}`}
              >
                {inside && format(r.value)}
              </div>
              {!inside && (
                <span className="gapfill-outside" style={{ left: `calc(${width}% + .4rem)` }}>
                  {format(r.value)}
                </span>
              )}
            </div>
          </div>
        );
      })}
      <div className="gapaxis">
        <span>{format(0)}</span>
        <span>{format(max)}</span>
      </div>
    </div>
  );
}

/** How much the app actually knows, stated plainly rather than implied. */
export function ConfidenceMeter({ confidence }: { confidence: ConfidenceResult }) {
  const pct = Math.round(confidence.score * 100);
  return (
    <div className="confidence">
      <span>Confidence</span>
      <div className="meter">
        <span style={{ width: `${pct}%` }} />
      </div>
      <span>
        {pct}% · {confidence.label}
      </span>
    </div>
  );
}

/**
 * The working behind a number, one click away.
 *
 * Collapsed by default because a borrower wants the answer first — but never
 * more than one tap from the arithmetic, because "trust me" is exactly what the
 * lender already says.
 */
export function Why({ steps, label = 'Why this number' }: { steps: TraceStep[]; label?: string }) {
  const [open, setOpen] = useState(false);
  if (steps.length === 0) return null;

  return (
    <>
      <button className="why-chip" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? '▾' : '▸'} {label}
      </button>
      {open && (
        <ul className="steps-list">
          {steps.map((s, i) => (
            <li key={i}>
              <span className="step-label">{s.label}</span>
              {s.detail}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function NumBox({
  label,
  band,
  note,
  use = false,
  compact = true,
}: {
  label: string;
  band: Band;
  note?: ReactNode;
  use?: boolean;
  compact?: boolean;
}) {
  const fmt = compact ? formatINRCompact : formatINR;
  return (
    <div className="numbox" data-use={use}>
      {use && <span className="use-flag">Use this one</span>}
      <div className="label">{label}</div>
      <div className="value">{formatBand(band.low, band.high, fmt)}</div>
      {note && <div className="note">{note}</div>}
    </div>
  );
}

export function RateBox({ label, band, note }: { label: string; band: Band; note?: ReactNode }) {
  return (
    <div className="numbox">
      <div className="label">{label}</div>
      <div className="value">{formatBand(band.low, band.high, (n) => formatPct(n))}</div>
      {note && <div className="note">{note}</div>}
    </div>
  );
}

export function Notice({ children, plain = false }: { children: ReactNode; plain?: boolean }) {
  return <div className={plain ? 'notice plain' : 'notice'}>{children}</div>;
}
