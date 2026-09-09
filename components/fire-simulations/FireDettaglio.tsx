'use client';

/**
 * «Dettaglio», below the grid behind a disclosure: the reference material of the calculator at
 * the tile's cadence — the historical runway (6) beside the cashflow-versus-passive-income
 * history (6), and the explainer (12). Closed by default: the verdict and the four tiles already
 * answer «quando?»; these are the history behind the number, and the method. (The year-by-year
 * table of the projection was dropped on the owner's request, 2026-08-25: the Scenari chart and
 * the Scenari tile already say what it listed.)
 *
 * Nothing is fetched here: the two charts read the `fireData` the tab already holds, so opening
 * it costs no round trip and no figure can disagree with the grid. The two Recharts charts keep
 * their tooltips and their chart slots; the runway's target line stays the amber slot the old
 * chart used for targets.
 */

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { HistoricalFIRERunwayPoint, HistoricalFIRERunwaySummary, MonthlyFIREData } from '@/lib/services/fireService';
import type { Narrative } from '@/lib/utils/narrative';
import { CASHFLOW_CHART_READING, EXPLAINER_READING } from '@/lib/utils/fireNarrative';
import { formatCurrency, formatCurrencyCompact, formatPercentage } from '@/lib/services/chartService';
import { fmtCurrency } from '@/lib/utils/chartUtils';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tile, TILE_CELL_CLASS, TILE_EYEBROW_CLASS, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { CHART_TICK_STYLE } from '@/components/cashflow/costCenterStyles';
import { SettledYearsValue } from '@/components/fire-simulations/SettledValue';

interface FireDettaglioProps {
  /** `describeDettaglio(...)`. */
  description: string;
  runwayData: HistoricalFIRERunwayPoint[];
  runwaySummary: HistoricalFIRERunwaySummary;
  /** `describeRunway(...)`. */
  runwayReading: Narrative;
  chartData: MonthlyFIREData[];
  /** How many Monte Carlo paths the Ventaglio runs — named in the explainer. */
  simulationCount: number;
}

const TOOLTIP_CONTENT_STYLE = { backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--card-foreground)', fontSize: 12 } as const;
const TOOLTIP_LABEL_STYLE = { color: 'var(--card-foreground)', fontWeight: 600 } as const;
const TOOLTIP_ITEM_STYLE = { color: 'var(--card-foreground)' } as const;
const LEGEND_STYLE = { fontSize: 11, color: 'var(--muted-foreground)' } as const;

const oneDecimal = (value: number) => value.toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** A years KPI with its twelve-month delta — the delta is a change of coverage, so it takes the sign tokens. */
function RunwayKpi({ label, caption, value, delta }: { label: string; caption: string; value: number | null; delta: number | null }) {
  return (
    <div className="min-w-0">
      <p className={TILE_SUB_EYEBROW_CLASS}>{label}</p>
      <p className="mt-1.5 font-mono text-[22px] font-bold leading-none tracking-[-0.03em] tabular-nums text-foreground">
        <SettledYearsValue value={value} />
        {value !== null && <span className="ml-1 text-[13px] font-normal tracking-normal text-muted-foreground">anni</span>}
      </p>
      <p className="mt-1.5 text-[11px] leading-[1.4] text-muted-foreground">
        {delta !== null && (
          <span className={cn('font-mono tabular-nums', delta >= 0 ? 'text-positive' : 'text-destructive')}>
            {delta >= 0 ? '+' : '−'}
            {oneDecimal(Math.abs(delta))} in 12 mesi ·{' '}
          </span>
        )}
        {caption}
      </p>
    </div>
  );
}

function RunwayTooltip({ active, payload, label }: { active?: boolean; payload?: readonly { payload?: HistoricalFIRERunwayPoint }[]; label?: string | number }) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  const rows: [string, string][] = [
    ['Runway totale', point.yearsOfExpenses !== null ? `${oneDecimal(point.yearsOfExpenses)} anni` : '—'],
    ['Runway liquida', point.liquidYearsOfExpenses !== null ? `${oneDecimal(point.liquidYearsOfExpenses)} anni` : '—'],
    ['Spese rolling 12M', formatCurrency(point.trailing12mExpenses)],
    ['Patrimonio FIRE', formatCurrency(point.fireNetWorthUsed)],
    ['Progresso FIRE', point.fireProgressToFI !== null ? formatPercentage(point.fireProgressToFI) : '—'],
  ];
  return (
    <div className="rounded-lg border border-border bg-card p-3 text-sm shadow-sm">
      <p className="font-semibold text-foreground">{label}</p>
      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
        {rows.map(([name, value]) => (
          <p key={name}>
            {name}: <span className="font-mono font-medium tabular-nums text-foreground">{value}</span>
          </p>
        ))}
      </div>
    </div>
  );
}

export function FireDettaglio({ description, runwayData, runwaySummary, runwayReading, chartData, simulationCount }: FireDettaglioProps) {
  const [open, setOpen] = useState(false);
  const chartColors = useChartColors();
  // The chart is drawn only when the latest point measures something: with points but no expenses
  // in the trailing twelve months, the reading says so and a plot of nulls would say nothing.
  const hasRunway = runwayData.length > 0 && runwaySummary.currentYearsOfExpenses !== null;

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
          <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-6')}>
            <Tile eyebrow="Runway storica" aside="spese rolling 12 mesi" reading={runwayReading} ariaLabel="Runway FIRE storica">
              {hasRunway ? (
                <>
                  <div className="mt-3.5 grid grid-cols-2 gap-x-4 gap-y-3">
                    <RunwayKpi label="Totale" caption="liquidi e illiquidi" value={runwaySummary.currentYearsOfExpenses} delta={runwaySummary.totalDeltaVs12Months} />
                    <RunwayKpi label="Liquida" caption="solo asset liquidi" value={runwaySummary.currentLiquidYearsOfExpenses} delta={runwaySummary.liquidDeltaVs12Months} />
                  </div>
                  <div className="relative mt-4 min-h-[260px] flex-1">
                    <div className="absolute inset-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={runwayData}
                          margin={{ left: 0, right: 8, bottom: 4 }}
                          role="img"
                          aria-label="Runway FIRE storica: anni di spese coperti dal patrimonio FIRE totale e dai soli asset liquidi, mese per mese, con la linea tratteggiata dell'obiettivo"
                          accessibilityLayer={false}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                          <XAxis dataKey="monthLabel" tick={CHART_TICK_STYLE} tickMargin={6} />
                          <YAxis width={44} tickFormatter={(value) => `${Number(value).toFixed(0)}a`} tick={CHART_TICK_STYLE} />
                          <Tooltip content={RunwayTooltip} />
                          <Legend wrapperStyle={LEGEND_STYLE} />
                          {runwaySummary.targetYearsOfExpenses !== null && (
                            <ReferenceLine
                              y={runwaySummary.targetYearsOfExpenses}
                              stroke={chartColors[2]}
                              strokeWidth={1.5}
                              strokeDasharray="6 4"
                              label={{ value: `Obiettivo ${oneDecimal(runwaySummary.targetYearsOfExpenses)} anni`, position: 'insideTopRight', fill: chartColors[2], fontSize: 11 }}
                            />
                          )}
                          <Line type="monotone" dataKey="yearsOfExpenses" stroke={chartColors[0]} strokeWidth={2} name="Totale" dot={false} connectNulls={false} animationDuration={800} animationEasing="ease-out" />
                          <Line type="monotone" dataKey="liquidYearsOfExpenses" stroke={chartColors[1]} strokeWidth={2} name="Solo liquidi" dot={false} connectNulls={false} animationDuration={800} animationEasing="ease-out" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </>
              ) : null}
            </Tile>
          </div>

          <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-6')}>
            <Tile eyebrow="Cashflow e reddito passivo" aside="per mese, dagli snapshot" reading={CASHFLOW_CHART_READING} ariaLabel="Cashflow e reddito passivo nel tempo">
              {chartData.length > 0 ? (
                <div className="relative mt-3.5 min-h-[260px] flex-1">
                  <div className="absolute inset-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={chartData}
                        margin={{ left: 0, right: 8, bottom: 4 }}
                        role="img"
                        aria-label="Entrate, uscite e reddito passivo mensile, mese per mese dagli snapshot"
                        accessibilityLayer={false}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="monthLabel" tick={CHART_TICK_STYLE} tickMargin={6} />
                        <YAxis width={56} tickFormatter={(value) => formatCurrencyCompact(Number(value))} tick={CHART_TICK_STYLE} />
                        <Tooltip formatter={fmtCurrency} contentStyle={TOOLTIP_CONTENT_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} />
                        <Legend wrapperStyle={LEGEND_STYLE} />
                        <Line type="monotone" dataKey="income" stroke={chartColors[1]} strokeWidth={2} name="Entrate" dot={false} animationDuration={800} animationEasing="ease-out" />
                        <Line type="monotone" dataKey="expenses" stroke={chartColors[4]} strokeWidth={2} name="Uscite" dot={false} animationDuration={800} animationEasing="ease-out" />
                        <Line type="monotone" dataKey="monthlyAllowance" stroke={chartColors[3]} strokeWidth={2} name="Reddito passivo" dot={false} animationDuration={800} animationEasing="ease-out" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-[13px] text-muted-foreground">Nessuno storico disponibile: gli snapshot mensili verranno creati automaticamente.</p>
              )}
            </Tile>
          </div>

          <div className={cn(TILE_CELL_CLASS, 'tablet:col-span-2 desktop:col-span-12')}>
            <Tile eyebrow="Come funziona il FIRE" reading={EXPLAINER_READING} ariaLabel="Come funziona il FIRE">
              <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 text-[13px] leading-[1.5] text-muted-foreground desktop:grid-cols-2">
                <p>
                  <strong className="font-semibold text-foreground">Numero FIRE.</strong> Il patrimonio target: spese annuali ÷ Safe Withdrawal Rate. Con un SWR
                  del 4% servono 25 volte le spese annuali.
                </p>
                <p>
                  <strong className="font-semibold text-foreground">Safe Withdrawal Rate.</strong> La percentuale del patrimonio prelevabile ogni anno in modo
                  sostenibile; il 4% viene dal Trinity Study su un orizzonte di 30 anni.
                </p>
                <p>
                  <strong className="font-semibold text-foreground">Reddito passivo.</strong> Il patrimonio FIRE di oggi per il SWR: quanto potresti già
                  prelevare, all&apos;anno, al mese, al giorno.
                </p>
                <p>
                  <strong className="font-semibold text-foreground">Proiezione.</strong> Ogni anno il patrimonio cresce con il rendimento dello scenario, poi
                  riceve il risparmio annuo finché il FIRE non è raggiunto; le spese crescono con l&apos;inflazione e con loro il numero FIRE. Risparmio e spese
                  vengono dal cashflow dell&apos;ultimo anno completo o, quando manca, dell&apos;anno in corso annualizzato (la tessera Base di calcolo dice quale).
                </p>
                <p>
                  <strong className="font-semibold text-foreground">Modello ponte.</strong> Con il fondo pensione bloccato, fino allo sblocco servono solo gli
                  asset liberi; allo sblocco il fondo rientra nel capitale, e il numero FIRE tiene conto di entrambe le fasi.
                </p>
                <p>
                  <strong className="font-semibold text-foreground">Ventaglio.</strong> La stessa fase di accumulo simulata {simulationCount.toLocaleString('it-IT')}{' '}
                  volte con rendimenti casuali derivati dalla tua allocazione: le bande mostrano dove finisce la maggior parte dei percorsi e la probabilità di
                  FIRE entro l&apos;anno proiettato. Per il decumulo usa il tab Monte Carlo.
                </p>
              </div>
            </Tile>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
