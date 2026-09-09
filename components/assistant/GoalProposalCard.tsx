'use client';

import { useState } from 'react';
import { Check, Loader2, Target, X } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { TILE_EYEBROW_CLASS, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import { ASSET_CLASS_LABELS } from '@/lib/utils/allocationUtils';
import { cachedFormatCurrencyEUR, formatDate } from '@/lib/utils/formatters';
import { GoalProposal } from '@/lib/utils/goalProposal';
import { PRIORITY_META } from '@/components/goals/goalVerdictMeta';
import { cn } from '@/lib/utils';

interface GoalProposalCardProps {
  proposal: GoalProposal;
}

type SubmitState = 'idle' | 'saving' | 'created' | 'dismissed';

/**
 * The confirmation half of the ```goal-proposal protocol.
 *
 * The assistant proposes a goal; nothing is written until the user presses Conferma.
 * The card carries no props beyond the parsed proposal and reads owner, demo mode and
 * the query client itself — `MARKDOWN_COMPONENTS` must stay module-level (ReactMarkdown
 * re-mounts the whole tree otherwise), so there is nowhere to thread handlers through.
 *
 * Inside an assistant message it is a muted sub-tile (`bg-muted/40`, 12px radius), never a
 * card: a card inside the Conversazione tile would be a card inside a card. Its cadence is
 * the tile's — the 10px eyebrow, the name at 15px, flat 13px rows with mono figures.
 *
 * The "created" state lives in component state only. On reload the message is re-parsed
 * from its stored text and the button comes back: pressing it again creates a second,
 * plainly visible goal rather than corrupting the first, which is the acceptable failure
 * for v1.
 */
export function GoalProposalCard({ proposal }: GoalProposalCardProps) {
  const { ownerId } = useActiveAccount();
  const isDemo = useDemoMode();
  const queryClient = useQueryClient();
  const [state, setState] = useState<SubmitState>('idle');

  const handleConfirm = async () => {
    if (!ownerId || isDemo) return;

    setState('saving');
    try {
      const response = await authenticatedFetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: ownerId, goal: proposal }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Impossibile creare l'obiettivo");
      }

      // Same key the FIRE page's goal query uses, so the new goal is there when the
      // user navigates over.
      await queryClient.invalidateQueries({ queryKey: ['goalData', ownerId] });
      setState('created');
      toast.success(`Obiettivo "${proposal.name}" creato`);
    } catch (error) {
      setState('idle');
      toast.error(error instanceof Error ? error.message : "Impossibile creare l'obiettivo");
    }
  };

  const allocationEntries = Object.entries(proposal.recommendedAllocation ?? {}).sort(
    (a, b) => (b[1] ?? 0) - (a[1] ?? 0)
  );

  return (
    <div className="not-prose my-3 rounded-xl bg-muted/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={cn(TILE_EYEBROW_CLASS, 'inline-flex items-center gap-1.5')}>
            <Target className="h-3 w-3" aria-hidden="true" />
            Proposta di obiettivo
          </p>
          <p className="mt-1 text-[15px] font-semibold leading-snug text-foreground">{proposal.name}</p>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium',
            PRIORITY_META[proposal.priority].chipClass
          )}
        >
          Priorità {PRIORITY_META[proposal.priority].label.toLowerCase()}
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
        <ProposalRow
          label="Importo target"
          value={proposal.targetAmount != null ? cachedFormatCurrencyEUR(proposal.targetAmount, true) : 'Nessuno (aperto)'}
        />
        <ProposalRow
          label="Scadenza"
          value={proposal.targetDateIso ? formatDate(new Date(proposal.targetDateIso)) : 'Nessuna'}
        />
        {proposal.monthlyContribution != null && (
          <ProposalRow label="Contributo mensile" value={cachedFormatCurrencyEUR(proposal.monthlyContribution, true)} />
        )}
      </dl>

      {allocationEntries.length > 0 && (
        <div className="mt-3 border-t border-border pt-3">
          <p className={TILE_SUB_EYEBROW_CLASS}>Allocazione consigliata</p>
          <ul className="mt-1.5 space-y-1">
            {allocationEntries.map(([assetClass, percentage]) => (
              <li key={assetClass} className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="min-w-0 truncate text-foreground">
                  {ASSET_CLASS_LABELS[assetClass] ?? assetClass}
                </span>
                <span className="shrink-0 font-mono tabular-nums text-foreground">{percentage}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {proposal.notes && (
        <p className="mt-3 text-[13px] leading-[1.45] text-muted-foreground">{proposal.notes}</p>
      )}

      <div className="mt-4 flex items-center gap-2">
        {state === 'created' ? (
          <span className="flex items-center gap-1.5 text-[13px] font-medium text-positive">
            <Check className="h-4 w-4" aria-hidden="true" />
            Obiettivo creato
          </span>
        ) : state === 'dismissed' ? (
          <span className="text-[13px] text-muted-foreground">Proposta ignorata</span>
        ) : (
          <>
            <Button
              size="sm"
              className="h-9"
              onClick={handleConfirm}
              disabled={state === 'saving' || isDemo || !ownerId}
              aria-label={isDemo ? 'Conferma — non disponibile in modalità demo' : 'Conferma'}
            >
              {state === 'saving' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Creazione…
                </>
              ) : (
                'Conferma'
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-9"
              onClick={() => setState('dismissed')}
              disabled={state === 'saving'}
            >
              <X className="h-4 w-4" aria-hidden="true" />
              Ignora
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function ProposalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[13px] text-muted-foreground">{label}</dt>
      <dd className="m-0 font-mono text-[13px] tabular-nums text-foreground">{value}</dd>
    </div>
  );
}
