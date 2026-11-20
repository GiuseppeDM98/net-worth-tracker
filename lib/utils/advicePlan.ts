/**
 * The plan of accumulation the Consulente's «Applica» creates from the operating plan (2026-11-20,
 * doc/guide/consulente-piano.md § After «Applica»): ONE pure builder, run in render on the «Applica»
 * page and again on the re-read data by the click.
 *
 * The stored operating plan was checked on the portfolio of the day it was written; the builder
 * refreshes its facts on TODAY's portfolio (`refreshOperatingPlanFacts`) and runs the same reconcile
 * again, so a sale already made, an instrument bought since or a new limit are corrected and SAID
 * (each correction one sentence in `notes`, shown before the click and stored on the plan). Then it
 * lays the draft the plan's services write: the positions, the sales in their months, the reserve
 * on the chosen account, in the plan's own month frame — a revision of an active plan is numbered
 * from its first intact instalment `k`, as the editor's revision is (one frame, the plan's).
 *
 * The missing instruments are in the draft as `new:<ref>` and become real ids at the click; the
 * engine's preview reads them as synthetic assets at 0 quotes with the price the page found.
 *
 * Loaded only by the «Applica» page's lazy component and the click's service: the Consulente's route
 * keeps it out of its first load (a test reads the route's sources).
 */

import type { AccumulationPlan, AccumulationPlanDraft, PlanDisposal, PlanPosition } from '@/types/accumulationPlan';
import type { Asset, AssetAllocationTarget, AssetFormData, AssetPrefill, IdealAllocationSettings } from '@/types/assets';
import type { RebalanceBand } from '@/lib/utils/allocationUtils';
import {
  addMonths,
  buildDraftPreview,
  findFirstIntactInstallment,
  isOpenSavedDisposal,
  planCashFundSaleEur,
  proceedsOfDisposal,
  resolvePlanReserve,
  resolvePositionStates,
  swapTargetOf,
  toMonthKey,
  type AllocationCompare,
  type PlanDeps,
} from '@/lib/utils/accumulationPlanUtils';
import { validateDraftAgainstAssets, type DraftIssue } from '@/lib/utils/accumulationPlanSchema';
import { reconcileOperatingPlan, type OperatingPlan, type OperatingPlanInstrument, type RawOperatingPlan } from '@/lib/utils/operatingPlan';
import { refreshOperatingPlanFacts } from '@/lib/utils/operatingPlanFacts';
import { ACCUMULO_PLAN_NOTHING_TO_REVISE, ADVICE_SOURCE_GONE } from '@/lib/utils/accumuloCopy';
import { bondUnitPriceEur } from '@/lib/utils/bondPricing';

/** Calendar days a quote may be old and still price a new instrument: a long weekend passes. */
export const FRESH_QUOTE_DAYS = 5;
const DAY_MS = 86_400_000;
/** The schema's bounds on the plan's notes (`accumulationPlanDraftSchema`): a capped list always parses. */
const NOTE_MAX_CHARS = 400;
const NOTES_MAX = 40;
const MAX_PLAN_MONTHS = 60;

export const ADVICE_PLAN_NAME = 'Piano di accumulo';

export const ADVICE_PLAN_COPY = {
  alreadySold: (name: string) => `${name}: il piano attivo ha già registrato una vendita; quella nuova non entra.`,
  monthsCapped: (closed: number, months: number) =>
    `Il piano attivo ha già ${closed} ${closed === 1 ? 'rata chiusa' : 'rate chiuse'}: la durata scende a ${months} ${months === 1 ? 'mese' : 'mesi'}.`,
  nothingToInvest: 'Oggi il piano non ha niente da investire: sopra la riserva non c\'è liquidità, e non ci sono versamenti né vendite.',
  nothingPriced: 'Nessuno degli strumenti da comprare ha un prezzo: dai loro un ticker in Patrimonio, poi crea il piano da qui.',
  sourceGone: ADVICE_SOURCE_GONE,
  swapUnpriced: (sold: string, bought: string) =>
    `${bought} non ha ancora un prezzo: il ricavato di ${sold} entra nel piano come le altre vendite, non lo compra subito.`,
} as const;

// ─── The quotes and the new instruments ──────────────────────────────────────

export interface AdviceQuote { symbol: string; price: number; currency: string; priceEur: number; quotedAt: string }
export interface RawQuote { symbol: string; price: number | null; currency?: string; currentPriceEur?: number; quotedAt?: string }

/** The first quote, in the given order, with a price whose last trade is at most five days old. */
export function pickFreshQuote(quotes: readonly RawQuote[], nowMs: number): AdviceQuote | null {
  for (const quote of quotes) {
    if (!quote.price || quote.price <= 0 || !quote.quotedAt) continue;
    const ageMs = nowMs - new Date(quote.quotedAt).getTime();
    if (!(ageMs <= FRESH_QUOTE_DAYS * DAY_MS)) continue;
    const currency = (quote.currency ?? 'EUR').toUpperCase();
    const priceEur = currency === 'EUR' ? quote.price : quote.currentPriceEur;
    if (!priceEur || priceEur <= 0) continue;
    return { symbol: quote.symbol, price: quote.price, currency, priceEur, quotedAt: quote.quotedAt };
  }
  return null;
}

/** A ticker for an instrument with no symbol — its ISIN, else its name as a slug the ticker rule accepts. */
export function fallbackTicker(prefill: Pick<AssetPrefill, 'name' | 'isin'>): string {
  const isin = prefill.isin?.trim().toUpperCase();
  if (isin) return isin;
  const slug = prefill.name.normalize('NFD').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toUpperCase().slice(0, 20);
  return slug || 'STRUMENTO';
}

export type NewInstrumentPricing =
  | { kind: 'priced'; quote: AdviceQuote }
  | { kind: 'unpriced'; reason: 'no-symbol' | 'no-fresh-quote' }
  /**
   * A government bond with an ISIN (owner, 2026-11-20): Borsa Italiana's quote at the click, % of par (null = none),
   * on 1 € of nominal; a BTP€i (`indexed`) also needs the indexation coefficient the page asks.
   */
  | { kind: 'bond'; pricePct: number | null; indexed: boolean; coefficient?: number };

/** A BTP€i by its name: its Borsa Italiana quote is a REAL price, times the coefficient (never a BTP Italia). */
export function isEuroIndexedBondName(name: string): boolean {
  return /BTP\s*€\s*i\b|BTP\s*ei\b/i.test(name);
}


/** The form data of an instrument the plan creates: 0 quotes, `createdEmpty`, priced or not. */
export function newInstrumentFormData(instrument: OperatingPlanInstrument, pricing: NewInstrumentPricing): AssetFormData {
  const prefill = instrument.prefill!;
  const priced = pricing.kind === 'priced' ? pricing.quote : null;
  const bondPrice = pricing.kind === 'bond' ? bondUnitPriceEur(pricing) : null;
  return {
    name: prefill.name,
    ticker: priced ? priced.symbol : fallbackTicker(prefill),
    isin: prefill.isin,
    type: prefill.type,
    assetClass: prefill.assetClass,
    subCategory: prefill.subCategory || undefined,
    // An unpriced instrument is created in euro whatever its listing: its form completes it with its ticker.
    currency: priced ? priced.currency : 'EUR',
    quantity: 0,
    createdEmpty: true,
    currentPrice: priced ? priced.price : (bondPrice ?? 0),
    currentPriceEur: priced && priced.currency !== 'EUR' ? priced.priceEur : undefined,
    // A symbol with a fresh price, or a government bond with its ISIN (owner, 2026-11-19): Borsa Italiana prices it.
    autoUpdatePrice: priced !== null || pricing.kind === 'bond',
    // The asset form's create defaults.
    isLiquid: true,
    allocationRole: 'tradable',
    stampDutyExempt: false,
  };
}

/**
 * The pricing of a `new` instrument: a bond with an ISIN on Borsa Italiana's quote (`bond`, read at the click, with
 * the coefficient the page asks for a BTP€i), else the first fresh quote of its symbols.
 */
export function resolveNewInstrumentPricing(
  instrument: OperatingPlanInstrument,
  quotes: readonly RawQuote[],
  nowMs: number,
  bond: { pricePct: number | null; coefficient?: number } = { pricePct: null },
): NewInstrumentPricing {
  const prefill = instrument.prefill!;
  if (prefill.type === 'bond' && prefill.isin?.trim()) {
    const indexed = isEuroIndexedBondName(prefill.name);
    return {
      kind: 'bond',
      pricePct: bond.pricePct !== null && bond.pricePct > 0 ? bond.pricePct : null,
      indexed,
      ...(indexed && bond.coefficient && bond.coefficient > 0 ? { coefficient: bond.coefficient } : {}),
    };
  }
  if (!instrument.symbols?.length) return { kind: 'unpriced', reason: 'no-symbol' };
  const quote = pickFreshQuote(quotes, nowMs);
  return quote ? { kind: 'priced', quote } : { kind: 'unpriced', reason: 'no-fresh-quote' };
}

// ─── The builder ─────────────────────────────────────────────────────────────

export interface AdvicePlanInput {
  /** `operatingPlanOf(document)`. */
  plan: OperatingPlan;
  /**
   * The portfolio as the click leaves it: the live assets with the role changes «I ruoli» would write
   * already applied, when that tick is on.
   */
  assets: Asset[];
  keepNames: readonly string[];
  limits: IdealAllocationSettings['instrumentLimits'];
  /** The targets the plan goes toward. */
  targets: AssetAllocationTarget;
  sourceAssetId: string;
  /** `selectOpenPlan(plans) ?? null`. */
  openPlan: AccumulationPlan | null;
  /** By the `ref` of each `new` instrument. */
  pricing: Record<string, NewInstrumentPricing>;
  /** The Consulente's route has no band control: `DEFAULT_REBALANCE_BAND`. */
  band: RebalanceBand;
  compare: AllocationCompare;
  deps: PlanDeps;
  today: Date;
  generateId?: () => string;
  /** Tests only: replaces `reconcileOperatingPlan`. */
  reconcile?: typeof reconcileOperatingPlan;
}

export interface AdvicePlanToCreate { ref: string; formData: AssetFormData; pricing: NewInstrumentPricing }

export interface AdvicePlanBuild {
  action: 'create' | 'replace' | 'revise';
  /** The plan after today's reconcile. */
  reconciled: OperatingPlan;
  /** The stored corrections and today's, in order, without repeats, capped. */
  notes: string[];
  toCreate: AdvicePlanToCreate[];
  /** The draft with `new:<ref>` in place of the ids not yet created. */
  draft: AccumulationPlanDraft;
  /** The first revised instalment of an active plan (`action: 'revise'`), else 1. */
  firstIndex: number;
  /** The engine's preview on the draft, the missing instruments as assets at 0 quotes with their price. */
  preview: ReturnType<typeof buildDraftPreview>;
  issues: DraftIssue[];
  /** Why the plan cannot be created today, as one sentence; null = the tick can be on. */
  blocked: string | null;
}

/**
 * The plan's weights from the operating plan's quotas (owner, 2026-11-20). A quota is the share of the
 * plan's MONEY an instrument receives; the engine reads a weight as the share of the plan's portfolio
 * at the end and splits the money by what each position lacks (`computeTotalPurchases`). So each priced
 * instrument to buy weighs what it holds today plus its share of the money `L`, over today's value plus
 * `L` — what it lacks is then exactly its share; one to hold (or partly sold) weighs what it holds, and
 * lacks nothing. An instrument to buy with no price keeps the weight it would reach (its share of `L`),
 * so the plan buys it once it has a price; that weight comes from the ones to hold, which only end above
 * their weight and still lack nothing. Two decimals, Σ 100.
 * The priced quotas are taken over their own sum: the money an unpriced one cannot spend goes to them.
 */
export function weightsFromQuotas(
  rows: ReadonlyArray<{ id: string; quota: number; currentValueEur: number; unpriced: boolean }>,
  L: number,
): Record<string, number> {
  const base = rows.reduce((sum, row) => sum + row.currentValueEur, 0) + L;
  const pricedQuota = rows.filter((row) => row.quota > 0 && !row.unpriced).reduce((sum, row) => sum + row.quota, 0);
  const asGiven = Object.fromEntries(rows.map((row) => [row.id, row.quota]));
  if (!(L > 0) || !(base > 0) || !(pricedQuota > 0)) return asGiven;

  const raw: Record<string, number> = {};
  for (const row of rows) {
    const value = Math.max(0, row.currentValueEur);
    if (row.quota > 0 && !row.unpriced) raw[row.id] = ((value + (row.quota / pricedQuota) * L) / base) * 100;
    else if (row.quota > 0) raw[row.id] = ((row.quota / 100) * L / base) * 100;
    else raw[row.id] = (value / base) * 100;
  }
  // The unpriced weights come out of the ones to hold first, then out of the priced ones to buy: a hold
  // left at 0 % takes no share of what the engine spreads by weight once the priced ones lack less than L.
  const unpricedIds = rows.filter((row) => row.quota > 0 && row.unpriced).map((row) => row.id);
  let extra = unpricedIds.reduce((sum, id) => sum + raw[id], 0);
  const take = (ids: string[]) => {
    const sum = ids.reduce((total, id) => total + raw[id], 0);
    if (!(extra > 0) || !(sum > 0)) return;
    const taken = Math.min(extra, sum);
    for (const id of ids) raw[id] *= (sum - taken) / sum;
    extra -= taken;
  };
  take(rows.filter((row) => !(row.quota > 0)).map((row) => row.id));
  take(rows.filter((row) => row.quota > 0 && !row.unpriced).map((row) => row.id));

  // Two decimals: the ones that buy nothing rounded DOWN (never lacking a cent), the largest priced one to
  // buy takes the residue (it lacks a hair more, which the engine still gives the buying ones).
  const buyers = rows.filter((row) => row.quota > 0 && !row.unpriced);
  const weights: Record<string, number> = {};
  for (const row of rows) weights[row.id] = (buyers.includes(row) ? Math.round : Math.floor)(raw[row.id] * 100 + 1e-9) / 100;
  const residue = Math.round((100 - Object.values(weights).reduce((sum, weight) => sum + weight, 0)) * 100) / 100;
  if (residue !== 0) {
    const largest = buyers.reduce((best, row) => (weights[row.id] > weights[best.id] ? row : best), buyers[0]);
    weights[largest.id] = Math.max(0, Math.round((weights[largest.id] + residue) * 100) / 100);
  }
  return weights;
}

/** The draft's id for an instrument not created yet. */
export function newInstrumentId(ref: string): string {
  return `new:${ref}`;
}

function capNotes(notes: readonly string[]): string[] {
  return [...new Set(notes)]
    .slice(0, NOTES_MAX)
    .map((note) => (note.length > NOTE_MAX_CHARS ? `${note.slice(0, NOTE_MAX_CHARS - 1)}…` : note));
}

/** A `new` instrument as the engine reads it before it exists: 0 quotes, the price the page found. */
function syntheticAsset(ref: string, formData: AssetFormData, today: Date): Asset {
  return {
    id: newInstrumentId(ref),
    userId: '',
    ticker: formData.ticker,
    name: formData.name,
    type: formData.type,
    assetClass: formData.assetClass,
    ...(formData.subCategory ? { subCategory: formData.subCategory } : {}),
    currency: formData.currency,
    quantity: 0,
    currentPrice: formData.currentPrice,
    ...(formData.currentPriceEur !== undefined ? { currentPriceEur: formData.currentPriceEur } : {}),
    createdEmpty: true,
    allocationRole: 'tradable',
    isLiquid: true,
    lastPriceUpdate: today,
    createdAt: today,
    updatedAt: today,
  };
}

function rawOf(plan: OperatingPlan): RawOperatingPlan {
  return {
    summary: plan.summary,
    monthlyInflowEur: plan.monthlyInflowEur,
    months: plan.months,
    rows: plan.rows.map((row) => ({
      ref: row.ref,
      action: row.action,
      targetPercentage: row.targetPercentage,
      ...(row.sellQuantity !== undefined ? { sellQuantity: row.sellQuantity } : {}),
      ...(row.sellMonth !== undefined ? { sellMonth: row.sellMonth } : {}),
      ...(row.reinvestInto !== undefined ? { reinvestInto: row.reinvestInto } : {}),
      reason: row.reason,
    })),
    ...(plan.reviewMonth !== undefined ? { reviewMonth: plan.reviewMonth } : {}),
    reviewReason: plan.reviewReason,
    departures: plan.departures,
  };
}

/**
 * The plan of accumulation of the operating plan, on today's portfolio. `action` is `revise` for an
 * active open plan (from its first intact instalment), `replace` for an open draft, `create` otherwise.
 */
export function buildAdvicePlan(input: AdvicePlanInput): AdvicePlanBuild {
  const { plan, assets, targets, sourceAssetId, openPlan, band, compare, deps, today } = input;
  const generateId = input.generateId ?? (() => crypto.randomUUID());
  const action: AdvicePlanBuild['action'] = openPlan?.status === 'active' ? 'revise' : openPlan?.status === 'draft' ? 'replace' : 'create';
  const nextMonth = addMonths(toMonthKey(today), 1);

  if (action === 'revise' && openPlan && !findFirstIntactInstallment(openPlan)) {
    const draft: AccumulationPlanDraft = {
      name: openPlan.name,
      startMonth: nextMonth,
      months: 1,
      liquidity: { sourceCashAssetIds: [sourceAssetId], reserveEur: 0, monthlyInflowEur: 0 },
      positions: [],
      disposals: [],
    };
    return {
      action,
      reconciled: plan,
      notes: [],
      toCreate: [],
      draft,
      firstIndex: 1,
      preview: buildDraftPreview({ draft, allAssets: assets, targets, band, compare, deps }),
      issues: [],
      blocked: ACCUMULO_PLAN_NOTHING_TO_REVISE,
    };
  }

  // 1. Today's facts.
  const facts = refreshOperatingPlanFacts({
    instruments: plan.instruments,
    assets,
    keepNames: input.keepNames,
    limits: input.limits,
    valueOf: deps.valueOf,
    priceOf: deps.priceOf,
  });
  const byRef = new Map(facts.instruments.map((instrument) => [instrument.ref, instrument]));

  // 2. A sale the active plan already made is not made again: its row becomes a hold at 0, said.
  const raw = rawOf(plan);
  const alreadySold: string[] = [];
  if (action === 'revise' && openPlan) {
    const closedSales = new Set(openPlan.disposals.filter((disposal) => !isOpenSavedDisposal(disposal)).map((disposal) => disposal.assetId));
    raw.rows = raw.rows.map((row) => {
      const instrument = byRef.get(row.ref);
      if (row.action !== 'sell' || !instrument?.assetId || !closedSales.has(instrument.assetId)) return row;
      alreadySold.push(ADVICE_PLAN_COPY.alreadySold(instrument.name));
      return { ref: row.ref, action: 'hold', targetPercentage: 0, reason: row.reason };
    });
  }
  const reconciled = (input.reconcile ?? reconcileOperatingPlan)(raw, facts);
  const reconciledByRef = new Map(reconciled.instruments.map((instrument) => [instrument.ref, instrument]));

  // The month frame: a new plan from next month, a revision in the active plan's numbering from `k`.
  const first = action === 'revise' && openPlan ? findFirstIntactInstallment(openPlan)! : null;
  const firstIndex = first ? first.index : 1;
  const shift = firstIndex - 1;
  const months = first ? Math.min(reconciled.months, MAX_PLAN_MONTHS - shift) : reconciled.months;
  const lastIndex = shift + months;
  const monthsNote = first && months < reconciled.months ? [ADVICE_PLAN_COPY.monthsCapped(shift, months)] : [];
  const swapNotes: string[] = [];
  const inFrame = (month: number) => Math.min(lastIndex, month + shift);

  // 3. The instruments to create.
  const toCreate: AdvicePlanToCreate[] = [];
  const idOf = (ref: string): string | null => {
    const instrument = reconciledByRef.get(ref);
    if (!instrument) return null;
    return instrument.kind === 'new' ? newInstrumentId(ref) : (instrument.assetId ?? null);
  };
  for (const row of reconciled.rows) {
    const instrument = reconciledByRef.get(row.ref);
    if (instrument?.kind !== 'new' || row.action !== 'buy') continue;
    const pricing = input.pricing[row.ref] ?? { kind: 'unpriced', reason: 'no-symbol' };
    toCreate.push({ ref: row.ref, formData: newInstrumentFormData(instrument, pricing), pricing });
  }

  const allAssets = [...assets, ...toCreate.map((item) => syntheticAsset(item.ref, item.formData, today))];
  const assetsById = new Map(allAssets.map((asset) => [asset.id, asset]));

  // 4. The positions: every row but a money-market fund's and a sale of every share.
  const positions: PlanPosition[] = [];
  // 5. The sales.
  const disposals: PlanDisposal[] = [];
  for (const row of reconciled.rows) {
    const instrument = reconciledByRef.get(row.ref);
    const id = idOf(row.ref);
    if (!instrument || !id) continue;
    const sellsEveryShare = row.action === 'sell' && row.sellQuantity === undefined;
    if (instrument.kind !== 'cashFund' && !sellsEveryShare) {
      positions.push({ id: generateId(), label: instrument.name, targetPercentage: row.targetPercentage, memberAssetIds: [id], buyAssetId: id });
    }
    if (row.action === 'sell') {
      const sale = { assetId: id, ...(row.sellQuantity !== undefined ? { quantity: row.sellQuantity } : {}), estimatedProceedsEur: 0, status: 'planned' as const };
      disposals.push({
        assetId: id,
        ...(row.sellQuantity !== undefined ? { quantity: row.sellQuantity } : {}),
        monthIndex: inFrame(row.sellMonth ?? 1),
        estimatedProceedsEur: proceedsOfDisposal(sale, assetsById.get(id), deps),
        status: 'planned',
        ...(row.reinvestInto && idOf(row.reinvestInto) ? { reinvestAssetId: idOf(row.reinvestInto)! } : {}),
      });
      // The swap (owner, 2026-11-20) needs a price to buy whole units: without one the sale joins the pool, said.
      const swapped = disposals[disposals.length - 1];
      if (swapped.reinvestAssetId && !swapTargetOf(swapped, assetsById, deps)) {
        swapNotes.push(ADVICE_PLAN_COPY.swapUnpriced(instrument.name, reconciledByRef.get(row.reinvestInto!)?.name ?? ''));
      }
    }
  }
  const notes = capNotes([...plan.corrections, ...alreadySold, ...reconciled.corrections, ...monthsNote, ...swapNotes]);

  // 6. The liquidity: the reserve is the targets' cash quota left on the chosen account.
  const reserveEur = resolvePlanReserve(assets, targets, compare, deps, planCashFundSaleEur(disposals, assetsById, assets), [sourceAssetId]).reserveEur;

  // 7. The draft.
  const reviewMonthIndex = reconciled.reviewMonth !== undefined ? inFrame(reconciled.reviewMonth) : undefined;
  const draft: AccumulationPlanDraft = {
    name: first && openPlan ? openPlan.name : ADVICE_PLAN_NAME,
    startMonth: first ? first.month : nextMonth,
    months,
    liquidity: { sourceCashAssetIds: [sourceAssetId], reserveEur, monthlyInflowEur: reconciled.monthlyInflowEur },
    positions,
    disposals,
    ...(reviewMonthIndex !== undefined ? { reviewMonthIndex } : {}),
    ...(notes.length > 0 ? { advisorNotes: notes } : {}),
  };

  // 8. The weights: the quotas as shares of the money `L`, which the liquidity alone decides (weightsFromQuotas).
  const quotas = new Map(positions.map((position) => [position.id, position.targetPercentage]));
  const L = buildDraftPreview({ draft, allAssets, targets, band, compare, deps, firstIndex }).liquidity.L;
  const states = resolvePositionStates(positions, assetsById, deps, disposals);
  const weights = weightsFromQuotas(
    states.map((state) => ({ id: state.positionId, quota: quotas.get(state.positionId) ?? 0, currentValueEur: state.currentValueEur, unpriced: state.unpriced })),
    L,
  );
  draft.positions = positions.map((position) => ({ ...position, targetPercentage: weights[position.id] ?? position.targetPercentage }));

  // 9. The gate and the preview. The issues are empty by construction; a non-empty list is a guard.
  const issues = validateDraftAgainstAssets(draft, assetsById, firstIndex);
  const preview = buildDraftPreview({ draft, allAssets, targets, band, compare, deps, firstIndex });
  const unpriced = new Set(preview.unpricedPositionIds);
  const buying = positions.filter((position) => (quotas.get(position.id) ?? 0) > 0);
  const blocked = !reconciled.usable
    ? (reconciled.corrections.at(-1) ?? ADVICE_PLAN_COPY.nothingPriced)
    : issues.length > 0
      ? issues[0].message
      : preview.liquidity.L <= 0
        ? ADVICE_PLAN_COPY.nothingToInvest
        : buying.every((position) => unpriced.has(position.id))
          ? ADVICE_PLAN_COPY.nothingPriced
          : null;

  return { action, reconciled, notes, toCreate, draft, firstIndex, preview, issues, blocked };
}
