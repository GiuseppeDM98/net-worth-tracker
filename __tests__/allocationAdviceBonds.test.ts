/**
 * Tests for lib/utils/allocationAdviceBonds.ts — the Consulente's OBBLIGAZIONI block (2026-11-08):
 * which holdings are the bond part, which of them cost a profile read, and the block's three
 * states (nothing held · a single with its maturity · a fund with its value and role, never a
 * duration: Yahoo's proved wrong, owner 2026-11-20). Invented figures throughout.
 */
import { describe, expect, it } from 'vitest';
import { BOND_FUNDS_LINE, BOND_TERMS_HEADER, formatBondTermsBlock, selectBondHoldings, yearsBetweenIso } from '@/lib/utils/allocationAdviceBonds';
import type { AssistantCouponFact, AssistantHoldingRow } from '@/lib/utils/assistantPortfolioContext';

const eur = (value: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value);

function row(overrides: Partial<AssistantHoldingRow> & Pick<AssistantHoldingRow, 'name' | 'type' | 'assetClass' | 'valueEur'>): AssistantHoldingRow {
  return { assetId: overrides.name, role: 'tradable', quantity: 1, currency: 'EUR', owner: null, isLiquid: true, ...overrides };
}

const BTP = row({ name: 'BTP Esempio 2030', type: 'bond', assetClass: 'bonds', valueEur: 5000, maturityIso: '2030-03-01' });
const BOND_ETF = row({ name: 'ETF Bond Euro', ticker: 'BEUR', profileTicker: 'BEUR.MI', type: 'etf', assetClass: 'bonds', valueEur: 10000 });
const SHORT_ETF = row({ name: 'ETF Bond Breve', ticker: 'BBRV', profileTicker: 'BBRV.MI', type: 'etf', assetClass: 'bonds', valueEur: 4000, role: 'frozen' });
const WORLD_ETF = row({ name: 'ETF Mondo', ticker: 'MONDO.MI', profileTicker: 'MONDO.MI', type: 'etf', assetClass: 'equity', valueEur: 12000 });
const BOND_FUND = row({ name: 'Fondo Obbligazionario', type: 'fund', assetClass: 'bonds', valueEur: 3000 });
const DEPOSIT = row({ name: 'Conto deposito', type: 'cash', assetClass: 'bonds', valueEur: 8000 });
const SOLD = row({ name: 'BTP venduto', type: 'bond', assetClass: 'bonds', valueEur: 0, maturityIso: '2027-01-01' });

const COUPON: AssistantCouponFact = { assetName: 'BTP Esempio 2030', annualRatePct: 3, frequency: 'semestrale', maturityIso: '2030-03-01', nextCouponIso: '2027-03-01', indexation: null, nextCouponPerUnitEur: 0.015 };

describe('selectBondHoldings', () => {
  it('takes a single by TYPE, a fund by CLASS, and leaves out an account in the class, a sold-out row and an equity ETF', () => {
    const { singles, funds } = selectBondHoldings([WORLD_ETF, BTP, BOND_ETF, BOND_FUND, DEPOSIT, SOLD]);
    expect(singles.map((r) => r.name)).toEqual(['BTP Esempio 2030']);
    expect(funds.map((r) => r.name)).toEqual(['ETF Bond Euro', 'Fondo Obbligazionario']);
  });
});

describe('yearsBetweenIso', () => {
  it('counts years on a 365,25-day year, negative past the date, null on a broken day', () => {
    expect(yearsBetweenIso('2026-10-20', '2030-03-01')).toBeCloseTo(1228 / 365.25, 6);
    expect(yearsBetweenIso('2026-10-20', '2026-01-01')).toBeLessThan(0);
    expect(yearsBetweenIso('2026-10-20', 'mai')).toBeNull();
  });
});

describe('formatBondTermsBlock', () => {
  const base = { coupons: [COUPON], todayIso: '2026-10-20' };

  it('says in one sentence when nothing of the bond part is held', () => {
    expect(formatBondTermsBlock({ ...base, holdings: [WORLD_ETF, SOLD] })).toEqual([`--- ${BOND_TERMS_HEADER} ---`, 'Nessun titolo né ETF obbligazionario in portafoglio.']);
  });

  // Yahoo's bondHoldings proved wrong on real ETFs (an inflation-linked fund at 1,08 years of duration, a 1-3 year
  // fund at 9,8 years of average maturity): the block prints no duration, the search verifies it (owner, 2026-11-20).
  // Mutation that turns it red: the fund line carrying a duration again.
  it('prints a single with its maturity, the years to it, the coupon the registry knows and its role; a fund with its value and role only', () => {
    const lines = formatBondTermsBlock({ ...base, holdings: [BTP, BOND_ETF] });
    expect(lines[0]).toBe(`--- ${BOND_TERMS_HEADER} (1 titolo, 1 ETF o fondo; le scadenze degli obiettivi sono nelle risposte del percorso) ---`);
    expect(lines[1]).toBe('Titoli singoli:');
    expect(lines[2]).toBe(`- BTP Esempio 2030: scade il 2030-03-01 (3,4 anni), cedola 3,00% semestrale, valore ${eur(5000)}, negoziabile`);
    expect(lines[3]).toBe(BOND_FUNDS_LINE);
    expect(BOND_FUNDS_LINE).toBe('ETF e fondi obbligazionari (nessuna duration qui: la verifica il secondo agente con la ricerca web, e nessuno ne scrive una in numeri prima):');
    expect(lines[4]).toBe(`- ETF Bond Euro (BEUR): valore ${eur(10000)}, negoziabile`);
    expect(lines).toHaveLength(5);
  });

  it('names a maturity not recorded; a fund never reads «duration»', () => {
    const noMaturity = row({ ...BTP, name: 'Bond senza scadenza', maturityIso: undefined });
    const read = formatBondTermsBlock({ ...base, coupons: [], holdings: [noMaturity, SHORT_ETF, BOND_FUND] });
    expect(read[2]).toBe(`- Bond senza scadenza: scadenza non registrata, valore ${eur(5000)}, negoziabile`);
    expect(read[4]).toBe(`- ETF Bond Breve (BBRV): valore ${eur(4000)}, non negoziabile`);
    expect(read[5]).toBe(`- Fondo Obbligazionario: valore ${eur(3000)}, negoziabile`);
    expect(read.slice(4).join(' ')).not.toMatch(/duration/);
  });

  it('a bond past its date reads «scaduto»; a BTP Italia carries its indexation', () => {
    const expired = row({ ...BTP, name: 'BTP scaduto', maturityIso: '2026-01-01' });
    const italia: AssistantCouponFact = { ...COUPON, assetName: 'BTP scaduto', annualRatePct: null, indexation: 'BTP Italia: somma il FOI alla cedola' };
    const lines = formatBondTermsBlock({ ...base, coupons: [italia], holdings: [expired] });
    expect(lines[2]).toBe(`- BTP scaduto: scade il 2026-01-01 (scaduto), cedola semestrale, BTP Italia: somma il FOI alla cedola, valore ${eur(5000)}, negoziabile`);
  });
});
