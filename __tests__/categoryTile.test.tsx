/**
 * `CategoryTile` (components/dashboard/overview/CategoryTile.tsx): with a `ring` (Tracciamento's
 * income, The Ring Rule, 2026-11-12) the rows are its legend, each swatch its OWN part's colour read
 * by key — never the rank's slot — and the residual in the fold's ink. Figures invented and round.
 */

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { CategoryTile } from '@/components/dashboard/overview/CategoryTile';
import { RING_REST_COLOR, RING_REST_KEY, type RingSegment } from '@/lib/utils/ringChart';

const CATEGORIES = [
  { category: 'Stipendio', categoryKey: 'cat-stipendio', amount: 3000, percentage: 75 },
  { category: 'Affitto', categoryKey: 'cat-affitto', amount: 500, percentage: 12.5 },
];

// Colours deliberately out of rank order: a swatch read by index would wear the wrong one.
const RING: RingSegment[] = [
  { key: 'cat-stipendio', label: 'Stipendio', value: 3000, color: 'var(--chart-8)' },
  { key: 'cat-affitto', label: 'Affitto', value: 500, color: 'var(--chart-3)' },
  { key: RING_REST_KEY, label: 'Altre categorie', value: 500, color: RING_REST_COLOR },
];

describe('CategoryTile', () => {
  it('T2: gives each row its key’s colour and the residual the fold’s', () => {
    const { container } = render(
      <CategoryTile
        eyebrow="Entrate per categoria"
        total={4000}
        categories={CATEGORIES}
        color="var(--chart-2)"
        emptyCopy="Nessuna entrata registrata nel periodo."
        ring={RING}
        ringCenterLabel="entrate"
      />,
    );
    expect(container.querySelector('[data-ring]')).not.toBeNull();
    const swatches = Array.from(container.querySelectorAll<HTMLElement>('li [aria-hidden="true"].h-2.w-2'));
    expect(swatches.map((swatch) => swatch.style.background)).toEqual(['var(--chart-8)', 'var(--chart-3)', RING_REST_COLOR]);
  });

  it('keeps the bars without a ring', () => {
    const { container } = render(
      <CategoryTile
        eyebrow="Spese per categoria"
        total={4000}
        categories={CATEGORIES}
        color="var(--chart-1)"
        emptyCopy="Nessuna spesa registrata nel periodo."
      />,
    );
    expect(container.querySelector('[data-ring]')).toBeNull();
    expect(container.querySelectorAll('[role="presentation"]')).toHaveLength(2);
  });
});
