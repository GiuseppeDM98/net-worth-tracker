/**
 * The facts of the operating plan (lib/utils/operatingPlanFacts.ts, 2026-11-19): which instrument
 * gets which key (S held and buyable, N new from the report, M money-market fund) and in which
 * order, what the app knows of each held one — quantity, price, value, the tax if sold, the limits
 * of «Criteri del modello» — and «DA TENERE» from the answers alone. Invented instruments.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase/config', () => ({ db: {}, auth: { currentUser: null } }));
vi.mock('@/lib/utils/authFetch', () => ({ authenticatedFetch: vi.fn() }));
vi.mock('@/lib/services/dashboardOverviewInvalidation', () => ({ invalidateDashboardOverviewSummary: vi.fn() }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), getDoc: vi.fn(), setDoc: vi.fn(), deleteField: vi.fn() }));

import type { Asset } from '@/types/assets';
import type { AllocationAdviceProposal, InstrumentCandidates } from '@/lib/utils/allocationAdviceProposal';
import { buildOperatingPlanFacts } from '@/lib/utils/operatingPlanFacts';

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

const valueOf = (asset: Asset) => (asset.type === 'loan' ? -1 : 1) * asset.quantity * asset.currentPrice;
const priceOf = (asset: Asset) => asset.currentPrice;

const ASSETS: Asset[] = [
  makeAsset('a-ornitorinco', { name: 'ETF ornitorinco', subCategory: 'Mondo', quantity: 120, currentPrice: 100, averageCost: 80, taxRate: 12.5 }),
  makeAsset('a-fenicottero', { name: 'ETF fenicottero', subCategory: 'Emergenti', quantity: 40, currentPrice: 50, averageCost: 50 }),
  // Sold down to 0 quotes, chosen again by the report: the hand-off matches it.
  makeAsset('a-airone', { name: 'ETF airone', subCategory: 'Mondo', quantity: 0, currentPrice: 20 }),
  // Created empty for a plan, never bought.
  makeAsset('a-pellicano', { name: 'ETC pellicano', assetClass: 'commodity', quantity: 0, currentPrice: 60, createdEmpty: true }),
  // At 0 quotes and neither created empty nor named: no key.
  makeAsset('a-cormorano', { name: 'ETF cormorano', quantity: 0, currentPrice: 30 }),
  makeAsset('a-lontra', { name: 'Fondo lontra', assetClass: 'cash', quantity: 300, currentPrice: 10, averageCost: 10, taxRate: 26 }),
  makeAsset('a-conto', { name: 'Conto castoro', type: 'cash', assetClass: 'cash', quantity: 5000, currentPrice: 1 }),
  makeAsset('a-casa', { name: 'Casa', type: 'realestate', assetClass: 'realestate', quantity: 1, currentPrice: 200000 }),
  makeAsset('a-mutuo', { name: 'Mutuo', type: 'loan', assetClass: 'realestate', quantity: 1, currentPrice: 100000 }),
];

const PROPOSAL: AllocationAdviceProposal = {
  summary: 'S.',
  classes: [
    {
      assetClass: 'equity',
      targetPercentage: 60,
      rationale: '',
      subTargets: [
        { name: 'Mondo', targetPercentage: 80, instrument: 'ETF airone' },
        { name: 'Emergenti', targetPercentage: 20, instrument: 'ETF fenicottero' },
      ],
    },
    { assetClass: 'bonds', targetPercentage: 40, rationale: '', subTargets: [{ name: 'Euro 1-3 anni', targetPercentage: 100, instrument: 'ETF Obbligazioni airone 1-3 (IE00AAAAAAA1)' }] },
  ],
  assetRoles: [],
  goals: [],
  reviewByIso: '2028-01-01',
  reviewReason: '',
  risks: [],
};

const CANDIDATES: InstrumentCandidates = {
  sleeves: [
    {
      assetClass: 'bonds',
      subTarget: 'Euro 1-3 anni',
      candidates: [{ name: 'ETF Obbligazioni airone 1-3', isin: 'IE00AAAAAAA1', ticker: 'AAA', exchange: 'Borsa Italiana', note: '', yahooSymbols: ['AAA.MI', 'AAA.DE'] }],
    },
  ],
};

const build = (overrides: Partial<Parameters<typeof buildOperatingPlanFacts>[0]> = {}) =>
  buildOperatingPlanFacts({
    assets: ASSETS,
    proposal: PROPOSAL,
    candidates: CANDIDATES,
    keepNames: ['ETF ornitorinco'],
    limits: [{ assetId: 'a-fenicottero', maxPct: 15 }],
    valueOf,
    priceOf,
    ...overrides,
  });

describe('buildOperatingPlanFacts', () => {
  it('keys the held instruments S by class, then name; the money-market funds M; the new instruments N', () => {
    const facts = build();
    expect(facts.instruments.map((instrument) => [instrument.ref, instrument.kind, instrument.name])).toEqual([
      ['S1', 'held', 'ETF airone'],
      ['S2', 'held', 'ETF fenicottero'],
      ['S3', 'held', 'ETF ornitorinco'],
      ['S4', 'held', 'ETC pellicano'],
      ['N1', 'new', 'ETF Obbligazioni airone 1-3'],
      ['M1', 'cashFund', 'Fondo lontra'],
    ]);
    expect(facts.instruments.find((instrument) => instrument.ref === 'S3')).toMatchObject({ assetId: 'a-ornitorinco', assetClass: 'equity', subCategory: 'Mondo' });
  });

  it('gives a property, a loan, an account and an unnamed instrument at 0 quotes no key', () => {
    const names = build().instruments.map((instrument) => instrument.name);
    for (const name of ['Casa', 'Mutuo', 'Conto castoro', 'ETF cormorano']) expect(names).not.toContain(name);
  });

  it('marks «DA TENERE» only what the answers keep, not every instrument the report names', () => {
    const { held } = build();
    expect(held.S3.keep).toBe(true);
    expect(held.S1.keep).toBe(false);
    expect(held.S2.keep).toBe(false);
  });

  it('carries quantity, price, value, the tax if sold and the limits', () => {
    const { held } = build();
    expect(held.S3).toMatchObject({ quantity: 120, priceEur: 100, valueEur: 12000 });
    expect(held.S3.tax).toEqual({ kind: 'taxed', perEuro: expect.closeTo(0.025, 10) });
    expect(held.S2).toMatchObject({ quantity: 40, priceEur: 50, valueEur: 2000, maxPct: 15, tax: { kind: 'unknown', reason: 'rate' } });
    expect(held.S2.minPct).toBeUndefined();
    expect(held.S4).toMatchObject({ quantity: 0, priceEur: 60, valueEur: 0 });
    expect(held.M1).toMatchObject({ quantity: 300, priceEur: 10, valueEur: 3000, keep: false });
    expect(held.N1).toBeUndefined();
  });

  it("gives a new instrument the hand-off's prefill and the candidate's Yahoo symbols, else its ticker", () => {
    const withSymbols = build().instruments.find((instrument) => instrument.ref === 'N1');
    expect(withSymbols).toMatchObject({ kind: 'new', assetClass: 'bonds', subCategory: 'Euro 1-3 anni', symbols: ['AAA.MI', 'AAA.DE'] });
    expect(withSymbols?.prefill).toMatchObject({ name: 'ETF Obbligazioni airone 1-3', isin: 'IE00AAAAAAA1', ticker: 'AAA' });
    expect(withSymbols?.assetId).toBeUndefined();
    const older = { sleeves: [{ ...CANDIDATES.sleeves[0], candidates: [{ ...CANDIDATES.sleeves[0].candidates[0], yahooSymbols: undefined }] }] };
    expect(build({ candidates: older, valueOf }).instruments.find((instrument) => instrument.ref === 'N1')?.symbols).toEqual(['AAA']);
  });

  // A held instrument's ISIN never reaches the facts, so the block the plan stage reads cannot print
  // it (2026-11-19, the proof fixed at the retirement: the prompt test builds its facts by hand).
  // Mutation that turned it red: `isin: asset.isin` added to the held instruments' legend.
  it("carries no held instrument's ISIN, nor its asset's tax rate", () => {
    const withIsin: Asset[] = ASSETS.map((asset): Asset => (asset.id === 'a-ornitorinco' ? { ...asset, isin: 'IE00HELD0001' } : asset));
    const facts = build({ assets: withIsin, valueOf });
    expect(facts.instruments.some((instrument) => instrument.kind === 'held' && instrument.assetId === 'a-ornitorinco')).toBe(true);
    expect(JSON.stringify(facts)).not.toContain('IE00HELD0001');
    expect(JSON.stringify(facts)).not.toMatch(/"taxRate"/);
  });
});
