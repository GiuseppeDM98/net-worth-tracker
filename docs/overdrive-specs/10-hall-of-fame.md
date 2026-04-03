# Hall of Fame - Editoriale, non celebrativo

## Perche' questa sezione
Hall of Fame ha un potenziale editoriale forte, ma rischia facilmente di diventare troppo rumorosa. Qui l'Overdrive deve sottolineare ranking, record e note, senza trasformare la sezione in gamification.

## Outcome UX atteso
L'utente deve percepire:
- ranking piu' leggibili
- enfasi sui record correnti
- passaggi naturali tra tabelle, card e note
- un tono premium, non festoso

## Feature da implementare
### 1. Reveal disciplinato dei ranking
- **Comportamento utente**: i blocchi ranking si presentano in ordine e con chiara gerarchia.
- **Superficie coinvolta**: card ranking, liste mobile, tabelle desktop.
- **Priorita'**: alta.
- **Impatto atteso**: sezione piu' leggibile.

### 2. Spotlight sul periodo corrente
- **Comportamento utente**: il record o il periodo evidenziato emerge con chiarezza, senza colori o motion eccessivi.
- **Superficie coinvolta**: current month/current year highlights.
- **Priorita'**: media.
- **Impatto atteso**: contesto immediato.

### 3. Dialog note contestuale
- **Comportamento utente**: aprire, leggere o modificare una nota sembra un'estensione del record scelto.
- **Superficie coinvolta**: note icon, view dialog, edit dialog.
- **Priorita'**: alta.
- **Impatto atteso**: continuita' premium concreta.

### 4. Micro-cerimonia misurata sui record
- **Comportamento utente**: solo nei punti giusti c'e' un piccolo segnale di specialita'.
- **Superficie coinvolta**: badge, record highlights, top cards.
- **Priorita'**: bassa-media.
- **Impatto atteso**: carattere editoriale.

## Implementazione tecnica
- Coordinare reveal di card e tabelle con timing stretti e ordinati.
- Usare enfasi piu' sulla gerarchia che sulla spettacolarita'.
- Le note devono aprirsi con continuita' contestuale ma senza animazioni lunghe.
- La micro-cerimonia, se introdotta, deve essere breve, locale e non ripetersi continuamente.

## Vincoli e guardrail
- `prefers-reduced-motion`: restano solo gerarchia chiara e focus visivo statico.
- Niente motion celebrativa invasiva.
- Nessuna regressione su leggibilita' delle classifiche dense.
- Non alterare il tono premium/privato della sezione.

## Accettazione e test
- Le classifiche risultano piu' ordinate sia su desktop sia su mobile.
- Il periodo corrente e' chiaramente riconoscibile.
- Aprire e chiudere note appare contestuale e pulito.
- Eventuali micro-momenti di enfasi non si ripetono in modo fastidioso.

## Prompt pronto per Codex
Usa `docs/overdrive-specs/00-overview.md` come contesto condiviso e `docs/overdrive-specs/10-hall-of-fame.md` come fonte di verita' specifica per questa implementazione della sezione Hall of Fame. Lavora su reveal disciplinato dei ranking, spotlight sul periodo corrente, dialog note contestuali e solo eventuali micro-momenti editoriali molto misurati. Non introdurre effetti decorativi gratuiti o celebrativi e non compromettere la leggibilita' di classifiche e valori. Rispetta le convenzioni del repo, `prefers-reduced-motion` e usa fallback semplici e sobri. Se fattibile, esegui verifiche locali mirate e chiudi con un riepilogo sintetico di modifiche e verifiche. dimmi cosa e come testare riguardo ciò che hai implementato finora
