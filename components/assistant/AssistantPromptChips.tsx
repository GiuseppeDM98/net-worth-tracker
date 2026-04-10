'use client';

import { Globe } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { AssistantPromptChip } from '@/types/assistant';
import { cn } from '@/lib/utils';

interface AssistantPromptChipsProps {
  chips: AssistantPromptChip[];
  /** Called when a chip is clicked. Parent decides whether to submit directly or prefill. */
  onSelect: (chip: AssistantPromptChip) => void;
  disabled?: boolean;
}

// Stagger interval between chips — short enough to feel snappy, long enough to read.
const CHIP_STAGGER_MS = 40;

/**
 * Renders the initial prompt chip grid shown in the hero state (no messages yet).
 * Chips with requiresMonthContext trigger direct submission; others prefill the composer.
 *
 * Chips mount with a staggered fade-up so the grid reads left-to-right instead of
 * popping in all at once. Stagger collapses to zero under prefers-reduced-motion.
 */
export function AssistantPromptChips({ chips, onSelect, disabled }: AssistantPromptChipsProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((chip, index) => (
        <motion.button
          key={chip.id}
          type="button"
          onClick={() => onSelect(chip)}
          disabled={disabled}
          // Stagger each chip's entrance by its index.
          // Under reduced motion the animation collapses to an instant opacity fade.
          initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: prefersReducedMotion ? 0 : 0.28,
            delay: prefersReducedMotion ? 0 : index * (CHIP_STAGGER_MS / 1000),
            ease: [0.22, 1, 0.36, 1],
          }}
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
        </motion.button>
      ))}
    </div>
  );
}
