# Spec 04 - Information Architecture della Pagina Settings

## Issue
La pagina Settings e potente ma percepita come pannello tecnico-amministrativo. Raggruppa opzioni importanti, note operative, casi rari e funzionalita specialistiche in una stessa superficie che oggi richiede troppo sforzo cognitivo.

## Severity
P2

## Intento di design
Trasformare Settings in un'area di controllo premium e guidata, dove le impostazioni ad alto impatto emergono subito, mentre complessita, note e casi edge restano disponibili ma non invadenti.

## Problemi osservati
- La sezione contiene molta logica e molte opzioni, ma la priorita visiva e informativa non e sempre chiara.
- Note operative lunghe convivono con task di configurazione critici.
- Preferenze comuni, impostazioni avanzate e tooling di sviluppo possono apparire nello stesso ecosistema con peso simile.
- Il tono e piu da pannello amministrativo che da configurazione curata di un wealth dashboard personale.

## Outcome desiderato
- Settings piu leggibile e meno opprimente.
- Piara distinzione tra:
  - preferenze principali
  - configurazioni avanzate
  - note e spiegazioni
  - funzioni di sviluppo
- Percorso piu chiaro per configurare il portafoglio senza sentirsi dentro un backoffice.

## Scope
- Header e tab/selector della pagina.
- Raggruppamento interno delle impostazioni.
- Gestione delle note informative e dei blocchi a bassa frequenza.
- Sezioni spese, dividendi, preferenze e allocazione.

## File e aree da verificare
- `app/dashboard/settings/page.tsx`
- eventuali dialog e componenti usati nella pagina

## Decisioni UX/UI da implementare
- Far emergere le impostazioni ad alto impatto e uso frequente.
- Spostare contenuti secondari o edge case dietro disclosure, accordion o sottosezioni piu sobrie.
- Dare una struttura narrativa migliore alla pagina: impostazioni del portafoglio, flussi, redditi, avanzate.
- Ridurre l'impatto visivo delle note lunghe e trasformarle in supporto contestuale.
- Tenere eventuali funzionalita di sviluppo fortemente separate dal percorso normale utente.

## Principi di design
- Una settings page premium non e povera di opzioni; e chiara nelle priorita.
- L'utente deve capire subito cosa conviene configurare per primo.
- Le opzioni rare devono restare accessibili senza inquinare il percorso principale.
- La pagina deve sembrare una cabina di regia personale, non un form enorme.

## Acceptance criteria
- Le sezioni principali sono piu facili da scansionare.
- Le note non dominano piu la pagina.
- Le impostazioni avanzate non competono visivamente con quelle frequenti.
- Le funzioni di sviluppo risultano chiaramente separate dal prodotto utente.
- La pagina e percepita come piu premium-editoriale e meno tecnica-amministrativa.

## Prompt di implementazione
Implementa la specifica `docs/critique/04-settings-information-architecture.md` nel progetto `net-worth-tracker`.

Obiettivo:
- migliorare l'information architecture di Settings
- rendere piu chiara la priorita tra preferenze, configurazioni avanzate e note
- ridurre il feeling da pannello amministrativo
- portare la pagina verso un tono premium-editoriale

Vincoli:
- non perdere funzionalita
- non nascondere in modo pericoloso impostazioni importanti
- usa progressive disclosure per note, casi edge e sezioni avanzate
- mantieni la pagina responsive e coerente col design system esistente

Aree da toccare:
- header e organizzazione delle tab
- raggruppamento e ordine delle sezioni
- callout informativi
- separazione delle funzionalita di sviluppo

Output atteso:
- implementazione completa
- breve spiegazione della nuova architettura informativa
- elenco dei file modificati

Dimmi cosa e come testare quanto implementato finora
