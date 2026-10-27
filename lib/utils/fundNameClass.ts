/**
 * The class a broker file's fund NAME suggests — the last word on a fund's class when the market
 * said nothing (no published mix, no identity).
 *
 * WHY. The two file bridges (Azimut, Intesa) name a fund and often print no code for it; when
 * Yahoo publishes no mix, the name is all there is. The import does NOT stop to ask (2026-10-27,
 * the owner's call): it writes the name's class, the preview row says which rows were guessed, and
 * the correction lives on Patrimonio — the same contract the Scalable and Trade Republic bridges
 * keep with `typeUncertain`.
 *
 * ONE keyword list for both bridges, so a fund is not equity on Azimut and bonds on Intesa. The
 * order matters: a cash-like or bond word wins over a market word («EMERGING MARKETS DEBT» is a
 * bond fund), and a defensive multi-asset fund is placed with bonds, its largest sleeve. A name
 * with no keyword is `equity` and `uncertain` — the least wrong default, flagged in the preview.
 */
import type { AssetClass } from '@/types/assets';

export interface FundNameClass {
  assetClass: AssetClass;
  /** No keyword decided: `equity` is the default, and the preview says so. */
  uncertain: boolean;
}

function normalized(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A WORD matches whole («US» is not «USD»); a STEM matches any word it starts («AZION» is
 * «AZIONARIO», «OBBLIG» is «OBBLIGAZIONARIO»).
 */
function keywords(words: string[], stems: string[] = []): RegExp {
  const alternatives = [...words.map((word) => `${word}\\b`), ...stems];
  return new RegExp(`\\b(?:${alternatives.join('|')})`);
}

const RULES: readonly { pattern: RegExp; assetClass: AssetClass }[] = [
  { pattern: keywords(['BITCOIN', 'CRYPTO'], ['BITC']), assetClass: 'crypto' },
  { pattern: keywords(['GOLD', 'SILVER', 'COPPER', 'WHEAT', 'ORO'], ['COMMODIT']), assetClass: 'commodity' },
  { pattern: keywords(['EONIA', 'CASH', 'SHORT TERM'], ['MONETAR', 'LIQUID']), assetClass: 'bonds' },
  { pattern: keywords(['BOND', 'BONDS', 'TESORERIA', 'CREDIT', 'DEBT'], ['OBBLIG']), assetClass: 'bonds' },
  { pattern: keywords(['DEFENSIVE', 'CONSERVATIVE'], ['DIFENSIV', 'CONSERVATIV', 'PRUDEN']), assetClass: 'bonds' },
  {
    pattern: keywords(
      ['EQUITY', 'EQUITIES', 'WORLD', 'EUROPEAN', 'US', 'EMERGING', 'DAX', 'DIVIDEND', 'BRANDS', 'VALUE', 'GROWTH'],
      ['AZION', 'STAR MARK']
    ),
    assetClass: 'equity',
  },
  { pattern: keywords(['REAL ESTATE'], ['IMMOBIL']), assetClass: 'realestate' },
];

export function inferFundClassFromName(name: string): FundNameClass {
  const n = normalized(name);
  for (const { pattern, assetClass } of RULES) {
    if (pattern.test(n)) return { assetClass, uncertain: false };
  }
  return { assetClass: 'equity', uncertain: true };
}
