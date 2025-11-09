import { NextRequest, NextResponse } from 'next/server';
import { getAllAssets, updateAssetPrice } from '@/lib/services/assetService';
import {
  getMultipleQuotes,
  shouldUpdatePrice,
} from '@/lib/services/yahooFinanceService';

export async function POST(request: NextRequest) {
  try {
    // Get user ID from request (you'll need to implement auth middleware)
    const body = await request.json();
    const { userId, assetIds } = body;

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 401 }
      );
    }

    // Get all assets or filtered by assetIds
    const allAssets = await getAllAssets(userId);
    const assetsToUpdate = assetIds
      ? allAssets.filter((asset) => assetIds.includes(asset.id))
      : allAssets;

    // Filter assets that need price updates
    const updatableAssets = assetsToUpdate.filter((asset) =>
      shouldUpdatePrice(asset.type, asset.subCategory)
    );

    if (updatableAssets.length === 0) {
      return NextResponse.json({
        updated: 0,
        failed: [],
        message: 'No assets require price updates',
      });
    }

    // Extract unique tickers
    const tickers = [...new Set(updatableAssets.map((asset) => asset.ticker))];

    // Fetch quotes from Yahoo Finance
    const quotes = await getMultipleQuotes(tickers);

    // Update asset prices
    const updated: string[] = [];
    const failed: string[] = [];

    for (const asset of updatableAssets) {
      const quote = quotes.get(asset.ticker);

      if (quote && quote.price !== null && quote.price > 0) {
        try {
          await updateAssetPrice(asset.id, quote.price);
          updated.push(asset.ticker);
        } catch (error) {
          console.error(`Failed to update ${asset.ticker}:`, error);
          failed.push(asset.ticker);
        }
      } else {
        failed.push(asset.ticker);
      }
    }

    return NextResponse.json({
      updated: updated.length,
      failed,
      message: `Updated ${updated.length} assets, ${failed.length} failed`,
    });
  } catch (error) {
    console.error('Error updating prices:', error);
    return NextResponse.json(
      { error: 'Failed to update prices' },
      { status: 500 }
    );
  }
}
