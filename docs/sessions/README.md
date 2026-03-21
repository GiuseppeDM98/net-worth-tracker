# Sessions — Animate & Delight

Specifiche e prompt pronti per le sessioni di implementazione.
Generato il: 2026-03-21

---

## Animate

| File | Feature | Priorità | Sforzo |
|------|---------|----------|--------|
| [animate-01-page-transitions.md](./animate-01-page-transitions.md) | Transizioni tra pagine dashboard | 🔴 Alta | 🟢 Basso |
| [animate-02-recharts-animations.md](./animate-02-recharts-animations.md) | Animazioni built-in Recharts (bar/line/pie) | 🟡 Media | 🟢 Basso |
| [animate-03-button-micro-interaction.md](./animate-03-button-micro-interaction.md) | Hover lift + press feedback su tutti i button | 🟡 Media | 🟢 Basso |
| [animate-04-stagger-performance-dividends.md](./animate-04-stagger-performance-dividends.md) | Framer Motion stagger su Performance & Dividends pages | 🟡 Media | 🟢 Basso |
| [animate-05-budget-collapsible-slidedown.md](./animate-05-budget-collapsible-slidedown.md) | Animazione slideDown su sezioni collassabili Budget | 🟡 Media | 🟢 Basso |
| [animate-06-countup-dashboard-kpi.md](./animate-06-countup-dashboard-kpi.md) | Estrai useCountUp e applicalo ai KPI del Dashboard | 🟡 Media | 🟡 Medio |

## Delight

| File | Feature | Priorità | Sforzo |
|------|---------|----------|--------|
| [delight-01-milestone-confetti.md](./delight-01-milestone-confetti.md) | Confetti al primo render di una milestone raddoppio completata | 🔴 Alta | 🟡 Medio |
| [delight-02-fire-goal-reached.md](./delight-02-fire-goal-reached.md) | Banner celebrativo + confetti quando FIRE Number raggiunto | 🔴 Alta | 🔴 Alto |
| [delight-03-toast-checkmark-animation.md](./delight-03-toast-checkmark-animation.md) | SVG draw animation sul checkmark del toast success | 🟢 Bassa | 🟡 Medio |
| [delight-04-empty-states.md](./delight-04-empty-states.md) | EmptyState component con icone SVG float animated | 🟡 Media | 🟡 Medio |
| [delight-05-dashboard-kpi-hover-reveal.md](./delight-05-dashboard-kpi-hover-reveal.md) | Hover sulla card Patrimonio → breakdown per asset class | 🟡 Media | 🟡 Medio |
| [delight-06-savings-rate-badge.md](./delight-06-savings-rate-badge.md) | Badge temporaneo "ottimo risparmio" se savings rate > 30% | 🟢 Bassa | 🟡 Medio |
| [delight-07-patrimonio-reaction.md](./delight-07-patrimonio-reaction.md) | Reazione direzionale (rise/fall) sul numero Totale Patrimonio | 🟡 Media | 🟡 Medio |
| [delight-08-console-easter-egg.md](./delight-08-console-easter-egg.md) | Console message brandizzato per developer | 🟢 Bassa | 🟢 Basso |
| [delight-09-keyboard-shortcuts.md](./delight-09-keyboard-shortcuts.md) | Navigazione da tastiera Gmail-style (g→d, g→h, ecc.) | 🟢 Bassa | 🔴 Alto |
| [delight-10-greeting-time-of-day.md](./delight-10-greeting-time-of-day.md) | Saluto contestuale ora del giorno nell'header dashboard | 🟢 Bassa | 🟢 Basso |

---

## Quick Wins (basso sforzo, buon impatto)

Se vuoi iniziare subito, questi tre hanno il miglior rapporto sforzo/impatto:

1. **animate-01** — Page transitions: ~20 righe in `layout.tsx`
2. **animate-03** — Button micro-interaction: ~5 classi Tailwind in `button.tsx`
3. **delight-08** — Console easter egg: ~10 righe, zero rischi
4. **delight-10** — Saluto ora del giorno: 1 utility function + 3 righe nel dashboard
