/**
 * «Cosa è cambiato» (components/cashflow/analisi/tiles/CambiatoTile.tsx, 2026-11-12): the movers as
 * bars on a track centred on zero, a rise to the right, a fall to the left. Seen red on 2026-11-15 with
 * the bar mirrored (a fall drawn from the centre to the right).
 */

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { CategoryDeltaRow } from '@/lib/utils/comparisonDeltas';
import { summarizeCategoryChanges } from '@/lib/utils/analisiSummary';
import { CambiatoTile } from '@/components/cashflow/analisi/tiles/CambiatoTile';

const delta = (label: string, value: number, status: CategoryDeltaRow['status'] = 'ongoing'): CategoryDeltaRow => ({
  key: `variable:${label}`,
  expenseType: 'variable',
  categoryKey: `cat-${label.toLowerCase()}`,
  label,
  current: status === 'gone' ? 0 : 100 + value,
  previous: 100,
  delta: value,
  deltaPercent: value,
  status,
});

const CHANGES = summarizeCategoryChanges([delta('Casa', 40), delta('Palestra', -60, 'gone'), delta('Alimentari', -100)], -120);

describe('CambiatoTile', () => {
  it('P1: starts a rise at the centre and ends a fall there, each row a button named by its text', () => {
    const onSelect = vi.fn();
    const { container } = render(
      <CambiatoTile aside="su 2025" reading={null} changes={CHANGES} anomaliesReading={null} footer="Cessate: Palestra. Tutte le voci nel Confronto annuale." onSelect={onSelect} />,
    );
    const list = screen.getByRole('list', { name: 'Categorie che si sono mosse' });
    const buttons = within(list).getAllByRole('button');
    expect(buttons.map((button) => button.textContent?.replace(/ /g, ' ').replace(/\s+/g, ' ').trim())).toEqual(['Casa +40 €', 'Palestra cessata −60 €', 'Alimentari −100 €']);
    expect(screen.getByRole('button', { name: /^Palestra cessata −60\s€$/ })).toBeTruthy();

    const bars = [...container.querySelectorAll<HTMLElement>('[data-change-bar]')];
    const [rise, fall] = [bars[0], bars[2]];
    expect(parseFloat(rise.style.left)).toBe(50);
    expect(parseFloat(fall.style.left) + parseFloat(fall.style.width)).toBe(50);
    expect(rise.style.background).toBe('var(--destructive)');
    expect(fall.style.background).toBe('var(--positive)');

    fireEvent.click(buttons[2]);
    expect(onSelect).toHaveBeenCalledWith({ expenseType: 'variable', categoryKey: 'cat-alimentari' });
  });
});
