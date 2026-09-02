'use client';

/**
 * «Parametri», below the grid behind a disclosure: the settings the calculator runs on — the
 * SWR, the residence rule, the RITA details of the pension lock — and the three scenarios'
 * growth and inflation, as two tiles (Impostazioni 6 · Scenari 6). Configuration, not a reading
 * of the plan, so it does not earn a place in the grid (the Budget «Impostazioni» precedent).
 *
 * Config-first: the disclosure opens by itself only when no SWR is saved yet, or when an unsaved
 * edit appears — the page owns that state (`open`/`onOpenChange`) because the decision has to be
 * taken ONCE after the form has settled (doc/guide/fire.md § FIRE, What If and Goals: a `useRef` seeded flag, never the
 * transient `hasUnsavedChanges`). Every edit here is a PREVIEW — the verdict and the tiles read
 * the typed values at once — until «Salva»; the trigger carries an amber dot while something is
 * unsaved, so the state is visible with the panel closed.
 *
 * The pension-lock switch itself is NOT here: it is the Base di calcolo tile's control and saves
 * on change. What stays here is what needs a typed value: the INPS age and the long-unemployment
 * hypothesis that move the RITA unlock. The scenario parameters keep their Muted Sub-tile Variant B
 * (bordered, dense) — the one place the spec keeps that variant for.
 */

import { ChevronDown, HelpCircle, RotateCcw, Save, Target, TrendingDown, TrendingUp } from 'lucide-react';
import type { FIREProjectionScenarios, FIREScenarioParams } from '@/types/assets';
import type { Narrative } from '@/lib/utils/narrative';
import { describeImpostazioni, describeScenarioParams } from '@/lib/utils/fireNarrative';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Tile, TILE_CELL_CLASS, TILE_EYEBROW_CLASS } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';

const CONTROL_CLASS =
  'mt-1 h-9 font-mono tabular-nums transition-[border-color,background-color,box-shadow] duration-200 focus-visible:ring-2 focus-visible:ring-primary/25 motion-reduce:transition-none';

export interface FireSettingsForm {
  withdrawalRate: string;
  includePrimaryResidence: boolean;
  inpsRetirementAge: string;
  ritaLongUnemployment: boolean;
}

interface FireParametriProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `describeParametri(...)` — the saved settings in one line. */
  description: string;
  form: FireSettingsForm;
  onFormChange: (patch: Partial<FireSettingsForm>) => void;
  hasUnsavedChanges: boolean;
  isSaving: boolean;
  isDemo: boolean;
  onSave: () => void;
  onReset: () => void;
  /** `describeRitaPreview(...)` — the unlock the RITA controls imply, or what is missing to estimate it. */
  ritaPreview: Narrative;
  scenarios: FIREProjectionScenarios;
  onScenariosChange: (scenarios: FIREProjectionScenarios) => void;
  onSaveScenarios: () => void;
  onResetScenarios: () => void;
  isSavingScenarios: boolean;
}

type ScenarioKey = keyof FIREProjectionScenarios;

const SCENARIO_META: { key: ScenarioKey; label: string; slot: number; icon: typeof Target }[] = [
  { key: 'bear', label: 'Scenario Orso', slot: 4, icon: TrendingDown },
  { key: 'base', label: 'Scenario Base', slot: 0, icon: Target },
  { key: 'bull', label: 'Scenario Toro', slot: 1, icon: TrendingUp },
];

export function FireParametri({
  open,
  onOpenChange,
  description,
  form,
  onFormChange,
  hasUnsavedChanges,
  isSaving,
  isDemo,
  onSave,
  onReset,
  ritaPreview,
  scenarios,
  onScenariosChange,
  onSaveScenarios,
  onResetScenarios,
  isSavingScenarios,
}: FireParametriProps) {
  const chartColors = useChartColors();

  const updateScenario = (key: ScenarioKey, field: keyof FIREScenarioParams, value: string) => {
    const numValue = parseFloat(value);
    if (Number.isNaN(numValue)) return;
    if (field === 'growthRate' && (numValue < 0 || numValue > 30)) return;
    if (field === 'inflationRate' && (numValue < 0 || numValue > 15)) return;
    onScenariosChange({ ...scenarios, [key]: { ...scenarios[key], [field]: numValue } });
  };

  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      {/* No aria-label: the trigger's name is its visible text, so «Anteprima non salvata» reaches a
          screen reader too. */}
      <CollapsibleTrigger className="flex min-h-11 w-full items-center justify-between gap-3 border-t border-border/40 py-3 text-left">
        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className={TILE_EYEBROW_CLASS}>Parametri</span>
          <span className="text-[13px] text-muted-foreground">{description}</span>
          {hasUnsavedChanges && (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-warning-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-warning-foreground" aria-hidden="true" />
              Anteprima non salvata
            </span>
          )}
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </CollapsibleTrigger>

      <CollapsibleContent className="pt-1">
        <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-12">
          {/* Impostazioni (6) */}
          <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-6')}>
            <Tile eyebrow="Impostazioni" aside="salvate nel profilo" reading={describeImpostazioni(hasUnsavedChanges)} ariaLabel="Impostazioni FIRE">
              <div className="mt-3.5 flex flex-col gap-4">
                <div>
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="withdrawalRate" className="text-[13px]">
                      Safe Withdrawal Rate (%)
                    </Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          aria-label="Informazioni sul Safe Withdrawal Rate"
                        >
                          <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent side="top" className="max-w-[280px] text-[13px] leading-relaxed">
                        La percentuale del patrimonio che puoi prelevare ogni anno in modo sostenibile. Il 4% (regola del 4%, Trinity
                        Study) garantisce la sopravvivenza del portafoglio su 30 anni nel 95% degli scenari storici.
                      </PopoverContent>
                    </Popover>
                  </div>
                  <Input
                    id="withdrawalRate"
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    min="0"
                    max="100"
                    value={form.withdrawalRate}
                    onChange={(e) => onFormChange({ withdrawalRate: e.target.value })}
                    className={cn(CONTROL_CLASS, 'w-[160px]')}
                  />
                  <p className="mt-1 text-[11px] leading-[1.4] text-muted-foreground">Tipicamente 4% secondo la regola del 4% (Trinity Study).</p>
                </div>

                <div className="flex items-start justify-between gap-4 border-t border-border pt-3.5">
                  <div className="min-w-0">
                    <Label htmlFor="includePrimaryResidence" className="text-[13px] leading-normal">
                      Includi casa di abitazione nel FIRE
                    </Label>
                    <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">
                      Se disattivo, gli immobili di abitazione sono esclusi (metodologia FIRE standard).
                    </p>
                  </div>
                  <Switch
                    id="includePrimaryResidence"
                    checked={form.includePrimaryResidence}
                    onCheckedChange={(checked) => onFormChange({ includePrimaryResidence: checked })}
                    className="mt-0.5 shrink-0"
                  />
                </div>

                <div className="flex flex-col gap-3 border-t border-border pt-3.5">
                  <div>
                    <p className="text-[13px] text-foreground">Sblocco del fondo pensione</p>
                    <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">
                      Il vincolo si attiva nella tessera Base di calcolo; qui la regola RITA che ne stima l&apos;anno, salvo data impostata
                      sul singolo fondo.
                    </p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="pensionInpsRetirementAge" className="text-[13px]">
                        Età pensione INPS
                      </Label>
                      <Input
                        id="pensionInpsRetirementAge"
                        type="number"
                        inputMode="numeric"
                        min="60"
                        max="75"
                        step="1"
                        value={form.inpsRetirementAge}
                        onChange={(e) => onFormChange({ inpsRetirementAge: e.target.value })}
                        className={CONTROL_CLASS}
                      />
                      <p className="mt-1 text-[11px] leading-[1.4] text-muted-foreground">RITA anticipa lo sblocco di 5 anni rispetto a questa età.</p>
                    </div>
                    <div className="flex items-start justify-between gap-3 sm:pt-6">
                      <div className="min-w-0">
                        <Label htmlFor="pensionRitaLongUnemployment" className="text-[13px] leading-normal">
                          {'Disoccupato ≥ 24 mesi dopo il FIRE'}
                        </Label>
                        <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">{'Anticipa lo sblocco a INPS − 10 anni.'}</p>
                      </div>
                      <Switch
                        id="pensionRitaLongUnemployment"
                        checked={form.ritaLongUnemployment}
                        onCheckedChange={(checked) => onFormChange({ ritaLongUnemployment: checked })}
                        className="mt-0.5 shrink-0"
                      />
                    </div>
                  </div>
                  <NarrativeText segments={ritaPreview} className="text-[11px] leading-[1.4] text-muted-foreground" figureClassName="font-medium" />
                </div>
              </div>

              <div className="mt-auto flex items-center gap-3 pt-4">
                <Button onClick={onSave} disabled={isDemo || isSaving} className="h-9">
                  {isSaving ? 'Salvataggio…' : hasUnsavedChanges ? 'Salva anteprima' : 'Salva impostazioni'}
                </Button>
                {hasUnsavedChanges && (
                  <Button variant="ghost" size="sm" onClick={onReset} disabled={isSaving} className="h-9">
                    Annulla
                  </Button>
                )}
                {isDemo && <span className="text-[11px] text-muted-foreground">non modificabile in demo</span>}
              </div>
            </Tile>
          </div>

          {/* Scenari (6) */}
          <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-6')}>
            <Tile eyebrow="Scenari" aside="crescita e inflazione annue, %" reading={describeScenarioParams()} ariaLabel="Parametri degli scenari">
              <div className="mt-3.5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                {SCENARIO_META.map(({ key, label, slot, icon: Icon }) => (
                  <div key={key} className="rounded-xl border border-border bg-muted p-3.5">
                    {/* A chart slot is not a text colour: the slot is the swatch, the label stays muted. */}
                    <p className="flex items-center gap-1.5 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                      <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: chartColors[slot] }} aria-hidden="true" />
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                      {label}
                    </p>
                    <div className="mt-3 flex flex-col gap-3">
                      <div>
                        <Label htmlFor={`${key}-growth`} className="text-[11px] text-muted-foreground">
                          Crescita mercati
                        </Label>
                        <Input
                          id={`${key}-growth`}
                          type="number"
                          inputMode="decimal"
                          step="0.5"
                          min="0"
                          max="30"
                          value={scenarios[key].growthRate}
                          onChange={(e) => updateScenario(key, 'growthRate', e.target.value)}
                          className={cn(CONTROL_CLASS, 'h-8')}
                        />
                      </div>
                      <div>
                        <Label htmlFor={`${key}-inflation`} className="text-[11px] text-muted-foreground">
                          Inflazione
                        </Label>
                        <Input
                          id={`${key}-inflation`}
                          type="number"
                          inputMode="decimal"
                          step="0.5"
                          min="0"
                          max="15"
                          value={scenarios[key].inflationRate}
                          onChange={(e) => updateScenario(key, 'inflationRate', e.target.value)}
                          className={cn(CONTROL_CLASS, 'h-8')}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-auto flex flex-col gap-2 pt-4 sm:flex-row sm:gap-3">
                <Button variant="outline" size="sm" onClick={onResetScenarios} className="h-9 w-full sm:w-auto">
                  <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
                  Ripristina default
                </Button>
                <Button variant="outline" size="sm" onClick={onSaveScenarios} disabled={isDemo || isSavingScenarios} className="h-9 w-full sm:w-auto">
                  <Save className="mr-2 h-4 w-4" aria-hidden="true" />
                  {isSavingScenarios ? 'Salvataggio…' : 'Salva parametri'}
                </Button>
              </div>
            </Tile>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
