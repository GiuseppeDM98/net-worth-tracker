import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SKELETON_CELLS,
  tileSkeletonCellClass,
} from '@/lib/utils/tileGridSkeleton';

describe('tileSkeletonCellClass', () => {
  it('maps the span to a literal desktop class', () => {
    expect(tileSkeletonCellClass({ span: 3 })).toBe('desktop:col-span-3');
  });

  it('adds the two-row span only when rows >= 2', () => {
    expect(tileSkeletonCellClass({ span: 5, rows: 2 })).toBe(
      'desktop:col-span-5 tablet:col-span-2 desktop:row-span-2',
    );
    expect(tileSkeletonCellClass({ span: 5, rows: 1 })).not.toContain('row-span');
  });

  it('takes the full tablet row only above half the grid', () => {
    expect(tileSkeletonCellClass({ span: 6 })).not.toContain('tablet:col-span-2');
    expect(tileSkeletonCellClass({ span: 7 })).toContain('tablet:col-span-2');
  });

  it('clamps an out-of-range span into 1..12', () => {
    expect(tileSkeletonCellClass({ span: 0 })).toBe('desktop:col-span-1');
    expect(tileSkeletonCellClass({ span: 40 })).toBe('desktop:col-span-12 tablet:col-span-2');
  });

  it('ships the Panoramica geometry as the default: two closed rows of 12', () => {
    const [first, ...rest] = DEFAULT_SKELETON_CELLS;
    expect(first).toMatchObject({ span: 5, rows: 2 });
    // 5 (two rows) + 3 + 4 closes row one; 5 + 3 + 2 + 2 closes row two.
    expect(rest.slice(0, 2).reduce((sum, c) => sum + c.span, 5)).toBe(12);
    expect(rest.slice(2).reduce((sum, c) => sum + c.span, 5)).toBe(12);
  });
});
