'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  ExpenseCategory,
  ExpenseSubCategory,
  ExpenseType,
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
import { AlertTriangle, Plus, Check } from 'lucide-react';
import { CategoryManagementDialog } from './CategoryManagementDialog';
import { getAllCategories } from '@/lib/services/expenseCategoryService';
import { cn } from '@/lib/utils';

interface CategoryDeleteConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (newCategoryId: string, newSubCategoryId?: string) => Promise<void>;
  categoryToDelete: ExpenseCategory;
  expenseCount: number;
  allCategories: ExpenseCategory[];
  subCategoryToDelete?: ExpenseSubCategory;
}

export function CategoryDeleteConfirmDialog({
  open,
  onClose,
  onConfirm,
  categoryToDelete,
  expenseCount,
  allCategories,
  subCategoryToDelete,
}: CategoryDeleteConfirmDialogProps) {
  const { user } = useAuth();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [selectedSubCategoryId, setSelectedSubCategoryId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // New category creation dialog state
  const [createCategoryDialogOpen, setCreateCategoryDialogOpen] = useState(false);
  const [localCategories, setLocalCategories] = useState<ExpenseCategory[]>(allCategories);

  // Ref for click outside detection
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Filter out the category being deleted
  const availableCategories = localCategories.filter(
    cat => cat.id !== categoryToDelete.id
  );

  // Filter categories based on search query
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

  useEffect(() => {
    // Reset selections when dialog opens/closes
    if (open) {
      // If there's only one category available (subcategory deletion case), auto-select it
      if (availableCategories.length === 1) {
        setSelectedCategoryId(availableCategories[0].id);
      } else {
        setSelectedCategoryId('');
      }
      setSelectedSubCategoryId('');
      setSearchQuery('');
      setIsDropdownOpen(false);
    }
  }, [open, availableCategories]);

  // Close dropdown when clicking outside
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

  const handleSelectCategory = (categoryId: string) => {
    setSelectedCategoryId(categoryId);
    setSelectedSubCategoryId(''); // Reset subcategory when category changes
    setIsDropdownOpen(false);
    setSearchQuery(''); // Clear search after selection
  };

  const handleCategoryCreated = async () => {
    // Reload categories from database
    if (user) {
      const updatedCategories = await getAllCategories(user.uid);
      setLocalCategories(updatedCategories);

      // Auto-select the newly created category (last one in the list)
      const newestCategory = updatedCategories
        .filter(cat => cat.id !== categoryToDelete.id)
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
    if (!selectedCategoryId) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onConfirm(selectedCategoryId, selectedSubCategoryId || undefined);
      onClose();
    } catch (error) {
      console.error('Error during reassignment:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isDeleting = subCategoryToDelete ? 'sotto-categoria' : 'categoria';
  const nameToDelete = subCategoryToDelete
    ? subCategoryToDelete.name
    : categoryToDelete.name;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 text-amber-600 mb-2">
            <AlertTriangle className="h-5 w-5" />
            <DialogTitle>Impossibile eliminare {isDeleting}</DialogTitle>
          </div>
          <DialogDescription className="text-base">
            {subCategoryToDelete ? (
              <>
                La sotto-categoria <strong>&quot;{nameToDelete}&quot;</strong> è utilizzata da{' '}
                <strong>{expenseCount}</strong> {expenseCount === 1 ? 'spesa' : 'spese'}.
                {' '}Seleziona una nuova categoria e sotto-categoria per riassegnare queste spese.
              </>
            ) : (
              <>
                La categoria <strong>&quot;{nameToDelete}&quot;</strong> è utilizzata da{' '}
                <strong>{expenseCount}</strong> {expenseCount === 1 ? 'spesa' : 'spese'}.
                {' '}Seleziona una nuova categoria per riassegnare queste spese.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Category Selection - Only show if multiple categories available */}
          {availableCategories.length > 1 && (
            <div className="space-y-2">
              <Label htmlFor="category-combobox">
                Nuova Categoria *
              </Label>

              {/* Category Combobox */}
              <div className="relative">
                <Input
                  id="category-combobox"
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
                    className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-auto"
                  >
                    {filteredCategories.length === 0 && searchQuery.trim() ? (
                      <button
                        type="button"
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 cursor-pointer text-left"
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
                            "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 cursor-pointer text-left",
                            selectedCategoryId === category.id && "bg-gray-100"
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
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Selected category display */}
              {selectedCategoryId && (
                <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-md border border-gray-200">
                  {selectedCategory?.color && (
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: selectedCategory.color }}
                    />
                  )}
                  <span className="text-sm font-medium">{selectedCategory?.name}</span>
                </div>
              )}
            </div>
          )}

          {/* Subcategory Selection (Optional) */}
          {selectedCategoryId && filteredSubCategories.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="new-subcategory">
                Nuova Sotto-categoria (opzionale)
              </Label>
              <Select
                value={selectedSubCategoryId}
                onValueChange={setSelectedSubCategoryId}
              >
                <SelectTrigger id="new-subcategory">
                  <SelectValue placeholder="Nessuna sotto-categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Nessuna sotto-categoria</SelectItem>
                  {filteredSubCategories.map((subCategory) => (
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
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-md text-sm text-blue-800">
              La categoria selezionata è l&apos;unica disponibile.
              {' '}Le spese verranno automaticamente riassegnate a questa categoria.
            </div>
          )}

          {/* Warning if no categories available */}
          {availableCategories.length === 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-800">
              Non puoi eliminare l&apos;unica categoria con spese associate.
              {' '}Crea prima una nuova categoria digitando il nome nel campo sopra.
            </div>
          )}
        </div>

        {/* Action Buttons */}
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
            variant="destructive"
            onClick={handleConfirm}
            disabled={!selectedCategoryId || isSubmitting || availableCategories.length === 0}
          >
            {isSubmitting
              ? 'Riassegnazione...'
              : `Conferma ed Elimina`}
          </Button>
        </div>
      </DialogContent>

      {/* Category Creation Dialog */}
      <CategoryManagementDialog
        open={createCategoryDialogOpen}
        onClose={() => setCreateCategoryDialogOpen(false)}
        onSuccess={handleCategoryCreated}
        initialType={categoryToDelete.type}
        initialName={searchQuery.trim()}
      />
    </Dialog>
  );
}
