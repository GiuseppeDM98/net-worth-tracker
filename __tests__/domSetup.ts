/**
 * The setup of the `dom` project (vitest.config.ts, 2026-11-07): what every `.test.tsx` needs and
 * jsdom does not give. Not a `.test.*` file, so no project collects it as a suite.
 *
 * - `afterEach(cleanup)`: Vitest runs without globals, so Testing Library cannot register its own
 *   cleanup and a rendered tree would leak into the next test.
 * - `ResizeObserver`: Radix measures the hidden input of a radio or a checkbox with it when the
 *   control sits inside a form; jsdom has none.
 * - `window.matchMedia`: framer's `useReducedMotion` and `useCountUp` read it; the stub answers
 *   `matches: false`. A test that wants reduced motion replaces it before rendering.
 */
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(cleanup);

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

if (typeof window.ResizeObserver === 'undefined') {
  window.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}

if (typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}
