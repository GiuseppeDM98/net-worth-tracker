/**
 * The Consulente's hand-off to a plan of accumulation (lib/utils/allocationAdviceHandoff.ts, owner
 * 2026-11-12): the report's instruments against the assets (what a plan can buy now, what to create
 * prefilled, what has no instrument, what a plan cannot buy), the seed the optimizer computes in
 * mode 'ideal' on the new targets, and the month-1 sales of an instrument the Consulente keeps.
 *
 * Mutations that turn it red, one per block: `findAssetByIsin` dropped from the chain, or the
 * `alreadyHeld` fallback restored when the sub-target names an instrument (planConsulenteHandoff);
 * the 0 % bound of a new instrument outside the sub-targets dropped (the seed); `handoffCriteria` returning `base` (a new
 * instrument inside a class with sub-targets); the computed seed returned regardless (the manual
 * outcomes); `d.monthIndex === 1` (findKeptSales).
 *
 * The spec named «the `isPlanBuyable` filter dropped» for the seed: it stays GREEN (2026-11-18) —
 * `toModelWeights` already drops the money-market fund, an account and «Liquidità», so the filter
 * is a guard (as «Crea un PAC»'s filters, doc/guide/ottimizzatore.md § Per-page blind spots); the
 * fund's absence from the positions is still asserted.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase/config', () => ({ db: {}, auth: { currentUser: null } }));
vi.mock('@/lib/utils/authFetch', () => ({ authenticatedFetch: vi.fn() }));
vi.mock('@/lib/services/dashboardOverviewInvalidation', () => ({ invalidateDashboardOverviewSummary: vi.fn() }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), getDoc: vi.fn(), setDoc: vi.fn(), deleteField: vi.fn() }));
import type { Asset } from '@/types/assets';
import type { AllocationAdviceProposal, InstrumentCandidates } from '@/lib/utils/allocationAdviceProposal';
import type { PlanDisposal } from '@/types/accumulationPlan';
import { DEFAULT_IDEAL_ALLOCATION } from '@/lib/constants/idealAllocation';
import { buildTargetsFromProposal } from '@/lib/utils/allocationAdviceApply';
import {
  buildHandoffSeed,
  findKeptSales,
  handoffCriteria,
  planConsulenteHandoff,
} from '@/lib/utils/allocationAdviceHandoff';
import { describeHandoffExtra, describeHandoffZero } from '@/lib/utils/accumulationNarrative';

function makeAsset(id: string, overrides: Partial<Asset> = {}): Asset {
  return {
    id,
    userId: 'u1',
    ticker: '',
    name: id,
    type: 'etf',
    assetClass: 'equity',
    currency: 'EUR',
    quantity: 1,
    currentPrice: 100,
    lastPriceUpdate: new Date(0),
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

/** Value = quantity × price; a loan counts negative, as the app values it. */
const valueOf = (asset: Asset) => (asset.type === 'loan' ? -1 : 1) * asset.quantity * asset.currentPrice;
const NOW = new Date('2026-11-12T12:00:00.000Z');
const ids = () => { let n = 0; return () => `pos-${++n}`; };

function proposal(classes: AllocationAdviceProposal['classes']): AllocationAdviceProposal {
  return { summary: 'S.', classes, assetRoles: [], goals: [], reviewByIso: '2028-01-01', reviewReason: '', risks: [] };
}
const cls = (assetClass: AllocationAdviceProposal['classes'][number]['assetClass'], targetPercentage: number,
  subTargets: AllocationAdviceProposal['classes'][number]['subTargets'] = []) => ({ assetClass, targetPercentage, rationale: '', subTargets });
const candidate = (name: string, extra: Record<string, unknown> = {}) => ({ name, exchange: 'Borsa Italiana', note: '', ...extra });

// ── planConsulenteHandoff ──────────────────────────────────────────────────────────────────
describe('planConsulenteHandoff', () => {
  const home = makeAsset('casa', { type: 'realestate', assetClass: 'realestate', currentPrice: 200000 });
  const loan = makeAsset('prestito', { name: 'Prestito fenicottero', type: 'loan', assetClass: 'realestate', financedAssetId: 'casa', currentPrice: 50000 });
  const ornitorinco = makeAsset('orni', { name: 'Ornitorinco World UCITS ETF', isin: 'IE00AAAAAAA1', quantity: 10 });
  const held = makeAsset('held', { name: 'Fondo già tenuto', isin: 'IE00CCCCCCC3', quantity: 5, assetClass: 'equity' });
  const kept = makeAsset('kept', { name: 'ETF da tenere', quantity: 2, assetClass: 'equity' });
  const account = makeAsset('conto', { name: 'Conto', type: 'cash', assetClass: 'cash', currentPrice: 3000 });
  const assets = [home, loan, ornitorinco, held, kept, account];

  it('matches by ISIN where the name differs, a sleeve\'s held candidate by ISIN, skips cash, names what has no instrument and what a plan cannot buy', () => {
    const p = proposal([
      cls('equity', 60, [
        { name: 'Mondo', targetPercentage: 50, instrument: 'ETF ornitorinco (IE00AAAAAAA1)' },
        { name: 'Qualità', targetPercentage: 30 },
        { name: 'Piccole', targetPercentage: 20 },
      ]),
      cls('realestate', 20, [{ name: 'Casa', targetPercentage: 100, instrument: 'Prestito fenicottero' }]),
      cls('cash', 20),
    ]);
    const candidates: InstrumentCandidates = { sleeves: [
      { assetClass: 'equity', subTarget: 'Qualità', candidates: [candidate('Altro nome', { isin: 'IE00ZZZZZZZ9' }), candidate('Nome diverso', { isin: 'IE00CCCCCCC3', alreadyHeld: true })] },
      { assetClass: 'cash', subTarget: 'Liquidità', candidates: [candidate('Conto')] },
    ] };
    const out = planConsulenteHandoff(p, candidates, ['ETF da tenere'], assets);
    expect(out.matched).toEqual([
      { assetClass: 'equity', subTarget: 'Mondo', assetId: 'orni', name: 'Ornitorinco World UCITS ETF', held: true },
      { assetClass: 'equity', subTarget: 'Qualità', assetId: 'held', name: 'Fondo già tenuto', held: true },
    ]);
    expect(out.unnamed).toEqual([{ assetClass: 'equity', subTarget: 'Piccole' }]);
    // The real-estate class is skipped whole: the loan never reaches the rows from there.
    expect(out.notBuyable).toEqual([]);
    expect(out.toCreate).toEqual([]);
    expect(out.keepAssetIds).toEqual(['orni', 'held', 'kept']);
  });

  it('a loan named in a class a plan buys is «Fuori dal piano», never a position', () => {
    const p = proposal([cls('bonds', 100, [{ name: 'Euro 1-3 anni', targetPercentage: 100, instrument: 'Prestito fenicottero' }])]);
    const out = planConsulenteHandoff(p, null, [], assets);
    expect(out.notBuyable).toEqual([{ assetClass: 'bonds', subTarget: 'Euro 1-3 anni', assetId: 'prestito', name: 'Prestito fenicottero' }]);
    expect(out.matched).toEqual([]);
  });

  it('«name (TICKER)» by ticker', () => {
    const byTicker = makeAsset('t', { name: 'ETF ornitorinco', ticker: 'ORNI.MI', quantity: 0 });
    const p = proposal([cls('equity', 100, [{ name: 'Mondo', targetPercentage: 100, instrument: 'ETF ornitorinco (ORNI)' }])]);
    expect(planConsulenteHandoff(p, null, [], [byTicker]).matched).toEqual([
      { assetClass: 'equity', subTarget: 'Mondo', assetId: 't', name: 'ETF ornitorinco', held: false },
    ]);
  });

  it('an instrument named by the review that is neither an asset nor a candidate is created from the review\'s own name and ISIN, never the held candidate', () => {
    const p = proposal([cls('equity', 100, [{ name: 'Qualità', targetPercentage: 100, instrument: 'ETF fenicottero (IE00BBBBBBB2)' }])]);
    const candidates: InstrumentCandidates = { sleeves: [
      { assetClass: 'equity', subTarget: 'Qualità', candidates: [candidate('Nome diverso', { isin: 'IE00CCCCCCC3', alreadyHeld: true })] },
    ] };
    const out = planConsulenteHandoff(p, candidates, [], assets);
    expect(out.matched).toEqual([]);
    expect(out.toCreate).toEqual([{
      assetClass: 'equity', subTarget: 'Qualità', name: 'ETF fenicottero',
      prefill: { name: 'ETF fenicottero', ticker: '', isin: 'IE00BBBBBBB2', type: 'etf', assetClass: 'equity', subCategory: 'Qualità' },
    }]);
  });

  it('a class without sub-targets reads its first sleeve; a bond named by ISIN with no ticker is a bond; a crypto is a crypto', () => {
    const p = proposal([
      cls('bonds', 50, [{ name: 'Euro', targetPercentage: 100, instrument: 'BTP ornitorinco (IT0000000001)' }]),
      cls('equity', 30),
      cls('crypto', 20, [{ name: 'Bitcoin', targetPercentage: 100 }]),
    ]);
    const candidates: InstrumentCandidates = { sleeves: [
      { assetClass: 'equity', subTarget: 'Azioni', candidates: [candidate('ETF ornitorinco globale', { isin: 'IE00DDDDDDD4', ticker: 'ORNG' })] },
      { assetClass: 'crypto', subTarget: 'Bitcoin', candidates: [candidate('ETC fenicottero', { ticker: 'FENI' })] },
    ] };
    const out = planConsulenteHandoff(p, candidates, [], []);
    expect(out.toCreate.map((row) => [row.subTarget, row.prefill])).toEqual([
      ['Euro', { name: 'BTP ornitorinco', ticker: '', isin: 'IT0000000001', type: 'bond', assetClass: 'bonds', subCategory: 'Euro' }],
      ['Azioni', { name: 'ETF ornitorinco globale', ticker: 'ORNG', isin: 'IE00DDDDDDD4', type: 'etf', assetClass: 'equity', subCategory: '' }],
      ['Bitcoin', { name: 'ETC fenicottero', ticker: 'FENI', isin: undefined, type: 'crypto', assetClass: 'crypto', subCategory: 'Bitcoin' }],
    ]);
  });
});

// ── buildHandoffSeed ───────────────────────────────────────────────────────────────────────
describe('buildHandoffSeed', () => {
  const etfA = makeAsset('A', { name: 'ETF A', assetClass: 'equity', quantity: 60 });           // 6.000
  const etfB = makeAsset('B', { name: 'ETF B', assetClass: 'bonds', quantity: 0 });             // 0 quotes
  const monetary = makeAsset('M', { name: 'Fondo monetario', assetClass: 'cash', quantity: 10 }); // 1.000
  const account = makeAsset('C', { name: 'Conto', type: 'cash', assetClass: 'cash', quantity: 1, currentPrice: 3000 });
  const base = { criteria: DEFAULT_IDEAL_ALLOCATION, targetLeverageRatio: 1, valueOf, now: NOW };

  it('seeds the buyable instruments only, Σ = 100, mode ideal, no sales; a new instrument in a class without sub-targets is a row at 0% (owner, 2026-11-12)', () => {
    const p = proposal([cls('equity', 60), cls('bonds', 30), cls('cash', 10)]);
    const outcome = buildHandoffSeed({ ...base, proposal: p, assets: [etfA, etfB, monetary, account], matchedAssetIds: ['A', 'B'], generateId: ids() });
    expect(outcome.kind).toBe('computed');
    if (outcome.kind !== 'computed') return;
    const positions = outcome.seed.positions;
    expect(positions.map((p) => p.buyAssetId).sort()).toEqual(['A', 'B']);
    expect(positions.reduce((sum, p) => sum + p.targetPercentage, 0)).toBeCloseTo(100, 6);
    expect(positions.find((p) => p.buyAssetId === 'B')?.targetPercentage).toBe(0);
    expect(outcome.seed.disposals).toBeUndefined();
    expect(outcome.seed.optimizerSnapshot?.mode).toBe('ideal');
    expect(outcome.zeroClasses).toEqual(['bonds']);
    expect(outcome.extraNames).toEqual([]);
    expect(describeHandoffZero(['Obbligazioni'])).toBe("Dentro Obbligazioni lo strumento nuovo parte da 0%: dagli tu una quota nell'editor.");
  });

  // Mutation: `zeroClasses` counts every matched row at 0 %, held or new → red (phase F, 2026-11-18: the
  // sentence named «lo strumento nuovo» in three classes whose zeros were instruments already held).
  it('a HELD instrument the optimizer leaves at 0 % is a row at 0 %, but not «lo strumento nuovo»', () => {
    // ETF G held in equity, capped at 0 % by the owner's criteria: the optimizer leaves it at 0.
    const etfG = makeAsset('G', { name: 'ETF G', assetClass: 'equity', quantity: 10 }); // 1.000
    const p = proposal([cls('equity', 60), cls('bonds', 30), cls('cash', 10)]);
    const criteria = { ...DEFAULT_IDEAL_ALLOCATION, instrumentLimits: [{ assetId: 'G', maxPct: 0 }] };
    const outcome = buildHandoffSeed({ ...base, criteria, proposal: p, assets: [etfA, etfB, etfG, monetary, account], matchedAssetIds: ['A', 'B', 'G'], generateId: ids() });
    if (outcome.kind !== 'computed') throw new Error(outcome.kind);
    expect(outcome.seed.positions.find((p) => p.buyAssetId === 'G')?.targetPercentage).toBe(0);
    expect(outcome.zeroClasses).toEqual(['bonds']);
  });

  // Mutation: the unnamed held instrument left free (no 0 bound) → D takes a share → red (owner, 2026-11-18).
  it('holds every tradable instrument held; one the Consulente did not name stays a row at 0 % and is named (owner, 2026-11-12 and 2026-11-18)', () => {
    const etfD = makeAsset('D', { name: 'ETF D', assetClass: 'equity', quantity: 20 }); // 2.000
    const p = proposal([cls('equity', 60), cls('bonds', 30), cls('cash', 10)]);
    const outcome = buildHandoffSeed({ ...base, proposal: p, assets: [etfA, etfB, etfD, monetary, account], matchedAssetIds: ['A', 'B'], generateId: ids() });
    if (outcome.kind !== 'computed') throw new Error(outcome.kind);
    expect(outcome.seed.positions.find((p) => p.buyAssetId === 'D')?.targetPercentage).toBe(0);
    expect(outcome.seed.positions.find((p) => p.buyAssetId === 'A')!.targetPercentage).toBeGreaterThan(0);
    expect(outcome.extraNames).toEqual(['ETF D']);
    // Beside a bond the Consulente named and the owner holds, the new one still starts at 0 % (owner, 2026-11-18: left free it took 7,5%).
    const etfF = makeAsset('F', { name: 'ETF F', assetClass: 'bonds', quantity: 20 });
    const beside = buildHandoffSeed({ ...base, proposal: p, assets: [etfA, etfB, etfF, account], matchedAssetIds: ['A', 'B', 'F'], generateId: ids() });
    if (beside.kind !== 'computed') throw new Error(beside.kind);
    expect(beside.seed.positions.find((p) => p.buyAssetId === 'B')?.targetPercentage).toBe(0);
    expect(beside.seed.positions.find((p) => p.buyAssetId === 'F')!.targetPercentage).toBeGreaterThan(0);
    expect(beside.zeroClasses).toEqual(['bonds']);
    expect(beside.extraNames).toEqual([]);
    expect(describeHandoffExtra(['ETF D'])).toBe("Il Consulente non cita ETF D, che tieni oggi: resta nel piano a 0%, il piano non lo compra più. Se vuoi continuare a comprarlo, dagli una quota nell'editor.");
    expect(describeHandoffExtra(['ETF D', 'ETF E'])).toBe("Il Consulente non cita ETF D e ETF E, che tieni oggi: restano nel piano a 0%, il piano non li compra più. Se vuoi continuare a comprarli, dagli una quota nell'editor.");
  });

  // Mutation: the seed keeps an unnamed held row only when it is `unnamedHeld` → G dropped → red (phase F,
  // 2026-11-18: the editor then refused «Attiva piano» — «ha un valore ma non è né in una posizione né in una vendita»).
  it('a held tradable instrument the optimizer leaves at 0 % is a row even when nothing replaces it', () => {
    const etcG = makeAsset('G', { name: 'ETC G', assetClass: 'crypto', quantity: 10 }); // 1.000, no named instrument in its class
    const criteria = { ...DEFAULT_IDEAL_ALLOCATION, instrumentLimits: [{ assetId: 'G', maxPct: 0 }] };
    const p = proposal([cls('equity', 60), cls('bonds', 30), cls('cash', 10)]);
    const outcome = buildHandoffSeed({ ...base, criteria, proposal: p, assets: [etfA, etfB, etcG, account], matchedAssetIds: ['A', 'B'], generateId: ids() });
    if (outcome.kind !== 'computed') throw new Error(outcome.kind);
    expect(outcome.seed.positions.find((p) => p.buyAssetId === 'G')?.targetPercentage).toBe(0);
    expect(outcome.extraNames).toEqual([]);
  });

  // Mutation: the stand-in check dropped (every unnamed held instrument at 0) → V at 0, N takes the class → red.
  it('an unnamed held instrument holds its sub-target until the named one is among the assets, then goes to 0 % (owner, 2026-11-18)', () => {
    const worldEtf = makeAsset('V', { name: 'ETF V', assetClass: 'equity', subCategory: 'Mondo', quantity: 60 }); // 6.000
    const singleStock = makeAsset('N', { name: 'Azione N', type: 'stock', assetClass: 'equity', subCategory: 'Singole', quantity: 10 }); // 1.000
    const p = proposal([cls('equity', 70, [{ name: 'Mondo', targetPercentage: 90 }, { name: 'Singole', targetPercentage: 10 }]), cls('cash', 30)]);
    const before = buildHandoffSeed({ ...base, proposal: p, assets: [worldEtf, singleStock, account], matchedAssetIds: ['N'], generateId: ids() });
    if (before.kind !== 'computed') throw new Error(before.kind);
    const pctOf = (o: typeof before, id: string) => o.seed.positions.find((p) => p.buyAssetId === id)?.targetPercentage;
    expect(pctOf(before, 'V')!).toBeGreaterThan(pctOf(before, 'N')!);
    expect(before.extraNames).toEqual([]);
    // «Crea» done: the named instrument is an asset at 0 quotes, and the stand-in steps aside.
    const nuovo = makeAsset('W', { name: 'ETF Nuovo', assetClass: 'equity', subCategory: 'Mondo', quantity: 0 });
    const after = buildHandoffSeed({ ...base, proposal: p, assets: [worldEtf, nuovo, singleStock, account], matchedAssetIds: ['N', 'W'], generateId: ids() });
    if (after.kind !== 'computed') throw new Error(after.kind);
    expect(pctOf(after, 'V')).toBe(0);
    expect(pctOf(after, 'W')!).toBeGreaterThan(pctOf(after, 'N')!);
    expect(after.extraNames).toEqual(['ETF V']);
  });

  it('inside a class WITH sub-targets a new instrument at 0 quotes gets a share; a sub-category the targets do not list gets no added objective', () => {
    const mondo = makeAsset('A', { name: 'ETF A', assetClass: 'equity', subCategory: 'Mondo', quantity: 60 });
    const emergenti = makeAsset('E', { name: 'ETF emergenti', assetClass: 'equity', subCategory: 'Emergenti', quantity: 0 });
    const p = proposal([cls('equity', 70, [{ name: 'Mondo', targetPercentage: 70 }, { name: 'Emergenti', targetPercentage: 30 }]), cls('cash', 30)]);
    const outcome = buildHandoffSeed({ ...base, proposal: p, assets: [mondo, emergenti, account], matchedAssetIds: ['A', 'E'], generateId: ids() });
    if (outcome.kind !== 'computed') throw new Error(outcome.kind);
    expect(outcome.seed.positions.find((p) => p.buyAssetId === 'E')!.targetPercentage).toBeGreaterThan(0);
    expect(outcome.zeroClasses).toEqual([]);
    expect(outcome.unmappedClasses).toEqual([]);
    expect(outcome.seed.optimizerSnapshot?.settingsUsed.factorObjectives).toEqual([{ assetClass: 'equity', priority: 'high' }]);

    const other = { ...emergenti, subCategory: 'Altro' };
    const unmapped = buildHandoffSeed({ ...base, proposal: p, assets: [mondo, other, account], matchedAssetIds: ['A', 'E'], generateId: ids() });
    if (unmapped.kind !== 'computed') throw new Error(unmapped.kind);
    expect(unmapped.unmappedClasses).toEqual(['equity']);
    expect(unmapped.seed.optimizerSnapshot?.settingsUsed.factorObjectives).toEqual([]);
  });

  it('handoffCriteria adds a high factor objective per class with sub-targets the owner did not list, never for an unmapped one', () => {
    const targets = buildTargetsFromProposal(proposal([
      cls('equity', 50, [{ name: 'Mondo', targetPercentage: 100 }]),
      cls('bonds', 30, [{ name: 'Euro', targetPercentage: 100 }]),
      cls('crypto', 10, [{ name: 'Bitcoin', targetPercentage: 100 }]),
      cls('cash', 10),
    ]));
    const owner = { ...DEFAULT_IDEAL_ALLOCATION, factorObjectives: [{ assetClass: 'bonds' as const, priority: 'low' as const }] };
    expect(handoffCriteria(owner, targets, ['crypto']).factorObjectives).toEqual([
      { assetClass: 'bonds', priority: 'low' },
      { assetClass: 'equity', priority: 'high' },
    ]);
  });

  it('a property below its loans, caps that cannot reach 100, or nothing to buy: the matched instruments at 0%, and why', () => {
    const house = makeAsset('H', { name: 'Casa', type: 'realestate', assetClass: 'realestate', currentPrice: 100000 });
    const mortgage = makeAsset('L', { name: 'Mutuo', type: 'loan', assetClass: 'realestate', financedAssetId: 'H', currentPrice: 120000 });
    const p = proposal([cls('equity', 60), cls('bonds', 30), cls('cash', 10)]);
    const negative = buildHandoffSeed({ ...base, proposal: p, assets: [etfA, etfB, house, mortgage, account], matchedAssetIds: ['A', 'B'], generateId: ids() });
    expect(negative).toMatchObject({ kind: 'manual', reason: 'negative_fixed', negativeFixedLabels: ['Casa'] });
    expect(negative.seed.positions.map((p) => [p.buyAssetId, p.targetPercentage])).toEqual([['A', 0], ['B', 0]]);

    const three = ['X', 'Y', 'Z'].map((id) => makeAsset(id, { name: `ETF ${id}`, quantity: 10 }));
    const limits = { ...DEFAULT_IDEAL_ALLOCATION, instrumentLimits: three.map((a) => ({ assetId: a.id, minPct: 40 })) };
    const infeasible = buildHandoffSeed({ ...base, criteria: limits, proposal: proposal([cls('equity', 90), cls('cash', 10)]), assets: [...three, account], matchedAssetIds: ['X', 'Y', 'Z'], generateId: ids() });
    expect(infeasible).toMatchObject({ kind: 'manual', reason: 'infeasible_bounds' });

    const nothing = buildHandoffSeed({ ...base, proposal: p, assets: [account], matchedAssetIds: [], generateId: ids() });
    expect(nothing).toMatchObject({ kind: 'manual', reason: 'no_candidates' });
    expect(nothing.seed.positions).toEqual([]);
  });
});

// ── findKeptSales ──────────────────────────────────────────────────────────────────────────
describe('findKeptSales', () => {
  const sale = (assetId: string, extra: Partial<PlanDisposal> = {}): PlanDisposal =>
    ({ assetId, estimatedProceedsEur: 1000, status: 'planned', ...extra }) as PlanDisposal;

  it('names a month-1 sale (an absent month is month 1) of a kept instrument, never month 2, an executed one, or one not kept', () => {
    const disposals = [sale('a'), sale('b', { monthIndex: 2 }), sale('c', { status: 'executed' }), sale('d'), sale('e', { monthIndex: 1 })];
    expect(findKeptSales(disposals, ['a', 'b', 'c', 'e']).map((d) => d.assetId)).toEqual(['a', 'e']);
  });
});
