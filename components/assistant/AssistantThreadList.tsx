'use client';

import { useRef, useState } from 'react';
import { Check, Loader2, Trash2, X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { it } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { MONTH_NAMES } from '@/lib/constants/months';
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

/**
 * Thread list rendered inside the Conversazioni sheet — the single home for
 * "resume a conversation" on every breakpoint (the shell redesign removed the
 * duplicated inline resume list from the empty state).
 *
 * Delete is a 2-click flow: first click arms inline confirmation ("Elimina?"),
 * second click confirms. Auto-disarms after 3 seconds to prevent accidental deletion.
 * The delete control lives in the normal flex flow (not absolute) so it never
 * overlaps the mode badge in the top-right corner.
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
  const [pendingDeleteId, setPendingDeleteId] = useState<string | undefined>(undefined);
  const pendingDeleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const armDelete = (threadId: string) => {
    setPendingDeleteId(threadId);
    pendingDeleteTimerRef.current = setTimeout(() => {
      setPendingDeleteId(undefined);
    }, 3000);
  };

  const disarmDelete = () => {
    if (pendingDeleteTimerRef.current) clearTimeout(pendingDeleteTimerRef.current);
    setPendingDeleteId(undefined);
  };

  const confirmDelete = (threadId: string) => {
    if (pendingDeleteTimerRef.current) clearTimeout(pendingDeleteTimerRef.current);
    setPendingDeleteId(undefined);
    onDelete(threadId);
  };

  if (loadingThreads) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Caricamento conversazioni…
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
    <div className="space-y-1.5">
      {threads.map((thread) => {
        const isActive = selectedThreadId === thread.id;
        const isDeleting = isDeletingId === thread.id;
        const isPendingDelete = pendingDeleteId === thread.id;

        return (
          <div
            key={thread.id}
            className={cn(
              'group flex w-full items-stretch rounded-xl border text-left transition-colors',
              isActive ? 'border-primary/30 bg-primary/5' : 'border-border hover:bg-muted/40'
            )}
          >
            {/* Main select area — takes all available width */}
            <button
              onClick={() => onSelect(thread)}
              disabled={isStreaming}
              className="min-w-0 flex-1 rounded-xl px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <div className="flex items-start gap-2">
                <p className="flex-1 text-sm font-medium leading-snug text-foreground line-clamp-1">
                  {thread.title}
                </p>
                <Badge variant="outline" className="mt-px shrink-0 text-[10px] uppercase">
                  {getModeBadgeLabel(thread.mode)}
                </Badge>
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                {thread.lastMessagePreview
                  ? stripMarkdown(thread.lastMessagePreview)
                  : 'Nessun messaggio ancora'}
              </p>
              <div className="mt-1.5 flex items-center gap-2">
                {thread.pinnedMonth && (
                  <span className="text-[10px] text-muted-foreground">
                    {MONTH_NAMES[thread.pinnedMonth.month - 1]} {thread.pinnedMonth.year}
                  </span>
                )}
                {thread.pinnedYear && (
                  <span className="text-[10px] text-muted-foreground">{thread.pinnedYear}</span>
                )}
                <span className="text-[10px] text-muted-foreground/70">
                  {formatThreadDate(thread.updatedAt)}
                </span>
              </div>
            </button>

            {/* Delete control — in normal flow at the right edge, never overlaps the badge.
                Shows on hover, stays visible while deleting or pending confirmation. */}
            <div
              className={cn(
                'flex shrink-0 items-start pt-2 pr-2 opacity-0 transition-opacity group-hover:opacity-100',
                (isDeleting || isPendingDelete) && 'opacity-100'
              )}
            >
              {isDeleting && (
                <div className="p-1">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                </div>
              )}

              {/* Inline confirmation: "Elimina?" + confirm/cancel */}
              {!isDeleting && isPendingDelete && (
                <div className="flex items-center gap-0.5">
                  <span className="text-[11px] text-destructive font-medium">Elimina?</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      confirmDelete(thread.id);
                    }}
                    disabled={isStreaming}
                    aria-label="Conferma eliminazione"
                    className="rounded-md p-1 text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      disarmDelete();
                    }}
                    aria-label="Annulla eliminazione"
                    className="rounded-md p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {/* Normal trash button — first click arms the confirmation */}
              {!isDeleting && !isPendingDelete && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    armDelete(thread.id);
                  }}
                  disabled={isStreaming}
                  aria-label="Elimina conversazione"
                  className="rounded-md p-1 text-muted-foreground/50 hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
