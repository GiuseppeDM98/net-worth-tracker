/**
 * A glide to an element (owner, 2026-11-15, the mirror tour of Analisi «Classifica»: the Scheda reached «non troppo
 * lenta, ma neanche istantaneamente»). The browser's own `behavior: 'smooth'` picks its duration by
 * distance and engine; this one is 450 ms on the app's ease-out-quart (`lib/utils/motionVariants.ts`)
 * whatever the distance. Reduced motion jumps. The math is pure; `glideIntoView` is the thin DOM part.
 */

export const SCROLL_GLIDE_MS = 450;

/** ease-out-quart: most of the way early, a soft landing. */
export function easeOutQuart(t: number): number {
  return 1 - (1 - t) ** 4;
}

/** The scroll offset `elapsed` ms into a glide from `from` to `to`; the target once the glide is over. */
export function glideOffset(from: number, to: number, elapsed: number): number {
  if (elapsed >= SCROLL_GLIDE_MS) return to;
  return from + (to - from) * easeOutQuart(Math.max(0, elapsed) / SCROLL_GLIDE_MS);
}

/** Where the container must scroll so the element's top meets its own top less the scroll margin. */
export function scrollTargetTop({
  scrollTop,
  containerTop,
  elementTop,
  scrollMarginTop,
  maxScroll,
}: {
  scrollTop: number;
  containerTop: number;
  elementTop: number;
  scrollMarginTop: number;
  maxScroll: number;
}): number {
  return Math.min(maxScroll, Math.max(0, scrollTop + elementTop - containerTop - scrollMarginTop));
}

/**
 * Where the container must scroll to CENTRE the element — the way back to a row, which reads as a row
 * in its context, not as the top of the page; the current offset when the element is wholly in view.
 */
export function glideTargetTop({
  scrollTop,
  containerTop,
  containerHeight,
  elementTop,
  elementHeight,
  maxScroll,
}: {
  scrollTop: number;
  containerTop: number;
  containerHeight: number;
  elementTop: number;
  elementHeight: number;
  maxScroll: number;
}): number {
  const top = elementTop - containerTop;
  if (top >= 0 && top + elementHeight <= containerHeight) return scrollTop;
  return Math.min(maxScroll, Math.max(0, scrollTop + top - (containerHeight - elementHeight) / 2));
}

/** The nearest ancestor that scrolls vertically, else the document's scroller. */
function scrollParent(element: HTMLElement): HTMLElement {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) return node;
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}

/**
 * Glides the element into view: its top to the container's (`'start'`, its `scroll-margin-top`
 * honoured) or centred, and not at all when already in view (`'center'`). Jumps under reduced motion.
 */
export function glideIntoView(element: HTMLElement, block: 'start' | 'center' = 'start'): Promise<void> {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    element.scrollIntoView({ behavior: 'instant', block: block === 'center' ? 'nearest' : 'start' });
    return Promise.resolve();
  }
  const container = scrollParent(element);
  const isDocument = container === document.scrollingElement || container === document.documentElement;
  const from = container.scrollTop;
  const containerTop = isDocument ? 0 : container.getBoundingClientRect().top;
  const box = element.getBoundingClientRect();
  const maxScroll = container.scrollHeight - container.clientHeight;
  const to =
    block === 'center'
      ? glideTargetTop({ scrollTop: from, containerTop, containerHeight: container.clientHeight, elementTop: box.top, elementHeight: box.height, maxScroll })
      : scrollTargetTop({
          scrollTop: from,
          containerTop,
          elementTop: box.top,
          scrollMarginTop: parseFloat(getComputedStyle(element).scrollMarginTop) || 0,
          maxScroll,
        });
  if (Math.abs(to - from) < 1) return Promise.resolve();
  const start = performance.now();
  // Resolves when the glide lands: the caller may change the page only then (the Scheda's way back).
  return new Promise((resolve) => {
    const step = (now: number) => {
      const elapsed = now - start;
      container.scrollTop = glideOffset(from, to, elapsed);
      if (elapsed < SCROLL_GLIDE_MS) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

/** The entry beside the glide: 8px up and in over 200 ms, landing with it. Nothing under reduced motion. */
export const RISE_IN_MS = 200;

export function riseIn(element: HTMLElement): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || typeof element.animate !== 'function') return;
  element.animate(
    [
      { opacity: 0, transform: 'translateY(8px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ],
    { duration: RISE_IN_MS, delay: SCROLL_GLIDE_MS - RISE_IN_MS, easing: 'cubic-bezier(0.25, 1, 0.5, 1)', fill: 'backwards' },
  );
}
