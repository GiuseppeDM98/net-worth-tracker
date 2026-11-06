# Motion — Framer, scenes, count-up, collapsibles

> **When to open this guide** — anyone touching `lib/utils/motionVariants.ts`, `components/providers/MotionProvider.tsx` (the ONE `MotionConfig`), `app/dashboard/template.tsx` and `lib/utils/viewTransition.ts` (page scenes), `lib/utils/useCountUp.ts`, a Framer `layout`/`layoutId`, an expand/collapse of any shape (`components/ui/tile.tsx` → `TileRowShell`, `lib/hooks/useMobileSections.ts`), an auto-dismiss timer, or `components/ui/skeleton.tsx`. The block moved here whole from `AGENTS.md` § Motion on 2026-11-06 (the file had passed its ~1000 lines); `AGENTS.md` keeps the stub under the same heading, and the React Compiler / `react-hooks` rules that were in the same block stayed there under § React Compiler and the hooks rules, because they hold for every component. The shell's own scenes (the theme scene, the named elements, the fixed shell over `<main>`) are doc/guide/shell.md § Motion; the Closed-Row Rule's sample page is doc/guide/hall-of-fame.md § Composizione mobile.

## Files

- **Motion**: `lib/utils/motionVariants.ts` (the shared variants), `components/providers/MotionProvider.tsx` (the ONE `<MotionConfig reducedMotion="user">`), `app/dashboard/template.tsx` + `lib/utils/viewTransition.ts` (page scenes, the ONE entry to `document.startViewTransition`), `lib/utils/useCountUp.ts`, `components/ui/tile.tsx` (`TileRowShell`, `TileCollapse`), `lib/hooks/useMobileSections.ts` (the controller of the composed rows), `components/ui/skeleton.tsx` (the ONE placeholder), `--ease-spring` in `app/globals.css`; tests `__tests__/mobileSections.test.ts`, `e2e/motion.layout.spec.ts`, `e2e/motion.layout.mobile.spec.ts`, `e2e/mobile-composition.hof.mobile.spec.ts`; the measure is `npm run perf:census` (doc/guide/velocita.md § Il census), never `LayoutCount`.

## Motion
- Shared variants live in `lib/utils/motionVariants.ts`; `useReducedMotion()` once per component, used inline, with ONE
  `<MotionConfig reducedMotion="user">` in `components/providers/MotionProvider.tsx` at the root layout (the nested
  copies went on 2026-09-28/29: a nested copy with the same value is inert) — no separate CSS media queries.
- **Page transitions use `template.tsx`, NOT `layout.tsx` + `AnimatePresence`**; since 2026-09-12 a shell-link click is
  a page SCENE through `lib/utils/viewTransition.ts`, the ONE entry to `document.startViewTransition`; a
  `view-transition-name` is unique among the RENDERED elements (never the tile grid), a named element leaves `root` for
  EVERY transition — the theme scene switches the names off, and fixed shell over `<main>` needs a name of its own
  (2026-10-08) → doc/guide/shell.md § Motion.
- `useCountUp` always with `once: true`, called **before** any early return and unconditionally for both branches of a
  mode switch (no `enabled`: gate the display in JSX); **a `fromPrevious` count-up passes `landFirstValue`**
  (2026-09-23), or a figure that settles between previews counts from «0 €». **`layout="position"`, not bare `layout`,
  when a Framer parent wraps a Radix `CollapsibleContent`.**
- **No `layout` on a page wrapper, and a `layout`/`layoutId` only where the element is VISIBLE** (2026-10-08): Framer
  measures a layout element before and after every commit that touches it, under `display: none` too (6
  `getBoundingClientRect` per navigation at 1440 on the hidden bottom nav, `e2e/motion.layout.spec.ts`); put `layout`
  on the element that moves and gate a hidden one on a `useMediaQuery` of where it shows. **Turning `layout` on after
  mount does not take** (the media query answers `true` only after hydration): remount with a `key` on the gate
  (`BottomNavigation`, `e2e/motion.layout.mobile.spec.ts`). The Panoramica's tile cascade plays once per session
  (doc/guide/panoramica.md). **The cost is React and Framer work, not browser layout** (census `nav`, 2026-10-08: −1
  `MeasureLayout` per change, CDP `LayoutCount` unmoved): a `layout` gate is judged by `perf:census`
  (`doc/guide/velocita.md` § Il census), never by `LayoutCount`. **No `LazyMotion`/`m` in place of `motion`** (decided
  2026-09-26, 33 files): `layout` and `AnimatePresence` want `domMax` anyway.
- **Collapsible technique, by content shape**: rows expanding into sub-rows → CSS `grid-rows-[0fr] → [1fr]` with an
  `overflow-hidden` child and `inert` on the closed wrapper (Framer + `height:'auto'` left rows stuck at opacity 0);
  tall or unpredictable sections → Radix `<Collapsible>` + CSS transition; small predictable content →
  `AnimatePresence` + `height:'auto'`. Always a chevron on an expandable row; `CollapsibleTrigger asChild` propagates
  `data-state`. **A closed TILE of the phone composition is `TileRowShell`** (`components/ui/tile.tsx`, 2026-10-10;
  the sample page is Hall of Fame, doc/guide/hall-of-fame.md § Composizione mobile; several composed tabs mounted together — Cashflow's five, `forceMount`, since 2026-10-12 — prefix every id, keep one memory per tab and remount `PageRest` with `active`, doc/guide/cashflow.md § The tabs load their code on demand): Radix `Collapsible` + `CollapsibleTrigger asChild` for the toggle but NEVER
  `CollapsibleContent` (it unmounts the children while closed, no closing transition) — the panel is our own
  `grid-rows-[0fr]↔[1fr]` with `motion-safe:transition-[grid-template-rows] motion-safe:duration-300
  motion-safe:ease-spring` (`--ease-spring`, the 400/35 spring sampled as `linear()` in globals.css), an
  `overflow-hidden min-h-0` child (a `0fr` track's child does not shrink below its min-content without `min-h-0`), the
  padding on the GRANDCHILD (on the child it stays visible at 0fr), `inert` while closed, no `role` (the `section` is
  the landmark), the content mounted on the first opening and kept (`TileCollapse.mounted`); the button's
  `aria-controls` is written AFTER Radix's spread or it names Radix's `contentId`. The controller is
  `useMobileSections` (`lib/hooks`): `collapse(id)` is the SAME object until that row changes (a cache settled during
  render, AGENTS.md § React Compiler and the hooks rules pattern 3) and its handlers hold no render value (they read the memory from the store at event time) —
  `npm run perf:census -- --mobile --scenario=hall-of-fame` is the measure. A page's `sections` and `defaultOpen` are
  MODULE-LEVEL constants (a literal array is a new identity every render: every handler reborn, every tile
  re-rendered); a strip cell names the row it opens from the controller's `sections.eyebrows` (2026-10-10, the spec's
  retirement: the strip does not know the rows, a missing id fell back to the cell's label); «Chiudi tutte» counts
  the rows open at LOAD as opened, so their content stays mounted (seen red the same day,
  `e2e/mobile-composition.hof.mobile.spec.ts`). **A page with tabs that UNMOUNT the inactive one** (FIRE, Radix
  `TabsContent`, since 2026-10-15) gives each tab its own controller and key (`tab:`), so a dismissed failed read reopens
  on the next visit and a returned-to tab reads `localStorage` alone; **a hook that reads on mount inside a closed row
  takes an `enabled` the page derives from `collapse(id)?.mounted`** (`usePortfolioExposure`, 2026-10-15): React Query
  fetches a key as soon as ONE observer is enabled, so unmounting the row's content is not enough.
- **An auto-dismiss timer lives in its OWN `useEffect([visible])`** — in an effect that also depends on data, a refetch
  cancels the timer and the badge sticks.
- **Loading skeleton over spinner** on any page investing in count-up and chart scheduling, `PageContainer` inside it
  or at the call site; verify it is wired (`tsc` does not catch an unused component); validate motion in a production
  build (mobile CPU is ~3-5× tighter). The skeleton is a WAIT, never a failure (→ `doc/guide/stati.md`). **Every
  looping animation carries `motion-safe:`** — Tailwind's `animate-pulse` does not, which is why the ONE placeholder
  is `components/ui/skeleton.tsx`; `animate-spin` is the deliberate exception (a spinner IS «in flight»). Less motion
  never removes CONTENT (the `SavingsRateBadge` entry in doc/guide/panoramica.md).

## Per-page blind spots

- **Blind spot** (looks like a bug, is not): a `layout` gate that answers `true` only after hydration never animates on the first paint — the media query is `false` on the server and during hydration, so the element is remounted with a `key` on the gate (`BottomNavigation`, `e2e/motion.layout.mobile.spec.ts`); a tile cascade that does not replay is the Panoramica's once-per-session rule (doc/guide/panoramica.md); a composed row that keeps its content mounted after «Chiudi tutte» was open at LOAD (`TileCollapse.mounted`, `e2e/mobile-composition.hof.mobile.spec.ts`); a spinner that keeps spinning under `prefers-reduced-motion` is the deliberate exception (`animate-spin`: a spinner IS «in flight»).
