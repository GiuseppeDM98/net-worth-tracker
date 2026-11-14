# NOVE-20 — The costume, round B: every dialog and the pages beyond the first three

> Series `doc/nove/` (README.md § 5): **depends on NOVE-11** (the contract, § 4.3), **NOVE-12/13** (the two themes)
> and **NOVE-19**, implemented just before it, whose tools it reuses with their names: the portal mechanism
> (`useCostumeScopeProps()`, NOVE-19 § 4.1, already spread on every dialog, drawer, sheet and alert content), the four
> control properties and `COSTUME_FRAME_RADIUS_CLASS` / `COSTUME_PILL_RADIUS_CLASS` (§ 4.2), the emblems of Panoramica, Patrimonio and Cashflow (§ 4.5), the E2E files
> `e2e/theme.costume{,.mobile,.tablet}.spec.ts` and `e2e/themeNeutral.ts`'s probes. It dresses NOVE-10's Analisi,
> NOVE-15's Assistente, NOVE-16/17/18's Accumulo and NOVE-21's hand-off (`ConsulenteHandoff.tsx`, a
> `ResponsiveModal`: frame and title by § 4.2; the applied book's link) as they leave them. Written on 2026-11-12; every `file:line` is
> cited on `develop` @ b841cbd7, the Accumulo code as `pr488:file:line` (`refs/tmp/pr488`, holding #486 and #487).
> Executes decisions 3, 4, 16, 17 and the adopted choice (a) (README.md § 3-4) on what NOVE-19 § 10 hands over;
> respects 14 (no resource bar on these pages).

## 1. The problem today (evidence on the code)

After NOVE-19 every portalled content carries `data-costume-scope`. What still misses the costume:

| # | Site (file:line @ b841cbd7) | What it shows under Egeo / Orbita |
| --- | --- | --- |
| 1 | `components/ui/responsive-modal.tsx:203`, `:247`; `:204-206`, `:248-250` | the eyebrow prints its string bare («Passo 1 di 2» draws its digits in the heading face); the title is Geist 20px with no hook |
| 2 | `components/ui/dialog.tsx:69`; NOVE-11 § 4.3 `[data-tile]:not([data-generated])` | the modal's `rounded-2xl` follows `--radius-2xl` but has no cap or marks; `data-tile` would replace the Float shadow with `--costume-tile-shadow: none` |
| 3 | `components/ui/drawer.tsx:74` | `rounded-t-[10px]`: a 10px sheet under 4px / 0px tiles (NOVE-19 § 10) |
| 4 | `components/ui/alert-dialog.tsx:64`, `:110-114`; `components/layout/LogoutDialog.tsx:30-31` | the logout confirm (from `Sidebar.tsx:297`, `SecondaryMenuDrawer.tsx:345`) is in scope after NOVE-19 but has no frame and a title without hook |
| 5 | `ConsulenteWizard.tsx:236`, `ConsulenteRun.tsx:119`, `ConsulenteBook.tsx:223`, `CompravenditaWizard.tsx:111`, `:133` | five scene cards on `TILE_SURFACE_CLASS` without `data-tile`: no cap, no marks |
| 6 | `ConsulenteWizard.tsx:91` (`HEADLINE_CLASS`, reused at `ConsulenteBook.tsx:238`), `ConsulenteInterviewScene.tsx:35`, `ConsulenteRun.tsx:121`, `CompravenditaWizard.tsx:40` | four headlines at the verdict's 24/30px in Geist beside a costumed verdict |
| 7 | `ConsulenteWizard.tsx:266-268`, `ConsulenteInterviewScene.tsx:94`, `CompravenditaWizard.tsx:134-136`, `ConsulenteBook.tsx:229` | eyebrows with digits printed as JSX, not through `HeadingText` |
| 8 | `app/globals.css:60` (`--radius-xl`); § 4.4's list | 36 `rounded-xl` boxes inside tiles and modals plus `card.tsx:10` and `link-banner.tsx:41` (NOVE-19 § 10) @ b841cbd7 (38), and Accumulo's two (`pr488:PlanDraftSidePanel.tsx:43`, `:64`): 40 — 9px Egeo, 4px Orbita, rounder than the tile |
| 9 | `components/allocation/ActionChip.tsx:37` and § 4.4b's sites | `rounded-full` bars, pills and pill chips, `rounded-[Npx]` chips on the nine pages and in the Accumulo code: round or literal under Orbita, while NOVE-19 squares the same roles on its three pages |
| 10 | `ComposizioneTile.tsx:65`, `EvoluzioneTile.tsx:110`, `ValoreStrumentoTile.tsx:90`, `StoricoDettaglio.tsx:74`, `LaborMetricsChart.tsx:34`, `FireDettaglio.tsx:53`, `RollingLineChart.tsx:19`, `AndamentoStoricoCharts.tsx:22`, `ConfrontoAnnualeCharts.tsx:23`, `EntityTrendChart.tsx:21`, `SavingsRateLineChart.tsx:65`, `components/goals/GoalProjectionChart.tsx:75` (10) | twelve Recharts tooltips `borderRadius` 8px / 10px literal (in the chart's DOM, so in scope): rounded under Orbita |
| 11 | `lib/utils/cashflowSankey.ts:66-92` | income, type, Budget, Risparmi hexes fixed; the ring (NOVE-10 ClassificaTile) and the phone flow (`SpendingTypesMobileFlow.tsx:44`, `:52`) paint the same types by token (`expenseTypeColors.ts:30-36`, `:61-64`): under a costume the Sankey disagrees with its neighbours |
| 12 | `components/performance/UnderwaterDrawdownChart.tsx:102-109`, `:140-142`, `:170` | the red is a `useState` seeded with the default's oklch, read once from `<html>` in a rAF (empty deps): wrong first frame, stale after a theme switch |
| 13 | `AssistantQuestionBlock.tsx:147-148`, `:159`; `ExpenseProposalCard.tsx:261-263`; `GoalProposalCard.tsx:212-216` | the AI eyebrow on `bg-muted/40` over the card: **4,48:1** Egeo light, **4,39** Egeo dark; `DESIGN.md:70-72` promises 4,5 there |
| 14 | `app/globals.css:854-858`; `ConsulenteBook.tsx:341-350` | the book prints with the costume's heading face (`.tile-eyebrow`, the verdict's `.costume-heading`) and its emblem (the scene card is `print:hidden`, `ConsulenteBook.tsx:217`; the sheet is `[data-book-print]`): decision 17 says never on paper |
| 15 | the `PageHeader` call sites of § 4.8 | no `emblem` id: Egeo draws the temple on nine pages while three have their own (NOVE-19 § 4.5) |

## 2. Goal and acceptance criteria

Every dialog, drawer and sheet of the dashboard is a costumed tile lifted off the page — the tile's corner, its cap
or marks, its face on the title, the Float shadow kept — and Analisi, Rendimenti, Storico, Allocazione (Accumulo,
Consulente), Previdenza, FIRE, Hall of Fame, Assistente and Impostazioni wear the costume to their last box. The six
palette themes render exactly as today.

1. Egeo light at 1440: «Nuova Spesa» has `border-top-left-radius: 4px`, a `background-image` holding a
   `linear-gradient`, the default run's `box-shadow` string, a title `font-family` starting `Marcellus`; Orbita `0px`,
   the title `uppercase` in `"Chakra Petch"`. **Proof**: E1.
2. At 390 that form is a drawer at 4px (Egeo) / 0px (Orbita) / 10px (default); at 1024×768 a dialog at 4px / 0px.
   **Proof**: E2, E3.
3. A figure in a modal's eyebrow or title, or a scene's eyebrow or headline, is `Geist Mono`. **Proof**: R1, E1, E4.
4. The logout confirm carries `data-costume-frame` and its title `costume-title`. **Proof**: R2.
5. The Consulente's and the Compravendita's scene cards are `[data-tile]`; the headline is the heading face at 34px
   (Egeo) / 28px (Orbita) at 1440; a generated book page keeps its AI border. **Proof**: R3, E4.
6. No `rounded-xl` is left in § 4.4's files; a sampled box reads 4px / 0px. Under Orbita every bar, pill and
   chip of § 4.4b reads `0px`; in Egeo and in the palette themes today's value. **Proof**: C2, C3, E4.
7. In Egeo the Analisi Sankey paints «Spese Necessarie» with `--chart-1`'s hex; in the default with `#3b82f6`.
   **Proof**: U1, E5.
8. The drawdown's red is `var(--destructive)` from the first frame and follows a theme switch. **Proof**: E6.
9. The AI eyebrow and `--warning-foreground` read ≥ 4,5:1 on every surface they land on, `--warning` (the
   banner's fill) included. **Proof**: K6, K7.
10. Egeo draws its own emblem on each of the nine pages; Orbita the planet. **Proof**: R4, E1.
11. Printing the book in Egeo prints Geist headings, no header band and no emblem. **Proof**: C1, E7.
12. `e2e/theme.neutral{,.mobile}.spec.ts` stay green with two more probes recorded BEFORE any change;
    `perf:budget` and `mobile:budget` do not move. **Proof**: N2, the runs.

## 3. Decisions

- **Owner (2026-11-12)**: 3 and 4 (each theme's costume; emblems for Egeo, one for Orbita), 14, 16 (DESIGN.md
  amendments as BEFORE/AFTER), 17 (the costume in the dashboard and its dialogs; never emails, PDF, landing,
  access), (a) (our names).
- **Adopted, reversible**:
  - the modal wears the tile's image layers through its own `data-costume-frame`, never `data-tile`: the Float
    shadow is the one thing a modal adds to a tile (DESIGN.md:262) and stays;
  - the modal's title takes the heading face (font, weight, tracking, case) at its own 20px — no costume size;
  - a `rounded-xl` box inside a tile or a modal is a *frame* in NOVE-19's sense (§ 4.2 there): 4px / 0px;
    `rounded-lg` and `rounded-md` boxes keep following `--radius`: 5px / 3px in Egeo (a `rounded-lg` box is 1px
    rounder than the 4px tile, accepted: NOVE-19's rail target is 5px too), 0px in Orbita;
  - the pills, bars and chips of the nine pages and of Accumulo take NOVE-19's roles (§ 4.4b): a bar, a pill
    control and a pill chip `COSTUME_PILL_RADIUS_CLASS`, a literal chip `--costume-control-chip-radius`, a
    literal-radius box inside a tile the frame; dots, spinners, avatars, count badges, numbered circles, colour
    swatches, round icon buttons, the radio, the grip, legend lines and `rounded-[2px]` swatches stay as they are;
  - a Recharts tooltip is a frame too; its shadow is a Float and stays (NOVE-19 § 3);
  - a scene headline is dressed whoever wrote it (the interview's `note` is a model's): a headline is a slot, the
    face is form; the book's markdown sub-headings (`ConsulenteBookPages.tsx:41-43`, 15px) are body and stay Geist;
  - under a costume the Sankey takes the theme's slots in the map of `EXPENSE_TYPE_COLOR_VAR` (fixed 1, variable 4,
    debt 3), Budget `--positive` (the income type's token; today's Budget green is the income green), Risparmi
    `--chart-2` (the phone's `CASHFLOW_SERIES_COLOR.income`), income categories slots 1-9 in turn; palette themes
    keep the hexes, as the comment at `cashflowSankey.ts:66-68` wants;
  - the AI-generated sub-tiles sit on `--costume-page-generated-fill`: the card in Egeo, today's fill in Orbita —
    the surface moves, the accent never does (The AI-Accent Rule);
  - a print resets every scope property to «off»: paper is the palette's, as an email is;
  - Egeo gets its own emblem on each of the nine pages (NOVE-19's precedent: a theme with «emblemi» draws one per
    page, else the temple would mean «Panoramica and the rest»); Orbita keeps the planet;
  - Compravendita passes `patrimonio` (NOVE-19 § 10), the Consulente `allocazione`, Impostazioni's headers one id.

## 4. Solution

### 4.1 The contract extended

`lib/constants/themeCostume.ts`: `COSTUME_SCOPE_PROPERTIES` gains a 23rd entry, `'--costume-page-generated-fill'`,
after NOVE-19's `'--costume-control-switch-on'`. Read only through a `var()` with today's fallback, so «off» is
`initial` (NOVE-19 § 4.2's convention):

| Property | Paints | Off | Egeo light | Egeo dark | Orbita light | Orbita dark |
| --- | --- | --- | --- | --- | --- | --- |
| `--costume-page-generated-fill` | the fill of an AI-generated sub-tile | `initial` | `var(--card)` | inherits | `initial` | inherits |

NOVE-12's and NOVE-13's light scope blocks close with the line (NOVE-11 T3 counts 23). Beside NOVE-19's classes:

```ts
/** `bg-muted/40` unless a costume needs the card for the AI accent's 4.5:1 (DESIGN.md → The AI-Accent Rule). */
export const COSTUME_GENERATED_FILL_CLASS =
  'bg-[color:var(--costume-page-generated-fill,color-mix(in_oklab,var(--muted)_40%,transparent))]';
```

The fallback is the `color-mix` Tailwind emits for `bg-muted/40`. The gated rules — `app/globals.css`, «Theme
costume», after NOVE-19's three:

```css
/* A modal is a tile lifted off the page: the tile's cap or marks, but its own Float shadow (DESIGN.md → The
   Modal-Is-A-Tile Rule). Not `data-tile`, whose shadow rule would take the Float away. */
[data-costume] [data-costume-scope][data-costume-frame] {
  background-image: var(--costume-tile-image); background-position: var(--costume-tile-image-position);
  background-size: var(--costume-tile-image-size); background-repeat: no-repeat; background-origin: border-box;
}
/* A modal's title: the heading face at the title's own size. */
[data-costume] [data-costume-scope] .costume-title {
  font-family: var(--costume-heading-font); font-weight: var(--costume-heading-weight);
  letter-spacing: var(--costume-heading-tracking); text-transform: var(--costume-heading-case); font-synthesis: none;
}
/* Paper is the palette's (decision 17): every scope property back to «off». */
@media print {
  [data-costume] [data-costume-scope] {
    --radius: inherit !important; --radius-2xl: 1rem !important;
    --costume-ground: var(--background) !important; --costume-ornament: var(--muted-foreground) !important;
    --costume-tile-image: none !important; --costume-tile-image-position: 0 0 !important;
    --costume-tile-image-size: auto !important;
    --costume-tile-shadow: 0 1px 3px 0 #0000001a, 0 1px 2px -1px #0000001a !important;
    --costume-heading-font: var(--font-geist-sans), system-ui, sans-serif !important;
    --costume-heading-weight: 600 !important; --costume-heading-tracking: -0.025em !important;
    --costume-heading-case: none !important; --costume-heading-size: 30px !important;
    --costume-eyebrow-color: var(--muted-foreground) !important; --costume-eyebrow-weight: 600 !important;
    --costume-header-band: none !important; --costume-header-band-height: 0px !important;
    --costume-primary-glow: none !important;
    --costume-control-frame-radius: initial !important; --costume-control-pill-radius: initial !important;
    --costume-control-chip-radius: initial !important; --costume-control-switch-on: initial !important;
    --costume-page-generated-fill: initial !important;
  }
}
```

`!important` on a custom property beats the theme's scope blocks at any specificity (`.dark[data-theme] […]` is
0,3,0); `--radius: inherit` hands back the palette block's value from `<html>`.

The emblem is React, the reset cannot reach it: `components/ui/theme-costume.tsx` `EmblemSvg`'s className gains
`print:hidden` (the book's `PageHeader`, `ConsulenteClient.tsx:81-91`, stays in `#page-main` on paper and would draw
Egeo's meander beside «Consulente»).

### 4.2 The primitives (after NOVE-19's spread at `dialog.tsx:61`, `drawer.tsx:69`, `alert-dialog.tsx:57`)

- `components/ui/dialog.tsx:69` (`DialogContent`): `data-costume-frame=""` beside `data-slot`; the class is unchanged
  (`rounded-2xl` follows `--radius-2xl`).
- `components/ui/drawer.tsx:74`: `data-costume-frame=""`; `rounded-t-[10px]` →
  `rounded-t-[var(--costume-control-frame-radius,10px)]` (NOVE-19 § 10, as its popper sheet). The handle stays round.
- `components/ui/alert-dialog.tsx:57`: `data-costume-frame=""`; `:113` `"costume-title text-lg font-semibold …"`;
  the surface comment `:61-63` gains «and its costume frame».
- `components/ui/responsive-modal.tsx`: `:203`, `:247` → `<p className={TILE_EYEBROW_CLASS}><HeadingText
  text={eyebrow} /></p>`; `:204`, `:248` → `className="costume-title text-[20px] font-semibold leading-[1.25]
  tracking-[-0.01em]"`, child `{typeof title === 'string' ? <HeadingText text={title} /> : title}`. One caller
  passes a node: `components/performance/AIAnalysisDialog.tsx:278-287`, the page's verdict and its tone dot; there
  the fragment's text becomes `<HeadingText text={verdict.headline.endsWith('.') ? verdict.headline.slice(0, -1) :
  verdict.headline} />`, the dot `<span>` unchanged, so its figures are `.costume-figure`. Its own scope spread (NOVE-11 `:201`, `:234`) stays (NOVE-19 § 3). The footer
  (`:262-267`): a token border, the primary glows by NOVE-11's rule — unchanged.
- `components/ui/sheet.tsx`: no frame — its one consumer is the sidebar's phone panel (`sidebar.tsx:191-209`), shell.

### 4.3 Scene cards and headlines

- `data-tile=""` on `ConsulenteWizard.tsx:236`, `ConsulenteRun.tsx:119`, `ConsulenteBook.tsx:223` (its
  `data-generated`, `:222`, keeps the AI border and glow through NOVE-11's `:not([data-generated])`),
  `CompravenditaWizard.tsx:111`, `:133`.
- `costume-heading` prepended to `HEADLINE_CLASS` at `ConsulenteWizard.tsx:91`, `ConsulenteInterviewScene.tsx:35`,
  `CompravenditaWizard.tsx:40`, and to the inline class at `ConsulenteRun.tsx:121`; their strings through
  `HeadingText`: `ConsulenteWizard.tsx:282` (the ternary's value), `ConsulenteInterviewScene.tsx:96` (`headline`),
  `ConsulenteRun.tsx:122`, `ConsulenteBook.tsx:238` (`page.title`), `CompravenditaWizard.tsx:114`, `:137`.
- Eyebrows with digits as one string: `ConsulenteWizard.tsx:266-268` →
  ``<HeadingText text={`Passo ${stepNumber} di ${ALLOCATION_ADVICE_STEPS.length} · ${copy.eyebrow}`} />``;
  `ConsulenteInterviewScene.tsx:94` → `<HeadingText text={INTERVIEW_COPY.eyebrow(roundNumber, …)} />`;
  `CompravenditaWizard.tsx:134-136` →
  ``<HeadingText text={`Passo ${position.index + 1} di ${position.total} · ${copy.eyebrow}`} />``;
  `ConsulenteBook.tsx:229` → `<HeadingText text={eyebrow} />` in both branches. Static eyebrows («Fatto»,
  «Consulente · in corso», «Dettaglio») print no figure and stay.
- `ConsulenteRun.tsx:74`: `first:rounded-t-xl last:rounded-b-xl` → `first:rounded-t-[inherit]
  last:rounded-b-[inherit]` (the list's corner, `:66`: identical in every palette theme).

### 4.4 The frames — `rounded-xl` → `COSTUME_FRAME_RADIUS_CLASS` (NOVE-19 § 4.2)

The list is the spec (`grep -rn "rounded-xl"` over `components app` @ b841cbd7 and pr488, NOVE-19's sites out);
a literal `className` becomes `cn(…, COSTUME_FRAME_RADIUS_CLASS)`:

- **Handed by NOVE-19 § 10**: `components/ui/card.tsx:10`, `components/ui/link-banner.tsx:41`.
- **Shared, in my surfaces**: `components/ui/question-card.tsx:95`.
- **Consulente**: `ConsulenteInterviewScene.tsx:47`, `ConsulenteRun.tsx:66`, `ConsulenteWizard.tsx:301`.
- **Compravendita**: `CompravenditaScreens.tsx:83`, `:267`, `:314`, `:393`, `:413`; `CompravenditaWizard.tsx:142`.
- **Assistente**: `AssistantComposer.tsx:88`, `:104`, `:117`; `AssistantConversazioneTile.tsx:155` and NOVE-15's
  suggestion Skeleton rows in the same file (`h-11 rounded-xl` → `cn('h-11', COSTUME_FRAME_RADIUS_CLASS)`: the only
  `rounded-xl` an earlier spec of the series adds, grep of `doc/nove/` on 2026-11-12);
  `AssistantQuestionBlock.tsx:147`, `:159`; `AssistantStreamingResponse.tsx:87`, `:208`, `:271`;
  `ExpenseProposalCard.tsx:261`; `GoalProposalCard.tsx:212`.
- **FIRE**: `components/fire-simulations/FireParametri.tsx:262`; `components/monte-carlo/tiles/ParametriTile.tsx:227`.
- **Dialogs**: `components/performance/AIAnalysisDialog.tsx:360`, `:440`; `components/DeleteDummyDataDialog.tsx:142`;
  `components/assets/AssetMovementsDialog.tsx:177`, `:231`, `:271`; `TaxCalculatorModal.tsx:267`;
  `TransactionDialog.tsx:772`; `components/expenses/ExpenseDialog.tsx:1046`, `:1142`, `:1379`;
  `CategoryManagementDialog.tsx:341`, `:409`.
- **Accumulo**: `pr488:components/allocation/PlanDraftSidePanel.tsx:43`, `:64`.

Also: the twelve tooltips of § 1 row 10 — `GoalProjectionChart.tsx:75` `borderRadius: 10` →
`'var(--costume-control-frame-radius, 10px)'`, the other eleven `borderRadius: '8px'` / `8` →
`'var(--costume-control-frame-radius, 8px)'`; the four AI sub-tiles
(`AssistantQuestionBlock.tsx:147`, `:159`, `ExpenseProposalCard.tsx:261`, `GoalProposalCard.tsx:212`) `bg-muted/40`
→ `COSTUME_GENERATED_FILL_CLASS`. No caller passes a later `rounded-*` or `bg-*` to these elements (tailwind-merge).

### 4.4b Pills, bars and chips — NOVE-19's roles on the nine pages and Accumulo

`rounded-full` → `COSTUME_PILL_RADIUS_CLASS` (bars: track and fill; pills; pill chips):

- **Rendimenti**: `performance/tiles/AttribuzioneTile.tsx:85`, `:87`; `PlusvalenzeTile.tsx:51`, `:53`;
  `performance/PerformancePeriodPicker.tsx:74`; `app/dashboard/performance/page.tsx:770` (the toolbar skeleton).
- **Storico**: `history/tiles/DriverTile.tsx:139`; `RaddoppiTile.tsx:100`, `:108`.
- **Analisi**: `cashflow/ConfrontoAnnualeSection.tsx:123`, `:126`.
- **Allocazione and Accumulo**: `ActionChip.tsx:37`; `pr488:` `TargetTick.tsx:70`, `:72` (`:50`, `:52` @ b841cbd7);
  `tiles/EsposizioneTile.tsx:92`; `AccumulationPlanDialog.tsx:1455`; `OptimizerReport.tsx:108`, `:126`, `:128`;
  `tiles/PortafoglioModelloTile.tsx:222`, `:229`, `:230`; `tiles/QuestoMeseTile.tsx:828`;
  `tiles/accumuloShared.tsx:37` (`CHIP_BASE`).
- **Previdenza**: `pension/tiles/AnnoFiscaleTile.tsx:89`, `:96`.
- **FIRE**: `fire-simulations/tiles/TraguardoTile.tsx:93`, `:102`; `coast/tiles/CoastTraguardoTile.tsx:73`, `:82`;
  `monte-carlo/tiles/ScenariConfrontoTile.tsx:60`, `:61`; `goals/tiles/ObiettiviTile.tsx:73`, `:80`.
- **Hall of Fame**: `hall-of-fame/RecordRows.tsx:119`, `:121`.
- **Assistente**: `assistant/GoalProposalCard.tsx:227`.
- **Impostazioni**: `settings/tabs/GeneraleTab.tsx:440`; `AllocazioneTab.tsx:111`; `AspettoTab.tsx:157`, `:161`;
  `app/dashboard/settings/page.tsx:352`.
- **Dialogs**: `assets/AssetMovementsDialog.tsx:491`, `:503`; `expenses/ExpenseDialog.tsx:1009`.

`rounded-[Npx]` → `rounded-[var(--costume-control-chip-radius,Npx)]` (N kept): `rounded-[9px]` at
`performance/tiles/RendimentoTile.tsx:81`, `history/tiles/EvoluzioneTile.tsx:74`, `pension/tiles/FondoOggiTile.tsx:74`,
`fire-simulations/tiles/TraguardoTile.tsx:86`, `coast/tiles/CoastTraguardoTile.tsx:66`,
`monte-carlo/tiles/ProbabilitaTile.tsx:31`, `goals/tiles/TraiettoriaTile.tsx:45`,
`assistant/tiles/PatrimonioContestoTile.tsx:58`; `rounded-[3px]` at `performance/MonthlyReturnsHeatmap.tsx:77`.

`rounded-[10px]` → `rounded-[var(--costume-control-frame-radius,10px)]` (a box inside a tile: the frame):
`settings/tabs/AspettoTab.tsx:149`; `pr488:` `ObiettiviDialog.tsx:164`, `tiles/ObiettiviTile.tsx:104`,
`tiles/PianoTile.tsx:223`.

They stay as they are (each read on the code): the dots (`goals/tiles/ObiettiviTile.tsx:64`,
`settings/page.tsx:458`, `EvoluzioneTile.tsx:215`, `AspettoTab.tsx:167`, `CompactExpenseRow.tsx:89`, `:100`,
`TransactionFeed.tsx:73`, `GoalsDettaglio.tsx:80`, `AssegnazioniTile.tsx:63`, `:96`, `MilestoneTile.tsx:47`, `:52`,
`CoastIpotesi.tsx:126`, `FireParametri.tsx:122`, `AfflussiTile.tsx:58`, `UnderwaterDrawdownChart.tsx:37`,
`SpeseTab.tsx:133`, `:137`, the category dots of `CategoryDeleteConfirmDialog.tsx:421`, `CategoryMoveDialog.tsx:332`,
`:355`), the knob `pr488:TargetTick.tsx:91`, the spinners (`GeneraleTab.tsx:711`, `RendimentoTile.tsx:148`), the count
badge (`MobileFiltersDrawer.tsx:161`; the Assistente's `CountDot` is gone with NOVE-15), the numbered circles (`CoastDettaglio.tsx:91`,
`CondivisioneTab.tsx:38`), the colour swatches (`CostCenterDialog.tsx:231`, `:245`, `:254`,
`CategoryManagementDialog.tsx:379`, `GoalFormDialog.tsx:310`), the round icon buttons
(`PerformancePeriodPicker.tsx:83`, `FireParametri.tsx:147`, `PerformanceDettaglio.tsx:159`), the 2px legend lines
(`PrimaDopoTile.tsx:46`, `:50`), every `rounded-[2px]` swatch.

### 4.5 The Sankey under a costume

`lib/constants/sankeyCostumeColors.ts` (new, no imports):

```ts
/** The theme tokens a costumed Sankey reads as hex (Nivo takes no CSS colour: doc/guide/grafici.md). */
export const SANKEY_COSTUME_TOKEN = {
  slot1: '--chart-1', slot2: '--chart-2', slot3: '--chart-3', slot4: '--chart-4', slot5: '--chart-5',
  slot6: '--chart-6', slot7: '--chart-7', slot8: '--chart-8', slot9: '--chart-9', positive: '--positive',
} as const;
export type SankeyCostumeKey = keyof typeof SANKEY_COSTUME_TOKEN;
```

`lib/utils/themePalette.ts:50`: `THEME_HEX_TOKENS = [...Object.values(SPENDING_ROLE_TOKEN),
...Object.values(SANKEY_COSTUME_TOKEN)]` — `ChartColorsProvider` reads ten more tokens once per theme.

`lib/utils/cashflowSankey.ts`, after `:92`:

```ts
/** The colours a type flow paints with: today's hexes, or a costume's slots. */
export interface SankeyTypePalette {
  types: Record<SpendingExpenseType, string>;
  income: readonly string[];
  budget: string;
  savings: string;
}
export const DEFAULT_SANKEY_TYPE_PALETTE: SankeyTypePalette = {
  types: { fixed: TYPE_COLORS.fixed, variable: TYPE_COLORS.variable, debt: TYPE_COLORS.debt },
  income: COLORS, budget: BUDGET_NODE_COLOR, savings: SAVINGS_NODE_COLOR,
};
/** A costume paints the types as every other chart of the page does (EXPENSE_TYPE_COLOR_VAR). */
export function costumeSankeyPalette(hex: Record<SankeyCostumeKey, string>): SankeyTypePalette {
  return {
    types: { fixed: hex.slot1, variable: hex.slot4, debt: hex.slot3 },
    income: [hex.slot1, hex.slot2, hex.slot3, hex.slot4, hex.slot5, hex.slot6, hex.slot7, hex.slot8, hex.slot9],
    budget: hex.positive, savings: hex.slot2,
  };
}
```

`buildBudgetFlow(expenses, options, palette = DEFAULT_SANKEY_TYPE_PALETTE)`: `:485` `palette.income[position %
palette.income.length]`, `:495` `palette.budget`, `:503`, `:507` `palette.types[type]`, `:565` `palette.savings`;
`buildBudgetFlowData(expenses, palette?)` and `…WithSubcategories(expenses, palette?)` pass it.
`buildSpendingRolesFlow(…, options, typePalette = DEFAULT_SANKEY_TYPE_PALETTE)`: `:833` `typePalette.income[…]`,
`:849` `typePalette.budget`; the role builders (`:913`, `:922`) take `typePalette?` last. `buildTypeDrillDownData`
is unchanged: a drill takes the clicked node's colour.

`components/cashflow/analisi/tiles/FlussoTile.tsx`, beside `:165`:

```tsx
const costumed = useThemeCostume() !== null;
const slotHex = useCssColorTokens(SANKEY_COSTUME_TOKEN, SANKEY_COSTUME_FALLBACK, costumed && !isMobile);
const typePalette = useMemo(() => (costumed ? costumeSankeyPalette(slotHex) : DEFAULT_SANKEY_TYPE_PALETTE),
  [costumed, slotHex]);
```

`FlussoTile.tsx`, module level: `const SANKEY_COSTUME_FALLBACK: Record<SankeyCostumeKey, string> = { slot1:
COLORS[0], slot2: COLORS[1], slot3: COLORS[2], slot4: COLORS[3], slot5: COLORS[4], slot6: COLORS[5], slot7:
COLORS[6], slot8: COLORS[7], slot9: COLORS[8], positive: '#10b981' };` (`COLORS` exported from and imported from
`@/lib/utils/cashflowSankey`). `plainView`
(`:169-175`) passes `typePalette` to the two budget builders and lists it in its deps; `rolesView` (`:178-183`)
passes it last. Outside a costume `typePalette` is the module constant: no memo rebuilds.

The comments follow: `cashflowSankey.ts:66-68` «…stable across the palette themes; a costume theme paints the types
with its slots (`costumeSankeyPalette`)»; `:82` «Theme-independent in the palette themes, see COLORS»; `:640-642`
«Income and Budget keep the type view's colours (the costume's slots under a costume)»;
`lib/hooks/useCssColorTokens.ts:24` «Used by: FlussoTile (the role colours and, under a costume, the type flow's
slots)».

### 4.6 The drawdown's red

`UnderwaterDrawdownChart.tsx`: `:102-109` (the state and the effect) go; `:140-142` `stopColor="var(--destructive)"`;
`:170` `stroke="var(--destructive)"` — the file already passes `stroke="var(--border)"` to Recharts. The unused
React imports go.

### 4.7 Contrast — `__tests__/themeCostumeContrast.test.ts` (NOVE-12 K1 and K3, NOVE-19 K4-K5) gains K6, K7

Measured with the test's oklch → sRGB (alpha composited in sRGB over the card); the sign tokens are NOVE-12's K3:

| Theme · mode | `--warning-foreground` worst surface | AI accent on `--card` | on the generated fill | on `bg-muted/40` today |
| --- | --- | --- | --- | --- |
| Egeo light | 5,44 (stripe) | 4,78 | 4,78 (card) | 4,48 |
| Egeo dark | 8,98 (muted) | 4,65 | 4,65 (card) | 4,39 |
| Orbita light | 5,63 (muted) | 4,99 | 4,63 | 4,63 |
| Orbita dark | 10,21 (muted) | 5,23 | 4,97 | 4,97 |

`--warning-foreground` on `--warning` (the banner's fill; the two themes share the trio): 6,72 light, 9,94 dark.

No AI text lands on plain `--muted` (4,05 / 3,99 / 4,13 / 4,53): every `AI_GENERATED_EYEBROW_CLASS` use sits on the
card or on a generated sub-tile (checked, `ConsulenteRevisionTile.tsx:119` on the card).

### 4.8 Emblems

`lib/constants/themeCostume.ts`, beside NOVE-19's `EGEO_AMPHORA` / `EGEO_WAVES`, every one `viewBox: '0 0 22 22'`,
`tone: 'ornament'`, `strokeWidth: 1.6`:

| Constant | Page id | Shapes |
| --- | --- | --- |
| `EGEO_BALANCE` | `analisi` | path `M11 3 V19 M7 19 H15 M4 6 H18 M4 6 L2 12 H6 Z M18 6 L16 12 H20 Z` |
| `EGEO_LAUREL` | `rendimenti` | path `M6 19 C9 15 11 10 12 3 M9 15 C7 15 5 13 5 11 C7 11 9 13 9 15 M11 10 C9 9 8 7 9 5 C11 6 11 8 11 10` |
| `EGEO_SCROLL` | `storico` | path `M5 4 H15 C17 4 17 7 15 7 H5 M5 4 C3 4 3 7 5 7 M7 7 V18 M13 7 V18 M5 18 H15 C17 18 17 21 15 21 H5 C3 21 3 18 5 18` |
| `EGEO_MEANDER` | `allocazione` | path `M3 19 V3 H19 V15 H7 V7 H15 V11 H11` |
| `EGEO_SHIELD` | `previdenza` | circle `11 11 r8`; circle `11 11 r3` |
| `EGEO_FLAME` | `fire` | path `M11 3 C14 7 16 10 14 13 C16 12 17 14 16 16 C15 19 7 19 6 16 C5 13 8 9 11 3 M9 20 H13` |
| `EGEO_WREATH` | `hall-of-fame` | path `M7 19 C2 15 2 7 7 3 M15 19 C20 15 20 7 15 3 M5 15 L3 14 M4 11 L2 10 M5 7 L3 6 M17 15 L19 14 M18 11 L20 10 M17 7 L19 6` |
| `EGEO_LAMP` | `assistente` | path `M3 12 H14 C16 12 18 11 20 9 C19 13 17 17 11 17 C7 17 4 15 3 12 Z M11 12 C11 10 12 9 11 7` |
| `EGEO_COLUMN` | `impostazioni` | path `M6 4 H16 M6 4 C4 4 4 7 6 7 M16 4 C18 4 18 7 16 7 M6 7 H16 M8 7 V18 M11 7 V18 M14 7 V18 M6 18 H16 M5 20 H17` |

`THEME_EMBLEMS.egeo.pages` gains the nine; Orbita's `pages` stays `{}`. The ids:
`components/cashflow/AnalisiTab.tsx:757` `analisi`; `app/dashboard/performance/page.tsx:697` `rendimenti`;
`app/dashboard/history/page.tsx:460` `storico`; `app/dashboard/allocation/page.tsx:461`, `ConsulenteClient.tsx:82`
`allocazione`; `app/dashboard/pension/page.tsx:39` `previdenza`; `app/dashboard/fire-simulations/page.tsx:92`
`fire`; `app/dashboard/hall-of-fame/page.tsx:361` `hall-of-fame`; `AssistantHeader.tsx:85` `assistente`;
`CompravenditaClient.tsx:68` `patrimonio`;
`app/dashboard/settings/page.tsx:94` `PAGE_HEADER` gains `emblem: 'impostazioni'` (spread at `:303`, `:323`, `:343`).

### 4.9 Checked, no change (each read on the code)

- `dialog.tsx:42` overlay, `:80` close `rounded-md` (follows); `drawer.tsx:83` handle; `path-rail.tsx:44` ticks (a
  4px line's cap), `:154` `rounded-md`; `CashflowSankeyChart.tsx:103` `nodeBorderRadius={3}` (a mark), `:120` labels
  (`cashflowSankey.ts:111`, ≥ 7:1 on every ground), `:130` node tooltip `rounded-md`.
- `AndamentoStoricoCharts.tsx:80`, `:140`, `:203-204`, `SavingsRateLineChart.tsx:90`: `?? '#6366f1'` only when
  `useChartColors` has fewer slots. The tooltip divs `rounded-lg` (FireDettaglio:100, CoastFireProjectionChart:102,
  FIREProjectionChart:87, FireFanChart:84, WhatIfProjectionChart:57, MonteCarloFanChart:60, ScenarioOverlayChart:43,
  UnderwaterDrawdownChart:34) follow `--radius`.
- `AssistantComposer.tsx:66` dock (an opaque bar); `settings/page.tsx:452-455` save bar (`rounded-2xl`, a Float);
  `GeneraleTab.tsx:811-857` the dev-only `Card` (frame by § 4.4); `types/goals.ts:93`,
  `CategoryManagementDialog.tsx:74-82` (the user's colours).
- `rounded-lg`/`rounded-md` boxes of `AssetDialog`, `CreateManualSnapshotModal`, `CreateDummySnapshotModal`,
  `DividendDialog`, `DividendRecordDetailsDialog`, `InflationRateDialog`, `CategoryMoveDialog`, `SeriesDeleteDialog`,
  `UnlinkSeriesDialog`, `BudgetItemDialog`, `AssetAssignmentDialog.tsx:193`, `:256`, `AssistantThreadList.tsx:96`,
  `:105`, `:201`, `EntityDossier.tsx:257`, `pensionStyles.ts`, and `pr488:` `AccumulationCalendarDialog.tsx:220`,
  `AccumulationPlanDialog.tsx:954`, `:1323`, `:1380`, `:1384`, `:1653`, `IdealCompositionDialog.tsx:377`,
  `OptimizerPanel.tsx:162`, `QuestoMeseTile.tsx:562`, `:578`, `:688`, `:791`.
- `CategoryManagementDialog.tsx:205` `rounded-2xl`; `CategoryDeleteConfirmDialog.tsx:391`, `CategoryMoveDialog.tsx:304`
  in-content lists `rounded-md`; `AnalisiPeriodControls.tsx:82` `max-sm:rounded-2xl`; the disclosures on the ground
  (`DettaglioDisclosure.tsx:37-41`, `ConfrontoDisclosure.tsx:91`, `PerformanceDettaglio.tsx:294`, NOVE-12 K1).
- `AssistantMemoryPanel.tsx:48` sub-tiles are `Tile`s (cap, shadow by NOVE-11). Accumulo: the tiles are `Tile`s;
  the five dialogs (`pr488:` `AccumulationCalendarDialog.tsx:127`,
  `AccumulationPlanDialog.tsx:781`, `IdealCompositionDialog.tsx:375`, `ModelEditDialog.tsx:107`,
  `ObiettiviDialog.tsx:141`) and NOVE-15's two Assistente modals are `ResponsiveModal`s: § 4.2.
- `ConsulenteReport.tsx:133` a generated `Tile`; `ConsulenteBookPages.tsx:150` chip `rounded-md`; `ChoiceList`'s frame
  (NOVE-19) on Compravendita and the Consulente.

**Strings**: none. No UI string is added or changed.

## 5. Constraints and traps (AGENTS.md / DESIGN.md rules, «here it means that»)

- **The palette themes render as today**: every rule is gated, every new property read with today's fallback,
  `rounded-t-[inherit]` of a `rounded-xl` list is that list's corner, `var(--destructive)` is what the state read.
- **`initial` is not «zero»** (NOVE-19 § 5): `--costume-page-generated-fill` is read only through its class.
- **The Modal-Is-A-Tile Rule**: the Float is the modal's; here it means no `data-tile` on a modal, ever.
- **The AI-Accent Rule**: no rule sets `--ai-accent` or `--ai-glow`; the fill moves under the accent.
- **The Mono Mandate**: every heading string goes through `HeadingText`; a `ReactNode` title is the caller's, and
  the one caller that passes one wraps its text itself (§ 4.2).
- **grafici.md:21-23**: the Sankey takes hex only, through `useCssColorTokens`; never `useChartColors()` near Nivo.
- **The token you author is not the token the browser returns**: E5 reads a probe's computed `color` string in
  the page and converts it IN THE SPEC with `colorToHex` (`lib/utils/cssColorToHex.ts`, the function
  `ChartColorsProvider` uses), then expects that exact hex among the `rect` fills; never an authored `oklch(`.
- **A brand-new custom property reads `''` on a running dev server**: delete `.next/dev` before doubting the CSS.
- **A probe never spends**: the Consulente on planted documents (`e2e/consulentePath.ts`, `e2e/consulenteReport.ts`),
  the Assistente on `installFakeStream` (`e2e/assistantRegister.ts`), the Rendimenti AI analysis on a `page.route` fake
  of `/api/ai/analyze-performance` with an SSE body (as `e2e/performance.degraded.spec.ts:316`) — opening that dialog
  starts the stream (`AIAnalysisDialog.tsx:196-199`).
- **`perf:budget`**: `HeadingText` ships with `tile.tsx` already; README.md § 8's rule (decision 34). **`mobile:budget`**: the census reads the
  default theme, so this spec names no entry: one that moves against `develop` stops the session (decision 33).

## 6. Tests per level (with the mutation that proves each)

| # | Test | Mutation that turns it red |
| --- | --- | --- |
| R1 | `__tests__/responsiveModalCostume.test.tsx` (NOVE-11) + cases: eyebrow «Nuova voce · Passo 1 di 2» holds two `.costume-figure`; title «Elimina 50 movimenti» has `costume-title` and one `.costume-figure` «50»; a `ReactNode` title renders as passed; the content has `data-costume-frame`; `AIAnalysisDialog`'s title with a verdict «Il portafoglio rende il 5% l'anno» holds one `.costume-figure` «5%» | render `{title}` bare; render `verdict.headline` bare |
| R2 | `__tests__/costumePortals.test.tsx` (NOVE-19 R5) + case: the open `AlertDialog`'s content has `data-costume-frame`, its title `costume-title`; the `Dialog`'s content `data-costume-frame` | drop the attribute in `alert-dialog.tsx` |
| R3 | `consulenteBook.test.tsx` + case: the card is `[data-tile]`, a generated page `[data-tile][data-generated]`; the headline has `costume-heading` | drop `data-tile` at `:223` |
| R4 | `costumeScope.test.tsx` (NOVE-19 R6) + cases: with `egeo`, each of the nine ids renders its § 4.8 `d` (previdenza two circles), the twelve Egeo arts (the temple, the amphora, the waves and § 4.8's nine) pairwise distinct; with `orbita`, every id the planet | `EGEO_FLAME` given `EGEO_LAMP`'s `d` |
| U1 | `cashflowSankey.test.ts` + cases: `buildBudgetFlowData(x)` colours equal today's literals (`#3b82f6`, `#8b5cf6`, `#f59e0b`, `#10b981`); with `costumeSankeyPalette(hex)` fixed `slot1`, variable `slot4`, debt `slot3`, Budget `positive`, Risparmi `slot2`, the k-th income slot `k % 9 + 1`; the roles flow's Budget `positive` | map variable to `slot2` |
| U2 | `chartColorsContext.test.ts:120` updated: `THEME_HEX_TOKENS` = role tokens then `SANKEY_COSTUME_TOKEN` values | drop the spread |
| C1 | `themeCostume.test.ts` + T11: the section's `@media print` block declares each of the 23 `COSTUME_SCOPE_PROPERTIES` (`--radius` with `inherit`), each `!important`; `theme-costume.tsx`'s `EmblemSvg` class holds `print:hidden`; T3: `toHaveLength(22)` → `toHaveLength(23)`, the order gains `'--costume-page-generated-fill'` last; T6 + `COSTUME_GENERATED_FILL_CLASS` equals § 4.1's string | delete `--costume-ground` from the print block |
| C2 | same file + T12: no `rounded-xl` in the files of § 4.4 (Accumulo's included), no `borderRadius: '8px'` / `borderRadius: 8` / `borderRadius: 10` in § 1 row 10's twelve files; the four AI sub-tiles' lines hold `COSTUME_GENERATED_FILL_CLASS` and no `bg-muted/40`. `__tests__/expenseProposalCard.test.tsx:159` (existing) updated: the list holds `COSTUME_FRAME_RADIUS_CLASS` and `COSTUME_GENERATED_FILL_CLASS` in place of `'rounded-xl'` | `question-card.tsx:95` back to `rounded-xl`; `ExpenseProposalCard.tsx:261` back to `rounded-xl` |
| C3 | same file + T13: in the files of § 4.4b the only `rounded-full` / `rounded-[Npx]` (N ≠ 2) left are the «stay as they are» lines § 4.4b names in those files (`goals/tiles/ObiettiviTile.tsx`, `settings/page.tsx`, `EvoluzioneTile.tsx`, `AspettoTab.tsx`, `TargetTick.tsx`, `GeneraleTab.tsx`, `RendimentoTile.tsx`, `PerformancePeriodPicker.tsx`: one each); every other file of the list has none | `RecordRows.tsx:119` back to `rounded-full` |
| K6 | `themeCostumeContrast.test.ts`: `--warning-foreground` ≥ 4,5 on K3's surfaces and on `--warning` | Egeo light `--warning-foreground` `oklch(0.62 0.11 80)` |
| K7 | same file: `--ai-accent` ≥ 4,5 on `--card` and on `--costume-page-generated-fill` over `--card` (`var(--card)` is the card, `initial` is `--muted` at 40% over it) | Egeo light's fill `initial` (4,48) |
| N2 | `e2e/themeNeutral.ts` (NOVE-11, NOVE-19 N1) gains two probes: the «Nuova Spesa» title and content (desktop), the same drawer (390). The Sankey's neutrality is E5's default-theme case. Baseline RE-RECORDED (`THEME_NEUTRAL_RECORD=1`) on the untouched code, then compared | drawer fallback `12px` |
| E1 | `e2e/theme.costume.spec.ts` (NOVE-19) + cases: criterion 1 on Cashflow in default, Egeo, Orbita light; an eyebrow `.costume-figure` `Geist Mono`; criterion 10's emblem `path` on Storico and FIRE | `data-costume-frame` off `dialog.tsx` |
| E2 | `e2e/theme.costume.mobile.spec.ts` + case: criterion 2 at 390; `scrollWidth ≤ innerWidth` | `rounded-t-[10px]` restored |
| E3 | `e2e/theme.costume.tablet.spec.ts` + case: at 1024×768 the dialog has 4px / 0px and a `linear-gradient` `background-image`; at 768×1024 the drawer 4px / 0px | drop `data-costume-frame` in `dialog.tsx` (1024×768 red); `drawer.tsx` back to `rounded-t-[10px]` (768×1024 red) |
| E4 | `e2e/theme.costume.spec.ts` + case: the Consulente's first scene (planted document) and Compravendita's first screen in Egeo light: the section `[data-tile]` 4px with a gradient, headline `Marcellus` 34px, its `.costume-figure` mono; Compravendita's eyebrow «Passo 1 di N» holds two `.costume-figure` in `Geist Mono`; `ConsulenteWizard.tsx:301`'s list 4px; in Orbita light on `/dashboard/hall-of-fame` the first `RecordRows` bar track `0px`, in Egeo > 1000px | drop `costume-heading` from `HEADLINE_CLASS` |
| E5 | `e2e/theme.costume.analisi.spec.ts` (new: the name matches the `analisi` project's `/analisi\.spec\.ts/` and the desktop project's ignore, so it runs on the Analisi fixture account, whose period holds expenses; the theme through that account's `userPreferences` doc, written and restored as NOVE-12's E1): `/dashboard/analisi` at 1440, «Dettaglio» opened (its trigger clicked, the Flusso chunk awaited as `e2e/analisi.spec.ts` does — after NOVE-10 the Sankey is the first tile inside the closed, lazy «Dettaglio»); the Sankey's `svg rect` fills include `colorToHex` of a probe `color: var(--chart-1)` in Egeo, `#3b82f6` in the default and never in Egeo | pass `DEFAULT_SANKEY_TYPE_PALETTE` always |
| E6 | same + case: Rendimenti › Dettaglio open, the drawdown `stop` has `stop-color="var(--destructive)"`; Egeo → Default from Aspetto without reload, its computed `stop-color` equals a probe's `color: var(--destructive)` | restore the state at `:102` |
| E7 | same + case: the book on a planted report, `page.emulateMedia({ media: 'print' })` in Egeo: `[data-book-print] h2` `font-family` starts `Geist`, `.costume-header-band` `height` `0px`, the `PageHeader`'s emblem `svg` `display: none` | drop the print block; drop `print:hidden` |

## 7. Guided verification (WORKFLOW.md § 2)

Expected outcome, declared first: in Egeo and Orbita every dialog and drawer is a tile lifted off the page — the
tile's corner, the gold cap or the console's marks, the title in the theme's face with its numbers in the mono, the
same large shadow as today; the Consulente's and the Compravendita's scenes read as the page's tiles; no
`rounded-xl` box inside a tile is rounder than the tile; Orbita squares every bar, pill and chip of the nine pages; the Analisi flow paints the types in the colours of the ring beside it; Egeo draws its
own mark beside each page's name; the six other themes look exactly as before.

- **A**: `tsc`, lint, Vitest (three zones), the neutral E2E in compare mode, E1-E7,
  `npx playwright test e2e/shell.boot`.
- **B**: emulators + seed; decoys «ornitorinco» (a category) and «fenicottero» (an asset): in a dialog's eyebrow the
  name reads in the costume face, in a field or a row in Geist.
- **C (browser, the session)**: Egeo and Orbita × light/dark × 1440, 1024×768, 768×1024, 390 on Analisi (Sankey
  open), Rendimenti › Dettaglio, Storico, Allocazione (Accumulo, the Consulente and its book on planted documents),
  Previdenza, FIRE (five tabs), Hall of Fame, Assistente (faked stream with a proposal and a question), Impostazioni
  (six tabs), Compravendita; the dialogs «Nuova Spesa», «Registro operazioni», the logout confirm, the AI analysis
  with `/api/ai/analyze-performance` faked by `page.route` (§ 5: opening the dialog starts the stream);
  screenshots in the scratchpad.
- **D (data)**: `document.querySelectorAll('[data-costume-frame]')` is one per open modal; a § 4.4 box reads 4px /
  0px, in the default theme today's 14px.
- **E**: a dialog title with a figure (`DividendDetailsDialog`'s date) keeps its day and year `Geist Mono`; an
  armed delete button keeps Geist (a button is not a heading); a drawer with the
  keyboard open keeps its corner; Egeo → Default without reload restores every corner, the Sankey's hexes, the
  drawdown red.
- **F (owner, at his «pronto»)**: the mirror in both themes, light and dark, on his own screens.
- **G** (the two budgets close by README.md § 8's ONE rule, decisions 33 and 34): `perf:budget`, `mobile:census` + `mobile:budget` (expected unchanged); remove decoys, fixtures, the mirror.

## 8. Putting it into service

One PR to `develop`, after NOVE-19's. No data change. Rolling back = reverting the PR: the gated rules, the 23rd
property, the frame attribute and the emblems go together; a palette theme never depended on them.

## 9. Documentation

- `DESIGN.md:262` BEFORE: «It also takes the tile's material: `bg-card`, 1px border, 16px radius.» AFTER: «It also
  takes the tile's material: `bg-card`, 1px border, 16px radius — and under a costume theme the tile's corner, its
  cap or marks and its heading face on the title, never its shadow (The Costume Rule).»
- `DESIGN.md:628` BEFORE: «own corners and no Float: `rounded-t-[10px]` on the top edge only, because a bottom
  sheet is cut by» AFTER: «own corners and no Float: `rounded-t-[10px]` on the top edge only (a costume's tile
  corner, `--costume-control-frame-radius`), because a bottom sheet is cut by».
- `DESIGN.md:71-72` BEFORE: «(4.5:1 as text on --card and # on a bg-muted/40 sub-tile, both modes)» AFTER: «(4.5:1
  as text on --card and # on a generated sub-tile — bg-muted/40, a costume's `--costume-page-generated-fill` —
  both modes)».
- `DESIGN.md:381-383` BEFORE: «its hues are SEMANTIC (blue = fixed, violet = variable, amber = debt) and must
  not follow the chart slots, which would re-colour the meaning per theme.» AFTER: «its hues are SEMANTIC (blue =
  fixed, violet = variable, amber = debt) and do not follow a palette theme's chart slots; under a costume theme
  the types take the slots every other chart of the page gives them (`EXPENSE_TYPE_COLOR_VAR`,
  `costumeSankeyPalette`), so the flow agrees with the ring beside it (The Costume Rule).»
- `DESIGN.md:450` (as NOVE-19 left it) BEFORE: «the eyebrows and the wordmark only» AFTER: «the eyebrows, the
  wordmark and a modal's title only». The Costume Rule (as NOVE-19 left it) BEFORE: «a heading font for the
  verdict's headline, the eyebrows and the wordmark» AFTER: «a heading font for the verdict's headline, the
  eyebrows, the wordmark and a modal's title». The Heading Font line (as NOVE-19 left it) BEFORE: «the verdict's
  headline, the eyebrows and the wordmark inside the dashboard take the theme's face» AFTER: «the verdict's
  headline, the eyebrows, the wordmark and a modal's title inside the dashboard and its dialogs take the theme's
  face».
- `DESIGN.md:579` (as NOVE-15 and NOVE-21 left it) BEFORE: «**Accent text sits on `--card` or on a `bg-muted/40`
  sub-tile over `--card`**» AFTER: «**Accent text sits on `--card` or on a generated sub-tile over `--card`**
  (`bg-muted/40`; under a costume theme `--costume-page-generated-fill`, `COSTUME_GENERATED_FILL_CLASS`)».
- `doc/guide/temi.md` § Il costume: the 23rd property and its class, `data-costume-frame`, `.costume-title`, the
  print reset, the Sankey under a costume, Egeo's twelve emblems; § Per-theme measures: § 4.7's table.
- `doc/guide/dialog.md` § Dialog e form trasversali: a bullet «A modal in costume» (frame, title, drawer corner).
- `doc/guide/cashflow-analisi.md:178-181`: «Entrate and Budget keep the type view's colours» gains «— under a
  costume the theme's slots (`costumeSankeyPalette`); the type view's memo then depends on them only».
- `doc/guide/consulente.md`, `compravendita.md`, `assistente.md`: one line each (the scene card is a tile; frames;
  the generated fill). `CLAUDE.md` «Themes»: the costume covers the dialogs. `doc/nove/README.md` § 6 the NOVE-20
  row, § 7 the 23rd property, `COSTUME_GENERATED_FILL_CLASS`, `data-costume-frame`, `.costume-title`.
  `Draft Release Temp.md`: «**Temi — Egeo e Orbita** — The two costume themes now dress every dialog and drawer
  and the other nine pages; in Egeo each page has its own emblem, and the Analisi flow takes the theme's colours.»

## 10. Declared out of scope

- **NOVE-19's surfaces** (the shell, the portalled and form primitives, Panoramica, Patrimonio, Cashflow but
  Analisi): portalled content inside my surfaces — every select, menu and popover of a dialog, the pickers'
  drawers — is served by NOVE-19's mechanism for portalled content.
- **Per-theme `--ai-accent`**: none (NOVE-11 § 10); the fill moves instead.
- **Emails, PDF export, landing, access pages**: none (decision 17); the browser's print of the book is reset (§ 4.1).

## 11. The prompt that implements it

```
Ciao, in questa sessione vorrei implementare la spec doc/nove/NOVE-20-temi-giro-b.md

Contesto, prima di toccare qualsiasi file (le regole del repo cambiano il modo di lavorare):
- Leggi WORKFLOW.md (regole di sessione e di collaudo; l'ultima sezione dice come si
  applicano in questo repo)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- CLAUDE.md (l'indice: che cos'è e dove sta ogni cosa, lo stato corrente) è già nel
  contesto: usalo per trovare la guida giusta
- Leggi la spec doc/nove/NOVE-20-temi-giro-b.md e l'indice della serie
  doc/nove/README.md (§ 3 decisioni, § 4 scelte adottate, § 7 contratti condivisi, § 8 regole)
- Leggi doc/guide/temi.md (§ Il costume), dialog.md, cashflow-analisi.md, grafici.md,
  consulente.md, compravendita.md, assistente.md, rendimenti.md, storico.md, fire.md,
  previdenza.md, hall-of-fame.md, impostazioni.md, allocazione.md, accumulo.md (di ciascuna
  § Per-page blind spots), e2e-playwright.md, velocita.md, prima-schermata.md PRIMA di
  scrivere codice
- Leggi DESIGN.md (The Costume Rule, The Modal-Is-A-Tile Rule, The Mono Mandate,
  The Data Owns Color Rule, The AI-Accent Rule) e PRODUCT.md
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

Implementa la spec così com'è scritta, nell'ordine: le due sonde nuove della linea di base
neutra, registrate sul codice intatto; i test (contrasti, CSS, tavolozza del Sankey,
primitive, emblemi) e i casi nuovi dei test esistenti; la proprietà nuova del contratto, la
sua classe e le regole CSS, alla lettera; le primitive (dialog, drawer, alert-dialog,
responsive-modal); le scene del Consulente e della Compravendita; i riquadri, i fumetti e
le schede generate della lista; le barre, le pillole e i chip di § 4.4b; il Sankey; il drawdown; gli emblemi; i casi e2e. I test
PRIMA del codice, ciascuno visto rosso con la sua mutazione; nessun valore di colore
diverso da quelli scritti. Fermati e chiedimi se: la linea di base neutra cambia; un
contrasto misura sotto 4,5; perf:budget, misurato prima e dopo sulla stessa macchina, supera un tetto di più di 1 KB gz (fino a 1 KB lo alzi tu, con raisedBy e una riga in velocita.md § Registro); nel confronto con develop dello stesso giorno, stessa build, si muove una voce di mobile:budget che la spec non nomina; un sito della lista non
è più nel suo file (cercato per la classe o il nome citati, non per il numero di riga), o
il grep di § 4.4 e § 4.4b sul codice di oggi trova un rounded-xl, un rounded-full o un
rounded-[Npx] che le liste non nominano. Collaudo: § 7, la F al mio «pronto». Un branch, un commit,
solo dopo il mio OK con il riassunto del diff. SESSION_NOTES.md non si committa.
```

Model: **Opus 5.5**, effort **medium** — an L spec that extends the shared costume contract (a 23rd property and
its class, a frame attribute, a title hook, a print reset) and touches ~50 files across many pages, every value
written and every criterion closed by a test. Estimated size: 1 long session, ~8 h (decision 35: one branch, one commit; resumed on the same branch, without committing, when the context runs out); ~40 lines of CSS, ~250 of TS
edits, ~250 of tests, cases in four E2E files.
