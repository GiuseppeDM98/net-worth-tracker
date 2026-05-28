# Impeccable Critique Prompts

Prompt ottimizzati per eseguire `/impeccable critique` su ogni sezione dell'app.

**Come usarli:** copia il blocco del prompt e incollalo nella chat con Claude Code.
Riesegui dopo ogni redesign per misurare il delta di score.

**Formato:** ogni prompt include solo file target, contesto minimo e benchmark di confronto.
Nessun "focus specifico" — la critique deve essere indipendente e olistica.

**Design language atteso (incluso in ogni prompt):**
Trade Republic hierarchy — numero hero `text-4xl font-bold font-mono`, flat `divide-y` rows,
no card-in-card, `useChartColors()` per tutte le serie grafiche, token compliance su tutti e 6 i temi.

---

## Panoramica

```
/impeccable critique la pagina Panoramica

File: app/dashboard/page.tsx
Componenti: components/dashboard/*

Questa è la home del dashboard — layout "Bento Asimmetrico v2":
- Hero [2fr_1fr]: Patrimonio Totale Lordo (text-[44px]/[54px]) + sparkline 12m
  edge-to-edge (-mx-[22px]) + variation chips; Liquid card con breakdown flat
  a 3 righe (Liquidità / Investimenti Liquidabili / Illiquidi) + sezione Impatto
  Fiscale condizionale. Hero card usa Card Sticky Footer (mt-auto) per TER+Costo su desktop.
- TER + Costo Annuale: responsive duplication (desktop:hidden / hidden desktop:grid).
- Cashflow card (full-width): 4 KPI chip (bg-muted/40 rounded-xl, text-[22px]) con
  delta annotation text-[12px] font-mono + category bar breakdown (h-[3px], 2-col).
- Charts section: deferred via requestIdleCallback; tab-switched su mobile (layoutId
  "chart-tab"), 2-col grid su desktop; legend swatch rounded-[2px].
Confronta con: Patrimonio (stesso hero [2fr_1fr]), Rendimenti (hero TWR),
Storico (hero patrimonio), Goals (hero allocato).
Design language atteso: Trade Republic hierarchy (text-4xl font-bold font-mono hero,
divide-y flat rows, no card-in-card), useChartColors() per tutte le serie grafiche,
token compliance su tutti e 6 i temi dell'app.

Contesto:
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)

Al termine indica il path esatto del file .impeccable/critique/[slug].md generato —
servirà come input per il prossimo step:
- Solo P2/P3 → /impeccable polish (legge il file automaticamente)
- P0/P1 presenti → /impeccable shape prima, poi /impeccable polish dopo l'implementazione
- P0/P1 + P2/P3 → shape prima (P0/P1), implementa, poi polish (P2/P3) — i P2/P3 aspettano
```

---

## Patrimonio

```
/impeccable critique la pagina Patrimonio

File: app/dashboard/assets/page.tsx
Componenti: components/assets/AssetManagementTab.tsx,
            components/assets/AssetCard.tsx,
            components/assets/AssetMobileSummary.tsx,
            components/assets/AssetSparkline.tsx,
            components/assets/AssetDialog.tsx,
            components/dashboard/OverviewAnimatedCurrency.tsx,
            components/dashboard/NetWorthSparkline.tsx

La pagina è una singola scroll (nessun tab). Layout:
- Header
- Hero [2fr_1fr]: identico a Panoramica — stesso `useDashboardOverview` RQ cache,
  stessa variazione chips, stessa sparkline edge-to-edge, stessa Liquid card
  con flat 3-row breakdown. In più: riga G/P non realizzato condizionale.
- CashAccountsSection: grid cards 2-col/4-col per i conti correnti (type=cash,
  assetClass=cash), esclusi dalla tabella principale.
- AssetManagementTab: tabella ordinabile (Valore, G/P%, Peso%, Nome, Classe),
  group-by-class toggle, sparkline per asset, 2-click delete, AssetDialog 2-step.
  Mobile: AssetMobileSummary (ultimi 3 mesi).
Confronta con: Panoramica (stesso hero layout), AllocationCard (flat divide-y),
GoalDetailCard (expand/collapse inline).
Design language atteso: Trade Republic hierarchy (text-4xl font-bold font-mono hero,
divide-y flat rows, no card-in-card), useChartColors() per tutte le serie grafiche,
token compliance su tutti e 6 i temi dell'app.

Contesto:
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)

Al termine indica il path esatto del file .impeccable/critique/[slug].md generato —
servirà come input per il prossimo step:
- Solo P2/P3 → /impeccable polish (legge il file automaticamente)
- P0/P1 presenti → /impeccable shape prima, poi /impeccable polish dopo l'implementazione
- P0/P1 + P2/P3 → shape prima (P0/P1), implementa, poi polish (P2/P3) — i P2/P3 aspettano
```

---

## Cashflow

### Tab "Dividendi"

```
/impeccable critique il tab "Dividendi" della pagina Cashflow

File: app/dashboard/cashflow/page.tsx
Componenti: components/dividends/DividendTrackingTab.tsx,
            components/dividends/DividendCalendar.tsx,
            components/dividends/DividendTable.tsx,
            components/dividends/DividendDetailsDialog.tsx,
            components/dividends/DividendStats.tsx,
            components/dividends/DividendDialog.tsx

Questo tab traccia dividendi e cedole obbligazionarie con calendario mensile
focalizzato, tabella transazioni, statistiche (DPS growth, YOC, total return per asset)
e dialog di dettaglio per ogni pagamento. Supporta conversione EUR per asset in
valuta estera e cedole auto-generate per bond.
Confronta con: Hall of Fame (tabelle flat), Cashflow/Analisi (period-based data).
Nota: è la sezione meno recentemente redesignata dell'app — valuta il delta
rispetto al Trade Republic pattern adottato nelle altre pagine.
Design language atteso: Trade Republic hierarchy (text-4xl font-bold font-mono hero,
divide-y flat rows, no card-in-card), useChartColors() per tutte le serie grafiche,
token compliance su tutti e 6 i temi dell'app.

Contesto:
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)

Al termine indica il path esatto del file .impeccable/critique/[slug].md generato —
servirà come input per il prossimo step:
- Solo P2/P3 → /impeccable polish (legge il file automaticamente)
- P0/P1 presenti → /impeccable shape prima, poi /impeccable polish dopo l'implementazione
- P0/P1 + P2/P3 → shape prima (P0/P1), implementa, poi polish (P2/P3) — i P2/P3 aspettano
```

### Tab "Tracciamento" *(mobileLabel: "Spese")*

```
/impeccable critique il tab "Tracciamento" della pagina Cashflow

File: app/dashboard/cashflow/page.tsx
Componenti: components/cashflow/ExpenseTrackingTab.tsx,
            components/expenses/ExpenseDialog.tsx

Questo tab mostra la lista delle spese con filtri, KPI dominant blocks,
load-more e 2-click inline delete. ExpenseDialog ha un 2-step creation flow
con visual type picker (4 card 2x2) e form contestuale.
Confronta con: AssetManagementTab (stessa struttura lista + dialog 2-step),
GoalDetailCard (delete pattern).
Design language atteso: Trade Republic hierarchy (text-4xl font-bold font-mono hero,
divide-y flat rows, no card-in-card), useChartColors() per tutte le serie grafiche,
token compliance su tutti e 6 i temi dell'app.

Contesto:
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)

Al termine indica il path esatto del file .impeccable/critique/[slug].md generato —
servirà come input per il prossimo step:
- Solo P2/P3 → /impeccable polish (legge il file automaticamente)
- P0/P1 presenti → /impeccable shape prima, poi /impeccable polish dopo l'implementazione
- P0/P1 + P2/P3 → shape prima (P0/P1), implementa, poi polish (P2/P3) — i P2/P3 aspettano
```

### Tab "Budget"

```
/impeccable critique il tab "Budget" della pagina Cashflow

File: app/dashboard/cashflow/page.tsx
Componenti: components/cashflow/BudgetTab.tsx

Questo tab permette di impostare budget per categoria e visualizzare
l'avanzamento mensile con progress bars. Side-stripe borders rimossi,
colori blue hardcoded migrati a design tokens.
Confronta con: AllocationCard (progress bar + target%), GoalDetailCard (% display).
Design language atteso: Trade Republic hierarchy (text-4xl font-bold font-mono hero,
divide-y flat rows, no card-in-card), useChartColors() per tutte le serie grafiche,
token compliance su tutti e 6 i temi dell'app.

Contesto:
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)

Al termine indica il path esatto del file .impeccable/critique/[slug].md generato —
servirà come input per il prossimo step:
- Solo P2/P3 → /impeccable polish (legge il file automaticamente)
- P0/P1 presenti → /impeccable shape prima, poi /impeccable polish dopo l'implementazione
- P0/P1 + P2/P3 → shape prima (P0/P1), implementa, poi polish (P2/P3) — i P2/P3 aspettano
```

### Tab "Centri di Costo" *(visibile solo se costCentersEnabled)*

```
/impeccable critique il tab "Centri di Costo" della pagina Cashflow

File: app/dashboard/cashflow/page.tsx
Componenti: components/cashflow/CostCentersTab.tsx,
            components/cashflow/CostCenterDetail.tsx,
            components/cashflow/CostCenterDialog.tsx

Questo tab raggruppa le spese per oggetto/progetto (es. "Automobile").
Ogni centro ha KPI cards, grafico spesa mensile e tabella transazioni collegate.
Delete e rename cascadano sulle spese via writeBatch.
Confronta con: GoalBasedInvestingTab (assegnazione risorse a obiettivi — pattern analogo),
ExpenseTrackingTab (transaction table style).
Design language atteso: Trade Republic hierarchy (text-4xl font-bold font-mono hero,
divide-y flat rows, no card-in-card), useChartColors() per tutte le serie grafiche,
token compliance su tutti e 6 i temi dell'app.

Contesto:
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)

Al termine indica il path esatto del file .impeccable/critique/[slug].md generato —
servirà come input per il prossimo step:
- Solo P2/P3 → /impeccable polish (legge il file automaticamente)
- P0/P1 presenti → /impeccable shape prima, poi /impeccable polish dopo l'implementazione
- P0/P1 + P2/P3 → shape prima (P0/P1), implementa, poi polish (P2/P3) — i P2/P3 aspettano
```

---

## Analisi

```
/impeccable critique la pagina Analisi

File: app/dashboard/analisi/page.tsx
Componenti: components/cashflow/AnalisiTab.tsx,
            components/cashflow/CashflowSankeyChart.tsx,
            components/cashflow/AnomalieBlock.tsx,
            components/cashflow/ConfrontoAnnualeSection.tsx,
            components/cashflow/SavingsRateTrendSection.tsx,
            components/cashflow/CategoryTrendsGrid.tsx

Pagina standalone (estratta dal tab "Analisi" di Cashflow). Unifica anno corrente +
storico in un'unica vista con 3-state period pill (Anno Corrente / Anno / Storico).
Include: Sankey chart con drill-down breadcrumb, TopExpensesBlock (top 5 spese
espandibile), AnomalieBlock (anomalie di spesa), ConfrontoAnnualeSection (confronto
anno corrente vs anno precedente), SavingsRateTrendSection (trend savings rate),
CategoryTrendsGrid (9 trend charts collassabili). Data fetching autonomo via
useExpenses / useExpenseCategories — non condivide route lifecycle con Cashflow.
Confronta con: Cashflow/Tracciamento (dati condivisi via RQ cache),
Rendimenti (period selector), Storico (narrative order + collapsible appendice).
Design language atteso: Trade Republic hierarchy (text-4xl font-bold font-mono hero,
divide-y flat rows, no card-in-card), useChartColors() per tutte le serie grafiche,
token compliance su tutti e 6 i temi dell'app.

Contesto:
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)

Al termine indica il path esatto del file .impeccable/critique/[slug].md generato —
servirà come input per il prossimo step:
- Solo P2/P3 → /impeccable polish (legge il file automaticamente)
- P0/P1 presenti → /impeccable shape prima, poi /impeccable polish dopo l'implementazione
- P0/P1 + P2/P3 → shape prima (P0/P1), implementa, poi polish (P2/P3) — i P2/P3 aspettano
```

---

## Allocazione

```
/impeccable critique la pagina Allocazione

File: app/dashboard/allocation/page.tsx
Componenti: components/allocation/*

Questa pagina mostra l'allocazione attuale vs target per classe di asset,
con AllocationCard flat (divide-y + ActionChip COMPRA/VENDI/OK) e tabelle desktop
5 colonne. Include la sezione "Esposizione Portfolio" lazy-loaded con drill-down
per azienda / settore / emittente ETF.
Confronta con: Rendimenti (MetricSection flat rows), Patrimonio (sortable table).
Design language atteso: Trade Republic hierarchy (text-4xl font-bold font-mono hero,
divide-y flat rows, no card-in-card), useChartColors() per tutte le serie grafiche,
token compliance su tutti e 6 i temi dell'app.

Contesto:
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)

Al termine indica il path esatto del file .impeccable/critique/[slug].md generato —
servirà come input per il prossimo step:
- Solo P2/P3 → /impeccable polish (legge il file automaticamente)
- P0/P1 presenti → /impeccable shape prima, poi /impeccable polish dopo l'implementazione
- P0/P1 + P2/P3 → shape prima (P0/P1), implementa, poi polish (P2/P3) — i P2/P3 aspettano
```

---

## Rendimenti

```
/impeccable critique la pagina Rendimenti

File: app/dashboard/performance/page.tsx
Componenti: components/performance/*

Questa pagina mostra le metriche di performance del portafoglio: TWR, Sharpe,
Contributi Netti, YOC Netto come hero blocks, con period selector (1M/3M/YTD/1Y/3Y/5Y/ALL
+ CUSTOM), rolling charts, underwater drawdown e benchmark comparison (6 portafogli modello,
tabella 11 colonne, growth-of-100 chart).
Confronta con: Storico (hero patrimonio + CAGR), Goals (hero allocato).
Design language atteso: Trade Republic hierarchy (text-4xl font-bold font-mono hero,
divide-y flat rows, no card-in-card), useChartColors() per tutte le serie grafiche,
token compliance su tutti e 6 i temi dell'app.

Contesto:
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)

Al termine indica il path esatto del file .impeccable/critique/[slug].md generato —
servirà come input per il prossimo step:
- Solo P2/P3 → /impeccable polish (legge il file automaticamente)
- P0/P1 presenti → /impeccable shape prima, poi /impeccable polish dopo l'implementazione
- P0/P1 + P2/P3 → shape prima (P0/P1), implementa, poi polish (P2/P3) — i P2/P3 aspettano
```

---

## Storico

```
/impeccable critique la pagina Storico

File: app/dashboard/history/page.tsx
Componenti: components/history/*,
            components/dashboard/LaborMetricsChart.tsx

Questa pagina mostra l'evoluzione storica del patrimonio con narrative order:
Hero (patrimonio + CAGR + crescita totale) → Evoluzione → Raddoppi → Composizione
→ Driver (3 sezioni: Savings vs Investment, Lavoro & Investimenti, Variazione Anno su Anno
sempre visibile). Nessuna Appendice collapsible (eliminata). Include segmented pills
per view toggles e mobile inline legend sui grafici multi-serie.
Confronta con: Rendimenti (period selector), Hall of Fame (tabelle flat + hero).
Design language atteso: Trade Republic hierarchy (text-4xl font-bold font-mono hero,
divide-y flat rows, no card-in-card), useChartColors() per tutte le serie grafiche,
token compliance su tutti e 6 i temi dell'app.

Contesto:
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)

Al termine indica il path esatto del file .impeccable/critique/[slug].md generato —
servirà come input per il prossimo step:
- Solo P2/P3 → /impeccable polish (legge il file automaticamente)
- P0/P1 presenti → /impeccable shape prima, poi /impeccable polish dopo l'implementazione
- P0/P1 + P2/P3 → shape prima (P0/P1), implementa, poi polish (P2/P3) — i P2/P3 aspettano
```

---

## Hall of Fame

```
/impeccable critique la pagina Hall of Fame

File: app/dashboard/hall-of-fame/page.tsx
Componenti: components/hall-of-fame/*,
            lib/constants/hallOfFame.ts

Questa pagina mostra i record storici del portafoglio: hero block con il miglior
record assoluto, mobile three-section nav pill, single card rankings con period +
category pill switchers, SpotlightCard flat divide-y, tabelle full-height su desktop
e top-5 + collapsible "Vedi tutti" su mobile.
Confronta con: Storico (hero patrimonio + narrative sections), Rendimenti (period selector).
Design language atteso: Trade Republic hierarchy (text-4xl font-bold font-mono hero,
divide-y flat rows, no card-in-card), useChartColors() per tutte le serie grafiche,
token compliance su tutti e 6 i temi dell'app.

Contesto:
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)

Al termine indica il path esatto del file .impeccable/critique/[slug].md generato —
servirà come input per il prossimo step:
- Solo P2/P3 → /impeccable polish (legge il file automaticamente)
- P0/P1 presenti → /impeccable shape prima, poi /impeccable polish dopo l'implementazione
- P0/P1 + P2/P3 → shape prima (P0/P1), implementa, poi polish (P2/P3) — i P2/P3 aspettano
```

---

## FIRE e Simulazioni

### Tab "FIRE Calculator"

```
/impeccable critique il tab "FIRE Calculator" della pagina FIRE e Simulazioni

File: app/dashboard/fire-simulations/page.tsx
Componenti: components/fire-simulations/FireCalculatorTab.tsx,
            components/fire-simulations/FIREProjectionSection.tsx,
            components/fire-simulations/FIREProjectionChart.tsx,
            components/fire-simulations/FireCalculatorSkeleton.tsx

Questo tab calcola il FIRE Number con hero block, Settings collapsible
(auto-open su unsaved changes), flat divide-y metric rows, "Annulla" reset button
e sezione proiezione con sensitivity matrix e scenario chart.
Confronta con: Monte Carlo (same hero + collapsible pattern), Goals (hero allocato),
Coast FIRE (stesso Settings pattern).
Design language atteso: Trade Republic hierarchy (text-4xl font-bold font-mono hero,
divide-y flat rows, no card-in-card), useChartColors() per tutte le serie grafiche,
token compliance su tutti e 6 i temi dell'app.

Contesto:
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)

Al termine indica il path esatto del file .impeccable/critique/[slug].md generato —
servirà come input per il prossimo step:
- Solo P2/P3 → /impeccable polish (legge il file automaticamente)
- P0/P1 presenti → /impeccable shape prima, poi /impeccable polish dopo l'implementazione
- P0/P1 + P2/P3 → shape prima (P0/P1), implementa, poi polish (P2/P3) — i P2/P3 aspettano
```

### Tab "Coast FIRE"

```
/impeccable critique il tab "Coast FIRE" della pagina FIRE e Simulazioni

File: app/dashboard/fire-simulations/page.tsx
Componenti: components/fire-simulations/CoastFireTab.tsx,
            components/fire-simulations/CoastFireProjectionChart.tsx

Questo tab calcola il Coast FIRE Number con hero block (HeroMetricBlock),
Settings collapsible, flat rows con progress bar animata, scenari Bear/Base/Bull
e sezione opzionale per pensioni statali (UI mobile 2-col con items-start).
Confronta con: FIRE Calculator (same hero + Settings pattern), Monte Carlo (scenarios).
Design language atteso: Trade Republic hierarchy (text-4xl font-bold font-mono hero,
divide-y flat rows, no card-in-card), useChartColors() per tutte le serie grafiche,
token compliance su tutti e 6 i temi dell'app.

Contesto:
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)

Al termine indica il path esatto del file .impeccable/critique/[slug].md generato —
servirà come input per il prossimo step:
- Solo P2/P3 → /impeccable polish (legge il file automaticamente)
- P0/P1 presenti → /impeccable shape prima, poi /impeccable polish dopo l'implementazione
- P0/P1 + P2/P3 → shape prima (P0/P1), implementa, poi polish (P2/P3) — i P2/P3 aspettano
```

### Tab "Monte Carlo"

```
/impeccable critique il tab "Monte Carlo" della pagina FIRE e Simulazioni

File: app/dashboard/fire-simulations/page.tsx
Componenti: components/fire-simulations/MonteCarloTab.tsx,
            components/monte-carlo/*,
            components/fire-simulations/MonteCarloSkeleton.tsx

Questo tab esegue simulazioni Monte Carlo con hero "Probabilità di Successo"
(always visible, "--" pre-run), mode toggle pill, ParametersForm con market params
in collapsible (auto-open se non-default), scenario comparison e appendice collapsible.
Confronta con: FIRE Calculator (hero + collapsible), Coast FIRE (scenarios Bear/Base/Bull).
Design language atteso: Trade Republic hierarchy (text-4xl font-bold font-mono hero,
divide-y flat rows, no card-in-card), useChartColors() per tutte le serie grafiche,
token compliance su tutti e 6 i temi dell'app.

Contesto:
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)

Al termine indica il path esatto del file .impeccable/critique/[slug].md generato —
servirà come input per il prossimo step:
- Solo P2/P3 → /impeccable polish (legge il file automaticamente)
- P0/P1 presenti → /impeccable shape prima, poi /impeccable polish dopo l'implementazione
- P0/P1 + P2/P3 → shape prima (P0/P1), implementa, poi polish (P2/P3) — i P2/P3 aspettano
```

### Tab "Obiettivi"

```
/impeccable critique il tab "Obiettivi" della pagina FIRE e Simulazioni

File: app/dashboard/fire-simulations/page.tsx
Componenti: components/fire-simulations/GoalBasedInvestingTab.tsx,
            components/goals/*,
            components/fire-simulations/GoalsSkeleton.tsx

Questo tab mostra il patrimonio allocato agli obiettivi con hero "Patrimonio Allocato",
flat divide-y goal list con expand inline, GoalDetailCard (2-click delete, role="progressbar"),
GoalFormDialog con color picker e AssetAssignmentDialog per assegnare quote di asset.
Confronta con: FIRE Calculator (hero pattern), Allocazione (ActionChip, target%).
Design language atteso: Trade Republic hierarchy (text-4xl font-bold font-mono hero,
divide-y flat rows, no card-in-card), useChartColors() per tutte le serie grafiche,
token compliance su tutti e 6 i temi dell'app.

Contesto:
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)

Al termine indica il path esatto del file .impeccable/critique/[slug].md generato —
servirà come input per il prossimo step:
- Solo P2/P3 → /impeccable polish (legge il file automaticamente)
- P0/P1 presenti → /impeccable shape prima, poi /impeccable polish dopo l'implementazione
- P0/P1 + P2/P3 → shape prima (P0/P1), implementa, poi polish (P2/P3) — i P2/P3 aspettano
```

---

## Assistente AI

```
/impeccable critique la pagina Assistente AI

File: app/dashboard/assistant/page.tsx
Componenti: components/assistant/*

Questa pagina offre un assistente AI per analisi del portafoglio in 5 modalità
(Mese, Anno, YTD, Storico, Chat), con streaming SSE, thread persistenti period-pinned,
pannello memoria con lifecycle attivo/completato/archiviato e context bundle numerico
(patrimonio delta, cashflow, allocation) mostrato in sidebar.
Confronta con: Rendimenti (hero number + data-first hierarchy), Storico (narrative order),
Goals (flat divide-y list).
Nota: critique già eseguita il 2026-05-24 — score 25/40. Findings in SESSION_NOTES.md.
Rieseguire dopo il redesign per misurare il delta.
Design language atteso: Trade Republic hierarchy (text-4xl font-bold font-mono hero,
divide-y flat rows, no card-in-card), useChartColors() per tutte le serie grafiche,
token compliance su tutti e 6 i temi dell'app.

Contesto:
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)

Al termine indica il path esatto del file .impeccable/critique/[slug].md generato —
servirà come input per il prossimo step:
- Solo P2/P3 → /impeccable polish (legge il file automaticamente)
- P0/P1 presenti → /impeccable shape prima, poi /impeccable polish dopo l'implementazione
- P0/P1 + P2/P3 → shape prima (P0/P1), implementa, poi polish (P2/P3) — i P2/P3 aspettano
```

---

## Impostazioni

```
/impeccable critique la pagina Impostazioni

File: app/dashboard/settings/page.tsx
Componenti: components/settings/SettingsPageSkeleton.tsx

Questa pagina raccoglie tutte le configurazioni dell'app: profilo utente,
target di allocazione per classe di asset, categorie cashflow con sub-categorie,
preferenze dividendi, labor categories per Storico, tema colore, stamp duty e
opzioni avanzate (dummy snapshots, history start year). Tab su desktop, Radix Select su mobile.
Confronta con: nessuna pagina specifica (registro separato), ma verifica che i
componenti form (Switch, Select, Input) usino la stessa vocabulary degli altri form dell'app.
Design language atteso: Trade Republic hierarchy (text-4xl font-bold font-mono hero,
divide-y flat rows, no card-in-card), useChartColors() per tutte le serie grafiche,
token compliance su tutti e 6 i temi dell'app.

Contesto:
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)

Al termine indica il path esatto del file .impeccable/critique/[slug].md generato —
servirà come input per il prossimo step:
- Solo P2/P3 → /impeccable polish (legge il file automaticamente)
- P0/P1 presenti → /impeccable shape prima, poi /impeccable polish dopo l'implementazione
- P0/P1 + P2/P3 → shape prima (P0/P1), implementa, poi polish (P2/P3) — i P2/P3 aspettano
```

---

## App Shell e Navigazione

```
/impeccable critique l'app shell e la navigazione

File: app/dashboard/layout.tsx,
      app/dashboard/template.tsx
Componenti: components/layout/Sidebar.tsx,
            components/layout/BottomNavigation.tsx,
            components/layout/SecondaryMenuDrawer.tsx,
            components/layout/AssistenteBanner.tsx,
            components/layout/LogoutDialog.tsx

Questi file definiscono la struttura permanente dell'app: layout wrapper (main padding,
demo banner, landscape header bar con SidebarTrigger), page transitions (template.tsx),
sidebar desktop collassabile (icon mode, toggle desktop-only, AssistenteBanner → Bot icon
in collapsed), bottom navigation mobile portrait con FAB cashflow animato via AnimatePresence
e theme sync via --sidebar-* CSS vars, secondary menu drawer per voci overflow su mobile.
Nuovi componenti condivisi: PageContainer, PageHeader (sticky mobile bar), PageTabs/PageTabBar
(underline tab indicator), ThemePicker, lib/constants/navigation.ts (nav arrays centralizzati).
Confronta con: nessuna pagina specifica — il benchmark è la coerenza interna tra
sidebar desktop, bottom nav mobile e secondary drawer.
Design language atteso: Trade Republic hierarchy (text-4xl font-bold font-mono hero,
divide-y flat rows, no card-in-card), useChartColors() per tutte le serie grafiche,
token compliance su tutti e 6 i temi dell'app.

Contesto:
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)

Al termine indica il path esatto del file .impeccable/critique/[slug].md generato —
servirà come input per il prossimo step:
- Solo P2/P3 → /impeccable polish (legge il file automaticamente)
- P0/P1 presenti → /impeccable shape prima, poi /impeccable polish dopo l'implementazione
- P0/P1 + P2/P3 → shape prima (P0/P1), implementa, poi polish (P2/P3) — i P2/P3 aspettano
```

---

## Landing e Auth

### Landing Page

```
/impeccable critique la landing page

File: app/page.tsx

Questa è la landing page pubblica: mostra il valore dell'app con una hero section,
feature overview e CTA "Prova la Demo" (condizionale a NEXT_PUBLIC_DEMO_EMAIL).
È il primo contatto dell'utente con il prodotto — brand impression, motion di entrata,
gerarchia visiva delle feature, call to action.
Confronta con: Panoramica (stesso brand, gerarchia coerente), Rendimenti (hero number).
Design language atteso: Trade Republic hierarchy (text-4xl font-bold font-mono hero,
divide-y flat rows, no card-in-card), useChartColors() per tutte le serie grafiche,
token compliance su tutti e 6 i temi dell'app.

Contesto:
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)

Al termine indica il path esatto del file .impeccable/critique/[slug].md generato —
servirà come input per il prossimo step:
- Solo P2/P3 → /impeccable polish (legge il file automaticamente)
- P0/P1 presenti → /impeccable shape prima, poi /impeccable polish dopo l'implementazione
- P0/P1 + P2/P3 → shape prima (P0/P1), implementa, poi polish (P2/P3) — i P2/P3 aspettano
```

### Login e Register

```
/impeccable critique le pagine Login e Register

File: app/login/page.tsx,
      app/register/page.tsx

Le pagine di autenticazione: form con email+password, toggle visibilità password
keyboard-reachable, feedback inline su submit (Loader2 animate-spin durante pending),
motion di entrata "calmer" rispetto al vecchio design. Login ha link a Register e viceversa.
Confronta con: Impostazioni (stessa vocabulary form: Input, Button, label/focus ring),
Landing (stesso brand entry point, coerenza visiva).
Design language atteso: Trade Republic hierarchy (text-4xl font-bold font-mono hero,
divide-y flat rows, no card-in-card), useChartColors() per tutte le serie grafiche,
token compliance su tutti e 6 i temi dell'app.

Contesto:
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)

Al termine indica il path esatto del file .impeccable/critique/[slug].md generato —
servirà come input per il prossimo step:
- Solo P2/P3 → /impeccable polish (legge il file automaticamente)
- P0/P1 presenti → /impeccable shape prima, poi /impeccable polish dopo l'implementazione
- P0/P1 + P2/P3 → shape prima (P0/P1), implementa, poi polish (P2/P3) — i P2/P3 aspettano
```

---

## Cross-cutting: Sistema dei Dialog

```
/impeccable critique il sistema dei dialog dell'app

Componenti: components/assets/AssetDialog.tsx,
            components/expenses/ExpenseDialog.tsx,
            components/goals/GoalFormDialog.tsx,
            components/goals/AssetAssignmentDialog.tsx,
            components/dividends/DividendDialog.tsx,
            components/dividends/DividendDetailsDialog.tsx,
            components/cashflow/CostCenterDialog.tsx,
            components/layout/LogoutDialog.tsx

Questa critique valuta la coerenza del sistema dei dialog come unità: struttura
(DialogTitle + DialogDescription presente in tutti?), footer pattern (primario destra /
ghost sinistra), sizing breakpoint, loading state (Loader2 su tutti i submit pending?),
2-step flow in AssetDialog e ExpenseDialog (AnimatePresence mode="wait", spring config),
motion consistency e token compliance cross-dialog.
Confronta con: ogni dialog rispetto agli altri — il benchmark è la coerenza interna.
Design language atteso: Trade Republic hierarchy (text-4xl font-bold font-mono hero,
divide-y flat rows, no card-in-card), useChartColors() per tutte le serie grafiche,
token compliance su tutti e 6 i temi dell'app.

Contesto:
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)

Al termine indica il path esatto del file .impeccable/critique/[slug].md generato —
servirà come input per il prossimo step:
- Solo P2/P3 → /impeccable polish (legge il file automaticamente)
- P0/P1 presenti → /impeccable shape prima, poi /impeccable polish dopo l'implementazione
- P0/P1 + P2/P3 → shape prima (P0/P1), implementa, poi polish (P2/P3) — i P2/P3 aspettano
```

---

## Ordine consigliato di esecuzione

Dalla meno redesignata alla più redesignata, per trovare i delta maggiori prima:

1. Cashflow / tab "Dividendi" ← mai redesignato, delta atteso alto
2. Analisi ← pagina nuova (estratta da Cashflow), mai critiquata formalmente
3. App Shell e Navigazione ← fondamentale, problemi noti già in layout.tsx
4. Cross-cutting: Sistema dei Dialog ← usati ovunque, coerenza mai verificata
5. Impostazioni ← redesign parziale
6. Landing Page ← primo contatto utente, mai critiquata
7. Login e Register ← già migliorati ma mai critiquati formalmente
8. Panoramica ← v2 con KPI chip grid + category bars (verifica delta)
9. Patrimonio ← pagina unica (nessun tab), hero condiviso con Panoramica
10. Cashflow / tab "Tracciamento" (mobileLabel: "Spese") e "Budget"
11. Allocazione
12. Rendimenti
13. Storico
14. Hall of Fame
15. FIRE e Simulazioni (4 tab)
16. Assistente AI ← rieseguire dopo redesign (baseline: 25/40)
