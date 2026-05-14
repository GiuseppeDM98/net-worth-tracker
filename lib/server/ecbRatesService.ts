import { adminDb } from '@/lib/firebase/admin';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { EcbMonthlyRate } from '@/types/benchmarks';

const ECB_CACHE_COLLECTION = 'ecb-rate-cache';
const ECB_CACHE_DOC = 'deposit-rate';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FRED_API_URL = 'https://api.stlouisfed.org/fred/series/observations';

interface FredObservation {
  date: string;   // "YYYY-MM-DD"
  value: string;  // annual % string, e.g. "2"; "." means missing
}

/**
 * Takes raw FRED ECBDFR observations, keeps the last value per calendar month
 * (ECB decisions can land mid-month), then carry-forwards from 1999-01 to the
 * current month so every month has an explicit rate entry.
 */
export function buildMonthlyRatesFromFred(observations: FredObservation[]): EcbMonthlyRate[] {
  const lastPerMonth = new Map<string, number>();
  for (const obs of observations) {
    if (obs.value === '.') continue;
    const ym = obs.date.slice(0, 7); // "YYYY-MM"
    lastPerMonth.set(ym, parseFloat(obs.value));
  }

  const now = new Date();
  const endYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const result: EcbMonthlyRate[] = [];
  let cursor = new Date(Date.UTC(1999, 0, 1)); // 1999-01
  let lastRate = 0;

  while (true) {
    const year = cursor.getUTCFullYear();
    const month = cursor.getUTCMonth() + 1;
    const ym = `${year}-${String(month).padStart(2, '0')}`;

    if (lastPerMonth.has(ym)) {
      lastRate = lastPerMonth.get(ym)!;
    }

    result.push({ year, month, rate: lastRate });

    if (ym === endYm) break;

    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }

  return result;
}

/** Fetches ECBDFR series from FRED and builds the carry-forward monthly array. */
export async function fetchAndBuildEcbRates(): Promise<EcbMonthlyRate[]> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) throw new Error('FRED_API_KEY is not set');

  const url =
    `${FRED_API_URL}?series_id=ECBDFR&api_key=${apiKey}` +
    `&file_type=json&observation_start=1999-01-01&sort_order=asc`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`FRED API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json() as { observations: FredObservation[] };
  return buildMonthlyRatesFromFred(data.observations);
}

/** Reads the cached ECB rates from Firestore. Returns null if the document is missing. */
export async function readEcbRatesFromFirestore(): Promise<{ rates: EcbMonthlyRate[]; cachedAt: Date } | null> {
  const snap = await adminDb.collection(ECB_CACHE_COLLECTION).doc(ECB_CACHE_DOC).get();
  if (!snap.exists) return null;

  const data = snap.data()!;
  return {
    rates: data.monthlyRates as EcbMonthlyRate[],
    cachedAt: (data.cachedAt as Timestamp).toDate(),
  };
}

/** Writes ECB rates to Firestore. Only callable via Admin SDK (Firestore rule: write: false). */
export async function writeEcbRatesToFirestore(rates: EcbMonthlyRate[]): Promise<void> {
  await adminDb.collection(ECB_CACHE_COLLECTION).doc(ECB_CACHE_DOC).set({
    monthlyRates: rates,
    cachedAt: FieldValue.serverTimestamp(),
  });
}

export function isEcbCacheStale(cachedAt: Date): boolean {
  return Date.now() - cachedAt.getTime() > CACHE_TTL_MS;
}

/**
 * Convenience wrapper for the daily cron job.
 * Skips gracefully when FRED_API_KEY is absent so the cron never fails because of this.
 */
export async function refreshEcbRatesIfStale(): Promise<void> {
  if (!process.env.FRED_API_KEY) {
    console.warn('[ecb-rates] FRED_API_KEY not set — skipping ECB rate refresh');
    return;
  }

  const cached = await readEcbRatesFromFirestore();
  if (cached && !isEcbCacheStale(cached.cachedAt)) return;

  const rates = await fetchAndBuildEcbRates();
  await writeEcbRatesToFirestore(rates);
}
