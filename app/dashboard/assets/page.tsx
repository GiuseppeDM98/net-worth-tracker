/**
 * ASSETS PAGE
 *
 * Tab management page for assets with lazy loading and manual data refresh.
 *
 * LAZY LOADING PATTERN:
 * Same strategy as cashflow page:
 * - Macro-tabs ('anno-corrente', 'storico') mounted only when first activated
 * - Once mounted, stay mounted (no re-mounting on switch)
 * - Sub-tabs inside each macro-tab mount all at once (data is already in memory)
 * - Improves initial load performance
 *
 * TAB STRUCTURE:
 * - Gestione Asset: asset table with CRUD operations
 * - Anno Corrente: Prezzi / Valori / Asset Class for the current calendar year
 * - Storico: Prezzi / Valori / Asset Class for all history (from Nov 2025)
 *
 * REFRESH FUNCTIONALITY:
 * Manual refresh button invalidates React Query cache and refetches all data.
 * Useful after external price updates or when data seems stale.
 */

'use client';

import { motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAssets } from '@/lib/hooks/useAssets';
import { useSnapshots } from '@/lib/hooks/useSnapshots';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Wallet, CalendarClock, History, Monitor } from 'lucide-react';
import { AssetManagementTab } from '@/components/assets/AssetManagementTab';
import { AssetPriceHistoryTable } from '@/components/assets/AssetPriceHistoryTable';
import { AssetClassHistoryTable } from '@/components/assets/AssetClassHistoryTable';
import { getCurrentYear } from '@/lib/utils/assetPriceHistoryUtils';
import { cn } from '@/lib/utils';
import { tabPanelSwitch } from '@/lib/utils/motionVariants';

type MacroTabId = 'management' | 'anno-corrente' | 'storico';
type HistoricalSubTabId = 'prezzi' | 'valori' | 'asset-class';

export default function AssetsPage() {
  const { user } = useAuth();

  // React Query hooks - automatic caching and invalidation
  const { data: assets = [], isLoading: loading, refetch: refetchAssets } = useAssets(user?.uid);
  const {
    data: snapshots = [],
    isLoading: snapshotsLoading,
    refetch: refetchSnapshots,
  } = useSnapshots(user?.uid);

  // Macro-tab state — lazy loading applied only to 'anno-corrente' and 'storico'
  const [mountedTabs, setMountedTabs] = useState<Set<MacroTabId>>(new Set(['management']));
  const [activeTab, setActiveTab] = useState<MacroTabId>('management');
  const [mountedHistoricalSubTabs, setMountedHistoricalSubTabs] = useState<
    Record<Exclude<MacroTabId, 'management'>, Set<HistoricalSubTabId>>
  >({
    'anno-corrente': new Set(['prezzi']),
    storico: new Set(['prezzi']),
  });
  const [historicalSubTabs, setHistoricalSubTabs] = useState<
    Record<Exclude<MacroTabId, 'management'>, HistoricalSubTabId>
  >({
    'anno-corrente': 'prezzi',
    storico: 'prezzi',
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [lastRefreshAt, setLastRefreshAt] = useState<Date | null>(null);
  const [lastRefreshedViewKey, setLastRefreshedViewKey] = useState<string | null>(null);

  const handleTabChange = (value: string) => {
    setActiveTab(value as MacroTabId);
    setMountedTabs((prev) => new Set(prev).add(value as MacroTabId));
  };

  const handleHistoricalSubTabChange = (
    tab: Exclude<MacroTabId, 'management'>,
    value: string
  ) => {
    const nextValue = value as HistoricalSubTabId;
    setHistoricalSubTabs((prev) => ({
      ...prev,
      [tab]: nextValue,
    }));
    setMountedHistoricalSubTabs((prev) => ({
      ...prev,
      [tab]: new Set(prev[tab]).add(nextValue),
    }));
  };

  const activeViewKey = useMemo(() => {
    if (activeTab === 'management') return 'management';
    return `${activeTab}:${historicalSubTabs[activeTab]}`;
  }, [activeTab, historicalSubTabs]);

  const handleRefresh = async () => {
    const refreshViewKey = activeViewKey;
    setIsRefreshing(true);

    try {
      await Promise.all([refetchAssets(), refetchSnapshots()]);
      setLastRefreshAt(new Date());
      setLastRefreshedViewKey(refreshViewKey);
      setRefreshToken((prev) => prev + 1);
    } finally {
      setIsRefreshing(false);
    }
  };

  const formatRefreshTime = (date: Date | null) => {
    if (!date) return null;

    return new Intl.DateTimeFormat('it-IT', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(date);
  };

  const lastRefreshLabel = formatRefreshTime(lastRefreshAt);
  const mobileBannerClassName = cn(
    'desktop:hidden mb-4 flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm',
    'border-border bg-card text-muted-foreground',
    isRefreshing && 'border-primary/30 bg-primary/5 text-foreground'
  );

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-gray-500 dark:text-gray-400">Caricamento...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-desktop:portrait:pb-20">
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Patrimonio</p>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Patrimonio</h1>
        <p className="mt-2 text-muted-foreground">Gestisci e monitora il tuo patrimonio</p>
      </div>

      {/* Outer tabs: 3 macro-tabs */}
      <Tabs defaultValue="management" value={activeTab} onValueChange={handleTabChange} className="w-full">
        {/* Mobile (< 1440px): Radix Select for section switching */}
        <div className="desktop:hidden mb-4">
          <Select value={activeTab} onValueChange={handleTabChange}>
            <SelectTrigger className="w-full h-12 text-base">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="management">Gestione Asset</SelectItem>
              <SelectItem value="anno-corrente">Anno Corrente</SelectItem>
              <SelectItem value="storico">Storico</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Desktop (1440px+): standard tab list */}
        <div className="hidden desktop:block mb-4">
          <TabsList className="grid grid-cols-3 w-auto">
            <TabsTrigger value="management" className="flex items-center gap-2 text-sm px-4">
              <Wallet className="h-4 w-4" />
              Gestione Asset
            </TabsTrigger>
            <TabsTrigger value="anno-corrente" className="flex items-center gap-2 text-sm px-4">
              <CalendarClock className="h-4 w-4" />
              Anno Corrente
            </TabsTrigger>
            <TabsTrigger value="storico" className="flex items-center gap-2 text-sm px-4">
              <History className="h-4 w-4" />
              Storico
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Macro-tab 1: Gestione Asset (always mounted) */}
        <TabsContent value="management" className="mt-6" forceMount>
          <motion.div
            initial={false}
            animate={activeTab === 'management' ? 'visible' : 'hidden'}
            variants={tabPanelSwitch}
          >
            <AssetManagementTab assets={assets} loading={loading} onRefresh={handleRefresh} />
          </motion.div>
        </TabsContent>

        {/* Macro-tab 2: Anno Corrente (lazy-loaded) — sub-tabs: Prezzi, Valori, Asset Class */}
        {mountedTabs.has('anno-corrente') && (
          <TabsContent value="anno-corrente" className="mt-6" forceMount>
            <div className={mobileBannerClassName}>
              <div className="flex items-center gap-2">
                <Monitor className="h-4 w-4 shrink-0" />
                <span>Per una migliore esperienza si consiglia la visualizzazione su desktop.</span>
              </div>
              {lastRefreshLabel && activeTab === 'anno-corrente' ? (
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  Agg. {lastRefreshLabel}
                </span>
              ) : null}
            </div>
            <Tabs
              value={historicalSubTabs['anno-corrente']}
              onValueChange={(value) => handleHistoricalSubTabChange('anno-corrente', value)}
              className="w-full"
            >
              <TabsList className="grid grid-cols-3 mb-4">
                <TabsTrigger value="prezzi" className="text-xs sm:text-sm">
                  Prezzi
                </TabsTrigger>
                <TabsTrigger value="valori" className="text-xs sm:text-sm">
                  Valori
                </TabsTrigger>
                <TabsTrigger value="asset-class" className="text-xs sm:text-sm">
                  Asset Class
                </TabsTrigger>
              </TabsList>

              {mountedHistoricalSubTabs['anno-corrente'].has('prezzi') && (
                <TabsContent value="prezzi" forceMount>
                  <motion.div
                    initial={false}
                    animate={historicalSubTabs['anno-corrente'] === 'prezzi' ? 'visible' : 'hidden'}
                    variants={tabPanelSwitch}
                  >
                    <AssetPriceHistoryTable
                      assets={assets}
                      snapshots={snapshots}
                      filterYear={getCurrentYear()}
                      displayMode="price"
                      showTotalRow={false}
                      loading={snapshotsLoading}
                      onRefresh={handleRefresh}
                      isRefreshing={isRefreshing}
                      isActiveView={activeViewKey === 'anno-corrente:prezzi'}
                      isLatestRefreshedView={lastRefreshedViewKey === 'anno-corrente:prezzi'}
                      refreshToken={refreshToken}
                      lastRefreshAt={lastRefreshAt}
                    />
                  </motion.div>
                </TabsContent>
              )}

              {mountedHistoricalSubTabs['anno-corrente'].has('valori') && (
                <TabsContent value="valori" forceMount>
                  <motion.div
                    initial={false}
                    animate={historicalSubTabs['anno-corrente'] === 'valori' ? 'visible' : 'hidden'}
                    variants={tabPanelSwitch}
                  >
                    <AssetPriceHistoryTable
                      assets={assets}
                      snapshots={snapshots}
                      filterYear={getCurrentYear()}
                      displayMode="totalValue"
                      showTotalRow={true}
                      loading={snapshotsLoading}
                      onRefresh={handleRefresh}
                      isRefreshing={isRefreshing}
                      isActiveView={activeViewKey === 'anno-corrente:valori'}
                      isLatestRefreshedView={lastRefreshedViewKey === 'anno-corrente:valori'}
                      refreshToken={refreshToken}
                      lastRefreshAt={lastRefreshAt}
                    />
                  </motion.div>
                </TabsContent>
              )}

              {mountedHistoricalSubTabs['anno-corrente'].has('asset-class') && (
                <TabsContent value="asset-class" forceMount>
                  <motion.div
                    initial={false}
                    animate={historicalSubTabs['anno-corrente'] === 'asset-class' ? 'visible' : 'hidden'}
                    variants={tabPanelSwitch}
                  >
                    <AssetClassHistoryTable
                      snapshots={snapshots}
                      filterYear={getCurrentYear()}
                      loading={snapshotsLoading}
                      onRefresh={handleRefresh}
                      isRefreshing={isRefreshing}
                      isActiveView={activeViewKey === 'anno-corrente:asset-class'}
                      isLatestRefreshedView={lastRefreshedViewKey === 'anno-corrente:asset-class'}
                      refreshToken={refreshToken}
                      lastRefreshAt={lastRefreshAt}
                    />
                  </motion.div>
                </TabsContent>
              )}
            </Tabs>
          </TabsContent>
        )}

        {/* Macro-tab 3: Storico (lazy-loaded) — sub-tabs: Prezzi, Valori, Asset Class */}
        {mountedTabs.has('storico') && (
          <TabsContent value="storico" className="mt-6" forceMount>
            <div className={mobileBannerClassName}>
              <div className="flex items-center gap-2">
                <Monitor className="h-4 w-4 shrink-0" />
                <span>Per una migliore esperienza si consiglia la visualizzazione su desktop.</span>
              </div>
              {lastRefreshLabel && activeTab === 'storico' ? (
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  Agg. {lastRefreshLabel}
                </span>
              ) : null}
            </div>
            <Tabs
              value={historicalSubTabs.storico}
              onValueChange={(value) => handleHistoricalSubTabChange('storico', value)}
              className="w-full"
            >
              <TabsList className="grid grid-cols-3 mb-4">
                <TabsTrigger value="prezzi" className="text-xs sm:text-sm">
                  Prezzi
                </TabsTrigger>
                <TabsTrigger value="valori" className="text-xs sm:text-sm">
                  Valori
                </TabsTrigger>
                <TabsTrigger value="asset-class" className="text-xs sm:text-sm">
                  Asset Class
                </TabsTrigger>
              </TabsList>

              {mountedHistoricalSubTabs.storico.has('prezzi') && (
                <TabsContent value="prezzi" forceMount>
                  <motion.div
                    initial={false}
                    animate={historicalSubTabs.storico === 'prezzi' ? 'visible' : 'hidden'}
                    variants={tabPanelSwitch}
                  >
                    <AssetPriceHistoryTable
                      assets={assets}
                      snapshots={snapshots}
                      filterStartDate={{ year: 2025, month: 11 }}
                      displayMode="price"
                      showTotalRow={false}
                      loading={snapshotsLoading}
                      onRefresh={handleRefresh}
                      isRefreshing={isRefreshing}
                      isActiveView={activeViewKey === 'storico:prezzi'}
                      isLatestRefreshedView={lastRefreshedViewKey === 'storico:prezzi'}
                      refreshToken={refreshToken}
                      lastRefreshAt={lastRefreshAt}
                    />
                  </motion.div>
                </TabsContent>
              )}

              {mountedHistoricalSubTabs.storico.has('valori') && (
                <TabsContent value="valori" forceMount>
                  <motion.div
                    initial={false}
                    animate={historicalSubTabs.storico === 'valori' ? 'visible' : 'hidden'}
                    variants={tabPanelSwitch}
                  >
                    <AssetPriceHistoryTable
                      assets={assets}
                      snapshots={snapshots}
                      filterStartDate={{ year: 2025, month: 11 }}
                      displayMode="totalValue"
                      showTotalRow={true}
                      loading={snapshotsLoading}
                      onRefresh={handleRefresh}
                      isRefreshing={isRefreshing}
                      isActiveView={activeViewKey === 'storico:valori'}
                      isLatestRefreshedView={lastRefreshedViewKey === 'storico:valori'}
                      refreshToken={refreshToken}
                      lastRefreshAt={lastRefreshAt}
                    />
                  </motion.div>
                </TabsContent>
              )}

              {mountedHistoricalSubTabs.storico.has('asset-class') && (
                <TabsContent value="asset-class" forceMount>
                  <motion.div
                    initial={false}
                    animate={historicalSubTabs.storico === 'asset-class' ? 'visible' : 'hidden'}
                    variants={tabPanelSwitch}
                  >
                    <AssetClassHistoryTable
                      snapshots={snapshots}
                      filterStartDate={{ year: 2025, month: 11 }}
                      loading={snapshotsLoading}
                      onRefresh={handleRefresh}
                      isRefreshing={isRefreshing}
                      isActiveView={activeViewKey === 'storico:asset-class'}
                      isLatestRefreshedView={lastRefreshedViewKey === 'storico:asset-class'}
                      refreshToken={refreshToken}
                      lastRefreshAt={lastRefreshAt}
                    />
                  </motion.div>
                </TabsContent>
              )}
            </Tabs>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
