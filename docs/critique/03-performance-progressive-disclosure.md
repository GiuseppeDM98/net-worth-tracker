# Spec 03 - Progressive Disclosure nella Pagina Performance

## Issue
La pagina Performance contiene molto valore ma oggi scarica troppe scelte, metriche e spiegazioni nella stessa superficie. L'aiuto esiste, ma spesso arriva come documentazione lunga invece che come guida contestuale.

## Severity
P1

## Intento di design
Mantenere la potenza analitica per utenti evoluti, ma con una superficie piu leggibile e progressiva. Il target non vuole essere infantilizzato, pero non deve sentirsi costretto a decodificare tutto insieme.

## Problemi osservati
- Molte metriche avanzate sono visibili insieme senza un chiaro livello base vs avanzato.
- I controlli di periodo, le metriche, i grafici e il materiale esplicativo convivono nello stesso flusso con carico cognitivo elevato.
- Le spiegazioni lunghe funzionano come knowledge base inline e rallentano la scansione.
- L'utente deve ricordare il significato di TWR, IRR, Sharpe, YOC e Current Yield mentre naviga.

## Outcome desiderato
- Prima lettura rapida possibile in pochi secondi.
- Metriche fondamentali subito comprensibili.
- Approfondimento accessibile on demand.
- Aiuto distribuito nei punti giusti, non concentrato in un unico blocco lungo.

## Scope
- Performance page.
- Componenti metriche correlati.
- Eventuali dialog, accordion, tooltip o blocchi informativi che supportano la lettura progressiva.

## File e aree da verificare
- `app/dashboard/performance/page.tsx`
- `components/performance/MetricCard.tsx`
- `components/performance/MetricSection.tsx`
- `components/performance/PerformanceTooltip.tsx`
- eventuali dialog di aiuto gia presenti

## Decisioni UX/UI da implementare
- Definire almeno due livelli di lettura:
  - overview essenziale
  - approfondimento avanzato
- Ridurre la dipendenza da muri di testo nel body principale.
- Preferire micro-spiegazioni brevi, tooltip mirati, disclosure contestuale e raggruppamenti piu intelligenti.
- Organizzare le metriche secondo modelli mentali piu chiari:
  - crescita
  - rischio
  - reddito da dividendi
  - letture avanzate
- Valutare una sezione introduttiva o summary strip che spieghi come leggere la pagina senza saturare l'utente.

## Principi di contenuto
- Il nome della metrica non basta: deve essere chiaro anche il suo ruolo decisionale.
- Ogni aiuto deve essere breve nel punto d'uso.
- Il long-form puo restare, ma non deve dominare il percorso primario.
- L'utente deve poter ignorare l'approfondimento senza perdere il senso della pagina.

## Acceptance criteria
- La pagina Performance e leggibile su due livelli: rapido e avanzato.
- La parte primaria non obbliga a leggere lunghi blocchi esplicativi.
- Le metriche piu tecniche risultano piu comprensibili senza impoverire il dominio.
- Il cognitive load percepito cala nettamente.
- La pagina continua a sembrare uno strumento premium per investitori seri.

## Prompt di implementazione
Implementa la specifica `docs/critique/03-performance-progressive-disclosure.md` nel progetto `net-worth-tracker`.

Obiettivo:
- ridurre il carico cognitivo della pagina Performance
- introdurre una progressive disclosure reale
- separare meglio overview, approfondimento e help
- mantenere tutta la potenza analitica in un'esperienza piu premium-editoriale

Vincoli:
- non rimuovere metriche importanti
- non ridurre la precisione del contenuto
- evita muri di testo nel percorso principale
- usa aiuto contestuale e raggruppamento intelligente

Aree da toccare:
- orchestrazione della pagina Performance
- struttura delle sezioni metriche
- posizionamento dei testi di spiegazione
- eventuali tooltip, accordion, callout o summary blocks

Output atteso:
- implementazione completa
- breve descrizione di come hai distribuito i livelli di lettura
- elenco dei file modificati

Dimmi cosa e come testare quanto implementato finora
