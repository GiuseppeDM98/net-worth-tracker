'use client';

import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAuth } from '@/contexts/AuthContext';
import {
  Expense,
  ExpenseFormData,
  ExpenseType,
  EXPENSE_TYPE_LABELS,
  ExpenseCategory
} from '@/types/expenses';
import { createExpense, updateExpense } from '@/lib/services/expenseService';
import { getAllCategories, addSubCategory } from '@/lib/services/expenseCategoryService';
import { Timestamp } from 'firebase/firestore';
import { CategoryManagementDialog } from '@/components/expenses/CategoryManagementDialog';
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
import { Switch } from '@/components/ui/switch';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { Plus } from 'lucide-react';

const expenseSchema = z.object({
  type: z.enum(['fixed', 'variable', 'debt', 'income']),
  categoryId: z.string().min(1, 'Categoria è obbligatoria'),
  subCategoryId: z.string().optional(),
  amount: z.number().positive('L\'importo deve essere positivo'),
  currency: z.string().min(1, 'Valuta è obbligatoria'),
  date: z.date(),
  notes: z.string().optional(),
  link: z.string().url('Inserisci un URL valido').optional().or(z.literal('')),
  isRecurring: z.boolean().optional(),
  recurringDay: z.number().min(1).max(31).optional(),
  recurringMonths: z.number().min(1).max(120).optional(),
});

type ExpenseFormValues = z.infer<typeof expenseSchema>;

interface ExpenseDialogProps {
  open: boolean;
  onClose: () => void;
  expense?: Expense | null;
  onSuccess?: () => void;
}

const expenseTypes: { value: ExpenseType; label: string }[] = [
  { value: 'fixed', label: EXPENSE_TYPE_LABELS.fixed },
  { value: 'variable', label: EXPENSE_TYPE_LABELS.variable },
  { value: 'debt', label: EXPENSE_TYPE_LABELS.debt },
  { value: 'income', label: EXPENSE_TYPE_LABELS.income },
];

export function ExpenseDialog({ open, onClose, expense, onSuccess }: ExpenseDialogProps) {
  const { user } = useAuth();
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [newSubCategoryName, setNewSubCategoryName] = useState('');
  const [addingSubCategory, setAddingSubCategory] = useState(false);
  const [showSubCategoryInput, setShowSubCategoryInput] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      type: 'variable',
      currency: 'EUR',
      date: new Date(),
      isRecurring: false,
      recurringMonths: 12,
    },
  });

  const selectedType = watch('type');
  const selectedCategoryId = watch('categoryId');
  const selectedIsRecurring = watch('isRecurring');
  const selectedDate = watch('date');

  // Load categories when dialog opens
  useEffect(() => {
    if (open && user) {
      loadCategories();
    }
  }, [open, user]);

  // Reset subcategory when category changes
  useEffect(() => {
    if (!expense) {
      setValue('subCategoryId', '');
    }
  }, [selectedCategoryId, expense, setValue]);

  const loadCategories = async () => {
    if (!user) return;

    try {
      setLoadingCategories(true);
      const allCategories = await getAllCategories(user.uid);
      setCategories(allCategories);
    } catch (error) {
      console.error('Error loading categories:', error);
      toast.error('Errore nel caricamento delle categorie');
    } finally {
      setLoadingCategories(false);
    }
  };

  useEffect(() => {
    if (expense) {
      reset({
        type: expense.type,
        categoryId: expense.categoryId,
        subCategoryId: expense.subCategoryId || '',
        amount: Math.abs(expense.amount),
        currency: expense.currency,
        date: expense.date instanceof Date ? expense.date : (expense.date as Timestamp).toDate(),
        notes: expense.notes || '',
        link: expense.link || '',
        isRecurring: expense.isRecurring || false,
        recurringDay: expense.recurringDay,
        recurringMonths: 1,
      });
    } else {
      reset({
        type: 'variable',
        categoryId: '',
        subCategoryId: '',
        amount: 0,
        currency: 'EUR',
        date: new Date(),
        notes: '',
        link: '',
        isRecurring: false,
        recurringDay: new Date().getDate(),
        recurringMonths: 12,
      });
    }
  }, [expense, reset, open]);

  // Auto-set recurring day when date changes
  useEffect(() => {
    if (selectedDate && selectedIsRecurring && !expense) {
      setValue('recurringDay', selectedDate.getDate());
    }
  }, [selectedDate, selectedIsRecurring, expense, setValue]);

  const getAvailableCategories = (): ExpenseCategory[] => {
    return categories
      .filter(cat => cat.type === selectedType)
      .sort((a, b) => a.name.localeCompare(b.name, 'it'));
  };

  const getSelectedCategory = (): ExpenseCategory | undefined => {
    return categories.find(cat => cat.id === selectedCategoryId);
  };

  const getAvailableSubCategories = () => {
    const category = getSelectedCategory();
    return (category?.subCategories || []).sort((a, b) => a.name.localeCompare(b.name, 'it'));
  };

  const handleCategoryCreated = async () => {
    // Reload categories after creating a new one
    await loadCategories();
  };

  const handleAddSubCategory = async () => {
    if (!newSubCategoryName.trim()) {
      toast.error('Inserisci un nome per la sotto-categoria');
      return;
    }

    if (!selectedCategoryId) {
      toast.error('Seleziona prima una categoria');
      return;
    }

    const category = getSelectedCategory();
    if (!category) return;

    // Check if subcategory already exists
    if (category.subCategories.some(sub => sub.name.toLowerCase() === newSubCategoryName.trim().toLowerCase())) {
      toast.error('Questa sotto-categoria esiste già');
      return;
    }

    try {
      setAddingSubCategory(true);
      await addSubCategory(selectedCategoryId, newSubCategoryName.trim());
      await loadCategories(); // Reload to get the updated category with new subcategory
      setNewSubCategoryName('');
      setShowSubCategoryInput(false);
      toast.success('Sotto-categoria aggiunta con successo');
    } catch (error) {
      console.error('Error adding subcategory:', error);
      toast.error('Errore nell\'aggiunta della sotto-categoria');
    } finally {
      setAddingSubCategory(false);
    }
  };

  const onSubmit = async (data: ExpenseFormValues) => {
    if (!user) {
      toast.error('Devi essere autenticato');
      return;
    }

    // Check if category exists
    const selectedCategory = categories.find(cat => cat.id === data.categoryId);
    if (!selectedCategory) {
      toast.error('Categoria non trovata');
      return;
    }

    // Get subcategory name if selected
    let subCategoryName: string | undefined;
    if (data.subCategoryId) {
      const subCategory = selectedCategory.subCategories.find(
        sub => sub.id === data.subCategoryId
      );
      subCategoryName = subCategory?.name;
    }

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
      };

      if (expense) {
        // Update existing expense
        await updateExpense(
          expense.id,
          expenseData,
          selectedCategory.name,
          subCategoryName
        );
        toast.success('Spesa aggiornata con successo');
      } else {
        // Create new expense
        const result = await createExpense(
          user.uid,
          expenseData,
          selectedCategory.name,
          subCategoryName
        );

        if (Array.isArray(result)) {
          toast.success(`${result.length} voci ricorrenti create con successo`);
        } else {
          toast.success('Spesa creata con successo');
        }
      }

      onSuccess?.();
      onClose();
    } catch (error) {
      console.error('Error saving expense:', error);
      toast.error('Errore nel salvataggio della spesa');
    }
  };

  const availableCategories = getAvailableCategories();
  const availableSubCategories = getAvailableSubCategories();

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {expense ? 'Modifica Spesa' : 'Nuova Spesa'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Tipo di Voce */}
          <div className="space-y-2">
            <Label htmlFor="type">Tipo di Voce *</Label>
            <Select
              value={watch('type')}
              onValueChange={(value) => {
                setValue('type', value as ExpenseType);
                setValue('categoryId', ''); // Reset category when type changes
                setValue('subCategoryId', '');
              }}
              disabled={!!expense} // Don't allow changing type when editing
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
            {expense && (
              <p className="text-sm text-muted-foreground">
                Il tipo di voce non può essere modificato
              </p>
            )}
          </div>

          {/* Categoria */}
          <div className="space-y-2">
            <Label htmlFor="categoryId">Categoria *</Label>
            {loadingCategories ? (
              <p className="text-sm text-muted-foreground">Caricamento...</p>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <Select
                    value={watch('categoryId')}
                    onValueChange={(value) => {
                      setValue('categoryId', value);
                      setValue('subCategoryId', '');
                      setShowSubCategoryInput(false);
                    }}
                  >
                    <SelectTrigger id="categoryId" className="flex-1">
                      <SelectValue placeholder="Seleziona categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableCategories.length === 0 ? (
                        <div className="px-2 py-1.5 text-sm text-muted-foreground">
                          Nessuna categoria disponibile
                        </div>
                      ) : (
                        availableCategories.map((category) => (
                          <SelectItem key={category.id} value={category.id}>
                            <div className="flex items-center gap-2">
                              <div
                                className="w-3 h-3 rounded-full border border-gray-300"
                                style={{ backgroundColor: category.color || '#3b82f6' }}
                              />
                              <span>{category.name}</span>
                            </div>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setCategoryDialogOpen(true)}
                    title="Crea nuova categoria"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {errors.categoryId && (
                  <p className="text-sm text-red-500">{errors.categoryId.message}</p>
                )}
              </>
            )}
          </div>

          {/* Sotto-categoria (se categoria selezionata) */}
          {selectedCategoryId && (
            <div className="space-y-2">
              <Label htmlFor="subCategoryId">Sotto-categoria (opzionale)</Label>
              {availableSubCategories.length > 0 && (
                <div className="flex items-center gap-2">
                  <Select
                    value={watch('subCategoryId') || undefined}
                    onValueChange={(value) => setValue('subCategoryId', value || undefined)}
                  >
                    <SelectTrigger id="subCategoryId" className="flex-1">
                      <SelectValue placeholder="Seleziona sotto-categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableSubCategories.map((subCategory) => (
                        <SelectItem key={subCategory.id} value={subCategory.id}>
                          {subCategory.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setShowSubCategoryInput(true)}
                    title="Aggiungi nuova sotto-categoria"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              )}

              {/* Input per aggiungere nuova sotto-categoria */}
              {(showSubCategoryInput || availableSubCategories.length === 0) && (
                <div className="space-y-2 p-3 bg-muted rounded-md">
                  <p className="text-sm font-medium">Aggiungi sotto-categoria</p>
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
                      disabled={addingSubCategory}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={handleAddSubCategory}
                      disabled={addingSubCategory}
                      title="Aggiungi"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                    {availableSubCategories.length > 0 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setShowSubCategoryInput(false);
                          setNewSubCategoryName('');
                        }}
                        disabled={addingSubCategory}
                      >
                        Annulla
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Premi Invio o clicca + per aggiungere
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Importo */}
          <div className="space-y-2">
            <Label htmlFor="amount">
              Importo (€) *
              {selectedType !== 'income' && (
                <span className="text-sm text-muted-foreground ml-2">
                  (verrà salvato come negativo)
                </span>
              )}
            </Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              min="0"
              {...register('amount', { valueAsNumber: true })}
              className={errors.amount ? 'border-red-500' : ''}
            />
            {errors.amount && (
              <p className="text-sm text-red-500">{errors.amount.message}</p>
            )}
          </div>

          {/* Data */}
          <div className="space-y-2">
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
                    // Browser garantisce formato yyyy-MM-dd quando onChange viene chiamato
                    if (dateString) {
                      const date = new Date(dateString + 'T00:00:00');
                      if (!isNaN(date.getTime())) {
                        field.onChange(date);
                      }
                    }
                  }}
                  className={errors.date ? 'border-red-500' : ''}
                />
              )}
            />
            {errors.date && (
              <p className="text-sm text-red-500">{errors.date.message}</p>
            )}
          </div>

          {/* Note */}
          <div className="space-y-2">
            <Label htmlFor="notes">Note / Descrizione</Label>
            <textarea
              id="notes"
              {...register('notes')}
              placeholder="es. Spesa supermercato Conad"
              className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>

          {/* Link */}
          <div className="space-y-2">
            <Label htmlFor="link">Link (opzionale)</Label>
            <Input
              id="link"
              type="url"
              {...register('link')}
              placeholder="es. https://www.amazon.it/ordini/..."
              className={errors.link ? 'border-red-500' : ''}
            />
            {errors.link && (
              <p className="text-sm text-red-500">{errors.link.message}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Aggiungi un link per tenere traccia di ordini, ricevute, ecc.
            </p>
          </div>

          {/* Ricorrenza (solo per debiti) */}
          {selectedType === 'debt' && !expense && (
            <div className="space-y-4 border rounded-md p-4 bg-muted/50">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="isRecurring">Crea voce per ogni mese</Label>
                  <p className="text-sm text-muted-foreground">
                    Crea automaticamente questa spesa per più mesi consecutivi
                  </p>
                </div>
                <Switch
                  id="isRecurring"
                  checked={watch('isRecurring') || false}
                  onCheckedChange={(checked) => setValue('isRecurring', checked)}
                />
              </div>

              {selectedIsRecurring && (
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div className="space-y-2">
                    <Label htmlFor="recurringMonths">Numero di mesi *</Label>
                    <Input
                      id="recurringMonths"
                      type="number"
                      min="1"
                      max="120"
                      {...register('recurringMonths', { valueAsNumber: true })}
                      className={errors.recurringMonths ? 'border-red-500' : ''}
                    />
                    {errors.recurringMonths && (
                      <p className="text-sm text-red-500">
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
                      className={errors.recurringDay ? 'border-red-500' : ''}
                    />
                    {errors.recurringDay && (
                      <p className="text-sm text-red-500">
                        {errors.recurringDay.message}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Es. 10 per il 10 di ogni mese
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

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
                : expense
                ? 'Salva Modifiche'
                : 'Crea Spesa'}
            </Button>
          </div>
        </form>
      </DialogContent>

      {/* Category Management Dialog */}
      <CategoryManagementDialog
        open={categoryDialogOpen}
        onClose={() => setCategoryDialogOpen(false)}
        onSuccess={handleCategoryCreated}
        initialType={selectedType}
      />
    </Dialog>
  );
}
