'use client';

import { useRef, useState } from 'react';
import { Archive, ArchiveRestore, Check, Pencil, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { AssistantMemoryItem } from '@/types/assistant';

interface AssistantMemoryItemRowProps {
  item: AssistantMemoryItem;
  isMutating: boolean;
  onEdit: (id: string, text: string) => Promise<void>;
  onArchive: (id: string, currentStatus: AssistantMemoryItem['status']) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const CATEGORY_LABELS: Record<AssistantMemoryItem['category'], string> = {
  goal: 'Obiettivo',
  preference: 'Preferenza',
  risk: 'Rischio',
  fact: 'Fatto',
};

// Maps memory category to chartColors index for theme-aware badge color.
// goal → [0], preference → [1], risk → [3], fact → [4]
const CATEGORY_COLOR_INDEX: Record<AssistantMemoryItem['category'], number> = {
  goal: 0,
  preference: 1,
  risk: 3,
  fact: 4,
};

/** Formats a date as DD/MM/YYYY — used for the item provenance label. */
function formatItemDate(date: Date): string {
  return date.toLocaleDateString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/**
 * Single memory item row with inline edit, archive/unarchive, and delete actions.
 *
 * Category badge colors are theme-aware via useChartColors() + color-mix() so they
 * look correct across all 6 app themes (not hardcoded blue/violet/amber/emerald).
 *
 * Action buttons use [@media(pointer:fine)] so they are always visible on touch devices
 * (no hover state available) but hide until hover/focus on mouse devices.
 */
export function AssistantMemoryItemRow({
  item,
  isMutating,
  onEdit,
  onArchive,
  onDelete,
}: AssistantMemoryItemRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(item.text);
  const [isSaving, setIsSaving] = useState(false);
  // 2-click delete: first click arms, second confirms. Auto-disarms after 3s.
  const [isPendingDelete, setIsPendingDelete] = useState(false);
  const pendingDeleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Theme-aware chart colors — read from CSS vars after paint
  const chartColors = useChartColors();
  const colorIndex = CATEGORY_COLOR_INDEX[item.category];
  const categoryColor = chartColors[colorIndex] ?? 'var(--muted-foreground)';

  const handleSave = async () => {
    const trimmed = editValue.trim();
    if (!trimmed || trimmed === item.text) {
      setIsEditing(false);
      setEditValue(item.text);
      return;
    }
    setIsSaving(true);
    try {
      await onEdit(item.id, trimmed);
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditValue(item.text);
  };

  const handleDeleteArm = () => {
    setIsPendingDelete(true);
    pendingDeleteTimerRef.current = setTimeout(() => {
      setIsPendingDelete(false);
    }, 3000);
  };

  const handleDeleteDisarm = () => {
    if (pendingDeleteTimerRef.current) clearTimeout(pendingDeleteTimerRef.current);
    setIsPendingDelete(false);
  };

  const handleDeleteConfirm = () => {
    if (pendingDeleteTimerRef.current) clearTimeout(pendingDeleteTimerRef.current);
    onDelete(item.id);
  };

  const isArchived = item.status === 'archived';
  const isCompleted = item.status === 'completed';

  return (
    <div
      className={cn(
        'group rounded-xl border px-3 py-2.5 transition-colors',
        isArchived
          ? 'border-border/50 bg-muted/20 opacity-60'
          : isCompleted
          ? 'border-border bg-muted/20'
          : 'border-border bg-background'
      )}
    >
      {/* Top row: category badge + actions */}
      <div className="flex items-center justify-between gap-2">
        {/* Theme-aware badge: color from useChartColors(), tinted bg via color-mix() */}
        <span
          className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
          style={{
            color: categoryColor,
            backgroundColor: `color-mix(in srgb, ${categoryColor} 12%, transparent)`,
          }}
          aria-label={`Categoria: ${CATEGORY_LABELS[item.category]}`}
        >
          {CATEGORY_LABELS[item.category]}
        </span>

        {/* Action buttons: always visible on touch (pointer: coarse), hidden until hover/focus
            on mouse devices (pointer: fine). This ensures touch-accessible controls. */}
        {!isEditing && !isPendingDelete && (
          <div className="flex items-center gap-0.5 transition-opacity [@media(pointer:fine)]:opacity-0 [@media(pointer:fine)]:group-hover:opacity-100 [@media(pointer:fine)]:group-focus-within:opacity-100">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              disabled={isMutating}
              onClick={() => {
                setIsEditing(true);
                setEditValue(item.text);
              }}
              aria-label="Modifica"
            >
              <Pencil className="h-3 w-3" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              disabled={isMutating}
              onClick={() => onArchive(item.id, item.status)}
              aria-label={isArchived ? 'Ripristina' : 'Archivia'}
            >
              {isArchived ? (
                <ArchiveRestore className="h-3 w-3" />
              ) : (
                <Archive className="h-3 w-3" />
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              disabled={isMutating}
              onClick={handleDeleteArm}
              aria-label="Elimina"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        )}

        {/* Inline delete confirmation — shows after the first click on the trash icon.
            Auto-disarms after 3 seconds. */}
        {!isEditing && isPendingDelete && (
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-destructive font-medium">Elimina?</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive"
              disabled={isMutating}
              onClick={handleDeleteConfirm}
              aria-label="Conferma eliminazione"
            >
              <Check className="h-3 w-3" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              disabled={isMutating}
              onClick={handleDeleteDisarm}
              aria-label="Annulla eliminazione"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}

        {/* Inline edit save/cancel */}
        {isEditing && (
          <div className="flex items-center gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300"
              disabled={isSaving}
              onClick={handleSave}
              aria-label="Salva"
            >
              <Check className="h-3 w-3" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              disabled={isSaving}
              onClick={handleCancel}
              aria-label="Annulla"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>

      {/* Item text or inline edit input */}
      <div className="mt-1.5">
        {isEditing ? (
          <Input
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') handleCancel();
            }}
            maxLength={120}
            disabled={isSaving}
            className="h-7 text-sm"
            autoFocus
          />
        ) : (
          <p className="text-sm text-foreground leading-snug">{item.text}</p>
        )}
      </div>

      {/* Provenance: source thread date */}
      <p className="mt-1 text-[10px] text-muted-foreground/70">
        {isCompleted && item.completedAt
          ? `Completato il ${formatItemDate(item.completedAt)}`
          : `da una conversazione del ${formatItemDate(item.createdAt)}`}
      </p>
    </div>
  );
}
