'use client';

/**
 * The fields only the Compravendita screens use: the date and the category picker (a category or one of
 * its subcategories, by allowed type). Module-level, controlled, no state of their own — the draft is the
 * reducer's (lib/utils/realEstateOperationDraft.ts). The number input and the account picker every guided
 * path shares live in components/ui/path-fields.tsx (2026-11-20).
 * A choice as rows is the shared `ChoiceList` (components/ui/choice-list.tsx, since 2026-11-07).
 */

import type { ExpenseCategory, ExpenseType } from '@/types/expenses';
import { EXPENSE_TYPE_LABELS } from '@/types/expenses';
import type { CategoryChoice } from '@/types/realEstateOperation';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PATH_FIELD_HEIGHT_CLASS } from '@/components/ui/path-fields';

/** A labelled date input; `max` refuses the future where the event must have happened. */
export function DateField({ id, label, value, onChange, max }: { id: string; label: string; value: string; onChange: (iso: string) => void; max?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="date" className={PATH_FIELD_HEIGHT_CLASS} value={value} max={max} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

const SUB_SEPARATOR = '::';
const encodeChoice = (choice: CategoryChoice | null): string | undefined => (choice ? (choice.subCategoryId ? `${choice.categoryId}${SUB_SEPARATOR}${choice.subCategoryId}` : choice.categoryId) : undefined);
const decodeChoice = (value: string): CategoryChoice => {
  const [categoryId, subCategoryId] = value.split(SUB_SEPARATOR);
  return subCategoryId ? { categoryId, subCategoryId } : { categoryId };
};

/**
 * A category or one of its subcategories, among the categories of the allowed types — one Select, the
 * categories as groups (their type in the group's label when more than one type is allowed).
 */
export function CategoryField({
  id,
  label,
  categories,
  allowed,
  value,
  onChange,
}: {
  id: string;
  label: string;
  categories: readonly ExpenseCategory[];
  allowed: readonly ExpenseType[];
  value: CategoryChoice | null;
  onChange: (choice: CategoryChoice | null) => void;
}) {
  const options = categories.filter((category) => allowed.includes(category.type)).sort((a, b) => a.name.localeCompare(b.name, 'it'));
  const typed = allowed.length > 1;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={encodeChoice(value)} onValueChange={(next) => onChange(decodeChoice(next))}>
        <SelectTrigger id={id} className={PATH_FIELD_HEIGHT_CLASS}>
          <SelectValue placeholder={options.length === 0 ? 'Nessuna categoria di questo tipo' : 'Scegli la categoria'} />
        </SelectTrigger>
        <SelectContent>
          {options.map((category) => (
            <SelectGroup key={category.id}>
              <SelectLabel>
                {category.name}
                {typed ? ` · ${EXPENSE_TYPE_LABELS[category.type]}` : ''}
              </SelectLabel>
              <SelectItem value={category.id}>{category.name}</SelectItem>
              {[...category.subCategories]
                .sort((a, b) => a.name.localeCompare(b.name, 'it'))
                .map((sub) => (
                  <SelectItem key={sub.id} value={`${category.id}${SUB_SEPARATOR}${sub.id}`}>
                    {category.name} › {sub.name}
                  </SelectItem>
                ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
