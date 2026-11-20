/**
 * The guided paths' browser draft (lib/utils/pathDraftStorage.ts, 2026-11-20): a JSON value under a key,
 * read through the caller's parser. A private window or a full quota throws on every call; the path
 * must lose the convenience, never the screen.
 */

import { describe, expect, it } from 'vitest';
import { clearStored, readStoredJson, writeStoredJson } from '@/lib/utils/pathDraftStorage';

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
}

const throwing = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
  removeItem: () => {
    throw new Error('SecurityError');
  },
};

const parseShape = (value: unknown) => (value && typeof value === 'object' && 'n' in value ? (value as { n: number }) : null);

describe('pathDraftStorage', () => {
  it('writes JSON and reads it back through the parser', () => {
    const storage = memoryStorage();
    writeStoredJson(storage, 'k', { n: 50 });
    expect(storage.map.get('k')).toBe('{"n":50}');
    expect(readStoredJson(storage, 'k', parseShape)).toEqual({ n: 50 });
  });

  it('reads null when the parser refuses the shape, the key is missing or the text is not JSON', () => {
    const storage = memoryStorage();
    storage.map.set('other', '{"m":1}');
    storage.map.set('broken', '{not json');
    expect(readStoredJson(storage, 'other', parseShape)).toBeNull();
    expect(readStoredJson(storage, 'missing', parseShape)).toBeNull();
    expect(readStoredJson(storage, 'broken', parseShape)).toBeNull();
  });

  it('clears the key', () => {
    const storage = memoryStorage();
    writeStoredJson(storage, 'k', { n: 1 });
    clearStored(storage, 'k');
    expect(storage.map.has('k')).toBe(false);
  });

  it('a throwing storage reads null and writes nothing, without throwing', () => {
    expect(readStoredJson(throwing, 'k', parseShape)).toBeNull();
    expect(() => writeStoredJson(throwing, 'k', { n: 1 })).not.toThrow();
    expect(() => clearStored(throwing, 'k')).not.toThrow();
  });

  it('a missing storage (the server render) is a no-op', () => {
    expect(readStoredJson(null, 'k', parseShape)).toBeNull();
    expect(() => writeStoredJson(null, 'k', { n: 1 })).not.toThrow();
    expect(() => clearStored(null, 'k')).not.toThrow();
  });
});
