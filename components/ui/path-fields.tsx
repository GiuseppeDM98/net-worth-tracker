'use client';

/**
 * The fields the guided paths share (Compravendita, the plan of accumulation): a money or number input
 * and the account picker. Module-level, controlled, no state of their own — each path's draft is its
 * reducer's. Compravendita's date and category pickers stay in components/assets/compravendita/fields.tsx.
 */

import type { Asset } from '@/types/assets';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatCurrency } from '@/lib/utils/formatters';

/** 44 px to touch below `desktop:`, 36 px from it. */
export const PATH_FIELD_HEIGHT_CLASS = 'h-11 desktop:h-9';

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
  placeholder,
}: {
  id: string;
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  hint?: string | null;
  step?: string;
  min?: number;
  placeholder?: string;
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
        placeholder={placeholder}
        className={PATH_FIELD_HEIGHT_CLASS}
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

/** The cash accounts, with today's balance: where the money leaves or lands. */
export function AccountField({ id, label, accounts, value, onChange }: { id: string; label: string; accounts: readonly Asset[]; value: string; onChange: (id: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger id={id} className={PATH_FIELD_HEIGHT_CLASS}>
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
