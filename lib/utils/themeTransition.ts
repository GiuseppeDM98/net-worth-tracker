export function applyThemeWithTransition(
  value: string,
  e: React.MouseEvent,
  setTheme: (t: string) => void
) {
  if (!('startViewTransition' in document)) {
    setTheme(value);
    return;
  }
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
  document.startViewTransition(() => setTheme(value));
}
