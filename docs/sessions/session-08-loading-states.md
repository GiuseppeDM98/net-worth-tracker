# Session 08 — Loading States Consistency

## Obiettivo
Uniformare tutti i loading states dell'app al pattern standard: usare `Loader2 animate-spin` con `text-muted-foreground` per i loading in-component, invece dei `<div className="text-gray-500">Caricamento...</div>` senza animazione né altezza placeholder.

## Scope
- `components/fire-simulations/GoalBasedInvestingTab.tsx`
- `components/fire-simulations/FireCalculatorTab.tsx`
- `components/fire-simulations/MonteCarloTab.tsx`
- `components/dividends/DividendStats.tsx`
- `app/dashboard/page.tsx` (loading state principale)

## Pattern da applicare

### Standard per loading in-component
```tsx
import { Loader2 } from 'lucide-react';

// PRIMA (pattern vecchio)
<div className="flex h-64 items-center justify-center">
  <div className="text-gray-500">Caricamento...</div>
</div>

// DOPO (pattern standard)
<div className="flex h-64 items-center justify-center">
  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
</div>
```

> **Nota**: Mantenere l'altezza placeholder (`h-64` o simile) per evitare layout shift. L'importante è sostituire il testo statico con lo spinner animato.

### Variante con testo (opzionale, per contesti più descrittivi)
```tsx
<div className="flex h-64 items-center justify-center gap-2 text-muted-foreground">
  <Loader2 className="h-5 w-5 animate-spin" />
  <span className="text-sm">Caricamento...</span>
</div>
```

## File per file

### GoalBasedInvestingTab.tsx
Cercare il loading state (~riga 199): `<div className="text-gray-500">Caricamento...</div>` e applicare il pattern.

### FireCalculatorTab.tsx
Cercare il loading state (~riga 176): stessa sostituzione.
> Se la Session 06 ha già fixato il file, verificare che il loading state sia stato aggiornato.

### MonteCarloTab.tsx
Cercare il loading state (~riga 276).

### DividendStats.tsx
Cercare il loading state (~riga 169).

### app/dashboard/page.tsx
Il loading state della dashboard è più visibile — potrebbe valere un'altezza maggiore (`h-96`) e la variante con testo.

## Verifica `RefreshCw` vs `Loader2`
Alcuni componenti cashflow usano `RefreshCw animate-spin` come loading icon. Questi sono OK da lasciare se usati nel contesto di un "refresh" attivo (l'utente ha cliccato qualcosa). Solo i loading states "iniziali" (caricamento dati al mount) devono usare `Loader2`.

## Verifica
1. Aprire ogni pagina modificata con connessione lenta (Network throttling) — deve apparire lo spinner animato
2. Nessun testo "Caricamento..." statico deve restare
3. `npm test` deve passare

---

## Prompt per Claude

```
Leggi AGENTS.md, CLAUDE.md e COMMENTS.md prima di iniziare.

Stai lavorando su: Session 08 — Loading States Consistency
Leggi il file docs/sessions/session-08-loading-states.md per le specifiche complete.

File target:
- components/fire-simulations/GoalBasedInvestingTab.tsx
- components/fire-simulations/FireCalculatorTab.tsx
- components/fire-simulations/MonteCarloTab.tsx
- components/dividends/DividendStats.tsx
- app/dashboard/page.tsx

In tutti questi file, cerca il pattern:
  <div className="flex h-XX items-center justify-center">
    <div className="text-gray-500">Caricamento...</div>
  </div>

E sostituisci con:
  <div className="flex h-XX items-center justify-center">
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
  </div>

Importa Loader2 da lucide-react se non è già importato.
Mantieni l'altezza placeholder (h-64 o quella esistente) per evitare layout shift.

NON cambiare i RefreshCw animate-spin che indicano un refresh attivo — solo i loading states iniziali al mount del componente.

Dopo le modifiche aggiorna SESSION_NOTES.md con le righe della tabella Session 8.
Alla fine esegui npm test.
```
