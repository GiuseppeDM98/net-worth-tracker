# Session 01 — Dark Mode Sweep

## Obiettivo
Aggiungere le varianti `dark:` mancanti su tutti i componenti che usano colori gray hardcoded senza dark mode support. Questo è il bug visivo più impattante: in dark mode diversi componenti rimangono con sfondi chiari e testi scuri.

## Scope
- `components/fire-simulations/FireCalculatorTab.tsx`
- `components/goals/GoalSummaryCards.tsx`
- `components/goals/GoalDetailCard.tsx`
- `components/goals/AssetAssignmentDialog.tsx`
- `components/goals/AllocationComparisonBar.tsx`
- `components/goals/GoalFormDialog.tsx`
- `components/cashflow/ExpenseTrackingTab.tsx` (solo la parte hover dei combobox dropdown)
- `app/dashboard/page.tsx` (h1, subtitle, loading state)
- `components/ui/sheet.tsx` (close button)
- `app/dashboard/layout.tsx` (bg main area + hamburger bar)
- `components/layout/BottomNavigation.tsx` (active tab background)

## Regole da applicare

### Testo
| Classe attuale | Aggiungere |
|---|---|
| `text-gray-900` | `dark:text-gray-100` |
| `text-gray-700` | `dark:text-gray-300` |
| `text-gray-600` | `dark:text-gray-400` |
| `text-gray-500` | `dark:text-gray-400` |
| `text-gray-400` | `dark:text-gray-500` |

### Sfondi
| Classe attuale | Aggiungere |
|---|---|
| `bg-gray-50` | `dark:bg-gray-900` |
| `bg-gray-100` | `dark:bg-gray-800` |
| `bg-gray-200` | `dark:bg-gray-700` |
| `bg-gray-300` | `dark:bg-gray-600` |

### Hover
| Classe attuale | Aggiungere |
|---|---|
| `hover:bg-gray-50` | `dark:hover:bg-gray-800` |
| `hover:bg-gray-100` | `dark:hover:bg-gray-700` |
| `hover:bg-gray-200` | `dark:hover:bg-gray-700` |

### Bordi e divisori
| Classe attuale | Aggiungere |
|---|---|
| `divide-gray-100` | `dark:divide-gray-800` |
| `border-gray-200` | `dark:border-gray-700` |

## Casi speciali
- `BottomNavigation.tsx` riga 69: `bg-blue-50` → aggiungere `dark:bg-blue-950/20`
- `sheet.tsx` riga 71: `bg-gray-100 hover:bg-gray-200 text-gray-700` → aggiungere `dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200`
- `layout.tsx` riga 52: `bg-white` hamburger bar → aggiungere `dark:bg-gray-900`
- `layout.tsx` riga 65: `bg-gray-50` main area → aggiungere `dark:bg-gray-950`

## NON toccare
- Classi già con `dark:` sibling
- Colori semantici (`text-blue-*`, `text-green-*`, etc.) — quelli sono intenzionali
- Classi inline `style={{}}` — usano colori dinamici non gestibili via Tailwind

## Verifica
1. Aprire ogni pagina modificata con dark mode attivo
2. Verificare che nessun elemento mostri sfondo bianco/chiaro su tema scuro
3. `npm test` deve passare (nessuna modifica a logica)

---

## Prompt per Claude

```
Leggi AGENTS.md, CLAUDE.md e COMMENTS.md prima di iniziare.

Stai lavorando su: Session 01 — Dark Mode Sweep
Leggi il file docs/sessions/session-01-dark-mode-sweep.md per le specifiche complete.

Il task è aggiungere le varianti dark: mancanti sui seguenti file:
- components/fire-simulations/FireCalculatorTab.tsx
- components/goals/GoalSummaryCards.tsx
- components/goals/GoalDetailCard.tsx
- components/goals/AssetAssignmentDialog.tsx
- components/goals/AllocationComparisonBar.tsx
- components/goals/GoalFormDialog.tsx
- components/cashflow/ExpenseTrackingTab.tsx (solo hover sui combobox dropdown)
- app/dashboard/page.tsx (h1, subtitle, loading state)
- components/ui/sheet.tsx (close button)
- app/dashboard/layout.tsx (bg main area + hamburger bar)
- components/layout/BottomNavigation.tsx (active tab bg)

Regola generale:
- text-gray-900 → aggiungere dark:text-gray-100
- text-gray-700 → dark:text-gray-300
- text-gray-600 → dark:text-gray-400
- text-gray-500 → dark:text-gray-400
- text-gray-400 → dark:text-gray-500
- bg-gray-50 → dark:bg-gray-900
- bg-gray-100 → dark:bg-gray-800
- bg-gray-200 → dark:bg-gray-700
- hover:bg-gray-50 → dark:hover:bg-gray-800
- hover:bg-gray-100 → dark:hover:bg-gray-700
- divide-gray-100 → dark:divide-gray-800

Casi speciali documentati nel file sessione.

Non toccare colori semantici (blue-*, green-*, ecc.) né style={{}} inline.
Dopo ogni file, aggiorna SESSION_NOTES.md con le righe della tabella Session 1.
Alla fine esegui npm test.
```
