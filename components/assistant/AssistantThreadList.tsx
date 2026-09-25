'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { it } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { MONTH_NAMES } from '@/lib/constants/months';
import { useArmedDelete } from '@/lib/hooks/useArmedDelete';
import { THREAD_DELETE_CONSEQUENCE } from '@/lib/utils/assistantNarrative';
import { cn } from '@/lib/utils';
import { AssistantMode, AssistantThread } from '@/types/assistant';

/**
 * Returns a human-readable badge label for a thread's mode.
 * "chat" reads as "Libera" — the period axis renames the former Chat mode.
 */
function getModeBadgeLabel(mode: AssistantMode): string {
  if (mode === 'month_analysis') return 'Mese';
  if (mode === 'year_analysis') return 'Anno';
  if (mode === 'ytd_analysis') return 'YTD';
  if (mode === 'history_analysis') return 'Storico';
  return 'Libera';
}

/**
 * Strips markdown syntax so thread list previews read as plain text.
 * Covers headings, bold/italic, inline code, horizontal rules, and list markers.
 */
function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s+/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/^---+$/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/\n+/g, ' ')
    .trim();
}

/**
 * Returns a relative label (e.g. "3 ore fa") for dates within the past 7 days,
 * or a DD/MM/YYYY absolute date otherwise. Keeps thread list readable at a glance.
 */
function formatThreadDate(date: Date): string {
  const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  if (Date.now() - date.getTime() < ONE_WEEK_MS) {
    return formatDistanceToNow(date, { addSuffix: true, locale: it });
  }
  return date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

interface AssistantThreadListProps {
  threads: AssistantThread[];
  loadingThreads: boolean;
  selectedThreadId: string | undefined;
  isStreaming: boolean;
  isDeletingId: string | undefined;
  onSelect: (thread: AssistantThread) => void;
  onDelete: (threadId: string) => void;
}

interface ThreadRowProps {
  thread: AssistantThread;
  isActive: boolean;
  isDeleting: boolean;
  isStreaming: boolean;
  onSelect: (thread: AssistantThread) => void;
  onDelete: (threadId: string) => void;
  announce: (message: string) => void;
}

/**
 * A module-level row, because the armed state of its delete lives here: the button stays a
 * compact «Conferma» and the ROW prints what the second press loses, in place of the preview
 * (AGENTS.md → Accessibility). No box per row — the rows divide, the modal is the box.
 */
function ThreadRow({ thread, isActive, isDeleting, isStreaming, onSelect, onDelete, announce }: ThreadRowProps) {
  const deleteRef = useRef<HTMLButtonElement | null>(null);
  const { armed, onClick, onBlur } = useArmedDelete(deleteRef, () => onDelete(thread.id));
  const wasArmed = useRef(false);
  useEffect(() => {
    if (armed) {
      wasArmed.current = true;
      announce(`Premi di nuovo per eliminare ${thread.title}`);
    } else if (wasArmed.current) {
      wasArmed.current = false;
      announce('Eliminazione annullata');
    }
  }, [armed, announce, thread.title]);

  return (
    // The `li` stays square: `divide-y` draws its hairline on it, and a radius there bends the
    // ends of the rule (seen on the owner's six threads, 2026-09-18). The wash is the inner box's.
    <li className="py-1">
      <div
        className={cn(
          'group -mx-2 flex items-stretch rounded-lg px-2 transition-colors',
          armed ? 'bg-destructive/5' : isActive ? 'bg-muted' : 'hover:bg-muted/40',
        )}
      >
        <button
          type="button"
          onClick={() => onSelect(thread)}
          disabled={isStreaming}
          aria-current={isActive ? 'true' : undefined}
          className="min-w-0 flex-1 rounded-lg py-2 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <div className="flex items-start gap-2">
            <p className="line-clamp-1 flex-1 text-[13px] font-medium leading-snug text-foreground">{thread.title}</p>
            <Badge variant="outline" className="mt-px shrink-0 text-[10px] uppercase">
              {getModeBadgeLabel(thread.mode)}
            </Badge>
          </div>
          {armed ? (
            <p className="mt-1 text-xs text-destructive">{THREAD_DELETE_CONSEQUENCE}</p>
          ) : (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
              {thread.lastMessagePreview ? stripMarkdown(thread.lastMessagePreview) : 'Nessun messaggio ancora'}
            </p>
          )}
          <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
            {thread.pinnedMonth && (
              <span>
                {MONTH_NAMES[thread.pinnedMonth.month - 1]} {thread.pinnedMonth.year}
              </span>
            )}
            {thread.pinnedYear && <span className="font-mono tabular-nums">{thread.pinnedYear}</span>}
            <span>{formatThreadDate(thread.updatedAt)}</span>
          </div>
        </button>

        {/* On a mouse the delete waits for hover or focus; on touch there is no hover, so it is
            always there. Armed or in flight it never hides. */}
        <div
          className={cn(
            'flex shrink-0 items-start pl-1 pt-2 transition-opacity',
            !armed &&
              !isDeleting &&
              '[@media(pointer:fine)]:opacity-0 [@media(pointer:fine)]:group-hover:opacity-100 [@media(pointer:fine)]:group-focus-within:opacity-100',
          )}
        >
          {isDeleting ? (
            <span className="flex h-8 w-8 items-center justify-center">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-hidden="true" />
            </span>
          ) : (
            <Button
              ref={deleteRef}
              type="button"
              variant={armed ? 'destructive' : 'ghost'}
              size="sm"
              className={cn('h-8 min-w-8 px-2', !armed && 'text-muted-foreground hover:text-destructive')}
              onClick={onClick}
              onBlur={onBlur}
              disabled={isStreaming}
              aria-pressed={armed}
              aria-label={armed ? `Premi di nuovo per eliminare ${thread.title}` : `Elimina ${thread.title}`}
            >
              {armed ? <span className="text-xs">Conferma</span> : <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />}
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

/**
 * Thread list rendered inside the Conversazioni modal — the single home for
 * "resume a conversation" on every breakpoint (the shell redesign removed the
 * duplicated inline resume list from the empty state).
 *
 * Delete is a two-click confirm on the row with NO timer (`useArmedDelete`: a pointerdown
 * elsewhere, Escape or blur disarms). It kept a 3-second auto-disarm while the list lived in a
 * side sheet; inside a modal that timer is a WCAG 2.2.1 time limit AND a trap — Escape would
 * close the modal with the row still armed, which `ResponsiveModal` now refuses.
 */
export function AssistantThreadList({
  threads,
  loadingThreads,
  selectedThreadId,
  isStreaming,
  isDeletingId,
  onSelect,
  onDelete,
}: AssistantThreadListProps) {
  // The list's ONE live region: a `role="status"` per row made a keyboard reader hear the
  // disarm on every Tab away from an armed button.
  const [announcement, setAnnouncement] = useState('');

  if (loadingThreads) {
    // The wait is said once, by the modal's reading («Sto leggendo le conversazioni salvate»).
    return (
      <div className="space-y-3 py-1">
        <Skeleton className="h-14 w-full rounded-lg" />
        <Skeleton className="h-14 w-full rounded-lg" />
        <Skeleton className="h-14 w-full rounded-lg" />
      </div>
    );
  }

  if (threads.length === 0) {
    return (
      <EmptyState
        className="py-2"
        message="Nessuna conversazione: il primo messaggio ne apre una."
      />
    );
  }

  return (
    <>
      {/* -my-1: the first and last rows' own padding is not added to the modal body's. */}
      <ul className="-my-1 divide-y divide-border" aria-label="Conversazioni salvate">
        {threads.map((thread) => (
          <ThreadRow
            key={thread.id}
            thread={thread}
            isActive={selectedThreadId === thread.id}
            isDeleting={isDeletingId === thread.id}
            isStreaming={isStreaming}
            onSelect={onSelect}
            onDelete={onDelete}
            announce={setAnnouncement}
          />
        ))}
      </ul>
      <span className="sr-only" role="status" aria-live="polite">
        {announcement}
      </span>
    </>
  );
}
