import { Timestamp } from 'firebase-admin/firestore';

export interface BenchmarkComponent {
  ticker: string;
  weight: number; // 0.0 to 1.0, must sum to 1
  name: string;
}

export interface BenchmarkDefinition {
  id: string;
  name: string;
  description: string;
  color: string;
  components: BenchmarkComponent[];
}

export interface BenchmarkMonthlyReturn {
  year: number;
  month: number; // 1-12
  return: number; // decimal (e.g. 0.02 = +2%)
}

export interface BenchmarkReturnsResponse {
  benchmarkId: string;
  name: string;
  monthlyReturns: BenchmarkMonthlyReturn[];
  cachedAt: string; // ISO string
}

// Firestore cache document stored in benchmark-cache/{benchmarkId}.
// Writable only via Admin SDK; readable by any authenticated user.
export interface BenchmarkCacheDoc {
  benchmarkId: string;
  cachedAt: Timestamp;
  // Full history from earliest available ETF data through latest available month.
  // Client filters to the selected period date range.
  monthlyReturns: BenchmarkMonthlyReturn[];
}

// Monthly EUR/USD exchange rate (EUR per 1 USD, end-of-month closing rate)
export interface FxMonthlyRate {
  year: number;
  month: number; // 1-12
  eurPerUsd: number; // e.g. 0.9147 means 1 USD = 0.9147 EUR
}

export interface FxRatesResponse {
  monthlyRates: FxMonthlyRate[];
  cachedAt: string; // ISO string
}
