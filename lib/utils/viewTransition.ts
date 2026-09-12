/**
 * The ONE entry to the browser's View Transitions API for the app's two scenes.
 *
 * Two things use a view transition: the theme toggle (a circle reveal from the button) and,
 * since 2026-09-12, a navigation between two dashboard pages (the page that is left fades out of
 * the main region while the next one settles in, the verdict and the header morphing in place).
 * The two must never share a stylesheet: the `::view-transition-*` rules in `globals.css` are
 * scoped by the `data-vt` attribute this module stamps on `<html>` for the length of the
 * transition, so the theme's clip-path never runs on a navigation nor the navigation's fade on
 * a theme change.
 *
 * Browsers without the API, and readers who asked the OS for less motion, run the update
 * unanimated — the navigation itself never depends on the scene playing.
 */

export type ViewTransitionKind = 'theme' | 'page';

/** The attribute the stylesheet keys its scenes on. */
export const VIEW_TRANSITION_ATTRIBUTE = 'data-vt';

export function supportsViewTransition(): boolean {
  return typeof document !== 'undefined' && 'startViewTransition' in document;
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Runs `update` inside a view transition of the given kind, or plainly when the API is missing or
 * motion is reduced. The returned promise settles when the DOM update is done — never when the
 * animation is, so a caller can chain on the new state at once.
 */
export function runViewTransition(kind: ViewTransitionKind, update: () => void | Promise<void>): Promise<void> {
  if (!supportsViewTransition() || prefersReducedMotion()) {
    return Promise.resolve(update());
  }
  const root = document.documentElement;
  root.setAttribute(VIEW_TRANSITION_ATTRIBUTE, kind);
  const transition = document.startViewTransition(() => update());
  // `finished` settles after the animation, success or skip alike; the attribute leaves with it.
  transition.finished.finally(() => {
    if (root.getAttribute(VIEW_TRANSITION_ATTRIBUTE) === kind) root.removeAttribute(VIEW_TRANSITION_ATTRIBUTE);
  });
  return transition.updateCallbackDone;
}
