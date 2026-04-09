'use client';

import { Globe } from 'lucide-react';
import { AssistantPromptChip } from '@/types/assistant';
import { cn } from '@/lib/utils';

interface AssistantPromptChipsProps {
  chips: AssistantPromptChip[];
  /** Called when a chip is clicked. Parent decides whether to submit directly or prefill. */
  onSelect: (chip: AssistantPromptChip) => void;
  disabled?: boolean;
}

/**
 * Renders the initial prompt chip grid shown in the hero state (no messages yet).
 * Chips with requiresMonthContext trigger direct submission; others prefill the composer.
 */
export function AssistantPromptChips({ chips, onSelect, disabled }: AssistantPromptChipsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((chip) => (
        <button
          key={chip.id}
          type="button"
          onClick={() => onSelect(chip)}
          disabled={disabled}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-2 text-left text-sm text-foreground transition-colors',
            'hover:bg-muted hover:border-border/80',
            'disabled:pointer-events-none disabled:opacity-50',
            // Slightly highlight chips that also pull in web context
            chip.webContextHint === 'macro' && 'border-dashed',
          )}
        >
          {chip.webContextHint === 'macro' && (
            <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
          {chip.label}
        </button>
      ))}
    </div>
  );
}
