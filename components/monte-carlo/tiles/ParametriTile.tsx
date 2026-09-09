'use client';

/**
 * PARAMETRI — the plan the simulation runs on, as a tile of the grid (The Input Tile Rule, in
 * its desktop position: the answer tiles come first because the plan is auto-filled from the
 * portfolio and the page is answered before anything is typed). Two blocks: the Piano (starting
 * capital with the two «Usa» shortcuts and the read-only pension row, the horizon, the
 * withdrawal, the simulation count, the four-class allocation with its sum) and the three market
 * scenarios as Muted Sub-tile Variant B — bordered, dense — the one place the spec keeps that
 * variant for. One action row: Esegui, Salva scenari, Ripristina default, and the footer that
 * says whether the figures above still match what is typed (`describeParametriFooter`).
 *
 * The form is owned by the tab as strings (`MonteCarloForm`), the way FireParametri's is: a
 * numeric field that keeps a string lets the user type «22.» without the value snapping back.
 * The scenarios stay numbers and clamp on change, as the old ScenarioParameterCards did.
 */

import { RotateCcw, Save, Target, TrendingDown, TrendingUp } from 'lucide-react';
import type { MonteCarloScenarioParams, MonteCarloScenarios } from '@/types/assets';
import type { Narrative } from '@/lib/utils/narrative';
import type { MonteCarloPlan, ScenarioKey } from '@/lib/utils/monteCarloSummary';
import { formatInputAmount } from '@/lib/utils/monteCarloSummary';
import { describePensionInflowRow } from '@/lib/utils/monteCarloNarrative';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';
import { SCENARIO_SLOT } from '@/components/monte-carlo/ScenarioOverlayChart';

export interface MonteCarloForm {
  initialPortfolio: string;
  retirementYears: string;
  annualWithdrawal: string;
  numberOfSimulations: string;
  equityPercentage: string;
  bondsPercentage: string;
  realEstatePercentage: string;
  commoditiesPercentage: string;
}

interface ParametriTileProps {
  reading: Narrative;
  aside: string;
  plan: MonteCarloPlan;
  form: MonteCarloForm;
  onFormChange: (patch: Partial<MonteCarloForm>) => void;
  /** Sum of the four allocation fields as typed — the tile prints it and flags a sum off 100. */
  allocationSum: number;
  totalNetWorth: number;
  liquidNetWorth: number;
  scenarios: MonteCarloScenarios;
  onScenariosChange: (scenarios: MonteCarloScenarios) => void;
  onRun: () => void;
  canRun: boolean;
  isRunning: boolean;
  onSaveScenarios: () => void;
  onResetScenarios: () => void;
  isSavingScenarios: boolean;
  isDemo: boolean;
  footer: Narrative;
  /** The footer says the results are stale — printed in the warning tone. */
  stale: boolean;
  className?: string;
}

const CONTROL_CLASS = 'mt-1 h-9 font-mono tabular-nums transition-[border-color,background-color,box-shadow] duration-200 focus-visible:ring-2 focus-visible:ring-primary/25 motion-reduce:transition-none';

const SCENARIO_META: { key: ScenarioKey; label: string; icon: typeof Target }[] = [
  { key: 'bear', label: 'Scenario Orso', icon: TrendingDown },
  { key: 'base', label: 'Scenario Base', icon: Target },
  { key: 'bull', label: 'Scenario Toro', icon: TrendingUp },
];

const ASSET_CLASS_FIELDS: { label: string; returnKey: keyof MonteCarloScenarioParams; volatilityKey: keyof MonteCarloScenarioParams }[] = [
  { label: 'Azioni', returnKey: 'equityReturn', volatilityKey: 'equityVolatility' },
  { label: 'Obbligazioni', returnKey: 'bondsReturn', volatilityKey: 'bondsVolatility' },
  { label: 'Immobili', returnKey: 'realEstateReturn', volatilityKey: 'realEstateVolatility' },
  { label: 'Materie prime', returnKey: 'commoditiesReturn', volatilityKey: 'commoditiesVolatility' },
];

const ALLOCATION_FIELDS: { key: keyof MonteCarloForm; label: string }[] = [
  { key: 'equityPercentage', label: 'Azioni %' },
  { key: 'bondsPercentage', label: 'Obbligazioni %' },
  { key: 'realEstatePercentage', label: 'Immobili %' },
  { key: 'commoditiesPercentage', label: 'Materie prime %' },
];

export function ParametriTile({
  reading,
  aside,
  plan,
  form,
  onFormChange,
  allocationSum,
  totalNetWorth,
  liquidNetWorth,
  scenarios,
  onScenariosChange,
  onRun,
  canRun,
  isRunning,
  onSaveScenarios,
  onResetScenarios,
  isSavingScenarios,
  isDemo,
  footer,
  stale,
  className,
}: ParametriTileProps) {
  const chartColors = useChartColors();
  const allocationOff = Math.abs(allocationSum - 100) > 0.01;

  const updateScenario = (key: ScenarioKey, field: keyof MonteCarloScenarioParams, value: string) => {
    const numValue = Number.parseFloat(value);
    if (Number.isNaN(numValue)) return;
    // Clamp: returns and inflation −20..+30, volatility 0..100 — the old cards' bounds.
    if ((field.includes('Return') || field === 'inflationRate') && (numValue < -20 || numValue > 30)) return;
    if (field.includes('Volatility') && (numValue < 0 || numValue > 100)) return;
    onScenariosChange({ ...scenarios, [key]: { ...scenarios[key], [field]: numValue } });
  };

  return (
    <Tile eyebrow="Parametri" aside={aside} reading={reading} ariaLabel="Parametri della simulazione" className={className}>
      <div className="mt-3.5 grid grid-cols-1 gap-5 desktop:grid-cols-12">
        {/* Piano (5) */}
        <div className="flex min-w-0 flex-col gap-4 desktop:col-span-5">
          <p className={TILE_SUB_EYEBROW_CLASS}>Piano</p>

          <div>
            <Label htmlFor="mc-initialPortfolio" className="text-[13px]">
              Patrimonio iniziale (€)
            </Label>
            <Input
              id="mc-initialPortfolio"
              type="text"
              inputMode="decimal"
              value={form.initialPortfolio}
              onChange={(e) => onFormChange({ initialPortfolio: e.target.value })}
              className={CONTROL_CLASS}
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" className="h-7 px-2.5 text-[11px]" onClick={() => onFormChange({ initialPortfolio: formatInputAmount(totalNetWorth) })}>
                Totale · {cachedFormatCurrencyEUR(totalNetWorth, true)}
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-7 px-2.5 text-[11px]" onClick={() => onFormChange({ initialPortfolio: formatInputAmount(liquidNetWorth) })}>
                Liquido · {cachedFormatCurrencyEUR(liquidNetWorth, true)}
              </Button>
            </div>
            {plan.inflows.map((inflow) => (
              <NarrativeText key={inflow.yearOffset} segments={describePensionInflowRow(inflow)} className="mt-2 text-[11px] leading-[1.4] text-muted-foreground" figureClassName="font-medium" />
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="mc-retirementYears" className="text-[13px]">
                Anni
              </Label>
              <Input id="mc-retirementYears" type="number" inputMode="numeric" min="1" max="60" step="1" value={form.retirementYears} onChange={(e) => onFormChange({ retirementYears: e.target.value })} className={CONTROL_CLASS} />
              <p className="mt-1 text-[11px] leading-[1.4] text-muted-foreground">{plan.endAge !== null ? `fino a ${plan.endAge} anni` : `fino al ${plan.endCalendarYear}`}</p>
            </div>
            <div>
              <Label htmlFor="mc-annualWithdrawal" className="text-[13px]">
                Prelievo annuo (€)
              </Label>
              <Input id="mc-annualWithdrawal" type="number" inputMode="numeric" min="0" step="1000" value={form.annualWithdrawal} onChange={(e) => onFormChange({ annualWithdrawal: e.target.value })} className={CONTROL_CLASS} />
              <p className="mt-1 text-[11px] leading-[1.4] text-muted-foreground">indicizzato all&apos;inflazione</p>
            </div>
            <div>
              <Label htmlFor="mc-numberOfSimulations" className="text-[13px]">
                Simulazioni
              </Label>
              <Input id="mc-numberOfSimulations" type="number" inputMode="numeric" min="1000" max="50000" step="1000" value={form.numberOfSimulations} onChange={(e) => onFormChange({ numberOfSimulations: e.target.value })} className={CONTROL_CLASS} />
              <p className="mt-1 text-[11px] leading-[1.4] text-muted-foreground">1.000 – 50.000 per scenario</p>
            </div>
          </div>

          <div>
            <div className="flex items-baseline justify-between gap-3">
              <p className={TILE_SUB_EYEBROW_CLASS}>Allocazione · dal portafoglio</p>
              <span className={cn('font-mono text-[11px] font-medium tabular-nums', allocationOff ? 'text-destructive' : 'text-foreground')}>
                {allocationOff ? `${allocationSum.toLocaleString('it-IT', { maximumFractionDigits: 1 })}% — deve fare 100%` : '100%'}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {ALLOCATION_FIELDS.map((field) => (
                <div key={field.key}>
                  <Label htmlFor={`mc-${field.key}`} className="text-[13px]">
                    {field.label}
                  </Label>
                  <Input id={`mc-${field.key}`} type="number" inputMode="decimal" min="0" max="100" step="5" value={form[field.key]} onChange={(e) => onFormChange({ [field.key]: e.target.value })} className={CONTROL_CLASS} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Scenari di mercato (7) */}
        <div className="flex min-w-0 flex-col gap-4 desktop:col-span-7">
          <p className={TILE_SUB_EYEBROW_CLASS}>Scenari di mercato · rendimento e volatilità annui, %</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {SCENARIO_META.map(({ key, label, icon: Icon }) => {
              const scenario = scenarios[key];
              return (
                <div key={key} className="flex flex-col gap-3 rounded-xl border border-border bg-muted p-3.5">
                  {/* A chart slot is not a text colour: the slot is the swatch, the label stays muted. */}
                  <p className="flex items-center gap-1.5 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: chartColors[SCENARIO_SLOT[key]] }} aria-hidden="true" />
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    {label}
                  </p>
                  <div className="grid grid-cols-[minmax(0,1.3fr)_1fr_1fr] items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span />
                    <span className="text-center">Rend.</span>
                    <span className="text-center">Vol.</span>
                  </div>
                  {ASSET_CLASS_FIELDS.map((field) => (
                    <div key={field.returnKey} className="grid grid-cols-[minmax(0,1.3fr)_1fr_1fr] items-center gap-1.5">
                      <Label className="truncate text-[11px] text-muted-foreground" htmlFor={`mc-${key}-${field.returnKey}`}>
                        {field.label}
                      </Label>
                      <Input
                        id={`mc-${key}-${field.returnKey}`}
                        aria-label={`${label}, rendimento ${field.label} (%)`}
                        type="number"
                        inputMode="decimal"
                        step="0.5"
                        value={scenario[field.returnKey]}
                        onChange={(e) => updateScenario(key, field.returnKey, e.target.value)}
                        className="h-8 px-1 text-center font-mono text-[12px] tabular-nums"
                      />
                      <Input
                        aria-label={`${label}, volatilità ${field.label} (%)`}
                        type="number"
                        inputMode="decimal"
                        step="0.5"
                        value={scenario[field.volatilityKey]}
                        onChange={(e) => updateScenario(key, field.volatilityKey, e.target.value)}
                        className="h-8 px-1 text-center font-mono text-[12px] tabular-nums"
                      />
                    </div>
                  ))}
                  <div className="flex items-center justify-between gap-2 border-t border-border pt-2.5">
                    <Label className="text-[11px] text-muted-foreground" htmlFor={`mc-${key}-inflation`}>
                      Inflazione %
                    </Label>
                    <Input
                      id={`mc-${key}-inflation`}
                      type="number"
                      inputMode="decimal"
                      step="0.5"
                      value={scenario.inflationRate}
                      onChange={(e) => updateScenario(key, 'inflationRate', e.target.value)}
                      className="h-8 w-20 px-1 text-center font-mono text-[12px] tabular-nums"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:flex-wrap sm:items-center">
        <Button type="button" onClick={onRun} disabled={!canRun || isRunning} className="h-9 w-full sm:w-auto">
          {isRunning ? 'Simulazione in corso…' : 'Esegui simulazione'}
        </Button>
        <Button type="button" variant="outline" onClick={onSaveScenarios} disabled={isDemo || isSavingScenarios} className="h-9 w-full sm:w-auto">
          <Save className="mr-2 h-4 w-4" aria-hidden="true" />
          {isSavingScenarios ? 'Salvataggio…' : 'Salva scenari'}
        </Button>
        <Button type="button" variant="ghost" onClick={onResetScenarios} className="h-9 w-full sm:w-auto">
          <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
          Ripristina default
        </Button>
        {isDemo && <span className="text-[11px] text-muted-foreground">scenari non salvabili in demo</span>}
        <NarrativeText segments={footer} className={cn('text-[11px] leading-[1.4] sm:ml-auto sm:text-right', stale ? 'text-warning-foreground' : 'text-muted-foreground')} figureClassName="font-medium" />
      </div>
    </Tile>
  );
}
