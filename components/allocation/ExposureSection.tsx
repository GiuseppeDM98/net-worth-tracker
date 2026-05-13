'use client';

/**
 * ExposureSection
 *
 * Collapsible card showing cross-ETF portfolio exposure broken down by:
 * - Principali Holdings (top companies aggregated across all ETFs + direct stocks)
 * - Settori (sector weights from Yahoo Finance topHoldings)
 * - Emittenti ETF (fund families/issuers)
 *
 * Data is lazily fetched (only on first expand) to avoid unnecessary
 * Yahoo Finance calls on every Allocazione page load.
 *
 * Limitation: Yahoo Finance provides only the top ~10 holdings per ETF.
 * Results are approximate for highly diversified funds like MSCI World.
 */

import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronDown, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { formatCurrency, formatPercentage } from '@/lib/services/chartService';
import { usePortfolioExposure } from '@/lib/hooks/usePortfolioExposure';
import { ExposureHolding, ExposureSector, ExposureIssuer } from '@/types/exposure';

interface ExposureSectionProps {
  userId: string;
}

// Simple progress bar — not the allocation one (which needs target/action).
function ExposureBar({ pct, className }: { pct: number; className?: string }) {
  const reducedMotion = useReducedMotion();
  const width = Math.min(Math.max(pct * 100, 0), 100);
  return (
    <div className={`relative h-2 w-full overflow-hidden rounded-full bg-muted/70 ${className ?? ''}`}>
      <motion.div
        className="absolute inset-y-0 left-0 rounded-full bg-primary/70"
        animate={reducedMotion ? undefined : { width: `${width}%` }}
        initial={reducedMotion ? false : { width: 0 }}
        transition={reducedMotion ? undefined : { duration: 0.5, ease: 'easeOut' }}
        style={reducedMotion ? { width: `${width}%` } : undefined}
        role="progressbar"
        aria-valuenow={Math.round(width)}
        aria-valuemin={0}
        aria-valuemax={100}
      />
    </div>
  );
}

// Skeleton row while loading
function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="h-3 w-32 animate-pulse rounded bg-muted" />
      <div className="flex-1 h-2 animate-pulse rounded-full bg-muted" />
      <div className="h-3 w-16 animate-pulse rounded bg-muted" />
      <div className="h-3 w-12 animate-pulse rounded bg-muted" />
    </div>
  );
}

function HoldingsList({ holdings }: { holdings: ExposureHolding[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (holdings.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Nessuna holding trovata. Verifica che i ticker ETF siano riconosciuti da Yahoo Finance.
      </p>
    );
  }

  return (
    <div className="divide-y divide-border/50">
      {holdings.map((h) => (
        <div key={h.symbol} className="py-2.5">
          <button
            type="button"
            className="w-full text-left"
            onClick={() => setExpanded(expanded === h.symbol ? null : h.symbol)}
          >
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">
                  {h.name}
                </span>
                <span className="block text-xs text-muted-foreground">{h.symbol}</span>
              </div>
              <div className="shrink-0 text-right">
                <span className="block text-sm font-semibold tabular-nums">
                  {formatPercentage(h.exposurePct * 100, 2)}
                </span>
                <span className="block text-xs text-muted-foreground tabular-nums">
                  {formatCurrency(h.exposureEur)}
                </span>
              </div>
            </div>
            <ExposureBar pct={h.exposurePct} className="mt-1.5" />
          </button>

          {/* Drill-down: which ETFs contribute */}
          {expanded === h.symbol && h.sources.length > 0 && (
            <div className="mt-2 rounded-md bg-muted/40 px-3 py-2 space-y-1">
              {h.sources.map((src, i) => (
                <div key={i} className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="truncate">{src.assetName} ({src.ticker})</span>
                  <span className="tabular-nums shrink-0 ml-2">
                    {formatCurrency(src.contributionEur)}
                    {' '}·{' '}
                    {formatPercentage(src.holdingPct * 100, 2)} nel fondo
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function SectorList({ sectors }: { sectors: ExposureSector[] }) {
  if (sectors.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Nessun dato settoriale disponibile per gli ETF nel portafoglio.
      </p>
    );
  }

  return (
    <div className="divide-y divide-border/50">
      {sectors.map((s) => (
        <div key={s.key} className="py-2.5">
          <div className="flex items-center gap-3">
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
              {s.label}
            </span>
            <div className="shrink-0 text-right">
              <span className="block text-sm font-semibold tabular-nums">
                {formatPercentage(s.exposurePct * 100, 2)}
              </span>
              <span className="block text-xs text-muted-foreground tabular-nums">
                {formatCurrency(s.exposureEur)}
              </span>
            </div>
          </div>
          <ExposureBar pct={s.exposurePct} className="mt-1.5" />
        </div>
      ))}
    </div>
  );
}

function IssuerList({ issuers }: { issuers: ExposureIssuer[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (issuers.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Nessun ETF nel portafoglio.
      </p>
    );
  }

  return (
    <div className="divide-y divide-border/50">
      {issuers.map((issuer) => (
        <div key={issuer.family} className="py-2.5">
          <button
            type="button"
            className="w-full text-left"
            onClick={() => setExpanded(expanded === issuer.family ? null : issuer.family)}
          >
            <div className="flex items-center gap-3">
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                {issuer.family}
              </span>
              <div className="shrink-0 text-right">
                <span className="block text-sm font-semibold tabular-nums">
                  {formatPercentage(issuer.exposurePct * 100, 2)}
                </span>
                <span className="block text-xs text-muted-foreground tabular-nums">
                  {formatCurrency(issuer.exposureEur)}
                </span>
              </div>
            </div>
            <ExposureBar pct={issuer.exposurePct} className="mt-1.5" />
          </button>

          {expanded === issuer.family && (
            <div className="mt-2 rounded-md bg-muted/40 px-3 py-2 space-y-1">
              {issuer.assets.map((a, i) => (
                <div key={i} className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="truncate">{a.name} ({a.ticker})</span>
                  <span className="tabular-nums shrink-0 ml-2">{formatCurrency(a.valueEur)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function ExposureSection({ userId }: ExposureSectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const reducedMotion = useReducedMotion();

  const { data, isLoading, isError, refetch, isFetching } = usePortfolioExposure(userId, isOpen);

  const exposure = data?.exposure;
  const cached = data?.cached;

  const computedAt = exposure?.computedAt
    ? new Date(exposure.computedAt).toLocaleString('it-IT', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : null;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card>
        {/* CollapsibleTrigger asChild on CardHeader — avoids nested button hydration error */}
        <CollapsibleTrigger asChild>
          <CardHeader className="group cursor-pointer select-none hover:bg-muted/30 transition-colors rounded-t-xl">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base sm:text-lg">Esposizione Portfolio</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Holding, settori ed emittenti aggregati per tutti gli ETF e le azioni
                </p>
              </div>
              <ChevronDown
                className="h-5 w-5 text-muted-foreground group-data-[state=open]:rotate-180 transition-transform duration-200 motion-reduce:transition-none shrink-0"
              />
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <motion.div
            initial={reducedMotion ? false : { opacity: 0, height: 0 }}
            animate={reducedMotion ? undefined : { opacity: 1, height: 'auto' }}
            exit={reducedMotion ? undefined : { opacity: 0, height: 0 }}
            style={{ overflow: 'hidden' }}
            transition={reducedMotion ? undefined : { duration: 0.25, ease: 'easeOut' }}
          >
            <CardContent className="pt-0 pb-6">
              {/* Meta row: asset coverage + refresh */}
              {exposure && (
                <div className="flex items-center justify-between mb-4 text-xs text-muted-foreground border-t border-border pt-4">
                  <span>
                    {exposure.analyzedAssets} asset analizzati su {exposure.totalAssets} totali
                    {cached && ' · dalla cache'}
                    {computedAt && ` · aggiornato ${computedAt}`}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    disabled={isFetching}
                    onClick={() => refetch()}
                  >
                    <RefreshCw className={`h-3 w-3 mr-1 ${isFetching ? 'animate-spin' : ''}`} />
                    Aggiorna
                  </Button>
                </div>
              )}

              {isError && (
                <div className="py-6 text-center text-sm text-destructive">
                  Errore nel caricamento dei dati. Riprova tra qualche momento.
                </div>
              )}

              {isLoading && (
                <div className="space-y-1 pt-4 border-t border-border">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <SkeletonRow key={i} />
                  ))}
                </div>
              )}

              {!isLoading && !isError && exposure && (
                <>
                  {exposure.analyzedAssets === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      Nessun ETF o azione azionaria nel portafoglio da analizzare.
                    </p>
                  ) : (
                    <Tabs defaultValue="holdings">
                      <TabsList className="mb-4 w-full sm:w-auto">
                        <TabsTrigger value="holdings" className="flex-1 sm:flex-none">
                          Principali Holdings
                        </TabsTrigger>
                        <TabsTrigger value="sectors" className="flex-1 sm:flex-none">
                          Settori
                        </TabsTrigger>
                        <TabsTrigger value="issuers" className="flex-1 sm:flex-none">
                          Emittenti ETF
                        </TabsTrigger>
                      </TabsList>

                      <TabsContent value="holdings">
                        <HoldingsList holdings={exposure.topHoldings} />
                      </TabsContent>

                      <TabsContent value="sectors">
                        <SectorList sectors={exposure.sectors} />
                      </TabsContent>

                      <TabsContent value="issuers">
                        <IssuerList issuers={exposure.issuers} />
                      </TabsContent>
                    </Tabs>
                  )}

                  {/* Disclaimer */}
                  <p className="mt-4 text-xs text-muted-foreground/70 border-t border-border/50 pt-3">
                    Dati basati sulle prime ~10 posizioni riportate da Yahoo Finance per ciascun ETF. Le percentuali sono approssimative per fondi molto diversificati (es. MSCI World con oltre 1.500 titoli). Copertura geografica non disponibile in questa versione.
                  </p>
                </>
              )}
            </CardContent>
          </motion.div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
