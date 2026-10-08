/**
 * `resolveFreshness` — when the header says «Aggiornato alle…»: a figure on screen that
 * is being reread AND is either older than its threshold or was read BEFORE this page load (a
 * restored figure, however young). Pinned: a first fetch is a wait, not an old figure; an
 * invalidation of a fresh in-session figure is silent; the page's oldest figure is the one named;
 * a payload that dates its own content (the overview) can be older than its read.
 */
import { describe, expect, it } from 'vitest';
import { QUERY_STALE_TIME_MS } from '@/lib/query/queryDefaults';
import { resolveFreshness } from '@/lib/utils/freshness';

const NOW = Date.UTC(2026, 8, 29, 16, 42, 0);
const MINUTE = 60 * 1000;
/** This page load: a minute ago. Everything read before it was restored from the persisted cache. */
const OPENED_AT = NOW - MINUTE;

const idle = (ageMs: number) => ({ isFetching: false, isLoading: false, dataUpdatedAt: NOW - ageMs });
const refetching = (ageMs: number) => ({ isFetching: true, isLoading: false, dataUpdatedAt: NOW - ageMs });
const firstFetch = { isFetching: true, isLoading: true, dataUpdatedAt: 0 };

describe('resolveFreshness', () => {
  it('should be silent when nothing is being fetched', () => {
    expect(resolveFreshness([idle(3 * 60 * MINUTE)], NOW, { openedAt: OPENED_AT })).toEqual({ stale: false, updatedAt: null });
  });

  it('should be silent on a first fetch — there is no figure on screen to be old', () => {
    expect(resolveFreshness([firstFetch], NOW, { openedAt: OPENED_AT }).stale).toBe(false);
  });

  it('should be silent when a FRESH in-session figure is reread (an invalidation after a save)', () => {
    expect(resolveFreshness([refetching(30 * 1000)], NOW, { openedAt: OPENED_AT }).stale).toBe(false);
  });

  it('should name a restored figure that is being reread, however young it is', () => {
    // Read ten seconds BEFORE this page load: it came out of the persisted cache.
    const restored = refetching(MINUTE + 10 * 1000);

    const reading = resolveFreshness([restored], NOW, { openedAt: OPENED_AT });

    expect(reading.stale).toBe(true);
    expect(reading.updatedAt?.getTime()).toBe(restored.dataUpdatedAt);
  });

  it('should name an in-session figure once it is older than the client\'s own staleTime', () => {
    const openedLongAgo = NOW - 60 * MINUTE;
    const reading = resolveFreshness([refetching(QUERY_STALE_TIME_MS)], NOW, { openedAt: openedLongAgo });

    expect(reading.stale).toBe(true);
    expect(reading.updatedAt?.getTime()).toBe(NOW - QUERY_STALE_TIME_MS);
  });

  it('should name the OLDEST figure among the stale ones', () => {
    const reading = resolveFreshness([refetching(6 * MINUTE), refetching(60 * MINUTE), idle(90 * MINUTE)], NOW, { openedAt: NOW - 90 * MINUTE });

    expect(reading.updatedAt?.getTime()).toBe(NOW - 60 * MINUTE);
  });

  it('should take a query\'s own threshold over the default (the overview\'s minute)', () => {
    const openedLongAgo = NOW - 60 * MINUTE;
    const overview = { ...refetching(2 * MINUTE), staleAfterMs: MINUTE };

    expect(resolveFreshness([overview], NOW, { openedAt: openedLongAgo }).stale).toBe(true);
    expect(resolveFreshness([refetching(2 * MINUTE)], NOW, { openedAt: openedLongAgo }).stale).toBe(false);
  });

  it('should date a payload by its own content when that is older than the read', () => {
    const summaryAt = NOW - 3 * 60 * MINUTE;
    const reading = resolveFreshness([{ ...refetching(2 * MINUTE), contentUpdatedAt: summaryAt, staleAfterMs: MINUTE }], NOW, { openedAt: NOW - 60 * MINUTE });

    expect(reading.updatedAt?.getTime()).toBe(summaryAt);
  });

  it('should ignore an unparseable content date (NaN) and fall back to the read', () => {
    const reading = resolveFreshness([{ ...refetching(10 * MINUTE), contentUpdatedAt: Number.NaN }], NOW, { openedAt: NOW - 60 * MINUTE });

    expect(reading.updatedAt?.getTime()).toBe(NOW - 10 * MINUTE);
  });

  it('should honour a custom default threshold', () => {
    expect(resolveFreshness([refetching(90 * 1000)], NOW, { openedAt: NOW - 60 * MINUTE, defaultStaleAfterMs: MINUTE }).stale).toBe(true);
  });

  it('should fall back to the age alone when no page-load instant is known', () => {
    expect(resolveFreshness([refetching(30 * 1000)], NOW).stale).toBe(false);
    expect(resolveFreshness([refetching(QUERY_STALE_TIME_MS)], NOW).stale).toBe(true);
  });
});
