# Impeccable Polish Prompts

Prompt ottimizzati per `/impeccable polish` da lanciare dopo shape + implementazione.

**Quando usarli:** dopo aver risolto i P0/P1 con shape, per finalizzare i P2/P3 rimasti.
Se la critique ha trovato solo P2/P3 (nessun problema strutturale), puoi lanciare
polish direttamente senza passare per shape.

**Come usarli:** sostituisci `[SLUG]` con il path del file `.impeccable/critique/` generato
dalla critique corrispondente. `/impeccable polish` legge lo slug per i P2/P3 da fixare —
non aggiungere altro contesto prescrittivo, il file ha già tutto.

**Sequenza corretta:**
```
critique → (shape → implementazione) → polish → critique di verifica
```

---

## Panoramica

```
/impeccable polish la pagina Panoramica

Priority issues (P2/P3) da: [SLUG]
File: app/dashboard/page.tsx
Componenti: components/dashboard/*

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma) e APPLICALA mentre scrivi codice
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALA mentre scrivi codice
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALA mentre scrivi codice
```

---

## Patrimonio

```
/impeccable polish la pagina Patrimonio

Priority issues (P2/P3) da: [SLUG]
File: app/dashboard/assets/page.tsx
Componenti: components/assets/AssetManagementTab.tsx,
            components/assets/AssetCard.tsx,
            components/assets/AssetMobileSummary.tsx,
            components/assets/AssetSparkline.tsx,
            components/assets/AssetDialog.tsx,
            components/dashboard/OverviewAnimatedCurrency.tsx,
            components/dashboard/NetWorthSparkline.tsx

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma) e APPLICALA mentre scrivi codice
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALA mentre scrivi codice
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALA mentre scrivi codice
```

---

## Cashflow

### Tab "Dividendi"

```
/impeccable polish il tab "Dividendi" della pagina Cashflow

Priority issues (P2/P3) da: [SLUG]
File: app/dashboard/cashflow/page.tsx
Componenti: components/dividends/DividendTrackingTab.tsx,
            components/dividends/DividendCalendar.tsx,
            components/dividends/DividendTable.tsx,
            components/dividends/DividendDetailsDialog.tsx,
            components/dividends/DividendStats.tsx,
            components/dividends/DividendDialog.tsx

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma) e APPLICALA mentre scrivi codice
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALA mentre scrivi codice
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALA mentre scrivi codice
```

### Tab "Tracciamento" *(mobileLabel: "Spese")*

```
/impeccable polish il tab "Tracciamento" della pagina Cashflow

Priority issues (P2/P3) da: [SLUG]
File: app/dashboard/cashflow/page.tsx
Componenti: components/cashflow/ExpenseTrackingTab.tsx,
            components/expenses/ExpenseDialog.tsx

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma) e APPLICALA mentre scrivi codice
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALA mentre scrivi codice
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALA mentre scrivi codice
```

### Tab "Budget"

```
/impeccable polish il tab "Budget" della pagina Cashflow

Priority issues (P2/P3) da: [SLUG]
File: app/dashboard/cashflow/page.tsx
Componenti: components/cashflow/BudgetTab.tsx

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma) e APPLICALA mentre scrivi codice
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALA mentre scrivi codice
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALA mentre scrivi codice
```

### Tab "Centri di Costo"

```
/impeccable polish il tab "Centri di Costo" della pagina Cashflow

Priority issues (P2/P3) da: [SLUG]
File: app/dashboard/cashflow/page.tsx
Componenti: components/cashflow/CostCentersTab.tsx,
            components/cashflow/CostCenterDetail.tsx,
            components/cashflow/CostCenterDialog.tsx

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma) e APPLICALA mentre scrivi codice
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALA mentre scrivi codice
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALA mentre scrivi codice
```

---

## Analisi

```
/impeccable polish la pagina Analisi

Priority issues (P2/P3) da: [SLUG]
File: app/dashboard/analisi/page.tsx
Componenti: components/cashflow/AnalisiTab.tsx,
            components/cashflow/CashflowSankeyChart.tsx,
            components/cashflow/AnomalieBlock.tsx,
            components/cashflow/ConfrontoAnnualeSection.tsx,
            components/cashflow/SavingsRateTrendSection.tsx,
            components/cashflow/CategoryTrendsGrid.tsx

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma) e APPLICALA mentre scrivi codice
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALA mentre scrivi codice
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALA mentre scrivi codice
```

---

## Allocazione

```
/impeccable polish la pagina Allocazione

Priority issues (P2/P3) da: [SLUG]
File: app/dashboard/allocation/page.tsx
Componenti: components/allocation/*

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma) e APPLICALA mentre scrivi codice
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALA mentre scrivi codice
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALA mentre scrivi codice
```

---

## Rendimenti

```
/impeccable polish la pagina Rendimenti

Priority issues (P2/P3) da: [SLUG]
File: app/dashboard/performance/page.tsx
Componenti: components/performance/*

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma) e APPLICALA mentre scrivi codice
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALA mentre scrivi codice
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALA mentre scrivi codice
```

---

## Storico

```
/impeccable polish la pagina Storico

Priority issues (P2/P3) da: [SLUG]
File: app/dashboard/history/page.tsx
Componenti: components/history/*,
            components/dashboard/LaborMetricsChart.tsx

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma) e APPLICALA mentre scrivi codice
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALA mentre scrivi codice
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALA mentre scrivi codice
```

---

## Hall of Fame

```
/impeccable polish la pagina Hall of Fame

Priority issues (P2/P3) da: [SLUG]
File: app/dashboard/hall-of-fame/page.tsx
Componenti: components/hall-of-fame/*,
            lib/constants/hallOfFame.ts

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma) e APPLICALA mentre scrivi codice
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALA mentre scrivi codice
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALA mentre scrivi codice
```

---

## FIRE e Simulazioni

### Tab "FIRE Calculator"

```
/impeccable polish il tab "FIRE Calculator" della pagina FIRE e Simulazioni

Priority issues (P2/P3) da: [SLUG]
File: app/dashboard/fire-simulations/page.tsx
Componenti: components/fire-simulations/FireCalculatorTab.tsx,
            components/fire-simulations/FIREProjectionSection.tsx,
            components/fire-simulations/FIREProjectionChart.tsx,
            components/fire-simulations/FireCalculatorSkeleton.tsx

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma) e APPLICALA mentre scrivi codice
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALA mentre scrivi codice
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALA mentre scrivi codice
```

### Tab "Coast FIRE"

```
/impeccable polish il tab "Coast FIRE" della pagina FIRE e Simulazioni

Priority issues (P2/P3) da: [SLUG]
File: app/dashboard/fire-simulations/page.tsx
Componenti: components/fire-simulations/CoastFireTab.tsx,
            components/fire-simulations/CoastFireProjectionChart.tsx

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma) e APPLICALA mentre scrivi codice
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALA mentre scrivi codice
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALA mentre scrivi codice
```

### Tab "What If"

```
/impeccable polish il tab "What If" della pagina FIRE e Simulazioni

Priority issues (P2/P3) da: [SLUG]
File: app/dashboard/fire-simulations/page.tsx
Componenti: components/fire-simulations/WhatIfAnalysisTab.tsx,
            components/fire-simulations/WhatIfSensitivitySection.tsx,
            components/fire-simulations/WhatIfAnalysisSkeleton.tsx

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma) e APPLICALA mentre scrivi codice
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALA mentre scrivi codice
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALA mentre scrivi codice
```

---

### Tab "Monte Carlo"

```
/impeccable polish il tab "Monte Carlo" della pagina FIRE e Simulazioni

Priority issues (P2/P3) da: [SLUG]
File: app/dashboard/fire-simulations/page.tsx
Componenti: components/fire-simulations/MonteCarloTab.tsx,
            components/monte-carlo/*,
            components/fire-simulations/MonteCarloSkeleton.tsx

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma) e APPLICALA mentre scrivi codice
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALA mentre scrivi codice
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALA mentre scrivi codice
```

### Tab "Obiettivi"

```
/impeccable polish il tab "Obiettivi" della pagina FIRE e Simulazioni

Priority issues (P2/P3) da: [SLUG]
File: app/dashboard/fire-simulations/page.tsx
Componenti: components/fire-simulations/GoalBasedInvestingTab.tsx,
            components/goals/*,
            components/fire-simulations/GoalsSkeleton.tsx

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma) e APPLICALA mentre scrivi codice
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALA mentre scrivi codice
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALA mentre scrivi codice
```

---

## Assistente AI

```
/impeccable polish la pagina Assistente AI

Priority issues (P2/P3) da: [SLUG]
File: app/dashboard/assistant/page.tsx
Componenti: components/assistant/*

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma) e APPLICALA mentre scrivi codice
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALA mentre scrivi codice
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALA mentre scrivi codice
```

---

## Impostazioni

```
/impeccable polish la pagina Impostazioni

Priority issues (P2/P3) da: [SLUG]
File: app/dashboard/settings/page.tsx
Componenti: components/settings/SettingsPageSkeleton.tsx

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma) e APPLICALA mentre scrivi codice
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALA mentre scrivi codice
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALA mentre scrivi codice
```

---

## App Shell e Navigazione

```
/impeccable polish l'app shell e la navigazione

Priority issues (P2/P3) da: [SLUG]
File: app/dashboard/layout.tsx,
      app/dashboard/template.tsx
Componenti: components/layout/Sidebar.tsx,
            components/layout/BottomNavigation.tsx,
            components/layout/SecondaryMenuDrawer.tsx,
            components/layout/AssistenteBanner.tsx,
            components/layout/LogoutDialog.tsx

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma) e APPLICALA mentre scrivi codice
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALA mentre scrivi codice
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALA mentre scrivi codice
```

---

## Landing e Auth

### Landing Page

```
/impeccable polish la landing page

Priority issues (P2/P3) da: [SLUG]
File: app/page.tsx

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma) e APPLICALA mentre scrivi codice
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALA mentre scrivi codice
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALA mentre scrivi codice
```

### Login e Register

```
/impeccable polish le pagine Login e Register

Priority issues (P2/P3) da: [SLUG]
File: app/login/page.tsx,
      app/register/page.tsx

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma) e APPLICALA mentre scrivi codice
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALA mentre scrivi codice
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALA mentre scrivi codice
```

---

## Cross-cutting: Sistema di Shell e Layout Condivisi

```
/impeccable polish il sistema di shell e layout condivisi dell'app

Priority issues (P2/P3) da: [SLUG]
Componenti: components/layout/PageContainer.tsx,
            components/layout/PageHeader.tsx,
            components/layout/PageTabBar.tsx,
            components/layout/PageTabs.tsx,
            components/layout/ThemePicker.tsx,
            lib/constants/navigation.ts

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma) e APPLICALA mentre scrivi codice
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALA mentre scrivi codice
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALA mentre scrivi codice
```

---

## Cross-cutting: Sistema dei Dialog

```
/impeccable polish il sistema dei dialog dell'app

Priority issues (P2/P3) da: [SLUG]
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

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma) e APPLICALA mentre scrivi codice
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALA mentre scrivi codice
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALA mentre scrivi codice
```

---

## Email Periodiche

> Probabilmente il comando impeccable **più direttamente utile** per "il testo formattato
> nella mail": rifinire la tabella Confronti, le 5 sezioni del commento AI, spacing, microcopy
> italiano, allineamento dei numeri. Lancia polish dopo che la critique (o critique+shape) ha
> prodotto i P2/P3. Renderizza l'HTML mentre rifinisci, per vedere il risultato reale.
> Il piano funzionale (logica confronti, prompt AI) resta fuori — è `/code-review` + Vitest.

```
/impeccable polish l'email periodica (riepilogo mensile / trimestrale / semestrale / annuale)

Priority issues (P2/P3) da: [SLUG]
File: lib/server/monthlyEmailService.ts
      (buildEmailHtml, simpleMarkdownToHtml, buildComparisonSectionHtml, comparisonCell)
Contesto logico (non visivo): lib/server/emailPeriodComparison.ts,
      app/api/user/monthly-email/send/route.ts (render di test)

Nota medium: stili inline + hex hardcoded sono OBBLIGATORI (NON migrarli a token/CSS vars —
i client email non li supportano); layout a tabelle, max 600px. Mantieni: numeri in stack
monospace con allineamento tabellare (Mono Mandate), delta sign-aware con semantica invertita
sulle Uscite, chrome achromatica (Zero-Chroma — colore solo sui delta), separazione via
border-bottom (no box annidati). Cura la fedeltà markdown→HTML e i fallback "N/D".

Contesto:
- Leggi DESIGN.md (Mono Mandate, Zero-Chroma, Form Follows Function)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALA mentre scrivi codice
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALA mentre scrivi codice
```
