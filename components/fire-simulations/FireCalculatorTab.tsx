'use client';

/**
 * FireCalculatorTab Component
 *
 * FIRE (Financial Independence Retire Early) calculator interface displaying
 * current and planned metrics for retirement planning.
 *
 * Design Approach - Dependent Query Pattern (Teacher Comment):
 *
 * The component uses a three-tier query dependency chain:
 * 1. settings query (independent)
 * 2. assets query (independent)
 * 3. fireData query (depends on both #1 and #2 being loaded)
 *
 * Why? fireData calculation requires currentNetWorth (from assets) and
 * withdrawalRate (from settings). React Query's 'enabled' flag prevents
 * fireData query from running until dependencies are ready, avoiding
 * unnecessary API calls with incomplete data.
 *
 * FIRE Net Worth Calculation:
 * - Uses calculateFIRENetWorth() which conditionally excludes primary residences
 * - User setting includePrimaryResidenceInFIRE controls inclusion/exclusion
 * - Standard FIRE methodology excludes primary homes (not liquid for retirement income)
 * - Some users prefer to include home equity if planning to downsize in retirement
 *
 * Key Metrics Displayed:
 * - Current Metrics:
 *   - FIRE Number: Net worth needed to retire (annual expenses / withdrawal rate)
 *   - Progress %: (current net worth / FIRE number) * 100
 *   - Current Allowances: Annual/monthly/daily spending based on safe withdrawal rate
 *   - Withdrawal Rate: % of portfolio withdrawn annually (default 4%)
 *   - Years of Expenses: How long current net worth would last at current spending
 *
 * - Planned Metrics (optional, if user sets plannedAnnualExpenses):
 *   - Shows same metrics calculated with planned expenses instead of current
 *   - Helps users model lifestyle changes or expense reductions in retirement
 *
 * - Historical Chart:
 *   - Line chart showing income, expenses, monthly allowance evolution over time
 *   - Visualizes progress toward FIRE goal
 *
 * Settings Mutation:
 * User can edit withdrawal rate and planned expenses, triggering cache invalidation
 * and automatic recalculation of all dependent metrics.
 *
 * @returns Tab component with metric cards, settings form, and historical chart
 */

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { useAuth } from '@/contexts/AuthContext';
import { getAllAssets, calculateTotalValue, calculateFIRENetWorth, calculateLiquidFIRENetWorth, calculateIlliquidFIRENetWorth } from '@/lib/services/assetService';
import { getItalyYear } from '@/lib/utils/dateHelpers';
import { getSettings, setSettings, getDefaultTargets } from '@/lib/services/assetAllocationService';
import { getFIREData, calculatePlannedFIREMetrics, calculateFIREMetrics } from '@/lib/services/fireService';
import { formatCurrency, formatCurrencyCompact, formatPercentage } from '@/lib/services/chartService';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { TrendingUp, TrendingDown, Calendar, DollarSign, Percent, Clock, BarChart3, Target, Info, AlertTriangle, Loader2 } from 'lucide-react';
import { FireCalculatorSkeleton } from '@/components/fire-simulations/FireCalculatorSkeleton';
import { toast } from 'sonner';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Settings } from '@/types/settings';
import { FIREProjectionSection } from './FIREProjectionSection';
import { FireReachedBanner } from './FireReachedBanner';

export function FireCalculatorTab() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  // Responsive chart sizing: reduce height and margins on mobile
  const isMobile = useMediaQuery('(max-width: 767px)');

  const [tempWithdrawalRate, setTempWithdrawalRate] = useState<string>('4.0');
  const [tempPlannedAnnualExpenses, setTempPlannedAnnualExpenses] = useState<string>('');
  const [includePrimaryResidence, setIncludePrimaryResidence] = useState<boolean>(false);

  // Fetch settings data
  const { data: settings, isLoading: isLoadingSettings } = useQuery<Settings | null>({
    queryKey: ['settings', user?.uid],
    queryFn: () => getSettings(user!.uid),
    enabled: !!user,
    staleTime: 300000, // 5 minutes
  });

  // Fetch assets data
  const { data: assets, isLoading: isLoadingAssets } = useQuery({
    queryKey: ['assets', user?.uid],
    queryFn: () => getAllAssets(user!.uid),
    enabled: !!user,
    staleTime: 300000, // 5 minutes
  });

  const withdrawalRate = settings?.withdrawalRate ?? 4.0;
  const plannedAnnualExpenses = settings?.plannedAnnualExpenses ?? null;
  const currentNetWorth = assets ? calculateFIRENetWorth(assets, includePrimaryResidence) : 0;
  const liquidNetWorth = assets ? calculateLiquidFIRENetWorth(assets, includePrimaryResidence) : 0;
  const illiquidNetWorth = assets ? calculateIlliquidFIRENetWorth(assets, includePrimaryResidence) : 0;

  // Fetch FIRE data, dependent on assets and settings
  const { data: fireData, isLoading: isLoadingFIRE } = useQuery({
    queryKey: ['fireData', user?.uid, currentNetWorth, withdrawalRate],
    queryFn: () => getFIREData(user!.uid, currentNetWorth, withdrawalRate),
    enabled: !!user && !!assets && currentNetWorth > 0,
    staleTime: 300000, // 5 minutes
  });

  // Re-run pure metrics calculation with liquid/illiquid breakdown.
  // getFIREData fetches async data (expenses, chart); we enrich metrics client-side after receiving annualExpenses.
  const fireMetrics = fireData?.metrics
    ? calculateFIREMetrics(currentNetWorth, fireData.metrics.annualExpenses, withdrawalRate, liquidNetWorth, illiquidNetWorth)
    : null;
  const chartData = fireData?.chartData ?? [];

  // Calculate planned metrics, dependent on fireData and settings
  const plannedFireMetrics =
    plannedAnnualExpenses && plannedAnnualExpenses > 0 && currentNetWorth > 0
      ? calculatePlannedFIREMetrics(currentNetWorth, plannedAnnualExpenses, withdrawalRate)
      : null;

  useEffect(() => {
    if (settings) {
      setTempWithdrawalRate((settings.withdrawalRate ?? 4.0).toString());
      setTempPlannedAnnualExpenses(settings.plannedAnnualExpenses ? settings.plannedAnnualExpenses.toString() : '');
      setIncludePrimaryResidence(settings.includePrimaryResidenceInFIRE ?? false);
    }
  }, [settings]);

  const mutation = useMutation({
    mutationFn: (newSettings: { withdrawalRate: number; plannedAnnualExpenses?: number; includePrimaryResidenceInFIRE?: boolean }) => {
      return setSettings(user!.uid, {
        ...settings,
        targets: settings?.targets || getDefaultTargets(),
        ...newSettings,
      });
    },
    onSuccess: () => {
      toast.success('Impostazioni FIRE salvate con successo');
      // Invalidate and refetch settings
      queryClient.invalidateQueries({ queryKey: ['settings', user?.uid] });
    },
    onError: (error) => {
      console.error('Error saving FIRE settings:', error);
      toast.error('Errore nel salvataggio delle impostazioni FIRE');
    },
  });

  const handleSaveSettings = () => {
    const newWR = parseFloat(tempWithdrawalRate);
    const newPAE = tempPlannedAnnualExpenses.trim() !== '' ? parseFloat(tempPlannedAnnualExpenses) : undefined;

    if (isNaN(newWR) || newWR <= 0 || newWR > 100) {
      toast.error('Inserisci un Withdrawal Rate valido tra 0 e 100');
      return;
    }

    if (newPAE !== undefined && (isNaN(newPAE) || newPAE < 0)) {
      toast.error('Inserisci spese annuali previste valide (numero positivo)');
      return;
    }

    mutation.mutate({
      withdrawalRate: newWR,
      plannedAnnualExpenses: newPAE,
      includePrimaryResidenceInFIRE: includePrimaryResidence
    });
  };

  if (isLoadingSettings || isLoadingAssets || (currentNetWorth > 0 && isLoadingFIRE)) {
    return <FireCalculatorSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* FIRE Reached Banner — shown above the form when net worth meets the FIRE number.
          Guards: fireMetrics must be loaded (not undefined) and fireNumber > 0 to avoid
          false positives while data is still being fetched. */}
      {fireMetrics && user && (
        <FireReachedBanner
          currentNetWorth={currentNetWorth}
          fireNumber={fireMetrics.fireNumber}
          userId={user.uid}
          currentNetWorthFormatted={formatCurrency(currentNetWorth)}
          fireNumberFormatted={formatCurrency(fireMetrics.fireNumber)}
        />
      )}

      {/* Settings Input */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Percent className="h-5 w-5" />
            Impostazioni FIRE
          </CardTitle>
          <CardDescription>
            Configura i parametri per il calcolo del tuo percorso FIRE.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 desktop:grid-cols-2 mb-4">
            <div>
              <Label htmlFor="withdrawalRate">Safe Withdrawal Rate (%)</Label>
              <Input
                id="withdrawalRate"
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={tempWithdrawalRate}
                onChange={(e) => setTempWithdrawalRate(e.target.value)}
                className="mt-1"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Tipicamente 4% secondo la regola del 4% (Trinity Study)
              </p>
            </div>
            <div>
              <Label htmlFor="plannedExpenses">Spese Annuali Previste (€)</Label>
              <Input
                id="plannedExpenses"
                type="number"
                step="100"
                min="0"
                value={tempPlannedAnnualExpenses}
                onChange={(e) => setTempPlannedAnnualExpenses(e.target.value)}
                className="mt-1"
                placeholder="Es. 25000"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Spese annuali che prevedi di avere in FIRE (opzionale)
              </p>
            </div>
          </div>

          {/* Include Primary Residence Setting */}
          <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-4 mb-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="includePrimaryResidence">
                  Includi Casa di Abitazione nel Calcolo FIRE
                </Label>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Se attivo, gli immobili marcati come &quot;casa di abitazione&quot; saranno inclusi nel patrimonio FIRE.
                  Se disattivo, verranno esclusi (metodologia FIRE standard che considera solo asset generatori di reddito).
                </p>
              </div>
              <Switch
                id="includePrimaryResidence"
                checked={includePrimaryResidence}
                onCheckedChange={setIncludePrimaryResidence}
              />
            </div>
          </div>

          <Button
            onClick={handleSaveSettings}
            disabled={mutation.isPending}
            className="w-full desktop:w-auto dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
          >
            {mutation.isPending ? 'Salvataggio...' : 'Salva Impostazioni'}
          </Button>
        </CardContent>
      </Card>

      {/* FIRE Metrics Cards */}
      {fireMetrics && (
        <>
          {/* Section Title: Current Metrics */}
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2"><BarChart3 className="h-5 w-5 text-blue-500" />Metriche Attuali</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Basate sulle tue spese reali dell'anno corrente
            </p>
          </div>

          {/* Row 1: FIRE Number and Progress (Current) */}
          <div className="grid gap-6 desktop:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <TrendingUp className="h-5 w-5 text-blue-500" />
                  FIRE Number
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-blue-600">
                  {formatCurrency(fireMetrics.fireNumber)}
                </div>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                  Patrimonio necessario per raggiungere la FI con spese annuali di {formatCurrency(fireMetrics.annualExpenses)}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Percent className="h-5 w-5 text-green-500" />
                  Progresso verso FI
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-green-600">
                  {formatPercentage(fireMetrics.progressToFI)}
                </div>
                <div className="mt-3">
                  <div className="h-4 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                    <div
                      className="h-full bg-gradient-to-r from-green-400 to-green-600 transition-all"
                      style={{
                        width: `${Math.min(fireMetrics.progressToFI, 100)}%`,
                      }}
                    />
                  </div>
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                    {fireMetrics.progressToFI >= 100
                      ? '🎉 Hai raggiunto la Financial Independence!'
                      : `Ancora ${formatCurrency(fireMetrics.fireNumber - fireMetrics.currentNetWorth)} da accumulare`
                    }
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Planned Metrics Section (if plannedAnnualExpenses is set) */}
          {plannedFireMetrics && fireMetrics && (
            <>
              <div className="mt-8">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2"><Target className="h-5 w-5 text-purple-500" />Metriche Previste</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Basate sulle spese annuali previste che hai impostato ({formatCurrency(plannedFireMetrics.plannedAnnualExpenses)})
                </p>
              </div>

              <div className="grid gap-6 desktop:grid-cols-2">
                <Card className="border-purple-200 bg-purple-50 dark:bg-purple-950/20 dark:border-purple-800">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <TrendingUp className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                      FIRE Number Previsto
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-purple-700 dark:text-purple-300">
                      {formatCurrency(plannedFireMetrics.plannedFireNumber)}
                    </div>
                    <p className="mt-2 text-sm text-purple-900 dark:text-purple-200">
                      Patrimonio target basato sulle spese previste di {formatCurrency(plannedFireMetrics.plannedAnnualExpenses)}
                    </p>
                    {fireMetrics.fireNumber !== plannedFireMetrics.plannedFireNumber && (
                      <p className="mt-2 text-xs text-purple-700 dark:text-purple-300 font-semibold flex items-center gap-1">
                        {plannedFireMetrics.plannedFireNumber < fireMetrics.fireNumber
                          ? <><TrendingDown className="h-3.5 w-3.5 inline shrink-0" />{formatCurrency(fireMetrics.fireNumber - plannedFireMetrics.plannedFireNumber)} in meno rispetto all&apos;attuale</>
                          : <><TrendingUp className="h-3.5 w-3.5 inline shrink-0" />{formatCurrency(plannedFireMetrics.plannedFireNumber - fireMetrics.fireNumber)} in più rispetto all&apos;attuale</>
                        }
                      </p>
                    )}
                  </CardContent>
                </Card>

                <Card className="border-purple-200 bg-purple-50 dark:bg-purple-950/20 dark:border-purple-800">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Percent className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                      Progresso verso FI Previsto
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-purple-700 dark:text-purple-300">
                      {formatPercentage(plannedFireMetrics.plannedProgressToFI)}
                    </div>
                    <div className="mt-3">
                      <div className="h-4 w-full overflow-hidden rounded-full bg-purple-200 dark:bg-purple-900/40">
                        <div
                          className="h-full bg-gradient-to-r from-purple-400 to-purple-600 transition-all"
                          style={{
                            width: `${Math.min(plannedFireMetrics.plannedProgressToFI, 100)}%`,
                          }}
                        />
                      </div>
                      <p className="mt-2 text-sm text-purple-900 dark:text-purple-200">
                        {plannedFireMetrics.plannedProgressToFI >= 100
                          ? '🎉 Hai raggiunto il target previsto!'
                          : `Ancora ${formatCurrency(plannedFireMetrics.plannedFireNumber - fireMetrics.currentNetWorth)} da accumulare per il target previsto`
                        }
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          )}

          {/* Row 2: Allowances — how much you can spend per year/month/day at the safe withdrawal rate */}
          <div className="grid gap-6 sm:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Calendar className="h-5 w-5 text-purple-500" />
                  Indennità Annuale
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="font-mono text-2xl font-bold tabular-nums text-purple-600">
                  {formatCurrency(fireMetrics.annualAllowance)}
                </div>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Patrimonio FIRE × {withdrawalRate}% — quanto puoi prelevare ogni anno senza intaccare il capitale nel lungo periodo
                </p>
                {/* Proportion bar: liquid (green) vs illiquid (amber) share of total allowance */}
                {fireMetrics.annualAllowance > 0 && (
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-amber-200 dark:bg-amber-900/50">
                    <div
                      className="h-full rounded-full bg-green-500 dark:bg-green-400 transition-all"
                      style={{ width: `${(fireMetrics.liquidAnnualAllowance / fireMetrics.annualAllowance) * 100}%` }}
                    />
                  </div>
                )}
                <div className="mt-2 flex flex-col gap-2 border-t pt-3 text-xs text-gray-500 dark:text-gray-400">
                  <div className="flex justify-between">
                    <span>Di cui liquidi</span>
                    <span className="font-mono font-medium tabular-nums text-green-600 dark:text-green-400">{formatCurrency(fireMetrics.liquidAnnualAllowance)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Di cui illiquidi</span>
                    <span className="font-mono font-medium tabular-nums text-amber-600 dark:text-amber-400">{formatCurrency(fireMetrics.illiquidAnnualAllowance)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <DollarSign className="h-5 w-5 text-indigo-500" />
                  Indennità Mensile
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="font-mono text-2xl font-bold tabular-nums text-indigo-600">
                  {formatCurrency(fireMetrics.monthlyAllowance)}
                </div>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Indennità annuale ÷ 12 — reddito mensile passivo sostenibile
                </p>
                {fireMetrics.annualAllowance > 0 && (
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-amber-200 dark:bg-amber-900/50">
                    <div
                      className="h-full rounded-full bg-green-500 dark:bg-green-400 transition-all"
                      style={{ width: `${(fireMetrics.liquidAnnualAllowance / fireMetrics.annualAllowance) * 100}%` }}
                    />
                  </div>
                )}
                <div className="mt-2 flex flex-col gap-2 border-t pt-3 text-xs text-gray-500 dark:text-gray-400">
                  <div className="flex justify-between">
                    <span>Di cui liquidi</span>
                    <span className="font-mono font-medium tabular-nums text-green-600 dark:text-green-400">{formatCurrency(fireMetrics.liquidAnnualAllowance / 12)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Di cui illiquidi</span>
                    <span className="font-mono font-medium tabular-nums text-amber-600 dark:text-amber-400">{formatCurrency(fireMetrics.illiquidAnnualAllowance / 12)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Clock className="h-5 w-5 text-teal-500" />
                  Indennità Giornaliera
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="font-mono text-2xl font-bold tabular-nums text-teal-600">
                  {formatCurrency(fireMetrics.dailyAllowance)}
                </div>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Indennità annuale ÷ 365 — budget giornaliero sostenibile
                </p>
                {fireMetrics.annualAllowance > 0 && (
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-amber-200 dark:bg-amber-900/50">
                    <div
                      className="h-full rounded-full bg-green-500 dark:bg-green-400 transition-all"
                      style={{ width: `${(fireMetrics.liquidAnnualAllowance / fireMetrics.annualAllowance) * 100}%` }}
                    />
                  </div>
                )}
                <div className="mt-2 flex flex-col gap-2 border-t pt-3 text-xs text-gray-500 dark:text-gray-400">
                  <div className="flex justify-between">
                    <span>Di cui liquidi</span>
                    <span className="font-mono font-medium tabular-nums text-green-600 dark:text-green-400">{formatCurrency(fireMetrics.liquidAnnualAllowance / 365)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Di cui illiquidi</span>
                    <span className="font-mono font-medium tabular-nums text-amber-600 dark:text-amber-400">{formatCurrency(fireMetrics.illiquidAnnualAllowance / 365)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Row 3: Current WR and Years of Expenses */}
          <div className="grid gap-6 desktop:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Percent className="h-5 w-5 text-orange-500" />
                  Current Withdrawal Rate
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="font-mono text-3xl font-bold tabular-nums text-orange-600">
                  {formatPercentage(fireMetrics.currentWR)}
                </div>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                  Rapporto tra spese annuali e patrimonio attuale
                </p>
                {fireMetrics.currentWR > withdrawalRate && (
                  <p className="mt-2 text-sm text-red-600 font-semibold flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    Superiore al Safe Withdrawal Rate ({withdrawalRate}%)
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Calendar className="h-5 w-5 text-cyan-500" />
                  Anni di Spesa
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* Primary: liquid years — most actionable since no asset sales are needed */}
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-3xl font-bold tabular-nums text-cyan-600">
                    {fireMetrics.liquidYearsOfExpenses > 0 ? fireMetrics.liquidYearsOfExpenses.toFixed(1) : '—'}
                  </span>
                  {fireMetrics.liquidYearsOfExpenses > 0 && (
                    <span className="text-base font-medium text-cyan-600">anni</span>
                  )}
                  <span className="ml-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/40 dark:text-green-300">
                    liquido
                  </span>
                </div>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  Anni di spesa coperti senza dover vendere immobili o asset illiquidi
                </p>
                {fireMetrics.annualExpenses > 0 && (
                  <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                    Spese annuali {formatCurrency(fireMetrics.annualExpenses)} — recuperate dall&apos;anno {getItalyYear() - 1}
                  </p>
                )}
                {/* Proportion bar: liquid (cyan) vs illiquid (amber) years */}
                {fireMetrics.yearsOfExpenses > 0 && (
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-amber-200 dark:bg-amber-900/50">
                    <div
                      className="h-full rounded-full bg-cyan-500 dark:bg-cyan-400 transition-all"
                      style={{ width: `${Math.min((fireMetrics.liquidYearsOfExpenses / fireMetrics.yearsOfExpenses) * 100, 100)}%` }}
                    />
                  </div>
                )}
                <div className="mt-2 flex flex-col gap-2 border-t pt-3 text-xs text-gray-500 dark:text-gray-400">
                  <div className="flex justify-between">
                    <span>Patrimonio totale FIRE</span>
                    <span className="font-mono font-medium tabular-nums">{fireMetrics.yearsOfExpenses.toFixed(1)} anni</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Solo illiquidi</span>
                    <span className="font-mono font-medium tabular-nums text-amber-600 dark:text-amber-400">
                      {fireMetrics.illiquidYearsOfExpenses > 0 ? `${fireMetrics.illiquidYearsOfExpenses.toFixed(1)} anni` : '—'}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* Chart: Income, Expenses, Monthly Allowance Evolution */}
      <Card>
        <CardHeader>
          <CardTitle>Evoluzione Storica: Entrate, Uscite e Indennità Mensile</CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-gray-500 dark:text-gray-400">
              Nessuno storico disponibile. Gli snapshot mensili verranno creati automaticamente.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={isMobile ? 280 : 400}>
              <LineChart data={chartData} margin={{ left: isMobile ? 10 : 50, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="monthLabel" tick={{ fontSize: isMobile ? 10 : 12 }} />
                <YAxis
                  width={isMobile ? 70 : 100}
                  tickFormatter={(value) => formatCurrencyCompact(value)}
                  tick={{ fontSize: isMobile ? 10 : 12 }}
                />
                <Tooltip
                  formatter={(value: number) => formatCurrency(value)}
                  contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', color: 'var(--card-foreground)' }}
                  labelStyle={{ color: 'var(--foreground)' }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="income"
                  stroke="#10B981"
                  strokeWidth={2}
                  name="Entrate Mensili"
                  dot={{ r: 4 }}
                  animationDuration={800}
                  animationEasing="ease-out"
                />
                <Line
                  type="monotone"
                  dataKey="expenses"
                  stroke="#EF4444"
                  strokeWidth={2}
                  name="Uscite Mensili"
                  dot={{ r: 4 }}
                  animationDuration={800}
                  animationEasing="ease-out"
                />
                <Line
                  type="monotone"
                  dataKey="monthlyAllowance"
                  stroke="#8B5CF6"
                  strokeWidth={2}
                  name="Indennità Mensile"
                  dot={{ r: 4 }}
                  animationDuration={800}
                  animationEasing="ease-out"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* FIRE Projection Scenarios */}
      {fireMetrics && currentNetWorth > 0 && (
        <FIREProjectionSection
          userId={user!.uid}
          currentNetWorth={currentNetWorth}
          withdrawalRate={withdrawalRate}
          settings={settings}
        />
      )}

      {/* Info Box */}
      <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800">
        <CardContent className="pt-6">
          <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2 flex items-center gap-2"><Info className="h-4 w-4 shrink-0" />Come funziona il FIRE?</h3>
          <div className="text-sm text-blue-800 dark:text-blue-200 space-y-2">
            <p>
              <strong>FIRE Number:</strong> È il patrimonio target calcolato come: Spese Annuali ÷ Safe Withdrawal Rate.
              Con un WR del 4%, devi accumulare 25 volte le tue spese annuali.
            </p>
            <p>
              <strong>Safe Withdrawal Rate (SWR):</strong> La percentuale del tuo patrimonio che puoi prelevare ogni anno
              in modo sostenibile. Il 4% è basato sul Trinity Study e su un orizzonte temporale di 30 anni.
            </p>
            <p>
              <strong>Indennità Mensile:</strong> Basata sul tuo patrimonio attuale e sul WR impostato.
              Mostra quanto potresti già prelevare mensilmente in modo sostenibile.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
