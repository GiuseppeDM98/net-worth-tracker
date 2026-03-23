# DELIGHT-09 — Keyboard Shortcuts Navigation (Gmail-style)

## Categoria
Delight

## Priorità
Bassa

## Descrizione
Navigazione da tastiera stile Gmail: premendo `g` poi `d` si va alla dashboard, `g` poi `h` alla History, ecc. Un delight per gli utenti power che usano l'app quotidianamente. Completamente nascosto — lo scopre chi lo cerca.

## Shortcut Map

| Sequenza | Destinazione |
|----------|-------------|
| `g` → `d` | Dashboard (Overview) |
| `g` → `h` | History |
| `g` → `p` | Performance |
| `g` → `c` | Cashflow |
| `g` → `v` | Dividends (V da "dividendi") |
| `g` → `f` | FIRE Simulations |
| `g` → `a` | Allocation |
| `g` → `s` | Settings |
| `?` | Mostra tooltip con lista shortcuts |

## Implementazione
1. `useEffect` globale in `app/dashboard/layout.tsx` che ascolta `keydown`
2. State machine semplice: primo key `g` → set `waitingForSecondKey = true` + timeout 1500ms per reset
3. Se arriva il secondo key nel timeout → `router.push(path)`
4. Ignorare shortcuts se il focus è su un `<input>`, `<textarea>`, o elemento `contenteditable`

## File Coinvolti
- `app/dashboard/layout.tsx` — aggiungere il listener
- Opzionale: `hooks/useKeyboardNav.ts` per estrarre la logica

## Vincoli
- Non intercettare shortcuts se l'utente sta scrivendo in un input
- Il timeout di 1500ms tra i due tasti è generoso — se l'utente non preme il secondo, resetta silenziosamente
- La pressione di `?` deve mostrare un piccolo overlay con la lista — dismissibile con Escape o click outside
- Non usare librerie (hotkeys.js, etc.) — implementazione vanilla con `addEventListener`

---

## Prompt per Claude Code

```
Sei in una sessione di sviluppo sul progetto Net Worth Tracker (Next.js 16, React 19, TypeScript, Tailwind v4).

Obiettivo: aggiungere navigazione da tastiera stile Gmail — sequenza di due tasti `g` poi lettera per navigare tra le sezioni.

Contesto:
- `app/dashboard/layout.tsx` — file da modificare (o creare un hook estratto)
- Le route del dashboard sono: `/dashboard`, `/dashboard/history`, `/dashboard/performance`, `/dashboard/cashflow`, `/dashboard/dividends`, `/dashboard/fire-simulations`, `/dashboard/allocation`, `/dashboard/settings`
- Usa `useRouter` da `next/navigation`

Task:
1. Leggi `app/dashboard/layout.tsx` per capire la struttura
2. Crea `hooks/useKeyboardNav.ts` con questa logica:
   - State: `waitingForSecondKey: boolean`
   - `document.addEventListener('keydown', handler)` in `useEffect`
   - Handler: se focus è su input/textarea/select/[contenteditable], return early (non intercettare)
   - Se key === 'g' && !waitingForSecondKey: set `waitingForSecondKey = true`, setTimeout(1500ms) per reset
   - Se waitingForSecondKey:
     - 'd' → `/dashboard`
     - 'h' → `/dashboard/history`
     - 'p' → `/dashboard/performance`
     - 'c' → `/dashboard/cashflow`
     - 'v' → `/dashboard/dividends`
     - 'f' → `/dashboard/fire-simulations`
     - 'a' → `/dashboard/allocation`
     - 's' → `/dashboard/settings`
     - Qualsiasi altro key → reset state
   - Se key === '?' && !waitingForSecondKey: toggle modale shortcuts
3. Crea un componente `KeyboardShortcutsModal` (in `components/ui/` o inline):
   - Overlay semi-trasparente, card centrata, lista shortcuts in 2 colonne
   - Chiudibile con `Escape` o click outside
   - Design: `bg-popover border border-border rounded-lg shadow-lg p-6`
   - Header: "Scorciatoie da tastiera"
   - Ogni riga: badge tasto grigio `<kbd>g</kbd> <kbd>d</kbd>` → descrizione
4. Importa e usa `useKeyboardNav()` in `app/dashboard/layout.tsx`

Vincoli:
- Il focus check deve includere: `input`, `textarea`, `select`, `[contenteditable]`, e qualsiasi elemento con `role="textbox"`
- `useEffect` cleanup: rimuovere il listener al unmount
- Il modal shortcuts deve usare `AnimatePresence` + `fadeVariants` da `motionVariants.ts`
- Non usare Radix Dialog per il modal shortcuts — implementazione custom (Dialog è troppo invasivo per un overlay leggero)
- TypeScript strict

Al termine dimmi: come testare ogni shortcut, come verificare che non interferisca con la digitazione nei form (test in AssetDialog, BudgetTab), come verificare il modal con `?`, e come testare il timeout (attendere 1500ms senza premere il secondo tasto).
```
