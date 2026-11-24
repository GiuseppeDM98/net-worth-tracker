/**
 * The closed group at the bottom of Strumenti: the instruments sold out that have a history in the
 * Registro operazioni (owner, 2026-11-23). ONE component at both widths — the table's
 * and the phone rows' tile body end with it — because a disclosure of a few buttons needs no
 * second layout; only the buttons' height changes below `desktop:`.
 *
 * A grouped row has no «Modifica» and no trash: it cannot be deleted by rule, and a re-purchase
 * ({@link ArchivedInstrumentsProps.onRegisterTrade}) brings it back to the list. Not a roving-focus
 * list: the group is short and each row is two plain buttons, like a tile's footer actions.
 */
'use client';

import { useId } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { Asset } from '@/types/assets';
import { getAssetDisplayTicker } from '@/lib/utils/assetDisplay';
import { describeArchiveGroup, describeSoldOn, type LedgerFootprint } from '@/lib/utils/instrumentArchive';
import { Button } from '@/components/ui/button';

interface ArchivedInstrumentsProps {
  /** Already ordered, newest sale first (`splitArchivedInstruments`). */
  assets: readonly Asset[];
  footprints: ReadonlyMap<string, LedgerFootprint> | null;
  open: boolean;
  onToggle: () => void;
  isDemo: boolean;
  onMovements: (asset: Asset) => void;
  onRegisterTrade: (asset: Asset) => void;
}

const ACTION_CLASS = 'h-8 px-2 text-[12px] max-desktop:h-11';

export function ArchivedInstruments({ assets, footprints, open, onToggle, isDemo, onMovements, onRegisterTrade }: ArchivedInstrumentsProps) {
  const listId = useId();
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <div className="mt-3 border-t border-border pt-1">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={listId}
        className="flex min-h-9 w-full items-center gap-2 rounded-sm text-left text-[12px] font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-desktop:min-h-11"
      >
        <Chevron className="h-3.5 w-3.5" aria-hidden="true" />
        {describeArchiveGroup(assets.length)}
      </button>
      <ul id={listId} hidden={!open} className="divide-y divide-border">
        {open &&
          assets.map((asset) => {
            const ticker = getAssetDisplayTicker(asset);
            return (
              <li key={asset.id} className="flex items-center justify-between gap-3 py-1.5">
                <div className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-foreground">{asset.name}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {ticker && ticker !== asset.name && <span className="font-mono">{ticker} · </span>}
                    {describeSoldOn(footprints?.get(asset.id))}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <Button type="button" variant="ghost" size="sm" className={ACTION_CLASS} onClick={() => onMovements(asset)} aria-label={`Movimenti di ${asset.name}`}>
                    Movimenti
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={ACTION_CLASS}
                    onClick={() => onRegisterTrade(asset)}
                    disabled={isDemo}
                    title={isDemo ? 'Non disponibile in modalità demo' : undefined}
                    aria-label={`Compra ${asset.name}`}
                  >
                    Compra
                  </Button>
                </div>
              </li>
            );
          })}
      </ul>
    </div>
  );
}
