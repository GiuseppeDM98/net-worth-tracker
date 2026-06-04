'use client';

import { Brain } from 'lucide-react';
import { AssistantMemoryDocument, AssistantMemoryItem } from '@/types/assistant';

interface AssistantMemoryFactsProps {
  memory: AssistantMemoryDocument | undefined;
  /** Opens the full memory surface (sidebar tab on desktop, sheet on mobile). */
  onOpenMemory?: () => void;
}

// Cap the inline preview so the row stays a glance, not a list. The full set lives
// in the Memoria panel; this is just "what grounds the answers" at a glance.
const MAX_VISIBLE_FACTS = 4;

// Goals lead, then risk, then preferences, then plain facts — the order in which
// these matter when the assistant reasons about the user.
const CATEGORY_PRIORITY: Record<AssistantMemoryItem['category'], number> = {
  goal: 0,
  risk: 1,
  preference: 2,
  fact: 3,
};

/**
 * Compact "the assistant knows about you" row. Surfaces active memory items inline
 * so the user always sees what context shapes the answers, instead of having to
 * open a hidden panel to find out. Recognition over recall.
 */
export function AssistantMemoryFacts({ memory, onOpenMemory }: AssistantMemoryFactsProps) {
  const activeItems = (memory?.items ?? [])
    .filter((item) => item.status === 'active')
    .sort((a, b) => CATEGORY_PRIORITY[a.category] - CATEGORY_PRIORITY[b.category]);

  if (activeItems.length === 0) {
    return null;
  }

  const visible = activeItems.slice(0, MAX_VISIBLE_FACTS);
  const remaining = activeItems.length - visible.length;

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <Brain className="h-3.5 w-3.5" />
        L&apos;assistente sa di te:
      </span>
      {visible.map((item) => (
        <span
          key={item.id}
          title={item.text}
          className="inline-block max-w-[220px] truncate rounded-full border border-border bg-muted/40 px-2.5 py-0.5 align-middle text-foreground"
        >
          {item.text}
        </span>
      ))}
      {remaining > 0 && (
        <button
          type="button"
          onClick={onOpenMemory}
          className="rounded-full px-2 py-0.5 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          +{remaining} altri
        </button>
      )}
    </div>
  );
}
