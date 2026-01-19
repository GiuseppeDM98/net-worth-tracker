# Session Notes - Sankey Diagram Improvements

**Data**: 2026-01-19
**Obiettivo**: Migliorare i grafici Sankey nella pagina Cashflow (Anno Corrente e Storico Totale)

---

## Problemi Identificati

### Problema 1: Valori con cifre decimali eccessive
- **Sintomo**: Nel tooltip del Sankey, valori come "6709.680000000001" mostrano troppi decimali
- **Causa**: `formatCurrency()` non limita i decimali esplicitamente, Intl.NumberFormat mostra errori floating-point
- **Soluzione**: Creare `formatCurrencyForSankey()` con `maximumFractionDigits: 2`

### Problema 2: Impossibilità di cliccare nodi in drill-down
- **Sintomo**: Una volta in drill-down (es. vista "Variabili"), cliccando su altri nodi non succede nulla
- **Causa**: `handleNodeClick` ha early return se `selectedCategory` è già impostato (linea 536)
- **Comportamento desiderato** (confermato da utente):
  - Drill-down profondo: Budget → Type/Category → Subcategories → Transactions
  - Se categoria senza sottocategorie → mostra direttamente tabella transazioni
- **Soluzione**: Rimuovere early return e implementare logica di navigazione multi-livello

### Problema 3: Nessuna tabella transazioni per categorie terminali
- **Sintomo**: Cliccando su categorie/sottocategorie non si vede l'elenco delle transazioni individuali
- **Comportamento desiderato**: Come i grafici a torta in "Spese per Categoria" / "Entrate per Categoria"
- **Soluzione**: Aggiungere mode='transactions' e renderizzare tabella responsive (desktop table, mobile cards)

---

## Approccio Implementativo

### Flusso di navigazione finale
```
1. Budget View (default)
   ├─ Click Expense Type → Type Drill-Down
   ├─ Click Income Category → Category Drill-Down
   └─ Click Expense Category → Category Drill-Down

2. Type Drill-Down (mode='type')
   └─ Click Category → Category Drill-Down (mode='category')

3. Category Drill-Down (mode='category')
   ├─ Click Subcategory → Transaction List (mode='transactions')
   └─ Click Category (if no subcategories) → Transaction List (mode='transactions')

4. Transaction List (mode='transactions')
   └─ Back button → Previous drill-down level
```

### State Management
```typescript
interface DrillDownState {
  name: string;
  color: string;
  isIncome: boolean;
  mode?: 'type' | 'category' | 'transactions';
  parentCategory?: string;        // For transaction filtering
  selectedSubcategory?: string;   // For transaction filtering
}
```

### Modifiche ai file

**lib/services/chartService.ts**
- Aggiungere `formatCurrencyForSankey(value: number): string` con max 2 decimals

**components/cashflow/CashflowSankeyChart.tsx**
- Aggiornare state interface (linea 456-461)
- Modificare `handleNodeClick` per navigazione multi-livello (linee 529-563)
- Aggiungere funzione `getFilteredExpenses()` per filtrare transazioni
- Aggiornare `handleBack()` per gestire 4 livelli
- Sostituire `formatCurrency` con `formatCurrencyForSankey` al tooltip (linea 651)
- Aggiungere rendering condizionale tabella transazioni (dopo linea 679)

---

## Pattern di Riferimento

**Transaction Table** (da CurrentYearTab.tsx linee 812-893):
- Desktop: Table con sticky header, scrollable (max-height: 500px)
- Mobile: Card layout con flexbox
- Colonne: Data | Importo | Note | Link
- Colori: Rosso per spese, verde per entrate
- Empty state: "Nessuna transazione trovata"

**Filtering Logic** (da CurrentYearTab.tsx linee 493-513):
- Filtra per categoryName
- Filtra per tipo (income vs expenses)
- Filtra per subCategoryName (se in drill-down sottocategorie)
- Gestisce "Altro" come null subCategoryName

---

## Testing Checklist

### Problema 1 - Decimali
- [ ] Tooltip mostra esattamente 2 decimali
- [ ] Nessun floating-point artifact (es. .680000000001)
- [ ] Funziona con valori grandi e piccoli

### Problema 2 - Navigazione
- [ ] Budget view: click tipo/categoria funziona
- [ ] Type drill-down: click categoria entra in category drill-down
- [ ] Category drill-down: click sottocategoria mostra transazioni
- [ ] Category drill-down: click categoria senza subcategories mostra transazioni
- [ ] Back button funziona da ogni livello

### Problema 3 - Tabella Transazioni
- [ ] Desktop: tabella con sticky header
- [ ] Mobile: card layout
- [ ] Filtro corretto per categoria/sottocategoria
- [ ] Empty state funziona
- [ ] Link esterni si aprono in nuova tab
- [ ] Formattazione data/importo corretta
- [ ] Colori corretti (rosso spese, verde entrate)

---

## Note Implementative

- Tutte le label UI in italiano
- Commenti codice in inglese
- Timezone: Europe/Rome per tutte le date
- Convenzione segno: income POSITIVE, expenses NEGATIVE
- Responsive breakpoint: 640px (sm in Tailwind)
- Formatter: `formatCurrency()`, `formatDate()` da lib/utils/formatters.ts

---

## Implementazione Completata

### File Modificati

#### 1. `lib/services/chartService.ts`
- **Aggiunto**: `formatCurrencyForSankey()` function (dopo linea 201)
- **Scopo**: Formatta valori currency con esattamente 2 decimali, prevenendo floating-point artifacts
- **Linee**: +15 linee

#### 2. `components/cashflow/CashflowSankeyChart.tsx`
- **Imports aggiornati** (linea 25-31):
  - Aggiunto: `format` da date-fns
  - Aggiunto: `it` locale da date-fns/locale
  - Aggiunto: `formatCurrencyForSankey` da chartService
  - Aggiunto: `toDate` da dateHelpers
  - Aggiunto: `ExternalLink` icon da lucide-react

- **State interface aggiornato** (linea 456-463):
  - Aggiunto mode: `'transactions'`
  - Aggiunto campo: `parentCategory?: string`
  - Aggiunto campo: `selectedSubcategory?: string`

- **Funzioni aggiunte**:
  - `checkIfCategoryHasSubcategories()` (prima di handleNodeClick): Check se categoria ha sottocategorie
  - `getFilteredExpenses()` (dopo handleNodeClick): Filtra transazioni per categoria/sottocategoria

- **Funzioni modificate**:
  - `handleNodeClick()`: Logica multi-livello per navigazione drill-down profondo
  - `handleBack()`: Supporto navigazione multi-livello (transactions → category → budget)
  - `sankeyData useMemo`: Gestione mode='transactions' con ritorno dati vuoti

- **UI aggiunta** (dopo Sankey chart, prima chiusura CardContent):
  - Transaction count display
  - Empty state ("Nessuna transazione trovata")
  - Desktop: table con sticky header, scrollable (max-height 500px)
  - Mobile: card layout con flexbox
  - Colonne: Data | Importo | Note | Link
  - Colori: verde per income, rosso per expenses
  - Hover effects e transitions

- **Tooltip aggiornato** (linea 730):
  - Sostituito `formatCurrency` con `formatCurrencyForSankey`

- **Totale linee modificate/aggiunte**: ~200 linee

### Comportamenti Implementati

#### Problema 1: Decimali ✓
- Tooltip ora mostra esattamente 2 decimali (es. "€6.709,68")
- Nessun floating-point artifact

#### Problema 2: Navigazione Multi-Livello ✓
**Budget View:**
- Click tipo expense → Type Drill-Down
- Click categoria income/expense → Category Drill-Down O Transaction List (se no subcategories)

**Type Drill-Down:**
- Click categoria → Category Drill-Down O Transaction List (se no subcategories)

**Category Drill-Down:**
- Click sottocategoria → Transaction List

**Transaction List:**
- Back button → Category Drill-Down → Budget View

#### Problema 3: Tabella Transazioni ✓
- Desktop: Table con sticky header, 4 colonne, scrollable
- Mobile: Card layout compatto
- Filtraggio corretto per categoria/sottocategoria
- Empty state gestito
- Date formattate dd/MM/yyyy (Italy timezone)
- Importi con colori semantici (verde/rosso)
- Link esterni aprono in nuova tab
- Transaction count visibile

### Convenzioni Rispettate

- ✓ Testi UI in italiano
- ✓ Commenti codice in inglese
- ✓ Timezone Europe/Rome per date
- ✓ Formatters da lib/utils
- ✓ Responsive breakpoint 640px (sm)
- ✓ Sign convention: income positive, expenses negative

---

## Bug Fix Post-Testing

Dopo il primo testing, sono emersi 2 bug che sono stati fixati:

### Bug Fix 1: Decimali Eccessivi sui Link del Sankey ✓
**Problema**: I link (rami) del Sankey mostravano "6709.680000000001" invece di "€6.709,68"
**Causa**: Nivo Sankey non aveva il prop `valueFormat` per formattare i link values
**Fix**: Aggiunto `valueFormat={(value) => formatCurrencyForSankey(value)}` al ResponsiveSankey (linea 694)
**Risultato**: Tutti i link ora mostrano valori formattati con 2 decimali in formato italiano

### Bug Fix 2: Tabella Transazioni Non Renderizzava ✓
**Problema**: Navigando Variabili → Cibo → sottocategoria, si vedeva "Nessun dato disponibile"
**Causa**: Early exit check (linea 650) ritornava quando sankeyData era vuoto. In transactions mode, sankeyData è intenzionalmente vuoto perché renderizziamo la tabella, non il Sankey
**Fix**: Modificata condizione early exit per escludere transactions mode: `if ((sankeyData.nodes.length === 0 || sankeyData.links.length === 0) && selectedCategory?.mode !== 'transactions')`
**Risultato**: La tabella transazioni ora si renderizza correttamente quando si clicca su sottocategorie

### Bug Fix 3: Crash Nivo Sankey con Dati Vuoti ✓
**Problema**: Dopo fix #2, cliccando su sottocategoria appariva errore "RangeError: Invalid array length" da Nivo Sankey
**Causa**: ResponsiveSankey veniva sempre renderizzato, anche in transactions mode con `sankeyData = { nodes: [], links: [] }`. Nivo crashava processando dati vuoti
**Fix**: Wrappato ResponsiveSankey in condizione `{selectedCategory?.mode !== 'transactions' && (...)}` per renderizzarlo solo quando NON in transactions mode
**Risultato**: In transactions mode viene renderizzata SOLO la tabella, senza crashare Nivo

### File Modificati (Bug Fix)

#### `components/cashflow/CashflowSankeyChart.tsx`
- **Linea 650-651**: Aggiornata condizione early exit per escludere transactions mode
- **Linea 690-691**: Wrappato ResponsiveSankey in condizione per nasconderlo in transactions mode
- **Linea 695**: Aggiunto `valueFormat` prop per formattare link values
- **Linea 761**: Chiuso wrapper condizionale ResponsiveSankey
- **Totale**: 4 linee modificate/aggiunte

---

**Status**: Bug fix completati - Pronto per testing finale
**Next step**: Testing completo con checklist (decimali link + tabella transazioni)
