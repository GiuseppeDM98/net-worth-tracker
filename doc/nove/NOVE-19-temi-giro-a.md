# NOVE-19 — The costume, first pass: the shell, the portals, the controls, Panoramica, Patrimonio, Cashflow

> Series `doc/nove/` (README.md § 5): **depends on NOVE-11, 12 and 13** (the costume contract, NOVE-11 § 4.3, and
> its two themes) and comes after 08–10, 15 and 16, whose surfaces it dresses; **NOVE-20 is implemented after it** and
> reuses the portal mechanism and the four control properties defined here (§ 4.1-4.2, § 10). Written on 2026-11-12;
> every `file:line` is cited on `develop` @ b841cbd7. Executes decisions 3, 4 and 17 (README.md § 3) on the shell,
> the portalled primitives, the form primitives and three pages: Panoramica, Patrimonio, Cashflow's five tabs.

## 1. The problem today (evidence on the code)

After NOVE-11/12/13 the costume reaches what sits in the scope's DOM and wears NOVE-11's hooks. What it misses:

| # | Site (file:line @ b841cbd7) | What it shows under Egeo / Orbita |
| --- | --- | --- |
| 1 | `components/ui/popover.tsx:41-42`, `select.tsx:87-88`, `dropdown-menu.tsx:53-54`, `tooltip.tsx:40-41`, `sheet.tsx:28`/`:60`, `drawer.tsx:28`/`:69`, `dialog.tsx:59-61`, `alert-dialog.tsx:55-57` | each content renders through a Radix portal into `<body>`, outside `[data-costume-scope]`: no scope property reaches it. Under Orbita a select, a menu, a tooltip keep `rounded-md` = calc(0.25rem − 2px) = 2px (the palette block's `--radius`) beside 0px tiles; a primary button in a portalled popover or drawer has no glow (dark); an eyebrow inside has no costume face |
| 2 | `components/ui/responsive-modal.tsx:201`, `:234` (NOVE-11 § 4.4) | the only portalled surface NOVE-11 puts in scope. Drawers mounted directly — `period-picker.tsx:283`, `multi-select.tsx:1142`, `searchable-combobox.tsx:268` — and every `AlertDialog` stay outside |
| 3 | `components/ui/sidebar.tsx:189-211` | the phone-landscape sidebar is a `SheetContent` (portalled): its group labels lose the costume face the desktop sidebar has |
| 4 | `components/layout/Sidebar.tsx:170`, `:177`; `SecondaryMenuDrawer.tsx:129` | group labels `cn(TILE_EYEBROW_CLASS, '… text-sidebar-foreground/60')`: the caller's colour wins (NOVE-11 § 4.3), so the costume face is printed at 60 % of the sidebar's ink: **3,93:1** Egeo light, **4,12:1** Orbita light on `--sidebar` |
| 5 | `components/layout/BottomNavigation.tsx:130`, `:156`; `Sidebar.tsx:223`; `SecondaryMenuDrawer.tsx:263` | inactive pill labels `text-sidebar-foreground/55`: **3,41:1** Egeo light, **3,56:1** Orbita light; the account e-mail at `/50` lower still |
| 6 | `components/layout/Sidebar.tsx:128`; `app/dashboard/layout.tsx:56` | the wordmark, 13px Geist semibold: the one piece of chrome type the costume does not reach |
| 7 | `components/layout/BottomNavigation.tsx:62`, `:114`, `:127`, `:136`, `:153`, `:162` | the nav pill, its items, the active indicator and the «+» button `rounded-full`: under Orbita the only round shapes of a frame whose tiles are square |
| 8 | `components/layout/PageTabBar.tsx:96`, `:106` | the phone tab and its indicator `rounded-[6px]`: a literal, 6px under Orbita |
| 9 | `components/layout/ThemePicker.tsx:56`; `components/expenses/ExpenseTable.tsx:177` | `rounded` (Tailwind's 0.25rem, a literal) |
| 10 | `components/ui/sidebar.tsx:493`; `components/ui/multi-select.tsx:318` | `hsl(var(--sidebar-border))`, `hsl(var(--ring))` of `oklch` tokens: invalid in every theme. No caller reaches either (the only `SidebarMenuButton`s, `Sidebar.tsx:70`, `:202`, pass no `variant`; no `MultiSelect` receives a `ref`): no visual effect |
| 11 | `components/ui/switch.tsx:14`, `:26` | `dark:data-[state=checked]:bg-blue-600` (the debt of `DESIGN.md:405-407`): a blue ON track inside Egeo's navy-and-gold dark and Orbita's cyan dark; track and thumb `rounded-full` under Orbita |
| 12 | `components/ui/segmented-pill.tsx:104`, `:130`, `:141` | `rounded-full` container, options, indicator: the axis of Panoramica and Patrimonio (`components/dashboard/PeriodSelector.tsx`) and of Dividendi, round under Orbita |
| 13 | `components/ui/popover.tsx:48`; `app/globals.css:785` | the popover `rounded-xl` = `--radius` + 4px: 9px Egeo, 4px Orbita beside 4px / 0px tiles; the phone popper sheet `10px 10px 0 0`, fixed |
| 14 | `components/ui/choice-list.tsx:34` | `GROUP_CLASS … rounded-xl`: the same 9px / 4px (its pages, Compravendita and Consulente, are NOVE-20's; the primitive is here) |
| 15 | `components/dividends/DividendiDettaglio.tsx:68`; `ProvisionalCouponBanner.tsx:31` | two card-like boxes `rounded-xl` beside the tiles: 9px / 4px |
| 16 | `components/ui/composition-list.tsx:83`, `:85`; `composition-bar.tsx:85`, `:92`; `ranked-rows.tsx:86`, `:88`; `components/dashboard/overview/ObiettivoTile.tsx:40`, `:47`; `components/cashflow/budget/BudgetTrack.tsx:45`, `:47`, `:48`; `cost-centers/tiles/CentriTile.tsx:64`, `:65`, `:82`, `:83`; `SottocategorieTile.tsx:86`, `:87` | bar tracks and fills `rounded-full` (`rounded-l-full`/`rounded-r-full` at `composition-bar.tsx:92`, `BudgetTrack.tsx:48`): round ends under Orbita |
| 17 | `components/assets/AssetRow.tsx:78`, `:125`, `:138`, `:341`; `StrumentiTile.tsx:490`; `ExpenseTable.tsx:168`; `budget/BudgetImpostazioni.tsx:141` | pill chips (the class chip, the composite chip and its ring overlay, «Azzerato»/«Estinto», the type badge, the mono ceiling chips) `rounded-full` |
| 18 | `components/dashboard/overview/PatrimonioTile.tsx:116`, `:197`; `components/dividends/tiles/IncassoNettoTile.tsx:105`, `:126` (9px); `components/assets/tiles/MovimentiTile.tsx:95` (7px); `components/dividends/CalendarDayCell.tsx:81` (4px); `tiles/AffidabilitaTile.tsx:94` (3px) | literal chip radii: they follow neither theme |
| 19 | `app/dashboard/page.tsx:397`, `:510`; `app/dashboard/assets/page.tsx:606`, `:615`, `:665`; `components/cashflow/CashflowPageClient.tsx:261` | `PageHeader` without `emblem`: `resolveEmblem` falls back, so Egeo draws the temple on every page although decision 3 names «emblemi» |
| 20 | `app/globals.css:95` (inherited by Egeo light) | `--positive` `oklch(0.482 0.194 149.214)` on Egeo's darkest stripe `oklch(0.915 0.038 82)`: **4,38:1**. It is printed there: the verdict strip's sign-toned figures (`components/ui/verdict-strip.tsx`) sit on the ground. NOVE-12's K1 measures no sign token |
| 21 | `components/ui/tile-grid-skeleton.tsx:31` | the loading tile has `rounded-2xl` but no `data-tile`: no cap line (Egeo) or corner marks (Orbita) until the data arrives, then they pop in |

**Checked, no finding** (each looked at under both themes and both modes):

- Shell: the skip link `app/dashboard/layout.tsx:39-44` (`rounded-md` follows); the demo banner `:69-80` (warning
  trio); the phone header `components/layout/PageHeader.tsx:53` (`bg-background`, opaque by design over the ground);
  `TabletRail.tsx:18-19`, `:64` (`rounded-lg` follows; icons 5,26:1 or more); `SecondaryMenuDrawer.tsx:122` items at
  `/70` (5,26-8,35:1), `:148` backdrop, `:167` panel `rounded-t-2xl` (follows `--radius-2xl`), `:172` grip;
  `shellStyles.ts` avatar; «Vedi:» in `text-primary` 5,64-10,44:1 on `--sidebar`; `sidebar.tsx:256`, `:322-323`
  (floating and inset variants, not rendered).
- Controls that follow `--radius`: `button.tsx:8` and its sizes, `input.tsx:13`, `textarea.tsx:14`, `checkbox.tsx:17`,
  `select.tsx:60`/`:91-99`, `dropdown-menu.tsx:58`, `tooltip.tsx:45`, `badge.tsx:7`, `tabs.tsx`,
  `segmented-control.tsx:50`, `:60`, `aside-toggle.tsx:45`, `drill-breadcrumb.tsx:44`, `tile-method-note.tsx:33`,
  `error-notice.tsx:61`, `verdict-strip.tsx:60`, `page-rest.tsx:39`, `composition-list.tsx:116`, `ranked-rows.tsx:118`,
  `CompactExpenseRow.tsx:86`, `:97`, `TransactionFeed.tsx:77`, `:318`, `LiquiditaTile.tsx:62`, `MovimentiTile.tsx:84`,
  `PerCategoriaTile.tsx:99`, `:254`, `CenterChip.tsx:14`. `radio-group.tsx:31` stays round (a radio). Destructive
  button: white on `--destructive` 7,45 / 6,07:1 light, on `/60` over the card 5,48 / 5,87:1 dark.
- Shapes that stay round in every theme: dots (`ExpenseTable.tsx:185`, `PageTabBar.tsx:21`,
  `MobileFiltersDrawer.tsx:161`, `NetWorthSparkline.tsx:155`, `searchable-combobox.tsx:205`, `:358`), avatars,
  the grip, the ring. Legend swatches `rounded-[2px]` (DESIGN.md:1346) stay.
- Floating shadows (DESIGN → Float): `popover.tsx:48`, `select.tsx:91-99`, `dropdown-menu.tsx:58`,
  `BottomNavigation.tsx:33-37`, `:62`, `SavingsRateBadge.tsx:114`: kept in both themes.
- Charts on these pages are hand-written SVG on tokens (`FlowBarsChart.tsx:68-86`, `SpendingBarsChart.tsx:51-86`,
  `CenterStackBars.tsx:56-81`, `NetIncomeBars.tsx:76-109`, `histogram-bars.tsx:79-92`, `NetWorthSparkline.tsx:142-156`,
  `CASHFLOW_SERIES_COLOR` at `lib/constants/expenseTypeColors.ts:61`), no axis, grid or tooltip colour of their own;
  `chart-hover.tsx:50` is in the tile (not portalled) on `--popover`; `AssetSparkline.tsx:30`'s hexes are used only
  when no colour is passed; the `ExpenseTable` chart-slot badge is the declared exception of `expenseTypeColors.ts`.
  **The Sankey is not on these pages**: `lib/utils/cashflowSankey.ts:66-92` is rendered only by
  `components/cashflow/analisi/tiles/FlussoTile.tsx` (Analisi, NOVE-20).
- What 08-10, 15 and 16 add here: the ring (`components/ui/ring-chart.tsx`, NOVE-08 § 4) is round by nature,
  `strokeLinecap="butt"`, figures in `font-mono`, colours `var(--chart-N)` and `var(--muted-foreground)`, its legend
  `rounded-[2px]`: it needs nothing. Its homes on these pages (Composizione, Classi, Entrate; NOVE-09's Quota,
  Mutuo, Intestatari, Costo, Pagatori) add no other surface. NOVE-05 and NOVE-07 add sentences and rows only;
  NOVE-10, 15, 16 touch none of these pages.
- `SavingsRateBadge.tsx:119` `text-positive` on `bg-positive/10`: 6,18:1 after row 20's fix. `CalendarDayCell.tsx:68-69`
  insets on tokens. `TransactionFeed.tsx:553` (card branch) has no caller: `ExpenseTrackingTab.tsx:1086` passes
  `surface="flat"`. `TILE_SUB_EYEBROW_CLASS` (`tile.tsx:73-74`) carries digits («Ultimi {n} mesi»,
  `TettoTile.tsx:169`): it stays Geist (§ 3).

## 2. Goal and acceptance criteria

Inside the dashboard every surface of the shell and of three pages wears the theme's costume — what floats out of
the DOM included — with each figure in Geist Mono, every label ≥ 4,5:1, and the six palette themes unchanged.

1. In the dashboard the content of every `Popover`, `Select`, `DropdownMenu`, `Tooltip`, `Sheet`, `Drawer`, `Dialog`
   and `AlertDialog` carries `data-costume-scope`; on `/` and `/login` none does. **Proof**: R5; E1, E2.
2. Orbita light at 1440 on `/dashboard`: the account menu's `border-top-left-radius` is `0px`, the axis pill's
   container and indicator `0px`, the first `PatrimonioTile` chip `0px`, a «Come si calcola» popover `0px`. Egeo
   light: `3px`, a value > 1000px, `9px`, `4px`. **Proof**: E1.
3. Egeo light at 1440: the sidebar's «Analisi» label has a `font-family` starting with `Marcellus` and the same
   `color` as the first tile's `.tile-eyebrow`; the wordmark's `font-family` starts with `Marcellus`. Orbita: the
   wordmark's `text-transform` is `uppercase`. **Proof**: E1.
4. At 390: an inactive bottom-pill label has the computed colour of `--muted-foreground`; under Orbita the pill and
   the «+» are `0px`; the «Altro» section label is in the costume face; a «Come si calcola» popper sheet carries
   `data-costume-scope` and has `border-top-left-radius` `4px` (Egeo) / `0px` (Orbita). **Proof**: E2.
5. At 1024×768 a rail target is `5px` (Egeo) / `0px` (Orbita); at 768×1024 the Cashflow tab is `6px` / `0px`; no
   horizontal overflow at either. **Proof**: E3.
6. Egeo draws an amphora on Patrimonio, two waves on Cashflow (every tab), the temple on Panoramica; Orbita the
   planet on all three. **Proof**: R6; E1.
7. Every costume theme: the sign tokens ≥ 4,5:1 on every ground, card and muted surface; the eyebrow colour and
   `--muted-foreground` ≥ 4,5:1 on `--sidebar`; the dark ON track ≥ 3:1 on the card and under the thumb. **Proof**:
   K3, K4, K5 with § 4.6's numbers.
8. The twelve palette blocks render as their baseline, with five more probes recorded BEFORE any change. **Proof**:
   `e2e/theme.neutral{,.mobile}.spec.ts` (NOVE-11 E1), extended (§ 6).
9. No `hsl(var(--` remains in `components/`. **Proof**: T8.
10. `perf:budget` and `mobile:budget` do not move. **Proof**: the two runs.

## 3. Decisions

- **Owner (2026-11-12)**: 3 and 4 (each theme's costume, emblems for Egeo, one emblem for Orbita), 17 (the costume
  everywhere in the dashboard and its dialogs, never outside).
- **Adopted, reversible**:
  - a portalled primitive carries the scope attribute itself (§ 4.1); the dialog, drawer and sheet primitives get
    ONLY the attribute here, their frames are NOVE-20's; `ResponsiveModal`'s own spread stays (same value);
  - three radius roles (§ 4.2): a *frame* (a card-like box that is not a tile) takes the tile's radius in both themes;
    a *pill* (a pill control, a bar) and a *chip* (a literal-radius chip) keep today's shape in Egeo and are square
    in Orbita; dots, avatars, radios, grips and the ring stay round everywhere;
  - floating surfaces keep their Float shadow in both themes;
  - the shell's labels take the eyebrow's colour, its quiet text `--muted-foreground` (§ 4.3);
  - the wordmark wears the heading face at its own 13px;
  - `TILE_SUB_EYEBROW_CLASS` (9px) stays Geist: it carries digits and table heads;
  - the phone header stays opaque `bg-background` over the ground;
  - Egeo's per-page emblems on these three pages: Panoramica keeps the temple, Patrimonio an amphora, Cashflow two
    waves; Orbita keeps the planet everywhere (decision 4 says «emblema»);
  - in a dark costume theme the switch's ON track is `--primary`;
  - the toaster (`app/layout.tsx:116`, outside the dashboard layout) stays in the palette.
- **Overturned**: NOVE-12 § 3 «`--positive` is not declared» (2026-11-12): Egeo light declares
  `--positive: oklch(0.43 0.11 145)`, the mock's own green (row 20; 6,00:1 on the stripe). Egeo dark keeps the
  inherited value (8,50:1).

## 4. Solution

### 4.1 The portal mechanism — `contexts/CostumeScopeContext.tsx`

```tsx
/** What a portalled surface spreads on its content: the costume follows it out of the scope's DOM. */
export const COSTUME_SCOPE_PROPS = Object.freeze({ 'data-costume-scope': '' } as const);
const NO_SCOPE_PROPS = Object.freeze({});

/** The scope attribute inside the dashboard, nothing elsewhere (React context crosses the portal). */
export function useCostumeScopeProps(): Readonly<{ 'data-costume-scope'?: '' }> {
  return useCostumeScope() ? COSTUME_SCOPE_PROPS : NO_SCOPE_PROPS;
}
```

Each content element spreads it right after its `data-slot` (before `{...props}`): `const scopeProps =
useCostumeScopeProps();` then `{...scopeProps}` on `popover.tsx:42`, `select.tsx:88`, `dropdown-menu.tsx:54`,
`tooltip.tsx:41`, `sheet.tsx:60`, `drawer.tsx:69`, `dialog.tsx:61`, `alert-dialog.tsx:57`. `DropdownMenuSubContent`
(`:265`) is not portalled (it renders inside its parent's content) and has no caller: unchanged. A new portalled
primitive does the same (temi.md, § 9). The attribute is present in every theme inside the dashboard; only a
costume theme's gated rules and scope blocks read it, so a palette theme computes nothing new.

### 4.2 Four scope properties — an extension of `COSTUME_SCOPE_PROPERTIES` (18 → 22)

Appended in this order to `lib/constants/themeCostume.ts`'s list. Read ONLY through a `var()` whose fallback is the
site's value of today, so «off» is `initial` (guaranteed-invalid: the fallback applies).

| Property | Paints | Off | Egeo light | Egeo dark | Orbita light | Orbita dark |
| --- | --- | --- | --- | --- | --- | --- |
| `--costume-control-frame-radius` | a card-like box that is not a tile; the popper sheet's top corners | `initial` | `var(--radius-2xl)` (4px) | inherits | `var(--radius-2xl)` (0) | inherits |
| `--costume-control-pill-radius` | pill controls, bar tracks and fills, pill chips | `initial` | `initial` | inherits | `0px` | inherits |
| `--costume-control-chip-radius` | chips with a literal radius | `initial` | `initial` | inherits | `0px` | inherits |
| `--costume-control-switch-on` | the switch's ON track in dark | `initial` | `var(--primary)` | inherits | `var(--primary)` | inherits |

The four lines close the light scope blocks of NOVE-12 § 4.3 and NOVE-13 § 4.3, after `--costume-primary-glow`:

```css
  --costume-control-frame-radius: var(--radius-2xl);
  --costume-control-pill-radius: initial;   /* Orbita: 0px */
  --costume-control-chip-radius: initial;   /* Orbita: 0px */
  --costume-control-switch-on: var(--primary);
```

The classes — `lib/constants/themeCostume.ts`, beside the list:

```ts
/** `rounded-full` unless a costume squares its pills (temi.md § Il costume). Same computed value as today. */
export const COSTUME_PILL_RADIUS_CLASS = 'rounded-[var(--costume-control-pill-radius,calc(infinity*1px))]';
/** `rounded-xl` unless a costume gives a card-like box the tile's radius. */
export const COSTUME_FRAME_RADIUS_CLASS = 'rounded-[var(--costume-control-frame-radius,calc(var(--radius)_+_4px))]';
```

`calc(infinity*1px)` is Tailwind 4.3's `rounded-full`; `calc(var(--radius) + 4px)` is `--radius-xl`
(`app/globals.css:60`, inlined by `@theme inline`): a palette theme computes the same string as today.

### 4.3 Three hook rules — `app/globals.css`, «Theme costume» section, after NOVE-11's rules

```css
/* The shell's labels: the eyebrow's colour, not 60 % of the sidebar's ink (DESIGN.md → The Costume Rule). */
[data-costume] [data-costume-scope] .costume-shell-eyebrow { color: var(--costume-eyebrow-color); }
/* The shell's quiet text — inactive pill labels, the account e-mail — on the muted token; a hover keeps its ink. */
[data-costume] [data-costume-scope] .costume-shell-quiet:not(:hover) { color: var(--muted-foreground); }
/* The wordmark wears the heading face at its own size. */
[data-costume] [data-costume-scope] .costume-wordmark {
  font-family: var(--costume-heading-font); font-weight: var(--costume-heading-weight);
  letter-spacing: var(--costume-heading-tracking); text-transform: var(--costume-heading-case); font-synthesis: none;
}
```

No new property: they read NOVE-11's. No `--costume-shell-*` or `--costume-chart-*` property is needed: the shell's
fixes are colours of existing tokens, and the charts of these pages read tokens only (§ 1).

### 4.4 The sites

| Site @ b841cbd7 | Today | After |
| --- | --- | --- |
| `Sidebar.tsx:170`, `:177`; `SecondaryMenuDrawer.tsx:129` | `cn(TILE_EYEBROW_CLASS, '… text-sidebar-foreground/60')` | add `'costume-shell-eyebrow'` |
| `BottomNavigation.tsx:130`, `:156` | `'text-sidebar-foreground/55 hover:text-sidebar-foreground'` | add `costume-shell-quiet` to that branch |
| `Sidebar.tsx:223`; `SecondaryMenuDrawer.tsx:263` | `text-sidebar-foreground/50` | add `costume-shell-quiet` |
| `Sidebar.tsx:128`; `app/dashboard/layout.tsx:56` | the wordmark `<span>` | add `costume-wordmark` |
| `BottomNavigation.tsx:62`, `:114`, `:127`, `:136`, `:153`, `:162` | `rounded-full` | `COSTUME_PILL_RADIUS_CLASS` |
| `segmented-pill.tsx:104`, `:130`, `:141`; `switch.tsx:14`, `:26` | `rounded-full` | `COSTUME_PILL_RADIUS_CLASS` |
| §1 row 16 bars (all lines), §1 row 17 chips (all lines) | `rounded-full` | `COSTUME_PILL_RADIUS_CLASS` |
| `composition-bar.tsx:92` | `first:rounded-l-full last:rounded-r-full` | `first:rounded-l-[var(--costume-control-pill-radius,calc(infinity*1px))] last:rounded-r-[…same…]` |
| `BudgetTrack.tsx:48` | `rounded-r-full` | `rounded-r-[var(--costume-control-pill-radius,calc(infinity*1px))]` |
| `PatrimonioTile.tsx:116`, `:197`; `IncassoNettoTile.tsx:105`, `:126` | `rounded-[9px]` | `rounded-[var(--costume-control-chip-radius,9px)]` |
| `MovimentiTile.tsx:95` · `PageTabBar.tsx:96`, `:106` | `rounded-[7px]` · `rounded-[6px]` | `…chip-radius,7px)]` · `…chip-radius,6px)]` |
| `CalendarDayCell.tsx:81` · `AffidabilitaTile.tsx:94` | `rounded-[4px]` · `rounded-[3px]` | `…chip-radius,4px)]` · `…chip-radius,3px)]` |
| `ThemePicker.tsx:56`; `ExpenseTable.tsx:177` | `rounded` | `rounded-[var(--costume-control-chip-radius,0.25rem)]` |
| `popover.tsx:48`; `choice-list.tsx:34`; `DividendiDettaglio.tsx:68`; `ProvisionalCouponBanner.tsx:31` | `rounded-xl` | `COSTUME_FRAME_RADIUS_CLASS` |
| `app/globals.css:785` | `border-radius: 10px 10px 0 0;` | `border-radius: var(--costume-control-frame-radius, 10px) var(--costume-control-frame-radius, 10px) 0 0;` |
| `switch.tsx:14` | `dark:data-[state=checked]:bg-blue-600` | `dark:data-[state=checked]:bg-[var(--costume-control-switch-on,oklch(54.6%_0.245_262.881))]` |
| `tile-grid-skeleton.tsx:31` | `<div className="flex-1 rounded-2xl …">` | add `data-tile=""` |
| `sidebar.tsx:493` · `multi-select.tsx:318` | `hsl(var(--sidebar-border))`, `hsl(var(--sidebar-accent))` · `hsl(var(--ring))` | `var(--sidebar-border)`, `var(--sidebar-accent)` · `var(--ring)` |

`oklch(54.6% 0.245 262.881)` is `--color-blue-600` of `node_modules/tailwindcss/theme.css:136` (4.3.0), written as a
literal: once `bg-blue-600` leaves the codebase Tailwind stops emitting the variable. The switch comment `:12-13`
gains «a costume theme paints it `--primary` (`--costume-control-switch-on`)». `AssetRow.tsx:138` (the ring overlay)
takes the same class as its chip `:125`, so the ring follows the chip's ends.

### 4.5 The emblems — `lib/constants/themeCostume.ts`

```ts
const EGEO_AMPHORA: EmblemArt = {
  viewBox: '0 0 22 22',
  shapes: [{ kind: 'path', d: 'M8 2 H14 M9 2 V5 M13 2 V5 M9 5 C4 7 4 14 8 18 H14 C18 14 18 7 13 5 M9 20 H13 '
    + 'M10 18 V20 M12 18 V20 M9 3.5 C6 4 5.5 7 7 9 M13 3.5 C16 4 16.5 7 15 9', tone: 'ornament', strokeWidth: 1.6 }],
};
const EGEO_WAVES: EmblemArt = {
  viewBox: '0 0 22 22',
  shapes: [{ kind: 'path', d: 'M2 9 C4 6 6 6 7 9 C8 12 10 12 11 9 C12 6 14 6 15 9 C16 12 18 12 20 9 '
    + 'M2 15 C4 12 6 12 7 15 C8 18 10 18 11 15 C12 12 14 12 15 15 C16 18 18 18 20 15', tone: 'ornament',
    strokeWidth: 1.6 }],
};
// THEME_EMBLEMS.egeo becomes:
egeo: { fallback: EGEO_TEMPLE, pages: { patrimonio: EGEO_AMPHORA, cashflow: EGEO_WAVES } },
```

The pages pass `emblem`: `app/dashboard/page.tsx:397`, `:510` → `"panoramica"`; `app/dashboard/assets/page.tsx:606`,
`:615`, `:665` → `"patrimonio"`; `components/cashflow/CashflowPageClient.tsx:261` → `"cashflow"` (one header for the
five tabs). Panoramica's id is passed although it resolves to the fallback: a later art needs no page edit.

### 4.6 The measured numbers (WCAG ratios, the gates' arithmetic; the tests re-measure them)

| Pair | Egeo light | Egeo dark | Orbita light | Orbita dark |
| --- | --- | --- | --- | --- |
| sidebar label today: `--sidebar-foreground` 60 % on `--sidebar` | 3,93 | 6,28 | 4,12 | 6,31 |
| after: `--costume-eyebrow-color` on `--sidebar` | 5,95 | 9,82 | 5,46 | 10,57 |
| inactive pill label today: 55 % | 3,41 | 5,45 | 3,56 | 5,43 |
| after: `--muted-foreground` on `--sidebar` | 7,18 | 8,64 | 6,52 | 9,11 |
| `--positive` (inherited) on the darkest ground | **4,38** | 8,50 | 4,96 | 7,95 (nebula) |
| `--positive` (inherited) on `--muted` | 4,46 | 6,49 | 4,54 | 7,38 |
| `--destructive` on the darkest ground | 5,78 | 6,96 | 5,34 | 6,48 (nebula) |
| dark ON track `--primary` on `--card` · thumb `--background` on it | — | 8,75 · 9,83 | — | 9,58 · 10,44 |

Egeo light with `--positive: oklch(0.43 0.11 145)`: 6,00 on the stripe, 6,19 on `--background`, 7,19 on `--card`,
6,10 on `--muted`, 6,58 on `--sidebar`, 6,18 on its own 10 % chip over the card.

### 4.7 Strings

No new UI string.

## 5. Constraints and traps (AGENTS.md / DESIGN.md rules, «here it means that»)

- **The Costume Rule**: the amphora and the waves are `aria-hidden`, beside the label, never under text; nothing new
  moves. A palette theme never sees a new rule: every rule is gated, every property read with today's fallback.
- **The Mono Mandate**: the wordmark and the shell labels have no digits; the sub-eyebrows that do stay Geist. No
  rule here sets a `font-family` on a figure.
- **The Zero-Chroma Rule**: the default theme keeps its blue switch (the debt stays recorded); only a costume theme,
  whose chrome has hue by design, paints `--primary`.
- **`initial` is not «zero»**: a custom property set to `initial` is guaranteed-invalid — a `var()` with a fallback
  takes the fallback, a bare `var()` makes its declaration invalid (radius 0). So the four properties are read ONLY
  through the classes and the popper-sheet line of § 4.4, never bare in a gated rule.
- **An unlayered rule beats every utility**: `.costume-shell-quiet` excludes `:hover`, or the hover ink is lost.
- **tailwind-merge**: a caller's later `rounded-*` would replace the costume class; no caller at b841cbd7 passes one
  to `SegmentedPill`, `Switch`, `CompositionBar`, `CompositionList`, `RankedRows`, `BudgetTrack`, `PopoverContent` or
  `ChoiceList`.
- **The census reads `section.rounded-2xl[id]`**: no tile class changes; the skeleton is a `div`.
- **The token you author is not the token the browser returns**: the E2E compares computed strings; a pill's
  radius reads `3.35544e+07px`, so the specs assert «> 1000» after `parseFloat`.
- **A brand-new custom property reads `''` on a running dev server**: delete `.next/dev` before doubting the CSS.

## 6. Tests per level (with the mutation that proves each)

| # | Test | Mutation that turns it red |
| --- | --- | --- |
| T3 | `themeCostume.test.ts` (NOVE-11): each costume theme's light scope block declares the 22 properties | delete `--costume-control-chip-radius` from Orbita's block |
| T6 | same file: `COSTUME_PILL_RADIUS_CLASS` and `COSTUME_FRAME_RADIUS_CLASS` equal § 4.2's strings; `cn(COSTUME_PILL_RADIUS_CLASS, 'px-3')` keeps the class | fallback `9999px` |
| T7 | same file: in the nineteen files of § 4.4's pill and chip rows except `PageTabBar.tsx` and `ExpenseTable.tsx` (they keep a dot), no `rounded-full`, `rounded-l-full`, `rounded-r-full`, nor `rounded-[Npx]` with N ≠ 2 (at b841cbd7 the scan hits exactly the 41 lines § 4.4 changes) | `segmented-pill.tsx:141` back to `rounded-full` |
| T8 | same file: no file under `components/` contains `hsl(var(--` | restore `sidebar.tsx:493` |
| T9 | same file: `switch.tsx` contains `bg-[var(--costume-control-switch-on,oklch(54.6%_0.245_262.881))]` and no `blue-600` | `bg-[var(--costume-control-switch-on)]` |
| K3 | `themeCostumeContrast.test.ts` (NOVE-12, 13): `--positive` and `--destructive` ≥ 4,5 on K1's surfaces (each opaque ground colour, `--background`, `--card`, `--muted`) and on K2's composited nebula; the block's own value, else the inherited `:root` / `.dark` one | delete Egeo light's `--positive` (4,38) |
| K4 | same file: `--costume-eyebrow-color` and `--muted-foreground` ≥ 4,5 on `--sidebar`, light and dark | Egeo light `--sidebar` set to `oklch(0.62 0.05 87)` |
| K5 | same file, dark blocks: `--primary` ≥ 3 on `--card`; `--background` ≥ 3 on `--primary` | Orbita dark `--primary` set to its `--card` |
| R5 | `__tests__/costumePortals.test.tsx` (new): inside `<CostumeScope>`, an open `Popover`, `DropdownMenu`, `Tooltip` (in its provider), `Sheet`, `Dialog`, `AlertDialog`: each `[data-slot$="-content"]` has `data-costume-scope`; the same tree without `CostumeScope`: none. `Select` and `Drawer` are proved by E1/E2 (jsdom lacks their pointer and transform APIs) | drop the spread in `popover.tsx` |
| R6 | `CostumeScope.test.tsx` (NOVE-11/12): with `egeo` stored, `PageHeader emblem="patrimonio"` renders the amphora's `d`, `"cashflow"` the waves', `"panoramica"` the temple's; with `orbita`, `"patrimonio"` the planet's circle | `pages: {}` for Egeo |
| N1 | `e2e/themeNeutral.ts` (NOVE-11 E1) gains five probes: the sidebar label «Analisi» and the account menu's content after a click (desktop); an inactive bottom-pill label and the Cashflow phone tab (390); the axis pill's container and indicator and the first `PatrimonioTile` chip (both). The baseline is RE-RECORDED (`THEME_NEUTRAL_RECORD=1`) on the untouched code, then compared | `PageTabBar.tsx:96` fallback `8px` |
| E1 | `e2e/theme.costume.spec.ts` (new, desktop; theme by `addInitScript`): criteria 1-3 and 6 on `/dashboard`, `/dashboard/assets`, `/dashboard/cashflow?tab=tracking` (a filter `Select` opened) in Egeo and Orbita, light and dark; on `/` and `/login` no `[data-costume-scope]` | drop the spread in `select.tsx` |
| E2 | `e2e/theme.costume.mobile.spec.ts` (390): criterion 4; the period picker's drawer carries `data-costume-scope`; `scrollWidth ≤ innerWidth` | drop the spread in `drawer.tsx` |
| E3 | `e2e/theme.costume.tablet.spec.ts` (both tablet viewports): criterion 5 | `TabletRail` out of `CostumeScope` |

## 7. Guided verification (WORKFLOW.md § 2)

Expected outcome, declared first: in Egeo and Orbita the shell reads as part of the costume — the sidebar's labels
in the theme's face and colour, the wordmark engraved (Egeo) or in console capitals (Orbita), every menu, select,
tooltip and popover cut like the tiles; Orbita squares its pills, chips and bars, Egeo keeps them round; Patrimonio
shows an amphora and Cashflow two waves in Egeo; the six palette themes look exactly as before.

- **A**: `tsc`, lint, Vitest (three zones), the neutral E2E in compare mode, E1-E3,
  `npx playwright test e2e/shell.boot`.
- **B**: emulators + seed, the decoys «ornitorinco» (an asset) and «fenicottero» (a category): their names never
  enter an eyebrow face where a table cell prints them; the «ornitorinco» class chip squares under Orbita.
- **C (browser, the session)**: Panoramica, Patrimonio (Strumenti, Intestatari, a loan tile), the five Cashflow tabs,
  the account menu, a «Come si calcola» popover, a filter select, the period picker; Egeo and Orbita × light and dark
  × 1440, 1024×768, 768×1024, 390; screenshots in the scratchpad.
- **D (data)**: `document.querySelectorAll('[data-costume-scope]').length` is 1 on a page, 2 with a menu open;
  `getComputedStyle` of a sidebar label, the pill, a chip, the open menu under each theme.
- **E**: hover an inactive pill label (the ink returns); switch Orbita → Default from Aspetto with the menu open:
  the radii return without a reload; a dark Budget › Impostazioni switch turned on shows `--primary`, Default blue.
- **F (owner, at his «pronto»)**: the mirror in Egeo and Orbita, light and dark, on his own screens.
- **G**: `perf:budget`, `mobile:census` + `mobile:budget` (expected unchanged); remove decoys, fixtures, the mirror.

## 8. Putting it into service

One PR to `develop`, after NOVE-13's. No data change. Rolling back = reverting the PR: the attribute, the
properties and the classes go together; a palette theme never depended on them.

## 9. Documentation

- `doc/guide/temi.md` § Il costume, three paragraphs: **Portals** («a portalled primitive spreads
  `useCostumeScopeProps()` on its content; a new one does the same, or the costume stops at `<body>`»); **Three
  radii** (frame, pill, chip, § 4.2's table, the sites of § 4.4, what stays round); **The shell**
  (`.costume-shell-eyebrow`, `.costume-shell-quiet`, `.costume-wordmark`). § Per-theme measures: § 4.6's rows.
- `doc/guide/shell.md`: «in a costume theme the shell's labels take the eyebrow's colour and its quiet text
  `--muted-foreground` (temi.md § Il costume)». `doc/guide/dialog.md`: «the dialog, alert, drawer and sheet
  primitives carry `data-costume-scope` themselves».
- DESIGN.md:
  - `:405-407` BEFORE: «paints the dark ON state `bg-blue-600` (because `--primary` is near-white there and a white
    pill on a white track is invisible — the reason is real, the hue is still wrong).» AFTER: the same, then «A
    costume theme paints that track `--primary` (`--costume-control-switch-on`).»
  - `:938` BEFORE: «three route groups whose labels are the tiles' eyebrow (`TILE_EYEBROW_CLASS` +
    `text-sidebar-foreground/60`)». AFTER: «three route groups whose labels are the tiles' eyebrow
    (`TILE_EYEBROW_CLASS` + `text-sidebar-foreground/60`; in a costume theme the eyebrow's own colour,
    `.costume-shell-eyebrow`)».
  - `:940` BEFORE: «`border-radius: 9999px`, `--sidebar` background». AFTER: «`border-radius: 9999px` (0 in a
    costume theme that squares its pills — `--costume-control-pill-radius`), `--sidebar` background».
  - `:1257` BEFORE: «Bar height is exactly `3px` — an accent shape, not the primary data carrier.» AFTER: «Bar
    height is exactly `3px` — an accent shape, not the primary data carrier; its ends are round, square in a
    costume theme that squares its pills.»
  - The Costume Rule paragraph (added by NOVE-11 § 4.8 after `:359`), BEFORE: «The contract is in doc/guide/temi.md
    § Il costume.» AFTER: «A surface portalled out of the page (a menu, a popover, a sheet) wears it too. The
    contract is in doc/guide/temi.md § Il costume.»
- `doc/nove/README.md` § 7 «The costume»: `COSTUME_SCOPE_PROPS`, `useCostumeScopeProps()`, the 22 properties,
  `COSTUME_PILL_RADIUS_CLASS`, `COSTUME_FRAME_RADIUS_CLASS`, the three hook classes; § 6 status. `Draft Release
  Temp.md`: «Egeo e Orbita vestono anche la barra laterale, i menu, i selettori e i fumetti di Panoramica, Patrimonio
  e Cashflow».

## 10. Declared out of scope

- **Heir NOVE-20, with this spec's tools**: every dialog, drawer and sheet frame (`drawer.tsx:74`
  `rounded-t-[10px]` → `--costume-control-frame-radius` with fallback `10px`, as the popper sheet); `card.tsx:10` and
  `link-banner.tsx:41` `rounded-xl` → `COSTUME_FRAME_RADIUS_CLASS`; `components/allocation/ActionChip.tsx:37`
  `rounded-full` → `COSTUME_PILL_RADIUS_CLASS`; the Sankey's hexes; `UnderwaterDrawdownChart.tsx:102-109`; the
  `emblem` of the other pages' headers (Compravendita's `CompravenditaClient.tsx:68` passes `"patrimonio"`) and
  Egeo's art for them; every surface of Analisi, Rendimenti, Storico, Allocazione, Previdenza, FIRE, Hall of Fame,
  Assistente, Impostazioni. `ChoiceList`'s frame is done here; its pages are NOVE-20's.
- **The default theme's quiet labels** (`text-sidebar-foreground/55` reads 4,35:1 in default light): none, declared
  — a palette theme renders as today by contract; a palette contrast fix is not a costume spec.
- **The toaster, the landing's `ThemePicker`**: outside the scope, palette only (decision 17); none, declared.
- **`chip.tsx`** (no caller) and the unused sidebar variants: none, declared.

## 11. The prompt that implements it

```
Ciao, in questa sessione vorrei implementare la spec doc/nove/NOVE-19-temi-giro-a.md

Contesto, prima di toccare qualsiasi file (le regole del repo cambiano il modo di lavorare):
- Leggi WORKFLOW.md (regole di sessione e di collaudo; l'ultima sezione dice come si
  applicano in questo repo)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- CLAUDE.md (l'indice: che cos'è e dove sta ogni cosa, lo stato corrente) è già nel
  contesto: usalo per trovare la guida giusta
- Leggi la spec doc/nove/NOVE-19-temi-giro-a.md e l'indice della serie
  doc/nove/README.md (§ 3 decisioni, § 4 scelte adottate, § 7 contratti condivisi, § 8 regole)
- Leggi doc/guide/temi.md (§ Il costume), shell.md, dialog.md, panoramica.md, patrimonio.md,
  cashflow.md, e2e-playwright.md, velocita.md, prima-schermata.md PRIMA di scrivere codice
- Leggi DESIGN.md (The Costume Rule, The Mono Mandate, The Zero-Chroma Rule, The Float
  Threshold) e PRODUCT.md
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

Implementa la spec così com'è scritta, nell'ordine: le cinque sonde nuove della neutralità
e la linea di base RIREGISTRATA sul codice intatto; i test (T3, T6-T9, K3-K5, R5, R6) visti
rossi con la loro mutazione; il meccanismo dei portali nelle otto primitive; le quattro
proprietà e le due classi; le tre regole della shell; i siti di § 4.4, alla lettera; il
--positive di Egeo chiaro; gli emblemi e le pagine; le tre spec e2e. Nessun valore diverso
da quelli scritti. Fermati e chiedimi se: la linea di base dei dodici blocchi cambia dopo
le modifiche; un contrasto misura sotto § 4.6 oltre il secondo decimale; perf:budget o
mobile:budget si muovono (con la misura: nessun tetto si alza). Collaudo: § 7, la F al mio
«pronto». Un branch, un commit, solo dopo il mio OK con il riassunto del diff.
SESSION_NOTES.md non si committa.
```

Model: **Opus 5.5**, effort **medium** — an L spec that defines a shared contract NOVE-20 reads (the portal
mechanism, four scope properties, two classes) across eight primitives, the shell and three pages, with a
neutrality baseline to re-record. Estimated size: 1 session, ~5 h; ~60 lines of TS, ~25 of CSS, ~70 class edits,
~300 lines of tests, three E2E files.
