'use client';

import { AssistantMemoryPanel } from '@/components/assistant/AssistantMemoryPanel';
import { AssistantThreadList } from '@/components/assistant/AssistantThreadList';
import { ResponsiveModal } from '@/components/ui/responsive-modal';
import { describeMemory, describeThreadsReading } from '@/lib/utils/assistantNarrative';
import { AssistantMemoryDocument, AssistantThread } from '@/types/assistant';

interface AssistantModalsProps {
  ownerId: string | undefined;
  isThreadsOpen: boolean;
  onThreadsOpenChange: (open: boolean) => void;
  isMemoryOpen: boolean;
  onMemoryOpenChange: (open: boolean) => void;
  threads: AssistantThread[];
  loadingThreads: boolean;
  selectedThreadId: string | undefined;
  isStreaming: boolean;
  isDeletingId: string | undefined;
  onSelectThread: (thread: AssistantThread) => void;
  onDeleteThread: (threadId: string) => void;
  memory: AssistantMemoryDocument | undefined;
  loadingMemory: boolean;
}

/**
 * The two overlay surfaces of the assistant — Conversazioni and Memoria — in the app's one
 * modal vocabulary (doc/guide/dialog.md): a bottom sheet on a phone, a centred dialog above.
 * They were right-side `Sheet`s until 2026-09-18, the last two surfaces with a 14px title.
 *
 * What made them overlays still holds: the companion column must never become a second
 * nested-scroll box, so neither list is ever rendered inline.
 * Open state lives in the page because several surfaces open them. Neither has a footer: a
 * list to pick from and a panel to tend ask for no decision of their own.
 */
export function AssistantModals({
  ownerId,
  isThreadsOpen,
  onThreadsOpenChange,
  isMemoryOpen,
  onMemoryOpenChange,
  threads,
  loadingThreads,
  selectedThreadId,
  isStreaming,
  isDeletingId,
  onSelectThread,
  onDeleteThread,
  memory,
  loadingMemory,
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
        eyebrow="Assistente · Conversazioni"
        title="Riprendi una conversazione"
        reading={{
          narrative: describeThreadsReading({ count: threads.length, loading: loadingThreads }),
          tone: 'neutral',
        }}
      >
        <AssistantThreadList
          threads={threads}
          loadingThreads={loadingThreads}
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
    </>
  );
}
