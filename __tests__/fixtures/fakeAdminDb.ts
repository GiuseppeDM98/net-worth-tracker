/**
 * A Firestore Admin stand-in held in a Map, for the tests that must run a ledger's OWN rules (its
 * transaction, its read before its write) rather than a mock that answers what the test expects.
 *
 * Covers what the email ledger and the emails' cron use: `collection(name).get()` (every document of a
 * top-level collection), `collection(name).doc(id)` with `get`/`set` (`merge` shallow)/`delete`, and
 * `runTransaction(fn)` passing a `tx` with `get`, `set`, `delete`. A transaction refuses a read after a
 * write, as Firestore does. `reads` counts the reads per collection, so a test can assert one never ran;
 * `failWrite`, when set, makes every write it answers true for throw (a Firestore that fails mid-run).
 */
type Data = Record<string, unknown>;

export interface FakeDocRef {
  path: string;
  id: string;
  get(): Promise<FakeSnapshot>;
  set(data: Data, options?: { merge?: boolean }): Promise<void>;
  delete(): Promise<void>;
}

export interface FakeSnapshot {
  id: string;
  exists: boolean;
  data(): Data | undefined;
}

export interface FakeAdminDb {
  docs: Map<string, Data>;
  reads: Map<string, number>;
  failWrite: ((path: string, data: Data) => boolean) | null;
  collection(name: string): {
    get(): Promise<{ empty: boolean; size: number; docs: FakeSnapshot[] }>;
    doc(id: string): FakeDocRef;
  };
  runTransaction<T>(fn: (tx: {
    get(ref: FakeDocRef): Promise<FakeSnapshot>;
    set(ref: FakeDocRef, data: Data, options?: { merge?: boolean }): void;
    delete(ref: FakeDocRef): void;
  }) => Promise<T>): Promise<T>;
}

export function createFakeAdminDb(): FakeAdminDb {
  const docs = new Map<string, Data>();
  const reads = new Map<string, number>();
  const countRead = (path: string) => {
    const name = path.split('/')[0];
    reads.set(name, (reads.get(name) ?? 0) + 1);
  };
  const snapshotOf = (path: string): FakeSnapshot => {
    const stored = docs.get(path);
    return { id: path.split('/').pop()!, exists: stored !== undefined, data: () => (stored ? { ...stored } : undefined) };
  };
  const write = (path: string, data: Data, options?: { merge?: boolean }) => {
    if (db.failWrite?.(path, data)) throw new Error(`write refused: ${path}`);
    docs.set(path, options?.merge ? { ...(docs.get(path) ?? {}), ...data } : { ...data });
  };
  const refOf = (name: string, id: string): FakeDocRef => {
    const path = `${name}/${id}`;
    return {
      path,
      id,
      get: async () => { countRead(path); return snapshotOf(path); },
      set: async (data, options) => write(path, data, options),
      delete: async () => { docs.delete(path); },
    };
  };
  const db: FakeAdminDb = {
    docs,
    reads,
    failWrite: null,
    collection: (name) => ({
      get: async () => {
        countRead(name);
        const found = [...docs.keys()]
          .filter((path) => path.startsWith(`${name}/`) && path.split('/').length === 2)
          .map(snapshotOf);
        return { empty: found.length === 0, size: found.length, docs: found };
      },
      doc: (id) => refOf(name, id),
    }),
    runTransaction: async (fn) => {
      let wrote = false;
      return fn({
        get: async (ref) => {
          if (wrote) throw new Error('Firestore transactions require all reads to be executed before all writes.');
          countRead(ref.path);
          return snapshotOf(ref.path);
        },
        set: (ref, data, options) => { wrote = true; write(ref.path, data, options); },
        delete: (ref) => { wrote = true; docs.delete(ref.path); },
      });
    },
  };
  return db;
}
