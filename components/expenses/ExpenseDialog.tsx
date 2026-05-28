'use client';

/**
 * ExpenseDialog Component
 *
 * 2-step progressive disclosure dialog for creating and editing expenses.
 *
 * Create flow:
 *   Step 1 — Visual type picker: 4 cards (Spesa Variabile, Spesa Fissa,
 *             Debito/Rata, Entrata). Selecting a card advances to step 2.
 *   Step 2 — Smart form: only fields relevant to the chosen type are shown.
 *             "← Cambia tipo" ghost button returns to step 1.
 *
 * Edit flow:
 *   Lands directly on step 2. Type is shown as a locked Badge (not a Select)
 *   to communicate clearly that it cannot be changed.
 *
 * Design mirrors the AssetDialog category-first redesign (session asset-dialog-redesign).
 * Framer Motion AnimatePresence handles step transitions.
 * All original form logic, Zod schema, and submission paths are preserved unchanged.
 *
 * @param open    - Controls dialog visibility
 * @param onClose - Callback when dialog closes
 * @param expense - Expense to edit (undefined = new expense)
 * @param onSuccess - Optional callback after successful save
 */

import React, { useEffect, useState } from 'react';
import { useForm, Controller, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { useReducedMotion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import {
  Expense,
  ExpenseFormData,
  ExpenseType,
  EXPENSE_TYPE_LABELS,
  ExpenseCategory,
} from '@/types/expenses';
import { CostCenter } from '@/types/costCenters';
import { getCostCenters } from '@/lib/services/costCenterService';
import { Asset } from '@/types/assets';
import { createExpense, updateExpense } from '@/lib/services/expenseService';
import { getAllAssets, updateCashAssetBalance } from '@/lib/services/assetService';
import {
  createInvestmentOperation,
  deleteInvestmentOperation,
} from '@/lib/services/investmentOperationService';
import { getSettings } from '@/lib/services/assetAllocationService';
import { useHouseholdConfig } from '@/lib/hooks/useHousehold';
import { getAssignableOwnershipProfiles, getDefaultProfile, isHouseholdEnabled, profileToAssignment } from '@/lib/utils/householdUtils';
import { DEFAULT_PROFILE_SELF_ID } from '@/types/household';
import { getAllCategories, addSubCategory } from '@/lib/services/expenseCategoryService';
import { queryKeys } from '@/lib/query/queryKeys';
import { Timestamp } from 'firebase/firestore';
import { CategoryManagementDialog } from '@/components/expenses/CategoryManagementDialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SearchableCombobox } from '@/components/ui/searchable-combobox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import {
  ShoppingCart,
  CalendarClock,
  CreditCard,
  ArrowDownToLine,
  ChevronLeft,
  Plus,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils/formatters';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Schema (unchanged from original)
// ---------------------------------------------------------------------------

/**
 * Expense form validation schema.
 *
 * Custom refinement handles installment mode-specific required fields:
 * - Auto mode: needs installmentCount (≥2) + installmentTotalAmount
 * - Manual mode: needs installmentCount (≥2) + installmentAmounts (length === count)
 */
const expenseSchema = z.object({
  type: z.enum(['fixed', 'variable', 'debt', 'income']),
  categoryId: z.string().min(1, 'Categoria è obbligatoria'),
  subCategoryId: z.string().optional(),
  amount: z.number().positive("L'importo deve essere positivo"),
  currency: z.string().min(1, 'Valuta è obbligatoria'),
  date: z.date(),
  notes: z.string().optional(),
  link: z.string().url('Inserisci un URL valido').optional().or(z.literal('')),
  isRecurring: z.boolean().optional(),
  recurringDay: z.number().min(1).max(31).optional(),
  recurringMonths: z.number().min(1).max(120).optional(),
  isInstallment: z.boolean().optional(),
  installmentMode: z.enum(['auto', 'manual']).optional(),
  installmentCount: z.number().min(2).max(60).optional(),
  installmentTotalAmount: z.number().positive().optional(),
  installmentAmounts: z.array(z.number()).optional(),
  installmentStartDate: z.date().optional(),
  linkedCashAssetId: z.string().optional(),
  linkedInvestmentAssetId: z.string().optional(),
  linkedInvestmentAssetName: z.string().optional(),
  investmentOperationType: z.enum(['buy', 'sell']).optional(),
  investmentOperationPricePerUnit: z.number().positive().optional().or(z.nan()),
  investmentOperationFees: z.number().min(0).optional().or(z.nan()),
  investmentOperationTaxes: z.number().min(0).optional().or(z.nan()),
  linkedInvestmentQuantityDelta: z.number().positive('La quantità deve essere positiva').optional().or(z.nan()),
  attributionProfileId: z.string().optional(),
}).refine((data) => {
  if (data.isInstallment) {
    if (!data.installmentCount || data.installmentCount < 2) return false;
    if (data.installmentMode === 'auto' && !data.installmentTotalAmount) return false;
    if (
      data.installmentMode === 'manual' &&
      (!data.installmentAmounts || data.installmentAmounts.length !== data.installmentCount)
    ) return false;
  }
  return true;
}, { message: 'Campi rate incompleti o non validi' });

type ExpenseFormValues = z.infer<typeof expenseSchema>;

// ---------------------------------------------------------------------------
// Type picker data
// ---------------------------------------------------------------------------

interface TypeCard {
  value: ExpenseType;
  icon: React.ElementType;
  label: string;
  description: string;
}

const TYPE_CARDS: TypeCard[] = [
  {
    value: 'variable',
    icon: ShoppingCart,
    label: 'Spesa Variabile',
    description: 'Extra di cui potresti fare a meno',
  },
  {
    value: 'fixed',
    icon: CalendarClock,
    label: 'Spesa Fissa',
    description: 'Quelle di cui non puoi fare a meno',
  },
  {
    value: 'debt',
    icon: CreditCard,
    label: 'Debito / Rata',
    description: 'Mutuo, prestiti, finanziamenti',
  },
  {
    value: 'income',
    icon: ArrowDownToLine,
    label: 'Entrata',
    description: 'Stipendio, rimborsi, dividendi',
  },
];

// ---------------------------------------------------------------------------
// Dynamic dialog title
// ---------------------------------------------------------------------------

const CREATE_TITLES: Record<ExpenseType, string> = {
  variable: 'Nuova Spesa Variabile',
  fixed: 'Nuova Spesa Fissa',
  debt: 'Nuovo Debito',
  income: 'Nuova Entrata',
};

const EDIT_TITLES: Record<ExpenseType, string> = {
  variable: 'Modifica Spesa',
  fixed: 'Modifica Spesa',
  debt: 'Modifica Debito',
  income: 'Modifica Entrata',
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ExpenseDialogProps {
  open: boolean;
  onClose: () => void;
  expense?: Expense | null;
  onSuccess?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ExpenseDialog({ open, onClose, expense, onSuccess }: ExpenseDialogProps) {
  const { user } = useAuth();
  const { data: householdConfig } = useHouseholdConfig(user?.uid);
  const householdEnabled = isHouseholdEnabled(householdConfig);
  const householdProfiles = householdEnabled ? getAssignableOwnershipProfiles(householdConfig) : [];
  const defaultExpenseAttributionProfileId = householdEnabled
    ? householdConfig?.defaultExpenseProfileId || getDefaultProfile(householdConfig)?.id || DEFAULT_PROFILE_SELF_ID
    : DEFAULT_PROFILE_SELF_ID;
  const defaultIncomeAttributionProfileId = householdEnabled
    ? householdConfig?.defaultIncomeProfileId || getDefaultProfile(householdConfig)?.id || DEFAULT_PROFILE_SELF_ID
    : DEFAULT_PROFILE_SELF_ID;
  const queryClient = useQueryClient();
  const prefersReducedMotion = useReducedMotion();

  // Step state: 'picker' (step 1) or 'form' (step 2)
  // Edit mode starts directly on 'form'.
  const [step, setStep] = useState<'picker' | 'form'>(expense ? 'form' : 'picker');

  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [cashAssets, setCashAssets] = useState<Asset[]>([]);
  const [investmentAssets, setInvestmentAssets] = useState<Asset[]>([]);
  const [defaultDebitCashAssetId, setDefaultDebitCashAssetId] = useState<string>('__none__');
  const [defaultCreditCashAssetId, setDefaultCreditCashAssetId] = useState<string>('__none__');
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [costCentersEnabled, setCostCentersEnabledState] = useState(false);
  const [selectedCostCenterId, setSelectedCostCenterId] = useState<string>('__none__');
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [newSubCategoryName, setNewSubCategoryName] = useState('');
  const [addingSubCategory, setAddingSubCategory] = useState(false);
  const [showSubCategoryInput, setShowSubCategoryInput] = useState(false);
  const [hasManualAttribution, setHasManualAttribution] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    getValues,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      type: 'variable',
      currency: 'EUR',
      date: new Date(),
      isRecurring: false,
      recurringMonths: 12,
      isInstallment: false,
      installmentMode: 'auto',
      installmentCount: 2,
      installmentAmounts: [],
      linkedCashAssetId: '__none__',
      linkedInvestmentAssetId: '__none__',
      linkedInvestmentAssetName: undefined,
      investmentOperationType: 'buy',
      investmentOperationPricePerUnit: undefined,
      investmentOperationFees: undefined,
      investmentOperationTaxes: undefined,
      linkedInvestmentQuantityDelta: undefined,
      attributionProfileId: DEFAULT_PROFILE_SELF_ID,
    },
  });

  const selectedType = useWatch({ control, name: 'type' });
  const selectedCategoryId = useWatch({ control, name: 'categoryId' });
  const selectedIsRecurring = useWatch({ control, name: 'isRecurring' });
  const selectedDate = useWatch({ control, name: 'date' });
  const watchedIsInstallment = useWatch({ control, name: 'isInstallment' });
  const watchedInstallmentCount = useWatch({ control, name: 'installmentCount' });
  const watchedInstallmentTotalAmount = useWatch({ control, name: 'installmentTotalAmount' });
  const watchedInstallmentStartDate = useWatch({ control, name: 'installmentStartDate' });
  const watchedInstallmentAmounts = useWatch({ control, name: 'installmentAmounts' });
  const watchedLinkedCashAssetId = useWatch({ control, name: 'linkedCashAssetId' });
  const watchedSubCategoryId = useWatch({ control, name: 'subCategoryId' });
  const linkedInvestmentAssetId = useWatch({ control, name: 'linkedInvestmentAssetId' });
  const linkedInvestmentAssetName = useWatch({ control, name: 'linkedInvestmentAssetName' });
  const linkedInvestmentQuantityDelta = useWatch({ control, name: 'linkedInvestmentQuantityDelta' });
  const investmentOperationType = useWatch({ control, name: 'investmentOperationType' });
  const investmentOperationPricePerUnit = useWatch({ control, name: 'investmentOperationPricePerUnit' });
  const investmentOperationFees = useWatch({ control, name: 'investmentOperationFees' });
  const investmentOperationTaxes = useWatch({ control, name: 'investmentOperationTaxes' });
  const watchedAttributionProfileId = useWatch({ control, name: 'attributionProfileId' });

  const isEdit = !!expense;

  // Reset step when dialog opens/closes
  useEffect(() => {
    if (!open) return;
    setStep(isEdit ? 'form' : 'picker');
  }, [open, isEdit]);

  // Load categories and cash assets when dialog opens
  useEffect(() => {
    if (open && user) {
      loadCategories();
      loadCashAssets();
    }
  }, [open, user]);

  // Reset subcategory when category changes on new expenses
  useEffect(() => {
    if (!expense) {
      setValue('subCategoryId', '');
    }
  }, [selectedCategoryId, expense, setValue]);

  const loadCategories = async () => {
    if (!user) return;
    try {
      setLoadingCategories(true);
      const allCategories = await getAllCategories(user.uid);
      setCategories(allCategories);
    } catch (error) {
      console.error('Error loading categories:', error);
      toast.error('Errore nel caricamento delle categorie');
    } finally {
      setLoadingCategories(false);
    }
  };

  const loadCashAssets = async () => {
    if (!user) return;
    try {
      const [allAssets, settings, centers] = await Promise.all([
        getAllAssets(user.uid),
        getSettings(user.uid),
        getCostCenters(user.uid),
      ]);
      setCashAssets(allAssets.filter(a => a.assetClass === 'cash'));
      setInvestmentAssets(
        allAssets
          .filter(a => a.assetClass !== 'cash')
          .sort((a, b) => a.name.localeCompare(b.name, 'it'))
      );
      const debitId = settings?.defaultDebitCashAssetId || '__none__';
      const creditId = settings?.defaultCreditCashAssetId || '__none__';
      setDefaultDebitCashAssetId(debitId);
      setDefaultCreditCashAssetId(creditId);
      setCostCentersEnabledState(settings?.costCentersEnabled ?? false);
      setCostCenters(centers);

      // Apply default cash account for new expenses on initial open.
      // Handled here because the type-change useEffect below won't fire for the
      // initial 'variable' default (deps unchanged).
      if (!expense) {
        const currentType = getValues('type');
        const defaultId = currentType === 'income' ? creditId : debitId;
        if (defaultId !== '__none__') {
          setValue('linkedCashAssetId', defaultId);
        }
      }
    } catch (error) {
      // Non-blocking: cash assets are optional
      console.error('Error loading cash assets:', error);
    }
  };

  // Populate form when editing an expense, or reset for new expenses
  useEffect(() => {
    if (!open) return;
    if (expense) {
      reset({
        type: expense.type,
        categoryId: expense.categoryId,
        subCategoryId: expense.subCategoryId || '',
        amount: Math.abs(expense.amount),
        currency: expense.currency,
        date: expense.date instanceof Date ? expense.date : (expense.date as Timestamp).toDate(),
        notes: expense.notes || '',
        link: expense.link || '',
        isRecurring: expense.isRecurring || false,
        recurringDay: expense.recurringDay,
        recurringMonths: 1,
        isInstallment: expense.isInstallment || false,
        installmentMode: 'auto',
        installmentCount: expense.installmentTotal || 2,
        installmentTotalAmount: expense.installmentTotalAmount || Math.abs(expense.amount),
        installmentAmounts: [],
        installmentStartDate: expense.date instanceof Date ? expense.date : (expense.date as Timestamp).toDate(),
        linkedCashAssetId: expense.linkedCashAssetId || '__none__',
        linkedInvestmentAssetId: expense.linkedInvestmentAssetId || '__none__',
        investmentOperationType: expense.investmentOperationType || (expense.linkedInvestmentQuantityDelta && expense.linkedInvestmentQuantityDelta < 0 ? 'sell' : 'buy'),
        investmentOperationFees: expense.investmentOperationFees,
        investmentOperationTaxes: expense.investmentOperationTaxes,
        linkedInvestmentQuantityDelta: expense.linkedInvestmentQuantityDelta
          ? Math.abs(expense.linkedInvestmentQuantityDelta)
          : undefined,
        attributionProfileId: householdEnabled
          ? expense.attributionProfileId || (expense.type === 'income' ? defaultIncomeAttributionProfileId : defaultExpenseAttributionProfileId)
          : DEFAULT_PROFILE_SELF_ID,
      });
      setSelectedCostCenterId(expense.costCenterId || '__none__');
      setHasManualAttribution(false);
    } else {
      reset({
        type: 'variable',
        categoryId: '',
        subCategoryId: '',
        amount: 0,
        currency: 'EUR',
        date: new Date(),
        notes: '',
        link: '',
        isRecurring: false,
        recurringDay: new Date().getDate(),
        recurringMonths: 12,
        linkedCashAssetId: '__none__',
        linkedInvestmentAssetId: '__none__',
        investmentOperationType: 'buy',
        investmentOperationFees: undefined,
        investmentOperationTaxes: undefined,
        linkedInvestmentQuantityDelta: undefined,
        attributionProfileId: defaultExpenseAttributionProfileId,
      });
      setSelectedCostCenterId('__none__');
      setHasManualAttribution(false);
    }
  }, [expense, defaultExpenseAttributionProfileId, defaultIncomeAttributionProfileId, householdEnabled, householdConfig, reset, open]);

  // Apply default cash account when type changes (new expense only)
  useEffect(() => {
    if (!expense && open) {
      const defaultId = selectedType === 'income' ? defaultCreditCashAssetId : defaultDebitCashAssetId;
      if (defaultId !== '__none__') {
        setValue('linkedCashAssetId', defaultId);
      }
    }
  }, [defaultDebitCashAssetId, defaultCreditCashAssetId, selectedType, expense, open, setValue]);

  useEffect(() => {
    if (!open || expense || !householdEnabled || hasManualAttribution) return;
    setValue(
      'attributionProfileId',
      selectedType === 'income' ? defaultIncomeAttributionProfileId : defaultExpenseAttributionProfileId
    );
  }, [
    defaultExpenseAttributionProfileId,
    defaultIncomeAttributionProfileId,
    expense,
    hasManualAttribution,
    householdEnabled,
    open,
    selectedType,
    setValue,
  ]);

  // Auto-set recurring day from selected date (new debt expenses only)
  useEffect(() => {
    if (selectedDate && selectedIsRecurring && !expense) {
      setValue('recurringDay', selectedDate.getDate());
    }
  }, [selectedDate, selectedIsRecurring, expense, setValue]);

  const getAvailableCategories = (): ExpenseCategory[] =>
    categories
      .filter(cat => cat.type === selectedType)
      .sort((a, b) => a.name.localeCompare(b.name, 'it'));

  const getSelectedCategory = (): ExpenseCategory | undefined =>
    categories.find(cat => cat.id === selectedCategoryId);

  const getAvailableSubCategories = () =>
    (getSelectedCategory()?.subCategories || []).sort((a, b) => a.name.localeCompare(b.name, 'it'));

  const handleCategoryCreated = async () => {
    await loadCategories();
  };

  const handleAddSubCategory = async () => {
    if (!newSubCategoryName.trim()) {
      toast.error('Il nome della sottocategoria è obbligatorio');
      return;
    }
    if (!selectedCategoryId) {
      toast.error('Seleziona prima una categoria');
      return;
    }
    const category = getSelectedCategory();
    if (!category) return;
    if (category.subCategories.some(sub => sub.name.toLowerCase() === newSubCategoryName.trim().toLowerCase())) {
      toast.error('Questa sottocategoria esiste già');
      return;
    }
    try {
      setAddingSubCategory(true);
      await addSubCategory(selectedCategoryId, newSubCategoryName.trim());
      await loadCategories();
      setNewSubCategoryName('');
      setShowSubCategoryInput(false);
      toast.success('Sottocategoria aggiunta con successo');
    } catch (error) {
      console.error('Error adding subcategory:', error);
      toast.error("Errore nell'aggiunta della sottocategoria");
    } finally {
      setAddingSubCategory(false);
    }
  };

  const onSubmit = async (data: ExpenseFormValues) => {
    if (!user) {
      toast.error('Devi essere autenticato');
      return;
    }

    const selectedCategory = categories.find(cat => cat.id === data.categoryId);
    if (!selectedCategory) {
      toast.error('Categoria non trovata');
      return;
    }

    let subCategoryName: string | undefined;
    if (data.subCategoryId) {
      const subCategory = selectedCategory.subCategories.find(sub => sub.id === data.subCategoryId);
      subCategoryName = subCategory?.name;
    }

    // Resolve sentinel '__none__' to undefined
    const linkedCashAssetId = data.linkedCashAssetId !== '__none__' ? data.linkedCashAssetId : undefined;
    const resolvedCostCenterId = selectedCostCenterId !== '__none__' ? selectedCostCenterId : undefined;
    const resolvedCostCenterName = resolvedCostCenterId
      ? costCenters.find(c => c.id === resolvedCostCenterId)?.name
      : undefined;
    const fallbackAttributionProfileId = data.type === 'income'
      ? defaultIncomeAttributionProfileId
      : defaultExpenseAttributionProfileId;
    const attributionAssignment = profileToAssignment(
      getDefaultProfile(householdConfig, data.attributionProfileId || fallbackAttributionProfileId),
      data.date
    );

    try {
      const expenseData: ExpenseFormData = {
        type: data.type,
        categoryId: data.categoryId,
        subCategoryId: data.subCategoryId,
        amount: data.amount,
        currency: data.currency,
        date: data.date,
        notes: data.notes,
        link: data.link,
        isRecurring: data.type === 'debt' ? data.isRecurring : false,
        recurringDay: data.isRecurring ? data.recurringDay : undefined,
        recurringMonths: data.isRecurring ? data.recurringMonths : undefined,
        isInstallment: data.isInstallment,
        installmentMode: data.isInstallment ? data.installmentMode : undefined,
        installmentCount: data.isInstallment ? data.installmentCount : undefined,
        installmentTotalAmount: data.isInstallment && data.installmentMode === 'auto'
          ? data.installmentTotalAmount
          : undefined,
        installmentAmounts: data.isInstallment && data.installmentMode === 'manual'
          ? data.installmentAmounts
          : undefined,
        installmentStartDate: data.isInstallment ? data.installmentStartDate : undefined,
        linkedCashAssetId,
        costCenterId: resolvedCostCenterId,
        costCenterName: resolvedCostCenterName,

        // Household attribution assignment
        attributionProfileId: attributionAssignment.profileId,
        attributionProfileName: attributionAssignment.profileName,
        attributionSplits: attributionAssignment.splits,
      };

      if (expense) {
        // Edit: pass null explicitly to clear linked fields when deselected.
        // null persists to Firestore (removes the field); undefined would be stripped
        // by removeUndefinedFields before the write.
        const updatesWithLink: Record<string, unknown> = {
          ...expenseData,
          linkedCashAssetId: linkedCashAssetId ?? null,
          linkedInvestmentAssetId: linkedInvestmentAssetId ?? null,
          linkedInvestmentAssetName: linkedInvestmentAssetName ?? null,
          linkedInvestmentQuantityDelta: linkedInvestmentQuantityDelta ?? null,
          investmentOperationId: null,
          investmentOperationType: linkedInvestmentAssetId ? investmentOperationType : null,
          investmentOperationPricePerUnit: investmentOperationPricePerUnit ?? null,
          investmentOperationFees: investmentOperationFees ?? null,
          investmentOperationTaxes: investmentOperationTaxes ?? null,
          costCenterId: resolvedCostCenterId ?? null,
          costCenterName: resolvedCostCenterName ?? null,
          attributionProfileId: attributionAssignment.profileId,
          attributionProfileName: attributionAssignment.profileName,
          attributionSplits: attributionAssignment.splits,
        };

        let newInvestmentOperationId: string | undefined;
        if (
          linkedInvestmentAssetId &&
          linkedInvestmentQuantityDelta &&
          investmentOperationPricePerUnit &&
          Math.abs(linkedInvestmentQuantityDelta) > 0
        ) {
          if (expense.investmentOperationId) {
            await deleteInvestmentOperation(expense.investmentOperationId);
          }
          newInvestmentOperationId = await createInvestmentOperation(user.uid, {
            assetId: linkedInvestmentAssetId,
            type: investmentOperationType ?? 'buy',
            date: data.date,
            quantity: Math.abs(linkedInvestmentQuantityDelta),
            pricePerUnit: investmentOperationPricePerUnit,
            fees: investmentOperationFees,
            taxes: investmentOperationTaxes,
            currency: data.currency,
            cashAssetId: linkedCashAssetId,
            linkedExpenseId: expense.id,
            notes: data.notes,
          });
          updatesWithLink.investmentOperationId = newInvestmentOperationId;
        } else if (expense.investmentOperationId) {
          await deleteInvestmentOperation(expense.investmentOperationId);
        }

        await updateExpense(
          expense.id,
          updatesWithLink as unknown as ExpenseFormData,
          selectedCategory.name,
          subCategoryName
        );
        toast.success('Spesa aggiornata con successo');

        // Update linked cash asset balances to reflect the edit
        const oldLinkedAssetId = expense.linkedCashAssetId;
        const newLinkedAssetId = linkedCashAssetId;
        const oldSignedAmount = expense.amount;
        const newSignedAmount = data.type !== 'income' ? -Math.abs(data.amount) : Math.abs(data.amount);

        let assetUpdated = false;
        if (oldLinkedAssetId && newLinkedAssetId && oldLinkedAssetId === newLinkedAssetId) {
          const delta = newSignedAmount - oldSignedAmount;
          if (Math.abs(delta) > 0.001) {
            await updateCashAssetBalance(oldLinkedAssetId, delta);
            assetUpdated = true;
          }
        } else {
          if (oldLinkedAssetId) {
            await updateCashAssetBalance(oldLinkedAssetId, -oldSignedAmount);
            assetUpdated = true;
          }
          if (newLinkedAssetId) {
            await updateCashAssetBalance(newLinkedAssetId, newSignedAmount);
            assetUpdated = true;
          }
        }

        if (assetUpdated) {
          queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(user.uid) });
        }
      } else {
        const result = await createExpense(
          user.uid,
          expenseData,
          selectedCategory.name,
          subCategoryName
        );

        if (Array.isArray(result)) {
          if (expenseData.isInstallment) {
            const total = expenseData.installmentMode === 'auto'
              ? expenseData.installmentTotalAmount
              : expenseData.installmentAmounts?.reduce((sum, amt) => sum + amt, 0);
            toast.success(`${result.length} rate create con successo (Totale: ${formatCurrency(total || 0)})`);
          } else {
            toast.success(`${result.length} voci ricorrenti create con successo`);
          }
        } else {
          toast.success('Spesa creata con successo');
        }

        // Update linked cash asset balance for the first (immediate) payment.
        // Recurring and installment series store linkedCashAssetId only on the first entry.
        if (linkedCashAssetId) {
          let firstSignedAmount: number;

          if (expenseData.isInstallment && expenseData.installmentCount && expenseData.installmentCount > 1) {
            let firstAmt: number;
            if (expenseData.installmentMode === 'auto') {
              // Mirrors the floor-split logic in createInstallmentExpenses
              firstAmt = Math.floor((expenseData.installmentTotalAmount! / expenseData.installmentCount) * 100) / 100;
            } else {
              firstAmt = expenseData.installmentAmounts![0];
            }
            firstSignedAmount = data.type !== 'income' ? -Math.abs(firstAmt) : Math.abs(firstAmt);
          } else if (expenseData.isRecurring && expenseData.recurringMonths && expenseData.recurringMonths > 0) {
            firstSignedAmount = -Math.abs(data.amount);
          } else {
            firstSignedAmount = data.type !== 'income' ? -Math.abs(data.amount) : Math.abs(data.amount);
          }

          await updateCashAssetBalance(linkedCashAssetId, firstSignedAmount);
          queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(user.uid) });
        }

        if (
          linkedInvestmentAssetId &&
          linkedInvestmentQuantityDelta &&
          investmentOperationPricePerUnit
        ) {
          const firstExpenseId = Array.isArray(result) ? result[0] : result;
          const investmentOperationId = await createInvestmentOperation(user.uid, {
            assetId: linkedInvestmentAssetId,
            type: investmentOperationType ?? 'buy',
            date: data.date,
            quantity: Math.abs(linkedInvestmentQuantityDelta),
            pricePerUnit: investmentOperationPricePerUnit,
            fees: investmentOperationFees,
            taxes: investmentOperationTaxes,
            currency: data.currency,
            cashAssetId: linkedCashAssetId,
            linkedExpenseId: firstExpenseId,
            notes: data.notes,
          });
          await updateExpense(firstExpenseId, {
            investmentOperationId,
            investmentOperationType,
            investmentOperationPricePerUnit,
            investmentOperationFees,
            investmentOperationTaxes,
          } as ExpenseFormData);
          queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(user.uid) });
          queryClient.invalidateQueries({ queryKey: queryKeys.assets.operations(user.uid) });
          queryClient.invalidateQueries({ queryKey: queryKeys.assets.realized(user.uid) });
        }
      }

      onSuccess?.();
      onClose();
    } catch (error) {
      console.error('Error saving expense:', error);
      toast.error('Errore nel salvataggio della spesa');
    }
  };

  // ---------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------

  const availableCategories = getAvailableCategories();
  const availableSubCategories = getAvailableSubCategories();

  const dialogTitle = isEdit
    ? EDIT_TITLES[expense.type]
    : step === 'picker'
    ? 'Nuova Voce'
    : CREATE_TITLES[selectedType];

  // ---------------------------------------------------------------------------
  // Motion variants
  // ---------------------------------------------------------------------------

  const duration = prefersReducedMotion ? 0 : 0.22;

  // Picker exits to the left, form enters from the right
  const pickerVariants = {
    enter: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: prefersReducedMotion ? 0 : -24 },
  };
  const formVariants = {
    initial: { opacity: 0, x: prefersReducedMotion ? 0 : 24 },
    enter: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: prefersReducedMotion ? 0 : 24 },
  };

  // ---------------------------------------------------------------------------
  // Installment preview
  // ---------------------------------------------------------------------------

  /**
   * Preview how a total is split across installments.
   *
   * Splitting algorithm: floor each installment to 2 decimal places, add the
   * remainder (total - baseAmount * count) to the last installment so the sum
   * is exact. Italian microcopy.
   */
  const InstallmentPreview = ({ total, count }: { total: number; count: number }) => {
    const base = Math.floor((total / count) * 100) / 100;
    const remainder = total - base * count;
    const last = base + remainder;

    if (Math.abs(remainder) < 0.01) {
      return (
        <p className="text-sm text-foreground/80">
          {count} rate da {formatCurrency(base)}
        </p>
      );
    }
    return (
      <p className="text-sm text-foreground/80">
        {count - 1} rate da {formatCurrency(base)} + 1 rata da {formatCurrency(last)}
      </p>
    );
  };

  const calculateInstallmentDate = (startDate: Date, monthOffset: number): Date => {
    const date = new Date(startDate);
    date.setMonth(date.getMonth() + monthOffset);
    return date;
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 overflow-hidden" aria-describedby={undefined}>

        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <div className="flex items-center gap-3">
            {/* Back button: visible only in step 2 during create mode */}
            {!isEdit && step === 'form' && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setStep('picker')}
                className="h-8 px-2 text-muted-foreground hover:text-foreground -ml-1"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Cambia tipo
              </Button>
            )}
            <DialogTitle className="text-base font-semibold leading-none">
              {dialogTitle}
            </DialogTitle>
            {/* Locked type badge in edit mode */}
            {isEdit && (
              <Badge variant="outline" className="ml-auto text-xs font-normal">
                {EXPENSE_TYPE_LABELS[expense.type]}
              </Badge>
            )}
          </div>
        </DialogHeader>

        {/* Scrollable body — flex-1 + overflow-y-auto gives natural scroll without absolute tricks */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <AnimatePresence mode="wait" initial={false}>

            {/* ================================================================
                STEP 1 — Type picker
            ================================================================ */}
            {step === 'picker' && (
              <motion.div
                key="picker"
                initial={{ opacity: 0 }}
                animate={pickerVariants.enter}
                exit={pickerVariants.exit}
                transition={{ duration, ease: [0.25, 1, 0.5, 1] }}
                className="px-6 py-6"
              >
                <p className="text-sm text-muted-foreground mb-5">
                  Che tipo di voce vuoi registrare?
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {TYPE_CARDS.map((card) => {
                    const Icon = card.icon;
                    return (
                      <button
                        key={card.value}
                        type="button"
                        onClick={() => {
                          setValue('type', card.value);
                          setValue('categoryId', '');
                          setValue('subCategoryId', '');
                          setStep('form');
                        }}
                        className={cn(
                          'flex flex-col items-start gap-2 rounded-xl border p-4 text-left',
                          'transition-colors duration-150',
                          'hover:bg-muted/60 hover:border-border/80',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                        )}
                      >
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                          <Icon className="h-5 w-5 text-foreground/80" />
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-sm font-medium leading-tight">{card.label}</p>
                          <p className="text-xs text-muted-foreground leading-snug">{card.description}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* ================================================================
                STEP 2 — Smart form
            ================================================================ */}
            {step === 'form' && (
              <motion.div
                key="form"
                initial={formVariants.initial}
                animate={formVariants.enter}
                exit={formVariants.exit}
                transition={{ duration, ease: [0.25, 1, 0.5, 1] }}
                className="px-6 py-4"
              >
                {/* form id ties the submit button in the footer (rendered outside this scroll area) */}
                <form id="expense-form" onSubmit={handleSubmit(onSubmit)} className="space-y-5">

                    {/* ---- Categoria ---- */}
                    <div className="space-y-2">
                      <Label htmlFor="categoryId">Categoria *</Label>
                      {loadingCategories ? (
                        <div className="h-9 rounded-md bg-muted animate-pulse" />
                      ) : (
                        <>
                          <div className="flex items-center gap-2">
                            <div className="flex-1">
                              <SearchableCombobox
                                id="categoryId"
                                options={availableCategories.map((cat) => ({
                                  value: cat.id,
                                  label: cat.name,
                                  color: cat.color || '#3b82f6',
                                }))}
                                value={selectedCategoryId || ''}
                                onValueChange={(value) => {
                                  setValue('categoryId', value);
                                  setValue('subCategoryId', '');
                                  setShowSubCategoryInput(false);
                                }}
                                placeholder="Seleziona categoria"
                                searchPlaceholder="Cerca categoria..."
                                emptyMessage="Nessuna categoria disponibile"
                                showBadge={false}
                              />
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() => setCategoryDialogOpen(true)}
                              title="Crea nuova categoria"
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                          {errors.categoryId && (
                            <p className="text-sm text-destructive">{errors.categoryId.message}</p>
                          )}
                        </>
                      )}
                    </div>

                    {/* ---- Sottocategoria ---- */}
                    {selectedCategoryId && (
                      <div className="space-y-2">
                        <Label htmlFor="subCategoryId">Sottocategoria (opzionale)</Label>
                        {availableSubCategories.length > 0 && (
                          <div className="flex items-center gap-2">
                            <div className="flex-1">
                              <SearchableCombobox
                                id="subCategoryId"
                                options={availableSubCategories.map((sub) => ({
                                  value: sub.id,
                                  label: sub.name,
                                }))}
                                value={watchedSubCategoryId || ''}
                                onValueChange={(value) => setValue('subCategoryId', value || undefined)}
                                placeholder="Seleziona sottocategoria"
                                searchPlaceholder="Cerca sottocategoria..."
                                emptyMessage="Nessuna sottocategoria disponibile"
                                showBadge={false}
                              />
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() => setShowSubCategoryInput(true)}
                              title="Aggiungi nuova sottocategoria"
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                        )}

                        {/* Inline new subcategory input */}
                        {(showSubCategoryInput || availableSubCategories.length === 0) && (
                          <div className="space-y-2 p-3 bg-muted/50 rounded-lg border border-border/50">
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                              Nuova sottocategoria
                            </p>
                            <div className="flex items-center gap-2">
                              <Input
                                placeholder="Nome sottocategoria"
                                value={newSubCategoryName}
                                onChange={(e) => setNewSubCategoryName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleAddSubCategory();
                                  }
                                }}
                                disabled={addingSubCategory}
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                onClick={handleAddSubCategory}
                                disabled={addingSubCategory}
                                title="Aggiungi"
                              >
                                <Plus className="h-4 w-4" />
                              </Button>
                              {availableSubCategories.length > 0 && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setShowSubCategoryInput(false);
                                    setNewSubCategoryName('');
                                  }}
                                  disabled={addingSubCategory}
                                >
                                  Annulla
                                </Button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* ---- Importo + Data (griglia 2 colonne) ---- */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="amount">
                          Importo (€) *
                        </Label>
                        <Input
                          id="amount"
                          type="number"
                          step="0.01"
                          min="0"
                          {...register('amount', { valueAsNumber: true })}
                          className={errors.amount ? 'border-destructive' : ''}
                        />
                        {selectedType !== 'income' && (
                          <p className="text-xs text-muted-foreground">Salvato come negativo</p>
                        )}
                        {errors.amount && (
                          <p className="text-sm text-destructive">{errors.amount.message}</p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="date">Data *</Label>
                        <Controller
                          control={control}
                          name="date"
                          render={({ field }) => (
                            <Input
                              id="date"
                              type="date"
                              value={field.value ? format(field.value, 'yyyy-MM-dd') : ''}
                              onChange={(e) => {
                                const dateString = e.target.value;
                                if (dateString) {
                                  // Append T00:00:00 to force local-midnight parsing.
                                  // Without it, "2024-01-15" parses as UTC midnight,
                                  // which can shift to the previous day in some timezones.
                                  const date = new Date(dateString + 'T00:00:00');
                                  if (!isNaN(date.getTime())) {
                                    field.onChange(date);
                                  }
                                }
                              }}
                              className={errors.date ? 'border-destructive' : ''}
                            />
                          )}
                        />
                      </div>
                    </div>

                    {/* ---- Note ---- */}
                    <div className="space-y-2">
                      <Label htmlFor="notes">Note / Descrizione</Label>
                      <textarea
                        id="notes"
                        {...register('notes')}
                        placeholder="es. Spesa supermercato Conad"
                        className="w-full min-h-[72px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
                      />
                    </div>

                    {/* ---- Conto collegato ---- */}
                    {cashAssets.length > 0 && (
                      <div className="space-y-2">
                        <Label htmlFor="linkedCashAssetId">
                          {selectedType === 'income' ? 'Conto di Accredito' : 'Conto di Prelievo'}
                          <span className="text-muted-foreground font-normal ml-1">(opzionale)</span>
                        </Label>
                        <Select
                          value={watchedLinkedCashAssetId || '__none__'}
                          onValueChange={(value) => setValue('linkedCashAssetId', value)}
                        >
                          <SelectTrigger id="linkedCashAssetId">
                            <SelectValue placeholder="Nessun conto" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Nessun conto</SelectItem>
                            {cashAssets.map((asset) => (
                              <SelectItem key={asset.id} value={asset.id}>
                                {asset.name} ({asset.currency})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          Il saldo viene aggiornato automaticamente al salvataggio.
                        </p>
                      </div>
                    )}

                    {/* ---- Attribuzione household ---- */}
                    {householdEnabled && householdProfiles.length > 0 && (
                      <div className="space-y-2">
                        <Label htmlFor="attributionProfileId">Proprietà / attribuzione</Label>
                        <Select
                          value={watchedAttributionProfileId || DEFAULT_PROFILE_SELF_ID}
                          onValueChange={(value) => {
                            setHasManualAttribution(true);
                            setValue('attributionProfileId', value);
                          }}
                        >
                          <SelectTrigger id="attributionProfileId">
                            <SelectValue placeholder="Seleziona attribuzione" />
                          </SelectTrigger>
                          <SelectContent>
                            {householdProfiles.map((profile) => (
                              <SelectItem key={profile.id} value={profile.id}>
                                {profile.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          Decide se la voce è in carico a una persona, condivisa 50/50 o ripartita con un altro profilo.
                        </p>
                      </div>
                    )}

                    {/* ---- Centro di costo (feature-gated) ---- */}
                    {costCentersEnabled && costCenters.length > 0 && (
                      <div className="space-y-2">
                        <Label htmlFor="costCenter">Centro di Costo</Label>
                        <Select value={selectedCostCenterId} onValueChange={setSelectedCostCenterId}>
                          <SelectTrigger id="costCenter">
                            <SelectValue placeholder="Nessun centro di costo" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Nessun centro di costo</SelectItem>
                            {costCenters.map(center => (
                              <SelectItem key={center.id} value={center.id}>
                                <span className="flex items-center gap-2">
                                  {center.color && (
                                    <span
                                      className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                                      style={{ backgroundColor: center.color }}
                                    />
                                  )}
                                  {center.name}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {/* ---- Link (opzionale, collassato alla fine) ---- */}
                    <div className="space-y-2">
                      <Label htmlFor="link">
                        Link
                        <span className="text-muted-foreground font-normal ml-1">(opzionale)</span>
                      </Label>
                      <Input
                        id="link"
                        type="url"
                        {...register('link')}
                        placeholder="https://www.amazon.it/ordini/..."
                        className={errors.link ? 'border-destructive' : ''}
                      />
                      {errors.link && (
                        <p className="text-sm text-destructive">{errors.link.message}</p>
                      )}
                    </div>

                    {/* ================================================================
                        SEZIONI AVANZATE — create mode only
                    ================================================================ */}

                    {/* ---- Acquisto rateale (tutti i tipi, solo creazione) ---- */}
                    {!expense && (
                      <div className="space-y-4 rounded-xl border border-border/60 bg-muted/30 p-4">
                        <div className="flex items-center justify-between">
                          <div className="space-y-0.5">
                            <Label htmlFor="isInstallment" className="text-sm font-medium">
                              Acquisto rateale
                            </Label>
                            <p className="text-xs text-muted-foreground">
                              Crea rate mensili con importi personalizzabili
                            </p>
                          </div>
                          <Switch
                            id="isInstallment"
                            checked={watchedIsInstallment || false}
                            onCheckedChange={(checked) => {
                              setValue('isInstallment', checked);
                              if (checked) {
                                // Installments and recurring are mutually exclusive
                                setValue('isRecurring', false);
                                setValue('installmentMode', 'auto');
                                setValue('installmentStartDate', getValues('date'));
                                const currentAmount = getValues('amount');
                                if (currentAmount && currentAmount > 0) {
                                  setValue('installmentTotalAmount', currentAmount);
                                }
                              }
                            }}
                          />
                        </div>

                        {watchedIsInstallment && (
                          <Tabs
                            defaultValue="auto"
                            onValueChange={(mode) => setValue('installmentMode', mode as 'auto' | 'manual')}
                          >
                            <TabsList className="grid w-full grid-cols-2">
                              <TabsTrigger value="auto">Calcolo automatico</TabsTrigger>
                              <TabsTrigger value="manual">Importi personalizzati</TabsTrigger>
                            </TabsList>

                            {/* Tab auto */}
                            <TabsContent value="auto" className="space-y-4 mt-4">
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <Label htmlFor="installmentTotalAmount">Importo totale *</Label>
                                  <Input
                                    id="installmentTotalAmount"
                                    type="number"
                                    step="0.01"
                                    min="0.01"
                                    placeholder="333.41"
                                    {...register('installmentTotalAmount', { valueAsNumber: true })}
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="installmentCount">Numero di rate *</Label>
                                  <Input
                                    id="installmentCount"
                                    type="number"
                                    min="2"
                                    max="60"
                                    placeholder="5"
                                    {...register('installmentCount', { valueAsNumber: true })}
                                  />
                                </div>
                              </div>

                              <div className="space-y-2">
                                <Label htmlFor="installmentStartDate">Prima rata il *</Label>
                                <Controller
                                  control={control}
                                  name="installmentStartDate"
                                  render={({ field }) => (
                                    <Input
                                      id="installmentStartDate"
                                      type="date"
                                      value={field.value ? format(field.value, 'yyyy-MM-dd') : ''}
                                      onChange={(e) => {
                                        const dateString = e.target.value;
                                        if (dateString) {
                                          const date = new Date(dateString + 'T00:00:00');
                                          if (!isNaN(date.getTime())) field.onChange(date);
                                        }
                                      }}
                                    />
                                  )}
                                />
                              </div>

                              {watchedInstallmentTotalAmount && (watchedInstallmentCount ?? 0) > 1 && (
                                <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
                                  <p className="text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
                                    Divisione
                                  </p>
                                  <InstallmentPreview
                                    total={watchedInstallmentTotalAmount || 0}
                                    count={watchedInstallmentCount || 2}
                                  />
                                </div>
                              )}
                            </TabsContent>

                            {/* Tab manuale */}
                            <TabsContent value="manual" className="space-y-4 mt-4">
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <Label htmlFor="installmentCountManual">Numero di rate *</Label>
                                  <Input
                                    id="installmentCountManual"
                                    type="number"
                                    min="2"
                                    max="60"
                                    placeholder="5"
                                    {...register('installmentCount', { valueAsNumber: true })}
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="installmentStartDateManual">Prima rata il *</Label>
                                  <Controller
                                    control={control}
                                    name="installmentStartDate"
                                    render={({ field }) => (
                                      <Input
                                        id="installmentStartDateManual"
                                        type="date"
                                        value={field.value ? format(field.value, 'yyyy-MM-dd') : ''}
                                        onChange={(e) => {
                                          const dateString = e.target.value;
                                          if (dateString) {
                                            const date = new Date(dateString + 'T00:00:00');
                                            if (!isNaN(date.getTime())) field.onChange(date);
                                          }
                                        }}
                                      />
                                    )}
                                  />
                                </div>
                              </div>

                              {(watchedInstallmentCount ?? 0) > 1 && (
                                <>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      const count = getValues('installmentCount') || 2;
                                      const baseAmount = getValues('amount') || 0;
                                      const perInstallment = Number((baseAmount / count).toFixed(2));
                                      setValue('installmentAmounts', Array(count).fill(perInstallment));
                                    }}
                                  >
                                    Genera campi rate
                                  </Button>

                                  {watchedInstallmentAmounts && watchedInstallmentAmounts.length > 0 && (
                                    <div className="space-y-2 max-h-[240px] overflow-y-auto">
                                      {Array.from({ length: watchedInstallmentCount || 0 }).map((_, index) => {
                                        const installmentDate = calculateInstallmentDate(
                                          watchedInstallmentStartDate || new Date(),
                                          index
                                        );
                                        return (
                                          <div key={index} className="flex items-center gap-2">
                                            <Label className="w-36 text-sm shrink-0 text-muted-foreground">
                                              Rata {index + 1} ({format(installmentDate, 'MMM yyyy', { locale: it })}):
                                            </Label>
                                            <Input
                                              type="number"
                                              step="0.01"
                                              placeholder="0.00"
                                              {...register(`installmentAmounts.${index}`, { valueAsNumber: true })}
                                            />
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}

                                  {watchedInstallmentAmounts && watchedInstallmentAmounts.length > 0 && (
                                    <div className="flex justify-end px-1">
                                      <span className="text-sm font-medium font-mono">
                                        Totale: {formatCurrency(
                                          (watchedInstallmentAmounts || []).reduce((sum: number, amt: number) => sum + (amt || 0), 0)
                                        )}
                                      </span>
                                    </div>
                                  )}
                                </>
                              )}
                            </TabsContent>
                          </Tabs>
                        )}
                      </div>
                    )}

                    {/* ---- Ricorrenza mensile (solo tipo Debito, solo creazione) ---- */}
                    {selectedType === 'debt' && !expense && (
                      <div className="space-y-4 rounded-xl border border-border/60 bg-muted/30 p-4">
                        <div className="flex items-center justify-between">
                          <div className="space-y-0.5">
                            <Label htmlFor="isRecurring" className="text-sm font-medium">
                              Ricorrenza mensile
                            </Label>
                            <p className="text-xs text-muted-foreground">
                              Crea questa voce per più mesi consecutivi
                            </p>
                          </div>
                          <Switch
                            id="isRecurring"
                            checked={selectedIsRecurring || false}
                            onCheckedChange={(checked) => {
                              setValue('isRecurring', checked);
                              if (checked) setValue('isInstallment', false);
                            }}
                            disabled={watchedIsInstallment}
                          />
                        </div>

                        {selectedIsRecurring && (
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label htmlFor="recurringMonths">Numero di mesi *</Label>
                              <Input
                                id="recurringMonths"
                                type="number"
                                min="1"
                                max="120"
                                {...register('recurringMonths', { valueAsNumber: true })}
                                className={errors.recurringMonths ? 'border-destructive' : ''}
                              />
                              {errors.recurringMonths && (
                                <p className="text-sm text-destructive">{errors.recurringMonths.message}</p>
                              )}
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="recurringDay">Giorno del mese *</Label>
                              <Input
                                id="recurringDay"
                                type="number"
                                min="1"
                                max="31"
                                {...register('recurringDay', { valueAsNumber: true })}
                                className={errors.recurringDay ? 'border-destructive' : ''}
                              />
                              {errors.recurringDay && (
                                <p className="text-sm text-destructive">{errors.recurringDay.message}</p>
                              )}
                              <p className="text-xs text-muted-foreground">Es: il 10 di ogni mese</p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                </form>
              </motion.div>
            )}

          </AnimatePresence>
        </div>

        {/* Footer — sibling del body scrollabile, sempre ancorato al fondo */}
        {step === 'form' && (
          <div className="px-6 pb-6 pt-4 border-t shrink-0 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Annulla
            </Button>
            <Button type="submit" form="expense-form" disabled={isSubmitting}>
              {isSubmitting
                ? 'Salvataggio...'
                : expense
                ? 'Salva modifiche'
                : 'Crea voce'}
            </Button>
          </div>
        )}

      </DialogContent>

      {/* Category management dialog */}
      <CategoryManagementDialog
        open={categoryDialogOpen}
        onClose={() => setCategoryDialogOpen(false)}
        onSuccess={handleCategoryCreated}
        initialType={selectedType}
      />
    </Dialog>
  );
}
