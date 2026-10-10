/**
 * A loan is a liability stored as an asset (types/assets.ts → LOAN_ASSET_TYPE, 2026-10-10): its
 * value is MINUS its principal, every net-worth sum subtracts it, the FIRE number leaves it out
 * with the primary residence it finances, the Liquidità tile shows a personal one as «debito», and
 * the migration turns a property's legacy debt into one — each rule pinned here.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({}));
vi.mock('@/lib/utils/authFetch', () => ({ authenticatedFetch: vi.fn() }));
vi.mock('@/lib/services/dashboardOverviewInvalidation', () => ({ invalidateDashboardOverviewSummary: vi.fn() }));

import {
  calculateAssetValue,
  calculateFIRENetWorth,
  calculateIlliquidFIRENetWorth,
  calculateLiquidFIRENetWorth,
  calculateLiquidNetWorth,
  calculateTotalValue,
  filterFireEligibleAssets,
} from '@/lib/services/assetService';
import { isLiquidityRow } from '@/lib/utils/patrimonioSummary';
import { buildLoanFromProperty, planLoanMigration, propertiesWithLegacyDebt } from '@/lib/utils/loanMigration';
import { suggestIsLiquid } from '@/lib/utils/assetLiquidity';
import { hasMarketPrice } from '@/lib/utils/assetPricing';
import { resolvePerformanceExclusions } from '@/lib/utils/performanceBase';
import { isLoanAsset, type Asset } from '@/types/assets';

const asset = (overrides: Partial<Asset>): Asset =>
  ({
    id: 'a',
    userId: 'u',
    ticker: '',
    name: 'Asset',
    type: 'cash',
    assetClass: 'cash',
    currency: 'EUR',
    quantity: 0,
    currentPrice: 1,
    lastPriceUpdate: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as Asset;

const HOUSE = asset({ id: 'house', name: 'Casa', type: 'realestate', assetClass: 'realestate', quantity: 250_000, isPrimaryResidence: true, isLiquid: false, allocationRole: 'excluded' });
const MORTGAGE = asset({ id: 'mortgage', name: 'Mutuo Casa', type: 'loan', assetClass: 'realestate', quantity: 95_000, financedAssetId: 'house', isLiquid: false, debtInterestRate: 3.2 });
const CAR_LOAN = asset({ id: 'car', name: 'Prestito auto', type: 'loan', assetClass: 'cash', quantity: 8_000, isLiquid: true });
const CASH = asset({ id: 'cash', name: 'Conto', type: 'cash', assetClass: 'cash', quantity: 20_000, isLiquid: true });

describe('calculateAssetValue — a loan is minus its principal', () => {
  it('should value a loan at minus its quantity and a repaid one at zero', () => {
    expect(calculateAssetValue(MORTGAGE)).toBe(-95_000);
    expect(calculateAssetValue({ ...CAR_LOAN, quantity: 0 })).toBe(0);
    expect(isLoanAsset(MORTGAGE)).toBe(true);
    expect(isLoanAsset(HOUSE)).toBe(false);
  });

  it('should keep the property at its gross value and net the debt in the total', () => {
    expect(calculateAssetValue(HOUSE)).toBe(250_000);
    expect(calculateTotalValue([HOUSE, MORTGAGE, CASH, CAR_LOAN])).toBe(250_000 - 95_000 + 20_000 - 8_000);
  });

  it('should still net a LEGACY property debt the migration has not reached', () => {
    expect(calculateAssetValue({ ...HOUSE, outstandingDebt: 95_000 })).toBe(155_000);
  });

  it('should count a personal loan as negative liquidity and a mortgage as illiquid', () => {
    expect(calculateLiquidNetWorth([HOUSE, MORTGAGE, CASH, CAR_LOAN])).toBe(20_000 - 8_000);
    // Without the flag the default follows what the loan finances.
    expect(calculateLiquidNetWorth([{ ...CAR_LOAN, isLiquid: undefined }, { ...MORTGAGE, isLiquid: undefined }])).toBe(-8_000);
  });
});

describe('FIRE — the loan follows the primary residence it finances', () => {
  const all = [HOUSE, MORTGAGE, CASH, CAR_LOAN];

  it('should leave the house AND its mortgage out when the residence is excluded', () => {
    expect(filterFireEligibleAssets(all, false).map((a) => a.id)).toEqual(['cash', 'car']);
    expect(calculateFIRENetWorth(all, false)).toBe(20_000 - 8_000);
    expect(calculateLiquidFIRENetWorth(all, false) + calculateIlliquidFIRENetWorth(all, false)).toBe(calculateFIRENetWorth(all, false));
  });

  it('should count both when the residence is included, and a loan on a second home always', () => {
    expect(calculateFIRENetWorth(all, true)).toBe(250_000 - 95_000 + 20_000 - 8_000);
    const rental = { ...HOUSE, id: 'rental', isPrimaryResidence: false };
    const rentalLoan = { ...MORTGAGE, id: 'rental-loan', financedAssetId: 'rental' };
    expect(filterFireEligibleAssets([rental, rentalLoan], false).map((a) => a.id)).toEqual(['rental', 'rental-loan']);
  });
});

describe('Rendimenti — a loan is out of every base', () => {
  it('should exclude a loan whatever the toggles say', () => {
    expect(resolvePerformanceExclusions([MORTGAGE, CAR_LOAN, CASH], { includePensionFunds: true, includeExcludedAssets: true })).toEqual(['mortgage', 'car']);
  });
});

describe('Patrimonio — the Liquidità rows, the pricing and the liquidity default', () => {
  it('should list the accounts and the personal loans, never a mortgage', () => {
    expect([HOUSE, MORTGAGE, CASH, CAR_LOAN].filter(isLiquidityRow).map((a) => a.id)).toEqual(['cash', 'car']);
  });

  it('should value a loan by hand and default its liquidity on what it finances', () => {
    expect(hasMarketPrice('loan')).toBe(false);
    expect(suggestIsLiquid('loan')).toBe(true);
    expect(suggestIsLiquid('loan', undefined, 'house')).toBe(false);
  });
});

describe('loanMigration — a property\'s legacy debt becomes a loan', () => {
  const legacyHouse = { ...HOUSE, outstandingDebt: 95_000, debtInterestRate: 3.2 };

  it('should plan one loan per property with a debt, and re-point its rows', () => {
    const steps = planLoanMigration([legacyHouse, CASH, { ...HOUSE, id: 'rental', outstandingDebt: 0 }], [
      { id: 'r1', debtAssetId: 'house' },
      { id: 'r2', debtAssetId: 'house' },
      { id: 'r3', debtAssetId: 'other' },
    ]);
    expect(steps).toHaveLength(1);
    expect(steps[0].propertyId).toBe('house');
    expect(steps[0].rowIds).toEqual(['r1', 'r2']);
    expect(propertiesWithLegacyDebt([HOUSE, CASH])).toEqual([]);
  });

  it('should build the loan after the property: its debt, TAN, currency, class and links', () => {
    expect(buildLoanFromProperty(legacyHouse)).toEqual({
      ticker: '',
      name: 'Mutuo Casa',
      type: 'loan',
      assetClass: 'realestate',
      currency: 'EUR',
      quantity: 95_000,
      currentPrice: 1,
      isLiquid: false,
      autoUpdatePrice: false,
      stampDutyExempt: true,
      allocationRole: 'excluded',
      isPrimaryResidence: false,
      financedAssetId: 'house',
      debtInterestRate: 3.2,
    });
    expect(buildLoanFromProperty({ ...legacyHouse, debtInterestRate: undefined })).not.toHaveProperty('debtInterestRate');
  });
});
