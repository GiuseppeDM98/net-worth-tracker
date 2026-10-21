'use client';

/**
 * The Compravendita PATH: one question per screen, «Indietro» always, the draft on this browser —
 * the Consulente's card (ConsulenteWizard.tsx), so the reader learns one shape. Every screen is the
 * same tile: eyebrow «Passo n di N · {tema}», the question as the headline, a help line, the controls
 * (CompravenditaScreens.tsx), the footer. The last screen lists the plan in sentences and «Conferma»
 * runs it (lib/services/realEstateOperationService.ts); a confirmed run shows what it wrote.
 *
 * «Ricomincia» (owner, 2026-10-21 tour) clears the draft from any screen, armed like a movement's
 * delete (`useArmedDelete`): the first press asks again, so a stray tap never loses the answers.
 */

import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
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
  writeStoredDraft,
  type RealEstateDraftContext,
} from '@/lib/utils/realEstateOperationDraft';
import { buildRealEstatePlan, propertyNameOf } from '@/lib/utils/realEstateOperationPlan';
import { describeDone, describePartialFailure, describePlanStep, describeScreenBlock, screenCopy, type PlanNames } from '@/lib/utils/realEstateOperationNarrative';
import { executeRealEstatePlan } from '@/lib/services/realEstateOperationService';
import { describeWriteError } from '@/lib/utils/dialogNarrative';
import { TILE_EYEBROW_CLASS, TILE_SURFACE_CLASS } from '@/components/ui/tile';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useArmedDelete } from '@/lib/hooks/useArmedDelete';
import { ScreenBody } from './CompravenditaScreens';

const HEADLINE_CLASS = 'text-[24px] font-semibold leading-[1.15] tracking-[-0.025em] text-foreground desktop:text-[30px]';
const HELP_CLASS = 'text-[14px] leading-[1.6] text-muted-foreground desktop:text-[15px]';
const BUTTON_CLASS = 'h-11 desktop:h-9';

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
  const copy = screenCopy(screen, answers);
  const position = screenPosition(draft, context);
  const block = describeScreenBlock(screen, answers, context);
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

  const restartRef = useRef<HTMLButtonElement | null>(null);
  const { armed: restartArmed, onClick: onRestartClick, onBlur: onRestartBlur } = useArmedDelete(restartRef, restart);

  if (run.kind === 'done') {
    return (
      <section className={cn(TILE_SURFACE_CLASS, 'mx-auto w-full max-w-[720px] p-5 desktop:p-6')} aria-label="Operazione registrata">
        <h2 className={TILE_EYEBROW_CLASS}>Fatto</h2>
        <p className={cn(HEADLINE_CLASS, 'mt-3')} role="status">
          {run.message}
        </p>
        <p className={cn(HELP_CLASS, 'mt-2')}>Ogni voce si modifica dalla sua pagina: la casa e i prestiti in Patrimonio, trasferimenti, spese e serie nel Cashflow.</p>
        <div className="mt-6 flex flex-col gap-2 border-t border-border pt-4 tablet:flex-row tablet:justify-end">
          <Button type="button" variant="outline" className={BUTTON_CLASS} onClick={restart}>
            Registra un altro evento
          </Button>
          <Button asChild variant="outline" className={BUTTON_CLASS}>
            <Link href="/dashboard/cashflow">Vai al Cashflow</Link>
          </Button>
          <Button asChild className={BUTTON_CLASS}>
            <Link href="/dashboard/assets">Vai a Patrimonio</Link>
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className={cn(TILE_SURFACE_CLASS, 'mx-auto w-full max-w-[720px] p-5 desktop:p-6')} aria-label={`Passo ${position.index + 1} di ${position.total}: ${copy.eyebrow}`}>
      <h2 className={TILE_EYEBROW_CLASS}>
        Passo {position.index + 1} di {position.total} · {copy.eyebrow}
      </h2>
      <p className={cn(HEADLINE_CLASS, 'mt-3')}>{copy.question}</p>
      <p className={cn(HELP_CLASS, 'mt-2 max-w-[600px]')}>{copy.help}</p>

      <div className="mt-5 flex flex-col gap-4">
        {screen === 'riepilogo' && plan ? (
          <ol className="flex flex-col divide-y divide-border rounded-xl border border-border" aria-label="Le scritture, in ordine">
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
      </div>

      <div className="mt-6 flex flex-col-reverse gap-2 border-t border-border pt-4 tablet:flex-row tablet:items-center tablet:justify-between">
        <div className="flex flex-col-reverse gap-2 tablet:flex-row">
          <Button type="button" variant="outline" className={BUTTON_CLASS} onClick={() => dispatch({ type: 'back', context })} disabled={position.index === 0 || run.kind === 'running'}>
            Indietro
          </Button>
          <Button
            ref={restartRef}
            type="button"
            variant={restartArmed ? 'destructive' : 'ghost'}
            className={cn(BUTTON_CLASS, !restartArmed && 'text-muted-foreground')}
            onClick={onRestartClick}
            onBlur={onRestartBlur}
            disabled={run.kind === 'running'}
            aria-pressed={restartArmed}
          >
            {restartArmed ? 'Premi di nuovo per ricominciare' : 'Ricomincia'}
          </Button>
        </div>
        <div className="flex flex-col gap-2 tablet:items-end">
          {(block || run.kind === 'failed') && (
            <p role="status" className={cn('text-[12px]', run.kind === 'failed' ? 'text-destructive' : 'text-warning-foreground')}>
              {run.kind === 'failed' ? run.message : block}
            </p>
          )}
          {screen === 'riepilogo' ? (
            <Button type="button" className={BUTTON_CLASS} disabled={run.kind === 'running' || run.kind === 'failed' || !plan || plan.steps.length === 0} onClick={confirm}>
              {run.kind === 'running' ? 'Registro…' : 'Conferma'}
            </Button>
          ) : (
            <Button type="button" className={BUTTON_CLASS} disabled={block !== null} onClick={() => dispatch({ type: 'next', context })}>
              Avanti
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
