# Sessione C - Refactoring Funzioni

## Obiettivo

Applicare SRP alle funzioni troppo grandi o troppo dense, riducendo nesting e responsabilita miste senza ancora cambiare l'architettura dei layer.

## Ambito

Focus solo su:

- estrazione di helper puri o quasi puri
- riduzione di funzioni troppo lunghe
- separazione di step chiaramente distinti nello stesso flow
- flattening del controllo con early return quando utile

Non fare in questa sessione:

- spostamenti massivi tra layer
- creazione di nuove architetture repository/use case
- cambiamenti di comportamento

## File candidati iniziali

- `components/assets/AssetDialog.tsx`
- `components/cashflow/BudgetTab.tsx`
- `app/api/ai/analyze-performance/route.ts`
- `app/api/portfolio/snapshot/route.ts`

## Criteri di completamento

- funzioni principali piu corte e leggibili
- step logici nominabili senza "and"
- logica invariata
- test esistenti verdi e, se mancano, characterization test prima dei refactor rischiosi

## Prompt pronto

```text
In questa sessione vorrei affrontare la Sessione C del piano di allineamento a DEVELOPMENT_GUIDELINES.md: Refactoring funzioni.

Contesto:
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALA mentre scrivi codice
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALA mentre scrivi codice
- Leggi docs/development-guidelines-alignment/session-c-refactoring-funzioni.md e segui questa specifica

Obiettivo della sessione:
- applicare SRP alle funzioni troppo grandi
- ridurre densita, nesting e responsabilita miste
- mantenere invariato il comportamento

Vincoli:
- lavora solo sulla categoria Refactoring funzioni
- prima di refactorare punti a rischio medio, verifica se esistono test
- se i test non coprono abbastanza, aggiungi characterization tests mirati prima di estrarre logica
- non fare ancora separazione layer completa
- non introdurre nuove feature

Ambito iniziale consigliato:
- components/assets/AssetDialog.tsx
- components/cashflow/BudgetTab.tsx
- app/api/ai/analyze-performance/route.ts
- app/api/portfolio/snapshot/route.ts

Cosa voglio in output:
1. Applica SRP alle funzioni nei file toccati seguendo DEVELOPMENT_GUIDELINES.md
2. Estrai helper con nomi espliciti e responsabilita singola
3. Mantieni il diff in step leggibili
4. Aggiorna docs/development-guidelines-alignment/session-c-refactoring-funzioni.md aggiungendo una breve sezione finale con:
   - funzioni estratte
   - motivazione del refactor
   - eventuali aree rinviate alla Sessione D
5. Esegui verifica finale:
   - test esistenti
   - eventuali nuovi test aggiunti
   - typecheck o verifica mirata
6. Nel resoconto finale indicami:
   - quali funzioni hai spezzato
   - quali test proteggono il refactor
   - quali punti restano ancora troppo accoppiati perche richiedono la Sessione D
```
