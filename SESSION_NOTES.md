# Session Notes

## 2026-01-17 - Fix YOC Future Dividends Bug

### Cosa
Implementato fix per escludere dividendi futuri (non ancora ricevuti) dal calcolo dello YOC.

**Modifiche**:
- Aggiunto campo `dividendEndDate` a `PerformanceMetrics` (types/performance.ts)
- Calcolato `dividendEndDate` cappato a TODAY in `calculatePerformanceForPeriod` (performanceService.ts:1036)
- Aggiornato API route `/api/performance/yoc` per usare `dividendEndDate` invece di `endDate`
- Aggiornate chiamate API client in performance page (2 occorrenze)

### Perché
**Problema**: I dividendi con payment date futuro (es. 18-31 gennaio quando oggi è il 17) venivano inclusi nel calcolo YOC, causando valori artificialmente inflati.

**Root cause**: L'`endDate` veniva impostato all'ultimo giorno del mese dell'ultimo snapshot (es. 31/01/2026), indipendentemente dalla data odierna. Il filtro dividendi usava `paymentDate <= endDate`, includendo quindi tutti i dividendi fino a fine mese.

**Soluzione scelta**: Aggiungere un parametro separato `dividendEndDate` cappato a TODAY, mantenendo l'`endDate` originale per le altre metriche (ROI, CAGR, TWR, IRR). Questo approccio:
- Zero rischio di regressione (altre metriche invariate)
- Semanticamente chiaro (separa snapshot-based da time-based metrics)
- Facile da testare (no dipendenza da system clock nelle funzioni)
- Future-proof (pattern riutilizzabile)

### Nota
**Risultati con dati reali**:
- Prima del fix: YOC 6,68% (includeva dividendo futuro)
- Dopo il fix: YOC 6,76% (solo dividendi ricevuti)
- Dividendi: €197,52 → €174,62 (-€22,90 dividendo futuro escluso)
- Cost basis: €7.100 → €6.200 (-€900, asset con dividendo futuro escluso)
- Asset count: 5 → 4

**Gotcha importante**: Lo YOC è aumentato anche se i dividendi totali sono diminuiti. Questo perché l'asset con il dividendo futuro aveva uno YOC inferiore alla media del portafoglio.

**Impatto su altre metriche**: Nessuno. Solo YOC usa `dividendEndDate`. Tutte le altre metriche (ROI, CAGR, TWR, IRR, Sharpe, Volatility, Drawdown) continuano a usare l'`endDate` originale basato sugli snapshot.

**Breaking change**: L'API route ha cambiato contratto (parametro rinominato `endDate` → `dividendEndDate`). Deploy deve essere atomico (backend + frontend insieme).

---

## 2026-01-17 - Migliorata documentazione YOC

### Cosa
Aggiornate le note metodologiche nella Performance page per spiegare il concetto di "Dividendi Annualizzati" nella formula dello YOC.

**Aggiunte**:
- Spiegazione dettagliata di cosa sono i dividendi annualizzati
- Due casistiche: periodi < 12 mesi (scaling) e ≥ 12 mesi (media annuale)
- Esempio concreto dal portafoglio reale (€197,52 su 5 mesi → €474/anno → YOC 6,68%)
- Confronto con Current Yield (costo originale vs valore attuale)

### Perché
L'utente ha richiesto chiarimenti sulla formula YOC e sul significato di "Dividendi Annualizzati". La documentazione precedente citava la formula ma non spiegava il processo di annualizzazione.

### Nota
La spiegazione usa dati reali del portafoglio dell'utente per rendere l'esempio più concreto e comprensibile. I valori sono stati verificati manualmente e il calcolo è corretto.
