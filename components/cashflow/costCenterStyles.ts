/**
 * The canonical Recharts tick style — born on the Centri di Costo views, kept here by name
 * after their 2026-08-23 redesign retired their Recharts charts (the in-tile bars are
 * hand-written SVG): Storico's Composizione, the FIRE charts and Coast import it from this
 * path, and AGENTS.md → Recharts names it as the one way to make ticks obey the Mono Mandate.
 * The two typographic levels that used to live beside it (EYEBROW_CLASS, CHAPTER_TITLE_CLASS)
 * went with the views; a tile's eyebrow is `TILE_EYEBROW_CLASS` in `components/ui/tile.tsx`.
 */

/**
 * Recharts renders axis ticks and legends in the ambient sans by default. The Mono Mandate names
 * chart axis labels explicitly, so every axis passes this instead.
 */
export const CHART_TICK_STYLE = {
  fontSize: 11,
  fontFamily: 'var(--font-geist-mono)',
  fill: 'var(--muted-foreground)',
} as const;
