/**
 * The ONE draft of Impostazioni (2026-10-08).
 *
 * Until then `app/dashboard/settings/page.tsx` held 70 `useState`s in one 4100-line component:
 * every keystroke re-ran the whole function (286 components per key on the laptop with the
 * compiler on, 318 on the Mac — the census, doc/guide/velocita.md), and
 * the six tabs could not become components of their own because Radix unmounts an inactive panel
 * — a view with form state of its own would lose it at every tab change, and «Salva» from
 * another tab would never see it. So the page keeps ONE `useReducer(settingsDraftReducer)` and
 * each tab is a controlled view of its SLICE: it receives the slice, emits a patch, holds nothing.
 *
 * This module is pure (no React, no SDK) so the three things that must never drift are tested
 * against a fixture:
 *   - `sliceSettings(document)` seeds the slices from the saved document — the `loadTargets`
 *     half of the old page, defaults included;
 *   - `composeSettingsDocument(slices, current)` rebuilds the document «Salva» writes — or names
 *     the first broken target rule and WHERE it is (tab, group, field);
 *   - `isSliceDirty(a, b)` is the per-tab dot and the bar at the bottom (the dirty snapshot of
 *     doc/guide/impostazioni.md § Settings — the FIVE places, now a comparison of two slices).
 * `composeSettingsDocument(sliceSettings(doc), doc)` must equal `doc` on every field the page
 * owns (`__tests__/settingsDraft.test.ts`): the bug this structure can reintroduce is a field
 * that does not come back, and the identity test is where it would show.
 *
 * Which slice a field belongs to is the TAB THAT EDITS IT (the dot must land on that tab):
 * Età and risk-free rate are Allocazione's (the Auto-calcolo tile), the default accounts and the
 * transfer fee are Spese's. Condivisione and Aspetto write nothing through «Salva» (the colour
 * theme saves itself, the grants are their own documents), so they have no slice.
 */

import type {
  AssetAllocationSettings,
  AssetAllocationTarget,
  AssetClass,
  FamilyMember,
  SubCategoryTarget,
} from '@/types/assets';
import {
  dropUnnamedSubTargets,
  findTargetProblem,
  type ClassTargetDraft,
  type TargetProblem,
} from '@/lib/utils/allocationTargetValidation';
import { calculateFormulaEquityPercentage, resolveAutoEquityBondsSplit } from '@/lib/utils/equityBondsAutoTargets';

// ─── Identifiers ──────────────────────────────────────────────────────────────────────────

export type SettingsTabId = 'generale' | 'allocazione' | 'spese' | 'dividendi' | 'condivisione' | 'aspetto';

export const SETTINGS_TAB_IDS: readonly SettingsTabId[] = [
  'generale', 'allocazione', 'spese', 'dividendi', 'condivisione', 'aspetto',
];

export function isSettingsTabId(value: string | null | undefined): value is SettingsTabId {
  return (SETTINGS_TAB_IDS as readonly string[]).includes(value ?? '');
}

/**
 * The class rows in the order the Target per classe tile prints them — Azioni → Obbligazioni →
 * Commodities → Immobili → Liquidità → Crypto → Trend Following → Carry. Not `ASSET_CLASS_SEQUENCE`
 * (Allocazione's order): the two have differed since the page was written, and the 2026-10-08
 * split of the page changed no visible order.
 */
export const SETTINGS_CLASS_ORDER: readonly AssetClass[] = [
  'equity', 'bonds', 'commodity', 'realestate', 'cash', 'crypto', 'trendFollowing', 'carry',
];

/** The «none» option of the account and subcategory selects (a Radix Select cannot hold ''). */
export const NO_SELECTION = '__none__';

/**
 * Ids of the target fields «Salva» can send the focus to (see `revealTargetProblem`). A class's
 * own input keeps the bare class id, which its `aria-label` already names.
 */
export const targetFieldId = {
  classPct: (assetClass: AssetClass) => assetClass,
  subToggle: (assetClass: AssetClass) => `toggle-${assetClass}`,
  subName: (assetClass: AssetClass, subIndex: number) => `target-${assetClass}-sub-${subIndex}-name`,
  subPct: (assetClass: AssetClass, subIndex: number) => `target-${assetClass}-sub-${subIndex}-pct`,
  assetName: (assetClass: AssetClass, subIndex: number, assetIndex: number) =>
    `target-${assetClass}-sub-${subIndex}-asset-${assetIndex}-name`,
  assetPct: (assetClass: AssetClass, subIndex: number, assetIndex: number) =>
    `target-${assetClass}-sub-${subIndex}-asset-${assetIndex}-pct`,
  assetAdd: (assetClass: AssetClass, subIndex: number) => `target-${assetClass}-sub-${subIndex}-asset-add`,
};

// ─── Slices ───────────────────────────────────────────────────────────────────────────────

export interface SpecificAssetDraft {
  name: string;
  targetPercentage: number;
}

export interface SubTargetDraft {
  name: string;
  percentage: number;
  specificAssetsEnabled: boolean;
  specificAssets: SpecificAssetDraft[];
  /** UI only — the asset list open under this row. Never written, never part of the dirty check. */
  expanded: boolean;
}

export interface AssetClassDraft {
  targetPercentage: number;
  subCategoryEnabled: boolean;
  /** The subcategory names, kept equal to the named `subTargets` (the datalist and the Costi select read it). */
  categories: string[];
  subTargets: SubTargetDraft[];
  /** UI only — the class's group open in the tile. */
  expanded: boolean;
}

export interface AllocazioneSlice {
  userAge: number | undefined;
  riskFreeRate: number | undefined;
  autoCalculate: boolean;
  cashUseFixedAmount: boolean;
  cashFixedAmount: number;
  classes: Record<AssetClass, AssetClassDraft>;
}

/**
 * Famiglia — string-typed while editing (never fights the reader while typing); a row with no
 * name is one the reader started and left, dropped on write and ignored by the dirty check.
 */
export interface FamilyMemberDraft {
  id: string;
  name: string;
  grossAnnualIncome: string;
  isFirstEmploymentPost2007: boolean;
  firstEmploymentYear: string;
}

export interface GeneraleSlice {
  includePrimaryResidenceInFIRE: boolean;
  goalBasedInvestingEnabled: boolean;
  goalDrivenAllocationEnabled: boolean;
  stampDutyEnabled: boolean;
  stampDutyRate: number;
  checkingAccountSubCategory: string;
  cashflowHistoryStartYear: number;
  laborIncomeCategoryIds: string[];
  costCentersEnabled: boolean;
  expenseSplitEnabled: boolean;
  performanceIncludesPensionFunds: boolean;
  performanceIncludesExcludedAssets: boolean;
  performanceExcludesCash: boolean;
  pensionReturnStartMonth: string;
  monthlyEmailEnabled: boolean;
  quarterlyEmailEnabled: boolean;
  semiAnnualEmailEnabled: boolean;
  yearlyEmailEnabled: boolean;
  weeklyBudgetEmailEnabled: boolean;
  monthlyEmailRecipients: string[];
  familyMembers: FamilyMemberDraft[];
}

export interface SpeseSlice {
  defaultDebitCashAssetId: string;
  defaultCreditCashAssetId: string;
  /** '' = none: the expense form's «Commissione» stays off. */
  transferFeeCategoryId: string;
  transferFeeSubCategoryId: string;
  spendingRolesEnabled: boolean;
}

export interface DividendiSlice {
  dividendIncomeCategoryId: string;
  dividendIncomeSubCategoryId: string;
  dividendCashAssetId: string;
}

/**
 * Read-only declarations: fields OWNED by other pages (FIRE › Calcolatore, Coast FIRE, the
 * Assistant's popover). The page reads them for a tile's reading line and never writes them —
 * no dirty check, not in `composeSettingsDocument`.
 */
export interface SettingsDeclarations {
  planParams: {
    withdrawalRate?: number;
    plannedAnnualExpenses?: number;
    pensionInpsRetirementAge?: number;
    pensionRitaLongUnemployment: boolean;
    respectPensionLockInFire: boolean;
  };
  assistantPrefs: {
    responseStyle?: 'balanced' | 'concise' | 'deep';
    memoryEnabled?: boolean;
    macroContextEnabled?: boolean;
  };
}

export interface SettingsSlices {
  allocazione: AllocazioneSlice;
  generale: GeneraleSlice;
  spese: SpeseSlice;
  dividendi: DividendiSlice;
  declarations: SettingsDeclarations;
}

/** The tabs that have a slice «Salva» writes — the ones that can carry the dot. */
export type WritableTabId = 'allocazione' | 'generale' | 'spese' | 'dividendi';
export const WRITABLE_TABS: readonly WritableTabId[] = ['allocazione', 'generale', 'spese', 'dividendi'];

// ─── Helpers ──────────────────────────────────────────────────────────────────────────────

const roundToTwoDecimals = (value: number): number => Math.round(value * 100) / 100;

const DEFAULT_STAMP_DUTY_RATE = 0.2;
const DEFAULT_HISTORY_START_YEAR = 2025;

/** A class's rows from its saved target entry, in both saved shapes (number, SubCategoryTarget). */
function toSubTargetDrafts(subTargets: AssetAllocationTarget[string]['subTargets']): SubTargetDraft[] {
  if (!subTargets) return [];
  return Object.entries(subTargets).map(([name, value]) =>
    typeof value === 'number'
      ? { name, percentage: value, specificAssetsEnabled: false, specificAssets: [], expanded: false }
      : {
          name,
          percentage: value.targetPercentage,
          specificAssetsEnabled: value.specificAssetsEnabled || false,
          specificAssets: (value.specificAssets || []).map((asset) => ({
            name: asset.name,
            targetPercentage: asset.targetPercentage,
          })),
          expanded: false,
        }
  );
}

/** Every class row from a targets map; a class the map does not name is a 0% row with no rows. */
export function targetsToClassDrafts(targets: AssetAllocationTarget): Record<AssetClass, AssetClassDraft> {
  const classes = {} as Record<AssetClass, AssetClassDraft>;
  for (const assetClass of SETTINGS_CLASS_ORDER) {
    const entry = targets[assetClass];
    classes[assetClass] = {
      targetPercentage: entry?.targetPercentage || 0,
      subCategoryEnabled: entry?.subCategoryConfig?.enabled || false,
      categories: entry?.subCategoryConfig?.categories || [],
      subTargets: toSubTargetDrafts(entry?.subTargets),
      expanded: false,
    };
  }
  return classes;
}

export function toFamilyMemberDrafts(members: FamilyMember[] | undefined): FamilyMemberDraft[] {
  return (members ?? []).map((member) => ({
    id: member.id,
    name: member.name,
    grossAnnualIncome: member.grossAnnualIncome != null ? String(member.grossAnnualIncome) : '',
    isFirstEmploymentPost2007: member.isFirstEmploymentPost2007 ?? false,
    firstEmploymentYear: member.firstEmploymentYear != null ? String(member.firstEmploymentYear) : '',
  }));
}

/** The members as written: unnamed rows dropped, RAL and year parsed (a blank is `undefined`). */
export function parseFamilyMemberDrafts(drafts: FamilyMemberDraft[]): FamilyMember[] {
  return drafts
    .filter((draft) => draft.name.trim() !== '')
    .map((draft) => {
      const ral = Number.parseFloat(draft.grossAnnualIncome.replace(',', '.'));
      const year = Number.parseInt(draft.firstEmploymentYear, 10);
      return {
        id: draft.id,
        name: draft.name.trim(),
        grossAnnualIncome: Number.isFinite(ral) && ral > 0 ? ral : undefined,
        isFirstEmploymentPost2007: draft.isFirstEmploymentPost2007,
        firstEmploymentYear: Number.isInteger(year) ? year : undefined,
      };
    });
}

/**
 * Sum of every class target OUTSIDE the auto-calculated Azioni/Obbligazioni pair. Cash drops out
 * when it is a fixed euro amount: it then lives outside the percentage budget entirely.
 */
export function sumOtherClassTargets(slice: AllocazioneSlice): number {
  return SETTINGS_CLASS_ORDER
    .filter((assetClass) => assetClass !== 'equity' && assetClass !== 'bonds')
    .filter((assetClass) => !(assetClass === 'cash' && slice.cashUseFixedAmount))
    .reduce((sum, assetClass) => sum + (slice.classes[assetClass]?.targetPercentage || 0), 0);
}

/** Σ of the class targets, cash excluded when it is a fixed amount — the Allocazione target tile's number. */
export function sumClassTargets(slice: AllocazioneSlice): number {
  return SETTINGS_CLASS_ORDER.reduce((sum, assetClass) => {
    if (assetClass === 'cash' && slice.cashUseFixedAmount) return sum;
    return sum + (slice.classes[assetClass]?.targetPercentage || 0);
  }, 0);
}

/** The formula's pair for the slice, or `null` while an input is missing. */
export function resolveFormulaSplit(slice: AllocazioneSlice): { equityPercentage: number; bondsPercentage: number } | null {
  if (slice.userAge === undefined || slice.riskFreeRate === undefined) return null;
  return resolveAutoEquityBondsSplit(
    calculateFormulaEquityPercentage(slice.userAge, slice.riskFreeRate),
    sumOtherClassTargets(slice)
  );
}

/**
 * With the formula on, Azioni and Obbligazioni are a function of age, risk-free rate and the
 * other classes: every change to the slice settles the pair here, in the reducer, so the view
 * never holds a frame where the inputs moved and the pair did not. Returns the same object when
 * nothing moved (a reducer must not churn identity on a no-op).
 */
function settleAutoCalculatedPair(slice: AllocazioneSlice): AllocazioneSlice {
  if (!slice.autoCalculate) return slice;
  const split = resolveFormulaSplit(slice);
  if (!split) return slice;
  const { equity, bonds } = slice.classes;
  if (equity.targetPercentage === split.equityPercentage && bonds.targetPercentage === split.bondsPercentage) return slice;
  return {
    ...slice,
    classes: {
      ...slice.classes,
      equity: { ...equity, targetPercentage: split.equityPercentage },
      bonds: { ...bonds, targetPercentage: split.bondsPercentage },
    },
  };
}

/** The target tree as the validation module sees it. */
export function toClassTargetDrafts(slice: AllocazioneSlice): ClassTargetDraft[] {
  return SETTINGS_CLASS_ORDER.map((assetClass) => ({
    assetClass,
    subCategoryEnabled: slice.classes[assetClass]?.subCategoryEnabled ?? false,
    subTargets: slice.classes[assetClass]?.subTargets ?? [],
  }));
}

/** The first rule «Salva» would refuse on the slice as it would be written. */
export function findSliceTargetProblem(slice: AllocazioneSlice): TargetProblem | null {
  return findTargetProblem(sumClassTargets(slice), dropUnnamedSubTargets(toClassTargetDrafts(slice)));
}

// ─── sliceSettings ────────────────────────────────────────────────────────────────────────

/**
 * The six slices from the saved document — the seed of the form at open and at «Annulla».
 *
 * @param document - `getSettings`' answer; `null` when the account has no document yet.
 * @param fallbackTargets - The targets a document without them starts from (`getDefaultTargets()`,
 *   handed in so this module stays SDK-free).
 */
export function sliceSettings(
  document: AssetAllocationSettings | null,
  fallbackTargets: AssetAllocationTarget
): SettingsSlices {
  const data = document ?? ({} as Partial<AssetAllocationSettings>);
  const targets = data.targets || fallbackTargets;
  const cashTarget = targets['cash'];

  const allocazione = settleAutoCalculatedPair({
    userAge: data.userAge,
    riskFreeRate: data.riskFreeRate,
    // The explicit flag when saved; otherwise the presence of both inputs, for accounts that
    // never toggled the switch (the old form's backward-compat rule).
    autoCalculate: data.autoCalculateEquityBonds ?? (data.userAge !== undefined && data.riskFreeRate !== undefined),
    cashUseFixedAmount: cashTarget?.useFixedAmount || false,
    cashFixedAmount: cashTarget?.fixedAmount || 0,
    classes: targetsToClassDrafts(targets),
  });

  const generale: GeneraleSlice = {
    includePrimaryResidenceInFIRE: data.includePrimaryResidenceInFIRE ?? false,
    goalBasedInvestingEnabled: data.goalBasedInvestingEnabled ?? false,
    goalDrivenAllocationEnabled: data.goalDrivenAllocationEnabled ?? false,
    stampDutyEnabled: data.stampDutyEnabled ?? false,
    stampDutyRate: data.stampDutyRate ?? DEFAULT_STAMP_DUTY_RATE,
    checkingAccountSubCategory: data.checkingAccountSubCategory || NO_SELECTION,
    cashflowHistoryStartYear: data.cashflowHistoryStartYear ?? DEFAULT_HISTORY_START_YEAR,
    laborIncomeCategoryIds: data.laborIncomeCategoryIds ?? [],
    costCentersEnabled: data.costCentersEnabled ?? false,
    expenseSplitEnabled: data.expenseSplitEnabled ?? false,
    performanceIncludesPensionFunds: data.performanceIncludesPensionFunds ?? false,
    performanceIncludesExcludedAssets: data.performanceIncludesExcludedAssets ?? false,
    performanceExcludesCash: data.performanceExcludesCash ?? false,
    pensionReturnStartMonth: data.pensionReturnStartMonth ?? '',
    monthlyEmailEnabled: data.monthlyEmailEnabled ?? false,
    quarterlyEmailEnabled: data.quarterlyEmailEnabled ?? false,
    semiAnnualEmailEnabled: data.semiAnnualEmailEnabled ?? false,
    yearlyEmailEnabled: data.yearlyEmailEnabled ?? false,
    weeklyBudgetEmailEnabled: data.weeklyBudgetEmailEnabled ?? false,
    monthlyEmailRecipients: data.monthlyEmailRecipients ?? [],
    familyMembers: toFamilyMemberDrafts(data.familyMembers),
  };

  const spese: SpeseSlice = {
    defaultDebitCashAssetId: data.defaultDebitCashAssetId || NO_SELECTION,
    defaultCreditCashAssetId: data.defaultCreditCashAssetId || NO_SELECTION,
    transferFeeCategoryId: data.transferFeeCategoryId || '',
    transferFeeSubCategoryId: data.transferFeeSubCategoryId || '',
    spendingRolesEnabled: data.spendingRolesEnabled ?? false,
  };

  const dividendi: DividendiSlice = {
    dividendIncomeCategoryId: data.dividendIncomeCategoryId || '',
    dividendIncomeSubCategoryId: data.dividendIncomeSubCategoryId || '',
    dividendCashAssetId: data.dividendCashAssetId || NO_SELECTION,
  };

  const declarations: SettingsDeclarations = {
    planParams: {
      withdrawalRate: data.withdrawalRate,
      plannedAnnualExpenses: data.plannedAnnualExpenses,
      pensionInpsRetirementAge: data.pensionInpsRetirementAge,
      pensionRitaLongUnemployment: data.pensionRitaLongUnemployment ?? false,
      respectPensionLockInFire: data.respectPensionLockInFire ?? false,
    },
    assistantPrefs: {
      responseStyle: data.assistantResponseStyle,
      memoryEnabled: data.assistantMemoryEnabled,
      macroContextEnabled: data.assistantMacroContextEnabled,
    },
  };

  return { allocazione, generale, spese, dividendi, declarations };
}

// ─── composeSettingsDocument ──────────────────────────────────────────────────────────────

/**
 * The allocation slice as «Salva» writes it: a subcategory row with no name is one the reader
 * started and left, so it is dropped (and the class's `categories` follow). Returns the same
 * object when nothing had to go.
 */
export function cleanAllocazioneSlice(slice: AllocazioneSlice): AllocazioneSlice {
  let changed = false;
  const classes = { ...slice.classes };
  for (const assetClass of SETTINGS_CLASS_ORDER) {
    const draft = slice.classes[assetClass];
    if (!draft?.subCategoryEnabled) continue;
    const kept = draft.subTargets.filter((target) => target.name.trim() !== '');
    if (kept.length === draft.subTargets.length) continue;
    changed = true;
    classes[assetClass] = { ...draft, subTargets: kept, categories: kept.map((target) => target.name) };
  }
  return changed ? { ...slice, classes } : slice;
}

/** The targets map from the (cleaned) allocation slice — both saved shapes, as before. */
function composeTargets(slice: AllocazioneSlice): AssetAllocationTarget {
  const targets: AssetAllocationTarget = {};
  for (const assetClass of SETTINGS_CLASS_ORDER) {
    const draft = slice.classes[assetClass];
    targets[assetClass] = {
      targetPercentage: draft.targetPercentage,
      ...(assetClass === 'cash' && {
        useFixedAmount: slice.cashUseFixedAmount,
        fixedAmount: slice.cashFixedAmount,
      }),
      subCategoryConfig: {
        enabled: draft.subCategoryEnabled,
        // Always derived from the rows: a renamed or deleted row never survives in `categories`.
        categories: draft.subCategoryEnabled ? draft.subTargets.map((target) => target.name).filter((name) => name !== '') : [],
      },
    };
    if (draft.subCategoryEnabled && draft.subTargets.length > 0) {
      // Rebuilt from scratch so a deleted or renamed row is gone from the document too.
      targets[assetClass].subTargets = draft.subTargets.reduce<Record<string, number | SubCategoryTarget>>((acc, target) => {
        acc[target.name] =
          target.specificAssetsEnabled && target.specificAssets.length > 0
            ? {
                targetPercentage: target.percentage,
                specificAssetsEnabled: true,
                specificAssets: target.specificAssets.map((asset) => ({ name: asset.name, targetPercentage: asset.targetPercentage })),
              }
            : target.percentage;
        return acc;
      }, {});
    }
  }
  return targets;
}

export type ComposeResult =
  | { ok: true; document: AssetAllocationSettings; cleaned: AllocazioneSlice }
  | { ok: false; problem: TargetProblem; tab: 'allocazione'; cleaned: AllocazioneSlice };

/**
 * The document «Salva» writes, from the slices — or the first broken target rule and its tab.
 *
 * @param slices - The draft as edited.
 * @param current - The document as it is NOW (the pre-read of «Salva»), for the two FIRE fields
 *   the write carries through unchanged.
 */
export function composeSettingsDocument(
  slices: SettingsSlices,
  current: AssetAllocationSettings | null
): ComposeResult {
  const cleaned = cleanAllocazioneSlice(slices.allocazione);
  const problem = findTargetProblem(sumClassTargets(cleaned), toClassTargetDrafts(cleaned));
  if (problem) return { ok: false, problem, tab: 'allocazione', cleaned };

  const { generale, spese, dividendi } = slices;
  const document: AssetAllocationSettings = {
    userAge: cleaned.userAge,
    riskFreeRate: cleaned.riskFreeRate,
    // Stored explicitly so disabling it survives a reload (derived from age+rate it could not be turned off).
    autoCalculateEquityBonds: cleaned.autoCalculate,
    includePrimaryResidenceInFIRE: generale.includePrimaryResidenceInFIRE,
    goalBasedInvestingEnabled: generale.goalBasedInvestingEnabled,
    goalDrivenAllocationEnabled: generale.goalDrivenAllocationEnabled,
    withdrawalRate: current?.withdrawalRate,
    plannedAnnualExpenses: current?.plannedAnnualExpenses,
    targets: composeTargets(cleaned),
    dividendIncomeCategoryId: dividendi.dividendIncomeCategoryId || undefined,
    dividendIncomeSubCategoryId: dividendi.dividendIncomeSubCategoryId || undefined,
    dividendCashAssetId: dividendi.dividendCashAssetId !== NO_SELECTION ? dividendi.dividendCashAssetId : undefined,
    defaultDebitCashAssetId: spese.defaultDebitCashAssetId !== NO_SELECTION ? spese.defaultDebitCashAssetId : undefined,
    defaultCreditCashAssetId: spese.defaultCreditCashAssetId !== NO_SELECTION ? spese.defaultCreditCashAssetId : undefined,
    transferFeeCategoryId: spese.transferFeeCategoryId || undefined,
    transferFeeSubCategoryId: spese.transferFeeSubCategoryId || undefined,
    stampDutyEnabled: generale.stampDutyEnabled,
    stampDutyRate: generale.stampDutyRate,
    checkingAccountSubCategory: generale.checkingAccountSubCategory,
    cashflowHistoryStartYear: generale.cashflowHistoryStartYear,
    laborIncomeCategoryIds: generale.laborIncomeCategoryIds,
    costCentersEnabled: generale.costCentersEnabled,
    expenseSplitEnabled: generale.expenseSplitEnabled,
    spendingRolesEnabled: spese.spendingRolesEnabled,
    performanceIncludesPensionFunds: generale.performanceIncludesPensionFunds,
    performanceIncludesExcludedAssets: generale.performanceIncludesExcludedAssets,
    performanceExcludesCash: generale.performanceExcludesCash,
    // '' = «no month set»: saved as undefined, or pensionReturn would parse it as a date.
    pensionReturnStartMonth: generale.pensionReturnStartMonth || undefined,
    monthlyEmailEnabled: generale.monthlyEmailEnabled,
    quarterlyEmailEnabled: generale.quarterlyEmailEnabled,
    semiAnnualEmailEnabled: generale.semiAnnualEmailEnabled,
    yearlyEmailEnabled: generale.yearlyEmailEnabled,
    weeklyBudgetEmailEnabled: generale.weeklyBudgetEmailEnabled,
    monthlyEmailRecipients: generale.monthlyEmailRecipients,
    familyMembers: parseFamilyMemberDrafts(generale.familyMembers),
  };
  return { ok: true, document, cleaned };
}

// ─── isSliceDirty ─────────────────────────────────────────────────────────────────────────

/**
 * Normalised, order-independent value of a FamilyMember[] — the same function for the saved
 * side and the draft side, so the two are always comparable.
 */
function familyMembersSnapshot(members: FamilyMember[]) {
  return [...members]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((member) => ({
      id: member.id,
      name: member.name,
      grossAnnualIncome: member.grossAnnualIncome !== undefined ? roundToTwoDecimals(member.grossAnnualIncome) : null,
      isFirstEmploymentPost2007: member.isFirstEmploymentPost2007 ?? false,
      firstEmploymentYear: member.firstEmploymentYear ?? null,
    }));
}

/**
 * The persisted content of a slice as a comparable string: percentages at two decimals (what the
 * page writes), lists whose order the UI shuffles sorted, the UI-only flags (`expanded`) left out.
 */
function snapshotSlice(tab: WritableTabId, slices: SettingsSlices): string {
  switch (tab) {
    case 'allocazione': {
      const slice = slices.allocazione;
      return JSON.stringify({
        userAge: slice.userAge ?? null,
        riskFreeRate: slice.riskFreeRate ?? null,
        autoCalculate: slice.autoCalculate,
        cashUseFixedAmount: slice.cashUseFixedAmount,
        cashFixedAmount: roundToTwoDecimals(slice.cashFixedAmount),
        classes: SETTINGS_CLASS_ORDER.map((assetClass) => {
          const draft = slice.classes[assetClass];
          return {
            assetClass,
            targetPercentage: roundToTwoDecimals(draft?.targetPercentage || 0),
            subCategoryEnabled: draft?.subCategoryEnabled || false,
            categories: draft?.categories || [],
            subTargets: (draft?.subTargets || []).map((target) => ({
              name: target.name,
              percentage: roundToTwoDecimals(target.percentage),
              specificAssetsEnabled: target.specificAssetsEnabled,
              specificAssets: target.specificAssets.map((asset) => ({
                name: asset.name,
                targetPercentage: roundToTwoDecimals(asset.targetPercentage),
              })),
            })),
          };
        }),
      });
    }
    case 'generale': {
      const { familyMembers, laborIncomeCategoryIds, monthlyEmailRecipients, stampDutyRate, ...rest } = slices.generale;
      return JSON.stringify({
        ...rest,
        stampDutyRate: roundToTwoDecimals(stampDutyRate),
        laborIncomeCategoryIds: [...laborIncomeCategoryIds].sort(),
        monthlyEmailRecipients: [...monthlyEmailRecipients].sort(),
        familyMembers: familyMembersSnapshot(parseFamilyMemberDrafts(familyMembers)),
      });
    }
    case 'spese':
      return JSON.stringify(slices.spese);
    case 'dividendi':
      return JSON.stringify(slices.dividendi);
  }
}

/** Whether a tab holds an edit «Salva» would write — the dot on the tab and the bar at the bottom. */
export function isSliceDirty(tab: WritableTabId, draft: SettingsSlices, saved: SettingsSlices): boolean {
  return snapshotSlice(tab, draft) !== snapshotSlice(tab, saved);
}

// ─── revealTargetProblem ──────────────────────────────────────────────────────────────────

/**
 * Where «Salva» takes the reader for a broken target rule: the class's group opened (and the
 * subcategory's asset list, for an asset rule) in the returned slice, and the id of the field
 * to focus. The page dispatches the slice, activates Allocazione and sets the pending focus; the
 * view consumes it once mounted.
 */
export function revealTargetProblem(
  problem: TargetProblem,
  slice: AllocazioneSlice
): { slice: AllocazioneSlice; fieldId: string } {
  if (problem.kind === 'total-below-100') {
    // The first class the reader can type into (the formula owns Azioni/Obbligazioni when on).
    const editable = SETTINGS_CLASS_ORDER.find(
      (assetClass) => !(slice.autoCalculate && (assetClass === 'equity' || assetClass === 'bonds'))
    );
    return { slice, fieldId: targetFieldId.classPct(editable ?? SETTINGS_CLASS_ORDER[0]) };
  }

  const { assetClass } = problem;
  const draft = slice.classes[assetClass];
  const subTargets = [...draft.subTargets];
  let fieldId: string;
  if (problem.kind === 'sub-total') {
    // The first row as the list shows it (sorted by name), so the focus lands at the top.
    const firstShown = subTargets
      .map((target, index) => ({ name: target.name, index }))
      .sort((a, b) => a.name.localeCompare(b.name))[0];
    fieldId = firstShown ? targetFieldId.subPct(assetClass, firstShown.index) : targetFieldId.subToggle(assetClass);
  } else if (problem.kind === 'sub-name-duplicate') {
    fieldId = targetFieldId.subName(assetClass, problem.subIndex);
  } else {
    subTargets[problem.subIndex] = { ...subTargets[problem.subIndex], expanded: true };
    fieldId =
      problem.kind === 'specific-empty'
        ? targetFieldId.assetAdd(assetClass, problem.subIndex)
        : problem.kind === 'specific-total'
          ? targetFieldId.assetPct(assetClass, problem.subIndex, 0)
          : problem.kind === 'specific-out-of-range'
            ? targetFieldId.assetPct(assetClass, problem.subIndex, problem.assetIndex)
            : targetFieldId.assetName(assetClass, problem.subIndex, problem.assetIndex);
  }
  return {
    slice: { ...slice, classes: { ...slice.classes, [assetClass]: { ...draft, expanded: true, subTargets } } },
    fieldId,
  };
}

// ─── The reducer ──────────────────────────────────────────────────────────────────────────

export interface SettingsDraft {
  /** The slices as edited. */
  slices: SettingsSlices;
  /** The slices as last read or written — the other side of the dirty comparison. */
  saved: SettingsSlices;
  /** `true` once a document has been read: before that nothing can be dirty and nothing is saved. */
  loaded: boolean;
  /** A field id «Salva» wants focused; the view of its tab consumes it at mount. */
  pendingFocus: string | null;
}

export type SettingsDraftAction =
  | { type: 'reset'; document: AssetAllocationSettings | null; fallbackTargets: AssetAllocationTarget }
  | { type: 'saved'; cleaned: AllocazioneSlice }
  | { type: 'generale/set'; patch: Partial<GeneraleSlice> }
  | { type: 'spese/set'; patch: Partial<SpeseSlice> }
  | { type: 'dividendi/set'; patch: Partial<DividendiSlice> }
  | { type: 'allocazione/set'; patch: Partial<Omit<AllocazioneSlice, 'classes'>> }
  | { type: 'allocazione/setClass'; assetClass: AssetClass; patch: Partial<AssetClassDraft> }
  | { type: 'allocazione/replace'; slice: AllocazioneSlice }
  | { type: 'allocazione/replaceTargets'; targets: AssetAllocationTarget }
  | { type: 'focus'; fieldId: string }
  | { type: 'focusConsumed' };

/** The draft before the first read: every slice at its defaults, nothing dirty, nothing to focus. */
export function createSettingsDraft(): SettingsDraft {
  const slices = sliceSettings(null, {});
  return { slices, saved: slices, loaded: false, pendingFocus: null };
}

function withAllocazione(state: SettingsDraft, slice: AllocazioneSlice): SettingsDraft {
  const settled = settleAutoCalculatedPair(slice);
  return settled === state.slices.allocazione ? state : { ...state, slices: { ...state.slices, allocazione: settled } };
}

export function settingsDraftReducer(state: SettingsDraft, action: SettingsDraftAction): SettingsDraft {
  switch (action.type) {
    case 'reset': {
      // A re-read replaces BOTH sides: the form shows the saved document and nothing is dirty.
      const slices = sliceSettings(action.document, action.fallbackTargets);
      return { slices, saved: slices, loaded: true, pendingFocus: null };
    }
    case 'saved': {
      // The baseline is what was WRITTEN (the cleaned tree), so a dropped empty row does not
      // leave Allocazione marked as unsaved.
      const slices = { ...state.slices, allocazione: action.cleaned };
      return { ...state, slices, saved: slices };
    }
    case 'generale/set':
      return { ...state, slices: { ...state.slices, generale: { ...state.slices.generale, ...action.patch } } };
    case 'spese/set':
      return { ...state, slices: { ...state.slices, spese: { ...state.slices.spese, ...action.patch } } };
    case 'dividendi/set':
      return { ...state, slices: { ...state.slices, dividendi: { ...state.slices.dividendi, ...action.patch } } };
    case 'allocazione/set':
      return withAllocazione(state, { ...state.slices.allocazione, ...action.patch });
    case 'allocazione/setClass': {
      const { classes } = state.slices.allocazione;
      return withAllocazione(state, {
        ...state.slices.allocazione,
        classes: { ...classes, [action.assetClass]: { ...classes[action.assetClass], ...action.patch } },
      });
    }
    case 'allocazione/replace':
      return withAllocazione(state, action.slice);
    case 'allocazione/replaceTargets': {
      // «Ripristina default»: the FACTORY targets — the cash fixed-amount pair follows them.
      const cash = action.targets['cash'];
      return withAllocazione(state, {
        ...state.slices.allocazione,
        cashUseFixedAmount: cash?.useFixedAmount || false,
        cashFixedAmount: cash?.fixedAmount || 0,
        classes: targetsToClassDrafts(action.targets),
      });
    }
    case 'focus':
      return { ...state, pendingFocus: action.fieldId };
    case 'focusConsumed':
      return state.pendingFocus === null ? state : { ...state, pendingFocus: null };
  }
}
