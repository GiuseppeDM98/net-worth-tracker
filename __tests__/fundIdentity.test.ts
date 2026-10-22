/**
 * `lib/utils/fundIdentity.ts` — the ONE judgement on «is this EODHD hit the fund the broker named?».
 *
 * Every candidate list below is a RECORDING of EODHD's real Search answer on 2026-10-22
 * (`GET /api/search/{product name}?type=fund&limit=20`), trimmed to the rows that matter. The
 * names on the left are the Azimut «Gestito» products as the export writes them: no ISIN, no
 * ticker, nothing but the name.
 */
import { describe, expect, it } from 'vitest';
import {
  buildFundIdentityQuery,
  matchFundIdentity,
  normalizeFundName,
  parseFundName,
  sameFundName,
  type EodhdFundHit,
} from '@/lib/utils/fundIdentity';

function hit(name: string, isin: string | null, currency = 'EUR'): EodhdFundHit {
  return { Name: name, ISIN: isin, Currency: currency, Type: 'FUND', Exchange: 'EUFUND' };
}

const FIDELITY_MULTI_ASSET: EodhdFundHit[] = [
  hit('Fidelity Funds - Global Multi Asset Tactical Defensive Fund A-Acc-EUR', 'LU0393653166'),
  hit('Fidelity Funds - Global Multi Asset Tactical Defensive Fund E-Acc-EUR', 'LU0393653240'),
  hit('Fidelity Funds - Global Multi Asset Tactical Defensive Fund A-DIST-EUR', 'LU0413543991'),
  hit('Fidelity Funds - Global Multi Asset Defensive Fund Y-Acc-EUR', 'LU1261431925'),
  hit('Fidelity Funds - Global Multi Asset Defensive Fund Y-Acc-GBP (GBP/Euro hedged)', 'LU1261431842', 'GBP'),
  hit('Fidelity Funds - Global Multi Asset Defensive Fund Vermoegensverwaltung def A - Euro', 'LU1355508844'),
  hit('Fidelity Funds - Global Multi Asset Defensive Fund I-Acc-EUR', 'LU2458293888'),
  hit('Fidelity Funds - Global Multi Asset Defensive Fund B1-Acc-EUR', null),
];

const FIDELITY_GLOBAL_DIVIDEND: EodhdFundHit[] = [
  hit('Fidelity Global Dividend A-MINCOME(G)-AUD (hedged)', 'LU0982800491', 'AUD'),
  hit('Fidelity Global Dividend A-MINCOME(G)-USD', 'LU0731783048', 'USD'),
  hit('Fidelity Funds - Global Dividend Fund W-Acc-GBP', 'LU1033663052', 'GBP'),
  hit('Fidelity Funds - Global Dividend Fund A-Acc-EUR (hedged)', 'LU0605515377'),
  hit('Fidelity Funds - Global Dividend Fund A-Acc-EUR', 'LU1261431768'),
  hit('Fidelity Funds - Global Dividend Fund A-MINCOME(G)-EUR', 'LU0731782826'),
  hit('Fidelity Funds - Global Dividend Fund A-Acc-USD', 'LU0772969993', 'USD'),
  hit('Fidelity Funds - Global Dividend Plus Fund A-Acc-EUR', 'LU0261951957'),
];

const MORGAN_STANLEY_GLOBAL_BRANDS: EodhdFundHit[] = [
  hit('Morgan Stanley Investment Funds - Global Brands Fund AX', 'LU0239683559', 'USD'),
  hit('Morgan Stanley Investment Funds - Global Brands Fund A (USD)', 'LU0119620416', 'USD'),
  hit('Morgan Stanley Investment Funds - Global Brands Fund Z', 'LU0360482987', 'USD'),
  hit('Morgan Stanley Investment Funds - Global Brands Fund B', 'LU0119620507', 'USD'),
  hit('Morgan Stanley Investment Funds - Global Brands Fund AH (EUR)', 'LU0335216932'),
  hit('Morgan Stanley Investment Funds - Global Brands Fund A (EUR)', 'LU2295319300'),
  hit('Morgan Stanley Investment Funds Global Brands Equity Income Fund ZHR (CHF)', 'LU1487746502', 'CHF'),
];

const R_CO_VALOR: EodhdFundHit[] = [
  hit('R-CO VALOR-P EUR', 'FR0011847409'),
  hit('R-co Valor F EUR', 'FR0011261197'),
  hit('R-co Valor F EUR', 'FR0011261197'),
  hit('R-co Valor Balanced C EUR', 'FR0013367265'),
  hit('R-co Valor C EUR', 'FR0011253624'),
  hit('R-co Valor D EUR', 'FR0011261189'),
  hit('R-co Valor PB EUR', 'FR0013123544'),
  hit('R-co Valor 4Change Global Equity F EUR', 'FR00140019Q7'),
  hit('R-co Lux Valor P EUR', 'LU1303789199'),
  hit('R-co Valor R EUR', null),
];

describe('parseFundName', () => {
  it('separates strategy, share class, currency and accumulation', () => {
    const parts = parseFundName('MORGAN STANLEY INVESTMENT FUNDS GLOBAL BRANDS "A" (USD) ACC');
    expect([...parts.strategy]).toEqual(['MORGAN', 'STANLEY', 'INVESTMENT', 'GLOBAL', 'BRANDS']);
    expect(parts.shareClass).toBe('A');
    expect(parts.currency).toBe('USD');
    expect(parts.accDist).toBe('acc');
    expect(parts.hedged).toBe(false);
  });

  it('reads EURHDG as both a hedge and the currency it hedges into', () => {
    const parts = parseFundName('FIDELITY GLOBAL DIVIDEND "A" (EURHDG) ACC');
    expect(parts.currency).toBe('EUR');
    expect(parts.hedged).toBe(true);
    expect(parts.shareClass).toBe('A');
  });

  it('looks past the wrapper word: «Fund»/«Funds» do not separate two names', () => {
    expect(
      sameFundName(
        'MORGAN STANLEY INVESTMENT FUNDS GLOBAL BRANDS "A" (USD) ACC',
        'Morgan Stanley Investment Funds - Global Brands Fund A (USD)'
      )
    ).toBe(true);
  });
});

describe('sameFundName', () => {
  it('refuses a different strategy, class, currency or hedge', () => {
    const asked = 'FIDELITY FUNDS GLOBAL MULTI ASSET DEFENSIVE FUND "A" (EUR) ACC';
    expect(sameFundName(asked, 'Fidelity Funds - Global Multi Asset Tactical Defensive Fund A-Acc-EUR')).toBe(false);
    expect(sameFundName(asked, 'Fidelity Funds - Global Multi Asset Defensive Fund Y-Acc-EUR')).toBe(false);
    expect(sameFundName(asked, 'Fidelity Funds - Global Multi Asset Defensive Fund Y-Acc-GBP (GBP/Euro hedged)')).toBe(false);

    const hedged = 'FIDELITY GLOBAL DIVIDEND "A" (EURHDG) ACC';
    expect(sameFundName(hedged, 'Fidelity Funds - Global Dividend Fund A-Acc-EUR (hedged)')).toBe(true);
    expect(sameFundName(hedged, 'Fidelity Funds - Global Dividend Fund A-Acc-EUR')).toBe(false);
  });

  it('refuses an accumulator against a distributor', () => {
    const asked = 'FIDELITY GLOBAL DIVIDEND "A" (EURHDG) ACC';
    expect(sameFundName(asked, 'Fidelity Funds - Global Dividend Fund A-MINCOME(G)-EUR')).toBe(false);
  });
});

describe('matchFundIdentity', () => {
  it('finds the one share class of Morgan Stanley Global Brands', () => {
    const match = matchFundIdentity(
      'MORGAN STANLEY INVESTMENT FUNDS GLOBAL BRANDS "A" (USD) ACC',
      MORGAN_STANLEY_GLOBAL_BRANDS
    );
    expect(match.status).toBe('matched');
    expect(match.identity).toEqual({
      isin: 'LU0119620416',
      name: 'Morgan Stanley Investment Funds - Global Brands Fund A (USD)',
      currency: 'USD',
    });
  });

  it('finds R-CO Valor C and ignores the Balanced and 4Change families', () => {
    const match = matchFundIdentity('R-CO VALOR "C" (EUR) ACC', R_CO_VALOR);
    expect(match.status).toBe('matched');
    expect(match.identity?.isin).toBe('FR0011253624');
  });

  it('finds the HEDGED class of Fidelity Global Dividend, not the plain one', () => {
    const match = matchFundIdentity('FIDELITY GLOBAL DIVIDEND "A" (EURHDG) ACC', FIDELITY_GLOBAL_DIVIDEND);
    expect(match.status).toBe('matched');
    expect(match.identity?.isin).toBe('LU0605515377');
  });

  it('answers «none» for Fidelity Multi Asset Defensive: EODHD lists only OTHER share classes', () => {
    // The product name says «Defensive A Acc EUR»; the A-Acc-EUR EODHD knows belongs to the
    // TACTICAL Defensive fund, and the plain Defensive fund is listed in Y, I and B1. Attaching
    // LU0393653166 would give the position another fund's price and class.
    const match = matchFundIdentity('FIDELITY FUNDS GLOBAL MULTI ASSET DEFENSIVE FUND "A" (EUR) ACC', FIDELITY_MULTI_ASSET);
    expect(match.status).toBe('none');
    expect(match.identity).toBeUndefined();
    expect(match.candidateCount).toBe(FIDELITY_MULTI_ASSET.length);
  });

  it('never returns a hit without an ISIN, and collapses a duplicated ISIN', () => {
    const match = matchFundIdentity('R-CO VALOR "C" (EUR) ACC', [
      hit('R-co Valor C EUR', null),
      hit('R-co Valor C EUR', 'FR0011253624'),
      hit('R-co Valor C EUR', 'FR0011253624'),
    ]);
    expect(match.status).toBe('matched');
    expect(match.identity?.isin).toBe('FR0011253624');
  });

  it('says «ambiguous» — never picks — when two share classes agree on everything', () => {
    const match = matchFundIdentity('R-CO VALOR "C" (EUR) ACC', [
      hit('R-co Valor C EUR', 'FR0011253624'),
      hit('R-co Valor C EUR', 'FR0099999999'),
    ]);
    expect(match.status).toBe('ambiguous');
    expect(match.identity).toBeUndefined();
  });

  it('answers «none» on an empty answer', () => {
    expect(matchFundIdentity('R-CO VALOR "C" (EUR) ACC', [])).toEqual({ status: 'none', candidateCount: 0 });
  });

  it('ignores a hit that is not a fund', () => {
    const match = matchFundIdentity('R-CO VALOR "C" (EUR) ACC', [
      { ...hit('R-co Valor C EUR', 'FR0011253624'), Type: 'ETF' },
    ]);
    expect(match.status).toBe('none');
  });
});

describe('buildFundIdentityQuery', () => {
  it('strips the share-class block, which EODHD would otherwise AND away', () => {
    // Measured on the live API (2026-10-22): the whole name answers 0 hits, this answers every class.
    expect(buildFundIdentityQuery('R-CO VALOR "C" (EUR) ACC')).toBe('R CO VALOR');
    expect(buildFundIdentityQuery('MORGAN STANLEY INVESTMENT FUNDS GLOBAL BRANDS "A" (USD) ACC')).toBe(
      'MORGAN STANLEY INVESTMENT FUNDS GLOBAL BRANDS'
    );
    expect(buildFundIdentityQuery('FIDELITY GLOBAL DIVIDEND "A" (EURHDG) ACC')).toBe('FIDELITY GLOBAL DIVIDEND');
    expect(buildFundIdentityQuery('BGF WORLD HEALTHSCIENCE "E2" (EUR) ACC')).toBe('BGF WORLD HEALTHSCIENCE');
  });

  it('keeps a name that has no share-class block whole', () => {
    expect(buildFundIdentityQuery('Fondo Interno')).toBe('FONDO INTERNO');
  });
});

describe('normalizeFundName', () => {
  it('is the cache key and the join between the preview and the plan', () => {
    expect(normalizeFundName('  R-CO   Valor "C" (EUR) ACC ')).toBe('R CO VALOR C EUR ACC');
    expect(normalizeFundName('R-CO Valor C (EUR) ACC')).toBe('R CO VALOR C EUR ACC');
  });
});
