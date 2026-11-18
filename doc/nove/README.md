# Series `doc/nove/` — nine points of November 2026, and the contributor's allocation PRs

> The index of the series: the owner's points, the decisions, the order, the shared contracts and the rules every
> spec obeys. Written on 2026-11-12 on `develop` @ b841cbd7 by the planning session; **read adversarially, all
> the specs together, on 2026-11-12** (decisions 33–63 in § 3); a spec in service is retired with
> `doc/nove/PROMPT-RITIRO.md` (2026-11-12). NOVE-01 is retired (2026-11-13, PR #522), and so are NOVE-02 (2026-11-13, PR #524), NOVE-03 (2026-11-14, PR #526), NOVE-04 (2026-11-14, PR #528), NOVE-05 (2026-11-14, PR #530), NOVE-06 (2026-11-14, PR #532), NOVE-07 (2026-11-15, PR #534) NOVE-08 (2026-11-15, PR #536), NOVE-09 (2026-11-15, PR #538) NOVE-10 (2026-11-16, PR #540), NOVE-14 (2026-11-16, PR #542), NOVE-15 (2026-11-16, PR #544), NOVE-16 (2026-11-17, PR #547), NOVE-17 (2026-11-18, PR #549) and NOVE-18 (2026-11-18, PR #551); the next is NOVE-21. One spec = one
> implementation session = one branch. A spec's NUMBER is its identity; the ORDER is § 5.

## 1. The owner's points (their words, 2026-11-12)

1. **Temi** — «Creiamo dei temi personalizzati a tema Ikariam e Ogame? i classici browser game che andavano forte dal
   2010 in poi […] tre proposte diverse per tema e poi implementare il tutto pagina per pagina in diverse spec!»
2. **Panoramica (e tutta l'app), savings rate** — «quando ad esempio siamo ad inizio mese e non c'è nessun entrata,
   mi riporta un savings rate negativo, è poco carino da vedere, dovremmo fixare questa cosa su tutta l'app […]
   stessa cosa quando ad esempio ho un'entrata piccola tipo 3 euro di rimborso e quindi il messo da parte è meno un
   numero gigantesco in %»
3. **Registro operazioni** — an external report to verify first: «If two tabs initialize the ledger simultaneously,
   a delayed migration can overwrite a baseline correction saved after the first migration finishes. The correction
   is lost, and the next trade recalculates holdings from the old quantity.»
4. **Allocazione** — «quando la card del piano è più piccola delle card bilanciamento + classe fare in modo che
   l'altezza della card del piano sia uguale alle card bilanciamento + classe»
5. **Grafici a torta e Analisi** — «dei bei grafici a torta mancano nell'app, dove possiamo metterli? […] dare
   colore alle pagine e mostrare info utili "ad occhio"»; Analisi: «di tutte le pagine è quella dove devo sempre
   andare a cercarmi l'info specifica […] voglio capire quali spese impattano di più il timeframe di riferimento»
6. **Assistente AI** — «ci sono troppi tasti a vista da cliccare, troppe opzioni sia da desktop che da mobile. Mi
   piacerebbe che l'assistente fosse solo una chat dove io scrivo e lui in automatico capisce cosa deve fare»
7. **Compravendita** — a question: how does the deposit count in the house's value when the bank lends a percentage
   of the price and credits the difference to the account — «Questa cosa è vera sempre o dipende da banca a banca?»
   (the owner's own figures are not written here: § 8).
8. **Repo** — «Togliere dal repo qualsiasi riferimento a portfolio tracker, che è il vecchio nome dell'app»
9. **Storico** — a question: «se vado in hover sui mesi in alcuni c'è "altre" con un valore, ma quell'altre da cosa
   dipende?»
10. **Added during the session** — «vorrei includere in questa serie l'implementazione delle issue/pr aperte da
    Ciocc sul repo» (PR #486, #487, #488, #489; issue #420), and then: «che impatto hanno le modifiche che riguardano
    l'allocazione sulla feature del consulente […] avrebbe senso integrare questa cosa nel consulente?»

## 2. What the code did when the series was written (2026-11-12; the detail in each spec § 1)

- **Themes**: a theme is a palette and a radius (`lib/constants/colorTheme.ts`, the blocks of `app/globals.css`);
  nothing else is per theme. The swatches of Impostazioni and four test lists are written by hand. Geist Sans is
  never applied (CLAUDE.md § Known Issues).
- **Savings rate**: fourteen independent divisions `(income − spending) / income`, none with a floor; the Panoramica
  verdict and strip judge the LIVED part of the month, where a few euros of income give −16.000%.
- **Ledger**: the report HOLDS IN PART. `migrateAssetLedger` read the meta outside any transaction and wrote the
  baselines blind; edits, deletions, the average-cost backfill and the delete-all had the same read-then-write shape.
- **Allocazione**: the Piano cell carried `desktop:self-start`.
- **Pies**: none (removed on 2026-07-13, DESIGN.md forbids them); Analisi is 1013 lines, top five expenses, three
  stale labels.
- **Assistente**: 24 controls at rest; mode and period are chosen by the user; the Registra cards render only when
  the PAGE is in `register` mode.
- **Compravendita**: a mortgage above the residual (price − deposits) was refused twice.
- **Name**: «Portfolio Tracker» in 13 places of 7 files.
- **«altre»**: the remainder of the Driver's identity, printed as one figure.
- **The PRs**: four branches from 54634a9 (2026-10-21), trial merges clean; none knows the Consulente's interview,
  cashflow block or book; #487 contains #486, #488 contains both.

## 3. The owner's decisions (2026-11-12, numbered; cited as «decision N»)

1. The series lives in `doc/nove/`, specs `NOVE-NN`.
2. Compravendita: a mortgage above the residual is accepted; the excess goes on the ACCOUNT'S BALANCE, without a
   cashflow row; the summary says it in one sentence. → NOVE-04 (retired on 2026-11-14, PR #528)
3. Theme «Egeo»: direction C «Polis» (colour, ground, frame, an engraved heading font, a frieze, a gold cap line,
   emblems). → NOVE-11, 12
4. Theme «Orbita»: direction C «Impero» (colour, starry ground, frame, an uppercase console font, corner brackets,
   sharp corners, a glow on the primary, emblem, a resource bar). → NOVE-11, 13
5. Pies: form A (a thin ring, the total in the centre, the rows as legend) EVERYWHERE; a figure that does not fit
   its hole is abbreviated or moves above the ring. → NOVE-08 (retired on 2026-11-15, PR #536), NOVE-09 (retired on 2026-11-15, PR #538), 10
6. Analisi: composition A «Classifica»; «i numeri devono stare dentro il loro grafico». → NOVE-10 (retired on 2026-11-16, PR #540)
7. Savings rate: a floor at −100% plus the calendar — without income or below the floor no percentage, euros; on
   the Panoramica the sentence adds how the month closes with the calendar; a true −30% stays. → NOVE-05 (retired on 2026-11-14, PR #530)
8. Storico › Driver: «altre» is SPLIT by cause. → NOVE-06 (retired on 2026-11-14, PR #532)
9. The contributor's PRs enter the series; agents beyond the cap of five authorised («valuta tu»).
10. Rings also in: Panoramica «Composizione» and Patrimonio «Classi»; Previdenza «Versato»; Tracciamento «Entrate»
    (and, added by the owner on the ring's tour of 2026-11-15, the Panoramica's «Entrate per categoria»);
    the minor tiles (Divisione shares, Mutuo interest/principal, Intestatari «Valore» — and «Carico», added by the owner
    on the minor tiles' tour of 2026-11-15 —, Centro di costo fixed/one-off — and «Per sottocategoria», the same tour —,
    Dividendi first payer). → NOVE-08 (retired on 2026-11-15, PR #536), NOVE-09 (retired on 2026-11-15, PR #538)
11. Assistente: a router (Haiku 5.5: intent, period, web search) in front of today's pipeline; a line «Ho letto: … ·
    cambia» under the answer. → NOVE-14 (retired on 2026-11-16, PR #542), NOVE-15 (retired on 2026-11-16, PR #544)
12. Assistente: instead of the Mese / Anno / YTD / Storico selector, written suggestions on an empty chat. → NOVE-15 (retired on 2026-11-16, PR #544)
13. Ledger: the migration in a transaction AND the other writes with the same defect. → NOVE-03 (retired on 2026-11-14, PR #526)
14. Orbita: the resource bar only on desktop (≥ 1440) and only on Panoramica. → NOVE-13
15. Assistente, header: in sight only «Nuova conversazione» and a «⋯» menu (Conversazioni, Memoria, Preferenze); the
    «Registra» button disappears, the router recognises a written expense. → NOVE-15 (retired on 2026-11-16, PR #544)
16. DESIGN.md: the amendments (themes beyond palette and radius; the pie rule) live in the specs as before / after
    sentences, applied to the letter and approved in the implementation's diff. → NOVE-08 (retired on 2026-11-15, PR #536), 11
17. The themes' costume: everywhere in the dashboard and its dialogs; never outside (emails, PDF, landing, access).
18. PR #489: a trade's fee is a spending row; the average cost (PMC) excludes it. → NOVE-07 (retired on 2026-11-15, PR #534)
19. PR #489: a sale's fee is a row too, and out of the capital gain shown. → NOVE-07 (retired on 2026-11-15, PR #534)
20. PR #489: the fee row counts in Budget like any expense. → NOVE-07 (retired on 2026-11-15, PR #534)
21. PR #489: the past is not backfilled with rows; the average costs are re-projected. → NOVE-07 (retired on 2026-11-15, PR #534)
22. PR #489: with no fee category the field is disabled, with a link to Impostazioni. → NOVE-07 (retired on 2026-11-15, PR #534)
23. PR #489: in Rendimenti the fee stays a cost of the portfolio (net return; the row is not a withdrawal). → NOVE-07 (retired on 2026-11-15, PR #534)
24. PR #486: with an active plan the Bilanciamento verdict does NOT change; only a note in the Piano tile. → NOVE-16 (retired on 2026-11-17, PR #547)
25. PR #486: «+ Nuovo asset» creates a real asset at quantity 0, without an opening trade. → NOVE-16 (retired on 2026-11-17, PR #547)
26. PR #488: «Con vendite mirate» stays a mode of the model's dialog, with the app's ONE tax rule. → NOVE-18 (retired on 2026-11-18, PR #551)
27. Consulente ↔ PAC: a hand-off after «Applica» («Crea un piano di accumulo verso questa allocazione»), computed by
    code, confirmed by the owner in the plan's editor. → NOVE-21
28. The Consulente REASONS about a PAC in words in «Cosa fare adesso» (accumulate or sell, an indicative horizon,
    from the cashflow); the exact figures are the engine's. The prompt changes; the schema and the book do not. → NOVE-21
29. With an active PAC the Consulente reads one line (month k of N, instalment, end month) plus the instruments the
    plan buys and sells with their quotas; never the model nor its criteria. → NOVE-21
30. The PAC editor's suggested instalment is the MEDIAN of the last twelve months' savings (the cashflow block's
    measure), not annual savings / 12. → NOVE-16 (retired on 2026-11-17, PR #547)
31. PR #489: the tax estimates use a SEPARATE fiscal cost basis that includes the fees (purchase and sale); the PMC
    shown stays without them. → NOVE-07 (retired on 2026-11-15, PR #534), read by NOVE-18 (retired on 2026-11-18, PR #551)
Decided at the adversarial reading of the whole series (2026-11-12, numbered on from the list above):

33. `mobile:budget` closes on a COMPARISON: `mobile:census` + `mobile:budget` on `develop` and on the branch the same
    day, same build; every entry the spec does not name reads the same on both, the entries it names are
    re-recorded with `raisedBy`. A session stops only on an unnamed entry that moves. → every spec (§ 8)
34. `perf:budget`: measured before and after on the same machine; a route that crosses its ceiling by ≤ 1 KB gz for
    one spec has the ceiling raised with `raisedBy` and a row in doc/guide/velocita.md § Registro, without asking;
    above 1 KB the session stops with the two measures. → every spec (§ 8)
35. One spec = one session = one commit, also for the largest: 16, 17 and 20 are «one long session, ~8 h», resumed
    on the same branch without committing when the context runs out. → NOVE-16 (retired on 2026-11-17, PR #547), NOVE-17 (retired on 2026-11-18, PR #549), 20
36. The old words «Fisse / Variabili» outside Analisi: NOVE-10 renames the three UI and email sites through
    `SPENDING_TYPE_LABELS`, NOVE-15 the Assistente's system prompt. → NOVE-10 (retired on 2026-11-16, PR #540), NOVE-15 (retired on 2026-11-16, PR #544)
37. The old product name on surfaces outside the repo (the Firebase project's public name, the OAuth consent
    screen, the sender in Vercel's env): out of scope, declared. → NOVE-01 (retired on 2026-11-13, PR #522)
38. The page's meta description stays as it is. → NOVE-01 (retired on 2026-11-13, PR #522)
39. A trade's edit and delete carry `expectedUpdatedAt` (the row the form or the button was drawn from): a form
    opened on an older version is refused with the 409 that exists. → NOVE-03 (retired on 2026-11-14, PR #526)
40. Compravendita, a mortgage above the residual: the «saldo» screen asks «Su quale conto la banca accredita quanto
    avanza del mutuo?», label «Sul conto». → NOVE-04 (retired on 2026-11-14, PR #528)
41. Panoramica, spending above income so far: «Finora hai messo da parte −X €: le spese superano le entrate; …»,
    the cell «−X €» — signed where it is read as a saving. → NOVE-05 (retired on 2026-11-14, PR #530)
42. Storico › Driver: when ONE part of the rest is non-zero the reading names it by its ledger label; with two or
    three it stays «altre variazioni». → NOVE-06 (retired on 2026-11-14, PR #532)
43. Divisione: a trade's fee row belongs to the sole holder of the ASSET; when the asset is shared or split by
    quota, to the sole holder of the settlement ACCOUNT; else it is in comune. → NOVE-07 (retired on 2026-11-15, PR #534)
44. A fee the server could not write as a row (the category gone) is said in the toast: «Commissione non registrata
    in Cashflow: manca la categoria in Impostazioni › Spese». → NOVE-07 (retired on 2026-11-15, PR #534)
45. The ring has SIX rank colours: the sixth is `var(--chart-4)`. → NOVE-08 (retired on 2026-11-15, PR #536), NOVE-09 (retired on 2026-11-15, PR #538)
46. Divisione's ring centre reads «entrate». → NOVE-09 (retired on 2026-11-15, PR #538)
47. A ring's centre is never a lifted figure: The Lifted-Figure Rule is amended. → NOVE-10 (retired on 2026-11-16, PR #540)
48. A ring of one part is not drawn: the total stands as the column's hero line above the single legend row. → NOVE-10 (retired on 2026-11-16, PR #540)
49. «Dove vanno i soldi», view «Sottocategorie»: the reading stays the categories'. → NOVE-10 (retired on 2026-11-16, PR #540)
50. A «senza sottocategoria» row opens the CATEGORY's Scheda; two categories with one name are qualified in the
    caption. → NOVE-10 (retired on 2026-11-16, PR #540)
51. The Classifica's bars stay `--chart-1`; each row carries its type's swatch. → NOVE-10 (retired on 2026-11-16, PR #540)
52. A «Continua con» row is sent as `'auto'`: the router reads it. → NOVE-15 (retired on 2026-11-16, PR #544)
53. A turn sent with a reading it inherited (an answer to a question card, «Rigenera») is `source: 'carried'` and
    reads «Ho letto: …»; «Hai scelto: …» only after «cambia». → NOVE-14 (retired on 2026-11-16, PR #542), NOVE-15 (retired on 2026-11-16, PR #544)
54. Patrimonio calls an instrument created empty and never traded «Mai comprato». → NOVE-16 (retired on 2026-11-17, PR #547)
55. The model's «Importo da investire» is money TAKEN FROM THE ACCOUNTS: the base is what is held, and in
    «Raggiungibile» the liquidity may go down to (liquidity − amount). → NOVE-17 (retired on 2026-11-18, PR #549)
56. The model is «superato» when the targets, the roles OR the criteria change; an «Applica» that writes the same
    targets does not. → NOVE-17 (retired on 2026-11-18, PR #549)
57. Spending the liquidity is not a sale: out of the sold total and of the taxes, its «Tasse» cell «—», the total
    line adds «, usi X € di liquidità». → NOVE-18 (retired on 2026-11-18, PR #551)
58. The hand-off accepts that a new instrument at 0 quotes in a class without sub-targets starts near 0 % and says
    so. → NOVE-21
59. The hand-off's seed holds EVERY tradable instrument held; the reading names the ones the Consulente did not
    name. → NOVE-21
60. DESIGN.md: The Two-Font Rule's opening, «the one ornament» and The Unifying Law take the costume's clause;
    «inevitability over ornament» stays. → NOVE-11
61. Egeo's own `--positive` (both blocks) and the sign tokens' contrast test are born in NOVE-12. → NOVE-12, 19
62. `develop` goes to `main` only when the WHOLE series is implemented and retired: a defect declared «until a
    later spec» never reaches production. → every spec
63. The COMPRA chip never reads in the red of a loss: Orbita's and Egeo's `--chart-3` sit ≥ 30° of hue from
    `--destructive`, both modes, the contrasts re-measured. → NOVE-12, 13
64. (2026-11-13) The first purchase of a new instrument takes its fee, with the field and rules of «Registra
    operazione»; it travels on the first buy. → NOVE-07 (retired on 2026-11-15, PR #534)
65. (2026-11-18, the NOVE-18 tour) A plan may sell a money-market fund, as long as the allocation's cash quota holds:
    only the euros above the quota become the plan's. → NOVE-18 (retired on 2026-11-18, PR #551)
66. (2026-11-18, the NOVE-18 tour) «Con vendite mirate» keeps the accounts and the money-market funds at or above the
    allocation's cash quota (or today's level, when already below), so the PAC made from it refills no reserve the
    run spent. → NOVE-18 (retired on 2026-11-18, PR #551)

## 4. The adopted choices (reversible before the implementation; each is repeated in the spec that uses it)

- a. The themes' names are ours: «Egeo» (`egeo`), «Orbita» (`orbita`); no name or asset of a game in the app.
- b. «Portfolio Tracker» → «Net Worth Tracker» in the UI and in SETUP.md. (NOVE-01, retired on 2026-11-13, PR #522)
- c. Allocazione: the Piano cell loses `desktop:self-start`. (NOVE-02, retired on 2026-11-13, PR #524)
- d. «altre» in three parts; the third is the remainder, and holds the estimated-vs-withheld tax gap. (NOVE-06, retired on 2026-11-14, PR #532)
- e. `lib/utils/savingsRate.ts` without imports, `SAVINGS_RATE_FLOOR = -100`; «Risparmio nel tempo» averages by
  income. (NOVE-05, retired on 2026-11-14, PR #530)
- f. Accumulo is a tab loaded on demand. (NOVE-16, retired on 2026-11-17, PR #547)
- g. The new collections `accumulationPlans`, `accumulationPlanLocks` and `modelPortfolios` are accepted; their Firestore rules are published
  by hand by the owner. (NOVE-16, retired on 2026-11-17, PR #547 — its rules published by the owner before that day; NOVE-17, retired on 2026-11-18, PR #549 — its rule published by the owner before that day)
- h. The saved model becomes «superato» after a change of the targets, by hand or by a Consulente's «Applica»; an
  «Applica» that writes the same targets changes nothing (decision 56). (NOVE-17, retired on 2026-11-18, PR #549)
- i. The Consulente does not read the model nor its criteria (decision 29 adds the active plan only). (NOVE-21)
- j. The model's base is Bilanciamento's (net of debts, `resolveAllocationRoleWithin`; cash is a candidate). (NOVE-17, retired on 2026-11-18, PR #549)
- k. The criteria are edited in Accumulo, read-only in Impostazioni. (NOVE-17, retired on 2026-11-18, PR #549)
- l. Model and plans are read only on the Accumulo tab, except the Piano's note, the Consulente's «Applica» page
  (the active-plan note, choice p, and the hand-off's offer or draft, NOVE-21: the plans' state only, never their
  weights) and the Consulente's server read of the active plan (decision 29). (NOVE-16, retired on 2026-11-17, PR #547)
- m. Limits that force a tax above the cap: the forced tax becomes the cap, and the UI says so. (NOVE-18, retired on 2026-11-18, PR #551)
- n. Losses are not counted in the tax estimate, declared in the text. (NOVE-18, retired on 2026-11-18, PR #551)
- o. Loans and properties are never offered in «+ Aggiungi». (NOVE-16, retired on 2026-11-17, PR #547)
- p. The Consulente's «Applica» page warns in one line when a plan is active. (NOVE-16, retired on 2026-11-17, PR #547)
- q. «superato» fires on targets, roles AND criteria (decision 56): the fingerprint saved with the model covers the
  three. (NOVE-17, retired on 2026-11-18, PR #549)
- r. In the hand-off, instruments not held are offered to be created at quantity 0, prefilled. (NOVE-21)
- s. The `pacClause` PR #486 adds to the Bilanciamento verdict is removed (decision 24). (NOVE-16, retired on 2026-11-17, PR #547)
- t. A warning when the PAC sells in month 1 an instrument the Consulente says to keep. (NOVE-21)
- u. The AI's STRUMENTI block prints an asset created empty and never traded as «0 quote, mai comprato»; `findAssetByName` prefers
  quantity > 0. (NOVE-16, retired on 2026-11-17, PR #547)
- v. A note when the plan ends after the «rivedi entro» date. (NOVE-16, retired on 2026-11-17, PR #547)
- w. Compravendita: a mortgage above the PRICE is refused; property and account move in one transaction. (NOVE-04, retired on 2026-11-14, PR #528)
- x. Panoramica: with a lived part that is not a rate, the headline follows the whole month. (NOVE-05, retired on 2026-11-14, PR #530)

These are the choices that cross specs or answer one of the owner's points. Each spec's § 3 lists, under «Adopted,
reversible», the further choices that stay inside it (a wording, a file's home, a rounding): the owner overturns one
by saying so before that spec is implemented.

## 5. Order and dependencies

The order of implementation (each followed by its retirement session, § 8):

`01 (retired on 2026-11-13) → 02 (retired on 2026-11-13) → 03 (retired on 2026-11-14) → 04 (retired on 2026-11-14) → 05 (retired on 2026-11-14) → 06 (retired on 2026-11-14) → 07 (retired on 2026-11-15) → 08 (retired on 2026-11-15) → 09 (retired on 2026-11-15) → 10 (retired on 2026-11-16) → 14 (retired on 2026-11-16) → 15 (retired on 2026-11-16) → 16 (retired on 2026-11-17) → 17 (retired on 2026-11-18) → 18 (retired on 2026-11-18) → 21 → 22 → 11 → 12 → 13 → 19 → 20`

- **07** (retired on 2026-11-15, PR #534) after **03** (the fee row commits inside the ledger's transaction contract) and **06** (retired on 2026-11-14, PR #532) (`tradeMoneyIn` and
  `tradeAwarePriceEffect` change together).
- **09** (retired on 2026-11-15, PR #538) and **10** (retired on 2026-11-16, PR #540) after **08** (retired on 2026-11-15, PR #536) (the ring); **10** also after **05** (`readSavings`).
- **15** (retired on 2026-11-16, PR #544) after **14** (retired on 2026-11-16, PR #542) (the router's contract).
- **16** (retired on 2026-11-17, PR #547) after **02** (the same grid cell), reading **03**'s and **07**'s (retired on 2026-11-15, PR #534) dialogs (the fresh ledger meta, the fee
  field), already before it in the order; **17** (retired on 2026-11-18, PR #549) after **16** (retired); **18** (retired on 2026-11-18, PR #551) after **17** and **07** (both retired) (the fiscal cost basis).
- **21** after **16** and **17** (both retired) (the editor's seed, the optimizer, the active-plan reader).
- **22** after **18** (retired) and **21** (the editor it guides holds their disposals and hand-off), before **11** (the costume dresses its screens).
- **11 → 12 → 13 → 19 → 20** come LAST (13 extends 12's contrast test): the page-by-page pass dresses pages that 08–10, 15, 16, 17, 18, 21 and 22 change.
- 01, 02, 03, 04, 05, 06, 08, 14 and 11 depend on nothing.

## 6. Status

| Spec | Title | Effort | Depends on | Model · effort | Status |
| --- | --- | --- | --- | --- | --- |
| NOVE-01 | The product is called «Net Worth Tracker» everywhere | S | — | Sonnet 5.5 · medium | written on 2026-11-12; read adversarially on 2026-11-12: 11 findings, 2 owner decisions; implemented on 2026-11-13, PR #522 in develop since 2026-11-13; **retired on 2026-11-13**: the 13 strings and the criteria held with no divergence in the text; criterion 4 (the brand on one line, untruncated) re-measured on the retirement day, which the implementation had not written down; the three mutations of § 6 seen red again; the commit's side effects (WORKFLOW.md process count, NOVE-19's quoted `rounded` class, AGENTS.md's «Tailwind scans doc/» rule) were already written where they live |
| NOVE-02 | Allocazione: a short Piano as tall as Bilanciamento + Per classe | S | — | Sonnet 5.5 · medium | written on 2026-11-12; read adversarially on 2026-11-12: 16 findings, 0 owner decisions; implemented on 2026-11-13, PR #524 in develop since 2026-11-13 (one class removed, two comments, the Playwright test; criteria 1–5 held: `perf:budget` unchanged on every route — Allocazione 604,8 — and `mobile:budget` identical to develop's of the same day, same build); the test was seen red with `desktop:self-start` back on the cell — already at «Ribilancia», where the fixture's Piano is the shorter column, earlier than the «Versa senza importo» step the spec names; the 32px guard of that step is green without the mutation; guided tour done on the mirror (the three modes, the cleared amount, the dark scheme: all as expected) and closed; the session also took `hono` 4.13.13 → 4.13.18 by the owner's waiver of WORKFLOW.md rule 8 (doc/guide/dipendenze.md) |
| NOVE-03 | Registro operazioni: every write decides inside its transaction | L | — | Opus 5.5 · medium | written on 2026-11-12; read adversarially on 2026-11-12: 19 findings, 1 owner decision; implemented on 2026-11-13, PR #526 in develop since 2026-11-14 (branch `fix/nove-03-registro-transazioni`; the 14 tests of § 6 and C2 each seen red with its mutation; `perf:budget` `/dashboard/assets` 734,6 → 734,7 KB gz, under its ceiling; collaudo C–E and the owner's tour done); **retired on 2026-11-14**: the twelve criteria held on the merged code (75 items read, 10 findings that held, all text); the closure re-run (ledger suite 127/127, `e2e/assets.ledger-meta` and `assets.sale-tax` green) and the missing `mobile:budget` comparison spent that day — 3fdf11a1 against `develop`, 57 entries identical, the same 12 red, Patrimonio 1024 reading 11 or 12 on one build (doc/guide/prima-schermata-misure.md); `perf:budget` before/after also moved Storico and Rendimenti by 0,1 KB gz, under their ceilings. Divergences written, behaviour equal: the migration split into `resolveBaselinePrices` + `commitMigration`; the settlement account checked by `assertSettlementAccountsStillCash` in COMPUTE (four checks above `buildNewSequence`, not three in the write loop); `AssetDialog` without `&& ownerId` (guarded at the top of `onSubmit`); the e2e spec listed in doc/guide/patrimonio.md and registro-operazioni.md, as e2e-playwright.md has no per-area inventory. The § 10 deferrals with no heir went to registro-operazioni.md § Concurrency; the label in two guides (registro-operazioni.md, dipendenze.md) rewritten as dates |
| NOVE-04 | Compravendita: a mortgage larger than what is left to pay | M | — | Sonnet 5.5 · medium | written on 2026-11-12; read adversarially on 2026-11-12: 14 findings, 1 owner decision; implemented on 2026-11-14, PR #528 in develop since 2026-11-14 (branch `feat/nove-04-mutuo-oltre-il-residuo`; P1–P3, N1–N4, S1–S2 and C1 each seen red with its mutation, C1 with the account's credit zeroed instead of the spec's income row; `perf:budget` `/dashboard/assets/compravendita` 594,5 → 595,2 KB gz under its 596 ceiling; guided tour on the mirror with the owner's own case, done and closed; the spec's e2e-playwright.md inventory has no target there; **added by the owner after the tour**: «Oppure in % del prezzo» on «Mutuo», outside the spec, not toured); **retired on 2026-11-14**: the nine criteria held on the merged code (51 items read, 3 flagged, 2 held, both text); the closure re-run (the four `realEstateOperation*` suites 67/67, `e2e/assets.compravendita.spec.ts` 7/7 on the emulators, `perf:budget` `/dashboard/assets/compravendita` 595,3 KB gz under its 596 ceiling). Divergence written, behaviour of the spec untouched: the «% del prezzo» field on «Mutuo» (`mortgageFromPercent`, `percentOfPrice`) added by the owner after the tour, in doc/guide/compravendita.md. Text fixes: NOVE-20's eight `CompravenditaWizard.tsx` / `CompravenditaScreens.tsx` line cites moved by this spec re-pointed to the current lines; the «never below 0» comment of `purchaseBalance` and the guide's mortgage sentence opened to the excess case |
| NOVE-05 | The savings rate: one rule, a floor, and euros below it | L | — | Opus 5.5 · medium | written on 2026-11-12; read adversarially on 2026-11-12: 31 findings, 1 owner decision; implemented on 2026-11-14, PR #530 in develop since 2026-11-14 (branch `feat/nove-05-tasso-di-risparmio`; every test of the spec seen red with its mutation; criterion 15 grep as listed; `perf:budget` before/after on the same machine all under the ceilings — Cashflow 786,1 → 788,1, Assistente 751,6 → 753,4, Panoramica 625,8 → 627,0 KB gz, re-measured on the final code; `mobile:budget` identical to develop of the same day, same build, the same 12 red, re-run on the final build). Divergences written: the Assistente words read the reading, not only `resolveSavingsRate` (doc/guide/assistente.md); «chiude all'81%» by The Comma Rule where the spec wrote «al 81%»; outside the spec, the Hall of Fame record sentence and closed answer, and «Andamento risparmio»'s description of a gap («spese oltre le entrate»); an owner decision during the tour (2026-11-14): «Risparmio nel tempo» counts «mesi misurabili» (`rankedCount`) where the spec kept «mesi chiusi» / «con entrate»; found in the tour and fixed: «il 81%» → «l'81%» in every «messo da parte» (Panoramica, Assistente, email), and at the owner's OK the email's «copre il 86,1%» → «copre l'86,1%»; phase F on the mirror (2026-11-14, owner): Panoramica, Tracciamento and the PDF of the running month as expected; the Hall of Fame and the floor cases left to the tests (`recordRows.test.tsx`, `pdfNarrative.test.ts` and the emulator tour B–E); **retired on 2026-11-14**: the seventeen criteria, decisions 7 and 41 and choices (e) and (x) held on the merged code (a read-only workflow of five `cercatore` and four `verificatore`: 131 items, 27 flagged, 11 held, all text); the closure re-run (the area suites 49 files / 1941 tests, the four Playwright specs of § 6 44/44 on the emulators); criterion 15's grep reprints the list now in AGENTS.md § Shared Constants. Divergences written, behaviour equal: `summarizeSavingsHistory` returns early on `rankedCount === 0` (best and worst `null`, never `undefined`), the spec's «no measured month and no deficit» condition lives in `describeDeficitMonths` and the tile's empty state; «Andamento risparmio»'s gap is the point's `overspent` field (`buildSavingsRateTrendPoints`); `Draft Release Temp.md` took one new Bug Fixes entry for every surface, the Panoramica and Tracciamento entries holding no stale text. Text fixes: the `describeSavingsHistory` comment opened to `rankedCount`; doc/guide/assistente.md's blind spot on the rate through `meaningfulSavingsRate`; 35 line cites of seven live specs (08, 10, 12, 13, 15, 16, 20) moved by 78ae52e8 re-pointed to the current lines; NOVE-10's header marks this spec retired and its «NOVE-05's signature» points at § 7. No runtime code changed |
| NOVE-06 | Storico › Driver: «altre» split by cause | M | — | Sonnet 5.5 · medium | written on 2026-11-12; read adversarially on 2026-11-12: 21 findings, 1 owner decision; implemented on 2026-11-14, PR #532 in develop since 2026-11-14 (branch `feat/nove-06-altre-scomposta`; G1–G6, L1, L1b, L2 and D1–D4 each seen red with its mutation, D1–D4 written after the tile's code; `perf:budget` `/dashboard/history` 778,6 → 779,4 KB gz under its 780 ceiling, the other 16 routes identical; `mobile:budget` identical to develop's of the same day, same build — 57 entries, 0 differences, the same 12 red; guided tour phases A–E on an invented fixture and F on the mirror (five items), done and closed); **retired on 2026-11-14**: the eleven criteria, decisions 8 and 42 and choice (d) held on the merged code (a read-only workflow of six `cercatore` and four `verificatore`: 59 items, 5 flagged, 2 held, both text — the 44 items of criteria, decisions and documentation came back without a flag and five were re-read by hand); the closure re-run (the nine area suites 232/232, `e2e/history` + `e2e/mobile-composition.history` 10/10 on the emulators, `perf:budget` `/dashboard/history` 779,5 KB gz under its 780 ceiling); `firestore.rules` and `firestore.indexes.json` untouched. No divergence from the spec. Text fixes: the note under «Risparmio e mercato per mese» named «altre variazioni», a row the month tooltip no longer prints — it is now `DRIVER_MONTHLY_NO_BAR_NOTE` in `storicoNarrative.ts` with a test seen red on the old wording; two `marketEffect.ts` comments name the Driver's parts; NOVE-20's `DriverTile.tsx` cite moved from `:152` to `:139`. No runtime code changed |
| NOVE-07 | A trade's fee is a spending row, out of the average cost (PR #489) | L | 03, 06 | Opus 5.5 · medium | written on 2026-11-12; read adversarially on 2026-11-12: 18 findings, 2 owner decisions; extended on 2026-11-13 by decision 64 (the first purchase's fee); implemented on 2026-11-15, PR #534 in develop since 2026-11-15 (branch `feat/nove-07-commissioni-come-riga`; every § 6 row seen red with its mutation; `perf:budget` against develop on the same `.next-perf` build and day: Patrimonio 735,4 → 737,8 KB gz and Cashflow 788,1 → 789,0 (789,1 with `npm run build`), their ceilings 737 → 738 and 789 → 790 (within the spec's KB), the other routes +0,0…+1,5 under their ceilings; `mobile:budget` identical to develop's of the same day, same build — 57 entries, 0 differences; guided tour A–F done, F on the mirror with the owner on 2026-11-15); **retired on 2026-11-15**: the sixteen criteria, decisions 18–23, 31, 43, 44 and 64 and every adopted choice held on the merged code (a read-only workflow of five `cercatore` and four `verificatore`: 135 items, 16 flagged, 13 held — one test gap, the rest text); the closure re-run (the ledger suites and the spec's 25 test files 768/768, `e2e/assets e2e/cashflow e2e/history` 100/100 on the emulators); `firestore.rules` and `firestore.indexes.json` untouched; the contributor's trailer in 2ce25f19 and PR #489, still open, closed that day with the link to the merge. Divergences written, behaviour equal: E2 read the opening row from Firestore and the trade's own `#trade-fees` field, never «Commissioni 5,00 €», which the 1440 table has no column for — the test now also finds the locked −5 row in Tracciamento, seen red with `fees` dropped from `firstBuy`; the Draft entry is in English, as the whole file. Text fixes: the `useAssetTransactions.ts` header counted a «TRIPLE» beside the fourth key; doc/guide/registro-operazioni.md gained the re-projection in § The fee as a spending row and the bulk-path deferral in its blind spots; the spec's own name left `perf/budget.json` and doc/guide/velocita.md (#534 in its place); 38 line cites of nine live specs (08, 09, 10, 16, 17, 18, 19, 20, 21) moved by 2ce25f19 re-pointed, NOVE-18's «NOVE-07's sentence to fix» rewritten as done. No runtime code changed |
| NOVE-08 | The ring: one primitive, one DESIGN rule, four homes (five after the tour) | L | — | Opus 5.5 · medium | written on 2026-11-12; read adversarially on 2026-11-12: 22 findings, 1 owner decision; implemented on 2026-11-15, PR #536 in develop since 2026-11-15 (branch `feat/nove-08-anello-primitiva`; every § 6 row seen red with its mutation; the three ring specs 17/17 at 1440, 390, 768×1024 and 1024×768, red at every width with `formatRingCenter` returning the full form; `mobile:budget` census identical to develop on the same build and day, 57 entries; `perf:budget` against develop on the same build and day, five ceilings raised with the owner's OK — / 518,7 → 521,1, Panoramica 627,4 → 631,4 (631,2 before the Panoramica's «Entrate» ring), Patrimonio 737,8 → 739,7, Cashflow 789,0 → 791,7, Previdenza 676,8 → 679,8 KB gz, after `compositionRing` moved out of `overviewSummary.ts` into `lib/utils/compositionRing.ts`; the tour found solar-dusk's grey Immobili equal to the fold's grey, re-pitched to a pine green by the owner, held by a new test in `chartPaletteDistinctness.test.ts`; the owner added the Panoramica's «Entrate per categoria» as a fifth home on the tour, `incomeRingSegments` moved to `lib/utils/categoryRing.ts`; tour phase E on an overview patched with a class below zero instead of a loan created through the asset dialog); **retired on 2026-11-15**: the fifteen criteria, decisions 5, 6, 10, 16 and 45 and every adopted choice held on the merged code (a read-only workflow of five `cercatore` and four `verificatore`: 135 items, 37 flagged, 25 held, all text); the closure re-run (the spec's 13 Vitest files 184/184, § 7's Playwright list 132 passed, 1 skipped, on the emulators); `firestore.rules` and `firestore.indexes.json` untouched. Divergences written, behaviour equal: the fifth home (criterion 9 and § 3 kept the Panoramica's «Entrate» as rows; decision 10 above now names it); the builders in modules of their own (`compositionRing.ts`, `categoryRing.ts`, their tests `compositionRing.test.ts`, `categoryRing.test.ts`); the five ceilings above the series' 1 KB rule, raised with the owner's OK. Text fixes: «four homes» in the three ring specs' headers, the five `raisedBy` and doc/guide/velocita.md's row (the spec's branch name there too, #536 in its place); `ringChartSuite.ts` named the fold's tests in their old modules; `CategoryTile`'s header named Tracciamento alone; each ring test's header now names the mutation that turned it red (the spec's § 6 table); the PDF/email deferral and `BalanceRing` kept as a score in doc/guide/grafici.md's blind spots, the 1440 grid trap in doc/guide/previdenza.md; NOVE-09's DESIGN BEFORE sentence re-read on the five-home text and 23 line cites of seven live specs (09, 10, 11, 12, 13, 15, 16, 19) re-pointed, 18 of them moved by 4fd0c91e. No runtime code changed |
| NOVE-09 | The ring in the minor tiles | M | 08 | Opus 5.5 · medium | written on 2026-11-12; read adversarially on 2026-11-12: 17 findings, 2 owner decisions; implemented on 2026-11-15, PR #538 in develop since 2026-11-15 (branch `feat/nove-09-anello-tessere-minori`; the five builders D1, M1, I1, K1, V1 and the five tiles D2, M2, I2, K2, V2 each seen red with its mutation; the seven `e2e/ring-chart.*.spec.ts` files and the assertion in `cashflow.mortgage.spec.ts` red with the centre figure drawn at three times its font size — `formatRingCenter` returning the full form leaves them green, since «270 €», «500 €» and «1012 €» fit in full; `perf:budget` against develop on the same build and day: Patrimonio 741,3 → 742,7, ceiling 742 → 743 within 1 KB, the landing 522,1 → 522,3 under its ceiling from a chunk regrouping with no NOVE-09 code, accepted by the owner; the mirror tour (phase F) added three changes the owner chose: the Mutuo's four KPIs across only from 680px of the grid beside the ring — at 768 «199.588,00 €» touched «600,00 €» —, «Intestatari» a ring on «Carico» too, and a cost centre's «Per sottocategoria» a ring of the counted subcategories (`subCategoryRingSegments`, K3/K4); `scripts/collaudo-finestre.mts` fixed for Windows); **retired on 2026-11-15**: the eleven criteria, decisions 5, 6, 10, 45 and 46 and every adopted choice held on the merged code (a read-only workflow of five `cercatore` and four `verificatore`: 96 items, 27 flagged, 19 held, all text); the closure re-run (the five areas' suites 65 files / 2186 tests, § 6's Playwright list and criterion 8's specs 109 passed, 1 skipped, on the emulators); `firestore.rules` and `firestore.indexes.json` untouched. Divergences written, behaviour equal: the three tour changes above (criterion 3, § 3 and § 10 kept «Carico» on its bars, overturned by the owner; DESIGN.md's «Homes» sentence names «Carico» and «Per sottocategoria» under its «also 2026-11-12», their date 2026-11-15 in the guides); the Dividendi decoys removed in `afterEach` (the removal needs the test-scoped `page`), not `afterAll`. Text fixes: the spec's branch and label left `perf/budget.json`, doc/guide/velocita.md's row and doc/guide/prima-schermata-misure.md (#538 in their place); the five guides' «Suites to run» lines and patrimonio.md's § Files took the new tests, builder and e2e files; the three `ring-chart{,.mobile,.tablet}` headers counted «its five homes»; the two deferrals with no heir (no tablet spec for the minor tiles, no largest-part sentence for Mutuo and Centri) in the blind spots of grafici.md, patrimonio.md and centri-di-costo.md; decision 10 and § 7's hosts' builders aligned; NOVE-10's and NOVE-19's sentences on the minor tiles and NOVE-19's two `SottocategorieTile.tsx` cites re-pointed. No runtime code changed |
| NOVE-10 | Analisi recomposed as «Classifica» | L | 05, 08 | Opus 5.5 · medium | written on 2026-11-12; read adversarially on 2026-11-12: 31 findings, 6 owner decisions; implemented on 2026-11-15, PR #540 in develop since 2026-11-15 (branch `feat/nove-10-analisi-classifica`; every § 6 row and the four RTL tile tests seen red with their mutation; the rings' fit red at 390, 768, 1024 and 1440 with the centre's font ×2,5 — `ringCenterMaxChars` forced to 12 leaves it green on the fixture's short figures; `perf:budget` `/dashboard/analisi` 653,3 → 655,7 KB gz on the same machine: 654,9 after the spec, accepted by the owner against criterion 11's ≤ 654, then +0,8 from the tour's changes, ceiling 655 → 656 within 1 KB; `mobile:budget` `analisi` re-recorded as measured with § 8's `raisedBy` — at 768 the first closed row now below the pill —, every other entry identical to develop's run on the same build and day). Owner's changes on the mirror tour (phase F): Spese maggiori on two lines (`RankedRows layout="stacked"`, the caption category · subcategory · day), the landing on the Scheda and the way back on «Chiudi» glide (450 ms, `lib/utils/smoothScroll.ts`), the Scheda's «Trend mensile» axis `width="auto"` («1200 €» read «200 €», a fault older than the series). Divergence written: `doc/guide/impostazioni.md` had no categories' count sentence to rename — one written; **retired on 2026-11-16**: the twelve criteria, decisions 5, 6, 36 and 47–51 and choices (a)–(i) held on the merged code (a read-only workflow of five `cercatore` and four `verificatore`: 107 items, 12 flagged, 11 held — nine text, two test gaps); the closure re-run (the Analisi suites and the tiles' RTL tests 19 files / 638 tests, § 6's Playwright files 47/47 on the emulators); `firestore.rules` and `firestore.indexes.json` untouched. Divergences written, behaviour equal: Spese maggiori's caption reads category · subcategory · day where § 4 wrote category · day · subcategory (the tour's two-line layout); «Dove vanno i soldi»'s reading is `describeSpendingRanking` (§ 4's narrative and N1), not the bare `describeCategoryShare` § 4's component list named; three accessible names outside § 4's strings («Categorie che si sono mosse», «Classifica delle spese», «Entrate, spese e risparmio»); at 390 `figuresOutsideVerdict` went 5 → 4, not up as § 8 expected (the ring's centre is not a lifted figure); `perf:budget` on the Windows machine read five routes red — the develop before and after #540 measured there, Analisi +2,4, Previdenza +1,3, Rendimenti +0,9, Cashflow +0,8, Allocazione +0,2 KB gz from the shared `ranked-rows.tsx`, which the implementation had measured on the Mac for Analisi alone —, the five ceilings raised to that machine's readings with the owner's OK (doc/guide/velocita.md § Registro). Proofs fixed: criterion 1's grid without «Cosa è cambiato» (Entrate 5 · Periodo 7, `e2e/analisi.spec.ts`, red with the spans held at 3 and 4) and criterion 10's headline, axis, «Il perché», no Scheda row and «Il resto della pagina» between THE tile and the rows (M1, red with `PageRest` removed). Text fixes: the label left five code and test comments, `perf/budget.json` and three guides (#540 or the rule and date in its place), criterion and decision numbers rewritten as rules; stale words on the deleted «Fuori scala» tile, the «top five», the trio's `expensesDeltaLifted` and the Flusso as a landscape-index row in `analisiSummary.ts`, `analisiNarrative.ts`, `FlussoTile.tsx`, doc/guide/cashflow.md, cashflow-tracciamento.md and cashflow-analisi.md; decisions 48–51 and choice (f) homed in doc/guide/cashflow-analisi.md, its «Suites to run» line took the four tile suites and `smoothScroll`; nine line cites of NOVE-19 and NOVE-20 re-pointed, eight of them moved by 86421391. No runtime code changed |
| NOVE-11 | Themes: the mechanisms beyond colour and radius | L | — | Opus 5.5 · medium | written on 2026-11-12; read adversarially on 2026-11-12: 27 findings, 2 owner decisions |
| NOVE-12 | The «Egeo» theme | M | 11 | Sonnet 5.5 · medium | written on 2026-11-12; read adversarially on 2026-11-12: 22 findings, 3 owner decisions |
| NOVE-13 | The «Orbita» theme | M | 11, 12 | Sonnet 5.5 · medium | written on 2026-11-12; read adversarially on 2026-11-12: 18 findings, 2 owner decisions |
| NOVE-14 | The Assistente's router | L | — | Opus 5.5 · medium | written on 2026-11-12; read adversarially on 2026-11-12: 20 findings, 1 owner decision; implemented on 2026-11-16, PR #542 in develop since 2026-11-16 (branch `feat/nove-14-assistente-smistatore`; every § 6 row seen red with its mutation; no request to a model in tests or verification; `perf:budget` identical on all 17 routes, `mobile:census` identical to develop's on 57/57 entries; a carried reading's web search follows § 4 to the letter — only `'override'` is taken as it is, owner 2026-11-16; `doc/guide/assistente.md` past 500 lines, Registra split into `assistente-registra.md`); **retired on 2026-11-16**: the thirteen criteria, decisions 11 and 53 and every adopted choice held on the merged code (a read-only workflow of five `cercatore` and four `verificatore`: 82 items, 13 flagged, 12 held — ten text, two test gaps); the closure re-run (the Assistente suites 23 files / 830 tests, the five `e2e/assistant.register*` specs 19/19 on the emulators); `firestore.rules` and `firestore.indexes.json` untouched; `routeReading` read back by R12 on the store mock, an older message without it unchanged. Divergences written, behaviour equal: a carried reading's web search only ADDS to today's policy, like the router's (criterion 9 named the override alone; the owner's call of 2026-11-16, now in doc/guide/assistente.md § The router); `Draft Release Temp.md` took one Bug Fixes entry for the long threads' last 100 messages, where § 9 said «nothing»; the guide's split into `assistente-registra.md` (§ 9 kept one guide). Proofs fixed: R7 now pins the `route` event before every `status` (the order was compared with the statuses filtered out; red with the route emitted from the first `onStatus`), R10 gained two carried rows (red with `'carried'` taken as it is). Text fixes: doc/guide/assistente.md § The router filed `'carried'` under «An override» and gave the override's web rule to both, and read «the LAST assistant message with a reading» where the code reads the last assistant message and gives no previous turn when it has none; `aiModels.ts`'s header counted «four string literals» and one Haiku caller; the label left CLAUDE.md's Assistente line; NOVE-15 re-pointed in 24 places (its header, the guide lines moved by the split, `types/assistant.ts`, `store.ts`, and «NOVE-14» rewritten as the router in `develop`). No runtime code changed |
| NOVE-15 | The Assistente as only a chat | L | 14 | Opus 5.5 · medium | written on 2026-11-12; read adversarially on 2026-11-12: 27 findings, 3 owner decisions; implemented on 2026-11-16 (branch `feat/nove-15-assistente-solo-chat`; every unit criterion seen red with its mutation; Vitest 332 files / 6804 tests in three zones; the eight Assistente and Tracciamento E2E files 32/32 on the emulators, the count at rest 11; no request to a model; `mobile:census` identical to develop's on 57/57 entries; `perf:budget`: the Assistente 755,3 → 753,5, nine ceilings raised by the shell's Radix menu split into a shared chunk, Hall of Fame and Storico past 1 KB with the owner's OK, doc/guide/velocita.md § Registro; phase F, the router's first real calls, on the owner's mirror in the same session; three changes the owner asked during it landed in the same commit: the pension contributions with effect on the period and the Driver's split of the change, the funds' part of each class and the income subcategories in the AI's context, an immaterial sales tax no longer named in the verdicts, the animated wait in the answer's place, the stream's status after a web search — doc/guide/assistente.md, panoramica.md); PR #544 in develop since 2026-11-16; **retired on 2026-11-16**: the eleven criteria, decisions 11, 12, 15, 36, 52 and 53 and every adopted choice held on the merged code (a read-only workflow of five `cercatore` and four `verificatore`: 129 items, 15 flagged, 12 held — eleven text, one test gap); the closure re-run (the Assistente suites and the spec's test files 37 files / 1146 tests, § 6's Playwright files with `cashflow.tracciamento` and `allocation.consulente` 36/36 on the emulators); `firestore.rules` and `firestore.indexes.json` untouched; `routeReading` read back by the page tests on the faked stream, a thread saved before the spec opening as stored (E5). Divergences written, behaviour equal: criterion 11 named a 754 ceiling the ring's retirement had raised to 756 on 2026-11-15 — the Assistente went 755,3 → 753,5 under it, unraised; the changes the owner asked during phase F (the AI context's pension contributions, the Driver's split and the income subcategories; an immaterial sales tax unnamed in the verdicts; the animated wait; the stream's status after a web search; the companion's clip) landed in the implementation's commit outside § 4, each written in doc/guide/assistente.md or panoramica.md with its test. Proof fixed: the chooser's focus — on the chosen reading at open, back on «cambia» after Esc and «Annulla» — pinned in `assistantCompanionScene.test.tsx` with a click that focuses nothing, Safari's (red with `returnFocusTo` dropped; with `userEvent`'s focusing click it stayed green, the modal's own restore covering it). Text fixes: doc/guide/assistente.md's header, § Files and «Suites to run» line took the chat's modules, tests and E2E files, the header's «50+» dot and «Registra» among the hover accents left it; assistente-registra.md's way in; seven comments (the day thread in `store.ts` and the stream route, the period selector in `types/assistant.ts` and the route, the Preferenze popover in `GeneraleTab.tsx` twice and `AssistantMemoryPanel.tsx`); the spec's branch left nine `raisedBy` and doc/guide/velocita.md's row (#544 in its place), the label CLAUDE.md's Assistente line; NOVE-20's Assistente line cites re-pointed (eight, all moved by 675100d9). No runtime code changed |
| NOVE-16 | Allocazione › Accumulo: the PAC tab (PR #486) | L | 02 | Opus 5.5 · medium | written on 2026-11-12; read adversarially on 2026-11-12: 33 findings, 2 owner decisions; implemented on 2026-11-17, PR #547 in develop since 2026-11-17 (branch `feat/accumulo`; PR #486 cherry-picked with D1–D11 and the choices u, v, p, the contributor's trailer in 96383413; `perf:budget` Allocazione 605,9 → 610,5 KB gz, its ceiling 606 → 611 with the owner's OK and criterion 2 corrected that day; tour A–G done and closed, F on the mirror; the owner's changes on the tour: the reserve is the allocation's cash quota kept on the real accounts, refilled by the sales and the inflows before anything is bought); **retired on 2026-11-17**: the sixteen criteria, decisions 24, 25, 30 and 54, choices f, g, l, o, p, s, u, v and A1–A10 held on the merged code (a read-only workflow of five `cercatore` and four `verificatore`: 114 items, 26 flagged, 23 held — all text, one of them D11 left in four test files); the closure re-run (the area and spec Vitest 30 files / 753 tests, `e2e/allocation e2e/accumulo e2e/bundle.lazy` 76/76 on the emulators); `firestore.rules` gained the two blocks, published by the owner before the retirement, `firestore.indexes.json` untouched; `Asset.createdEmpty` read by R2 and U8 on mocks, an asset without it reading «Azzerato» as before (R1b); PR #486 closed that day with the link to #547. Divergences written, behaviour equal: the tour's reserve refill gave the verdict a state `quiet` (a month with no line) and `scheduled` the fields `firstMonth` / `todayYear` — its headline names the first month that buys when it is not the start —, and `summarizePacMonth` is null on such a month (doc/guide/accumulo.md); `selectOpenPlan` lives in `openAccumulationPlan.ts`, `accumuloMonth.ts` imports no `accumulationPlanDoc`, `usePacMonth` and `summarizePacMonthOn` added to the slim path (§ 7 below aligned); `listAddableAssets` also takes `tradedAssetIds` and `alsoAllow`; `roundPlanEuros` also in `dismissRecalibration`, generic on the field names; `ACCUMULO_TAB_SIGNATURE` is a module string in `e2e/chunkProbe.ts` («Verdetto sul piano di accumulo», a function name dies in the minified build); the figures print «1200 €», the app's format, where U7 and R1 wrote «1.200 €». Text fixes: D11 finished — real tickers and two non-round amounts in `accumulationPlanMatching`, `accumulationPlanSchema`, `accumuloTileSentences` and the plan block of `allocazioneSummary` replaced by `ETF-A`… and round figures, the expected values recomputed; ten «decision N» in code, tests and guides rewritten as the owner's rule and date; doc/guide/accumulo.md gained its «Suites to run» line and the no-tab-bar blind spot (§ 10), assistente.md the «mai comprato» row, cache-persistita.md the plans in the bump list; `e2e/lazyTabLanding.ts`'s header counted two Cashflow routines; NOVE-17's and NOVE-21's pointers re-pointed (`selectOpenPlan`, the effective targets, the § 6 grep and the § 4 rendering written out). Outside the spec: `reactCompilerCoverage`'s hook went past its 120 s three times in the whole `TZ=Europe/Rome` run on Windows (58 s alone, ~840 files), its timeout raised to 300 s with the measure in its header. No runtime code changed |
| NOVE-17 | The model portfolio and the optimizer (PR #487) | L | 16 | Opus 5.5 · medium | written on 2026-11-12; read adversarially on 2026-11-12: 32 findings, 3 owner decisions; implemented on 2026-11-18, PR #549 in develop since 2026-11-18 (branch `feat/portafoglio-modello`; PR #487 cherry-picked with M1–M14, the contributor's trailer in f476ce98; tour A–G, F on the mirror, five owner changes from it; `perf:budget` Allocazione 610,7/611, Impostazioni 723,8/724 with its ceiling raised by 1); **retired on 2026-11-18** (the rule of `modelPortfolios` published by the owner before that day, PR #487 closed with the link to #549; a read-only workflow, 112 items, 18 flagged, no runtime defect. Divergences written: the fingerprint hashes the stored targets as they weigh (`weighingTargets`, owner 2026-11-17); `buildModelBasis` runs in `AccumuloTab`, not on the page; `StandaloneCandidates` also carries `fixedKeys` and `instrumentCount`; `describeNegativeFixed` has a plural; `fingerprint` is optional on the document (absent = stale); `restoreCriteria(stored)`; below `desktop:` the first screen holds at 390, while at 768 / 1024 `tilesAboveFold` grows with the two rows in the index (2 → 3, 2/1 → 4/3) and the Impostazioni entry was re-measured, both registered in doc/guide/prima-schermata-misure.md; U4's fixture adds a money-market fund (base 103.000). Fixed: the page-reads-no-model and the type-files-import-no-lib source tests widened, each seen red; two closed counts opened. Lessons in doc/guide/ottimizzatore.md, with its «Suites to run» line) |
| NOVE-18 | «Con vendite mirate» (PR #488) | M | 17 (retired), 07 (retired) | Opus 5.5 · medium | written on 2026-11-12; read adversarially on 2026-11-12: 26 findings, 1 owner decision; implemented on 2026-11-18 (branch `feat/vendite-mirate`, PR #488 cherry-picked with Giorgio Trentadue as co-author; every test of § 6 seen red with its mutation; `estimatePlanSaleTax` unchanged on its 62 cases and on 20.002 random legs; `perf:budget` against develop on the same build and day ±0,2 KB gz, Analisi 658,0 → 658,1 raised 658 → 659; `mobile:budget` identical to develop, 60 entries; collaudo A–E on the emulators, F on the mirror with the owner). Divergences: U5 runs on DELTA, not ALFA (on ALFA the PR's fallback stayed green); the total line prints «8000 €» as the rest of the app (owner); the forced locks reach the optimizer as locks (a pension fund was sellable at zero tax while its box read ticked); a locked fixed share is held at its value, with no `bound_conflict`; below `desktop:` the mode pill is a three-cell grid; the seed sells whole only what the run brings to 0% (then no position), never a fund merely out of the model; found at the tour, two owner decisions (65, 66): a plan may sell a money-market fund, the reserve rising by the sale, and the run keeps the cash at the allocation's quota; PR #551 in develop since 2026-11-18; **retired on 2026-11-18**: the ten criteria, decisions 26, 31, 57, 65 and 66 and choices m, n and C1–C7 held on the merged code (a read-only workflow of five `cercatore` and four `verificatore`: 91 items, 15 flagged, 12 held — all text); the closure re-run (the area and spec Vitest 25 files / 658 tests, `e2e/accumulo` 21/21 on the emulators); `firestore.rules` and `firestore.indexes.json` untouched; the contributor's trailer in 779b87d3, PR #488 closed that day with the link to #551. Divergence written, behaviour equal: the fallback's and Path 2's lower bounds, two inline lines in § 4, live in one helper, `leastTaxLowerBounds`. Fixed at the owner's call (2026-11-18): the two UI sentences «il PAC non vende» (the «Raggiungibile» description, the «Ideale» confirm) read «le rate del PAC comprano soltanto», a plan carrying planned sales since this spec — a test seen red on the old wording. Text fixes: «(T6)» left a comment of `weightOptimizer.ts`, «T4:» two older test names of `speseMaggioriTile` (the same class); the closed «at cap 0 it IS Raggiungibile» / «IS Ideale» and «the PAC never sells» opened in doc/guide/ottimizzatore.md and three comments; the label left collaudo.md, e2e-suite.md, velocita.md and a `raisedBy`, decision 57 there the owner's rule and date; NOVE-21's eight `pr488:` cites re-pointed to `develop` @ 1e580c7b. Lessons in doc/guide/ottimizzatore.md and accumulo.md |
| NOVE-19 | The costume, first pass: shell, portals, controls, Panoramica, Patrimonio, Cashflow | L | 11, 12, 13 | Opus 5.5 · medium | written on 2026-11-12; read adversarially on 2026-11-12: 18 findings, 1 owner decision |
| NOVE-20 | The costume, round B: every dialog and the other nine pages | L | 19 | Opus 5.5 · medium | written on 2026-11-12; read adversarially on 2026-11-12: 23 findings, 1 owner decision |
| NOVE-21 | The Consulente and the plan of accumulation | L | 16, 17 (both retired; after 18, retired) | Opus 5.5 · medium | written on 2026-11-12; read adversarially on 2026-11-12: 26 findings, 2 owner decisions |
| NOVE-22 | Allocazione › Accumulo: a guided path to create a PAC by hand — one question per screen, a summary before «Conferma», as Compravendita and the Consulente; also where the Consulente's hand-off lands | — | 18, 21 | — | **to write** (owner, 2026-11-17, on the NOVE-17 tour: the PAC is complex to set up; the UX and UI of its creation optimised for whoever builds it by hand) |

The transversal reading of the same day (the 21 specs against each other and against this index): 21 findings;
decisions 33, 34, 35 and 62 hold for every spec.

## 7. Shared contracts (name, signature, file — IDENTICAL in every spec that reads them)

A spec that needs one of these differently changes it HERE first, then in every live spec that names it (§ 8).

**The ledger's transaction** — defined by NOVE-03 (retired on 2026-11-14, PR #526), extended by NOVE-07 (retired on 2026-11-15, PR #534)
- `assertTradeUnchanged(existing, plan)`, `PreparedMutation.preparedOnUpdatedAt`, `fetchFreshLedgerMeta`; the
  PUT body's and the DELETE query's `expectedUpdatedAt` (ISO; the version the form was drawn from, optional on
  the wire), passed as the last argument of `updateAssetTransaction` / `deleteAssetTransaction` on both sides
  (`lib/server/assetTransactionUseCase.ts`, `lib/hooks/useAssetTransactions.ts`; doc/guide/registro-operazioni.md
  § Concurrency). At the head of COMPUTE, in this order: `assertTradeUnchanged`, the asset's existence, its ledger
  type, `assertSettlementAccountsStillCash` — then `buildNewSequence`.
- `PreparedMutation.newFeeRefId` (and no `tradeDocData`); `lib/utils/tradeFeeExpense.ts`: `TradeFeeFacts`,
  `planTradeFee`, `isTradeFeeRow`, `feeOutsideCashflow`, `tradeFeeOwner(asset, settlementAccount)` (the fee row's
  `personalMemberId`); `isFeeRow` recognises `feeOfTradeId`; `TradeMutationResult.feeRow: 'written' | 'none' |
  'refused'` (NOVE-07, retired on 2026-11-15).

**The cost basis** — defined by NOVE-07 (retired on 2026-11-15, PR #534), read by NOVE-18 (retired on 2026-11-18, PR #551)
- `fiscalCostPerUnitEur` in `lib/utils/costBasisEur.ts`; `Asset.fiscalAverageCostEur`;
  `LedgerPositionState.fiscalCostBasisEur / .fiscalAverageCostEur / .feesEur`; `AssetTotalReturn.feesEur`;
  `AssetTransactionsMeta.averageCostEurFeeFreeAt`; `AssistantLedgerRow.feeIsSpendingRow`;
  `DASHBOARD_OVERVIEW_SOURCE_VERSION` 25 → 26. NOVE-18 reads ONLY `AllocatableHolding.costBasisEur`, which NOVE-07
  feeds with the fiscal basis.

**The savings rate** — defined by NOVE-05 (retired on 2026-11-14, PR #530), read by NOVE-10 (retired on 2026-11-16, PR #540) — `lib/utils/savingsRate.ts`
- `SAVINGS_RATE_FLOOR = -100`; `SavingsReading` = `none | no-income{spending} | deficit{deficit,income,spending} |
  rate{rate,savings,income,spending}`; `readSavings(income, spending)`; `meaningfulSavingsRate`;
  `weightedSavingsRate`.
- `describeFlow(flow: FlowSummary, reading: SavingsReading): Narrative | null` in `analisiNarrative.ts` (since
  2026-11-12 AnalisiTab calls it with `readSavings(totals.income, totals.expenses)`); `describeCashflow` takes the month's
  `SavingsReading`.

**The Driver's split** — defined by NOVE-06 (retired on 2026-11-14, PR #532), moved by NOVE-07 (retired on 2026-11-15, PR #534)
- `GrowthDrivers.otherPension / otherHoldings / otherAccounts`, `driverRestParts`; `tradeMoneyIn` private in
  `growthDrivers` (NOVE-06), then exported from `lib/utils/marketEffect.ts` on `feeOutsideCashflow` (NOVE-07, retired on 2026-11-15).

**The ring** — defined by NOVE-08 (retired on 2026-11-15, PR #536), read by NOVE-09 (retired on 2026-11-15, PR #538) and NOVE-10 (retired on 2026-11-16, PR #540)
- `lib/utils/ringChart.ts`: `RingSegment{key,label,value,color}`, `RingArc{key,color,length,offset}`,
  `buildRingArcs`, `formatRingCenter(amount, maxChars)`, `isRingWhole`, `foldRingSegments(segments, restLabel)`,
  `ringSwatchAt`, `describeRingSegments`, `ringCenterFontPx`, `ringCenterMaxChars(size)`; `RING_VIEWBOX = 100`,
  `RING_RADIUS = 43`, `RING_STROKE = 9`, `RING_DEFAULT_SIZE = 120`, `RING_MIN_PARTS = 2`, `RING_MAX_PARTS = 6`,
  `RING_REST_KEY = 'ring-rest'`, `RING_REST_COLOR`, `RING_CATEGORY_COLORS` (six slots: `--chart-2, 7, 6, 3, 8, 4`).
- `components/ui/ring-chart.tsx`: `RingChart({ segments, centerValue: number, centerLabel, ariaLabel, size? })`,
  `RING_LAYOUT_CLASS`, `RING_ROWS_CLASS`; DOM hooks `data-ring`, `data-ring-max-chars`,
  `data-ring-center="hole" | "above"`. `RankedRows`' legend mode: `RankedRow.swatch?`, each `remainders` entry's `swatch?`, `bars?: boolean`.
- `e2e/ringFit.ts`: `expectRingFiguresInside(scope)`; `e2e/overviewFixture.ts`: the `charts` merge.
- The hosts' builders, each in a module of its own so a light tile does not pull a page's summary (doc/guide/velocita.md,
  2026-11-15): `compositionRing` in `lib/utils/compositionRing.ts`, `incomeRingSegments` in `lib/utils/categoryRing.ts`,
  `versatoRing` + `NATURE_RING_COLORS` in `lib/utils/pensionSummary.ts`; the minor tiles' (NOVE-09, retired on 2026-11-15, PR #538): `ownershipRingSegments(summary, basis)` in
  `lib/utils/ownershipRing.ts`, `splitRingSegments` (`expenseSplitSummary.ts`), `mortgageRingSegments` + `mortgageYearPaid`
  (`mortgageSummary.ts`), `costCenterRingSegments` + `subCategoryRingSegments` (`costCenterSummary.ts`), `payerRingSegments`
  (`dividendAnalytics.ts`).
- DESIGN.md → «Ring Chart / The Ring Rule»: written by NOVE-08 (five homes since its tour), its «Homes» sentence extended by NOVE-09 (retired on 2026-11-15, PR #538), then by
  NOVE-10 (retired on 2026-11-16, PR #540) — in that order.

**Analisi** — defined by NOVE-10 (retired on 2026-11-16, PR #540) — `lib/utils/analisiSummary.ts`, `analisiNarrative.ts`
- `SPENDING_TYPE_LABELS`, `TOP_EXPENSES_SHOWN = 10`, `TOP_EXPENSES_MORE = 20`, `limitTopExpenses`,
  `buildSubCategoryRanking`, `buildRingShares`, `summarizeCategoryChanges`, `ANALISI_SECTION_IDS`;
  `describePeriodoSavings(reading: SavingsReading)`.

**The Assistente's router** — defined by NOVE-14 (retired on 2026-11-16, PR #542), read by NOVE-15 (retired on 2026-11-16, PR #544)
- `types/assistant.ts`: `AssistantRoutePeriod`, `AssistantRoute{ intent: AssistantMode; period; webSearch;
  confidence }`, `AssistantRouteOverride`, `AssistantRouteReading{ route; source; reason? }`,
  `AssistantMessage.routeReading?`; the stream event `{ type: 'route'; reading }` right after `meta`; the request's
  `mode: AssistantMode | 'auto'`, `route?: AssistantRouteOverride` and `routeCarried?: boolean`;
  `AssistantRouteSource = 'router' | 'override' | 'carried' | 'fallback'` (`'carried'`: a route re-sent from the
  previous turn's reading — NOVE-15 writes «Ho letto», never «Hai scelto», decision 53).
- `lib/utils/assistantRoute.ts`: `ASSISTANT_ROUTER_MIN_CONFIDENCE = 0.6`, `FALLBACK_ROUTE`, `checkRouteConsistency`,
  `parseRouterToolInput`, `routeToSelection`; NOVE-15 adds `routeToChooserDraft`, `chooserDraftToOverride`.
- `lib/server/assistant/router.ts`: `routeAssistantMessage(input: AssistantRouterInput, client: RouterClient):
  Promise<AssistantRouteReading & { elapsedMs: number }>`, `createRouterClient(): RouterClient`;
  `lib/constants/aiModels.ts`: `ASSISTANT_ROUTER_MODEL = 'claude-haiku-5-5'`. A model reading that is Registra with a
  period keeps Registra and drops the period; the thread's detail is its last 100 messages.
  `lib/utils/assistantChatNarrative.ts` (NOVE-15): `describeRoute`, `describeReadingLine`,
  `buildEmptyChatSuggestions`.

**The plan of accumulation** — defined by NOVE-16 (retired on 2026-11-17, PR #547), read by NOVE-17 (retired on 2026-11-18, PR #549), NOVE-18 (retired on 2026-11-18, PR #551) and NOVE-21
- Collections `accumulationPlans` (query `where('userId', '==', uid)`) and `accumulationPlanLocks/{ownerUid}`
  `{ userId, openPlanId: string | null, updatedAt }`, written in the plan's transaction.
- `lib/utils/accumulationPlanDoc.ts`: `docToAccumulationPlan(id, data)`, `openPlanHeldBy(lockOpenPlanId,
  pointedStatus)`; `selectOpenPlan(plans)` (`undefined` when none is open) lives alone in
  `lib/utils/openAccumulationPlan.ts`, re-exported by `accumulationPlanDoc.ts` and the hook;
  `lib/services/accumulationPlanRead.ts`: `getAccumulationPlans(ownerId)`; `lib/hooks/useAccumulationPlans.ts`:
  `useAccumulationPlans` (the read service imported inside its query, on demand).
- `lib/utils/accumuloMonth.ts`: `summarizePacMonth(plan, currentIndex)` (null before month 1, after the last and on
  a month with no line — the reserve's refill, 2026-11-17), `summarizePacMonthOn(plan, todayIso)`,
  `planEndsAfterReview(plan, reviewByIso)`,
  `describeOpenPlanForAdvice(plan, monthKey, nameOf): OpenPlanForAdvice | null` (null unless the plan is active).
- `isPlanBuyable(asset, allAssets)` in `lib/utils/accumulationPlanUtils.ts` (a ledger type, not cash, role tradable
  WITH the financed asset); `useMonthlySavingsMedian(ownerId, assets, { enabled }): { medianEur; months } | null |
  undefined`; `describeSuggestedInflow(suggestedEur, months)`; `Asset.createdEmpty?: true` (written only by
  `AssetDialog`'s `createEmpty`); `AssistantHoldingRow.neverBought?: true`; `roundPlanEuros` (private to the service:
  every euro field of a written plan in cents); `monthLabelLong` in `lib/utils/planMonths.ts`;
  `seedAccumuloFixture({ startOffset, status })` (NOVE-21 adds `status?: 'active' | 'draft'`), `plantCriteria()` /
  `restoreCriteria(stored)` (NOVE-17 (retired on 2026-11-18, PR #549); `stored` is what `plantCriteria()` returned); `APPLY_ACTIVE_PLAN_NOTE` in `allocationAdviceNarrative.ts`.

**The optimizer and the model** — defined by NOVE-17 (retired on 2026-11-18, PR #549), extended by NOVE-18 (retired on 2026-11-18, PR #551), read by NOVE-21
- `types/optimizer.ts`: `OptimizerMode = 'reachable' | 'ideal'` (NOVE-18 adds `'targeted'`), `OptimizerSnapshot`
  (NOVE-18 adds `taxCapEur?`, `lockedKeys?`). `types/accumulationPlan.ts`: `PlanSeedDraft { positions:
  PlanPosition[]; disposals?: PlanDisposal[]; optimizerSnapshot?: OptimizerSnapshot }`, the editor's one seed
  (`AccumulationPlanDialog`'s `seedDraft`).
- `lib/utils/weightOptimizer.ts`: `runOptimizer(input): OptimizerResult` (NOVE-18 adds `input.holdings?`),
  `buildStandaloneCandidates(assets, valueOf, investEur, evaluateAssetIds?, groups?): StandaloneCandidates`
  (`investEur`: money taken from the accounts, never added to the base — decision 55),
  `LIQUIDITY_CANDIDATE_KEY = 'liquidita'`, `roundWeights(x, lo, hi)`.
- `modelPortfolios/{ownerUid}` `{ userId, weights, origin, optimizerSnapshot?, fingerprint?, updatedAt }` (no `fingerprint` = stale);
  `lib/utils/modelPortfolio.ts`: `ModelBasis { targets; criteria; goals }`, `buildModelBasis(settings, goals)` (the stored
  targets, the criteria and the goals' inputs, never a price nor a date — decision 56; built by `AccumuloTab`, never by the page), `modelFingerprint(basis, assets)`, `isModelStale(model, basis,
  assets)`; `saveModelPortfolio(ownerId, input, allAssets, basis)`, `ModelPortfolioInput.keepFingerprint?`;
  `StandaloneCandidates.liquidityEur`, `.fixedKeys`, `.instrumentCount`; `LIQUIDITY_CANDIDATE_KEY` defined in `lib/constants/idealAllocation.ts`.

**The sale's tax** — defined by NOVE-18 (retired on 2026-11-18, PR #551) — `lib/utils/saleTax.ts`
- `SaleTaxPerEuro` = `exempt | taxed{perEuro} | unknown{reason: 'cost-basis' | 'rate'}`;
  `saleTaxPerEuro(holding)`; `candidateSaleTaxPerEuro(buyAssetId, holdings)` (a group is priced at its buyer);
  `estimatePlanSaleTax` calls `saleTaxPerEuro`, the targeted optimizer and the dialog's locks call
  `candidateSaleTaxPerEuro`; a proposed sale deducts no sale fee. `OptimizerSaleReport.liquiditySpentEur`: the
  liquidity is spent, never sold — out of `soldEur` and `taxEur`.

**The Consulente's hand-off** — defined by NOVE-21, on the two groups above
- `lib/server/allocationAdvice/accumulationPlan.ts`: `readAccumulationPlanForAdvice(userId, now):
  Promise<AccumulationPlanRead>`, `AccumulationPlanRead = { read: true; plan: OpenPlanForAdvice | null } |
  { read: false }`; `formatAccumulationPlanForPrompt(state)` in `prompts.ts` (the «--- PIANO DI ACCUMULO ---» block,
  read by the strategy, the interview, the review and the revision).
- `lib/utils/allocationAdviceDocument.ts`: `handoffProposalOf(document)`, `ApplyHandoff = 'offer' | 'draft' |
  'none'`, `applyHandoffOf(document, plans)`, `CONSULENTE_HANDOFF_HREF`.
- `lib/utils/allocationAdviceHandoff.ts`: `planConsulenteHandoff(proposal, candidates, keepAssets, assets)`,
  `handoffCriteria(base, targets, unmapped)`, `buildHandoffSeed(input): HandoffSeedOutcome` (computed: `seed`, `unmappedClasses`, `zeroClasses`,
  `extraNames`), `describeHandoffZero`, `describeHandoffExtra`,
  `findKeptSales(disposals, keepAssetIds)`.
- Additive props: `AccumulationPlanDialog.advisorKeepAssetIds?`, `AssetDialog.prefill?: AssetPrefill`
  (`types/assets.ts`), `AccumuloTab.advice`, `ApplyPiecesInput.handoff`, `ConsulenteHandoff.basis` (`ModelBasis` of `lib/utils/modelPortfolio.ts`);
  `components/allocation/KeptSalesNote.tsx`.

**The costume** — defined by NOVE-11 § 4.3, filled by NOVE-12 and NOVE-13, read by NOVE-19 and NOVE-20
- `lib/constants/colorTheme.ts`: `COSTUME_ATTRIBUTE = 'data-costume'`,
  `ThemeCostume { resourceBar }` (the header band is CSS alone: `--costume-header-band-height` > 0), `ColorThemeMeta { name; description; costume: ThemeCostume | null }`,
  `COLOR_THEME_META: Record<ColorTheme, ColorThemeMeta>`, `COSTUME_THEMES`,
  `buildColorThemeInitScript(attributeThemes, costumeThemes)`.
- `contexts/CostumeScopeContext.tsx`: `CostumeScope` (a `display: contents` box with `data-costume-scope`),
  `useCostumeScope(): boolean`, `useThemeCostume(): ThemeCostume | null`.
- `lib/constants/themeCostume.ts`: `COSTUME_SCOPE_PROPERTIES` (18: `--radius`, `--radius-2xl`, `--costume-ground`,
  `--costume-ornament`, `--costume-tile-image` / `-position` / `-size`, `--costume-tile-shadow`,
  `--costume-heading-font` / `-weight` / `-tracking` / `-case` / `-size`, `--costume-eyebrow-color` / `-weight`,
  `--costume-header-band` / `-height`, `--costume-primary-glow`), `EmblemPage`, `EmblemTone`, `EmblemShape`,
  `EmblemArt`, `ThemeEmblems`, `THEME_EMBLEMS`, `resolveEmblem(theme, page, inScope, emblems?)`.
- CSS: a costume theme is four blocks (`[data-theme="<id>"]`, `.dark[data-theme="<id>"]`, and the same two followed
  by ` [data-costume-scope]`); every rule of the «Theme costume» section starts with
  `[data-costume] [data-costume-scope]`; hooks `#page-main`, `[data-tile]`, `.costume-heading`, `.tile-eyebrow`,
  `.costume-figure`, `.costume-header-band`; `:root` becomes `:root, [data-theme="default"]`. Outside the section
  a `--costume-*` is read only inside a scope block's own declarations (from NOVE-19 also by the
  `[data-popper-sheet]` radius, with its fallback).
- `components/ui/theme-costume.tsx`: `EmblemSvg`, `ThemeEmblem({ page, size })`, `ThemeEmblemLead`,
  `ThemeHeaderBand`, `HeadingText({ text })`; `lib/utils/headingFigures.ts`: `splitHeadingFigures(text)`;
  `PageHeader`'s `emblem?: EmblemPage`.
- Fonts: one `next/font/google` call per costume face, `preload: false`, the variable on `<html>`:
  `--font-marcellus` (NOVE-12), `--font-chakra-petch` (NOVE-13).
- Tests: `__tests__/themeBlocks.ts` (`THEME_MODES`, `themeBlockHeader`, `themeBlockBody`);
  `__tests__/themeCostumeContrast.test.ts` (NOVE-12, extended by 13, 19, 20); `e2e/themeNeutral.ts` +
  `e2e/themeNeutral.baseline.json` (the palette themes' identity, green in every later spec).
- NOVE-12 and NOVE-13 write the palettes: Egeo declares its own `--positive` in BOTH its palette blocks (a
  light-block token reaches dark mode by source order); in both themes `--chart-3` (Criptovalute, the COMPRA chip)
  sits at hue 60, ≥ 30° from `--destructive` (decisions 61, 63); `__tests__/themeCostumeContrast.test.ts` K1
  (surfaces), K3 (sign tokens), G2 (the hue gap).
- NOVE-19 extends it: `COSTUME_SCOPE_PROPS` and `useCostumeScopeProps()` in `contexts/CostumeScopeContext.tsx`,
  spread by every portalled primitive (popover, select, dropdown menu, tooltip, sheet, drawer, dialog, alert dialog);
  `COSTUME_SCOPE_PROPERTIES` 18 → 22 (`--costume-control-frame-radius`, `-pill-radius`, `-chip-radius`,
  `-switch-on`, each read only through a `var()` with today's value as fallback); `COSTUME_PILL_RADIUS_CLASS`,
  `COSTUME_FRAME_RADIUS_CLASS`; the hook classes `.costume-shell-eyebrow`, `.costume-shell-quiet`,
  `.costume-wordmark`; Egeo's page emblems; `e2e/theme.costume{,.mobile,.tablet}.spec.ts`.
- NOVE-20 extends it again: the 23rd property `--costume-page-generated-fill` and `COSTUME_GENERATED_FILL_CLASS`;
  `data-costume-frame` on the dialog, drawer and alert-dialog contents (a modal's cap or marks, its Float shadow
  kept); `.costume-title`; the `@media print` reset of every scope property; `lib/constants/sankeyCostumeColors.ts`
  (`SANKEY_COSTUME_TOKEN`), `SankeyTypePalette`, `DEFAULT_SANKEY_TYPE_PALETTE`, `costumeSankeyPalette(hex)` in
  `lib/utils/cashflowSankey.ts`; Egeo's nine further page emblems. The count the tests hold: 18 after NOVE-11, 22
  after NOVE-19, 23 after NOVE-20 — NOVE-12's and NOVE-13's light scope blocks gain the lines in that order.
- NOVE-13 only: `selectResourceBar(overview): ResourceFigure[]` in `lib/utils/overviewSummary.ts`,
  `ResourceBar({ figures })` in `components/dashboard/overview/ResourceBar.tsx`.

**The contributor's credit** (NOVE-07 — retired on 2026-11-15, PR #534, its PR #489 closed that day —, NOVE-16 — retired on 2026-11-17, PR #547, its PR #486 closed that day —, NOVE-17 — retired on 2026-11-18, PR #549, its PR #487 closed that day —, NOVE-18 — retired on 2026-11-18, PR #551, its PR #488 closed that day): `Co-authored-by: Giorgio Trentadue
<148712309+Ciocc128@users.noreply.github.com>`, the form already in the repo's history.

## 8. The rules that bind every spec

- **The series' labels never enter the code**: no `NOVE-05` in a file, function or test name, nor in a comment; a
  comment cites the rule and the date, never the spec.
- **Line numbers are dated and carry the commit** (`file:line @ b841cbd7`): earlier specs move them; the implementer
  rereads them and, when the line has moved, searches the function's name. A PR's line is `prNNN:file:line`, on the
  local ref the spec names.
- **The document limits**: CLAUDE.md is an index (under 20,000 characters; one line per area, one «Latest»);
  AGENTS.md ~1000 lines (a repo-wide rule = RULE + DATE + WHERE PINNED); a guide ~500 lines; DESIGN.md is
  hand-written, never regenerated — a spec carries its amendment as before / after sentences (decision 16);
  `Draft Release Temp.md` carries only what the user sees. Every document is in English: Italian only for quoted UI
  text, page names and the owner's words.
- **No owner data in a tracked file** (WORKFLOW.md § 1.6): fixtures, mocks and examples on invented, round figures
  and generic names; the figures of the session's screenshots and of the owner's own purchase are never written; a
  PR's fixture built on its author's real portfolio is replaced by an invented one; the mirror serves the tour and
  `npm run mirror:remove` removes it.
- **A probe never opens a control that SPENDS**: the Assistente's stream, its router and the Consulente's run are
  faked (`page.route(...)` with a fake SSE answer, or a spy on the SDK's `stream`); the real run is done ONCE, on the
  mirror or in production after the deploy, with the owner's key, in phase F — never on the PR's Vercel preview.
- **The system prompt is byte-identical for every user**: everything that is the user's sits in the `userContent`;
  the proof is `expect(a.system).toBe(b.system)`. The repo has no snapshot tests and none is added (NOVE-11's E1 is a recorded baseline of
  computed styles compared with `toEqual`, the one declared recorded comparison: re-recorded only on untouched code).
- **A spec is only a development instruction**: no open choice survives a reading — a «da decidere», a «verify at
  implementation», an alternative offered to the implementer are findings of the adversarial reading. Component
  tests are `.test.tsx` with RTL.
- **A contributor's PR is brought in on a fresh branch from `develop`**, with the changes its spec lists, and the
  contributor credited by a `Co-authored-by` trailer; the PR itself is closed by the owner with a link to the merge.
- **How a spec in service is retired**: the session after its implementation reads the code against the spec, gives
  a verdict on every divergence, carries the lessons home (AGENTS.md, the guide, a comment on the line, CLAUDE.md),
  updates the shared contracts (§ 7) in the LIVE specs that change, then deletes the spec and every pointer; a
  text-only defect is fixed in the retirement with `tsc`, lint and Vitest; a runtime one only on the owner's call.
  Only the session after that implements the next spec: implementation → retirement → implementation.
- **The guided verification** follows WORKFLOW.md § 2: phases A–G, the expected outcome declared first, the decoys
  («ornitorinco», «fenicottero»), the assertions on the data (Firestore or the HTTP answer), phase F only at the
  owner's «pronto», phase G removing fixtures, mirror and scripts.
- **The two budgets, ONE rule for every spec** (decisions 33, 34). `mobile:budget`: `mobile:census` + `mobile:budget`
  on `develop` and on the branch the same day, same build; every entry the spec does not name reads the same on
  both (twelve entries of other surfaces are red since 2026-11-11: they stay as they are), the entries it names are
  re-recorded with `raisedBy` (doc/guide/prima-schermata-misure.md); the session stops on an unnamed entry that
  moves. `perf:budget`: every route measured before and after on the same machine; a route that crosses its
  ceiling by ≤ 1 KB gz has the ceiling raised with `raisedBy` and a row in doc/guide/velocita.md § Registro,
  without asking; above 1 KB the session stops with the two measures. A spec's own «≤ N KB» is its estimate, never
  a second rule.
- **`develop` goes to `main` only when the whole series is implemented and retired** (decision 62): what a spec
  declares «until NOVE-NN» lives on `develop` only.

## 9. The line for prompt 07 and prompt 08

`SERIE: doc/nove/ · INDICE: doc/nove/README.md · SPEC VIVE: 11 12 13 19 20 21`

Prompt 08 (`08_CREA_RITIRO_SPEC`) was run on 2026-11-12, after the adversarial reading, in a session of its own:
`doc/nove/PROMPT-RITIRO.md` is the prompt the owner pastes to retire ONE spec. A retirement updates its precedents
and measures in place and removes the retired number from the line above; the last retirement deletes it with the
folder.

## 10. What NOT to do (decided on 2026-11-12)

- No name, image, sound or copied look of a game: the themes are original worlds with our names (choice a).
- No ring for a signed quantity, a time series or a comparison of two wholes; the savings ring removed on
  2026-08-31 does not come back.
- No percentage of the income below −100% or without income, anywhere.
- No section «Come arrivarci» written by the Consulente with its own figures: the path is the engine's (decision 28).
- The Consulente never reads the model portfolio nor its criteria (choice i).
- No backfill of past fee rows (decision 21); no change to the PMC shown to make a tax estimate right (decision 31).
- No theme ornament outside the dashboard and its dialogs (decision 17); figures never leave Geist Mono.
- No `npm audit fix`, no dependency upgrade inside a spec of this series, except the two theme fonts NOVE-12 and
  NOVE-13 load through `next/font`.
- No merge of a contributor's branch as it is: each PR enters through its spec's list of changes.
