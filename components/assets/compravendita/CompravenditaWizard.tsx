'use client';

/**
 * The Compravendita PATH: one question per screen, «Indietro» always, the draft on this browser —
 * every screen is the guided paths' card (`PathCard`, components/ui/path-card.tsx), so the reader learns
 * one shape; the controls are CompravenditaScreens.tsx. The last screen lists the plan in sentences and
 * «Conferma» runs it (lib/services/realEstateOperationService.ts); a confirmed run shows what it wrote.
 * «Ricomincia» (owner, 2026-10-21 tour) clears the draft from any screen.
 */

import { useEffect, useMemo, useReducer, useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import type { Asset, FamilyMember } from '@/types/assets';
import { queryKeys } from '@/lib/query/queryKeys';
import {
  clearStoredDraft,
  initialAnswers,
  initialDraft,
  readStoredDraft,
  realEstateOperationReducer,
  screenPosition,
  screensFor,
  writeStoredDraft,
  type RealEstateDraftContext,
} from '@/lib/utils/realEstateOperationDraft';
import { buildRealEstatePlan, figuresOf, propertyNameOf } from '@/lib/utils/realEstateOperationPlan';
import { describeDone, describePartialFailure, describePlanStep, describeScreenBlock, firstScreenRefusal, screenCopy, type PlanNames } from '@/lib/utils/realEstateOperationNarrative';
import { executeRealEstatePlan } from '@/lib/services/realEstateOperationService';
import { describeWriteError } from '@/lib/utils/dialogNarrative';
import { PATH_BUTTON_CLASS, PathCard, PathDoneCard } from '@/components/ui/path-card';
import { Button } from '@/components/ui/button';
import { ScreenBody } from './CompravenditaScreens';
import { COSTUME_FRAME_RADIUS_CLASS } from '@/lib/constants/themeCostume';
import { cn } from '@/lib/utils';

type RunState = { kind: 'idle' } | { kind: 'running' } | { kind: 'done'; message: string } | { kind: 'failed'; message: string };

interface CompravenditaWizardProps {
  ownerId: string;
  context: RealEstateDraftContext;
  familyMembers: readonly FamilyMember[];
}

export function CompravenditaWizard({ ownerId, context, familyMembers }: CompravenditaWizardProps) {
  const queryClient = useQueryClient();
  const storage = typeof window !== 'undefined' ? window.localStorage : null;
  const [draft, dispatch] = useReducer(realEstateOperationReducer, null, () => readStoredDraft(storage, ownerId) ?? initialDraft(initialAnswers(context)));
  const [run, setRun] = useState<RunState>({ kind: 'idle' });

  // The draft follows every change onto this browser; a confirmed run clears it.
  useEffect(() => {
    if (run.kind === 'done') return;
    writeStoredDraft(storage, ownerId, draft);
  }, [storage, ownerId, draft, run.kind]);

  const { answers, screen } = draft;
  const accounts = useMemo(() => context.assets.filter((asset: Asset) => asset.type === 'cash' && asset.assetClass === 'cash'), [context.assets]);
  const propertyName = propertyNameOf(answers, context);
  const copy = screenCopy(screen, answers, figuresOf(answers, context).mortgageExcess);
  const position = screenPosition(draft, context);
  const block = describeScreenBlock(screen, answers, context);
  // The summary has no block of its own: it re-checks every screen of the run, so a restored draft or a house
  // moved in another tab cannot slip past a refusal (2026-11-12).
  const refusal = screen === 'riepilogo' ? firstScreenRefusal(screensFor(answers, context), answers, context) : null;
  const plan = useMemo(() => (screen === 'riepilogo' ? buildRealEstatePlan(answers, context) : null), [screen, answers, context]);

  const names: PlanNames = {
    assetName: (id) => context.assets.find((asset) => asset.id === id)?.name ?? 'un conto',
    propertyName,
    costCenterName:
      answers.costCenter.mode === 'new' ? answers.costCenter.name.trim() || null : answers.costCenter.mode === 'existing' ? context.costCenters.find((center) => center.id === answers.costCenter.existingId)?.name ?? null : null,
  };

  const confirm = async () => {
    if (!plan) return;
    setRun({ kind: 'running' });
    const existing = plan.costCenterId && plan.costCenterId !== 'new' ? context.costCenters.find((center) => center.id === plan.costCenterId) ?? null : null;
    const result = await executeRealEstatePlan(ownerId, plan, context.categories, existing ? { id: existing.id, name: existing.name } : null);
    // Whatever landed, every reader of what the steps touch reads again.
    for (const key of [queryKeys.assets.all(ownerId), queryKeys.dashboard.overview(ownerId), queryKeys.expenses.all(ownerId), queryKeys.costCenters.all(ownerId)]) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
    if (result.failedAt === null) {
      clearStoredDraft(storage, ownerId);
      setRun({ kind: 'done', message: describeDone(answers, propertyName, result.total) });
      return;
    }
    const failedStep = describePlanStep(plan.steps[result.failedAt], names);
    setRun({ kind: 'failed', message: `${describePartialFailure(result.done, result.total, failedStep)} ${describeWriteError(result.error)}` });
  };

  const restart = () => {
    clearStoredDraft(storage, ownerId);
    dispatch({ type: 'reset', draft: initialDraft(initialAnswers(context)) });
    setRun({ kind: 'idle' });
  };

  if (run.kind === 'done') {
    return (
      <PathDoneCard ariaLabel="Operazione registrata" headline={run.message} help="Ogni voce si modifica dalla sua pagina: la casa e i prestiti in Patrimonio, trasferimenti, spese e serie nel Cashflow.">
        <Button type="button" variant="outline" className={PATH_BUTTON_CLASS} onClick={restart}>
          Registra un altro evento
        </Button>
        <Button asChild variant="outline" className={PATH_BUTTON_CLASS}>
          <Link href="/dashboard/cashflow">Vai al Cashflow</Link>
        </Button>
        <Button asChild className={PATH_BUTTON_CLASS}>
          <Link href="/dashboard/assets">Vai a Patrimonio</Link>
        </Button>
      </PathDoneCard>
    );
  }

  const running = run.kind === 'running';
  const statusText = run.kind === 'failed' ? run.message : block ?? refusal;
  const primary =
    screen === 'riepilogo'
      ? { label: running ? 'Registro…' : 'Conferma', onClick: () => void confirm(), disabled: running || run.kind === 'failed' || refusal !== null || !plan || plan.steps.length === 0 }
      : { label: 'Avanti', onClick: () => dispatch({ type: 'next', context }), disabled: block !== null };

  return (
    <PathCard
      step={{ index: position.index, total: position.total, theme: copy.eyebrow }}
      question={copy.question}
      help={copy.help}
      back={{ onClick: () => dispatch({ type: 'back', context }), disabled: position.index === 0 || running }}
      restart={{ onConfirm: restart, disabled: running }}
      status={statusText ? { tone: run.kind === 'failed' ? 'failure' : 'warning', text: statusText } : null}
      primary={primary}
    >
      {screen === 'riepilogo' && plan ? (
        <ol className={cn('flex flex-col divide-y divide-border border border-border', COSTUME_FRAME_RADIUS_CLASS)} aria-label="Le scritture, in ordine">
          {plan.steps.map((step, index) => (
            <li key={index} className="flex gap-3 px-4 py-3 text-[13px] leading-[1.5] text-foreground">
              <span className="w-5 shrink-0 font-mono text-muted-foreground">{index + 1}</span>
              <span>{describePlanStep(step, names)}</span>
            </li>
          ))}
        </ol>
      ) : (
        <ScreenBody screen={screen} answers={answers} dispatch={dispatch} context={context} accounts={accounts} familyMembers={familyMembers} propertyName={propertyName} />
      )}
    </PathCard>
  );
}
