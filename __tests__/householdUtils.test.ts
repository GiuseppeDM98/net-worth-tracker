import { describe, expect, it } from 'vitest';
import {
  buildOwnershipSnapshotBreakdown,
  calculateMonthlyCompensations,
  getAssignableOwnershipProfiles,
  getDefaultHouseholdConfig,
  getProfileSplitsForDate,
  inferOwnershipProfileType,
  resolveExpenseAttribution,
  validateOwnershipSplits,
} from '@/lib/utils/householdUtils';
import {
  DEFAULT_PROFILE_SELF_ID,
  type HouseholdConfig,
} from '@/types/household';
import type { Asset } from '@/types/assets';
import type { Expense } from '@/types/expenses';
import type { InternalTransfer } from '@/types/investments';

function makeAsset(overrides: Partial<Asset>): Asset {
  return {
    id: 'asset-1',
    userId: 'u1',
    ticker: 'CASH',
    name: 'Conto personale',
    type: 'cash',
    assetClass: 'cash',
    currency: 'EUR',
    quantity: 1000,
    currentPrice: 1,
    lastPriceUpdate: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Asset;
}

function makeExpense(overrides: Partial<Expense>): Expense {
  return {
    id: 'expense-1',
    userId: 'u1',
    type: 'variable',
    categoryId: 'groceries',
    categoryName: 'Spesa',
    amount: -100,
    currency: 'EUR',
    date: new Date(2026, 0, 10),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Expense;
}

function makeTransfer(overrides: Partial<InternalTransfer>): InternalTransfer {
  return {
    id: 'transfer-1',
    userId: 'u1',
    fromCashAssetId: 'cash-partner',
    fromCashAssetName: 'Conto partner',
    toCashAssetId: 'cash-self',
    toCashAssetName: 'Conto personale',
    amount: 50,
    currency: 'EUR',
    date: new Date(2026, 0, 20),
    purpose: 'settlement',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as InternalTransfer;
}

function assignment(config: HouseholdConfig, profileId: string) {
  const profile = config.profiles.find((item) => item.id === profileId);
  if (!profile) throw new Error(`Missing profile ${profileId}`);
  return {
    ownershipProfileId: profile.id,
    ownershipProfileName: profile.name,
    ownershipSplits: profile.splits,
  };
}

const PARTNER_ID = 'partner';
const PARTNER_PROFILE_ID = 'partner-100';
const SHARED_PROFILE_ID = 'shared-50-50';

function makeEnabledConfig(): HouseholdConfig {
  const config = getDefaultHouseholdConfig('u1');
  return {
    ...config,
    enabled: true,
    participants: [
      ...config.participants,
      {
        id: PARTNER_ID,
        name: 'Moglie',
        role: 'partner',
        sortOrder: 1,
        active: true,
      },
    ],
    profiles: [
      ...config.profiles,
      {
        id: PARTNER_PROFILE_ID,
        name: 'Moglie 100%',
        type: 'personal',
        splits: [{ participantId: PARTNER_ID, participantName: 'Moglie', percentage: 100 }],
        sortOrder: 1,
        active: true,
      },
      {
        id: SHARED_PROFILE_ID,
        name: 'Comune 50/50',
        type: 'shared',
        splits: [
          { participantId: 'self', participantName: 'Io', percentage: 50 },
          { participantId: PARTNER_ID, participantName: 'Moglie', percentage: 50 },
        ],
        sortOrder: 2,
        active: true,
      },
    ],
    defaultExpenseProfileId: SHARED_PROFILE_ID,
  };
}

describe('household defaults', () => {
  it('starts disabled with only the self participant and profile', () => {
    const config = getDefaultHouseholdConfig('u1');

    expect(config.enabled).toBe(false);
    expect(config.participants.map((item) => item.name)).toEqual(['Io']);
    expect(config.profiles.map((item) => item.id)).toEqual([DEFAULT_PROFILE_SELF_ID]);
    expect(config.defaultExpenseProfileId).toBe(DEFAULT_PROFILE_SELF_ID);
  });

  it('validates split totals with tolerance', () => {
    expect(validateOwnershipSplits([{ participantId: 'a', participantName: 'A', percentage: 100 }]).isValid).toBe(true);
    expect(validateOwnershipSplits([{ participantId: 'a', participantName: 'A', percentage: 80 }]).isValid).toBe(false);
  });
});

describe('resolveExpenseAttribution', () => {
  it('uses self as default when the feature is disabled', () => {
    const config = getDefaultHouseholdConfig('u1');
    const attribution = resolveExpenseAttribution(makeExpense({}), config);

    expect(attribution.profileId).toBe(DEFAULT_PROFILE_SELF_ID);
    expect(attribution.splits).toEqual([{ participantId: 'self', participantName: 'Io', percentage: 100 }]);
  });

  it('ignores saved multi-person splits when the feature is disabled', () => {
    const enabledConfig = makeEnabledConfig();
    const shared = enabledConfig.profiles.find((profile) => profile.id === SHARED_PROFILE_ID)!;
    const disabledConfig = { ...enabledConfig, enabled: false };

    const attribution = resolveExpenseAttribution(
      makeExpense({
        attributionProfileId: shared.id,
        attributionProfileName: shared.name,
        attributionSplits: shared.splits,
      }),
      disabledConfig
    );

    expect(attribution.profileId).toBe(DEFAULT_PROFILE_SELF_ID);
    expect(attribution.splits).toEqual([{ participantId: 'self', participantName: 'Io', percentage: 100 }]);
  });

  it('prefers the most specific active attribution rule', () => {
    const config = makeEnabledConfig();
    const partner = config.profiles.find((profile) => profile.id === PARTNER_PROFILE_ID)!;
    const self = config.profiles.find((profile) => profile.id === DEFAULT_PROFILE_SELF_ID)!;
    config.attributionRules = [
      {
        id: 'category-rule',
        name: 'Spesa personale',
        active: true,
        sortOrder: 0,
        categoryId: 'groceries',
        ownershipProfileId: partner.id,
        ownershipProfileName: partner.name,
        ownershipSplits: partner.splits,
      },
      {
        id: 'subcategory-rule',
        name: 'Pranzo personale',
        active: true,
        sortOrder: 1,
        categoryId: 'groceries',
        subCategoryId: 'lunch',
        ownershipProfileId: self.id,
        ownershipProfileName: self.name,
        ownershipSplits: self.splits,
      },
    ];

    const attribution = resolveExpenseAttribution(
      makeExpense({ categoryId: 'groceries', subCategoryId: 'lunch' }),
      config
    );

    expect(attribution.profileId).toBe(DEFAULT_PROFILE_SELF_ID);
  });

  it('uses the profile version valid on the expense date', () => {
    const config = makeEnabledConfig();
    config.profiles = config.profiles.map((profile) =>
      profile.id === SHARED_PROFILE_ID
        ? {
            ...profile,
            versions: [
              {
                id: 'v-jan',
                validFrom: '2026-01-01',
                splits: [
                  { participantId: 'self', participantName: 'Io', percentage: 50 },
                  { participantId: PARTNER_ID, participantName: 'Moglie', percentage: 50 },
                ],
              },
              {
                id: 'v-jul',
                validFrom: '2026-07-01',
                splits: [
                  { participantId: 'self', participantName: 'Io', percentage: 70 },
                  { participantId: PARTNER_ID, participantName: 'Moglie', percentage: 30 },
                ],
              },
            ],
          }
        : profile
    );

    const juneAttribution = resolveExpenseAttribution(
      makeExpense({
        date: new Date(2026, 5, 30),
        attributionProfileId: SHARED_PROFILE_ID,
        attributionSplits: [{ participantId: 'self', participantName: 'Io', percentage: 100 }],
      }),
      config
    );
    const julyAttribution = resolveExpenseAttribution(
      makeExpense({
        date: new Date(2026, 6, 1),
        attributionProfileId: SHARED_PROFILE_ID,
        attributionSplits: [{ participantId: 'self', participantName: 'Io', percentage: 100 }],
      }),
      config
    );

    expect(juneAttribution.splits).toEqual([
      { participantId: 'self', participantName: 'Io', percentage: 50 },
      { participantId: PARTNER_ID, participantName: 'Moglie', percentage: 50 },
    ]);
    expect(julyAttribution.splits).toEqual([
      { participantId: 'self', participantName: 'Io', percentage: 70 },
      { participantId: PARTNER_ID, participantName: 'Moglie', percentage: 30 },
    ]);
  });
});

describe('ownership profile management helpers', () => {
  it('infers custom profiles for uneven or multi-person splits', () => {
    expect(inferOwnershipProfileType([
      { participantId: 'self', participantName: 'Io', percentage: 70 },
      { participantId: PARTNER_ID, participantName: 'Moglie', percentage: 30 },
    ])).toBe('custom');
    expect(inferOwnershipProfileType([
      { participantId: 'self', participantName: 'Io', percentage: 33.33 },
      { participantId: PARTNER_ID, participantName: 'Moglie', percentage: 33.33 },
      { participantId: 'child', participantName: 'Figlio', percentage: 33.34 },
    ])).toBe('custom');
  });

  it('keeps archived profiles resolvable but excludes them from new assignments', () => {
    const config = makeEnabledConfig();
    config.participants = config.participants.map((participant) =>
      participant.id === PARTNER_ID ? { ...participant, active: false } : participant
    );
    config.profiles = config.profiles.map((profile) =>
      profile.id === SHARED_PROFILE_ID ? { ...profile, archived: true } : profile
    );

    expect(getAssignableOwnershipProfiles(config).map((profile) => profile.id)).toEqual([DEFAULT_PROFILE_SELF_ID]);

    const attribution = resolveExpenseAttribution(
      makeExpense({
        attributionProfileId: SHARED_PROFILE_ID,
        attributionProfileName: 'Comune 50/50',
        attributionSplits: config.profiles.find((profile) => profile.id === SHARED_PROFILE_ID)!.splits,
      }),
      config
    );

    expect(attribution.profileId).toBe(SHARED_PROFILE_ID);
    expect(attribution.splits).toEqual([
      { participantId: 'self', participantName: 'Io', percentage: 50 },
      { participantId: PARTNER_ID, participantName: 'Moglie', percentage: 50 },
    ]);
  });

  it('returns the latest profile version valid for a date', () => {
    const config = makeEnabledConfig();
    const profile = {
      ...config.profiles.find((item) => item.id === SHARED_PROFILE_ID)!,
      versions: [
        {
          id: 'v-1',
          validFrom: '2026-01-01',
          splits: [
            { participantId: 'self', participantName: 'Io', percentage: 60 },
            { participantId: PARTNER_ID, participantName: 'Moglie', percentage: 40 },
          ],
        },
        {
          id: 'v-2',
          validFrom: '2026-09-01',
          splits: [
            { participantId: 'self', participantName: 'Io', percentage: 80 },
            { participantId: PARTNER_ID, participantName: 'Moglie', percentage: 20 },
          ],
        },
      ],
    };

    expect(getProfileSplitsForDate(profile, new Date(2026, 7, 1))).toEqual([
      { participantId: 'self', participantName: 'Io', percentage: 60 },
      { participantId: PARTNER_ID, participantName: 'Moglie', percentage: 40 },
    ]);
    expect(getProfileSplitsForDate(profile, new Date(2026, 8, 1))).toEqual([
      { participantId: 'self', participantName: 'Io', percentage: 80 },
      { participantId: PARTNER_ID, participantName: 'Moglie', percentage: 20 },
    ]);
  });
});

describe('calculateMonthlyCompensations', () => {
  it('calculates who should reimburse whom before settlements', () => {
    const config = makeEnabledConfig();
    const assets = [
      makeAsset({ id: 'cash-self', name: 'Conto personale', ...assignment(config, DEFAULT_PROFILE_SELF_ID) }),
      makeAsset({ id: 'cash-partner', name: 'Conto moglie', ...assignment(config, PARTNER_PROFILE_ID) }),
    ];
    const expenses = [
      makeExpense({
        linkedCashAssetId: 'cash-self',
        attributionProfileId: SHARED_PROFILE_ID,
        attributionProfileName: 'Comune 50/50',
        attributionSplits: config.profiles.find((profile) => profile.id === SHARED_PROFILE_ID)!.splits,
      }),
    ];

    const report = calculateMonthlyCompensations(expenses, assets, [], config, 2026, 1);

    expect(report.rows.find((row) => row.participantId === 'self')?.balance).toBeCloseTo(50);
    expect(report.rows.find((row) => row.participantId === PARTNER_ID)?.balance).toBeCloseTo(-50);
    expect(report.settlementSuggestions).toEqual([
      {
        fromParticipantId: PARTNER_ID,
        fromParticipantName: 'Moglie',
        toParticipantId: 'self',
        toParticipantName: 'Io',
        amount: 50,
      },
    ]);
  });

  it('reduces the open balance with settlement transfers', () => {
    const config = makeEnabledConfig();
    const assets = [
      makeAsset({ id: 'cash-self', name: 'Conto personale', ...assignment(config, DEFAULT_PROFILE_SELF_ID) }),
      makeAsset({ id: 'cash-partner', name: 'Conto moglie', ...assignment(config, PARTNER_PROFILE_ID) }),
    ];
    const expenses = [
      makeExpense({
        linkedCashAssetId: 'cash-self',
        attributionProfileId: SHARED_PROFILE_ID,
        attributionProfileName: 'Comune 50/50',
        attributionSplits: config.profiles.find((profile) => profile.id === SHARED_PROFILE_ID)!.splits,
      }),
    ];

    const report = calculateMonthlyCompensations(
      expenses,
      assets,
      [makeTransfer({})],
      config,
      2026,
      1
    );

    expect(report.rows.find((row) => row.participantId === 'self')?.balance).toBeCloseTo(0);
    expect(report.rows.find((row) => row.participantId === PARTNER_ID)?.balance).toBeCloseTo(0);
    expect(report.settlementSuggestions).toHaveLength(0);
  });
});

describe('buildOwnershipSnapshotBreakdown', () => {
  it('stores split snapshot totals by profile and participant', () => {
    const config = makeEnabledConfig();
    const assets = [
      makeAsset({ id: 'cash-self', quantity: 100, ...assignment(config, DEFAULT_PROFILE_SELF_ID) }),
      makeAsset({ id: 'cash-comune', name: 'Conto Comune', quantity: 200, ...assignment(config, SHARED_PROFILE_ID) }),
    ];

    const breakdown = buildOwnershipSnapshotBreakdown(assets, (asset) => asset.quantity, config);

    expect(breakdown.byAsset[0].ownershipProfileId).toBe(DEFAULT_PROFILE_SELF_ID);
    expect(breakdown.byOwnershipProfile[SHARED_PROFILE_ID].totalValue).toBe(200);
    expect(breakdown.byParticipant.self.totalValue).toBe(200);
    expect(breakdown.byParticipant[PARTNER_ID].totalValue).toBe(100);
  });

  it('stores every asset as self-owned when the feature is disabled', () => {
    const enabledConfig = makeEnabledConfig();
    const disabledConfig = { ...enabledConfig, enabled: false };
    const assets = [
      makeAsset({ id: 'cash-comune', name: 'Conto Comune', quantity: 200, ...assignment(enabledConfig, SHARED_PROFILE_ID) }),
    ];

    const breakdown = buildOwnershipSnapshotBreakdown(assets, (asset) => asset.quantity, disabledConfig);

    expect(breakdown.byAsset[0].ownershipProfileId).toBe(DEFAULT_PROFILE_SELF_ID);
    expect(breakdown.byParticipant.self.totalValue).toBe(200);
    expect(breakdown.byParticipant[PARTNER_ID]).toBeUndefined();
  });

  it('uses profile versions for dated snapshot ownership', () => {
    const config = makeEnabledConfig();
    config.profiles = config.profiles.map((profile) =>
      profile.id === SHARED_PROFILE_ID
        ? {
            ...profile,
            versions: [
              {
                id: 'v-jan',
                validFrom: '2026-01-01',
                splits: [
                  { participantId: 'self', participantName: 'Io', percentage: 50 },
                  { participantId: PARTNER_ID, participantName: 'Moglie', percentage: 50 },
                ],
              },
              {
                id: 'v-jul',
                validFrom: '2026-07-01',
                splits: [
                  { participantId: 'self', participantName: 'Io', percentage: 70 },
                  { participantId: PARTNER_ID, participantName: 'Moglie', percentage: 30 },
                ],
              },
            ],
          }
        : profile
    );
    const assets = [
      makeAsset({ id: 'cash-comune', quantity: 100, ...assignment(config, SHARED_PROFILE_ID) }),
    ];

    const breakdown = buildOwnershipSnapshotBreakdown(
      assets,
      (asset) => asset.quantity,
      config,
      new Date(2026, 6, 1)
    );

    expect(breakdown.byParticipant.self.totalValue).toBe(70);
    expect(breakdown.byParticipant[PARTNER_ID].totalValue).toBe(30);
  });
});
