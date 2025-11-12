import { collection, doc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { MonthlySnapshot } from '@/types/assets';

interface DummySnapshotParams {
  userId: string;
  initialNetWorth: number;
  monthlyGrowthRate: number; // Percentage (e.g., 3 for 3%)
  numberOfMonths: number;
}

interface DummyAsset {
  ticker: string;
  name: string;
  assetClass: string;
}

// Dummy assets to use in snapshots
const DUMMY_ASSETS: DummyAsset[] = [
  { ticker: 'AAPL', name: 'Apple Inc.', assetClass: 'equity' },
  { ticker: 'GOOGL', name: 'Alphabet Inc.', assetClass: 'equity' },
  { ticker: 'MSFT', name: 'Microsoft Corp.', assetClass: 'equity' },
  { ticker: 'TSLA', name: 'Tesla Inc.', assetClass: 'equity' },
  { ticker: 'BTC', name: 'Bitcoin', assetClass: 'crypto' },
  { ticker: 'ETH', name: 'Ethereum', assetClass: 'crypto' },
  { ticker: 'US10Y', name: 'US Treasury 10Y', assetClass: 'bonds' },
  { ticker: 'CORP', name: 'Corporate Bonds', assetClass: 'bonds' },
  { ticker: 'PROPERTY', name: 'Real Estate Fund', assetClass: 'realestate' },
  { ticker: 'CASH', name: 'Cash EUR', assetClass: 'cash' },
];

/**
 * Generates dummy monthly snapshots for testing purposes
 */
export async function generateDummySnapshots(params: DummySnapshotParams): Promise<void> {
  const { userId, initialNetWorth, monthlyGrowthRate, numberOfMonths } = params;

  const snapshots: MonthlySnapshot[] = [];
  const currentDate = new Date();

  // Generate snapshots for the last N months
  for (let i = numberOfMonths - 1; i >= 0; i--) {
    const snapshotDate = new Date(currentDate);
    snapshotDate.setMonth(snapshotDate.getMonth() - i);

    const year = snapshotDate.getFullYear();
    const month = snapshotDate.getMonth() + 1; // 1-12

    // Calculate net worth with growth
    const monthsFromStart = numberOfMonths - i - 1;
    const totalNetWorth = initialNetWorth * Math.pow(1 + monthlyGrowthRate / 100, monthsFromStart);

    // Calculate liquid/illiquid split (85% liquid, 15% illiquid)
    const liquidNetWorth = totalNetWorth * 0.85;
    const illiquidNetWorth = totalNetWorth * 0.15;

    // Distribute net worth by asset class
    const byAssetClass = {
      equity: totalNetWorth * 0.60,      // 60%
      bonds: totalNetWorth * 0.25,       // 25%
      crypto: totalNetWorth * 0.08,      // 8%
      realestate: totalNetWorth * 0.05,  // 5% (illiquid)
      cash: totalNetWorth * 0.02,        // 2%
      commodity: 0,                       // 0%
    };

    // Calculate allocation percentages
    const assetAllocation = {
      equity: 60,
      bonds: 25,
      crypto: 8,
      realestate: 5,
      cash: 2,
      commodity: 0,
    };

    // Generate individual asset snapshots
    const byAsset = DUMMY_ASSETS.map((asset, index) => {
      const assetClassValue = byAssetClass[asset.assetClass as keyof typeof byAssetClass];
      const numAssetsInClass = DUMMY_ASSETS.filter(a => a.assetClass === asset.assetClass).length;

      // Distribute asset class value among assets in that class
      const totalValue = assetClassValue / numAssetsInClass;

      // Generate random but realistic price
      let price: number;
      if (asset.assetClass === 'crypto') {
        price = Math.random() * 50000 + 10000; // Crypto: 10k-60k
      } else if (asset.assetClass === 'equity') {
        price = Math.random() * 200 + 50; // Stocks: 50-250
      } else if (asset.assetClass === 'realestate') {
        price = Math.random() * 100000 + 50000; // Real estate: 50k-150k
      } else {
        price = Math.random() * 100 + 50; // Others: 50-150
      }

      const quantity = totalValue / price;

      return {
        assetId: `dummy-asset-${index + 1}`,
        ticker: asset.ticker,
        name: asset.name,
        quantity: Math.round(quantity * 100) / 100, // Round to 2 decimals
        price: Math.round(price * 100) / 100,
        totalValue: Math.round(totalValue * 100) / 100,
      };
    });

    // Create the snapshot
    const snapshot: MonthlySnapshot = {
      userId,
      year,
      month,
      totalNetWorth: Math.round(totalNetWorth * 100) / 100,
      liquidNetWorth: Math.round(liquidNetWorth * 100) / 100,
      illiquidNetWorth: Math.round(illiquidNetWorth * 100) / 100,
      byAssetClass,
      byAsset,
      assetAllocation,
      createdAt: Timestamp.now(),
    };

    snapshots.push(snapshot);
  }

  // Save all snapshots to Firebase
  const snapshotsCollection = collection(db, 'monthly-snapshots');

  for (const snapshot of snapshots) {
    const docId = `${snapshot.userId}-${snapshot.year}-${snapshot.month}`;
    const docRef = doc(snapshotsCollection, docId);

    await setDoc(docRef, snapshot, { merge: true });
  }
}

/**
 * Generates a single dummy snapshot for a specific month
 */
export async function generateSingleDummySnapshot(
  userId: string,
  year: number,
  month: number,
  netWorth: number
): Promise<void> {
  // Use the main function with 1 month and adjust the date
  await generateDummySnapshots({
    userId,
    initialNetWorth: netWorth,
    monthlyGrowthRate: 0,
    numberOfMonths: 1,
  });
}
