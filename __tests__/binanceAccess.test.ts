import { describe, expect, it } from 'vitest';
import { canUseBinance } from '@/lib/utils/binanceAccess';

describe('canUseBinance', () => {
  it('admits only the owner email, case and spaces aside', () => {
    expect(canUseBinance('rykymai@gmail.com')).toBe(true);
    expect(canUseBinance(' RykyMai@Gmail.com ')).toBe(true);
    expect(canUseBinance('riccardo.maistri95@gmail.com')).toBe(false);
    expect(canUseBinance(null)).toBe(false);
    expect(canUseBinance(undefined)).toBe(false);
  });
});
