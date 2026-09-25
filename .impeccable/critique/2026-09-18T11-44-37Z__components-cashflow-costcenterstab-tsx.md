---
target: Cashflow › Centri di Costo (components/cashflow/CostCentersTab.tsx)
total_score: 22
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 4
target_identity: "file:/Users/giuseppedimaio/Documents/Github.nosync/net-worth-tracker/components/cashflow/CostCentersTab.tsx"
target_fingerprint: "sha256:f08df59a1a0e07f1edca1ba1e46dd53213fa3d5e6e5d5e0320cb2ab214ef917e"
target_path: /Users/giuseppedimaio/Documents/Github.nosync/net-worth-tracker/components/cashflow/CostCentersTab.tsx
timestamp: 2026-09-18T11-44-37Z
slug: components-cashflow-costcenterstab-tsx
closed: true
---
Method: dual-agent (A: design review sub-agent · B: detector/browser sub-agent). Browser: estensione Chrome non connessa; evidenza live da Playwright headless sugli emulatori con il MIRROR del conto reale (3 centri attivi, nessun tetto, nessun dormiente, nessun archiviato — quegli stati sono giudicati dal codice), 1440 e 390, light e dark.

## Design Health Score — Cashflow › Centri di Costo (Operate)

| # | Euristica | Voto | Problema chiave |
|---|---|---|---|
| 1 | Visibilità dello stato | 3 | Il centro aperto non è nell'URL; a 390 il dettaglio si apre con `main.scrollTop` = 530, titolo e link indietro fuori viewport (B) |
| 2 | Corrispondenza col mondo reale | 3 | «2025, intero» (`costCenterNarrative.ts:355-358`) su una storia che parte a settembre 2025; barra piena accanto a «51%» |
| 3 | Controllo e libertà | 2 | Il Back del browser dal dettaglio porta a `/dashboard` (B); l'eliminazione scollega 41 righe senza annulla |
| 4 | Coerenza e standard | 2 | Arm del delete copiato a mano (`CostCenterDetail.tsx:135-176`) invece di `useArmedDelete`; «Al mese» con due denominatori; toast generici invece di `describeWriteError` |
| 5 | Prevenzione degli errori | 2 | Ogni nuovo centro nasce `chart-1` (`CostCenterDialog.tsx:63`); il dialog promette un «avviso» (`:261`) che nessun modulo invia |
| 6 | Riconoscimento più che ricordo | 2 | Il collegamento di una spesa vive in «Impostazioni avanzate» (`ExpenseDialog.tsx:808`) e nessuna superficie dice dove |
| 7 | Flessibilità ed efficienza | 1 | Nessun collegamento multiplo, nessun deep link, le righe di Movimenti non si aprono |
| 8 | Estetica e minimalismo | 3 | 7349 € tre volte sopra la piega; «Per categoria» con una riga al 100% ripete l'hero |
| 9 | Recupero dagli errori | 2 | «Errore nel salvataggio» (`CostCenterDialog.tsx:132`), «Errore durante l'eliminazione» (`CostCentersTab.tsx:168`); la lettura fallita invece è esemplare (`:226-234`) |
| 10 | Aiuto e documentazione | 2 | I footer-legenda funzionano; il meccanismo chiave (collegare una spesa) non è scritto da nessuna parte |
| **Totale** | | **22/40** | **Acceptable** |

## Verdetto di specificità del design

**Valutazione LLM.** Scritta per questo prodotto: verdetto da regole, «in totale» al posto di un asse, pila per centro col mese in corso contornato, «impegnato» contro «speso», conteggio dell'eliminazione preso dalla stessa query della mutazione. La specificità si ferma al confine del tab: collegare una spesa vive in `ExpenseDialog` sotto un collapsible, con un pallino colore rotto; e il verdetto è una classifica che non cambia mai, mentre il grafico mostra settembre come mese record e nessuna frase lo dice.

**Scansione deterministica.** CLI sui file della superficie: 0 finding (exit 0), e nessun waiver di `.impeccable/config.json` copre quei file. In-page: 71 (lista) / 110 (dettaglio) a 1440, 69 / 104 a 390 — quasi tutti falsi positivi: `undersized-ui-text` e `tiny-text` sono i gradini 9–11px della rampa enumerata; ~36 per scan vengono dal pannello Tracciamento montato ma `display:none`; `layout-transition`, `clipped-overflow-container`, `tight-leading` sono shell/sidebar/header; `dark-glow #ffba00` è l'overlay del detector che rileva se stesso; `nested-cards` è la struttura del primitivo `Tile`. Misure pulite: overflow 0 su `main`, contrasto del TESTO 0 fallimenti su 4 setup × 2 viste, 0 misure fuori rampa, console 0 errori / 0 warning, dialog 560px con titolo 20px, `aria-describedby` presente.

**Overlay.** Injection `detect.js` riuscita su lista e dettaglio (1440 e 390) ma in Chromium headless: nessun overlay visibile nel browser dell'utente.

## Impressione generale

La disciplina del sistema tiene e le parole sono oneste sull'eliminazione e sulla lettura fallita. Ma la pagina risponde a «chi costa di più», non a «cosa è cambiato», e i tre difetti che si vedono il primo giorno sono sul conto reale: due auto dello stesso blu, una proiezione gonfiata da una riparazione già pagata, un dettaglio da cui il Back porta in Panoramica. L'opportunità più grande: fare del dettaglio una navigazione e del collegamento un gesto insegnato.

## Cosa funziona

- La conseguenza dell'eliminazione è vera e contata (`CostCenterDetail.tsx:269-275`), il toast ripete il conteggio, la live region annuncia arm E disarm (B).
- `CenterStackBars`: un solo componente per lista e dettaglio, `aria-label` con tutti i valori, hover solo con puntatore fine, mese in corso contornato.
- Il fallimento prima del vuoto (`CostCentersTab.tsx:226-234`): dice cosa non è stato letto e cosa non è stato toccato.

## Priority Issues

### 1. [P1] Due centri su tre hanno lo stesso colore, e il default lo garantisce
- **Evidenza**: da pixel (`*__list.png`) Dacia Jogger e Opel Corsa sono lo stesso blu in pallino, barra, legenda e bande adiacenti della pila. Da misura (B): entrambi i documenti hanno salvato l'hex legacy `#3b82f6` → `LEGACY_HEX_SLOTS` → slot 0 → `#1957d2` light / `#1447e6` dark; `slotFromId` separa solo con `color` assente. `CostCenterDialog.tsx:63`: `fieldsFor` dà `COST_CENTER_COLOR_KEYS[0]` a ogni nuovo centro; nessun controllo di unicità.
- **Perché conta**: sono due auto; il delta tra le due identità è zero, «quanto costa la macchina?» non è leggibile nel grafico.
- **Fix**: default = primo slot libero tra i centri attivi; nel picker «in uso da {nome}» sugli swatch occupati.
- **Comando**: /impeccable colorize

### 2. [P1] Il dettaglio non è una navigazione, e su telefono si apre a metà pagina
- **Evidenza**: `selectedCenter` è `useState` (`CostCentersTab.tsx:113`). Misurato (B): URL invariato, `history.length` 4→4, Back → `/dashboard`; fuoco su `body` all'apertura, al ritorno con «← Centri di costo» e alla chiusura del dialog Modifica; a 390 la riga è a y=908 e dopo il tap `main.scrollTop` resta 530 (link indietro a −380, verdetto a −332, cluster azioni a −236).
- **Perché conta**: un reload perde il centro, il co-intestatario non riceve un link, chi usa la tastiera si perde a ogni passaggio, su telefono si atterra senza sapere dove si è.
- **Fix**: `?tab=cost-centers&center=<id>` con `push`; `main` a 0 e fuoco sul titolo all'apertura; fuoco sull'apritore al ritorno; ritorno del fuoco dal dialog.
- **Comando**: /impeccable harden

### 3. [P1] La proiezione estrapola una spesa una tantum
- **Evidenza**: da pixel (`desktop-light__detail.png`) «Fine mese ~2942 €» nasce dai 1650 € di riparazione del 17/09 proiettati sul ritmo; «~5190 € a fine anno» la incorpora; il footer della tessera dice «Tutto una tantum». Da codice `costCenterSummary.ts:253-256` (`projectWindowEndWithScheduled` sul booked intero).
- **Perché conta**: è un numero che il prodotto non può difendere.
- **Fix**: decidere cosa si proietta (solo la parte ricorrente/il ritmo di fondo, oppure «—» con la causa quando poche righe spiegano il mese) e dichiararlo nella lettura.
- **Comando**: /impeccable clarify

### 4. [P1] Collegare una spesa non è insegnato, e ai bordi è rotto
- **Evidenza (da codice)**: campo in «Impostazioni avanzate» (`ExpenseDialog.tsx:808`); pallino con `backgroundColor: center.color` = `'chart-1'`, CSS non valido (`:822`); la select carica anche i centri archiviati (`:1336`); l'unico indizio è «collega una spesa da Tracciamento» (`costCenterNarrative.ts:181,309`); con zero centri due pulsanti di creazione su desktop e nessuna tessera con l'occhiello (`CostCentersTab.tsx:235-241`).
- **Perché conta**: cinque passaggi su due tab per il primo collegamento; «Creato 14/04 · Prima spesa 02/01» sul conto reale.
- **Fix**: dire DOVE sta il campo (verdetto vuoto, riga di lettura del dialog), `resolveCostCenterColor` nel pallino, filtrare gli archiviati, stato vuoto come tessera.
- **Comando**: /impeccable onboard

### 5. [P2] Le tessere si ripetono e due finestre sono dichiarate male
- **Evidenza**: «Al mese» = `trailingTotal/12` in lista (`costCenterSummary.ts:375`) e `total/monthsSpan` nel dettaglio (`:271`); «Anno scorso 327 € · 2025, intero» copre settembre–dicembre; 7349 / 51% / 87% in verdetto, lettura di Totale, hero e lettura di Centri; aside identico su due tessere (`CostCentersTab.tsx:251,261`); «Per categoria» con una riga al 100%.
- **Comando**: /impeccable distill

### 6. [P2] Eliminazione e dialog fuori dal vocabolario dell'app
- **Evidenza**: arm copiato a mano (`CostCenterDetail.tsx:135-176`), variante piena, senza `aria-pressed`, la griglia scende di ~20px armando; toast generici al posto di `describeWriteError` (`CostCenterDialog.tsx:132`, `CostCentersTab.tsx:168,182`); «Crea» disabilitato senza `describeFormRefusal`; promessa di un «avviso» inesistente (`CostCenterDialog.tsx:261`); `aria-pressed={excluded}` invertito (`SottocategorieTile.tsx:64`); «Mostra altre 16» 316×36 a 390 (B). Il blind spot della guida («keeps its pre-redesign chrome») è obsoleto: il dialog monta già `ResponsiveModal`.
- **Comando**: /impeccable polish

## Persona Red Flags

- **Alex (power user)**: 41 spese collegate una alla volta; le righe di Movimenti non si aprono; nessun deep link. («Il feed non ha un filtro per centro»: affermazione di A, non verificata.)
- **Sam (accessibilità)**: fuoco su `body` a ogni passaggio e alla chiusura del dialog; `aria-pressed` invertito; swatch «Colore 1 di 8» senza «in uso»; identità dei centri affidata al solo colore, che coincide; anello di focus delle righe `#a1a1a1` su bianco 2.58:1; i tab di Cashflow sono cinque tab stop senza roving.
- **Casey (mobile)**: il dettaglio si apre 530px sotto il proprio titolo; «Nuovo centro» a tutta larghezza tra verdetto e dati a ogni visita; un solo link indietro su 7240px; «Elimina» pesa come «Modifica», a 8px da «Archivia».
- **L'accumulatore metodico (PRODUCT.md)**: «2025, intero» gli fa leggere un ×21 falso; «~5190 € a fine anno» incorpora una riparazione; verdetto identico a ogni visita mensile.

## Minor Observations

- Trasversale al TEMA, da rimisurare in `doc/guide/temi.md`: ambra light `#da8b00` su bianco 2.74:1, blu dark `#1447e6` su `#171717` 2.62:1, barre di rango da 3px 2.22–2.51 — sotto il 3:1 non testuale, e contraddice il «worst case 3.38:1» di AGENTS.md.
- In dark il mese in corso (fill 0.55) è la barra più spenta proprio quando è il record.
- «Tocca un centro per aprirlo» anche col mouse; «dal settembre 2025» e «da gennaio 2026» convivono.
- Le tessere non hanno heading (solo `H1` + l'`H2` del verdetto): strutturale al primitivo `Tile`.
- `now` fissato al mount su un tab `forceMount`.
- Nessuna spec Playwright della pagina (dichiarato nella guida).
- Stati non visti sui pixel: tetto, dormiente, archiviato, mai usato, in calendario.

## Questions to Consider

1. Un verdetto che resta uguale finché un centro non sorpassa l'altro è ancora un verdetto?
2. Se un centro deve raccontare una storia dal primo giorno, perché l'azione che lo alimenta è «avanzata»?
3. «Al mese» è diluito dai mesi vuoti, «Fine mese» è gonfiato da una spesa singola: quale dei due numeri il prodotto difende?
