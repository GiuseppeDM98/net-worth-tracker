/**
 * Re-stamp the Esposizione's instrument profiles for the Playwright suite.
 *
 * Run via `npm run e2e:seed:profiles` (Admin SDK pointed at the emulators — NEVER production);
 * `e2e/global-setup.ts` runs it on every invocation. The documents are the ones the base seed
 * writes (`scripts/instrumentProfileFixtures.ts`), stamped NOW: with them fresh the route
 * `/api/portfolio/instrument-profiles` has no ticker to ask Yahoo for, so no spec depends on the
 * network. Idempotent: deterministic ids, overwritten each run.
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { INSTRUMENT_PROFILE_CACHE_COLLECTION, instrumentProfileFixtureDocuments } from './instrumentProfileFixtures';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('Refusing to seed: FIRESTORE_EMULATOR_HOST is not set. Run this via `npm run e2e:seed:profiles`.');
  process.exit(1);
}

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'demo-net-worth';
const app = getApps()[0] ?? initializeApp({ projectId: PROJECT_ID });
const db = getFirestore(app);

const documents = instrumentProfileFixtureDocuments(new Date());
await Promise.all(documents.map((fixture) => db.collection(INSTRUMENT_PROFILE_CACHE_COLLECTION).doc(encodeURIComponent(fixture.ticker)).set(fixture.data)));
console.info(`  ✓ ${documents.length} instrument profiles (${documents.map((fixture) => fixture.ticker).join(', ')}), fresh`);
