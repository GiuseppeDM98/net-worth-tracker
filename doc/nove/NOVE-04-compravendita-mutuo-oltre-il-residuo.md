# NOVE-04 — Compravendita: a mortgage larger than what is left to pay

> Series `doc/nove/` (README.md § 5): **depends on nothing**. Written on 2026-11-12; every `file:line` is cited on
> `develop` @ b841cbd7. Executes the owner's point 7, decision 2 and the adopted choice (w) (README.md § 3-4).

## 1. The problem today (evidence on the code)

**The question the owner asked, answered.** How does the deposit (caparra) count in the house's value when there is a
mortgage?

- The caparra confirmatoria is an advance on the price: at the rogito it is deducted from what is still owed. This
  does not depend on the bank. In the app the preliminare is a transfer account → property
  (`lib/utils/realEstateOperationPlan.ts:422`), so the house is worth the deposit from that day.
- At the rogito the app opens the loan and raises the property by the principal (`:428-430`, «the bank pays the
  seller»), then transfers from the account what is left: `purchaseBalance = price − valueToday − principal`
  (`:304`), a row only when it is > 0 (`:432`).
- What depends on the bank: the loan-to-value is applied to the LOWER of price and appraisal; whether it disburses
  more than the residual (price − deposits) and credits the difference to the borrower's account, or lowers the
  disbursement; and the net disbursed amount, after the imposta sostitutiva (0,25% first home, 2% otherwise),
  the istruttoria and, sometimes, the policies — which the app books as cost rows, never inside the principal.

**The defect.** A mortgage on a percentage of the PRICE, with a deposit already paid, exceeds the residual: with an
invented case — price 200.000 €, deposit 20.000 €, mortgage 190.000 € (95%) — `purchaseBalance` is −10.000 € and the
run is refused twice (`lib/utils/realEstateOperationNarrative.ts`):

- `:177` (screen `saldo`): «Caparre e mutuo superano il prezzo di 10.000,00 €: controlla gli importi.»
- `:185` (screen `mutuo`): «Il mutuo supera quanto resta da pagare della casa (180.000,00 €).»

(Every amount of this module prints its cents: `eur` is `cachedFormatCurrencyEUR`, `:29`.)

The real event — the bank pays the seller the 180.000 € still owed and credits 10.000 € to the buyer's account —
cannot be recorded; today the owner must lower the mortgage and so understate the debt.

## 2. Goal and acceptance criteria

A purchase rogito accepts a mortgage up to the price; what exceeds the residual lands on the account's balance.

1. Price 200.000, value today 20.000, mortgage 190.000: `figuresOf` gives `purchaseBalance: 0`,
   `mortgageExcess: 10000`. **Proof**: `realEstateOperationPlan.test.ts` P1.
2. The plan of that run is `createLoan` (principal 190.000) → `disburseMortgage { toProperty: 180000, toAccount:
   10000, accountId }` → the instalments' series; no `row:balance`, no `adjustProperty`. **Proof**: P2.
3. With no excess the plan is today's, step for step (`createLoan`, `adjustProperty`, `row:balance`, …). **Proof**:
   the existing test at `__tests__/realEstateOperationPlan.test.ts:120-135`, untouched, and P3 (excess exactly 0).
4. After «Conferma»: the property is worth 200.000, the loan −190.000, the account's balance is 10.000 higher, and NO
   expense row carries the excess. **Proof**: E2E C1 (the Firestore assertions).
5. A mortgage above the price is refused on the `mutuo` screen: «Il mutuo supera il prezzo della casa
   (200.000,00 €).» (compared through the test file's `flat`: the formatter's no-break space). **Proof**:
   `realEstateOperationNarrative.test.ts` N1.
6. The `saldo` screen says «Dal conto non esce nulla: il mutuo copre quanto resta del prezzo e avanzano
   10.000,00 €, che la banca accredita su Conto Fenicottero.» (`describeBalance`, N2); the summary says it in the
   step's one sentence «Il mutuo paga al venditore 180.000,00 €, che diventano valore di {casa}; i 10.000,00 € che
   avanzano entrano su {conto}. Nessuna entrata: è debito, non reddito.» (`describePlanStep`, N3).
7. The net worth does not move by the excess: +200.000 house, −190.000 loan, +10.000 account, −20.000 already moved
   at the preliminare. **Proof**: C1 reads the three assets.
8. «Conferma» is disabled while any screen of the run refuses, and the status line shows the first refusal (a draft
   restored at the summary, or a house whose value moved in another tab, is checked again). **Proof**: N4.
9. `npm run perf:budget` keeps `/dashboard/assets/compravendita` within its 596 KB gz (595,7 today).

## 3. Decisions

- **Owner 2 (2026-11-12)**: accept the mortgage above the residual; the excess goes on the ACCOUNT'S BALANCE, WITHOUT
  a cashflow row; the summary says it in one sentence.
- **Owner 40 (2026-11-12)**: with a mortgage above the residual the `saldo` screen asks where the excess lands —
  «Su quale conto la banca accredita quanto avanza del mutuo?», field label «Sul conto» — never «Da quale conto
  paghi il resto del prezzo?», which states the opposite of what happens.
- **Adopted, reversible**:
  - the cap is the price: a mortgage above the price is refused (a loan larger than the purchase is a different
    product — a mutuo with liquidity — and is not a Compravendita);
  - property and account move in ONE Firestore transaction (the `payOffWithSale` precedent,
    `lib/services/realEstateOperationService.ts:157-164`);
  - the account credited is the run's account (`answers.accountId`), the one the `saldo` screen already asks;
  - the loan's creation and the disbursement stay TWO steps, like `createLoan` → `adjustProperty` today: the
    executor is not atomic across steps, and a failure between the two is named by the partial-failure message
    (S2); only the house and the account move in one transaction;
  - the summary re-checks every screen before «Conferma» (criterion 8): with the `saldo` refusal gone, the
    `mutuo` refusal is the only guard of `disburseMortgage`'s amounts, and a restored draft must not skip it.
- **Overturned**: the two refusals of 2026-10-21 (`realEstateOperationNarrative.ts:177,185`).

## 4. Solution

### `lib/utils/realEstateOperationPlan.ts`

`RealEstateFigures` (`:277`):

```ts
  /** Purchase rogito: what leaves the account for the price (price − value today − mortgage), never below 0. */
  purchaseBalance: number;
  /** Purchase rogito: the part of the mortgage beyond what is left to pay, credited to the account (≥ 0). */
  mortgageExcess: number;
```

`figuresOf` (`:296`):

```ts
  const residual = roundToCents(price - valueToday - principal);
  …
    purchaseBalance: Math.max(0, residual),
    mortgageExcess: answers.kind === 'purchase' && answers.event === 'rogito' && answers.hasMortgage ? Math.max(0, roundToCents(-residual)) : 0,
```

`PlanStep` (`:342`) gains:

```ts
  /** The mortgage's disbursement when it exceeds the residual: the seller's part raises the property, the rest reaches the account. One transaction, no row. */
  | { kind: 'disburseMortgage'; toProperty: number; toAccount: number; accountId: string }
```

`buildRealEstatePlan`, the purchase rogito (`:426-434`):

```ts
    if (answers.hasMortgage) {
      const principal = positive(answers.mortgage.principal);
      steps.push({ kind: 'createLoan', ref: 'mortgage', name: `Mutuo ${name}`, principal, ratePct: answers.mortgage.ratePct ?? 0, financesProperty: true, ownership: answers.ownership });
      if (figures.mortgageExcess > 0) {
        // The bank pays the seller what is still owed and credits the rest to the borrower (2026-11-12).
        steps.push({ kind: 'disburseMortgage', toProperty: roundToCents(principal - figures.mortgageExcess), toAccount: figures.mortgageExcess, accountId: answers.accountId });
      } else {
        // The bank pays the seller: the principal becomes the property's value the day the loan opens.
        steps.push({ kind: 'adjustProperty', delta: principal, reason: 'mortgage' });
      }
    }
```

The `row:balance` condition (`figures.purchaseBalance > 0`) is unchanged.

### `lib/services/realEstateOperationService.ts` — the new step

```ts
      case 'disburseMortgage': {
        const propertyId = created.property ?? plan.propertyId;
        if (!propertyId) throw new Error('The property to adjust is unknown');
        // One transaction: the house and the account rise together, no row (the payOffWithSale precedent).
        await updateCashAssetBalancesAtomic([
          { assetId: propertyId, signedDelta: step.toProperty },
          { assetId: step.accountId, signedDelta: step.toAccount },
        ]);
        return;
      }
```

The step counts as one write in `describeDone`/`describePartialFailure` like every other step.

### `lib/utils/realEstateOperationNarrative.ts`

- `describeScreenBlock`, `saldo` (`:177`): the purchase line is deleted (without a mortgage the price screen already
  refuses a price below the value; with one the excess is legal).
- `mutuo` (`:185`) becomes:

```ts
      if ((loan.principal ?? 0) > (answers.price ?? 0) + 0.005) return `Il mutuo supera il prezzo della casa (${eur(answers.price ?? 0)}).`;
```

- `describeBalance` (`:252`) takes the account's name and says the excess. Signature (README.md § 7 is not
  involved; three call sites: `SaldoScreen` in `CompravenditaScreens.tsx` and the two calls of
  `__tests__/realEstateOperationNarrative.test.ts` › «should say the balance of a purchase and of a sale», which
  gain the third argument `'Conto Fenicottero'` — their expected sentences do not change: neither case has an
  excess):

```ts
export function describeBalance(answers: RealEstateOperationAnswers, context: RealEstatePlanContext, accountName: string): string {
  …
  if (figures.mortgageExcess > 0) {
    return `Dal conto non esce nulla: il mutuo copre quanto resta del prezzo e avanzano ${eur(figures.mortgageExcess)}, che la banca accredita su ${accountName}.`;
  }
```

  `accountName` is the name of `answers.accountId` in `context.assets`, «il conto» when not chosen yet.
- **The screen's question** (decision 40). `screenCopy(screen, answers, mortgageExcess = 0)`
  (`realEstateOperationNarrative.ts:62`) gains the third argument; its one caller, `CompravenditaWizard.tsx:66`,
  passes the `mortgageExcess` of the run's figures (the value `describeBalance` reads). In the `saldo` case of a
  purchase with `mortgageExcess > 0`: `question` «Su quale conto la banca accredita quanto avanza del mutuo?»,
  `help` «Il mutuo supera quanto resta del prezzo: la banca versa al venditore il resto e accredita su questo conto
  quello che avanza.»; every other case is unchanged. `SaldoScreen`'s field label (`CompravenditaScreens.tsx:244`,
  «Dal conto») reads «Sul conto» on the same condition. The costs screen that follows still debits that account:
  unchanged.
- A new export, for criterion 8:

```ts
/** The first refusal among the run's screens, or null: what «Conferma» must not pass over (2026-11-12). */
export function firstScreenRefusal(
  screens: readonly RealEstateOperationScreen[],
  answers: RealEstateOperationAnswers,
  context: RealEstatePlanContext
): string | null {
  for (const screen of screens) {
    const refusal = describeScreenBlock(screen, answers, context);
    if (refusal) return refusal;
  }
  return null;
}
```
- `describePlanStep` gains:

```ts
    case 'disburseMortgage':
      return `Il mutuo paga al venditore ${eur(step.toProperty)}, che diventano valore di ${names.propertyName}; i ${eur(step.toAccount)} che avanzano entrano su ${refName({ id: step.accountId }, names)}. Nessuna entrata: è debito, non reddito.`;
```

### `components/assets/compravendita/CompravenditaScreens.tsx`

`SaldoScreen` passes `context.assets.find((asset) => asset.id === answers.accountId)?.name ?? 'il conto'` as
`accountName` (the account selector is already on that screen and already required: «Scegli il conto.»).

### `components/assets/compravendita/CompravenditaWizard.tsx`

On the summary, `const refusal = screen === 'riepilogo' ? firstScreenRefusal(screensFor(answers, context), answers,
context) : null;` (`screensFor` from `lib/utils/realEstateOperationDraft.ts`). «Conferma» gains `|| refusal !== null`
in its `disabled`, and the status line prints `refusal` where it prints `block` today (the summary has no block of
its own).

### Comments that become false

The module headers of `lib/utils/realEstateOperationPlan.ts` («the rest of the price transferred from the account»)
and of `lib/services/realEstateOperationService.ts` name the new step: the mortgage beyond the residual is
disbursed onto the house and the account in one transaction, without a row (2026-11-12).

## 5. Constraints and traps (AGENTS.md / repo rules, «here it means that»)

- **Money in cents**: every new figure goes through `roundToCents` (`lib/utils/cents.ts`);
  `roundToCents(toProperty + toAccount) === principal` (P2 asserts it on 190.000 and on a principal with cents,
  190.000,10).
- **A debt is a `loan` asset worth minus its principal** (2026-10-10): the loan is created with the FULL principal;
  the excess is cash the owner holds against that debt — the net worth is unchanged by it.
- **No cashflow row for the excess**: it is neither income nor a transfer between two of the owner's accounts; the
  savings rate, Analisi and the Driver's `netSavings` do not see it. The Driver reads the rogito month as any
  mortgage opening reads today: `debtRepaid` is −principal (a loan opened is debt that went up, doc/guide/storico.md
  § Storico — a verdict over tiles) and `other` is +principal — the house raised by hand plus the excess on the
  account — so the identity closes on a zero growth. The excess adds nothing new to the Driver: it moves 10.000 of
  that `other` from the house to the account (after NOVE-06, into «Saldi dei conti»).
- **The plan is pure and the executor thin** (doc/guide/compravendita.md): the decision (excess or not) lives in
  `buildRealEstatePlan`; the service only executes the step.
- **«A partial failure says how far it got»**: `disburseMortgage` comes right after `createLoan`; if it fails the
  message names it through `describePlanStep` like any step.
- **The React Compiler map wants no logic inside a `try`** (the service's own comment at `:132`): the new `case`
  sits in `run`, like the others.
- **Sentences live in the narrative module**, never in the component.

## 6. Tests per level (with the mutation that proves each)

| # | Level · test | Mutation that turns it red |
| --- | --- | --- |
| P1 | Vitest · `realEstateOperationPlan.test.ts` «should count the mortgage beyond the residual as an excess, not a negative balance» (200.000 / 20.000 in the house / 190.000) | `purchaseBalance: residual` |
| P2 | Vitest · «should disburse an exceeding mortgage onto the house and the account in one step» — kinds `['createLoan', 'disburseMortgage', 'row:mortgageInstalments']`, `toProperty + toAccount === 190000` | push `adjustProperty` with the whole principal |
| P3 | Vitest · «should keep today's steps when the mortgage equals the residual» (180.000 → excess 0, no `row:balance`, `adjustProperty` 180.000) | `figures.mortgageExcess >= 0` |
| N1 | Vitest · `realEstateOperationNarrative.test.ts` — the existing test «should refuse a mortgage over what is left to pay, and a term over thirty years» (`:43-48`) is REWRITTEN as «should refuse a mortgage above the price, and a term over thirty years»: 120.000 on a price of 100.000 → «Il mutuo supera il prezzo della casa (100.000,00 €).»; 190.000 on 200.000 with 20.000 in the house → `null`; the 31-year line unchanged. It is the one existing test whose expectation changes | restore the old `:185` condition |
| N2 | Vitest · «should say that nothing leaves the account and where the excess lands» | drop the `mortgageExcess` branch of `describeBalance` |
| N2b | Vitest · «should ask where the excess lands»: `screenCopy('saldo', purchaseAnswers, 10000)` → the question «Su quale conto la banca accredita quanto avanza del mutuo?»; with `0` (and for a sale) today's questions | ignore the third argument |
| N3 | Vitest · `describePlanStep` of `disburseMortgage` names both amounts and the account | return the `adjustProperty` sentence |
| N4 | Vitest · «should name the first refusal among the run's screens»: `firstScreenRefusal` on a rogito with a 210.000 mortgage on 200.000 → the `mutuo` sentence; on the 190.000 case → `null` | return `null` always |
| S1 | Vitest · `realEstateOperationService.test.ts` (the file that already fakes `updateCashAssetBalancesAtomic`): the step calls it ONCE with the two deltas | two separate calls |
| S2 | Vitest · «should stop at the disbursement and say the loan landed»: `updateCashAssetBalancesAtomic` rejects once → `{ done: 1, failedAt: 1 }`, `createAsset` called once (the loan), and `describePlanStep(plan.steps[1], names)` starts «Il mutuo paga al venditore» (the pattern of `:125-132`) | swallow the error in the `case` |
| C1 | Playwright · `e2e/assets.compravendita.spec.ts`, two new serial tests APPENDED after the sale, on a second decoy house `HOUSE_2_NAME = 'Casa Fenicottero 2'` (its rows' notes contain `HOUSE_NAME`, so `ownRows` already collects them): a preliminare at 200.000 with a 20.000 deposit and no cost, then a rogito at 200.000 with a 190.000 mortgage and no cost → the summary lists «Il mutuo paga al venditore 180.000,00 €…» and no «Saldo al rogito» row; Firestore: house 200000, loan `quantity` 190000, account = its value before the rogito + 10000, and no expense row with `amount` 10000. `afterAll` deletes `HOUSE_2_NAME` and `Mutuo ${HOUSE_2_NAME}` too. The four existing tests and their figures are untouched | credit the account through an income row |

Fixture figures are invented and round (200.000, 20.000, 190.000); the owner's own case is never written. The P, N
and S tests use `makeContext({ assets: [ACCOUNT, asset({ id: 'deposit-house', name: 'Casa Airone', type:
'realestate', assetClass: 'realestate', quantity: 20000 })] })` with `propertyId: 'deposit-house'`,
`costCenter: { mode: 'none', name: '', existingId: '' }` and no costs, so the plan's kinds are exactly the ones
listed (the shared `HOUSE` of `__tests__/fixtures/realEstateOperation.ts` is worth 130.000).

## 7. Guided verification (WORKFLOW.md § 2)

Expected outcome, declared first: on the emulators, a house «Casa Fenicottero» with a 20.000 € deposit; a rogito at
200.000 € with a 190.000 € mortgage is accepted; the summary lists the disbursement sentence; after «Conferma» the
account shows +10.000 €, Cashflow shows no new income, Patrimonio's total is unchanged against the minute before.

- **A**: `tsc`, lint, Vitest (three zones), `npx playwright test e2e/assets.compravendita.spec.ts`, then
  `npm run perf:build` + `npm run perf:budget -- --dist=.next-perf` (criterion 9).
- **B**: emulators + seed + `dev:emulator`.
- **C (browser, the session)**: the run above at 1440 and 390; the `mutuo` screen with 210.000 € shows the refusal.
- **D (data)**: the three asset documents and the absence of an expense row, read in the emulator.
- **E (failure)**: proven by S2; in the browser, the Firestore emulator stopped before «Conferma» shows the
  partial-failure message naming step 1 (the loan), not the disbursement.
- **F (owner, at his «pronto»)**: on the mirror, his own rogito with his figures; `npm run mirror:remove` after.
- **G** (the two budgets close by README.md § 8's ONE rule, decisions 33 and 34): remove fixtures, mirror and scripts.

## 8. Putting it into service

One PR to `develop`. No data migration: no stored run is affected (a plan is built and executed in one sitting).

## 9. Documentation

- `doc/guide/compravendita.md` § the screens: «with a mortgage above the residual the `saldo` screen asks where
  the excess lands («Su quale conto la banca accredita quanto avanza del mutuo?», «Sul conto»)» (decision 40).
- `doc/guide/compravendita.md` § What a run writes, bullet «A purchase»: after «the net worth does not move», add
  «A mortgage up to the PRICE is accepted: what exceeds the residual (price − value today) is credited to the run's
  account in the same transaction that raises the house by the residual (`disburseMortgage`), without a row (owner,
  2026-11-12); above the price it is refused on «Mutuo».» § The executor: after «a loan closed with the price (the
  loan and the house in ONE transaction)» add «and for a mortgage's disbursement beyond the residual (the house and
  the account in ONE transaction)». § Files: «the four acts» → «the five acts» with the second house. § Per-page
  blind spots, two entries: the answer on the deposit (an advance on the price, whatever the bank; what depends on
  the bank is the loan-to-value base, the disbursement beyond the residual and the net disbursed amount); «the loan
  and its disbursement are two steps: a failure between them leaves the loan open and the house not raised, named by
  the partial-failure message». The summary's re-check (`firstScreenRefusal`) in § The path.
- `AGENTS.md` § Patrimonio › Compravendita, second bullet: «the mortgage's principal lands on the value when the
  loan opens (`adjustProperty`)» → «the mortgage's principal lands on the value when the loan opens
  (`adjustProperty`; beyond the residual, `disburseMortgage` credits the excess to the account, no row)».
- `doc/guide/e2e-playwright.md`: the two new tests in the Compravendita inventory.
- `README.md` (Compravendita): one sentence for the user.
- `CLAUDE.md` › «Latest», `Draft Release Temp.md`, `doc/nove/README.md` § 6.

## 10. Declared out of scope

- **The net disbursement** (imposta sostitutiva, istruttoria withheld by the bank): they stay cost rows the owner
  enters on the costs screen; no heir — the app records the principal as the debt, which is what is owed.
- **A sale whose buyer's mortgage exceeds the price**: not a case of the seller's books; no heir.
- **A mortgage with liquidity above the price**: refused by criterion 5; heir: none in this series, declared.

## 11. The prompt that implements it

```
Ciao, in questa sessione vorrei implementare la spec doc/nove/NOVE-04-compravendita-mutuo-oltre-il-residuo.md

Contesto, prima di toccare qualsiasi file (le regole del repo cambiano il modo di lavorare):
- Leggi WORKFLOW.md (regole di sessione e di collaudo; l'ultima sezione dice come si
  applicano in questo repo)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- CLAUDE.md (l'indice: che cos'è e dove sta ogni cosa, lo stato corrente) è già nel
  contesto: usalo per trovare la guida giusta
- Leggi la spec doc/nove/NOVE-04-compravendita-mutuo-oltre-il-residuo.md e l'indice della
  serie doc/nove/README.md (§ 3 decisioni, § 4 scelte adottate, § 7 contratti condivisi, § 8 regole)
- Leggi doc/guide/compravendita.md, doc/guide/patrimonio.md, doc/guide/storico.md e
  doc/guide/e2e-playwright.md PRIMA di scrivere codice in quel dominio
- Leggi DESIGN.md (The Conversation-Is-Content Rule) e PRODUCT.md: la schermata «saldo» cambia
- Leggi COMMENTS.md e DEVELOPMENT_GUIDELINES.md: il codice che scrivi li segue

Lancia npm audit e confrontalo con doc/guide/dipendenze.md (regola 8 di WORKFLOW.md).
Rispondimi in una riga: invariate dal <data>, oppure gli avvisi nuovi; quelli nuovi li
registriamo nella guida con una decisione, non si aggiorna nulla in questa sessione.

Prima della prima modifica: controlla il branch attivo (git branch --show-current) e crea
il branch di sessione da lì. Mai modificare un file sul branch di integrazione.

Crea SESSION_NOTES.md per tracciare il lavoro (non tracciato: a fine sessione si riversa
nei documenti e si cancella).

Ogni dubbio o scelta che spetta a me me la chiedi SUBITO con AskUserQuestion, una scelta
per domanda, a gruppi di quattro: mai un «da decidere» lasciato nel codice, nei documenti o
nel riassunto. Se serve un comando che solo io posso lanciare (produzione, un login
interattivo), dammelo una riga alla volta con l'esito atteso.

Implementa la spec così com'è scritta: mortgageExcess in figuresOf, il passo
disburseMortgage nel piano e nell'esecutore, il rifiuto su «saldo» tolto e quello su «mutuo»
sostituito dal tetto al prezzo, le frasi, il ricontrollo di ogni schermata prima di
«Conferma». I test PRIMA del codice, ciascuno visto rosso con la sua mutazione; cifre
inventate e tonde. Fermati e chiedimi se: diventa rosso un test esistente diverso da quello
che la spec riscrive (realEstateOperationNarrative.test.ts, il rifiuto del mutuo) e dalle due
chiamate di describeBalance che prendono il terzo argomento; perf:budget, misurato prima e dopo sulla stessa macchina, supera un tetto di più di 1 KB gz (fino a 1 KB lo alzi tu, con raisedBy e una riga in velocita.md § Registro). Collaudo: § 7, la F sul mirror al mio «pronto». Un branch, un
commit, solo dopo il mio OK con il riassunto del diff. SESSION_NOTES.md non si committa.
```

Model: **Sonnet 5.5**, effort **medium** — an M spec in one area, no schema change, every criterion closed by a test.
Estimated size: 1 session, ~2 h; ~40 lines of plan and executor, ~30 of narrative and wizard, ~200 of tests, two E2E tests.
