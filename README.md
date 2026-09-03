# Borrower Copilot

A borrower-side self-assessment for Indian lending. Every lender has a model that
decides what a borrower gets; the borrower has nothing. This is the borrower's side
of that table.

Answer nine questions and you get four things, plus a one-page card to argue with:

| | Output |
|---|---|
| **O1** | Borrow, borrow less, or don't borrow — with the reason |
| **O2** | Two maximums: what a lender will **sanction**, and what you can safely **carry**. They are usually very different, and the app says which to use |
| **O3** | A fair rate **band**, plus the all-in APR once fees are counted |
| **O4** | A monthly ceiling, the tenure trade-off, and a stress test |

---

## Run it

Requires Node 20 or newer.

```bash
npm install
npm run dev
```

Open **http://localhost:5173**. That is the whole setup — no API keys, no database,
no environment file, no backend.

Fastest way to see what it does: tap one of the three example borrowers on the
opening screen. Same four questions, three completely different answers.

```bash
npm test          # 90 tests, ~1s
npm run build     # typecheck + production build
npm run docs      # regenerate RULES.md and RUNTHROUGHS.md from the code
```

---

## The four deliverables

| File | What it is |
|---|---|
| the app | `npm run dev`, above |
| **[RULES.md](RULES.md)** | Every threshold, band and assumption — *what · value · why · source*. **Generated** from `src/engine/rulebook.ts`, so it cannot drift from the code |
| **[RUNTHROUGHS.md](RUNTHROUGHS.md)** | Priya, Ravi and Anita: the questions the app asked each, the four outputs, and each Negotiation Card. **Generated** by driving the real interview loop |
| **[WALKTHROUGH.md](WALKTHROUGH.md)** | How it works, what I would build next, and what I would cut |

Both generated docs are committed, so you do not need to run anything to read them.

---

## How it is built

```
src/engine/     ← the rules. Pure TypeScript: no React, no I/O, no network.
src/screens/    ← the UI. Reads the engine, never does arithmetic of its own.
src/state/      ← one store; every change is logged and reversible.
scripts/        ← generate RULES.md and RUNTHROUGHS.md from the engine.
```

Rules are separated from the UI by module boundary, and the separation is real:
`src/engine/` imports nothing from React and can be run, tested and reasoned about
on its own. That is also why `npm test` takes a second — the whole rulebook is
exercised as plain functions.

There is **no backend**. The brief says no login, no bureau pull, nothing stored, so
the engine runs client-side in the browser tab and the session disappears when you
close it. Nothing is written to disk or sent anywhere.

### Three things worth knowing before you read the code

**The two O2 numbers are different calculations, not one scaled down.** The lender's
figure is a FOIR ratio applied to *provable* income. The borrower's is a cashflow
surplus after rent, expenses, existing EMIs, a savings floor and a dependant buffer.
They disagree because they measure different things — which is the entire product.
For Priya the lender's number is roughly five times her own.

**Every additional question has to earn its place, and the engine proves it.** The
brief's rule is that a question which never moves a number should be cut. Rather
than honour that by taste, `src/engine/voi.ts` replays each candidate answer through
the whole assessment and measures how far the outputs travel. Anything below
threshold is dropped automatically — the receipts are generated into
[RULES.md](RULES.md#proof-that-every-additional-question-moves-a-number). For Ravi,
"could you offer security?" ranks first at ₹11.6 lakh of movement and 9.3 rate
points. For Anita, a co-applicant flips the verdict outright.

**Unknown is never zero, and uncertainty is handled asymmetrically.** A missing
credit score widens the rate band without shifting it upward — not knowing a score
is not evidence of a bad one. But a figure asserting *affordability* must never
drift upward on missing information, so the safe-carry numbers shrink instead. Both
rules are in [RULES.md](RULES.md) under Confidence.

---

## Changing a rule

Every threshold lives once, in `src/engine/rulebook.ts`, declared with its
justification:

```ts
export const SAFE_UTILISATION_OF_SURPLUS = rule(
  'safe.utilisation_of_surplus',
  'Affordability — borrower',
  'Share of remaining surplus that may go to a new EMI',
  0.65,
  'Committing every spare rupee to an EMI is not affordability, it is a coin flip …',
  'my judgement',
);
```

To change it:

```bash
# edit the value in src/engine/rulebook.ts, then
npm test && npm run docs
```

The numbers move, the explanations regenerate, RULES.md updates, and the golden
tests show exactly what changed. There is no second copy of any threshold.

---

## What this is not

It is guidance, not an offer of credit — it tells a borrower what to expect and what
to refuse; the lender still decides. There is no bureau integration and no credit
model: everything runs on what the borrower says. Rate bands are indicative and will
date. [RULES.md](RULES.md#what-this-does-not-know) lists what the app does not know,
and the app itself says on screen where it is guessing.
