/**
 * The `transform-origin` that makes a centred dialog grow from the control that opened it.
 *
 * It is resolved from the TRIGGER alone, at click time, so it is on the dialog from its first
 * frame. The older recipe measured the dialog's own rect one animation frame after it mounted
 * and only then set the origin — and since the dialog's `duration-200` leaves
 * `transition-property` at its default `all`, the origin did not jump: it GLIDED from the
 * centre to the trigger across the whole zoom (14 distinct values in 200 ms, measured on
 * Panoramica's snapshot confirm on 2026-09-18), so the panel scaled around a moving pivot and
 * drifted diagonally.
 *
 * No measurement of the dialog is needed: `DialogContent` is centred on the viewport
 * (`top-50% left-50%` + `translate(-50%, -50%)`), so its centre is (50vw, 50vh) whatever its
 * size, and a point of the viewport, in the dialog's own box, is `50% + (point − 50v*)`.
 */
export interface TriggerRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function resolveCenteredModalOrigin(trigger: TriggerRect): string {
  const x = round(trigger.left + trigger.width / 2);
  const y = round(trigger.top + trigger.height / 2);
  return `calc(50% + ${x}px - 50vw) calc(50% + ${y}px - 50vh)`;
}

/** Sub-pixel noise from `getBoundingClientRect` has no business in a style string. */
function round(value: number): number {
  return Math.round(value * 10) / 10;
}
