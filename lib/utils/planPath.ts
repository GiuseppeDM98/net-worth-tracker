/**
 * The guided path that creates a plan of accumulation by hand (owner, 2026-11-19: «deve essere il più semplice
 * possibile»): eight screens, one question each, ONE «Conferma» that creates the plan ACTIVE. Pure — the
 * reducer the wizard runs, the seeding of the quotas, each screen's block, the summary's refusal, the draft
 * «Conferma» writes and the browser draft's restore. doc/guide/accumulo.md § Creare un piano: il percorso.
 *
 * Nothing stored on the browser is trusted: `planPathToDraft` recomputes every sale's proceeds from today's
 * price, and a restored draft is checked against today's assets (`reconcilePlanPathAnswers`). The open plan
 * decides the mode: with a draft in Accumulo the path continues THAT draft (`restorePlanPathDraft`).
 */

import type { Asset, AssetAllocationTarget } from '@/types/assets';
import type { AccumulationPlan, AccumulationPlanDraft, MonthKey, PlanDisposal, PlanPosition, PlanSeedDraft } from '@/types/accumulationPlan';
import type { ModelPortfolio } from '@/types/modelPortfolio';
import type { AllocatableHolding, RebalanceBand } from '@/lib/utils/allocationUtils';
import {
  applyModelToPositions,
  applyWeightsToPositions,
  disposalMonthIndex,
  isPlanBuyable,
  isPlanCashFund,
  isPlanSourceAccount,
  marketWeights,
  planCashFundSaleEur,
  proceedsOfDisposal,
  redistributeRemainder,
  resolvePlanReserve,
  resolvePositionStates,
  seedPositionsFromAssets,
  type AllocationCompare,
  type PlanDeps,
} from '@/lib/utils/accumulationPlanUtils';
import { validateDraftAgainstAssets } from '@/lib/utils/accumulationPlanSchema';
import { ACCUMULO_STEP2_PENDING_ASSET_LABEL, describeDraftIssue } from '@/lib/utils/accumulationNarrative';
import { addMonths } from '@/lib/utils/planMonths';
import { formatNumberIt } from '@/lib/utils/formatters';

export type PlanPathScreen = 'partenza' | 'versamento' | 'durata' | 'conto' | 'riserva' | 'vendite' | 'strumenti' | 'riepilogo';
/** The sales BEFORE the instruments: a sale of every share takes its row out of the list. */
export const PLAN_PATH_SCREENS: readonly PlanPathScreen[] = ['partenza', 'versamento', 'durata', 'conto', 'riserva', 'vendite', 'strumenti', 'riepilogo'];
export type PlanPathStart = 'model' | 'today' | 'zero' | 'seed' | 'draft';

export interface PlanPathSale {
  assetId: string;
  /** null = every share */
  quantity: number | null;
  month: number;
  /** A continued draft's swap (owner, 2026-11-20): no screen asks it, the sale keeps it until taken back. */
  reinvestAssetId?: string;
}

export interface PlanPathAnswers {
  start: PlanPathStart | null;
  monthlyInflowEur: number | null;
  months: number | null;
  sourceIds: string[];
  /** null = the computed reserve, which follows the accounts. */
  reserveEur: number | null;
  /** «Vuoi vendere qualcosa?»: null = not answered. */
  wantsSales: boolean | null;
  sales: PlanPathSale[];
  /** Seeded when `start` is chosen, edited on «strumenti». */
  positions: PlanPosition[];
  /** null = on when the quotas differ from the model, or no model exists. */
  updateModel: boolean | null;
  seed?: PlanSeedDraft;
  serverDraftId?: string;
  name?: string;
}

export interface PlanPathDraft {
  version: 1;
  screen: PlanPathScreen;
  answers: PlanPathAnswers;
}

export interface PlanPathContext {
  assets: Asset[];
  /** The Allocazione page's EFFECTIVE targets: `resolveEffectiveTargets(settings, goalData, assets).targets`. */
  targets: AssetAllocationTarget;
  /** `DEFAULT_REBALANCE_BAND`: the route has no band control. */
  band: RebalanceBand;
  model: ModelPortfolio | null;
  /** `resolveInvestmentAccountId(settings, assets)`. */
  investmentAccountId: string | null;
  /** The account's open DRAFT plan, when one exists. */
  openDraft: AccumulationPlan | null;
  tradedAssetIds: ReadonlySet<string> | null;
  /** `buildHoldings(assets, calculateAssetValue)`: the sales' tax line. */
  holdings: AllocatableHolding[];
  /** The Consulente's «rivedi entro», or null (never a reason to wait or to fail). */
  reviewByIso: string | null;
  compare: AllocationCompare;
  deps: PlanDeps;
  /** The month of «today», read once at mount. */
  todayMonth: MonthKey;
}

export type PlanPathAction =
  | { type: 'next' }
  | { type: 'back' }
  | { type: 'start'; start: PlanPathStart; context: PlanPathContext }
  | { type: 'set'; patch: Partial<Pick<PlanPathAnswers, 'monthlyInflowEur' | 'months' | 'sourceIds' | 'reserveEur' | 'updateModel'>> }
  | { type: 'wantsSales'; value: boolean; context: PlanPathContext }
  | { type: 'sale'; sale: PlanPathSale | { assetId: string; remove: true }; context: PlanPathContext }
  | { type: 'quota'; positionId: string; targetPercentage: number }
  | { type: 'redistribute' }
  | { type: 'add'; assetId: string; created?: true; context: PlanPathContext }
  /** A draft «Conferma» wrote and could not activate: the next press overwrites it. */
  | { type: 'adopt'; serverDraftId: string }
  | { type: 'reset'; draft: PlanPathDraft };

const DEFAULT_MONTHS = 12;
const DEFAULT_NAME = 'Piano di accumulo';
const STORAGE_PREFIX = 'plan-path-draft:v1:';

const newId = () => crypto.randomUUID();
const assetsByIdOf = (assets: readonly Asset[]) => new Map(assets.map((asset) => [asset.id, asset]));

function emptyAnswers(investmentAccountId: string | null): PlanPathAnswers {
  return {
    start: null,
    monthlyInflowEur: null,
    months: DEFAULT_MONTHS,
    sourceIds: investmentAccountId ? [investmentAccountId] : [],
    reserveEur: null,
    wantsSales: null,
    sales: [],
    positions: [],
    updateModel: null,
  };
}

function salesOfDisposals(disposals: readonly PlanDisposal[]): PlanPathSale[] {
  return disposals.map((disposal) => ({
    assetId: disposal.assetId,
    quantity: disposal.quantity ?? null,
    month: disposalMonthIndex(disposal),
    ...(disposal.reinvestAssetId === undefined ? {} : { reinvestAssetId: disposal.reinvestAssetId }),
  }));
}

/** The assets sold whole: their rows leave «strumenti». */
function soldWhole(answers: Pick<PlanPathAnswers, 'sales'>): Set<string> {
  return new Set(answers.sales.filter((sale) => sale.quantity === null).map((sale) => sale.assetId));
}

/**
 * Every held buyable instrument has a row (the owner's rule of 2026-11-18, the gate's `unassigned_tradable`):
 * one bought after a draft or a seed was made shows on «strumenti» at 0 %, never only as the summary's refusal.
 */
function withHeldRows(answers: PlanPathAnswers, context: PlanPathContext): PlanPathAnswers {
  const covered = new Set(answers.positions.flatMap((position) => position.memberAssetIds));
  const sold = soldWhole(answers);
  const missing = context.assets.filter(
    (asset) => isPlanBuyable(asset, context.assets) && context.deps.valueOf(asset) > 0 && !covered.has(asset.id) && !sold.has(asset.id)
  );
  if (missing.length === 0) return answers;
  return {
    ...answers,
    positions: [
      ...answers.positions,
      ...missing.map((asset) => ({ id: newId(), label: asset.name, targetPercentage: 0, memberAssetIds: [asset.id], buyAssetId: asset.id })),
    ],
  };
}

/** A position whose only member is `assetId`. */
function isSoleMember(positions: readonly PlanPosition[], assetId: string): boolean {
  return positions.some((position) => position.memberAssetIds.length === 1 && position.memberAssetIds[0] === assetId);
}

function isGroupMember(positions: readonly PlanPosition[], assetId: string): boolean {
  return positions.some((position) => position.memberAssetIds.length > 1 && position.memberAssetIds.includes(assetId));
}

// ─── The drafts the path starts from ──────────────────────────────────────────

export function initialPlanPathDraft(context: PlanPathContext): PlanPathDraft {
  const answers = emptyAnswers(context.investmentAccountId);
  const open = context.openDraft;
  if (!open) return { version: 1, screen: 'partenza', answers };
  const sales = salesOfDisposals(open.disposals.filter((disposal) => disposal.status === 'planned'));
  return {
    version: 1,
    screen: 'partenza',
    answers: withHeldRows(
      {
        ...answers,
        start: 'draft',
        serverDraftId: open.id,
        name: open.name,
        months: open.months,
        monthlyInflowEur: open.liquidity.monthlyInflowEur,
        sourceIds: [...open.liquidity.sourceCashAssetIds],
        reserveEur: open.liquidity.reserveEur,
        positions: open.positions,
        sales,
        wantsSales: sales.length > 0,
      },
      context
    ),
  };
}

/** The draft the model's «Crea un PAC con questi pesi» writes to the browser: no context needed. */
export function seededPlanPathDraft(seed: PlanSeedDraft, investmentAccountId: string | null): PlanPathDraft {
  const sales = salesOfDisposals(seed.disposals ?? []);
  return {
    version: 1,
    screen: 'partenza',
    answers: { ...emptyAnswers(investmentAccountId), start: 'seed', seed, positions: seed.positions, sales, wantsSales: sales.length > 0 },
  };
}

/**
 * The quotas a start gives, with the editor's own helpers. The base is one row per held buyable instrument
 * WITHOUT the ones sold whole: `applyWeightsToPositions` / `applyModelToPositions` read `sold` only not to ADD
 * a position, so a row already in the base would stay.
 */
export function seedPlanPathPositions(start: PlanPathStart, answers: PlanPathAnswers, context: PlanPathContext): PlanPosition[] {
  if (start === 'seed') return answers.seed?.positions ?? [];
  if (start === 'draft') return context.openDraft?.positions ?? [];
  const assetsById = assetsByIdOf(context.assets);
  const labelOf = (id: string) => assetsById.get(id)?.name ?? id;
  const sold = soldWhole(answers);
  const base = seedPositionsFromAssets(context.assets, context.deps.valueOf).filter(
    (position) => !(position.memberAssetIds.length === 1 && sold.has(position.memberAssetIds[0]))
  );
  if (start === 'model') return context.model ? applyModelToPositions(base, context.model, sold, labelOf) : base;
  if (start === 'today') {
    const members = base.flatMap((position) => position.memberAssetIds).map((id) => assetsById.get(id)).filter((asset): asset is Asset => !!asset);
    return applyWeightsToPositions(base, marketWeights(members, context.deps), sold, labelOf);
  }
  return base.map((position) => ({ ...position, targetPercentage: 0 }));
}

/**
 * Whether the quotas differ from the ones the chosen start gives (2026-11-20): «Le quote che avevi scritto vengono
 * sostituite.» shows only then — never at the first choice, nor on a seed or a draft just opened. Compared by the
 * members and the quota of every row above 0 (the ids are new at each seeding; a row at 0 % is no quota typed).
 */
export function planPathQuotasTyped(answers: PlanPathAnswers, context: PlanPathContext): boolean {
  if (answers.start === null) return false;
  const quotas = (positions: readonly PlanPosition[]) =>
    positions
      .filter((position) => position.targetPercentage > 0)
      .map((position) => `${[...position.memberAssetIds].sort().join('+')}:${position.targetPercentage}`)
      .sort()
      .join('|');
  return quotas(answers.positions) !== quotas(seedPlanPathPositions(answers.start, answers, context));
}

// ─── The reducer ──────────────────────────────────────────────────────────────

function step(screen: PlanPathScreen, by: 1 | -1): PlanPathScreen {
  const index = PLAN_PATH_SCREENS.indexOf(screen);
  return PLAN_PATH_SCREENS[Math.max(0, Math.min(PLAN_PATH_SCREENS.length - 1, index + by))];
}

function applySale(answers: PlanPathAnswers, action: Extract<PlanPathAction, { type: 'sale' }>): PlanPathAnswers {
  const { sale, context } = action;
  const rest = answers.sales.filter((candidate) => candidate.assetId !== sale.assetId);
  if ('remove' in sale) return withHeldRows({ ...answers, sales: rest }, context);
  const asset = context.assets.find((candidate) => candidate.id === sale.assetId);
  const held = asset?.quantity ?? 0;
  const typed = sale.quantity === null ? null : Math.floor(sale.quantity);
  // A group's member keeps what was typed (the engine's `disposal_full_on_position`): every share is the
  // block of «vendite», never a silent whole sale.
  const whole = !isGroupMember(answers.positions, sale.assetId) && (typed === null || typed >= held);
  const swap = answers.sales.find((candidate) => candidate.assetId === sale.assetId)?.reinvestAssetId;
  const next: PlanPathSale = { assetId: sale.assetId, quantity: whole ? null : typed, month: sale.month, ...(swap === undefined ? {} : { reinvestAssetId: swap }) };
  // A sale of every share takes the asset's own row away (its quota is left to «Ridistribuisci il resto»).
  const positions = whole && isSoleMember(answers.positions, sale.assetId)
    ? answers.positions.filter((position) => !(position.memberAssetIds.length === 1 && position.memberAssetIds[0] === sale.assetId))
    : answers.positions;
  return withHeldRows({ ...answers, sales: [...rest, next], positions }, context);
}

const clampQuota = (value: number) => Math.round(Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0)) * 100) / 100;

export function planPathReducer(draft: PlanPathDraft, action: PlanPathAction): PlanPathDraft {
  const { answers } = draft;
  switch (action.type) {
    case 'next':
      return { ...draft, screen: step(draft.screen, 1) };
    case 'back':
      return { ...draft, screen: step(draft.screen, -1) };
    case 'start': {
      const carried =
        action.start === 'seed' ? salesOfDisposals(answers.seed?.disposals ?? [])
        : action.start === 'draft' ? salesOfDisposals((action.context.openDraft?.disposals ?? []).filter((d) => d.status === 'planned'))
        : null;
      const base = carried ? { ...answers, sales: carried, wantsSales: carried.length > 0 } : answers;
      const positions = seedPlanPathPositions(action.start, base, action.context);
      return { ...draft, answers: withHeldRows({ ...base, start: action.start, positions }, action.context) };
    }
    case 'set':
      return { ...draft, answers: { ...answers, ...action.patch } };
    case 'wantsSales':
      return { ...draft, answers: withHeldRows({ ...answers, wantsSales: action.value, sales: action.value ? answers.sales : [] }, action.context) };
    case 'sale':
      return { ...draft, answers: applySale(answers, action) };
    case 'quota':
      return {
        ...draft,
        answers: {
          ...answers,
          positions: answers.positions.map((position) => (position.id === action.positionId ? { ...position, targetPercentage: clampQuota(action.targetPercentage) } : position)),
        },
      };
    case 'redistribute':
      return { ...draft, answers: { ...answers, positions: redistributeRemainder(answers.positions) } };
    case 'add': {
      if (answers.positions.some((position) => position.memberAssetIds.includes(action.assetId))) return draft;
      // An asset `AssetDialog` just created is not in the context until the query is read again: its row
      // carries the pending label, which `reconcilePlanPathAnswers` replaces with the name.
      const label = action.created ? ACCUMULO_STEP2_PENDING_ASSET_LABEL : action.context.assets.find((asset) => asset.id === action.assetId)?.name ?? ACCUMULO_STEP2_PENDING_ASSET_LABEL;
      const position: PlanPosition = { id: newId(), label, targetPercentage: 0, memberAssetIds: [action.assetId], buyAssetId: action.assetId };
      return { ...draft, answers: { ...answers, positions: [...answers.positions, position] } };
    }
    case 'adopt':
      return { ...draft, answers: { ...answers, serverDraftId: action.serverDraftId } };
    case 'reset':
      return action.draft;
    default:
      return draft;
  }
}

// ─── The figures the screens read ─────────────────────────────────────────────

/** The sales as the engine's disposals, the proceeds always recomputed from today's price. */
function salesAsDisposals(answers: Pick<PlanPathAnswers, 'sales' | 'positions'>, context: PlanPathContext, assetsById: Map<string, Asset>): PlanDisposal[] {
  return answers.sales.map((sale) => {
    // The swap is written only while the plan still buys its instrument (the engine's `swap_target`).
    const swap = sale.reinvestAssetId !== undefined && answers.positions.some((p) => p.buyAssetId === sale.reinvestAssetId) ? sale.reinvestAssetId : undefined;
    const quantity = sale.quantity ?? undefined;
    const estimatedProceedsEur = proceedsOfDisposal({ assetId: sale.assetId, quantity, estimatedProceedsEur: 0, status: 'planned' }, assetsById.get(sale.assetId), context.deps);
    return { assetId: sale.assetId, ...(quantity === undefined ? {} : { quantity }), monthIndex: sale.month, estimatedProceedsEur, status: 'planned' as const, ...(swap === undefined ? {} : { reinvestAssetId: swap }) };
  });
}

/** The reserve and where it comes from: the allocation's cash quota, the cash already outside the ticked accounts. */
export function resolvePathReserve(answers: PlanPathAnswers, context: PlanPathContext): { reserveEur: number; quotaEur: number; otherCashEur: number } {
  const assetsById = assetsByIdOf(context.assets);
  const soldEur = planCashFundSaleEur(salesAsDisposals(answers, context, assetsById), assetsById, context.assets);
  return resolvePlanReserve(context.assets, context.targets, context.compare, context.deps, soldEur, answers.sourceIds);
}

export function resolvePathReserveEur(answers: PlanPathAnswers, context: PlanPathContext): number {
  return answers.reserveEur ?? resolvePathReserve(answers, context).reserveEur;
}

/** «oggi {x}%» per position id: its members' value over the value of every position's members, two decimals. */
export function planPathTodayWeights(answers: PlanPathAnswers, context: PlanPathContext): Record<string, number> {
  const assetsById = assetsByIdOf(context.assets);
  const states = resolvePositionStates(answers.positions, assetsById, context.deps, salesAsDisposals(answers, context, assetsById));
  const base = states.reduce((sum, state) => sum + state.currentValueEur, 0);
  const weights: Record<string, number> = {};
  for (const state of states) weights[state.positionId] = base > 0 ? Math.round((state.currentValueEur / base) * 10000) / 100 : 0;
  return weights;
}

/** The instruments «vendite» offers: the held buyable ones and the money-market funds. */
export function listSellableAssets(context: Pick<PlanPathContext, 'assets'>): Asset[] {
  return context.assets.filter((asset) => asset.quantity > 0 && (isPlanBuyable(asset, context.assets) || isPlanCashFund(asset, context.assets)));
}

/** Whether a sale's quantity field may stay empty for «tutte»: never on a group's member. */
export function saleMayBeWhole(answers: Pick<PlanPathAnswers, 'positions'>, assetId: string): boolean {
  return !isGroupMember(answers.positions, assetId);
}

// ─── Blocks and refusal ───────────────────────────────────────────────────────

const WEIGHT_SUM_TOLERANCE = 0.01;

/** The sentence that disables «Avanti» on `screen`; null = free to go. */
export function describePlanPathBlock(screen: PlanPathScreen, answers: PlanPathAnswers, context: PlanPathContext): string | null {
  const nameOf = (id: string) => context.assets.find((asset) => asset.id === id)?.name ?? id;
  switch (screen) {
    case 'partenza':
      return answers.start === null ? 'Scegli da dove partire.' : null;
    case 'versamento': {
      const value = answers.monthlyInflowEur;
      return value === null || !Number.isFinite(value) || value < 0 ? 'Scrivi quanto versi ogni mese, anche 0.' : null;
    }
    case 'durata': {
      const months = answers.months;
      return months === null || !Number.isInteger(months) || months < 1 || months > 60 ? 'Scrivi una durata fra 1 e 60 mesi.' : null;
    }
    case 'conto':
      if (!context.assets.some(isPlanSourceAccount)) return 'Non hai un conto di liquidità: creane uno in Patrimonio.';
      return answers.sourceIds.length === 0 ? 'Scegli almeno un conto.' : null;
    case 'riserva':
      return answers.reserveEur !== null && answers.reserveEur < 0 ? 'La riserva non può essere negativa.' : null;
    case 'vendite': {
      if (answers.wantsSales === null) return 'Scegli se vendere qualcosa.';
      const months = answers.months ?? 0;
      for (const sale of answers.sales) {
        const name = nameOf(sale.assetId);
        const whole = sale.quantity === null && saleMayBeWhole(answers, sale.assetId);
        if (!whole && (sale.quantity === null || !Number.isInteger(sale.quantity) || sale.quantity < 1)) return `${name}: scrivi quante quote vendere, almeno 1.`;
        if (sale.quantity !== null && isGroupMember(answers.positions, sale.assetId)) {
          const held = context.assets.find((asset) => asset.id === sale.assetId)?.quantity ?? 0;
          if (sale.quantity >= held) return `${name}: puoi vendere al massimo ${Math.max(0, Math.ceil(held) - 1)} quote.`;
        }
        if (sale.month < 1 || sale.month > months) return describeDraftIssue({ code: 'sale_month_out', label: name });
      }
      return null;
    }
    case 'strumenti': {
      if (!answers.positions.some((position) => position.targetPercentage > 0)) return 'Il piano deve comprare almeno uno strumento.';
      const sum = answers.positions.reduce((total, position) => total + position.targetPercentage, 0);
      return Math.abs(sum - 100) > WEIGHT_SUM_TOLERANCE ? `Le quote sommano a ${formatNumberIt(sum, 2)}%: devono fare 100.` : null;
    }
    case 'riepilogo':
      return null;
  }
}

/** The summary's refusal: the first screen's block in order, else the engine's gate on the draft. */
export function firstPlanPathRefusal(answers: PlanPathAnswers, context: PlanPathContext): string | null {
  for (const screen of PLAN_PATH_SCREENS) {
    const block = describePlanPathBlock(screen, answers, context);
    if (block) return block;
  }
  const issues = validateDraftAgainstAssets(planPathToDraft(answers, context), assetsByIdOf(context.assets));
  return issues[0]?.message ?? null;
}

// ─── The draft «Conferma» writes ──────────────────────────────────────────────

export function planPathToDraft(answers: PlanPathAnswers, context: PlanPathContext): AccumulationPlanDraft {
  const assetsById = assetsByIdOf(context.assets);
  const open = context.openDraft;
  const continues = answers.start === 'draft' && !!open && answers.serverDraftId === open.id;
  const optimizerSnapshot =
    answers.seed?.optimizerSnapshot ?? (answers.start === 'model' ? context.model?.optimizerSnapshot : answers.start === 'draft' ? open?.optimizerSnapshot : undefined);
  return {
    name: answers.name ?? DEFAULT_NAME,
    startMonth: addMonths(context.todayMonth, 1),
    months: answers.months ?? 0,
    liquidity: { sourceCashAssetIds: [...answers.sourceIds], reserveEur: resolvePathReserveEur(answers, context), monthlyInflowEur: answers.monthlyInflowEur ?? 0 },
    positions: answers.positions,
    disposals: salesAsDisposals(answers, context, assetsById),
    ...(optimizerSnapshot ? { optimizerSnapshot } : {}),
    // What a continued draft carried and the path never asks (the Consulente's review month and notes).
    ...(continues && open?.reviewMonthIndex !== undefined ? { reviewMonthIndex: open.reviewMonthIndex } : {}),
    ...(continues && open?.advisorNotes !== undefined ? { advisorNotes: open.advisorNotes } : {}),
  };
}

// ─── The browser draft ────────────────────────────────────────────────────────

/** A stored draft against today's assets: what is gone is dropped, a pending label takes its name. */
export function reconcilePlanPathAnswers(answers: PlanPathAnswers, context: PlanPathContext): PlanPathAnswers {
  const assetsById = assetsByIdOf(context.assets);
  const positions: PlanPosition[] = [];
  for (const position of answers.positions) {
    // A row just created by «Nuovo strumento…» waits for its asset: it is kept until the assets are read again.
    const pending = position.label === ACCUMULO_STEP2_PENDING_ASSET_LABEL;
    if (!assetsById.has(position.buyAssetId) && !pending) continue;
    const memberAssetIds = position.memberAssetIds.filter((id) => assetsById.has(id) || (pending && id === position.buyAssetId));
    if (memberAssetIds.length === 0) continue;
    const label = pending && assetsById.has(position.buyAssetId) ? assetsById.get(position.buyAssetId)!.name : position.label;
    positions.push({ ...position, label, memberAssetIds });
  }
  const stillOpen = answers.serverDraftId !== undefined && answers.serverDraftId === context.openDraft?.id;
  const next: PlanPathAnswers = {
    ...answers,
    sourceIds: answers.sourceIds.filter((id) => assetsById.has(id)),
    sales: answers.sales.filter((sale) => assetsById.has(sale.assetId)),
    positions,
  };
  if (!stillOpen) {
    delete next.serverDraftId;
    if (next.start === 'draft') next.start = null;
  }
  return withHeldRows(next, context);
}

/** What the wizard starts from: the stored draft checked against today, or the initial one. */
export function restorePlanPathDraft(stored: PlanPathDraft | null, context: PlanPathContext): PlanPathDraft {
  if (!stored) return initialPlanPathDraft(context);
  // The open plan decides: a browser draft born without it would be refused by the lock at «Conferma» forever.
  if (context.openDraft && stored.answers.serverDraftId !== context.openDraft.id) return initialPlanPathDraft(context);
  const answers = reconcilePlanPathAnswers(stored.answers, context);
  if (answers.start === null) {
    const initial = initialPlanPathDraft(context);
    return { ...initial, answers: { ...initial.answers, sourceIds: answers.sourceIds } };
  }
  return { ...stored, answers };
}

export function planPathStorageKey(ownerId: string): string {
  return `${STORAGE_PREFIX}${ownerId}`;
}

const isNumberOrNull = (value: unknown) => value === null || typeof value === 'number';

/** The stored draft, or null for any other version or shape; `computedAt` comes back a `Date`. */
export function parseStoredPlanPath(value: unknown): PlanPathDraft | null {
  if (!value || typeof value !== 'object') return null;
  const draft = value as Partial<PlanPathDraft>;
  if (draft.version !== 1 || typeof draft.screen !== 'string' || !PLAN_PATH_SCREENS.includes(draft.screen)) return null;
  const answers = draft.answers as Partial<PlanPathAnswers> | undefined;
  if (!answers || typeof answers !== 'object') return null;
  if (!isNumberOrNull(answers.monthlyInflowEur) || !isNumberOrNull(answers.months) || !isNumberOrNull(answers.reserveEur)) return null;
  if (!Array.isArray(answers.sourceIds) || !Array.isArray(answers.sales) || !Array.isArray(answers.positions)) return null;
  if (answers.wantsSales !== null && typeof answers.wantsSales !== 'boolean') return null;
  if (answers.updateModel !== null && typeof answers.updateModel !== 'boolean') return null;
  if (answers.start !== null && !['model', 'today', 'zero', 'seed', 'draft'].includes(answers.start as string)) return null;
  const snapshot = answers.seed?.optimizerSnapshot;
  const seed = snapshot ? { ...answers.seed!, optimizerSnapshot: { ...snapshot, computedAt: new Date(snapshot.computedAt) } } : answers.seed;
  return { version: 1, screen: draft.screen, answers: { ...(answers as PlanPathAnswers), ...(seed ? { seed } : {}) } };
}
