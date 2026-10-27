/**
 * The Azimut half of «Collegamenti» — a file import, not a live session.
 *
 * Azimut does not publish a read-only API for a retail portfolio, so the bridge is the `.xlsx`
 * report the user exports from the bank's site. The file is parsed in the BROWSER by the pure
 * layer (`azimutImport.ts`), previewed row by row, and only written after «Salva nel
 * patrimonio». New positions become assets labelled `exchange: 'Azimut'`; a position
 * already tracked gets its price repaired and its broker label confirmed, never its
 * ledger quantity. New funds also carry the published asset mix read from their ISIN, or from the
 * Bloomberg ticker the file prints when it has no ISIN (Yahoo's `topHoldings`, through the shared
 * per-ticker cache); a GESTITO row has NEITHER, so its product name is first searched on EODHD
 * (`GET /api/portfolio/fund-identity`) and the unique ISIN it answers with is both the identity the
 * position is saved under and the key its mix is then read by. An existing fund with an empty
 * composition is backfilled, and one with no ISIN gets the one the name found — while a
 * composition or an ISIN the user already typed is never overwritten. The liquidity section
 * becomes one cash account, matched by its stable ticker.
 *
 * A row the market could not class (no published mix, no identity) takes the class its name
 * suggests (`inferFundClassFromName`) and the preview row says it was deduced; a row that updates a
 * tracked asset keeps the class already stored — the import never overwrites it
 * (doc/guide/collegamenti.md → La classe dal nome).
 *
 * Only metadata is persisted in `brokerConnections/{ownerId}/brokers/azimut`: never the file.
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, FileSpreadsheet, Loader2, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tile } from '@/components/ui/tile';
import { assetsQueryOptions, useAssets } from '@/lib/hooks/useAssets';
import { describeBrokerConnections } from '@/lib/utils/settingsNarrative';
import { formatCurrency, formatNumber } from '@/lib/utils/formatters';
import { ASSET_CLASS_LABELS } from '@/lib/utils/allocationUtils';
import { describeFundComposition } from '@/lib/utils/fundCompositionLabel';
import { fetchFundAllocations } from '@/lib/utils/fundAllocationClient';
import { fetchFundIdentities } from '@/lib/utils/fundIdentityClient';
import { queryKeys } from '@/lib/query/queryKeys';
import {
  AZIMUT_BROKER_NAME,
  azimutAllocationLookup,
  buildAzimutImportPlan,
  needsFundIdentity,
  type AzimutDiffKind,
  type AzimutImportPlan,
} from '@/lib/utils/azimutImport';
import { readAzimutWorkbookFile } from '@/lib/utils/azimutWorkbook';
import {
  getBrokerConnection,
  saveBrokerConnection,
  type BrokerConnection,
} from '@/lib/services/brokerConnectionService';
import { createAsset, updateAsset, updateAssetMetadata } from '@/lib/services/assetService';

interface AzimutConnectionTileProps {
  ownerId: string;
  /** Disables all mutations (demo mode). */
  disabled?: boolean;
}

const KIND_LABEL: Record<AzimutDiffKind, string> = {
  new: 'Nuovo',
  'price-update': 'Prezzo aggiornato',
  'drift-only': 'Scostamento quantità',
  'price-and-drift': 'Prezzo + scostamento',
  'composition-update': 'Composizione',
  'identity-update': 'ISIN aggiunto',
  unchanged: 'Invariato',
};


interface AzimutSaveResult {
  createdAssets: number;
  updatedPrices: number;
  filledCompositions: number;
  filledIsins: number;
}

async function persistAzimutImport(ownerId: string, plan: AzimutImportPlan): Promise<AzimutSaveResult> {
  let createdAssets = 0;
  let updatedPrices = 0;
  let filledCompositions = 0;
  let filledIsins = 0;
  for (const diff of plan.holdings) {
    if (diff.kind === 'new') {
      await createAsset(ownerId, diff.formData);
      createdAssets += 1;
      continue;
    }
    if (!diff.existingAssetId) continue;
    const shouldWritePrice = diff.kind === 'price-update' || diff.kind === 'price-and-drift';
    if (!shouldWritePrice && !diff.exchangeUpdate && !diff.compositionUpdate && !diff.isinUpdate) continue;
    await updateAssetMetadata(diff.existingAssetId, {
      ...(shouldWritePrice ? { currentPrice: diff.position.price } : {}),
      ...(diff.compositionUpdate ? { composition: diff.formData.composition } : {}),
      ...(diff.isinUpdate && diff.formData.isin ? { isin: diff.formData.isin } : {}),
      exchange: AZIMUT_BROKER_NAME,
      taxRate: diff.existingTaxRate,
      displayTicker: diff.existingDisplayTicker ?? undefined,
    });
    if (shouldWritePrice) updatedPrices += 1;
    if (diff.compositionUpdate) filledCompositions += 1;
    if (diff.isinUpdate) filledIsins += 1;
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
        exchange: AZIMUT_BROKER_NAME,
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
    'azimut'
  );
  return { createdAssets, updatedPrices, filledCompositions, filledIsins };
}

export function AzimutConnectionTile({ ownerId, disabled = false }: AzimutConnectionTileProps) {
  const queryClient = useQueryClient();
  const { isLoading: assetsLoading, isError: assetsFailed } = useAssets(ownerId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [connection, setConnection] = useState<BrokerConnection | null>(null);
  const [loadingConnection, setLoadingConnection] = useState(true);
  const [connectionFailed, setConnectionFailed] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [plan, setPlan] = useState<AzimutImportPlan | null>(null);
  const [identitySearchFailed, setIdentitySearchFailed] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);

  const loadConnection = useCallback(async () => {
    try {
      setConnection(await getBrokerConnection(ownerId, 'azimut'));
      setConnectionFailed(false);
    } catch (err) {
      console.error('[AzimutConnectionTile] connection read failed:', err);
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

  const busy = parsing || saving;
  const disabledAll = disabled || busy || assetsLoading || assetsFailed;

  const reset = () => {
    setPlan(null);
    setIdentitySearchFailed(false);
    setFileName('');
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const processFile = useCallback(
    (file: File) => {
      if (disabled || busy || assetsLoading || assetsFailed) return;
      setFileName(file.name);
      setPlan(null);
        setIdentitySearchFailed(false);
      setError(null);
      setParsing(true);
      void readAzimutWorkbookFile(file)
        .then(async (workbook) => {
          // Two rounds, because the second DEPENDS on the first.
          //
          // 1. Names: a fund the file gives no code for (the GESTITO sheet prints nothing but the
          //    product name) is asked about by that name, and the ISIN EODHD answers with is the
          //    identity it will be saved under.
          // 2. Mixes: the codes the file printed, plus the ISINs the names resolved to — a fund
          //    whose name yields a unique ISIN can then be classed from its published mix.
          const identityNames = workbook.positions
            .filter(needsFundIdentity)
            .map((position) => position.name);
          const identityLookup = await fetchFundIdentities(identityNames);
          const resolvedIsins = Object.values(identityLookup.byName).flatMap((result) =>
            result.status === 'matched' && result.identity ? [result.identity.isin] : []
          );

          const lookups = workbook.positions.map(azimutAllocationLookup);
          const fundIsins = [
            ...lookups.flatMap((lookup) => (lookup.isin ? [lookup.isin] : [])),
            ...resolvedIsins,
          ];
          const fundTickers = lookups.flatMap((lookup) => (lookup.ticker ? [lookup.ticker] : []));
          const { allocations } = await fetchFundAllocations(fundIsins, fundTickers);
          // The assets the plan matches against must be the CURRENT ones: the hook's list can be
          // a snapshot (the persisted cache restores the last one), and a plan built on a stale
          // list calls every tracked position NEW — and creates it a second time. The import is
          // a write path: it reads the assets as they are (`staleTime: 0`).
          const currentAssets = await queryClient.fetchQuery({
            ...assetsQueryOptions(ownerId),
            staleTime: 0,
          });
          return {
            plan: buildAzimutImportPlan(workbook, currentAssets, allocations, identityLookup.byName),
            identitySearchFailed: identityLookup.failedChunks > 0,
          };
        })
        .then(
          ({ plan: importPlan, identitySearchFailed: searchFailed }) => {
            setPlan(importPlan);
            setIdentitySearchFailed(searchFailed);
            toast.success('Anteprima pronta: controlla le righe prima di salvare.');
          },
          (err: unknown) => {
            setError(err instanceof Error ? err.message : 'File non leggibile: riprova.');
            if (fileInputRef.current) fileInputRef.current.value = '';
          }
        )
        .finally(() => setParsing(false));
    },
    [disabled, busy, assetsLoading, assetsFailed, ownerId, queryClient]
  );

  const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (disabledAll) return;
    dragCounterRef.current += 1;
    if (event.dataTransfer.items && event.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (disabledAll) return;
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDragging(false);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    dragCounterRef.current = 0;
    if (disabledAll) return;

    const file = event.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleSave = () => {
    if (!plan || disabled) return;
    setSaving(true);
    void persistAzimutImport(ownerId, plan)
      .then(
        (result) => {
          queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(ownerId) });
          queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.overview(ownerId) });
          reset();
          void loadConnection();
          toast.success(
            `Import salvato: ${result.createdAssets} nuovi asset, ${result.updatedPrices} prezzi aggiornati${
              result.filledCompositions > 0
                ? `, ${result.filledCompositions} composizioni lette dall'ISIN`
                : ''
            }${result.filledIsins > 0 ? `, ${result.filledIsins} ISIN aggiunti` : ''}.`
          );
        },
        (err: unknown) => {
          console.error('[AzimutConnectionTile] save failed:', err);
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
      : describeBrokerConnections('azimut', {
          lastSyncAt: connection?.lastSyncAt.toISOString(),
          holdingsCount: connection?.holdingsCount,
          cashBalance: connection?.cashBalance,
        });

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        'relative flex min-w-0 flex-col gap-3 rounded-2xl transition-all',
        isDragging && 'ring-2 ring-primary ring-offset-2'
      )}
    >
      {isDragging && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-primary bg-card/95 p-4 text-center backdrop-blur-xs transition-all">
          <Upload className="h-8 w-8 animate-bounce text-primary" aria-hidden="true" />
          <p className="mt-2 text-[14px] font-semibold text-foreground">
            Rilascia qui il file XLSX
          </p>
          <p className="text-[12px] text-muted-foreground">
            Esportazione portafoglio Azimut (.xlsx)
          </p>
        </div>
      )}
      <Tile
        eyebrow="Azimut"
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
              aria-label="Carica il file XLSX del portafoglio Azimut"
            />
            {disabled && (
              <span className="text-xs text-muted-foreground">
                Modalità demo: importazione disattivata.
              </span>
            )}
          </div>

          <p className="text-[11px] leading-[1.45] text-muted-foreground">
            Solo file <span className="font-mono">.xlsx</span> esportati dal portafoglio Azimut.
            Importa posizioni da Gestito, Economia Reale, Amministrato (azioni, obbligazioni, ETF) e Liquidità.
            La composizione si legge dall&apos;ISIN o dal codice ticker tra parentesi. Il foglio
            Gestito non riporta né l&apos;uno né l&apos;altro: il nome del prodotto viene cercato su
            EODHD, e l&apos;ISIN trovato — solo se univoco — diventa l&apos;identità della posizione;
            dove nessun mix è pubblicato la classe si deduce dal nome del fondo.
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
                {plan.stats.isinUpdateCount > 0 && `, ${plan.stats.isinUpdateCount} ISIN da aggiungere`}
                {plan.stats.driftCount > 0 && `, ${plan.stats.driftCount} scostamenti di quantità`}
                {plan.stats.unchangedCount > 0 && `, ${plan.stats.unchangedCount} invariati`}
                {plan.stats.skippedCount > 0 && `, ${plan.stats.skippedCount} righe scartate`}.
              </p>

              {identitySearchFailed && (
                <p className="text-[12px] leading-[1.45] text-warning-foreground">
                  Ricerca ISIN non disponibile (EODHD): le posizioni si importano lo stesso e i
                  fondi senza codice prendono la classe dal nome.
                </p>
              )}

              <ul className="flex max-h-72 flex-col overflow-y-auto">
                {plan.holdings.map((diff) => {
                  const compositionLabel =
                    diff.kind === 'new' || diff.compositionUpdate
                      ? describeFundComposition(diff.formData.composition)
                      : '';
                  const hasComposition = compositionLabel !== '';
                  // A product name is no ticker: GESTITO rows have no code in the file, and printing
                  // the name twice reads as if the app had found one. `formData.isin` is the ISIN the
                  // name lookup found, when it did.
                  const displayCode =
                    diff.position.isin ??
                    diff.formData.isin ??
                    (diff.position.ticker !== diff.position.name ? diff.position.ticker : undefined) ??
                    '—';
                  return (
                    <li
                      key={diff.position.id}
                      className="flex items-baseline justify-between gap-3 border-b border-border py-1.5 text-[13px]"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{diff.position.name}</span>
                        <span className="block font-mono text-[11px] text-muted-foreground">
                          {displayCode} · {formatNumber(diff.position.quantity)} quote ·{' '}
                          {formatNumber(diff.position.price)} EUR
                          {diff.position.marketValue !== undefined &&
                            ` · ${formatCurrency(diff.position.marketValue)}`}
                        </span>
                        {hasComposition && (
                          <span className="block text-[12px] text-muted-foreground">
                            Composizione pubblicata: {compositionLabel}
                          </span>
                        )}
                        {diff.kind === 'new' && !hasComposition && (
                          <span
                            className={cn(
                              'block text-[12px]',
                              diff.classGuessed ? 'text-warning-foreground' : 'text-muted-foreground'
                            )}
                          >
                            Classe: {ASSET_CLASS_LABELS[diff.formData.assetClass] ?? diff.formData.assetClass}
                            {diff.classGuessed && ' — dedotta dal nome, verificala su Patrimonio'}
                          </span>
                        )}
                        {diff.storedAssetClass && (
                          <span className="block text-[12px] text-muted-foreground">
                            Classe: {ASSET_CLASS_LABELS[diff.storedAssetClass] ?? diff.storedAssetClass}{' '}
                            (dal patrimonio)
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
