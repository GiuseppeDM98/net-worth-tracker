import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MonteCarloResults } from '@/types/assets';
import { TrendingDown, Target, TrendingUp, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import {
  LineChart,
  Line,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { formatCurrency, formatCurrencyCompact } from '@/lib/services/chartService';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { cardItem, goalLinkSettle, simulationShellSettle, simulationStagger } from '@/lib/utils/motionVariants';

interface ScenarioComparisonResultsProps {
  bear: MonteCarloResults;
  base: MonteCarloResults;
  bull: MonteCarloResults;
  retirementYears: number;
  numberOfSimulations: number;
  refreshKey?: number;
}

// Static scenario definitions — colors resolved at runtime from useChartColors()
const SCENARIO_DEFS = [
  { key: 'bear' as const, label: 'Scenario Orso', icon: TrendingDown, colorIndex: 4 as const },
  { key: 'base' as const, label: 'Scenario Base', icon: Target, colorIndex: 0 as const },
  { key: 'bull' as const, label: 'Scenario Toro', icon: TrendingUp, colorIndex: 1 as const },
] as const;

type ScenarioDef = (typeof SCENARIO_DEFS)[number];

// Module-level tooltip — Recharts cloneElement passes active/payload/label at render time,
// while our extra props (e.g. scenarioDefs, colors) are preserved from instantiation.
function ScenarioOverlayTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  // Read median lines only; identify scenario by matching the stroke color from payload
  const medianLines = payload.filter((p: any) => p.dataKey?.endsWith('P50'));
  return (
    <div
      style={{
        backgroundColor: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        padding: '12px',
        color: 'var(--card-foreground)',
      }}
    >
      <p className="font-semibold mb-2" style={{ color: 'var(--card-foreground)' }}>
        Anno {label}
      </p>
      <div className="space-y-1.5 text-sm">
        {medianLines.map((p: any) => (
          <p key={p.dataKey} style={{ color: p.stroke || p.color }}>
            {p.name}: {formatCurrency(p.value)}
          </p>
        ))}
      </div>
    </div>
  );
}

function DistributionBarTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        backgroundColor: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        padding: '8px',
        color: 'var(--card-foreground)',
        fontSize: '12px',
      }}
    >
      <p className="font-semibold mb-1">{payload[0].payload.range}</p>
      <p>Simulazioni: {payload[0].value.toLocaleString('it-IT')}</p>
      <p>Percentuale: {payload[0].payload.percentage.toFixed(1)}%</p>
    </div>
  );
}

const successIcon = (rate: number) => {
  if (rate >= 90) return <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />;
  if (rate >= 80) return <AlertTriangle className="h-5 w-5 text-amber-500 dark:text-amber-400" />;
  return <XCircle className="h-5 w-5 text-destructive" />;
};

const overlayTooltipEl = <ScenarioOverlayTooltip />;
const distTooltipEl = <DistributionBarTooltip />;

/**
 * Displays comparison results for Bear/Base/Bull Monte Carlo scenarios.
 *
 * Layout:
 * 1. Three success rate cards with scenario-colored borders (color-mix for theme-awareness)
 * 2. Overlay chart with 3 median lines + p10-p90 bands per scenario
 * 3. Distribution histograms side-by-side
 * 4. Comparison table with median values at 5-year intervals
 */
export function ScenarioComparisonResults({
  bear,
  base,
  bull,
  retirementYears,
  numberOfSimulations,
  refreshKey = 0,
}: ScenarioComparisonResultsProps) {
  const reducedMotion = useReducedMotion();
  const chartColors = useChartColors();
  const resultsByKey = { bear, base, bull };
  const [activeScenario, setActiveScenario] = useState<ScenarioDef['key']>('base');
  const [resultsAnimationState, setResultsAnimationState] = useState<'idle' | 'settle'>('idle');

  useEffect(() => {
    if (reducedMotion) {
      setResultsAnimationState('idle');
      return;
    }
    setResultsAnimationState('settle');
    const timer = window.setTimeout(() => setResultsAnimationState('idle'), 320);
    return () => window.clearTimeout(timer);
  }, [reducedMotion, refreshKey]);

  // Merge percentile data from all 3 scenarios into a single dataset keyed by year
  const overlayData = base.percentiles.map((baseP, i) => ({
    year: baseP.year,
    bearP10: bear.percentiles[i]?.p10 ?? 0,
    bearP50: bear.percentiles[i]?.p50 ?? 0,
    bearP90: bear.percentiles[i]?.p90 ?? 0,
    baseP10: baseP.p10,
    baseP50: baseP.p50,
    baseP90: baseP.p90,
    bullP10: bull.percentiles[i]?.p10 ?? 0,
    bullP50: bull.percentiles[i]?.p50 ?? 0,
    bullP90: bull.percentiles[i]?.p90 ?? 0,
  }));

  // Derive runtime colors: bear=warning, base=primary, bull=positive
  const scenarioColors: Record<ScenarioDef['key'], string> = {
    bear: chartColors[4],
    base: chartColors[0],
    bull: chartColors[1],
  };

  return (
    <motion.div
      className="space-y-6"
      variants={simulationShellSettle}
      initial={false}
      animate={resultsAnimationState}
    >
      {/* ===== Success Rate Cards ===== */}
      <motion.div
        className="grid gap-4 desktop:grid-cols-3"
        variants={simulationStagger}
        initial={reducedMotion ? false : 'hidden'}
        animate="visible"
      >
        {SCENARIO_DEFS.map((s) => {
          const result = resultsByKey[s.key];
          const Icon = s.icon;
          const isActive = activeScenario === s.key;
          const color = scenarioColors[s.key];
          return (
            <motion.div key={s.key} variants={cardItem}>
              <Card
                className={`overflow-hidden transition-[box-shadow,opacity] duration-200 ${isActive ? 'shadow-md' : 'opacity-90'}`}
                style={{
                  borderColor: `color-mix(in srgb, ${color} 35%, transparent)`,
                  background: `color-mix(in srgb, ${color} 6%, transparent)`,
                }}
              >
                <CardHeader className="pb-2">
                  <button
                    type="button"
                    onClick={() => setActiveScenario(s.key)}
                    className="w-full text-left"
                  >
                    <CardTitle className="flex items-center gap-2 text-base" style={{ color }}>
                      <Icon className="h-4 w-4" />
                      {s.label}
                    </CardTitle>
                  </button>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3 mb-3">
                    {successIcon(result.successRate)}
                    <span className="text-3xl font-bold font-mono" style={{ color }}>
                      {result.successRate.toFixed(1)}%
                    </span>
                  </div>
                  <div className="space-y-1 text-sm text-muted-foreground">
                    <p>
                      {result.successCount.toLocaleString('it-IT')}/
                      {numberOfSimulations.toLocaleString('it-IT')} simulazioni riuscite
                    </p>
                    <p>Valore mediano finale: {formatCurrencyCompact(result.medianFinalValue)}</p>
                    {result.failureAnalysis && (
                      <p style={{ color: 'var(--destructive)' }}>
                        Fallimento medio: anno {Math.round(result.failureAnalysis.averageFailureYear)}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </motion.div>

      {/* ===== Overlay Chart ===== */}
      <motion.div variants={goalLinkSettle} initial={false} animate={resultsAnimationState}>
        <Card>
          <CardHeader>
            <CardTitle>Confronto Scenari ({retirementYears} anni)</CardTitle>
            <p className="text-sm text-muted-foreground">
              Linee: mediana (50° percentile). Bande colorate: range 10°-90° per scenario.
            </p>
            <p className="text-xs text-muted-foreground">
              Focus attivo:{' '}
              {SCENARIO_DEFS.find((s) => s.key === activeScenario)?.label}. Le altre traiettorie
              restano visibili ma subordinate.
            </p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={overlayData} margin={{ left: 50 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="year"
                  label={{ value: 'Anni', position: 'insideBottom', offset: -5 }}
                  stroke="var(--border)"
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                />
                <YAxis
                  width={100}
                  tickFormatter={(value) => formatCurrencyCompact(value)}
                  stroke="var(--border)"
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                />
                <Tooltip content={overlayTooltipEl} cursor={{ fill: 'rgba(128, 128, 128, 0.1)' }} />
                <Legend />
                <ReferenceLine y={0} stroke="var(--destructive)" strokeDasharray="3 3" />

                {/* p10-p90 bands for each scenario — isAnimationActive={false} because 6
                    stacked decorative areas animating individually produces a chaotic sequence.
                    The median lines animate cleanly in their place. */}
                {SCENARIO_DEFS.map((s) => {
                  const opacity = activeScenario === s.key ? 0.11 : 0.04;
                  const color = scenarioColors[s.key];
                  return [
                    <Area
                      key={`${s.key}P90`}
                      type="monotone"
                      dataKey={`${s.key}P90`}
                      stroke="none"
                      fill={color}
                      fillOpacity={opacity}
                      legendType="none"
                      isAnimationActive={false}
                    />,
                    <Area
                      key={`${s.key}P10`}
                      type="monotone"
                      dataKey={`${s.key}P10`}
                      stroke="none"
                      fill={color}
                      fillOpacity={opacity}
                      legendType="none"
                      isAnimationActive={false}
                    />,
                  ];
                })}

                {/* Median lines */}
                {SCENARIO_DEFS.map((s) => {
                  const isActive = activeScenario === s.key;
                  const color = scenarioColors[s.key];
                  return (
                    <Line
                      key={`${s.key}P50`}
                      type="monotone"
                      dataKey={`${s.key}P50`}
                      stroke={color}
                      strokeOpacity={isActive ? 1 : 0.5}
                      strokeWidth={isActive ? 3 : 2}
                      dot={false}
                      name={`${s.label} (mediana)`}
                      animationDuration={800}
                      animationEasing="ease-out"
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </motion.div>

      {/* ===== Distribution Charts (3 side-by-side) ===== */}
      <div className="grid gap-4 desktop:grid-cols-3">
        {SCENARIO_DEFS.map((s) => {
          const result = resultsByKey[s.key];
          const Icon = s.icon;
          const isActive = activeScenario === s.key;
          const color = scenarioColors[s.key];
          return (
            <Card
              key={s.key}
              className={`overflow-hidden transition-[opacity] duration-200 ${isActive ? '' : 'opacity-80'}`}
              style={{ borderColor: `color-mix(in srgb, ${color} 30%, transparent)` }}
            >
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm" style={{ color }}>
                  <Icon className="h-3.5 w-3.5" />
                  Distribuzione — {s.label}
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Valori finali dopo {retirementYears} anni
                </p>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={result.distribution} margin={{ left: 10, right: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis
                      dataKey="range"
                      angle={-45}
                      textAnchor="end"
                      height={60}
                      stroke="var(--border)"
                      tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }}
                    />
                    <YAxis
                      width={40}
                      stroke="var(--border)"
                      tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }}
                    />
                    <Tooltip cursor={{ fill: 'rgba(128, 128, 128, 0.1)' }} content={distTooltipEl} />
                    <Bar
                      dataKey="count"
                      fill={color}
                      radius={[2, 2, 0, 0]}
                      animationDuration={600}
                      animationEasing="ease-out"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ===== Comparison Table ===== */}
      <Card>
        <CardHeader>
          <CardTitle>Tabella Comparativa (Mediana)</CardTitle>
          <p className="text-sm text-muted-foreground">
            Valore mediano del patrimonio per ogni scenario a intervalli di 5 anni
          </p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">Anno</th>
                  {SCENARIO_DEFS.map((s) => (
                    <th
                      key={s.key}
                      className="text-right p-2"
                      style={{ color: scenarioColors[s.key] }}
                    >
                      {s.label} (p50)
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {base.percentiles
                  .filter((_, index) => index % 5 === 0)
                  .map((baseP) => {
                    const year = baseP.year;
                    const bearP50 = bear.percentiles.find((p) => p.year === year)?.p50 ?? 0;
                    const bullP50 = bull.percentiles.find((p) => p.year === year)?.p50 ?? 0;
                    return (
                      <tr key={year} className="border-b">
                        <td className="p-2">{year}</td>
                        <td
                          className="text-right p-2"
                          style={{ color: scenarioColors.bear }}
                        >
                          {formatCurrencyCompact(bearP50)}
                        </td>
                        <td
                          className="text-right p-2 font-bold"
                          style={{ color: scenarioColors.base }}
                        >
                          {formatCurrencyCompact(baseP.p50)}
                        </td>
                        <td
                          className="text-right p-2"
                          style={{ color: scenarioColors.bull }}
                        >
                          {formatCurrencyCompact(bullP50)}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
