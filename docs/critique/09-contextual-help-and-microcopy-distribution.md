# Spec 09 - Distribuzione dell'Aiuto Contestuale e del Microcopy

## Issue
In piu punti dell'app l'aiuto esiste, ma non sempre nel posto giusto o con il formato giusto. A volte e troppo concentrato, a volte e troppo distante dall'azione o dalla decisione da prendere.

## Severity
P2

## Intento di design
Distribuire meglio l'aiuto dentro l'app, cosi da ridurre il carico cognitivo senza spostare l'esperienza verso tutorial lunghi o documentazione embedded.

## Problemi osservati
- Alcune pagine usano blocchi testuali lunghi come compensazione.
- Alcune azioni o stati hanno copy corretto ma poco orientante.
- Il sistema di aiuto non e percepito come coerente attraverso le varie superfici.

## Outcome desiderato
- Help breve, vicino al punto d'uso.
- Microcopy piu orientante e meno descrittivo-passivo.
- Maggiore coerenza tra tooltip, helper text, callout e note.

## Scope
- Performance.
- Allocation.
- Settings.
- Eventuali dialog con concetti complessi o azioni ad alto impatto.

## File e aree da verificare
- `app/dashboard/performance/page.tsx`
- `app/dashboard/allocation/page.tsx`
- `app/dashboard/settings/page.tsx`
- eventuali componenti tooltip o helper condivisi

## Decisioni UX/UI da implementare
- Ridurre i muri di testo e spezzare la guida in micro-aiuti locali.
- Uniformare tono e lunghezza delle spiegazioni.
- Migliorare il copy delle CTA o dei messaggi di supporto nei punti di ambiguita.
- Rendere il sistema di aiuto piu coerente tra le pagine.

## Acceptance criteria
- L'utente trova spiegazioni nel punto in cui ne ha bisogno.
- Il microcopy orienta meglio l'azione.
- I pattern di aiuto sono piu coerenti e piu leggibili.
- Il prodotto appare piu maturo e piu curato.

## Prompt di implementazione
Implementa la specifica `docs/critique/09-contextual-help-and-microcopy-distribution.md` nel progetto `net-worth-tracker`.

Obiettivo:
- migliorare la distribuzione dell'aiuto contestuale e del microcopy
- ridurre l'uso di blocchi spiegativi troppo lunghi
- rendere il supporto piu vicino alle decisioni dell'utente

Vincoli:
- non eliminare spiegazioni importanti
- preferisci aiuto breve, locale e coerente
- mantieni tutto il testo utente in italiano
- allinea il tono a una UX premium-editoriale, precisa e sobria

Aree da toccare:
- tooltip
- helper text
- callout e note informative
- CTA e messaggi di supporto dove il significato oggi e poco chiaro

Output atteso:
- implementazione completa
- breve nota sulla strategia di help distribution adottata
- elenco dei file modificati

Dimmi cosa e come testare quanto implementato finora
