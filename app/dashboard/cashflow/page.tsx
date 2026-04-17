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
import { motion } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { Wallet, Receipt, TrendingUp, BarChart3, Coins, Target, Layers } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ExpenseTrackingTab } from '@/components/cashflow/ExpenseTrackingTab';
import { CurrentYearTab } from '@/components/cashflow/CurrentYearTab';
import { TotalHistoryTab } from '@/components/cashflow/TotalHistoryTab';
import { DividendTrackingTab } from '@/components/dividends/DividendTrackingTab';
import { BudgetTab } from '@/components/cashflow/BudgetTab';
import { CostCentersTab } from '@/components/cashflow/CostCentersTab';
import { useAuth } from '@/contexts/AuthContext';
import { Dividend } from '@/types/dividend';
import { Asset } from '@/types/assets';
import { useExpenses, useExpenseCategories } from '@/lib/hooks/useExpenses';
import { queryKeys } from '@/lib/query/queryKeys';
import { getAllAssets } from '@/lib/services/assetService';
import { getSettings } from '@/lib/services/assetAllocationService';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import { tabPanelSwitch } from '@/lib/utils/motionVariants';
import { toast } from 'sonner';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function CashflowPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [mountedTabs, setMountedTabs] = useState<Set<string>>(new Set(['tracking']));
  const [activeTab, setActiveTab] = useState<string>('tracking');
  // null = settings not yet loaded (avoids the tab appearing late after an async flip from false → true)
  const [costCentersEnabled, setCostCentersEnabled] = useState<boolean | null>(null);

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
      console.error('Failed to load cashflow secondary data', {
        userId: user.uid,
        operation: 'loadOtherData',
        error: getErrorMessage(error),
      });
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
    const loadSettings = async () => {
      try {
        const settings = await getSettings(user.uid);

        if (settings?.cashflowHistoryStartYear !== undefined) {
          setCashflowHistoryStartYear(settings.cashflowHistoryStartYear);
        }
        setCostCentersEnabled(settings?.costCentersEnabled ?? false);
      } catch (error) {
        // Settings bootstrap is non-fatal for the page: keep safe defaults and log explicitly.
        console.error('Failed to load cashflow settings, using fallback defaults', {
          userId: user.uid,
          operation: 'loadCashflowSettings',
          fallbackHistoryStartYear: 2025,
          fallbackCostCentersEnabled: false,
          error: getErrorMessage(error),
        });
        setCostCentersEnabled(false);
      }
    };

    void loadSettings();
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
      <div className="border-b border-border pb-4">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Operatività</p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          <Wallet className="h-7 w-7 text-primary sm:h-8 sm:w-8" />
          Cashflow
        </h1>
        <p className="mt-2 text-muted-foreground">
          Traccia e analizza le tue entrate e uscite nel tempo
        </p>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="tracking" value={activeTab} onValueChange={handleTabChange} className="w-full">
        {/* Mobile tab selector — Radix Select replaces cramped 5-tab TabsList on small screens */}
        <div className="desktop:hidden mb-2">
          <Select value={activeTab} onValueChange={handleTabChange}>
            <SelectTrigger className="w-full h-12 text-base">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tracking">Tracciamento</SelectItem>
              <SelectItem value="dividends">Dividendi &amp; Cedole</SelectItem>
              <SelectItem value="current-year">Anno Corrente</SelectItem>
              <SelectItem value="total-history">Storico Totale</SelectItem>
              <SelectItem value="budget">Budget</SelectItem>
              {costCentersEnabled && (
                <SelectItem value="cost-centers">Centri di Costo</SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>

        {/* Desktop TabsList — hidden on mobile/tablet.
            Rendered only after costCentersEnabled is resolved so the full tab list
            mounts in one paint instead of reflowing from 5 to 6 columns. */}
        {costCentersEnabled === null ? (
          // Placeholder that matches the TabsList height while settings load
          <div className="hidden desktop:block h-10 w-full max-w-5xl rounded-md bg-muted animate-pulse" />
        ) : (
          <TabsList className={`hidden desktop:grid w-full max-w-5xl ${costCentersEnabled ? 'grid-cols-6' : 'grid-cols-5'}`}>
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
            {costCentersEnabled && (
              <TabsTrigger value="cost-centers" className="flex items-center gap-2">
                <Layers className="h-4 w-4" />
                Centri di Costo
              </TabsTrigger>
            )}
          </TabsList>
        )}

        <TabsContent value="tracking" className="mt-6" forceMount>
          <motion.div
            initial={false}
            animate={activeTab === 'tracking' ? 'visible' : 'hidden'}
            variants={tabPanelSwitch}
          >
            <ExpenseTrackingTab
              allExpenses={allExpenses}
              categories={categories}
              loading={loading}
              onRefresh={handleRefresh}
            />
          </motion.div>
        </TabsContent>

        {mountedTabs.has('dividends') && (
          <TabsContent value="dividends" className="mt-6" forceMount>
            <motion.div
              initial={false}
              animate={activeTab === 'dividends' ? 'visible' : 'hidden'}
              variants={tabPanelSwitch}
            >
              <DividendTrackingTab
                dividends={dividends}
                assets={assets}
                loading={loading}
                onRefresh={handleRefresh}
              />
            </motion.div>
          </TabsContent>
        )}

        {mountedTabs.has('current-year') && (
          <TabsContent value="current-year" className="mt-6" forceMount>
            <motion.div
              initial={false}
              animate={activeTab === 'current-year' ? 'visible' : 'hidden'}
              variants={tabPanelSwitch}
            >
              <CurrentYearTab
                allExpenses={allExpenses}
                loading={loading}
                onRefresh={handleRefresh}
              />
            </motion.div>
          </TabsContent>
        )}

        {mountedTabs.has('total-history') && (
          <TabsContent value="total-history" className="mt-6" forceMount>
            <motion.div
              initial={false}
              animate={activeTab === 'total-history' ? 'visible' : 'hidden'}
              variants={tabPanelSwitch}
            >
              <TotalHistoryTab
                allExpenses={allExpenses}
                loading={loading}
                onRefresh={handleRefresh}
                historyStartYear={cashflowHistoryStartYear}
              />
            </motion.div>
          </TabsContent>
        )}

        {mountedTabs.has('budget') && (
          <TabsContent value="budget" className="mt-6" forceMount>
            <motion.div
              initial={false}
              animate={activeTab === 'budget' ? 'visible' : 'hidden'}
              variants={tabPanelSwitch}
            >
              <BudgetTab
                allExpenses={allExpenses}
                categories={categories}
                loading={loading}
                historyStartYear={cashflowHistoryStartYear}
                userId={user?.uid ?? ''}
              />
            </motion.div>
          </TabsContent>
        )}
        {costCentersEnabled && mountedTabs.has('cost-centers') && (
          <TabsContent value="cost-centers" className="mt-6" forceMount>
            <motion.div
              initial={false}
              animate={activeTab === 'cost-centers' ? 'visible' : 'hidden'}
              variants={tabPanelSwitch}
            >
              <CostCentersTab />
            </motion.div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
