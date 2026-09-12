import { runViewTransition } from '@/lib/utils/viewTransition';

/**
 * The theme toggle's circle reveal: the new theme spreads from the button that was pressed
 * (`--vt-cx/--vt-cy/--vt-r` feed the `vt-reveal` keyframes in `globals.css`, scoped to
 * `html[data-vt="theme"]`). Without the View Transitions API the theme simply switches.
 */
export function applyThemeWithTransition(
  value: string,
  e: React.MouseEvent,
  setTheme: (t: string) => void
) {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const cx = Math.round(rect.left + rect.width / 2);
  const cy = Math.round(rect.top + rect.height / 2);
  const maxR = Math.hypot(
    Math.max(cx, window.innerWidth - cx),
    Math.max(cy, window.innerHeight - cy)
  );
  const root = document.documentElement;
  root.style.setProperty('--vt-cx', `${cx}px`);
  root.style.setProperty('--vt-cy', `${cy}px`);
  root.style.setProperty('--vt-r', `${Math.ceil(maxR)}px`);
  void runViewTransition('theme', () => setTheme(value));
}
