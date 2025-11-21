'use client';

import { useState, useEffect } from 'react';
import {
  ExpenseCategory,
  ExpenseSubCategory,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AlertTriangle } from 'lucide-react';

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
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [selectedSubCategoryId, setSelectedSubCategoryId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filter out the category being deleted
  const availableCategories = allCategories.filter(
    cat => cat.id !== categoryToDelete.id
  );

  // Get subcategories of selected category
  const selectedCategory = allCategories.find(cat => cat.id === selectedCategoryId);
  const availableSubCategories = selectedCategory?.subCategories || [];

  // If deleting a subcategory, filter it out from available subcategories
  const filteredSubCategories = subCategoryToDelete
    ? availableSubCategories.filter(sub => sub.id !== subCategoryToDelete.id)
    : availableSubCategories;

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
    }
  }, [open, availableCategories]);

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
              <Label htmlFor="new-category">
                Nuova Categoria *
              </Label>
              <Select
                value={selectedCategoryId}
                onValueChange={(value) => {
                  setSelectedCategoryId(value);
                  setSelectedSubCategoryId(''); // Reset subcategory when category changes
                }}
              >
                <SelectTrigger id="new-category">
                  <SelectValue placeholder="Seleziona una categoria..." />
                </SelectTrigger>
                <SelectContent>
                  {availableCategories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      <div className="flex items-center gap-2">
                        {category.color && (
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: category.color }}
                          />
                        )}
                        {category.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

          {/* Warning if no categories available */}
          {availableCategories.length === 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-800">
              Non puoi eliminare l&apos;unica categoria con spese associate.
              Crea prima una nuova categoria.
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
    </Dialog>
  );
}
