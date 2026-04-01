# Spec 07 - Guidance e Integrazione della Legenda in Allocation

## Issue
La pagina Allocation e utile e operativa, ma alcune spiegazioni oggi vivono come blocchi esterni o note di supporto che sembrano compensare una gerarchia informativa non ancora perfettamente integrata.

## Severity
P3

## Intento di design
Rendere Allocation piu autoesplicativa e raffinata, facendo percepire guidance e lettura della tabella come parte dello stesso sistema, non come due livelli separati.

## Problemi osservati
- La legenda iniziale e utile ma visivamente sembra una toppa informativa.
- Le azioni `COMPRA`, `VENDI`, `OK` sono chiare solo dopo lettura dedicata.
- Alcuni codici di lettura potrebbero essere incorporati meglio nella tabella o nel contesto immediato.

## Outcome desiderato
- Pagina piu immediata da leggere.
- Minore dipendenza da un box introduttivo esterno.
- Guidance piu naturale e contestuale.

## Scope
- Allocation page.
- Tabella/e e segnali di azione.
- Eventuali label, chip, helper text o microcopy adiacenti.

## File e aree da verificare
- `app/dashboard/allocation/page.tsx`
- eventuali componenti allocation correlati

## Decisioni UX/UI da implementare
- Integrare meglio la legenda dentro il sistema di lettura della pagina.
- Ridurre la distanza tra spiegazione e punto di decisione.
- Rendere i segnali di stato piu autoesplicativi anche senza leggere una nota iniziale.
- Mantenere precisione e leggibilita per utenti esperti.

## Acceptance criteria
- Un utente capisce piu rapidamente come leggere la tabella.
- La legenda non appare piu come elemento appiccicato sopra il contenuto.
- Le azioni suggerite sono chiare a colpo d'occhio.
- La pagina resta densa ma piu elegante e piu integrata.

## Prompt di implementazione
Implementa la specifica `docs/critique/07-allocation-guidance-and-legend-integration.md` nel progetto `net-worth-tracker`.

Obiettivo:
- rendere la pagina Allocation piu autoesplicativa
- integrare meglio la legenda e i segnali di azione
- migliorare la guidance senza aggiungere rumore

Vincoli:
- non perdere precisione finanziaria
- non trasformare la pagina in una spiegazione lunga
- mantieni il tono premium-editoriale e data-first

Aree da toccare:
- legenda
- tabella allocation
- azioni COMPRA/VENDI/OK
- eventuali helper text contestuali

Output atteso:
- implementazione completa
- breve nota su come hai integrato la guidance
- elenco dei file modificati

Dimmi cosa e come testare quanto implementato finora
