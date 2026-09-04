# Walkthrough

Five minutes, written. What it does, the decisions I would defend hardest,
what the numbers taught me, what I would build next, and what I cut.

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

**Ravi** → *borrow, but secured.* He walks in asking for an unsecured business loan,
where his thin file prices him at **16–28.6%**. He owns his shop outright, and against
it the same money is **9–17.3%** — roughly **11 points** off the top of his band, and
more than any negotiation on an unsecured rate could ever get him. Routing, not
haggling, is his whole answer. With his wife's ₹18,000 counted as household income he
can carry the full ₹15,00,000 he asked for, and the app does not push him toward the
~₹20,00,000 his capacity would technically allow. His missing credit score is modelled
as a *range* of grades (A to C), not as a bad score, because 14 years of never
defaulting on anything is not the same as a default.

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

## 4. What the numbers taught me

Three things I did not know before building it, all found by pushing thresholds
around and watching who moved.

**A loan that earns money is the most dangerous case, not the safest one.**
Anita's scooter genuinely would pay for itself — that is exactly what makes it
seductive. Sweeping the surplus-utilisation threshold from 0.65 down to 0.55, I
expected every ceiling to fall. Anita's *rose*, from ₹0 to ₹543. Lowering a
safety parameter had made her look more able to borrow.

The cause was an ordering mistake with a real lending lesson inside it: the
projected earnings were added *after* the surplus was taken, so they were not
subject to it. A household ₹15,000 short every month was being credited with
capacity out of income the scooter had not made yet. But the instalment starts in
month one and the earnings ramp up over months — the borrower has to bridge that
gap out of a surplus they do not have. So the rule is now absolute: **no surplus,
no capacity, whatever the loan might earn.** Productive lending is for households
that can survive the ramp-up, and Anita cannot. It is tested as a property, so a
tenfold optimistic projection still cannot manufacture capacity.

**A co-applicant changes both sides of the ledger, and I had modelled one.**
Ravi's wife earns ₹18,000 teaching. I had that income counted where a lender
counts it — clubbed into the assessed income — and nowhere else. Not in the
household surplus, and not in the obligation ratio.

The symptom was a card that contradicted itself: it told him he could carry
₹41,112 a month, then capped him at ₹13.65 lakh because his ₹26,375 instalment
was 66% of income — 66% of ₹40,000, his earnings alone, while the ceiling above
it had been computed on ₹58,000. Three parts of the app held three different
views of "his income". Defining it once, as a household, moved him from *borrow
less* to *borrow the ₹15 lakh you asked for* — which is the right answer for a
man with an unencumbered ₹45,00,000 shop and a second earner at home.

It also surfaced the thing I would not have found by reasoning: a joint
application is Anita's *only* route. The engine can now sweep it — she needs a
co-applicant earning about **₹16,900** before she has any capacity at all, and
about **₹20,900** before the answer becomes yes. She would never learn that from
a refusal, and the card now tells her.

**Headroom is not a recommendation.** With the household counted properly, Ravi's
capacity is close to ₹20 lakh. He asked for ₹15 lakh. The card duly said "ask for
₹19.79 lakh" — and a borrower-side tool that turns spare capacity into a
suggestion has quietly become the thing it was built to counter. Every lender in
the market will already offer him the larger number. The recommendation is now
capped at what the borrower actually came in wanting, and there is a test that
holds it there.

**The thread running through all three:** there is no single "conservatism" dial
on this model, because a different constraint binds for each borrower. Priya is
limited by her own surplus, Ravi by the obligation ratio in a slow month, Anita by
FOIR headroom her existing app loans have already consumed. Tightening one
threshold helps one of them and does nothing for the other two — which is why the
value-of-information engine is per-borrower, and why sweeping thresholds is how I
found every one of these rather than reading the code.

## 5. What I would build next

In order. Each one attacks a specific weakness I can point to in the current model.

**1. Stop taking their word for it — one upload for each half of O2.**

*The lender's half: the ITR, and the bank statements.* Income recognition is the
biggest single lever in the engine — how much a lender will *believe* decides
everything downstream. Right now the borrower types a number and we take it. An
uploaded return turns declared income into verified income, and bank statements
unlock the banking-surrogate uplift that currently sits behind a yes/no question
nobody can substantiate. For Ravi that is the difference between ₹35,000 of
assessed income and a defensible case for more.

*The borrower's half: three months of UPI.* `householdExpenses` is the widest
assumption in the whole model — unanswered, the app guesses 35% to 55% of income
and admits on screen that this is the loosest number in the assessment. It is
also the most understated figure in consumer lending, because people genuinely do
not know what they spend. In India that is a solved problem waiting to be picked
up: for Anita and Ravi almost every rupee leaves by UPI, so three months of
statements are a better record of the household than any question I could ask.

Categorising it would do more than tighten the number. It would separate
**compressible** spending from **non-compressible** — rent, school fees and
existing EMIs cannot be cut in a bad month; eating out can. The engine currently
treats every rupee of expenditure as equally fixed, which is why the dependant
buffer exists as a crude proxy for exactly this. With real categories, the stress
test stops asking "could you survive a 20% income drop?" and starts asking "could
you survive it *given what you actually cannot stop paying?*" — which is the
question that decides whether a loan defaults.

Two honest notes. The sanctioned route for this in India is the Account
Aggregator framework, consent-based and revocable, rather than asking people to
upload PDFs — building it any other way would be the wrong lesson. And it cuts
against the promise on the front page that nothing leaves the device. Statement
parsing would have to happen on-device, or the claim has to change; I would
rather narrow the feature than quietly widen what the app does with someone's
transaction history.

**2. Fetch the credit score instead of asking for it.**
"Do you know your score?" is the widest band-widener in the app: not knowing costs
2.5 percentage points of range, and the borrowers least likely to know are the ones
who can least afford the vagueness. Pulling it directly — with consent, via a
bureau's free consumer API — collapses that band before the borrower ever speaks to
a lender. It is also the single question where the app currently has to say "we
cannot narrow this for you", which is exactly the situation the product exists to
fix.

**3. The copilot: conversational intake, including voice.**
The 10 questions are a form, and a form is the wrong interface for the people who
need this most. Anita is a delivery rider; Ravi runs a shop counter. Neither is
going to work through a form in English on a phone between jobs. Being able to say
*"cash comes in 40 to 80 thousand, ITR shows 4.2 lakh, never taken a loan"* and have
it become structured facts — with the range preserved as a range and the unknown
preserved as unknown — is the difference between a demo and something usable. Voice
matters more than the chat window: it removes literacy and typing as barriers, not
just clicks.

The architecture for it is already in the repo and deliberately constrained:
`server/tools.ts` exposes the kernel as a toolset so the model orchestrates and
never calculates, `getNextQuestions()` hands it the value-of-information ranking so
it cannot invent a question, and `src/copilot/guardrails.ts` rejects any generated
sentence containing a number that is not in the assessment trace. It reads the
answers out; it does not decide them.

**4. Refinance-first as a fifth output.**
For Anita, clearing ₹35,000 at up to 34% is worth more per month than any new loan
could earn her. The app says so in prose but does not *quantify* it, and it should:
"refinancing what you already owe is worth ₹X a month to you" is a stronger answer
than "don't borrow". The engine already has every piece needed to compute it.

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
