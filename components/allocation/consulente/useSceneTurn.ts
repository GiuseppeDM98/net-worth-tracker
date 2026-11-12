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
 *
 * Only the scene the turn RENDERS may take it (2026-11-12): every scene hands `focusTarget` the
 * `turn` it was rendered with, and a scene already on screen at the gesture — still sliding in, its
 * slide landing after the click — carries the turn before. Without that, «Avvia il colloquio»
 * pressed while the summary was still entering lost the focus: the summary's slide took it for its
 * own headline, which then left, and the interview's headline never got it.
 */
export function useSceneTurn<T extends HTMLElement>(target: RefObject<T | null>): {
  direction: 1 | -1;
  /** The count of turns: a scene passes the value it was rendered with to `focusTarget`. */
  turn: number;
  /** Remembers the focused element (or, with `always`, that the focus must move anyway), sets the direction, then runs `effect`. */
  move(toward: 1 | -1, effect: () => void, options?: { always?: boolean }): void;
  /** For `onAnimationComplete` of the scene rendered at `sceneTurn`: focuses `target` with `preventScroll` when that scene is the turn's, and `always` was asked, or the focus is still where the gesture left it, or on `body`. */
  focusTarget(sceneTurn: number): void;
} {
  const [direction, setDirection] = useState<1 | -1>(1);
  const [turn, setTurn] = useState(0);
  const pending = useRef<{ element: Element | null; always: boolean; turn: number } | null>(null);

  const move = (toward: 1 | -1, effect: () => void, options?: { always?: boolean }) => {
    pending.current = { element: document.activeElement, always: options?.always === true, turn: turn + 1 };
    setDirection(toward);
    setTurn(turn + 1);
    effect();
  };

  const focusTarget = (sceneTurn: number) => {
    const remembered = pending.current;
    if (remembered === null || sceneTurn !== remembered.turn) return;
    pending.current = null;
    const active = document.activeElement;
    if (remembered.always || active === remembered.element || active === document.body) target.current?.focus({ preventScroll: true });
  };

  return { direction, turn, move, focusTarget };
}
