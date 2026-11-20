/**
 * The Consulente's instruments against the assets (owner, 2026-11-12): what the operating plan's
 * facts read (`buildOperatingPlanFacts`, lib/utils/operatingPlanFacts.ts) to name each instrument
 * of the report. Pure.
 *
 * `planConsulenteHandoff` reads each sub-target's instrument against the assets: by the review's
 * name («name», «name (TICKER)», «name (ISIN)», an ISIN alone) or through its sleeve's
 * candidates. What a plan can buy now is `matched`, what to create prefilled is `toCreate`, a
 * sub-target with no instrument is `unnamed`, an asset a plan cannot buy (a loan, an account, a
 * money-market fund) is `notBuyable`. Cash and real estate are never searched.
 *
 * Until 2026-11-20 the module also seeded the editor's plan through the optimizer, behind a link of
 * «Applica»; the click of «Applica» now creates the plan from the operating plan
 * (lib/utils/advicePlan.ts), and the seed is gone with the link.
 */
import type { Asset, AssetClass, AssetPrefill } from '@/types/assets';
import type { AllocationAdviceProposal, InstrumentCandidates } from '@/lib/utils/allocationAdviceProposal';
import { findAssetByName } from './allocationAdviceApply';
import { isPlanBuyable } from './accumulationPlanUtils';
import { ASSET_CLASS_LABELS } from './allocationUtils';

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
  // «(IT…, da comprare sul MOT)»: the ISIN first, a note after it (owner, 2026-11-20).
  const first = printed?.[2].split(',')[0].trim().toUpperCase() ?? '';
  if (printed && ISIN.test(first)) {
    return { head: printed[1].trim(), isin: first };
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
    // A sub-target may name several instruments, «A (IT…) + B (IT…)» or «A; B» (owner, 2026-11-20): each is its own.
    const parts = (subs as Array<{ name: string; instrument?: string }>).flatMap((sub): Array<{ name: string; instrument?: string }> => {
      const named = (sub.instrument ?? '').split(/\s+\+\s+|;\s*/).map((part) => part.trim()).filter((part) => part !== '');
      return named.length > 1 ? named.map((instrument) => ({ ...sub, instrument })) : [sub];
    });
    for (const sub of parts) {
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
