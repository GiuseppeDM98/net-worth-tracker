'use client';

import { AssistantMemoryPanel } from '@/components/assistant/AssistantMemoryPanel';
import { AssistantPreferencesFields } from '@/components/assistant/AssistantPreferencesFields';
import { AssistantThreadList } from '@/components/assistant/AssistantThreadList';
import { ResponsiveModal } from '@/components/ui/responsive-modal';
import { describeMemory, describeThreadsReading } from '@/lib/utils/assistantNarrative';
import { AssistantMemoryDocument, AssistantPreferences, AssistantThread } from '@/types/assistant';

interface AssistantModalsProps {
  ownerId: string | undefined;
  isThreadsOpen: boolean;
  onThreadsOpenChange: (open: boolean) => void;
  isMemoryOpen: boolean;
  onMemoryOpenChange: (open: boolean) => void;
  threads: AssistantThread[];
  loadingThreads: boolean;
  hasMoreThreads: boolean;
  loadingMoreThreads: boolean;
  onLoadMoreThreads: () => void;
  selectedThreadId: string | undefined;
  isStreaming: boolean;
  isDeletingId: string | undefined;
  onSelectThread: (thread: AssistantThread) => void;
  onDeleteThread: (threadId: string) => void;
  memory: AssistantMemoryDocument | undefined;
  loadingMemory: boolean;
  isPreferencesOpen: boolean;
  onPreferencesOpenChange: (open: boolean) => void;
  onPreferencesChange: (patch: Partial<AssistantPreferences>) => void;
  isPreferencesPending: boolean;
  isDemo: boolean;
  /**
   * Where each modal returns the focus: the «⋯» copy that opened its menu (a menu item is unmounted
   * when its modal opens, so the modal's own restore would land on `body`); null for a modal opened
   * by a button that stays mounted («Apri memoria»), whose own restore then holds.
   */
  returnFocusTo: React.RefObject<HTMLElement | null>;
}

/**
 * The three overlay surfaces of the assistant — Conversazioni, Memoria and Preferenze (2026-11-12,
 * a header popover until then; each opened from the header's «⋯») — in the app's one
 * modal vocabulary (doc/guide/dialog.md): a bottom sheet on a phone, a centred dialog above.
 * They were right-side `Sheet`s until 2026-09-18, the last two surfaces with a 14px title.
 *
 * What made them overlays still holds: the companion column must never become a second
 * nested-scroll box, so neither list is ever rendered inline.
 * Open state lives in the page because several surfaces open them. None has a footer: a list to
 * pick from, a panel to tend and preferences that save on change ask for no decision of their own.
 */
export function AssistantModals({
  ownerId,
  isThreadsOpen,
  onThreadsOpenChange,
  isMemoryOpen,
  onMemoryOpenChange,
  threads,
  loadingThreads,
  hasMoreThreads,
  loadingMoreThreads,
  onLoadMoreThreads,
  selectedThreadId,
  isStreaming,
  isDeletingId,
  onSelectThread,
  onDeleteThread,
  memory,
  loadingMemory,
  isPreferencesOpen,
  onPreferencesOpenChange,
  onPreferencesChange,
  isPreferencesPending,
  isDemo,
  returnFocusTo,
}: AssistantModalsProps) {
  // The same three counts the companion's «Cosa sa di te» tile reads, so the modal opens on
  // the sentence the reader pressed.
  const activeItems = (memory?.items ?? []).filter((item) => item.status === 'active');
  const goals = activeItems.filter((item) => item.category === 'goal');
  const reachedGoals = goals.filter((goal) => goal.lastEvaluationResult?.matched).length;

  return (
    <>
      <ResponsiveModal
        open={isThreadsOpen}
        onClose={() => onThreadsOpenChange(false)}
        width="md"
        returnFocusTo={returnFocusTo}
        eyebrow="Assistente · Conversazioni"
        title="Riprendi una conversazione"
        reading={{
          narrative: describeThreadsReading({ count: threads.length, loading: loadingThreads, hasMore: hasMoreThreads }),
          tone: 'neutral',
        }}
      >
        <AssistantThreadList
          threads={threads}
          loadingThreads={loadingThreads}
          hasMoreThreads={hasMoreThreads}
          loadingMoreThreads={loadingMoreThreads}
          onLoadMore={onLoadMoreThreads}
          selectedThreadId={selectedThreadId}
          isStreaming={isStreaming}
          isDeletingId={isDeletingId}
          onSelect={(thread) => {
            onSelectThread(thread);
            onThreadsOpenChange(false);
          }}
          onDelete={onDeleteThread}
        />
      </ResponsiveModal>

      {ownerId && (
        <ResponsiveModal
          open={isMemoryOpen}
          onClose={() => onMemoryOpenChange(false)}
          width="lg"
          returnFocusTo={returnFocusTo}
          eyebrow="Assistente · Memoria"
          title="Cosa sa di te"
          reading={
            loadingMemory
              ? 'Sto leggendo la memoria.'
              : {
                  narrative: describeMemory({
                    activeGoals: goals.length,
                    reachedGoals,
                    otherFacts: activeItems.length - goals.length,
                  }),
                  tone: 'neutral',
                }
          }
        >
          <AssistantMemoryPanel userId={ownerId} memory={memory} isLoading={loadingMemory} />
        </ResponsiveModal>
      )}

      <ResponsiveModal
        open={isPreferencesOpen}
        onClose={() => onPreferencesOpenChange(false)}
        width="sm"
        returnFocusTo={returnFocusTo}
        eyebrow="Assistente · Preferenze"
        title="Come risponde l'Assistente"
        reading="Le scelte valgono per ogni conversazione e si salvano da sole."
      >
        <AssistantPreferencesFields
          memory={memory}
          onChange={onPreferencesChange}
          isLoading={loadingMemory}
          isPending={isPreferencesPending}
          disabled={isDemo}
        />
      </ResponsiveModal>
    </>
  );
}
