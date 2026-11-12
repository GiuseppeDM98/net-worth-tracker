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
plan «in linea», «Versa» with the amount field cleared (it opens on 1000, `DEFAULT_PLAN_AMOUNT_INPUT`, `page.tsx:164`)
— it stops above the bottom edge of Per classe and the right
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
3. Below `desktop:` nothing changes: `e2e/allocation.mobile.spec.ts` (`mobile` project) and the 1440 specs stay
   green untouched. **Proof**: `npx playwright test e2e/allocation` in every project. No tablet spec covers
   Allocazione: 1024×768 and 768×1024 are proven by § 7 C (one look each) and by the `allocazione` surface of
   `mobile:budget` at 768 and 1024 (criterion 4).
4. `npm run mobile:budget` is unchanged for `/dashboard/allocation` (the change is `desktop:` only). **Proof**: the
   run, compared with `perf/mobile-budget.json`.
5. `npm run perf:budget` keeps `/dashboard/allocation` within its 605 KB gz, by README.md § 8's rule (expected ≤ 604,8: the change only
   removes a class string from the page chunk; the CSS is unchanged because `desktop:self-start` stays on
   Bilanciamento's cell). **Proof**: the run, in § 7 A.

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
(2026-11-12).» In the comment above the wrapper (`:577-589`) the clause «; with a shorter Piano everything is at
natural height)» becomes «; with a shorter Piano the Piano's cell stretches to Per classe's bottom edge, owner
2026-11-12, its footer on the column's last line)».

Why it is enough: with `grid-rows-[auto_1fr]` the two rows are as tall as max(Bilanciamento + Per classe, Piano);
a cell without `self-start` takes `align-self: stretch`; the cell is a row flex container, so its `<section>`
(`flex-1` across, the default `align-items: stretch` down) takes the cell's height; the section is
`flex flex-col` (`TILE_SURFACE_CLASS`), so the body keeps its natural height and the footer's `mt-auto` takes the
extra space above itself.

No change to `PianoTile.tsx`, to `tile.tsx` or to any class below `desktop:`.

## 5. Constraints and traps (AGENTS.md / repo rules, «here it means that»)

- **«A tile stretched beside a taller neighbour is cured in the GRID, never in the tile»** (AGENTS.md:674): here it
  means that this spec is the SECOND declared exception on this page (the first is Per classe, 2026-10-17). The void
  moves inside the Piano, between its body and its footer: the owner asked for equal height (point 4), and the
  footer's existing `mt-auto` puts the space above it (adopted choice (c)); no other page takes the pattern.
- **`TILE_ROW_CELL_CLASS` carries `max-desktop:self-start`**: here it means that below 1440 the cell stays at its
  natural height by itself; do not add or remove anything for the phone and the tablet.
- **The First-Screen Rule / one DOM sequence, no `order-*`**: the DOM order is untouched.
- **The Compiler**: no hook is added; `reactCompilerCoverage` is not affected.
- **PR #486 (NOVE-16) re-applies a tab bar on this page**: this spec lands first, so NOVE-16 rebases on the cell and on the
  two comments as written here, and keeps both the PR's two appended tests and this spec's test at the end of
  `e2e/allocation.spec.ts` (a cherry-pick conflict there resolves to both).

## 6. Tests per level (with the mutation that proves each)

| Level | Test | Mutation that turns it red |
| --- | --- | --- |
| Playwright (desktop project, 1440) | `e2e/allocation.spec.ts` › «il Piano finisce dove finisce Per classe, in ogni modo» | put `desktop:self-start` back on the Piano's cell (red in the step «Versa senza importo»: with the field cleared the Piano is the shorter column, and the step's own guard — more than 32px between the amount field and the footer — proves the step exercises the stretch) |

The test, appended at the end of `e2e/allocation.spec.ts`, after «a 1440 la pagina è quella di oggi…»:

```ts
test('il Piano finisce dove finisce Per classe, in ogni modo', async ({ page }) => {
  await openAllocazione(page);
  const piano = page.locator('section[aria-label="Piano"]');
  const perClasse = page.locator('section[aria-label="Allocazione per classe"]');
  const bilanciamento = page.locator('section[aria-label="Bilanciamento dell\'allocazione"]');
  const footer = piano.locator('p.mt-auto');

  const expectAligned = async (label: string) => {
    const [p, c, b, f] = await Promise.all([piano.boundingBox(), perClasse.boundingBox(), bilanciamento.boundingBox(), footer.boundingBox()]);
    expect(Math.abs(p!.y + p!.height - (c!.y + c!.height)), `${label}: i bordi inferiori`).toBeLessThanOrEqual(1);
    expect(Math.abs(p!.y - b!.y), `${label}: i bordi superiori`).toBeLessThanOrEqual(1);
    expect(p!.y + p!.height - (f!.y + f!.height), `${label}: il piè in fondo`).toBeLessThan(32);
  };

  for (const mode of ['Ribilancia', 'Versa', 'Preleva']) {
    const button = piano.getByRole('button', { name: mode, exact: true });
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expectAligned(mode);
  }

  // Il Piano più basso che la pagina disegna: «Versa» con il campo vuotato (si apre su 1000).
  await piano.getByRole('button', { name: 'Versa', exact: true }).click();
  const amount = piano.getByRole('spinbutton');
  await amount.fill('');
  await expectAligned('Versa senza importo');
  const [field, f] = await Promise.all([amount.boundingBox(), footer.boundingBox()]);
  // Ad altezza naturale il piè starebbe 14px sotto il campo (mb-3.5): più di 32px vuol dire che il Piano si è allungato.
  expect(f!.y - (field!.y + field!.height), 'senza importo il Piano è il più basso').toBeGreaterThan(32);
});
```

The three region names are the ones `e2e/allocation.mobile.spec.ts:250` already reads. The mode is pressed by role
and the test waits for its `aria-pressed="true"` before measuring: the toggle is an `AsideToggle`
(`components/ui/aside-toggle.tsx`), a `group` of `button`s with `aria-pressed`, labels «Ribilancia», «Versa»,
«Preleva» (`PianoTile.tsx:57-59`). The footer is `piano.locator('p.mt-auto')`, the one `mt-auto` paragraph of the
tile (`PianoTile.tsx:233`). With an empty amount `buildPlanView` returns no nodes, so the cleared «Versa» is header,
reading, field and footer: the one state that is short on every account.

## 7. Guided verification (WORKFLOW.md § 2)

Expected outcome, declared first: at 1440, with the seed account, switching the Piano to «Versa» and clearing the
amount field (it opens on 1000) leaves a short body and the tile's border still ends on the line of Per classe, the footer on its last line.

- **A**: `tsc`, lint, Vitest (three zones), `npx playwright test e2e/allocation` in every project, `perf:budget`
  (criterion 5) and the `mobile:census` + `mobile:budget` of criterion 4.
- **B**: emulators + seed + `dev:emulator`.
- **C (browser, the session)**: `/dashboard/allocation` at 1440 in the three modes, light and dark; at 1024×768,
  768×1024 and 390 one look each to confirm nothing moved.
- **D–E**: not applicable.
- **F (owner)**: the owner's account on the mirror (`npm run mirror:seed -- <email>`), the page in a window at
  least 1440 wide (below it the page is the phone/tablet composition and nothing of this spec shows), in the three
  modes and with the «Versa» amount cleared; `npm run mirror:remove` after.
- **G** (the two budgets close by README.md § 8's ONE rule, decisions 33 and 34): stop the servers, remove the mirror.

## 8. Putting it into service

One PR to `develop`. Nothing to deploy by hand.

## 9. Documentation

- `doc/guide/allocazione.md:156`: the whole bullet («**Per classe si allunga fino al bordo inferiore del Piano**…»)
  is replaced by this one, in English (a rewritten bullet takes the documents' language, WORKFLOW.md § 1.4):
  «- **The two columns end on one line** (owner, 2026-10-17 and 2026-11-12): at 1440 Bilanciamento sits at its own
  height (`desktop:self-start`, row 1); Per classe under it takes the grid's `1fr` row
  (`desktop:grid-rows-[auto_1fr]`, its cell WITHOUT `self-start`) and stops where the Piano ends when the Piano is
  the taller: its rows stay at the top, its footer goes down to the Piano's last line, the space sits between the
  two; with a shorter Piano it is the Piano that stretches to Per classe's bottom edge (its cell has no
  `desktop:self-start` either): the Piano's footer goes down to the last line, the space sits between its body and
  its footer. From 2026-09-21 to 2026-10-17 the two columns sat at natural height by the AGENTS.md rule (a tile
  stretched beside a taller neighbour is an empty card): the owner preferred the aligned edges to the void, and
  Allocazione is the declared exception to that rule, twice (Per classe since 2026-10-17, the Piano since
  2026-11-12). On the right the Piano across two rows, the Esposizione full width below; below `desktop:` the tiles
  follow the DOM order — Per classe BEFORE the Piano — with no `order-*` (since 2026-10-15, § Composizione mobile).»
- `doc/guide/allocazione.md:222` (The specs), inside the `e2e/allocation.spec.ts` parenthesis after «the KPI
  whole»: «, the two columns ending on one line in the three modes and with the amount cleared (seen red with
  `desktop:self-start` back on the Piano's cell, 2026-11-12)»; `doc/guide/e2e-playwright.md:226`, after «no sideways
  scroll»: «, the Piano's edges against Bilanciamento and Per classe at 1440 (2026-11-12)».
- `AGENTS.md` (the rule «A tile stretched beside a taller neighbour is cured in the GRID»), before: «**The declared
  exception is Allocazione's Per classe** (owner, 2026-10-17): it fills the grid's `1fr` row to the Piano's bottom
  edge, its footer on the Piano's last line, because the owner preferred the aligned edges to the void under it
  (doc/guide/allocazione.md).»; after: «**The declared exceptions are both on Allocazione**: Per classe (owner,
  2026-10-17) fills the grid's `1fr` row to the Piano's bottom edge, its footer on the Piano's last line, because
  the owner preferred the aligned edges to the void under it; the Piano (owner, 2026-11-12) stretches to Per
  classe's bottom edge when it is the shorter, its cell without `desktop:self-start` (doc/guide/allocazione.md).»
- `DESIGN.md` → The Tile Grid Rule, the «On Allocazione» sentence (decision 16: before / after, to the letter),
  before: «Per classe 5 under Bilanciamento — stretched to the Piano's bottom edge when the Piano is the taller, the
  owner's call of 2026-10-17 over the void that natural height left (the one tile that grows beside a taller
  neighbour, its footer on the Piano's last line)»; after: «Per classe 5 under Bilanciamento — stretched to the
  Piano's bottom edge when the Piano is the taller, the owner's call of 2026-10-17 over the void that natural height
  left (its footer on the Piano's last line); the Piano stretched to Per classe's bottom edge when the Piano is the
  shorter, the owner's call of 2026-11-12 (its footer on the column's last line, the space between its body and its
  footer) — the two tiles that grow beside a taller neighbour, both on this page».
- `Draft Release Temp.md`, § Improvements, the line «**Allocazione (computer)**» becomes: «- **Allocazione
  (computer)** — Improved the page's two columns: they now always end on one line — Per classe stretches to the
  bottom edge of the Piano when the Piano is the taller, and the Piano stretches to the bottom edge of Per classe
  when it is the shorter, its footer on the last line.»
- `CLAUDE.md` › «Latest» (the one bullet's opening rewritten, the «Open:» list kept), `doc/nove/README.md` § 6.

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
- Leggi DESIGN.md (The First-Screen Rule, Small-Screen Composition, The Tile Grid Rule: la frase
  «On Allocazione» cambia) e PRODUCT.md
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

Implementa la spec così com'è scritta: la classe tolta dalla cella del Piano, i due commenti
sopra la griglia, il test Playwright della § 6 in fondo a e2e/allocation.spec.ts, i documenti
della § 9 (guida, AGENTS.md, DESIGN.md prima/dopo, Draft, CLAUDE.md, README della serie). Il
test prova da sé che il Piano senza importo è il più basso (la guardia dei 32px sopra il piè):
fermati e chiedimi se quella guardia è rossa SENZA la mutazione, o se perf:budget, misurato prima e dopo sulla stessa macchina, supera un tetto di più di 1 KB gz (fino a 1 KB lo alzi tu, con raisedBy e una riga in velocita.md § Registro), o se nel confronto con develop dello stesso giorno, stessa build, si muove una voce di mobile:budget che la spec non nomina. Collaudo:
§ 7, la F sul mirror al mio «pronto». Un branch, un commit, solo dopo il mio OK con il
riassunto del diff. SESSION_NOTES.md non si committa.
```

Model: **Sonnet 5.5**, effort **medium** — an S spec in one area, one class and one E2E, every criterion closed by a
test. Estimated size: 1 short session, ~45 min; 1 line of markup, two comment clauses, ~35 lines of test, six document sentences.
