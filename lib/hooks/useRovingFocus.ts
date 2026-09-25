import { useState, type KeyboardEvent } from 'react';

/** The attribute that marks an item of a roving group; the container finds its items through it. */
export const ROVING_ITEM_ATTRIBUTE = 'data-roving-item';

/**
 * Roving tabindex for a LIST of same-kind controls — one Tab stop for the group, the arrows move
 * inside it (WAI-ARIA APG → «Managing focus within components»).
 *
 * Why: a table of 24 row checkboxes put 24 Tab stops between a keyboard reader and everything
 * after it — «Dettaglio» sat ~55 Tabs from the top of Storico (measured 2026-09-20). A list the
 * reader can LEAVE with one Tab costs one stop, whatever its length.
 *
 * The items are found in the DOM through `data-roving-item`, from the container the key event
 * bubbles to: the hook hands out no ref (`react-hooks/refs`: an object read during render must
 * not carry one). Spread `containerProps` on the element that wraps the items and `itemProps(i)`
 * on each of them, `i` being the item's position among the rendered ones.
 *
 * @param count How many items are rendered; the active index is clamped to it, so a list that
 *   shrinks (a month with fewer instruments) never leaves the group without a Tab stop.
 * @param orientation Which arrows move inside the group. A list of rows reads vertically; a row of
 *   toggle buttons reads horizontally, and the APG maps each to its own axis. `'both'` is for a
 *   group whose items wrap onto several lines, where either axis is a reasonable guess.
 */
export function useRovingFocus(count: number, orientation: 'vertical' | 'horizontal' | 'both' = 'vertical') {
  const [active, setActive] = useState(0);
  const current = count === 0 ? 0 : Math.min(active, count - 1);
  const forward = orientation === 'horizontal' ? ['ArrowRight'] : orientation === 'vertical' ? ['ArrowDown'] : ['ArrowRight', 'ArrowDown'];
  const backward = orientation === 'horizontal' ? ['ArrowLeft'] : orientation === 'vertical' ? ['ArrowUp'] : ['ArrowLeft', 'ArrowUp'];

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (!target.hasAttribute(ROVING_ITEM_ATTRIBUTE)) return;
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(`[${ROVING_ITEM_ATTRIBUTE}]`));
    const index = items.indexOf(target);
    if (index === -1) return;
    const next =
      forward.includes(event.key) ? Math.min(index + 1, items.length - 1)
      : backward.includes(event.key) ? Math.max(index - 1, 0)
      : event.key === 'Home' ? 0
      : event.key === 'End' ? items.length - 1
      : null;
    if (next === null) return;
    // The arrows would otherwise scroll the page under the list.
    event.preventDefault();
    items[next].focus();
    setActive(next);
  };

  return {
    containerProps: { onKeyDown },
    itemProps: (index: number) => ({
      [ROVING_ITEM_ATTRIBUTE]: '',
      tabIndex: index === current ? 0 : -1,
      // A click (or a screen reader's own navigation) lands on a row: the Tab stop follows it.
      onFocus: () => setActive(index),
    }),
  };
}
