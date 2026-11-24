/**
 * The daily archive's row and its arithmetic.
 *
 * One document per account per month holds a map day → row (`dailySnapshots/{uid}/months/{YYYY-MM}`):
 * the monthly snapshots keep one value a month and thirty-eight readers count on it, so the days live
 * beside them, never among them. A row is what the evening cron already computed, cut to what a daily
 * reader needs: the totals, the classes, and per instrument the quantity and the value in euro.
 */
import type { MonthlySnapshot } from '@/types/assets';
import { roundToCents } from '@/lib/utils/cents';

export const DAILY_SNAPSHOTS_COLLECTION = 'dailySnapshots';
export const DAILY_SNAPSHOTS_SUBCOLLECTION = 'months';

/** One instrument on one day. A loan keeps its residual principal in `q` and a negative `v`. */
export interface DailyAssetRow {
  q: number;
  v: number;
}

export interface DailySnapshotDay {
  netWorth: number;
  liquid: number;
  byClass: Record<string, number>;
  assets: Record<string, DailyAssetRow>;
  /** ISO instant of the write: the evening cron and a later «Crea snapshot» share a day, not an hour. */
  at: string;
}

export interface DailySnapshotMonth {
  userId: string;
  month: string;
  days: Record<string, DailySnapshotDay>;
}

/** A row with its Italian day, 'YYYY-MM-DD': what every reader works on. */
export interface DailyPoint extends DailySnapshotDay {
  iso: string;
}

export interface DailySnapshotInput {
  totalNetWorth: number;
  liquidNetWorth: number;
  byAssetClass: Record<string, number>;
  byAsset: MonthlySnapshot['byAsset'];
  at: Date;
}

export function buildDailySnapshotDay(input: DailySnapshotInput): DailySnapshotDay {
  const assets: Record<string, DailyAssetRow> = {};
  for (const row of input.byAsset) {
    // A sold-out instrument stays in the monthly breakdown as a zero row; thirty of them a day is noise.
    if (row.quantity === 0 && row.totalValue === 0) continue;
    assets[row.assetId] = { q: row.quantity, v: roundToCents(row.totalValue) };
  }
  const byClass: Record<string, number> = {};
  for (const [name, value] of Object.entries(input.byAssetClass)) byClass[name] = roundToCents(value);
  return {
    netWorth: roundToCents(input.totalNetWorth),
    liquid: roundToCents(input.liquidNetWorth),
    byClass,
    assets,
    at: input.at.toISOString(),
  };
}

export function splitIsoDay(iso: string): { monthKey: string; day: string } {
  return { monthKey: iso.slice(0, 7), day: iso.slice(8, 10) };
}

/** The month keys from `fromIso`'s month to `toIso`'s, both included, ascending. */
export function monthKeysBetween(fromIso: string, toIso: string): string[] {
  const keys: string[] = [];
  const last = toIso.slice(0, 7);
  let year = Number(fromIso.slice(0, 4));
  let month = Number(fromIso.slice(5, 7));
  for (;;) {
    const key = `${year}-${String(month).padStart(2, '0')}`;
    if (key > last) break;
    keys.push(key);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return keys;
}

/** `days` calendar days before `todayIso`, as an ISO day. Pure calendar arithmetic, no time zone. */
export function isoDaysBefore(todayIso: string, days: number): string {
  const [year, month, day] = todayIso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day - days)).toISOString().slice(0, 10);
}

/** The rows of `months` between the two days (included), ascending by day. */
export function flattenDailyMonths(months: DailySnapshotMonth[], fromIso: string, toIso: string): DailyPoint[] {
  const points: DailyPoint[] = [];
  for (const record of months) {
    for (const [day, value] of Object.entries(record.days ?? {})) {
      const iso = `${record.month}-${day}`;
      if (iso < fromIso || iso > toIso) continue;
      points.push({ iso, ...value });
    }
  }
  return points.sort((a, b) => (a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : 0));
}

/**
 * The euro unit price of a row, or null where `v / q` is not a price: nothing to divide by, or a
 * loan (its quantity is the residual principal, its value the same figure below zero). Whether the
 * instrument has a MARKET price at all — an account, a pension fund and a property have none — is
 * the reader's question: it holds the asset, the row does not.
 */
export function dailyUnitPrice(row: DailyAssetRow | undefined): number | null {
  if (!row || row.q <= 0 || row.v < 0) return null;
  return row.v / row.q;
}

/**
 * Whether the copy of a month is final: it was fetched on an Italian day after the month's last.
 * A copy taken while the month was open misses its later days, however old the month is now.
 */
export function isDailyMonthFinal(monthKey: string, fetchedOnIso: string): boolean {
  return fetchedOnIso.slice(0, 7) > monthKey;
}
