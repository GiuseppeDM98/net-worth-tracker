/**
 * The browser draft of a guided path (Compravendita, the plan of accumulation): a JSON value under a
 * key on this browser. Every call sits in a try/catch — a private window or a full quota throws, and
 * a path must lose the convenience, never the screen. The caller's `parse` decides the shape: a value
 * it refuses reads as no draft.
 */

export function readStoredJson<T>(storage: Pick<Storage, 'getItem'> | null, key: string, parse: (value: unknown) => T | null): T | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    return parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeStoredJson(storage: Pick<Storage, 'setItem'> | null, key: string, value: unknown): void {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // A full or blocked storage loses the convenience, never the path.
  }
}

export function clearStored(storage: Pick<Storage, 'removeItem'> | null, key: string): void {
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    // Same as above.
  }
}
