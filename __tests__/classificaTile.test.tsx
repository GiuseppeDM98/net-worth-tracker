/**
 * «Dove vanno i soldi» (components/cashflow/analisi/tiles/ClassificaTile.tsx, 2026-11-12): the spending
 * ring by type beside the category ranking, the ranking regrouped by subcategory on the aside's toggle.
 * Seen red on 2026-11-15, one mutation at a time: K1 with the ring at 120px, K2/K3 with the two views
 * swapped, K5 with a «senza sottocategoria» row selecting its subcategory key, with a reading per view,
 * with the rows' `swatch` dropped and with the ring drawn for one type.
 */

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { CategorySlice } from '@/lib/utils/cashflowComposition';
import type { SubCategorySlice, TypeShare } from '@/lib/utils/analisiSummary';
import { NO_SUBCATEGORY_KEY } from '@/types/expenses';
import { EXPENSE_TYPE_COLOR_VAR } from '@/lib/constants/expenseTypeColors';
import { ClassificaTile } from '@/components/cashflow/analisi/tiles/ClassificaTile';

const NBSP = / /g;
const text = (node: Element | null) => (node?.textContent ?? '').replace(NBSP, ' ');

const CATEGORIES: CategorySlice[] = [
  { key: 'fixed:cat-casa', name: 'Casa', value: 20000, percentage: 47.06, expenseType: 'fixed', categoryKey: 'cat-casa' },
  { key: 'variable:cat-cibo', name: 'Cibo', value: 17000, percentage: 40, expenseType: 'variable', categoryKey: 'cat-cibo' },
  { key: 'debt:cat-mutuo', name: 'Mutuo', value: 5500, percentage: 12.94, expenseType: 'debt', categoryKey: 'cat-mutuo' },
];

const SUBCATEGORIES: SubCategorySlice[] = [
  { key: 'variable:cat-cibo:__none__', name: 'Cibo', caption: 'senza sottocategoria', value: 17000, percentage: 40, expenseType: 'variable', categoryKey: 'cat-cibo', subCategoryKey: NO_SUBCATEGORY_KEY },
  { key: 'fixed:cat-casa:sub-cond', name: 'Condominio', caption: 'Casa', value: 12000, percentage: 28.24, expenseType: 'fixed', categoryKey: 'cat-casa', subCategoryKey: 'sub-cond' },
  { key: 'fixed:cat-casa:__none__', name: 'Casa', caption: 'senza sottocategoria', value: 8000, percentage: 18.82, expenseType: 'fixed', categoryKey: 'cat-casa', subCategoryKey: NO_SUBCATEGORY_KEY },
  { key: 'debt:cat-mutuo:__none__', name: 'Mutuo', caption: 'senza sottocategoria', value: 5500, percentage: 12.94, expenseType: 'debt', categoryKey: 'cat-mutuo', subCategoryKey: NO_SUBCATEGORY_KEY },
];

const TYPES: TypeShare[] = [
  { type: 'fixed', label: 'Necessarie', amount: 20000, percentage: 47.06, printedPercentage: 47 },
  { type: 'variable', label: 'Non necessarie', amount: 17000, percentage: 40, printedPercentage: 40 },
  { type: 'debt', label: 'Debiti', amount: 5500, percentage: 12.94, printedPercentage: 13 },
];

const READING = [{ text: 'Il 47% va in Casa; le spese necessarie sono la metà.' }];

function renderTile(overrides: Partial<Parameters<typeof ClassificaTile>[0]> = {}) {
  const onSelect = vi.fn();
  const utils = render(
    <ClassificaTile
      eyebrow="Dove vanno i soldi · 2026"
      ariaLabel="Dove vanno i soldi"
      categories={CATEGORIES}
      subCategories={SUBCATEGORIES}
      typeShares={TYPES}
      spending={42500}
      ringSize={150}
      reading={READING}
      activeKey={null}
      onSelect={onSelect}
      {...overrides}
    />,
  );
  return { ...utils, onSelect };
}

describe('ClassificaTile', () => {
  it('K1: draws the ring by type with its total abbreviated in the hole, and one legend row per type', () => {
    const { container } = renderTile();
    expect(text(container.querySelector('[data-ring-center="hole"]'))).toBe('42,5k €');
    expect(container.querySelector('svg[role="img"]')?.getAttribute('width')).toBe('150');
    const legend = screen.getByRole('list', { name: 'Spese per tipo' });
    expect(within(legend).getAllByRole('listitem').map((item) => text(item))).toEqual(['Necessarie47%', 'Non necessarie40%', 'Debiti13%']);
  });

  it('K2: regroups the ranking by subcategory, a subcategory captioned by its category', () => {
    renderTile();
    fireEvent.click(screen.getByRole('button', { name: 'Sottocategorie' }));
    const ranking = screen.getByRole('list', { name: 'Classifica delle spese' });
    expect(within(ranking).getByRole('button', { name: /^Condominio · Casa, / })).toBeTruthy();
  });

  it('K3: a subcategory row opens its subcategory, a category row its category', () => {
    const { onSelect } = renderTile();
    fireEvent.click(screen.getByRole('button', { name: /^Casa, / }));
    expect(onSelect).toHaveBeenLastCalledWith({ expenseType: 'fixed', categoryKey: 'cat-casa' });
    fireEvent.click(screen.getByRole('button', { name: 'Sottocategorie' }));
    fireEvent.click(screen.getByRole('button', { name: /^Condominio · Casa, / }));
    expect(onSelect).toHaveBeenLastCalledWith({ expenseType: 'fixed', categoryKey: 'cat-casa', subCategoryKey: 'sub-cond' });
  });

  it('K5: a row without a subcategory opens its CATEGORY, and the reading does not change with the view', () => {
    const { onSelect, container } = renderTile();
    const before = text(container.querySelector('section > p, section p'));
    fireEvent.click(screen.getByRole('button', { name: 'Sottocategorie' }));
    expect(text(container.querySelector('section > p, section p'))).toBe(before);
    fireEvent.click(screen.getByRole('button', { name: /^Cibo · senza sottocategoria, / }));
    const target = onSelect.mock.lastCall![0];
    expect(target).toEqual({ expenseType: 'variable', categoryKey: 'cat-cibo' });
    expect('subCategoryKey' in target).toBe(false);
  });

  it('K5: every ranking row carries ONE swatch, its type’s colour', () => {
    renderTile();
    const ranking = screen.getByRole('list', { name: 'Classifica delle spese' });
    const rows = within(ranking).getAllByRole('button');
    expect(rows).toHaveLength(3);
    const types = ['fixed', 'variable', 'debt'] as const;
    rows.forEach((row, index) => {
      const swatches = row.querySelectorAll('[aria-hidden="true"].h-2.w-2');
      expect(swatches).toHaveLength(1);
      expect((swatches[0] as HTMLElement).style.background).toBe(EXPENSE_TYPE_COLOR_VAR[types[index]]);
    });
  });

  // The void beside a longer «Spese maggiori» is filled with categories past the eighth (owner, 2026-11-23).
  // Seen red with `extraRows` unread, with one category left alone behind «Un'altra categoria» and with
  // the fill kept under «Mostra tutte».
  describe('the rows that fill the void', () => {
    const many = (count: number): CategorySlice[] =>
      Array.from({ length: count }, (_, index) => ({ key: `fixed:cat-${index}`, name: `Categoria ${index}`, value: 1000 - index * 10, percentage: 5, expenseType: 'fixed', categoryKey: `cat-${index}` }));
    const ranking = () => screen.getByRole('list', { name: 'Classifica delle spese' });

    it('shows eight categories and the rest in one row when it is handed none', () => {
      const { container } = renderTile({ categories: many(23) });
      expect(within(ranking()).getAllByRole('button')).toHaveLength(8);
      expect(text(ranking())).toContain('Altre 15 categorie');
      const body = container.querySelector('[data-fill-body]');
      expect(body?.getAttribute('data-fill-extra')).toBe('0');
      // Twenty-three rows at most, nine drawn: fourteen more.
      expect(body?.getAttribute('data-fill-room')).toBe('14');
      expect(container.querySelector('[data-fill-list] ul')).toBe(ranking());
      expect(container.querySelector('[data-fill-foot]')).not.toBeNull();
    });

    it('shows the extra categories it is handed, the rest still summed in one row', () => {
      const { container } = renderTile({ categories: many(23), extraRows: 5 });
      expect(within(ranking()).getAllByRole('button')).toHaveLength(13);
      expect(text(ranking())).toContain('Altre 10 categorie');
      expect(container.querySelector('[data-fill-body]')?.getAttribute('data-fill-extra')).toBe('5');
      expect(screen.getByRole('button', { name: /Mostra tutte \(23\)/ })).toBeTruthy();
    });

    it('never leaves one category alone behind the remainder: its row takes the remainder’s place', () => {
      renderTile({ categories: many(12), extraRows: 9 });
      // Room for three rows more: 8 + 3 and the twelfth in the remainder's row.
      expect(within(ranking()).getAllByRole('button')).toHaveLength(12);
      expect(text(ranking())).not.toMatch(/altr/i);
      expect(screen.queryByRole('button', { name: /Mostra/ })).toBeNull();
    });

    it('hands the fill back under «Mostra tutte»', () => {
      const { container } = renderTile({ categories: many(23), extraRows: 5 });
      fireEvent.click(screen.getByRole('button', { name: /Mostra tutte \(23\)/ }));
      expect(within(ranking()).getAllByRole('button')).toHaveLength(23);
      const body = container.querySelector('[data-fill-body]');
      expect(body?.getAttribute('data-fill-extra')).toBe('0');
      expect(body?.getAttribute('data-fill-room')).toBe('0');
      fireEvent.click(screen.getByRole('button', { name: /Mostra meno/ }));
      expect(within(ranking()).getAllByRole('button')).toHaveLength(13);
    });
  });

  it('K5: with ONE type no ring is drawn, the total stands as the column’s hero line', () => {
    const { container } = renderTile({
      categories: [CATEGORIES[0]],
      subCategories: [SUBCATEGORIES[2]],
      typeShares: [{ ...TYPES[0], amount: 2000, percentage: 100, printedPercentage: 100 }],
      spending: 2000,
    });
    expect(container.querySelector('[role="img"]')).toBeNull();
    expect(container.querySelector('[data-ring]')).toBeNull();
    expect(text(container.querySelector('[data-classifica-total]'))).toBe('2000 €');
    expect(container.querySelector('[data-classifica-total]')?.parentElement?.textContent).toContain('spese');
  });
});
