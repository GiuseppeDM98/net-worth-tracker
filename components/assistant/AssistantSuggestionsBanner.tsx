'use client';

import { Check, X } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { describeWriteError } from '@/lib/utils/dialogNarrative';
import { Tile } from '@/components/ui/tile';
import { useUpdateAssistantMemory } from '@/lib/hooks/useAssistantMemory';
import { formatDate } from '@/lib/utils/formatters';
import { AssistantMemoryDocument } from '@/types/assistant';

interface AssistantSuggestionsBannerProps {
  userId: string;
  memory: AssistantMemoryDocument | undefined;
  /** Disabled while a response is streaming to avoid concurrent memory writes. */
  disabled?: boolean;
}

/**
 * «Obiettivo raggiunto» — one tile per pending suggestion, above the conversation, in any
 * state. When the daily evaluation finds a tracked goal reached it stores a suggestion; here
 * it is a tile at the page's cadence (eyebrow, the goal and its evidence as the reading, the
 * two actions), not a tinted banner: the chrome of the default theme has no hue, and a reached
 * goal is the one place the positive token is a verdict rather than decoration.
 *
 * «Ignora» is durable: the server compares the ignore against the item's `updatedAt`, so the
 * suggestion comes back only after the goal itself changes (AGENTS.md → Assistant).
 */
export function AssistantSuggestionsBanner({ userId, memory, disabled }: AssistantSuggestionsBannerProps) {
  const prefersReducedMotion = useReducedMotion();
  const updateMutation = useUpdateAssistantMemory(userId);

  const pendingSuggestions = (memory?.suggestions ?? []).filter((s) => s.status === 'pending');
  if (pendingSuggestions.length === 0) return null;

  const handleAccept = async (suggestionId: string, itemId: string) => {
    try {
      await updateMutation.mutateAsync({ action: 'acceptSuggestion', suggestionId, itemId });
      toast.success('Obiettivo segnato come completato');
    } catch (error) {
      toast.error(describeWriteError(error));
    }
  };

  const handleIgnore = async (suggestionId: string) => {
    try {
      await updateMutation.mutateAsync({ action: 'ignoreSuggestion', suggestionId });
    } catch (error) {
      toast.error(describeWriteError(error));
    }
  };

  return (
    <AnimatePresence initial={false}>
      {pendingSuggestions.map((suggestion) => {
        const linkedItem = memory?.items.find((item) => item.id === suggestion.itemId);
        if (!linkedItem) return null;

        return (
          <motion.div
            key={suggestion.id}
            initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <Tile
              eyebrow="Obiettivo raggiunto"
              ariaLabel={`Obiettivo raggiunto: ${linkedItem.text}`}
              aside={linkedItem.lastEvaluationAt ? `verificato il ${formatDate(linkedItem.lastEvaluationAt)}` : undefined}
              reading={[{ text: `${linkedItem.text}: ${suggestion.evidenceSummary}` }]}
            >
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={() => handleAccept(suggestion.id, linkedItem.id)} disabled={disabled || updateMutation.isPending}>
                  <Check className="h-3.5 w-3.5 text-positive" aria-hidden="true" />
                  Segna come completato
                </Button>
                <Button size="sm" variant="ghost" onClick={() => handleIgnore(suggestion.id)} disabled={disabled || updateMutation.isPending}>
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                  Ignora
                </Button>
              </div>
            </Tile>
          </motion.div>
        );
      })}
    </AnimatePresence>
  );
}
