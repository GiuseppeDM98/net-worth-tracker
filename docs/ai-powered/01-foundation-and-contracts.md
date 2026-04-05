# Step 1 - Foundation and Contracts

## Obiettivo
Definire la base architetturale dell'Assistente AI come feature di primo livello del dashboard, con un contratto dati stabile, API private coerenti con il progetto, guardrail chiari e una policy esplicita su quando Claude può usare la web search.

## UX finale
- L'utente trova `Assistente AI` nella navigazione secondaria sotto `Analisi`, insieme a `Allocazione`, `Rendimenti`, `Storico` e `Hall of Fame`.
- Su desktop l'entry compare in [Sidebar](/Users/giuseppedimaio/Documents/Github.nosync/net-worth-tracker/components/layout/Sidebar.tsx); su mobile portrait compare in [SecondaryMenuDrawer](/Users/giuseppedimaio/Documents/Github.nosync/net-worth-tracker/components/layout/SecondaryMenuDrawer.tsx) e il relativo `href` viene aggiunto anche a `secondaryHrefs` in [BottomNavigation](/Users/giuseppedimaio/Documents/Github.nosync/net-worth-tracker/components/layout/BottomNavigation.tsx).
- La route dedicata è `/dashboard/assistant`.
- La pagina mostra tre aree principali:
  - header editoriale coerente con il resto del prodotto;
  - shell principale della conversazione;
  - pannello contestuale con mese attivo, prompt suggeriti e stato memoria.
- Se `ANTHROPIC_API_KEY` non è configurata, la pagina resta accessibile ma mostra uno stato vuoto bloccante con spiegazione e CTA secondaria per tornare indietro.

## Contratti dati/API

### Nuovi tipi
Creare `types/assistant.ts` con i seguenti tipi:

```ts
export type AssistantMode = 'month_analysis' | 'chat';

export type AssistantWebContextMode = 'portfolio_only' | 'hybrid';

export interface AssistantPromptChip {
  id: string;
  label: string;
  prompt: string;
  mode: AssistantMode;
  requiresMonthContext: boolean;
  webContextHint?: 'none' | 'optional' | 'macro';
}

export interface AssistantMonthSelectorValue {
  year: number;
  month: number;
}

export interface AssistantPreferences {
  responseStyle: 'balanced' | 'concise' | 'deep';
  includeMacroContext: boolean;
  memoryEnabled: boolean;
}

export interface AssistantMonthContext {
  year: number;
  month: number;
  monthLabel: string;
  hasSnapshot: boolean;
  hasPreviousBaseline: boolean;
  hasCashflowData: boolean;
  summary: {
    startNetWorth: number | null;
    endNetWorth: number | null;
    netWorthDelta: number | null;
    netWorthDeltaPct: number | null;
    totalIncome: number;
    totalExpenses: number;
    totalDividends: number;
    netCashFlow: number;
  };
  topChanges: {
    assetClass: string;
    absoluteChange: number;
    percentagePointsChange: number | null;
  }[];
}

export interface AssistantThread {
  id: string;
  userId: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  lastMessagePreview: string;
  mode: AssistantMode;
  pinnedMonth?: AssistantMonthSelectorValue | null;
}

export interface AssistantMessage {
  id: string;
  threadId: string;
  userId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: Date;
  mode: AssistantMode;
  monthContext?: AssistantMonthSelectorValue | null;
  webSearchUsed?: boolean;
}

export interface AssistantMemoryItem {
  id: string;
  userId: string;
  category: 'goal' | 'preference' | 'risk' | 'fact';
  text: string;
  sourceThreadId?: string;
  sourceMessageId?: string;
  createdAt: Date;
  updatedAt: Date;
  status: 'active' | 'archived';
}
```

### Nuove API
- `POST /api/ai/assistant/stream`
  - route privata con `requireFirebaseAuth()` e `assertSameUser()`
  - input:

```ts
{
  userId: string;
  mode: 'month_analysis' | 'chat';
  prompt: string;
  threadId?: string;
  month?: { year: number; month: number };
  preferences?: AssistantPreferences;
}
```

  - output: SSE `data: {JSON}\n\n` con eventi:

```ts
type AssistantStreamEvent =
  | { type: 'meta'; threadId?: string; title?: string }
  | { type: 'text'; text: string }
  | { type: 'status'; status: 'searching' | 'writing' | 'saving' }
  | { type: 'done'; threadId?: string; messageId?: string; webSearchUsed: boolean }
  | { type: 'error'; error: string; retryable?: boolean };
```

- `GET /api/ai/assistant/threads`
  - restituisce l'elenco dei thread utente, ordinati per `updatedAt desc`
- `POST /api/ai/assistant/threads`
  - crea un nuovo thread vuoto o seedato con `mode` e `pinnedMonth`
- `GET /api/ai/assistant/threads/[threadId]`
  - restituisce metadata thread + ultimi messaggi in ordine cronologico
- `GET /api/ai/assistant/memory`
  - restituisce preferenze e memoria attiva
- `PATCH /api/ai/assistant/memory`
  - aggiorna preferenze o singoli item memoria
- `DELETE /api/ai/assistant/memory`
  - elimina un item memoria o resetta completamente la memoria su richiesta esplicita

### Persistenza Firestore
- `assistantThreads/{threadId}`
  - campi: `userId`, `title`, `mode`, `pinnedMonth`, `lastMessagePreview`, `createdAt`, `updatedAt`
- `assistantThreads/{threadId}/messages/{messageId}`
  - campi: `userId`, `role`, `content`, `mode`, `monthContext`, `webSearchUsed`, `createdAt`
- `assistantMemory/{userId}`
  - campi:
    - `preferences`
    - `items`
    - `updatedAt`
- Le preferenze esplicite dell'assistente devono essere duplicate anche in `AssetAllocationSettings` solo per i campi che servono altrove nel prodotto:
  - `assistantResponseStyle?: 'balanced' | 'concise' | 'deep'`
  - `assistantMacroContextEnabled?: boolean`
  - `assistantMemoryEnabled?: boolean`
- Se si introducono questi campi in `AssetAllocationSettings`, aggiornare obbligatoriamente tipo, `getSettings()` e entrambi i branch di `setSettings()`.

## Implementazione
- Creare [app/dashboard/assistant/page.tsx](/Users/giuseppedimaio/Documents/Github.nosync/net-worth-tracker/app/dashboard/assistant/page.tsx) come route protetta client-side, senza `useAllExpenses`.
- Creare [app/api/ai/assistant/stream/route.ts](/Users/giuseppedimaio/Documents/Github.nosync/net-worth-tracker/app/api/ai/assistant/stream/route.ts) riusando il pattern SSE della route esistente [app/api/ai/analyze-performance/route.ts](/Users/giuseppedimaio/Documents/Github.nosync/net-worth-tracker/app/api/ai/analyze-performance/route.ts), ma con envelope eventi più ricco.
- Estrarre la logica comune Anthropic in un modulo condiviso, ad esempio `lib/server/assistant/anthropicStream.ts`, evitando di duplicare parsing e headers SSE.
- Aggiungere query keys dedicate in [lib/query/queryKeys.ts](/Users/giuseppedimaio/Documents/Github.nosync/net-worth-tracker/lib/query/queryKeys.ts):
  - `assistant.threads(userId)`
  - `assistant.thread(threadId)`
  - `assistant.memory(userId)`
- Creare hook React Query dedicati in `lib/hooks/useAssistantThreads.ts` e `lib/hooks/useAssistantMemory.ts`.
- Navigation update:
  - `Sidebar.tsx`: aggiungere `{ name: 'Assistente AI', href: '/dashboard/assistant', icon: Bot }`
  - `SecondaryMenuDrawer.tsx`: aggiungere la route dentro `Analisi`
  - `BottomNavigation.tsx`: aggiornare `secondaryHrefs`
- La web search non è sempre attiva:
  - `month_analysis`: `web_search` attiva solo se `preferences.includeMacroContext === true`
  - `chat`: `web_search` attiva solo per prompt macro/geopolitici o esplicita richiesta dell'utente
- Il rilevamento prompt “macro/geopolitico” deve essere locale e semplice, con funzione pura tipo `shouldUseWebSearch(prompt: string): boolean`; niente classificatori esterni.
- Il titolo automatico del thread non deve essere generato lato client: va deciso lato server per coerenza.

## Stati ed errori
- Nessuna API key: errore server `500` con messaggio esplicito, UI con stato vuoto non distruttivo.
- Thread non trovato o non appartenente all'utente: `404` o `403` lato server, mai fallback silenzioso.
- Stream interrotto: UI mostra risposta parziale, badge “interrotta”, CTA `Riprova`.
- Anthropic overloaded: mappare a `503` con `retryable: true`.
- Se la web search è disabilitata o non richiesta, non mostrare errori; il meta evento deve semplicemente segnalare `webSearchUsed: false`.

## Criteri di accettazione
- Esiste una nuova route `/dashboard/assistant` raggiungibile da desktop e mobile portrait.
- Tutte le nuove API private usano auth server-side con binding al vero `uid`.
- Il contratto SSE supporta `meta`, `text`, `status`, `done`, `error`.
- La feature non introduce un secondo client Anthropic duplicato: l'orchestrazione resta lato server.
- I nuovi tipi Assistant sono centralizzati in `types/assistant.ts`.

## Test
- `npx tsc --noEmit`
- Test unitari per `shouldUseWebSearch()`
- Test auth route-handler per `POST /api/ai/assistant/stream`, `GET/POST /threads`, `GET/PATCH/DELETE /memory`
- Validazione manuale:
  - route presente in sidebar e drawer
  - stato chiave Anthropic assente
  - SSE progressivo e chiusura con `done`

## Prompt di implementazione
```text
Implementa lo step 1 dell'Assistente AI in Net Worth Tracker.

Prima di iniziare, leggi integralmente questo file:
- docs/ai-powered/01-foundation-and-contracts.md

Obiettivo:
- introdurre la route /dashboard/assistant nella navigazione secondaria
- creare i tipi condivisi assistant
- creare i contratti React Query e le API private di base
- standardizzare la route SSE POST /api/ai/assistant/stream con auth server-side e policy web search opzionale

Vincoli:
- usa i pattern già presenti in app/api/ai/analyze-performance/route.ts
- tutte le stringhe UI in italiano
- niente useAllExpenses nella dashboard overview
- aggiorna anche BottomNavigation secondaryHrefs e SecondaryMenuDrawer
- se aggiungi nuovi settings assistant, aggiorna type + getSettings() + entrambi i branch di setSettings()
- la nuova funzionalità deve essere fruibile e ottimizzata per desktop, tablet e mobile

Output atteso:
- route /dashboard/assistant raggiungibile
- nuovi tipi assistant
- nuovi hook/query keys base
- API scaffold funzionanti con auth, error handling e contratto SSE definito
- test auth e typecheck verde
```
