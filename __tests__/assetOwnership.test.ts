/**
 * «Intestatario» (lib/utils/assetOwnership.ts, 2026-10-17; per QUOTA since the same day): whose
 * each asset is, the household's wealth by owner, the Strumenti filter and the words of the
 * Intestatari tile. Pure, SDK-free — `valueOf` injected. Figures invented and round.
 *
 * Falsified one at a time: the pension fund answering its own `ownerMemberId` (the Previdenza
 * member wins); the mortgage answering its own field (the property's fractions win); a deleted
 * member folded into «In comune» (it is «Senza intestatario»); a loan counted positive (net);
 * units past the quantity rescaled in silence (declared, `reassign`); a card in the red skipped
 * (`quantity !== 0` is the gate); a split asset counted once (every row that has a quota); the
 * carry split read off the value (2026-10-18: `cost * fraction` swapped for `value * fraction`);
 * an account declared «senza prezzo di carico» (the slice-unit guard taken off).
 */

import { describe, expect, it } from 'vitest';
import type { Asset, FamilyMember } from '@/types/assets';
import {
  describeAssetOwnerLabel,
  hasOwnOwnerField,
  isOwnedHolding,
  listAssetOwnerFilterOptions,
  matchesAssetOwnerFilter,
  OWNER_COMMON_LABEL,
  OWNER_UNASSIGNED_LABEL,
  hasCostFigures,
  resolveAssetOwnership,
  summarizeOwnership,
  type OwnershipRow,
} from '@/lib/utils/assetOwnership';
import { describeOwnership, describeOwnershipAnswer, describeOwnershipAside, describeOwnershipFooter, OWNERSHIP_FOOTER } from '@/lib/utils/patrimonioNarrative';
import { narrativeToText } from '@/lib/utils/narrative';
import { ownershipRowOn } from '@/lib/utils/ownershipBasis';

const asset = (overrides: Partial<Asset> & { id: string }): Asset =>
  ({
    userId: 'u',
    ticker: '',
    name: overrides.id,
    type: 'etf',
    assetClass: 'equity',
    currency: 'EUR',
    quantity: 1,
    currentPrice: 1,
    lastPriceUpdate: new Date(0),
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  }) as Asset;

const MEMBERS: FamilyMember[] = [
  { id: 'marco', name: 'Marco' },
  { id: 'giulia', name: 'Giulia' },
];
const NAMES = new Map(MEMBERS.map((member) => [member.id, member.name]));
const KNOWN = new Set(MEMBERS.map((member) => member.id));

/** A loan is minus its principal, everything else quantity × price — `calculateAssetValue`'s rule. */
const valueOf = (a: Asset) => (a.type === 'loan' ? -a.quantity : a.quantity * a.currentPrice);
/** quantity × the EUR PMC where the ledger has one, null where there is no PMC to read — `costBasisOf`'s rule, SDK-free. */
const costOf = (a: Asset) => (a.averageCostEur !== undefined && a.averageCostEur > 0 ? a.quantity * a.averageCostEur : null);
/** Intl puts a no-break space before «€»; the comparisons read plain spaces. */
const plain = (text: string | null) => (text ? text.replace(/[  ]/g, ' ') : null);
const words = (narrative: ReturnType<typeof describeOwnership>) => (narrative ? plain(narrativeToText(narrative)) : null);

const HOUSE = asset({ id: 'house', type: 'realestate', assetClass: 'realestate', quantity: 1, currentPrice: 200_000, ownerMemberId: 'marco' });
const MORTGAGE = asset({ id: 'mortgage', type: 'loan', assetClass: 'realestate', quantity: 80_000, financedAssetId: 'house', ownerMemberId: 'giulia' });
const FUND = asset({ id: 'fund', type: 'pensionFund', assetClass: 'equity', quantity: 30_000, pensionFundDetails: { provider: 'X', familyMemberId: 'giulia' }, ownerMemberId: 'marco' });
const ETF = asset({ id: 'etf', quantity: 50, currentPrice: 1000 });
const CASH = asset({ id: 'cash', type: 'cash', assetClass: 'cash', quantity: 20_000, ownerMemberId: 'giulia' });
const GHOST = asset({ id: 'ghost', type: 'cash', assetClass: 'cash', quantity: 5_000, ownerMemberId: 'deleted' });
const SOLD = asset({ id: 'sold', quantity: 0, ownerMemberId: 'marco' });
const ALL = [HOUSE, MORTGAGE, FUND, ETF, CASH, GHOST, SOLD];

/** 100 quote at 1000 €: 40 to Marco, 20 to Giulia, the rest in comune. */
const SPLIT = asset({ id: 'split', name: 'VWCE', quantity: 100, currentPrice: 1000, ownerShares: [{ memberId: 'marco', units: 40 }, { memberId: 'giulia', units: 20 }] });
/** The same with «Nessuna quota in comune»: Giulia takes the rest. */
const SPLIT_REST_TO_GIULIA = asset({ ...SPLIT, id: 'split-rest', ownerMemberId: 'giulia' });
/** 120 quote stored on an asset that fell to 100: declared, never rescaled in silence. */
const OVER = asset({ id: 'over', name: 'Over ETF', quantity: 100, currentPrice: 10, ownerShares: [{ memberId: 'marco', units: 80 }, { memberId: 'giulia', units: 40 }] });

describe('resolveAssetOwnership — the ONE resolution', () => {
  it('reads the whole asset to one member, derives a pension fund from Previdenza and a mortgage from its property', () => {
    expect(resolveAssetOwnership(CASH, ALL).slices).toEqual([{ memberId: 'giulia', fraction: 1, slice: null }]);
    expect(resolveAssetOwnership(ETF, ALL).slices).toEqual([{ memberId: null, fraction: 1, slice: null }]);
    expect(resolveAssetOwnership(FUND, ALL)).toMatchObject({ source: 'pensionFund', slices: [{ memberId: 'giulia', fraction: 1 }] });
    expect(resolveAssetOwnership(MORTGAGE, ALL)).toMatchObject({ source: 'mortgage', slices: [{ memberId: 'marco', fraction: 1 }] });
    // A mortgage whose property is gone falls back to its own fields; a personal loan reads its own.
    expect(resolveAssetOwnership(MORTGAGE, [MORTGAGE]).slices).toEqual([{ memberId: 'giulia', fraction: 1, slice: null }]);
    expect(resolveAssetOwnership(asset({ id: 'car', type: 'loan', assetClass: 'cash', quantity: 100 }), ALL).slices).toEqual([{ memberId: null, fraction: 1, slice: null }]);
  });

  it('splits by the typed units, the rest in comune or to the member the field names', () => {
    const split = resolveAssetOwnership(SPLIT, [SPLIT]);
    expect(split.source).toBe('shares');
    expect(split.slices).toEqual([
      { memberId: 'marco', fraction: 0.4, slice: { units: 40 } },
      { memberId: 'giulia', fraction: 0.2, slice: { units: 20 } },
      { memberId: null, fraction: 0.4, slice: { units: 40 } },
    ]);
    expect(split.budget).toEqual({ assignedUnits: 60, freeUnits: 40, overBy: 0, needsReassignment: false });
    expect(resolveAssetOwnership(SPLIT_REST_TO_GIULIA, [SPLIT_REST_TO_GIULIA]).slices).toEqual([
      { memberId: 'marco', fraction: 0.4, slice: { units: 40 } },
      { memberId: 'giulia', fraction: 0.2, slice: { units: 20 } },
      { memberId: 'giulia', fraction: 0.4, slice: { units: 40 } },
    ]);
  });

  it('keeps the units where the price moves and gives new units to the rest', () => {
    const pricier = { ...SPLIT, currentPrice: 2000 };
    expect(resolveAssetOwnership(pricier, [pricier]).slices.map((s) => s.fraction)).toEqual([0.4, 0.2, 0.4]);
    // A buy of 100 more quote: the typed rows are what they were, the rest grew.
    const bought = { ...SPLIT, quantity: 200 };
    expect(resolveAssetOwnership(bought, [bought]).slices).toEqual([
      { memberId: 'marco', fraction: 0.2, slice: { units: 40 } },
      { memberId: 'giulia', fraction: 0.1, slice: { units: 20 } },
      { memberId: null, fraction: 0.7, slice: { units: 140 } },
    ]);
  });

  it('declares units past the quantity and still splits the whole asset by their proportions', () => {
    const over = resolveAssetOwnership(OVER, [OVER]);
    expect(over.needsReassignment).toBe(true);
    expect(over.budget).toMatchObject({ assignedUnits: 120, freeUnits: 0, overBy: 20 });
    expect(over.slices.map((s) => [s.memberId, s.fraction])).toEqual([['marco', 80 / 120], ['giulia', 40 / 120]]);
  });

  // The percent form (owner, same day): a joint account is 50/50 whatever its balance does.
  it('reads percent rows as fractions that follow the asset whole, the rest in the same form', () => {
    const joint = asset({ id: 'joint', type: 'cash', assetClass: 'cash', quantity: 8000, ownerShares: [{ memberId: 'marco', percent: 50 }, { memberId: 'giulia', percent: 30 }] });
    const resolved = resolveAssetOwnership(joint, [joint]);
    expect(resolved.mode).toBe('percent');
    expect(resolved.slices).toEqual([
      { memberId: 'marco', fraction: 0.5, slice: { percent: 50 } },
      { memberId: 'giulia', fraction: 0.3, slice: { percent: 30 } },
      { memberId: null, fraction: 0.2, slice: { percent: 20 } },
    ]);
    expect(resolved.needsReassignment).toBe(false);
    // The balance moves: the fractions do not.
    const moved = { ...joint, quantity: 12_000 };
    expect(resolveAssetOwnership(moved, [moved]).slices.map((s) => s.fraction)).toEqual([0.5, 0.3, 0.2]);
    // A units block answers 'units'; the rest to a member keeps the block's form.
    expect(resolveAssetOwnership(SPLIT, [SPLIT]).mode).toBe('units');
    const half = asset({ ...joint, id: 'half', ownerMemberId: 'giulia', ownerShares: [{ memberId: 'marco', percent: 50 }] });
    expect(resolveAssetOwnership(half, [half]).slices).toEqual([
      { memberId: 'marco', fraction: 0.5, slice: { percent: 50 } },
      { memberId: 'giulia', fraction: 0.5, slice: { percent: 50 } },
    ]);
    expect(describeAssetOwnerLabel(half, [half], NAMES)).toBe('Marco 50% · Giulia 50%');
    expect(describeAssetOwnerLabel(joint, [joint], NAMES)).toBe('Marco 50% · Giulia 30% · 20% in comune');
    // A member named twice in one form is summed; the summary splits the value by the fractions.
    const twice = asset({ ...joint, id: 'twice', ownerShares: [{ memberId: 'marco', percent: 20 }, { memberId: 'marco', percent: 30 }] });
    expect(resolveAssetOwnership(twice, [twice]).slices[0]).toEqual({ memberId: 'marco', fraction: 0.5, slice: { percent: 50 } });
    expect(summarizeOwnership([joint], MEMBERS, valueOf, costOf).rows.map((row) => [row.label, row.value])).toEqual([['Marco', 4000], ['Giulia', 2400], [OWNER_COMMON_LABEL, 1600]]);
  });

  it('gives a mortgage the fractions of its property, whatever its own fields say', () => {
    const house = asset({ id: 'h', type: 'realestate', assetClass: 'realestate', quantity: 200_000, currentPrice: 1, ownerShares: [{ memberId: 'marco', units: 150_000 }], ownerMemberId: 'giulia' });
        const mortgage = asset({ id: 'm', type: 'loan', assetClass: 'realestate', quantity: 80_000, financedAssetId: 'h', ownerMemberId: 'giulia', ownerShares: [{ memberId: 'giulia', units: 80_000 }] });
    expect(resolveAssetOwnership(mortgage, [house, mortgage]).slices.map((s) => [s.memberId, s.fraction])).toEqual([['marco', 0.75], ['giulia', 0.25]]);
  });

  it('offers the quotas to everything but a pension fund and a linked mortgage', () => {
    expect(hasOwnOwnerField(ETF)).toBe(true);
    expect(hasOwnOwnerField(FUND)).toBe(false);
    expect(hasOwnOwnerField(MORTGAGE)).toBe(false);
    expect(hasOwnOwnerField({ type: 'loan' })).toBe(true);
  });
});

describe('summarizeOwnership — the net worth by owner', () => {
  it('groups the held assets by owner, net of the debts, members first then the shared and the orphaned', () => {
    const summary = summarizeOwnership(ALL, MEMBERS, valueOf, costOf);
    // 200.000 − 80.000 (Marco) + 30.000 + 20.000 (Giulia) + 50.000 (common) + 5.000 (ghost) = 225.000
    expect(summary.total).toBe(225_000);
    expect(summary.assetCount).toBe(6);
    expect(summary.hasOwners).toBe(true);
    expect(summary.reassign).toEqual([]);
    expect(summary.rows.map((row) => [row.key, row.kind, row.label, row.value, row.assetCount])).toEqual([
      ['marco', 'member', 'Marco', 120_000, 2],
      ['giulia', 'member', 'Giulia', 50_000, 2],
      ['common', 'common', OWNER_COMMON_LABEL, 50_000, 1],
      ['unassigned', 'unassigned', OWNER_UNASSIGNED_LABEL, 5_000, 1],
    ]);
    expect(summary.rows.map((row) => Math.round(row.sharePct ?? -1))).toEqual([53, 22, 22, 2]);
  });

  it('splits an asset by its quotas: the value by fraction, the asset counted in every row that has one', () => {
    const summary = summarizeOwnership([SPLIT, CASH], MEMBERS, valueOf, costOf);
    // VWCE 100.000: 40.000 Marco, 20.000 Giulia, 40.000 in comune; the account 20.000 Giulia
    // (a tie keeps the settings' order).
    expect(summary.rows.map((row) => [row.label, row.value, row.assetCount])).toEqual([
      ['Marco', 40_000, 1],
      ['Giulia', 40_000, 2],
      [OWNER_COMMON_LABEL, 40_000, 1],
    ]);
    expect(summary.assetCount).toBe(2);
  });

  it('counts a card in the red against its owner (the owner\'s P.S., 2026-10-17)', () => {
    const card = asset({ id: 'card', type: 'cash', assetClass: 'cash', quantity: -500, ownerMemberId: 'giulia' });
    expect(isOwnedHolding(card)).toBe(true);
    expect(isOwnedHolding(SOLD)).toBe(false);
    const summary = summarizeOwnership([CASH, card], MEMBERS, valueOf, costOf);
    expect(summary.rows).toEqual([{ key: 'giulia', kind: 'member', memberId: 'giulia', label: 'Giulia', value: 19_500, sharePct: 100, costValue: 19_500, costSharePct: 100, assetCount: 2 }]);
    // Its debt split by units: 300 € of the 500 to Marco.
    const splitCard = asset({ id: 'card2', type: 'cash', assetClass: 'cash', quantity: -500, ownerShares: [{ memberId: 'marco', units: 300 }] });
    const split = summarizeOwnership([CASH, splitCard], MEMBERS, valueOf, costOf);
    expect(split.rows.map((row) => [row.label, row.value])).toEqual([['Giulia', 20_000], ['Marco', -300], [OWNER_COMMON_LABEL, -200]]);
  });

  it('declares the assets whose quotas no longer fit, and still adds up', () => {
    const summary = summarizeOwnership([OVER, CASH], MEMBERS, valueOf, costOf);
    expect(summary.reassign).toEqual([{ assetId: 'over', name: 'Over ETF' }]);
    expect(summary.rows.reduce((sum, row) => sum + row.value, 0)).toBeCloseTo(summary.total, 6);
  });

  it('has no owners when every held asset is shared, and no shares without a positive total', () => {
    const shared = summarizeOwnership([ETF, SOLD], MEMBERS, valueOf, costOf);
    expect(shared.hasOwners).toBe(false);
    expect(shared.rows.map((row) => row.kind)).toEqual(['common']);
    const underwater = summarizeOwnership([asset({ id: 'car', type: 'loan', assetClass: 'cash', quantity: 100, ownerMemberId: 'marco' })], MEMBERS, valueOf, costOf);
    expect(underwater.total).toBe(-100);
    expect(underwater.rows[0].sharePct).toBeNull();
  });
});

describe('the Strumenti filter', () => {
  it('lists Tutti, In comune and the members, plus Senza intestatario only when an orphan exists', () => {
    expect(listAssetOwnerFilterOptions(ALL, MEMBERS).map((option) => option.label)).toEqual(['Tutti', 'In comune', 'Marco', 'Giulia', OWNER_UNASSIGNED_LABEL]);
    expect(listAssetOwnerFilterOptions([ETF, CASH], MEMBERS).map((option) => option.label)).toEqual(['Tutti', 'In comune', 'Marco', 'Giulia']);
  });

  it('matches by the resolved owner — a mortgage under its property\'s owner, a quota enough for a member', () => {
    const all = [...ALL, SPLIT];
    expect(all.filter((a) => matchesAssetOwnerFilter(a, all, 'marco', KNOWN)).map((a) => a.id)).toEqual(['house', 'mortgage', 'sold', 'split']);
    expect(all.filter((a) => matchesAssetOwnerFilter(a, all, 'giulia', KNOWN)).map((a) => a.id)).toEqual(['fund', 'cash', 'split']);
    expect(all.filter((a) => matchesAssetOwnerFilter(a, all, 'common', KNOWN)).map((a) => a.id)).toEqual(['etf', 'split']);
    expect(all.filter((a) => matchesAssetOwnerFilter(a, all, 'unassigned', KNOWN)).map((a) => a.id)).toEqual(['ghost']);
    expect(all.filter((a) => matchesAssetOwnerFilter(a, all, 'all', KNOWN))).toHaveLength(all.length);
    // The rest to Giulia: nothing in comune any more.
    expect(matchesAssetOwnerFilter(SPLIT_REST_TO_GIULIA, [SPLIT_REST_TO_GIULIA], 'common', KNOWN)).toBe(false);
  });

  it('labels a whole asset «di Marco», a split one with every name and its units, an orphan with the Divisione\'s word', () => {
    expect(describeAssetOwnerLabel(MORTGAGE, ALL, NAMES)).toBe('di Marco');
    expect(describeAssetOwnerLabel(GHOST, ALL, NAMES)).toBe('senza intestatario');
    expect(describeAssetOwnerLabel(ETF, ALL, NAMES)).toBeNull();
    expect(describeAssetOwnerLabel(SPLIT, [SPLIT], NAMES)).toBe('Marco 40 · Giulia 20 · 40 in comune');
    expect(describeAssetOwnerLabel(SPLIT_REST_TO_GIULIA, [SPLIT_REST_TO_GIULIA], NAMES)).toBe('Marco 40 · Giulia 20 · Giulia 40');
    expect(describeAssetOwnerLabel(OVER, [OVER], NAMES)).toBe('Marco 80 · Giulia 40 · quote da riassegnare (120 su 100 quote)');
    // Money where the value lives in quantity at price 1; a fractional quota keeps two decimals.
    const account = asset({ id: 'acc', type: 'cash', assetClass: 'cash', quantity: 8000, ownerShares: [{ memberId: 'marco', units: 5000 }] });
    expect(plain(describeAssetOwnerLabel(account, [account], NAMES))).toBe('Marco 5000 € · 3000 € in comune');
    const fractional = asset({ id: 'frac', quantity: 10, ownerShares: [{ memberId: 'marco', units: 2.5 }] });
    expect(describeAssetOwnerLabel(fractional, [fractional], NAMES)).toBe('Marco 2,50 · 7,50 in comune');
  });
});

describe('the words of the Intestatari tile', () => {
  it('names each owner with the share the row prints, then the rest in common and the orphans', () => {
    const summary = summarizeOwnership(ALL, MEMBERS, valueOf, costOf);
    expect(words(describeOwnership(summary))).toBe('Il 53% è intestato a Marco, il 22% a Giulia, il resto in comune, il 2% senza intestatario.');
    expect(describeOwnershipAside(summary)).toBe('su 6 asset');
    expect(words(describeOwnershipAnswer(summary))).toBe('Marco 53%');
  });

  it('articulates on the printed integer and says «Tutto» for a single owner', () => {
    const eight = summarizeOwnership([asset({ id: 'a', quantity: 8, currentPrice: 1, ownerMemberId: 'marco' }), asset({ id: 'b', quantity: 92, currentPrice: 1 })], MEMBERS, valueOf, costOf);
    expect(words(describeOwnership(eight))).toBe("L'8% è intestato a Marco, il resto in comune.");
    const alone = summarizeOwnership([HOUSE], MEMBERS, valueOf, costOf);
    expect(words(describeOwnership(alone))).toBe('Tutto è intestato a Marco.');
    expect(describeOwnership(summarizeOwnership([ETF], MEMBERS, valueOf, costOf))).toBeNull();
  });

  it('names a group that is a net debt instead of printing a negative share', () => {
    const summary = summarizeOwnership([HOUSE, asset({ id: 'car', type: 'loan', assetClass: 'cash', quantity: 3000, ownerMemberId: 'giulia' })], MEMBERS, valueOf, costOf);
    expect(words(describeOwnership(summary))).toBe('Il 102% è intestato a Marco, Giulia è in negativo (3000 € di debiti).');
    expect(words(describeOwnershipAnswer(summary))).toBe('Marco 102%');
  });

  it('turns the footer to the warning tone naming the assets with quotas to reassign', () => {
    expect(describeOwnershipFooter({ reassign: [], withoutCostBasis: [] }).tone).toBe('neutral');
    expect(describeOwnershipFooter({ reassign: undefined as unknown as [], withoutCostBasis: undefined as unknown as [] }).tone).toBe('neutral');
    expect(describeOwnershipFooter({ reassign: [{ assetId: 'a', name: 'VWCE' }], withoutCostBasis: [] })).toEqual({ text: '1 asset ha quote da riassegnare: VWCE.', tone: 'warning' });
    expect(describeOwnershipFooter({ reassign: [{ assetId: 'a', name: 'VWCE' }, { assetId: 'b', name: 'Casa' }], withoutCostBasis: [] }).text).toBe('2 asset hanno quote da riassegnare: VWCE e Casa.');
  });
});

// ─── The price of carry (owner, 2026-10-18) ───────────────────────────────────

/** 100 quote bought at 500 €, worth 1000 € today: 40 to Marco, 20 to Giulia, the rest in comune. */
const SPLIT_WITH_COST = asset({ ...SPLIT, id: 'split-cost', averageCostEur: 500 });
/** A quoted instrument the ledger has not costed: it stands at its value in the Carico view, declared. */
const UNCOSTED = asset({ id: 'uncosted', name: 'Senza PMC', quantity: 10, currentPrice: 1000, ownerMemberId: 'marco' });

describe('summarizeOwnership — the same groups at the price of carry', () => {
  it('measures every group on the value AND on the carry, the shares of each total', () => {
    const summary = summarizeOwnership([SPLIT_WITH_COST, CASH], MEMBERS, valueOf, costOf);
    // Value: VWCE 100.000 → 40.000 Marco, 20.000 Giulia, 40.000 common; the account 20.000 Giulia.
    // Carry: VWCE 50.000 → 20.000 Marco, 10.000 Giulia, 20.000 common; the account at its value.
    expect(summary.total).toBe(120_000);
    expect(summary.costTotal).toBe(70_000);
    expect(summary.rows.map((row) => [row.label, row.value, row.costValue])).toEqual([
      ['Marco', 40_000, 20_000],
      ['Giulia', 40_000, 30_000],
      [OWNER_COMMON_LABEL, 40_000, 20_000],
    ]);
    expect(summary.rows.map((row) => Math.round(row.costSharePct ?? -1))).toEqual([29, 43, 29]);
    // The carry adds up to its own total as the value does to the net worth.
    expect(summary.rows.reduce((sum, row) => sum + row.costValue, 0)).toBeCloseTo(summary.costTotal, 6);
    expect(summary.withoutCostBasis).toEqual([]);
    expect(ownershipRowOn(summary.rows[0], 'value')).toEqual({ value: 40_000, sharePct: summary.rows[0].sharePct });
    expect(ownershipRowOn(summary.rows[0], 'cost')).toEqual({ value: 20_000, sharePct: summary.rows[0].costSharePct });
  });

  it('counts a quoted instrument without a PMC at its value and declares it; an account, a property, a fund or a loan never', () => {
    const summary = summarizeOwnership([UNCOSTED, CASH, HOUSE, FUND, MORTGAGE], MEMBERS, valueOf, costOf);
    expect(summary.withoutCostBasis).toEqual([{ assetId: 'uncosted', name: 'Senza PMC' }]);
    expect(summary.costTotal).toBe(summary.total);
    expect(summary.rows.map((row) => row.costValue)).toEqual(summary.rows.map((row) => row.value));
  });

  it('reads the carry figures only when the summary carries them (a payload cached before source version 25)', () => {
    const summary = summarizeOwnership([SPLIT_WITH_COST], MEMBERS, valueOf, costOf);
    expect(hasCostFigures(summary)).toBe(true);
    const cached = { rows: summary.rows.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'costValue' && key !== 'costSharePct')) as unknown as OwnershipRow) };
    expect(hasCostFigures(cached)).toBe(false);
  });

  it('opens the reading by naming the carry, the shares of the carry total', () => {
    const summary = summarizeOwnership([SPLIT_WITH_COST, CASH], MEMBERS, valueOf, costOf);
    expect(words(describeOwnership(summary))).toBe('Il 33% è intestato a Marco, il 33% a Giulia, il resto in comune.');
    expect(words(describeOwnership(summary, 'cost'))).toBe('Al prezzo di carico, il 29% è intestato a Marco, il 43% a Giulia, il resto in comune.');
    expect(words(describeOwnership(summarizeOwnership([HOUSE], MEMBERS, valueOf, costOf), 'cost'))).toBe('Al prezzo di carico, tutto è intestato a Marco.');
    // The closed row's answer stays on the value (the switch is not visible there).
    expect(words(describeOwnershipAnswer(summary))).toBe('Marco 33%');
  });

  it('declares the uncosted instruments in the footer of the Carico view only, after a datum to fix', () => {
    const one = { reassign: [], withoutCostBasis: [{ assetId: 'u', name: 'Senza PMC' }] };
    expect(describeOwnershipFooter(one, 'value')).toEqual({ text: OWNERSHIP_FOOTER, tone: 'neutral' });
    expect(describeOwnershipFooter(one, 'cost')).toEqual({ text: '1 asset senza prezzo di carico conta al valore attuale: Senza PMC.', tone: 'neutral' });
    const two = { reassign: [], withoutCostBasis: [{ assetId: 'u', name: 'Senza PMC' }, { assetId: 'v', name: 'Altro' }] };
    expect(describeOwnershipFooter(two, 'cost').text).toBe('2 asset senza prezzo di carico contano al valore attuale: Senza PMC e Altro.');
    expect(describeOwnershipFooter({ reassign: [{ assetId: 'a', name: 'VWCE' }], withoutCostBasis: one.withoutCostBasis }, 'cost').tone).toBe('warning');
  });
});
