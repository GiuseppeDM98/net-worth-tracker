'use client';

import { Brain, MessagesSquare, Plus } from 'lucide-react';
import { AssistantPreferencesPopover } from '@/components/assistant/AssistantPreferencesPopover';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { AssistantMemoryDocument, AssistantPreferences } from '@/types/assistant';

interface AssistantHeaderProps {
  isDemo: boolean;
  isStreaming: boolean;
  threadsCount: number;
  activeMemoryCount: number;
  /** «6 conversazioni · 3 obiettivi e 3 fatti in memoria» — from `describeAssistantHeader`. */
  description: string;
  memory: AssistantMemoryDocument | undefined;
  loadingMemory: boolean;
  isPreferencesPending: boolean;
  onPreferencesChange: (patch: Partial<AssistantPreferences>) => void;
  onNewThread: () => void;
  onOpenThreads: () => void;
  onOpenMemory: () => void;
}

/** Small count dot overlaid on an icon action — visual only, the count is in the aria-label. */
function CountDot({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span
      aria-hidden="true"
      className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 font-mono text-[10px] font-medium text-primary-foreground"
    >
      {count > 99 ? '99' : count}
    </span>
  );
}

/**
 * The compact page header of the Assistente: eyebrow · title · a generated description that
 * carries the counts (conversations, goals, facts), and ONE primary action — «Nuova
 * conversazione». Conversazioni and Memoria are icon actions wearing their count as a dot (the
 * description says the same in words, the dot is what the eye finds); Preferenze is the third.
 * The guide that used to open from a «?» here is the «Come funziona» disclosure below the grid.
 */
export function AssistantHeader({
  isDemo,
  isStreaming,
  threadsCount,
  activeMemoryCount,
  description,
  memory,
  loadingMemory,
  isPreferencesPending,
  onPreferencesChange,
  onNewThread,
  onOpenThreads,
  onOpenMemory,
}: AssistantHeaderProps) {
  return (
    <PageHeader
      label="Assistente AI"
      title="Un periodo, una risposta"
      description={description}
      actions={
        <>
          <Button
            variant="ghost"
            size="icon"
            className="relative h-9 w-9"
            disabled={isDemo}
            aria-label={
              isDemo
                ? 'Conversazioni — non disponibili in modalità demo'
                : threadsCount > 0
                  ? `Conversazioni (${threadsCount})`
                  : 'Conversazioni'
            }
            onClick={onOpenThreads}
          >
            <MessagesSquare className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <CountDot count={threadsCount} />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="relative h-9 w-9"
            aria-label={activeMemoryCount > 0 ? `Memoria (${activeMemoryCount})` : 'Memoria'}
            onClick={onOpenMemory}
          >
            <Brain className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <CountDot count={activeMemoryCount} />
          </Button>

          {/* Unified behaviour preferences (style, web context, memory on/off) — a Popover,
              never a DropdownMenu: it holds a Select and Switches. */}
          <AssistantPreferencesPopover
            memory={memory}
            onChange={onPreferencesChange}
            isLoading={loadingMemory}
            isPending={isPreferencesPending}
            disabled={isDemo}
          />

          {/* The ONE primary action. Icon-only below desktop — the sticky navbar has no room for the label. */}
          <Button
            onClick={onNewThread}
            disabled={isDemo || isStreaming}
            className="h-9 w-9 p-0 desktop:w-auto desktop:px-4"
            aria-label={isDemo ? 'Nuova conversazione — non disponibile in modalità demo' : 'Nuova conversazione'}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span className="hidden desktop:inline">Nuova conversazione</span>
          </Button>
        </>
      }
    />
  );
}
