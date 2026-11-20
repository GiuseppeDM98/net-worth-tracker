'use client';

/**
 * The plan of accumulation on «Applica» (2026-11-20, doc/guide/consulente-piano.md § After
 * «Applica»): the report's operating plan turned into a plan the click creates, shown BEFORE the
 * click with everything the report did not say — the summary, the account, the instruments to
 * create with their listing, price and date, the app's corrections, what happens to an open plan.
 *
 * Loaded through `lazyComponent()` only, and only on «Applica» with a usable plan: it is the one file
 * of the Consulente's route that imports the plan's builder, its utils and the accumulation services,
 * so the route's first load carries none of them. The build is pure and runs in render; the host
 * hears of it through `onBuild`, from an effect keyed on the build's fingerprint — never the object.
 */

import { useEffect, useEffectEvent, useMemo, useState } from 'react';
import Link from 'next/link';
import type { AllocationAdviceDocument } from '@/types/allocationAdvice';
import type { AccumulationPlan } from '@/types/accumulationPlan';
import type { Asset, AssetAllocationSettings, AssetAllocationTarget } from '@/types/assets';
import type { GoalBasedInvestingData } from '@/types/goals';
import { useSettings } from '@/lib/hooks/useSettings';
import { selectOpenPlan, useAccumulationPlans } from '@/lib/hooks/useAccumulationPlans';
import { useAdviceQuotes } from '@/lib/hooks/useAdviceQuotes';
import { calculateAssetValue } from '@/lib/services/assetService';
import { compareAllocations } from '@/lib/services/assetAllocationService';
import { buildAdvicePlan, resolveNewInstrumentPricing, type AdvicePlanBuild, type NewInstrumentPricing, type RawQuote } from '@/lib/utils/advicePlan';
import { isPlanSourceAccount, resolveInvestmentAccountId } from '@/lib/utils/accumulationPlanUtils';
import { DEFAULT_REBALANCE_BAND } from '@/lib/utils/allocationUtils';
import { buildModelBasis, type ModelBasis } from '@/lib/utils/modelPortfolio';
import { operatingPlanOf, type OperatingPlanInstrument } from '@/lib/utils/operatingPlan';
import { unitPriceEur } from '@/lib/utils/costBasisEur';
import { ACCUMULO_HREF, ACCUMULO_OPEN_LINK, ACCUMULO_PLAN_NOTHING_TO_REVISE } from '@/lib/utils/accumuloCopy';
import { ADVICE_PLAN_TICK_COPY } from '@/lib/utils/allocationAdviceNarrative';
import { describeAdvicePlanSummary, describeNewInstrument } from '@/lib/utils/advicePlanNarrative';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TILE_FOOTER_ACTION_CLASS, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { cn } from '@/lib/utils';

/** What the host needs to run the click: a build that can be created now. */
export interface AdvicePlanReady {
  /** `blocked === null`. */
  build: AdvicePlanBuild;
  sourceAssetId: string;
  saveSourceAsSetting: boolean;
  openPlan: AccumulationPlan | null;
  basis: ModelBasis;
}

export interface ConsulentePlanTickProps {
  ownerId: string;
  document: AllocationAdviceDocument;
  /** The live assets with the ticked role changes applied. */
  assets: Asset[];
  /** The targets the plan goes toward (`resolveEffectiveTargets`). */
  targets: AssetAllocationTarget;
  /** The goal document after the click: the written one when «Gli obiettivi» is ticked, else the route's. */
  goalsAfter: GoalBasedInvestingData | null;
  /** 'tick' on a ready report (a checkbox among the three); 'button' on an applied one (a line, the host's button). */
  mode: 'tick' | 'button';
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  /** «I target» ticked: the plan goes toward the new targets, so it is applied with them. */
  targetsTicked: boolean;
  onBuild: (ready: AdvicePlanReady | null) => void;
}

const deps = { valueOf: calculateAssetValue, priceOf: unitPriceEur };

/** Deterministic position ids: the build runs in render, so a random id would change on every one. */
/** A coefficient as typed, «1,2345» or «1.2345»; null when it is no positive number (a BTP€i's sits near 1). */
function parseCoefficient(text: string | undefined): number | null {
  const value = Number((text ?? '').trim().replace(',', '.'));
  return (text ?? '').trim() !== '' && Number.isFinite(value) && value > 0 && value < 10 ? value : null;
}

function sequentialIds(): () => string {
  let next = 0;
  return () => `pos-${++next}`;
}

function labelOf(action: AdvicePlanBuild['action'] | null): string {
  return action === 'replace' ? ADVICE_PLAN_TICK_COPY.labelReplace : action === 'revise' ? ADVICE_PLAN_TICK_COPY.labelRevise : ADVICE_PLAN_TICK_COPY.labelCreate;
}

export function ConsulentePlanTick(props: ConsulentePlanTickProps) {
  const { ownerId, document, assets, targets, goalsAfter, mode, targetsTicked } = props;
  const settingsQuery = useSettings(ownerId);
  const plansQuery = useAccumulationPlans(ownerId);
  // One instant per mount: the quotes' age and the plan's months are measured on it.
  const [today] = useState(() => new Date());
  const [chosenSource, setChosenSource] = useState<string | null>(null);
  const plan = operatingPlanOf(document);

  // Every `new` instrument by its symbols, but a government bond with an ISIN: Borsa Italiana by its ISIN (2026-11-20).
  const isBond = (instrument: OperatingPlanInstrument) => instrument.prefill?.type === 'bond' && !!instrument.prefill.isin?.trim();
  const newInstruments = (plan?.instruments ?? []).filter((instrument) => instrument.kind === 'new');
  const symbols = newInstruments.filter((instrument) => !isBond(instrument)).flatMap((instrument) => instrument.symbols ?? []);
  const bondIsins = newInstruments.filter(isBond).map((instrument) => instrument.prefill!.isin!.trim().toUpperCase());
  const quotesQuery = useAdviceQuotes(symbols, { enabled: plan !== null, isins: bondIsins });
  // A BTP€i's indexation coefficient, as typed (it-IT decimals), by ref.
  const [coefficients, setCoefficients] = useState<Record<string, string>>({});

  const settings = settingsQuery.data ?? null;
  const investmentId = resolveInvestmentAccountId(settings, assets);
  const sourceAccounts = assets.filter(isPlanSourceAccount);
  const sourceAssetId = investmentId ?? chosenSource;
  // A plan restored from the persisted cache is not today's: the build waits for a read after mount.
  const plansRead = plansQuery.isSuccess && plansQuery.isFetchedAfterMount;
  const loading = settingsQuery.isPending || (plansQuery.isPending && !plansQuery.isError) || (!plansRead && !plansQuery.isError) || ((symbols.length > 0 || bondIsins.length > 0) && quotesQuery.isPending);

  const state: string | null = !plan
    ? ADVICE_PLAN_TICK_COPY.loading
    : loading
      ? ADVICE_PLAN_TICK_COPY.loading
      : plansQuery.isError
        ? ADVICE_PLAN_TICK_COPY.plansFailed
        : sourceAccounts.length === 0
          ? ADVICE_PLAN_TICK_COPY.noAccount
          : mode === 'tick' && !targetsTicked
            ? ADVICE_PLAN_TICK_COPY.targetsUnticked
            : null;

  const openPlan = plansRead ? (selectOpenPlan(plansQuery.data ?? []) ?? null) : null;
  const quotes = quotesQuery.data;
  const build = useMemo((): AdvicePlanBuild | null => {
    if (!plan || state !== null || !sourceAssetId) return null;
    const quotesOf = (list: readonly string[]): RawQuote[] => list.map((symbol) => quotes?.[symbol] ?? { symbol, price: null });
    const pricing: Record<string, NewInstrumentPricing> = {};
    for (const instrument of plan.instruments) {
      if (instrument.kind !== 'new' || !instrument.prefill) continue;
      const isin = instrument.prefill.isin?.trim().toUpperCase() ?? '';
      const coefficient = parseCoefficient(coefficients[instrument.ref]);
      pricing[instrument.ref] = resolveNewInstrumentPricing(instrument, quotesOf(instrument.symbols ?? []), today.getTime(), {
        pricePct: quotes?.[isin]?.price ?? null,
        ...(coefficient !== null ? { coefficient } : {}),
      });
    }
    return buildAdvicePlan({
      plan,
      assets,
      keepNames: document.answers.keepAssets ?? [],
      limits: settings?.idealAllocation?.instrumentLimits ?? [],
      targets,
      sourceAssetId,
      openPlan,
      pricing,
      band: DEFAULT_REBALANCE_BAND,
      compare: compareAllocations,
      deps,
      today,
      generateId: sequentialIds(),
    });
  }, [plan, state, sourceAssetId, quotes, coefficients, assets, document.answers.keepAssets, settings, targets, openPlan, today]);

  const basis = useMemo(
    () => buildModelBasis({ ...(settings ?? {}), targets } as AssetAllocationSettings, goalsAfter?.goals),
    [settings, targets, goalsAfter]
  );
  const ready: AdvicePlanReady | null =
    build && build.blocked === null && sourceAssetId
      ? { build, sourceAssetId, saveSourceAsSetting: investmentId === null, openPlan, basis }
      : null;

  // The host hears of the build when it changes in substance, never on a new object of the same plan.
  const fingerprint = ready
    ? JSON.stringify([ready.build.action, ready.build.blocked, ready.build.draft.positions, ready.build.draft.disposals, ready.build.toCreate, ready.sourceAssetId, ready.openPlan?.id ?? null, basis])
    : 'none';
  const report = useEffectEvent(() => props.onBuild(ready));
  useEffect(() => {
    report();
  }, [fingerprint]);

  const sentence = state ?? (build ? (build.blocked ?? describeAdvicePlanSummary(build)) : null);
  const line = sentence ? `${labelOf(build?.action ?? null)}: ${sentence}` : labelOf(build?.action ?? null);
  const showSelect = state === null && investmentId === null && sourceAccounts.length > 0;

  return (
    <div data-plan-tick={mode} className="flex flex-col gap-2">
      {mode === 'tick' ? (
        <div className="flex items-start gap-3">
          <Checkbox id="apply-plan" checked={props.checked && ready !== null} onCheckedChange={(value) => props.onCheckedChange(value === true)} className="mt-0.5" disabled={ready === null} />
          <Label htmlFor="apply-plan" className="min-h-11 cursor-pointer leading-[1.45] desktop:min-h-0">
            {line}
          </Label>
        </div>
      ) : (
        <p className="text-[13px] leading-[1.45] text-foreground">{line}</p>
      )}
      {build?.blocked === ACCUMULO_PLAN_NOTHING_TO_REVISE && (
        <Link href={ACCUMULO_HREF} className={cn(TILE_FOOTER_ACTION_CLASS, 'w-fit')}>
          {ACCUMULO_OPEN_LINK}
        </Link>
      )}
      {showSelect && (
        <div className={cn('flex flex-col gap-1.5', mode === 'tick' && 'pl-7')}>
          <Label htmlFor="apply-plan-source" className="text-[12px] text-muted-foreground">
            {ADVICE_PLAN_TICK_COPY.sourceQuestion}
          </Label>
          <Select value={chosenSource ?? undefined} onValueChange={setChosenSource}>
            <SelectTrigger id="apply-plan-source" className="h-11 w-full tablet:w-72 desktop:h-9">
              <SelectValue placeholder={ADVICE_PLAN_TICK_COPY.sourcePlaceholder} />
            </SelectTrigger>
            <SelectContent>
              {sourceAccounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[12px] text-muted-foreground">{ADVICE_PLAN_TICK_COPY.sourceRemembered}</p>
        </div>
      )}
      {build && build.toCreate.length > 0 && (
        <ul className={cn('flex flex-col gap-0.5', mode === 'tick' && 'pl-7')} aria-label={ADVICE_PLAN_TICK_COPY.instrumentsLabel}>
          {build.toCreate.map((item) => (
            <li key={item.ref} className="text-[12px] leading-[1.45] text-muted-foreground">
              {describeNewInstrument(item.formData.name, item.pricing)}
              {item.pricing.kind === 'bond' && item.pricing.indexed && item.pricing.pricePct !== null && (
                <span className="mt-1 flex flex-col gap-1 tablet:flex-row tablet:items-center tablet:gap-2">
                  <Label htmlFor={`apply-coefficient-${item.ref}`} className="sr-only">
                    {ADVICE_PLAN_TICK_COPY.coefficientLabel(item.formData.name)}
                  </Label>
                  <Input
                    id={`apply-coefficient-${item.ref}`}
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder={ADVICE_PLAN_TICK_COPY.coefficientPlaceholder}
                    value={coefficients[item.ref] ?? ''}
                    onChange={(event) => setCoefficients((prev) => ({ ...prev, [item.ref]: event.target.value }))}
                    className="h-11 w-full font-mono tabular-nums tablet:w-40 desktop:h-9"
                  />
                  <span>{ADVICE_PLAN_TICK_COPY.coefficientHint}</span>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {build && build.notes.length > 0 && (
        <div className={cn(mode === 'tick' && 'pl-7')}>
          <p className={TILE_SUB_EYEBROW_CLASS}>{ADVICE_PLAN_TICK_COPY.notesEyebrow}</p>
          <ul className="mt-1 divide-y divide-border">
            {build.notes.map((note) => (
              <li key={note} className="py-1 text-[12px] leading-[1.45] text-muted-foreground">
                {note}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default ConsulentePlanTick;
