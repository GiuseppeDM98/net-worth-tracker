/**
 * CASHFLOW PAGE
 *
 * Tab orchestration page for cashflow analysis with lazy loading.
 *
 * LAZY LOADING STRATEGY:
 * - Tabs mounted only when first activated (mountedTabs state tracking)
 * - Once mounted, tabs stay mounted (no unmounting on tab switch)
 * - Reduces initial page load time, improves perceived performance
 *
 * TAB STRUCTURE:
 * - Tracking: Current year's transactions and charts
 * - Current Year: Current year analysis
 * - Total History: All-time cashflow analysis
 * - Dividends: Dividend tracking
 *
 * WHY LAZY LOADING:
 * Each tab makes separate API calls and renders heavy charts.
 * Loading all tabs at once would cause ~3x longer initial load time.
 */

'use client';

import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Wallet, Receipt, TrendingUp, BarChart3, Coins, Target } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ExpenseTrackingTab } from '@/components/cashflow/ExpenseTrackingTab';
import { CurrentYearTab } from '@/components/cashflow/CurrentYearTab';
import { TotalHistoryTab } from '@/components/cashflow/TotalHistoryTab';
import { DividendTrackingTab } from '@/components/dividends/DividendTrackingTab';
import { BudgetTab } from '@/components/cashflow/BudgetTab';
import { useAuth } from '@/contexts/AuthContext';
import { Dividend } from '@/types/dividend';
import { Asset } from '@/types/assets';
import { useExpenses, useExpenseCategories } from '@/lib/hooks/useExpenses';
import { queryKeys } from '@/lib/query/queryKeys';
import { getAllAssets } from '@/lib/services/assetService';
import { getSettings } from '@/lib/services/assetAllocationService';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import { toast } from 'sonner';

export default function CashflowPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [mountedTabs, setMountedTabs] = useState<Set<string>>(new Set(['tracking']));
  const [activeTab, setActiveTab] = useState<string>('tracking');

  // React Query hooks for expenses and categories
  const { data: allExpenses = [], isLoading: expensesLoading } = useExpenses(user?.uid);
  const { data: categories = [], isLoading: categoriesLoading } = useExpenseCategories(user?.uid);

  const [cashflowHistoryStartYear, setCashflowHistoryStartYear] = useState<number>(2025);

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
        authenticatedFetch(`/api/dividends?userId=${user.uid}`)
          .then(r => r.json())
          .then(d => d.dividends || []),
        getAllAssets(user.uid),
      ]);

      setDividends(dividendsData);
      // Include equity and bonds: bonds have coupons tracked as dividend entries
      setAssets(assetsData.filter(a => a.assetClass === 'equity' || a.assetClass === 'bonds'));
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

  // Load cashflow history start year from user settings (one-time read per session)
  useEffect(() => {
    if (!user) return;
    getSettings(user.uid)
      .then(s => {
        if (s?.cashflowHistoryStartYear !== undefined) {
          setCashflowHistoryStartYear(s.cashflowHistoryStartYear);
        }
      })
      .catch(() => {});
  }, [user]);

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
    <div className="space-y-6 p-4 desktop:p-8 max-desktop:portrait:pb-20">
      {/* Header */}
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold text-gray-900 dark:text-gray-100">
          <Wallet className="h-8 w-8 text-blue-500" />
          Cashflow
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Traccia e analizza le tue entrate e uscite nel tempo
        </p>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="tracking" value={activeTab} onValueChange={handleTabChange} className="w-full">
        {/* Mobile tab selector — Radix Select replaces cramped 5-tab TabsList on small screens */}
        <div className="desktop:hidden mb-2">
          <Select value={activeTab} onValueChange={handleTabChange}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tracking">Tracciamento</SelectItem>
              <SelectItem value="dividends">Dividendi &amp; Cedole</SelectItem>
              <SelectItem value="current-year">Anno Corrente</SelectItem>
              <SelectItem value="total-history">Storico Totale</SelectItem>
              <SelectItem value="budget">Budget</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Desktop TabsList — hidden on mobile/tablet */}
        <TabsList className="hidden desktop:grid w-full max-w-4xl grid-cols-5">
          <TabsTrigger value="tracking" className="flex items-center gap-2">
            <Receipt className="h-4 w-4" />
            Tracciamento
          </TabsTrigger>
          <TabsTrigger value="dividends" className="flex items-center gap-2">
            <Coins className="h-4 w-4" />
            Dividendi &amp; Cedole
          </TabsTrigger>
          <TabsTrigger value="current-year" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Anno Corrente
          </TabsTrigger>
          <TabsTrigger value="total-history" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Storico Totale
          </TabsTrigger>
          <TabsTrigger value="budget" className="flex items-center gap-2">
            <Target className="h-4 w-4" />
            Budget
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
              historyStartYear={cashflowHistoryStartYear}
            />
          </TabsContent>
        )}

        {mountedTabs.has('budget') && (
          <TabsContent value="budget" className="mt-6">
            <BudgetTab
              allExpenses={allExpenses}
              categories={categories}
              loading={loading}
              historyStartYear={cashflowHistoryStartYear}
              userId={user?.uid ?? ''}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
