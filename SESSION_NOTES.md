# Session Notes — Portfolio Benchmark Comparison

**Session**: claude/portfolio-comparison-benchmarks-TuDOq  
**Date**: 2026-05-04  
**Feature**: Compare user portfolio performance vs standard model portfolios (60/40, All Weather, Buffett 90/10, Golden Butterfly)

---

## Cosa abbiamo implementato

### 1. Infrastruttura base benchmark (prima del compact)

- **Cosa**: nuova sezione "Confronto con Portafogli Modello" nella pagina Rendimenti con grafico crescita-di-100 e tabella TWR
- **Perché**: il confronto con portafogli modello standard aiuta l'utente a valutare se la sua gestione attiva aggiunge valore rispetto a strategie passive comuni
- **Nota**: abbiamo scelto di non usare un utente Firestore fittizio — i dati vengono da Yahoo Finance (prezzi ETF proxy in USD), cachati in `benchmark-cache/{benchmarkId}` come dato globale condiviso tra tutti gli utenti (Admin SDK only in scrittura)

### 2. Fix "Crescita totale" con segno + (prima del compact)

- **Cosa**: il valore della colonna "Crescita totale" per la riga del portafoglio non mostrava il prefisso `+` sui valori positivi
- **Perché**: i benchmark avevano già il `+` ma il portafoglio usava una formattazione diversa
- **Nota**: fix nel helper `formatGrowth` in `BenchmarkComparisonChart.tsx`

### 3. Fix TWR annualizzato disallineato con KPI card (prima del compact)

- **Cosa**: il TWR mostrato nella tabella benchmark (es. 14.91%) non coincideva con quello nella KPI card della pagina (es. 14.52%)
- **Perché**: la tabella usava `chartData.length` come denominatore per l'annualizzazione (= numero di punti return = n−1 mesi), mentre la KPI card usa `metrics.numberOfMonths` (n mesi) — uno scarto di 1 mese
- **Nota**: soluzione — passare `portfolioTWR={metrics.timeWeightedReturn}` e `numberOfMonths={metrics.numberOfMonths}` come prop dirette; il portafoglio usa il valore pre-calcolato senza ricomputare dall'heatmap

### 4. Fix "Crescita totale" disallineata con KPI (dopo il compact)

- **Cosa**: la colonna "Crescita totale" del portafoglio (es. 58.91%) era derivata dall'heatmap indicizzata e non coincideva con il TWR cumulativo implicito nella KPI card
- **Perché**: l'heatmap è soggetta a drift di arrotondamento rispetto alla cache pre-calcolata del server
- **Nota**: la "Crescita totale" NON è uguale al ROI Totale (sono metriche diverse: TWR cumulativo vs ritorno semplice). La soluzione è derivarla de-annualizzando il TWR della KPI card: `(1 + TWR/100)^(mesi/12) − 1`. Passata come prop `portfolioTotalGrowth` dalla pagina per tenere la logica fuori dal componente

### 5. Conversione EUR benchmark via Frankfurter API

- **Cosa**: toggle "Converti benchmark in EUR" nella sezione confronto — quando attivo, i rendimenti mensili USD dei benchmark vengono convertiti in EUR usando i tassi di cambio end-of-month storici
- **Perché**: senza conversione il confronto è fra un portafoglio in EUR e benchmark in USD — un investitore europeo subisce anche il rischio cambio, che la conversione rende visibile
- **Nota**:
  - Formula: `R_EUR[t] = (1 + R_USD[t]) × (eurPerUsd_t / eurPerUsd_{t-1}) − 1`
  - I tassi vengono da `https://api.frankfurter.app/2000-01-01..OGGI?from=USD&to=EUR` (free, no key)
  - Dati giornalieri collassati a mensili prendendo l'ultimo tasso disponibile per ogni mese (allineato ai prezzi Yahoo Finance di fine mese)
  - Cache in `fx-rate-cache/usd-eur` (Firestore, TTL 7 giorni, Admin SDK only in scrittura)
  - Il toggle è off di default — nessuna chiamata a Frankfurter finché l'utente non lo abilita
  - Se il tasso FX di un mese non è disponibile, il rendimento USD passa invariato (fallback silenzioso)

---

## Files creati

| File | Scopo |
|------|-------|
| `types/benchmarks.ts` | TypeScript types (`BenchmarkDefinition`, `BenchmarkMonthlyReturn`, `FxMonthlyRate`, ecc.) |
| `lib/constants/benchmarks.ts` | Definizioni benchmark con ETF proxy, pesi, colori, descrizioni italiane |
| `app/api/benchmarks/returns/route.ts` | GET `?benchmarkId=` — fetch Yahoo Finance + cache Firestore 7d |
| `app/api/benchmarks/fx-rates/route.ts` | GET `/fx-rates` — fetch Frankfurter + cache Firestore 7d |
| `lib/hooks/useBenchmarkReturns.ts` | React Query hook per rendimenti benchmark (staleTime 6h) |
| `lib/hooks/useFxRates.ts` | React Query hook per tassi EUR/USD (enabled solo con toggle attivo) |
| `components/performance/BenchmarkComparisonChart.tsx` | Grafico crescita-di-100 + tabella TWR + conversione FX |
| `components/performance/BenchmarkComparisonSection.tsx` | Sezione con pill toggle benchmark, info composizione, switch EUR |

## Files modificati

| File | Modifica |
|------|----------|
| `app/dashboard/performance/page.tsx` | Inserita `BenchmarkComparisonSection` dopo "Evoluzione Patrimonio" |
| `lib/query/queryKeys.ts` | Aggiunti `benchmarks.returns` e `benchmarks.fxRates` |
| `firestore.rules` | Aggiunte collection `benchmark-cache` e `fx-rate-cache` (read: authenticated, write: false) |

---

## Benchmark ETF Proxies

| ID | Components |
|----|-----------|
| `60-40` | ACWI (60%) + AGG (40%) |
| `all-weather` | SPY (30%) + TLT (40%) + IEF (15%) + GLD (7.5%) + GSG (7.5%) |
| `buffett-90-10` | SPY (90%) + SHY (10%) |
| `golden-butterfly` | VTI (20%) + VBR (20%) + GLD (20%) + TLT (20%) + SHY (20%) |

---

## Gotcha e dettagli tecnici

- **Hook stabili**: React vieta hook in loop → 4 hook fissi `b0..b3` con `enabled: false` per benchmark inattivi
- **TWR consistency**: `portfolioTWR` e `numberOfMonths` vengono da `metrics.*` (cache server), non ricalcolati dall'heatmap — evita drift di arrotondamento
- **Crescita totale portfolio**: de-annualizzata da TWR con `(1 + TWR/100)^(mesi/12) − 1`; non è il ROI Totale (diverse formule)
- **FX lazy load**: `useFxRates` è `enabled: false` finché il toggle è off — nessun fetch inutile
- **Mese precedente FX**: `prevKey` calcolato con `new Date(year, month - 2, 1)` (month è 1-indexed, getMonth è 0-indexed → −2 dà il mese precedente corretto)
- **Pesi mancanti**: mesi con `totalWeight < 0.95` esclusi dai rendimenti benchmark (gestisce ETF con inception tardiva)
- **Cache Firestore**: entrambe le collection sono global shared data — Admin SDK only in scrittura, client read-only — stesso pattern di `price-history`
