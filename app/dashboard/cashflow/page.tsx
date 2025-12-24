'use client';

import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Wallet, Receipt, TrendingUp, BarChart3, Coins } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ExpenseTrackingTab } from '@/components/cashflow/ExpenseTrackingTab';
import { CurrentYearTab } from '@/components/cashflow/CurrentYearTab';
import { TotalHistoryTab } from '@/components/cashflow/TotalHistoryTab';
import { DividendTrackingTab } from '@/components/dividends/DividendTrackingTab';
import { useAuth } from '@/contexts/AuthContext';
import { Dividend } from '@/types/dividend';
import { Asset } from '@/types/assets';
import { useExpenses, useExpenseCategories } from '@/lib/hooks/useExpenses';
import { queryKeys } from '@/lib/query/queryKeys';
import { getAllAssets } from '@/lib/services/assetService';
import { toast } from 'sonner';

export default function CashflowPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [mountedTabs, setMountedTabs] = useState<Set<string>>(new Set(['tracking']));
  const [activeTab, setActiveTab] = useState<string>('tracking');

  // React Query hooks for expenses and categories
  const { data: allExpenses = [], isLoading: expensesLoading } = useExpenses(user?.uid);
  const { data: categories = [], isLoading: categoriesLoading } = useExpenseCategories(user?.uid);

  // Manual state for other tabs data (dividends, assets)
  const [dividends, setDividends] = useState<Dividend[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [otherDataLoading, setOtherDataLoading] = useState(false);
  const [otherDataLoaded, setOtherDataLoaded] = useState(false);

  const loading = expensesLoading || categoriesLoading || otherDataLoading;

  // Load dividends and assets only when their tabs are mounted
  const loadOtherData = async () => {
    if (!user || otherDataLoaded) return;

    try {
      setOtherDataLoading(true);

      // Fetch only dividends and assets (expenses/categories handled by React Query)
      const [dividendsData, assetsData] = await Promise.all([
        fetch(`/api/dividends?userId=${user.uid}`)
          .then(r => r.json())
          .then(d => d.dividends || []),
        getAllAssets(user.uid),
      ]);

      setDividends(dividendsData);
      setAssets(assetsData.filter(a => a.assetClass === 'equity')); // Only equity for dividends
      setOtherDataLoaded(true);
    } catch (error) {
      console.error('Error loading dividend/asset data:', error);
      toast.error('Errore nel caricamento dei dati');
    } finally {
      setOtherDataLoading(false);
    }
  };

  useEffect(() => {
    const needsOtherData = mountedTabs.has('dividends');
    if (user && needsOtherData && !otherDataLoaded) {
      loadOtherData();
    }
  }, [user, mountedTabs, otherDataLoaded]);

  const handleRefresh = async () => {
    // Invalidate React Query caches for expenses and categories
    await queryClient.invalidateQueries({
      queryKey: queryKeys.expenses.all(user?.uid || ''),
    });
    await queryClient.invalidateQueries({
      queryKey: queryKeys.expenses.categories(user?.uid || ''),
    });

    // Force re-fetch of other data (dividends, assets)
    setOtherDataLoaded(false);
    await loadOtherData();
  };

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setMountedTabs(prev => new Set(prev).add(value));
  };

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
      <Tabs defaultValue="tracking" value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid w-full max-w-4xl grid-cols-4">
          <TabsTrigger value="tracking" className="flex items-center gap-2">
            <Receipt className="h-4 w-4" />
            <span className="hidden sm:inline">Tracciamento</span>
          </TabsTrigger>
          <TabsTrigger value="dividends" className="flex items-center gap-2">
            <Coins className="h-4 w-4" />
            <span className="hidden sm:inline">Dividendi</span>
          </TabsTrigger>
          <TabsTrigger value="current-year" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            <span className="hidden sm:inline">Anno Corrente</span>
          </TabsTrigger>
          <TabsTrigger value="total-history" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Storico Totale</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tracking" className="mt-6">
          <ExpenseTrackingTab
            allExpenses={allExpenses}
            categories={categories}
            loading={loading}
            onRefresh={handleRefresh}
          />
        </TabsContent>

        {mountedTabs.has('dividends') && (
          <TabsContent value="dividends" className="mt-6">
            <DividendTrackingTab
              dividends={dividends}
              assets={assets}
              loading={loading}
              onRefresh={handleRefresh}
            />
          </TabsContent>
        )}

        {mountedTabs.has('current-year') && (
          <TabsContent value="current-year" className="mt-6">
            <CurrentYearTab
              allExpenses={allExpenses}
              loading={loading}
              onRefresh={handleRefresh}
            />
          </TabsContent>
        )}

        {mountedTabs.has('total-history') && (
          <TabsContent value="total-history" className="mt-6">
            <TotalHistoryTab
              allExpenses={allExpenses}
              loading={loading}
              onRefresh={handleRefresh}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
