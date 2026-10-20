'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useBrokerSyncStatus } from '@/lib/hooks/useBrokerConnections';
import { toast } from 'sonner';
import { BROKER_DISPLAY_NAME, formatLastSyncDate } from '@/lib/hooks/useBrokerConnections';

/**
 * Checks broker sync status on app open and shows a reminder if any configured
 * broker hasn't been synced in 30+ days.
 *
 * Runs once per session per owner (tracked in sessionStorage).
 * Only shows for owners who have at least one broker connected.
 */
export function BrokerSyncReminder() {
  useAuth(); // ensures auth is resolved
  const { ownerId } = useActiveAccount();
  const { status, anyConnected, anyNeedsUpdate } = useBrokerSyncStatus(ownerId ?? '', !!ownerId);
  const shownRef = useRef(false);

  useEffect(() => {
    if (!ownerId || !anyConnected || !anyNeedsUpdate || shownRef.current) return;

    // Check sessionStorage to avoid showing multiple times per session
    const sessionKey = `brokerSyncReminder:${ownerId}`;
    if (sessionStorage.getItem(sessionKey)) return;

    shownRef.current = true;
    sessionStorage.setItem(sessionKey, '1');

    const outdated = status.filter((s) => s.needsUpdate);
    if (outdated.length === 0) return;

    const lines = outdated.map(
      (s) => `• ${BROKER_DISPLAY_NAME[s.broker]}: ultima sincronizzazione ${formatLastSyncDate(s.lastSyncAt)} (${s.daysSinceSync} giorni fa)`
    );

    toast(
      `Collegamenti broker da aggiornare (${outdated.length} su ${status.filter((s) => s.connected).length})`,
      {
        description: (
          <div className="text-left text-sm leading-relaxed">
            <p className="mb-2">Alcuni collegamenti non vengono sincronizzati da più di 30 giorni:</p>
            <div className="font-mono text-[11px] space-y-1">{lines.map((l, i) => <div key={i}>{l}</div>)}</div>
            <p className="mt-2 text-muted-foreground">Vai in Impostazioni → Collegamenti per sincronizzare.</p>
          </div>
        ),
        duration: 15000, // 15 seconds
        action: {
          label: 'Apri Collegamenti',
          onClick: () => {
            // Navigate to settings broker tab
            window.location.href = '/dashboard/impostazioni?tab=collegamenti';
          },
        },
      }
    );
  }, [ownerId, anyConnected, anyNeedsUpdate, status]);

  return null;
}