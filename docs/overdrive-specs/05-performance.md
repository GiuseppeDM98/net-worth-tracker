# Rendimenti - Epicentro premium e wow controllato

## Perche' questa sezione
Rendimenti e' la superficie piu' adatta a un Overdrive ambizioso. Ha metriche tecniche, grafici, period selector e dialog che possono apparire molto piu' sofisticati senza tradire il tono dell'app.

## Outcome UX atteso
L'utente deve percepire che:
- cambiare periodo non ridisegna brutalmente la pagina
- le metriche si riassestano con logica
- i grafici evolvono tra stati diversi
- i momenti piu' avanzati sembrano premium, non "tech demo"

## Feature da implementare
### 1. Morph tra periodi
- **Comportamento utente**: passando tra `YTD`, `1Y`, `3Y`, `5Y`, `ALL`, `CUSTOM`, KPI e chart cambiano in continuita'.
- **Superficie coinvolta**: period selector, metriche, chart principali.
- **Priorita'**: altissima.
- **Impatto atteso**: massimo valore percepito.

### 2. Metric settling avanzato
- **Comportamento utente**: TWR, IRR, Sharpe, YOC e altre metriche si assestano in modo credibile e leggibile.
- **Superficie coinvolta**: MetricCard e section header.
- **Priorita'**: alta.
- **Impatto atteso**: grande sensazione di precisione.

### 3. Heatmap staged reveal
- **Comportamento utente**: la heatmap mensile si compone in sequenza controllata al primo ingresso o al cambio periodo principale.
- **Superficie coinvolta**: MonthlyReturnsHeatmap.
- **Priorita'**: alta.
- **Impatto atteso**: wow misurato.

### 4. Underwater chart cinematico ma sobrio
- **Comportamento utente**: il drawdown chart entra con una lettura progressiva chiara.
- **Superficie coinvolta**: UnderwaterDrawdownChart.
- **Priorita'**: media.
- **Impatto atteso**: forte identita' premium.

### 5. Dialog contestuali
- **Comportamento utente**: `CustomDateRangeDialog` e `AIAnalysisDialog` si aprono come superfici contestuali, non modali generiche.
- **Superficie coinvolta**: trigger e dialog di approfondimento.
- **Priorita'**: media.
- **Impatto atteso**: wow secondario ma elegante.

## Implementazione tecnica
- Orchestrare il cambio periodo come transizione di stato, non come semplice rerender.
- Usare pattern condivisi per metric settling e chart state changes.
- Per i grafici Recharts, differenziare primo mount, cambio periodo maggiore e aggiornamento minore.
- Applicare reveal piu' evidente solo a heatmap e underwater; sugli altri chart mantenere approccio piu' sobrio.
- Se si usano shared transitions per dialog, prevedere fallback a scale/fade.
- Non far ripartire tutte le animazioni a ogni interazione secondaria o refresh.

## Vincoli e guardrail
- `prefers-reduced-motion`: aggiornamento chiaro dei dati senza morph complessi.
- Evitare accumulo di animazioni su pagina gia' densa.
- Nessuna perdita di leggibilita' nei numeri o nelle label chart.
- Device medi: evitare transizioni costose simultanee su tutti i grafici.

## Accettazione e test
- Cambiare periodo produce continuita' percepibile tra stati.
- Le metriche restano leggibili durante l'assestamento.
- Heatmap e underwater hanno carattere ma non rallentano la pagina.
- I dialog si aprono in modo contestuale e non invadente.
- Testare cambio rapido di periodo, custom range, apertura AI dialog e refresh manuale.

## Prompt pronto per Codex
Usa `docs/overdrive-specs/00-overview.md` come contesto condiviso e `docs/overdrive-specs/05-performance.md` come fonte di verita' specifica per questa implementazione della pagina Rendimenti. Dai priorita' a morph tra periodi, metric settling avanzato, heatmap staged reveal, underwater chart cinematico ma sobrio e dialog contestuali. Non introdurre effetti decorativi gratuiti e non compromettere la leggibilita' delle metriche o dei grafici. Rispetta le convenzioni del repo, `prefers-reduced-motion`, i pattern condivisi di motion e usa fallback robusti senza dipendere da browser specifici. Se fattibile, esegui verifiche locali mirate e chiudi con un riepilogo sintetico di modifiche e verifiche. dimmi cosa e come testare riguardo ciò che hai implementato finora
