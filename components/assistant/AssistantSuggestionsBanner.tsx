'use client';

import { CheckCircle2, X } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { useUpdateAssistantMemory } from '@/lib/hooks/useAssistantMemory';
import { AssistantMemoryDocument } from '@/types/assistant';

interface AssistantSuggestionsBannerProps {
  userId: string;
  memory: AssistantMemoryDocument | undefined;
  /** Disabled while a response is streaming to avoid concurrent memory writes. */
  disabled?: boolean;
}

/**
 * Proactive goal-completion banner shown at the top of the conversation column.
 *
 * When the server detects that a tracked goal has likely been reached it stores a
 * pending suggestion. Previously this surfaced only inside the second sidebar tab,
 * so the "you reached your target" moment could go unseen for weeks. Pulling it
 * into the main flow makes the assistant feel like it is watching with the user.
 *
 * Accept/ignore persist through React Query and invalidate the memory cache, so
 * the banner empties itself as suggestions are resolved.
 */
export function AssistantSuggestionsBanner({ userId, memory, disabled }: AssistantSuggestionsBannerProps) {
  const prefersReducedMotion = useReducedMotion();
  const chartColors = useChartColors();
  const updateMutation = useUpdateAssistantMemory(userId);

  // goal → chart[0] gives a theme-aware accent that stays on-brand across all six themes.
  const accent = chartColors[0] ?? 'var(--chart-1)';
  const pendingSuggestions = (memory?.suggestions ?? []).filter((s) => s.status === 'pending');

  if (pendingSuggestions.length === 0) {
    return null;
  }

  const handleAccept = async (suggestionId: string, itemId: string) => {
    try {
      await updateMutation.mutateAsync({ action: 'acceptSuggestion', suggestionId, itemId });
      toast.success('Obiettivo segnato come completato');
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const handleIgnore = async (suggestionId: string) => {
    try {
      await updateMutation.mutateAsync({ action: 'ignoreSuggestion', suggestionId });
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  return (
    <div className="mb-4 space-y-2">
      <AnimatePresence initial={false}>
        {pendingSuggestions.map((suggestion) => {
          const linkedItem = memory?.items.find((item) => item.id === suggestion.itemId);
          if (!linkedItem) return null;

          return (
            <motion.div
              key={suggestion.id}
              initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0, marginBottom: 0 }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}
              className="rounded-xl p-4"
              // color-mix keeps the tint readable on every theme background.
              style={{
                overflow: 'hidden',
                border: `1px solid color-mix(in srgb, ${accent} 30%, transparent)`,
                backgroundColor: `color-mix(in srgb, ${accent} 8%, transparent)`,
              }}
            >
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" style={{ color: accent }} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">Obiettivo raggiunto</p>
                  <p className="mt-0.5 text-sm text-foreground">{linkedItem.text}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{suggestion.evidenceSummary}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleAccept(suggestion.id, linkedItem.id)}
                      disabled={disabled || updateMutation.isPending}
                    >
                      Segna come completato
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleIgnore(suggestion.id)}
                      disabled={disabled || updateMutation.isPending}
                    >
                      <X className="mr-1 h-3.5 w-3.5" />
                      Ignora
                    </Button>
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
