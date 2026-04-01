# Spec 02 - Gerarchia Visiva e Orchestrazione del Layout

## Issue
Le pagine principali sono solide ma troppo piatte nella gerarchia. Molti blocchi condividono peso, forma e ritmo visivo simili, quindi l'occhio non capisce subito cosa e primario, cosa e secondario e cosa e solo contesto.

## Severity
P1

## Intento di design
Evolvere la UI da dashboard competente a esperienza premium-editoriale. La densita deve restare una feature, ma va orchestrata meglio: piu direzione, piu respiro selettivo, piu contrasto gerarchico.

## Problemi osservati
- Overview presenta molte card KPI con struttura quasi identica e poca distinzione tra KPI core e KPI secondari.
- Performance usa molte card e sezioni in sequenza, con forte ripetizione di pattern.
- History contiene moduli ricchi ma il ritmo visivo tra macro-sezioni non e abbastanza scandito.
- CTA importanti come `Crea Snapshot`, export e azioni contestuali ci sono, ma spesso non dominano davvero la scena.
- L'app shell e molto corretta ma tende al linguaggio visuale da admin panel standard.

## Outcome desiderato
- Gerarchia chiara in 2 secondi.
- KPI primari immediatamente distinguibili.
- Azioni chiave piu leggibili.
- Migliore alternanza tra blocchi densi e blocchi di respiro.
- Layout piu intenzionale e meno uniforme.

## Scope
- Dashboard overview.
- Performance page.
- History page.
- Se necessario, aggiustamenti lievi alla shell condivisa per sostenere la nuova gerarchia.

## File e aree da verificare
- `app/dashboard/page.tsx`
- `app/dashboard/performance/page.tsx`
- `app/dashboard/history/page.tsx`
- `components/ui/card.tsx`
- eventuali componenti KPI condivisi
- eventuali varianti tipografiche o token usati nelle pagine coinvolte

## Decisioni UX/UI da implementare
- Distinguere i KPI hero dai KPI secondari tramite scala tipografica, composizione, span di griglia o ritmo di spacing.
- Ridurre la sensazione di lista di card uguali.
- Dare piu intenzione ai blocchi introduttivi di pagina: titolo, sottotitolo, azioni.
- Stabilire un pattern piu forte per:
  - sezione primaria
  - sezione di supporto
  - sezione tecnica approfondita
- Evitare effetti gratuiti o decorativi; la gerarchia deve nascere da layout, tipografia, contrasto e prossimita.

## Linee guida visuali
- Non aumentare il rumore visivo.
- Usare piu contrasto di dimensione e densita, non solo colore.
- Fare in modo che il primo scroll racconti subito lo stato finanziario e non solo esponga widget.
- Rendere piu "editoriale" l'apertura delle pagine: headline, sottotitolo, CTA e primo cluster devono sembrare curati.

## Acceptance criteria
- Ogni pagina chiave ha un punto di ingresso visivo evidente.
- Le azioni primarie non competono alla pari con il resto.
- I KPI essenziali emergono prima dei blocchi di approfondimento.
- La pagina non appare piu come una semplice sequenza di card equivalenti.
- Il risultato e piu premium-editoriale, senza perdere chiarezza o performance percepita.

## Prompt di implementazione
Implementa la specifica `docs/critique/02-visual-hierarchy-and-layout-orchestration.md` nel progetto `net-worth-tracker`.

Obiettivo:
- migliorare la gerarchia visiva di Dashboard, Performance e History
- ridurre la piattezza da admin template
- far emergere in modo piu chiaro KPI primari, CTA e sezioni principali
- spostare l'estetica verso un tono premium-editoriale

Vincoli:
- non semplificare eccessivamente la densita informativa
- non introdurre decorazioni gratuite
- preserva i pattern del progetto dove funzionano gia
- mantieni la UI performante e responsive

Aree da toccare:
- apertura pagina e header action area
- composizione delle card KPI
- ritmo tra sezioni
- eventuali pattern visivi ripetuti che oggi appiattiscono la gerarchia

Output atteso:
- implementazione completa
- nota sintetica sui principi di gerarchia usati
- elenco dei file modificati

Dimmi cosa e come testare quanto implementato finora
