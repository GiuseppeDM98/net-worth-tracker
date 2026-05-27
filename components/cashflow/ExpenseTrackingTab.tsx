/**
 * Expense tracking with hierarchical filtering and smart deletion
 *
 * FILTER ARCHITECTURE:
 * Two-stage filtering system:
 * - Stage 1 (Time): Year → Month
 * - Stage 2 (Hierarchy): Type → Category → Subcategory
 *
 * Cascading Reset Pattern:
 * - Changing Type resets Category + Subcategory
 * - Changing Category resets Subcategory only
 * - Prevents invalid combinations (e.g., Type="income" + Category="rent")
 *
 * Custom Dropdowns:
 * Native <select> lacks search. Custom implementation uses refs for
 * click-outside detection to match native UX.
 */
'use client';

import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { useAssets } from '@/lib/hooks/useAssets';
import { useHouseholdScopeFilter } from '@/lib/hooks/useHouseholdScopeFilter';
import { useInternalTransfers, useInvestmentOperations } from '@/lib/hooks/useInvestmentOperations';
import { Expense, ExpenseCategory, EXPENSE_TYPE_LABELS } from '@/types/expenses';
import type { Asset } from '@/types/assets';
import { INTERNAL_TRANSFER_PURPOSE_LABELS, type InternalTransferPurpose } from '@/types/household';
import { InternalTransfer, InvestmentOperation, InvestmentOperationType } from '@/types/investments';
import {
  calculateTotalIncome,
  calculateTotalExpenses,
  calculateNetBalance,
  calculateIncomeExpenseRatio,
  getExpensesByRecurringParentId,
  getExpensesByInstallmentParentId,
} from '@/lib/services/expenseService';
import { updateCashAssetBalance, updateInvestmentAssetQuantity } from '@/lib/services/assetService';
import {
  createInternalTransfer,
  createInvestmentOperation,
  deleteInternalTransfer,
  deleteInvestmentOperation,
  updateInternalTransfer,
  updateInvestmentOperation,
} from '@/lib/services/investmentOperationService';
import { queryKeys } from '@/lib/query/queryKeys';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { formatDateInputValue, toDate } from '@/lib/utils/dateHelpers';
import {
  filterExpensesByAttributionScope,
  filterInternalTransfersByOwnershipScope,
  filterInvestmentOperationsByOwnershipScope,
} from '@/lib/utils/householdUtils';
import { HouseholdScopeSelect } from '@/components/household/HouseholdScopeSelect';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Plus, Filter, ChevronDown, Check, X, Trash2, TrendingUp, TrendingDown, ArrowRightLeft, ChartCandlestick, ShoppingCart } from 'lucide-react';
import { ExpenseDialog } from '@/components/expenses/ExpenseDialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useChartColors } from '@/lib/hooks/useChartColors';

const formatCurrency = cachedFormatCurrencyEUR;

const MONTHS = [
  { value: '1', label: 'Gennaio' },
  { value: '2', label: 'Febbraio' },
  { value: '3', label: 'Marzo' },
  { value: '4', label: 'Aprile' },
  { value: '5', label: 'Maggio' },
  { value: '6', label: 'Giugno' },
  { value: '7', label: 'Luglio' },
  { value: '8', label: 'Agosto' },
  { value: '9', label: 'Settembre' },
  { value: '10', label: 'Ottobre' },
  { value: '11', label: 'Novembre' },
  { value: '12', label: 'Dicembre' },
];

// Coverage ratio → Italian health label (mirrors the same function in the dashboard overview page).
function coverageHealthLabel(ratio: number): string {
  if (ratio >= 2.0) return 'Salute ottima';
  if (ratio >= 1.3) return 'Salute buona';
  if (ratio >= 1.0) return 'In pareggio';
  return 'In deficit';
}

// Safely coerce Expense.date (Date | Timestamp | string) to a native Date.
const getExpenseDate = (d: Expense['date']): Date => {
  if (d instanceof Date) return d;
  if (typeof d === 'string') return new Date(d);
  return (d as { toDate(): Date }).toDate();
};

// ─── Main component ───────────────────────────────────────────────────────────

interface ExpenseTrackingTabProps {
  allExpenses: Expense[];
  categories: ExpenseCategory[];
  loading: boolean;
  onRefresh: () => Promise<void>;
}

type UnifiedMovement =
  | { id: string; kind: 'expense'; date: Date; title: string; subtitle: string; amount: number; source: Expense }
  | { id: string; kind: 'investment'; date: Date; title: string; subtitle: string; amount: number; source: InvestmentOperation }
  | { id: string; kind: 'transfer'; date: Date; title: string; subtitle: string; amount: number; source: InternalTransfer };

type MovementKind = UnifiedMovement['kind'];

interface MovementTypeCard {
  value: MovementKind;
  icon: React.ElementType;
  label: string;
  description: string;
}

const MOVEMENT_TYPE_CARDS: MovementTypeCard[] = [
  {
    value: 'expense',
    icon: ShoppingCart,
    label: 'Cashflow',
    description: 'Entrate, spese, debiti, rate e ricorrenze',
  },
  {
    value: 'investment',
    icon: ChartCandlestick,
    label: 'Investimento',
    description: 'Acquisto o vendita con asset, quote, prezzo, commissioni e tasse',
  },
  {
    value: 'transfer',
    icon: ArrowRightLeft,
    label: 'Trasferimento',
    description: 'Spostamento tra conti cash con sorgente, destinazione e tipo',
  },
];

const INVESTMENT_OPERATION_LABELS: Record<InvestmentOperationType, string> = {
  buy: 'Acquisto',
  sell: 'Vendita',
  contribution: 'Carico quote',
  withdrawal: 'Scarico quote',
  fee: 'Commissione',
  tax: 'Tassa',
};

const FORM_INVESTMENT_OPERATION_TYPES: InvestmentOperationType[] = ['buy', 'sell'];

interface UnifiedMovementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assets: Asset[];
  editingMovement: UnifiedMovement | null;
  householdEnabled: boolean;
  onCreateCashflow: () => void;
  onSaved: () => Promise<void>;
}

function UnifiedMovementDialog({
  open,
  onOpenChange,
  assets,
  editingMovement,
  householdEnabled,
  onCreateCashflow,
  onSaved,
}: UnifiedMovementDialogProps) {
  const { user } = useAuth();
  const investmentAssets = useMemo(
    () => assets.filter(asset => asset.assetClass !== 'cash').sort((a, b) => a.name.localeCompare(b.name, 'it')),
    [assets]
  );
  const cashAssets = useMemo(
    () => assets.filter(asset => asset.assetClass === 'cash').sort((a, b) => a.name.localeCompare(b.name, 'it')),
    [assets]
  );

  const [movementKind, setMovementKind] = useState<MovementKind | null>(null);
  const [assetId, setAssetId] = useState('__none__');
  const [investmentType, setInvestmentType] = useState<InvestmentOperationType>('buy');
  const [cashAssetId, setCashAssetId] = useState('__none__');
  const [quantity, setQuantity] = useState('');
  const [pricePerUnit, setPricePerUnit] = useState('');
  const [investmentFees, setInvestmentFees] = useState('');
  const [taxes, setTaxes] = useState('');
  const [fromCashAssetId, setFromCashAssetId] = useState('__none__');
  const [toCashAssetId, setToCashAssetId] = useState('__none__');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferFees, setTransferFees] = useState('');
  const [purpose, setPurpose] = useState<InternalTransferPurpose>('neutral_transfer');
  const [date, setDate] = useState(() => formatDateInputValue());
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const selectedInvestmentAsset = investmentAssets.find(asset => asset.id === assetId);
  const editingId = editingMovement?.kind === movementKind ? editingMovement.source.id : undefined;
  const grossAmount = Number(quantity) * Number(pricePerUnit);

  const resetSpecialFields = useCallback(() => {
    setMovementKind(null);
    setAssetId('__none__');
    setInvestmentType('buy');
    setCashAssetId('__none__');
    setQuantity('');
    setPricePerUnit('');
    setInvestmentFees('');
    setTaxes('');
    setFromCashAssetId('__none__');
    setToCashAssetId('__none__');
    setTransferAmount('');
    setTransferFees('');
    setPurpose('neutral_transfer');
    setDate(formatDateInputValue());
    setNotes('');
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;

    if (!editingMovement) return;

    setMovementKind(editingMovement.kind);
    setDate(formatDateInputValue(toDate(editingMovement.date)));

    if (editingMovement.kind === 'investment') {
      const operation = editingMovement.source;
      setAssetId(operation.assetId);
      setInvestmentType(operation.type);
      setCashAssetId(operation.cashAssetId || '__none__');
      setQuantity(String(operation.quantity));
      setPricePerUnit(String(operation.pricePerUnit));
      setInvestmentFees(operation.fees ? String(operation.fees) : '');
      setTaxes(operation.taxes ? String(operation.taxes) : '');
      setNotes(operation.notes || '');
      return;
    }

    if (editingMovement.kind === 'transfer') {
      const transfer = editingMovement.source;
      setFromCashAssetId(transfer.fromCashAssetId);
      setToCashAssetId(transfer.toCashAssetId);
      setTransferAmount(String(transfer.amount));
      setTransferFees(transfer.fees ? String(transfer.fees) : '');
      setPurpose(transfer.purpose ?? 'neutral_transfer');
      setNotes(transfer.notes || '');
    }
  }, [editingMovement, open, resetSpecialFields]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const closeDialog = () => {
    onOpenChange(false);
    resetSpecialFields();
  };

  const handleSelectKind = (kind: MovementKind) => {
    if (kind === 'expense') {
      closeDialog();
      onCreateCashflow();
      return;
    }

    setMovementKind(kind);
  };

  const handleSaveInvestment = async (): Promise<boolean> => {
    if (!user) return false;
    const parsedQuantity = Number(quantity);
    const parsedPrice = Number(pricePerUnit);
    const parsedFees = investmentFees ? Number(investmentFees) : 0;
    const parsedTaxes = taxes ? Number(taxes) : 0;

    if (assetId === '__none__') {
      toast.error('Seleziona un asset investimento');
      return false;
    }
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      toast.error('Inserisci una quantità valida');
      return false;
    }
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      toast.error('Inserisci un prezzo unitario valido');
      return false;
    }
    if (!Number.isFinite(parsedFees) || parsedFees < 0 || !Number.isFinite(parsedTaxes) || parsedTaxes < 0) {
      toast.error('Commissioni e tasse devono essere positive o pari a zero');
      return false;
    }

    const payload = {
      assetId,
      type: investmentType,
      date: new Date(`${date}T00:00:00`),
      quantity: parsedQuantity,
      pricePerUnit: parsedPrice,
      fees: parsedFees,
      taxes: parsedTaxes,
      currency: selectedInvestmentAsset?.currency || 'EUR',
      cashAssetId: cashAssetId !== '__none__' ? cashAssetId : undefined,
      notes: notes.trim() || undefined,
    };

    if (editingId) {
      await updateInvestmentOperation(editingId, payload);
    } else {
      await createInvestmentOperation(user.uid, payload);
    }
    return true;
  };

  const handleSaveTransfer = async (): Promise<boolean> => {
    if (!user) return false;
    const parsedAmount = Number(transferAmount);
    const parsedFees = transferFees ? Number(transferFees) : 0;

    if (fromCashAssetId === '__none__' || toCashAssetId === '__none__') {
      toast.error('Seleziona conto di partenza e conto di arrivo');
      return false;
    }
    if (fromCashAssetId === toCashAssetId) {
      toast.error('I due conti devono essere diversi');
      return false;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast.error('Inserisci un importo valido');
      return false;
    }
    if (!Number.isFinite(parsedFees) || parsedFees < 0) {
      toast.error('Inserisci commissioni valide');
      return false;
    }

    const payload = {
      fromCashAssetId,
      toCashAssetId,
      amount: parsedAmount,
      fees: parsedFees,
      purpose: householdEnabled ? purpose : 'neutral_transfer',
      date: new Date(`${date}T00:00:00`),
      notes: notes.trim() || undefined,
    };

    if (editingId) {
      await updateInternalTransfer(editingId, payload);
    } else {
      await createInternalTransfer(user.uid, payload);
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!movementKind || movementKind === 'expense') return;

    try {
      setIsSaving(true);
      const saved = movementKind === 'investment'
        ? await handleSaveInvestment()
        : await handleSaveTransfer();
      if (!saved) return;
      await onSaved();
      toast.success(editingId ? 'Movimento aggiornato' : 'Movimento registrato');
      closeDialog();
    } catch (error) {
      console.error('Error saving movement:', error);
      toast.error(error instanceof Error ? error.message : 'Errore nel salvataggio del movimento');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? onOpenChange(true) : closeDialog())}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingMovement ? 'Modifica movimento' : 'Nuovo movimento'}</DialogTitle>
          <DialogDescription>
            Scegli il tipo e compila solo i campi necessari per quel movimento.
          </DialogDescription>
        </DialogHeader>

        {!movementKind ? (
          <div className="grid gap-3 desktop:grid-cols-3">
            {MOVEMENT_TYPE_CARDS.map(card => {
              const Icon = card.icon;
              return (
                <button
                  key={card.value}
                  type="button"
                  onClick={() => handleSelectKind(card.value)}
                  className="rounded-xl border p-4 text-left transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  <Icon className="mb-3 h-5 w-5" />
                  <p className="font-semibold">{card.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{card.description}</p>
                </button>
              );
            })}
          </div>
        ) : movementKind === 'investment' ? (
          <div className="grid gap-4 desktop:grid-cols-6 desktop:items-end">
            <div className="space-y-2 desktop:col-span-2">
              <Label>Asset</Label>
              <Select value={assetId} onValueChange={setAssetId} disabled={!!editingId}>
                <SelectTrigger><SelectValue placeholder="Seleziona asset" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Seleziona asset</SelectItem>
                  {investmentAssets.map(asset => (
                    <SelectItem key={asset.id} value={asset.id}>{asset.name} ({asset.ticker})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={investmentType} onValueChange={(value) => setInvestmentType(value as InvestmentOperationType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FORM_INVESTMENT_OPERATION_TYPES.map(operationType => (
                    <SelectItem key={operationType} value={operationType}>{INVESTMENT_OPERATION_LABELS[operationType]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Quote</Label>
              <Input type="number" min="0" step="0.0001" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Prezzo unitario</Label>
              <Input type="number" min="0" step="0.0001" value={pricePerUnit} onChange={(event) => setPricePerUnit(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Data</Label>
              <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </div>
            <div className="space-y-2 desktop:col-span-2">
              <Label>Conto cash collegato</Label>
              <Select value={cashAssetId} onValueChange={setCashAssetId}>
                <SelectTrigger><SelectValue placeholder="Nessun conto" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nessun conto</SelectItem>
                  {cashAssets.map(asset => (
                    <SelectItem key={asset.id} value={asset.id}>{asset.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Commissioni</Label>
              <Input type="number" min="0" step="0.01" value={investmentFees} onChange={(event) => setInvestmentFees(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Tasse</Label>
              <Input type="number" min="0" step="0.01" value={taxes} onChange={(event) => setTaxes(event.target.value)} />
            </div>
            <div className="space-y-2 desktop:col-span-2">
              <Label>Note</Label>
              <Input value={notes} onChange={(event) => setNotes(event.target.value)} />
            </div>
            {Number.isFinite(grossAmount) && grossAmount > 0 && (
              <p className="text-sm text-muted-foreground desktop:col-span-6">
                Controvalore lordo: {formatCurrency(grossAmount)}
              </p>
            )}
          </div>
        ) : (
          <div className="grid gap-4 desktop:grid-cols-6 desktop:items-end">
            <div className="space-y-2 desktop:col-span-2">
              <Label>Da conto</Label>
              <Select value={fromCashAssetId} onValueChange={setFromCashAssetId}>
                <SelectTrigger><SelectValue placeholder="Seleziona conto" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Seleziona conto</SelectItem>
                  {cashAssets.map(asset => (
                    <SelectItem key={asset.id} value={asset.id}>{asset.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 desktop:col-span-2">
              <Label>A conto</Label>
              <Select value={toCashAssetId} onValueChange={setToCashAssetId}>
                <SelectTrigger><SelectValue placeholder="Seleziona conto" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Seleziona conto</SelectItem>
                  {cashAssets.map(asset => (
                    <SelectItem key={asset.id} value={asset.id}>{asset.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Importo</Label>
              <Input type="number" min="0" step="0.01" value={transferAmount} onChange={(event) => setTransferAmount(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Data</Label>
              <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Commissioni</Label>
              <Input type="number" min="0" step="0.01" value={transferFees} onChange={(event) => setTransferFees(event.target.value)} />
            </div>
            {householdEnabled && (
              <div className="space-y-2 desktop:col-span-2">
                <Label>Tipo trasferimento</Label>
                <Select value={purpose} onValueChange={(value) => setPurpose(value as InternalTransferPurpose)}>
                  <SelectTrigger><SelectValue placeholder="Tipo trasferimento" /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(INTERNAL_TRANSFER_PURPOSE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2 desktop:col-span-4">
              <Label>Note</Label>
              <Input value={notes} onChange={(event) => setNotes(event.target.value)} />
            </div>
          </div>
        )}

        <DialogFooter>
          {movementKind && !editingMovement && (
            <Button type="button" variant="ghost" onClick={() => setMovementKind(null)} disabled={isSaving}>
              Cambia tipo
            </Button>
          )}
          <Button type="button" variant="outline" onClick={closeDialog} disabled={isSaving}>
            Annulla
          </Button>
          {movementKind && movementKind !== 'expense' && (
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={isSaving || (movementKind === 'investment' && investmentAssets.length === 0) || (movementKind === 'transfer' && cashAssets.length < 2)}
            >
              <Plus className="mr-2 h-4 w-4" />
              {editingId ? 'Aggiorna' : 'Registra'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * CHECKLIST: When adding new ExpenseType values:
 * 1. Update EXPENSE_TYPE_LABELS in types/expenses.ts
 * 2. Add color mapping in ExpenseCard.tsx badge colors
 * 3. Add dot color entry in TYPE_DOT_CLASS (above)
 * 4. Update typeOptions array in this file
 * 5. Add type validation in ExpenseDialog schema
 */
export function ExpenseTrackingTab({ allExpenses, categories, loading, onRefresh }: ExpenseTrackingTabProps) {
  const { user } = useAuth();
  const isDemo = useDemoMode();
  const queryClient = useQueryClient();
  const chartColors = useChartColors();
  const { data: assets = [] } = useAssets(user?.uid);
  const { data: investmentOperations = [] } = useInvestmentOperations(user?.uid);
  const { data: internalTransfers = [] } = useInternalTransfers(user?.uid);
  const {
    householdConfig,
    householdEnabled,
    options: householdScopeOptions,
    selectedScopeKey,
    setSelectedScopeKey,
    scope,
  } = useHouseholdScopeFilter(user?.uid);
  const currentYear = new Date().getFullYear();
  const currentMonth = String(new Date().getMonth() + 1); // 1-based month (1-12)
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [movementDialogOpen, setMovementDialogOpen] = useState(false);
  const [editingMovement, setEditingMovement] = useState<UnifiedMovement | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [filtersOpen, setFiltersOpen] = useState<boolean>(false);

  // 2-click inline delete state
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const pendingDeleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // AlertDialog for bulk delete (installments / recurring)
  const [bulkDeleteDialog, setBulkDeleteDialog] = useState<{
    open: boolean;
    expense: Expense | null;
    mode: 'installment' | 'recurring' | null;
  }>({ open: false, expense: null, mode: null });

  // Separate state for each filter level enables independent reset logic.
  // Single state object would complicate cascading resets (Type → Category → Subcategory).
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [selectedSubCategoryId, setSelectedSubCategoryId] = useState<string>('all');

  // Search states for comboboxes
  const [searchQueryType, setSearchQueryType] = useState<string>('');
  const [searchQueryCategory, setSearchQueryCategory] = useState<string>('');
  const [searchQuerySubCategory, setSearchQuerySubCategory] = useState<string>('');

  // Dropdown open states
  const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const [isSubCategoryDropdownOpen, setIsSubCategoryDropdownOpen] = useState(false);

  /**
   * Refs for click-outside detection on custom dropdowns
   *
   * Pattern: Listen for document mousedown, check if click target is outside ref
   * Why mousedown? Fires before blur, prevents race condition with item selection
   * See useEffect at line ~192 for implementation
   */
  const typeDropdownRef = useRef<HTMLDivElement>(null);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);
  const subCategoryDropdownRef = useRef<HTMLDivElement>(null);

  const attributionScopedExpenses = useMemo(
    () => filterExpensesByAttributionScope(allExpenses, householdConfig, scope),
    [allExpenses, householdConfig, scope]
  );

  const scopedInvestmentOperations = useMemo(
    () => filterInvestmentOperationsByOwnershipScope(investmentOperations, assets, householdConfig, scope),
    [assets, householdConfig, investmentOperations, scope]
  );

  const scopedInternalTransfers = useMemo(
    () => filterInternalTransfersByOwnershipScope(internalTransfers, assets, householdConfig, scope),
    [assets, householdConfig, internalTransfers, scope]
  );

  // Generate available years from ALL expenses (not filtered)
  const availableYears = useMemo(() => {
    if (attributionScopedExpenses.length === 0) return [];

    const years = attributionScopedExpenses.map(expense => {
      const date = expense.date instanceof Date ? expense.date : expense.date.toDate();
      return date.getFullYear();
    });

    const uniqueYears = Array.from(new Set(years)).sort((a, b) => b - a);
    return uniqueYears;
  }, [attributionScopedExpenses]);

  const handleYearChange = (year: number) => {
    setSelectedYear(year);
    // Reset month when changing year
    setSelectedMonth('all');
  };

  const handleCurrentMonth = () => {
    setSelectedYear(currentYear);
    setSelectedMonth(currentMonth);
  };

  /**
   * Cascading filter reset handler
   *
   * Reset Rules:
   * - Close dropdown (user made selection)
   * - Clear search query
   * - Reset downstream filters (Category + Subcategory)
   *
   * Why? Prevents invalid combinations when Type changes.
   * Example: User selects Type="fixed" → Category="rent" → Subcategory="mortgage"
   *          Then changes Type to "income"
   *          Result: Category and Subcategory reset (income has different categories)
   */
  const handleSelectType = (type: string) => {
    setSelectedType(type);
    setIsTypeDropdownOpen(false);
    setSearchQueryType('');
    // Reset category and subcategory when type changes
    setSelectedCategoryId('all');
    setSelectedSubCategoryId('all');
  };

  const handleSelectCategory = (categoryId: string) => {
    setSelectedCategoryId(categoryId);
    setIsCategoryDropdownOpen(false);
    setSearchQueryCategory('');
    // Reset subcategory when category changes
    setSelectedSubCategoryId('all');
  };

  const handleSelectSubCategory = (subCategoryId: string) => {
    setSelectedSubCategoryId(subCategoryId);
    setIsSubCategoryDropdownOpen(false);
    setSearchQuerySubCategory('');
  };

  const handleResetFilters = () => {
    setSelectedMonth('all');
    setSelectedType('all');
    setSelectedCategoryId('all');
    setSelectedSubCategoryId('all');
    setSearchQueryType('');
    setSearchQueryCategory('');
    setSearchQuerySubCategory('');
    setSelectedScopeKey('__all__');
  };

  // Clearing Type also clears dependent filters AND their search queries.
  // Prevents "phantom selections" where UI shows "all" but search input
  // retains previous query text.
  const handleClearType = () => {
    setSelectedType('all');
    setSelectedCategoryId('all');
    setSelectedSubCategoryId('all');
    setSearchQueryType('');
    setSearchQueryCategory('');
    setSearchQuerySubCategory('');
  };

  const handleClearCategory = () => {
    setSelectedCategoryId('all');
    setSelectedSubCategoryId('all');
    setSearchQueryCategory('');
    setSearchQuerySubCategory('');
  };

  const handleClearSubCategory = () => {
    setSelectedSubCategoryId('all');
    setSearchQuerySubCategory('');
  };

  // Check if any filter is active
  const hasActiveFilters =
    selectedMonth !== 'all' ||
    selectedType !== 'all' ||
    selectedCategoryId !== 'all' ||
    selectedSubCategoryId !== 'all' ||
    selectedScopeKey !== '__all__';

  // Derive year+month slice from allExpenses synchronously — no extra render on filter change.
  const expenses = useMemo(() => {
    return attributionScopedExpenses.filter(expense => {
      const date = expense.date instanceof Date ? expense.date : expense.date.toDate();
      const expenseYear = date.getFullYear();
      const expenseMonth = date.getMonth() + 1; // 1-based

      if (expenseYear !== selectedYear) return false;
      if (selectedMonth !== 'all' && expenseMonth !== parseInt(selectedMonth)) return false;

      return true;
    });
  }, [attributionScopedExpenses, selectedYear, selectedMonth]);

  // Cleanup pending delete timer on unmount
  useEffect(() => {
    return () => {
      if (pendingDeleteTimerRef.current) clearTimeout(pendingDeleteTimerRef.current);
    };
  }, []);

  /**
   * Click-outside handler for custom dropdowns
   *
   * Why mousedown instead of click?
   * - mousedown fires before blur events
   * - Prevents race condition where blur closes dropdown before click registers
   *
   * Memory Management: Return cleanup function removes listener on unmount
   */
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (typeDropdownRef.current && !typeDropdownRef.current.contains(event.target as Node)) {
        setIsTypeDropdownOpen(false);
      }
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(event.target as Node)) {
        setIsCategoryDropdownOpen(false);
      }
      if (subCategoryDropdownRef.current && !subCategoryDropdownRef.current.contains(event.target as Node)) {
        setIsSubCategoryDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Toggling another row collapses the previously expanded one (accordion pattern).


  const handleAddExpense = () => {
    setEditingExpense(null);
    setDialogOpen(true);
  };

  const handleAddMovement = () => {
    setEditingMovement(null);
    setMovementDialogOpen(true);
  };

  const handleEditExpense = (expense: Expense) => {
    setEditingExpense(expense);
    setDialogOpen(true);
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setEditingExpense(null);
  };

  const handleSuccess = async () => {
    // Trigger parent refresh (re-fetch all data)
    await onRefresh();
  };

  const refreshMovementData = async () => {
    if (user) {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(user.uid) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.assets.operations(user.uid) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.assets.realized(user.uid) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.assets.transfers(user.uid) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.overview(user.uid) }),
      ]);
    }
    await onRefresh();
  };

  const handleEditMovement = (movement: UnifiedMovement) => {
    if (movement.kind === 'expense') {
      handleEditExpense(movement.source);
      return;
    }

    setEditingMovement(movement);
    setMovementDialogOpen(true);
  };

  const handleDeleteMovement = async (movement: UnifiedMovement) => {
    if (movement.kind === 'expense') {
      handleDeleteExpense(movement.source);
      return;
    }

    try {
      if (movement.kind === 'investment') {
        await deleteInvestmentOperation(movement.source.id);
        toast.success('Operazione eliminata');
      } else {
        await deleteInternalTransfer(movement.source.id);
        toast.success('Trasferimento eliminato');
      }
      await refreshMovementData();
    } catch (error) {
      console.error('Error deleting movement:', error);
      toast.error(error instanceof Error ? error.message : 'Errore nell eliminazione del movimento');
    }
  };

  /**
   * 2-click inline delete: first click arms the button (3s disarm timer),
   * second click executes. For installments/recurring, opens AlertDialog
   * so the user can choose between single or bulk delete.
   */
  const handleDeleteExpense = (expense: Expense) => {
    const isComplex = (expense.isInstallment && expense.installmentParentId) ||
      (expense.isRecurring && expense.recurringParentId);

    if (isComplex) {
      // Open AlertDialog for bulk delete choice
      const mode = expense.isInstallment ? 'installment' : 'recurring';
      setBulkDeleteDialog({ open: true, expense, mode });
      return;
    }

    // 2-click inline for regular expenses
    if (pendingDeleteId === expense.id) {
      // Second click: confirm
      if (pendingDeleteTimerRef.current) clearTimeout(pendingDeleteTimerRef.current);
      setPendingDeleteId(null);
      void deleteSingleExpense(expense);
    } else {
      // First click: arm
      if (pendingDeleteTimerRef.current) clearTimeout(pendingDeleteTimerRef.current);
      setPendingDeleteId(expense.id);
      pendingDeleteTimerRef.current = setTimeout(() => {
        setPendingDeleteId(null);
      }, 3000);
    }
  };

  async function deleteSingleExpense(expense: Expense) {
    try {
      // Reverse the balance effect on the linked cash asset before deleting
      if (expense.linkedCashAssetId && !expense.investmentOperationId) {
        await updateCashAssetBalance(expense.linkedCashAssetId, -expense.amount);
        if (user) queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(user.uid) });
      }
      if (expense.investmentOperationId) {
        await deleteInvestmentOperation(expense.investmentOperationId);
        if (user) {
          queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(user.uid) });
          queryClient.invalidateQueries({ queryKey: queryKeys.assets.operations(user.uid) });
          queryClient.invalidateQueries({ queryKey: queryKeys.assets.realized(user.uid) });
        }
      } else if (expense.linkedInvestmentAssetId && expense.linkedInvestmentQuantityDelta) {
        await updateInvestmentAssetQuantity(expense.linkedInvestmentAssetId, -expense.linkedInvestmentQuantityDelta);
        if (user) queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(user.uid) });
      }
      const { deleteExpense } = await import('@/lib/services/expenseService');
      await deleteExpense(expense.id);
      toast.success('Voce eliminata con successo');
      await onRefresh();
    } catch (error) {
      console.error('Error deleting expense:', error);
      toast.error("Errore nell'eliminazione della voce");
    }
  }

  const deleteAllRecurringExpenses = async (recurringParentId: string) => {
    try {
      // Reverse balance effects before bulk-deleting (only the first entry stores linkedCashAssetId)
      const seriesExpenses = await getExpensesByRecurringParentId(recurringParentId);
      for (const exp of seriesExpenses) {
        if (exp.linkedCashAssetId && !exp.investmentOperationId) {
          await updateCashAssetBalance(exp.linkedCashAssetId, -exp.amount);
        }
        if (exp.investmentOperationId) {
          await deleteInvestmentOperation(exp.investmentOperationId);
        } else if (exp.linkedInvestmentAssetId && exp.linkedInvestmentQuantityDelta) {
          await updateInvestmentAssetQuantity(exp.linkedInvestmentAssetId, -exp.linkedInvestmentQuantityDelta);
        }
      }
      if (user && seriesExpenses.some(e => e.linkedCashAssetId || e.linkedInvestmentAssetId || e.investmentOperationId)) {
        queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(user.uid) });
        queryClient.invalidateQueries({ queryKey: queryKeys.assets.operations(user.uid) });
        queryClient.invalidateQueries({ queryKey: queryKeys.assets.realized(user.uid) });
      }
      const { deleteRecurringExpenses } = await import('@/lib/services/expenseService');
      await deleteRecurringExpenses(recurringParentId);
      toast.success('Tutte le voci ricorrenti sono state eliminate');
      await onRefresh();
    } catch (error) {
      console.error('Error deleting recurring expenses:', error);
      toast.error("Errore nell'eliminazione delle voci ricorrenti");
    }
  };

  const deleteAllInstallmentExpenses = async (installmentParentId: string) => {
    try {
      // Reverse balance effects before bulk-deleting (only the first installment stores linkedCashAssetId)
      const seriesExpenses = await getExpensesByInstallmentParentId(installmentParentId);
      for (const exp of seriesExpenses) {
        if (exp.linkedCashAssetId && !exp.investmentOperationId) {
          await updateCashAssetBalance(exp.linkedCashAssetId, -exp.amount);
        }
        if (exp.investmentOperationId) {
          await deleteInvestmentOperation(exp.investmentOperationId);
        } else if (exp.linkedInvestmentAssetId && exp.linkedInvestmentQuantityDelta) {
          await updateInvestmentAssetQuantity(exp.linkedInvestmentAssetId, -exp.linkedInvestmentQuantityDelta);
        }
      }
      if (user && seriesExpenses.some(e => e.linkedCashAssetId || e.linkedInvestmentAssetId || e.investmentOperationId)) {
        queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(user.uid) });
        queryClient.invalidateQueries({ queryKey: queryKeys.assets.operations(user.uid) });
        queryClient.invalidateQueries({ queryKey: queryKeys.assets.realized(user.uid) });
      }
      const { deleteInstallmentExpenses } = await import('@/lib/services/expenseService');
      await deleteInstallmentExpenses(installmentParentId);
      toast.success('Tutte le rate sono state eliminate');
      await onRefresh();
    } catch (error) {
      console.error('Error deleting installment expenses:', error);
      toast.error("Errore nell'eliminazione delle rate");
    }
  };

  // Filter options for Type
  const typeOptions = useMemo(() => {
    const types = [
      { value: 'all', label: 'Tutte' },
      { value: 'income', label: EXPENSE_TYPE_LABELS.income },
      { value: 'fixed', label: EXPENSE_TYPE_LABELS.fixed },
      { value: 'variable', label: EXPENSE_TYPE_LABELS.variable },
      { value: 'debt', label: EXPENSE_TYPE_LABELS.debt },
      { value: 'investment', label: 'Investimento' },
      { value: 'transfer', label: 'Trasferimento' },
    ];

    if (!searchQueryType.trim()) {
      return types;
    }

    const query = searchQueryType.toLowerCase();
    return types.filter(type => type.label.toLowerCase().includes(query));
  }, [searchQueryType]);

  // Filter options for Category based on selected type
  const categoryOptions = useMemo(() => {
    // Only ordinary cashflow types have categories; special movement types keep their own fields.
    if (selectedType === 'all' || selectedType === 'investment' || selectedType === 'transfer') {
      return [];
    }

    let filtered = categories.filter(cat => cat.type === selectedType);

    // Filter by search query
    if (searchQueryCategory.trim()) {
      const query = searchQueryCategory.toLowerCase();
      filtered = filtered.filter(cat => cat.name.toLowerCase().includes(query));
    }

    return filtered;
  }, [categories, selectedType, searchQueryCategory]);

  // Filter options for Subcategory based on selected category
  const subCategoryOptions = useMemo(() => {
    // Only show subcategories if a specific category is selected
    if (selectedCategoryId === 'all') {
      return [];
    }

    // Show subcategories only from selected category
    const selectedCategory = categories.find(cat => cat.id === selectedCategoryId);
    if (!selectedCategory) return [];

    let filtered = selectedCategory.subCategories.map(sub => ({
      ...sub,
      categoryName: selectedCategory.name,
      categoryId: selectedCategory.id,
    }));

    if (searchQuerySubCategory.trim()) {
      const query = searchQuerySubCategory.toLowerCase();
      filtered = filtered.filter(sub => sub.name.toLowerCase().includes(query));
    }

    return filtered;
  }, [categories, selectedCategoryId, searchQuerySubCategory]);

  /**
   * Cumulative AND filtering (progressive narrowing)
   *
   * Filter Logic: All active filters must match
   * - Type filter (if not "all") AND
   * - Category filter (if Type selected) AND
   * - Subcategory filter (if Category selected)
   *
   * Why AND (not OR)?
   * - OR would show too many results: Type="income" OR Category="groceries"
   * - AND progressively narrows: Type="income" AND Category="salary"
   *
   * Dependency Guards: Category only applies if Type selected (line 448)
   * This prevents filtering by Category when Type="all" (nonsensical combination).
   */
  const filteredExpenses = useMemo(() => {
    if (selectedType === 'investment' || selectedType === 'transfer') {
      return [];
    }

    let filtered = [...expenses];

    // Filter by ordinary cashflow type
    if (selectedType !== 'all') {
      filtered = filtered.filter(expense => expense.type === selectedType);
    }

    // Filter by category (only if a type is selected)
    if (selectedType !== 'all' && selectedCategoryId !== 'all') {
      filtered = filtered.filter(expense => expense.categoryId === selectedCategoryId);
    }

    // Filter by subcategory (only if a type and category are selected)
    if (selectedType !== 'all' && selectedCategoryId !== 'all' && selectedSubCategoryId !== 'all') {
      filtered = filtered.filter(expense => expense.subCategoryId === selectedSubCategoryId);
    }

    return filtered;
  }, [expenses, selectedType, selectedCategoryId, selectedSubCategoryId]);

  const unifiedMovements = useMemo<UnifiedMovement[]>(() => {
    const matchesPeriod = (dateLike: Parameters<typeof toDate>[0]) => {
      const date = toDate(dateLike);
      if (date.getFullYear() !== selectedYear) return false;
      return selectedMonth === 'all' || date.getMonth() + 1 === parseInt(selectedMonth);
    };

    const expenseMovements: UnifiedMovement[] = filteredExpenses.map(expense => ({
      id: `expense-${expense.id}`,
      kind: 'expense',
      date: toDate(expense.date),
      title: expense.categoryName,
      subtitle: [
        EXPENSE_TYPE_LABELS[expense.type],
        expense.subCategoryName,
        expense.linkedCashAssetId ? 'conto cash collegato' : undefined,
      ].filter(Boolean).join(' · '),
      amount: expense.amount,
      source: expense,
    }));

    const operationMovements: UnifiedMovement[] = (selectedType === 'all' || selectedType === 'investment' ? scopedInvestmentOperations : [])
      .filter(operation => matchesPeriod(operation.date))
      .map(operation => ({
        id: `investment-${operation.id}`,
        kind: 'investment',
        date: toDate(operation.date),
        title: `${operation.type === 'sell' ? 'Vendita' : 'Acquisto'} ${operation.assetName}`,
        subtitle: [
          `${operation.quantity} quote a ${formatCurrency(operation.pricePerUnit)}`,
          operation.cashAssetName ? `conto ${operation.cashAssetName}` : operation.cashAssetId ? 'conto cash collegato' : 'senza conto cash',
          operation.fees > 0 ? `commissioni ${formatCurrency(operation.fees)}` : undefined,
          operation.taxes > 0 ? `tasse ${formatCurrency(operation.taxes)}` : undefined,
        ].filter(Boolean).join(' · '),
        amount: operation.netCashEffect,
        source: operation,
      }));

    const transferMovements: UnifiedMovement[] = (selectedType === 'all' || selectedType === 'transfer' ? scopedInternalTransfers : [])
      .filter(transfer => matchesPeriod(transfer.date))
      .map(transfer => ({
        id: `transfer-${transfer.id}`,
        kind: 'transfer',
        date: toDate(transfer.date),
        title: `${transfer.fromCashAssetName} -> ${transfer.toCashAssetName}`,
        subtitle: [
          'Trasferimento interno',
          transfer.fees && transfer.fees > 0 ? `commissioni ${formatCurrency(transfer.fees)}` : undefined,
          transfer.notes,
        ].filter(Boolean).join(' · '),
        amount: 0,
        source: transfer,
      }));

    return [...expenseMovements, ...operationMovements, ...transferMovements]
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [filteredExpenses, scopedInternalTransfers, scopedInvestmentOperations, selectedMonth, selectedType, selectedYear]);

  // Calculate totals from filtered expenses
  const totalIncome = calculateTotalIncome(filteredExpenses);
  const totalExpenses = calculateTotalExpenses(filteredExpenses);
  const netBalance = calculateNetBalance(filteredExpenses);
  const incomeExpenseRatio = calculateIncomeExpenseRatio(filteredExpenses);

  // ─── Hero card derived data ──────────────────────────────────────────────────

  // Header label for the hero card: "MAGGIO 2026" when month selected, else "2026".
  const heroLabel = useMemo(() => {
    if (selectedMonth !== 'all')
      return `${MONTHS.find(m => m.value === selectedMonth)?.label.toUpperCase()} ${selectedYear}`;
    return String(selectedYear);
  }, [selectedYear, selectedMonth]);

  // Expenses of the period immediately preceding the selected month.
  // Used to compute MoM delta — only available when a specific month is selected.
  const previousPeriodExpenses = useMemo(() => {
    if (selectedMonth === 'all') return null;
    const prevMonthNum = parseInt(selectedMonth) - 1;
    const prevYear = prevMonthNum === 0 ? selectedYear - 1 : selectedYear;
    const prevMonth = prevMonthNum === 0 ? 12 : prevMonthNum;
    return allExpenses.filter(e => {
      const date = getExpenseDate(e.date);
      return date.getFullYear() === prevYear && date.getMonth() + 1 === prevMonth;
    });
  }, [allExpenses, selectedYear, selectedMonth]);

  // MoM delta for income and expenses — null when viewing full year (no comparison).
  const heroDelta = useMemo(() => {
    if (!previousPeriodExpenses) return null;
    const prevIncome = calculateTotalIncome(previousPeriodExpenses);
    const prevExpenses = calculateTotalExpenses(previousPeriodExpenses);
    const calcDelta = (curr: number, prev: number) =>
      prev > 0 ? ((curr - prev) / prev) * 100 : 0;
    return {
      income: calcDelta(totalIncome, prevIncome),
      expenses: calcDelta(totalExpenses, prevExpenses),
    };
  }, [previousPeriodExpenses, totalIncome, totalExpenses]);

  // Savings rate as a percentage of income (shown in RISPARMIO chip).
  const heroSavingsRate = useMemo(() => {
    if (totalIncome <= 0) return 0;
    return Math.round(((totalIncome - totalExpenses) / totalIncome) * 100);
  }, [totalIncome, totalExpenses]);

  // Top-5 expense categories aggregated from filteredExpenses for the hero bar chart.
  const heroExpenseCategories = useMemo(() => {
    const items = filteredExpenses.filter(e => e.type !== 'income');
    const total = items.reduce((s, e) => s + Math.abs(e.amount), 0);
    const byCategory = new Map<string, number>();
    for (const e of items)
      byCategory.set(e.categoryName, (byCategory.get(e.categoryName) ?? 0) + Math.abs(e.amount));
    return Array.from(byCategory.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([category, amount]) => ({
        category,
        amount,
        percentage: total > 0 ? (amount / total) * 100 : 0,
      }));
  }, [filteredExpenses]);

  // Top-5 income categories aggregated from filteredExpenses for the hero bar chart.
  const heroIncomeCategories = useMemo(() => {
    const items = filteredExpenses.filter(e => e.type === 'income');
    const total = items.reduce((s, e) => s + Math.abs(e.amount), 0);
    const byCategory = new Map<string, number>();
    for (const e of items)
      byCategory.set(e.categoryName, (byCategory.get(e.categoryName) ?? 0) + Math.abs(e.amount));
    return Array.from(byCategory.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([category, amount]) => ({
        category,
        amount,
        percentage: total > 0 ? (amount / total) * 100 : 0,
      }));
  }, [filteredExpenses]);

  if (loading) {
    return (
      <div className="space-y-6">
        {/* Hero card skeleton */}
        <div className="rounded-2xl border p-[22px] space-y-4">
          <div className="h-3 w-36 bg-muted animate-pulse rounded" />
          <div className="grid grid-cols-2 desktop:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="bg-muted/40 rounded-xl p-3.5 space-y-2">
                <div className="h-2.5 w-14 bg-muted animate-pulse rounded" />
                <div className="h-6 w-24 bg-muted animate-pulse rounded" />
                <div className="h-2.5 w-20 bg-muted animate-pulse rounded" />
              </div>
            ))}
          </div>
        </div>
        {/* Filters skeleton */}
        <div className="rounded-lg border p-4">
          <div className="h-4 w-16 bg-muted animate-pulse rounded mb-3" />
          <div className="grid grid-cols-2 desktop:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map(i => <div key={i} className="h-9 bg-muted animate-pulse rounded" />)}
          </div>
        </div>
        {/* List skeleton — flat rows */}
        <div className="rounded-lg border p-4 divide-y divide-border">
          <div className="h-4 w-32 bg-muted animate-pulse rounded mb-4" />
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className="flex items-center gap-3 py-3">
              <div className="h-2 w-2 rounded-full bg-muted animate-pulse flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-36 bg-muted animate-pulse rounded" />
                <div className="h-2.5 w-24 bg-muted animate-pulse rounded" />
              </div>
              <div className="h-3 w-16 bg-muted animate-pulse rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Desktop "Nuovo movimento" button — mobile uses FAB below */}
      <div className="hidden desktop:flex justify-end">
        <Button onClick={handleAddMovement} disabled={isDemo} title={isDemo ? 'Non disponibile in modalità demo' : undefined}>
          <Plus className="mr-2 h-4 w-4" />
          Nuovo movimento
        </Button>
      </div>

      {/* Mobile FAB */}
      <Button
        onClick={handleAddMovement}
        disabled={isDemo}
        className="fixed bottom-24 right-4 z-40 h-14 w-14 rounded-full shadow-lg desktop:hidden"
        aria-label="Nuovo movimento"
      >
        <Plus className="h-6 w-6" />
      </Button>

      {/* ── Hero Cashflow Card ─────────────────────────────────────────────── */}
      {/* Mirrors the cashflow card in the Overview/Panoramica page, but driven  */}
      {/* by filteredExpenses (honours the active time + hierarchy filters).      */}
      <Card className="rounded-2xl">
        <CardContent className="p-[22px]">
          {/* Header label: "MAGGIO 2026" or "2026" depending on filter state */}
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-3">
            Cashflow · {heroLabel}
          </p>

          {/* 4 KPI chips */}
          <div className="grid grid-cols-2 desktop:grid-cols-4 gap-3">
            {/* ENTRATE */}
            <div className="bg-muted/40 rounded-xl p-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground mb-1.5">
                Entrate
              </p>
              <p className="text-[22px] font-bold font-mono tabular-nums text-green-500 dark:text-green-400 leading-none">
                {cachedFormatCurrencyEUR(totalIncome, true)}
              </p>
              {heroDelta !== null && (() => {
                const pos = heroDelta.income >= 0;
                return (
                  <p className={cn('text-[12px] font-mono mt-1.5', pos ? 'text-green-500 dark:text-green-400' : 'text-red-500 dark:text-red-400')}>
                    {pos ? '+' : ''}{heroDelta.income.toFixed(1)}% vs mese scorso
                  </p>
                );
              })()}
            </div>

            {/* SPESE */}
            <div className="bg-muted/40 rounded-xl p-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground mb-1.5">
                Spese
              </p>
              <p className="text-[22px] font-bold font-mono tabular-nums text-red-500 dark:text-red-400 leading-none">
                {cachedFormatCurrencyEUR(totalExpenses, true)}
              </p>
              {heroDelta !== null && (() => {
                // For expenses: +% means spent more → red (inverted logic vs income).
                const pos = heroDelta.expenses >= 0;
                return (
                  <p className={cn('text-[12px] font-mono mt-1.5', pos ? 'text-red-500 dark:text-red-400' : 'text-green-500 dark:text-green-400')}>
                    {pos ? '+' : ''}{heroDelta.expenses.toFixed(1)}% vs mese scorso
                  </p>
                );
              })()}
            </div>

            {/* RISPARMIO */}
            <div className="bg-muted/40 rounded-xl p-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground mb-1.5">
                Risparmio
              </p>
              <p className={cn(
                'text-[22px] font-bold font-mono tabular-nums leading-none',
                netBalance >= 0 ? 'text-foreground' : 'text-red-500 dark:text-red-400',
              )}>
                {cachedFormatCurrencyEUR(netBalance, true)}
              </p>
              {totalIncome > 0 && (
                <p className="text-[12px] text-muted-foreground mt-1.5">
                  {heroSavingsRate}% del reddito
                </p>
              )}
            </div>

            {/* RAPPORTO */}
            <div className="bg-muted/40 rounded-xl p-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground mb-1.5">
                Rapporto
              </p>
              <p className="text-[22px] font-bold font-mono tabular-nums text-foreground leading-none">
                {incomeExpenseRatio !== null ? `${incomeExpenseRatio.toFixed(2)}×` : '—'}
              </p>
              {incomeExpenseRatio !== null && (
                <p className="text-[12px] text-muted-foreground mt-1.5">
                  {coverageHealthLabel(incomeExpenseRatio)}
                </p>
              )}
            </div>
          </div>

          {/* Category breakdowns — only shown when there is data */}
          {(heroExpenseCategories.length > 0 || heroIncomeCategories.length > 0) && (
            <>
              <div className="mt-4 border-t border-border" />
              <div className="grid desktop:grid-cols-2 gap-x-8 gap-y-4 mt-4">
                {/* Spese per categoria */}
                {heroExpenseCategories.length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground mb-3">
                      Spese per Categoria
                    </p>
                    <div className="space-y-3">
                      {heroExpenseCategories.map(cat => (
                        <div key={cat.category} className="space-y-1">
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2 min-w-0">
                              <div
                                className="w-2 h-2 rounded-full flex-shrink-0"
                                style={{ background: chartColors[0] || 'var(--chart-1)' }}
                              />
                              <span className="text-[13px] text-foreground truncate">{cat.category}</span>
                            </div>
                            <span className="text-[13px] font-mono tabular-nums text-foreground ml-3 flex-shrink-0">
                              {cachedFormatCurrencyEUR(cat.amount, true)}
                            </span>
                          </div>
                          <div className="h-[3px] bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${cat.percentage}%`, background: chartColors[0] || 'var(--chart-1)' }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Entrate per categoria */}
                {heroIncomeCategories.length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground mb-3">
                      Entrate per Categoria
                    </p>
                    <div className="space-y-3">
                      {heroIncomeCategories.map(cat => (
                        <div key={cat.category} className="space-y-1">
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2 min-w-0">
                              <div
                                className="w-2 h-2 rounded-full flex-shrink-0"
                                style={{ background: chartColors[1] || 'var(--chart-2)' }}
                              />
                              <span className="text-[13px] text-foreground truncate">{cat.category}</span>
                            </div>
                            <span className="text-[13px] font-mono tabular-nums text-foreground ml-3 flex-shrink-0">
                              {cachedFormatCurrencyEUR(cat.amount, true)}
                            </span>
                          </div>
                          <div className="h-[3px] bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${cat.percentage}%`, background: chartColors[1] || 'var(--chart-2)' }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Filters — includes year selector (integrated, not a separate card) */}
      <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
        <Card>
          <CardHeader>
            <CollapsibleTrigger asChild>
              <div className="flex items-center justify-between cursor-pointer w-full">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-base">Filtri</CardTitle>
                  {hasActiveFilters && (
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  )}
                </div>
                <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', filtersOpen && 'rotate-180')} />
              </div>
            </CollapsibleTrigger>
          </CardHeader>
          <CollapsibleContent>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 desktop:flex desktop:flex-wrap desktop:items-end desktop:gap-4">
                {/* Anno filter (integrated — replaces the separate Year card) */}
                {availableYears.length > 0 && (
                  <div className="flex flex-col gap-2 desktop:min-w-[110px]">
                    <label className="text-sm font-medium">Anno</label>
                    <div className="flex flex-wrap gap-1.5">
                      {availableYears.map(year => (
                        <Button
                          key={year}
                          variant={selectedYear === year ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => handleYearChange(year)}
                          className="h-8 px-3 text-sm"
                        >
                          {year}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Month Filter + current month quick button */}
                <div className="flex flex-col gap-2 desktop:min-w-[150px]">
                  <label className="text-sm font-medium">Mese</label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleziona mese" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Tutti</SelectItem>
                          {MONTHS.map(month => (
                            <SelectItem key={month.value} value={month.value}>{month.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button onClick={handleCurrentMonth} variant="secondary" size="default" className="shrink-0">
                      Corrente
                    </Button>
                  </div>
                </div>

                {/* Type Filter with Search */}
                <div className="flex flex-col gap-2 desktop:min-w-[150px]">
                  <Label htmlFor="type-combobox">Tipo</Label>
                  <div className="relative">
                    <Input
                      id="type-combobox"
                      placeholder="Cerca tipo..."
                      value={searchQueryType}
                      onChange={(e) => {
                        setSearchQueryType(e.target.value);
                        setIsTypeDropdownOpen(true);
                      }}
                      onFocus={() => setIsTypeDropdownOpen(true)}
                    />
                    {isTypeDropdownOpen && (
                      <div
                        ref={typeDropdownRef}
                        className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-60 overflow-auto text-popover-foreground"
                      >
                        {typeOptions.length === 0 ? (
                          <div className="p-3 text-sm text-muted-foreground text-center">
                            Nessun tipo trovato
                          </div>
                        ) : (
                          typeOptions.map((type) => (
                            <button
                              key={type.value}
                              type="button"
                              className={cn(
                                "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer text-left",
                                selectedType === type.value && "bg-accent text-accent-foreground"
                              )}
                              onClick={() => handleSelectType(type.value)}
                            >
                              <span className="flex-1">{type.label}</span>
                              {selectedType === type.value && (
                                <Check className="h-4 w-4 text-primary flex-shrink-0" />
                              )}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                  {selectedType !== 'all' && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-muted rounded-md border border-border">
                      <span className="text-sm font-medium">
                        {typeOptions.find(t => t.value === selectedType)?.label}
                      </span>
                      <button
                        type="button"
                        onClick={handleClearType}
                        className="ml-1 hover:bg-muted rounded-full p-0.5 transition-colors"
                        aria-label="Rimuovi filtro tipo"
                      >
                        <X className="h-3 w-3 text-muted-foreground" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Category Filter with Search */}
                <div className="flex flex-col gap-2 desktop:min-w-[150px]">
                  <Label htmlFor="category-combobox">Categoria</Label>
                  <div className="relative">
                    <Input
                      id="category-combobox"
                      placeholder={selectedType === 'all' ? 'Seleziona prima un tipo' : selectedType === 'investment' || selectedType === 'transfer' ? 'Non disponibile per questo tipo' : 'Cerca categoria...'}
                      value={searchQueryCategory}
                      onChange={(e) => {
                        setSearchQueryCategory(e.target.value);
                        setIsCategoryDropdownOpen(true);
                      }}
                      onFocus={() => setIsCategoryDropdownOpen(true)}
                      disabled={selectedType === 'all' || categoryOptions.length === 0}
                    />
                    {isCategoryDropdownOpen && selectedType !== 'all' && categoryOptions.length > 0 && (
                      <div
                        ref={categoryDropdownRef}
                        className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-60 overflow-auto text-popover-foreground"
                      >
                        {/* Always show "Tutte" option */}
                        <button
                          type="button"
                          className={cn(
                            "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer text-left",
                            selectedCategoryId === 'all' && "bg-accent text-accent-foreground"
                          )}
                          onClick={() => handleSelectCategory('all')}
                        >
                          <span className="flex-1">Tutte</span>
                          {selectedCategoryId === 'all' && (
                            <Check className="h-4 w-4 text-primary flex-shrink-0" />
                          )}
                        </button>
                        {categoryOptions.map((category) => (
                          <button
                            key={category.id}
                            type="button"
                            className={cn(
                              "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer text-left",
                              selectedCategoryId === category.id && "bg-accent text-accent-foreground"
                            )}
                            onClick={() => handleSelectCategory(category.id)}
                          >
                            {category.color && (
                              <div
                                className="w-3 h-3 rounded-full flex-shrink-0"
                                style={{ backgroundColor: category.color }}
                              />
                            )}
                            <span className="flex-1">{category.name}</span>
                            {selectedCategoryId === category.id && (
                              <Check className="h-4 w-4 text-primary flex-shrink-0" />
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {selectedCategoryId !== 'all' && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-muted rounded-md border border-border">
                      {categories.find(c => c.id === selectedCategoryId)?.color && (
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: categories.find(c => c.id === selectedCategoryId)?.color }}
                        />
                      )}
                      <span className="text-sm font-medium">
                        {categories.find(c => c.id === selectedCategoryId)?.name}
                      </span>
                      <button
                        type="button"
                        onClick={handleClearCategory}
                        className="ml-1 hover:bg-muted rounded-full p-0.5 transition-colors"
                        aria-label="Rimuovi filtro categoria"
                      >
                        <X className="h-3 w-3 text-muted-foreground" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Subcategory Filter with Search */}
                <div className="flex flex-col gap-2 desktop:min-w-[150px]">
                  <Label htmlFor="subcategory-combobox">Sottocategoria</Label>
                  <div className="relative">
                    <Input
                      id="subcategory-combobox"
                      placeholder={selectedCategoryId === 'all' ? 'Seleziona prima una categoria' : 'Cerca sottocategoria...'}
                      value={searchQuerySubCategory}
                      onChange={(e) => {
                        setSearchQuerySubCategory(e.target.value);
                        setIsSubCategoryDropdownOpen(true);
                      }}
                      onFocus={() => setIsSubCategoryDropdownOpen(true)}
                      disabled={selectedCategoryId === 'all' || subCategoryOptions.length === 0}
                    />
                    {isSubCategoryDropdownOpen && selectedCategoryId !== 'all' && subCategoryOptions.length > 0 && (
                      <div
                        ref={subCategoryDropdownRef}
                        className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-60 overflow-auto text-popover-foreground"
                      >
                        {/* Always show "Tutte" option */}
                        <button
                          type="button"
                          className={cn(
                            "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer text-left",
                            selectedSubCategoryId === 'all' && "bg-accent text-accent-foreground"
                          )}
                          onClick={() => handleSelectSubCategory('all')}
                        >
                          <span className="flex-1">Tutte</span>
                          {selectedSubCategoryId === 'all' && (
                            <Check className="h-4 w-4 text-primary flex-shrink-0" />
                          )}
                        </button>
                        {subCategoryOptions.map((subCategory) => (
                          <button
                            key={subCategory.id}
                            type="button"
                            className={cn(
                              "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer text-left",
                              selectedSubCategoryId === subCategory.id && "bg-accent text-accent-foreground"
                            )}
                            onClick={() => handleSelectSubCategory(subCategory.id)}
                          >
                            <span className="flex-1">{subCategory.name}</span>
                            {selectedSubCategoryId === subCategory.id && (
                              <Check className="h-4 w-4 text-primary flex-shrink-0" />
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {selectedSubCategoryId !== 'all' && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-muted rounded-md border border-border">
                      <span className="text-sm font-medium">
                        {subCategoryOptions.find(s => s.id === selectedSubCategoryId)?.name}
                      </span>
                      <button
                        type="button"
                        onClick={handleClearSubCategory}
                        className="ml-1 hover:bg-muted rounded-full p-0.5 transition-colors"
                        aria-label="Rimuovi filtro sottocategoria"
                      >
                        <X className="h-3 w-3 text-muted-foreground" />
                      </button>
                    </div>
                  )}
                </div>

                {householdEnabled && (
                  <HouseholdScopeSelect
                    value={selectedScopeKey}
                    onValueChange={setSelectedScopeKey}
                    options={householdScopeOptions}
                    label="Attribuzione"
                    className="desktop:min-w-[220px]"
                  />
                )}

                {/* Reset Filters Button */}
                {hasActiveFilters && (
                  <div className="flex items-end desktop:flex-none">
                    <Button
                      variant="outline"
                      onClick={handleResetFilters}
                      className="w-full desktop:w-auto"
                    >
                      Ripristina Filtri
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <Card>
        <CardHeader>
          <CardTitle>
            {selectedMonth !== 'all'
              ? `Tutti i movimenti di ${MONTHS.find(m => m.value === selectedMonth)?.label} ${selectedYear}`
              : `Tutti i movimenti del ${selectedYear}`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {unifiedMovements.length === 0 ? (
            <div className="rounded-md border border-dashed p-8 text-center">
              <p className="text-muted-foreground">Nessun movimento trovato</p>
            </div>
          ) : (
            <div className="space-y-3">
              {unifiedMovements.slice(0, 50).map(movement => (
                <div key={movement.id} className="flex flex-col gap-3 rounded-md border p-3 desktop:flex-row desktop:items-center desktop:justify-between">
                  <div className="flex min-w-0 gap-3">
                    <div className="mt-0.5 shrink-0">
                      {movement.kind === 'investment' ? (
                        <ChartCandlestick className="h-4 w-4 text-blue-600" />
                      ) : movement.kind === 'transfer' ? (
                        <ArrowRightLeft className="h-4 w-4 text-purple-600" />
                      ) : movement.amount >= 0 ? (
                        <TrendingUp className="h-4 w-4 text-green-600" />
                      ) : (
                        <TrendingDown className="h-4 w-4 text-red-600" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium">{movement.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {toDate(movement.date).toLocaleDateString('it-IT')}
                        {movement.subtitle ? ` · ${movement.subtitle}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3 desktop:justify-end">
                    <div className="text-right">
                      {movement.kind === 'transfer' ? (
                        <p className="font-semibold text-muted-foreground">Neutro</p>
                      ) : (
                        <p className={movement.amount >= 0 ? 'font-semibold text-green-600' : 'font-semibold text-red-600'}>
                          {formatCurrency(movement.amount)}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {movement.kind === 'investment' ? 'Investimento' : movement.kind === 'transfer' ? 'Trasferimento' : 'Cashflow'}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditMovement(movement)}
                      disabled={isDemo}
                      title={isDemo ? 'Non disponibile in modalità demo' : undefined}
                    >
                      Modifica
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteMovement(movement)}
                      disabled={isDemo}
                      title={isDemo ? 'Non disponibile in modalità demo' : 'Elimina movimento'}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
              {unifiedMovements.length > 50 && (
                <p className="text-sm text-muted-foreground text-center pt-2">
                  Visualizzati 50 di {unifiedMovements.length} movimenti. Usa i filtri temporali per ridurre i risultati.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <UnifiedMovementDialog
        open={movementDialogOpen}
        onOpenChange={(open) => {
          setMovementDialogOpen(open);
          if (!open) setEditingMovement(null);
        }}
        assets={assets}
        editingMovement={editingMovement}
        householdEnabled={householdEnabled}
        onCreateCashflow={handleAddExpense}
        onSaved={refreshMovementData}
      />

      {/* Expense Dialog */}
      <ExpenseDialog
        open={dialogOpen}
        onClose={handleDialogClose}
        expense={editingExpense}
        onSuccess={handleSuccess}
      />

      {/* Bulk delete AlertDialog — for installments and recurring expenses */}
      <AlertDialog
        open={bulkDeleteDialog.open}
        onOpenChange={(open) => {
          if (!open) setBulkDeleteDialog({ open: false, expense: null, mode: null });
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {bulkDeleteDialog.mode === 'installment' ? 'Elimina rata' : 'Elimina voce ricorrente'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {bulkDeleteDialog.mode === 'installment' && bulkDeleteDialog.expense
                ? `Questa è la rata ${bulkDeleteDialog.expense.installmentNumber}/${bulkDeleteDialog.expense.installmentTotal}. Vuoi eliminare solo questa rata o tutte le ${bulkDeleteDialog.expense.installmentTotal} rate?`
                : 'Questa è una voce ricorrente. Vuoi eliminare solo questa voce o tutte le occorrenze correlate?'
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => {
                if (bulkDeleteDialog.expense) void deleteSingleExpense(bulkDeleteDialog.expense);
                setBulkDeleteDialog({ open: false, expense: null, mode: null });
              }}
            >
              Solo questa
            </Button>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                const exp = bulkDeleteDialog.expense;
                if (!exp) return;
                if (bulkDeleteDialog.mode === 'installment' && exp.installmentParentId) {
                  void deleteAllInstallmentExpenses(exp.installmentParentId);
                } else if (bulkDeleteDialog.mode === 'recurring' && exp.recurringParentId) {
                  void deleteAllRecurringExpenses(exp.recurringParentId);
                }
                setBulkDeleteDialog({ open: false, expense: null, mode: null });
              }}
            >
              {bulkDeleteDialog.mode === 'installment'
                ? `Tutte le ${bulkDeleteDialog.expense?.installmentTotal ?? ''} rate`
                : 'Tutte le ricorrenti'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
