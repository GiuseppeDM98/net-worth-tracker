# Session 04 — Filter/Memo Optimization

## Obiettivo
Eliminare render extra causati dal pattern `useEffect + setState` usato per filtrare liste, convertendolo in `useMemo`. Rimuovere anche una duplicazione di `formatCurrency` inline.

## Scope
- `components/cashflow/ExpenseTrackingTab.tsx`
- `components/dividends/DividendTrackingTab.tsx`
- `components/expenses/ExpenseTable.tsx`

## Fix da applicare

### 1. ExpenseTrackingTab.tsx — `useEffect → useMemo`

**Problema**: Il componente usa un `useEffect` per applicare i filtri e aggiornare uno stato `filteredExpenses` (o simile). Ogni cambio ai filtri causa 2 render: uno per il cambio di stato del filtro, uno per il `useEffect` che aggiorna il risultato.

**Fix**: Eliminare lo `useState` per il risultato filtrato e lo `useEffect` corrispondente. Sostituire con `useMemo`:

```tsx
// PRIMA (pattern da eliminare)
const [filteredExpenses, setFilteredExpenses] = useState(expenses);
useEffect(() => {
  const filtered = expenses.filter(e => {
    // logica filtri
  });
  setFilteredExpenses(filtered);
}, [expenses, typeFilter, categoryFilter, startDate, endDate]);

// DOPO
const filteredExpenses = useMemo(() => {
  return expenses.filter(e => {
    // stessa logica filtri
  });
}, [expenses, typeFilter, categoryFilter, startDate, endDate]);
```

> **Importante**: Assicurarsi che `useMemo` sia importato da React. Non rimuovere altri `useEffect` che gestiscono side effects diversi (es. reset del drill-down, caricamento dati).

### 2. DividendTrackingTab.tsx — `useEffect → useMemo`

Stesso pattern di ExpenseTrackingTab. Cercare `setFilteredDividends` dentro un `useEffect` e convertire in `useMemo`.

**Attenzione al pattern del progetto** (da AGENTS.md / MEMORY.md):
> "Always reset drill-down state when filters change to prevent stale data"

Se esiste un `useEffect` che resetta lo stato di drill-down quando i filtri cambiano, **non rimuoverlo** — quel side effect è necessario. Solo il `useEffect` che calcola `filteredDividends` va convertito in `useMemo`.

### 3. ExpenseTable.tsx — Rimuovere `formatCurrency` inline

**Problema**: `formatCurrency` è ridefinita come funzione locale nel componente (~riga 76) invece di usare l'import dalla utility condivisa.

**Fix**:
1. Verificare se `formatCurrency` è già importata da `@/lib/utils/formatters`
2. Se no, aggiungere l'import: `import { formatCurrency } from '@/lib/utils/formatters'`
3. Rimuovere la definizione locale inline

> **Nota**: Verificare che la signature e il comportamento della versione locale corrispondano a quella di `formatters.ts`. Se ci sono differenze (es. numero di decimali, locale), documentarle nel commit message.

## Perché questo importa

Il pattern `useEffect + setState` per derivare dati crea:
1. Un render extra ad ogni cambio di filtro (stato intermedio "stale")
2. Possibili flash visivi se il filtro è pesante
3. Complessità inutile (stato che è puramente derivato da altri stati)

`useMemo` elimina lo stato intermedio e garantisce che il valore filtrato sia sempre in sync con le dipendenze, senza render extra.

## Verifica
1. Testare il filtering in ExpenseTrackingTab — deve funzionare identicamente
2. Testare il filtering in DividendTrackingTab — stessa cosa
3. Testare ExpenseTable — le cifre devono essere formattate allo stesso modo
4. React DevTools Profiler: verificare che il numero di render per cambio filtro sia diminuito di 1
5. `npm test` deve passare (i test unitari non coprono questi componenti direttamente)

---

## Prompt per Claude

```
Leggi AGENTS.md, CLAUDE.md e COMMENTS.md prima di iniziare.

Stai lavorando su: Session 04 — Filter/Memo Optimization
Leggi il file docs/sessions/session-04-filter-memo-optimization.md per le specifiche complete.

File target:
- components/cashflow/ExpenseTrackingTab.tsx
- components/dividends/DividendTrackingTab.tsx
- components/expenses/ExpenseTable.tsx

Fix 1 + 2: In ExpenseTrackingTab e DividendTrackingTab, trova il pattern useEffect + setState usato per calcolare la lista filtrata (cerca setFilteredExpenses / setFilteredDividends dentro un useEffect). Convertilo in useMemo con le stesse dipendenze ed elimina lo useState per il risultato filtrato.
ATTENZIONE: Non rimuovere altri useEffect che gestiscono side effects reali (reset drill-down, caricamento dati async, ecc.). Solo il useEffect che calcola dati derivati da stato già presente.

Fix 3: In ExpenseTable.tsx, cerca formatCurrency definita come funzione locale (~riga 76). Sostituiscila con l'import da @/lib/utils/formatters. Verifica che il comportamento sia identico prima di rimuovere la versione locale.

Dopo le modifiche aggiorna SESSION_NOTES.md con le righe della tabella Session 4.
Alla fine esegui npm test e dimmi che test devo fare per ciò che hai implementato in questa sessione.
```
