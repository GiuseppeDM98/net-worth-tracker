'use client';

/**
 * The fields the Compravendita screens share: a choice as rows, a money or number input, the account
 * picker and the category picker (a category or one of its subcategories, by allowed type). Module-level,
 * controlled, no state of their own — the draft is the reducer's (lib/utils/realEstateOperationDraft.ts).
 */

import type { Asset } from '@/types/assets';
import type { ExpenseCategory, ExpenseType } from '@/types/expenses';
import { EXPENSE_TYPE_LABELS } from '@/types/expenses';
import type { CategoryChoice } from '@/types/realEstateOperation';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatCurrency } from '@/lib/utils/formatters';

export const FIELD_HEIGHT_CLASS = 'h-11 desktop:h-9';

/** A choice as 44px rows: a radio, the label, the description — never a dropdown for two or three options. */
export function ChoiceRows<T extends string>({
  name,
  value,
  options,
  onChange,
  label,
}: {
  name: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string; description?: string }>;
  onChange: (value: T) => void;
  /** The group's accessible name. */
  label: string;
}) {
  return (
    <RadioGroup value={value} onValueChange={(next) => onChange(next as T)} aria-label={label} className="divide-y divide-border rounded-xl border border-border">
      {options.map((option) => {
        const id = `${name}-${option.value}`;
        return (
          <div key={option.value} className="flex items-start gap-3 px-4 py-3">
            <RadioGroupItem value={option.value} id={id} className="mt-1" />
            <Label htmlFor={id} className="flex min-h-11 flex-1 cursor-pointer flex-col items-start justify-center gap-0.5 text-left desktop:min-h-0">
              <span className="text-[14px] font-medium text-foreground">{option.label}</span>
              {option.description && <span className="text-[13px] font-normal leading-[1.45] text-muted-foreground">{option.description}</span>}
            </Label>
          </div>
        );
      })}
    </RadioGroup>
  );
}

/** '' → null, a number otherwise: an empty field is «not typed», never 0. */
export function numberOrNull(value: string): number | null {
  const parsed = Number(value.replace(',', '.'));
  return value.trim() === '' || !Number.isFinite(parsed) ? null : parsed;
}

/** A labelled number input; `hint` is the line under it. */
export function NumberField({
  id,
  label,
  value,
  onChange,
  hint,
  step = '0.01',
  min = 0,
}: {
  id: string;
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  hint?: string | null;
  step?: string;
  min?: number;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        className={FIELD_HEIGHT_CLASS}
        value={value ?? ''}
        onChange={(event) => onChange(numberOrNull(event.target.value))}
        aria-describedby={hint ? `${id}-hint` : undefined}
      />
      {hint && (
        <p id={`${id}-hint`} className="text-[12px] text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

/** A labelled date input; `max` refuses the future where the event must have happened. */
export function DateField({ id, label, value, onChange, max }: { id: string; label: string; value: string; onChange: (iso: string) => void; max?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="date" className={FIELD_HEIGHT_CLASS} value={value} max={max} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

/** The cash accounts, with today's balance: where the money leaves or lands. */
export function AccountField({ id, label, accounts, value, onChange }: { id: string; label: string; accounts: readonly Asset[]; value: string; onChange: (id: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger id={id} className={FIELD_HEIGHT_CLASS}>
          <SelectValue placeholder="Scegli il conto" />
        </SelectTrigger>
        <SelectContent>
          {accounts.map((account) => (
            <SelectItem key={account.id} value={account.id}>
              {account.name} · {formatCurrency(account.quantity)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
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
        <SelectTrigger id={id} className={FIELD_HEIGHT_CLASS}>
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
