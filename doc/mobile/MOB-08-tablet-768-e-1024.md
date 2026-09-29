# MOB-08 — Tablet: 768 e 1024

> Stato: da fare · Priorità: 3 (il telefono prima; qui si raddrizza il landscape) · Sforzo: M · Dipende da: MOB-03..07
> (e quindi MOB-01, MOB-02; PERF-01, PERF-02, PERF-14 chiuse) · Sblocca: MOB-09

## 1. Il problema, misurato

Censimento 2026-09-26 (`doc/mobile/README.md` § 3). **768×1024**: mediana 2,39 schermate, 3 tessere sopra la piega,
una intera. **1024×768**: mediana 3,11 (non «~3,5»), di norma una sopra la piega e nessuna intera (Allocazione 2/1,
Analisi 1/1): il landscape è il tablet peggiore. Righe del 2026-09-26, da riverificare:

- Griglie `grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-12` (The Tile Grid Rule; `app/dashboard/page.tsx:351`
  e § 5): due colonne anche a 1024.
- La barra (`app/dashboard/layout.tsx:37`, `py-2.5` + `border-b`, solo `max-desktop:landscape`) porta `SidebarTrigger`
  a `size-7` (`components/ui/sidebar.tsx:275`): 10 + 28 + 10 + 1 = **49 px** (`main` 719, MOB-01). Il suo solo controllo,
  28×28 su un touch, apre il drawer (DESIGN.md § 6: «Don't ship a touch target under 44px in … the phone drawer»).
- Senza pill (`components/layout/BottomNavigation.tsx:73`, `max-desktop:landscape:hidden`) l'unico modo di aggiungere è
  «Aggiungi» (`components/cashflow/ExpenseTrackingTab.tsx:1017`, `max-desktop:portrait:hidden h-9`: 36 px).
- **Tailwind 4.3.0 emette le container query DOPO le media query** (sonda `@tailwindcss/node`): `@[960px]:grid-cols-3`
  vince su `desktop:grid-cols-12` a 1440; `max-desktop:@[960px]:` = `@media (width < 1440px) { @container … }`.
- `playwright.config.ts` non ha progetti tablet; `desktop` ignora `/\.(mobile|degraded)\.spec\.ts/` e le fixture
  proprie (`:92`): un `*.tablet.spec.ts` girerebbe anche a 1440.

## 2. Obiettivo misurabile

- `npm run mobile:budget` verde su 19 superfici × 3 viewport, con 768 e 1024 resi vincolanti (MOB-01 § 3) e stretti con
  `-- --tighten` nello stesso commit.
- Su ogni superficie composta, a 768 e 1024: `firstClosedRowAbovePill: true` (a 1024 = fondo di `main`, MOB-01 § 4),
  `overflowX: false`, **`screens` a 1024 ≤ `screens` a 768**; `tilesFullyAboveFold ≥ 1` sulle due pagine campione.
- La barra misurata come in § 4.3, trigger ≥ 44×44. A 1440 ogni griglia ha 12 colonne e nessun `grid-template-rows` nuovo.

## 3. Non-obiettivi

- Telefono (MOB-02..07), desktop, DESIGN.md (MOB-09), B e C; le griglie annidate (`*Dettaglio.tsx`, Impostazioni,
  Assistente) restano su `tablet:`.
- `TileGridSkeleton` (`components/ui/tile-grid-skeleton.tsx:57`) resta a due colonne (§ 4.6, 5).
- Hall of Fame, Analisi, Centri, Divisione a tablet in Playwright: fixture proprie, escluse come oggi. La soglia dei 640
  del Flusso resta quindi coperta a 390 (`analisi.mobile.spec.ts`) e a 1440 (`analisi.spec.ts`), non fra i due: il Sankey
  a 768 e 1024 lo guarda il giro (§ 8).

## 4. Design

### 4.1 La griglia compatta (AGENTS § Tailwind Breakpoints and Responsive Layout)

Due colonne da `tablet:`; tre con una container query sotto `max-desktop:` (mai `lg:` né `min-[…]:`), su un `div`
NUOVO attorno alla griglia: non `PageContainer`, perché `container-type` ancora a sé i `fixed` e `SavingsRateBadge`
(`components/ui/SavingsRateBadge.tsx:114`) lo è, dentro di lui (`app/dashboard/page.tsx:522`). Costanti letterali in
`lib/utils/tabletComposition.ts`:

| Costante | Classi |
|---|---|
| `COMPACT_GRID_WRAPPER_CLASS` | `@container` |
| `COMPACT_GRID_CLASS` | `grid grid-cols-1 gap-3 tablet:grid-cols-2 max-desktop:@[960px]:grid-cols-3 max-desktop:@[960px]:grid-rows-[repeat(var(--beside),auto)_1fr] desktop:grid-cols-12` |
| `LEAD_CELL_CLASS` | `tablet:col-span-2 max-desktop:@[960px]:col-span-2 max-desktop:@[960px]:[grid-row:1/span_var(--lead-rows)] max-desktop:@[960px]:self-start` |
| `REST_CELL_CLASS` | `max-desktop:@[960px]:[grid-column:3] max-desktop:@[960px]:row-start-1` (`className` di `PageRest`) |
| `BESIDE_CELL_CLASS` | `max-desktop:@[960px]:[grid-column:3] max-desktop:@[960px]:[grid-row:var(--row)]` |
| `BELOW_CELL_CLASS` | `max-desktop:@[960px]:[grid-row-start:var(--row)]` |
| `OPEN_CELL_CLASS` | `max-desktop:@[720px]:col-span-full` |

Contenitore: 736 px a 768, 992 a 1024. Le tessere diverse da LA tessera perdono `tablet:col-span-2`: chiuse
occupano una colonna, aperte le allarga `OPEN_CELL_CLASS` (esce dopo `tablet:`).

- **768**: due colonne, flusso sparse; LA tessera su due, `PageRest` su tutta la riga (MOB-02); un'aperta è
  `grid-column: 1 / -1` e le chiuse ripartono sotto di lei.
- **1024**: LA tessera su due (`self-start`); nella terza `PageRest` (traccia 1) e le chiuse, una per traccia (`--row`
  2, 3, …). La traccia finale `1fr` prende l'altezza di LA tessera (chi attraversa una traccia flessibile dà spazio solo
  a lei, CSS Grid § 11.5) e le righe restano a 52 px. Un'aperta va sotto LA tessera a tutta larghezza e le chiuse dopo
  risalgono; oltre `MAX_BESIDE_ROWS` le chiuse vanno sotto su tre colonne. Chi sta sotto ha una riga ESPLICITA
  (`belowRow`): la cella `1fr` × colonna 3 è libera e l'auto-placement la riempirebbe per prima (§ 8.5, il cursore
  riparte dalla riga 1), con la settima chiusa della Panoramica stirata accanto al fondo di LA tessera.
- Verdetto breve, `freshness` (PERF-03), striscia e riga d'ambito stanno sopra la griglia; `LIFTED_FIGURE_CLASS`
  (`max-tablet:hidden`) ridà le cifre sollevate (The Lifted-Figure Rule).
- **Il Flusso di Analisi sceglie il disegno a 640 px, non a `desktop:`** (proprietario, 2026-09-27): sotto i 640 px una
  barra e le righe, da 640 il Sankey. È una soglia di leggibilità del GRAFICO (a 390 quattro colonne da ~80 px), come la
  tendina di `period-picker.tsx` e di `multi-select.tsx`, non una seconda composizione: a 768 e a 1024 `analisi-flusso`
  aperta va a tutta larghezza (`OPEN_CELL_CLASS`) e disegna il Sankey con le misure del desktop. `useCompactLayout` resta
  l'unico interruttore della COMPOSIZIONE.

### 4.2 La funzione pura e l'hook

```ts
// lib/utils/tabletComposition.ts
export const MAX_BESIDE_ROWS = 6;
export interface TabletLayout {
  besideRow: ReadonlyMap<string, number>; // id chiuso → traccia nella terza colonna (2…); 1 = PageRest
  belowRow: ReadonlyMap<string, number>;  // ogni altro id → riga sotto il blocco (da besideTracks + 2)
  fullWidth: ReadonlySet<string>;          // id aperti, comprese le letture fallite
  besideTracks: number;                    // = --beside; --lead-rows = besideTracks + 1
}
export function layoutTabletSections(a: { order: readonly string[]; open: ReadonlySet<string>; maxBeside?: number }): TabletLayout;
// lib/hooks/useTabletComposition.ts
export function useTabletComposition(a: { sections: MobileSections; order: readonly string[]; maxBeside?: number }): {
  gridStyle: CSSProperties | undefined; cellClass(id: string): string;
  cellStyle(id: string): CSSProperties | undefined; collapse(id: string): TileCollapse | undefined;
};
```

`order` = gli id `<pagina>-<slug>` in ordine mobile (gli stessi `SectionSpec` di `useMobileSections`); `open` da
`sections.collapse(id)?.open`; con `!sections.compact` l'hook è neutro (la griglia di oggi). `collapse(id)` avvolge quello
di MOB-02 per le righe in `besideRow`: aperta a 1024, la riga scende sotto LA tessera, spesso sotto la piega, e il
gestore chiama `sections.reveal(id)` (apre, scorre, fuoco sul trigger). Nessun nome di MOB-02 cambia; il `collapse(id)`
avvolto resta lo stesso oggetto finché non cambia quello di MOB-02 (memo per id, MOB-02 § 4.2).

### 4.3 La barra in alto (1024 landscape)

**Come si misura** (`tablet-landscape`, account senza demo): `page.evaluate` legge l'altezza del genitore di
`[data-sidebar="trigger"]` (la barra), il `top` di `#page-main` (uguale) e `main.clientHeight` (= 768 − barra: la prima
schermata); `nav[aria-label="Navigazione principale"]` non visibile, trigger ≥ 44×44. MOB-01 la registra (`mainTop`).
**Proposta**: `size-11` e `py-1` → 4 + 44 + 4 + 1 = **53 px** (A-notes: «circa 52»), prima schermata 719 → 715; il
misurato va in `doc/guide/e2e-emulatori.md` e a MOB-09. «Aggiungi» diventa `h-11 desktop:h-9` (solo l'altezza è di
questa spec: il suo `onSuccess` è di MOB-04 § 4.2).

### 4.4 Playwright

Due progetti dopo `mobile`, copiati da lui (`isMobile`, `hasTouch`, `STORAGE_STATE`, `dependencies: ['setup']`, lo
stesso `testIgnore`, `:191-200`) con `testMatch: /\.tablet\.spec\.ts/`: `tablet` 768×1024, `tablet-landscape` 1024×768.
`desktop` ignora `/\.(mobile|degraded|tablet)\.spec\.ts/`; `workers: 1` resta. Una spec gira nei due progetti e ramifica
su `page.viewportSize().width`. Pagine campione, account base, forma e mai importi: **Panoramica** (sette righe col
payload modellato di MOB-03 § 7: il seed base non ha Costi né Obiettivo; `e2e/overview.tablet.spec.ts`) e **Cashflow ›
Tracciamento** (tab, «+» e «Aggiungi», Movimenti; `e2e/cashflow.tablet.spec.ts`). Rendimenti no: il seed ha due snapshot.

### 4.5 Conflitti con PERF

- **PERF-02** (in develop dal 2026-09-29) ha portato la shell, barra compresa, fuori da `ProtectedRoute`
  (`app/dashboard/layout.tsx`): § 4.3 vale lì, rimisurata sulla build. Le colonne sono CSS, il posto accanto no (`compact` è
  `false` sul server): la griglia della pagina monta ancora dopo i dati, sul client (nell'HTML c'è solo lo skeleton generico,
  con le sue colonne CSS); se PERF-03 la rende al primo paint, un fotogramma senza righe accanto, da annotare.
- **PERF-04**: un'aperta va a tutta larghezza, nessun grafico pigro monta in una colonna da ~320 px. **PERF-14**: niente
  `layout` di Framer; si anima solo il pannello; `BottomNavigation` non si tocca. **PERF-12**: pura + hook senza stato.
  **PERF-03**: «Aggiornato alle…» sta nei 715 px. **`perf:serve`**: il censimento gira su :3200.

### 4.6 Domande al proprietario

1. Il trigger della barra a 44 px (barra da 49 a 53) o a 28?
2. A 768 e 1024 il tetto «≤ 5 cifre fuori dal verdetto» cade, perché le cifre sollevate tornano (A-notes ne conta 8 a
   768): il tetto diventa il misurato?
3. A 768, dopo un'aperta, mezzo posto vuoto accanto a una chiusa (l'ordine resta), o `dense` (niente buchi, ma lo schermo
   non segue più il Tab)?
4. A 1024, 6 righe accanto a LA tessera e le altre sotto, o tutte accanto?
5. Tre colonne e la pill su un 12,9" in verticale (1024×1366), e il salto dello skeleton (da 2 a 3 colonne): vanno bene?

## 5. File da toccare

- Nuovi: `lib/utils/tabletComposition.ts`, `lib/hooks/useTabletComposition.ts`, `__tests__/tabletComposition.test.ts`,
  `e2e/overview.tablet.spec.ts`, `e2e/cashflow.tablet.spec.ts`.
- Griglie: `app/dashboard/{page.tsx:351,assets/page.tsx:412,performance/page.tsx:753,history/page.tsx:424,allocation/page.tsx:460,hall-of-fame/page.tsx:427}`,
  `components/cashflow/{ExpenseTrackingTab.tsx:1025,BudgetTab.tsx:251,CostCentersTab.tsx:294,CostCenterDetail.tsx:374,ExpenseSplitTab.tsx:167,AnalisiTab.tsx:715}`,
  `components/dividends/DividendTrackingTab.tsx:650`, `components/pension/PensionOverview.tsx:262`,
  `components/fire-simulations/{FireCalculatorTab.tsx:170,CoastFireTab.tsx:110,WhatIfAnalysisTab.tsx:403,MonteCarloTab.tsx:372,GoalBasedInvestingTab.tsx:290}`.
- `app/dashboard/layout.tsx:37`, `components/cashflow/ExpenseTrackingTab.tsx:1017`, `playwright.config.ts`,
  `doc/mobile/budget.json`.

## 6. Passi

1. Branch; SESSION_NOTES.md; `mobile:census` PRIMA a 768 e 1024 (la build di `perf:build`, mirror); le domande di § 4.6.
2. `tabletComposition.ts` + test (rosso, poi verde); l'hook.
3. Panoramica e Tracciamento, le due spec e le falsificazioni; poi una griglia alla volta, con
   `mobile:census -- --surfaces=<pagina> --viewports=768,1024`.
4. Barra e «Aggiungi», misura di § 4.3. 5. `playwright.config.ts`; `npx playwright test --list --project=desktop` senza
   `.tablet.`. 6. Suite, `mobile:budget -- --tighten`, documentazione, commit proposto.

## 7. Test e falsificazione

- **`__tests__/tabletComposition.test.ts`**: tutte chiuse → `besideRow` 2…K+1 in ordine, `besideTracks` K+1; un'aperta
  → in `fullWidth` e in `belowRow`, le successive risalgono; oltre `maxBeside` → `belowRow` da `besideTracks + 2`; id
  ignoti scartati; guardia: ogni token con `@[` inizia con `max-desktop:`, niente `lg:` né `min-[`. Falsificare:
  off-by-one su `maxBeside`; un `max-desktop:` tolto → rosso.
- **`e2e/overview.tablet.spec.ts`**, **`e2e/cashflow.tablet.spec.ts`** (`tablet` e `tablet-landscape`): (1) 2 colonne a
  768, 3 a 1024; (2) LA tessera larga tutta la griglia a 768, due terzi a 1024, `bottom` ≤ `main.clientHeight`; (3) a
  1024 `PageRest` e le chiuse con `x` ≥ il bordo destro di LA tessera, a 12 ± 1 px l'una dall'altra, finite sopra il suo
  fondo, la settima della Panoramica sotto di esso e alta 52 px; (4) aprire una riga: larga come la griglia, sotto LA
  tessera (1024) o sotto la precedente (768), terza colonna contigua, trigger nel viewport; (5) prima chiusa sopra la pill (768) o il fondo di `main` (1024); (6) la barra di
  § 4.3 a 1024, assente con la pill a 768; (7) `setViewportSize` 1440×900 → 12 colonne, nessuna traccia nuova; 768 →
  1024×768 → tre colonne, aperte ancora aperte; (8) nessuno sforamento (guardia di `e2e/fire.mobile.spec.ts:62-80`);
  (9) Tracciamento: tab ≥ 44×44, «+» a 768, a 1024 «Aggiungi» ≥ 44 px e niente «+».
- Falsificare uno alla volta: senza `--beside` → (3); senza `BELOW_CELL_CLASS` → la settima di (3); `_1fr` → `_auto` →
  la distanza di (3) (se resta verde, si annota e `1fr` resta); senza `OPEN_CELL_CLASS` → (4); `size-7` → (6); `@[960px]`
  senza `max-desktop:` → (7).

## 8. Collaudo guidato

- **A**: suite `desktop` e `mobile` intere; sul mirror a 1440 Panoramica e Rendimenti uguali a prima (screenshot).
- **C**: § 7, e `mobile:budget` rosso con una falsificazione.
- **F** (mirror; un iPad vero se c'è, se no DevTools a 768×1024 e 1024×768): 1) Panoramica orizzontale, LA tessera
  intera e le righe accanto; 2) aprirne una: dove va, e se la pagina la segue; 3) ruotare, da tre a due colonne senza
  perdere le aperte; 4) il menu della barra col pollice; 5) «Aggiungi» in Tracciamento orizzontale. In più, fuori dai
  cinque: Analisi a 768 e a 1024, il Flusso aperto disegna il Sankey e si legge.
- **G**: `npm run mirror:remove`; `.mobile-census/` cancellata; nessun `.tmp-*`.

## 9. Rischi e rollback

- Un iPad vero in landscape perde anche la barra di Safari: la piega reale è più bassa del censimento.
- Un motore che distribuisse il `1fr` alle altre tracce allargherebbe le righe accanto: lo vede (3).
- `container-type`: un `fixed` discendente si ancorerebbe al wrapper; oggi nessuna tessera ne ha (`grep`; il badge di
  § 4.1 è fuori dalla griglia).
- **Rollback** per lettera: una griglia alla volta torna alle classi di oggi (l'hook neutro da solo lascia tre colonne
  senza posto accanto); barra e «Aggiungi» indipendenti.

## 10. Documentazione da aggiornare

CLAUDE.md «Latest», § Testing, § Known Issues (la barra). AGENTS.md § Tailwind Breakpoints and Responsive Layout
(«Tailwind 4 emette `@container` dopo `@media`: sotto `desktop:` ogni `@[…]` porta `max-desktop:`») e § Browser-Driven
E2E (`*.tablet.spec.ts`). `doc/guide/e2e-emulatori.md` (progetti, barra); `doc/guide/panoramica.md` e
`doc/guide/cashflow-tracciamento.md` § Composizione mobile; `Draft Release Temp.md` (una riga, senza dati privati);
`doc/mobile/README.md` § 3 e § stato. DESIGN.md no (MOB-09).

## 11. Prompt di implementazione

```text
Ciao, in questa sessione implementiamo doc/mobile/MOB-08-tablet-768-e-1024.md: 768 a due colonne con la sezione
aperta a tutta larghezza, 1024 landscape a tre con LA tessera su due e le righe chiuse nella terza
(lib/utils/tabletComposition.ts, lib/hooks/useTabletComposition.ts, su tutte le griglie composte da MOB-03..07); la
barra in alto misurata, trigger a 44 px; i progetti Playwright tablet e tablet-landscape con e2e/overview.tablet.spec.ts
e e2e/cashflow.tablet.spec.ts; il budget di MOB-01 vincolante a 768 e 1024.

Da fare TASSATIVAMENTE prima di ogni cosa:
- Leggi WORKFLOW.md, AGENTS.md (§ Tailwind Breakpoints and Responsive Layout, § Navigation, § Hierarchy, Density and
  Disclosure, § Accessibility, § Browser-Driven E2E), CLAUDE.md (§ Testing, § Known Issues)
- Leggi doc/guide/e2e-emulatori.md, doc/guide/panoramica.md, doc/guide/cashflow-tracciamento.md (e le guide che tocchi)
- Leggi COMMENTS.md e DEVELOPMENT_GUIDELINES.md e APPLICALI mentre scrivi codice
- Leggi doc/mobile/README.md, la spec MOB-08 per intero, MOB-01 § 4 e MOB-02 § 4 (le API: non rinominarne nessuna);
  DESIGN.md § 5 e § Navigation, e il capitolo mobile se MOB-09 l'ha scritto (MAI rigenerarlo); MOB-03..07, PERF-01,
  PERF-02 e PERF-14 devono essere chiuse
- Crea SESSION_NOTES.md; crea il branch dalla branch attiva PRIMA di editare

Regole: nessun commit senza il mio OK; un branch e un commit; rispondi in italiano; le cinque domande di § 4.6 chiedimele
con lo strumento interattivo prima di toccare le griglie.
Vincoli: mai lg: né min-[px]:; ogni classe @[…] sotto desktop: porta max-desktop:; DOM nell'ordine desktop; nessun
layout di Framer; cifre inventate e tonde negli esempi.
Chiusura: mobile:census prima e dopo a 768 e 1024; tsc, lint 0, Vitest in Europe/Rome; le spec di § 7 nei due progetti
con le falsificazioni viste rosse (dimmi cosa hai rotto), e le suite desktop e mobile intere; mobile:budget -- --tighten
verde; il giro di § 8 sul mirror, poi mirror:remove; la documentazione di § 10 in UN diff; proponi il commit.
```

## 12. Modello ed effort

**Claude Opus 5.5, effort high.** Lavoro meccanico ma esteso: diciannove griglie, due progetti e una misura. Le
trappole sono di CSS (l'ordine di emissione, le tracce flessibili), non di dominio.
