# Spec — Redesign dei pie chart

**Stato**: implementata (Sonnet 5), con una correzione post-implementazione — vedi nota sotto
**Data**: 2026-07-13
**Origine**: feedback utente — i pie chart sembrano "poco in linea" con la linea visiva dell'app, con troppo spazio libero su desktop. Complimenti per la grafica generale; l'appunto riguarda solo i pie.

**Correzione post-implementazione (2026-07-13)**: il censimento §0 (riga 4) classificava
`components/goals/GoalAllocationPieChart.tsx` come "Tenere (unico caso giustificato)" senza
verificarne l'importer. Si è rivelato codice morto — il donut era già stato rimosso dalla UI
di `GoalBasedInvestingTab` in una sessione precedente (commento nel file: "Pie chart removed —
values readable from the list directly"), quindi 0 importer. È stato prima polishato per
errore (commit `polish(goals)`), poi eliminato quando l'utente ha segnalato di non vederlo
nella pagina Obiettivi e un grep ha confermato zero importer. L'app ora non ha più nessun
`<Pie>` Recharts. Dettaglio in CLAUDE.md → Current Status → Latest.

---

## 0. Contesto, diagnosi, principio guida

### Diagnosi

Censimento completo dei pie/donut nel codebase (2026-07-13):

| # | Superficie | File | Stato attuale | Decisione |
|---|-----------|------|---------------|-----------|
| 1 | **Analisi** — Spese per Categoria, sottocategorie (drill-down), Spese per Tipo, Entrate per Categoria, sottocategorie | `components/cashflow/AnalisiTab.tsx` (~980–1115) | 5 pie pieni in card `desktop:col-span-2` full-width, `ResponsiveContainer` alto 500px desktop, `outerRadius` 140 → cerchio ~280px che galleggia al centro di ~1200px con legenda verticale a destra | **Sostituire** con lista di barre orizzontali ordinate (righe cliccabili per il drill-down) |
| 2 | **Dashboard overview** — Distribuzione per Asset Class / per Asset | `components/dashboard/OverviewChartsSection.tsx` (~209, ~268) + `components/ui/pie-chart.tsx` | 2 pie compatti 160px + legenda a fianco | **Sostituire** con composition bar impilata + righe legenda (pattern Allocazione) |
| 3 | **Dividendi** — "Dividendi per asset" | `components/dividends/DividendTrackingTab.tsx` (`DividendCharts`, ~881–896) | Pie pieno h=260, legenda Recharts default | **Sostituire** con lista di barre orizzontali ordinate per payer |
| 4 | **Obiettivi** — distribuzione per goal | `components/goals/GoalAllocationPieChart.tsx` | Donut 60/100 con active-slice + label centrale | **Tenere** (unico caso giustificato), solo polish DESIGN.md |
| 5 | **Codice morto** | `components/cashflow/CurrentYearTab.tsx`, `TotalHistoryTab.tsx` (11 pie legacy, **0 importer**), ramo full-size di `components/ui/pie-chart.tsx` | `AnalisiTab` li ha fusi (vedi suo header doc) | **Eliminare** in commit separato |

### Principio guida

I pie chart sono adatti a **parte-sul-tutto con ≤5 fette** dove la domanda è "che quota è?". Le superfici 1–3 rispondono invece a "**quali voci sono più grandi, e di quanto?**" (8–12 voci): il confronto tra grandezze si legge su lunghezze allineate, non su angoli. La forma corretta è la riga ordinata stile Trade Republic (label + barra + valore mono + %), che riempie la larghezza desktop e scala a qualsiasi numero di voci.

Precedente interno che avvalora la direzione (DESIGN.md): il donut della card Liquidità fu sostituito da righe piatte "perché comunicano di più con meno rumore"; `AllocationCompositionBar` è nata esplicitamente come alternativa non-pie. Il donut Obiettivi resta perché lì la domanda È parte-sul-tutto, ha poche fette, e l'active-slice sincronizzata con la lista + label centrale portano informazione che le righe non darebbero.

### Bug latente sanato da questa spec

In `AnalisiTab`, `COLORS = useChartColors()` restituisce stringhe **oklch** (o comunque non-hex) sui temi correnti, ma `deriveSubcategoryColors` (~riga 564) fa `parseInt(hex.slice(1,3), 16)` e su input non-`#` cade sul fallback hardcoded `#6366f1`: **oggi tutte le viste sottocategoria sono indaco fisso su ogni tema**, in violazione di Zero-Chroma / Data Owns Color. La sostituzione (§3.3) elimina la conversione hex.

### Ordine di implementazione e commit

Conventional Commits, un cambio logico per commit, in quest'ordine:

1. `feat(ui): add CompositionList ranked-bar primitive` — §2 (+ test util shading §3.3)
2. `refactor(analisi): replace drill-down pies with ranked composition lists` — §3
3. `refactor(overview): replace compact pies with composition bar` — §4 (include estrazione `CompositionBar`, §4.1)
4. `refactor(dividends): replace per-asset pie with ranked composition list` — §5
5. `polish(goals): align allocation donut with DESIGN.md` — §6
6. `chore(cashflow): remove dead CurrentYearTab/TotalHistoryTab and unused pie-chart component` — §7

---

## 1. Vincoli trasversali (obbligatori)

- **DESIGN.md è autoritativo** (leggerlo prima di iniziare): Zero-Chroma sul chrome, Data Owns Color, card `rounded-2xl` `p-5` per contenitori chart, breakpoint layout `desktop:` (1440px, mai `lg:`), mobile-first 390px, swatch legenda **quadrati `rounded-[2px]`** (mai cerchi: leggono come status dot).
- **AGENTS.md — Motion and Charts**: colori serie sempre da `useChartColors()` (mai hex hardcoded); pattern rAF, mai `useMemo` su `getComputedStyle`; dati con colori baked in cache React Query → **remap a render time** (`data.map((d,i)=>({...d, color: chartColors[i] ?? d.color}))`); componenti sempre module-level (React Compiler: mai annidati); card chart **sempre renderizzate** con empty state esplicito, mai nascoste condizionalmente.
- **Motion**: Framer Motion, gating con `useReducedMotion()`; ease house `[0.16, 1, 0.3, 1]`; animazioni width con stagger `0.05 * i` (riferimento: `AllocationCompositionBar`).
- **COMMENTS.md**: i nuovi componenti hanno un header Design comment (WHY, non WHAT) come `AllocationCompositionBar.tsx`.
- **DEVELOPMENT_GUIDELINES.md**: SRP, naming verb+noun, pure functions in `lib/utils` testate in `__tests__/`.
- **Formattazione valori**: `cachedFormatCurrencyEUR` (`lib/utils/formatters.ts`) o il formatter già in uso nella superficie; valori sempre `font-mono tabular-nums`.

---

## 2. Nuovo primitivo: `CompositionList`

**File**: `components/ui/composition-list.tsx` — presentazionale puro, riusato da Analisi (×5 istanze), Dividendi, e in futuro altrove.

### Contratto

```tsx
export interface CompositionListItem {
  /** Chiave stabile per key/click (di norma = name). */
  id: string;
  name: string;
  /** Grandezza assoluta (es. euro). Determina la larghezza barra. */
  value: number;
  /** Quota sul totale, 0–100. Mostrata come etichetta %. */
  percentage: number;
  /** Colore risolto dal chiamante (useChartColors / shading). Mai hardcoded qui. */
  color: string;
  /** Opacità della barra (default 1). Usata dallo shading sottocategorie. */
  barOpacity?: number;
}

interface CompositionListProps {
  items: CompositionListItem[];          // già ordinati desc dal chiamante
  onItemClick?: (item: CompositionListItem) => void;
  formatValue?: (value: number) => string; // default cachedFormatCurrencyEUR
  /** Se presente, mostra al massimo N righe + footer "Altre N voci · X €" (non cliccabile). */
  maxRows?: number;
  ariaLabel: string;
}
```

### Anatomia della riga

Lista `divide-y divide-border/60` (Trade Republic: righe piatte, niente box-in-box). Ogni riga, `py-2.5` (o `py-3` se serve target touch ≥44px su mobile — verificare), layout a griglia per allineare le colonne tra le righe:

```
[label]                    [barra ██████████░░░░ ]   [1.240 €]  [38,2%]
```

- **Label**: `text-sm font-medium text-foreground truncate min-w-0`. Colonna sinistra a larghezza flessibile ma con `min-w` sufficiente (indicativo: `w-[30%] desktop:w-[22%]`) così le barre partono tutte dalla stessa x — l'allineamento è ciò che rende confrontabili le lunghezze.
- **Barra**: track `h-1.5 rounded-full bg-muted overflow-hidden` a larghezza piena della colonna centrale; fill `h-full rounded-full` con `backgroundColor: item.color` e `opacity: item.barOpacity ?? 1`. **Larghezza fill = `value / maxValue`** (la voce più grande = 100% del track): la barra codifica il *rank*, l'etichetta `%` codifica la *quota sul totale*. Non usare `percentage` come larghezza (con 12 voci la più grande al 30% lascerebbe di nuovo il vuoto che stiamo eliminando).
- **Valore**: `font-mono tabular-nums text-sm text-foreground text-right` a larghezza fissa (es. `w-24`), così i numeri incolonnano.
- **%**: `font-mono tabular-nums text-xs text-muted-foreground text-right w-14`.
- Niente swatch colore separato: il colore vive nella barra stessa.

### Interattività (solo se `onItemClick` è passato)

- Riga = `<button type="button">` full-width (non div+onClick): tastiera gratis, `focus-visible:ring` di sistema.
- `cursor-pointer`, hover `bg-muted/40 transition-colors duration-150`, `rounded-md -mx-2 px-2` per l'area hover senza rompere l'allineamento del `divide-y`.
- `aria-label` per riga: `"{name}, {formatValue(value)}, {percentage}%"`.
- Senza `onItemClick`: righe statiche, nessun hover/cursor.

### Motion

`motion.div` sul fill della barra: `initial={{ width: 0 }}` → `animate={{ width: \`${pct}%\` }}`, `transition={{ duration: 0.5, ease: [0.16,1,0.3,1], delay: 0.05 * i }}`, tutto disattivato con `useReducedMotion()` (stesso identico pattern di `AllocationCompositionBar.tsx:84-90` — copiarlo).

### Empty state / footer

- `items.length === 0` → il **chiamante** decide (le card ospiti hanno già i propri empty state); il componente può ritornare `null`.
- `maxRows`: se `items.length > maxRows`, mostra `maxRows - 1` righe + riga footer statica `text-xs text-muted-foreground` "Altre {n} voci · {somma} €".

### Header doc (COMMENTS.md)

Design comment che spiega: perché barre ordinate e non pie (confronto di grandezze → lunghezze allineate), perché width = value/maxValue e non percentage (rank vs quota), e che i colori arrivano risolti dal chiamante.

---

## 3. Analisi — `components/cashflow/AnalisiTab.tsx`

### 3.1 Cosa NON cambia

- Derivazioni dati: `expensesByCategoryData`, `incomeByCategoryData`, `expensesByTypeData` (memoizzate, ~426–437), `getSubcategoriesData`, `getFilteredExpenses`.
- La macchina a stati del drill-down: `drillDown`, `handleCategoryClick` / `handleSubcategoryClick` / `handleBack`, breadcrumb, `ExpenseList`, reset su cambio periodo, scroll-into-view da `AnomalieBlock` (`handleAnomaliaClick` usa `expensesByCategoryData` per il colore — continua a funzionare).
- Sankey, Confronto Annuale, trend section, hero KPI, Spese Maggiori.

### 3.2 Sostituzione dei rendering

Ognuno dei 5 blocchi `ResponsiveContainer > RechartsPC > Pie` (righe ~982, ~1001, ~1031, ~1074, ~1092) diventa una `CompositionList`:

| Blocco | items | onItemClick |
|---|---|---|
| Spese per Categoria (level `category`) | `expensesByCategoryData` | `(item) => handleCategoryClick(item, 'expenses')` |
| Spese sottocategorie (level `subcategory`) | `currentSubcategoriesData` | `handleSubcategoryClick` |
| Spese per Tipo | `expensesByTypeData` | — (nessun drill-down, come oggi) |
| Entrate per Categoria | `incomeByCategoryData` | `(item) => handleCategoryClick(item, 'income')` |
| Entrate sottocategorie | `currentSubcategoriesData` | `handleSubcategoryClick` |

Note:
- `ChartData` (name/value/percentage/color) è già compatibile con `CompositionListItem` a meno di `id` — usare `name` come `id` (i nomi categoria sono univoci per costruzione della Map).
- I click handler oggi ricevono `ChartData`; adeguare le firme o mappare nel callsite (il payload serve per `name` e `color`).
- Le card restano `desktop:col-span-2` con `CardHeader`/`CardTitle`, breadcrumb e "Indietro" invariati; **rimuovere le altezze fisse** `pieChartHeight`/`pieOuterRadius` (~634–635): l'altezza diventa naturale dal numero di righe.
- Mobile: stesso componente full-width. Sparisce il limite `maxItems={isMobile ? 3 : undefined}` della vecchia legenda: mostrare tutte le voci (le liste categoria hanno tipicamente <15 righe; se si vuole un cap prudenziale usare `maxRows` uguale su mobile e desktop, non un cap solo-mobile).
- **Rimozioni a fine migrazione** (verificare con grep che non abbiano altri usi *nel file*): import Recharts (`PieChart as RechartsPC`, `Pie`, `Cell`, `ResponsiveContainer`, `Tooltip`, `Legend`), `ChartTooltip`, `LegendItems`, `pieChartHeight`, `pieOuterRadius`. Attenzione: `ChartTooltip` potrebbe essere usato da altri chart nello stesso file — rimuovere solo se orfano.

### 3.3 Shading sottocategorie (fix del bug oklch)

Sostituire `deriveSubcategoryColors` con uno shading **indipendente dal formato colore**: tutte le righe sottocategoria usano `color = selectedCategoryColor` (il colore della categoria padre, qualunque formato sia) e si differenziano per `barOpacity` decrescente.

Nuova pure util in `lib/utils/` (es. dentro un nuovo `compositionShading.ts` o un modulo esistente affine):

```ts
/** Opacità decrescenti per N voci ordinate: 1.0 → 0.4, distribuzione lineare. */
export function computeShadeOpacities(count: number): number[]
// count=1 → [1]; count=4 → [1, 0.8, 0.6, 0.4]
```

- Test Vitest in `__tests__/` (casi: 0, 1, 2, n; clamp; monotonia decrescente).
- `getSubcategoriesData` smette di calcolare `color` per voce: ritorna le voci e il chiamante assegna `color: selectedCategoryColor` + `barOpacity: opacities[i]`.
- Il bucket "Altro" (spese senza sottocategoria) resta com'è nella derivazione dati.

---

## 4. Dashboard overview — `components/dashboard/OverviewChartsSection.tsx`

### 4.1 Estrazione del primitivo `CompositionBar`

**File**: `components/ui/composition-bar.tsx`. Estrarre la parte presentazionale di `AllocationCompositionBar` (barra impilata + legenda):

```tsx
export interface CompositionBarSegment {
  key: string;
  label: string;
  pct: number;    // 0–100, i segmenti sommano ~100
  color: string;
}

interface CompositionBarProps {
  segments: CompositionBarSegment[];  // già ordinati e filtrati (pct > 0)
  ariaLabel: string;
  /** Se false, nasconde la legenda integrata (il chiamante ne renderizza una propria). */
  showLegend?: boolean; // default true
}
```

- Markup e motion identici a `AllocationCompositionBar.tsx:68-111` (track `flex h-2.5 w-full overflow-hidden rounded-full bg-muted`, segmenti `motion.div` con stagger, `role="img"` + `aria-label`, `title` per segmento).
- **Correzione contestuale alla legenda integrata**: swatch `rounded-[2px]` quadrato, non `rounded-full` (DESIGN.md; l'attuale `AllocationCompositionBar` usa `rounded-full` — allinearlo in questa estrazione).
- `AllocationCompositionBar` diventa un thin wrapper: mantiene la derivazione segmenti da `byAssetClass` con `ASSET_CLASS_CHART_INDEX` + `ASSET_CLASS_LABELS` (`lib/utils/allocationUtils.ts`) e delega il render a `CompositionBar`. Comportamento visivo invariato (a parte lo swatch).

### 4.2 Sostituzione dei 2 pie compatti

Nelle due card desktop (~252–286) e nel tab panel mobile (~207–225): il blocco `flex items-center gap-4` con `PieChartComponent` compact + colonna `LegendRow` diventa:

```
<CompositionBar segments={…} ariaLabel={…} showLegend={false} />
<colonna LegendRow esistente (gap-[7px], filtro ≥5%) sotto la barra, mt-3>
```

- Le `LegendRow` esistenti (~139–152) sono già conformi a DESIGN.md (swatch `rounded-[2px]`, `%` non valuta, filtro `percentage >= 5`) — riusarle tal quali.
- I segmenti della barra usano **tutte** le voci (anche <5%): la barra è la composizione completa, le righe sono il dettaglio leggibile.
- Il bucket "Altri" (top-10 + resto, grigio, da `chartService.prepareAssetDistributionData`) resta nella derivazione dati e appare come segmento+riga.
- Tab switcher mobile, `LoadingPlaceholder`, `EmptyState`, gating `chartRenderReady` e reveal tracking (`revealedCharts`) invariati; `animateOnMount`/`onFirstRender` si mappano sul gating del motion della barra (animare solo al primo reveal della sezione).

### 4.3 Coerenza colori cross-pagina

- **Distribuzione per Asset Class**: i colori devono coincidere con Allocazione/Storico → risolvere via `ASSET_CLASS_CHART_INDEX` + `useChartColors()` per classe. I dati arrivano da `chartService.prepareAssetDistributionData` con colori baked (regola AGENTS.md: cache React Query → **remap a render time**). Se i data item portano solo la label italiana, ricavare la classe con l'inversa di `ASSET_CLASS_LABELS` (o estendere la derivazione dati per portare la chiave classe — preferibile).
- **Distribuzione per Asset** (10 voci + Altri): remap posizionale `chartColors[i]` come oggi; "Altri" mantiene il neutro.

### 4.4 Conseguenza

Dopo questa migrazione `components/ui/pie-chart.tsx` non ha più importer → si elimina in §7.

---

## 5. Dividendi — `components/dividends/DividendTrackingTab.tsx`

Nel componente `DividendCharts` (~864), il pannello "Dividendi per asset" (~881–896): sostituire `ResponsiveContainer > PieChart > Pie` con `CompositionList`:

- `items`: da `payers` (`PayerRow[]`) — `{ id: assetTicker, name: assetTicker, value: net, percentage: net/totalNet*100, color: color(i) }`, ordinati per `net` desc (verificare l'ordinamento a monte; se assente, ordinare qui).
- `onItemClick`: **nessuno**.
- `maxRows`: 8 (i portafogli dividend possono avere molti payer; il leaderboard sopra già dà il dettaglio completo).
- Il pannello resta `rounded-xl border border-border/60 p-4` con `h4` invariato, nella stessa grid 2-col accanto al BarChart "Dividendi per anno" (che non si tocca). Le altezze delle due celle possono divergere: accettabile (la grid già gestisce celle indipendenti); non forzare altezze fisse.
- Rimuovere gli import Recharts orfani (`PieChart`, `Pie`, `Cell`) se non usati altrove nel file.

---

## 6. Obiettivi — `components/goals/GoalAllocationPieChart.tsx` (polish, NON sostituzione)

Il donut resta: poche fette, domanda parte-sul-tutto, active-slice sincronizzata con la lista goal, label centrale contestuale. Interventi di allineamento a DESIGN.md/AGENTS.md:

1. **Legenda**: sostituire la `<Legend>` Recharts default con `content` custom **module-level** (regola AGENTS.md sulla stable reference): swatch quadrato `h-2 w-2 rounded-[2px]` col colore della fetta, label `text-[11px] text-muted-foreground`, layout `flex flex-wrap gap-x-4 gap-y-1.5 justify-center mt-2`.
2. **Tooltip**: aggiungere `itemStyle={{ color: 'var(--card-foreground)' }}` (oggi mancante — AGENTS.md: i tre style props non ereditano). `contentStyle`/`labelStyle` già corretti via CSS vars.
3. **Motion**: gating `useReducedMotion()` → `animationDuration={reducedMotion ? 0 : 600}` (oggi anima incondizionatamente).
4. Tutto il resto (active-slice opacity/stroke, center label SVG con `style={{fill}}`, lettura `--muted-foreground` post-paint via rAF) è già conforme: non toccare.

---

## 7. Cleanup (commit separato, per ultimo)

1. **Eliminare** `components/cashflow/CurrentYearTab.tsx` e `components/cashflow/TotalHistoryTab.tsx` — 0 importer (verificato 2026-07-13: `AnalisiTab` li ha fusi; ri-verificare con grep prima di cancellare).
2. **Aggiornare il commento stale** in `components/cashflow/CashflowSankeyChart.tsx` (~riga 21): "Used by: CurrentYearTab and TotalHistoryTab cashflow pages" → "Used by: AnalisiTab".
3. **Eliminare** `components/ui/pie-chart.tsx` dopo la migrazione §4 (grep per `pie-chart` e `PieChartComponent` prima di rimuovere). Il tipo `PieChartData` vive in `chartService` e resta (usato dalla derivazione dati overview).
4. Grep finale su `from 'recharts'` nei file toccati per import orfani.

---

## 8. Test e verifica

### Automatica

- Vitest: `npx vitest run __tests__/<nuovo-file-shading>` (util §3.3) + suite esistente invariata.
- `npx tsc --noEmit` pulito.

### Manuale end-to-end (per ogni step, prima del commit)

1. **Analisi** (`/dashboard/analisi`), desktop ≥1440px e mobile 390px: drill-down completo Spese → categoria → sottocategoria → lista spese e Indietro a ritroso; idem Entrate; click da AnomalieBlock che pre-seleziona la categoria; cambio periodo che resetta il drill-down. Le sottocategorie devono mostrare **sfumature del colore della categoria padre** (non più indaco fisso).
2. **Overview** (`/dashboard`): 2 card desktop affiancate, tab switcher mobile; colori Asset Class **identici** a Allocazione e Storico sullo stesso tema.
3. **Dividendi**: pannello per-asset come lista ordinata, footer "Altre N voci" se >8 payer.
4. **Obiettivi**: selezione goal dalla lista → active-slice + label centrale invariati; legenda con swatch quadrati.
5. Tutto su tema default light + dark + almeno un tema colorato (es. `cyberpunk`); con `prefers-reduced-motion` attivo nessuna animazione di larghezza.

### Criteri di accettazione

- Nessuna card chart con più di ~40% di altezza vuota su desktop 1440px.
- Nessun nuovo colore hardcoded (grep `#[0-9a-fA-F]{6}` sui file toccati: ammessi solo i fallback pre-esistenti documentati).
- Drill-down Analisi funzionalmente identico a prima (stessi 3 livelli, stesso breadcrumb).
- Zero regressioni TypeScript e Vitest.

---

## 9. Aggiornamento documentazione (parte integrante dell'implementazione)

I documenti di design sono il contratto per le sessioni AI future: aggiornarli negli stessi commit (o in un commit `docs:` finale), mai in una sessione separata.

1. **DESIGN.md**:
   - §6 Don'ts: rimuovere/riformulare il Don't su "ResponsiveContainer in compact pie chart mode" (descrive `ui/pie-chart.tsx`, che viene eliminato).
   - §5: aggiungere i pattern **`CompositionList`** (righe ordinate: label + barra `value/maxValue` + valore mono + %) e **`CompositionBar`** come forme canoniche per confronto e composizione, con la regola: *pie/donut solo per parte-sul-tutto con ≤5 fette e informazione aggiuntiva (es. active-slice Obiettivi); per confronti di grandezza, barre ordinate*. Estende il Don't esistente sul donut Liquidità → righe piatte.
   - §5 "Chart Legend Swatch": riancorare la descrizione ("used in pie chart legend rows" → composition bar / chart legend rows). Il pattern resta identico.
2. **AGENTS.md** (sezione Motion and Charts + note drill-down): aggiornare i gotcha specifici dei pie (compact pie + ResponsiveContainer, doppia legenda, "Pie/Sankey drill-downs…" — il drill-down ora passa dalle righe di `CompositionList`); aggiungere i gotcha nuovi (width = `value/maxValue` non `percentage`; shading sottocategorie via `barOpacity` + `computeShadeOpacities`, mai parse hex dei colori `useChartColors`).
3. **CLAUDE.md**: entry in Current Status → Latest + aggiornamento Key Files (rimozione file eliminati, aggiunta `components/ui/composition-{list,bar}.tsx`).
4. **docs/critique-prompts.md** e **docs/audit-prompts.md**: aggiornare i blocchi di Analisi, Overview e Dividendi dove descrivono i pie chart — **prima** di eventuali lanci `/impeccable` su quelle pagine, che consumano quei blocchi come prompt.
5. **docs/screenshots/**: rigenerare gli screenshot delle pagine toccate (opzionale ma raccomandato: screenshot stale ingannano le sessioni future).
