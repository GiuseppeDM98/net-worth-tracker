/**
 * «Dettaglio» — the two genuinely tabular server blocks of Cashflow › Dividendi, below the
 * tile grid and behind a disclosure: DPS growth per instrument (one column per calendar year)
 * and total return per instrument.
 *
 * They are the only parts of the old `DividendStats` that survived the 2026-08-23 redesign as
 * tables: YOC, current yield and the DPS median moved into the Rendimento tile. They keep the
 * tile's cadence — eyebrow, reading line, then flat rows — but they are NOT tiles of the grid:
 * a wide per-year matrix does not answer one question, and it belongs under the fold.
 *
 * The data is the tab's single `useDividendStats` query, passed in: this component fetches
 * nothing, so opening the disclosure costs no round trip and the figures cannot disagree with
 * the Rendimento tile's.
 */
'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Tile, TILE_CELL_CLASS, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { getMetricValueColor } from '@/lib/utils/metricColors';
import { formatPercentage } from '@/lib/services/chartService';
import { formatNumber } from '@/lib/services/chartService';
import { cn } from '@/lib/utils';
import type { AssetDividendGrowth, DividendStatsPayload } from '@/types/dividend';
import { summarizeDpsGrowth, summarizeTotalReturn } from '@/lib/utils/dividendAnalytics';
import { describeDpsGrowth, describeTotalReturn } from '@/lib/utils/dividendiNarrative';

interface DividendiDettaglioProps {
  stats: DividendStatsPayload | null;
  now: Date;
}

/** A signed percentage with the typographic minus and the it-IT comma, coloured by sign. */
function SignedPercent({ value, className }: { value: number | undefined; className?: string }) {
  if (value === undefined) return <span className={cn('text-muted-foreground', className)}>—</span>;
  return (
    <span className={cn('font-mono tabular-nums', getMetricValueColor(value, 'percentage'), className)}>
      {value >= 0 ? '+' : '−'}
      {formatPercentage(Math.abs(value), 2)}
    </span>
  );
}

export function DividendiDettaglio({ stats, now }: DividendiDettaglioProps) {
  const [open, setOpen] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<AssetDividendGrowth | null>(null);

  const growth = summarizeDpsGrowth(stats, now);
  const totalReturn = summarizeTotalReturn(stats);
  if (!growth && !totalReturn) return null;

  const growthRows = stats?.dividendGrowthData?.byAsset ?? [];
  const returnRows = stats?.totalReturnAssets ?? [];
  const years = growth?.years ?? [];

  return (
    <>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 rounded-xl border border-border px-4 py-3 text-sm font-medium transition-colors hover:bg-muted/40">
          <span>Dettaglio · crescita del dividendo e rendimento totale</span>
          <ChevronDown
            className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
            aria-hidden="true"
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3">
          <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-12">
            {growth && (
              <div className={cn(TILE_CELL_CLASS, 'tablet:col-span-2 desktop:col-span-7')}>
                <Tile
                  eyebrow="Crescita del dividendo per azione"
                  aside={<span>lordo, cedole escluse</span>}
                  reading={describeDpsGrowth(growth)}
                >
                  {/* Desktop: the per-year matrix, which is what makes this a table at all. */}
                  <div className="mt-3.5 hidden overflow-x-auto desktop:block">
                    <table className="w-full">
                      <thead>
                        <tr>
                          <th scope="col" className={cn(TILE_SUB_EYEBROW_CLASS, 'py-2 text-left')}>
                            Strumento
                          </th>
                          {years.map((year) => (
                            <th key={year} scope="col" className={cn(TILE_SUB_EYEBROW_CLASS, 'py-2 pl-3 text-right')}>
                              {year}
                              {year === growth.ongoingYear && (
                                <span className="ml-1 font-normal normal-case tracking-normal"> in corso</span>
                              )}
                            </th>
                          ))}
                          <th scope="col" className={cn(TILE_SUB_EYEBROW_CLASS, 'py-2 pl-3 text-right')}>
                            YoY
                          </th>
                          <th scope="col" className={cn(TILE_SUB_EYEBROW_CLASS, 'py-2 pl-3 text-right')}>
                            CAGR
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {growthRows.map((asset) => {
                          const dps = new Map(asset.yearlyDps.map((y) => [y.year, y.totalDps]));
                          return (
                            <tr key={asset.assetId} className="border-t border-border">
                              <th scope="row" className="py-2.5 pr-3 text-left text-[13px] font-medium">
                                {asset.assetTicker || asset.assetName}
                              </th>
                              {years.map((year) => (
                                <td
                                  key={year}
                                  className="py-2.5 pl-3 text-right font-mono text-[13px] tabular-nums text-muted-foreground"
                                >
                                  {dps.has(year) ? formatNumber(dps.get(year)!, 4) : '—'}
                                </td>
                              ))}
                              <td className="py-2.5 pl-3 text-right text-[13px]">
                                <SignedPercent value={asset.latestYoyGrowth} />
                              </td>
                              <td className="py-2.5 pl-3 text-right text-[13px]">
                                <SignedPercent value={asset.cagr} />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Below desktop: flat rows, not cards — a card per row inside a tile would be
                      a card inside a card. The per-year figures open in a dialog. */}
                  <div className="mt-3.5 flex flex-col divide-y divide-border desktop:hidden">
                    {growthRows.map((asset) => (
                      <button
                        key={asset.assetId}
                        type="button"
                        onClick={() => setSelectedAsset(asset)}
                        className="flex min-h-11 items-center gap-3 py-2.5 text-left transition-colors hover:bg-muted/30"
                      >
                        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                          {asset.assetTicker || asset.assetName}
                        </span>
                        <span className="shrink-0 text-[13px]">
                          <SignedPercent value={asset.latestYoyGrowth} />
                        </span>
                        <ChevronDown className="h-4 w-4 shrink-0 -rotate-90 text-muted-foreground" aria-hidden="true" />
                      </button>
                    ))}
                  </div>

                  <p className="mt-auto border-t border-border pt-3.5 text-[11px] leading-[1.45] text-muted-foreground">
                    YoY e CAGR si fermano all&apos;ultimo anno chiuso
                    {growth.ongoingYear !== null && (
                      <>
                        : il <span className="font-mono font-medium tabular-nums">{growth.ongoingYear}</span> è parziale e
                        non entra nel confronto
                      </>
                    )}
                    . Solo strumenti azionari ancora in portafoglio — una cedola ha un tasso fisso per contratto, non
                    cresce.
                  </p>
                </Tile>
              </div>
            )}

            {totalReturn && (
              <div className={cn(TILE_CELL_CLASS, 'tablet:col-span-2 desktop:col-span-5')}>
                <Tile
                  eyebrow="Rendimento totale per strumento"
                  aside={
                    <span>
                      <span className="font-mono font-medium tabular-nums">{totalReturn.count}</span>{' '}
                      {totalReturn.count === 1 ? 'posizione' : 'posizioni'}
                    </span>
                  }
                  reading={describeTotalReturn(totalReturn)}
                >
                  <div className="mt-3.5 flex flex-col divide-y divide-border">
                    <div className="flex items-center gap-3 pb-2">
                      <span className={cn(TILE_SUB_EYEBROW_CLASS, 'min-w-0 flex-1')}>Strumento</span>
                      <span className={cn(TILE_SUB_EYEBROW_CLASS, 'hidden w-[72px] text-right tablet:block')}>Plusval.</span>
                      <span className={cn(TILE_SUB_EYEBROW_CLASS, 'hidden w-[72px] text-right tablet:block')}>Dividendi</span>
                      <span className={cn(TILE_SUB_EYEBROW_CLASS, 'w-[72px] text-right')}>Totale</span>
                    </div>
                    {returnRows.map((asset) => (
                      <div key={asset.assetId} className="flex items-center gap-3 py-2.5">
                        <span className="flex min-w-0 flex-1 items-center gap-1.5">
                          <span className="truncate text-[13px] font-medium">{asset.assetTicker}</span>
                          {asset.isClosed && (
                            <Badge
                              variant="outline"
                              className="h-4 shrink-0 px-1.5 py-0 text-[10px] font-normal text-muted-foreground"
                            >
                              Chiusa
                            </Badge>
                          )}
                        </span>
                        <span className="hidden w-[72px] text-right text-[13px] tablet:block">
                          <SignedPercent value={asset.capitalGainPercentage} />
                        </span>
                        <span className="hidden w-[72px] text-right text-[13px] tablet:block">
                          <SignedPercent value={asset.dividendReturnPercentage} />
                        </span>
                        <span className="w-[72px] text-right text-[13px] font-semibold">
                          <SignedPercent value={asset.totalReturnPercentage} />
                        </span>
                      </div>
                    ))}
                  </div>

                  <p className="mt-auto border-t border-border pt-3.5 text-[11px] leading-[1.45] text-muted-foreground">
                    Plusvalenza (realizzata sulle posizioni chiuse, non realizzata su quelle aperte) più i dividendi netti
                    del possesso attuale, sul capitale storicamente investito in quella posizione.
                  </p>
                </Tile>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      <Dialog open={selectedAsset !== null} onOpenChange={(next) => { if (!next) setSelectedAsset(null); }}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-base">{selectedAsset?.assetTicker || selectedAsset?.assetName}</DialogTitle>
            <DialogDescription>Dividendo per azione lordo, anno per anno.</DialogDescription>
          </DialogHeader>
          {selectedAsset && (
            <div className="flex flex-col divide-y divide-border">
              {years.map((year) => {
                const dps = selectedAsset.yearlyDps.find((y) => y.year === year);
                return (
                  <div key={year} className="flex items-center justify-between gap-3 py-2">
                    <span className="font-mono text-[13px] tabular-nums text-muted-foreground">
                      {year}
                      {year === growth?.ongoingYear && ' · in corso'}
                    </span>
                    <span className="font-mono text-[13px] font-medium tabular-nums">
                      {dps ? formatNumber(dps.totalDps, 4) : '—'}
                    </span>
                  </div>
                );
              })}
              <div className="flex items-center justify-between gap-3 py-2">
                <span className="text-[13px] text-muted-foreground">YoY · ultimo anno chiuso</span>
                <SignedPercent value={selectedAsset.latestYoyGrowth} className="text-[13px] font-semibold" />
              </div>
              <div className="flex items-center justify-between gap-3 py-2">
                <span className="text-[13px] text-muted-foreground">CAGR</span>
                <SignedPercent value={selectedAsset.cagr} className="text-[13px] font-semibold" />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
