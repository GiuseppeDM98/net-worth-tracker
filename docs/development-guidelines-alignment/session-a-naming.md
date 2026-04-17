# Sessione A - Naming

## Obiettivo

Applicare le convenzioni di naming di `DEVELOPMENT_GUIDELINES.md` senza modificare la logica applicativa.

## Ambito

Focus solo su:

- nomi di variabili, parametri, helper e costanti troppo generici o ambigui
- coerenza tra `get` e `fetch` nello stesso layer
- eliminazione di naming che nasconde il contratto reale del dato
- sostituzione di identificatori come `data`, `payload`, `result`, `info`, `handler`, `manager` quando non descrivono il dominio

Non fare in questa sessione:

- refactor strutturali
- estrazione di nuove funzioni solo per cambiare l'architettura
- cambiamenti di comportamento runtime
- cambiamenti di UX

## File candidati iniziali

- `lib/hooks/useAssistantThreads.ts`
- `lib/hooks/useAssistantMonthContext.ts`
- `app/api/portfolio/snapshot/route.ts`
- `app/api/ai/analyze-performance/route.ts`

## Criteri di completamento

- nessun cambiamento logico
- codice piu esplicito e uniforme
- build TypeScript pulita
- se esistono test vicini al file, eseguirli

## Prompt pronto

```text
In questa sessione vorrei affrontare la Sessione A del piano di allineamento a DEVELOPMENT_GUIDELINES.md: Naming.

Contesto:
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALA mentre scrivi codice
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALA mentre scrivi codice
- Leggi docs/development-guidelines-alignment/session-a-naming.md e segui questa specifica

Obiettivo della sessione:
- applicare le convenzioni di naming in modo incrementale e a rischio logico nullo
- rendere il codice piu esplicito e coerente
- NON cambiare il comportamento runtime

Vincoli:
- lavora solo sulla categoria Naming
- non fare refactor strutturali
- non fare separazione layer
- non introdurre modifiche di business logic
- se trovi un punto dubbio, preferisci rinomina locale e sicura

Ambito iniziale consigliato:
- lib/hooks/useAssistantThreads.ts
- lib/hooks/useAssistantMonthContext.ts
- app/api/portfolio/snapshot/route.ts
- app/api/ai/analyze-performance/route.ts

Cosa voglio in output:
1. Applica le convenzioni di naming da DEVELOPMENT_GUIDELINES.md ai file toccati
2. Mantieni diff piccolo e leggibile
3. Aggiorna docs/development-guidelines-alignment/session-a-naming.md aggiungendo una breve sezione finale con:
   - file toccati
   - naming migliorato
   - eventuali rinvii a sessioni future
4. Esegui verifica finale:
   - typecheck o test mirati sui file toccati, se disponibili
5. Nel resoconto finale indicami:
   - cosa hai rinominato
   - cosa hai volutamente lasciato fuori
   - eventuali punti che richiedono la Sessione B o C
```
