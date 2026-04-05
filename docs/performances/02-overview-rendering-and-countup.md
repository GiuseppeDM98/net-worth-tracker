# Step 2 - Overview Rendering and Count-Up

## Obiettivo
Ridurre il jank percepito della Panoramica spostando l'animazione numerica fuori dal page component, isolando i subtree costosi e impedendo che grafici e wrapper animati rerenderino durante il count-up iniziale.

## Problema da risolvere
- In [app/dashboard/page.tsx](app/dashboard/page.tsx) più `useCountUp` vivono nel page component.
- Ogni frame del count-up può causare rerender dell'intera pagina.
- La stessa pagina contiene:
  - metriche derivate
  - sezioni Framer Motion
  - grafici Recharts
  - formattazioni numeriche e sort dei dataset
- Con account grandi il carico CPU iniziale può superare il budget frame del desktop problematico.

## Decisioni architetturali vincolanti

### 1. Count-up solo in componenti KPI foglia
- Il count-up non deve più vivere nel page component.
- Estrarre i KPI overview in componenti foglia dedicati, sul pattern già usato in [components/performance/MetricCard.tsx](components/performance/MetricCard.tsx).
- Ogni card deve ricevere un valore finale già calcolato e animare solo sé stessa.
- Il page component deve passare dati finali stabili, non valori animati.

### 2. Policy iniziale di animazione
Al primo mount:

- animare solo `Patrimonio Totale Lordo`
- animare solo `Patrimonio Totale Netto`
- `Patrimonio Liquido Lordo`, `Patrimonio Liquido Netto`, `Plusvalenze Non Realizzate` e `Tasse Stimate` devono mostrare subito il valore finale

Dopo il primo mount:

- le card che restano animate devono usare `fromPrevious: true`
- l'animazione deve scattare solo su refresh o update dati reale, non su mount ricorrenti della pagina

### 3. Isolamento della sezione grafici
- La sezione composizione deve essere estratta in un subtree top-level dedicato e memoizzato.
- Il subtree grafici non deve rerenderare mentre i KPI hero stanno contando.
- I dataset grafici devono essere già derivati e passati come props stabili.

### 4. Mount grafici desktop deterministico
- Rimuovere la logica basata su timeout fisso come strategia principale.
- I grafici desktop devono montare solo dopo il completamento dei KPI primari.
- Usare una finestra idle con fallback sicuro:
  - `requestIdleCallback` se disponibile
  - `setTimeout` come fallback controllato
- Fino al mount reale mantenere il placeholder `Preparazione grafico...`.

### 5. Memoizzazione rigorosa
- Memoizzare wrapper dei grafici.
- Memoizzare dataset già pronti per i grafici.
- Evitare sort e trasformazioni ripetute durante render quando l'input non cambia.
- Evitare che `AnimatePresence` o i wrapper motion provochino remount dei grafici durante aggiornamenti numerici non correlati.

### 6. Formatter cache condivisi
- Normalizzare la formattazione numerica in [lib/services/chartService.ts](lib/services/chartService.ts) e [lib/utils/formatters.ts](lib/utils/formatters.ts).
- Evitare la creazione di nuovi `Intl.NumberFormat` a ogni render.
- Introdurre formatter cache riutilizzabili per:
  - valuta EUR standard
  - valuta con precisione custom
  - percentuali e numeri se necessario

## Implementazione consigliata

### Componentizzazione KPI
Creare componenti dedicati, ad esempio:

- `components/dashboard/OverviewAnimatedCurrency.tsx`
- `components/dashboard/OverviewKpiCard.tsx`
- `components/dashboard/OverviewChartsSection.tsx`

Regole:

- `OverviewAnimatedCurrency` possiede `useCountUp`
- `OverviewKpiCard` riceve `animateOnMount`, `fromPrevious`, `value`, `format`
- il page component orchestra solo layout e dati finali

### Sequenza di mount
Ordine richiesto:

1. Render hero e KPI immediati.
2. Avvio count-up dei 2 KPI primari.
3. Alla fine del count-up primario, marcare la hero come `settled`.
4. Solo dopo `settled`, schedulare il mount grafici in idle/fallback.
5. I grafici si montano una volta e poi restano stabili.

### Gestione motion
- Non rianimare l'intera pagina su refresh dati locale.
- Limitare motion ai container che cambiano davvero.
- Evitare che i KPI secondari e i grafici dipendano dalla stessa state machine del count-up primario.

## Contratti e comportamento
- Il page component deve trattare il valore visualizzato come responsabilità del componente foglia, non dello stato pagina.
- I grafici devono ricevere `data` già pronta e `shouldMount` già deciso.
- I placeholder devono essere coerenti tra desktop e mobile:
  - mobile continua a poter partire collassato
  - desktop aspetta fine hero + idle window

## Criteri di accettazione
- Il count-up dei KPI primari non provoca rerender dei grafici.
- Il page component non aggiorna l'intera Panoramica a ogni frame del count-up.
- I grafici desktop compaiono solo dopo la stabilizzazione iniziale della hero.
- Le formattazioni numeriche non creano nuovi `Intl.NumberFormat` a ogni render.
- L'account leggero non peggiora.

## Test
- `npx tsc --noEmit`
- Test unitari per eventuali helper di formatter cache e scheduling mount grafici
- React Profiler manuale su `/dashboard` per confermare:
  - meno commit durante count-up
  - grafici non coinvolti nei rerender della hero
- Validazione manuale:
  - account ricco sul desktop problematico
  - stesso account su Mac
  - account leggero sullo stesso desktop
  - refresh pagina e navigazione interna verso `/dashboard`

## Prompt di implementazione
```text
Implementa solo la refactor di rendering e count-up della Panoramica.

Prima di iniziare, leggi integralmente questo file:
- docs/performances/02-overview-rendering-and-countup.md

Obiettivo:
- spostare il count-up fuori dal page component
- animare al primo mount solo Patrimonio Totale Lordo e Patrimonio Totale Netto
- isolare i grafici in un subtree memoizzato
- montare i grafici desktop solo dopo la stabilizzazione dei KPI primari
- introdurre formatter cache condivisi per evitare nuovi Intl.NumberFormat a ogni render

Vincoli:
- usa il pattern di componenti foglia già presente in components/performance/MetricCard.tsx
- non reintrodurre timeout fissi come unica strategia di scheduling
- il subtree grafici non deve rerenderare durante il count-up della hero
- mantieni la UX italiana e i placeholder esistenti della Panoramica

Output atteso:
- Panoramica più fluida su dataset grandi
- count-up confinato alle sole card che lo usano
- grafici desktop montati in modo deterministico dopo la hero
```
