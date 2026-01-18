# Session Notes - History Page: Savings vs Investment Growth Chart

**Data**: 2026-01-18
**Obiettivo**: Implementare un nuovo grafico in History page che separi crescita da risparmi vs crescita da investimenti/mercato

## User Requirements

### Concetto
Mostrare la differenza tra:
- **Risparmi**: quanto ho messo da parte con gli stipendi (net cashflows)
- **Crescita investimenti**: quanto il mercato ha fatto crescere il portafoglio (net worth growth - savings)

### Formula proposta
```
Crescita Investimenti = (Net Worth YoY Growth) - (Net Savings)
```

### Posizionamento
- Sotto il grafico "Storico YoY" esistente

### Opzioni visualizzazione
1. **Opzione A**: Mostrare crescita anno su anno (come grafico esistente)
2. **Opzione B**: Mostrare risparmio netto e crescita investimenti separati
   - User preferisce questa opzione

## Context Files Read
- ✅ AGENTS.md - Convenzioni, pattern, gotchas
- ✅ CLAUDE.md - Stato progetto, architettura
- ✅ COMMENTS.md - Linee guida commenti

## Exploration Tasks
- ✅ Leggere pagina History attuale (app/dashboard/history/page.tsx)
- ✅ Studiare chartService.ts per capire i dati preparati
- ✅ Esaminare grafico "Storico YoY" esistente
- ✅ Verificare disponibilità dati snapshots e cashflows
- ✅ Capire struttura componenti chart esistenti

## Design Decisions (Approved)
- **Chart Type**: Stacked Bar Chart
- **Granularity**: Annual (year-by-year)
- **Colors**: Green (savings), Blue (positive gains), Red (negative losses)
- **Position**: Below "Storico YoY" chart
- **Timezone**: Use Italy timezone helpers (getItalyYear)
- **Formatting**: formatCurrency, formatCurrencyCompact for mobile
- **Text**: Italian UI, English comments

## Implementation Plan (Approved)
✅ Plan created and approved

### Step 1: chartService.ts
- Add prepareSavingsVsInvestmentData() function
- Group snapshots by year, group expenses by year
- Calculate: NW Growth, Net Savings, Investment Growth

### Step 2: History Page - Data Fetching
- Add expense state
- Fetch expenses in loadData() parallel with other data
- Add imports

### Step 3: History Page - Chart Component
- Prepare data with prepareSavingsVsInvestmentData()
- Add stacked bar chart markup
- Conditional coloring for investment growth

## Implementation Progress
- ✅ Step 1: Add prepareSavingsVsInvestmentData() to chartService.ts
  - Added imports: Expense type, getItalyYear helper
  - Added function after prepareYoYVariationData() (line 308-405)
  - Includes comprehensive JSDoc comment
- ✅ Step 2: Update History page data fetching
  - Added expense state: `const [expenses, setExpenses] = useState<Expense[]>([]);`
  - Updated loadData() to fetch expenses in parallel (4 queries now)
  - Added imports: getAllExpenses, Expense, prepareSavingsVsInvestmentData
- ✅ Step 3: Add chart component to History page
  - Prepared data: `const savingsVsInvestmentData = prepareSavingsVsInvestmentData(snapshots, expenses);`
  - Added stacked bar chart after YoY chart (line 1220-1305)
  - Green bar for Net Savings, conditional blue/red for Investment Growth
  - Responsive design following existing patterns
- [ ] Verification testing

## Files Modified
1. `lib/services/chartService.ts` - Added prepareSavingsVsInvestmentData() function (~97 lines)
2. `app/dashboard/history/page.tsx` - Added expense fetching and new chart component (~95 lines)

## Testing Checklist
- [ ] Page loads without errors
- [ ] Chart displays with real data
- [ ] Stacked bars show correctly (green + blue/red)
- [ ] Tooltip shows all 3 values (Net Savings, Investment Growth, Net Worth Growth)
- [ ] Negative investment growth shows in red
- [ ] Empty state shows when no data
- [ ] Responsive design works (mobile/desktop)
- [ ] Manual calculation verification

## Last Updated
2026-01-18 - Implementation completed, ready for testing
