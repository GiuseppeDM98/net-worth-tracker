/**
 * The Intesa Sanpaolo half of «Collegamenti» — a file import, not a live session.
 *
 * Intesa does not publish a read-only API for a retail portfolio, so the bridge is the `.xlsx`
 * report the user exports from the bank's site. The file is parsed in the BROWSER by the pure
 * layer (`intesaSanpaoloImport.ts`), previewed row by row, and only written after «Salva nel
 * patrimonio». New positions become assets labelled `exchange: 'Intesa Sanpaolo'`; a position
 * already tracked (same ISIN) gets its price repaired and its broker label confirmed, never its
 * ledger quantity. New funds also carry the published asset mix read from their ISIN (Yahoo's
 * `topHoldings`, through the shared per-ticker cache); an existing fund with an empty composition
 * is backfilled, while one the user already typed is never overwritten. The liquidity section
 * becomes one cash account, matched by its stable ticker.
 *
 * Only metadata is persisted in `brokerConnections/{ownerId}/brokers/intesa`: never the file.
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, FileSpreadsheet, Loader2, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Tile } from '@/components/ui/tile';
import { useAssets } from '@/lib/hooks/useAssets';
import { describeBrokerConnections } from '@/lib/utils/settingsNarrative';
import { formatCurrency, formatNumber, formatPercentageIt } from '@/lib/utils/formatters';
import { ASSET_CLASS_LABELS } from '@/lib/utils/allocationUtils';
import { fetchFundAllocations } from '@/lib/utils/fundAllocationClient';
import { queryKeys } from '@/lib/query/queryKeys';
import type { AssetComposition } from '@/types/assets';
import {
  INTESA_BROKER_NAME,
  buildIntesaImportPlan,
  type IntesaDiffKind,
  type IntesaImportPlan,
} from '@/lib/utils/intesaSanpaoloImport';
import { readIntesaWorkbookFile } from '@/lib/utils/intesaSanpaoloWorkbook';
import {
  getBrokerConnection,
  saveBrokerConnection,
  type BrokerConnection,
} from '@/lib/services/brokerConnectionService';
import { createAsset, updateAsset, updateAssetMetadata } from '@/lib/services/assetService';

interface IntesaSanpaoloConnectionTileProps {
  ownerId: string;
  /** Disables all mutations (demo mode). */
  disabled?: boolean;
}

const KIND_LABEL: Record<IntesaDiffKind, string> = {
  new: 'Nuovo',
  'price-update': 'Prezzo aggiornato',
  'drift-only': 'Scostamento quantità',
  'price-and-drift': 'Prezzo + scostamento',
  'composition-update': 'Composizione',
  unchanged: 'Invariato',
};

/** «72,70% Obbligazioni · 23,70% Azioni · 3,60% Liquidità» — the mix the import will store. */
function describeComposition(composition: AssetComposition[] | undefined): string {
  return (composition ?? [])
    .map(
      (leg) =>
        `${formatPercentageIt(leg.percentage, 2)} ${ASSET_CLASS_LABELS[leg.assetClass] ?? leg.assetClass}`
    )
    .join(' · ');
}

interface IntesaSaveResult {
  createdAssets: number;
  updatedPrices: number;
  filledCompositions: number;
}

/**
 * The whole write, in one module-level function so the component itself stays free of a
 * `try`/`catch` around value blocks (the React Compiler skips a component that has one).
 * The caller decides what a rejection means.
 */
async function persistIntesaImport(ownerId: string, plan: IntesaImportPlan): Promise<IntesaSaveResult> {
  let createdAssets = 0;
  let updatedPrices = 0;
  let filledCompositions = 0;
  for (const diff of plan.holdings) {
    if (diff.kind === 'new') {
      await createAsset(ownerId, diff.formData);
      createdAssets += 1;
      continue;
    }
    if (!diff.existingAssetId) continue;
    const shouldWritePrice = diff.kind === 'price-update' || diff.kind === 'price-and-drift';
    // The broker label is the one metadata the import repairs on an existing position. An
    // unchanged row with the right label and no composition to fill has nothing to write at all.
    if (!shouldWritePrice && !diff.exchangeUpdate && !diff.compositionUpdate) continue;
    // `updateAssetMetadata` never touches the ledger-derived quantity. taxRate and
    // displayTicker ride along so a price repair cannot clear a cost-basis rate or an alias.
    await updateAssetMetadata(diff.existingAssetId, {
      ...(shouldWritePrice ? { currentPrice: diff.position.price } : {}),
      ...(diff.compositionUpdate ? { composition: diff.formData.composition } : {}),
      exchange: INTESA_BROKER_NAME,
      taxRate: diff.existingTaxRate,
      displayTicker: diff.existingDisplayTicker ?? undefined,
    });
    if (shouldWritePrice) updatedPrices += 1;
    if (diff.compositionUpdate) filledCompositions += 1;
  }

  let cashAssetId: string | undefined;
  let cashBalance: number | undefined;
  if (plan.cash) {
    cashBalance = Math.round(plan.cash.balance * 100) / 100;
    if (plan.cash.existingAssetId) {
      await updateAsset(plan.cash.existingAssetId, { quantity: cashBalance });
      cashAssetId = plan.cash.existingAssetId;
    } else {
      cashAssetId = await createAsset(ownerId, {
        ticker: plan.cash.ticker,
        displayTicker: plan.cash.accountLabel ?? plan.cash.displayName,
        name: plan.cash.displayName,
        type: 'cash',
        assetClass: 'cash',
        currency: plan.cash.currency,
        quantity: cashBalance,
        currentPrice: 1,
        isLiquid: true,
        autoUpdatePrice: false,
        exchange: INTESA_BROKER_NAME,
      });
    }
  }

  await saveBrokerConnection(
    ownerId,
    {
      holdingsCount: plan.stats.holdingCount,
      skippedCount: plan.stats.skippedCount,
      ...(cashBalance !== undefined ? { cashBalance } : {}),
      ...(cashAssetId ? { cashAssetId } : {}),
      createdAssets,
      updatedPrices,
    },
    'intesa'
  );
  return { createdAssets, updatedPrices, filledCompositions };
}

export function IntesaSanpaoloConnectionTile({ ownerId, disabled = false }: IntesaSanpaoloConnectionTileProps) {
  const queryClient = useQueryClient();
  const { data: assetsData, isLoading: assetsLoading, isError: assetsFailed } = useAssets(ownerId);
  const assets = assetsData ?? [];
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [connection, setConnection] = useState<BrokerConnection | null>(null);
  const [loadingConnection, setLoadingConnection] = useState(true);
  const [connectionFailed, setConnectionFailed] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [plan, setPlan] = useState<IntesaImportPlan | null>(null);

  const loadConnection = useCallback(async () => {
    try {
      setConnection(await getBrokerConnection(ownerId, 'intesa'));
      setConnectionFailed(false);
    } catch (err) {
      console.error('[IntesaSanpaoloConnectionTile] connection read failed:', err);
      setConnectionFailed(true);
      toast.error('Impossibile caricare i collegamenti broker');
    }
    setLoadingConnection(false);
  }, [ownerId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadConnection();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadConnection]);

  const reset = () => {
    setPlan(null);
    setFileName('');
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || disabled) return;
    setFileName(file.name);
    setPlan(null);
    setError(null);
    setParsing(true);
    void readIntesaWorkbookFile(file)
      .then(async (workbook) => {
        // One extra round trip BEFORE the preview: Yahoo's published mix for every fund in the
        // report (from the shared per-ticker cache), so a hybrid fund is created already split
        // across classes instead of landing on one class by name. Fail-soft: an unread ISIN is
        // simply absent, and the row keeps the «classe da verificare» warning.
        const fundIsins = workbook.positions
          .filter((position) => position.section === 'fund')
          .map((position) => position.isin);
        const { allocations } = await fetchFundAllocations(fundIsins);
        return buildIntesaImportPlan(workbook, assets, allocations);
      })
      .then(
        (importPlan) => {
          setPlan(importPlan);
          toast.success('Anteprima pronta: controlla le righe prima di salvare.');
        },
        (err: unknown) => {
          setError(err instanceof Error ? err.message : 'File non leggibile: riprova.');
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      )
      .finally(() => setParsing(false));
  };

  const handleSave = () => {
    if (!plan || disabled) return;
    setSaving(true);
    void persistIntesaImport(ownerId, plan)
      .then(
        (result) => {
          queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(ownerId) });
          queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.overview(ownerId) });
          // `reset` also empties the file input, so choosing the same workbook again fires
          // `change` instead of looking like a no-op.
          reset();
          void loadConnection();
          toast.success(
            `Import salvato: ${result.createdAssets} nuovi asset, ${result.updatedPrices} prezzi aggiornati${
              result.filledCompositions > 0
                ? `, ${result.filledCompositions} composizioni lette dall'ISIN`
                : ''
            }.`
          );
        },
        (err: unknown) => {
          console.error('[IntesaSanpaoloConnectionTile] save failed:', err);
          // A partial save may have created assets already: reload and drop the preview so a retry
          // resolves the positions against what actually exists instead of duplicating them.
          reset();
          queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(ownerId) });
          toast.error('Salvataggio non riuscito: riprova con Carica file XLSX.');
        }
      )
      .finally(() => setSaving(false));
  };

  const reading = loadingConnection
    ? null
    : connectionFailed
      ? [{ text: 'Lettura del collegamento non riuscita: puoi comunque caricare il file XLSX.' }]
      : describeBrokerConnections('intesa', {
          lastSyncAt: connection?.lastSyncAt.toISOString(),
          holdingsCount: connection?.holdingsCount,
          cashBalance: connection?.cashBalance,
        });

  const busy = parsing || saving;
  const disabledAll = disabled || busy || assetsLoading || assetsFailed;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Tile
        eyebrow="Intesa Sanpaolo"
        aside={
          loadingConnection
            ? undefined
            : connectionFailed
              ? 'non letto'
              : connection
                ? 'importato'
                : 'non importato'
        }
        reading={reading}
      >
        <div className="mt-3 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={disabledAll}
              className="h-10"
            >
              {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {parsing ? 'Lettura…' : 'Carica file XLSX'}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={handleFile}
              aria-label="Carica il file XLSX del portafoglio Intesa Sanpaolo"
            />
            {disabled && (
              <span className="text-xs text-muted-foreground">
                Modalità demo: importazione disattivata.
              </span>
            )}
          </div>

          <p className="text-[11px] leading-[1.45] text-muted-foreground">
            Solo file <span className="font-mono">.xlsx</span> esportati dal portafoglio Intesa
            Sanpaolo. Le posizioni nuove vengono create, quelle già tracciate (stesso ISIN) ricevono
            prezzo e nome del broker; la liquidità diventa un conto a parte. Per i fondi la
            composizione viene letta dall&apos;ISIN (Yahoo) e scomposta per classe in «Composizione»;
            una composizione già inserita a mano non viene mai sovrascritta.
          </p>

          {assetsFailed && (
            <p role="alert" className="text-[13px] leading-[1.45] text-destructive">
              Non è stato possibile leggere gli asset: l&apos;anteprima non potrebbe distinguere le
              posizioni nuove da quelle già tracciate. Ricarica la pagina e riprova.
            </p>
          )}

          {error && (
            <p role="alert" className="text-[13px] leading-[1.45] text-destructive">
              {error}
            </p>
          )}

          {plan && (
            <div className="flex flex-col gap-2 border-t border-border pt-3">
              <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                <FileSpreadsheet className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{fileName}</span>
              </div>
              <p className="text-[13px] font-medium">
                Anteprima: {plan.stats.newCount} nuovi, {plan.stats.priceUpdateCount} prezzi da
                aggiornare
                {plan.stats.compositionUpdateCount > 0 &&
                  `, ${plan.stats.compositionUpdateCount} composizioni da completare`}
                {plan.stats.driftCount > 0 && `, ${plan.stats.driftCount} scostamenti di quantità`}
                {plan.stats.unchangedCount > 0 && `, ${plan.stats.unchangedCount} invariati`}
                {plan.stats.skippedCount > 0 && `, ${plan.stats.skippedCount} righe scartate`}.
              </p>

              <ul className="flex max-h-72 flex-col overflow-y-auto">
                {plan.holdings.map((diff) => {
                  // Only a mix this import will actually STORE is announced: an existing position
                  // with its own composition keeps it, and showing Yahoo's fresher one would lie.
                  const compositionLabel =
                    diff.kind === 'new' || diff.compositionUpdate
                      ? describeComposition(diff.formData.composition)
                      : '';
                  const hasComposition = compositionLabel !== '';
                  return (
                    <li
                      key={diff.position.isin}
                      className="flex items-baseline justify-between gap-3 border-b border-border py-1.5 text-[13px]"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{diff.position.name}</span>
                        <span className="block font-mono text-[11px] text-muted-foreground">
                          {diff.position.isin} · {formatNumber(diff.position.quantity)} quote ·{' '}
                          {formatNumber(diff.position.price)} EUR
                          {diff.position.marketValue !== undefined &&
                            ` · ${formatCurrency(diff.position.marketValue)}`}
                        </span>
                        {hasComposition && (
                          <span className="block text-[12px] text-muted-foreground">
                            Composizione dall&apos;ISIN: {compositionLabel}
                          </span>
                        )}
                        {diff.typeUncertain && !hasComposition && (
                          <span className="block text-[12px] text-warning-foreground">
                            {diff.kind === 'new'
                              ? 'Classe non deducibile dal nome: proposta azionaria, verifica su Patrimonio.'
                              : 'Classe proposta dal nome e composizione non disponibile: verifica su Patrimonio.'}
                          </span>
                        )}
                        {(diff.kind === 'drift-only' || diff.kind === 'price-and-drift') && (
                          <span className="block text-[12px] text-warning-foreground">
                            Nel Registro: scostamento di {formatNumber(diff.quantityDrift)} quote — da
                            riconciliare a mano.
                          </span>
                        )}
                      </span>
                      <span className="flex-none text-[12px] text-muted-foreground">
                        {KIND_LABEL[diff.kind]}
                      </span>
                    </li>
                  );
                })}
              </ul>

              {plan.cash && (
                <p className="rounded-lg bg-muted p-3 text-[13px] leading-[1.45]">
                  Liquidità rilevata:{' '}
                  <span className="font-mono">{formatCurrency(plan.cash.balance)}</span> —{' '}
                  {plan.cash.existingAssetId ? 'aggiorna' : 'crea'} «{plan.cash.displayName}»
                  {plan.cash.accountLabel ? ` (${plan.cash.accountLabel})` : ''}.
                </p>
              )}

              {plan.warnings.length > 0 && (
                <div className="flex flex-col gap-1">
                  {plan.warnings.map((warning, index) => (
                    <p
                      key={index}
                      className="flex items-start gap-1.5 text-[12px] leading-[1.45] text-warning-foreground"
                    >
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>{warning}</span>
                    </p>
                  ))}
                </div>
              )}

              <div className="mt-auto flex flex-wrap gap-2 border-t border-border pt-3">
                <Button
                  onClick={handleSave}
                  disabled={saving || (plan.holdings.length === 0 && !plan.cash)}
                  className="h-10"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {saving ? 'Salvataggio…' : 'Salva nel patrimonio'}
                </Button>
                <Button variant="outline" onClick={reset} disabled={saving} className="h-10">
                  <Trash2 className="h-4 w-4" />
                  Scarta
                </Button>
              </div>
            </div>
          )}
        </div>
      </Tile>
    </div>
  );
}
