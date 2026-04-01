# Spec 05 - Discoverability della Navigazione Mobile

## Issue
Su mobile portrait l'app espone direttamente solo tre route e delega il resto a un drawer secondario. Il pattern funziona tecnicamente, ma riduce discoverability e richiede di ricordare dove si trovano feature importanti.

## Severity
P2

## Intento di design
Mantenere una navigazione mobile compatta ma piu chiara, leggibile e intenzionale. L'utente deve percepire che l'app e completa anche su mobile, non che alcune aree siano nascoste dietro una soluzione di compromesso.

## Problemi osservati
- Bottom navigation con `Overview`, `Assets`, `Cashflow` e un generico `Menu`.
- Le aree ad alta importanza come Performance, Storico, Allocazione o FIRE non sono immediatamente visibili in mobile portrait.
- Il drawer secondario puo funzionare, ma va reso piu esplicito e piu informativo.
- L'utente mobile deve ricordare la mappa dell'app invece di riconoscerla.

## Outcome desiderato
- Navigazione mobile piu autoesplicativa.
- Migliore equilibrio tra compattezza e discoverability.
- Accesso alle aree chiave piu leggibile.
- Maggiore sensazione di prodotto rifinito anche in contesto mobile.

## Scope
- Bottom navigation.
- Secondary drawer/menu mobile.
- Eventuali label, grouping o indicatori di contenuto.

## File e aree da verificare
- `components/layout/BottomNavigation.tsx`
- `components/layout/SecondaryMenuDrawer.tsx`
- `components/layout/Sidebar.tsx`
- eventuali wrapper dashboard che gestiscono la shell mobile

## Decisioni UX/UI da implementare
- Rendere meno generico il concetto di `Menu`, valutando naming, affordance o anteprima del contenuto.
- Migliorare il drawer secondario con grouping o gerarchia piu chiara.
- Verificare se le route piu frequenti su mobile siano davvero quelle attuali o se serva riequilibrio.
- Dare all'utente segnali piu chiari su dove si trova e cosa manca nella navigazione primaria.

## Principi di design
- Non nascondere la struttura dell'app piu del necessario.
- Il mobile non deve sembrare una versione amputata.
- Le feature importanti devono essere facili da trovare anche per uso intermittente.
- La soluzione deve restare semplice da usare con una mano.

## Acceptance criteria
- La bottom navigation comunica meglio la struttura dell'app.
- Il drawer secondario e piu chiaro e piu discoverable.
- L'utente mobile impiega meno memoria per trovare le sezioni principali.
- L'esperienza mobile appare piu intenzionale e meno residuale.

## Prompt di implementazione
Implementa la specifica `docs/critique/05-mobile-navigation-discoverability.md` nel progetto `net-worth-tracker`.

Obiettivo:
- migliorare la discoverability della navigazione mobile
- rendere piu chiaro il ruolo del menu secondario
- far percepire l'app come completa anche su mobile portrait
- mantenere un tono premium-editoriale e una UX pratica a una mano

Vincoli:
- non peggiorare l'accesso rapido alle sezioni piu frequenti
- non introdurre una bottom bar sovraccarica
- preserva la logica responsive gia esistente dove funziona
- mantieni i touch target chiari e accessibili

Aree da toccare:
- bottom navigation
- drawer secondario mobile
- eventuali label, grouping, indicatori attivi e affordance

Output atteso:
- implementazione completa
- breve nota sulla strategia di discoverability adottata
- elenco dei file modificati

Dimmi cosa e come testare quanto implementato finora
