/**
 * The Consulente's instruments against the assets (lib/utils/allocationAdviceHandoff.ts, owner
 * 2026-11-12): what a plan can buy now, what to create prefilled, what has no instrument, what a plan
 * cannot buy — the names the operating plan's facts read. The seed toward the proposal and the
 * month-1 sales of a kept instrument went with the editor's hand-off (2026-11-20).
 *
 * Mutations that turn it red: `findAssetByIsin` dropped from the chain, or the `alreadyHeld`
 * fallback restored when the sub-target names an instrument.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase/config', () => ({ db: {}, auth: { currentUser: null } }));
vi.mock('@/lib/utils/authFetch', () => ({ authenticatedFetch: vi.fn() }));
vi.mock('@/lib/services/dashboardOverviewInvalidation', () => ({ invalidateDashboardOverviewSummary: vi.fn() }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), getDoc: vi.fn(), setDoc: vi.fn(), deleteField: vi.fn() }));
import type { Asset } from '@/types/assets';
import type { AllocationAdviceProposal, InstrumentCandidates } from '@/lib/utils/allocationAdviceProposal';
import { planConsulenteHandoff } from '@/lib/utils/allocationAdviceHandoff';

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

// ── Two instruments in one sub-target (owner, 2026-11-20, NOVE-25's phase F: «BTP A (IT…) + BTP€i B
// (IT…, da comprare sul MOT)» became ONE new ETF with the whole text as its name, no ISIN, no price).
describe('planConsulenteHandoff — a sub-target naming two instruments', () => {
  const btpValore = makeAsset('btpv', { name: 'BTP Valore airone 2031', type: 'bond', assetClass: 'bonds', isin: 'IT0000000VA1', quantity: 10 });
  const sleeve = {
    assetClass: 'bonds' as const,
    subTarget: 'Bond Singoli',
    candidates: [
      candidate('BTP Valore airone 2031', { isin: 'IT0000000VA9', alreadyHeld: true }),
      candidate('BTP€i airone 2035', { isin: 'IT0000000EI1' }),
    ],
  };

  // Mutation that turns it red: the instrument text read as one.
  it('each part is its own instrument: the held one matched, the new one a bond with its ISIN', () => {
    for (const text of [
      'BTP Valore airone 2031 (IT0000000VA9) + BTP€i airone 2035 (IT0000000EI1, da comprare sul MOT)',
      'BTP Valore airone 2031; BTP€i airone 2035 (IT0000000EI1)',
    ]) {
      const plan = planConsulenteHandoff(
        proposal([cls('bonds', 30, [{ name: 'Bond Singoli', targetPercentage: 100, instrument: text }])]),
        { sleeves: [sleeve] } as unknown as InstrumentCandidates,
        [],
        [btpValore],
      );
      expect(plan.matched.map((row) => row.assetId)).toEqual(['btpv']);
      expect(plan.toCreate).toEqual([
        expect.objectContaining({ subTarget: 'Bond Singoli', name: 'BTP€i airone 2035', prefill: expect.objectContaining({ isin: 'IT0000000EI1', type: 'bond', subCategory: 'Bond Singoli' }) }),
      ]);
    }
  });

  // Mutation that turns it red: the ISIN read only when it fills the parentheses.
  it('an ISIN followed by a note inside the parentheses is still the ISIN', () => {
    const plan = planConsulenteHandoff(
      proposal([cls('bonds', 30, [{ name: 'Bond Singoli', targetPercentage: 100, instrument: 'Un BTP qualsiasi (IT0000000EI1, da comprare sul MOT)' }])]),
      { sleeves: [sleeve] } as unknown as InstrumentCandidates,
      [],
      [],
    );
    expect(plan.toCreate.map((row) => [row.name, row.prefill.isin, row.prefill.type])).toEqual([['BTP€i airone 2035', 'IT0000000EI1', 'bond']]);
  });
});
