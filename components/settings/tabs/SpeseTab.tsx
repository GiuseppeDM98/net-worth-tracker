'use client';

/**
 * Impostazioni › Spese — in the left column the two settings the expense FORM reads (default
 * accounts, the transfer fee's category) and the «Ruoli 50/30/20» switch, then the CSV import
 * and the category inventory.
 *
 * A controlled view of the `spese` slice: `slice` in, `onChange(patch)` out. The categories are
 * NOT the slice's: a category is written where it is edited (the dialogs, the move and the delete
 * below, each invalidating the key every reader shares — `invalidateCategoryCaches`), so what
 * stays local here is dialog state and the list's live region. `CategoryRow` and the category
 * dialog read the DRAFT's `spendingRolesEnabled`, not the saved one: the switch on and not yet
 * saved already colours the badges and opens the role picker, and so it must stay (#400).
 */

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft, Edit, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tile, TILE_CELL_CLASS, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { ErrorNotice } from '@/components/ui/error-notice';
import { CategoryManagementDialog, invalidateCategoryCaches } from '@/components/expenses/CategoryManagementDialog';
import { CategoryDeleteConfirmDialog } from '@/components/expenses/CategoryDeleteConfirmDialog';
import { CategoryMoveDialog } from '@/components/expenses/CategoryMoveDialog';
import { LAZY_CATEGORY_ICONS } from '@/components/expenses/IconPickerPopover';
import ExpenseImportSection from '@/components/settings/ExpenseImportSection';
import { cn } from '@/lib/utils';
import { useArmedDelete } from '@/lib/hooks/useArmedDelete';
import { resolveCenteredModalOrigin } from '@/lib/utils/modalOrigin';
import { deleteCategory, getCategoryById } from '@/lib/services/expenseCategoryService';
import {
  clearExpensesCategoryAssignment,
  getExpenseCountByCategoryId,
  moveExpensesToCategory,
  reassignExpensesCategory,
  TransferBoundaryError,
} from '@/lib/services/expenseService';
import { describeReadFailure, type SurfaceState } from '@/lib/utils/statesNarrative';
import {
  describeDefaultAccounts,
  describeExpenseCategories,
  describeSpendingRolesSetting,
  describeTransferFeeCategory,
  summarizeExpenseCategories,
} from '@/lib/utils/settingsNarrative';
import { categoryRoleColor, summarizeCategoryClassification } from '@/lib/utils/spendingRoles';
import { NO_SELECTION, type SpeseSlice } from '@/lib/utils/settingsDraft';
import type { Asset } from '@/types/assets';
import { EXPENSE_TYPE_LABELS, type ExpenseCategory, type ExpenseType } from '@/types/expenses';
import { INTERACTIVE_CONTROL_CLASS, runGuarded, SettingsTabPanel } from './shared';

/** What a first press on a category's delete led to. */
type CategoryDeleteRequest = 'dialog' | 'arm' | 'failed';

interface CategoryRowProps {
  category: ExpenseCategory;
  onEdit: (category: ExpenseCategory) => void;
  onMove: (category: ExpenseCategory, triggerOrigin: string) => void;
  /**
   * The first press: a category WITH movements opens the reassignment dialog (which is its
   * confirmation), one without them arms the row — its second press deletes.
   */
  onRequestDelete: (category: ExpenseCategory, triggerOrigin: string) => Promise<CategoryDeleteRequest>;
  onConfirmDelete: (categoryId: string) => void;
  /** The list's one live region: arm and disarm are sentences, spoken there. */
  announce: (text: string) => void;
  /** With the 50/30/20 roles on, the badge wears the role, not the saved hue. */
  spendingRolesEnabled: boolean;
}

/**
 * One category of the Categorie tile. Module-level because the armed state of its delete lives
 * here (`useArmedDelete`: no timer — the 3-second auto-disarm this row used to have was a WCAG
 * 2.2.1 time limit and announced nothing); the button stays a compact «Conferma» and the ROW
 * prints what the second press does (AGENTS.md → Accessibility).
 */
function CategoryRow({ category, onEdit, onMove, onRequestDelete, onConfirmDelete, announce, spendingRolesEnabled }: CategoryRowProps) {
  const deleteRef = useRef<HTMLButtonElement | null>(null);
  const { armed, onClick: onArmedClick, onBlur } = useArmedDelete(deleteRef, () => onConfirmDelete(category.id));
  const wasArmed = useRef(false);
  useEffect(() => {
    if (armed) {
      wasArmed.current = true;
      announce(`Premi di nuovo per eliminare ${category.name}`);
    } else if (wasArmed.current) {
      wasArmed.current = false;
      announce('Eliminazione annullata');
    }
  }, [armed, announce, category.name]);

  const handleDeleteClick = async (event: React.MouseEvent<HTMLButtonElement>) => {
    if (armed) {
      onArmedClick();
      return;
    }
    const origin = resolveCenteredModalOrigin(event.currentTarget.getBoundingClientRect());
    if ((await onRequestDelete(category, origin)) === 'arm') onArmedClick();
  };

  // A LOOKUP in the module-level map, never a call: a component obtained from a call during
  // render is a new type every render (`react-hooks/static-components`).
  const CatIcon = category.icon ? LAZY_CATEGORY_ICONS[category.icon] : undefined;
  const iconButtonClass = 'h-11 w-11 desktop:h-8 desktop:w-8';
  // With the roles on the badge reads as the classification at a glance; off, the saved hue as ever.
  const roleColor = categoryRoleColor(category, spendingRolesEnabled);
  const glyph = roleColor ?? (category.color || 'var(--muted-foreground)');
  const wash = roleColor
    ? `color-mix(in oklch, ${roleColor} 14%, transparent)`
    : category.color ? `${category.color}20` : 'var(--muted)';
  const dot = roleColor ?? (category.color || 'var(--chart-1)');

  return (
    <div className={cn('flex items-center justify-between gap-3 py-2.5 transition-colors', armed ? 'bg-destructive/5' : 'hover:bg-muted/30')}>
      <div className="flex min-w-0 items-center gap-3">
        <div
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: wash }}
        >
          {CatIcon ? (
            <Suspense fallback={<div className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: dot }} />}>
              <CatIcon className="h-3.5 w-3.5" style={{ color: glyph }} aria-hidden="true" />
            </Suspense>
          ) : (
            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: dot }} />
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium">{category.name}</p>
          {armed ? (
            <p className="text-[11px] leading-[1.4] text-destructive">Nessuna transazione la usa: «Conferma» la elimina.</p>
          ) : (
            category.subCategories.length > 0 && (
              <p className="truncate text-[11px] text-muted-foreground">
                {category.subCategories.length} {category.subCategories.length === 1 ? 'sottocategoria' : 'sottocategorie'}:{' '}
                {category.subCategories.map((sub) => sub.name).join(', ')}
              </p>
            )
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="icon" className={iconButtonClass} aria-label={`Modifica ${category.name}`} onClick={() => onEdit(category)}>
          <Edit className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={iconButtonClass}
          aria-label={`Sposta tutte le transazioni di ${category.name}`}
          onClick={(event) => onMove(category, resolveCenteredModalOrigin(event.currentTarget.getBoundingClientRect()))}
        >
          <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
        </Button>
        <Button
          ref={deleteRef}
          variant="ghost"
          size="sm"
          aria-label={armed ? `Conferma eliminazione di ${category.name}` : `Elimina ${category.name}`}
          className={cn('h-11 min-w-11 desktop:h-8 desktop:min-w-8', armed && 'text-destructive hover:bg-destructive/10 hover:text-destructive')}
          onClick={handleDeleteClick}
          onBlur={onBlur}
        >
          <Trash2 className={cn('h-4 w-4', !armed && 'text-muted-foreground')} />
          {armed && <span className="text-xs">Conferma</span>}
        </Button>
      </div>
    </div>
  );
}

export interface SpeseTabProps {
  slice: SpeseSlice;
  onChange: (patch: Partial<SpeseSlice>) => void;
  /** Whose categories the dialogs, the move and the delete write; `undefined` refuses them. */
  ownerId: string | undefined;
  expenseCategories: ExpenseCategory[];
  categoriesState: SurfaceState;
  /** «Riprova» and the re-read after a write here: the invalidation of the categories key. */
  onRetryCategories: () => Promise<void> | void;
  /** The settlement accounts (type AND class `cash`). */
  cashAssets: Asset[];
  accountsState: SurfaceState;
  onRetryAccounts: () => void;
  /** After a CSV import: the page invalidates what Cashflow reads. */
  onExpenseImported: () => void;
}

export function SpeseTab({
  slice,
  onChange,
  ownerId,
  expenseCategories,
  categoriesState,
  onRetryCategories,
  cashAssets,
  accountsState,
  onRetryAccounts,
  onExpenseImported,
}: SpeseTabProps) {
  const queryClient = useQueryClient();
  const { defaultDebitCashAssetId, defaultCreditCashAssetId, transferFeeCategoryId, transferFeeSubCategoryId, spendingRolesEnabled } = slice;

  // Dialog state — ephemeral, the view's own.
  const [categoryAnnouncement, setCategoryAnnouncement] = useState('');
  const announceCategory = useCallback((text: string) => setCategoryAnnouncement(text), []);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ExpenseCategory | null>(null);
  const [deleteConfirmDialogOpen, setDeleteConfirmDialogOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<ExpenseCategory | null>(null);
  const [expenseCountToReassign, setExpenseCountToReassign] = useState(0);
  const [deleteDialogOrigin, setDeleteDialogOrigin] = useState<string | undefined>(undefined);
  const [moveCategoryDialogOpen, setMoveCategoryDialogOpen] = useState(false);
  const [categoryToMove, setCategoryToMove] = useState<ExpenseCategory | null>(null);
  const [expenseCountToMove, setExpenseCountToMove] = useState(0);
  const [moveDialogOrigin, setMoveDialogOrigin] = useState<string | undefined>(undefined);

  const getCategoriesByType = (type: ExpenseType): ExpenseCategory[] => expenseCategories.filter((cat) => cat.type === type);
  const debitAccount = cashAssets.find((a) => a.id === defaultDebitCashAssetId);
  const creditAccount = cashAssets.find((a) => a.id === defaultCreditCashAssetId);
  const categoryCounts = summarizeExpenseCategories(expenseCategories);
  const categoryClassification = summarizeCategoryClassification(expenseCategories);
  const transferFeeCategory = expenseCategories.find((cat) => cat.id === transferFeeCategoryId);
  const transferFeeSubCategory = transferFeeCategory?.subCategories.find((sub) => sub.id === transferFeeSubCategoryId);

  const handleAddExpenseCategory = () => {
    setEditingCategory(null);
    setCategoryDialogOpen(true);
  };

  const handleEditExpenseCategory = (category: ExpenseCategory) => {
    setEditingCategory(category);
    setCategoryDialogOpen(true);
  };

  // The first press on a category's delete. With movements the reassignment dialog IS the
  // confirmation; without them the row arms itself (CategoryRow) and deletes at the second press.
  const requestCategoryDelete = async (category: ExpenseCategory, triggerOrigin: string): Promise<CategoryDeleteRequest> => {
    if (!ownerId) return 'failed';

    try {
      const expenseCount = await getExpenseCountByCategoryId(category.id, ownerId);
      if (expenseCount === 0) return 'arm';

      const fresh = await getCategoryById(category.id);
      if (!fresh) return 'failed';
      setCategoryToDelete(fresh);
      setExpenseCountToReassign(expenseCount);
      setDeleteDialogOrigin(triggerOrigin);
      setDeleteConfirmDialogOpen(true);
      return 'dialog';
    } catch (error) {
      console.error('Error deleting category:', error);
      toast.error("Errore nell'eliminazione della categoria");
      return 'failed';
    }
  };

  const closeDeleteDialog = () => {
    setDeleteConfirmDialogOpen(false);
    setCategoryToDelete(null);
    setExpenseCountToReassign(0);
    setDeleteDialogOrigin(undefined);
  };

  const handleConfirmDeleteWithReassignment = async (newCategoryId?: string, newSubCategoryId?: string) => {
    if (!categoryToDelete || !ownerId) return;

    await runGuarded(async () => {
      if (!newCategoryId) {
        // No destination: the rows go to «Senza categoria», then the category goes.
        const clearedCount = await clearExpensesCategoryAssignment(categoryToDelete.id, ownerId);
        await deleteCategory(categoryToDelete.id);

        toast.success(
          `Categoria "${categoryToDelete.name}" eliminata con successo. ${clearedCount} ${clearedCount === 1 ? 'spesa contrassegnata' : 'spese contrassegnate'} come "Senza categoria".`
        );

        closeDeleteDialog();
        invalidateCategoryCaches(queryClient, ownerId, { rowsChanged: true });
        await onRetryCategories();
        return;
      }

      const newCategory = await getCategoryById(newCategoryId);
      if (!newCategory) {
        toast.error('Categoria di destinazione non trovata');
        return;
      }

      let newSubCategoryName: string | undefined;
      if (newSubCategoryId) {
        newSubCategoryName = newCategory.subCategories.find((sub) => sub.id === newSubCategoryId)?.name;
      }

      const reassignedCount = await reassignExpensesCategory(
        categoryToDelete.id,
        newCategoryId,
        newCategory.name,
        ownerId,
        newSubCategoryId,
        newSubCategoryName
      );
      await deleteCategory(categoryToDelete.id);

      toast.success(
        `${reassignedCount} ${reassignedCount === 1 ? 'spesa riassegnata' : 'spese riassegnate'} a "${newCategory.name}" e categoria eliminata con successo`
      );

      closeDeleteDialog();
      invalidateCategoryCaches(queryClient, ownerId, { rowsChanged: true });
      await onRetryCategories();
    }, (error) => {
      console.error('Error during reassignment and deletion:', error);
      toast.error('Errore durante la riassegnazione delle spese');
    });
  };

  // The second press of an armed row (zero-expense path).
  const handleConfirmDirectDelete = async (categoryId: string) => {
    try {
      await deleteCategory(categoryId);
      toast.success('Categoria eliminata con successo');
      // The armed path is the zero-row one: only the taxonomy changed.
      if (ownerId) invalidateCategoryCaches(queryClient, ownerId, { rowsChanged: false });
      await onRetryCategories();
    } catch (error) {
      console.error('Error deleting category:', error);
      toast.error("Errore nell'eliminazione della categoria");
    }
  };

  const handleMoveExpenseCategory = async (source: ExpenseCategory, triggerOrigin: string) => {
    if (!ownerId) return;

    try {
      const expenseCount = await getExpenseCountByCategoryId(source.id, ownerId);

      if (expenseCount === 0) {
        toast.warning(`La categoria «${source.name}» non ha transazioni da spostare`);
        return;
      }

      const category = await getCategoryById(source.id);
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

  const closeMoveDialog = () => {
    setMoveCategoryDialogOpen(false);
    setCategoryToMove(null);
    setExpenseCountToMove(0);
    setMoveDialogOrigin(undefined);
  };

  const handleConfirmMoveCategory = async (newCategoryId: string, newSubCategoryId?: string) => {
    if (!categoryToMove || !ownerId) return;

    await runGuarded(async () => {
      const newCategory = await getCategoryById(newCategoryId);
      if (!newCategory) {
        toast.error('Categoria di destinazione non trovata');
        return;
      }

      // The dialog's «none» sentinel is no subcategory at all.
      let newSubCategoryName: string | undefined;
      if (newSubCategoryId && newSubCategoryId !== NO_SELECTION) {
        newSubCategoryName = newCategory.subCategories.find((sub) => sub.id === newSubCategoryId)?.name;
      } else {
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

      invalidateCategoryCaches(queryClient, ownerId, { rowsChanged: true });
      // The source category is NOT deleted.
      closeMoveDialog();
    }, (error) => {
      console.error('Error during category move:', error);
      toast.error(error instanceof TransferBoundaryError ? error.message : 'Errore nello spostamento delle transazioni');
    });
  };

  const handleExpenseCategoryDialogClose = () => {
    setCategoryDialogOpen(false);
    setEditingCategory(null);
  };

  // The dialog has already invalidated the React Query copies (invalidateCategoryCaches, where the
  // write happens): what is left is this list's key.
  const handleExpenseCategorySuccess = async () => {
    await onRetryCategories();
  };

  return (
    <SettingsTabPanel tab="spese" label="Spese">
      {/* Left column: the two settings the expense FORM reads, then the 50/30/20 switch. Below
          desktop the wrapper dissolves (`contents`) and each tile is a grid cell; from desktop
          they stack at their natural height beside the taller import tile. */}
      <div className="contents desktop:col-span-5 desktop:flex desktop:flex-col desktop:gap-3">
      {/* Conti di default (moved here from Preferenze: they act in the expense dialog) */}
      <div className={TILE_CELL_CLASS}>
        {accountsState === 'failed' ? (
          <ErrorNotice
            onRetry={onRetryAccounts}
            notice={describeReadFailure({
              subject: 'Conti di default',
              consequence:
                'I conti non sono stati letti: non si possono scegliere ora, e i predefiniti salvati restano quelli di prima.',
              canRetry: true,
            })}
          />
        ) : (
        <Tile
          eyebrow="Conti di default"
          reading={describeDefaultAccounts({ debitName: debitAccount?.name, creditName: creditAccount?.name })}
        >
          {accountsState === 'loading' ? (
            <p className="mt-3 text-[13px] text-muted-foreground">Caricamento dei conti…</p>
          ) : cashAssets.length === 0 ? (
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
                <Select value={defaultDebitCashAssetId} onValueChange={(value) => onChange({ defaultDebitCashAssetId: value })}>
                  <SelectTrigger className={cn('w-56', INTERACTIVE_CONTROL_CLASS)} aria-label="Conto di prelievo">
                    <SelectValue placeholder="Nessun default" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_SELECTION}>Nessun default</SelectItem>
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
                <Select value={defaultCreditCashAssetId} onValueChange={(value) => onChange({ defaultCreditCashAssetId: value })}>
                  <SelectTrigger className={cn('w-56', INTERACTIVE_CONTROL_CLASS)} aria-label="Conto di accredito">
                    <SelectValue placeholder="Nessun default" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_SELECTION}>Nessun default</SelectItem>
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
            Proposti nel modulo di spese ed entrate; solo conti veri, non asset di classe liquidità.
          </div>
        </Tile>
        )}
      </div>

      {/* Commissioni sui trasferimenti — where a transfer's fee lands (lib/utils/transferFee.ts) */}
      <div className={TILE_CELL_CLASS}>
        {categoriesState === 'failed' ? (
          <ErrorNotice
            onRetry={() => void onRetryCategories()}
            notice={describeReadFailure({
              subject: 'Commissioni sui trasferimenti',
              consequence:
                'Le categorie non sono state lette: quella delle commissioni non si può mostrare. Quella salvata resta.',
              canRetry: true,
            })}
          />
        ) : (
        <Tile
          eyebrow="Commissioni sui trasferimenti"
          reading={
            categoriesState === 'loading'
              ? null
              : describeTransferFeeCategory({
                  categoryName: transferFeeCategory?.name,
                  subCategoryName: transferFeeSubCategory?.name,
                })
          }
        >
          <div className="mt-1 flex flex-col divide-y divide-border">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
              <div className="min-w-0">
                <p className="text-[13px] font-medium">Categoria</p>
                <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">Una categoria di spesa</p>
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={transferFeeCategoryId || undefined}
                  onValueChange={(value) => onChange({ transferFeeCategoryId: value, transferFeeSubCategoryId: '' })}
                >
                  <SelectTrigger className={cn('w-52', INTERACTIVE_CONTROL_CLASS)} aria-label="Categoria delle commissioni sui trasferimenti">
                    <SelectValue placeholder="Seleziona categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {/* Any spending type can take the fee: an income or a transfer is not a cost. */}
                    {(['variable', 'fixed', 'debt'] as ExpenseType[]).map((type) =>
                      getCategoriesByType(type).length === 0 ? null : (
                        <SelectGroup key={type}>
                          <SelectLabel>{EXPENSE_TYPE_LABELS[type]}</SelectLabel>
                          {getCategoriesByType(type).map((cat) => (
                            <SelectItem key={cat.id} value={cat.id}>
                              {cat.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      )
                    )}
                  </SelectContent>
                </Select>
                {transferFeeCategoryId && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-11 desktop:h-8"
                    aria-label="Rimuovi la categoria delle commissioni"
                    onClick={() => onChange({ transferFeeCategoryId: '', transferFeeSubCategoryId: '' })}
                  >
                    Rimuovi
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
                  value={transferFeeSubCategoryId || undefined}
                  onValueChange={(value) => onChange({ transferFeeSubCategoryId: value })}
                  disabled={!transferFeeCategoryId}
                >
                  <SelectTrigger className={cn('w-52', INTERACTIVE_CONTROL_CLASS)} aria-label="Sottocategoria delle commissioni sui trasferimenti">
                    <SelectValue placeholder="Seleziona sottocategoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {transferFeeCategory?.subCategories.map((sub) => (
                      <SelectItem key={sub.id} value={sub.id}>
                        {sub.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {transferFeeSubCategoryId && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-11 desktop:h-8"
                    aria-label="Rimuovi la sottocategoria delle commissioni"
                    onClick={() => onChange({ transferFeeSubCategoryId: '' })}
                  >
                    Rimuovi
                  </Button>
                )}
              </div>
            </div>
          </div>
          <div className="mt-auto border-t border-border pt-3 text-[11px] leading-[1.45] text-muted-foreground">
            Vale per le commissioni nuove; una già registrata resta nella sua categoria.
          </div>
        </Tile>
        )}
      </div>
      {/* Ruoli 50/30/20 — opt-in; the roles themselves are set in the category dialog. Its own
          tile, not a row of Categorie: that tile gives way to an error notice when the
          categories fail to load, and the switch and the «non letti» reading must not. */}
      <div className={TILE_CELL_CLASS}>
        <Tile
          eyebrow="Ruoli 50/30/20"
          reading={
            categoriesState === 'loading'
              ? null
              : describeSpendingRolesSetting({
                  enabled: spendingRolesEnabled,
                  classification: categoryClassification,
                  categoriesUnread: categoriesState === 'failed',
                })
          }
        >
          <div className="mt-1 flex items-center justify-between gap-4 py-3">
            <div className="min-w-0">
              <Label htmlFor="spendingRolesEnabled" className="text-[13px] font-medium">Necessità, desideri, risparmi</Label>
              <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">
                Ogni categoria di spesa riceve un ruolo, e il flusso di Analisi si legge anche per ruolo
              </p>
            </div>
            <Switch
              id="spendingRolesEnabled"
              checked={spendingRolesEnabled}
              onCheckedChange={(checked) => onChange({ spendingRolesEnabled: checked })}
              className={cn('shrink-0', INTERACTIVE_CONTROL_CLASS)}
            />
          </div>
        </Tile>
      </div>
      </div>

      {/* Import CSV — the section renders its own tile (preview-first, undo per batch) */}
      <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-7')}>
        <ExpenseImportSection onImported={onExpenseImported} />
      </div>

      {/* Categorie — the management inventory at the tile's cadence */}
      <div className={cn(TILE_CELL_CLASS, 'tablet:col-span-2 desktop:col-span-12')}>
        {categoriesState === 'failed' ? (
          <ErrorNotice
            onRetry={() => void onRetryCategories()}
            notice={describeReadFailure({
              subject: 'Categorie',
              consequence:
                "Le categorie non sono state lette: l'elenco sembrerebbe vuoto senza esserlo, quindi qui non compare.",
              canRetry: true,
            })}
          />
        ) : (
        <Tile
          eyebrow="Categorie"
          aside={
            <Button onClick={handleAddExpenseCategory} variant="outline" size="sm" className="h-11 text-[12px] desktop:h-8">
              <Plus className="mr-1 h-3.5 w-3.5" />
              Nuova categoria
            </Button>
          }
          reading={categoriesState === 'loading' ? null : describeExpenseCategories(categoryCounts)}
        >
          {categoriesState === 'loading' ? (
            <p className="mt-3 text-[13px] text-muted-foreground">Caricamento delle categorie…</p>
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
                        <CategoryRow
                          key={category.id}
                          category={category}
                          onEdit={handleEditExpenseCategory}
                          onMove={handleMoveExpenseCategory}
                          onRequestDelete={requestCategoryDelete}
                          onConfirmDelete={handleConfirmDirectDelete}
                          announce={announceCategory}
                          spendingRolesEnabled={spendingRolesEnabled}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {/* The list's one live region: arm and disarm are sentences, spoken here. */}
          <span className="sr-only" role="status" aria-live="polite">
            {categoryAnnouncement}
          </span>
          <div className="mt-auto border-t border-border pt-3 text-[11px] leading-[1.45] text-muted-foreground">
            Elimina chiede la riassegnazione se la categoria ha transazioni (altrimenti conferma al secondo
            tocco); la freccia sposta tutte le transazioni in un&apos;altra categoria senza eliminarla.
          </div>
        </Tile>
        )}
      </div>

      {/* The three category dialogs live with the list that opens them. */}
      <CategoryManagementDialog
        open={categoryDialogOpen}
        onClose={handleExpenseCategoryDialogClose}
        category={editingCategory}
        onSuccess={handleExpenseCategorySuccess}
        spendingRolesEnabled={spendingRolesEnabled}
      />
      {categoryToDelete && (
        <CategoryDeleteConfirmDialog
          open={deleteConfirmDialogOpen}
          onClose={closeDeleteDialog}
          onConfirm={handleConfirmDeleteWithReassignment}
          categoryToDelete={categoryToDelete}
          expenseCount={expenseCountToReassign}
          allCategories={expenseCategories}
          triggerOrigin={deleteDialogOrigin}
        />
      )}
      {categoryToMove && (
        <CategoryMoveDialog
          open={moveCategoryDialogOpen}
          onClose={closeMoveDialog}
          onConfirm={handleConfirmMoveCategory}
          sourceCategory={categoryToMove}
          expenseCount={expenseCountToMove}
          allCategories={expenseCategories}
          triggerOrigin={moveDialogOrigin}
        />
      )}
    </SettingsTabPanel>
  );
}
