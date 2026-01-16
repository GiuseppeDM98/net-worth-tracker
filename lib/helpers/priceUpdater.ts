import { adminDb } from '@/lib/firebase/admin';
import {
  getMultipleQuotes,
  shouldUpdatePrice,
} from '@/lib/services/yahooFinanceService';

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

    // Extract unique tickers
    const tickers = [
      ...new Set(updatableAssets.map((asset: any) => asset.ticker)),
    ];

    // Fetch quotes from Yahoo Finance
    const quotes = await getMultipleQuotes(tickers);

    // Update asset prices using Admin SDK
    const updated: string[] = [];
    const failed: string[] = [];

    for (const asset of updatableAssets) {
      const quote = quotes.get((asset as any).ticker);

      if (quote && quote.price !== null && quote.price > 0) {
        try {
          const assetRef = adminDb.collection('assets').doc((asset as any).id);
          await assetRef.update({
            currentPrice: quote.price,
            lastPriceUpdate: new Date(),
            updatedAt: new Date(),
          });
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
