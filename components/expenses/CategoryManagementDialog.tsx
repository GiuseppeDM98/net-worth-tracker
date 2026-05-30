'use client';

import { useEffect, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAuth } from '@/contexts/AuthContext';
import {
  ExpenseCategory,
  ExpenseCategoryFormData,
  ExpenseType,
  EXPENSE_TYPE_LABELS,
  ExpenseSubCategory,
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
import { ResponsiveModal } from '@/components/ui/responsive-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Plus, X, ArrowRightLeft, Check, Tag } from 'lucide-react';
import { CategoryMoveDialog } from './CategoryMoveDialog';
import { moveExpensesFromSubCategory } from '@/lib/services/expenseService';
import { cn } from '@/lib/utils';


// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
const categorySchema = z.object({
  name: z.string().min(1, 'Il nome è obbligatorio'),
  type: z.enum(['fixed', 'variable', 'debt', 'income']),
  color: z.string().optional(),
});

type CategoryFormValues = z.infer<typeof categorySchema>;

// ---------------------------------------------------------------------------
// Static data
// ---------------------------------------------------------------------------
const CATEGORY_COLORS: { value: string; label: string }[] = [
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

// For screen-reader labels (AGENTS.md: Color Picker Buttons)
const COLOR_LABELS: Record<string, string> = Object.fromEntries(
  CATEGORY_COLORS.map((c) => [c.value, c.label])
);

const TYPE_OPTIONS: { value: ExpenseType; label: string; description: string }[] = [
  { value: 'variable', label: EXPENSE_TYPE_LABELS.variable, description: 'Ristorante, shopping, svago, imprevisti' },
  { value: 'fixed',    label: EXPENSE_TYPE_LABELS.fixed,    description: 'Affitto, abbonamenti, bollette, utenze' },
  { value: 'debt',     label: EXPENSE_TYPE_LABELS.debt,     description: 'Mutuo, prestito, finanziamento ricorrente' },
  { value: 'income',   label: EXPENSE_TYPE_LABELS.income,   description: 'Stipendio, bonus, dividendi, rimborsi' },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
export interface CategoryManagementDialogProps {
  open: boolean;
  onClose: () => void;
  category?: ExpenseCategory | null;
  onSuccess?: () => void;
  initialType?: ExpenseType;
  initialName?: string;
  /** Pre-fill the new-subcategory input when opening in edit mode */
  initialSubCategoryName?: string;
}

// ---------------------------------------------------------------------------
// Form body — shared between Dialog and Drawer shells
// ---------------------------------------------------------------------------
interface FormBodyProps {
  category?: ExpenseCategory | null;
  subCategories: ExpenseSubCategory[];
  setSubCategories: (subs: ExpenseSubCategory[]) => void;
  newSubCategoryName: string;
  setNewSubCategoryName: (v: string) => void;
  handleAddSubCategory: () => void;
  handleRemoveSubCategory: (id: string) => void;
  handleMoveSubCategory: ((id: string) => void) | null;
  form: ReturnType<typeof useForm<CategoryFormValues>>;
}

function CategoryFormBody({
  category,
  subCategories,
  setSubCategories,
  newSubCategoryName,
  setNewSubCategoryName,
  handleAddSubCategory,
  handleRemoveSubCategory,
  handleMoveSubCategory,
  form,
}: FormBodyProps) {
  const { register, setValue, control, formState: { errors } } = form;
  const selectedColor = useWatch({ control, name: 'color' });
  const selectedType  = useWatch({ control, name: 'type' });
  const subInputRef   = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-6">
      {/* ---- Nome ---- */}
      <div className="space-y-2">
        <Label htmlFor="cat-name">Nome categoria *</Label>
        <Input
          id="cat-name"
          {...register('name')}
          placeholder="es. Alimentari, Trasporti, Stipendio"
          className={errors.name ? 'border-destructive' : ''}
          autoFocus
        />
        {errors.name && (
          <p className="text-xs text-destructive">{errors.name.message}</p>
        )}
      </div>

      {/* ---- Tipo ---- */}
      <div className="space-y-2">
        <Label htmlFor="cat-type">Tipo di voce *</Label>
        <Select
          value={selectedType}
          onValueChange={(v) => setValue('type', v as ExpenseType)}
        >
          <SelectTrigger id="cat-type" aria-label="Tipo di voce">
            <span className={cn(!selectedType && 'text-muted-foreground')}>
              {selectedType ? EXPENSE_TYPE_LABELS[selectedType as ExpenseType] : 'Seleziona tipo'}
            </span>
          </SelectTrigger>
          <SelectContent>
            {TYPE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                <div className="flex flex-col gap-0.5 py-0.5">
                  <span className="font-medium">{opt.label}</span>
                  <span className="text-xs text-muted-foreground font-normal">{opt.description}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.type && (
          <p className="text-xs text-destructive">{errors.type.message}</p>
        )}
        {category && selectedType !== category.type && (() => {
          const crossesBoundary = (category.type === 'income') !== (selectedType === 'income');
          return crossesBoundary ? (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Attenzione: tutti gli importi cambieranno segno (da {EXPENSE_TYPE_LABELS[category.type]} a {EXPENSE_TYPE_LABELS[selectedType as ExpenseType]}).
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Il tipo verrà aggiornato su tutte le transazioni associate.
            </p>
          );
        })()}
      </div>

      {/* ---- Colore ---- */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Colore</Label>
          {selectedColor && (
            <span className="text-xs text-muted-foreground">{COLOR_LABELS[selectedColor] ?? selectedColor}</span>
          )}
        </div>
        <div
          className="flex flex-wrap gap-2.5"
          role="radiogroup"
          aria-label="Colore categoria"
        >
          {CATEGORY_COLORS.map((c) => {
            const isSelected = selectedColor === c.value;
            return (
              <button
                key={c.value}
                type="button"
                role="radio"
                aria-checked={isSelected}
                aria-label={`${c.label}${isSelected ? ' (selezionato)' : ''}`}
                onClick={() => setValue('color', c.value)}
                className={cn(
                  'w-8 h-8 rounded-full border-2 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  isSelected
                    ? 'border-foreground scale-110 shadow-md'
                    : 'border-transparent hover:scale-105'
                )}
                style={{ backgroundColor: c.value }}
              >
                {isSelected && (
                  <Check className="w-3.5 h-3.5 text-white mx-auto drop-shadow" aria-hidden="true" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ---- Sottocategorie ---- */}
      <div className="space-y-3">
        <Label>Sottocategorie <span className="text-muted-foreground font-normal">(opzionali)</span></Label>

        {/* Existing list */}
        {subCategories.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {subCategories.map((sub) => (
              <div
                key={sub.id}
                className="group flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full text-xs font-medium bg-muted border border-border/60 hover:border-border transition-colors"
              >
                <Tag className="w-3 h-3 text-muted-foreground shrink-0" aria-hidden="true" />
                <span className="max-w-[120px] truncate">{sub.name}</span>
                {handleMoveSubCategory && (
                  <button
                    type="button"
                    onClick={() => handleMoveSubCategory(sub.id)}
                    className="ml-0.5 p-0.5 rounded-full opacity-0 group-hover:opacity-100 hover:bg-blue-100 dark:hover:bg-blue-950 transition-all focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    aria-label={`Sposta transazioni di ${sub.name}`}
                    title="Sposta transazioni"
                  >
                    <ArrowRightLeft className="w-3 h-3 text-blue-500" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleRemoveSubCategory(sub.id)}
                  className="p-0.5 rounded-full hover:bg-destructive/15 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  aria-label={`Rimuovi sottocategoria ${sub.name}`}
                >
                  <X className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add new */}
        <div className="flex items-center gap-2">
          <Input
            ref={subInputRef}
            placeholder="Nuova sottocategoria…"
            value={newSubCategoryName}
            onChange={(e) => setNewSubCategoryName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddSubCategory();
              }
            }}
            className="text-sm"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => {
              handleAddSubCategory();
              subInputRef.current?.focus();
            }}
            aria-label="Aggiungi sottocategoria"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Premi Invio o + per aggiungere. Clicca &times; su un chip per rimuovere.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function CategoryManagementDialog({
  open,
  onClose,
  category,
  onSuccess,
  initialType,
  initialName,
  initialSubCategoryName,
}: CategoryManagementDialogProps) {
  const { user } = useAuth();

  const [subCategories, setSubCategories] = useState<ExpenseSubCategory[]>([]);
  const [newSubCategoryName, setNewSubCategoryName] = useState('');

  // Subcategory deletion state
  const [deleteSubCategoryDialogOpen, setDeleteSubCategoryDialogOpen] = useState(false);
  const [subCategoryToDelete, setSubCategoryToDelete] = useState<ExpenseSubCategory | null>(null);
  const [subCategoryExpenseCount, setSubCategoryExpenseCount] = useState(0);

  // Subcategory move state
  const [moveSubCategoryDialogOpen, setMoveSubCategoryDialogOpen] = useState(false);
  const [subCategoryToMove, setSubCategoryToMove] = useState<ExpenseSubCategory | null>(null);
  const [subCategoryMoveExpenseCount, setSubCategoryMoveExpenseCount] = useState(0);
  const [allCategoriesForMove, setAllCategoriesForMove] = useState<ExpenseCategory[]>([]);

  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: { type: 'variable', color: '#3b82f6' },
  });
  const { handleSubmit, reset, formState: { isSubmitting } } = form;

  // Reset form whenever open/category changes
  useEffect(() => {
    if (!open) return;
    if (category) {
      reset({ name: category.name, type: category.type, color: category.color || '#3b82f6' });
      setSubCategories(category.subCategories || []);
    } else {
      reset({ name: initialName || '', type: initialType || 'variable', color: '#3b82f6' });
      setSubCategories([]);
    }
    setNewSubCategoryName(initialSubCategoryName || '');
  }, [open, category, reset, initialType, initialName, initialSubCategoryName]);

  // ---- Subcategory handlers ----
  const handleAddSubCategory = () => {
    const trimmed = newSubCategoryName.trim();
    if (!trimmed) { toast.error('Inserisci un nome per la sottocategoria'); return; }
    if (subCategories.some((s) => s.name.toLowerCase() === trimmed.toLowerCase())) {
      toast.error('Questa sottocategoria esiste già'); return;
    }
    setSubCategories([
      ...subCategories,
      { id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, name: trimmed },
    ]);
    setNewSubCategoryName('');
  };

  const handleRemoveSubCategory = async (subCategoryId: string) => {
    if (category && user) {
      try {
        const expenseCount = await getExpenseCountBySubCategoryId(category.id, subCategoryId, user.uid);
        if (expenseCount > 0) {
          const subCat = subCategories.find((s) => s.id === subCategoryId);
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
    setSubCategories(subCategories.filter((s) => s.id !== subCategoryId));
    toast.success('Sottocategoria rimossa');
  };

  const handleConfirmSubCategoryDelete = async (newCategoryId?: string, newSubCategoryId?: string) => {
    if (!category || !subCategoryToDelete || !user) return;
    try {
      if (!newCategoryId) {
        await reassignExpensesSubCategory(category.id, subCategoryToDelete.id, user.uid, undefined, undefined);
        setSubCategories(subCategories.filter((s) => s.id !== subCategoryToDelete.id));
        toast.success(`Sottocategoria "${subCategoryToDelete.name}" eliminata. Le spese rimarranno nella categoria senza sottocategoria.`);
      } else {
        await reassignExpensesSubCategory(
          category.id, subCategoryToDelete.id, user.uid,
          newSubCategoryId,
          newSubCategoryId ? subCategories.find((s) => s.id === newSubCategoryId)?.name : undefined
        );
        setSubCategories(subCategories.filter((s) => s.id !== subCategoryToDelete.id));
        toast.success('Spese riassegnate e sottocategoria rimossa');
      }
      setDeleteSubCategoryDialogOpen(false);
      setSubCategoryToDelete(null);
      setSubCategoryExpenseCount(0);
    } catch (error) {
      console.error('Error reassigning subcategory expenses:', error);
      toast.error('Errore nella riassegnazione delle spese');
    }
  };

  const handleMoveSubCategory = async (subCategoryId: string) => {
    if (!category || !user) return;
    try {
      const expenseCount = await getExpenseCountBySubCategoryId(category.id, subCategoryId, user.uid);
      if (expenseCount === 0) {
        const subCat = subCategories.find((s) => s.id === subCategoryId);
        toast.warning(`La sottocategoria "${subCat?.name}" non ha transazioni da spostare`);
        return;
      }
      const categories = await getAllCategories(user.uid);
      const subCat = subCategories.find((s) => s.id === subCategoryId);
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

  const handleConfirmMoveSubCategory = async (newCategoryId: string, newSubCategoryId?: string) => {
    if (!category || !subCategoryToMove || !user) return;
    try {
      const newCategory = allCategoriesForMove.find((cat) => cat.id === newCategoryId);
      if (!newCategory) { toast.error('Categoria di destinazione non trovata'); return; }
      let resolvedSubName: string | undefined;
      if (newSubCategoryId && newSubCategoryId !== '__none__') {
        resolvedSubName = newCategory.subCategories.find((s) => s.id === newSubCategoryId)?.name;
      } else {
        newSubCategoryId = undefined;
      }
      const movedCount = await moveExpensesFromSubCategory(
        category.id, subCategoryToMove.id, category.type,
        newCategoryId, newCategory.name, newCategory.type,
        user.uid, newSubCategoryId, resolvedSubName
      );
      const destLabel = resolvedSubName ? `${newCategory.name} \u2192 ${resolvedSubName}` : newCategory.name;
      toast.success(`${movedCount} ${movedCount === 1 ? 'transazione spostata' : 'transazioni spostate'} da "${category.name} \u2192 ${subCategoryToMove.name}" a "${destLabel}"`);
      setMoveSubCategoryDialogOpen(false);
      setSubCategoryToMove(null);
      setSubCategoryMoveExpenseCount(0);
    } catch (error) {
      console.error('Error moving subcategory expenses:', error);
      toast.error('Errore nello spostamento delle transazioni');
    }
  };

  const onSubmit = async (data: CategoryFormValues) => {
    if (!user) { toast.error('Devi essere autenticato'); return; }
    try {
      const categoryData: ExpenseCategoryFormData = {
        name: data.name.trim(),
        type: data.type,
        color: data.color,
        subCategories,
      };
      if (category) {
        await updateCategory(category.id, categoryData, user.uid);
        toast.success('Categoria aggiornata');
      } else {
        await createCategory(user.uid, categoryData);
        toast.success('Categoria creata');
      }
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error('Error saving category:', error);
      toast.error('Errore nel salvataggio della categoria');
    }
  };

  const title = category ? 'Modifica Categoria' : 'Nuova Categoria';
  const submitLabel = isSubmitting
    ? 'Salvataggio\u2026'
    : category
    ? 'Salva Modifiche'
    : 'Crea Categoria';

  const formBodyProps: FormBodyProps = {
    category,
    subCategories,
    setSubCategories,
    newSubCategoryName,
    setNewSubCategoryName,
    handleAddSubCategory,
    handleRemoveSubCategory,
    handleMoveSubCategory: category ? handleMoveSubCategory : null,
    form,
  };

  // ---- Sub-dialogs (shared between mobile/desktop) ----
  const subDialogs = (
    <>
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
          allCategories={[category]}
          subCategoryToDelete={subCategoryToDelete}
        />
      )}
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
    </>
  );

  // ---- Mobile: Drawer / Desktop: Dialog (via ResponsiveModal) ----
  return (
    <>
      <ResponsiveModal
        open={open}
        onClose={onClose}
        title={title}
        dialogClassName="max-w-3xl"
        footer={(isMobile) =>
          isMobile ? (
            <>
              <Button type="submit" form="category-form" disabled={isSubmitting} className="w-full">
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
              <Button type="submit" form="category-form" disabled={isSubmitting}>
                {submitLabel}
              </Button>
            </>
          )
        }
      >
        <form id="category-form" onSubmit={handleSubmit(onSubmit)}>
          <CategoryFormBody {...formBodyProps} />
        </form>
      </ResponsiveModal>
      {subDialogs}
    </>
  );
}
