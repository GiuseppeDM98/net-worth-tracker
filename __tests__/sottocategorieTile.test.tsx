/**
 * `SottocategorieTile` (components/cashflow/cost-centers/tiles/SottocategorieTile.tsx): with a `ring` the
 * subcategories still counted are a ring beside the toggle rows (The Ring Rule; the owner on the mirror tour,
 * 2026-11-15), the net total in its hole — «in tutto» while nothing is excluded, «al netto» after — each
 * counted row led by its arc's swatch, an excluded row with none; without a ring, today's bars. Figures
 * invented and round. Seen red on 2026-11-15 with the swatch on every row, excluded ones included.
 */

import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('@/lib/utils/authFetch', () => ({ authenticatedFetch: vi.fn() }));
vi.mock('@/lib/services/dashboardOverviewInvalidation', () => ({ invalidateDashboardOverviewSummary: vi.fn() }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), getDoc: vi.fn(), setDoc: vi.fn(), deleteField: vi.fn() }));
import { SottocategorieTile } from '@/components/cashflow/cost-centers/tiles/SottocategorieTile';
import { subCategoryRingSegments } from '@/lib/utils/costCenterSummary';

const slice = (key: string, name: string, total: number) => ({ key, subCategoryName: name, categoryName: 'Auto', total, transactionCount: 1 });
const SLICES = [slice('man', 'Manutenzione', 500), slice('car', 'Carburante', 300), slice('ass', 'Assicurazione', 200)];

function renderTile(excluded: string[]) {
  const excludedKeys = new Set(excluded);
  const netTotal = SLICES.filter((s) => !excludedKeys.has(s.key)).reduce((sum, s) => sum + s.total, 0);
  return render(
    <SottocategorieTile
      slices={SLICES}
      excludedKeys={excludedKeys}
      netTotal={netTotal}
      ring={subCategoryRingSegments(SLICES, excludedKeys)}
      aside={null}
      reading={[{ text: 'lettura' }]}
      footer={[{ text: 'nota' }]}
      color="var(--chart-1)"
      onToggle={() => undefined}
      onReset={() => undefined}
    />,
  );
}

const swatchesOf = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>('li')).map((li) => li.querySelector<HTMLElement>('[data-swatch]')?.style.background ?? null);

describe('SottocategorieTile', () => {
  it('K4: a ring of the counted subcategories, «in tutto» in its hole, a swatch per row', () => {
    const { container } = renderTile([]);
    expect(container.querySelector('[data-ring] svg')?.getAttribute('aria-label')).toMatch(
      /^Per sottocategoria: Manutenzione 50%, Carburante 30%, Assicurazione 20%; in tutto 1000/,
    );
    expect(swatchesOf(container)).toEqual(['var(--chart-2)', 'var(--chart-7)', 'var(--chart-6)']);
  });

  it('K4: an excluded row leaves the ring and loses its swatch; the hole reads «al netto»', () => {
    const { container } = renderTile(['car']);
    expect(container.querySelector('[data-ring] svg')?.getAttribute('aria-label')).toMatch(
      /^Per sottocategoria: Manutenzione 71%, Assicurazione 29%; al netto 700/,
    );
    expect(swatchesOf(container)).toEqual(['var(--chart-2)', null, 'var(--chart-7)']);
  });

  it('K4: one row left counted — no ring, today\'s bars', () => {
    const { container } = renderTile(['car', 'ass']);
    expect(container.querySelector('[data-ring]')).toBeNull();
    expect(swatchesOf(container)).toEqual([null, null, null]);
  });
});
