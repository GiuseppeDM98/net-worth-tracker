# Session Notes

---

## 2026-05-27 — Dashboard shell audit & fix (layout.tsx, template.tsx, globals.css)

### Cosa
Audit tecnico e fix del dashboard shell su 4 assi:

1. **`bg-background` su `<main>`** — sostituito `bg-gray-50 dark:bg-gray-950` con il token CSS `bg-background`. Rimosso anche il ridondante `desktop:pb-6` (già coperto da `desktop:p-6`).

2. **Breakpoint `desktop:p-6`** — rinominato `md:p-6` (768px) in `desktop:p-6` (1440px) per allineamento alle convenzioni di progetto.

3. **Token `--warning`** — introdotti `--warning`, `--warning-foreground`, `--warning-border` in tutti i 12 blocchi CSS di `globals.css` (`:root`, `.dark`, e i 5 temi custom × 2 modalità light/dark). Registrati in `@theme inline` come `--color-warning*` per esporli come utility Tailwind (`bg-warning`, `text-warning-foreground`, `border-warning-border`). Il banner demo ora usa questi token al posto delle 6 classi amber hardcoded.

4. **`useReducedMotion` in template.tsx** — il `style` inline (`opacity: 0; transform: translateY(4px)`) viene omesso quando `prefers-reduced-motion: reduce` è attivo, evitando un flash di 1 frame per gli utenti che hanno disabilitato le animazioni.

### Perché

- **`bg-gray-50 dark:bg-gray-950`** ignorava completamente il sistema CSS-var dei 6 temi: il content area rimaneva grigio neutro anche su temi con background tinti (solar-dusk ambra, retro-arcade verde-giallo, ecc.). Con `bg-background` il colore si adatta automaticamente.

- **`md:p-6`** scattava a 768px, coprendo tablet e landscape mobile in modo inconsistente con il resto dell'app (che usa uniformemente `desktop:` a 1440px). I tablet tra 768–1439px ricevevano `p-6` anziché `p-4`.

- **Token amber hardcoded** — il banner demo usava 6 classi Tailwind palette (`border-amber-200`, `bg-amber-50`, `text-amber-800`, `dark:border-amber-800/60`, `dark:bg-amber-950/40`, `dark:text-amber-300`) fuori dal sistema di token, rendendo il componente non-aware dei temi. Secondariamente, le due span usavano shade inconsistenti tra loro (`text-amber-700`/`dark:text-amber-400` vs `text-amber-800`/`dark:text-amber-300` del padre).

- **`style` pre-hydration** — con `MotionConfig reducedMotion="user"` in layout.tsx, Framer Motion salta le durations ma non può annullare il `style` inline applicato dal browser prima del paint. Per utenti reduced-motion, il contenuto partiva invisibile per ~1 frame senza alcun payoff animativo.

### Nota

- **Valore dei `--warning` token oltre il banner demo**: con `--color-warning*` in `@theme inline`, le utility `bg-warning`, `text-warning-foreground`, `border-warning-border` sono ora disponibili globalmente per toast, alert, stati di validazione — senza introdurre nuova dipendenza da classi hardcoded.

- **Amber uniforme tra temi**: i valori oklch di `--warning` sono identici per tutti i temi (light: `oklch(0.986 0.022 90)` / dark: `oklch(0.260 0.038 78)`). L'amber semantico per "cautela" non varia per tema — è una scelta intenzionale, non una mancanza.

- **`desktop:pb-6` era ridondante**: nella stringa originale `p-4 md:p-6 desktop:pb-6`, il `desktop:pb-6` non aggiungeva nulla perché `md:p-6` aveva già impostato `pb-6` a 768px+. Dopo il fix `p-4 desktop:p-6`, la classe è stata rimossa per evitare confusione.

- **`useReducedMotion` è un hook Framer Motion, non React**: si importa da `framer-motion`, non da `react`. Il valore è `true | false | null` — `null` durante SSR (no window). La condizione `!prefersReducedMotion` applica correttamente il `style` durante SSR (null è falsy → `style` presente → coerente col comportamento pre-fix).

- **File toccati**: `app/dashboard/layout.tsx`, `app/dashboard/template.tsx`, `app/globals.css`.

---

## 2026-05-27 — Sidebar desktop audit & fix (Sidebar.tsx, sidebar.tsx, globals.css)

### Cosa

Audit tecnico (`/impeccable audit`) e fix della sidebar desktop su 5 assi:

1. **`aria-current="page"` sull'link attivo** — `components/layout/Sidebar.tsx`. Il `<Link>` della voce attiva ora riceve `aria-current={isActive ? 'page' : undefined}`. L'animated pill e `data-[active=true]` erano puramente visuali; i screen reader non ricevevano alcuna informazione sulla pagina corrente.

2. **Landmark `role="navigation"` sulla sidebar** — `<SidebarContent>` riceve `role="navigation" aria-label="Navigazione principale"`. Il primitivo shadcn è un `<div>` che accetta `...props` spread — nessun wrapper DOM aggiuntivo, nessun impatto sul layout flex.

3. **Separatore visivo tra Primary e Statistiche** — `<div className="mx-3 border-t border-sidebar-border" />` tra il gruppo primary (Panoramica/Patrimonio/Cashflow) e il gruppo Statistiche. Usa `--sidebar-border` token, corretto su tutti e 6 i temi.

4. **Token email footer: `text-muted-foreground` → `text-sidebar-foreground/50`** — l'email nel footer sidebar usava un token calibrato per `--background`, non per `--sidebar`. Su temi con sidebar divergente dal background (solar-dusk dark, retro-arcade dark) il contrasto era imprevedibile.

5. **Active item `font-medium` → `font-semibold`** — `components/ui/sidebar.tsx` CVA. Il peso `medium` era quasi impercettibile a `text-sm`; `semibold` aggiunge segnale tipografico reale alla voce corrente.

6. **Contrasto `--sidebar-accent` in 3 combinazioni tema/modalità** — `app/globals.css`:
   - **retro-arcade light**: `--sidebar-accent-foreground` da bianco a `oklch(0.14 0.05 187.4)` (teal scuro) — bianco su L=0.64 teal raggiungeva ~3.3:1, sotto la soglia WCAG AA di 4.5:1.
   - **retro-arcade dark**: `--sidebar-accent` da `oklch(0.6437 ...)` a `oklch(0.50 0.14 187.38)` — stesso problema, corretto scurendo l'accent mantenendo alta la saturazione per l'estetica "neon".
   - **solar-dusk light**: `--sidebar-accent` da `oklch(0.5538 ...)` a `oklch(0.46 0.13 66.44)` — il valore originale era ~4.8:1, tecnicamente passante ma troppo vicino al limite per sicurezza; portato a ~7.1:1.

### Perché

- **ARIA lacune (P1)**: senza `aria-current` e senza landmark nav, un utente VoiceOver non può navigare per landmarks (rotor) né sapere quale pagina è corrente. Sono violazioni WCAG 1.3.1 e 2.4.4.

- **`text-muted-foreground` in contesto sidebar**: il token è definito rispetto a `--background`. La sidebar in diversi temi usa una superficie completamente diversa (`--sidebar` può essere teal, ambra scuro, lavanda) — usare `muted-foreground` lì è un token di contesto sbagliato e produce contrasto non predicibile.

- **Separatore tra gruppi**: l'assenza di separatore rendeva opaca la distinzione tra "core nav" (3 voci primarie) e le sezioni analitiche/decisionali. La gerarchia visiva era affidata solo allo spacing, insufficiente per comunicare la differenza semantica.

- **Contrasto accent**: la palette "retro-arcade" usa teal medio-chiaro come accent (L≈0.64), che era presente in entrambe le modalità light e dark con foreground bianco — un valore che non raggiunge il 4.5:1 richiesto da WCAG AA per testo normale (14px). Stesso pattern in solar-dusk con amber.

### Nota

- **`SidebarContent` come punto di iniezione landmark**: il primitivo shadcn `SidebarContent` è un `<div>` con `...props` spread (riga 375 di `sidebar.tsx`). Passare `role` e `aria-label` direttamente a quel componente evita di modificare il primitivo e di aggiungere un wrapper `<nav>` che interferirebbe con il `flex-col` del layout. Questo pattern è preferibile ogni volta che un primitivo shadcn ha `...props` spread sul root element.

- **`aria-current` e `asChild`**: con il pattern `SidebarMenuButton asChild` + `<Link>` figlio, Framer Motion non è coinvolto nel rendering dell'elemento — `aria-current` viene passato direttamente al `<Link>` di Next.js che lo renderizza sull'`<a>` finale. Non serve nessuna prop personalizzata sul primitivo.

- **retro-arcade: cambio foreground in light, cambio accent in dark**: la strategia per i due modi è volutamente asimmetrica. In light mode, usare testo scuro su un accent teal medio è naturale (dark-on-color è il pattern classico per light mode). In dark mode, usare testo bianco su un accent più scuro preserva l'estetica "neon" del tema (light-on-dark) pur passando il contrasto.

- **solar-dusk dark invariato**: il controllo ha confermato che `oklch(0.6847)` accent con foreground `oklch(0.2839)` raggiunge ~5.1:1 (WCAG AA ✓) — nessuna modifica necessaria.

- **`font-semibold` nel primitivo shadcn — guard test**: la modifica è in `components/ui/sidebar.tsx` (non in `Sidebar.tsx`) perché il CVA vive nel primitivo. `npx shadcn@latest add sidebar` sovrascrive il file e ripristina `font-medium`. Per catturare questa regressione automaticamente è stato aggiunto `__tests__/sidebarShadcnOverrides.test.ts`: legge il file sorgente reale (non una local copy) e asserisce `data-[active=true]:font-semibold`. Lo stesso file protegge anche gli override `desktop:block` / `desktop:flex` (breakpoint 1440px). Approccio "goldenfile": il test legge il sorgente direttamente con `readFileSync` invece di importare il modulo — evita di dover mockare `next/navigation` e jsdom, ed è altrettanto affidabile per regressions testuali.

- **File toccati**: `components/layout/Sidebar.tsx`, `components/ui/sidebar.tsx`, `app/globals.css`, `__tests__/sidebarShadcnOverrides.test.ts`.

---

## 2026-05-27 — Bottom navigation mobile audit & fix (BottomNavigation.tsx)

### Cosa

Audit tecnico (`/impeccable audit`, score 17/20) e fix della bottom navigation mobile su 4 assi:

1. **`aria-label="Navigazione mobile"` sul `<nav>`** — il `<nav>` non aveva label. Quando la pagina ha sia la sidebar desktop che la bottom nav mobile entrambe visibili nel DOM, i screen reader elencano due landmark "navigation" anonimi e l'utente non può distinguerli. La label permette di navigare per landmarks (VoiceOver rotor, NVDA Elements list).

2. **`aria-current="page"` sui link attivi** — i tre `<Link>` primari e il `<button>` "Altro" ora ricevono `aria-current={isActive ? 'page' : undefined}`. Porta la bottom nav in parità con `Sidebar.tsx` (già corretto nella sessione precedente, riga 109). L'attributo viene rimosso del tutto quando inattivo (`undefined` → no DOM attribute), non impostato a `"false"`.

3. **`aria-haspopup="dialog"` + `aria-expanded={drawerOpen}` sul bottone "Altro"** — il bottone apre il `SecondaryMenuDrawer` ma non dichiarava né il tipo di widget né il suo stato. Ora AT annuncia "pulsante, ha popup, compresso/espanso" prima e dopo il tap.

4. **`useReducedMotion()` sulla pill animation** — la `motion.div` con `layoutId="active-pill"` usava sempre `{ type: 'spring', stiffness: 400, damping: 35 }` ignorando `prefers-reduced-motion`. Introdotta la costante `pillTransition` che commuta su `{ duration: 0 }` quando `prefersReducedMotion === true`. Pattern identico agli 5 componenti dell'assistant che già usano `useReducedMotion` da framer-motion.

5. **Shadow `rgba(0,0,0,0.28)` → `color-mix()`** — la box-shadow era hardcoded con un nero freddo. Sostituita con `color-mix(in oklch, var(--sidebar-foreground) 22%, transparent)` per mantenere la tinta della superficie in tutti e 6 i temi (warm themes come elegant-luxury e solar-dusk producono ombre calde, cold themes ombre fredde).

### Perché

- **ARIA lacune (P1)**: senza `aria-label` e `aria-current`, un utente screen reader non può localizzare la navigazione né sapere quale pagina è corrente — violazioni WCAG 4.1.2 (Name, Role, Value). Il problema era già risolto nella sidebar desktop ma mancava sulla bottom nav.

- **`aria-expanded` assente sul bottone "Altro" (P2)**: un bottone che apre un overlay senza dichiarare il proprio stato aperto/chiuso non comunica nulla ad AT dopo il tap. L'utente potrebbe non capire che si è aperto qualcosa.

- **`useReducedMotion` incoerente (P1)**: tutti i componenti dell'assistant lo usano; la nav non lo usava. Per utenti con epilessia fotosensibile o motion sickness, animazioni di layout ricorrenti (ogni cambio tab) sono fastidiose o dannose. Il fix costa una riga.

- **Shadow hardcoded (P3)**: su temi con sidebar warmissima (elegant-luxury, retro-arcade) un'ombra netto-nera spezza la coerenza della superficie.

### Nota

- **`aria-current` su `<button>` "Altro" è corretto**: `aria-current="page"` non è riservato ai `<a>` — ARIA 1.1 lo permette su qualsiasi elemento interattivo quando rappresenta la posizione corrente in un insieme di navigazione. È la soluzione preferita qui perché il bottone non è un link ma porta il peso semantico di "sei su una rotta secondaria".

- **`pillTransition` fuori dal JSX**: estrarre la transizione in una costante evita di inlineare la logica ternaria due volte (una per i link, una per "Altro") — pattern Single Responsibility.

- **`type: 'spring' as const`**: TypeScript richiede il cast perché inferisce `string` per i literal string nelle object expressions; `as const` è il modo idiomatico in questo codebase.

- **`color-mix(in oklch, ...)` nelle inline styles di React**: le inline styles React passano il valore direttamente all'attributo `style` del DOM — il browser parsifica la stringa come CSS. `color-mix()` è supportata in tutti i browser target (Chrome 111+, Safari 16.2+, Firefox 113+); nessun polyfill necessario.

- **Score post-fix stimato: 20/20** — tutti i P0/P1/P2/P3 risolti in un'unica sessione.

- **File toccati**: `components/layout/BottomNavigation.tsx`.

---

## 2026-05-27 — SecondaryMenuDrawer audit & fix (SecondaryMenuDrawer.tsx)

### Cosa

Audit tecnico (`/impeccable audit`, score 15/20) e fix del drawer mobile secondario su 7 assi:

1. **`role="dialog"` + `aria-modal="true"` + `aria-label` sul panel** — il `motion.div` del panel non aveva semantica modale. Aggiunto `role="dialog" aria-modal="true" aria-label="Menu secondario"` in modo che i screen reader annuncino l'overlay come dialog e confino la navigazione virtuale all'interno.

2. **Focus trap (Tab e Shift+Tab)** — nuovo `useEffect` con handler `trapTab` che cicla tra il primo e l'ultimo elemento focusable del panel. Senza questo, Tab sfuggiva verso elementi dello sfondo nonostante il backdrop opaco. Funzione pura `getFocusable()` estratta fuori dal componente (SRP).

3. **Focus management autofocus + return focus** — all'apertura, `requestAnimationFrame` differisce il `focus()` al primo elemento fino al frame successivo al paint (il panel è inserito nel DOM dallo stesso render in cui `open` diventa `true`, ma il RAF garantisce che sia visibile). Alla chiusura, `returnFocusRef` riporta il focus al bottone "Altro" che aveva aperto il drawer.

4. **Nav item `<motion.button>` → `motion.li` + `<Link>`** — i bottoni non avevano `href`, non emettevano `aria-current`, non beneficiavano del prefetching di Next.js e non permettevano "apri in nuova scheda". Sostituiti con `motion.li` come stagger container e `<Link>` come elemento interattivo. Aggiunto `aria-current={isActive ? 'page' : undefined}` come già presente in `Sidebar.tsx`. Rimossi `useRouter` e la funzione `navigate()`, non più necessari.

5. **Spring `350/38` → `400/35`** — allineato allo standard di progetto usato ovunque (sidebar pill, bottom nav pill, assistente, goals, ecc.).

6. **Backdrop `bg-black/40` → `color-mix()`** — sostituito con `color-mix(in oklch, var(--sidebar-foreground) 45%, transparent)`. Stesso pattern già usato per la box-shadow del bottom nav. Il nero puro era visivamente duro su temi warm (solar-dusk, elegant-luxury). Aggiunto `aria-hidden="true"` sul backdrop per rimuoverlo dall'albero AT.

7. **Touch target `py-2.5` → `py-3`** — `py-2.5` (10px×2) + line-height text-sm (~20px) = 40px, 4px sotto il minimo WCAG 2.5.5. Con `py-3` (12px×2) + 20px = 44px esatti.

8. **`<nav>` landmark** — `motion.div` scrollabile convertito in `motion.nav aria-label="Navigazione secondaria"`. Aggiunto `<ul>` semantico dentro ogni gruppo di voci.

### Perché

- **Nessuna semantica dialog (P1)**: senza `role="dialog"` + `aria-modal`, VoiceOver e NVDA non sanno che il contenuto sottostante è inattivo e continuano a permettere la navigazione virtuale fuori dal drawer. Violazione WCAG 4.1.2.

- **Nessun focus trap (P1)**: Tab sfuggiva verso card e link nella dashboard dietro il backdrop opaco — l'utente era visivamente bloccato ma navigava in contenuto invisibile. Violazione WCAG 2.1.2 e 2.4.3.

- **`<button>` invece di `<Link>` (P1)**: oltre ai problemi ARIA, un bottone che chiama `router.push()` non espone l'`href` al browser — nessun prefetching (perf), nessun contesto menu, nessun `aria-current`. È la stessa inconsistenza che esisteva nella bottom nav prima del fix della sessione precedente.

- **Spring divergente (P2)**: motion language incoerente — il drawer si chiude con feeling leggermente diverso dalle pill del bottom nav e della sidebar. Dettaglio ma percepibile in un'app con forte identità motion.

- **Backdrop hardcoded (P2)**: su temi warm il nero puro rompe la coerenza della superficie sidebar; il pattern `color-mix()` già usato per la box-shadow del bottom nav va applicato uniformemente.

### Nota

- **`getFocusable()` come funzione pura esterna**: seguendo SRP da `DEVELOPMENT_GUIDELINES.md`, la logica di selezione degli elementi focusable è estratta fuori dal componente e documentata con JSDoc (`COMMENTS.md` — function comment). È riusabile e testabile in isolamento senza montare il componente.

- **`requestAnimationFrame` nell'autofocus**: `AnimatePresence` inietta il panel nel DOM nello stesso ciclo di render in cui `open` diventa `true`. Senza `rAF`, `getFocusable()` troverebbe il panel ma potrebbe non riuscire a fare `focus()` su un elemento non ancora visibile (opacity 0, transform). Il `rAF` differisce al frame successivo al paint — lo stesso pattern usato altrove nel codebase per focus management post-animation.

- **`aria-hidden="true"` sul backdrop è intenzionale**: il backdrop è un elemento presentazionale (area cliccabile per chiudere). `aria-hidden` lo esclude dall'albero AT così i screen reader non annunciano "div" mentre navigano il dialog. Gli eventi mouse continuano a funzionare — `aria-hidden` non disabilita i pointer events.

- **`motion.nav` come stagger container**: Framer Motion accetta variants su qualsiasi `motion.*` element — convertire `motion.div` in `motion.nav` non richiede alcuna modifica ai variants o alle animazioni. Zero impatto sulla motion.

- **`useRouter` rimosso**: l'intera funzione `navigate()` era un wrapper attorno a `router.push() + onOpenChange(false)`. Con `<Link onClick={() => onOpenChange(false)}>`, Next.js gestisce la navigazione nativamente e il drawer si chiude tramite l'onClick. Il risultato comportamentale è identico, il codice è più semplice.

- **Score post-fix stimato: 20/20** — tutti i P1/P2/P3 risolti in un'unica sessione.

- **File toccati**: `components/layout/SecondaryMenuDrawer.tsx`.

---

## 2026-05-28 — Landing page audit & fix (page.tsx, globals.css)

### Cosa

Audit tecnico (`/impeccable audit`, score 16/20) e fix della landing page su 8 assi:

1. **Skip-to-content link** — `<a href="#main-content">` visivamente nascosto (`sr-only`) inserito come primo figlio del root `<div>`, prima del `<header>`. Diventa visibile al focus via Tab (`focus:not-sr-only`). Punta a `id="main-content"` sul `<main>`.

2. **`<main id="main-content">`** — introdotto il landmark `<main>` che wrappa la sezione hero e la sezione features. Il root layout non inietta un `<main>` — senza questo, i landmark navigabili da screen reader erano solo `<header>` e `<footer>`.

3. **Loading spinner accessibile** — il `<div>` di loading ora porta `role="status"` e `aria-label="Caricamento..."`. Il `<Loader2>` riceve `aria-hidden="true"` (decorativo). Prima, uno screen reader riceveva silenzio totale durante la risoluzione dell'auth.

4. **`aria-label` sulle `<section>`** — `aria-label="Presentazione"` sul hero e `aria-label="Funzionalità"` sulla griglia feature. Due sezioni anonime producevano due landmark "region" indistinguibili nel rotor VoiceOver.

5. **`aria-busy` sul pulsante demo** — `aria-busy={demoLoading}` aggiunto al `<Button>` "Prova la Demo". Il cambio di label da "Prova la Demo" a "Accesso demo..." cambia il testo ma non annuncia lo stato ai screen reader senza `aria-busy`.

6. **`aria-hidden` sulle icone decorative** — `aria-hidden="true"` aggiunto su ShieldCheck (navbar), Sparkles (badge hero), ArrowRight e Loader2 (CTA). Lucide React v0.553 applica `aria-hidden` di default solo quando nessuna prop ARIA viene passata esplicitamente — le icone dentro bottoni con testo visibile sono decorative e non devono essere annunciate due volte.

7. **Footer link con `aria-label`** — aggiunto `aria-label="Net Worth Tracker su GitHub (apre in una nuova scheda)"` al link GitHub con `target="_blank"`. L'apertura in nuova scheda è comportamento inatteso per screen reader e utenti da tastiera senza questo avviso.

8. **Feature grid: `gap-px` technique** — sostituita la griglia di 6 card identiche (anti-pattern "identical card grids" esplicitamente bandito dai design laws). La nuova struttura usa `grid gap-px bg-border/40 overflow-hidden rounded-xl border border-border/60` come container, con celle `bg-background` che producono hairline separators condivisi tramite il background del container — tecnica Vercel/Linear. Le celle non hanno più border/rounded individuali. L'heading `<h3>` per ogni feature è preservato. Il layout rimane `sm:grid-cols-2 lg:grid-cols-3`.

9. **`prefers-reduced-motion` per `animate-spin`** — blocco `@media (prefers-reduced-motion: reduce) { .animate-spin { animation: none; } }` aggiunto in fondo a `globals.css`. Tailwind non include questa guardia di default; il fix copre globalmente tutti i `<Loader2>` dell'intera app (landing, demo button, skeleton loaders ovunque).

### Perché

- **`<main>` assente (P1)**: senza landmark main, gli utenti da tastiera/screen reader non hanno modo di raggiungere il contenuto primario senza attraversare navbar e poi tutto il DOM in sequenza. Il skip-to-content link è inutile senza un target. Violazione WCAG 2.4.1 e 1.3.6.

- **Spinner silenzioso (P1)**: il loading state è un pattern ad alta frequenza — ogni visita di un utente già autenticato lo incontra. Senza `role="status"`, VoiceOver non annuncia nulla. L'utente pensa che la pagina sia rotta, non in caricamento.

- **Feature card identiche (P2)**: la presenza di 6 card con struttura identica è uno dei pattern banditi esplicitamente nei design laws dell'impeccable skill (`shared design laws → Anti-Patterns → "Identical card grids"`). La tecnica `gap-px` produce la stessa griglia col 30% di markup CSS in meno e un aspetto molto più distintivo e on-brand.

- **`animate-spin` e vestibular disorders (P2)**: rotazione continua senza pausa in loop è il tipo di animazione più problematico per utenti con disordini vestibolari. La regola CSS globale è la soluzione minima e massimamente efficace — nessuna modifica ai componenti.

### Nota

- **`gap-px` technique — come funziona**: il container ha `bg-border/40` e `gap-px`. Ogni cella ha `bg-background`. Il gap di 1px tra le celle espone il background del container, che appare come hairline separator. `overflow-hidden` sul container + `rounded-xl` fa sì che le celle d'angolo vengano clippate al corner radius esterno, producendo un blocco unificato. Zero dipendenza da `border` individuali per cella.

- **`aria-hidden` su Lucide in contesto bottone con testo**: la regola è — se il bottone ha testo visibile, l'icona è decorativa → `aria-hidden="true"`. Se l'icona è il solo identificatore del bottone (icona-only), deve avere `aria-label` o `title`. Tutti i casi in questa pagina rientrano nel primo pattern.

- **`aria-busy` vs `aria-live`**: `aria-busy` sull'elemento interattivo è sufficiente per dichiarare che l'azione è in corso. Un `aria-live` region separato sarebbe necessario solo per annunciare il completamento dell'azione — qui non serve perché il successo porta direttamente al redirect su `/dashboard`.

- **Score post-fix stimato: 20/20** — tutti i P1/P2/P3 risolti in un'unica sessione.

- **File toccati**: `app/page.tsx`, `app/globals.css`.
