'use client';

import { useMemo, useState } from 'react';
import { Check, Loader2, Target, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import { Button } from '@/components/ui/button';
import { TILE_EYEBROW_CLASS, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { patchMessageProposal, useMessageId } from '@/components/assistant/MessageIdContext';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { AI_GENERATED_EYEBROW_CLASS, AI_GENERATED_SURFACE_CLASS } from '@/lib/constants/aiAccent';
import { GOAL_STATE_NOT_SAVED } from '@/lib/utils/dialogNarrative';
import { PROPOSAL_INTERRUPTED_LINE, proposalKey } from '@/lib/utils/expenseProposal';
import { cardEnterVariants } from '@/lib/utils/motionVariants';
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
  /** The block's rank among the message's ```goal-proposal blocks: the card's key on the message. */
  index: number;
}

// Module-level so the card's try block holds no `throw`: keeps it compilable by the React Compiler.
// Returns the id of the goal the route wrote (`{ goal }`), for the outcome recorded on the message.
async function readWrittenGoalId(response: Response, fallback: string): Promise<string[]> {
  const payload = (await response.json().catch(() => null)) as { error?: string; goal?: { id?: string } } | null;
  if (!response.ok) {
    throw new Error(payload?.error ?? fallback);
  }
  return payload?.goal?.id ? [payload.goal.id] : [];
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
 * The outcome lives on the message (2026-11), like the expense card's: `proposals["goal:N"]`,
 * recorded in the session and saved by the PATCH, so a reload shows «Obiettivo creato» instead
 * of the buttons and the same goal is not written twice; a message with no server id offers no
 * button, and a save that fails after the write is a toast (2026-11-11, the expense card's two
 * rules). It is what the model wrote, so it wears
 * the AI accent (DESIGN → The AI-Accent Rule).
 */
export function GoalProposalCard({ proposal, index }: GoalProposalCardProps) {
  const { ownerId } = useActiveAccount();
  const isDemo = useDemoMode();
  const queryClient = useQueryClient();
  const assetsQuery = useAssets(ownerId);
  const goalsQuery = useGoalData(ownerId);
  const { messageId, threadId, proposals, recordProposal } = useMessageId();
  const [saving, setSaving] = useState(false);
  const key = proposalKey('goal', index);
  const persisted = proposals[key]?.status;
  // A message that never received its server id (stopped before the stream's end) has nowhere to
  // save an outcome, so it offers no button — the expense card's rule (2026-11-11).
  const interrupted = messageId.startsWith('local-');
  const state = persisted === 'written' ? 'written' : persisted === 'ignored' ? 'dismissed' : interrupted ? 'interrupted' : saving ? 'saving' : 'idle';

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
    setSaving(true);
    try {
      const response = await sendGoalWrite({ ownerId, proposal, isUpdate, quotas: quotas.resolved, keepQuotas });
      const writtenIds = await readWrittenGoalId(response, failureMessage);

      // Same key the FIRE page's goal query uses, so the goal is there when the user navigates over.
      await queryClient.invalidateQueries({ queryKey: queryKeys.goals.all(ownerId) });
      const outcome = { status: 'written' as const, writtenIds };
      recordProposal(key, outcome);
      toast.success(successMessage);
      // The goal IS written by now: a failed save of the outcome is said, never an error state.
      const saved = await patchMessageProposal({ ownerId, threadId, messageId, key, state: outcome });
      if (saved === false) toast.error(GOAL_STATE_NOT_SAVED);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossibile scrivere l'obiettivo");
    }
    setSaving(false);
  };

  const handleIgnore = () => {
    const outcome = { status: 'ignored' as const };
    recordProposal(key, outcome);
    if (ownerId) void patchMessageProposal({ ownerId, threadId, messageId, key, state: outcome });
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
    <motion.div
      variants={cardEnterVariants}
      initial="enter"
      animate="center"
      data-generated
      data-proposal={key}
      className={cn('not-prose my-3 rounded-xl border bg-muted/40 p-4', AI_GENERATED_SURFACE_CLASS)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={cn(TILE_EYEBROW_CLASS, AI_GENERATED_EYEBROW_CLASS, 'inline-flex items-center gap-1.5')}>
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

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {state === 'written' ? (
          <span className="flex items-center gap-1.5 text-[13px] font-medium text-positive">
            <Check className="h-4 w-4" aria-hidden="true" />
            {isUpdate ? 'Obiettivo aggiornato' : 'Obiettivo creato'}
          </span>
        ) : state === 'dismissed' ? (
          <span className="text-[13px] text-muted-foreground">Proposta ignorata</span>
        ) : state === 'interrupted' ? (
          <span className="text-[13px] text-muted-foreground">{PROPOSAL_INTERRUPTED_LINE}</span>
        ) : (
          <>
            <Button
              size="sm"
              className="h-11 desktop:h-9"
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
              className="h-11 desktop:h-9"
              onClick={handleIgnore}
              disabled={state === 'saving'}
            >
              <X className="h-4 w-4" aria-hidden="true" />
              Ignora
            </Button>
          </>
        )}
      </div>
    </motion.div>
  );
}
