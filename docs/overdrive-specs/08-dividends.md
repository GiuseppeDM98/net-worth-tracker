# Dividendi e Cedole - Precisione, calendario e dettaglio contestuale

## Perche' questa sezione
Dividendi e Cedole ha una natura ibrida: parte analitica, parte consultiva, parte calendario. Qui l'Overdrive deve valorizzare precisione e progressione, con un tono piu' raffinato che scenografico.

## Outcome UX atteso
L'utente deve percepire che:
- il calendario e' vivo ma leggibile
- la relazione tra tabella, dettaglio e statistiche e' piu' continua
- le metriche di crescita e rendimento hanno una composizione premium

## Feature da implementare
### 1. Calendario con focus animato
- **Comportamento utente**: il cambio mese o la selezione del giorno sposta l'attenzione in modo chiaro.
- **Superficie coinvolta**: DividendCalendar e celle giorno.
- **Priorita'**: alta.
- **Impatto atteso**: miglior orientamento visivo.

### 2. Transizione contestuale riga-dettaglio
- **Comportamento utente**: aprendo un dettaglio dividendo, il passaggio sembra nascere dalla riga o dalla card selezionata.
- **Superficie coinvolta**: tabella/lista e dialog dettaglio.
- **Priorita'**: alta.
- **Impatto atteso**: fluidita' premium concreta.

### 3. Metriche crescita e YOC piu' composte
- **Comportamento utente**: le statistiche si presentano con assestamento chiaro, senza teatralita'.
- **Superficie coinvolta**: stats cards.
- **Priorita'**: media.
- **Impatto atteso**: precisione percepita.

### 4. Sync tra calendari, lista e filtri
- **Comportamento utente**: cambi di filtro o contesto non sembrano scollegare le superfici.
- **Superficie coinvolta**: tab calendario, tabella, eventuali dialog.
- **Priorita'**: media.
- **Impatto atteso**: migliore coesione della sezione.

## Implementazione tecnica
- Trattare il calendario come superficie di focus e navigazione, non come playground animato.
- Preferire shared continuity per il dialog dettaglio con fallback classico.
- Applicare count-up e settling solo dove i numeri sono davvero protagonisti.
- Coordinare selezione giorno, cambio mese e filtro per evitare troppi eventi visivi insieme.
- Evitare effetti sulle singole celle che disturbano la scansione del calendario.

## Vincoli e guardrail
- `prefers-reduced-motion`: focus e selezione restano leggibili e immediati.
- Nessuna animazione che renda meno chiari giorni, importi o stato del dividendo.
- Mobile medi: il calendario non deve diventare pesante o instabile.
- No transizioni lunghe per i dialog di dettaglio.

## Accettazione e test
- Selezionare un giorno o cambiare contesto nel calendario risulta chiaro.
- Aprire il dettaglio da tabella/lista appare contestuale.
- Le metriche restano leggibili in ogni fase dell'animazione.
- Nessuna regressione nel tracking dividendi e nelle tabelle.

## Prompt pronto per Codex
Usa `docs/overdrive-specs/00-overview.md` come contesto condiviso e `docs/overdrive-specs/08-dividends.md` come fonte di verita' specifica per questa implementazione della sezione Dividendi e Cedole. Concentrati su calendario con focus animato, transizione contestuale tra riga e dettaglio, metriche crescita/YOC piu' composte e migliore continuita' tra calendario, lista e filtri. Non introdurre effetti decorativi gratuiti e non compromettere la leggibilita' di date, importi e stati. Rispetta le convenzioni del repo, `prefers-reduced-motion` e usa fallback semplici e robusti. Se fattibile, esegui verifiche locali mirate e chiudi con un riepilogo sintetico di modifiche e verifiche. dimmi cosa e come testare riguardo ciò che hai implementato finora
