/**
 * Reset of the Consulente for ONE account: deletes `allocationAdvice/{uid}` — the last path — and
 * its archive `allocationAdvice/{uid}/history/*`, so the next path starts with no plan in force
 * and no previous paths (the owner, 2026-11-08: «quando andremo in prod a fine della serie
 * rifarò il giro da zero»).
 *
 *   npm run consulente:reset -- <email>            # PRODUCTION, dry run: says what exists, deletes nothing
 *   npm run consulente:reset -- <email> --yes      # PRODUCTION: backs up to ~/Documents/Backup/net-worth-consulente, then deletes
 *   npm run consulente:reset:emulator -- <email> [--yes]   # the same against the local emulators
 *
 * What it NEVER touches: what «Applica» wrote — `assetAllocationTargets/{uid}`, the assets'
 * `allocationRole`, the goals in `goalBasedInvesting/{uid}` — these are the account's settings
 * now, not the path; the shared `instrument-profile-cache`; any other account. The browser's
 * draft (`allocation-advice-draft:{uid}`, localStorage) is not on the server: clear it from the
 * page («Ricomincia il percorso») if one is open.
 *
 * Production needs the service account in `.env.local` (`FIREBASE_ADMIN_*`, as `mirror:seed`);
 * the emulator variant needs `FIRESTORE_EMULATOR_HOST` and `FIREBASE_AUTH_EMULATOR_HOST`, which the
 * npm script sets. The target (project, emulator or production) and the uid are printed before any
 * read; the backup is written BEFORE the delete and its path printed.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

type AnyRecord = Record<string, unknown>;

const args = process.argv.slice(2);
const email = args.find((a) => !a.startsWith('--'));
const confirmed = args.includes('--yes');
const backupDirArg = args.find((a) => a.startsWith('--backup='))?.slice('--backup='.length);

function serialise(value: unknown, isTimestamp: (v: unknown) => v is { toDate(): Date }): unknown {
  if (isTimestamp(value)) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map((v) => serialise(v, isTimestamp));
  if (value && typeof value === 'object') {
    const out: AnyRecord = {};
    for (const [k, v] of Object.entries(value as AnyRecord)) out[k] = serialise(v, isTimestamp);
    return out;
  }
  return value;
}

async function admin() {
  const { initializeApp, cert } = await import('firebase-admin/app');
  const { getAuth } = await import('firebase-admin/auth');
  const { getFirestore, Timestamp } = await import('firebase-admin/firestore');
  const isTimestamp = (v: unknown): v is { toDate(): Date } => v instanceof Timestamp;

  if (process.env.FIRESTORE_EMULATOR_HOST) {
    if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error('FIREBASE_AUTH_EMULATOR_HOST missing: the uid is resolved from the email through the Auth emulator.');
    const projectId = process.env.GCLOUD_PROJECT || 'demo-net-worth';
    const app = initializeApp({ projectId });
    console.info(`target: EMULATORS (${process.env.FIRESTORE_EMULATOR_HOST}, project ${projectId})`);
    return { db: getFirestore(app), auth: getAuth(app), isTimestamp, target: 'emulator' as const };
  }

  const nextEnvModule = (await import('@next/env')) as { default?: { loadEnvConfig(dir: string): unknown }; loadEnvConfig?(dir: string): unknown };
  (nextEnvModule.default ?? nextEnvModule).loadEnvConfig!(process.cwd());
  const { FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, FIREBASE_ADMIN_PRIVATE_KEY } = process.env;
  if (!FIREBASE_ADMIN_PROJECT_ID || !FIREBASE_ADMIN_CLIENT_EMAIL || !FIREBASE_ADMIN_PRIVATE_KEY) throw new Error('FIREBASE_ADMIN_* missing from .env.local');
  const app = initializeApp({ credential: cert({ projectId: FIREBASE_ADMIN_PROJECT_ID, clientEmail: FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n') }) });
  console.info(`target: PRODUCTION (project ${FIREBASE_ADMIN_PROJECT_ID})`);
  return { db: getFirestore(app), auth: getAuth(app), isTimestamp, target: 'production' as const };
}

const iso = (v: unknown): string => (typeof v === 'string' ? v.slice(0, 10) : '—');

async function main() {
  if (!email) throw new Error('usage: npm run consulente:reset -- <email> [--yes] [--backup=<dir>]');
  const { db, auth, isTimestamp, target } = await admin();
  const uid = (await auth.getUserByEmail(email)).uid;
  console.info(`account: ${email} → uid ${uid}`);

  const ref = db.collection('allocationAdvice').doc(uid);
  const [snap, history] = await Promise.all([ref.get(), ref.collection('history').orderBy('createdAt', 'desc').get()]);
  const document = snap.exists ? (serialise(snap.data(), isTimestamp) as AnyRecord) : null;
  const archived: AnyRecord[] = history.docs.map((d) => ({ id: d.id, ...(serialise(d.data(), isTimestamp) as AnyRecord) }));

  if (!document && archived.length === 0) {
    console.info('nothing to delete: no Consulente document and no archived path for this account.');
    return;
  }
  if (document) {
    const report = document.report as AnyRecord | null | undefined;
    const applied = document.applied as AnyRecord | null | undefined;
    const interview = document.interview as { rounds?: unknown[] } | null | undefined;
    console.info(
      `allocationAdvice/${uid}: status ${String(document.status)}, started ${iso(document.createdAt)}, report ${report ? iso(report.finishedAt) : 'none'}, ` +
        `interview ${interview?.rounds?.length ?? 0} round(s), ${Array.isArray(document.revisions) ? document.revisions.length : 0} revision(s), ` +
        (applied ? `APPLIED on ${iso(applied.at)} (targets ${applied.targetsWritten ? 'written' : 'not written'}, roles changed ${String(applied.rolesChanged)}, goals written ${String(applied.goalsWritten)})` : 'never applied')
    );
  } else {
    console.info(`allocationAdvice/${uid}: no document`);
  }
  console.info(`history: ${archived.length} archived path(s)${archived.length ? ` — ${archived.map((row) => iso(row.createdAt)).join(', ')}` : ''}`);
  console.info('untouched by design: assetAllocationTargets, the assets\' allocationRole, goalBasedInvesting (what «Applica» wrote is the account\'s settings now), instrument-profile-cache.');

  if (!confirmed) {
    console.info('dry run: nothing deleted. Re-run with --yes to back up and delete.');
    return;
  }

  const backupDir = backupDirArg ?? join(homedir(), 'Documents', 'Backup', 'net-worth-consulente');
  mkdirSync(backupDir, { recursive: true });
  const backupPath = join(backupDir, `consulente-${target}-${uid}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(backupPath, JSON.stringify({ target, email, uid, savedAt: new Date().toISOString(), document, history: archived }, null, 2));
  console.info(`backup written: ${backupPath}`);

  await db.recursiveDelete(ref);
  const [after, afterHistory] = await Promise.all([ref.get(), ref.collection('history').get()]);
  if (after.exists || afterHistory.size > 0) throw new Error(`delete incomplete: document ${after.exists ? 'still there' : 'gone'}, history ${afterHistory.size}`);
  console.info(`deleted allocationAdvice/${uid} and ${archived.length} archived path(s). The next path starts from zero.`);
}

try {
  await main();
  process.exit(0);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
