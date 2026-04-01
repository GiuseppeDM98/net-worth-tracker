# Spec 10 - Ritmo Visivo Secondario in History e Overview

## Issue
Oltre ai problemi principali di gerarchia, alcune aree secondarie di History e Overview soffrono di ritmo visivo disomogeneo: sezioni molto dense si susseguono con poca modulazione, e alcuni blocchi di supporto non respirano abbastanza.

## Severity
P3

## Intento di design
Fare un passaggio di raffinazione che migliori il ritmo complessivo senza cambiare il cuore delle pagine. L'obiettivo non e stravolgere, ma rendere la densita piu leggibile e piu editoriale.

## Problemi osservati
- Overview alterna blocchi KPI e grafici ma con una scansione ancora meccanica.
- History contiene molte sezioni forti, ma alcune transizioni tra moduli possono essere piu intenzionali.
- Alcuni blocchi di supporto hanno peso simile a blocchi piu strategici.

## Outcome desiderato
- Migliore cadenza visiva.
- Maggiore qualita percepita nella lettura lunga.
- Separazione piu chiara tra blocchi principali e blocchi secondari.

## Scope
- Dashboard overview.
- History page.
- Eventuali contenitori, spaziature, separatori o composizioni secondarie.

## File e aree da verificare
- `app/dashboard/page.tsx`
- `app/dashboard/history/page.tsx`
- eventuali componenti secondari delle due pagine

## Decisioni UX/UI da implementare
- Raffinare spacing, grouping e transizioni tra sezioni.
- Ridurre la sensazione di sequenza uniforme.
- Dare piu calma ai blocchi secondari senza ridurre la densita complessiva.
- Far percepire meglio il percorso di lettura pagina dopo pagina.

## Acceptance criteria
- Overview e History risultano piu scorrevoli da leggere.
- Le sezioni secondarie non competono piu inutilmente con quelle principali.
- La densita resta alta ma meglio ritmata.
- L'effetto complessivo e piu premium-editoriale.

## Prompt di implementazione
Implementa la specifica `docs/critique/10-history-and-overview-secondary-rhythm.md` nel progetto `net-worth-tracker`.

Obiettivo:
- migliorare il ritmo visivo secondario in Overview e History
- rendere la lettura delle pagine lunghe piu naturale
- affinare spacing, grouping e transizioni tra moduli

Vincoli:
- non impoverire i contenuti
- non cambiare inutilmente la logica delle sezioni
- mantieni coerenza con la gerarchia principale gia definita altrove

Aree da toccare:
- successione delle sezioni
- spaziature e grouping
- peso visivo dei blocchi secondari
- eventuali pattern ripetitivi da ammorbidire

Output atteso:
- implementazione completa
- breve nota sul ritmo visivo ottenuto
- elenco dei file modificati

Dimmi cosa e come testare quanto implementato finora
