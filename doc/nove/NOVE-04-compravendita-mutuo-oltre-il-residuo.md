# NOVE-04 — Compravendita: a mortgage larger than what is left to pay

> Series `doc/nove/` (README.md § 5): **depends on nothing**. Written on 2026-11-12; every `file:line` is cited on
> `develop` @ b841cbd7. Executes the owner's point 7 and decision 2 (README.md § 3).

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

- `:177` (screen `saldo`): «Caparre e mutuo superano il prezzo di 10.000 €: controlla gli importi.»
- `:185` (screen `mutuo`): «Il mutuo supera quanto resta da pagare della casa (180.000 €).»

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
5. A mortgage above the price is refused on the `mutuo` screen: «Il mutuo supera il prezzo della casa (200.000 €).»
   **Proof**: `realEstateOperationNarrative.test.ts` N1.
6. The `saldo` screen and the summary say it in one sentence: «Dal conto non esce nulla: il mutuo copre quanto resta
   del prezzo e avanzano 10.000 €, che la banca accredita su {conto}.» **Proof**: N2; the summary's step sentence N3.
7. The net worth does not move by the excess: +200.000 house, −190.000 loan, +10.000 account, −20.000 already moved
   at the preliminare. **Proof**: C1 reads the three assets.

## 3. Decisions

- **Owner 2 (2026-11-12)**: accept the mortgage above the residual; the excess goes on the ACCOUNT'S BALANCE, WITHOUT
  a cashflow row; the summary says it in one sentence.
- **Adopted, reversible**:
  - the cap is the price: a mortgage above the price is refused (a loan larger than the purchase is a different
    product — a mutuo with liquidity — and is not a Compravendita);
  - property and account move in ONE Firestore transaction (the `payOffWithSale` precedent,
    `lib/services/realEstateOperationService.ts:157-164`);
  - the account credited is the run's account (`answers.accountId`), the one the `saldo` screen already asks.
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

- `describeBalance` (`:252`) takes the account's name and says the excess. Signature (contract, README.md § 7 is not
  involved: one caller, `CompravenditaScreens.tsx`, `saldo`):

```ts
export function describeBalance(answers: RealEstateOperationAnswers, context: RealEstatePlanContext, accountName: string): string {
  …
  if (figures.mortgageExcess > 0) {
    return `Dal conto non esce nulla: il mutuo copre quanto resta del prezzo e avanzano ${eur(figures.mortgageExcess)}, che la banca accredita su ${accountName}.`;
  }
```

  `accountName` is the name of `answers.accountId` in `context.assets` («il conto» when not chosen yet); the caller
  resolves it with the same lookup the summary's `PlanNames` uses.
- `describePlanStep` gains:

```ts
    case 'disburseMortgage':
      return `Il mutuo paga al venditore ${eur(step.toProperty)}, che diventano valore di ${names.propertyName}; i ${eur(step.toAccount)} che avanzano entrano su ${refName({ id: step.accountId }, names)}. Nessuna entrata: è debito, non reddito.`;
```

### `components/assets/compravendita/CompravenditaScreens.tsx`

The `saldo` screen passes the account's name to `describeBalance`; nothing else changes (the account selector is
already on that screen and already required: «Scegli il conto.»).

## 5. Constraints and traps (AGENTS.md / repo rules, «here it means that»)

- **Money in cents**: every new figure goes through `roundToCents` (`lib/utils/cents.ts`); `toProperty + toAccount
  === principal` to the cent (P2 asserts it).
- **A debt is a `loan` asset worth minus its principal** (2026-10-10): the loan is created with the FULL principal;
  the excess is cash the owner holds against that debt — the net worth is unchanged by it.
- **No cashflow row for the excess**: it is neither income nor a transfer between two of the owner's accounts; the
  savings rate, Analisi and the Driver's `netSavings` do not see it. The Driver reads it as debt that rose and cash
  that rose: `debtRepaid` falls by the principal and the house's and the account's values rise — the month's `other`
  absorbs nothing because the three snapshot rows move together (doc/guide/storico.md § Driver).
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
| N1 | Vitest · `realEstateOperationNarrative.test.ts` «should refuse a mortgage above the price» / accept 190.000 on 200.000 | restore the old `:185` condition |
| N2 | Vitest · «should say that nothing leaves the account and where the excess lands» | drop the `mortgageExcess` branch of `describeBalance` |
| N3 | Vitest · `describePlanStep` of `disburseMortgage` names both amounts and the account | return the `adjustProperty` sentence |
| S1 | Vitest · `realEstateOperationService.test.ts` (the file that already fakes `updateCashAssetBalancesAtomic`): the step calls it ONCE with the two deltas | two separate calls |
| C1 | Playwright · `e2e/assets.compravendita.spec.ts`, a new serial test after the preliminare: rogito with a mortgage 10.000 above the residual → Firestore: property = price, loan = −principal, account +10.000, no expense row whose amount is 10.000 | credit the account through an income row |

Fixture figures are invented and round (200.000, 20.000, 190.000); the owner's own case is never written.

## 7. Guided verification (WORKFLOW.md § 2)

Expected outcome, declared first: on the emulators, a house «Casa Fenicottero» with a 20.000 € deposit; a rogito at
200.000 € with a 190.000 € mortgage is accepted; the summary lists the disbursement sentence; after «Conferma» the
account shows +10.000 €, Cashflow shows no new income, Patrimonio's total is unchanged against the minute before.

- **A**: `tsc`, lint, Vitest (three zones), `npx playwright test e2e/assets.compravendita.spec.ts`.
- **B**: emulators + seed + `dev:emulator`.
- **C (browser, the session)**: the run above at 1440 and 390; the `mutuo` screen with 210.000 € shows the refusal.
- **D (data)**: the three asset documents and the absence of an expense row, read in the emulator.
- **E (failure)**: stop the Firestore emulator before «Conferma» → the partial-failure message names the step.
- **F (owner, at his «pronto»)**: on the mirror, his own rogito with his figures; `npm run mirror:remove` after.
- **G**: remove fixtures, mirror and scripts.

## 8. Putting it into service

One PR to `develop`. No data migration: no stored run is affected (a plan is built and executed in one sitting).

## 9. Documentation

- `doc/guide/compravendita.md`: § the rogito — the rule «a mortgage up to the price; what exceeds the residual is
  credited to the run's account in the same transaction as the house, without a row (owner, 2026-11-12)»; the answer
  on the deposit (advance on the price; what depends on the bank) as a short «Per-page blind spots» entry.
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
- Leggi doc/guide/compravendita.md, doc/guide/patrimonio.md e doc/guide/e2e-playwright.md
  PRIMA di scrivere codice in quel dominio
- Leggi DESIGN.md (The Modal-Is-A-Tile Rule) e PRODUCT.md: la schermata «saldo» cambia una frase
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
disburseMortgage nel piano e nell'esecutore, i due rifiuti sostituiti dal tetto al prezzo,
le tre frasi. I test PRIMA del codice, ciascuno visto rosso con la sua mutazione; cifre
inventate e tonde. Fermati e chiedimi se un test esistente del piano o della spec
Playwright diventa rosso. Collaudo: § 7, la F sul mirror al mio «pronto». Un branch, un
commit, solo dopo il mio OK con il riassunto del diff. SESSION_NOTES.md non si committa.
```

Model: **Sonnet 5.5**, effort **medium** — an M spec in one area, no schema change, every criterion closed by a test.
Estimated size: 1 session, ~2 h; ~40 lines of plan and executor, ~15 of narrative, ~150 of tests, one E2E test.
