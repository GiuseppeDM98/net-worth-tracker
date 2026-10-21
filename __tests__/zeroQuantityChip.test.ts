import { describe, expect, it } from 'vitest';
import { describeZeroQuantityChip } from '@/lib/utils/zeroQuantityChip';

const etf = (quantity: number) => ({ id: 'mfeh', type: 'etf' as const, quantity });

describe('describeZeroQuantityChip (AL5 · R6)', () => {
  it('should say «Mai comprato» for a ledger instrument at zero with no operation in the Registro', () => {
    expect(describeZeroQuantityChip(etf(0), new Set(['altro']))).toBe('Mai comprato');
  });
  it('should keep «Azzerato» for one that was sold off', () => {
    expect(describeZeroQuantityChip(etf(0), new Set(['mfeh']))).toBe('Azzerato');
  });
  it('should keep «Azzerato» while the Registro is unread, and for an instrument without ledger', () => {
    expect(describeZeroQuantityChip(etf(0), null)).toBe('Azzerato');
    expect(describeZeroQuantityChip({ id: 'casa', type: 'realestate' as never, quantity: 0 }, new Set())).toBe('Azzerato');
  });
  it('should show no chip for an instrument that is held', () => {
    expect(describeZeroQuantityChip(etf(3), new Set())).toBeNull();
  });
});
