'use client';

/**
 * CategoryManagementDialog Component
 *
 * Dialog for creating and editing expense categories with subcategory management.
 *
 * Features:
 * - Create/Edit Category: Form with name, type, and color picker
 * - Subcategory CRUD: Add, remove subcategories inline
 * - Smart Deletion: Checks for expenses using subcategory before deletion
 * - Reassignment Flow: Triggers CategoryDeleteConfirmDialog if subcategory has expenses
 * - Validation: Zod schema with custom refinement for type immutability on edit
 * - Color Picker: Predefined palette with visual color swatches
 *
 * Design Considerations:
 * - Category type cannot be changed after creation to maintain data integrity
 * - Deleting subcategories with expenses requires reassignment to prevent data loss
 * - Form resets on dialog close to clear stale state
 *
 * WARNING (Checklist Comment):
 * If you modify subcategory deletion logic, also update:
 * - CategoryDeleteConfirmDialog.tsx (handles reassignment flow)
 * - lib/services/expenseService.ts (reassignment implementation)
 *
 * @param open - Controls dialog visibility
 * @param onClose - Callback when dialog closes
 * @param category - Optional category to edit (undefined for create mode)
 * @param onSuccess - Callback after successful create/update
 * @param initialType - Pre-select type for create mode (used by parent dialogs)
 * @param initialName - Pre-fill name for create mode (used by inline creation)
 */

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAuth } from '@/contexts/AuthContext';
import {
  ExpenseCategory,
  ExpenseCategoryFormData,
  ExpenseType,
  EXPENSE_TYPE_LABELS,
  ExpenseSubCategory
} from '@/types/expenses';
import {
  createCategory,
  updateCategory,
  getAllCategories,
} from '@/lib/services/expenseCategoryService';
import {
  getExpenseCountBySubCategoryId,
  reassignExpensesSubCategory,
} from '@/lib/services/expenseService';
import { CategoryDeleteConfirmDialog } from './CategoryDeleteConfirmDialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { toast } from 'sonner';
import { Plus, X, ArrowRightLeft } from 'lucide-react';
import { CategoryMoveDialog } from './CategoryMoveDialog';
import { moveExpensesFromSubCategory } from '@/lib/services/expenseService';

/**
 * Teacher Comment: Zod Schema with Custom Refinement
 *
 * Base schema validates name, type, and optional color.
 * Custom refinement (if added) would enforce business rules like:
 * - Type immutability on edit (type can't change after category created)
 * - Name uniqueness validation (no duplicate category names)
 *
 * Current implementation uses simple schema, with type immutability
 * enforced via disabled form field rather than schema validation.
 */
const categorySchema = z.object({
  name: z.string().min(1, 'Category name is required'),
  type: z.enum(['fixed', 'variable', 'debt', 'income']),
  color: z.string().optional(),
});

type CategoryFormValues = z.infer<typeof categorySchema>;

interface CategoryManagementDialogProps {
  open: boolean;
  onClose: () => void;
  category?: ExpenseCategory | null;
  onSuccess?: () => void;
  initialType?: ExpenseType;
  initialName?: string;
}

const expenseTypes: { value: ExpenseType; label: string }[] = [
  { value: 'fixed', label: EXPENSE_TYPE_LABELS.fixed },
  { value: 'variable', label: EXPENSE_TYPE_LABELS.variable },
  { value: 'debt', label: EXPENSE_TYPE_LABELS.debt },
  { value: 'income', label: EXPENSE_TYPE_LABELS.income },
];

// Colori predefiniti per le categorie
const categoryColors = [
  { value: '#ef4444', label: 'Rosso' },
  { value: '#f97316', label: 'Arancione' },
  { value: '#f59e0b', label: 'Giallo' },
  { value: '#10b981', label: 'Verde' },
  { value: '#3b82f6', label: 'Blu' },
  { value: '#6366f1', label: 'Indaco' },
  { value: '#8b5cf6', label: 'Viola' },
  { value: '#ec4899', label: 'Rosa' },
  { value: '#64748b', label: 'Grigio' },
];

export function CategoryManagementDialog({
  open,
  onClose,
  category,
  onSuccess,
  initialType,
  initialName,
}: CategoryManagementDialogProps) {
  const { user } = useAuth();
  const [subCategories, setSubCategories] = useState<ExpenseSubCategory[]>([]);
  const [newSubCategoryName, setNewSubCategoryName] = useState('');

  // Subcategory deletion confirmation state
  const [deleteSubCategoryDialogOpen, setDeleteSubCategoryDialogOpen] = useState(false);
  const [subCategoryToDelete, setSubCategoryToDelete] = useState<ExpenseSubCategory | null>(null);
  const [subCategoryExpenseCount, setSubCategoryExpenseCount] = useState(0);

  // Subcategory move state
  const [moveSubCategoryDialogOpen, setMoveSubCategoryDialogOpen] = useState(false);
  const [subCategoryToMove, setSubCategoryToMove] = useState<ExpenseSubCategory | null>(null);
  const [subCategoryMoveExpenseCount, setSubCategoryMoveExpenseCount] = useState(0);
  const [allCategoriesForMove, setAllCategoriesForMove] = useState<ExpenseCategory[]>([]);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      type: 'variable',
      color: '#3b82f6',
    },
  });

  const selectedColor = watch('color');

  useEffect(() => {
    if (category) {
      reset({
        name: category.name,
        type: category.type,
        color: category.color || '#3b82f6',
      });
      setSubCategories(category.subCategories || []);
    } else {
      reset({
        name: initialName || '',
        type: initialType || 'variable',
        color: '#3b82f6',
      });
      setSubCategories([]);
    }
    setNewSubCategoryName('');
  }, [category, reset, open, initialType, initialName]);

  const handleAddSubCategory = () => {
    if (!newSubCategoryName.trim()) {
      toast.error('Inserisci un nome per la sotto-categoria');
      return;
    }

    // Check if subcategory already exists
    if (subCategories.some(sub => sub.name.toLowerCase() === newSubCategoryName.trim().toLowerCase())) {
      toast.error('Questa sotto-categoria esiste già');
      return;
    }

    const newSubCategory: ExpenseSubCategory = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: newSubCategoryName.trim(),
    };

    setSubCategories([...subCategories, newSubCategory]);
    setNewSubCategoryName('');
    toast.success('Sotto-categoria aggiunta');
  };

  const handleRemoveSubCategory = async (subCategoryId: string) => {
    // If editing an existing category, check for associated expenses
    if (category && user) {
      try {
        const expenseCount = await getExpenseCountBySubCategoryId(category.id, subCategoryId, user.uid);

        if (expenseCount > 0) {
          // Show reassignment dialog
          const subCat = subCategories.find(sub => sub.id === subCategoryId);
          if (subCat) {
            setSubCategoryToDelete(subCat);
            setSubCategoryExpenseCount(expenseCount);
            setDeleteSubCategoryDialogOpen(true);
          }
          return;
        }
      } catch (error) {
        console.error('Error checking subcategory expenses:', error);
        toast.error('Errore nel controllo delle spese associate');
        return;
      }
    }

    // No expenses or new category, proceed with removal
    setSubCategories(subCategories.filter(sub => sub.id !== subCategoryId));
    toast.success('Sotto-categoria rimossa');
  };

  const handleConfirmSubCategoryDelete = async (
    newCategoryId?: string,
    newSubCategoryId?: string
  ) => {
    if (!category || !subCategoryToDelete || !user) return;

    try {
      // If no category ID provided, delete without reassignment
      // (for subcategories, this means keeping the category but removing subcategory)
      if (!newCategoryId) {
        await reassignExpensesSubCategory(
          category.id,
          subCategoryToDelete.id,
          user.uid,
          undefined,
          undefined
        );

        // Remove the subcategory from the local state
        setSubCategories(subCategories.filter(sub => sub.id !== subCategoryToDelete.id));

        toast.success(`Sotto-categoria "${subCategoryToDelete.name}" eliminata. Le spese rimarranno nella categoria senza sotto-categoria.`);

        // Close the dialog
        setDeleteSubCategoryDialogOpen(false);
        setSubCategoryToDelete(null);
        setSubCategoryExpenseCount(0);
        return;
      }

      // Reassign expenses to new category/subcategory
      await reassignExpensesSubCategory(
        category.id,
        subCategoryToDelete.id,
        user.uid,
        newSubCategoryId,
        newSubCategoryId ? subCategories.find(sub => sub.id === newSubCategoryId)?.name : undefined
      );

      // Remove the subcategory from the local state
      setSubCategories(subCategories.filter(sub => sub.id !== subCategoryToDelete.id));

      toast.success('Spese riassegnate e sotto-categoria rimossa con successo');

      // Close the dialog
      setDeleteSubCategoryDialogOpen(false);
      setSubCategoryToDelete(null);
      setSubCategoryExpenseCount(0);
    } catch (error) {
      console.error('Error reassigning subcategory expenses:', error);
      toast.error('Errore nella riassegnazione delle spese');
    }
  };

  // ========== Subcategory Move Handlers ==========

  const handleMoveSubCategory = async (subCategoryId: string) => {
    if (!category || !user) return;

    try {
      const expenseCount = await getExpenseCountBySubCategoryId(category.id, subCategoryId, user.uid);

      if (expenseCount === 0) {
        const subCat = subCategories.find(sub => sub.id === subCategoryId);
        toast.warning(`La sotto-categoria "${subCat?.name}" non ha transazioni da spostare`);
        return;
      }

      // Fetch all categories for the move dialog destination options
      const categories = await getAllCategories(user.uid);

      const subCat = subCategories.find(sub => sub.id === subCategoryId);
      if (subCat) {
        setSubCategoryToMove(subCat);
        setSubCategoryMoveExpenseCount(expenseCount);
        setAllCategoriesForMove(categories);
        setMoveSubCategoryDialogOpen(true);
      }
    } catch (error) {
      console.error('Error checking subcategory expenses:', error);
      toast.error('Errore nel controllo delle transazioni');
    }
  };

  const handleConfirmMoveSubCategory = async (
    newCategoryId: string,
    newSubCategoryId?: string
  ) => {
    if (!category || !subCategoryToMove || !user) return;

    try {
      const newCategory = allCategoriesForMove.find(cat => cat.id === newCategoryId);
      if (!newCategory) {
        toast.error('Categoria di destinazione non trovata');
        return;
      }

      // Resolve subcategory name
      let newSubCategoryName: string | undefined;
      if (newSubCategoryId && newSubCategoryId !== '__none__') {
        const newSubCat = newCategory.subCategories.find(sub => sub.id === newSubCategoryId);
        newSubCategoryName = newSubCat?.name;
      } else {
        newSubCategoryId = undefined;
      }

      const movedCount = await moveExpensesFromSubCategory(
        category.id,
        subCategoryToMove.id,
        category.type,
        newCategoryId,
        newCategory.name,
        newCategory.type,
        user.uid,
        newSubCategoryId,
        newSubCategoryName
      );

      const destLabel = newSubCategoryName
        ? `${newCategory.name} → ${newSubCategoryName}`
        : newCategory.name;

      toast.success(
        `${movedCount} ${movedCount === 1 ? 'transazione spostata' : 'transazioni spostate'} da "${category.name} → ${subCategoryToMove.name}" a "${destLabel}"`
      );

      // Reset state — source subcategory is NOT deleted
      setMoveSubCategoryDialogOpen(false);
      setSubCategoryToMove(null);
      setSubCategoryMoveExpenseCount(0);
    } catch (error) {
      console.error('Error moving subcategory expenses:', error);
      toast.error('Errore nello spostamento delle transazioni');
    }
  };

  const onSubmit = async (data: CategoryFormValues) => {
    if (!user) {
      toast.error('Devi essere autenticato');
      return;
    }

    try {
      const categoryData: ExpenseCategoryFormData = {
        name: data.name.trim(),
        type: data.type,
        color: data.color,
        subCategories: subCategories,
      };

      if (category) {
        // Update existing category
        await updateCategory(category.id, categoryData, user.uid);
        toast.success('Categoria aggiornata con successo');
      } else {
        // Create new category
        await createCategory(user.uid, categoryData);
        toast.success('Categoria creata con successo');
      }

      onSuccess?.();
      onClose();
    } catch (error) {
      console.error('Error saving category:', error);
      toast.error('Errore nel salvataggio della categoria');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {category ? 'Modifica Categoria' : 'Nuova Categoria'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Nome Categoria */}
          <div className="space-y-2">
            <Label htmlFor="name">Nome Categoria *</Label>
            <Input
              id="name"
              {...register('name')}
              placeholder="es. Alimentari, Trasporti, Stipendio..."
              className={errors.name ? 'border-red-500' : ''}
            />
            {errors.name && (
              <p className="text-sm text-red-500">{errors.name.message}</p>
            )}
          </div>

          {/* Tipo di Voce */}
          <div className="space-y-2">
            <Label htmlFor="type">Tipo di Voce *</Label>
            <Select
              value={watch('type')}
              onValueChange={(value) => setValue('type', value as ExpenseType)}
              disabled={!!category} // Non permettere di cambiare il tipo se si sta modificando
            >
              <SelectTrigger id="type">
                <SelectValue placeholder="Seleziona tipo" />
              </SelectTrigger>
              <SelectContent>
                {expenseTypes.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.type && (
              <p className="text-sm text-red-500">{errors.type.message}</p>
            )}
            {category && (
              <p className="text-sm text-muted-foreground">
                Il tipo di voce non può essere modificato dopo la creazione
              </p>
            )}
          </div>

          {/* Colore */}
          <div className="space-y-2">
            <Label htmlFor="color">Colore (opzionale)</Label>
            <div className="flex items-center gap-2">
              <Select
                value={selectedColor}
                onValueChange={(value) => setValue('color', value)}
              >
                <SelectTrigger id="color" className="w-[200px]">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-4 h-4 rounded-full border border-gray-300"
                      style={{ backgroundColor: selectedColor }}
                    />
                    <SelectValue placeholder="Seleziona colore" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {categoryColors.map((color) => (
                    <SelectItem key={color.value} value={color.value}>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-4 h-4 rounded-full border border-gray-300"
                          style={{ backgroundColor: color.value }}
                        />
                        <span>{color.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Sotto-categorie */}
          <div className="space-y-2">
            <Label>Sotto-categorie (opzionali)</Label>
            <div className="space-y-2">
              {/* Lista sotto-categorie esistenti */}
              {subCategories.length > 0 && (
                <div className="space-y-1">
                  {subCategories.map((subCategory) => (
                    <div
                      key={subCategory.id}
                      className="flex items-center justify-between p-2 bg-muted rounded-md"
                    >
                      <span className="text-sm">{subCategory.name}</span>
                      <div className="flex items-center gap-1">
                        {/* Only show move button when editing an existing category */}
                        {category && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleMoveSubCategory(subCategory.id)}
                            title="Sposta transazioni"
                          >
                            <ArrowRightLeft className="h-3.5 w-3.5 text-blue-500" />
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveSubCategory(subCategory.id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Input per aggiungere nuova sotto-categoria */}
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Nome sotto-categoria"
                  value={newSubCategoryName}
                  onChange={(e) => setNewSubCategoryName(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddSubCategory();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleAddSubCategory}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Premi Invio o clicca + per aggiungere una sotto-categoria
              </p>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Annulla
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? 'Salvataggio...'
                : category
                ? 'Salva Modifiche'
                : 'Crea Categoria'}
            </Button>
          </div>
        </form>
      </DialogContent>

      {/* Subcategory Delete Confirmation Dialog */}
      {category && subCategoryToDelete && (
        <CategoryDeleteConfirmDialog
          open={deleteSubCategoryDialogOpen}
          onClose={() => {
            setDeleteSubCategoryDialogOpen(false);
            setSubCategoryToDelete(null);
            setSubCategoryExpenseCount(0);
          }}
          onConfirm={handleConfirmSubCategoryDelete}
          categoryToDelete={category}
          expenseCount={subCategoryExpenseCount}
          allCategories={[category]} // Only allow reassignment within same category for subcategories
          subCategoryToDelete={subCategoryToDelete}
        />
      )}

      {/* Subcategory Move Dialog */}
      {category && subCategoryToMove && (
        <CategoryMoveDialog
          open={moveSubCategoryDialogOpen}
          onClose={() => {
            setMoveSubCategoryDialogOpen(false);
            setSubCategoryToMove(null);
            setSubCategoryMoveExpenseCount(0);
          }}
          onConfirm={handleConfirmMoveSubCategory}
          sourceCategory={category}
          sourceSubCategory={subCategoryToMove}
          expenseCount={subCategoryMoveExpenseCount}
          allCategories={allCategoriesForMove}
        />
      )}
    </Dialog>
  );
}
