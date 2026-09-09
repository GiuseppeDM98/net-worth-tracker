'use client';

/**
 * «Dettaglio», below the grid behind a disclosure: what explains the Coast number rather than
 * answering the page's question, at the tile's cadence — Fasi di copertura (6) beside Al target
 * e a regime (6), Impatto delle pensioni (12, only with a pension) and Come leggere il Coast
 * FIRE (12: the automatic interpretation of this case, then the standing explainer). Closed by
 * default: the verdict and the three tiles already answer «posso smettere di versare?».
 *
 * Nothing is computed or fetched here: every figure is a field of the base scenario the tab
 * already holds, every sentence arrives worded from `lib/utils/coastFireView`.
 */

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { CoastFIREPensionBreakdown } from '@/lib/services/fireService';
import type { Narrative } from '@/lib/utils/narrative';
import { formatAgeYears, formatYearCount, HOW_TO_READ_READING, type CoastCoverageStep, type CoastScenarioMetrics } from '@/lib/utils/coastFireView';
import { cachedFormatCurrencyEUR, formatDate } from '@/lib/utils/formatters';
import { toDate } from '@/lib/utils/dateHelpers';
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tile, TILE_CELL_CLASS, TILE_EYEBROW_CLASS, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';

interface CoastDettaglioProps {
  /** `describeCoastDettaglio(...)`. */
  description: string;
  base: CoastScenarioMetrics;
  /** Pension breakdown ordered by start — shared with the coverage steps. */
  sortedPensionBreakdown: CoastFIREPensionBreakdown[];
  coverageSteps: CoastCoverageStep[];
  /** `describeCoverage(...)`. */
  coverageReading: Narrative;
  /** `describeTargetAndSteadyState(...)`. */
  targetReading: Narrative;
  /** `describePensionImpact(...)`. */
  impactReading: Narrative;
  /** `buildBaseScenarioInterpretation(...)`. */
  interpretation: string[];
  annualExpenses: number;
  bridgeYears: number;
  retirementAge: number;
}

const compact = (value: number) => cachedFormatCurrencyEUR(Math.round(value), true);

function Row({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-[9px]">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <span className={cn('shrink-0 font-mono text-[14px] tabular-nums text-foreground', emphasis && 'font-semibold')}>{value}</span>
    </div>
  );
}

export function CoastDettaglio({
  description,
  base,
  sortedPensionBreakdown,
  coverageSteps,
  coverageReading,
  targetReading,
  impactReading,
  interpretation,
  annualExpenses,
  bridgeYears,
  retirementAge,
}: CoastDettaglioProps) {
  const [open, setOpen] = useState(false);
  const hasPensions = sortedPensionBreakdown.length > 0;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex min-h-11 w-full items-center justify-between gap-3 border-t border-border/40 py-3 text-left">
        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className={TILE_EYEBROW_CLASS}>Dettaglio</span>
          <span className="text-[13px] text-muted-foreground">{description}</span>
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </CollapsibleTrigger>

      <CollapsibleContent className="pt-1">
        <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-12">
          {/* Fasi di copertura (6) */}
          <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-6')}>
            <Tile eyebrow="Fasi di copertura" aside="scenario base" reading={coverageReading} ariaLabel="Fasi di copertura">
              <ol className="mt-2.5 flex flex-col divide-y divide-border">
                {coverageSteps.map((step, index) => (
                  <li key={step.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 py-[9px]">
                    <span className="flex min-w-0 items-start gap-3">
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted font-mono text-[11px] font-semibold tabular-nums text-foreground">{index + 1}</span>
                      <span className="min-w-0">
                        <span className="block text-[13px] font-medium text-foreground">{step.label}</span>
                        <span className="block text-[13px] text-muted-foreground">{step.detail}</span>
                      </span>
                    </span>
                    <span className="shrink-0 rounded-md bg-muted px-2.5 py-1 font-mono text-[11px] font-medium tabular-nums text-foreground">{step.badge}</span>
                  </li>
                ))}
              </ol>
            </Tile>
          </div>

          {/* Al target e a regime (6) */}
          <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-6')}>
            <Tile eyebrow="Al target e a regime" aside="euro di oggi" reading={targetReading} ariaLabel="Al target e a regime">
              <div className="mt-2.5 grid grid-cols-1 gap-x-6 sm:grid-cols-2">
                <div className="flex flex-col divide-y divide-border">
                  <p className={cn(TILE_SUB_EYEBROW_CLASS, 'pb-1')}>A {formatAgeYears(retirementAge)}</p>
                  <Row label="Spese reali annue" value={compact(annualExpenses)} />
                  <Row label="Pensione netta reale" value={compact(base.totalNetAnnualPensionAtRetirement)} />
                  <Row label="Fabbisogno da portafoglio" value={compact(base.annualPortfolioNeedAtRetirement)} />
                  <Row label="Capitale richiesto" value={compact(base.retirementCapitalRequired)} emphasis />
                </div>
                <div className="flex flex-col divide-y divide-border">
                  <p className={cn(TILE_SUB_EYEBROW_CLASS, 'pb-1')}>
                    A regime{base.latestPensionStartDate ? ` · dal ${toDate(base.latestPensionStartDate).getFullYear()}` : ''}
                  </p>
                  <Row label="Pensione netta reale" value={compact(base.totalNetAnnualPensionAtSteadyState)} />
                  <Row label="Fabbisogno da portafoglio" value={compact(base.annualPortfolioNeedAtSteadyState)} />
                  <Row label="Capitale a regime" value={compact(base.steadyStatePortfolioNeed)} emphasis />
                  <Row label="Ponte prima dell'ultima pensione" value={bridgeYears > 0 ? formatYearCount(bridgeYears) : 'Nessuno'} />
                </div>
              </div>
            </Tile>
          </div>

          {/* Impatto delle pensioni (12) */}
          {hasPensions && (
            <div className={cn(TILE_CELL_CLASS, 'tablet:col-span-2 desktop:col-span-12')}>
              <Tile eyebrow="Impatto delle pensioni" aside="scenario base" reading={impactReading} ariaLabel="Impatto delle pensioni">
                {/* Below `desktop:` the same rows are a flat list (Table inside a Tile): five
                    columns at 350px would push the tile past the phone's edge. */}
                <ul className="mt-2.5 flex flex-col divide-y divide-border desktop:hidden">
                  {sortedPensionBreakdown.map((pension) => (
                    <li key={pension.id} className="py-3">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-[13px] font-medium text-foreground">{pension.label}</span>
                        <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                          {pension.isActiveAtRetirement ? 'Già attiva al target' : `Parte a ${formatAgeYears(pension.startAge)}`}
                        </span>
                      </div>
                      <p className="mt-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">
                        {pension.startDate ? formatDate(toDate(pension.startDate)) : 'non disponibile'} · tra {formatYearCount(Math.ceil(pension.yearsUntilStart))}
                      </p>
                      <div className="mt-2 grid grid-cols-3 gap-x-3">
                        <div>
                          <p className={TILE_SUB_EYEBROW_CLASS}>Lordo nominale</p>
                          <p className="mt-1 font-mono text-[13px] tabular-nums text-foreground">{compact(pension.grossAnnualFutureNominal)}</p>
                        </div>
                        <div>
                          <p className={TILE_SUB_EYEBROW_CLASS}>Lordo reale</p>
                          <p className="mt-1 font-mono text-[13px] tabular-nums text-foreground">{compact(pension.grossAnnualRealAtStart)}</p>
                        </div>
                        <div>
                          <p className={TILE_SUB_EYEBROW_CLASS}>Netto reale</p>
                          <p className="mt-1 font-mono text-[13px] font-semibold tabular-nums text-foreground">{compact(pension.netAnnualRealAtStart)}</p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 hidden desktop:block">
                  <table className="w-full border-collapse text-[13px]">
                    <thead>
                      <tr className="border-b border-border">
                        <th scope="col" className={cn(TILE_SUB_EYEBROW_CLASS, 'pb-2 text-left font-semibold')}>Pensione</th>
                        <th scope="col" className={cn(TILE_SUB_EYEBROW_CLASS, 'pb-2 text-left font-semibold')}>Decorrenza</th>
                        <th scope="col" className={cn(TILE_SUB_EYEBROW_CLASS, 'pb-2 text-right font-semibold')}>Lordo nominale</th>
                        <th scope="col" className={cn(TILE_SUB_EYEBROW_CLASS, 'pb-2 text-right font-semibold')}>Lordo reale</th>
                        <th scope="col" className={cn(TILE_SUB_EYEBROW_CLASS, 'pb-2 text-right font-semibold')}>Netto reale</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedPensionBreakdown.map((pension) => (
                        <tr key={pension.id} className="border-b border-border last:border-b-0">
                          <th scope="row" className="py-[9px] pr-3 text-left font-medium text-foreground">
                            {pension.label}
                            <span className="ml-2 rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                              {pension.isActiveAtRetirement ? 'Già attiva al target' : `Parte a ${formatAgeYears(pension.startAge)}`}
                            </span>
                          </th>
                          <td className="whitespace-nowrap py-[9px] pr-3 font-mono tabular-nums text-muted-foreground">
                            {pension.startDate ? formatDate(toDate(pension.startDate)) : 'non disponibile'} · tra {formatYearCount(Math.ceil(pension.yearsUntilStart))}
                          </td>
                          <td className="whitespace-nowrap py-[9px] pl-3 text-right font-mono tabular-nums text-foreground">{compact(pension.grossAnnualFutureNominal)}</td>
                          <td className="whitespace-nowrap py-[9px] pl-3 text-right font-mono tabular-nums text-foreground">{compact(pension.grossAnnualRealAtStart)}</td>
                          <td className="whitespace-nowrap py-[9px] pl-3 text-right font-mono font-semibold tabular-nums text-foreground">{compact(pension.netAnnualRealAtStart)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Tile>
            </div>
          )}

          {/* Come leggere il Coast FIRE (12) */}
          <div className={cn(TILE_CELL_CLASS, 'tablet:col-span-2 desktop:col-span-12')}>
            <Tile eyebrow="Come leggere il Coast FIRE" reading={HOW_TO_READ_READING} ariaLabel="Come leggere il Coast FIRE">
              <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 text-[13px] leading-[1.5] text-muted-foreground desktop:grid-cols-2">
                {interpretation.map((line) => (
                  <p key={line} className="text-foreground/90">
                    {line}
                  </p>
                ))}
                <p>
                  <strong className="font-semibold text-foreground">Coast FIRE</strong> significa che puoi smettere di versare per la pensione, non smettere di lavorare: dopo il traguardo il capitale di oggi
                  dovrebbe bastare, per capitalizzazione composta, a coprire il capitale richiesto al target.
                </p>
                <p>
                  <strong className="font-semibold text-foreground">Spese usate.</strong> Il target si basa sulle spese reali dell&apos;ultimo anno completo, salvo un importo personalizzato nelle Ipotesi.
                </p>
                <p>
                  <strong className="font-semibold text-foreground">Pensione statale.</strong> Ogni importo è un lordo mensile nominale futuro, deflazionato con l&apos;inflazione dello scenario e convertito in
                  netto reale con l&apos;IRPEF progressiva.
                </p>
                <p>
                  <strong className="font-semibold text-foreground">Fondo pensione bloccato.</strong> Con il vincolo attivo (lo switch è nella Base di calcolo del Calcolatore) il fondo esce dal patrimonio di oggi e
                  rientra allo sblocco al suo valore attuale; il capitale richiesto al target è al netto di quel rientro.
                </p>
              </div>
            </Tile>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
