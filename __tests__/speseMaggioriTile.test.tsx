/**
 * «Spese maggiori» (components/cashflow/analisi/tiles/SpeseMaggioriTile.tsx, 2026-11-12): ten rows,
 * «Mostra altre N» up to twenty, the aside counting what is shown. Seen red on 2026-11-15 with the
 * aside reading `top.rows.length` instead of the rows shown.
 */

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { TopExpenseRow, TopExpenses } from '@/lib/utils/analisiSummary';
import { narrativeToText } from '@/lib/utils/narrative';
import { SpeseMaggioriTile } from '@/components/cashflow/analisi/tiles/SpeseMaggioriTile';

// The reading's module reaches the chart service, which reaches the Firebase client.
vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));

const row = (index: number): TopExpenseRow => ({
  key: `e${index}`,
  label: 'Casa',
  note: index === 0 ? 'Caldaia nuova' : null,
  subCategoryLabel: null,
  caption: index === 0 ? 'Casa · 14 mar' : '14 mar',
  scheduled: false,
  amount: 1000 - index * 50,
  percentage: 5,
  expenseType: 'fixed',
  categoryKey: 'cat-casa',
  subCategoryKey: null,
});

const top = (count: number): TopExpenses => {
  const rows = Array.from({ length: count }, (_, index) => row(index));
  return { rows, shownTotal: rows.reduce((sum, r) => sum + r.amount, 0), total: 20000, count };
};

const asideOf = (container: HTMLElement) => container.querySelector('section > div > div')?.textContent;

describe('SpeseMaggioriTile', () => {
  it('shows ten of fourteen, unfolds to fourteen, and labels a row by its note', () => {
    const { container } = render(<SpeseMaggioriTile top={top(14)} onSelect={vi.fn()} />);
    const list = screen.getByRole('list', { name: 'Spese maggiori del periodo' });
    expect(within(list).getAllByRole('button')).toHaveLength(10);
    expect(asideOf(container)).toBe('10 di 14');
    expect(narrativeToText([...(container.querySelectorAll('section > p') ?? [])].map((p) => ({ text: p.textContent ?? '' })))).toContain('Le dieci più grandi');
    expect(within(list).getByRole('button', { name: /^Caldaia nuova · Casa · 14 mar, / })).toBeTruthy();

    const more = screen.getByRole('button', { name: /Mostra altre 4/ });
    expect(more.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(more);
    expect(within(list).getAllByRole('button')).toHaveLength(14);
    expect(screen.getByRole('button', { name: /Mostra meno/ }).getAttribute('aria-expanded')).toBe('true');
    expect(asideOf(container)).toBe('14 di 14');
  });

  // Two lines per row (owner, 2026-11-15, the mirror tour): the label beside the amount and the share on
  // the first, the caption beside the bar on the second, so a long note is not cut to share a 46%
  // column with its caption. Seen red with the rows left in RankedRows' inline layout.
  it('lays a row on two lines: label, amount and share; then the caption and the bar', () => {
    render(<SpeseMaggioriTile top={top(3)} onSelect={vi.fn()} />);
    const button = within(screen.getByRole('list', { name: 'Spese maggiori del periodo' })).getAllByRole('button')[0];
    const head = button.querySelector('[data-ranked-line="head"]');
    const sub = button.querySelector('[data-ranked-line="caption"]');
    expect(head?.textContent).toMatch(/^Caldaia nuova1000\s€5%$/);
    expect(sub?.textContent).toBe('Casa · 14 mar');
    expect(sub?.querySelector('[role="presentation"]')).not.toBeNull();
  });

  it('has no toggle when every row is shown', () => {
    render(<SpeseMaggioriTile top={top(7)} onSelect={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Mostra/ })).toBeNull();
  });
});
