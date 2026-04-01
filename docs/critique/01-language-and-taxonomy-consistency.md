# Spec 01 - Coerenza di Linguaggio e Tassonomia

## Issue
L'interfaccia usa una tassonomia mista tra italiano, inglese e linguaggio specialistico non sempre mediato. Questo rompe la sensazione di prodotto curato e alza il carico cognitivo, soprattutto nella navigazione, nelle sezioni ad alta densita e nei nomi delle feature.

## Severity
P1

## Intento di design
Portare il prodotto verso un tono premium-editoriale, mantenendo precisione finanziaria ma eliminando il feeling da dashboard tecnica assemblata. Il lessico deve sembrare scelto, non semplicemente ereditato da naming interni o convenzioni di libreria.

## Problemi osservati
- Sidebar con naming misto: `Overview`, `Assets`, `Allocation`, `Performance`, `History`, `Hall of Fame`, `Settings` convivono con `FIRE e Simulazioni` e `Cashflow`.
- Alcune sezioni mantengono termini inglesi dove non aggiungono valore percepito.
- In Performance compaiono metriche tecniche come `Time-Weighted Return`, `Money-Weighted Return`, `Sharpe Ratio`, `Yield on Cost`, `Current Yield` senza una tassonomia generale chiaramente stratificata tra nome, alias e spiegazione.
- La stessa app alterna tono pratico-operativo, tono tecnico e tono consumer.

## Outcome desiderato
- Una lingua principale chiara per l'interfaccia.
- Terminologia tecnica solo dove necessaria, sempre in un sistema coerente.
- Nomi delle sezioni che sembrano parte dello stesso prodotto.
- Migliore leggibilita per first-timer senza impoverire il lessico per power user.

## Scope
- Navigazione principale e secondaria.
- Titoli di pagina e titoli di tab.
- Nomi di metriche e relativi sottotitoli.
- Microcopy di supporto e CTA principali.
- Eventuali spiegazioni di metriche ad alta complessita.

## File e aree da verificare
- `components/layout/Sidebar.tsx`
- `components/layout/BottomNavigation.tsx`
- `components/layout/SecondaryMenuDrawer.tsx`
- `app/dashboard/performance/page.tsx`
- `app/dashboard/fire-simulations/page.tsx`
- `app/dashboard/cashflow/page.tsx`
- `app/dashboard/history/page.tsx`
- `app/login/page.tsx`
- `app/register/page.tsx`

## Decisioni UX/UI da implementare
- Scegliere l'italiano come lingua dominante per tutta la UI.
- Tenere i termini tecnici internazionali solo quando sono standard di dominio e hanno valore reale per l'utente evoluto.
- Per le metriche tecniche, usare questo modello:
  - nome principale chiaro
  - eventuale sigla o termine tecnico come supporto
  - spiegazione breve contestuale
- Allineare i nomi della navigazione a una famiglia semantica unica, evitando ibridi casuali.
- Verificare che il tono complessivo sia sobrio, preciso e personale, non scolastico o burocratico.

## Proposte di direzione
- `Overview` -> valutare `Panoramica`
- `Assets` -> valutare `Patrimonio` o `Asset`
- `Allocation` -> valutare `Allocazione`
- `Performance` -> valutare `Rendimenti` o `Performance`
- `History` -> valutare `Storico`
- `Hall of Fame` -> valutare un naming italiano coerente oppure un naming inglese premium ma intenzionale, non isolato
- `Settings` -> `Impostazioni` o `Preferenze` a seconda del ruolo della sezione

Nota: non imporre traduzioni forzate. Se un termine inglese viene mantenuto, deve essere una scelta di prodotto difendibile.

## Acceptance criteria
- L'interfaccia ha una lingua dominante evidente e stabile.
- La navigazione non presenta piu naming ibrido percepito come casuale.
- Le metriche avanzate espongono bene il livello tecnico senza richiedere conoscenza pregressa del dominio.
- Login, register, dashboard e pagine analitiche sembrano parti dello stesso prodotto.
- Il tono percepito e piu premium-editoriale e meno admin template.

## Prompt di implementazione
Implementa la specifica `docs/critique/01-language-and-taxonomy-consistency.md` nel progetto `net-worth-tracker`.

Obiettivo:
- rendere coerente la tassonomia dell'interfaccia
- usare l'italiano come lingua dominante
- mantenere i termini tecnici solo quando davvero utili
- portare la UI verso un tono premium-editoriale, preciso e personale

Vincoli:
- non cambiare la logica applicativa
- non introdurre regressioni nei flussi esistenti
- mantieni tutto il testo utente in italiano
- se mantieni termini inglesi, fallo solo come scelta intenzionale e coerente

Aree da toccare:
- navigazione primaria e mobile
- titoli di pagina
- tab label
- nomi delle metriche e sottotitoli in Performance
- microcopy di login e registrazione se necessario per allineamento tonale

Output atteso:
- implementazione completa
- breve riepilogo delle scelte terminologiche effettuate
- elenco dei file modificati

Dimmi cosa e come testare quanto implementato finora
