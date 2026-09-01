'use client';

/**
 * ExpenseDialog / ExpenseDrawer Component
 *
 * Two-step form for creating cashflow entries, single-step for editing them.
 *
 * Step 1 — type picker (create mode only), the same shape as `AssetDialog`'s: the type decides
 * which categories exist, which accounts are asked for and whether the row moves one balance or
 * two, so asking for it first turns a form with five conditional shapes into five plain forms.
 * Edit mode skips it: the type of a saved row is changed from inside the form, where the notice
 * explaining what the change does to the balances lives.
 *
 * Step 2 — the form itself:
 *   - Type: a "Cambia tipo" back link in create mode; the Select in edit mode (all five types are
 *     selectable there — onSubmit reconciles balances from BOTH the old and the new type's shape)
 *   - Primary fields: Importo + Data, Categoria, Sottocategoria, Note, Conto Collegato
 *   - "Impostazioni avanzate" Collapsible: Centro di Costo, Link, Acquisto Rateale, Ricorrenza Mensile
 *
 * Advanced section auto-expands when editing a record with advanced data set.
 * On mobile (<=768 px): vaul Drawer bottom sheet with drag-to-dismiss.
 * On desktop: Dialog modal.
 */

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useForm, Controller, useWatch, type UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import {
  Expense,
  ExpenseFormData,
  ExpenseType,
  EXPENSE_TYPE_LABELS,
  ExpenseCategory,
  RecurrenceFrequency,
} from '@/types/expenses';
import { CostCenter } from '@/types/costCenters';
import { getCostCenters } from '@/lib/services/costCenterService';
import { Skeleton } from '@/components/ui/skeleton';
import { Asset, FamilyMember } from '@/types/assets';
import { createExpense, updateExpense } from '@/lib/services/expenseService';
import { getAllAssets } from '@/lib/services/assetService';
import {
  reconcileTransferEdit,
  reconcileTransferCreate,
  reconcileSingleEdit,
  reconcileSingleCreate,
  reconcileTransferToSingleEdit,
  reconcileSingleToTransferEdit,
} from '@/lib/services/cashBalanceReconciliation';
import { getSettings } from '@/lib/services/assetAllocationService';
import { getAllCategories, ensureTransferCategory } from '@/lib/services/expenseCategoryService';
import { resolveEquivalentCategory } from '@/lib/utils/expenseCategoryMatching';
import { queryKeys } from '@/lib/query/queryKeys';
import { deleteField } from 'firebase/firestore';
import { CategoryManagementDialog } from '@/components/expenses/CategoryManagementDialog';
import { ResponsiveModal } from '@/components/ui/responsive-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SearchableCombobox, type ComboboxOption } from '@/components/ui/searchable-combobox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Switch } from '@/components/ui/switch';
import { SegmentedPill } from '@/components/ui/segmented-pill';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import {
  ChevronDown,
  ChevronLeft,
  ArrowLeftRight,
  CreditCard,
  Receipt,
  ShoppingCart,
  Tag,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { getLazyIcon } from '@/components/expenses/IconPickerPopover';
import { formatCurrency } from '@/lib/utils/formatters';
import {
  buildRecurrenceDates,
  canTypeRecur,
  DEFAULT_RECURRENCE_COUNT,
  DEFAULT_RECURRENCE_FREQUENCY,
  MAX_RECURRENCE_OCCURRENCES,
  RECURRENCE_FREQUENCY_LABELS,
  resolveRecurrenceFrequency,
} from '@/lib/utils/recurrenceDates';
import {
  describeExpenseIntent,
  describeModalStatus,
  describeWriteError,
  EXPENSE_TYPE_PICKER_READING,
  type ModalStatus,
} from '@/lib/utils/dialogNarrative';
import { cn } from '@/lib/utils';


// ---------------------------------------------------------------------------
// Schema (unchanged)
// ---------------------------------------------------------------------------

const expenseSchema = z
  .object({
    type: z.enum(['fixed', 'variable', 'debt', 'income', 'transfer']),
    categoryId: z.string().min(1, "Categoria è obbligatoria"),
    subCategoryId: z.string().optional(),
    // Optional here, required by the superRefine below — an instalment plan states its cost in
    // its own fields («Importo totale»), and this one is neither read nor saved for it.
    amount: z.number().positive("L'importo deve essere positivo").optional(),
    currency: z.string().min(1, "Valuta è obbligatoria"),
    date: z.date(),
    notes: z.string().optional(),
    link: z.string().url({ message: 'Inserisci un URL valido' }).optional().or(z.literal('')),
    isRecurring: z.boolean().optional(),
    recurringFrequency: z.enum(['monthly', 'yearly']).optional(),
    recurringDay: z.number().min(1).max(31).optional(),
    recurringCount: z.number().min(1, 'Inserisci almeno 1').optional(),
    isInstallment: z.boolean().optional(),
    installmentMode: z.enum(['auto', 'manual']).optional(),
    installmentCount: z.number().min(2).max(60).optional(),
    installmentTotalAmount: z.number().positive().optional(),
    installmentAmounts: z.array(z.number()).optional(),
    installmentStartDate: z.date().optional(),
    linkedCashAssetId: z.string().optional(),
    transferCashAssetId: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.isInstallment) {
        if (!data.installmentCount || data.installmentCount < 2) return false;
        if (!data.installmentTotalAmount) return false;
        if (
          data.installmentMode === 'manual' &&
          data.installmentAmounts?.length !== data.installmentCount
        )
          return false;
      }
      return true;
    },
    { message: 'Campi rate incompleti o non validi' }
  )
  .superRefine((data, ctx) => {
    // The cost of the thing is declared ONCE. Without an instalment plan that place is this
    // field; with one it is «Importo totale», and this field is hidden rather than asked for
    // and ignored (it used to be required and then overwritten by the plan).
    if (!data.isInstallment && (data.amount === undefined || Number.isNaN(data.amount))) {
      ctx.addIssue({ code: 'custom', path: ['amount'], message: "L'importo è obbligatorio" });
    }
  })
  .superRefine((data, ctx) => {
    // The ceiling depends on the cadence, so it cannot live on the field's own schema, and
    // the message has to name the cadence's own unit — which is why this is a superRefine
    // and not a second .refine (whose params must be a literal in zod 4).
    // 360 monthly occurrences and 40 yearly ones both stay under the 500-operation limit of
    // the writeBatch that creates the series, and of the one that deletes it.
    if (!data.isRecurring || !data.recurringCount) return;
    const frequency = data.recurringFrequency ?? DEFAULT_RECURRENCE_FREQUENCY;
    const max = MAX_RECURRENCE_OCCURRENCES[frequency];
    if (data.recurringCount > max) {
      ctx.addIssue({
        code: 'custom',
        path: ['recurringCount'],
        message: `Massimo ${max} ${frequency === 'yearly' ? 'anni' : 'mesi'}`,
      });
    }
  });

type ExpenseFormValues = z.infer<typeof expenseSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Sentence case, like every other title in the app: a modal title is a sentence about an act,
// not a headline in a newspaper.
const CREATE_TITLES: Record<ExpenseType, string> = {
  variable: 'Nuova spesa variabile',
  fixed: 'Nuova spesa fissa',
  debt: 'Nuovo debito',
  income: 'Nuova entrata',
  transfer: 'Nuovo trasferimento',
};

const EDIT_TITLES: Record<ExpenseType, string> = {
  variable: 'Modifica spesa',
  fixed: 'Modifica spesa',
  debt: 'Modifica debito',
  income: 'Modifica entrata',
  transfer: 'Modifica trasferimento',
};

/**
 * One entry per `ExpenseType`, shared by the step-1 picker cards and the edit-mode Select.
 * `Icon` is the component, not a rendered node: the two surfaces need different sizes.
 */
interface TypeOption {
  value: ExpenseType;
  label: string;
  description: string;
  Icon: LucideIcon;
}

const TYPE_OPTIONS: TypeOption[] = [
  { value: 'variable', label: 'Spesa variabile', description: 'Ristorante, shopping, svago, imprevisti', Icon: ShoppingCart },
  { value: 'fixed', label: 'Spesa fissa', description: 'Affitto, abbonamenti, bollette, utenze', Icon: Receipt },
  { value: 'debt', label: 'Debito / rata', description: 'Mutuo, prestito, finanziamento ricorrente', Icon: CreditCard },
  { value: 'income', label: 'Entrata', description: 'Stipendio, bonus, dividendi, rimborsi', Icon: TrendingUp },
  { value: 'transfer', label: 'Trasferimento', description: 'Sposta denaro tra conti', Icon: ArrowLeftRight },
];

/**
 * Options of the cadence pill. Module-level: SegmentedPill animates its indicator with a
 * Framer `layoutId`, and a new array identity on every render is exactly what makes such an
 * indicator flicker on unrelated state changes.
 */
const RECURRENCE_FREQUENCY_OPTIONS = [
  { value: 'monthly' as const, label: RECURRENCE_FREQUENCY_LABELS.monthly },
  { value: 'yearly' as const, label: RECURRENCE_FREQUENCY_LABELS.yearly },
];

function isAdvancedPrePopulated(expense: Expense | null | undefined): boolean {
  if (!expense) return false;
  return !!(expense.costCenterId || expense.link || expense.isInstallment || expense.isRecurring);
}

// ---------------------------------------------------------------------------
// InstallmentPreview — module-level component (never defined inside render)
// ---------------------------------------------------------------------------

interface InstallmentPreviewProps {
  total: number;
  count: number;
}

function InstallmentPreview({ total, count }: Readonly<InstallmentPreviewProps>) {
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
}

function calculateInstallmentDate(startDate: Date, monthOffset: number): Date {
  const date = new Date(startDate);
  date.setMonth(date.getMonth() + monthOffset);
  return date;
}

// ---------------------------------------------------------------------------
// ExpenseTypePicker — step 1 of the create flow
// ---------------------------------------------------------------------------

interface ExpenseTypePickerProps {
  /** The form's current type, so the picker can be re-opened on the choice already made. */
  selectedType: ExpenseType;
  onSelect: (type: ExpenseType) => void;
}

/**
 * Card picker over the five expense types.
 *
 * `role="radiogroup"` / `role="radio"` exposes the mutually exclusive choice to screen readers;
 * `aria-checked` reflects the form default (variable) until the user picks, exactly as
 * `AssetDialog`'s picker does. One column on a phone, two from `sm:` up — five cards means the
 * last one spans both columns rather than leaving a hole in the grid.
 */
function ExpenseTypePicker({ selectedType, onSelect }: Readonly<ExpenseTypePickerProps>) {
  return (
    // No introductory paragraph: the modal's reading line already says what the type decides,
    // and a second copy of it a row below is the same job done twice.
    <div>
      <div
        role="radiogroup"
        aria-label="Tipo di voce"
        className="grid grid-cols-1 sm:grid-cols-2 gap-3"
      >
        {TYPE_OPTIONS.map(({ value, label, description, Icon }, index) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selectedType === value}
            onClick={() => onSelect(value)}
            className={cn(
              'flex items-start gap-3 rounded-lg border border-border bg-card p-4 text-left',
              'transition-colors duration-150 ease-out hover:bg-muted/50 hover:border-primary/30',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              index === TYPE_OPTIONS.length - 1 &&
                TYPE_OPTIONS.length % 2 !== 0 &&
                'sm:col-span-2'
            )}
          >
            <Icon className="h-5 w-5 mt-0.5 text-muted-foreground shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{label}</p>
              <p className="text-xs text-muted-foreground leading-snug mt-0.5">{description}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

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
// FormBodyProps — shared between Dialog and Drawer renders
// ---------------------------------------------------------------------------

interface FormBodyProps {
  form: UseFormReturn<ExpenseFormValues>;
  onSubmit: (data: ExpenseFormValues) => Promise<void>;
  isEdit: boolean;
  selectedType: ExpenseType;
  selectedCategoryId: string | undefined;
  watchedSubCategoryId: string | undefined;
  watchedLinkedCashAssetId: string | undefined;
  watchedTransferCashAssetId: string | undefined;
  watchedIsInstallment: boolean | undefined;
  watchedInstallmentCount: number | undefined;
  watchedInstallmentTotalAmount: number | undefined;
  watchedInstallmentStartDate: Date | undefined;
  watchedInstallmentAmounts: number[] | undefined;
  selectedIsRecurring: boolean | undefined;
  selectedRecurringFrequency: RecurrenceFrequency | undefined;
  /** One sentence naming how many rows the series will create and over which span, or null. */
  recurrencePreview: string | null;
  expense: Expense | null | undefined;
  loadingCategories: boolean;
  cashAssets: Asset[];
  costCenters: CostCenter[];
  costCentersEnabled: boolean;
  selectedCostCenterId: string;
  setSelectedCostCenterId: (id: string) => void;
  /** Cashflow › Divisione is on AND the household has someone to attribute a row to. */
  splitEnabled: boolean;
  familyMembers: FamilyMember[];
  /** '' means «in comune» — the default, and what every row written before this feature is. */
  personalMemberId: string;
  setPersonalMemberId: (id: string) => void;
  availableCategories: ComboboxOption[];
  availableSubCategories: ComboboxOption[];
  onCreateCategory: (name: string) => void;
  onCreateSubCategory: (name: string) => void;
  /** Re-points the category selection when the type changes. */
  onTypeChange: (type: ExpenseType) => void;
  /**
   * Returns to the step-1 type picker. Present in create mode ONLY — its absence is what tells
   * the body to render the type `Select` instead, so the two are never on screen together.
   */
  onBackToTypePicker?: () => void;
  /** What changing the type will do to this row, or null when it has not changed. */
  typeChangeNotice: string | null;
  advancedOpen: boolean;
  setAdvancedOpen: (v: boolean) => void;
}

// ---------------------------------------------------------------------------
// ExpenseFormBody — shared form body, module-level to prevent remounts
// ---------------------------------------------------------------------------

function ExpenseFormBody({
  form,
  onSubmit,
  isEdit,
  selectedType,
  selectedCategoryId,
  watchedSubCategoryId,
  watchedLinkedCashAssetId,
  watchedTransferCashAssetId,
  watchedIsInstallment,
  watchedInstallmentCount,
  watchedInstallmentTotalAmount,
  watchedInstallmentStartDate,
  watchedInstallmentAmounts,
  selectedIsRecurring,
  selectedRecurringFrequency,
  recurrencePreview,
  expense,
  loadingCategories,
  cashAssets,
  costCenters,
  costCentersEnabled,
  selectedCostCenterId,
  setSelectedCostCenterId,
  splitEnabled,
  familyMembers,
  personalMemberId,
  setPersonalMemberId,
  availableCategories,
  availableSubCategories,
  onCreateCategory,
  onCreateSubCategory,
  onTypeChange,
  onBackToTypePicker,
  typeChangeNotice,
  advancedOpen,
  setAdvancedOpen,
}: Readonly<FormBodyProps>) {
  const { register, control, handleSubmit, setValue, getValues, formState: { errors } } = form;
  const recurringFrequency = selectedRecurringFrequency ?? DEFAULT_RECURRENCE_FREQUENCY;
  return (
    <form id="expense-form" onSubmit={handleSubmit(onSubmit)} className="space-y-5">

      {/* ---- Tipo di voce ----
           Create mode reached this form through the step-1 picker, so the type is already
           settled and the control here would be a second way to do the same thing: a back
           link to the picker instead. Edit mode keeps the Select — it is the only place a
           saved row can change type, and `typeChangeNotice` below explains the consequences. */}
      {onBackToTypePicker ? (
        <button
          type="button"
          onClick={onBackToTypePicker}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors duration-150"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          Cambia tipo
        </button>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="type">Tipo di voce</Label>
          <Controller
            control={control}
            name="type"
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={(value: ExpenseType) => {
                  field.onChange(value);
                  onTypeChange(value);
                  if (!canTypeRecur(value)) {
                    setValue('isRecurring', false);
                  }
                }}
              >
                <SelectTrigger id="type" aria-label="Tipo di voce da registrare">
                  <span className={cn(!field.value && 'text-muted-foreground')}>
                    {field.value
                      ? EXPENSE_TYPE_LABELS[field.value as ExpenseType]
                      : 'Seleziona tipo'}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <div className="flex flex-col gap-0.5 py-0.5">
                        <span className="font-medium flex items-center gap-1.5">
                          <option.Icon className="h-3.5 w-3.5" aria-hidden="true" />
                          {option.label}
                        </span>
                        <span className="text-xs text-muted-foreground font-normal">{option.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {typeChangeNotice && (
            <p className="text-xs text-warning-foreground">{typeChangeNotice}</p>
          )}
        </div>
      )}

      {/* ---- Importo + Data ----
           With «Acquisto rateale» on, the plan declares the cost («Importo totale») and this
           field is HIDDEN: it used to be required and then silently overwritten by the plan,
           so typing 100 here and 600 there saved 600 without a word. The date then takes the
           whole row. The toggle is creation-only, so an existing instalment row still edits
           its own amount here. */}
      <div className={cn('grid grid-cols-1 gap-4', !watchedIsInstallment && 'sm:grid-cols-2')}>
        {!watchedIsInstallment && (
          <div className="space-y-2 min-w-0">
            <Label htmlFor="amount">Importo (euro) *</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              min="0"
              placeholder="0,00"
              {...register('amount', { valueAsNumber: true })}
              className={errors.amount ? 'border-destructive' : ''}
            />
            {selectedType !== 'income' && selectedType !== 'transfer' && (
              <p className="text-xs text-muted-foreground">Salvato come negativo</p>
            )}
            {errors.amount && (
              <p className="text-sm text-destructive">{errors.amount.message}</p>
            )}
          </div>
        )}

        <div className="space-y-2 min-w-0">
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
                    const date = new Date(dateString + 'T00:00:00');
                    if (!Number.isNaN(date.getTime())) field.onChange(date);
                  }
                }}
                className={errors.date ? 'border-destructive' : ''}
              />
            )}
          />
        </div>
      </div>

      {/* ---- Categoria + Sottocategoria ---- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="categoryId">Categoria *</Label>
          {loadingCategories ? (
            <Skeleton className="h-9 rounded-md" />
          ) : (
            <>
              <SearchableCombobox
                id="categoryId"
                options={availableCategories}
                value={selectedCategoryId || ''}
                onValueChange={(value) => {
                  setValue('categoryId', value);
                  setValue('subCategoryId', '');
                }}
                placeholder="Seleziona"
                searchPlaceholder="Cerca..."
                emptyMessage="Nessuna categoria disponibile"
                showBadge={false}
                onCreateOption={onCreateCategory}
                createOptionLabel="Aggiungi categoria"
              />
              {errors.categoryId && (
                <p className="text-sm text-destructive">{errors.categoryId.message}</p>
              )}
            </>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="subCategoryId">
            Sottocategoria <span className="text-muted-foreground font-normal">(opzionale)</span>
          </Label>
          <SearchableCombobox
            id="subCategoryId"
            options={availableSubCategories}
            value={watchedSubCategoryId || ''}
            onValueChange={(value) => setValue('subCategoryId', value || undefined)}
            placeholder={selectedCategoryId ? 'Seleziona' : 'Prima seleziona categoria'}
            searchPlaceholder="Cerca..."
            emptyMessage="Nessuna sottocategoria disponibile"
            showBadge={false}
            disabled={!selectedCategoryId}
            onCreateOption={selectedCategoryId ? onCreateSubCategory : undefined}
            createOptionLabel="Aggiungi sottocategoria"
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
      {cashAssets.length > 0 && selectedType === 'transfer' ? (
        /* Transfer: dual-account selector (origin + destination) */
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="linkedCashAssetId">
              Conto di Origine *
            </Label>
            <Select
              value={watchedLinkedCashAssetId || '__none__'}
              onValueChange={(value) => setValue('linkedCashAssetId', value)}
            >
              <SelectTrigger id="linkedCashAssetId">
                <SelectValue placeholder="Seleziona conto" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Seleziona conto</SelectItem>
                {cashAssets.map((asset) => (
                  <SelectItem key={asset.id} value={asset.id}>
                    {asset.name} ({asset.currency})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="transferCashAssetId">
              Conto di Destinazione *
            </Label>
            <Select
              value={watchedTransferCashAssetId || '__none__'}
              onValueChange={(value) => setValue('transferCashAssetId', value)}
            >
              <SelectTrigger id="transferCashAssetId">
                <SelectValue placeholder="Seleziona conto" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Seleziona conto</SelectItem>
                {cashAssets
                  .filter((a) => a.id !== watchedLinkedCashAssetId || watchedLinkedCashAssetId === '__none__')
                  .map((asset) => (
                    <SelectItem key={asset.id} value={asset.id}>
                      {asset.name} ({asset.currency})
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">
            Il saldo di entrambi i conti viene aggiornato automaticamente.
          </p>
        </div>
      ) : cashAssets.length > 0 ? (
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
      ) : null}

      {/* ---- Divisione: di chi è questa voce (feature-gated) ----
          In the MAIN body and not behind «Impostazioni avanzate», unlike the cost centre: in a
          household that splits its spending this is touched on most rows, and the default
          («In comune») is the one that costs no interaction at all.
          Native radios rather than the SegmentedPill primitive — this picks a VALUE, not a
          panel, so `role=radio` is what a screen reader should meet, and the browser gives the
          arrow-key behaviour for free. */}
      {splitEnabled && familyMembers.length > 0 && selectedType !== 'transfer' && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium leading-none">
            {selectedType === 'income' ? 'Entrata di' : 'Spesa di'}
          </legend>
          <div className="flex flex-wrap gap-2">
            {[{ id: '', name: 'In comune' }, ...familyMembers].map((option) => {
              const checked = personalMemberId === option.id;
              return (
                <label
                  key={option.id || '__common__'}
                  className={cn(
                    'inline-flex h-11 cursor-pointer items-center rounded-full border px-4 text-sm transition-colors',
                    'focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
                    checked
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background text-foreground hover:bg-muted'
                  )}
                >
                  <input
                    type="radio"
                    name="personalMemberId"
                    className="sr-only"
                    value={option.id}
                    checked={checked}
                    onChange={() => setPersonalMemberId(option.id)}
                  />
                  {option.name}
                </label>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            {selectedType === 'income'
              ? 'Gli stipendi intestati a una persona danno le quote della Divisione.'
              : 'Le voci in comune si dividono in proporzione agli stipendi; le personali restano a chi le ha fatte.'}
          </p>
        </fieldset>
      )}

      {/* ================================================================
          IMPOSTAZIONI AVANZATE
      ================================================================ */}
      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className={cn(
              'group w-full flex items-center justify-between px-4 py-3',
              'rounded-xl border border-border/60 bg-muted/20',
              'text-sm font-medium hover:bg-muted/40 transition-colors duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            )}
          >
            <span>Impostazioni avanzate</span>
            <ChevronDown
              className={cn(
                'h-4 w-4 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none',
                'group-data-[state=open]:rotate-180',
              )}
            />
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent className="space-y-5 pt-4">

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
                  {costCenters.map((center) => (
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

          {/* ---- Link ---- */}
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

          {/* ---- Acquisto rateale (solo spese variabili/fisse, solo creazione) ---- */}
          {!expense && (selectedType === 'variable' || selectedType === 'fixed') && (
            <div className="space-y-4 rounded-xl border border-border/60 bg-muted/30 p-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="isInstallment" className="text-sm font-medium cursor-pointer">
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
                      setValue('isRecurring', false);
                      setValue('installmentMode', 'auto');
                      setValue('installmentStartDate', getValues('date'));
                      // Carry over an amount already typed before the toggle was flipped —
                      // the field is hidden from here on, so this is its last chance to
                      // become the plan's total instead of being silently dropped.
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
                  onValueChange={(mode) =>
                    setValue('installmentMode', mode as 'auto' | 'manual')
                  }
                >
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="auto">Calcolo automatico</TabsTrigger>
                    <TabsTrigger value="manual">Importi personalizzati</TabsTrigger>
                  </TabsList>

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
                                if (!Number.isNaN(date.getTime())) field.onChange(date);
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
                          total={watchedInstallmentTotalAmount}
                          count={watchedInstallmentCount ?? 2}
                        />
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="manual" className="space-y-4 mt-4">
                    {/* The total lives here too, not only in «auto»: it is the ONE place that
                        declares what the purchase costs, and the seed «Genera campi rate»
                        divides. The per-instalment fields below still win on save. */}
                    <div className="space-y-2">
                      <Label htmlFor="installmentTotalAmountManual">Importo totale *</Label>
                      <Input
                        id="installmentTotalAmountManual"
                        type="number"
                        step="0.01"
                        min="0.01"
                        placeholder="333.41"
                        {...register('installmentTotalAmount', { valueAsNumber: true })}
                      />
                    </div>
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
                                  if (!Number.isNaN(date.getTime())) field.onChange(date);
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
                            const baseAmount = getValues('installmentTotalAmount') || 0;
                            const perInstallment = Number((baseAmount / count).toFixed(2));
                            setValue(
                              'installmentAmounts',
                              new Array(count).fill(perInstallment)
                            );
                          }}
                        >
                          Genera campi rate
                        </Button>

                        {watchedInstallmentAmounts &&
                          watchedInstallmentAmounts.length > 0 && (
                            <div className="space-y-2 max-h-[240px] overflow-y-auto">
                              {Array.from({ length: watchedInstallmentCount || 0 }).map(
                                (_, index) => {
                                  const installmentDate = calculateInstallmentDate(
                                    watchedInstallmentStartDate || new Date(),
                                    index
                                  );
                                  return (
                                    <div key={`installment-${index}`} className="flex items-center gap-2">
                                      <Label className="w-36 text-sm shrink-0 text-muted-foreground">
                                        Rata {index + 1} (
                                        {format(installmentDate, 'MMM yyyy', {
                                          locale: it,
                                        })}
                                        ):
                                      </Label>
                                      <Input
                                        type="number"
                                        step="0.01"
                                        placeholder="0.00"
                                        {...register(`installmentAmounts.${index}`, {
                                          valueAsNumber: true,
                                        })}
                                      />
                                    </div>
                                  );
                                }
                              )}
                            </div>
                          )}

                        {watchedInstallmentAmounts &&
                          watchedInstallmentAmounts.length > 0 && (
                            <div className="flex justify-end px-1">
                              <span className="text-sm font-medium font-mono">
                                Totale:{' '}
                                {formatCurrency(
                                  (watchedInstallmentAmounts || []).reduce(
                                    (sum: number, amt: number) => sum + (amt || 0),
                                    0
                                  )
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

          {/* ---- Ricorrenza (spese fisse/variabili/debiti, solo creazione) ----
               One toggle, not one per cadence: the two are mutually exclusive, and two
               switches kept out of sync by hand are a state machine the user has to run.
               `canTypeRecur` is the single source on which types may recur. */}
          {canTypeRecur(selectedType) && !expense && (
            <div className="space-y-4 rounded-xl border border-border/60 bg-muted/30 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-0.5 min-w-0">
                  <Label htmlFor="isRecurring" className="text-sm font-medium cursor-pointer">
                    Ricorrenza
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Crea questa voce in anticipo per più mesi o più anni
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
                <div className="space-y-4">
                  <Controller
                    control={control}
                    name="recurringFrequency"
                    render={({ field }) => (
                      <SegmentedPill
                        options={RECURRENCE_FREQUENCY_OPTIONS}
                        value={field.value ?? DEFAULT_RECURRENCE_FREQUENCY}
                        onChange={(next) => {
                          field.onChange(next);
                          // The count means months on one cadence and years on the other, so
                          // carrying "12" across the switch would silently turn a year of
                          // payments into twelve. Re-propose the new cadence's default, but
                          // only while the user is still sitting on the old one's.
                          if (getValues('recurringCount') === DEFAULT_RECURRENCE_COUNT[recurringFrequency]) {
                            setValue('recurringCount', DEFAULT_RECURRENCE_COUNT[next]);
                          }
                        }}
                        layoutId="expense-recurrence-frequency"
                        ariaLabel="Cadenza della ricorrenza"
                      />
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="recurringCount">
                        {recurringFrequency === 'yearly' ? 'Numero di anni *' : 'Numero di mesi *'}
                      </Label>
                      <Input
                        id="recurringCount"
                        type="number"
                        min="1"
                        max={MAX_RECURRENCE_OCCURRENCES[recurringFrequency]}
                        {...register('recurringCount', { valueAsNumber: true })}
                        className={errors.recurringCount ? 'border-destructive' : ''}
                      />
                      {errors.recurringCount && (
                        <p className="text-sm text-destructive">
                          {errors.recurringCount.message}
                        </p>
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
                        <p className="text-sm text-destructive">
                          {errors.recurringDay.message}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {recurringFrequency === 'yearly'
                          ? 'Es: il 10 dello stesso mese, ogni anno'
                          : 'Es: il 10 di ogni mese'}
                      </p>
                    </div>
                  </div>

                  {/* The series is materialised as real future-dated rows, so it shows up in
                      Cashflow and Analisi straight away. Stating it costs one line; letting
                      the user discover it from an unexpected projection costs their trust. */}
                  {recurrencePreview && (
                    <p className="text-xs text-muted-foreground">{recurrencePreview}</p>
                  )}
                </div>
              )}
            </div>
          )}

        </CollapsibleContent>
      </Collapsible>

    </form>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ExpenseDialog({ open, onClose, expense, onSuccess }: Readonly<ExpenseDialogProps>) {
  const { user } = useAuth();
  const { ownerId } = useActiveAccount();
  const queryClient = useQueryClient();

  // The modal's reading IS the status line: what the form wants, what it is doing, how it went.
  const [status, setStatus] = useState<ModalStatus>({ phase: 'idle' });
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [cashAssets, setCashAssets] = useState<Asset[]>([]);
  const [defaultDebitCashAssetId, setDefaultDebitCashAssetId] = useState<string>('__none__');
  const [defaultCreditCashAssetId, setDefaultCreditCashAssetId] = useState<string>('__none__');
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [costCentersEnabled, setCostCentersEnabled] = useState(false);
  const [selectedCostCenterId, setSelectedCostCenterId] = useState<string>('__none__');
  // Divisione: '' is «in comune», the default. Stored as its own state rather than a form field
  // because it is not validated and has no error state — same shape as the cost centre above.
  const [splitEnabled, setSplitEnabled] = useState(false);
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [personalMemberId, setPersonalMemberId] = useState<string>('');
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [categoryInitialName, setCategoryInitialName] = useState('');
  const [categoryEditTarget, setCategoryEditTarget] = useState<ExpenseCategory | null>(null);
  const [subCategoryInitialName, setSubCategoryInitialName] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(() => isAdvancedPrePopulated(expense));
  // 1 = type picker, 2 = form. Edit mode never leaves step 2 (see the file header).
  const [step, setStep] = useState<1 | 2>(() => (expense ? 2 : 1));

  const form = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      type: 'variable',
      currency: 'EUR',
      date: new Date(),
      isRecurring: false,
      recurringFrequency: DEFAULT_RECURRENCE_FREQUENCY,
      recurringCount: DEFAULT_RECURRENCE_COUNT[DEFAULT_RECURRENCE_FREQUENCY],
      isInstallment: false,
      installmentMode: 'auto',
      installmentCount: 2,
      installmentAmounts: [],
      linkedCashAssetId: '__none__',
      transferCashAssetId: '__none__',
    },
  });
  const { reset, setValue, getValues, control, formState: { isSubmitting } } = form;

  const selectedType = useWatch({ control, name: 'type' }) as ExpenseType;
  const selectedCategoryId = useWatch({ control, name: 'categoryId' });
  const selectedIsRecurring = useWatch({ control, name: 'isRecurring' });
  const selectedRecurringFrequency = useWatch({ control, name: 'recurringFrequency' });
  const selectedRecurringCount = useWatch({ control, name: 'recurringCount' });
  const selectedRecurringDay = useWatch({ control, name: 'recurringDay' });
  const selectedDate = useWatch({ control, name: 'date' });
  const watchedIsInstallment = useWatch({ control, name: 'isInstallment' });
  const watchedInstallmentCount = useWatch({ control, name: 'installmentCount' });
  const watchedInstallmentTotalAmount = useWatch({ control, name: 'installmentTotalAmount' });
  const watchedInstallmentStartDate = useWatch({ control, name: 'installmentStartDate' });
  const watchedInstallmentAmounts = useWatch({ control, name: 'installmentAmounts' });
  const watchedLinkedCashAssetId = useWatch({ control, name: 'linkedCashAssetId' });
  const watchedTransferCashAssetId = useWatch({ control, name: 'transferCashAssetId' });
  const watchedSubCategoryId = useWatch({ control, name: 'subCategoryId' });

  const isEdit = !!expense;

  /**
   * What the series will actually write, in one sentence.
   *
   * The occurrences are real documents, not a rule: the user is about to add up to 360 rows to
   * their Cashflow, and the span they cover is the only thing that makes that number legible.
   * Built from the SAME `buildRecurrenceDates` the service uses, so the preview cannot promise
   * a last payment the write then places somewhere else.
   */
  const recurrencePreview = useMemo(() => {
    if (!selectedIsRecurring || !selectedDate || !selectedRecurringCount) return null;
    const frequency = selectedRecurringFrequency ?? DEFAULT_RECURRENCE_FREQUENCY;
    if (
      !Number.isFinite(selectedRecurringCount) ||
      selectedRecurringCount < 1 ||
      selectedRecurringCount > MAX_RECURRENCE_OCCURRENCES[frequency]
    ) {
      return null;
    }
    const dates = buildRecurrenceDates({
      start: selectedDate,
      frequency,
      count: selectedRecurringCount,
      dayOfMonth: selectedRecurringDay,
    });
    if (dates.length === 0) return null;
    const first = format(dates[0], 'dd/MM/yyyy');
    const last = format(dates[dates.length - 1], 'dd/MM/yyyy');
    if (dates.length === 1) return `Verrà creata 1 voce, il ${first}.`;
    return `Verranno create ${dates.length} voci, dal ${first} al ${last}.`;
  }, [
    selectedIsRecurring,
    selectedDate,
    selectedRecurringFrequency,
    selectedRecurringCount,
    selectedRecurringDay,
  ]);

  useEffect(() => {
    if (!open) return;
    // Re-run on every open so a second "nuova voce" starts from the picker again — without
    // `open` in the deps, `expense` stays null between opens and the step is never reset.
    setStatus({ phase: 'idle' });
    setStep(expense ? 2 : 1);
    setAdvancedOpen(isAdvancedPrePopulated(expense));
    transferCategoryIdRef.current = null; // Reset transfer category cache on dialog open
  }, [open, expense]);

  useEffect(() => {
    if (open && user) {
      loadCategories();
      loadCashAssets();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user]);

  useEffect(() => {
    if (!expense) {
      setValue('subCategoryId', '');
    }
  }, [selectedCategoryId, expense, setValue]);

  // Auto-set transfer category when type changes to 'transfer'.
  // Guard with a ref to avoid re-fetching if the user toggles type back and forth.
  // Runs in edit mode too (a row re-typed INTO a transfer needs a transfer category),
  // but never overrides a transfer category already in place — whether the row's own
  // (transfer → transfer edits) or one the user picked by hand.
  const transferCategoryIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (selectedType === 'transfer' && user && ownerId && open) {
      const currentCategoryId = getValues('categoryId');
      if (categories.some((c) => c.id === currentCategoryId && c.type === 'transfer')) {
        return;
      }
      if (transferCategoryIdRef.current) {
        // Already fetched in this dialog session — reuse cached ID
        setValue('categoryId', transferCategoryIdRef.current);
        return;
      }
      // Use the already-loaded category list first to avoid an unnecessary Firestore
      // write (ensureTransferCategory creates the stub even on dialog cancel).
      const existingTransferCat = categories.find(c => c.type === 'transfer');
      if (existingTransferCat) {
        transferCategoryIdRef.current = existingTransferCat.id;
        setValue('categoryId', existingTransferCat.id);
        return;
      }
      ensureTransferCategory(ownerId).then((catId) => {
        transferCategoryIdRef.current = catId;
        setValue('categoryId', catId);
        loadCategories();
      }).catch(console.error);
    }
  }, [selectedType, user, open, getValues, setValue, categories]);

  const loadCategories = async () => {
    if (!user || !ownerId) return;
    try {
      setLoadingCategories(true);
      const allCategories = await getAllCategories(ownerId);
      setCategories(allCategories);
    } catch (error) {
      console.error('Error loading categories:', error);
      toast.error('Errore nel caricamento delle categorie');
    } finally {
      setLoadingCategories(false);
    }
  };

  const loadCashAssets = async () => {
    if (!user || !ownerId) return;
    try {
      const [allAssets, settings, centers] = await Promise.all([
        getAllAssets(ownerId),
        getSettings(ownerId),
        getCostCenters(ownerId),
      ]);
      setCashAssets(allAssets.filter((a) => a.type === 'cash' && a.assetClass === 'cash'));
      const debitId = settings?.defaultDebitCashAssetId || '__none__';
      const creditId = settings?.defaultCreditCashAssetId || '__none__';
      setDefaultDebitCashAssetId(debitId);
      setDefaultCreditCashAssetId(creditId);
      setCostCentersEnabled(settings?.costCentersEnabled ?? false);
      setCostCenters(centers);
      setSplitEnabled(settings?.expenseSplitEnabled ?? false);
      setFamilyMembers(settings?.familyMembers ?? []);
      if (!expense) {
        const currentType = getValues('type');
        const defaultId = currentType === 'income' ? creditId : debitId;
        if (defaultId !== '__none__') {
          setValue('linkedCashAssetId', defaultId);
        }
      }
    } catch (error) {
      console.error('Error loading cash assets:', error);
    }
  };

  useEffect(() => {
    if (!open) return;
    if (expense) {
      reset({
        type: expense.type,
        categoryId: expense.categoryId,
        subCategoryId: expense.subCategoryId || '',
        amount: Math.abs(expense.amount),
        currency: expense.currency,
        date: expense.date,
        notes: expense.notes || '',
        link: expense.link || '',
        isRecurring: expense.isRecurring || false,
        recurringFrequency: resolveRecurrenceFrequency(expense.recurringFrequency),
        recurringDay: expense.recurringDay,
        // The length of a saved series is not editable from a single row: the toggle and its
        // fields are creation-only. 1 keeps the value valid without implying anything.
        recurringCount: 1,
        linkedCashAssetId: expense.linkedCashAssetId || '__none__',
        transferCashAssetId: expense.transferCashAssetId || '__none__',
      });
      setSelectedCostCenterId(expense.costCenterId || '__none__');
      setPersonalMemberId(expense.personalMemberId || '');
    } else {
      reset({
        type: 'variable',
        categoryId: '',
        subCategoryId: '',
        amount: undefined as unknown as number,
        currency: 'EUR',
        date: new Date(),
        notes: '',
        link: '',
        isRecurring: false,
        recurringFrequency: DEFAULT_RECURRENCE_FREQUENCY,
        recurringDay: new Date().getDate(),
        recurringCount: DEFAULT_RECURRENCE_COUNT[DEFAULT_RECURRENCE_FREQUENCY],
        linkedCashAssetId: '__none__',
        transferCashAssetId: '__none__',
      });
      setSelectedCostCenterId('__none__');
      setPersonalMemberId('');
    }
  }, [expense, reset, open]);

  useEffect(() => {
    if (!expense && open) {
      const defaultId =
        selectedType === 'income' ? defaultCreditCashAssetId : defaultDebitCashAssetId;
      if (defaultId !== '__none__') {
        setValue('linkedCashAssetId', defaultId);
      }
    }
  }, [defaultDebitCashAssetId, defaultCreditCashAssetId, selectedType, expense, open, setValue]);

  useEffect(() => {
    if (selectedDate && selectedIsRecurring && !expense) {
      setValue('recurringDay', selectedDate.getDate());
    }
  }, [selectedDate, selectedIsRecurring, expense, setValue]);

  const availableCategories = useMemo(
    () =>
      categories
        .filter((cat) => cat.type === selectedType)
        .sort((a, b) => a.name.localeCompare(b.name, 'it'))
        .map((cat) => {
          const LazyIcon = cat.icon ? getLazyIcon(cat.icon) : null;
          return {
            value: cat.id,
            label: cat.name,
            color: cat.color || 'var(--primary)',
            icon: LazyIcon ? (
              <Suspense fallback={<Tag className="h-3.5 w-3.5" aria-hidden="true" />}>
                <LazyIcon className="h-3.5 w-3.5" aria-hidden="true" />
              </Suspense>
            ) : undefined,
          };
        }),
    [categories, selectedType]
  );

  const selectedCategory = useMemo(
    () => categories.find((cat) => cat.id === selectedCategoryId),
    [categories, selectedCategoryId]
  );

  const availableSubCategories = useMemo(
    () =>
      (selectedCategory?.subCategories || [])
        .sort((a, b) => a.name.localeCompare(b.name, 'it'))
        .map((sub) => {
          const LazyIcon = sub.icon ? getLazyIcon(sub.icon) : null;
          return {
            value: sub.id,
            label: sub.name,
            icon: LazyIcon ? (
              <Suspense fallback={<Tag className="h-3.5 w-3.5" aria-hidden="true" />}>
                <LazyIcon className="h-3.5 w-3.5" aria-hidden="true" />
              </Suspense>
            ) : undefined,
          };
        }),
    [selectedCategory]
  );

  const handleCategoryCreated = async () => {
    await loadCategories();
    setCategoryEditTarget(null);
    setSubCategoryInitialName('');
    setCategoryInitialName('');
  };

  const handleCreateCategory = (name: string) => {
    setCategoryEditTarget(null);
    setCategoryInitialName(name);
    setCategoryDialogOpen(true);
  };

  const handleCreateSubCategory = (name: string) => {
    if (!selectedCategory) return;
    setCategoryEditTarget(selectedCategory);
    setCategoryInitialName('');
    setSubCategoryInitialName(name);
    setCategoryDialogOpen(true);
  };

  const onSubmit = async (data: ExpenseFormValues) => {
    // Every refusal lands on the modal's reading line, where the reader is already looking —
    // a toast in the corner asks them to look away from the form that caused it.
    if (!user || !ownerId) {
      setStatus({ phase: 'error', message: 'La sessione è scaduta: rientra e riprova.' });
      return;
    }

    const category = categories.find((cat) => cat.id === data.categoryId);
    if (!category) {
      setStatus({ phase: 'error', message: 'La categoria scelta non esiste più: scegline un’altra.' });
      return;
    }

    setStatus({ phase: 'submitting' });

    let subCategoryName: string | undefined;
    if (data.subCategoryId) {
      subCategoryName = category.subCategories.find(
        (sub) => sub.id === data.subCategoryId
      )?.name;
    }

    const linkedCashAssetId =
      data.linkedCashAssetId === '__none__' ? undefined : data.linkedCashAssetId;
    const transferCashAssetId =
      data.transferCashAssetId === '__none__' ? undefined : data.transferCashAssetId;
    const resolvedCostCenterId =
      selectedCostCenterId === '__none__' ? undefined : selectedCostCenterId;
    // A transfer is net-zero and belongs to no one: it moves money between the household's own
    // accounts, which is exactly what feeding a joint account looks like. Marking it personal
    // would put plumbing into somebody's column.
    const resolvedPersonalMemberId =
      splitEnabled && data.type !== 'transfer' && personalMemberId ? personalMemberId : undefined;
    const resolvedCostCenterName = resolvedCostCenterId
      ? costCenters.find((c) => c.id === resolvedCostCenterId)?.name
      : undefined;

    try {
      const expenseData: ExpenseFormData = {
        type: data.type,
        categoryId: data.categoryId,
        subCategoryId: data.subCategoryId,
        // An instalment plan overwrites this per row (createInstallmentExpenses), and its
        // own field is hidden — 0 is the honest placeholder, never a saved figure.
        amount: data.amount ?? 0,
        currency: data.currency,
        date: data.date,
        notes: data.notes,
        link: data.link,
        isRecurring: canTypeRecur(data.type) ? data.isRecurring : false,
        recurringFrequency: data.isRecurring
          ? (data.recurringFrequency ?? DEFAULT_RECURRENCE_FREQUENCY)
          : undefined,
        recurringDay: data.isRecurring ? data.recurringDay : undefined,
        recurringCount: data.isRecurring ? data.recurringCount : undefined,
        isInstallment: data.isInstallment,
        installmentMode: data.isInstallment ? data.installmentMode : undefined,
        installmentCount: data.isInstallment ? data.installmentCount : undefined,
        installmentTotalAmount:
          data.isInstallment && data.installmentMode === 'auto'
            ? data.installmentTotalAmount
            : undefined,
        installmentAmounts:
          data.isInstallment && data.installmentMode === 'manual'
            ? data.installmentAmounts
            : undefined,
        installmentStartDate: data.isInstallment ? data.installmentStartDate : undefined,
        linkedCashAssetId,
        transferCashAssetId,
        costCenterId: resolvedCostCenterId,
        costCenterName: resolvedCostCenterName,
        personalMemberId: resolvedPersonalMemberId,
      };

      if (expense) {
        const updatesWithLink = {
          ...expenseData,
          linkedCashAssetId: linkedCashAssetId ?? null,
          transferCashAssetId: data.type === 'transfer' ? (transferCashAssetId ?? null) : null,
          costCenterId: resolvedCostCenterId ?? null,
          costCenterName: resolvedCostCenterName ?? null,
          // updateDoc only touches the fields it is handed and removeUndefinedDeep strips
          // undefined, so moving a row back to «in comune» has to be written explicitly.
          personalMemberId: resolvedPersonalMemberId ?? null,
          // `isRecurring: false` above is authoritative, but `recurringDay: undefined` is
          // stripped by removeUndefinedDeep before the write, leaving the old day behind
          // in Firestore. Reachable now that a debt can be turned into a plain expense
          // from this form — see AGENTS.md → Firestore Optional Field Deletion.
          recurringDay: expenseData.isRecurring ? expenseData.recurringDay : deleteField(),
          recurringFrequency: expenseData.isRecurring
            ? expenseData.recurringFrequency
            : deleteField(),
          // Form-only, and `updateExpense` spreads whatever it is handed: the number of
          // occurrences describes a creation, not a row, and must never reach the document.
          recurringCount: undefined,
        };
        await updateExpense(
          expense.id,
          updatesWithLink as ExpenseFormData,
          category.name,
          subCategoryName
        );

        let assetUpdated = false;

        // Reconcile cash balances BEFORE confirming success — a failed transaction
        // must not show a success toast while balances are left inconsistent.
        // The branch is chosen from BOTH the old and the new type: a transfer touches
        // two accounts, so crossing that boundary needs the cross-shape reconcilers.
        const wasTransfer = expense.type === 'transfer';
        const isTransfer = data.type === 'transfer';
        // Editing always has an amount: the instalment toggle is creation-only, so the
        // field is never hidden here.
        const editedAmount = data.amount ?? 0;
        const newSignedAmount =
          data.type === 'income' ? Math.abs(editedAmount) : -Math.abs(editedAmount);

        if (wasTransfer && isTransfer) {
          assetUpdated = await reconcileTransferEdit({
            oldOriginId: expense.linkedCashAssetId,
            oldDestId: expense.transferCashAssetId,
            newOriginId: linkedCashAssetId,
            newDestId: transferCashAssetId,
            oldAmount: Math.abs(expense.amount),
            newAmount: Math.abs(editedAmount),
          });
        } else if (wasTransfer) {
          assetUpdated = await reconcileTransferToSingleEdit({
            oldOriginId: expense.linkedCashAssetId,
            oldDestId: expense.transferCashAssetId,
            oldAmount: Math.abs(expense.amount),
            newLinkedAssetId: linkedCashAssetId,
            newSignedAmount,
          });
        } else if (isTransfer) {
          assetUpdated = await reconcileSingleToTransferEdit({
            oldLinkedAssetId: expense.linkedCashAssetId,
            oldSignedAmount: expense.amount,
            newOriginId: linkedCashAssetId,
            newDestId: transferCashAssetId,
            newAmount: Math.abs(editedAmount),
          });
        } else {
          assetUpdated = await reconcileSingleEdit({
            oldLinkedAssetId: expense.linkedCashAssetId,
            newLinkedAssetId: linkedCashAssetId,
            oldSignedAmount: expense.amount,
            newSignedAmount,
          });
        }

        if (assetUpdated) {
          queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(ownerId) });
          queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.overview(ownerId) });
        }

        toast.success(data.type === 'transfer' ? 'Trasferimento aggiornato con successo' : 'Spesa aggiornata con successo');
      } else {
        const result = await createExpense(
          ownerId,
          expenseData,
          category.name,
          subCategoryName
        );

        if (data.type === 'transfer') {
          // Reconcile balances BEFORE confirming success (see edit branch).
          const transferUpdated = await reconcileTransferCreate({
            originId: linkedCashAssetId,
            destId: transferCashAssetId,
            amount: Math.abs(expenseData.amount),
          });
          if (transferUpdated) {
            queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(ownerId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.overview(ownerId) });
          }
          toast.success('Trasferimento creato con successo');
        } else if (linkedCashAssetId) {
          let firstSignedAmount: number;
          if (
            expenseData.isInstallment &&
            expenseData.installmentCount &&
            expenseData.installmentCount > 1
          ) {
            let firstAmt: number;
            if (expenseData.installmentMode === 'auto') {
              firstAmt =
                Math.floor(
                  (expenseData.installmentTotalAmount! / expenseData.installmentCount) * 100
                ) / 100;
            } else {
              firstAmt = expenseData.installmentAmounts![0];
            }
            firstSignedAmount =
              data.type === 'income' ? Math.abs(firstAmt) : -Math.abs(firstAmt);
          } else if (
            expenseData.isRecurring &&
            expenseData.recurringCount &&
            expenseData.recurringCount > 0
          ) {
            firstSignedAmount = -Math.abs(expenseData.amount);
          } else {
            firstSignedAmount =
              data.type === 'income' ? Math.abs(expenseData.amount) : -Math.abs(expenseData.amount);
          }

          await reconcileSingleCreate({ linkedAssetId: linkedCashAssetId, signedAmount: firstSignedAmount });
          queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(ownerId) });
          queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.overview(ownerId) });
        }

        // Non-transfer success toast — after balances are reconciled.
        if (data.type !== 'transfer') {
          if (Array.isArray(result)) {
            if (expenseData.isInstallment) {
              const total =
                expenseData.installmentMode === 'auto'
                  ? expenseData.installmentTotalAmount
                  : expenseData.installmentAmounts?.reduce((sum, amt) => sum + amt, 0);
              toast.success(
                `${result.length} rate create con successo (Totale: ${formatCurrency(total || 0)})`
              );
            } else {
              toast.success(`${result.length} voci ricorrenti create con successo`);
            }
          } else {
            toast.success('Spesa creata con successo');
          }
        }
      }

      // Refresh the Cost Centers tab: its spend stats are derived from expenses,
      // so any create/edit (including adding, changing, or clearing a cost center)
      // must invalidate the shared ['cost-centers', userId] cache. Always fired —
      // an edit may move a transaction out of a center just as easily as into one.
      queryClient.invalidateQueries({ queryKey: queryKeys.costCenters.all(ownerId) });

      onSuccess?.();
      onClose();
    } catch (error) {
      console.error('Error saving expense:', error);
      setStatus({ phase: 'error', message: describeWriteError(error) });
    }
  };

  const isTypePicker = !isEdit && step === 1;

  // Both titles follow the SELECTED type, not the stored one: in edit mode the type is
  // now changeable, and a header still saying "Modifica entrata" while the form has
  // been switched to a spesa would contradict the control right below it. On step 1 no
  // type has been chosen yet, so the header names the flow instead.
  const dialogTitle = isTypePicker
    ? 'Che cosa vuoi registrare?'
    : isEdit
      ? EDIT_TITLES[selectedType]
      : CREATE_TITLES[selectedType];

  // The eyebrow carries the context and, after a centred dot, the scope — which is where the
  // type badge went: a Badge beside the title was a second label register for the same fact.
  // The scope names ONE row's type, so it takes the picker's singular label («Spesa variabile»)
  // and not `EXPENSE_TYPE_LABELS`, which is the plural of a category group («Spese Variabili»).
  const dialogEyebrow = isTypePicker
    ? 'Nuova voce · Passo 1 di 2'
    : `${isEdit ? 'Modifica voce' : 'Nuova voce'} · ${TYPE_OPTIONS.find((o) => o.value === selectedType)?.label ?? ''}`;

  const reading = describeModalStatus(isSubmitting ? { phase: 'submitting' } : status, {
    idle: isTypePicker ? EXPENSE_TYPE_PICKER_READING : describeExpenseIntent(selectedType),
    submitting: isEdit ? 'Sto salvando le modifiche.' : 'Sto registrando la voce.',
  });

  const submitLabel = isSubmitting ? 'Salvataggio...' : isEdit ? 'Salva modifiche' : 'Crea voce';

  /**
   * Re-point the category when the type changes.
   *
   * Categories belong to exactly one type, so the current selection is always invalid
   * afterwards. Rather than clearing it outright, look for the same-named category under
   * the new type — the common reason to change the type at all is that the row was filed
   * under the wrong one of two same-named categories.
   */
  const handleTypeChange = useCallback(
    (nextType: ExpenseType) => {
      const match = resolveEquivalentCategory(
        categories,
        getValues('categoryId'),
        getValues('subCategoryId'),
        nextType
      );
      setValue('categoryId', match?.categoryId ?? '');
      setValue('subCategoryId', match?.subCategoryId ?? '');
    },
    [categories, getValues, setValue]
  );

  /**
   * Picks the type in step 1 and advances to the form.
   *
   * Goes through `handleTypeChange` rather than setting the type alone: the picker can be
   * re-opened from "Cambia tipo" with a category already selected, and that category belongs to
   * the type the user is leaving. The `isRecurring` reset mirrors the edit-mode Select —
   * recurrence exists only for the spending types (`canTypeRecur`).
   */
  const handleTypeSelect = useCallback(
    (nextType: ExpenseType) => {
      handleTypeChange(nextType);
      setValue('type', nextType);
      if (!canTypeRecur(nextType)) {
        setValue('isRecurring', false);
      }
      setStep(2);
    },
    [handleTypeChange, setValue]
  );

  /**
   * What the reader needs to know before saving a type change, and nothing more.
   *
   * Crossing a balance boundary is the loud part: leaving or entering the transfer
   * type re-shapes which accounts move, while crossing the income line flips the
   * sign and corrects the linked account by twice the figure. The budget note tells
   * the user which totals silently gain or lose this row. The series note only
   * appears when the row actually belongs to one.
   */
  const typeChangeNotice = useMemo(() => {
    if (!expense || selectedType === expense.type) return null;

    const wasTransfer = expense.type === 'transfer';
    const isTransfer = selectedType === 'transfer';

    const notices: string[] = [];
    if (wasTransfer && !isTransfer) {
      notices.push(
        'Era un trasferimento: il movimento verrà stornato da entrambi i conti e il nuovo importo applicato al conto selezionato.'
      );
      notices.push('La voce entrerà nei totali di spesa/entrata e nei budget per tipo, se configurati.');
    } else if (!wasTransfer && isTransfer) {
      notices.push(
        "Diventerà un trasferimento: l'effetto sul conto attuale verrà stornato e verranno aggiornati i saldi di origine e destinazione."
      );
      notices.push('I trasferimenti non rientrano nei totali di spesa/entrata né nei budget.');
    } else {
      if ((expense.type === 'income') !== (selectedType === 'income')) {
        notices.push(
          `L'importo cambierà segno (da ${EXPENSE_TYPE_LABELS[expense.type]} a ${EXPENSE_TYPE_LABELS[selectedType]}) e il saldo del conto collegato verrà corretto.`
        );
      }
      notices.push('La voce passerà sotto un altro budget per tipo, se ne hai configurati.');
    }
    if (expense.recurringParentId || expense.installmentParentId) {
      notices.push('Fa parte di una serie: il cambio riguarda solo questa voce.');
    }
    return notices.join(' ');
  }, [expense, selectedType]);

  const formBodyProps: FormBodyProps = {
    form,
    onSubmit,
    isEdit,
    selectedType,
    selectedCategoryId,
    watchedSubCategoryId,
    watchedLinkedCashAssetId,
    watchedTransferCashAssetId,
    watchedIsInstallment,
    watchedInstallmentCount,
    watchedInstallmentTotalAmount,
    watchedInstallmentStartDate,
    watchedInstallmentAmounts,
    selectedIsRecurring,
    selectedRecurringFrequency,
    recurrencePreview,
    expense,
    loadingCategories,
    cashAssets,
    costCenters,
    costCentersEnabled,
    selectedCostCenterId,
    setSelectedCostCenterId,
    splitEnabled,
    familyMembers,
    personalMemberId,
    setPersonalMemberId,
    availableCategories,
    availableSubCategories,
    onCreateCategory: handleCreateCategory,
    onCreateSubCategory: handleCreateSubCategory,
    onTypeChange: handleTypeChange,
    onBackToTypePicker: isEdit ? undefined : () => setStep(1),
    typeChangeNotice,
    advancedOpen,
    setAdvancedOpen,
  };

  return (
    <>
      <ResponsiveModal
        open={open}
        onClose={onClose}
        eyebrow={dialogEyebrow}
        title={dialogTitle}
        reading={reading}
        width="lg"
        footer={
          /* Step 1 has nothing to submit: picking a card IS the action, so the only footer
             control is the way out. The modal lays the buttons out — «Annulla» then the
             primary in DOM order — so no caller branches on the viewport any more. */
          isTypePicker ? (
            <Button type="button" variant="outline" onClick={onClose}>
              Annulla
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
                Annulla
              </Button>
              <Button type="submit" form="expense-form" disabled={isSubmitting}>
                {submitLabel}
              </Button>
            </>
          )
        }
      >
        {isTypePicker ? (
          <ExpenseTypePicker selectedType={selectedType} onSelect={handleTypeSelect} />
        ) : (
          <ExpenseFormBody {...formBodyProps} />
        )}
      </ResponsiveModal>

      <CategoryManagementDialog
        open={categoryDialogOpen}
        onClose={() => { setCategoryDialogOpen(false); setCategoryInitialName(''); setCategoryEditTarget(null); setSubCategoryInitialName(''); }}
        onSuccess={handleCategoryCreated}
        category={categoryEditTarget ?? undefined}
        initialType={selectedType}
        initialName={categoryInitialName}
        initialSubCategoryName={subCategoryInitialName}
      />
    </>
  );
}
