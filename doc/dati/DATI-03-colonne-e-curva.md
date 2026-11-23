# DATI-03 — Two columns always end on one line; a sparkline never leaves its box

> Series `doc/dati/` (index: [README.md](README.md)). Depends on: nothing. Written on 2026-11-23; every `file:line`
> is cited @ b0bf8276. Owner's points 10 and 11 (added during the planning session, with two screenshots).

## 1. The problem today (evidence on the code)

**Rendimenti leaves a hole under Plusvalenze.** Below its first row the page is two columns from `desktop:`
(`app/dashboard/performance/page.tsx:985-990`): the left wrapper (`:991`, 7 columns) holds Attribuzione and «Capitale
e mercato», whose cell takes `desktop:flex-1` (`:1004`); the right wrapper (`:1017`, 5 columns) holds Rischio,
Consistenza and Plusvalenze. Consistenza grows ONLY when there is no Plusvalenze
(`realizedState === 'absent' && 'desktop:flex-1'`, `:1032`); the Plusvalenze cell (`:1059`) and its failed-read
notice (`:1042`) never do. So when the left column is the taller one — the owner's screenshot: a chart that reaches
below a one-sentence Plusvalenze — the right column ends early and the page shows an empty rectangle. The rule that
produced it is written: «two columns at natural height … the ONE element that can be any height takes the slack. The
declared exceptions are all on Allocazione» (`AGENTS.md:723-730`). The owner's word of 2026-11-23: «le card devono
avere sempre la stessa altezza, per evitare "buchi vuoti"», as on Allocazione and Analisi.

**The same shape, the same hole, in two more places.** `components/fire-simulations/coast/CoastIpotesi.tsx:137` and
`:272` (two wrappers, no cell with `desktop:flex-1`: `:139`, `:251`, `:274`, `:389` are bare `TILE_CELL_CLASS`) and
`components/settings/tabs/SpeseTab.tsx:436` (a wrapper of three bare cells, `:438`, `:529`, `:642`, beside the single
stretched cell of `:674`). `components/settings/tabs/GeneraleTab.tsx:262` is right already (its last cell, `:334`,
has `desktop:flex-1`).

**Previdenza's curve is cut at the top of its box.** «Andamento» in `components/pension/tiles/FondoOggiTile.tsx:144-145`
draws `NetWorthSparkline`, whose path is a Catmull-Rom spline (`components/dashboard/NetWorthSparkline.tsx:41-56`). A
Catmull-Rom segment overshoots its two end points when the slope changes sharply: a fund that sat flat, was topped up
and sat flat again draws a curve that rises ABOVE its highest value before coming back. The plot keeps 4 units of
padding (`padT = 4`, `:95`), the overshoot is larger, and the SVG's viewBox clips it (the screenshot: the curve
flattened against the top edge). The Panoramica's hero draws the same component (`components/dashboard/overview/PatrimonioTile.tsx:220`)
and is exposed to the same series shape. No test covers the path (`__tests__/` has `sparklinePeriod.test.ts` only).

## 2. Goal and acceptance criteria

1. On Rendimenti at 1440, the last tile of the left column and the last tile of the right column end on the same
   line (≤ 1 px), whichever column is naturally the taller, with Plusvalenze present, absent or failed. Proof: E1.
2. The same on FIRE › Coast FIRE › «Ipotesi» and on Impostazioni › Spese. Proof: E2, E3.
3. In a tile that grew, the rows stay at the top and the one-line footer sits on the tile's bottom edge (the footer's
   bottom within 32 px of the tile's, the measure of `e2e/allocation.spec.ts:287`). Proof: E1.
4. Below `desktop:` nothing changes: the wrappers are `contents`, the tiles are closed rows. Proof: the existing
   `e2e/mobile-composition.performance.degraded.mobile.spec.ts`, `fire.mobile.spec.ts` and `settings.mobile.spec.ts`
   stay green untouched; `npm run mobile:budget` identical to `develop`'s run of the same day.
5. A sparkline's curve passes through every point and never goes above the highest nor below the lowest of the two
   points it joins. Proof: U1, U2, R1.
6. `npx tsc --noEmit`, `npm run lint`, `TZ=Europe/Rome npx vitest run` green; `npm run perf:budget` within 0,1 KB gz
   of `develop` on the three routes.

## 3. Decisions

- **Owner, 2026-11-23** (points 10 and 11): the cards always end together; the curve stays inside the border.
- Earlier rule overturned: «two columns at natural height … the declared exceptions are all on Allocazione»
  (AGENTS.md, 2026-09-20, with the exceptions of 2026-10-17, 2026-11-12 and 2026-11-18) — from 2026-11-23 the
  exception is the rule.
- Adopted, reversible:
  - (a) **the cell that grows is the LAST of each column**: its content keeps the top, its footer (`mt-auto`, as
    `components/ui/tile-method-note.tsx:29` already is) goes down, the space sits between — what Allocazione's Per
    classe does (doc/guide/allocazione.md:157). On Rendimenti's left column the last cell is the chart, which fills it.
  - (b) **the curve becomes a monotone cubic** (Fritsch–Carlson tangents), not a larger padding: a padding large
    enough for any overshoot would flatten every ordinary curve.
  - (c) the two wrapper classes become constants of `components/ui/tile.tsx`, so a fourth page copies the rule with
    the layout.

## 4. Solution

### 4.1 `components/ui/tile.tsx` — two constants, beside `TILE_CELL_CLASS` (`:86`)

```ts
/**
 * A column of tiles inside the 12-column grid, from `desktop:`; below it the wrapper is `contents` and
 * its tiles are items of the grid again, in the DOM's order. Two such columns (or a column beside a
 * single cell) END ON ONE LINE (owner, 2026-11-23): the last cell of each takes TILE_COLUMN_END_CLASS,
 * so the shorter column's last tile grows — rows at the top, the one-line footer on the bottom edge.
 */
export const TILE_COLUMN_CLASS = 'contents desktop:flex desktop:flex-col desktop:gap-3';
export const TILE_COLUMN_END_CLASS = 'desktop:flex-1';
```

### 4.2 The four call sites

Each wrapper takes `TILE_COLUMN_CLASS` (replacing the same literal) and the attribute `data-tile-column`; the last
cell rendered in it takes `TILE_COLUMN_END_CLASS`.

- `app/dashboard/performance/page.tsx`: left wrapper `:991` — the Capitale cell (`:1004`) already ends it. Right
  wrapper `:1017` — the Consistenza cell (`:1032`) keeps its condition; the failed-read cell (`:1042`) and the
  Plusvalenze cell (`:1059`) take `TILE_COLUMN_END_CLASS`. The comment at `:985-990` is rewritten: «…each tile keeps
  its natural height but the LAST of each column, which grows so the two columns end on one line (owner, 2026-11-23)».
- `components/fire-simulations/coast/CoastIpotesi.tsx`: wrappers `:137`, `:272`; last cells `:251` and `:389`.
- `components/settings/tabs/SpeseTab.tsx`: wrapper `:436`; last cell `:642`. The single cell beside it (`:674`) takes
  `data-tile-column` too (it is a column of one: the test reads it the same way).
- `components/settings/tabs/GeneraleTab.tsx`: wrapper `:262` takes the constant and the attribute; `:334` takes
  `TILE_COLUMN_END_CLASS` in place of its literal. No visual change.

### 4.3 Pure module — `lib/utils/sparklinePath.ts` (new, written here)

```ts
/**
 * The SVG path of a sparkline: a cubic through every point that never leaves the band between the two
 * points it joins.
 *
 * A Catmull-Rom spline (what this replaced on 2026-11-23) overshoots where the slope turns sharply: a
 * value that sat flat, jumped and sat flat again drew a curve ABOVE its own maximum, cut by the plot's
 * edge. A monotone cubic takes its tangents from the two neighbouring slopes — zero at a turning point,
 * their harmonic mean elsewhere (Fritsch–Carlson) — so every control point stays between its segment's
 * ends, and so does the curve.
 */
export type SparkPoint = [number, number];

export interface SparkSegment {
  c1: SparkPoint;
  c2: SparkPoint;
  to: SparkPoint;
}

function slope(from: SparkPoint, to: SparkPoint): number {
  return (to[1] - from[1]) / (to[0] - from[0]);
}

function monotoneTangents(pts: SparkPoint[]): number[] {
  const last = pts.length - 1;
  const tangents: number[] = [slope(pts[0], pts[1])];
  for (let i = 1; i < last; i++) {
    const before = slope(pts[i - 1], pts[i]);
    const after = slope(pts[i], pts[i + 1]);
    tangents.push(before * after <= 0 ? 0 : (2 * before * after) / (before + after));
  }
  tangents.push(slope(pts[last - 1], pts[last]));
  return tangents;
}

/** The Bézier segments joining `pts` (x strictly increasing). Empty under two points. */
export function monotoneSegments(pts: SparkPoint[]): SparkSegment[] {
  if (pts.length < 2) return [];
  const tangents = monotoneTangents(pts);
  const segments: SparkSegment[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    const third = (x2 - x1) / 3;
    segments.push({
      c1: [x1 + third, y1 + tangents[i] * third],
      c2: [x2 - third, y2 - tangents[i + 1] * third],
      to: [x2, y2],
    });
  }
  return segments;
}

export function monotonePath(pts: SparkPoint[]): string {
  if (pts.length < 2) return '';
  const parts = [`M ${pts[0][0]},${pts[0][1]}`];
  for (const { c1, c2, to } of monotoneSegments(pts)) {
    parts.push(`C ${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${to[0]},${to[1]}`);
  }
  return parts.join(' ');
}
```

### 4.4 `components/dashboard/NetWorthSparkline.tsx`

Delete `catmullRomPath` (`:37-56`); `const linePath = monotonePath(pts);` at `:100`. Nothing else: the padding, the
area path, the hover, the stroke stay.

## 5. Constraints and traps

- **«A tile stretched beside a taller neighbour is cured in the GRID, never in the tile»** (AGENTS.md:723): here it
  means the fix is the cell's class, never a `min-height` nor a spacer inside Plusvalenze.
- **«A grid item stretches to the row height, a normal-flow child does not inherit it without its own `h-full`»**
  (AGENTS.md:94): here it means the growing cell is `TILE_CELL_CLASS` (`flex`, the section `flex-1`), which is what
  lets the tile fill it — a cell without it grows and leaves the tile short.
- **«Keep ONE sequence: the DOM order is the reading order»**: no `order-*`, no reordering of the cells.
- **Below `desktop:` the wrappers are `contents`**: `desktop:flex-1` is inert there, and `TILE_ROW_CELL_CLASS`'s
  `max-desktop:self-start` is untouched.
- **The React Compiler is on**: `monotonePath` is a pure call in render, no `useMemo` added.
- **A series label never enters the code**: comments say «2026-11-23».
- The line's uneven thickness (a stretched viewBox with no `vector-effect`, `NetWorthSparkline.tsx:143`) is NOT
  touched: it changes the look of the Panoramica's hero, which nobody asked (§ 10).

## 6. Tests per level (each with the mutation that proves it)

| # | Level · file | What it asserts | Mutation that must turn it red |
|---|---|---|---|
| U1 | unit · `__tests__/sparklinePath.test.ts` | on `[0,100] [10,100] [20,100] [30,10] [40,10] [50,10]` every `c1`/`c2` has its y between the y of its segment's two ends | tangents → the Catmull-Rom slope `(next − previous) / 2` |
| U2 | unit · same | each segment's `to` is the next point; the path starts with `M 0,100`; a flat series gives control points on the line | `to: [x2, y1]` |
| U3 | unit · same | one point → `''`; two points → one segment whose controls lie on the straight line | `pts.length < 2` → `< 3` |
| R1 | dom · `__tests__/netWorthSparkline.test.tsx` | rendered on a flat-jump-flat series of six months, every y in the line's `d` lies within `[4, height − 4]` | restore `catmullRomPath` |
| E1 | e2e · `e2e/performance.degraded.spec.ts` | at 1440: with the first tile of the LEFT column forced 900 px tall (`page.addStyleTag`) the last tiles of the two `[data-tile-column]` end within 1 px and the grown tile's footer is within 32 px of its bottom; then the same with the RIGHT column's first tile forced | remove `TILE_COLUMN_END_CLASS` from the Plusvalenze cell (first case red); from the Capitale cell (second) |
| E2 | e2e · `e2e/fire.spec.ts` | Coast FIRE › Ipotesi, same two forced cases | remove the class from `:251`, then `:389` |
| E3 | e2e · `e2e/settings.spec.ts` | Impostazioni › Spese: the wrapper's last tile ends with the single cell beside it, with that cell forced taller | remove the class from `:642` |

The three E tests share one helper, `e2e/tileColumns.ts`: `expectColumnsEndTogether(page, scope)` reads, for every
`[data-tile-column]` inside `scope`, the bottom of its last element child's `section` (or of the element itself when it
is a single cell) and expects max − min ≤ 1. Forcing a height with a style tag makes the test independent of what the
fixture happens to hold: each case is seen red alone.

## 7. Guided verification (WORKFLOW.md § 2)

Expected outcome, declared first: on Rendimenti at 1440 the bottom edges of «Capitale e mercato» and of the right
column's last tile are one line, with the footer «Non segue il periodo. Come si calcola» on Plusvalenze's bottom edge;
on Previdenza the curve of «Andamento» touches the top of the plot at its highest point and never crosses it.

- A — the diff. B–E automated by a throwaway Playwright script on the emulators, screenshots at 1440 and 390:
  B Rendimenti (Plusvalenze present, then absent on the fixture without a closed sale); C Coast FIRE › Ipotesi and
  Impostazioni › Spese; D Previdenza with a planted flat-jump-flat series (decoy fund «ornitorinco»), the line path's
  `getBBox()` inside the viewBox; E the Panoramica's hero on the same shape.
- F — at the owner's «pronto», on the mirror: Rendimenti and Previdenza at his own width.

## 8. Putting it into service

No DDL, no deploy step. Measure: `npm run perf:budget` (the three routes within 0,1 KB gz) and `npm run mobile:budget`
against `develop` the same day (identical: the classes are `desktop:` only).

## 9. Documentation

- `AGENTS.md:723-730` — the bullet's second half rewritten: BEFORE «Tiles share a row only with tiles of their own
  height; below that row two columns at natural height … **The declared exceptions are all on Allocazione**: …
  (doc/guide/accumulo.md).» AFTER «Tiles share a row only with tiles of their own height; below that row two columns —
  wrappers `TILE_COLUMN_CLASS` — that **END ON ONE LINE, always** (owner, 2026-11-23, after Rendimenti left a hole
  under Plusvalenze; first asked for Allocazione on 2026-10-17 and 2026-11-12, for Accumulo on 2026-11-18): the LAST
  cell of each column takes `TILE_COLUMN_END_CLASS`, its rows keep the top and its one-line footer goes down; held at
  1440 by `e2e/tileColumns.ts` on Rendimenti, Coast FIRE and Impostazioni › Spese, by `e2e/allocation.spec.ts` and
  `e2e/accumulo.spec.ts` on theirs.»
- `DESIGN.md` § Tile Grid — one sentence after the code block, as an amendment (before: nothing; after): «Two columns
  of tiles end on one line: the last tile of the shorter one grows, its footer on the bottom edge (2026-11-23).»
- `doc/guide/rendimenti.md` (the layout bullet near `:172`), `doc/guide/fire-coast.md`, `doc/guide/impostazioni.md` —
  one sentence each naming the growing cell. `doc/guide/grafici.md` — the sparkline's path is monotone, with the
  reason. `doc/guide/previdenza.md` § blind spots — the line's uneven thickness, kept.
- `Draft Release Temp.md` — two entries, prepended: «Rendimenti, Coast FIRE e Impostazioni: le due colonne finiscono
  sulla stessa riga» and «Previdenza e Panoramica: la curva non esce più dal riquadro».
- `doc/dati/README.md` § 6: status row.

## 10. Declared out of scope

- The line's uneven thickness on a stretched viewBox → doc/guide/previdenza.md § blind spots (no spec: a change of
  the Panoramica's hero is a design choice of its own).
- A source-level guard that every future column wrapper ends its last cell → not planned; the constant's comment and
  AGENTS.md carry the rule.
- The daily points on the Panoramica's line → DATI-14.

## 11. The prompt that implements it

```
Ciao, in questa sessione vorrei implementare la spec doc/dati/DATI-03-colonne-e-curva.md

Contesto, prima di toccare qualsiasi file (le regole del repo cambiano il modo di lavorare):
- Leggi WORKFLOW.md (regole di sessione e di collaudo; l'ultima sezione dice come si
  applicano in questo repo)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- CLAUDE.md (l'indice: che cos'è e dove sta ogni cosa, lo stato corrente) è già nel
  contesto: usalo per trovare la guida giusta
- Leggi la spec per intero e l'indice della serie doc/dati/README.md (decisioni, regole della serie)
- Leggi doc/guide/rendimenti.md, doc/guide/fire-coast.md, doc/guide/impostazioni.md,
  doc/guide/previdenza.md, doc/guide/grafici.md e doc/guide/e2e-playwright.md PRIMA di scrivere
  codice in quei domini
- Tocca la UI: leggi DESIGN.md (§ Tile Grid) e PRODUCT.md prima di disegnare
- Leggi COMMENTS.md e DEVELOPMENT_GUIDELINES.md: il codice che scrivi li segue

Prima di tutto: lancia `node ~/.claude/processi-collaudo.mjs` (conta gli script di collaudo e i servizi
che questo repo usa — emulatori Firebase, server Next — ancora accesi; la seconda riga dell'output
dice quali servizi ha cercato). Se trova qualcosa non è di
questa sessione, che è appena iniziata: quelli «di un'altra sessione aperta» non si toccano; quelli
«di nessuna sessione nota» me li nomini (cosa, da quanto) e li chiudi con `--chiudi --anche-ignote`
solo dopo il mio sì. Dimmelo in una riga: «processi: nessuno» oppure l'elenco.

Se il repo ha un lockfile: lancia l'audit del gestore di pacchetti e confrontalo con
doc/guide/dipendenze.md (regola 8 di WORKFLOW.md). Rispondimi in una riga: invariate dal
<data>, oppure gli avvisi nuovi; quelli nuovi li registriamo nella guida con una decisione,
non si aggiorna nulla in questa sessione. Se la guida manca, creala.

Prima della prima modifica: controlla il branch attivo (git branch --show-current) e crea
il branch di sessione da lì. Mai modificare un file sul branch di integrazione.

Crea SESSION_NOTES.md per tracciare il lavoro (non tracciato: a fine sessione si riversa
nei documenti e si cancella).

Ogni dubbio o scelta che spetta a me me la chiedi SUBITO con AskUserQuestion, una scelta
per domanda, a gruppi di quattro: mai un «da decidere» lasciato nel codice, nei documenti o
nel riassunto. Se serve un comando che solo io posso lanciare (produzione, un login
interattivo), dammelo una riga alla volta con l'esito atteso.

Implementa la spec così com'è scritta, nell'ordine: il modulo puro della curva con U1–U3 e R1 (ognuno
visto rosso con la sua mutazione), poi le due costanti e i quattro punti d'uso, l'helper e2e e E1–E3
(ogni caso visto rosso togliendo la classe dalla sua cella), infine i documenti. Il codice dei § 4.1 e
§ 4.3 è già scritto: copialo.

Fermati e chiedimi se: una delle celle citate non è più dove la spec dice (commit b0bf8276), una
tessera cresciuta mostra il piè a metà invece che sul bordo, oppure `mobile:budget` cambia.

Collaudo: § 7, la F al mio «pronto». Un branch, un commit, solo dopo il mio OK con il riassunto del diff.
SESSION_NOTES.md non si committa.
```

Model: **Sonnet 5.5**, effort **medium** — an S spec, layout classes and one pure function, every criterion closed
by a test. Estimated size: S (one new module, four call sites, seven tests).
