'use client';

import { useRef, useState, type RefObject } from 'react';

/**
 * The turn of a scene (DESIGN.md → The Path-Scene Rule): where the next screen comes from, and the
 * focus after it lands. Shared by the path's Wizard and the report's book (2026-11-08) — a stateful
 * hook with a focus side effect is extracted at its second use, because two copies that drift
 * would be a behaviour bug.
 *
 * The direction is STATE set by the gesture, never a ref read during render (the React Compiler
 * would skip the component). `pending` is a ref written in `move` and read in `focusTarget` only;
 * the hook RECEIVES the target's ref and returns none (`react-hooks/refs`).
 *
 * After the slide the target takes the focus only when the focus still sits where the gesture
 * left it, or on `body` (the pressed button unmounted with the screen that left): a reader who
 * already tapped a field keeps it. `always` moves it anyway (a row of a modal that closed).
 */
export function useSceneTurn<T extends HTMLElement>(target: RefObject<T | null>): {
  direction: 1 | -1;
  /** Remembers the focused element (or, with `always`, that the focus must move anyway), sets the direction, then runs `effect`. */
  move(toward: 1 | -1, effect: () => void, options?: { always?: boolean }): void;
  /** For `onAnimationComplete`: focuses `target` with `preventScroll` when `always` was asked, or the focus is still where the gesture left it, or on `body`. */
  focusTarget(): void;
} {
  const [direction, setDirection] = useState<1 | -1>(1);
  const pending = useRef<{ element: Element | null; always: boolean } | null>(null);

  const move = (toward: 1 | -1, effect: () => void, options?: { always?: boolean }) => {
    pending.current = { element: document.activeElement, always: options?.always === true };
    setDirection(toward);
    effect();
  };

  const focusTarget = () => {
    const remembered = pending.current;
    if (remembered === null) return;
    pending.current = null;
    const active = document.activeElement;
    if (remembered.always || active === remembered.element || active === document.body) target.current?.focus({ preventScroll: true });
  };

  return { direction, move, focusTarget };
}
