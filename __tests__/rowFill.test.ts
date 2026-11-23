/**
 * `balanceRows` (lib/utils/rowFill.ts, owner 2026-11-23): two tiles of one grid row, the shorter one
 * given the rows that fill its void. Seen red on 2026-11-23, one mutation at a time: with the rows
 * a tile already shows left out of its slack (the second measure took the fill back), with `room`
 * ignored, and with both tiles filled at once.
 */

import { describe, expect, it } from 'vitest';
import { balanceRows, type RowFillMeasure } from '@/lib/utils/rowFill';

const tile = (overrides: Partial<RowFillMeasure> = {}): RowFillMeasure => ({ free: 0, rowHeight: 48, extra: 0, room: 20, ...overrides });

describe('balanceRows', () => {
  it('gives the shorter tile the whole rows its void holds, and nothing to the taller one', () => {
    // 279px of void at 48px a row: five rows, 39px left over.
    expect(balanceRows(tile({ free: 279 }), tile({ rowHeight: 71.5 }))).toEqual([5, 0]);
    expect(balanceRows(tile(), tile({ free: 390, rowHeight: 71.5 }))).toEqual([0, 5]);
  });

  it('answers the same once the rows are drawn: the measure after the fill is the measure before it', () => {
    expect(balanceRows(tile({ free: 39, extra: 5 }), tile({ rowHeight: 71.5 }))).toEqual([5, 0]);
    // The other tile grew by a row since (its reading wrapped): one row more, not five on top of five.
    expect(balanceRows(tile({ free: 39 + 48, extra: 5 }), tile({ rowHeight: 71.5 }))).toEqual([6, 0]);
  });

  it('takes the fill back when the taller tile shrinks under the filled one', () => {
    // Drawn with five extra rows and now the tallest (no void); the other shows 100px of void with no room.
    expect(balanceRows(tile({ free: 0, extra: 5 }), tile({ free: 100, rowHeight: 71.5, room: 0 }))).toEqual([2, 0]);
  });

  it('never gives more rows than the tile has, and none to a tile without room', () => {
    expect(balanceRows(tile({ free: 279, room: 3 }), tile())).toEqual([3, 0]);
    expect(balanceRows(tile({ free: 279, room: 0 }), tile())).toEqual([0, 0]);
  });

  it('counts a row that fits to the pixel, and none without a measured row', () => {
    expect(balanceRows(tile({ free: 95.6 }), tile())).toEqual([2, 0]);
    expect(balanceRows(tile({ free: 94 }), tile())).toEqual([1, 0]);
    expect(balanceRows(tile({ free: 279, rowHeight: 0 }), tile())).toEqual([0, 0]);
  });
});
