/**
 * `RankedRows` (components/ui/ranked-rows.tsx): with `bars={false}` the list is a ring's legend — an
 * 8×8 swatch per row and per remainder, no bar track (The Ring Rule, 2026-11-12); without the props
 * the rows are the ranked rows every other tile draws (K2 holds that shape).
 */

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { RankedRows, type RankedRow } from '@/components/ui/ranked-rows';

const ROWS: RankedRow[] = [
  { key: 'stipendio', label: 'Stipendio', amount: 3000, percentage: 75 },
  { key: 'dividendi', label: 'Dividendi', amount: 500, percentage: 12.5 },
];

const SWATCH = '[aria-hidden="true"].h-2.w-2';

describe('RankedRows', () => {
  it('K1: as a legend, puts a swatch before each label and the remainder’s, and draws no bar', () => {
    const { container } = render(
      <RankedRows
        rows={ROWS.map((row, index) => ({ ...row, swatch: index === 0 ? 'var(--chart-2)' : 'var(--chart-7)' }))}
        color="var(--chart-2)"
        bars={false}
        remainders={[{ label: 'Altre categorie', amount: 500, percentage: 12.5, swatch: 'var(--muted-foreground)' }]}
        ariaLabel="Entrate per categoria"
      />,
    );
    const items = container.querySelectorAll('li');
    expect(items).toHaveLength(3);
    items.forEach((item) => expect(item.querySelector(SWATCH)).not.toBeNull());
    expect((items[0].querySelector(SWATCH) as HTMLElement).style.background).toBe('var(--chart-2)');
    // The remainder's swatch sits in a flex label span, where an inline swatch would have no size.
    expect((items[2].querySelector(SWATCH) as HTMLElement).parentElement?.className).toContain('flex');
    expect(container.querySelectorAll('[role="presentation"]')).toHaveLength(0);
    expect(container.querySelector('.w-\\[42\\%\\]')).toBeNull();
    expect(container.innerHTML).toContain('@max-[200px]:hidden');
  });

  it('K2: without the legend props, keeps the 3px track, the 42% label column and the 250px share floor, and no swatch', () => {
    const { container } = render(
      <RankedRows
        rows={ROWS}
        color="var(--chart-2)"
        remainders={[{ label: 'Altre categorie', amount: 500, percentage: 12.5 }]}
        ariaLabel="Entrate per categoria"
      />,
    );
    const tracks = container.querySelectorAll('[role="presentation"]');
    expect(tracks).toHaveLength(2);
    tracks.forEach((track) => expect(track.className).toContain('h-[3px]'));
    const labelSpans = Array.from(container.querySelectorAll('li > div > span:first-child'));
    expect(labelSpans).toHaveLength(2);
    labelSpans.forEach((span) => expect(span.className).toContain('w-[42%]'));
    const shares = Array.from(container.querySelectorAll('li span')).filter((span) => span.className.includes('w-[34px]'));
    expect(shares).toHaveLength(3);
    shares.forEach((span) => expect(span.className).toContain('@max-[250px]:hidden'));
    expect(container.querySelector(SWATCH)).toBeNull();
  });
});
