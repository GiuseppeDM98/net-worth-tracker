// Colour of a budget's progress, as a theme token (Data Owns Color): the chrome stays
// achromatic and only the fill / percentage text carries meaning.
//
// A spending budget under its limit is NOT a gain — the sign tokens mean gain and loss and
// nothing else (AGENTS.md → Layout and Color Tokens) — so the fill stays `--foreground`
// until the budget is nearly used (`--warning-foreground` from 90%) or exceeded
// (`--destructive`). An income target is the inverse: reaching it is good, and only then
// does it take the positive token; before that it is simply muted.

const WARNING_THRESHOLD = 0.9;

/** CSS colour for the progress fill. Use in inline style. */
export function progressFillColor(ratio: number, inverted = false): string {
  if (inverted) return ratio >= 1 ? 'var(--positive)' : 'var(--muted-foreground)';
  if (ratio > 1) return 'var(--destructive)';
  if (ratio >= WARNING_THRESHOLD) return 'var(--warning-foreground)';
  return 'var(--foreground)';
}

/** Tailwind text-colour utility for the inline percentage, matching the fill. */
export function progressTextClass(ratio: number, inverted = false): string {
  if (inverted) return ratio >= 1 ? 'text-positive' : 'text-muted-foreground';
  if (ratio > 1) return 'text-destructive';
  if (ratio >= WARNING_THRESHOLD) return 'text-warning-foreground';
  return 'text-foreground';
}
