'use client';

import type { ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface AuthFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
  disabled?: boolean;
  /** What sits at the right of the label row: a muted note, or the reveal control. */
  trailing?: ReactNode;
}

/**
 * One labelled field of the authentication form: the label row, then the app's 36px input.
 *
 * The label is a real 12px label ABOVE the field rather than the boxed shell the old pages
 * drew around each input — a bordered box containing a label and a borderless input is a
 * card inside a card, and it cost the field its own focus ring.
 */
export function AuthField({
  id,
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  autoComplete,
  required,
  disabled,
  trailing,
}: AuthFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex min-h-4 items-baseline justify-between gap-3">
        <Label htmlFor={id} className="text-xs font-medium tracking-[0.01em] text-muted-foreground">
          {label}
        </Label>
        {trailing}
      </div>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        disabled={disabled}
        className="text-sm"
      />
    </div>
  );
}

interface PasswordRevealProps {
  shown: boolean;
  onToggle: () => void;
  disabled?: boolean;
  /** Names WHICH password this reveals, so two controls on one form differ to a reader. */
  fieldLabel: string;
}

/**
 * The show/hide control of a password field, as a word rather than an eye glyph.
 *
 * `h-11` meets the 44px touch target of WCAG 2.5.5 while `-my-3.5` absorbs the extra ink in
 * layout, so the label row stays 16px tall and the field's geometry matches the ones with no
 * control (AGENTS.md → Accessibility: the target is the hit area, not the visible box).
 */
export function PasswordReveal({ shown, onToggle, disabled, fieldLabel }: PasswordRevealProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={shown}
      aria-label={shown ? `Nascondi ${fieldLabel}` : `Mostra ${fieldLabel}`}
      className="-my-3.5 -mr-2 inline-flex h-11 shrink-0 items-center rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50 motion-reduce:transition-none"
    >
      {shown ? 'Nascondi' : 'Mostra'}
    </button>
  );
}
