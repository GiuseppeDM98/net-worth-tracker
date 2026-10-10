/**
 * The census's `--surfaces=` and `--viewports=` options (`validateSelection` of
 * scripts/mobileCensus.mjs): a value that is not a surface key of `doc/mobile/budget.json`, or
 * not one of the three viewports, is an error that names it and lists the valid ones — never a
 * silent drop, which measured nothing and overwrote `last-run.json` (seen on 2026-10-10 with
 * `--surfaces=cashflow`, a page name and not a key).
 *
 * Seen red on 2026-10-10 before the function existed (the import was undefined).
 */
import { describe, it, expect } from 'vitest';
import { validateSelection } from '../scripts/mobileCensus.mjs';

const SURFACES = ['panoramica', 'cashflow-tracciamento', 'cashflow-budget'];

describe('validateSelection', () => {
  it('accepts a selection made only of known keys', () => {
    expect(validateSelection(['cashflow-budget', 'panoramica'], SURFACES, 'superfici')).toBeNull();
  });

  it('names every unknown value and lists the valid ones', () => {
    const error = validateSelection(['cashflow', 'panoramica', 'fire'], SURFACES, 'superfici');

    expect(error).toContain('cashflow');
    expect(error).toContain('fire');
    expect(error).not.toMatch(/sconosciut\w+: [^—]*panoramica/);
    expect(error).toContain('cashflow-tracciamento');
  });

  it('refuses an empty selection', () => {
    expect(validateSelection([], ['390', '768', '1024'], 'viewport')).toContain('viewport');
  });
});
