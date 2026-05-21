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
 *
 * TAB STRUCTURE:
 * - Gestione Asset: asset table with CRUD operations
 * - Anno Corrente: Prezzi / Valori / Asset Class for the current calendar year
 * - Storico: Prezzi / Valori / Asset Class for all history (from Nov 2025)
 *
 * MOBILE HISTORICAL TABS:
 * Banner rimosso. Sostituito con AssetMobileSummary (ultimi 3 mesi compatti) +
 * Collapsible per la tabella completa. Desktop: tabella sempre visibile.
 */

'use client';

import { motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAssets } from '@/lib/hooks/useAssets';
import { useSnapshots } from '@/lib/hooks/useSnapshots';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Wallet, CalendarClock, History, ChevronDown } from 'lucide-react';
import { AssetManagementTab } from '@/components/assets/AssetManagementTab';
import { AssetPriceHistoryTable } from '@/components/assets/AssetPriceHistoryTable';
import { AssetClassHistoryTable } from '@/components/assets/AssetClassHistoryTable';
import { AssetMobileSummary } from '@/components/assets/AssetMobileSummary';
import { getCurrentYear } from '@/lib/utils/assetPriceHistoryUtils';
import { tabPanelSwitch } from '@/lib/utils/motionVariants';
import type { ComponentProps } from 'react';

type MacroTabId = 'management' | 'anno-corrente' | 'storico';
type HistoricalSubTabId = 'prezzi' | 'valori' | 'asset-class';

// Mobile-only wrapper: compact 3-month summary above a collapsible full table.
// Defined at module level so React sees a stable component reference each render.
// Each instance owns its own open state — no shared state needed in the page.
function MobileHistoricalView({
  summaryProps,
  tableNode,
}: {
  summaryProps: ComponentProps<typeof AssetMobileSummary>;
  tableNode: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="desktop:hidden space-y-4">
      <AssetMobileSummary {...summaryProps} />
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full flex items-center justify-center gap-1.5 text-muted-foreground"
          >
            {isOpen ? 'Nascondi tabella' : 'Mostra tabella completa'}
            <ChevronDown
              className={`h-4 w-4 transition-transform duration-200 motion-reduce:transition-none ${
                isOpen ? 'rotate-180' : ''
              }`}
            />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>{tableNode}</CollapsibleContent>
      </Collapsible>
    </div>
  );
}

export default function AssetsPage() {
  const { user } = useAuth();

  const { data: assets = [], isLoading: loading, refetch: refetchAssets } = useAssets(user?.uid);
  const {
    data: snapshots = [],
    isLoading: snapshotsLoading,
    refetch: refetchSnapshots,
  } = useSnapshots(user?.uid);

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
    setHistoricalSubTabs((prev) => ({ ...prev, [tab]: nextValue }));
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

  // Anno Corrente: only active (quantity > 0) assets with the flag enabled
  const historyTableAssets = useMemo(
    () => assets.filter((a) => a.quantity > 0 && a.includeInHistoryTables === true),
    [assets]
  );

  // Storico: includes sold assets (quantity === 0) with the flag enabled
  const historyTableAssetsAll = useMemo(
    () => assets.filter((a) => a.includeInHistoryTables === true),
    [assets]
  );

  if (loading) {
    return (
      <div className="space-y-6 max-desktop:portrait:pb-20">
        <div className="space-y-2">
          <div className="h-8 w-40 rounded-lg bg-muted animate-pulse" />
          <div className="h-4 w-56 rounded bg-muted animate-pulse" />
        </div>
        <div className="h-10 w-80 rounded-xl bg-muted animate-pulse" />
        <div className="h-24 rounded-xl bg-muted animate-pulse" />
        <div className="h-64 rounded-xl bg-muted animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-desktop:portrait:pb-20">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Patrimonio</h1>
        <p className="mt-2 text-muted-foreground">Gestisci e monitora il tuo patrimonio</p>
      </div>

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

        {/* Macro-tab 2: Anno Corrente (lazy-loaded) */}
        {mountedTabs.has('anno-corrente') && (
          <TabsContent value="anno-corrente" className="mt-6" forceMount>
            <Tabs
              value={historicalSubTabs['anno-corrente']}
              onValueChange={(value) => handleHistoricalSubTabChange('anno-corrente', value)}
              className="w-full"
            >
              <TabsList className="grid grid-cols-3 mb-4">
                <TabsTrigger value="prezzi" className="text-xs sm:text-sm">Prezzi</TabsTrigger>
                <TabsTrigger value="valori" className="text-xs sm:text-sm">Valori</TabsTrigger>
                <TabsTrigger value="asset-class" className="text-xs sm:text-sm">Asset Class</TabsTrigger>
              </TabsList>

              {mountedHistoricalSubTabs['anno-corrente'].has('prezzi') && (
                <TabsContent value="prezzi" forceMount>
                  <motion.div
                    initial={false}
                    animate={historicalSubTabs['anno-corrente'] === 'prezzi' ? 'visible' : 'hidden'}
                    variants={tabPanelSwitch}
                  >
                    <MobileHistoricalView
                      summaryProps={{
                        assets: historyTableAssets,
                        snapshots,
                        filterYear: getCurrentYear(),
                        displayMode: 'price',
                        includePreviousMonthBaseline: true,
                        restrictToPassedAssets: true,
                      }}
                      tableNode={
                        <AssetPriceHistoryTable
                          assets={historyTableAssets}
                          snapshots={snapshots}
                          filterYear={getCurrentYear()}
                          displayMode="price"
                          includePreviousMonthBaseline={true}
                          restrictToPassedAssets={true}
                          showTotalRow={false}
                          loading={snapshotsLoading}
                          onRefresh={handleRefresh}
                          isRefreshing={isRefreshing}
                          isActiveView={activeViewKey === 'anno-corrente:prezzi'}
                          isLatestRefreshedView={lastRefreshedViewKey === 'anno-corrente:prezzi'}
                          refreshToken={refreshToken}
                          lastRefreshAt={lastRefreshAt}
                        />
                      }
                    />
                    <div className="hidden desktop:block">
                      <AssetPriceHistoryTable
                        assets={historyTableAssets}
                        snapshots={snapshots}
                        filterYear={getCurrentYear()}
                        displayMode="price"
                        includePreviousMonthBaseline={true}
                        restrictToPassedAssets={true}
                        showTotalRow={false}
                        loading={snapshotsLoading}
                        onRefresh={handleRefresh}
                        isRefreshing={isRefreshing}
                        isActiveView={activeViewKey === 'anno-corrente:prezzi'}
                        isLatestRefreshedView={lastRefreshedViewKey === 'anno-corrente:prezzi'}
                        refreshToken={refreshToken}
                        lastRefreshAt={lastRefreshAt}
                      />
                    </div>
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
                    <MobileHistoricalView
                      summaryProps={{
                        assets: historyTableAssets,
                        snapshots,
                        filterYear: getCurrentYear(),
                        displayMode: 'totalValue',
                        includePreviousMonthBaseline: true,
                        restrictToPassedAssets: true,
                      }}
                      tableNode={
                        <AssetPriceHistoryTable
                          assets={historyTableAssets}
                          snapshots={snapshots}
                          filterYear={getCurrentYear()}
                          displayMode="totalValue"
                          includePreviousMonthBaseline={true}
                          restrictToPassedAssets={true}
                          showTotalRow={true}
                          loading={snapshotsLoading}
                          onRefresh={handleRefresh}
                          isRefreshing={isRefreshing}
                          isActiveView={activeViewKey === 'anno-corrente:valori'}
                          isLatestRefreshedView={lastRefreshedViewKey === 'anno-corrente:valori'}
                          refreshToken={refreshToken}
                          lastRefreshAt={lastRefreshAt}
                        />
                      }
                    />
                    <div className="hidden desktop:block">
                      <AssetPriceHistoryTable
                        assets={historyTableAssets}
                        snapshots={snapshots}
                        filterYear={getCurrentYear()}
                        displayMode="totalValue"
                        includePreviousMonthBaseline={true}
                        restrictToPassedAssets={true}
                        showTotalRow={true}
                        loading={snapshotsLoading}
                        onRefresh={handleRefresh}
                        isRefreshing={isRefreshing}
                        isActiveView={activeViewKey === 'anno-corrente:valori'}
                        isLatestRefreshedView={lastRefreshedViewKey === 'anno-corrente:valori'}
                        refreshToken={refreshToken}
                        lastRefreshAt={lastRefreshAt}
                      />
                    </div>
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
                      includePreviousMonthBaseline={true}
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

        {/* Macro-tab 3: Storico (lazy-loaded) */}
        {mountedTabs.has('storico') && (
          <TabsContent value="storico" className="mt-6" forceMount>
            <Tabs
              value={historicalSubTabs.storico}
              onValueChange={(value) => handleHistoricalSubTabChange('storico', value)}
              className="w-full"
            >
              <TabsList className="grid grid-cols-3 mb-4">
                <TabsTrigger value="prezzi" className="text-xs sm:text-sm">Prezzi</TabsTrigger>
                <TabsTrigger value="valori" className="text-xs sm:text-sm">Valori</TabsTrigger>
                <TabsTrigger value="asset-class" className="text-xs sm:text-sm">Asset Class</TabsTrigger>
              </TabsList>

              {mountedHistoricalSubTabs.storico.has('prezzi') && (
                <TabsContent value="prezzi" forceMount>
                  <motion.div
                    initial={false}
                    animate={historicalSubTabs.storico === 'prezzi' ? 'visible' : 'hidden'}
                    variants={tabPanelSwitch}
                  >
                    <MobileHistoricalView
                      summaryProps={{
                        assets: historyTableAssetsAll,
                        snapshots,
                        filterStartDate: { year: 2025, month: 11 },
                        displayMode: 'price',
                        restrictToPassedAssets: true,
                      }}
                      tableNode={
                        <AssetPriceHistoryTable
                          assets={historyTableAssetsAll}
                          snapshots={snapshots}
                          filterStartDate={{ year: 2025, month: 11 }}
                          displayMode="price"
                          restrictToPassedAssets={true}
                          showTotalRow={false}
                          loading={snapshotsLoading}
                          onRefresh={handleRefresh}
                          isRefreshing={isRefreshing}
                          isActiveView={activeViewKey === 'storico:prezzi'}
                          isLatestRefreshedView={lastRefreshedViewKey === 'storico:prezzi'}
                          refreshToken={refreshToken}
                          lastRefreshAt={lastRefreshAt}
                        />
                      }
                    />
                    <div className="hidden desktop:block">
                      <AssetPriceHistoryTable
                        assets={historyTableAssetsAll}
                        snapshots={snapshots}
                        filterStartDate={{ year: 2025, month: 11 }}
                        displayMode="price"
                        restrictToPassedAssets={true}
                        showTotalRow={false}
                        loading={snapshotsLoading}
                        onRefresh={handleRefresh}
                        isRefreshing={isRefreshing}
                        isActiveView={activeViewKey === 'storico:prezzi'}
                        isLatestRefreshedView={lastRefreshedViewKey === 'storico:prezzi'}
                        refreshToken={refreshToken}
                        lastRefreshAt={lastRefreshAt}
                      />
                    </div>
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
                    <MobileHistoricalView
                      summaryProps={{
                        assets: historyTableAssetsAll,
                        snapshots,
                        filterStartDate: { year: 2025, month: 11 },
                        displayMode: 'totalValue',
                        restrictToPassedAssets: true,
                      }}
                      tableNode={
                        <AssetPriceHistoryTable
                          assets={historyTableAssetsAll}
                          snapshots={snapshots}
                          filterStartDate={{ year: 2025, month: 11 }}
                          displayMode="totalValue"
                          restrictToPassedAssets={true}
                          showTotalRow={true}
                          loading={snapshotsLoading}
                          onRefresh={handleRefresh}
                          isRefreshing={isRefreshing}
                          isActiveView={activeViewKey === 'storico:valori'}
                          isLatestRefreshedView={lastRefreshedViewKey === 'storico:valori'}
                          refreshToken={refreshToken}
                          lastRefreshAt={lastRefreshAt}
                        />
                      }
                    />
                    <div className="hidden desktop:block">
                      <AssetPriceHistoryTable
                        assets={historyTableAssetsAll}
                        snapshots={snapshots}
                        filterStartDate={{ year: 2025, month: 11 }}
                        displayMode="totalValue"
                        restrictToPassedAssets={true}
                        showTotalRow={true}
                        loading={snapshotsLoading}
                        onRefresh={handleRefresh}
                        isRefreshing={isRefreshing}
                        isActiveView={activeViewKey === 'storico:valori'}
                        isLatestRefreshedView={lastRefreshedViewKey === 'storico:valori'}
                        refreshToken={refreshToken}
                        lastRefreshAt={lastRefreshAt}
                      />
                    </div>
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
