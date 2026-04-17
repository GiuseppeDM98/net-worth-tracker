# Sessione B - Error Handling

## Obiettivo

Rendere l'error handling piu esplicito, osservabile e coerente, mantenendo invariato il comportamento del path felice.

## Ambito

Focus solo su:

- `catch` silenziosi o troppo generici
- `.catch(() => {})`
- logging insufficiente
- rethrow che perdono contesto utile
- distinzione piu chiara tra errore expected e unexpected

Non fare in questa sessione:

- refactor architetturali
- grandi estrazioni di funzioni
- cambiamenti funzionali

## File candidati iniziali

- `app/dashboard/cashflow/page.tsx`
- `components/cashflow/BudgetTab.tsx`
- `lib/services/assetService.ts`
- `lib/services/performanceService.ts`
- `app/api/dashboard/overview/invalidate/route.ts`

## Criteri di completamento

- nessun swallow silenzioso nei file toccati
- messaggi di errore piu diagnostici
- fallback non fatali ma espliciti
- test o verifiche mirate eseguite

## Prompt pronto

```text
In questa sessione vorrei affrontare la Sessione B del piano di allineamento a DEVELOPMENT_GUIDELINES.md: Error Handling.

Contesto:
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALA mentre scrivi codice
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALA mentre scrivi codice
- Leggi docs/development-guidelines-alignment/session-b-error-handling.md e segui questa specifica

Obiettivo della sessione:
- migliorare l'error handling nei file toccati
- mantenere invariato il comportamento del path felice
- aumentare osservabilita e chiarezza diagnostica

Vincoli:
- lavora solo sulla categoria Error Handling
- non fare grandi refactor strutturali
- non cambiare la business logic
- non introdurre nuove feature
- se un fallback non fatale e corretto, mantienilo ma rendilo esplicito

Ambito iniziale consigliato:
- app/dashboard/cashflow/page.tsx
- components/cashflow/BudgetTab.tsx
- lib/services/assetService.ts
- lib/services/performanceService.ts
- app/api/dashboard/overview/invalidate/route.ts

Cosa voglio in output:
1. Migliora l'error handling seguendo DEVELOPMENT_GUIDELINES.md
2. Elimina swallow error silenziosi nei file toccati
3. Mantieni i messaggi utente coerenti con il prodotto
4. Aggiorna docs/development-guidelines-alignment/session-b-error-handling.md aggiungendo una breve sezione finale con:
   - file toccati
   - pattern di errore migliorati
   - fallback mantenuti intenzionalmente
5. Esegui verifica finale:
   - test mirati o typecheck sui file toccati
6. Nel resoconto finale indicami:
   - quali error path hai reso piu espliciti
   - quali fallback hai mantenuto e perche
   - quali aree restano da trattare in Sessione C o D
```
