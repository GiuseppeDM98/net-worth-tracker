'use client';

import { CornerDownRight } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { AssistantFollowUp } from '@/lib/utils/assistantFollowUps';
import { cn } from '@/lib/utils';

interface AssistantFollowUpsProps {
  followUps: AssistantFollowUp[];
  /** Sends the follow-up prompt immediately — the period is already fixed by the thread. */
  onSelect: (prompt: string) => void;
  disabled?: boolean;
}

// Short stagger so the row reads left-to-right rather than popping in at once.
const CHIP_STAGGER_MS = 40;

/**
 * Suggested next questions shown after a completed assistant answer (Blocco B1).
 *
 * Clicking a chip submits its prompt directly: the thread already carries the
 * period, so there is nothing left to choose — sending right away keeps momentum.
 */
export function AssistantFollowUps({ followUps, onSelect, disabled }: AssistantFollowUpsProps) {
  const prefersReducedMotion = useReducedMotion();

  if (followUps.length === 0) {
    return null;
  }

  return (
    <div className="mt-4">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-widest text-muted-foreground">
        <CornerDownRight className="h-3.5 w-3.5" />
        Continua con
      </p>
      <div className="flex flex-wrap gap-2">
        {followUps.map((followUp, index) => (
          <motion.button
            key={followUp.id}
            type="button"
            onClick={() => onSelect(followUp.prompt)}
            disabled={disabled}
            initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: prefersReducedMotion ? 0 : 0.24,
              delay: prefersReducedMotion ? 0 : index * (CHIP_STAGGER_MS / 1000),
              ease: [0.22, 1, 0.36, 1],
            }}
            className={cn(
              'rounded-full border border-border px-3.5 py-2 text-left text-sm text-foreground transition-colors',
              'hover:bg-muted hover:border-border/80',
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
              'disabled:pointer-events-none disabled:opacity-50'
            )}
          >
            {followUp.label}
          </motion.button>
        ))}
      </div>
    </div>
  );
}
