import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import {
  getMultipleQuotes,
  shouldUpdatePrice,
} from '@/lib/services/yahooFinanceService';

export async function POST(request: NextRequest) {
  try {
    // Get user ID from request
    const body = await request.json();
    const { userId, assetIds } = body;

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 401 }
      );
    }

    // Get all assets using Firebase Admin SDK
    const assetsRef = adminDb.collection('assets');
    const snapshot = await assetsRef.where('userId', '==', userId).get();

    if (snapshot.empty) {
      return NextResponse.json({
        updated: 0,
        failed: [],
        message: 'No assets found',
      });
    }

    const allAssets = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Filter by assetIds if provided
    const assetsToUpdate = assetIds
      ? allAssets.filter((asset: any) => assetIds.includes(asset.id))
      : allAssets;

    // Filter assets that need price updates
    const updatableAssets = assetsToUpdate.filter((asset: any) =>
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

    return NextResponse.json({
      updated: updated.length,
      failed,
      message: `Updated ${updated.length} assets, ${failed.length} failed`,
    });
  } catch (error) {
    console.error('Error updating prices:', error);
    return NextResponse.json(
      { error: 'Failed to update prices', details: (error as Error).message },
      { status: 500 }
    );
  }
}
