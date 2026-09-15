'use client';

import { useEffect, useRef } from 'react';
import { Trash2 } from 'lucide-react';
import type { BudgetKind } from '@/types/budget';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useArmedDelete } from '@/lib/hooks/useArmedDelete';
import { describeBudgetDeleteConsequence } from '@/lib/utils/budgetNarrative';

interface BudgetDeleteButtonProps {
  /** The row's label, as the tile prints it («Cibo», «Casa › Bollette»). */
  label: string;
  kind: BudgetKind;
  disabled: boolean;
  onDelete: () => void;
  /** The tile's ONE live region: arm and disarm are sentences, spoken there. */
  announce: (text: string) => void;
  /** The tile prints the consequence IN the row while the button is armed. */
  onArmedChange: (armed: boolean) => void;
  /** `icon` in a dense row (32px with a mouse, 44 on touch); `wide` in the phone's expanded row. */
  variant: 'icon' | 'wide';
  className?: string;
}

/**
 * The two-click delete of a budget row (`useArmedDelete`, no timer): the armed button reads
 * «Conferma» in words — on a desktop row it used to change only the icon's tint and its
 * `aria-label`, which a focused screen reader never re-reads (2026-09-14) — the ROW prints
 * the consequence, and the tile's live region announces arm and disarm once each. Escape
 * and blur disarm; the second press deletes.
 */
export function BudgetDeleteButton({ label, kind, disabled, onDelete, announce, onArmedChange, variant, className }: BudgetDeleteButtonProps) {
  const ref = useRef<HTMLButtonElement | null>(null);
  const { armed, onClick, onBlur } = useArmedDelete(ref, onDelete);

  // Each transition is announced once, after the render where the state flipped; the disarm
  // only when an arm preceded it (the first render is not a cancellation).
  const wasArmed = useRef(false);
  const subject = kind === 'income' ? `l'obiettivo di ${label}` : `il budget di ${label}`;
  useEffect(() => {
    if (armed) {
      wasArmed.current = true;
      announce(`Premi di nuovo per eliminare ${subject}`);
      onArmedChange(true);
    } else if (wasArmed.current) {
      wasArmed.current = false;
      announce('Eliminazione annullata');
      onArmedChange(false);
    }
  }, [armed, announce, onArmedChange, subject]);

  const consequence = describeBudgetDeleteConsequence(kind, label);
  const name = armed ? `Conferma eliminazione budget ${label}. ${consequence}` : `Elimina budget ${label}`;

  if (variant === 'wide') {
    return (
      <Button
        ref={ref}
        variant="outline"
        className={cn('h-11', armed && 'border-destructive text-destructive', className)}
        disabled={disabled}
        aria-pressed={armed}
        aria-label={name}
        onClick={onClick}
        onBlur={onBlur}
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
        {armed ? 'Conferma' : 'Elimina'}
      </Button>
    );
  }

  return (
    <Button
      ref={ref}
      size="icon"
      variant="ghost"
      className={cn(
        'h-11 w-11 desktop:h-8 desktop:w-8',
        armed && 'w-auto border border-destructive px-2 text-[12px] font-medium text-destructive hover:text-destructive desktop:w-auto',
        className,
      )}
      disabled={disabled}
      aria-pressed={armed}
      aria-label={name}
      onClick={onClick}
      onBlur={onBlur}
    >
      {armed ? 'Conferma' : <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />}
    </Button>
  );
}
