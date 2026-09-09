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
 * No lazy loading needed - components load quickly.
 *
 * The container is `wide` (1920px, the tile grid's root): every tab is propagated to «Verdict
 * over Tiles» — Calcolatore, Coast FIRE, What If, Monte Carlo and, since 2026-08-26, Obiettivi.
 */

'use client';

import { useState } from 'react';
import { Flame, Dices, Mountain, Target, Lightbulb } from 'lucide-react';
import { TabsContent } from '@/components/ui/tabs';
import { FireCalculatorTab } from '@/components/fire-simulations/FireCalculatorTab';
import { CoastFireTab } from '@/components/fire-simulations/CoastFireTab';
import { WhatIfAnalysisTab } from '@/components/fire-simulations/WhatIfAnalysisTab';
import { MonteCarloTab } from '@/components/fire-simulations/MonteCarloTab';
import { GoalBasedInvestingTab } from '@/components/fire-simulations/GoalBasedInvestingTab';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { PageTabs } from '@/components/layout/PageTabs';
import type { TabDef } from '@/components/layout/PageTabs';

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

  return (
    <PageContainer>
      <PageHeader
        label="Pianificazione"
        title="FIRE e Simulazioni"
        description="Libertà finanziaria e sostenibilità del piano"
      />

      <PageTabs
        tabs={TABS}
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as TabValue)}
        layoutId="fire-tab-pill"
        ariaLabel="Sezioni di FIRE e Simulazioni"
      >
        {TABS.map((tab) => (
          <TabsContent key={tab.value} value={tab.value} className="mt-0">
            {tab.value === 'fire'       && <FireCalculatorTab />}
            {tab.value === 'coast'      && <CoastFireTab />}
            {tab.value === 'whatif'     && <WhatIfAnalysisTab />}
            {tab.value === 'montecarlo' && <MonteCarloTab />}
            {tab.value === 'goals'      && <GoalBasedInvestingTab />}
          </TabsContent>
        ))}
      </PageTabs>
    </PageContainer>
  );
}
