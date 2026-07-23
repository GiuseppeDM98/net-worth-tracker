# Import CSV storico entrate/spese — Spec

> Status: **SPEC — port dal fork `Ciocc128`, adattata al branch** (2026-07-22). Feature additiva,
> tocca solo Cashflow; **zero interazione con `asset-transactions`**. Riferimento fedele:
> `ciocc/main:lib/utils/expenseImport.ts`, `lib/services/expenseImportService.ts`,
> `components/settings/ExpenseImportSection.tsx`, `types/expenseImport.ts`.

## Obiettivo

Importare uno storico di entrate/spese da CSV, con **anteprima** (cosa verrà scritto, quali
categorie/sottocategorie create, cosa rifiutato) prima di toccare Firestore, e **undo** dell'intero
batch. Il layer parse/plan è **puro e testato**; il commit/undo è nel service.

## Decisioni fissate

1. **`transfer` escluso dall'import** (`ImportableExpenseType = Exclude<ExpenseType,'transfer'>`): un
   transfer richiede conti di origine/destinazione per riconciliare i saldi, che una riga CSV storica
   non può fornire. Le righe transfer diventano `RowError` (skip), non voci inerti.
2. **Anteprima obbligatoria**: `buildImportPlan` produce un piano completo (valide/errori/categorie
   da creare/summary) prima del commit. Nessuna scrittura al volo.
3. **Undo per batch**: ogni `Expense` importato porta un `importBatchId`; l'undo cancella per batch.
4. **Categorie via `getAllCategories` + filtro in memoria**, MAI `getCategoriesByType` (richiede un
   indice composito non deployato — gotcha del fork/AGENTS).

## 1. Tipi — `types/expenseImport.ts`

Rif. fork (riportare integralmente): `ImportableExpenseType`, `RawRow`, `PlannedExpenseRow`,
`RowError`, `CategoryToCreate`, `SubCategoryToCreate`, `ImportSummary`, `ImportPlan`.

## 2. Layer puro — `lib/utils/expenseImport.ts` (zero Firebase)

```ts
export const TEMPLATE_HEADERS = ['data','importo','tipo','categoria','sottocategoria','note','valuta'] as const;
export function buildTemplateCsv(): string;
export function parseItalianNumber(input: string): number | null;   // "1.234,56" → 1234.56
export function parseFlexibleDate(input: string): Date | null;       // dd/mm/yyyy, yyyy-mm-dd, …
export function parseImportCsv(raw: string): RawRow[];               // header normalize IT/EN → RawRow[]
export function buildImportPlan(rows: RawRow[], existingCategories: ExpenseCategory[]): ImportPlan;
```

`buildImportPlan`: valida ogni riga (data/importo/tipo), risolve categoria/sottocategoria contro le
esistenti, accumula quelle da creare, marca gli errori (riga transfer → skip con motivo), e produce
`ImportSummary` (conteggi, totali entrate/spese, range date). `amount` = magnitudine positiva; il
segno si applica al commit dal `type`.

Test `__tests__/expenseImport.test.ts` (rif. fork): numeri IT/EN, date multi-formato, header IT/EN,
riga transfer → error, categoria nuova vs esistente, sottocategoria nuova su categoria esistente,
summary corretto, riga malformata → error con `line`.

## 3. Service — `lib/services/expenseImportService.ts`

```ts
export async function commitImportPlan(
  userId: string, plan: ImportPlan, existingCategories: ExpenseCategory[]
): Promise<{ importBatchId: string; created: number }>
export async function deleteExpensesByImportBatch(userId: string, importBatchId: string): Promise<number>
```

- `commitImportPlan`: (1) crea le categorie/sottocategorie mancanti (`categoriesToCreate` /
  `subCategoriesToCreate`); (2) genera un `importBatchId`; (3) scrive ogni `PlannedExpenseRow` come
  `Expense` (segno da `type`, `importBatchId` stampato) via il path esistente (`createExpense` o batch
  writes ≤400/batch). `removeUndefinedDeep` prima di ogni write.
- `deleteExpensesByImportBatch`: query `where('userId','==',userId) + where('importBatchId','==',id)`,
  cancella in batch, ritorna il conteggio.
- `types/expenses.ts`: `Expense` (+ `ExpenseFormData` se necessario) guadagna `importBatchId?: string`.
  Additivo, opzionale — nessun impatto sui consumer esistenti.

## 4. UI — `components/settings/ExpenseImportSection.tsx`

Sezione in Impostazioni (`app/dashboard/settings/page.tsx`). Fasi (`useState<Phase>`):
`idle → preview → committing → done`, con **undo** dopo il commit.
- `idle`: upload CSV + link "Scarica template" (`buildTemplateCsv`).
- Al file: `parseImportCsv` → `buildImportPlan(rows, categories)` → `preview` (tile summary:
  valide/skippate/nuove categorie/totali/range date; lista errori con numero riga).
- `preview`: bottone "Importa {N} voci" → `commitImportPlan` → `done` con `{importBatchId, created}`.
- `done`: bottone "Annulla import" → `deleteExpensesByImportBatch` → torna a `idle`.
- Demo-gated (`useDemoMode`, `disabled={isDemo}` + aria-label). Owner-scoped (`ownerId` da
  `useActiveAccount`; le categorie e gli expense sono owner-scoped). `onImported` invalida le query
  Cashflow (expenses + categorie + `dashboard.overview`).

## 5. Interazione con `asset-transactions`
Nessuna: l'import scrive solo `Expense`/categorie (Cashflow). Non tocca asset, registro operazioni,
né saldi cash (le righe transfer sono escluse — decisione 1). Ortogonale.

## 6. Prompt di implementazione

> *Sonnet 5 alto.* Additiva. Può girare in qualunque momento (non richiede asset-transactions, ma le
> convenzioni del repo sì).
```text
Implementa la feature "Import CSV storico entrate/spese". Leggi: docs/specs/5-expense-csv-import.md
(INTEGRALE), AGENTS.md (getAllCategories non getCategoriesByType, Firestore batch ≤400,
removeUndefinedDeep, Private Data Isolation, demo mode), DESIGN.md. Riferimento:
ciocc/main:lib/utils/expenseImport.ts, lib/services/expenseImportService.ts,
components/settings/ExpenseImportSection.tsx, types/expenseImport.ts.
Scope ESATTO: types/expenseImport.ts; lib/utils/expenseImport.ts (parse/plan puro) +
__tests__/expenseImport.test.ts; Expense += importBatchId?; lib/services/expenseImportService.ts
(commitImportPlan crea categorie mancanti + scrive con importBatchId; deleteExpensesByImportBatch);
ExpenseImportSection in Impostazioni (fasi idle/preview/committing/done + undo, demo-gated,
owner-scoped, invalidazione Cashflow). transfer escluso (skip con motivo). Categorie via getAllCategories.
Gate: npx tsc --noEmit + vitest expenseImport + build. FERMATI, SESSION_NOTES, COSA/COME testare,
ATTENDI conferma. Branch: feature/expense-csv-import; PR develop.
```
