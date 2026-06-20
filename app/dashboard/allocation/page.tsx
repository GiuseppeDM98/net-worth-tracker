/**
 * ALLOCATION PAGE
 *
 * Answers one question, in order: "How much do I have, am I in line with my targets,
 * and what should I do?" — then lets the user drill into the detail and look through to
 * real exposure. Two IA zones: a DECISION zone (hero → band → action) and a quieter
 * DETAIL zone (composition → exposure) under a labeled divider, so the action a user
 * actually takes never reads at the same weight as reference detail.
 *
 * Narrative (single layout, mobile-first; desktop only widens the hero into two columns):
 *   1. Hero    — total allocated wealth + composition shape (left) and the balance
 *                score gauge + band-dependent verdict (companion) — AllocationHero.
 *   2. Band    — the drift tolerance that defines "off target" (RebalanceBandControl).
 *   3. Action  — "Cosa faccio": Ribilancia (trade list) | Versa (no-sell contribution
 *                planner) behind one segmented switch (ActionPlanner).
 *   — Dettaglio —
 *   4. Breakdown — one card, inline accordion, asset class → sub-category → targets.
 *   5. Exposure  — true look-through holdings/sectors/issuers (ExposureSection).
 *
 * Targets come either from Settings or, when goal-driven allocation is enabled, are
 * derived from the user's goals. The rebalance BAND is session-only view state (default
 * ±2 p.p. = the server's own threshold) and re-classifies every COMPRA/VENDI/OK via
 * `applyRebalanceBand`; the hero balance score is band-INDEPENDENT (absolute distance from
 * target). The page has no mutations, so there is no demo-mode gating.
 */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import { getAllAssets } from '@/lib/services/assetService';
import {
  getSettings,
  compareAllocations,
  getDefaultTargets,
  buildTargetsFromGoalAllocation,
} from '@/lib/services/assetAllocationService';
import { getGoalData, deriveTargetAllocationFromGoals } from '@/lib/services/goalService';
import { AllocationResult, AssetAllocationTarget } from '@/types/assets';
import { Button } from '@/components/ui/button';
import { Settings, Sparkles, LayoutGrid } from 'lucide-react';
import { toast } from 'sonner';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { AllocationPageSkeleton } from '@/components/allocation/AllocationPageSkeleton';
import { AllocationHero } from '@/components/allocation/AllocationHero';
import { RebalanceBandControl } from '@/components/allocation/RebalanceBandControl';
import { ActionPlanner } from '@/components/allocation/ActionPlanner';
import { AllocationBreakdown } from '@/components/allocation/AllocationBreakdown';
import {
  applyRebalanceBand,
  summarizeBalance,
  computeBalanceScore,
  buildRebalancePlan,
  DEFAULT_REBALANCE_BAND,
  type RebalanceBand,
} from '@/lib/utils/allocationUtils';
import dynamic from 'next/dynamic';

const ExposureSection = dynamic(
  () => import('@/components/allocation/ExposureSection').then((m) => ({ default: m.ExposureSection })),
  { ssr: false }
);

export default function AllocationPage() {
  const { user } = useAuth();
  const [targets, setTargets] = useState<AssetAllocationTarget | null>(null);
  const [allocation, setAllocation] = useState<AllocationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [usingGoalTargets, setUsingGoalTargets] = useState(false);

  // Drift tolerance that decides COMPRA/VENDI/OK. Session-only; default matches the
  // server's ±2 p.p. so the first render is identical to the persisted classification.
  const [band, setBand] = useState<RebalanceBand>(DEFAULT_REBALANCE_BAND);

  const loadData = useCallback(async () => {
    if (!user) return;

    // `loading` initializes to true; no synchronous setState here (it would trigger a
    // cascading-render lint error). Every setState below runs after the first await.
    try {
      const [assetsData, settings, goalData] = await Promise.all([
        getAllAssets(user.uid),
        getSettings(user.uid),
        getGoalData(user.uid),
      ]);

      // Derive targets from goals when goal-based investing is enabled; otherwise use
      // the manual Settings targets (or sensible defaults for a fresh account).
      let effectiveTargets: AssetAllocationTarget;
      let fromGoals = false;

      if (
        settings?.goalBasedInvestingEnabled &&
        settings?.goalDrivenAllocationEnabled &&
        goalData &&
        goalData.goals.length > 0
      ) {
        const derived = deriveTargetAllocationFromGoals(
          goalData.goals,
          goalData.assignments,
          assetsData
        );
        if (derived) {
          // Preserve sub-category structure from Settings while overriding asset class targets.
          effectiveTargets = buildTargetsFromGoalAllocation(derived, settings?.targets);
          fromGoals = true;
        } else {
          effectiveTargets = settings?.targets || getDefaultTargets();
        }
      } else {
        effectiveTargets = settings?.targets || getDefaultTargets();
      }

      setTargets(effectiveTargets);
      setUsingGoalTargets(fromGoals);
      setAllocation(compareAllocations(assetsData, effectiveTargets));
    } catch (error) {
      console.error('Error loading allocation data:', error);
      toast.error('Errore nel caricamento dei dati');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Re-classify the whole result under the active band, then derive the verdict and plan
  // from the banded copy so hero, plan, and breakdown chips always agree.
  const bandedAllocation = useMemo(
    () => (allocation ? applyRebalanceBand(allocation, band) : null),
    [allocation, band]
  );
  const balanceSummary = useMemo(
    () => (bandedAllocation ? summarizeBalance(bandedAllocation.byAssetClass) : null),
    [bandedAllocation]
  );
  // Band-independent "how close to target" score for the hero gauge. Derived from raw
  // drift, so widening/tightening the band leaves it unchanged (only the verdict reacts).
  const balanceScore = useMemo(
    () => (bandedAllocation ? computeBalanceScore(bandedAllocation.byAssetClass) : null),
    [bandedAllocation]
  );
  const rebalancePlan = useMemo(
    () => (bandedAllocation ? buildRebalancePlan(bandedAllocation.byAssetClass) : []),
    [bandedAllocation]
  );

  if (loading) return <AllocationPageSkeleton />;

  if (!allocation || !bandedAllocation || !balanceSummary || !balanceScore) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-muted-foreground">Nessun dato disponibile</div>
      </div>
    );
  }

  const assetClassCount = Object.keys(bandedAllocation.byAssetClass).length;
  const hasAssets = assetClassCount > 0;

  return (
    <PageContainer className="space-y-4 sm:space-y-6">
      <PageHeader
        label="Analisi composizione"
        title="Allocazione Asset"
        description="Confronta l'allocazione corrente con i tuoi obiettivi"
        actions={
          !usingGoalTargets ? (
            <Link href="/dashboard/settings" className="w-full shrink-0 sm:w-auto">
              <Button variant="outline" size="sm" className="w-full sm:w-auto">
                <Settings className="mr-2 h-4 w-4" />
                Modifica Target
              </Button>
            </Link>
          ) : undefined
        }
      />

      {/* Goal-derived targets indicator — neutral, token-safe (no hardcoded green). */}
      {usingGoalTargets && (
        <div className="flex items-start gap-2.5 rounded-xl border border-border bg-muted/40 p-3 sm:p-4">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-foreground">Target dagli obiettivi</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Calcolato dal gap ancora da colmare per ogni obiettivo, pesato per priorità — Alta 3× ·
              Media 2× · Bassa 1×. Gli obiettivi già raggiunti non influenzano il calcolo.
            </p>
          </div>
        </div>
      )}

      {!hasAssets ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <LayoutGrid className="h-8 w-8 text-muted-foreground/40" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Nessun asset presente.</p>
          <Link
            href="/dashboard/assets"
            className="text-xs text-muted-foreground/70 underline underline-offset-2"
          >
            Aggiungi asset per vedere l&apos;allocazione
          </Link>
        </div>
      ) : (
        <>
          {/* DECISION zone: how much / how close to target / what to do. */}
          <AllocationHero
            totalValue={bandedAllocation.totalValue}
            byAssetClass={bandedAllocation.byAssetClass}
            summary={balanceSummary}
            balance={balanceScore}
            assetClassCount={assetClassCount}
          />

          <RebalanceBandControl band={band} onChange={setBand} />

          <ActionPlanner
            moves={rebalancePlan}
            byAssetClass={bandedAllocation.byAssetClass}
            bySubCategory={bandedAllocation.bySubCategory}
          />

          {/* DETAIL zone: quieter reference under a labeled divider (A5 rhythm). */}
          <div className="space-y-4 pt-2 sm:space-y-6">
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                Dettaglio
              </span>
              <div className="h-px flex-1 bg-border/60" aria-hidden="true" />
            </div>

            <AllocationBreakdown allocation={bandedAllocation} targets={targets} />

            {user && <ExposureSection userId={user.uid} />}
          </div>
        </>
      )}
    </PageContainer>
  );
}
