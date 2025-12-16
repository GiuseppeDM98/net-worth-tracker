'use client';

import { Wallet, Receipt, TrendingUp, BarChart3, Coins } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ExpenseTrackingTab } from '@/components/cashflow/ExpenseTrackingTab';
import { CurrentYearTab } from '@/components/cashflow/CurrentYearTab';
import { TotalHistoryTab } from '@/components/cashflow/TotalHistoryTab';
import { DividendTrackingTab } from '@/components/dividends/DividendTrackingTab';

export default function CashflowPage() {
  return (
    <div className="space-y-6 p-8">
      {/* Header */}
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold text-gray-900">
          <Wallet className="h-8 w-8 text-blue-500" />
          Cashflow
        </h1>
        <p className="mt-2 text-gray-600">
          Traccia e analizza le tue entrate e uscite nel tempo
        </p>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="tracking" className="w-full">
        <TabsList className="grid w-full max-w-4xl grid-cols-4">
          <TabsTrigger value="tracking" className="flex items-center gap-2">
            <Receipt className="h-4 w-4" />
            Tracciamento
          </TabsTrigger>
          <TabsTrigger value="dividends" className="flex items-center gap-2">
            <Coins className="h-4 w-4" />
            Dividendi
          </TabsTrigger>
          <TabsTrigger value="current-year" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Anno Corrente
          </TabsTrigger>
          <TabsTrigger value="total-history" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Storico Totale
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tracking" className="mt-6">
          <ExpenseTrackingTab />
        </TabsContent>

        <TabsContent value="dividends" className="mt-6">
          <DividendTrackingTab />
        </TabsContent>

        <TabsContent value="current-year" className="mt-6">
          <CurrentYearTab />
        </TabsContent>

        <TabsContent value="total-history" className="mt-6">
          <TotalHistoryTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
