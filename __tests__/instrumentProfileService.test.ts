/**
 * Tests for lib/server/exposure/instrumentProfileService.ts — the shared per-ticker cache: what
 * costs a Yahoo call, what is served stale, what is written, and that a document holds NOTHING
 * of a user's. The source and the store are injected: an in-memory store with `mergeFields`
 * semantics, a source that counts its calls.
 *
 * Seen RED on 2026-09-28: re-stamping every used module's `fetchedAt` at resolution time (a
 * document-level date) — «the first module's fetchedAt is NOT refreshed by the second request»
 * went red. Seen RED again on 2026-09-28 (the spec's retirement): a `name` field added to the
 * module the service writes («holds only Yahoo's fields» received `+ "name"`), and the empty-ticker
 * guard removed («drops an empty ticker» hit the store's throwing `read`).
 */
import { describe, expect, it, vi } from 'vitest';
import type { InstrumentFundProfile, InstrumentProfile, InstrumentStockProfile, ProfileModule, ProfileRequest } from '@/types/exposure';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase/admin', () => ({ adminDb: { collection: vi.fn() } }));
vi.mock('yahoo-finance2', () => ({ default: class {} }));

import { createAdminProfileCacheStore, resolveInstrumentProfiles, type ProfileCacheStore } from '@/lib/server/exposure/instrumentProfileService';
import type { YahooProfileSource } from '@/lib/server/exposure/yahooSource';

const NOW = new Date('2026-09-28T10:00:00.000Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 60 * 60 * 1000).toISOString();

/** A store that behaves like `set(…, { mergeFields: [module] })`: one module replaced, the other kept. */
function memoryStore(initial: Record<string, Partial<InstrumentProfile>> = {}) {
  const documents = new Map<string, Partial<InstrumentProfile>>(Object.entries(initial));
  const writes: Array<{ ticker: string; module: ProfileModule }> = [];
  const store: ProfileCacheStore = {
    async read(ticker) {
      const data = documents.get(ticker);
      return data ? { ticker, fund: data.fund, stock: data.stock } : null;
    },
    async writeModule(ticker, module, data) {
      writes.push({ ticker, module });
      documents.set(ticker, { ...(documents.get(ticker) ?? {}), ticker, [module]: data });
    },
  };
  return { store, documents, writes };
}

function fakeSource(answers: { fund?: Partial<InstrumentFundProfile> | null; stock?: Partial<InstrumentStockProfile> | null } = {}) {
  const fetchFund = vi.fn(async (_ticker: string, now: Date): Promise<InstrumentFundProfile | null> =>
    answers.fund === null ? null : { fetchedAt: now.toISOString(), holdingsBasis: 'sleeve', family: 'Vanguard', holdings: [{ key: 'NVDA', label: 'Nvidia', weight: 0.05 }], ...answers.fund },
  );
  const fetchStock = vi.fn(async (_ticker: string, now: Date): Promise<InstrumentStockProfile | null> =>
    answers.stock === null ? null : { fetchedAt: now.toISOString(), sectorKey: 'technology', longName: 'Apple Inc.', ...answers.stock },
  );
  const source: YahooProfileSource = { fetchFund, fetchStock };
  return { source, fetchFund, fetchStock };
}

const fundRequest: ProfileRequest = { ticker: 'VWCE.DE', module: 'fund' };
const stockRequest: ProfileRequest = { ticker: 'AAPL', module: 'stock' };

/** Wait for the fire-and-forget writes to land. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('resolveInstrumentProfiles — the TTL per module', () => {
  it('serves a fresh useful answer with ZERO Yahoo calls and dates the footer with it', async () => {
    const cachedFund: InstrumentFundProfile = { fetchedAt: daysAgo(10), holdingsBasis: 'sleeve', family: 'Vanguard', holdings: [{ key: 'NVDA', label: 'Nvidia', weight: 0.05 }] };
    const { store, writes } = memoryStore({ 'VWCE.DE': { fund: cachedFund } });
    const { source, fetchFund } = fakeSource();

    const response = await resolveInstrumentProfiles([fundRequest], { now: NOW, source, store });

    expect(fetchFund).not.toHaveBeenCalled();
    expect(response.profiles['VWCE.DE'].fund).toEqual(cachedFund);
    expect(response.oldestFetchedAt).toBe(daysAgo(10));
    expect(writes).toEqual([]);
  });

  it('asks Yahoo once for a useful answer past 30 days, and writes that module', async () => {
    const { store, writes, documents } = memoryStore({ 'VWCE.DE': { fund: { fetchedAt: daysAgo(31), holdingsBasis: 'sleeve', family: 'Vanguard' } } });
    const { source, fetchFund } = fakeSource();

    const response = await resolveInstrumentProfiles([fundRequest], { now: NOW, source, store });
    await settle();

    expect(fetchFund).toHaveBeenCalledTimes(1);
    expect(response.profiles['VWCE.DE'].fund?.fetchedAt).toBe(NOW.toISOString());
    expect(writes).toEqual([{ ticker: 'VWCE.DE', module: 'fund' }]);
    expect(documents.get('VWCE.DE')?.fund?.fetchedAt).toBe(NOW.toISOString());
  });

  it('retries an EMPTY answer after 24 hours, not before', async () => {
    const emptyFund = (fetchedAt: string): InstrumentFundProfile => ({ fetchedAt, holdingsBasis: 'fund', family: null });

    const young = memoryStore({ 'VWCE.DE': { fund: emptyFund(hoursAgo(23)) } });
    const youngSource = fakeSource();
    await resolveInstrumentProfiles([fundRequest], { now: NOW, source: youngSource.source, store: young.store });
    expect(youngSource.fetchFund).not.toHaveBeenCalled();

    const old = memoryStore({ 'VWCE.DE': { fund: emptyFund(hoursAgo(25)) } });
    const oldSource = fakeSource();
    const response = await resolveInstrumentProfiles([fundRequest], { now: NOW, source: oldSource.source, store: old.store });
    expect(oldSource.fetchFund).toHaveBeenCalledTimes(1);
    expect(response.profiles['VWCE.DE'].fund?.family).toBe('Vanguard');
  });

  it('serves the stale useful answer, with its own date, when Yahoo fails', async () => {
    const { store, writes } = memoryStore({ 'VWCE.DE': { fund: { fetchedAt: daysAgo(40), holdingsBasis: 'sleeve', family: 'Vanguard' } } });
    const { source } = fakeSource({ fund: null });

    const response = await resolveInstrumentProfiles([fundRequest], { now: NOW, source, store });

    expect(response.profiles['VWCE.DE'].fund?.family).toBe('Vanguard');
    expect(response.oldestFetchedAt).toBe(daysAgo(40));
    expect(writes).toEqual([]);
  });

  it('leaves the module absent — «non letto» — when Yahoo fails and nothing is cached', async () => {
    const { store } = memoryStore();
    const { source } = fakeSource({ fund: null });
    const response = await resolveInstrumentProfiles([fundRequest], { now: NOW, source, store });
    expect(response.profiles['VWCE.DE']).toEqual({ ticker: 'VWCE.DE' });
    expect(response.oldestFetchedAt).toBeNull();
  });

  it('«Aggiorna» asks Yahoo whatever the age and keeps the fresh cached answer if Yahoo fails', async () => {
    const cachedFund: InstrumentFundProfile = { fetchedAt: daysAgo(1), holdingsBasis: 'sleeve', family: 'Vanguard' };
    const refreshed = memoryStore({ 'VWCE.DE': { fund: cachedFund } });
    const refreshedSource = fakeSource({ fund: { family: 'Vanguard Group' } });
    const response = await resolveInstrumentProfiles([fundRequest], { now: NOW, force: true, source: refreshedSource.source, store: refreshed.store });
    expect(refreshedSource.fetchFund).toHaveBeenCalledTimes(1);
    expect(response.profiles['VWCE.DE'].fund?.family).toBe('Vanguard Group');

    const failed = memoryStore({ 'VWCE.DE': { fund: cachedFund } });
    const failedSource = fakeSource({ fund: null });
    const kept = await resolveInstrumentProfiles([fundRequest], { now: NOW, force: true, source: failedSource.source, store: failed.store });
    expect(kept.profiles['VWCE.DE'].fund).toEqual(cachedFund);
  });
});

describe('resolveInstrumentProfiles — one document, two modules', () => {
  it('keeps the first module’s own fetchedAt when the second module is asked later', async () => {
    const { store, documents } = memoryStore();
    const { source } = fakeSource();
    const first = new Date('2026-09-01T10:00:00.000Z');
    const later = new Date('2026-09-20T10:00:00.000Z');

    await resolveInstrumentProfiles([{ ticker: 'X', module: 'stock' }], { now: first, source, store });
    await settle();
    const response = await resolveInstrumentProfiles([{ ticker: 'X', module: 'fund' }, { ticker: 'X', module: 'stock' }], { now: later, source, store });
    await settle();

    expect(documents.get('X')?.stock?.fetchedAt).toBe(first.toISOString());
    expect(documents.get('X')?.fund?.fetchedAt).toBe(later.toISOString());
    expect(response.profiles.X.stock?.fetchedAt).toBe(first.toISOString());
    expect(response.oldestFetchedAt).toBe(first.toISOString());
  });

  it('answers the oldest date among the modules USED, across tickers', async () => {
    const { store } = memoryStore({
      'VWCE.DE': { fund: { fetchedAt: daysAgo(3), holdingsBasis: 'sleeve', family: 'Vanguard' } },
      AAPL: { stock: { fetchedAt: daysAgo(12), sectorKey: 'technology', longName: 'Apple Inc.' }, fund: { fetchedAt: daysAgo(29), holdingsBasis: 'fund', family: 'Nobody' } },
    });
    const { source, fetchFund, fetchStock } = fakeSource();
    const response = await resolveInstrumentProfiles([fundRequest, stockRequest], { now: NOW, source, store });
    expect(fetchFund).not.toHaveBeenCalled();
    expect(fetchStock).not.toHaveBeenCalled();
    // AAPL's stale-ish fund module was not requested: it must not date the footer.
    expect(response.oldestFetchedAt).toBe(daysAgo(12));
    expect(response.profiles.AAPL.fund).toBeUndefined();
  });
});

describe('resolveInstrumentProfiles — nothing of the user’s, nothing that can throw', () => {
  it('holds only Yahoo’s fields: no asset name, class or composition can be in a document', async () => {
    const { store, documents } = memoryStore();
    const { source } = fakeSource();
    await resolveInstrumentProfiles([fundRequest, stockRequest], { now: NOW, source, store });
    await settle();

    const fundKeys = Object.keys(documents.get('VWCE.DE')?.fund ?? {}).sort();
    expect(fundKeys).toEqual(['family', 'fetchedAt', 'holdings', 'holdingsBasis']);
    const stockKeys = Object.keys(documents.get('AAPL')?.stock ?? {}).sort();
    expect(stockKeys).toEqual(['fetchedAt', 'longName', 'sectorKey']);
    expect(Object.keys(documents.get('AAPL') ?? {}).sort()).toEqual(['stock', 'ticker']);
  });

  it('drops an empty ticker before any read, so `.doc("")` is never reached', async () => {
    const read = vi.fn(async () => {
      throw new Error('.doc("") must never be reached');
    });
    const store: ProfileCacheStore = { read, writeModule: vi.fn(async () => undefined) };
    const { source, fetchFund } = fakeSource();
    const response = await resolveInstrumentProfiles([{ ticker: '   ', module: 'fund' }], { now: NOW, source, store });
    expect(read).not.toHaveBeenCalled();
    expect(fetchFund).not.toHaveBeenCalled();
    expect(response).toEqual({ profiles: {}, oldestFetchedAt: null });
  });

  it('answers even when the cache cannot be read or written', async () => {
    const store: ProfileCacheStore = {
      read: vi.fn(async () => null),
      writeModule: vi.fn(async () => {
        throw new Error('quota');
      }),
    };
    const { source } = fakeSource();
    const response = await resolveInstrumentProfiles([fundRequest], { now: NOW, source, store });
    await settle();
    expect(response.profiles['VWCE.DE'].fund?.family).toBe('Vanguard');
  });
});

describe('createAdminProfileCacheStore', () => {
  it('keys the document by the URI-encoded ticker and writes ONE module with mergeFields', async () => {
    const set = vi.fn(async () => undefined);
    const get = vi.fn(async () => ({ exists: true, data: () => ({ ticker: 'BRK-B', stock: { fetchedAt: NOW.toISOString(), sectorKey: null, longName: 'Berkshire' } }) }));
    const doc = vi.fn(() => ({ get, set }));
    const db = { collection: vi.fn(() => ({ doc })) };
    const store = createAdminProfileCacheStore(db as never);

    const read = await store.read('BRK-B');
    expect(db.collection).toHaveBeenCalledWith('instrument-profile-cache');
    expect(doc).toHaveBeenCalledWith('BRK-B');
    expect(read?.stock?.longName).toBe('Berkshire');

    await store.writeModule('A/B.MI', 'fund', { fetchedAt: NOW.toISOString(), holdingsBasis: 'fund', family: null, holdings: undefined });
    expect(doc).toHaveBeenLastCalledWith('A%2FB.MI');
    expect(set).toHaveBeenCalledWith({ ticker: 'A/B.MI', fund: { fetchedAt: NOW.toISOString(), holdingsBasis: 'fund', family: null } }, { mergeFields: ['ticker', 'fund'] });
  });
});
