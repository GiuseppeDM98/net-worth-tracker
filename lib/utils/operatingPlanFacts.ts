/**
 * The facts the operating plan is written and checked on (2026-11-19, doc/guide/consulente-piano.md):
 * every instrument a plan can address, with the KEY the «Piano» stage reads it by, and what the app
 * knows today of each held one. Pure; `valueOf` and `priceOf` are injected (the server passes
 * `calculateAssetValue` and `unitPriceEur`).
 *
 * A module of its own, apart from `operatingPlan.ts`: it pulls the hand-off's matcher and the
 * holdings' tax, and no component of the Consulente's route may import it (a test reads their
 * sources) — the route's bundle stays without them.
 */

import type { Asset, IdealAllocationSettings } from '@/types/assets';
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
