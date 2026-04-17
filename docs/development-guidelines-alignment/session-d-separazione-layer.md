# Sessione D - Separazione Layer

## Obiettivo

Separare in modo piu netto controller/API, use case/service e accesso a persistenza o integrazioni esterne.

## Ambito

Focus solo su:

- assottigliare route/controller
- spostare business logic fuori dagli handler HTTP
- creare moduli server-side piu testabili
- concentrare I/O e accesso Admin SDK in punti dedicati

Non fare in questa sessione:

- refactor cosmetici non collegati allo scopo
- cambiamenti di prodotto non necessari
- modifiche troppo ampie senza test solidi

## File candidati iniziali

- `app/api/dividends/route.ts`
- `app/api/ai/assistant/stream/route.ts`
- `app/api/cron/daily-dividend-processing/route.ts`
- `app/api/performance/current-yield/route.ts`
- `app/api/performance/yoc/route.ts`
- `lib/services/pdfDataService.ts`

## Criteri di completamento

- route/controller piu sottili
- logica di business spostata in moduli testabili
- dipendenze piu esplicite
- test di integrazione o unitari sufficienti per coprire i flussi toccati

## Prompt pronto

```text
In questa sessione vorrei affrontare la Sessione D del piano di allineamento a DEVELOPMENT_GUIDELINES.md: Separazione layer.

Contesto:
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALA mentre scrivi codice
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALA mentre scrivi codice
- Leggi docs/development-guidelines-alignment/session-d-separazione-layer.md e segui questa specifica

Obiettivo della sessione:
- separare meglio controller/API, service/use case e accesso dati
- ridurre la business logic dentro route e cron handler
- lasciare il comportamento invariato

Vincoli:
- lavora solo sulla categoria Separazione layer
- prima di intervenire su file critici, verifica copertura test esistente
- se la copertura e insufficiente, aggiungi test mirati prima delle estrazioni piu rischiose
- fai refactor in piccoli passi verificabili
- non mischiare interventi cosmetici non necessari

Ambito iniziale consigliato:
- app/api/dividends/route.ts
- app/api/ai/assistant/stream/route.ts
- app/api/cron/daily-dividend-processing/route.ts
- app/api/performance/current-yield/route.ts
- app/api/performance/yoc/route.ts
- lib/services/pdfDataService.ts

Cosa voglio in output:
1. Separa i layer nei file toccati seguendo DEVELOPMENT_GUIDELINES.md
2. Mantieni le route sottili e sposta la business logic in moduli testabili
3. Evita big bang refactor: procedi per step piccoli
4. Aggiorna docs/development-guidelines-alignment/session-d-separazione-layer.md aggiungendo una breve sezione finale con:
   - layer separati
   - nuovi moduli introdotti
   - test aggiunti
   - rischi residui
5. Esegui verifica finale:
   - test di integrazione o unitari sui flussi toccati
   - typecheck o verifica mirata
6. Nel resoconto finale indicami:
   - quali responsabilita hai spostato fuori dalle route
   - quali file sono diventati piu sottili
   - quali aree restano critiche e richiedono ulteriori passaggi
```
