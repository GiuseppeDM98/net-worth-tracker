/**
 * The sold-out instruments (2026-11-23): who leaves the list for the closed group, the day of the last
 * sale, the rows that forbid a delete and the words. Invented ids and rounded dates.
 */
import { describe, expect, it } from 'vitest';
import type { AssetTransaction } from '@/types/assetTransactions';
import {
  deleteBlockingOperations,
  describeArchiveGroup,
  describeDeleteRefusal,
  describeSoldOn,
  isArchivedInstrument,
  splitArchivedInstruments,
  summarizeLedgerFootprints,
} from '@/lib/utils/instrumentArchive';

const trade = (assetId: string, type: 'buy' | 'sell', date: string, extra: Partial<AssetTransaction> = {}): AssetTransaction =>
  ({ id: `${assetId}-${type}-${date}`, assetId, type, date: new Date(`${date}T12:00:00`), ...extra }) as AssetTransaction;

describe('isArchivedInstrument / splitArchivedInstruments (U1)', () => {
  const footprints = summarizeLedgerFootprints([
    trade('sold', 'buy', '2026-01-10'),
    trade('sold', 'sell', '2026-02-10'),
    trade('held', 'buy', '2026-01-10'),
  ]);

  it('quantity 0 with rows is archived', () => {
    expect(isArchivedInstrument({ id: 'sold', quantity: 0 }, footprints)).toBe(true);
  });
  it('quantity 0 with no row stays in the list', () => {
    expect(isArchivedInstrument({ id: 'empty', quantity: 0 }, footprints)).toBe(false);
  });
  it('quantity 5 with rows stays in the list', () => {
    expect(isArchivedInstrument({ id: 'held', quantity: 5 }, footprints)).toBe(false);
  });
  it('the ledger not read: nothing is archived', () => {
    expect(isArchivedInstrument({ id: 'sold', quantity: 0 }, null)).toBe(false);
    const split = splitArchivedInstruments([{ id: 'sold', quantity: 0 }], null);
    expect(split.archived).toEqual([]);
    expect(split.live).toHaveLength(1);
  });
});

describe('summarizeLedgerFootprints (U2)', () => {
  it('lastSale is the latest SELL, a later BUY ignored', () => {
    const footprints = summarizeLedgerFootprints([
      trade('a', 'buy', '2026-01-10'),
      trade('a', 'sell', '2026-02-10'),
      trade('a', 'sell', '2026-03-10'),
      trade('a', 'buy', '2026-04-10'),
    ]);
    expect(footprints.get('a')?.lastSale).toEqual(new Date('2026-03-10T12:00:00'));
    expect(footprints.get('a')?.operations).toBe(4);
  });

  it('the group is newest sale first, one never sold last', () => {
    const footprints = summarizeLedgerFootprints([
      trade('old', 'sell', '2026-01-10'),
      trade('new', 'sell', '2026-03-10'),
      trade('never', 'buy', '2026-02-10'),
    ]);
    const { archived } = splitArchivedInstruments(
      [{ id: 'never', quantity: 0 }, { id: 'old', quantity: 0 }, { id: 'new', quantity: 0 }],
      footprints,
    );
    expect(archived.map((asset) => asset.id)).toEqual(['new', 'old', 'never']);
  });

  it('describeSoldOn prints the Italian day of a fixed date', () => {
    expect(describeSoldOn({ operations: 2, ownOperations: 2, lastSale: new Date('2026-03-09T12:00:00') })).toBe('venduto il 09/03/2026');
    expect(describeSoldOn({ operations: 1, ownOperations: 1, lastSale: null })).toBe('azzerato');
    expect(describeSoldOn(undefined)).toBe('azzerato');
  });
});

describe('the words (U3)', () => {
  it('describeArchiveGroup: singular and plural', () => {
    expect(describeArchiveGroup(1)).toBe('1 strumento azzerato');
    expect(describeArchiveGroup(3)).toBe('3 strumenti azzerati');
  });
  it('describeDeleteRefusal: singular and plural', () => {
    expect(describeDeleteRefusal('Ornitorinco', 1)).toContain('Ornitorinco ha 1 operazione nel registro');
    expect(describeDeleteRefusal('Ornitorinco', 2)).toContain('Ornitorinco ha 2 operazioni nel registro');
  });
});

describe('deleteBlockingOperations (U5)', () => {
  const footprints = summarizeLedgerFootprints([
    trade('baseline-only', 'buy', '2025-12-31', { isBaseline: true }),
    trade('mixed', 'buy', '2025-12-31', { isBaseline: true }),
    trade('mixed', 'buy', '2026-01-10'),
    trade('mixed', 'sell', '2026-02-10'),
  ]);
  it('an opening position alone → 0', () => {
    expect(deleteBlockingOperations('baseline-only', footprints)).toBe(0);
  });
  it('an opening position and two trades → 2', () => {
    expect(deleteBlockingOperations('mixed', footprints)).toBe(2);
  });
  it('no row → 0', () => {
    expect(deleteBlockingOperations('none', footprints)).toBe(0);
  });
  it('the ledger not read → null', () => {
    expect(deleteBlockingOperations('mixed', null)).toBeNull();
  });
});
