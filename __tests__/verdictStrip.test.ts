/**
 * Tests for lib/utils/verdictStrip.ts — the strip under a phone's verdict (The First-Screen
 * Rule, since 2026-10-10): the nine formats, the signs, the zero, the validation and the lifted
 * blocks.
 *
 * Falsified on 2026-10-10: «−83 €» went red with `cachedFormatCurrencyEUR(value, true)` called
 * on the signed value (Intl prints the hyphen-minus, U+002D); «a null value prints nothing» went
 * red returning «0 €» for `null`; «a null cell lifts nothing» went red with the `value !== null`
 * filter removed from `liftedBlocks`.
 */

import { describe, expect, it } from 'vitest';
import {
  formatStripFigure,
  liftedBlocks,
  MAX_STRIP_FIGURES,
  validateStrip,
  type StripFigure,
} from '@/lib/utils/verdictStrip';

/** Node's Intl writes a narrow no-break space before «€»; the tests read it as a plain one. */
const text = (figure: StripFigure) => formatStripFigure(figure)?.text.replace(/[  ]/g, ' ') ?? null;

const cell = (overrides: Partial<StripFigure>): StripFigure => ({
  label: 'Cella',
  value: 1234,
  format: 'currency',
  opens: 'riga',
  ...overrides,
});

describe('formatStripFigure — the nine formats', () => {
  it('should print a signed amount with «+» and the typographic minus', () => {
    expect(text(cell({ format: 'signed-currency', value: 41_300 }))).toBe('+41.300 €');
    expect(text(cell({ format: 'signed-currency', value: -83 }))).toBe('−83 €');
  });

  it('should print an unsigned amount bare, and a negative one with U+2212, never Intl’s hyphen', () => {
    expect(text(cell({ format: 'currency', value: 6940 }))).toBe('6940 €');
    expect(text(cell({ format: 'currency', value: -83 }))).toBe('−83 €');
    expect(formatStripFigure(cell({ format: 'currency', value: -83 }))!.text).not.toContain('-');
  });

  it('should print an approximation with «~» before the sign', () => {
    expect(text(cell({ format: 'approx-currency', value: 1234 }))).toBe('~1234 €');
    expect(text(cell({ format: 'approx-currency', value: -1234 }))).toBe('~−1234 €');
  });

  it('should print percentages with one decimal and a comma, signed or not', () => {
    expect(text(cell({ format: 'signed-percent', value: 4.095 }))).toBe('+4,1%');
    expect(text(cell({ format: 'signed-percent', value: -3.94 }))).toBe('−3,9%');
    expect(text(cell({ format: 'percent', value: 60 }))).toBe('60,0%');
  });

  it('should print points like the Rendimento chip: a whole number bare, otherwise one decimal', () => {
    expect(text(cell({ format: 'points', value: 1.24 }))).toBe('+1,2 pt');
    expect(text(cell({ format: 'points', value: -2 }))).toBe('−2 pt');
  });

  it('should print percentage points, a ratio and a rank in their own faces', () => {
    expect(text(cell({ format: 'pp', value: 3.4 }))).toBe('3,4 pp');
    expect(text(cell({ format: 'ratio', value: 1.6667 }))).toBe('1,67');
    expect(text(cell({ format: 'rank', value: 3 }))).toBe('3°');
  });

  it('should take the decimals the tile prints with when the selector passes them', () => {
    expect(text(cell({ format: 'signed-currency', value: 1234.5, decimals: 2 }))).toBe('+1234,50 €');
    expect(text(cell({ format: 'percent', value: 12.345, decimals: 2 }))).toBe('12,35%');
    expect(text(cell({ format: 'ratio', value: 2, decimals: 0 }))).toBe('2');
    expect(text(cell({ format: 'points', value: 1.5, decimals: 2 }))).toBe('+1,50 pt');
    // Seen red on 2026-10-10 («+1,20 pt»): the points were rounded to one decimal BEFORE the
    // tile's decimals were applied, so a selector passing 2 could never print the third digit.
    expect(text(cell({ format: 'points', value: 1.234, decimals: 2 }))).toBe('+1,23 pt');
    expect(text(cell({ format: 'points', value: -0.456, decimals: 2 }))).toBe('−0,46 pt');
  });
});

describe('formatStripFigure — signs, zero and colour', () => {
  it('should print a zero without a sign and without a colour, whatever the format', () => {
    const zero = formatStripFigure(cell({ format: 'signed-currency', value: 0 }));
    expect(text(cell({ format: 'signed-currency', value: 0 }))).toBe('0 €');
    expect(zero!.sign).toBeUndefined();
    expect(formatStripFigure(cell({ format: 'signed-percent', value: 0 }))).toEqual({ text: '0,0%', mono: true });
    // A figure that rounds to zero is a printed zero too: the sign is decided on the text.
    expect(text(cell({ format: 'signed-currency', value: -0.3 }))).toBe('0 €');
    expect(formatStripFigure(cell({ format: 'signed-currency', value: -0.3 }))!.sign).toBeUndefined();
  });

  it('should colour a signed format by its value and leave an unsigned one uncoloured', () => {
    expect(formatStripFigure(cell({ format: 'signed-currency', value: 500 }))!.sign).toBe('positive');
    expect(formatStripFigure(cell({ format: 'signed-currency', value: -500 }))!.sign).toBe('negative');
    expect(formatStripFigure(cell({ format: 'currency', value: 500 }))!.sign).toBeUndefined();
    expect(formatStripFigure(cell({ format: 'currency', value: -500 }))!.sign).toBeUndefined();
  });

  it('should let the selector’s tone override the colour, and «neutral» silence it', () => {
    expect(formatStripFigure(cell({ format: 'percent', value: 60, tone: 'positive' }))!.sign).toBe('positive');
    expect(formatStripFigure(cell({ format: 'signed-currency', value: -500, tone: 'neutral' }))!.sign).toBeUndefined();
  });

  it('should print nothing for a null value — the cell prints its reason instead', () => {
    expect(formatStripFigure(cell({ value: null, reason: 'non ancora misurato' }))).toBeNull();
  });
});

describe('validateStrip', () => {
  const sections = ['hof-entrate', 'hof-risparmio', 'hof-anni', 'perche'];
  const valid: StripFigure[] = [
    cell({ label: "Quest'anno", opens: 'hof-anni' }),
    cell({ label: 'Entrate record', opens: 'hof-entrate' }),
    cell({ label: 'Risparmio record', opens: 'hof-risparmio', value: null, reason: 'nessun mese con entrate' }),
  ];

  it('should accept a strip of at most four cells that open known, distinct sections', () => {
    expect(MAX_STRIP_FIGURES).toBe(4);
    expect(validateStrip(valid, sections)).toEqual([]);
    expect(validateStrip([...valid, cell({ label: 'Quarta', opens: 'perche' })], sections)).toEqual([]);
  });

  it('should refuse five cells', () => {
    const five = [...valid, cell({ label: 'Quarta', opens: 'perche' }), cell({ label: 'Quinta', opens: 'hof-note' })];

    expect(validateStrip(five, [...sections, 'hof-note'])).toEqual(['5 cells: at most 4']);
  });

  it('should refuse a cell opening an unknown section, and two cells opening the same one', () => {
    expect(validateStrip([cell({ label: 'X', opens: 'altrove' })], sections)).toEqual(['«X» opens an unknown section «altrove»']);
    expect(validateStrip([cell({ label: 'A', opens: 'hof-anni' }), cell({ label: 'B', opens: 'hof-anni' })], sections)).toEqual([
      'two cells open «hof-anni»',
    ]);
  });

  it('should refuse a null value with no reason', () => {
    expect(validateStrip([cell({ label: 'Vuota', opens: 'hof-anni', value: null })], sections)).toEqual([
      '«Vuota» has no value and no reason',
    ]);
  });
});

describe('liftedBlocks', () => {
  const strip: StripFigure[] = [
    cell({ label: 'Questo mese', opens: 'perche', lifts: { section: 'panoramica-patrimonio', block: 'monthly' } }),
    cell({ label: 'Da inizio anno', opens: 'panoramica-patrimonio', lifts: { section: 'panoramica-patrimonio', block: 'yearly' } }),
    cell({ label: 'Messo da parte', opens: 'panoramica-cashflow', lifts: { section: 'panoramica-cashflow', block: 'saved' } }),
    cell({ label: 'Senza cifra', opens: 'panoramica-sintesi', value: null, reason: 'non misurato', lifts: { section: 'panoramica-patrimonio', block: 'curve-end' } }),
  ];

  it('should name the blocks of one section the strip repeats, in strip order', () => {
    expect(liftedBlocks(strip, 'panoramica-patrimonio')).toEqual(['monthly', 'yearly']);
    expect(liftedBlocks(strip, 'panoramica-cashflow')).toEqual(['saved']);
  });

  it('should lift nothing for a cell without a figure, nor for a section no cell names', () => {
    expect(liftedBlocks(strip, 'panoramica-patrimonio')).not.toContain('curve-end');
    expect(liftedBlocks(strip, 'panoramica-sintesi')).toEqual([]);
  });
});
