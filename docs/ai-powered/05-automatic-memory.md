# Step 5 - Automatic Memory

## Obiettivo
Aggiungere una memoria automatica controllata che permetta all'Assistente AI di ricordare informazioni stabili e utili dell'utente, senza trasformare la feature in una black box opaca o troppo invasiva.

## UX finale
- Nella pagina Assistente AI compare un pannello `Memoria`.
- L'utente può:
  - vedere cosa l'assistente ricorda;
  - modificare un item;
  - archiviarlo o cancellarlo;
  - attivare/disattivare la memoria automatica.
- Gli item memoria sono raggruppati in:
  - `Obiettivi`
  - `Preferenze`
  - `Rischio`
  - `Fatti utili`
- Ogni item mostra una piccola provenienza, per esempio “da una conversazione del 05/04/2026”.

## Contratti dati/API

### Documento memoria
Collezione `assistantMemory/{userId}`:

```ts
{
  userId: string;
  preferences: {
    responseStyle: 'balanced' | 'concise' | 'deep';
    includeMacroContext: boolean;
    memoryEnabled: boolean;
  };
  items: AssistantMemoryItem[];
  updatedAt: Timestamp;
}
```

### Regole memoria automatica
- La memoria automatica è limitata a fatti stabili:
  - obiettivi finanziari
  - orizzonte temporale
  - preferenze di risposta
  - propensione o avversione al rischio
  - vincoli dichiarati esplicitamente dall'utente
- Non salvare automaticamente:
  - numeri di mercato temporanei
  - analisi di un singolo mese
  - eventi macro momentanei
  - output inferiti ma non dichiarati
- Ogni item deve contenere riferimento a `sourceThreadId` e, se disponibile, `sourceMessageId`.

### API
- `GET /api/ai/assistant/memory`
  - restituisce documento completo memoria
- `PATCH /api/ai/assistant/memory`
  - supporta:
    - update preferenze
    - edit item
    - archive item
    - create item manuale
- `DELETE /api/ai/assistant/memory`
  - cancella item singolo o reset totale solo con flag esplicito

## Implementazione
- Pipeline raccomandata dopo ogni risposta assistant riuscita:
  1. valutare se l'ultimo scambio contiene materiale memorizzabile
  2. eseguire una seconda chiamata Claude a basso costo oppure una funzione locale dedicata per estrarre candidati memoria
  3. deduplicare i candidati contro gli item attivi esistenti
  4. salvare solo item con testo corto, esplicito e verificabile
- Deduplica minima:
  - stesso `category`
  - testo normalizzato quasi identico
- UI:
  - `components/assistant/AssistantMemoryPanel.tsx`
  - `components/assistant/AssistantMemoryItemRow.tsx`
- Le preferenze esplicite devono continuare a vivere anche in `AssetAllocationSettings` se servono ad altri punti del prodotto.
- Quando `memoryEnabled === false`:
  - non estrarre nuovi item
  - continuare a leggere gli item esistenti solo se la scelta UX è “disattiva apprendimento ma conserva storico”
  - in questa feature scegliere questa semantica: memoria esistente visibile ma non aggiornata automaticamente

## Stati ed errori
- Errore in estrazione memoria: non deve rompere la chat; log server-side e basta.
- Documento memoria assente: inizializzare con defaults, non trattarlo come errore.
- Toggle off: label chiara “L'assistente non salverà nuovi ricordi”.
- Delete totale: richiedere conferma esplicita.

## Criteri di accettazione
- L'utente può vedere, correggere e cancellare la memoria.
- La memoria automatica salva solo fatti stabili.
- Disattivare la memoria blocca nuove estrazioni ma non rompe i thread.
- Nessun item memoria viene creato senza ownership utente verificata.

## Test
- `npx tsc --noEmit`
- Test unitari per:
  - `extractMemoryCandidates()`
  - `dedupeMemoryItems()`
  - gating `memoryEnabled`
- Test auth per `GET/PATCH/DELETE /memory`
- Validazione manuale:
  - creazione automatica item
  - edit item
  - delete item
  - toggle off

## Prompt di implementazione
```text
Implementa lo step 5 dell'Assistente AI: memoria automatica controllata.

Prima di iniziare, leggi integralmente questo file:
- docs/ai-powered/05-automatic-memory.md

Obiettivo:
- salvare fatti stabili e utili estratti dalle chat
- mostrare e gestire la memoria in una UI dedicata
- permettere edit, archive, delete e toggle memoryEnabled

Regole:
- salva solo goal, preferenze, segnali di rischio e fatti stabili espliciti
- non salvare eventi temporanei o analisi mese-specifiche
- se memoryEnabled è false non creare nuovi ricordi
- errori estrazione memoria non devono interrompere la chat
- la nuova funzionalità deve essere fruibile e ottimizzata per desktop, tablet e mobile

Output atteso:
- assistantMemory/{userId} operativo
- pannello memoria in UI
- deduplica base e gestione completa degli item
```
