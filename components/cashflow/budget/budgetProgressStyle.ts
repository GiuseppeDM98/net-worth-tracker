// Token-based progress styling for budgets.
//
// Colour follows the data (Data Owns Color): the chrome stays achromatic and only
// the progress fill / percentage text carries semantic colour, sourced from the
// theme's semantic tokens (no hardcoded emerald/amber/red palette values).
//
// `inverted` flips the meaning for income targets:
//   expense → filling toward 100% is bad   (ok < warning < over)
//   income  → reaching 100% is good         (neutral < warning < ok)

const WARNING_THRESHOLD = 0.8;

/** CSS colour for the progress-bar fill, as a theme token. Use in inline style. */
export function progressFillColor(ratio: number, inverted = false): string {
  if (inverted) {
    if (ratio >= 1) return 'var(--positive)';
    if (ratio >= WARNING_THRESHOLD) return 'var(--warning-foreground)';
    return 'var(--muted-foreground)';
  }
  if (ratio > 1) return 'var(--destructive)';
  if (ratio >= WARNING_THRESHOLD) return 'var(--warning-foreground)';
  return 'var(--positive)';
}

/** Tailwind text-colour utility for the inline percentage, matching the fill. */
export function progressTextClass(ratio: number, inverted = false): string {
  if (inverted) {
    if (ratio >= 1) return 'text-positive';
    if (ratio >= WARNING_THRESHOLD) return 'text-warning-foreground';
    return 'text-muted-foreground';
  }
  if (ratio > 1) return 'text-destructive';
  if (ratio >= WARNING_THRESHOLD) return 'text-warning-foreground';
  return 'text-positive';
}
