/**
 * `SearchableCombobox` (components/ui/searchable-combobox.tsx) on a desktop: a blur followed by a
 * focus within the blur's 200 ms delay keeps the field focused (2026-11-19). A dialog focuses the
 * field at open, a click on its submit blurs it and a refused submit focuses it back at once: the
 * blur's pending close then fired after the refocus, the component read the field as unfocused
 * while the browser held the focus, and what was typed opened no list — the intermittent red of
 * `e2e/cashflow.dividendi.spec.ts` «the form refuses…» (2026-09-30, 2026-11-03, 2026-11-16,
 * 2026-11-19). Seen red with `handleFocus` not clearing the pending blur. Invented options.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { SearchableCombobox } from '@/components/ui/searchable-combobox';

const OPTIONS = [
  { value: 'a', label: 'ORNI - ETF ornitorinco' },
  { value: 'b', label: 'FENI - BTP fenicottero' },
];

function renderCombobox() {
  render(
    <SearchableCombobox
      id="strumento"
      label="Strumento"
      options={OPTIONS}
      value=""
      onValueChange={() => {}}
      placeholder="Scegli"
      searchPlaceholder="Cerca"
    />,
  );
  return document.getElementById('strumento') as HTMLInputElement;
}

describe('SearchableCombobox, a refocus inside the blur delay', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('stays focused: the pending blur does not close it after the field is focused again', () => {
    const input = renderCombobox();
    fireEvent.focus(input);
    fireEvent.blur(input);
    fireEvent.focus(input);
    act(() => { vi.advanceTimersByTime(250); });

    fireEvent.change(input, { target: { value: 'BTP' } });
    expect(input.placeholder).toBe('Cerca');
    expect(screen.queryByRole('button', { name: /BTP fenicottero/ })).not.toBeNull();
  });

  it('a blur with no refocus still closes the list after its delay', () => {
    const input = renderCombobox();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'ETF' } });
    expect(screen.queryByRole('button', { name: /ETF ornitorinco/ })).not.toBeNull();
    fireEvent.blur(input);
    act(() => { vi.advanceTimersByTime(250); });
    expect(screen.queryByRole('button', { name: /ETF ornitorinco/ })).toBeNull();
  });
});
