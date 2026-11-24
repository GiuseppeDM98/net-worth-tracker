# Accessibilità

> **When to open this guide** — anyone adding a button, a tab, a toggle, a live region, a data table, a two-click confirm, a list of same-kind controls or form error text, on any surface. Moved here whole from AGENTS.md § 4 on 2026-11-24; `AGENTS.md` § Accessibility keeps the stub. The posture is PRODUCT.md's; the hierarchy and disclosure traps are doc/guide/gerarchia.md.

## Accessibility
- **`title` is not an accessible name** (VoiceOver on iOS ignores it, touch never fires it): `aria-label` on icon-only
  buttons, a Radix `<Popover>` for information; a `title` added by a STATE CHANGE is never shown — put the consequence
  in visible copy.
- **Touch targets ≥ 44×44px**: `h-8 w-8` in dense lists, `h-10 w-10` for primary and destructive actions (shadcn
  `size="icon"` is 36px). **A control that must stay small grows its HIT BOX, not its paint**: the `Switch` is 36×20 on
  screen and 44×44 to the finger through a `before:absolute before:-inset-x-1 before:-inset-y-3` pseudo-element
  (2026-10-08); `boundingBox()` cannot see it, so a spec proves it by `elementFromPoint` (`e2e/fire.spec.ts`).
  **Actions hidden with `opacity-0` are unreachable on keyboard AND invisible on touch**: gate them behind
  `[@media(pointer:fine)]:`. **`desktop:h-7` is 28px — never a target**: copy `h-11 → desktop:h-8` (`AsideToggle` since
  2026-09-20; four Previdenza sites shipped 28px until 2026-09-13). A 1440px tablet in landscape reads the desktop
  layout by touch (doc/guide/shell.md § Per-page blind spots).
- **A non-interactive element with `onClick` needs `role="button"`, `tabIndex={0}`, `aria-label`, Enter/Space and a
  focus ring — better, a native `<button>`. But an `aria-label` on a `role="button"` REPLACES its contents**
  (2026-09-21, Allocazione's Per classe hid eight percentages): when the element's text is the information it IS the
  name, and the expand wording moves onto the chevron as `sr-only` text.
- **Tabs**: `role="tab"` + `aria-selected` in a named `role="tablist"`, `id` + `aria-controls` for a real panel. **A
  `SegmentedPill` that picks a VALUE the page reads (a year, a period) is `semantics="radio"`** — a tablist with no
  tabpanel is a promise the DOM cannot keep (2026-09-13 Previdenza and the Panoramica's period, 2026-09-14 Dividendi;
  the others stay `tabs` until reviewed); its inactive label is `text-foreground/70` (`text-muted-foreground` measured
  4,34:1 on `bg-muted`); an active state with no tab (a CUSTOM range) needs an `sr-only` `role="status"` description.
  **A toggle that shows a panel needs `aria-expanded` + `aria-haspopup`** and a document Escape handler inside
  `useEffect([isOpen])`. **`PageTabBar` tabs carry `aria-label={label}` unconditionally** (2026-08-22: icon-only below
  1440); pass `ariaLabel` to `PageTabs` so the tablist is named too.
- **A tile's `ariaLabel` is its visible eyebrow, year included** (`Anno fiscale 2026`; WCAG 2.5.3) — Playwright locates
  it with a regex.
- **`aria-live` regions**: streaming content `aria-live="polite" aria-atomic="false"` + `aria-label`. **Emptying a live
  region announces nothing** — a two-click confirm announces the *disarm* explicitly.
- **Data tables**: every `<thead>` `<th>` has `scope="col"`, row headers are `<th scope="row">`. **Calendar grids need
  explicit ARIA rows**: `role="grid"`, `role="row"` per week (slice the flat 42 cells), `role="columnheader"`,
  `role="gridcell"`.
- **Colour-swatch buttons**: never a hex nor a hue name — the **position**, `Colore ${i+1} di ${n}` + `aria-pressed`.
  **`<Button asChild>` inside `<Link>`**, never `<Button>` (it emits `<a><button>`).
- **Two-click confirm: no timer, and not `onBlur` alone** (a 3 s auto-disarm is a WCAG 2.2.1 time limit; Safari does
  not focus a tapped `<button>`): a document `pointerdown` with a `ref.contains(target)` guard, Escape, `onBlur`.
  **Disarm BEFORE delegating** (on failure nothing resets the flag). **Inside a modal Escape cannot be intercepted from
  the button** (2026-08-31): Radix's dismiss layer listens from the dialog's MOUNT, so `useArmedDelete` exports
  `hasArmedConfirm()` and `ResponsiveModal` calls `preventDefault()` in `onEscapeKeyDown`. **The armed button stays a
  compact «Conferma» and the ROW prints the consequence** (2026-09-13, `VersamentiTile`, `text-destructive`). **One
  live region per list, not per row** — and **one live node for a phone's failed reads** (2026-10-10,
  `components/ui/page-rest.tsx`): below `desktop:` every `ErrorNotice` row takes `live={!sections.compact}` and `PageRest` carries the ONE
  `role="alert"` with `describeFailedSections` («2 sezioni non sono state lette: Benchmark, Contributi.»), a stable
  `sr-only` node that changes text and empties; the header's `freshness` status stays.
- **A list of same-kind controls is ONE Tab stop** (`lib/hooks/useRovingFocus.ts`, 2026-09-20: 24 checkboxes put
  «Dettaglio» ~55 Tabs down Storico): `containerProps` on the wrapper, `itemProps(i)` on each control (`data-roving-item`,
  no ref), an `sr-only` hint the table is `aria-describedby`. **The dashboard's first Tab stop is «Vai al contenuto
  principale»** (`#page-main`, `tabIndex={-1}` on `<main>`) and **a tile's eyebrow is an `<h3>`** under the verdict's
  `<h2>` (`components/ui/tile.tsx`); a keyboard-walk spec presses Tab right after the load.
- **Form error text needs the sign token too**: `text-red-500` fails AA on a dialog and diverges from `--destructive` on
  the other themes (the last 76 retired 2026-08-31); a FORM-level failure belongs to the modal's reading line.
