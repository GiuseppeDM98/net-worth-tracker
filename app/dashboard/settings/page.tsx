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
 * - Asset classes must sum to 100% (or remainder if cash uses fixed €)
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

import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
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
import { AssetAllocationTarget, AssetClass, SubCategoryTarget as SubCategoryTargetType } from '@/types/assets';
import { formatPercentage } from '@/lib/services/chartService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Save, RotateCcw, Plus, Trash2, ChevronDown, ChevronUp, Edit, Receipt, FlaskConical, Coins, ArrowRightLeft, Settings, PieChart, Palette, Mail, X, Send, Users } from 'lucide-react';
import { AccountSharingSection } from '@/components/settings/AccountSharingSection';
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
import { getExpenseCountByCategoryId, reassignExpensesCategory, clearExpensesCategoryAssignment, moveExpensesToCategory } from '@/lib/services/expenseService';
import { CategoryManagementDialog } from '@/components/expenses/CategoryManagementDialog';
import { CategoryDeleteConfirmDialog } from '@/components/expenses/CategoryDeleteConfirmDialog';
import { CategoryMoveDialog } from '@/components/expenses/CategoryMoveDialog';
import { getLazyIcon } from '@/components/expenses/IconPickerPopover';
import { CreateDummySnapshotModal } from '@/components/CreateDummySnapshotModal';
import { DeleteDummyDataDialog } from '@/components/DeleteDummyDataDialog';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageTabs } from '@/components/layout/PageTabs';
import type { TabDef } from '@/components/layout/PageTabBar';

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
};

// Order: Azioni → Obbligazioni → Commodities → Real Estate → Cash → Crypto
const assetClasses: AssetClass[] = [
  'equity',
  'bonds',
  'commodity',
  'realestate',
  'cash',
  'crypto',
];

// Helper function to round to 2 decimal places
const roundToTwoDecimals = (value: number): number => {
  return Math.round(value * 100) / 100;
};

// Module-level tab definitions drive both the mobile pill and the desktop underline tabs.
const SETTINGS_TABS: TabDef[] = [
  { value: 'allocazione', label: 'Allocazione', icon: PieChart },
  { value: 'generale',    label: 'Preferenze',  icon: Settings },
  { value: 'spese',       label: 'Spese',       icon: Receipt  },
  { value: 'dividendi',   label: 'Dividendi',   icon: Coins    },
  { value: 'condivisione', label: 'Condivisione', icon: Users   },
  { value: 'aspetto',     label: 'Aspetto',     icon: Palette  },
];

export default function SettingsPage() {
  const { user } = useAuth();
  const { ownerId } = useActiveAccount();
  const isDemo = useDemoMode();
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
  const [allocationBaselineKey, setAllocationBaselineKey] = useState('');
  const [generalBaselineKey, setGeneralBaselineKey] = useState('');
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
        setCashAssets(assets.filter((a) => a.assetClass === 'cash'))
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
      const equityPercentage = roundToTwoDecimals(
        calculateEquityPercentage(userAge, riskFreeRate)
      );

      // Calculate bonds percentage: 100 - sum of all other asset classes
      // (excluding cash if using fixed amount)
      const otherAssetClasses = assetClasses.filter(
        (ac) => ac !== 'equity' && ac !== 'bonds'
      );
      const otherTotal = otherAssetClasses.reduce(
        (sum, ac) => {
          // Exclude cash from percentage total if using fixed amount
          if (ac === 'cash' && cashUseFixedAmount) {
            return sum;
          }
          return sum + (assetClassStates[ac]?.targetPercentage || 0);
        },
        0
      );
      const bondsPercentage = roundToTwoDecimals(
        Math.max(0, 100 - equityPercentage - otherTotal)
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

  // Recalculate bonds when other asset classes change (excluding equity and bonds)
  useEffect(() => {
    if (
      autoCalculate &&
      userAge !== undefined &&
      riskFreeRate !== undefined &&
      Object.keys(assetClassStates).length > 0
    ) {
      const equityPercentage = roundToTwoDecimals(
        calculateEquityPercentage(userAge, riskFreeRate)
      );

      const otherAssetClasses = assetClasses.filter(
        (ac) => ac !== 'equity' && ac !== 'bonds'
      );
      const otherTotal = otherAssetClasses.reduce(
        (sum, ac) => {
          // Exclude cash from percentage total if using fixed amount
          if (ac === 'cash' && cashUseFixedAmount) {
            return sum;
          }
          return sum + (assetClassStates[ac]?.targetPercentage || 0);
        },
        0
      );
      const bondsPercentage = roundToTwoDecimals(
        Math.max(0, 100 - equityPercentage - otherTotal)
      );

      // Only update if bonds percentage has changed
      if (assetClassStates.bonds?.targetPercentage !== bondsPercentage) {
        setAssetClassStates((prev) => ({
          ...prev,
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
        setMonthlyEmailEnabled(settingsData.monthlyEmailEnabled ?? false);
        setQuarterlyEmailEnabled(settingsData.quarterlyEmailEnabled ?? false);
        setSemiAnnualEmailEnabled(settingsData.semiAnnualEmailEnabled ?? false);
        setYearlyEmailEnabled(settingsData.yearlyEmailEnabled ?? false);
        setWeeklyBudgetEmailEnabled(settingsData.weeklyBudgetEmailEnabled ?? false);
        setMonthlyEmailRecipients(settingsData.monthlyEmailRecipients ?? []);
        // Load dividend settings
        setDividendIncomeCategoryId(settingsData.dividendIncomeCategoryId || '');
        setDividendIncomeSubCategoryId(settingsData.dividendIncomeSubCategoryId || '');
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
          userAge: settingsData?.userAge ?? null,
          riskFreeRate: settingsData?.riskFreeRate ?? null,
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
          monthlyEmailEnabled: settingsData?.monthlyEmailEnabled ?? false,
          quarterlyEmailEnabled: settingsData?.quarterlyEmailEnabled ?? false,
          semiAnnualEmailEnabled: settingsData?.semiAnnualEmailEnabled ?? false,
          yearlyEmailEnabled: settingsData?.yearlyEmailEnabled ?? false,
          weeklyBudgetEmailEnabled: settingsData?.weeklyBudgetEmailEnabled ?? false,
          monthlyEmailRecipients: [...(settingsData?.monthlyEmailRecipients ?? [])].sort(),
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
      toast.error('Errore nello spostamento delle transazioni');
    }
  };

  const handleExpenseCategoryDialogClose = () => {
    setCategoryDialogOpen(false);
    setEditingCategory(null);
  };

  const handleExpenseCategorySuccess = async () => {
    await loadExpenseCategories();
  };

  // Dividend settings handlers
  const handleSaveDividendSettings = async () => {
    if (!user || !ownerId) return;

    try {
      setSaving(true);
      const settingsData = await getSettings(ownerId);
      const targets = settingsData?.targets || getDefaultTargets();

      await setSettings(ownerId, {
        userAge,
        riskFreeRate,
        // Preserve FIRE settings (Bug #1 & #5 fix)
        includePrimaryResidenceInFIRE,
        withdrawalRate: settingsData?.withdrawalRate,
        plannedAnnualExpenses: settingsData?.plannedAnnualExpenses,
        targets,
        dividendIncomeCategoryId: dividendIncomeCategoryId || undefined,
        dividendIncomeSubCategoryId: dividendIncomeSubCategoryId || undefined,
      });

      toast.success('Impostazioni dividendi salvate con successo');
      setDividendBaselineKey(dividendSnapshotKey);
    } catch (error) {
      console.error('Error saving dividend settings:', error);
      toast.error('Errore nel salvataggio delle impostazioni dividendi');
    } finally {
      setSaving(false);
    }
  };

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
    if (Math.abs(total - 100) > 0.01) {
      toast.error(
        `Il totale deve essere 100%. Attualmente è ${formatPercentage(total)}`
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
        monthlyEmailEnabled,
        quarterlyEmailEnabled,
        semiAnnualEmailEnabled,
        yearlyEmailEnabled,
        weeklyBudgetEmailEnabled,
        monthlyEmailRecipients,
      });
      toast.success('Impostazioni salvate con successo');
      setAllocationBaselineKey(allocationSnapshotKey);
      setGeneralBaselineKey(generalSnapshotKey);
      setDividendBaselineKey(dividendSnapshotKey);
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

  const handleAddCategory = (assetClass: AssetClass, categoryName: string) => {
    const state = assetClassStates[assetClass];
    if (!categoryName.trim()) return;

    const trimmedName = categoryName.trim();
    if (state.categories.includes(trimmedName)) {
      toast.error('Questa categoria esiste già');
      return;
    }

    updateAssetClassState(assetClass, {
      categories: [...state.categories, trimmedName],
    });
  };

  const handleRemoveCategory = (assetClass: AssetClass, categoryName: string) => {
    const state = assetClassStates[assetClass];
    const newCategories = state.categories.filter((c) => c !== categoryName);

    // Also remove from subTargets if present
    const newSubTargets = state.subTargets.filter((t) => t.name !== categoryName);

    updateAssetClassState(assetClass, {
      categories: newCategories,
      subTargets: newSubTargets,
    });
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
        userAge: userAge ?? null,
        riskFreeRate: riskFreeRate ?? null,
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
    [userAge, riskFreeRate, autoCalculate, cashUseFixedAmount, cashFixedAmount, assetClassStates]
  );

  const generalSnapshotKey = useMemo(
    () =>
      JSON.stringify({
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
        monthlyEmailEnabled,
        quarterlyEmailEnabled,
        semiAnnualEmailEnabled,
        yearlyEmailEnabled,
        weeklyBudgetEmailEnabled,
        monthlyEmailRecipients: [...monthlyEmailRecipients].sort(),
      }),
    [
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
      monthlyEmailEnabled,
      quarterlyEmailEnabled,
      semiAnnualEmailEnabled,
      yearlyEmailEnabled,
      weeklyBudgetEmailEnabled,
      monthlyEmailRecipients,
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

  const activeTabHasUnsavedChanges =
    (activeTab === 'allocazione' && hasUnsavedAllocationChanges) ||
    (activeTab === 'generale' && hasUnsavedGeneralChanges) ||
    (activeTab === 'dividendi' && hasUnsavedDividendChanges);

  if (loading) return null;

  const total = calculateTotal();
  const isValidTotal = Math.abs(total - 100) < 0.01;

  return (
    <PageContainer className="space-y-4 sm:space-y-6">
      {/* Page header — editorial zone with eyebrow + border separator */}
      <div className="flex flex-col gap-3 landscape:flex-row landscape:items-center landscape:justify-between border-b border-border pb-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Configurazione</p>
          <h1 className="text-3xl font-bold text-foreground">Impostazioni</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Target di allocazione, preferenze e flussi
          </p>
        </div>
        <div className="flex flex-col landscape:flex-row gap-2 w-full landscape:w-auto">
          <div className="order-last landscape:order-first flex items-center text-xs text-muted-foreground">
            {activeTabHasUnsavedChanges ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-1 text-primary">
                Anteprima attiva: modifiche non salvate
              </span>
            ) : hasUnsavedChanges ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-1">
                Modifiche non salvate in altre sezioni
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-1">
                Tutte le modifiche sono salvate
              </span>
            )}
          </div>
          {/* Reset is only meaningful for allocation targets */}
          {activeTab === 'allocazione' && (
            <Button variant="outline" onClick={handleReset} disabled={isDemo} title={isDemo ? 'Non disponibile in modalità demo' : undefined} className="w-full landscape:w-auto">
              <RotateCcw className="mr-2 h-4 w-4" />
              Ripristina Default
            </Button>
          )}
          <Button onClick={handleSave} disabled={isDemo || saving} title={isDemo ? 'Non disponibile in modalità demo' : undefined} className="w-full landscape:w-auto">
            <Save className="mr-2 h-4 w-4" />
            {saving ? 'Salvataggio...' : 'Salva'}
          </Button>
        </div>
      </div>

      <PageTabs
        tabs={SETTINGS_TABS}
        value={activeTab}
        onValueChange={handleTabChange}
        layoutId="settings-tab-pill"
      >

        {/* Tab: Impostazioni Generali (lazy) */}
        {mountedTabs.has('generale') && (
          <TabsContent value="generale" className="mt-6 space-y-4 sm:space-y-6">
      {hasUnsavedGeneralChanges && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-foreground">
          Anteprima attiva: i cambi in questa sezione sono visibili subito ma non ancora salvati.
        </div>
      )}

      {/* FIRE & Goals Settings */}
      <Card>
        <CardHeader>
          <CardTitle>FIRE &amp; Obiettivi</CardTitle>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          <div className="space-y-4 sm:space-y-6">
            {/* FIRE Settings (Bug #1 fix) */}
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="firePrimaryResidence" className="text-sm font-medium">
                  Includi casa di abitazione nel calcolo FIRE
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Include il valore della casa di abitazione nel net worth FIRE
                </p>
              </div>
              <Switch
                id="firePrimaryResidence"
                checked={includePrimaryResidenceInFIRE}
                onCheckedChange={setIncludePrimaryResidenceInFIRE}
                className={interactiveControlClass}
              />
            </div>

            {/* Goal-Based Investing toggle */}
            <div className="flex items-center justify-between border-t pt-4">
              <div>
                <Label htmlFor="goalBasedInvesting" className="text-sm font-medium">
                  Obiettivi di Investimento
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Assegna porzioni del portafoglio a obiettivi finanziari specifici
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
                className={interactiveControlClass}
              />
            </div>

            {/* Goal-Driven Allocation toggle — only visible when goals are enabled */}
            {goalBasedInvestingEnabled && (
              <div className="flex items-center justify-between border-t pt-4">
                <div>
                  <Label htmlFor="goalDrivenAllocation" className="text-sm font-medium">
                    Allocazione da Obiettivi
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    I target sono calcolati in base al gap ancora da colmare per ogni obiettivo, pesato per priorità (Alta 3×, Media 2×, Bassa 1×). Gli obiettivi già raggiunti non influenzano il calcolo.
                  </p>
                </div>
                <Switch
                  id="goalDrivenAllocation"
                  checked={goalDrivenAllocationEnabled}
                  onCheckedChange={setGoalDrivenAllocationEnabled}
                  className={interactiveControlClass}
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Portfolio Cost Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Costi Portfolio</CardTitle>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          <div className="space-y-4 sm:space-y-6">
            {/* Stamp duty (imposta di bollo) */}
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="stampDutyToggle" className="text-sm font-medium">
                  Imposta di Bollo
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Includi l&apos;imposta di bollo nel costo annuale del portafoglio
                </p>
              </div>
              <Switch
                id="stampDutyToggle"
                checked={stampDutyEnabled}
                onCheckedChange={setStampDutyEnabled}
                className={interactiveControlClass}
              />
            </div>

            {stampDutyEnabled && (
              <div className="space-y-4 border-t pt-4">
                <div className="space-y-2">
                  <Label htmlFor="stampDutyRate">Aliquota (%)</Label>
                  <Input
                    id="stampDutyRate"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={stampDutyRate}
                    onChange={(e) => setStampDutyRate(parseFloat(e.target.value) || 0)}
                    placeholder="es. 0.20"
                    className={interactiveControlClass}
                  />
                  <p className="text-xs text-muted-foreground">
                    Aliquota annuale imposta di bollo (es. 0.20 per 0.20%). Si applica a tutti gli asset, tranne quelli marcati come esenti nel dialog di modifica asset.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Sottocategoria conti correnti</Label>
                  {assetClassStates.cash?.subCategoryEnabled && (assetClassStates.cash?.categories?.length ?? 0) > 0 ? (
                    <Select value={checkingAccountSubCategory} onValueChange={setCheckingAccountSubCategory}>
                      <SelectTrigger className={interactiveControlClass}>
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
                    <p className="text-xs text-amber-600">
                      Configura le sottocategorie di Liquidità nella sezione &quot;Target Allocazione Asset Class&quot; per abilitare questa opzione.
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Per i conti correnti l&apos;imposta si applica solo se il valore supera €5.000
                  </p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Cashflow Settings — default cash accounts, labor income categories, history start year */}
      <Card>
        <CardHeader>
          <CardTitle>Cashflow</CardTitle>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          <div className="space-y-4 sm:space-y-6">
            {/* Default cash accounts for cashflow */}
            {cashAssets.length > 0 && (
              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-medium">Conti di Default</Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Pre-selezionati nel dialog delle spese/entrate per nuove transazioni
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="defaultDebitAccount" className="text-sm">
                      Conto di Prelievo (spese)
                    </Label>
                    <Select value={defaultDebitCashAssetId} onValueChange={setDefaultDebitCashAssetId}>
                      <SelectTrigger
                        id="defaultDebitAccount"
                        className={interactiveControlClass}
                      >
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
                  <div className="space-y-1">
                    <Label htmlFor="defaultCreditAccount" className="text-sm">
                      Conto di Accredito (entrate)
                    </Label>
                    <Select value={defaultCreditCashAssetId} onValueChange={setDefaultCreditCashAssetId}>
                      <SelectTrigger
                        id="defaultCreditAccount"
                        className={interactiveControlClass}
                      >
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
              </div>
            )}

            {/* Labor income categories — used by dashboard KPI cards to separate work income from investment gains */}
            <div className="border-t pt-4 space-y-3">
              <div className="space-y-1">
                <Label className="text-sm font-medium">Reddito da Lavoro</Label>
                <p className="text-sm text-muted-foreground">
                  Categorie usate per le card Guadagnato e Risparmiato da Lavoro nella Dashboard. Includi stipendio, freelance e ogni altra forma di reddito attivo.
                </p>
              </div>
              {getCategoriesByType('income').length === 0 ? (
                <p className="text-sm text-muted-foreground italic">
                  Nessuna categoria di tipo &quot;Entrate&quot; trovata. Creane una nella sezione Cashflow.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {getCategoriesByType('income').map((cat) => {
                    const checked = laborIncomeCategoryIds.includes(cat.id);
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() =>
                          setLaborIncomeCategoryIds(
                            checked
                              ? laborIncomeCategoryIds.filter((id) => id !== cat.id)
                              : [...laborIncomeCategoryIds, cat.id]
                          )
                        }
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-colors ${
                          checked
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-background text-foreground border-border hover:bg-muted'
                        }`}
                      >
                        {checked && (
                          <svg className="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none">
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

            {/* Cashflow history start year — lets users exclude pre-import bulk data from trend charts */}
            <div className={cashAssets.length > 0 ? 'border-t pt-4 space-y-2' : 'border-t pt-4 space-y-2'}>
              <Label htmlFor="cashflowHistoryStartYear" className="text-sm font-medium">
                Anno inizio storico cashflow
              </Label>
              <p className="text-sm text-muted-foreground">
                I dati precedenti a questo anno vengono esclusi dai grafici dello storico totale
                cashflow. Utile se hai importato transazioni vecchie senza categoria.
              </p>
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
                className={cn('w-32', interactiveControlClass)}
              />
            </div>

            {/* Cost centers toggle — optional feature for tracking expenses by object/project */}
            <div className="flex items-center justify-between border-t pt-4">
              <div>
                <Label htmlFor="costCentersEnabled" className="text-sm font-medium">
                  Centri di Costo
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Raggruppa le spese per oggetto o progetto (es. &quot;Automobile Dacia&quot;) e
                  visualizza il costo totale nel tempo con grafici e storico transazioni
                </p>
              </div>
              <Switch
                id="costCentersEnabled"
                checked={costCentersEnabled}
                onCheckedChange={setCostCentersEnabled}
                className={interactiveControlClass}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Monthly email summary configuration */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Report Email Mensili</CardTitle>
          </div>
          <p className="text-sm text-muted-foreground">
            Ricevi un riepilogo automatico del patrimonio, cashflow e dividendi via email
            l&apos;ultimo giorno di ogni mese.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="monthlyEmailEnabled" className="text-sm font-medium">
                Attiva report mensile
              </Label>
              <p className="text-sm text-muted-foreground mt-1">
                Inviato automaticamente l&apos;ultimo giorno del mese
              </p>
            </div>
            <Switch
              id="monthlyEmailEnabled"
              checked={monthlyEmailEnabled}
              onCheckedChange={setMonthlyEmailEnabled}
              disabled={isDemo}
              className={interactiveControlClass}
            />
          </div>

          {/* Quarterly email toggle */}
          <div className="flex items-center justify-between border-t pt-4">
            <div>
              <Label htmlFor="quarterlyEmailEnabled" className="text-sm font-medium">
                Attiva report trimestrale
              </Label>
              <p className="text-sm text-muted-foreground mt-1">
                Inviato automaticamente l&apos;ultimo giorno di marzo, giugno, settembre e dicembre
              </p>
            </div>
            <Switch
              id="quarterlyEmailEnabled"
              checked={quarterlyEmailEnabled}
              onCheckedChange={setQuarterlyEmailEnabled}
              disabled={isDemo}
              className={interactiveControlClass}
            />
          </div>

          {/* Semi-annual email toggle */}
          <div className="flex items-center justify-between border-t pt-4">
            <div>
              <Label htmlFor="semiAnnualEmailEnabled" className="text-sm font-medium">
                Attiva report semestrale
              </Label>
              <p className="text-sm text-muted-foreground mt-1">
                Inviato automaticamente il 30 giugno e il 31 dicembre
              </p>
            </div>
            <Switch
              id="semiAnnualEmailEnabled"
              checked={semiAnnualEmailEnabled}
              onCheckedChange={setSemiAnnualEmailEnabled}
              disabled={isDemo}
              className={interactiveControlClass}
            />
          </div>

          {/* Yearly email toggle */}
          <div className="flex items-center justify-between border-t pt-4">
            <div>
              <Label htmlFor="yearlyEmailEnabled" className="text-sm font-medium">
                Attiva report annuale
              </Label>
              <p className="text-sm text-muted-foreground mt-1">
                Inviato automaticamente il 31 dicembre
              </p>
            </div>
            <Switch
              id="yearlyEmailEnabled"
              checked={yearlyEmailEnabled}
              onCheckedChange={setYearlyEmailEnabled}
              disabled={isDemo}
              className={interactiveControlClass}
            />
          </div>

          {/* Weekly budget email toggle */}
          <div className="flex items-center justify-between border-t pt-4">
            <div>
              <Label htmlFor="weeklyBudgetEmailEnabled" className="text-sm font-medium">
                Attiva report budget settimanale
              </Label>
              <p className="text-sm text-muted-foreground mt-1">
                Inviato ogni domenica con lo stato dei budget mensili e annuali
              </p>
            </div>
            <Switch
              id="weeklyBudgetEmailEnabled"
              checked={weeklyBudgetEmailEnabled}
              onCheckedChange={setWeeklyBudgetEmailEnabled}
              disabled={isDemo}
              className={interactiveControlClass}
            />
          </div>

          {(monthlyEmailEnabled || quarterlyEmailEnabled || semiAnnualEmailEnabled || yearlyEmailEnabled || weeklyBudgetEmailEnabled) && (
            <div className="space-y-3 border-t pt-4">
              <Label className="text-sm font-medium">Destinatari</Label>

              {/* Add new recipient */}
              <div className="flex gap-2">
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
                  <Plus className="h-4 w-4 mr-1" />
                  Aggiungi
                </Button>
              </div>

              {/* Recipient list */}
              {monthlyEmailRecipients.length > 0 && (
                <ul className="space-y-2">
                  {monthlyEmailRecipients.map((email) => (
                    <li
                      key={email}
                      className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2 text-sm"
                    >
                      <span className="text-foreground">{email}</span>
                      <button
                        type="button"
                        aria-label={`Rimuovi ${email}`}
                        disabled={isDemo}
                        onClick={() =>
                          setMonthlyEmailRecipients(
                            monthlyEmailRecipients.filter((r) => r !== email)
                          )
                        }
                        className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {/* Manual send button */}
              {/* Manual send buttons — one per enabled period type */}
              <div className="pt-2 flex flex-wrap gap-2">
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
                        <span className="h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
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
              <p className="mt-2 text-xs text-muted-foreground">
                Invia il riepilogo del periodo corrente per verificare il formato.
                Ricorda di salvare prima le impostazioni.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Development Features — clearly separated from user-facing settings, only shown in dev mode */}
      {enableTestSnapshots && (
        <div className="border-t border-border pt-6 space-y-4">
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

        {/* Tab: Allocazione (default, always mounted) */}
        <TabsContent value="allocazione" className="mt-6 space-y-4 sm:space-y-6">
      {hasUnsavedAllocationChanges && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-foreground">
          Anteprima attiva: target e dipendenze mostrano già il nuovo assetto prima del salvataggio.
        </div>
      )}

      {/* Hero — allocation total as dominant primary number */}
      <Card>
        <CardContent className="px-6 pt-6 pb-5">
          <p className="text-xs uppercase tracking-widest text-muted-foreground/70">Allocazione Configurata</p>
          <div className="flex items-end gap-3 mt-1">
            <p className={`text-4xl font-bold font-mono ${isValidTotal ? 'text-foreground' : 'text-destructive'}`}>
              {formatPercentage(total)}
            </p>
            {cashUseFixedAmount && (
              <span className="text-sm text-muted-foreground mb-1">esclusa liquidità fissa</span>
            )}
          </div>
          <div className="divide-y border-t mt-4">
            <div className="flex items-center justify-between py-2.5">
              <span className="text-sm text-muted-foreground">Classi con allocazione &gt; 0%</span>
              <span className="text-sm font-semibold font-mono">
                {Object.values(assetClassStates).filter((s) => s && s.targetPercentage > 0).length}
              </span>
            </div>
            {autoCalculate && userAge !== undefined && riskFreeRate !== undefined && (
              <div className="flex items-center justify-between py-2.5">
                <span className="text-sm text-muted-foreground">Auto-calc attivo</span>
                <span className="text-sm font-semibold font-mono text-primary">
                  {calculateEquityPercentage(userAge, riskFreeRate).toFixed(1)}% Azioni
                </span>
              </div>
            )}
            {!isValidTotal && (
              <div className="flex items-center justify-between py-2.5">
                <span className="text-sm text-destructive">Residuo da allocare</span>
                <span className="text-sm font-semibold font-mono text-destructive">
                  {formatPercentage(Math.abs(100 - total))}
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Profilo — flat divide-y rows: age, risk-free rate, auto-calc */}
      <Card>
        <CardContent className="p-0">
          <div className="divide-y">
            {/* Età */}
            <div className="flex items-center justify-between gap-4 px-6 py-4">
              <div className="min-w-0">
                <p className="text-sm font-medium">Età</p>
                <p className="text-xs text-muted-foreground mt-0.5">Usata per il calcolo automatico dei target</p>
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
                className={cn('w-24 text-right font-mono shrink-0', interactiveControlClass)}
              />
            </div>
            {/* Risk-free rate */}
            <div className="flex items-center justify-between gap-4 px-6 py-4">
              <div className="min-w-0">
                <p className="text-sm font-medium">Risk-Free Rate</p>
                <p className="text-xs text-muted-foreground mt-0.5">
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
              <div className="flex items-center gap-1.5 shrink-0">
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
            {/* Auto-calculate toggle — disabled until both age and rate are set */}
            <div className="flex items-center justify-between gap-4 px-6 py-4">
              <div className="min-w-0">
                <p className="text-sm font-medium">Calcolo automatico Azioni/Obbligazioni</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Formula di{' '}
                  <a
                    href="https://www.youtube.com/channel/UCNp1e5n6rlnfm5aWbHe3cJw"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    The Bull
                  </a>
                  : 125 {'−'} età {'−'} (rate {'×'} 5) = % Azioni
                </p>
                {autoCalculate && userAge !== undefined && riskFreeRate !== undefined && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Risultato:{' '}
                    <strong className="text-foreground">
                      {calculateEquityPercentage(userAge, riskFreeRate).toFixed(2)}% Azioni
                    </strong>
                    {' '}· Obbligazioni calcolate come residuo
                  </p>
                )}
              </div>
              <Switch
                id="autoCalculate"
                checked={autoCalculate}
                onCheckedChange={setAutoCalculate}
                disabled={userAge === undefined || riskFreeRate === undefined}
                className={cn('shrink-0', interactiveControlClass)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Unified target card — one card, flat divide-y, sub-categories expandable inline */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Target per Asset Class</p>
            {/* The denominator these percentages apply to is not the net worth — say so here, or the
                Allocazione page reads as if it had lost money. */}
            <p className="mt-0.5 text-xs text-muted-foreground">
              Si applicano al patrimonio ribilanciabile: gli asset marcati &quot;Escludi dal
              ribilanciamento&quot; non entrano nel calcolo.
            </p>
          </div>
          <span
            className={`shrink-0 text-xs font-semibold font-mono ${isValidTotal ? 'text-green-600' : 'text-red-600'}`}
          >
            {formatPercentage(total)}
            {cashUseFixedAmount && ' (excl. cash)'}
            {!isValidTotal && ' ≠ 100%'}
          </span>
        </div>
        <div className="divide-y">
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
                <div className="flex items-center gap-3 px-6 py-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{assetClassLabels[assetClass]}</p>
                    {isAutoCalculated && (
                      <p className="text-xs text-primary mt-0.5">Calcolato automaticamente</p>
                    )}
                  </div>
                  {isCash && !isAutoCalculated && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Switch
                        id="cashFixedToggle"
                        checked={cashUseFixedAmount}
                        onCheckedChange={setCashUseFixedAmount}
                        className={interactiveControlClass}
                      />
                      <Label htmlFor="cashFixedToggle" className="text-xs text-muted-foreground whitespace-nowrap">
                        fisso €
                      </Label>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Input
                      id={assetClass}
                      type="number"
                      step="0.01"
                      min="0"
                      max={isCash && cashUseFixedAmount ? undefined : '100'}
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
                      className={cn(
                        'w-28 text-right font-mono',
                        interactiveControlClass,
                        isAutoCalculated ? 'bg-muted' : ''
                      )}
                    />
                    <span className="text-sm text-muted-foreground w-4 shrink-0">
                      {isCash && cashUseFixedAmount ? '€' : '%'}
                    </span>
                  </div>
                  {/* Sub-category expand/collapse */}
                  <button
                    type="button"
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0 p-1"
                    onClick={() => updateAssetClassState(assetClass, { expanded: !state.expanded })}
                    aria-expanded={state.expanded}
                    aria-label={`${state.expanded ? 'Chiudi' : 'Apri'} sotto-categorie`}
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

                {/* Sub-categories — expandable, indented within the same card */}
                <Collapsible open={state.expanded}>
                  <CollapsibleContent
                    forceMount
                    className={cn(
                      'overflow-hidden motion-safe:transition-all motion-safe:duration-200 motion-reduce:transition-none',
                      'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
                      'data-[state=closed]:hidden'
                    )}
                  >
                    <div className="bg-muted/20 border-t">
                      {/* Enable toggle + sub-total */}
                      <div className="flex items-center justify-between px-6 py-3">
                        <div className="flex items-center gap-2">
                          <Switch
                            id={`toggle-${assetClass}`}
                            checked={state.subCategoryEnabled}
                            onCheckedChange={(checked: boolean) =>
                              handleToggleSubCategories(assetClass, checked)
                            }
                            className={interactiveControlClass}
                          />
                          <Label htmlFor={`toggle-${assetClass}`} className="text-sm">
                            Abilita sotto-categorie
                          </Label>
                        </div>
                        {state.subCategoryEnabled && (
                          <span
                            className={`text-xs font-semibold font-mono ${
                              isValidSubTotal ? 'text-green-600' : 'text-red-600'
                            }`}
                          >
                            {formatPercentage(subTotal)}
                            {!isValidSubTotal && ' ≠ 100%'}
                          </span>
                        )}
                      </div>

                      {/* Sub-target rows */}
                      {state.subCategoryEnabled && (
                        <div className="px-6 pb-4">
                          <div className="divide-y border-t">
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
                                      <div className="flex-1 min-w-0">
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
                                        className={cn(
                                          'w-24 text-right font-mono shrink-0',
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
                                      <span className="text-sm text-muted-foreground shrink-0">%</span>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleRemoveSubTarget(assetClass, originalIndex)}
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
                                              className="text-xs text-muted-foreground cursor-pointer"
                                            >
                                              Traccia asset specifici
                                            </Label>
                                          </div>
                                          {target.specificAssetsEnabled && (
                                            <span
                                              className={`text-xs font-semibold font-mono ${
                                                isValidSpecificTotal ? 'text-green-600' : 'text-red-600'
                                              }`}
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
                                              className="w-full justify-start text-xs h-8"
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
                                                <div className="space-y-2 mt-1">
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
                                                            className={cn(
                                                              'w-24 text-sm text-right font-mono shrink-0',
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
                                                          <span className="text-xs text-muted-foreground shrink-0">
                                                            %
                                                          </span>
                                                          <Button
                                                            variant="ghost"
                                                            size="sm"
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
                            Aggiungi Sotto-Categoria
                          </Button>
                          <p className="text-xs text-muted-foreground mt-2">
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
      </Card>

      {/* Notes block: collapsed by default to reduce visual noise */}
      <Collapsible open={isNotesOpen} onOpenChange={setIsNotesOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-lg border border-border px-4 py-3 text-sm text-muted-foreground hover:bg-muted/50 transition-colors"
          >
            <span className="font-medium text-foreground">Note e dettagli tecnici</span>
            <ChevronDown className={cn('h-4 w-4 transition-transform duration-200', isNotesOpen && 'rotate-180')} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="overflow-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-200">
          <div className="rounded-b-lg border border-t-0 border-border bg-muted/30 px-4 py-4">
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>• Il totale delle allocazioni delle asset class deve essere esattamente 100%</li>
              <li>• La liquidità può essere impostata come valore fisso in euro. In questo caso, le percentuali delle altre asset class si applicheranno al patrimonio rimanente (totale - liquidità fissa)</li>
              <li>• Per ogni asset class con sotto-categorie abilitate, il totale delle sotto-categorie deve essere esattamente 100%</li>
              <li>• Le sotto-categorie sono espresse come percentuale della loro asset class di appartenenza</li>
              <li>• Usa il toggle &quot;Abilita&quot; per attivare/disattivare le sotto-categorie per ciascuna asset class</li>
              <li>• I cambiamenti saranno applicati immediatamente alla pagina Allocazione</li>
            </ul>
          </div>
        </CollapsibleContent>
      </Collapsible>

        </TabsContent>

        {/* Tab: Spese (lazy) */}
        {mountedTabs.has('spese') && (
          <TabsContent value="spese" className="mt-6">

      {/* Expense Categories Management Section */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              <CardTitle>Impostazioni Tracciamento Spese</CardTitle>
            </div>
            <Button onClick={handleAddExpenseCategory} size="sm" className="w-full sm:w-auto">
              <Plus className="mr-2 h-4 w-4" />
              Nuova Categoria
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          {loadingCategories ? (
            <p className="text-sm text-muted-foreground">Caricamento categorie...</p>
          ) : (
            <div className="space-y-6">
              {/* Categories by type */}
              {(['income', 'fixed', 'variable', 'debt'] as ExpenseType[]).map((type) => {
                const categories = getCategoriesByType(type);
                return (
                  <div key={type} className="space-y-3">
                    <h3 className="font-semibold text-sm text-foreground border-b pb-2">
                      {EXPENSE_TYPE_LABELS[type]}
                    </h3>
                    {categories.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic pl-4">
                        Nessuna categoria creata
                      </p>
                    ) : (
                      <div className="divide-y">
                        {categories.map((category) => (
                          <div
                            key={category.id}
                            className="flex items-center justify-between py-3 hover:bg-muted/30 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              {(() => {
                                const CatIcon = category.icon ? getLazyIcon(category.icon) : null;
                                return (
                                  <div
                                    className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                                    style={{ backgroundColor: category.color ? `${category.color}20` : 'var(--muted)' }}
                                  >
                                    {CatIcon ? (
                                      <Suspense fallback={<div className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: category.color || '#3b82f6' }} />}>
                                        <CatIcon className="w-3.5 h-3.5" style={{ color: category.color || 'var(--muted-foreground)' }} aria-hidden="true" />
                                      </Suspense>
                                    ) : (
                                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: category.color || '#3b82f6' }} />
                                    )}
                                  </div>
                                );
                              })()}
                              <div>
                                <p className="font-medium text-sm">{category.name}</p>
                                {category.subCategories && category.subCategories.length > 0 && (
                                  <p className="text-xs text-muted-foreground">
                                    {category.subCategories.length} sotto-{category.subCategories.length === 1 ? 'categoria' : 'categorie'}: {category.subCategories.map(sub => sub.name).join(', ')}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEditExpenseCategory(category)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(event) =>
                                  handleMoveExpenseCategory(
                                    category.id,
                                    category.name,
                                    calculateDialogOrigin(event.currentTarget)
                                  )
                                }
                                title="Sposta tutte le transazioni"
                              >
                                <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
                              </Button>
                              {/* Delete button — 2-click disarm: first click arms (red Elimina),
                                  second click confirms, auto-disarms after 3s. */}
                              <Button
                                variant="ghost"
                                size="sm"
                                className={
                                  pendingDeleteDirectCategoryId === category.id
                                    ? 'text-destructive hover:text-destructive hover:bg-destructive/10'
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
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

          </TabsContent>
        )}

        {/* Tab: Dividendi (lazy) */}
        {mountedTabs.has('dividendi') && (
          <TabsContent value="dividendi" className="mt-6 space-y-4 sm:space-y-6">
      {hasUnsavedDividendChanges && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-foreground">
          Anteprima attiva: categoria e sottocategoria dividendi sono aggiornate localmente.
        </div>
      )}

      {/* Dividend Settings Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-primary" />
            <CardTitle>Impostazioni Dividendi</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 space-y-4 sm:space-y-6">
          <p className="text-sm text-muted-foreground">
            Configura la categoria per le entrate automatiche da dividendi
          </p>

          <div className="grid gap-4 desktop:grid-cols-2">
            {/* Dividend Income Category */}
            <div className="space-y-2">
              <Label htmlFor="dividendIncomeCategory">Categoria Entrate Dividendi</Label>
              <div className="flex gap-2">
                <Select
                  value={dividendIncomeCategoryId || undefined}
                  onValueChange={(value) => {
                    setDividendIncomeCategoryId(value);
                    setDividendIncomeSubCategoryId(''); // Reset subcategory
                  }}
                >
                  <SelectTrigger
                    id="dividendIncomeCategory"
                    className={interactiveControlClass}
                  >
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

            {/* Dividend Income Subcategory */}
            <div className="space-y-2">
              <Label htmlFor="dividendIncomeSubCategory">Sottocategoria (opzionale)</Label>
              <div className="flex gap-2">
                <Select
                  value={dividendIncomeSubCategoryId || undefined}
                  onValueChange={setDividendIncomeSubCategoryId}
                  disabled={!dividendIncomeCategoryId}
                >
                  <SelectTrigger
                    id="dividendIncomeSubCategory"
                    className={interactiveControlClass}
                  >
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

          <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t">
            <Button
              onClick={handleSaveDividendSettings}
              disabled={isDemo || saving}
              title={isDemo ? 'Non disponibile in modalità demo' : undefined}
              className="flex items-center gap-2"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Salvataggio...' : 'Salva Impostazioni'}
            </Button>

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
                : 'Sincronizza Dividendi Esistenti'}
            </Button>
          </div>

          {!dividendIncomeCategoryId && (
            <p className="text-sm text-amber-600">
              ⚠️ Configura una categoria per abilitare la sincronizzazione automatica dei dividendi
            </p>
          )}
        </CardContent>
      </Card>

          </TabsContent>
        )}

        {/* Tab: Condivisione account */}
        {mountedTabs.has('condivisione') && (
          <TabsContent value="condivisione" className="mt-6 space-y-4 sm:space-y-6">
            <AccountSharingSection disabled={isDemo} />
          </TabsContent>
        )}

        {/* Tab: Aspetto */}
        {mountedTabs.has('aspetto') && (
          <TabsContent value="aspetto" className="mt-6 space-y-4 sm:space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Palette className="h-5 w-5 text-primary" />
                  <CardTitle>Tema Colori</CardTitle>
                </div>
                <p className="text-sm text-muted-foreground">
                  Scegli la palette cromatica dell&apos;interfaccia. La scelta viene salvata automaticamente e sincronizzata su tutti i dispositivi.
                </p>
              </CardHeader>
              <CardContent className="p-4 sm:p-6">
                <div className="grid grid-cols-2 sm:grid-cols-3 desktop:grid-cols-6 gap-3">
                  {(
                    [
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
                    ] as const
                  ).map((theme) => {
                    const isActive = colorTheme === theme.id;
                    return (
                      <button
                        key={theme.id}
                        onClick={() => setColorTheme(theme.id)}
                        className={cn(
                          'relative flex flex-col rounded-lg border-2 p-3 text-left transition-all hover:border-primary/60',
                          isActive
                            ? 'border-primary shadow-sm'
                            : 'border-border'
                        )}
                      >
                        {/* Mini preview */}
                        <div className="mb-3 overflow-hidden rounded-md border border-border/50 h-16">
                          {/* Light half */}
                          <div
                            className="h-8 w-full flex items-center gap-1.5 px-2"
                            style={{ background: theme.swatchBg }}
                          >
                            <div
                              className="h-3 w-3 rounded-sm flex-shrink-0"
                              style={{ background: theme.swatchPrimary }}
                            />
                            <div
                              className="h-2 rounded-full flex-1"
                              style={{ background: theme.swatchAccent }}
                            />
                          </div>
                          {/* Dark half */}
                          <div
                            className="h-8 w-full flex items-center gap-1.5 px-2"
                            style={{ background: theme.swatchBgDark }}
                          >
                            <div
                              className="h-3 w-3 rounded-sm flex-shrink-0"
                              style={{ background: theme.swatchPrimaryDark }}
                            />
                            <div
                              className="h-2 rounded-full flex-1 opacity-30"
                              style={{ background: theme.swatchPrimaryDark }}
                            />
                          </div>
                        </div>

                        <span className="text-sm font-medium leading-none">{theme.name}</span>
                        <span className="mt-1 text-xs text-muted-foreground">{theme.description}</span>

                        {isActive && (
                          <div className="absolute top-2 right-2 h-2 w-2 rounded-full bg-primary" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
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
