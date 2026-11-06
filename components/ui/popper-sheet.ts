'use client';

/**
 * A popper opened below `desktop:` is a bottom sheet (owner, 2026-11-06).
 *
 * The Radix poppers — `Select`, `DropdownMenu`, and the `Popover`s that PICK something — float a
 * small list beside their trigger. On a phone that list sits under the thumb, half off-screen when
 * the trigger is low, with 32px rows: the owner asked for every dropdown to open «in a separate
 * window». Below the width at which `ResponsiveModal` is already a drawer (768px, so a dropdown
 * inside a drawer is always a sheet) the content keeps its Radix anatomy — keyboard, typeahead,
 * focus return, dismiss on outside press — and only its PLACE changes: `data-popper-sheet` on the
 * content, and `app/globals.css` (§ Popper sheet) pins Radix's popper wrapper to the bottom edge,
 * draws the backdrop and animates the rise. Nothing of this touches a desktop.
 *
 * The threshold is the modal's and lives here once: a second copy would let a sheet open over a
 * centred dialog, or a floating list inside a drawer.
 */

import { useMediaQuery } from '@/lib/hooks/useMediaQuery';

/** The same width at which `ResponsiveModal` becomes a drawer. */
export const POPPER_SHEET_QUERY = '(max-width: 768px)';

/** Whether a popper opened now is a bottom sheet. `false` on the server and during hydration. */
export function usePopperSheet(): boolean {
  return useMediaQuery(POPPER_SHEET_QUERY);
}
