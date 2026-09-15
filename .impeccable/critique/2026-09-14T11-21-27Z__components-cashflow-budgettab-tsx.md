---
target: Cashflow › Budget (components/cashflow/BudgetTab.tsx)
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/Users/giuseppedimaio/Documents/Github.nosync/net-worth-tracker/components/cashflow/BudgetTab.tsx"
target_fingerprint: "sha256:a2c0860ba962b0b2b3f682cd61ddfb14c9593451d4ddd659f8fc6a0a5fd9595f"
target_path: /Users/giuseppedimaio/Documents/Github.nosync/net-worth-tracker/components/cashflow/BudgetTab.tsx
timestamp: 2026-09-14T11-21-27Z
slug: components-cashflow-budgettab-tsx
closed: true
---
Method: dual-agent (A: design review sub-agent · B: detector/browser sub-agent). Browser: estensione Chrome non connessa; evidenza live da Playwright headless sugli emulatori con il MIRROR del conto reale (`mirror@example.com`, 1496 movimenti, 14 settembre 2026; tetto 3000 €, 3 budget mensili e 4 annuali) a 1440 · 1024 · 390, dark e light, i due dialog, le Impostazioni, il delete armato, reduced motion, lo stato vuoto sulla fixture base. `budgetHistory` non è nel mirror, quindi le barre leggono «il tetto attuale»: limite della fixture, non contato. Ogni `file:line` è stato riverificato nel sorgente dal parent; la cifra chiave (656 € spesi contro 1297 € in calendario) è stata ricalcolata dal parent sull'emulatore.

## Design Health Score — Cashflow › Budget (Operate)

| # | Euristica | Voto | Problema chiave |
|---|---|---|---|
| 1 | Visibilità dello stato | 3 | «Salvato / Oltre il tetto: non salvato» vive nell'aside di Per categoria (`BudgetTab.tsx:276`), le Impostazioni che lo scatenano sono sotto la griglia; il delete armato cambia solo `aria-label` e tinta di un'icona da 14px, nessuna regione live (misurato da B); «· Salvato» resta per sempre. |
| 2 | Corrispondenza col mondo reale | 2 | Verdetto e hero dicono «hai usato il 65% del tetto (1953 €)», etichetta «speso», «18 punti avanti»: 656 € sono spesi, 1297 € in calendario (`budgetSummary.ts:37-38, 83-84`; `budgetNarrative.ts:136-141, 271-274`). |
| 3 | Controllo e libertà | 2 | Un budget eliminato è scritto in 800 ms senza undo, toast né conseguenza nella riga (`useBudgetConfig.ts:176-179`, `PerCategoriaTile.tsx:103-114`). Escape e blur disarmano bene. |
| 4 | Coerenza e standard | 3 | Il dialog rifiuta in un `<p>` rosso da 12px sotto il campo e la lettura resta statica (`BudgetItemDialog.tsx:174-178, 294-301`), contro il vocabolario chiuso ieri su AssetDialog ed ExpenseDialog; «2330,00 €» con i centesimi (`:289`) contro cifre intere ovunque. |
| 5 | Prevenzione degli errori | 3 | Allocazione e duplicati bloccati bene; ma il select stampa due «Casa» identiche (`:248-250`) e una soglia ambra su un budget indietro sul calendario invita a correggere ciò che non è rotto. |
| 6 | Riconoscimento più che ricordo | 3 | Il chip «fissa» non dice da dove nasce (il tipo della categoria) né dove si cambia; «soglie 50 · 75 · 90 · 100» non dice che sono soglie di quota e non di ritmo. |
| 7 | Flessibilità ed efficienza | 2 | Ogni importo passa da una modale (scelta documentata, non contata); select da 31 voci senza ricerca né raggruppamento per tipo; i quattro radio del dialog sono quattro fermate Tab (`BudgetItemDialog.tsx:186-204`). |
| 8 | Estetica e minimalismo | 3 | Tre piè ripetono le stesse due regole (`budgetNarrative.ts:327-329, 412, 457-459`); «Budget complessivo 65% · soglia 50%» è rumore a metà mese; Rischio è 371px alta con una frase (B: 208→579). |
| 9 | Recupero dagli errori | 2 | Nel dialog il submit è `disabled` (`:160`): Invio non fa nulla, nessun `aria-invalid`, nessun annuncio; dopo Escape il fuoco finisce su `body` e a 390 il drawer non prende mai il fuoco (B). |
| 10 | Aiuto e documentazione | 3 | I piè spiegano le regole sul posto, la didascalia dice contro quale tetto legge; manca il ponte da «fissa» alla causa. |
| **Totale** | | **26/40** | **Accettabile** |

## Verdetto di specificità del design

**Valutazione LLM.** La pagina è di questo prodotto nella sostanza: l'articolo che segue la cifra stampata (`dayRef`), il giorno di sforamento letto dalle date delle spese e non dalla memoria di un cron (`findCrossingDay`), rischio e fatto in due tessere che non si ripetono, il segno di oggi sulla traccia da 3px che rende una barra leggibile senza numeri, il tetto storicizzato con una didascalia che dice di chi è. Nessun budget generico ragiona così. La specificità si spegne dove il prodotto smette di applicare la sua idea migliore: le soglie 50·75·90·100 sono le soglie di qualunque app e sono cieche al calendario, il verdetto chiama «usato» ciò che è in calendario, e il dialog è un form standard (due radio, un select da 31 voci, un paragrafo rosso) fuori dal vocabolario delle modali.

**Scansione deterministica.** `impeccable detect` su `BudgetTab.tsx`, `components/cashflow/budget/**` e `app/dashboard/cashflow/page.tsx`: exit 0, **0 finding**, nessuna esenzione di `.impeccable/config.json` tocca questi file. Grep: 0 hex, 0 `lg:`, 0 `dark:`, 0 `title=` nel pannello, 0 `animate-pulse`, 0 `opacity-0`. Testo: nessuna coppia sotto AA (minimo 4,74:1, `text-muted-foreground` su bianco a 1440 light, su 106 nodi fra cui 11 a 9px); dark minimo 6,21:1. Non-testo: le barre del grafico `--chart-1` misurano 2,62:1 sulla tessera in dark e la barra del mese in corso 1,57:1 più contorno.

**Overlay.** Nessun overlay visibile: l'estensione Chrome non è connessa e `detect.js` non è stato iniettato. Segnale di ripiego: le misure Playwright sopra.

## Impressione generale

Il primo secondo è esatto: «Il budget di settembre tiene.», punto verde, «297 € sotto». Poi la pagina si contraddice da sola: la tessera sotto dice «speso 1953 €» quando il proprietario ne ha spesi 656, la tessera a destra dipinge in ambra un budget annuale che è indietro rispetto all'anno, e la piega finisce su «231% · oltre di 1963 €» in rosso mai nominato dal verdetto. L'opportunità più grande è una sola: applicare al verdetto e agli avvisi la stessa regola che la traccia già disegna, cioè leggere ogni quota contro il calendario e separare il contabilizzato dal calendario.

## Cosa funziona

- **La traccia con il segno di oggi e la lettura in punti** (`BudgetTrack.tsx`, `describeCeiling`). «Hai usato il 65% del tetto al 47% del mese: 18 punti avanti» rende una barra leggibile senza cifre, e la stessa primitiva vale sul mese e sull'anno con l'aside che nomina l'asse.
- **Rischio e fatto separati per costruzione** (`rankCategoriesAtRisk` esclude `spentSoFar > amount`, `budgetUtils.ts:634`; `summarizeAlerts`). Cibo fuori è «Superato il 12» in Avvisi e assente da Rischio; il 12 è verificabile sulle spese.
- **Il tetto storicizzato e detto** (`describeHistory`, `SpendingBarsChart.tsx:60`): una linea tratteggiata per mese al tetto di quel mese, la didascalia che dichiara «il tetto attuale» o «il loro», l'SVG con un `aria-label` che elenca ogni mese con il suo tetto. L'onestà è nella struttura.

## Problemi prioritari

- **[P1] Il verdetto e l'hero chiamano «usato/speso» ciò che è in calendario.** Sul mirror: «hai usato il 65% del tetto (1953 € su 3000 €)», etichetta «speso», «18 punti avanti rispetto al calendario». Contabilizzato al 14: 656,43 € (22%, 25 punti INDIETRO); in calendario dopo oggi: 1296,75 € (mutuo del 27, figlie il 29, hobby il 28…). `CeilingSummary.spent` include le righe future per dichiarazione (`budgetSummary.ts:37-38`), `spentToDate` e `scheduled` esistono (`:83-84`) e nessuna frase li legge (`budgetNarrative.ts:136-141, 271-274`; `TettoTile.tsx:69, 77`). Solo il ramo «superato» distingue «hai impegnato» da «hai speso» (`:113`).
  **Perché conta:** è la frase per cui la pagina esiste, contraddice The Scheduled-Is-Not-Spent Rule e la chiusura di Tracciamento di ieri («il verdetto giudica ciò che è AVVENUTO»); «18 punti avanti» è un artefatto del mutuo datato 27.
  **Fix:** il verdetto nomina i due lati («hai speso 656 € e hai altri 1297 € già in calendario entro fine mese: al ritmo attuale chiudi a 2703 €, 297 € sotto»); la lettura confronta col calendario solo il contabilizzato («il 22% al 47% del mese: 25 punti indietro; con il calendario sei al 65%»); la traccia disegna due riempimenti, come il commento di `TettoTile.tsx:41-42` già promette; «Restano» dice «tolte le spese in calendario».
  **Comando:** `/impeccable clarify` + `/impeccable polish`.

- **[P1] Avvisi è cieco al calendario e mescola tre assi in una lista.** `highestCrossedThreshold` confronta la quota con le soglie e basta (`budgetUtils.ts:651-653`); la tessera dipinge `text-warning-foreground` su ogni soglia non superata (`AvvisiTile.tsx:45-46`). Sul mirror: «Budget complessivo 65% · soglia 50%» in ambra (quota gonfiata dal calendario) e «Tecnologia 54% · soglia 50%» in ambra con l'anno al 70%, cioè un annuale INDIETRO presentato come avviso; nella stessa lista Salute e Tecnologia (annuali, «3463 € su 1500 €» senza «da gennaio»), Cibo fuori (mensile) e il tetto, senza segno dell'asse.
  **Perché conta:** la tessera accanto insegna che una quota non vale nulla senza il calendario; Avvisi fa l'opposto con il colore d'allarme, ed è l'unica cosa che arriva anche per email. L'Off-Axis Tile Rule vale per le righe come per le tessere.
  **Fix:** ogni riga porta la quota di calendario della SUA finestra e prende l'ambra solo se è avanti; le annuali portano «da gennaio» o un sotto-eyebrow; l'aside dice «soglie di quota». Se le soglie diventano di ritmo è una decisione del proprietario.
  **Comando:** `/impeccable clarify` + `/impeccable polish`.

- **[P1] Il dialog rifiuta fuori dalla riga di lettura, disabilita il submit e perde il fuoco.** Lettura statica sulla traccia (`BudgetItemDialog.tsx:174-178`), rifiuti in `<p class="text-xs text-destructive">` (`:294-301`), nessun `aria-invalid` (misurato `null`), «Aggiungi» `disabled` finché `canSubmit` è falso (`:160`), quindi non esiste mai un rifiuto da raccontare; i quattro radio sono `<button role="radio">` senza roving tabindex (`:186-204`); dopo Escape il fuoco finisce su `body` (montaggio condizionale, `BudgetTab.tsx:313`); a 390 il drawer non prende mai il fuoco (B, `b-drawer-create-390-dark.png`).
  **Perché conta:** dialog.md e The Modal-Is-A-Tile Rule: la lettura È la status line; AssetDialog ed ExpenseDialog sono passati a quel vocabolario ieri. Chi usa la tastiera preme Invio su un bottone morto e non sente perché.
  **Fix:** submit sempre abilitato; su rifiuto `describeFormRefusal` nella lettura in tono negativo, `aria-invalid` sul campo, fuoco sul campo; lettura idle che dice cosa il form vuole («Scegli una categoria e un importo mensile.»); roving tabindex sui radio; fuoco restituito al bottone che ha aperto.
  **Comando:** `/impeccable harden` + `/impeccable polish`.

- **[P2] Il delete armato su desktop non si vede, non parla, non dice la conseguenza.** Primo clic: icona da 14px in `text-destructive` e `aria-label` «Conferma eliminazione budget Vacanze» (`PerCategoriaTile.tsx:103-114`, `AnnualiTile.tsx:66-77`); nessuna regione live cambia (misurato), la scrittura parte 800 ms dopo senza undo. Su telefono il bottone dice «Conferma» ma la conseguenza resta non detta.
  **Fix:** `describeBudgetDeleteConsequence` in `dialogNarrative.ts` («Eliminando, il budget di Cibo sparisce; le spese restano.»), «Conferma» visibile anche a 1440, una `role="status"` sr-only per tessera che annuncia armamento e disarmo, come ExpenseTable e VersamentiTile.
  **Comando:** `/impeccable harden`.

- **[P2] Bersagli sotto i 44px sul touch.** A 390 con Impostazioni aperte: input tetto 200×36, switch 36×20, quattro chip 48–55×32 (`BudgetImpostazioni.tsx:104, 125, 138`); nel drawer radio 174×38, select e input 356×36 (`BudgetItemDialog.tsx:198, 220, 276`); nello stato vuoto «Aggiungi budget» in tessera 151×32 (`BudgetTab.tsx:289`). A 1440 i 14 target 32×32 sono l'idioma `h-8` sanzionato.
  **Fix:** `h-11 desktop:h-8` sui chip e sui radio, `h-11 desktop:h-9` sugli input, `size="default"` sul bottone dello stato vuoto.
  **Comando:** `/impeccable adapt`.

- **[P2] `aria-valuenow` è tagliato a 100.** `BudgetTrack` clampa `pct` e lo passa alla progressbar (`BudgetTrack.tsx:21-25`): «Avanzamento Salute» annuncia 100 mentre lo schermo dice 231% e «oltre di 1963 €».
  **Fix:** `aria-valuetext` con la cifra stampata e la conseguenza.
  **Comando:** `/impeccable audit`.

## Segnali di allarme per persona

**Alex (power user)**: digita il tetto in fondo alla pagina e lo stato «Salvato / non salvato» compare a metà (`BudgetTab.tsx:276` vs `:300-311`); 31 voci nel select senza ricerca e due «Casa» identiche; il tetto è `parseFloat(v) || 0` (`BudgetImpostazioni.tsx:99-102`), «3.000» diventa 3 e viene salvato in 800 ms; nessun undo su un budget eliminato.

**Sam (screen reader / tastiera)**: il rifiuto del dialog non è in nessuna regione live e il submit è morto; il delete armato non è annunciato e il secondo Invio elimina; 11 progressbar con `aria-valuenow` clampato; le righe mobili sono `<button>` che contengono `<div role="progressbar">` (`PerCategoriaTile.tsx:193-231`), HTML non valido; il drawer a 390 non prende il fuoco; i bottoni demo con la spiegazione nell'`aria-label` non sono focalizzabili (`BudgetTab.tsx:210, 289`). Positivo: ogni tessera è una `<section aria-label>`, l'SVG ha la lettura completa, la tabella ha `caption` e `scope`, tutte le 18 fermate hanno l'anello di fuoco.

**L'investitore metodico (PRODUCT.md)**: non ricostruisce 2703 € dalle cifre stampate (1953 ÷ 14 × 30 = 4185): il ritmo corre su 656 € che la pagina non stampa; «5 mesi su 5 oltre il tetto attuale» sotto un verdetto verde resta senza ponte; «Cibo · fissa · solo rate» non gli dice che il chip nasce dal tipo della categoria (`resolveItemPace`, `budgetUtils.ts:474-477`); il «18» pre-compilato nel dialog è una media annua che nessuna frase dichiara (`getDefaultAmount`, `:268-290`).

**Casey (mobile)**: prima schermata ottima (verdetto, bottone da 44, hero); ma «Cibo fuori è sforato» arriva a tre schermate di scroll, dopo il grafico storico; un secondo tap distratto su «Elimina» elimina senza conseguenza detta; i chip soglia da 32px sotto il pollice.

## Osservazioni minori

- Tre piè ripetono le stesse due regole (Rischio, Annuali, Per categoria): una volta per pagina; a 390 il piè di Per categoria è di cinque righe.
- Senza tetto la cella hero è un vuoto da 5/12 accanto al verdetto (`BudgetTab.tsx:233-237`, `budget-empty-1440-dark.png`) e il campo «Tetto (€)» è 500px più in basso; a 390 «Aggiungi budget» compare due volte; il placeholder «Nessun limite complessivo» è troncato nei 200px.
- Le barre `--chart-1` misurano 2,62:1 in dark sulla tessera (3,58 in light) e la traccia vuota da 3px 1,18:1: le altezze e la didascalia portano il significato, ma il mese in corso a 1,57:1 vive del solo contorno (`SpendingBarsChart.tsx:64-66`).
- Le intestazioni di colonna a 9px/600 muted stanno a 4,74:1 in light (`PerCategoriaTile.tsx:44`): sopra AA di 0,24, e sono le parole «Usato» e «Fine mese» che il lettore deve distinguere.
- Sette transizioni CSS da 0,15–0,2 s non hanno `motion-safe:` (`BudgetImpostazioni.tsx:82`, `PerCategoriaTile.tsx:212, 235`); sotto reduced motion ogni numero è comunque presente. Il fade Framer del pannello è gestito da `MotionConfig reducedMotion="user"`: il rilievo di B lì è un falso positivo.
- «Superato / soglia 100%» e «Superato / il 12» nella stessa colonna di Avvisi: due sotto-testi per lo stesso stato (l'annuale non ha il giorno per regola documentata, ma «soglia 100%» sotto «Superato» è ridondante).
- Cibo fuori è rosso tre volte sulla pagina (Avvisi, «~216 €», «101%»).
- «Categorie a rischio» ha un aside `<span>` fisso «a fine mese» (`RischioTile.tsx:25`) dove le altre sono `Narrative`.
- La `role="status"` dell'autosave stampa «· Salvato» con il punto mediano e non torna mai vuota.

## Domande da considerare

- Se il tetto è stato sforato cinque mesi su cinque, «Il budget di settembre tiene» è un verdetto o un auspicio? La pagina ha i dati per dire «tiene, per la prima volta da aprile».
- Un avviso di soglia che non guarda il calendario è un avviso? E se le soglie fossero di ritmo («al ritmo attuale superi il 90% il 24»), Avvisi e Categorie a rischio sarebbero ancora due tessere?
- Perché un budget di categoria nasce in una modale e non nella tabella che lo mostra, con l'importo in riga, la prefill dalla media e la validazione nella lettura di Per categoria?
