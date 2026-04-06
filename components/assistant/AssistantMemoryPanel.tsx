'use client';

import { useState } from 'react';
import { Brain, Loader2, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { AssistantMemoryItemRow } from '@/components/assistant/AssistantMemoryItemRow';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn } from '@/lib/utils';
import { useDeleteAssistantMemory, useUpdateAssistantMemory } from '@/lib/hooks/useAssistantMemory';
import { AssistantMemoryDocument, AssistantMemoryItem } from '@/types/assistant';

interface AssistantMemoryPanelProps {
  userId: string;
  memory: AssistantMemoryDocument | undefined;
  isLoading: boolean;
}

type FilterTab = 'active' | 'archived';

const CATEGORY_ORDER: AssistantMemoryItem['category'][] = ['goal', 'preference', 'risk', 'fact'];

const CATEGORY_GROUP_LABELS: Record<AssistantMemoryItem['category'], string> = {
  goal: 'Obiettivi',
  preference: 'Preferenze',
  risk: 'Rischio',
  fact: 'Fatti utili',
};

/**
 * Memory panel for Assistente AI — Step 5.
 *
 * Shows items grouped by category (goal → preference → risk → fact).
 * Lets the user toggle memoryEnabled, edit/archive/delete individual items,
 * and reset all memory with an explicit confirmation dialog.
 *
 * Layout: single-column card, responsive — works in the desktop right panel
 * and also renders correctly in the mobile tab/sheet surfaces.
 */
export function AssistantMemoryPanel({ userId, memory, isLoading }: AssistantMemoryPanelProps) {
  const [filterTab, setFilterTab] = useState<FilterTab>('active');
  const [showResetDialog, setShowResetDialog] = useState(false);

  const updateMutation = useUpdateAssistantMemory(userId);
  const deleteMutation = useDeleteAssistantMemory(userId);

  const isMutating = updateMutation.isPending || deleteMutation.isPending;
  const memoryEnabled = memory?.preferences.memoryEnabled ?? true;

  // Group items by category preserving the canonical display order
  const filteredItems = (memory?.items ?? []).filter((item) => item.status === filterTab);
  const groupedItems = CATEGORY_ORDER.map((category) => ({
    category,
    items: filteredItems.filter((item) => item.category === category),
  })).filter((group) => group.items.length > 0);

  const handleToggleMemory = async (enabled: boolean) => {
    try {
      await updateMutation.mutateAsync({ preferences: { memoryEnabled: enabled } });
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleEdit = async (id: string, text: string) => {
    const item = memory?.items.find((i) => i.id === id);
    if (!item) return;
    try {
      await updateMutation.mutateAsync({
        item: { id, text, category: item.category, status: item.status },
      });
    } catch (err) {
      toast.error((err as Error).message);
      throw err; // Re-throw so the row can keep edit mode open
    }
  };

  const handleArchive = async (id: string, currentStatus: AssistantMemoryItem['status']) => {
    const item = memory?.items.find((i) => i.id === id);
    if (!item) return;
    const newStatus: AssistantMemoryItem['status'] =
      currentStatus === 'active' ? 'archived' : 'active';
    try {
      await updateMutation.mutateAsync({
        item: { id, text: item.text, category: item.category, status: newStatus },
      });
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMutation.mutateAsync({ itemId: id });
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleResetAll = async () => {
    try {
      await deleteMutation.mutateAsync({ resetAll: true });
      setShowResetDialog(false);
      toast.success('Memoria resettata');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const totalItems = memory?.items.length ?? 0;
  const activeCount = (memory?.items ?? []).filter((i) => i.status === 'active').length;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-muted-foreground" />
                Memoria
              </CardTitle>
              <CardDescription>
                {isLoading
                  ? 'Caricamento…'
                  : activeCount > 0
                  ? `${activeCount} ricord${activeCount === 1 ? 'o' : 'i'} attiv${activeCount === 1 ? 'o' : 'i'}`
                  : 'Nessun ricordo ancora'}
              </CardDescription>
            </div>

            {/* Reset button — only shown when there are items */}
            {totalItems > 0 && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                disabled={isMutating}
                onClick={() => setShowResetDialog(true)}
                aria-label="Elimina tutta la memoria"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Memory enabled toggle */}
          <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2">
            <div>
              <p className="text-sm font-medium text-foreground">Apprendimento automatico</p>
              <p className="text-xs text-muted-foreground">
                {memoryEnabled
                  ? 'Estrae fatti stabili dalle conversazioni'
                  : "L'assistente non salverà nuovi ricordi"}
              </p>
            </div>
            <Switch
              checked={memoryEnabled}
              onCheckedChange={handleToggleMemory}
              disabled={isLoading || isMutating}
            />
          </div>

          {/* Loading state */}
          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Caricamento memoria…
            </div>
          )}

          {/* Filter tabs: Attivi / Archiviati */}
          {!isLoading && totalItems > 0 && (
            <div className="flex gap-1 rounded-lg border border-border bg-muted/30 p-0.5">
              {(['active', 'archived'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setFilterTab(tab)}
                  className={cn(
                    'flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors',
                    filterTab === tab
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {tab === 'active' ? 'Attivi' : 'Archiviati'}
                </button>
              ))}
            </div>
          )}

          {/* Items grouped by category */}
          {!isLoading && (
            <>
              {groupedItems.length === 0 ? (
                <EmptyState
                  icon={<Brain className="h-7 w-7" />}
                  title={
                    filterTab === 'active'
                      ? 'Nessun ricordo attivo'
                      : 'Nessun ricordo archiviato'
                  }
                  description={
                    filterTab === 'active' && memoryEnabled
                      ? 'I fatti stabili che dichiari nelle chat verranno salvati qui.'
                      : filterTab === 'active'
                      ? "Attiva l'apprendimento per acquisire nuovi ricordi."
                      : ''
                  }
                  className="py-4"
                />
              ) : (
                <div className="space-y-4">
                  {groupedItems.map(({ category, items }) => (
                    <div key={category}>
                      {/* Category section header */}
                      <p className="mb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                        {CATEGORY_GROUP_LABELS[category]}
                      </p>
                      <div className="space-y-1.5">
                        {items.map((item) => (
                          <AssistantMemoryItemRow
                            key={item.id}
                            item={item}
                            isMutating={isMutating}
                            onEdit={handleEdit}
                            onArchive={handleArchive}
                            onDelete={handleDelete}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Reset all confirmation dialog */}
      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-4 w-4 text-destructive" />
              Elimina tutta la memoria
            </DialogTitle>
            <DialogDescription>
              Tutti i ricordi ({totalItems} item) verranno eliminati in modo permanente.
              Le preferenze (stile, contesto macro, memoria on/off) vengono conservate.
              Questa operazione non è reversibile.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowResetDialog(false)}
              disabled={deleteMutation.isPending}
            >
              Annulla
            </Button>
            <Button
              variant="destructive"
              onClick={handleResetAll}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Eliminazione…
                </>
              ) : (
                'Elimina tutto'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
