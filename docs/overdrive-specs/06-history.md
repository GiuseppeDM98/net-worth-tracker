# Storico - Narrazione del tempo senza perdere densita'

## Perche' questa sezione
Storico e' la pagina piu' narrativa della dashboard. Ha molte sezioni dense ma collegate da una logica temporale forte. E' perfetta per un Overdrive che organizza, guida e rende leggibile la complessita'.

## Outcome UX atteso
La pagina deve sembrare un percorso:
- l'utente entra e capisce da dove partire
- le sezioni si presentano come capitoli
- i grafici cambiano modalita' senza stacchi brutali
- la timeline dei raddoppi e i blocchi storici hanno presenza editoriale controllata

## Feature da implementare
### 1. Chapter reveal per sezioni chiave
- **Comportamento utente**: le sezioni principali si presentano con ordine, non come lunga colonna indistinta.
- **Superficie coinvolta**: intro, chart blocchi, confronti finali.
- **Priorita'**: alta.
- **Impatto atteso**: forte miglioramento della leggibilita'.

### 2. Morph annuale/mensile
- **Comportamento utente**: i cambi di modalita' nei chart sembrano trasformazioni della stessa vista.
- **Superficie coinvolta**: savings/investment data e altri chart con toggles.
- **Priorita'**: alta.
- **Impatto atteso**: sensazione premium immediata.

### 3. Timeline milestone con build progressiva
- **Comportamento utente**: i traguardi di raddoppio e i momenti chiave si costruiscono in sequenza significativa.
- **Superficie coinvolta**: Doubling timeline e summary.
- **Priorita'**: media.
- **Impatto atteso**: wow editoriale misurato.

### 4. Sezioni dense orchestrate
- **Comportamento utente**: i grandi blocchi chart non sembrano concorrere tra loro.
- **Superficie coinvolta**: net worth, asset class, liquidita', YoY, labor metrics, current vs target.
- **Priorita'**: media.
- **Impatto atteso**: minore fatica cognitiva.

## Implementazione tecnica
- Usare reveal progressivi per sezioni, non uno stagger indiscriminato su tutto.
- Per i toggle di modalita', favorire continuita' di assi, contenitore e leggenda dove possibile.
- La timeline milestone puo' avere staging piu' evidente, ma solo come momento locale.
- Coordinare l'ingresso delle sezioni con timing brevi e gerarchici.
- Non trasformare la pagina in un'esperienza scroll-jacked; lo scroll deve restare naturale.

## Vincoli e guardrail
- `prefers-reduced-motion`: niente reveal sequenziali complessi, solo ordine visivo chiaro.
- Evitare replay di tutte le sezioni a ogni piccola interazione.
- Nessuna perdita di leggibilita' in pagine gia' molto dense.
- Mobile e landscape: non sovraccaricare con troppi ingressi concorrenti.

## Accettazione e test
- La pagina appare piu' leggibile e meno monolitica al primo ingresso.
- I toggle annuale/mensile trasmettono continuita' e non reset.
- Timeline e summary hanno carattere ma non rubano il focus ai dati principali.
- Nessuna regressione su export, note, filtri e modal esistenti.

## Prompt pronto per Codex
Usa `docs/overdrive-specs/00-overview.md` come contesto condiviso e `docs/overdrive-specs/06-history.md` come fonte di verita' specifica per questa implementazione della pagina Storico. Concentrati su chapter reveal delle sezioni, morph tra modalita' annuale/mensile, costruzione progressiva della timeline milestone e migliore orchestrazione dei blocchi densi. Non introdurre effetti decorativi gratuiti e non trasformare la pagina in un'esperienza teatrale o lenta. Rispetta le convenzioni del repo, `prefers-reduced-motion`, i pattern condivisi e usa fallback semplici e robusti. Se fattibile, esegui verifiche locali mirate e chiudi con un riepilogo sintetico di modifiche e verifiche. dimmi cosa e come testare riguardo ciò che hai implementato finora
