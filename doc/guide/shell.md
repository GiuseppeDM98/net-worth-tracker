# Shell

> **When to open this guide** — anyone touching `app/dashboard/layout.tsx` (the shell outside `ProtectedRoute`, `<main>` = `page-main`), `app/dashboard/template.tsx` (the fallback fade), `components/layout/*` (`Sidebar`, `BottomNavigation`, `SecondaryMenuDrawer`, `SceneLink`, `PageHeader`, `PageTabs`, `PageTabBar`, `PageContainer`), `lib/constants/navigation.ts` (the ONE source of the nav arrays), `lib/utils/viewTransition.ts` (the ONE `startViewTransition`), `lib/hooks/useSceneNavigation.ts` (the page scene), `components/ui/sidebar.tsx` (`SIDEBAR_WIDTH_ICON`, the icon rail), `lib/hooks/useMediaQuery.ts`, or adding a route to the nav, a tab bar to a page or a `view-transition-name` to anything. `AGENTS.md` keeps the stub in § Navigation (and the rest of § Motion); here is the full rule, the two page-scene bullets of § Motion included. Files: § *Files* below. Exercised by `e2e/shell.boot.spec.ts` (1440) and `e2e/shell.boot.mobile.spec.ts` (390), whose shared assertions live in `e2e/shellBoot.ts`.

## Files

Compiled on 2026-09-30, when § Navigation and two § Motion bullets moved here from `AGENTS.md`: only the files the
rules below name.

- **Layout and scene**: `app/dashboard/layout.tsx` (`<main>` = `page-main`), `app/dashboard/template.tsx`,
  `lib/hooks/useSceneNavigation.ts`, `lib/utils/viewTransition.ts`, `lib/utils/themeTransition.ts`, the `::view-transition-*` rules in `app/globals.css`, `next.config.ts`
- **Navigation**: `lib/constants/navigation.ts` (`assistantNavItem`), `components/layout/SceneLink.tsx`,
  `components/layout/{Sidebar,BottomNavigation,SecondaryMenuDrawer}.tsx` (`AppSidebar`, `NavItems`, `AddExpenseFab`),
  `components/layout/TabletRail.tsx` (a tablet in landscape, since 2026-10-16), the `tablet-landscape` custom variant
  in `app/globals.css`, `components/ui/sidebar.tsx` (`SIDEBAR_WIDTH_ICON`, `sidebarMenuButtonVariants`)
- **Page frame**: `components/layout/{PageHeader,PageTabs,PageTabBar,PageContainer}.tsx` (`PageHeaderSkeleton`,
  `pageTabPanelId`), `components/ProtectedRoute.tsx`, `contexts/AuthContext.tsx`, `lib/hooks/useMediaQuery.ts`,
  `components/ui/{tile,tile-grid-skeleton,skeleton,page-verdict}.tsx` (`TILE_EYEBROW_CLASS`); the «Crea snapshot»
  action in `app/dashboard/page.tsx`
- **Specs**: `e2e/shell.boot.spec.ts`, `e2e/shell.boot.mobile.spec.ts`, their helper `e2e/shellBoot.ts`;
  `e2e/cashflow.split.spec.ts` (a `PageTabs` panel's name)

## Navigation
- **The shell renders BEFORE Firebase Auth resolves** (2026-09-28): `app/dashboard/layout.tsx` keeps the
  skip link, `AppSidebar`, `<main>` and `BottomNavigation` OUTSIDE `ProtectedRoute`, which wraps only `{children}`
  inside `<main>` with the compact header's silhouette (`PageHeaderSkeleton`, no `h1`) and the generic
  `TileGridSkeleton` (labelled «Verifica dell'accesso») as its `fallback`, kept on screen through the redirect to
  `/login`; `main h1` therefore still means «the page has mounted». So every shell component runs on the server and
  hydrates: nothing in it reads `window`/`document` during render, `AppSidebar` and `SecondaryMenuDrawer` accept
  `user` null (the profile is two `Skeleton` lines on a 44px button, no layout shift when the name lands), the demo
  banner appears WITH the user, and `AuthContext` sets `user` and `loading` in the same commit with nothing awaited in
  front (the Firestore `displayName` fallback lands afterwards, doc/guide/accesso-registrazione.md).
  `npm run perf:budget`'s «testo» column reads that HTML: a dashboard route back at 0 has put the shell behind the
  gate again.
- **`useMediaQuery` is SSR-safe — `false` on the server and during hydration, the real value right after**
  (`useSyncExternalStore`, 2026-09-28). The shell's FIRST frame is therefore decided by CSS — the fixed sidebar is
  `hidden desktop:block`, the bottom nav `desktop:hidden`, the mobile Sheet mounts only when opened — never by that
  value; a component mounted AFTER login is not hydrating and still reads the real value on its first render.
  `e2e/shell.boot.spec.ts` and `shell.boot.mobile.spec.ts` assert the console carries no hydration message at 1440
  and 390, and that a stored theme is on `<html>` at the first frame (the `<head>` script, doc/guide/temi.md).
- **A `PageTabs` panel names ITSELF** (2026-09-21): `PageTabBar` renders plain buttons, not Radix
  `TabsTrigger`s, so every `TabsContent` was born with an `aria-labelledby` naming a trigger id that
  does not exist and had an EMPTY accessible name. A panel takes `id={pageTabPanelId(layoutId,
  value)}`, an `aria-label`, and `aria-labelledby={undefined}` to drop Radix's own; the tabs take
  `aria-controls` through `renderedPanels`, which a page with lazily mounted panels must pass — an
  `aria-controls` naming a panel that was never opened is the same dangling reference from the other
  end. Pinned by `e2e/cashflow.split.spec.ts`.
- **An inactive `PageTabs` panel keeps its `div`, not its CONTENT** (2026-09-22): Radix renders the panel (so its id
  and `aria-controls` survive) but unmounts the children, so a field of another tab is not in the DOM and a spec
  anchors on the OPENED panel (`#<layoutId>-panel-<tab> section`), never on a tile of a tab that is not showing.
  **Cashflow's panels are `forceMount`** (every visited tab stays mounted, hidden by `tabPanelSwitch`), so there a
  hidden tab IS in the DOM: since 2026-10-12 each tab's composition ids are prefixed (`trk-`, `bud-`, `cdc-`, `spl-`,
  `dvd-`), the memory is per tab, and the page passes `active` so the one `role="alert"` of `PageRest` is remounted
  for the tab that shows (doc/guide/cashflow.md § The tabs load their code on demand). A locator on a Cashflow
  phone spec scopes to the tabpanel by name (`getByRole('tabpanel', { name: 'Budget' })`) or counts only what is visible.
- **Single source for nav arrays**: `lib/constants/navigation.ts` — Sidebar, BottomNavigation and SecondaryMenuDrawer all
  import from it, never redeclare inline. **A route link in the shell is a `SceneLink`** (`components/layout/SceneLink.tsx`,
  a `next/link` whose plain left click runs the page scene — prefetch, modifier clicks, `target` and the caller's own
  `onClick` are untouched); a bare `<Link>` there navigates without the scene. **The assistant is `assistantNavItem`**,
  a route rendered by the same `NavItems` as the groups (gated by `NEXT_PUBLIC_ASSISTANT_AI_ENABLED` at render); there
  is no banner component to restyle.
- **The shell's label is the tiles' eyebrow**: sidebar group labels, the drawer's section labels and the compact
  `PageHeader` all use `TILE_EYEBROW_CLASS` (`components/ui/tile.tsx`) — on the sidebar surface with
  `text-sidebar-foreground/60`, because `text-muted-foreground` is tuned against `--background`, not `--sidebar`.
  Do not reintroduce a 12px label in the chrome (DESIGN.md → The One-Eyebrow Rule).
- **`PageHeader` has ONE variant, the compact one**: `variant="legacy"` was deleted on 2026-08-26 with Previdenza, the
  last page that declared it (DESIGN.md; the pre-redesign 30px title survives only in `git log`). The desktop title is
  `text-sm` and the phone navbar's `h1` 17px, so never put an icon sized for the old title inside it (FIRE's 32px flame
  was dropped, not shrunk). (Corrected on 2026-09-30: this bullet still described the default `compact` and the opt-out.)
- **Icon rail geometry lives in the primitive**: `SIDEBAR_WIDTH_ICON` (3.5rem) and the `group-data-[collapsible=icon]`
  size on `sidebarMenuButtonVariants` (`size-11!`, `p-3.5!`, `justify-center`) are what make every collapsed target
  44×44; `SidebarGroup`/`SidebarHeader`/`SidebarFooter` drop to `p-1.5` in icon mode for the same reason. A custom
  button in the rail (the collapse toggle) needs its own `group-data-[state=collapsed]:size-11`.
- **`PageHeader` mounts its `actions` — and its `h1` — TWICE** (desktop row, phone navbar): a `ref` on an action lands
  on whichever copy mounted last and `querySelector` finds the HIDDEN one first (width 0, 2026-09-18). Take the pressed
  node from `event.currentTarget` (`app/dashboard/page.tsx`, «Crea snapshot»); measure the copy with `offsetWidth > 0`;
  in a spec `main h1` is a strict-mode violation until it is `.filter({ visible: true })` (2026-09-28, `e2e/shellBoot.ts`).
- **`PageContainer`** is the 1920px root of a tile page (its only width since 2026-09-06); the loading state must use
  the same width or the page jumps when data lands (the Panoramica's skeleton was 1600 while the page was 1920). The
  loading state of a tile page is `TileGridSkeleton` with the page's own `cells` — never a per-page skeleton component.
- **A shell component that reads `useSearchParams` puts it in a child rendered inside `<Suspense>`** (`AddExpenseFab` in
  `BottomNavigation`): the layout is a `'use client'` component that is
  still prerendered — the shell is in the HTML since 2026-09-28 — and the hook bails static rendering out without a
  boundary. **A PAGE under `ProtectedRoute` needs no boundary** (verified 2026-10-08, Impostazioni reads
  `useSearchParams` at its root, Cashflow in `CashflowPageClient` (2026-11-11), under the same `ProtectedRoute`, and `/dashboard/settings` is in the prerender manifest): on the server `loading` is
  always true, so `ProtectedRoute` renders only its fallback and the page function never runs at prerender — the rule
  above is for what sits OUTSIDE it.
- **The `PageTabBar` pill's tabs are 44×44 since 2026-10-10** (`min-h-11 min-w-11 justify-center`, DESIGN.md →
  Segmented Pill Control; they measured 38×32 on touch until then): the pill grew from ~40 to 52px, so every tabbed surface
  of the first-screen budget moved ~12px (`perf/mobile-budget.json`, `raisedBy: "2026-10-10: pill a 44 px"`). `layout="size"`
  on the tab stays. `e2e/cashflow.mobile.spec.ts` holds the size of every visible tab.
- **The bottom nav's layout animations run only where it is visible** (2026-10-08): it stays mounted at every
  width (it is in the prerendered shell), but `layout` on the `motion.nav` and the active pill's `layoutId` follow
  `useMediaQuery('(max-width: 1439px) and (orientation: portrait)')` — the complement of its `desktop:hidden
  max-desktop:landscape:hidden` classes, `PILL_VISIBLE_QUERY` beside them. The `motion.nav` carries a `key` on that
  value: a `layout` turned on after mount never animates (the query is `true` only after hydration), and the pill used
  to JUMP aside when the «+» appeared. Pinned by `e2e/motion.layout{,.mobile}.spec.ts` (0 measures at 1440, a glide at
  390). In dev the page scene freezes rendering while the route compiles, so the glide is asserted without view
  transitions.
- **A tablet in landscape has the icon rail, not the bar** (2026-10-16, the landscape redesign, which left the landscape bar below to a phone alone; DESIGN.md → Navigation):
  `components/layout/TabletRail.tsx` is the 1440 sidebar's routes as a 56px rail on the left (`primaryNav`, `analysisNav`,
  `planningNav`, the Assistente behind its flag, Impostazioni at the foot), every target 44px, the current page marked (`aria-current="page"`, `--sidebar-accent`), the same landmark «Navigazione principale» as the phone's pill and first in the DOM — a tool that means one of them selects `nav[data-nav="rail"]` or `nav[data-nav="pill"]` (the census and eight E2E files read the rail by mistake on 2026-10-16: eleven red); its last button («Account e preferenze») calls `toggleSidebar`, which below
  1440 opens the sidebar's sheet — the account, the theme and the logout stay there. It shows by CSS alone through the
  **`tablet-landscape:` variant** (`app/globals.css`: `orientation: landscape` and 1000–1439px — a viewport condition, the
  shell has no container; declared after the core variants so it beats `max-desktop:landscape:` on the same property), so
  the prerendered shell paints it before hydration. With it, in landscape: the page header is the 1440 one-row header
  (`PageHeader`/`PageHeaderSkeleton`: the compact block `tablet-landscape:hidden`, the desktop row `tablet-landscape:flex`,
  and `tablet-landscape:static` — no sticky header over the stage), and `PageTabBar` (Cashflow, FIRE) is the 1440 underline
  bar with labels, its tabs `tablet-landscape:min-h-11`, in place of the centred icon pill. `main` keeps the whole 768px
  of a 1024×768 tablet (715 with the bar). The content keys its stage on its own width, not on this variant
  (`max-desktop:@[880px]:`, AGENTS.md § Tailwind Breakpoints, `lib/utils/tabletComposition.ts`). Held by `expectLandscapeShell`
  (`e2e/tabletLayout.ts`: the rail at x 0 and 56px wide, every target ≥ 44, one current page, `main` at top 0 with the
  viewport's height, no visible trigger).
- **The landscape bar is a PHONE turned sideways only** (since 2026-10-16; 53px with a 44px trigger since the landscape
  tablet's first implementation that day): below 1000px in landscape — where the bottom pill is hidden — `app/dashboard/layout.tsx`'s
  bar is `py-1` + `SidebarTrigger` at `size-11` (the primitive's default, `components/ui/sidebar.tsx`; it was `size-7`,
  28px under a thumb, with `py-2.5`: 49px) + `border-b`, and `tablet-landscape:hidden`. A phone loses 4px to it — no
  budget there (not one of the three viewports). Cashflow › Tracciamento's «Aggiungi» in the verdict's axis, the only add
  affordance in landscape (phone or tablet), is `h-11` (it was `h-9`; its container is `desktop:hidden`).
- **Sidebar active state for `/dashboard` must be `pathname === item.href`**, never `startsWith`. **Bottom nav is
  portrait-only**, so an in-page button duplicating the FAB must be hidden **only in portrait** — in landscape the FAB
  is gone and it is the only add affordance.

## The landscape stage

From AGENTS.md § Tailwind Breakpoints (moved 2026-10-19, when AGENTS.md passed its ~1000 lines). Since 2026-10-16; DESIGN.md → The First-Screen and Closed-Row Rules.

the tablet composition's
classes live in `lib/utils/tabletComposition.ts` alone, as literals (`__tests__/tabletComposition.test.ts` holds the rules
over its constants and the nineteen composed grids: the verdict's box `VERDICT_CELL_CLASS`, the 768 grid
`COMPACT_GRID_WRAPPER_CLASS`/`COMPACT_GRID_CLASS` with `WIDE_CELL_CLASS` placed by `layoutTabletSections`, «Il resto»
`REST_CELL_CLASS`, the scope aside yielding to the answer `ASIDE_YIELDS_TO_ANSWER_CLASS`, the measured heights through
`stageCustomProperties` and `leftStackSticks`). A page wraps its verdict and its grid in a NEW `div`
(`STAGE_WRAPPER_CLASS` = `@container`; never `PageContainer`, `container-type` would anchor a `fixed` descendant) around
`STAGE_CLASS`, with `useTabletStage()`'s ref; the verdict's box `data-stage="verdict"`, THE tile's cell
`data-stage="lead"`, «Il resto» and the rows inside ONE `INDEX_CLASS` box (a box of several rows inside it,
`INDEX_GROUP_CLASS`). Below a content box of 880px nothing moves (the wrapper and the grid are what they were, the index
`contents`); from it, below 1440, the grid turns `contents` and the stage is a `1fr | 360px` grid — the answer on the left,
sticky when it fits the screen (`data-stick`, measured), the index on the right at least as tall (`--left-h`); the heights
CSS cannot know are measured by the hook into custom properties. A grid composed in some states only takes THE tile's
cell through `leadCellClass(composed)` and the rest-less states `PLAIN_GRID_CLASS`, never a bare `LEAD_CELL_CLASS` — on a
plain grid its landscape classes still answer the stage's container and leave the right column empty (Obiettivi with no
goal, 2026-10-16). A page hands `useTabletComposition` the rows it RENDERS, in DOM order (768's pairing). The closed
rows ANSWER in the index (2026-10-16, DESIGN.md → The Closed-Row Rule): ONE pure `describe*ClosedAnswers` per page in
its narrative/summary module, given by context (`RowAnswers`, `components/ui/row-answers.tsx`) and read by `TileRowShell`
through `useRowAnswer` — never a prop through the
tiles, never on an open or failed row, `null` to keep the scope aside; each guide's § Composizione mobile lists them. **A tile that
can be a row lays out its inside by its CONTAINER, never by the viewport** (2026-10-16): in landscape every row opens in a
360px index, a phone's width at a tablet's viewport — a `tablet:` inside such a tile draws the wide layout in 320px
(Mutuo's KPIs, Coast's Afflussi timeline, Storico's Composizione legend: `@container` + `@[480|560px]:`; Analisi's Flusso
picks bar-and-rows by its cell width, `useElementWidth` < 608). **And a container on a row tile's own `section` answers
the page's queries too**: it becomes the nearest container of the trigger, so the index's `@[880px]:` answer measured the
360px row and stayed hidden (`BaseDiCalcoloTile`, 2026-10-16) — put `@container` on an inner box. Checked by opening every
row in landscape and at 768 on every surface and measuring each tile's right edge, not only `main`'s. **The SHELL keys
on a named viewport variant, the content on its container**: `tablet-landscape:` (`@custom-variant` in `app/globals.css`,
`orientation: landscape` and 1000–1439px) is for the shell only — the icon rail, the one-row header, the tab bars with
labels (doc/guide/shell.md § Navigation) — because the shell has no container; it is declared after the core variants so it
is emitted after `max-desktop:landscape:` and beats it on the same property. A composed page's content never uses it.

## Motion — the page scene and view transitions
- **Page transitions use `template.tsx`, NOT `layout.tsx` + `AnimatePresence`** (it re-mounts on every navigation);
  remove page-level `motion.div variants` wrappers once it is in place (compounded opacity: t²). **Since 2026-09-12 a
  click on a shell link is a page SCENE** — a native view transition (`lib/hooks/useSceneNavigation.ts` →
  `runViewTransition('page', …)`, whose DOM update resolves when `usePathname()` changes, with a 700 ms guard for a route
  the dev server is still compiling) — and `template.tsx` stands down for that mount (`<html data-vt="page">` read once in
  a `useState` initializer): two fades on one page compound. React 19.2 stable exports no `ViewTransition` and
  `next.config` enables no experimental flag; the native API is the whole mechanism, and a browser without it (Firefox)
  or a reader with reduced motion gets a plain `router.push` and the template's fade.
- **`lib/utils/viewTransition.ts` is the ONE entry to `document.startViewTransition`**, and it stamps `data-vt="theme"` or
  `data-vt="page"` on `<html>` for the length of the transition: every `::view-transition-*` rule in `globals.css` is
  scoped by that attribute. An unscoped `::view-transition-new(root)` rule runs on EVERY transition — the theme's
  circle-clip used to be global and would have clipped every navigation. **A `view-transition-name` must be unique among
  the RENDERED elements of a page**, or the browser skips the whole transition (the update still applies, silently):
  `page-verdict` lives on `PageVerdict` and on the skeleton's verdict block (never both mounted), `page-header` on
  `PageHeader`, `page-main` on the layout's `<main>`, `bottom-nav` on the phone pill's fixed container; a `forceMount`
  tab panel is `display: none` and does not count. Do not name the tile grid — several pages render more than one.
- **A named element leaves `root` for EVERY view transition, not only its own scene** (2026-10-08, found on the
  owner's tour; both defects dated from 2026-09-12). Two consequences, both pinned by `e2e/motion.layout{,.mobile}.spec.ts`
  and seen red: (1) the theme's circle is drawn on `::view-transition-new(root)`, so with the page scene's names on
  it revealed only the sidebar while the page cross-faded — `html[data-vt="theme"] *` switches every name off for the
  theme scene (`globals.css`; `data-vt` is stamped before `startViewTransition`); (2) a named region paints in a layer
  ABOVE `root`, so on a phone `page-main` covered the fixed bottom pill for the whole page scene (it faded under the
  figures and popped back at the end) — the pill's container has its own name, later in paint order than `<main>`,
  with no animation in the page scene. A new fixed piece of shell over `<main>` needs the same.

## Per-page blind spots

- **The collapsed 1440 sidebar's icon rail (`SIDEBAR_WIDTH_ICON`) has its 44px targets measured with a mouse**; no
  fixture covers a ≥1440px tablet in landscape. (The tablet's own `TabletRail`, 1000–1439, is held by `expectLandscapeShell`.)
  (moved from `CLAUDE.md` → Known Issues on 2026-10-07)

No shell-wide open item crosses every page any more: the `PageTabBar` pill reached 44×44 on 2026-10-10 (§ Navigation
above) and the `Switch` its 44×44 hit box on 2026-10-08, and the `CLAUDE.md` → Known Issues entry went with them.
