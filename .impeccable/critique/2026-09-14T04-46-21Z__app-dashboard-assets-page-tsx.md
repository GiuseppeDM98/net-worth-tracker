---
target: Patrimonio (app/dashboard/assets/page.tsx)
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/Users/giuseppedimaio/Documents/Github.nosync/net-worth-tracker/app/dashboard/assets/page.tsx"
target_fingerprint: "sha256:284b821a22def41f13b1e8bc52ba93ff099f52261877a82f7cb92be9fc9bc6c1"
target_path: "/Users/giuseppedimaio/Documents/Github.nosync/net-worth-tracker/app/dashboard/assets/page.tsx"
timestamp: 2026-09-14T04-46-21Z
slug: app-dashboard-assets-page-tsx
closed: true
---
Method: dual-agent (A: design review sub-agent · B: detector/browser sub-agent). Browser: estensione Chrome non connessa; evidenza live da Playwright headless sugli emulatori con il MIRROR del conto reale (`mirror@example.com`, 293.175,11 €, 18 strumenti, 4 conti, settembre 2026 in calo) a 1440 · 1024 · 390, dark e light, più cinque modali. Ogni affermazione sul codice è stata riverificata nel sorgente dal parent.

## Design Health Score — Patrimonio (Operate)

| # | Euristica | Voto | Problema chiave |
|---|---|---|---|
| 1 | Visibilità dello stato | 2 | l'header dice «prezzi aggiornati oggi alle 20:52» (bene); ma un submit fallito di «Nuovo ETF» lascia la status line sulla frase idle (`handleSubmit(onSubmit)` senza `onInvalid`, `AssetDialog.tsx:1303`) e il passo 2 perde il contatore («Passo 1 di 2» → «Patrimonio · ETF») |
| 2 | Corrispondenza col mondo reale | 3 | la tabella stampa il modello di storage: «Fondo Pensione Giuseppe · 29.197,36 · 1,0000 €», «Casa Rovereto S/S · 130.000,00 · 1,0000 €» — 5 righe su 18 con una quantità che non è una quantità |
| 3 | Controllo e libertà | 3 | Escape chiude ovunque, «Cambia tipo» torna indietro; nessun undo dopo un'eliminazione e, nel dettaglio conto, Escape con «Premi di nuovo» armato CHIUDE la modale invece di disarmare |
| 4 | Coerenza e standard | 3 | due vocabolari di conferma («Conferma?» in riga, «Premi di nuovo» in modale); «Aggiungi conto» apre «Che cosa vuoi aggiungere?» a 8 tipi, identico ad «Aggiungi asset» (`page.tsx:417` → `openCreate`); maiuscole miste nel form |
| 5 | Prevenzione dell'errore | 3 | clamp della quantità e «Vendi tutto» nel calcolatore, `min` dalla posizione iniziale; ma un conto da 6.044,37 € si elimina in due click senza una parola sulle conseguenze |
| 6 | Riconoscere invece che ricordare | 2 | 18 righe × 5 icone ghost 32×32 senza etichetta (90 tab stop in una tessera); l'intestazione «AZIONI» sopra una colonna piena di chip «Azioni» |
| 7 | Flessibilità ed efficienza | 2 | 15 tab stop prima del primo controllo, nessuna scorciatoia; 5 colonne ordinabili su 13 e nessuna delle Δ; `showDeltas`/`groupByClass` si resettano a ogni visita (`StrumentiTile.tsx:150-151`) |
| 8 | Estetica e minimalismo | 3 | composizione calma in entrambi i temi; quattro decimali su ogni prezzo e un terzo delle righe con «−» in cinque celle |
| 9 | Recupero dall'errore | 1 | «Ticker is required», «Name is required», «Invalid ISIN format» in inglese (`AssetDialog.tsx:339-355,403`); nessuno scroll al primo errore su un form da 1794px in 562px |
| 10 | Aiuto e documentazione | 3 | tooltip su «Δ Inizio», footer che spiega tinta e PMC, la nota «La posizione iniziale non si elimina…» nel Registro |
| **Totale** | | **25/40** | **Acceptable** (62%) |

## Design Specificity Verdict

**LLM assessment (A):** autoriale nel livello che parla, intercambiabile nel livello che si usa. La frase d'apertura («Il portafoglio è in calo per le tasse sulla vendita di VWCE, non per il mercato.» + «Hai venduto VWCE per 39.052 € con una plusvalenza di 15.726 € e pagato circa 4089 € di tasse.») è una diagnosi che nessun template produce; la cadenza della tessera è applicata con disciplina. Ma la tessera dove il gestore lavora è una tabella d'amministrazione generica (header con doppia freccia, cinque icone ghost in coda, `AssetDialog` con 20 campi e 3,2 schermate di scroll). Occasione mancata: il BTP Valore Marzo 2032 è tipograficamente identico a una riga di crypto — niente cedola, scadenza, coefficiente.

**Deterministic scan (B):** `impeccable detect --json` su page + 11 componenti + 7 primitive → 0 findings (exit 0, anche con `--no-config`); la sonda con file di controllo prova che la regex su `.tsx` NON legge array di hex in TS, `text-[10px]`, `h-6 w-6`, `text-emerald-*`, `img` senza alt. Overlay `detect.js` live a 1440 dark: 71 anti-pattern — `undersized-ui-text` ×32, `tiny-text` ×28, `nested-cards` ×6, `layout-transition` ×4. Falsi positivi: `nested-cards` è la griglia, `layout-transition` la sidebar, gli occhielli 10px sono la scala dichiarata. Restano veri i 9px di `TILE_SUB_EYEBROW_CLASS` (sotto-occhielli e intestazioni di tabella), dichiarati in DESIGN.md → Table inside a Tile.

**Dove A e B concordano**: header a 390 (42×36, 40×36); «Aggiungi conto» → picker generico; 15 tab stop; quattro target sotto 32px (`Aggiungi conto` 75×17, `Mostra tutte` 60×17, link «Allocazione» 56×15, «Rendimenti» 55×15). **B oltre A**: 13 `<svg role="application" tabindex="0">` senza nome a 390/1024 (sparkline nelle righe); ordine DOM ≠ ordine visivo (Liquidità/Movimenti via CSS `order`); `<main>` senza nome; 2 bottoni info del Registro a 12×12 (`AssetMovementsDialog.tsx:523-529`). **Falsi positivi di B**: textarea (ha `Label htmlFor="trade-note"`) e 3 switch (hanno `Label htmlFor`).

**Pulito, misurato in cinque viste:** overflow di `main` 0; console error/warning 0 (cold e warm); `/api/` ≥ 400 zero; nomi accessibili 0 mancanti a 1440; `thead th` 10/10 `scope="col"`, 18 `th scope="row"`; contrasto 0/392 sotto AA in dark; in light 17/392 a 1440 e 54/664 a 390 — i chip di segno a 3,97:1 (Known Issue strutturale) e `text-muted-foreground` sulla superficie tessera a 4,48:1 (a 0,02 dalla soglia; da rimisurare contro il token prima di toccarlo).

## Overall Impression

La pagina risponde al risparmiatore nei primi 300px e poi lo tratta da amministratore generico. Il verdetto e il Registro sono il meglio; tra i due, l'utente incontra un XIRR del 4388%, errori in inglese e un delete senza conseguenze dette. Opportunità: la stessa onestà del verdetto applicata al livello operativo.

## What's Working

1. Il verdetto nomina la causa e rinuncia alla scorciatoia (`resolveDeclineCause` condiviso; la clausola senza dato sparisce).
2. La riga mobile è migliore della tabella desktop (56-64px chiusa; aperta: dettagli, sparkline, tre Δ con la nota, cinque azioni testuali da 44px).
3. La modale Movimenti è il modello (lettura, tre KPI, tabella con P&L, conseguenza SOPRA i cestini, `useArmedDelete`).

## Priority Issues

### [P1] «XIRR +4388,68% annualizzato» stampato senza guardia
- **What**: `computeAssetXirr` (`assetTransactionUtils.ts:451-461`) rifiuta solo una finestra sotto un giorno; `AssetMovementsDialog.tsx:100-101,187-194` stampa il risultato in verde con «annualizzato». Live sul Registro di VWCE (posizione dal 23/07/2026): `+4388,68%`.
- **Why it matters**: l'unico numero che l'utente non può usare, nel posto dove verifica la fiducia; Rendimenti rifiuta di annualizzare sotto sei mesi, la Previdenza dichiara «non è una misura».
- **Fix**: `null` sotto ~180 giorni; al suo posto il rendimento NON annualizzato sul periodo, dichiarato («+66,9% in 47 giorni, non annualizzabile»); parole in `dialogNarrative.ts`.
- **Suggested command**: /impeccable harden

### [P1] Il form di creazione fallisce in inglese e la status line tace
- **What**: submit a vuoto di «Nuovo ETF»: «Ticker is required», «Name is required» (`AssetDialog.tsx:339,350,403`; anche `:340,352-355`); la riga di lettura resta idle (`handleSubmit(onSubmit)` senza `onInvalid`, `:1303`); `scrollTop` 0 su 1794px in 562px.
- **Why it matters**: primo attrito di chi aggiunge il primo strumento, contro «Italiano per costruzione» e `doc/guide/dialog.md` («The reading IS the status line»); l'unico `aria-live` non cambia.
- **Fix**: messaggi zod italiani centralizzati; `onInvalid` → status `error` che conta e nomina i campi; `scrollIntoView` + `aria-invalid` sul primo.
- **Suggested command**: /impeccable clarify

### [P1] Eliminare un conto: nessuna conseguenza detta, Escape non disarma
- **What**: `CashAccountDialog.tsx:62-76` con lo stato armato tenuto dalla pagina (`page.tsx:285-296`, timer 3 s) e non da `useArmedDelete`: `hasArmedConfirm()` è falso, Escape chiude (misurato); la lettura armata dice ancora «Il saldo si muove da solo…» su Conto BNL, 6.044,37 €.
- **Why it matters**: l'azione più distruttiva della pagina, senza undo e senza conseguenze dette. Il timer sulle RIGHE è scelta del proprietario (blind spot); nella MODALE contraddice `dialog.md`.
- **Fix**: `useArmedDelete` nel dialog; conseguenza nella riga di lettura quando armato; via il timer nella modale.
- **Suggested command**: /impeccable harden

### [P2] «Andamento» spinge la colonna Azioni fuori dalla vista
- **What**: a 1440 con il toggle attivo il wrapper (`StrumentiTile.tsx:506`) misura `scrollWidth 1344 / clientWidth 1142`: 202px fuori, la colonna «Azioni»; nessuna sticky, nessun segno; le tre Δ non ordinabili (`:519-542`).
- **Why it matters**: l'unico gesto della pagina sparisce quando si accende il confronto che serve a compierlo.
- **Fix**: colonna azioni `sticky right-0` con fondo di riga (tinta `--chart-3` preservata) o menu di riga; ombra sul bordo; `SortHead` sulle tre Δ.
- **Suggested command**: /impeccable layout

### [P2] La tabella stampa il modello di storage su 5 righe su 18
- **What**: `StrumentiTile.tsx:295-296` stampa Quantità e Prezzo per ogni riga («Fondo Pensione Giuseppe · 29.197,36 · 1,0000 €», «Casa Rovereto S/S · 130.000,00 · 1,0000 €»); «Academia Private Equity» ha PMC 1,0000 € = prezzo e stampa «+0,00 € / +0,00%» (`hasCostBasis`, `patrimonioSummary.ts:143-147`).
- **Why it matters**: «il valore vive in `quantity` a prezzo 1» è persistenza, non un fatto per il lettore; uno zero dove nulla è misurato viola The Absence-Has-Three-Names Rule.
- **Fix**: per `requiresManualPricing` una sola cella Valore, Quantità/Prezzo/PMC a «—» e «a mano dal gg/mm» sotto il nome; un PMC a mano uguale al prezzo corrente è assenza, non G/P nullo.
- **Suggested command**: /impeccable distill

## Persona Red Flags

**Alex**: 38 Tab fino alla prima azione di riga; nessuna scorciatoia; ordinamento su 5 colonne di 13 e su nessuna Δ; i toggle si resettano; nessuna ricerca né azione multipla; nessun «salva e aggiungine un altro».

**Sam**: `<th tabIndex={0}>` senza `role="button"` (`StrumentiTile.tsx:88-99`) con outline di default; 90 tab stop di icone; 13 sparkline `role="application"` focusabili e mute su telefono; `<main>` senza nome; ordine DOM ≠ visivo; il fallimento del submit non è annunciato. Ok: focus nelle modali, Escape, 0 senza nome a 1440, 0/392 sotto AA in dark.

**Casey**: azioni primarie in cima e sotto misura (42×36, 40×36); 28 target sotto 44px di cui 4 sotto 32; righe a 38-39px; la tessera Strumenti a y 2541 su 4032.

**Il risparmiatore metodico**: servito nei primi 300px; poi XIRR 4388%, fondi pensione con 29.197,36 «quantità» a 1,0000 €, «Andamento» che nasconde le azioni, i toggle da riaccendere ogni mese.

## Minor Observations

- Raggruppamento incoerente nella stessa frase mono («−3910,34 €» accanto a «39.052 €» e «4089 €», `minimumGroupingDigits: 2`).
- «Liquidità Directa …» due volte a 251px; solo l'`aria-label` distingue Giuseppe da Marcella.
- Il digest «Mercato:» mescola registri e tronca: «AIGE · WBIT · Fondo Pensione G · altri».
- Calcolatore tasse: input «Valore lordo desiderato (€)» (`TaxCalculatorModal.tsx:245`), nota sotto che lo legge come NETTO (`:310-328`).
- A 1024×768 «Andamento» e «Raggruppa per classe» spariscono (`StrumentiTile.tsx:442`).
- «su agosto» nel verdetto, «settembre» in Movimenti: due finestre nella stessa schermata.
- L'asterisco dei 7 obbligatori mai spiegato; quattro decimali su ogni prezzo.
- Chip Compra/Vendi 10px `bg-positive/10 text-positive`: Known Issue strutturale.
- Due `h1` nel DOM, il verdetto `h2` a 30px sotto un `h1` a 14px; nessun `h3`.

## Questions to Consider

1. Se il compito è gestire strumenti e conti, perché il gestore comincia a 2.541px su un telefono?
2. Il prodotto rifiuta di annualizzare sotto sei mesi in Rendimenti e stampa +4388,68% annualizzato in una modale: l'onestà è delle pagine o del prodotto?
3. La tabella mostra a chi possiede un BTP Valore, un BTP€i e tre fondi pensione le stesse dieci colonne di chi ha solo ETF: cosa cambierebbe se la riga di un'obbligazione portasse cedola e scadenza al posto di TER e PMC vuoti?
