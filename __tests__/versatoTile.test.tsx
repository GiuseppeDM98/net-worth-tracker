/**
 * `VersatoTile` (components/pension/tiles/VersatoTile.tsx): with two natures or more the rows are a
 * ring's legend (The Ring Rule, 2026-11-12), with one the ranked rows keep their bar.
 * Figures invented and round. Seen red on 2026-11-15 with the bars drawn while `ring` is set.
 */

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { VersatoTile } from '@/components/pension/tiles/VersatoTile';
import { NATURE_RING_COLORS, type VersatoRow } from '@/lib/utils/pensionSummary';
import type { RingSegment } from '@/lib/utils/ringChart';

const ROWS: VersatoRow[] = [
  { nature: 'voluntary', label: 'Volontario', amount: 2000, percentage: 50, deductible: true },
  { nature: 'tfr', label: 'TFR', amount: 1500, percentage: 37.5, deductible: false },
  { nature: 'employer', label: 'Datoriale', amount: 500, percentage: 12.5, deductible: true },
];

const RING: RingSegment[] = ROWS.map((row) => ({
  key: row.nature,
  label: row.label,
  value: row.amount,
  color: NATURE_RING_COLORS[row.nature],
}));

function renderTile(ring: RingSegment[] | null) {
  return render(
    <VersatoTile
      taxYear={2026}
      reading={[{ text: 'Nel 2026 hai versato 4000 €.' }]}
      aside="per natura"
      footer={[{ text: 'Per anno d’imposta.' }]}
      rows={ROWS}
      ring={ring}
      total={4000}
    />,
  );
}

describe('VersatoTile', () => {
  it('P2: draws a ring over swatched rows with a ring, and three bar tracks without one', () => {
    const withRing = renderTile(RING);
    expect(withRing.container.querySelector('[data-ring]')).not.toBeNull();
    expect(withRing.container.querySelectorAll('[role="presentation"]')).toHaveLength(0);
    const swatches = Array.from(withRing.container.querySelectorAll<HTMLElement>('li [aria-hidden="true"].h-2.w-2'));
    expect(swatches.map((swatch) => swatch.style.background)).toEqual(['var(--chart-7)', 'var(--chart-2)', 'var(--chart-6)']);
    withRing.unmount();

    const withoutRing = renderTile(null);
    expect(withoutRing.container.querySelector('[data-ring]')).toBeNull();
    expect(withoutRing.container.querySelectorAll('[role="presentation"]')).toHaveLength(3);
  });
});
