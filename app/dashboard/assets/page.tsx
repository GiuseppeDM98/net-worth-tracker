'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAssets } from '@/lib/hooks/useAssets';
import { useSnapshots } from '@/lib/hooks/useSnapshots';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Wallet, CalendarClock, History, TrendingUp, BarChart3 } from 'lucide-react';
import { AssetManagementTab } from '@/components/assets/AssetManagementTab';
import { AssetPriceHistoryTable } from '@/components/assets/AssetPriceHistoryTable';
import { getCurrentYear } from '@/lib/utils/assetPriceHistoryUtils';

export default function AssetsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // React Query hooks - automatic caching and invalidation
  const { data: assets = [], isLoading: loading, refetch } = useAssets(user?.uid);
  const { data: snapshots = [], isLoading: snapshotsLoading } = useSnapshots(user?.uid);

  // Tab state - lazy-loading pattern with 5 tabs
  type AssetTabId = 'management' | 'price-current' | 'price-history' | 'value-current' | 'value-history';
  const [mountedTabs, setMountedTabs] = useState<Set<AssetTabId>>(new Set(['management']));
  const [activeTab, setActiveTab] = useState<AssetTabId>('management');

  const handleTabChange = (value: string) => {
    setActiveTab(value as AssetTabId);
    setMountedTabs((prev) => new Set(prev).add(value as AssetTabId));
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
        <div className="text-gray-500">Caricamento...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Assets</h1>
        <p className="mt-2 text-gray-600">Gestisci e monitora i tuoi asset di investimento</p>
      </div>

      <Tabs defaultValue="management" value={activeTab} onValueChange={handleTabChange} className="w-full">
        {/* Mobile: horizontal scroll, Desktop: grid layout */}
        <div className="overflow-x-auto">
          <TabsList className="inline-flex min-w-full desktop:w-auto desktop:grid desktop:grid-cols-5">
            <TabsTrigger value="management" className="flex items-center gap-2 whitespace-nowrap text-xs sm:text-sm px-2 sm:px-4">
              <Wallet className="h-4 w-4" />
              <span className="hidden sm:inline">Gestione Asset</span>
            </TabsTrigger>
            <TabsTrigger value="price-current" className="flex items-center gap-2 whitespace-nowrap text-xs sm:text-sm px-2 sm:px-4">
              <CalendarClock className="h-4 w-4" />
              <span className="hidden sm:inline">Prezzi Anno Corrente</span>
            </TabsTrigger>
            <TabsTrigger value="price-history" className="flex items-center gap-2 whitespace-nowrap text-xs sm:text-sm px-2 sm:px-4">
              <History className="h-4 w-4" />
              <span className="hidden sm:inline">Prezzi Storici</span>
            </TabsTrigger>
            <TabsTrigger value="value-current" className="flex items-center gap-2 whitespace-nowrap text-xs sm:text-sm px-2 sm:px-4">
              <TrendingUp className="h-4 w-4" />
              <span className="hidden sm:inline">Valori Anno Corrente</span>
            </TabsTrigger>
            <TabsTrigger value="value-history" className="flex items-center gap-2 whitespace-nowrap text-xs sm:text-sm px-2 sm:px-4">
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline">Valori Storici</span>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Tab 1: Gestione Asset (always mounted) */}
        <TabsContent value="management" className="mt-6">
          <AssetManagementTab assets={assets} loading={loading} onRefresh={handleRefresh} />
        </TabsContent>

        {/* Tab 2: Prezzi Anno Corrente (lazy-loaded) */}
        {mountedTabs.has('price-current') && (
          <TabsContent value="price-current" className="mt-6">
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
        )}

        {/* Tab 3: Prezzi da Nov 2025 (lazy-loaded, NEW) */}
        {mountedTabs.has('price-history') && (
          <TabsContent value="price-history" className="mt-6">
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
        )}

        {/* Tab 4: Valori Anno Corrente (lazy-loaded, NEW) */}
        {mountedTabs.has('value-current') && (
          <TabsContent value="value-current" className="mt-6">
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
        )}

        {/* Tab 5: Valori da Nov 2025 (lazy-loaded, NEW) */}
        {mountedTabs.has('value-history') && (
          <TabsContent value="value-history" className="mt-6">
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
        )}
      </Tabs>
    </div>
  );
}
