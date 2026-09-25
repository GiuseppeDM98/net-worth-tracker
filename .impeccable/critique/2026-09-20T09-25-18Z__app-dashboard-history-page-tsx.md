---
target: critique Storico
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/Users/giuseppedimaio/Documents/Github.nosync/net-worth-tracker/app/dashboard/history/page.tsx"
target_fingerprint: "sha256:b114fc1db206f00ef4b15b2301d1011d1d01e40e225bf3c6852f4e67d528c395"
target_path: /Users/giuseppedimaio/Documents/Github.nosync/net-worth-tracker/app/dashboard/history/page.tsx
timestamp: 2026-09-20T09-25-18Z
slug: app-dashboard-history-page-tsx
closed: true
---
Method: dual-agent (A: design review on screenshots + source · B: detector + Playwright measurements) — browser evidence is Playwright's on the production mirror (`mirror@example.com`), the Chrome extension was not connected. 2026-09-20, the day after the Driver became six parts.

# Critique — Storico (`app/dashboard/history/page.tsx`)

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | Nothing says when the latest snapshot was written (daily cron); the Valore table hides two columns with no scroll cue |
| 2 | Match System / Real World | 3 | Honest Italian, but «Driver», «pp», «Geometrico/Traguardi» leak; «Quantità 130.000,00» for a house is a data-model truth |
| 3 | User Control and Freedom | 3 | «Elimina nota» deletes on one click, unarmed, no undo; Dettaglio open state and chosen month are not in the URL |
| 4 | Consistency and Standards | 2 | «Mercato» is `--chart-1` in the Driver and `--chart-5` in the Lavoro chart (blue = «Guadagnato da lavoro» there); flows uncoloured in the Driver, green in Lavoro; ticks «gen 25» vs «Gen 2025» |
| 5 | Error Prevention | 3 | Manual snapshot cross-validates the sum but asks «Mese * (1-12)» as a free number; unarmed note delete |
| 6 | Recognition Rather Than Recall | 3 | Driver legend ~150px above the bars it describes; the 20%/80% shares refer to a total never printed |
| 7 | Flexibility and Efficiency | 2 | 24 rows with no sort/filter; «Dettaglio» ~55 Tab presses from the top (measured); Driver bars hover-only |
| 8 | Aesthetic and Minimalist Design | 2 | The same figures printed 3–5 times; every tile closes on a 3–9 line footnote |
| 9 | Error Recovery | 3 | `ErrorNotice` with retry is excellent, but one `Promise.all` over 7 reads blanks the page on a secondary failure, and toast + notice both fire |
| 10 | Help and Documentation | 3 | Footers are in-place help, always on and never on demand |
| **Total** | | **27/40** | **Acceptable (one point below Good)** |

## Design Specificity Verdict

**LLM assessment**: authored for this product, not interchangeable — «versamenti inclusi, non un rendimento» under a CAGR, Δ split into «di cui prezzo / di cui quantità», «mutuo rimborsato» as a wealth engine. The weakness is excess fidelity to its own accounting: the Driver and its echoes are an audit note typeset, not designed; the six parts got a longer sentence instead of a visual form.

**Deterministic scan**: CLI on `app/dashboard/history components/history components/CreateManualSnapshotModal.tsx` → 0 findings. In-page overlay: 68 hits, of which 52 the enumerated 9–11px ramp (not the page's), 13 shell/sidebar/overlay's own colours, 9 `nested-cards` false positives (no nested card measurable); the page's own are 4 `line-length` — 11px footnotes at 95–130 characters per line on Composizione, Valore per strumento, Variazione anno su anno, Lavoro e investimenti. 28 em-dashes in 8.505 characters of `main` text.

**Visual overlays**: injection succeeded in a headless browser only — no [Human] tab.

## Overall Impression
The opening works (the verdict, «lug 2027» in Raddoppi). Right after, the page makes the reader do the reconciliation: 5.364 + 21.916 ≠ 31.918 until «Il resto» is parsed, 4.064 € unexplained, and the page's biggest red number (−38.596 €) is a sale, not a loss. Biggest opportunity: make the arithmetic VISIBLE (rows that sum to the total) instead of narrated and then defended in a footnote.

## What's Working
1. Honest labels at the point of risk («versamenti inclusi, non un rendimento», «proiezione lineare, non una previsione»).
2. Price/quantity attribution with uncoloured flows; a zero prints «—».
3. State rigour: failed read before the empty branch, a one-snapshot verdict, per-tile named absences. Measured: 0 console errors, 0 responses ≥ 400, no overflow at 1440 or 390, every control named, charts `role="img"` with descriptive labels and no tab stop.

## Priority Issues

### [P1] «Valore per strumento» clips the two columns that explain the Δ
- **What**: at 1440 the table needs 813px inside 671 (142px inner scroll), no fade or hint, the scroller has no `tabIndex` (`components/history/tiles/ValoreStrumentoTile.tsx:278-281`).
- **Why**: the reading promises «+1214 € dai prezzi e −1023 € dalle quantità» and the proof is off-screen; row 1 opens on a red −38.596 € that is a switch into XEON and cash.
- **Fix**: full-width table until a selection exists (the empty Selezione panel takes 5/12 for one sentence), or fold quantity and ticker into the name cell; scroller `tabIndex=0` + `role="region"` + label + edge fade; drop the sign colour from a Δ dominated by quantity.
- **Suggested command**: /impeccable layout

### [P1] The Driver's six parts are a paragraph
- **What**: a 6-line sentence with 8 figures; the same parts again in the year sub-line (wrapping with orphaned «·»), the grey footer, the monthly Dettaglio tile and Lavoro — five printings. «+10 € di versamenti al fondo pensione» earns a verdict clause because materiality is applied only to «altre». «Mercato in perdita» is a legend entry for a state (`components/history/tiles/DriverTile.tsx`).
- **Why**: the tile rebuilt on 2026-09-19 is the page's emotional valley: right after the peak, 4.064 € that «nessuna voce spiega».
- **Fix**: two-clause reading (growth + the two engines, dominant one named); the parts as a mini ledger under the featured year (label left, signed mono right, closing on the Δ — the Ranked Rows with Residual Lavoro already uses); one materiality threshold for every rest part; legend under «Ultimi 12 mesi» with a «sotto la linea = perdita» caption; «Dal 2025» promoted from footnote to row.
- **Suggested command**: /impeccable distill, then /impeccable clarify

### [P2] One word, two colours — and the Lavoro legend fails AA
- **What**: `components/dashboard/LaborMetricsChart.tsx:53-56` paints «Mercato» in `--chart-5` and gives blue to labour income; `LaborRow` colours mutuo, fondo pensione and altre green (`components/history/StoricoDettaglio.tsx:269`) against the Driver's own rule. Measured: legend text inherits the series colour at 11px — light «Risparmiato da lavoro» 3,64:1 (`#009878`), «Mercato» 4,02:1 (`#e5405c`); dark «Guadagnato da lavoro» 2,62:1 (`#1447e6` on `#171717`). The only 3 contrast failures out of 524 elements per theme. Three English Recharts «… legend icon» aria-labels; the chart's label describes colour slots.
- **Fix**: pin Mercato to `--chart-1` and Risparmio to `--chart-2` page-wide; a `flow` tone for `LaborRow`; the shared square legend with `text-foreground` instead of `<Legend>`; ticks unified to «gen 25».
- **Suggested command**: /impeccable colorize

### [P2] «Dettaglio» is ~55 Tab presses away, and the page has two headings
- **What**: 37 tab stops in `main` with Dettaglio closed — ~30 16×16 checkboxes precede the trigger; no skip link; only `h1` + `h2` (nine tiles are `<p>` eyebrows; labelled `section`s mitigate). At 390 «Seleziona tutti» stays 16×16 effective; «Vai all'Allocazione» is an inline 11px link whose box centre is not clickable when wrapped; `aria-label="Dettaglio"` overrides the trigger's visible contents (`StoricoDettaglio.tsx:406`).
- **Fix**: a roving-tabindex grid for the table, or move «Dettaglio» before the table in tab order; checkbox hit area 32px desktop / 44px at 390; the link as a 44px block on a phone; drop the trigger's `aria-label`. (A heading per tile is a decision on the `Tile` primitive — app-wide.)
- **Suggested command**: /impeccable audit, then /impeccable harden

### [P2] The first viewport says everything twice; footnotes run to 9 lines
- **What**: Evoluzione's four chips repeat the verdict's four figures 120px lower; at 390 they stack for ~330px and with the three export buttons push the curve below the fold; 5,3 screens closed and 8,0 open at 390 (measured). The four footnotes at 95–130 characters per line are the detector's four real hits.
- **Fix**: chips carry what the verdict does not (or the duplicates go); one wrapping row on a phone; exports below the grid; footnotes to one line + a «Come si calcola» popover (Composizione already has one).
- **Suggested command**: /impeccable distill, then /impeccable typeset

## Persona Red Flags
- **Alex**: no sort on 24 rows; Dettaglio re-collapses every visit; a month cannot be linked; a paragraph to learn what drove 2026.
- **Sam**: table's hidden columns unreachable by keyboard; Driver month values hover-only plus one `aria-label` concatenating 12 months × 6 parts; legend below AA; the dark Evoluzione hero line is `--chart-1` at ~2,6:1 (known issue, but THE line); light progress-track remainder nearly invisible.
- **Casey (390)**: 44px targets good, order sensible; three admin buttons before any data; Driver paragraph 6 lines, footnote 11; header «+» 36×36.
- **The methodical accumulator**: adds the two engines and does not get the growth; «fondo pensione +10 €» against +256 €/month as «quantità» in the table; 13% of the year as «ciò che nessuna voce spiega». Each explainable, each a minute not seconds.

## Minor Observations
- Raddoppi stretches (`row-span-2`) over ~150px of void while the Driver beside it is starved (`minHeight` 110); the «293.839 €» label sits at the track's centre with progress at 79% → /impeccable layout.
- `doc/guide/storico.md` is stale: both dialogs already are `ResponsiveModal`; their BODIES are old (Title Case tabs «Dati Generali», `text-orange-500` at `SnapshotSearchDialog.tsx:224`, success toasts with «!», unarmed «Elimina nota» at `:167`).
- «9800,23 €» beside «16.257,36 €», «3246 €» beside «11.967 €»: CLDR-correct, breaks tabular scanning.
- Composizione: Azioni/Immobili/Previdenza neighbouring hues, Liquidità a pink-red near `--destructive`; in dark the bands outweigh the hero curve.
- Lavoro chart's right tick clipped («Set 202»); last note marker half-occluded; «aggiungi una nota» an 11px link with 28px of target; 10 Recharts «width(-1)» warnings per load.
- The `!growth` branch shows verdict + buttons only: no EmptyState saying the first snapshot arrives by itself this evening.

## Questions to Consider
1. If «altre variazioni» can be 13% of a year's growth and needs nine lines of footnote, are six parts the thing to SHOW — or a reconciliation behind «come torna il conto?», with the tile answering only «risparmio o mercato?»
2. «No axis» by doctrine, yet three tiles are secretly about «this month»: principle, or a constraint being worked around?
3. If the numbers were laid out so the arithmetic is visible, how many footnotes could go — and would the page feel MORE trustworthy with fewer caveats?
