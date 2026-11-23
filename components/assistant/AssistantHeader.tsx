'use client';

import { Brain, MessagesSquare, MoreHorizontal, Plus, Settings2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

interface AssistantHeaderProps {
  isDemo: boolean;
  isStreaming: boolean;
  threadsCount: number;
  /** A page of threads is still unread: the count is a floor, «più di N». */
  hasMoreThreads?: boolean;
  activeMemoryCount: number;
  /** «6 conversazioni · 3 obiettivi e 3 fatti in memoria» — from `describeAssistantHeader`. */
  description: string;
  onNewThread: () => void;
  onOpenThreads: () => void;
  onOpenMemory: () => void;
  onOpenPreferences: () => void;
  /** The copy of «⋯» last pressed or focused: the modal a menu item opens returns the focus there. */
  moreTriggerRef: React.RefObject<HTMLButtonElement | null>;
}

/** «Nuova conversazione» names why it is off in the demo. */
export function newThreadLabel(isDemo: boolean): string {
  return isDemo ? 'Nuova conversazione — non disponibile in modalità demo' : 'Nuova conversazione';
}

/**
 * The compact page header of the Assistente as a chat (2026-11-12): eyebrow · title · a generated
 * description that carries the counts (conversations, goals, facts), and two buttons — «⋯», a menu
 * of Conversazioni, Memoria and Preferenze (each opens its modal: the shell's own pattern, and a
 * bottom sheet below 769px), and the ONE primary action «Nuova conversazione». A registration is
 * written in the composer: there is no «Registra» button. Every action is 44px below `desktop:`.
 * Preferenze is a modal, never a menu: it holds a Select and Switches.
 */
export function AssistantHeader({
  isDemo,
  isStreaming,
  threadsCount,
  hasMoreThreads = false,
  activeMemoryCount,
  description,
  onNewThread,
  onOpenThreads,
  onOpenMemory,
  onOpenPreferences,
  moreTriggerRef,
}: AssistantHeaderProps) {
  const threadsLabel = isDemo
    ? 'Conversazioni — non disponibili in modalità demo'
    : threadsCount > 0
      ? `Conversazioni (${hasMoreThreads ? 'più di ' : ''}${threadsCount})`
      : 'Conversazioni';

  return (
    <PageHeader
      emblem="assistente"
      label="Assistente AI"
      title="Una frase, una risposta"
      description={description}
      actions={
        <>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-11 w-11 desktop:h-9 desktop:w-9"
                aria-label="Altre azioni dell'assistente"
                // PageHeader renders the actions twice: the copy used records itself.
                onPointerDown={(event) => { moreTriggerRef.current = event.currentTarget; }}
                onFocus={(event) => { moreTriggerRef.current = event.currentTarget; }}
              >
                <MoreHorizontal className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuItem disabled={isDemo} onSelect={onOpenThreads}>
                <MessagesSquare className="size-4" aria-hidden="true" />
                {threadsLabel}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onOpenMemory}>
                <Brain className="size-4" aria-hidden="true" />
                {activeMemoryCount > 0 ? `Memoria (${activeMemoryCount})` : 'Memoria'}
              </DropdownMenuItem>
              <DropdownMenuItem disabled={isDemo} onSelect={onOpenPreferences}>
                <Settings2 className="size-4" aria-hidden="true" />
                Preferenze
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* The ONE primary action. Icon-only below desktop — the sticky navbar has no room for the label. */}
          <Button
            onClick={onNewThread}
            disabled={isDemo || isStreaming}
            className="h-11 w-11 p-0 desktop:h-9 desktop:w-auto desktop:px-4"
            aria-label={newThreadLabel(isDemo)}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span className="hidden desktop:inline">Nuova conversazione</span>
          </Button>
        </>
      }
    />
  );
}
