# Auth - Polish premium a bassa priorita'

## Perche' questa sezione
Login e Register non sono il cuore dell'app. Vanno migliorati il giusto: abbastanza da sembrare parte dello stesso prodotto premium, ma senza rubare attenzione alle superfici core.

## Outcome UX atteso
L'utente deve percepire:
- focus flow piu' curato
- card e controlli piu' coerenti col resto dell'app
- transizioni pulite e discrete

## Feature da implementare
### 1. Ingresso pagina e card piu' curato
- **Comportamento utente**: login e registrazione entrano con compostezza, non con staticita' totale.
- **Superficie coinvolta**: auth pages, auth card.
- **Priorita'**: media.
- **Impatto atteso**: polish premium.

### 2. Focus choreography dei campi
- **Comportamento utente**: muoversi tra campi, pulsanti e toggle password da' una sensazione piu' rifinita.
- **Superficie coinvolta**: input, CTA, toggle show password.
- **Priorita'**: alta.
- **Impatto atteso**: qualita' percepita nei dettagli.

### 3. Feedback contestuale su submit
- **Comportamento utente**: accesso e registrazione danno una risposta visiva ordinata durante loading e completion.
- **Superficie coinvolta**: submit buttons, auth card content.
- **Priorita'**: media.
- **Impatto atteso**: coerenza col tono premium.

## Implementazione tecnica
- Usare motion molto leggera: ingresso card, focus states, submit feedback.
- Evitare qualsiasi effetto vistoso o da landing page di marketing.
- Coordinare loading e stato del bottone con il resto del vocabolario motion.
- Se si tocca il layout auth, preservare semplicita' e accessibilita' dei form.

## Vincoli e guardrail
- `prefers-reduced-motion`: nessuna perdita di usabilita' dei form.
- Nessuna animazione che rallenti login o registrazione.
- Non introdurre complessita' grafica non giustificata.
- Mantenere priorita' bassa rispetto alle sezioni core.

## Accettazione e test
- Login e Register appaiono piu' rifiniti senza sembrare superfici principali.
- Il focus flow risulta migliore con tastiera e mouse.
- Submit/loading e transizioni restano rapide e leggibili.
- Nessuna regressione nei flussi auth esistenti.

## Prompt pronto per Codex
Usa `docs/overdrive-specs/00-overview.md` come contesto condiviso e `docs/overdrive-specs/12-auth.md` come fonte di verita' specifica per questa implementazione delle pagine di autenticazione. Lavora su polish premium leggero: ingresso pagina/card, focus choreography dei campi e feedback contestuale sul submit. Non introdurre effetti decorativi gratuiti o da landing marketing e non cambiare i flussi auth esistenti oltre al layer UX richiesto. Rispetta le convenzioni del repo, `prefers-reduced-motion` e mantieni l'intervento piccolo, pulito e accessibile. Se fattibile, esegui verifiche locali mirate e chiudi con un riepilogo sintetico di modifiche e verifiche. dimmi cosa e come testare riguardo ciò che hai implementato finora
