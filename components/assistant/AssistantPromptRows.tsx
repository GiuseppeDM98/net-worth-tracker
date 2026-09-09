'use client';

import { ChevronRight, Globe, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PromptRow {
  id: string;
  label: string;
  /** The row that targets the active period: bold, with a spark before it. */
  primary?: boolean;
  /** A row that also pulls in a web search for macro context: a globe before it. */
  webSearch?: boolean;
}

interface AssistantPromptRowsProps {
  rows: PromptRow[];
  onSelect: (row: PromptRow) => void;
  disabled?: boolean;
  /** Accessible name of the list («Domande suggerite», «Continua con»). */
  ariaLabel: string;
}

/**
 * Suggested questions as flat `divide-y` rows inside the Conversazione tile — the starter
 * prompts of the empty state and the follow-ups after an answer. Rows, never chips: a wrap of
 * pills inside a tile reads as a second control register, and a row is a 44px target on a
 * phone by construction (`desktop:` drops it to the tile's 13px cadence).
 */
export function AssistantPromptRows({ rows, onSelect, disabled, ariaLabel }: AssistantPromptRowsProps) {
  if (rows.length === 0) return null;

  return (
    <ul className="divide-y divide-border" aria-label={ariaLabel}>
      {rows.map((row) => (
        <li key={row.id}>
          <button
            type="button"
            onClick={() => onSelect(row)}
            disabled={disabled}
            className={cn(
              'flex min-h-11 w-full items-center gap-2.5 py-[9px] text-left text-[13px] text-foreground transition-colors',
              'hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
              'disabled:pointer-events-none disabled:opacity-50',
              'desktop:-mx-2 desktop:min-h-0 desktop:w-[calc(100%+16px)] desktop:rounded-md desktop:px-2',
              row.primary && 'font-semibold',
            )}
          >
            {row.primary ? (
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            ) : row.webSearch ? (
              <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            ) : (
              <span className="w-3.5 shrink-0" aria-hidden="true" />
            )}
            <span className="min-w-0 flex-1">{row.label}</span>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}
