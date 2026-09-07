/**
 * The production MIRROR: the owner's real data in the local emulators, under a throwaway identity,
 * for a guided tour that shows what a change does to the figures the owner actually reads
 * (WORKFLOW.md § 3, obligation 5). The account is a standard; the data is not — it is re-read
 * from production on every seed, because a month later it has changed.
 *
 *   npm run mirror:seed -- <production email>   # production (read-only) → emulators, in one go
 *   npm run mirror:remove                        # deletes the mirror account and every row it owns
 *
 * TWO PROCESSES, ONE COMMAND. The Admin SDK routes to the emulators through the process-wide
 * `FIRESTORE_EMULATOR_HOST`, so one process cannot read production AND write the emulator. The
 * parent runs WITHOUT the variable, reads production with the service account from `.env.local`
 * and nothing but `.get()`, then spawns itself as a child WITH the emulator variables and streams
 * the dump through its stdin — nothing is written to disk, and the child refuses to run unless it
 * is pointed at the emulators. Every row is re-keyed to the mirror uid (`userId`, the snapshot ids
 * `{uid}-{y}-{m}`, the per-user docs); `performance-cache` is not copied, so the page recomputes
 * with the current math. AGENTS.md → *Emulator Exercise Scripts* → «Reading PRODUCTION».
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Overridable (`MIRROR_UID=… npm run mirror:remove`) to clear a mirror seeded under another id. */
export const MIRROR_UID = process.env.MIRROR_UID || 'prod-mirror';
export const MIRROR_EMAIL = 'mirror@example.com';
/** The fixture password every emulator account shares (SETUP.md → Step 7). */
export const MIRROR_PASSWORD = 'test1234';

const EMULATOR_ENV = {
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
  GCLOUD_PROJECT: 'demo-net-worth',
};
const USER_COLLECTIONS = ['assets', 'expenses', 'expenseCategories', 'monthly-snapshots', 'assetTransactions', 'pensionContributions', 'dividends', 'costCenters', 'goals', 'assistantThreads'];
const PER_USER_DOCS = ['users', 'assetAllocationTargets', 'assetTransactionsMeta', 'budgets', 'hall-of-fame', 'performance-cache', 'exposure-cache', 'dashboardOverviewSummaries'];

type AnyRecord = Record<string, unknown>;
const [command, argument] = process.argv.slice(2);

// ── Timestamps travel as { __ts: iso } through stdin ───────────────────────────────────────────
function serialise(value: unknown, Timestamp: { prototype: object }): unknown {
  if (value instanceof (Timestamp as unknown as new () => object)) return { __ts: (value as { toDate(): Date }).toDate().toISOString() };
  if (Array.isArray(value)) return value.map((v) => serialise(v, Timestamp));
  if (value && typeof value === 'object') {
    const out: AnyRecord = {};
    for (const [k, v] of Object.entries(value as AnyRecord)) out[k] = serialise(v, Timestamp);
    return out;
  }
  return value;
}
function rehydrate(value: unknown, fromDate: (d: Date) => unknown): unknown {
  if (Array.isArray(value)) return value.map((v) => rehydrate(v, fromDate));
  if (value && typeof value === 'object') {
    const obj = value as AnyRecord;
    if (typeof obj.__ts === 'string' && Object.keys(obj).length === 1) return fromDate(new Date(obj.__ts));
    const out: AnyRecord = {};
    for (const [k, v] of Object.entries(obj)) out[k] = rehydrate(v, fromDate);
    return out;
  }
  return value;
}

// ── seed: production, read-only, then the child ────────────────────────────────────────────────
async function seed(email: string | undefined) {
  if (process.env.FIRESTORE_EMULATOR_HOST) throw new Error('mirror:seed reads PRODUCTION and must run without FIRESTORE_EMULATOR_HOST (the child sets it).');
  if (!email) throw new Error('usage: npm run mirror:seed -- <production email>');
  // `@next/env` is CJS: under a dynamic import its API may sit on `default` or on the namespace itself.
  const nextEnvModule = (await import('@next/env')) as { default?: { loadEnvConfig(dir: string): unknown }; loadEnvConfig?(dir: string): unknown };
  (nextEnvModule.default ?? nextEnvModule).loadEnvConfig!(process.cwd());
  const { FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, FIREBASE_ADMIN_PRIVATE_KEY } = process.env;
  if (!FIREBASE_ADMIN_PROJECT_ID || !FIREBASE_ADMIN_CLIENT_EMAIL || !FIREBASE_ADMIN_PRIVATE_KEY) throw new Error('FIREBASE_ADMIN_* missing from .env.local');

  const { initializeApp, cert } = await import('firebase-admin/app');
  const { getAuth } = await import('firebase-admin/auth');
  const { getFirestore, Timestamp } = await import('firebase-admin/firestore');
  const app = initializeApp({ credential: cert({ projectId: FIREBASE_ADMIN_PROJECT_ID, clientEmail: FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n') }) });
  const db = getFirestore(app);
  const uid = (await getAuth(app).getUserByEmail(email)).uid;

  const dump: AnyRecord = { uid };
  for (const c of USER_COLLECTIONS) {
    const snap = await db.collection(c).where('userId', '==', uid).get();
    dump[c] = snap.docs.map((d) => ({ id: d.id, ...(serialise(d.data(), Timestamp) as AnyRecord) }));
    console.info(`read ${c}: ${snap.size}`);
  }
  for (const c of PER_USER_DOCS) {
    if (c === 'performance-cache' || c === 'exposure-cache' || c === 'dashboardOverviewSummaries') continue; // recomputed by the app
    const snap = await db.doc(`${c}/${uid}`).get();
    dump[`doc:${c}`] = snap.exists ? serialise(snap.data(), Timestamp) : null;
  }

  // The child: this same file, `--child-seed`, pointed at the emulators, the dump on its stdin.
  const child = spawn(process.execPath, [...process.execArgv, fileURLToPath(import.meta.url), '--child-seed'], {
    env: { ...process.env, ...EMULATOR_ENV },
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  child.stdin.end(JSON.stringify(dump));
  const code = await new Promise<number>((resolve) => child.on('exit', (c) => resolve(c ?? 1)));
  if (code !== 0) throw new Error(`the emulator seed exited with ${code}`);
}

// ── --child-seed: emulators only, the dump from stdin ──────────────────────────────────────────
async function childSeed() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('the child must run against the emulators');
  const { Timestamp } = await import('firebase-admin/firestore');
  const dump = rehydrate(JSON.parse(readFileSync(0, 'utf8')), (d) => Timestamp.fromDate(d)) as AnyRecord;
  const sourceUid = dump.uid as string;
  const { db, auth } = await emulatorAdmin();

  await removeRows(db);
  try {
    await auth.getUser(MIRROR_UID);
  } catch {
    await auth.createUser({ uid: MIRROR_UID, email: MIRROR_EMAIL, password: MIRROR_PASSWORD, displayName: 'Mirror' });
  }

  let batch = db.batch();
  let pending = 0;
  const flush = async () => { if (pending > 0) { await batch.commit(); batch = db.batch(); pending = 0; } };
  for (const c of USER_COLLECTIONS) {
    const rows = (dump[c] as AnyRecord[] | undefined) ?? [];
    for (const { id, ...data } of rows) {
      const newId = (id as string).replace(sourceUid, MIRROR_UID);
      batch.set(db.collection(c).doc(newId), { ...data, userId: MIRROR_UID });
      if (++pending >= 400) await flush();
    }
    await flush();
    console.info(`seeded ${c}: ${rows.length}`);
  }
  for (const c of PER_USER_DOCS) {
    const data = dump[`doc:${c}`] as AnyRecord | null | undefined;
    if (!data) continue;
    const payload: AnyRecord = { ...data, userId: MIRROR_UID };
    if (c === 'users') Object.assign(payload, { email: MIRROR_EMAIL, displayName: 'Mirror' });
    await db.collection(c).doc(MIRROR_UID).set(payload);
    console.info(`seeded ${c}/${MIRROR_UID}`);
  }
  console.info(`mirror ready — login ${MIRROR_EMAIL} / ${MIRROR_PASSWORD} on the emulator app`);
}

// ── remove: the account and every row it owns ──────────────────────────────────────────────────
async function remove() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('mirror:remove must run against the emulators (npm run mirror:remove).');
  const { db, auth } = await emulatorAdmin();
  await removeRows(db);
  try {
    await auth.deleteUser(MIRROR_UID);
    console.info(`deleted account ${MIRROR_EMAIL}`);
  } catch {
    console.info('no mirror account to delete');
  }
}

async function emulatorAdmin() {
  const { initializeApp, getApps } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const { getAuth } = await import('firebase-admin/auth');
  const app = getApps()[0] ?? initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-net-worth' });
  return { db: getFirestore(app), auth: getAuth(app) };
}

async function removeRows(db: FirebaseFirestore.Firestore) {
  for (const c of USER_COLLECTIONS) {
    const snap = await db.collection(c).where('userId', '==', MIRROR_UID).get();
    let batch = db.batch();
    let n = 0;
    for (const doc of snap.docs) {
      batch.delete(doc.ref);
      if (++n % 400 === 0) { await batch.commit(); batch = db.batch(); }
    }
    await batch.commit();
    if (snap.size > 0) console.info(`removed ${c}: ${snap.size}`);
  }
  for (const c of PER_USER_DOCS) await db.collection(c).doc(MIRROR_UID).delete();
}

try {
  if (command === 'seed') await seed(argument);
  else if (command === '--child-seed') await childSeed();
  else if (command === 'remove') await remove();
  else throw new Error('usage: mirrorProdAccount.mts seed <email> | remove');
  process.exit(0);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
