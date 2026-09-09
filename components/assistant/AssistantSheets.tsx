'use client';

import { AssistantMemoryPanel } from '@/components/assistant/AssistantMemoryPanel';
import { AssistantThreadList } from '@/components/assistant/AssistantThreadList';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { AssistantMemoryDocument, AssistantThread } from '@/types/assistant';

interface AssistantSheetsProps {
  ownerId: string | undefined;
  isThreadSheetOpen: boolean;
  onThreadSheetOpenChange: (open: boolean) => void;
  isMemorySheetOpen: boolean;
  onMemorySheetOpenChange: (open: boolean) => void;
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
 * The two overlay surfaces of the assistant — Conversazioni and Memoria —
 * as right-side sheets on EVERY breakpoint. Deliberate: the companion column
 * must never become a second nested-scroll box.
 * Open state lives in the page because multiple surfaces open them.
 */
export function AssistantSheets({
  ownerId,
  isThreadSheetOpen,
  onThreadSheetOpenChange,
  isMemorySheetOpen,
  onMemorySheetOpenChange,
  threads,
  loadingThreads,
  selectedThreadId,
  isStreaming,
  isDeletingId,
  onSelectThread,
  onDeleteThread,
  memory,
  loadingMemory,
}: AssistantSheetsProps) {
  return (
    <>
      <Sheet open={isThreadSheetOpen} onOpenChange={onThreadSheetOpenChange}>
        <SheetContent side="right" className="w-[320px] overflow-y-auto p-0">
          <SheetHeader className="border-b border-border px-4 py-3">
            <SheetTitle className="text-left text-sm">Conversazioni</SheetTitle>
            <SheetDescription className="sr-only">
              Elenco delle conversazioni salvate: selezionane una per riprenderla o eliminala.
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 py-3">
            <AssistantThreadList
              threads={threads}
              loadingThreads={loadingThreads}
              selectedThreadId={selectedThreadId}
              isStreaming={isStreaming}
              isDeletingId={isDeletingId}
              onSelect={(thread) => {
                onSelectThread(thread);
                onThreadSheetOpenChange(false);
              }}
              onDelete={onDeleteThread}
            />
          </div>
        </SheetContent>
      </Sheet>

      {ownerId && (
        <Sheet open={isMemorySheetOpen} onOpenChange={onMemorySheetOpenChange}>
          <SheetContent side="right" className="w-[340px] overflow-y-auto p-0">
            <SheetHeader className="border-b border-border px-4 py-3">
              <SheetTitle className="text-left text-sm">Memoria</SheetTitle>
              <SheetDescription className="sr-only">
                Fatti, preferenze e obiettivi che l&apos;assistente ha imparato e usa nelle risposte.
              </SheetDescription>
            </SheetHeader>
            <div className="px-4 py-4">
              <AssistantMemoryPanel userId={ownerId} memory={memory} isLoading={loadingMemory} />
            </div>
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}
