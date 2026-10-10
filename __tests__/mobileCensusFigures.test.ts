/**
 * What the first-screen census counts as a «figure» (`FIGURE_PATTERN` of scripts/mobileCensus.mjs):
 * a number followed by € or % — decision 7 of doc/mobile/README.md § 9, the baseline's own rule —
 * with the no-break spaces Intl writes before the unit. A count of things («11 strumenti») is not one.
 */
import { describe, it, expect } from 'vitest';
import { FIGURE_PATTERN } from '../scripts/mobileCensus.mjs';

const countFigures = (text: string) => (text.match(new RegExp(FIGURE_PATTERN, 'g')) ?? []).length;

describe('FIGURE_PATTERN', () => {
  it('counts a euro amount with thousands and decimals', () => {
    expect(countFigures('1.234,56 €')).toBe(1);
  });

  it('counts a signed percentage with a space before the unit', () => {
    expect(countFigures('−0,81 %')).toBe(1);
  });

  it('counts the no-break spaces Intl writes (U+00A0, U+202F)', () => {
    expect(countFigures('1.234 € e 12,5 %')).toBe(2);
  });

  it('does not count a number that is not money nor a share', () => {
    expect(countFigures('11 strumenti, 4 conti e 1 prestito')).toBe(0);
  });

  it('counts each figure of a sentence once', () => {
    expect(countFigures('Hai messo da parte 1.200 € (24%) su 5.000 € di entrate.')).toBe(3);
  });
});
