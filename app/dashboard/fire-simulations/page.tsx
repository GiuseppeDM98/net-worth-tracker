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
        title={
          <span className="flex items-center gap-2">
            <Flame className="h-7 w-7 sm:h-8 sm:w-8 text-orange-500" aria-hidden="true" />
            FIRE e Simulazioni
          </span>
        }
        description="Pianifica la tua libertà finanziaria e valuta la sostenibilità del tuo piano di pensionamento"
        separator={false}
      />

      <PageTabs
        tabs={TABS}
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as TabValue)}
        layoutId="fire-tab-pill"
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
