'use client';

/**
 * ALLOCAZIONE › PIANO DI ACCUMULO (owner, 2026-11-19: «deve essere il più semplice possibile») — the guided
 * path that creates a plan by hand, or continues the draft in Accumulo (doc/guide/accumulo.md § Creare un
 * piano: il percorso). Compravendita's shape: one column, one 720px card (DESIGN.md → The Path-Scene Rule).
 *
 * The page reads what the plan needs — assets, settings, goals (the effective targets and the model's
 * basis), the plans, the model, the ledger (the «Mai comprato» rule) — and, beside them and never a reason
 * to wait or to fail, the Consulente's document («rivedi entro»). The states, the first that applies:
 * loading (the plans also fetched AFTER mount: a restored list may hold a draft another tab activated),
 * demo, a failed read, no targets, an ACTIVE plan (a sentence and «Apri Accumulo»), else the wizard.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import type { MonthKey } from '@/types/accumulationPlan';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { useAssets } from '@/lib/hooks/useAssets';
import { useSettings } from '@/lib/hooks/useSettings';
import { useGoalData } from '@/lib/hooks/useGoalData';
import { useAccumulationPlans, selectOpenPlan } from '@/lib/hooks/useAccumulationPlans';
import { useModelPortfolio } from '@/lib/hooks/useModelPortfolio';
import { useAllocationAdvice } from '@/lib/hooks/useAllocationAdvice';
import { useAssetLedgerMeta, useAssetTransactions } from '@/lib/hooks/useAssetTransactions';
import { queryKeys } from '@/lib/query/queryKeys';
import { composeReadState } from '@/lib/utils/readState';
import { describeReadFailure } from '@/lib/utils/statesNarrative';
import { getItalyDateIso } from '@/lib/utils/dateHelpers';
import { toMonthKey } from '@/lib/utils/planMonths';
import { DEFAULT_REBALANCE_BAND, buildHoldings } from '@/lib/utils/allocationUtils';
import { findFirstIntactInstallment, resolveInvestmentAccountId } from '@/lib/utils/accumulationPlanUtils';
import { buildModelBasis } from '@/lib/utils/modelPortfolio';
import { reviewDueState } from '@/lib/utils/allocationAdviceNarrative';
import { ACCUMULO_HREF, ACCUMULO_OPEN_LINK, ACCUMULO_PLAN_NOTHING_TO_REVISE } from '@/lib/utils/accumuloCopy';
import { planPathStorageKey, type PlanPathContext } from '@/lib/utils/planPath';
import { PLAN_PATH_ACTIVE, PLAN_PATH_BACK_LINK, PLAN_PATH_DEMO, PLAN_PATH_NO_TARGETS, PLAN_PATH_TITLE } from '@/lib/utils/planPathNarrative';
import { clearStored } from '@/lib/utils/pathDraftStorage';
import { resolveEffectiveTargets } from '@/lib/services/effectiveTargets';
import { compareAllocations } from '@/lib/services/assetAllocationService';
import { calculateAssetValue } from '@/lib/services/assetService';
import type { AssetAllocationSettings } from '@/types/assets';
import { cn } from '@/lib/utils';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { ErrorNotice } from '@/components/ui/error-notice';
import { EmptyState } from '@/components/ui/empty-state';
import { TileGridSkeleton } from '@/components/ui/tile-grid-skeleton';
import { TILE_SURFACE_CLASS } from '@/components/ui/tile';
import { PATH_BUTTON_CLASS } from '@/components/ui/path-card';
import { Button } from '@/components/ui/button';
import type { TileSkeletonCell } from '@/lib/utils/tileGridSkeleton';
import { DEPS } from '@/components/allocation/tiles/accumuloShared';
import { PianoWizard } from './PianoWizard';

/** One tall cell: the path's card. */
const SKELETON_CELLS: TileSkeletonCell[] = [{ span: 12, rows: 2 }];
const CARD_CLASS = cn(TILE_SURFACE_CLASS, 'mx-auto w-full max-w-[720px] p-5 desktop:p-6');

export function PianoClient() {
  const { user } = useAuth();
  const { ownerId } = useActiveAccount();
  const isDemo = useDemoMode();
  const queryClient = useQueryClient();
  const assetsQuery = useAssets(ownerId);
  const settingsQuery = useSettings(ownerId);
  const goalsQuery = useGoalData(ownerId);
  // Read again on mount even when fresh (a link from Accumulo): the mode is decided on the list fetched after mount.
  const plansQuery = useAccumulationPlans(ownerId ?? undefined, { refetchOnMount: 'always' });
  const modelQuery = useModelPortfolio(ownerId ?? undefined);
  const ledgerMetaQuery = useAssetLedgerMeta(ownerId ?? undefined);
  const tradesQuery = useAssetTransactions(ownerId ?? undefined, undefined, { enabled: !!ledgerMetaQuery.data });
  // Beside the reads, never a reason to wait or to fail: `null` while it loads or when it fails.
  const adviceQuery = useAllocationAdvice(ownerId ?? undefined);
  // «Today» read once, when the page opens (react-hooks/purity); «Conferma» reads it again.
  const [todayIso] = useState(() => getItalyDateIso(new Date()));
  const [todayMonth, setTodayMonth] = useState<MonthKey>(() => toMonthKey(new Date()));

  const { loading, loadFailed } = composeReadState([assetsQuery, settingsQuery, goalsQuery, plansQuery, modelQuery]);
  const plansFresh = plansQuery.isFetchedAfterMount;

  const assets = assetsQuery.data;
  const settings = settingsQuery.data;
  const goalData = goalsQuery.data;
  const openPlan = selectOpenPlan(plansQuery.data);
  const effective = useMemo(() => (assets && settings !== undefined && goalData !== undefined ? resolveEffectiveTargets(settings, goalData, assets) : null), [assets, settings, goalData]);
  const hasTargets = !!settings?.targets || !!effective?.fromGoals;
  const reviewDue = reviewDueState(adviceQuery.data, todayIso);
  const reviewByIso = reviewDue.state === 'none' ? null : reviewDue.reviewByIso;
  const tradedAssetIds = useMemo(
    () => (ledgerMetaQuery.data && tradesQuery.data ? new Set(tradesQuery.data.map((trade) => trade.assetId)) : null),
    [ledgerMetaQuery.data, tradesQuery.data]
  );

  const context = useMemo<PlanPathContext | null>(() => {
    if (!assets || !effective) return null;
    return {
      assets,
      targets: effective.targets,
      band: DEFAULT_REBALANCE_BAND,
      model: modelQuery.data ?? null,
      investmentAccountId: resolveInvestmentAccountId(settings, assets),
      openDraft: openPlan?.status === 'draft' ? openPlan : null,
      tradedAssetIds,
      holdings: buildHoldings(assets, calculateAssetValue),
      reviewByIso,
      compare: compareAllocations,
      deps: DEPS,
      todayMonth,
    };
  }, [assets, effective, modelQuery.data, settings, openPlan, tradedAssetIds, reviewByIso, todayMonth]);
  const basis = useMemo(
    () => buildModelBasis({ ...(settings ?? {}), ...(effective ? { targets: effective.targets } : {}) } as AssetAllocationSettings, goalData?.goals),
    [settings, effective, goalData]
  );

  // The plan this page just created keeps the wizard's done card: the refetched list must not turn it into «Hai già un piano».
  const [created, setCreated] = useState(false);
  const activePlan = !created && plansFresh && openPlan?.status === 'active' ? openPlan : null;
  // The active plan made a browser draft moot.
  useEffect(() => {
    if (activePlan && ownerId && typeof window !== 'undefined') clearStored(window.localStorage, planPathStorageKey(ownerId));
  }, [activePlan, ownerId]);

  const header = (
    <PageHeader
      label="Allocazione"
      title={PLAN_PATH_TITLE}
      actions={
        <Button asChild variant="outline" className="hidden h-8 px-2.5 text-xs desktop:inline-flex">
          <Link href={ACCUMULO_HREF}>{PLAN_PATH_BACK_LINK}</Link>
        </Button>
      }
    />
  );
  const page = (body: React.ReactNode) => (
    <PageContainer>
      {header}
      {body}
    </PageContainer>
  );

  if (!user || !ownerId || (loading && !loadFailed) || (!loadFailed && !plansFresh)) return page(<TileGridSkeleton cells={SKELETON_CELLS} />);
  if (isDemo) return page(<EmptyState message={PLAN_PATH_DEMO} />);
  if (loadFailed || !context) {
    return page(
      <ErrorNotice
        className="max-w-[920px]"
        onRetry={() => {
          for (const key of [queryKeys.assets.all(ownerId), queryKeys.settings.all(ownerId), queryKeys.goals.all(ownerId), queryKeys.accumulationPlans.all(ownerId), queryKeys.modelPortfolio.byOwner(ownerId)]) {
            void queryClient.invalidateQueries({ queryKey: key });
          }
        }}
        notice={describeReadFailure({
          consequence: 'Strumenti, impostazioni, obiettivi, piani o portafoglio modello non sono stati letti: senza di essi il percorso non può partire.',
          untouched: 'Nulla è stato scritto.',
          canRetry: true,
        })}
      />
    );
  }
  if (!hasTargets) {
    return page(
      <EmptyState
        message={PLAN_PATH_NO_TARGETS}
        action={
          <Button asChild variant="outline" className={PATH_BUTTON_CLASS}>
            <Link href="/dashboard/settings?tab=allocazione">Apri Impostazioni</Link>
          </Button>
        }
      />
    );
  }
  if (activePlan) {
    return page(
      <section className={CARD_CLASS} aria-label="Piano attivo">
        <p className="text-[15px] leading-[1.55] text-foreground">{findFirstIntactInstallment(activePlan) === undefined ? ACCUMULO_PLAN_NOTHING_TO_REVISE : PLAN_PATH_ACTIVE}</p>
        <div className="mt-4">
          <Button asChild className={PATH_BUTTON_CLASS}>
            <Link href={ACCUMULO_HREF}>{ACCUMULO_OPEN_LINK}</Link>
          </Button>
        </div>
      </section>
    );
  }

  return page(
    <PianoWizard
      ownerId={ownerId}
      context={context}
      basis={basis}
      onMonthChanged={setTodayMonth}
      onCreated={() => setCreated(true)}
      onAssetsChanged={() => void queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(ownerId) })}
    />
  );
}
