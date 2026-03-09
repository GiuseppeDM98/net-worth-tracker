# CLAUDE.md - Net Worth Tracker (Lean)

## Project Overview
Net Worth Tracker is a Next.js app for Italian investors to track net worth, assets, cashflow, dividends, performance metrics, and historical snapshots with Firebase.

## Current Status
- Versione stack: Next.js 16, React 19, TypeScript 5, Tailwind v4, Firebase, Vitest, date-fns-tz, @nivo/sankey, @anthropic-ai/sdk, cheerio
- Ultima implementazione: **Dividendi % fix** — `dividendReturnPercentage` in "Rendimento Totale per Asset" ora usa costo base storico per-dividendo (`div.quantity × div.costPerShare`); acquistare nuove azioni non diluisce più il rendimento storico. Colonna "Costo/Az." aggiunta in tabella dividendi. (2026-03-09)
- In corso ora: nessuna attività attiva

## Architecture Snapshot
- App Router con pagine protette sotto `app/dashboard/*`.
- Service layer in `lib/services/*` (Firestore client/admin, scraping, metriche).
- Utility in `lib/utils/*` (formatters, date helpers, asset history).
- React Query per caching e invalidazioni post-mutation.
- Timezone: Europe/Rome via `lib/utils/dateHelpers.ts` helpers (`getItalyDate`, `getItalyMonth`, `getItalyYear`, `getItalyMonthYear`)

## Key Features (Active)
- Portfolio multi-asset con aggiornamento prezzi Yahoo Finance (prezzo e average cost a 4 decimali). Asset con quantità zero supportati: badge "Azzerato" in tabella, esclusi dal conteggio overview, marcati "Venduto" nello storico. Bond con ISIN: scraping automatico prezzi da Borsa Italiana con fallback Yahoo Finance. **Bond coupon scheduling**: cedole auto-generate da `BondDetails` (tasso, frequenza, emissione, scadenza, valore nominale). **Step-up coupon**: `CouponRateTier[]` con fasce annuali di tasso (es. BTP Valore). **Premio finale**: `finalPremiumRate` genera dividend `finalPremium` su scadenza. **Tax hint 12.5%** per Titoli di Stato italiani. **Convenzione Borsa Italiana**: `currentPrice` e `averageCost` sempre in EUR; input utente in quotazione BI (per 100€ nominale) → convertito con `biPrice × (nominalValue/100)`; edit-mode mostra il valore back-convertito; `isBondPctMode` (ISIN + nominalValue > 1) controlla label/conversione/preview. **Costo Annuale Portfolio**: TER medio ponderato + imposta di bollo configurabile (aliquota %, esenzione per-asset, soglia >€5.000 per conti correnti).
- Cashflow con categorie, filtri, Sankey 5-layer, drill-down 4 livelli, Analisi Periodo con filtri anno+mese. Bulk move transazioni tra categorie (cross-type, da Settings). **Cambio tipo categoria**: il tipo (`fixed`/`variable`/`debt`/`income`) è ora modificabile dopo la creazione; batch update su tutte le transazioni associate con inversione automatica dei segni se si attraversa il confine income ↔ spesa. **Linked cash account**: ogni transazione può essere collegata a un asset cash; il saldo (quantity) viene aggiornato automaticamente su create/edit/delete. **Conti di default** configurabili in Settings (separati per spese e entrate). **Anno inizio storico**: `cashflowHistoryStartYear` in Settings filtra i dati del tab Storico Totale (esclude import bulk pre-data); default 2025.
- Snapshot mensili automatici + storico e CSV export.
- Asset price/value history tables con aggregazione per nome e badge "Venduto". Tab anno corrente: colonne riepilogative **Mese Prec. %** (sfondo ambra, variazione MoM dell'ultimo mese), **YTD %** (sfondo blu). Tab storiche: **From Start %** (sfondo viola). Logica in `assetPriceHistoryUtils.ts`, `AssetHistoryTotalRow`, `AssetPriceHistoryRow`.
- History page: Net Worth evolution, Asset Class breakdown, Liquidity, YoY variation, Savings vs Investment Growth (toggle Annuale/Mensile con selettore anno nella vista mensile), Doubling Time Analysis (geometrico + soglie fisse, summary cards adattivi alla modalità), Current vs Target allocation.
- Performance metrics (ROI, CAGR, TWR, IRR, Sharpe, drawdown suite, YOC, Current Yield) con heatmap, underwater chart, rolling charts. Organizzate in 4 categorie (Rendimento, Rischio, Contesto, **Proventi Finanziari** — include dividendi e cedole).
- Dividendi multi-currency con conversione EUR, scraping Borsa Italiana, calendario mensile con drill-down. Filtro asset include equity + bond (cedole); filtri posizionati in cima alla pagina e propagati anche ai grafici (DividendStats riceve assetId). Vendita bond (quantity=0): cedole future eliminate, nessuna voce €0 creata. **Rendimento Totale per Asset**: tabella in `DividendStats.tsx` con plusvalenza non realizzata % + dividendi storici netti % = rendimento totale %; `dividendReturnPercentage` = somma di `(div.netAmountEur / (div.quantity × div.costPerShare))` per ogni dividendo pagato (costo storico per-pagamento, stessa filosofia YOC v3); fallback a `asset.averageCost` per record legacy; può superare 100%; esclusi venduti (qty=0) e asset senza averageCost; calcolo in `/api/dividends/stats/route.ts`. **Crescita Dividendi per Azione**: tabella in `DividendStats.tsx` con DPS lordo annuale per asset, YoY% e CAGR%; solo equity (cedole `coupon`/`finalPremium` escluse); mediana portafoglio in header (solo vista all-assets); asset con 1 solo anno di dati mostrano "—"; interfacce `AssetDividendGrowth`, `DividendGrowthData` in `types/dividend.ts`.
- Hall of Fame con ranking mensili/annuali e sistema note dedicato multi-sezione.
- FIRE calculator con esclusione casa abitazione, Proiezione Scenari Bear/Base/Bull con inflazione, FIRE Number per-scenario, stop risparmi al raggiungimento FIRE.
- Monte Carlo simulations con 4 asset class (Equity, Bonds, Immobili, Materie Prime) e parametri editabili. Confronto Scenari Bear/Base/Bull. Auto-fill allocazione da portafoglio reale.
- **Goal-Based Investing**: allocazione mentale di porzioni del portafoglio a obiettivi finanziari. Toggle in Settings. Assegnazione asset per percentuale. Confronto allocazione effettiva vs consigliata per obiettivo. **Goal-Driven Allocation**: deriva i target come media pesata delle `recommendedAllocation` degli obiettivi.
- PDF Export con 8 sezioni configurabili, selezione anno/mese custom per export annuali e mensili. Sezioni auto-disabilitate per periodi passati.
- **AI Performance Analysis**: Claude Sonnet 4.5 con SSE streaming, Extended Thinking, Web Search (Tavily).

## Testing
- **Framework**: Vitest (`npm test`, `npm run test:watch`)
- **201 unit test** across 8 files in `__tests__/` covering formatters, dateHelpers, fireService, performanceService, borsaItalianaBondScraper, goalService, couponUtils
- **Scope**: Pure functions only (no Firebase mocking). Services need `vi.mock()` on Firebase-dependent imports.
- **Config**: `vitest.config.ts` with `@/` path alias

## Data & Integrations
- Firestore (client + admin) con merge updates.
- Yahoo Finance per prezzi. Borsa Italiana scraping per dividendi e bond MOT. Frankfurter API per valute (cache 24h).
- Tavily API per web search (AI analysis context).

## Known Issues (Active)
- Etichette legenda su mobile troncate (top 3 elementi).
- Conversione valuta dipende da Frankfurter API (fallback su cache).

## Key Files
- History: `app/dashboard/history/page.tsx`, `components/history/DoublingTimeSummaryCards.tsx`, `DoublingMilestoneTimeline.tsx`
- Chart service: `lib/services/chartService.ts`
- Performance: `app/dashboard/performance/page.tsx`, `lib/services/performanceService.ts`, `types/performance.ts`
- Performance API: `app/api/performance/yoc/route.ts`, `app/api/performance/current-yield/route.ts`
- Performance UI: `components/performance/MonthlyReturnsHeatmap.tsx`, `UnderwaterDrawdownChart.tsx`, `MetricSection.tsx`
- Cashflow: `components/cashflow/TotalHistoryTab.tsx`, `CurrentYearTab.tsx`, `CashflowSankeyChart.tsx`
- Dividends: `components/dividends/DividendTrackingTab.tsx`, `DividendTable.tsx`, `DividendCalendar.tsx`
- Hall of Fame: `app/dashboard/hall-of-fame/page.tsx`, `lib/services/hallOfFameService.ts`
- FIRE: `components/fire-simulations/FireCalculatorTab.tsx`, `FIREProjectionSection.tsx`, `FIREProjectionChart.tsx`, `FIREProjectionTable.tsx`, `lib/services/fireService.ts`
- Monte Carlo: `components/fire-simulations/MonteCarloTab.tsx`, `lib/services/monteCarloService.ts`
- Goals: `types/goals.ts`, `lib/services/goalService.ts`, `components/fire-simulations/GoalBasedInvestingTab.tsx`, `components/goals/*`
- Asset types: `types/assets.ts` (MonteCarloParams, MonteCarloScenarios, DoublingMilestone, etc.)
- Allocation: `app/dashboard/allocation/page.tsx`, `lib/services/assetAllocationService.ts`
- Settings: `lib/services/assetAllocationService.ts`, `app/dashboard/settings/page.tsx`
- Category Move: `components/expenses/CategoryMoveDialog.tsx`, `CategoryManagementDialog.tsx`, `CategoryDeleteConfirmDialog.tsx`
- AI Analysis: `app/api/ai/analyze-performance/route.ts`, `components/performance/AIAnalysisDialog.tsx`
- Bond Scraping: `lib/services/borsaItalianaBondScraperService.ts`, `lib/helpers/priceUpdater.ts`, `app/api/prices/bond-quote/route.ts`
- Bond Coupons: `lib/utils/couponUtils.ts`, `app/api/cron/daily-dividend-processing/route.ts`
- Utils: `lib/utils/dateHelpers.ts`, `formatters.ts`, `assetPriceHistoryUtils.ts`
- Auth: `lib/utils/authHelpers.ts`, `contexts/AuthContext.tsx`
- PDF: `types/pdf.ts`, `lib/services/pdfDataService.ts`, `components/pdf/PDFDocument.tsx`, `components/pdf/PDFExportDialog.tsx`, `lib/utils/pdfTimeFilters.ts`, `lib/utils/pdfGenerator.tsx`
- Tests: `vitest.config.ts`, `__tests__/formatters.test.ts`, `dateHelpers.test.ts`, `fireService.test.ts`, `performanceService.test.ts`, `borsaItalianaBondScraper.test.ts`, `goalService.test.ts`, `couponUtils.test.ts`

**Last updated**: 2026-03-09 (session: Dividendi % fix, Costo/Az. column)
