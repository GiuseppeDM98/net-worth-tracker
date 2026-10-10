# La prima schermata (censimento e budget)

> **When to open this guide** — anyone touching the first-screen census (`scripts/mobileCensus.mjs`), its budget (`scripts/mobileBudget.mts`, `lib/utils/mobileBudget.ts`, `doc/mobile/budget.json`), the fixture `census@example.com` (`scripts/seedCensusE2E.mts`), or a spec of the mobile-composition series (`doc/mobile/`) that closes on «`mobile:budget` verde». In repo since 2026-10-10 (PR #448, the first spec of the series, retired the same day — its text is `git log -- doc/mobile/`); it lived in `doc/guide/velocita.md` until that guide passed 500 lines the same day. The build, the port and the `--` rule are the speed tooling's (`doc/guide/velocita.md` § Il benchmark); `AGENTS.md § Performance tooling` keeps the stub. The body is in Italian, as the speed manual it came from.

## Files

| File | Cosa | Tracciato |
|---|---|---|
| `scripts/mobileCensus.mjs` | `npm run mobile:census`: la prima schermata di 19 superfici × 390/768/1024; esporta `FIGURE_PATTERN` (`__tests__/mobileCensusFigures.test.ts`) e `validateSelection` (`__tests__/mobileCensusOptions.test.ts`) | sì |
| `doc/mobile/reference/mobile-census.mjs` | Lo script usa-e-getta del 2026-09-26 che ha misurato la baseline del mirror (`doc/mobile/README.md` § 3), tenuto com'era finché vive l'indice della serie | sì |
| `scripts/mobileBudget.mts` · `lib/utils/mobileBudget.ts` (la metà pura, tenuta da `__tests__/mobileBudget.test.ts`) | `npm run mobile:budget` | sì |
| `scripts/seedCensusE2E.mts` | `npm run e2e:seed:census`: l'account `census@example.com`, il fixture del budget | sì |
| `doc/mobile/budget.json` | Le superfici del censimento e il budget per superficie × viewport (`__tests__/mobileSurfaces.test.ts`: superfici = `lib/constants/navigation.ts` meno l'Assistente) | sì |
| `.mobile-census/` | `last-run.json` e gli screenshot dell'ultimo `mobile:census` | no |

Suites to run after a change here: `mobileBudget`, `mobileSurfaces`, `mobileCensusFigures`, `mobileCensusOptions`, and `npm run mobile:census -- --selftest`; a change to `scripts/mobileCensus.mjs` also re-runs the census on the fixture and `mobile:budget` (the closing measure, unchanged).

## Il censimento — «cosa sta nella prima schermata di un telefono?» (2026-10-10)

Dal 2026-10-10 (PR #448) `npm run mobile:census` e `npm run mobile:budget`, sulla STESSA build e la stessa porta del
benchmark (`perf:build`, `perf:serve`, :3200): misurano la composizione, non il tempo. Il dossier che li usa è
`doc/mobile/` (README § 3 la baseline del mirror del 2026-09-26, § 3.1 la tabella del fixture, § 9 le decisioni).

```bash
npm run emulators                                         # terminale 1
npm run perf:build && npm run perf:serve                  # terminale 2: :3200
npm run mobile:census -- --email=census@example.com       # terminale 3: risemina il fixture; 19 × 3 in ~2 minuti (Mac)
npm run mobile:budget                                     # due secondi: last-run.json contro doc/mobile/budget.json
npm run mobile:census -- --selftest                       # la misura su un frammento noto, nessun server
```

**Le opzioni dopo `--`, da Git Bash su Windows** (PowerShell 5.1 mangia il `--`): `--email=` (default
`census@example.com`), `--password=` (default `test1234`, la password di ogni account degli emulatori), `--base=`
(default :3200), `--viewports=390,768,1024`, `--surfaces=panoramica,cashflow-budget` (le chiavi di `surfaces` in
`budget.json`), `--texts` (aggiunge al JSON h1, titolo del verdetto ed eyebrow: mai da committare). La prima riga ripete
le opzioni lette. **Una chiave di `--surfaces` o un valore di `--viewports` sconosciuti escono 1 con l'elenco dei validi**
(2026-10-10: `--surfaces=cashflow`, il nome della pagina e non una chiave, misurava zero superfici in silenzio e
sovrascriveva `last-run.json`; `validateSelection`, `__tests__/mobileCensusOptions.test.ts`). L'uscita è `.mobile-census/` (gitignored): `last-run.json` con la durata in coda e due screenshot per
superficie × viewport (`<viewport>/<superficie>-fold.png` e `-full.png`).

**Il fixture** `census@example.com` (`scripts/seedCensusE2E.mts`, `npm run e2e:seed:census`): con `--email` uguale al
suo, il censimento lo risemina, ristampa i profili strumento (`e2e:seed:profiles`), ricostruisce i record di Hall of Fame
chiamando `POST /api/hall-of-fame/recalculate` (solo il server li costruisce; proprietario, 2026-10-10) e **si rifiuta dal
1 al 4 del mese e l'ultimo giorno** (ora italiana): le righe del mese stanno al 5 e una sola è in calendario l'ultimo
giorno, quindi solo dal 5 al penultimo giorno ogni superficie conta le stesse cose. **Ogni opzione è nel suo stato di
default** (proprietario, 2026-10-10): Centri e Divisione accesi perché hanno una tab propria, i ruoli 50/30/20 spenti,
e FIRE › Obiettivi SPENTO — l'unica superficie misurata senza dati («Gli obiettivi non sono attivi», una tessera,
`screens` 1) finché MOB-07 non lo accende nel seed con un obiettivo inventato (`doc/mobile/README.md` § 9, 60).
Divisione si misura nello stato «quote calcolabili, resta qualcosa a tutti» (verdetto letto con `--texts` il
2026-10-10). Il mirror non si risemina e non tocca i profili: serve al giro guidato e al confronto con la baseline,
mai al budget.

**La corsa**: un contesto per viewport (`isMobile`, `hasTouch`, `reducedMotion: 'reduce'`, locale it-IT, nessuna chiave
`mobile-sections:*`), login vero; prima della prima viewport un giro di riscaldamento apre ogni route senza misurare (le
migrazioni della prima visita di Patrimonio sono scritte prima che si conti). Una superficie è assestata con `h1`,
nessuno `[data-slot="skeleton"]` visibile, una cifra (o 8 s senza), nessun `[data-freshness]` con testo, poi 500 ms;
oltre 60 s è `unsettled`. Una tab assente, o che non risulta selezionata, è `missing`. Entrambe rosse.

| Metrica | Significato | Verso |
|---|---|---|
| `screens` | `main.scrollHeight / main.clientHeight` | tetto |
| `tilesAboveFold` · `tilesFullyAboveFold` | `section.rounded-2xl` visibili che iniziano / stanno entro `main.clientHeight` (la piega della baseline) | pavimento |
| `figuresAboveFold` | cifre (€ o %) SULLO SCHERMO che iniziano entro `main.clientHeight`, verdetto compreso | tetto |
| `figuresOutsideVerdict` | cifre sullo schermo che FINISCONO sopra il bordo alto della pill, fuori dalla `section` visibile `page-verdict` (lo `scope` conta dentro, la striscia `ul[aria-label="Le cifre del verdetto"]` fuori); senza verdetto, tutte | tetto; obiettivo ≤ 5 a 390 |
| `firstClosedRowAbovePill` | la prima riga chiusa di MOB-02 (`section.rounded-2xl[id]` → `h3 > button[aria-expanded="false"]` con `aria-controls` = `<id>-panel`) finisce sopra la pill; `null` finché non ce n'è | `null` accetta solo `null`; `true` resta `true`; `false` solo con `raisedBy` |
| `overflowX` | `main.scrollWidth > main.clientWidth` | sempre `false` |

**Una cifra divisa in due nodi di testo è UNA cifra, solo se l'unità è lo span di `NarrativeSegments`** (2026-10-10):
`NarrativeSegments` disegna l'unità in uno span `[data-figure-unit]` («+11.967» e «€» sono due nodi), e il census — che
conta per nodo di testo — la riconosce quando un nodo di solo «€»/«%» DENTRO quello span segue un nodo che finisce in
cifre, misurandola dove stanno le cifre; prima della correzione una corsa contava 8 cifre sopra la piega sulla Panoramica
invece di 15. Senza l'attributo (un KPI o un eroe che stampano valore e unità in due span propri) la coppia resta non
contata, come la baseline l'ha sempre lasciata (decisione 7): la stessa regola senza attributo contava 25 cifre su Analisi
a 768 invece di 20 con le tessere ferme allo stesso pixel — il budget si sarebbe mosso per una definizione, non per
l'app. Il `--selftest` ha una cifra divisa con l'attributo nel verdetto e nella tessera e una senza: visto rosso a 2 e 2
ignorando il nodo dell'unità, e a 4 ignorando l'attributo.

«Sullo schermo»: `checkVisibility` con visibilità e opacità, nessun antenato `[inert]` o `.sr-only`, nessun antenato
`fixed` diverso dalla pill (il `SavingsRateBadge`), area non nulla dentro ogni antenato con `overflow` non `visible` fra
il nodo e `main`. `aria-hidden` non esclude: è una cifra che l'occhio vede. La pill è `nav[aria-label="Navigazione
principale"]`; a 1024 in orizzontale è nascosta e la prima schermata finisce col fondo di `main`. Diagnostica nel JSON,
non vincolante: `mainTop`, `pillTop`, `headerHeight`, il verdetto (top, altezza, cifre), `charts`, le tessere per indice,
il `SavingsRateBadge`, `spendingRoles` (lo stato dell'interruttore 50/30/20 letto dal gruppo «Raggruppa il flusso» di
Analisi, `null` a interruttore spento: sul mirror il Flusso a 390 cambia forma con lui), il `source` del `Server-Timing`
di `/api/portfolio/instrument-profiles` per superficie e, a livello di corsa, **`yahooCalled`**: vero se UNA risposta
della corsa è venuta da Yahoo, giro di riscaldamento compreso — è lì che un ticker senza profilo viene chiesto a Yahoo
e scritto in cache, e la visita misurata legge poi `cache` (2026-10-10; prima il census azzerava il `source` dopo il
giro e la guardia era cieca). Sul fixture `yahooCalled` fa uscire 1 il census e `--tighten` rifiuta la corsa: si
corregge nel seed, il budget non si prende.

**Il ratchet**: tolleranza zero (`tolerance: {}`), perché il fixture è deterministico. `npm run mobile:budget -- --tighten`
scrive il misurato ESATTO dove è migliore e non allarga mai; si rifiuta (esce 1, `tightenRefusal`) se `last-run.json`
non è di `census@example.com`, se una superficie è `missing` o `unsettled`, se Yahoo ha risposto a un profilo
(`yahooCalled` o un `source=yahoo` di riga) o se la corsa è parziale — ogni voce di `budget.json` deve essere stata
misurata (2026-10-10: prima un `--tighten` su `--surfaces` scriveva il file e POI andava rosso su «non misurata»).
Dopo una stretta il `raisedBy` resta sulla voce (può scusare una metrica che la misura non ha stretto; `perfBudget` lo
toglie quando abbassa un tetto: scelta diversa, voluta). **Allargare** si fa a mano, con l'OK del proprietario:
`"raisedBy": "MOB-NN: perché"` sulla voce (superficie × viewport) e una riga in `doc/mobile/README.md` § 3.1, nello stesso
commit; `mobile:budget` confronta con `git show HEAD:doc/mobile/budget.json` e un valore allargato senza un `raisedBy`
NUOVO è rosso. Le metriche in `informational` (oggi `figuresOutsideVerdict` e `firstClosedRowAbovePill` a 768 e 1024) si
stampano e non fanno uscire 1 — anche un allargamento senza `raisedBy` su quelle metriche a quelle viewport è solo
stampato: MOB-08 svuota la lista. Un budget misurato e non registrato, o registrato e non misurato,
è rosso: una corsa parziale (`--surfaces`, `--viewports`) non è mai verde.

**La colonna «obiettivo»** (The First-Screen Rule, proposta in MOB-09): a 390 «sì» con ≤ 5 cifre fuori dal verdetto E
la prima riga chiusa sopra la pill; a 768/1024 l'obiettivo è il misurato di MOB-08 — oggi `firstScreenTarget` stampa
«non ancora» a quelle viewport in ogni caso, e MOB-08 lo cambia insieme al suo test; «—» per Impostazioni (nessun
verdetto). Fino a MOB-02 non esiste una riga chiusa: ogni superficie legge «non ancora».

**Il fixture tiene STATI che non dipendono dal giorno** (2026-10-10, `scripts/seedCensusE2E.mts`): un tetto di Budget
sopra lo speso è giudicato dal ritmo (`speso / giorno × giorni`), che lo sfora a inizio mese e non a fine mese — con
4000 € su 3540 spesi il verdetto del 10 diceva «rischia di sforare» e quello del 28 non l'avrebbe detto; il fixture lo
tiene già superato (3000 €) dal 5. Un dato nuovo nel seed si sceglie così: uno stato che vale dal 5 al penultimo giorno,
o la corsa a tolleranza zero diventa rossa a metà mese. E una serie lineare dà valori uguali (dodici record di Hall of
Fame identici, la prima versione): le differenze mese su mese vengono da un residuo quadratico. Fra un mese e l'altro
si spostano solo i NOMI dei mesi e le finestre sull'anno solare (Analisi, Storico): la prima corsa di un mese nuovo
si legge prima di stringere o allargare.

## Per-page blind spots

- **Il settle legge `main.textContent`, pannelli nascosti compresi**: su una tab di Cashflow la condizione «una cifra»
  è vera già con le cifre di Tracciamento (`forceMount`), quindi è lo skeleton assente, la riga di freschezza vuota e
  la coda di 500 ms a dire che la tab misurata è pronta — non la cifra. Una tab che resta senza cifre non si vede da qui.
- **`savingsRateBadge` è una diagnostica debole**: il badge si chiude da solo dopo 3 s
  (`components/ui/SavingsRateBadge.tsx`), e il fixture tiene la quota del mese scorso sotto il 30% apposta perché non
  compaia mai; un `true` sul mirror dice solo che era ancora a schermo al momento della misura.
- **`last-run.json` nasce solo a fine corsa**: un `goto` o un clic di tab che scade (120 s) interrompe la corsa senza
  file; le superfici già misurate sono nei log e negli screenshot, non nel JSON.
- **Il giro di riscaldamento attende l'assestamento, non le scritture**: le migrazioni della prima visita di Patrimonio
  (registro, prestiti, `backfillAverageCostEur`) partono in quel giro e non sono attese; due corse consecutive
  identiche (2026-10-10) dicono che atterrano prima della misura, non che non possano mai arrivare dopo.
