/**
 * The design tokens for the two surfaces that live OUTSIDE the DOM: the periodic emails
 * and the PDF export.
 *
 * Why this file exists. A mail client and `@react-pdf/renderer` never see `app/globals.css`:
 * there is no cascade to inherit from and no `var(--border)` to resolve, so every colour has
 * to be a literal. Before this module those literals were written by hand in twelve files, and
 * they had drifted into a palette the app does not own — the emails ran on Tailwind's slate
 * ramp (`#0f172a`, `#64748b`, `#94a3b8`) and the PDF on a blue accent (`#3B82F6`) that violates
 * the Zero-Chroma Rule outright. Nothing kept them in step with the theme, because nothing
 * could: a hex in a template has no relationship to an OKLCH declaration in a stylesheet.
 *
 * So this is the ONE place an out-of-DOM hex may live. Every value below is the sRGB rendering
 * of the corresponding `:root` declaration in `app/globals.css` — the DEFAULT (light) theme,
 * which is the right one for both media: an email is read on a white card and a PDF is printed
 * on white paper. The named themes are deliberately not mirrored; a report does not follow the
 * reader's colour preference.
 *
 * Conversion: OKLCH → OKLab → linear sRGB → gamma-encoded sRGB (Björn Ottosson's reference
 * matrices), then rounded to 8 bits. Re-derive the same way if a token in `globals.css` moves;
 * `__tests__/printTokens.test.ts` pins the arithmetic so a hand-edit here fails loudly.
 *
 * WARNING: If you add a colour here, it must correspond to a real token in `app/globals.css`.
 * A hex with no declaration behind it is exactly the drift this module was created to end.
 */

import { ASSET_CLASS_CHART_INDEX } from '@/lib/utils/allocationUtils';

/**
 * The structural palette, mirroring `:root` in `app/globals.css`.
 *
 * `rowRule` is the one entry that is not a one-to-one mapping, and it is deliberate: an in-tile
 * row separator uses `--muted` rather than `--border` so that the tile boundary stays visibly
 * heavier than the row boundary. In the DOM that hierarchy comes from `divide-y` on a lighter
 * surface; out of the DOM it has to be stated. It is the same value as `surfaceMuted` — the
 * two names record the two jobs, so a future change to one does not silently move the other.
 */
export const PRINT_COLORS = {
  /** `--background` · oklch(1 0 0) — the page behind the card (email) and the paper (PDF). */
  background: '#ffffff',
  /** `--card` · oklch(1 0 0) — the surface a tile sits on. */
  card: '#ffffff',
  /** `--foreground` · oklch(0.145 0 0) — prose and figures. */
  foreground: '#0a0a0a',
  /** `--muted-foreground` · oklch(0.556 0 0) — eyebrows, scopes, captions, footers. */
  mutedForeground: '#737373',
  /** `--muted` · oklch(0.97 0 0) — sub-tile fills, the AI comment's ground, table zebra. */
  surfaceMuted: '#f5f5f5',
  /** `--border` · oklch(0.922 0 0) — between tiles, under a section eyebrow. */
  border: '#e5e5e5',
  /** `--muted` again, in its second job: the lighter rule between rows INSIDE a tile. */
  rowRule: '#f5f5f5',
  /** `--positive` · oklch(0.482 0.194 149.214) — the positive half of every sign colour. */
  positive: '#007903',
  /** `--destructive` · oklch(0.577 0.245 27.325) — the negative half. */
  negative: '#e7000b',
  /** `--warning-foreground` · oklch(0.468 0.098 75) — "near the limit", never "over". */
  warning: '#7a5102',
} as const;

/**
 * `--chart-1` … `--chart-8` of the default theme, in order.
 *
 * These are the LIGHT values, which differ from the dark ones by more than lightness: read
 * `getAssetClassColor` in `lib/constants/colors.ts` for the legacy fallback palette, which is
 * a different set of hues entirely and must not be used here — an email that painted Azioni
 * `#3B82F6` would disagree with every chart the app draws for the same class.
 */
export const PRINT_CHART_HEX: readonly string[] = [
  '#f54900', // --chart-1 · oklch(0.646 0.222 41.116)
  '#009689', // --chart-2 · oklch(0.6 0.118 184.704)
  '#104e64', // --chart-3 · oklch(0.398 0.07 227.392)
  '#ffb900', // --chart-4 · oklch(0.828 0.189 84.429)
  '#fe9a00', // --chart-5 · oklch(0.769 0.188 70.08)
  '#918117', // --chart-6 · oklch(0.600 0.118 100)
  '#167f93', // --chart-7 · oklch(0.550 0.092 215)
  '#bc3099', // --chart-8 · oklch(0.560 0.205 340)
] as const;

/**
 * The hex an asset class paints with, out of the DOM.
 *
 * Derived from `ASSET_CLASS_CHART_INDEX` — the app's single source for which slot a class
 * owns — so the email, the PDF and every in-app chart can never disagree about what colour
 * Crypto is. A class the map does not know falls back to the muted foreground, the same
 * refusal `getAssetClassColor` makes.
 */
export function printChartHexForAssetClass(assetClass: string): string {
  const slot = ASSET_CLASS_CHART_INDEX[assetClass];
  if (slot === undefined) return PRINT_COLORS.mutedForeground;
  return PRINT_CHART_HEX[slot] ?? PRINT_COLORS.mutedForeground;
}

/**
 * A ranked list uses ONE hue for every row — the rank is carried by the bar's length, not by
 * colour, so a list of eleven expense categories does not become a rainbow. Slot 3 (the deep
 * petrol) is the quietest of the eight against white.
 */
export const PRINT_RANK_HEX = PRINT_CHART_HEX[2];

// ─── Type faces ───────────────────────────────────────────────────────────────

/**
 * Email font stacks. No webfont: Gmail strips `@font-face`, Outlook desktop ignores it, and a
 * report that renders in Times because a CDN was slow is worse than one that never tried.
 * These are the faces already on the reader's machine, in the order the app would prefer them.
 */
export const EMAIL_SANS_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

/** The numeric face. The Mono Mandate holds in an email: `tnum` comes from the face itself. */
export const EMAIL_MONO_STACK =
  "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";

/**
 * PDF faces — a DECLARED exception to the Mono Mandate (DESIGN.md → §3).
 *
 * `@react-pdf/renderer` ships only the standard PDF families (Helvetica, Times, Courier);
 * anything else needs `Font.register` with real font files, and Geist reaches this app through
 * `next/font/google`, so there is no local file to register. The alternatives were both worse:
 * fetching Geist Mono from a CDN gives PDF generation — which runs in the reader's browser —
 * a network dependency that throws mid-render when it fails, and Courier is a typewriter face
 * that fights the precision the rest of the system is built on.
 *
 * So figures are set in Helvetica and their alignment comes from the COLUMN instead of the
 * face: every numeric column is fixed-width and right-aligned. Tabular reading is preserved;
 * the monospace texture is not.
 */
export const PDF_FONTS = {
  regular: 'Helvetica',
  bold: 'Helvetica-Bold',
  oblique: 'Helvetica-Oblique',
} as const;
