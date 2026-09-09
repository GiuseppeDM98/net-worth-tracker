import { describe, it, expect } from 'vitest';

import { suggestIsLiquid } from '@/lib/utils/assetLiquidity';
import type { AssetType } from '@/types/assets';

describe('suggestIsLiquid', () => {
  it.each(['stock', 'etf', 'bond', 'crypto', 'commodity', 'cash'] as AssetType[])(
    'suggests liquid for %s',
    (type) => {
      expect(suggestIsLiquid(type)).toBe(true);
    }
  );

  it('suggests illiquid for a direct property (type realestate)', () => {
    expect(suggestIsLiquid('realestate')).toBe(false);
  });

  it('suggests illiquid for a pension fund', () => {
    expect(suggestIsLiquid('pensionFund')).toBe(false);
  });

  it('suggests illiquid for a Private Equity position, whatever the type', () => {
    expect(suggestIsLiquid('stock', 'Private Equity')).toBe(false);
  });

  it('keeps a REIT ETF liquid — the predicate reads the type, never the assetClass', () => {
    // An ETF whose assetClass is 'realestate' is exchange-traded: it can be sold in a
    // day, unlike the property itself. The helper takes no assetClass at all, so the
    // only real-estate shape it can mark illiquid is the direct holding.
    expect(suggestIsLiquid('etf', 'REIT Europa')).toBe(true);
  });
});
