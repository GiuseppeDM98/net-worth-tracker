'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAssets } from '@/lib/hooks/useAssets';
import { useSnapshots } from '@/lib/hooks/useSnapshots';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Wallet, CalendarClock, History } from 'lucide-react';
import { AssetManagementTab } from '@/components/assets/AssetManagementTab';
import { AssetPriceHistoryTable } from '@/components/assets/AssetPriceHistoryTable';
import { getCurrentYear } from '@/lib/utils/assetPriceHistoryUtils';

export default function AssetsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // React Query hooks - automatic caching and invalidation
  const { data: assets = [], isLoading: loading, refetch } = useAssets(user?.uid);
  const { data: snapshots = [], isLoading: snapshotsLoading } = useSnapshots(user?.uid);

  // Tab state - lazy-loading pattern from cashflow page
  const [mountedTabs, setMountedTabs] = useState<Set<string>>(new Set(['management']));
  const [activeTab, setActiveTab] = useState<string>('management');

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setMountedTabs((prev) => new Set(prev).add(value));
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
        <TabsList className="grid w-full max-w-3xl grid-cols-3">
          <TabsTrigger value="management" className="flex items-center gap-2">
            <Wallet className="h-4 w-4" />
            <span className="hidden sm:inline">Gestione Asset</span>
          </TabsTrigger>
          <TabsTrigger value="current-year" className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4" />
            <span className="hidden sm:inline">Anno Corrente</span>
          </TabsTrigger>
          <TabsTrigger value="total-history" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            <span className="hidden sm:inline">Storico Totale</span>
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Gestione Asset (always mounted) */}
        <TabsContent value="management" className="mt-6">
          <AssetManagementTab assets={assets} loading={loading} onRefresh={handleRefresh} />
        </TabsContent>

        {/* Tab 2: Anno Corrente (lazy-loaded) */}
        {mountedTabs.has('current-year') && (
          <TabsContent value="current-year" className="mt-6">
            <AssetPriceHistoryTable
              assets={assets}
              snapshots={snapshots}
              filterYear={getCurrentYear()}
              loading={snapshotsLoading}
              onRefresh={handleRefresh}
            />
          </TabsContent>
        )}

        {/* Tab 3: Storico Totale (lazy-loaded) */}
        {mountedTabs.has('total-history') && (
          <TabsContent value="total-history" className="mt-6">
            <AssetPriceHistoryTable
              assets={assets}
              snapshots={snapshots}
              loading={snapshotsLoading}
              onRefresh={handleRefresh}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
