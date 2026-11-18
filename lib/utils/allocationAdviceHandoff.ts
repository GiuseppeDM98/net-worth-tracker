/**
 * The Consulente's hand-off to a plan of accumulation (owner, 2026-11-12): after «Applica» the
 * report's instruments become a plan's positions, computed by the code and confirmed by the owner
 * in the plan's editor. Pure; imported only by `ConsulenteHandoff`, under the lazy Accumulo tab —
 * the Consulente's route never loads it (it pulls the optimizer).
 *
 * Two steps:
 *   1. `planConsulenteHandoff` reads each sub-target's instrument against the assets: by the
 *      review's name («name», «name (TICKER)», «name (ISIN)», an ISIN alone) or through its
 *      sleeve's candidates. What a plan can buy now is `matched`, what to create prefilled is
 *      `toCreate`, a sub-target with no instrument is `unnamed`, an asset a plan cannot buy (a loan,
 *      an account, a money-market fund) is `notBuyable`. Cash and real estate are never searched.
 *   2. `buildHandoffSeed` runs the optimizer in mode 'ideal' on the proposal's targets, with no new
 *      money, over the whole portfolio: every tradable instrument held is a candidate, named by the
 *      Consulente or not (owner, 2026-11-12) — the reading names the others. No disposal is seeded:
 *      a sale is the owner's toggle in the editor.
 */
import type { Asset, AssetAllocationTarget, AssetClass, AssetPrefill, IdealAllocationSettings } from '@/types/assets';
import type { PlanDisposal, PlanSeedDraft } from '@/types/accumulationPlan';
import type { AllocationAdviceProposal, InstrumentCandidates } from '@/lib/utils/allocationAdviceProposal';
import { LIQUIDITY_CANDIDATE_KEY } from '@/lib/constants/idealAllocation';
import { buildTargetsFromProposal, findAssetByName } from './allocationAdviceApply';
import { isPlanBuyable, weightsToSeedPositions } from './accumulationPlanUtils';
import { ASSET_CLASS_LABELS, ASSET_CLASS_SEQUENCE, NO_SUBCATEGORY_LABEL } from './allocationUtils';
import { buildStandaloneCandidates, roundWeights, runOptimizer } from './weightOptimizer';
import { toModelWeights } from './modelPortfolio';

const ISIN = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;
const norm = (text: string) => text.trim().toLowerCase().replace(/\s+/g, ' ');

export interface HandoffRow { assetClass: AssetClass; subTarget: string }
export interface ConsulenteHandoffPlan {
  matched: Array<HandoffRow & { assetId: string; name: string; held: boolean }>;
  toCreate: Array<HandoffRow & { name: string; prefill: AssetPrefill }>;
  unnamed: HandoffRow[];
  notBuyable: Array<HandoffRow & { assetId: string; name: string }>;
  /** The instruments the Consulente keeps: the matched ones and the answers' «da tenere» found. */
  keepAssetIds: string[];
}

/** «Nome (IE00…)», an ISIN alone, or a plain name. */
function splitNamed(text: string): { head: string; isin?: string } {
  const printed = /^(.*)\s\(([^()]+)\)$/.exec(text.trim());
  if (printed && ISIN.test(printed[2].trim().toUpperCase())) {
    return { head: printed[1].trim(), isin: printed[2].trim().toUpperCase() };
  }
  return ISIN.test(text.trim().toUpperCase()) ? { head: '', isin: text.trim().toUpperCase() } : { head: text.trim() };
}

function findAssetByIsin(assets: readonly Asset[], isin: string | undefined): Asset | null {
  if (!isin) return null;
  const wanted = isin.trim().toUpperCase();
  return assets.find((asset) => (asset.isin ?? '').trim().toUpperCase() === wanted) ?? null;
}

/** The Consulente's instruments against the assets: what a plan can buy now, what to create, what is missing. */
export function planConsulenteHandoff(proposal: AllocationAdviceProposal, candidates: InstrumentCandidates | null,
  keepAssets: readonly string[], assets: readonly Asset[]): ConsulenteHandoffPlan {
  const out: ConsulenteHandoffPlan = { matched: [], toCreate: [], unnamed: [], notBuyable: [], keepAssetIds: [] };
  for (const cls of proposal.classes) {
    if (cls.assetClass === 'cash' || cls.assetClass === 'realestate') continue;
    const sleeves = (candidates?.sleeves ?? []).filter((sleeve) => sleeve.assetClass === cls.assetClass);
    // A class without sub-targets was searched under the class's label (the instruments' prompt).
    const subs = cls.subTargets.length > 0 ? cls.subTargets
      : [{ name: ASSET_CLASS_LABELS[cls.assetClass] ?? cls.assetClass, instrument: undefined }];
    for (const sub of subs) {
      const row: HandoffRow = { assetClass: cls.assetClass, subTarget: sub.name };
      const sleeve = cls.subTargets.length > 0 ? sleeves.find((s) => norm(s.subTarget) === norm(sub.name)) : sleeves[0];
      const named = splitNamed(sub.instrument ?? '');
      const list = sleeve?.candidates ?? [];
      const namesOne = named.head !== '' || !!named.isin;
      // The candidate the sub-target names; only when it names none, the held one, else the first:
      // the review is the Consulente's last word, never overruled by the search's order.
      const candidate = list.find((c) => !!named.isin && (c.isin ?? '').toUpperCase() === named.isin)
        ?? list.find((c) => named.head !== '' && norm(c.name) === norm(named.head))
        ?? (namesOne ? null : list.find((c) => c.alreadyHeld) ?? list[0] ?? null);
      const asset = (sub.instrument ? findAssetByName(assets, sub.instrument) : null)
        ?? findAssetByIsin(assets, named.isin) ?? (named.head ? findAssetByName(assets, named.head) : null)
        ?? (candidate ? findAssetByIsin(assets, candidate.isin) ?? findAssetByName(assets, candidate.name)
          ?? (candidate.ticker ? findAssetByName(assets, candidate.ticker) : null) : null);
      if (asset) {
        if (!isPlanBuyable(asset, assets)) out.notBuyable.push({ ...row, assetId: asset.id, name: asset.name });
        else if (!out.matched.some((m) => m.assetId === asset.id)) {
          out.matched.push({ ...row, assetId: asset.id, name: asset.name, held: asset.quantity > 0 });
        }
        continue;
      }
      const name = candidate?.name ?? named.head;
      if (!name) { out.unnamed.push(row); continue; }
      if (out.toCreate.some((c) => norm(c.name) === norm(name))) continue;
      const ticker = candidate?.ticker ?? '';
      const isin = candidate ? candidate.isin : named.isin; // one source: never a name with another's ISIN
      // A government or euro bond is quoted by Borsa Italiana through its ISIN: no ticker needed.
      const type = cls.assetClass === 'crypto' ? 'crypto'
        : cls.assetClass === 'bonds' && !ticker && /^(IT|XS)/.test(isin ?? '') ? 'bond' : 'etf';
      out.toCreate.push({ ...row, name, prefill: { name, ticker, isin, type,
        assetClass: cls.assetClass, subCategory: cls.subTargets.length > 0 ? sub.name : '' } });
    }
  }
  const kept = keepAssets.map((name) => findAssetByName(assets, name)).filter((a): a is Asset => a !== null);
  out.keepAssetIds = [...new Set([...out.matched.map((m) => m.assetId), ...kept.map((a) => a.id)])];
  return out;
}

/**
 * Classes with sub-targets the owner did not list as factor objectives get one, at 'high'
 * (2026-11-12): without it the split inside a class follows today's weights, and an instrument at
 * 0 quotes stays near 0. A class whose instruments carry a sub-category the targets do not list
 * (`unmapped`) gets none: the objective would push those instruments toward 0.
 */
export function handoffCriteria(base: IdealAllocationSettings, targets: AssetAllocationTarget,
  unmapped: readonly AssetClass[]): IdealAllocationSettings {
  const listed = new Set(base.factorObjectives.map((objective) => objective.assetClass));
  const added = ASSET_CLASS_SEQUENCE.filter((c) => {
    const target = targets[c];
    return !!target?.subCategoryConfig?.enabled && Object.keys(target.subTargets ?? {}).length > 0
      && !listed.has(c) && !unmapped.includes(c);
  }).map((assetClass) => ({ assetClass, priority: 'high' as const }));
  return { ...base, factorObjectives: [...base.factorObjectives, ...added] };
}

export type HandoffSeedOutcome =
  | { kind: 'computed'; seed: PlanSeedDraft; unmappedClasses: AssetClass[];
      /** Classes of a matched instrument the optimizer left at 0 % (owner, 2026-11-12). */ zeroClasses: AssetClass[];
      /** Held instruments the Consulente did not name, rows at 0 %, by label (owner, 2026-11-12 and 2026-11-18). */ extraNames: string[] }
  | { kind: 'manual'; seed: PlanSeedDraft; reason: 'negative_fixed' | 'infeasible_bounds' | 'no_candidates';
      negativeFixedLabels: string[] };

/** The plan's seed toward the proposal: the optimizer's weights, or the matched instruments at 0 % and why. */
export function buildHandoffSeed(input: { proposal: AllocationAdviceProposal; assets: Asset[];
  matchedAssetIds: readonly string[]; criteria: IdealAllocationSettings; targetLeverageRatio: number;
  valueOf: (asset: Asset) => number; now: Date; generateId?: () => string }): HandoffSeedOutcome {
  const targets = buildTargetsFromProposal(input.proposal);
  const standalone = buildStandaloneCandidates(input.assets, input.valueOf, 0, new Set(input.matchedAssetIds));
  const labelOf = (key: string) => standalone.positions.find((p) => p.key === key)?.label ?? key;
  const manual = (reason: 'negative_fixed' | 'infeasible_bounds' | 'no_candidates', labels: string[] = []) => ({
    kind: 'manual' as const, reason, negativeFixedLabels: labels, seed: { positions: weightsToSeedPositions(
      input.matchedAssetIds.map((id) => ({ key: id, label: labelOf(id), proposedPct: 0 })), input.generateId) } });
  if (standalone.negativeFixedKeys.length > 0) {
    return manual('negative_fixed', standalone.negativeFixedKeys.map(labelOf));
  }
  const unmappedClasses = ASSET_CLASS_SEQUENCE.filter((c) => {
    const listed = Object.keys(targets[c]?.subTargets ?? {});
    return listed.length > 0 && standalone.positions.some((p) => {
      const asset = standalone.assetsById.get(p.buyAssetId);
      return asset?.assetClass === c && asset.type !== 'realestate' && p.key !== LIQUIDITY_CANDIDATE_KEY
        && !listed.includes(asset.subCategory?.trim() || NO_SUBCATEGORY_LABEL);
    });
  });
  const criteria = handoffCriteria(input.criteria, targets, unmappedClasses);
  // A new instrument (no value yet) in a class WITHOUT sub-targets stays at 0 %: no rule invents a share
  // the targets do not state, and the owner gives it one in the editor (owner, 2026-11-12 and 2026-11-18 —
  // left free, the class objective handed it a share whenever the class was short).
  const startsAtZero = new Set(input.matchedAssetIds.filter((id) => {
    const asset = standalone.assetsById.get(id);
    return !!asset && !(input.valueOf(asset) > 0) && Object.keys(targets[asset.assetClass]?.subTargets ?? {}).length === 0;
  }));
  // A held instrument the Consulente did not name stays a row at 0 % once a named instrument that can take its
  // share is among the assets: in its sub-target (a class with sub-targets; a sub-category the targets do not
  // list yields to any named one of the class), anywhere in its class (a class without). Until then it holds
  // the place, so the share does not fall on the class's other instruments. The plan sells nothing
  // (owner, 2026-11-18 — before, the plan kept buying it).
  const matched = new Set(input.matchedAssetIds);
  const slotOf = (asset: Asset) => {
    const listed = Object.keys(targets[asset.assetClass]?.subTargets ?? {});
    const sub = asset.subCategory?.trim() ?? '';
    return listed.includes(sub) ? `${asset.assetClass}:${sub}` : asset.assetClass;
  };
  const filledSlots = new Set(input.matchedAssetIds.flatMap((id) => {
    const asset = standalone.assetsById.get(id);
    if (!asset || startsAtZero.has(id)) return [];
    const slot = slotOf(asset);
    return slot === asset.assetClass ? [slot] : [slot, asset.assetClass];
  }));
  const unnamedHeld = new Set(standalone.positions.map((p) => p.buyAssetId).filter((id) => {
    const asset = standalone.assetsById.get(id);
    return !!asset && !matched.has(id) && input.valueOf(asset) > 0 && isPlanBuyable(asset, input.assets)
      && filledSlots.has(slotOf(asset));
  }));
  const fixBounds: typeof standalone.fixBounds = (c) =>
    startsAtZero.has(c.buyAssetId) || unnamedHeld.has(c.buyAssetId) ? { lowerPct: 0, upperPct: 0 } : standalone.fixBounds(c);
  const result = runOptimizer({ positions: standalone.positions, assetsById: standalone.assetsById, settings: criteria,
    mode: 'ideal', baseEur: standalone.baseEur, valueOf: standalone.valueOf, targets,
    targetLeverageRatio: input.targetLeverageRatio, fixBounds });
  if (result.status !== 'ok') return manual(result.status);
  const fit = toModelWeights(result.weights.map((w) => {
    const members = standalone.positions.find((p) => p.key === w.key)?.memberAssetIds ?? [w.key];
    return { assetId: w.key, pct: w.proposedPct, ...(members.length > 1 ? { memberAssetIds: members } : {}) };
  }), standalone.assetsById);
  // A matched or held instrument at 0 % stays as a row at 0 %: the owner gives it a share (owner, 2026-11-12, 2026-11-18;
  // a held one left out made the editor refuse to activate — «ha un valore ma non è né in una posizione né in una vendita»).
  const isHeld = (id: string) => input.valueOf(standalone.assetsById.get(id)!) > 0;
  const buyable = fit.weights.filter((w) => (w.pct > 0 || matched.has(w.assetId) || isHeld(w.assetId))
    && isPlanBuyable(standalone.assetsById.get(w.assetId)!, input.assets));
  const total = buyable.reduce((sum, w) => sum + w.pct, 0);
  if (buyable.length === 0 || total <= 0) return manual('no_candidates');
  // What a plan cannot buy leaves; the rest back to Σ = 100 with the optimizer's own rounding (free bounds).
  const pcts = roundWeights(buyable.map((w) => w.pct / total), buyable.map(() => 0), buyable.map(() => 1));
  const positions = weightsToSeedPositions(buyable.map((w, i) => ({ key: w.assetId, label: labelOf(w.assetId),
    proposedPct: pcts[i], ...(w.memberAssetIds ? { memberAssetIds: w.memberAssetIds } : {}) })), input.generateId);
  const classOf = (id: string) => standalone.assetsById.get(id)!.assetClass;
  // Only a NEW instrument (no value yet) names the class: a held one at 0 % is the optimizer's answer, and
  // «lo strumento nuovo parte da 0%» would misread it (phase F, 2026-11-18).
  const isNew = (id: string) => !(input.valueOf(standalone.assetsById.get(id)!) > 0);
  const zeroClasses = ASSET_CLASS_SEQUENCE.filter((c) =>
    buyable.some((w, i) => pcts[i] === 0 && matched.has(w.assetId) && isNew(w.assetId) && classOf(w.assetId) === c));
  const extraNames = buyable.filter((w) => unnamedHeld.has(w.assetId)).map((w) => labelOf(w.assetId));
  return { kind: 'computed', unmappedClasses, zeroClasses, extraNames, seed: { positions, optimizerSnapshot: { computedAt: input.now,
    mode: 'ideal', settingsUsed: criteria, objectives: result.objectives, conflicts: result.conflicts,
    weights: result.weights.map((w) => ({ key: w.key, proposedPct: w.proposedPct })) } } };
}

/** Month-1 sales of an instrument the Consulente keeps (2026-11-12); an absent `monthIndex` is month 1. */
export function findKeptSales(disposals: readonly PlanDisposal[], keepAssetIds: readonly string[]): PlanDisposal[] {
  return disposals.filter((d) => (d.monthIndex ?? 1) === 1 && d.status !== 'executed'
    && keepAssetIds.includes(d.assetId));
}
