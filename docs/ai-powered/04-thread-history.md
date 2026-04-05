# Step 4 - Thread History

## Obiettivo
Persistire le conversazioni dell'Assistente AI in thread recuperabili, così l'utente può riprendere un'analisi precedente, creare una nuova chat e ritrovare il contesto senza perdere continuità.

## UX finale
- Colonna o drawer laterale `Conversazioni`.
- Lista thread ordinata per aggiornamento:
  - titolo
  - preview ultima risposta
  - data relativa o `DD/MM/YYYY`
  - badge opzionale del mese pinnato
- CTA `Nuova chat`.
- All'apertura della pagina:
  - se esistono thread, si apre l'ultimo aggiornato;
  - altrimenti stato hero iniziale.
- Se lo stream fallisce, l'utente può fare retry nello stesso thread senza perdere i messaggi già presenti.

## Contratti dati/API

### Documento thread
Collezione `assistantThreads/{threadId}`:

```ts
{
  userId: string;
  title: string;
  mode: 'month_analysis' | 'chat';
  pinnedMonth?: { year: number; month: number } | null;
  lastMessagePreview: string;
  messageCount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### Subcollection messaggi
`assistantThreads/{threadId}/messages/{messageId}`:

```ts
{
  userId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  mode: 'month_analysis' | 'chat';
  monthContext?: { year: number; month: number } | null;
  webSearchUsed?: boolean;
  createdAt: Timestamp;
}
```

### API
- `GET /api/ai/assistant/threads`
  - lista thread dell'utente, senza caricare tutti i messaggi
- `POST /api/ai/assistant/threads`
  - crea thread vuoto
- `GET /api/ai/assistant/threads/[threadId]`
  - restituisce thread + messaggi
- opzionale ma consigliato: `DELETE /api/ai/assistant/threads/[threadId]`
  - non richiesto dal piano minimo, ma utile per cleanup utente

### Regole titolo thread
- Primo messaggio utente utile genera il titolo.
- Priorità:
  - prompt esplicito se breve e leggibile
  - altrimenti titolo normalizzato per mode:
    - `Analisi 03/2026`
    - `Discussione patrimonio`
    - `Scenario macro e geopolitica`
- Max 60 caratteri.
- Niente generazione lato client con euristiche divergenti.

## Implementazione
- Hook:
  - `useAssistantThreads(userId)`
  - `useAssistantThread(threadId)`
  - `useCreateAssistantThread(userId)`
- Invalidation:
  - dopo nuovo messaggio assistant, invalidare thread list e thread corrente
- La route `POST /api/ai/assistant/stream` deve:
  - creare un thread se `threadId` manca
  - salvare messaggio user prima dello stream
  - accumulare la risposta assistant server-side
  - salvare il messaggio assistant solo a fine stream
  - aggiornare il thread con `lastMessagePreview`, `updatedAt`, `messageCount`
- Se lo stream cade a metà:
  - non salvare un messaggio assistant monco come finale
  - ma opzionalmente salvare metadata di errore nel thread in futuro; non in questo step

## Stati ed errori
- Thread ID non appartenente all'utente: `404` o `403`.
- Thread senza messaggi: shell vuota con CTA per avviare la conversazione.
- Lista thread lunga: usare scroll locale, non pagina intera.
- Retry:
  - `Riprova` reinvia l'ultimo prompt utente nello stesso thread
  - non creare un nuovo thread

## Criteri di accettazione
- L'ultimo thread si riapre automaticamente.
- `Nuova chat` crea un contesto pulito.
- Il retry resta nello stesso thread.
- I messaggi vengono sempre mostrati in ordine cronologico stabile.

## Test
- `npx tsc --noEmit`
- Test auth per `GET/POST /threads` e `GET /threads/[threadId]`
- Test unitari per `generateAssistantThreadTitle()`
- Validazione manuale:
  - nuova chat
  - ripristino ultimo thread
  - retry stesso thread
  - switching fra thread

## Prompt di implementazione
```text
Implementa lo step 4 dell'Assistente AI: cronologia thread persistente.

Prima di iniziare, leggi integralmente questo file:
- docs/ai-powered/04-thread-history.md

Obiettivo:
- aggiungere assistantThreads con subcollection messages
- mostrare lista conversazioni in /dashboard/assistant
- ripristinare automaticamente l'ultimo thread
- supportare Nuova chat e retry nello stesso thread

Vincoli:
- tutte le API devono verificare ownership reale via Firebase token
- il titolo thread è deciso lato server
- salva il messaggio assistant solo quando lo stream termina correttamente
- invalida le query thread list e thread detail dopo mutazioni
- la nuova funzionalità deve essere fruibile e ottimizzata per desktop, tablet e mobile

Output atteso:
- thread persistenti e navigabili
- ultimo thread ripristinato
- retry senza perdere contesto
```
