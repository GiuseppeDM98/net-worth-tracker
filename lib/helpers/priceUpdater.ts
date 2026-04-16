import { adminDb } from '@/lib/firebase/admin';
import {
  getMultipleQuotes,
  getQuote,
  shouldUpdatePrice,
} from '@/lib/services/yahooFinanceService';
import { getBondPriceByIsin } from '@/lib/services/borsaItalianaBondScraperService';
import { convertToEur } from '@/lib/services/currencyConversionService';

export interface PriceUpdateResult {
  updated: number;
  failed: string[];
  message: string;
}

/**
 * Update prices for all assets of a user
 *
 * This is called before creating snapshots to ensure fresh market data.
 * Uses two-level filtering:
 * 1. Asset type capability (e.g., stocks/ETFs support updates; cash/real estate don't)
 * 2. User preference (autoUpdatePrice flag allows per-asset control)
 *
 * @param userId - User ID to update assets for
 * @returns Update result with count of successful and failed updates
 */
export async function updateUserAssetPrices(
  userId: string
): Promise<PriceUpdateResult> {
  try {
    // Get all assets using Firebase Admin SDK
    const assetsRef = adminDb.collection('assets');
    const snapshot = await assetsRef.where('userId', '==', userId).get();

    if (snapshot.empty) {
      return {
        updated: 0,
        failed: [],
        message: 'No assets found',
      };
    }

    const allAssets = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Filter assets that need price updates
    // Two-level filtering ensures both capability and user intent:
    // 1. Type capability: Can this asset type be updated? (stocks: yes, cash: no)
    // 2. User preference: Does the user want auto-updates for this specific asset?
    const updatableAssets = allAssets.filter((asset: any) => {
      // First check if the asset type supports price updates (e.g., not cash, realestate)
      // This is type-level filtering: certain asset classes don't have market prices
      const typeSupportsUpdate = shouldUpdatePrice(asset.type, asset.subCategory);

      // Then check if the user wants automatic updates for this specific asset
      // Default to true if undefined for backwards compatibility (assets created before this flag existed)
      // This allows users to disable auto-updates for specific assets even if type supports it
      const wantsAutoUpdate = asset.autoUpdatePrice !== false;

      return typeSupportsUpdate && wantsAutoUpdate;
    });

    if (updatableAssets.length === 0) {
      return {
        updated: 0,
        failed: [],
        message: 'No assets require price updates',
      };
    }

    // Separate bonds with ISIN for Borsa Italiana scraping
    const bondsWithIsin = updatableAssets.filter((asset: any) =>
      asset.type === 'bond' &&
      asset.assetClass === 'bonds' &&
      asset.isin &&
      asset.isin.trim().length > 0
    );

    const otherAssets = updatableAssets.filter((asset: any) =>
      !(asset.type === 'bond' && asset.assetClass === 'bonds' && asset.isin)
    );

    console.log(`[Price Update] Bonds with ISIN: ${bondsWithIsin.length}`);
    console.log(`[Price Update] Other assets: ${otherAssets.length}`);

    // Track results
    const updated: string[] = [];
    const failed: string[] = [];

    // Process bonds via Borsa Italiana scraper (with Yahoo Finance fallback)
    for (const bond of bondsWithIsin) {
      try {
        console.log(`[Bond Update] Processing ${(bond as any).ticker} (ISIN: ${(bond as any).isin})`);

        // Try Borsa Italiana scraper first
        const bondPrice = await getBondPriceByIsin((bond as any).isin);

        if (bondPrice && bondPrice.price && bondPrice.price > 0) {
          // Bond prices from Borsa Italiana are quoted as % of par (e.g. 104.2 = 104.2%).
          // If nominalValue is set, convert to actual EUR per unit so that
          // totalValue = currentPrice × quantity is correct.
          // Example: 104.2% × €1,000 nominalValue = €1,042 per lot
          const nominalValue = (bond as any).bondDetails?.nominalValue;
          const adjustedPrice = nominalValue && nominalValue > 1
            ? bondPrice.price * (nominalValue / 100)
            : bondPrice.price;

          const assetRef = adminDb.collection('assets').doc((bond as any).id);
          await assetRef.update({
            currentPrice: adjustedPrice,
            lastPriceUpdate: new Date(),
            updatedAt: new Date(),
          });
          updated.push(`${(bond as any).ticker} (BI-${bondPrice.priceType})`);
          console.log(`[Bond Update] ${(bond as any).ticker}: Updated from Borsa Italiana (${bondPrice.priceType}): ${bondPrice.price}% → €${adjustedPrice}`);
        } else {
          // Fallback to Yahoo Finance
          console.log(`[Bond Update] ${(bond as any).ticker}: Borsa Italiana returned null, falling back to Yahoo Finance`);
          const quote = await getQuote((bond as any).ticker);

          if (quote && quote.price !== null && quote.price > 0) {
            // Same % → EUR conversion for Yahoo Finance fallback
            const nominalValue = (bond as any).bondDetails?.nominalValue;
            const adjustedPrice = nominalValue && nominalValue > 1
              ? quote.price * (nominalValue / 100)
              : quote.price;

            const assetRef = adminDb.collection('assets').doc((bond as any).id);
            await assetRef.update({
              currentPrice: adjustedPrice,
              lastPriceUpdate: new Date(),
              updatedAt: new Date(),
            });
            updated.push(`${(bond as any).ticker} (YF-fallback)`);
            console.log(`[Bond Update] ${(bond as any).ticker}: Updated from Yahoo Finance fallback: ${quote.price}% → €${adjustedPrice}`);
          } else {
            failed.push((bond as any).ticker);
            console.warn(`[Bond Update] ${(bond as any).ticker}: Both Borsa Italiana and Yahoo Finance failed`);
          }
        }
      } catch (error) {
        console.error(`[Bond Update] Error updating ${(bond as any).ticker}:`, error);
        failed.push((bond as any).ticker);
      }
    }

    // Extract unique tickers for other assets
    const tickers = [
      ...new Set(otherAssets.map((asset: any) => asset.ticker)),
    ];

    // Fetch quotes from Yahoo Finance
    const quotes = await getMultipleQuotes(tickers);

    // Update asset prices using Admin SDK (for non-bond assets)
    for (const asset of otherAssets) {
      const quote = quotes.get((asset as any).ticker);

      if (quote && quote.price !== null && quote.price > 0) {
        try {
          const assetRef = adminDb.collection('assets').doc((asset as any).id);

          // Build the update payload. Always write price and currency from Yahoo.
          // For non-EUR assets, also convert to EUR so that calculateAssetValue()
          // can return a correct EUR total without async FX calls at read time.

          // Yahoo Finance returns LSE prices in GBp (pence), not GBP (pounds).
          // Normalize to GBP by dividing by 100 so the FX conversion and stored
          // price are in the correct unit (e.g. SWDA.L: 4874 GBp → 48.74 GBP).
          const isGBp = quote.currency === 'GBp';
          const normalizedPrice = isGBp ? quote.price / 100 : quote.price;
          const normalizedCurrency = isGBp ? 'GBP' : quote.currency;

          const updatePayload: Record<string, unknown> = {
            currentPrice: normalizedPrice,
            currency: normalizedCurrency,
            lastPriceUpdate: new Date(),
            updatedAt: new Date(),
          };

          if (normalizedCurrency && normalizedCurrency.toUpperCase() !== 'EUR') {
            try {
              updatePayload.currentPriceEur = await convertToEur(normalizedPrice, normalizedCurrency);
            } catch (fxError) {
              // FX conversion failure must not abort the price update.
              // The stale or missing currentPriceEur means the portfolio total
              // will fall back to the native price, which is wrong but recoverable
              // on the next successful price update.
              console.warn(`[Price Update] FX conversion failed for ${(asset as any).ticker} (${normalizedCurrency}→EUR):`, fxError);
            }
          }

          await assetRef.update(updatePayload);
          updated.push((asset as any).ticker);
        } catch (error) {
          console.error(`Failed to update ${(asset as any).ticker}:`, error);
          failed.push((asset as any).ticker);
        }
      } else {
        failed.push((asset as any).ticker);
      }
    }

    return {
      updated: updated.length,
      failed,
      message: `Updated ${updated.length} assets, ${failed.length} failed`,
    };
  } catch (error) {
    console.error('Error updating prices:', error);
    throw new Error('Failed to update asset prices');
  }
}
