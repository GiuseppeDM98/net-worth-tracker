'use client';

import { useRef, useState } from 'react';
import { Archive, ArchiveRestore, Check, Pencil, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useArmedDelete } from '@/lib/hooks/useArmedDelete';
import { cachedFormatCurrencyEUR, formatDate } from '@/lib/utils/formatters';
import { formatPercentage } from '@/lib/services/chartService';
import { ASSET_CLASS_LABELS } from '@/lib/utils/allocationUtils';
import { describeGoalProgress, type GoalProgressReading } from '@/lib/utils/assistantNarrative';
import { AssistantMemoryItem, AssistantMemorySuggestion, AssistantStructuredGoal } from '@/types/assistant';

interface AssistantMemoryItemRowProps {
  item: AssistantMemoryItem;
  isMutating: boolean;
  onEdit: (id: string, text: string) => Promise<void>;
  onArchive: (id: string, currentStatus: AssistantMemoryItem['status']) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  /** A pending «goal reached» suggestion on this goal: the durable Ignora lives on the row. */
  pendingSuggestion?: AssistantMemorySuggestion;
  onAcceptSuggestion?: (suggestionId: string, itemId: string) => Promise<void>;
  onIgnoreSuggestion?: (suggestionId: string) => Promise<void>;
}

/** What each structured-goal kind measures, in the user's words. */
const GOAL_KIND_LABELS: Record<AssistantStructuredGoal['kind'], string> = {
  net_worth_target: 'Patrimonio',
  liquid_net_worth_target: 'Patrimonio liquido',
  cash_target: 'Liquidità',
  asset_class_value_target: 'Valore classe',
  asset_class_percentage_target: 'Peso classe',
  sub_category_value_target: 'Sottocategoria',
};

/** Renders a YYYY-MM-DD deadline as DD/MM/YYYY without going through Date parsing. */
function formatDeadline(deadlineIso: string): string {
  const [year, month, day] = deadlineIso.split('-');
  return `${day}/${month}/${year}`;
}

/** Zero decimals on euro targets: a goal is «500.000 €», never «500.000,00 €»; a share has the comma. */
function formatGoalValue(value: number, unit: AssistantStructuredGoal['unit']): string {
  return unit === 'percent' ? formatPercentage(value, 1) : cachedFormatCurrencyEUR(value, true);
}

const PROGRESS_CLASS: Record<GoalProgressReading['kind'], string> = {
  reached: 'font-medium text-positive',
  progress: 'font-mono tabular-nums text-muted-foreground',
  untracked: 'text-muted-foreground/70',
};

const ICON_BUTTON_CLASS = 'h-8 w-8 text-muted-foreground hover:text-foreground';

/**
 * One memory item as a flat row of the Obiettivi or Fatti tile — text, the goal's structure
 * and its last check, the provenance — with inline edit, archive/restore and a two-click
 * delete without a timer (`useArmedDelete`: a pointerdown elsewhere, Escape or blur disarms;
 * the arm and the disarm are announced). No box per row: the rows divide, the tile is the box.
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
  pendingSuggestion,
  onAcceptSuggestion,
  onIgnoreSuggestion,
}: AssistantMemoryItemRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(item.text);
  const [isSaving, setIsSaving] = useState(false);
  const deleteRef = useRef<HTMLButtonElement | null>(null);
  const del = useArmedDelete(deleteRef, () => {
    void onDelete(item.id);
  });

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
  const isCompleted = item.status === 'completed';

  // Goal transparency: a goal either states what is being measured, or states that nothing
  // is. Before, a goal the extractor failed to structure was indistinguishable from one
  // sitting at 97% of its target.
  const structuredGoal = item.category === 'goal' ? item.structuredGoal : undefined;
  const evaluation = item.category === 'goal' ? item.lastEvaluationResult : undefined;
  const progress = item.category === 'goal' && !isCompleted ? describeGoalProgress(evaluation) : null;

  return (
    <div className={cn('group py-2.5', isArchived && 'opacity-60')}>
      {/* Text (or the inline editor) + actions */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
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
              className="h-8 text-[13px]"
              aria-label="Testo del ricordo"
              autoFocus
            />
          ) : (
            <p className="text-[13px] leading-[1.4] text-foreground">{item.text}</p>
          )}
        </div>

        {isEditing ? (
          <div className="flex shrink-0 items-center gap-0.5">
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-positive" disabled={isSaving} onClick={handleSave} aria-label="Salva">
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className={ICON_BUTTON_CLASS} disabled={isSaving} onClick={handleCancel} aria-label="Annulla">
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </div>
        ) : (
          <div
            className={cn(
              'flex shrink-0 items-center gap-0.5 transition-opacity',
              !del.armed &&
                '[@media(pointer:fine)]:opacity-0 [@media(pointer:fine)]:group-hover:opacity-100 [@media(pointer:fine)]:group-focus-within:opacity-100',
            )}
          >
            {del.armed && (
              <span className="text-[11px] font-medium text-destructive" aria-hidden="true">
                Elimina?
              </span>
            )}
            {!del.armed && (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={ICON_BUTTON_CLASS}
                  disabled={isMutating}
                  onClick={() => {
                    setIsEditing(true);
                    setEditValue(item.text);
                  }}
                  aria-label="Modifica"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={ICON_BUTTON_CLASS}
                  disabled={isMutating}
                  onClick={() => onArchive(item.id, item.status)}
                  aria-label={isArchived ? 'Ripristina' : 'Archivia'}
                >
                  {isArchived ? <ArchiveRestore className="h-3.5 w-3.5" aria-hidden="true" /> : <Archive className="h-3.5 w-3.5" aria-hidden="true" />}
                </Button>
              </>
            )}
            <Button
              ref={deleteRef}
              type="button"
              variant="ghost"
              size="icon"
              className={cn('h-8 w-8', del.armed ? 'text-destructive hover:text-destructive' : 'text-muted-foreground hover:text-destructive')}
              disabled={isMutating}
              onClick={del.onClick}
              onBlur={del.onBlur}
              aria-label={del.armed ? 'Conferma eliminazione' : 'Elimina'}
            >
              {del.armed ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />}
            </Button>
            {/* Emptying a live region announces nothing: the disarm is said explicitly. */}
            <span role="status" className="sr-only">
              {del.armed ? 'Premi di nuovo per eliminare il ricordo' : ''}
            </span>
          </div>
        )}
      </div>

      {/* Goal tracking: what is measured, and how it stood at the last check */}
      {item.category === 'goal' && !isEditing && (
        <div className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
          {structuredGoal ? (
            <p>
              {GOAL_KIND_LABELS[structuredGoal.kind]}
              {structuredGoal.assetClass ? ` · ${ASSET_CLASS_LABELS[structuredGoal.assetClass] ?? structuredGoal.assetClass}` : ''}
              {structuredGoal.subCategory ? ` · ${structuredGoal.subCategory}` : ''}
              {' · '}
              {(structuredGoal.direction ?? 'at_least') === 'at_least' ? 'almeno' : 'al massimo'}{' '}
              <span className="font-mono tabular-nums text-foreground">{formatGoalValue(structuredGoal.targetValue, structuredGoal.unit)}</span>
              {structuredGoal.deadlineIso ? (
                <>
                  {' · entro '}
                  <span className="font-mono tabular-nums">{formatDeadline(structuredGoal.deadlineIso)}</span>
                </>
              ) : null}
            </p>
          ) : (
            <p>Non tracciabile automaticamente</p>
          )}

          {progress && (
            <p>
              {item.lastEvaluationAt ? `Verificato il ${formatDate(item.lastEvaluationAt)}: ` : 'Ultima verifica: '}
              <span className={PROGRESS_CLASS[progress.kind]}>{progress.text}</span>
              {evaluation?.deadlinePassed && !evaluation.matched ? ' — scadenza superata' : ''}
            </p>
          )}

          {pendingSuggestion && onAcceptSuggestion && onIgnoreSuggestion && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="font-medium text-positive">{pendingSuggestion.evidenceSummary}</span>
              <Button size="sm" className="h-8" disabled={isMutating} onClick={() => onAcceptSuggestion(pendingSuggestion.id, item.id)}>
                Segna come completato
              </Button>
              <Button size="sm" variant="ghost" className="h-8" disabled={isMutating} onClick={() => onIgnoreSuggestion(pendingSuggestion.id)}>
                Ignora
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Provenance: source thread date */}
      <p className="mt-1 text-[11px] text-muted-foreground/70">
        {isCompleted && item.completedAt
          ? `Completato il ${formatDate(item.completedAt)}`
          : `da una conversazione del ${formatDate(item.createdAt)}`}
      </p>
    </div>
  );
}
