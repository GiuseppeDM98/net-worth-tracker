'use client';

/**
 * ExpenseDialog / ExpenseDrawer Component
 *
 * Single-step form for creating and editing cashflow entries.
 *
 * Layout:
 *   - Type selector (Select dropdown, create mode) or locked Badge (edit mode)
 *   - Primary fields: Importo + Data, Categoria, Sottocategoria, Note, Conto Collegato
 *   - "Impostazioni avanzate" Collapsible: Centro di Costo, Link, Acquisto Rateale, Ricorrenza Mensile
 *
 * Advanced section auto-expands when editing a record with advanced data set.
 * On mobile (<=768 px): vaul Drawer bottom sheet with drag-to-dismiss.
 * On desktop: Dialog modal.
 * All form logic, Zod schema, and submission paths are preserved unchanged.
 */

import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
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
} from '@/types/expenses';
import { CostCenter } from '@/types/costCenters';
import { getCostCenters } from '@/lib/services/costCenterService';
import { Asset } from '@/types/assets';
import { createExpense, updateExpense } from '@/lib/services/expenseService';
import { getAllAssets } from '@/lib/services/assetService';
import {
  reconcileTransferEdit,
  reconcileTransferCreate,
  reconcileSingleEdit,
  reconcileSingleCreate,
} from '@/lib/services/cashBalanceReconciliation';
import { getSettings } from '@/lib/services/assetAllocationService';
import { getAllCategories, ensureTransferCategory } from '@/lib/services/expenseCategoryService';
import { queryKeys } from '@/lib/query/queryKeys';
import { Timestamp } from 'firebase/firestore';
import { CategoryManagementDialog } from '@/components/expenses/CategoryManagementDialog';
import { ResponsiveModal } from '@/components/ui/responsive-modal';
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
import { SearchableCombobox, type ComboboxOption } from '@/components/ui/searchable-combobox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { ChevronDown, ArrowLeftRight, Tag } from 'lucide-react';
import { getLazyIcon } from '@/components/expenses/IconPickerPopover';
import { formatCurrency } from '@/lib/utils/formatters';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { cn } from '@/lib/utils';


// ---------------------------------------------------------------------------
// Schema (unchanged)
// ---------------------------------------------------------------------------

const expenseSchema = z
  .object({
    type: z.enum(['fixed', 'variable', 'debt', 'income', 'transfer']),
    categoryId: z.string().min(1, "Categoria è obbligatoria"),
    subCategoryId: z.string().optional(),
    amount: z.number().positive("L'importo deve essere positivo"),
    currency: z.string().min(1, "Valuta è obbligatoria"),
    date: z.date(),
    notes: z.string().optional(),
    link: z.string().url({ message: 'Inserisci un URL valido' }).optional().or(z.literal('')),
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
    transferCashAssetId: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.isInstallment) {
        if (!data.installmentCount || data.installmentCount < 2) return false;
        if (data.installmentMode === 'auto' && !data.installmentTotalAmount) return false;
        if (
          data.installmentMode === 'manual' &&
          data.installmentAmounts?.length !== data.installmentCount
        )
          return false;
      }
      return true;
    },
    { message: 'Campi rate incompleti o non validi' }
  );

type ExpenseFormValues = z.infer<typeof expenseSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CREATE_TITLES: Record<ExpenseType, string> = {
  variable: 'Nuova Spesa Variabile',
  fixed: 'Nuova Spesa Fissa',
  debt: 'Nuovo Debito',
  income: 'Nuova Entrata',
  transfer: 'Nuovo Trasferimento',
};

const EDIT_TITLES: Record<ExpenseType, string> = {
  variable: 'Modifica Spesa',
  fixed: 'Modifica Spesa',
  debt: 'Modifica Debito',
  income: 'Modifica Entrata',
  transfer: 'Modifica Trasferimento',
};

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
  expense: Expense | null | undefined;
  loadingCategories: boolean;
  cashAssets: Asset[];
  costCenters: CostCenter[];
  costCentersEnabled: boolean;
  selectedCostCenterId: string;
  setSelectedCostCenterId: (id: string) => void;
  availableCategories: ComboboxOption[];
  availableSubCategories: ComboboxOption[];
  onCreateCategory: (name: string) => void;
  onCreateSubCategory: (name: string) => void;
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
  expense,
  loadingCategories,
  cashAssets,
  costCenters,
  costCentersEnabled,
  selectedCostCenterId,
  setSelectedCostCenterId,
  availableCategories,
  availableSubCategories,
  onCreateCategory,
  onCreateSubCategory,
  advancedOpen,
  setAdvancedOpen,
}: Readonly<FormBodyProps>) {
  const { register, control, handleSubmit, setValue, getValues, formState: { errors } } = form;
  return (
    <form id="expense-form" onSubmit={handleSubmit(onSubmit)} className="space-y-5">

      {/* ---- Tipo di voce ---- */}
      <div className="space-y-2">
        <Label htmlFor="type">Tipo di voce</Label>
        {isEdit ? (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs font-normal h-9 px-3">
              {EXPENSE_TYPE_LABELS[expense!.type]}
            </Badge>
            <p className="text-xs text-muted-foreground">Non modificabile</p>
          </div>
        ) : (
          <Controller
            control={control}
            name="type"
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={(value: ExpenseType) => {
                  field.onChange(value);
                  setValue('categoryId', '');
                  setValue('subCategoryId', '');
                  if (value !== 'debt') {
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
                  <SelectItem value="variable">
                    <div className="flex flex-col gap-0.5 py-0.5">
                      <span className="font-medium">Spesa Variabile</span>
                      <span className="text-xs text-muted-foreground font-normal">Ristorante, shopping, svago, imprevisti</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="fixed">
                    <div className="flex flex-col gap-0.5 py-0.5">
                      <span className="font-medium">Spesa Fissa</span>
                      <span className="text-xs text-muted-foreground font-normal">Affitto, abbonamenti, bollette, utenze</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="debt">
                    <div className="flex flex-col gap-0.5 py-0.5">
                      <span className="font-medium">Debito / Rata</span>
                      <span className="text-xs text-muted-foreground font-normal">Mutuo, prestito, finanziamento ricorrente</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="income">
                    <div className="flex flex-col gap-0.5 py-0.5">
                      <span className="font-medium">Entrata</span>
                      <span className="text-xs text-muted-foreground font-normal">Stipendio, bonus, dividendi, rimborsi</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="transfer">
                    <div className="flex flex-col gap-0.5 py-0.5">
                      <span className="font-medium flex items-center gap-1.5"><ArrowLeftRight className="h-3.5 w-3.5" />Trasferimento</span>
                      <span className="text-xs text-muted-foreground font-normal">Sposta denaro tra conti</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        )}
      </div>

      {/* ---- Importo + Data ---- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            <div className="h-9 rounded-md bg-muted animate-pulse" />
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
                            const baseAmount = getValues('amount') || 0;
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

          {/* ---- Ricorrenza mensile (solo Debito, solo creazione) ---- */}
          {selectedType === 'debt' && !expense && (
            <div className="space-y-4 rounded-xl border border-border/60 bg-muted/30 p-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="isRecurring" className="text-sm font-medium cursor-pointer">
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
                      <p className="text-sm text-destructive">
                        {errors.recurringMonths.message}
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
                    <p className="text-xs text-muted-foreground">Es: il 10 di ogni mese</p>
                  </div>
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
  const isMobile = useMediaQuery('(max-width: 768px)');


  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [cashAssets, setCashAssets] = useState<Asset[]>([]);
  const [defaultDebitCashAssetId, setDefaultDebitCashAssetId] = useState<string>('__none__');
  const [defaultCreditCashAssetId, setDefaultCreditCashAssetId] = useState<string>('__none__');
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [costCentersEnabled, setCostCentersEnabled] = useState(false);
  const [selectedCostCenterId, setSelectedCostCenterId] = useState<string>('__none__');
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [categoryInitialName, setCategoryInitialName] = useState('');
  const [categoryEditTarget, setCategoryEditTarget] = useState<ExpenseCategory | null>(null);
  const [subCategoryInitialName, setSubCategoryInitialName] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(() => isAdvancedPrePopulated(expense));

  const form = useForm<ExpenseFormValues>({
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
      transferCashAssetId: '__none__',
    },
  });
  const { reset, setValue, getValues, control, formState: { isSubmitting } } = form;

  const selectedType = useWatch({ control, name: 'type' }) as ExpenseType;
  const selectedCategoryId = useWatch({ control, name: 'categoryId' });
  const selectedIsRecurring = useWatch({ control, name: 'isRecurring' });
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

  useEffect(() => {
    if (!open) return;
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
  const transferCategoryIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (selectedType === 'transfer' && user && ownerId && open && !isEdit) {
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
  }, [selectedType, user, open, isEdit, setValue, categories]);

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
      setCashAssets(allAssets.filter((a) => a.assetClass === 'cash'));
      const debitId = settings?.defaultDebitCashAssetId || '__none__';
      const creditId = settings?.defaultCreditCashAssetId || '__none__';
      setDefaultDebitCashAssetId(debitId);
      setDefaultCreditCashAssetId(creditId);
      setCostCentersEnabled(settings?.costCentersEnabled ?? false);
      setCostCenters(centers);
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
        recurringDay: expense.recurringDay,
        recurringMonths: 1,
        linkedCashAssetId: expense.linkedCashAssetId || '__none__',
        transferCashAssetId: expense.transferCashAssetId || '__none__',
      });
      setSelectedCostCenterId(expense.costCenterId || '__none__');
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
        recurringDay: new Date().getDate(),
        recurringMonths: 12,
        linkedCashAssetId: '__none__',
        transferCashAssetId: '__none__',
      });
      setSelectedCostCenterId('__none__');
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
    if (!user || !ownerId) {
      toast.error('Devi essere autenticato');
      return;
    }

    const category = categories.find((cat) => cat.id === data.categoryId);
    if (!category) {
      toast.error('Categoria non trovata');
      return;
    }

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
    const resolvedCostCenterName = resolvedCostCenterId
      ? costCenters.find((c) => c.id === resolvedCostCenterId)?.name
      : undefined;

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
      };

      if (expense) {
        const updatesWithLink = {
          ...expenseData,
          linkedCashAssetId: linkedCashAssetId ?? null,
          transferCashAssetId: data.type === 'transfer' ? (transferCashAssetId ?? null) : null,
          costCenterId: resolvedCostCenterId ?? null,
          costCenterName: resolvedCostCenterName ?? null,
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
        if (data.type === 'transfer') {
          assetUpdated = await reconcileTransferEdit({
            oldOriginId: expense.linkedCashAssetId,
            oldDestId: expense.transferCashAssetId,
            newOriginId: linkedCashAssetId,
            newDestId: transferCashAssetId,
            oldAmount: Math.abs(expense.amount),
            newAmount: Math.abs(data.amount),
          });
        } else {
          assetUpdated = await reconcileSingleEdit({
            oldLinkedAssetId: expense.linkedCashAssetId,
            newLinkedAssetId: linkedCashAssetId,
            oldSignedAmount: expense.amount,
            newSignedAmount: data.type === 'income' ? Math.abs(data.amount) : -Math.abs(data.amount),
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
            amount: Math.abs(data.amount),
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
            expenseData.recurringMonths &&
            expenseData.recurringMonths > 0
          ) {
            firstSignedAmount = -Math.abs(data.amount);
          } else {
            firstSignedAmount =
              data.type === 'income' ? Math.abs(data.amount) : -Math.abs(data.amount);
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
      toast.error('Errore nel salvataggio della spesa');
    }
  };

  const dialogTitle = isEdit ? EDIT_TITLES[expense.type] : CREATE_TITLES[selectedType];
  const dialogDescription = isEdit
    ? 'Modifica i dettagli della voce selezionata'
    : 'Inserisci i dettagli della nuova voce';
  const baseLabel = isEdit ? 'Salva modifiche' : 'Crea voce';
  const submitLabel = isSubmitting ? 'Salvataggio...' : baseLabel;

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
    expense,
    loadingCategories,
    cashAssets,
    costCenters,
    costCentersEnabled,
    selectedCostCenterId,
    setSelectedCostCenterId,
    availableCategories,
    availableSubCategories,
    onCreateCategory: handleCreateCategory,
    onCreateSubCategory: handleCreateSubCategory,
    advancedOpen,
    setAdvancedOpen,
  };

  return (
    <>
      <ResponsiveModal
        open={open}
        onClose={onClose}
        title={dialogTitle}
        description={dialogDescription}
        headerExtra={
          isEdit ? (
            <Badge variant="outline" className="ml-auto text-xs font-normal">
              {EXPENSE_TYPE_LABELS[expense.type]}
            </Badge>
          ) : undefined
        }
        footer={
          isMobile ? (
            <>
              <Button type="submit" form="expense-form" disabled={isSubmitting} className="w-full">
                {submitLabel}
              </Button>
              <Button type="button" variant="outline" className="w-full" disabled={isSubmitting} onClick={onClose}>
                Annulla
              </Button>
            </>
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
        <ExpenseFormBody {...formBodyProps} />
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
