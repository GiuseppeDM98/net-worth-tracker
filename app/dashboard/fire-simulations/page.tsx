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
import { Flame, Dices, Mountain, Target } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FireCalculatorTab } from '@/components/fire-simulations/FireCalculatorTab';
import { CoastFireTab } from '@/components/fire-simulations/CoastFireTab';
import { MonteCarloTab } from '@/components/fire-simulations/MonteCarloTab';
import { GoalBasedInvestingTab } from '@/components/fire-simulations/GoalBasedInvestingTab';

type TabValue = 'fire' | 'coast' | 'montecarlo' | 'goals';

const TAB_LABELS: Record<TabValue, string> = {
  fire: 'Calcolatore FIRE',
  coast: 'Coast FIRE',
  montecarlo: 'Monte Carlo',
  goals: 'Obiettivi',
};

export default function FireSimulationsPage() {
  const [activeTab, setActiveTab] = useState<TabValue>('fire');

  return (
    <div className="space-y-6 max-desktop:portrait:pb-20">
      {/* Header */}
      <div>
        <h1 className="flex items-center gap-2 text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
          <Flame className="h-7 w-7 sm:h-8 sm:w-8 text-orange-500" />
          FIRE e Simulazioni
        </h1>
        <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
          Pianifica la tua libertà finanziaria e valuta la sostenibilità del tuo piano di pensionamento
        </p>
      </div>

      {/* Tabs — Select on mobile/tablet, TabsList on desktop */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)} className="w-full">
        {/* Mobile/tablet: Radix Select dropdown */}
        <div className="desktop:hidden mb-4">
          <Select value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)}>
            <SelectTrigger className="w-full h-11 text-base">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fire">
                <span className="flex items-center gap-2">
                  <Flame className="h-4 w-4 text-orange-500" />
                  Calcolatore FIRE
                </span>
              </SelectItem>
              <SelectItem value="coast">
                <span className="flex items-center gap-2">
                  <Mountain className="h-4 w-4" />
                  Coast FIRE
                </span>
              </SelectItem>
              <SelectItem value="montecarlo">
                <span className="flex items-center gap-2">
                  <Dices className="h-4 w-4" />
                  Monte Carlo
                </span>
              </SelectItem>
              <SelectItem value="goals">
                <span className="flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  Obiettivi
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Desktop: standard TabsList */}
        <div className="hidden desktop:block mb-4">
          <TabsList className="grid w-full max-w-3xl grid-cols-4">
            <TabsTrigger value="fire" className="flex items-center gap-2">
              <Flame className="h-4 w-4" />
              Calcolatore FIRE
            </TabsTrigger>
            <TabsTrigger value="coast" className="flex items-center gap-2">
              <Mountain className="h-4 w-4" />
              Coast FIRE
            </TabsTrigger>
            <TabsTrigger value="montecarlo" className="flex items-center gap-2">
              <Dices className="h-4 w-4" />
              Monte Carlo
            </TabsTrigger>
            <TabsTrigger value="goals" className="flex items-center gap-2">
              <Target className="h-4 w-4" />
              Obiettivi
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="fire" className="mt-0">
          <FireCalculatorTab />
        </TabsContent>

        <TabsContent value="coast" className="mt-0">
          <CoastFireTab />
        </TabsContent>

        <TabsContent value="montecarlo" className="mt-0">
          <MonteCarloTab />
        </TabsContent>

        <TabsContent value="goals" className="mt-0">
          <GoalBasedInvestingTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
