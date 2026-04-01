# Spec 06 - Direzione Premium-Editoriale per Login e Registrazione

## Issue
Le pagine di autenticazione sono pulite e corrette, ma oggi risultano molto standard. Trasmettono affidabilita minima, non l'identita premium-editoriale del prodotto.

## Severity
P2

## Intento di design
Fare in modo che il primo contatto con il prodotto sembri coerente con un cruscotto finanziario personale, sofisticato e curato. L'accesso deve comunicare fiducia, qualita e precisione, non solo funzionalita.

## Problemi osservati
- Layout molto convenzionale da auth form.
- Branding presente ma poco caratterizzato.
- Scarto percettivo tra promessa del prodotto e banalita della schermata.
- Microcopy corretta ma poco distintiva.

## Outcome desiderato
- Autenticazione piu coerente con il tono premium-editoriale.
- Maggiore continuita tra primo ingresso e app interna.
- Esperienza sobria ma memorabile.

## Scope
- Login page.
- Register page.
- Eventuali wrapper o pattern condivisi delle auth pages.

## File e aree da verificare
- `app/login/page.tsx`
- `app/register/page.tsx`
- eventuali token condivisi o componenti riusabili dell'auth flow

## Decisioni UX/UI da implementare
- Rafforzare il branding senza aggiungere rumore.
- Curare meglio gerarchia tipografica, spaziatura, tono e percezione del contesto.
- Evitare la classica card auth generica se esiste un'alternativa piu intenzionale ma coerente.
- Rendere il copy piu personale e meno da form standard.

## Acceptance criteria
- Login e registrazione sembrano parte dello stesso prodotto visto nel dashboard.
- Il tono percepito e piu premium-editoriale.
- L'accesso resta semplice e immediato.
- La UI non scade in effetti gratuiti o marketing style.

## Prompt di implementazione
Implementa la specifica `docs/critique/06-auth-premium-editorial-direction.md` nel progetto `net-worth-tracker`.

Obiettivo:
- portare login e registrazione verso una direzione premium-editoriale
- migliorare il primo impatto visivo e tonale
- aumentare la coerenza con il prodotto interno

Vincoli:
- non complicare il flusso di autenticazione
- mantieni chiarezza, accessibilita e semplicità d'uso
- evita estetiche da landing page generica o da template consumer fintech

Aree da toccare:
- layout auth
- branding e gerarchia visiva
- microcopy e tono
- eventuali pattern condivisi tra login e register

Output atteso:
- implementazione completa
- breve nota sulla direzione visuale scelta
- elenco dei file modificati

Dimmi cosa e come testare quanto implementato finora
