/**
 * Generates RULES.md from the rulebook.
 *
 * The point of generating it rather than writing it is that the document and
 * the behaviour cannot drift. Every row below is the same object the engine
 * computes with — change a threshold and this file changes with it, or the
 * change did not happen.
 *
 *   npm run docs:rules
 */

import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RULES, type RuleRecord } from '../src/engine/rulebook';
import { droppedQuestions, rankQuestions } from '../src/engine/voi';
import { QUESTIONS } from '../src/engine/questions';
import { PERSONAS } from '../src/engine/personas';
import { formatINR, formatPct } from '../src/engine/trace';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Render a rule's value readably, whatever shape it is. */
function renderValue(value: unknown, depth = 0): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value;

  if (Array.isArray(value)) {
    if (value.every((v) => typeof v === 'number' || typeof v === 'string')) {
      return value.join(', ');
    }
    return value.map((v) => renderValue(v, depth + 1)).join('<br>');
  }

  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `\`${k}\`: ${renderValue(v, depth + 1)}`)
      .join(depth === 0 ? '<br>' : ', ');
  }

  return String(value);
}

function escapeCell(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function groupOf(rules: readonly RuleRecord[]): Map<string, RuleRecord[]> {
  const map = new Map<string, RuleRecord[]>();
  for (const r of rules) {
    const list = map.get(r.group) ?? [];
    list.push(r);
    map.set(r.group, list);
  }
  return map;
}

const lines: string[] = [];

lines.push('# RULES.md');
lines.push('');
lines.push(
  '**This file is generated.** It is produced from `src/engine/rulebook.ts` by ' +
    '`npm run docs:rules`, which reads the same objects the engine computes with. ' +
    'There is no second copy of any number to fall out of date — if a threshold ' +
    'changes and this file does not, the change did not happen.',
);
lines.push('');
lines.push(
  'Sourcing is blunt on purpose. `my judgement` means exactly that: a calibration ' +
    'I chose and will defend, not a published standard. A borrower-facing tool ' +
    'that presents guesses as regulation is worse than one that says which is which.',
);
lines.push('');

// --- The rules ------------------------------------------------------------

const grouped = groupOf(RULES);
lines.push('## The rules');
lines.push('');

for (const [group, rules] of grouped) {
  lines.push(`### ${group}`);
  lines.push('');
  lines.push('| What | Value | Why | Source |');
  lines.push('| --- | --- | --- | --- |');
  for (const r of rules) {
    lines.push(
      `| **${escapeCell(r.what)}**<br>\`${r.id}\` | ${escapeCell(renderValue(r.value))} | ` +
        `${escapeCell(r.why)} | ${escapeCell(r.source)} |`,
    );
  }
  lines.push('');
}

// --- The question set ------------------------------------------------------

lines.push('## The question set');
lines.push('');
lines.push(
  'Core questions are always asked — they are the minimum needed to produce the ' +
    'four outputs. Additional questions are only asked when the value-of-information ' +
    'engine can show they move a number for that particular borrower. The ' +
    '`negotiation` tier feeds the card and does not affect the assessment at all, ' +
    'so it is kept out of the ranking rather than allowed to score zero.',
);
lines.push('');
lines.push('| Tier | Question | Fills | Asked when | Why we ask |');
lines.push('| --- | --- | --- | --- | --- |');
for (const q of QUESTIONS) {
  const gate = q.appliesWhen ?? 'always';
  lines.push(
    `| ${q.tier} | ${escapeCell(q.text)} | \`${String(q.factKey)}\` | ${gate} | ${escapeCell(q.why)} |`,
  );
}
lines.push('');

// --- The VOI proof ---------------------------------------------------------

lines.push('## Proof that every additional question moves a number');
lines.push('');
lines.push(
  'The brief\'s rule is that every additional question must change an output, and ' +
    'that a question which never moves a number should be cut. Rather than honour ' +
    'that by taste, the engine replays each candidate answer through the whole ' +
    'assessment and measures how far the outputs travel. Anything below the ' +
    'thresholds in `questions.policy` is dropped automatically.',
);
lines.push('');
lines.push(
  'The tables below are generated from the three borrowers in the brief, each ' +
    'having answered only the core set. `Δ amount` is how far the recommended ' +
    'loan size could move; `Δ rate` is how far the rate band midpoint could move; ' +
    '`flips` means the answer could change the verdict itself.',
);
lines.push('');

for (const p of PERSONAS) {
  lines.push(`### ${p.name} — ${p.where}`);
  lines.push('');
  lines.push('| Question | Δ amount | Δ EMI ceiling | Δ rate | Flips verdict | Asked? |');
  lines.push('| --- | ---: | ---: | ---: | --- | --- |');

  const ranked = rankQuestions(p.must, 'additional');
  for (const v of ranked) {
    lines.push(
      `| ${escapeCell(v.question.text)} | ${formatINR(v.amountDeltaRupees)} | ` +
        `${formatINR(v.emiDeltaRupees)} | ${formatPct(v.rateDeltaPp)} | ` +
        `${v.flipsVerdict ? `**yes** — ${v.verdictsSeen.join(' / ')}` : 'no'} | ` +
        `${v.earnsItsPlace ? 'yes' : '**dropped**'} |`,
    );
  }

  const dropped = droppedQuestions(p.must);
  if (dropped.length > 0) {
    lines.push('');
    lines.push(
      `> Dropped for ${p.name.split(',')[0]}: ` +
        dropped.map((d) => `\`${d.question.id}\``).join(', ') +
        `. These move nothing for this borrower, so the app does not ask them. ` +
        `They may still be asked of someone else — the set is per-borrower, not fixed.`,
    );
  }
  lines.push('');
}

// --- What we do not know ---------------------------------------------------

lines.push('## What this does not know');
lines.push('');
lines.push(
  '- **Rate bands are indicative and will date.** They move with the policy rate ' +
    'and with competition, and they are the most likely thing in this file to be ' +
    'wrong six months from now. The durable part is the *shape* — secured products ' +
    'price several points below unsecured ones for the same borrower.',
);
lines.push(
  '- **There is no bureau pull.** Every credit assessment here runs on what the ' +
    'borrower tells us. A real score can differ from a remembered one, and a real ' +
    'report can contain obligations the borrower has forgotten.',
);
lines.push(
  '- **Lender policies vary more than any single ladder can capture.** The FOIR ' +
    'ladder is a reasonable central case, not a specific lender\'s credit policy. ' +
    'Two banks will give the same borrower materially different answers.',
);
lines.push(
  '- **Household expenses are self-reported and usually understated.** When the ' +
    'borrower does not answer, the assumed band is deliberately wide, and the app ' +
    'says so on screen rather than hiding it.',
);
lines.push(
  '- **Projected earnings from a productive loan are optimistic by nature.** Only ' +
    'half of what the borrower projects is counted, and it can never push the ' +
    'recommendation past what a lender would advance.',
);
lines.push(
  '- **Nothing here is a sanction.** It is what the borrower should expect and ' +
    'what they should refuse — the lender still decides.',
);
lines.push('');
lines.push('---');
lines.push('');
lines.push(
  `_Generated from ${RULES.length} rules and ${QUESTIONS.length} questions by \`npm run docs:rules\`._`,
);
lines.push('');

writeFileSync(join(root, 'RULES.md'), lines.join('\n'), 'utf8');
console.log(`RULES.md written — ${RULES.length} rules, ${QUESTIONS.length} questions.`);
