/**
 * Broker connections — the «Collegamenti» tab: read-only sync from the brokers this app speaks to.
 *
 * Three providers, three components, one rule: an import only ever READS. Scalable goes through the
 * `sc` CLI on the hosting machine and can be rebuilt from pasted JSON when the binary is missing;
 * Trade Republic is reached over HTTP with a session this server holds; Intesa Sanpaolo is a file
 * import (its `.xlsx` portfolio export) parsed in the browser. None writes to the broker, and each
 * says so in its own tile.
 *
 * The providers are siblings rather than a switch inside one component: the shared part is a
 * `Tile` with a reading, a preview and a save, and everything else — how the session is obtained,
 * what the payload contains, which figures can be written — differs per broker. Folding them into
 * one file produced a 700-line component with a `broker ===` in every branch.
 */

'use client';

import { ScalableConnectionTile } from '@/components/settings/broker/ScalableConnectionTile';
import { TradeRepublicConnectionTile } from '@/components/settings/broker/TradeRepublicConnectionTile';
import { IntesaSanpaoloConnectionTile } from '@/components/settings/broker/IntesaSanpaoloConnectionTile';
import { AzimutConnectionTile } from '@/components/settings/broker/AzimutConnectionTile';
import { BinanceConnectionTile } from '@/components/settings/broker/BinanceConnectionTile';

interface BrokerConnectionsSectionProps {
  ownerId: string;
  /** Disables all mutations (demo mode). */
  disabled?: boolean;
}

export function BrokerConnectionsSection({ ownerId, disabled = false }: BrokerConnectionsSectionProps) {
  return (
    // `items-start` so each provider's column keeps its natural height: the Scalable column is
    // two tiles and the others are single shorter tiles, and a stretched grid item would leave a
    // void it does not own.
    <div className="grid grid-cols-1 items-start gap-3 desktop:grid-cols-2">
      <ScalableConnectionTile ownerId={ownerId} disabled={disabled} />
      <TradeRepublicConnectionTile ownerId={ownerId} disabled={disabled} />
      <IntesaSanpaoloConnectionTile ownerId={ownerId} disabled={disabled} />
      <AzimutConnectionTile ownerId={ownerId} disabled={disabled} />
      <BinanceConnectionTile ownerId={ownerId} disabled={disabled} />
    </div>
  );
}
