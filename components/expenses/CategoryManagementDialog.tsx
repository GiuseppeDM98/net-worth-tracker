'use client';

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
} from '@/lib/services/expenseCategoryService';
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
import { Plus, X } from 'lucide-react';

const categorySchema = z.object({
  name: z.string().min(1, 'Nome categoria è obbligatorio'),
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
}: CategoryManagementDialogProps) {
  const { user } = useAuth();
  const [subCategories, setSubCategories] = useState<ExpenseSubCategory[]>([]);
  const [newSubCategoryName, setNewSubCategoryName] = useState('');

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
        name: '',
        type: initialType || 'variable',
        color: '#3b82f6',
      });
      setSubCategories([]);
    }
    setNewSubCategoryName('');
  }, [category, reset, open, initialType]);

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

  const handleRemoveSubCategory = (subCategoryId: string) => {
    setSubCategories(subCategories.filter(sub => sub.id !== subCategoryId));
    toast.success('Sotto-categoria rimossa');
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
        await updateCategory(category.id, categoryData);
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
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveSubCategory(subCategory.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
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
    </Dialog>
  );
}
