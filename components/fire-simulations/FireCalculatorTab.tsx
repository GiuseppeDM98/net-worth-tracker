'use client';

/**
 * FireCalculatorTab Component
 *
 * Trade Republic hierarchy: settings collapse at the top (config-first — collapsed once a
 * withdrawal rate is saved), FIRE Number hero below, all metrics in flat divide-y rows.
 *
 * Data flow:
 * 1. settings + assets queries (independent, staleTime 5min)
 * 2. fireData query (depends on assets + settings — gated by `enabled`)
 * 3. displayedFireMetrics derived client-side via useMemo so preview changes (WR)
 *    are instant without re-fetching
 *
 * Preview pattern: user edits form → temp state updates → displayed metrics
 * re-compute instantly → banner "Anteprima locale attiva" appears → explicit Save
 * persists to Firestore and invalidates queries. "Annulla" resets temp state to
 * the last saved values.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { useChartColors } from '@/lib/hooks/useChartColors';
import {
  getAllAssets,
  calculateFIRENetWorth,
  calculateLiquidFIRENetWorth,
  calculateIlliquidFIRENetWorth,
} from '@/lib/services/assetService';
import { getItalyYear } from '@/lib/utils/dateHelpers';
import { getSettings, setSettings, getDefaultTargets } from '@/lib/services/assetAllocationService';
import {
  getFIREData,
  calculateFIREMetrics,
  prepareRunwaySummaryLabel,
} from '@/lib/services/fireService';
import { formatCurrency, formatCurrencyCompact, formatPercentage } from '@/lib/services/chartService';
import { fmtCurrency } from '@/lib/utils/chartUtils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  AlertTriangle,
  ChevronDown,
  HelpCircle,
  Info,
  Loader2,
} from 'lucide-react';
import { FireCalculatorSkeleton } from '@/components/fire-simulations/FireCalculatorSkeleton';
import { toast } from 'sonner';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Settings } from '@/types/settings';
import { FIREProjectionSection } from './FIREProjectionSection';
import { FireReachedBanner } from './FireReachedBanner';
import { cn } from '@/lib/utils';
import { useCountUp } from '@/lib/utils/useCountUp';

const FIRE_CONTROL_CLASSNAME =
  'mt-1 transition-[border-color,background-color,box-shadow] duration-200 focus-visible:ring-2 focus-visible:ring-primary/25 motion-reduce:transition-none';

// Leaf nodes isolate count-up re-renders so surrounding layout doesn't reflow
function SettledCurrencyValue({ value, className }: { value: number | null; className?: string }) {
  const animatedValue = useCountUp(value, { fromPrevious: true, duration: 520, startDelay: 0 });
  return <span className={className}>{formatCurrency(animatedValue ?? value ?? 0)}</span>;
}

function SettledPercentageValue({ value, className }: { value: number | null; className?: string }) {
  const animatedValue = useCountUp(value, { fromPrevious: true, duration: 520, startDelay: 0 });
  return <span className={className}>{formatPercentage(animatedValue ?? value ?? 0)}</span>;
}

function SettledYearsValue({
  value,
  className,
  decimals = 1,
}: {
  value: number | null;
  className?: string;
  decimals?: number;
}) {
  const animatedValue = useCountUp(value, { fromPrevious: true, duration: 520, startDelay: 0 });
  if (value === null) return <span className={className}>—</span>;
  return <span className={className}>{(animatedValue ?? value).toFixed(decimals)}</span>;
}

function roundRunwayYears(value: number): number {
  return Math.round(value * 10) / 10;
}

function calculateDisplayedRunwayDelta(
  latestValue: number | null | undefined,
  comparisonValue: number | null | undefined
): number | null {
  if (latestValue == null || comparisonValue == null) return null;
  return roundRunwayYears(roundRunwayYears(latestValue) - roundRunwayYears(comparisonValue));
}

export function FireCalculatorTab() {
  const { user } = useAuth();
  const { ownerId } = useActiveAccount();
  const isDemo = useDemoMode();
  const queryClient = useQueryClient();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const chartColors = useChartColors();

  const [tempWithdrawalRate, setTempWithdrawalRate] = useState<string>('4.0');
  const [includePrimaryResidence, setIncludePrimaryResidence] = useState<boolean>(false);
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [howItWorksOpen, setHowItWorksOpen] = useState<boolean>(false);

  const { data: settings, isLoading: isLoadingSettings } = useQuery<Settings | null>({
    queryKey: ['settings', ownerId],
    queryFn: () => getSettings(user!.uid),
    enabled: !!user,
    staleTime: 300000,
  });

  const { data: assets, isLoading: isLoadingAssets } = useQuery({
    queryKey: ['assets', ownerId],
    queryFn: () => getAllAssets(user!.uid),
    enabled: !!user,
    staleTime: 300000,
  });

  const withdrawalRate = settings?.withdrawalRate ?? 4.0;
  const currentNetWorth = assets ? calculateFIRENetWorth(assets, includePrimaryResidence) : 0;
  const liquidNetWorth = assets ? calculateLiquidFIRENetWorth(assets, includePrimaryResidence) : 0;
  const illiquidNetWorth = assets ? calculateIlliquidFIRENetWorth(assets, includePrimaryResidence) : 0;

  const { data: fireData, isLoading: isLoadingFIRE } = useQuery({
    queryKey: ['fireData', ownerId, currentNetWorth, withdrawalRate, includePrimaryResidence],
    queryFn: () => getFIREData(user!.uid, currentNetWorth, withdrawalRate, includePrimaryResidence),
    enabled: !!user && !!assets && currentNetWorth > 0,
    staleTime: 300000,
  });

  // Enrich with liquid/illiquid breakdown after async fetch resolves
  const fireMetrics = fireData?.metrics
    ? calculateFIREMetrics(
        currentNetWorth,
        fireData.metrics.annualExpenses,
        withdrawalRate,
        liquidNetWorth,
        illiquidNetWorth
      )
    : null;
  const chartData = fireData?.chartData ?? [];
  const rawRunwayData = fireData?.runwayData ?? [];

  // Preview values: update instantly from temp state without persisting
  const parsedPreviewWithdrawalRate = Number.parseFloat(tempWithdrawalRate);
  const previewWithdrawalRate =
    Number.isFinite(parsedPreviewWithdrawalRate) && parsedPreviewWithdrawalRate > 0
      ? parsedPreviewWithdrawalRate
      : withdrawalRate;
  const hasUnsavedChanges =
    tempWithdrawalRate !== (settings?.withdrawalRate ?? 4.0).toString() ||
    includePrimaryResidence !== (settings?.includePrimaryResidenceInFIRE ?? false);

  // Decide the panel's initial state ONCE, after the form has settled to match saved settings
  // (hasUnsavedChanges === false ⇒ temp state has been seeded). Collapsed when a withdrawal rate
  // is already saved, open for config-first users. Waiting for the settled state avoids the
  // transient first-render mismatch (temp '4.0' vs saved '4') popping the panel open. The settings
  // inputs live inside the collapsible, so genuine edits only happen while it is already open.
  const hasSeededSettingsRef = useRef(false);
  useEffect(() => {
    if (hasSeededSettingsRef.current || isLoadingSettings || hasUnsavedChanges) return;
    hasSeededSettingsRef.current = true;
    if (settings?.withdrawalRate == null) setSettingsOpen(true);
  }, [isLoadingSettings, hasUnsavedChanges, settings?.withdrawalRate]);

  // After seeding, reopen if a genuine unsaved edit appears (keeps the preview banner visible).
  useEffect(() => {
    if (hasSeededSettingsRef.current && hasUnsavedChanges) setSettingsOpen(true);
  }, [hasUnsavedChanges]);

  const displayedFireMetrics = useMemo(() => {
    if (!fireData?.metrics) return null;
    return calculateFIREMetrics(
      currentNetWorth,
      fireData.metrics.annualExpenses,
      previewWithdrawalRate,
      liquidNetWorth,
      illiquidNetWorth
    );
  }, [currentNetWorth, fireData?.metrics, liquidNetWorth, previewWithdrawalRate, illiquidNetWorth]);

  const displayedRunwayData = useMemo(() => {
    const targetYearsOfExpenses = previewWithdrawalRate > 0 ? 100 / previewWithdrawalRate : null;
    return rawRunwayData.map((point) => ({
      ...point,
      targetYearsOfExpenses,
      fireProgressToFI:
        point.trailing12mExpenses > 0 && previewWithdrawalRate > 0
          ? (point.fireNetWorthUsed /
              (point.trailing12mExpenses / (previewWithdrawalRate / 100))) *
            100
          : null,
    }));
  }, [previewWithdrawalRate, rawRunwayData]);

  const displayedRunwaySummary = useMemo(() => {
    const latestPoint = displayedRunwayData[displayedRunwayData.length - 1] ?? null;
    const comparisonPoint = latestPoint
      ? (displayedRunwayData.find(
          (p) => p.year === latestPoint.year - 1 && p.month === latestPoint.month
        ) ?? null)
      : null;
    return {
      currentMonthLabel: latestPoint?.monthLabel ?? null,
      currentYearsOfExpenses: latestPoint?.yearsOfExpenses ?? null,
      currentLiquidYearsOfExpenses: latestPoint?.liquidYearsOfExpenses ?? null,
      totalDeltaVs12Months: calculateDisplayedRunwayDelta(
        latestPoint?.yearsOfExpenses,
        comparisonPoint?.yearsOfExpenses
      ),
      liquidDeltaVs12Months: calculateDisplayedRunwayDelta(
        latestPoint?.liquidYearsOfExpenses,
        comparisonPoint?.liquidYearsOfExpenses
      ),
      currentProgressToFI: latestPoint?.fireProgressToFI ?? null,
      targetYearsOfExpenses:
        latestPoint?.targetYearsOfExpenses ??
        (previewWithdrawalRate > 0 ? 100 / previewWithdrawalRate : null),
    };
  }, [displayedRunwayData, previewWithdrawalRate]);

  // Sync form state when settings load or change (runs once data has loaded — even when the user
  // has no settings doc yet — so temp state always settles to the saved-or-default values).
  useEffect(() => {
    if (isLoadingSettings) return;
    setTempWithdrawalRate((settings?.withdrawalRate ?? 4.0).toString());
    setIncludePrimaryResidence(settings?.includePrimaryResidenceInFIRE ?? false);
  }, [isLoadingSettings, settings]);

  const handleResetToSaved = () => {
    setTempWithdrawalRate((settings?.withdrawalRate ?? 4.0).toString());
    setIncludePrimaryResidence(settings?.includePrimaryResidenceInFIRE ?? false);
  };

  const mutation = useMutation({
    mutationFn: (newSettings: {
      withdrawalRate: number;
      includePrimaryResidenceInFIRE?: boolean;
    }) =>
      setSettings(user!.uid, {
        ...settings,
        targets: settings?.targets || getDefaultTargets(),
        ...newSettings,
      }),
    onSuccess: () => {
      toast.success('Impostazioni FIRE salvate con successo');
      queryClient.invalidateQueries({ queryKey: ['settings', ownerId] });
    },
    onError: (error) => {
      console.error('Error saving FIRE settings:', error);
      toast.error('Errore nel salvataggio delle impostazioni FIRE');
    },
  });

  const handleSaveSettings = () => {
    const newWR = parseFloat(tempWithdrawalRate);

    if (isNaN(newWR) || newWR <= 0 || newWR > 100) {
      toast.error('Inserisci un Withdrawal Rate valido tra 0 e 100');
      return;
    }

    mutation.mutate({
      withdrawalRate: newWR,
      includePrimaryResidenceInFIRE: includePrimaryResidence,
    });
  };

  if (isLoadingSettings || isLoadingAssets || (currentNetWorth > 0 && isLoadingFIRE)) {
    return <FireCalculatorSkeleton />;
  }

  // Compact trigger label summarises active settings at a glance
  const settingsTriggerLabel = `Safe Withdrawal Rate ${previewWithdrawalRate}%`;

  return (
    <div className="space-y-6">
      {/* Conditional banner — guards on fireMetrics (saved WR) to avoid false positives during preview */}
      {fireMetrics && user && ownerId && (
        <FireReachedBanner
          currentNetWorth={currentNetWorth}
          fireNumber={fireMetrics.fireNumber}
          userId={ownerId}
          currentNetWorthFormatted={formatCurrency(currentNetWorth)}
          fireNumberFormatted={formatCurrency(fireMetrics.fireNumber)}
        />
      )}

      {/* Settings — collapsed by default, auto-opens when unsaved changes are present */}
      <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen}>
        <Card className="overflow-hidden">
          <CollapsibleTrigger asChild>
            <div className="flex cursor-pointer items-center justify-between px-6 py-4 transition-colors hover:bg-muted/30">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">Impostazioni FIRE</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {settingsTriggerLabel}
                </p>
              </div>
              <div className="ml-3 flex shrink-0 items-center gap-2">
                {hasUnsavedChanges && (
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-amber-500"
                    aria-label="Modifiche non salvate"
                  />
                )}
                <ChevronDown
                  className={cn(
                    'h-4 w-4 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none',
                    settingsOpen && 'rotate-180'
                  )}
                />
              </div>
            </div>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <div className="space-y-4 border-t border-border px-6 py-4">
              {/* Unsaved changes banner — Info at rest, Loader2 only during mutation */}
              {hasUnsavedChanges && (
                <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
                  <div className="flex items-start gap-2">
                    {mutation.isPending ? (
                      <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                    ) : (
                      <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <div className="space-y-0.5">
                      <p className="font-medium text-foreground">Anteprima locale attiva</p>
                      <p className="text-xs text-muted-foreground">
                        Le metriche riflettono i valori inseriti ma non ancora salvati.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid gap-4">
                <div>
                  <div className="mb-1 flex items-center gap-1.5">
                    <Label htmlFor="withdrawalRate">Safe Withdrawal Rate (%)</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="text-muted-foreground/60 transition-colors hover:text-muted-foreground focus-visible:outline-none"
                          aria-label="Informazioni sul Safe Withdrawal Rate"
                        >
                          <HelpCircle className="h-3.5 w-3.5" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent side="top" className="max-w-[280px] text-sm leading-relaxed">
                        La percentuale del patrimonio che puoi prelevare ogni anno in modo
                        sostenibile. Il 4% (regola del 4%, Trinity Study) garantisce la
                        sopravvivenza del portafoglio su 30 anni nel 95% degli scenari storici.
                      </PopoverContent>
                    </Popover>
                  </div>
                  <Input
                    id="withdrawalRate"
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={tempWithdrawalRate}
                    onChange={(e) => setTempWithdrawalRate(e.target.value)}
                    className={FIRE_CONTROL_CLASSNAME}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Tipicamente 4% secondo la regola del 4% (Trinity Study)
                  </p>
                </div>
              </div>

              <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-muted/30 p-4">
                <div className="min-w-0 space-y-0.5">
                  <Label htmlFor="includePrimaryResidence" className="leading-normal">
                    Includi casa di abitazione nel FIRE
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Se disattivo, gli immobili di abitazione sono esclusi (metodologia FIRE
                    standard).
                  </p>
                </div>
                <Switch
                  id="includePrimaryResidence"
                  checked={includePrimaryResidence}
                  onCheckedChange={setIncludePrimaryResidence}
                  className="mt-0.5 shrink-0"
                />
              </div>

              <div className="flex items-center gap-3">
                <Button
                  onClick={handleSaveSettings}
                  disabled={isDemo || mutation.isPending}
                  title={isDemo ? 'Non disponibile in modalità demo' : undefined}
                >
                  {mutation.isPending
                    ? 'Salvataggio...'
                    : hasUnsavedChanges
                      ? 'Salva Anteprima'
                      : 'Salva Impostazioni'}
                </Button>
                {hasUnsavedChanges && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleResetToSaved}
                    disabled={mutation.isPending}
                  >
                    Annulla
                  </Button>
                )}
              </div>
            </div>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Hero: FIRE Number — dominant value, progress chip inline, WR corrente as secondary row */}
      {displayedFireMetrics && (
        <Card className="overflow-hidden">
          <div className="px-6 py-5">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground/70">
              FIRE NUMBER
            </p>
            <p className="font-mono text-4xl font-bold tabular-nums text-foreground mt-1 leading-none tracking-tight">
              <SettledCurrencyValue value={displayedFireMetrics.fireNumber} />
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
                <SettledPercentageValue value={displayedFireMetrics.progressToFI} />
                {' '}verso FI
              </span>
              {displayedFireMetrics.progressToFI < 100 && (
                <span className="text-xs text-muted-foreground">
                  ancora{' '}
                  {formatCurrency(displayedFireMetrics.fireNumber - currentNetWorth)}
                </span>
              )}
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {formatCurrency(displayedFireMetrics.annualExpenses)} &divide;{' '}
              {previewWithdrawalRate}% &mdash; spese {getItalyYear() - 1} su SWR
            </p>
          </div>
          <div className="divide-y divide-border border-t border-border">
            {/* WR Corrente: shown red when above safe rate — the only metric that earns color here */}
            <div className="flex items-center justify-between px-6 py-3.5">
              <span className="text-sm text-muted-foreground">WR Corrente</span>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'font-mono text-sm font-semibold tabular-nums',
                    displayedFireMetrics.currentWR > previewWithdrawalRate
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-foreground'
                  )}
                >
                  <SettledPercentageValue value={displayedFireMetrics.currentWR} />
                </span>
                {displayedFireMetrics.currentWR > previewWithdrawalRate && (
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-600 dark:text-red-400" />
                )}
              </div>
            </div>
            {/* Formula breakdown: makes explicit which two numbers drive the WR */}
            {displayedFireMetrics.currentWR > previewWithdrawalRate && (
              <div className="px-6 py-2">
                <p className="font-mono text-xs text-muted-foreground tabular-nums">
                  {formatCurrency(displayedFireMetrics.annualExpenses)} /{' '}
                  {formatCurrency(currentNetWorth)} &mdash; spese {getItalyYear() - 1} su
                  patrimonio attuale
                </p>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Reddito passivo sostenibile: annual allowance as hero, monthly/daily/years as rows */}
      {displayedFireMetrics && (
        <Card className="overflow-hidden">
          <div className="px-6 py-5">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground/70">
              REDDITO PASSIVO SOSTENIBILE
            </p>
            <p className="font-mono text-4xl font-bold tabular-nums text-foreground mt-1 leading-none tracking-tight">
              <SettledCurrencyValue value={displayedFireMetrics.annualAllowance} />
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Patrimonio FIRE {formatCurrency(currentNetWorth)} &times;{' '}
              {previewWithdrawalRate}% annuo
            </p>
          </div>
          <div className="divide-y divide-border border-t border-border">
            <div className="flex items-center justify-between px-6 py-3.5">
              <span className="text-sm text-muted-foreground">Mensile</span>
              <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
                <SettledCurrencyValue value={displayedFireMetrics.monthlyAllowance} />
              </span>
            </div>
            <div className="flex items-center justify-between px-6 py-3.5">
              <span className="text-sm text-muted-foreground">Giornaliero</span>
              <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
                <SettledCurrencyValue value={displayedFireMetrics.dailyAllowance} />
              </span>
            </div>
            {/* yearsOfExpenses is the primary total; liquid/illiquid are the breakdown.
                Showing total first avoids the false implication that illiquid is a subset of liquid. */}
            <div className="flex items-center justify-between px-6 py-3.5">
              <span className="text-sm text-muted-foreground">Anni di spesa totali</span>
              <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
                {displayedFireMetrics.yearsOfExpenses > 0
                  ? `${displayedFireMetrics.yearsOfExpenses.toFixed(1)} anni`
                  : '—'}
              </span>
            </div>
            <div className="flex items-center justify-between px-6 py-3.5">
              <span className="text-sm text-muted-foreground">Di cui liquidi</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
                  {displayedFireMetrics.liquidYearsOfExpenses > 0
                    ? `${displayedFireMetrics.liquidYearsOfExpenses.toFixed(1)} anni`
                    : '—'}
                </span>
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  liquido
                </span>
              </div>
            </div>
            {displayedFireMetrics.illiquidYearsOfExpenses > 0 && (
              <div className="flex items-center justify-between px-6 py-3.5">
                <span className="text-sm text-muted-foreground">Di cui illiquidi</span>
                <span className="font-mono text-sm font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                  {displayedFireMetrics.illiquidYearsOfExpenses.toFixed(1)} anni
                </span>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Runway FIRE storica */}
      <Card>
        <CardHeader>
          <CardTitle>Anni di Spesa Coperti nel Tempo</CardTitle>
          <CardDescription>
            Runway FIRE storica basata sulle spese rolling 12 mesi. La linea tratteggiata mostra
            il target del tuo SWR.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {displayedRunwayData.length === 0 ? (
            <p className="flex h-64 items-center justify-center text-sm text-muted-foreground">
              Servono almeno 12 snapshot mensili per calcolare la runway storica.
            </p>
          ) : (
            <>
              {/* Runway summary: flat divide-y rows — no nested cards */}
              <div className="divide-y divide-border rounded-lg border border-border">
                <div className="flex items-center justify-between px-4 py-3.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">Runway totale</p>
                    <p className="text-xs text-muted-foreground">
                      Liquidi + illiquidi &mdash;{' '}
                      {prepareRunwaySummaryLabel(displayedRunwaySummary.currentMonthLabel)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-0.5">
                    <div className="flex items-baseline gap-1">
                      <SettledYearsValue
                        value={displayedRunwaySummary.currentYearsOfExpenses}
                        className="font-mono text-xl font-bold tabular-nums text-foreground"
                      />
                      {displayedRunwaySummary.currentYearsOfExpenses !== null && (
                        <span className="text-sm text-muted-foreground">anni</span>
                      )}
                    </div>
                    {displayedRunwaySummary.totalDeltaVs12Months !== null && (
                      <span
                        className={cn(
                          'font-mono text-xs tabular-nums',
                          displayedRunwaySummary.totalDeltaVs12Months >= 0
                            ? 'text-green-600 dark:text-green-400'
                            : 'text-red-600 dark:text-red-400'
                        )}
                      >
                        {displayedRunwaySummary.totalDeltaVs12Months >= 0 ? '+' : ''}
                        {displayedRunwaySummary.totalDeltaVs12Months.toFixed(1)} vs 12M
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between px-4 py-3.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">Runway liquida</p>
                    {/* Runway uses rolling 12M expenses as denominator; the card above uses last full year.
                        The two metrics can differ when the spending trend is changing. */}
                    <p className="text-xs text-muted-foreground">
                      Solo asset liquidi &mdash; spese rolling 12 mesi
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-0.5">
                    <div className="flex items-baseline gap-1">
                      <SettledYearsValue
                        value={displayedRunwaySummary.currentLiquidYearsOfExpenses}
                        className="font-mono text-xl font-bold tabular-nums text-foreground"
                      />
                      {displayedRunwaySummary.currentLiquidYearsOfExpenses !== null && (
                        <span className="text-sm text-muted-foreground">anni</span>
                      )}
                    </div>
                    {displayedRunwaySummary.liquidDeltaVs12Months !== null && (
                      <span
                        className={cn(
                          'font-mono text-xs tabular-nums',
                          displayedRunwaySummary.liquidDeltaVs12Months >= 0
                            ? 'text-green-600 dark:text-green-400'
                            : 'text-red-600 dark:text-red-400'
                        )}
                      >
                        {displayedRunwaySummary.liquidDeltaVs12Months >= 0 ? '+' : ''}
                        {displayedRunwaySummary.liquidDeltaVs12Months.toFixed(1)} vs 12M
                      </span>
                    )}
                  </div>
                </div>

                {displayedRunwaySummary.targetYearsOfExpenses !== null && (
                  <div className="flex items-center justify-between px-4 py-3">
                    {/* 1 / SWR = years of expenses the portfolio must cover to sustain the withdrawal indefinitely.
                        Shown as the dashed reference line in the chart below. */}
                    <p className="text-xs text-muted-foreground">
                      Obiettivo patrimonio (anni di spese, linea tratteggiata)
                    </p>
                    <p className="font-mono text-xs font-medium tabular-nums text-muted-foreground">
                      {displayedRunwaySummary.targetYearsOfExpenses.toFixed(1)} anni
                    </p>
                  </div>
                )}
              </div>

              <ResponsiveContainer width="100%" height={isMobile ? 300 : 400}>
                <LineChart
                  data={displayedRunwayData}
                  margin={{ left: isMobile ? 10 : 50, bottom: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="monthLabel" tick={{ fontSize: isMobile ? 10 : 12 }} />
                  <YAxis
                    width={isMobile ? 70 : 100}
                    tickFormatter={(value) => `${Number(value).toFixed(0)}a`}
                    tick={{ fontSize: isMobile ? 10 : 12 }}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload || payload.length === 0) return null;
                      const point = payload[0]?.payload;
                      if (!point) return null;
                      return (
                        <div className="rounded-lg border border-border bg-card p-3 text-sm shadow-sm">
                          <p className="font-semibold text-foreground">{label}</p>
                          <div className="mt-2 space-y-1 text-muted-foreground">
                            <p>
                              Runway totale:{' '}
                              <span className="font-medium text-foreground">
                                {point.yearsOfExpenses !== null
                                  ? `${point.yearsOfExpenses.toFixed(1)} anni`
                                  : '—'}
                              </span>
                            </p>
                            <p>
                              Runway liquida:{' '}
                              <span className="font-medium text-foreground">
                                {point.liquidYearsOfExpenses !== null
                                  ? `${point.liquidYearsOfExpenses.toFixed(1)} anni`
                                  : '—'}
                              </span>
                            </p>
                            <p>
                              Spese rolling 12M:{' '}
                              <span className="font-medium text-foreground">
                                {formatCurrency(point.trailing12mExpenses)}
                              </span>
                            </p>
                            <p>
                              Patrimonio FIRE:{' '}
                              <span className="font-medium text-foreground">
                                {formatCurrency(point.fireNetWorthUsed)}
                              </span>
                            </p>
                            <p>
                              Progresso FIRE:{' '}
                              <span className="font-medium text-foreground">
                                {point.fireProgressToFI !== null
                                  ? formatPercentage(point.fireProgressToFI)
                                  : '—'}
                              </span>
                            </p>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Legend />
                  <ReferenceLine
                    y={displayedRunwaySummary.targetYearsOfExpenses ?? undefined}
                    stroke="var(--chart-3)"
                    strokeWidth={1.5}
                    strokeDasharray="6 4"
                    label={
                      displayedRunwaySummary.targetYearsOfExpenses !== null
                        ? {
                            value: `Target ${displayedRunwaySummary.targetYearsOfExpenses.toFixed(1)} anni`,
                            position: 'insideTopRight',
                            fill: 'var(--chart-3)',
                            fontSize: 11,
                          }
                        : undefined
                    }
                  />
                  <Line
                    type="monotone"
                    dataKey="yearsOfExpenses"
                    stroke={chartColors[0]}
                    strokeWidth={2.5}
                    name="Totale FIRE"
                    dot={{ r: 3 }}
                    connectNulls={false}
                    animationDuration={800}
                    animationEasing="ease-out"
                  />
                  <Line
                    type="monotone"
                    dataKey="liquidYearsOfExpenses"
                    stroke={chartColors[1]}
                    strokeWidth={2.5}
                    name="Solo liquido"
                    dot={{ r: 3 }}
                    connectNulls={false}
                    animationDuration={800}
                    animationEasing="ease-out"
                  />
                </LineChart>
              </ResponsiveContainer>
            </>
          )}
        </CardContent>
      </Card>

      {/* Cashflow e Reddito Passivo nel Tempo */}
      <Card>
        <CardHeader>
          <CardTitle>Cashflow e Reddito Passivo nel Tempo</CardTitle>
          <CardDescription>
            Confronta entrate, uscite e reddito passivo mensile derivato dal patrimonio FIRE dello
            stesso mese.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <p className="flex h-64 items-center justify-center text-sm text-muted-foreground">
              Nessuno storico disponibile. Gli snapshot mensili verranno creati automaticamente.
            </p>
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
                  formatter={fmtCurrency}
                  contentStyle={{
                    backgroundColor: 'var(--card)',
                    border: '1px solid var(--border)',
                    color: 'var(--card-foreground)',
                  }}
                  labelStyle={{ fontWeight: 600, color: 'var(--card-foreground)' }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="income"
                  stroke={chartColors[1]}
                  strokeWidth={2}
                  name="Entrate Mensili"
                  dot={{ r: 4 }}
                  animationDuration={800}
                  animationEasing="ease-out"
                />
                <Line
                  type="monotone"
                  dataKey="expenses"
                  stroke={chartColors[4]}
                  strokeWidth={2}
                  name="Uscite Mensili"
                  dot={{ r: 4 }}
                  animationDuration={800}
                  animationEasing="ease-out"
                />
                <Line
                  type="monotone"
                  dataKey="monthlyAllowance"
                  stroke={chartColors[3]}
                  strokeWidth={2}
                  name="Reddito Passivo"
                  dot={{ r: 4 }}
                  animationDuration={800}
                  animationEasing="ease-out"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* FIRE Projection Scenarios — separate component, untouched */}
      {displayedFireMetrics && currentNetWorth > 0 && (
        <FIREProjectionSection
          userId={user!.uid}
          currentNetWorth={currentNetWorth}
          withdrawalRate={previewWithdrawalRate}
          settings={settings}
        />
      )}

      {/* Come funziona il FIRE? — collapsible, no blue tinting */}
      <Collapsible open={howItWorksOpen} onOpenChange={setHowItWorksOpen}>
        <Card className="overflow-hidden">
          <CollapsibleTrigger asChild>
            <div className="flex cursor-pointer items-center justify-between px-6 py-4 transition-colors hover:bg-muted/30">
              <p className="text-sm font-medium text-foreground">Come funziona il FIRE?</p>
              <ChevronDown
                className={cn(
                  'h-4 w-4 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none',
                  howItWorksOpen && 'rotate-180'
                )}
              />
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="space-y-3 border-t border-border px-6 py-4 text-sm text-muted-foreground">
              <p>
                <strong className="font-semibold text-foreground">FIRE Number:</strong>{' '}
                Il patrimonio target calcolato come Spese Annuali &divide; Safe Withdrawal Rate.
                Con un SWR del 4%, devi accumulare 25 volte le tue spese annuali.
              </p>
              <p>
                <strong className="font-semibold text-foreground">
                  Safe Withdrawal Rate (SWR):
                </strong>{' '}
                La percentuale del patrimonio che puoi prelevare ogni anno in modo sostenibile.
                Il 4% è basato sul Trinity Study su un orizzonte di 30 anni.
              </p>
              <p>
                <strong className="font-semibold text-foreground">
                  Reddito Passivo Mensile:
                </strong>{' '}
                Basato sul tuo patrimonio attuale e sul SWR impostato. Mostra quanto potresti già
                prelevare mensilmente in modo sostenibile.
              </p>
            </div>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  );
}
