# Patrimonio - Controllo e densita' senza rigidita'

## Perche' questa sezione
Patrimonio e' una superficie operativa e densa. Qui l'Overdrive non deve essere spettacolare, ma deve far percepire che tabelle, tab e aggiornamenti reagiscono in modo fluido e autorevole.

## Outcome UX atteso
L'utente deve sentire che:
- cambiare macro-tab e sub-tab non resetta la pagina
- aggiornare i dati lascia una traccia visiva chiara ma sobria
- le tabelle storiche si muovono con disciplina, non con inerzia eccessiva

## Feature da implementare
### 1. Transizioni fluide tra macro-tab
- **Comportamento utente**: passare tra `Gestione Asset`, `Anno Corrente` e `Storico` non provoca stacco brusco.
- **Superficie coinvolta**: macro-tab page-level.
- **Priorita'**: alta.
- **Impatto atteso**: percezione immediata di continuita'.

### 2. Sub-tab state-preserving
- **Comportamento utente**: le sub-tab `Prezzi`, `Valori`, `Asset Class` sembrano cambiare vista, non ricaricare tutto.
- **Superficie coinvolta**: sub-tab storiche.
- **Priorita'**: alta.
- **Impatto atteso**: maggiore controllo.

### 3. Evidenza sugli aggiornamenti dati
- **Comportamento utente**: dopo refresh o cambio dati, le aree che cambiano ricevono un highlight breve e chiaro.
- **Superficie coinvolta**: righe, celle, intestazioni o indicatori di aggiornamento.
- **Priorita'**: media.
- **Impatto atteso**: feedback premium.

### 4. Fluidita' tabelle storiche
- **Comportamento utente**: scroll, refresh e passaggi di vista risultano meno rigidi.
- **Superficie coinvolta**: tabelle prezzo/valore/asset class.
- **Priorita'**: media.
- **Impatto atteso**: comfort su dataset densi.

## Implementazione tecnica
- Coordinare macro-tab e sub-tab con motion breve e differenziato tra primo mount e switch successivi.
- Se le tabelle sono gia' pesanti, preferire transizioni del contenitore e highlight mirati invece di animare tutte le righe.
- Valutare virtualizzazione o progressive rendering solo se emergono limiti concreti, non come default v1.
- Rendere il banner mobile e gli stati di loading coerenti col vocabolario motion generale.
- Evitare di animare larghezze di colonne o geometrie tabellari in modo vistoso.

## Vincoli e guardrail
- `prefers-reduced-motion`: switch quasi istantanei con lieve fade.
- Mobile medi: niente animazioni massicce sulle tabelle.
- Nessuna perdita di scannability per numeri e intestazioni.
- Nessun effetto che mascheri i tempi reali di loading.

## Accettazione e test
- Cambiare macro-tab e sub-tab risulta fluido ma rapido.
- Il refresh dati lascia un segnale visivo utile e non invasivo.
- Le tabelle restano leggibili e performanti su desktop e tablet.
- Non devono comparire glitch su mount lazy delle sezioni.

## Prompt pronto per Codex
Usa `docs/overdrive-specs/00-overview.md` come contesto condiviso e `docs/overdrive-specs/03-assets.md` come fonte di verita' specifica per questa implementazione della sezione Patrimonio. Lavora su transizioni tra macro-tab e sub-tab, continuita' di stato, evidenza sobria degli aggiornamenti dati e fluidita' delle tabelle storiche. Non introdurre effetti decorativi gratuiti e non peggiorare la leggibilita' dei dati tabellari. Rispetta le convenzioni del repo, `prefers-reduced-motion`, il breakpoint `desktop:` e usa fallback semplici dove serve. Se fattibile, esegui verifiche locali mirate e chiudi con un riepilogo sintetico di modifiche e verifiche. dimmi cosa e come testare riguardo ciò che hai implementato finora
