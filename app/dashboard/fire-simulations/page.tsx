/**
 * FIRE SIMULATIONS PAGE
 *
 * Simple tab wrapper for FIRE (Financial Independence, Retire Early) tools.
 *
 * TAB STRUCTURE:
 * - FIRE Calculator: Calculate retirement readiness
 * - Coast FIRE: Measure whether current FIRE patrimonio can compound to the full target
 * - What If: Simulate life events and their impact on FIRE and Coast FIRE
 * - Monte Carlo: Probabilistic portfolio simulations
 * - Obiettivi: Goal-based investing (mental allocation of portfolio to financial goals)
 *
 * Mobile/tablet pattern (< 1440px): PageTabBar renders a centered segmented pill (icon-only
 * inactive tabs). Desktop (≥ 1440px): standard TabsList with icons.
 *
 * Only the Calcolatore — the tab the page opens on — is in the page's initial JavaScript; the
 * other four are a chunk each, fetched once the page is idle or when their tab is opened, whichever
 * comes first (2026-09-30). Only the active panel mounts either way (Radix `TabsContent`),
 * so what the lazy tabs save is their CODE on the page's critical path: before, all five modules
 * arrived with the page. If a tab is opened before its chunk, the panel shows that tab's own
 * `TileGridSkeleton` (`tabSkeletons.ts`), the same one it shows while its data loads, so the two
 * waits read as one.
 *
 * The container is `wide` (1920px, the tile grid's root): every tab is propagated to «Verdict
 * over Tiles» — Calcolatore, Coast FIRE, What If, Monte Carlo and, since 2026-08-26, Obiettivi.
 */

'use client';

import { useMemo, useState } from 'react';
import { Flame, Dices, Mountain, Target, Lightbulb } from 'lucide-react';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useAssets } from '@/lib/hooks/useAssets';
import { useExpensesInRange } from '@/lib/hooks/useExpenses';
import { fireWindows } from '@/lib/utils/expenseWindows';
import { useFreshness } from '@/lib/hooks/useFreshness';
import { useSettings } from '@/lib/hooks/useSettings';
import { useSnapshots } from '@/lib/hooks/useSnapshots';
import { TabsContent } from '@/components/ui/tabs';
import { FireCalculatorTab } from '@/components/fire-simulations/FireCalculatorTab';
import {
  COAST_TAB_SKELETON_CELLS,
  GOALS_TAB_SKELETON_CELLS,
  MONTE_CARLO_TAB_SKELETON_CELLS,
  WHAT_IF_TAB_SKELETON_CELLS,
} from '@/components/fire-simulations/tabSkeletons';
import { TileGridSkeleton } from '@/components/ui/tile-grid-skeleton';
import { lazyComponent, usePreloadWhenIdle } from '@/components/ui/lazy-component';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { PageTabs } from '@/components/layout/PageTabs';
import { pageTabPanelId } from '@/components/layout/PageTabBar';
import type { TabDef } from '@/components/layout/PageTabs';

// The four tabs the page does not open on, one chunk each (see the header): `lazyComponent` at module
// level (AGENTS.md § Dynamic Imports and Module Hygiene), preloaded once the page is idle, so a tab
// opened later is drawn at once — no Suspense fallback held on screen.
const CoastFireTab = lazyComponent(() => import('@/components/fire-simulations/CoastFireTab').then((m) => m.CoastFireTab));
const WhatIfAnalysisTab = lazyComponent(() => import('@/components/fire-simulations/WhatIfAnalysisTab').then((m) => m.WhatIfAnalysisTab));
const MonteCarloTab = lazyComponent(() => import('@/components/fire-simulations/MonteCarloTab').then((m) => m.MonteCarloTab));
const GoalBasedInvestingTab = lazyComponent(() => import('@/components/fire-simulations/GoalBasedInvestingTab').then((m) => m.GoalBasedInvestingTab));
const LAZY_TABS = [CoastFireTab, WhatIfAnalysisTab, MonteCarloTab, GoalBasedInvestingTab];

type TabValue = 'fire' | 'coast' | 'whatif' | 'montecarlo' | 'goals';

const TABS: TabDef[] = [
  { value: 'fire',       label: 'Calcolatore FIRE', icon: Flame    },
  { value: 'coast',      label: 'Coast FIRE',       icon: Mountain },
  { value: 'whatif',     label: 'What If',          icon: Lightbulb },
  { value: 'montecarlo', label: 'Monte Carlo',      icon: Dices    },
  { value: 'goals',      label: 'Obiettivi',        icon: Target   },
];

export default function FireSimulationsPage() {
  const [activeTab, setActiveTab] = useState<TabValue>('fire');
  const { ownerId } = useActiveAccount();
  // The header's «Aggiornato alle…» over the four keys the Calcolatore — the tab the
  // page opens on — paints from; the same cache entries the tabs read, no second read. The
  // expenses are the page's RECENT window (last year and this one: what every tab's number stands
  // on); the older rows behind the Calcolatore's «Dettaglio» and the goals document stay out,
  // each read only by the surface that shows it.
  const recentExpensesWindow = useMemo(() => fireWindows(new Date(), null).recent, []);
  const calculatorReads = [useSettings(ownerId), useAssets(ownerId), useExpensesInRange(ownerId, recentExpensesWindow), useSnapshots(ownerId)];
  const freshness = useFreshness(calculatorReads);
  // The lazy tabs are fetched once the Calcolatore's reads are in and the page is idle: started
  // earlier, the «idle» browser is only waiting for Firestore and the download competes with the
  // first figures.
  usePreloadWhenIdle(LAZY_TABS, calculatorReads.every((query) => query.data !== undefined));

  return (
    <PageContainer>
      <PageHeader
        label="Pianificazione"
        title="FIRE e Simulazioni"
        description="Libertà finanziaria e sostenibilità del piano"
        freshness={freshness}
      />

      <PageTabs
        tabs={TABS}
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as TabValue)}
        layoutId="fire-tab-pill"
        ariaLabel="Sezioni di FIRE e Simulazioni"
      >
        {TABS.map((tab) => (
          <TabsContent
            key={tab.value}
            value={tab.value}
            id={pageTabPanelId('fire-tab-pill', tab.value)}
            aria-label={tab.label}
            // Radix names a Content after ITS trigger; these triggers are plain buttons, so the
            // generated reference points at nothing. The name is the label above.
            aria-labelledby={undefined}
            className="mt-0"
          >
            {tab.value === 'fire'       && <FireCalculatorTab />}
            {tab.value === 'coast'      && <CoastFireTab fallback={<TileGridSkeleton cells={COAST_TAB_SKELETON_CELLS} />} />}
            {tab.value === 'whatif'     && <WhatIfAnalysisTab fallback={<TileGridSkeleton cells={WHAT_IF_TAB_SKELETON_CELLS} />} />}
            {tab.value === 'montecarlo' && <MonteCarloTab fallback={<TileGridSkeleton cells={MONTE_CARLO_TAB_SKELETON_CELLS} />} />}
            {tab.value === 'goals'      && <GoalBasedInvestingTab fallback={<TileGridSkeleton cells={GOALS_TAB_SKELETON_CELLS} />} />}
          </TabsContent>
        ))}
      </PageTabs>
    </PageContainer>
  );
}
