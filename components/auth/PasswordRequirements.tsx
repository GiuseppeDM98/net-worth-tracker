'use client';

import { Check, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PasswordRequirement } from '@/lib/utils/authNarrative';

/**
 * The password rules as rows that tick, not as a paragraph: the reader sees which of the
 * two conditions is already satisfied while typing, instead of discovering it on submit.
 *
 * A met row takes the check icon and `text-foreground`, NEVER `text-positive`: the sign
 * tokens mean money gained and money lost (DESIGN.md → The Sign-Color Token Rule), and a
 * satisfied requirement is neither. The icon carries the state, the colour only the
 * emphasis — so the distinction survives a monochrome rendering too.
 */
export function PasswordRequirements({ requirements }: { requirements: PasswordRequirement[] }) {
  return (
    <ul className="mt-3.5 flex flex-col gap-1.5">
      {requirements.map((requirement) => (
        <li key={requirement.id} className="flex items-center gap-2">
          {requirement.met ? (
            <Check className="size-3.5 shrink-0 text-foreground" strokeWidth={2.5} aria-hidden="true" />
          ) : (
            <Circle className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
          )}
          <span
            className={cn(
              'text-[13px] leading-[1.45]',
              requirement.met ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            {requirement.label}
            {/* The icon is the only visual carrier of the state, so the state is spelled
                out for a screen reader rather than left to the glyph. */}
            <span className="sr-only">{requirement.met ? ': soddisfatto' : ': non ancora soddisfatto'}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
