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

Questa è la home del dashboard: mostra il patrimonio netto in tempo reale
con sparkline 12 mesi, KPI cards (liquidità, investimenti, costi), variazioni
periodiche e un riepilogo cashflow con savings rate.
Confronta con: Rendimenti (hero TWR), Storico (hero patrimonio), Goals (hero allocato).
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

### Tab "Gestione Asset"

```
/impeccable critique il tab "Gestione Asset" della pagina Patrimonio

File: app/dashboard/assets/page.tsx
Componenti: components/assets/AssetManagementTab.tsx,
            components/assets/AssetCard.tsx,
            components/assets/AssetMobileSummary.tsx,
            components/assets/AssetSparkline.tsx,
            components/assets/AssetDialog.tsx

Questo tab mostra la lista degli asset correnti con add/edit/delete inline,
sparkline per asset, tabella ordinabile su desktop e AssetMobileSummary
(ultimi 3 mesi) su mobile. AssetDialog ha un 2-step creation flow.
Confronta con: AllocationCard (flat divide-y), GoalDetailCard (expand/collapse inline).
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

### Tab "Anno Corrente"

```
/impeccable critique il tab "Anno Corrente" della pagina Patrimonio

File: app/dashboard/assets/page.tsx
Componenti: components/assets/AssetPriceHistoryTable.tsx

Questo tab mostra le tabelle storiche dei prezzi per l'anno in corso,
filtrate su asset con quantity > 0 (nessun asset venduto).
Confronta con: Storico (history page, narrative order), Hall of Fame (tabelle flat).
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

### Tab "Storico"

```
/impeccable critique il tab "Storico" della pagina Patrimonio

File: app/dashboard/assets/page.tsx
Componenti: components/assets/AssetClassHistoryTable.tsx,
            components/assets/AssetPriceHistoryTable.tsx

Questo tab mostra lo storico completo degli asset inclusi quelli venduti
(quantity === 0, badge "Venduto"). restrictToPassedAssets è attivo su entrambe le tabelle.
Confronta con: Storico (history page, tabelle con dati storici), Hall of Fame (tabelle flat).
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

### Tab "Analisi"

```
/impeccable critique il tab "Analisi" della pagina Cashflow

File: app/dashboard/cashflow/page.tsx
Componenti: components/cashflow/AnalisiTab.tsx,
            components/cashflow/CashflowSankeyChart.tsx

Questo tab unifica anno corrente + storico in un'unica vista con 3-state period pill
(Anno Corrente / Anno / Storico). Include Sankey chart con drill-down breadcrumb,
TopExpensesBlock (top 5 spese espandibile) e 9 trend charts in collapsible.
Confronta con: Rendimenti (period selector), Storico (narrative order + collapsible appendice).
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
→ Driver (Lavoro & Investimenti) → Appendice collapsible. Include segmented pills
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

## Ordine consigliato di esecuzione

Dalla meno redesignata alla più redesignata, per trovare i delta maggiori prima:

1. Cashflow / tab "Dividendi" ← mai redesignato, delta atteso alto
2. Impostazioni ← redesign parziale
3. Panoramica ← molte feature aggiunte incrementalmente
4. Patrimonio (3 tab) ← redesignata ma con tab separati da verificare singolarmente
5. Cashflow / tab "Tracciamento" e "Budget" ← da verificare dopo AnalisiTab
6. Allocazione
7. Rendimenti
8. Storico
9. Hall of Fame
10. FIRE e Simulazioni (4 tab)
11. Assistente AI ← rieseguire dopo redesign (baseline: 25/40)
