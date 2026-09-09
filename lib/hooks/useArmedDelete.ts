'use client';

import { useEffect, useState, type RefObject } from 'react';

/**
 * How many confirms are armed right now, across the whole tree.
 *
 * A modal reads it in `onEscapeKeyDown` to decide whether Escape means «disarm» or «close»
 * (see `ResponsiveModal`). It cannot be done from inside this hook: Radix's dismiss layer
 * registers its own document listener when the dialog MOUNTS, so it always runs before one
 * added later at arm time — capture phase included — and `stopPropagation` never reaches it.
 * Radix's own `onEscapeKeyDown` + `preventDefault` is the supported way to refuse a dismissal,
 * and that lives on the modal, not on the button.
 */
let armedConfirmCount = 0;

/** True while any two-click confirm is armed: Escape then means «disarm», not «close». */
export function hasArmedConfirm(): boolean {
  return armedConfirmCount > 0;
}

/**
 * Two-click delete without a timer (AGENTS.md → Accessibility): the first click arms, the
 * second deletes; a pointerdown anywhere else, Escape or blur disarms. Disarm happens before
 * delegating, because on success the row unmounts and nothing else would reset it. The
 * button's ref is an argument, never part of the returned object — a ref inside the return
 * value trips `react-hooks/refs` on every read of that object during render.
 */
export function useArmedDelete(ref: RefObject<HTMLButtonElement | null>, onDelete: () => void) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    armedConfirmCount += 1;
    const onPointerDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setArmed(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setArmed(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      armedConfirmCount = Math.max(0, armedConfirmCount - 1);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [armed, ref]);

  const onClick = () => {
    if (!armed) {
      setArmed(true);
      return;
    }
    setArmed(false);
    onDelete();
  };

  return { armed, onClick, onBlur: () => setArmed(false) };
}
