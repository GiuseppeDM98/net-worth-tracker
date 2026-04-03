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

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAssets } from '@/lib/hooks/useAssets';
import { useSnapshots } from '@/lib/hooks/useSnapshots';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Wallet, CalendarClock, History, Monitor } from 'lucide-react';
import { AssetManagementTab } from '@/components/assets/AssetManagementTab';
import { AssetPriceHistoryTable } from '@/components/assets/AssetPriceHistoryTable';
import { AssetClassHistoryTable } from '@/components/assets/AssetClassHistoryTable';
import { getCurrentYear } from '@/lib/utils/assetPriceHistoryUtils';

export default function AssetsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // React Query hooks - automatic caching and invalidation
  const { data: assets = [], isLoading: loading, refetch } = useAssets(user?.uid);
  const { data: snapshots = [], isLoading: snapshotsLoading } = useSnapshots(user?.uid);

  // Macro-tab state — lazy loading applied only to 'anno-corrente' and 'storico'
  type MacroTabId = 'management' | 'anno-corrente' | 'storico';
  const [mountedTabs, setMountedTabs] = useState<Set<MacroTabId>>(new Set(['management']));
  const [activeTab, setActiveTab] = useState<MacroTabId>('management');

  const handleTabChange = (value: string) => {
    setActiveTab(value as MacroTabId);
    setMountedTabs((prev) => new Set(prev).add(value as MacroTabId));
  };

  const handleRefresh = async () => {
    await Promise.all([
      refetch(),
      queryClient.invalidateQueries({
        queryKey: queryKeys.snapshots.all(user?.uid || ''),
      }),
    ]);
  };

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
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">Patrimonio</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">Gestisci e monitora il tuo patrimonio</p>
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
        <TabsContent value="management" className="mt-6">
          <AssetManagementTab assets={assets} loading={loading} onRefresh={handleRefresh} />
        </TabsContent>

        {/* Macro-tab 2: Anno Corrente (lazy-loaded) — sub-tabs: Prezzi, Valori, Asset Class */}
        {mountedTabs.has('anno-corrente') && (
          <TabsContent value="anno-corrente" className="mt-6">
            {/* Desktop recommended banner — hidden on 1440px+ where the table is fully usable */}
            <div className="desktop:hidden flex items-center gap-2 mb-4 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:border-blue-800 dark:bg-blue-950/20 dark:text-blue-400">
              <Monitor className="h-4 w-4 shrink-0" />
              <span>Per una migliore esperienza si consiglia la visualizzazione su desktop.</span>
            </div>
            <Tabs defaultValue="prezzi" className="w-full">
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

              <TabsContent value="prezzi">
                <AssetPriceHistoryTable
                  assets={assets}
                  snapshots={snapshots}
                  filterYear={getCurrentYear()}
                  displayMode="price"
                  showTotalRow={false}
                  loading={snapshotsLoading}
                  onRefresh={handleRefresh}
                />
              </TabsContent>

              <TabsContent value="valori">
                <AssetPriceHistoryTable
                  assets={assets}
                  snapshots={snapshots}
                  filterYear={getCurrentYear()}
                  displayMode="totalValue"
                  showTotalRow={true}
                  loading={snapshotsLoading}
                  onRefresh={handleRefresh}
                />
              </TabsContent>

              <TabsContent value="asset-class">
                <AssetClassHistoryTable
                  snapshots={snapshots}
                  filterYear={getCurrentYear()}
                  loading={snapshotsLoading}
                  onRefresh={handleRefresh}
                />
              </TabsContent>
            </Tabs>
          </TabsContent>
        )}

        {/* Macro-tab 3: Storico (lazy-loaded) — sub-tabs: Prezzi, Valori, Asset Class */}
        {mountedTabs.has('storico') && (
          <TabsContent value="storico" className="mt-6">
            {/* Desktop recommended banner — hidden on 1440px+ where the table is fully usable */}
            <div className="desktop:hidden flex items-center gap-2 mb-4 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:border-blue-800 dark:bg-blue-950/20 dark:text-blue-400">
              <Monitor className="h-4 w-4 shrink-0" />
              <span>Per una migliore esperienza si consiglia la visualizzazione su desktop.</span>
            </div>
            <Tabs defaultValue="prezzi" className="w-full">
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

              <TabsContent value="prezzi">
                <AssetPriceHistoryTable
                  assets={assets}
                  snapshots={snapshots}
                  filterStartDate={{ year: 2025, month: 11 }}
                  displayMode="price"
                  showTotalRow={false}
                  loading={snapshotsLoading}
                  onRefresh={handleRefresh}
                />
              </TabsContent>

              <TabsContent value="valori">
                <AssetPriceHistoryTable
                  assets={assets}
                  snapshots={snapshots}
                  filterStartDate={{ year: 2025, month: 11 }}
                  displayMode="totalValue"
                  showTotalRow={true}
                  loading={snapshotsLoading}
                  onRefresh={handleRefresh}
                />
              </TabsContent>

              <TabsContent value="asset-class">
                <AssetClassHistoryTable
                  snapshots={snapshots}
                  filterStartDate={{ year: 2025, month: 11 }}
                  loading={snapshotsLoading}
                  onRefresh={handleRefresh}
                />
              </TabsContent>
            </Tabs>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
