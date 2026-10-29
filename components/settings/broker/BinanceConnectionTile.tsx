/**
 * The Binance half of «Collegamenti» — read-only sync of the three wallets (Spot, Funding, Simple
 * Earn), every coin tracked as a `crypto` asset labelled «Binance».
 *
 * Same shape as its Trade Republic sibling: an explicit preview, then a save through the standard
 * asset services. The differences are forced by the broker:
 *   - there is NO login to drive: the API key lives in the server environment, so the tile only
 *     reads, and says so when the server has no key (503);
 *   - the quantity and the cost basis are the Registro's, as everywhere: the save creates the NEW
 *     coins and refreshes the price of the manually priced ones, and a mismatch is a warning;
 *   - no cash account and no savings plans: Binance's fiat balance is out of scope;
 *   - the cost basis (and so the P/L) comes from the history, valued in EUR at the day, which becomes
 *   BUY/SELL in the Registro, idempotent like the other brokers.
 *
 * ONE button, two steps: «Sincronizza» reads the wallets, saves the new coins and prices, and THEN
 * imports the operations (the coins must exist first, or the trades have no instrument to land on).
 * There is no intermediate preview: the server re-derives the trade plan from the CURRENT ledger and
 * writes only the importable rows, and everything it could not do is listed in the result.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Tile } from '@/components/ui/tile';
import { describeBrokerConnections } from '@/lib/utils/settingsNarrative';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import { errorMessage } from '@/lib/utils/errorMessage';
import { formatNumberIt } from '@/lib/utils/formatters';
import { applyBrokerTrades, fetchBrokerTradePreview } from '@/lib/services/brokerTradeImportService';
import { queryKeys } from '@/lib/query/queryKeys';
import {
  buildBinanceImportPlan,
  type BinanceHoldingInput,
  type BinanceImportPlan,
} from '@/lib/utils/binanceImport';
import {
  getBrokerConnection,
  saveBrokerConnection,
  type BrokerConnection,
} from '@/lib/services/brokerConnectionService';
import { createAsset, getAllAssets, updateAsset } from '@/lib/services/assetService';

interface BinanceConnectionTileProps {
  ownerId: string;
  /** Disables all mutations (demo mode). */
  disabled?: boolean;
}

const BROKER = 'binance' as const;

async function readBinance(
  ownerId: string
): Promise<{ holdings: BinanceHoldingInput[]; warnings: string[] }> {
  const response = await authenticatedFetch('/api/broker/binance/read', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ownerId }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof data?.error === 'string' ? data.error : 'Lettura non riuscita: riprova.');
  }
  // A missing key is a CONTRACT break, not an empty reading: it would read as «zero monete».
  if (!Array.isArray(data?.holdings)) throw new Error('Lettura delle posizioni non riuscita: riprova.');
  return {
    holdings: data.holdings as BinanceHoldingInput[],
    warnings: Array.isArray(data.warnings) ? (data.warnings as string[]) : [],
  };
}

/** Writes the plan's new coins and moved prices; returns what it did, for the toast and the metadata. */
async function applyPlan(
  ownerId: string,
  plan: BinanceImportPlan
): Promise<{ createdAssets: number; updatedPrices: number }> {
  let createdAssets = 0;
  let updatedPrices = 0;
  for (const diff of plan.holdings) {
    if (diff.kind === 'new') {
      await createAsset(ownerId, diff.formData);
      createdAssets += 1;
    } else if (diff.kind === 'price-update' && diff.existingAssetId && diff.holding.price !== undefined) {
      await updateAsset(diff.existingAssetId, { currentPrice: diff.holding.price });
      updatedPrices += 1;
    }
  }
  return { createdAssets, updatedPrices };
}

interface SyncResult {
  plan: BinanceImportPlan;
  /** Operations written to the Registro; `null` when the history could not be read or applied. */
  imported: number | null;
  failedTrades: number;
  notes: string[];
}

function savedMessage(createdAssets: number, updatedPrices: number, imported: number | null): string {
  const prices = updatedPrices > 0 ? `, ${updatedPrices} prezzi aggiornati` : '';
  const trades = imported !== null ? `, ${imported} operazioni importate` : '';
  return `Sincronizzazione completata: ${createdAssets} nuovi asset${prices}${trades}.`;
}

export function BinanceConnectionTile({ ownerId, disabled = false }: BinanceConnectionTileProps) {
  const queryClient = useQueryClient();
  const [connection, setConnection] = useState<BrokerConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** What the running sync is doing now, for the status line. */
  const [step, setStep] = useState<string | null>(null);
  const [result, setResult] = useState<SyncResult | null>(null);

  const loadAll = useCallback(async () => {
    try {
      setConnection(await getBrokerConnection(ownerId, BROKER));
    } catch (err) {
      console.error('[BinanceConnectionTile] load failed:', err);
      toast.error('Impossibile caricare i collegamenti broker');
    }
    setLoading(false);
  }, [ownerId]);

  useEffect(() => {
    // Deferred so the effect body itself sets no state (react-hooks/set-state-in-effect).
    const timer = setTimeout(() => {
      void loadAll();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadAll]);

  const handleSync = async () => {
    if (disabled) return;
    setSyncing(true);
    setError(null);
    setResult(null);
    setStep('Lettura dei wallet Binance…');
    let wroteSomething = false;
    try {
      // Step 1 — the wallets. A fresh read of the assets, not the state: a previous run may have
      // created coins this component has not re-read, and a stale list would create duplicates.
      const [{ holdings, warnings }, currentAssets] = await Promise.all([
        readBinance(ownerId),
        getAllAssets(ownerId),
      ]);
      const plan = buildBinanceImportPlan(holdings, currentAssets);
      setStep('Salvataggio di monete e prezzi…');
      const { createdAssets, updatedPrices } = await applyPlan(ownerId, plan);
      wroteSomething = createdAssets + updatedPrices > 0;

      // Step 2 — the history. Its failure must not undo step 1: the coins are saved, and the
      // result says the operations are the part still to do.
      let imported: number | null = null;
      let failedTrades = 0;
      const notes = [...warnings, ...plan.warnings];
      try {
        setStep('Lettura dello storico operazioni (può richiedere un minuto)…');
        const preview = await fetchBrokerTradePreview(ownerId, BROKER);
        const byReason = new Map<string, number>();
        for (const skip of preview.skipped) byReason.set(skip.reason, (byReason.get(skip.reason) ?? 0) + 1);
        notes.push(
          `Storico Binance: ${preview.brokerCount} operazioni leggibili, ${preview.toImport.length} da importare, ${preview.alreadyImported.length} già presenti, ${preview.parserSkipped.length} escluse in lettura` +
            (byReason.size > 0 ? `, non compatibili: ${[...byReason].map(([reason, n]) => `${reason} ${n}`).join(', ')}.` : '.')
        );
        // Always applied, even with nothing new: the server also aligns the Registro to the balance.
        {
          setStep(
            preview.toImport.length > 0
              ? `Importazione di ${preview.toImport.length} operazioni nel registro…`
              : 'Allineamento ai saldi Binance…'
          );
          const written = await applyBrokerTrades(
            ownerId,
            BROKER,
            preview.toImport.map((row) => row.trade.sourceRef)
          );
          wroteSomething = wroteSomething || written.imported > 0 || (written.reconciled ?? 0) > 0;
          imported = written.imported;
          failedTrades = written.failed.length;
          if (written.reconciled) notes.push(`${written.reconciled} monete allineate al saldo Binance con una rettifica (depositi e trasferimenti non sono nello storico).`);
          notes.push(...written.failed.map((failure) => `${failure.sourceRef} — ${failure.message}`));
        }
        if (preview.skipped.length > 0) {
          notes.push(
            `${preview.skipped.length} operazioni non compatibili col registro: ${preview.skipped
              .slice(0, 3)
              .map((skip) => `${skip.trade.label} (${skip.message})`)
              .join('; ')}${preview.skipped.length > 3 ? '…' : ''}`
          );
        }
      } catch (err) {
        console.error('[BinanceConnectionTile] trade import failed:', err);
        notes.push(`Operazioni non importate: ${errorMessage(err, 'riprova con Sincronizza.')}`);
      }

      await saveBrokerConnection(
        ownerId,
        { holdingsCount: plan.stats.holdingCount, createdAssets, updatedPrices },
        BROKER
      );
      setResult({ plan, imported, failedTrades, notes });
      if (imported === null || failedTrades > 0) {
        toast.warning(savedMessage(createdAssets, updatedPrices, imported));
      } else {
        toast.success(savedMessage(createdAssets, updatedPrices, imported));
      }
    } catch (err) {
      setError(errorMessage(err, 'Sincronizzazione non riuscita: riprova.'));
    }
    // After the try/catch rather than in a `finally`: the React Compiler cannot lower one.
    setStep('Aggiornamento dei dati…');
    if (wroteSomething) {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.assetTransactions.all(ownerId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(ownerId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.overview(ownerId) }),
      ]);
    }
    await loadAll();
    setStep(null);
    setSyncing(false);
  };

  const reading = loading
    ? null
    : describeBrokerConnections(BROKER, {
        lastSyncAt: connection?.lastSyncAt.toISOString(),
        holdingsCount: connection?.holdingsCount,
      });

  return (
    <Tile eyebrow="Binance" aside={loading ? undefined : connection ? 'letto' : 'mai letto'} reading={reading}>
      <div className="mt-3 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={handleSync} disabled={disabled || syncing || loading} className="h-10">
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {syncing ? 'Sincronizzazione…' : 'Sincronizza'}
          </Button>
          {disabled && (
            <span className="text-xs text-muted-foreground">Modalità demo: sincronizzazione disattivata.</span>
          )}
        </div>

        {syncing && step && (
          <div role="status" aria-live="polite" className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5">
            <Loader2 className="size-6 flex-none animate-spin text-primary" aria-hidden />
            <span className="text-[13px]">{step}</span>
          </div>
        )}

        {error && (
          <p role="alert" className="text-[13px] leading-[1.45] text-destructive">
            {error}
          </p>
        )}

        {result && (
          <div className="flex flex-col gap-2">
            <p className="text-[13px] font-medium">
              {result.plan.stats.newCount} nuovi
              {result.plan.stats.priceUpdateCount > 0 && `, ${result.plan.stats.priceUpdateCount} prezzi aggiornati`}
              {result.plan.stats.driftCount > 0 && `, ${result.plan.stats.driftCount} scostamenti di quantità`}
              {result.plan.stats.unchangedCount > 0 && `, ${result.plan.stats.unchangedCount} invariati`}
              {result.plan.stats.skippedCount > 0 && `, ${result.plan.stats.skippedCount} non creati`}
              {result.imported !== null && ` · ${result.imported} operazioni importate`}
              {result.failedTrades > 0 && `, ${result.failedTrades} non riuscite`}.
            </p>

            {result.plan.holdings.some((diff) => diff.kind === 'drift-only') && (
              <ul className="flex flex-col gap-1">
                {result.plan.holdings
                  .filter((diff) => diff.kind === 'drift-only')
                  .map((diff) => (
                    <li key={diff.holding.asset} className="text-[12px] text-warning-foreground">
                      {diff.holding.asset}: nel Registro scostamento di {formatNumberIt(diff.quantityDrift, 8)} — da
                      riconciliare a mano.
                    </li>
                  ))}
              </ul>
            )}

            {result.notes.length > 0 && (
              <ul className="flex flex-col gap-1">
                {result.notes.map((note, index) => (
                  <li key={index} className="text-[12px] leading-[1.45] text-muted-foreground">
                    {note}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Tile>
  );
}
