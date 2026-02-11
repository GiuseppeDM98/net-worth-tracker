'use client';

/**
 * CategoryMoveDialog Component
 *
 * Dialog for bulk-moving all expenses from a source category/subcategory to a
 * destination category/subcategory. Supports cross-type moves (e.g. fixed → variable).
 *
 * Unlike CategoryDeleteConfirmDialog, this dialog preserves the source — it only
 * moves transactions, without deleting the originating category or subcategory.
 *
 * Features:
 * - Cross-type support: destination can be any category regardless of type
 * - Searchable category dropdown with inline creation
 * - Optional subcategory selection for destination
 * - Source info card showing category, subcategory (if any), and expense count
 *
 * WARNING (Checklist Comment):
 * If you modify category move logic here, also update:
 * - lib/services/expenseService.ts (moveExpensesToCategory, moveExpensesFromSubCategory)
 * - app/dashboard/settings/page.tsx (category-level move handler)
 * - CategoryManagementDialog.tsx (subcategory-level move handler)
 *
 * @param open - Controls dialog visibility
 * @param onClose - Callback when dialog closes
 * @param onConfirm - Callback with destination category/subcategory IDs
 * @param sourceCategory - Category being moved from
 * @param sourceSubCategory - Optional subcategory being moved from
 * @param expenseCount - Number of expenses that will be moved
 * @param allCategories - Full list of categories for destination selection
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  ExpenseCategory,
  ExpenseSubCategory,
  EXPENSE_TYPE_LABELS,
} from '@/types/expenses';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
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
import { ArrowRightLeft, Plus, Check } from 'lucide-react';
import { CategoryManagementDialog } from './CategoryManagementDialog';
import { getAllCategories } from '@/lib/services/expenseCategoryService';
import { cn } from '@/lib/utils';

interface CategoryMoveDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (newCategoryId: string, newSubCategoryId?: string) => Promise<void>;
  sourceCategory: ExpenseCategory;
  sourceSubCategory?: ExpenseSubCategory;
  expenseCount: number;
  allCategories: ExpenseCategory[];
}

export function CategoryMoveDialog({
  open,
  onClose,
  onConfirm,
  sourceCategory,
  sourceSubCategory,
  expenseCount,
  allCategories,
}: CategoryMoveDialogProps) {
  const { user } = useAuth();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [selectedSubCategoryId, setSelectedSubCategoryId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // ========== State Management ==========

  // Inline category creation dialog state
  const [createCategoryDialogOpen, setCreateCategoryDialogOpen] = useState(false);
  // Why local categories: track inline creation without forcing parent re-render
  const [localCategories, setLocalCategories] = useState<ExpenseCategory[]>(allCategories);

  const dropdownRef = useRef<HTMLDivElement>(null);

  // ========== Filtering Logic ==========

  /**
   * All categories except the source (when moving a whole category).
   * For subcategory moves, we keep the source category available since the user
   * might want to move to a different subcategory within the same category.
   */
  const availableCategories = useMemo(() => {
    if (sourceSubCategory) {
      // Subcategory move: all categories available (including parent)
      return localCategories;
    }
    // Category move: exclude source category
    return localCategories.filter(cat => cat.id !== sourceCategory.id);
  }, [localCategories, sourceCategory.id, sourceSubCategory]);

  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) {
      return availableCategories;
    }
    const q = searchQuery.toLowerCase();
    return availableCategories.filter(cat =>
      cat.name.toLowerCase().includes(q)
    );
  }, [availableCategories, searchQuery]);

  // Get subcategories of selected destination category
  const selectedCategory = localCategories.find(cat => cat.id === selectedCategoryId);
  const availableSubCategories = useMemo(() => {
    if (!selectedCategory) return [];
    const subs = selectedCategory.subCategories || [];

    // If moving a subcategory within the same parent, exclude the source subcategory
    if (sourceSubCategory && selectedCategoryId === sourceCategory.id) {
      return subs.filter(sub => sub.id !== sourceSubCategory.id);
    }
    return subs;
  }, [selectedCategory, selectedCategoryId, sourceCategory.id, sourceSubCategory]);

  // Sync local categories when prop changes
  useEffect(() => {
    setLocalCategories(allCategories);
  }, [allCategories]);

  // ========== Dialog Lifecycle Effects ==========

  // Reset selections only when dialog opens, not when availableCategories changes
  // (otherwise inline category creation triggers a reset that wipes the auto-selection)
  useEffect(() => {
    if (open) {
      setSelectedCategoryId('');
      setSelectedSubCategoryId('');
      setSearchQuery('');
      setIsDropdownOpen(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Auto-select when only one category available (runs after initial reset)
  useEffect(() => {
    if (open && availableCategories.length === 1 && !selectedCategoryId) {
      setSelectedCategoryId(availableCategories[0].id);
    }
  }, [open, availableCategories, selectedCategoryId]);

  // Close dropdown on click outside
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
    // Reset subcategory: previous selection no longer valid for new category
    setSelectedSubCategoryId('');
    setIsDropdownOpen(false);
    setSearchQuery('');
  };

  /**
   * After inline category creation, reload categories and auto-select the new one.
   */
  const handleCategoryCreated = async () => {
    if (user) {
      const updatedCategories = await getAllCategories(user.uid);
      setLocalCategories(updatedCategories);

      // Auto-select newest category
      const newestCategory = updatedCategories
        .filter(cat => cat.id !== sourceCategory.id || sourceSubCategory)
        .sort((a, b) => {
          const timeA = a.createdAt instanceof Date ? a.createdAt.getTime() : a.createdAt.toMillis();
          const timeB = b.createdAt instanceof Date ? b.createdAt.getTime() : b.createdAt.toMillis();
          return timeB - timeA;
        })[0];

      if (newestCategory) {
        setSelectedCategoryId(newestCategory.id);
      }
    }
  };

  const handleConfirm = async () => {
    if (!selectedCategoryId) return;

    setIsSubmitting(true);
    try {
      await onConfirm(selectedCategoryId, selectedSubCategoryId || undefined);
      onClose();
    } catch (error) {
      console.error('Error during move:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const sourceLabel = sourceSubCategory
    ? `${sourceCategory.name} → ${sourceSubCategory.name}`
    : sourceCategory.name;

  // ========== Render ==========

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        {/* ========== Header Section ========== */}
        <DialogHeader>
          <div className="flex items-center gap-2 text-blue-600 mb-2">
            <ArrowRightLeft className="h-5 w-5" />
            <DialogTitle>Sposta Transazioni</DialogTitle>
          </div>
          <DialogDescription className="text-base">
            Sposta {expenseCount === 1 ? (
              <><strong>1</strong> transazione</>
            ) : (
              <><strong>{expenseCount}</strong> transazioni</>
            )} da <strong>&quot;{sourceLabel}&quot;</strong> ({EXPENSE_TYPE_LABELS[sourceCategory.type]}) verso una nuova destinazione.
          </DialogDescription>
        </DialogHeader>

        {/* ========== Destination Selection Section ========== */}
        <div className="space-y-4 py-4">
          {/* Category Selection */}
          {availableCategories.length > 1 && (
            <div className="space-y-2">
              <Label htmlFor="move-category-combobox">
                Categoria Destinazione *
              </Label>

              {/* Searchable Category Combobox */}
              <div className="relative">
                <Input
                  id="move-category-combobox"
                  placeholder="Cerca o seleziona categoria..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setIsDropdownOpen(true);
                  }}
                  onFocus={() => setIsDropdownOpen(true)}
                />

                {/* Dropdown list */}
                {isDropdownOpen && (
                  <div
                    ref={dropdownRef}
                    className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg max-h-60 overflow-auto"
                  >
                    {filteredCategories.length === 0 && searchQuery.trim() ? (
                      <button
                        type="button"
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer text-left"
                        onClick={handleCreateCategory}
                      >
                        <Plus className="h-4 w-4 text-primary flex-shrink-0" />
                        <span className="flex-1">Crea categoria &quot;{searchQuery.trim()}&quot;</span>
                      </button>
                    ) : filteredCategories.length === 0 ? (
                      <div className="p-3 text-sm text-muted-foreground text-center">
                        Inizia a digitare per cercare o creare una categoria
                      </div>
                    ) : (
                      filteredCategories.map((category) => (
                        <button
                          key={category.id}
                          type="button"
                          className={cn(
                            "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer text-left",
                            selectedCategoryId === category.id && "bg-gray-100 dark:bg-gray-800"
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
                          <span className="text-xs text-muted-foreground">
                            {EXPENSE_TYPE_LABELS[category.type]}
                          </span>
                          {selectedCategoryId === category.id && (
                            <Check className="h-4 w-4 text-primary flex-shrink-0" />
                          )}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Selected category display */}
              {selectedCategoryId && selectedCategory && (
                <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700">
                  {selectedCategory.color && (
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: selectedCategory.color }}
                    />
                  )}
                  <span className="text-sm font-medium">{selectedCategory.name}</span>
                  <span className="text-xs text-muted-foreground">
                    ({EXPENSE_TYPE_LABELS[selectedCategory.type]})
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Subcategory Selection (Optional) */}
          {selectedCategoryId && availableSubCategories.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="move-subcategory">
                Sotto-categoria Destinazione (opzionale)
              </Label>
              <Select
                value={selectedSubCategoryId}
                onValueChange={setSelectedSubCategoryId}
              >
                <SelectTrigger id="move-subcategory">
                  <SelectValue placeholder="Nessuna sotto-categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nessuna sotto-categoria</SelectItem>
                  {availableSubCategories.map((subCategory) => (
                    <SelectItem key={subCategory.id} value={subCategory.id}>
                      {subCategory.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Single category case */}
          {availableCategories.length === 1 && (
            <div className="p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-md text-sm text-blue-800 dark:text-blue-200">
              Le transazioni verranno spostate nella categoria{' '}
              <strong>&quot;{availableCategories[0].name}&quot;</strong> ({EXPENSE_TYPE_LABELS[availableCategories[0].type]}).
            </div>
          )}

          {/* No categories available */}
          {availableCategories.length === 0 && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-md text-sm text-amber-800 dark:text-amber-200">
              Non ci sono altre categorie disponibili.
              {' '}Crea prima una nuova categoria digitando il nome nel campo sopra.
            </div>
          )}

          {/* Cross-type warning */}
          {selectedCategoryId && selectedCategory && selectedCategory.type !== sourceCategory.type && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-md text-sm text-amber-800 dark:text-amber-200">
              Le transazioni cambieranno tipo da <strong>{EXPENSE_TYPE_LABELS[sourceCategory.type]}</strong> a{' '}
              <strong>{EXPENSE_TYPE_LABELS[selectedCategory.type]}</strong>.
            </div>
          )}
        </div>

        {/* ========== Action Buttons ========== */}
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Annulla
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={!selectedCategoryId || isSubmitting || availableCategories.length === 0}
          >
            {isSubmitting
              ? 'Spostamento...'
              : `Sposta ${expenseCount} ${expenseCount === 1 ? 'transazione' : 'transazioni'}`}
          </Button>
        </div>
      </DialogContent>

      {/* Inline Category Creation Dialog */}
      <CategoryManagementDialog
        open={createCategoryDialogOpen}
        onClose={() => setCreateCategoryDialogOpen(false)}
        onSuccess={handleCategoryCreated}
        initialName={searchQuery.trim()}
      />
    </Dialog>
  );
}
