import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PATRIMONIO_VISIBILITY_STORAGE_KEY,
  getPatrimonioVisibleSnapshot,
  readStoredPatrimonioVisibility,
  setPatrimonioVisible,
  subscribePatrimonioVisibility,
} from '@/lib/hooks/usePatrimonioVisible';

function installFakeStorage(initial: Record<string, string> = {}): Map<string, string> {
  const store = new Map<string, string>(Object.entries(initial));
  const fake = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  };
  vi.stubGlobal('localStorage', fake);
  vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
  return store;
}

beforeEach(() => {
  vi.unstubAllGlobals();
  // Reset the module-level snapshot so each case reads its own storage.
  setPatrimonioVisible(false);
  vi.unstubAllGlobals();
});

describe('readStoredPatrimonioVisibility', () => {
  it('is hidden by default when nothing was stored', () => {
    installFakeStorage();
    // The write in beforeEach must not leak: start from an empty store.
    localStorage.removeItem(PATRIMONIO_VISIBILITY_STORAGE_KEY);
    expect(readStoredPatrimonioVisibility()).toBe(false);
  });

  it('reads a stored visible decision', () => {
    installFakeStorage({ [PATRIMONIO_VISIBILITY_STORAGE_KEY]: '1' });
    expect(readStoredPatrimonioVisibility()).toBe(true);
  });

  it('treats any other stored value as hidden', () => {
    installFakeStorage({ [PATRIMONIO_VISIBILITY_STORAGE_KEY]: '0' });
    expect(readStoredPatrimonioVisibility()).toBe(false);
  });

  it('stays hidden when storage is unavailable', () => {
    vi.unstubAllGlobals();
    expect(readStoredPatrimonioVisibility()).toBe(false);
  });
});

describe('setPatrimonioVisible', () => {
  it('persists the visible decision', () => {
    const store = installFakeStorage();
    setPatrimonioVisible(true);
    expect(store.get(PATRIMONIO_VISIBILITY_STORAGE_KEY)).toBe('1');
    expect(getPatrimonioVisibleSnapshot()).toBe(true);
  });

  it('clears the key when hiding again', () => {
    const store = installFakeStorage({ [PATRIMONIO_VISIBILITY_STORAGE_KEY]: '1' });
    setPatrimonioVisible(false);
    expect(store.has(PATRIMONIO_VISIBILITY_STORAGE_KEY)).toBe(false);
    expect(getPatrimonioVisibleSnapshot()).toBe(false);
  });

  it('notifies subscribers of the change', () => {
    installFakeStorage();
    const listener = vi.fn();
    const unsubscribe = subscribePatrimonioVisibility(listener);
    setPatrimonioVisible(true);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    setPatrimonioVisible(false);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
