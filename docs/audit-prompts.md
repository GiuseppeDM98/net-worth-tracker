# Impeccable Audit Prompts

Prompt ottimizzati per `/impeccable audit` — compliance check mirato dopo l'implementazione
dei P0/P1 emersi da una critique, o come verifica standalone su assi specifici.

**Quando usarli:**
- Dopo aver implementato un redesign (craft + polish già fatti nello stesso passaggio) →
  gate di compliance: verifica che i cambiamenti non abbiano introdotto regressioni
- Come check standalone periodico su un asse specifico (es. token compliance dopo
  aver aggiunto un nuovo componente)

**Differenza da critique:**
Audit = compliance pass/fail su assi precisi. Critique = valutazione olistica con score.
Audit è più veloce, non produce score, non sostituisce la critique di verifica finale.

**Assi di compliance per questo progetto** (fonte canonica: `DESIGN.md` — leggila sempre):
- **Form Follows Function** — ogni proprietà visiva (size, weight, color, radius, motion) deriva
  da una funzione; niente decorazione, niente false depth/material (onestà), chrome che deferisce al dato
- **Token / Zero-Chroma** — nessun `bg-gray-*`, `text-gray-*`, `dark:bg-*`, hex hardcoded; usa CSS vars
  (OKLCH-native); chrome achromatica, il colore lo possiede il dato (Data Owns Color)
- **Chart colors** — tutte le serie Recharts via `useChartColors()`; tooltip via CSS vars
  (`var(--card)` bg, `var(--card-foreground)` label); nessun hex o `fill="currentColor"` diretto
- **Gerarchia Trade Republic** — hero block con la scala corretta: page hero
  `text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em]`, section hero `text-[36px]`,
  sub-hero `text-[22px]` (**mai** `text-4xl`/`text-2xl` per un hero); un numero dominante per sezione,
  `divide-y` flat rows, nessun card-in-card, nessun side-stripe border
- **Mono Mandate** — ogni numero (€, %, ratio, data strutturata) in Geist Mono con `tabular-nums`
- **Breakpoint** — `md:` → `desktop:` (≥ 1440px); `sm:` solo dove corretto;
  `max-desktop:portrait:pb-20` su pagine con bottom nav; `landscape:` per casi specifici
- **Motion** — `useReducedMotion()` o `MotionConfig reducedMotion="user"` attivo;
  spring configs consistenti (`stiffness: 400, damping: 35`); `layoutId` unici per pagina
- **ARIA** — `role="tablist/tab"` su pill selectors, `role="progressbar"` su barre,
  `aria-label` su bottoni icon-only, `aria-expanded` su collapsible
- **Skeleton** — ogni sezione async ha uno skeleton strutturalmente isomorfo al layout reale

**Sequenza corretta (flusso combinato "ripensamento"):**
```
critique → shape combinato (blocco A + blocco B) → implementa tutto (craft + polish) →
audit (gate compliance) → critique di verifica
```

---

## App Shell e Navigazione

### Dashboard Layout + Shell

```
/impeccable audit lo shell della dashboard

File: app/dashboard/layout.tsx,
      app/dashboard/template.tsx

Assi da verificare (minimum — segnala anche eventuali altri problemi):
- Token: `<main>` usa `bg-background` e `desktop:p-6` — verifica che non siano
  scivolati `bg-gray-*` hardcoded o breakpoint `md:` invece di `desktop:`
- Demo banner: token compliance (`--warning-*` vars), nessun colore hardcoded
- Landscape mobile header (SidebarTrigger bar): altezza, padding, token
- `PageContainer`: tutte le pagine lo usano come wrapper — max-w-[1600px], mx-auto,
  `space-y-4 desktop:space-y-6`, `max-desktop:portrait:pb-20` presente
- `PageHeader`: mobile sticky bar (h-14, backdrop-blur-sm, bg-background/95) non
  sovrappone il contenuto; desktop full header con border-b corretto
- Page transitions in template.tsx: `useReducedMotion()` rispettato, nessun layout thrash
- Altro: pattern anomali o violazioni non elencate sopra

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
```

### Sidebar Desktop

```
/impeccable audit la sidebar desktop

File: components/layout/Sidebar.tsx

Assi da verificare (minimum — segnala anche eventuali altri problemi):
- Token: nessun colore hardcoded — usa `--sidebar-*` CSS vars su tutti e 6 i temi
- Voce attiva: colore e contrasto corretto su tutti i temi (inclusi cyberpunk, retro-arcade)
- Gerarchia visiva: sezioni, separatori, icone — font weight e size coerenti con il resto
- Breakpoint: visibile solo su `desktop:` (≥ 1440px), nascosta correttamente su portrait
- ARIA: `SidebarContent` con `role="navigation"` + `aria-label`, voce attiva con
  `aria-current="page"` su `<Link>` dentro `SidebarMenuButton`
- Modalità collassata (`collapsible="icon"`): toggle visibile solo su desktop
  (`hidden desktop:flex`); logo+nome nascosti (`group-data-[state=collapsed]:hidden`);
  `AssistenteBanner` sostituito dall'icona Bot viola (`group-data-[state=collapsed]:flex`);
  `SidebarMenuButton size="lg"` nel footer collassa automaticamente a sola avatar
- Dark mode: contrasto voce attiva e hover su sfondo `--sidebar-background`
- Altro: pattern anomali o violazioni non elencate sopra

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
```

### Bottom Navigation Mobile

```
/impeccable audit la bottom navigation mobile

File: components/layout/BottomNavigation.tsx

Assi da verificare (minimum — segnala anche eventuali altri problemi):
- Token: usa `--sidebar-*` CSS vars per il theme sync — verifica su tutti e 6 i temi
  (default, solar-dusk, elegant-luxury, midnight-bloom, cyberpunk, retro-arcade)
- Voce attiva: colore/icona leggibile su tutti i temi in dark e light mode
- Safe area: `bottom: calc(env(safe-area-inset-bottom, 0px) + 12px)` corretto
- Touch targets: ogni voce ≥ 44×44px
- Visibilità: container esterno `max-desktop:portrait:flex` — nascosta in landscape e desktop
- ARIA: `motion.nav` con `aria-label="Navigazione principale"`, `aria-current="page"`
  sulle voci attive (sia Link primari che button "Altro"), `aria-haspopup="dialog"` e
  `aria-expanded` sul button "Altro"
- Motion: `useReducedMotion()` applicato — `pillTransition` è `{ duration: 0 }` se
  ridotta, spring 400/35 altrimenti; verifica che si applichi a `motion.nav layout`
  e agli `motion.div layoutId="bottom-nav-active-pill"`
- FAB cashflow: pulsante `+` appare/scompare solo su rotta `/dashboard/cashflow` via
  `AnimatePresence mode="popLayout"`; sposta la pill via `motion.nav layout`; invia
  `cashflow:add-expense` custom event (non naviga); animazione scale 0.6→1 spring 400/28
- Altro: pattern anomali o violazioni non elencate sopra

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
```

### Secondary Menu Drawer

```
/impeccable audit il secondary menu drawer

File: components/layout/SecondaryMenuDrawer.tsx

Assi da verificare (minimum — segnala anche eventuali altri problemi):
- Token: nessun colore hardcoded nel drawer e nell'overlay
- Gerarchia: voci coerenti con sidebar desktop (stesso font size, weight, icone)
- Motion: open/close animation rispetta `useReducedMotion()`; spring config (400/35)
- ARIA: `role="dialog"`, `aria-modal="true"`, focus trap, close on Escape
- Touch targets: ogni voce ≥ 44px height
- Breakpoint: visibile solo dove previsto (portrait mobile/tablet)
- Altro: pattern anomali o violazioni non elencate sopra

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
```

---

## Pagine Auth e Landing

### Landing Page

```
/impeccable audit la landing page

File: app/page.tsx

Assi da verificare (minimum — segnala anche eventuali altri problemi):
- Token: nessun colore hardcoded su hero, feature cards, CTA — CSS vars ovunque
- Breakpoint: layout responsive da 375px a desktop (≥ 1440px)
- CTA "Prova la Demo": visibile solo se `NEXT_PUBLIC_DEMO_EMAIL` è definito
- Motion: entry animations rispettano `useReducedMotion()`
- ARIA: heading hierarchy (h1 → h2 → h3), bottoni con label descrittivi
- Dark mode: contrasto su tutti gli elementi del hero e delle feature cards
- Altro: pattern anomali o violazioni non elencate sopra

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
```

### Login + Register

```
/impeccable audit le pagine Login e Register

File: app/login/page.tsx,
      app/register/page.tsx

Assi da verificare (minimum — segnala anche eventuali altri problemi):
- Token: nessun colore hardcoded nei form, nei field focus ring, nei bottoni
- ARIA: `<label>` associati agli input via `htmlFor`, error messages con `aria-describedby`,
  bottone submit con feedback inline (Loader2 animate-spin durante pending)
- Password toggle: keyboard-reachable (focusabile, `aria-label` "Mostra/Nascondi password")
- Motion: entry animations rispettano `useReducedMotion()`
- Responsive: layout corretto da 375px; input non escono dal viewport su mobile
- Dark mode: contrasto field border e placeholder su sfondo card
- Altro: pattern anomali o violazioni non elencate sopra

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
```

---

## Panoramica

```
/impeccable audit la pagina Panoramica

File: app/dashboard/page.tsx
Componenti: components/dashboard/*

Assi da verificare (minimum — segnala anche eventuali altri problemi):
- Token: nessun `bg-gray-*`/`dark:bg-*`/hex hardcoded in hero card, liquid card,
  KPI chip grid (`bg-muted/40`), category bars, TER/Costo cards (mobile), charts section
- Chart colors: `NetWorthSparkline` usa `color="var(--chart-1)"` (non hex); tutti i
  chart di composizione via `useChartColors()`; category bar colors da `chartColors[0/1]`
- Gerarchia: hero `text-[44px] desktop:text-[54px] font-bold font-mono`; liquid card
  `text-[36px]`; KPI chip `text-[22px]`; delta annotation `text-[12px] font-mono`
- Muted sub-tile: KPI chips usano `bg-muted/40` (no border) — non `bg-muted border-border`
  (quello è per parameter tiles nei collapsible)
- Breakpoint: `md:` → `desktop:`; KPI grid `grid-cols-2 desktop:grid-cols-4`; TER/Costo
  responsive duplication (`desktop:hidden` su mobile row, `hidden desktop:grid` nel hero footer)
- Skeleton: `OverviewAnimatedCurrency` isolato in leaf, `OverviewChartsSection` memoized;
  skeleton inline strutturalmente isomorfo al layout v2 (hero 2fr+1fr, KPI grid 4-col)
- Motion: `requestIdleCallback` per chart mount; `useCountUp` `once: true`; `heroSettled`
  → `chartRenderReady` handoff; card-tab `layoutId="chart-tab"` unico nella pagina
- Altro: pattern anomali o violazioni non elencate sopra

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
```

---

## Patrimonio

```
/impeccable audit la pagina Patrimonio

File: app/dashboard/assets/page.tsx
Componenti: components/assets/AssetManagementTab.tsx,
            components/assets/AssetCard.tsx,
            components/assets/AssetMobileSummary.tsx,
            components/assets/AssetSparkline.tsx,
            components/assets/AssetDialog.tsx,
            components/dashboard/OverviewAnimatedCurrency.tsx,
            components/dashboard/NetWorthSparkline.tsx

La pagina è una singola scroll — nessun tab. Assi da verificare (minimum — segnala anche eventuali altri problemi):
- Token: hero card e liquid card (condivisi con Panoramica) — nessun hardcoded;
  CashAccountsSection card grid — nessun `bg-gray-*`; badge classe asset,
  valori G/P (`color-mix()` non `text-emerald-*`) — nessun hardcoded
- Gerarchia: hero `text-[44px]/[54px]`; liquid card `text-[36px]`; flat 3-row
  breakdown con `w-[42px] text-right` per i %; G/P non realizzato come riga border-t
- Chart colors: `NetWorthSparkline` usa `var(--chart-1)`; `AssetSparkline` via
  `useChartColors()`
- CashAccountsSection: `bg-muted/40` (KPI chip variant, no border) — nessun `bg-card`
  (sarebbe card-in-card); grid `grid-cols-2 desktop:grid-cols-4`
- AssetManagementTab: tabella ordinabile solo `desktop:`, `AssetMobileSummary` solo
  portrait; delete 2-click con `aria-label` e disarmo visibile; skeleton isomorfo
- ARIA: AssetDialog con `DialogDescription`; type picker Step 1 con `role="radio"`
- Breakpoint: `md:` → `desktop:`; `max-desktop:portrait:pb-20`
- Altro: pattern anomali o violazioni non elencate sopra

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
```

---

## Cashflow

### Tab "Dividendi"

```
/impeccable audit il tab "Dividendi" della pagina Cashflow

File: app/dashboard/cashflow/page.tsx
Componenti: components/dividends/DividendTrackingTab.tsx,
            components/dividends/DividendStats.tsx,
            components/dividends/DividendCalendar.tsx,
            components/dividends/DividendTable.tsx,
            components/dividends/DividendRecordDetailsDialog.tsx,
            components/dividends/DividendDialog.tsx
Pure layer (logica, non visivo): lib/utils/dividendAnalytics.ts, lib/constants/dividendTypes.ts

Assi da verificare (minimum — segnala anche eventuali altri problemi):
- Token: hero net-income, KPI chip grid (`bg-muted/40`), strip income-reliability, leaderboard
  payer divide-y + share-bar, calendario (day active/hover, today highlight) — nessun hardcoded;
  colori segno via `getMetricValueColor` (token, non emerald/red); badge tipo dividendo via CSS var
- Chart colors: sparkline trailing-12m dell'hero + grafici nel Collapsible (e DividendStats) via
  `useChartColors()`; tooltip via CSS vars — nessun hex diretto
- Gerarchia: hero net-income con scala corretta (`text-[44px] desktop:text-[54px] font-bold font-mono`)
  + chip di variazione; leaderboard payer flat divide-y (no card-in-card); Mono Mandate su tutti i valori
- Periodo: asse `DividendPeriod` (Mese/Anno/12 mesi/Storico) derivato in-memory — verifica che lo
  switch NON rifaccia il fetch; `DividendStats` ricevono i bound di data del periodo selezionato
- Progressive disclosure: Table/Calendario via `SegmentedControl`; filtri asset/tipo + day-focus sotto
  "Filtra"; grafici e analisi avanzata dietro `Collapsible` — stati di default coerenti
- Breakpoint: calendario non overflow su 375px; DividendTable scroll orizzontale su mobile;
  leaderboard e strip reliability non debordano
- ARIA: SegmentedControl + asse periodo `role="tablist"`/`role="tab"`; calendario con `aria-label`
  sui giorni e `aria-selected` sul giorno attivo; Collapsible con `aria-expanded`;
  DividendRecordDetailsDialog con `role="dialog"`, `aria-modal`, focus trap
- Altro: pattern anomali o violazioni non elencate sopra

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
```

### Tab "Tracciamento"

```
/impeccable audit il tab "Tracciamento" della pagina Cashflow

File: app/dashboard/cashflow/page.tsx
Componenti: components/cashflow/ExpenseTrackingTab.tsx,
            components/expenses/ExpenseDialog.tsx

Assi da verificare (minimum — segnala anche eventuali altri problemi):
- Token: KPI dominant blocks, badge tipo spesa (Variabile/Fissa/Debito/Entrata),
  importi negativi (rosso) — via `text-destructive` non hardcoded
- Gerarchia: delete 2-click con 3s auto-disarm — stato "Conferma?" visivamente distinto
  ma via token, non via `bg-red-*` hardcoded
- ExpenseDialog: Step 1 visual type picker — 4 card 2×2 su mobile, bordi/bg via token;
  Step 2 form fields — focus ring via CSS var
- Breakpoint: load-more non overflow, filtri pill su 375px non wrappano oltre 2 righe
- ARIA: ExpenseDialog `DialogDescription` presente; type picker cards `role="radio"`
- Altro: pattern anomali o violazioni non elencate sopra

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
```

### Tab "Budget"

```
/impeccable audit il tab "Budget" della pagina Cashflow

File: app/dashboard/cashflow/page.tsx
Componenti: components/cashflow/BudgetTab.tsx,
            components/cashflow/budget/BudgetList.tsx,
            components/cashflow/budget/BudgetItemDialog.tsx,
            components/cashflow/budget/BudgetSettingsCard.tsx,
            components/cashflow/budget/BudgetForecastCard.tsx,
            components/cashflow/budget/BudgetInsightsCard.tsx,
            components/cashflow/budget/BudgetAlertsBanner.tsx

Assi da verificare (minimum — segnala anche eventuali altri problemi):
- Token: progress bars (BudgetList) — nessun `bg-blue-*` hardcoded; over-budget →
  `bg-destructive` o `color-mix()` non hex; under-budget → colore da token;
  BudgetAlertsBanner alert soglie (50/75/90/100%) — colori via token non hardcoded;
  BudgetForecastCard e BudgetInsightsCard — nessun `bg-gray-*`
- Gerarchia: importi in `font-mono tabular-nums`; label categoria plain; nessun card-in-card;
  BudgetSettingsCard overall ceiling + status indicator auto-save via token
- ResponsiveModal: BudgetItemDialog usa `ResponsiveModal` (Dialog desktop ↔ Drawer mobile ≤768px)
- ARIA: progress bar con `role="progressbar"`, `aria-valuenow`, `aria-valuemin/max`;
  BudgetAlertsBanner ha `aria-live` per aggiornamenti soglia
- Breakpoint: lista Mensili/Annuali non overflow su 375px; BudgetForecastCard chart
  altezza corretta su mobile
- Altro: pattern anomali o violazioni non elencate sopra

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
```

### Tab "Centri di Costo"

```
/impeccable audit il tab "Centri di Costo" della pagina Cashflow

File: app/dashboard/cashflow/page.tsx
Componenti: components/cashflow/CostCentersTab.tsx,
            components/cashflow/CostCenterDetail.tsx,
            components/cashflow/CostCenterDialog.tsx

Assi da verificare (minimum — segnala anche eventuali altri problemi):
- Token: hero totale periodo, lista flat divide-y dei centri + share-bar, detail (hero +
  chip Δ-vs-precedente + righe flat), budget meter/verdict — nessun hardcoded; lo share-bar
  e il meter usano token/`color-mix()`, non hex
- Chart colors: grafico mensile stacked-by-categoria + overlay confronto cross-centro via
  `useChartColors()`; tooltip via CSS vars; nessun hex diretto
- Gerarchia: hero periodo con scala corretta; nessun ritorno al vecchio box-grid 2×4 di KPI;
  lista centri flat divide-y (no card-in-card); Mono Mandate su tutti i valori
- Periodo: asse `CostCenterPeriod` (Mese/Anno/12 mesi/Storico) derivato in-memory — verifica
  che lo switch non rifaccia il fetch; lifecycle attivo/dormiente/archiviato coerente
- ARIA: asse periodo + segmented `role="tablist"`/`role="tab"`; delete/rename con `aria-label`;
  CostCenterDialog con `DialogDescription`; budget meter con `role="progressbar"` + `aria-valuenow`
- Breakpoint: CostCenterDetail, composizione categoria e overlay confronto non overflow su mobile
- Altro: pattern anomali o violazioni non elencate sopra

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
```

---

## Analisi

```
/impeccable audit la pagina Analisi

File: app/dashboard/analisi/page.tsx
Componenti: components/cashflow/AnalisiTab.tsx,
            components/cashflow/CashflowSankeyChart.tsx,
            components/cashflow/AnomalieBlock.tsx,
            components/cashflow/ConfrontoAnnualeSection.tsx,
            components/cashflow/SavingsRateTrendSection.tsx,
            components/cashflow/CategoryTrendsGrid.tsx,
            components/cashflow/AndamentoStoricoSection.tsx
Pure layer (logica, non visivo): lib/utils/cashflowTimeSeries.ts

Assi da verificare (minimum — segnala anche eventuali altri problemi):
- Token: nessun hardcoded nel Sankey (nodi, link, tooltip), nei KPI hero blocks,
  nel TopExpensesBlock (importi rossi — usa `text-destructive`?)
- Chart colors: Sankey node colors via `useChartColors()` o CSS vars; tutti i trend charts
  (incl. AndamentoStoricoSection: ComposedChart Entrate/Uscite/Risparmio + LineChart per
  categoria) via `useChartColors()`; tooltip via CSS vars — nessun hex diretto
- AndamentoStoricoSection (solo `periodMode === 'history'`): YAxis del ComposedChart usa
  `domain={[(min)=>Math.min(0,min),'auto']}` (la linea Risparmio negativo non viene tagliata);
  asse temporale parte da `cashflowHistoryStartYear` (floor) e non degenera a 1 bucket
- LineChart per categoria: mostra SOLO le prime 6 categorie per totale — le restanti sono
  scartate di proposito (niente serie "Altro" residua, che sommando molte categorie sovrastava
  ogni singola linea). NON re-introdurre un raggruppamento "Altro": è una scelta deliberata, non
  un dato mancante. Tooltip righe ordinate per valore decrescente (`itemSorter`) per rispecchiare
  l'impilamento verticale delle linee
- Breakpoint: pill 3-state (Anno Corrente/Anno/Storico) centrata su mobile/tablet, riga su
  `desktop:`; selettore non overflow su 375px; TopExpensesBlock non overflow su mobile
- Motion: `key={periodLabel}` su TopExpensesBlock per reset `showAll`; pill animation (400/35);
  layoutId unici per pagina (`analisi-period-pill`, `andamento-granularity-pill`,
  `andamento-category-pill`, `confronto-view-pill`) — nessuna collisione
- ARIA: pill selector `role="tablist"`, Sankey drill-down breadcrumb accessibile;
  toggle Mese/Anno ed Entrate/Uscite con `role="tablist"`/`role="tab"`
- Altro: pattern anomali o violazioni non elencate sopra

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
```

---

## Allocazione

```
/impeccable audit la pagina Allocazione

File: app/dashboard/allocation/page.tsx
Componenti: components/allocation/*

Assi da verificare (minimum — segnala anche eventuali altri problemi):
- Token: `ActionChip` (COMPRA/VENDI/OK) e `TargetTick` — colori azione via `useActionColors`
  (legge `--chart-*` con clamp lightness oklch), non hardcoded; `AllocationHero` verdetto e
  `RebalancePlan` mosse — nessun `bg-gray-*`/hex su badge e righe; `ContributionAllocator`
  ripartizione — token; `RebalanceBandControl` segmented (±2/±5/5·25/custom) — token
- Chart colors: eventuali grafici in ExposureSection via `useChartColors()`; i colori azione
  passano da `useActionColors` (ACTION_CHART_NUMBER COMPRA 3 / VENDI 5 / OK 2)
- ARIA: `AllocationBreakdown` accordion con `aria-expanded` + contenuto `inert` da chiuso;
  `RebalanceBandControl` `role="radiogroup"`/segmented; `ActionChip` con `aria-label` descrittivo
- Breakpoint: AllocationBreakdown accordion (grid-template-rows) e ExposureSection drill-down
  (azienda/settore/ETF) non overflow su mobile
- Skeleton: `AllocationPageSkeleton` isomorfo al layout reale (hero → plan → breakdown → exposure)
- Altro: pattern anomali o violazioni non elencate sopra

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
```

---

## Rendimenti

```
/impeccable audit la pagina Rendimenti

File: app/dashboard/performance/page.tsx
Componenti: components/performance/*

Assi da verificare (minimum — segnala anche eventuali altri problemi):
- Token: `HeroMetricBlock` wrapper, `MetricCard` divider — nessun hardcoded;
  `UnderwaterDrawdownChart` usa `--destructive` CSS var (non `#ef4444`)
- Chart colors: rolling charts, growth-of-100 benchmark chart, drawdown chart
  tutti via `useChartColors()`; tooltip via CSS vars
- ARIA: `?` button in MetricCard con `aria-label`; period selector `role="tablist"`;
  CUSTOM period chip con `aria-pressed`
- Breakpoint: tabella benchmark 11-col — scroll orizzontale corretto su mobile;
  period selector non overflow su 375px
- Motion: `layoutId="performance-mobile-tab"` unico sulla pagina; spring (400/35)
- Altro: pattern anomali o violazioni non elencate sopra

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
```

---

## Storico

```
/impeccable audit la pagina Storico

File: app/dashboard/history/page.tsx
Componenti: components/history/*,
            components/dashboard/LaborMetricsChart.tsx

Assi da verificare (minimum — segnala anche eventuali altri problemi):
- Token: sezione Lavoro & Investimenti flat rows — nessun hardcoded;
  sezione Driver (3 card: Savings vs Investment, Lavoro & Investimenti, YoY) — nessun `bg-gray-*`
- Chart colors: tutti i chart (Evoluzione, Composizione, Raddoppi, Labor, YoY bar) via
  `useChartColors()`; tooltip via CSS vars; mobile inline legend usa stessi colori
- Valore per Strumento (`MonthlyAssetBreakdownSection`, sotto `components/history/*`): tabella
  per-strumento del mese + sum del sottoinsieme selezionato + trend cross-mese; il `TrendTooltip`
  custom (effetto prezzo vs quantità) usa CSS vars per bg/label e `useChartColors()` per la serie —
  nessun hex; Mono Mandate sui valori; checkbox subset senza overflow a 375px
- ARIA: segmented pill `role="tablist"` su view toggles (Evoluzione, Composizione, Raddoppi)
- Breakpoint: mobile inline legend non overflow; chart height adattivo
- Altro: pattern anomali o violazioni non elencate sopra

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
```

---

## Hall of Fame

```
/impeccable audit la pagina Hall of Fame

File: app/dashboard/hall-of-fame/page.tsx
Componenti: components/hall-of-fame/*,
            lib/constants/hallOfFame.ts

Assi da verificare (minimum — segnala anche eventuali altri problemi):
- Token: hero block, SpotlightCard divide-y rows, period/category pill — nessun hardcoded
- Gerarchia: hero valore con la scala corretta (`text-[44px] desktop:text-[54px] font-bold font-mono`) presente
- ARIA: mobile three-section nav pill `role="tablist"`; collapsible "Vedi tutti"
  `aria-expanded`; tabelle con `<th scope="col">`
- Breakpoint: tabelle full-height desktop (nessun `max-h` con doppio scroll);
  top-5 + collapsible mobile corretto su 375px
- Motion: `layoutId="hof-mobile-nav"` unico; spring (400/35)
- Altro: pattern anomali o violazioni non elencate sopra

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
```

---

## FIRE e Simulazioni

### Tab "FIRE Calculator"

```
/impeccable audit il tab "FIRE Calculator" della pagina FIRE e Simulazioni

File: app/dashboard/fire-simulations/page.tsx
Componenti: components/fire-simulations/FireCalculatorTab.tsx,
            components/fire-simulations/FIREProjectionSection.tsx,
            components/fire-simulations/FIREProjectionChart.tsx,
            components/fire-simulations/FireCalculatorSkeleton.tsx

Assi da verificare (minimum — segnala anche eventuali altri problemi):
- Token: sensitivity matrix — `color-mix()` non hex; flat metric rows — nessun hardcoded;
  "di cui illiquidi" in amber → `color-mix(in oklch, var(--warning) ...)` non `text-amber-*`
- Chart colors: `FIREProjectionChart` e scenario chart via `useChartColors()[4,0,1]`;
  tooltip via CSS vars
- ARIA: Settings `<Collapsible>` con `aria-expanded`; "Annulla" button con `aria-label`
- Motion: collapsible auto-open su `hasUnsavedChanges` via `useEffect` — non su ogni render
- Skeleton: `FireCalculatorSkeleton` isomorfo (hero → Settings → rows → projection)
- Altro: pattern anomali o violazioni non elencate sopra

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
```

### Tab "Coast FIRE"

```
/impeccable audit il tab "Coast FIRE" della pagina FIRE e Simulazioni

File: app/dashboard/fire-simulations/page.tsx
Componenti: components/fire-simulations/CoastFireTab.tsx,
            components/fire-simulations/CoastFireProjectionChart.tsx

Assi da verificare (minimum — segnala anche eventuali altri problemi):
- Token: scenari Bear/Base/Bull — `color-mix()` non `emerald/sky/amber` hardcoded;
  progress bar animata — fill via CSS var; pension state colors — `color-mix()` corretto
- Chart colors: `CoastFireProjectionChart` via `useChartColors()[4,0,1,2]`;
  target line `isAnimationActive={false}`; CartesianGrid via token
- ARIA: progress bar con `role="progressbar"`, `aria-valuenow/min/max`
- Breakpoint: pension UI 2-col su mobile (`grid-cols-2 items-start`); breakdown table
  non overflow; touch target trash icon ≥ 44px
- Altro: pattern anomali o violazioni non elencate sopra

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
```

### Tab "What If"

```
/impeccable audit il tab "What If" della pagina FIRE e Simulazioni

File: app/dashboard/fire-simulations/page.tsx
Componenti: components/fire-simulations/WhatIfAnalysisTab.tsx,
            components/fire-simulations/WhatIfSensitivitySection.tsx,
            components/fire-simulations/WhatIfAnalysisSkeleton.tsx

Assi da verificare (minimum — segnala anche eventuali altri problemi):
- Token: hero before→after custom block — colori "meno anni = meglio" via token,
  non sign-based hardcoded; sensitivity matrix — `color-mix()` non hex; event selector
  + scenario input cards — nessun `bg-gray-*`; empty-state Coast (manca `userAge`) via token
- Chart colors: eventuali chart before/after e celle sensitivity matrix via
  `useChartColors()` / `color-mix()` — nessun hex diretto
- Gerarchia: hero usa il blocco before→after custom (NON `HeroMetricBlock` — il suo
  coloring sign-based confligge con "meno anni = meglio"); impatto su FIRE e Coast in
  flat divide-y rows, nessun card-in-card
- Form-follows-function: ogni elemento dell'output (colore, freccia, delta) deve mappare
  una funzione — "meno anni al FIRE = meglio"; nessuna decorazione sign-based ereditata
- Motion: re-run baseline vs adjusted — nessuna animazione che riparte a ogni keystroke
  degli input scenario (ephemeral state); `layoutId` unico se presente una pill
- ARIA: event type selector con role appropriato; sensitivity matrix con `scope` su
  header/righe; empty-state Coast con messaggio descrittivo quando manca `userAge`
- Breakpoint: scenario inputs + sensitivity matrix non overflow su 375px;
  `max-desktop:portrait:pb-20`
- Selettore voci di entrata (evento "perdita di lavoro", `IncomeSourceSelector` inline in
  WhatIfAnalysisTab): albero categoria→sottocategoria con checkbox tri-state — ARIA `aria-checked`
  che riflette lo stato `indeterminate` sulla riga categoria; ogni riga-label tappabile con touch
  target ≥ 44px; "Tutte/Nessuna" raggiungibili da tastiera; nessun overflow a 375px
- Box esplicativo della scomposizione (dati usati + formule `min/max` → mancati risparmi vs spese
  dal portafoglio): Mono Mandate sui valori e sulle formule (`font-mono tabular-nums`); layout 2
  colonne da `desktop:` (1440px) con divisore 1px, colonna singola sotto; le formule non debordano
  a 320–375px; sub-tile `bg-muted/30` (no card-in-card)
- Skeleton: `WhatIfAnalysisSkeleton` isomorfo al layout reale
- Altro: pattern anomali o violazioni non elencate sopra

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
```

---

### Tab "Monte Carlo"

```
/impeccable audit il tab "Monte Carlo" della pagina FIRE e Simulazioni

File: app/dashboard/fire-simulations/page.tsx
Componenti: components/fire-simulations/MonteCarloTab.tsx,
            components/monte-carlo/*,
            components/fire-simulations/MonteCarloSkeleton.tsx

Assi da verificare (minimum — segnala anche eventuali altri problemi):
- Token: scenario card borders/bg via `color-mix()` — nessun hex; appendice collapsible
  wrapper — nessun `bg-gray-*`
- Chart colors: `SimulationChart` percentile lines via `useChartColors()` iniettati
  via Recharts `cloneElement`; tooltip via CSS vars
- ARIA: mode toggle `role="tablist"`; appendice `aria-expanded`; hero "--" pre-run
  ha `aria-label` che descrive lo stato "non ancora calcolato"
- Motion: `layoutId="montecarlo-mode-pill"` unico; spring (400/35)
- Skeleton: `MonteCarloSkeleton` isomorfo (hero → params compact → no 2-col grid)
- Altro: pattern anomali o violazioni non elencate sopra

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
```

### Tab "Obiettivi"

```
/impeccable audit il tab "Obiettivi" della pagina FIRE e Simulazioni

File: app/dashboard/fire-simulations/page.tsx
Componenti: components/fire-simulations/GoalBasedInvestingTab.tsx,
            components/goals/*,
            components/fire-simulations/GoalsSkeleton.tsx

Assi da verificare (minimum — segnala anche eventuali altri problemi):
- Token: chip verdetto (In linea/In ritardo/Raggiunto) e priorità via `goalVerdictMeta`
  (`text-positive`/`text-destructive`/`--chart-3`), NON raw `text-red-600`/`bg-amber-50`;
  colore identità del goal (color picker) resta grezzo SOLO su pallino/barra/linea proiezione
  (scelta utente legittima); `AllocationComparisonBar` via `useChartColors()` per le 6 classi
- Chart colors: `GoalProjectionChart` (glide-path) usa il colore identità del goal per area/linea,
  `var(--border)`/`var(--muted-foreground)` per griglia/reference, tooltip via CSS vars — nessun hex
- Gerarchia: hero `GoalsHero` con verdetto (no vanity metric "Progresso Medio"); lista ordinata
  per urgenza; asset assegnati flat divide-y (NON la vecchia tabella annidata); Mono Mandate sui valori
- KPI responsive: lista flat divide-y sotto desktop / chip grid al desktop (responsive duplication) —
  valore allineato a destra senza wrap su 375px; "Non assegnato" espandibile sugli asset liberi
- ARIA: barra avanzamento `role="progressbar"`, `aria-expanded` su expand row e su "Non assegnato",
  delete 2-click `aria-label` con stato "Conferma eliminazione"
- `AssetAssignmentDialog`: `trueAvail` (no `excludeGoalId`) per "Nessuna quota libera" — lo 0% mostra
  il messaggio corretto
- Pure layer: la matematica di traiettoria sta in `lib/utils/goalTrajectory.ts` (testata), NON inline
  nei componenti; i componenti solo fetch/memo/render
- Breakpoint: hero + lista + planner + timeline non overflow su 375px; GoalFormDialog color picker
  touch-friendly (≥ 32px per swatch); campo `monthlyContribution` presente nel form
- Skeleton: `GoalsSkeleton` isomorfo al layout (hero verdetto → KPI → lista)
- Altro: pattern anomali o violazioni non elencate sopra

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
```

---

## Assistente AI

```
/impeccable audit la pagina Assistente AI

File: app/dashboard/assistant/page.tsx
Componenti: components/assistant/*

Assi da verificare (minimum — segnala anche eventuali altri problemi):
- Token: scheda period-reactive (`renderPeriodScheda` / `PatrimonioTodayCard`) wrapper —
  nessun hardcoded; valori Δ → `text-positive`/`text-destructive` (token, non emerald/red);
  user bubble `bg-muted/40` (token ✓); memory badges (`AssistantMemoryFacts`) —
  `useChartColors()` + `color-mix()` (non emerald/blue/violet hardcoded); suggestion card
  (`AssistantSuggestionsBanner`) border/bg via `chartColors[0]` + `color-mix()` (non hardcoded)
- Chart colors: non applicabile (no Recharts in questa pagina)
- ARIA: `AssistantPeriodSelector` period axis `role="tablist"` + sub-picker; sheet
  Conversazioni/Memoria `role="dialog"`/`aria-modal` + focus trap (non più tab strip);
  `AssistantPreferencesPopover` controlli con label; memory badge `aria-label`;
  delete 2-click 3s auto-disarm con `aria-label`; SSE `status:'searching'` badge con `aria-live`
- Breakpoint: `grid-cols-1` + `min-w-0` su left column (fix overflow mobile); scheda come
  colonna destra solo desktop, mobile nell'empty-state + `AssistantContextPill` nell'header;
  composer slim (input+send) senza strip orizzontale che debordi
- Motion: `layoutId="assistant-mode-pill"` (in `AssistantPeriodSelector`) unico nella pagina;
  sheet open/close + `AnimatePresence` rispettano `useReducedMotion()`; spring (400/35)
- Skeleton: `AssistantPageSkeleton` isomorfo al layout reale (period axis → scheda →
  conversation → composer → right col)
- Altro: pattern anomali o violazioni non elencate sopra

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
```

---

## Impostazioni

```
/impeccable audit la pagina Impostazioni

File: app/dashboard/settings/page.tsx
Componenti: components/settings/SettingsPageSkeleton.tsx

Assi da verificare (minimum — segnala anche eventuali altri problemi):
- Token: tutti i form elements (Switch, Select, Input, Slider) — focus ring via CSS var,
  nessun `ring-blue-*`; sezione "Aspetto" theme selector grid — border active via token
- ARIA: Switch con `role="switch"`, `aria-checked`; Select con `aria-label`;
  Input con `<label>` associato; sezioni con heading hierarchy corretta (h2 → h3)
- Breakpoint: Tab → Radix Select su mobile (`desktop:hidden`/`hidden desktop:grid`);
  sub-category card headers `flex-col gap-2 desktop:flex-row` (titolo lungo + controlli);
  `max-desktop:portrait:pb-20` per bottom nav clearance
- Token selector (Aspetto): theme grid `grid-cols-2 sm:grid-cols-3 desktop:grid-cols-6` —
  swatches touch-friendly (≥ 44px); active theme border via token non hardcoded
- Skeleton: `SettingsPageSkeleton` isomorfo al layout reale
- Altro: pattern anomali o violazioni non elencate sopra

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
```

---

## Cross-cutting: Sistema di Shell e Layout Condivisi

```
/impeccable audit il sistema di shell e layout condivisi dell'app

Componenti: components/layout/PageContainer.tsx,
            components/layout/PageHeader.tsx,
            components/layout/PageTabBar.tsx,
            components/layout/PageTabs.tsx,
            components/layout/ThemePicker.tsx,
            lib/constants/navigation.ts

Questi file sono il guscio "interno" condiviso da tutte le pagine del dashboard
(9 pagine usano PageContainer/PageHeader; Cashflow, FIRE e Settings usano il pattern
multi-tab). L'audit verifica la meccanica del guscio, non il contenuto delle pagine.

Assi da verificare (minimum — segnala anche eventuali altri problemi — coerenza cross-pagina):
- PageContainer: `max-w-[1600px] mx-auto`, `space-y-4 desktop:space-y-6`,
  `max-desktop:portrait:pb-20` presente su tutte le pagine con bottom nav
- PageHeader: mobile sticky bar (h-14, backdrop-blur-sm, bg-background/95) non sovrappone
  il contenuto; desktop full header con border-b; nessun colore hardcoded
- Multi-tab shell (PageTabBar/PageTabs): desktop (≥1440px) → underline tab bar animata;
  mobile → Radix Select o segmented pill (`desktop:hidden` / `hidden desktop:block`);
  stato del tab attivo e deep-link coerenti tra Cashflow/FIRE/Settings
- ThemePicker: 6 temi, swatch touch-friendly (≥44px), tema attivo via token non hardcoded
- navigation.ts: single source per primaryNav/analysisNav/planningNav/secondaryHrefs —
  nessuna voce nav duplicata inline nelle pagine
- Motion: `layoutId` del tab indicator unico per pagina; spring 400/35; `useReducedMotion()`
- ARIA: PageTabBar `role="tablist"`/`role="tab"` + `aria-selected`; Select mobile con `aria-label`
- Form-follows-function: il guscio è chrome che deferisce al contenuto — ogni elemento
  svolge una funzione di struttura/navigazione, nessuna decorazione che competa col dato
- Altro: inconsistenze cross-pagina o pattern di shell non previsti dagli assi sopra

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
```

---

## Cross-cutting: Sistema dei Dialog

```
/impeccable audit il sistema dei dialog dell'app

Componenti: components/assets/AssetDialog.tsx,
            components/expenses/ExpenseDialog.tsx,
            components/goals/GoalFormDialog.tsx,
            components/goals/AssetAssignmentDialog.tsx,
            components/dividends/DividendDialog.tsx,
            components/dividends/DividendDetailsDialog.tsx,
            components/cashflow/CostCenterDialog.tsx,
            components/expenses/CategoryManagementDialog.tsx,
            components/layout/LogoutDialog.tsx,
            components/ui/responsive-modal.tsx

Assi da verificare (minimum — segnala anche eventuali altri problemi — coerenza cross-dialog):
- ResponsiveModal: l'astrazione `components/ui/responsive-modal.tsx` monta Dialog su desktop
  ↔ vaul Drawer su mobile (≤768px) — stesso breakpoint e comportamento per tutti i dialog
  che la usano (ExpenseDialog, CategoryManagementDialog)
- Struttura: tutti i dialog hanno `DialogTitle` + `DialogDescription` (accessibilità Radix)
- Token: header, footer, overlay backdrop — stessa vocabulary di token su tutti i dialog
- Footer pattern: bottone primario a destra, ghost/outline a sinistra — coerente?
- Size breakpoint: tutti usano lo stesso `max-w-*` su mobile vs desktop?
- 2-step flow (AssetDialog, ExpenseDialog): `AnimatePresence mode="wait"` presente,
  spring config (400/35), step indicator coerente tra i due dialog
- Loading state: `<Loader2 animate-spin>` su tutti i submit pending, non icone statiche
- Touch targets: close button e footer buttons ≥ 44px
- Altro: inconsistenze cross-dialog o pattern non previsti dagli assi sopra

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
```

---

## Cross-cutting: Sistema degli Skeleton

```
/impeccable audit il sistema degli skeleton dell'app

Componenti: components/fire-simulations/FireCalculatorSkeleton.tsx,
            components/fire-simulations/MonteCarloSkeleton.tsx,
            components/fire-simulations/GoalsSkeleton.tsx,
            components/fire-simulations/WhatIfAnalysisSkeleton.tsx,
            components/allocation/AllocationPageSkeleton.tsx,
            components/settings/SettingsPageSkeleton.tsx,
            components/assistant/AssistantPageSkeleton.tsx
            (+ skeleton inline in altri tab)

Assi da verificare (minimum — segnala anche eventuali altri problemi — coerenza cross-skeleton):
- Isomorfismo strutturale: ogni skeleton rispecchia il layout reale? Stessa altezza
  dei blocchi hero, stessa struttura delle righe flat
- Token: tutti i blocchi skeleton usano `bg-muted animate-pulse` — nessun `bg-gray-*`
- Hero block: tutti gli skeleton con hero hanno un blocco `h-12`/`h-14` in testa che
  corrisponde alla scala del page hero reale (`text-[44px] desktop:text-[54px]`)
- Coerenza: stessa `rounded-*`, stesso gap tra blocchi in tutti gli skeleton
- Altro: skeleton mancanti, disallineamenti strutturali o inconsistenze non elencate sopra

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
```

---

## Cross-cutting: Token Compliance Globale (tutti e 6 i temi)

```
/impeccable audit la token compliance globale su tutti i temi

File: app/globals.css
Componenti: tutti (scan selettivo sui file modificati di recente)

Questo audit verifica il sistema di token CSS in sé, non le singole pagine.

Assi da verificare (minimum — segnala anche eventuali altri problemi):
- `globals.css`: ogni tema (`data-theme="solar-dusk"` ecc.) definisce tutte le variabili
  necessarie — nessuna variabile mancante che causa fallback visivo inatteso
- Dark mode chroma: su temi dark, `--chart-1..5` hanno chroma ≥ 0.020 in oklch —
  altrimenti `useChartColors()` applica il fallback ma potrebbe mostrare colori spenti
- `color-mix()` usage: chiamate `color-mix(in oklch, var(--X) Y%, transparent)` —
  verifica che `--X` esista in tutti i 6 temi (light + dark)
- Nessun tema usa `!important` o override di classi Tailwind built-in che potrebbero
  creare conflitti con future versioni di Tailwind v4
- Altro: anomalie nel sistema di token non coperte dagli assi sopra

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
```

---

## Email Periodiche

> **Medium diverso.** L'audit standard verifica token / chart colors / breakpoint `desktop:` /
> ARIA `tablist` / Framer Motion — assi che NON esistono in un'email HTML. Qui gli assi sono
> propri del medium (vedi sotto). Verifica solo il piano **visivo/resa**; il piano **funzionale**
> (correttezza confronti, baseline, boundary periodi) è `/code-review` + Vitest, non audit impeccable.

```
/impeccable audit l'email periodica (riepilogo mensile / trimestrale / semestrale / annuale)

PRE-STEP — renderizza l'HTML prima di auditare (vedi critique): genera l'output di
`buildEmailHtml` (manual test-send o file `.html`) e aprilo in light/dark, desktop/mobile.

File: lib/server/monthlyEmailService.ts
      (buildEmailHtml, simpleMarkdownToHtml, buildComparisonSectionHtml, comparisonCell)
Contesto logico (non visivo): lib/server/emailPeriodComparison.ts,
      app/api/user/monthly-email/send/route.ts (render di test)

Assi da verificare (minimum — propri del medium email, NON gli assi del dashboard):
- Inline-CSS only: tutto lo styling è inline o in `<style>` whitelisted — gli hex hardcoded
  qui sono CORRETTI (i client non supportano CSS vars/token); NON segnalarli come violazione.
- Table-layout: struttura a `<table>`/`<td>`, larghezza max 600px centrata — non flex/grid.
- Mono sui numeri: patrimonio, %, € usano stack `'Geist Mono', ui-monospace, monospace`;
  tabella Confronti con allineamento tabellare (numeri a destra, colonne che leggono come colonne).
- Gerarchia: UN numero dominante (patrimonio netto) con eyebrow label; nessun numero secondario
  di pari peso; chrome achromatica con colore riservato ai delta sign-aware.
- Delta sign-semantics: verde positivo / rosso negativo, INVERTITO sulle Uscite (un +% di spesa
  è rosso); `comparisonCell` rispetta `higherIsBetter` per metrica.
- Markdown→HTML: simpleMarkdownToHtml rende le 5 sezioni del commento AI (heading, ol/ul,
  grassetti) senza `<br>` orfani, senza `<p>` vuoti, spacing coerente.
- Fallback: celle "N/D" pulite su baseline mancante; `previousEqualsYoy` (yearly) → colonna singola.
- Dark mode: presenza/assenza di `<meta name="color-scheme">` + `@media (prefers-color-scheme: dark)`
  (oggi assenti → light-only su `#ffffff` fisso; segnala come gap, non come pass/fail bloccante).
- Mobile: tabella Confronti non deborda a 320–375px; body ≥ 14px; singola colonna leggibile.
- Compat client: nessuna proprietà CSS non supportata da Gmail web/app, Apple Mail, Outlook.
- Accessibilità: `lang="it"`, header tabella semantici, contrasto AA del grigio su sfondo.
- Altro: pattern anomali o violazioni non elencate sopra.

Contesto:
- Leggi DESIGN.md (Mono Mandate, Zero-Chroma, Form Follows Function)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
```

---

## Ordine consigliato di esecuzione

Dalla maggiore probabilità di regressione alla minore:

**Dopo un redesign implementato (gate di compliance post craft + polish):**
1. Audit della pagina/tab appena modificata — assi token + chart colors + breakpoint
2. Cross-cutting dialog audit — se il redesign ha toccato dialog

**Come check standalone periodico:**
3. App Shell e Navigazione — ogni volta che si tocca layout.tsx o i componenti di nav
4. Cross-cutting Skeleton audit — dopo ogni redesign che cambia la struttura di una pagina
5. Token compliance globale — dopo l'aggiunta di nuovi componenti o temi
6. Landing + Auth — raramente cambiano, una volta ogni ciclo di redesign maggiore
