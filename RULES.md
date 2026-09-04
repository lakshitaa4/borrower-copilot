# RULES.md

**This file is generated.** It is produced from `src/engine/rulebook.ts` by `npm run docs:rules`, which reads the same objects the engine computes with. There is no second copy of any number to fall out of date — if a threshold changes and this file does not, the change did not happen.

Sourcing is blunt on purpose. `my judgement` means exactly that: a calibration I chose and will defend, not a published standard. A borrower-facing tool that presents guesses as regulation is worse than one that says which is which.

## The rules

### Risk grade

| What | Value | Why | Source |
| --- | --- | --- | --- |
| **Credit score to risk grade**<br>`grade.score_bands` | `min`: 780, `grade`: A+<br>`min`: 750, `grade`: A<br>`min`: 700, `grade`: B<br>`min`: 650, `grade`: C<br>`min`: 0, `grade`: D | Lenders price off score cut-offs clustered around 750 and 700; these are the break points where published retail rate cards visibly step. | market observation — indicative Indian retail lending bands, 2026 |
| **Grade range when there is no credit score and no formal borrowing history**<br>`grade.thin_file` | `best`: A<br>`worst`: C | A borrower with no score is not a bad borrower — they are an unmeasured one. Ravi has run a shop for 14 years and never defaulted on anything, because he has never borrowed. Modelling him as a range from A to C says exactly that: he could price well or poorly, and we cannot tell which until he is scored. Collapsing this to a single bad grade would be the "unknown = 300" error. | my judgement |
| **Grade range when there is a recent bounce or active high-cost debt**<br>`grade.impaired` | `best`: C<br>`worst`: D | A missed EMI in the last 12 months is the single strongest observable predictor available to us without a bureau pull, and app-loan borrowing at 30%+ signals the borrower has already exhausted cheaper options. | my judgement |
| **Extra width added to the rate band when the credit score is unknown**<br>`grade.unknown_score_penalty_pp` | 2.5 | Quantifies the cost of the silence so the borrower can decide whether it is worth five minutes on a free bureau site. It widens the band; it never shifts the band upward, because not knowing a score is not evidence of a bad one. | my judgement |

### Affordability — lender

| What | Value | Why | Source |
| --- | --- | --- | --- |
| **Base FOIR ceiling by monthly income slab**<br>`foir.ladder` | `minIncome`: 100000, `foir`: 0.55<br>`minIncome`: 50000, `foir`: 0.5<br>`minIncome`: 25000, `foir`: 0.45<br>`minIncome`: 0, `foir`: 0.4 | FOIR (fixed obligations to income ratio) is how lenders actually size retail loans. The ladder rises with income because absolute residual income matters more than the ratio: 45% of ₹20,000 leaves ₹11,000 to live on, while 55% of ₹2,00,000 leaves ₹90,000. Lenders underwrite the residual, not the percentage. | market observation — indicative Indian retail lending bands, 2026 |
| **FOIR adjustments in percentage points**<br>`foir.adjustments` | `informalIncome`: -0.05<br>`selfEmployed`: -0.03<br>`noCreditHistory`: -0.05<br>`securedProduct`: 0.05<br>`recentBounce`: -0.05<br>`highCostDebt`: -0.03 | These mirror the direction of real credit policy: unverifiable income and absent history tighten the ratio, registered collateral loosens it. Signs matter more than magnitudes here, and the magnitudes are mine. | my judgement |
| **Absolute FOIR ceiling no adjustment may exceed**<br>`foir.hard_ceiling` | 0.6 | Past roughly 60% of income committed to fixed obligations, a borrower has no capacity to absorb any shock at all. Lenders rarely sanction beyond it and we refuse to imply they will. | market observation — indicative Indian retail lending bands, 2026 |
| **Share of stated income a lender will underwrite, by income type**<br>`income.recognition` | `salaried`: 1<br>`selfEmployedDocumented`: 1<br>`selfEmployedBankingUplift`: 1.2<br>`informal`: 0.6 | This is the hinge of the whole assessment: a lender lends against *provable* income, not earned income. A salary credit is fully verifiable. A self-employed borrower is underwritten off filed returns, with a modest uplift where bank statements support more (the banking-surrogate programmes). Informal cash income has no trail at all, so most of it simply does not count. Ravi earns ₹40,000–80,000 and will be assessed on ₹35,000; that gap is the product. | market observation — indicative Indian retail lending bands, 2026 |
| **Share of a co-applicant's income added to assessed income**<br>`income.co_applicant_weight` | 1 | A co-applicant is jointly liable, so lenders club income fully. Included only when the borrower confirms the co-applicant will actually sign. | market observation — indicative Indian retail lending bands, 2026 |

### Affordability — borrower

| What | Value | Why | Source |
| --- | --- | --- | --- |
| **When the purpose is consolidation, the existing EMIs are treated as repaid by the new loan**<br>`safe.consolidation_replaces_debt` | yes | A consolidation loan pays off what it replaces, so charging the borrower for both at once is simply wrong arithmetic — it made a nurse with ₹19,000 of existing EMIs look as though a loan to clear them would leave her with nothing, which is the opposite of what consolidation does. The assumption is that the new loan fully repays the old debt; where it does not, the residual obligation is understated, and the app says so. | my judgement |
| **A co-applicant's income counts in the household surplus as well as in the lender's assessment**<br>`safe.co_applicant_counts_twice` | yes | Obvious once stated, and it was missing. A spouse who earns is money the household can actually spend, not only a number a lender clubs in. Leaving them out of the surplus model understated what the household could carry and, worse, hid the one genuine route open to a borrower like Anita: a joint application is the single change that moves her off "do not borrow", and the app could not see it. | my judgement |
| **Share of net income reserved for saving before any EMI**<br>`safe.savings_floor_pct` | 0.1 | A loan that consumes the borrower's entire surplus leaves them one bad month from borrowing again at a worse rate. Protecting 10% is what stops this tool from simply reproducing the lender's answer. | my judgement |
| **Monthly buffer held back per financial dependant**<br>`safe.dependant_buffer_rupees` | 3000 | Dependants make expenses less compressible: a household of four cannot cut spending as fast as a single earner when income drops. Anita has two children and an unemployed husband, so ₹9,000 of her income is structurally unavailable. | my judgement |
| **Share of remaining surplus that may go to a new EMI**<br>`safe.utilisation_of_surplus` | 0.65 | Committing every spare rupee to an EMI is not affordability, it is a coin flip on nothing going wrong. Two thirds keeps a genuine margin, and it is the single value I would expect to be challenged on — it is a risk-appetite choice, not an arithmetic one. | my judgement |
| **Emergency-fund target and the haircut applied when it is short**<br>`safe.emergency_fund` | `targetMonths`: 3<br>`haircutBelowTarget`: 0.2<br>`haircutBelowOneMonth`: 0.35 | Savings are what convert a shock into an inconvenience instead of a default. A borrower with no buffer needs a smaller EMI than an identical borrower with three months banked, and no FOIR calculation anywhere captures that. | my judgement |
| **Haircut applied to the variable portion of income**<br>`safe.variable_income_haircut` | 0.3 | Applied to the variable share only, so a borrower who is 20% commission is discounted a fifth as hard as one who is fully on commission. For safe-carry we additionally take the *low* end of any income range, because the borrower has to survive the bad months, not the average one. | my judgement |
| **A household with no monthly surplus has zero safe capacity, whatever the loan might earn**<br>`safe.no_surplus_no_capacity` | yes | Projected earnings cannot fund an instalment that starts before they do. Without this rule, Anita — who is ₹15,000 to ₹18,000 short every month before borrowing anything — was credited with a small positive EMI ceiling out of what the scooter was expected to earn. The direction is simply wrong: money you are hoping for is not money you can pay with. If there is nothing spare today, the answer is zero, and the productive-loan adjustment applies only to a household that is already in surplus. | my judgement |
| **Share of projected income from a productive loan that counts**<br>`safe.productive_gain_haircut` | 0.5 | Anita's second scooter and Ravi's new stock line genuinely will earn — but projections made while asking for money are optimistic, and the EMI starts before the earnings do. Half, and never enough to exceed the lender ceiling. | my judgement |

### Products

| What | Value | Why | Source |
| --- | --- | --- | --- |
| **Product catalogue: tenure, LTV, ticket size and fee bands**<br>`products.catalogue` | `personal`: `label`: Personal loan, `secured`: no, `minTenureMonths`: 12, `maxTenureMonths`: 60, `prudentTenureMonths`: 36, `minAmountRupees`: 50000, `maxAmountRupees`: 4000000, `processingFeePctBand`: 1, 2.5<br>`home`: `label`: Home loan, `secured`: yes, `securedByPurchase`: yes, `minTenureMonths`: 120, `maxTenureMonths`: 360, `prudentTenureMonths`: 240, `maxLtvPct`: 80, `minAmountRupees`: 500000, `maxAmountRupees`: 100000000, `processingFeePctBand`: 0.25, 0.5<br>`lap`: `label`: Loan against property, `secured`: yes, `minTenureMonths`: 60, `maxTenureMonths`: 180, `prudentTenureMonths`: 120, `maxLtvPct`: 60, `minAmountRupees`: 300000, `maxAmountRupees`: 50000000, `processingFeePctBand`: 0.5, 1.5<br>`gold`: `label`: Gold loan, `secured`: yes, `minTenureMonths`: 6, `maxTenureMonths`: 36, `prudentTenureMonths`: 24, `maxLtvPct`: 75, `minAmountRupees`: 25000, `maxAmountRupees`: 2500000, `processingFeePctBand`: 0.25, 1<br>`two_wheeler`: `label`: Two-wheeler / EV loan, `secured`: yes, `securedByPurchase`: yes, `minTenureMonths`: 12, `maxTenureMonths`: 48, `prudentTenureMonths`: 36, `maxLtvPct`: 85, `minAmountRupees`: 30000, `maxAmountRupees`: 500000, `processingFeePctBand`: 1, 2.5<br>`business_secured`: `label`: Secured business loan, `secured`: yes, `minTenureMonths`: 12, `maxTenureMonths`: 120, `prudentTenureMonths`: 84, `maxLtvPct`: 65, `minAmountRupees`: 200000, `maxAmountRupees`: 50000000, `processingFeePctBand`: 1, 2<br>`business_unsecured`: `label`: Unsecured business loan, `secured`: no, `minTenureMonths`: 12, `maxTenureMonths`: 48, `prudentTenureMonths`: 36, `minAmountRupees`: 100000, `maxAmountRupees`: 5000000, `processingFeePctBand`: 1.5, 3 | Tenure and ticket bands follow mainstream retail products. The gold LTV cap of 75% is regulatory, not commercial. "Prudent tenure" is my own addition and exists because the longest tenure a lender offers minimises the EMI while maximising total interest — good for the sale, bad for the borrower. | market observation — indicative Indian retail lending bands, 2026; gold LTV cap: RBI regulatory norm; prudent tenure: my judgement |
| **Maximum loan-to-value on a gold loan**<br>`products.gold_ltv_cap` | 75 | A hard regulatory ceiling on gold lending, not a lender preference — so it binds regardless of how creditworthy the borrower is. | RBI regulatory norm |
| **Age by which the loan must be fully repaid, by income type**<br>`products.retirement_age` | `salaried`: 60<br>`self_employed`: 70<br>`informal`: 65 | Tenure is capped so the loan matures while the borrower still has income. This binds hardest on long-tenure secured products for older borrowers. | market observation — indicative Indian retail lending bands, 2026 |

### Pricing

| What | Value | Why | Source |
| --- | --- | --- | --- |
| **Nominal annual interest rate band by product and risk grade (%)**<br>`pricing.rate_bands` | `personal`: `A+`: 10.5, 12.5, `A`: 11.5, 14, `B`: 14, 17, `C`: 17, 21, `D`: 21, 26<br>`home`: `A+`: 8.25, 8.75, `A`: 8.5, 9.25, `B`: 9, 10, `C`: 10, 11, `D`: 11, 12.5<br>`lap`: `A+`: 9, 10.5, `A`: 9.5, 11, `B`: 10.5, 12.5, `C`: 12, 14, `D`: 14, 16.5<br>`gold`: `A+`: 9, 11, `A`: 9.5, 12, `B`: 11, 14, `C`: 13, 16, `D`: 15, 18<br>`two_wheeler`: `A+`: 9.5, 11.5, `A`: 10.5, 13, `B`: 12.5, 15.5, `C`: 15, 18.5, `D`: 18, 24<br>`business_secured`: `A+`: 11, 13, `A`: 11.5, 14, `B`: 13, 16, `C`: 15, 18, `D`: 17, 21<br>`business_unsecured`: `A+`: 16, 18, `A`: 17, 20, `B`: 19, 22, `C`: 21, 25, `D`: 24, 30 | Indicative bands, and the most likely thing to be out of date in this file — they move with the policy rate and with competition. The *shape* is the durable part: secured products price 4-8 points below unsecured ones for the same borrower, which is why routing Ravi to a property-backed loan is worth more to him than any negotiation on an unsecured rate. | market observation — indicative Indian retail lending bands, 2026 |
| **A quoted band may never fall below the best grade's rate for that product**<br>`pricing.rate_floor` | yes | Widening a band for low confidence must not invent a rate that no borrower could obtain. Without this floor, an unscored borrower with few answers ended up shown a two-wheeler rate starting below 8% — a number that does not exist in the market and would send them into a branch expecting something unavailable. Uncertainty widens the band upward; the bottom stops at the best real price. | my judgement |
| **Extra band width per grade of uncertainty about the borrower's grade**<br>`pricing.grade_spread_widening_pp` | 0.5 | When we can only place the borrower within a range of grades, the quoted band spans all of them plus a little — uncertainty about the grade is itself a reason to expect a worse negotiation position. | my judgement |
| **What the all-in APR must include**<br>`pricing.apr_components` | interest, processing fee, bundled insurance and charges | The headline rate is not the price. A ₹8,00,000 personal loan at 12% with a 2% fee costs more than the same loan at 12.5% with no fee, and the borrower cannot see that from the two rates. APR is computed as the internal rate of return on the actual cashflows — amount disbursed net of all charges, then the EMIs — which is the only comparison that is honest. Adding the fee percentage to the interest rate, which is the common shortcut, is simply wrong. | RBI Key Fact Statement / all-in APR disclosure requirement |

### Verdict

| What | Value | Why | Source |
| --- | --- | --- | --- |
| **Thresholds that decide borrow / borrow less / do not borrow**<br>`verdict.thresholds` | `requestedToSafeEmiDontBorrow`: 1.5<br>`borrowLessFloorRupees`: 25000<br>`minEmergencyMonthsForConsumption`: 1<br>`postLoanFoirHardStop`: 0.6<br>`highCostDebtRatePct`: 24 | The "do not borrow" path has to be genuinely reachable or the tool is decoration. It fires when the requested EMI is more than 1.5x what the borrower can carry, when a shock would breach 60% of income, or when someone with no buffer is borrowing for consumption. The floor stops us suggesting a "borrow less" amount too small to be worth arranging. | my judgement |
| **The shock every recommendation is tested against**<br>`verdict.stress_case` | `incomeDropPct`: 0.2<br>`rateRisePp`: 2 | A 20% income drop is one lost client, one slow season, or a partner out of work for a month. A 200 basis point rate rise is an ordinary policy cycle on a floating loan. Neither is a disaster scenario, which is the point: if the EMI fails under ordinary bad luck, it was never affordable. | my judgement |

### Confidence

| What | Value | Why | Source |
| --- | --- | --- | --- |
| **How much each fact contributes to confidence in the outputs**<br>`confidence.fact_weights` | `netMonthlyIncome`: 3<br>`existingEmiTotal`: 2<br>`householdExpenses`: 2<br>`creditScore`: 2<br>`amountWanted`: 1<br>`incomeType`: 1<br>`purpose`: 1<br>`rent`: 1<br>`age`: 1<br>`emergencySavingsMonths`: 1.5<br>`documentedIncomeAnnual`: 1.5<br>`variableIncomeShare`: 1<br>`dependants`: 1<br>`collateralValue`: 1<br>`bouncesLast12m`: 1.5<br>`incomeStabilityYears`: 1 | Weighted by how much each fact actually moves a number, not by how interesting it is. Income is worth three times rent because every output is a function of income. | my judgement |
| **How aggressively output bands widen as confidence falls**<br>`confidence.band_widening_k` | 0.6 | Half-width is multiplied by 1 + k(1 - confidence), so a borrower who answered only the must-set sees a band roughly 60% wider than one who answered everything. Silence must never narrow a range, and the app must say which silence widened which number. | my judgement |
| **How much the safe-to-carry figures shrink as confidence falls**<br>`confidence.safety_haircut` | 0.25 | Uncertainty is treated asymmetrically, on purpose. A rate band we are unsure about widens in both directions, because not knowing a borrower's score is not evidence they will be priced badly. But a figure that says "you can afford this" must never drift upward on the strength of missing information — so the safe-carry numbers are cut instead of widened. Being vague about a price is fair; being vague about affordability is dangerous. | my judgement |
| **Confidence lost when a fact is given as a wide range rather than a figure**<br>`confidence.range_spread_penalty` | 0.5 | Ravi answering "₹40,000 to ₹80,000" is more informative than silence but much less than "₹52,000". Credit is given in proportion to the tightness of the answer, scaled by that fact's weight. | my judgement |

### Question design

| What | Value | Why | Source |
| --- | --- | --- | --- |
| **How the value of asking a question is scored**<br>`questions.voi_weights` | `verdictFlip`: 3<br>`amountShare`: 1<br>`emiShare`: 1<br>`ratePerPoint`: 0.2 | A question that could flip the verdict outright is worth more than one that nudges a band, so it is weighted three times as heavily. Amount and EMI movements are scored as a share of the borrower's own figures rather than in absolute rupees — ₹5,000 of movement means something very different to Anita than to Priya. | my judgement |
| **The bar an additional question must clear to be asked at all**<br>`questions.policy` | `minAmountDeltaRupees`: 2000<br>`minEmiDeltaRupees`: 200<br>`minRateDeltaPp`: 0.25<br>`maxAdditionalQuestions`: 12 | The brief's rule is that every additional question must change an output. Rather than honour that by taste, the engine simulates each candidate answer, measures how far the output actually moves, and mechanically drops any question that moves it less than this. The generated proof table in RULES.md is the receipt — and a question that stops earning its place after a rule change disappears on its own. | my judgement |

## The question set

Core questions are always asked — they are the minimum needed to produce the four outputs. Additional questions are only asked when the value-of-information engine can show they move a number for that particular borrower. The `negotiation` tier feeds the card and does not affect the assessment at all, so it is kept out of the ranking rather than allowed to score zero.

| Tier | Question | Fills | Asked when | Why we ask |
| --- | --- | --- | --- | --- |
| core | What is the loan for? | `purpose` | always | A loan that earns money is judged differently from one that does not, and the purpose decides which products you should even be looking at. |
| core | How much are you hoping to borrow? | `amountWanted` | always | This is what we test against everything else. If it turns out to be too much, we will tell you what is not. |
| core | What kind of loan were you thinking of? | `productWanted` | always | Only so we can tell you if it is the wrong one. This is the single question here that does not move any of your four numbers — we work out the right product from your situation regardless. But if what you came in asking for costs you several points more than something you already qualify for, you should be told, and we cannot tell you unless we know what you were going to ask for. |
| core | How do you earn? | `incomeType` | always | This matters more than the amount. A lender lends against income it can verify, so how you are paid changes what they will count. |
| core | What reaches you in a month, after deductions? | `netMonthlyIncome` | always | Every number in your assessment is built on this. If it varies, give us the range — we will use the low end, because that is the month you still have to pay in. |
| core | What do you already pay every month on loans or EMIs? | `existingEmiTotal` | always | This comes straight off what a lender will allow you, and off what you can actually afford. Include app loans and gold loans. |
| core | Roughly what does the household spend in a month, apart from rent and EMIs? | `householdExpenses` | always | Without this we have to assume anywhere between a third and half your income, which is the widest guess in your whole assessment. |
| core | How much rent do you pay? | `rent` | always | Rent is a fixed claim on your income that most eligibility calculators quietly ignore. |
| core | How old are you? | `age` | always | The loan has to finish before your income does, so your age caps how long you can spread it. |
| core | Do you know your credit score? | `creditScore` | always | If you do not know it, we will not assume the worst — but we will have to quote you a wider rate band, and we will show you exactly how much that costs. |
| additional | What income do your filed returns show for the year? | `documentedIncomeAnnual` | self-employed income only | A lender underwrites what you can prove, not what the business takes. This is usually the single biggest gap for a self-employed borrower. |
| additional | Do you have 12 months of bank statements showing money coming in? | `hasBankStatements` | self-employed or informal income | Some lenders will lend against banking turnover when returns understate the business. It can lift what they count. |
| additional | Is there anything you could offer as security? | `collateralType` | always | This is usually the most valuable question on the list. Security can move you from an unsecured rate in the twenties to a secured one in the low teens. |
| additional | Roughly what is it worth? | `collateralValue` | after they say there is something to pledge | A secured loan is capped at a share of what the security is worth, so this sets your ceiling. |
| additional | Is there already a loan against it? | `collateralEncumbered` | after a value is given for the security | Security that is already pledged cannot be pledged again, so this can remove the secured option entirely. |
| additional | Would anyone apply jointly with you, and what do they earn? | `coApplicantIncome` | always | A co-applicant is jointly liable, so a lender counts their income alongside yours. It is often the quickest way to raise what you can be offered. |
| additional | How many people depend on your income? | `dependants` | always | A household of five cannot cut spending as fast as a single earner when a bad month comes, so we hold more back. |
| additional | If your income stopped, how many months could you cover from savings? | `emergencySavingsMonths` | always | Savings are what turn a shock into an inconvenience instead of a missed payment. With no buffer we lower what we think you can safely carry. |
| additional | How much of your income changes from month to month? | `variableIncomeShare` | not salaried | We discount the part that varies, because you have to make the payment in the slow months too. |
| additional | Have any payments bounced or been missed in the last year? | `bouncesLast12m` | always | A recent miss is the most expensive single item a lender can see, and it costs you a grade whatever your score says. |
| additional | Can you list the loans you are paying, with the rate on each? | `existingLoans` | only if they already pay EMIs | The rate matters as much as the amount. Debt above 24% should usually be cleared before anything new is taken on. |
| additional | How long have you been earning this way? | `incomeStabilityYears` | always | Length of track record is what a lender leans on when there is no score to go by. |
| additional | How much of your credit card limit are you using? | `cardUtilisationPct` | only if a credit file already exists | Running a card near its limit pulls a score down even when every payment is on time. |
| additional | How much extra do you expect to earn each month because of this? | `productiveMonthlyGain` | only when the loan is productive | A loan that earns can carry a little more — but only half of what you project, because the EMI starts before the earnings do. |
| additional | Is there a large expense coming in the next year? | `upcomingExpenseMonthly` | always | School fees, a wedding or a medical cost landing mid-loan is one of the commonest reasons an affordable EMI stops being affordable. |
| negotiation | Has a lender already quoted you something? | `offer` | always | Give us the rate, the fee and the tenure and we will work out what it actually costs, and what to say if it is above fair. |

## Proof that every additional question moves a number

The brief's rule is that every additional question must change an output, and that a question which never moves a number should be cut. Rather than honour that by taste, the engine replays each candidate answer through the whole assessment and measures how far the outputs travel. Anything below the thresholds in `questions.policy` is dropped automatically.

The tables below are generated from the three borrowers in the brief, each having answered only the core set. `Δ amount` is how far the recommended loan size could move; `Δ rate` is how far the rate band midpoint could move; `flips` means the answer could change the verdict itself.

### Priya, 29 — Bengaluru · salaried

| Question | Δ amount | Δ EMI ceiling | Δ rate | Flips verdict | Asked? |
| --- | ---: | ---: | ---: | --- | --- |
| Would anyone apply jointly with you, and what do they earn? | ₹8,30,692 | ₹27,790 | 0% | **yes** — BORROW_LESS / BORROW | yes |
| Is there a large expense coming in the next year? | ₹3,17,517 | ₹10,622 | 0% | **yes** — BORROW_LESS / DONT_BORROW | yes |
| Is there anything you could offer as security? | ₹4,75,591 | ₹0 | 1.8% | **yes** — BORROW / BORROW_LESS | yes |
| How many people depend on your income? | ₹2,08,547 | ₹6,977 | 0% | no | yes |
| If your income stopped, how many months could you cover from savings? | ₹1,13,228 | ₹3,788 | 0% | no | yes |
| Can you list the loans you are paying, with the rate on each? | ₹7,828 | ₹0 | 1% | no | yes |
| Have any payments bounced or been missed in the last year? | ₹7,975 | ₹0 | 1% | no | yes |
| How long have you been earning this way? | ₹0 | ₹0 | 0% | no | **dropped** |
| How much of your credit card limit are you using? | ₹0 | ₹0 | 0% | no | **dropped** |

> Dropped for Priya: `incomeStabilityYears`, `cardUtilisationPct`. These move nothing for this borrower, so the app does not ask them. They may still be asked of someone else — the set is per-borrower, not fixed.

### Ravi, 42 — Mysuru · self-employed

| Question | Δ amount | Δ EMI ceiling | Δ rate | Flips verdict | Asked? |
| --- | ---: | ---: | ---: | --- | --- |
| Is there anything you could offer as security? | ₹11,61,609 | ₹0 | 9.3% | no | yes |
| Would anyone apply jointly with you, and what do they earn? | ₹5,91,621 | ₹14,395 | 0% | no | yes |
| What income do your filed returns show for the year? | ₹5,81,599 | ₹0 | 0% | no | yes |
| Have any payments bounced or been missed in the last year? | ₹1,05,105 | ₹0 | 3.8% | no | yes |
| How much extra do you expect to earn each month because of this? | ₹0 | ₹15,100 | 0% | no | yes |
| If your income stopped, how many months could you cover from savings? | ₹24,481 | ₹11,289 | 0% | no | yes |
| Is there a large expense coming in the next year? | ₹0 | ₹9,815 | 0% | no | yes |
| How many people depend on your income? | ₹0 | ₹6,630 | 0% | no | yes |
| How much of your income changes from month to month? | ₹0 | ₹5,304 | 0% | no | yes |
| Do you have 12 months of bank statements showing money coming in? | ₹0 | ₹0 | 0% | no | **dropped** |
| How long have you been earning this way? | ₹0 | ₹0 | 0% | no | **dropped** |

> Dropped for Ravi: `hasBankStatements`, `incomeStabilityYears`. These move nothing for this borrower, so the app does not ask them. They may still be asked of someone else — the set is per-borrower, not fixed.

### Anita, 35 — Hubballi · informal

| Question | Δ amount | Δ EMI ceiling | Δ rate | Flips verdict | Asked? |
| --- | ---: | ---: | ---: | --- | --- |
| Would anyone apply jointly with you, and what do they earn? | ₹3,22,838 | ₹6,788 | 0% | **yes** — DONT_BORROW / BORROW | yes |
| How much extra do you expect to earn each month because of this? | ₹0 | ₹7,120 | 0% | no | yes |
| How many people depend on your income? | ₹0 | ₹6,363 | 0% | no | yes |
| Have any payments bounced or been missed in the last year? | ₹0 | ₹0 | 4.3% | no | yes |
| Can you list the loans you are paying, with the rate on each? | ₹0 | ₹0 | 4.2% | no | yes |
| Is there a large expense coming in the next year? | ₹0 | ₹4,628 | 0% | no | yes |
| How much of your income changes from month to month? | ₹0 | ₹3,483 | 0% | no | yes |
| If your income stopped, how many months could you cover from savings? | ₹0 | ₹2,242 | 0% | no | yes |
| Is there anything you could offer as security? | ₹0 | ₹0 | 1.6% | no | yes |
| Do you have 12 months of bank statements showing money coming in? | ₹0 | ₹0 | 0% | no | **dropped** |
| How long have you been earning this way? | ₹0 | ₹0 | 0% | no | **dropped** |

> Dropped for Anita: `hasBankStatements`, `incomeStabilityYears`. These move nothing for this borrower, so the app does not ask them. They may still be asked of someone else — the set is per-borrower, not fixed.

## What this does not know

- **Rate bands are indicative and will date.** They move with the policy rate and with competition, and they are the most likely thing in this file to be wrong six months from now. The durable part is the *shape* — secured products price several points below unsecured ones for the same borrower.
- **There is no bureau pull.** Every credit assessment here runs on what the borrower tells us. A real score can differ from a remembered one, and a real report can contain obligations the borrower has forgotten.
- **Lender policies vary more than any single ladder can capture.** The FOIR ladder is a reasonable central case, not a specific lender's credit policy. Two banks will give the same borrower materially different answers.
- **Household expenses are self-reported and usually understated.** When the borrower does not answer, the assumed band is deliberately wide, and the app says so on screen rather than hiding it.
- **Projected earnings from a productive loan are optimistic by nature.** Only half of what the borrower projects is counted, and it can never push the recommendation past what a lender would advance.
- **Nothing here is a sanction.** It is what the borrower should expect and what they should refuse — the lender still decides.

---

_Generated from 33 rules and 26 questions by `npm run docs:rules`._
