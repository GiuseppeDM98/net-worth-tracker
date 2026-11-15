/**
 * `PagatoriTile` (components/dividends/tiles/PagatoriTile.tsx): with a `ring` the payers are its
 * legend (The Ring Rule, 2026-11-12) — each row its arc's swatch, the remainder the fold's grey —;
 * without, today's bars. Figures invented and round. Seen red on 2026-11-15 with the remainder
 * coloured by rank.
 */

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { PagatoriTile } from '@/components/dividends/tiles/PagatoriTile';
import { payerRingSegments, type PayerRanking } from '@/lib/utils/dividendAnalytics';
import { RING_REST_COLOR } from '@/lib/utils/ringChart';

const RANKING: PayerRanking = {
  rows: [
    { key: 'etf', label: 'Un ETF', amount: 300, percentage: 50 },
    { key: 'btp', label: 'Un BTP', amount: 200, percentage: 33.3 },
  ],
  remainder: { label: '1 strumento venduto', amount: 100, percentage: 16.7 },
  total: 600,
  payerCount: 3,
  heldPayerCount: 2,
  soldPayerCount: 1,
  soldNet: 100,
  top: null,
};

const swatchesOf = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>('li [aria-hidden="true"].h-2.w-2')).map((swatch) => swatch.style.background);

describe('PagatoriTile', () => {
  it('V2: the rows wear their arcs’ colours and the remainder the fold’s grey', () => {
    const { container } = render(
      <PagatoriTile ranking={RANKING} ring={payerRingSegments(RANKING)} reading={null} footer={null} emptyCopy="Nessun pagamento." />,
    );
    expect(container.querySelector('[data-ring]')).not.toBeNull();
    expect(swatchesOf(container)).toEqual(['var(--chart-2)', 'var(--chart-7)', RING_REST_COLOR]);
  });

  it('keeps the bars without a ring', () => {
    const { container } = render(<PagatoriTile ranking={RANKING} ring={null} reading={null} footer={null} emptyCopy="Nessun pagamento." />);
    expect(container.querySelector('[data-ring]')).toBeNull();
    expect(container.querySelectorAll('[role="presentation"]')).toHaveLength(2);
  });
});
