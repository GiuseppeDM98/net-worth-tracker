import type { Asset, MonthlySnapshot } from '@/types/assets';
import type { Expense } from '@/types/expenses';
import type { InternalTransfer } from '@/types/investments';
import {
  DEFAULT_PARTICIPANT_SELF_ID,
  DEFAULT_PROFILE_SELF_ID,
  type AttributionRule,
  type HouseholdConfig,
  type HouseholdParticipant,
  type OwnershipProfile,
  type OwnershipProfileType,
  type OwnershipSplit,
} from '@/types/household';
import { getItalyDate, getItalyMonthYear, toDate } from '@/lib/utils/dateHelpers';

const EPSILON = 0.01;

export interface OwnershipAssignment {
  profileId: string;
  profileName: string;
  splits: OwnershipSplit[];
}

export interface ParticipantAllocation {
  participantId: string;
  participantName: string;
  amount: number;
}

export interface CompensationParticipantRow {
  participantId: string;
  participantName: string;
  paid: number;
  attributed: number;
  settlementPaid: number;
  settlementReceived: number;
  balance: number;
}

export interface SettlementSuggestion {
  fromParticipantId: string;
  fromParticipantName: string;
  toParticipantId: string;
  toParticipantName: string;
  amount: number;
}

export interface MonthlyCompensationReport {
  year: number;
  month: number;
  totalExpenses: number;
  rows: CompensationParticipantRow[];
  settlementSuggestions: SettlementSuggestion[];
}

function split(participantId: string, participantName: string, percentage: number): OwnershipSplit {
  return { participantId, participantName, percentage };
}

export function getDefaultHouseholdParticipants(): HouseholdParticipant[] {
  return [
    {
      id: DEFAULT_PARTICIPANT_SELF_ID,
      name: 'Io',
      role: 'self',
      sortOrder: 0,
      active: true,
      isDefault: true,
    },
  ];
}

export function getDefaultOwnershipProfiles(): OwnershipProfile[] {
  return [
    {
      id: DEFAULT_PROFILE_SELF_ID,
      name: 'Io 100%',
      type: 'personal',
      splits: [split(DEFAULT_PARTICIPANT_SELF_ID, 'Io', 100)],
      sortOrder: 0,
      active: true,
      isDefault: true,
    },
  ];
}

export function getDefaultHouseholdConfig(userId = ''): HouseholdConfig {
  return {
    userId,
    enabled: false,
    participants: getDefaultHouseholdParticipants(),
    profiles: getDefaultOwnershipProfiles(),
    attributionRules: [],
    defaultAssetProfileId: DEFAULT_PROFILE_SELF_ID,
    defaultExpenseProfileId: DEFAULT_PROFILE_SELF_ID,
    defaultIncomeProfileId: DEFAULT_PROFILE_SELF_ID,
  };
}

export function isHouseholdEnabled(config: HouseholdConfig | null | undefined): boolean {
  return config?.enabled === true;
}

function getSelfProfile(): OwnershipProfile {
  return getDefaultOwnershipProfiles()[0];
}

export function getEffectiveHouseholdParticipants(
  config: HouseholdConfig | null | undefined
): HouseholdParticipant[] {
  const self = getDefaultHouseholdParticipants()[0];
  if (!isHouseholdEnabled(config)) {
    return [self];
  }

  const participants = (config?.participants?.length ? config.participants : [self])
    .filter((participant) => participant.active !== false)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  if (participants.some((participant) => participant.id === DEFAULT_PARTICIPANT_SELF_ID)) {
    return participants;
  }

  return [self, ...participants].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function getEffectiveOwnershipProfiles(
  config: HouseholdConfig | null | undefined
): OwnershipProfile[] {
  const self = getSelfProfile();
  if (!isHouseholdEnabled(config)) {
    return [self];
  }

  const profiles = (config?.profiles?.length ? config.profiles : [self])
    .filter((profile) => profile.active !== false)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  if (profiles.some((profile) => profile.id === DEFAULT_PROFILE_SELF_ID)) {
    return profiles;
  }

  return [self, ...profiles].sort((a, b) => a.sortOrder - b.sortOrder);
}

function getDateKey(date: Date | string | undefined | null = new Date()): string {
  const italyDate = getItalyDate(date ?? new Date());
  const year = italyDate.getFullYear();
  const month = String(italyDate.getMonth() + 1).padStart(2, '0');
  const day = String(italyDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function inferOwnershipProfileType(splits: OwnershipSplit[]): OwnershipProfileType {
  const normalized = normalizeOwnershipSplits(splits);
  if (normalized.length === 1 && Math.abs(normalized[0].percentage - 100) <= EPSILON) {
    return 'personal';
  }
  if (normalized.length === 2 && normalized.every((item) => Math.abs(item.percentage - 50) <= EPSILON)) {
    return 'shared';
  }
  return 'custom';
}

export function getProfileSplitsForDate(
  profile: OwnershipProfile,
  date: Date | string | undefined | null = new Date()
): OwnershipSplit[] {
  const dateKey = getDateKey(date);
  const matchingVersion = [...(profile.versions ?? [])]
    .filter((version) => {
      const validTo = version.validTo || '9999-12-31';
      return version.validFrom <= dateKey && validTo >= dateKey && validateOwnershipSplits(version.splits).isValid;
    })
    .sort((a, b) => b.validFrom.localeCompare(a.validFrom))[0];

  return normalizeOwnershipSplits(matchingVersion?.splits ?? profile.splits);
}

export function isOwnershipProfileAssignable(
  profile: OwnershipProfile,
  config: HouseholdConfig | null | undefined
): boolean {
  if (!isHouseholdEnabled(config)) {
    return profile.id === DEFAULT_PROFILE_SELF_ID;
  }
  if (profile.active === false || profile.archived === true) return false;

  const activeParticipantIds = new Set(getEffectiveHouseholdParticipants(config).map((participant) => participant.id));
  return getProfileSplitsForDate(profile).every((split) => activeParticipantIds.has(split.participantId));
}

export function getAssignableOwnershipProfiles(
  config: HouseholdConfig | null | undefined
): OwnershipProfile[] {
  return getEffectiveOwnershipProfiles(config).filter((profile) => isOwnershipProfileAssignable(profile, config));
}

export function validateOwnershipSplits(splits: OwnershipSplit[]): { isValid: boolean; message?: string } {
  if (!splits.length) {
    return { isValid: false, message: 'Serve almeno un partecipante.' };
  }

  if (splits.some((item) => item.percentage < 0 || item.percentage > 100)) {
    return { isValid: false, message: 'Le percentuali devono essere tra 0 e 100.' };
  }

  const total = splits.reduce((sum, item) => sum + item.percentage, 0);
  if (Math.abs(total - 100) > EPSILON) {
    return { isValid: false, message: `Le percentuali devono sommare 100%. Totale attuale: ${total.toFixed(2)}%.` };
  }

  return { isValid: true };
}

export function normalizeOwnershipSplits(splits: OwnershipSplit[]): OwnershipSplit[] {
  return splits
    .filter((item) => item.percentage > 0)
    .map((item) => ({
      participantId: item.participantId,
      participantName: item.participantName,
      percentage: Number(item.percentage.toFixed(6)),
    }));
}

export function getOwnershipProfile(
  config: HouseholdConfig | null | undefined,
  profileId: string | undefined
): OwnershipProfile | undefined {
  return getEffectiveOwnershipProfiles(config).find((profile) => profile.id === profileId);
}

export function getDefaultProfile(config: HouseholdConfig | null | undefined, profileId?: string): OwnershipProfile {
  const resolvedConfig = config ?? getDefaultHouseholdConfig();
  const effectiveProfiles = getEffectiveOwnershipProfiles(resolvedConfig);
  const fallbackId = isHouseholdEnabled(resolvedConfig)
    ? profileId ?? resolvedConfig.defaultAssetProfileId
    : DEFAULT_PROFILE_SELF_ID;

  return (
    effectiveProfiles.find((profile) => profile.id === fallbackId) ??
    effectiveProfiles.find((profile) => profile.id === resolvedConfig.defaultAssetProfileId) ??
    effectiveProfiles.find((profile) => profile.id === DEFAULT_PROFILE_SELF_ID) ??
    getSelfProfile()
  );
}

export function profileToAssignment(
  profile: OwnershipProfile,
  date: Date | string | undefined | null = new Date()
): OwnershipAssignment {
  return {
    profileId: profile.id,
    profileName: profile.name,
    splits: getProfileSplitsForDate(profile, date),
  };
}

function hasValidSplits(splits: OwnershipSplit[] | undefined): splits is OwnershipSplit[] {
  return !!splits?.length && validateOwnershipSplits(splits).isValid;
}

export function resolveAssetOwnership(
  asset: Pick<Asset, 'ownershipProfileId' | 'ownershipProfileName' | 'ownershipSplits'>,
  config?: HouseholdConfig | null,
  date?: Date | string | null
): OwnershipAssignment {
  const resolvedConfig = config ?? getDefaultHouseholdConfig();
  const storedProfile = getOwnershipProfile(resolvedConfig, asset.ownershipProfileId);

  if (
    isHouseholdEnabled(resolvedConfig) &&
    asset.ownershipProfileId &&
    storedProfile?.versions?.length
  ) {
    return profileToAssignment(storedProfile, date);
  }

  if (
    isHouseholdEnabled(resolvedConfig) &&
    asset.ownershipProfileId &&
    storedProfile &&
    hasValidSplits(asset.ownershipSplits)
  ) {
    return {
      profileId: asset.ownershipProfileId,
      profileName: asset.ownershipProfileName ?? asset.ownershipProfileId,
      splits: normalizeOwnershipSplits(asset.ownershipSplits),
    };
  }

  const profile = getDefaultProfile(resolvedConfig, asset.ownershipProfileId ?? resolvedConfig.defaultAssetProfileId);
  return profileToAssignment(profile, date);
}

function ruleMatchesExpense(rule: AttributionRule, expense: Expense): boolean {
  if (rule.active === false) return false;
  if (rule.expenseType && rule.expenseType !== expense.type) return false;
  if (rule.categoryId && rule.categoryId !== expense.categoryId) return false;
  if (rule.subCategoryId && rule.subCategoryId !== expense.subCategoryId) return false;
  if (rule.linkedCashAssetId && rule.linkedCashAssetId !== expense.linkedCashAssetId) return false;
  return true;
}

function ruleSpecificity(rule: AttributionRule): number {
  return [
    rule.linkedCashAssetId,
    rule.subCategoryId,
    rule.categoryId,
    rule.expenseType,
  ].filter(Boolean).length;
}

export function findAttributionRule(expense: Expense, config: HouseholdConfig): AttributionRule | undefined {
  if (!isHouseholdEnabled(config)) return undefined;

  return [...config.attributionRules]
    .filter((rule) => ruleMatchesExpense(rule, expense))
    .sort((a, b) => {
      const specificityDiff = ruleSpecificity(b) - ruleSpecificity(a);
      if (specificityDiff !== 0) return specificityDiff;
      return a.sortOrder - b.sortOrder;
    })[0];
}

export function resolveExpenseAttribution(
  expense: Pick<Expense, 'type' | 'categoryId' | 'subCategoryId' | 'linkedCashAssetId' | 'attributionProfileId' | 'attributionProfileName' | 'attributionSplits'> & Partial<Pick<Expense, 'date'>>,
  config?: HouseholdConfig | null
): OwnershipAssignment {
  const resolvedConfig = config ?? getDefaultHouseholdConfig();
  const effectiveDate = toDate((expense as Expense).date);
  const attributionProfile = getOwnershipProfile(resolvedConfig, expense.attributionProfileId);

  if (
    isHouseholdEnabled(resolvedConfig) &&
    expense.attributionProfileId &&
    attributionProfile?.versions?.length
  ) {
    return profileToAssignment(attributionProfile, effectiveDate);
  }

  if (
    isHouseholdEnabled(resolvedConfig) &&
    expense.attributionProfileId &&
    attributionProfile &&
    hasValidSplits(expense.attributionSplits)
  ) {
    return {
      profileId: expense.attributionProfileId,
      profileName: expense.attributionProfileName ?? expense.attributionProfileId,
      splits: normalizeOwnershipSplits(expense.attributionSplits),
    };
  }

  const fullExpense = expense as Expense;
  const rule = findAttributionRule(fullExpense, resolvedConfig);
  if (rule && hasValidSplits(rule.ownershipSplits)) {
    const ruleProfile = getOwnershipProfile(resolvedConfig, rule.ownershipProfileId);
    if (ruleProfile?.versions?.length) {
      return profileToAssignment(ruleProfile, effectiveDate);
    }

    return {
      profileId: rule.ownershipProfileId,
      profileName: rule.ownershipProfileName,
      splits: normalizeOwnershipSplits(rule.ownershipSplits),
    };
  }

  const fallbackId = expense.type === 'income'
    ? resolvedConfig.defaultIncomeProfileId
    : resolvedConfig.defaultExpenseProfileId;
  return profileToAssignment(getDefaultProfile(resolvedConfig, fallbackId), effectiveDate);
}

export function allocateAmountBySplits(amount: number, splits: OwnershipSplit[]): ParticipantAllocation[] {
  return normalizeOwnershipSplits(splits).map((item) => ({
    participantId: item.participantId,
    participantName: item.participantName,
    amount: amount * (item.percentage / 100),
  }));
}

function addAmount(
  map: Map<string, CompensationParticipantRow>,
  participants: HouseholdParticipant[],
  allocation: ParticipantAllocation,
  field: keyof Pick<CompensationParticipantRow, 'paid' | 'attributed' | 'settlementPaid' | 'settlementReceived'>
) {
  const fallback = participants.find((participant) => participant.id === allocation.participantId);
  const current = map.get(allocation.participantId) ?? {
    participantId: allocation.participantId,
    participantName: allocation.participantName || fallback?.name || allocation.participantId,
    paid: 0,
    attributed: 0,
    settlementPaid: 0,
    settlementReceived: 0,
    balance: 0,
  };
  current[field] += allocation.amount;
  map.set(allocation.participantId, current);
}

function buildSettlementSuggestions(rows: CompensationParticipantRow[]): SettlementSuggestion[] {
  const debtors = rows
    .filter((row) => row.balance < -EPSILON)
    .map((row) => ({ ...row, remaining: Math.abs(row.balance) }));
  const creditors = rows
    .filter((row) => row.balance > EPSILON)
    .map((row) => ({ ...row, remaining: row.balance }));

  const suggestions: SettlementSuggestion[] = [];
  for (const debtor of debtors) {
    for (const creditor of creditors) {
      if (debtor.remaining <= EPSILON) break;
      if (creditor.remaining <= EPSILON) continue;

      const amount = Math.min(debtor.remaining, creditor.remaining);
      suggestions.push({
        fromParticipantId: debtor.participantId,
        fromParticipantName: debtor.participantName,
        toParticipantId: creditor.participantId,
        toParticipantName: creditor.participantName,
        amount,
      });
      debtor.remaining -= amount;
      creditor.remaining -= amount;
    }
  }

  return suggestions;
}

export function calculateMonthlyCompensations(
  expenses: Expense[],
  assets: Asset[],
  transfers: InternalTransfer[],
  config: HouseholdConfig,
  year: number,
  month: number
): MonthlyCompensationReport {
  const rows = new Map<string, CompensationParticipantRow>();
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  const effectiveParticipants = getEffectiveHouseholdParticipants(config);
  let totalExpenses = 0;

  for (const expense of expenses) {
    const period = getItalyMonthYear(toDate(expense.date));
    if (period.year !== year || period.month !== month || expense.type === 'income') continue;

    const amount = Math.abs(expense.amount);
    totalExpenses += amount;

    const paymentAsset = expense.linkedCashAssetId ? assetsById.get(expense.linkedCashAssetId) : undefined;
    const payerAssignment = paymentAsset
      ? resolveAssetOwnership(paymentAsset, config, toDate(expense.date))
      : resolveExpenseAttribution(expense, config);
    const attributionAssignment = resolveExpenseAttribution(expense, config);

    for (const allocation of allocateAmountBySplits(amount, payerAssignment.splits)) {
      addAmount(rows, effectiveParticipants, allocation, 'paid');
    }
    for (const allocation of allocateAmountBySplits(amount, attributionAssignment.splits)) {
      addAmount(rows, effectiveParticipants, allocation, 'attributed');
    }
  }

  for (const transfer of transfers) {
    const period = getItalyMonthYear(toDate(transfer.date));
    if (period.year !== year || period.month !== month) continue;
    if (transfer.purpose !== 'reimbursement' && transfer.purpose !== 'settlement') continue;

    const fromAsset = assetsById.get(transfer.fromCashAssetId);
    const toAsset = assetsById.get(transfer.toCashAssetId);
    if (!fromAsset || !toAsset) continue;

    const amount = Math.abs(transfer.amount);
    const fromAssignment = resolveAssetOwnership(fromAsset, config, toDate(transfer.date));
    const toAssignment = resolveAssetOwnership(toAsset, config, toDate(transfer.date));

    for (const allocation of allocateAmountBySplits(amount, fromAssignment.splits)) {
      addAmount(rows, effectiveParticipants, allocation, 'settlementPaid');
    }
    for (const allocation of allocateAmountBySplits(amount, toAssignment.splits)) {
      addAmount(rows, effectiveParticipants, allocation, 'settlementReceived');
    }
  }

  for (const participant of effectiveParticipants) {
    if (!rows.has(participant.id)) {
      rows.set(participant.id, {
        participantId: participant.id,
        participantName: participant.name,
        paid: 0,
        attributed: 0,
        settlementPaid: 0,
        settlementReceived: 0,
        balance: 0,
      });
    }
  }

  const resultRows = Array.from(rows.values())
    .map((row) => ({
      ...row,
      balance: row.paid - row.attributed + row.settlementPaid - row.settlementReceived,
    }))
    .sort((a, b) => {
      const orderA = effectiveParticipants.find((participant) => participant.id === a.participantId)?.sortOrder ?? 99;
      const orderB = effectiveParticipants.find((participant) => participant.id === b.participantId)?.sortOrder ?? 99;
      return orderA - orderB;
    });

  return {
    year,
    month,
    totalExpenses,
    rows: resultRows,
    settlementSuggestions: buildSettlementSuggestions(resultRows),
  };
}

export function buildOwnershipSnapshotBreakdown(
  assets: Asset[],
  calculateValue: (asset: Asset) => number,
  config: HouseholdConfig = getDefaultHouseholdConfig(),
  date: Date | string | null = new Date()
) {
  const byOwnershipProfile: NonNullable<MonthlySnapshot['byOwnershipProfile']> = {};
  const byParticipant: NonNullable<MonthlySnapshot['byParticipant']> = {};

  const byAsset = assets
    .filter((asset) => asset.quantity > 0)
    .map((asset) => {
      const ownership = resolveAssetOwnership(asset, config, date);
      const totalValue = calculateValue(asset);

      byOwnershipProfile[ownership.profileId] = byOwnershipProfile[ownership.profileId] ?? {
        profileName: ownership.profileName,
        totalValue: 0,
      };
      byOwnershipProfile[ownership.profileId].totalValue += totalValue;

      for (const allocation of allocateAmountBySplits(totalValue, ownership.splits)) {
        byParticipant[allocation.participantId] = byParticipant[allocation.participantId] ?? {
          participantName: allocation.participantName,
          totalValue: 0,
        };
        byParticipant[allocation.participantId].totalValue += allocation.amount;
      }

      return {
        assetId: asset.id,
        ticker: asset.ticker,
        name: asset.name,
        quantity: asset.quantity,
        price: asset.currentPrice,
        totalValue,
        ownershipProfileId: ownership.profileId,
        ownershipProfileName: ownership.profileName,
        ownershipSplits: ownership.splits,
      };
    });

  return { byAsset, byOwnershipProfile, byParticipant };
}
