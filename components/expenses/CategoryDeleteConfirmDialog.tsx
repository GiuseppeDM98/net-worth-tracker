'use client';

/**
 * CategoryDeleteConfirmDialog Component
 *
 * Confirmation dialog for deleting expense categories or subcategories that have associated expenses.
 * Prevents data loss by requiring user to reassign expenses to a different category before deletion.
 *
 * Features:
 * - Reassignment Flow: Forces user to select a new category/subcategory for affected expenses
 * - Searchable Dropdown: Filter categories with search query, create new categories inline
 * - Smart Auto-Selection: Auto-selects category when only one option available
 * - Subcategory Support: Handles both category deletion and subcategory deletion scenarios
 * - Local State Management: Maintains local category list to reflect inline category creation
 *
 * Flow:
 * 1. User attempts to delete category/subcategory with N expenses
 * 2. Dialog shows warning with expense count
 * 3. User searches and selects replacement category (and optionally subcategory)
 * 4. Confirmation triggers reassignment in parent component
 * 5. Original category/subcategory is deleted after reassignment completes
 *
 * WARNING (Checklist Comment):
 * If you modify the category reassignment logic here, also update:
 * - CategoryManagementDialog.tsx (parent dialog that triggers this)
 * - lib/services/expenseCategoryService.ts (reassignment implementation)
 *
 * @param open - Controls dialog visibility
 * @param onClose - Callback when dialog closes
 * @param onConfirm - Callback with new category/subcategory IDs for reassignment
 * @param categoryToDelete - Category being deleted (contains metadata)
 * @param expenseCount - Number of expenses affected by deletion
 * @param allCategories - Full list of categories for reassignment options
 * @param subCategoryToDelete - Optional subcategory being deleted (undefined for category deletion)
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import {
  ExpenseCategory,
  ExpenseSubCategory,
  ExpenseType,
} from '@/types/expenses';
import { ResponsiveModal } from '@/components/ui/responsive-modal';
import {
  armedActionLabel,
  describeCategoryDeleteReading,
  describeModalStatus,
  describeWriteError,
  pluralize,
  type ModalStatus,
} from '@/lib/utils/dialogNarrative';
import { useArmedDelete } from '@/lib/hooks/useArmedDelete';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Check } from 'lucide-react';
import { CategoryManagementDialog } from './CategoryManagementDialog';
import { getAllCategories } from '@/lib/services/expenseCategoryService';
import { cn } from '@/lib/utils';

interface CategoryDeleteConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (newCategoryId?: string, newSubCategoryId?: string) => Promise<void>;
  categoryToDelete: ExpenseCategory;
  expenseCount: number;
  allCategories: ExpenseCategory[];
  subCategoryToDelete?: ExpenseSubCategory;
  triggerOrigin?: string;
}

export function CategoryDeleteConfirmDialog({
  open,
  onClose,
  onConfirm,
  categoryToDelete,
  expenseCount,
  allCategories,
  subCategoryToDelete,
  triggerOrigin,
}: CategoryDeleteConfirmDialogProps) {
  const { user } = useAuth();
  const { ownerId } = useActiveAccount();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [selectedSubCategoryId, setSelectedSubCategoryId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  /** Which consequence the reader chose: move the rows, or lose them with the category. */
  const [mode, setMode] = useState<'reassign' | 'delete'>('reassign');
  const [status, setStatus] = useState<ModalStatus>({ phase: 'idle' });

  // ========== State Management ==========

  // New category creation dialog state
  const [createCategoryDialogOpen, setCreateCategoryDialogOpen] = useState(false);
  // Why local categories: We need to track inline category creation without forcing parent re-render
  const [localCategories, setLocalCategories] = useState<ExpenseCategory[]>(allCategories);

  // Ref for click outside detection
  const dropdownRef = useRef<HTMLDivElement>(null);

  // ========== Filtering Logic ==========

  /**
   * Teacher Comment: Memoization Strategy for Category Filtering
   *
   * Why useMemo here? The filtering logic is used as a dependency in multiple useEffects.
   * Without memoization, the filtered array would be recreated on every render, causing
   * those useEffects to run unnecessarily and potentially creating infinite loops.
   *
   * By memoizing, we ensure the reference stays stable unless the actual dependencies
   * (localCategories or categoryToDelete.id) change, preventing unnecessary effect triggers.
   */
  const availableCategories = useMemo(
    () => localCategories.filter(cat => cat.id !== categoryToDelete.id),
    [localCategories, categoryToDelete.id]
  );

  /**
   * Filter categories based on user's search query.
   * Returns all available categories if search is empty, otherwise filters by name match.
   */
  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) {
      return availableCategories;
    }
    const query = searchQuery.toLowerCase();
    return availableCategories.filter(cat =>
      cat.name.toLowerCase().includes(query)
    );
  }, [availableCategories, searchQuery]);

  // Get subcategories of selected category
  const selectedCategory = localCategories.find(cat => cat.id === selectedCategoryId);
  const availableSubCategories = selectedCategory?.subCategories || [];

  // If deleting a subcategory, filter it out from available subcategories
  const filteredSubCategories = subCategoryToDelete
    ? availableSubCategories.filter(sub => sub.id !== subCategoryToDelete.id)
    : availableSubCategories;

  // Update local categories when allCategories prop changes
  useEffect(() => {
    setLocalCategories(allCategories);
  }, [allCategories]);

  // ========== Dialog Lifecycle Effects ==========

  useEffect(() => {
    // Reset selections when dialog opens/closes
    if (open) {
      /**
       * Why auto-select when only one category?
       *
       * Common scenario: User is deleting a subcategory, and all expenses belong to
       * the parent category. There's only one category available (the parent), so we
       * auto-select it to save the user a click. This improves UX for the most common case.
       */
      if (availableCategories.length === 1) {
        setSelectedCategoryId(availableCategories[0].id);
      } else {
        setSelectedCategoryId('');
      }
      setSelectedSubCategoryId('');
      setSearchQuery('');
      setIsDropdownOpen(false);
      setMode('reassign');
      setStatus({ phase: 'idle' });
    }
  }, [open, availableCategories]);

  /**
   * Why click-outside detection for dropdown?
   *
   * The searchable dropdown stays open while user types. Without click-outside handling,
   * the dropdown would stay open even if user clicks elsewhere in the dialog, creating
   * a poor UX. This effect adds a global listener to close the dropdown when clicking
   * outside its bounds, matching standard dropdown behavior users expect.
   */
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isDropdownOpen]);

  const handleCreateCategory = () => {
    setCreateCategoryDialogOpen(true);
    setIsDropdownOpen(false);
  };

  // ========== Event Handlers ==========

  const handleSelectCategory = (categoryId: string) => {
    setSelectedCategoryId(categoryId);
    // Why reset subcategory: Subcategories belong to specific categories, so when
    // user changes category, previous subcategory selection is no longer valid
    setSelectedSubCategoryId('');
    setIsDropdownOpen(false);
    setSearchQuery(''); // Clear search for better UX on next open
  };

  /**
   * Handle inline category creation from dropdown.
   *
   * Why auto-select newly created category:
   * User created the category specifically for reassignment, so we auto-select it
   * to save them from having to search and select it manually. We find the newest
   * category by sorting by creation timestamp.
   */
  const handleCategoryCreated = async () => {
    // Reload categories from database to get the newly created one
    if (user && ownerId) {
      const updatedCategories = await getAllCategories(ownerId);
      setLocalCategories(updatedCategories);

      // Auto-select the newly created category (most recent by timestamp)
      const newestCategory = updatedCategories
        .filter(cat => cat.id !== categoryToDelete.id)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

      if (newestCategory) {
        setSelectedCategoryId(newestCategory.id);
      }
    }
  };

  /**
   * The one confirm path. Which of the two consequences it carries out is the reader's choice
   * in the BODY, not a second button in the footer: two acts of very different weight cannot
   * share the same visual weight, and the old dialog stacked three full-width buttons.
   */
  const handleConfirm = async () => {
    if (mode === 'reassign' && !selectedCategoryId) return;

    setIsSubmitting(true);
    setStatus({ phase: 'submitting' });
    try {
      if (mode === 'reassign') {
        // Convert sentinel value to undefined (Radix Select doesn't allow empty string)
        const subCategoryId = selectedSubCategoryId && selectedSubCategoryId !== '__none__'
          ? selectedSubCategoryId
          : undefined;
        await onConfirm(selectedCategoryId, subCategoryId);
      } else {
        await onConfirm(undefined, undefined);
      }
      onClose();
    } catch (error) {
      console.error('Error during category deletion:', error);
      setStatus({ phase: 'error', message: describeWriteError(error) });
    } finally {
      setIsSubmitting(false);
    }
  };

  const kindLabel = subCategoryToDelete ? 'sottocategoria' : 'categoria';
  const nameToDelete = subCategoryToDelete
    ? subCategoryToDelete.name
    : categoryToDelete.name;

  const reading = describeModalStatus(status, {
    idle: describeCategoryDeleteReading({
      name: nameToDelete,
      isSubCategory: !!subCategoryToDelete,
      expenseCount,
      // The surface counts the rows but never sums them: a figure it does not have is a clause
      // that disappears, never a zero (the Narrative Honesty Rule).
      totalEur: null,
    }),
    submitting:
      mode === 'reassign'
        ? 'Sto spostando i movimenti e poi elimino.'
        : 'Sto eliminando i movimenti e poi la categoria.',
  });

  // The action names the count from the SAME query the reading counts, so the two can never
  // disagree; armed, it repeats the consequence instead of asking «Confermi?».
  const actionLabel =
    mode === 'reassign'
      ? `Sposta ${pluralize(expenseCount, 'movimento', 'movimenti')} ed elimina`
      : `Elimina ${pluralize(expenseCount, 'movimento', 'movimenti')} e la ${kindLabel}`;

  // ========== Render ==========


  return (
    <>
      <ResponsiveModal
        open={open}
        onClose={onClose}
        eyebrow={`Categorie ${categoryToDelete.type === 'income' ? 'di entrata' : 'di spesa'}`}
        title={`Elimina ${nameToDelete}`}
        reading={reading}
        width="md"
        triggerOrigin={triggerOrigin}
        footerNote="Esc annulla la conferma"
        footer={
          <>
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Annulla
            </Button>
            <ArmedConfirmButton
              label={actionLabel}
              disabled={isSubmitting || (mode === 'reassign' && !selectedCategoryId)}
              onConfirm={handleConfirm}
            />
          </>
        }
      >
        <div className="space-y-3">
          {/* The two consequences as a radiogroup: one is a move, the other is a loss, and the
              reader chooses between them here so the footer can name what it will do. */}
          <div role="radiogroup" aria-label="Che cosa fare dei movimenti">
            <label
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-lg border p-3.5 transition-colors',
                mode === 'reassign' ? 'border-border bg-muted' : 'border-border hover:bg-muted/50',
              )}
            >
              <input
                type="radio"
                name="category-delete-mode"
                className="mt-1 size-4 accent-[var(--primary)]"
                checked={mode === 'reassign'}
                onChange={() => setMode('reassign')}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">
                  Sposta {pluralize(expenseCount, 'movimento', 'movimenti')} in un&apos;altra categoria
                </p>
                <p className="mt-0.5 text-xs leading-[1.4] text-muted-foreground">
                  Gli importi restano nei totali del mese e passano ai budget della categoria che scegli.
                </p>

                {mode === 'reassign' && (
                  <div className="mt-3 space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="category-combobox" className="text-xs text-muted-foreground">
                        Nuova categoria *
                      </Label>
                      <div className="relative" ref={dropdownRef}>
                        <Input
                          id="category-combobox"
                          role="combobox"
                          aria-expanded={isDropdownOpen}
                          aria-controls="category-listbox"
                          autoComplete="off"
                          placeholder={selectedCategory?.name ?? 'Cerca o crea una categoria...'}
                          value={searchQuery}
                          onChange={(e) => {
                            setSearchQuery(e.target.value);
                            setIsDropdownOpen(true);
                          }}
                          onFocus={() => setIsDropdownOpen(true)}
                        />

                        {isDropdownOpen && (
                          <div
                            id="category-listbox"
                            role="listbox"
                            aria-label="Categorie disponibili"
                            className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-border bg-popover shadow-[0_4px_24px_rgba(0,0,0,0.28)]"
                          >
                            {filteredCategories.length === 0 && searchQuery.trim() ? (
                              <button
                                type="button"
                                className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                                onClick={handleCreateCategory}
                              >
                                <Plus className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                                <span className="flex-1">Crea la categoria &quot;{searchQuery.trim()}&quot;</span>
                              </button>
                            ) : filteredCategories.length === 0 ? (
                              <p className="p-3 text-center text-sm text-muted-foreground">
                                Scrivi per cercare una categoria, o per crearne una.
                              </p>
                            ) : (
                              filteredCategories.map((category) => (
                                <button
                                  key={category.id}
                                  type="button"
                                  role="option"
                                  aria-selected={selectedCategoryId === category.id}
                                  className={cn(
                                    'flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent',
                                    selectedCategoryId === category.id && 'bg-accent',
                                  )}
                                  onClick={() => handleSelectCategory(category.id)}
                                >
                                  {category.color && (
                                    <span
                                      className="size-3 shrink-0 rounded-full"
                                      style={{ backgroundColor: category.color }}
                                      aria-hidden="true"
                                    />
                                  )}
                                  <span className="flex-1">{category.name}</span>
                                  {selectedCategoryId === category.id && (
                                    <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
                                  )}
                                </button>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                      {selectedCategory && (
                        <p className="text-xs text-muted-foreground">
                          Scelta: <span className="font-medium text-foreground">{selectedCategory.name}</span>
                        </p>
                      )}
                    </div>

                    {selectedCategoryId && filteredSubCategories.length > 0 && (
                      <div className="space-y-1.5">
                        <Label htmlFor="new-subcategory" className="text-xs text-muted-foreground">
                          Nuova sottocategoria <span className="font-normal">(opzionale)</span>
                        </Label>
                        <Select value={selectedSubCategoryId} onValueChange={setSelectedSubCategoryId}>
                          <SelectTrigger id="new-subcategory">
                            <SelectValue placeholder="Nessuna sottocategoria" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Nessuna sottocategoria</SelectItem>
                            {filteredSubCategories.map((subCategory) => (
                              <SelectItem key={subCategory.id} value={subCategory.id}>
                                {subCategory.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {availableCategories.length === 0 && (
                      <p className="text-xs leading-[1.4] text-warning-foreground">
                        Non c&apos;è un&apos;altra categoria dove spostarli: creane una scrivendone il
                        nome qui sopra, oppure elimina anche i movimenti.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </label>

            <label
              className={cn(
                'mt-3 flex cursor-pointer items-start gap-3 rounded-lg border p-3.5 transition-colors',
                mode === 'delete' ? 'border-destructive bg-destructive/5' : 'border-border hover:bg-muted/50',
              )}
            >
              <input
                type="radio"
                name="category-delete-mode"
                className="mt-1 size-4 accent-[var(--destructive)]"
                checked={mode === 'delete'}
                onChange={() => setMode('delete')}
              />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">
                  Elimina anche {pluralize(expenseCount, 'movimento', 'movimenti')}
                </p>
                <p className="mt-0.5 text-xs leading-[1.4] text-muted-foreground">
                  Escono da ogni totale, da ogni budget e dallo Storico. Non si annulla.
                </p>
              </div>
            </label>
          </div>
        </div>
      </ResponsiveModal>

      {/* Category Creation Dialog */}
      <CategoryManagementDialog
        open={createCategoryDialogOpen}
        onClose={() => setCreateCategoryDialogOpen(false)}
        onSuccess={handleCategoryCreated}
        initialType={categoryToDelete.type}
        initialName={searchQuery.trim()}
      />
    </>
  );
}

/**
 * The destructive primary: two clicks, no timer, Escape disarms (`useArmedDelete`), and the
 * armed label repeats the consequence rather than asking a question about it.
 */
function ArmedConfirmButton({
  label,
  disabled,
  onConfirm,
}: {
  label: string;
  disabled: boolean;
  onConfirm: () => void;
}) {
  const ref = useRef<HTMLButtonElement | null>(null);
  const { armed, onClick, onBlur } = useArmedDelete(ref, onConfirm);
  // Emptying a live region announces nothing, so the disarm is announced explicitly.
  const [wasArmed, setWasArmed] = useState(false);
  if (armed && !wasArmed) setWasArmed(true);

  return (
    <>
      <Button
        ref={ref}
        type="button"
        variant="destructive"
        onClick={onClick}
        onBlur={onBlur}
        disabled={disabled}
        aria-pressed={armed}
      >
        {armed ? armedActionLabel(label) : label}
      </Button>
      <span className="sr-only" role="status" aria-live="polite">
        {armed ? armedActionLabel(label) : wasArmed ? 'Eliminazione annullata' : ''}
      </span>
    </>
  );
}
