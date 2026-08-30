/**
 * SETTINGS PAGE
 *
 * Centralized configuration for portfolio targets and preferences.
 *
 * CONFIGURATION SECTIONS:
 * 1. Asset Allocation Targets (3-level hierarchy: Asset Class → Sub-Category → Specific Assets)
 * 2. Performance Settings (age, risk-free rate for calculations)
 * 3. Expense Categories (income/expense/dividend categories)
 * 4. Dividend Sync Configuration
 *
 * AUTO-CALCULATION FEATURE:
 * When enabled, equity and bonds % calculated automatically using rule of thumb:
 * - Equity = 100 - userAge (younger = more risk tolerance)
 * - Bonds = remainder after equity + other asset classes
 * Based on Bogleheads investment principles.
 *
 * PERCENTAGE VALIDATION:
 * - Asset classes must sum to AT LEAST 100% (or remainder if cash uses fixed €); above 100% is a
 *   legitimate target leverage (exactly 100% = no leverage)
 * - Sub-categories must sum to 100% within parent
 * - Specific assets must sum to 100% within parent sub-category
 * All validations run on save with clear error messages.
 *
 * KEY TRADE-OFFS:
 * - Complex nested state vs flat structure: Nested chosen to mirror target hierarchy
 * - Auto-calculation vs manual: Optional auto-calc simplifies for users following standard advice
 * - Immediate validation vs save-time: Save-time chosen to avoid interrupting user flow
 */

'use client';

import React, { Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import {
  getSettings,
  setSettings,
  getDefaultTargets,
  calculateEquityPercentage,
  validateSpecificAssets,
} from '@/lib/services/assetAllocationService';
import { resolveAutoEquityBondsSplit } from '@/lib/utils/equityBondsAutoTargets';
import { AssetAllocationTarget, AssetClass, SubCategoryTarget as SubCategoryTargetType, FamilyMember } from '@/types/assets';
import { useQueryClient } from '@tanstack/react-query';
import { formatNumber, formatPercentage } from '@/lib/services/chartService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Save, RotateCcw, Plus, Trash2, ChevronDown, Edit, Receipt, FlaskConical, Coins, ArrowRightLeft, Settings, PieChart, Palette, X, Send, Users, Sun, Moon, Monitor } from 'lucide-react';
import { AccountSharingSection } from '@/components/settings/AccountSharingSection';
import ExpenseImportSection from '@/components/settings/ExpenseImportSection';
import { queryKeys } from '@/lib/query/queryKeys';
import { useColorTheme, ColorTheme } from '@/contexts/ColorThemeContext';
import { TabsContent } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { ExpenseCategory, ExpenseType, EXPENSE_TYPE_LABELS } from '@/types/expenses';
import { Asset } from '@/types/assets';
import { getAllAssets } from '@/lib/services/assetService';
import { getAllCategories, deleteCategory, getCategoryById } from '@/lib/services/expenseCategoryService';
import { getExpenseCountByCategoryId, reassignExpensesCategory, clearExpensesCategoryAssignment, moveExpensesToCategory, TransferBoundaryError } from '@/lib/services/expenseService';
import { CategoryManagementDialog } from '@/components/expenses/CategoryManagementDialog';
import { CategoryDeleteConfirmDialog } from '@/components/expenses/CategoryDeleteConfirmDialog';
import { CategoryMoveDialog } from '@/components/expenses/CategoryMoveDialog';
import { getLazyIcon } from '@/components/expenses/IconPickerPopover';
import { CreateDummySnapshotModal } from '@/components/CreateDummySnapshotModal';
import { DeleteDummyDataDialog } from '@/components/DeleteDummyDataDialog';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { PageTabs } from '@/components/layout/PageTabs';
import type { TabDef } from '@/components/layout/PageTabBar';
import { Tile, TILE_CELL_CLASS, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { TileGridSkeleton } from '@/components/ui/tile-grid-skeleton';
import { applyThemeWithTransition } from '@/lib/utils/themeTransition';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { resolveRitaUnlockAge, DEFAULT_INPS_RETIREMENT_AGE } from '@/lib/utils/pensionUnlock';
import {
  describeAllocationTotal,
  describeAssistantPreferences,
  describeAutoCalc,
  describeBtpItalia,
  describeCashflowSettings,
  describeClassTargets,
  describeColorTheme,
  describeCosts,
  describeDefaultAccounts,
  describeDividendCategory,
  describeExpenseCategories,
  describeEmails,
  describeFamily,
  describeFireToggles,
  describePerformanceBase,
  describePlanParameters,
  describeProfile,
  describeThemeMode,
  summarizeExpenseCategories,
  type ThemeMode,
} from '@/lib/utils/settingsNarrative';

interface SubTarget {
  name: string;
  percentage: number;
  specificAssetsEnabled?: boolean;
  specificAssets?: SpecificAsset[];
  expanded?: boolean; // For UI state (expand/collapse specific assets)
}

interface SpecificAsset {
  name: string;
  targetPercentage: number;
}

interface AssetClassState {
  targetPercentage: number;
  subCategoryEnabled: boolean;
  categories: string[];
  subTargets: SubTarget[];
  expanded: boolean;
}

const assetClassLabels: Record<AssetClass, string> = {
  equity: 'Azioni (Equity)',
  bonds: 'Obbligazioni (Bonds)',
  crypto: 'Criptovalute (Crypto)',
  realestate: 'Immobili (Real Estate)',
  cash: 'Liquidità (Cash)',
  commodity: 'Materie Prime (Commodity)',
  trendFollowing: 'Trend Following',
  carry: 'Carry',
};

// Order: Azioni → Obbligazioni → Commodities → Real Estate → Cash → Crypto → Trend Following → Carry.
// trendFollowing/carry get a settable target here from L2 on:
// alt-beta sleeves whose desired notional exposure can push the total above 100% (= target leverage).
const assetClasses: AssetClass[] = [
  'equity',
  'bonds',
  'commodity',
  'realestate',
  'cash',
  'crypto',
  'trendFollowing',
  'carry',
];

// Helper function to round to 2 decimal places
const roundToTwoDecimals = (value: number): number => {
  return Math.round(value * 100) / 100;
};

// A percentage with only the decimals the value carries (100 → «100%», 3,5 → «3,5%»).
const pctLabel = (value: number): string => formatPercentage(value, value % 1 === 0 ? 0 : 1);

// The words the Assistant's own popover uses for the response styles.
const ASSISTANT_STYLE_LABELS: Record<'balanced' | 'concise' | 'deep', string> = {
  balanced: 'Bilanciato',
  concise: 'Conciso',
  deep: 'Approfondito',
};

/**
 * Sum of every asset-class target OUTSIDE the auto-calculated Azioni/Obbligazioni pair.
 *
 * Cash drops out of the sum when it is configured as a fixed euro amount: it then lives outside
 * the percentage budget entirely, which is what the total row means by "(excl. cash)".
 */
const sumOtherClassTargets = (
  states: Record<AssetClass, AssetClassState>,
  cashUseFixedAmount: boolean
): number =>
  assetClasses
    .filter((assetClass) => assetClass !== 'equity' && assetClass !== 'bonds')
    .filter((assetClass) => !(assetClass === 'cash' && cashUseFixedAmount))
    .reduce((sum, assetClass) => sum + (states[assetClass]?.targetPercentage || 0), 0);

// Leverage-aware: the target percentages are desired NOTIONAL exposure over invested capital, so a
// total of EXACTLY 100 means "no leverage" and anything ABOVE 100 is a legitimate target leverage
// Only an under-allocated total (< 100) is invalid. Shared by handleSave's guard and the
// render-time isValidTotal so the two can never drift apart.
const isTargetTotalValid = (total: number): boolean => total >= 100 - 0.01;

// Famiglia — household members a pension fund can be attributed to (Impostazioni → Preferenze).
// String-typed draft (never fights the user while typing), same shape as CoastFireTab's pension/tax
// bracket draft editors — plain useState array, no react-hook-form field array anywhere in Settings.
interface FamilyMemberDraft {
  id: string;
  name: string;
  grossAnnualIncome: string;
  isFirstEmploymentPost2007: boolean;
  firstEmploymentYear: string;
}

// Local id generator — CoastFireTab.tsx has an identical `createLocalId`, not exported; duplicated
// here rather than introducing a cross-module import for a one-line helper.
function createFamilyMemberId(): string {
  return `family-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toFamilyMemberDrafts(members: FamilyMember[] | undefined): FamilyMemberDraft[] {
  return (members ?? []).map((member) => ({
    id: member.id,
    name: member.name,
    grossAnnualIncome: member.grossAnnualIncome != null ? String(member.grossAnnualIncome) : '',
    isFirstEmploymentPost2007: member.isFirstEmploymentPost2007 ?? false,
    firstEmploymentYear: member.firstEmploymentYear != null ? String(member.firstEmploymentYear) : '',
  }));
}

// Drops rows with an empty/whitespace-only name (same cleanup-before-validation precedent as the
// empty-subcategory-row cleanup in handleSave) — a nameless member can't be attributed to anything.
function parseFamilyMemberDrafts(drafts: FamilyMemberDraft[]): FamilyMember[] {
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

// Normalized, order-independent snapshot of a FamilyMember[] for the dirty-state comparison —
// used for BOTH the saved baseline and the live draft state so the two are always comparable.
function familyMembersSnapshotValue(members: FamilyMember[]) {
  return [...members]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((member) => ({
      id: member.id,
      name: member.name,
      grossAnnualIncome:
        member.grossAnnualIncome !== undefined ? roundToTwoDecimals(member.grossAnnualIncome) : null,
      isFirstEmploymentPost2007: member.isFirstEmploymentPost2007 ?? false,
      firstEmploymentYear: member.firstEmploymentYear ?? null,
    }));
}

// Module-level tab definitions drive both the mobile pill and the desktop underline tabs.
const SETTINGS_TABS: TabDef[] = [
  { value: 'allocazione', label: 'Allocazione', icon: PieChart },
  { value: 'generale',    label: 'Preferenze',  icon: Settings },
  { value: 'spese',       label: 'Spese',       icon: Receipt  },
  { value: 'dividendi',   label: 'Dividendi',   icon: Coins    },
  { value: 'condivisione', label: 'Condivisione', icon: Users   },
  { value: 'aspetto',     label: 'Aspetto',     icon: Palette  },
];

// The assistant is a route gated by this flag; its state tile follows the same gate.
const SHOW_ASSISTANT = process.env.NEXT_PUBLIC_ASSISTANT_AI_ENABLED !== 'false';

// Stable no-op store for the SSR/hydration split (same guard ThemePicker uses).
const neverChanges = () => () => {};

// Aspetto → Modalità: the three next-themes modes, applied with the circle view transition.
const THEME_MODES = [
  { value: 'light',  label: 'Chiaro',  Icon: Sun     },
  { value: 'dark',   label: 'Scuro',   Icon: Moon    },
  { value: 'system', label: 'Sistema', Icon: Monitor },
] as const;

// Aspetto → Tema colori. Swatch previews carry each theme's own oklch values on purpose:
// they PREVIEW a palette that is not active, which no CSS token can express.
const COLOR_THEME_SWATCHES = [
  {
    id: 'default' as ColorTheme,
    name: 'Default',
    description: 'Zinc classico',
    swatchBg: 'oklch(1 0 0)',
    swatchBgDark: 'oklch(0.145 0 0)',
    swatchPrimary: 'oklch(0.205 0 0)',
    swatchPrimaryDark: 'oklch(0.922 0 0)',
    swatchAccent: 'oklch(0.97 0 0)',
  },
  {
    id: 'solar-dusk' as ColorTheme,
    name: 'Solar Dusk',
    description: 'Ambra calda',
    swatchBg: 'oklch(0.9885 0.0057 84.5659)',
    swatchBgDark: 'oklch(0.2161 0.0061 56.0434)',
    swatchPrimary: 'oklch(0.5553 0.1455 48.9975)',
    swatchPrimaryDark: 'oklch(0.7049 0.1867 47.6044)',
    swatchAccent: 'oklch(0.9000 0.0500 74.9889)',
  },
  {
    id: 'elegant-luxury' as ColorTheme,
    name: 'Elegant Luxury',
    description: 'Borgogna raffinato',
    swatchBg: 'oklch(0.9779 0.0042 56.3756)',
    swatchBgDark: 'oklch(0.2161 0.0061 56.0434)',
    swatchPrimary: 'oklch(0.4650 0.1470 24.9381)',
    swatchPrimaryDark: 'oklch(0.5054 0.1905 27.5181)',
    swatchAccent: 'oklch(0.9619 0.0580 95.6174)',
  },
  {
    id: 'midnight-bloom' as ColorTheme,
    name: 'Midnight Bloom',
    description: 'Viola profondo',
    swatchBg: 'oklch(0.9821 0 0)',
    swatchBgDark: 'oklch(0.2303 0.0125 264.2926)',
    swatchPrimary: 'oklch(0.5676 0.2021 283.0838)',
    swatchPrimaryDark: 'oklch(0.5676 0.2021 283.0838)',
    swatchAccent: 'oklch(0.8214 0.0720 249.3482)',
  },
  {
    id: 'cyberpunk' as ColorTheme,
    name: 'Cyberpunk',
    description: 'Neon pink & teal',
    swatchBg: 'oklch(0.9816 0.0017 247.8390)',
    swatchBgDark: 'oklch(0.1649 0.0352 281.8285)',
    swatchPrimary: 'oklch(0.6726 0.2904 341.4084)',
    swatchPrimaryDark: 'oklch(0.6726 0.2904 341.4084)',
    swatchAccent: 'oklch(0.8903 0.1739 171.2690)',
  },
  {
    id: 'retro-arcade' as ColorTheme,
    name: 'Retro Arcade',
    description: 'Rosso & teal vintage',
    swatchBg: 'oklch(0.9735 0.0261 90.0953)',
    swatchBgDark: 'oklch(0.2673 0.0486 219.8169)',
    swatchPrimary: 'oklch(0.5924 0.2025 355.8943)',
    swatchPrimaryDark: 'oklch(0.5924 0.2025 355.8943)',
    swatchAccent: 'oklch(0.6437 0.1019 187.3840)',
  },
] as const;

/** Label · mono value row of a read-only declaration tile (Parametri del piano, Assistente, BTP Italia). */
function DeclarationRow({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <span className={cn('text-[13px] font-semibold', mono && 'font-mono tabular-nums')}>{value}</span>
    </div>
  );
}

export default function SettingsPage() {
  const { user } = useAuth();
  const { ownerId } = useActiveAccount();
  const isDemo = useDemoMode();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userAge, setUserAge] = useState<number | undefined>(undefined);
  const [riskFreeRate, setRiskFreeRate] = useState<number | undefined>(undefined);
  const [autoCalculate, setAutoCalculate] = useState(false);
  const [cashUseFixedAmount, setCashUseFixedAmount] = useState(false);
  const [cashFixedAmount, setCashFixedAmount] = useState<number>(0);
  const [includePrimaryResidenceInFIRE, setIncludePrimaryResidenceInFIRE] = useState<boolean>(false);
  const [goalBasedInvestingEnabled, setGoalBasedInvestingEnabled] = useState<boolean>(false);
  const [goalDrivenAllocationEnabled, setGoalDrivenAllocationEnabled] = useState<boolean>(false);
  const [stampDutyEnabled, setStampDutyEnabled] = useState<boolean>(false);
  const [stampDutyRate, setStampDutyRate] = useState<number>(0.2);
  const [checkingAccountSubCategory, setCheckingAccountSubCategory] = useState<string>('__none__');
  const [cashflowHistoryStartYear, setCashflowHistoryStartYear] = useState<number>(2025);
  const [laborIncomeCategoryIds, setLaborIncomeCategoryIds] = useState<string[]>([]);
  const [costCentersEnabled, setCostCentersEnabled] = useState<boolean>(false);
  const [performanceIncludesPensionFunds, setPerformanceIncludesPensionFunds] = useState<boolean>(false);
  const [performanceIncludesExcludedAssets, setPerformanceIncludesExcludedAssets] = useState<boolean>(false);
  const [pensionReturnStartMonth, setPensionReturnStartMonth] = useState<string>('');
  // Read-only declarations (state + link tiles). These fields are OWNED by other pages —
  // FIRE › Calcolatore (Parametri), Coast FIRE (Ipotesi), the Assistant's preferences popover —
  // so this page reads them for the tile's reading line and never writes them (no snapshot).
  const [planParams, setPlanParams] = useState<{
    withdrawalRate?: number;
    plannedAnnualExpenses?: number;
    pensionInpsRetirementAge?: number;
    pensionRitaLongUnemployment: boolean;
    respectPensionLockInFire: boolean;
  }>({ pensionRitaLongUnemployment: false, respectPensionLockInFire: false });
  const [assistantPrefs, setAssistantPrefs] = useState<{
    responseStyle?: 'balanced' | 'concise' | 'deep';
    memoryEnabled?: boolean;
    macroContextEnabled?: boolean;
  }>({});
  const [monthlyEmailEnabled, setMonthlyEmailEnabled] = useState<boolean>(false);
  const [quarterlyEmailEnabled, setQuarterlyEmailEnabled] = useState<boolean>(false);
  const [semiAnnualEmailEnabled, setSemiAnnualEmailEnabled] = useState<boolean>(false);
  const [yearlyEmailEnabled, setYearlyEmailEnabled] = useState<boolean>(false);
  const [weeklyBudgetEmailEnabled, setWeeklyBudgetEmailEnabled] = useState<boolean>(false);
  const [monthlyEmailRecipients, setMonthlyEmailRecipients] = useState<string[]>([]);
  const [newEmailInput, setNewEmailInput] = useState<string>('');
  const [sendingTestEmailType, setSendingTestEmailType] = useState<'monthly' | 'quarterly' | 'semiannual' | 'yearly' | 'weekly-budget' | null>(null);
  const [assetClassStates, setAssetClassStates] = useState<
    Record<AssetClass, AssetClassState>
  >({} as Record<AssetClass, AssetClassState>);

  // Track original subcategory names to handle renames (Bug #2 fix)
  const [subcategoryNameMap, setSubcategoryNameMap] = useState<{
    [assetClass: string]: { [currentName: string]: string }; // currentName -> originalName
  }>({});

  // Expense categories state
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ExpenseCategory | null>(null);

  // Delete confirmation dialog state
  const [deleteConfirmDialogOpen, setDeleteConfirmDialogOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<ExpenseCategory | null>(null);
  const [expenseCountToReassign, setExpenseCountToReassign] = useState(0);

  // Move dialog state
  const [moveCategoryDialogOpen, setMoveCategoryDialogOpen] = useState(false);
  const [categoryToMove, setCategoryToMove] = useState<ExpenseCategory | null>(null);
  const [expenseCountToMove, setExpenseCountToMove] = useState(0);

  // Default cash account settings
  const [cashAssets, setCashAssets] = useState<Asset[]>([]);
  const [defaultDebitCashAssetId, setDefaultDebitCashAssetId] = useState<string>('__none__');
  const [defaultCreditCashAssetId, setDefaultCreditCashAssetId] = useState<string>('__none__');

  // Dividend settings state
  const [dividendIncomeCategoryId, setDividendIncomeCategoryId] = useState<string>('');
  const [dividendIncomeSubCategoryId, setDividendIncomeSubCategoryId] = useState<string>('');
  const [syncingDividends, setSyncingDividends] = useState(false);

  // 2-click disarm for zero-expense category deletion (avoids window.confirm)
  const [pendingDeleteDirectCategoryId, setPendingDeleteDirectCategoryId] = useState<string | null>(null);
  const pendingDeleteDirectTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 2-click disarm for dividend sync confirmation (avoids window.confirm)
  const [syncConfirmArmed, setSyncConfirmArmed] = useState(false);
  const syncConfirmTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Progressive disclosure: notes block in Allocazione tab
  const [isNotesOpen, setIsNotesOpen] = useState(false);

  // Test snapshot modal state
  const [dummySnapshotModalOpen, setDummySnapshotModalOpen] = useState(false);
  const [deleteDummyDataDialogOpen, setDeleteDummyDataDialogOpen] = useState(false);
  const enableTestSnapshots = process.env.NEXT_PUBLIC_ENABLE_TEST_SNAPSHOTS === 'true';

  // Tab navigation — lazy-loading pattern (same as Assets/Cashflow pages)
  type SettingsTabId = 'generale' | 'allocazione' | 'spese' | 'dividendi' | 'condivisione' | 'aspetto';
  const VALID_TABS: SettingsTabId[] = ['generale', 'allocazione', 'spese', 'dividendi', 'condivisione', 'aspetto'];
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const initialTab = (VALID_TABS.includes(searchParams.get('tab') as SettingsTabId)
    ? searchParams.get('tab') as SettingsTabId
    : 'allocazione');
  const [mountedTabs, setMountedTabs] = useState<Set<SettingsTabId>>(new Set([initialTab]));
  const [activeTab, setActiveTab] = useState<SettingsTabId>(initialTab);
  const { colorTheme, setColorTheme } = useColorTheme();
  const { theme, setTheme } = useTheme();
  // The active next-themes mode does not exist until hydration (same guard as ThemePicker).
  const isThemeHydrated = useSyncExternalStore(neverChanges, () => true, () => false);
  const [allocationBaselineKey, setAllocationBaselineKey] = useState('');
  const [generalBaselineKey, setGeneralBaselineKey] = useState('');
  const [familyMemberDrafts, setFamilyMemberDrafts] = useState<FamilyMemberDraft[]>([]);
  const [dividendBaselineKey, setDividendBaselineKey] = useState('');
  const [deleteDialogOrigin, setDeleteDialogOrigin] = useState<string | undefined>(
    undefined
  );
  const [moveDialogOrigin, setMoveDialogOrigin] = useState<string | undefined>(
    undefined
  );

  const interactiveControlClass =
    'motion-safe:transition-[border-color,box-shadow,background-color,color] motion-safe:duration-150 motion-reduce:transition-none';

  const calculateDialogOrigin = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    const x = ((rect.left + rect.width / 2) / window.innerWidth) * 100;
    const y = ((rect.top + rect.height / 2) / window.innerHeight) * 100;
    return `${x.toFixed(2)}% ${y.toFixed(2)}%`;
  };

  const handleTabChange = (value: string) => {
    setActiveTab(value as SettingsTabId);
    setMountedTabs((prev) => new Set(prev).add(value as SettingsTabId));
    router.replace(`${pathname}?tab=${value}`, { scroll: false });
  };

  // Sync URL on mount so the initial tab is always reflected
  useEffect(() => {
    router.replace(`${pathname}?tab=${initialTab}`, { scroll: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (user && ownerId) {
      loadTargets();
      loadExpenseCategories();
      getAllAssets(ownerId).then((assets) =>
        // Default debit/credit account picker: an actual conto, not just a "cash-class" asset —
        // a money-market ETF (assetClass 'cash') is not a settlement account. Strict convention
        // (convenzione stretta, AGENTS.md → hardening 2026-07-26).
        setCashAssets(assets.filter((a) => a.type === 'cash' && a.assetClass === 'cash'))
      );
    }
  }, [user, ownerId]);

  // Auto-calculate equity and bonds percentages when age or risk-free rate changes
  useEffect(() => {
    if (
      autoCalculate &&
      userAge !== undefined &&
      riskFreeRate !== undefined &&
      Object.keys(assetClassStates).length > 0
    ) {
      const { equityPercentage, bondsPercentage } = resolveAutoEquityBondsSplit(
        calculateEquityPercentage(userAge, riskFreeRate),
        sumOtherClassTargets(assetClassStates, cashUseFixedAmount)
      );

      // Update equity and bonds percentages
      setAssetClassStates((prev) => ({
        ...prev,
        equity: {
          ...prev.equity,
          targetPercentage: equityPercentage,
        },
        bonds: {
          ...prev.bonds,
          targetPercentage: bondsPercentage,
        },
      }));
    }
  }, [userAge, riskFreeRate, autoCalculate]);

  // Recalculate the pair when another asset class changes. Both targets move now, not just
  // bonds: the other classes are funded out of the equity sleeve, so raising the crypto target
  // lowers Azioni while Obbligazioni stay at the formula's residual.
  useEffect(() => {
    if (
      autoCalculate &&
      userAge !== undefined &&
      riskFreeRate !== undefined &&
      Object.keys(assetClassStates).length > 0
    ) {
      const { equityPercentage, bondsPercentage } = resolveAutoEquityBondsSplit(
        calculateEquityPercentage(userAge, riskFreeRate),
        sumOtherClassTargets(assetClassStates, cashUseFixedAmount)
      );

      // Only update when something actually moved — this effect also runs as a consequence of
      // its own writes, and an unconditional setState would loop.
      if (
        assetClassStates.equity?.targetPercentage !== equityPercentage ||
        assetClassStates.bonds?.targetPercentage !== bondsPercentage
      ) {
        setAssetClassStates((prev) => ({
          ...prev,
          equity: {
            ...prev.equity,
            targetPercentage: equityPercentage,
          },
          bonds: {
            ...prev.bonds,
            targetPercentage: bondsPercentage,
          },
        }));
      }
    }
  }, [
    assetClassStates.crypto?.targetPercentage,
    assetClassStates.realestate?.targetPercentage,
    assetClassStates.cash?.targetPercentage,
    assetClassStates.commodity?.targetPercentage,
    assetClassStates.trendFollowing?.targetPercentage,
    assetClassStates.carry?.targetPercentage,
    cashUseFixedAmount,
  ]);

  const loadTargets = async () => {
    if (!user || !ownerId) return;

    try {
      setLoading(true);
      const settingsData = await getSettings(ownerId);
      const targets = settingsData?.targets || getDefaultTargets();

      // Load user age and risk-free rate if available
      if (settingsData) {
        setUserAge(settingsData.userAge);
        setRiskFreeRate(settingsData.riskFreeRate);
        // Use explicit persisted flag when available; fall back to presence of age+rate for
        // backward-compat with existing users who never explicitly toggled the switch.
        setAutoCalculate(
          settingsData.autoCalculateEquityBonds ??
          (settingsData.userAge !== undefined && settingsData.riskFreeRate !== undefined)
        );
        // Load FIRE setting (Bug #1 fix)
        setIncludePrimaryResidenceInFIRE(settingsData.includePrimaryResidenceInFIRE ?? false);
        setGoalBasedInvestingEnabled(settingsData.goalBasedInvestingEnabled ?? false);
        setGoalDrivenAllocationEnabled(settingsData.goalDrivenAllocationEnabled ?? false);
        // Load default cash account settings
        setDefaultDebitCashAssetId(settingsData.defaultDebitCashAssetId || '__none__');
        setDefaultCreditCashAssetId(settingsData.defaultCreditCashAssetId || '__none__');
        // Load stamp duty settings
        setStampDutyEnabled(settingsData.stampDutyEnabled ?? false);
        setStampDutyRate(settingsData.stampDutyRate ?? 0.2);
        setCheckingAccountSubCategory(settingsData.checkingAccountSubCategory || '__none__');
        setCashflowHistoryStartYear(settingsData.cashflowHistoryStartYear ?? 2025);
        setLaborIncomeCategoryIds(settingsData.laborIncomeCategoryIds ?? []);
        setCostCentersEnabled(settingsData.costCentersEnabled ?? false);
        setPerformanceIncludesPensionFunds(settingsData.performanceIncludesPensionFunds ?? false);
        setPerformanceIncludesExcludedAssets(settingsData.performanceIncludesExcludedAssets ?? false);
        setPensionReturnStartMonth(settingsData.pensionReturnStartMonth ?? '');
        setMonthlyEmailEnabled(settingsData.monthlyEmailEnabled ?? false);
        setQuarterlyEmailEnabled(settingsData.quarterlyEmailEnabled ?? false);
        setSemiAnnualEmailEnabled(settingsData.semiAnnualEmailEnabled ?? false);
        setYearlyEmailEnabled(settingsData.yearlyEmailEnabled ?? false);
        setWeeklyBudgetEmailEnabled(settingsData.weeklyBudgetEmailEnabled ?? false);
        setMonthlyEmailRecipients(settingsData.monthlyEmailRecipients ?? []);
        // Load dividend settings
        setDividendIncomeCategoryId(settingsData.dividendIncomeCategoryId || '');
        setDividendIncomeSubCategoryId(settingsData.dividendIncomeSubCategoryId || '');
        // Load family members (fondo pensione per-taxpayer RAL/eligibility)
        setFamilyMemberDrafts(toFamilyMemberDrafts(settingsData.familyMembers));
        // Read-only declarations for the state+link tiles (owned by the FIRE pages / Assistant)
        setPlanParams({
          withdrawalRate: settingsData.withdrawalRate,
          plannedAnnualExpenses: settingsData.plannedAnnualExpenses,
          pensionInpsRetirementAge: settingsData.pensionInpsRetirementAge,
          pensionRitaLongUnemployment: settingsData.pensionRitaLongUnemployment ?? false,
          respectPensionLockInFire: settingsData.respectPensionLockInFire ?? false,
        });
        setAssistantPrefs({
          responseStyle: settingsData.assistantResponseStyle,
          memoryEnabled: settingsData.assistantMemoryEnabled,
          macroContextEnabled: settingsData.assistantMacroContextEnabled,
        });
      }

      // Load cash fixed amount settings if available
      const cashTargetData = targets['cash'];
      if (cashTargetData) {
        setCashUseFixedAmount(cashTargetData.useFixedAmount || false);
        setCashFixedAmount(cashTargetData.fixedAmount || 0);
      }

      const states: Record<AssetClass, AssetClassState> = {} as Record<
        AssetClass,
        AssetClassState
      >;

      // Initialize subcategoryNameMap for rename tracking (Bug #2 fix)
      const nameMapByAssetClass: {
        [assetClass: string]: { [currentName: string]: string };
      } = {};

      assetClasses.forEach((assetClass) => {
        const targetData = targets[assetClass];
        const subCategoryConfig = targetData?.subCategoryConfig;
        const subTargets = targetData?.subTargets;

        const subTargetsArray = subTargets
          ? Object.entries(subTargets).map(([name, value]) => {
              // Support both old format (number) and new format (SubCategoryTarget)
              if (typeof value === 'number') {
                return {
                  name,
                  percentage: value,
                };
              } else {
                return {
                  name,
                  percentage: value.targetPercentage,
                  specificAssetsEnabled: value.specificAssetsEnabled || false,
                  specificAssets: value.specificAssets || [],
                  expanded: false,
                };
              }
            })
          : [];

        // Initialize name map: current name -> original name (initially same)
        const nameMap: { [name: string]: string } = {};
        subTargetsArray.forEach(st => {
          nameMap[st.name] = st.name;
        });
        nameMapByAssetClass[assetClass] = nameMap;

        states[assetClass] = {
          targetPercentage: targetData?.targetPercentage || 0,
          subCategoryEnabled: subCategoryConfig?.enabled || false,
          categories: subCategoryConfig?.categories || [],
          subTargets: subTargetsArray,
          expanded: false,
        };
      });

      setAssetClassStates(states);
      setSubcategoryNameMap(nameMapByAssetClass);

      setAllocationBaselineKey(
        JSON.stringify({
          autoCalculate:
            settingsData?.autoCalculateEquityBonds ??
            (settingsData?.userAge !== undefined && settingsData?.riskFreeRate !== undefined),
          cashUseFixedAmount: cashTargetData?.useFixedAmount || false,
          cashFixedAmount: roundToTwoDecimals(cashTargetData?.fixedAmount || 0),
          assetClassStates: assetClasses.map((assetClass) => ({
            assetClass,
            targetPercentage: roundToTwoDecimals(
              states[assetClass]?.targetPercentage || 0
            ),
            subCategoryEnabled: states[assetClass]?.subCategoryEnabled || false,
            categories: states[assetClass]?.categories || [],
            subTargets: (states[assetClass]?.subTargets || []).map((target) => ({
              name: target.name,
              percentage: roundToTwoDecimals(target.percentage),
              specificAssetsEnabled: target.specificAssetsEnabled || false,
              specificAssets: (target.specificAssets || []).map((asset) => ({
                name: asset.name,
                targetPercentage: roundToTwoDecimals(asset.targetPercentage),
              })),
            })),
          })),
        })
      );

      setGeneralBaselineKey(
        JSON.stringify({
          // Età and risk-free are edited from Preferenze → Profilo (they still feed the
          // Allocazione formula, whose equity/bonds targets sit in the allocation snapshot).
          userAge: settingsData?.userAge ?? null,
          riskFreeRate: settingsData?.riskFreeRate ?? null,
          includePrimaryResidenceInFIRE:
            settingsData?.includePrimaryResidenceInFIRE ?? false,
          goalBasedInvestingEnabled: settingsData?.goalBasedInvestingEnabled ?? false,
          goalDrivenAllocationEnabled:
            settingsData?.goalDrivenAllocationEnabled ?? false,
          stampDutyEnabled: settingsData?.stampDutyEnabled ?? false,
          stampDutyRate: roundToTwoDecimals(settingsData?.stampDutyRate ?? 0.2),
          checkingAccountSubCategory:
            settingsData?.checkingAccountSubCategory || '__none__',
          defaultDebitCashAssetId:
            settingsData?.defaultDebitCashAssetId || '__none__',
          defaultCreditCashAssetId:
            settingsData?.defaultCreditCashAssetId || '__none__',
          cashflowHistoryStartYear: settingsData?.cashflowHistoryStartYear ?? 2025,
          laborIncomeCategoryIds: [...(settingsData?.laborIncomeCategoryIds ?? [])].sort(),
          costCentersEnabled: settingsData?.costCentersEnabled ?? false,
          performanceIncludesPensionFunds: settingsData?.performanceIncludesPensionFunds ?? false,
          performanceIncludesExcludedAssets: settingsData?.performanceIncludesExcludedAssets ?? false,
          pensionReturnStartMonth: settingsData?.pensionReturnStartMonth ?? '',
          monthlyEmailEnabled: settingsData?.monthlyEmailEnabled ?? false,
          quarterlyEmailEnabled: settingsData?.quarterlyEmailEnabled ?? false,
          semiAnnualEmailEnabled: settingsData?.semiAnnualEmailEnabled ?? false,
          yearlyEmailEnabled: settingsData?.yearlyEmailEnabled ?? false,
          weeklyBudgetEmailEnabled: settingsData?.weeklyBudgetEmailEnabled ?? false,
          monthlyEmailRecipients: [...(settingsData?.monthlyEmailRecipients ?? [])].sort(),
          familyMembers: familyMembersSnapshotValue(settingsData?.familyMembers ?? []),
        })
      );

      setDividendBaselineKey(
        JSON.stringify({
          dividendIncomeCategoryId: settingsData?.dividendIncomeCategoryId || '',
          dividendIncomeSubCategoryId:
            settingsData?.dividendIncomeSubCategoryId || '',
        })
      );
    } catch (error) {
      console.error('Error loading targets:', error);
      toast.error('Errore nel caricamento dei target');
    } finally {
      setLoading(false);
    }
  };

  const loadExpenseCategories = async () => {
    if (!user || !ownerId) return;

    try {
      setLoadingCategories(true);
      const categories = await getAllCategories(ownerId);
      setExpenseCategories(categories);
    } catch (error) {
      console.error('Error loading expense categories:', error);
      toast.error('Errore nel caricamento delle categorie spese');
    } finally {
      setLoadingCategories(false);
    }
  };

  // Refresh categories (the import may have created new ones) and invalidate every
  // Cashflow query key that reads expenses/categories/overview data, so the freshly
  // imported transactions show up without a manual page reload.
  const handleExpenseImported = () => {
    loadExpenseCategories();
    if (ownerId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all(ownerId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.expenses.categories(ownerId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.overview(ownerId) });
    }
  };

  const handleAddExpenseCategory = () => {
    setEditingCategory(null);
    setCategoryDialogOpen(true);
  };

  const handleEditExpenseCategory = (category: ExpenseCategory) => {
    setEditingCategory(category);
    setCategoryDialogOpen(true);
  };

  const handleDeleteExpenseCategory = async (
    categoryId: string,
    categoryName: string,
    triggerOrigin?: string
  ) => {
    if (!user || !ownerId) return;

    try {
      // Check if there are expenses associated with this category
      const expenseCount = await getExpenseCountByCategoryId(categoryId, ownerId);

      if (expenseCount > 0) {
        // Show reassignment dialog
        const category = await getCategoryById(categoryId);
        if (category) {
          setCategoryToDelete(category);
          setExpenseCountToReassign(expenseCount);
          setDeleteDialogOrigin(triggerOrigin);
          setDeleteConfirmDialogOpen(true);
        }
      } else {
        // No expenses: arm the 2-click disarm instead of blocking window.confirm.
        // First click sets the pending state; the button turns destructive.
        // Second click calls handleConfirmDirectDelete. Auto-disarms after 3s.
        if (pendingDeleteDirectTimerRef.current) clearTimeout(pendingDeleteDirectTimerRef.current);
        setPendingDeleteDirectCategoryId(categoryId);
        pendingDeleteDirectTimerRef.current = setTimeout(() => {
          setPendingDeleteDirectCategoryId(null);
        }, 3000);
      }
    } catch (error) {
      console.error('Error deleting category:', error);
      toast.error('Errore nell\'eliminazione della categoria');
    }
  };

  const handleConfirmDeleteWithReassignment = async (
    newCategoryId?: string,
    newSubCategoryId?: string
  ) => {
    if (!categoryToDelete || !user || !ownerId) return;

    try {
      // If no new category ID provided, delete without reassignment
      if (!newCategoryId) {
        // Clear category assignment from expenses (set to "Senza categoria")
        const clearedCount = await clearExpensesCategoryAssignment(
          categoryToDelete.id,
          ownerId
        );

        // Delete the category
        await deleteCategory(categoryToDelete.id);

        toast.success(
          `Categoria "${categoryToDelete.name}" eliminata con successo. ${clearedCount} ${clearedCount === 1 ? 'spesa contrassegnata' : 'spese contrassegnate'} come "Senza categoria".`
        );

        // Reset state and reload categories
        setDeleteConfirmDialogOpen(false);
        setCategoryToDelete(null);
        setExpenseCountToReassign(0);
        await loadExpenseCategories();
        return;
      }

      // Get the new category details
      const newCategory = await getCategoryById(newCategoryId);
      if (!newCategory) {
        toast.error('Categoria di destinazione non trovata');
        return;
      }

      // Get subcategory name if provided
      let newSubCategoryName: string | undefined;
      if (newSubCategoryId) {
        const newSubCategory = newCategory.subCategories.find(
          sub => sub.id === newSubCategoryId
        );
        newSubCategoryName = newSubCategory?.name;
      }

      // Reassign expenses
      const reassignedCount = await reassignExpensesCategory(
        categoryToDelete.id,
        newCategoryId,
        newCategory.name,
        ownerId,
        newSubCategoryId,
        newSubCategoryName
      );

      // Delete the old category
      await deleteCategory(categoryToDelete.id);

      toast.success(
        `${reassignedCount} ${reassignedCount === 1 ? 'spesa riassegnata' : 'spese riassegnate'} a "${newCategory.name}" e categoria eliminata con successo`
      );

      // Reset state and reload categories
      setDeleteConfirmDialogOpen(false);
      setCategoryToDelete(null);
      setExpenseCountToReassign(0);
      await loadExpenseCategories();
    } catch (error) {
      console.error('Error during reassignment and deletion:', error);
      toast.error('Errore durante la riassegnazione delle spese');
    }
  };

  // Executes the deletion after the 2-click disarm is confirmed (zero-expense path).
  const handleConfirmDirectDelete = async (categoryId: string) => {
    if (pendingDeleteDirectTimerRef.current) clearTimeout(pendingDeleteDirectTimerRef.current);
    setPendingDeleteDirectCategoryId(null);
    try {
      await deleteCategory(categoryId);
      toast.success('Categoria eliminata con successo');
      await loadExpenseCategories();
    } catch (error) {
      console.error('Error deleting category:', error);
      toast.error("Errore nell'eliminazione della categoria");
    }
  };

  // ========== Move Category Handlers ==========

  const handleMoveExpenseCategory = async (
    categoryId: string,
    categoryName: string,
    triggerOrigin?: string
  ) => {
    if (!user || !ownerId) return;

    try {
      const expenseCount = await getExpenseCountByCategoryId(categoryId, ownerId);

      if (expenseCount === 0) {
        toast.warning(`La categoria "${categoryName}" non ha transazioni da spostare`);
        return;
      }

      const category = await getCategoryById(categoryId);
      if (category) {
        setCategoryToMove(category);
        setExpenseCountToMove(expenseCount);
        setMoveDialogOrigin(triggerOrigin);
        setMoveCategoryDialogOpen(true);
      }
    } catch (error) {
      console.error('Error checking category expenses:', error);
      toast.error('Errore nel controllo delle transazioni');
    }
  };

  const handleConfirmMoveCategory = async (
    newCategoryId: string,
    newSubCategoryId?: string
  ) => {
    if (!categoryToMove || !user || !ownerId) return;

    try {
      const newCategory = await getCategoryById(newCategoryId);
      if (!newCategory) {
        toast.error('Categoria di destinazione non trovata');
        return;
      }

      // Resolve subcategory name if provided
      let newSubCategoryName: string | undefined;
      if (newSubCategoryId && newSubCategoryId !== '__none__') {
        const newSubCategory = newCategory.subCategories.find(
          sub => sub.id === newSubCategoryId
        );
        newSubCategoryName = newSubCategory?.name;
      } else {
        // Sentinel value or no subcategory selected
        newSubCategoryId = undefined;
      }

      const movedCount = await moveExpensesToCategory(
        categoryToMove.id,
        categoryToMove.type,
        newCategoryId,
        newCategory.name,
        newCategory.type,
        ownerId,
        newSubCategoryId,
        newSubCategoryName
      );

      toast.success(
        `${movedCount} ${movedCount === 1 ? 'transazione spostata' : 'transazioni spostate'} da "${categoryToMove.name}" a "${newCategory.name}"`
      );

      // Reset state — source category is NOT deleted
      setMoveCategoryDialogOpen(false);
      setCategoryToMove(null);
      setExpenseCountToMove(0);
    } catch (error) {
      console.error('Error during category move:', error);
      toast.error(
        error instanceof TransferBoundaryError ? error.message : 'Errore nello spostamento delle transazioni'
      );
    }
  };

  const handleExpenseCategoryDialogClose = () => {
    setCategoryDialogOpen(false);
    setEditingCategory(null);
  };

  const handleExpenseCategorySuccess = async () => {
    await loadExpenseCategories();
  };

  // Dividend sync — the CATEGORY itself is saved by the page's one Save (handleSave already
  // persists it); the tab keeps only the sync action, so the field has a single save surface.
  const handleSyncDividends = async () => {
    if (!user || !ownerId) return;

    if (!dividendIncomeCategoryId) {
      toast.error('Seleziona prima una categoria per le entrate da dividendi');
      return;
    }

    // 2-click disarm: first click arms the button; second click proceeds.
    // Avoids blocking window.confirm which breaks the app visual system.
    if (!syncConfirmArmed) {
      setSyncConfirmArmed(true);
      if (syncConfirmTimerRef.current) clearTimeout(syncConfirmTimerRef.current);
      syncConfirmTimerRef.current = setTimeout(() => setSyncConfirmArmed(false), 3000);
      return;
    }

    // Second click: disarm and proceed
    if (syncConfirmTimerRef.current) clearTimeout(syncConfirmTimerRef.current);
    setSyncConfirmArmed(false);

    try {
      setSyncingDividends(true);

      // Get category details
      const category = await getCategoryById(dividendIncomeCategoryId);
      if (!category) {
        toast.error('Categoria non trovata');
        return;
      }

      // Get subcategory name if selected
      let subCategoryName: string | undefined;
      if (dividendIncomeSubCategoryId) {
        const subCategory = category.subCategories.find(
          (sub) => sub.id === dividendIncomeSubCategoryId
        );
        subCategoryName = subCategory?.name;
      }

      // Fetch all dividends for this user
      const response = await authenticatedFetch(`/api/dividends?userId=${ownerId}`);
      if (!response.ok) {
        throw new Error('Errore nel caricamento dei dividendi');
      }
      const data = await response.json();
      const dividends = data.dividends || [];

      // Sync dividends via API
      const syncResponse = await authenticatedFetch('/api/dividends/sync-expenses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: ownerId,
          dividends,
          categoryId: dividendIncomeCategoryId,
          categoryName: category.name,
          subCategoryId: dividendIncomeSubCategoryId || undefined,
          subCategoryName,
        }),
      });

      if (!syncResponse.ok) {
        throw new Error('Errore nella sincronizzazione');
      }

      const syncData = await syncResponse.json();
      const result = syncData.result;

      if (result.failed > 0) {
        toast.warning(
          `Sincronizzazione completata con ${result.failed} errori. ` +
          `Create: ${result.created}, Saltate: ${result.skipped}`
        );
      } else {
        toast.success(
          `Sincronizzazione completata! Create: ${result.created}, Saltate: ${result.skipped}`
        );
      }
    } catch (error) {
      console.error('Error syncing dividends:', error);
      toast.error('Errore nella sincronizzazione dei dividendi');
    } finally {
      setSyncingDividends(false);
    }
  };

  const getCategoriesByType = (type: ExpenseType): ExpenseCategory[] => {
    return expenseCategories.filter(cat => cat.type === type);
  };

  const calculateTotal = () => {
    return assetClasses.reduce(
      (sum, assetClass) => {
        // Exclude cash from percentage total if using fixed amount
        if (assetClass === 'cash' && cashUseFixedAmount) {
          return sum;
        }
        return sum + (assetClassStates[assetClass]?.targetPercentage || 0);
      },
      0
    );
  };

  const calculateSubTargetTotal = (assetClass: AssetClass) => {
    return (
      assetClassStates[assetClass]?.subTargets.reduce(
        (sum, target) => sum + target.percentage,
        0
      ) || 0
    );
  };

  // Famiglia — add/update/remove a member row (plain array state, same pattern as
  // updatePensionRow/removePensionRow in CoastFireTab.tsx).
  const addFamilyMemberRow = () => {
    setFamilyMemberDrafts((current) => [
      ...current,
      { id: createFamilyMemberId(), name: '', grossAnnualIncome: '', isFirstEmploymentPost2007: false, firstEmploymentYear: '' },
    ]);
  };

  const updateFamilyMemberRow = (
    id: string,
    field: keyof Omit<FamilyMemberDraft, 'id'>,
    value: string | boolean
  ) => {
    setFamilyMemberDrafts((current) =>
      current.map((draft) => (draft.id === id ? { ...draft, [field]: value } : draft))
    );
  };

  const removeFamilyMemberRow = (id: string) => {
    setFamilyMemberDrafts((current) => current.filter((draft) => draft.id !== id));
  };

  const handleSave = async () => {
    if (!user || !ownerId) return;

    // Auto-cleanup empty subcategory rows before validation (Bug #8 fix)
    assetClasses.forEach(assetClass => {
      const state = assetClassStates[assetClass];
      if (state.subCategoryEnabled && state.subTargets.length > 0) {
        const cleanedSubTargets = state.subTargets.filter(t => t.name.trim() !== '');
        if (cleanedSubTargets.length !== state.subTargets.length) {
          updateAssetClassState(assetClass, {
            subTargets: cleanedSubTargets,
            categories: cleanedSubTargets.map(t => t.name),
          });
        }
      }
    });

    const total = calculateTotal();
    if (!isTargetTotalValid(total)) {
      toast.error(
        `Il totale deve essere almeno 100%. Attualmente è ${formatPercentage(total)} — residuo da allocare ${formatPercentage(100 - total)}.`
      );
      return;
    }

    // Validate sub-targets for each enabled asset class
    for (const assetClass of assetClasses) {
      const state = assetClassStates[assetClass];
      if (state.subCategoryEnabled) {
        const subTotal = calculateSubTargetTotal(assetClass);
        if (Math.abs(subTotal - 100) > 0.01) {
          toast.error(
            `Il totale delle sotto-categorie ${assetClassLabels[assetClass]} deve essere 100%. Attualmente è ${formatPercentage(
              subTotal
            )}`
          );
          return;
        }

        // Check for empty names
        const hasEmptyNames = state.subTargets.some(
          (target) => !target.name.trim()
        );
        if (hasEmptyNames) {
          toast.error(
            `Tutte le sotto-categorie di ${assetClassLabels[assetClass]} devono avere un nome`
          );
          return;
        }

        // Check for duplicates
        const names = state.subTargets.map((t) => t.name.trim().toLowerCase());
        const hasDuplicates = names.length !== new Set(names).size;
        if (hasDuplicates) {
          toast.error(
            `Le sotto-categorie di ${assetClassLabels[assetClass]} non possono avere nomi duplicati`
          );
          return;
        }

        // Validate specific assets for each subcategory
        for (const subTarget of state.subTargets) {
          if (subTarget.specificAssetsEnabled && subTarget.specificAssets) {
            const validationError = validateSpecificAssets(
              subTarget.specificAssets.map(sa => ({
                name: sa.name,
                targetPercentage: sa.targetPercentage,
              }))
            );

            if (validationError) {
              toast.error(
                `Sottocategoria "${subTarget.name}" in ${assetClassLabels[assetClass]}: ${validationError}`
              );
              return;
            }
          }
        }
      }
    }

    try {
      setSaving(true);

      // Fetch current settings to preserve FIRE fields
      const settingsData = await getSettings(ownerId);

      const targets: AssetAllocationTarget = {};

      assetClasses.forEach((assetClass) => {
        const state = assetClassStates[assetClass];
        targets[assetClass] = {
          targetPercentage: state.targetPercentage,
          ...(assetClass === 'cash' && {
            useFixedAmount: cashUseFixedAmount,
            fixedAmount: cashFixedAmount,
          }),
          subCategoryConfig: {
            enabled: state.subCategoryEnabled,
            // Always derive categories from subTargets (Bug #4 fix)
            categories: state.subCategoryEnabled
              ? state.subTargets.map(t => t.name).filter(n => n !== '')
              : [],
          },
        };

        if (state.subCategoryEnabled && state.subTargets.length > 0) {
          // Rebuild subTargets from scratch to ensure deleted/renamed entries are removed (Bug #2 & #3 fix)
          targets[assetClass].subTargets = state.subTargets.reduce(
            (acc, target) => {
              if (target.specificAssetsEnabled && target.specificAssets && target.specificAssets.length > 0) {
                // New format: SubCategoryTarget with specific assets
                acc[target.name] = {
                  targetPercentage: target.percentage,
                  specificAssetsEnabled: true,
                  specificAssets: target.specificAssets.map(sa => ({
                    name: sa.name,
                    targetPercentage: sa.targetPercentage,
                  })),
                };
              } else {
                // Old format: just percentage (or SubCategoryTarget without specific assets)
                acc[target.name] = target.percentage;
              }
              return acc;
            },
            {} as { [key: string]: number | SubCategoryTargetType }
          );
        }
      });

      await setSettings(ownerId, {
        userAge,
        riskFreeRate,
        // Persist the toggle state explicitly so disabling it survives a page reload.
        // Without this field, the toggle was re-derived from age+rate presence on load,
        // making it impossible to disable without clearing age and rate.
        autoCalculateEquityBonds: autoCalculate,
        // Preserve FIRE settings (Bug #1 fix)
        includePrimaryResidenceInFIRE,
        goalBasedInvestingEnabled,
        goalDrivenAllocationEnabled,
        withdrawalRate: settingsData?.withdrawalRate,
        plannedAnnualExpenses: settingsData?.plannedAnnualExpenses,
        targets,
        dividendIncomeCategoryId: dividendIncomeCategoryId || undefined,
        dividendIncomeSubCategoryId: dividendIncomeSubCategoryId || undefined,
        defaultDebitCashAssetId: defaultDebitCashAssetId !== '__none__' ? defaultDebitCashAssetId : undefined,
        defaultCreditCashAssetId: defaultCreditCashAssetId !== '__none__' ? defaultCreditCashAssetId : undefined,
        stampDutyEnabled,
        stampDutyRate,
        checkingAccountSubCategory,
        cashflowHistoryStartYear,
        laborIncomeCategoryIds,
        costCentersEnabled,
        performanceIncludesPensionFunds,
        performanceIncludesExcludedAssets,
        // Stringa vuota = "nessun mese impostato": va salvata come undefined, non come '',
        // altrimenti pensionReturn la leggerebbe come una data da parsare.
        pensionReturnStartMonth: pensionReturnStartMonth || undefined,
        monthlyEmailEnabled,
        quarterlyEmailEnabled,
        semiAnnualEmailEnabled,
        yearlyEmailEnabled,
        weeklyBudgetEmailEnabled,
        monthlyEmailRecipients,
        familyMembers: parseFamilyMemberDrafts(familyMemberDrafts),
      });
      toast.success('Impostazioni salvate con successo');
      setAllocationBaselineKey(allocationSnapshotKey);
      setGeneralBaselineKey(generalSnapshotKey);
      setDividendBaselineKey(dividendSnapshotKey);
      // Other consumers (AssetDialog's family-member Select, PensionOverview) read settings via
      // React Query with a 5-minute staleTime — without this, a just-added member wouldn't be
      // selectable there until that cache naturally expired.
      queryClient.invalidateQueries({ queryKey: ['settings', ownerId] });
    } catch (error) {
      console.error('Error saving targets:', error);
      toast.error('Errore nel salvataggio dei target');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    const defaults = getDefaultTargets();
    const states: Record<AssetClass, AssetClassState> = {} as Record<
      AssetClass,
      AssetClassState
    >;

    assetClasses.forEach((assetClass) => {
      const targetData = defaults[assetClass];
      const subCategoryConfig = targetData?.subCategoryConfig;
      const subTargets = targetData?.subTargets;

      states[assetClass] = {
        targetPercentage: targetData?.targetPercentage || 0,
        subCategoryEnabled: subCategoryConfig?.enabled || false,
        categories: subCategoryConfig?.categories || [],
        subTargets: subTargets
          ? Object.entries(subTargets).map(([name, value]) => {
              // Support both old format (number) and new format (SubCategoryTarget)
              if (typeof value === 'number') {
                return {
                  name,
                  percentage: value,
                };
              } else {
                return {
                  name,
                  percentage: value.targetPercentage,
                  specificAssetsEnabled: value.specificAssetsEnabled || false,
                  specificAssets: value.specificAssets || [],
                  expanded: false,
                };
              }
            })
          : [],
        expanded: false,
      };
    });

    setAssetClassStates(states);

    // Reset cash fixed amount settings to defaults
    const cashDefaults = defaults['cash'];
    setCashUseFixedAmount(cashDefaults?.useFixedAmount || false);
    setCashFixedAmount(cashDefaults?.fixedAmount || 0);

    toast.info('Target ripristinati ai valori predefiniti');
  };

  const updateAssetClassState = (
    assetClass: AssetClass,
    updates: Partial<AssetClassState>
  ) => {
    setAssetClassStates((prev) => ({
      ...prev,
      [assetClass]: {
        ...prev[assetClass],
        ...updates,
      },
    }));
  };

  const handleToggleSubCategories = (assetClass: AssetClass, enabled: boolean) => {
    const state = assetClassStates[assetClass];

    if (enabled && state.subTargets.length === 0) {
      // Initialize with default categories if enabling for the first time
      const subTargets = state.categories.map((name) => ({
        name,
        percentage: 0,
      }));
      updateAssetClassState(assetClass, {
        subCategoryEnabled: enabled,
        subTargets,
        categories: state.categories, // Explicitly keep in sync (Bug #4 fix)
      });
    } else {
      updateAssetClassState(assetClass, { subCategoryEnabled: enabled });
    }
  };

  const handleAddSubTarget = (assetClass: AssetClass) => {
    const state = assetClassStates[assetClass];

    // Prevent adding if there are existing empty names (Bug #8 fix)
    const hasEmpty = state.subTargets.some(t => !t.name.trim());
    if (hasEmpty) {
      toast.error('Completa le sotto-categorie esistenti prima di aggiungerne altre');
      return;
    }

    const newSubTargets = [...state.subTargets, { name: '', percentage: 0 }];
    // Update categories to stay in sync (Bug #3 fix)
    const newCategories = newSubTargets.map(t => t.name).filter(n => n !== '');
    updateAssetClassState(assetClass, {
      subTargets: newSubTargets,
      categories: newCategories,
    });
  };

  const handleRemoveSubTarget = (assetClass: AssetClass, index: number) => {
    const state = assetClassStates[assetClass];
    const newSubTargets = state.subTargets.filter((_, i) => i !== index);
    // Update categories to stay in sync (Bug #3 fix)
    const newCategories = newSubTargets.map(t => t.name);
    updateAssetClassState(assetClass, {
      subTargets: newSubTargets,
      categories: newCategories,
    });
  };

  const handleSubTargetChange = (
    assetClass: AssetClass,
    index: number,
    field: 'name' | 'percentage',
    value: string | number
  ) => {
    const state = assetClassStates[assetClass];
    const newSubTargets = [...state.subTargets];

    if (field === 'name') {
      // Track rename mapping (Bug #2 fix)
      const oldName = newSubTargets[index].name;
      const newName = value as string;
      newSubTargets[index].name = newName;

      // Update name map to track rename
      const nameMap = subcategoryNameMap[assetClass] || {};
      const originalName = nameMap[oldName] || oldName;
      const updatedNameMap = { ...nameMap };
      updatedNameMap[newName] = originalName; // New name -> original name
      delete updatedNameMap[oldName]; // Remove old mapping
      setSubcategoryNameMap({ ...subcategoryNameMap, [assetClass]: updatedNameMap });

      // Update categories array to stay in sync (Bug #3 & #4 fix)
      const newCategories = newSubTargets.map(t => t.name).filter(n => n !== '');
      updateAssetClassState(assetClass, {
        subTargets: newSubTargets,
        categories: newCategories,
      });
    } else {
      newSubTargets[index].percentage = value as number;
      updateAssetClassState(assetClass, { subTargets: newSubTargets });
    }
  };

  // Specific Assets Management Functions
  const toggleSubCategoryExpanded = (assetClass: AssetClass, subIndex: number) => {
    const state = assetClassStates[assetClass];
    const newSubTargets = [...state.subTargets];
    newSubTargets[subIndex].expanded = !newSubTargets[subIndex].expanded;
    updateAssetClassState(assetClass, { subTargets: newSubTargets });
  };

  const handleToggleSpecificAssets = (
    assetClass: AssetClass,
    subIndex: number,
    enabled: boolean
  ) => {
    const state = assetClassStates[assetClass];
    const newSubTargets = [...state.subTargets];
    newSubTargets[subIndex].specificAssetsEnabled = enabled;

    if (enabled && (!newSubTargets[subIndex].specificAssets || newSubTargets[subIndex].specificAssets!.length === 0)) {
      // Initialize with empty array when enabling for the first time
      newSubTargets[subIndex].specificAssets = [];
    }

    updateAssetClassState(assetClass, { subTargets: newSubTargets });
  };

  const handleAddSpecificAsset = (assetClass: AssetClass, subIndex: number) => {
    const state = assetClassStates[assetClass];
    const newSubTargets = [...state.subTargets];
    const specificAssets = newSubTargets[subIndex].specificAssets || [];
    specificAssets.push({ name: '', targetPercentage: 0 });
    newSubTargets[subIndex].specificAssets = specificAssets;
    updateAssetClassState(assetClass, { subTargets: newSubTargets });
  };

  const handleRemoveSpecificAsset = (
    assetClass: AssetClass,
    subIndex: number,
    specificIndex: number
  ) => {
    const state = assetClassStates[assetClass];
    const newSubTargets = [...state.subTargets];
    const specificAssets = newSubTargets[subIndex].specificAssets || [];
    newSubTargets[subIndex].specificAssets = specificAssets.filter(
      (_, i) => i !== specificIndex
    );
    updateAssetClassState(assetClass, { subTargets: newSubTargets });
  };

  const handleSpecificAssetChange = (
    assetClass: AssetClass,
    subIndex: number,
    specificIndex: number,
    field: 'name' | 'targetPercentage',
    value: string | number
  ) => {
    const state = assetClassStates[assetClass];
    const newSubTargets = [...state.subTargets];
    const specificAssets = [...(newSubTargets[subIndex].specificAssets || [])];

    if (field === 'name') {
      specificAssets[specificIndex].name = value as string;
    } else {
      specificAssets[specificIndex].targetPercentage = value as number;
    }

    newSubTargets[subIndex].specificAssets = specificAssets;
    updateAssetClassState(assetClass, { subTargets: newSubTargets });
  };

  const calculateSpecificAssetTotal = (assetClass: AssetClass, subIndex: number) => {
    const state = assetClassStates[assetClass];
    const subTarget = state?.subTargets[subIndex];
    if (!subTarget?.specificAssets) return 0;

    return subTarget.specificAssets.reduce(
      (sum, asset) => sum + asset.targetPercentage,
      0
    );
  };

  const allocationSnapshotKey = useMemo(
    () =>
      JSON.stringify({
        autoCalculate,
        cashUseFixedAmount,
        cashFixedAmount: roundToTwoDecimals(cashFixedAmount),
        assetClassStates: assetClasses.map((assetClass) => ({
          assetClass,
          targetPercentage: roundToTwoDecimals(
            assetClassStates[assetClass]?.targetPercentage || 0
          ),
          subCategoryEnabled: assetClassStates[assetClass]?.subCategoryEnabled || false,
          categories: assetClassStates[assetClass]?.categories || [],
          subTargets: (assetClassStates[assetClass]?.subTargets || []).map((target) => ({
            name: target.name,
            percentage: roundToTwoDecimals(target.percentage),
            specificAssetsEnabled: target.specificAssetsEnabled || false,
            specificAssets: (target.specificAssets || []).map((asset) => ({
              name: asset.name,
              targetPercentage: roundToTwoDecimals(asset.targetPercentage),
            })),
          })),
        })),
      }),
    [autoCalculate, cashUseFixedAmount, cashFixedAmount, assetClassStates]
  );

  const generalSnapshotKey = useMemo(
    () =>
      JSON.stringify({
        userAge: userAge ?? null,
        riskFreeRate: riskFreeRate ?? null,
        includePrimaryResidenceInFIRE,
        goalBasedInvestingEnabled,
        goalDrivenAllocationEnabled,
        stampDutyEnabled,
        stampDutyRate: roundToTwoDecimals(stampDutyRate),
        checkingAccountSubCategory,
        defaultDebitCashAssetId,
        defaultCreditCashAssetId,
        cashflowHistoryStartYear,
        laborIncomeCategoryIds: [...laborIncomeCategoryIds].sort(),
        costCentersEnabled,
        performanceIncludesPensionFunds,
        performanceIncludesExcludedAssets,
        pensionReturnStartMonth,
        monthlyEmailEnabled,
        quarterlyEmailEnabled,
        semiAnnualEmailEnabled,
        yearlyEmailEnabled,
        weeklyBudgetEmailEnabled,
        monthlyEmailRecipients: [...monthlyEmailRecipients].sort(),
        familyMembers: familyMembersSnapshotValue(parseFamilyMemberDrafts(familyMemberDrafts)),
      }),
    [
      userAge,
      riskFreeRate,
      includePrimaryResidenceInFIRE,
      goalBasedInvestingEnabled,
      goalDrivenAllocationEnabled,
      stampDutyEnabled,
      stampDutyRate,
      checkingAccountSubCategory,
      defaultDebitCashAssetId,
      defaultCreditCashAssetId,
      cashflowHistoryStartYear,
      laborIncomeCategoryIds,
      costCentersEnabled,
      performanceIncludesPensionFunds,
      performanceIncludesExcludedAssets,
      pensionReturnStartMonth,
      monthlyEmailEnabled,
      quarterlyEmailEnabled,
      semiAnnualEmailEnabled,
      yearlyEmailEnabled,
      weeklyBudgetEmailEnabled,
      monthlyEmailRecipients,
      familyMemberDrafts,
    ]
  );

  const dividendSnapshotKey = useMemo(
    () =>
      JSON.stringify({
        dividendIncomeCategoryId: dividendIncomeCategoryId || '',
        dividendIncomeSubCategoryId: dividendIncomeSubCategoryId || '',
      }),
    [dividendIncomeCategoryId, dividendIncomeSubCategoryId]
  );

  const hasUnsavedAllocationChanges =
    allocationBaselineKey.length > 0 && allocationSnapshotKey !== allocationBaselineKey;
  const hasUnsavedGeneralChanges =
    generalBaselineKey.length > 0 && generalSnapshotKey !== generalBaselineKey;
  const hasUnsavedDividendChanges =
    dividendBaselineKey.length > 0 && dividendSnapshotKey !== dividendBaselineKey;

  const hasUnsavedChanges =
    hasUnsavedAllocationChanges ||
    hasUnsavedGeneralChanges ||
    hasUnsavedDividendChanges;

  if (loading) {
    return (
      <PageContainer width="wide">
        <PageHeader
          label="Configurazione"
          title="Impostazioni"
          description="Target, preferenze e flussi"
          separator={false}
        />
        <PageTabs
          tabs={SETTINGS_TABS}
          value={activeTab}
          onValueChange={handleTabChange}
          layoutId="settings-tab-pill"
          ariaLabel="Sezioni delle Impostazioni"
          loading
        >
          <TileGridSkeleton verdict={false} className="mt-4" cells={[{ span: 5 }, { span: 7 }, { span: 12, lines: 8 }]} />
        </PageTabs>
      </PageContainer>
    );
  }

  const total = calculateTotal();
  const isValidTotal = isTargetTotalValid(total);
  // Derived, read-only target leverage = Σtarget / 100 (mirrors deriveTargetLeverageRatio). Shown
  // when the user has actually set leverage (> 1); the app never stores a manual leverage input.
  const derivedTargetLeverage = total > 0 ? total / 100 : 1;
  const hasTargetLeverage = derivedTargetLeverage > 1.005;

  // ── Reading-line inputs (numbers from the existing pure utils, words from settingsNarrative) ──
  const formulaSplit =
    userAge !== undefined && riskFreeRate !== undefined && Object.keys(assetClassStates).length > 0
      ? resolveAutoEquityBondsSplit(
          calculateEquityPercentage(userAge, riskFreeRate),
          sumOtherClassTargets(assetClassStates, cashUseFixedAmount)
        )
      : null;
  const otherClassTotal = sumOtherClassTargets(assetClassStates, cashUseFixedAmount);
  const classesWithSubcategories = assetClasses.filter(
    (assetClass) =>
      assetClassStates[assetClass]?.subCategoryEnabled && (assetClassStates[assetClass]?.subTargets.length ?? 0) > 0
  ).length;
  const classesWithTarget = Object.values(assetClassStates).filter((s) => s && s.targetPercentage > 0).length;
  const laborCategoryNames = getCategoriesByType('income')
    .filter((cat) => laborIncomeCategoryIds.includes(cat.id))
    .map((cat) => cat.name);
  const familyMembersForReading = parseFamilyMemberDrafts(familyMemberDrafts);
  const debitAccount = cashAssets.find((a) => a.id === defaultDebitCashAssetId);
  const creditAccount = cashAssets.find((a) => a.id === defaultCreditCashAssetId);
  const categoryCounts = summarizeExpenseCategories(expenseCategories);
  const dividendCategory = expenseCategories.find((cat) => cat.id === dividendIncomeCategoryId);
  const dividendSubCategory = dividendCategory?.subCategories.find((sub) => sub.id === dividendIncomeSubCategoryId);
  const inpsAgeShown = planParams.pensionInpsRetirementAge ?? DEFAULT_INPS_RETIREMENT_AGE;
  const ritaAgeShown = resolveRitaUnlockAge(planParams);
  const resolvedThemeMode = isThemeHydrated ? (theme as ThemeMode | undefined) : undefined;
  const activeSwatch = COLOR_THEME_SWATCHES.find((swatch) => swatch.id === colorTheme) ?? COLOR_THEME_SWATCHES[0];

  return (
    <PageContainer width="wide">
      <PageHeader
        label="Configurazione"
        title="Impostazioni"
        description="Target, preferenze e flussi"
        separator={false}
        actions={
          <div className="flex items-center gap-2">
            {/* Save state as a quiet chip: it is context for the buttons, not a metric.
                In demo the chip carries the disabled reason in visible copy (never a title). */}
            {isDemo ? (
              <span className="hidden sm:inline-flex items-center rounded-full border border-border bg-muted px-2 py-1 text-xs text-muted-foreground">
                Modalità demo: salvataggio disattivato
              </span>
            ) : hasUnsavedChanges ? (
              <span className="hidden sm:inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2 py-1 text-xs text-primary">
                Anteprima attiva: modifiche non salvate
              </span>
            ) : (
              <span className="hidden sm:inline-flex items-center rounded-full border border-border bg-muted px-2 py-1 text-xs text-muted-foreground">
                Tutte le modifiche sono salvate
              </span>
            )}
            {/* Reset is only meaningful for allocation targets */}
            {activeTab === 'allocazione' && (
              <Button variant="outline" size="sm" onClick={handleReset} disabled={isDemo}>
                <RotateCcw className="h-4 w-4" />
                <span className="hidden sm:inline">Ripristina default</span>
              </Button>
            )}
            <Button size="sm" onClick={handleSave} disabled={isDemo || saving}>
              <Save className="h-4 w-4" />
              {saving ? 'Salvataggio...' : 'Salva'}
            </Button>
          </div>
        }
      />

      <PageTabs
        tabs={SETTINGS_TABS}
        value={activeTab}
        onValueChange={handleTabChange}
        layoutId="settings-tab-pill"
        ariaLabel="Sezioni delle Impostazioni"
      >

        {/* Tab: Preferenze (lazy) — every group is a tile: eyebrow = the group, reading = ONE
            rule-generated state line (settingsNarrative), controls below. */}
        {mountedTabs.has('generale') && (
          <TabsContent value="generale" className="mt-4">
            <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-12">

              {/* Profilo — età e risk-free (moved here from Allocazione; the formula still lives there) */}
              <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-4')}>
                <Tile eyebrow="Profilo" reading={describeProfile({ userAge, riskFreeRate })}>
                  <div className="mt-1 flex flex-col divide-y divide-border">
                    <div className="flex items-center justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <Label htmlFor="userAge" className="text-[13px] font-medium">Età</Label>
                        <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">Entra nella formula dei target</p>
                      </div>
                      <Input
                        id="userAge"
                        type="number"
                        min="0"
                        max="120"
                        value={userAge || ''}
                        onChange={(e) => {
                          const value = e.target.value ? parseInt(e.target.value) : undefined;
                          setUserAge(value);
                        }}
                        placeholder="anni"
                        className={cn('w-24 shrink-0 text-right font-mono', interactiveControlClass)}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <Label htmlFor="riskFreeRate" className="text-[13px] font-medium">Risk-free rate</Label>
                        <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">
                          <a
                            href="https://www.investing.com/rates-bonds/italy-10-year-bond-yield"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                          >
                            BTP 10 anni
                          </a>
                          {' '}su Investing.com
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Input
                          id="riskFreeRate"
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          value={riskFreeRate || ''}
                          onChange={(e) => {
                            const value = e.target.value ? parseFloat(e.target.value) : undefined;
                            setRiskFreeRate(value);
                          }}
                          placeholder="es. 3.5"
                          className={cn('w-24 text-right font-mono', interactiveControlClass)}
                        />
                        <span className="text-sm text-muted-foreground">%</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-auto border-t border-border pt-3 text-[11px] leading-[1.45] text-muted-foreground">
                    Sharpe e Sortino di Rendimenti usano questo tasso come rendimento privo di rischio.
                  </div>
                </Tile>
              </div>

              {/* Calcolo dei rendimenti — measurement base + pension-return start month */}
              <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-4')}>
                <Tile
                  eyebrow="Calcolo dei rendimenti"
                  aside="Rendimenti"
                  reading={describePerformanceBase({
                    includesPensionFunds: performanceIncludesPensionFunds,
                    includesExcludedAssets: performanceIncludesExcludedAssets,
                    pensionReturnStartMonth,
                  })}
                >
                  <div className="mt-1 flex flex-col divide-y divide-border">
                    <div className="flex items-center justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <Label htmlFor="performanceIncludesPensionFunds" className="text-[13px] font-medium">
                          Includi i fondi pensione
                        </Label>
                        <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">
                          Capitale illiquido che cresce per versamenti: includerlo li fa leggere come rendimento
                        </p>
                      </div>
                      <Switch
                        id="performanceIncludesPensionFunds"
                        checked={performanceIncludesPensionFunds}
                        onCheckedChange={setPerformanceIncludesPensionFunds}
                        className={cn('shrink-0', interactiveControlClass)}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <Label htmlFor="performanceIncludesExcludedAssets" className="text-[13px] font-medium">
                          Includi gli asset esclusi
                        </Label>
                        <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">
                          La casa valutata a mano non si muove mai: abbassa la volatilità e alza lo Sharpe
                        </p>
                      </div>
                      <Switch
                        id="performanceIncludesExcludedAssets"
                        checked={performanceIncludesExcludedAssets}
                        onCheckedChange={setPerformanceIncludesExcludedAssets}
                        className={cn('shrink-0', interactiveControlClass)}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <Label htmlFor="pensionReturnStartMonth" className="text-[13px] font-medium">
                          Rendimento del fondo calcolabile da
                        </Label>
                        <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">
                          Vuoto = dal primo versamento registrato
                        </p>
                      </div>
                      <Input
                        id="pensionReturnStartMonth"
                        type="month"
                        value={pensionReturnStartMonth}
                        onChange={(e) => setPensionReturnStartMonth(e.target.value)}
                        className={cn('w-40 shrink-0', interactiveControlClass)}
                      />
                    </div>
                  </div>
                  <div className="mt-auto border-t border-border pt-3 text-[11px] leading-[1.45] text-muted-foreground">
                    Cambiare la base invalida la cache delle metriche: si ricalcolano alla prossima visita di Rendimenti.
                  </div>
                </Tile>
              </div>

              {/* Costi — imposta di bollo */}
              <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-4')}>
                <Tile
                  eyebrow="Costi"
                  aside="stima annua"
                  reading={describeCosts({ stampDutyEnabled, stampDutyRate, checkingAccountSubCategory })}
                >
                  <div className="mt-1 flex flex-col divide-y divide-border">
                    <div className="flex items-center justify-between gap-4 py-3">
                      <Label htmlFor="stampDutyToggle" className="text-[13px] font-medium">Imposta di bollo</Label>
                      <Switch
                        id="stampDutyToggle"
                        checked={stampDutyEnabled}
                        onCheckedChange={setStampDutyEnabled}
                        className={cn('shrink-0', interactiveControlClass)}
                      />
                    </div>
                    {stampDutyEnabled && (
                      <div className="flex items-center justify-between gap-4 py-3">
                        <Label htmlFor="stampDutyRate" className="text-[13px] font-medium">Aliquota</Label>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <Input
                            id="stampDutyRate"
                            type="number"
                            step="0.01"
                            min="0"
                            max="100"
                            value={stampDutyRate}
                            onChange={(e) => setStampDutyRate(parseFloat(e.target.value) || 0)}
                            placeholder="es. 0.20"
                            className={cn('w-24 text-right font-mono', interactiveControlClass)}
                          />
                          <span className="text-sm text-muted-foreground">%</span>
                        </div>
                      </div>
                    )}
                    {stampDutyEnabled && (
                      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium">Sottocategoria conti correnti</p>
                          <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">
                            Applica la soglia dei 5.000&nbsp;€ ai conti
                          </p>
                        </div>
                        {assetClassStates.cash?.subCategoryEnabled && (assetClassStates.cash?.categories?.length ?? 0) > 0 ? (
                          <Select value={checkingAccountSubCategory} onValueChange={setCheckingAccountSubCategory}>
                            <SelectTrigger className={cn('w-44', interactiveControlClass)} aria-label="Sottocategoria conti correnti">
                              <SelectValue placeholder="Seleziona sottocategoria..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">Nessuna (soglia non applicata)</SelectItem>
                              {assetClassStates.cash.categories.map((cat) => (
                                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <p className="text-[11px] leading-[1.4] text-warning-foreground">
                            Configura le sottocategorie di Liquidità nel tab Allocazione per abilitarla.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="mt-auto border-t border-border pt-3 text-[11px] leading-[1.45] text-muted-foreground">
                    Gli asset esenti si marcano dal dialog dello strumento, in Patrimonio.
                  </div>
                </Tile>
              </div>

              {/* FIRE e obiettivi — the three toggles this page OWNS */}
              <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-4')}>
                <Tile
                  eyebrow="FIRE e obiettivi"
                  reading={describeFireToggles({
                    includePrimaryResidenceInFIRE,
                    goalBasedInvestingEnabled,
                    goalDrivenAllocationEnabled,
                  })}
                >
                  <div className="mt-1 flex flex-col divide-y divide-border">
                    <div className="flex items-center justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <Label htmlFor="firePrimaryResidence" className="text-[13px] font-medium">
                          Casa nel patrimonio FIRE
                        </Label>
                        <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">Lo standard FIRE la esclude</p>
                      </div>
                      <Switch
                        id="firePrimaryResidence"
                        checked={includePrimaryResidenceInFIRE}
                        onCheckedChange={setIncludePrimaryResidenceInFIRE}
                        className={cn('shrink-0', interactiveControlClass)}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <Label htmlFor="goalBasedInvesting" className="text-[13px] font-medium">
                          Obiettivi di investimento
                        </Label>
                        <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">
                          Attiva FIRE › Obiettivi e le assegnazioni del portafoglio
                        </p>
                      </div>
                      <Switch
                        id="goalBasedInvesting"
                        checked={goalBasedInvestingEnabled}
                        onCheckedChange={(checked) => {
                          setGoalBasedInvestingEnabled(checked);
                          // Disable goal-driven allocation when goals are disabled
                          if (!checked) setGoalDrivenAllocationEnabled(false);
                        }}
                        className={cn('shrink-0', interactiveControlClass)}
                      />
                    </div>
                    {goalBasedInvestingEnabled && (
                      <div className="flex items-center justify-between gap-4 py-3">
                        <div className="min-w-0">
                          <Label htmlFor="goalDrivenAllocation" className="text-[13px] font-medium">
                            Allocazione derivata dagli obiettivi
                          </Label>
                          <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">
                            Target dal gap di ogni obiettivo, pesato per priorità (Alta 3×, Media 2×, Bassa 1×)
                          </p>
                        </div>
                        <Switch
                          id="goalDrivenAllocation"
                          checked={goalDrivenAllocationEnabled}
                          onCheckedChange={setGoalDrivenAllocationEnabled}
                          className={cn('shrink-0', interactiveControlClass)}
                        />
                      </div>
                    )}
                  </div>
                </Tile>
              </div>

              {/* Parametri del piano — read-only declaration; the FIRE pages stay the only write surfaces */}
              <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-4')}>
                <Tile eyebrow="Parametri del piano" aside="sola lettura" reading={describePlanParameters(planParams)}>
                  <div className="mt-1 flex flex-col divide-y divide-border">
                    {planParams.withdrawalRate !== undefined && (
                      <DeclarationRow label="Safe withdrawal rate" value={pctLabel(planParams.withdrawalRate)} />
                    )}
                    {planParams.plannedAnnualExpenses !== undefined && (
                      <DeclarationRow
                        label="Spese pianificate"
                        value={`${cachedFormatCurrencyEUR(planParams.plannedAnnualExpenses, true)}/anno`}
                      />
                    )}
                    <DeclarationRow
                      label="Età pensione INPS"
                      value={`${inpsAgeShown} anni${planParams.pensionInpsRetirementAge === undefined ? ' · predefinita' : ''}`}
                    />
                    <DeclarationRow label="RITA (sblocco fondo)" value={`${ritaAgeShown} anni`} />
                    <DeclarationRow
                      label="Vincolo fondo nel FIRE"
                      value={planParams.respectPensionLockInFire ? 'Attivo' : 'Spento'}
                      mono={false}
                    />
                  </div>
                  <div className="mt-auto border-t border-border pt-3 text-[11px] leading-[1.45] text-muted-foreground">
                    Si modificano dove agiscono:{' '}
                    <Link href="/dashboard/fire-simulations?tab=fire" className="text-foreground underline-offset-2 hover:underline">
                      FIRE › Calcolatore → Parametri
                    </Link>
                    {' '}e{' '}
                    <Link href="/dashboard/fire-simulations?tab=coast" className="text-foreground underline-offset-2 hover:underline">
                      Coast FIRE → Ipotesi
                    </Link>
                    .
                  </div>
                </Tile>
              </div>

              {/* Assistente — read-only mirror; the popover beside the conversation is the write surface */}
              {SHOW_ASSISTANT ? (
                <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-4')}>
                  <Tile eyebrow="Assistente" aside="sola lettura" reading={describeAssistantPreferences(assistantPrefs)}>
                    <div className="mt-1 flex flex-col divide-y divide-border">
                      {assistantPrefs.responseStyle !== undefined && (
                        <DeclarationRow
                          label="Stile delle risposte"
                          value={ASSISTANT_STYLE_LABELS[assistantPrefs.responseStyle]}
                          mono={false}
                        />
                      )}
                      {assistantPrefs.memoryEnabled !== undefined && (
                        <DeclarationRow
                          label="Apprendimento automatico"
                          value={assistantPrefs.memoryEnabled ? 'Attivo' : 'Spento'}
                          mono={false}
                        />
                      )}
                      {assistantPrefs.macroContextEnabled !== undefined && (
                        <DeclarationRow
                          label="Contesto macro (web)"
                          value={assistantPrefs.macroContextEnabled ? 'Attivo' : 'Spento'}
                          mono={false}
                        />
                      )}
                    </div>
                    <div className="mt-auto border-t border-border pt-3 text-[11px] leading-[1.45] text-muted-foreground">
                      Si modificano{' '}
                      <Link href="/dashboard/assistant" className="text-foreground underline-offset-2 hover:underline">
                        dall&apos;Assistente
                      </Link>
                      , accanto alla conversazione.
                    </div>
                  </Tile>
                </div>
              ) : (
                <div className="hidden desktop:block desktop:col-span-4" aria-hidden="true" />
              )}

              {/* Cashflow — labor income, history floor, cost centers */}
              <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-5')}>
                <Tile
                  eyebrow="Cashflow"
                  reading={describeCashflowSettings({
                    laborCategoryNames,
                    historyStartYear: cashflowHistoryStartYear,
                    costCentersEnabled,
                  })}
                >
                  <div className="mt-3">
                    <p className={TILE_SUB_EYEBROW_CLASS}>Reddito da lavoro</p>
                    {getCategoriesByType('income').length === 0 ? (
                      <p className="mt-2 text-[11px] leading-[1.4] text-muted-foreground">
                        Nessuna categoria di tipo «Entrate»: creane una nel tab Spese.
                      </p>
                    ) : (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {getCategoriesByType('income').map((cat) => {
                          const checked = laborIncomeCategoryIds.includes(cat.id);
                          return (
                            <button
                              key={cat.id}
                              type="button"
                              aria-pressed={checked}
                              onClick={() =>
                                setLaborIncomeCategoryIds(
                                  checked
                                    ? laborIncomeCategoryIds.filter((id) => id !== cat.id)
                                    : [...laborIncomeCategoryIds, cat.id]
                                )
                              }
                              className={cn(
                                'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors',
                                checked
                                  ? 'border-primary bg-primary text-primary-foreground'
                                  : 'border-border bg-background text-foreground hover:bg-muted'
                              )}
                            >
                              {checked && (
                                <svg className="h-3.5 w-3.5" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                                  <path d="M2.5 7L5.5 10L11.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              )}
                              {cat.name}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div className="mt-3 flex flex-col divide-y divide-border border-t border-border">
                    <div className="flex items-center justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <Label htmlFor="cashflowHistoryStartYear" className="text-[13px] font-medium">
                          Anno inizio storico cashflow
                        </Label>
                        <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">
                          Esclude i dati importati più vecchi dai grafici dello storico
                        </p>
                      </div>
                      <Input
                        id="cashflowHistoryStartYear"
                        type="number"
                        min="2000"
                        max={new Date().getFullYear()}
                        step="1"
                        value={cashflowHistoryStartYear}
                        onChange={(e) =>
                          setCashflowHistoryStartYear(parseInt(e.target.value, 10) || 2025)
                        }
                        className={cn('w-24 shrink-0 text-right font-mono', interactiveControlClass)}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <Label htmlFor="costCentersEnabled" className="text-[13px] font-medium">Centri di Costo</Label>
                        <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">
                          Il tab appare in Cashflow, il selettore nel dialog delle spese
                        </p>
                      </div>
                      <Switch
                        id="costCentersEnabled"
                        checked={costCentersEnabled}
                        onCheckedChange={setCostCentersEnabled}
                        className={cn('shrink-0', interactiveControlClass)}
                      />
                    </div>
                  </div>
                </Tile>
              </div>

              {/* Famiglia — one RAL/eligibility per taxpayer (the IRPEF ceiling is per person) */}
              <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-7')}>
                <Tile
                  eyebrow="Famiglia"
                  aside={familyMemberDrafts.length === 1 ? '1 membro' : `${familyMemberDrafts.length} membri`}
                  reading={describeFamily({ members: familyMembersForReading })}
                >
                  {familyMemberDrafts.length > 0 && (
                    <div className="mt-3 hidden grid-cols-[minmax(0,1fr)_120px_150px_110px_44px] items-center gap-x-3 pb-1.5 desktop:grid">
                      <span className={TILE_SUB_EYEBROW_CLASS}>Nome</span>
                      <span className={TILE_SUB_EYEBROW_CLASS}>RAL</span>
                      <span className={TILE_SUB_EYEBROW_CLASS}>Prima occupazione dopo il 2007</span>
                      <span className={TILE_SUB_EYEBROW_CLASS}>Primo anno</span>
                      <span aria-hidden="true" />
                    </div>
                  )}
                  <div className="flex flex-col divide-y divide-border">
                    {familyMemberDrafts.map((member) => (
                      <div
                        key={member.id}
                        className="grid grid-cols-2 items-center gap-3 py-3 desktop:grid-cols-[minmax(0,1fr)_120px_150px_110px_44px] desktop:gap-x-3"
                      >
                        <Input
                          value={member.name}
                          onChange={(e) => updateFamilyMemberRow(member.id, 'name', e.target.value)}
                          placeholder="es. Giuseppe"
                          aria-label="Nome del membro"
                          disabled={isDemo}
                          className={cn('col-span-2 desktop:col-span-1', interactiveControlClass)}
                        />
                        <Input
                          type="number"
                          inputMode="decimal"
                          value={member.grossAnnualIncome}
                          onChange={(e) => updateFamilyMemberRow(member.id, 'grossAnnualIncome', e.target.value)}
                          placeholder="RAL"
                          aria-label="Reddito annuo lordo (RAL)"
                          disabled={isDemo}
                          className={cn('text-right font-mono', interactiveControlClass)}
                        />
                        <div className="flex items-center justify-end gap-2 desktop:justify-start">
                          <Switch
                            id={`family-firstjob-${member.id}`}
                            checked={member.isFirstEmploymentPost2007}
                            onCheckedChange={(checked) => updateFamilyMemberRow(member.id, 'isFirstEmploymentPost2007', checked)}
                            disabled={isDemo}
                            aria-label="Prima occupazione dopo il 2007"
                            className={interactiveControlClass}
                          />
                          <Label htmlFor={`family-firstjob-${member.id}`} className="text-[11px] text-muted-foreground desktop:hidden">
                            Post 2007
                          </Label>
                        </div>
                        <Input
                          type="number"
                          value={member.firstEmploymentYear}
                          onChange={(e) => updateFamilyMemberRow(member.id, 'firstEmploymentYear', e.target.value)}
                          placeholder="anno"
                          aria-label="Anno di prima occupazione"
                          disabled={isDemo || !member.isFirstEmploymentPost2007}
                          className={cn('text-right font-mono', interactiveControlClass)}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeFamilyMemberRow(member.id)}
                          disabled={isDemo}
                          aria-label={`Rimuovi ${member.name || 'membro'}`}
                          className="h-10 w-10 justify-self-end shrink-0"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <div className={familyMemberDrafts.length > 0 ? 'mt-2' : 'mt-3'}>
                    <Button type="button" variant="outline" size="sm" onClick={addFamilyMemberRow} disabled={isDemo}>
                      <Plus className="mr-2 h-4 w-4" />
                      Aggiungi membro
                    </Button>
                  </div>
                  <div className="mt-auto border-t border-border pt-3 text-[11px] leading-[1.45] text-muted-foreground">
                    Colleghi un fondo pensione a un membro dalla sua scheda in Patrimonio; «Prima occupazione dopo il 2007»
                    abilita il recupero del plafond di deducibilità.
                  </div>
                </Tile>
              </div>

              {/* Email periodiche — toggles + recipients + manual send */}
              <div className={cn(TILE_CELL_CLASS, 'tablet:col-span-2 desktop:col-span-12')}>
                <Tile
                  eyebrow="Email periodiche"
                  aside={monthlyEmailRecipients.length === 1 ? '1 destinatario' : `${monthlyEmailRecipients.length} destinatari`}
                  reading={describeEmails({
                    monthly: monthlyEmailEnabled,
                    quarterly: quarterlyEmailEnabled,
                    semiAnnual: semiAnnualEmailEnabled,
                    yearly: yearlyEmailEnabled,
                    weeklyBudget: weeklyBudgetEmailEnabled,
                    recipientCount: monthlyEmailRecipients.length,
                  })}
                >
                  <div className="mt-1 grid grid-cols-1 gap-x-10 desktop:grid-cols-2">
                    <div className="flex flex-col divide-y divide-border">
                      {([
                        { id: 'monthlyEmailEnabled', label: 'Report mensile', help: "L'ultimo giorno del mese", checked: monthlyEmailEnabled, onChange: setMonthlyEmailEnabled },
                        { id: 'quarterlyEmailEnabled', label: 'Report trimestrale', help: 'Marzo, giugno, settembre e dicembre', checked: quarterlyEmailEnabled, onChange: setQuarterlyEmailEnabled },
                        { id: 'semiAnnualEmailEnabled', label: 'Report semestrale', help: '30 giugno e 31 dicembre', checked: semiAnnualEmailEnabled, onChange: setSemiAnnualEmailEnabled },
                        { id: 'yearlyEmailEnabled', label: 'Report annuale', help: 'Il 31 dicembre', checked: yearlyEmailEnabled, onChange: setYearlyEmailEnabled },
                        { id: 'weeklyBudgetEmailEnabled', label: 'Report budget settimanale', help: 'Ogni domenica, con lo stato dei budget', checked: weeklyBudgetEmailEnabled, onChange: setWeeklyBudgetEmailEnabled },
                      ] as const).map((row) => (
                        <div key={row.id} className="flex items-center justify-between gap-4 py-3">
                          <div className="min-w-0">
                            <Label htmlFor={row.id} className="text-[13px] font-medium">{row.label}</Label>
                            <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">{row.help}</p>
                          </div>
                          <Switch
                            id={row.id}
                            checked={row.checked}
                            onCheckedChange={row.onChange}
                            disabled={isDemo}
                            className={cn('shrink-0', interactiveControlClass)}
                          />
                        </div>
                      ))}
                    </div>

                    {(monthlyEmailEnabled || quarterlyEmailEnabled || semiAnnualEmailEnabled || yearlyEmailEnabled || weeklyBudgetEmailEnabled) && (
                      <div className="mt-4 flex flex-col desktop:mt-0 desktop:border-l desktop:border-border desktop:pl-10">
                        <p className={cn(TILE_SUB_EYEBROW_CLASS, 'pt-3')}>Destinatari</p>
                        <div className="mt-2 flex gap-2">
                          <Input
                            type="email"
                            placeholder="email@esempio.com"
                            value={newEmailInput}
                            onChange={(e) => setNewEmailInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                const email = newEmailInput.trim();
                                if (email && !monthlyEmailRecipients.includes(email)) {
                                  setMonthlyEmailRecipients([...monthlyEmailRecipients, email]);
                                  setNewEmailInput('');
                                }
                              }
                            }}
                            disabled={isDemo}
                            aria-label="Nuovo destinatario"
                            className={interactiveControlClass}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={
                              isDemo ||
                              !newEmailInput.trim() ||
                              monthlyEmailRecipients.includes(newEmailInput.trim())
                            }
                            onClick={() => {
                              const email = newEmailInput.trim();
                              if (email && !monthlyEmailRecipients.includes(email)) {
                                setMonthlyEmailRecipients([...monthlyEmailRecipients, email]);
                                setNewEmailInput('');
                              }
                            }}
                          >
                            <Plus className="mr-1 h-4 w-4" />
                            Aggiungi
                          </Button>
                        </div>

                        {monthlyEmailRecipients.length > 0 && (
                          <ul className="mt-2.5 space-y-2">
                            {monthlyEmailRecipients.map((email) => (
                              <li
                                key={email}
                                className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2 text-sm"
                              >
                                <span className="truncate text-foreground">{email}</span>
                                <button
                                  type="button"
                                  aria-label={`Rimuovi ${email}`}
                                  disabled={isDemo}
                                  onClick={() =>
                                    setMonthlyEmailRecipients(
                                      monthlyEmailRecipients.filter((r) => r !== email)
                                    )
                                  }
                                  className="ml-3 shrink-0 text-muted-foreground transition-colors hover:text-destructive disabled:opacity-40"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}

                        <div className="mt-3.5 flex flex-wrap gap-2">
                          {([
                            { type: 'monthly' as const, label: 'Invia mensile ora', enabled: monthlyEmailEnabled },
                            { type: 'quarterly' as const, label: 'Invia trimestrale ora', enabled: quarterlyEmailEnabled },
                            { type: 'semiannual' as const, label: 'Invia semestrale ora', enabled: semiAnnualEmailEnabled },
                            { type: 'yearly' as const, label: 'Invia annuale ora', enabled: yearlyEmailEnabled },
                            { type: 'weekly-budget' as const, label: 'Invia report budget ora', enabled: weeklyBudgetEmailEnabled },
                          ] as const).filter(({ enabled }) => enabled).map(({ type, label }) => (
                            <Button
                              key={type}
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={isDemo || monthlyEmailRecipients.length === 0 || sendingTestEmailType !== null}
                              onClick={async () => {
                                setSendingTestEmailType(type);
                                try {
                                  const res = await authenticatedFetch(
                                    '/api/user/monthly-email/send',
                                    {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ periodType: type }),
                                    }
                                  );
                                  if (res.ok) {
                                    toast.success('Email inviata con successo!');
                                  } else {
                                    const resBody = await res.json().catch(() => ({}));
                                    toast.error(resBody.error ?? "Errore durante l'invio");
                                  }
                                } catch {
                                  toast.error("Errore durante l'invio dell'email");
                                } finally {
                                  setSendingTestEmailType(null);
                                }
                              }}
                            >
                              {sendingTestEmailType === type ? (
                                <span className="flex items-center gap-2">
                                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                  Invio in corso...
                                </span>
                              ) : (
                                <span className="flex items-center gap-2">
                                  <Send className="h-4 w-4" />
                                  {label}
                                </span>
                              )}
                            </Button>
                          ))}
                        </div>
                        <p className="mt-2 text-[11px] leading-[1.45] text-muted-foreground">
                          Invia il riepilogo del periodo corrente per verificare il formato. Salva prima le impostazioni.
                        </p>
                      </div>
                    )}
                  </div>
                </Tile>
              </div>

            </div>

      {/* Development Features — clearly separated from user-facing settings, only shown in dev mode */}
      {enableTestSnapshots && (
        <div className="mt-6 border-t border-border pt-6 space-y-4">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-orange-500" />
            <p className="text-xs uppercase tracking-widest text-orange-500">Strumenti di sviluppo</p>
          </div>
          <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950/10 dark:border-orange-900">
            <CardContent className="p-4 sm:p-6 space-y-4">
              <div className="rounded-lg bg-orange-100 dark:bg-orange-900/30 border border-orange-300 dark:border-orange-800 p-4">
                <p className="text-sm text-orange-900 dark:text-orange-200 font-semibold">⚠️ Attenzione</p>
                <p className="text-sm text-orange-800 dark:text-orange-300 mt-1">
                  Questa sezione è visibile solo quando la variabile d&apos;ambiente{' '}
                  <code className="bg-orange-200 dark:bg-orange-800 px-1 rounded">NEXT_PUBLIC_ENABLE_TEST_SNAPSHOTS</code>{' '}
                  è impostata su <code className="bg-orange-200 dark:bg-orange-800 px-1 rounded">true</code>.
                </p>
              </div>

              <div className="space-y-3">
                <h3 className="font-semibold text-sm text-foreground">Generazione Snapshot di Test</h3>
                <p className="text-sm text-muted-foreground">
                  Genera snapshot mensili fittizi per testare grafici e statistiche.
                  Gli snapshot verranno salvati nella stessa collection Firebase degli snapshot reali.
                </p>
                <Button
                  variant="outline"
                  onClick={() => setDummySnapshotModalOpen(true)}
                  className="border-orange-300 hover:bg-orange-100 dark:hover:bg-orange-900/30"
                >
                  <FlaskConical className="mr-2 h-4 w-4" />
                  Genera Snapshot di Test
                </Button>
              </div>

              <div className="space-y-3 border-t border-orange-200 dark:border-orange-800 pt-4">
                <h3 className="font-semibold text-sm text-foreground">Eliminazione Dati di Test</h3>
                <p className="text-sm text-muted-foreground">
                  Elimina tutti i dati dummy (snapshot, spese e categorie) in un&apos;unica operazione.
                  Questa azione è irreversibile.
                </p>
                <Button
                  variant="destructive"
                  onClick={() => setDeleteDummyDataDialogOpen(true)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Elimina Tutti i Dati Dummy
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

          </TabsContent>
        )}

        {/* Tab: Allocazione (default, always mounted) — the total as a tile, the formula's state,
            the editable target list at the tile's cadence. */}
        <TabsContent value="allocazione" className="mt-4">
          <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-12">

            {/* Allocazione target — the plan's one number */}
            <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-5')}>
              <Tile
                eyebrow="Allocazione target"
                aside="capitale investito"
                reading={describeAllocationTotal({
                  total,
                  isValid: isValidTotal,
                  leverageRatio: derivedTargetLeverage,
                  hasLeverage: hasTargetLeverage,
                  cashUseFixedAmount,
                  cashFixedAmount,
                })}
              >
                <div className="mt-3.5 flex items-end gap-3">
                  <p
                    className={cn(
                      'font-mono text-[36px] font-bold leading-none tracking-[-0.03em] tabular-nums',
                      isValidTotal ? 'text-foreground' : 'text-destructive'
                    )}
                  >
                    {pctLabel(total)}
                  </p>
                  {hasTargetLeverage && (
                    <span className="rounded-full border border-border bg-muted px-2.5 py-0.5 font-mono text-[12px] font-medium tabular-nums">
                      Leva {formatNumber(derivedTargetLeverage, 2)}×
                    </span>
                  )}
                  {cashUseFixedAmount && (
                    <span className="pb-0.5 text-[11px] text-muted-foreground">esclusa liquidità fissa</span>
                  )}
                </div>
                <div className="mt-3.5 flex flex-col divide-y divide-border">
                  <DeclarationRow label="Classi con target > 0" value={`${classesWithTarget} su ${assetClasses.length}`} />
                  <DeclarationRow
                    label="Sotto-categorie configurate"
                    value={classesWithSubcategories === 1 ? '1 classe' : `${classesWithSubcategories} classi`}
                  />
                  {!isValidTotal && (
                    <div className="flex items-center justify-between gap-4 py-2">
                      <span className="text-[13px] text-destructive">Residuo da allocare</span>
                      <span className="font-mono text-[13px] font-semibold tabular-nums text-destructive">
                        {pctLabel(Math.abs(100 - total))}
                      </span>
                    </div>
                  )}
                </div>
                <div className="mt-auto border-t border-border pt-3 text-[11px] leading-[1.45] text-muted-foreground">
                  Le percentuali si applicano al patrimonio ribilanciabile: gli asset «esclusi dal ribilanciamento» non
                  entrano. Per escludere un asset (casa, fondo pensione) usa il suo ruolo in Patrimonio, non un target qui.
                </div>
              </Tile>
            </div>

            {/* Auto-calcolo — the formula's switch, with the profile it reads */}
            <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-7')}>
              <Tile
                eyebrow="Auto-calcolo Azioni / Obbligazioni"
                aside={
                  userAge !== undefined && riskFreeRate !== undefined
                    ? `profilo: ${userAge} anni · ${pctLabel(riskFreeRate)}`
                    : undefined
                }
                reading={describeAutoCalc({
                  enabled: autoCalculate,
                  userAge,
                  riskFreeRate,
                  equityPct: formulaSplit?.equityPercentage,
                  bondsPct: formulaSplit?.bondsPercentage,
                  otherTotal: otherClassTotal,
                })}
              >
                <div className="mt-1 flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <Label htmlFor="autoCalculate" className="text-[13px] font-medium">Calcolo automatico</Label>
                    <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">
                      Formula di{' '}
                      <a
                        href="https://www.youtube.com/channel/UCNp1e5n6rlnfm5aWbHe3cJw"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        The Bull
                      </a>
                      : 125 {'−'} età {'−'} (tasso {'×'} 5) = % Azioni; le altre classi scalano dalle Azioni, le
                      Obbligazioni prendono il residuo
                    </p>
                  </div>
                  <Switch
                    id="autoCalculate"
                    checked={autoCalculate}
                    onCheckedChange={setAutoCalculate}
                    disabled={userAge === undefined || riskFreeRate === undefined}
                    className={cn('shrink-0', interactiveControlClass)}
                  />
                </div>
                <div className="mt-auto border-t border-border pt-3 text-[11px] leading-[1.45] text-muted-foreground">
                  Età e risk-free rate si impostano in{' '}
                  <button
                    type="button"
                    onClick={() => handleTabChange('generale')}
                    className="text-foreground underline-offset-2 hover:underline"
                  >
                    Preferenze → Profilo
                  </button>
                  .
                </div>
              </Tile>
            </div>

            {/* Target per classe — the editable list at the tile's cadence */}
            <div className={cn(TILE_CELL_CLASS, 'tablet:col-span-2 desktop:col-span-12')}>
              <Tile
                eyebrow="Target per classe"
                aside={
                  <span className="font-mono tabular-nums">
                    totale {pctLabel(total)}
                    {cashUseFixedAmount && ' (esclusa liquidità)'}
                  </span>
                }
                reading={describeClassTargets({
                  classCount: assetClasses.length,
                  withSubcategories: classesWithSubcategories,
                  isValid: isValidTotal,
                })}
              >
                <div className="mt-1 flex flex-col divide-y divide-border">
                  {assetClasses.map((assetClass) => {
                    const state = assetClassStates[assetClass];
                    if (!state) return null;

                    const isAutoCalculated = autoCalculate && (assetClass === 'equity' || assetClass === 'bonds');
                    const isCash = assetClass === 'cash';
                    const subTotal = calculateSubTargetTotal(assetClass);
                    const isValidSubTotal = Math.abs(subTotal - 100) < 0.01;

                    return (
                      <div key={assetClass}>
                        {/* Asset class main row */}
                        <div className="flex items-center gap-3 py-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-medium">{assetClassLabels[assetClass]}</p>
                            {isAutoCalculated && (
                              <p className="mt-0.5 text-[11px] text-muted-foreground">Calcolata dalla formula</p>
                            )}
                          </div>
                          {isCash && !isAutoCalculated && (
                            <div className="flex shrink-0 items-center gap-1.5">
                              <Switch
                                id="cashFixedToggle"
                                checked={cashUseFixedAmount}
                                onCheckedChange={setCashUseFixedAmount}
                                className={interactiveControlClass}
                              />
                              <Label htmlFor="cashFixedToggle" className="whitespace-nowrap text-[11px] text-muted-foreground">
                                fisso €
                              </Label>
                            </div>
                          )}
                          <div className="flex shrink-0 items-center gap-1.5">
                            <Input
                              id={assetClass}
                              type="number"
                              step="0.01"
                              min="0"
                              // No max cap: a single class can exceed 100% of invested capital under leverage.
                              // The fixed-cash case is a € amount.
                              value={
                                isCash && cashUseFixedAmount
                                  ? cashFixedAmount
                                  : state.targetPercentage || 0
                              }
                              onChange={(e) => {
                                if (isCash && cashUseFixedAmount) {
                                  setCashFixedAmount(parseFloat(e.target.value) || 0);
                                } else {
                                  updateAssetClassState(assetClass, {
                                    targetPercentage: roundToTwoDecimals(parseFloat(e.target.value) || 0),
                                  });
                                }
                              }}
                              disabled={isAutoCalculated}
                              aria-label={`Target ${assetClassLabels[assetClass]}`}
                              className={cn(
                                'w-28 text-right font-mono',
                                interactiveControlClass,
                                isAutoCalculated ? 'bg-muted' : ''
                              )}
                            />
                            <span className="w-4 shrink-0 text-sm text-muted-foreground">
                              {isCash && cashUseFixedAmount ? '€' : '%'}
                            </span>
                          </div>
                          {/* Sub-category expand/collapse */}
                          <button
                            type="button"
                            className="flex shrink-0 items-center gap-1 p-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                            onClick={() => updateAssetClassState(assetClass, { expanded: !state.expanded })}
                            aria-expanded={state.expanded}
                            aria-label={`${state.expanded ? 'Chiudi' : 'Apri'} sotto-categorie di ${assetClassLabels[assetClass]}`}
                          >
                            <span className="hidden sm:inline">Sotto-cat.</span>
                            <ChevronDown
                              className={cn(
                                'h-4 w-4 transition-transform duration-200 motion-reduce:transition-none',
                                state.expanded && 'rotate-180'
                              )}
                            />
                          </button>
                        </div>

                        {/* Sub-categories — expandable, flush to the tile's edge */}
                        <Collapsible open={state.expanded}>
                          <CollapsibleContent
                            forceMount
                            className={cn(
                              'overflow-hidden motion-safe:transition-all motion-safe:duration-200 motion-reduce:transition-none',
                              'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
                              'data-[state=closed]:hidden'
                            )}
                          >
                            <div className="-mx-5 border-t border-border bg-muted/20 px-5">
                              {/* Enable toggle + sub-total */}
                              <div className="flex items-center justify-between py-3">
                                <div className="flex items-center gap-2">
                                  <Switch
                                    id={`toggle-${assetClass}`}
                                    checked={state.subCategoryEnabled}
                                    onCheckedChange={(checked: boolean) =>
                                      handleToggleSubCategories(assetClass, checked)
                                    }
                                    className={interactiveControlClass}
                                  />
                                  <Label htmlFor={`toggle-${assetClass}`} className="text-[13px]">
                                    Abilita sotto-categorie
                                  </Label>
                                </div>
                                {state.subCategoryEnabled && (
                                  <span
                                    className={cn(
                                      'font-mono text-xs font-semibold tabular-nums',
                                      isValidSubTotal ? 'text-muted-foreground' : 'text-destructive'
                                    )}
                                  >
                                    {formatPercentage(subTotal)}
                                    {!isValidSubTotal && ' ≠ 100%'}
                                  </span>
                                )}
                              </div>

                              {/* Sub-target rows */}
                              {state.subCategoryEnabled && (
                                <div className="pb-4">
                                  <div className="divide-y divide-border border-t border-border">
                                    {state.subTargets
                                      .map((target, originalIndex) => ({ target, originalIndex }))
                                      .sort((a, b) => a.target.name.localeCompare(b.target.name))
                                      .map(({ target, originalIndex }) => {
                                        const specificAssetTotal = calculateSpecificAssetTotal(assetClass, originalIndex);
                                        const isValidSpecificTotal = Math.abs(specificAssetTotal - 100) < 0.01;

                                        return (
                                          <div key={originalIndex} className="space-y-3 py-3">
                                            {/* Name + % + delete */}
                                            <div className="flex items-center gap-2">
                                              <div className="min-w-0 flex-1">
                                                <Input
                                                  placeholder="Nome sottocategoria"
                                                  value={target.name}
                                                  onChange={(e) =>
                                                    handleSubTargetChange(
                                                      assetClass,
                                                      originalIndex,
                                                      'name',
                                                      e.target.value
                                                    )
                                                  }
                                                  list={`${assetClass}-categories`}
                                                  aria-label="Nome sottocategoria"
                                                  className={cn('text-sm', interactiveControlClass)}
                                                />
                                                <datalist id={`${assetClass}-categories`}>
                                                  {state.categories.map((cat) => (
                                                    <option key={cat} value={cat} />
                                                  ))}
                                                </datalist>
                                              </div>
                                              <Input
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                max="100"
                                                aria-label={`Percentuale di ${target.name || 'sottocategoria'}`}
                                                className={cn(
                                                  'w-24 shrink-0 text-right font-mono',
                                                  interactiveControlClass
                                                )}
                                                value={target.percentage}
                                                onChange={(e) =>
                                                  handleSubTargetChange(
                                                    assetClass,
                                                    originalIndex,
                                                    'percentage',
                                                    roundToTwoDecimals(parseFloat(e.target.value) || 0)
                                                  )
                                                }
                                              />
                                              <span className="shrink-0 text-sm text-muted-foreground">%</span>
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleRemoveSubTarget(assetClass, originalIndex)}
                                                aria-label={`Rimuovi ${target.name || 'sottocategoria'}`}
                                                className="shrink-0"
                                              >
                                                <Trash2 className="h-4 w-4 text-muted-foreground" />
                                              </Button>
                                            </div>

                                            {/* Specific assets toggle + expand */}
                                            {target.name && (
                                              <div className="ml-4 space-y-2">
                                                <div className="flex items-center justify-between">
                                                  <div className="flex items-center gap-2">
                                                    <Switch
                                                      id={`specific-${assetClass}-${originalIndex}`}
                                                      checked={target.specificAssetsEnabled || false}
                                                      onCheckedChange={(checked) =>
                                                        handleToggleSpecificAssets(
                                                          assetClass,
                                                          originalIndex,
                                                          checked
                                                        )
                                                      }
                                                      className={interactiveControlClass}
                                                    />
                                                    <Label
                                                      htmlFor={`specific-${assetClass}-${originalIndex}`}
                                                      className="cursor-pointer text-xs text-muted-foreground"
                                                    >
                                                      Traccia asset specifici
                                                    </Label>
                                                  </div>
                                                  {target.specificAssetsEnabled && (
                                                    <span
                                                      className={cn(
                                                        'font-mono text-xs font-semibold tabular-nums',
                                                        isValidSpecificTotal ? 'text-muted-foreground' : 'text-destructive'
                                                      )}
                                                    >
                                                      {formatPercentage(specificAssetTotal)}
                                                      {!isValidSpecificTotal && ' ≠ 100%'}
                                                    </span>
                                                  )}
                                                </div>

                                                {target.specificAssetsEnabled && (
                                                  <>
                                                    <Button
                                                      variant="ghost"
                                                      size="sm"
                                                      className="h-8 w-full justify-start text-xs"
                                                      onClick={() =>
                                                        toggleSubCategoryExpanded(assetClass, originalIndex)
                                                      }
                                                    >
                                                      <ChevronDown
                                                        className={cn(
                                                          'mr-1.5 h-3 w-3 transition-transform duration-200 motion-reduce:transition-none',
                                                          target.expanded && 'rotate-180'
                                                        )}
                                                      />
                                                      {target.expanded ? 'Nascondi' : 'Mostra'} asset specifici
                                                      {target.specificAssets &&
                                                        target.specificAssets.length > 0 && (
                                                          <span className="ml-1.5 text-muted-foreground">
                                                            ({target.specificAssets.length})
                                                          </span>
                                                        )}
                                                    </Button>

                                                    <Collapsible open={target.expanded}>
                                                      <CollapsibleContent
                                                        forceMount
                                                        className={cn(
                                                          'overflow-hidden motion-safe:transition-all motion-safe:duration-200 motion-reduce:transition-none',
                                                          'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
                                                          'data-[state=closed]:hidden'
                                                        )}
                                                      >
                                                        <div className="mt-1 space-y-2">
                                                          {target.specificAssets &&
                                                            target.specificAssets.map(
                                                              (specificAsset, specificIndex) => (
                                                                <div
                                                                  key={specificIndex}
                                                                  className="flex items-center gap-2"
                                                                >
                                                                  <Input
                                                                    placeholder="Ticker/Nome (es. AAPL)"
                                                                    value={specificAsset.name}
                                                                    onChange={(e) =>
                                                                      handleSpecificAssetChange(
                                                                        assetClass,
                                                                        originalIndex,
                                                                        specificIndex,
                                                                        'name',
                                                                        e.target.value
                                                                      )
                                                                    }
                                                                    aria-label="Nome asset specifico"
                                                                    className={cn(
                                                                      'flex-1 text-sm',
                                                                      interactiveControlClass
                                                                    )}
                                                                  />
                                                                  <Input
                                                                    type="number"
                                                                    step="0.01"
                                                                    min="0"
                                                                    max="100"
                                                                    aria-label={`Percentuale di ${specificAsset.name || 'asset specifico'}`}
                                                                    className={cn(
                                                                      'w-24 shrink-0 text-right font-mono text-sm',
                                                                      interactiveControlClass
                                                                    )}
                                                                    value={specificAsset.targetPercentage}
                                                                    onChange={(e) =>
                                                                      handleSpecificAssetChange(
                                                                        assetClass,
                                                                        originalIndex,
                                                                        specificIndex,
                                                                        'targetPercentage',
                                                                        roundToTwoDecimals(
                                                                          parseFloat(e.target.value) || 0
                                                                        )
                                                                      )
                                                                    }
                                                                  />
                                                                  <span className="shrink-0 text-xs text-muted-foreground">
                                                                    %
                                                                  </span>
                                                                  <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    aria-label={`Rimuovi ${specificAsset.name || 'asset specifico'}`}
                                                                    onClick={() =>
                                                                      handleRemoveSpecificAsset(
                                                                        assetClass,
                                                                        originalIndex,
                                                                        specificIndex
                                                                      )
                                                                    }
                                                                  >
                                                                    <Trash2 className="h-3 w-3 text-muted-foreground" />
                                                                  </Button>
                                                                </div>
                                                              )
                                                            )}
                                                          <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className="w-full text-xs"
                                                            onClick={() =>
                                                              handleAddSpecificAsset(assetClass, originalIndex)
                                                            }
                                                          >
                                                            <Plus className="mr-1.5 h-3 w-3" />
                                                            Aggiungi asset specifico
                                                          </Button>
                                                        </div>
                                                      </CollapsibleContent>
                                                    </Collapsible>
                                                  </>
                                                )}
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                  </div>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="mt-3 w-full sm:w-auto"
                                    onClick={() => handleAddSubTarget(assetClass)}
                                  >
                                    <Plus className="mr-2 h-4 w-4" />
                                    Aggiungi sotto-categoria
                                  </Button>
                                  <p className="mt-2 text-[11px] leading-[1.4] text-muted-foreground">
                                    Le sotto-categorie sono espresse come percentuale di{' '}
                                    {assetClassLabels[assetClass]} ({formatPercentage(state.targetPercentage)})
                                  </p>
                                </div>
                              )}
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-auto border-t border-border pt-3 text-[11px] leading-[1.45] text-muted-foreground">
                  Il Salva della pagina valida qui: totale ≥ 100%, ogni gruppo di sotto-categorie esattamente 100%. La
                  liquidità come importo fisso esce dal budget percentuale: le altre classi si applicano al resto.
                </div>
              </Tile>
            </div>

            {/* Note tecniche — collapsed by default, below the grid */}
            <div className="tablet:col-span-2 desktop:col-span-12">
              <Collapsible open={isNotesOpen} onOpenChange={setIsNotesOpen}>
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-xl border border-border px-4 py-3 text-sm text-muted-foreground transition-colors hover:bg-muted/50"
                  >
                    <span className="font-medium text-foreground">Note e dettagli tecnici</span>
                    <ChevronDown className={cn('h-4 w-4 transition-transform duration-200', isNotesOpen && 'rotate-180')} />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="overflow-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-200">
                  <div className="rounded-b-xl border border-t-0 border-border bg-muted/30 px-4 py-4">
                    <ul className="space-y-1 text-sm text-muted-foreground">
                      <li>• Il totale delle allocazioni delle asset class deve essere almeno 100%. Oltre il 100% rappresenta una leva target (es. 110% = leva 1,10×)</li>
                      <li>• La liquidità può essere impostata come valore fisso in euro. In questo caso, le percentuali delle altre asset class si applicheranno al patrimonio rimanente (totale - liquidità fissa)</li>
                      <li>• Per ogni asset class con sotto-categorie abilitate, il totale delle sotto-categorie deve essere esattamente 100%</li>
                      <li>• Le sotto-categorie sono espresse come percentuale della loro asset class di appartenenza</li>
                      <li>• Usa il toggle &quot;Abilita&quot; per attivare/disattivare le sotto-categorie per ciascuna asset class</li>
                      <li>• I cambiamenti saranno applicati immediatamente alla pagina Allocazione</li>
                    </ul>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>

          </div>
        </TabsContent>

        {/* Tab: Spese (lazy) — default accounts, the CSV import, the category inventory */}
        {mountedTabs.has('spese') && (
          <TabsContent value="spese" className="mt-4">
            <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-12">

              {/* Conti di default (moved here from Preferenze: they act in the expense dialog) */}
              <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-5')}>
                <Tile
                  eyebrow="Conti di default"
                  reading={describeDefaultAccounts({ debitName: debitAccount?.name, creditName: creditAccount?.name })}
                >
                  {cashAssets.length === 0 ? (
                    <p className="mt-3 text-[13px] text-muted-foreground">
                      Nessun conto disponibile: crea un conto (tipo «Liquidità») in Patrimonio.
                    </p>
                  ) : (
                    <div className="mt-1 flex flex-col divide-y divide-border">
                      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium">Conto di prelievo</p>
                          <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">Per spese e debiti</p>
                        </div>
                        <Select value={defaultDebitCashAssetId} onValueChange={setDefaultDebitCashAssetId}>
                          <SelectTrigger className={cn('w-56', interactiveControlClass)} aria-label="Conto di prelievo">
                            <SelectValue placeholder="Nessun default" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Nessun default</SelectItem>
                            {cashAssets.map((a) => (
                              <SelectItem key={a.id} value={a.id}>
                                {a.name} ({a.currency})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium">Conto di accredito</p>
                          <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">Per le entrate</p>
                        </div>
                        <Select value={defaultCreditCashAssetId} onValueChange={setDefaultCreditCashAssetId}>
                          <SelectTrigger className={cn('w-56', interactiveControlClass)} aria-label="Conto di accredito">
                            <SelectValue placeholder="Nessun default" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Nessun default</SelectItem>
                            {cashAssets.map((a) => (
                              <SelectItem key={a.id} value={a.id}>
                                {a.name} ({a.currency})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                  <div className="mt-auto border-t border-border pt-3 text-[11px] leading-[1.45] text-muted-foreground">
                    Pre-selezionati nel dialog di spese ed entrate; solo conti veri, non asset di classe liquidità.
                  </div>
                </Tile>
              </div>

              {/* Import CSV — the section renders its own tile (preview-first, undo per batch) */}
              <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-7')}>
                <ExpenseImportSection onImported={handleExpenseImported} />
              </div>

              {/* Categorie — the management inventory at the tile's cadence */}
              <div className={cn(TILE_CELL_CLASS, 'tablet:col-span-2 desktop:col-span-12')}>
                <Tile
                  eyebrow="Categorie"
                  aside={
                    <Button onClick={handleAddExpenseCategory} variant="outline" size="sm" className="h-7 text-[11px]">
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      Nuova categoria
                    </Button>
                  }
                  reading={describeExpenseCategories(categoryCounts)}
                >
                  {loadingCategories ? (
                    <p className="mt-3 text-[13px] text-muted-foreground">Caricamento categorie...</p>
                  ) : (
                    <div className="mt-1">
                      {(['income', 'fixed', 'variable', 'debt'] as ExpenseType[]).map((type) => {
                        const categories = getCategoriesByType(type);
                        if (categories.length === 0) return null;
                        return (
                          <div key={type} className="mt-3 first:mt-2">
                            <p className={TILE_SUB_EYEBROW_CLASS}>{EXPENSE_TYPE_LABELS[type]}</p>
                            <div className="mt-1 divide-y divide-border">
                              {categories.map((category) => (
                                <div
                                  key={category.id}
                                  className="flex items-center justify-between gap-3 py-2.5 transition-colors hover:bg-muted/30"
                                >
                                  <div className="flex min-w-0 items-center gap-3">
                                    {(() => {
                                      const CatIcon = category.icon ? getLazyIcon(category.icon) : null;
                                      return (
                                        <div
                                          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg"
                                          style={{ backgroundColor: category.color ? `${category.color}20` : 'var(--muted)' }}
                                        >
                                          {CatIcon ? (
                                            <Suspense fallback={<div className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: category.color || '#3b82f6' }} />}>
                                              <CatIcon className="h-3.5 w-3.5" style={{ color: category.color || 'var(--muted-foreground)' }} aria-hidden="true" />
                                            </Suspense>
                                          ) : (
                                            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: category.color || '#3b82f6' }} />
                                          )}
                                        </div>
                                      );
                                    })()}
                                    <div className="min-w-0">
                                      <p className="truncate text-[13px] font-medium">{category.name}</p>
                                      {category.subCategories && category.subCategories.length > 0 && (
                                        <p className="truncate text-[11px] text-muted-foreground">
                                          {category.subCategories.length} sotto-{category.subCategories.length === 1 ? 'categoria' : 'categorie'}: {category.subCategories.map(sub => sub.name).join(', ')}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex shrink-0 items-center gap-1">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      aria-label={`Modifica ${category.name}`}
                                      onClick={() => handleEditExpenseCategory(category)}
                                    >
                                      <Edit className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      aria-label={`Sposta tutte le transazioni di ${category.name}`}
                                      onClick={(event) =>
                                        handleMoveExpenseCategory(
                                          category.id,
                                          category.name,
                                          calculateDialogOrigin(event.currentTarget)
                                        )
                                      }
                                    >
                                      <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
                                    </Button>
                                    {/* Delete button — 2-click disarm: first click arms (red Elimina),
                                        second click confirms, auto-disarms after 3s. */}
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      aria-label={
                                        pendingDeleteDirectCategoryId === category.id
                                          ? `Conferma eliminazione di ${category.name}`
                                          : `Elimina ${category.name}`
                                      }
                                      className={
                                        pendingDeleteDirectCategoryId === category.id
                                          ? 'text-destructive hover:bg-destructive/10 hover:text-destructive'
                                          : ''
                                      }
                                      onClick={(event) => {
                                        if (pendingDeleteDirectCategoryId === category.id) {
                                          handleConfirmDirectDelete(category.id);
                                        } else {
                                          handleDeleteExpenseCategory(
                                            category.id,
                                            category.name,
                                            calculateDialogOrigin(event.currentTarget)
                                          );
                                        }
                                      }}
                                    >
                                      <Trash2
                                        className={`h-4 w-4 ${
                                          pendingDeleteDirectCategoryId === category.id
                                            ? ''
                                            : 'text-muted-foreground'
                                        }`}
                                      />
                                      {pendingDeleteDirectCategoryId === category.id && (
                                        <span className="ml-1 text-xs">Elimina</span>
                                      )}
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="mt-auto border-t border-border pt-3 text-[11px] leading-[1.45] text-muted-foreground">
                    Elimina chiede la riassegnazione se la categoria ha transazioni (altrimenti conferma al secondo
                    tocco); la freccia sposta tutte le transazioni in un&apos;altra categoria senza eliminarla.
                  </div>
                </Tile>
              </div>

            </div>
          </TabsContent>
        )}

        {/* Tab: Dividendi (lazy) — the landing category (saved by the page's Save) + the BTP Italia FOI declaration */}
        {mountedTabs.has('dividendi') && (
          <TabsContent value="dividendi" className="mt-4">
            <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-12">

              {/* Entrate da dividendi */}
              <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-7')}>
                <Tile
                  eyebrow="Entrate da dividendi"
                  reading={describeDividendCategory({
                    categoryName: dividendCategory?.name,
                    subCategoryName: dividendSubCategory?.name,
                  })}
                >
                  <div className="mt-1 flex flex-col divide-y divide-border">
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium">Categoria</p>
                        <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">Di tipo «Entrate»</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Select
                          value={dividendIncomeCategoryId || undefined}
                          onValueChange={(value) => {
                            setDividendIncomeCategoryId(value);
                            setDividendIncomeSubCategoryId(''); // Reset subcategory
                          }}
                        >
                          <SelectTrigger className={cn('w-52', interactiveControlClass)} aria-label="Categoria entrate dividendi">
                            <SelectValue placeholder="Seleziona categoria" />
                          </SelectTrigger>
                          <SelectContent>
                            {getCategoriesByType('income').map((cat) => (
                              <SelectItem key={cat.id} value={cat.id}>
                                {cat.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {dividendIncomeCategoryId && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setDividendIncomeCategoryId('');
                              setDividendIncomeSubCategoryId('');
                            }}
                          >
                            Cancella
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium">Sottocategoria</p>
                        <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">Opzionale</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Select
                          value={dividendIncomeSubCategoryId || undefined}
                          onValueChange={setDividendIncomeSubCategoryId}
                          disabled={!dividendIncomeCategoryId}
                        >
                          <SelectTrigger className={cn('w-52', interactiveControlClass)} aria-label="Sottocategoria entrate dividendi">
                            <SelectValue placeholder="Seleziona sottocategoria" />
                          </SelectTrigger>
                          <SelectContent>
                            {dividendIncomeCategoryId &&
                              expenseCategories
                                .find((cat) => cat.id === dividendIncomeCategoryId)
                                ?.subCategories.map((sub) => (
                                  <SelectItem key={sub.id} value={sub.id}>
                                    {sub.name}
                                  </SelectItem>
                                ))}
                          </SelectContent>
                        </Select>
                        {dividendIncomeSubCategoryId && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setDividendIncomeSubCategoryId('')}
                          >
                            Cancella
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3.5">
                    {/* Sync button — 2-click disarm: first click turns destructive ("Conferma"),
                        second click executes the sync. Auto-disarms after 3s if not confirmed. */}
                    <Button
                      onClick={handleSyncDividends}
                      disabled={syncingDividends || !dividendIncomeCategoryId}
                      variant={syncConfirmArmed ? 'destructive' : 'outline'}
                      className="flex items-center gap-2"
                    >
                      <Coins className="h-4 w-4" />
                      {syncingDividends
                        ? 'Sincronizzazione...'
                        : syncConfirmArmed
                        ? 'Conferma sincronizzazione'
                        : 'Sincronizza dividendi esistenti'}
                    </Button>
                    {!dividendIncomeCategoryId && (
                      <p className="mt-2 text-[11px] leading-[1.4] text-warning-foreground">
                        Scegli una categoria per abilitare la sincronizzazione dei dividendi già registrati.
                      </p>
                    )}
                  </div>

                  <div className="mt-auto border-t border-border pt-3 text-[11px] leading-[1.45] text-muted-foreground">
                    La sincronizzazione chiede conferma al secondo tocco e salta i dividendi già sincronizzati; la
                    categoria si salva con il Salva della pagina.
                  </div>
                </Tile>
              </div>

              {/* BTP Italia — declaration: the FOI is announced per coupon, from the Dividendi calendar */}
              <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-5')}>
                <Tile eyebrow="BTP Italia" aside="FOI" reading={describeBtpItalia()}>
                  <div className="mt-1 flex flex-col divide-y divide-border">
                    <DeclarationRow label="Cedola indicizzata" value="fisso + FOI del semestre" mono={false} />
                    <DeclarationRow label="FOI non ancora annunciato" value="cedola provvisoria, solo fisso" mono={false} />
                    <DeclarationRow label="Deflazione" value="FOI negativo contato 0" mono={false} />
                  </div>
                  <div className="mt-auto border-t border-border pt-3 text-[11px] leading-[1.45] text-muted-foreground">
                    Si gestisce in{' '}
                    <Link href="/dashboard/cashflow?tab=dividends" className="text-foreground underline-offset-2 hover:underline">
                      Cashflow › Dividendi
                    </Link>
                    , per singola cedola.
                  </div>
                </Tile>
              </div>

            </div>
          </TabsContent>
        )}

        {/* Tab: Condivisione account — the sharing section renders its own tile; beside it, how it works */}
        {mountedTabs.has('condivisione') && (
          <TabsContent value="condivisione" className="mt-4">
            <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-12">
              <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-7')}>
                <AccountSharingSection disabled={isDemo} />
              </div>
              <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-5')}>
                <Tile
                  eyebrow="Come funziona"
                  reading={[{ text: "L'invitata si registra prima; poi l'account condiviso appare nel suo switcher." }]}
                >
                  <div className="mt-1 flex flex-col divide-y divide-border">
                    {[
                      'La persona si registra con la propria email (deve essere abilitata alla registrazione).',
                      'Aggiungi qui la stessa email: l’accesso è completo, non esiste un ruolo «sola lettura».',
                      'Dal suo menu account sceglie quale account vedere; le sue preferenze e il suo tema restano suoi.',
                    ].map((step, index) => (
                      <div key={index} className="flex items-start gap-3 py-3">
                        <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-muted font-mono text-[11px] font-semibold">
                          {index + 1}
                        </span>
                        <span className="text-[13px] leading-[1.45]">{step}</span>
                      </div>
                    ))}
                  </div>
                </Tile>
              </div>
            </div>
          </TabsContent>
        )}

        {/* Tab: Aspetto — light/dark/system beside the six color themes */}
        {mountedTabs.has('aspetto') && (
          <TabsContent value="aspetto" className="mt-4">
            <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-12">

              {/* Modalità — next-themes, per device, with the circle view transition */}
              <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-4')}>
                <Tile eyebrow="Modalità" aside="questo dispositivo" reading={describeThemeMode(resolvedThemeMode)}>
                  <div className="mt-3.5 flex rounded-lg bg-muted p-1" role="group" aria-label="Modalità del tema">
                    {THEME_MODES.map(({ value, label, Icon }) => {
                      const isActive = resolvedThemeMode === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          aria-pressed={isActive}
                          onClick={(e) => applyThemeWithTransition(value, e, setTheme)}
                          className={cn(
                            'flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md text-[13px] font-medium transition-colors',
                            isActive ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                          )}
                        >
                          <Icon className="h-4 w-4" aria-hidden="true" />
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-auto border-t border-border pt-3 text-[11px] leading-[1.45] text-muted-foreground">
                    Il passaggio anima con la transizione circolare dal punto del clic; il selettore resta anche nel menu
                    account della sidebar.
                  </div>
                </Tile>
              </div>

              {/* Tema colori — the six palettes, synced on the account */}
              <div className={cn(TILE_CELL_CLASS, 'tablet:col-span-2 desktop:col-span-8')}>
                <Tile eyebrow="Tema colori" aside="tutti i dispositivi" reading={describeColorTheme(activeSwatch.name)}>
                  <div className="mt-3.5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 desktop:grid-cols-6">
                    {COLOR_THEME_SWATCHES.map((swatch, index) => {
                      const isActive = colorTheme === swatch.id;
                      return (
                        <button
                          key={swatch.id}
                          onClick={() => setColorTheme(swatch.id)}
                          aria-label={`Colore ${index + 1} di ${COLOR_THEME_SWATCHES.length}: ${swatch.name}`}
                          aria-pressed={isActive}
                          className={cn(
                            'relative flex flex-col rounded-[10px] border-2 p-2.5 text-left transition-all hover:border-primary/60',
                            isActive ? 'border-primary shadow-sm' : 'border-border'
                          )}
                        >
                          {/* Mini preview: light half over dark half, in the theme's own values */}
                          <div className="mb-2.5 h-14 overflow-hidden rounded-md border border-border/50" aria-hidden="true">
                            <div className="flex h-7 w-full items-center gap-1.5 px-2" style={{ background: swatch.swatchBg }}>
                              <div className="h-3 w-3 flex-shrink-0 rounded-sm" style={{ background: swatch.swatchPrimary }} />
                              <div className="h-2 flex-1 rounded-full" style={{ background: swatch.swatchAccent }} />
                            </div>
                            <div className="flex h-7 w-full items-center gap-1.5 px-2" style={{ background: swatch.swatchBgDark }}>
                              <div className="h-3 w-3 flex-shrink-0 rounded-sm" style={{ background: swatch.swatchPrimaryDark }} />
                              <div className="h-2 flex-1 rounded-full opacity-30" style={{ background: swatch.swatchPrimaryDark }} />
                            </div>
                          </div>
                          <span className="text-[13px] font-medium leading-none">{swatch.name}</span>
                          <span className="mt-1 text-[11px] text-muted-foreground">{swatch.description}</span>
                          {isActive && (
                            <div className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-auto border-t border-border pt-3 text-[11px] leading-[1.45] text-muted-foreground">
                    La scelta si salva da sola sull&apos;account: nessun Salva necessario.
                  </div>
                </Tile>
              </div>

            </div>
          </TabsContent>
        )}

      </PageTabs>

      {/* Category Management Dialog */}
      <CategoryManagementDialog
        open={categoryDialogOpen}
        onClose={handleExpenseCategoryDialogClose}
        category={editingCategory}
        onSuccess={handleExpenseCategorySuccess}
      />

      {/* Category Delete Confirmation Dialog */}
      {categoryToDelete && (
        <CategoryDeleteConfirmDialog
          open={deleteConfirmDialogOpen}
          onClose={() => {
            setDeleteConfirmDialogOpen(false);
            setCategoryToDelete(null);
            setExpenseCountToReassign(0);
            setDeleteDialogOrigin(undefined);
          }}
          onConfirm={handleConfirmDeleteWithReassignment}
          categoryToDelete={categoryToDelete}
          expenseCount={expenseCountToReassign}
          allCategories={expenseCategories}
          triggerOrigin={deleteDialogOrigin}
        />
      )}

      {/* Category Move Dialog */}
      {categoryToMove && (
        <CategoryMoveDialog
          open={moveCategoryDialogOpen}
          onClose={() => {
            setMoveCategoryDialogOpen(false);
            setCategoryToMove(null);
            setExpenseCountToMove(0);
            setMoveDialogOrigin(undefined);
          }}
          onConfirm={handleConfirmMoveCategory}
          sourceCategory={categoryToMove}
          expenseCount={expenseCountToMove}
          allCategories={expenseCategories}
          triggerOrigin={moveDialogOrigin}
        />
      )}

      {/* Dummy Snapshot Modal */}
      {enableTestSnapshots && (
        <CreateDummySnapshotModal
          open={dummySnapshotModalOpen}
          onOpenChange={setDummySnapshotModalOpen}
          userId={ownerId || ''}
        />
      )}

      {/* Delete Dummy Data Dialog */}
      {enableTestSnapshots && (
        <DeleteDummyDataDialog
          open={deleteDummyDataDialogOpen}
          onOpenChange={setDeleteDummyDataDialogOpen}
          userId={ownerId || ''}
          onDeleted={() => {
            // Refresh page or data after deletion
            window.location.reload();
          }}
        />
      )}
    </PageContainer>
  );
}
