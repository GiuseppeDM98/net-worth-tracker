/**
 * FIRE SIMULATIONS PAGE
 *
 * Simple tab wrapper for FIRE (Financial Independence, Retire Early) tools.
 *
 * TAB STRUCTURE:
 * - FIRE Calculator: Calculate retirement readiness
 * - Monte Carlo: Probabilistic portfolio simulations
 * - Obiettivi: Goal-based investing (mental allocation of portfolio to financial goals)
 *
 * No lazy loading needed - components load quickly.
 */

'use client';

import { Flame, Dices, Target } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FireCalculatorTab } from '@/components/fire-simulations/FireCalculatorTab';
import { MonteCarloTab } from '@/components/fire-simulations/MonteCarloTab';
import { GoalBasedInvestingTab } from '@/components/fire-simulations/GoalBasedInvestingTab';

export default function FireSimulationsPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold text-gray-900">
          <Flame className="h-8 w-8 text-orange-500" />
          FIRE e Simulazioni
        </h1>
        <p className="mt-2 text-gray-600">
          Pianifica la tua libertà finanziaria e valuta la sostenibilità del tuo piano di pensionamento
        </p>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="fire" className="w-full">
        <TabsList className="grid w-full max-w-lg grid-cols-3">
          <TabsTrigger value="fire" className="flex items-center gap-2">
            <Flame className="h-4 w-4" />
            FIRE Calculator
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

        <TabsContent value="fire" className="mt-6">
          <FireCalculatorTab />
        </TabsContent>

        <TabsContent value="montecarlo" className="mt-6">
          <MonteCarloTab />
        </TabsContent>

        <TabsContent value="goals" className="mt-6">
          <GoalBasedInvestingTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
