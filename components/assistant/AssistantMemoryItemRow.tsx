'use client';

import { useState } from 'react';
import { Archive, ArchiveRestore, Check, Pencil, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
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

// Color-coded category badges to give the panel visual hierarchy at a glance
const CATEGORY_COLORS: Record<AssistantMemoryItem['category'], string> = {
  goal: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  preference: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  risk: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  fact: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
};

/**
 * Formats a date as DD/MM/YYYY — used for the item provenance label.
 */
function formatItemDate(date: Date): string {
  return date.toLocaleDateString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/**
 * Single memory item row with inline edit, archive/unarchive, and delete actions.
 * Edit mode replaces the text with an input; save/cancel buttons appear inline.
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

  const isArchived = item.status === 'archived';

  return (
    <div
      className={cn(
        'group rounded-xl border px-3 py-2.5 transition-colors',
        isArchived
          ? 'border-border/50 bg-muted/20 opacity-60'
          : 'border-border bg-background'
      )}
    >
      {/* Top row: category badge + actions */}
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
            CATEGORY_COLORS[item.category]
          )}
        >
          {CATEGORY_LABELS[item.category]}
        </span>

        {/* Action buttons: visible on hover or during interaction */}
        {!isEditing && (
          <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
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
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
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
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-destructive"
              disabled={isMutating}
              onClick={() => onDelete(item.id)}
              aria-label="Elimina"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        )}

        {/* Inline edit save/cancel controls */}
        {isEditing && (
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-emerald-600 hover:text-emerald-700"
              disabled={isSaving}
              onClick={handleSave}
              aria-label="Salva"
            >
              <Check className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
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
        da una conversazione del {formatItemDate(item.createdAt)}
      </p>
    </div>
  );
}
