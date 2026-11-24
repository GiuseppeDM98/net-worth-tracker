# Gerarchia, densità e divulgazione

> **When to open this guide** — anyone composing a tile page, a period selector, a cardified mobile view, a tile's footer or a grid of tiles of different heights, or touching `components/ui/{tile,tile-method-note,ranked-rows}.tsx` and the small-screen primitives (`lib/hooks/useMobileSections.ts`). The visual rules are DESIGN.md's; here are the implementation traps. Moved here whole from AGENTS.md § 4 on 2026-11-24; `AGENTS.md` § Hierarchy, Density and Disclosure keeps the stub. The accessibility half is doc/guide/accessibilita.md.

## Hierarchy, Density and Disclosure
> The visual rules themselves are DESIGN.md's; only the implementation traps live here.
- **Never give a "Custom" state a permanent slot in a period selector** (it looks disabled until active): a
  `rounded-full` chip below the selector only when active. A selector working across multiple return paths uses plain
  `<button role="tab">` + a module-level Framer `layoutId`, not shadcn `<Tabs>`.
- **A cardified mobile view needs its own reading note**: a matrix collapsing to per-row cards has no rows and columns,
  so split the help copy (`hidden desktop:block` / `desktop:hidden`) and label each card's axes explicitly.
- **Prefer rendering large local subtrees as pure render helpers or top-level components** — a nested JSX definition
  inside a page component means a simple row selection remounts the whole table (`cn` is NOT auto-imported in pages).
  **The worked example is Impostazioni** (2026-10-08): one 4100-line component with 70 `useState`s re-ran whole on every
  keystroke (286 components per key on one machine, compiler on — it cannot split a component); now an orchestrator
  under 500 lines holding ONE `useReducer` draft, each tab a module-level CONTROLLED view of its slice (`slice` in,
  `onChange(patch)` out, no form state of its own because Radix unmounts an inactive panel), so a keystroke re-renders
  that view and the page, never the other tabs (`npm run perf:census -- --scenario=settings,allocation`;
  doc/guide/impostazioni.md).
- **A radius on the element that carries a `divide-y` hairline bends the ends of the rule** (2026-09-18,
  `AssistantThreadList`): the `li` stays square, the hover/selected wash goes on an inner box.
- **A tile's footer is ONE line; the method goes behind «Come si calcola»** (`components/ui/tile-method-note.tsx`,
  2026-09-20): help printed on every tile at all times stops being read, and an 11px footnote at full tile width runs to
  95–130 characters a line (the detector's `line-length`); the line that stays says what the figures ARE, the trigger
  is named after its subject. **A list that must add up adds up ON SCREEN**: round every row to the printed unit and
  give the drift to the row that is a remainder by definition.
- **A tile stretched beside a taller neighbour is cured in the GRID, never in the tile** (2026-09-20, Rendimenti:
  moving eight method footers behind «Come si calcola» made the voids BIGGER, Benchmark ~170 → ~215px, Plusvalenze ~280
  → ~380px). Tiles share a row only with tiles of their own height; below that row two columns at natural height —
  wrappers `contents` below `desktop:`, `desktop:flex desktop:flex-col` from it — and the ONE element that can be any
  height (a chart, `desktop:flex-1`) takes the slack. **The declared exceptions are all on Allocazione**: Per classe (owner,
  2026-10-17) fills the grid's `1fr` row to the Piano's bottom edge, its footer on the Piano's last line, because
  the owner preferred the aligned edges to the void under it; the Piano (owner, 2026-11-12) stretches to Per
  classe's bottom edge when it is the shorter, its cell without `desktop:self-start` (doc/guide/allocazione.md); on Accumulo (owner, 2026-11-18) Portafoglio modello or Criteri del modello stretches to the other column's bottom edge (doc/guide/accumulo.md). **Keep ONE sequence: the DOM order is the reading order on every
  device**; the desktop places cells with `desktop:col-start-*`/`row-start-*`, never with an `order` swap (2026-09-27,
  DESIGN.md → The First-Screen Rule; Hall of Fame lost its `order-1…5` on 2026-10-10,
  `e2e/mobile-composition.hof.mobile.spec.ts` holds the DOM-equals-vertical order at 390 and 1440 and the `order-*`
  utilities in `main` at 0 — read from `classList` with `/^(?:[a-z-]+:)*order-/`, since `[class*="order-"]` matches
  every `border-*`, doc/guide/e2e-playwright.md). The Panoramica lost its `order-1…8` on 2026-10-11
  (`e2e/overview.{mobile.,}spec.ts`), the five Cashflow tabs theirs on 2026-10-12 (Budget, Centri, the centre's detail,
  Dividendi; `e2e/mobile-composition.cashflow.mobile.spec.ts`), Rendimenti its `order-1…8` on 2026-10-14
  (`e2e/mobile-composition.performance.degraded.mobile.spec.ts`), Analisi its `order-1…7` and Storico its `order-*` on
  2026-10-14 (`e2e/mobile-composition.{analisi,history}.mobile.spec.ts`), Allocazione, Previdenza and the five FIRE tabs
  theirs on 2026-10-15 (`e2e/allocation.mobile.spec.ts`; since 2026-10-16 `e2e/fire.mobile.spec.ts` for the Calcolatore and
  What If and `e2e/coast.mobile.spec.ts` for the Coast Ipotesi's four tiles — Modello now reads second on a phone, the DOM's
  order; each probe reads the `classList` AND the vertical order, seen red with an `order-*` put back): no composed grid
  carries `order-*` any more.
- **The small-screen composition is DESIGN.md's** (§ 5 → Small-Screen Composition: The First-Screen, Lifted-Figure,
  Closed-Row and Binding-Clause Rules, written 2026-10-17 when the series closed; what each page does with them, its guide
  § Composizione mobile). Three code traps, 2026-10-17: **a closed row's panel is EMPTY** until its first opening, so a spec opens
  the row before reading what is in it (`e2e/mobile-composition.hof.mobile.spec.ts`); **the memory (`mobile-sections:`) is
  written only by a gesture** — a row's trigger, «Apri tutte»/«Chiudi tutte», a strip cell (`createSectionHandler`,
  `setAll`, `reveal` in `lib/hooks/useMobileSections.ts`) — never by a default nor by a failed read opening itself: the
  gestures that write are held by the Hall of Fame spec, «a tab nobody touched writes nothing» by
  `e2e/mobile-composition.cashflow.mobile.spec.ts`, and «a failed read opening itself writes nothing» only by
  `createSectionHandler`'s structure (its auto-open is not in the written list; no test); **no `order-*`** in a composed
  grid (the bullet above). The primitives' own traps stay in doc/guide/motion.md (`TileRowShell`, the controller) and
  doc/guide/accessibilita.md § Accessibility (one live node).
- **A row's caption WRAPS, it is never truncated, and the label column never grows to make room for it** (2026-09-14,
  `RankedRows`): a cut fact is no fact («30 set · Asilo nido · in calendario»); at 4 grid columns 46% is the most the
  label can take beside the bar's 40px floor, the amount and the share (58% painted the share outside the tile,
  measured) — the caption takes a second line (`line-clamp-2`). Spese maggiori lays its rows `layout="stacked"` (owner,
  2026-11-15): the label beside the figures, the caption (category · subcategory · day) beside the bar on a line of its own.
