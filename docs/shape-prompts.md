# Impeccable Shape Prompts

Prompt ottimizzati per `/impeccable shape` da lanciare dopo una critique con P0/P1 strutturali.

**Quando usarli:** solo se la critique ha trovato P0/P1 che richiedono un rethink
architetturale. Non lanciare shape se la critique ha trovato solo P2/P3 — vai diretto a polish.

**Come usarli:** sostituisci `[SLUG]` con il path del file `.impeccable/critique/` generato
dalla critique corrispondente.

**Sequenza corretta:**
```
critique → shape (P0/P1) → implementazione → polish (P2/P3) → critique di verifica
```

---

## Panoramica

```
/impeccable shape la pagina Panoramica

Priority issues (P0/P1) da: [SLUG]
File: app/dashboard/page.tsx
Componenti: components/dashboard/*

Confronta con: Patrimonio (stesso hero [2fr_1fr] condiviso), Rendimenti (hero TWR),
Storico (hero patrimonio), Goals (hero allocato).
Design language atteso: Trade Republic hierarchy (text-4xl font-bold font-mono hero,
divide-y flat rows, no card-in-card), useChartColors() per tutte le serie grafiche,
token compliance su tutti e 6 i temi dell'app.

Contesto:
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALA mentre scrivi codice
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALA mentre scrivi codice
```

---

## Patrimonio

```
/impeccable shape la pagina Patrimonio

Priority issues (P0/P1) da: [SLUG]
File: app/dashboard/assets/page.tsx
Componenti: components/assets/AssetManagementTab.tsx,
            components/assets/AssetCard.tsx,
            components/assets/AssetMobileSummary.tsx,
            components/assets/AssetSparkline.tsx,
            components/assets/AssetDialog.tsx,
            components/dashboard/OverviewAnimatedCurrency.tsx,
            components/dashboard/NetWorthSparkline.tsx

Pagina unica (nessun tab): Header → Hero [2fr_1fr] (identico a Panoramica,
condivide useDashboardOverview RQ cache) → CashAccountsSection (grid cards
conti correnti) → AssetManagementTab (tabella ordinabile, group-by-class,
sparkline per asset, 2-click delete, AssetDialog 2-step).
Confronta con: Panoramica (stesso hero layout — usa come riferimento primario),
AllocationCard (flat divide-y), GoalDetailCard (expand/collapse inline).
Design language atteso: Trade Republic hierarchy (text-4xl font-bold font-mono hero,
divide-y flat rows, no card-in-card), useChartColors() per tutte le serie grafiche,
token compliance su tutti e 6 i temi dell'app.

Contesto:
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALA mentre scrivi codice
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALA mentre scrivi codice
```

---

## Cashflow

### Tab "Dividendi"

```
/impeccable shape il tab "Dividendi" della pagina Cashflow

Priority issues (P0/P1) da: [SLUG]
File: app/dashboard/cashflow/page.tsx
Componenti: components/dividends/DividendTrackingTab.tsx,
            components/dividends/DividendCalendar.tsx,
            components/dividends/DividendTable.tsx,
            components/dividends/DividendDetailsDialog.tsx,
            components/dividends/DividendStats.tsx,
            components/dividends/DividendDialog.tsx

Confronta con: Hall of Fame (tabelle flat), Cashflow/Analisi (period-based data).
Design language atteso: Trade Republic hierarchy (text-4xl font-bold font-mono hero,
divide-y flat rows, no card-in-card), useChartColors() per tutte le serie grafiche,
token compliance su tutti e 6 i temi dell'app.

Contesto:
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALA mentre scrivi codice
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALA mentre scrivi codice
```

### Tab "Tracciamento" *(mobileLabel: "Spese")*

```
/impeccable shape il tab "Tracciamento" della pagina Cashflow

Priority issues (P0/P1) da: [SLUG]
File: app/dashboard/cashflow/page.tsx
Componenti: components/cashflow/ExpenseTrackingTab.tsx,
            components/expenses/ExpenseDialog.tsx

Confronta con: AssetManagementTab (lista + dialog 2-step), GoalDetailCard (delete pattern).
Design language atteso: Trade Republic hierarchy (text-4xl font-bold font-mono hero,
divide-y flat rows, no card-in-card), useChartColors() per tutte le serie grafiche,
token compliance su tutti e 6 i temi dell'app.

Contesto:
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALA mentre scrivi codice
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALA mentre scrivi codice
```

### Tab "Budget"

```
/impeccable shape il tab "Budget" della pagina Cashflow

Priority issues (P0/P1) da: [SLUG]
File: app/dashboard/cashflow/page.tsx
Componenti: components/cashflow/BudgetTab.tsx

Confronta con: AllocationCard (progress bar + target%), GoalDetailCard (% display).
Design language atteso: Trade Republic hierarchy (text-4xl font-bold font-mono hero,
divide-y flat rows, no card-in-card), useChartColors() per tutte le serie grafiche,
token compliance su tutti e 6 i temi dell'app.

Contesto:
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALA mentre scrivi codice
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALA mentre scrivi codice
```

### Tab "Centri di Costo"

```
/impeccable shape il tab "Centri di Costo" della pagina Cashflow

Priority issues (P0/P1) da: [SLUG]
File: app/dashboard/cashflow/page.tsx
Componenti: components/cashflow/CostCentersTab.tsx,
            components/cashflow/CostCenterDetail.tsx,
            components/cashflow/CostCenterDialog.tsx

Confronta con: GoalBasedInvestingTab (assegnazione risorse), ExpenseTrackingTab (tabella).
Design language atteso: Trade Republic hierarchy (text-4xl font-bold font-mono hero,
divide-y flat rows, no card-in-card), useChartColors() per tutte le serie grafiche,
token compliance su tutti e 6 i temi dell'app.

Contesto:
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALA mentre scrivi codice
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALA mentre scrivi codice
```

---

## Analisi

```
/impeccable shape la pagina Analisi

Priority issues (P0/P1) da: [SLUG]
File: app/dashboard/analisi/page.tsx
Componenti: components/cashflow/AnalisiTab.tsx,
            components/cashflow/CashflowSankeyChart.tsx,
            components/cashflow/AnomalieBlock.tsx,
            components/cashflow/ConfrontoAnnualeSection.tsx,
            components/cashflow/SavingsRateTrendSection.tsx,
            components/cashflow/CategoryTrendsGrid.tsx

Confronta con: Cashflow/Tracciamento (dati condivisi via RQ cache),
Rendimenti (period selector), Storico (narrative order + collapsible).
Design language atteso: Trade Republic hierarchy (text-4xl font-bold font-mono hero,
divide-y flat rows, no card-in-card), useChartColors() per tutte le serie grafiche,
token compliance su tutti e 6 i temi dell'app.

Contesto:
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALA mentre scrivi codice
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALA mentre scrivi codice
```

---

## Allocazione

```
/impeccable shape la pagina Allocazione

Priority issues (P0/P1) da: [SLUG]
File: app/dashboard/allocation/page.tsx
Componenti: components/allocation/*

Confronta con: Rendimenti (MetricSection flat rows), Patrimonio (sortable table).
Design language atteso: Trade Republic hierarchy (text-4xl font-bold font-mono hero,
divide-y flat rows, no card-in-card), useChartColors() per tutte le serie grafiche,
token compliance su tutti e 6 i temi dell'app.

Contesto:
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALA mentre scrivi codice
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALA mentre scrivi codice
```

---

## Rendimenti

```
/impeccable shape la pagina Rendimenti

Priority issues (P0/P1) da: [SLUG]
File: app/dashboard/performance/page.tsx
Componenti: components/performance/*

Confronta con: Storico (hero patrimonio + CAGR), Goals (hero allocato).
Design language atteso: Trade Republic hierarchy (text-4xl font-bold font-mono hero,
divide-y flat rows, no card-in-card), useChartColors() per tutte le serie grafiche,
token compliance su tutti e 6 i temi dell'app.

Contesto:
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALA mentre scrivi codice
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALA mentre scrivi codice
```

---

## Storico

```
/impeccable shape la pagina Storico

Priority issues (P0/P1) da: [SLUG]
File: app/dashboard/history/page.tsx
Componenti: components/history/*,
            components/dashboard/LaborMetricsChart.tsx

Confronta con: Rendimenti (period selector), Hall of Fame (tabelle flat + hero).
Design language atteso: Trade Republic hierarchy (text-4xl font-bold font-mono hero,
divide-y flat rows, no card-in-card), useChartColors() per tutte le serie grafiche,
token compliance su tutti e 6 i temi dell'app.

Contesto:
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALA mentre scrivi codice
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALA mentre scrivi codice
```

---

## Hall of Fame

```
/impeccable shape la pagina Hall of Fame

Priority issues (P0/P1) da: [SLUG]
File: app/dashboard/hall-of-fame/page.tsx
Componenti: components/hall-of-fame/*,
            lib/constants/hallOfFame.ts

Confronta con: Storico (hero + narrative sections), Rendimenti (period selector).
Design language atteso: Trade Republic hierarchy (text-4xl font-bold font-mono hero,
divide-y flat rows, no card-in-card), useChartColors() per tutte le serie grafiche,
token compliance su tutti e 6 i temi dell'app.

Contesto:
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALA mentre scrivi codice
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALA mentre scrivi codice
```

---

## FIRE e Simulazioni

### Tab "FIRE Calculator"

```
/impeccable shape il tab "FIRE Calculator" della pagina FIRE e Simulazioni

Priority issues (P0/P1) da: [SLUG]
File: app/dashboard/fire-simulations/page.tsx
Componenti: components/fire-simulations/FireCalculatorTab.tsx,
            components/fire-simulations/FIREProjectionSection.tsx,
            components/fire-simulations/FIREProjectionChart.tsx,
            components/fire-simulations/FireCalculatorSkeleton.tsx

Confronta con: Monte Carlo (hero + collapsible), Goals (hero allocato), Coast FIRE.
Design language atteso: Trade Republic hierarchy (text-4xl font-bold font-mono hero,
divide-y flat rows, no card-in-card), useChartColors() per tutte le serie grafiche,
token compliance su tutti e 6 i temi dell'app.

Contesto:
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALA mentre scrivi codice
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALA mentre scrivi codice
```

### Tab "Coast FIRE"

```
/impeccable shape il tab "Coast FIRE" della pagina FIRE e Simulazioni

Priority issues (P0/P1) da: [SLUG]
File: app/dashboard/fire-simulations/page.tsx
Componenti: components/fire-simulations/CoastFireTab.tsx,
            components/fire-simulations/CoastFireProjectionChart.tsx

Confronta con: FIRE Calculator (stesso hero + Settings pattern), Monte Carlo (scenarios).
Design language atteso: Trade Republic hierarchy (text-4xl font-bold font-mono hero,
divide-y flat rows, no card-in-card), useChartColors() per tutte le serie grafiche,
token compliance su tutti e 6 i temi dell'app.

Contesto:
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALA mentre scrivi codice
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALA mentre scrivi codice
```

### Tab "Monte Carlo"

```
/impeccable shape il tab "Monte Carlo" della pagina FIRE e Simulazioni

Priority issues (P0/P1) da: [SLUG]
File: app/dashboard/fire-simulations/page.tsx
Componenti: components/fire-simulations/MonteCarloTab.tsx,
            components/monte-carlo/*,
            components/fire-simulations/MonteCarloSkeleton.tsx

Confronta con: FIRE Calculator (hero + collapsible), Coast FIRE (scenarios).
Design language atteso: Trade Republic hierarchy (text-4xl font-bold font-mono hero,
divide-y flat rows, no card-in-card), useChartColors() per tutte le serie grafiche,
token compliance su tutti e 6 i temi dell'app.

Contesto:
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALA mentre scrivi codice
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALA mentre scrivi codice
```

### Tab "Obiettivi"

```
/impeccable shape il tab "Obiettivi" della pagina FIRE e Simulazioni

Priority issues (P0/P1) da: [SLUG]
File: app/dashboard/fire-simulations/page.tsx
Componenti: components/fire-simulations/GoalBasedInvestingTab.tsx,
            components/goals/*,
            components/fire-simulations/GoalsSkeleton.tsx

Confronta con: FIRE Calculator (hero pattern), Allocazione (ActionChip, target%).
Design language atteso: Trade Republic hierarchy (text-4xl font-bold font-mono hero,
divide-y flat rows, no card-in-card), useChartColors() per tutte le serie grafiche,
token compliance su tutti e 6 i temi dell'app.

Contesto:
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALA mentre scrivi codice
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALA mentre scrivi codice
```

---

## Assistente AI

```
/impeccable shape la pagina Assistente AI

Priority issues (P0/P1) da: .impeccable/critique/2026-05-24T05-46-56Z__app-dashboard-assistant-page-tsx.md
File: app/dashboard/assistant/page.tsx
Componenti: components/assistant/*

Confronta con: Rendimenti (hero number + data-first), Storico (narrative order),
Goals (flat divide-y list).
Design language atteso: Trade Republic hierarchy (text-4xl font-bold font-mono hero,
divide-y flat rows, no card-in-card), useChartColors() per tutte le serie grafiche,
token compliance su tutti e 6 i temi dell'app.

Contesto:
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALA mentre scrivi codice
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALA mentre scrivi codice
```

---

## Impostazioni

```
/impeccable shape la pagina Impostazioni

Priority issues (P0/P1) da: [SLUG]
File: app/dashboard/settings/page.tsx
Componenti: components/settings/SettingsPageSkeleton.tsx

Confronta con: nessuna pagina specifica — verifica che i componenti form usino
la stessa vocabulary degli altri form dell'app.
Design language atteso: Trade Republic hierarchy (text-4xl font-bold font-mono hero,
divide-y flat rows, no card-in-card), useChartColors() per tutte le serie grafiche,
token compliance su tutti e 6 i temi dell'app.

Contesto:
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALA mentre scrivi codice
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALA mentre scrivi codice
```

---

## App Shell e Navigazione

```
/impeccable shape l'app shell e la navigazione

Priority issues (P0/P1) da: [SLUG]
File: app/dashboard/layout.tsx,
      app/dashboard/template.tsx
Componenti: components/layout/Sidebar.tsx,
            components/layout/BottomNavigation.tsx,
            components/layout/SecondaryMenuDrawer.tsx,
            components/layout/AssistenteBanner.tsx,
            components/layout/LogoutDialog.tsx

Confronta con: nessuna pagina specifica — il benchmark è la coerenza interna tra
sidebar desktop, bottom nav mobile e secondary drawer. Verifica che i token
--sidebar-* siano correttamente applicati su tutti e 6 i temi.
Design language atteso: Trade Republic hierarchy (text-4xl font-bold font-mono hero,
divide-y flat rows, no card-in-card), useChartColors() per tutte le serie grafiche,
token compliance su tutti e 6 i temi dell'app.

Contesto:
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALA mentre scrivi codice
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALA mentre scrivi codice
```

---

## Landing e Auth

### Landing Page

```
/impeccable shape la landing page

Priority issues (P0/P1) da: [SLUG]
File: app/page.tsx

Confronta con: Panoramica (stesso brand, gerarchia coerente), Rendimenti (hero number).
Design language atteso: Trade Republic hierarchy (text-4xl font-bold font-mono hero,
divide-y flat rows, no card-in-card), useChartColors() per tutte le serie grafiche,
token compliance su tutti e 6 i temi dell'app.

Contesto:
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALA mentre scrivi codice
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALA mentre scrivi codice
```

### Login e Register

```
/impeccable shape le pagine Login e Register

Priority issues (P0/P1) da: [SLUG]
File: app/login/page.tsx,
      app/register/page.tsx

Confronta con: Impostazioni (stessa vocabulary form: Input, Button, label/focus ring),
Landing (stesso brand entry point, coerenza visiva).
Design language atteso: Trade Republic hierarchy (text-4xl font-bold font-mono hero,
divide-y flat rows, no card-in-card), useChartColors() per tutte le serie grafiche,
token compliance su tutti e 6 i temi dell'app.

Contesto:
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALA mentre scrivi codice
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALA mentre scrivi codice
```

---

## Cross-cutting: Sistema dei Dialog

```
/impeccable shape il sistema dei dialog dell'app

Priority issues (P0/P1) da: [SLUG]
Componenti: components/assets/AssetDialog.tsx,
            components/expenses/ExpenseDialog.tsx,
            components/goals/GoalFormDialog.tsx,
            components/goals/AssetAssignmentDialog.tsx,
            components/dividends/DividendDialog.tsx,
            components/dividends/DividendDetailsDialog.tsx,
            components/cashflow/CostCenterDialog.tsx,
            components/layout/LogoutDialog.tsx

Confronta con: ogni dialog rispetto agli altri — il benchmark è la coerenza interna.
I P0/P1 su questo sistema riguardano tipicamente: struttura mancante (DialogDescription
assente), footer pattern inconsistente, sizing breakpoint difformi, motion non uniforme.
Design language atteso: Trade Republic hierarchy (text-4xl font-bold font-mono hero,
divide-y flat rows, no card-in-card), useChartColors() per tutte le serie grafiche,
token compliance su tutti e 6 i temi dell'app.

Contesto:
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALA mentre scrivi codice
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALA mentre scrivi codice
```
