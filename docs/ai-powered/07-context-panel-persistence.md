# Step 7 - Context Panel Persistence

## Obiettivo
Rendere il pannello "Contesto numerico" persistente tra i reload di pagina e i cambi di thread, evitando che l'utente debba rilanciare l'analisi per rivedere i dati del mese.

## Problema attuale
`AssistantContextCard` è popolato dall'evento SSE `context` emesso durante lo streaming. Il bundle vive solo nello state React: al reload o al cambio di thread il pannello scompare anche se il thread ha un `pinnedMonth` e i dati esistono già su Firestore.

## UX finale
- Aprendo un thread di tipo `month_analysis` con `pinnedMonth` valorizzato, il pannello contesto appare subito nella sidebar destra, senza dover rilanciare l'analisi.
- Il pannello mostra uno skeleton mentre il bundle viene ricostruito.
- Se il bundle non può essere costruito (dati insufficienti), il pannello mostra il fallback "Nessun dato disponibile" già presente in `AssistantContextCard`.

## Contratti dati/API

### Nuova route GET
`GET /api/ai/assistant/context?userId=&year=&month=`

- Autenticata con `requireFirebaseAuth` + `assertSameUser`.
- Chiama `buildAssistantMonthContext(userId, { year, month })` e restituisce il bundle JSON.
- Nessuno streaming — risposta sincrona.

```ts
// Response body
{ bundle: AssistantMonthContextBundle }
```

### Hook client
```ts
// lib/hooks/useAssistantMonthContext.ts
export function useAssistantMonthContext(
  userId: string | undefined,
  month: AssistantMonthSelectorValue | null
): UseQueryResult<AssistantMonthContextBundle>
```

- Query key: `['assistant', 'context', userId, year, month]`
- Disabilitata quando `userId` o `month` sono null.
- `staleTime: 5 * 60 * 1000` — il bundle è stabile per 5 minuti (i dati di un mese passato non cambiano spesso).

## Implementazione

### Pagina `AssistantPageClient.tsx`
- Quando `threadDetail` si carica e `streamingMessages` è vuoto:
  - se `thread.pinnedMonth` esiste → attivare la query `useAssistantMonthContext`
  - se il bundle SSE è già presente (streaming appena finito) → non fare fetch, usare quello
- La query risultante popola `contextBundle` via `useEffect` (solo se `contextBundle` è null).
- La priorità è sempre: bundle SSE > bundle fetched.

### Skeleton
Aggiungere uno stato skeleton in `AssistantContextCard` quando i dati sono in caricamento:
```tsx
if (isLoading) return <AssistantContextCardSkeleton />;
```

## Costi e trade-off
- **Pro**: UX più fluida, il pannello è sempre presente per thread con mese pinned.
- **Contro**: una chiamata Firestore in più ad ogni apertura di thread (3 query: snapshots, expenses, settings). Per thread di mesi passati i dati sono immutabili — `staleTime` lungo riduce il numero di fetch effettivi.
- **Alternativa scartata**: persistere il bundle in Firestore sul thread — accoppiamento eccessivo tra layer streaming e layer storage.

## Test
- `npx tsc --noEmit`
- Aprire un thread `month_analysis` esistente → il pannello appare senza rilanciare l'analisi
- Reload pagina → pannello visibile entro il tempo di caricamento del threadDetail
- Thread `chat` senza `pinnedMonth` → nessuna query attivata, nessun pannello

## Prompt di implementazione
```text
Implementa lo step 7 dell'Assistente AI: persistenza del pannello contesto numerico.

Prima di iniziare, leggi integralmente questo file:
- docs/ai-powered/07-context-panel-persistence.md

Leggi anche:
- components/assistant/AssistantContextCard.tsx
- components/assistant/AssistantPageClient.tsx

Obiettivo:
- aggiungere GET /api/ai/assistant/context per ricostruire il bundle senza streaming
- aggiungere hook useAssistantMonthContext con staleTime appropriato
- nella pagina, attivare il fetch quando threadDetail ha pinnedMonth e non c'e' bundle SSE attivo
- aggiungere skeleton in AssistantContextCard durante il caricamento
```
