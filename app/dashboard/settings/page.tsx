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

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
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
import { Save, RotateCcw, Plus, Trash2, ChevronDown, ChevronUp, Edit, Receipt, FlaskConical, Coins, ArrowRightLeft } from 'lucide-react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { ExpenseCategory, ExpenseType, EXPENSE_TYPE_LABELS } from '@/types/expenses';
import { getAllCategories, deleteCategory, getCategoryById } from '@/lib/services/expenseCategoryService';
import { getExpenseCountByCategoryId, reassignExpensesCategory, clearExpensesCategoryAssignment, moveExpensesToCategory } from '@/lib/services/expenseService';
import { CategoryManagementDialog } from '@/components/expenses/CategoryManagementDialog';
import { CategoryDeleteConfirmDialog } from '@/components/expenses/CategoryDeleteConfirmDialog';
import { CategoryMoveDialog } from '@/components/expenses/CategoryMoveDialog';
import { CreateDummySnapshotModal } from '@/components/CreateDummySnapshotModal';
import { DeleteDummyDataDialog } from '@/components/DeleteDummyDataDialog';

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

export default function SettingsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userAge, setUserAge] = useState<number | undefined>(undefined);
  const [riskFreeRate, setRiskFreeRate] = useState<number | undefined>(undefined);
  const [autoCalculate, setAutoCalculate] = useState(false);
  const [cashUseFixedAmount, setCashUseFixedAmount] = useState(false);
  const [cashFixedAmount, setCashFixedAmount] = useState<number>(0);
  const [includePrimaryResidenceInFIRE, setIncludePrimaryResidenceInFIRE] = useState<boolean>(false);
  const [goalBasedInvestingEnabled, setGoalBasedInvestingEnabled] = useState<boolean>(false);
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

  // Dividend settings state
  const [dividendIncomeCategoryId, setDividendIncomeCategoryId] = useState<string>('');
  const [dividendIncomeSubCategoryId, setDividendIncomeSubCategoryId] = useState<string>('');
  const [syncingDividends, setSyncingDividends] = useState(false);

  // Test snapshot modal state
  const [dummySnapshotModalOpen, setDummySnapshotModalOpen] = useState(false);
  const [deleteDummyDataDialogOpen, setDeleteDummyDataDialogOpen] = useState(false);
  const enableTestSnapshots = process.env.NEXT_PUBLIC_ENABLE_TEST_SNAPSHOTS === 'true';

  useEffect(() => {
    if (user) {
      loadTargets();
      loadExpenseCategories();
    }
  }, [user]);

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
    if (!user) return;

    try {
      setLoading(true);
      const settingsData = await getSettings(user.uid);
      const targets = settingsData?.targets || getDefaultTargets();

      // Load user age and risk-free rate if available
      if (settingsData) {
        setUserAge(settingsData.userAge);
        setRiskFreeRate(settingsData.riskFreeRate);
        setAutoCalculate(
          settingsData.userAge !== undefined &&
          settingsData.riskFreeRate !== undefined
        );
        // Load FIRE setting (Bug #1 fix)
        setIncludePrimaryResidenceInFIRE(settingsData.includePrimaryResidenceInFIRE ?? false);
        setGoalBasedInvestingEnabled(settingsData.goalBasedInvestingEnabled ?? false);
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
          expanded: assetClass === 'equity', // Solo equity espanso di default
        };
      });

      setAssetClassStates(states);
      setSubcategoryNameMap(nameMapByAssetClass);
    } catch (error) {
      console.error('Error loading targets:', error);
      toast.error('Errore nel caricamento dei target');
    } finally {
      setLoading(false);
    }
  };

  const loadExpenseCategories = async () => {
    if (!user) return;

    try {
      setLoadingCategories(true);
      const categories = await getAllCategories(user.uid);
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

  const handleDeleteExpenseCategory = async (categoryId: string, categoryName: string) => {
    if (!user) return;

    try {
      // Check if there are expenses associated with this category
      const expenseCount = await getExpenseCountByCategoryId(categoryId, user.uid);

      if (expenseCount > 0) {
        // Show reassignment dialog
        const category = await getCategoryById(categoryId);
        if (category) {
          setCategoryToDelete(category);
          setExpenseCountToReassign(expenseCount);
          setDeleteConfirmDialogOpen(true);
        }
      } else {
        // No expenses, proceed with direct deletion after confirmation
        if (window.confirm(`Sei sicuro di voler eliminare la categoria "${categoryName}"?`)) {
          await deleteCategory(categoryId);
          toast.success('Categoria eliminata con successo');
          await loadExpenseCategories();
        }
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
    if (!categoryToDelete || !user) return;

    try {
      // If no new category ID provided, delete without reassignment
      if (!newCategoryId) {
        // Clear category assignment from expenses (set to "Senza categoria")
        const clearedCount = await clearExpensesCategoryAssignment(
          categoryToDelete.id,
          user.uid
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
        user.uid,
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

  // ========== Move Category Handlers ==========

  const handleMoveExpenseCategory = async (categoryId: string, categoryName: string) => {
    if (!user) return;

    try {
      const expenseCount = await getExpenseCountByCategoryId(categoryId, user.uid);

      if (expenseCount === 0) {
        toast.warning(`La categoria "${categoryName}" non ha transazioni da spostare`);
        return;
      }

      const category = await getCategoryById(categoryId);
      if (category) {
        setCategoryToMove(category);
        setExpenseCountToMove(expenseCount);
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
    if (!categoryToMove || !user) return;

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
        user.uid,
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
    if (!user) return;

    try {
      setSaving(true);
      const settingsData = await getSettings(user.uid);
      const targets = settingsData?.targets || getDefaultTargets();

      await setSettings(user.uid, {
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
    } catch (error) {
      console.error('Error saving dividend settings:', error);
      toast.error('Errore nel salvataggio delle impostazioni dividendi');
    } finally {
      setSaving(false);
    }
  };

  const handleSyncDividends = async () => {
    if (!user) return;

    if (!dividendIncomeCategoryId) {
      toast.error('Seleziona prima una categoria per le entrate da dividendi');
      return;
    }

    const confirmSync = window.confirm(
      'Sincronizzare tutti i dividendi esistenti creando le relative entrate nel tracking cashflow?'
    );

    if (!confirmSync) return;

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
      const response = await fetch(`/api/dividends?userId=${user.uid}`);
      if (!response.ok) {
        throw new Error('Errore nel caricamento dei dividendi');
      }
      const data = await response.json();
      const dividends = data.dividends || [];

      // Sync dividends via API
      const syncResponse = await fetch('/api/dividends/sync-expenses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.uid,
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
    if (!user) return;

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
                `Sotto-categoria "${subTarget.name}" in ${assetClassLabels[assetClass]}: ${validationError}`
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
      const settingsData = await getSettings(user.uid);

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

      await setSettings(user.uid, {
        userAge,
        riskFreeRate,
        // Preserve FIRE settings (Bug #1 fix)
        includePrimaryResidenceInFIRE,
        goalBasedInvestingEnabled,
        withdrawalRate: settingsData?.withdrawalRate,
        plannedAnnualExpenses: settingsData?.plannedAnnualExpenses,
        targets,
        dividendIncomeCategoryId: dividendIncomeCategoryId || undefined,
        dividendIncomeSubCategoryId: dividendIncomeSubCategoryId || undefined,
      });
      toast.success('Impostazioni salvate con successo');
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
        expanded: assetClass === 'equity',
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

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-gray-500">Caricamento...</div>
      </div>
    );
  }

  const total = calculateTotal();
  const isValidTotal = Math.abs(total - 100) < 0.01;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Impostazioni</h1>
          <p className="mt-2 text-gray-600">
            Configura i tuoi target di allocazione del portafoglio
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <Button variant="outline" onClick={handleReset} className="w-full sm:w-auto">
            <RotateCcw className="mr-2 h-4 w-4" />
            Ripristina Default
          </Button>
          <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
            <Save className="mr-2 h-4 w-4" />
            {saving ? 'Salvataggio...' : 'Salva'}
          </Button>
        </div>
      </div>

      {/* User Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Impostazioni Utente</CardTitle>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          <div className="space-y-4 sm:space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="userAge">Età (anni)</Label>
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
                  placeholder="Inserisci la tua età"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="riskFreeRate">
                  Tasso Risk-Free Rate (%)
                </Label>
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
                  placeholder="Es: 3.5"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-2">
              <Switch
                id="autoCalculate"
                checked={autoCalculate}
                onCheckedChange={setAutoCalculate}
                disabled={userAge === undefined || riskFreeRate === undefined}
                className="shrink-0"
              />
              <Label htmlFor="autoCalculate" className="text-sm block">
                Calcola automaticamente % Azioni e Obbligazioni (Formula di{' '}
                <a
                  href="https://www.youtube.com/channel/UCNp1e5n6rlnfm5aWbHe3cJw"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  The Bull
                </a>
                )
              </Label>
            </div>

            {autoCalculate && userAge !== undefined && riskFreeRate !== undefined && (
              <div className="rounded-lg bg-blue-50 p-4">
                <p className="text-sm text-blue-900">
                  <strong>Formula applicata:</strong> 125 - {userAge} - ({riskFreeRate} × 5) ={' '}
                  <strong>{calculateEquityPercentage(userAge, riskFreeRate).toFixed(2)}% Azioni</strong>
                </p>
                <p className="mt-1 text-sm text-blue-800">
                  La percentuale di Obbligazioni sarà calcolata come: 100% - (somma delle altre asset class)
                </p>
              </div>
            )}

            {/* FIRE Settings (Bug #1 fix) */}
            <div className="flex items-center justify-between border-t pt-4">
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
                onCheckedChange={setGoalBasedInvestingEnabled}
              />
            </div>

            <p className="text-sm text-gray-600">
              <strong>Nota:</strong> Il tasso risk-free può essere recuperato da{' '}
              <a
                href="https://www.investing.com/rates-bonds/italy-10-year-bond-yield"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                BTP 10 anni Italia su Investing.com
              </a>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Asset Class Targets */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Target Allocazione Asset Class</CardTitle>
            <div
              className={`text-sm font-semibold ${
                isValidTotal ? 'text-green-600' : 'text-red-600'
              }`}
            >
              Totale: {formatPercentage(total)}
              {cashUseFixedAmount && ' (escl. liquidità fissa)'}
              {!isValidTotal && ' (deve essere 100%)'}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          <div className="grid gap-6 md:grid-cols-2">
            {assetClasses.map((assetClass) => {
              const isAutoCalculated = autoCalculate && (assetClass === 'equity' || assetClass === 'bonds');
              const isCash = assetClass === 'cash';
              return (
                <div key={assetClass} className="space-y-2">
                  <Label htmlFor={assetClass}>
                    {assetClassLabels[assetClass]}
                    {isAutoCalculated && (
                      <span className="ml-2 text-xs text-blue-600">(Calcolato automaticamente)</span>
                    )}
                  </Label>
                  {isCash && (
                    <div className="flex items-center gap-2">
                      <Switch
                        id="cashFixedToggle"
                        checked={cashUseFixedAmount}
                        onCheckedChange={setCashUseFixedAmount}
                      />
                      <Label htmlFor="cashFixedToggle" className="text-sm">
                        Valore fisso in €
                      </Label>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Input
                      id={assetClass}
                      type="number"
                      step="0.01"
                      min="0"
                      max={isCash && cashUseFixedAmount ? undefined : "100"}
                      value={
                        isCash && cashUseFixedAmount
                          ? cashFixedAmount
                          : assetClassStates[assetClass]?.targetPercentage || 0
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
                      className={isAutoCalculated ? 'bg-gray-100' : ''}
                    />
                    <span className="text-sm text-gray-600">
                      {isCash && cashUseFixedAmount ? '€' : '%'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Sub-Categories for each Asset Class */}
      {assetClasses.map((assetClass) => {
        const state = assetClassStates[assetClass];
        if (!state) return null;

        const subTotal = calculateSubTargetTotal(assetClass);
        const isValidSubTotal = Math.abs(subTotal - 100) < 0.01;

        return (
          <Card key={`sub-${assetClass}`}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      updateAssetClassState(assetClass, {
                        expanded: !state.expanded,
                      })
                    }
                  >
                    {state.expanded ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </Button>
                  <CardTitle>
                    Sotto-Categorie {assetClassLabels[assetClass]}
                  </CardTitle>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`toggle-${assetClass}`} className="text-sm">
                      Abilita
                    </Label>
                    <Switch
                      id={`toggle-${assetClass}`}
                      checked={state.subCategoryEnabled}
                      onCheckedChange={(checked: boolean) =>
                        handleToggleSubCategories(assetClass, checked)
                      }
                    />
                  </div>
                  {state.subCategoryEnabled && (
                    <div
                      className={`text-sm font-semibold ${
                        isValidSubTotal ? 'text-green-600' : 'text-red-600'
                      }`}
                    >
                      Totale: {formatPercentage(subTotal)}
                      {!isValidSubTotal && ' (deve essere 100%)'}
                    </div>
                  )}
                </div>
              </div>
            </CardHeader>
            {state.expanded && state.subCategoryEnabled && (
              <CardContent className="p-4 sm:p-6">
                <div className="space-y-4">
                  {/* Sub-Targets */}
                  <div className="space-y-3">
                    {state.subTargets
                      .map((target, originalIndex) => ({ target, originalIndex }))
                      .sort((a, b) => a.target.name.localeCompare(b.target.name))
                      .map(({ target, originalIndex }) => {
                        const specificAssetTotal = calculateSpecificAssetTotal(assetClass, originalIndex);
                        const isValidSpecificTotal = Math.abs(specificAssetTotal - 100) < 0.01;

                        return (
                          <div key={originalIndex} className="space-y-3 border rounded-lg p-2 sm:p-3 bg-gray-50">
                            {/* Main subcategory row */}
                            <div className="flex items-center gap-3">
                              <div className="flex-1">
                                <Input
                                  placeholder="Nome sotto-categoria"
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
                                />
                                <datalist id={`${assetClass}-categories`}>
                                  {state.categories.map((cat) => (
                                    <option key={cat} value={cat} />
                                  ))}
                                </datalist>
                              </div>
                              <div className="flex items-center gap-2">
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  max="100"
                                  className="w-24"
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
                                <span className="text-sm text-gray-600">%</span>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRemoveSubTarget(assetClass, originalIndex)}
                              >
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            </div>

                            {/* Specific Assets Section */}
                            {target.name && (
                              <div className="ml-3 sm:ml-6 space-y-3 border-l-2 border-blue-200 pl-2 sm:pl-4">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <Switch
                                      id={`specific-${assetClass}-${originalIndex}`}
                                      checked={target.specificAssetsEnabled || false}
                                      onCheckedChange={(checked) =>
                                        handleToggleSpecificAssets(assetClass, originalIndex, checked)
                                      }
                                    />
                                    <Label
                                      htmlFor={`specific-${assetClass}-${originalIndex}`}
                                      className="text-sm cursor-pointer"
                                    >
                                      Abilita tracciamento asset specifici
                                    </Label>
                                  </div>
                                  {target.specificAssetsEnabled && (
                                    <div
                                      className={`text-xs font-semibold ${
                                        isValidSpecificTotal ? 'text-green-600' : 'text-red-600'
                                      }`}
                                    >
                                      Totale: {formatPercentage(specificAssetTotal)}
                                      {!isValidSpecificTotal && ' (deve essere 100%)'}
                                    </div>
                                  )}
                                </div>

                                {target.specificAssetsEnabled && (
                                  <div className="space-y-2">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="w-full justify-start text-xs"
                                      onClick={() => toggleSubCategoryExpanded(assetClass, originalIndex)}
                                    >
                                      {target.expanded ? (
                                        <ChevronUp className="mr-2 h-3 w-3" />
                                      ) : (
                                        <ChevronDown className="mr-2 h-3 w-3" />
                                      )}
                                      {target.expanded ? 'Nascondi' : 'Mostra'} specific assets
                                      {target.specificAssets && target.specificAssets.length > 0 && (
                                        <span className="ml-2 text-gray-500">
                                          ({target.specificAssets.length})
                                        </span>
                                      )}
                                    </Button>

                                    {target.expanded && (
                                      <div className="space-y-2 ml-2 sm:ml-4">
                                        {target.specificAssets && target.specificAssets.map((specificAsset, specificIndex) => (
                                          <div key={specificIndex} className="flex items-center gap-2">
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
                                              className="flex-1 text-sm"
                                            />
                                            <Input
                                              type="number"
                                              step="0.01"
                                              min="0"
                                              max="100"
                                              className="w-20 text-sm"
                                              value={specificAsset.targetPercentage}
                                              onChange={(e) =>
                                                handleSpecificAssetChange(
                                                  assetClass,
                                                  originalIndex,
                                                  specificIndex,
                                                  'targetPercentage',
                                                  roundToTwoDecimals(parseFloat(e.target.value) || 0)
                                                )
                                              }
                                            />
                                            <span className="text-xs text-gray-600">%</span>
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              onClick={() =>
                                                handleRemoveSpecificAsset(assetClass, originalIndex, specificIndex)
                                              }
                                            >
                                              <Trash2 className="h-3 w-3 text-red-500" />
                                            </Button>
                                          </div>
                                        ))}
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="w-full text-xs"
                                          onClick={() => handleAddSpecificAsset(assetClass, originalIndex)}
                                        >
                                          <Plus className="mr-2 h-3 w-3" />
                                          Aggiungi Specific Asset
                                        </Button>
                                      </div>
                                    )}
                                  </div>
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
                    onClick={() => handleAddSubTarget(assetClass)}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Aggiungi Sotto-Categoria
                  </Button>

                  <p className="text-sm text-gray-600">
                    Le percentuali delle sotto-categorie sono relative al totale
                    della classe asset {assetClassLabels[assetClass]} (
                    {formatPercentage(state.targetPercentage)})
                  </p>
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}

      <div className="rounded-lg bg-blue-50 p-4">
        <h3 className="font-semibold text-blue-900">Note</h3>
        <ul className="mt-2 space-y-1 text-sm text-blue-800">
          <li>
            • Il totale delle allocazioni delle asset class deve essere
            esattamente 100%
          </li>
          <li>
            • La liquidità può essere impostata come valore fisso in euro. In questo caso,
            le percentuali delle altre asset class si applicheranno al patrimonio rimanente
            (totale - liquidità fissa)
          </li>
          <li>
            • Per ogni asset class con sotto-categorie abilitate, il totale
            delle sotto-categorie deve essere esattamente 100%
          </li>
          <li>
            • Le sotto-categorie sono espresse come percentuale della loro asset
            class di appartenenza
          </li>
          <li>
            • Usa il toggle &quot;Abilita&quot; per attivare/disattivare le sotto-categorie
            per ciascuna asset class
          </li>
          <li>
            • I cambiamenti saranno applicati immediatamente alla pagina
            Allocazione
          </li>
        </ul>
      </div>

      {/* Expense Categories Management Section */}
      <Card className="mt-4 sm:mt-8">
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
                    <h3 className="font-semibold text-sm text-gray-700 border-b pb-2">
                      {EXPENSE_TYPE_LABELS[type]}
                    </h3>
                    {categories.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic pl-4">
                        Nessuna categoria creata
                      </p>
                    ) : (
                      <div className="grid gap-2">
                        {categories.map((category) => (
                          <div
                            key={category.id}
                            className="flex items-center justify-between p-3 bg-muted rounded-md hover:bg-muted/80 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className="w-3 h-3 rounded-full border border-gray-300"
                                style={{ backgroundColor: category.color || '#3b82f6' }}
                              />
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
                                onClick={() => handleMoveExpenseCategory(category.id, category.name)}
                                title="Sposta tutte le transazioni"
                              >
                                <ArrowRightLeft className="h-4 w-4 text-blue-500" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteExpenseCategory(category.id, category.name)}
                              >
                                <Trash2 className="h-4 w-4 text-red-500" />
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

      {/* Dividend Settings Section */}
      <Card className="mt-4 sm:mt-8">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-green-600" />
            <CardTitle>Impostazioni Dividendi</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 space-y-4 sm:space-y-6">
          <p className="text-sm text-muted-foreground">
            Configura la categoria per le entrate automatiche da dividendi
          </p>

          <div className="grid gap-4 md:grid-cols-2">
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
                  <SelectTrigger id="dividendIncomeCategory">
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
                  <SelectTrigger id="dividendIncomeSubCategory">
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
              disabled={saving}
              className="flex items-center gap-2"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Salvataggio...' : 'Salva Impostazioni'}
            </Button>

            <Button
              onClick={handleSyncDividends}
              disabled={syncingDividends || !dividendIncomeCategoryId}
              variant="outline"
              className="flex items-center gap-2"
            >
              <Coins className="h-4 w-4" />
              {syncingDividends ? 'Sincronizzazione...' : 'Sincronizza Dividendi Esistenti'}
            </Button>
          </div>

          {!dividendIncomeCategoryId && (
            <p className="text-sm text-amber-600">
              ⚠️ Configura una categoria per abilitare la sincronizzazione automatica dei dividendi
            </p>
          )}
        </CardContent>
      </Card>

      {/* Development Features Section */}
      {enableTestSnapshots && (
        <Card className="mt-4 sm:mt-8 border-orange-200 bg-orange-50">
          <CardHeader>
            <div className="flex items-center gap-2">
              <FlaskConical className="h-5 w-5 text-orange-600" />
              <CardTitle className="text-orange-900">Funzionalità di Sviluppo</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 space-y-4">
            <div className="rounded-lg bg-orange-100 border border-orange-300 p-4">
              <p className="text-sm text-orange-900 font-semibold">⚠️ Attenzione</p>
              <p className="text-sm text-orange-800 mt-1">
                Questa sezione è visibile solo quando la variabile d&apos;ambiente{' '}
                <code className="bg-orange-200 px-1 rounded">NEXT_PUBLIC_ENABLE_TEST_SNAPSHOTS</code>{' '}
                è impostata su <code className="bg-orange-200 px-1 rounded">true</code>.
              </p>
            </div>

            <div className="space-y-3">
              <h3 className="font-semibold text-sm text-gray-900">
                Generazione Snapshot di Test
              </h3>
              <p className="text-sm text-gray-700">
                Genera snapshot mensili fittizi per testare grafici e statistiche.
                Gli snapshot verranno salvati nella stessa collection Firebase degli snapshot reali.
              </p>
              <Button
                variant="outline"
                onClick={() => setDummySnapshotModalOpen(true)}
                className="border-orange-300 hover:bg-orange-100"
              >
                <FlaskConical className="mr-2 h-4 w-4" />
                Genera Snapshot di Test
              </Button>
            </div>

            <div className="space-y-3 border-t border-orange-200 pt-4">
              <h3 className="font-semibold text-sm text-gray-900">
                Eliminazione Dati di Test
              </h3>
              <p className="text-sm text-gray-700">
                Elimina tutti i dati dummy (snapshot, spese e categorie) in un&apos;unica operazione.
                Questa azione è irreversibile.
              </p>
              <Button
                variant="destructive"
                onClick={() => setDeleteDummyDataDialogOpen(true)}
                className="bg-red-600 hover:bg-red-700"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Elimina Tutti i Dati Dummy
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

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
          }}
          onConfirm={handleConfirmDeleteWithReassignment}
          categoryToDelete={categoryToDelete}
          expenseCount={expenseCountToReassign}
          allCategories={expenseCategories}
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
          }}
          onConfirm={handleConfirmMoveCategory}
          sourceCategory={categoryToMove}
          expenseCount={expenseCountToMove}
          allCategories={expenseCategories}
        />
      )}

      {/* Dummy Snapshot Modal */}
      {enableTestSnapshots && (
        <CreateDummySnapshotModal
          open={dummySnapshotModalOpen}
          onOpenChange={setDummySnapshotModalOpen}
          userId={user?.uid || ''}
        />
      )}

      {/* Delete Dummy Data Dialog */}
      {enableTestSnapshots && (
        <DeleteDummyDataDialog
          open={deleteDummyDataDialogOpen}
          onOpenChange={setDeleteDummyDataDialogOpen}
          userId={user?.uid || ''}
          onDeleted={() => {
            // Refresh page or data after deletion
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}
