# NOVE-02 — Allocazione: a short Piano is as tall as Bilanciamento + Per classe

> Series `doc/nove/` (README.md § 5): **depends on nothing**; implemented **before NOVE-16** (the Accumulo tab of
> PR #486 touches the same page). Written on 2026-11-12; every `file:line` is cited on `develop` @ b841cbd7.
> Executes the owner's point 4 and the adopted choice (c) (README.md § 4).

## 1. The problem today (evidence on the code)

At 1440 the Allocazione grid places Bilanciamento on row 1 and Per classe on row 2 of the left five columns, and the
Piano across both rows of the right seven (`app/dashboard/allocation/page.tsx:595-642`):

- `:595` the grid: `cn(COMPACT_GRID_CLASS, 'desktop:grid-rows-[auto_1fr]')`;
- `:596` Bilanciamento: `desktop:col-span-5 desktop:row-start-1 desktop:self-start`;
- `:629` Per classe: `desktop:col-span-5 desktop:col-start-1 desktop:row-start-2` (no `self-start`: it fills the `1fr`
  row, owner 2026-10-17);
- `:642` Piano: `desktop:col-span-7 desktop:col-start-6 desktop:row-span-2 desktop:row-start-1 desktop:self-start`.

The Piano's `desktop:self-start` keeps it at its natural height. When the Piano is the taller one, Per classe grows
to its bottom edge (the 2026-10-17 decision, `doc/guide/allocazione.md:156`). When the Piano is the SHORTER one — a
plan «in linea», «Versa» before an amount is typed — it stops above the bottom edge of Per classe and the right
column ends in a void. The guide states it as intended: «con un Piano più basso tutto resta ad altezza naturale».

The tile is ready to stretch: its cell is `TILE_ROW_CELL_CLASS` (`components/ui/tile.tsx:88`, i.e.
`flex min-w-0 [&>section]:flex-1` at 1440), and the Piano's footer is already pushed to the bottom
(`components/allocation/tiles/PianoTile.tsx:233`, `mt-auto border-t …`).

## 2. Goal and acceptance criteria

At 1440 the two columns always end on the same line.

1. At 1440 the bottom edge of the Piano tile equals the bottom edge of the Per classe tile (±1px) and its top edge
   equals the top edge of Bilanciamento (±1px), in each of the three modes «Ribilancia», «Versa», «Preleva».
   **Proof**: the new test of `e2e/allocation.spec.ts` (§ 6).
2. When the Piano is stretched, its footer sits on the tile's last line (the gap between the footer's bottom and the
   tile's bottom is the tile's padding, < 32px). **Proof**: the same test.
3. Below `desktop:` nothing changes: the phone and tablet specs (`e2e/allocation.mobile.spec.ts`, the tablet
   projects) stay green untouched. **Proof**: `npx playwright test e2e/allocation` in every project.
4. `npm run mobile:budget` is unchanged for `/dashboard/allocation` (the change is `desktop:` only). **Proof**: the
   run, compared with `perf/mobile-budget.json`.

## 3. Decisions

- **Owner (point 4, 2026-11-12)**: «quando la card Piano è più bassa della somma di Bilanciamento e Per classe, la
  sua altezza deve essere uguale».
- **Adopted, reversible (c)**: the cure is the removal of `desktop:self-start` from the Piano's cell — the grid
  stretches it; no `min-height`, no JavaScript measure.
- **Overturned in part**: the 2026-10-17 sentence «con un Piano più basso tutto resta ad altezza naturale»
  (`doc/guide/allocazione.md:156`) — from this spec on the Piano stretches. Bilanciamento keeps its natural height
  and Per classe keeps filling the `1fr` row.

## 4. Solution

`app/dashboard/allocation/page.tsx`, the Piano's cell — one class removed:

```tsx
<div className={cn(TILE_ROW_CELL_CLASS, tablet.cellClass(ALLOCAZIONE_SECTION_IDS.piano), 'desktop:col-span-7 desktop:col-start-6 desktop:row-span-2 desktop:row-start-1')}>
```

and the comment above the grid (`:591-594`) ends with: «…and Per classe fills it (no `desktop:self-start` on its
cell, 2026-10-17); the Piano's cell has none either, so a short Piano stretches to the bottom of Per classe
(2026-11-12).»

Why it is enough: with `grid-rows-[auto_1fr]` the two rows are as tall as max(Bilanciamento + Per classe, Piano);
a cell without `self-start` takes `align-self: stretch`, the cell is a flex container and its `<section>` is
`flex-1`; inside the tile the body keeps its natural height and the footer's `mt-auto` takes the extra space above
itself.

No change to `PianoTile.tsx`, to `tile.tsx` or to any class below `desktop:`.

## 5. Constraints and traps (AGENTS.md / repo rules, «here it means that»)

- **«A tile stretched beside a taller neighbour is cured in the GRID, never in the tile»** (AGENTS.md:674): here it
  means that this spec is the SECOND declared exception on this page (the first is Per classe, 2026-10-17). The void
  moves inside the Piano, between its body and its footer, by the owner's choice; no other page takes the pattern.
- **`TILE_ROW_CELL_CLASS` carries `max-desktop:self-start`**: here it means that below 1440 the cell stays at its
  natural height by itself; do not add or remove anything for the phone and the tablet.
- **The First-Screen Rule / one DOM sequence, no `order-*`**: the DOM order is untouched.
- **The Compiler**: no hook is added; `reactCompilerCoverage` is not affected.
- **PR #486 (NOVE-16) re-applies a tab bar on this page**: this spec lands first, so NOVE-16 rebases on the cell as
  written here.

## 6. Tests per level (with the mutation that proves each)

| Level | Test | Mutation that turns it red |
| --- | --- | --- |
| Playwright (desktop project, 1440) | `e2e/allocation.spec.ts` › «il Piano finisce dove finisce Per classe, in ogni modo» | put `desktop:self-start` back on the Piano's cell (red in the mode where the Piano is the shorter one: «Versa» with the empty amount) |

The test, added to `e2e/allocation.spec.ts`:

```ts
test('il Piano finisce dove finisce Per classe, in ogni modo', async ({ page }) => {
  await openAllocazione(page);
  const piano = page.locator('section[aria-label="Piano"]');
  const perClasse = page.locator('section[aria-label="Allocazione per classe"]');
  const bilanciamento = page.locator('section[aria-label="Bilanciamento dell\'allocazione"]');

  for (const mode of ['Ribilancia', 'Versa', 'Preleva']) {
    await piano.getByText(mode, { exact: true }).click();
    const [p, c, b] = await Promise.all([piano.boundingBox(), perClasse.boundingBox(), bilanciamento.boundingBox()]);
    expect(Math.abs(p!.y + p!.height - (c!.y + c!.height)), `${mode}: i bordi inferiori`).toBeLessThanOrEqual(1);
    expect(Math.abs(p!.y - b!.y), `${mode}: i bordi superiori`).toBeLessThanOrEqual(1);
    const footer = (await piano.locator('p').last().boundingBox())!;
    expect(p!.y + p!.height - (footer.y + footer.height), `${mode}: il piè in fondo`).toBeLessThan(32);
  }
});
```

The three region names are the ones `e2e/allocation.mobile.spec.ts:250` already reads. The mode is pressed by its
label (`PianoTile.tsx:57-59`: «Ribilancia», «Versa», «Preleva»), not by role: the toggle is an `AsideToggle` over
`components/ui/segmented-pill.tsx`, which renders `radio` or `tab` by its `semantics` prop, and the label is exact
and unique inside the tile's header.

## 7. Guided verification (WORKFLOW.md § 2)

Expected outcome, declared first: at 1440, with the seed account, switching the Piano to «Versa» without an amount
leaves a short body and the tile's border still ends on the line of Per classe, the footer on its last line.

- **A**: `tsc`, lint, Vitest (three zones), `npx playwright test e2e/allocation` in every project.
- **B**: emulators + seed + `dev:emulator`.
- **C (browser, the session)**: `/dashboard/allocation` at 1440 in the three modes, light and dark; at 1024×768,
  768×1024 and 390 one look each to confirm nothing moved.
- **D–E**: not applicable.
- **F (owner)**: the owner's account on the mirror (`npm run mirror:seed -- <email>`), the page at his desktop width;
  `npm run mirror:remove` after.
- **G**: stop the servers, remove the mirror.

## 8. Putting it into service

One PR to `develop`. Nothing to deploy by hand.

## 9. Documentation

- `doc/guide/allocazione.md:156`: the bullet's last clause becomes «…quando il Piano è il più alto; **con un Piano
  più basso è il Piano ad allungarsi fino al bordo di Per classe** (proprietario, 2026-11-12: il piè scende
  sull'ultima riga, il vuoto sta tra il corpo e il piè). Allocazione è l'eccezione dichiarata, due volte, di quella
  regola.»
- `AGENTS.md:674`: nothing (the rule stands; the exception lives in the guide).
- `CLAUDE.md` › «Latest», `Draft Release Temp.md` (the Allocazione entry, rewritten to its final state),
  `doc/nove/README.md` § 6.

## 10. Declared out of scope

- **The same alignment on other pages** (Rendimenti, Patrimonio): the AGENTS.md rule stands there; no heir — the
  owner asked for Allocazione only.
- **The Accumulo tab's own grid**: heir NOVE-16.

## 11. The prompt that implements it

```
Ciao, in questa sessione vorrei implementare la spec doc/nove/NOVE-02-allocazione-piano-altezza.md

Contesto, prima di toccare qualsiasi file (le regole del repo cambiano il modo di lavorare):
- Leggi WORKFLOW.md (regole di sessione e di collaudo; l'ultima sezione dice come si
  applicano in questo repo)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- CLAUDE.md (l'indice: che cos'è e dove sta ogni cosa, lo stato corrente) è già nel
  contesto: usalo per trovare la guida giusta
- Leggi la spec doc/nove/NOVE-02-allocazione-piano-altezza.md e l'indice della serie
  doc/nove/README.md (§ 3 decisioni, § 4 scelte adottate, § 7 contratti condivisi, § 8 regole)
- Leggi doc/guide/allocazione.md e doc/guide/e2e-playwright.md PRIMA di scrivere codice
- Leggi DESIGN.md (The First-Screen Rule, Small-Screen Composition) e PRODUCT.md
- Leggi COMMENTS.md e DEVELOPMENT_GUIDELINES.md: il codice che scrivi li segue

Lancia npm audit e confrontalo con doc/guide/dipendenze.md (regola 8 di WORKFLOW.md).
Rispondimi in una riga: invariate dal <data>, oppure gli avvisi nuovi; quelli nuovi li
registriamo nella guida con una decisione, non si aggiorna nulla in questa sessione.

Prima della prima modifica: controlla il branch attivo (git branch --show-current) e crea
il branch di sessione da lì. Mai modificare un file sul branch di integrazione.

Crea SESSION_NOTES.md per tracciare il lavoro (non tracciato: a fine sessione si riversa
nei documenti e si cancella).

Ogni dubbio o scelta che spetta a me me la chiedi SUBITO con AskUserQuestion, una scelta
per domanda, a gruppi di quattro: mai un «da decidere» lasciato nel codice, nei documenti o
nel riassunto. Se serve un comando che solo io posso lanciare (produzione, un login
interattivo), dammelo una riga alla volta con l'esito atteso.

Implementa la spec così com'è scritta: la classe tolta dalla cella del Piano, il commento
sopra la griglia, il test Playwright della § 6. Fermati e chiedimi se nel seed il Piano non
è mai il più basso in nessuno dei tre modi (il test non proverebbe la mutazione). Collaudo:
§ 7, la F sul mirror al mio «pronto». Un branch, un commit, solo dopo il mio OK con il
riassunto del diff. SESSION_NOTES.md non si committa.
```

Model: **Sonnet 5.5**, effort **medium** — an S spec in one area, one class and one E2E, every criterion closed by a
test. Estimated size: 1 short session, ~45 min; 1 line of markup, ~20 of test, one guide sentence.
