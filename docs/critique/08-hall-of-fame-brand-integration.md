# Spec 08 - Integrazione Tonale e di Brand della Sezione Hall of Fame

## Issue
La sezione Hall of Fame ha personalita, ma oggi il naming e il tono la fanno percepire leggermente staccata dal resto del prodotto.

## Severity
P3

## Intento di design
Integrare questa sezione nell'universo del prodotto mantenendo la sua unicita. Deve sembrare una feature distintiva del tracker, non un modulo concettualmente separato.

## Problemi osservati
- Naming inglese isolato in una UI per il resto principalmente italiana.
- Tonalita piu "feature gimmick" rispetto alle altre sezioni piu analitiche.
- Rischio di incoerenza con la direzione elegante e sofisticata del brand.

## Outcome desiderato
- Sezione piu coerente con tono e lessico del prodotto.
- Personalita preservata ma meglio integrata.
- Percezione piu premium e meno accessoria.

## Scope
- Naming della sezione.
- Header, sottotitoli, CTA e microcopy della pagina.
- Eventuali etichette secondarie correlate.

## File e aree da verificare
- `app/dashboard/hall-of-fame/page.tsx`
- `components/layout/Sidebar.tsx`
- eventuali componenti dentro `components/hall-of-fame/*`

## Decisioni UX/UI da implementare
- Valutare se italianizzare, rilavorare o nobilitare il naming.
- Allineare sottotitoli e copy a un tono piu coerente con il prodotto.
- Mantenere l'idea di celebrazione personale senza sembrare gimmick.

## Acceptance criteria
- La sezione non sembra piu un elemento tonalmente separato.
- La personalita resta, ma piu raffinata.
- Il naming scelto risulta coerente col resto dell'app.

## Prompt di implementazione
Implementa la specifica `docs/critique/08-hall-of-fame-brand-integration.md` nel progetto `net-worth-tracker`.

Obiettivo:
- integrare meglio Hall of Fame nel brand e nel tono generale dell'app
- preservare il carattere della feature
- ridurre l'effetto di naming isolato o gimmick

Vincoli:
- non snaturare la funzione della pagina
- mantieni il senso di record personali e celebrazione privata
- allinea lingua e tono con il resto della UI

Aree da toccare:
- naming della sezione
- header e microcopy
- eventuali label nella navigazione e nella pagina stessa

Output atteso:
- implementazione completa
- breve spiegazione della scelta tonale e terminologica
- elenco dei file modificati

Dimmi cosa e come testare quanto implementato finora
