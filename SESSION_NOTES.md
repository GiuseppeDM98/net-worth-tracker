# SESSION NOTES — 2026-03-12

## Feature: Category Deep Dive nel Budget Tab (Vista Annuale)

### Obiettivo
Aggiungere drill-down storico multi-anno al tab Budget: click su riga categoria → pannello
"Analisi Storica" con tabella Anno × Mese per tutti gli anni disponibili.

### Branch
`claude/add-annual-budget-page-FaFsJ`

### File modificati
- `components/cashflow/BudgetTab.tsx` — unico file

### Approccio
- Stato `selectedItemKey: string | null` per tracciare la riga selezionata
- `deepDiveData` useMemo che calcola anni × mesi usando `getActualForItem` / `getMonthlyActualsForItem`
- Righe tabella annuale rese clickabili (toggle, con chevron indicator)
- Componente `CategoryDeepDive` inline (no modal, pattern CurrentYearTab)
- Auto-scroll al pannello all'apertura
- Reset su edit mode

### Status
- [x] Branch setup
- [x] SESSION_NOTES.md creato
- [x] Implementazione BudgetTab.tsx
- [x] Commit + push

### Dettaglio modifiche BudgetTab.tsx
1. Import aggiunti: `getActualForItem`, `getMonthlyActualsForItem` da budgetUtils; `ChevronRight` da lucide-react
2. Stato aggiunto: `selectedItemKey: string | null` (linea ~240)
3. Reset in `handleStartEditing()` + al cambio view mode → 'monthly'
4. useEffect auto-scroll con 100ms delay (pattern CurrentYearTab)
5. `deepDiveData` useMemo: calcola righe anno×mese per item selezionato
6. Righe item `AnnualTable()`: clickabili, highlight blu se selezionate, chevron right/down indicator
7. Componente `CategoryDeepDive()`: tabella con scroll orizzontale, anni inversi, mesi futuri grigi, vs Budget colorato
8. Render: `CategoryDeepDive` sotto la Card della tabella annuale; nota in footer

---

## Riepilogo sessione

### Cosa
1. **Deep dive storico per categoria** — click su riga nella tabella annuale apre un pannello "Analisi Storica" con tabella Anno × Gen…Dic per tutti gli anni disponibili (da `historyStartYear` a `currentYear`). Anno corrente evidenziato in blu, mesi futuri grigi, colonna "vs Budget %" colorata. Toggle: stessa riga richiude, riga diversa cambia target.

2. **Highlight min/max mese** — nel pannello deep dive, per ogni anno-riga il mese con la spesa più alta è evidenziato in rosso (verde per Entrate) e il mese con la spesa più bassa in verde (rosso per Entrate). Guard: nessun highlight se meno di 2 mesi reali o tutti uguali.

3. **Rimozione vista mensile** — eliminati `MonthlyCharts`, il toggle Annuale/Mensile, tutti gli import recharts e `BudgetViewMode`. Il dettaglio mensile è ora coperto interamente dal deep dive, che offre più contesto (tutti gli anni invece del solo corrente).

### Perché
- Il deep dive copre lo stesso bisogno informativo della vista mensile con più ricchezza: si vedono i pattern stagionali su tutti gli anni in un'unica tabella compatta, senza dover scorrere tra view diverse.
- L'highlight min/max rende immediatamente leggibile quale mese pesa di più/meno senza dover analizzare i numeri manualmente.
- Rimuovere la vista mensile riduce la surface UI (meno toggle, meno scroll) e il bundle JS (-recharts dal componente).

### Gotcha e dettagli importanti
- `monthlyAmount` può essere **user-set** (salvato in Firestore) oppure **auto-calcolato** come `previousYearTotal / 12` tramite `getDefaultMonthlyAmount()`. L'UI non distingue i due casi — la colonna "Budget/anno" e la progress bar si basano su questo valore in entrambi i casi. Se l'utente non ha mai aperto il pannello Modifica, il "budget" è di fatto la media dell'anno scorso, non un obiettivo deliberato.
- Il deep dive usa `getActualForItem` / `getMonthlyActualsForItem` già esportate da `budgetUtils.ts` — zero logica nuova, solo rendering.
- `currentMonth` da `getItalyMonth()` è 1-based (1=Gen, 12=Dic). Nei loop sugli array mensili (0-based) il confronto corretto è `i >= currentMonth` per identificare i mesi futuri.
- `budgetItemKey(item)` è usato come chiave stabile per `selectedItemKey` — è lo stesso identificatore usato altrove nel tab, quindi non c'è rischio di desync tra stato e dati.
- Auto-scroll con 100ms delay: segue il pattern di `CurrentYearTab.tsx` per dare tempo al DOM di renderizzare il pannello prima di `scrollIntoView`.
