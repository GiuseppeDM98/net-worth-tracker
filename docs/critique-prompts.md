# Impeccable Critique Prompts

Prompt ottimizzati per eseguire `/impeccable critique` su ogni sezione dell'app.

**Come usarli:** copia il blocco del prompt e incollalo nella chat con Claude Code.
Riesegui dopo ogni redesign per misurare il delta di score.

**Workflow (flusso combinato "ripensamento"):** `critique → shape combinato (blocco A nuova IA
+ blocco B 2-4 nuove feature) → checkpoint approvazione → implementa tutto (craft + polish) →
test verdi + tsc pulito`. La critique è l'entry point; lo shape e l'implementazione seguono nella
stessa sessione. L'`audit` (`docs/audit-prompts.md`) resta il gate di compliance dopo l'implementazione.
I vecchi file `shape-prompts.md` / `polish-prompts.md` sono stati rimossi: lo shape vive inline qui,
il polish è parte dell'implementazione.

**Formato:** ogni prompt include solo file target, contesto minimo e benchmark di confronto.
Nessun "focus specifico" — la critique deve essere indipendente e olistica.

**Design language atteso (sintesi di `DESIGN.md` — la fonte canonica; leggila sempre):**
North Star *"Effortless Precision"* — Linear/Vercel + Trade Republic + Apple, sotto la legge
**Form Follows Function** (onestà, deferenza, inevitabilità: ogni proprietà visiva è conseguenza
di una funzione, mai decorazione). Scala hero: page hero `text-[44px] desktop:text-[54px]
font-bold font-mono tracking-[-0.03em]`, section hero `text-[36px]`, sub-hero `text-[22px]`
(**mai** `text-4xl`/`text-2xl` per un hero — il salto 22→36→44→54 è intenzionale). **Mono Mandate**:
ogni numero in Geist Mono + `tabular-nums`. **Zero-Chroma + Data Owns Color**: chrome achromatica,
il colore lo possiede il dato (chart e temi). Gerarchia Trade Republic (un numero dominante,
flat `divide-y` rows, no card-in-card), `useChartColors()` per ogni serie, token OKLCH su tutti e 6 i temi.

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
Design language atteso (vedi DESIGN.md): North Star "Effortless Precision" — Linear/Vercel +
Trade Republic + Apple, sotto la legge Form Follows Function (onestà, deferenza, inevitabilità:
ogni proprietà visiva è conseguenza di una funzione, mai decorazione). Scala hero: page hero
text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em], section hero text-[36px],
sub-hero text-[22px] (mai text-4xl/text-2xl per un hero). Mono Mandate: ogni numero in Geist Mono
+ tabular-nums. Zero-Chroma + Data Owns Color: chrome achromatica, il colore lo possiede il dato
(chart e temi). Gerarchia Trade Republic (un numero dominante, flat divide-y rows, no card-in-card),
useChartColors() per ogni serie grafica, token OKLCH compliance su tutti e 6 i temi.

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)

Al termine: presenta la critique completa, poi proponi lo shape combinato — blocco A (nuovi
modi di presentare le info GIÀ presenti) + blocco B (2-4 nuove feature/estensioni coerenti) —
e fermati al checkpoint per approvazione, senza scrivere codice. Dopo l'ok: implementa tutto
in una volta (craft + polish), con test verdi e tsc pulito.
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
Confronta con: Panoramica (stesso hero layout), AllocationBreakdown (flat divide-y rows),
GoalDetailCard (expand/collapse inline).
Design language atteso (vedi DESIGN.md): North Star "Effortless Precision" — Linear/Vercel +
Trade Republic + Apple, sotto la legge Form Follows Function (onestà, deferenza, inevitabilità:
ogni proprietà visiva è conseguenza di una funzione, mai decorazione). Scala hero: page hero
text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em], section hero text-[36px],
sub-hero text-[22px] (mai text-4xl/text-2xl per un hero). Mono Mandate: ogni numero in Geist Mono
+ tabular-nums. Zero-Chroma + Data Owns Color: chrome achromatica, il colore lo possiede il dato
(chart e temi). Gerarchia Trade Republic (un numero dominante, flat divide-y rows, no card-in-card),
useChartColors() per ogni serie grafica, token OKLCH compliance su tutti e 6 i temi.

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)

Al termine: presenta la critique completa, poi proponi lo shape combinato — blocco A (nuovi
modi di presentare le info GIÀ presenti) + blocco B (2-4 nuove feature/estensioni coerenti) —
e fermati al checkpoint per approvazione, senza scrivere codice. Dopo l'ok: implementa tutto
in una volta (craft + polish), con test verdi e tsc pulito.
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
Design language atteso (vedi DESIGN.md): North Star "Effortless Precision" — Linear/Vercel +
Trade Republic + Apple, sotto la legge Form Follows Function (onestà, deferenza, inevitabilità:
ogni proprietà visiva è conseguenza di una funzione, mai decorazione). Scala hero: page hero
text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em], section hero text-[36px],
sub-hero text-[22px] (mai text-4xl/text-2xl per un hero). Mono Mandate: ogni numero in Geist Mono
+ tabular-nums. Zero-Chroma + Data Owns Color: chrome achromatica, il colore lo possiede il dato
(chart e temi). Gerarchia Trade Republic (un numero dominante, flat divide-y rows, no card-in-card),
useChartColors() per ogni serie grafica, token OKLCH compliance su tutti e 6 i temi.

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)

Al termine: presenta la critique completa, poi proponi lo shape combinato — blocco A (nuovi
modi di presentare le info GIÀ presenti) + blocco B (2-4 nuove feature/estensioni coerenti) —
e fermati al checkpoint per approvazione, senza scrivere codice. Dopo l'ok: implementa tutto
in una volta (craft + polish), con test verdi e tsc pulito.
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
Design language atteso (vedi DESIGN.md): North Star "Effortless Precision" — Linear/Vercel +
Trade Republic + Apple, sotto la legge Form Follows Function (onestà, deferenza, inevitabilità:
ogni proprietà visiva è conseguenza di una funzione, mai decorazione). Scala hero: page hero
text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em], section hero text-[36px],
sub-hero text-[22px] (mai text-4xl/text-2xl per un hero). Mono Mandate: ogni numero in Geist Mono
+ tabular-nums. Zero-Chroma + Data Owns Color: chrome achromatica, il colore lo possiede il dato
(chart e temi). Gerarchia Trade Republic (un numero dominante, flat divide-y rows, no card-in-card),
useChartColors() per ogni serie grafica, token OKLCH compliance su tutti e 6 i temi.

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)

Al termine: presenta la critique completa, poi proponi lo shape combinato — blocco A (nuovi
modi di presentare le info GIÀ presenti) + blocco B (2-4 nuove feature/estensioni coerenti) —
e fermati al checkpoint per approvazione, senza scrivere codice. Dopo l'ok: implementa tutto
in una volta (craft + polish), con test verdi e tsc pulito.
```

### Tab "Budget"

```
/impeccable critique il tab "Budget" della pagina Cashflow

File: app/dashboard/cashflow/page.tsx
Componenti: components/cashflow/BudgetTab.tsx,
            components/cashflow/budget/BudgetList.tsx,
            components/cashflow/budget/BudgetItemDialog.tsx,
            components/cashflow/budget/BudgetSettingsCard.tsx,
            components/cashflow/budget/BudgetForecastCard.tsx,
            components/cashflow/budget/BudgetInsightsCard.tsx,
            components/cashflow/budget/BudgetAlertsBanner.tsx

Questo tab (redesign issue #148, 2026-06-05) è un sistema opt-in: solo i budget creati
esplicitamente vengono mostrati (nessun auto-fill per categoria). Struttura:
BudgetSettingsCard (overall ceiling + auto-save 800ms), BudgetAlertsBanner (soglie 50/75/90/100%
+ forecast overrun), BudgetList (split Mensili/Annuali, inline progress, 2-click delete),
BudgetForecastCard (proiezione fine mese con dampening early-month), BudgetInsightsCard
(confronto vs expected-to-date). BudgetItemDialog tramite ResponsiveModal. Income budgets
come target invertiti (progress inverso). Auto-save via useBudgetConfig (debounce 800ms,
paused su allocazione invalida).
Confronta con: Allocazione/RebalancePlan (mosse ordinate per priorità — pattern lista firmata
simile), Goals (progress bar + target%).
Design language atteso (vedi DESIGN.md): North Star "Effortless Precision" — Linear/Vercel +
Trade Republic + Apple, sotto la legge Form Follows Function (onestà, deferenza, inevitabilità:
ogni proprietà visiva è conseguenza di una funzione, mai decorazione). Scala hero: page hero
text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em], section hero text-[36px],
sub-hero text-[22px] (mai text-4xl/text-2xl per un hero). Mono Mandate: ogni numero in Geist Mono
+ tabular-nums. Zero-Chroma + Data Owns Color: chrome achromatica, il colore lo possiede il dato
(chart e temi). Gerarchia Trade Republic (un numero dominante, flat divide-y rows, no card-in-card),
useChartColors() per ogni serie grafica, token OKLCH compliance su tutti e 6 i temi.

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)

Al termine: presenta la critique completa, poi proponi lo shape combinato — blocco A (nuovi
modi di presentare le info GIÀ presenti) + blocco B (2-4 nuove feature/estensioni coerenti) —
e fermati al checkpoint per approvazione, senza scrivere codice. Dopo l'ok: implementa tutto
in una volta (craft + polish), con test verdi e tsc pulito.
```

### Tab "Centri di Costo" *(visibile solo se costCentersEnabled)*

```
/impeccable critique il tab "Centri di Costo" della pagina Cashflow

File: app/dashboard/cashflow/page.tsx
Componenti: components/cashflow/CostCentersTab.tsx,
            components/cashflow/CostCenterDetail.tsx,
            components/cashflow/CostCenterDialog.tsx

Questo tab raggruppa le spese per oggetto/progetto (es. "Automobile"). Panoramica
Trade-Republic: asse periodo (Mese/Anno/12 mesi/Storico, derivato in-memory) → hero totale
+ lista flat divide-y dei centri ordinata per spesa con share-bar. Detail = hero totale periodo
+ chip Δ-vs-precedente + righe flat, composizione per categoria, grafico mensile stacked-by-categoria.
Feature: budget ceiling per centro (verdict + meter), costo annuo proiettato (smorzato a inizio anno),
overlay di confronto cross-centro, lifecycle attivo/dormiente/archiviato. Derivazione pura in
lib/utils/costCenterUtils.ts. Delete e rename cascadano sulle spese via writeBatch.
Confronta con: GoalBasedInvestingTab (Panoramica + asse periodo + budget meter — pattern analogo),
ExpenseTrackingTab (transaction style).
Design language atteso (vedi DESIGN.md): North Star "Effortless Precision" — Linear/Vercel +
Trade Republic + Apple, sotto la legge Form Follows Function (onestà, deferenza, inevitabilità:
ogni proprietà visiva è conseguenza di una funzione, mai decorazione). Scala hero: page hero
text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em], section hero text-[36px],
sub-hero text-[22px] (mai text-4xl/text-2xl per un hero). Mono Mandate: ogni numero in Geist Mono
+ tabular-nums. Zero-Chroma + Data Owns Color: chrome achromatica, il colore lo possiede il dato
(chart e temi). Gerarchia Trade Republic (un numero dominante, flat divide-y rows, no card-in-card),
useChartColors() per ogni serie grafica, token OKLCH compliance su tutti e 6 i temi.

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)

Al termine: presenta la critique completa, poi proponi lo shape combinato — blocco A (nuovi
modi di presentare le info GIÀ presenti) + blocco B (2-4 nuove feature/estensioni coerenti) —
e fermati al checkpoint per approvazione, senza scrivere codice. Dopo l'ok: implementa tutto
in una volta (craft + polish), con test verdi e tsc pulito.
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
            components/cashflow/CategoryTrendsGrid.tsx,
            components/cashflow/AndamentoStoricoSection.tsx
Pure layer: lib/utils/cashflowTimeSeries.ts

Pagina standalone (estratta dal tab "Analisi" di Cashflow). Unifica anno corrente +
storico in un'unica vista con 3-state period pill (Anno Corrente / Anno / Storico).
Include: Sankey chart con drill-down breadcrumb, TopExpensesBlock (top 5 spese
espandibile), AnomalieBlock (anomalie di spesa), ConfrontoAnnualeSection (confronto
anno corrente vs anno precedente), SavingsRateTrendSection (trend savings rate),
CategoryTrendsGrid (sparkline per categoria, ultimi 12 mesi). Solo in modalità Storico:
AndamentoStoricoSection — Chart A ComposedChart (Entrate/Uscite barre + Risparmio netto
linea) + Chart B LineChart a linee multiple per categoria (sub-toggle Entrate/Uscite),
con toggle Mese/Anno condiviso; aggregazione pura in cashflowTimeSeries.ts (asse temporale
con floor `cashflowHistoryStartYear`). Data fetching autonomo via
useExpenses / useExpenseCategories — non condivide route lifecycle con Cashflow.
Confronta con: Cashflow/Tracciamento (dati condivisi via RQ cache),
Rendimenti (period selector), Storico (narrative order + collapsible appendice).
Design language atteso (vedi DESIGN.md): North Star "Effortless Precision" — Linear/Vercel +
Trade Republic + Apple, sotto la legge Form Follows Function (onestà, deferenza, inevitabilità:
ogni proprietà visiva è conseguenza di una funzione, mai decorazione). Scala hero: page hero
text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em], section hero text-[36px],
sub-hero text-[22px] (mai text-4xl/text-2xl per un hero). Mono Mandate: ogni numero in Geist Mono
+ tabular-nums. Zero-Chroma + Data Owns Color: chrome achromatica, il colore lo possiede il dato
(chart e temi). Gerarchia Trade Republic (un numero dominante, flat divide-y rows, no card-in-card),
useChartColors() per ogni serie grafica, token OKLCH compliance su tutti e 6 i temi.

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)

Al termine: presenta la critique completa, poi proponi lo shape combinato — blocco A (nuovi
modi di presentare le info GIÀ presenti) + blocco B (2-4 nuove feature/estensioni coerenti) —
e fermati al checkpoint per approvazione, senza scrivere codice. Dopo l'ok: implementa tutto
in una volta (craft + polish), con test verdi e tsc pulito.
```

---

## Allocazione

```
/impeccable critique la pagina Allocazione

File: app/dashboard/allocation/page.tsx
Componenti: components/allocation/*

Questa pagina (redesign "ripensamento" 2026-06-04) risponde a una sola domanda — "sono
in linea col target e cosa muovo?" — con: AllocationHero (patrimonio allocato + verdetto
equilibrio: N classi fuori target + scostamento maggiore), RebalancePlan (lista firmata e
ordinata delle mosse per classe, empty-state "Tutto in linea"), RebalanceBandControl (soglia
±2/±5/regola 5·25/custom, di sessione, ri-classifica COMPRA/VENDI/OK in tutta la pagina),
ContributionAllocator (versamento no-sell ripartito per classe e sottocategoria),
AllocationBreakdown (una card, accordion inline grid-template-rows su tutti i breakpoint,
AllocationRow + TargetTick per riga). Colori azione dal tema via useActionColors; pure layer
in allocationUtils.ts. Bottom: sezione "Esposizione Portfolio" (ExposureSection) lazy-loaded
con drill-down per azienda / settore / emittente ETF.
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
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)

Al termine: presenta la critique completa, poi proponi lo shape combinato — blocco A (nuovi
modi di presentare le info GIÀ presenti) + blocco B (2-4 nuove feature/estensioni coerenti) —
e fermati al checkpoint per approvazione, senza scrivere codice. Dopo l'ok: implementa tutto
in una volta (craft + polish), con test verdi e tsc pulito.
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
Design language atteso (vedi DESIGN.md): North Star "Effortless Precision" — Linear/Vercel +
Trade Republic + Apple, sotto la legge Form Follows Function (onestà, deferenza, inevitabilità:
ogni proprietà visiva è conseguenza di una funzione, mai decorazione). Scala hero: page hero
text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em], section hero text-[36px],
sub-hero text-[22px] (mai text-4xl/text-2xl per un hero). Mono Mandate: ogni numero in Geist Mono
+ tabular-nums. Zero-Chroma + Data Owns Color: chrome achromatica, il colore lo possiede il dato
(chart e temi). Gerarchia Trade Republic (un numero dominante, flat divide-y rows, no card-in-card),
useChartColors() per ogni serie grafica, token OKLCH compliance su tutti e 6 i temi.

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)

Al termine: presenta la critique completa, poi proponi lo shape combinato — blocco A (nuovi
modi di presentare le info GIÀ presenti) + blocco B (2-4 nuove feature/estensioni coerenti) —
e fermati al checkpoint per approvazione, senza scrivere codice. Dopo l'ok: implementa tutto
in una volta (craft + polish), con test verdi e tsc pulito.
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
per view toggles e mobile inline legend sui grafici multi-serie. Include inoltre la sezione
"Valore per Strumento" (`MonthlyAssetBreakdownSection`): tabella per-strumento del mese scelto +
somma del sottoinsieme selezionato + trend cross-mese con `TrendTooltip` custom che scompone la
variazione in effetto prezzo vs effetto quantità.
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
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)

Al termine: presenta la critique completa, poi proponi lo shape combinato — blocco A (nuovi
modi di presentare le info GIÀ presenti) + blocco B (2-4 nuove feature/estensioni coerenti) —
e fermati al checkpoint per approvazione, senza scrivere codice. Dopo l'ok: implementa tutto
in una volta (craft + polish), con test verdi e tsc pulito.
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
Design language atteso (vedi DESIGN.md): North Star "Effortless Precision" — Linear/Vercel +
Trade Republic + Apple, sotto la legge Form Follows Function (onestà, deferenza, inevitabilità:
ogni proprietà visiva è conseguenza di una funzione, mai decorazione). Scala hero: page hero
text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em], section hero text-[36px],
sub-hero text-[22px] (mai text-4xl/text-2xl per un hero). Mono Mandate: ogni numero in Geist Mono
+ tabular-nums. Zero-Chroma + Data Owns Color: chrome achromatica, il colore lo possiede il dato
(chart e temi). Gerarchia Trade Republic (un numero dominante, flat divide-y rows, no card-in-card),
useChartColors() per ogni serie grafica, token OKLCH compliance su tutti e 6 i temi.

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)

Al termine: presenta la critique completa, poi proponi lo shape combinato — blocco A (nuovi
modi di presentare le info GIÀ presenti) + blocco B (2-4 nuove feature/estensioni coerenti) —
e fermati al checkpoint per approvazione, senza scrivere codice. Dopo l'ok: implementa tutto
in una volta (craft + polish), con test verdi e tsc pulito.
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
Design language atteso (vedi DESIGN.md): North Star "Effortless Precision" — Linear/Vercel +
Trade Republic + Apple, sotto la legge Form Follows Function (onestà, deferenza, inevitabilità:
ogni proprietà visiva è conseguenza di una funzione, mai decorazione). Scala hero: page hero
text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em], section hero text-[36px],
sub-hero text-[22px] (mai text-4xl/text-2xl per un hero). Mono Mandate: ogni numero in Geist Mono
+ tabular-nums. Zero-Chroma + Data Owns Color: chrome achromatica, il colore lo possiede il dato
(chart e temi). Gerarchia Trade Republic (un numero dominante, flat divide-y rows, no card-in-card),
useChartColors() per ogni serie grafica, token OKLCH compliance su tutti e 6 i temi.

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)

Al termine: presenta la critique completa, poi proponi lo shape combinato — blocco A (nuovi
modi di presentare le info GIÀ presenti) + blocco B (2-4 nuove feature/estensioni coerenti) —
e fermati al checkpoint per approvazione, senza scrivere codice. Dopo l'ok: implementa tutto
in una volta (craft + polish), con test verdi e tsc pulito.
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
Design language atteso (vedi DESIGN.md): North Star "Effortless Precision" — Linear/Vercel +
Trade Republic + Apple, sotto la legge Form Follows Function (onestà, deferenza, inevitabilità:
ogni proprietà visiva è conseguenza di una funzione, mai decorazione). Scala hero: page hero
text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em], section hero text-[36px],
sub-hero text-[22px] (mai text-4xl/text-2xl per un hero). Mono Mandate: ogni numero in Geist Mono
+ tabular-nums. Zero-Chroma + Data Owns Color: chrome achromatica, il colore lo possiede il dato
(chart e temi). Gerarchia Trade Republic (un numero dominante, flat divide-y rows, no card-in-card),
useChartColors() per ogni serie grafica, token OKLCH compliance su tutti e 6 i temi.

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)

Al termine: presenta la critique completa, poi proponi lo shape combinato — blocco A (nuovi
modi di presentare le info GIÀ presenti) + blocco B (2-4 nuove feature/estensioni coerenti) —
e fermati al checkpoint per approvazione, senza scrivere codice. Dopo l'ok: implementa tutto
in una volta (craft + polish), con test verdi e tsc pulito.
```

### Tab "What If"

```
/impeccable critique il tab "What If" della pagina FIRE e Simulazioni

File: app/dashboard/fire-simulations/page.tsx
Componenti: components/fire-simulations/WhatIfAnalysisTab.tsx,
            components/fire-simulations/WhatIfSensitivitySection.tsx,
            components/fire-simulations/WhatIfAnalysisSkeleton.tsx

Questo tab simula eventi di vita (perdita lavoro, acquisto importante, variazione
risparmio/spesa, windfall) e mostra l'impatto before→after su FIRE tradizionale e
Coast FIRE. Gli eventi v1 si applicano "da adesso" (anno 0) come perturbazione di
patrimonio/risparmio/spesa; l'impatto è calcolato ri-eseguendo le pure functions di
fireService su baseline vs adjusted e diffando. L'evento "perdita di lavoro" lascia selezionare
le voci di entrata che vengono a mancare (`IncomeSourceSelector` inline: albero
categoria→sottocategoria, checkbox tri-state, default = `laborIncomeCategoryIds`) e mostra un box
esplicativo con i dati usati + le formule `min/max` della scomposizione (mancati risparmi vs spese
dal portafoglio), layout 2 colonne da `desktop:`. Hero con blocco before→after custom
(non HeroMetricBlock — il sign-coloring confligge con "meno anni = meglio"). Ospita la
matrice "Sensibilità Anni al FIRE" rilocata con baseline locale ri-centrabile. L'impatto
Coast richiede settings.userAge, altrimenti empty-state. Input scenario ephemeral (non persistiti).
Confronta con: FIRE Calculator + Coast FIRE (riusa le stesse fireService functions, hero pattern),
Monte Carlo (scenario inputs + collapsible).
Design language atteso (vedi DESIGN.md): North Star "Effortless Precision" — Linear/Vercel +
Trade Republic + Apple, sotto la legge Form Follows Function (onestà, deferenza, inevitabilità:
ogni proprietà visiva è conseguenza di una funzione, mai decorazione). Scala hero: page hero
text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em], section hero text-[36px],
sub-hero text-[22px] (mai text-4xl/text-2xl per un hero). Mono Mandate: ogni numero in Geist Mono
+ tabular-nums. Zero-Chroma + Data Owns Color: chrome achromatica, il colore lo possiede il dato
(chart e temi). Gerarchia Trade Republic (un numero dominante, flat divide-y rows, no card-in-card),
useChartColors() per ogni serie grafica, token OKLCH compliance su tutti e 6 i temi.

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)

Al termine: presenta la critique completa, poi proponi lo shape combinato — blocco A (nuovi
modi di presentare le info GIÀ presenti) + blocco B (2-4 nuove feature/estensioni coerenti) —
e fermati al checkpoint per approvazione, senza scrivere codice. Dopo l'ok: implementa tutto
in una volta (craft + polish), con test verdi e tsc pulito.
```

---

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
Design language atteso (vedi DESIGN.md): North Star "Effortless Precision" — Linear/Vercel +
Trade Republic + Apple, sotto la legge Form Follows Function (onestà, deferenza, inevitabilità:
ogni proprietà visiva è conseguenza di una funzione, mai decorazione). Scala hero: page hero
text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em], section hero text-[36px],
sub-hero text-[22px] (mai text-4xl/text-2xl per un hero). Mono Mandate: ogni numero in Geist Mono
+ tabular-nums. Zero-Chroma + Data Owns Color: chrome achromatica, il colore lo possiede il dato
(chart e temi). Gerarchia Trade Republic (un numero dominante, flat divide-y rows, no card-in-card),
useChartColors() per ogni serie grafica, token OKLCH compliance su tutti e 6 i temi.

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)

Al termine: presenta la critique completa, poi proponi lo shape combinato — blocco A (nuovi
modi di presentare le info GIÀ presenti) + blocco B (2-4 nuove feature/estensioni coerenti) —
e fermati al checkpoint per approvazione, senza scrivere codice. Dopo l'ok: implementa tutto
in una volta (craft + polish), con test verdi e tsc pulito.
```

### Tab "Obiettivi"

```
/impeccable critique il tab "Obiettivi" della pagina FIRE e Simulazioni

File: app/dashboard/fire-simulations/page.tsx
Componenti: components/fire-simulations/GoalBasedInvestingTab.tsx,
            components/goals/*,
            components/fire-simulations/GoalsSkeleton.tsx

Questo tab è trajectory-led (non solo progress bar). Hero a verdetto (GoalsHero: patrimonio
allocato + "N in ritardo" + prossima scadenza; KPI chip Da-accantonare/mese + Non-assegnato
espandibile sugli asset liberi; lista divide-y sotto desktop / chip grid al desktop). Lista
ordinata per urgenza; ogni riga GoalDetailCard ha chip verdetto (In linea/In ritardo/Raggiunto)
+ ritmo richiesto-vs-pianificato, grafico di proiezione (GoalProjectionChart), asset assegnati
flat divide-y, colori verdetto/priorità su token (goalVerdictMeta). Feature: contribution planner
cross-goal (GoalContributionPlanner, gap×priorità), milestone timeline (GoalMilestoneTimeline).
Layer puro lib/utils/goalTrajectory.ts (contributo richiesto via rendita, data proiettata, verdetto);
InvestmentGoal ha monthlyContribution opzionale.
Confronta con: FIRE Calculator (hero pattern), Allocazione (ContributionAllocator, target%),
Centri di Costo (Panoramica + budget meter).
Design language atteso (vedi DESIGN.md): North Star "Effortless Precision" — Linear/Vercel +
Trade Republic + Apple, sotto la legge Form Follows Function (onestà, deferenza, inevitabilità:
ogni proprietà visiva è conseguenza di una funzione, mai decorazione). Scala hero: page hero
text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em], section hero text-[36px],
sub-hero text-[22px] (mai text-4xl/text-2xl per un hero). Mono Mandate: ogni numero in Geist Mono
+ tabular-nums. Zero-Chroma + Data Owns Color: chrome achromatica, il colore lo possiede il dato
(chart e temi). Gerarchia Trade Republic (un numero dominante, flat divide-y rows, no card-in-card),
useChartColors() per ogni serie grafica, token OKLCH compliance su tutti e 6 i temi.

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)

Al termine: presenta la critique completa, poi proponi lo shape combinato — blocco A (nuovi
modi di presentare le info GIÀ presenti) + blocco B (2-4 nuove feature/estensioni coerenti) —
e fermati al checkpoint per approvazione, senza scrivere codice. Dopo l'ok: implementa tutto
in una volta (craft + polish), con test verdi e tsc pulito.
```

---

## Assistente AI

```
/impeccable critique la pagina Assistente AI

File: app/dashboard/assistant/page.tsx
Componenti: components/assistant/*

Questa pagina (redesign "single period axis" 2026-06-04) offre un assistente AI per analisi
del portafoglio su un unico asse period (AssistantPeriodSelector: Mese / Anno / YTD / Storico /
Libera = ex-Chat) con sub-picker co-locato; in Libera un Contesto opzionale (chatContextType).
Scheda period-reactive (renderPeriodScheda + useAssistantPeriodContext sulla selezione live,
PatrimonioTodayCard per Libera) che mostra net-worth Δ + cashflow + allocation prima della
domanda — desktop colonna destra, mobile nell'empty-state + AssistantContextPill nell'header.
Conversazioni/Memoria aperte da header come sheets su ogni breakpoint. Proactive memory:
AssistantSuggestionsBanner (goal-completion) + AssistantMemoryFacts ("sa di te"). Prefs unificate
in AssistantPreferencesPopover (stile + macro/web + memoria on/off). Follow-up chips
(AssistantFollowUps). Composer slim (AssistantComposer: input+send). Streaming SSE
(meta|context|status|text|done|error; status:'searching' → "Sto cercando sul web…"),
thread persistenti period-pinned, memoria con lifecycle attivo/completato/archiviato.
Confronta con: Rendimenti (hero number + data-first hierarchy), Storico (narrative order),
Goals (flat divide-y list).
Nota: critique baseline 2026-05-24 = 25/40 (pre-redesign). Il redesign è stato implementato
il 2026-06-04 — rieseguire la critique per misurare il delta.
Design language atteso (vedi DESIGN.md): North Star "Effortless Precision" — Linear/Vercel +
Trade Republic + Apple, sotto la legge Form Follows Function (onestà, deferenza, inevitabilità:
ogni proprietà visiva è conseguenza di una funzione, mai decorazione). Scala hero: page hero
text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em], section hero text-[36px],
sub-hero text-[22px] (mai text-4xl/text-2xl per un hero). Mono Mandate: ogni numero in Geist Mono
+ tabular-nums. Zero-Chroma + Data Owns Color: chrome achromatica, il colore lo possiede il dato
(chart e temi). Gerarchia Trade Republic (un numero dominante, flat divide-y rows, no card-in-card),
useChartColors() per ogni serie grafica, token OKLCH compliance su tutti e 6 i temi.

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)

Al termine: presenta la critique completa, poi proponi lo shape combinato — blocco A (nuovi
modi di presentare le info GIÀ presenti) + blocco B (2-4 nuove feature/estensioni coerenti) —
e fermati al checkpoint per approvazione, senza scrivere codice. Dopo l'ok: implementa tutto
in una volta (craft + polish), con test verdi e tsc pulito.
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
Design language atteso (vedi DESIGN.md): North Star "Effortless Precision" — Linear/Vercel +
Trade Republic + Apple, sotto la legge Form Follows Function (onestà, deferenza, inevitabilità:
ogni proprietà visiva è conseguenza di una funzione, mai decorazione). Scala hero: page hero
text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em], section hero text-[36px],
sub-hero text-[22px] (mai text-4xl/text-2xl per un hero). Mono Mandate: ogni numero in Geist Mono
+ tabular-nums. Zero-Chroma + Data Owns Color: chrome achromatica, il colore lo possiede il dato
(chart e temi). Gerarchia Trade Republic (un numero dominante, flat divide-y rows, no card-in-card),
useChartColors() per ogni serie grafica, token OKLCH compliance su tutti e 6 i temi.

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)

Al termine: presenta la critique completa, poi proponi lo shape combinato — blocco A (nuovi
modi di presentare le info GIÀ presenti) + blocco B (2-4 nuove feature/estensioni coerenti) —
e fermati al checkpoint per approvazione, senza scrivere codice. Dopo l'ok: implementa tutto
in una volta (craft + polish), con test verdi e tsc pulito.
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
Design language atteso (vedi DESIGN.md): North Star "Effortless Precision" — Linear/Vercel +
Trade Republic + Apple, sotto la legge Form Follows Function (onestà, deferenza, inevitabilità:
ogni proprietà visiva è conseguenza di una funzione, mai decorazione). Scala hero: page hero
text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em], section hero text-[36px],
sub-hero text-[22px] (mai text-4xl/text-2xl per un hero). Mono Mandate: ogni numero in Geist Mono
+ tabular-nums. Zero-Chroma + Data Owns Color: chrome achromatica, il colore lo possiede il dato
(chart e temi). Gerarchia Trade Republic (un numero dominante, flat divide-y rows, no card-in-card),
useChartColors() per ogni serie grafica, token OKLCH compliance su tutti e 6 i temi.

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)

Al termine: presenta la critique completa, poi proponi lo shape combinato — blocco A (nuovi
modi di presentare le info GIÀ presenti) + blocco B (2-4 nuove feature/estensioni coerenti) —
e fermati al checkpoint per approvazione, senza scrivere codice. Dopo l'ok: implementa tutto
in una volta (craft + polish), con test verdi e tsc pulito.
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
Design language atteso (vedi DESIGN.md): North Star "Effortless Precision" — Linear/Vercel +
Trade Republic + Apple, sotto la legge Form Follows Function (onestà, deferenza, inevitabilità:
ogni proprietà visiva è conseguenza di una funzione, mai decorazione). Scala hero: page hero
text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em], section hero text-[36px],
sub-hero text-[22px] (mai text-4xl/text-2xl per un hero). Mono Mandate: ogni numero in Geist Mono
+ tabular-nums. Zero-Chroma + Data Owns Color: chrome achromatica, il colore lo possiede il dato
(chart e temi). Gerarchia Trade Republic (un numero dominante, flat divide-y rows, no card-in-card),
useChartColors() per ogni serie grafica, token OKLCH compliance su tutti e 6 i temi.

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)

Al termine: presenta la critique completa, poi proponi lo shape combinato — blocco A (nuovi
modi di presentare le info GIÀ presenti) + blocco B (2-4 nuove feature/estensioni coerenti) —
e fermati al checkpoint per approvazione, senza scrivere codice. Dopo l'ok: implementa tutto
in una volta (craft + polish), con test verdi e tsc pulito.
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
Design language atteso (vedi DESIGN.md): North Star "Effortless Precision" — Linear/Vercel +
Trade Republic + Apple, sotto la legge Form Follows Function (onestà, deferenza, inevitabilità:
ogni proprietà visiva è conseguenza di una funzione, mai decorazione). Scala hero: page hero
text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em], section hero text-[36px],
sub-hero text-[22px] (mai text-4xl/text-2xl per un hero). Mono Mandate: ogni numero in Geist Mono
+ tabular-nums. Zero-Chroma + Data Owns Color: chrome achromatica, il colore lo possiede il dato
(chart e temi). Gerarchia Trade Republic (un numero dominante, flat divide-y rows, no card-in-card),
useChartColors() per ogni serie grafica, token OKLCH compliance su tutti e 6 i temi.

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)

Al termine: presenta la critique completa, poi proponi lo shape combinato — blocco A (nuovi
modi di presentare le info GIÀ presenti) + blocco B (2-4 nuove feature/estensioni coerenti) —
e fermati al checkpoint per approvazione, senza scrivere codice. Dopo l'ok: implementa tutto
in una volta (craft + polish), con test verdi e tsc pulito.
```

---

## Cross-cutting: Sistema di Shell e Layout Condivisi

```
/impeccable critique il sistema di shell e layout condivisi dell'app

Componenti: components/layout/PageContainer.tsx,
            components/layout/PageHeader.tsx,
            components/layout/PageTabBar.tsx,
            components/layout/PageTabs.tsx,
            components/layout/ThemePicker.tsx,
            lib/constants/navigation.ts

Questa critique valuta il guscio "interno" condiviso da tutte le pagine del dashboard
come unità: PageContainer (wrapper max-w-[1600px], spacing, max-desktop:portrait:pb-20),
PageHeader (sticky mobile bar h-14 backdrop-blur ↔ desktop full header), il pattern
multi-tab (PageTabBar underline animata desktop ≥1440px ↔ Radix Select / segmented pill
mobile, deep-link, stato tab), ThemePicker (6 temi) e navigation.ts (primaryNav/analysisNav/
planningNav/secondaryHrefs centralizzati). 9 pagine usano queste primitive; Cashflow, FIRE
e Settings usano il pattern multi-tab.
Confronta con: App Shell e Navigazione (sidebar/bottom-nav/drawer = guscio "esterno",
questo è il guscio "interno" della pagina); il benchmark è la coerenza cross-pagina.
Design language atteso (vedi DESIGN.md): North Star "Effortless Precision" — Linear/Vercel +
Trade Republic + Apple, sotto la legge Form Follows Function (onestà, deferenza, inevitabilità:
ogni proprietà visiva è conseguenza di una funzione, mai decorazione). Scala hero: page hero
text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em], section hero text-[36px],
sub-hero text-[22px] (mai text-4xl/text-2xl per un hero). Mono Mandate: ogni numero in Geist Mono
+ tabular-nums. Zero-Chroma + Data Owns Color: chrome achromatica, il colore lo possiede il dato
(chart e temi). Gerarchia Trade Republic (un numero dominante, flat divide-y rows, no card-in-card),
useChartColors() per ogni serie grafica, token OKLCH compliance su tutti e 6 i temi.

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)

Al termine: presenta la critique completa, poi proponi lo shape combinato — blocco A (nuovi
modi di presentare le info GIÀ presenti) + blocco B (2-4 nuove feature/estensioni coerenti) —
e fermati al checkpoint per approvazione, senza scrivere codice. Dopo l'ok: implementa tutto
in una volta (craft + polish), con test verdi e tsc pulito.
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
            components/expenses/CategoryManagementDialog.tsx,
            components/layout/LogoutDialog.tsx,
            components/ui/responsive-modal.tsx

Questa critique valuta la coerenza del sistema dei dialog come unità: struttura
(DialogTitle + DialogDescription presente in tutti?), footer pattern (primario destra /
ghost sinistra), sizing breakpoint, loading state (Loader2 su tutti i submit pending?),
2-step flow in AssetDialog e ExpenseDialog (AnimatePresence mode="wait", spring config),
motion consistency e token compliance cross-dialog.
Convergenza su ResponsiveModal: `components/ui/responsive-modal.tsx` è l'astrazione target —
Dialog su desktop ↔ vaul bottom-sheet Drawer su mobile (≤768px) da una sola API. Oggi la usano
solo ExpenseDialog e CategoryManagementDialog; gli altri dialog-form sono `Dialog` plain (centrato
anche su mobile). Segnala dove un dialog-form trarrebbe beneficio dalla migrazione a ResponsiveModal
per uniformare il comportamento mobile (le conferme piccole e i flussi speciali possono restare Dialog).
Vedi AGENTS.md → "Responsive Modals".
Confronta con: ogni dialog rispetto agli altri — il benchmark è la coerenza interna.
Design language atteso (vedi DESIGN.md): North Star "Effortless Precision" — Linear/Vercel +
Trade Republic + Apple, sotto la legge Form Follows Function (onestà, deferenza, inevitabilità:
ogni proprietà visiva è conseguenza di una funzione, mai decorazione). Scala hero: page hero
text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em], section hero text-[36px],
sub-hero text-[22px] (mai text-4xl/text-2xl per un hero). Mono Mandate: ogni numero in Geist Mono
+ tabular-nums. Zero-Chroma + Data Owns Color: chrome achromatica, il colore lo possiede il dato
(chart e temi). Gerarchia Trade Republic (un numero dominante, flat divide-y rows, no card-in-card),
useChartColors() per ogni serie grafica, token OKLCH compliance su tutti e 6 i temi.

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)

Al termine: presenta la critique completa, poi proponi lo shape combinato — blocco A (nuovi
modi di presentare le info GIÀ presenti) + blocco B (2-4 nuove feature/estensioni coerenti) —
e fermati al checkpoint per approvazione, senza scrivere codice. Dopo l'ok: implementa tutto
in una volta (craft + polish), con test verdi e tsc pulito.
```

---

## Email Periodiche

> **Medium diverso dal resto del registro.** Le altre 17 voci critiquano pagine React del
> dashboard; questa critiqua un artefatto **HTML email** server-side. Il blocco "Design
> language atteso" standard NON si applica: niente token CSS, niente `useChartColors()`,
> niente Framer Motion, niente breakpoint `desktop:`. Usa il benchmark email-specifico qui sotto.
> Distingui inoltre il piano **visivo** (oggetto di questa critique) dal piano **funzionale**
> (correttezza confronti, semantica baseline, boundary periodi, prompt AI) che è dominio di
> `/code-review` + test Vitest (`__tests__/emailPeriodComparison.test.ts`), non di impeccable.

```
/impeccable critique l'email periodica (riepilogo mensile / trimestrale / semestrale / annuale)

PRE-STEP OBBLIGATORIO — l'email va VISTA, non solo letta nel sorgente:
`buildEmailHtml` ritorna una stringa HTML. Prima di critiquare, RENDERIZZALA:
genera l'HTML (via il manual test-send `app/api/user/monthly-email/send/route.ts`,
oppure salvando l'output di build in un file `.html`) e aprila nel browser —
idealmente in light E dark, a larghezza desktop E mobile (320–375px). Una critique
sul solo sorgente TS è cieca su spacing, overflow e resa cross-client.

File: lib/server/monthlyEmailService.ts
      (buildEmailHtml, simpleMarkdownToHtml, buildComparisonSectionHtml, comparisonCell)
Contesto logico (non visivo, solo per capire i dati renderizzati):
      lib/server/emailPeriodComparison.ts,
      app/api/user/monthly-email/send/route.ts (per il render di test)

L'email ha: hero patrimonio netto, tabella deterministica "Confronti" (Patrimonio/Entrate/
Uscite/Risparmio × periodo precedente + stesso periodo anno prima, con nota baseline),
e un commento AI in 5 sezioni (sintesi / vs periodo precedente / vs anno prima /
variazione entrate-spese + cause / azioni) reso da markdown via simpleMarkdownToHtml.

Design language atteso (email HTML — il medium impone vincoli OPPOSTI al dashboard):
Il principio resta quello di DESIGN.md — "Effortless Precision" e la legge Form Follows
Function (onestà, deferenza, inevitabilità): ogni elemento giustifica la sua presenza
comunicando un numero, un trend o una relazione. Ma questi vincoli del medium NON sono violazioni:
- Stili INLINE con hex hardcoded sono OBBLIGATORI — i client email (Gmail, Outlook) non
  supportano CSS variables/token né classi esterne. NON segnalare gli hex inline come
  "token violation": qui è onestà verso il medium, non un difetto.
- Layout a TABELLE (`<table>`/`<td>`) è corretto e necessario — non flex/grid.
- NON applicabili e da NON cercare: `useChartColors()`, Framer Motion, ARIA `role="tablist"`,
  breakpoint `desktop:`, count-up, Recharts.
Cosa invece DEVE valere (i principi che attraversano il medium):
- Mono Mandate adattato: ogni numero (patrimonio, %, €) usa uno stack monospace
  (`'Geist Mono', ui-monospace, monospace`) con allineamento tabellare nella tabella Confronti.
- Gerarchia Trade Republic: UN numero dominante (patrimonio netto), eyebrow label sopra,
  variazione/contesto sotto. Nessun numero secondario di pari peso visivo.
- Zero-chroma / Data Owns Color: la chrome è achromatica (grigi); il colore è riservato ai
  delta sign-aware — verde positivo / rosso negativo, con semantica INVERTITA sulle Uscite
  (un +% di spesa è rosso). Nessun accento decorativo.
- Chrome reduction: niente box-dentro-box; separazione via `border-bottom` sulle righe.
Assi di qualità PROPRI del medium email (valuta QUESTI):
- Compatibilità client: Gmail web/app, Apple Mail, Outlook.
- Dark mode: oggi l'email è light-only su `#ffffff` fisso, senza `<meta name="color-scheme">`
  né `@media (prefers-color-scheme: dark)` → opportunità, segnalala.
- Mobile: la tabella Confronti non deborda a 320–375px; body ≥ 14px; singola colonna.
- Fedeltà markdown→HTML: simpleMarkdownToHtml rende le 5 sezioni (heading, liste ol/ul,
  grassetti) senza `<br>` orfani o spacing rotto.
- Fallback dati: celle "N/D" pulite quando manca una baseline; caso `previousEqualsYoy`
  (yearly degenere) collassa a colonna singola.
- Accessibilità: `lang="it"`, header di tabella semantici, contrasto AA del grigio su sfondo,
  larghezza max 600px centrata.

Contesto:
- Leggi DESIGN.md (North Star, Form Follows Function, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)

Al termine: presenta la critique completa, poi proponi lo shape combinato — blocco A (nuovi
modi di presentare le info GIÀ presenti) + blocco B (2-4 nuove feature/estensioni coerenti) —
e fermati al checkpoint per approvazione, senza scrivere codice. Dopo l'ok: implementa tutto
in una volta (craft + polish), con test verdi e tsc pulito.
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
15. FIRE e Simulazioni (5 tab — incl. What If)
16. Assistente AI ← rieseguire dopo redesign (baseline: 25/40)
17. Cross-cutting: Shell e Layout Condivisi (PageContainer/PageHeader/PageTabBar) ← guscio mai verificato come unità
18. Email Periodiche ← medium a sé (HTML email, mai critiquato), benchmark proprio + render pre-step obbligatorio
