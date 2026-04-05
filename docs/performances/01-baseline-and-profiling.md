# Step 1 - Baseline and Profiling

## Obiettivo
Confermare con misure ripetibili dove nasce la lentezza percepita della Panoramica, separando chiaramente il costo di rete/Firebase dal costo di parsing, derivazione dati, rendering React, Framer Motion, Recharts e `useCountUp`.

## Contesto del problema
- La casistica da verificare non è solo "account con tanti dati = Firebase lento".
- In [app/dashboard/page.tsx](app/dashboard/page.tsx) il count-up gira nel page component e può trascinare il rerender di tutta la Panoramica.
- La pagina monta anche animazioni Framer Motion e grafici Recharts, quindi il jank può essere CPU-bound sul main thread anche con query già completate.
- Le misure devono essere prese in build produzione locale, non in `next dev`.

## Matrice di riproduzione
Usare sempre questi quattro scenari:

1. Account ricco di dati sul desktop Windows/PC dove il problema è percepito.
2. Lo stesso account ricco di dati sul Mac dove il problema non è percepito.
3. Account leggero sullo stesso desktop problematico.
4. Account leggero sul Mac.

Per ogni scenario eseguire:

1. Cold load con cache browser pulita.
2. Warm load sulla stessa sessione.
3. Navigazione verso `/dashboard` da un'altra pagina del dashboard.
4. Refresh completo della pagina `/dashboard`.

## Ambiente e build di riferimento
- Usare `npm run build && npm run start`.
- Non usare `npm run dev` come baseline finale.
- Disabilitare estensioni browser non necessarie.
- Tenere aperta solo la scheda dell'app durante il profiling.
- Annotare data della sessione, browser, macchina, dimensione dataset percepita e build hash/branch.

## Punti di misura obbligatori
Per ogni run raccogliere almeno questi numeri:

- `overview_query_start` → `overview_query_end`
  - tempo di fetch dei dati usati dalla Panoramica
- `overview_parse_start` → `overview_parse_end`
  - normalizzazione dei documenti Firestore in oggetti usabili dal client
- `overview_derive_start` → `overview_derive_end`
  - calcolo metriche portfolio, variazioni e chart data
- `overview_hero_countup_start` → `overview_hero_countup_end`
  - finestra temporale in cui i KPI principali stanno animando
- `overview_charts_mount_start` → `overview_charts_mount_end`
  - tempo necessario a rendere montabile e visibile la sezione grafici
- frame drops o long tasks nei primi 1-2 secondi dal render della pagina
- numero richieste di rete e dimensione payload delle query Firebase o API overview

## Strumentazione temporanea minima
Introdurre strumentazione temporanea con `performance.mark()` e `performance.measure()` nei punti seguenti:

- inizio e fine query overview
- inizio e fine parsing/normalizzazione payload
- inizio e fine derivazione metriche e chart data
- avvio e fine animazione dei KPI hero
- avvio e fine mount effettivo dei grafici desktop

I marker devono essere:

- nominati in modo stabile
- facili da rimuovere a fine indagine
- concentrati su Panoramica, non sparsi nel resto del prodotto

Nomi consigliati:

```ts
performance.mark('overview_query_start');
performance.mark('overview_query_end');
performance.measure('overview_query', 'overview_query_start', 'overview_query_end');

performance.mark('overview_parse_start');
performance.mark('overview_parse_end');
performance.measure('overview_parse', 'overview_parse_start', 'overview_parse_end');

performance.mark('overview_derive_start');
performance.mark('overview_derive_end');
performance.measure('overview_derive', 'overview_derive_start', 'overview_derive_end');

performance.mark('overview_hero_countup_start');
performance.mark('overview_hero_countup_end');
performance.measure('overview_hero_countup', 'overview_hero_countup_start', 'overview_hero_countup_end');

performance.mark('overview_charts_mount_start');
performance.mark('overview_charts_mount_end');
performance.measure('overview_charts_mount', 'overview_charts_mount_start', 'overview_charts_mount_end');
```

## Profiling richiesto

### Chrome Performance Panel
Registrare un trace da apertura pagina fino a 2 secondi dopo il completamento visivo della hero.

Annotare:

- long tasks principali
- scripting time
- rendering/painting time
- frame rate durante il count-up
- eventuale overlap tra count-up e mount dei grafici

### React Profiler
Profilare il render di `/dashboard`.

Verificare:

- quante commit produce il count-up iniziale
- quali subtree rerenderano durante il count-up
- se i grafici rerenderano durante l'animazione dei KPI
- se il page component è il fan-out principale dei rerender

### Network Waterfall
Misurare:

- numero richieste per costruire la Panoramica
- durata e payload di ogni richiesta
- differenza tra cold e warm load
- eventuale serializzazione non voluta tra query

## Output atteso della baseline
La baseline deve concludere una di queste tre ipotesi, con dati a supporto:

1. Collo di bottiglia primario nel rendering/count-up.
2. Collo di bottiglia primario nella pipeline dati/Firebase.
3. Problema misto, con fetch abbastanza veloce ma saturazione CPU in fase di render.

Per ogni ipotesi annotare:

- evidenza osservata
- metrica che la supporta
- componente o funzione sospetta
- priorità dell'intervento successivo

## Criteri di accettazione
- Esiste una baseline ripetibile per 4 scenari minimi.
- Le misure sono prese in produzione locale, non in dev.
- Sono disponibili trace Chrome, sessioni React Profiler e waterfall rete.
- È possibile dire con evidenza se il problema è rete, CPU o misto.
- La decisione sullo step successivo non dipende più da impressioni soggettive.

## Test e validazione
- `npm run build`
- `npm run start`
- Raccolta manuale delle misure sui 4 scenari della matrice
- Salvataggio screenshot o note sintetiche dei risultati nel ticket o nella sessione futura

## Prompt di implementazione
```text
Esegui solo la baseline e il profiling performance della Panoramica.

Prima di iniziare, leggi integralmente questo file:
- docs/performances/01-baseline-and-profiling.md

Obiettivo:
- misurare in modo ripetibile la Panoramica in build production
- separare costo query/Firebase da costo di parsing, derivazione dati e rendering
- raccogliere evidenze con Chrome Performance panel, React Profiler e Network waterfall

Vincoli:
- non ottimizzare ancora il codice applicativo
- aggiungi solo strumentazione temporanea minima con performance.mark/measure
- usa come scenari account ricco vs leggero e desktop problematico vs Mac
- non considerare next dev come baseline finale

Output atteso:
- baseline documentata
- ipotesi principale confermata o smentita
- elenco dei colli di bottiglia ordinato per impatto
```
