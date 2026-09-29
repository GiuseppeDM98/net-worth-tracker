# PERF-14 — Motion e colori senza lavoro al mount: niente `layout` sulle pagine, i colori dei grafici letti una volta

> Stato: da fare · Priorità: 3 · Sforzo: S/M · Dipende da: PERF-12 (il compiler; il census in `scripts/`) · Sblocca: —

## 1. Il problema, misurato

Lavoro di rendering che ogni pagina paga e nessuno guarda (audit 2026-09-26, verificato a riga):

- **`motion.div layout="position"` intorno all'INTERA pagina** in `app/dashboard/page.tsx:335` e `app/dashboard/assets/page.tsx:385`
  (header, griglia, modal, badge). Framer misura il wrapper prima e dopo OGNI commit della pagina: il toggle della
  sparkline, l'apertura del confirm, `creatingSnapshot`, il timer del `SavingsRateBadge`, il `setState` da rAF di
  `useChartColors`, ogni refetch di React Query. Nessuno di questi commit muove il wrapper: la misura è pura tassa
  (`getBoundingClientRect` forza il layout sincrono). È questa spec, sola, a toglierlo (PERF-11 non lo tocca).
- **`BottomNavigation` montata anche sul desktop** (nascosta con `desktop:hidden`, `:73`, e in landscape sotto 1440,
  `max-desktop:landscape:hidden`: «Bottom nav is portrait-only», AGENTS.md § Navigation) con `motion.nav layout` (`:78-79`,
  il cui commento dice a cosa serve: «layout-animates its position when the '+' FAB appears») e un `layoutId` pill: una
  misura di layout a ogni cambio pathname, invisibile dove è nascosta.
- **`useChartColors` per istanza**: ogni host fa un rAF + `getComputedStyle(documentElement)` + 9 `getPropertyValue` +
  `setState` (`lib/hooks/useChartColors.ts`), quindi renderizza DUE volte; sulla Panoramica l'istanza è a livello di pagina
  (`app/dashboard/page.tsx:118`) e la seconda render tocca il `layout="position"` sopra; Patrimonio ne ha 1 + N (PERF-11);
  FIRE fino a 12 sparse per tab e tessera; `useActionColors` fa lo stesso per tessera. I valori sono gli STESSI per tutta
  la pagina finché non cambiano `colorTheme` o `resolvedTheme`. E il filtro di luminanza dentro (`parseOklchL`) è INERTE:
  il browser risponde `lab(…)`, non `oklch(…)` (doc/guide/temi.md; AGENTS.md § Layout and Color Tokens: «Anything that READS
  a colour token parses `lab()` too», `lib/utils/actionColor.ts` è l'esempio).
- **`useCssColorTokens`** (dal 2026-09-27, #400): un terzo lettore per istanza con lo stesso schema (rAF +
  `getComputedStyle` + `setState`), per i cinque alias `--role-*` del Flusso convertiti in hex per Nivo. Ha un argomento
  `enabled` e gira solo quando il Sankey dei ruoli si disegna; ma quando gira, `FlussoTile` renderizza due volte come ogni
  host di `useChartColors`. E con lui un convertitore in più, non un parser: `lib/utils/cssColorToHex.ts` (`colorToHex`: hex e
  `rgb()` con due regex sue, `oklch()` e `lab()` attraverso `parseToOklch` di `actionColor.ts` — l'UNICO parser di `lab()`
  del repo — poi l'ultima gamba OKLCH → sRGB); l'altro lettore di colori resta `parseOklchL` di `useChartColors`, inerte.
- Lo stagger della Panoramica: `staggerContainer` (`delayChildren 0.05`, `staggerChildren 0.08`) × 8 tessere + `cardItem`
  0,4 s → l'ultima tessera è opaca ~1 s dopo i dati; sul hard load si somma il fade di `template.tsx` (0,35 s). È
  un'estetica (DESIGN.md), non un bug: la spec la MISURA e la lascia decidere al proprietario.

Il post: −90% re-render della sidebar; `:root:has()` da 24 ms per mutazione (qui non c'è: verificato, nessun `:has` globale);
«il renderer tocca solo ciò che cambia».

## 2. Obiettivo misurabile

- Zero `layout`/`layout="position"` su wrapper di pagina; le tessere che oggi «scivolano» al cambio di stato (se esistono)
  prendono il `layout` sull'elemento che si muove, non sul padre. `layout-shift` = 0 sul cambio periodo della sparkline,
  come oggi.
- `BottomNavigation`: resta montata e nascosta da CSS (è nella shell SSR dal 2026-09-28, `app/dashboard/layout.tsx`: smontarla con una media query JS
  creerebbe un mismatch di idratazione e la toglierebbe dal primo frame del telefono); ma il `layout` sul `motion.nav` e il
  `layoutId` della pill sono attivi SOLO quando è visibile — `const isPortraitBelowDesktop = useMediaQuery('(max-width: 1439px)
  and (orientation: portrait)')` (SSR-safe dal 2026-09-28, `lib/hooks/useMediaQuery.ts`: `false` sul server = nessuna animazione di layout nel primo frame,
  che è giusto) gating `layout={isPortraitBelowDesktop}`. Misura: CDP `LayoutCount` a un cambio pathname a 1440 prima/dopo.
- Un solo `getComputedStyle` per pagina per tema: `ChartColorsProvider` (contesto) calcola la palette al mount e a ogni
  cambio di `colorTheme`/`resolvedTheme`; `useChartColors()` e `useActionColors()` leggono il contesto (stessa firma, stesso
  valore, nessun rAF per host), con un fallback al calcolo locale quando il provider manca (la landing, i test). Il filtro
  di luminanza legge la L di `lab()` con il parser di `lib/utils/actionColor.ts` (mai `/^oklch\(/`). Misura: CDP
  `RecalcStyleCount`/`LayoutCount` al mount di Storico e FIRE prima/dopo; e i render per host (census di PERF-12) da 2 a 1.
- Benchmark cold Panoramica/Patrimonio/FIRE: long task ≤ prima; `cls` = 0 come oggi.
- Lo stagger: una tabella «tempo al 100% di opacità dell'ultima tessera» prima; se il proprietario sceglie di accorciarlo,
  dopo — in DESIGN.md la scelta è sua (mai rigenerare il file).

## 3. Non-obiettivi

- Non si sostituisce `motion` con `LazyMotion`/`m` (PERF-04 § 3 spiega).
- Non si toccano `useCountUp`, `useMorphingSeries` (isolati in foglie: già buono, vedi l'audit rendering in README § 2).
- Nessun cambio di estetica senza la decisione del proprietario (lo stagger).
- Non si smonta `BottomNavigation` (è nell'HTML prerenderizzato dal 2026-09-28, `app/dashboard/layout.tsx`).

## 4. Design

**A. Via il `layout` dalle pagine.** Leggere PERCHÉ c'è (`git log -S 'layout="position"'` sui due file): se serviva a far
scorrere il layout quando il confirm si apre o il badge appare, quei due elementi sono `position: fixed`/`portal` e non
muovono nulla; se serviva al cambio di periodo della sparkline (la tessera cambia altezza?), il `layout="position"` va sulla
tessera Patrimonio soltanto. Rimuovere e guardare (spec Playwright che registra `layout-shift` sul cambio periodo: 0 prima,
0 dopo).

**B. `BottomNavigation`: il `layout` solo dove si vede.** `layout={isPortraitBelowDesktop}` sul `motion.nav` (il FAB che
appare la fa scorrere: resta, in portrait) e `layoutId` della pill solo quando visibile (un `layoutId` su un elemento
`display:none` misura comunque). `AddExpenseFab` con `useSearchParams` resta dentro `<Suspense>` (AGENTS.md § Navigation).

**C. `ChartColorsProvider`.** In `app/dashboard/layout.tsx` (sotto `ColorThemeProvider`, che vive nel root): `useEffect` su
`[colorTheme, resolvedTheme]` → un rAF → `getComputedStyle` una volta → `setPalette`; il contesto espone `chartColors:
string[]` e `actionColors`. `useChartColors()` e `useActionColors()` leggono il contesto: firma invariata, i 30+ chiamanti non
cambiano; senza provider (`useContext` → `null`) cadono sul calcolo locale di oggi, così la landing (`app/page.tsx` usa i
tile della Panoramica) e i test di componente non si rompono. La regola di timing di doc/guide/temi.md («`useEffect +
useState + requestAnimationFrame`, NOT `useMemo`») resta vera: è il provider a farlo, una volta. Il filtro di luminanza
diventa VIVO: `parseToOklch` (oggi in `lib/utils/actionColor.ts`, già l'unico parser di `lab()` e `oklch()`,
importato da `cssColorToHex.ts`) si sposta in `lib/utils/colorParse.ts` insieme alla gamba OKLCH → sRGB di
`cssColorToHex.ts`, e prende il posto di `parseOklchL`; `__tests__/cssColorToHex.test.ts` e `actionColorContrast.test.ts`
restano verdi senza modifiche. Un token servito in `#rrggbb` (Lightning CSS riporta in hex i colori dentro sRGB)
`parseToOklch` non lo legge: il filtro lo converte hex → OKLCH o lo dichiara fuori filtro, mai in silenzio. Anche `useCssColorTokens(tokens, fallbacks, enabled)` legge il contesto: il provider espone i cinque
`--role-*` GIÀ in hex (`roleColorsHex`), perché Nivo su react-spring non interpola né `oklch()` né `lab()`; firma
invariata, fallback locale senza provider, e `enabled: false` continua a non leggere nulla. Le soglie (`> 0.82` in chiaro, `< 0.30` in scuro) restano sulla L di OKLCH (0–1, quella che `parseToOklch` restituisce) e vanno
misurate sui dodici blocchi tema con `chartPaletteDistinctness` — se un blocco cambia palette per il filtro ora vivo, è una
decisione da mostrare al proprietario, non da prendere.

**D. Lo stagger, misurato e proposto.** Tabella in SESSION_NOTES: tempo dati→ultima tessera opaca (oggi ~1,0 s) e, con
`staggerChildren 0.04` + `cardItem 0.25 s`, ~0,5 s. Domanda al proprietario (strumento interattivo): tenere / accorciare /
solo prima visita. La risposta va in DESIGN.md per mano sua o con una riga concordata.

## 5. File da toccare

- `app/dashboard/page.tsx`, `app/dashboard/assets/page.tsx` — il wrapper.
- `components/layout/BottomNavigation.tsx` — `layout` e `layoutId` gated.
- `contexts/ChartColorsContext.tsx` (nuovo), `lib/hooks/useChartColors.ts`, `lib/hooks/useActionColors.ts`,
  `lib/hooks/useCssColorTokens.ts`, `lib/utils/colorParse.ts` (nuovo: `parseToOklch` da `actionColor.ts` e
  la gamba OKLCH → sRGB da `cssColorToHex.ts`; i due moduli lo importano), `app/dashboard/layout.tsx`.
- `lib/utils/motionVariants.ts` — solo se D è approvata.
- Test: `__tests__/chartColorsContext.test.ts` (la palette dal provider = quella del vecchio hook su un `getComputedStyle`
  finto che risponde `lab(…)`; il fallback senza provider; il filtro vivo su una L fuori soglia), `e2e/motion.layout.spec.ts`
  (1440: `layout-shift` 0 sul cambio periodo della Panoramica; `LayoutCount` a un cambio pathname) e
  `e2e/motion.layout.mobile.spec.ts` (390 portrait: la bottom nav visibile, il FAB la fa scorrere), `chartPaletteDistinctness`
  e `actionColorContrast` (restano verdi).

## 6. Passi

1. Metriche CDP al mount (Storico, FIRE, Panoramica) e a un cambio pathname a 1440 prima; render per host (census) prima;
   `git log -S` dei due `layout`.
2. A + spec `layout-shift`; B + la spec mobile; benchmark.
3. C con il fallback e il filtro vivo; i test; tutte le pagine con grafici a vista (390 e 1440, due temi) — è un cambio di
   30 chiamanti a firma invariata: la prova è visiva E `chartPaletteDistinctness`/`actionColorContrast` verdi.
4. D: misura e domanda.
5. Metriche dopo; E2E completo.

## 7. Test e falsificazione

- `layout-shift` = 0 sul cambio periodo della sparkline (anchor positivo: la spec prima misura uno shift indotto — un
  `style.height` cambiato via `evaluate` — e vede l'observer contarlo).
- Provider: con `getComputedStyle` finto che risponde `lab(64.8793% 25.0679 78.4211)` per `--chart-3` la palette contiene
  quella stringa (mai `/^oklch\(/`, la trappola documentata); una L fuori soglia cade sul colore statico (falsificare:
  rimettere `parseOklchL` → il filtro non scatta, rosso); senza provider il hook restituisce la stessa palette del calcolo locale.
- Il Flusso per ruolo: con i ruoli accesi `FlussoTile` non chiama `getComputedStyle` al mount (spy) e renderizza una volta
  (census di PERF-12); i cinque hex del Sankey sono quelli di `colorToHex` (`cssColorToHex.ts`) sugli stessi token (identità sul fixture).
- Bottom nav: a 1440 `LayoutCount` a un cambio pathname non cresce per la nav (misura CDP prima/dopo, con il `layout` gated);
  a 390 portrait il FAB che appare la fa scorrere (anchor: la posizione cambia). Falsificare invertendo la media query.
- Suite: `chartPaletteDistinctness`, `actionColorContrast`, E2E completo (ogni grafico legge i colori).

## 8. Collaudo guidato

- A: E2E completo. C: le tre falsificazioni.
- F (mirror, 390 e 1440, con due temi): 1) Panoramica: i colori della composizione uguali a prima nei due temi; 2) Storico e
  FIRE: i grafici colorati subito, senza il frame «palette di default»; 3) cambiare tema dal picker: i grafici seguono;
  4) telefono in portrait: la bottom nav c'è e il FAB apre la spesa; in landscape e su desktop no; 5) lo stagger secondo la
  decisione. Non coperto: la fluidità sul telefono vero (il benchmark `--mobile` con CPU 4× la approssima).
- G: `npm run mirror:remove`.

## 9. Rischi e rollback

- Il frame «palette di default»: con il provider il primo render dei grafici ha ancora la palette statica finché il rAF non
  passa — UNA volta per pagina invece di una per host; identico a oggi.
- Il filtro di luminanza reso vivo può cambiare una palette che oggi passa senza filtro: la misura sui dodici blocchi lo
  mostra prima, e la decisione è del proprietario.
- Il fallback senza provider evita rotture sulla landing e nei test di componente.
- Rollback per lettera.

## 10. Documentazione da aggiornare

- CLAUDE.md «Latest»; AGENTS.md § Motion (niente `layout` sui wrapper di pagina; il `layout` della bottom nav gated) e
  § Recharts (`useChartColors` legge il provider); doc/guide/temi.md (il provider, il timing, il fallback, il filtro su `lab()`
  ora vivo); DESIGN.md SOLO per mano del proprietario se D cambia; `Draft Release Temp.md`; doc/perf/README.md.

## 11. Prompt di implementazione

```text
Ciao, in questa sessione implementiamo doc/perf/PERF-14-motion-e-colori-senza-lavoro-al-mount.md: via il
motion.div layout="position" dai wrapper di pagina (Panoramica, Patrimonio) dopo aver letto nel git log perché c'era;
BottomNavigation resta montata (è nella shell SSR) ma il suo layout e il layoutId della pill sono attivi solo in portrait
sotto 1440 (media query con orientation, SSR-safe); un ChartColorsProvider nel layout dashboard che legge i token una
volta per tema, con useChartColors/useActionColors a firma invariata, un fallback senza provider e il filtro di luminanza
reso vivo su lab() (oggi è inerte); lo stagger della Panoramica misurato e PROPOSTO a me con lo strumento interattivo,
non cambiato di tua iniziativa.

Da fare TASSATIVAMENTE prima di ogni cosa:
- Leggi WORKFLOW.md, AGENTS.md (§ Motion, § Recharts, § Navigation, § Layout and Color Tokens: il lab() e il parser), CLAUDE.md
- Leggi doc/guide/temi.md PER INTERO, DESIGN.md (le regole citate per nome; MAI rigenerarlo), doc/guide/panoramica.md,
  doc/guide/patrimonio.md, doc/guide/e2e-emulatori.md
- Leggi COMMENTS.md e DEVELOPMENT_GUIDELINES.md e APPLICALE mentre scrivi codice
- Leggi doc/perf/README.md e la spec PERF-14 per intero; PERF-12 deve essere chiusa (la media query SSR-safe c'è già: `lib/hooks/useMediaQuery.ts`, 2026-09-28)
- Crea SESSION_NOTES.md; crea il branch dalla branch attiva PRIMA di editare

Regole: nessun commit senza il mio OK; un branch e un commit; rispondi in italiano.
Metodo: metriche CDP (LayoutCount, RecalcStyleCount, ScriptDuration) al mount di Storico, FIRE e Panoramica e a un cambio
pathname a 1440, prima/dopo; render per host con il census prima/dopo; le tre falsificazioni di § 7 viste ROSSE;
chartPaletteDistinctness e actionColorContrast verdi; se il filtro reso vivo cambia una palette, fermati e mostramelo.
Chiusura: tsc, lint 0, Vitest in Europe/Rome, npm run test:e2e COMPLETO; giro guidato di 5 punti sul mirror a 390 e 1440
con due temi, poi mirror:remove; CLAUDE.md «Latest», AGENTS.md § Motion e § Recharts, doc/guide/temi.md, Draft Release
Temp.md (senza dati privati), doc/perf/README.md; proponi il commit.
```

## 12. Modello ed effort

**Claude Opus 5.5, effort high.** Refactor a firma invariata con regole scritte (il `lab()`, il timing, la bottom nav
portrait-only, la shell SSR); la parte di giudizio (lo stagger, una palette che cambia) è del proprietario, non del modello.
