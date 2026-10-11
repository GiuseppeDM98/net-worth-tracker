/**
 * ISIN → Yahoo Finance symbol, for the brokers that publish only an ISIN.
 *
 * WHY THIS EXISTS. Yahoo quotes neither a real ISIN nor the pseudo-ISINs brokers assign to
 * crypto, and the exchange suffix is not in the broker payload, so it cannot be derived — a symbol
 * has to be known. That is why every broker bridge here is stuck behind a table, and why an
 * imported position with no entry is created with the ISIN as its ticker and stays unquotable.
 *
 * Only FUND entries belong here. A single stock's listing is the broker account's own business and
 * its own table (`TR_YAHOO_TICKER_BY_ISIN` in `tradeRepublicImport.ts`, which holds that account's
 * positions); a UCITS ETF's identity is a public fact both brokers need, so lifting it here is what
 * stops the two bridges from drifting apart.
 *
 * A MISSING ENTRY IS SAFE, and that is the property to preserve when adding one:
 *   - the resolver returns `null` and the caller keeps the ISIN, which is exactly where it was;
 *   - on a broker-fed position (`autoUpdatePrice: false`) a wrong symbol cannot move a price, so a
 *     bad entry costs one failed lookup, never a wrong number in the portfolio.
 * On a broker that DOES auto-update prices from Yahoo, a wrong entry would put a wrong price on a
 * real asset. So nothing here is written from memory: an entry appears only once its quote has been
 * verified to exist against Yahoo.
 */

/** The ISIN's own country block for crypto, which carries the coin code (see `XF000BTC0017`). */
const CRYPTO_ISIN_PREFIX = 'XF000';

/**
 * The ETFs a European broker sells, keyed by ISIN. The symbol is a full Yahoo symbol including its
 * exchange suffix: the suffix cannot be derived, and guessing one is how a real asset ends up priced
 * off an unrelated listing.
 *
 * EVERY ROW HERE IS MEASURED, and the measurement is reproducible: `search(isin)` names the fund and
 * `quoteSummary(symbol, { modules: ['price'] }).longName` names what that symbol actually quotes, and
 * the two must be the same fund. The table this replaces was written from memory and was wrong on
 * 10 of its 33 rows — `IE00B4JNQZ49` filed as Vanguard All-World is iShares S&P 500 Financials,
 * `IE00B4L5Y983`'s neighbour `IE00BFY0GT14` filed as «Invesco MSCI World» pointed at iShares' own
 * fund, `LU1681048804` filed as «Amundi Prime USA» pointed at a euro government bond fund — and seven
 * ISINs were not funds at all, so nobody could ever check them. A wrong entry is worse than a
 * missing one, which is why the seven unverifiable keys are GONE rather than kept with a guess.
 */
export const YAHOO_SYMBOL_BY_ISIN: Readonly<Record<string, string>> = {
  // Global
  IE00BK5BQT80: 'VWCE.MI', // Vanguard FTSE All-World
  IE00B4L5Y983: 'SWDA.MI', // iShares Core MSCI World
  IE00BD4TXV59: 'UETW.DE', // UBS Core MSCI World USD Acc (Xetra; same fund on every listing)
  IE00BF4RFH31: 'IUSN.DE', // iShares MSCI World Small Cap USD Acc (Xetra EUR listing of WSML)
  IE00BFY0GT14: 'SWRD.L',  // State Street SPDR MSCI World
  IE00B3RBWM25: 'VHYL.MI', // Vanguard FTSE All-World High Dividend Yield
  LU0274208692: 'DBXW.DE', // Xtrackers MSCI World Swap
  LU1681043599: 'CW8.PA',  // Amundi MSCI World Swap
  LU1829220216: 'ACWI.PA', // Amundi MSCI All Country World Swap

  // North America
  IE00B5BMR087: 'CSSPX.MI', // iShares Core S&P 500
  IE00B3XXRP09: 'VUSA.MI',  // Vanguard S&P 500
  IE00BFMXXD54: 'VUAA.MI',  // Vanguard S&P 500
  IE00B53SZB19: 'CSNDX.MI', // iShares Nasdaq 100
  LU1681048804: '500.PA',   // Amundi S&P 500 Swap
  IE00B4JNQZ49: 'IUFS.L',  // iShares S&P 500 Financials Sector
  IE00B3WJKG14: 'IUIT.L',  // iShares S&P 500 Information Technology Sector

  // Europe
  LU0274211217: 'XESC.DE',  // Xtrackers Euro Stoxx 50
  LU0908500753: 'MEUD.PA',  // Amundi Core Stoxx Europe 600
  IE00B3VTMJ91: 'CBE3.L',   // iShares € Govt Bond 1-3yr
  IE00B14X4Q57: 'IBGS.AS',  // iShares € Govt Bond 1-3yr

  // Emerging Markets
  IE00BKM4GZ66: 'EIMI.MI',  // iShares Core MSCI EM IMI
  IE00B469F816: 'EMRD.L',   // State Street SPDR MSCI Emerging Markets
  IE00BTJRMP35: 'XMME.DE',  // Xtrackers MSCI Emerging Markets
  LU1681045370: 'AEEM.PA',  // Amundi MSCI Emerging Markets Swap

  // Asia Pacific
  IE00B42Z5J44: 'IJPE.L',   // iShares MSCI Japan EUR Hedged
  IE00B52MJY50: 'CSPXJ.SW', // iShares Core MSCI Pacific ex-Japan
  LU0328474803: 'XAUS.L',   // Xtrackers S&P/ASX 200

  // Thematic — one industry, so its area is its positions', not a region
  IE000M7V94E1: 'NUKL.DE',  // VanEck Uranium & Nuclear
};

/** ISIN = 2 letters then 10 alphanumerics. Anything else is not an ISIN, and Yahoo quotes it as is. */
const ISIN_SHAPE = /^[A-Z]{2}[A-Z0-9]{10}$/;

/**
 * Whether a stored `ticker` is in fact an ISIN a broker left behind, rather than a symbol Yahoo can
 * quote. The one place this shape is written down: the resolver below and the exposure service both
 * ask it, and three copies of a regex that decides «does this asset exist for Yahoo» is how one of
 * them ends up disagreeing with the other.
 */
export function isIsinShaped(value: string | null | undefined): boolean {
  return !!value?.trim() && ISIN_SHAPE.test(value.trim().toUpperCase());
}

/**
 * Resolves an asset's ticker to a quotable Yahoo Finance symbol if it is stored as an ISIN.
 * If ticker is already a standard symbol, returns it directly.
 */
export function resolveEffectiveYahooTicker(asset: { ticker: string; isin?: string | null }): string {
  if (asset.ticker && !isIsinShaped(asset.ticker)) {
    return asset.ticker.trim();
  }
  const isin = (asset.isin || asset.ticker).trim().toUpperCase();
  const fundSymbol = resolveYahooSymbolForIsin(isin);
  if (fundSymbol) return fundSymbol;
  return asset.ticker;
}

/**
 * An ISIN this repository once mapped to a symbol that belonged to a DIFFERENT fund.
 *
 * `tradeRepublicImport.ts` paired `IE00B3VTMJ91` with `SWDA.MI` and called it «iShares Core MSCI
 * World». OpenFIGI says otherwise on both counts: that ISIN is ISHARES EURO GOVT BOND 1-3Y (German
 * ticker `SXRN`), and `SWDA` is the London/Milan listing of ISHARES CORE MSCI WORLD — whose ISIN is
 * `IE00B4L5Y983`. Two ISINs cannot be one fund, so the old row would have put a world-equity price
 * on a euro-government-bond position.
 *
 * The correct rows are in the table above and the bad one is gone. Kept as a record because the
 * same ISIN appears in `geographicAreas.ts` and in import fixtures, and a reader who finds one of
 * them needs to know the pairing was checked rather than assumed.
 *
 * `measuredName` names the fund, not a ticker: the German listing this pair used to assert (`SXRN`)
 * no longer exists on Yahoo, so a reader who took it for a quotable symbol would be wrong again.
 */
export const CORRECTED_ISIN_PAIRS: Readonly<Record<string, { wasSymbol: string; wasClaimedName: string; measuredName: string; correctIsinForOldSymbol: string }>> = {
  IE00B3VTMJ91: {
    wasSymbol: 'SWDA.MI',
    wasClaimedName: 'iShares Core MSCI World',
    measuredName: 'ISHARES EURO GOVT BOND 1-3Y',
    correctIsinForOldSymbol: 'IE00B4L5Y983',
  },
};

/**
 * The Yahoo symbol for a broker position, or `null` when this catalogue does not know it.
 *
 * Crypto is NOT handled here: its pseudo-ISIN carries the coin code, and which pair to trade is the
 * broker's decision (Trade Republic prices `BTC-EUR`, another broker would not). A caller that knows
 * its crypto convention derives it before asking this function.
 */
export function resolveYahooSymbolForIsin(isin: string | null | undefined): string | null {
  const key = isin?.trim().toUpperCase();
  if (!key) return null;
  if (key.startsWith(CRYPTO_ISIN_PREFIX)) return null;
  return YAHOO_SYMBOL_BY_ISIN[key] ?? null;
}

/** Whether an ISIN is one of the recorded corrections — for a preview that says so out loud. */
export function isCorrectedIsin(isin: string | null | undefined): boolean {
  const key = isin?.trim().toUpperCase();
  return !!key && key in CORRECTED_ISIN_PAIRS;
}
