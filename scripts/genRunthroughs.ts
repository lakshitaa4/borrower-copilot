/**
 * Generates RUNTHROUGHS.md by driving the three borrowers through the real
 * interview loop — the same `nextQuestion` the UI calls, answering from each
 * persona's fact sheet.
 *
 * Generated rather than transcribed so it cannot quietly go stale, and so the
 * questions listed are provably the ones the app would actually ask.
 *
 *   npm run docs:runthroughs
 */

import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PERSONAS } from '../src/engine/personas';
import { assess, type Assessment } from '../src/engine/assess';
import { nextQuestion } from '../src/engine/voi';
import { type Question, isAnswered, skipPatch } from '../src/engine/questions';
import { type BorrowerFacts, type Num, isKnown, hi, lo } from '../src/engine/facts';
import { explainAll, negotiationCard } from '../src/engine/explain';
import { formatINR, formatINRCompact, formatPct, formatMonths } from '../src/engine/trace';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

interface AskedQuestion {
  question: Question;
  answer: string;
  impact: string;
  tier: string;
}

/** Render whatever the persona's fact sheet holds, as the borrower would say it. */
function renderAnswer(q: Question, value: unknown): string {
  if (value === undefined) return "doesn't know";
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'string') return value.replace(/_/g, ' ');
  if (Array.isArray(value)) {
    return value
      .map((l: { label: string; emi: number; ratePct?: Num }) =>
        `${l.label} ${formatINR(l.emi)}/mo${isKnown(l.ratePct) ? ` at ${formatPct(lo(l.ratePct, 0))}` : ''}`,
      )
      .join('; ');
  }
  const n = value as Num;
  if (!isKnown(n)) return "doesn't know";

  const unit = q.unit;
  const low = lo(n, 0);
  const high = hi(n, 0);
  const fmt = (v: number) =>
    unit === 'rupees'
      ? formatINR(v)
      : unit === 'pct'
        ? formatPct(v)
        : unit === 'months'
          ? `${v} months`
          : unit === 'years'
            ? `${v} years`
            : String(v);
  return low === high ? fmt(low) : `${fmt(low)} to ${fmt(high)}`;
}

/**
 * Run the real interview loop against a persona's answers.
 *
 * When the persona has nothing to say on a question we record "doesn't know"
 * and mark it asked, exactly as the app does — an unanswered question must not
 * be put again, and unknown is never silently turned into zero.
 */
function simulateInterview(target: BorrowerFacts): {
  facts: BorrowerFacts;
  asked: AskedQuestion[];
} {
  let facts: BorrowerFacts = {};
  const asked: AskedQuestion[] = [];

  for (let i = 0; i < 40; i++) {
    const next = nextQuestion(facts);
    if (!next) break;

    const q = next.question;
    const value = (target as Record<string, unknown>)[q.factKey];

    facts =
      value !== undefined
        ? { ...facts, [q.factKey]: value }
        : { ...facts, ...skipPatch(q) };

    asked.push({
      question: q,
      answer: renderAnswer(q, value),
      impact: next.impact,
      tier: q.tier,
    });

    // Guard against a question that fails to mark itself answered.
    if (!isAnswered(facts, q)) break;
  }

  return { facts, asked };
}

function outputsSection(a: Assessment): string[] {
  const lines: string[] = [];
  const ex = explainAll(a);

  for (const id of ['O1', 'O2', 'O3', 'O4'] as const) {
    const e = ex[id];
    lines.push(`**${id} — ${e.title}**`);
    lines.push('');
    lines.push(`> ${e.headline}`);
    lines.push('');
    lines.push(`*Why:* ${e.because}`);
    lines.push('');
  }

  lines.push('| | |');
  lines.push('| --- | --- |');
  lines.push(
    `| Lender will likely sanction | ${formatINRCompact(a.eligibility.lenderMax.low)} – ${formatINRCompact(a.eligibility.lenderMax.high)} |`,
  );
  lines.push(
    `| You can safely carry | ${formatINRCompact(a.eligibility.safeMax.low)} – ${formatINRCompact(a.eligibility.safeMax.high)} |`,
  );
  lines.push(`| **Use this number** | **${formatINRCompact(a.eligibility.useThis.high)}** |`);
  lines.push(`| Binding constraint | ${a.eligibility.binding} |`);
  lines.push(
    `| Fair rate | ${formatPct(a.pricing.rateBand.low)} – ${formatPct(a.pricing.rateBand.high)} |`,
  );
  lines.push(
    `| All-in APR | ${formatPct(a.pricing.aprBand.low)} – ${formatPct(a.pricing.aprBand.high)} |`,
  );
  lines.push(`| EMI ceiling | ${formatINR(a.ceiling.emiCeiling.high)} |`);
  lines.push(`| Over | ${formatMonths(a.eligibility.safeTenureMonths)} |`);
  lines.push(
    `| Stress test (income −20%, rate +2pp) | ${a.ceiling.stress.survivesBoth ? 'holds' : `**fails** — short ${formatINR(a.ceiling.stress.shortfallRupees)}/month`} |`,
  );
  lines.push(`| Product | ${a.product}${a.routing.redirected ? ' (redirected)' : ''} |`);
  lines.push(`| Confidence | ${Math.round(a.confidence.score * 100)}% (${a.confidence.label}) |`);
  lines.push('');

  if (a.ceiling.tenureOptions.length > 1) {
    lines.push('**The tenure trade-off**');
    lines.push('');
    lines.push('| Tenure | EMI | Total interest |');
    lines.push('| --- | ---: | ---: |');
    for (const o of a.ceiling.tenureOptions) {
      lines.push(
        `| ${formatMonths(o.months)} | ${formatINR(o.emi)} | ${formatINR(o.totalInterest)} |`,
      );
    }
    lines.push('');
  }

  return lines;
}

const lines: string[] = [];

lines.push('# RUNTHROUGHS.md');
lines.push('');
lines.push(
  '**This file is generated.** `npm run docs:runthroughs` drives each borrower ' +
    'through the same interview loop the app uses — the questions listed are the ' +
    'ones `nextQuestion()` actually chose, in the order it chose them, not a ' +
    'transcript written by hand.',
);
lines.push('');
lines.push(
  'Each borrower is shown twice: once having answered only the core set, and ' +
    'once after the full adaptive interview. Comparing the two is the clearest ' +
    'demonstration of the rule that confidence widens with silence — the verdicts ' +
    'agree, but the bands are visibly wider when the app knows less.',
);
lines.push('');

for (const p of PERSONAS) {
  lines.push('---');
  lines.push('');
  lines.push(`## ${p.name} — ${p.where}`);
  lines.push('');
  lines.push(`**Asks for:** ${p.ask}`);
  lines.push('');

  const { facts, asked } = simulateInterview(p.full);
  const full = assess(facts);
  const mustOnly = assess(p.must);

  // --- the interview ---
  lines.push(`### The questions the app asked (${asked.length})`);
  lines.push('');
  lines.push('| # | Tier | Question | Answer | Why it was asked |');
  lines.push('| ---: | --- | --- | --- | --- |');
  asked.forEach((a, i) => {
    lines.push(
      `| ${i + 1} | ${a.tier} | ${a.question.text} | ${a.answer} | ${a.impact} |`,
    );
  });
  lines.push('');

  const skipped = ['documentedIncomeAnnual', 'variableIncomeShare', 'cardUtilisationPct', 'productiveMonthlyGain', 'existingLoans']
    .filter((id) => !asked.some((a) => a.question.id === id));
  if (skipped.length > 0) {
    lines.push(
      `> **Not asked:** ${skipped.map((s) => `\`${s}\``).join(', ')} — either ` +
        `they do not apply to this borrower, or the engine measured that they ` +
        `would not move any of the four outputs.`,
    );
    lines.push('');
  }

  // --- outputs ---
  lines.push('### The four outputs');
  lines.push('');
  lines.push(...outputsSection(full));

  // --- assumptions ---
  if (full.assumptions.length > 0) {
    lines.push('### Where the app is guessing');
    lines.push('');
    for (const a of full.assumptions) {
      lines.push(`- **${a.fact}** — ${a.note}`);
    }
    lines.push('');
  }

  // --- what to do ---
  lines.push('### What to do next');
  lines.push('');
  for (const action of full.verdict.actions) {
    lines.push(`- ${action}`);
  }
  lines.push('');

  // --- the card ---
  const card = negotiationCard(full);
  lines.push('### The Negotiation Card');
  lines.push('');
  lines.push('```');
  lines.push(`  ${card.verdict}`);
  lines.push('');
  lines.push(`  Ask for            ${card.askFor}`);
  lines.push(`  Rate to accept     ${card.rateToAccept}`);
  lines.push(`  All-in APR         ${card.aprToCompare}`);
  lines.push(`  EMI ceiling        ${card.emiCeiling} a month`);
  lines.push(`  Over               ${card.tenure}`);
  lines.push(`  Walk away above    ${card.walkAwayAbove} all-in`);
  lines.push('');
  lines.push('  Say this:');
  for (const l of card.lines) {
    lines.push(`   • ${l}`);
  }
  lines.push('');
  lines.push(`  Confidence in these numbers: ${card.confidence}`);
  lines.push('```');
  lines.push('');

  // --- silence comparison ---
  lines.push('### If they had stopped after the core questions');
  lines.push('');
  lines.push('| | Core set only | After the full interview |');
  lines.push('| --- | --- | --- |');
  lines.push(`| Verdict | ${mustOnly.verdict.verdict} | ${full.verdict.verdict} |`);
  lines.push(
    `| Use this amount | ${formatINRCompact(mustOnly.eligibility.useThis.high)} | ${formatINRCompact(full.eligibility.useThis.high)} |`,
  );
  lines.push(
    `| Rate band | ${formatPct(mustOnly.pricing.rateBand.low)} – ${formatPct(mustOnly.pricing.rateBand.high)} (${formatPct(mustOnly.pricing.rateBand.high - mustOnly.pricing.rateBand.low)} wide) | ${formatPct(full.pricing.rateBand.low)} – ${formatPct(full.pricing.rateBand.high)} (${formatPct(full.pricing.rateBand.high - full.pricing.rateBand.low)} wide) |`,
  );
  lines.push(
    `| EMI ceiling | ${formatINR(mustOnly.ceiling.emiCeiling.high)} | ${formatINR(full.ceiling.emiCeiling.high)} |`,
  );
  lines.push(
    `| Confidence | ${Math.round(mustOnly.confidence.score * 100)}% | ${Math.round(full.confidence.score * 100)}% |`,
  );
  lines.push(
    `| Values assumed | ${mustOnly.assumptions.length} | ${full.assumptions.length} |`,
  );
  lines.push('');
}

writeFileSync(join(root, 'RUNTHROUGHS.md'), lines.join('\n'), 'utf8');
console.log(`RUNTHROUGHS.md written — ${PERSONAS.length} borrowers.`);
