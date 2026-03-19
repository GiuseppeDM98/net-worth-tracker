# Session 03 — Performance Component Polish

## Obiettivo
Correggere due problemi nel tab Performance:
1. **Breakpoint inconsistenti**: `md:` e `lg:` invece del breakpoint progetto `desktop:` (1440px)
2. **Reduced-motion gap**: Le animazioni CSS `animate-in` in MetricCard non rispettano `prefers-reduced-motion`

## Scope
- `components/performance/MetricSection.tsx`
- `components/performance/PerformancePageSkeleton.tsx`
- `components/performance/MetricCard.tsx`

## Fix da applicare

### 1. Breakpoint in MetricSection.tsx
**Problema**: Il grid delle metric card usa `md:grid-cols-2 lg:grid-cols-4` — la griglia a 4 colonne parte a 1024px invece di 1440px, troppo presto su iPad/tablet.

**Fix**: Sostituire:
```tsx
// DA
className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
// A
className="grid grid-cols-1 desktop:grid-cols-2 desktop:grid-cols-4 gap-4"
```

> **Attenzione**: Tailwind non supporta due `grid-cols-*` sulla stessa classe — la regola corretta per il progetto è usare un breakpoint intermedio reale. Poiché il progetto non ha un breakpoint `tablet:` (solo `desktop:` a 1440px), la soluzione è:
> ```tsx
> className="grid grid-cols-1 sm:grid-cols-2 desktop:grid-cols-4 gap-4"
> ```
> Questo dà 1 colonna su mobile, 2 su tablet (≥640px) e 4 su desktop (≥1440px). Meglio di `lg:` che forza 4 colonne a 1024px su iPad.

### 2. Breakpoint in PerformancePageSkeleton.tsx
Stesso problema — cercare `md:grid-cols-2 lg:grid-cols-4` e applicare la stessa correzione.

### 3. Reduced-motion in MetricCard.tsx
**Problema**: Le animazioni CSS `animate-in slide-in-from-bottom-4 fade-in-0` con `animationDelay` inline non vengono disabilitate quando l'utente ha `prefers-reduced-motion: reduce` nel sistema.

**Dove si trova**: Cerca `animationDelay` o `animation-fill-mode` nel file.

**Fix**: Aggiungere un hook per rilevare la preferenza e saltare l'animazione:
```tsx
// All'inizio del componente
const prefersReducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Sulle classi animate:
className={cn(
  "...",
  !prefersReducedMotion && "animate-in slide-in-from-bottom-4 fade-in-0 [animation-fill-mode:both]"
)}

// Sullo style inline:
style={!prefersReducedMotion ? { animationDelay: `${delay}ms` } : undefined}
```

> **Nota**: Se MetricCard è un server component o non ha accesso a `window`, usare un `useEffect` + `useState` per rilevare la preferenza lato client dopo il mount.

## Convenzione progetto
- Breakpoint custom: `desktop:` = 1440px (non usare `lg:` che è 1024px)
- Per grids a 4 colonne usare: `grid-cols-1 sm:grid-cols-2 desktop:grid-cols-4`
- Le animazioni Framer Motion rispettano già `prefers-reduced-motion` tramite `MotionConfig` in `MotionProvider.tsx` — le animazioni CSS custom devono gestirlo manualmente

## Verifica
1. Aprire Performance page su iPad (744px CSS width) — le card devono essere a 2 colonne, non 4
2. Su OS con `prefers-reduced-motion: reduce` — le card non devono animarsi
3. Su desktop ≥1440px — le card devono essere a 4 colonne
4. `npm test` deve passare

---

## Prompt per Claude

```
Leggi AGENTS.md, CLAUDE.md e COMMENTS.md prima di iniziare.

Stai lavorando su: Session 03 — Performance Component Polish
Leggi il file docs/sessions/session-03-performance-polish.md per le specifiche complete.

File target:
- components/performance/MetricSection.tsx
- components/performance/PerformancePageSkeleton.tsx
- components/performance/MetricCard.tsx

Fix 1: In MetricSection.tsx e PerformancePageSkeleton.tsx, cerca grid con md:grid-cols-2 lg:grid-cols-4 e sostituisci con grid-cols-1 sm:grid-cols-2 desktop:grid-cols-4.
Motivo: il progetto usa desktop: (1440px) come breakpoint principale, non lg: (1024px). Su iPad a 744px CSS, lg: forza 4 colonne che è troppo compresso.

Fix 2: In MetricCard.tsx, aggiungi un check prefers-reduced-motion prima di applicare le classi animate-in e lo style animationDelay. Se l'utente ha ridotto il movimento, ometti sia le classi animate-in che lo style delay.

Convenzione: usa window.matchMedia('(prefers-reduced-motion: reduce)').matches — se è un client component, puoi farlo in un useEffect/useState. Non usare un hook esterno se non già presente nel progetto.

Dopo le modifiche aggiorna SESSION_NOTES.md con le righe della tabella Session 3.
Alla fine esegui npm test.
```
