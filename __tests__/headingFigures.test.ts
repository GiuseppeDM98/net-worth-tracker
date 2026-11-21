/**
 * `splitHeadingFigures` (lib/utils/headingFigures.ts): the figures inside a heading's text, so a
 * costume theme's heading face never draws a digit (DESIGN.md → The Mono Mandate wins over the
 * heading font). A date and a time are ONE figure each, a full stop after a figure stays prose.
 * Seen red on 2026-11-21 with the class's closing digit dropped («Chiude il 2026.» gave «2026.»)
 * and with «/» dropped from the class (the date split in three).
 */
import { describe, expect, it } from 'vitest';
import { splitHeadingFigures } from '@/lib/utils/headingFigures';

const figures = (text: string) => splitHeadingFigures(text).filter((part) => part.figure).map((part) => part.text);

describe('splitHeadingFigures', () => {
  it('should leave a heading without digits as one prose part', () => {
    expect(splitHeadingFigures('Novembre è in crescita')).toEqual([{ text: 'Novembre è in crescita', figure: false }]);
  });

  it('should take a signed amount with its euro sign as one figure', () => {
    expect(splitHeadingFigures('+2.150 € nel mese')).toEqual([
      { text: '+2.150 €', figure: true },
      { text: ' nel mese', figure: false },
    ]);
  });

  it('should keep the percent sign and leave the full stop to the prose', () => {
    expect(splitHeadingFigures('il 31%.')).toEqual([
      { text: 'il ', figure: false },
      { text: '31%', figure: true },
      { text: '.', figure: false },
    ]);
  });

  it('should isolate a year', () => {
    expect(figures('Rendimento 2026')).toEqual(['2026']);
  });

  it('should end a figure on its digit, before a closing full stop', () => {
    expect(splitHeadingFigures('Chiude il 2026.')).toEqual([
      { text: 'Chiude il ', figure: false },
      { text: '2026', figure: true },
      { text: '.', figure: false },
    ]);
  });

  it('should keep a date whole', () => {
    expect(figures('Rivedi entro il 08/11/2027')).toEqual(['08/11/2027']);
  });

  it('should keep a time whole', () => {
    expect(figures('alle 18:42')).toEqual(['18:42']);
  });

  it('should leave a digit glued to a letter as prose', () => {
    expect(splitHeadingFigures('Q3-x')).toEqual([{ text: 'Q3-x', figure: false }]);
  });

  it('should give back the text whole once joined', () => {
    const text = 'Patrimonio +2.150 € (31%) al 08/11/2027 alle 18:42.';
    expect(splitHeadingFigures(text).map((part) => part.text).join('')).toBe(text);
  });
});
