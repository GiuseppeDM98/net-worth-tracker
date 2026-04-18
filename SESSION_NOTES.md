# SESSION NOTES — fix-chart-line-style

**Date**: 2026-04-18
**Branch**: `claude/fix-chart-line-style-C1d7u`

## Goal
Remove individual data-point dots from the "Evoluzione Patrimonio Netto" line chart so it renders as a clean continuous line, matching the visual style of the "Patrimonio Netto per Asset Class" area chart below it.

## Analysis
- The `<Line>` component in `app/dashboard/history/page.tsx` (line ~847) passes `dot={({ key, ...props }) => <CustomChartDot ... />}`.
- `CustomChartDot` rendered two dot variants:
  1. **Amber dot + message icon** for snapshots with notes attached.
  2. **Standard blue circle** for every other data point.
- The blue circles on every point were causing the "pallini" the user wanted removed.

## Change Made
**File**: `components/history/CustomChartDot.tsx`

Changed the else branch from rendering a standard blue circle to returning `null`. Now `CustomChartDot` only renders a visible element when `hasNote === true` (amber indicator), leaving all other line points clean.

No change was needed in `page.tsx` — the `dot` prop already goes through `CustomChartDot`, and `activeDot={{ r: 6 }}` is kept so hovering still shows a dot for UX feedback.

## Files Changed
- `components/history/CustomChartDot.tsx` — removed blue dot render for non-note points

---

## Riepilogo sessione

- **Cosa**: Rimosso il rendering dei pallini blu sui singoli punti del grafico "Evoluzione Patrimonio Netto". La linea ora è continua e pulita, identica allo stile del grafico "Patrimonio Netto per Asset Class" sottostante. Gli indicatori ambra per le snapshot con nota restano visibili.

- **Perché**: I pallini su ogni punto rendevano il grafico visivamente affollato su serie lunghe (40+ rilevazioni). Una linea continua è più leggibile e coerente con il linguaggio visivo del resto della pagina Storico, dove i grafici ad area non usano marker su ogni punto.

- **Nota**: `CustomChartDot` gestisce due casi — nota presente (amber marker) e nota assente (prima: cerchio blu, ora: `null`). Il prop `activeDot={{ r: 6 }}` sulla `<Line>` è stato mantenuto intenzionalmente: al hover Recharts mostra comunque un punto, utile per capire il valore esatto su cui si sta puntando. Non è stato necessario toccare `page.tsx` perché il prop `dot` era già delegato al componente.
