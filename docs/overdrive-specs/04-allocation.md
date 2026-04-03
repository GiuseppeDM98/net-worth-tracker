# Allocazione - Drill-down spaziale e leggibile

## Perche' questa sezione
Allocazione e' una sezione naturalmente gerarchica. E' il punto ideale per far sentire continuita' spaziale tra livelli diversi senza aggiungere rumore visivo.

## Outcome UX atteso
Il passaggio tra:
- asset class
- Sottocategoria
- asset specifici

deve sembrare un unico sistema che si approfondisce, non tre schermate scollegate.

## Feature da implementare
### 1. Drill-down con continuita' spaziale
- **Comportamento utente**: passando da un livello al successivo si percepisce provenienza e destinazione.
- **Superficie coinvolta**: card/table desktop e viste drill-down.
- **Priorita'**: alta.
- **Impatto atteso**: forte senso di fluidita' nativa.

### 2. Sheet mobile contestuale
- **Comportamento utente**: il foglio mobile sembra aprirsi dal contesto toccato, mantenendo il legame con il livello precedente.
- **Superficie coinvolta**: mobile cards, sheet navigation.
- **Priorita'**: alta.
- **Impatto atteso**: notevole miglioramento mobile.

### 3. Barre target vs attuale con assestamento fisico
- **Comportamento utente**: differenze, progressi e scostamenti si compongono con una dinamica pulita e leggibile.
- **Superficie coinvolta**: progress bar e indicatori.
- **Priorita'**: media.
- **Impatto atteso**: precisione percepita.

### 4. Breadcrumb e ritorni coerenti
- **Comportamento utente**: tornare indietro mantiene senso di orientamento.
- **Superficie coinvolta**: breadcrumb, header drill-down, controlli back.
- **Priorita'**: media.
- **Impatto atteso**: meno disorientamento.

## Implementazione tecnica
- Usare `layoutId` o pattern simili per shared continuity tra trigger e destinazione.
- Su desktop trattare il cambio livello come transizione strutturale; su mobile far prevalere il movimento sheet-based.
- Coordinare barre e delta con springs rapide, senza elasticita' vistosa.
- Distinguere chiaramente la motion di navigazione da quella dei dati: prima il contenitore, poi il contenuto.
- Evitare transizioni complesse se i dati sono tanti o se la geometria cambia drasticamente.

## Vincoli e guardrail
- `prefers-reduced-motion`: passaggi netti ma leggibili tra livelli.
- Niente animazioni che rendano meno leggibili percentuali e differenze.
- Mobile medi: sheet e contenuto non devono stutterare.
- Nessuna dipendenza hard da View Transitions.

## Accettazione e test
- Il passaggio tra i tre livelli appare coerente e orientato.
- Su mobile la navigazione a sheet non risulta scollegata dal contesto toccato.
- Le barre di allocazione restano leggibili in tutte le fasi.
- Back navigation e close sheet non devono lasciare stati visivi incoerenti.

## Prompt pronto per Codex
Usa `docs/overdrive-specs/00-overview.md` come contesto condiviso e `docs/overdrive-specs/04-allocation.md` come fonte di verita' specifica per questa implementazione della sezione Allocazione. Concentrati su drill-down spaziale tra livelli, continuita' dei sheet mobili, progress bar con assestamento fisico e ritorni coerenti. Non introdurre effetti decorativi gratuiti e non ridurre la leggibilita' di percentuali, differenze e gerarchie. Rispetta le convenzioni del repo, `prefers-reduced-motion` e usa fallback robusti senza dipendere da API avanzate. Se fattibile, esegui verifiche locali mirate e chiudi con un riepilogo sintetico di modifiche e verifiche. dimmi cosa e come testare riguardo ciò che hai implementato finora
