/**
 * `composeReadState` — the one decision a page takes over several React Query keys (Storico's
 * six). Pinned: a single failed query marks the page failed (2026-09-29: «la pagina attende
 * TUTTE le query»), a single loading one keeps it loading, and loading is reported beside failed
 * (the caller's `resolveSurfaceState` lets loading win: a retry is an attempt, not a verdict).
 */
import { describe, expect, it } from 'vitest';
import { composeReadState } from '@/lib/utils/readState';

const settled = { isLoading: false, isError: false };
const reading = { isLoading: true, isError: false };
const failed = { isLoading: false, isError: true };

describe('composeReadState', () => {
  it('reports neither loading nor failed when every query has answered', () => {
    expect(composeReadState([settled, settled, settled])).toEqual({ loading: false, loadFailed: false });
  });

  it('keeps the page loading while ANY query is still reading', () => {
    expect(composeReadState([settled, reading, settled])).toEqual({ loading: true, loadFailed: false });
  });

  it('marks the page failed when ANY query did not read — the sixth one included', () => {
    expect(composeReadState([settled, settled, settled, settled, settled, failed])).toEqual({ loading: false, loadFailed: true });
  });

  it('reports loading and failed together when one retries and another failed', () => {
    expect(composeReadState([reading, failed])).toEqual({ loading: true, loadFailed: true });
  });

  it('is settled over no queries at all', () => {
    expect(composeReadState([])).toEqual({ loading: false, loadFailed: false });
  });
});
