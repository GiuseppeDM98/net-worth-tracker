# Impeccable Audit Prompts

Prompt ottimizzati per `/impeccable audit` — compliance check mirato dopo l'implementazione
dei P0/P1 emersi da una critique, o come verifica standalone su assi specifici.

**Quando usarli:**
- Dopo aver implementato P0/P1 strutturali (prima di passare a polish) → verifica che
  i cambiamenti non abbiano introdotto regressioni nei punti di contatto
- Come check standalone periodico su un asse specifico (es. token compliance dopo
  aver aggiunto un nuovo componente)

**Differenza da critique:**
Audit = compliance pass/fail su assi precisi. Critique = valutazione olistica con score.
Audit è più veloce, non produce score, non sostituisce la critique di verifica finale.

**Assi di compliance per questo progetto:**
- **Token** — nessun `bg-gray-*`, `text-gray-*`, `dark:bg-*`, hex hardcoded; usa CSS vars
- **Chart colors** — tutte le serie Recharts via `useChartColors()`; tooltip via CSS vars
  (`var(--card)` bg, `var(--card-foreground)` label); nessun hex o `fill="currentColor"` diretto
- **Gerarchia Trade Republic** — hero block presente (`text-4xl font-bold font-mono`),
  `divide-y` flat rows, nessun card-in-card, nessun side-stripe border
- **Breakpoint** — `md:` → `desktop:` (≥ 1440px); `sm:` solo dove corretto;
  `max-desktop:portrait:pb-20` su pagine con bottom nav; `landscape:` per casi specifici
- **Motion** — `useReducedMotion()` o `MotionConfig reducedMotion="user"` attivo;
  spring configs consistenti (`stiffness: 400, damping: 35`); `layoutId` unici per pagina
- **ARIA** — `role="tablist/tab"` su pill selectors, `role="progressbar"` su barre,
  `aria-label` su bottoni icon-only, `aria-expanded` su collapsible
- **Skeleton** — ogni sezione async ha uno skeleton strutturalmente isomorfo al layout reale

**Sequenza corretta:**
```
critique → shape (P0/P1) → implementa → audit → polish (P2/P3) → critique di verifica
```

---

## App Shell e Navigazione

### Dashboard Layout + Shell

```
/impeccable audit lo shell della dashboard

File: app/dashboard/layout.tsx,
      app/dashboard/template.tsx

Assi da verificare (minimum — segnala anche eventuali altri problemi):
- Token: `bg-gray-50`/`dark:bg-gray-950` nel <main> → devono essere CSS vars
- Breakpoint: `md:p-6` → deve essere `desktop:p-6`; verifica padding bottom per bottom nav
  (`max-desktop:portrait:[padding-bottom:calc(env(safe-area-inset-bottom,0px)+88px)]`)
- Demo banner (AssistenteBanner): token compliance, nessun colore hardcoded
- Landscape mobile header (SidebarTrigger bar): altezza, padding, token
- Page transitions in template.tsx: `useReducedMotion()` rispettato, nessun layout thrash
- Altro: pattern anomali o violazioni non elencate sopra

Contesto:
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
- ARIA: `nav`, `aria-label`, voce attiva con `aria-current="page"`
- Dark mode: contrasto voce attiva e hover su sfondo `--sidebar-background`
- Altro: pattern anomali o violazioni non elencate sopra

Contesto:
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
- Safe area: `padding-bottom: env(safe-area-inset-bottom)` per iPhone con notch
- Touch targets: ogni voce ≥ 44×44px
- Visibilità: solo `max-desktop:portrait:flex` — nascosta in landscape e desktop
- ARIA: `role="navigation"`, `aria-label`, `aria-current="page"` sulla voce attiva
- Motion: tab switch animation rispetta `useReducedMotion()`
- Altro: pattern anomali o violazioni non elencate sopra

Contesto:
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
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
```

---

## Cashflow

### Tab "Analisi"

```
/impeccable audit il tab "Analisi" della pagina Cashflow

File: app/dashboard/cashflow/page.tsx
Componenti: components/cashflow/AnalisiTab.tsx,
            components/cashflow/CashflowSankeyChart.tsx

Assi da verificare (minimum — segnala anche eventuali altri problemi):
- Token: nessun hardcoded nel Sankey (nodi, link, tooltip), nei KPI hero blocks,
  nel TopExpensesBlock (importi rossi — usa `text-destructive`?)
- Chart colors: Sankey node colors via `useChartColors()` o CSS vars; 9 trend charts via
  `useChartColors()` — nessun hex diretto
- Breakpoint: pill 3-state (Anno Corrente/Anno/Storico) corretto su 375px; TopExpensesBlock
  non overflow su mobile
- Motion: `key={periodLabel}` su TopExpensesBlock per reset `showAll`; pill animation (400/35)
- ARIA: pill selector `role="tablist"`, Sankey drill-down breadcrumb accessibile
- Altro: pattern anomali o violazioni non elencate sopra

Contesto:
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
```

### Tab "Dividendi"

```
/impeccable audit il tab "Dividendi" della pagina Cashflow

File: app/dashboard/cashflow/page.tsx
Componenti: components/dividends/DividendTrackingTab.tsx,
            components/dividends/DividendCalendar.tsx,
            components/dividends/DividendTable.tsx,
            components/dividends/DividendDetailsDialog.tsx,
            components/dividends/DividendStats.tsx,
            components/dividends/DividendDialog.tsx

Assi da verificare (minimum — segnala anche eventuali altri problemi):
- Token: calendario (day active, day hover, today highlight) — nessun hardcoded;
  DividendStats cards — nessun `bg-blue-*` o simili; badge tipo dividendo via CSS var
- Chart colors: eventuali grafici in DividendStats via `useChartColors()`
- Gerarchia: hero YOC/totale dividendi presente e `text-4xl font-bold font-mono`?
  (se assente è P1 per la critique, non per questo audit)
- Breakpoint: calendario non overflow su 375px; DividendTable scroll orizzontale su mobile
- ARIA: calendario con `aria-label` sui giorni, `aria-selected` sul giorno attivo;
  DividendDetailsDialog con `role="dialog"`, `aria-modal`, focus trap
- Altro: pattern anomali o violazioni non elencate sopra

Contesto:
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
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
```

### Tab "Budget"

```
/impeccable audit il tab "Budget" della pagina Cashflow

File: app/dashboard/cashflow/page.tsx
Componenti: components/cashflow/BudgetTab.tsx

Assi da verificare (minimum — segnala anche eventuali altri problemi):
- Token: progress bars — nessun `bg-blue-*` hardcoded; over-budget → `bg-destructive`
  o `color-mix()` non hex; under-budget → colore da token
- Gerarchia: percentuale budget `font-mono`, label categoria plain — nessun card-in-card
- ARIA: progress bar con `role="progressbar"`, `aria-valuenow`, `aria-valuemin/max`
- Breakpoint: lista budget non overflow su 375px
- Altro: pattern anomali o violazioni non elencate sopra

Contesto:
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
- Token: KPI cards per centro, grafico spesa mensile via `useChartColors()`,
  tabella transazioni — nessun hardcoded
- Chart colors: grafico mensile via `useChartColors()`; tooltip via CSS vars
- ARIA: delete/rename con `aria-label`; CostCenterDialog con `DialogDescription`
- Breakpoint: CostCenterDetail non overflow su mobile
- Altro: pattern anomali o violazioni non elencate sopra

Contesto:
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
- Token: `ActionChip` (COMPRA/VENDI/OK) — colori via token, non hardcoded;
  `AllocationProgressBar` — fill via token o `color-mix()`; tabella desktop 5-col — nessun
  hardcoded su header e celle
- Chart colors: eventuali grafici in ExposureSection via `useChartColors()`
- ARIA: `AllocationProgressBar` con `role="progressbar"`, `aria-valuenow/min/max`;
  ActionChip con `aria-label` descrittivo
- Breakpoint: ExposureSection drill-down (azienda/settore/ETF) non overflow su mobile
- Skeleton: `AllocationPageSkeleton` isomorfo al layout reale
- Altro: pattern anomali o violazioni non elencate sopra

Contesto:
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
- Token: sezione Lavoro & Investimenti flat rows — nessun hardcoded; Appendice collapsible
  wrapper — nessun `bg-gray-*`
- Chart colors: tutti i chart (Evoluzione, Composizione, Raddoppi, Labor) via
  `useChartColors()`; tooltip via CSS vars; mobile inline legend usa stessi colori
- ARIA: Appendice `<Collapsible>` con `aria-expanded`; segmented pill `role="tablist"`
- Breakpoint: mobile inline legend non overflow; chart height adattivo
- Altro: pattern anomali o violazioni non elencate sopra

Contesto:
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
- Gerarchia: hero valore `text-4xl font-bold font-mono` presente
- ARIA: mobile three-section nav pill `role="tablist"`; collapsible "Vedi tutti"
  `aria-expanded`; tabelle con `<th scope="col">`
- Breakpoint: tabelle full-height desktop (nessun `max-h` con doppio scroll);
  top-5 + collapsible mobile corretto su 375px
- Motion: `layoutId="hof-mobile-nav"` unico; spring (400/35)
- Altro: pattern anomali o violazioni non elencate sopra

Contesto:
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
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
```

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
- Token: colore goal personalizzato (color picker) — usato via `color-mix()` per bg/border,
  nessun override hardcoded; `AllocationComparisonBar` via `useChartColors()` per le 6 classi
- ARIA: goal list `role="progressbar"` su barra avanzamento, `aria-expanded` su expand row,
  delete 2-click `aria-label` con stato "Conferma eliminazione"
- `AssetAssignmentDialog`: `trueAvail` (no `excludeGoalId`) per "Nessuna quota libera" —
  verifica che lo 0% mostri il messaggio corretto
- Breakpoint: hero + flat list non overflow su 375px; GoalFormDialog color picker
  touch-friendly (≥ 32px per swatch)
- Skeleton: `GoalsSkeleton` isomorfo al nuovo layout (hero → flat list)
- Altro: pattern anomali o violazioni non elencate sopra

Contesto:
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
- Token: hero patrimonio wrapper — nessun hardcoded; user bubble `bg-muted/40` (token ✓);
  memory badges — `useChartColors()` + `color-mix()` (non emerald/blue/violet hardcoded);
  suggestion card border/bg via `chartColors[0]` + `color-mix()` (non hardcoded)
- Chart colors: non applicabile (no Recharts in questa pagina)
- ARIA: mode strip `role="tablist"`; Conversazioni/Memoria tab strip `role="tablist"`;
  memory badge `aria-label`; delete 2-click 3s auto-disarm con `aria-label`
- Breakpoint: `grid-cols-1` + `min-w-0` su left column (fix overflow mobile);
  composer context chip strip senza `-mx-4` (fix horizontal overflow su mobile)
- Motion: `layoutId="assistant-mode-pill"` e `layoutId="assistant-sidebar-tab-pill"`
  unici nella pagina; spring (400/35)
- Skeleton: `AssistantPageSkeleton` isomorfo al layout reale (mode strip → hero →
  conversation → composer → right col)
- Altro: pattern anomali o violazioni non elencate sopra

Contesto:
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
            components/layout/LogoutDialog.tsx

Assi da verificare (minimum — segnala anche eventuali altri problemi — coerenza cross-dialog):
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
            components/allocation/AllocationPageSkeleton.tsx,
            components/settings/SettingsPageSkeleton.tsx,
            components/assistant/AssistantPageSkeleton.tsx
            (+ skeleton inline in altri tab)

Assi da verificare (minimum — segnala anche eventuali altri problemi — coerenza cross-skeleton):
- Isomorfismo strutturale: ogni skeleton rispecchia il layout reale? Stessa altezza
  dei blocchi hero, stessa struttura delle righe flat
- Token: tutti i blocchi skeleton usano `bg-muted animate-pulse` — nessun `bg-gray-*`
- Hero block: tutti gli skeleton con hero hanno un blocco `h-10` o `h-12` in testa
  che corrisponde al `text-4xl` del layout reale
- Coerenza: stessa `rounded-*`, stesso gap tra blocchi in tutti gli skeleton
- Altro: skeleton mancanti, disallineamenti strutturali o inconsistenze non elencate sopra

Contesto:
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
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
```

---

## Ordine consigliato di esecuzione

Dalla maggiore probabilità di regressione alla minore:

**Dopo implementazione P0/P1 strutturali (gate prima del polish):**
1. Audit della pagina/tab appena modificata — assi token + chart colors + breakpoint
2. Cross-cutting dialog audit — se il redesign ha toccato dialog

**Come check standalone periodico:**
3. App Shell e Navigazione — ogni volta che si tocca layout.tsx o i componenti di nav
4. Cross-cutting Skeleton audit — dopo ogni redesign che cambia la struttura di una pagina
5. Token compliance globale — dopo l'aggiunta di nuovi componenti o temi
6. Landing + Auth — raramente cambiano, una volta ogni ciclo di redesign maggiore
