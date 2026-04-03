# Cashflow - Reattivita' premium per il lavoro quotidiano

## Perche' questa sezione
Cashflow e' una sezione pratica, usata spesso e con piu' tab. L'Overdrive qui deve far percepire velocita', continuita' e controllo, non spettacolo.

## Outcome UX atteso
L'utente deve sentire che:
- passare tra tab non azzera il contesto
- filtri e viste rispondono in modo immediato
- il Sankey e il Budget hanno movimento utile, non ornamentale

## Feature da implementare
### 1. Continuita' tra tab cashflow
- **Comportamento utente**: il passaggio tra `Tracciamento`, `Dividendi & Cedole`, `Anno Corrente`, `Storico Totale`, `Budget` sembra un cambio di workspace, non un rerender brusco.
- **Superficie coinvolta**: tab wrapper e contenuti lazy-loaded.
- **Priorita'**: alta.
- **Impatto atteso**: fluidita' percepita trasversale.

### 2. Filtri e feedback reattivi
- **Comportamento utente**: filtri, select e controlli danno risposta visiva immediata.
- **Superficie coinvolta**: tracking, annual views, total history.
- **Priorita'**: alta.
- **Impatto atteso**: sensazione di app nativa.

### 3. Sankey piu' vivo ma sobrio
- **Comportamento utente**: il grafico appare costruito, con ingresso e aggiornamenti leggibili.
- **Superficie coinvolta**: Cashflow Sankey.
- **Priorita'**: media.
- **Impatto atteso**: wow tecnico leggero.

### 4. Budget expansion raffinata
- **Comportamento utente**: categorie e dettagli nel budget si aprono e si richiudono con continuita' pulita.
- **Superficie coinvolta**: Budget tab.
- **Priorita'**: media.
- **Impatto atteso**: comfort nei flussi densi.

## Implementazione tecnica
- Coordinare il wrapper tab-level con motion breve e consistente.
- Dare priorita' a filter feedback, tab indicator e contenitori, non a micro-animazioni su ogni riga.
- Sul Sankey privilegiare ingressi e aggiornamenti semplici, leggibili e non troppo lenti.
- Sul Budget sfruttare i pattern di collapsible gia' presenti ma con maggiore precisione nei timing.
- Evitare replay costanti di animazioni su tab gia' montate.

## Vincoli e guardrail
- `prefers-reduced-motion`: tab e filtri devono restare rapidi e chiari.
- Niente motion che ostacola inserimento dati o lettura rapida.
- Mobile medi: evitare animazioni pesanti su tab e grafici simultanei.
- Nessuna perdita di usabilita' nei controlli di tracking.

## Accettazione e test
- Il cambio tab e' fluido e non confonde.
- Filtri e select danno un feedback immediato ma sobrio.
- Sankey e Budget hanno piu' presenza senza sacrificare leggibilita'.
- Nessun problema nei tab lazy-loaded o nel refresh dati.

## Prompt pronto per Codex
Usa `docs/overdrive-specs/00-overview.md` come contesto condiviso e `docs/overdrive-specs/07-cashflow.md` come fonte di verita' specifica per questa implementazione della sezione Cashflow. Lavora su continuita' tra tab, feedback reattivo di filtri e controlli, Sankey piu' vivo ma sobrio e raffinamento delle espansioni nel Budget. Non introdurre effetti decorativi gratuiti e non peggiorare velocita' percepita o leggibilita' operativa. Rispetta le convenzioni del repo, `prefers-reduced-motion`, il lazy loading esistente e usa fallback semplici dove necessario. Se fattibile, esegui verifiche locali mirate e chiudi con un riepilogo sintetico di modifiche e verifiche. dimmi cosa e come testare riguardo ciò che hai implementato finora
