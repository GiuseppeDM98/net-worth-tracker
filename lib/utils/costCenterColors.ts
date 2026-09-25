/**
 * Cost center identity colour — resolution against the active theme.
 *
 * A center's colour is data (it is what lets the eye match a row to a chart line), but until
 * this module existed it was *stored* as a raw Tailwind hex and painted straight onto the DOM.
 * That bypassed the whole colour system: the eight hexes never moved with the six themes, and
 * two of them (#84cc16 at 1.98:1, #f59e0b at 2.15:1 against a light-mode card) sat below the
 * WCAG 1.4.11 3:1 floor for the 4px rails and bars that carry a row's only identity signal —
 * precisely the failure `useChartColors`'s luminance guard exists to catch, and which raw hex
 * routes around.
 *
 * So the stored value is now a SLOT, not a colour, and the colour is resolved at render time
 * from `useChartColors()`. The palette inherits the theme and the luminance guard for free.
 *
 * MIGRATION: existing documents hold the legacy hex. There is no backfill — `LEGACY_HEX_SLOTS`
 * maps each old hex to the slot at the same position in the old array, so a center keeps the
 * identity its owner chose while gaining theme-awareness. Unknown values (a hand-edited
 * document) fall through to the id-derived slot rather than throwing away the row's identity.
 */

/** Number of distinct identity slots offered by the picker. */
export const COST_CENTER_COLOR_SLOT_COUNT = 8;

/**
 * Persisted colour values. A slot key, not a colour — see the module header.
 * WARNING: if you add a slot here, also raise COST_CENTER_COLOR_SLOT_COUNT and add its label
 * to COLOR_LABELS in CostCenterDialog.tsx (those labels are what screen readers announce).
 */
export const COST_CENTER_COLOR_KEYS = [
  'chart-1',
  'chart-2',
  'chart-3',
  'chart-4',
  'chart-5',
  'chart-6',
  'chart-7',
  'chart-8',
] as const;

export type CostCenterColorKey = (typeof COST_CENTER_COLOR_KEYS)[number];

// The pre-token palette, in its original order. Index = the slot the hex now maps to.
const LEGACY_HEX_SLOTS: Record<string, number> = {
  '#3b82f6': 0,
  '#10b981': 1,
  '#f59e0b': 2,
  '#ef4444': 3,
  '#8b5cf6': 4,
  '#ec4899': 5,
  '#06b6d4': 6,
  '#84cc16': 7,
};

/**
 * Stable slot for a center that has no colour of its own.
 *
 * Derived from the document id rather than from the row's rank: rank moves with the period
 * axis, so a rank-derived fallback would repaint half the list every time the user switched
 * from Mese to Anno. FNV-1a — any cheap avalanche would do; what matters is that it is pure
 * and does not move.
 */
function slotFromId(id: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return Math.abs(hash) % COST_CENTER_COLOR_SLOT_COUNT;
}

/**
 * Resolves a center's persisted colour value to a palette slot index.
 *
 * Accepts a slot key, a legacy hex, or nothing; `id` supplies the deterministic fallback so
 * two uncoloured centers never collapse onto the same colour.
 */
export function resolveCostCenterColorSlot(stored: string | undefined | null, id: string): number {
  if (stored) {
    const keyIndex = (COST_CENTER_COLOR_KEYS as readonly string[]).indexOf(stored);
    if (keyIndex !== -1) return keyIndex;

    const legacySlot = LEGACY_HEX_SLOTS[stored.toLowerCase()];
    if (legacySlot !== undefined) return legacySlot;
  }
  return slotFromId(id);
}

/**
 * The CSS colour to paint for a center, resolved against the palette `useChartColors()`
 * returned for the active theme.
 *
 * `palette` is the hook's 10-entry array; it can be its static default on the first frame
 * after hydration, which is why the slot is clamped into range instead of trusting length.
 */
export function resolveCostCenterColor(
  stored: string | undefined | null,
  id: string,
  palette: string[],
): string {
  const slot = resolveCostCenterColorSlot(stored, id);
  return palette[slot % Math.max(1, palette.length)] ?? `var(--chart-${(slot % 5) + 1})`;
}

// ─── Who holds which slot ─────────────────────────────────────────────────────

/** What the occupancy rules read of a center: enough to know its slot and whether it is live. */
export interface ColoredCenter {
  id: string;
  name: string;
  color?: string | null;
  archivedAt?: unknown;
}

/**
 * Slot → the names of the ACTIVE centers painted with it, in the order given.
 *
 * An archived center is out of the list, the stack and the legend, so its colour is free to
 * reuse. `exceptId` leaves out the center being edited: its own slot is not «taken by another».
 */
export function mapColorSlotUsage(centers: ReadonlyArray<ColoredCenter>, exceptId?: string): Map<number, string[]> {
  const usage = new Map<number, string[]>();
  for (const center of centers) {
    if (center.archivedAt || center.id === exceptId) continue;
    const slot = resolveCostCenterColorSlot(center.color, center.id);
    usage.set(slot, [...(usage.get(slot) ?? []), center.name]);
  }
  return usage;
}

/**
 * A NEW center's colour: the first slot no active center holds.
 *
 * Until 2026-09-18 every new center was born on `chart-1`, so two centers created without
 * touching the picker were the same colour by construction — on the owner's account two cars
 * shared one blue in the swatch, the rank bar, the legend and two ADJACENT bands of the stack.
 * With all eight taken a collision is unavoidable: the least crowded slot, the lowest on a tie.
 * Existing documents are NOT re-coloured (the owner's call): a saved colour is a choice, and
 * a default never touched cannot be told from one.
 */
export function firstFreeColorKey(centers: ReadonlyArray<ColoredCenter>): CostCenterColorKey {
  const usage = mapColorSlotUsage(centers);
  let best = 0;
  for (let slot = 0; slot < COST_CENTER_COLOR_SLOT_COUNT; slot++) {
    const holders = usage.get(slot)?.length ?? 0;
    if (holders === 0) return COST_CENTER_COLOR_KEYS[slot];
    if (holders < (usage.get(best)?.length ?? 0)) best = slot;
  }
  return COST_CENTER_COLOR_KEYS[best];
}
