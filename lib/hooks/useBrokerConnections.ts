import { useQuery } from '@tanstack/react-query';
import { getAllBrokerConnections } from '@/lib/services/brokerConnectionService';
import { queryKeys } from '@/lib/query/queryKeys';
import { BROKERS, type BrokerId } from '@/lib/services/brokerConnectionService';

export interface BrokerSyncStatus {
  broker: BrokerId;
  connected: boolean;
  lastSyncAt: Date | null;
  daysSinceSync: number | null;
  needsUpdate: boolean; // true if > 30 days since last sync
  holdingsCount: number;
}

/** Read all broker connections for the owner. */
export function useBrokerConnections(ownerId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.brokerConnections.all(ownerId),
    queryFn: () => getAllBrokerConnections(ownerId),
    enabled: enabled && !!ownerId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/** Derive sync status for all brokers from the connections. */
export function useBrokerSyncStatus(ownerId: string, enabled = true) {
  const { data: connections, ...rest } = useBrokerConnections(ownerId, enabled);

  const status: BrokerSyncStatus[] = BROKERS.map((broker) => {
    const conn = connections?.[broker] ?? null;
    const lastSyncAt = conn?.lastSyncAt ?? null;
    const now = new Date();
    const daysSinceSync = lastSyncAt
      ? Math.floor((now.getTime() - lastSyncAt.getTime()) / (1000 * 60 * 60 * 24))
      : null;
    const needsUpdate = daysSinceSync !== null && daysSinceSync > 30;

    return {
      broker,
      connected: !!conn,
      lastSyncAt,
      daysSinceSync,
      needsUpdate,
      holdingsCount: conn?.holdingsCount ?? 0,
    };
  });

  const anyConnected = status.some((s) => s.connected);
  const anyNeedsUpdate = status.some((s) => s.needsUpdate);

  return {
    ...rest,
    status,
    anyConnected,
    anyNeedsUpdate,
  };
}

/** Broker display names for UI. */
export const BROKER_DISPLAY_NAME: Record<BrokerId, string> = {
  scalable: 'Scalable Capital',
  traderepublic: 'Trade Republic',
  intesa: 'Intesa Sanpaolo',
  azimut: 'Azimut',
  binance: 'Binance',
};

/** Format last sync date for Italian locale. */
export function formatLastSyncDate(date: Date | null): string {
  if (!date) return 'mai sincronizzato';
  return date.toLocaleDateString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}