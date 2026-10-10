# MOB-08 — Tablet: 768 e 1024

> Stato: da fare · riletta in modo adversariale il 2026-10-10: 30 rilievi, 5 decisioni · Priorità: 3 (il telefono prima; qui si raddrizza il landscape) · Sforzo: M · Dipende da: MOB-02..07
> (e quindi MOB-01; PERF-01, PERF-02, PERF-14 ritirate, in develop) · Sblocca: MOB-09

## 1. Il problema, misurato

Censimento 2026-09-26 (`doc/mobile/README.md` § 3). **768×1024**: mediana 2,39 schermate, 3 tessere sopra la piega,
una intera. **1024×768**: mediana 3,11 (non «~3,5»), di norma una sopra la piega e nessuna intera (Allocazione 2/1,
Analisi 1/1): il landscape è il tablet peggiore. Righe del 2026-09-26, da riverificare:

- Griglie `grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-12` (The Tile Grid Rule; `app/dashboard/page.tsx:351`
  e § 5): due colonne anche a 1024. Le celle sono `TILE_CELL_CLASS = 'flex min-w-0 [&>section]:flex-1'`
  (`components/ui/tile.tsx:42`): si stirano sulla traccia; MOB-02 § 4.2 mette `max-desktop:self-start` sulle celle delle righe.
- La barra (`app/dashboard/layout.tsx:37`, `py-2.5` + `border-b`, solo `max-desktop:landscape`) porta `SidebarTrigger`
  a `size-7` (`components/ui/sidebar.tsx:275`): 10 + 28 + 10 + 1 = **49 px** (`main` 719, MOB-01). Il suo solo controllo,
  28×28 su un touch, apre il drawer (DESIGN.md § 6: «Don't ship a touch target under 44px in … the phone drawer»).
- Senza pill (`components/layout/BottomNavigation.tsx:73`, `max-desktop:landscape:hidden`) l'unico modo di aggiungere è
  «Aggiungi» (`components/cashflow/ExpenseTrackingTab.tsx`, `max-desktop:portrait:hidden h-9`, in un contenitore
  `desktop:hidden`: 36 px).
- **Tailwind 4.3.0 emette le container query DOPO le media query** (sonda `@tailwindcss/node`): `@[960px]:grid-cols-3`
  vince su `desktop:grid-cols-12` a 1440; `max-desktop:@[960px]:` = `@media (width < 1440px) { @container … }`. Una
  container query interna a una tessera senza un `desktop:` sulla stessa proprietà (`BaseDiCalcoloTile.tsx:81`,
  `ValoreStrumentoTile.tsx:154`) vale apposta anche a 1440.
- `playwright.config.ts` non ha progetti tablet; `desktop` ignora `/\.(mobile|degraded)\.spec\.ts/` e le fixture
  proprie (`:92`): un `*.tablet.spec.ts` girerebbe anche a 1440.
- Divisione tiene le tessere per persona dentro UNA cella (`ExpenseSplitTab.tsx:246`).

## 2. Obiettivo misurabile

- `npm run mobile:budget` verde su 19 superfici × 3 viewport sul fixture `census@example.com` (README § 9, 10), con 768 e
  1024 resi vincolanti (la lista `informational` di `budget.json` svuotata, MOB-01 § 4) e stretti con `-- --tighten`
  nello stesso commit; a 768/1024 la colonna «obiettivo» stampa il misurato, che fa da tetto (README § 9, 16).
- Su ogni superficie composta, a 768 e 1024: `firstClosedRowAbovePill: true` (a 1024 = fondo di `main`, MOB-01 § 4;
  Bilanciamento ed Evento con il loro `raisedBy`), `overflowX: false`, **`screens` a 1024 ≤ la baseline del 2026-09-26 a
  1024 (README § 3)** per ogni superficie (README § 9, 51: un tetto per superficie × viewport, letto da `mobile:budget`).
  Su Panoramica e Tracciamento, a 768 e a 1024, LA tessera finisce sopra la piega (test (2)): la curva a 120 px sotto
  `desktop:` (README § 9, 4) vale anche qui.
- La barra misurata come in § 4.3, trigger ≥ 44×44 (README § 9, 48). A 1440 le due pagine campione hanno 12 colonne e
  nessuna griglia di § 5 porta una classe `@[…]` fuori dalle costanti di `tabletComposition.ts` (guardia Vitest).

## 3. Non-obiettivi

- Telefono (MOB-02..07; sotto i 768, iPad mini verticale compreso, la composizione è quella del telefono), desktop,
  DESIGN.md (MOB-09), B e C; le griglie annidate (`*Dettaglio.tsx`, Impostazioni, Assistente) e le griglie di stato con una
  sola tessera (`PensionOverview` senza fondi, `GoalBasedInvestingTab` spento) restano su `tablet:`: `COMPACT_GRID_CLASS`
  va solo sulla griglia composta della pagina (quella con `PageRest`).
- `TileGridSkeleton` (`components/ui/tile-grid-skeleton.tsx:57`) resta a due colonne (README § 9, 50).
- Hall of Fame, Analisi, Centri, Divisione a tablet in Playwright: fixture proprie, escluse come oggi. La soglia dei 640
  del Flusso resta quindi coperta a 390 (`analisi.mobile.spec.ts`) e a 1440 (`analisi.spec.ts`), non fra i due: il Sankey
  a 768 e 1024 lo guarda il giro (§ 8).

## 4. Design

### 4.1 La griglia compatta (AGENTS § Tailwind Breakpoints and Responsive Layout)

Due colonne da `tablet:`; tre con una container query sotto `max-desktop:` (mai `lg:` né `min-[…]:`), su un `div`
NUOVO attorno alla griglia: non `PageContainer`, perché `container-type` ancora a sé i `fixed` e `SavingsRateBadge`
(`components/ui/SavingsRateBadge.tsx:114`) lo è, dentro di lui (`app/dashboard/page.tsx:556`). Costanti letterali in
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

Contenitore: 736 px a 768, 992 a 1024 (anche su un 12,9" in verticale, 1024×1366: tre colonne con la pill, README § 9,
50). Le tessere diverse da LA tessera perdono `tablet:col-span-2`: chiuse occupano una colonna, aperte le allarga
`OPEN_CELL_CLASS` (esce dopo `tablet:`).

- **768**: due colonne, flusso `sparse` (mai `dense`: sarebbe un riordino CSS, README § 9, 1 e 49); LA tessera su due,
  `PageRest` su tutta la riga (MOB-02); un'aperta è `grid-column: 1 / -1` e le chiuse ripartono sotto di lei; il mezzo
  posto vuoto accanto alla chiusa che la precede resta.
- **1024**: LA tessera su due (`self-start`); nella terza `PageRest` (traccia 1) e le chiuse, una per traccia (`--row`
  2, 3, …). **Una sequenza sola** (README § 9, 1 e 49): accanto a LA tessera stanno solo le chiuse che PRECEDONO la prima
  aperta nel DOM, al più `MAX_BESIDE_ROWS` = 6; dalla prima aperta in poi tutto va sotto LA tessera in ordine DOM:
  l'aperta a tutta larghezza, le chiuse che seguono raggruppate a tre per riga (colonne 1, 2, 3 per auto-placement nella
  riga), un'altra aperta chiude il gruppo e prende una riga sua, la chiusa dopo apre una riga nuova. Nessuna chiusa
  «risale» sopra un'aperta che la precede nel DOM. La traccia finale `1fr` prende l'altezza di LA tessera (chi
  attraversa una traccia flessibile dà spazio solo a lei, CSS Grid § 11.5) e le righe accanto restano alte quanto il
  trigger più il bordo (`max-desktop:self-start`, MOB-02). Chi sta sotto ha una riga ESPLICITA (`belowRow`): la cella
  `1fr` × colonna 3 è libera e l'auto-placement la riempirebbe per prima (§ 8.5, il cursore riparte dalla riga 1).
- Verdetto breve, striscia e riga d'ambito stanno sopra la griglia (la `freshness` è nel `PageHeader`, non qui); `LIFTED_FIGURE_CLASS`
  (`max-tablet:hidden`) ridà le cifre sollevate (The Lifted-Figure Rule); la curva di LA tessera resta a 120 px fino a 1439.
- **Divisione**: sotto `desktop:` il contenitore delle persone (`ExpenseSplitTab.tsx:246`) è `contents` (`contents
  desktop:grid desktop:grid-cols-… desktop:col-span-7`, come i wrapper di Storico e Rendimenti), così ogni
  `spl-persona-<memberId>` è una cella della griglia di pagina e prende `cellClass(id)` e `cellStyle(id)`.
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
  besideRow: ReadonlyMap<string, number>; // chiuse che precedono la prima aperta → traccia nella terza colonna (2…); 1 = PageRest
  belowRow: ReadonlyMap<string, number>;  // ogni altro id → riga sotto il blocco (da besideTracks + 2): le chiuse a tre per riga, un'aperta su una riga sua
  fullWidth: ReadonlySet<string>;          // id aperti, comprese le letture fallite
  besideTracks: number;                    // = --beside; --lead-rows = besideTracks + 1; senza chiuse accanto vale 1 (solo PageRest)
}
export function layoutTabletSections(a: { order: readonly string[]; open: ReadonlySet<string>; maxBeside?: number }): TabletLayout;
// lib/hooks/useTabletComposition.ts
export function useTabletComposition(a: { sections: MobileSections; order: readonly string[]; maxBeside?: number }): {
  gridStyle: CSSProperties | undefined; cellClass(id: string): string;
  cellStyle(id: string): CSSProperties | undefined; collapse(id: string): TileCollapse | undefined;
};
```

`order` = gli id `<pagina>-<slug>` nell'ordine del DOM (gli stessi `SectionSpec` di `useMobileSections`); `open` da
`sections.collapse(id)?.open`; con `!sections.compact` l'hook è neutro (la griglia di oggi). Si ricalcola a ogni render
da `order`: una riga nuova (la Scheda di Analisi con un focus, una `-mutuo-<loanId>` dopo la migrazione) prende il suo
posto e le successive slittano; una riga aperta di default va sotto LA tessera. **`collapse(id)` avvolge quello di MOB-02
solo dove la terza colonna esiste**: l'hook legge `useMediaQuery('(width >= 992px)')` (960 px del contenitore + i 2×16 px
di `p-4` di `main`, senza sidebar sotto `desktop:`) e solo allora, per le righe in `besideRow`, l'apertura chiama
`sections.reveal(id)` DOPO il commit che sposta la riga sotto LA tessera (`flushSync(() => inner.onOpenChange(true))`,
poi lo `scrollIntoView` e il focus di `reveal`); altrove (390, 768) restituisce il `collapse(id)` di MOB-02 invariato,
così il tap del telefono non cambia. Alla chiusura il fuoco resta sul trigger, che risale in colonna 3, e il gestore
chiama `scrollIntoView({ block: 'nearest' })` dopo il commit. Nessun nome di MOB-02 cambia; il `collapse(id)` avvolto
resta lo stesso oggetto finché non cambia quello di MOB-02 (memo per id col pattern di MOB-02 § 4.2; lo prova
`perf:census`, § 11). Il salto di posizione di una riga è istantaneo a ogni impostazione; il pannello segue
`motion-safe:` di MOB-02. Una riga in lettura fallita aperta a 1024 va sotto LA tessera come ogni aperta; l'errore nella
prima schermata lo dice il nodo live di `PageRest`, e chiusa dal lettore torna in colonna 3 con l'eyebrow rosso.

### 4.3 La barra in alto (1024 landscape)

**Come si misura** (`tablet-landscape`, account senza demo: in demo il banner fra la barra e `main` accorcia la prima
schermata e nessun criterio la vincola, una riga in doc/guide/account-condiviso-demo.md § Per-page blind spots):
`page.evaluate` legge l'altezza del genitore di `[data-sidebar="trigger"]` (la barra), il `top` di `#page-main` (uguale)
e `main.clientHeight` (= 768 − barra: la prima schermata); `nav[aria-label="Navigazione principale"]` non visibile,
trigger ≥ 44×44. MOB-01 la registra (`mainTop`). **Decisione** (README § 9, 48): `size-11` e `py-1` → 4 + 44 + 4 + 1 =
**53 px** (A-notes: «circa 52»), prima schermata 719 → 715; il misurato va in `doc/guide/shell.md` § Navigation,
`doc/guide/e2e-emulatori.md` e a MOB-09. La barra vale per ogni schermo in orizzontale sotto `desktop:`
(`max-desktop:landscape`): su un telefono in orizzontale `main` perde 4 px, annotato in shell.md, senza budget (non è una
delle tre viewport). «Aggiungi» diventa `h-11` (il suo contenitore è `desktop:hidden`: a 1440 non esiste; solo l'altezza
è di questa spec, il suo `onSuccess` è di MOB-04 § 4.2).

### 4.4 Playwright

Due progetti dopo `mobile`, copiati da lui (`isMobile`, `hasTouch`, `STORAGE_STATE`, `dependencies: ['setup']`, lo
stesso `testIgnore`, `:191-200`) con `testMatch: /\.tablet\.spec\.ts/`: `tablet` 768×1024, `tablet-landscape` 1024×768.
`desktop` ignora `/\.(mobile|degraded|tablet)\.spec\.ts/`; `workers: 1` resta. Una spec gira nei due progetti e ramifica
su `page.viewportSize().width`. Pagine campione, account base, forma e mai importi: **Panoramica** (`e2e/overview.tablet.spec.ts`:
la risposta di `/api/dashboard/overview` patchata come in MOB-03 § 7, con `flags.hasTERTracking: true` e nessun
obiettivo, quindi sette righe chiuse — sintesi, cashflow, composizione, costi, spese, entrate, asset — e con
`MAX_BESIDE_ROWS = 6` la settima, `panoramica-asset`, va sotto LA tessera) e **Cashflow › Tracciamento** (tab, «+» e
«Aggiungi», Movimenti; `e2e/cashflow.tablet.spec.ts`; il fixture ha 4 righe, non arriva al limite). Rendimenti no: il
seed ha due snapshot.

### 4.5 Conflitti con PERF

- **PERF-02** (in develop dal 2026-09-29) ha portato la shell, barra compresa, fuori da `ProtectedRoute`
  (`app/dashboard/layout.tsx`): § 4.3 vale lì, rimisurata sulla build. Le colonne sono CSS; il posto accanto dipende da
  `compact`, che è `false` solo sul server e durante l'idratazione: la pagina monta dopo l'idratazione (`ProtectedRoute`),
  quindi al primo render ha già `--beside` e le righe accanto. Nessun fotogramma senza righe accanto; l'unico salto è lo
  skeleton generico a due colonne (§ 3).
- **PERF-04**: un'aperta va a tutta larghezza, nessun grafico pigro monta in una colonna da ~320 px. **PERF-14** (in develop dal 2026-10-08): niente
  `layout` di Framer; si anima solo il pannello; `BottomNavigation` non si tocca. **PERF-12** (in develop dal 2026-10-06, AGENTS.md § Motion): pura + hook senza stato.
  **PERF-03** (in develop dal 2026-09-30): «Aggiornato alle…» sta nella riga dell'header (sotto `desktop:` al posto della
  descrizione, troncata a una riga), non nei 715 px della composizione. **`perf:serve`**: il censimento gira su :3200;
  `perf:budget` prima e dopo (diciannove griglie prendono `tabletComposition.ts`).

### 4.6 Decisioni (README § 9)

Tutte le domande di questa spec sono chiuse: il trigger a 44×44, barra 53 px (48); a 768/1024 l'obiettivo è il misurato
(16); flusso `sparse` (1, 49); al più 6 accanto, e solo le chiuse che precedono la prima aperta (49); tre colonne anche
su un 12,9" in verticale, skeleton a due (50); la curva a 120 px anche a 768/1024 (4); il criterio di 1024 contro la
baseline (51).

## 5. File da toccare

- Nuovi: `lib/utils/tabletComposition.ts`, `lib/hooks/useTabletComposition.ts`, `__tests__/tabletComposition.test.ts`,
  `e2e/overview.tablet.spec.ts`, `e2e/cashflow.tablet.spec.ts`.
- Griglie: `app/dashboard/{page.tsx,assets/page.tsx,performance/page.tsx,history/page.tsx,allocation/page.tsx,hall-of-fame/page.tsx}`,
  `components/cashflow/{ExpenseTrackingTab.tsx,BudgetTab.tsx,CostCentersTab.tsx,CostCenterDetail.tsx,ExpenseSplitTab.tsx,AnalisiTab.tsx}`,
  `components/dividends/DividendTrackingTab.tsx`, `components/pension/PensionOverview.tsx`,
  `components/fire-simulations/{FireCalculatorTab.tsx,CoastFireTab.tsx,WhatIfAnalysisTab.tsx,MonteCarloTab.tsx,GoalBasedInvestingTab.tsx}`
  (le righe citate sono del 2026-09-26: MOB-02..07 le hanno spostate).
- `app/dashboard/layout.tsx` (la barra), `components/ui/sidebar.tsx` (`size-11`), `components/cashflow/ExpenseTrackingTab.tsx`
  («Aggiungi» `h-11`), `playwright.config.ts`, `doc/mobile/budget.json` (`informational` svuotata).

## 6. Passi

1. Branch; SESSION_NOTES.md; `mobile:census` PRIMA a 768 e 1024 sul fixture `census@example.com` (la build di
   `perf:build` servita da `perf:serve`, :3200; il mirror serve solo al giro di § 8 F).
2. `tabletComposition.ts` + test (rosso, poi verde); l'hook.
3. Panoramica e Tracciamento, le due spec e le falsificazioni; poi una griglia alla volta, con
   `mobile:census -- --surfaces=<pagina> --viewports=768,1024` (da Git Bash: PowerShell 5.1 mangia il `--`).
4. Barra e «Aggiungi», misura di § 4.3. 5. `playwright.config.ts`; `npx playwright test --list --project=desktop` senza
   `.tablet.`. 6. Suite intera, `mobile:budget -- --tighten`, `perf:budget`, `perf:census`, documentazione, commit proposto.

## 7. Test e falsificazione

- **`__tests__/tabletComposition.test.ts`**: tutte chiuse → `besideRow` 2…K+1 in ordine, `besideTracks` K+1; `order`
  vuoto → `besideTracks` 1; un'aperta → in `fullWidth` e in `belowRow`, e TUTTE le successive sotto (nessuna in
  `besideRow`); 6 accanto + c7, c8, o9, c10 → c7 e c8 alla riga `besideTracks + 2`, o9 a `+ 3`, c10 a `+ 4`; oltre
  `maxBeside` → `belowRow` da `besideTracks + 2`; un id in più in `order` → le righe dopo slittano di una traccia; id
  ignoti scartati; guardia: ogni token con `@[` inizia con `max-desktop:`, niente `lg:` né `min-[`, e nessuno dei 19
  file di § 5 porta una classe `@[…]` fuori dalle costanti. Falsificare: off-by-one su `maxBeside`; una chiusa dopo
  l'aperta messa in `besideRow`; un `max-desktop:` tolto → rosso.
- **`e2e/overview.tablet.spec.ts`**, **`e2e/cashflow.tablet.spec.ts`** (`tablet` e `tablet-landscape`): (1) 2 colonne a
  768, 3 a 1024; (2) LA tessera larga quanto la griglia a 768 e (2·W − 12)/3 ± 1 px a 1024 (W la larghezza della griglia),
  `bottom` ≤ bordo alto della pill a 768 e ≤ `main.clientHeight` a 1024; (3) a 1024 `PageRest` e le chiuse con `x` ≥ il
  bordo destro di LA tessera, a 12 ± 1 px l'una dall'altra, con il trigger (`#<id>-trigger`) alto 52 ± 1 px e la `section`
  alta quanto il trigger più i 2 px di bordo, l'ultima finita sopra il fondo di LA tessera; la settima della Panoramica
  sotto il fondo di LA; (4) aprire una riga: larga come la griglia, sotto LA tessera (1024) o sotto la precedente (768),
  le chiuse che la seguono nel DOM sotto di lei (mai in colonna 3), trigger nel viewport dopo il commit; (5) prima
  chiusa sopra la pill (768) o il fondo di `main` (1024); (6) la barra di § 4.3 a 1024 (53 px, trigger 44×44), assente con
  la pill a 768; (7) `setViewportSize` 1440×900 → `gridTemplateColumns` di 12 tracce, nessuno style `--beside`/`--lead-rows`
  sulla griglia e `gridTemplateRows` uguale a quello letto sulla stessa pagina aperta direttamente a 1440×900 nello
  stesso test; 768 → 1024×768 → tre colonne, aperte ancora aperte; (8) nessuno sforamento (guardia di
  `e2e/fire.mobile.spec.ts:62-80`); (9) Tracciamento: tab ≥ 44×44, «+» a 768, a 1024 «Aggiungi» ≥ 44 px e niente «+».
- Falsificare uno alla volta: senza `--beside` → la distanza di (3) cresce (le tracce auto assorbono l'altezza di LA
  tessera); `_1fr` → `_auto` → idem; senza `BELOW_CELL_CLASS` → la settima di (3); una chiusa dopo l'aperta lasciata in
  colonna 3 → (4); senza `OPEN_CELL_CLASS` → (4); `size-7` → (6); `@[960px]` senza `max-desktop:` → (7); `reveal`
  prima del commit → (4) «trigger nel viewport».

## 8. Collaudo guidato

- **A**: `npm run test:e2e` intero (tutti i progetti, compresi `hof`, `hof-mobile`, `analisi`, `analisi-mobile`, `centri`,
  `centri-mobile`, `split`, `split-mobile`, `degraded`, `degraded-mobile` e i due tablet); sul mirror a 1440 Panoramica e
  Rendimenti uguali a prima (screenshot).
- **C**: § 7, e `mobile:budget` rosso con una falsificazione.
- **F** (mirror; DevTools a 768×1024 e 1024×768 sul portatile): 1) Panoramica orizzontale, LA tessera intera e le righe
  accanto; 2) aprirne una: dove va, e se la pagina la segue; 3) ruotare, da tre a due colonne senza perdere le aperte;
  4) il menu della barra col pollice; 5) «Aggiungi» in Tracciamento orizzontale. In più, fuori dai cinque: Analisi a 768
  e a 1024, il Flusso aperto disegna il Sankey e si legge.
- **G**: `npm run mirror:remove`; `.mobile-census/` e `.next-perf` cancellate; nessun `.tmp-*`.

## 9. Rischi e rollback

- Un iPad vero in landscape perde anche la barra di Safari: la piega reale è più bassa del censimento.
- Un motore che distribuisse il `1fr` alle altre tracce allargherebbe la distanza fra le righe accanto: lo vede (3).
- `container-type`: un `fixed` discendente si ancorerebbe al wrapper; oggi nessuna tessera ne ha (`grep`; il badge di
  § 4.1 è fuori dalla griglia).
- **Rollback** per lettera: una griglia alla volta torna alle classi di oggi (l'hook neutro da solo lascia tre colonne
  senza posto accanto); barra e «Aggiungi» indipendenti.

## 10. Documentazione da aggiornare

CLAUDE.md «Latest», § Current Status (i conteggi, i tre progetti) e § Testing. AGENTS.md § Tailwind Breakpoints and
Responsive Layout («Tailwind 4 emette `@container` DOPO `@media`: una container query su una proprietà che ha anche una
classe `desktop:` (colonne, span, righe della griglia) porta `max-desktop:`, o vince a 1440; una container query interna a
una tessera che vale a ogni larghezza (`@[760px]:table-cell`) no») e § Browser-Driven E2E (`*.tablet.spec.ts`).
`doc/guide/e2e-emulatori.md` (progetti, barra); `doc/guide/shell.md` § Navigation (la barra in orizzontale: `py-1`,
trigger `size-11`, 53 px misurati, prima schermata 715 a 1024×768; «Aggiungi» `h-11`; il telefono in orizzontale);
`doc/guide/account-condiviso-demo.md` § Per-page blind spots (il banner demo a 1024); in ogni guida la cui griglia questa
spec tocca (`doc/guide/{panoramica,patrimonio,rendimenti,storico,allocazione,hall-of-fame,cashflow-tracciamento,cashflow-budget,centri-di-costo,cashflow-divisione,cashflow-analisi,cashflow-dividendi,previdenza,fire,fire-coast,fire-what-if,fire-monte-carlo,fire-obiettivi}.md`)
la voce «768/1024» di § Composizione mobile: due colonne, l'aperta a tutta riga; a 1024 LA tessera su due e le righe
chiuse accanto (fino a `MAX_BESIDE_ROWS`, solo quelle prima della prima aperta), con le eccezioni della pagina; `Draft
Release Temp.md` (una riga per pagina, senza dati privati); `doc/mobile/README.md` § 3.1 (le colonne 768/1024 del
fixture) e § 6. DESIGN.md no (MOB-09).

## 11. Prompt di implementazione

```text
Ciao, in questa sessione implementiamo doc/mobile/MOB-08-tablet-768-e-1024.md: 768 a due colonne con la sezione
aperta a tutta larghezza, 1024 landscape a tre con LA tessera su due e le righe chiuse che precedono la prima aperta
nella terza, il resto sotto in ordine DOM (lib/utils/tabletComposition.ts, lib/hooks/useTabletComposition.ts, su
tutte le griglie composte da MOB-02..07); la barra in alto misurata, trigger a 44 px; i progetti Playwright tablet e
tablet-landscape con e2e/overview.tablet.spec.ts e e2e/cashflow.tablet.spec.ts; il budget di MOB-01 vincolante a 768
e 1024.

Da fare TASSATIVAMENTE prima di ogni cosa:
- Leggi WORKFLOW.md, AGENTS.md (§ Tailwind Breakpoints and Responsive Layout, § Navigation, § Hierarchy, Density and
  Disclosure, § Accessibility, § Browser-Driven E2E, § Performance tooling), CLAUDE.md (§ Testing, § Known Issues)
- Leggi doc/guide/e2e-emulatori.md, doc/guide/shell.md, doc/guide/panoramica.md, doc/guide/cashflow-tracciamento.md
  (e le guide che tocchi)
- Leggi COMMENTS.md e DEVELOPMENT_GUIDELINES.md e APPLICALI mentre scrivi codice
- Leggi doc/mobile/README.md (§ 9: le decisioni 1–51), la spec MOB-08 per intero, MOB-01 § 4 e MOB-02 § 4 (le API:
  non rinominarne nessuna) e le guide § Composizione mobile scritte da MOB-02..07, che sono chiuse (README § 6);
  DESIGN.md § 5 e § Navigation (MAI rigenerarlo; il capitolo mobile lo scrive MOB-09, dopo questa spec); PERF-01,
  PERF-02 e PERF-14 sono in develop e ritirate
- Crea SESSION_NOTES.md; crea il branch dalla branch attiva PRIMA di editare

Regole: nessun commit senza il mio OK; un branch e un commit; rispondi in italiano; nessuna domanda è aperta (README
§ 9): una scelta nuova che il codice ti impone me la chiedi con lo strumento interattivo prima di toccare le griglie.
Vincoli: mai lg: né min-[px]:; ogni classe @[…] di tabletComposition.ts porta max-desktop:; una sequenza sola: l'ordine
del DOM è l'ordine di lettura a 390, 768, 1024 e 1440, nessun order-* e nessun posizionamento che metta una riga sopra
una che la precede nel DOM; nessun layout di Framer; cifre inventate e tonde negli esempi.
Chiusura: mobile:census prima e dopo a 768 e 1024 sul fixture (da Git Bash); tsc, lint 0, Vitest in Europe/Rome e sotto
TZ=UTC; le spec di § 7 nei due progetti con le falsificazioni viste rosse (dimmi cosa hai rotto), e npm run test:e2e
intero; mobile:budget -- --tighten verde con informational svuotata; npm run perf:build e perf:budget -- --dist=.next-perf
prima e dopo; npm run perf:census -- --mobile --scenario=hall-of-fame uguale a prima (aprire una riga ri-renderizza
quella sezione e PageRest, non le altre; falsificare creando il wrapper a ogni render → più tessere nel census); il giro
di § 8 sul mirror, poi mirror:remove; la documentazione di § 10 in UN diff; proponi il commit.
```

## 12. Modello ed effort

**Claude Opus 5.5, effort high.** Lavoro meccanico ma esteso: diciannove griglie, due progetti e una misura. Le
trappole sono di CSS (l'ordine di emissione, le tracce flessibili), non di dominio.
