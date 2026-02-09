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

interface ScenarioComparisonResultsProps {
  bear: MonteCarloResults;
  base: MonteCarloResults;
  bull: MonteCarloResults;
  retirementYears: number;
  numberOfSimulations: number;
}

// Scenario styling
const SCENARIOS = [
  { key: 'bear' as const, label: 'Scenario Orso', icon: TrendingDown, color: '#EF4444', bgColor: 'bg-red-50', borderColor: 'border-red-200', textColor: 'text-red-700' },
  { key: 'base' as const, label: 'Scenario Base', icon: Target, color: '#6366F1', bgColor: 'bg-indigo-50', borderColor: 'border-indigo-200', textColor: 'text-indigo-700' },
  { key: 'bull' as const, label: 'Scenario Toro', icon: TrendingUp, color: '#10B981', bgColor: 'bg-green-50', borderColor: 'border-green-200', textColor: 'text-green-700' },
] as const;

/**
 * Displays comparison results for Bear/Base/Bull Monte Carlo scenarios.
 *
 * Layout:
 * 1. Three success rate cards side-by-side with scenario-colored borders
 * 2. Overlay chart with 3 median lines + p10-p90 bands per scenario
 * 3. Comparison table with median values at 5-year intervals
 */
export function ScenarioComparisonResults({
  bear,
  base,
  bull,
  retirementYears,
  numberOfSimulations,
}: ScenarioComparisonResultsProps) {
  const resultsByKey = { bear, base, bull };

  // ===== Build overlay chart data =====
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

  // ===== Success rate icon selection =====
  const getSuccessIcon = (rate: number) => {
    if (rate >= 90) return <CheckCircle2 className="h-5 w-5 text-green-600" />;
    if (rate >= 80) return <AlertTriangle className="h-5 w-5 text-amber-500" />;
    return <XCircle className="h-5 w-5 text-red-600" />;
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background border border-border p-3 rounded-lg shadow-lg">
          <p className="font-semibold mb-2">Anno {label}</p>
          <div className="space-y-1.5 text-sm">
            {SCENARIOS.map((s) => {
              const p50 = payload.find((p: any) => p.dataKey === `${s.key}P50`)?.value;
              return p50 !== undefined ? (
                <p key={s.key} style={{ color: s.color }}>
                  {s.label}: {formatCurrency(p50)}
                </p>
              ) : null;
            })}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* ===== Success Rate Cards ===== */}
      <div className="grid gap-4 md:grid-cols-3">
        {SCENARIOS.map((s) => {
          const result = resultsByKey[s.key];
          const Icon = s.icon;
          return (
            <Card key={s.key} className={`${s.borderColor} ${s.bgColor}`}>
              <CardHeader className="pb-2">
                <CardTitle className={`flex items-center gap-2 text-base ${s.textColor}`}>
                  <Icon className="h-4 w-4" />
                  {s.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3 mb-3">
                  {getSuccessIcon(result.successRate)}
                  <span className={`text-3xl font-bold ${s.textColor}`}>
                    {result.successRate.toFixed(1)}%
                  </span>
                </div>
                <div className="space-y-1 text-sm text-muted-foreground">
                  <p>
                    {result.successCount.toLocaleString('it-IT')}/{numberOfSimulations.toLocaleString('it-IT')} simulazioni riuscite
                  </p>
                  <p>
                    Valore mediano finale: {formatCurrencyCompact(result.medianFinalValue)}
                  </p>
                  {result.failureAnalysis && (
                    <p className="text-red-600">
                      Fallimento medio: anno {Math.round(result.failureAnalysis.averageFailureYear)}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ===== Overlay Chart ===== */}
      <Card>
        <CardHeader>
          <CardTitle>Confronto Scenari ({retirementYears} anni)</CardTitle>
          <p className="text-sm text-muted-foreground">
            Linee: mediana (50° percentile). Bande colorate: range 10°-90° percentile per scenario.
          </p>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={overlayData} margin={{ left: 50 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.1} />
              <XAxis
                dataKey="year"
                label={{ value: 'Anni', position: 'insideBottom', offset: -5 }}
                stroke="#9CA3AF"
              />
              <YAxis
                width={100}
                tickFormatter={(value) => formatCurrencyCompact(value)}
                stroke="#9CA3AF"
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <ReferenceLine
                y={0}
                stroke="#ef4444"
                strokeDasharray="3 3"
              />

              {/* p10-p90 bands for each scenario (semi-transparent) */}
              <Area type="monotone" dataKey="bearP90" stroke="none" fill="#EF4444" fillOpacity={0.06} name="Orso p90" legendType="none" />
              <Area type="monotone" dataKey="bearP10" stroke="none" fill="#EF4444" fillOpacity={0.06} name="Orso p10" legendType="none" />
              <Area type="monotone" dataKey="baseP90" stroke="none" fill="#6366F1" fillOpacity={0.06} name="Base p90" legendType="none" />
              <Area type="monotone" dataKey="baseP10" stroke="none" fill="#6366F1" fillOpacity={0.06} name="Base p10" legendType="none" />
              <Area type="monotone" dataKey="bullP90" stroke="none" fill="#10B981" fillOpacity={0.06} name="Toro p90" legendType="none" />
              <Area type="monotone" dataKey="bullP10" stroke="none" fill="#10B981" fillOpacity={0.06} name="Toro p10" legendType="none" />

              {/* Median lines */}
              <Line type="monotone" dataKey="bearP50" stroke="#EF4444" strokeWidth={2.5} dot={false} name="Orso (mediana)" />
              <Line type="monotone" dataKey="baseP50" stroke="#6366F1" strokeWidth={2.5} dot={false} name="Base (mediana)" />
              <Line type="monotone" dataKey="bullP50" stroke="#10B981" strokeWidth={2.5} dot={false} name="Toro (mediana)" />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* ===== Distribution Charts (3 side-by-side) ===== */}
      <div className="grid gap-4 md:grid-cols-3">
        {SCENARIOS.map((s) => {
          const result = resultsByKey[s.key];
          const Icon = s.icon;
          return (
            <Card key={s.key} className={`${s.borderColor}`}>
              <CardHeader className="pb-2">
                <CardTitle className={`flex items-center gap-2 text-sm ${s.textColor}`}>
                  <Icon className="h-3.5 w-3.5" />
                  Distribuzione - {s.label}
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Valori finali dopo {retirementYears} anni
                </p>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={result.distribution} margin={{ left: 10, right: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.1} />
                    <XAxis
                      dataKey="range"
                      angle={-45}
                      textAnchor="end"
                      height={60}
                      stroke="#9CA3AF"
                      tick={{ fontSize: 9 }}
                    />
                    <YAxis
                      width={40}
                      stroke="#9CA3AF"
                      tick={{ fontSize: 9 }}
                    />
                    <Tooltip
                      content={({ active, payload }: any) => {
                        if (active && payload && payload.length) {
                          return (
                            <div className="bg-background border border-border p-2 rounded-lg shadow-lg text-xs">
                              <p className="font-semibold mb-1">{payload[0].payload.range}</p>
                              <p>Simulazioni: {payload[0].value.toLocaleString('it-IT')}</p>
                              <p>Percentuale: {payload[0].payload.percentage.toFixed(1)}%</p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey="count" fill={s.color} radius={[2, 2, 0, 0]} />
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
                  <th className="text-right p-2 text-red-700">Orso (p50)</th>
                  <th className="text-right p-2 text-indigo-700 font-bold">Base (p50)</th>
                  <th className="text-right p-2 text-green-700">Toro (p50)</th>
                </tr>
              </thead>
              <tbody>
                {base.percentiles
                  .filter((_, index) => index % 5 === 0)
                  .map((baseP, i) => {
                    const year = baseP.year;
                    const bearP50 = bear.percentiles.find((p) => p.year === year)?.p50 ?? 0;
                    const bullP50 = bull.percentiles.find((p) => p.year === year)?.p50 ?? 0;
                    return (
                      <tr key={year} className="border-b">
                        <td className="p-2">{year}</td>
                        <td className="text-right p-2 text-red-700">{formatCurrencyCompact(bearP50)}</td>
                        <td className="text-right p-2 text-indigo-700 font-bold">{formatCurrencyCompact(baseP.p50)}</td>
                        <td className="text-right p-2 text-green-700">{formatCurrencyCompact(bullP50)}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
