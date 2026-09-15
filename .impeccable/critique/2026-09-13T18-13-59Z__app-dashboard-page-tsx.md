---
target: Panoramica (app/dashboard/page.tsx)
total_score: 23
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
target_identity: "file:/Users/giuseppedimaio/Documents/Github.nosync/net-worth-tracker/app/dashboard/page.tsx"
target_fingerprint: "sha256:e93b83f08513fd5bf8d299128d690b45a0c6aaad32eb1af3929adb1b783b2563"
target_path: "/Users/giuseppedimaio/Documents/Github.nosync/net-worth-tracker/app/dashboard/page.tsx"
timestamp: 2026-09-13T18-13-59Z
slug: app-dashboard-page-tsx
closed: true
---
Method: dual-agent (A: design review sub-agent · B: detector/browser sub-agent). Browser: Chrome extension not connected; live evidence via repo Playwright (headless, dark/light, 1440 · 1024 · 390) on the emulators with a MIRROR of the owner's real account (`mirror@example.com`, 22 asset, 293.185,45 €, settembre 2026 in calo) — screenshots, overflow, targets, contrast, console, detect.js overlay. Every code-level claim below was re-verified in the source by the parent before writing.

## Design Health Score — Panoramica (Operate)

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | skeleton e fallimento sono stati distinti (`resolveSurfaceState`); ma nessuna riga dice QUANDO i prezzi sono stati letti, solo «snapshot del mese presente» in mono 11px |
| 2 | Match System / Real World | 2 | il verdetto stampa una chiave del database dentro la prosa: «e **pension** hanno fatto il grosso del lavoro» (`PENSION_BAND_KEY` non è in `CLASS_SUBJECTS`, il fallback stampa la chiave); `CashflowTile` scrive «A agosto» invece di «Ad agosto» |
| 3 | User Control and Freedom | 2 | nessuna tessera, riga, categoria o strumento è cliccabile; l'unica uscita è «Tutti e 22 in Patrimonio.» a 53×15px |
| 4 | Consistency and Standards | 3 | anatomia della tessera applicata con disciplina, ma Spese/Entrate per categoria escono SENZA riga di lettura (`CategoryTile`: «la Panoramica non ne ha»); `PeriodSelector` a `text-[10.5px]`, una misura fuori dalla scala dichiarata |
| 5 | Error Prevention | 3 | la sovrascrittura dello snapshot nomina il mese e si disabilita a 0 asset/demo; ma il confirm è un `Dialog` grezzo (fuori dal vocabolario delle modali), «Sovrascrivi» non è armato e non dice cosa si perde |
| 6 | Recognition Rather Than Recall | 2 | «29,2% · 1,41×» due rapporti senza etichetta; Liquidità/Liquidabili/Illiquidi tre quasi-sinonimi senza glossa; «Mercato:» non dice che è effetto prezzo e non movimenti; l'eroe è il LORDO, il netto (282.589 €, −10.596 €) sta a 22px in un'altra tessera |
| 7 | Flexibility and Efficiency | 1 | nessuno skip link: 14 tab stop di sidebar prima del primo controllo; nessun drill-down, nessuna scorciatoia; il visitatore quotidiano e il primo visitatore vedono la stessa pagina |
| 8 | Aesthetic and Minimalist Design | 3 | bellissima in dark; ma la frase del verdetto porta 8 cifre mono in 3 righe a 1440 e **8 righe a 390**; lo stretch `mt-auto` lascia ~90px vuoti in Costi e ~150px in Entrate per categoria |
| 9 | Error Recovery | 3 | `ErrorNotice` al posto del verdetto, conseguenza detta e retry funzionante — modello; ma la pagina legge UN payload, quindi un fallimento spegne tutte le nove tessere (non riprodotto live) |
| 10 | Help and Documentation | 1 | nessun tooltip, glossario, «?» o link dalla cifra alla pagina che la possiede: TER medio, 1,41×, Liquidabili, snapshot restano non spiegati |
| **Total** | | **23/40** | **Acceptable** (57%) |

## Design Specificity Verdict

**LLM assessment (A, non ancorata):** pagina AUTORIALE, non intercambiabile. Tre scelte che nessun template contiene: il verdetto È la pagina («Settembre è in calo, nonostante il mercato.» a 30px, il tono portato dal solo punto finale ambra); lo split mono/sans è strutturale (le cifre cambiano font a metà frase, come una nota di private banker); l'assenza è progettata («–» dove un rendimento non è misurabile, «pagato circa» sulla tassa stimata). Dove smette di essere autoriale: **è un poster, non uno strumento** — nove tessere dei soldi veri e l'intera superficie interattiva è un toggle a 6 vie dello sparkline e un bottone snapshot (23 tab stop a 1440, 14 di sidebar); **il tema chiaro è un port** — nella legenda Composizione misurata live tre classi sono arancioni (Azioni `rgb(245,74,0)`, Immobili `rgb(255,185,0)`, Liquidità `rgb(254,154,0)`, a 31 di distanza RGB da Immobili) e due sono teal (Obbligazioni `rgb(0,150,137)`, Trend Following `rgb(22,127,147)`), e la curva dell'eroe è dipinta in `--chart-1` light (tonalità 41°), la stessa famiglia di `--destructive`; la shell non porta carattere (`Portfolio Tracker` 13px è l'unico branding, l'`h1` è il saluto e la pagina non si nomina mai).

**Deterministic scan (B):** `impeccable detect` sul sorgente (page + 8 componenti + 4 primitive) → **0 findings** (exit 0), ma B ha provato con due file di controllo che la regola `design-system-color` non legge le utility Tailwind né gli hex in array TS: lo zero sul sorgente non certifica nulla. **Overlay `detect.js` iniettato live** a 1440 dark (preflight di mutazione riuscito, live server su :8400, fermato): `[impeccable] 46 anti-patterns` — `undersized-ui-text` ×31 (gli occhielli 10px `TILE_EYEBROW_CLASS`, i sotto-occhielli 9px, le etichette del pill 10,5px, le didascalie dello sparkline), `nested-cards` ×8 (una per tessera), `layout-transition` ×5 (sidebar `width`/`margin` e `body { height }`: shell, non pagina), `tiny-text` ×4 (i footer mono 11px). **Falsi positivi dichiarati**: `nested-cards` ×8 è esattamente la griglia «Verdict over Tiles» (la regola conta la shell come card esterna); i 35 hit di testo cadono tutti sulla scala DICHIARATA in DESIGN.md (9/10/11px) — un disaccordo detector↔sistema, non uno scivolone locale; 21 `text-occlusion` + 1 `dark-glow` di una seconda scansione erano i badge dell'overlay che scansionavano sé stessi (esclusi). **Dove A e B concordano**: il pill periodo (10,5px fuori scala per A; `undersized` per B; 4,34:1 in light per la misura di contrasto di B, 4,35:1 per quella di A); le 4 tessere su 8 senza riga di lettura (B le ha contate dal DOM, A le ha giudicate). **Cosa B ha misurato che A non ha**: 7 segmenti della barra Composizione con `title` e senza `aria-label` (`Azioni · 45,34%` …); l'`h1` è doppio nel DOM e uno solo visibile per viewport; nessun `h3` in tutta la pagina.

**Visual overlays:** nessuna scheda [Human] (estensione non connessa); l'overlay è documentato dallo screenshot `panoramica-overlay-1440-dark.png` e dai 48 log console salvati in `overlay-console.json`.

**Pulito, misurato in tutte e quattro le viste (1440/390 × dark/light):** overflow orizzontale di `main` 0 elementi; console error/warning 0; risposte `/api/` ≥ 400 zero; contrasto AA 0/218 nodi sotto soglia in dark; 5/218 in light (le etichette inattive del pill) più il chip variazione a 3,97:1 (il difetto strutturale dei chip già dichiarato); 0 controlli senza nome accessibile, 0 immagini senza nome; focus ring visibili su sidebar, bottone snapshot e pill; bottom nav 4/4 target ≥ 44px.

## Overall Impression

La pagina fa la cosa difficile — dire la verità su un mese in calo senza gridare — e sbaglia la cosa facile: in quella stessa frase stampa `pension`. Il verdetto e il digest «Mercato:» sono il meglio del prodotto; tutto ciò che sta sotto è una stampa che non si può toccare. La singola opportunità più grande: la storia vera del mese (venduto VWCE, il broker ha trattenuto ~4.089 €, ecco perché settembre è giù) è già tutta nella frase, spezzata in tre clausole che il lettore deve sommare da solo.

## What's Working

1. **Il tono in un punto fermo.** `PageVerdict` colora solo il `.` finale: una titolazione rossa farebbe di ogni mese imperfetto una crisi; una frase a 30px con un punto ambra afferma un verdetto senza alzare la voce — e regge il contatto con un mese reale in calo.
2. **Il digest di mercato dice ciò che un delta di classe non può.** `q_prev × (u_curr − u_prev)`, nascosto del tutto senza `byAsset` precedente, Previdenza come riga propria: sul conto reale cinque righe oneste che sommano a +153 €, esattamente la cifra che lo split del verdetto cita. Due superfici, un'aritmetica, zero deriva.
3. **Il caricamento è un'attesa, non una bugia.** Skeleton del verdetto + griglia negli span della pagina, `role="status"` annunciato una volta, placeholder `aria-hidden`, `motion-safe:animate-pulse`, e `resolveSurfaceState` tiene il fallimento strutturalmente separato: nessun pulse eterno.

## Priority Issues

### [P0] Il verdetto stampa una chiave del database e il tile scrive «A agosto»
- **What**: live sul mirror: «Hai messo da parte il 29% delle entrate e **pension** hanno fatto il grosso del lavoro (+256 €).» — `lib/utils/overviewNarrative.ts:119` `classSubject()` ripiega su `assetClass.toLowerCase()` e `CLASS_SUBJECTS` (108-117) non ha la chiave `PENSION_BAND_KEY`; il digest quattro righe sotto dice correttamente «Previdenza». Inoltre `components/dashboard/overview/CashflowTile.tsx:129` rende «A {previousMonth}» → «A agosto» e `:33` «come a {previousMonth}», mentre `withPrepositionA` (`overviewNarrative.ts:87`) esiste e non è chiamato: la tessera scrive copy, contro la regola della pagina.
- **Why it matters**: il posizionamento è «Italian by construction» e la credibilità della pagina sta nel fidarsi delle frasi che genera; chi legge `pension` nel proprio verdetto non ha motivo di credere nemmeno a «4089 € di tasse».
- **Fix**: aggiungere `[PENSION_BAND_KEY]: { subject: 'i fondi pensione', plural: true }` a `CLASS_SUBJECTS` e far sì che un soggetto NON mappato lasci cadere la clausola del driver (Narrative Honesty Rule: un input mancante perde la sua clausola, mai un placeholder); portare le due stringhe di `CashflowTile` in `overviewNarrative.ts` attraverso `withPrepositionA`; un test su `ASSET_CLASS_SEQUENCE ∪ {PENSION_BAND_KEY}` che ogni chiave risolva a un soggetto, e uno che aprile/agosto/ottobre prendano «ad».
- **Suggested command**: /impeccable clarify

### [P1] Nove tessere, niente da toccare: la Panoramica è un poster
- **What**: ordine di tab misurato a 1440: 14 stop di sidebar, «Crea snapshot», sei bottoni periodo 38×26, un link 53×15. Fine. `RankedRows` supporta `onRowClick` (Analisi lo usa) e la Panoramica non lo passa; `CategoryTile` supporta `footer` e la Panoramica non lo passa; nessuna tessera ha un «Dettaglio» — ogni pagina propagata DOPO questa lo ha avuto.
- **Why it matters**: il job è «capire in pochi secondi com'è messa la mia situazione, confrontarla col passato» — la pagina vince la prima metà e muore sulla seconda. Chi vede «Mutuo 559 € 29%» e vuole capire deve trovare Cashflow → Analisi a mano e ricostruire il contesto.
- **Fix**: in `app/dashboard/page.tsx` passare `onRowClick` alle due `CategoryTile` verso `/dashboard/cashflow?tab=analisi&focusType=…&focusCat=…` (la Scheda legge già quei parametri via `handleEntitySelect`); dare a `CategoryTile` e `ComposizioneTile` un `footer` nell'idioma di «Tutti e 22 in Patrimonio.» («Tutte le categorie in Analisi.», «Il piano in Allocazione.»); ogni riga di `AssetPrincipaliTile` un link allo strumento in Patrimonio; i nomi di classe di «Mercato:» link ad Allocazione.
- **Suggested command**: /impeccable shape

### [P1] Il tema chiaro è un port: due coppie di classi collassano e l'eroe è nella tinta della perdita
- **What**: legenda Composizione misurata live a 1440 light: Liquidità `rgb(254,154,0)` a 31 da Immobili `rgb(255,185,0)`; Trend Following `rgb(22,127,147)` a 33 da Obbligazioni `rgb(0,150,137)`; tre delle sette classi arancioni. La barra di composizione (8px, solo colore, `title` senza `aria-label`) è quindi illeggibile in light. Lo sparkline dell'eroe usa `--chart-1` light = `oklch(0.646 0.222 41.116)`, la famiglia di `--destructive` (27°): una curva che SALE è disegnata nel colore della perdita. In più il chip «−4155,63 € (−1,40%)» misura 3,97:1 in light.
- **Why it matters**: DESIGN.md registra che lo slot 6 dark fu corretto il 2026-08-30 perché a ΔE00 0,87 da jade-return; lo stesso problema in light non è mai stato misurato. Il floor di casa per i segnali di identità non testuali è 3:1.
- **Fix**: nel frontmatter di DESIGN.md e in `app/globals.css` `:root --chart-1..8` allontanare `chart-4-light` (84°) da `chart-5-light` (70°) — uno dei due nella banda 340–20°, che il light non ha — e `chart-7-light` (215°) da `chart-2-light` (185°) verso 240°; ri-derivare `PRINT_CHART_HEX` in `printTokens.ts`; un test che asserisca un ΔE00 minimo fra ogni coppia degli otto slot IN ENTRAMBI i modi (la regola è in prosa e nulla la applica); valutare lo sparkline fuori da `chart-1` in light.
- **Suggested command**: /impeccable colorize

### [P2] Lo stretch produce buchi e la colonna etichetta perde contro una barra decorativa
- **What**: (1) `TILE_CELL_CLASS` stira ogni tessera alla riga e `mt-auto` inchioda il footer: ~90px vuoti dentro Costi (fra «TER 353 € · bollo 385 €» e «PESANO DI PIÙ») e ~150px dentro Entrate per categoria (3 righe contro le 6 di Spese), misurati a 1440. (2) `components/ui/ranked-rows.tsx:45` `labelWidth = 'w-[92px]'` con `shrink-0` e barra `flex-1`: «Stipendio Giuseppe» diventa «Stipendio Giu…» e «Entrate da investimenti» «Entrate da inv…» a OGNI larghezza, mentre la barra da 3px prende 120px a 1440 e 210px a 1024 — il commento dichiara l'intento («la barra tiene una traccia anche in una tessera da 3 colonne»), l'implementazione dà alla barra tutto il surplus invece di un pavimento.
- **Why it matters**: «Elegante · Essenziale» contraddetto da un buco di 90px e da un prodotto che tronca il nome della categoria dell'utente — la voce di entrata più grande della pagina — per proteggere una barra ordinale.
- **Fix**: `ranked-rows.tsx`: invertire i vincoli — etichetta `min-w-[92px] flex-1 truncate`, barra `w-[120px] shrink-0` (o `flex-[0_1_120px]`), `min-w-[40px]` come pavimento; `CostiTile`/`CategoryTile`: sotto una soglia di contenuto far sedere il footer sotto il corpo (niente `mt-auto`) o dare alla tessera corta uno span desktop minore perché lo slack cada FRA le tessere e non dentro una.
- **Suggested command**: /impeccable layout

### [P2] L'unico controllo della pagina è sotto-costruito a ogni livello
- **What**: `components/dashboard/PeriodSelector.tsx`: `text-[10.5px]` (misura assente dalla scala dichiarata); 26px di altezza (38×26 a 1440, 51×26 a 390) contro il pavimento 44×44, sull'unico controllo di contenuto che un telefono ha; etichette inattive a 4,34:1 in light (sotto AA); `role="tablist"`/`role="tab"` senza `aria-label`, senza `aria-controls`, senza `tabpanel` e senza roving tabindex (6 tab stop separati) — sono filtri, non tab; sei opzioni contro un budget di ≤4.
- **Why it matters**: è l'intero vocabolario di interazione della pagina, presentato a una misura e a un target che rendono la scelta un lavoro.
- **Fix**: `text-[11px]`; `h-9` su desktop e `min-h-11` sotto `desktop:`; token inattivo che superi 4,5:1 in light; `aria-label="Periodo del grafico"`; o completare il pattern tab (roving tabindex + `aria-controls` sullo sparkline) o passare a `semantics="radio"` come Previdenza il 2026-09-13; valutare quattro periodi (`6M · 1A · 3A · All`).
- **Suggested command**: /impeccable harden

## Persona Red Flags

**Alex (power user)**: 14 tab stop di sidebar prima del primo controllo, a ogni caricamento, nessuno skip link e `<main>` senza nome; «Mutuo 559 €», «VWCE 84.603 € +66,7%» e le classi di «Mercato:» sono vicoli ciechi; il confirm dello snapshot non è armato e la sua primaria è «Sovrascrivi» — un Invio sovrascrive il mese; nessun «Aggiorna» e nessun «ultimo aggiornamento».

**Sam (screen reader / solo tastiera)**: l'unico `h1` visibile è «Buonasera Mirror · domenica 13 settembre 2026» — la pagina non si nomina mai («Panoramica» è un `<p>` da 10px); navigazione per intestazioni: H1 saluto → H2 verdetto → nulla per nove tessere (sono `section[aria-label]`, buono, ma nessuna intestazione dentro); il pill periodo è una tablist senza nome con sei tab tabbabili e senza `aria-controls`; 7 segmenti della barra Composizione con `title` e nessun `aria-label`. Verificato ok: focus ring visibili, 0 controlli senza nome, 228/228 nodi AA in dark.

**Casey (telefono, una mano, distratto)**: il primo fold a 390 è quasi solo prosa (saluto + data + titolo su 2 righe + frase su 8 righe): l'eroe compare a ~y=410 su 844 e la pill copre gli ultimi 88px — si scorre prima di vedere una cifra; i due soli controlli stanno in alto a destra (42×36) e a metà tessera (26px), entrambi fuori dall'arco del pollice e sotto 44px; pagina alta 3277px, quattro schermate, nessuna chiusura; barre da 3px e strip da 8px invisibili a distanza di braccio.

**Il risparmiatore metodico (persona di prodotto: apre l'app ogni mese per sapere «come sto andando»)**: la pagina funziona per lui fino a «e pension hanno fatto il grosso del lavoro»; la storia vera del mese — venduto VWCE, il broker ha trattenuto ~4.089 €, per questo settembre è giù — è spalmata sulle clausole 1, 4 e 6 e mai unita: concluderà di aver perso in borsa, ciò che il titolo si è affannato a negare; senza obiettivi la tessera Obiettivi è ASSENTE (non vuota) e Costi si ri-espande da 2 a 4 colonne senza che gli sia detto che la funzione esiste — un quarto tipo di assenza che la Absence-Has-Three-Names Rule non nomina («la funzione è spenta»); l'eroe è il LORDO a 54px, il netto suo (282.589,09 €) a 22px in un'altra tessera.

## Minor Observations

- L'`€` dell'eroe fluttua: lo spazio unificatore di `Intl('it-IT')` a 54px Geist Mono rende ~32px («293.185,45   €»); corretto per la Comma Rule, sbagliato sul numero dominante — un letter-spacing negativo sullo span valuta, o l'`€` come elemento a 36px.
- `CostiTile.tsx:50`: «Costo annuo 737 €» è `text-warning-foreground` INCONDIZIONATO, mentre «TER medio 0,20%» è foreground; con lo 0,25% del patrimonio la lettura dice che è eccellente e la cifra è ambra comunque — una tinta che dice sempre «attenzione» non dice nulla (The Data Owns Color Rule).
- Il trio KPI di Cashflow impila colori opposti in ogni colonna: verde «2758 €» sopra rosso «↓ 46,8%», rosso «1953 €» sopra verde «↓ 59,8%» — `positiveGood` è semanticamente giusto e visivamente incoerente; e «Risparmio 805 €», la risposta della tessera e l'unico guadagno, resta neutro fra due cifre colorate.
- «29,2% · 1,41×»: due rapporti senza etichetta, e 29,2% ridice il 29% della riga di lettura a precisione diversa nella stessa tessera.
- «Al ritmo attuale ~2812 €» è verde: è una PROIEZIONE di denaro non ancora speso (Scheduled-Is-Not-Spent Rule: né l'uno né l'altro token).
- «Azioni al 45,3%; trend following al 2,0%.» — la lettura nomina la classe più grande e la più PICCOLA (legge arbitrario) e scrive «trend following» minuscolo dove la riga sotto dice «Trend Following».
- Lo skeleton non combacia con la pagina: `DEFAULT_SKELETON_CELLS` è «le prime due righe», la terza (Spese, Entrate, Asset principali) manca e la griglia cresce ~620px all'arrivo dei dati — «nulla salta quando i dati arrivano» vale per la larghezza, non per l'altezza.
- Su un caricamento caldo il verdetto atterra mentre la griglia è ancora a opacity 0 (catturato): un battito in cui la pagina è una frase e nient'altro.
- Il footer di Sintesi patrimoniale spezza a metà frase alla larghezza a 3 colonne: «dopo 10.596 € di tasse stimate su» / «+39.503 €».
- 1024×768 landscape (caso dichiarato in PRODUCT.md) è la banda meno progettata: `tablet:col-span-2` dà all'eroe l'INTERO fold da 768px più una seconda riga di chrome; il primo schermo è una tessera, a 1440 ne porta cinque.
- Il confirm «Snapshot già esistente» monta `Dialog` grezzo (`page.tsx:457-494`, titolo 18px, quinta larghezza 512px): è una delle otto superfici fuori dal vocabolario delle modali già in Known Issues.
- Le didascalie dello sparkline («247.183 €», «293.185 €») e le sei etichette del pill sono le uniche cifre della pagina sotto 11px.

## Questions to Consider

1. Se il lettore non può toccare nulla, perché questa è una pagina e non l'email mensile? Le due rendono lo stesso verdetto sulle stesse tessere dagli stessi moduli; l'email ha la scusa di essere un'email. Cosa fa la PAGINA che l'email non fa — e se la risposta onesta è «è più aggiornata», l'eroe dovrebbe essere la cifra o la freschezza?
2. Il mese è sceso di 4.155 € e 4.089 € sono tasse che il broker ha già preso. Perché è la sesta clausola? La pagina possiede `resolveDeclineCause` e correttamente non incolpa il mercato — ma si ferma al non mentire e non arriva a spiegare. Se UNA frase potesse sostituire il verdetto — «Settembre è in calo per le tasse sulla vendita di VWCE, non per il mercato.» — le altre cinque clausole si guadagnerebbero ancora il posto?
3. Perché questa pagina, sola fra le ventitré, non ha un «Dettaglio»? Ha fissato il pattern e non ha mai adottato la propria invenzione migliore. È deliberato (la panoramica deve restare panoramica) o nessuno è tornato indietro?
