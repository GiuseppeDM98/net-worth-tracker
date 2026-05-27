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
