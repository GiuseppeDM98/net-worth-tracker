'use client';

/**
 * WhatIfAnalysisTab
 *
 * Lets the user simulate life events (job loss, major purchase, savings/expense change,
 * windfall) and see the impact on BOTH the traditional FIRE plan and the Coast FIRE plan.
 *
 * Data flow:
 * 1. settings + assets + annual cashflow queries (shared React Query keys with the other
 *    FIRE tabs, so the cache is reused — no extra fetching).
 * 2. A `WhatIfBaseline` is assembled with useMemo from those sources.
 * 3. The active event + its inputs build a `WhatIfScenario`; `calculateWhatIfImpact`
 *    re-runs the pure FIRE/Coast functions on baseline vs adjusted inputs and diffs them.
 *
 * Scenario inputs are ephemeral local state — exploration, not persisted settings.
 */

import { useEffect, useMemo, useRef, useState, type ElementType } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import {
  getAllAssets,
  calculateFIRENetWorth,
  calculateLiquidFIRENetWorth,
  calculateIlliquidFIRENetWorth,
} from '@/lib/services/assetService';
import { getSettings } from '@/lib/services/assetAllocationService';
import {
  getAnnualCashflowData,
  getDefaultScenarios,
  normalizeCoastFirePensions,
  normalizeCoastFireTaxBrackets,
} from '@/lib/services/fireService';
import type { IncomeSourceCategory } from '@/lib/services/fireService';
import { calculateWhatIfImpact } from '@/lib/services/whatIfService';
import { formatCurrency, formatPercentage } from '@/lib/services/chartService';
import type {
  WhatIfBaseline,
  WhatIfEventType,
  WhatIfMetricImpact,
  WhatIfScenario,
} from '@/types/whatIf';
import { Settings } from '@/types/settings';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ArrowDownUp, Briefcase, CheckCircle2, Gift, Info, ShoppingBag, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WhatIfAnalysisSkeleton } from './WhatIfAnalysisSkeleton';
import { WhatIfSensitivitySection } from './WhatIfSensitivitySection';

type MetricFormat = 'currency' | 'percentage' | 'years';
type ImpactDirection = 'lowerBetter' | 'higherBetter';

const EVENTS: { type: WhatIfEventType; label: string; icon: ElementType; description: string }[] = [
  {
    type: 'jobLoss',
    label: 'Perdita di lavoro',
    icon: Briefcase,
    description:
      'Un periodo in cui vengono a mancare alcune entrate. Scegli quali (utile se il portafoglio è condiviso e si perde un solo reddito).',
  },
  {
    type: 'majorPurchase',
    label: 'Acquisto importante',
    icon: ShoppingBag,
    description: 'Una spesa una tantum (casa, auto) che riduce il patrimonio.',
  },
  {
    type: 'cashflowChange',
    label: 'Variazione risparmio/spese',
    icon: ArrowDownUp,
    description: 'Cambi permanenti al risparmio annuo o alle spese ricorrenti.',
  },
  {
    type: 'windfall',
    label: 'Entrata straordinaria',
    icon: Gift,
    description: "Un'entrata una tantum (eredità, bonus) che accelera il piano.",
  },
];

function parseAmount(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

// Income-source selection is keyed per subcategory leaf so a category can be partially selected
// (e.g. one partner's salary lost, the other retained).
function leafKey(categoryId: string, subCategoryId: string): string {
  return `${categoryId}::${subCategoryId}`;
}

function categoryLeafKeys(category: IncomeSourceCategory): string[] {
  return category.subCategories.map((sub) => leafKey(category.categoryId, sub.subCategoryId));
}

function collectLeafKeys(sources: IncomeSourceCategory[]): string[] {
  return sources.flatMap(categoryLeafKeys);
}

function sumSelectedIncome(sources: IncomeSourceCategory[], selected: Set<string>): number {
  let total = 0;
  for (const category of sources) {
    for (const sub of category.subCategories) {
      if (selected.has(leafKey(category.categoryId, sub.subCategoryId))) total += sub.annualAmount;
    }
  }
  return total;
}

function formatMetric(value: number | null, format: MetricFormat): string {
  if (value === null) return format === 'years' ? 'Oltre 50 anni' : 'N/D';
  switch (format) {
    case 'currency':
      return formatCurrency(value);
    case 'percentage':
      return formatPercentage(value);
    case 'years':
      return value === 0 ? 'Raggiunto' : `${Math.round(value)} anni`;
  }
}

function formatDelta(delta: number | null, format: MetricFormat): string {
  if (delta === null) return '';
  if (delta === 0) return 'invariato';
  const sign = delta > 0 ? '+' : '-';
  const abs = Math.abs(delta);
  switch (format) {
    case 'currency':
      return `${sign}${formatCurrency(abs)}`;
    case 'percentage':
      return `${sign}${formatPercentage(abs)}`;
    case 'years': {
      const rounded = Math.round(abs);
      return `${sign}${rounded} ${rounded === 1 ? 'anno' : 'anni'}`;
    }
  }
}

// Improvement is green, worsening is red. Direction encodes which way is "good" per metric.
function deltaColorClass(delta: number | null, direction: ImpactDirection): string {
  if (delta === null || delta === 0) return 'text-muted-foreground';
  const improved = direction === 'lowerBetter' ? delta < 0 : delta > 0;
  return improved ? 'text-positive' : 'text-destructive';
}

interface ImpactRowProps {
  label: string;
  impact: WhatIfMetricImpact;
  format: MetricFormat;
  direction: ImpactDirection;
}

function ImpactRow({ label, impact, format, direction }: ImpactRowProps) {
  return (
    <div className="flex items-center justify-between gap-3 px-6 py-3.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex flex-col items-end gap-0.5">
        <span className="font-mono text-sm tabular-nums">
          <span className="text-muted-foreground">{formatMetric(impact.before, format)}</span>
          <span className="mx-1 text-muted-foreground/50">&rarr;</span>
          <span className="font-semibold text-foreground">{formatMetric(impact.after, format)}</span>
        </span>
        <span
          className={cn('font-mono text-xs tabular-nums', deltaColorClass(impact.delta, direction))}
        >
          {formatDelta(impact.delta, format)}
        </span>
      </div>
    </div>
  );
}

interface IncomeSourceSelectorProps {
  sources: IncomeSourceCategory[];
  selected: Set<string>;
  onToggleLeaf: (key: string) => void;
  onToggleCategory: (category: IncomeSourceCategory) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
}

// Category → subcategory checkbox tree. A category with a single (unnamed) subcategory collapses
// to one row, so users with simple income tagging don't see a redundant "Generale" sub-line.
function IncomeSourceSelector({
  sources,
  selected,
  onToggleLeaf,
  onToggleCategory,
  onSelectAll,
  onSelectNone,
}: IncomeSourceSelectorProps) {
  return (
    <div className="rounded-lg border border-border">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <span className="text-sm font-medium text-foreground">Entrate che vengono a mancare</span>
        <div className="flex items-center gap-3 text-xs">
          <button type="button" onClick={onSelectAll} className="text-primary hover:underline">
            Tutte
          </button>
          <button
            type="button"
            onClick={onSelectNone}
            className="text-muted-foreground hover:underline"
          >
            Nessuna
          </button>
        </div>
      </div>
      <div className="divide-y divide-border">
        {sources.map((category) => {
          const leafKeys = categoryLeafKeys(category);
          const selectedCount = leafKeys.filter((key) => selected.has(key)).length;
          const categoryState =
            selectedCount === 0
              ? false
              : selectedCount === leafKeys.length
                ? true
                : 'indeterminate';
          // Collapse single-subcategory categories: the category row IS the only leaf.
          const isSingleLeaf =
            category.subCategories.length === 1 &&
            category.subCategories[0].subCategoryId === '__none__';

          return (
            <div key={category.categoryId} className="px-4 py-2.5">
              <label className="flex cursor-pointer items-center justify-between gap-3">
                <span className="flex items-center gap-2.5">
                  <Checkbox
                    checked={categoryState}
                    onCheckedChange={() => onToggleCategory(category)}
                  />
                  <span className="text-sm text-foreground">{category.categoryName}</span>
                </span>
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {formatCurrency(category.annualAmount)}/anno
                </span>
              </label>

              {!isSingleLeaf && (
                <div className="mt-2 space-y-2 pl-7">
                  {category.subCategories.map((sub) => {
                    const key = leafKey(category.categoryId, sub.subCategoryId);
                    return (
                      <label
                        key={key}
                        className="flex cursor-pointer items-center justify-between gap-3"
                      >
                        <span className="flex items-center gap-2.5">
                          <Checkbox
                            checked={selected.has(key)}
                            onCheckedChange={() => onToggleLeaf(key)}
                          />
                          <span className="text-sm text-muted-foreground">
                            {sub.subCategoryName}
                          </span>
                        </span>
                        <span className="font-mono text-xs tabular-nums text-muted-foreground/70">
                          {formatCurrency(sub.annualAmount)}/anno
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function WhatIfAnalysisTab() {
  const { user } = useAuth();
  const { ownerId } = useActiveAccount();

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

  const { data: cashflowData, isLoading: isLoadingCashflow } = useQuery({
    queryKey: ['annualCashflowData', ownerId],
    queryFn: () => getAnnualCashflowData(user!.uid),
    enabled: !!user,
    staleTime: 300000,
  });

  // --- Scenario state (ephemeral) ---
  const [eventType, setEventType] = useState<WhatIfEventType>('jobLoss');
  const [monthsWithoutIncome, setMonthsWithoutIncome] = useState('6');
  // Selected income-source leaves (`categoryId::subCategoryId`) that disappear on job loss.
  const [selectedIncomeLeaves, setSelectedIncomeLeaves] = useState<Set<string>>(new Set());
  const didInitIncomeSelection = useRef(false);
  const [purchaseAmount, setPurchaseAmount] = useState('');
  const [isPrimaryResidence, setIsPrimaryResidence] = useState(false);
  const [savingsDelta, setSavingsDelta] = useState('');
  const [expensesDelta, setExpensesDelta] = useState('');
  const [windfallAmount, setWindfallAmount] = useState('');

  // --- Baseline assembly ---
  const includePrimaryResidence = settings?.includePrimaryResidenceInFIRE ?? false;
  const netWorth = assets ? calculateFIRENetWorth(assets, includePrimaryResidence) : 0;
  const liquidNetWorth = assets ? calculateLiquidFIRENetWorth(assets, includePrimaryResidence) : 0;
  const illiquidNetWorth = assets
    ? calculateIlliquidFIRENetWorth(assets, includePrimaryResidence)
    : 0;
  const withdrawalRate = settings?.withdrawalRate ?? 4;
  const annualExpenses = cashflowData?.annualExpensesFromCashflow ?? 0;
  const annualSavings = cashflowData?.annualSavings ?? 0;
  const baselineYearLabel = cashflowData
    ? `ultimo anno ${cashflowData.referenceYear}${cashflowData.isAnnualized ? ' (annualizzato)' : ''}`
    : 'ultimo anno';
  // --- Income sources for the job-loss selector ---
  const incomeSources = useMemo(() => cashflowData?.incomeSources ?? [], [cashflowData]);
  const hasIncomeSources = incomeSources.length > 0;
  const laborIncomeCategoryIds = settings?.laborIncomeCategoryIds;

  // Default selection: the categories flagged as labor income in Settings; if none match the
  // available sources, fall back to every source (the original "all household income" behaviour).
  const defaultIncomeLeaves = useMemo(() => {
    const laborSet = new Set(laborIncomeCategoryIds ?? []);
    const laborLeaves = incomeSources
      .filter((category) => laborSet.has(category.categoryId))
      .flatMap(categoryLeafKeys);
    return new Set(laborLeaves.length > 0 ? laborLeaves : collectLeafKeys(incomeSources));
  }, [incomeSources, laborIncomeCategoryIds]);

  // Seed the selection once, after the data has loaded, without clobbering later user edits.
  useEffect(() => {
    if (didInitIncomeSelection.current) return;
    if (isLoadingSettings || isLoadingCashflow) return;
    setSelectedIncomeLeaves(defaultIncomeLeaves);
    didInitIncomeSelection.current = true;
  }, [isLoadingSettings, isLoadingCashflow, defaultIncomeLeaves]);

  const selectedAnnualIncome = useMemo(
    () => sumSelectedIncome(incomeSources, selectedIncomeLeaves),
    [incomeSources, selectedIncomeLeaves]
  );

  // Job-loss hit — the lost income pro-rated over the window. With no categorised income, fall
  // back to the whole household income (expenses + savings) so behaviour is unchanged.
  const jobLossMonths = Math.max(parseAmount(monthsWithoutIncome), 0);
  const jobLossAnnualIncome = hasIncomeSources ? selectedAnnualIncome : annualSavings + annualExpenses;
  const jobLossTotalHit = (jobLossAnnualIncome * jobLossMonths) / 12;
  // Decompose the hit, generalising the full-income case to partial loss: the retained income
  // (e.g. a partner's salary) first covers expenses, so only the shortfall is drawn from the
  // portfolio; the rest of the hit is the savings the user no longer makes. Sums to the total.
  const jobLossTotalIncome = annualSavings + annualExpenses;
  const jobLossRetainedIncome = Math.max(jobLossTotalIncome - jobLossAnnualIncome, 0);
  const jobLossForgoneSavings = (Math.min(annualSavings, jobLossAnnualIncome) * jobLossMonths) / 12;
  const jobLossDrawnExpenses =
    (Math.max(jobLossAnnualIncome - annualSavings, 0) * jobLossMonths) / 12;
  // Cashflow-change preview — shows what the deltas are applied to.
  const newAnnualSavings = Math.max(annualSavings + parseAmount(savingsDelta), 0);
  const newAnnualExpenses = Math.max(annualExpenses + parseAmount(expensesDelta), 0);
  const scenarios = settings?.fireProjectionScenarios ?? getDefaultScenarios();

  const currentAge = settings?.userAge ?? null;
  const retirementAge = settings?.coastFireRetirementAge ?? 60;
  const coastCustomExpenses = settings?.coastFireCustomExpenses;

  const baseline = useMemo<WhatIfBaseline>(() => {
    const coastExpenses =
      coastCustomExpenses && coastCustomExpenses > 0 ? coastCustomExpenses : annualExpenses;
    return {
      netWorth,
      liquidNetWorth,
      illiquidNetWorth,
      annualExpenses,
      annualSavings,
      withdrawalRate,
      scenarios,
      coast:
        currentAge !== null
          ? {
              currentAge,
              retirementAge,
              annualExpenses: coastExpenses,
              realReturnRate: scenarios.base.growthRate - scenarios.base.inflationRate,
              inflationRate: scenarios.base.inflationRate,
              pensions: normalizeCoastFirePensions(settings?.coastFirePensions),
              taxBrackets: normalizeCoastFireTaxBrackets(settings?.coastFireTaxBrackets),
            }
          : null,
    };
    // settings sub-fields are captured explicitly; the whole settings object is stable per query.
  }, [
    netWorth,
    liquidNetWorth,
    illiquidNetWorth,
    annualExpenses,
    annualSavings,
    withdrawalRate,
    scenarios,
    currentAge,
    retirementAge,
    coastCustomExpenses,
    settings?.coastFirePensions,
    settings?.coastFireTaxBrackets,
  ]);

  // --- Income-source selection handlers ---
  const toggleIncomeLeaf = (key: string) => {
    setSelectedIncomeLeaves((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleIncomeCategory = (category: IncomeSourceCategory) => {
    const keys = categoryLeafKeys(category);
    setSelectedIncomeLeaves((prev) => {
      const next = new Set(prev);
      const allSelected = keys.every((key) => next.has(key));
      // All selected → clear the category; otherwise select it fully.
      keys.forEach((key) => (allSelected ? next.delete(key) : next.add(key)));
      return next;
    });
  };

  const selectAllIncome = () => setSelectedIncomeLeaves(new Set(collectLeafKeys(incomeSources)));
  const selectNoIncome = () => setSelectedIncomeLeaves(new Set());

  const scenario = useMemo<WhatIfScenario>(() => {
    switch (eventType) {
      case 'jobLoss':
        return {
          eventType,
          monthsWithoutIncome: parseAmount(monthsWithoutIncome),
          // Only constrain the lost income when we actually have categorised sources to select.
          lostAnnualIncome: hasIncomeSources ? selectedAnnualIncome : undefined,
        };
      case 'majorPurchase':
        return { eventType, lumpSumAmount: parseAmount(purchaseAmount), isPrimaryResidence };
      case 'cashflowChange':
        return {
          eventType,
          annualSavingsDelta: parseAmount(savingsDelta),
          annualExpensesDelta: parseAmount(expensesDelta),
        };
      case 'windfall':
        return { eventType, lumpSumAmount: parseAmount(windfallAmount) };
    }
  }, [
    eventType,
    monthsWithoutIncome,
    hasIncomeSources,
    selectedAnnualIncome,
    purchaseAmount,
    isPrimaryResidence,
    savingsDelta,
    expensesDelta,
    windfallAmount,
  ]);

  const hasBaseline = netWorth > 0 && annualExpenses > 0 && withdrawalRate > 0;

  const impact = useMemo(
    () => (hasBaseline ? calculateWhatIfImpact(baseline, scenario) : null),
    [hasBaseline, baseline, scenario]
  );

  if (isLoadingSettings || isLoadingAssets || isLoadingCashflow) {
    return <WhatIfAnalysisSkeleton />;
  }

  if (!hasBaseline || !impact) {
    return (
      <div className="space-y-6 max-desktop:portrait:pb-20">
        <Card className="overflow-hidden">
          <div className="flex items-start gap-3 px-6 py-5">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            <div className="space-y-1 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Dati insufficienti per il What If</p>
              <p>
                Servono un patrimonio FIRE maggiore di zero e spese annue registrate. Aggiungi i tuoi
                asset nella sezione Patrimonio e i movimenti nel Cashflow, poi torna qui.
              </p>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const netWorthImpact: WhatIfMetricImpact = {
    before: baseline.netWorth,
    after: impact.adjusted.netWorth,
    delta: impact.adjusted.netWorth - baseline.netWorth,
  };
  const yearsDelta = impact.fire.yearsToFIRE.delta;
  const activeEvent = EVENTS.find((event) => event.type === eventType)!;

  return (
    <div className="space-y-6 max-desktop:portrait:pb-20">
      {/* Hero — headline impact on years to FIRE */}
      <Card className="overflow-hidden">
        <div className="px-6 py-5">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground/70">
            Impatto sul piano &middot; Anni al FIRE
          </p>
          <p className="mt-1 font-mono text-4xl font-bold leading-none tracking-tight tabular-nums text-foreground">
            {formatMetric(impact.fire.yearsToFIRE.after, 'years')}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'inline-flex items-center rounded-md bg-muted px-2.5 py-1 text-xs font-medium',
                deltaColorClass(yearsDelta, 'lowerBetter')
              )}
            >
              {yearsDelta === null || yearsDelta === 0
                ? 'Nessuna variazione'
                : `${formatDelta(yearsDelta, 'years')} rispetto a oggi`}
            </span>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Da {formatMetric(impact.fire.yearsToFIRE.before, 'years')} a{' '}
            {formatMetric(impact.fire.yearsToFIRE.after, 'years')} &mdash; scenario Base,{' '}
            {activeEvent.label.toLowerCase()}
          </p>
        </div>
      </Card>

      {/* Event selector */}
      <div className="grid grid-cols-2 gap-2 desktop:grid-cols-4">
        {EVENTS.map((event) => {
          const Icon = event.icon;
          const isActive = event.type === eventType;
          return (
            <button
              key={event.type}
              type="button"
              onClick={() => setEventType(event.type)}
              aria-pressed={isActive}
              className={cn(
                'flex min-h-16 flex-col items-start gap-1.5 rounded-lg border p-3 text-left transition-colors',
                isActive
                  ? 'border-primary bg-primary/5'
                  : 'border-border bg-card hover:bg-muted/40'
              )}
            >
              <Icon
                className={cn('h-4 w-4', isActive ? 'text-primary' : 'text-muted-foreground')}
              />
              <span className="text-sm font-medium leading-tight text-foreground">
                {event.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Event inputs */}
      <Card className="overflow-hidden">
        <div className="space-y-4 px-6 py-5">
          <p className="text-sm text-muted-foreground">{activeEvent.description}</p>

          {eventType === 'jobLoss' && (
            <div className="space-y-3">
              <div className="max-w-xs">
                <Label htmlFor="monthsWithoutIncome" className="mb-1 block">
                  Mesi senza reddito
                </Label>
                <Input
                  id="monthsWithoutIncome"
                  type="number"
                  step="1"
                  min="0"
                  inputMode="numeric"
                  value={monthsWithoutIncome}
                  onChange={(e) => setMonthsWithoutIncome(e.target.value)}
                  placeholder="Es. 6"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Stima del periodo senza reddito prima di ripartire.
                </p>
              </div>

              {/* Income-source picker — lets the user keep a partner's income that doesn't stop. */}
              {hasIncomeSources && (
                <IncomeSourceSelector
                  sources={incomeSources}
                  selected={selectedIncomeLeaves}
                  onToggleLeaf={toggleIncomeLeaf}
                  onToggleCategory={toggleIncomeCategory}
                  onSelectAll={selectAllIncome}
                  onSelectNone={selectNoIncome}
                />
              )}

              {/* Make the portfolio hit explicit: state the method (retained income covers expenses
                  first), the figures it uses, then the two effects that sum to the lost income.
                  Single column on mobile/tablet; two columns (inputs | result) from desktop. */}
              {jobLossMonths > 0 && jobLossTotalHit > 0 && (
                <div className="space-y-3.5 rounded-lg border border-border bg-muted/30 p-3.5 text-xs">
                  {/* Method / priority — what the numbers below mean */}
                  <p className="max-w-[65ch] text-muted-foreground">
                    Su {jobLossMonths} {jobLossMonths === 1 ? 'mese' : 'mesi'} (dati{' '}
                    {baselineYearLabel}), il{' '}
                    <span className="font-medium text-foreground">
                      reddito che resta copre prima le spese
                    </span>
                    ; si preleva dal portafoglio solo per la parte scoperta.
                  </p>

                  <div className="grid gap-x-6 gap-y-3.5 border-t border-border pt-3.5 desktop:grid-cols-2">
                    {/* Dati usati — the explicit inputs to the calculation */}
                    <div>
                      <p className="mb-1.5 font-medium text-foreground">Dati usati</p>
                      <dl className="space-y-1">
                        {[
                          { label: 'Reddito perso', value: jobLossAnnualIncome },
                          { label: 'Reddito che resta', value: jobLossRetainedIncome },
                          { label: 'Spese annue', value: annualExpenses },
                          { label: 'Risparmio annuo', value: annualSavings },
                        ].map((row) => (
                          <div key={row.label} className="flex items-baseline justify-between gap-3">
                            <dt className="text-muted-foreground">{row.label}</dt>
                            <dd className="font-mono tabular-nums text-foreground">
                              {formatCurrency(row.value)}/anno
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </div>

                    {/* Effetto sul patrimonio — each effect shows its formula filled with the
                        simulation's own figures (full-width below the row), so the result is
                        traceable without the formula competing with the value column. */}
                    <div className="border-t border-border pt-3.5 desktop:border-l desktop:border-t-0 desktop:pl-6 desktop:pt-0">
                      <p className="mb-1.5 font-medium text-foreground">Effetto sul patrimonio</p>
                      <div className="space-y-2.5">
                        <div>
                          <div className="flex items-baseline justify-between gap-3">
                            <span className="text-muted-foreground">Mancati risparmi</span>
                            <span className="shrink-0 font-mono tabular-nums text-destructive">
                              -{formatCurrency(jobLossForgoneSavings)}
                            </span>
                          </div>
                          <p className="mt-0.5 font-mono text-[11px] leading-snug text-muted-foreground/70">
                            min({formatCurrency(annualSavings)}; {formatCurrency(jobLossAnnualIncome)}){' '}
                            &times; {jobLossMonths}/12
                          </p>
                        </div>
                        <div>
                          <div className="flex items-baseline justify-between gap-3">
                            <span className="text-muted-foreground">Spese dal portafoglio</span>
                            <span className="shrink-0 font-mono tabular-nums text-destructive">
                              -{formatCurrency(jobLossDrawnExpenses)}
                            </span>
                          </div>
                          <p className="mt-0.5 font-mono text-[11px] leading-snug text-muted-foreground/70">
                            max({formatCurrency(jobLossAnnualIncome)} &minus;{' '}
                            {formatCurrency(annualSavings)}; 0) &times; {jobLossMonths}/12
                          </p>
                        </div>
                        <div className="flex items-baseline justify-between gap-3 border-t border-border pt-2">
                          <span className="font-medium text-foreground">Impatto sul patrimonio</span>
                          <span className="shrink-0 font-mono font-semibold tabular-nums text-foreground">
                            -{formatCurrency(jobLossTotalHit)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {eventType === 'majorPurchase' && (
            <div className="grid gap-4 desktop:grid-cols-2">
              <div>
                <Label htmlFor="purchaseAmount" className="mb-1 block">
                  Importo acquisto (&euro;)
                </Label>
                <Input
                  id="purchaseAmount"
                  type="number"
                  step="1000"
                  min="0"
                  inputMode="numeric"
                  value={purchaseAmount}
                  onChange={(e) => setPurchaseAmount(e.target.value)}
                  placeholder="Es. 30000"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Esborso una tantum (es. anticipo casa, auto).
                </p>
              </div>
              <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-muted/30 p-4">
                <div className="min-w-0 space-y-0.5">
                  <Label htmlFor="isPrimaryResidence" className="leading-normal">
                    &Egrave; l&apos;abitazione principale
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Se s&igrave;, in genere &egrave; esclusa dal patrimonio FIRE: l&apos;impatto resta
                    pieno.
                  </p>
                </div>
                <Switch
                  id="isPrimaryResidence"
                  checked={isPrimaryResidence}
                  onCheckedChange={setIsPrimaryResidence}
                  className="mt-0.5 shrink-0"
                />
              </div>
            </div>
          )}

          {eventType === 'cashflowChange' && (
            <div className="grid gap-4 desktop:grid-cols-2">
              <div>
                <Label htmlFor="savingsDelta" className="mb-1 block">
                  Variazione risparmio annuo (&euro;)
                </Label>
                <Input
                  id="savingsDelta"
                  type="number"
                  step="500"
                  inputMode="numeric"
                  value={savingsDelta}
                  onChange={(e) => setSavingsDelta(e.target.value)}
                  placeholder="Es. -6000"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Negativo = risparmi di meno. Attuale ({baselineYearLabel}):{' '}
                  <span className="font-mono">{formatCurrency(annualSavings)}</span>/anno
                  {parseAmount(savingsDelta) !== 0 && (
                    <>
                      {' '}&rarr;{' '}
                      <span className="font-mono text-foreground">
                        {formatCurrency(newAnnualSavings)}
                      </span>
                      /anno
                    </>
                  )}
                </p>
              </div>
              <div>
                <Label htmlFor="expensesDelta" className="mb-1 block">
                  Variazione spese annue (&euro;)
                </Label>
                <Input
                  id="expensesDelta"
                  type="number"
                  step="500"
                  inputMode="numeric"
                  value={expensesDelta}
                  onChange={(e) => setExpensesDelta(e.target.value)}
                  placeholder="Es. 3000"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Positivo = nuova spesa ricorrente (alza anche il FIRE Number). Attuale:{' '}
                  <span className="font-mono">{formatCurrency(annualExpenses)}</span>/anno
                  {parseAmount(expensesDelta) !== 0 && (
                    <>
                      {' '}&rarr;{' '}
                      <span className="font-mono text-foreground">
                        {formatCurrency(newAnnualExpenses)}
                      </span>
                      /anno
                    </>
                  )}
                </p>
              </div>
            </div>
          )}

          {eventType === 'windfall' && (
            <div className="max-w-xs">
              <Label htmlFor="windfallAmount" className="mb-1 block">
                Importo entrata (&euro;)
              </Label>
              <Input
                id="windfallAmount"
                type="number"
                step="1000"
                min="0"
                inputMode="numeric"
                value={windfallAmount}
                onChange={(e) => setWindfallAmount(e.target.value)}
                placeholder="Es. 50000"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Entrata una tantum (eredit&agrave;, bonus, vendita).
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* Impact panels */}
      <div className="grid gap-4 desktop:grid-cols-2">
        {/* Traditional FIRE */}
        <Card className="overflow-hidden">
          <div className="px-6 py-4">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground/70">
              FIRE Tradizionale
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">Prima &rarr; dopo l&apos;evento</p>
          </div>
          <div className="divide-y divide-border border-t border-border">
            <ImpactRow
              label="Patrimonio FIRE"
              impact={netWorthImpact}
              format="currency"
              direction="higherBetter"
            />
            <ImpactRow
              label="FIRE Number"
              impact={impact.fire.fireNumber}
              format="currency"
              direction="lowerBetter"
            />
            <ImpactRow
              label="Progresso verso FI"
              impact={impact.fire.progressToFI}
              format="percentage"
              direction="higherBetter"
            />
            <ImpactRow
              label="Anni al FIRE"
              impact={impact.fire.yearsToFIRE}
              format="years"
              direction="lowerBetter"
            />
            <ImpactRow
              label="Reddito passivo sostenibile"
              impact={impact.fire.annualAllowance}
              format="currency"
              direction="higherBetter"
            />
          </div>
        </Card>

        {/* Coast FIRE */}
        <Card className="overflow-hidden">
          <div className="px-6 py-4">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground/70">
              Coast FIRE
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">Prima &rarr; dopo l&apos;evento</p>
          </div>
          {impact.coast ? (
            <div className="divide-y divide-border border-t border-border">
              <ImpactRow
                label="Coast FIRE Number oggi"
                impact={impact.coast.coastFireNumberToday}
                format="currency"
                direction="lowerBetter"
              />
              <ImpactRow
                label="Progresso Coast"
                impact={impact.coast.progressToCoastFI}
                format="percentage"
                direction="higherBetter"
              />
              <ImpactRow
                label="Gap al Coast"
                impact={impact.coast.gapToCoastFI}
                format="currency"
                direction="lowerBetter"
              />
              <div className="flex items-center justify-between gap-3 px-6 py-3.5">
                <span className="text-sm text-muted-foreground">Stato Coast FIRE</span>
                <div className="flex items-center gap-2 text-sm font-medium">
                  <CoastStatusBadge reached={impact.coast.isCoastReachedBefore} />
                  <span className="text-muted-foreground/50">&rarr;</span>
                  <CoastStatusBadge reached={impact.coast.isCoastReachedAfter} />
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3 border-t border-border px-6 py-5">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Imposta la tua et&agrave; nel tab <span className="font-medium text-foreground">Coast
                FIRE</span> per vedere l&apos;impatto anche sul Coast FIRE.
              </p>
            </div>
          )}
        </Card>
      </div>

      {/* Sensitivity matrix (relocated from the FIRE Calculator) */}
      <WhatIfSensitivitySection
        currentNetWorth={netWorth}
        withdrawalRate={withdrawalRate}
        annualSavings={annualSavings}
        annualExpenses={annualExpenses}
        scenarios={scenarios}
      />
    </div>
  );
}

function CoastStatusBadge({ reached }: { reached: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1',
        reached ? 'text-positive' : 'text-muted-foreground'
      )}
    >
      {reached ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
      {reached ? 'Raggiunto' : 'Non raggiunto'}
    </span>
  );
}
