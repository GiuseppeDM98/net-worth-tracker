# Session Notes — 2026-03-18

## Obiettivo
Responsive audit completo della pagina **Cashflow** su mobile e tablet, usando `/adapt`.

## File coinvolti
- `app/dashboard/cashflow/page.tsx` — page con tabs
- `components/cashflow/ExpenseTrackingTab.tsx` — tab Tracciamento
- `components/cashflow/CurrentYearTab.tsx` — tab Anno Corrente
- `components/cashflow/TotalHistoryTab.tsx` — tab Storico Totale
- `components/cashflow/BudgetTab.tsx` — tab Budget
- `components/cashflow/CashflowSankeyChart.tsx` — Sankey chart

## Convenzioni da rispettare (da AGENTS.md)
- Breakpoint custom: `desktop:` (1440px), NON `lg:` — sotto 1440px è mobile/tablet
- Padding portrait: `max-desktop:portrait:pb-20` sul root wrapper
- Tab → Radix Select su mobile: pattern `hidden desktop:block` + `desktop:hidden`
- Card view mobile vs tabella desktop per tabelle data-dense
- Bottoni header: `flex flex-col gap-3 landscape:flex-row landscape:items-center landscape:justify-between`
- NO `md:` per layout/navigazione, solo per card-vs-table su pagine data-dense

## Analisi problemi rilevati (pre-audit)

### page.tsx
- `p-8` fisso su tutti i device → troppo padding mobile
- TabsList a 5 tab con etichette lunghe → overflow su mobile
- `<span className="hidden sm:inline">` sui tab (usa `sm:` non `desktop:`) → testo appare su tablet (768px+) ma tabs ancora cramped fino a 1440px

### ExpenseTrackingTab.tsx
- Stats grid: `md:grid-cols-2 lg:grid-cols-4` → usa `lg:` (1024px) invece di `desktop:`
- Header: `hidden sm:flex` sul bottone desktop → appare a 640px, pattern non allineato
- FAB mobile: usa `sm:hidden` → scompare a 640px ma dovrebbe restare fino a `desktop:`
- Filtri: `flex-wrap items-end gap-4` con `min-w-[150px]` → su mobile si stackano male
- Year selection: bottoni `min-w-[100px]` → ok su mobile ma non ha padding portrait

### CurrentYearTab.tsx
- Layout chart: usa `md:flex-row` / `lg:grid-cols-2` → breakpoint sbagliati
- `isMobile` basato su `max-width: 639px` → sotto sm, non allineato con `desktop:`
- Pie charts side-by-side → probabilmente troppo stretti su tablet

### TotalHistoryTab.tsx
- Stesso isMobile `max-width: 639px`
- Trend charts: nessuna card view mobile per tabelle (se presenti)
- Filtri anno/mese: layout `flex-wrap gap-4`

### BudgetTab.tsx
- Tabella budget con molte colonne (Budget/anno, Anno Corr., Anno Prec., Media, Progress) → non ha card view mobile
- Bisogna aggiungere banner "si consiglia desktop" O card view

## Stato
- [x] Completato con /adapt (2026-03-18)

## Modifiche applicate

### app/dashboard/cashflow/page.tsx
- `p-8` → `p-4 desktop:p-8` (padding responsivo)
- Aggiunto `max-desktop:portrait:pb-20` al root div per bottom nav
- Aggiunto Radix Select `desktop:hidden` per navigazione tab su mobile/tablet
- TabsList: `grid w-full max-w-4xl grid-cols-5` → `hidden desktop:grid ...` (nascosto su mobile)
- Rimosse `<span className="hidden sm:inline">` sulle label tab (non più necessarie)

### components/cashflow/ExpenseTrackingTab.tsx
- Stats grid: `md:grid-cols-2 lg:grid-cols-4` → `grid-cols-2 desktop:grid-cols-4`
- Header "Nuova Spesa": `hidden sm:flex` → `hidden desktop:flex`
- FAB mobile: `sm:hidden` → `desktop:hidden` (rimane visibile fino a 1440px)

### components/cashflow/BudgetTab.tsx
- Aggiunto banner amber `desktop:hidden` prima del `<Card>` con `AnnualTable` (7-8 colonne, tabella data-dense)
- "Per la miglior esperienza si consiglia la visualizzazione su desktop"

### components/cashflow/CurrentYearTab.tsx
- Drill-down expense list (spese): `sm:hidden` → `desktop:hidden` (card view)
- Drill-down expense list (spese): `hidden rounded-md border sm:block` → `hidden desktop:block rounded-md border` (table view)
- Drill-down income list (entrate): stesso pattern (2 occorrenze)

### components/cashflow/TotalHistoryTab.tsx
- Analisi Periodo section: `p-4 sm:p-6` → `p-4 desktop:p-6`
- Drill-down expense list (spese): `sm:hidden` → `desktop:hidden`
- Drill-down expense list (spese): `hidden rounded-md border sm:block` → `hidden desktop:block rounded-md border`
- Drill-down income list (entrate): stesso pattern (2 occorrenze)
