# RUNTHROUGHS.md

**This file is generated.** `npm run docs:runthroughs` drives each borrower through the same interview loop the app uses — the questions listed are the ones `nextQuestion()` actually chose, in the order it chose them, not a transcript written by hand.

Each borrower is shown twice: once having answered only the core set, and once after the full adaptive interview. Comparing the two is the clearest demonstration of the rule that confidence widens with silence — the verdicts agree, but the bands are visibly wider when the app knows less.

---

## Priya, 29 — Bengaluru · salaried

**Asks for:** ₹8,00,000 personal loan for a wedding

### The questions the app asked (16)

| # | Tier | Question | Answer | Why it was asked |
| ---: | --- | --- | --- | --- |
| 1 | core | What is the loan for? | wedding | Could narrow your rate by 4.5%. |
| 2 | core | How much are you hoping to borrow? | ₹8,00,000 | Would not change any of your numbers. |
| 3 | core | What kind of loan were you thinking of? | personal | Would not change any of your numbers. |
| 4 | core | How do you earn? | salaried | Would not change any of your numbers. |
| 5 | core | What reaches you in a month, after deductions? | ₹1,10,000 | Worth up to ₹2,23,250 on what you can borrow. |
| 6 | core | What do you already pay every month on loans or EMIs? | ₹14,000 | Could change the answer itself, not just the numbers. |
| 7 | core | Roughly what does the household spend in a month, apart from rent and EMIs? | ₹25,000 | Could change the answer itself, not just the numbers. |
| 8 | core | How much rent do you pay? | ₹28,000 | Could change the answer itself, not just the numbers. |
| 9 | core | How old are you? | 29 | Worth up to ₹1,20,803 on what you can borrow. |
| 10 | core | Do you know your credit score? | 780 | Worth up to ₹94,720 on what you can borrow. |
| 11 | additional | Is there a large expense coming in the next year? | doesn't know | Could change the answer itself, not just the numbers. |
| 12 | additional | Is there anything you could offer as security? | none | Could change the answer itself, not just the numbers. |
| 13 | additional | How many people depend on your income? | 0 | Worth up to ₹2,13,729 on what you can borrow. |
| 14 | additional | If your income stopped, how many months could you cover from savings? | 2 months | Worth up to ₹2,03,107 on what you can borrow. |
| 15 | additional | Can you list the loans you are paying, with the rate on each? | Car loan ₹14,000/mo | Worth up to ₹11,445 on what you can borrow. |
| 16 | additional | Have any payments bounced or been missed in the last year? | 0 | Worth up to ₹11,649 on what you can borrow. |

> **Not asked:** `documentedIncomeAnnual`, `variableIncomeShare`, `cardUtilisationPct`, `productiveMonthlyGain` — either they do not apply to this borrower, or the engine measured that they would not move any of the four outputs.

### The four outputs

**O1 — Should you borrow?**

> Borrow less — around ₹4.73 lakh, not ₹8 lakh.

*Why:* ₹8 lakh means ₹26,809 a month against a safe ceiling of ₹15,808 — half again more than your budget carries. At ₹4.73 lakh the instalment fits.

**O2 — How much can you borrow?**

> A lender will likely sanction ₹20.61 lakh – ₹21.69 lakh. You can safely carry ₹4.73 lakh. Work with ₹4.73 lakh.

*Why:* A lender sizes the loan against your income and would go to about ₹21.69 lakh; your own budget, after everything you actually spend, supports ₹4.73 lakh. The smaller number is the real one.

**O3 — What is a fair rate?**

> 10.5% – 12.6% interest — an all-in 11% – 14.5% once the 1% – 2.5% fee is counted.

*Why:* Your profile places you in risk grade A+, and that is what this product costs at that grade. Compare lenders on the all-in figure, not the headline rate — the fee is where the difference hides.

**O4 — What EMI should you agree to?**

> Do not go above ₹15,808 a month.

*Why:* That is what is left after your household costs, rent, the EMIs you already pay and money kept back for saving — and only part of it, so a bad month does not become a missed payment. It does not survive an income drop of a fifth plus a two-point rate rise, which is why the amount is capped where it is.

| | |
| --- | --- |
| Lender will likely sanction | ₹20.61 lakh – ₹21.69 lakh |
| You can safely carry | ₹4.73 lakh – ₹4.73 lakh |
| **Use this number** | **₹4.73 lakh** |
| Binding constraint | borrower |
| Fair rate | 10.5% – 12.6% |
| All-in APR | 11% – 14.5% |
| EMI ceiling | ₹15,808 |
| Over | 3 years |
| Stress test (income −20%, rate +2pp) | **fails** — short ₹10,806/month |
| Product | personal |
| Confidence | 80% (high) |

**The tenure trade-off**

| Tenure | EMI | Total interest |
| --- | ---: | ---: |
| 1 year | ₹44,338 | ₹34,654 |
| 2 years | ₹23,559 | ₹68,008 |
| 3 years | ₹16,669 | ₹1,02,666 |
| 4 years | ₹13,251 | ₹1,38,619 |
| 5 years | ₹11,221 | ₹1,75,853 |

### What to do next

- Ask every lender for the all-in APR in writing, not the interest rate. The fee is where the difference hides.

### The Negotiation Card

```
  Borrow less — around ₹4.73 lakh, not ₹8 lakh.

  Ask for            ₹4.73 lakh
  Rate to accept     10.5% – 12.6%
  All-in APR         11% – 14.5%
  EMI ceiling        ₹15,808 a month
  Over               3 years
  Walk away above    14.5% all-in

  Say this:
   • My profile is risk grade A+. Fair for that is 10.5%–12.6%, not more.
   • Quote me the all-in APR including the processing fee, in writing.
   • I will not go above ₹15,808 a month.
   • If the fee pushes the all-in cost past 14.5%, waive the fee or cut the rate.

  Confidence in these numbers: 80% — high
```

### If they had stopped after the core questions

| | Core set only | After the full interview |
| --- | --- | --- |
| Verdict | BORROW_LESS | BORROW_LESS |
| Use this amount | ₹3.18 lakh | ₹4.73 lakh |
| Rate band | 10.5% – 12.8% (2.3% wide) | 10.5% – 12.6% (2.1% wide) |
| EMI ceiling | ₹10,622 | ₹15,808 |
| Confidence | 53% | 80% |
| Values assumed | 1 | 0 |

---

## Ravi, 42 — Mysuru · self-employed

**Asks for:** ₹15,00,000 for a second stock line and a delivery vehicle

### The questions the app asked (21)

| # | Tier | Question | Answer | Why it was asked |
| ---: | --- | --- | --- | --- |
| 1 | core | What is the loan for? | business expansion | Could narrow your rate by 4.5%. |
| 2 | core | How much are you hoping to borrow? | ₹15,00,000 | Would not change any of your numbers. |
| 3 | core | What kind of loan were you thinking of? | business unsecured | Would not change any of your numbers. |
| 4 | core | How do you earn? | self employed | Would not change any of your numbers. |
| 5 | core | What reaches you in a month, after deductions? | ₹40,000 to ₹80,000 | Worth up to ₹2,05,616 on what you can borrow. |
| 6 | core | What do you already pay every month on loans or EMIs? | ₹0 | Could change the answer itself, not just the numbers. |
| 7 | core | Roughly what does the household spend in a month, apart from rent and EMIs? | ₹30,000 | Worth up to ₹87,101 on what you can borrow. |
| 8 | core | How much rent do you pay? | ₹0 | Worth up to ₹2,50,621 on what you can borrow. |
| 9 | core | How old are you? | 42 | Would not change any of your numbers. |
| 10 | core | Do you know your credit score? | doesn't know | Worth up to ₹94,579 on what you can borrow. |
| 11 | additional | Is there anything you could offer as security? | property | Worth up to ₹8,38,944 on what you can borrow. |
| 12 | additional | Roughly what is it worth? | ₹45,00,000 | Worth up to ₹8,38,944 on what you can borrow. |
| 13 | additional | Is there already a loan against it? | no | Worth up to ₹8,38,944 on what you can borrow. |
| 14 | additional | How much extra do you expect to earn each month because of this? | ₹25,000 | Worth up to ₹3,68,218 on what you can borrow. |
| 15 | additional | What income do your filed returns show for the year? | ₹4,20,000 | Worth up to ₹14,70,049 on what you can borrow. |
| 16 | additional | Have any payments bounced or been missed in the last year? | 0 | Worth up to ₹3,26,053 on what you can borrow. |
| 17 | additional | Would anyone apply jointly with you, and what do they earn? | ₹18,000 | Worth up to ₹7,70,638 on what you can borrow. |
| 18 | additional | Is there a large expense coming in the next year? | doesn't know | Worth up to ₹6,17,097 on what you can borrow. |
| 19 | additional | If your income stopped, how many months could you cover from savings? | 4 months | Worth up to ₹5,13,125 on what you can borrow. |
| 20 | additional | How many people depend on your income? | 2 | Worth up to ₹4,23,865 on what you can borrow. |
| 21 | additional | How much of your income changes from month to month? | 0.5 | Worth up to ₹3,43,081 on what you can borrow. |

> **Not asked:** `cardUtilisationPct`, `existingLoans` — either they do not apply to this borrower, or the engine measured that they would not move any of the four outputs.

### The four outputs

**O1 — Should you borrow?**

> Borrow less — around ₹13.6 lakh.

*Why:* At ₹15 lakh, 66% of your income in a slow month would go to fixed repayments. Past 60% there is no room to absorb anything unexpected, and ₹13.6 lakh keeps you under it.

**O2 — How much can you borrow?**

> A lender will likely sanction ₹15.74 lakh – ₹25.01 lakh. You can safely carry ₹4.73 lakh – ₹17.59 lakh. Work with ₹17.59 lakh.

*Why:* A lender sizes the loan against your income and would go to about ₹25.01 lakh; your own budget, after everything you actually spend, supports ₹17.59 lakh. The smaller number is the real one.

**O3 — What is a fair rate?**

> 9% – 17.4% interest — an all-in 9% – 17.9% once the 0.5% – 1.5% fee is counted.

*Why:* Your profile places you in risk grade A to C, and that is what this product costs at that grade. Compare lenders on the all-in figure, not the headline rate — the fee is where the difference hides.

**O4 — What EMI should you agree to?**

> Do not go above ₹30,578 a month.

*Why:* That is what is left after your household costs, rent, the EMIs you already pay and money kept back for saving — and only part of it, so a bad month does not become a missed payment. It does not survive an income drop of a fifth plus a two-point rate rise, which is why the amount is capped where it is.

| | |
| --- | --- |
| Lender will likely sanction | ₹15.74 lakh – ₹25.01 lakh |
| You can safely carry | ₹4.73 lakh – ₹17.59 lakh |
| **Use this number** | **₹17.59 lakh** |
| Binding constraint | borrower |
| Fair rate | 9% – 17.4% |
| All-in APR | 9% – 17.9% |
| EMI ceiling | ₹30,578 |
| Over | 10 years |
| Stress test (income −20%, rate +2pp) | **fails** — short ₹5,000/month |
| Product | lap (redirected) |
| Confidence | 82% (high) |

**The tenure trade-off**

| Tenure | EMI | Total interest |
| --- | ---: | ---: |
| 5 years | ₹37,624 | ₹7,57,431 |
| 7 years | ₹31,025 | ₹11,06,075 |
| 10 years | ₹26,477 | ₹16,77,191 |
| 15 years | ₹23,540 | ₹27,37,228 |

### What to do next

- Ask for a loan against property, not the product you were quoted. Backing the loan with security you already own is worth more than any negotiation on an unsecured rate.
- Check your credit score before you apply — it is free, it takes five minutes, and it is the cheapest way to narrow the rate you will be offered.
- Ask every lender for the all-in APR in writing, not the interest rate. The fee is where the difference hides.

### The Negotiation Card

```
  Borrow less — around ₹13.6 lakh.

  Ask for            ₹13.6 lakh
  Rate to accept     9% – 17.4%
  All-in APR         9% – 17.9%
  EMI ceiling        ₹30,578 a month
  Over               10 years
  Walk away above    17.9% all-in

  Say this:
   • My profile is risk grade A–C. Fair for that is 9%–17.4%, not more.
   • Quote me the all-in APR including the processing fee, in writing.
   • I will not go above ₹30,578 a month.
   • I want a loan against property, not an unsecured one.
   • If the fee pushes the all-in cost past 17.9%, waive the fee or cut the rate.

  Confidence in these numbers: 82% — high
```

### If they had stopped after the core questions

| | Core set only | After the full interview |
| --- | --- | --- |
| Verdict | BORROW_LESS | BORROW_LESS |
| Use this amount | ₹5.21 lakh | ₹17.59 lakh |
| Rate band | 16% – 30.2% (14.2% wide) | 9% – 17.4% (8.4% wide) |
| EMI ceiling | ₹31,626 | ₹30,578 |
| Confidence | 36% | 82% |
| Values assumed | 2 | 0 |

---

## Anita, 35 — Hubballi · informal

**Asks for:** ₹1,50,000 for an electric scooter to double delivery runs

### The questions the app asked (12)

| # | Tier | Question | Answer | Why it was asked |
| ---: | --- | --- | --- | --- |
| 1 | core | What is the loan for? | vehicle productive | Could narrow your rate by 4.5%. |
| 2 | core | How much are you hoping to borrow? | ₹1,50,000 | Would not change any of your numbers. |
| 3 | core | What kind of loan were you thinking of? | personal | Would not change any of your numbers. |
| 4 | core | How do you earn? | informal | Would not change any of your numbers. |
| 5 | core | What reaches you in a month, after deductions? | ₹26,000 to ₹30,000 | Could change the answer itself, not just the numbers. |
| 6 | core | What do you already pay every month on loans or EMIs? | ₹6,500 | Could change the answer itself, not just the numbers. |
| 7 | core | Roughly what does the household spend in a month, apart from rent and EMIs? | ₹16,000 | Worth up to ₹6,252 on your monthly ceiling. |
| 8 | core | How much rent do you pay? | ₹6,000 | Worth up to ₹2,544 on your monthly ceiling. |
| 9 | core | How old are you? | 35 | Would not change any of your numbers. |
| 10 | core | Do you know your credit score? | doesn't know | Could narrow your rate by 6.1%. |
| 11 | additional | Have any payments bounced or been missed in the last year? | 1 | Could narrow your rate by 4.5%. |
| 12 | additional | Is there anything you could offer as security? | none | Could narrow your rate by 4%. |

> **Not asked:** `documentedIncomeAnnual`, `variableIncomeShare`, `cardUtilisationPct`, `productiveMonthlyGain`, `existingLoans` — either they do not apply to this borrower, or the engine measured that they would not move any of the four outputs.

### The four outputs

**O1 — Should you borrow?**

> Do not take this loan.

*Why:* After your household costs and the EMIs you already pay, there is nothing left over each month. A new instalment would have to come out of money that is already spent, which is how a loan becomes a missed payment.

**O2 — How much can you borrow?**

> A lender will likely sanction ₹0. You can safely carry ₹0. Work with ₹0.

*Why:* A lender sizes the loan against your income and would go to about ₹0; your own budget, after everything you actually spend, supports ₹0. The smaller number is the real one.

**O3 — What is a fair rate?**

> 13.3% – 28.2% interest — an all-in 13.8% – 30.3% once the 1% – 2.5% fee is counted.

*Why:* Your profile places you in risk grade C to D, and that is what this product costs at that grade. Compare lenders on the all-in figure, not the headline rate — the fee is where the difference hides.

**O4 — What EMI should you agree to?**

> Do not go above ₹0 a month.

*Why:* That is what is left after your household costs, rent, the EMIs you already pay and money kept back for saving — and only part of it, so a bad month does not become a missed payment. It does not survive an income drop of a fifth plus a two-point rate rise, which is why the amount is capped where it is.

| | |
| --- | --- |
| Lender will likely sanction | ₹0 – ₹0 |
| You can safely carry | ₹0 – ₹0 |
| **Use this number** | **₹0** |
| Binding constraint | borrower |
| Fair rate | 13.3% – 28.2% |
| All-in APR | 13.8% – 30.3% |
| EMI ceiling | ₹0 |
| Over | 3 years |
| Stress test (income −20%, rate +2pp) | **fails** — short ₹1,277/month |
| Product | two_wheeler (redirected) |
| Confidence | 59% (moderate) |

**The tenure trade-off**

| Tenure | EMI | Total interest |
| --- | ---: | ---: |
| 1 year | ₹2,898 | ₹4,782 |
| 2 years | ₹1,650 | ₹9,602 |
| 3 years | ₹1,245 | ₹14,804 |
| 4 years | ₹1,049 | ₹20,372 |

### What to do next

- Ask for a two-wheeler / ev loan, not the product you were quoted. Backing the loan with security you already own is worth more than any negotiation on an unsecured rate.
- Check your credit score before you apply — it is free, it takes five minutes, and it is the cheapest way to narrow the rate you will be offered.
- Put three to six clean months of payments on your record before applying. A recent missed EMI is the most expensive single item on your file right now.
- Build one month of expenses as a buffer. It is what turns a bad month into an inconvenience instead of a default.
- Ask every lender for the all-in APR in writing, not the interest rate. The fee is where the difference hides.

### The Negotiation Card

```
  Do not take this loan.

  Ask for            ₹0
  Rate to accept     13.3% – 28.2%
  All-in APR         13.8% – 30.3%
  EMI ceiling        ₹0 a month
  Over               3 years
  Walk away above    30.3% all-in

  Say this:
   • My profile is risk grade C–D. Fair for that is 13.3%–28.2%, not more.
   • Quote me the all-in APR including the processing fee, in writing.
   • I will not go above ₹0 a month.
   • I want a two-wheeler / ev loan, not an unsecured one.
   • If the fee pushes the all-in cost past 30.3%, waive the fee or cut the rate.

  Confidence in these numbers: 59% — moderate
```

### If they had stopped after the core questions

| | Core set only | After the full interview |
| --- | --- | --- |
| Verdict | DONT_BORROW | DONT_BORROW |
| Use this amount | ₹0 | ₹0 |
| Rate band | 9.5% – 23.6% (14.1% wide) | 13.3% – 28.2% (14.9% wide) |
| EMI ceiling | ₹6,281 | ₹0 |
| Confidence | 39% | 59% |
| Values assumed | 2 | 0 |
