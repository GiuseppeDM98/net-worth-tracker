'use client';

import { useMemo, useState } from 'react';
import { Check, Loader2, Target, X } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import { Button } from '@/components/ui/button';
import { TILE_EYEBROW_CLASS, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { useAssets } from '@/lib/hooks/useAssets';
import { useGoalData } from '@/lib/hooks/useGoalData';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import { ASSET_CLASS_LABELS } from '@/lib/utils/allocationUtils';
import { cachedFormatCurrencyEUR, formatDate, formatPercentageIt } from '@/lib/utils/formatters';
import { findAssetByName } from '@/lib/utils/allocationAdviceApply';
import { GoalProposal, GoalWriteAssignment } from '@/lib/utils/goalProposal';
import { PRIORITY_META } from '@/components/goals/goalVerdictMeta';
import type { InvestmentGoal } from '@/types/goals';
import { cn } from '@/lib/utils';

interface GoalProposalCardProps {
  proposal: GoalProposal;
}

type SubmitState = 'idle' | 'saving' | 'written' | 'dismissed';

// Module-level so the card's try block holds no `throw`: keeps it compilable by the React Compiler.
async function assertGoalWritten(response: Response, fallback: string): Promise<void> {
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? fallback);
  }
}

/**
 * The write itself, module-level: a conditional inside the card's try block is a value block
 * the React Compiler refuses (seen red in reactCompilerCoverage, 2026-10-20), so the branches —
 * POST for a new goal, PATCH for an update, the quotas present or left alone — live here.
 */
function sendGoalWrite(args: { ownerId: string; proposal: GoalProposal; isUpdate: boolean; quotas: GoalWriteAssignment[]; keepQuotas: boolean }): Promise<Response> {
  const { ownerId, proposal, isUpdate, quotas, keepQuotas } = args;
  if (isUpdate) {
    return authenticatedFetch('/api/goals', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: ownerId,
        goalId: proposal.goalId,
        goal: proposal,
        // Absent quotas leave the goal's as they are; present ones replace them — unless one
        // name matched nothing: then today's quotas all stay (the owner's run, 2026-10-20, wiped
        // a household member's quota of an ETF by writing the resolved list, which was empty).
        ...(proposal.assignments !== undefined && !keepQuotas ? { assignments: quotas } : {}),
      }),
    });
  }
  return authenticatedFetch('/api/goals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: ownerId, goal: proposal, assignments: quotas }),
  });
}

/** The quotas' eyebrow: what the write does with them, in one line. */
function describeQuotasEyebrow(isUpdate: boolean, hasUnmatched: boolean): string {
  if (!isUpdate) return 'Strumenti e quote';
  if (hasUnmatched) return 'Strumenti e quote (uno non riconosciuto: le quote di oggi restano tutte come sono)';
  return 'Strumenti e quote (sostituiscono quelle di oggi)';
}

/** «prima → dopo» for one field, or the value alone when the card creates a goal. */
function ChangeRow({ label, before, after }: { label: string; before: string | null; after: string }) {
  const changed = before !== null && before !== after;
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[13px] text-muted-foreground">{label}</dt>
      <dd className="m-0 font-mono text-[13px] tabular-nums text-foreground">
        {changed && <span className="mr-1.5 text-muted-foreground line-through">{before}</span>}
        {after}
      </dd>
    </div>
  );
}

const NONE_OPEN = 'Nessuno (aperto)';
const NONE = 'Nessuna';

/**
 * The confirmation half of the ```goal-proposal protocol.
 *
 * The assistant proposes a goal — new, or since 2026-10-20 a MODIFICATION of an existing one
 * (`goalId`) — and nothing is written until the user presses Conferma: POST /api/goals for a
 * new goal, PATCH for an update, each with the quotas the proposal names resolved HERE to asset
 * ids (the card holds the assets; the server never guesses a name). On an update the rows read
 * before → after, so what changes is on the card before it is written.
 *
 * The card carries no props beyond the parsed proposal and reads owner, demo mode, the assets,
 * the goals and the query client itself — `MARKDOWN_COMPONENTS` must stay module-level
 * (ReactMarkdown re-mounts the whole tree otherwise), so there is nowhere to thread handlers
 * through.
 *
 * Inside an assistant message it is a muted sub-tile (`bg-muted/40`, 12px radius), never a
 * card: a card inside the Conversazione tile would be a card inside a card. Its cadence is
 * the tile's — the 10px eyebrow, the name at 15px, flat 13px rows with mono figures.
 *
 * The "written" state lives in component state only. On reload the message is re-parsed
 * from its stored text and the button comes back: pressing it again creates a second,
 * plainly visible goal (or rewrites the same one again) rather than corrupting anything,
 * which is the acceptable failure for v1.
 */
export function GoalProposalCard({ proposal }: GoalProposalCardProps) {
  const { ownerId } = useActiveAccount();
  const isDemo = useDemoMode();
  const queryClient = useQueryClient();
  const assetsQuery = useAssets(ownerId);
  const goalsQuery = useGoalData(ownerId);
  const [state, setState] = useState<SubmitState>('idle');

  const assets = assetsQuery.data;
  const current: InvestmentGoal | null = useMemo(
    () => (proposal.goalId ? (goalsQuery.data?.goals.find((goal) => goal.id === proposal.goalId) ?? null) : null),
    [proposal.goalId, goalsQuery.data]
  );
  const isUpdate = proposal.goalId !== undefined;
  // The goal an update names is not there (deleted, or the model misread the id): the card says so and writes nothing.
  const updateTargetMissing = isUpdate && goalsQuery.data !== undefined && current === null;

  // The quotas by name → by id; a name that matches no asset is listed and left out.
  const quotas = useMemo(() => {
    const resolved: GoalWriteAssignment[] = [];
    const unmatched: string[] = [];
    const labels: { name: string; percentage: number; matched: boolean }[] = [];
    const list = assets ?? [];
    for (const row of proposal.assignments ?? []) {
      const asset = findAssetByName(list, row.assetName);
      if (asset) resolved.push({ assetId: asset.id, percentage: row.percentage });
      else unmatched.push(row.assetName);
      labels.push({ name: asset?.name ?? row.assetName, percentage: row.percentage, matched: asset !== null });
    }
    return { resolved, unmatched, labels };
  }, [proposal.assignments, assets]);

  const handleConfirm = async () => {
    if (!ownerId || isDemo || updateTargetMissing) return;

    const failureMessage = isUpdate ? "Impossibile aggiornare l'obiettivo" : "Impossibile creare l'obiettivo";
    const keepQuotas = isUpdate && quotas.unmatched.length > 0;
    const successMessage = isUpdate ? `Obiettivo "${proposal.name}" aggiornato` : `Obiettivo "${proposal.name}" creato`;
    setState('saving');
    try {
      const response = await sendGoalWrite({ ownerId, proposal, isUpdate, quotas: quotas.resolved, keepQuotas });
      await assertGoalWritten(response, failureMessage);

      // Same key the FIRE page's goal query uses, so the goal is there when the user navigates over.
      await queryClient.invalidateQueries({ queryKey: queryKeys.goals.all(ownerId) });
      setState('written');
      toast.success(successMessage);
    } catch (error) {
      setState('idle');
      toast.error(error instanceof Error ? error.message : "Impossibile scrivere l'obiettivo");
    }
  };

  const allocationEntries = Object.entries(proposal.recommendedAllocation ?? {}).sort(
    (a, b) => (b[1] ?? 0) - (a[1] ?? 0)
  );

  const before = current
    ? {
        target: current.targetAmount != null ? cachedFormatCurrencyEUR(current.targetAmount, true) : NONE_OPEN,
        date: current.targetDate ? formatDate(new Date(current.targetDate)) : NONE,
        monthly: current.monthlyContribution != null ? cachedFormatCurrencyEUR(current.monthlyContribution, true) : NONE,
      }
    : null;

  return (
    <div className="not-prose my-3 rounded-xl bg-muted/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={cn(TILE_EYEBROW_CLASS, 'inline-flex items-center gap-1.5')}>
            <Target className="h-3 w-3" aria-hidden="true" />
            {isUpdate ? 'Modifica di un obiettivo' : 'Proposta di obiettivo'}
          </p>
          <p className="mt-1 text-[15px] font-semibold leading-snug text-foreground">
            {current && current.name !== proposal.name && <span className="mr-1.5 font-normal text-muted-foreground line-through">{current.name}</span>}
            {proposal.name}
          </p>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium',
            PRIORITY_META[proposal.priority].chipClass
          )}
        >
          Priorità {PRIORITY_META[proposal.priority].label.toLowerCase()}
          {current && current.priority !== proposal.priority ? ` (era ${PRIORITY_META[current.priority].label.toLowerCase()})` : ''}
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
        <ChangeRow
          label="Importo target"
          before={before?.target ?? null}
          after={proposal.targetAmount != null ? cachedFormatCurrencyEUR(proposal.targetAmount, true) : NONE_OPEN}
        />
        <ChangeRow label="Scadenza" before={before?.date ?? null} after={proposal.targetDateIso ? formatDate(new Date(proposal.targetDateIso)) : NONE} />
        {(proposal.monthlyContribution != null || (before && before.monthly !== NONE)) && (
          <ChangeRow
            label="Contributo mensile"
            before={before?.monthly ?? null}
            after={proposal.monthlyContribution != null ? cachedFormatCurrencyEUR(proposal.monthlyContribution, true) : NONE}
          />
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

      {quotas.labels.length > 0 && (
        <div className="mt-3 border-t border-border pt-3">
          <p className={TILE_SUB_EYEBROW_CLASS}>{describeQuotasEyebrow(isUpdate, quotas.unmatched.length > 0)}</p>
          <ul className="mt-1.5 space-y-1">
            {quotas.labels.map((row) => (
              <li key={row.name} className={cn('flex items-baseline justify-between gap-3 text-[13px]', row.matched ? 'text-foreground' : 'text-warning-foreground')}>
                <span className="min-w-0 truncate">
                  {row.name}
                  {!row.matched && (isUpdate ? ' · non trovato fra i tuoi strumenti' : ' · non trovato fra i tuoi strumenti, non viene scritto')}
                </span>
                <span className="shrink-0 font-mono tabular-nums">{formatPercentageIt(row.percentage, 0)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {proposal.notes && (
        <p className="mt-3 text-[13px] leading-[1.45] text-muted-foreground">{proposal.notes}</p>
      )}

      {updateTargetMissing && (
        <p className="mt-3 text-[13px] leading-[1.45] text-warning-foreground">
          L&apos;obiettivo da modificare non c&apos;è più: forse è stato eliminato. Chiedi all&apos;assistente di proporlo come nuovo.
        </p>
      )}

      <div className="mt-4 flex items-center gap-2">
        {state === 'written' ? (
          <span className="flex items-center gap-1.5 text-[13px] font-medium text-positive">
            <Check className="h-4 w-4" aria-hidden="true" />
            {isUpdate ? 'Obiettivo aggiornato' : 'Obiettivo creato'}
          </span>
        ) : state === 'dismissed' ? (
          <span className="text-[13px] text-muted-foreground">Proposta ignorata</span>
        ) : (
          <>
            <Button
              size="sm"
              className="h-9"
              onClick={handleConfirm}
              disabled={state === 'saving' || isDemo || !ownerId || updateTargetMissing}
              aria-label={isDemo ? 'Conferma — non disponibile in modalità demo' : 'Conferma'}
            >
              {state === 'saving' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  {isUpdate ? 'Aggiornamento…' : 'Creazione…'}
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
