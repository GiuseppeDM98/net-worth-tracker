# FIRE e Simulazioni - Wow tecnico controllato

## Perche' questa sezione
FIRE e Simulazioni e' una delle due aree piu' naturali per l'Overdrive ambizioso. Monte Carlo, scenari e obiettivi si prestano a motion sofisticata che comunica relazione, incertezza e traiettoria.

## Outcome UX atteso
L'utente deve percepire:
- maggiore solidita' delle simulazioni
- scenari che evolvono in continuita'
- relazioni piu' chiare tra input, grafici e outcome
- wow tecnico, non ludico

## Feature da implementare
### 1. Scenario morph nelle simulazioni
- **Comportamento utente**: cambiando scenario, i risultati sembrano trasformarsi e riassestarsi.
- **Superficie coinvolta**: Monte Carlo chart, distribution chart, scenario comparison.
- **Priorita'**: altissima.
- **Impatto atteso**: forte differenziazione premium.

### 2. Build progressiva delle distribuzioni
- **Comportamento utente**: distribuzioni e percentile bands si compongono in modo leggibile al primo ingresso.
- **Superficie coinvolta**: chart Monte Carlo e distribuzioni.
- **Priorita'**: alta.
- **Impatto atteso**: wow tecnico controllato.

### 3. Relazione animata tra obiettivi e allocazione
- **Comportamento utente**: nel goal-based investing si sente il legame tra obiettivi, assegnazioni e allocazione risultante.
- **Superficie coinvolta**: tab Obiettivi e componenti associati.
- **Priorita'**: alta.
- **Impatto atteso**: comprensione piu' rapida.

### 4. FIRE calculator con feedback premium
- **Comportamento utente**: cambiando input o leggendo i risultati principali, la pagina appare piu' curata e affidabile.
- **Superficie coinvolta**: calculator tab, banner e metriche principali.
- **Priorita'**: media.
- **Impatto atteso**: coerenza con il resto della sezione.

## Implementazione tecnica
- Trattare il cambio scenario come transizione di stato guidata dai dati, non come reset completo.
- Dare piu' enfasi ai risultati aggregati e meno ai singoli numeri accessori.
- Coordinare input -> elaborazione -> risultato con feedback intermedi chiari se esistono tempi percepibili.
- Nei chart usare un linguaggio motion piu' sofisticato che nelle altre sezioni, ma sempre controllato.
- Se i componenti sono gia' modulari, introdurre un piccolo set di pattern riusabili per simulations.

## Vincoli e guardrail
- `prefers-reduced-motion`: niente morph complessi; aggiornamento pulito e leggibile.
- Niente motion che faccia sembrare le simulazioni "giocose".
- Mobile medi: limitare contemporaneita' di piu' chart animati.
- Nessuna riduzione della leggibilita' di bande percentile, assi o metriche principali.

## Accettazione e test
- Cambiare scenario produce continuita' percepibile nei risultati.
- Le distribuzioni si compongono in modo chiaro e non confuso.
- Goal-based investing comunica meglio le relazioni tra elementi.
- FIRE calculator appare piu' premium senza diventare lento o teatrale.

## Prompt pronto per Codex
Usa `docs/overdrive-specs/00-overview.md` come contesto condiviso e `docs/overdrive-specs/09-fire-and-simulations.md` come fonte di verita' specifica per questa implementazione della sezione FIRE e Simulazioni. Dai priorita' a scenario morph nelle simulazioni, build progressiva delle distribuzioni, relazione animata tra obiettivi e allocazione e feedback premium nel FIRE calculator. Non introdurre effetti decorativi gratuiti e non rendere le simulazioni ludiche o poco affidabili. Rispetta le convenzioni del repo, `prefers-reduced-motion`, i pattern condivisi di motion e usa fallback robusti e sobri. Se fattibile, esegui verifiche locali mirate e chiudi con un riepilogo sintetico di modifiche e verifiche. dimmi cosa e come testare riguardo ciò che hai implementato finora
