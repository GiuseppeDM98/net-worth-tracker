/**
 * FIRE SIMULATIONS PAGE
 *
 * Simple tab wrapper for FIRE (Financial Independence, Retire Early) tools.
 *
 * TAB STRUCTURE:
 * - FIRE Calculator: Calculate retirement readiness
 * - Coast FIRE: Measure whether current FIRE patrimonio can compound to the full target
 * - Monte Carlo: Probabilistic portfolio simulations
 * - Obiettivi: Goal-based investing (mental allocation of portfolio to financial goals)
 *
 * Mobile/tablet pattern (< 1440px): Radix Select dropdown replaces TabsList.
 * Desktop (≥ 1440px): standard TabsList with icons.
 * No lazy loading needed - components load quickly.
 */

'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Flame, Dices, Mountain, Target } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FireCalculatorTab } from '@/components/fire-simulations/FireCalculatorTab';
import { CoastFireTab } from '@/components/fire-simulations/CoastFireTab';
import { MonteCarloTab } from '@/components/fire-simulations/MonteCarloTab';
import { GoalBasedInvestingTab } from '@/components/fire-simulations/GoalBasedInvestingTab';
import { cn } from '@/lib/utils';

type TabValue = 'fire' | 'coast' | 'montecarlo' | 'goals';

const TABS: { value: TabValue; label: string; shortLabel: string; icon: React.ElementType }[] = [
  { value: 'fire',       label: 'Calcolatore FIRE', shortLabel: 'FIRE',     icon: Flame    },
  { value: 'coast',      label: 'Coast FIRE',       shortLabel: 'Coast',    icon: Mountain },
  { value: 'montecarlo', label: 'Monte Carlo',      shortLabel: 'M. Carlo', icon: Dices    },
  { value: 'goals',      label: 'Obiettivi',        shortLabel: 'Obiett.',  icon: Target   },
];

export default function FireSimulationsPage() {
  const [activeTab, setActiveTab] = useState<TabValue>('fire');

  return (
    <div className="space-y-6 max-desktop:portrait:pb-20">
      {/* Header */}
      <div>
        <h1 className="flex items-center gap-2 text-2xl sm:text-3xl font-bold text-foreground">
          <Flame className="h-7 w-7 sm:h-8 sm:w-8 text-orange-500" />
          FIRE e Simulazioni
        </h1>
        <p className="mt-2 text-sm sm:text-base text-muted-foreground">
          Pianifica la tua libertà finanziaria e valuta la sostenibilità del tuo piano di pensionamento
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)} className="w-full">
        {/* Mobile/tablet: segmented pill */}
        <div className="desktop:hidden mb-4">
          <div role="tablist" className="inline-flex w-full rounded-lg border bg-muted p-1 gap-0.5">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.value;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.value}
                  role="tab"
                  type="button"
                  aria-selected={isActive}
                  onClick={() => setActiveTab(tab.value)}
                  className={cn(
                    'relative flex flex-1 items-center justify-center gap-1 rounded-md px-1.5 py-2 text-xs font-medium transition-colors',
                    isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {isActive && (
                    <motion.div
                      layoutId="fire-tab-pill"
                      className="absolute inset-0 rounded-md bg-background shadow-sm"
                      transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                    />
                  )}
                  <Icon className="relative z-10 h-3.5 w-3.5 shrink-0" />
                  <span className="relative z-10">{tab.shortLabel}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Desktop: standard TabsList */}
        <div className="hidden desktop:block mb-4">
          <TabsList className="grid w-full max-w-3xl grid-cols-4">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger key={tab.value} value={tab.value} className="flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        {TABS.map((tab) => (
          <TabsContent key={tab.value} value={tab.value} className="mt-0">
            {tab.value === 'fire'       && <FireCalculatorTab />}
            {tab.value === 'coast'      && <CoastFireTab />}
            {tab.value === 'montecarlo' && <MonteCarloTab />}
            {tab.value === 'goals'      && <GoalBasedInvestingTab />}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
