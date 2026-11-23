/**
 * The facts the operating plan is written and checked on (2026-11-19, doc/guide/consulente-piano.md):
 * every instrument a plan can address, with the KEY the «Piano» stage reads it by, and what the app
 * knows today of each held one. Pure; `valueOf` and `priceOf` are injected (the server passes
 * `calculateAssetValue` and `unitPriceEur`).
 *
 * A module of its own, apart from `operatingPlan.ts`: it pulls the hand-off's matcher and the
 * holdings' tax. On the Consulente's route only the builder of «Applica» reads it
 * (`refreshOperatingPlanFacts`, `findAdviceInstrument`, 2026-11-20), inside `ConsulentePlanTick`,
 * which is loaded on demand; no other component of the route may import it (a test reads their
 * sources) — the route's first load stays without it.
 */

import type { Asset, AssetPrefill, IdealAllocationSettings } from '@/types/assets';
import type { AllocationAdviceProposal, InstrumentCandidates } from '@/lib/utils/allocationAdviceProposal';
import type { OperatingPlanFacts, OperatingPlanInstrument } from '@/lib/utils/operatingPlan';
import { planConsulenteHandoff } from '@/lib/utils/allocationAdviceHandoff';
import { findAssetByName } from '@/lib/utils/allocationAdviceApply';
import { isPlanBuyable, isPlanCashFund } from '@/lib/utils/accumulationPlanUtils';
import { assetClassSequenceIndex, buildHoldings } from '@/lib/utils/allocationUtils';
import { candidateSaleTaxPerEuro } from '@/lib/utils/saleTax';

export interface OperatingPlanFactsInput {
  assets: Asset[];
  proposal: AllocationAdviceProposal;
  candidates: InstrumentCandidates | null;
  /** The answers' `keepAssets`: «DA TENERE» comes from these alone. */
  keepNames: readonly string[];
  limits: IdealAllocationSettings['instrumentLimits'];
  valueOf: (asset: Asset) => number;
  priceOf: (asset: Asset) => number;
}

const norm = (text: string) => text.trim().toLowerCase().replace(/\s+/g, ' ');

/** Class sequence, then name, then id: the same portfolio always gets the same keys. */
function byClassThenName(a: Asset, b: Asset): number {
  return assetClassSequenceIndex(a.assetClass) - assetClassSequenceIndex(b.assetClass) || a.name.localeCompare(b.name, 'it') || a.id.localeCompare(b.id);
}

/**
 * S — every asset a plan may buy with a value, created empty for a plan, or matched by the report
 * (an instrument sold down to 0 that the report chooses again is matched, never created); M — every
 * money-market fund with a value; N — what the hand-off would create, with the candidate's Yahoo
 * symbols. `keep` is true ONLY for what the answers' «da tenere» name: the hand-off's `keepAssetIds`
 * also holds every instrument the report matched, and the «da tenere» of the interview is what
 * forbids a sale (owner, 2026-11-19).
 */
export function buildOperatingPlanFacts(input: OperatingPlanFactsInput): OperatingPlanFacts {
  const { assets, proposal, candidates, keepNames, limits, valueOf, priceOf } = input;
  const handoff = planConsulenteHandoff(proposal, candidates, keepNames, assets);
  const matched = new Set(handoff.matched.map((row) => row.assetId));

  const heldAssets = assets
    .filter((asset) => isPlanBuyable(asset, assets) && (valueOf(asset) > 0 || asset.createdEmpty === true || matched.has(asset.id)))
    .sort(byClassThenName);
  const cashFunds = assets.filter((asset) => isPlanCashFund(asset, assets) && valueOf(asset) > 0).sort(byClassThenName);

  const legendOf = (asset: Asset, ref: string, kind: 'held' | 'cashFund'): OperatingPlanInstrument => ({
    ref,
    kind,
    name: asset.name,
    assetClass: asset.assetClass,
    ...(asset.subCategory?.trim() ? { subCategory: asset.subCategory.trim() } : {}),
    assetId: asset.id,
  });

  const allCandidates = (candidates?.sleeves ?? []).flatMap((sleeve) => sleeve.candidates);
  const newInstruments: OperatingPlanInstrument[] = handoff.toCreate.map((row, index) => {
    const isin = row.prefill.isin?.trim().toUpperCase();
    const candidate = allCandidates.find((c) => !!isin && (c.isin ?? '').trim().toUpperCase() === isin)
      ?? allCandidates.find((c) => norm(c.name) === norm(row.prefill.name));
    const symbols = candidate?.yahooSymbols && candidate.yahooSymbols.length > 0
      ? candidate.yahooSymbols
      : row.prefill.ticker ? [row.prefill.ticker] : [];
    return {
      ref: `N${index + 1}`,
      kind: 'new',
      name: row.prefill.name,
      assetClass: row.prefill.assetClass,
      ...(row.prefill.subCategory ? { subCategory: row.prefill.subCategory } : {}),
      prefill: row.prefill,
      symbols,
    };
  });

  const holdings = buildHoldings(assets, valueOf);
  const keptIds = new Set(keepNames.map((name) => findAssetByName(assets, name)?.id).filter((id): id is string => !!id));
  const held: OperatingPlanFacts['held'] = {};
  const factOf = (asset: Asset) => {
    const limit = limits.find((entry) => entry.assetId === asset.id);
    return {
      quantity: asset.quantity,
      priceEur: priceOf(asset),
      valueEur: valueOf(asset),
      keep: keptIds.has(asset.id),
      tax: candidateSaleTaxPerEuro(asset.id, holdings),
      ...(limit?.minPct !== undefined ? { minPct: limit.minPct } : {}),
      ...(limit?.maxPct !== undefined ? { maxPct: limit.maxPct } : {}),
    };
  };

  const instruments: OperatingPlanInstrument[] = [];
  heldAssets.forEach((asset, index) => {
    const ref = `S${index + 1}`;
    instruments.push(legendOf(asset, ref, 'held'));
    held[ref] = factOf(asset);
  });
  instruments.push(...newInstruments);
  cashFunds.forEach((asset, index) => {
    const ref = `M${index + 1}`;
    instruments.push(legendOf(asset, ref, 'cashFund'));
    held[ref] = factOf(asset);
  });
  return { instruments, held };
}

/**
 * The instrument a `new` row of the operating plan names, once it exists: by ISIN (case- and
 * space-insensitive), else by name through `findAssetByName` (name, ticker, display ticker — never
 * the ISIN). ONE matcher for the «Applica» page and the click that creates the instruments, so a
 * second press finds what a first one created (2026-11-20).
 */
export function findAdviceInstrument(assets: readonly Asset[], prefill: Pick<AssetPrefill, 'name' | 'isin'>): Asset | null {
  const isinOf = (value: string | undefined) => (value ?? '').replace(/\s+/g, '').toUpperCase();
  const wanted = isinOf(prefill.isin);
  if (wanted) {
    const byIsin = assets.find((asset) => isinOf(asset.isin) === wanted);
    if (byIsin) return byIsin;
  }
  return findAssetByName(assets, prefill.name);
}

export interface RefreshOperatingPlanFactsInput {
  /** The instruments the stored plan was written on. */
  instruments: OperatingPlanInstrument[];
  assets: Asset[];
  keepNames: readonly string[];
  limits: IdealAllocationSettings['instrumentLimits'];
  valueOf: (asset: Asset) => number;
  priceOf: (asset: Asset) => number;
}

/**
 * The stored plan's instruments on TODAY's portfolio, so the reconcile can run again at the click
 * (2026-11-20): a held or money-market instrument keeps its key while its asset is still there and
 * still buyable (or still a money-market fund) — else it is absent, and the reconcile drops its row
 * with its sentence; a `new` one that now exists keeps its key and becomes `held` on that asset (the
 * rows cite the key, every rule reads `kind`); a held buyable asset with a value no key names gets
 * the next free S key (the reconcile gives it a row at 0 %). Quantities, prices, taxes, limits and
 * «da tenere» are today's.
 */
export function refreshOperatingPlanFacts(input: RefreshOperatingPlanFactsInput): OperatingPlanFacts {
  const { assets, keepNames, limits, valueOf, priceOf } = input;
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const legendOf = (asset: Asset, ref: string, kind: 'held' | 'cashFund'): OperatingPlanInstrument => ({
    ref,
    kind,
    name: asset.name,
    assetClass: asset.assetClass,
    ...(asset.subCategory?.trim() ? { subCategory: asset.subCategory.trim() } : {}),
    assetId: asset.id,
  });

  const kept: OperatingPlanInstrument[] = [];
  for (const instrument of input.instruments) {
    if (instrument.kind === 'new') {
      const found = instrument.prefill ? findAdviceInstrument(assets, instrument.prefill) : null;
      if (!found) kept.push(instrument);
      else if (isPlanBuyable(found, assets)) kept.push(legendOf(found, instrument.ref, 'held'));
      continue;
    }
    const asset = instrument.assetId ? byId.get(instrument.assetId) : undefined;
    if (!asset) continue;
    if (isPlanBuyable(asset, assets)) kept.push(legendOf(asset, instrument.ref, 'held'));
    else if (isPlanCashFund(asset, assets)) kept.push(legendOf(asset, instrument.ref, 'cashFund'));
  }

  const named = new Set(kept.map((instrument) => instrument.assetId).filter((id): id is string => !!id));
  let nextS = Math.max(0, ...input.instruments.map((instrument) => Number(/^S(\d+)$/.exec(instrument.ref)?.[1] ?? 0))) + 1;
  const added = assets
    .filter((asset) => !named.has(asset.id) && isPlanBuyable(asset, assets) && valueOf(asset) > 0)
    .sort(byClassThenName)
    .map((asset) => legendOf(asset, `S${nextS++}`, 'held'));

  // The stored order (S, N, M) with today's new held keys after the stored held ones.
  const lastHeld = kept.reduce((last, instrument, index) => (/^S\d+$/.test(instrument.ref) ? index : last), -1);
  const instruments = [...kept.slice(0, lastHeld + 1), ...added, ...kept.slice(lastHeld + 1)];

  const holdings = buildHoldings(assets, valueOf);
  const keptIds = new Set(keepNames.map((name) => findAssetByName(assets, name)?.id).filter((id): id is string => !!id));
  const held: OperatingPlanFacts['held'] = {};
  for (const instrument of instruments) {
    const asset = instrument.assetId ? byId.get(instrument.assetId) : undefined;
    if (!asset || instrument.kind === 'new') continue;
    const limit = limits.find((entry) => entry.assetId === asset.id);
    held[instrument.ref] = {
      quantity: asset.quantity,
      priceEur: priceOf(asset),
      valueEur: valueOf(asset),
      keep: keptIds.has(asset.id),
      tax: candidateSaleTaxPerEuro(asset.id, holdings),
      ...(limit?.minPct !== undefined ? { minPct: limit.minPct } : {}),
      ...(limit?.maxPct !== undefined ? { maxPct: limit.maxPct } : {}),
    };
  }
  return { instruments, held };
}
