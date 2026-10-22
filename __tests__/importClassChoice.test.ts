/**
 * The rule both broker imports share: the class the market did not decide is the user's to
 * choose, in the preview row — and a tracked asset's class is already decided.
 */
import { describe, expect, it } from 'vitest';
import {
  applyClassChoices,
  IMPORT_CLASS_OPTIONS,
  needsClassChoice,
  resolveImportClass,
  type ImportClassChoiceRow,
} from '@/lib/utils/importClassChoice';
import { ASSET_CLASS_SEQUENCE } from '@/lib/utils/allocationUtils';

function row(overrides: Partial<ImportClassChoiceRow> = {}): ImportClassChoiceRow {
  return {
    classChoiceKey: 'row-1',
    formData: { assetClass: 'equity' },
    needsClassChoice: true,
    ...overrides,
  };
}

describe('IMPORT_CLASS_OPTIONS', () => {
  it('offers the app’s own classes, in its own order and labels', () => {
    expect(IMPORT_CLASS_OPTIONS.map((option) => option.value)).toEqual(ASSET_CLASS_SEQUENCE);
    expect(IMPORT_CLASS_OPTIONS.find((option) => option.value === 'equity')?.label).toBe('Azioni');
    expect(IMPORT_CLASS_OPTIONS.find((option) => option.value === 'trendFollowing')).toBeDefined();
  });
});

describe('needsClassChoice', () => {
  it('is true only while the market did not decide the class and nobody stored one', () => {
    expect(needsClassChoice({ uncertain: true })).toBe(true);
    expect(needsClassChoice({ uncertain: false })).toBe(false);
  });

  it('is false for a row that updates a tracked asset: its class is already there', () => {
    expect(needsClassChoice({ uncertain: true, storedClass: 'bonds' })).toBe(false);
  });

  it('is false once the user has chosen', () => {
    expect(needsClassChoice({ uncertain: true, chosenClass: 'cash' })).toBe(false);
  });
});

describe('resolveImportClass', () => {
  it('prefers the user’s choice, then the stored class, then the plan’s proposal', () => {
    expect(resolveImportClass({ uncertain: true, chosenClass: 'cash', storedClass: 'bonds' }, 'equity')).toBe(
      'cash'
    );
    expect(resolveImportClass({ uncertain: true, storedClass: 'bonds' }, 'equity')).toBe('bonds');
    expect(resolveImportClass({ uncertain: false }, 'equity')).toBe('equity');
  });
});

describe('applyClassChoices', () => {
  it('puts the chosen class on the row that was waiting for it', () => {
    const rows = [row({ classChoiceKey: 'a' }), row({ classChoiceKey: 'b' })];
    const saved = applyClassChoices(rows, { a: 'bonds' });

    expect(saved[0].formData.assetClass).toBe('bonds');
    expect(saved[0].needsClassChoice).toBe(false);
    // The row nobody chose for keeps the class the plan measured.
    expect(saved[1].formData.assetClass).toBe('equity');
    expect(saved[1].needsClassChoice).toBe(true);
  });

  it('ignores a choice filed for a row that was not waiting', () => {
    const rows = [row({ classChoiceKey: 'a', needsClassChoice: false })];
    const saved = applyClassChoices(rows, { a: 'bonds' });

    expect(saved[0].formData.assetClass).toBe('equity');
    expect(saved[0].needsClassChoice).toBe(false);
  });

  it('never touches a row without a choice', () => {
    const rows = [row({ classChoiceKey: 'a' })];
    const saved = applyClassChoices(rows, {});

    expect(saved[0].formData.assetClass).toBe('equity');
    expect(saved[0].needsClassChoice).toBe(true);
  });
});
