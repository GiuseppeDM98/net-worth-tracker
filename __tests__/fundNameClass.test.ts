import { describe, expect, it } from 'vitest';
import { inferFundClassFromName } from '@/lib/utils/fundNameClass';

describe('inferFundClassFromName', () => {
  it('reads the class from a keyword', () => {
    expect(inferFundClassFromName('FIDELITY GLOBAL DIVIDEND "A" (EURHDG) ACC')).toEqual({
      assetClass: 'equity',
      uncertain: false,
    });
    expect(inferFundClassFromName('MORGAN STANLEY INVESTMENT FUNDS GLOBAL BRANDS "A" (USD) ACC')).toEqual({
      assetClass: 'equity',
      uncertain: false,
    });
    expect(inferFundClassFromName('T ROWE PRICE GLOBAL VALUE EQUITY "A" (EUR) ACC').assetClass).toBe('equity');
    expect(inferFundClassFromName('Fondo Immobiliare Italia').assetClass).toBe('realestate');
    expect(inferFundClassFromName('WisdomTree Physical Gold').assetClass).toBe('commodity');
  });

  it('matches a stem at the start of a longer word', () => {
    expect(inferFundClassFromName('Fondo Azionario Europa').assetClass).toBe('equity');
    expect(inferFundClassFromName('Fondo Obbligazionario Euro').assetClass).toBe('bonds');
  });

  it('places a defensive multi-asset fund with bonds, its largest sleeve', () => {
    expect(
      inferFundClassFromName('FIDELITY FUNDS GLOBAL MULTI ASSET DEFENSIVE FUND "A" (EUR) ACC')
    ).toEqual({ assetClass: 'bonds', uncertain: false });
    expect(inferFundClassFromName('Eurizon Profilo Prudente').assetClass).toBe('bonds');
  });

  it('lets a bond word win over a market word', () => {
    expect(inferFundClassFromName('Emerging Markets Debt Fund').assetClass).toBe('bonds');
    expect(inferFundClassFromName('European High Yield Bond').assetClass).toBe('bonds');
  });

  it('matches whole words only: USD is not US', () => {
    expect(inferFundClassFromName('WT SHT USD LONG EUR (USEU IM) EUR')).toEqual({
      assetClass: 'equity',
      uncertain: true,
    });
  });

  it('defaults to equity and says it guessed', () => {
    expect(inferFundClassFromName('R-CO VALOR "C" (EUR) ACC')).toEqual({ assetClass: 'equity', uncertain: true });
  });
});
