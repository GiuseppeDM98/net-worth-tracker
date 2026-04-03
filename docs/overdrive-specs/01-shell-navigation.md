# Shell e Navigazione - Fluidita' trasversale

## Perche' questa sezione
La shell e' il moltiplicatore di qualita' percepita dell'intera app. Se header, sidebar, drawer, page transitions e active states sono fluidi, anche le pagine dense sembrano piu' solide e piu' "native".

## Outcome UX atteso
L'utente deve percepire continuita' quando:
- cambia pagina
- apre la navigazione mobile
- passa dalla sidebar al contenuto
- vede l'indicatore della voce attiva

La shell deve dare sensazione di app installata, non di insieme di pagine separate.

## Feature da implementare
### 1. Page transitions contestuali
- **Comportamento utente**: passando da una route dashboard all'altra, il contenuto cambia senza flash o reset brutali.
- **Superficie coinvolta**: layout dashboard, wrapper pagina.
- **Priorita'**: alta.
- **Impatto atteso**: forte aumento di fluidita' percepita.

### 2. Active state continuity nella navigazione
- **Comportamento utente**: l'indicatore di sezione attiva scorre o si assesta tra voci vicine invece di apparire/scomparire.
- **Superficie coinvolta**: sidebar, menu secondario, eventuale bottom nav.
- **Priorita'**: alta.
- **Impatto atteso**: percezione premium costante.

### 3. Drawer e sheet contestuali su mobile
- **Comportamento utente**: menu e pannelli mobili sembrano nascere dal trigger e richiudersi nello stesso sistema spaziale.
- **Superficie coinvolta**: sidebar mobile landscape, secondary drawer, overlay.
- **Priorita'**: alta.
- **Impatto atteso**: navigazione mobile piu' naturale.

### 4. Header actions con feedback fisico
- **Comportamento utente**: toggle tema, avatar e controlli utility hanno micro-feedback coerente e rapido.
- **Superficie coinvolta**: header.
- **Priorita'**: media.
- **Impatto atteso**: polish premium trasversale.

## Implementazione tecnica
- Introdurre pattern condivisi per `page enter`, `page exit`, `nav active pill`, `drawer enter/exit`, `header action press`.
- Usare `layoutId` per active pill e per eventuali shared transitions tra navigation surfaces compatibili.
- Se il layout gia' usa `AnimatePresence`, consolidare timing, easing e direzione; evitare mix incoerenti tra pagine.
- Per drawer e sheet usare spring con massa e damping moderati; evitare overshoot vistosi.
- Se si sperimenta con View Transitions intra-app, lasciarle come enhancement opzionale con fallback a Motion.
- Non usare effetti scenici sulla shell: niente glow pesanti, blur eccessivi o transizioni lunghe.

## Vincoli e guardrail
- `prefers-reduced-motion`: ridurre a fade/instant state change con continuita' minima.
- Senza View Transitions avanzate: fallback completo con Framer Motion.
- Mobile medi: evitare overlay costosi con blur aggressivo e animazioni multiple concorrenti.
- Nessuna perdita di leggibilita' del menu o dei target di tap.

## Accettazione e test
- La navigazione tra pagine dashboard non genera flash evidenti.
- La voce attiva nel menu cambia in modo continuo e leggibile.
- Sidebar/drawer mobile si aprono e chiudono in modo coerente col trigger.
- Nessuna regressione di usabilita' su desktop, tablet, mobile portrait e mobile landscape.
- Verificare che route rapide consecutive non lascino stati visivi sporchi.

## Prompt pronto per Codex
Usa `docs/overdrive-specs/00-overview.md` come contesto condiviso e `docs/overdrive-specs/01-shell-navigation.md` come fonte di verita' specifica per questa implementazione della shell e della navigazione. Lavora solo su transizioni di pagina, continuita' dello stato attivo nei menu, drawer/sheet contestuali e micro-feedback dell'header. Non introdurre effetti decorativi gratuiti: l'obiettivo e' fluidita' premium da app nativa. Rispetta le convenzioni del repo, i token semantici, il supporto a `prefers-reduced-motion` e prevedi fallback senza dipendere da View Transitions avanzate. Se fattibile, esegui verifiche locali mirate e chiudi con un riepilogo sintetico di modifiche e verifiche. dimmi cosa e come testare riguardo ciò che hai implementato finora
