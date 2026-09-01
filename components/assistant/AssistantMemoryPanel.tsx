'use client';

import { useMemo, useRef, useState } from 'react';
import { ChevronDown, Loader2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { AssistantMemoryItemRow } from '@/components/assistant/AssistantMemoryItemRow';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ResponsiveModal } from '@/components/ui/responsive-modal';
import { useArmedDelete } from '@/lib/hooks/useArmedDelete';
import { describeWriteError, armedActionLabel } from '@/lib/utils/dialogNarrative';
import { Tile, TILE_EYEBROW_CLASS, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { TileGridSkeleton } from '@/components/ui/tile-grid-skeleton';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/utils/formatters';
import { describeFactsTile, describeGoalsTile } from '@/lib/utils/assistantNarrative';
import { useDeleteAssistantMemory, useUpdateAssistantMemory } from '@/lib/hooks/useAssistantMemory';
import { AssistantMemoryDocument, AssistantMemoryItem } from '@/types/assistant';

interface AssistantMemoryPanelProps {
  userId: string;
  memory: AssistantMemoryDocument | undefined;
  isLoading: boolean;
}

type FactCategory = Exclude<AssistantMemoryItem['category'], 'goal'>;

const FACT_GROUPS: ReadonlyArray<{ category: FactCategory; label: string }> = [
  { category: 'risk', label: 'Rischio' },
  { category: 'preference', label: 'Preferenze' },
  { category: 'fact', label: 'Fatti utili' },
];

/** The most recent evaluation date across the goals, for the Obiettivi reading. */
function latestEvaluation(goals: AssistantMemoryItem[]): Date | null {
  return goals.reduce<Date | null>((latest, goal) => {
    const at = goal.lastEvaluationAt ?? null;
    if (!at) return latest;
    return !latest || at > latest ? at : latest;
  }, null);
}

/**
 * The Memoria sheet's content as two tiles — «Obiettivi» (every active goal with its
 * structure, its last check and, when the daily evaluation found it reached, the durable
 * «Ignora» beside «Segna come completato»; the completed ones under a sub-eyebrow with
 * «Riattiva») and «Fatti» (rischio, preferenze, fatti utili as flat rows) — with the archived
 * items behind an «Archiviati» disclosure and the reset as its one destructive action.
 *
 * The on/off control of the automatic learning lives in the Preferences popover; this panel
 * manages stored items only.
 */
export function AssistantMemoryPanel({ userId, memory, isLoading }: AssistantMemoryPanelProps) {
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [archivedOpen, setArchivedOpen] = useState(false);

  const updateMutation = useUpdateAssistantMemory(userId);
  const deleteMutation = useDeleteAssistantMemory(userId);
  const isMutating = updateMutation.isPending || deleteMutation.isPending;
  // Read for empty-state copy only — the on/off control itself lives in Preferences.
  const memoryEnabled = memory?.preferences.memoryEnabled ?? true;

  const items = useMemo(() => memory?.items ?? [], [memory]);
  const activeGoals = items.filter((item) => item.category === 'goal' && item.status === 'active');
  const completedGoals = items.filter((item) => item.category === 'goal' && item.status === 'completed');
  const activeFacts = items.filter((item) => item.category !== 'goal' && item.status === 'active');
  const archived = items.filter((item) => item.status === 'archived');
  const pendingSuggestions = (memory?.suggestions ?? []).filter((s) => s.status === 'pending');

  const goalsReading = describeGoalsTile({
    tracked: activeGoals.filter((goal) => goal.structuredGoal).length,
    reached: activeGoals.filter((goal) => goal.lastEvaluationResult?.matched).length,
    lastEvaluationAt: latestEvaluation(activeGoals),
  });
  const factsReading = describeFactsTile({
    risk: activeFacts.filter((f) => f.category === 'risk').length,
    preference: activeFacts.filter((f) => f.category === 'preference').length,
    fact: activeFacts.filter((f) => f.category === 'fact').length,
  });

  const handleEdit = async (id: string, text: string) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    try {
      await updateMutation.mutateAsync({ item: { id, text, category: item.category, status: item.status } });
    } catch (err) {
      toast.error(describeWriteError(err));
      throw err; // Re-throw so the row can keep edit mode open
    }
  };

  const handleArchive = async (id: string, currentStatus: AssistantMemoryItem['status']) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    const newStatus: AssistantMemoryItem['status'] = currentStatus === 'archived' ? 'active' : 'archived';
    try {
      await updateMutation.mutateAsync({ item: { id, text: item.text, category: item.category, status: newStatus } });
    } catch (err) {
      toast.error(describeWriteError(err));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMutation.mutateAsync({ itemId: id });
    } catch (err) {
      toast.error(describeWriteError(err));
    }
  };

  const handleReactivateGoal = async (itemId: string) => {
    try {
      await updateMutation.mutateAsync({ action: 'reactivateGoal', itemId });
      toast.success('Obiettivo riattivato');
    } catch (err) {
      toast.error(describeWriteError(err));
    }
  };

  const handleAcceptSuggestion = async (suggestionId: string, itemId: string) => {
    try {
      await updateMutation.mutateAsync({ action: 'acceptSuggestion', suggestionId, itemId });
      toast.success('Obiettivo segnato come completato');
    } catch (err) {
      toast.error(describeWriteError(err));
    }
  };

  const handleIgnoreSuggestion = async (suggestionId: string) => {
    try {
      await updateMutation.mutateAsync({ action: 'ignoreSuggestion', suggestionId });
    } catch (err) {
      toast.error(describeWriteError(err));
    }
  };

  const handleResetAll = async () => {
    try {
      await deleteMutation.mutateAsync({ resetAll: true });
      setShowResetDialog(false);
      toast.success('Memoria resettata');
    } catch (err) {
      toast.error(describeWriteError(err));
    }
  };

  if (isLoading) {
    return <TileGridSkeleton verdict={false} cells={[{ span: 12, lines: 5 }, { span: 12, lines: 4 }]} />;
  }

  const rowProps = { isMutating, onEdit: handleEdit, onArchive: handleArchive, onDelete: handleDelete };

  return (
    <div className="flex flex-col gap-3">
      <Tile
        eyebrow="Obiettivi"
        aside={
          activeGoals.length + completedGoals.length > 0
            ? [
                `${activeGoals.length} ${activeGoals.length === 1 ? 'attivo' : 'attivi'}`,
                completedGoals.length > 0 && `${completedGoals.length} ${completedGoals.length === 1 ? 'completato' : 'completati'}`,
              ]
                .filter(Boolean)
                .join(' · ')
            : undefined
        }
        reading={goalsReading}
      >
        {activeGoals.length === 0 && completedGoals.length === 0 ? (
          <p className="mt-3 text-[13px] text-muted-foreground">
            {memoryEnabled
              ? 'Gli obiettivi che dichiari in conversazione compaiono qui, con la loro verifica quotidiana.'
              : "Attiva l'apprendimento automatico nelle Preferenze per acquisire nuovi obiettivi."}
          </p>
        ) : (
          <>
            {activeGoals.length > 0 && (
              <div className="mt-2 divide-y divide-border">
                {activeGoals.map((goal) => (
                  <AssistantMemoryItemRow
                    key={goal.id}
                    item={goal}
                    {...rowProps}
                    pendingSuggestion={pendingSuggestions.find((s) => s.itemId === goal.id)}
                    onAcceptSuggestion={handleAcceptSuggestion}
                    onIgnoreSuggestion={handleIgnoreSuggestion}
                  />
                ))}
              </div>
            )}
            {completedGoals.length > 0 && (
              <>
                <p className={cn(TILE_SUB_EYEBROW_CLASS, 'mt-4')}>Completati</p>
                <ul className="mt-1 divide-y divide-border">
                  {completedGoals.map((goal) => (
                    <li key={goal.id} className="flex items-center justify-between gap-3 py-2">
                      <span className="min-w-0 flex-1 text-[13px] leading-[1.4] text-muted-foreground">{goal.text}</span>
                      <span className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
                        {goal.completedAt && <span className="font-mono tabular-nums">{formatDate(goal.completedAt)}</span>}
                        <Button size="sm" variant="ghost" className="h-8" onClick={() => handleReactivateGoal(goal.id)} disabled={isMutating}>
                          Riattiva
                        </Button>
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </Tile>

      <Tile
        eyebrow="Fatti"
        aside={activeFacts.length > 0 ? `${activeFacts.length} ${activeFacts.length === 1 ? 'fatto' : 'fatti'}` : undefined}
        reading={factsReading}
      >
        {activeFacts.length === 0 ? (
          <p className="mt-3 text-[13px] text-muted-foreground">
            {memoryEnabled
              ? 'Le preferenze e il profilo di rischio che dichiari in conversazione compaiono qui.'
              : "Attiva l'apprendimento automatico nelle Preferenze per acquisire nuovi fatti."}
          </p>
        ) : (
          FACT_GROUPS.map(({ category, label }) => {
            const group = activeFacts.filter((item) => item.category === category);
            if (group.length === 0) return null;
            return (
              <div key={category} className="mt-3">
                <p className={TILE_SUB_EYEBROW_CLASS}>{label}</p>
                <div className="divide-y divide-border">
                  {group.map((item) => (
                    <AssistantMemoryItemRow key={item.id} item={item} {...rowProps} />
                  ))}
                </div>
              </div>
            );
          })
        )}
      </Tile>

      {/* Archived items and the reset, below the two tiles like a page's «Dettaglio». */}
      {items.length > 0 && (
        <div className="flex flex-col">
          {archived.length > 0 && (
            <Collapsible open={archivedOpen} onOpenChange={setArchivedOpen}>
              <CollapsibleTrigger
                className="flex w-full items-center justify-between gap-3 border-t border-border/40 py-3 text-left"
                aria-label="Archiviati"
              >
                <span className="flex items-baseline gap-3">
                  <span className={TILE_EYEBROW_CLASS}>Archiviati</span>
                  <span className="text-[13px] text-muted-foreground">
                    {archived.length} {archived.length === 1 ? 'ricordo' : 'ricordi'} fuori dalle risposte
                  </span>
                </span>
                <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', archivedOpen && 'rotate-180')} aria-hidden="true" />
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-1">
                <Tile eyebrow="Ricordi archiviati">
                  <div className="mt-2 divide-y divide-border">
                    {archived.map((item) => (
                      <AssistantMemoryItemRow key={item.id} item={item} {...rowProps} />
                    ))}
                  </div>
                </Tile>
              </CollapsibleContent>
            </Collapsible>
          )}
          <div className="flex items-center justify-end border-t border-border/40 py-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-9 text-muted-foreground hover:text-destructive"
              disabled={isMutating}
              onClick={() => setShowResetDialog(true)}
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Elimina tutta la memoria
            </Button>
          </div>
        </div>
      )}

      {/* Reset all confirmation dialog */}
      <ResponsiveModal
        open={showResetDialog}
        onClose={() => setShowResetDialog(false)}
        eyebrow="Assistente · Memoria"
        title="Svuota la memoria"
        reading={{
          narrative: [
            { text: `${items.length}`, mono: true },
            { text: items.length === 1 ? ' ricordo sparisce' : ' ricordi spariscono' },
            {
              text: ' per sempre. Le preferenze — stile, contesto macro, apprendimento — restano dove sono.',
            },
          ],
          tone: 'neutral',
        }}
        width="sm"
        footerNote="Esc annulla la conferma"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setShowResetDialog(false)}
              disabled={deleteMutation.isPending}
            >
              Annulla
            </Button>
            <ArmedResetAll
              label={`Elimina ${items.length === 1 ? '1 ricordo' : `${items.length} ricordi`}`}
              disabled={deleteMutation.isPending}
              onConfirm={handleResetAll}
              pending={deleteMutation.isPending}
            />
          </>
        }
      >
        <p className="text-sm leading-[1.6] text-muted-foreground">
          L&apos;assistente ricomincerà a imparare da zero: quello che sa di te oggi non tornerà.
        </p>
      </ResponsiveModal>
    </div>
  );
}

/** The memory wipe: two clicks, no timer, Escape disarms. */
function ArmedResetAll({
  label,
  disabled,
  pending,
  onConfirm,
}: {
  label: string;
  disabled: boolean;
  pending: boolean;
  onConfirm: () => void;
}) {
  const ref = useRef<HTMLButtonElement | null>(null);
  const { armed, onClick, onBlur } = useArmedDelete(ref, onConfirm);
  const [wasArmed, setWasArmed] = useState(false);
  if (armed && !wasArmed) setWasArmed(true);

  return (
    <>
      <Button
        ref={ref}
        type="button"
        variant="destructive"
        onClick={onClick}
        onBlur={onBlur}
        disabled={disabled}
        aria-pressed={armed}
      >
        {pending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            Eliminazione…
          </>
        ) : armed ? (
          armedActionLabel(label)
        ) : (
          label
        )}
      </Button>
      <span className="sr-only" role="status" aria-live="polite">
        {armed ? armedActionLabel(label) : wasArmed ? 'Eliminazione annullata' : ''}
      </span>
    </>
  );
}
