/**
 * `NetWorthSparkline` (components/dashboard/NetWorthSparkline.tsx, 2026-11-23): on a series that sits flat,
 * jumps and sits flat again, the line never leaves the plot's padding band (4 units top and bottom) —
 * the Catmull-Rom curve it replaced overshot and the viewBox cut it.
 */

import { describe, expect, it } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { NetWorthSparkline } from '@/components/dashboard/NetWorthSparkline';

const HEIGHT = 180;
const FLAT_JUMP_FLAT = [1000, 1000, 1000, 5000, 5000, 5000].map((totalNetWorth, i) => ({
  month: i + 1,
  year: 2026,
  totalNetWorth,
}));

describe('NetWorthSparkline', () => {
  it('keeps every y of the line inside [4, height − 4] on a flat-jump-flat series (R1)', async () => {
    const { container } = render(<NetWorthSparkline data={FLAT_JUMP_FLAT} height={HEIGHT} />);
    await waitFor(() => expect(container.querySelector('path[stroke]')).not.toBeNull());
    const d = container.querySelector('path[stroke]')!.getAttribute('d')!;
    const ys = (d.match(/-?\d+(\.\d+)?,-?\d+(\.\d+)?/g) ?? []).map((pair) => Number(pair.split(',')[1]));
    expect(ys.length).toBeGreaterThan(6);
    for (const y of ys) {
      expect(y).toBeGreaterThanOrEqual(4 - 1e-9);
      expect(y).toBeLessThanOrEqual(HEIGHT - 4 + 1e-9);
    }
  });
});
