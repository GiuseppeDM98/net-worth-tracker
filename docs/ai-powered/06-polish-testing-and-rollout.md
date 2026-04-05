# Step 6 - Polish, Testing and Rollout

## Obiettivo
Portare l'Assistente AI a uno stato realmente distribuibile: UX rifinita, fallback robusti, limiti di costo e latenza espliciti, checklist finale di test e rollout progressivo.

## UX finale
- La pagina Assistente AI si integra con il linguaggio visivo del prodotto:
  - eyebrow label
  - `h1`
  - separatore `border-b border-border`
  - azione primaria chiara
- Loading, empty state, error state e streaming state sono leggibili e coerenti su desktop e mobile.
- Motion sobria:
  - reveal iniziale della pagina una sola volta
  - nessun replay completo su ogni nuovo messaggio
  - composer e sidebar thread stabili
- Se l'AI è temporaneamente indisponibile, l'utente può comunque navigare thread e memoria senza perdere fiducia nel prodotto.

## Contratti dati/API

### Limiti operativi
- `POST /api/ai/assistant/stream`
  - `max_tokens` di default più basso della route performance, salvo necessità motivata
  - `web_search max_uses`:
    - `month_analysis`: max 2
    - `chat`: max 3 solo se prompt macro/geopolitico
- Timeout applicativo lato UI:
  - mostrare stato “Sta impiegando più del previsto...” dopo soglia ragionevole
- Log server-side:
  - route
  - mode
  - uso web search sì/no
  - retryable error sì/no
  - nessun log di contenuti sensibili completi

### Rollout
- Feature flag consigliata:
  - `NEXT_PUBLIC_ASSISTANT_AI_ENABLED=true|false`
- Se `false`, nascondere la voce di navigazione e impedire accesso diretto con stato `404` o redirect controllato.

## Implementazione
- Rifiniture UI:
  - skeleton dedicato `components/assistant/AssistantPageSkeleton.tsx`
  - sticky composer footer, senza rompere gli overlay
  - pannelli scrollabili localmente, non pagina intera quando non serve
- Copy finale in italiano:
  - niente testo troppo tecnico senza spiegazione
  - macro/geopolitica solo quando utile al portafoglio
- Fallback senza web search:
  - se Anthropic tool web non è disponibile, la chat deve comunque rispondere sui dati di portafoglio
- Cost control:
  - evita contesto sproporzionato nei prompt
  - invia a Claude solo il bundle necessario, non interi dump di snapshot o transazioni
- Manual QA script da seguire prima merge:
  1. navigazione desktop e mobile
  2. primo accesso
  3. analisi mese
  4. chat libera
  5. thread history
  6. memoria
  7. feature flag off
  8. reduce motion

## Stati ed errori
- Feature flag off: route non accessibile dal prodotto.
- AI overloaded: messaggio amichevole con retry.
- Nessuna connessione o stream abortito: mantieni i messaggi precedenti e il draft locale.
- Se la memoria non carica ma i thread sì, la pagina resta usabile.

## Criteri di accettazione
- L'Assistente AI appare come feature nativa del dashboard, non come esperimento isolato.
- La pagina è solida su mobile portrait, inclusa la convivenza con la bottom nav.
- Il costo operativo è contenuto da policy e limiti chiari.
- Esiste una checklist finale che copre UI, auth, dati, stream e fallback.

## Test
- `npx tsc --noEmit`
- `npx vitest run __tests__/apiAuthRoutes.test.ts`
- Test dedicati assistant:
  - `__tests__/assistantMonthContextService.test.ts`
  - `__tests__/assistantPromptRouting.test.ts`
  - eventuali test thread/memory service
- Manual validation:
  - desktop
  - mobile portrait
  - reduced motion
  - feature flag off
  - assenza chiave Anthropic
  - fallback senza web search

## Prompt di implementazione
```text
Implementa lo step 6 dell'Assistente AI: polish, test e rollout.

Prima di iniziare, leggi integralmente questo file:
- docs/ai-powered/06-polish-testing-and-rollout.md

Obiettivo:
- rifinire UX e stati della pagina Assistente AI
- aggiungere feature flag di rollout
- consolidare limiti costo/latenza e fallback senza web search
- chiudere la checklist finale di validazione

Vincoli:
- rispetta le convenzioni visive del dashboard
- mobile portrait compatibile con bottom nav
- motion sobria e senza replay inutili
- non inviare a Claude dump eccessivi di dati
- la nuova funzionalità deve essere fruibile e ottimizzata per desktop, tablet e mobile

Output atteso:
- feature pronta per rollout controllato
- test e checklist finale documentati
- fallback robusti per key assente, overloaded e web search indisponibile
```
