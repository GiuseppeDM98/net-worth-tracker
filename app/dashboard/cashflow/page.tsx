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
import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { Receipt, Coins, BarChart3, Target, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { Dividend } from '@/types/dividend';
import { Asset } from '@/types/assets';
import { useExpenses, useExpenseCategories } from '@/lib/hooks/useExpenses';
import { useHouseholdConfig } from '@/lib/hooks/useHousehold';
import { queryKeys } from '@/lib/query/queryKeys';
import { getAllAssets } from '@/lib/services/assetService';
import { getSettings } from '@/lib/services/assetAllocationService';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import { tabPanelSwitch } from '@/lib/utils/motionVariants';
import { toast } from 'sonner';

function CashflowTabLoading() {
  return <div className="h-48 rounded-md border bg-muted/30 animate-pulse" />;
}

const ExpenseTrackingTab = dynamic(
  () => import('@/components/cashflow/ExpenseTrackingTab').then((mod) => mod.ExpenseTrackingTab),
  { loading: CashflowTabLoading }
);
const AnalisiTab = dynamic(
  () => import('@/components/cashflow/AnalisiTab').then((mod) => mod.AnalisiTab),
  { loading: CashflowTabLoading }
);
const CurrentYearTab = dynamic(
  () => import('@/components/cashflow/CurrentYearTab').then((mod) => mod.CurrentYearTab),
  { loading: CashflowTabLoading }
);
const TotalHistoryTab = dynamic(
  () => import('@/components/cashflow/TotalHistoryTab').then((mod) => mod.TotalHistoryTab),
  { loading: CashflowTabLoading }
);
const DividendTrackingTab = dynamic(
  () => import('@/components/dividends/DividendTrackingTab').then((mod) => mod.DividendTrackingTab),
  { loading: CashflowTabLoading }
);
const BudgetTab = dynamic(
  () => import('@/components/cashflow/BudgetTab').then((mod) => mod.BudgetTab),
  { loading: CashflowTabLoading }
);
const CostCentersTab = dynamic(
  () => import('@/components/cashflow/CostCentersTab').then((mod) => mod.CostCentersTab),
  { loading: CashflowTabLoading }
);
const InternalTransfersTab = dynamic(
  () => import('@/components/cashflow/InternalTransfersTab').then((mod) => mod.InternalTransfersTab),
  { loading: CashflowTabLoading }
);
const InvestmentOperationsTab = dynamic(
  () => import('@/components/cashflow/InvestmentOperationsTab').then((mod) => mod.InvestmentOperationsTab),
  { loading: CashflowTabLoading }
);
const CompensationsTab = dynamic(
  () => import('@/components/cashflow/CompensationsTab').then((mod) => mod.CompensationsTab),
  { loading: CashflowTabLoading }
);

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Module-level constant: stable reference for React Compiler
const CASHFLOW_TABS_BASE: Array<{ value: string; label: string; mobileLabel: string; icon: React.ElementType }> = [
  { value: 'tracking',     label: 'Tracciamento', mobileLabel: 'Spese',     icon: Receipt  },
  { value: 'dividends',    label: 'Dividendi',    mobileLabel: 'Dividendi', icon: Coins    },
  { value: 'analisi',      label: 'Analisi',      mobileLabel: 'Analisi',   icon: BarChart3 },
  { value: 'budget',       label: 'Budget',       mobileLabel: 'Budget',    icon: Target   },
];

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
  const { data: householdConfig, isLoading: householdLoading } = useHouseholdConfig(user?.uid);
  const householdEnabled = householdConfig?.enabled === true;

  const [cashflowHistoryStartYear, setCashflowHistoryStartYear] = useState<number>(new Date().getFullYear() - 1);

  // Manual state for other tabs data (dividends, assets)
  const [dividends, setDividends] = useState<Dividend[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [otherDataLoading, setOtherDataLoading] = useState(false);
  const [otherDataLoaded, setOtherDataLoaded] = useState(false);

  const loading = expensesLoading || categoriesLoading || otherDataLoading;

  // Load dividends and assets only when their tabs are mounted
  const loadOtherData = async (force = false) => {
    if (!user || (!force && otherDataLoaded)) return;

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

  useEffect(() => {
    if (!householdLoading && !householdEnabled && activeTab === 'compensations') {
      setActiveTab('tracking');
    }
  }, [activeTab, householdEnabled, householdLoading]);

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
    await loadOtherData(true);
  };

  const handleTabChange = (value: string) => {
    if (value === 'compensations' && !householdEnabled) return;
    setActiveTab(value);
    setMountedTabs(prev => new Set(prev).add(value));
  };

  const desktopTabCount = 7 + (householdEnabled ? 1 : 0) + (costCentersEnabled ? 1 : 0);
  const desktopTabGridClass =
    desktopTabCount === 9 ? 'grid-cols-9' : desktopTabCount === 8 ? 'grid-cols-8' : 'grid-cols-7';

  return (
    <div className="space-y-6 max-desktop:portrait:pb-20">
      {/* Header */}
      <div className="border-b border-border pb-4">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Operatività</p>
        <h1 className="mt-1 text-2xl font-bold text-foreground sm:text-3xl">
          Cashflow
        </h1>
        <p className="mt-2 text-muted-foreground">
          Traccia e analizza le tue entrate e uscite nel tempo
        </p>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="tracking" value={activeTab} onValueChange={handleTabChange} className="w-full">
        {costCentersEnabled === null ? (
          <div className="h-10 w-full rounded-md bg-muted animate-pulse mb-6" />
        ) : (() => {
          const allTabs = costCentersEnabled
            ? [...CASHFLOW_TABS_BASE, { value: 'cost-centers', label: 'Centri di Costo', mobileLabel: 'C.Costo', icon: Layers }]
            : CASHFLOW_TABS_BASE;
          return (
            <>
              {/* Mobile (<desktop): Framer Motion sliding pill */}
              <div className="desktop:hidden mb-6">
                <div role="tablist" aria-label="Sezioni cashflow" className="flex rounded-xl bg-muted p-1 gap-1">
                  {allTabs.map(({ value, mobileLabel, icon: Icon }) => (
                    <button
                      key={value}
                      type="button"
                      role="tab"
                      aria-selected={activeTab === value}
                      onClick={() => handleTabChange(value)}
                      className={cn(
                        'relative flex-1 flex items-center justify-center gap-1 h-9 rounded-lg text-xs font-medium',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                        activeTab !== value && 'text-muted-foreground hover:text-foreground transition-colors duration-150'
                      )}
                    >
                      {activeTab === value && (
                        <motion.span
                          layoutId="cashflow-mobile-tab"
                          className="absolute inset-0 rounded-lg bg-card shadow-sm"
                          transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                        />
                      )}
                      <span className={cn(
                        'relative z-10 flex items-center gap-1',
                        activeTab === value ? 'text-foreground' : 'text-muted-foreground'
                      )}>
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{mobileLabel}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Desktop (1440px+): standard tab list */}
              <div className="hidden desktop:block mb-6">
                <TabsList className="w-full justify-start">
                  {allTabs.map(({ value, label, icon: Icon }) => (
                    <TabsTrigger key={value} value={value} className="flex items-center gap-1.5">
                      <Icon className="h-3.5 w-3.5" />
                      {label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
            </>
          );
        })()}

        <TabsContent value="tracking" forceMount>
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
          <TabsContent value="dividends" forceMount>
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

        {mountedTabs.has('analisi') && (
          <TabsContent value="analisi" forceMount>
            <motion.div
              initial={false}
              animate={activeTab === 'analisi' ? 'visible' : 'hidden'}
              variants={tabPanelSwitch}
            >
              <AnalisiTab
                allExpenses={allExpenses}
                loading={loading}
                onRefresh={handleRefresh}
                historyStartYear={cashflowHistoryStartYear}
              />
            </motion.div>
          </TabsContent>
        )}

        {mountedTabs.has('budget') && (
          <TabsContent value="budget" forceMount>
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
        {mountedTabs.has('transfers') && (
          <TabsContent value="transfers" className="mt-6" forceMount>
            <motion.div
              initial={false}
              animate={activeTab === 'transfers' ? 'visible' : 'hidden'}
              variants={tabPanelSwitch}
            >
              <InternalTransfersTab />
            </motion.div>
          </TabsContent>
        )}
        {householdEnabled && mountedTabs.has('compensations') && (
          <TabsContent value="compensations" className="mt-6" forceMount>
            <motion.div
              initial={false}
              animate={activeTab === 'compensations' ? 'visible' : 'hidden'}
              variants={tabPanelSwitch}
            >
              <CompensationsTab
                allExpenses={allExpenses}
                loading={loading}
                historyStartYear={cashflowHistoryStartYear}
              />
            </motion.div>
          </TabsContent>
        )}
        {costCentersEnabled && mountedTabs.has('cost-centers') && (
          <TabsContent value="cost-centers" forceMount>
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
