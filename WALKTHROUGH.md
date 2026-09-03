# Walkthrough

Five minutes, written. What it does, the three decisions I would defend hardest,
what I would build next, and what I cut.

---

## 1. The one idea

The brief asks for four outputs, but only one of them is hard. **O2 is the whole
test**: what a lender will sanction and what a borrower can actually carry are two
different questions, and almost every eligibility calculator answers only the first.

So they are two different calculations here, not one number and a haircut:

- **The lender's number** is a FOIR ratio applied to *provable* income. Ravi earns
  ₹40,000–80,000 in cash and files ₹4,20,000 a year, so a lender underwrites about
  ₹35,000 a month. Nothing about him is dishonest; the income has no trail.
- **The borrower's number** is cashflow surplus: income (at its *low* month) minus
  household expenses, rent, existing EMIs, a savings floor, a dependant buffer and a
  volatility haircut — then only two thirds of what remains.

They disagree because they measure different things. Priya's lender number is around
₹21 lakh; her own is ₹4.3 lakh. She asked for ₹8 lakh. A tool that showed her only
the first number would have congratulated her into a loan at 21% of her income on
top of an existing car EMI.

The app leads with a picture of that gap — both maximums on one axis, with what she
asked for outlined on top — because two figures in separate boxes do not convey it.

## 2. Three borrowers, three shapes of answer

**Priya** → *borrow less.* Her constraint is not eligibility, it is her own budget
plus an unproductive purpose. The useful advice is a shorter tenure and a smaller
ticket, and to stop treating the sanction letter as a measure of affordability.

**Ravi** → *borrow less, and secured.* He walks in asking for an unsecured business
loan at 19–25%. He owns his shop outright. Routing him to a property-backed loan is
worth about **9.3 percentage points a year** — more than any negotiation on an
unsecured rate could ever get him. His missing credit score is modelled as a *range*
of grades (A to C), not as a bad score, because 14 years of never defaulting on
anything is not the same as a default.

**Anita** → *don't borrow.* Her surplus is negative, and her existing app-loan EMIs
already exceed the FOIR headroom a lender would allow — a lender would advance ₹0.
The refusal is correct, and it still has to be useful: she gets a sequence. Refinance
the ₹35,000 at up to 34% first, because that is worth more per month than this loan
could earn her; the scooter is genuinely productive, so route it as an asset-backed
two-wheeler loan rather than ₹1,50,000 unsecured; a co-applicant flips her verdict,
and the app knows that because the VOI engine measured it.

## 3. The two things I would defend hardest

**"Every additional question must move a number" is enforced, not promised.**
`src/engine/voi.ts` replays each candidate answer through the entire assessment and
measures how far the outputs travel. Below threshold, the question is *dropped* —
not deprioritised. This has three consequences I like: the question set adapts per
borrower without anyone maintaining a list; the ordering is defensible in rupees
("this is worth ₹11.6 lakh of uncertainty to you"); and if a rule change makes a
question irrelevant, it disappears on its own. The proof table is generated into
RULES.md so the claim can be checked rather than believed.

The honest edge case: a lender's existing quote cannot change what a borrower can
afford, so it scores zero and would be cut — but it is exactly what the Negotiation
Card is built from. Rather than fudge its score I gave it a third tier that sits
outside the ranking. Same for "what kind of loan were you thinking of?", which
changes the *advice* (whether we tell you you're asking for the wrong product) but
none of the four numbers. Both are documented as such.

**Uncertainty is asymmetric, deliberately.** A missing credit score widens the rate
band without shifting it upward — not knowing a score is not evidence of a bad one,
and punishing people for being new to formal credit is how these tools quietly go
wrong. But a number asserting *affordability* must never drift upward on missing
information, so the safe-carry figures shrink as confidence falls. Being vague about
a price is fair; being vague about affordability is dangerous.

## 4. What building it actually taught me

Three bugs worth naming, because each was a category rather than an instance.

**The interview could get stuck.** `isAnswered` required a non-empty array for "list
your loans", but both *Next* and *Skip* submit an empty one — so it re-asked forever.
The fix was easy; the useful part was the invariant that came out of it: *whatever an
answer widget can produce, `isAnswered` must accept*. That test then found two more
instances, including one that wrote a non-member value into a typed enum field and
crashed routing.

**A quote comparison contradicted itself.** It reported "inside the fair band" and
"the gap costs you ₹15,115" simultaneously, because the stance was measured on APR
and the gap on the nominal rate ceiling. Trying to unify them on total cost failed a
sweep test with a residual ₹61 — which turned out to be a real property, not a bug:
APR discounts money for time and total cost does not, so two offers at identical APR
with different rate/fee splits genuinely have different total costs. Neither can be
derived from the other. The resolution is that APR decides the verdict and total cost
prices the excess, gated on the verdict so they cannot disagree.

**A green banner on an unaffordable loan.** The stance judged only price, but sat at
the top styled as the answer — so a ₹7 lakh offer whose EMI was ₹8,741/month over
Priya's ceiling showed "Inside the fair band" in green. A fair price on too large a
loan is still the wrong loan. Affordability now outranks price in the headline, and
the panel inverts the arithmetic to tell her what to ask for instead: about ₹4.37
lakh at the rate they already offered.

## 5. What I would build next

1. **Refinance-first as a first-class output.** For Anita, clearing 34% debt beats
   any new borrowing, and the app says so in prose but does not *quantify* it. A
   fifth output — "what refinancing your existing debt is worth per month" — would
   be the single highest-value addition, and the engine already has the pieces.
2. **A real question about income *variability* for salaried borrowers.** I gate
   that question on being non-salaried, which is wrong for anyone on a large bonus
   or commission component. Cheap fix, real accuracy gain.
3. **Multilingual output, and voice intake.** The borrowers most in need of this are
   least likely to complete a nine-question form in English. This is a bigger
   product win than anything else on the list and I would not attempt it without a
   native reviewer for the copy.
4. **Sensitivity on the judgement calls.** Roughly a third of the rulebook is my
   calibration rather than a published norm. A mode that shows how each verdict
   moves as `safe.utilisation_of_surplus` sweeps 0.5→0.8 would make the tool
   arguable rather than oracular — and would be the honest way to present it to a
   credit team.

## 6. What I cut, and why

**A conversational AI copilot.** Designed and partly built (`server/tools.ts`
exposes the kernel as a Gemini toolset; `src/copilot/guardrails.ts` validates that
every number in generated prose appears in the assessment trace, falling back to the
deterministic sentence otherwise). It is not wired into the running app.

The reason is the honest one: **there is no line in the rubric for it.** All 100
points are in domain reasoning, question design, explainability, product craft,
engineering and honesty — and every one of those is better served by the
deterministic path. The copilot was additive by construction, so cutting it left a
complete app rather than a hole. Being able to say that is a better answer than
having shipped a chat window.

Where it *would* earn its place: parsing messy free-text intake ("cash comes in 40 to
80 thousand, ITR shows 4.2 lakh") into facts that preserve both the range and the
unknown, and open-ended negotiation Q&A ("what if they say the rate is fixed?").
Rules cannot do either. Neither is worth a point on this rubric.

**Also cut:** a rule-editing UI (the follow-up asks me to change a rule live, and a
one-line diff in `rulebook.ts` plus `npm run docs` demonstrates that better than a
form would); persistence and shareable links, which fight the no-data-stored
constraint; and any lending product beyond the six the three borrowers need.

---

## Where to look

| | |
|---|---|
| The two O2 numbers | `src/engine/affordability.ts`, `src/engine/eligibility.ts` |
| Why every question earns its place | `src/engine/voi.ts` |
| All-in APR as a real IRR | `src/engine/emi.ts` → `allInApr` |
| Every threshold, with its reason | `src/engine/rulebook.ts` |
| The verdict ladder | `src/engine/verdict.ts` |
| Reasoning locked in tests | `src/engine/__tests__/personas.test.ts` |
