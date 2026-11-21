'use client';

/**
 * The bodies of the plan's eight screens (doc/guide/accumulo.md § Creare un piano: il percorso). Each body
 * reads the answers and dispatches the reducer's actions; the card around it (`PathCard`), the blocks and
 * «Conferma» belong to the wizard. At 390px every row stacks: name over figures over control.
 */

import type { Dispatch } from 'react';
import type { PlanDisposal } from '@/types/accumulationPlan';
import {
  listSellableAssets,
  planPathQuotasTyped,
  planPathTodayWeights,
  resolvePathReserve,
  resolvePathReserveEur,
  saleMayBeWhole,
  type PlanPathAction,
  type PlanPathAnswers,
  type PlanPathContext,
  type PlanPathStart,
} from '@/lib/utils/planPath';
import {
  PLAN_PATH_ADD,
  PLAN_PATH_NEW_INSTRUMENT,
  PLAN_PATH_REDISTRIBUTE,
  PLAN_PATH_START_LABELS,
  PLAN_PATH_START_REPLACES,
  describePathReserveReset,
  describePathReserveSource,
  describePathSuggestionButton,
  describeSaleMonthOption,
  describeSellableHolding,
  estimateSale,
  type PlanPathSummary,
} from '@/lib/utils/planPathNarrative';
import { isPlanSourceAccount, listAddableAssets } from '@/lib/utils/accumulationPlanUtils';
import { ACCUMULO_STEP3_UPDATE_MODEL, describeSuggestedInflow, suggestMonthlyInflow } from '@/lib/utils/accumulationNarrative';
import { MODEL_STALE_READING } from '@/lib/utils/weightOptimizerNarrative';
import { cachedFormatCurrencyEUR, formatNumberIt } from '@/lib/utils/formatters';
import type { MonthlySavingsMedian } from '@/lib/hooks/useMonthlySavingsMedian';
import { cn } from '@/lib/utils';
import { ChoiceList, type ChoiceListOption } from '@/components/ui/choice-list';
import { NumberField, PATH_FIELD_HEIGHT_CLASS } from '@/components/ui/path-fields';
import { PATH_BUTTON_CLASS } from '@/components/ui/path-card';
import { SegmentedPill } from '@/components/ui/segmented-pill';
import { NarrativeText } from '@/components/ui/narrative-text';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const NOTE_CLASS = 'text-[13px] leading-[1.5] text-muted-foreground';
const WARNING_BOX_CLASS = 'rounded-lg border border-warning-border bg-warning p-3 text-[12px] text-warning-foreground';
const LIST_CLASS = 'divide-y divide-border rounded-lg border border-border';
const NEW_INSTRUMENT = '__new__';
const MONTH_CHIPS = ['6', '12', '24', '36'] as const;

export interface PianoScreenProps {
  answers: PlanPathAnswers;
  dispatch: Dispatch<PlanPathAction>;
  context: PlanPathContext;
}

// ─── partenza ─────────────────────────────────────────────────────────────────

export function PartenzaScreen({ answers, dispatch, context, modelUsable, modelStale }: PianoScreenProps & { modelUsable: boolean; modelStale: boolean }) {
  const options: ChoiceListOption<PlanPathStart>[] = [];
  if (context.openDraft && answers.serverDraftId === context.openDraft.id) options.push({ value: 'draft', label: PLAN_PATH_START_LABELS.draft });
  if (answers.seed) options.push({ value: 'seed', label: PLAN_PATH_START_LABELS.seed });
  if (modelUsable) options.push({ value: 'model', label: PLAN_PATH_START_LABELS.model, hint: modelStale ? MODEL_STALE_READING : undefined });
  options.push({ value: 'today', label: PLAN_PATH_START_LABELS.today }, { value: 'zero', label: PLAN_PATH_START_LABELS.zero });
  return (
    <>
      <ChoiceList
        mode="single"
        name="plan-start"
        label="Da dove partono le quote"
        value={answers.start}
        options={options}
        onChange={(start) => dispatch({ type: 'start', start, context })}
      />
      {planPathQuotasTyped(answers, context) && <p className={NOTE_CLASS}>{PLAN_PATH_START_REPLACES}</p>}
    </>
  );
}

// ─── versamento ───────────────────────────────────────────────────────────────

export function VersamentoScreen({ answers, dispatch, savingsMedian }: PianoScreenProps & { savingsMedian: MonthlySavingsMedian | null | undefined }) {
  const suggestion = suggestMonthlyInflow(savingsMedian?.medianEur);
  return (
    <>
      <NumberField id="plan-inflow" label="Ogni mese, in euro" value={answers.monthlyInflowEur} onChange={(monthlyInflowEur) => dispatch({ type: 'set', patch: { monthlyInflowEur } })} />
      {suggestion !== null && savingsMedian && (
        <div className="flex flex-col items-start gap-2">
          <p className={NOTE_CLASS}>{describeSuggestedInflow(suggestion, savingsMedian.months)}</p>
          <Button type="button" variant="outline" className={PATH_BUTTON_CLASS} onClick={() => dispatch({ type: 'set', patch: { monthlyInflowEur: suggestion } })}>
            {describePathSuggestionButton(suggestion)}
          </Button>
        </div>
      )}
    </>
  );
}

// ─── durata ───────────────────────────────────────────────────────────────────

export function DurataScreen({ answers, dispatch }: PianoScreenProps) {
  return (
    <>
      <NumberField id="plan-months" label="Mesi" step="1" min={1} value={answers.months} onChange={(months) => dispatch({ type: 'set', patch: { months } })} />
      <SegmentedPill
        options={MONTH_CHIPS.map((value) => ({ value, label: `${value} mesi` }))}
        value={String(answers.months ?? '')}
        onChange={(value) => dispatch({ type: 'set', patch: { months: Number(value) } })}
        layoutId="plan-months-chips"
        ariaLabel="Durate frequenti"
        semantics="radio"
        className="self-start"
      />
    </>
  );
}

// ─── conto ────────────────────────────────────────────────────────────────────

export function ContoScreen({ answers, dispatch, context }: PianoScreenProps) {
  const accounts = context.assets.filter(isPlanSourceAccount);
  const toggle = (id: string, checked: boolean) =>
    dispatch({ type: 'set', patch: { sourceIds: checked ? [...answers.sourceIds, id] : answers.sourceIds.filter((candidate) => candidate !== id) } });
  if (accounts.length === 0) return null;
  return (
    <ul className={LIST_CLASS} aria-label="Conti">
      {accounts.map((account) => (
        <li key={account.id} className="flex items-start gap-3 px-4 py-3">
          <Checkbox id={`plan-source-${account.id}`} checked={answers.sourceIds.includes(account.id)} onCheckedChange={(checked) => toggle(account.id, checked === true)} className="mt-0.5" />
          <Label htmlFor={`plan-source-${account.id}`} className="flex min-h-11 min-w-0 flex-1 cursor-pointer flex-col items-start gap-0.5 tablet:flex-row tablet:justify-between desktop:min-h-0">
            <span className="text-[14px] font-medium text-foreground">{account.name}</span>
            <span className="font-mono text-[13px] tabular-nums text-muted-foreground">{cachedFormatCurrencyEUR(context.deps.valueOf(account))}</span>
          </Label>
        </li>
      ))}
    </ul>
  );
}

// ─── riserva ──────────────────────────────────────────────────────────────────

export function RiservaScreen({ answers, dispatch, context }: PianoScreenProps) {
  const computed = resolvePathReserve({ ...answers, reserveEur: null }, context);
  return (
    <>
      <NumberField id="plan-reserve" label="Riserva, in euro" value={resolvePathReserveEur(answers, context)} onChange={(reserveEur) => dispatch({ type: 'set', patch: { reserveEur } })} />
      <p className={NOTE_CLASS}>{describePathReserveSource(computed.quotaEur, computed.otherCashEur)}</p>
      {answers.reserveEur !== null && (
        <Button type="button" variant="link" className={cn(PATH_BUTTON_CLASS, 'self-start px-0')} onClick={() => dispatch({ type: 'set', patch: { reserveEur: null } })}>
          {describePathReserveReset(computed.reserveEur)}
        </Button>
      )}
    </>
  );
}

// ─── vendite ──────────────────────────────────────────────────────────────────

export function VenditeScreen({ answers, dispatch, context }: PianoScreenProps) {
  const sellable = listSellableAssets(context);
  const months = answers.months ?? 0;
  const monthIndexes = Array.from({ length: Math.max(0, Math.min(60, months)) }, (_, index) => index + 1);
  return (
    <>
      <ChoiceList
        mode="single"
        name="plan-sales"
        label="Vuoi vendere qualcosa"
        value={answers.wantsSales === null ? null : answers.wantsSales ? 'si' : 'no'}
        options={[
          { value: 'no', label: 'No' },
          { value: 'si', label: 'Sì, scelgo cosa' },
        ]}
        onChange={(value) => dispatch({ type: 'wantsSales', value: value === 'si', context })}
      />
      {answers.wantsSales && (
        <ul className={LIST_CLASS} aria-label="Strumenti da vendere">
          {sellable.map((asset) => {
            const sale = answers.sales.find((candidate) => candidate.assetId === asset.id);
            const mayBeWhole = saleMayBeWhole(answers, asset.id);
            const id = `plan-sale-${asset.id}`;
            return (
              <li key={asset.id} className="flex flex-col gap-3 px-4 py-3">
                <div className="flex items-start gap-3">
                  <Checkbox
                    id={id}
                    checked={!!sale}
                    onCheckedChange={(checked) =>
                      dispatch({ type: 'sale', sale: checked === true ? { assetId: asset.id, quantity: null, month: 1 } : { assetId: asset.id, remove: true }, context })
                    }
                    className="mt-0.5"
                    aria-label={`Vendi ${asset.name}`}
                  />
                  <label htmlFor={id} className="flex min-h-11 min-w-0 flex-1 cursor-pointer flex-col gap-0.5 desktop:min-h-0">
                    <span className="text-[14px] font-medium text-foreground">{asset.name}</span>
                    <span className="font-mono text-[13px] tabular-nums text-muted-foreground">{describeSellableHolding(asset.quantity, context.deps.valueOf(asset))}</span>
                  </label>
                </div>
                {sale && (
                  <div className="flex flex-col gap-3 pl-7 tablet:flex-row tablet:items-end">
                    <div className="tablet:w-40">
                      <NumberField
                        id={`${id}-quantity`}
                        label="Quante quote"
                        step="1"
                        min={1}
                        placeholder={mayBeWhole ? 'tutte' : undefined}
                        value={sale.quantity}
                        onChange={(quantity) => dispatch({ type: 'sale', sale: { assetId: asset.id, quantity, month: sale.month }, context })}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5 tablet:flex-1">
                      <Label htmlFor={`${id}-month`}>In quale mese</Label>
                      <Select value={String(sale.month)} onValueChange={(value) => dispatch({ type: 'sale', sale: { assetId: asset.id, quantity: sale.quantity, month: Number(value) }, context })}>
                        <SelectTrigger id={`${id}-month`} className={PATH_FIELD_HEIGHT_CLASS}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {monthIndexes.map((index) => (
                            <SelectItem key={index} value={String(index)}>
                              {describeSaleMonthOption(context.todayMonth, index)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
                {sale && <p className="pl-7 font-mono text-[12px] tabular-nums text-muted-foreground">{estimateSale(sale, context).line}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

// ─── strumenti ────────────────────────────────────────────────────────────────

export function StrumentiScreen({ answers, dispatch, context, onNewInstrument }: PianoScreenProps & { onNewInstrument: () => void }) {
  const today = planPathTodayWeights(answers, context);
  const sum = answers.positions.reduce((total, position) => total + position.targetPercentage, 0);
  const atHundred = Math.abs(sum - 100) <= 0.01;
  const nameOf = (assetId: string) => context.assets.find((asset) => asset.id === assetId)?.name ?? assetId;
  const disposals: PlanDisposal[] = answers.sales.map((sale) => ({ assetId: sale.assetId, estimatedProceedsEur: 0, status: 'planned' }));
  const addable = listAddableAssets(context.assets, { positions: answers.positions, disposals }, context.tradedAssetIds);
  return (
    <>
      <ul className={LIST_CLASS} aria-label="Strumenti del piano">
        {answers.positions.map((position) => {
          const id = `plan-quota-${position.id}`;
          const group = position.memberAssetIds.length > 1;
          return (
            <li key={position.id} className="flex flex-col gap-2 px-4 py-3 tablet:flex-row tablet:items-center tablet:gap-4">
              <div className="min-w-0 flex-1">
                <Label htmlFor={id} className="text-[14px] font-medium text-foreground">
                  {position.label}
                </Label>
                {group && <p className="text-[12px] text-muted-foreground">compra {nameOf(position.buyAssetId)}</p>}
              </div>
              <span className="font-mono text-[12px] tabular-nums text-muted-foreground">oggi {formatNumberIt(today[position.id] ?? 0, 2)}%</span>
              <div className="flex items-center gap-2 tablet:w-32">
                <Input
                  id={id}
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min={0}
                  max={100}
                  className={cn(PATH_FIELD_HEIGHT_CLASS, 'font-mono tabular-nums')}
                  value={position.targetPercentage}
                  onChange={(event) => dispatch({ type: 'quota', positionId: position.id, targetPercentage: Number(event.target.value.replace(',', '.')) })}
                  aria-describedby={position.targetPercentage === 0 ? `${id}-zero` : undefined}
                />
                <span className="text-[13px] text-muted-foreground">%</span>
              </div>
              {position.targetPercentage === 0 && (
                <span id={`${id}-zero`} className="text-[12px] text-muted-foreground tablet:sr-only">
                  non lo compra
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <div className="flex flex-col gap-3 tablet:flex-row tablet:items-center tablet:justify-between">
        <p className={cn('font-mono text-[13px] tabular-nums', atHundred ? 'text-foreground' : 'text-warning-foreground')}>Somma: {formatNumberIt(sum, 2)}%</p>
        <Button type="button" variant="outline" className={PATH_BUTTON_CLASS} disabled={atHundred} onClick={() => dispatch({ type: 'redistribute' })}>
          {PLAN_PATH_REDISTRIBUTE}
        </Button>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="plan-add">{PLAN_PATH_ADD}</Label>
        <Select
          value=""
          onValueChange={(value) => (value === NEW_INSTRUMENT ? onNewInstrument() : dispatch({ type: 'add', assetId: value, context }))}
        >
          <SelectTrigger id="plan-add" className={PATH_FIELD_HEIGHT_CLASS}>
            <SelectValue placeholder="Scegli uno strumento" />
          </SelectTrigger>
          <SelectContent>
            {addable.map(({ asset }) => (
              <SelectItem key={asset.id} value={asset.id}>
                {asset.name}
              </SelectItem>
            ))}
            <SelectItem value={NEW_INSTRUMENT}>{PLAN_PATH_NEW_INSTRUMENT}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </>
  );
}

// ─── riepilogo ────────────────────────────────────────────────────────────────

export function RiepilogoScreen({
  summary,
  modelBox,
}: {
  summary: PlanPathSummary;
  /** null = hidden (no weight a model could hold). */
  modelBox: { checked: boolean; onChange: (checked: boolean) => void } | null;
}) {
  return (
    <>
      <NarrativeText segments={summary.headline} className="text-[14px] leading-[1.55] text-foreground" />
      <p className={NOTE_CLASS}>{summary.first}</p>
      {summary.saleSteps.map((sentence) => (
        <p key={sentence} className={NOTE_CLASS}>
          {sentence}
        </p>
      ))}
      {summary.sales.length > 0 && (
        <ul className="flex flex-col gap-1" aria-label="Vendite">
          {summary.sales.map((sentence) => (
            <li key={sentence} className={NOTE_CLASS}>
              {sentence}
            </li>
          ))}
        </ul>
      )}
      {summary.taxTotal && <p className={NOTE_CLASS}>{summary.taxTotal}</p>}
      {summary.warnings.map((warning) => (
        <p key={warning} className={WARNING_BOX_CLASS}>
          {warning}
        </p>
      ))}
      {modelBox && (
        <div className="flex items-start gap-3">
          <Checkbox id="plan-update-model" checked={modelBox.checked} onCheckedChange={(checked) => modelBox.onChange(checked === true)} className="mt-0.5" />
          <Label htmlFor="plan-update-model" className="min-h-11 cursor-pointer leading-[1.45] desktop:min-h-0">
            {ACCUMULO_STEP3_UPDATE_MODEL}
          </Label>
        </div>
      )}
    </>
  );
}
