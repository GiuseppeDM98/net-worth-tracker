# Step 3 - Overview Data Pipeline and Firebase

## Obiettivo
Ridurre il costo dati della Panoramica sostituendo le query client ampie con una pipeline dedicata, autenticata server-side e predisposta per summary materializzati e warm-load più rapidi.

## Problema da risolvere
- La Panoramica oggi dipende da più sorgenti client:
  - `useAssets`
  - `useSnapshots`
  - `useExpenseStats`
  - `getSettings`
- Questo implica più fetch, più parse lato client e più derivazioni duplicate.
- L'overview usa solo una parte dei dati scaricati, ma oggi carica strutture più larghe del necessario.
- Su account grandi il costo può diventare percepibile anche quando il problema principale resta il rendering.

## Obiettivi funzionali
- Una sola query client per la Panoramica.
- Nessuna fiducia nel `userId` fornito dal client.
- Payload già aggregato e pronto per renderizzare KPI, variazioni e grafici.
- Supporto a summary materializzato con fallback a ricomputazione live.
- Miglior warm-load tramite persistenza locale Firestore o cache equivalente con fallback sicuro.

## Nuova route privata
Definire:

```ts
GET /api/dashboard/overview
```

Regole:

- il client usa `authenticatedFetch()`
- il server usa `requireFirebaseAuth()`
- il server deriva l'utente autenticato dal token verificato
- non usare `userId` nel query string come fonte autorevole

La route deve:

1. verificare il token Firebase
2. leggere il summary materializzato se presente e fresco
3. fare fallback a ricomputazione live se il summary è mancante o stale
4. restituire un payload già pronto per la Panoramica

## Contratto dati

### `DashboardOverviewPayload`
```ts
export interface DashboardOverviewPayload {
  metrics: {
    totalValue: number;
    liquidNetWorth: number;
    illiquidNetWorth: number;
    netTotal: number;
    liquidNetTotal: number;
    unrealizedGains: number;
    estimatedTaxes: number;
    portfolioTER: number;
    annualPortfolioCost: number;
    annualStampDuty: number;
  };
  variations: {
    monthly: { value: number; percentage: number } | null;
    yearly: { value: number; percentage: number } | null;
  };
  expenseStats: {
    currentMonth: { income: number; expenses: number; net: number };
    previousMonth: { income: number; expenses: number; net: number };
    delta: { income: number; expenses: number; net: number };
  } | null;
  charts: {
    assetClassData: PieChartData[];
    assetData: PieChartData[];
    liquidityData: PieChartData[];
  };
  flags: {
    assetCount: number;
    hasCostBasisTracking: boolean;
    hasTERTracking: boolean;
    hasStampDuty: boolean;
    currentMonthSnapshotExists: boolean;
  };
  freshness: {
    source: 'materialized_summary' | 'live_recompute';
    updatedAt: string;
    computedAt: string;
    sourceVersion: number;
    stale: boolean;
  };
}
```

## Migrazione della pagina Panoramica
La pagina `/dashboard` deve migrare da quattro sorgenti client a:

- una sola query `useDashboardOverview()`
- la mutation snapshot esistente

La query overview deve restituire:

- KPI finali
- variazioni mensili e YTD
- riepilogo spese mese corrente/precedente
- dataset grafici già pronti
- flag di rendering condizionale

La pagina non deve più:

- derivare localmente metriche overview da asset completi
- caricare tutti gli snapshot solo per ottenere le variazioni base
- leggere settings separati per decidere logiche che il server può già risolvere

## Summary materializzato
Introdurre un documento persistito:

```ts
dashboardOverviewSummaries/{userId}
```

### Contenuto del summary
Il documento deve contenere:

- payload overview già serializzabile
- `updatedAt`
- `computedAt`
- `sourceVersion`
- eventuali metadati minimi per debug

### Regole di utilizzo
- se il summary esiste ed è fresco, la route lo restituisce
- se manca o è stale, la route ricompone live e aggiorna il summary
- il client non legge direttamente il documento materializzato
- la Panoramica parla solo con la route privata

### Definizione di stale
Usare una policy esplicita:

- stale immediato dopo mutazioni note che toccano overview
- stale temporale come rete di sicurezza, ad esempio TTL breve per evitare drift silenziosi

## Eventi che invalidano o rigenerano il summary
Eventi obbligatori:

- creazione asset
- update asset
- delete asset
- update prezzo asset che modifica i KPI
- creazione snapshot
- overwrite snapshot del mese corrente
- creazione spesa
- update spesa
- delete spesa
- creazione entrata
- update entrata
- delete entrata
- cambio settings che impattano overview:
  - `stampDutyEnabled`
  - `stampDutyRate`
  - `checkingAccountSubCategory`

Strategia consigliata:

- dopo la mutazione applicativa, marcare il summary come invalido o rigenerarlo subito
- mantenere la logica in un service condiviso, non dispersa in ogni route o componente

## Persistenza locale Firestore
Prevedere persistenza locale lato client con fallback sicuro:

- tentare cache persistente quando supportata dall'ambiente
- fare fallback a cache in-memory quando IndexedDB o persistenza multi-tab non è disponibile
- non rompere il bootstrap auth/app se la persistenza fallisce

Obiettivo:

- cold load invariato o migliore
- warm load sensibilmente migliore
- meno roundtrip ripetuti per dati già noti

## Implementazione consigliata

### Nuovi moduli
- `types/dashboardOverview.ts`
- `lib/services/dashboardOverviewService.ts`
- `lib/hooks/useDashboardOverview.ts`
- `app/api/dashboard/overview/route.ts`

### Responsabilità
- `dashboardOverviewService`
  - legge summary materializzato
  - ricompone live quando necessario
  - produce `DashboardOverviewPayload`
- `useDashboardOverview`
  - usa React Query con chiave dedicata
  - effettua fetch autenticato
- route API
  - autentica
  - delega al service
  - restituisce JSON pronto

## Criteri di accettazione
- La Panoramica usa una sola query client per il caricamento dati.
- Il server non si fida del `userId` client-side.
- Il payload contiene solo i dati realmente usati dalla Panoramica.
- Il summary materializzato è aggiornabile e ha fallback live.
- Il warm-load migliora rispetto alla pipeline attuale.
- I numeri mostrati in overview restano invariati rispetto alla logica corrente.

## Test
- `npx tsc --noEmit`
- Test unitari del service overview con dataset sintetici piccoli e grandi
- Test route auth/ownership sul nuovo endpoint overview
- Validazione manuale:
  - account ricco sul desktop problematico
  - stesso account su Mac
  - account leggero sullo stesso desktop
  - cold load
  - warm load dopo cache locale/persistenza
  - creazione snapshot e successivo refresh overview

## Prompt di implementazione
```text
Implementa solo la nuova pipeline dati della Panoramica e l'ottimizzazione Firebase.

Prima di iniziare, leggi integralmente questo file:
- docs/performances/03-overview-data-pipeline-and-firebase.md

Obiettivo:
- introdurre GET /api/dashboard/overview come route privata autenticata
- definire il tipo DashboardOverviewPayload
- migrare /dashboard a una sola query overview più la mutation snapshot esistente
- aggiungere il summary materializzato dashboardOverviewSummaries/{userId}
- prevedere persistenza locale Firestore con fallback sicuro

Vincoli:
- il server deve usare requireFirebaseAuth e non fidarsi di userId client-side
- il client deve usare authenticatedFetch
- il payload deve includere solo KPI, variazioni, expenseStats, charts, flags e freshness usati dalla Panoramica
- il summary materializzato deve avere fallback a ricomputazione live quando mancante o stale

Output atteso:
- pipeline overview più leggera
- una sola query client per la Panoramica
- summary materializzato con invalidazione esplicita
- warm-load migliori senza regressioni sui numeri mostrati
```
