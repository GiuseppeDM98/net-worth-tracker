/**
 * «Entrate» (components/cashflow/analisi/tiles/EntrateTile.tsx, 2026-11-12): a ring of the first three
 * income categories and «Altre N categorie», its legend adding up to 100 on screen. Seen red on
 * 2026-11-15 with «Mostra tutte» still listing only the head.
 */

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { CategorySlice } from '@/lib/utils/cashflowComposition';
import { EntrateTile } from '@/components/cashflow/analisi/tiles/EntrateTile';

const slice = (name: string, value: number): CategorySlice => ({ key: `income:${name}`, name, value, percentage: 0, expenseType: 'income', categoryKey: name });
const SLICES = [slice('Stipendio', 700), slice('Dividendi', 700), slice('Affitti', 700), slice('Rimborsi', 100), slice('Regali', 100)];

function renderTile(slices = SLICES) {
  const onSelect = vi.fn();
  const utils = render(
    <EntrateTile slices={slices} total={slices.reduce((sum, s) => sum + s.value, 0)} reading={null} activeKey={null} onSelect={onSelect} />,
  );
  return { ...utils, onSelect };
}

const shareOf = (item: HTMLElement) => Number(/(\d+)%\s*$/.exec(item.textContent ?? '')?.[1]);

describe('EntrateTile', () => {
  it('K4: prints shares that add up to 100, and unfolds to every category with the ring still drawn', () => {
    const { container, onSelect } = renderTile();
    const legend = screen.getByRole('list', { name: 'Entrate per categoria' });
    const items = within(legend).getAllByRole('listitem');
    expect(items).toHaveLength(4);
    expect(items[3].textContent).toContain('Altre 2 categorie');
    expect(items.map(shareOf).reduce((sum, share) => sum + share, 0)).toBe(100);

    fireEvent.click(screen.getByRole('button', { name: /Mostra tutte \(5\)/ }));
    const all = within(screen.getByRole('list', { name: 'Entrate per categoria' })).getAllByRole('listitem');
    expect(all.map((item) => item.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('Rimborsi'), expect.stringContaining('Regali')]));
    expect(all).toHaveLength(5);
    expect(all.map(shareOf).reduce((sum, share) => sum + share, 0)).toBe(100);
    expect(container.querySelector('[data-ring]')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /^Rimborsi, / }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ categoryKey: 'Rimborsi', expenseType: 'income' }));
  });

  it('draws no ring for one category: the total is the hero line', () => {
    const { container } = renderTile([slice('Stipendio', 2500)]);
    expect(container.querySelector('[data-ring]')).toBeNull();
    expect((container.querySelector('[data-entrate-total]')?.textContent ?? '').replace(/ /g, ' ')).toBe('2500 €');
  });

  it('says so when nothing came in', () => {
    renderTile([]);
    expect(screen.getByText('Nessuna entrata registrata nel periodo.')).toBeTruthy();
  });
});
