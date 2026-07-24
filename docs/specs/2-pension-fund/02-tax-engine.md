# 02 — Motore fiscale (puro, testato)

> Status: **✅ IMPLEMENTATA (Fase P0, 2026-07-24).** `lib/utils/pensionDeduction.ts` (§1-5, zero
> import Firebase, `taxOf` iniettato) + `__tests__/pensionDeduction.test.ts` (§6: tutti i 18 casi
> della matrice, più un test di invariante `isLedgerAssetType('pensionFund') === false` → 19 verdi;
> `tsc` pulito). Nella stessa fase è stata implementata anche la **spec 01 §1-2** (`types/pension.ts`,
> `AssetType 'pensionFund'`, `Asset/AssetFormData.pensionFundDetails`, `TYPE_TO_CLASS`); la spec 01
> §3-6 (collection, rules, indici, validazione) resta a P1. Vedi CLAUDE.md → Current Status e
> AGENTS.md → *Fondo Pensione — Tipi + Motore Fiscale (P0)*. Restano P1 (contributi), P2 (UI),
> P3 (integrazioni).
>
> **Caveat d'uso deciso con l'owner (D-P0.2)**: i contributi storici NON vengono tracciati — si parte
> a registrare da ora. La deduzione ordinaria (§2, path base) è per-anno e resta corretta; il fold
> dell'extra-deducibilità invece tratta gli anni mancanti come *0 versato*, quindi accrediterebbe il
> plafond massimo a chi ha davvero versato in passato. Perciò **`isFirstEmploymentPost2007` va tenuto
> OFF** finché non esiste uno storico. Se in futuro servisse l'extra-deducibilità, la via è un
> "plafond iniziale" da estratto conto — non il back-fill degli anni — e cambia la firma di
> `PensionDeductionInput` (§2), quindi va deciso **prima di P1**.

Nuovo modulo **`lib/utils/pensionDeduction.ts`** + test **`__tests__/pensionDeduction.test.ts`**.
Riferimento fedele: `ciocc/main:lib/utils/pensionDeduction.ts` (già ottimo — riportarlo quasi
integralmente). Vincoli: **zero import Firebase**, `taxOf` iniettato, tetti come funzione-soglia.

## 1. Costanti (mai magic number ai call site)

```ts
export const PENSION_DEDUCTION_CEILING_LEGACY = 5164.57;   // ≤ 2025
export const PENSION_DEDUCTION_CEILING_2026   = 5300;      // ≥ 2026 (Legge di Bilancio 2026)
export const PENSION_ACCRUAL_YEARS = 5;                    // finestra accumulo plafond
export const PENSION_USAGE_YEARS   = 20;                   // finestra utilizzo (anni 6..25)

export const PENSION_BENEFIT_TAX_RATE_MAX = 15;
export const PENSION_BENEFIT_TAX_RATE_MIN = 9;
export const PENSION_BENEFIT_TAX_DECREASE_AFTER_YEAR = 15;
export const PENSION_BENEFIT_TAX_DECREASE_PER_YEAR   = 0.3;

export function getPensionDeductionCeiling(year: number): number;   // year>=2026 ? 5300 : 5164.57
export function getPensionExtraDeductionCap(year: number): number;  // ceiling(year) / 2  (2650 dal 2026)
```

Aggiungere un ramo a `getPensionDeductionCeiling` è l'UNICO punto da toccare a un futuro cambio di
legge.

## 2. Deducibilità ordinaria + extra-deducibilità — `computePensionDeductionState`

```ts
export function computePensionDeductionState(input: PensionDeductionInput): PensionDeductionState
```

Due meccanismi in uno (art. 8 c.6 D.Lgs. 252/2005):

**Ordinaria (stateless, singolo anno)**: `deducted = min(contribThisYear, ceiling(targetYear))`.
Path base quando `!isFirstJobPost2007` o `targetYear < enrollmentYear` → ritorna subito.

**Extra-deducibilità (stateful, fold pluriennale)** — solo prima occupazione post-2007:
- Finestre: `accrualStart = enrollmentYear`, `accrualEnd = enrollmentYear + 4` (5 anni inclusivi);
  `usageStart = accrualEnd + 1`, `usageEnd = usageStart + 19` (20 anni, cioè anni 6..25).
- **Replay** di ogni anno COMPLETO prima di `targetYear` per ottenere il `bank` in ingresso:
  ```
  bank = 0
  for year = accrualStart .. targetYear-1:
    if year > usageEnd: bank = 0; continue           // finestra chiusa → plafond perso
    ceiling = getPensionDeductionCeiling(year)
    contrib = max(0, deductibleContribByYear[year] ?? 0)
    if year <= accrualEnd:  bank += max(0, ceiling − contrib)                       // accumulo
    else:                                                                            // utilizzo
      extraUsed = min(bank, getPensionExtraDeductionCap(year), max(0, contrib − ceiling))
      bank -= extraUsed
  ```
- **Anno target** contro il bank in ingresso:
  - `targetYear > usageEnd` → `accruedPlafondResidual = 0` (finestra chiusa).
  - anno di accumulo → `plafondCreatedThisYear = max(0, ceiling − contribThisYear)`;
    `accruedPlafondResidual = bank + plafondCreatedThisYear`.
  - anno di utilizzo → `extraAvailableThisYear = min(bank, cap(targetYear))`;
    `extraUsed = min(extraAvailableThisYear, max(0, contribThisYear − ceiling))`;
    `accruedPlafondResidual = bank − extraUsed`.
- `effectiveCeiling = ceiling + extraAvailableThisYear`;
  `deductedThisYear = min(contribThisYear, effectiveCeiling)`.

Output `PensionDeductionState`: `ordinaryCeiling`, `deductibleContributions`,
`plafondCreatedThisYear`, `accruedPlafondResidual`, `extraAvailableThisYear`, `effectiveCeiling`,
`deductedThisYear`, `isAccrualYear`, `isUsageYear`. (Firme e semantica identiche al fork.)

## 3. Beneficio IRPEF — `computePensionTaxBenefit`

```ts
export function computePensionTaxBenefit(
  deductedAmount: number, annualGrossIncome: number, taxOf: (income: number) => number
): number
// 0 se deductedAmount<=0 o RAL<=0; altrimenti max(0, taxOf(RAL) − taxOf(max(0, RAL − deducted)))
```

`taxOf` iniettato: il caller passa `(income) => calculateProgressiveTax(income, brackets)` con i
`CoastFireTaxBracket` già esistenti (default 23/25/35/43). Corretto anche se la deduzione attraversa
due scaglioni. **Questo modulo non importa il motore Coast FIRE** (dependency inversion).

## 4. Aliquota di prestazione — `deriveBenefitTaxRate`

```ts
export function deriveBenefitTaxRate(yearsEnrolled: number): number
// 15% fino a 15 anni; −0,30 p.p./anno oltre il 15°; clamp [9,15] (9% a 35 anni)
```

## 5. Wrapper recap — `computePensionTaxRecap`

```ts
export interface PensionTaxRecap { state: PensionDeductionState; taxSaving: number }
export function computePensionTaxRecap(
  input: PensionDeductionInput, annualGrossIncome: number, taxOf: (income: number) => number
): PensionTaxRecap
// state = computePensionDeductionState(input); taxSaving = computePensionTaxBenefit(state.deductedThisYear, RAL, taxOf)
```

Le tre cifre della vista Previdenza (spec 04 §4) mappano su: `taxSaving` (risparmio dell'anno),
`state.plafondCreatedThisYear` (plafond creato quest'anno), `state.accruedPlafondResidual` (bank
residuo).

## 6. Matrice di test — `__tests__/pensionDeduction.test.ts`

AAA, nomi a frase, `toBeCloseTo` per i float. Casi richiesti:

**Tetto per-anno**
1. `getPensionDeductionCeiling`: 2024→5164.57, 2025→5164.57, 2026→5300, 2030→5300.
2. `getPensionExtraDeductionCap`: 2025→2582.285, 2026→2650.

**Ordinaria**
3. worker non-post-2007: `deducted = min(contrib, ceiling)`, nessun plafond, stato base.
4. contributi sotto il tetto: `deducted = contrib`.
5. contributi sopra il tetto (no eleggibilità extra): `deducted = ceiling`.
6. `targetYear < enrollmentYear`: path base, tutto zero salvo ordinaryCeiling.

**Extra-deducibilità (fold)**
7. eleggibile, anno di accumulo con contributi < tetto: `plafondCreatedThisYear = ceiling − contrib`,
   `accruedPlafondResidual` include l'anno corrente, `isAccrualYear=true`.
8. eleggibile, 5 anni di solo datoriale sotto il tetto → `accruedPlafondResidual` = somma dei 5
   `max(0, ceiling_y − contrib_y)` con i tetti per-anno corretti (mix 5164.57/5300 se attraversa il 2026).
9. anno di utilizzo, contributi che superano il tetto ordinario: `extraAvailableThisYear = min(bank, cap)`,
   `extraUsed`, bank ridotto, `deducted = min(contrib, effectiveCeiling)`.
10. anno di utilizzo ma contributi ≤ tetto ordinario: `extraUsed = 0` (l'extra si attinge solo oltre
    il tetto), bank invariato, `deducted = contrib`.
11. cap annuo dell'extra rispettato: bank grande ma `extraAvailableThisYear ≤ cap(year)`.
12. `targetYear > usageEnd`: `accruedPlafondResidual = 0`, nessun extra.
13. determinismo del fold: `deductibleContribByYear` con anni mancanti trattati come 0.

**Beneficio + aliquota**
14. `computePensionTaxBenefit`: deduzione dentro un solo scaglione → `deducted × aliquota`.
15. deduzione a cavallo di due scaglioni → differenza corretta delle due `taxOf`.
16. RAL 0 → beneficio 0 ma `state` comunque calcolato.
17. `deriveBenefitTaxRate`: 10→15, 15→15, 25→12, 35→9, 40→9, −1→15.

**Recap**
18. `computePensionTaxRecap` combina stato + saving in un colpo, coerente con le funzioni singole.

---

## 7. Prompt di implementazione — FASE P0

> **Modello: Opus 4.8, effort xhigh.** Correttezza fiscale: un errore nel fold si propaga a ogni
> cifra della vista Previdenza.

```text
Implementa la FASE P0 della feature "Fondo Pensione" di questo repo.
Prerequisito: la feature "asset-transactions" è mergiata (verifica che esista
lib/utils/assetTransactionUtils.ts e che LEDGER_ASSET_TYPES NON contenga i fondi). Se manca, fermati e dillo.

Contesto obbligatorio — leggi TUTTO prima di scrivere:
- docs/specs/README.md (decisioni di riconciliazione D1-D5)
- docs/specs/2-pension-fund/README.md (decisioni fissate, invarianti)
- docs/specs/2-pension-fund/01-data-model-and-rules.md — §1 (types/pension.ts) e §2 (AssetType 'pensionFund')
- docs/specs/2-pension-fund/02-tax-engine.md — INTEGRALE
- AGENTS.md, CLAUDE.md; COMMENTS.md e DEVELOPMENT_GUIDELINES.md APPLICATI mentre scrivi.
Riferimento codice: ciocc/main:types/pension.ts e ciocc/main:lib/utils/pensionDeduction.ts
(remote 'ciocc' già aggiunto; `git show ciocc/main:<path>`). Riusa quel codice, adattando
AssetType 'pension' → 'pensionFund'.

Scope ESATTO:
1. types/pension.ts (spec 01 §1): PensionContributionNature/ContributionSource, isDeductibleSource,
   PensionContribution, PensionFundDetails, PensionDeductionInput/State, con i checklist-comment.
2. types/assets.ts (spec 01 §2): AssetType += 'pensionFund' (NIENTE nuova AssetClass), Asset e
   AssetFormData += pensionFundDetails?, TYPE_TO_CLASS['pensionFund']='equity' (Why-comment),
   verifica isLedgerAssetType('pensionFund')===false.
3. lib/utils/pensionDeduction.ts (spec 02 §1-5): costanti, getPensionDeductionCeiling/Cap,
   computePensionDeductionState (fold accumulo/drawdown/scadenza), computePensionTaxBenefit (taxOf
   iniettato), deriveBenefitTaxRate, computePensionTaxRecap. Zero import Firebase.
4. __tests__/pensionDeduction.test.ts con TUTTI i 18 casi della matrice §6.

Gate di uscita: npx tsc --noEmit pulito + npx vitest run __tests__/pensionDeduction.test.ts verde.
A fine lavoro: FERMATI. Aggiorna SESSION_NOTES.md, riepiloga e dimmi COSA e COME testare, poi ATTENDI
conferma esplicita prima di ogni commit. Branch: feature/pension-fund-p0; PR verso develop.
```
