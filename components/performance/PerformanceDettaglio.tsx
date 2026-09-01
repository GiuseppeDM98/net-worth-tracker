'use client';

/**
 * «Dettaglio», below the grid behind a disclosure: everything the old page listed as fifteen
 * metrics and five charts, at the tile's cadence — the return metrics beside the TWR (ROI, CAGR,
 * IRR), the drawdown in months, the yields on cost and on price, the two rolling charts, the
 * underwater chart and the method. Closed by default: the verdict and the six tiles already
 * carry the answer; this is the reference material for whoever wants to go deeper.
 *
 * It reads the same `metrics` and derived series the tiles read — nothing is fetched here, so
 * opening it costs no round trip and no figure can disagree with the grid.
 */

import { useState, type ReactNode } from 'react';
import { ChevronDown, HelpCircle } from 'lucide-react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { PerformanceMetrics, RollingPeriodPerformance, UnderwaterDrawdownData } from '@/types/performance';
import type { Narrative } from '@/lib/utils/narrative';
import type { DrawdownStory } from '@/lib/utils/performanceSummary';
import { describeDrawdownDetail, describeReturnMetrics, describeYields } from '@/lib/utils/performanceNarrative';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { formatNumber, formatPercentage } from '@/lib/services/chartService';
import { getMetricValueColor } from '@/lib/utils/metricColors';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tile, TILE_CELL_CLASS, TILE_EYEBROW_CLASS } from '@/components/ui/tile';
import { CHART_TICK_STYLE } from '@/components/cashflow/costCenterStyles';
import { UnderwaterDrawdownChart } from '@/components/performance/UnderwaterDrawdownChart';

export type RollingCagrPoint = RollingPeriodPerformance & { cagrMA: number | null };
export type RollingSharpePoint = RollingPeriodPerformance & { sharpeRatioMA: number | null };

interface PerformanceDettaglioProps {
  metrics: PerformanceMetrics;
  periodAside: string;
  drawdown: DrawdownStory | null;
  rollingCagr: RollingCagrPoint[];
  rollingSharpe: RollingSharpePoint[];
  underwater: UnderwaterDrawdownData[];
  /** Changes with the period, so the charts replay their entrance once per window. */
  renderKey: string;
}

// ─── Rows ─────────────────────────────────────────────────────────────────────

function Help({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="ml-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Mostra definizione: ${label}`}
        >
          <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="max-w-[320px] text-[13px] leading-relaxed">
        {children}
      </PopoverContent>
    </Popover>
  );
}

function Row({ label, sub, help, value, valueClass }: { label: string; sub?: string; help?: ReactNode; value: string | null; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-[9px]">
      <span className="min-w-0 text-[13px] text-foreground">
        <span className="inline-flex items-center">
          {label}
          {help && <Help label={label}>{help}</Help>}
        </span>
        {sub && <span className="block text-[11px] text-muted-foreground">{sub}</span>}
      </span>
      <span className={cn('shrink-0 font-mono text-[13px] font-semibold tabular-nums', value === null ? 'text-muted-foreground' : valueClass)}>{value ?? '—'}</span>
    </div>
  );
}

function signedPercent(value: number, decimals = 2): string {
  return `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatPercentage(Math.abs(value), decimals)}`;
}

function months(value: number): string {
  return `${value} ${value === 1 ? 'mese' : 'mesi'}`;
}

const MONTH_LONG = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const monthYear = (m: { year: number; month: number }) => `${MONTH_LONG[m.month - 1]} ${m.year}`;

// ─── Charts ───────────────────────────────────────────────────────────────────

const TOOLTIP_CONTENT_STYLE = { backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--card-foreground)', fontSize: 12 } as const;
const TOOLTIP_LABEL_STYLE = { color: 'var(--card-foreground)', fontWeight: 600 } as const;
const TOOLTIP_ITEM_STYLE = { color: 'var(--card-foreground)' } as const;
const LEGEND_STYLE = { fontSize: 11, color: 'var(--muted-foreground)' } as const;

const shortDate = (date: Date | string) => new Date(date).toLocaleDateString('it-IT', { month: 'short', year: '2-digit' });

function RollingTile({
  eyebrow,
  aside,
  reading,
  data,
  primaryKey,
  averageKey,
  primaryName,
  formatValue,
  colorIndex,
  ariaLabel,
}: {
  eyebrow: string;
  aside: string;
  reading: Narrative;
  data: Array<RollingCagrPoint | RollingSharpePoint>;
  primaryKey: 'cagr' | 'sharpeRatio';
  averageKey: 'cagrMA' | 'sharpeRatioMA';
  primaryName: string;
  formatValue: (value: number) => string;
  colorIndex: number;
  ariaLabel: string;
}) {
  const chartColors = useChartColors();
  return (
    <Tile eyebrow={eyebrow} aside={aside} reading={reading}>
      {data.length === 0 ? (
        <p className="mt-3 text-[13px] leading-[1.45] text-muted-foreground">Servono almeno 13 snapshot mensili per il primo punto rolling.</p>
      ) : (
        <div className="mt-3 h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -12 }} role="img" aria-label={ariaLabel} accessibilityLayer={false}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="periodEndDate" tickFormatter={shortDate} tick={CHART_TICK_STYLE} stroke="var(--border)" interval="preserveStartEnd" />
              <YAxis tickFormatter={(v: number) => formatValue(v)} tick={CHART_TICK_STYLE} stroke="var(--border)" width={56} />
              <Tooltip
                formatter={(value) => (typeof value === 'number' && Number.isFinite(value) ? formatValue(value) : '—')}
                labelFormatter={(date) => new Date(date as string).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}
                contentStyle={TOOLTIP_CONTENT_STYLE}
                labelStyle={TOOLTIP_LABEL_STYLE}
                itemStyle={TOOLTIP_ITEM_STYLE}
              />
              <Legend wrapperStyle={LEGEND_STYLE} />
              <Line type="monotone" dataKey={primaryKey} stroke={chartColors[colorIndex] ?? `var(--chart-${colorIndex + 1})`} strokeWidth={2} name={primaryName} dot={false} animationDuration={800} animationEasing="ease-out" />
              <Line type="monotone" dataKey={averageKey} stroke={chartColors[1] ?? 'var(--chart-2)'} strokeWidth={1.5} name="Media mobile 3M" strokeDasharray="6 4" dot={false} animationDuration={800} animationEasing="ease-out" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <p className="mt-auto border-t border-border pt-3.5 text-[11px] leading-[1.45] text-muted-foreground">
        Ogni punto è la misura sui 12 mesi che finiscono lì; la linea tratteggiata è la media mobile a 3 mesi.
      </p>
    </Tile>
  );
}

/** «Il CAGR a 12 mesi oscilla tra 5,1% e 7,9%; ultimo punto 7,3%.» — built here from the series, no pure module needed for a range. */
function describeRolling(values: number[], format: (v: number) => string, name: string): Narrative {
  if (values.length === 0) return [{ text: `Nessun punto rolling: servono 13 snapshot mensili per ${name}.` }];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const last = values[values.length - 1];
  return [
    { text: `${name} a 12 mesi ${values.length === 1 ? 'vale' : 'oscilla tra'} ` },
    ...(values.length === 1 ? [] : [{ text: format(min), mono: true }, { text: ' e ' }, { text: format(max), mono: true }, { text: '; ultimo punto ' }]),
    { text: format(last), mono: true, sign: last > 0 ? ('positive' as const) : last < 0 ? ('negative' as const) : undefined },
    { text: '.' },
  ];
}

// ─── The disclosure ───────────────────────────────────────────────────────────

export function PerformanceDettaglio({ metrics, periodAside, drawdown, rollingCagr, rollingSharpe, underwater, renderKey }: PerformanceDettaglioProps) {
  const [open, setOpen] = useState(false);

  const yields = describeYields({ yocNet: metrics.yocNet, currentYieldNet: metrics.currentYieldNet });
  const hasYields = yields !== null;
  const underwaterMonths = underwater.filter((p) => p.drawdown < 0).length;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 border-t border-border/40 py-3 text-left" aria-label="Dettaglio">
        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className={TILE_EYEBROW_CLASS}>Dettaglio</span>
          <span className="text-[13px] text-muted-foreground">Tutte le metriche, i grafici rolling, il drawdown nel tempo e il metodo</span>
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-1">
        <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-12">
          <div className={cn(TILE_CELL_CLASS, hasYields ? 'desktop:col-span-4' : 'desktop:col-span-6')}>
            <Tile eyebrow="Metriche di rendimento" aside={periodAside} reading={describeReturnMetrics(metrics)}>
              <div className="mt-3 flex flex-col divide-y divide-border">
                <Row
                  label="ROI totale"
                  sub="senza annualizzazione"
                  value={metrics.roi === null ? null : signedPercent(metrics.roi)}
                  valueClass={getMetricValueColor(metrics.roi, 'percentage')}
                  help="Guadagno o perdita del periodo: (valore finale − valore iniziale − contributi netti) / valore iniziale. I versamenti vengono TOLTI dal guadagno, perché non sono rendimento. Cambia tra periodi perché copre durate diverse: per confrontare usa il TWR."
                />
                <Row
                  label="CAGR"
                  sub="i versamenti contano dall'inizio"
                  value={metrics.cagr === null ? null : signedPercent(metrics.cagr)}
                  valueClass={getMetricValueColor(metrics.cagr, 'percentage')}
                  help="Crescita media annua composta: (valore finale / (valore iniziale + contributi netti))^(1/anni) − 1. I versamenti vengono AGGIUNTI al denominatore, una correzione diversa da quella del ROI: i due numeri non si convertono l'uno nell'altro."
                />
                <Row
                  label="Money-Weighted (IRR)"
                  sub="il tuo timing"
                  value={metrics.moneyWeightedReturn === null ? null : signedPercent(metrics.moneyWeightedReturn)}
                  valueClass={getMetricValueColor(metrics.moneyWeightedReturn, 'percentage')}
                  help="Il rendimento dell'investitore, che tiene conto di QUANDO hai versato o prelevato: investire prima di una crescita lo alza, prima di un calo lo abbassa. Null quando nessun tasso spiega il flusso, non quando il calcolo rinuncia."
                />
                <Row label="Durata" sub={`dal ${metrics.startDate.toLocaleDateString('it-IT')} al ${metrics.endDate.toLocaleDateString('it-IT')}`} value={months(metrics.numberOfMonths)} valueClass="text-foreground" />
              </div>
            </Tile>
          </div>

          <div className={cn(TILE_CELL_CLASS, hasYields ? 'desktop:col-span-4' : 'desktop:col-span-6')}>
            <Tile eyebrow="Drawdown" aside={periodAside} reading={describeDrawdownDetail(drawdown)}>
              <div className="mt-3 flex flex-col divide-y divide-border">
                <Row
                  label="Max drawdown"
                  sub={drawdown ? `valle: ${monthYear(drawdown.trough)}` : undefined}
                  value={drawdown ? `−${formatPercentage(Math.abs(drawdown.value), 2)}` : null}
                  valueClass="text-destructive"
                  help="La peggiore perdita da un massimo a una valle nel periodo, sull'indice che concatena gli stessi rendimenti mensili della heatmap: un versamento sposta il patrimonio, non questa percentuale. Il massimo è quello RAGGIUNTO nel periodo, non un massimo storico."
                />
                <Row
                  label="Durata drawdown"
                  sub={drawdown ? `${monthYear(drawdown.peak)} – ${drawdown.recovery ? monthYear(drawdown.recovery) : 'oggi'}` : undefined}
                  value={drawdown ? months(drawdown.durationMonths) : null}
                  valueClass="text-foreground"
                  help="Mesi dal picco al pieno recupero (o all'ultimo snapshot, se il recupero non è ancora arrivato). Misura la resilienza: durate brevi = rapido recupero."
                />
                <Row
                  label="Tempo di recupero"
                  sub={drawdown?.recovery ? `${monthYear(drawdown.trough)} – ${monthYear(drawdown.recovery)}` : drawdown ? 'non ancora' : undefined}
                  value={drawdown?.monthsToRecover === null || drawdown?.monthsToRecover === undefined ? null : months(drawdown.monthsToRecover)}
                  valueClass="text-foreground"
                  help="Mesi dalla valle al pieno recupero: solo la fase di risalita, a differenza della durata che parte dal picco."
                />
                <Row
                  label="Sotto il massimo"
                  sub="mesi del periodo"
                  value={underwater.length > 0 ? `${underwaterMonths} su ${underwater.length}` : null}
                  valueClass="text-foreground"
                />
              </div>
            </Tile>
          </div>

          {hasYields && (
            <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-4')}>
              <Tile eyebrow="Proventi finanziari" aside="solo asset in portafoglio" reading={yields}>
                <div className="mt-3 flex flex-col divide-y divide-border">
                  <Row
                    label="YOC netto"
                    sub={`cost basis ${cachedFormatCurrencyEUR(metrics.yocCostBasis, true)} · ${metrics.yocAssetCount} asset`}
                    value={metrics.yocNet === null ? null : formatPercentage(metrics.yocNet, 2)}
                    valueClass="text-foreground"
                    help="Dividendi netti annualizzati sul costo medio di acquisto degli asset che possiedi oggi. I dividendi degli asset venduti restano nello storico ma non entrano qui."
                  />
                  <Row
                    label="YOC lordo"
                    sub={`dividendi ${cachedFormatCurrencyEUR(metrics.yocDividendsGross, true)}`}
                    value={metrics.yocGross === null ? null : formatPercentage(metrics.yocGross, 2)}
                    valueClass="text-foreground"
                    help="Dividendi lordi annualizzati sul costo medio di acquisto. YOC sopra il rendimento corrente = il prezzo è cresciuto più dei dividendi."
                  />
                  <Row
                    label="Rendimento corrente lordo"
                    sub={`valore ${cachedFormatCurrencyEUR(metrics.currentYieldPortfolioValue, true)}`}
                    value={metrics.currentYield === null ? null : formatPercentage(metrics.currentYield, 2)}
                    valueClass="text-foreground"
                    help="Dividendi lordi annualizzati sul valore di mercato di oggi: quanto renderebbe il portafoglio comprato ai prezzi correnti."
                  />
                  <Row
                    label="Rendimento corrente netto"
                    value={metrics.currentYieldNet === null ? null : formatPercentage(metrics.currentYieldNet, 2)}
                    valueClass="text-foreground"
                    help="Dividendi netti (dopo le ritenute) annualizzati sul valore di mercato di oggi: la misura più realistica del reddito passivo."
                  />
                </div>
              </Tile>
            </div>
          )}

          <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-6')}>
            <RollingTile
              eyebrow="CAGR rolling 12 mesi"
              aside="nel periodo"
              reading={describeRolling(rollingCagr.map((p) => p.cagr).filter((v): v is number => v !== null), (v) => signedPercent(v, 1), 'Il CAGR')}
              data={rollingCagr}
              primaryKey="cagr"
              averageKey="cagrMA"
              primaryName="CAGR 12M"
              formatValue={(v) => formatPercentage(v, 1)}
              colorIndex={0}
              ariaLabel="CAGR rolling a 12 mesi con la sua media mobile a 3 mesi"
            />
          </div>
          <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-6')}>
            <RollingTile
              eyebrow="Sharpe rolling 12 mesi"
              aside="nel periodo"
              reading={describeRolling(rollingSharpe.map((p) => p.sharpeRatio).filter((v): v is number => v !== null), (v) => formatNumber(v, 2).replace('-', '−'), 'Lo Sharpe')}
              data={rollingSharpe}
              primaryKey="sharpeRatio"
              averageKey="sharpeRatioMA"
              primaryName="Sharpe 12M"
              formatValue={(v) => formatNumber(v, 2).replace('-', '−')}
              colorIndex={2}
              ariaLabel="Sharpe rolling a 12 mesi con la sua media mobile a 3 mesi"
            />
          </div>

          <div className={cn(TILE_CELL_CLASS, 'tablet:col-span-2 desktop:col-span-12')}>
            <Tile
              eyebrow="Sotto il massimo (underwater)"
              aside={periodAside}
              reading={[
                { text: 'Sotto il massimo del periodo per ' },
                { text: `${underwaterMonths} ${underwaterMonths === 1 ? 'mese' : 'mesi'}`, mono: true },
                { text: ` su ${underwater.length}` },
                ...(drawdown
                  ? [{ text: '; il punto più basso ' }, { text: `−${formatPercentage(Math.abs(drawdown.value), 1)}`, mono: true, sign: 'negative' as const }, { text: ` a ${monthYear(drawdown.trough)}.` }]
                  : [{ text: '.' }]),
              ]}
            >
              <div className="mt-3">
                <UnderwaterDrawdownChart data={underwater} height={220} revealKey={renderKey} />
              </div>
              <p className="mt-auto border-t border-border pt-3.5 text-[11px] leading-[1.45] text-muted-foreground">
                La stessa serie della heatmap, concatenata: ogni punto è la distanza dell&apos;indice TWR dal suo massimo. Un versamento
                sposta il patrimonio, non la distanza dal massimo.
              </p>
            </Tile>
          </div>

          <div className={cn(TILE_CELL_CLASS, 'tablet:col-span-2 desktop:col-span-12')}>
            <Tile eyebrow="Note metodologiche" aside="finestre e formule" reading={[{ text: 'Come sono misurati i numeri di questa pagina: finestre, snapshot, rendimenti, rischio, contributi e proventi.' }]}>
              <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-4 text-[12px] leading-[1.5] text-muted-foreground tablet:grid-cols-2 desktop:grid-cols-3">
                <div>
                  <p className="mb-1 font-semibold text-foreground">Periodi e snapshot</p>
                  Gli snapshot sono fotografie di fine mese. Il primo snapshot del periodo è la valutazione di partenza, non un mese
                  misurato: la finestra si apre il 1° del mese dopo. YTD dal 1° gennaio, 1/3/5 anni a mesi interi, Storico dal primo
                  snapshot. Una finestra più corta del suo nome è nominata dai mesi che misura.
                </div>
                <div>
                  <p className="mb-1 font-semibold text-foreground">TWR, ROI, CAGR, IRR</p>
                  Il TWR concatena i rendimenti mensili al netto dei flussi ed è annualizzato; sotto i 6 mesi la pagina mostra il rendimento
                  del periodo. Il ROI toglie i versamenti dal guadagno, il CAGR li aggiunge al capitale iniziale: rispondono a domande diverse e
                  non si convertono. L&apos;IRR è il tasso che spiega il tuo flusso di versamenti e prelievi.
                </div>
                <div>
                  <p className="mb-1 font-semibold text-foreground">Rischio</p>
                  Volatilità = deviazione standard dei rendimenti mensili × √12, senza filtri, con un pavimento di 3 mesi. Sharpe e Sortino
                  usano il TWR annualizzato meno il tasso privo di rischio delle Impostazioni; il Sortino conta solo i mesi negativi. Il
                  drawdown è misurato sull&apos;indice TWR, quindi non dipende da quanto capitale è entrato.
                </div>
                <div>
                  <p className="mb-1 font-semibold text-foreground">Contributi e capitale</p>
                  I contributi netti sono entrate meno uscite registrate in Cashflow, trasferimenti esclusi; i dividendi sono rendimento, non
                  contributo. Il capitale investito conta acquisti meno vendite dal registro operazioni. «Capitale immesso» è il patrimonio
                  iniziale più i contributi netti cumulati: la distanza dal patrimonio è il mercato.
                </div>
                <div>
                  <p className="mb-1 font-semibold text-foreground">Heatmap e underwater</p>
                  Ogni mese vale (patrimonio fine mese − cashflow del mese) / patrimonio inizio mese − 1: si sottrae solo il cashflow di quel
                  mese. L&apos;underwater concatena esattamente questi mesi e misura la distanza dal massimo raggiunto: stessa serie, due letture.
                </div>
                <div>
                  <p className="mb-1 font-semibold text-foreground">Benchmark e proventi</p>
                  I portafogli modello sono ETF in USD con ribilanciamento annuale, convertiti in EUR ai cambi di fine mese e annualizzati sugli
                  stessi mesi del tuo portafoglio, ciascuno fino al suo ultimo mese disponibile. YOC e rendimento corrente contano solo gli
                  asset posseduti oggi: dividendi annualizzati sul costo medio o sul valore di mercato.
                </div>
              </div>
            </Tile>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
