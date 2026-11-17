import { describe, expect, it } from 'vitest';
import { describeZeroQuantityChip } from '@/lib/utils/zeroQuantityChip';

// «Mai comprato» = created empty for a plan (`createdEmpty`, written only by AssetDialog's empty
// create) AND quantity 0 AND no ledger row (owner, 2026-11-12). Invented ids.
const etf = (quantity: number, createdEmpty?: true) => ({ id: 'etf-a', type: 'etf' as const, quantity, ...(createdEmpty ? { createdEmpty } : {}) });

describe('describeZeroQuantityChip', () => {
  it('should say «Mai comprato» for an instrument created empty, at zero, with no operation in the Registro', () => {
    expect(describeZeroQuantityChip(etf(0, true), new Set(['etf-b']))).toBe('Mai comprato');
  });
  // Seen red with the flag condition dropped: a position sold before the ledger has no row either.
  it('should keep «Azzerato» for a zero without the flag, even with no operation in the Registro', () => {
    expect(describeZeroQuantityChip(etf(0), new Set(['etf-b']))).toBe('Azzerato');
  });
  it('should keep «Azzerato» for one created empty and then bought and sold', () => {
    expect(describeZeroQuantityChip(etf(0, true), new Set(['etf-a']))).toBe('Azzerato');
  });
  it('should keep «Azzerato» while the Registro is unread, and for an instrument without ledger', () => {
    expect(describeZeroQuantityChip(etf(0, true), null)).toBe('Azzerato');
    expect(describeZeroQuantityChip({ id: 'casa', type: 'realestate' as never, quantity: 0, createdEmpty: true }, new Set())).toBe('Azzerato');
  });
  it('should show no chip for an instrument that is held', () => {
    expect(describeZeroQuantityChip(etf(3, true), new Set())).toBeNull();
  });
});
