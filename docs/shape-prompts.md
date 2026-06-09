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
Design language atteso (vedi DESIGN.md): North Star "Effortless Precision" — Linear/Vercel +
Trade Republic + Apple, sotto la legge Form Follows Function (onestà, deferenza, inevitabilità:
ogni proprietà visiva è conseguenza di una funzione, mai decorazione). Scala hero: page hero
text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em], section hero text-[36px],
sub-hero text-[22px] (mai text-4xl/text-2xl per un hero). Mono Mandate: ogni numero in Geist Mono
+ tabular-nums. Zero-Chroma + Data Owns Color: chrome achromatica, il colore lo possiede il dato
(chart e temi). Gerarchia Trade Republic (un numero dominante, flat divide-y rows, no card-in-card),
useChartColors() per ogni serie grafica, token OKLCH compliance su tutti e 6 i temi.

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
AllocationBreakdown (flat divide-y rows), GoalDetailCard (expand/collapse inline).
Design language atteso (vedi DESIGN.md): North Star "Effortless Precision" — Linear/Vercel +
Trade Republic + Apple, sotto la legge Form Follows Function (onestà, deferenza, inevitabilità:
ogni proprietà visiva è conseguenza di una funzione, mai decorazione). Scala hero: page hero
text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em], section hero text-[36px],
sub-hero text-[22px] (mai text-4xl/text-2xl per un hero). Mono Mandate: ogni numero in Geist Mono
+ tabular-nums. Zero-Chroma + Data Owns Color: chrome achromatica, il colore lo possiede il dato
(chart e temi). Gerarchia Trade Republic (un numero dominante, flat divide-y rows, no card-in-card),
useChartColors() per ogni serie grafica, token OKLCH compliance su tutti e 6 i temi.

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
Design language atteso (vedi DESIGN.md): North Star "Effortless Precision" — Linear/Vercel +
Trade Republic + Apple, sotto la legge Form Follows Function (onestà, deferenza, inevitabilità:
ogni proprietà visiva è conseguenza di una funzione, mai decorazione). Scala hero: page hero
text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em], section hero text-[36px],
sub-hero text-[22px] (mai text-4xl/text-2xl per un hero). Mono Mandate: ogni numero in Geist Mono
+ tabular-nums. Zero-Chroma + Data Owns Color: chrome achromatica, il colore lo possiede il dato
(chart e temi). Gerarchia Trade Republic (un numero dominante, flat divide-y rows, no card-in-card),
useChartColors() per ogni serie grafica, token OKLCH compliance su tutti e 6 i temi.

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma) e APPLICALA mentre scrivi codice
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
Design language atteso (vedi DESIGN.md): North Star "Effortless Precision" — Linear/Vercel +
Trade Republic + Apple, sotto la legge Form Follows Function (onestà, deferenza, inevitabilità:
ogni proprietà visiva è conseguenza di una funzione, mai decorazione). Scala hero: page hero
text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em], section hero text-[36px],
sub-hero text-[22px] (mai text-4xl/text-2xl per un hero). Mono Mandate: ogni numero in Geist Mono
+ tabular-nums. Zero-Chroma + Data Owns Color: chrome achromatica, il colore lo possiede il dato
(chart e temi). Gerarchia Trade Republic (un numero dominante, flat divide-y rows, no card-in-card),
useChartColors() per ogni serie grafica, token OKLCH compliance su tutti e 6 i temi.

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma) e APPLICALA mentre scrivi codice
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
Componenti: components/cashflow/BudgetTab.tsx,
            components/cashflow/budget/BudgetList.tsx,
            components/cashflow/budget/BudgetItemDialog.tsx,
            components/cashflow/budget/BudgetSettingsCard.tsx,
            components/cashflow/budget/BudgetForecastCard.tsx,
            components/cashflow/budget/BudgetInsightsCard.tsx,
            components/cashflow/budget/BudgetAlertsBanner.tsx

Confronta con: Allocazione/RebalancePlan (lista firmata con priorità — pattern simile a BudgetList),
GoalDetailCard (progress bar + target%).
Design language atteso (vedi DESIGN.md): North Star "Effortless Precision" — Linear/Vercel +
Trade Republic + Apple, sotto la legge Form Follows Function (onestà, deferenza, inevitabilità:
ogni proprietà visiva è conseguenza di una funzione, mai decorazione). Scala hero: page hero
text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em], section hero text-[36px],
sub-hero text-[22px] (mai text-4xl/text-2xl per un hero). Mono Mandate: ogni numero in Geist Mono
+ tabular-nums. Zero-Chroma + Data Owns Color: chrome achromatica, il colore lo possiede il dato
(chart e temi). Gerarchia Trade Republic (un numero dominante, flat divide-y rows, no card-in-card),
useChartColors() per ogni serie grafica, token OKLCH compliance su tutti e 6 i temi.

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma) e APPLICALA mentre scrivi codice
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
Design language atteso (vedi DESIGN.md): North Star "Effortless Precision" — Linear/Vercel +
Trade Republic + Apple, sotto la legge Form Follows Function (onestà, deferenza, inevitabilità:
ogni proprietà visiva è conseguenza di una funzione, mai decorazione). Scala hero: page hero
text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em], section hero text-[36px],
sub-hero text-[22px] (mai text-4xl/text-2xl per un hero). Mono Mandate: ogni numero in Geist Mono
+ tabular-nums. Zero-Chroma + Data Owns Color: chrome achromatica, il colore lo possiede il dato
(chart e temi). Gerarchia Trade Republic (un numero dominante, flat divide-y rows, no card-in-card),
useChartColors() per ogni serie grafica, token OKLCH compliance su tutti e 6 i temi.

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
/impeccable shape la pagina Analisi

Priority issues (P0/P1) da: [SLUG]
File: app/dashboard/analisi/page.tsx
Componenti: components/cashflow/AnalisiTab.tsx,
            components/cashflow/CashflowSankeyChart.tsx,
            components/cashflow/AnomalieBlock.tsx,
            components/cashflow/ConfrontoAnnualeSection.tsx,
            components/cashflow/SavingsRateTrendSection.tsx,
            components/cashflow/CategoryTrendsGrid.tsx,
            components/cashflow/AndamentoStoricoSection.tsx
Pure layer: lib/utils/cashflowTimeSeries.ts

Confronta con: Cashflow/Tracciamento (dati condivisi via RQ cache),
Rendimenti (period selector), Storico (narrative order + collapsible).
Design language atteso (vedi DESIGN.md): North Star "Effortless Precision" — Linear/Vercel +
Trade Republic + Apple, sotto la legge Form Follows Function (onestà, deferenza, inevitabilità:
ogni proprietà visiva è conseguenza di una funzione, mai decorazione). Scala hero: page hero
text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em], section hero text-[36px],
sub-hero text-[22px] (mai text-4xl/text-2xl per un hero). Mono Mandate: ogni numero in Geist Mono
+ tabular-nums. Zero-Chroma + Data Owns Color: chrome achromatica, il colore lo possiede il dato
(chart e temi). Gerarchia Trade Republic (un numero dominante, flat divide-y rows, no card-in-card),
useChartColors() per ogni serie grafica, token OKLCH compliance su tutti e 6 i temi.

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
/impeccable shape la pagina Allocazione

Priority issues (P0/P1) da: [SLUG]
File: app/dashboard/allocation/page.tsx
Componenti: components/allocation/*

Confronta con: Rendimenti (MetricSection flat rows), Patrimonio (sortable table).
Design language atteso (vedi DESIGN.md): North Star "Effortless Precision" — Linear/Vercel +
Trade Republic + Apple, sotto la legge Form Follows Function (onestà, deferenza, inevitabilità:
ogni proprietà visiva è conseguenza di una funzione, mai decorazione). Scala hero: page hero
text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em], section hero text-[36px],
sub-hero text-[22px] (mai text-4xl/text-2xl per un hero). Mono Mandate: ogni numero in Geist Mono
+ tabular-nums. Zero-Chroma + Data Owns Color: chrome achromatica, il colore lo possiede il dato
(chart e temi). Gerarchia Trade Republic (un numero dominante, flat divide-y rows, no card-in-card),
useChartColors() per ogni serie grafica, token OKLCH compliance su tutti e 6 i temi.

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
/impeccable shape la pagina Rendimenti

Priority issues (P0/P1) da: [SLUG]
File: app/dashboard/performance/page.tsx
Componenti: components/performance/*

Confronta con: Storico (hero patrimonio + CAGR), Goals (hero allocato).
Design language atteso (vedi DESIGN.md): North Star "Effortless Precision" — Linear/Vercel +
Trade Republic + Apple, sotto la legge Form Follows Function (onestà, deferenza, inevitabilità:
ogni proprietà visiva è conseguenza di una funzione, mai decorazione). Scala hero: page hero
text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em], section hero text-[36px],
sub-hero text-[22px] (mai text-4xl/text-2xl per un hero). Mono Mandate: ogni numero in Geist Mono
+ tabular-nums. Zero-Chroma + Data Owns Color: chrome achromatica, il colore lo possiede il dato
(chart e temi). Gerarchia Trade Republic (un numero dominante, flat divide-y rows, no card-in-card),
useChartColors() per ogni serie grafica, token OKLCH compliance su tutti e 6 i temi.

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
/impeccable shape la pagina Storico

Priority issues (P0/P1) da: [SLUG]
File: app/dashboard/history/page.tsx
Componenti: components/history/*,
            components/dashboard/LaborMetricsChart.tsx

Include la sezione "Valore per Strumento" (`MonthlyAssetBreakdownSection`): tabella per-strumento
del mese scelto + somma del sottoinsieme selezionato + trend cross-mese con `TrendTooltip` custom
che scompone la variazione in effetto prezzo vs effetto quantità (pure layer
`lib/utils/snapshotAssetBreakdown.ts`).
Confronta con: Rendimenti (period selector), Hall of Fame (tabelle flat + hero).
Design language atteso (vedi DESIGN.md): North Star "Effortless Precision" — Linear/Vercel +
Trade Republic + Apple, sotto la legge Form Follows Function (onestà, deferenza, inevitabilità:
ogni proprietà visiva è conseguenza di una funzione, mai decorazione). Scala hero: page hero
text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em], section hero text-[36px],
sub-hero text-[22px] (mai text-4xl/text-2xl per un hero). Mono Mandate: ogni numero in Geist Mono
+ tabular-nums. Zero-Chroma + Data Owns Color: chrome achromatica, il colore lo possiede il dato
(chart e temi). Gerarchia Trade Republic (un numero dominante, flat divide-y rows, no card-in-card),
useChartColors() per ogni serie grafica, token OKLCH compliance su tutti e 6 i temi.

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
/impeccable shape la pagina Hall of Fame

Priority issues (P0/P1) da: [SLUG]
File: app/dashboard/hall-of-fame/page.tsx
Componenti: components/hall-of-fame/*,
            lib/constants/hallOfFame.ts

Confronta con: Storico (hero + narrative sections), Rendimenti (period selector).
Design language atteso (vedi DESIGN.md): North Star "Effortless Precision" — Linear/Vercel +
Trade Republic + Apple, sotto la legge Form Follows Function (onestà, deferenza, inevitabilità:
ogni proprietà visiva è conseguenza di una funzione, mai decorazione). Scala hero: page hero
text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em], section hero text-[36px],
sub-hero text-[22px] (mai text-4xl/text-2xl per un hero). Mono Mandate: ogni numero in Geist Mono
+ tabular-nums. Zero-Chroma + Data Owns Color: chrome achromatica, il colore lo possiede il dato
(chart e temi). Gerarchia Trade Republic (un numero dominante, flat divide-y rows, no card-in-card),
useChartColors() per ogni serie grafica, token OKLCH compliance su tutti e 6 i temi.

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
/impeccable shape il tab "FIRE Calculator" della pagina FIRE e Simulazioni

Priority issues (P0/P1) da: [SLUG]
File: app/dashboard/fire-simulations/page.tsx
Componenti: components/fire-simulations/FireCalculatorTab.tsx,
            components/fire-simulations/FIREProjectionSection.tsx,
            components/fire-simulations/FIREProjectionChart.tsx,
            components/fire-simulations/FireCalculatorSkeleton.tsx

Confronta con: Monte Carlo (hero + collapsible), Goals (hero allocato), Coast FIRE.
Design language atteso (vedi DESIGN.md): North Star "Effortless Precision" — Linear/Vercel +
Trade Republic + Apple, sotto la legge Form Follows Function (onestà, deferenza, inevitabilità:
ogni proprietà visiva è conseguenza di una funzione, mai decorazione). Scala hero: page hero
text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em], section hero text-[36px],
sub-hero text-[22px] (mai text-4xl/text-2xl per un hero). Mono Mandate: ogni numero in Geist Mono
+ tabular-nums. Zero-Chroma + Data Owns Color: chrome achromatica, il colore lo possiede il dato
(chart e temi). Gerarchia Trade Republic (un numero dominante, flat divide-y rows, no card-in-card),
useChartColors() per ogni serie grafica, token OKLCH compliance su tutti e 6 i temi.

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma) e APPLICALA mentre scrivi codice
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
Design language atteso (vedi DESIGN.md): North Star "Effortless Precision" — Linear/Vercel +
Trade Republic + Apple, sotto la legge Form Follows Function (onestà, deferenza, inevitabilità:
ogni proprietà visiva è conseguenza di una funzione, mai decorazione). Scala hero: page hero
text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em], section hero text-[36px],
sub-hero text-[22px] (mai text-4xl/text-2xl per un hero). Mono Mandate: ogni numero in Geist Mono
+ tabular-nums. Zero-Chroma + Data Owns Color: chrome achromatica, il colore lo possiede il dato
(chart e temi). Gerarchia Trade Republic (un numero dominante, flat divide-y rows, no card-in-card),
useChartColors() per ogni serie grafica, token OKLCH compliance su tutti e 6 i temi.

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma) e APPLICALA mentre scrivi codice
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALA mentre scrivi codice
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALA mentre scrivi codice
```

### Tab "What If"

```
/impeccable shape il tab "What If" della pagina FIRE e Simulazioni

Priority issues (P0/P1) da: [SLUG]
File: app/dashboard/fire-simulations/page.tsx
Componenti: components/fire-simulations/WhatIfAnalysisTab.tsx,
            components/fire-simulations/WhatIfSensitivitySection.tsx,
            components/fire-simulations/WhatIfAnalysisSkeleton.tsx

Tab che simula eventi di vita (perdita lavoro, acquisto importante, variazione
risparmio/spesa, windfall) e mostra l'impatto before→after su FIRE tradizionale e
Coast FIRE, ri-eseguendo le pure functions di fireService su baseline vs adjusted.
L'evento "perdita di lavoro" lascia selezionare le voci di entrata che vengono a mancare
(`IncomeSourceSelector` inline: albero categoria→sottocategoria, checkbox tri-state,
default = `laborIncomeCategoryIds`) e mostra un box esplicativo con i dati usati + le formule
`min/max` della scomposizione (mancati risparmi vs spese dal portafoglio), layout 2 colonne da
`desktop:`. Hero con blocco before→after custom (non HeroMetricBlock — il sign-coloring confligge
con "meno anni = meglio"). Ospita la matrice "Sensibilità Anni al FIRE" rilocata
(baseline locale ri-centrabile). Impatto Coast richiede settings.userAge, altrimenti empty-state.
Confronta con: FIRE Calculator + Coast FIRE (riusa le stesse fireService functions +
hero pattern), Monte Carlo (scenario inputs + collapsible).
Design language atteso (vedi DESIGN.md): North Star "Effortless Precision" — Linear/Vercel +
Trade Republic + Apple, sotto la legge Form Follows Function (onestà, deferenza, inevitabilità:
ogni proprietà visiva è conseguenza di una funzione, mai decorazione). Scala hero: page hero
text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em], section hero text-[36px],
sub-hero text-[22px] (mai text-4xl/text-2xl per un hero). Mono Mandate: ogni numero in Geist Mono
+ tabular-nums. Zero-Chroma + Data Owns Color: chrome achromatica, il colore lo possiede il dato
(chart e temi). Gerarchia Trade Republic (un numero dominante, flat divide-y rows, no card-in-card),
useChartColors() per ogni serie grafica, token OKLCH compliance su tutti e 6 i temi.

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
/impeccable shape il tab "Monte Carlo" della pagina FIRE e Simulazioni

Priority issues (P0/P1) da: [SLUG]
File: app/dashboard/fire-simulations/page.tsx
Componenti: components/fire-simulations/MonteCarloTab.tsx,
            components/monte-carlo/*,
            components/fire-simulations/MonteCarloSkeleton.tsx

Confronta con: FIRE Calculator (hero + collapsible), Coast FIRE (scenarios).
Design language atteso (vedi DESIGN.md): North Star "Effortless Precision" — Linear/Vercel +
Trade Republic + Apple, sotto la legge Form Follows Function (onestà, deferenza, inevitabilità:
ogni proprietà visiva è conseguenza di una funzione, mai decorazione). Scala hero: page hero
text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em], section hero text-[36px],
sub-hero text-[22px] (mai text-4xl/text-2xl per un hero). Mono Mandate: ogni numero in Geist Mono
+ tabular-nums. Zero-Chroma + Data Owns Color: chrome achromatica, il colore lo possiede il dato
(chart e temi). Gerarchia Trade Republic (un numero dominante, flat divide-y rows, no card-in-card),
useChartColors() per ogni serie grafica, token OKLCH compliance su tutti e 6 i temi.

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma) e APPLICALA mentre scrivi codice
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
Design language atteso (vedi DESIGN.md): North Star "Effortless Precision" — Linear/Vercel +
Trade Republic + Apple, sotto la legge Form Follows Function (onestà, deferenza, inevitabilità:
ogni proprietà visiva è conseguenza di una funzione, mai decorazione). Scala hero: page hero
text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em], section hero text-[36px],
sub-hero text-[22px] (mai text-4xl/text-2xl per un hero). Mono Mandate: ogni numero in Geist Mono
+ tabular-nums. Zero-Chroma + Data Owns Color: chrome achromatica, il colore lo possiede il dato
(chart e temi). Gerarchia Trade Republic (un numero dominante, flat divide-y rows, no card-in-card),
useChartColors() per ogni serie grafica, token OKLCH compliance su tutti e 6 i temi.

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
/impeccable shape la pagina Assistente AI

Priority issues (P0/P1) da: [SLUG]
File: app/dashboard/assistant/page.tsx
Componenti: components/assistant/*

Confronta con: Rendimenti (hero number + data-first), Storico (narrative order),
Goals (flat divide-y list).
Design language atteso (vedi DESIGN.md): North Star "Effortless Precision" — Linear/Vercel +
Trade Republic + Apple, sotto la legge Form Follows Function (onestà, deferenza, inevitabilità:
ogni proprietà visiva è conseguenza di una funzione, mai decorazione). Scala hero: page hero
text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em], section hero text-[36px],
sub-hero text-[22px] (mai text-4xl/text-2xl per un hero). Mono Mandate: ogni numero in Geist Mono
+ tabular-nums. Zero-Chroma + Data Owns Color: chrome achromatica, il colore lo possiede il dato
(chart e temi). Gerarchia Trade Republic (un numero dominante, flat divide-y rows, no card-in-card),
useChartColors() per ogni serie grafica, token OKLCH compliance su tutti e 6 i temi.

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
/impeccable shape la pagina Impostazioni

Priority issues (P0/P1) da: [SLUG]
File: app/dashboard/settings/page.tsx
Componenti: components/settings/SettingsPageSkeleton.tsx

Confronta con: nessuna pagina specifica — verifica che i componenti form usino
la stessa vocabulary degli altri form dell'app.
Design language atteso (vedi DESIGN.md): North Star "Effortless Precision" — Linear/Vercel +
Trade Republic + Apple, sotto la legge Form Follows Function (onestà, deferenza, inevitabilità:
ogni proprietà visiva è conseguenza di una funzione, mai decorazione). Scala hero: page hero
text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em], section hero text-[36px],
sub-hero text-[22px] (mai text-4xl/text-2xl per un hero). Mono Mandate: ogni numero in Geist Mono
+ tabular-nums. Zero-Chroma + Data Owns Color: chrome achromatica, il colore lo possiede il dato
(chart e temi). Gerarchia Trade Republic (un numero dominante, flat divide-y rows, no card-in-card),
useChartColors() per ogni serie grafica, token OKLCH compliance su tutti e 6 i temi.

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
Design language atteso (vedi DESIGN.md): North Star "Effortless Precision" — Linear/Vercel +
Trade Republic + Apple, sotto la legge Form Follows Function (onestà, deferenza, inevitabilità:
ogni proprietà visiva è conseguenza di una funzione, mai decorazione). Scala hero: page hero
text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em], section hero text-[36px],
sub-hero text-[22px] (mai text-4xl/text-2xl per un hero). Mono Mandate: ogni numero in Geist Mono
+ tabular-nums. Zero-Chroma + Data Owns Color: chrome achromatica, il colore lo possiede il dato
(chart e temi). Gerarchia Trade Republic (un numero dominante, flat divide-y rows, no card-in-card),
useChartColors() per ogni serie grafica, token OKLCH compliance su tutti e 6 i temi.

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
/impeccable shape la landing page

Priority issues (P0/P1) da: [SLUG]
File: app/page.tsx

Confronta con: Panoramica (stesso brand, gerarchia coerente), Rendimenti (hero number).
Design language atteso (vedi DESIGN.md): North Star "Effortless Precision" — Linear/Vercel +
Trade Republic + Apple, sotto la legge Form Follows Function (onestà, deferenza, inevitabilità:
ogni proprietà visiva è conseguenza di una funzione, mai decorazione). Scala hero: page hero
text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em], section hero text-[36px],
sub-hero text-[22px] (mai text-4xl/text-2xl per un hero). Mono Mandate: ogni numero in Geist Mono
+ tabular-nums. Zero-Chroma + Data Owns Color: chrome achromatica, il colore lo possiede il dato
(chart e temi). Gerarchia Trade Republic (un numero dominante, flat divide-y rows, no card-in-card),
useChartColors() per ogni serie grafica, token OKLCH compliance su tutti e 6 i temi.

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma) e APPLICALA mentre scrivi codice
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
Design language atteso (vedi DESIGN.md): North Star "Effortless Precision" — Linear/Vercel +
Trade Republic + Apple, sotto la legge Form Follows Function (onestà, deferenza, inevitabilità:
ogni proprietà visiva è conseguenza di una funzione, mai decorazione). Scala hero: page hero
text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em], section hero text-[36px],
sub-hero text-[22px] (mai text-4xl/text-2xl per un hero). Mono Mandate: ogni numero in Geist Mono
+ tabular-nums. Zero-Chroma + Data Owns Color: chrome achromatica, il colore lo possiede il dato
(chart e temi). Gerarchia Trade Republic (un numero dominante, flat divide-y rows, no card-in-card),
useChartColors() per ogni serie grafica, token OKLCH compliance su tutti e 6 i temi.

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
/impeccable shape il sistema di shell e layout condivisi dell'app

Priority issues (P0/P1) da: [SLUG]
Componenti: components/layout/PageContainer.tsx,
            components/layout/PageHeader.tsx,
            components/layout/PageTabBar.tsx,
            components/layout/PageTabs.tsx,
            components/layout/ThemePicker.tsx,
            lib/constants/navigation.ts

Guscio "interno" condiviso da tutte le pagine: PageContainer (wrapper max-w + spacing +
bottom-nav clearance), PageHeader (sticky mobile bar ↔ desktop header), pattern multi-tab
(PageTabBar underline desktop ↔ Radix Select / segmented pill mobile), ThemePicker,
navigation.ts (nav arrays centralizzati). I P0/P1 qui riguardano tipicamente: meccanica
tab incoerente tra pagine, sticky header che sovrappone, layoutId duplicati, breakpoint errati.
Confronta con: App Shell e Navigazione (sidebar/bottom-nav/drawer = guscio "esterno");
il benchmark è la coerenza del guscio su Cashflow/FIRE/Settings e sulle pagine single-scroll.
Design language atteso (vedi DESIGN.md): North Star "Effortless Precision" — Linear/Vercel +
Trade Republic + Apple, sotto la legge Form Follows Function (onestà, deferenza, inevitabilità:
ogni proprietà visiva è conseguenza di una funzione, mai decorazione). Scala hero: page hero
text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em], section hero text-[36px],
sub-hero text-[22px] (mai text-4xl/text-2xl per un hero). Mono Mandate: ogni numero in Geist Mono
+ tabular-nums. Zero-Chroma + Data Owns Color: chrome achromatica, il colore lo possiede il dato
(chart e temi). Gerarchia Trade Republic (un numero dominante, flat divide-y rows, no card-in-card),
useChartColors() per ogni serie grafica, token OKLCH compliance su tutti e 6 i temi.

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
/impeccable shape il sistema dei dialog dell'app

Priority issues (P0/P1) da: [SLUG]
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

Confronta con: ogni dialog rispetto agli altri — il benchmark è la coerenza interna.
I P0/P1 su questo sistema riguardano tipicamente: struttura mancante (DialogDescription
assente), footer pattern inconsistente, sizing breakpoint difformi, motion non uniforme.
Convergenza su ResponsiveModal: quando un fix struttura un dialog-form, preferisci la migrazione a
`components/ui/responsive-modal.tsx` (Dialog su desktop ↔ bottom-sheet Drawer su mobile ≤768px da una
sola API) invece di reimplementare lo split useMediaQuery + Dialog/Drawer a mano — è l'astrazione target
per uniformare le modali. Caveat: default max-w-4xl (override via dialogClassName), footer risolto dal
chiamante; conferme piccole e flussi speciali (AssetDialog 2-step) possono restare Dialog. Vedi
AGENTS.md → "Responsive Modals".
Design language atteso (vedi DESIGN.md): North Star "Effortless Precision" — Linear/Vercel +
Trade Republic + Apple, sotto la legge Form Follows Function (onestà, deferenza, inevitabilità:
ogni proprietà visiva è conseguenza di una funzione, mai decorazione). Scala hero: page hero
text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em], section hero text-[36px],
sub-hero text-[22px] (mai text-4xl/text-2xl per un hero). Mono Mandate: ogni numero in Geist Mono
+ tabular-nums. Zero-Chroma + Data Owns Color: chrome achromatica, il colore lo possiede il dato
(chart e temi). Gerarchia Trade Republic (un numero dominante, flat divide-y rows, no card-in-card),
useChartColors() per ogni serie grafica, token OKLCH compliance su tutti e 6 i temi.

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma) e APPLICALA mentre scrivi codice
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALA mentre scrivi codice
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALA mentre scrivi codice
```

---

## Email Periodiche

> Lancia shape **solo** se la critique email ha trovato P0/P1 strutturali — tipicamente:
> spezzare il monolite `monthlyEmailService.ts` (1375 righe) in un template layer riusabile,
> introdurre dark-mode (`@media (prefers-color-scheme: dark)` + `<meta name="color-scheme">`),
> o ripensare il layout della tabella Confronti per il mobile. Se la critique ha trovato solo
> P2/P3 (microcopy, spacing, fedeltà markdown), vai diretto a polish. Ricorda: il piano
> funzionale (logica confronti, prompt AI) NON è dominio di shape — è `/code-review` + Vitest.

```
/impeccable shape l'email periodica (riepilogo mensile / trimestrale / semestrale / annuale)

Priority issues (P0/P1) da: [SLUG]
File: lib/server/monthlyEmailService.ts
      (buildEmailHtml, simpleMarkdownToHtml, buildComparisonSectionHtml, comparisonCell)
Contesto logico (non visivo): lib/server/emailPeriodComparison.ts,
      app/api/user/monthly-email/send/route.ts (render di test)

L'email ha: hero patrimonio netto, tabella deterministica "Confronti" (Patrimonio/Entrate/
Uscite/Risparmio × periodo precedente + anno prima) e commento AI in 5 sezioni reso da markdown.

Design language atteso (email HTML — medium con vincoli OPPOSTI al dashboard):
Principio di DESIGN.md ("Effortless Precision", Form Follows Function), ma:
- Stili inline + hex hardcoded sono OBBLIGATORI (i client email non supportano CSS vars/token).
- Layout a tabelle, larghezza max 600px. NON applicabili: useChartColors(), Framer Motion,
  ARIA tablist, breakpoint desktop:, count-up.
- DEVE valere: Mono Mandate (numeri in stack monospace, allineamento tabellare), gerarchia
  Trade Republic (un numero dominante), Zero-Chroma (chrome achromatica, colore solo sui delta
  sign-aware con semantica invertita sulle Uscite), chrome reduction (border-bottom, non box annidati).
- Qualità medium-specifica: compat Gmail/Outlook/Apple Mail, dark-mode, mobile 320–375px,
  fedeltà markdown→HTML, fallback "N/D" / `previousEqualsYoy`.

Contesto:
- Leggi DESIGN.md (North Star, Form Follows Function, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALA mentre scrivi codice
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALA mentre scrivi codice
```
