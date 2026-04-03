# Impostazioni - Console premium, non showroom

## Perche' questa sezione
Impostazioni e' il posto dove l'utente manipola configurazioni sensibili. La sezione deve sembrare affidabile, chiara e fluida. Qui l'Overdrive e' quasi tutto nella qualita' dell'interazione.

## Outcome UX atteso
L'utente deve sentire che:
- i campi rispondono subito
- le espansioni annidate restano sotto controllo
- la pagina appare solida e moderna, non fredda o pesante

## Feature da implementare
### 1. Feedback immediato su input e toggle
- **Comportamento utente**: interagendo con switch, select e campi, c'e' risposta visiva rapida e coerente.
- **Superficie coinvolta**: controlli impostazioni generali, allocazione, spese e dividendi.
- **Priorita'**: alta.
- **Impatto atteso**: maggiore percezione di controllo.

### 2. Nested editor fluido
- **Comportamento utente**: categorie, subcategorie e asset specifici si espandono e comprimono senza caos.
- **Superficie coinvolta**: editor allocazione annidato.
- **Priorita'**: alta.
- **Impatto atteso**: comfort nei task complessi.

### 3. Preview implicita del cambiamento
- **Comportamento utente**: cambi di stato importanti risultano percepibili anche prima del salvataggio finale.
- **Superficie coinvolta**: sezioni con dipendenze tra campi e calcoli automatici.
- **Priorita'**: media.
- **Impatto atteso**: riduzione dell'incertezza.

### 4. Azioni critiche piu' contestuali
- **Comportamento utente**: dialog di conferma e operazioni sensibili sembrano legati all'azione originaria.
- **Superficie coinvolta**: delete/move dialogs, save/reset actions, test snapshot dialogs.
- **Priorita'**: media.
- **Impatto atteso**: percezione premium e sicurezza.

## Implementazione tecnica
- Trattare toggle, select e input come controlli con micro-feedback coerente, non con animazioni vistose.
- Usare layout transitions pulite per espansioni annidate; evitare overshoot marcati.
- Evidenziare le conseguenze dei cambiamenti tramite reflow, stato e assestamento di blocchi dipendenti.
- I dialog critici devono avere continuita' col trigger ma restare sobri e rapidi.
- Non introdurre autosave reale se non gia' previsto: qui si parla di affordance visive, non di cambio comportamento prodotto.

## Vincoli e guardrail
- `prefers-reduced-motion`: interazioni quasi istantanee e molto chiare.
- Niente motion che faccia sembrare rischiose o incerte le operazioni sensibili.
- Nessuna regressione nella chiarezza di validazioni e dipendenze.
- Evitare di mascherare il caricamento o il salvataggio reale.

## Accettazione e test
- Switch, select e input rispondono in modo premium ma discreto.
- Le espansioni annidate nell'allocazione restano leggibili.
- Dialog e azioni sensibili risultano contestuali e chiari.
- Nessuna regressione nei flussi di salvataggio, reset o gestione categorie.

## Prompt pronto per Codex
Usa `docs/overdrive-specs/00-overview.md` come contesto condiviso e `docs/overdrive-specs/11-settings.md` come fonte di verita' specifica per questa implementazione della sezione Impostazioni. Concentrati su feedback immediato di input e toggle, fluidita' dell'editor annidato, preview implicita dei cambiamenti e dialog contestuali per azioni sensibili. Non introdurre effetti decorativi gratuiti e non cambiare il comportamento prodotto oltre al layer UX richiesto. Rispetta le convenzioni del repo, `prefers-reduced-motion`, la chiarezza delle validazioni e usa fallback semplici e sobri. Se fattibile, esegui verifiche locali mirate e chiudi con un riepilogo sintetico di modifiche e verifiche. dimmi cosa e come testare riguardo ciò che hai implementato finora
